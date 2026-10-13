// Aura as an agent other agents can talk to: Kaeva's "A2A over MCP" (kaeva-service/packages/a2a)
// ported to one stateless Butterbase function. Another agent (Claude, Kaeva, a work bot) pairs with
// a one-time code the person makes in Aura, then calls Kaeva's verbs as MCP tools:
//   recall   read the person's memory          needs a live consent; first time asks the person
//   remember add to the person's memory        allowed, filed as coming from that agent
//   send     message the person in Aura        tell or ask; lands in their chat
//   watch    poll for replies and decisions    cursor poll, like Kaeva's
//   consent  ask for a standing permission     always the person's call, at most 8 hours
//   act      ask Aura to do something          always waits for the person's tap
// Every call leaves a receipt in a hash chain (Kaeva chain.mjs), so the person can audit it.
//
// App ops (JWT): code {label} | agents | revoke {id} | reply {id, body} | receipts
// Pairing (no auth): {op:"pair", connect_code} -> {access_token}
// MCP (Bearer aura.<kid>.<secret>): JSON-RPC initialize | tools/list | tools/call

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
const rpcOk = (id: any, result: any) => json({ jsonrpc: "2.0", id, result });
const rpcErr = (id: any, code: number, message: string) => json({ jsonrpc: "2.0", id, error: { code, message } });
async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function rand(n: number, alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"): string {
  const b = new Uint8Array(n); crypto.getRandomValues(b);
  return Array.from(b).map((x) => alpha[x % alpha.length]).join("");
}

const TOOLS = [
  { name: "recall", title: "Recall", description: "Ask the person's memory a question and get an answer with citations. The first time, the person is asked in Aura; once they agree, recall works for the hours they allowed.", inputSchema: { type: "object", properties: { question: { type: "string", description: "What to ask the memory, in plain words." } }, required: ["question"] }, annotations: { readOnlyHint: true } },
  { name: "remember", title: "Remember", description: "Add one memory for the person, in their own words where possible. It is filed as coming from you.", inputSchema: { type: "object", properties: { content: { type: "string" } }, required: ["content"] } },
  { name: "send", title: "Send", description: "Message the person in Aura. kind is tell (for their information) or ask (needs an answer; poll watch for the reply).", inputSchema: { type: "object", properties: { body: { type: "string" }, kind: { type: "string", enum: ["tell", "ask"] } }, required: ["body"] } },
  { name: "watch", title: "Watch", description: "Poll for what's new for you since a cursor: the person's replies and their decisions on your requests. Returns a new cursor.", inputSchema: { type: "object", properties: { cursor: { type: "string" } } }, annotations: { readOnlyHint: true } },
  { name: "consent", title: "Consent", description: "Ask the person for a standing permission with a clock on it (at most 8 hours). scope is recall today.", inputSchema: { type: "object", properties: { scope: { type: "string", enum: ["recall"] }, hours: { type: "number" }, reason: { type: "string" } }, required: ["scope"] } },
  { name: "act", title: "Act", description: "Ask Aura to do something for the person: send an email, book, schedule, buy. Never runs until the person taps approve in Aura.", inputSchema: { type: "object", properties: { intent: { type: "string", description: "What should happen, in plain words." }, target: { type: "string" } }, required: ["intent"] } },
];

