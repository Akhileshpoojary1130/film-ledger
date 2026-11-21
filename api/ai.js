/* Iris — AI: a daily fact-check of film details, and "Ask Iris" search. Both run on Gemini's free tier (Flash-Lite)
   and keep what they learn in the same free Upstash Redis Relay uses, so nothing here costs money.

   Daily check (Vercel cron, once a day): takes 100 films (first the ones people opened that haven't been checked,
   then the bundled catalogue, most-voted first), reads what Cinemeta says about each (director, writers, cast, genres,
   year, runtime), and asks Gemini to correct only what it is sure is wrong or missing. Answers are stored per IMDb id;
   the film page applies the fixes and shows an "AI checked" badge.

   GET  ?ids=tt1,tt2           → { checks: { tt1: { at, verdict, fixes, was, notes } } }    (cached at the edge)
   POST { want: [tt…] }         → { queued }      films someone opened that have no check yet go to the front
   POST { scan: tt, title }     → { check }       check one film now (the film page's "Scan with AI")
   POST { ask, taste }          → { understood, picks: [{ title, year, imdb, why }] }       "Ask Iris" search
   POST { picks: 1, taste, trending } → { picks } AI picks for you (Home): from your taste, with new titles that fit
   POST { match: film, taste }  → { verdict, score, headline, reasons }   "Will I like it?" on the film page
   POST { insight: 1, taste, stats } → { headline, summary, traits, picks }               the Stats page's AI read
   GET  ?run=1                  → runs the daily check (cron; needs CRON_SECRET when one is set)
   GET  ?status=1               → { ai, keys, store, checked, queued, last, recent }

   POST bodies may carry `model` (one of the allowed models) to try first; Settings → AI sets it. A visitor's own Gemini
   key, if they added one in Settings, comes in the x-gemini-key header: their calls then use only that key (never
   stored or logged) and get much higher daily limits.

   Env: GEMINI_API_KEY, and up to nine more as GEMINI_API_KEY_2 … GEMINI_API_KEY_10 (or a comma list in
   GEMINI_API_KEYS): calls rotate across them and a key that hits its limit hands over to the next. GEMINI_MODEL
   (default gemini-3.5-flash-lite), GEMINI_FALLBACK_MODELS (default gemini-3.1-flash-lite), AI_DAILY (films a day,
   default 500, split over the day's runs), AI_RUNS (cron runs a day, default 2), CRON_SECRET. */
import { creds } from "./sync.js";

export const config = { runtime: "edge" };

const TT = /^tt\d{5,10}$/;
// What can be checked: films and series by IMDb id, anime by AniList id ("an" + number, as Sakura names them).
const ID = /^(?:tt\d{5,10}|an\d{1,9})$/;
const CINEMETA = "https://v3-cinemeta.strem.io";
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/";
const CHECKS = "iris:ai:checks"; // hash: imdb id → JSON
const WANT = "iris:ai:want"; // set of ids people opened
const CURSOR = "iris:ai:cursor"; // where the catalogue walk is
const LAST = "iris:ai:last"; // the latest run's summary
const RECENT = "iris:ai:recent"; // list of the latest fixes, newest first
const WANT_MAX = 2000;
const BATCH = 10; // films per Gemini call
const ASK_PER_DAY = 60; // AI calls per visitor per day (Ask, picks, insight)
const SCAN_PER_DAY = 25; // on-demand scans per visitor per day
const OWN_KEY_PER_DAY = 400; // either kind, for a visitor using their own key
const USER_KEY = /^AIza[0-9A-Za-z_-]{30,60}$/;
const RUN_BUDGET = 240000; // ms: a run stops starting new batches after this, well inside the edge's 300 s
export const GENRES = ["Action", "Adventure", "Animation", "Biography", "Comedy", "Crime", "Documentary", "Drama", "Family",
  "Fantasy", "History", "Horror", "Music", "Musical", "Mystery", "Romance", "Sci-Fi", "Sport", "Thriller", "War", "Western"];

const env = () => (typeof process !== "undefined" && process.env) || {};

/* ---------- Redis (Upstash REST) ---------- */

async function redis(c, cmd) {
  const r = await fetch(c.url, {
    method: "POST",
    headers: { Authorization: "Bearer " + c.token, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || "store answered " + r.status);
  return j.result;
}

const json = (body, status, cache) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache || "no-store" },
});

/* ---------- Gemini ---------- */

