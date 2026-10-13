// Cron trigger "*/5 * * * *", service role. Runs every routine that's due through the agent (so
// a routine can search, check the calendar, draft, book), posts the reply into the user's chat,
// and pushes it to their phone. "Before each meeting" runs ~30 minutes before calendar events that have
// other people in them, once per event.

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
function tzOffset(tz: string, d: Date): number {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
    return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - d.getTime()) / 60000);
  } catch (_) { return 0; }
}
function nextRun(cadence: string, at: string, weekday: number | null, tz: string, from = new Date()): Date | null {
  const [hh, mm] = (at || "08:00").split(":").map((x) => parseInt(x, 10));
  for (let i = 0; i < 40; i++) {
    const off = tzOffset(tz, from);
    const local = new Date(from.getTime() + off * 60000);
    const cand = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i, hh || 0, mm || 0) - off * 60000;
    if (cand <= from.getTime() + 30000) continue;
    const ld = new Date(cand + off * 60000), dow = ld.getUTCDay();
    if (cadence === "weekdays" && (dow === 0 || dow === 6)) continue;
    if (cadence === "weekly" && dow !== (weekday ?? 1)) continue;
    if (cadence === "monthly" && ld.getUTCDate() !== 1) continue;
    return new Date(cand);
  }
  return null;
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  try {
    const { BUTTERBASE_APP_ID: APP, BUTTERBASE_API_URL: API, BUTTERBASE_API_KEY: KEY, AURA_INTERNAL_KEY: IK } = ctx.env;
    if (!IK) return json({ ok: false, error: "AURA_INTERNAL_KEY not set" }, 500);
    await ctx.db.query("CREATE TABLE IF NOT EXISTS routine_runs (routine_id uuid NOT NULL, ref text NOT NULL, ran_at timestamptz DEFAULT now(), PRIMARY KEY (routine_id, ref))");
    const agent = async (uid: string, text: string, routine: string) => {
      const r = await fetch(`${API}/v1/${APP}/fn/agent`, { method: "POST", headers: { "Content-Type": "application/json", "x-aura-internal": IK }, body: JSON.stringify({ text, source: "routine", routine, user_id: uid }) });
      return r.json().catch(() => ({}));
    };
    const push = async (uid: string, title: string, body: string) => {
      const d = await ctx.db.query("SELECT expo_push_token FROM devices WHERE user_id=$1", [uid]);
      for (const row of d.rows) {
        await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ to: row.expo_push_token, title, body: body.slice(0, 160), sound: "default" }) }).catch(() => {});
      }
    };
    let ran = 0;

    const due = await ctx.db.query("SELECT r.*, coalesce(c.timezone,'UTC') AS tz FROM routines r LEFT JOIN context_state c ON c.user_id=r.user_id WHERE r.active AND r.cadence <> 'before_meetings' AND r.next_run_at <= now() ORDER BY r.next_run_at LIMIT 20");
    for (const r of due.rows) {
      // move the clock first so a slow or failing run never fires twice
      await ctx.db.query("UPDATE routines SET next_run_at=$2, last_run_at=now() WHERE id=$1", [r.id, nextRun(r.cadence, r.at, r.weekday, r.tz)]);
      const a = await agent(r.user_id, r.prompt, r.title);
      if (a?.reply) { await push(r.user_id, r.title, a.reply); await ctx.db.query("UPDATE routines SET last_result=$2 WHERE id=$1", [r.id, String(a.reply).slice(0, 500)]); ran++; }
    }

    const prep = await ctx.db.query("SELECT * FROM routines WHERE active AND cadence='before_meetings' LIMIT 50");
    for (const r of prep.rows) {
      const lead = Math.max(5, Math.min(120, parseInt(String(r.at || "00:30").split(":")[1] || "30", 10) + 60 * parseInt(String(r.at || "00:30").split(":")[0] || "0", 10)));
      const timeMin = new Date(Date.now() + (lead - 5) * 60000).toISOString(), timeMax = new Date(Date.now() + (lead + 5) * 60000).toISOString();
      const ev = await fetch(`${API}/v1/${APP}/integrations/execute`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ toolName: "GOOGLECALENDAR_EVENTS_LIST", params: { calendarId: "primary", timeMin, timeMax, singleEvents: true, orderBy: "startTime", maxResults: 5 }, userId: r.user_id }) }).then((x) => x.json()).catch(() => ({}));
      for (const e of ev?.data?.items || []) {
        const people = (e.attendees || []).filter((p: any) => !p.self).map((p: any) => p.displayName || p.email);
        if (!people.length) continue;
        const seen = await ctx.db.query("INSERT INTO routine_runs (routine_id, ref) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING ref", [r.id, String(e.id)]);
        if (!seen.rows.length) continue;
        const a = await agent(r.user_id, `${r.prompt}\nMeeting: ${e.summary || "(untitled)"} at ${e.start?.dateTime || e.start?.date}. With: ${people.join(", ")}.${e.description ? " Notes: " + String(e.description).slice(0, 400) : ""}`, r.title);
        if (a?.reply) { await push(r.user_id, `Before ${e.summary || "your meeting"}`, a.reply); ran++; }
      }
    }
    return json({ ok: true, ran });
  } catch (e: any) {
    console.error("routine_tick:", String(e));
    return json({ error: String(e) }, 500);
  }
}
