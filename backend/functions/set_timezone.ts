// Records the user's device timezone so the ambient loop can reach them at their own local
// morning, not a fixed server hour. JWT-secured; upserts into context_state (user_id unique).

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const userId = ctx.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const tz = (body.timezone || body.tz || "").toString().slice(0, 64).trim();
    // lenient IANA check (avoids coupling to Intl support in the runtime)
    const ok = tz === "UTC" || /^[A-Za-z]+\/[A-Za-z0-9_+-]+$/.test(tz);
    if (!ok) return json({ error: "invalid timezone" }, 400);
    await ctx.db.query(
      "INSERT INTO context_state (user_id, timezone, updated_at) VALUES ($1,$2,now()) ON CONFLICT (user_id) DO UPDATE SET timezone=EXCLUDED.timezone, updated_at=now()",
      [userId, tz]
    );
    return json({ ok: true, timezone: tz });
  } catch (e: any) {
    console.error("set_timezone error:", String(e));
    return json({ error: String(e) }, 500);
  }
}