export function models(e, prefer) {
  const x = e || env();
  const first = x.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const rest = String(x.GEMINI_FALLBACK_MODELS || "gemini-3.1-flash-lite").split(",").map((s) => s.trim()).filter(Boolean);
  const all = [first, ...rest.filter((m) => m !== first)];
  return prefer && all.includes(prefer) ? [prefer, ...all.filter((m) => m !== prefer)] : all;
}

/* Every key that's set: GEMINI_API_KEY, GEMINI_API_KEY_2 … _10, and any in GEMINI_API_KEYS. */
export function keys(e) {
  const x = e || env();
  const out = [];
  const add = (k) => { k = String(k || "").trim(); if (k && !out.includes(k)) out.push(k); };
  add(x.GEMINI_API_KEY);
  for (let i = 1; i <= 10; i++) { add(x["GEMINI_API_KEY_" + i]); add(x["GEMINI_API_KEY" + i]); }
  String(x.GEMINI_API_KEYS || "").split(",").forEach(add);
  return out;
}
let turn = 0; // round-robin over keys, so a busy run spreads its calls

/* One JSON answer. For each model in order, each key in turn: a key at its limit (429/403) hands over to the next
   key, a model that's missing or down (404/5xx) to the next model. */
export async function gemini(prompt, schema, opts) {
  const o = Object.assign({ timeout: 25000, temperature: 0.1 }, opts);
  const ks = o.keys && o.keys.length ? o.keys : keys(o.env);
  if (!ks.length) throw new Error("no-key");
  let last = "no model answered";
  const start = turn++ % ks.length;
  for (const model of models(o.env, o.model)) {
    for (let j = 0; j < ks.length; j++) {
    const key = ks[(start + j) % ks.length];
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), o.timeout);
    try {
      const r = await fetch(GEMINI + encodeURIComponent(model) + ":generateContent", {
        method: "POST",
        signal: ctl.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: o.temperature, responseMimeType: "application/json", responseSchema: schema },
        }),
      });
      if (!r.ok) {
        last = model + " " + r.status;
        if (r.status === 429 || r.status === 403 || r.status === 401) continue; // this key is spent: next key
        break; // the model itself failed: next model
      }
      const d = await r.json();
      const text = (((d.candidates || [])[0] || {}).content || { parts: [] }).parts.map((p) => p.text || "").join("");
      return { model, data: JSON.parse(text) };
    } catch (err) {
      last = model + " " + (err && err.name === "AbortError" ? "timed out" : (err && err.message) || "failed");
      break;
    } finally {
      clearTimeout(timer);
    }
    }
  }
  throw new Error(last);
}

/* ---------- the daily check ---------- */

/* The bundled catalogue is a script (`window.FILM_STATIC_CATALOGUE = {…}`); the films that have an IMDb id, most-voted
   first, so the titles people meet most get checked first. */
export function catalogueIds(src) {
  const start = src.indexOf("{", src.indexOf("FILM_STATIC_CATALOGUE"));
  const end = src.lastIndexOf("}");
  const cat = JSON.parse(src.slice(start, end + 1));
  const rows = [];
  Object.keys(cat.movies || {}).forEach((year) => {
    const y = cat.movies[year];
    ["Hindi", "English", "OtherIndian"].forEach((lang) => (y[lang] || []).forEach((r) => {
      if (TT.test(r[8] || "")) rows.push({ id: r[8], title: r[0], lang, votes: +r[7] || 0, genre: r[1] || "" });
    }));
  });
  const seen = new Set();
  return rows.sort((a, b) => b.votes - a.votes).filter((r) => (seen.has(r.id) ? false : seen.add(r.id)));
}

/* What Cinemeta says, trimmed to what we ask about. */
export function facts(id, meta, row) {
  const m = meta || {};
  return {
    id,
    kind: m.type === "series" ? "series" : "film",
    title: m.name || (row && row.title) || "",
    year: parseInt(m.year || m.releaseInfo, 10) || null,
    released: m.released ? String(m.released).slice(0, 10) : null,
    language: row ? { Hindi: "Hindi", English: "English", OtherIndian: "Indian (not Hindi)" }[row.lang] : null,
    genres: (m.genres || m.genre || []).slice(0, 4),
    directors: (m.director || []).slice(0, 3),
    writers: (m.writer || []).slice(0, 4),
    cast: (m.cast || []).slice(0, 6),
    runtime: parseInt(m.runtime, 10) || null,
    country: m.country || null,
  };
}

