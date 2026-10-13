// Connect any remote MCP server (Streamable HTTP) to Aura: Linear, GitHub, Zapier, a company's
// own tools, or another agent that speaks Kaeva's A2A-over-MCP. Aura lists the server's tools and
// can call them. Tools that only read run straight away; anything that changes something becomes
// an approval card first. Before any call leaves, Kaeva's privacy check (tap.mjs) looks for text
// lifted from the user's private memory, and holds the call for approval if it finds any.
//
// Ops: list | add {url, name?, token?} | remove {id} | refresh {id} | tools | call {server, tool, args, approved?}

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
function who(req: Request, ctx: any, body: any): string | null {
  if (ctx.user?.id) return String(ctx.user.id);
  const k = ctx.env.AURA_INTERNAL_KEY;
  if (k && req.headers.get("x-aura-internal") === k && body?.user_id) return String(body.user_id);
  return null;
}
function httpsPublic(u: string): URL | null {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:") return null;
    const h = x.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return null;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(h) || h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return null;
    return x;
  } catch (_) { return null; }
}

// ---------- a minimal Streamable HTTP MCP client ----------
const PROTOCOL = "2025-06-18";
async function rpc(url: string, token: string | null, session: string | null, method: string, params: any, id: number | null): Promise<{ result?: any; error?: any; session: string | null }> {
  const headers: any = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": PROTOCOL };
  if (token) headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  if (session) headers["Mcp-Session-Id"] = session;
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(id === null ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params }), signal: ctrl.signal, redirect: "error" });
    const sid = r.headers.get("mcp-session-id") || session;
    if (id === null) return { session: sid };
    if (r.status === 401 || r.status === 403) return { error: { message: "the server needs a valid token" }, session: sid };
    const type = r.headers.get("content-type") || "";
    const text = await r.text();
    if (type.includes("text/event-stream")) {
      for (const block of text.split(/\n\n/)) {
        const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
        if (!data) continue;
        try { const m = JSON.parse(data); if (m.id === id) return { result: m.result, error: m.error, session: sid }; } catch (_) {}
      }
      return { error: { message: "no reply from the server" }, session: sid };
    }
    const m = JSON.parse(text || "{}");
    return { result: m.result, error: m.error || (!r.ok ? { message: `server returned ${r.status}` } : undefined), session: sid };
  } finally { clearTimeout(tm); }
}
async function connect(url: string, token: string | null) {
  const init = await rpc(url, token, null, "initialize", { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "Aura", version: "1.0.0" } }, 1);
  if (init.error) throw new Error(init.error.message || "couldn't connect");
  await rpc(url, token, init.session, "notifications/initialized", {}, null);
  return { session: init.session, server: init.result?.serverInfo || {} };
}
async function listTools(url: string, token: string | null) {
  const c = await connect(url, token);
  const tools: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 5; i++) {
    const r = await rpc(url, token, c.session, "tools/list", cursor ? { cursor } : {}, 2 + i);
    if (r.error) throw new Error(r.error.message || "couldn't list tools");
    tools.push(...(r.result?.tools || []));
    cursor = r.result?.nextCursor;
    if (!cursor) break;
  }
  return { server: c.server, tools: tools.slice(0, 120).map((t: any) => ({ name: t.name, description: String(t.description || "").slice(0, 300), input: t.inputSchema || {}, read_only: !!t.annotations?.readOnlyHint, destructive: !!t.annotations?.destructiveHint })) };
}

