/* Sakura — Zoro TV lookup (a Vercel function), the anime counterpart of api/vega.js.
   Zoro TV (zorotv.com.in) is a WordPress anime site: a page per series (/anime/<slug>/) and a page per episode
   (/<slug>-episode-<n>/) whose players are listed as base64 <iframe> snippets, sub and dub. A browser can't read those
   pages from another origin, so the lookup happens here and Sakura's player gets the links.

   GET /api/anime?slug=naruto&ep=1  → { servers: [{ label, type: "sub" | "dub", url }] }
   GET /api/anime?slug=naruto       → { title, alt, status, type, genres, poster, synopsis, episodes: [1, 2, …] }
   GET /api/anime?q=frieren         → { results: [{ slug, title, type, eps, poster }] }
   GET /api/anime?latest=1          → { results: [{ slug, title, type, ep, poster }] }   newest episodes on the site */
export const config = { runtime: "edge" };

const SITE = "https://zorotv.com.in";
const UA = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36";
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

function get(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  return fetch(SITE + path, { signal: ctrl.signal, headers: { "user-agent": UA, accept: "text/html" } })
    .then(async (res) => {
      if (res.status === 404) return "";
      const text = await res.text();
      if (/<title>Just a moment/i.test(text)) throw new Error("Zoro TV is showing a Cloudflare check");
      if (!res.ok) throw new Error(path + " → HTTP " + res.status);
      return text;
    })
    .finally(() => clearTimeout(timer));
}

const decode = (s) => String(s || "")
  .replace(/<[^>]*>/g, "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim();

const b64 = (s) => {
  try { return typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("binary"); } catch (e) { return ""; }
};

/* The site's poster cards: <article class="bs"> with a link to a series (/anime/<slug>/) or an episode
   (/<slug>-episode-<n>/), a type badge, "Ep 24" (or the status) and a poster. */
function cards(html) {
  const out = [];
  const re = /<article class="bs"[\s\S]*?<\/article>/g;
  let m;
  while ((m = re.exec(html))) {
    const a = m[0];
    const href = (a.match(/<a href="([^"]+)"/) || [])[1] || "";
    const series = href.match(/\/anime\/([a-z0-9-]+)\/?$/);
    const episode = href.match(/\/([a-z0-9-]+?)-episode-(\d+)\/?$/);
    if (!series && !episode) continue;
    const title = decode((a.match(/<a [^>]*title="([^"]*)"/) || [])[1]);
    const epx = decode((a.match(/<span class="epx">([\s\S]*?)<\/span>/) || [])[1]);
    const card = {
      slug: series ? series[1] : episode[1],
      title: episode ? title.replace(/\s+Episode\s+\d+\s*$/i, "") : title,
      type: decode((a.match(/<div class="typez ([^"]*)"/) || [])[1]) || "",
      poster: (a.match(/<img [^>]*src="(https:\/\/[^"]+)"/) || [])[1] || "",
    };
    if (episode) card.ep = +episode[2];
    else card.eps = +((epx.match(/^Ep\s*(\d+)/i) || [])[1] || 0);
    if (card.title) out.push(card);
  }
  return out;
}

/* An episode page's players: "HD-SUB" / "HD-DUB" buttons, each a base64 <iframe>. */
function servers(html) {
  const out = [];
  const seen = new Set();
  const re = /data-hash="([A-Za-z0-9+/=]+)"[^>]*>([^<]*)</g;
  let m;
  while ((m = re.exec(html))) {
    const src = (b64(m[1]).match(/src=["'](https:\/\/[^"']+)["']/i) || [])[1];
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const label = decode(m[2]) || "Server";
    out.push({ label, type: /\bdub\b|-dub\b/i.test(label) || /[?&]type=dub\b|\/dub\/?$/i.test(src) ? "dub" : "sub", url: src.replace(/&amp;/g, "&") });
  }
  // Pages that only carry the player itself (no server buttons).
  if (!out.length) {
    const src = (html.match(/id="pembed"[^>]*>\s*<iframe[^>]*src="(https:\/\/[^"]+)"/) || [])[1];
    if (src) out.push({ label: "HD-SUB", type: /[?&]type=dub\b/.test(src) ? "dub" : "sub", url: src.replace(/&amp;/g, "&") });
  }
  return out;
}

/* A series page: facts and the episode numbers it has pages for (and their links). */
function series(html) {
  const spe = (label) => decode((html.match(new RegExp("<b>" + label + ":</b>([\\s\\S]*?)</span>")) || [])[1]);
  const eps = new Map();
  const re = /<a href="(https:\/\/zorotv\.com\.in\/[^"]+)" class="item ep-item[^"]*" data-number="(\d+)"/g;
  let m;
  while ((m = re.exec(html))) if (!eps.has(+m[2])) eps.set(+m[2], m[1]);
  return {
    title: decode((html.match(/<h1 class="entry-title"[^>]*>([\s\S]*?)<\/h1>/) || [])[1]),
    alt: decode((html.match(/<span class="alter">([\s\S]*?)<\/span>/) || [])[1]),
    status: spe("Status"),
    type: spe("Type"),
    released: spe("Released"),
    genres: [...((html.match(/<div class="genxed">([\s\S]*?)<\/div>/) || [])[1] || "").matchAll(/rel="tag">([^<]+)</g)].map((x) => decode(x[1])),
    poster: (html.match(/<div class="thumb"[^>]*>\s*<img[^>]*src="(https:\/\/[^"]+)"/) || [])[1] || "",
    synopsis: decode((html.match(/<div class="entry-content"[^>]*>([\s\S]*?)<\/div>/) || [])[1]),
    links: eps,
    episodes: [...eps.keys()].sort((a, b) => a - b),
  };
}

/* "Latest Release" on the home page: the newest episodes. */
function latest(html) {
  const i = html.search(/<h[23][^>]*>\s*Latest Release/i);
  if (i === -1) return [];
  const rest = html.slice(i);
  const next = rest.indexOf('<div class="releases', 40); // the section after it
  return cards(next > 0 ? rest.slice(0, next) : rest).filter((c) => c.ep);
}

async function episodeServers(slug, ep) {
  let list = servers(await get("/" + slug + "-episode-" + ep + "/"));
  if (list.length) return list;
  // Some episode pages don't follow the pattern: find the link on the series page.
  const info = series(await get("/anime/" + slug + "/"));
  const link = info.links.get(ep);
  if (!link) return [];
  list = servers(await get(link.replace(SITE, "")));
  return list;
}

const reply = (status, body, cache) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": cache || "no-store" },
});

