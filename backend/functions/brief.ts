// Aura's daily brief (the Pro habit loop). Traverses the Neo4j relationship graph
// for open promises and the people in the user's circle, then composes a short warm
// morning digest of who and what needs them today. Composed deterministically from
// the graph so it is fast and always grounded in real data. JWT-secured; forwards the
// token to the graph function so it scopes to the signed-in user.

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function fmtDue(due: any): string {
  if (!due) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(due));
  if (m) return `${MONTHS[+m[2] - 1]} ${+m[3]}`;
  return String(due);
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const userId = ctx.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    const authHeader = req.headers.get("Authorization") || "";
    const { BUTTERBASE_APP_ID: APP, BUTTERBASE_API_URL: API } = ctx.env;

    const graphOp = async (op: string) => {
      try {
        const r = await fetch(`${API}/v1/${APP}/fn/graph`, {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": authHeader },
          body: JSON.stringify({ op }),
        });
        return await r.json();
      } catch (e) { return {}; }
    };

    const [pr, gr] = await Promise.all([graphOp("promises"), graphOp("graph")]);
    const promises = pr?.promises || [];
    const people = gr?.nodes || [];

    const lines: string[] = [];
    if (promises.length) {
      lines.push("morning. here's what needs you today.");
      for (const p of promises.slice(0, 5)) {
        const who = p.person || "someone";
        const dueStr = p.due ? `, due ${fmtDue(p.due)}` : "";
        if (p.direction === "owed_to_me") lines.push(`${who} owes you: ${p.text}${dueStr}.`);
        else lines.push(`${p.text} for ${who}${dueStr}.`);
      }
      if (promises.length > 5) lines.push(`and ${promises.length - 5} more still open.`);
      lines.push("want me to help knock one out?");
    } else if (people.length) {
      lines.push("morning. nothing pressing today.");
      lines.push(`you're keeping track of ${people.length} ${people.length === 1 ? "person" : "people"}. a good day to reach out to someone you've gone quiet on.`);
    } else {
      lines.push("morning. nothing on your plate yet.");
      lines.push("tell me about someone you met and i'll start keeping track of the people and promises that matter.");
    }
    const brief = lines.join("\n");

    const m = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind) VALUES ($1,'aura',$2,'brief') RETURNING *", [userId, brief]);
    return json({ ok: true, brief, open_promises: promises.length, people: people.length, message: m.rows[0] });
  } catch (e: any) {
    console.error("brief error:", String(e));
    return json({ error: String(e) }, 500);
  }
}
