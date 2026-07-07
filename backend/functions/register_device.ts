// Stores a device's Expo push token so the ambient loop can reach the user.
// JWT-secured; upserts on the (user_id, expo_push_token) unique index.

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const userId = ctx.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const token = (body.token || "").toString().trim();
    if (!token) return json({ error: "token required" }, 400);
    const platform = (body.platform || "ios").toString();
    await ctx.db.query(
      "INSERT INTO devices (user_id, expo_push_token, platform, last_seen) VALUES ($1,$2,$3,now()) ON CONFLICT (user_id, expo_push_token) DO UPDATE SET last_seen=now(), platform=EXCLUDED.platform",
      [userId, token, platform]
    );
    return json({ ok: true });
  } catch (e: any) {
    console.error("register_device error:", String(e));
    return json({ error: String(e) }, 500);
  }
}
