/* Iris — Vega lookup, the one part of Iris that runs on a server (a Vercel function).
   Vega (vegamovito.run) is a Dooplay WordPress site strong on Hindi and Hindi-dubbed titles. Each title lists its own
   player links on several hosts, found through the site's search — and that search wants a nonce printed in its pages,
   which a browser can't read from another origin. So the lookup happens here and the player gets the links.

   GET /api/vega?title=K.G.F: Chapter 2&year=2022&imdb=tt10698680
   GET /api/vega?title=Mirzapur&imdb=tt6473300&s=3&e=4
   → { match: { id, title } | null, servers: [{ label, url }], downloads: [{ label, url }] }
   GET /api/vega?q=awarapan   (search, for Iris's search box)
   → { results: [{ post, title, year, lang, region, dubbed, poster }] } */
// Edge, not Node: Vega's Cloudflare answers 403 to Vercel's Node functions (AWS addresses) but lets the Edge network in.
export const config = { runtime: "edge" };

const SITE = "https://vegamovito.run";
const UA = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36";
const NONCE_TTL = 2 * 3600e3; // WordPress nonces live 12–24 h
const BUDGET = 8000; // stop trying further candidates after this, well inside Vercel's limits

let nonce = { value: "", at: 0 };

function get(url, json) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  const headers = { "user-agent": UA, accept: json ? "application/json" : "text/html" };
  if (json) headers["x-requested-with"] = "XMLHttpRequest";
  return fetch(url, { signal: ctrl.signal, headers })
    .then((res) => {
      if (!res.ok) throw new Error(url.replace(SITE, "") + " → HTTP " + res.status);
      return res.text();
    })
    .finally(() => clearTimeout(timer));
}

async function searchNonce(fresh) {
  if (!fresh && nonce.value && Date.now() - nonce.at < NONCE_TTL) return nonce.value;
  const html = await get(SITE + "/");
  const m = html.match(/dtGonza\s*=\s*\{[^}]*?"nonce"\s*:\s*"(\w+)"/);
  if (!m) throw new Error("no search nonce on Vega's home page");
  nonce = { value: m[1], at: Date.now() };
  return nonce.value;
}

