const AURA_SYSTEM = `you are aura, a personal ambient assistant with genuine taste and warmth. you talk like a sharp, caring friend. keep it short. ALWAYS all lowercase. NEVER use em dashes or hyphens as punctuation; use commas or periods.`;
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
    body: JSON.stringify({ model: "anthropic/claude-haiku-4.5", messages, max_tokens: 500, temperature: 0.6 }),
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

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const body = await req.json().catch(() => ({}));
    const userId = body.user_id || "demo";
    const silent = !!body.silent;
    const { BUTTERBASE_APP_ID, BUTTERBASE_API_URL, BUTTERBASE_API_KEY } = ctx.env;

    const fetched = await exec(BUTTERBASE_API_URL, BUTTERBASE_APP_ID, BUTTERBASE_API_KEY, "GMAIL_FETCH_EMAILS", { max_results: 6 }, userId);
    const msgs = fetched?.data?.messages || [];
    // dedupe: skip emails we've already surfaced an action for
    const prior = await ctx.db.query("SELECT payload->>'message_id' AS mid FROM actions WHERE user_id=$1 AND kind='email_send'", [userId]);
    const seen = new Set((prior.rows || []).map((r: any) => r.mid).filter(Boolean));
    const fresh = msgs.filter((m: any) => m.messageId && !seen.has(m.messageId));

    if (!fresh.length) {
      if (silent) return json({ ok: true, count: msgs.length, chosen: -1, surfaced: false });
      const m = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind) VALUES ($1,'aura',$2,'chat') RETURNING *", [userId, "went through your inbox, nothing new needs a reply right now."]);
      return json({ ok: true, count: msgs.length, chosen: -1, message: m.rows[0] });
    }

    const compact = fresh.map((m: any, i: number) => ({ i, sender: m.sender, subject: m.subject, preview: String(m.messageText || m.preview || "").replace(/\s+/g, " ").slice(0, 220), threadId: m.threadId, messageId: m.messageId }));
    const listText = compact.map((e: any) => `[${e.i}] from: ${e.sender} | subject: ${e.subject} | ${e.preview}`).join("\n");
    const prompt = `here are new emails the user has not handled yet:\n${listText}\n\npick the ONE that most needs a personal reply from the user. skip automated mail, no-reply, security alerts, promotions, newsletters. if a real person is waiting, draft a short warm reply in the user's voice. if nothing needs a personal reply, set index to -1.\nrespond ONLY strict JSON, all lowercase no em dashes: {"index": number, "note": string, "draft": string, "urgent": boolean}`;
    const out = await ai(BUTTERBASE_API_URL, BUTTERBASE_APP_ID, BUTTERBASE_API_KEY, [{ role: "system", content: AURA_SYSTEM }, { role: "user", content: prompt }]);
    const parsed = parseJSON(out) || { index: -1 };

    if (parsed.index < 0 || !compact[parsed.index]) {
      // mark the freshest as seen so we don't reconsider them forever (store a noop action)
      if (silent) return json({ ok: true, count: msgs.length, chosen: -1, surfaced: false });
      const m = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind) VALUES ($1,'aura',$2,'chat') RETURNING *", [userId, parsed.note || `checked your inbox, nothing needs a reply right now.`]);
      return json({ ok: true, count: msgs.length, chosen: -1, message: m.rows[0] });
    }
    const chosen = compact[parsed.index];
    const recipient = emailOf(chosen.sender);
    const subject = /^re:/i.test(chosen.subject || "") ? chosen.subject : `Re: ${chosen.subject || ""}`;
    const urgent = !!parsed.urgent;
    const payload = { to: recipient, subject, body: parsed.draft || "", thread_id: chosen.threadId, message_id: chosen.messageId, sender: chosen.sender };
    const ares = await ctx.db.query("INSERT INTO actions (user_id, kind, title, payload, state) VALUES ($1,'email_send',$2,$3,'proposed') RETURNING *", [userId, `reply to ${nameOf(chosen.sender)}`, JSON.stringify(payload)]);
    const action = ares.rows[0];
    const cres = await ctx.db.query("INSERT INTO cards (user_id, type, title, body, status, action_id, memory_refs) VALUES ($1,$2,$3,$4,'pending',$5,$6) RETURNING *", [userId, urgent ? "urgent" : "draft_held", `reply to ${nameOf(chosen.sender)}`, parsed.draft || "", action.id, JSON.stringify([`from your inbox: ${chosen.subject}`])]);
    const card = cres.rows[0];
    const note = parsed.note || `the email from ${nameOf(chosen.sender)} looks like it needs you, so i drafted a reply.`;
    const m = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind, card_id) VALUES ($1,'aura',$2,$3,$4) RETURNING *", [userId, note, urgent ? "urgent" : "held", card.id]);
    return json({ ok: true, count: msgs.length, chosen: parsed.index, surfaced: true, card, action, message: m.rows[0] });
  } catch (e: any) {
    console.error("sync_email error:", String(e), e?.stack);
    return json({ error: String(e) }, 500);
  }
}