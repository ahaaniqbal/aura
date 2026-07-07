// The ambient loop (task #14). Runs hourly. For every registered device it computes the user's
// LOCAL hour from their stored timezone and, only when it's their local morning, queries their
// Neo4j graph for birthdays (today/tomorrow in their zone) and promises due soon, then sends a
// warm Expo push. One hourly cron thus serves every timezone: each user's local-9am maps to
// exactly one run per day. Also exposed over HTTP for testing (force / dry / user_id / hour).
// Runs as butterbase_service; scopes each graph query by the user's id.

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
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
// current hour in a timezone (0-23), with a UTC fallback if Intl timeZone is unavailable
function localHour(tz: string): number {
  try { return parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date()), 10) % 24; }
  catch (e) { return new Date().getUTCHours(); }
}
// today's date (YYYY-MM-DD) in a timezone, UTC fallback
function tzTodayISO(tz: string): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
  catch (e) { return new Date().toISOString().slice(0, 10); }
}

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
    let force = false, dry = false, onlyUid: string | null = null, target = 9;
    try { const b = await req.json(); if (b) { force = !!b.force; dry = !!b.dry; onlyUid = b.user_id || null; if (Number.isFinite(Number(b.hour))) target = Number(b.hour); } } catch (e) {}

    const devs = await ctx.db.query(
      "SELECT d.user_id AS user_id, d.expo_push_token AS token, cs.timezone AS timezone FROM devices d LEFT JOIN context_state cs ON cs.user_id = d.user_id::text" +
      (onlyUid ? " WHERE d.user_id::text = $1" : ""),
      onlyUid ? [onlyUid] : []
    );
    const results: any[] = [];
    let sent = 0;
    for (const row of devs.rows) {
      const uid = row.user_id, token = row.token, tz = row.timezone || "UTC";
      const hour = localHour(tz);
      if (!force && hour !== target) { results.push({ uid, tz, localHour: hour, sent: false, reason: "not local morning" }); continue; }

      const todayISO = tzTodayISO(tz);
      const tomISO = new Date(new Date(todayISO + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
      const today = todayISO.slice(5), tomorrow = tomISO.slice(5); // MM-DD
      const mds = [today, tomorrow];

      let promises: any[] = [], bdays: any[] = [];
      try { promises = await cypher(ctx, Q_DUE, { uid, soon: tomISO }); } catch (e) { console.warn("due:", String(e)); }
      try { bdays = await cypher(ctx, Q_BDAY, { uid, mds }); } catch (e) { console.warn("bday:", String(e)); }
      const bits: string[] = [];
      for (const b of bdays) bits.push(`${b.name}'s birthday is ${b.birthday === today ? "today" : "tomorrow"}`);
      for (const pr of promises) bits.push(`${pr.text}${pr.person && !String(pr.text).toLowerCase().includes(String(pr.person).toLowerCase()) ? ` for ${pr.person}` : ""}`);
      if (!bits.length) { results.push({ uid, tz, localHour: hour, sent: false, reason: "nothing due" }); continue; }

      const body = bits.slice(0, 3).join(". ") + ".";
      if (dry) { results.push({ uid, tz, localHour: hour, sent: false, dry: true, body }); continue; }
      const pushRes = await sendPush(token, "aura", body);
      sent++;
      results.push({ uid, tz, localHour: hour, sent: true, body, push: pushRes?.data?.status || pushRes?.errors || "sent" });
    }
    return json({ ok: true, devices: devs.rows.length, sent, results });
  } catch (e: any) {
    console.error("nudge_cron error:", String(e));
    return json({ error: String(e) }, 500);
  }
}
