/* Iris — personal library (watch history, watchlist, ratings, show episodes, progress) and preferences.
   Lives in localStorage; FL.persist can mirror it to a file on disk, and export/import is the manual backup. */
(function (FL) {
  "use strict";

  const { storage, todayISO } = FL.util;

  const LIB_KEY = "film_ledger_library_v1";
  const PREFS_KEY = "film_ledger_prefs_v4";
  const LEGACY_WATCHED_KEY = "film_ledger_watched_v3";
  const LEGACY_PREFS_KEY = "film_ledger_preferences_v3";

  const DEFAULT_PREFS = {
    name: "",
    // The default look: Cupertino, high-contrast dark, clear glass over a slow aurora, calm motion.
    appearance: { theme: "mac", mode: "dark", accent: "", palette: "contrast", glass: "clear", ambient: "aurora", motion: "calm" },
    home: { continueMax: 3 },
    browse: { lang: "all", year: "all", genre: "", region: "", minRating: 0, status: "all", sort: "popular", view: "grid" },
    years: { lang: "all", show: "all", order: "rating", view: "grid" },
    library: { sort: "recent", view: "grid" },
    recent: [],
    searches: [],
    servers: {},
    lastServer: "",
    friends: [],
  };

  let lib = { v: 1, films: {} };
  let prefs = JSON.parse(JSON.stringify(DEFAULT_PREFS));
  let version = 1;
  const listeners = new Set();

  /* ---------- persistence ---------- */

  function load() {
    const saved = storage.get(LIB_KEY, null);
    if (saved && saved.films && typeof saved.films === "object") {
      lib = saved;
      Object.values(lib.films).forEach((e) => { if (!e.episodes) e.episodes = {}; if (!e.watches) e.watches = []; });
      // Titles merged in the catalogue since this was saved (a film listed under two languages) move to the kept id.
      let moved = false;
      Object.keys(lib.films).forEach((id) => {
        const to = FL.catalogue.canonical(id);
        if (to === id) return;
        if (!lib.films[to]) lib.films[to] = Object.assign(lib.films[id], { id: to });
        delete lib.films[id];
        moved = true;
      });
      if (moved) storage.set(LIB_KEY, lib);
    } else {
      migrateLegacy();
    }
    const savedPrefs = storage.get(PREFS_KEY, null);
    if (savedPrefs) {
      prefs = Object.assign({}, prefs, savedPrefs);
      ["appearance", "home", "browse", "years", "library"].forEach((k) => { prefs[k] = Object.assign({}, DEFAULT_PREFS[k], savedPrefs[k]); });
    } else {
      migrateLegacyPrefs();
    }
  }

  /* v3 stored { legacyId: true } for watched films and nothing else. */
  function migrateLegacy() {
    const legacy = storage.get(LEGACY_WATCHED_KEY, null);
    lib = { v: 1, films: {}, migratedFrom: legacy ? "v3" : undefined };
    if (!legacy) return;
    const now = Date.now();
    Object.keys(legacy).forEach((legacyId) => {
      if (!legacy[legacyId]) return;
      const film = FL.catalogue.get(legacyId);
      if (!film) return;
      const e = blank(film);
      e.seen = true;
      e.added = now;
      lib.films[film.id] = e;
    });
    persist();
  }

  function migrateLegacyPrefs() {
    const old = storage.get(LEGACY_PREFS_KEY, null);
    if (!old) return;
    if (old.lang) prefs.years.lang = old.lang === "Superhero" ? "Superhero" : old.lang;
    if (old.view) prefs.years.view = old.view === "grid" ? "grid" : "list";
  }

  function persist() {
    if (!storage.set(LIB_KEY, lib)) {
      // Quota: shed disposable caches first, then retry once.
      if (FL.meta) FL.meta.trimCaches();
      if (!storage.set(LIB_KEY, lib) && FL.ui) FL.ui.toast("Couldn't save: browser storage is full. Export a backup from Settings.");
    }
  }

  function savePrefs() { storage.set(PREFS_KEY, prefs); }

  /* Ask the browser not to evict this site's storage under disk pressure (it still clears on "Clear browsing data"). */
  let persistAsked = false;
  function askPersistence() {
    if (persistAsked || !navigator.storage || !navigator.storage.persist) return;
    persistAsked = true;
    navigator.storage.persisted().then((yes) => { if (!yes) navigator.storage.persist(); }).catch(() => {});
  }

  function emit(detail) {
    version++;
    listeners.forEach((fn) => {
      try { fn(detail); } catch (e) { console.error(e); }
    });
  }

  window.addEventListener("storage", (e) => {
    if (e.key === LIB_KEY) {
      const saved = storage.get(LIB_KEY, null);
      if (saved && saved.films) { lib = saved; emit({ id: null, kind: "sync" }); }
    }
  });

  /* ---------- entries ---------- */

  function blank(film) {
    const m = FL.meta && FL.meta.cached(film);
    return {
      id: film.id,
      type: film.type === "series" ? "series" : "movie",
      title: film.title,
      year: film.year,
      lang: film.lang,
      genres: film.genres.slice(),
      imdbId: film.imdbId || "",
      seen: false,
      watches: [],
      episodes: {},
      listed: false,
      listedAt: 0,
      fav: false,
      rating: 0,
      note: "",
      added: Date.now(),
      updated: Date.now(),
      runtime: (m && m.runtime) || undefined,
      directors: m && m.directors && m.directors.length ? m.directors.slice(0, 3) : undefined,
    };
  }

  function isEmpty(e) {
    return !e.seen && !e.watches.length && !e.listed && !e.fav && !e.rating && !e.note && !e.progress && !Object.keys(e.episodes || {}).length;
  }

  const isShow = (e) => e && e.type === "series";
  const isWatched = (e) => !!(e && !isShow(e) && (e.seen || e.watches.length));

  /* Watching a film takes it off the watchlist; adding a watched film back (to rewatch) is allowed. */
  function markWatched(e) {
    if (!isWatched(e)) e.seenAt = Date.now(); // when you ticked it — the diary shows undated films on this day
    e.seen = true;
    e.listed = false;
    e.listedAt = 0;
  }

  /* Moments of actual watching (for "when do you watch" stats): logged watches today and player sessions. */
  function stamp(e) {
    e.times = (e.times || []).concat(Date.now()).slice(-40);
  }

  function update(film, mutate, kind) {
    let e = lib.films[film.id];
    if (!e) e = blank(film);
    if (!e.episodes) e.episodes = {};
    mutate(e);
    e.updated = Date.now();
    if (isEmpty(e)) delete lib.films[film.id];
    else lib.films[film.id] = e;
    persist();
    askPersistence();
    emit({ id: film.id, kind });
    return lib.films[film.id] || null;
  }

  const epKey = (s, ep) => s + ":" + ep;

  const api = {
    version: () => version,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    peek: (id) => lib.films[id],
    state(id) {
      const e = lib.films[id];
      if (!e) return { watched: false, listed: false, fav: false, rating: 0, count: 0, episodes: 0 };
      const episodes = Object.keys(e.episodes || {}).length;
      return { watched: isWatched(e), listed: e.listed, fav: e.fav, rating: e.rating, count: e.watches.length, episodes, watching: episodes > 0 };
    },
    entries: () => Object.values(lib.films),

    toggleList(film) {
      return update(film, (e) => { e.listed = !e.listed; e.listedAt = e.listed ? Date.now() : 0; }, "list");
    },
    setSeen(film, seen) {
      return update(film, (e) => {
        if (seen) markWatched(e);
        else { e.seen = false; e.watches = []; e.seenAt = 0; }
      }, "seen");
    },
    logWatch(film, date) {
      const d = date || todayISO();
      return update(film, (e) => {
        if (d === todayISO()) stamp(e);
        e.watches.push(d);
        e.watches.sort();
        e.listed = false;
        e.listedAt = 0;
      }, "watch");
    },
    removeWatch(film, index) {
      return update(film, (e) => {
        e.watches.splice(index, 1);
        if (!e.watches.length && e.rating) e.seen = true; // a rated film stays watched
      }, "watch");
    },
    setRating(film, value) {
      return update(film, (e) => {
        e.rating = value;
        if (value && !isShow(e) && !isWatched(e)) markWatched(e);
      }, "rating");
    },
    toggleFav(film) {
      return update(film, (e) => {
        e.fav = !e.fav;
        if (e.fav && !isShow(e) && !isWatched(e)) markWatched(e);
      }, "fav");
    },

    /* ----- shows ----- */
    episodeWatched(id, s, ep) {
      const e = lib.films[id];
      return !!(e && e.episodes && e.episodes[epKey(s, ep)]);
    },
    toggleEpisode(show, s, ep, on) {
      return update(show, (e) => {
        const k = epKey(s, ep);
        const next = on == null ? !e.episodes[k] : on;
        if (next) e.episodes[k] = todayISO();
        else delete e.episodes[k];
        if (next) { e.listed = false; e.listedAt = 0; }
      }, "episode");
    },
    setEpisodes(show, list, on) {
      return update(show, (e) => {
        list.forEach(([s, ep]) => {
          const k = epKey(s, ep);
          if (on) { if (!e.episodes[k]) e.episodes[k] = todayISO(); } else delete e.episodes[k];
        });
        if (on) { e.listed = false; e.listedAt = 0; }
      }, "episode");
    },
    shows() {
      return api.entries().filter((e) => isShow(e) && (e.listed || e.fav || Object.keys(e.episodes).length || e.progress))
        .sort((a, b) => b.updated - a.updated);
    },

    setProgress(film, progress) {
      // Progress writes are frequent; they don't bump `updated` ordering in lists.
      let e = lib.films[film.id];
      if (!e) { e = blank(film); lib.films[film.id] = e; }
      e.progress = progress;
      // One timestamp per sitting (a new one after a two-hour gap) feeds the "when you watch" stats.
      const last = e.times && e.times[e.times.length - 1];
      if (!last || Date.now() - last > 2 * 3600e3) stamp(e);
      persist();
      emit({ id: film.id, kind: "progress" });
    },
    clearProgress(id) {
      const e = lib.films[id];
      if (!e || !e.progress) return;
      delete e.progress;
      if (isEmpty(e)) delete lib.films[id];
      persist();
      emit({ id, kind: "progress" });
    },
    /* Runtime / directors fetched from metadata, kept so stats work offline. */
    setDetails(id, details) {
      const e = lib.films[id];
      if (!e) return;
      let changed = false;
      if (details.runtime && e.runtime !== details.runtime) { e.runtime = details.runtime; changed = true; }
      if (details.directors && details.directors.length && !e.directors) { e.directors = details.directors.slice(0, 3); changed = true; }
      if (details.imdbId && !e.imdbId) { e.imdbId = details.imdbId; changed = true; }
      if (changed) { persist(); version++; }
    },

    watchlist() {
      return api.entries().filter((e) => e.listed).sort((a, b) => b.listedAt - a.listedAt);
    },
    watched() {
      return api.entries().filter(isWatched);
    },
    favorites() {
      return api.entries().filter((e) => e.fav).sort((a, b) => b.updated - a.updated);
    },
    /* Flat diary of films, newest first: one row per dated watch, plus films ticked without a date on the day
       you ticked them (marked, so the calendar can tell them apart from real viewings). */
    diary() {
      const rows = [];
      const iso = (ms) => { const d = new Date(ms); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
      api.entries().forEach((e) => {
        if (isShow(e)) return;
        e.watches.forEach((date, i) => rows.push({ id: e.id, date, entry: e, rewatch: i > 0 }));
        if (!e.watches.length && isWatched(e)) rows.push({ id: e.id, date: iso(e.seenAt || e.added || e.updated), entry: e, marked: true });
      });
      rows.sort((a, b) => (b.date === a.date ? b.entry.updated - a.entry.updated : b.date.localeCompare(a.date)));
      return rows;
    },
    continueWatching() {
      return api.entries()
        .filter((e) => e.progress && e.progress.d > 0 && e.progress.t > 90 && e.progress.t / e.progress.d < 0.92)
        .sort((a, b) => b.progress.at - a.progress.at);
    },
    isWatched,

    /* ---------- prefs ---------- */
    prefs: () => prefs,
    setPref(key, value) { prefs[key] = value; savePrefs(); },
    patchPref(key, patch) { prefs[key] = Object.assign({}, prefs[key], patch); savePrefs(); },
    pushRecent(id) {
      prefs.recent = [id].concat((prefs.recent || []).filter((x) => x !== id)).slice(0, 8);
      savePrefs();
    },
    pushSearch(q) {
      const clean = String(q || "").trim().slice(0, 60);
      if (clean.length < 2) return;
      prefs.searches = [clean].concat((prefs.searches || []).filter((x) => x.toLowerCase() !== clean.toLowerCase())).slice(0, 8);
      savePrefs();
    },
    clearSearches() { prefs.searches = []; savePrefs(); },

    /* ---------- backup ---------- */
    snapshot() {
      return { app: "film-ledger", version: 2, exportedAt: new Date().toISOString(), name: prefs.name, library: lib.films };
    },
    exportJSON() {
      return JSON.stringify(api.snapshot(), null, 1);
    },

    /* Letterboxd-compatible CSV (Title, Year, imdbID, WatchedDate, Rating10, Rewatch). */
    exportCSV() {
      const q = (v) => {
        const s = String(v == null ? "" : v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const lines = ["Title,Year,imdbID,WatchedDate,Rating10,Rewatch"];
      api.watched().forEach((e) => {
        const dates = e.watches.length ? e.watches : [""];
        dates.forEach((d, i) => {
          lines.push([e.title, e.year, e.imdbId || FL.meta.idFor(e) || "", d, e.rating || "", i > 0 ? "true" : ""].map(q).join(","));
        });
      });
      return lines.join("\n");
    },

    /* Returns the number of titles imported. mode: "merge" | "replace". */
    importJSON(data, mode) {
      if (!data || data.app !== "film-ledger" || !data.library || typeof data.library !== "object") {
        throw new Error("This file isn't an Iris backup.");
      }
      const incoming = {};
      Object.keys(data.library).forEach((key) => {
        const src = data.library[key];
        if (!src || typeof src !== "object") return;
        const id = FL.catalogue.canonical(String(src.id || key));
        let film = FL.catalogue.get(id);
        // Titles that came from the web are rebuilt from the backup's own snapshot.
        if (!film && /^(tt\d+|wk\d{4}_)/.test(id) && src.title) {
          film = FL.catalogue.addRemote({
            id, imdbId: /^tt/.test(id) ? id : src.imdbId || "", type: src.type, title: String(src.title),
            year: +src.year || 0, genres: Array.isArray(src.genres) ? src.genres : [], lang: src.lang,
          });
        }
        if (!film) return;
        const base = blank(film);
        const watches = Array.isArray(src.watches) ? src.watches.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
        const episodes = {};
        if (src.episodes && typeof src.episodes === "object") {
          Object.keys(src.episodes).forEach((k) => { if (/^\d+:\d+$/.test(k)) episodes[k] = String(src.episodes[k]).slice(0, 10); });
        }
        const now = Date.now();
        const times = Array.isArray(src.times) ? src.times.map(Number).filter((t) => t > 1e12 && t < now + 864e5).slice(-40) : [];
        const pr = src.progress;
        let progress;
        if (pr && typeof pr === "object" && +pr.d > 0 && +pr.t >= 0) {
          progress = { t: Math.floor(+pr.t), d: Math.floor(+pr.d), at: +pr.at || 0 };
          if (typeof pr.srv === "string") progress.srv = pr.srv.slice(0, 24);
          if (+pr.s && +pr.e) { progress.s = +pr.s; progress.e = +pr.e; }
          if (pr.approx) progress.approx = true;
        }
        incoming[film.id] = Object.assign(base, {
          seen: !!src.seen,
          seenAt: +src.seenAt || 0,
          times: times.length ? times : undefined,
          progress,
          watches: watches.sort(),
          episodes,
          listed: !!src.listed,
          listedAt: +src.listedAt || 0,
          fav: !!src.fav,
          rating: Math.max(0, Math.min(10, Math.round(+src.rating || 0))),
          note: typeof src.note === "string" ? src.note.slice(0, 4000) : "",
          added: +src.added || Date.now(),
          updated: +src.updated || Date.now(),
          runtime: +src.runtime || undefined,
          directors: Array.isArray(src.directors) ? src.directors.slice(0, 3).map(String) : undefined,
        });
      });

      if (mode === "replace") {
        lib.films = incoming;
      } else {
        Object.keys(incoming).forEach((id) => {
          const inc = incoming[id];
          const cur = lib.films[id];
          if (!cur) { lib.films[id] = inc; return; }
          const newer = inc.updated > cur.updated;
          cur.seen = cur.seen || inc.seen;
          cur.watches = Array.from(new Set(cur.watches.concat(inc.watches))).sort();
          cur.episodes = Object.assign({}, inc.episodes, cur.episodes);
          cur.fav = cur.fav || inc.fav;
          cur.listed = !isWatched(cur) && (cur.listed || inc.listed);
          cur.listedAt = cur.listed ? Math.max(cur.listedAt || 0, inc.listedAt || 0) || Date.now() : 0;
          if (isWatched(cur) && !cur.seenAt) cur.seenAt = inc.seenAt || cur.updated;
          // Watch moments from both devices; the same moment copied back and forth (rounded to the minute) counts once.
          if (inc.times) {
            const all = (cur.times || []).concat(inc.times).sort((a, b) => a - b);
            cur.times = all.filter((t, i) => i === 0 || t - all[i - 1] > 120e3).slice(-40);
          }
          if (inc.progress && (!cur.progress || (inc.progress.at || 0) > (cur.progress.at || 0))) cur.progress = inc.progress;
          if (!cur.rating || (newer && inc.rating)) cur.rating = inc.rating;
          if (!cur.note || (newer && inc.note)) cur.note = inc.note;
          cur.runtime = cur.runtime || inc.runtime;
          cur.directors = cur.directors || inc.directors;
          cur.updated = Math.max(cur.updated, inc.updated);
        });
      }
      if (data.name && !prefs.name) { prefs.name = String(data.name).slice(0, 40); savePrefs(); }
      persist();
      emit({ id: null, kind: "import" });
      return Object.keys(incoming).length;
    },

    resetLibrary() {
      lib = { v: 1, films: {} };
      persist();
      emit({ id: null, kind: "reset" });
    },

    storageBytes() {
      let total = 0;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf("film_ledger") === 0) total += (localStorage.getItem(k) || "").length * 2;
        }
      } catch (e) { /* ignore */ }
      return total;
    },
  };

  FL.store = api;
  load();
})(window.FL = window.FL || {});
