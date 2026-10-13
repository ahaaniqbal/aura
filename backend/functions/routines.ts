// Routines: things Aura does on its own, on a clock. A routine is a prompt plus a schedule in
// the user's own timezone. routine_tick runs the ones that are due through the agent, so a
// routine can use every tool Aura has. "Before each meeting" is the one event-driven kind: it runs
// before each calendar event with other people in it.
//
// Ops: list | create {title, prompt, cadence, at, weekday?} | update {id, ...} | delete {id} | run {id}

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
function who(req: Request, ctx: any, body: any): string | null {
  if (ctx.user?.id) return String(ctx.user.id);
  const k = ctx.env.AURA_INTERNAL_KEY;
  if (k && req.headers.get("x-aura-internal") === k && body?.user_id) return String(body.user_id);
  return null;
}

const CADENCES = ["daily", "weekdays", "weekly", "monthly", "before_meetings"];
const DEFAULTS = [
  { kind: "brief", title: "Start of day", blurb: "Your day in one message, before you open anything else", prompt: "Write my start of day message: today's calendar, anything in my inbox that needs me, what's due, birthdays coming up, and the weather if you can find it. Keep it short, lead with what matters most.", cadence: "daily", at: "08:00", active: true },
  { kind: "meeting_prep", title: "Before each meeting", blurb: "Who's in it, what you last talked about, what you owe them", prompt: "Prep me for this meeting: who's in it, what I know about each of them, our last emails, and anything I promised them.", cadence: "before_meetings", at: "00:30", active: false, needs: "googlecalendar" },
  { kind: "inbox", title: "Inbox triage", blurb: "Only what needs you, with the replies already drafted", prompt: "Go through my inbox from the last day. Tell me what actually needs me, draft replies for the ones I should answer, and skip the noise.", cadence: "weekdays", at: "09:30", active: false, needs: "gmail" },
  { kind: "wrap", title: "End of day", blurb: "What got done, what slipped, what's first tomorrow", prompt: "Wrap up my day: what got done, what slipped, what's first tomorrow, and anything I said I'd do for someone.", cadence: "daily", at: "21:00", active: false },
  { kind: "money", title: "Sunday money", blurb: "Where the week's money went, against your budgets", prompt: "Scan my receipts, then tell me how this week's spending looks against my budgets and flag any new subscriptions.", cadence: "weekly", at: "18:00", weekday: 0, active: false },
];

// Minutes east of UTC for a timezone at a given instant.
function tzOffset(tz: string, d: Date): number {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
    return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - d.getTime()) / 60000);
  } catch (_) { return 0; }
}
// The next instant after `from` when this routine should run, in the user's timezone.
function nextRun(cadence: string, at: string, weekday: number | null, tz: string, from = new Date()): Date | null {
  if (cadence === "before_meetings") return new Date(from.getTime() + 5 * 60000); // checked every tick by routine_tick
  const [hh, mm] = (at || "08:00").split(":").map((x) => parseInt(x, 10));
  for (let i = 0; i < 40; i++) {
    const off = tzOffset(tz, from);
    const local = new Date(from.getTime() + off * 60000); // local wall clock, read with UTC getters
    const cand = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i, hh || 0, mm || 0) - off * 60000;
    const c = new Date(cand);
    if (c.getTime() <= from.getTime() + 30000) continue;
    const dow = new Date(cand + off * 60000).getUTCDay(), dom = new Date(cand + off * 60000).getUTCDate();
    if (cadence === "weekdays" && (dow === 0 || dow === 6)) continue;
    if (cadence === "weekly" && dow !== (weekday ?? 1)) continue;
    if (cadence === "monthly" && dom !== 1) continue;
    return c;
  }
  return null;
}