const LIST = { type: "ARRAY", items: { type: "STRING" } };
export const CHECK_SCHEMA = {
  type: "OBJECT",
  properties: {
    films: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          verdict: { type: "STRING", enum: ["ok", "fixed", "unsure"] },
          fixes: {
            type: "OBJECT",
            properties: {
              directors: LIST, writers: LIST, cast: LIST, genres: LIST,
              year: { type: "INTEGER" }, runtime: { type: "INTEGER" }, language: { type: "STRING" }, released: { type: "STRING" },
            },
          },
          notes: { type: "STRING" },
        },
        required: ["id", "verdict"],
      },
    },
  },
  required: ["films"],
};

export function checkPrompt(items) {
  return "You fact-check film, TV series and anime details for a diary app used mostly in India.\n" +
    "For each title below (identified by its id, kind, title and year), compare every field with what you know for certain about that exact title.\n" +
    "Ids starting with \"tt\" are IMDb ids; ids starting with \"an\" are AniList ids.\n" +
    "For a series or anime series: year and released are the first episode's; runtime is the usual minutes per episode; directors are the series' main " +
    "directors (or creators if it has no regular director); writers are its creators or head writers; cast is the main cast (for anime, the main Japanese voice cast).\n" +
    "Rules:\n" +
    "- Correct a field only if it is wrong, or empty when you know the answer, AND you are highly confident. Never guess.\n" +
    "- directors/writers: full credited names in their usual English spelling. cast: the main leads in billing order, at most 6.\n" +
    "- genres: 1 to 3, only from: " + GENRES.join(", ") + ".\n" +
    "- runtime in minutes; year is the original release year; released is YYYY-MM-DD; language is the original language.\n" +
    "- Leave out every field that is already right. A different but valid spelling of the same name is right.\n" +
    "- verdict: \"ok\" when nothing needed fixing, \"fixed\" when you corrected something, \"unsure\" when you don't know this title well enough to judge.\n" +
    "- notes: one short sentence on what you changed, or empty.\n" +
    "Return one entry per film, same ids.\n\nFilms:\n" + JSON.stringify(items);
}

/* Keep only fixes that differ from what we had and have the right shape. */
export function cleanFixes(fix, had) {
  const out = {};
  const was = {};
  if (!fix || typeof fix !== "object") return { fixes: out, was };
  const names = (v) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean).slice(0, 6) : []);
  const same = (a, b) => JSON.stringify(a).toLowerCase() === JSON.stringify(b).toLowerCase();
  ["directors", "writers", "cast"].forEach((k) => {
    const v = names(fix[k]);
    if (v.length && !same(v, (had[k] || []).slice(0, v.length))) { out[k] = v; was[k] = had[k] || []; }
  });
  const g = names(fix.genres).filter((x) => GENRES.includes(x)).slice(0, 3);
  if (g.length && !same([...g].sort(), [...(had.genres || [])].slice(0, g.length).sort())) { out.genres = g; was.genres = had.genres || []; }
  const yr = parseInt(fix.year, 10);
  if (yr >= 1900 && yr <= new Date().getFullYear() + 2 && yr !== had.year) { out.year = yr; was.year = had.year; }
  const rt = parseInt(fix.runtime, 10);
  // Episodes run short (an anime's 24 minutes, a sitcom's 22); films don't.
  const minRt = had.kind && had.kind !== "film" && had.kind !== "anime film" ? 3 : 30;
  if (rt >= minRt && rt <= 400 && Math.abs(rt - (had.runtime || 0)) > 2) { out.runtime = rt; was.runtime = had.runtime; }
  // Language only corrects one we had (a film without one in the catalogue isn't shown a language from here).
  if (had.language && typeof fix.language === "string" && fix.language.trim() && fix.language.length < 30 && had.language !== fix.language.trim() &&
      !(had.language === "Indian (not Hindi)" && fix.language !== "Hindi" && fix.language !== "English")) {
    out.language = fix.language.trim(); was.language = had.language;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(fix.released || "") && fix.released !== had.released) { out.released = fix.released; was.released = had.released; }
  return { fixes: out, was };
}

/* Cinemeta files series apart from films. Series first: its film endpoint also answers for a series (typed "movie",
   without episodes), while its series endpoint returns an empty "meta" for a film. */
