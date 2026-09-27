/* Iris — where to watch: which streaming services in India carry a title (JustWatch's catalogue), so the film and show
   pages can say "Netflix · Rent on Apple TV ₹129" instead of sending you off to look.

   GET /api/where?title=PK&year=2014&imdb=tt2338151&type=movie
   → { match: { title, year, url } | null, offers: [{ service, icon, url, kind: "stream"|"free"|"ads"|"rent"|"buy", price }] } */
export const config = { runtime: "edge" };

const API = "https://apis.justwatch.com/graphql";
const IMAGES = "https://images.justwatch.com";
const QUERY = `query Where($country: Country!, $language: Language!, $first: Int!, $filter: TitleFilter) {
  popularTitles(country: $country, first: $first, filter: $filter) {
    edges { node { objectType
      content(country: $country, language: $language) { title originalReleaseYear fullPath externalIds { imdbId } }
      offers(country: $country, platform: WEB) { monetizationType presentationType standardWebURL retailPrice(language: en)
        package { clearName technicalName icon(profile: S100) } }
    } }
  }
}`;

const KINDS = { FLATRATE: "stream", FREE: "free", ADS: "ads", RENT: "rent", BUY: "buy" };
const ORDER = ["stream", "free", "ads", "rent", "buy"];

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

/* One row per service and kind, best picture quality's link, cheapest price. */
export function offersOf(node) {
  const out = [];
  (node.offers || []).forEach((o) => {
    const kind = KINDS[o.monetizationType];
    const pkg = o.package || {};
    if (!kind || !pkg.clearName || !/^https:\/\//.test(o.standardWebURL || "")) return;
    const price = o.retailPrice || "";
    const cur = out.find((x) => x.service === pkg.clearName && x.kind === kind);
    if (cur) { if (price && (!cur.price || parseFloat(price.replace(/[^\d.]/g, "")) < parseFloat(cur.price.replace(/[^\d.]/g, "")))) cur.price = price; return; }
    out.push({
      service: pkg.clearName, kind, price, url: o.standardWebURL,
      icon: pkg.icon ? IMAGES + pkg.icon.replace("{format}", "webp") : "",
    });
  });
  // "Amazon Prime Video with Ads" beside "Amazon Prime Video" (or "Amazon MX Player" beside "MX Player") says nothing new.
  const kept = out.filter((o) => !out.some((p) => p !== o && p.service !== o.service && o.service.includes(p.service) &&
    ORDER.indexOf(p.kind) <= ORDER.indexOf(o.kind)));
  return kept.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

/* The search result that is this title: same IMDb id when we know it, else same name and year (±1). */
export function pick(edges, { title, year, imdb, type }) {
  const nodes = (edges || []).map((e) => e.node).filter((n) => n && n.content);
  const kind = type === "series" ? "SHOW" : "MOVIE";
  if (imdb) {
    const byId = nodes.find((n) => n.content.externalIds && n.content.externalIds.imdbId === imdb);
    if (byId) return byId;
  }
  const want = norm(title);
  return nodes.find((n) => n.objectType === kind && norm(n.content.title) === want &&
    (!year || !n.content.originalReleaseYear || Math.abs(n.content.originalReleaseYear - year) <= 1)) || null;
}

const reply = (status, body, cache) => new Response(JSON.stringify(body), {
  // Local copies of Iris ask the deployed function, so it answers other origins too (it holds nothing private).
  status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": cache },
});

export default async function handler(req) {
  const q = new URL(req.url).searchParams;
  const input = {
    title: String(q.get("title") || "").trim().slice(0, 120),
    year: Math.max(0, Math.min(2100, parseInt(q.get("year"), 10) || 0)),
    imdb: /^tt\d{5,10}$/.test(q.get("imdb") || "") ? q.get("imdb") : "",
    type: q.get("type") === "series" ? "series" : "movie",
  };
  if (!input.title) return reply(400, { error: "title required" }, "no-store");
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(API, {
      method: "POST", signal: ctrl.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { country: "IN", language: "en", first: 6, filter: { searchQuery: input.title } } }),
    }).finally(() => clearTimeout(timer));
    const d = await res.json();
    if (!res.ok || d.errors) throw new Error((d.errors && d.errors[0] && d.errors[0].message) || "JustWatch answered " + res.status);
    const node = pick(d.data && d.data.popularTitles && d.data.popularTitles.edges, input);
    const body = node
      ? { match: { title: node.content.title, year: node.content.originalReleaseYear, url: "https://www.justwatch.com" + node.content.fullPath }, offers: offersOf(node) }
      : { match: null, offers: [] };
    // Streaming catalogues change weekly, not hourly.
    return reply(200, body, "public, max-age=21600, s-maxage=86400, stale-while-revalidate=604800");
  } catch (err) {
    return reply(502, { error: String((err && err.message) || err).slice(0, 160) }, "no-store");
  }
}
