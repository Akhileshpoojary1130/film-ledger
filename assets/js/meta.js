/* Iris — remote metadata: IMDb id resolution, Cinemeta details (runtime, director, cast, trailer), and the
   poster chain: Metahub by IMDb id → bundled artwork → Wikipedia → IMDb artwork via search → typographic placeholder. */
(function (FL) {
  "use strict";

  const { storage, fetchJSON, limiter, debounce, normalize } = FL.util;

  const META_KEY = "film_ledger_meta_v1";
  const IMDB_KEY = "film_ledger_imdb_v1";
  const POSTER_KEY = "film_ledger_posters_v14"; // shared with v3 so its Wikipedia poster cache is reused
  const MISS_KEY = "film_ledger_poster_miss_v2";
  const META_CAP = 900;
  const META_TTL = 30 * 864e5;
  const MISS_TTL = 7 * 864e5;
  const CINEMETA = "https://v3-cinemeta.strem.io";

  let metaCache = storage.get(META_KEY, {});
  const imdbMap = storage.get(IMDB_KEY, {}); // filmId -> "tt…" (hit) | timestamp (miss)
  const posterCache = storage.get(POSTER_KEY, {});
  let posterMiss = storage.get(MISS_KEY, {}); // filmId -> { wiki: ts, web: ts }

  const saveMeta = debounce(() => {
    if (!storage.set(META_KEY, metaCache)) { trimCaches(); storage.set(META_KEY, metaCache); }
  }, 800);
  const saveImdb = debounce(() => storage.set(IMDB_KEY, imdbMap), 800);
  const savePosters = debounce(() => { storage.set(POSTER_KEY, posterCache); storage.set(MISS_KEY, posterMiss); }, 800);

  function trimCaches() {
    const keys = Object.keys(metaCache).sort((a, b) => (metaCache[b].at || 0) - (metaCache[a].at || 0));
    const keep = {};
    keys.slice(0, 250).forEach((k) => { keep[k] = metaCache[k]; });
    metaCache = keep;
    posterMiss = {};
    storage.set(META_KEY, metaCache);
    storage.set(MISS_KEY, posterMiss);
  }

  /* ---------- Cinemeta search (shared, cached) ---------- */

  // Typed searches get their own lane so background poster/id lookups never delay them.
  const liveQueue = limiter(3);
  const bgQueue = limiter(3);
  const searchCache = new Map();

  function cinemetaSearch(query, live) {
    const q = normalize(query);
    if (!q) return Promise.resolve([]);
    if (searchCache.has(q)) return searchCache.get(q);
    const url = CINEMETA + "/catalog/movie/top/search=" + encodeURIComponent(q) + ".json";
    const p = (live ? liveQueue : bgQueue)(() => fetchJSON(url, { timeout: 12000 }))
      .then((d) => (d && d.metas) || [])
      .catch(() => { searchCache.delete(q); return []; });
    searchCache.set(q, p);
    return p;
  }

  /* Amazon-hosted IMDb artwork can be requested at any width. */
  function sized(url, size) {
    if (!url || url.indexOf("media-amazon.com") === -1) return url;
    return url.replace(/\._V1_[^.]*\./, "._V1_SX" + (size === "medium" ? 600 : 360) + ".");
  }

  /* ---------- IMDb ids ---------- */

  function idFor(film) {
    if (film.imdbId) return film.imdbId;
    const v = imdbMap[film.id];
    return typeof v === "string" ? v : "";
  }

  function setImdb(film, tt) {
    if (!/^tt\d{5,}$/.test(tt)) return false;
    imdbMap[film.id] = tt;
    FL.catalogue.linkImdb(film, tt);
    saveImdb();
    return true;
  }

  function cleanTitle(title) {
    return title.replace(/\s*\[.*?\]|\s*\(.*?\)/g, "").trim();
  }

  /* Cinemeta search ranks by popularity, not by year — "Border" returns the 2018 Swedish film first.
     Only accept a result whose normalised title matches and whose year is within one of ours. */
  function pickMatch(metas, film) {
    const strip = (s) => normalize(s).replace(/^(the|a|an) /, "");
    const want = strip(cleanTitle(film.title));
    const wantFlat = want.replace(/ /g, "");
    const year = (m) => parseInt(m.releaseInfo || m.year, 10) || 0;
    const tiers = [
      (n, dy) => n === want && dy === 0,
      (n, dy) => n === want && dy === 1,
      (n, dy) => n.replace(/ /g, "") === wantFlat && dy <= 1, // "K.G.F: Chapter 1" ~ "KGF: Chapter 1"
      // "Lagaan" ~ "Lagaan: Once Upon a Time in India" — only trusted with an exact year.
      (n, dy) => dy === 0 && (n.startsWith(want + " ") || want.startsWith(n + " ")),
    ];
    for (let t = 0; t < tiers.length; t++) {
      const hit = metas.find((m) => tiers[t](strip(m.name || ""), Math.abs(year(m) - film.year)));
      if (hit && /^tt\d+$/.test(hit.imdb_id || hit.id || "")) return hit;
    }
    return null;
  }

  const inflightResolve = new Map();

  function resolveImdb(film) {
    const known = idFor(film);
    if (known) return Promise.resolve(known);
    const missAt = imdbMap[film.id];
    if (typeof missAt === "number" && Date.now() - missAt < MISS_TTL) return Promise.resolve("");
    if (inflightResolve.has(film.id)) return inflightResolve.get(film.id);

    const p = cinemetaSearch(cleanTitle(film.title), false)
      .then((metas) => {
        const hit = pickMatch(metas, film);
        const tt = hit ? hit.imdb_id || hit.id : "";
        if (tt) {
          setImdb(film, tt);
          if (hit.poster && !film.poster) notePoster(film, hit.poster);
        } else if (metas.length) {
          imdbMap[film.id] = Date.now(); // searched fine, no match — don't ask again for a week
          saveImdb();
        }
        return tt;
      })
      .finally(() => inflightResolve.delete(film.id));
    inflightResolve.set(film.id, p);
    return p;
  }

  /* ---------- details ---------- */

  function compact(m) {
    const trailer = (m.trailerStreams && m.trailerStreams[0] && m.trailerStreams[0].ytId) ||
      (m.trailers && m.trailers[0] && m.trailers[0].source) || "";
    return {
      name: m.name || "",
      year: parseInt(m.year || m.releaseInfo, 10) || 0,
      genres: (m.genres || m.genre || []).slice(0, 4),
      runtime: parseInt(m.runtime, 10) || 0,
      directors: (m.director || []).slice(0, 3),
      cast: (m.cast || []).slice(0, 8),
      writers: (m.writer || []).slice(0, 3),
      desc: String(m.description || "").slice(0, 1200),
      tmdb: m.moviedb_id || 0,
      rating: parseFloat(m.imdbRating) || 0,
      trailer,
      backdrop: !!m.background,
      poster: m.poster || "",
      country: m.country || "",
      awards: m.awards || "",
      released: m.released ? String(m.released).slice(0, 10) : "",
      at: Date.now(),
    };
  }

  function cached(film) {
    const tt = idFor(film);
    return tt ? metaCache[tt] || null : null;
  }

  const inflightMeta = new Map();

  function fetchMeta(tt) {
    const hit = metaCache[tt];
    if (hit && Date.now() - hit.at < META_TTL) return Promise.resolve(hit);
    if (inflightMeta.has(tt)) return inflightMeta.get(tt);
    const p = bgQueue(() => fetchJSON(CINEMETA + "/meta/movie/" + tt + ".json"))
      .then((d) => {
        if (!d || !d.meta) return hit || null;
        const m = compact(d.meta);
        metaCache[tt] = m;
        if (Object.keys(metaCache).length > META_CAP) trimCaches();
        saveMeta();
        return m;
      })
      .catch(() => hit || null)
      .finally(() => inflightMeta.delete(tt));
    inflightMeta.set(tt, p);
    return p;
  }

  function applyDetails(film, m, tt) {
    FL.store.setDetails(film.id, { runtime: m.runtime, directors: m.directors, imdbId: tt });
    if (film.remote && (!film.genres.length || !film.rating || !film.country)) {
      FL.catalogue.updateRemote(film, { title: m.name, year: m.year, genres: m.genres, rating: m.rating, country: m.country, desc: m.desc, released: m.released });
      if (FL.remote) FL.remote.touch(film);
    }
  }

  /* Resolves to compact metadata or null. Never rejects. */
  function details(film) {
    return resolveImdb(film).then((tt) => {
      if (!tt) return null;
      return fetchMeta(tt).then((m) => {
        if (m) applyDetails(film, m, tt);
        return m;
      });
    });
  }

  /* ---------- artwork ---------- */

  function wikiKey(film) { return encodeURIComponent(film.wiki || film.title); }

  function notePoster(film, url) {
    if (!url || posterCache[wikiKey(film)]) return;
    posterCache[wikiKey(film)] = url;
    savePosters();
  }

  /* Ordered list of poster URLs to try; the <img> error handler walks it. */
  function posterCandidates(film, size) {
    const list = [];
    const tt = idFor(film);
    const own = sized(film.poster, size);
    if (film.remote && own) list.push(own);
    if (tt) list.push("https://images.metahub.space/poster/" + (size || "small") + "/" + tt + "/img");
    if (own && list.indexOf(own) === -1) list.push(own);
    const extra = sized(posterCache[wikiKey(film)], size);
    if (extra && list.indexOf(extra) === -1) list.push(extra);
    return list;
  }

  function backdrop(film) {
    const tt = idFor(film);
    const m = tt && metaCache[tt];
    if (tt && (!m || m.backdrop)) return "https://images.metahub.space/background/medium/" + tt + "/img";
    return "";
  }

  const posterListeners = new Set();
  const announce = (film, url) => posterListeners.forEach((fn) => fn(film, url));
  const wikiQueue = limiter(2);
  let pending = new Map();
  let flushTimer = 0;

  const missed = (film, kind) => {
    const m = posterMiss[film.id];
    return !!(m && m[kind] && Date.now() - m[kind] < MISS_TTL);
  };
  const markMiss = (film, kind) => {
    posterMiss[film.id] = Object.assign({}, posterMiss[film.id], { [kind]: Date.now() });
    savePosters();
  };

  function wantsLookup(film) {
    if (posterCache[wikiKey(film)]) return false;
    return !(missed(film, "wiki") && missed(film, "web"));
  }

  /* Called for films whose artwork is missing or failed to load. */
  function requestPoster(film) {
    if (!wantsLookup(film) || pending.has(film.id)) return;
    if (missed(film, "wiki")) { webPoster(film); return; }
    pending.set(film.id, film);
    if (!flushTimer) flushTimer = setTimeout(flush, 80);
  }

  function flush() {
    flushTimer = 0;
    const batch = Array.from(pending.values());
    pending = new Map();
    for (let i = 0; i < batch.length; i += 15) wikiLookup(batch.slice(i, i + 15));
  }

  function titlesFor(film) {
    const list = [];
    if (film.year) list.push(film.title + " (" + film.year + " film)");
    if (film.wiki && !/^List of /.test(film.wiki) && !/\((franchise|novel|directors?)\)$/.test(film.wiki)) list.push(film.wiki);
    list.push(film.title + " (film)");
    return list;
  }

  function wikiLookup(batch) {
    const titles = [];
    batch.forEach((f) => titlesFor(f).forEach((t) => { if (titles.indexOf(t) === -1) titles.push(t); }));
    const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages" +
      "&piprop=thumbnail&pithumbsize=400&pilicense=any&titles=" + encodeURIComponent(titles.slice(0, 50).join("|"));

    wikiQueue(() => fetchJSON(url)).then((data) => {
      const q = (data && data.query) || {};
      const alias = {};
      (q.normalized || []).forEach((n) => { alias[n.from] = n.to; });
      (q.redirects || []).forEach((r) => { alias[r.from] = r.to; });
      const pages = {};
      Object.values(q.pages || {}).forEach((p) => { pages[p.title] = p; });
      const follow = (t) => {
        let cur = t;
        for (let i = 0; i < 3 && alias[cur]; i++) cur = alias[cur];
        return pages[cur];
      };
      batch.forEach((film) => {
        const page = titlesFor(film).map(follow).find((p) => p && p.thumbnail && p.thumbnail.source);
        if (page) {
          notePoster(film, page.thumbnail.source);
          announce(film, page.thumbnail.source);
        } else {
          markMiss(film, "wiki");
          webPoster(film);
        }
      });
    }).catch(() => { /* offline: try again next session */ });
  }

  /* Last resort: find the film on IMDb (via Cinemeta search) and use its poster. */
  function webPoster(film) {
    if (missed(film, "web")) return;
    cinemetaSearch(cleanTitle(film.title), false).then((metas) => {
      const hit = pickMatch(metas, film);
      if (hit && !idFor(film)) setImdb(film, hit.imdb_id || hit.id);
      const url = hit && hit.poster ? sized(hit.poster) : "";
      if (url) {
        notePoster(film, url);
        announce(film, url);
      } else if (metas.length) {
        markMiss(film, "web");
      }
    });
  }

  FL.meta = {
    idFor, setImdb, resolveImdb, details, fetchMeta, cached, cinemetaSearch, sized,
    posterCandidates, backdrop, requestPoster, wantsLookup, notePoster,
    onPoster(fn) { posterListeners.add(fn); return () => posterListeners.delete(fn); },
    trimCaches,
    clearCaches() {
      metaCache = {};
      posterMiss = {};
      Object.keys(posterCache).forEach((k) => delete posterCache[k]);
      [META_KEY, MISS_KEY, POSTER_KEY, "film_ledger_poster_miss_v1"].forEach((k) => storage.remove(k));
    },
  };
})(window.FL = window.FL || {});
