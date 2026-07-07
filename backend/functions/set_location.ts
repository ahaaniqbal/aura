function json(d: any, s = 200): Response { return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }); }
export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const userId = ctx.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const loc = { lat: body.lat, lng: body.lng, name: body.place || "nearby" };
    await ctx.db.query("INSERT INTO context_state (user_id, location) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET location=EXCLUDED.location, updated_at=now()", [userId, JSON.stringify(loc)]);
    return json({ ok: true, location: loc });
  } catch (e: any) { return json({ error: String(e) }, 500); }
}