const AURA_SYSTEM = `you are aura, a personal ambient assistant with genuine taste and warmth.
you talk like a sharp, caring friend, not a corporate bot. keep messages short. emoji sparingly.
ALWAYS write in all lowercase. NEVER use em dashes or hyphens as punctuation; use commas, periods, or the word "and".
the user has connected tools (gmail and more). when live context like recent emails is provided below, answer from it directly and confidently. never say you lack access when context is given.
when you recall something, weave it in so they feel known.
when the user is simply sharing something (a fact, a date, a person, a preference, a plan), just store it as memory and reply warmly with no proposal.
set a proposal ONLY when one of these is true:
1. the user explicitly asks you to do something now (order, buy, email, book, remind).
2. the user is near a cake shop or bakery, or asks whether there is a cake shop or bakery nearby, AND you recall an upcoming birthday for someone who likes cake. in that case proactively propose ordering that cake.
for a buy proposal use kind "buy" with payload {merchant, item, total, eta} and a warm body naming who it is for.
for a reminder use kind "reminder", body = exactly what to remind them about, payload.minutes = the delay in minutes (in 5 minutes = 5, in an hour = 60). acknowledge it warmly.`;

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
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
    body: JSON.stringify({ model: "anthropic/claude-haiku-4.5", messages, max_tokens: 450, temperature: 0.6 }),
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
async function hydraQuery(base: string, key: string, tenant: string, user: string, q: string): Promise<string[]> {
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(`${base}/query`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ tenant_id: tenant, sub_tenant_id: user, query: q, type: "memory", query_by: "hybrid" }), signal: ctrl.signal });
    const d = await r.json();
    return (d?.data?.chunks || []).map((c: any) => c?.chunk_content || c?.text || c?.content || "").filter(Boolean).slice(0, 6);
  } finally { clearTimeout(tm); }
}
async function hydraIngest(base: string, key: string, tenant: string, user: string, text: string): Promise<void> {
  await fetch(`${base}/memories/add_memory`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({ tenant_id: tenant, sub_tenant_id: user, upsert: true, memories: [{ text, infer: true }] }) });
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const body = await req.json().catch(() => ({}));
    const userId = body.user_id || "demo";
    const text = (body.text || "").toString().trim();
    const source = body.source || "chat";
    if (!text) return json({ error: "text required" }, 400);
    const { BUTTERBASE_APP_ID, BUTTERBASE_API_URL, BUTTERBASE_API_KEY, HYDRA_DB_API_KEY } = ctx.env;
    const HYDRA_BASE = ctx.env.HYDRA_BASE || "https://api.hydradb.com";
    const TENANT = "aura";
    const lower = text.toLowerCase();
    const cakeIntent = /\b(cake|bakery|dessert|sweets?|cake shop)\b/.test(lower);

    if (source !== "email_incoming") {
      await ctx.db.query("INSERT INTO messages (user_id, role, content, kind) VALUES ($1,$2,$3,$4)", [userId, "user", text, source]);
    }

    let recalled: string[] = [];
    if (HYDRA_DB_API_KEY) { try { recalled = await hydraQuery(HYDRA_BASE, HYDRA_DB_API_KEY, TENANT, userId, text); } catch (e) {} }
    if (recalled.length === 0) {
      const kw = await ctx.db.query("SELECT text FROM memories WHERE user_id=$1 ORDER BY created_at DESC LIMIT 8", [userId]);
      recalled = kw.rows.map((x: any) => x.text);
    }
    if (cakeIntent) {
      if (HYDRA_DB_API_KEY) { try { const ex = await hydraQuery(HYDRA_BASE, HYDRA_DB_API_KEY, TENANT, userId, "upcoming birthdays, gifts, or anyone who likes cake or sweets"); recalled = Array.from(new Set([...ex, ...recalled])); } catch (e) {} }
      const kw2 = await ctx.db.query("SELECT text FROM memories WHERE user_id=$1 AND (text ILIKE '%birthday%' OR text ILIKE '%cake%' OR text ILIKE '%party%' OR text ILIKE '%gift%') ORDER BY created_at DESC LIMIT 6", [userId]);
      recalled = Array.from(new Set([...recalled, ...kw2.rows.map((x: any) => x.text)]));
    }

    let toolContext = "";
    if (/\b(email|emails|inbox|mail|gmail|unread|who.*(email|wrote|sent)|message from|recent email)\b/.test(lower)) {
      try {
        const fe = await exec(BUTTERBASE_API_URL, BUTTERBASE_APP_ID, BUTTERBASE_API_KEY, "GMAIL_FETCH_EMAILS", { max_results: 5 }, userId);
        const ms = fe?.data?.messages || [];
        if (ms.length) toolContext = "live, the user's most recent emails (newest first):\n" + ms.map((m: any, i: number) => `${i + 1}. from ${m.sender} | subject: ${m.subject} | ${String(m.messageText || m.preview || "").replace(/\s+/g, " ").slice(0, 140)}`).join("\n");
        else toolContext = "gmail is connected but returned no emails.";
      } catch (e) { toolContext = "gmail is connected (couldn't reach it this second)."; }
    }

    const ctxBlock = recalled.length ? `what you remember about them:\n- ${recalled.join("\n- ")}` : "you have no stored memories about them yet.";
    const liveBlock = toolContext ? `\n\n${toolContext}` : "";
    const userMsg = `${ctxBlock}${liveBlock}\n\nnew message (${source}): ${text}\n\nrespond ONLY strict JSON, all string values lowercase no em dashes:\n{"reply": string, "memory_to_store": string[], "proposal": null | {"kind": "buy"|"email_send"|"booking"|"reminder", "title": string, "body": string, "payload": object, "urgent": boolean}}`;
    const out = await ai(BUTTERBASE_API_URL, BUTTERBASE_APP_ID, BUTTERBASE_API_KEY, [{ role: "system", content: AURA_SYSTEM }, { role: "user", content: userMsg }]);
    const parsed = parseJSON(out) || { reply: (out || "mm, noted.").toLowerCase(), memory_to_store: [], proposal: null };

    // robust fallback: near/asking about a cake shop with a birthday on file -> always offer the cake
    if (cakeIntent && recalled.some((t: string) => /cake|birthday|party/i.test(t)) && !(parsed.proposal && parsed.proposal.kind === "buy")) {
      parsed.proposal = { kind: "buy", title: "order a chocolate cake", body: "there's a cake shop right by you, and a birthday coming up. want me to grab a chocolate cake?", payload: { merchant: "the bakery nearby", item: "chocolate cake", total: "$54.00", eta: "today" }, urgent: false };
      if (!parsed.reply) parsed.reply = "yep, there's a cake shop right near you. want me to handle the cake?";
    }

    const toStore: string[] = Array.isArray(parsed.memory_to_store) ? parsed.memory_to_store.filter((m: string) => m && m.trim()) : [];
    for (const m of toStore) await ctx.db.query("INSERT INTO memories (user_id, text, source) VALUES ($1,$2,$3)", [userId, m, source]);
    if (HYDRA_DB_API_KEY && toStore.length) {
      const bg = (async () => { for (const m of toStore) { try { await hydraIngest(HYDRA_BASE, HYDRA_DB_API_KEY, TENANT, userId, m); } catch (e) {} } })();
      if (ctx.waitUntil) ctx.waitUntil(bg); else bg.catch(() => {});
    }

    let card: any = null, action: any = null;
    const prop = parsed.proposal;
    if (prop && prop.kind === "reminder") {
      const mins = Math.max(1, Math.round(Number(prop?.payload?.minutes) || Number(prop?.minutes) || 5));
      const due = new Date(Date.now() + mins * 60000).toISOString();
      const remText = (prop.body || prop.title || "your reminder").toString();
      await ctx.db.query("INSERT INTO actions (user_id, kind, title, payload, state) VALUES ($1,'reminder',$2,$3,'scheduled')", [userId, remText, JSON.stringify({ text: remText, due_at: due, minutes: mins })]);
    } else if (prop && prop.kind) {
      const a2 = await ctx.db.query("INSERT INTO actions (user_id, kind, title, payload, state) VALUES ($1,$2,$3,$4,'proposed') RETURNING *", [userId, prop.kind, prop.title || "", JSON.stringify(prop.payload || {})]);
      action = a2.rows[0];
      const c2 = await ctx.db.query("INSERT INTO cards (user_id, type, title, body, status, action_id, memory_refs) VALUES ($1,$2,$3,$4,'pending',$5,$6) RETURNING *", [userId, prop.urgent ? "urgent" : "proactive", prop.title || "", prop.body || "", action.id, JSON.stringify(recalled.slice(0, 2))]);
      card = c2.rows[0];
    }
    const mres = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind, card_id) VALUES ($1,'aura',$2,'chat',$3) RETURNING *", [userId, parsed.reply || "", card ? card.id : null]);
    return json({ reply: parsed.reply, recalled, card, action, message: mres.rows[0] });
  } catch (e: any) {
    console.error("capture error:", String(e), e?.stack);
    return json({ error: String(e) }, 500);
  }
}
