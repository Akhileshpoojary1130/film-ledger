/* Iris — AI on the client: the daily fact-check's fixes on film pages (with the "AI checked" badge), and Ask Iris,
   the search that understands what you mean ("feel-good Hindi comedy like 3 Idiots", "the film where a man hides a
   body under a police station") and picks from what you watch.

   Checks are read in batches from /api/ai and kept for a few days; a film opened that has no check yet is asked for,
   so tomorrow's run does it first. */
(function (FL) {
  "use strict";

  const { storage, debounce, esc } = FL.util;
  const KEY = "iris_ai_checks_v1";
  const HIT_TTL = 3 * 864e5;
  const MISS_TTL = 12 * 36e5;
  const TT = /^tt\d{5,10}$/;

  let cache = storage.get(KEY, {}); // tt -> { r: check | null, t }
  const save = debounce(() => {
    const keys = Object.keys(cache);
    if (keys.length > 1500) keys.sort((a, b) => cache[a].t - cache[b].t).slice(0, keys.length - 1200).forEach((k) => delete cache[k]);
    storage.set(KEY, cache);
  }, 1000);

  /* ---------- checks ---------- */

  const waiting = new Map(); // tt -> [resolve]
  let wantIds = new Set();

  const flush = debounce(() => {
    const ids = [...waiting.keys()].slice(0, 40);
    if (!ids.length) return;
    const resolvers = ids.map((id) => { const r = waiting.get(id); waiting.delete(id); return [id, r]; });
    fetch("/api/ai?ids=" + ids.join(","))
      .then((r) => (r.ok ? r.json() : { checks: {} }))
      .catch(() => null)
      .then((d) => {
        const checks = (d && d.checks) || {};
        resolvers.forEach(([id, rs]) => {
          const rec = tidy(checks[id] || null);
          if (d) { cache[id] = { r: rec, t: Date.now() }; save(); }
          if (!rec && d) want(id);
          rs.forEach((fn) => fn(rec));
        });
        if (waiting.size) flush();
      });
  }, 120);

  const sendWant = debounce(() => {
    const ids = [...wantIds];
    wantIds = new Set();
    if (!ids.length) return;
    fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ want: ids }) }).catch(() => {});
  }, 3000);

  function want(tt) { wantIds.add(tt); sendWant(); }

  /* The check for an IMDb id, or null. Never rejects. */
  function check(tt) {
    if (!TT.test(tt || "")) return Promise.resolve(null);
    const c = cache[tt];
    if (c && Date.now() - c.t < (c.r ? HIT_TTL : MISS_TTL)) return Promise.resolve(c.r);
    return new Promise((resolve) => {
      if (!waiting.has(tt)) waiting.set(tt, []);
      waiting.get(tt).push(resolve);
      flush();
    });
  }

  // A language filled in where there was none isn't a correction (older checks did that): drop it.
  function tidy(rec) {
    if (!rec || !rec.fixes || !rec.fixes.language || (rec.was && rec.was.language)) return rec;
    const fixes = Object.assign({}, rec.fixes);
    delete fixes.language;
    return Object.assign({}, rec, { fixes, verdict: rec.verdict === "fixed" && !Object.keys(fixes).length ? "ok" : rec.verdict });
  }
  const usable = (rec) => !!rec && (rec.verdict === "ok" || rec.verdict === "fixed");

  /* Cinemeta's details with the AI's fixes laid over them. */
  function merge(m, rec) {
    if (!m || !usable(rec)) return m;
    const f = rec.fixes || {};
    const out = Object.assign({}, m, { ai: rec });
    ["directors", "writers", "genres"].forEach((k) => { if (f[k] && f[k].length) out[k] = f[k].slice(); });
    if (f.cast && f.cast.length) {
      // The corrected leads first, then whoever else Cinemeta listed.
      const seen = new Set(f.cast.map((n) => FL.util.normalize(n)));
      out.cast = f.cast.concat((m.cast || []).filter((n) => !seen.has(FL.util.normalize(n))));
    }
    if (f.runtime) out.runtime = f.runtime;
    if (f.released) out.released = f.released;
    if (f.year) out.year = f.year;
    if (f.language) out.language = f.language;
    return out;
  }

  const LABEL = { directors: "Director", writers: "Writers", cast: "Lead cast", genres: "Genres", year: "Year", runtime: "Runtime", language: "Language", released: "Release date" };
  const show = (v, k) => (Array.isArray(v) ? (v.length ? v.join(", ") : "missing") : k === "runtime" && v ? v + " min" : v == null || v === "" ? "missing" : String(v));

  function fmtDay(iso) {
    const d = new Date(iso + "T12:00:00");
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  /* The badge at the top right of the film's hero; tap for what changed. */
  function badge(rec) {
    if (!usable(rec)) return "";
    const fixes = Object.keys(rec.fixes || {});
    const rows = fixes.map((k) => "<li><b>" + LABEL[k] + "</b><span><s>" + esc(show((rec.was || {})[k], k)) + "</s> → " + esc(show(rec.fixes[k], k)) + "</span></li>").join("");
    return '<button type="button" class="ai-badge" data-fa="ai-badge" aria-expanded="false" title="Details checked by AI">' + FL.ui.icon("spark") +
        "<span>AI checked</span></button>" +
      '<div class="ai-pop" hidden><p class="ai-pop-head">' + FL.ui.icon("spark") + "Checked by AI on " + esc(fmtDay(rec.at)) + "</p>" +
        (fixes.length ? "<ul>" + rows + "</ul>" : '<ul class="ai-ok-list">' + ["Director", "Writers", "Lead cast", "Genres", "Year", "Runtime"].map((x) => "<li>" + FL.ui.icon("check") + x + "</li>").join("") + "</ul><p>All looked right, so nothing changed.</p>") +
        '<p class="ai-pop-foot">Gemini compares these details with what it knows about the film and fixes only what it’s sure of. ' + esc(rec.model || "") + "</p></div>";
  }

  /* ---------- the model to try first (Settings → AI), status, scans ---------- */

  const MODELS = [["gemini-3.5-flash-lite", "3.5 Flash-Lite"], ["gemini-3.1-flash-lite", "3.1 Flash-Lite"]];
  const MODEL_KEY = "iris_ai_model_v1";
  function model(v) {
    if (v !== undefined) { try { localStorage.setItem(MODEL_KEY, v); } catch (e) { /* this visit only */ } return v; }
    try { return localStorage.getItem(MODEL_KEY) || MODELS[0][0]; } catch (e) { return MODELS[0][0]; }
  }

  /* Your own Gemini key (Settings → AI): kept on this device, sent only with your own AI requests to Iris's server,
     which uses it for them and never stores it. With one: no daily limits to speak of, and films you open are checked
     on their own (Auto-check). */
  const KEY_KEY = "iris_ai_userkey_v1";
  const AUTO_KEY = "iris_ai_auto_v1";
  const KEY_RE = /^AIza[0-9A-Za-z_-]{30,60}$/;
  function userKey(v) {
    if (v !== undefined) {
      try { if (v) localStorage.setItem(KEY_KEY, v.trim()); else localStorage.removeItem(KEY_KEY); } catch (e) { /* private mode */ }
      return v;
    }
    try { const k = localStorage.getItem(KEY_KEY) || ""; return KEY_RE.test(k) ? k : ""; } catch (e) { return ""; }
  }
  const validKey = (k) => KEY_RE.test(String(k || "").trim());
  function autoCheck(v) {
    if (v !== undefined) { try { localStorage.setItem(AUTO_KEY, v ? "1" : "0"); } catch (e) { /* this visit only */ } return v; }
    try { return localStorage.getItem(AUTO_KEY) !== "0"; } catch (e) { return true; }
  }

  function post(body) {
    const headers = { "content-type": "application/json" };
    const k = userKey();
    if (k) headers["x-gemini-key"] = k;
    return fetch("/api/ai", { method: "POST", headers, body: JSON.stringify(Object.assign({ model: model() }, body)) })
      .then((r) => r.json().catch(() => ({})).then((d) => {
        if (!r.ok || d.error) {
          if (d.error === "not-configured") ready.known = false;
          throw new Error(d.message || (d.error === "not-configured" ? "AI isn’t set up on this site yet." : "The AI couldn’t answer just now."));
        }
        return d;
      }), () => { throw new Error("AI needs a connection."); });
  }

  /* Is AI switched on for this site? Asked once a session (a local copy without /api just says no). */
  let statusP = null;
  function status(fresh) {
    if (!statusP || fresh) {
      statusP = fetch("/api/ai?status=1" + (fresh ? "&t=" + Date.now() : "")).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        .then((d) => { ready.known = !!(d && d.ai); return d; });
    }
    return statusP;
  }
  const ready = { known: null };
  function isReady() { return status().then(() => !!ready.known || !!userKey()); }

  /* Check one film right now; everyone sees the answer from then on. */
  function scan(tt) {
    return post({ scan: tt }).then((d) => {
      const rec = tidy(d.check || null);
      cache[tt] = { r: rec, t: Date.now() };
      save();
      return rec;
    });
  }

  const day = () => new Date().toISOString().slice(0, 10);

  /* AI picks for Home: asked once a day per device (or when your watched list has grown by five since). */
  const PICKS_KEY = "iris_ai_picks_v1";
  function picks(force) {
    const t = taste();
    const sig = day() + ":" + Math.floor(FL.store.watched().length / 3) + ":p2";
    const had = storage.get(PICKS_KEY, null);
    const toFilms = (d) => ({ understood: d.understood || "", picks: (d.picks || []).map((x) => ({ film: filmFor(x), why: x.why })).filter((x) => x.film && !FL.store.state(x.film.id).watched) });
    if (!force && had && had.sig === sig && had.data) return Promise.resolve(toFilms(had.data));
    return post({ picks: 1, taste: t, trending: FL.taste ? FL.taste.trending() : [] }).then((d) => {
      storage.set(PICKS_KEY, { sig, data: { understood: d.understood, picks: d.picks } });
      return toFilms(d);
    });
  }

  /* The Stats page's AI read: once a day per scope, or when the count changes. */
  const INSIGHT_KEY = "iris_ai_insight_v1";
  function insight(scope, stats) {
    const sig = day() + ":" + scope + ":" + stats.films;
    const all = storage.get(INSIGHT_KEY, {});
    const shape = (d) => Object.assign({}, d, { picks: (d.picks || []).map((x) => ({ film: filmFor(x), why: x.why })).filter((x) => x.film) });
    if (all[scope] && all[scope].sig === sig) return Promise.resolve(shape(all[scope].data));
    return post({ insight: 1, taste: taste(), stats }).then((d) => {
      all[scope] = { sig, data: d };
      Object.keys(all).slice(0, -6).forEach((k) => delete all[k]);
      storage.set(INSIGHT_KEY, all);
      return shape(d);
    });
  }

  /* "Will I like it?": the AI's verdict on one title for you, kept 14 days per title on this device. */
  const MATCH_KEY = "iris_ai_match_v1";
  function aiMatch(film, meta) {
    const all = storage.get(MATCH_KEY, {});
    const sig = FL.store.watched().length >> 2; // ask again once you've watched a few more
    const had = all[film.id];
    if (had && had.sig === sig && Date.now() - had.t < 14 * 864e5) return Promise.resolve(had.d);
    const m = meta || {};
    return post({ match: { title: film.title, year: film.year, kind: film.type, genres: (m.genres && m.genres.length ? m.genres : film.genres) || [],
      directors: m.directors || [], cast: (m.cast || []).slice(0, 8), language: FL.catalogue.filmLang(film), rating: film.rating || m.rating || 0, desc: (m.desc || film.desc || "").slice(0, 500) },
      taste: taste() }).then((d) => {
      all[film.id] = { sig, t: Date.now(), d };
      const ks = Object.keys(all);
      if (ks.length > 300) ks.sort((a, b) => all[a].t - all[b].t).slice(0, 60).forEach((k) => delete all[k]);
      storage.set(MATCH_KEY, all);
      return d;
    });
  }

  /* ---------- Ask Iris ---------- */

  function taste() {
    if (FL.taste) return FL.taste.forAI();
    const get = (e) => FL.catalogue.get(e.id);
    const watched = FL.store.watched().map((e) => ({ e, f: get(e) })).filter((x) => x.f);
    const label = (f) => f.title + (f.year ? " (" + f.year + ")" : "");
    const recent = watched.slice().sort((a, b) => (b.e.updated || 0) - (a.e.updated || 0));
    const loved = watched.filter((x) => x.e.rating >= 8 || x.e.fav).map((x) => label(x.f));
    const count = (pick) => {
      const n = new Map();
      watched.forEach((x) => pick(x.f).forEach((k) => k && n.set(k, (n.get(k) || 0) + 1)));
      return [...n.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    };
    return {
      loved: loved.slice(0, 15),
      recent: recent.slice(0, 20).map((x) => label(x.f)),
      watched: recent.slice(0, 60).map((x) => x.f.title),
      genres: count((f) => f.genres || []).slice(0, 6),
      languages: count((f) => [FL.catalogue.filmLang(f)]).filter((l) => l !== "World").slice(0, 4),
    };
  }

  /* An answer as an Iris film: the one Iris has (by IMDb id, or title and year), else a web title its page fills in. */
  function filmFor(p) {
    let f = p.imdb ? FL.catalogue.byImdb(p.imdb) || FL.catalogue.get(p.imdb) : null;
    if (!f && p.kind !== "series") f = FL.catalogue.findLocal(p.imdb || "", p.title, p.year);
    if (!f && p.imdb) f = FL.catalogue.addRemote({ id: p.imdb, imdbId: p.imdb, type: p.kind, title: p.title, year: p.year || 0, pop: 20 });
    return f || null;
  }

  const askCache = new Map();

  /* Resolves to { understood, picks: [{ film, why }] }; rejects with a message to show. */
  function ask(q) {
    const key = FL.util.normalize(q);
    if (askCache.has(key)) return askCache.get(key);
    const p = post({ ask: q, taste: taste() })
      .then((d) => ({
        understood: d.understood || "",
        picks: (d.picks || []).map((x) => ({ film: filmFor(x), why: x.why })).filter((x) => x.film),
      }))
      .catch((err) => { askCache.delete(key); throw err; });
    askCache.set(key, p);
    return p;
  }

  /* Reads like a description rather than a title: worth offering first. */
  const wordy = (q) => q.trim().split(/\s+/).length >= 4 || /\b(like|similar|about|where|movies?|films?|shows?|series|something|recommend|best|feel.?good|funny|scary)\b/i.test(q);

  FL.ai = { check, merge, badge, usable, ask, wordy, taste, scan, picks, insight, status, isReady, model, MODELS, userKey, validKey, autoCheck, aiMatch };
})(window.FL = window.FL || {});