async function cinemeta(id) {
  for (const kind of ["series", "movie"]) {
    try {
      const r = await fetch(CINEMETA + "/meta/" + kind + "/" + id + ".json");
      if (!r.ok) continue;
      const d = await r.json();
      if (d && d.meta && d.meta.name) return Object.assign({ type: kind === "movie" ? "movie" : "series" }, d.meta);
    } catch (e) { /* the other kind, or nothing */ }
  }
  return null;
}

/* An anime's details from AniList (what Sakura shows): its directors, writers (series composition, original creator),
   genres, first-air year and date, minutes per episode. (AniList keeps voice actors from anonymous requests, so the
   cast starts empty and the AI may fill it in.) */
const ANI_QUERY = "query($id:Int){Media(id:$id,type:ANIME){title{english romaji}format episodes duration genres startDate{year month day}" +
  " staff(perPage:25,sort:RELEVANCE){edges{role node{name{full}}}}}}";
export function animeFacts(id, media) {
  const m = media || {};
  const staff = ((m.staff && m.staff.edges) || []).map((x) => [String(x.role || ""), x.node && x.node.name && x.node.name.full]).filter((x) => x[1]);
  const pick = (re) => [...new Set(staff.filter(([role]) => re.test(role)).map((x) => x[1]))].slice(0, 3);
  const sd = m.startDate || {};
  const pad = (n) => String(n).padStart(2, "0");
  return {
    id,
    kind: m.format === "MOVIE" ? "anime film" : "anime series",
    title: (m.title && (m.title.english || m.title.romaji)) || "",
    year: sd.year || null,
    released: sd.year && sd.month && sd.day ? sd.year + "-" + pad(sd.month) + "-" + pad(sd.day) : null,
    language: "Japanese",
    genres: (m.genres || []).slice(0, 4),
    directors: pick(/^(?:Chief )?Director$/i),
    writers: pick(/series composition|original creator|original story|script/i),
    cast: [],
    runtime: m.duration || null,
    country: "Japan",
  };
}
async function anilist(id) {
  try {
    const r = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query: ANI_QUERY, variables: { id: +id.slice(2) } }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.data && d.data.Media ? d.data.Media : null;
  } catch (e) { return null; }
}

