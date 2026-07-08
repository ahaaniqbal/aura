// The notepad's read + control layer. Captures come in through `capture` (which parses and
// schedules); this returns them for the two sections: "coming back to you" (scheduled reminders,
// grouped by when) and "remembered" (recent dateless captures). Also lets the user finish or
// snooze a reminder. DB-only, no AI. JWT-secured; filters by ctx.user.id.

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
const DOWN = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const M = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function meta(dueAt: string): { label: string; bucket: string } {
  const d = new Date(dueAt);
  if (isNaN(d.getTime())) return { label: "someday", bucket: "later" };
  const now = new Date();
  const t0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const d0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diff = Math.round((d0 - t0) / 86400000);
  const label = diff <= 0 ? "today" : diff === 1 ? "tomorrow" : diff < 7 ? DOWN[d.getUTCDay()] : `${M[d.getUTCMonth()]} ${d.getUTCDate()}`;
  const bucket = diff <= 0 ? "today" : diff === 1 ? "tomorrow" : diff < 7 ? "week" : "later";
  return { label, bucket };
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const userId = ctx.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const op = body.op || "list";

    if (op === "done" || op === "snooze") {
      const id = (body.id || "").toString();
      if (!id) return json({ error: "id required" }, 400);
      if (op === "done") {
        await ctx.db.query("UPDATE actions SET state='done', updated_at=now() WHERE id=$1 AND user_id=$2 AND kind='reminder'", [id, userId]);
      } else {
        const when = (body.when || "").toString();
        const due = /^\d{4}-\d{2}-\d{2}$/.test(when) ? `${when}T09:00:00Z` : null;
        if (!due) return json({ error: "when (YYYY-MM-DD) required" }, 400);
        await ctx.db.query("UPDATE actions SET payload = jsonb_set(coalesce(payload,'{}'::jsonb), '{due_at}', to_jsonb($3::text)), state='scheduled', updated_at=now() WHERE id=$1 AND user_id=$2 AND kind='reminder'", [id, userId, due]);
      }
      return json({ ok: true });
    }

    // op list: date reminders (coming back) + place reminders (when you're there) + recent captures
    const sc = await ctx.db.query(
      "SELECT id, title, payload FROM actions WHERE user_id=$1 AND kind='reminder' AND state='scheduled' AND (payload->>'trigger' IS DISTINCT FROM 'place') ORDER BY (payload->>'due_at')::timestamptz ASC NULLS LAST LIMIT 50",
      [userId]
    );
    const scheduled = (sc.rows || []).map((r: any) => {
      const dueAt = r.payload?.due_at || "";
      const m = meta(dueAt);
      return { id: r.id, text: r.payload?.text || r.title || "", due_at: dueAt, day: r.payload?.day || null, label: m.label, bucket: m.bucket };
    });
    const pl = await ctx.db.query(
      "SELECT id, title, payload FROM actions WHERE user_id=$1 AND kind='reminder' AND state='scheduled' AND payload->>'trigger'='place' ORDER BY created_at DESC LIMIT 30",
      [userId]
    );
    const places = (pl.rows || []).map((r: any) => ({ id: r.id, text: r.payload?.text || r.title || "", place: r.payload?.place || "" }));
    const rm = await ctx.db.query(
      "SELECT id, content, created_at FROM messages WHERE user_id=$1 AND role='aura' AND kind='capture' ORDER BY created_at DESC LIMIT 20",
      [userId]
    );
    const remembered = (rm.rows || []).map((r: any) => ({ id: r.id, text: r.content, created_at: r.created_at }));

    return json({ ok: true, scheduled, places, remembered });
  } catch (e: any) {
    console.error("remember error:", String(e));
    return json({ error: String(e) }, 500);
  }
}
