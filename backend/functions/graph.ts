function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}

async function cypher(ctx: any, statement: string, parameters: any): Promise<any[]> {
  const url = ctx.env.NEO4J_QUERY_URL;
  const user = ctx.env.NEO4J_USER || "neo4j";
  const pass = ctx.env.NEO4J_PASSWORD;
  if (!url || !pass) throw new Error("neo4j env not configured");
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${user}:${pass}`),
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ statement, parameters }),
  });
  const d = await r.json();
  if (!r.ok || (d?.errors && d.errors.length)) {
    throw new Error(d?.errors?.[0]?.message || `neo4j http ${r.status}`);
  }
  const fields: string[] = d?.data?.fields || [];
  const values: any[][] = d?.data?.values || [];
  return values.map((row) => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
}

const SCHEMA = [
  "CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE",
  "CREATE INDEX person_uid_name IF NOT EXISTS FOR (p:Person) ON (p.uid, p.name)",
  "CREATE INDEX topic_uid_name IF NOT EXISTS FOR (t:Topic) ON (t.uid, t.name)",
  "CREATE INDEX promise_uid IF NOT EXISTS FOR (pr:Promise) ON (pr.uid)",
];

const Q_PEOPLE = `
MERGE (u:User {id:$uid})
WITH u
UNWIND $people AS p
MERGE (person:Person {uid:$uid, name:p.name})
  ON CREATE SET person.created_at = timestamp()
SET person.note = coalesce(p.note, person.note),
    person.how_met = coalesce(p.how_met, person.how_met),
    person.org = coalesce(p.org, person.org),
    person.birthday = coalesce(p.birthday, person.birthday),
    person.relation = coalesce(p.relation, person.relation),
    person.care = coalesce(p.care, person.care),
    person.care_at = CASE WHEN p.care IS NOT NULL AND p.care <> '' THEN timestamp() ELSE person.care_at END,
    person.updated_at = timestamp()
MERGE (u)-[:KNOWS]->(person)
FOREACH (topic IN coalesce(p.topics, []) |
  MERGE (t:Topic {uid:$uid, name:topic})
  MERGE (person)-[:INTERESTED_IN]->(t)
)
RETURN count(DISTINCT person) AS people`;

const Q_PROMISES = `
MERGE (u:User {id:$uid})
WITH u
UNWIND $promises AS pr
MERGE (promise:Promise {uid:$uid, text:pr.text})
  ON CREATE SET promise.created_at = timestamp(), promise.status = coalesce(pr.status,'open')
SET promise.direction = coalesce(pr.direction, promise.direction),
    promise.due = coalesce(pr.due, promise.due),
    promise.status = coalesce(pr.status, promise.status)
MERGE (u)-[:MADE]->(promise)
FOREACH (_ IN CASE WHEN pr.person IS NULL THEN [] ELSE [1] END |
  MERGE (person:Person {uid:$uid, name:pr.person})
  MERGE (u)-[:KNOWS]->(person)
  MERGE (promise)-[:TO]->(person)
)
RETURN count(DISTINCT promise) AS promises`;

const Q_CLOSE = `
MATCH (u:User {id:$uid})-[:MADE]->(pr:Promise {text:$text})
SET pr.status = 'done', pr.closed_at = timestamp()
RETURN pr.text AS text, pr.status AS status`;

const Q_RECALL = `
MATCH (u:User {id:$uid})-[:KNOWS]->(p:Person)
WHERE toLower(p.name) CONTAINS toLower($q)
   OR toLower(coalesce(p.note,'')) CONTAINS toLower($q)
   OR toLower(coalesce(p.org,'')) CONTAINS toLower($q)
   OR toLower(coalesce(p.relation,'')) CONTAINS toLower($q)
   OR EXISTS { MATCH (p)-[:INTERESTED_IN]->(t:Topic) WHERE toLower(t.name) CONTAINS toLower($q) }
OPTIONAL MATCH (p)-[:INTERESTED_IN]->(t:Topic)
OPTIONAL MATCH (pr:Promise)-[:TO]->(p) WHERE pr.status = 'open'
RETURN p.name AS name, p.note AS note, p.org AS org, p.relation AS relation, p.birthday AS birthday, p.care AS care,
       collect(DISTINCT t.name) AS topics, collect(DISTINCT pr.text) AS open_promises
LIMIT 12`;

const Q_PROMISE_LIST = `
MATCH (u:User {id:$uid})-[:MADE]->(pr:Promise)
WHERE pr.status = 'open'
  AND ($person IS NULL OR EXISTS { MATCH (pr)-[:TO]->(x:Person) WHERE toLower(x.name) = toLower($person) })
OPTIONAL MATCH (pr)-[:TO]->(person:Person)
RETURN pr.text AS text, pr.direction AS direction, pr.due AS due, person.name AS person
ORDER BY coalesce(pr.due, '9999-99-99') ASC
LIMIT 25`;

const Q_WHO_KNOWS = `
MATCH (u:User {id:$uid})-[:KNOWS]->(p:Person)
WHERE EXISTS { MATCH (p)-[:INTERESTED_IN]->(t:Topic) WHERE toLower(t.name) CONTAINS toLower($topic) }
   OR toLower(coalesce(p.org,'')) CONTAINS toLower($topic)
   OR toLower(coalesce(p.note,'')) CONTAINS toLower($topic)
OPTIONAL MATCH (p)-[:INTERESTED_IN]->(t:Topic)
RETURN p.name AS name, p.note AS note, p.org AS org, collect(DISTINCT t.name) AS topics
LIMIT 12`;

const Q_SUBGRAPH = `
MATCH (u:User {id:$uid})-[:KNOWS]->(p:Person)
OPTIONAL MATCH (p)-[:INTERESTED_IN]->(t:Topic)
OPTIONAL MATCH (u)-[:MADE]->(pr:Promise)-[:TO]->(p) WHERE pr.status = 'open'
RETURN p.name AS person, p.org AS org, p.relation AS relation, p.birthday AS birthday, p.care AS care, p.care_at AS care_at,
       collect(DISTINCT t.name) AS topics, collect(DISTINCT pr.text) AS open_promises
LIMIT 200`;

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const userId = ctx.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const op = body.op;

    if (op === "init") {
      const done: string[] = [];
      for (const s of SCHEMA) { try { await cypher(ctx, s, {}); done.push(s.split(" ")[2]); } catch (e) { console.warn("schema:", String(e)); } }
      return json({ ok: true, schema: done });
    }
    if (op === "ingest") {
      const people = Array.isArray(body.people) ? body.people.filter((p: any) => p && p.name) : [];
      const promises = Array.isArray(body.promises) ? body.promises.filter((p: any) => p && p.text) : [];
      let np = 0, npr = 0;
      if (people.length) { const r = await cypher(ctx, Q_PEOPLE, { uid: userId, people }); np = r[0]?.people || 0; }
      if (promises.length) { const r = await cypher(ctx, Q_PROMISES, { uid: userId, promises }); npr = r[0]?.promises || 0; }
      return json({ ok: true, people: np, promises: npr });
    }
    if (op === "recall") return json({ ok: true, people: await cypher(ctx, Q_RECALL, { uid: userId, q: String(body.q || "") }) });
    if (op === "promises") return json({ ok: true, promises: await cypher(ctx, Q_PROMISE_LIST, { uid: userId, person: body.person || null }) });
    if (op === "who_knows") return json({ ok: true, people: await cypher(ctx, Q_WHO_KNOWS, { uid: userId, topic: String(body.topic || "") }) });
    if (op === "close_promise") return json({ ok: true, closed: await cypher(ctx, Q_CLOSE, { uid: userId, text: String(body.text || "") }) });
    if (op === "graph") return json({ ok: true, nodes: await cypher(ctx, Q_SUBGRAPH, { uid: userId }) });

    return json({ error: "unknown op" }, 400);
  } catch (e: any) {
    console.error("graph error:", String(e));
    return json({ error: String(e) }, 500);
  }
}