let ready = false; // tables are created once per warm instance
async function ensure(ctx: any) {
  await ctx.db.query("CREATE TABLE IF NOT EXISTS a2a_codes (code_hash text PRIMARY KEY, user_id text NOT NULL, label text, expires_at timestamptz NOT NULL, used_at timestamptz)");
  await ctx.db.query("CREATE TABLE IF NOT EXISTS a2a_agents (kid text PRIMARY KEY, user_id text NOT NULL, label text NOT NULL, secret_hash text NOT NULL, created_at timestamptz DEFAULT now(), last_seen timestamptz, revoked_at timestamptz)");
  await ctx.db.query("CREATE TABLE IF NOT EXISTS a2a_consents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, kid text NOT NULL, scope text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz DEFAULT now())");
  await ctx.db.query("CREATE TABLE IF NOT EXISTS a2a_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, kid text NOT NULL, direction text NOT NULL, kind text, body text NOT NULL, created_at timestamptz DEFAULT now())");
  await ctx.db.query("CREATE TABLE IF NOT EXISTS a2a_receipts (id bigserial PRIMARY KEY, user_id text NOT NULL, kid text, verb text NOT NULL, subject text, payload_hash text, prev_head text, head text NOT NULL, created_at timestamptz DEFAULT now())");
  await ctx.db.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments jsonb");
}
// Kaeva chain.mjs: head = sha256(prevHead|receiptId|human|agent|verb|subject|payload)
async function receipt(ctx: any, uid: string, kid: string | null, verb: string, subject: string, payload: any) {
  const prev = (await ctx.db.query("SELECT head FROM a2a_receipts WHERE user_id=$1 ORDER BY id DESC LIMIT 1", [uid])).rows[0]?.head || "genesis";
  const rid = rand(12), ph = await sha(JSON.stringify(payload || {}));
  const head = await sha([prev, rid, uid, kid || "", verb, subject, ph].join("|"));
  await ctx.db.query("INSERT INTO a2a_receipts (user_id, kid, verb, subject, payload_hash, prev_head, head) VALUES ($1,$2,$3,$4,$5,$6,$7)", [uid, kid, verb, subject.slice(0, 200), ph, prev, head]);
  return head;
}
// Kaeva tapGate: anything that leaves the person's own world waits for their tap.
async function approvalCard(ctx: any, uid: string, kind: string, title: string, body: string, payload: any) {
  const a = await ctx.db.query("INSERT INTO actions (user_id, kind, title, payload, state) VALUES ($1,$2,$3,$4,'proposed') RETURNING id", [uid, kind, title, JSON.stringify(payload)]);
  await ctx.db.query("INSERT INTO cards (user_id, type, title, body, status, action_id) VALUES ($1,'proactive',$2,$3,'pending',$4)", [uid, title, body, a.rows[0].id]);
  return a.rows[0].id;
}
async function internal(ctx: any, fn: string, uid: string, payload: any) {
  const { BUTTERBASE_APP_ID: APP, BUTTERBASE_API_URL: API, AURA_INTERNAL_KEY: IK } = ctx.env;
  const r = await fetch(`${API}/v1/${APP}/fn/${fn}`, { method: "POST", headers: { "Content-Type": "application/json", "x-aura-internal": IK || "" }, body: JSON.stringify({ ...payload, user_id: uid }) });
  return r.json().catch(() => ({}));
}
const text = (s: string, extra: any = {}) => ({ content: [{ type: "text", text: s }], ...extra });

