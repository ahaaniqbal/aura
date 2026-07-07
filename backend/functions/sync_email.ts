const AURA_SYSTEM = `you are aura, a personal assistant with warmth and taste. all lowercase. never use em dashes or hyphens as punctuation; use commas or periods.`;
function json(d: any, s = 200): Response { return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }); }
function parseJSON(s: string): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch (_) {}
  const a = s.indexOf("{"); const b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (_) {} }
  return null;
}
async function ai(apiUrl: string, appId: string, key: string, messages: any[]): Promise<string> {
  const r = await fetch(`${apiUrl}/v1/${appId}/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({ model: "anthropic/claude-haiku-4.5", messages, max_tokens: 400, temperature: 0.6 }),
  });
  const d = await r.json();
  return d?.choices?.[0]?.message?.content || "";
}
async function exec(apiUrl: string, appId: string, key: string, tool: string, params: any, userId: string): Promise<any> {
  const r = await fetch(`${apiUrl}/v1/${appId}/integrations/execute`, {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({ toolName: tool, params, userId }),
  });
  return r.json();
}
function nameOf(s: string): string { const m = (s || "").match(/^([^<]+)</); return (m ? m[1] : s || "").trim().replace(/"/g, ""); }
function emailOf(s: string): string { const m = (s || "").match(/<([^>]+)>/); return m ? m[1] : (s || ""); }
function automated(sender: string): boolean { return /no-?reply|do-?not-?reply|notifications?@|mailer-daemon|postmaster|automated|googleapis|accounts\.google/i.test(sender || ""); }

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const userId = ctx.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const silent = !!body.silent;
    const { BUTTERBASE_APP_ID, BUTTERBASE_API_URL, BUTTERBASE_API_KEY } = ctx.env;

    const fetched = await exec(BUTTERBASE_API_URL, BUTTERBASE_APP_ID, BUTTERBASE_API_KEY, "GMAIL_FETCH_EMAILS", { max_results: 8 }, userId);
    const msgs = fetched?.data?.messages || [];
    const prior = await ctx.db.query("SELECT payload->>'message_id' AS mid FROM actions WHERE user_id=$1 AND kind='email_send'", [userId]);
    const seen = new Set((prior.rows || []).map((r: any) => r.mid).filter(Boolean));
    // newest unhandled email from a real person
    const chosen = msgs.find((m: any) => m.messageId && !seen.has(m.messageId) && !automated(m.sender));

    if (!chosen) {
      if (silent) return json({ ok: true, surfaced: false, chosen: -1 });
      const m = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind) VALUES ($1,'aura',$2,'chat') RETURNING *", [userId, "went through your inbox, nothing new from a person needs a reply right now."]);
      return json({ ok: true, surfaced: false, chosen: -1, message: m.rows[0] });
    }

    const prompt = `a new email just arrived. from: ${chosen.sender}\nsubject: ${chosen.subject}\nbody: ${String(chosen.messageText || chosen.preview || "").replace(/\s+/g, " ").slice(0, 400)}\n\ndraft a short, warm reply in the user's own voice. decide if it is urgent.\nrespond ONLY strict JSON, all lowercase no em dashes: {"note": string (one line to the user), "draft": string (the reply body), "urgent": boolean}`;
    const out = await ai(BUTTERBASE_API_URL, BUTTERBASE_APP_ID, BUTTERBASE_API_KEY, [{ role: "system", content: AURA_SYSTEM }, { role: "user", content: prompt }]);
    const parsed = parseJSON(out) || { note: `${nameOf(chosen.sender)} emailed you, i drafted a reply.`, draft: "thanks for the note, will get back to you shortly.", urgent: false };
    const recipient = emailOf(chosen.sender);
    const subject = /^re:/i.test(chosen.subject || "") ? chosen.subject : `Re: ${chosen.subject || ""}`;
    const urgent = !!parsed.urgent;
    const payload = { to: recipient, subject, body: parsed.draft || "", thread_id: chosen.threadId, message_id: chosen.messageId, sender: chosen.sender };
    const ares = await ctx.db.query("INSERT INTO actions (user_id, kind, title, payload, state) VALUES ($1,'email_send',$2,$3,'proposed') RETURNING *", [userId, `reply to ${nameOf(chosen.sender)}`, JSON.stringify(payload)]);
    const action = ares.rows[0];
    const cres = await ctx.db.query("INSERT INTO cards (user_id, type, title, body, status, action_id, memory_refs) VALUES ($1,$2,$3,$4,'pending',$5,$6) RETURNING *", [userId, urgent ? "urgent" : "draft_held", `reply to ${nameOf(chosen.sender)}`, parsed.draft || "", action.id, JSON.stringify([`from your inbox: ${chosen.subject}`])]);
    const card = cres.rows[0];
    const note = parsed.note || `${nameOf(chosen.sender)} emailed you, i drafted a reply.`;
    const m = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind, card_id) VALUES ($1,'aura',$2,$3,$4) RETURNING *", [userId, note, urgent ? "urgent" : "held", card.id]);
    return json({ ok: true, surfaced: true, chosen: 0, card, action, message: m.rows[0] });
  } catch (e: any) {
    console.error("sync_email error:", String(e), e?.stack);
    return json({ error: String(e) }, 500);
  }
}
