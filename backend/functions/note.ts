function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
async function hydraIngest(base: string, key: string, user: string, text: string): Promise<void> {
  try {
    await fetch(`${base}/memories/add_memory`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ tenant_id: "aura", sub_tenant_id: user, upsert: true, memories: [{ text, infer: true }] }) });
  } catch (e) { console.warn("hydra ingest:", String(e)); }
}
export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const userId = ctx.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const text = (body.text || "").toString().trim();
    if (!text) return json({ error: "text required" }, 400);
    const { HYDRA_DB_API_KEY } = ctx.env; const HYDRA_BASE = ctx.env.HYDRA_BASE || "https://api.hydradb.com";
    const m = await ctx.db.query("INSERT INTO memories (user_id, text, source, kind) VALUES ($1,$2,'note','note') RETURNING *", [userId, text]);
    if (HYDRA_DB_API_KEY) { const bg = hydraIngest(HYDRA_BASE, HYDRA_DB_API_KEY, userId, text); if (ctx.waitUntil) ctx.waitUntil(bg); else bg.catch(() => {}); }
    return json({ ok: true, note: m.rows[0] });
  } catch (e: any) {
    console.error("note error:", String(e));
    return json({ error: String(e) }, 500);
  }
}