const decode = (s) => String(s || "")
  .replace(/<[^>]*>/g, "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
  .replace(/\s+/g, " ").trim();

/* "KGF Chapter 2 (2022) Hindi Dubbed" → name, year; "Bigg Boss Part-2 (2025) Hindi Season 19 Complete" → season 19. */
function parseTitle(raw) {
  const title = decode(raw);
  const m = title.match(/^(.*?)\s*\((\d{4})\)/);
  const season = title.match(/\bseason\s*0*(\d{1,3})\b/i);
  return {
    title,
    name: (m ? m[1] : title).replace(/\s*part[\s-]*\d+$/i, ""),
    year: m ? +m[2] : 0,
    season: season ? +season[1] : 0,
    daily: /\bS\d+\s*E\d+\b/i.test(title), // one post per daily episode (Bigg Boss) — not something we can map
  };
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/[.'’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/* 1 for the same name, else the share of words in common (Dice). "Pushpa: The Rise" vs "Pushpa: The Rise - Part 1" = 0.75. */
function similar(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = new Set(x.split(" "));
  const B = new Set(y.split(" "));
  let common = 0;
  A.forEach((w) => { if (B.has(w)) common++; });
  return (2 * common) / (A.size + B.size);
}

async function search(keyword) {
  const url = (n) => SITE + "/wp-json/dooplay/search/?keyword=" + encodeURIComponent(keyword) + "&nonce=" + n;
  let text = await get(url(await searchNonce()), true);
  if (/no_verify_nonce/.test(text)) text = await get(url(await searchNonce(true)), true);
  const data = JSON.parse(text);
  if (!data || data.error) return [];
  // Object keys that look like numbers iterate in numeric order; read the ids off the text to keep relevance order.
  const ids = [...text.matchAll(/"(\d+)"\s*:\s*\{/g)].map((m) => m[1]).filter((id) => data[id]);
  return ids.map((id) => Object.assign({ id: +id, url: String(data[id].url || ""), img: String(data[id].img || "") }, parseTitle(data[id].title)));
}

/* Search matches every word anywhere in a post, and Vega writes "KGF" and "K.G.F" in different posts — so try a few spellings. */
function queries(title, s) {
  const base = String(title).replace(/['’]/g, " ").replace(/[^\p{L}\p{N}.]+/gu, " ").replace(/\s+/g, " ").trim();
  const bare = base.replace(/\./g, "");
  const words = bare.split(" ").filter((w) => w.length > 1 && !/^(the|a|an|of|and)$/i.test(w));
  const list = [bare, base, words.length > 2 ? words.slice(0, 2).join(" ") : ""];
  return [...new Set(list.filter(Boolean))].map((q) => (s ? q + " season " + s : q));
}

function playerOptions(html) {
  const out = [];
  const re = /<li\b[^>]*\bid=["']player-option-([\w-]+)["'][^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] === "trailer") continue;
    const attr = (name) => (m[0].match(new RegExp("data-" + name + "=[\"']([\\w-]+)[\"']")) || [])[1];
    out.push({
      nume: attr("nume") || m[1],
      type: attr("type") || "movie",
      label: decode((m[2].match(/<span class=["']title["']>([\s\S]*?)<\/span>/) || [])[1]),
    });
  }
  return out;
}

/* The post's own download buttons ("Download 1080p HD", "Download Malayalam", "EP-3"), which open the host's download
   page — the rest of the way (including its "are you human" check) happens in the viewer's browser. Labels are the
   button's words; one page behind several buttons is listed once ("1080p · 720p"), and two pages with the same words
   are told apart ("1080p HD", "1080p HD · 2"). For an episode, a season post's per-episode buttons narrow to that
   episode. [{ label, url }] */
const SOCIAL = /^https:\/\/(?:[\w-]+\.)*(?:t\.me|telegram\.\w+|facebook\.com|twitter\.com|x\.com|whatsapp\.com|instagram\.com)\//;
const EP_NO = /\b(?:ep(?:isode)?|e)[\s.-]*0*(\d{1,4})\b/i;
function downloadLinks(html, episode) {
  const byUrl = new Map();
  const re = /<a\b[^>]*?href=["']\s*([^"']+?)\s*["'][^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || "")))) {
    if (!/download-button|\bdownload\b|\bEP[\s.-]*\d/i.test(m[2])) continue;
    const url = cleanUrl(m[1]);
    if (!url || url.startsWith(SITE) || SOCIAL.test(url)) continue;
    let label = decode(m[2]).replace(/\bdownload(?: now)?\b/ig, "").replace(/[[\]|:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
    if (/^watch\b|watch online/i.test(label)) continue; // a player link dressed as a button
    if (/^multiples?$/i.test(label)) label = "All episodes";
    if (!byUrl.has(url)) byUrl.set(url, []);
    const labels = byUrl.get(url);
    if (labels.indexOf(label) === -1) labels.push(label);
  }
  let list = [...byUrl].map(([url, labels]) => ({ label: labels.filter(Boolean).join(" · ") || "Download", url }));
  if (episode) {
    const numbered = list.filter((d) => EP_NO.test(d.label));
    if (numbered.length) list = list.filter((d) => (EP_NO.test(d.label) ? +d.label.match(EP_NO)[1] === episode : !/\bbonus\b/i.test(d.label)));
  }
  const seen = {};
  return list.slice(0, 12).map((d) => {
    seen[d.label] = (seen[d.label] || 0) + 1;
    return seen[d.label] > 1 ? { label: d.label + " · " + seen[d.label], url: d.url } : d;
  });
}

/* Vega's links come with stray spaces, "//host" and "host//embed//tt…"; anything but a clean https link is dropped. */
function cleanUrl(raw) {
  let url = String(raw || "").trim();
  if (url.startsWith("//")) url = "https:" + url;
  const parts = url.match(/^(https:\/\/[^/?#]+)([^?#]*)(.*)$/);
  if (parts) url = parts[1] + parts[2].replace(/\/{2,}/g, "/") + parts[3];
  return /^https:\/\/[^\s"'<>]+$/.test(url) && !RETIRED.test(url) ? url : "";
}

/* A show-wide VidSrc-style player (https://host/embed/tt…) pointed at one episode; "" for anything else. */
function episodeLink(url, s, e) {
  const m = String(url).match(/^(https:\/\/[^/]+)\/embed\/(tt\d+)\/?$/);
  return m ? m[1] + "/embed/tv?imdb=" + m[2] + "&season=" + s + "&episode=" + e : "";
}

function embed(post, opt) {
  return get(SITE + "/wp-json/dooplayer/v2/" + post + "/" + opt.type + "/" + opt.nume, true)
    .then((text) => cleanUrl(JSON.parse(text).embed_url))
    .catch(() => "");
}

/* Vega's "Ultra Stream V2" host plays one placeholder for every video and then says it's unavailable, while Vega moves
   videos to V3 (a VidSrc-style player that takes an IMDb id). Upgraded posts get new links, so V2 ones are skipped. */
const RETIRED = /^https:\/\/(?:[\w-]+\.)*molop\.art\//;

/* Drops a link only when its page plainly says the video is gone (a dead MixDrop link: "We can't find the video") or
   the host is down for everyone. Players that fetch the video by script, hosts that refuse us, timeouts: all kept. */
const GONE = /can.?t find the video|video (?:is )?not found|file (?:was )?(?:deleted|removed|not found)|video (?:has been )?(?:deleted|removed)/i;
function gone(url) {
  if (url.includes("#")) return Promise.resolve(false);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  return fetch(url, { signal: ctrl.signal, headers: { "user-agent": UA, referer: SITE + "/" } })
    // 404/410, or Cloudflare saying the host behind it is down or gone (521–523, 530).
    .then((res) => (/^(404|410|52[123]|530)$/.test(String(res.status)) ? true : res.text().then((t) => GONE.test(t.slice(0, 100000)))))
    .catch(() => false)
    .finally(() => clearTimeout(timer));
}

const episodeOf = (label) => { const m = label.match(/\bepisode[\s-]*0*(\d+)\b/i); return m ? +m[1] : 0; };

async function lookup({ title, year, imdb, s, e }) {
  const t0 = Date.now();
  const tv = s > 0;
  const seen = new Set();
  for (const q of queries(title, s)) {
    if (Date.now() - t0 > BUDGET) break;
    const found = await search(q);
    const candidates = found
      .filter((r) => !seen.has(r.id) && r.url.startsWith(SITE + "/") && !r.daily)
      .map((r) => Object.assign(r, { score: similar(r.name, title) }))
      .filter((r) => r.score >= 0.75 && (tv
        ? r.season === s
        : !r.season && (!year || !r.year || Math.abs(r.year - year) <= 1)))
      .sort((a, b) => b.score - a.score || (b.year === year) - (a.year === year));
    for (const c of candidates) {
      if (Date.now() - t0 > BUDGET) break;
      seen.add(c.id);
      const html = await get(c.url);
      const options = playerOptions(html);
      // "Super Player" and "Ultra Stream" carry the IMDb id: fetched to check the match, and for shows Ultra Stream's
      // show-wide player is pointed at the episode.
      const checks = options.filter((o) => /super|ultra/i.test(o.label));
      const wanted = tv ? options.filter((o) => episodeOf(o.label) === e) : options.filter((o) => !episodeOf(o.label));
      if (!wanted.length && !(tv && checks.length)) continue;
      const list = [...new Set(wanted.concat(checks))];
      const urls = await Promise.all(list.map((o) => embed(c.id, o)));
      const tts = urls.map((u) => (u.match(/\btt\d{6,}\b/) || [])[0]).filter(Boolean);
      if (imdb && tts.length && tts.indexOf(imdb) === -1) continue; // a different film with the same name
      const servers = [];
      const add = (label, url) => { if (!servers.some((x) => x.url === url)) servers.push({ label, url }); };
      list.forEach((o, i) => {
        const url = urls[i];
        if (!url || /\/play\/tt\d+/.test(url)) return; // /play/tt… is the Vega server Iris already has
        if (wanted.indexOf(o) !== -1) { add(o.label, url); return; }
        const episode = tv && episodeLink(url, s, e);
        if (episode) add(o.label, episode);
      });
      const dead = await Promise.all(servers.map((x) => gone(x.url)));
      const live = servers.filter((x, i) => !dead[i]);
      if (live.length) return { match: { id: c.id, title: c.title }, servers: live, downloads: downloadLinks(html, tv ? e : 0) };
    }
  }
  return { match: null, servers: [], downloads: [] };
}

/* ---------- Vega Hot (vega-hot.com): a second place for download pages ----------
   A DataLife Engine site with titles Vega doesn't keep (older seasons, some shows). Its search is a plain GET; each
   post lists downloads either as "Download 720p … 1.6GB" links or as a quality heading ("720p x265 HEVC") above a
   "Click Here To Download [780MB]" button. Only its download pages are used (its player is Vega's Super Player). */
const HOT = "https://vega-hot.com";

function hotGet(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  return fetch(url, { signal: ctrl.signal, headers: { "user-agent": UA, accept: "text/html" } })
    .then((res) => { if (!res.ok) throw new Error("vega-hot → HTTP " + res.status); return res.text(); })
    .finally(() => clearTimeout(timer));
}

/* "Mirzapur (2018) S01 (2018) Hindi Web Series [Complete]" → Mirzapur, 2018, season 1;
   "The Vvaan: Force of the Forrest 2026 Hindi …" → The Vvaan: Force of the Forrest, 2026. */
function parseHot(raw) {
  const title = decode(raw);
  const paren = /\((19\d{2}|20\d{2})\)/.exec(title);
  const bare = paren ? null : /(?!^)\b(19\d{2}|20\d{2})\b/.exec(title);
  const y = paren || bare;
  const name = (y ? title.slice(0, y.index) : title).replace(/[\s–—:|-]+$/, "").trim();
  const sm = title.match(/\bseason\s*0*(\d{1,3})\b|\bS0*(\d{1,3})\b(?!\s*E\d)/i);
  return { title, name, year: y ? +y[1] : 0, season: sm ? +(sm[1] || sm[2]) : 0 };
}

async function hotSearch(q) {
  const html = await hotGet(HOT + "/index.php?do=search&subaction=search&story=" + encodeURIComponent(q));
  const out = [];
  const re = /class="entry-title[^"]*"[^>]*>\s*<a href="(https:\/\/vega-hot\.com\/[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) out.push(Object.assign({ url: m[1] }, parseHot(m[2])));
  return out;
}

const QUALITY = /\b(2160p|4k|1080p|720p|480p|360p)\b/i;
const SIZE = /\b(\d+(?:\.\d+)?\s?(?:MB|GB))\b/i;
const IMAGE = /\.(?:jpe?g|png|webp|gif)(?:[?#]|$)|blogspot\.com|googleusercontent\.com/i;

/* A post's download pages, labelled "720p x265 HEVC · 780MB" (heading + size) or "720p · 1.6GB" (from the link). */
function hotDownloads(html, episode) {
  const src = String(html || "");
  const start = src.search(/download-links-div|==\s*Download|Download Links/i);
  if (start === -1) return [];
  const endAt = src.slice(start).search(/Winding Up|class="entry-footer|<\/article>/i);
  const block = src.slice(start, endAt === -1 ? start + 60000 : start + endAt);
  // Headings that label what follows (ones without a link inside).
  const heads = [];
  const hre = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g;
  let h;
  while ((h = hre.exec(block))) if (!/<a\b/i.test(h[1])) heads.push({ at: h.index, text: decode(h[1]) });
  const list = [];
  const are = /<a\b[^>]*?href=["']\s*([^"']+?)\s*["'][^>]*>([\s\S]*?)<\/a>/g;
  let a;
  while ((a = are.exec(block))) {
    const url = cleanUrl(a[1]);
    if (!url || url.startsWith(HOT) || url.startsWith(SITE) || IMAGE.test(url) || SOCIAL.test(url)) continue;
    const text = decode(a[2]);
    if (!/download|\bEP[\s.-]*\d|episode/i.test(text + " " + a[2])) continue;
    const before = heads.filter((x) => x.at < a.index);
    const near = before[before.length - 1];
    const qHead = before.filter((x) => QUALITY.test(x.text)).pop();
    const headText = qHead ? qHead.text.replace(/[^\w\s.+-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 30) : "";
    const q = (text.match(QUALITY) || [])[1] || headText;
    const size = (text.match(SIZE) || (near && near.text.match(SIZE)) || [])[1] || "";
    const ep = (text.match(EP_NO) || (near && near.text.match(EP_NO)) || [])[0] || "";
    const label = [ep && ep.replace(/\s+/g, " ").toUpperCase(), q || (size ? "Download" : ""), size.replace(/\s+/g, "")].filter(Boolean).join(" · ") ||
      text.replace(/click here to|download(?: now)?/ig, "").replace(/[[\]|:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || "Download";
    if (!list.some((d) => d.url === url)) list.push({ label, url });
  }
  if (episode) {
    const numbered = list.filter((d) => EP_NO.test(d.label));
    if (numbered.length) return list.filter((d) => (EP_NO.test(d.label) ? +d.label.match(EP_NO)[1] === episode : true));
  }
  return list.slice(0, 12);
}

/* A title's download pages on Vega Hot: the best-matching post (same name, year within one for films, same season for
   shows). Two-letter titles are searched with their year, since the site ignores very short searches. */
async function hotLookup({ title, year, s, e }) {
  const tv = s > 0;
  const q = title.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  const hits = await hotSearch(q.length < 3 && year ? q + " " + year : q);
  const best = hits
    .map((r) => Object.assign(r, { score: similar(r.name, title) }))
    .filter((r) => r.score >= 0.75 && (tv ? r.season === s : !r.season && (!year || !r.year || Math.abs(r.year - year) <= 1)))
    .sort((a, b) => b.score - a.score || (b.year === year) - (a.year === year))[0];
  if (!best) return [];
  const list = hotDownloads(await hotGet(best.url), tv ? e : 0);
  // A season still airing ("[EP-20 Added]") only has its latest episodes: unless a link names this episode, its pages
  // may be for another one, so none are offered.
  if (tv && /\b(?:EP|Episode)[\s.-]*\d+\s*Added\b/i.test(best.title) && !list.some((d) => EP_NO.test(d.label))) return [];
  return list;
}

/* Vega's language tag after the year: "Hindi" (a Hindi film), "Hindi Dubbed", "Punjabi HD"… */
const INDIAN = /\b(Tamil|Telugu|Malayalam|Kannada|Marathi|Bengali|Punjabi|Gujarati)\b/;
function language(title) {
  const rest = (title.match(/\(\d{4}\)\s*(.*)$/) || [])[1] || "";
  if (/dubbed/i.test(rest)) return { lang: "", dubbed: true };
  const regional = rest.match(INDIAN);
  if (regional) return { lang: "OtherIndian", region: regional[1] };
  return /\bHindi\b/.test(rest) ? { lang: "Hindi" } : { lang: "" };
}

/* Vega names most uploads after their TMDB poster ("52G8MV…-90x135.jpg"): TMDB's own server has that poster at full
   size; otherwise the upload without its thumbnail size. */
function posterOf(img) {
  const m = String(img).match(/\/([A-Za-z0-9]{24,32})(?:-[\dx]+)*\.(jpg|jpeg|png|webp)$/); // "…ZlsU0-1-200x300-1-90x135.jpg"
  if (m) return "https://image.tmdb.org/t/p/w342/" + m[1] + "." + m[2];
  return /^https:\/\//.test(img) ? img.replace(/-\d+x\d+(?=\.\w+$)/, "") : "";
}

/* Search mode, for Iris's search box: Vega's titles for a query, films only (seasons and daily episodes are reached
   through Iris's own shows). [{ post, title, year, lang, region, dubbed, poster }] */
async function find(query) {
  const hits = await search(query);
  return hits.filter((h) => !h.season && !h.daily && h.year).slice(0, 8).map((h) => Object.assign(
    { post: h.id, title: h.name.replace(/\s+/g, " ").trim(), year: h.year, poster: posterOf(h.img) }, language(h.title)));
}

export default async function handler(req) {
  const q = new URL(req.url).searchParams;
  const int = (k, max) => { const n = parseInt(q.get(k), 10); return n > 0 && n <= max ? n : 0; };
  const input = {
    title: String(q.get("title") || "").trim().slice(0, 120),
    year: int("year", 2100),
    imdb: /^tt\d{5,10}$/.test(q.get("imdb") || "") ? q.get("imdb") : "",
    s: int("s", 999),
    e: int("e", 9999),
  };
  const reply = (status, body, cache) => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": cache },
  });
  const query = String(q.get("q") || "").trim().slice(0, 80);
  if (query) {
    if (query.length < 3) return reply(200, { results: [] }, "public, max-age=3600, s-maxage=86400");
    try {
      return reply(200, { results: await find(query) }, "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400");
    } catch (err) {
      return reply(502, { error: String((err && err.message) || err) }, "no-store");
    }
  }
  if (!input.title || (input.s && !input.e)) return reply(400, { error: "title (and e with s) required" }, "no-store");
  try {
    // Vega's players and downloads, and Vega Hot's downloads, looked up side by side.
    const [vega, hot] = await Promise.all([
      lookup(input).catch((err) => ({ match: null, servers: [], downloads: [], error: String((err && err.message) || err) })),
      hotLookup(input).catch(() => []),
    ]);
    const downloads = vega.downloads.slice();
    hot.forEach((d) => { if (downloads.length < 16 && !downloads.some((x) => x.url === d.url)) downloads.push(d); });
    const out = Object.assign({}, vega, { downloads });
    // Links rarely change once posted; a miss is re-checked sooner so new uploads show up.
    return reply(200, out, out.servers.length || out.downloads.length
      ? "public, max-age=3600, s-maxage=43200, stale-while-revalidate=172800"
      : "public, max-age=600, s-maxage=21600");
  } catch (err) {
    return reply(502, { error: String((err && err.message) || err) }, "no-store");
  }
}

// For tests/vega.test.mjs.
export { parseTitle, similar, queries, playerOptions, episodeOf, cleanUrl, episodeLink, GONE, RETIRED, language, posterOf, downloadLinks, parseHot, hotDownloads };
