function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const body = await req.json().catch(() => ({}));
    const userId = body.user_id || "demo";
    const toolkit = body.toolkit;
    if (!toolkit) return json({ error: "toolkit required" }, 400);
    const { BUTTERBASE_APP_ID, BUTTERBASE_API_URL, BUTTERBASE_API_KEY } = ctx.env;
    const r = await fetch(`${BUTTERBASE_API_URL}/v1/${BUTTERBASE_APP_ID}/integrations/connect`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${BUTTERBASE_API_KEY}` },
      body: JSON.stringify({ toolkit, redirectUrl: body.redirectUrl || "https://aura.butterbase.dev", user_id: userId }),
    });
    const d = await r.json();
    return json(d, r.status);
  } catch (e: any) {
    console.error("connect error:", String(e));
    return json({ error: String(e) }, 500);
  }
}