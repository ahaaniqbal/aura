// The ambient loop (task #14). Runs daily as a cron: for every registered device, it
// queries that user's Neo4j graph for promises due soon and birthdays today/tomorrow,
// then sends a warm push via the Expo push service. Also exposed over HTTP for testing.
// Runs as butterbase_service (sees all devices); scopes each graph query by the user's id.
// Env: NEO4J_QUERY_URL, NEO4J_USER, NEO4J_PASSWORD (secrets live in the function env, not here).

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });
}
async function cypher(ctx: any, statement: string, parameters: any): Promise<any[]> {
  const url = ctx.env.NEO4J_QUERY_URL, user = ctx.env.NEO4J_USER || "neo4j", pass = ctx.env.NEO4J_PASSWORD;
  if (!url || !pass) throw new Error("neo4j env not configured");
  const r = await fetch(url, { method: "POST", headers: { "Authorization": "Basic " + btoa(`${user}:${pass}`), "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ statement, parameters }) });
  const d = await r.json();
  if (!r.ok || (d?.errors && d.errors.length)) throw new Error(d?.errors?.[0]?.message || `neo4j ${r.status}`);
  const fields: string[] = d?.data?.fields || [], values: any[][] = d?.data?.values || [];
  return values.map((row) => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
}
async function sendPush(token: string, title: string, body: string): Promise<any> {
  const r = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ to: token, title, body, sound: "default" }) });
  return r.json().catch(() => ({}));
}
function md(offset: number): string { const d = new Date(); d.setDate(d.getDate() + offset); return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function iso(offset: number): string { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); }

const Q_DUE = `
MATCH (u:User {id:$uid})-[:MADE]->(pr:Promise)
WHERE pr.status='open' AND pr.due IS NOT NULL AND pr.due STARTS WITH '20' AND pr.due <= $soon
OPTIONAL MATCH (pr)-[:TO]->(p:Person)
RETURN pr.text AS text, pr.due AS due, p.name AS person LIMIT 5`;
const Q_BDAY = `
MATCH (u:User {id:$uid})-[:KNOWS]->(p:Person)
WHERE p.birthday IN $mds
RETURN p.name AS name, p.birthday AS birthday LIMIT 5`;

export default async function handler(req: Request, ctx: any): Promise<Response> {
  try {
    const soon = iso(1);
    const today = md(0), mds = [today, md(1)];
    const devs = await ctx.db.query("SELECT DISTINCT user_id, expo_push_token FROM devices");
    const results: any[] = [];
    let sent = 0;
    for (const row of devs.rows) {
      const uid = row.user_id, token = row.expo_push_token;
      let promises: any[] = [], bdays: any[] = [];
      try { promises = await cypher(ctx, Q_DUE, { uid, soon }); } catch (e) { console.warn("due:", String(e)); }
      try { bdays = await cypher(ctx, Q_BDAY, { uid, mds }); } catch (e) { console.warn("bday:", String(e)); }
      const bits: string[] = [];
      for (const b of bdays) bits.push(`${b.name}'s birthday is ${b.birthday === today ? "today" : "tomorrow"}`);
      for (const pr of promises) bits.push(`${pr.text}${pr.person ? ` for ${pr.person}` : ""}`);
      if (!bits.length) { results.push({ uid, sent: false }); continue; }
      const body = bits.slice(0, 3).join(". ") + ".";
      const pushRes = await sendPush(token, "aura", body);
      sent++;
      results.push({ uid, sent: true, body, push: pushRes?.data?.status || pushRes?.errors || "sent" });
    }
    return json({ ok: true, devices: devs.rows.length, sent, results });
  } catch (e: any) {
    console.error("nudge_cron error:", String(e));
    return json({ error: String(e) }, 500);
  }
}
