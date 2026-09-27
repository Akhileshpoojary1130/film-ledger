/* Iris — everything fetched from the web that becomes part of the catalogue:
   title search (films + shows), by-year lists (1970 → today, refreshed live), Wikipedia film lists for
   older Hindi years, and TV/reality shows with their seasons. Results are ordinary catalogue entries. */
(function (FL) {
  "use strict";

  const { storage, session, normalize, debounce, fetchJSON, limiter } = FL.util;

  const CINEMETA = "https://v3-cinemeta.strem.io";
  const SAVED_KEY = "film_ledger_remote_v1";
  const WIKI_KEY = "film_ledger_wikiyears_v1";
  const SAVED_CAP = 900;
  const queue = limiter(3);

  let saved = storage.get(SAVED_KEY, {}); // id -> compact entry
  const wikiYears = storage.get(WIKI_KEY, {}); // "Hindi:1975" -> { at, rows: [[title, wiki]] }

  /* ---------- turning web data into catalogue entries ---------- */

  function fromMeta(m, i) {
    const tt = m.imdb_id || m.id;
    if (!/^tt\d+$/.test(tt || "")) return null;
    const type = m.type === "series" ? "series" : "movie";
    const years = String(m.releaseInfo || m.year || "").match(/\d{4}/g) || [];
    return {
      imdbId: tt,
      type,
      title: m.name,
      year: +years[0] || 0,
      endYear: type === "series" ? (/[–-]\s*$/.test(m.releaseInfo || "") ? 0 : +years[1] || 0) : 0,
      genres: m.genres || m.genre || [],
      rating: parseFloat(m.imdbRating) || null,
      country: m.country || "",
      language: m.language || "",
      poster: FL.meta.sized(m.poster || ""),
      desc: String(m.description || "").slice(0, 600),
      released: m.released ? String(m.released).slice(0, 10) : "",
      pop: Math.max(4, 26 - (i || 0) * 1.5),
      tmdbPop: popOf(m),
    };
  }

  /* Cinemeta carries TMDB's popularity; map it onto the catalogue's scale (bundled films use log10(votes) × 14 ≈ 40–85). */
  function popOf(m) {
    const p = (m.popularities && m.popularities.moviedb) || 0;
    return p > 0.01 ? Math.round((44 + Math.log2(1 + p) * 6) * 10) / 10 : 0;
  }

  /* A bundled film this web result describes — enrich it instead of duplicating it. */
  function adopt(m, d) {
    if (d.type === "series") return null;
    const local = FL.catalogue.findLocal(d.imdbId, d.title, d.year);
    if (!local) return null;
    if (!local.imdbId && !FL.meta.idFor(local)) FL.meta.setImdb(local, d.imdbId);
    FL.catalogue.linkImdb(local, d.imdbId);
    if (d.rating) FL.catalogue.setRating(local, d.rating);
    if (local.remote && d.tmdbPop && d.tmdbPop > (local.pop || 0)) local.pop = d.tmdbPop;
    if (!local.genres.length && d.genres.length) local.genres = d.genres.slice(0, 4);
    if (!local.poster && d.poster) FL.meta.notePoster(local, d.poster);
    return local;
  }

  function ingest(metas, opts) {
    const o = opts || {};
    const out = [];
    metas.forEach((m, i) => {
      if (o.type && m.type && m.type !== o.type) return;
      const d = fromMeta(m, (o.offset || 0) + i);
      if (!d || !d.title) return;
      // Year lists skip shorts (Vincent is 6 minutes) so they don't top the "IMDb rating" order.
      if (o.feature && (/\bshort\b/i.test((d.genres || []).join(" ")) || (parseInt(m.runtime, 10) > 0 && parseInt(m.runtime, 10) < 40))) return;
      if (o.pop) d.pop = d.tmdbPop || o.pop((o.offset || 0) + i);
      const local = adopt(m, d);
      if (local) { out.push(local); return; }
      if (!d.poster && !o.keepBare) return; // posterless search noise is almost always obscure
      // Cinemeta points every search hit at a metahub poster, even when none exists; a released title with
      // no rating and no real poster is noise (shorts, stubs, fan uploads).
      if (o.search && !d.rating && /metahub/.test(d.poster) && d.year && d.year < new Date().getFullYear()) return;
      out.push(FL.catalogue.addRemote(d));
    });
    return out;
  }

  /* ---------- persistence of web entries you use ---------- */

  const persist = debounce(() => {
    const ids = Object.keys(saved);
    if (ids.length > SAVED_CAP) {
      const keep = new Set(FL.store.entries().map((e) => e.id));
      ids.sort((a, b) => (saved[a].at || 0) - (saved[b].at || 0));
      for (let i = 0; i < ids.length - SAVED_CAP; i++) if (!keep.has(ids[i])) delete saved[ids[i]];
    }
    storage.set(SAVED_KEY, saved);
  }, 800);

  function touch(f) {
    if (!f || !f.remote) return;
    saved[f.id] = {
      i: f.imdbId, ty: f.type, t: f.title, y: f.year, ey: f.endYear || 0, g: f.genres, r: f.rating, c: f.country || "",
      lg: f.language || "", l: f.lang, rg: f.region || "", w: f.wiki || "",
      p: f.poster, d: (f.desc || "").slice(0, 400), rd: f.date || "", pop: f.pop, at: Date.now(),
    };
    persist();
  }

  function restore() {
    let dropped = 0;
    // Shows renamed by an old bug (their details were looked up as a film, and Cinemeta answers that with some other
    // title — The Family Man became "CantaJuego 1"): back to the name they were found under, with that film's genres,
    // rating and blurb cleared for the show's own to fill in.
    Object.keys(saved).forEach((id) => {
      const s = saved[id];
      const m = s.ty === "series" && s.w && s.w !== s.t && FL.meta.rawMeta(id);
      if (!m || m.kind || m.name !== s.t) return;
      Object.assign(s, { t: s.w, g: [], r: 0, c: "", d: "", rd: "" });
      FL.meta.forgetMeta(id);
      dropped++;
    });
    Object.keys(saved).forEach((id) => {
      const s = saved[id];
      // A web copy of a film the bundle turned out to have (matching got smarter since it was saved): fold it in.
      if (s.ty !== "series" && !FL.store.peek(id)) {
        const local = FL.catalogue.findLocal(s.i, s.t, s.y);
        if (local && !local.remote) { FL.catalogue.linkImdb(local, s.i); delete saved[id]; dropped++; return; }
      }
      FL.catalogue.addRemote({
        id, imdbId: s.i, type: s.ty, title: s.t, year: s.y, endYear: s.ey, genres: s.g, rating: s.r, country: s.c,
        language: s.lg, lang: s.l, region: s.rg, wiki: s.w, poster: s.p, desc: s.d, released: s.rd, pop: s.pop,
      });
    });
    // Library entries whose web data was trimmed: rebuild from the entry's own snapshot.
    FL.store.entries().forEach((e) => {
      if (FL.catalogue.get(e.id) || !/^(tt|vg)\d+$/.test(e.id)) return;
      FL.catalogue.addRemote(Object.assign({ type: e.type || "movie", title: e.title, year: e.year, genres: e.genres || [] },
        /^tt/.test(e.id) ? { imdbId: e.id } : { id: e.id, imdbId: e.imdbId || "" }));
    });
    if (dropped) persist();
  }

  /* ---------- search ---------- */

  const results = new Map(); // normalized query -> entries[]
  const inflight = new Map();

  function cached(query) { return results.get(normalize(query)) || null; }

  /* Films and shows for a typed query; resolves with catalogue entries in the web's relevance order. */
  function search(query) {
    const q = normalize(query);
    if (q.length < 2) return Promise.resolve([]);
    if (results.has(q)) return Promise.resolve(results.get(q));
    if (inflight.has(q)) return inflight.get(q);
    const showUrl = CINEMETA + "/catalog/series/top/search=" + encodeURIComponent(q) + ".json";
    const p = Promise.all([
      FL.meta.cinemetaSearch(q, true),
      queue(() => fetchJSON(showUrl, { timeout: 12000 })).then((d) => (d && d.metas) || []).catch(() => []),
    ]).then(([movies, shows]) => {
      // The web's search is loose ("kantara" also brings "Quién te cantará"): keep titles that have every word you
      // typed (as the start of one of theirs), unless that leaves nothing — then a typo still finds something.
      const words = q.split(" ").filter(Boolean);
      const relevant = (m) => {
        const t = normalize(m.name || "").split(" ");
        const joined = t.join(""); // "K.G.F" is "k g f" once normalised; "kgf" still finds it
        return words.every((w) => t.some((x) => x.startsWith(w)) || joined.includes(w));
      };
      const pick = (list, n) => { const good = list.filter(relevant); return (good.length ? good : list).slice(0, n); };
      const out = ingest(pick(movies, 14), { type: "movie", search: true }).concat(ingest(pick(shows, 6), { type: "series", search: true }));
      results.set(q, out);
      // Fill genres/ratings for the first few so their cards read like everything else.
      out.slice(0, 8).forEach((f) => {
        if (f.remote && f.type !== "series" && !f.genres.length) FL.meta.details(f).then(() => FL.ui.refreshFilm(f.id));
      });
      return out;
    }).finally(() => inflight.delete(q));
    inflight.set(q, p);
    return p;
  }

  /* ---------- by year ---------- */

  const yearPages = new Map(); // "1975:2" -> Promise<entries[]>

  /* Page n (50 titles) of the year's most-watched films, worldwide. Refreshed from the web each session. */
  function yearPage(year, page) {
    const key = year + ":" + page;
    if (yearPages.has(key)) return yearPages.get(key);
    const url = CINEMETA + "/catalog/movie/year/genre=" + year + (page ? "&skip=" + page * 50 : "") + ".json";
    const p = queue(() => fetchJSON(url, { timeout: 15000 }))
      // Not sorted by popularity for older years, so each title's own popularity is used; position is the fallback.
      .then((d) => ingest((d && d.metas) || [], { type: "movie", feature: true, offset: page * 50, pop: (i) => Math.max(3, 46 - i * 0.1) }))
      .catch(() => { yearPages.delete(key); return []; });
    yearPages.set(key, p);
    return p;
  }

  /* Wikipedia's "List of <Language> films of <year>" — the bundled vault starts in 1990 for Indian cinema. */
  const WIKI_LISTS = {
    Hindi: "Hindi",
    OtherIndian: ["Tamil", "Telugu", "Malayalam", "Kannada", "Bengali", "Marathi", "Punjabi", "Gujarati"],
    English: ["American", "British"],
  };

  function parseList(text) {
    const rows = [];
    const seen = new Set();
    text.split("\n").forEach((line) => {
      if (!/^\s*[|!]/.test(line)) return;
      const re = /''\s*\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]\s*''/g;
      let m;
      while ((m = re.exec(line))) {
        const wiki = m[1].trim();
        const title = (m[2] || m[1]).replace(/\s*\((?:\d{4} )?(?:[A-Za-z]+ )?film\)\s*$/, "").trim();
        const k = normalize(title);
        if (!k || seen.has(k) || /^(list of|category:|file:)/i.test(wiki)) continue;
        seen.add(k);
        rows.push([title, wiki]);
      }
    });
    return rows;
  }

  function wikiListRows(language, year) {
    const key = language + ":" + year;
    const hit = wikiYears[key];
    if (hit && Date.now() - hit.at < 30 * 864e5) return Promise.resolve(hit.rows);
    const url = "https://en.wikipedia.org/w/api.php?action=parse&format=json&origin=*&prop=wikitext&redirects=1&page=" +
      encodeURIComponent("List of " + language + " films of " + year);
    return queue(() => fetchJSON(url, { timeout: 15000 })).then((d) => {
      const text = d && d.parse && d.parse.wikitext && d.parse.wikitext["*"];
      const rows = text ? parseList(text) : [];
      wikiYears[key] = { at: Date.now(), rows };
      storage.set(WIKI_KEY, wikiYears);
      return rows;
    }).catch(() => []);
  }

  const wikiDone = new Map();

  /* Classic-era entries for a language bucket and year, as catalogue films (posters and ratings resolve lazily). */
  function wikiYear(lang, year) {
    const key = lang + ":" + year;
    if (wikiDone.has(key)) return wikiDone.get(key);
    const languages = [].concat(WIKI_LISTS[lang] || []);
    const p = Promise.all(languages.map((language) => wikiListRows(language, year).then((rows) => rows.map(([title, wiki], i) => {
      const local = FL.catalogue.findLocal("", title, year);
      if (local) return local;
      return FL.catalogue.addRemote({
        id: "wk" + year + "_" + language.toLowerCase() + "_" + normalize(title).replace(/ /g, ""),
        imdbId: "", type: "movie", title, year, wiki, lang, region: lang === "OtherIndian" ? language : "",
        // Hindi lists open with the year's top grossers; the rest follow in release order.
        pop: lang === "Hindi" && i < 10 ? 68 - i * 1.2 : Math.max(20, 44 - i * 0.12), rank: i,
      });
    })))).then((lists) => [].concat.apply([], lists));
    wikiDone.set(key, p);
    return p;
  }

  /* ---------- shows ---------- */

  const showMeta = new Map(); // tt -> Promise<{ seasons, episodes, … }>

  /* Full show record with every episode — fetched live so new seasons appear on their own. */
  function show(tt) {
    if (showMeta.has(tt)) return showMeta.get(tt);
    const p = queue(() => fetchJSON(CINEMETA + "/meta/series/" + tt + ".json", { timeout: 20000 }))
      .then((d) => {
        const m = d && d.meta;
        if (!m) throw new Error("missing");
        const today = new Date().toISOString().slice(0, 10);
        const episodes = (m.videos || [])
          .filter((v) => v.season != null && v.episode != null)
          .map((v) => ({
            s: +v.season, e: +v.episode, title: v.title || v.name || "", date: v.released ? String(v.released).slice(0, 10) : "",
            thumb: v.thumbnail || "", overview: String(v.overview || v.description || "").slice(0, 400),
          }))
          .map((v) => Object.assign(v, { aired: !!v.date && v.date <= today }))
          .sort((a, b) => a.s - b.s || a.e - b.e);
        const seasons = Array.from(new Set(episodes.map((v) => v.s))).sort((a, b) => (a || 999) - (b || 999));
        const entry = FL.catalogue.get(tt) || FL.catalogue.addRemote(fromMeta(Object.assign({ type: "series" }, m)) || { imdbId: tt, type: "series", title: m.name });
        FL.catalogue.updateRemote(entry, {
          title: m.name, genres: m.genres || [], rating: parseFloat(m.imdbRating) || 0, country: m.country, language: m.language,
          desc: String(m.description || "").slice(0, 600), year: parseInt(m.releaseInfo, 10) || 0,
        });
        entry.tmdb = m.moviedb_id || 0;
        entry.status = m.status || "";
        return {
          film: entry, tmdb: m.moviedb_id || 0, seasons, episodes, cast: (m.cast || []).slice(0, 8), status: m.status || "",
          runtime: parseInt(m.runtime, 10) || 0, trailer: (m.trailers && m.trailers[0] && m.trailers[0].source) || "",
          backdrop: m.background || "",
        };
      })
      .catch((err) => { showMeta.delete(tt); throw err; });
    showMeta.set(tt, p);
    return p;
  }

  /* Popular Indian reality & talent formats, found by name so new seasons and spin-offs stay current. */
  const REALITY = ["bigg boss", "india's got talent", "lock upp", "khatron ke khiladi", "indian idol", "shark tank india",
    "the great indian kapil show", "the kapil sharma show", "kaun banega crorepati", "mtv roadies", "mtv splitsvilla",
    "dance india dance", "super dancer", "laughter chefs", "jhalak dikhhla jaa", "the traitors india", "india's got latent"];
  const SEED_KEY = "film_ledger_showseed_v2"; // v2: India's Got Latent joined

  /* Indian web series worth following — found by name, so new seasons appear on their own. */
  const INDIAN_SERIES = ["mirzapur", "panchayat", "the family man", "sacred games", "scam 1992", "kota factory", "aspirants", "paatal lok",
    "farzi", "made in heaven", "delhi crime", "gullak", "asur", "rocket boys", "special ops", "criminal justice", "aarya", "the railway men",
    "heeramandi", "jubilee", "taaza khabar", "kaala paani", "maharani", "rana naidu", "tvf pitchers", "the night manager", "dahaad",
    "khakee the bihar chapter", "scam 2003", "black warrant", "the freelancer", "yeh meri family", "college romance", "the broken news"];

  const realityShows = () => seeded(SEED_KEY, REALITY);
  const indianSeries = () => seeded("film_ledger_indianseries_v1", INDIAN_SERIES);

  const seedQueue = FL.util.limiter(6); // seed lists get their own lane so other rows aren't stuck behind them

  function seeded(key, queries) {
    const hit = session.get(key, null) || storage.get(key, null);
    if (hit && Date.now() - hit.at < 3 * 864e5) {
      return Promise.resolve(hit.items.map((d) => FL.catalogue.addRemote(d)));
    }
    return Promise.all(queries.map((q) => seedQueue(() => fetchJSON(CINEMETA + "/catalog/series/top/search=" + encodeURIComponent(q) + ".json", { timeout: 12000 }))
      .then((d) => {
        const want = normalize(q);
        const metas = (d && d.metas) || [];
        return metas.find((m) => normalize(m.name) === want) || metas[0] || null;
      }).catch(() => null)))
      .then((metas) => {
        const items = metas.filter(Boolean).map((m, i) => fromMeta(m, i)).filter(Boolean);
        const seen = new Set();
        const unique = items.filter((d) => (seen.has(d.imdbId) ? false : seen.add(d.imdbId)));
        storage.set(key, { at: Date.now(), items: unique });
        return unique.map((d) => FL.catalogue.addRemote(d));
      });
  }

  /* Followed shows with episodes that came out since you last watched one — "Bigg Boss S20 · 3 new". Episodes of an
     old show you simply haven't reached aren't new (Mirzapur 2018 isn't news); nor is anything you've already
     dismissed from the row (the × there hides it until the next episode airs). */
  function newEpisodes(limit) {
    const followed = FL.store.shows().slice(0, limit || 8);
    return Promise.all(followed.map((e) => show(e.id).then((d) => {
      const aired = d.episodes.filter((v) => v.s > 0 && v.aired);
      if (!aired.length) return null;
      let last = -1;
      aired.forEach((v, i) => { if (FL.store.episodeWatched(d.film.id, v.s, v.e)) last = i; });
      if (last === -1) return null; // following but not started: nothing is "new" yet
      const entry = FL.store.peek(d.film.id) || {};
      const ticked = Object.values(entry.episodes || {}).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
      const since = [ticked[ticked.length - 1] || "", entry.newSnooze || ""].sort().pop();
      const fresh = aired.slice(last + 1).filter((v) => !since || (v.date && v.date > since));
      if (!fresh.length) return null;
      const next = fresh[0];
      return { film: d.film, count: fresh.length, next, latest: fresh[fresh.length - 1] };
    }).catch(() => null))).then((list) => list.filter(Boolean));
  }

  /* Cinemeta's own series catalogues: "top" (popular now) or a genre such as "Reality-TV". */
  function showCatalog(genre) {
    const url = CINEMETA + "/catalog/series/top" + (genre ? "/genre=" + encodeURIComponent(genre) : "") + ".json";
    return queue(() => fetchJSON(url, { timeout: 15000 })).then((d) => ingest((d && d.metas) || [], { type: "series" })).catch(() => []);
  }

  /* Open any title by IMDb id (deep links, backups restored on a new browser). */
  function byId(tt, type) {
    // A link by IMDb id to a film that's bundled under another id opens straight away.
    const f = FL.catalogue.get(tt) || (type !== "series" && FL.catalogue.byImdb(tt));
    if (f) return Promise.resolve(f);
    if (type === "series") return show(tt).then((s) => s.film).catch(() => null);
    return FL.meta.fetchMeta(tt, "movie").then((m) => (m ? FL.catalogue.addRemote({
      imdbId: tt, type: "movie", title: m.name, year: m.year, genres: m.genres, rating: m.rating, country: m.country,
      poster: FL.meta.sized(m.poster), desc: m.desc, released: m.released,
    }) : null));
  }

  FL.store.on((detail) => {
    if (!detail.id) return;
    const f = FL.catalogue.get(detail.id);
    if (f && f.remote) touch(f);
  });

  /* ---------- Vega's catalogue (data/vega.js, built by tools/build-vega.mjs) ----------
     Loaded once Iris is up (it's a few hundred KB): films and web series the bundle lacks join the catalogue with
     Vega's name, year, language, IMDb rating and genres; bundled films Vega has in Hindi get a "Hindi dubbed" mark. */
  const VEGA_LANG = { h: "Hindi", e: "English", r: "OtherIndian", g: "Global" };
  const posterFrom = (p) => (!p ? "" : /^https:\/\//.test(p) ? p : "https://image.tmdb.org/t/p/w342/" + p + ".jpg");
  let vegaLoad = null;
  function loadVega() {
    if (vegaLoad) return vegaLoad;
    vegaLoad = new Promise((resolve) => {
      if (window.VEGA_CATALOGUE) { resolve(window.VEGA_CATALOGUE); return; }
      const s = document.createElement("script");
      s.src = "data/vega.js";
      s.async = true;
      s.onload = () => resolve(window.VEGA_CATALOGUE || null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    }).then((d) => (d ? ingestVega(d) : 0));
    return vegaLoad;
  }
  /* In small batches between frames, so a phone never stutters while thousands of titles join. */
  function ingestVega(d) {
    const jobs = [];
    (d.dubs || []).forEach(([name, year]) => jobs.push(() => { const f = FL.catalogue.findLocal("", name, year); if (f) f.dub = true; }));
    (d.films || []).forEach(([post, name, year, lc, region, r10, runtime, gi, poster, pop]) => jobs.push(() => {
      const dub = lc.charAt(1) === "d";
      const have = FL.catalogue.findLocal("", name, year);
      if (have) { if (dub) have.dub = true; have.vega = have.vega || post; return; }
      const f = FL.catalogue.addRemote({
        id: "vg" + post, type: "movie", title: name, year, lang: VEGA_LANG[lc.charAt(0)] || "Global", region: region || "",
        genres: (gi || []).map((i) => d.genres[i]).filter(Boolean), rating: r10 ? r10 / 10 : null, poster: posterFrom(poster), pop: 8 + (pop || 0),
      });
      f.dub = dub;
      f.vega = post;
      if (runtime && !f.runtime) f.runtime = runtime;
    }));
    (d.shows || []).forEach(([tt, name, year, lc, region, r10, gi, poster, season, post]) => jobs.push(() => {
      const f = FL.catalogue.get(tt) || FL.catalogue.addRemote({
        imdbId: tt, type: "series", title: name, year, lang: VEGA_LANG[lc.charAt(0)] || "Global", region: region || "",
        genres: (gi || []).map((i) => d.genres[i]).filter(Boolean), rating: r10 ? r10 / 10 : null, poster: posterFrom(poster),
      });
      if (lc.charAt(1) === "d") f.dub = true;
      f.vega = post;
      f.vegaSeason = Math.max(f.vegaSeason || 0, season || 0);
    }));
    return new Promise((resolve) => {
      let i = 0;
      const step = () => {
        const end = Math.min(jobs.length, i + 400);
        for (; i < end; i++) { try { jobs[i](); } catch (e) { /* one bad row */ } }
        if (i < jobs.length) FL.util.idle(step); else { FL.catalogue.touch(); resolve(jobs.length); }
      };
      step();
    });
  }
  /* Vega's newest web series (the catalogue's shows from Vega, most recent upload first). */
  function vegaShows(limit) {
    return loadVega().then(() => FL.catalogue.all().filter((f) => f.type === "series" && f.vega).sort((a, b) => b.vega - a.vega).slice(0, limit || 30));
  }
  /* Newest Hindi dubbed films. */
  function vegaDubbed(limit) {
    // Recent releases only: Vega re-uploads old titles too, and "just in" should mean new films.
    const since = new Date().getFullYear() - 3;
    return loadVega().then(() => FL.catalogue.all().filter((f) => f.type !== "series" && f.dub && f.vega && f.year >= since && !/behind the scenes|making of/i.test(f.title))
      .sort((a, b) => b.vega - a.vega).slice(0, limit || 30));
  }

  restore();
  // After the first screen is up.
  setTimeout(() => FL.util.idle(() => loadVega()), 1500);

  FL.remote = { search, cached, touch, ingest, yearPage, wikiYear, show, realityShows, indianSeries, newEpisodes, showCatalog, byId, WIKI_LISTS, loadVega, vegaShows, vegaDubbed };
})(window.FL = window.FL || {});
