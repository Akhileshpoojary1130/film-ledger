// Builds data/series.js: film series from Wikidata ("part of the series", P179), in release order.
// node tools/build-series.mjs      (about a minute; Wikidata's query service does the work)
import { writeFileSync } from "node:fs";

const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "Iris-film-diary/1.0 (film series builder; https://film-ledger-mocha.vercel.app)";
const FILM_TYPES = "wd:Q11424 wd:Q202866 wd:Q24869 wd:Q29168811"; // film, animated film, feature film, animated feature film
const MAX_FILMS = 40; // bigger "series" are cartoon runs or lists, not film series
const MIN_LINKS = 12; // a series is kept when one of its films has Wikipedia articles in at least this many languages…
const MIN_TOTAL = 30; // …or its films together reach this many

async function sparql(query) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/sparql-results+json", "user-agent": UA },
      body: new URLSearchParams({ query }),
    });
    if (res.ok) return (await res.json()).results.bindings;
    if (attempt >= 3) throw new Error("Wikidata answered " + res.status);
    await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
}
const qid = (uri) => uri.slice(uri.lastIndexOf("/") + 1);

/* The big query as CSV: far smaller than JSON, so it finishes inside Wikidata's 60-second limit. Values here are URIs,
   ids, dates and numbers — no commas or quotes to parse around. A cut-off answer ends in a Java stack trace. */
async function sparqlRows(query) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ENDPOINT + "?" + new URLSearchParams({ query }), { headers: { accept: "text/csv", "user-agent": UA } });
    const text = res.ok ? await res.text() : "";
    if (res.ok && !/Exception|SPARQL-QUERY/.test(text.slice(-2000))) {
      const [head, ...lines] = text.trim().split(/\r?\n/);
      const cols = head.split(",");
      return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v ? { value: v } : undefined])));
    }
    if (attempt >= 3) throw new Error("Wikidata query failed (" + res.status + ")");
    await new Promise((r) => setTimeout(r, 8000 * attempt));
  }
}

// 1. Every film that's part of a series, with its IMDb id, release dates and position.
// Kept lean so it finishes inside Wikidata's 60-second limit; shorts and adult films are sorted out per batch below.
const rows = await sparqlRows(`SELECT ?s ?f ?imdb ?date WHERE {
  ?f wdt:P179 ?s ; wdt:P345 ?imdb ; wdt:P31 ?ft . VALUES ?ft { ${FILM_TYPES} }
  OPTIONAL { ?f wdt:P577 ?date }
}`);
const films = new Map();
const members = new Map();
for (const b of rows) {
  const s = qid(b.s.value);
  const f = qid(b.f.value);
  if (!/^tt\d+$/.test(b.imdb.value)) continue;
  if (!films.has(f)) films.set(f, { tt: b.imdb.value, year: 0 });
  const film = films.get(f);
  const y = b.date ? parseInt(b.date.value, 10) : 0;
  if (y > 1880 && (!film.year || y < film.year)) film.year = y;
  if (!members.has(s)) members.set(s, new Set());
  members.get(s).add(f);
}
const series = [...members].filter(([, fs]) => fs.size >= 2);
console.error(rows.length + " rows, " + series.length + " series with two or more films");

// 2. Names (English, else Hindi) and how widely each film is written about.
const labels = new Map();
async function label(ids, links) {
  for (let i = 0; i < ids.length; i += 400) {
    const bindings = await sparql(`SELECT ?item ?en ?hi ${links ? "?links ?skip" : ""} WHERE {
      VALUES ?item { ${ids.slice(i, i + 400).map((x) => "wd:" + x).join(" ")} }
      ${links ? "?item wikibase:sitelinks ?links . BIND(EXISTS { { ?item wdt:P31 wd:Q24862 } UNION { ?item wdt:P136 wd:Q185529 } } AS ?skip)" : ""}
      OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en) = "en") }
      OPTIONAL { ?item rdfs:label ?hi FILTER(lang(?hi) = "hi") }
    }`);
    for (const b of bindings) {
      const id = qid(b.item.value);
      const prev = labels.get(id);
      // English wins over Hindi whichever row it arrives on.
      if (!prev || (!prev.en && b.en)) {
        // Short films and adult films are left out.
        labels.set(id, { name: (b.en || b.hi || {}).value || "", en: !!b.en, links: b.links ? +b.links.value : 0, skip: !!b.skip && b.skip.value === "true" });
      }
    }
  }
}
await label(series.map(([s]) => s), false);
await label([...new Set(series.flatMap(([, fs]) => [...fs]))], true);

// 3. Keep known series, drop ones wholly inside a bigger kept one ("Eon James Bond" inside "James Bond").
const cleanName = (n) => n.replace(/\s*\((?:film )?series\)$/i, "").replace(/\s+(?:film series|film franchise|franchise|films|film trilogy|trilogy)$/i, "").trim();
let kept = series.map(([s, fs]) => {
  const list = [...fs].filter((f) => !(labels.get(f) || {}).skip)
    .map((f) => ({ ...films.get(f), title: (labels.get(f) || {}).name || "", links: (labels.get(f) || {}).links || 0 }))
    .filter((f) => f.title && !/^Q\d+$/.test(f.title))
    // Two Wikidata items can share an IMDb id (a dub filed separately): keep one, preferring a Latin-script title.
    .sort((a, b) => /[a-z]/i.test(b.title) - /[a-z]/i.test(a.title))
    .filter((f, i, all) => all.findIndex((x) => x.tt === f.tt) === i);
  list.sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.title.localeCompare(b.title));
  return { id: s, name: cleanName((labels.get(s) || {}).name || ""), films: list };
}).filter((s) => s.name && !/^Q\d+$/.test(s.name) && s.films.length >= 2 && s.films.length <= MAX_FILMS &&
  !/greatest|best films|\blist\b|feature films?$|canon|collection$/i.test(s.name) &&
  (Math.max(...s.films.map((f) => f.links)) >= MIN_LINKS || s.films.reduce((n, f) => n + f.links, 0) >= MIN_TOTAL));
kept.sort((a, b) => b.films.length - a.films.length);
const out = [];
for (const s of kept) {
  const own = new Set(s.films.map((f) => f.tt));
  if (out.some((o) => s.films.every((f) => o.tts.has(f.tt)))) continue;
  out.push({ ...s, tts: own });
}
out.sort((a, b) => a.name.localeCompare(b.name));

const data = out.map((s) => [s.id, s.name, s.films.map((f) => [f.tt, f.year, f.title])]);
writeFileSync(new URL("../data/series.js", import.meta.url),
  "/* Film series from Wikidata (\"part of the series\"), in release order: [wikidata id, name, [[imdb id, year, title]…]].\n" +
  "   Generated by tools/build-series.mjs on " + new Date().toISOString().slice(0, 10) + " — regenerate rather than edit. */\n" +
  "window.FILM_SERIES = " + JSON.stringify(data) + ";\n");
console.error(out.length + " series, " + data.reduce((n, s) => n + s[2].length, 0) + " films written to data/series.js");