/* The facts for any checkable id. */
async function factsFor(id, row) {
  if (/^an/.test(id)) { const m = await anilist(id); return m ? animeFacts(id, m) : { id, title: "" }; }
  return facts(id, await cinemeta(id), row);
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

/* Picks today's films: the wanted ones first, then the catalogue from the cursor on, skipping checked ones. */
async function pickToday(c, origin, daily, log) {
  const picked = [];
  const wanted = (await redis(c, ["SPOP", WANT, String(daily)])) || [];
  wanted.filter((id) => ID.test(id)).forEach((id) => picked.push({ id }));
  if (picked.length >= daily) return { picked, rows: new Map() };
  const src = await (await fetch(new URL("/data/catalogue.js", origin))).text();
  const rows = catalogueIds(src);
  const byId = new Map(rows.map((r) => [r.id, r]));
  let cur = +(await redis(c, ["GET", CURSOR])) || 0;
  if (cur >= rows.length) cur = 0; // went round the whole catalogue: start a second pass
  while (picked.length < daily && cur < rows.length) {
    const slice = rows.slice(cur, cur + 50);
    cur += slice.length;
    const have = await redis(c, ["HMGET", CHECKS, ...slice.map((r) => r.id)]);
    slice.forEach((r, i) => { if (!have[i] && picked.length < daily && !picked.some((p) => p.id === r.id)) picked.push({ id: r.id }); });
  }
  await redis(c, ["SET", CURSOR, String(cur)]);
  log("catalogue " + rows.length + ", cursor " + cur);
  return { picked, rows: byId };
}

/* Checks a batch of films (facts already read) and stores the answers. Returns the stored records by id. */
async function checkBatch(c, batch, model, own) {
  const answer = await gemini(checkPrompt(batch), CHECK_SCHEMA, { model, keys: own });
  const byId = new Map((answer.data.films || []).map((f) => [f.id, f]));
  const writes = [];
  const out = {};
  batch.forEach((had) => {
    const f = byId.get(had.id);
    if (!f) return;
    const { fixes, was } = cleanFixes(f.fixes, had);
    const verdict = f.verdict === "unsure" ? "unsure" : Object.keys(fixes).length ? "fixed" : "ok";
    const rec = { v: 1, at: new Date().toISOString().slice(0, 10), model: answer.model, verdict, fixes, was,
      notes: verdict === "fixed" ? String(f.notes || "").slice(0, 200) : "", title: had.title, year: had.year, kind: had.kind || "film" };
    out[had.id] = rec;
    writes.push(had.id, JSON.stringify(rec));
  });
  if (writes.length) await redis(c, ["HSET", CHECKS, ...writes]);
  const fixedOnes = Object.keys(out).filter((id) => out[id].verdict === "fixed");
  if (fixedOnes.length) {
    await redis(c, ["LPUSH", RECENT, ...fixedOnes.map((id) => JSON.stringify(Object.assign({ id }, out[id])))]);
    await redis(c, ["LTRIM", RECENT, "0", "59"]);
  }
  return out;
}

export async function runCheck(c, origin, log) {
  const e = env();
  const t0 = Date.now();
  const daily = Math.max(1, Math.min(1000, +e.AI_DAILY || 500));
  const runs = Math.max(1, Math.min(4, +e.AI_RUNS || 2));
  const perRun = Math.ceil(daily / runs);
  const { picked, rows } = await pickToday(c, origin, perRun, log);
  log("checking " + picked.length);
  const items = await pool(picked, 8, async (p) => factsFor(p.id, rows.get(p.id)));
  const usable = items.filter((x) => x.title);
  const tally = { checked: 0, fixed: 0, ok: 0, unsure: 0, failed: 0 };
  const batches = [];
  for (let i = 0; i < usable.length; i += BATCH) batches.push(usable.slice(i, i + BATCH));
  const left = [];
  await pool(batches, Math.min(4, 1 + keys().length), async (batch) => {
    if (Date.now() - t0 > RUN_BUDGET) { left.push(...batch.map((b) => b.id)); return; }
    let out;
    try { out = await checkBatch(c, batch); } catch (err) { log("batch failed: " + err.message); tally.failed += batch.length; left.push(...batch.map((b) => b.id)); return; }
    Object.values(out).forEach((r) => { tally.checked++; tally[r.verdict]++; });
  });
  // Whatever didn't get done goes back to the front of the queue for the next run.
  if (left.length) await redis(c, ["SADD", WANT, ...left]).catch(() => {});
  const summary = Object.assign({ at: new Date().toISOString(), ms: Date.now() - t0, keys: keys().length }, tally);
  await redis(c, ["SET", LAST, JSON.stringify(summary)]).catch(() => {});
  log("done " + tally.checked + ", fixed " + tally.fixed);
  return { checked: tally.checked, fixed: tally.fixed };
}

/* ---------- Ask Iris ---------- */

export const ASK_SCHEMA = {
  type: "OBJECT",
  properties: {
    understood: { type: "STRING" },
    picks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { title: { type: "STRING" }, year: { type: "INTEGER" }, imdb: { type: "STRING" }, kind: { type: "STRING", enum: ["movie", "series"] }, why: { type: "STRING" } },
        required: ["title", "why"],
      },
    },
  },
  required: ["understood", "picks"],
};

export const INSIGHT_SCHEMA = {
  type: "OBJECT",
  properties: {
    headline: { type: "STRING" },
    summary: { type: "STRING" },
    traits: { type: "ARRAY", items: { type: "STRING" } },
    picks: ASK_SCHEMA.properties.picks,
  },
  required: ["headline", "summary", "traits", "picks"],
};

const list = (v, n) => (Array.isArray(v) ? v.map((s) => String(s).slice(0, 80)).filter(Boolean).slice(0, n) : []);

export function askPrompt(q, taste) {
  const t = taste || {};
  return "You are the search inside Iris, a film and TV diary used mostly in India.\n" +
    "The viewer typed: " + JSON.stringify(String(q).slice(0, 300)) + "\n" +
    "What they watch (use it to choose among good matches and to explain picks; don't recommend what they've already watched):\n" +
    JSON.stringify(tasteOf(t)) + "\n" +
    "Find the real films or series that best answer the request. If they describe a film they can't name (plot, actor, scene), find that exact title first.\n" +
    "Return up to 10 real titles that exist, with the original release year and IMDb id when you are sure of it (else leave imdb empty).\n" +
    "why: one short line (under 12 words) saying why it fits them, e.g. 'Same director as Drishyam'.\n" +
    "understood: a short phrase restating what they asked for.";
}

