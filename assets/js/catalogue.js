/* Iris — catalogue: normalises the bundled vault once, then serves search, browse, series and recommendations.
   Films found on the web (FL.remote) join the same list, so they behave exactly like bundled ones. */
(function (FL) {
  "use strict";

  const { normalize, skeleton } = FL.util;

  const LANGS = [
    { id: "Hindi", label: "Hindi" },
    { id: "English", label: "English" },
    { id: "OtherIndian", label: "Regional" },
    { id: "Superhero", label: "Marvel & DC" },
  ];
  const LANG_LABEL = Object.assign(Object.fromEntries(LANGS.map((l) => [l.id, l.label])), { Global: "World" });

  const REGIONS = new Set(["Tamil", "Telugu", "Malayalam", "Kannada", "Marathi", "Bengali", "Punjabi", "Gujarati", "Odia", "Assamese", "Bhojpuri", "Tulu", "Konkani"]);

  /* Rows scraped from Wikipedia link lists that are people, outlets or institutions, not films. */
  const NOT_FILMS = new Set([
    "ABP News", "Box Office India", "Business Today", "Calcutta News", "Cinema Express", "Deccan Herald", "Firstpost",
    "Hindustan Times Telugu", "India Today", "International Business Times", "News 18", "News18", "The Economic Times",
    "The Financial Express", "The Indian Express", "The New Indian Express", "The News Minute", "The Times of India",
    "Times Now", "Zee News", "Maharashtra", "Marathi", "Marathi language", "National Film Award for Best Feature Film in Marathi",
    "National Film Development Corporation of India", "Alka Kubal", "Amol Palekar", "Anand Abhyankar", "Asha Kale",
    "Ashok Saraf", "Chandrakant Kulkarni", "Laxmikant Berde", "Mahesh Manjrekar", "Mohan Joshi", "Neena Kulkarni",
    "Prashant Damle", "Ramesh Bhatkar", "Sachin Khedekar", "Sanjay Surkar", "Sudhir Joshi", "Sumitra Bhave",
    "Sumitra Bhave–Sunil Sukthankar", "Tushar Dalvi", "Vikram Gokhale",
  ].map(normalize));

  const GENRE_FIX = { "Science Fiction": "Sci-Fi", "Musical": "Music", "Romance, Drama": "Romance" };
  const ENGLISH_COUNTRY = /^(USA|United States|UK|United Kingdom|Canada|Australia|Ireland|New Zealand)\b/;

  const FRANCHISES = [
    { id: "mcu", name: "Marvel Cinematic Universe", test: (f) => /^MCU/.test(f.era) },
    { id: "xmen", name: "X-Men", test: (f) => /X-Men|Wolverine|Deadpool/.test(f.era) },
    { id: "spider-man", name: "Spider-Man", test: (f) => /Spider-Man/.test(f.era) },
    { id: "dceu", name: "DC Extended Universe", test: (f) => /^DCEU|DCU Bridge/.test(f.era) },
    { id: "dcu", name: "DC Universe", test: (f) => /New DCU/.test(f.era) },
    { id: "batman", name: "Batman", test: (f) => /Batman|Dark Knight/.test(f.era) },
    { id: "superman", name: "Superman", test: (f) => /Superman|Reeve|Donner/.test(f.era) },
    { id: "marvel-other", name: "Marvel, beyond the MCU", test: (f) => f.universe === "Marvel" },
    { id: "dc-other", name: "DC, beyond the franchises", test: (f) => f.universe === "DC" },
  ];

  const films = [];
  const byId = new Map();
  const aliases = new Map(); // retired superhero ids -> merged film id
  const byImdb = new Map();
  const byKey = new Map();
  let yearRange = [2026, 2026];
  let version = 1;

  function legacyId(year, lang, title) {
    return year + "_" + lang + "_" + String(title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function acronym(key) {
    const words = key.split(" ").filter((w) => !/^(the|a|an|of|and)$/.test(w));
    return words.length >= 3 ? words.map((w) => w[0]).join("") : "";
  }

  function cleanGenres(parts) {
    const out = [];
    parts.forEach((p) => {
      if (REGIONS.has(p)) return;
      const cased = p.charAt(0).toUpperCase() + p.slice(1);
      const g = GENRE_FIX[cased] || cased;
      if (out.indexOf(g) === -1) out.push(g);
    });
    // IMDb's "Adult" tag on mainstream films (Gangs of Wasseypur 2) is a certificate, not a genre worth leading with.
    const adult = out.indexOf("Adult");
    if (adult !== -1 && out.length > 1) out.splice(adult, 1);
    return out;
  }

  /* Search keys derived from the title. */
  function index(f) {
    const key = normalize(f.title);
    f.key = key;
    f.sk = skeleton(key);
    f.acr = acronym(key);
    f.bare = key.replace(/^(the|a|an) /, "");
    f.flat = key.replace(/ /g, "");
  }

  function finalize(f) {
    f.alt = normalize([f.genres.join(" "), f.region, f.universe, f.era, f.universe ? "superhero marvel dc" : "", LANG_LABEL[f.lang]].join(" "));
  }

  function register(f) {
    films.push(f);
    byId.set(f.id, f);
    if (f.imdbId) byImdb.set(f.imdbId, f);
    if (!byKey.has(f.key)) byKey.set(f.key, []);
    byKey.get(f.key).push(f);
  }

  function buildFilm(yearStr, lang, row, rank) {
    const title = String(row[0] || "").trim();
    if (!title || /^untitled\b/i.test(title)) return null;
    const wiki = String(row[4] || title).replace(/\s*\(page does not exist\)/, "").trim();
    if (lang === "OtherIndian" && (NOT_FILMS.has(normalize(wiki)) || NOT_FILMS.has(normalize(title)))) return null;

    const hero = lang === "Superhero";
    const parts = String(row[1] || "").split(/\s*[\/,]\s*/).map((s) => s.trim()).filter(Boolean);
    let date = String(row[3] || "");
    let rating = typeof row[2] === "number" ? row[2] : null;
    let votes = null;
    let imdbId = "";
    let poster = "";
    let desc = "";
    let universe = "";
    let era = "";
    let order = "";

    if (hero) {
      universe = row[5] || "";
      era = row[6] || "";
      order = row[7] || "";
      poster = row[9] || "";
      rating = null; // curated scores, not IMDb — the film page shows the live IMDb figure instead
    } else {
      poster = row[5] || "";
      desc = row[6] || "";
      imdbId = /^tt\d+$/.test(row[8] || "") ? row[8] : "";
      votes = typeof row[7] === "number" ? row[7] : null;
      // Regional rows carry synthetic figures (5000 votes, ratings of 6.4 / 7.4 / 8.4, June-1st dates): drop them all.
      // The live IMDb rating arrives from Cinemeta the first time the film is looked up or its year is opened.
      if (lang === "OtherIndian") {
        votes = null;
        rating = null;
        if (/-06-01$/.test(date)) date = "";
      } else if (!votes) {
        rating = null;
      }
    }

    const f = {
      id: "",
      title,
      year: parseInt(yearStr, 10),
      lang,
      region: lang === "OtherIndian" ? parts.find((p) => REGIONS.has(p)) || "" : "",
      genres: cleanGenres(parts),
      rating,
      votes,
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
      wiki,
      poster: /^https?:\/\//.test(poster) ? poster.replace(/^http:/, "https:") : "",
      desc,
      imdbId,
      universe,
      era,
      order,
      rank, // position in the source list — the vault orders each year by prominence
      // Unreleased and regional titles have no votes; fall back to their prominence in the source list.
      pop: votes ? Math.log10(votes + 1) * 14 : Math.max(0, 40 - rank) * 0.8,
    };
    index(f);
    return f;
  }

  /* Marvel & DC rows mostly duplicate an English row. Merge them so each film exists once:
     the English row keeps IMDb id / votes, the superhero row contributes universe, era and exact date. */
  function mergeHero(hero, candidates) {
    const twin = candidates && (candidates.find((f) => f.year === hero.year) || candidates.find((f) => Math.abs(f.year - hero.year) === 1));
    if (!twin) return null;
    twin.universe = hero.universe;
    twin.era = hero.era;
    twin.order = hero.order;
    if (!twin.poster) twin.poster = hero.poster;
    if (!twin.date && hero.date && +hero.date.slice(0, 4) === twin.year) twin.date = hero.date;
    return twin;
  }

  function load() {
    const raw = (window.FILM_STATIC_CATALOGUE && window.FILM_STATIC_CATALOGUE.movies) || {};
    const heroes = [];
    const english = new Map();
    Object.keys(raw).forEach((yearStr) => {
      LANGS.forEach(({ id: lang }) => {
        (raw[yearStr][lang] || []).forEach((row, rank) => {
          const f = buildFilm(yearStr, lang, row, rank);
          if (!f) return;
          let id = legacyId(yearStr, lang, f.title);
          if (lang === "Superhero") { heroes.push([f, id]); return; }
          if (byId.has(id)) id += "-" + (films.length + 1);
          f.id = id;
          register(f);
          if (lang === "English") {
            if (!english.has(f.key)) english.set(f.key, []);
            english.get(f.key).push(f);
          }
        });
      });
    });
    heroes.forEach(([hero, id]) => {
      const twin = mergeHero(hero, english.get(hero.key));
      if (twin) { aliases.set(id, twin.id); return; }
      hero.lang = "English";
      hero.id = id;
      register(hero);
    });
    // The same film listed under two languages (My Name Is Khan as Hindi and English): keep one, alias the other.
    const LANG_RANK = { Hindi: 0, OtherIndian: 1, English: 2, Global: 3 };
    const byTt = new Map();
    films.forEach((f) => {
      if (!f.imdbId) return;
      if (!byTt.has(f.imdbId)) byTt.set(f.imdbId, []);
      byTt.get(f.imdbId).push(f);
    });
    byTt.forEach((group, tt) => {
      if (group.length < 2) return;
      group.sort((a, b) => (LANG_RANK[a.lang] - LANG_RANK[b.lang]) || (b.votes || 0) - (a.votes || 0));
      const keep = group[0];
      byImdb.set(tt, keep);
      group.slice(1).forEach((f) => {
        films.splice(films.indexOf(f), 1);
        byId.delete(f.id);
        aliases.set(f.id, keep.id);
        const same = byKey.get(f.key);
        if (same) same.splice(same.indexOf(f), 1);
      });
    });
    let minY = 9999;
    let maxY = 0;
    films.forEach((f) => {
      finalize(f);
      if (f.year < minY) minY = f.year;
      if (f.year > maxY) maxY = f.year;
    });
    yearRange = [minY, maxY];
  }

  /* ---------- web films ---------- */

  const INDIAN_LANGS = { Hindi: "Hindi", Tamil: "OtherIndian", Telugu: "OtherIndian", Malayalam: "OtherIndian", Kannada: "OtherIndian",
    Marathi: "OtherIndian", Bengali: "OtherIndian", Punjabi: "OtherIndian", Gujarati: "OtherIndian" };

  /* Language bucket for web titles from country + spoken language. */
  function applyOrigin(f, country, language) {
    if (country) f.country = country;
    if (language) f.language = language;
    if (f.fixedLang) return;
    const firstLang = String(f.language || "").split(",")[0].trim();
    const firstCountry = String(f.country || "").split(",")[0].trim();
    if (INDIAN_LANGS[firstLang]) {
      f.lang = INDIAN_LANGS[firstLang];
      f.region = f.lang === "OtherIndian" ? firstLang : "";
    } else if (firstLang === "English" || (!firstLang && ENGLISH_COUNTRY.test(firstCountry))) {
      f.lang = "English";
      f.region = "";
    } else if (firstCountry || firstLang) {
      f.lang = "Global";
      f.region = firstCountry === "India" && firstLang ? firstLang : firstCountry || firstLang;
    }
  }

  /* d: { id?, imdbId, type, title, year, endYear, genres, rating, country, language, lang?, region?, wiki?, poster, desc, released, pop, rank } */
  function addRemote(d) {
    const id = d.id || d.imdbId;
    const existing = byId.get(id) || (d.imdbId && byImdb.get(d.imdbId));
    if (existing) return existing;
    const f = {
      id, type: d.type === "series" ? "series" : "movie", title: d.title, year: d.year || 0, endYear: d.endYear || 0,
      lang: d.lang || "Global", region: d.region || "", genres: cleanGenres(d.genres || []),
      rating: d.rating || null, votes: null, date: d.released || "", wiki: d.wiki || d.title,
      poster: d.poster || "", desc: d.desc || "", imdbId: d.imdbId || "", universe: "", era: "", order: "",
      rank: d.rank != null ? d.rank : 60, pop: d.pop != null ? d.pop : 12, remote: true, fixedLang: !!d.lang && d.lang !== "Global",
    };
    applyOrigin(f, d.country, d.language);
    index(f);
    finalize(f);
    register(f);
    version++;
    return f;
  }

  /* Fill a web title in from its details (genres, rating, country…). */
  function updateRemote(f, d) {
    if (!f || !f.remote || !d) return;
    if (d.title && d.title !== f.title) { f.title = d.title; index(f); }
    if (d.year && !f.year) f.year = d.year;
    if (d.genres && d.genres.length) f.genres = cleanGenres(d.genres);
    if (d.rating) f.rating = d.rating;
    if (d.desc && !f.desc) f.desc = d.desc;
    if (d.released && !f.date) f.date = d.released;
    applyOrigin(f, d.country, d.language);
    finalize(f);
    version++;
  }

  /* An existing entry a web result describes, by IMDb id or by title + year. */
  function findLocal(tt, title, year) {
    if (tt && byImdb.has(tt)) return byImdb.get(tt);
    const key = normalize(title);
    const near = (f) => f.type !== "series" && year && Math.abs(f.year - year) <= 1;
    const hit = (byKey.get(key) || []).find(near);
    if (hit) return hit;
    // IMDb often files a two-part release's first film under the bare title ("Gangs of Wasseypur" = "… – Part 1").
    for (const tail of [" part 1", " part one", " part i", " chapter 1", " 1"]) {
      const first = (byKey.get(key + tail) || []).find(near);
      if (first) return first;
    }
    return null;
  }

  const isFilm = (f) => f.type !== "series";

  /* ---------- search ---------- */

  function libraryBoost(f) {
    const e = FL.store && FL.store.peek(f.id);
    return e ? 40 : 0;
  }

  function scoreFilm(f, qText, qFlat, qSk, text) {
    if (f.key === qText) return 1000;
    if (f.bare === qText) return 950;
    if (f.key.startsWith(qText)) return 800;
    if (f.bare.startsWith(qText)) return 780;
    if (f.acr && qFlat.length >= 3 && f.acr === qFlat) return 700;
    let all = true;
    let inTitle = true;
    let wordStart = true;
    for (let j = 0; j < text.length; j++) {
      const t = text[j];
      const at = f.key.indexOf(t);
      if (at === -1) {
        inTitle = false;
        if (f.alt.indexOf(t) === -1) { all = false; break; }
      } else if (at > 0 && f.key.charCodeAt(at - 1) !== 32) {
        wordStart = false;
      }
    }
    if (all) return inTitle ? (wordStart ? 600 : 420) : 160;
    if (qFlat.length >= 3) {
      const at = f.flat.indexOf(qFlat);
      if (at === 0) return 400;
      if (at > 0 && qFlat.length >= 5) return 340;
    }
    if (qSk.length >= 3) {
      const at = f.sk.indexOf(qSk);
      if (at === 0) return 380;
      if (at > 0 && f.sk.charCodeAt(at - 1) === 32) return 300;
    }
    return 0;
  }

  function runSearch(text, year, filter) {
    const qText = text.join(" ");
    const qFlat = qText.replace(/ /g, "");
    const qSk = skeleton(qText);
    const scored = [];
    for (let i = 0; i < films.length; i++) {
      const f = films[i];
      if (year && f.year !== year) continue;
      if (filter && !filter(f)) continue;
      let s = scoreFilm(f, qText, qFlat, qSk, text);
      if (!s) continue;
      s -= Math.min(40, Math.abs(f.key.length - qText.length) * 0.6);
      scored.push([s + f.pop + libraryBoost(f), f]);
    }
    return scored;
  }

  /* Ranked search over every title. Returns { items, total }.
     A four-digit year narrows the search ("drishyam 2015"); if nothing matches it is treated as title text ("blade runner 2049"). */
  function search(query, { limit = 50, filter } = {}) {
    const q = normalize(query);
    if (!q) return { items: [], total: 0 };
    const tokens = q.split(" ");
    const yearAt = tokens.findIndex((t) => /^(19|20)\d\d$/.test(t));
    let scored;
    if (yearAt !== -1 && tokens.length === 1) {
      // A lone year: the film titled that, then everything released that year by popularity.
      const year = +tokens[0];
      scored = [];
      films.forEach((f) => {
        if (filter && !filter(f)) return;
        if (f.key === q) scored.push([2000, f]);
        else if (f.year === year) scored.push([100 + f.pop + libraryBoost(f), f]);
      });
    } else if (yearAt !== -1) {
      const text = tokens.filter((_, i) => i !== yearAt);
      scored = runSearch(text, +tokens[yearAt], filter);
      if (!scored.length) scored = runSearch(tokens, 0, filter);
    } else {
      scored = runSearch(tokens, 0, filter);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const items = [];
    const n = Math.min(limit, scored.length);
    for (let i = 0; i < n; i++) items.push(scored[i][1]);
    return { items, total: scored.length };
  }

  /* Local results plus whatever the web search has already returned for this query (see FL.remote),
     appended in the web's own relevance order. */
  function searchAll(query, opts) {
    const o = opts || {};
    const local = search(query, { limit: Infinity, filter: o.filter });
    const web = (FL.remote && FL.remote.cached(query)) || [];
    const seen = new Set(local.items.map((f) => f.id));
    const extra = web.filter((f) => !seen.has(f.id) && (!o.filter || o.filter(f)));
    const items = local.items.concat(extra);
    return { items: o.limit ? items.slice(0, o.limit) : items, total: items.length };
  }

  /* ---------- autocorrect ---------- */

  let vocab = null;
  let vocabSk = null;
  let vocabVersion = 0;

  function buildVocab() {
    vocab = new Map();
    vocabSk = new Map();
    films.forEach((f) => {
      f.key.split(" ").forEach((w) => {
        if (w.length < 3 || /^\d+$/.test(w)) return;
        vocab.set(w, (vocab.get(w) || 0) + 1 + f.pop / 25);
      });
    });
    vocab.forEach((weight, w) => {
      const s = skeleton(w);
      const cur = vocabSk.get(s);
      if (!cur || vocab.get(cur) < weight) vocabSk.set(s, w);
    });
    vocabVersion = version;
  }

  /* Optimal-string-alignment distance, abandoned once it exceeds `max`. */
  function distance(a, b, max) {
    const n = a.length;
    const m = b.length;
    if (Math.abs(n - m) > max) return max + 1;
    let prev2 = null;
    let prev = new Array(m + 1);
    for (let j = 0; j <= m; j++) prev[j] = j;
    for (let i = 1; i <= n; i++) {
      const cur = new Array(m + 1);
      cur[0] = i;
      let rowMin = i;
      for (let j = 1; j <= m; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[m];
  }

  function correctWord(w) {
    if (w.length < 3 || /^\d+$/.test(w) || vocab.has(w)) return w;
    const phonetic = vocabSk.get(skeleton(w));
    if (phonetic) return phonetic;
    const max = w.length <= 4 ? 1 : w.length <= 8 ? 2 : 3;
    let best = "";
    let bestD = max + 1;
    let bestW = 0;
    vocab.forEach((weight, v) => {
      if (Math.abs(v.length - w.length) > max) return;
      const d = distance(w, v, max);
      if (d < bestD || (d === bestD && weight > bestW)) { best = v; bestD = d; bestW = weight; }
    });
    return best || w;
  }

  /* "dhurandar revnge" -> "dhurandhar revenge"; empty string when nothing needed fixing. */
  function suggest(query) {
    const q = normalize(query);
    if (!q) return "";
    if (!vocab || vocabVersion !== version) buildVocab();
    const out = q.split(" ").map(correctWord).join(" ");
    return out !== q ? out : "";
  }

  /* ---------- browse ---------- */

  const SORTS = {
    popular: (a, b) => (b.votes || 0) - (a.votes || 0) || a.rank - b.rank || b.year - a.year || a.title.localeCompare(b.title),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || (b.votes || 0) - (a.votes || 0) || a.title.localeCompare(b.title),
    newest: (a, b) => b.year - a.year || (b.date || "").localeCompare(a.date || "") || (b.votes || 0) - (a.votes || 0) || a.rank - b.rank,
    oldest: (a, b) => (a.year || 9999) - (b.year || 9999) || (a.date || "").localeCompare(b.date || "") || (b.votes || 0) - (a.votes || 0) || a.rank - b.rank,
    title: (a, b) => a.title.localeCompare(b.title),
  };

  function yearTest(year) {
    if (!year || year === "all") return null;
    const m = /^(\d{4})s$/.exec(year);
    if (m) {
      const start = +m[1];
      return (f) => f.year >= start && f.year < start + 10;
    }
    const y = +year;
    return (f) => f.year === y;
  }

  let browseCache = { key: "", items: [] };

  /* opts: { q, lang, year, genre, region, minRating, status, sort } */
  function browse(opts) {
    const webCount = opts.q && FL.remote ? (FL.remote.cached(opts.q) || []).length : 0;
    const key = JSON.stringify(opts) + "|" + (FL.store ? FL.store.version() : 0) + "|" + version + "|" + webCount;
    if (browseCache.key === key) return browseCache.items;

    const tests = [];
    if (opts.lang === "Shows") tests.push((f) => f.type === "series");
    else tests.push(isFilm);
    if (opts.lang === "Shows" || opts.lang === "all") { /* no language test */ }
    else if (opts.lang === "Superhero") tests.push((f) => !!f.universe);
    else if (opts.lang) tests.push((f) => f.lang === opts.lang);
    const yt = yearTest(opts.year);
    if (yt) tests.push(yt);
    if (opts.genre) tests.push((f) => f.genres.indexOf(opts.genre) !== -1);
    if (opts.region) tests.push((f) => f.region === opts.region);
    if (opts.minRating) tests.push((f) => (f.rating || 0) >= opts.minRating);
    if (opts.status && opts.status !== "all" && FL.store) {
      const st = opts.status;
      tests.push((f) => {
        const s = FL.store.state(f.id);
        if (st === "unwatched") return !s.watched;
        if (st === "watched") return s.watched;
        if (st === "watchlist") return s.listed;
        return true;
      });
    }
    const filter = (f) => tests.every((t) => t(f));

    let items;
    if (opts.q) {
      items = searchAll(opts.q, { filter }).items;
      if (opts.sort && opts.sort !== "relevance" && SORTS[opts.sort]) items = items.slice().sort(SORTS[opts.sort]);
    } else {
      items = films.filter(filter);
      items.sort(SORTS[opts.sort] || SORTS.popular);
    }
    browseCache = { key, items };
    return items;
  }

  const genreCache = {};
  function genresFor(lang) {
    const k = lang || "all";
    if (genreCache[k]) return genreCache[k];
    const counts = {};
    films.forEach((f) => {
      if (lang === "Superhero" ? !f.universe : lang && lang !== "all" && f.lang !== lang) return;
      f.genres.forEach((g) => { counts[g] = (counts[g] || 0) + 1; });
    });
    genreCache[k] = Object.keys(counts).filter((g) => counts[g] >= 8).sort((a, b) => counts[b] - counts[a]);
    return genreCache[k];
  }

  let regionList = null;
  function regions() {
    if (regionList) return regionList;
    const counts = {};
    films.forEach((f) => { if (f.region && f.lang === "OtherIndian") counts[f.region] = (counts[f.region] || 0) + 1; });
    regionList = Object.keys(counts).filter((r) => counts[r] >= 5).sort((a, b) => counts[b] - counts[a]);
    return regionList;
  }

  /* ---------- series (sequels, prequels, remakes sharing a title stem) ---------- */

  const SEQ_TAIL = /\s(?:\d{1,2}|ii|iii|iv|v|vi|vii|part (?:\d+|one|two|three|i{1,3})|chapter (?:\d+|one|two|three|i{1,3})|returns?|again|back|reloaded|rises|forever|resurrection|3d|the (?:beginning|conclusion|revenge|rise|rule|rampage|final chapter))$/;
  const SEQ_HEAD = /^(?:phir|lage raho|the return of|return of the|return of|son of|the)\s/;
  const SEQ_NAMED = /^(harry potter|indiana jones|percy jackson) (?:and|&) the .*$/;
  // Instalments whose titles share nothing — the first film, or a renamed sequel.
  const SEQ_ALIAS = { "koi mil gaya": "krrish", "ek tha tiger": "tiger", "tiger zinda hai": "tiger", "munna bhai mbbs": "munna bhai" };

  /* "KGF: Chapter 2" -> "kgf", "Phir Hera Pheri" -> "hera pheri", "Golmaal Returns" -> "golmaal". */
  function stemOf(title) {
    let t = normalize(String(title).split(/\s*[:–—]\s*|\s+-\s+/)[0]).replace(SEQ_NAMED, "$1");
    if (SEQ_ALIAS[t]) return SEQ_ALIAS[t];
    for (let i = 0; i < 4; i++) {
      const before = t;
      t = t.replace(SEQ_TAIL, "").replace(SEQ_HEAD, "");
      // Trailing initialisms ("Munna Bhai M.B.B.S.") — only when real words remain.
      const m = /((?: [a-z])+)$/.exec(t);
      if (m && m[1].length >= 4 && /[a-z]{3}/.test(t.slice(0, m.index))) t = t.slice(0, m.index);
      t = t.trim();
      if (t === before) break;
    }
    return SEQ_ALIAS[t] || t;
  }

  let seriesIndex = null;
  let seriesVersion = 0;

  function seriesKey(f) {
    if (f.type === "series") return "";
    if (f.stemKey === undefined) {
      const s = stemOf(f.title).replace(/ /g, "");
      f.stemKey = s.length >= 3 ? s : "";
    }
    return f.stemKey;
  }

  function buildSeries() {
    seriesIndex = new Map();
    films.forEach((f) => {
      const k = seriesKey(f);
      if (!k) return;
      if (!seriesIndex.has(k)) seriesIndex.set(k, []);
      seriesIndex.get(k).push(f);
    });
    seriesVersion = version;
  }

  const byRelease = (a, b) => (a.year || 9999) - (b.year || 9999) || (a.date || "").localeCompare(b.date || "") || a.rank - b.rank;

  /* { name, films } in release order, or null. Needs at least one title that differs from the stem —
     films that merely share a title (two unrelated "Race"s) don't make a series. */
  function series(film) {
    if (!seriesIndex || seriesVersion !== version) buildSeries();
    const k = seriesKey(film);
    // Same language only ("War" 2019 isn't a sequel to the 2007 English "War"); web finds come from targeted searches.
    const members = k ? (seriesIndex.get(k) || []).filter((f) => f.lang === film.lang || f.remote || film.remote) : null;
    if (!members || members.length < 2) return null;
    if (!members.some((f) => f.key.replace(/^the /, "").replace(/ /g, "") !== k)) return null;
    // Several films with the very same title are namesakes or remakes, not instalments: keep the one that belongs —
    // the film you're on, else the bundled one, else the best documented (Hera Pheri 2000, not the 1976 or 2020 ones).
    const standing = (f) => (f === film ? 1e9 : 0) + (f.remote ? 0 : 1e6) + (f.votes || 0) + (f.rating ? 1000 : 0) + (/metahub/.test(f.poster || "") ? 0 : 100);
    const best = new Map();
    members.forEach((f) => {
      const cur = best.get(f.key);
      if (!cur || standing(f) > standing(cur)) best.set(f.key, f);
    });
    const list = Array.from(best.values()).sort(byRelease);
    if (list.length < 2) return null;
    const shortest = list.slice().sort((a, b) => a.title.length - b.title.length)[0];
    const head = shortest.title.split(/\s*[:–—]\s*/)[0];
    const named = /^(Harry Potter|Indiana Jones|Percy Jackson)\b/i.exec(head);
    const name = named ? named[1] : head.replace(/\s+\d+$/, "").trim();
    return { key: k, name, films: list };
  }

  /* For each series you've started: the first unwatched, released instalment after the latest one you saw. */
  function nextInSeries() {
    if (!FL.store) return [];
    const cy = new Date().getFullYear();
    const out = new Map();
    FL.store.watched().sort((a, b) => b.updated - a.updated).forEach((e) => {
      const film = byId.get(e.id);
      const s = film && series(film);
      if (!s) return;
      const watchedIdx = s.films.map((f, i) => (FL.store.state(f.id).watched ? i : -1)).filter((i) => i >= 0);
      const last = Math.max.apply(null, watchedIdx);
      const next = s.films.slice(last + 1).find((f) => !FL.store.state(f.id).watched && f.year && f.year <= cy);
      if (next && !out.has(next.id)) out.set(next.id, { film: next, reason: "Next after " + s.films[last].title });
    });
    return Array.from(out.values());
  }

  /* ---------- recommendations ---------- */

  function similar(film, n = 14) {
    const own = new Set(film.genres);
    const hero = !!film.universe;
    const mySeries = seriesKey(film);
    const scored = [];
    for (let i = 0; i < films.length; i++) {
      const f = films[i];
      if (f === film || f.key === film.key || f.type !== film.type) continue;
      if (mySeries && seriesKey(f) === mySeries) continue; // shown separately as the series
      if (hero ? !f.universe : f.lang !== film.lang) continue;
      let overlap = 0;
      f.genres.forEach((g) => { if (own.has(g)) overlap += g === "Drama" ? 1 : 3; });
      if (!overlap && !hero) continue;
      let s = overlap;
      if (hero && f.universe === film.universe) s += 3;
      if (film.region && f.region === film.region) s += 3;
      s -= Math.min(6, Math.abs(f.year - film.year) / 3);
      s += ((f.rating || 6) - 6) * 1.2;
      s += f.pop / 18;
      scored.push([s, f]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    return scored.slice(0, n).map((x) => x[1]);
  }

  /* Taste from what you watched: ratings, favourites and rewatches weight genres, languages, decades. */
  function profile(watched) {
    const g = {};
    const l = {};
    const r = {};
    const d = {};
    const add = (map, k, w) => { map[k] = (map[k] || 0) + w; };
    const liked = [];
    watched.forEach((e) => {
      const f = byId.get(e.id);
      if (!f) return;
      let w = e.rating ? (e.rating - 5) / 2.5 : 0.5;
      if (e.fav) w += 1;
      if (e.watches.length > 1) w += 0.4;
      f.genres.forEach((x) => add(g, x, w / Math.sqrt(f.genres.length)));
      add(l, f.lang, w);
      if (f.region) add(r, f.region, w);
      if (f.year) add(d, Math.floor(f.year / 10), w);
      if (w >= 1) liked.push([w, f]);
    });
    const norm = (map) => {
      const max = Math.max(0.001, ...Object.values(map).map(Math.abs));
      Object.keys(map).forEach((k) => { map[k] /= max; });
      return map;
    };
    liked.sort((a, b) => b[0] - a[0]);
    return { g: norm(g), l: norm(l), r: norm(r), d: norm(d), liked: liked.map((x) => x[1]).slice(0, 25) };
  }

  let recoCache = { v: "", items: [] };

  /* [{ film, reason }] — next instalments first, then films scored against your taste. */
  function forYou(limit = 24) {
    if (!FL.store) return [];
    const v = FL.store.version() + ":" + version;
    if (recoCache.v === v) return recoCache.items.slice(0, limit);
    const watched = FL.store.watched();
    if (!watched.length) return [];
    const p = profile(watched);
    const next = nextInSeries();
    const nextIds = new Map(next.map((x) => [x.film.id, x.reason]));
    const cy = new Date().getFullYear();
    const scored = [];
    for (let i = 0; i < films.length; i++) {
      const f = films[i];
      if (!f.year || f.year > cy || f.type === "series") continue;
      const st = FL.store.state(f.id);
      if (st.watched) continue;
      let gs = 0;
      f.genres.forEach((x) => { gs += p.g[x] || 0; });
      let s = (f.genres.length ? gs / Math.sqrt(f.genres.length) : 0) * 3;
      s += (p.l[f.lang] || 0) * 3;
      if (f.region) s += (p.r[f.region] || 0) * 2;
      s += (p.d[Math.floor(f.year / 10)] || 0);
      s += ((f.rating || 6.2) - 6.6) * 1.2;
      s += f.pop / 30;
      if (!f.imdbId && !f.poster) s -= 1;
      if (st.listed) s -= 0.5;
      if (nextIds.has(f.id)) s += 8;
      if (s > 0.5) scored.push([s, f]);
    }
    scored.sort((a, b) => b[0] - a[0]);

    const perSeries = {};
    const out = [];
    for (let i = 0; i < scored.length && out.length < 60; i++) {
      const f = scored[i][1];
      const k = seriesKey(f) || f.id;
      if ((perSeries[k] = (perSeries[k] || 0) + 1) > 1) continue;
      let reason = nextIds.get(f.id) || "";
      if (!reason) {
        let best = null;
        let bestOverlap = 0;
        p.liked.forEach((l) => {
          let o = l.lang === f.lang ? 1 : 0;
          l.genres.forEach((x) => { if (f.genres.indexOf(x) !== -1) o += x === "Drama" ? 0.5 : 2; });
          if (o > bestOverlap) { best = l; bestOverlap = o; }
        });
        if (best && bestOverlap >= 2.5) reason = "Because you liked " + best.title;
      }
      out.push({ film: f, reason });
    }
    recoCache = { v, items: out };
    return out.slice(0, limit);
  }

  /* Well-liked, widely-seen films — the pool for picks and cold-start rails. */
  function acclaimed({ lang, minYear, maxYear, minVotes = 15000, minRating = 7.2, exclude } = {}) {
    return films
      .filter((f) => f.rating && f.rating >= minRating && (f.votes || 0) >= minVotes &&
        (!lang || (lang === "Superhero" ? !!f.universe : f.lang === lang)) && (!minYear || f.year >= minYear) && (!maxYear || f.year <= maxYear) &&
        (!exclude || !exclude(f)))
      .sort((a, b) => b.rating * 10 + b.pop - (a.rating * 10 + a.pop));
  }

  /* ---------- franchises (Marvel & DC eras from the vault) ---------- */

  let franchiseList = null;
  function franchises() {
    if (franchiseList) return franchiseList;
    const groups = FRANCHISES.map((fr) => ({ id: fr.id, name: fr.name, films: [] }));
    films.forEach((f) => {
      if (!f.universe) return;
      const idx = FRANCHISES.findIndex((fr) => fr.test(f));
      if (idx !== -1) groups[idx].films.push(f);
    });
    groups.forEach((g) => g.films.sort((a, b) => (a.date || a.year + "").localeCompare(b.date || b.year + "")));
    franchiseList = groups.filter((g) => g.films.length >= 2);
    return franchiseList;
  }

  function franchiseOf(film) {
    if (!film.universe) return null;
    return franchises().find((g) => g.films.indexOf(film) !== -1) || null;
  }

  function langLabel(id) { return LANG_LABEL[id] || id; }
  function filmLang(f) { return f.region || LANG_LABEL[f.lang] || f.lang; }
  function yearLabel(f) {
    if (f.type === "series") return f.year ? f.year + "–" + (f.endYear || "") : "Series";
    return f.year ? String(f.year) : "Upcoming";
  }

  load();

  FL.catalogue = {
    LANGS, films, byId,
    get: (id) => byId.get(id) || byId.get(aliases.get(id)),
    canonical: (id) => (byId.has(id) ? id : aliases.get(id) || id),
    byImdb: (tt) => byImdb.get(tt) || null,
    isFilm, search, searchAll, suggest, browse, genresFor, regions, similar, acclaimed, forYou, nextInSeries, series, stemOf,
    franchises, franchiseOf, langLabel, filmLang, yearLabel, legacyId, SORTS,
    addRemote, updateRemote, findLocal,
    linkImdb(f, tt) { if (f && tt && !byImdb.has(tt)) byImdb.set(tt, f); },
    /* The live IMDb rating (via Cinemeta) wins over the bundled snapshot. */
    setRating(f, r) {
      r = Math.round(parseFloat(r) * 10) / 10;
      if (!f || !(r > 0 && r <= 10) || f.rating === r) return;
      f.rating = r;
      version++;
    },
    version: () => version,
    get yearRange() { return yearRange; },
  };
})(window.FL = window.FL || {});
