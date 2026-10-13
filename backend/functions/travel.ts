// Flights and trips. Flight search and booking go through Duffel (DUFFEL_API_KEY; test keys book
// against Duffel Airways with a fake balance, live keys book real tickets). Without a key, search
// returns a Google Flights link instead. Booking only ever runs from an approved card, and uses
// the traveler profile the user gave Aura. Trips are Aura's own: a plan per destination with days.
//
// Ops: flights {from, to, depart, return?, adults?, cabin?} | book_flight {offer_id}
//      traveler_get | traveler_set {...} | trips | trip_save {...} | trip_get {id} | trip_delete {id}

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
function who(req: Request, ctx: any, body: any): string | null {
  if (ctx.user?.id) return String(ctx.user.id);
  const k = ctx.env.AURA_INTERNAL_KEY;
  if (k && req.headers.get("x-aura-internal") === k && body?.user_id) return String(body.user_id);
  return null;
}
async function duffel(ctx: any, path: string, init: any = {}): Promise<any> {
  const r = await fetch(`https://api.duffel.com${path}`, {
    ...init, headers: { "Content-Type": "application/json", Accept: "application/json", "Duffel-Version": "v2", Authorization: `Bearer ${ctx.env.DUFFEL_API_KEY}`, ...(init.headers || {}) },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.errors?.[0]?.message || `duffel ${r.status}`);
  return d;
}
async function iata(ctx: any, place: string): Promise<string> {
  const p = String(place || "").trim();
  if (/^[A-Za-z]{3}$/.test(p)) return p.toUpperCase();
  const d = await duffel(ctx, `/places/suggestions?query=${encodeURIComponent(p)}`);
  const hit = (d.data || []).find((x: any) => x.type === "city" && x.iata_code) || (d.data || []).find((x: any) => x.iata_code);
  if (!hit) throw new Error(`couldn't find an airport for ${p}`);
  return hit.iata_code;
}
const mins = (iso: string) => { const m = String(iso || "").match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/); return m ? (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : 0; };

let ready = false; // tables are created once per warm instance
async function ensure(ctx: any) {
  await ctx.db.query(`CREATE TABLE IF NOT EXISTS trips (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, title text NOT NULL, destination text, start_date date, end_date date,
    summary text, plan jsonb DEFAULT '[]', bookings jsonb DEFAULT '[]', status text DEFAULT 'planning', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`);
  await ctx.db.query("ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS traveler jsonb");
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const body = await req.json().catch(() => ({}));
    const uid = who(req, ctx, body);
    if (!uid) return json({ error: "unauthorized" }, 401);
    if (!ready) { await ensure(ctx); ready = true; }
    const op = String(body.op || "");

    if (op === "flights") {
      const adults = Math.max(1, Math.min(9, Number(body.adults) || 1));
      const cabin = ["economy", "premium_economy", "business", "first"].includes(body.cabin) ? body.cabin : "economy";
      const depart = String(body.depart || "").slice(0, 10), ret = body.return ? String(body.return).slice(0, 10) : "";
      const gf = `https://www.google.com/travel/flights?q=${encodeURIComponent(`flights from ${body.from} to ${body.to} on ${depart}${ret ? " returning " + ret : ""}`)}`;
      if (!ctx.env.DUFFEL_API_KEY) return json({ ok: true, provider: "link", offers: [], search_url: gf });
      const from = await iata(ctx, body.from), to = await iata(ctx, body.to);
      const slices: any[] = [{ origin: from, destination: to, departure_date: depart }];
      if (ret) slices.push({ origin: to, destination: from, departure_date: ret });
      const d = await duffel(ctx, "/air/offer_requests?return_offers=true&supplier_timeout=15000", { method: "POST", body: JSON.stringify({ data: { slices, passengers: Array.from({ length: adults }, () => ({ type: "adult" })), cabin_class: cabin } }) });
      const offers = (d.data?.offers || []).sort((a: any, b: any) => Number(a.total_amount) - Number(b.total_amount)).slice(0, 6).map((o: any) => ({
        id: o.id, total: o.total_amount, currency: o.total_currency, airline: o.owner?.name, airline_code: o.owner?.iata_code, expires_at: o.expires_at,
        slices: (o.slices || []).map((s: any) => {
          const segs = s.segments || [];
          return { from: s.origin?.iata_code, to: s.destination?.iata_code, depart: segs[0]?.departing_at, arrive: segs[segs.length - 1]?.arriving_at, minutes: mins(s.duration), stops: Math.max(0, segs.length - 1), flights: segs.map((g: any) => `${g.marketing_carrier?.iata_code || ""}${g.marketing_carrier_flight_number || ""}`) };
        }),
      }));
      return json({ ok: true, provider: "duffel", from, to, offers, search_url: gf });
    }

    if (op === "book_flight") {
      if (!ctx.env.DUFFEL_API_KEY) return json({ error: "flight booking isn't connected" }, 400);
      const st = await ctx.db.query("SELECT traveler FROM user_settings WHERE user_id=$1", [uid]);
      const t = st.rows[0]?.traveler;
      const need = ["given_name", "family_name", "born_on", "gender", "email", "phone_number"].filter((k) => !t?.[k]);
      if (need.length) return json({ error: "traveler_incomplete", missing: need }, 400);
      const offer = (await duffel(ctx, `/air/offers/${encodeURIComponent(String(body.offer_id))}`)).data;
      const passengers = (offer.passengers || []).map((p: any) => ({ id: p.id, given_name: t.given_name, family_name: t.family_name, born_on: t.born_on, gender: t.gender, title: t.title || (t.gender === "f" ? "ms" : "mr"), email: t.email, phone_number: t.phone_number }));
      const order = (await duffel(ctx, "/air/orders", { method: "POST", body: JSON.stringify({ data: { type: "instant", selected_offers: [offer.id], passengers, payments: [{ type: "balance", currency: offer.total_currency, amount: offer.total_amount }] } }) })).data;
      return json({ ok: true, booking_reference: order.booking_reference, order_id: order.id, total: order.total_amount, currency: order.total_currency, live: !!order.live_mode });
    }

    if (op === "traveler_get") {
      const r = await ctx.db.query("SELECT traveler FROM user_settings WHERE user_id=$1", [uid]);
      return json({ ok: true, traveler: r.rows[0]?.traveler || null });
    }
    if (op === "traveler_set") {
      const keep = ["given_name", "family_name", "born_on", "gender", "title", "email", "phone_number", "known_traveler_number", "seat", "meal"];
      const prev = (await ctx.db.query("SELECT traveler FROM user_settings WHERE user_id=$1", [uid])).rows[0]?.traveler || {};
      const next: any = { ...prev };
      for (const k of keep) if (body[k] !== undefined && body[k] !== null) next[k] = String(body[k]).slice(0, 80);
      if (next.gender) next.gender = String(next.gender).toLowerCase().startsWith("f") ? "f" : "m";
      await ctx.db.query("INSERT INTO user_settings (user_id, traveler) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET traveler=EXCLUDED.traveler, updated_at=now()", [uid, JSON.stringify(next)]);
      return json({ ok: true, traveler: next });
    }

    if (op === "trips") {
      const r = await ctx.db.query("SELECT id, title, destination, start_date, end_date, summary, status, plan, bookings FROM trips WHERE user_id=$1 AND status <> 'deleted' ORDER BY coalesce(start_date, created_at::date) ASC LIMIT 30", [uid]);
      return json({ ok: true, trips: r.rows });
    }
    if (op === "trip_save") {
      const plan = Array.isArray(body.plan) ? body.plan.slice(0, 30) : [];
      const vals = [uid, String(body.title || body.destination || "Trip").slice(0, 120), body.destination || null, body.start_date || null, body.end_date || null, body.summary || null, JSON.stringify(plan)];
      const r = body.id
        ? await ctx.db.query("UPDATE trips SET title=$2, destination=$3, start_date=$4, end_date=$5, summary=$6, plan=$7, updated_at=now() WHERE id=$8 AND user_id=$1 RETURNING *", [...vals, body.id])
        : await ctx.db.query("INSERT INTO trips (user_id, title, destination, start_date, end_date, summary, plan) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *", vals);
      return json({ ok: true, trip: r.rows[0] });
    }
    if (op === "trip_book") {
      // attach a confirmed booking (flight, table, hotel) to a trip so the plan shows it
      await ctx.db.query("UPDATE trips SET bookings = coalesce(bookings,'[]'::jsonb) || $3::jsonb, updated_at=now() WHERE id=$1 AND user_id=$2", [body.id, uid, JSON.stringify([body.booking || {}])]);
      return json({ ok: true });
    }
    if (op === "trip_get") {
      const r = await ctx.db.query("SELECT * FROM trips WHERE id=$1 AND user_id=$2", [body.id, uid]);
      return json({ ok: true, trip: r.rows[0] || null });
    }
    if (op === "trip_delete") {
      await ctx.db.query("UPDATE trips SET status='deleted' WHERE id=$1 AND user_id=$2", [body.id, uid]);
      return json({ ok: true });
    }
    return json({ error: "unknown op" }, 400);
  } catch (e: any) {
    console.error("travel error:", String(e));
    return json({ error: String(e?.message || e) }, 500);
  }
}