export function picksPrompt(taste, trending) {
  return "You are the recommender inside Iris, a film and TV diary used mostly in India. Recommend for THIS viewer, not for everyone.\n" +
    "Their taste profile (genre and people scores run from -1, disliked, to +1, loved; 'curious' are titles they opened but haven't watched):\n" +
    JSON.stringify(tasteOf(taste)) + "\n" +
    "New and trending titles Iris has right now (" + list(trending, 40).length + "): " + JSON.stringify(list(trending, 40)) + "\n" +
    "Pick 12 real films or series they haven't watched and are very likely to love:\n" +
    "- 3 or 4 from the new and trending list, only those that genuinely fit their taste;\n" +
    "- 3 or 4 from directors or actors they score highly, or close cousins of their top-rated films;\n" +
    "- the rest acclaimed titles in the genres and languages they love, plus one step outside their usual taste they'd still enjoy.\n" +
    "Avoid genres and people they score below 0. No titles from their watched list.\n" +
    "Give the original release year and IMDb id when you're sure of it (else leave imdb empty). why: under 12 words, naming the film or person behind it.\n" +
    "understood: a 3 to 6 word name for this mix, like 'Slow-burn thrillers and Malayalam gems'.";
}

export function insightPrompt(taste, stats) {
  const s = stats || {};
  return "You write the 'AI read' on the Stats page of Iris, a film diary used mostly in India. Warm, specific, never generic, no flattery.\n" +
    "Viewer: " + JSON.stringify(tasteOf(taste)) + "\n" +
    "Numbers: " + JSON.stringify({ films: +s.films || 0, hours: +s.hours || 0, topGenres: list(s.genres, 6), topLanguages: list(s.languages, 4), decades: list(s.decades, 4),
      directors: list(s.directors, 6), avgRating: +s.avgRating || 0, imdbGap: +s.imdbGap || 0, nightOwl: !!s.nightOwl, topDay: String(s.topDay || "").slice(0, 12) }) + "\n" +
    "headline: a 3 to 6 word name for their taste. summary: 2 short sentences about how they watch, citing real titles or numbers. " +
    "traits: 3 tags of 1 to 3 words. picks: 5 real titles they haven't watched that fit, with a why under 12 words.";
}

const scored = (v, n) => (Array.isArray(v) ? v.slice(0, n).map((x) => (x && typeof x === "object"
  ? { name: String(x.name || "").slice(0, 60), score: Math.max(-1, Math.min(1, +x.score || 0)), films: +x.n || 0, role: x.role ? String(x.role).slice(0, 12) : undefined }
  : { name: String(x).slice(0, 60) })).filter((x) => x.name) : []);

function tasteOf(t) {
  t = t || {};
  return {
    loved: list(t.loved, 15), disliked: list(t.disliked, 10), recent: list(t.recent, 20), watched: list(t.watched, 80),
    curious: list(t.curious, 12), watchlist: list(t.watchlist, 15),
    genres: scored(t.genres, 10), languages: list(t.languages, 4), decades: list(t.decades, 4), people: scored(t.people, 12),
    style: t.style && typeof t.style === "object" ? { avgRating: +t.style.avgRating || 0, vsImdb: +t.style.vsImdb || 0, mainstream: String(t.style.mainstream || "").slice(0, 20), runtime: +t.style.runtime || 0 } : undefined,
  };
}

