function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id") || "demo";
    const msgs = await ctx.db.query("SELECT * FROM messages WHERE user_id=$1 ORDER BY created_at DESC LIMIT 60", [userId]);
    const cards = await ctx.db.query("SELECT * FROM cards WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30", [userId]);
    const mem = await ctx.db.query("SELECT id, text, kind, source, created_at FROM memories WHERE user_id=$1 ORDER BY created_at DESC LIMIT 60", [userId]);
    const ctxst = await ctx.db.query("SELECT * FROM context_state WHERE user_id=$1", [userId]);
    const conns = await ctx.db.query("SELECT toolkit, status FROM connections WHERE user_id=$1", [userId]);
    return json({ messages: msgs.rows.reverse(), cards: cards.rows, memories: mem.rows, context: ctxst.rows[0] || null, connections: conns.rows });
  } catch (e: any) {
    console.error("feed error:", String(e));
    return json({ error: String(e) }, 500);
  }
}