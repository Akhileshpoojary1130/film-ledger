// Builds data/vega.js: Vega's catalogue (Hindi dubbed, web series, Bollywood, Hollywood, South and Punjabi), trimmed to
// what Iris doesn't already have. Films the bundle has are kept only as a "dubbed" mark; new films and web series come
// with name, year, language, IMDb rating, runtime, genres and poster. Web series get their IMDb id from Cinemeta, so
// their show pages list episodes.
//   node tools/build-vega.mjs        (about five minutes: one page at a time, gently, so Vega isn't hammered)
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { parseTitle, language, posterOf, similar } from "../api/vega.js";

const SITE = "https://vegamovito.run";
const UA = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36";
const CATEGORIES = [
  ["hindi-dubbed", { dub: true }], ["web-series", { series: true }], ["bollywood", { lang: "Hindi" }], ["hollywood", { lang: "English" }],
  ["telugu", { lang: "OtherIndian", region: "Telugu" }], ["tamil", { lang: "OtherIndian", region: "Tamil" }],
  ["punjabi", { lang: "OtherIndian", region: "Punjabi" }],
];
const PAUSE = 1200;
const LIMIT = +process.env.PAGES || Infinity; // PAGES=1 for a quick trial run
const OUT = process.env.OUT || "../data/vega.js";
const LANG_CODE = { Hindi: "h", English: "e", OtherIndian: "r", Global: "g" };
// Vega's tags mix genres with languages and platforms ("Hotstar", "Amzn Prime"); only real genres are kept.
const REAL_GENRES = new Set(["Action", "Adventure", "Animation", "Biography", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy",
  "History", "Horror", "Music", "Musical", "Mystery", "Romance", "Sci-Fi", "Science Fiction", "Sport", "Thriller", "War", "Western", "Reality"]);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tmdbKey = (url) => (String(url).match(/^https:\/\/image\.tmdb\.org\/t\/p\/w342\/([A-Za-z0-9]+)\.jpg$/) || [])[1] || "";
const decode = (s) => String(s || "").replace(/<[^>]*>/g, "").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/\s+/g, " ").trim();
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")
  .replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

async function page(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
    const text = await res.text();
    if (/<title>Just a moment/i.test(text)) throw new Error("Vega is showing a Cloudflare check; stopping (not going around it).");
    if (res.ok) return text;
    if (res.status === 404) return "";
    if (attempt >= 3) throw new Error(url + " → HTTP " + res.status);
    await wait(4000 * attempt);
  }
}

/* One archive page's items: Dooplay's <article class="item movies|tvshows"> cards. */
function items(html) {
  const out = [];
  const re = /<article id="post-(\d+)" class="item (movies|tvshows)">([\s\S]*?)<\/article>/g;
  let m;
  while ((m = re.exec(html))) {
    const body = m[3];
    const title = decode((body.match(/<h3><a [^>]*>([\s\S]*?)<\/a>/) || [])[1]);
    if (!title) continue;
    const img = (body.match(/<img src="([^"]+)"/) || [])[1] || "";
    const meta = (body.match(/<div class="metadata">([\s\S]*?)<\/div>/) || [])[1] || "";
    const spans = [...meta.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((x) => decode(x[1]));
    const imdb = parseFloat((spans.find((x) => /^IMDb/.test(x)) || "").replace(/[^\d.]/g, "")) || parseFloat(decode((body.match(/<div class="rating">([\s\S]*?)<\/div>/) || [])[1])) || 0;
    const runtime = parseInt((spans.find((x) => /min$/.test(x)) || ""), 10) || 0;
    const views = parseInt((spans.find((x) => /views$/.test(x)) || "").replace(/\D/g, ""), 10) || 0;
    const genres = [...(body.match(/<div class="mta">([\s\S]*?)<\/div>/) || ["", ""])[1].matchAll(/rel="tag">([^<]+)</g)]
      .map((x) => decode(x[1])).map((g) => (g === "Science Fiction" ? "Sci-Fi" : g)).filter((g) => REAL_GENRES.has(g));
    out.push({ post: +m[1], kind: m[2], title, poster: posterOf(img), imdb, runtime, views, genres });
  }
  return out;
}

async function crawl() {
  const byPost = new Map();
  for (const [slug, facts] of CATEGORIES) {
    const first = await page(SITE + "/genre/" + slug + "/");
    const pages = Math.min(LIMIT, +((first.match(/Page 1 of (\d+)/) || [])[1] || 1));
    process.stdout.write(slug + ": " + pages + " pages ");
    for (let p = 1; p <= pages; p++) {
      const html = p === 1 ? first : await page(SITE + "/genre/" + slug + "/page/" + p + "/");
      items(html).forEach((it) => {
        const cur = byPost.get(it.post) || Object.assign(it, { facts: {} });
        Object.assign(cur.facts, facts);
        byPost.set(it.post, cur);
      });
      process.stdout.write(".");
      await wait(PAUSE);
    }
    process.stdout.write("\n");
  }
  return [...byPost.values()];
}

/* Titles the bundle already has, by normalised name → years. */
function bundleIndex() {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(new URL("../data/catalogue.js", import.meta.url), "utf8"), ctx);
  const index = new Map();
  const movies = ctx.window.FILM_STATIC_CATALOGUE.movies;
  Object.keys(movies).forEach((year) => Object.keys(movies[year]).forEach((lang) => movies[year][lang].forEach((row) => {
    const k = norm(row[0]);
    if (!index.has(k)) index.set(k, []);
    index.get(k).push(+year);
  })));
  return index;
}

