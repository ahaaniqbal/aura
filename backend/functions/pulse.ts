// Emotional pulse, Aura's read on YOU (not the people around you). A gentle record of how
// you've been, from one-tap check-ins and from moments where you mention your own state.
// Aura reflects it back with care, never clinically. JWT-secured; filters by ctx.user.id.

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function reflect(recent: { valence: number; created_at: string }[]): string {
  if (recent.length < 2) return "";
  const vals = recent.map((r) => r.valence);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const lows = vals.filter((v) => v <= -1).length;
  const lastTwoLow = vals.length >= 2 && vals[0] <= -1 && vals[1] <= -1; // entries are DESC (newest first)
  if (avg <= -0.7) return "you've been carrying a lot this week. be gentle with yourself, and tell me if i can lighten the load.";
  if (lastTwoLow) return "the last couple days have felt heavy. i'm here if you want to talk it through.";
  if (avg >= 0.9) return "you've been in a good place this week. good to see.";
  if (lows >= 2) return "a few harder days in the mix this week. worth being kind to yourself.";
  return "";
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const userId = ctx.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const op = body.op || "recent";

    if (op === "init") {
      await ctx.db.query(`CREATE TABLE IF NOT EXISTS pulse (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        valence integer NOT NULL DEFAULT 0,
        mood text,
        note text,
        source text DEFAULT 'app',
        created_at timestamptz DEFAULT now()
      )`);
      await ctx.db.query(`CREATE INDEX IF NOT EXISTS idx_pulse_user ON pulse (user_id, created_at)`);
      return json({ ok: true, init: true });
    }

    if (op === "log") {
      let v = Number(body.valence);
      if (!Number.isFinite(v)) v = 0;
      v = Math.max(-2, Math.min(2, Math.round(v)));
      const mood = (body.mood || "").toString().slice(0, 40) || null;
      const note = (body.note || "").toString().slice(0, 400) || null;
      const source = (body.source || "app").toString().slice(0, 20);
      const r = await ctx.db.query(
        "INSERT INTO pulse (user_id, valence, mood, note, source) VALUES ($1,$2,$3,$4,$5) RETURNING id, valence, mood, note, created_at",
        [userId, v, mood, note, source]
      );
      return json({ ok: true, entry: r.rows[0] });
    }

    // op recent (default): last 21 days, plus a 7-day sparkline and a gentle reflection
    const r = await ctx.db.query(
      "SELECT valence, mood, note, source, created_at FROM pulse WHERE user_id = $1 AND created_at > now() - interval '21 days' ORDER BY created_at DESC LIMIT 60",
      [userId]
    );
    const entries = r.rows || [];
    const now = Date.now();
    const recent7 = entries.filter((e: any) => now - new Date(e.created_at).getTime() < 7 * 86400000);
    // one point per day for the last 7 days (most recent entry that day wins), newest last
    const days: { day: string; valence: number | null }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      const hit = entries.find((e: any) => new Date(e.created_at).toISOString().slice(0, 10) === key);
      days.push({ day: DOW[d.getDay()], valence: hit ? hit.valence : null });
    }
    const todayKey = new Date(now).toISOString().slice(0, 10);
    const todayLogged = entries.some((e: any) => new Date(e.created_at).toISOString().slice(0, 10) === todayKey);
    const avg7 = recent7.length ? recent7.reduce((a: number, e: any) => a + e.valence, 0) / recent7.length : null;
    return json({ ok: true, entries: entries.slice(0, 14), days, todayLogged, avg7, reflection: reflect(recent7), count: entries.length });
  } catch (e: any) {
    console.error("pulse error:", String(e));
    return json({ error: String(e) }, 500);
  }
}