export const MATCH_SCHEMA = {
  type: "OBJECT",
  properties: {
    verdict: { type: "STRING", enum: ["yes", "maybe", "no"] },
    score: { type: "INTEGER" },
    headline: { type: "STRING" },
    reasons: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["verdict", "score", "headline", "reasons"],
};

export function matchPrompt(film, taste) {
  const f = film || {};
  const info = { title: String(f.title || "").slice(0, 120), year: +f.year || null, kind: f.kind === "series" ? "series" : "movie",
    genres: list(f.genres, 5), directors: list(f.directors, 3), cast: list(f.cast, 8), language: String(f.language || "").slice(0, 30),
    rating: +f.rating || null, about: String(f.desc || "").slice(0, 500) };
  return "You are the 'Will I like it?' note on a film page in Iris, a film diary used mostly in India.\n" +
    "Title: " + JSON.stringify(info) + "\n" +
    "Viewer's taste profile (scores -1 disliked to +1 loved): " + JSON.stringify(tasteOf(taste)) + "\n" +
    "Decide honestly whether THIS viewer will enjoy it. Ground every reason in their own history: name the films they rated, " +
    "the genres, actors or directors they score, e.g. 'You rated 3 Idiots 9/10 and this is Rajkumar Hirani again'. Say so plainly when it's not their kind of film.\n" +
    "verdict: yes, maybe or no. score: 0 to 100. headline: under 9 words, in second person. reasons: 2 or 3, each under 16 words.";
}

export function cleanPicks(data) {
  const picks = ((data && data.picks) || []).map((p) => ({
    title: String(p.title || "").trim().slice(0, 120),
    year: parseInt(p.year, 10) || null,
    imdb: TT.test(p.imdb || "") ? p.imdb : null,
    kind: p.kind === "series" ? "series" : "movie",
    why: String(p.why || "").trim().slice(0, 100),
  })).filter((p) => p.title);
  return { understood: String((data && data.understood) || "").slice(0, 140), picks: picks.slice(0, 12) };
}

async function overLimit(c, req, what, max, own) {
  if (own) { what = "own"; max = OWN_KEY_PER_DAY; }
  if (!c) return false;
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  const key = "iris:ai:" + what + ":" + new Date().toISOString().slice(0, 10) + ":" + ip;
  const n = await redis(c, ["INCR", key]).catch(() => 0);
  if (n === 1) redis(c, ["EXPIRE", key, "90000"]).catch(() => {});
  return n > max;
}
const LIMIT_MSG = "That's today's AI requests from here. Try again tomorrow.";
const BUSY_MSG = "The AI is busy right now. Try again in a minute.";

/* ---------- handler ---------- */

export default async function handler(req) {
  const url = new URL(req.url);
  const c = creds();
  const e = env();

  if (url.searchParams.has("status")) {
    let checked = 0, queued = 0, last = null, recent = [];
    if (c) {
      try {
        const [h, q, l, r] = await Promise.all([redis(c, ["HLEN", CHECKS]), redis(c, ["SCARD", WANT]), redis(c, ["GET", LAST]), redis(c, ["LRANGE", RECENT, "0", "19"])]);
        checked = h; queued = q;
        try { last = l ? JSON.parse(l) : null; } catch (err) { last = null; }
        recent = (r || []).map((x) => { try { return JSON.parse(x); } catch (err) { return null; } }).filter(Boolean);
      } catch (err) { /* store down */ }
    }
    const e2 = env();
    return json({ ai: keys().length > 0, keys: keys().length, store: !!c, checked, queued, last, recent, models: models(),
      daily: Math.max(1, Math.min(1000, +e2.AI_DAILY || 500)) }, 200, "public, max-age=60, s-maxage=300");
  }

  if (url.searchParams.has("run")) {
    if (e.CRON_SECRET && req.headers.get("authorization") !== "Bearer " + e.CRON_SECRET) return json({ error: "unauthorized" }, 401);
    if (!c || !keys().length) return json({ error: "not-configured", store: !!c, ai: keys().length > 0 }, 503);
    // Streamed, so the edge sends its first byte at once and the work can take longer than 25 seconds.
    const enc = new TextEncoder();
    const body = new ReadableStream({
      async start(ctl) {
        const log = (s) => ctl.enqueue(enc.encode(s + "\n"));
        try { const r = await runCheck(c, url.origin, log); log(JSON.stringify(r)); } catch (err) { log("error: " + err.message); }
        ctl.close();
      },
    });
    return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }

  if (req.method === "GET") {
    const ids = (url.searchParams.get("ids") || "").split(",").filter((id) => ID.test(id)).slice(0, 40);
    if (!ids.length) return json({ error: "bad-ids" }, 400);
    if (!c) return json({ checks: {} });
    try {
      const got = await redis(c, ["HMGET", CHECKS, ...ids]);
      const checks = {};
      ids.forEach((id, i) => { if (got[i]) { try { checks[id] = JSON.parse(got[i]); } catch (err) { /* skip a bad row */ } } });
      return json({ checks }, 200, "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400");
    } catch (err) {
      return json({ checks: {}, error: "store" });
    }
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch (err) { return json({ error: "bad-body" }, 400); }

    if (Array.isArray(body.want)) {
      if (!c) return json({ queued: 0 });
      const ids = body.want.filter((id) => ID.test(id)).slice(0, 20);
      if (!ids.length) return json({ queued: 0 });
      try {
        if ((await redis(c, ["SCARD", WANT])) >= WANT_MAX) return json({ queued: 0, full: true });
        const n = await redis(c, ["SADD", WANT, ...ids]);
        return json({ queued: n });
      } catch (err) { return json({ queued: 0 }); }
    }

    const model = typeof body.model === "string" ? body.model : "";
    const userKey = (req.headers.get("x-gemini-key") || "").trim();
    const own = USER_KEY.test(userKey) ? [userKey] : null;
    const opt = (o) => Object.assign({ model, keys: own }, o);
    const wantsAi = (typeof body.ask === "string" && body.ask.trim()) || body.picks || body.insight || body.match || ID.test(body.scan || "");
    if (wantsAi && !keys().length && !own) return json({ error: "not-configured" }, 503);
    const failed = (err) => (own && /\b(400|401|403)\b/.test(err && err.message)
      ? json({ error: "bad-key", message: "Your Gemini key didn't work. Check it in Settings → AI." }, 400)
      : json({ error: "ai", message: BUSY_MSG }, 502));

    if (ID.test(body.scan || "")) {
      if (c) {
        const had = await redis(c, ["HGET", CHECKS, body.scan]).catch(() => null);
        if (had) { try { return json({ check: JSON.parse(had), cached: true }); } catch (err) { /* re-check */ } }
      }
      if (!c) return json({ error: "not-configured" }, 503);
      if (await overLimit(c, req, "scan", SCAN_PER_DAY, own)) return json({ error: "limit", message: LIMIT_MSG }, 429);
      try {
        const item = await factsFor(body.scan, null);
        if (!item.title) return json({ error: "unknown", message: "Couldn't find this title's details to check." }, 404);
        const out = await checkBatch(c, [item], model, own);
        redis(c, ["SREM", WANT, body.scan]).catch(() => {});
        return json({ check: out[body.scan] || null });
      } catch (err) { return failed(err); }
    }

    if (typeof body.ask === "string" && body.ask.trim()) {
      if (await overLimit(c, req, "ask", ASK_PER_DAY, own)) return json({ error: "limit", message: LIMIT_MSG }, 429);
      try {
        const r = await gemini(askPrompt(body.ask, body.taste), ASK_SCHEMA, opt({ temperature: 0.4, timeout: 20000 }));
        return json(Object.assign(cleanPicks(r.data), { model: r.model }));
      } catch (err) { return failed(err); }
    }

    if (body.picks) {
      if (await overLimit(c, req, "ask", ASK_PER_DAY, own)) return json({ error: "limit", message: LIMIT_MSG }, 429);
      try {
        const r = await gemini(picksPrompt(body.taste, body.trending), ASK_SCHEMA, opt({ temperature: 0.6, timeout: 20000 }));
        return json(Object.assign(cleanPicks(r.data), { model: r.model }));
      } catch (err) { return failed(err); }
    }

    if (body.match && typeof body.match === "object") {
      if (await overLimit(c, req, "ask", ASK_PER_DAY, own)) return json({ error: "limit", message: LIMIT_MSG }, 429);
      try {
        const r = await gemini(matchPrompt(body.match, body.taste), MATCH_SCHEMA, opt({ temperature: 0.3, timeout: 15000 }));
        const d = r.data || {};
        return json({
          verdict: ["yes", "maybe", "no"].includes(d.verdict) ? d.verdict : "maybe",
          score: Math.max(0, Math.min(100, parseInt(d.score, 10) || 50)),
          headline: String(d.headline || "").slice(0, 80),
          reasons: (Array.isArray(d.reasons) ? d.reasons : []).map((x) => String(x).slice(0, 140)).filter(Boolean).slice(0, 3),
          model: r.model,
        });
      } catch (err) { return failed(err); }
    }

    if (body.insight) {
      if (await overLimit(c, req, "ask", ASK_PER_DAY, own)) return json({ error: "limit", message: LIMIT_MSG }, 429);
      try {
        const r = await gemini(insightPrompt(body.taste, body.stats), INSIGHT_SCHEMA, opt({ temperature: 0.5, timeout: 20000 }));
        const d = r.data || {};
        return json({
          headline: String(d.headline || "").slice(0, 80), summary: String(d.summary || "").slice(0, 400),
          traits: (Array.isArray(d.traits) ? d.traits : []).map((x) => String(x).slice(0, 30)).filter(Boolean).slice(0, 3),
          picks: cleanPicks({ picks: d.picks }).picks.slice(0, 5), model: r.model,
        });
      } catch (err) { return failed(err); }
    }
    return json({ error: "bad-body" }, 400);
  }
  return json({ error: "method" }, 405);
}
