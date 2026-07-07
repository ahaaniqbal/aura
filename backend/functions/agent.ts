const SYSTEM = `you are aura, a personal ambient agent with genuine taste and warmth. you talk like a sharp, caring friend, not a corporate bot. keep replies short. emoji sparingly. ALWAYS lowercase. NEVER use em dashes or hyphens as punctuation; use commas or periods.

you are a real agent with tools. think step by step and use tools to fully handle the request before answering. do not ask the user to do things you can do yourself with a tool.

your relationship graph is your living memory of the people in the user's life and the promises between them. whenever the user mentions a person, a detail about someone, or a commitment (something they owe, or that is owed to them), quietly call remember_person and add_promise so nothing is ever dropped. capture birthdays as MM-DD, and how each person relates to the user (family, friend, client, collaborator, partner) when it is clear. when they ask about someone, want an intro, ask "who do i know that...", or what they owe a person, use recall_people, who_knows, and open_promises. prefer the graph for anything about people or promises.

reads are free: recall_memory, recall_people, who_knows, open_promises, search_inbox, get_calendar, list_tasks, get_context.
anything outbound is NEVER done silently: you DRAFT or PROPOSE it as a card the user approves. use draft_email for replies and propose for buy/booking/etc.

respond with raw json only, never wrapped in markdown or backticks. each json object is exactly one of:
{"tool":"<name>","args":{...},"thought":"<one short line>"}
{"final":true,"reply":"<message to the user, lowercase>","memory_to_store":["<durable fact>"]}

tools:
- recall_memory {"query": string}
- save_memory {"text": string}
- remember_person {"name": string, "note"?: string, "how_met"?: string, "org"?: string, "relation"?: "family"|"friend"|"client"|"collaborator"|"partner", "birthday"?: "MM-DD", "topics"?: string[]}
- add_promise {"text": string, "person"?: string, "direction"?: "i_owe"|"owed_to_me", "due"?: string}
- recall_people {"query": string}
- open_promises {"person"?: string}
- who_knows {"topic": string}
- search_inbox {"query"?: string}
- get_calendar {"days"?: number}
- draft_email {"to": string, "subject": string, "body": string}
- set_reminder {"text": string, "minutes": number}
- add_task {"text": string}
- list_tasks {}
- get_context {}
- propose {"kind":"buy"|"booking", "title": string, "body": string, "payload": object, "urgent"?: boolean}

rules: store only durable facts in memory_to_store, never trivia. keep tool calls minimal and purposeful. when you have enough to answer or have surfaced the right card, finalize.`;

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
// haiku sometimes emits several json action objects in one response (and wraps them
// in markdown fences). extract every top-level object by walking balanced braces.
function extractObjects(s: string): any[] {
  if (!s) return [];
  s = s.replace(/```json/gi, "").replace(/```/g, "");
  const out: any[] = [];
  let i = 0;
  while (i < s.length) {
    const start = s.indexOf("{", i);
    if (start < 0) break;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let j = start; j < s.length; j++) {
      const ch = s[j];
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; }
      else { if (ch === '"') inStr = true; else if (ch === "{") depth++; else if (ch === "}") { depth--; if (depth === 0) { end = j; break; } } }
    }
    if (end < 0) break;
    try { out.push(JSON.parse(s.slice(start, end + 1))); } catch (_) {}
    i = end + 1;
  }
  return out;
}
async function ai(apiUrl: string, appId: string, key: string, messages: any[]): Promise<string> {
  const r = await fetch(`${apiUrl}/v1/${appId}/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({ model: "anthropic/claude-haiku-4.5", messages, max_tokens: 700, temperature: 0.4 }),
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
async function hydraQuery(base: string, key: string, user: string, q: string): Promise<string[]> {
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(`${base}/query`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ tenant_id: "aura", sub_tenant_id: user, query: q, type: "memory", query_by: "hybrid" }), signal: ctrl.signal });
    const d = await r.json();
    return (d?.data?.chunks || []).map((c: any) => c?.chunk_content || c?.text || c?.content || "").filter(Boolean).slice(0, 6);
  } finally { clearTimeout(tm); }
}
async function hydraIngest(base: string, key: string, user: string, text: string): Promise<void> {
  try { await fetch(`${base}/memories/add_memory`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({ tenant_id: "aura", sub_tenant_id: user, upsert: true, memories: [{ text, infer: true }] }) }); } catch (e) {}
}
function nameOf(s: string): string { const m = (s || "").match(/^([^<]+)</); return (m ? m[1] : s || "").trim().replace(/"/g, ""); }
function emailOf(s: string): string { const m = (s || "").match(/<([^>]+)>/); return m ? m[1] : (s || ""); }

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const body = await req.json().catch(() => ({}));
    const userId = ctx.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    const authHeader = req.headers.get("Authorization") || "";
    const text = (body.text || "").toString().trim();
    const source = body.source || "chat";
    if (!text) return json({ error: "text required" }, 400);
    await ctx.db.query("INSERT INTO profiles (id) SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE id=$1)", [userId]);
    await ctx.db.query("INSERT INTO entitlements (user_id, tier) SELECT $1,'free' WHERE NOT EXISTS (SELECT 1 FROM entitlements WHERE user_id=$1)", [userId]);
    const { BUTTERBASE_APP_ID: APP, BUTTERBASE_API_URL: API, BUTTERBASE_API_KEY: KEY, HYDRA_DB_API_KEY: HK } = ctx.env;
    const HB = ctx.env.HYDRA_BASE || "https://api.hydradb.com";

    // the relationship graph (Neo4j) lives behind the `graph` function; forward the user's JWT so it scopes to them
    async function graphOp(op: string, params: any): Promise<any> {
      try {
        const r = await fetch(`${API}/v1/${APP}/fn/graph`, {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": authHeader },
          body: JSON.stringify({ op, ...params }),
        });
        return await r.json();
      } catch (e) { return { error: String(e) }; }
    }

    if (source !== "system") await ctx.db.query("INSERT INTO messages (user_id, role, content, kind) VALUES ($1,'user',$2,$3)", [userId, text, source]);

    const hist = await ctx.db.query("SELECT role, content FROM messages WHERE user_id=$1 AND kind IN ('chat','agent') ORDER BY created_at DESC LIMIT 6", [userId]);
    const histMsgs = hist.rows.reverse().map((m: any) => ({ role: m.role === "user" ? "user" : "assistant", content: String(m.content || "").slice(0, 500) }));

    let lastCard: any = null;
    const steps: any[] = [];

    async function runTool(name: string, args: any): Promise<string> {
      try {
        if (name === "recall_memory") {
          let mem: string[] = [];
          if (HK) { try { mem = await hydraQuery(HB, HK, userId, args?.query || text); } catch (e) {} }
          const kw = await ctx.db.query("SELECT text FROM memories WHERE user_id=$1 ORDER BY created_at DESC LIMIT 8", [userId]);
          mem = Array.from(new Set([...mem, ...kw.rows.map((x: any) => x.text)])).slice(0, 8);
          return mem.length ? mem.map((m) => "- " + m).join("\n") : "(no memories yet)";
        }
        if (name === "save_memory") {
          const t = (args?.text || "").toString().trim(); if (!t) return "nothing to save";
          await ctx.db.query("INSERT INTO memories (user_id, text, source) VALUES ($1,$2,'agent')", [userId, t]);
          if (HK) { const bg = hydraIngest(HB, HK, userId, t); if (ctx.waitUntil) ctx.waitUntil(bg); }
          return "saved";
        }
        if (name === "remember_person") {
          const p = { name: (args?.name || "").toString().trim(), note: args?.note, how_met: args?.how_met, org: args?.org, birthday: args?.birthday, relation: args?.relation, topics: Array.isArray(args?.topics) ? args.topics : (args?.topics ? [String(args.topics)] : []) };
          if (!p.name) return "need a name";
          const r = await graphOp("ingest", { people: [p] });
          return r?.ok ? `remembered ${p.name} in your relationship graph` : "graph error: " + JSON.stringify(r).slice(0, 120);
        }
        if (name === "add_promise") {
          const pr = { text: (args?.text || "").toString().trim(), person: args?.person, direction: args?.direction, due: args?.due };
          if (!pr.text) return "need the promise text";
          const r = await graphOp("ingest", { promises: [pr] });
          return r?.ok ? `tracking: ${pr.text}${pr.person ? " (with " + pr.person + ")" : ""}` : "graph error: " + JSON.stringify(r).slice(0, 120);
        }
        if (name === "recall_people") {
          const r = await graphOp("recall", { q: (args?.query || "").toString() });
          const ppl = r?.people || [];
          if (!ppl.length) return "(no one in your graph matches that yet)";
          return ppl.map((x: any) => `- ${x.name}${x.org ? " (" + x.org + ")" : ""}${x.note ? ": " + x.note : ""}${x.topics?.length ? " [into: " + x.topics.join(", ") + "]" : ""}${x.open_promises?.length ? " {open: " + x.open_promises.join("; ") + "}" : ""}`).join("\n");
        }
        if (name === "open_promises") {
          const r = await graphOp("promises", { person: args?.person || null });
          const prs = r?.promises || [];
          if (!prs.length) return "(no open promises)";
          return prs.map((x: any) => `- ${x.text}${x.person ? " (to " + x.person + ")" : ""}${x.due ? " by " + x.due : ""}`).join("\n");
        }
        if (name === "who_knows") {
          const r = await graphOp("who_knows", { topic: (args?.topic || "").toString() });
          const ppl = r?.people || [];
          if (!ppl.length) return "(no one in your circle matches that)";
          return ppl.map((x: any) => `- ${x.name}${x.org ? " (" + x.org + ")" : ""}${x.topics?.length ? " [into: " + x.topics.join(", ") + "]" : ""}`).join("\n");
        }
        if (name === "search_inbox") {
          const fe = await exec(API, APP, KEY, "GMAIL_FETCH_EMAILS", { max_results: 5 }, userId);
          const ms = fe?.data?.messages || [];
          if (!ms.length) return "(inbox empty, or gmail not connected for this account)";
          return ms.map((m: any, i: number) => `${i + 1}. from ${m.sender} | ${m.subject} | ${String(m.messageText || m.preview || "").replace(/\s+/g, " ").slice(0, 120)}`).join("\n");
        }
        if (name === "get_calendar") {
          const days = Math.max(1, Math.min(31, Number(args?.days) || 7));
          const timeMin = new Date().toISOString();
          const timeMax = new Date(Date.now() + days * 86400000).toISOString();
          const r = await exec(API, APP, KEY, "GOOGLECALENDAR_EVENTS_LIST", { calendarId: "primary", maxResults: 10, timeMin, timeMax, singleEvents: true, orderBy: "startTime" }, userId);
          const items = (r?.data?.items) || [];
          if (!items.length) return "(no events, or calendar not connected for this account)";
          return items.slice(0, 10).map((e: any) => `- ${e.summary || "(busy)"} | ${e.start?.dateTime || e.start?.date || "?"}`).join("\n");
        }
        if (name === "draft_email") {
          const to = emailOf(args?.to || "") || (args?.to || "");
          const payload = { to, subject: args?.subject || "", body: args?.body || "", sender: args?.to };
          const a2 = await ctx.db.query("INSERT INTO actions (user_id, kind, title, payload, state) VALUES ($1,'email_send',$2,$3,'proposed') RETURNING *", [userId, `reply to ${nameOf(args?.to || to)}`, JSON.stringify(payload)]);
          const c2 = await ctx.db.query("INSERT INTO cards (user_id, type, title, body, status, action_id) VALUES ($1,'draft_held',$2,$3,'pending',$4) RETURNING *", [userId, `reply to ${nameOf(args?.to || to)}`, args?.body || "", a2.rows[0].id]);
          lastCard = c2.rows[0];
          return `drafted to ${to}, surfaced as an approval card`;
        }
        if (name === "set_reminder") {
          const mins = Math.max(1, Math.round(Number(args?.minutes) || 5));
          const rt = (args?.text || "your reminder").toString();
          const due = new Date(Date.now() + mins * 60000).toISOString();
          await ctx.db.query("INSERT INTO actions (user_id, kind, title, payload, state) VALUES ($1,'reminder',$2,$3,'scheduled')", [userId, rt, JSON.stringify({ text: rt, due_at: due, minutes: mins })]);
          return `reminder set for ${mins} minute(s)`;
        }
        if (name === "add_task") {
          const t = (args?.text || "").toString().trim(); if (!t) return "no task text";
          await ctx.db.query("INSERT INTO memories (user_id, text, kind, source) VALUES ($1,$2,'task','task')", [userId, t]);
          return "task added";
        }
        if (name === "list_tasks") {
          const ts = await ctx.db.query("SELECT text FROM memories WHERE user_id=$1 AND kind='task' ORDER BY created_at DESC LIMIT 12", [userId]);
          return ts.rows.length ? ts.rows.map((x: any) => "- " + x.text).join("\n") : "(no tasks)";
        }
        if (name === "get_context") {
          const cs = await ctx.db.query("SELECT in_meeting, location, status FROM context_state WHERE user_id=$1", [userId]);
          const c0 = cs.rows[0] || {};
          return JSON.stringify({ now: new Date().toISOString(), in_meeting: !!c0.in_meeting, location: c0.location || null, status: c0.status || null });
        }
        if (name === "propose") {
          const kind = args?.kind || "buy";
          const a2 = await ctx.db.query("INSERT INTO actions (user_id, kind, title, payload, state) VALUES ($1,$2,$3,$4,'proposed') RETURNING *", [userId, kind, args?.title || "", JSON.stringify(args?.payload || {})]);
          const c2 = await ctx.db.query("INSERT INTO cards (user_id, type, title, body, status, action_id) VALUES ($1,$2,$3,$4,'pending',$5) RETURNING *", [userId, args?.urgent ? "urgent" : "proactive", args?.title || "", args?.body || "", a2.rows[0].id]);
          lastCard = c2.rows[0];
          return "proposed, surfaced as an approval card";
        }
        return "unknown tool";
      } catch (e: any) { return "tool error: " + String(e).slice(0, 120); }
    }

    const convo: any[] = [{ role: "system", content: SYSTEM }, ...histMsgs, { role: "user", content: text }];
    let finalReply = "", toStore: string[] = [];
    for (let i = 0; i < 6; i++) {
      const out = await ai(API, APP, KEY, convo);
      const objs = extractObjects(out);
      if (!objs.length) { finalReply = (out || "hmm, let me try that again.").toString().toLowerCase().slice(0, 600); break; }
      // run every tool the model asked for this turn, then loop so it can finalize with the observations
      const toolCalls = objs.filter((o) => o && o.tool);
      if (toolCalls.length) {
        for (const parsed of toolCalls) {
          const obs = await runTool(parsed.tool, parsed.args || {});
          steps.push({ tool: parsed.tool, thought: parsed.thought || "" });
          convo.push({ role: "assistant", content: JSON.stringify({ tool: parsed.tool, args: parsed.args }) });
          convo.push({ role: "user", content: `observation(${parsed.tool}):\n${obs}` });
        }
        continue;
      }
      const fin = objs.find((o) => o && o.final) || objs.find((o) => o && o.reply);
      if (fin) { finalReply = (fin.reply || "done.").toString(); toStore = Array.isArray(fin.memory_to_store) ? fin.memory_to_store.filter((m: string) => m && m.trim()) : []; }
      break;
    }
    if (!finalReply) finalReply = "i looked into it, but want to make sure i get it right, can you say a bit more?";

    for (const m of toStore) {
      await ctx.db.query("INSERT INTO memories (user_id, text, source) VALUES ($1,$2,'agent')", [userId, m]);
      if (HK) { const bg = hydraIngest(HB, HK, userId, m); if (ctx.waitUntil) ctx.waitUntil(bg); }
    }
    const mres = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind, card_id) VALUES ($1,'aura',$2,'chat',$3) RETURNING *", [userId, finalReply, lastCard ? lastCard.id : null]);
    return json({ reply: finalReply, steps, card: lastCard, message: mres.rows[0] });
  } catch (e: any) {
    console.error("agent error:", String(e), e?.stack);
    return json({ error: String(e) }, 500);
  }
}
