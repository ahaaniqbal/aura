// Aura's window on the internet: search and read. Uses whichever provider is configured
// (EXA_API_KEY, TAVILY_API_KEY or BRAVE_API_KEY, in that order) and falls back to DuckDuckGo's
// HTML results so search works with no key at all. Reading a page fetches it and strips it to
// text. Both refuse private and local addresses.
//
// Ops: search {q, n} | read {url}

function json(d: any, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
function who(req: Request, ctx: any, body: any): string | null {
  if (ctx.user?.id) return String(ctx.user.id);
  const k = ctx.env.AURA_INTERNAL_KEY;
  if (k && req.headers.get("x-aura-internal") === k && body?.user_id) return String(body.user_id);
  return null;
}
// Public http(s) only: no localhost, private ranges, link-local or internal names.
function publicUrl(u: string): URL | null {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:" && x.protocol !== "http:") return null;
    const h = x.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h === "0.0.0.0") return null;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(h)) return null;
    if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:")) return null;
    return x;
  } catch (_) { return null; }
}
const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (_) { return ""; } };

type Result = { title: string; url: string; snippet: string; source: string; date?: string | null };

async function search(ctx: any, q: string, n: number): Promise<{ results: Result[]; answer?: string; provider: string }> {
  const { EXA_API_KEY, TAVILY_API_KEY, BRAVE_API_KEY } = ctx.env;
  if (EXA_API_KEY) {
    const r = await fetch("https://api.exa.ai/search", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": EXA_API_KEY },
      body: JSON.stringify({ query: q, numResults: n, type: "auto", contents: { text: { maxCharacters: 700 } } }) });
    const d = await r.json();
    if (r.ok) return { provider: "exa", results: (d.results || []).map((x: any) => ({ title: x.title || host(x.url), url: x.url, snippet: String(x.text || "").replace(/\s+/g, " ").slice(0, 400), source: host(x.url), date: x.publishedDate || null })) };
  }
  if (TAVILY_API_KEY) {
    const r = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TAVILY_API_KEY}` },
      body: JSON.stringify({ query: q, max_results: n, include_answer: true }) });
    const d = await r.json();
    if (r.ok) return { provider: "tavily", answer: d.answer || undefined, results: (d.results || []).map((x: any) => ({ title: x.title, url: x.url, snippet: String(x.content || "").slice(0, 400), source: host(x.url), date: x.published_date || null })) };
  }
  if (BRAVE_API_KEY) {
    const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${n}`, { headers: { Accept: "application/json", "X-Subscription-Token": BRAVE_API_KEY } });
    const d = await r.json();
    if (r.ok) return { provider: "brave", results: (d?.web?.results || []).map((x: any) => ({ title: strip(x.title || ""), url: x.url, snippet: strip(x.description || "").slice(0, 400), source: host(x.url), date: x.age || null })) };
  }
  // no key: DuckDuckGo's HTML endpoint
  const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Aura/1.0)", Accept: "text/html" } });
  const html = await r.text();
  const out: Result[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < n) {
    let url = m[1];
    const uddg = url.match(/[?&]uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (url.startsWith("//")) url = "https:" + url;
    if (!/^https?:/.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue;
    out.push({ title: strip(m[2]), url, snippet: strip(m[3] || "").slice(0, 400), source: host(url) });
  }
  return { provider: "duckduckgo", results: out };
}

async function read(url: string): Promise<{ url: string; title: string; text: string }> {
  const u = publicUrl(url);
  if (!u) throw new Error("that address isn't a public web page");
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(u.toString(), { headers: { "User-Agent": "Mozilla/5.0 (compatible; Aura/1.0)", Accept: "text/html,text/plain,application/json" }, redirect: "follow", signal: ctrl.signal });
    const final = publicUrl(r.url || u.toString());
    if (!final) throw new Error("redirected to a private address");
    const type = r.headers.get("content-type") || "";
    const raw = (await r.text()).slice(0, 600000);
    if (!type.includes("html")) return { url: final.toString(), title: host(final.toString()), text: raw.slice(0, 9000) };
    const title = strip((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || host(final.toString()));
    const body = raw.replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n");
    return { url: final.toString(), title, text: strip(body).slice(0, 9000) };
  } finally { clearTimeout(tm); }
}

export default async function handler(req: Request, ctx: any): Promise<Response> {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const body = await req.json().catch(() => ({}));
    if (!who(req, ctx, body)) return json({ error: "unauthorized" }, 401);
    const op = String(body.op || "search");
    if (op === "search") {
      const q = String(body.q || "").trim().slice(0, 400);
      if (!q) return json({ error: "q required" }, 400);
      return json({ ok: true, ...(await search(ctx, q, Math.max(1, Math.min(10, Number(body.n) || 6)))) });
    }
    if (op === "read") return json({ ok: true, ...(await read(String(body.url || ""))) });
    return json({ error: "unknown op" }, 400);
  } catch (e: any) {
    console.error("web error:", String(e));
    return json({ error: String(e?.message || e) }, 500);
  }
}
