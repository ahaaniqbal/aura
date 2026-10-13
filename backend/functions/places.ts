// Find places: restaurants, cafes, shops, anything with an address. Uses Google Places (New)
// when GOOGLE_PLACES_API_KEY is set, biased to where the user is right now; otherwise falls
// back to a web search. Each restaurant comes back with ways to book: OpenTable, its own site,
// its phone number and the Google Maps page.
//
// Ops: search {q, near?: {lat, lng}, open_now?, n?, party?, when?}

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
function who(req: Request, ctx: any, body: any): string | null {
  if (ctx.user?.id) return String(ctx.user.id);
  const k = ctx.env.AURA_INTERNAL_KEY;
  if (k && req.headers.get("x-aura-internal") === k && body?.user_id) return String(body.user_id);
  return null;
}
const PRICE: Record<string, string> = { PRICE_LEVEL_INEXPENSIVE: "$", PRICE_LEVEL_MODERATE: "$$", PRICE_LEVEL_EXPENSIVE: "$$$", PRICE_LEVEL_VERY_EXPENSIVE: "$$$$" };

function bookLinks(name: string, party: number, when: string | null, site?: string, maps?: string, phone?: string) {
  const dt = when && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(when) ? `&dateTime=${encodeURIComponent(when.slice(0, 16))}` : "";
  const links: { label: string; url: string }[] = [{ label: "OpenTable", url: `https://www.opentable.com/s?term=${encodeURIComponent(name)}&covers=${party}${dt}` }];
  if (site) links.push({ label: "Website", url: site });
  if (maps) links.push({ label: "Maps", url: maps });
  if (phone) links.push({ label: "Call", url: `tel:${phone.replace(/[^\d+]/g, "")}` });
  return links;
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const body = await req.json().catch(() => ({}));
    const uid = who(req, ctx, body);
    if (!uid) return json({ error: "unauthorized" }, 401);
    const q = String(body.q || "").trim().slice(0, 200);
    if (!q) return json({ error: "q required" }, 400);
    const n = Math.max(1, Math.min(8, Number(body.n) || 5));
    const party = Math.max(1, Math.min(20, Number(body.party) || 2));
    const when = body.when ? String(body.when) : null;
    let near = body.near && Number.isFinite(Number(body.near.lat)) ? { lat: Number(body.near.lat), lng: Number(body.near.lng), name: body.near.name || null } : null;
    if (!near) {
      const cs = await ctx.db.query("SELECT location FROM context_state WHERE user_id=$1", [uid]);
      const loc = cs.rows[0]?.location;
      if (loc && Number.isFinite(Number(loc.lat))) near = { lat: Number(loc.lat), lng: Number(loc.lng), name: loc.name || null };
    }

    const KEY = ctx.env.GOOGLE_PLACES_API_KEY;
    if (KEY) {
      const req2: any = { textQuery: q, maxResultCount: n };
      if (near) req2.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: Math.min(50000, Number(body.radius_m) || 4000) } };
      if (body.open_now) req2.openNow = true;
      const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours.openNow,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.primaryTypeDisplayName,places.reservable,places.editorialSummary" },
        body: JSON.stringify(req2),
      });
      const d = await r.json();
      if (r.ok) {
        const places = (d.places || []).map((p: any) => {
          const name = p.displayName?.text || "";
          const phone = p.internationalPhoneNumber || p.nationalPhoneNumber || "";
          return {
            id: p.id, name, address: p.formattedAddress || "", kind: p.primaryTypeDisplayName?.text || "", rating: p.rating ?? null, reviews: p.userRatingCount ?? null,
            price: PRICE[p.priceLevel] || null, open_now: p.currentOpeningHours?.openNow ?? null, phone, website: p.websiteUri || null, maps_url: p.googleMapsUri || null,
            reservable: p.reservable ?? null, summary: p.editorialSummary?.text || null, links: bookLinks(name, party, when, p.websiteUri, p.googleMapsUri, phone),
          };
        });
        return json({ ok: true, provider: "google", near: near?.name || null, places });
      }
      console.warn("places api:", r.status, JSON.stringify(d).slice(0, 200));
    }

    // fallback: web search scoped to where the user is
    const { BUTTERBASE_APP_ID: APP, BUTTERBASE_API_URL: API } = ctx.env;
    const headers: any = { "Content-Type": "application/json" };
    const auth = req.headers.get("Authorization");
    if (auth) headers.Authorization = auth; else { headers["x-aura-internal"] = ctx.env.AURA_INTERNAL_KEY || ""; }
    const r = await fetch(`${API}/v1/${APP}/fn/web`, { method: "POST", headers, body: JSON.stringify({ op: "search", q: near?.name ? `${q} near ${near.name}` : q, n, user_id: uid }) });
    const d = await r.json().catch(() => ({}));
    const places = (d.results || []).map((x: any) => ({ id: x.url, name: x.title, address: x.source, kind: "", rating: null, reviews: null, price: null, open_now: null, phone: "", website: x.url, maps_url: null, reservable: null, summary: x.snippet, links: bookLinks(x.title, party, when, x.url) }));
    return json({ ok: true, provider: "web", near: near?.name || null, places });
  } catch (e: any) {
    console.error("places error:", String(e));
    return json({ error: String(e?.message || e) }, 500);
  }
}
