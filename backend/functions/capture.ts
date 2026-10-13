// Ambient capture, Aura's answer to Thine's moat. A moment from your life OR a quick captured
// thought becomes structured memory: people, promises, care, wants, dated reminders that
// resurface on their day, and the user's own pulse. JWT-secured; extracts with the AI gateway,
// MERGEs into Neo4j, and schedules reminders that the ambient loop fires.

const SYSTEM = `you are aura's memory, warm and perceptive. you are given a real moment from someone's life OR a quick thought they captured, and you extract what matters. you notice not just facts but feeling and intent: who they care about, what people want, what they need to be reminded of and when, and how they themselves are doing. all lowercase. never use em dashes or hyphens as punctuation; use commas or periods.`;

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
        body: JSON.stringify({ model: "anthropic/claude-haiku-4.5", messages, max_tokens: 950, temperature: 0.5 }),
      });
      const d = await r.json();
      const content = d?.choices?.[0]?.message?.content;
      if (content) return content;
      console.error("capture ai empty, status", r.status, JSON.stringify(d).slice(0, 300));
    } catch (e) { console.error("capture ai err", String(e)); }
  }
  return "";
}
const DOWN = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function dayLabel(when: string, todayISO: string): string {
  if (!when) return "";
  const d = new Date(when + "T12:00:00Z"), t = new Date(todayISO + "T12:00:00Z");
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff < 7) return DOWN[d.getUTCDay()];
  const M = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  return `${M[d.getUTCMonth()]} ${d.getUTCDate()}`;
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
    const quick = !!body.quick; // a quick captured thought vs a full moment/transcript
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

    const NOW = new Date();
    const todayStr = NOW.toISOString().slice(0, 10);
    const dowStr = DOWN[NOW.getUTCDay()];

    const prompt = `here is ${quick ? "a quick thought the user just captured" : "a moment from the user's life"}. extract what matters for their memory.
for reference, today is ${dowStr}, ${todayStr}. resolve any relative date (today, tomorrow, this saturday, next week, in 3 days) into an absolute YYYY-MM-DD using that; never guess a date you cannot ground.
"""
${text.slice(0, 4500)}
"""
return STRICT json only, all lowercase, no em dashes:
{
 "people":[{"name":str,"relation":"family"|"friend"|"client"|"collaborator"|"partner"|null,"note":str,"birthday":"MM-DD or null","wants":[str]}],
 "promises":[{"text":str,"person":str_or_null,"direction":"i_owe"|"owed_to_me"|null,"due":"YYYY-MM-DD, a weekday, or null"}],
 "reminders":[{"text":str,"when":"YYYY-MM-DD or null","place":"a named venue or null"}],
 "care":[{"person":str,"note":str}],
 "self":{"valence":int,"mood":str,"note":str},
 "notes":${quick ? "null" : '{"title":str,"summary":str,"decisions":[str],"action_items":[{"text":str,"owner":"me" or a name}]} or null'},
 "summary":str
}
notes:
- "reminders" are things to resurface to the user, a task, an errand, a note to self, an idea to revisit. "when" is the day it should come back (absolute YYYY-MM-DD), or null if it has no timing. "place" is a named venue to trigger it at ("trader joe's", "the office", "equinox") if the thought is "remind me when i'm at X", else null. a self-task ("remind me to...") is a reminder, not a promise.
- "promises" are commitments to OTHER people, not tasks for yourself.
- "wants" is gift and preference memory for a person. "care" is the emotional weight for other people (stress, grief, big changes), not neutral facts. "self" is the USER'S OWN state, only if evident (valence -2 rough..2 great, null if not).
- "summary" is one warm sentence to the user, what you caught and what you'll do with it, in aura's voice.
- if nothing relevant, use empty arrays and a short honest summary.${quick ? "" : `
- "notes" is for a meeting or a real conversation: a short title, two or three sentences on what was discussed, what was decided, and the action items with who owns each. null if it was just a passing moment.`}`;

    const out = await ai(API, APP, KEY, [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }]);
    const parsed = parseJSON(out) || { people: [], promises: [], reminders: [], care: [], summary: "i listened, but nothing in there needs tracking right now." };

    const care: any[] = Array.isArray(parsed.care) ? parsed.care : [];
    const people = (Array.isArray(parsed.people) ? parsed.people : []).map((p: any) => {
      const cn = care.filter((c) => c.person && p.name && String(c.person).toLowerCase() === String(p.name).toLowerCase()).map((c) => c.note);
      return { ...p, birthday: p.birthday === "null" ? null : p.birthday, note: [p.note, ...cn].filter(Boolean).join(". "), care: cn.length ? cn.join(". ") : (p.care || null) };
    });
    for (const c of care) {
      if (c.person && !people.some((p: any) => p.name && String(p.name).toLowerCase() === String(c.person).toLowerCase())) {
        people.push({ name: c.person, relation: null, note: c.note, birthday: null, care: c.note });
      }
    }
    const promises = Array.isArray(parsed.promises) ? parsed.promises : [];
    const g = await graphOp("ingest", { people, promises });

    // schedule dated reminders so they resurface on their day (auto_tick fires them, brief + notepad show them)
    const reminders: any[] = Array.isArray(parsed.reminders) ? parsed.reminders : [];
    const chips: { label: string; tone: string }[] = [];
    let scheduled = 0;
    for (const r of reminders) {
      const rtext = (r?.text || "").toString().trim();
      if (!rtext) continue;
      const when = /^\d{4}-\d{2}-\d{2}$/.test(r?.when || "") ? r.when : null;
      const place = (r?.place && String(r.place).toLowerCase() !== "null") ? String(r.place).trim().slice(0, 80) : "";
      if (when) {
        try {
          await ctx.db.query(
            "INSERT INTO actions (user_id, kind, title, payload, state) VALUES ($1,'reminder',$2,$3,'scheduled')",
            [userId, rtext.slice(0, 120), JSON.stringify({ text: rtext, due_at: `${when}T09:00:00Z`, day: when, trigger: "date", source: "capture" })]
          );
          scheduled++;
          chips.push({ label: dayLabel(when, todayStr), tone: "date" });
        } catch (e) { console.warn("reminder insert:", String(e)); }
      } else if (place) {
        try {
          await ctx.db.query(
            "INSERT INTO actions (user_id, kind, title, payload, state) VALUES ($1,'reminder',$2,$3,'scheduled')",
            [userId, rtext.slice(0, 120), JSON.stringify({ text: rtext, place, trigger: "place", source: "capture" })]
          );
          scheduled++;
          chips.push({ label: place.toLowerCase(), tone: "place" });
        } catch (e) { console.warn("place reminder insert:", String(e)); }
      } else {
        chips.push({ label: "remembered", tone: "idea" });
      }
    }
    for (const p of people) chips.push({ label: String(p.name).toLowerCase(), tone: (p.wants && p.wants.length) ? "gift" : "person" });
    for (const pr of promises) chips.push({ label: "promise", tone: "promise" });

    const self = parsed.self;
    if (self && self.valence !== null && self.valence !== undefined && Number.isFinite(Number(self.valence))) {
      try {
        const v = Math.max(-2, Math.min(2, Math.round(Number(self.valence))));
        await ctx.db.query("INSERT INTO pulse (user_id, valence, mood, note, source) VALUES ($1,$2,$3,$4,'capture')",
          [userId, v, (self.mood || "").toString().slice(0, 40) || null, (self.note || "").toString().slice(0, 400) || null]);
      } catch (e) { console.warn("pulse insert:", String(e)); }
    }

    const summary = (parsed.summary || "").toString().trim() || "got it, i've remembered that.";

    // meeting notes: kept as a memory, my action items become tasks, and the whole transcript goes
    // into the memory graph (memory.ts) so Aura can recall what was said later
    const n = !quick && parsed.notes && typeof parsed.notes === "object" ? parsed.notes : null;
    let notes: any = null;
    if (n && (n.summary || (n.action_items || []).length)) {
      notes = { type: "notes", title: String(n.title || "Meeting notes").slice(0, 80), summary: String(n.summary || "").slice(0, 800),
        decisions: (Array.isArray(n.decisions) ? n.decisions : []).map(String).slice(0, 8), action_items: (Array.isArray(n.action_items) ? n.action_items : []).slice(0, 10).map((a: any) => ({ text: String(a?.text || a || ""), owner: String(a?.owner || "me") })) };
      await ctx.db.query("INSERT INTO memories (user_id, text, kind, source) VALUES ($1,$2,'meeting','capture')", [userId, `${notes.title}: ${notes.summary}`]);
      for (const a of notes.action_items) if (a.text && /^(me|i|you)$/i.test(a.owner)) await ctx.db.query("INSERT INTO memories (user_id, text, kind, source) VALUES ($1,$2,'task','capture')", [userId, a.text]);
    }
    if (!quick) {
      const bg = fetch(`${API}/v1/${APP}/fn/memory`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: authHeader }, body: JSON.stringify({ op: "ingest", text: text.slice(0, 8000), source: "recording" }) }).catch(() => {});
      if (ctx.waitUntil) ctx.waitUntil(bg);
    }
    await ctx.db.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments jsonb").catch(() => {});
    const m = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind, attachments) VALUES ($1,'aura',$2,'capture',$3) RETURNING *", [userId, summary, notes ? JSON.stringify([notes]) : null]);

    return json({ ok: true, people: people.length, promises: promises.length, care: care.length, reminders: scheduled, chips, summary, notes, graph: g, message: m.rows[0] });
  } catch (e: any) {
    console.error("capture error:", String(e));
    return json({ error: String(e) }, 500);
  }
}
