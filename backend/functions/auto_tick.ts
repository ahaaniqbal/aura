// Cron trigger "* * * * *" (every minute), service role. The per-user ambient tick: fires every
// user's due reminders. Kept lean and fast so it never times out; the relationship push loop
// (birthdays/promises) lives in nudge_cron, and inbox surfacing is user-initiated. Previously
// this was hardcoded to a single demo user.

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  try {
    let fired = 0;
    const due = await ctx.db.query("SELECT id, user_id, title, payload FROM actions WHERE kind='reminder' AND state='scheduled' AND (payload->>'due_at')::timestamptz <= now() LIMIT 200");
    for (const a of due.rows) {
      const uid = a.user_id;
      const txt = (a.payload && a.payload.text) || a.title || "your reminder";
      await ctx.db.query("INSERT INTO messages (user_id, role, content, kind) VALUES ($1,'aura',$2,'reminder')", [uid, `⏰ reminder: ${txt}`]);
      await ctx.db.query("UPDATE actions SET state='fired', updated_at=now() WHERE id=$1", [a.id]);
      fired++;
    }
    return json({ ok: true, fired });
  } catch (e: any) { console.error("auto_tick:", String(e)); return json({ error: String(e) }, 500); }
}