async function callVerb(ctx: any, agent: any, name: string, args: any) {
  const uid = agent.user_id, kid = agent.kid, who = agent.label;
  if (name === "recall") {
    const q = String(args?.question || "").slice(0, 400);
    const live = await ctx.db.query("SELECT 1 FROM a2a_consents WHERE user_id=$1 AND kid=$2 AND scope='recall' AND expires_at > now() LIMIT 1", [uid, kid]);
    if (!live.rows.length) {
      const id = await approvalCard(ctx, uid, "a2a_consent", `${who} wants to read your memory`, `It asked: "${q}". Allow it to recall from your memory for the next 8 hours?`, { kid, label: who, scope: "recall", hours: 8, question: q });
      await receipt(ctx, uid, kid, "recall", "input_required", { q });
      return text(`Waiting for the person to approve in Aura. Poll watch, then ask again.`, { structuredContent: { resultType: "input_required", approval_id: id } });
    }
    const r = await internal(ctx, "memory", uid, { op: "recall", q, limit: 8 });
    const items = r.items || [];
    await receipt(ctx, uid, kid, "recall", q, { n: items.length });
    if (!items.length) return text("Nothing in memory matches that.");
    return text(items.map((x: any, i: number) => `[${i + 1}] ${x.text}`).join("\n"), { structuredContent: { citations: items.map((x: any) => ({ row_id: x.id, kind: x.kind, at: x.at })) } });
  }
  if (name === "remember") {
    const c = String(args?.content || "").trim().slice(0, 2000);
    if (!c) return text("Nothing to remember.", { isError: true });
    await internal(ctx, "memory", uid, { op: "ingest", text: c, source: `agent:${who}` });
    await receipt(ctx, uid, kid, "remember", c.slice(0, 80), { c });
    return text("Remembered.");
  }
  if (name === "send") {
    const b = String(args?.body || "").trim().slice(0, 2000), kind = args?.kind === "ask" ? "ask" : "tell";
    if (!b) return text("Empty message.", { isError: true });
    await ctx.db.query("INSERT INTO a2a_messages (user_id, kid, direction, kind, body) VALUES ($1,$2,'in',$3,$4)", [uid, kid, kind, b]);
    await ctx.db.query("INSERT INTO messages (user_id, role, content, kind, attachments) VALUES ($1,'agent',$2,'chat',$3)", [uid, b, JSON.stringify([{ type: "agent", from: who, kid, kind }])]);
    await receipt(ctx, uid, kid, "send", kind, { b });
    return text(kind === "ask" ? "Sent. Poll watch for the reply." : "Sent.");
  }
  if (name === "watch") {
    const since = /^\d{4}-\d{2}-\d{2}T/.test(String(args?.cursor || "")) ? args.cursor : new Date(Date.now() - 86400000).toISOString();
    const replies = await ctx.db.query("SELECT body, created_at FROM a2a_messages WHERE user_id=$1 AND kid=$2 AND direction='out' AND created_at > $3 ORDER BY created_at", [uid, kid, since]);
    const decisions = await ctx.db.query("SELECT id, kind, state, result, updated_at FROM actions WHERE user_id=$1 AND payload->>'kid'=$2 AND state IN ('executed','declined') AND updated_at > $3 ORDER BY updated_at", [uid, kid, since]);
    const cursor = new Date().toISOString();
    await receipt(ctx, uid, kid, "watch", since, {});
    return text(JSON.stringify({ replies: replies.rows, decisions: decisions.rows.map((d: any) => ({ approval_id: d.id, kind: d.kind, approved: d.state === "executed", result: d.result })) }), { structuredContent: { cursor, replies: replies.rows, decisions: decisions.rows } });
  }
  if (name === "consent") {
    const hours = Math.max(1, Math.min(8, Number(args?.hours) || 8));
    const id = await approvalCard(ctx, uid, "a2a_consent", `${who} is asking for access`, `${args?.reason ? String(args.reason).slice(0, 200) + " " : ""}Allow ${who} to recall from your memory for ${hours} hour${hours === 1 ? "" : "s"}?`, { kid, label: who, scope: "recall", hours });
    await receipt(ctx, uid, kid, "consent", "recall", { hours });
    return text("Asked. Poll watch for the decision.", { structuredContent: { resultType: "input_required", approval_id: id } });
  }
  if (name === "act") {
    const intent = String(args?.intent || "").trim().slice(0, 600);
    if (!intent) return text("Say what should happen.", { isError: true });
    const id = await approvalCard(ctx, uid, "a2a_act", `${who} wants Aura to act`, intent + (args?.target ? ` (${String(args.target).slice(0, 120)})` : ""), { kid, label: who, intent, target: args?.target || null });
    await receipt(ctx, uid, kid, "act", intent.slice(0, 80), { intent });
    return text("Waiting for the person to approve in Aura.", { structuredContent: { resultType: "input_required", approval_id: id } });
  }
  return text(`Unknown tool ${name}.`, { isError: true });
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    if (!ready) { await ensure(ctx); ready = true; }
    if (req.method === "GET") return json({ name: "Aura", protocol: "kaeva-a2a-over-mcp", mcp: "POST this url with JSON-RPC", pair: "POST {op:'pair', connect_code}" });
    const body = await req.json().catch(() => ({}));

    // ---------- MCP face for paired agents ----------
    if (body && body.jsonrpc === "2.0") {
      const m = String(req.headers.get("Authorization") || "").match(/^Bearer aura\.([A-Za-z0-9]+)\.([A-Za-z0-9]+)$/);
      if (!m) return rpcErr(body.id ?? null, -32001, "pair with Aura first");
      const agent = (await ctx.db.query("SELECT * FROM a2a_agents WHERE kid=$1 AND revoked_at IS NULL", [m[1]])).rows[0];
      if (!agent || agent.secret_hash !== await sha(m[2])) return rpcErr(body.id ?? null, -32001, "this pairing was revoked or never existed");
      await ctx.db.query("UPDATE a2a_agents SET last_seen=now() WHERE kid=$1", [agent.kid]);
      if (body.id === undefined || body.id === null) return new Response(null, { status: 202 }); // notifications
      if (body.method === "initialize") return rpcOk(body.id, { protocolVersion: body.params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "Aura", version: "1.0.0" }, instructions: "You are talking to Aura, a person's personal AI. Their memory and their world are theirs: anything that reads their memory or acts for them waits for their approval in Aura. Use watch to see their decisions." });
      if (body.method === "ping") return rpcOk(body.id, {});
      if (body.method === "tools/list") return rpcOk(body.id, { tools: TOOLS });
      if (body.method === "tools/call") return rpcOk(body.id, await callVerb(ctx, agent, String(body.params?.name || ""), body.params?.arguments || {}));
      return rpcErr(body.id, -32601, "method not found");
    }

    const op = String(body.op || "");
    if (op === "pair") {
      const code = String(body.connect_code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const row = (await ctx.db.query("UPDATE a2a_codes SET used_at=now() WHERE code_hash=$1 AND used_at IS NULL AND expires_at > now() RETURNING user_id, label", [await sha(code)])).rows[0];
      if (!row) return json({ error: "that code is wrong, used or expired" }, 400);
      const kid = rand(10, "abcdefghijkmnpqrstuvwxyz23456789"), secret = rand(32, "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789");
      const label = String(body.label || row.label || "Agent").slice(0, 40);
      await ctx.db.query("INSERT INTO a2a_agents (kid, user_id, label, secret_hash) VALUES ($1,$2,$3,$4)", [kid, row.user_id, label, await sha(secret)]);
      await receipt(ctx, row.user_id, kid, "pair", label, {});
      return json({ ok: true, access_token: `aura.${kid}.${secret}`, agent_id: `agent:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${kid.slice(0, 6)}` });
    }

    // ---------- the person's own controls ----------
    const uid = ctx.user?.id;
    if (!uid) return json({ error: "unauthorized" }, 401);
    if (op === "code") {
      const code = rand(8);
      await ctx.db.query("INSERT INTO a2a_codes (code_hash, user_id, label, expires_at) VALUES ($1,$2,$3, now() + interval '10 minutes')", [await sha(code), uid, String(body.label || "").slice(0, 40) || null]);
      const { BUTTERBASE_APP_ID: APP, BUTTERBASE_API_URL: API } = ctx.env;
      return json({ ok: true, code: `${code.slice(0, 4)}-${code.slice(4)}`, endpoint: `${API}/v1/${APP}/fn/a2a`, expires_in: 600 });
    }
    if (op === "agents") {
      const r = await ctx.db.query(`SELECT a.kid AS id, a.label, a.created_at, a.last_seen, (SELECT max(expires_at) FROM a2a_consents c WHERE c.kid=a.kid AND c.expires_at > now()) AS recall_until
        FROM a2a_agents a WHERE a.user_id=$1 AND a.revoked_at IS NULL ORDER BY a.created_at`, [uid]);
      return json({ ok: true, agents: r.rows });
    }
    if (op === "revoke") {
      await ctx.db.query("UPDATE a2a_agents SET revoked_at=now() WHERE kid=$1 AND user_id=$2", [body.id, uid]);
      await ctx.db.query("DELETE FROM a2a_consents WHERE kid=$1 AND user_id=$2", [body.id, uid]);
      await receipt(ctx, uid, String(body.id), "revoke", "", {});
      return json({ ok: true });
    }
    if (op === "reply") {
      const b = String(body.body || "").trim().slice(0, 2000);
      if (!b) return json({ error: "body required" }, 400);
      const ok = await ctx.db.query("SELECT 1 FROM a2a_agents WHERE kid=$1 AND user_id=$2 AND revoked_at IS NULL", [body.id, uid]);
      if (!ok.rows.length) return json({ error: "not found" }, 404);
      await ctx.db.query("INSERT INTO a2a_messages (user_id, kid, direction, kind, body) VALUES ($1,$2,'out','reply',$3)", [uid, body.id, b]);
      await receipt(ctx, uid, String(body.id), "reply", "", { b });
      return json({ ok: true });
    }
    if (op === "receipts") {
      const r = await ctx.db.query("SELECT r.verb, r.subject, r.created_at, r.head, a.label FROM a2a_receipts r LEFT JOIN a2a_agents a ON a.kid=r.kid WHERE r.user_id=$1 ORDER BY r.id DESC LIMIT 50", [uid]);
      return json({ ok: true, receipts: r.rows });
    }
    return json({ error: "unknown op" }, 400);
  } catch (e: any) {
    console.error("a2a error:", String(e), e?.stack);
    return json({ error: String(e?.message || e) }, 500);
  }
}
