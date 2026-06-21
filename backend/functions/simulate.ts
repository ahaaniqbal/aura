const AURA_SYSTEM = `you are aura, a personal ambient assistant with genuine taste and warmth. you talk like a sharp, caring friend, not a corporate bot. keep messages short. emoji sparingly. ALWAYS write in all lowercase. NEVER use em dashes or hyphens as punctuation; use commas or periods. you recommend the one good option, not a list. you are proactive but protective of attention. when you recall something, weave it in so they feel known. outward actions are proposed for approval, never assumed done.`;

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
    body: JSON.stringify({ model: "anthropic/claude-haiku-4.5", messages, max_tokens: 500, temperature: 0.7 }),
  });
  const d = await r.json();
  return d?.choices?.[0]?.message?.content || "";
}
async function hydraQuery(base: string, key: string, tenant: string, user: string, q: string): Promise<string[]> {
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(`${base}/query`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ tenant_id: tenant, sub_tenant_id: user, query: q, type: "memory", query_by: "hybrid" }), signal: ctrl.signal });
    const d = await r.json();
    const chunks = d?.data?.chunks || [];
    return chunks.map((c: any) => c?.chunk_content || c?.text || c?.content || (typeof c === "string" ? c : "")).filter(Boolean).slice(0, 6);
  } finally { clearTimeout(tm); }
}
async function recall(ctx: any, userId: string, q: string, like: string[]): Promise<string[]> {
  const { HYDRA_DB_API_KEY } = ctx.env; const HYDRA_BASE = ctx.env.HYDRA_BASE || "https://api.hydradb.com";
  if (HYDRA_DB_API_KEY) { try { const r = await hydraQuery(HYDRA_BASE, HYDRA_DB_API_KEY, "aura", userId, q); if (r.length) return r; } catch (e) { console.warn("hydra:", String(e)); } }
  const clauses = like.map((_, i) => `text ILIKE $${i + 2}`).join(" OR ");
  const res = await ctx.db.query(`SELECT text FROM memories WHERE user_id=$1 AND (${clauses}) ORDER BY created_at DESC LIMIT 8`, [userId, ...like.map((l) => `%${l}%`)]);
  return res.rows.map((x: any) => x.text);
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const body = await req.json().catch(() => ({}));
    const userId = body.user_id || "demo";
    const scenario = body.scenario;
    const { BUTTERBASE_APP_ID, BUTTERBASE_API_URL, BUTTERBASE_API_KEY } = ctx.env;

    if (scenario === "near_bakery") {
      const place = body.place || "tartine bakery";
      await ctx.db.query("INSERT INTO context_state (user_id, location, status) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET location=EXCLUDED.location, status=EXCLUDED.status, updated_at=now()", [userId, JSON.stringify({ name: place, lat: 37.7615, lng: -122.4241 }), `near ${place}`]);
      const recalled = await recall(ctx, userId, "upcoming birthdays, gifts, or anyone who likes cake or sweets", ["birthday", "cake", "sweet", "gift"]);
      const userMsg = `the user is walking past ${place} right now. what you remember about them:\n- ${recalled.join("\n- ") || "(nothing relevant)"}\n\nif something you remember meaningfully connects to being near a bakery (e.g. an upcoming birthday for someone who likes cake), proactively and warmly suggest one specific helpful action. be clear about who it is for. otherwise propose nothing.\nrespond ONLY strict JSON, all string values lowercase with no em dashes: {"reply": string, "proposal": null | {"kind":"buy","title": string,"body": string,"payload":{"merchant": string,"item": string,"total": string,"eta": string},"urgent": false}}`;
      const out = await ai(BUTTERBASE_API_URL, BUTTERBASE_APP_ID, BUTTERBASE_API_KEY, [{ role: "system", content: AURA_SYSTEM }, { role: "user", content: userMsg }]);
      let parsed = parseJSON(out);
      if ((!parsed || !parsed.proposal) && recalled.some((t) => /cake|birthday/i.test(t))) {
        parsed = { reply: `you're right by ${place}, and sam's birthday is coming up. want me to grab him a chocolate cake?`, proposal: { kind: "buy", title: `order sam a chocolate cake`, body: `chocolate cake from ${place}, in time for the 28th. want me to handle it?`, payload: { merchant: place, item: "double chocolate cake", total: "$58.00", eta: "by jun 28" }, urgent: false } };
      }
      if (!parsed) parsed = { reply: `passing ${place}, nothing on your list needs it right now.`, proposal: null };
      let card: any = null, action: any = null;
      if (parsed.proposal) {
        const ares = await ctx.db.query("INSERT INTO actions (user_id, kind, title, payload, state) VALUES ($1,$2,$3,$4,'proposed') RETURNING *", [userId, parsed.proposal.kind, parsed.proposal.title || "", JSON.stringify(parsed.proposal.payload || {})]);
        action = ares.rows[0];
        const cres = await ctx.db.query("INSERT INTO cards (user_id, type, title, body, status, action_id, memory_refs) VALUES ($1,'proactive',$2,$3,'pending',$4,$5) RETURNING *", [userId, parsed.proposal.title || "", parsed.proposal.body || "", action.id, JSON.stringify(recalled.slice(0, 3))]);
        card = cres.rows[0];
      }
      const mres = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind, card_id) VALUES ($1,'aura',$2,'proactive',$3) RETURNING *", [userId, parsed.reply || "", card ? card.id : null]);
      return json({ scenario, reply: parsed.reply, recalled, card, action, message: mres.rows[0] });
    }

    if (scenario === "incoming_email") {
      const email = body.email || { from: "jordan (lead investor)", subject: "re: term sheet", body: "can you confirm the round size and valuation by end of day? we're ready to move." };
      const urgent = !!body.urgent;
      await ctx.db.query("INSERT INTO context_state (user_id, in_meeting, status) VALUES ($1,true,'in a meeting') ON CONFLICT (user_id) DO UPDATE SET in_meeting=true, status='in a meeting', updated_at=now()", [userId]);
      const recalled = await recall(ctx, userId, `relationship with ${email.from} and the user's email writing style`, ["email", "voice", "investor", "write", "tone", String(email.from).split(" ")[0]]);
      const userMsg = `a new email just arrived while the user is in a meeting.\nfrom: ${email.from}\nsubject: ${email.subject}\nbody: ${email.body}\n\nwhat you remember (relationship and their writing voice):\n- ${recalled.join("\n- ") || "(nothing yet)"}\n\ndraft a reply in the user's own voice. decide if this is urgent enough to interrupt a meeting (${urgent ? "treat as urgent" : "default to not urgent unless the content truly demands it"}).\nrespond ONLY strict JSON, all string values lowercase with no em dashes: {"note": string, "draft": {"to": string, "subject": string, "body": string}, "urgent": boolean}`;
      const out = await ai(BUTTERBASE_API_URL, BUTTERBASE_APP_ID, BUTTERBASE_API_KEY, [{ role: "system", content: AURA_SYSTEM }, { role: "user", content: userMsg }]);
      const parsed = parseJSON(out) || { note: `drafted a reply to ${email.from}, holding it till you're free.`, draft: { to: email.from, subject: email.subject, body: "thanks for the note, will confirm shortly." }, urgent };
      const isUrgent = urgent || !!parsed.urgent;
      const ares = await ctx.db.query("INSERT INTO actions (user_id, kind, title, payload, state) VALUES ($1,'email_send',$2,$3,'proposed') RETURNING *", [userId, `reply to ${email.from}`, JSON.stringify({ ...parsed.draft, from_email: email })]);
      const action = ares.rows[0];
      const cres = await ctx.db.query("INSERT INTO cards (user_id, type, title, body, status, action_id) VALUES ($1,$2,$3,$4,'pending',$5) RETURNING *", [userId, isUrgent ? "urgent" : "draft_held", `reply to ${email.from}`, parsed.draft?.body || "", action.id]);
      const card = cres.rows[0];
      const note = isUrgent ? `${email.from} emailed, and this one looks urgent so i'm flagging you now. i drafted a reply.` : (parsed.note || `drafted a reply to ${email.from}, holding it till you're out of your meeting.`);
      const mres = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind, card_id) VALUES ($1,'aura',$2,$3,$4) RETURNING *", [userId, note, isUrgent ? "urgent" : "held", card.id]);
      return json({ scenario, urgent: isUrgent, interrupt: isUrgent, card, action, message: mres.rows[0] });
    }

    if (scenario === "meeting_end") {
      await ctx.db.query("INSERT INTO context_state (user_id, in_meeting, status) VALUES ($1,false,'free') ON CONFLICT (user_id) DO UPDATE SET in_meeting=false, status='free', updated_at=now()", [userId]);
      const held = await ctx.db.query("SELECT * FROM cards WHERE user_id=$1 AND type='draft_held' AND status='pending' ORDER BY created_at DESC", [userId]);
      let note = "you're out of your meeting.";
      if (held.rows.length) note = `you're free now. here's the ${held.rows.length === 1 ? "draft" : held.rows.length + " drafts"} i held while you were heads down.`;
      const mres = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind) VALUES ($1,'aura',$2,'chat') RETURNING *", [userId, note]);
      return json({ scenario, held: held.rows, message: mres.rows[0] });
    }

    return json({ error: "unknown scenario" }, 400);
  } catch (e: any) {
    console.error("simulate error:", String(e), e?.stack);
    return json({ error: String(e) }, 500);
  }
}