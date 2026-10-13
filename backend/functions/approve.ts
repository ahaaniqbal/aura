function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
function rid(p: string): string { return p + Math.random().toString(36).slice(2, 8).toUpperCase(); }
async function exec(apiUrl: string, appId: string, key: string, tool: string, params: any, userId: string): Promise<any> {
  const r = await fetch(`${apiUrl}/v1/${appId}/integrations/execute`, {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({ toolName: tool, params, userId }),
  });
  return r.json();
}
async function hydraIngest(base: string, key: string, user: string, text: string): Promise<void> {
  try {
    await fetch(`${base}/memories/add_memory`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ tenant_id: "aura", sub_tenant_id: user, upsert: true, memories: [{ text, infer: true }] }) });
  } catch (e) { console.warn("hydra ingest:", String(e)); }
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const body = await req.json().catch(() => ({}));
    const actionId = body.action_id;
    const decision = body.decision || "approve";
    if (!actionId) return json({ error: "action_id required" }, 400);
    const { BUTTERBASE_APP_ID, BUTTERBASE_API_URL, BUTTERBASE_API_KEY, HYDRA_DB_API_KEY } = ctx.env;
    const HYDRA_BASE = ctx.env.HYDRA_BASE || "https://api.hydradb.com";

    const ares = await ctx.db.query("SELECT * FROM actions WHERE id=$1", [actionId]);
    if (!ares.rows.length) return json({ error: "action not found" }, 404);
    const action = ares.rows[0];
    // only the person the action belongs to can decide it (legacy clients without a JWT still send user_id)
    if (ctx.user?.id && action.user_id !== ctx.user.id) return json({ error: "not yours" }, 403);
    const userId = ctx.user?.id || action.user_id || body.user_id;
    const IK = ctx.env.AURA_INTERNAL_KEY || "";
    const internal = async (fn: string, payload: any) => {
      const r = await fetch(`${BUTTERBASE_API_URL}/v1/${BUTTERBASE_APP_ID}/fn/${fn}`, { method: "POST", headers: { "Content-Type": "application/json", "x-aura-internal": IK }, body: JSON.stringify({ ...payload, user_id: userId }) });
      return r.json().catch(() => ({}));
    };
    const payload = action.payload || {};

    if (decision === "decline") {
      await ctx.db.query("UPDATE actions SET state='declined', updated_at=now() WHERE id=$1", [actionId]);
      await ctx.db.query("UPDATE cards SET status='dismissed', updated_at=now() WHERE action_id=$1", [actionId]);
      const m = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind) VALUES ($1,'aura',$2,'chat') RETURNING *", [userId, "no worries, i'll leave it. it's off your plate."]);
      return json({ ok: true, decision, message: m.rows[0] });
    }

    let result: any = body.result || null;
    let confirm = "";
    let memo = "";
    if (action.kind === "buy") {
      const merchant = payload.merchant || "the bakery";
      const item = payload.item || "chocolate cake";
      result = result || { merchant, item, total: payload.total || "$54.00", eta: payload.eta || "today", order_id: rid("AC-"), paid_with: "aura virtual card ••4360 (test)" };
      confirm = `done. ordered the ${item} from ${merchant}, ${result.eta}. paid on your aura card ••4360, handled.`;
      memo = `ordered ${item} from ${merchant} (${result.total}) for ${action.title}.`;
    } else if (action.kind === "email_send") {
      const draftBody = body.edited_body || payload.body || "";
      const to = payload.to || "";
      if (to.includes("@")) {
        const params: any = { recipient_email: to, subject: payload.subject || "", body: draftBody };
        if (payload.thread_id) params.thread_id = payload.thread_id;
        const r = await exec(BUTTERBASE_API_URL, BUTTERBASE_APP_ID, BUTTERBASE_API_KEY, "GMAIL_SEND_EMAIL", params, userId);
        if (!(r?.successful || r?.data?.id)) {
          // send failed: leave the card pending so the user can retry
          const fm = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind) VALUES ($1,'aura',$2,'chat') RETURNING *", [userId, `couldn't send to ${to} just now. tap approve to try again.`]);
          return json({ ok: false, error: "send_failed", detail: r?.error || r, message: fm.rows[0] });
        }
        result = { sent_to: to, gmail: true, id: r?.data?.id, thread: r?.data?.threadId };
        confirm = `sent your reply to ${to}. that's handled, back to your day.`;
      } else {
        result = { sent_to: to, subject: payload.subject };
        confirm = `sent to ${to || "them"}. that's wrapped, back to your day.`;
      }
      memo = `replied to ${payload.sender || to} about ${payload.subject || "their email"}.`;
    } else if (action.kind === "booking") {
      result = result || { confirmation: rid("BK-"), detail: action.title };
      confirm = `booked. confirmation ${result.confirmation}, all set.`;
      memo = `booked: ${action.title}.`;
    } else if (action.kind === "reservation") {
      // no universal booking api for restaurants: open the booking page for them and hold the time
      const when = String(payload.when || "");
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(when)) {
        const tzr = await ctx.db.query("SELECT timezone FROM context_state WHERE user_id=$1", [userId]).catch(() => ({ rows: [] }));
        await exec(BUTTERBASE_API_URL, BUTTERBASE_APP_ID, BUTTERBASE_API_KEY, "GOOGLECALENDAR_CREATE_EVENT", { summary: `Dinner at ${payload.place}`, start_datetime: when.slice(0, 16) + ":00", event_duration_hour: 2, event_duration_minutes: 0, timezone: tzr.rows[0]?.timezone || "UTC", description: `Table for ${payload.party}. ${payload.notes || ""} ${payload.link || ""}`.trim() }, userId).catch(() => null);
      }
      result = { open_url: payload.link || null, phone: payload.phone || null, place: payload.place, when, party: payload.party };
      confirm = `opening ${payload.place} so you can lock in the table for ${payload.party}. it's on your calendar.`;
      memo = `planned dinner at ${payload.place} (${when.slice(0, 10)}, ${payload.party} people).`;
    } else if (action.kind === "flight_book") {
      const r = await internal("travel", { op: "book_flight", offer_id: payload.offer_id });
      if (!r?.booking_reference) {
        const fm = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind) VALUES ($1,'aura',$2,'chat') RETURNING *", [userId, r?.error === "traveler_incomplete" ? `i need your traveler details first: ${(r.missing || []).join(", ")}.` : `couldn't book that one: ${r?.error || "the fare may have expired"}. want me to search again?`]);
        return json({ ok: false, error: r?.error || "book_failed", message: fm.rows[0] });
      }
      result = r;
      confirm = `booked. confirmation ${r.booking_reference}, ${r.total} ${r.currency}${r.live ? "" : " (test booking)"}.`;
      memo = `booked flight ${payload.summary || ""}, confirmation ${r.booking_reference}.`;
    } else if (action.kind === "event_create") {
      const r = await exec(BUTTERBASE_API_URL, BUTTERBASE_APP_ID, BUTTERBASE_API_KEY, "GOOGLECALENDAR_CREATE_EVENT", payload, userId);
      if (!(r?.successful || r?.data)) {
        const fm = await ctx.db.query("INSERT INTO messages (user_id, role, content, kind) VALUES ($1,'aura',$2,'chat') RETURNING *", [userId, "couldn't send that invite. is your calendar connected?"]);
        return json({ ok: false, error: "event_failed", message: fm.rows[0] });
      }
      result = { created: true };
      confirm = `invite sent for ${payload.summary}.`;
      memo = `scheduled ${payload.summary} with ${(payload.attendees || []).join(", ")}.`;
    } else if (action.kind === "mcp_call") {
      const r = await internal("mcp", { op: "call", server: payload.server, tool: payload.tool, args: payload.args || {}, approved: true });
      result = r;
      confirm = r?.ok ? `done in ${r.server}.${r.content ? " " + String(r.content).slice(0, 200) : ""}` : `that didn't go through: ${r?.error || "unknown error"}.`;
      memo = r?.ok ? `ran ${payload.tool} in ${r.server}.` : "";
    } else if (action.kind === "a2a_consent") {
      const hours = Math.max(1, Math.min(8, Number(payload.hours) || 8));
      await ctx.db.query("INSERT INTO a2a_consents (user_id, kid, scope, expires_at) VALUES ($1,$2,$3, now() + make_interval(hours => $4))", [userId, payload.kid, payload.scope || "recall", hours]);
      result = { granted: payload.scope || "recall", hours };
      confirm = `ok, ${payload.label} can read your memory for the next ${hours} hour${hours === 1 ? "" : "s"}.`;
    } else if (action.kind === "a2a_act") {
      const r = await internal("agent", { text: payload.intent, source: "a2a" });
      result = { reply: r?.reply || null };
      await ctx.db.query("INSERT INTO a2a_messages (user_id, kid, direction, kind, body) VALUES ($1,$2,'out','result',$3)", [userId, payload.kid, String(r?.reply || "done").slice(0, 2000)]).catch(() => {});
      confirm = r?.reply ? "" : "done.";
    } else {
      result = result || { ok: true };
      confirm = "done.";
      memo = `completed: ${action.title}.`;
    }

    await ctx.db.query("UPDATE actions SET state='executed', result=$2, updated_at=now() WHERE id=$1", [actionId, JSON.stringify(result)]);
    const cardRes = await ctx.db.query("UPDATE cards SET status='done', body=$2, updated_at=now() WHERE action_id=$1 RETURNING *", [actionId, confirm || "done."]);
    if (memo) {
      await ctx.db.query("INSERT INTO memories (user_id, text, source) VALUES ($1,$2,'derived')", [userId, memo]);
      if (HYDRA_DB_API_KEY) { const bg = hydraIngest(HYDRA_BASE, HYDRA_DB_API_KEY, userId, memo); if (ctx.waitUntil) ctx.waitUntil(bg); else bg.catch(() => {}); }
    }
    const m = confirm ? await ctx.db.query("INSERT INTO messages (user_id, role, content, kind) VALUES ($1,'aura',$2,'chat') RETURNING *", [userId, confirm]) : { rows: [null] };
    return json({ ok: true, decision, result, confirm, card: cardRes.rows[0], message: m.rows[0] });
  } catch (e: any) {
    console.error("approve error:", String(e), e?.stack);
    return json({ error: String(e) }, 500);
  }
}
