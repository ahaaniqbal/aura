// Frictionless capture, powered by the RocketRide Cloud extraction pipeline (HackwithBay 3.0).
// Raw text ("just met alex, runs a design studio, into film, follow up next week") ->
// RocketRide pipeline extracts {people, promises, topics} -> we MERGE into the Neo4j graph.
// No pipeline, no graph data: RocketRide is the load-bearing ingestion path.
// JWT-secured; forwards the caller's token to the graph so everything scopes to the user.
// Env: ROCKETRIDE_URL (deployed pipeline endpoint), ROCKETRIDE_KEY (optional bearer).

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}

function pluck(ext: any, key: string): any[] {
  const v = ext?.[key] ?? ext?.data?.[key] ?? ext?.output?.[key] ?? ext?.result?.[key];
  return Array.isArray(v) ? v : [];
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const userId = ctx.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    const authHeader = req.headers.get("Authorization") || "";
    const body = await req.json().catch(() => ({}));
    const text = (body.text || "").toString().trim();
    if (!text) return json({ error: "text required" }, 400);

    const RR = ctx.env.ROCKETRIDE_URL;
    if (!RR) return json({ error: "rocketride pipeline not configured" }, 503);

    // 1) call the RocketRide Cloud pipeline to extract structured entities
    const rrHeaders: any = { "Content-Type": "application/json" };
    if (ctx.env.ROCKETRIDE_KEY) rrHeaders["Authorization"] = `Bearer ${ctx.env.ROCKETRIDE_KEY}`;
    const rr = await fetch(RR, { method: "POST", headers: rrHeaders, body: JSON.stringify({ text }) });
    const ext = await rr.json().catch(() => ({}));
    if (!rr.ok) return json({ error: "rocketride error", detail: ext }, 502);

    const people = pluck(ext, "people");
    const promises = pluck(ext, "promises");

    // 2) MERGE into the Neo4j relationship graph (forward the user's JWT)
    const { BUTTERBASE_APP_ID: APP, BUTTERBASE_API_URL: API } = ctx.env;
    const g = await fetch(`${API}/v1/${APP}/fn/graph`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": authHeader },
      body: JSON.stringify({ op: "ingest", people, promises }),
    });
    const gres = await g.json().catch(() => ({}));

    // 3) keep a lightweight note in Postgres too (feed/memory surface)
    try { await ctx.db.query("INSERT INTO memories (user_id, text, source, kind) VALUES ($1,$2,'capture','note')", [userId, text]); } catch (e) {}

    return json({ ok: true, extracted: { people: people.length, promises: promises.length }, graph: gres });
  } catch (e: any) {
    console.error("capture error:", String(e));
    return json({ error: String(e) }, 500);
  }
}
