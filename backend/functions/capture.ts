// Ambient capture, Aura's answer to Thine's moat. A moment from your life (a recorded
// conversation, a call, a note) becomes structured relationship memory: people, promises,
// and the emotional weight of what was said, so Aura can help you show up with care.
// JWT-secured; extracts with the AI gateway and MERGEs into the Neo4j graph.

const SYSTEM = `you are aura's memory, warm and perceptive. you are given a real moment from someone's life, a conversation, a call, a dinner, and you extract what matters for their relationships. you notice not just facts but feeling: who is stressed, who is grieving, who is celebrating. all lowercase. never use em dashes or hyphens as punctuation; use commas or periods.`;

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
function parseJSON(str: string): any {
  if (!str) return null;
  try { return JSON.parse(str); } catch (_) {}
  const a = str.indexOf("{"); const b = str.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(str.slice(a, b + 1)); } catch (_) {} }
  return null;
}
async function ai(apiUrl: string, appId: string, key: string, messages: any[]): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${apiUrl}/v1/${appId}/chat/completions`, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ model: "anthropic/claude-haiku-4.5", messages, max_tokens: 900, temperature: 0.5 }),
      });
      const d = await r.json();
      const content = d?.choices?.[0]?.message?.content;
      if (content) return content;
      console.error("capture ai empty, status", r.status, JSON.stringify(d).slice(0, 300));
    } catch (e) { console.error("capture ai err", String(e)); }
  }
  return "";
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const userId = ctx.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    const authHeader = req.headers.get("Authorization") || "";
    const body = await req.json().catch(() => ({}));
    const text = (body.text || body.transcript || "").toString().trim();
    if (!text) return json({ error: "text required" }, 400);
    const { BUTTERBASE_APP_ID: APP, BUTTERBASE_API_URL: API, BUTTERBASE_API_KEY: KEY } = ctx.env;

    const graphOp = async (op: string, params: any) => {
      try {
        const r = await fetch(`${API}/v1/${APP}/fn/graph`, {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": authHeader },
          body: JSON.stringify({ op, ...params }),
        });
        return await r.json();
      } catch (e) { return { error: String(e) }; }
    };

    const prompt = `here is a moment from the user's life. extract what matters for their relationship memory.
"""
${text.slice(0, 4500)}
"""
return STRICT json only, all lowercase, no em dashes:
{
 "people":[{"name":str,"relation":"family"|"friend"|"client"|"collaborator"|"partner"|null,"note":str,"birthday":"MM-DD or null"}],
 "promises":[{"text":str,"person":str_or_null,"direction":"i_owe"|"owed_to_me"|null,"due":"YYYY-MM-DD, a weekday, or null"}],
 "care":[{"person":str,"note":str}],
 "summary":str
}
notes:
- "care" is the emotional weight: someone stressed, sick, grieving, moving, celebrating, anything the user should hold gently.
- "summary" is one warm paragraph to the user: what you caught, and what matters, in aura's voice.
- if nothing relevant, use empty arrays and a short honest summary.`;

    const out = await ai(API, APP, KEY, [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }]);
    const parsed = parseJSON(out) || { people: [], promises: [], care: [], summary: "i listened, but nothing in there needs tracking right now." };

    const care: any[] = Array.isArray(parsed.care) ? parsed.care : [];
    // fold each person's emotional context into their graph note, so future nudges lead with care
    const people = (Array.isArray(parsed.people) ? parsed.people : []).map((p: any) => {
      const cn = care.filter((c) => c.person && p.name && String(c.person).toLowerCase() === String(p.name).toLowerCase()).map((c) => c.note);
      return { ...p, birthday: p.birthday === "null" ? null : p.birthday, note: [p.note, ...cn].filter(Boolean).join(". ") };
    });
    // anyone mentioned only in care still becomes a remembered person
    for (const c of care) {
      if (c.person && !people.some((p: any) => p.name && String(p.name).toLowerCase() === String(c.person).toLowerCase())) {
        people.push({ name: c.person, relation: null, note: c.note, birthday: null });
      }
    }
    const promises = Array.isArray(parsed.promises) ? parsed.promises : [];

    const g = await graphOp("ingest", { people, promises });
    const summary = (parsed.summary || "").toString().trim() || "got it, i've updated your memory.";
    const m = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind) VALUES ($1,'aura',$2,'capture') RETURNING *", [userId, summary]);

    return json({ ok: true, people: people.length, promises: promises.length, care: care.length, summary, graph: g, message: m.rows[0] });
  } catch (e: any) {
    console.error("capture error:", String(e));
    return json({ error: String(e) }, 500);
  }
}