export default async function handler(req) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const slug = (p.get("slug") || "").toLowerCase();
  try {
    if (p.has("latest")) {
      return reply(200, { results: latest(await get("/")).slice(0, 30) }, "public, max-age=600, s-maxage=900, stale-while-revalidate=3600");
    }
    if (p.has("q")) {
      const q = (p.get("q") || "").trim().slice(0, 80);
      if (q.length < 2) return reply(200, { results: [] }, "public, max-age=3600");
      const found = cards(await get("/?s=" + encodeURIComponent(q))).filter((c) => !c.ep).slice(0, 24);
      return reply(200, { results: found }, "public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400");
    }
    if (!SLUG.test(slug)) return reply(400, { error: "bad-slug" });
    if (p.has("ep")) {
      const ep = +p.get("ep");
      if (!Number.isInteger(ep) || ep < 0 || ep > 5000) return reply(400, { error: "bad-episode" });
      const list = await episodeServers(slug, ep);
      return reply(200, { servers: list }, list.length ? "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400" : "public, max-age=300, s-maxage=900");
    }
    const html = await get("/anime/" + slug + "/");
    if (!html) return reply(404, { error: "not-found" }, "public, max-age=600, s-maxage=3600");
    const info = series(html);
    delete info.links;
    return reply(200, info, "public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400");
  } catch (err) {
    return reply(502, { error: "zoro", detail: String((err && err.message) || err).slice(0, 160) });
  }
}

export { cards, servers, series, latest, decode };
