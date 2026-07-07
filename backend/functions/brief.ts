// Aura's daily brief, the Pro habit loop. Composes a warm morning digest from the whole
// relationship graph (care, birthdays + gift ideas, promises, and cadence-aware reconnects)
// plus the user's own emotional pulse. Deterministic, grounded, no AI key needed. JWT-secured;
// forwards the token to graph so it scopes to the signed-in user, and reads pulse for the user.

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
const DAY = 86400000;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function fmtDue(due: any): string {
  if (!due) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(due));
  if (m) return `${MONTHS[+m[2] - 1]} ${+m[3]}`;
  return String(due);
}
function daysUntilBirthday(b: any): number | null {
  if (!b) return null;
  const m = String(b).match(/(\d{1,2})[-/](\d{1,2})/);
  if (!m) return null;
  const now = new Date();
  const mm = +m[1] - 1, dd = +m[2];
  let next = new Date(now.getFullYear(), mm, dd);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (next < today) next = new Date(now.getFullYear() + 1, mm, dd);
  return Math.round((next.getTime() - today.getTime()) / DAY);
}
function touchesOf(p: any): number[] { return (p.touches || []).map(Number).filter((t: number) => t > 0).sort((a: number, b: number) => a - b); }
function medianGap(p: any): number | null {
  const t = touchesOf(p);
  if (t.length < 3) return null;
  const g: number[] = [];
  for (let i = 1; i < t.length; i++) g.push((t[i] - t[i - 1]) / DAY);
  g.sort((a, b) => a - b);
  return g[Math.floor(g.length / 2)] || null;
}
function daysSince(p: any): number | null {
  const t = touchesOf(p);
  const last = t.length ? t[t.length - 1] : Number(p.updated_at) || 0;
  return last ? (Date.now() - last) / DAY : null;
}
function closeness(p: any): number {
  const rel = (p.relation || "").toLowerCase();
  let s = /partner/.test(rel) ? 52 : /family/.test(rel) ? 44 : /friend/.test(rel) ? 34 : /collaborator/.test(rel) ? 22 : /client/.test(rel) ? 18 : 14;
  s += Math.min(12, (p.topics?.length || 0) * 3);
  s += p.wants?.length ? 6 : 0;
  s += p.birthday ? 5 : 0;
  s += p.care ? 8 : 0;
  s += Math.min(10, (p.open_promises?.length || 0) * 5);
  return s;
}
function isDrifting(p: any): boolean {
  const mg = medianGap(p); const ds = daysSince(p);
  if (mg && ds !== null) return closeness(p) >= 30 && ds >= Math.max(12, mg * 1.8);
  return closeness(p) >= 34 && ds !== null && ds >= 30;
}
function cadenceWord(d: number): string {
  if (d <= 2) return "most days";
  if (d <= 5) return "a few times a week";
  if (d <= 10) return "about weekly";
  if (d <= 20) return "every couple weeks";
  if (d <= 45) return "about monthly";
  return "now and then";
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const userId = ctx.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    const authHeader = req.headers.get("Authorization") || "";
    const { BUTTERBASE_APP_ID: APP, BUTTERBASE_API_URL: API } = ctx.env;

    const call = async (fn: string, bodyObj: any) => {
      try {
        const r = await fetch(`${API}/v1/${APP}/fn/${fn}`, {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": authHeader },
          body: JSON.stringify(bodyObj),
        });
        return await r.json();
      } catch (e) { return {}; }
    };

    const [pr, gr, pu] = await Promise.all([call("graph", { op: "promises" }), call("graph", { op: "graph" }), call("pulse", { op: "recent" })]);
    const promises = pr?.promises || [];
    const people = gr?.nodes || [];
    const reflection = (pu?.reflection || "").toString().trim();

    const bdays = people.map((p: any) => ({ p, d: daysUntilBirthday(p.birthday) })).filter((x: any) => x.d !== null && x.d <= 14).sort((a: any, b: any) => a.d - b.d).slice(0, 2);
    const bdayNames = new Set(bdays.map((x: any) => String(x.p.person).toLowerCase()));
    // people with a birthday coming up show under birthdays (more actionable), not twice
    const careP = people.filter((p: any) => p.care && p.care_at && (Date.now() - Number(p.care_at) < 30 * DAY) && !bdayNames.has(String(p.person).toLowerCase())).slice(0, 2);
    const surfaced = new Set([...careP.map((p: any) => p.person), ...bdays.map((x: any) => x.p.person)].map((s: string) => String(s).toLowerCase()));
    const duePromises = promises.slice(0, 3);
    const drifting = people.filter((p: any) => !surfaced.has(String(p.person).toLowerCase()) && isDrifting(p))
      .sort((a: any, b: any) => (daysSince(b) || 0) - (daysSince(a) || 0)).slice(0, 1);

    const items = careP.length + bdays.length + duePromises.length + drifting.length;
    const lines: string[] = [];
    lines.push(items ? "morning. here's who and what needs you today." : "morning.");

    for (const p of careP) lines.push(`${p.person} has been carrying something${p.care ? ` (${p.care})` : ""}. a good day to check in.`);
    for (const { p, d } of bdays) {
      const w = (p.wants || []).filter(Boolean);
      const when = d === 0 ? "is today" : d === 1 ? "is tomorrow" : `is in ${d} days`;
      lines.push(`${p.person}'s birthday ${when}.${w.length ? ` they've mentioned wanting ${w.slice(0, 2).join(", ")}.` : ""}`);
    }
    for (const p of duePromises) {
      const who = p.person || "someone";
      const due = p.due ? `, due ${fmtDue(p.due)}` : "";
      const forWho = String(p.text).toLowerCase().includes(String(who).toLowerCase()) ? "" : ` for ${who}`;
      lines.push(p.direction === "owed_to_me" ? `${who} owes you: ${p.text}${due}.` : `${p.text}${forWho}${due}.`);
    }
    for (const p of drifting) {
      const mg = medianGap(p); const ds = daysSince(p);
      const wk = Math.max(1, Math.round((ds || 0) / 7));
      lines.push(mg ? `you usually talk to ${p.person} ${cadenceWord(mg)}, and it's been about ${wk} ${wk === 1 ? "week" : "weeks"}.` : `it's been a while since you and ${p.person} caught up.`);
    }
    if (reflection) lines.push(reflection);

    if (items === 0 && !reflection) {
      lines.push(people.length ? `nothing pressing. a good day to reach out to someone you've gone quiet on.` : `nothing on your plate yet. tell me about someone you met and i'll start keeping the people and promises that matter.`);
    } else if (items > 0) {
      lines.push("want me to help with any of these?");
    }

    const brief = lines.join("\n");
    const m = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind) VALUES ($1,'aura',$2,'brief') RETURNING *", [userId, brief]);
    return json({ ok: true, brief, care: careP.length, birthdays: bdays.length, open_promises: promises.length, reconnect: drifting.length, people: people.length, message: m.rows[0] });
  } catch (e: any) {
    console.error("brief error:", String(e));
    return json({ error: String(e) }, 500);
  }
}