async function cinemetaSeries(name, year) {
  try {
    const res = await fetch("https://v3-cinemeta.strem.io/catalog/series/top/search=" + encodeURIComponent(name) + ".json");
    const metas = ((await res.json()) || {}).metas || [];
    const hit = metas.find((m) => similar(m.name, name) >= 0.85 && (!year || !parseInt(m.releaseInfo, 10) || Math.abs(parseInt(m.releaseInfo, 10) - year) <= 3));
    return hit ? { tt: hit.imdb_id || hit.id, name: hit.name, year: parseInt(hit.releaseInfo, 10) || year } : null;
  } catch (e) { return null; }
}

const all = await crawl();
console.log(all.length + " posts");
const bundle = bundleIndex();
const GENRES = [];
const g = (name) => { let i = GENRES.indexOf(name); if (i === -1) { GENRES.push(name); i = GENRES.length - 1; } return i; };
const known = (name, year) => (bundle.get(norm(name)) || []).some((y) => !year || Math.abs(y - year) <= 1);

const films = [];
const dubs = [];
const showsByName = new Map();
all.sort((a, b) => b.post - a.post).forEach((it) => {
  const t = parseTitle(it.title);
  const tag = language(it.title);
  const series = it.facts.series || it.kind === "tvshows" || t.season > 0;
  const dub = !!(it.facts.dub || tag.dubbed);
  const lang = tag.lang || it.facts.lang || (dub ? "Global" : "Global");
  const region = tag.region || it.facts.region || "";
  if (!t.name || !t.year) return;
  if (series) {
    const k = norm(t.name);
    const cur = showsByName.get(k) || { name: t.name, year: t.year, seasons: new Set(), lang, region, dub, imdb: it.imdb, poster: it.poster, genres: it.genres, post: it.post };
    cur.year = Math.min(cur.year, t.year);
    if (t.season) cur.seasons.add(t.season);
    cur.dub = cur.dub || dub;
    showsByName.set(k, cur);
    return;
  }
  if (known(t.name, t.year)) { if (dub) dubs.push([t.name, t.year]); return; }
  films.push([it.post, t.name, t.year, (LANG_CODE[lang] || "g") + (dub ? "d" : ""), region, Math.round(it.imdb * 10) || 0, it.runtime || 0,
    it.genres.slice(0, 3).map(g), tmdbKey(it.poster) || it.poster, Math.round(Math.log10(1 + it.views) * 10)]);
});

console.log("finding web series on Cinemeta: " + showsByName.size);
const shows = [];
const list = [...showsByName.values()];
for (let i = 0; i < list.length; i += 4) {
  const found = await Promise.all(list.slice(i, i + 4).map((s) => cinemetaSeries(s.name, s.year)));
  found.forEach((hit, j) => {
    const s = list[i + j];
    if (!hit) return;
    shows.push([hit.tt, hit.name, hit.year, (LANG_CODE[s.lang] || "g") + (s.dub ? "d" : ""), s.region, Math.round(s.imdb * 10) || 0,
      s.genres.slice(0, 3).map(g), tmdbKey(s.poster) || s.poster, Math.max(0, ...s.seasons), s.post]);
  });
  await wait(250);
}

const out = { generated: new Date().toISOString().slice(0, 10), genres: GENRES, films, dubs, shows };
writeFileSync(new URL(OUT, import.meta.url),
  "/* Vega's catalogue, trimmed to what the bundle doesn't have — built by tools/build-vega.mjs. Rows:\n" +
  "   films: [post, name, year, lang+dub (h/e/r/g, d = Hindi dubbed), region, imdb×10, runtime, genre indexes, TMDB poster key or url, popularity]\n" +
  "   dubs:  [name, year]  (bundled films Vega has in Hindi)\n" +
  "   shows: [imdb id, name, year, lang+dub, region, imdb×10, genre indexes, poster, latest season, post] */\n" +
  "window.VEGA_CATALOGUE = " + JSON.stringify(out) + ";\n");
console.log("films " + films.length + ", dubbed marks " + dubs.length + ", shows " + shows.length);
