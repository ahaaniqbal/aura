// Deployed with a cron trigger: "* * * * *" (every minute), service role.
function json(d: any, s = 200): Response { return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } }); }
const USER = "70268b41-7e66-4d80-a248-dcc0c004b197";

export default async function handler(req: Request, ctx: any): Promise<Response> {
  try {
    // 1) fire any reminders that are now due
    let fired = 0;
    const due = await ctx.db.query("SELECT * FROM actions WHERE user_id=$1 AND kind='reminder' AND state='scheduled' AND (payload->>'due_at')::timestamptz <= now()", [USER]);
    for (const a of due.rows) {
      const txt = (a.payload && a.payload.text) || a.title || "your reminder";
      await ctx.db.query("INSERT INTO messages (user_id, role, content, kind) VALUES ($1,'aura',$2,'reminder')", [USER, `⏰ reminder: ${txt}`]);
      await ctx.db.query("UPDATE actions SET state='fired', updated_at=now() WHERE id=$1", [a.id]);
      fired++;
    }

    // 2) surface at most ONE email card: only when free and nothing is already waiting
    let surfaced = false;
    const cs = await ctx.db.query("SELECT in_meeting FROM context_state WHERE user_id=$1", [USER]);
    if (!cs.rows[0]?.in_meeting) {
      const pend = await ctx.db.query("SELECT 1 FROM cards WHERE user_id=$1 AND type IN ('draft_held','urgent') AND status='pending' LIMIT 1", [USER]);
      if (!pend.rows.length) {
        const { BUTTERBASE_APP_ID, BUTTERBASE_API_URL } = ctx.env;
        const r = await fetch(`${BUTTERBASE_API_URL}/v1/${BUTTERBASE_APP_ID}/fn/sync_email`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: USER, silent: true }),
        });
        const d = await r.json();
        surfaced = !!d?.surfaced;
      }
    }
    return json({ fired, surfaced });
  } catch (e: any) { console.error("auto_tick:", String(e)); return json({ error: String(e) }, 500); }
}
