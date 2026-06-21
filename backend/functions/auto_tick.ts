function json(d: any, s = 200): Response { return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } }); }
const USER = "70268b41-7e66-4d80-a248-dcc0c004b197";
export default async function handler(req: Request, ctx: any): Promise<Response> {
  try {
    const cs = await ctx.db.query("SELECT in_meeting FROM context_state WHERE user_id=$1", [USER]);
    if (cs.rows[0]?.in_meeting) return json({ skipped: "in_meeting" });
    const pend = await ctx.db.query("SELECT 1 FROM cards WHERE user_id=$1 AND type IN ('draft_held','urgent') AND status='pending' LIMIT 1", [USER]);
    if (pend.rows.length) return json({ skipped: "pending_exists" });
    const { BUTTERBASE_APP_ID, BUTTERBASE_API_URL } = ctx.env;
    const r = await fetch(`${BUTTERBASE_API_URL}/v1/${BUTTERBASE_APP_ID}/fn/sync_email`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: USER, silent: true }),
    });
    const d = await r.json();
    return json({ triggered: true, surfaced: d?.surfaced });
  } catch (e: any) { console.error("auto_tick:", String(e)); return json({ error: String(e) }, 500); }
}