let ready = false; // tables are created once per warm instance
async function ensure(ctx: any) {
  await ctx.db.query(`CREATE TABLE IF NOT EXISTS routines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, kind text DEFAULT 'custom', title text NOT NULL, blurb text,
    prompt text NOT NULL, cadence text NOT NULL, at text DEFAULT '08:00', weekday integer, needs text, active boolean DEFAULT false, last_run_at timestamptz, next_run_at timestamptz,
    last_result text, created_at timestamptz DEFAULT now())`);
  await ctx.db.query("CREATE INDEX IF NOT EXISTS routines_due ON routines(next_run_at) WHERE active");
}
async function tzOf(ctx: any, uid: string): Promise<string> {
  try { const r = await ctx.db.query("SELECT timezone FROM context_state WHERE user_id=$1", [uid]); if (r.rows[0]?.timezone) return r.rows[0].timezone; } catch (_) {}
  return "UTC";
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const body = await req.json().catch(() => ({}));
    const uid = who(req, ctx, body);
    if (!uid) return json({ error: "unauthorized" }, 401);
    if (!ready) { await ensure(ctx); ready = true; }
    const op = String(body.op || "list");
    const tz = await tzOf(ctx, uid);

    if (op === "list") {
      let r = await ctx.db.query("SELECT * FROM routines WHERE user_id=$1 ORDER BY active DESC, created_at ASC", [uid]);
      if (!r.rows.length) {
        for (const d of DEFAULTS) {
          const next = d.active ? nextRun(d.cadence, d.at, (d as any).weekday ?? null, tz) : null;
          await ctx.db.query("INSERT INTO routines (user_id, kind, title, blurb, prompt, cadence, at, weekday, needs, active, next_run_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
            [uid, d.kind, d.title, d.blurb, d.prompt, d.cadence, d.at, (d as any).weekday ?? null, (d as any).needs || null, d.active, next]);
        }
        r = await ctx.db.query("SELECT * FROM routines WHERE user_id=$1 ORDER BY active DESC, created_at ASC", [uid]);
      }
      return json({ ok: true, timezone: tz, routines: r.rows });
    }
    if (op === "create") {
      const cadence = CADENCES.includes(body.cadence) ? body.cadence : "daily";
      const at = /^\d{1,2}:\d{2}$/.test(String(body.at || "")) ? String(body.at).padStart(5, "0") : "08:00";
      const title = String(body.title || "").trim().slice(0, 60), prompt = String(body.prompt || "").trim().slice(0, 1500);
      if (!title || !prompt) return json({ error: "title and prompt required" }, 400);
      const weekday = Number.isInteger(body.weekday) ? body.weekday : null;
      const r = await ctx.db.query("INSERT INTO routines (user_id, kind, title, blurb, prompt, cadence, at, weekday, active, next_run_at) VALUES ($1,'custom',$2,$3,$4,$5,$6,$7,true,$8) RETURNING *",
        [uid, title, String(body.blurb || "").slice(0, 120) || null, prompt, cadence, at, weekday, nextRun(cadence, at, weekday, tz)]);
      return json({ ok: true, routine: r.rows[0] });
    }
    if (op === "update") {
      const cur = (await ctx.db.query("SELECT * FROM routines WHERE id=$1 AND user_id=$2", [body.id, uid])).rows[0];
      if (!cur) return json({ error: "not found" }, 404);
      const n = {
        title: body.title !== undefined ? String(body.title).slice(0, 60) : cur.title,
        prompt: body.prompt !== undefined ? String(body.prompt).slice(0, 1500) : cur.prompt,
        cadence: CADENCES.includes(body.cadence) ? body.cadence : cur.cadence,
        at: /^\d{1,2}:\d{2}$/.test(String(body.at || "")) ? String(body.at).padStart(5, "0") : cur.at,
        weekday: Number.isInteger(body.weekday) ? body.weekday : cur.weekday,
        active: typeof body.active === "boolean" ? body.active : cur.active,
      };
      const next = n.active ? nextRun(n.cadence, n.at, n.weekday, tz) : null;
      const r = await ctx.db.query("UPDATE routines SET title=$3, prompt=$4, cadence=$5, at=$6, weekday=$7, active=$8, next_run_at=$9 WHERE id=$1 AND user_id=$2 RETURNING *",
        [body.id, uid, n.title, n.prompt, n.cadence, n.at, n.weekday, n.active, next]);
      return json({ ok: true, routine: r.rows[0] });
    }
    if (op === "delete") {
      await ctx.db.query("DELETE FROM routines WHERE id=$1 AND user_id=$2", [body.id, uid]);
      return json({ ok: true });
    }
    if (op === "run") {
      // run now: mark it due, and let the caller (the app) show the reply when the feed refreshes
      const r = await ctx.db.query("SELECT * FROM routines WHERE id=$1 AND user_id=$2", [body.id, uid]);
      if (!r.rows[0]) return json({ error: "not found" }, 404);
      const { BUTTERBASE_APP_ID: APP, BUTTERBASE_API_URL: API } = ctx.env;
      const auth = req.headers.get("Authorization");
      const headers: any = { "Content-Type": "application/json" };
      if (auth) headers.Authorization = auth; else headers["x-aura-internal"] = ctx.env.AURA_INTERNAL_KEY || "";
      const a = await fetch(`${API}/v1/${APP}/fn/agent`, { method: "POST", headers, body: JSON.stringify({ text: r.rows[0].prompt, source: "routine", routine: r.rows[0].title, user_id: uid }) }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
      await ctx.db.query("UPDATE routines SET last_run_at=now(), last_result=$3 WHERE id=$1 AND user_id=$2", [body.id, uid, String(a?.reply || a?.error || "").slice(0, 500)]);
      return json({ ok: true, reply: a?.reply || null, message: a?.message || null });
    }
    return json({ error: "unknown op" }, 400);
  } catch (e: any) {
    console.error("routines error:", String(e));
    return json({ error: String(e?.message || e) }, 500);
  }
}
