function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const userId = ctx.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    const { BUTTERBASE_APP_ID, BUTTERBASE_API_URL, BUTTERBASE_API_KEY } = ctx.env;
    const auth = req.headers.get("Authorization");
    const r = await fetch(`${BUTTERBASE_API_URL}/v1/${BUTTERBASE_APP_ID}/integrations/connections?user_id=${encodeURIComponent(userId)}`, {
      headers: { "Authorization": auth || `Bearer ${BUTTERBASE_API_KEY}` },
    });
    const d = await r.json();
    const list = (d?.connections || []).filter((c: any) => (c.status === "ACTIVE" || c.status === "active" || c.status === "connected")).map((c: any) => c.toolkit_slug);
    return json({ connected: list, raw: d?.connections || [] }, r.status);
  } catch (e: any) {
    console.error("connections error:", String(e));
    return json({ error: String(e) }, 500);
  }
}