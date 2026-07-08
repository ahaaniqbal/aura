// Stores the user's current place and fires any place-triggered reminders on arrival, Aura's
// answer to "remind me when i'm at trader joe's". JWT-secured; matches the current venue name
// against scheduled place reminders and surfaces the ones that fit.

function json(d: any, s = 200): Response { return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }); }
function norm(s: any): string { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const userId = ctx.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const place = (body.place || "nearby").toString();
    const loc = { lat: body.lat, lng: body.lng, name: place };
    await ctx.db.query("INSERT INTO context_state (user_id, location) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET location=EXCLUDED.location, updated_at=now()", [userId, JSON.stringify(loc)]);

    // fire place-triggered reminders whose venue matches where we are now
    const surfaced: any[] = [];
    const cur = norm(place);
    if (cur && cur !== "nearby" && cur.length >= 3) {
      try {
        const rows = await ctx.db.query("SELECT id, payload FROM actions WHERE user_id=$1 AND kind='reminder' AND state='scheduled' AND payload->>'trigger'='place'", [userId]);
        for (const a of rows.rows) {
          const rp = norm(a.payload?.place);
          if (rp && rp.length >= 3 && (cur.includes(rp) || rp.includes(cur))) {
            const txt = (a.payload?.text || "you had something for here").toString();
            await ctx.db.query("INSERT INTO messages (user_id, role, content, kind) VALUES ($1,'aura',$2,'reminder')", [userId, `📍 you're at ${place}. ${txt}`]);
            await ctx.db.query("UPDATE actions SET state='fired', updated_at=now() WHERE id=$1", [a.id]);
            surfaced.push({ id: a.id, text: txt, place: a.payload?.place });
          }
        }
      } catch (e) { console.warn("place match:", String(e)); }
    }

    return json({ ok: true, location: loc, surfaced });
  } catch (e: any) { return json({ error: String(e) }, 500); }
}
