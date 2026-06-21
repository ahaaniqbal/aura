function json(d: any, s = 200): Response { return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }); }
export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const body = await req.json().catch(() => ({}));
    const userId = body.user_id || "demo";
    const keepMemories = !!body.keep_memories;
    await ctx.db.query("DELETE FROM messages WHERE user_id=$1", [userId]);
    await ctx.db.query("DELETE FROM cards WHERE user_id=$1", [userId]);
    await ctx.db.query("DELETE FROM actions WHERE user_id=$1", [userId]);
    await ctx.db.query("DELETE FROM context_state WHERE user_id=$1", [userId]);
    if (!keepMemories) await ctx.db.query("DELETE FROM memories WHERE user_id=$1", [userId]);
    return json({ ok: true, reset: true, kept_memories: keepMemories });
  } catch (e: any) { return json({ error: String(e) }, 500); }
}