// ---------- Kaeva tap.mjs: does this outgoing text copy the user's private memory? ----------
function normalise(s: string): string {
  return String(s || "").normalize("NFKC").replace(/[​-‏⁠-⁤﻿­]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
async function shingles(s: string): Promise<Set<string>> {
  const w = normalise(s).split(" ").filter(Boolean), out = new Set<string>();
  for (let i = 0; i + 5 <= w.length; i++) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(w.slice(i, i + 5).join(" ")));
    out.add(Array.from(new Uint8Array(d)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join(""));
  }
  return out;
}
async function leaksMemory(ctx: any, uid: string, payload: string): Promise<boolean> {
  const out = await shingles(payload);
  if (!out.size) return false;
  let rows: any[] = [];
  try { rows = (await ctx.db.query("SELECT text FROM mem_chunks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200", [uid])).rows; } catch (_) {}
  try { rows = rows.concat((await ctx.db.query("SELECT text FROM memories WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200", [uid])).rows); } catch (_) {}
  for (const r of rows) { const m = await shingles(r.text); for (const h of m) if (out.has(h)) return true; }
  return false;
}

let ready = false; // tables are created once per warm instance
async function ensure(ctx: any) {
  await ctx.db.query(`CREATE TABLE IF NOT EXISTS mcp_servers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, name text NOT NULL, url text NOT NULL, token text,
    tools jsonb DEFAULT '[]', status text DEFAULT 'ok', last_error text, created_at timestamptz DEFAULT now(), checked_at timestamptz DEFAULT now(), UNIQUE (user_id, url))`);
}
const pub = (r: any) => ({ id: r.id, name: r.name, url: r.url, status: r.status, last_error: r.last_error, tools: (r.tools || []).map((t: any) => ({ name: t.name, description: t.description, read_only: t.read_only })), has_token: !!r.token });

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const body = await req.json().catch(() => ({}));
    const uid = who(req, ctx, body);
    if (!uid) return json({ error: "unauthorized" }, 401);
    if (!ready) { await ensure(ctx); ready = true; }
    const op = String(body.op || "list");

    if (op === "list") {
      const r = await ctx.db.query("SELECT * FROM mcp_servers WHERE user_id=$1 ORDER BY created_at", [uid]);
      return json({ ok: true, servers: r.rows.map(pub) });
    }
    if (op === "add") {
      const u = httpsPublic(String(body.url || "").trim());
      if (!u) return json({ error: "Use the server's https address." }, 400);
      const token = body.token ? String(body.token).trim().slice(0, 4000) : null;
      let info;
      try { info = await listTools(u.toString(), token); } catch (e: any) { return json({ error: `Couldn't connect: ${String(e?.message || e)}` }, 400); }
      const name = String(body.name || info.server?.title || info.server?.name || u.hostname).slice(0, 60);
      const r = await ctx.db.query("INSERT INTO mcp_servers (user_id, name, url, token, tools) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, url) DO UPDATE SET name=EXCLUDED.name, token=EXCLUDED.token, tools=EXCLUDED.tools, status='ok', last_error=NULL, checked_at=now() RETURNING *",
        [uid, name, u.toString(), token, JSON.stringify(info.tools)]);
      return json({ ok: true, server: pub(r.rows[0]) });
    }
    if (op === "remove") {
      await ctx.db.query("DELETE FROM mcp_servers WHERE id=$1 AND user_id=$2", [body.id, uid]);
      return json({ ok: true });
    }
    if (op === "refresh") {
      const s = (await ctx.db.query("SELECT * FROM mcp_servers WHERE id=$1 AND user_id=$2", [body.id, uid])).rows[0];
      if (!s) return json({ error: "not found" }, 404);
      try {
        const info = await listTools(s.url, s.token);
        const r = await ctx.db.query("UPDATE mcp_servers SET tools=$3, status='ok', last_error=NULL, checked_at=now() WHERE id=$1 AND user_id=$2 RETURNING *", [s.id, uid, JSON.stringify(info.tools)]);
        return json({ ok: true, server: pub(r.rows[0]) });
      } catch (e: any) {
        await ctx.db.query("UPDATE mcp_servers SET status='error', last_error=$3, checked_at=now() WHERE id=$1 AND user_id=$2", [s.id, uid, String(e?.message || e).slice(0, 200)]);
        return json({ error: String(e?.message || e) }, 400);
      }
    }
    if (op === "tools") {
      const r = await ctx.db.query("SELECT id, name, tools FROM mcp_servers WHERE user_id=$1 AND status='ok'", [uid]);
      return json({ ok: true, servers: r.rows.map((s: any) => ({ id: s.id, name: s.name, tools: (s.tools || []).map((t: any) => ({ name: t.name, description: t.description, read_only: t.read_only, input: t.input })) })) });
    }
    if (op === "call") {
      const ref = String(body.server || "");
      const s = (await ctx.db.query("SELECT * FROM mcp_servers WHERE user_id=$1 AND (id::text=$2 OR lower(name)=lower($2)) LIMIT 1", [uid, ref])).rows[0];
      if (!s) return json({ error: `no connected server called ${ref}` }, 404);
      const tool = (s.tools || []).find((t: any) => t.name === body.tool);
      if (!tool) return json({ error: `${s.name} has no tool called ${body.tool}` }, 404);
      const args = body.args && typeof body.args === "object" ? body.args : {};
      // the approval gate: writes always, and reads that would carry private memory out. Only
      // approve.ts sets `approved`, after the person taps; the agent never does.
      if (!body.approved) {
        const leak = await leaksMemory(ctx, uid, JSON.stringify(args));
        if (!tool.read_only || leak) return json({ ok: false, needs_approval: true, reason: leak ? "it would share something from your memory" : "it changes something in " + s.name, server: { id: s.id, name: s.name }, tool: tool.name });
      }
      const c = await connect(s.url, s.token);
      const r = await rpc(s.url, s.token, c.session, "tools/call", { name: tool.name, arguments: args }, 9);
      if (r.error) return json({ error: r.error.message || "the tool failed" }, 400);
      const content = (r.result?.content || []).map((x: any) => x.type === "text" ? x.text : x.type === "resource" ? (x.resource?.text || x.resource?.uri || "") : `[${x.type}]`).join("\n").slice(0, 8000);
      return json({ ok: true, server: s.name, tool: tool.name, is_error: !!r.result?.isError, content, structured: r.result?.structuredContent || null });
    }
    return json({ error: "unknown op" }, 400);
  } catch (e: any) {
    console.error("mcp error:", String(e));
    return json({ error: String(e?.message || e) }, 500);
  }
}
