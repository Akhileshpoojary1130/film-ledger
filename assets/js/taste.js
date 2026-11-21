/* Iris — your taste, measured. Everything you do with a title says something: what you watched and how you rated it,
   favourites and rewatches, what you saved, what you opened and didn't watch, trailers you played. From that:

   - profile(): genre, people (directors and actors), language and decade scores from -1 (you avoid it) to +1 (you love
     it), your favourites and dislikes, and how you rate (kind or harsh against IMDb, mainstream or niche, film length);
   - match(film, meta): "Will I like it?" for any title, as a 0–100 score with the reasons, each naming your own films
     ("You rated 3 Idiots 9/10, and this is Rajkumar Hirani again");
   - forAI(): the same profile, trimmed for the AI (Ask Iris, AI picks, the Stats read, the film page's AI verdict).

   Signals (opened, trailer, played) stay on this device, capped at 400. Recomputed only when the library changes. */
(function (FL) {
  "use strict";

  const SIG_KEY = "iris_signals_v1";
  const DAY = 864e5;
  const { storage, normalize } = FL.util;

  /* ---------- signals ---------- */

  let signals = storage.get(SIG_KEY, []);
  const saveSignals = FL.util.debounce(() => storage.set(SIG_KEY, signals), 1500);
  function signal(kind, id) {
    if (!id) return;
    const last = signals[signals.length - 1];
    if (last && last.k === kind && last.id === id && Date.now() - last.t < 60000) return; // a reload isn't a second look
    signals.push({ k: kind, id, t: Date.now() });
    if (signals.length > 400) signals = signals.slice(-400);
    saveSignals();
    cache.v = "";
  }

  /* ---------- the profile ---------- */

  const cache = { v: "", p: null };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function recency(e) {
    const last = e.watches.length ? Date.parse(e.watches[e.watches.length - 1]) : e.seenAt || e.updated || Date.now();
    const months = Math.max(0, (Date.now() - (last || Date.now())) / (30.4 * DAY));
    return 0.4 + 0.6 * Math.pow(0.5, months / 18);
  }

  // How much one watched title says you like it: -2 (rated 1) … +3.4 (rated 10, favourite, rewatched).
  function weight(e) {
    let w = e.rating ? (e.rating - 5.5) / 2.25 : 0.55;
    if (e.fav) w += 1;
    if (e.watches.length > 1) w += 0.4;
    return w > 0 ? w * recency(e) : w;
  }

  function tally() {
    const m = new Map();
    return {
      add(key, name, w, film, extra) {
        if (!key) return;
        let t = m.get(key);
        if (!t) { t = { name, sum: 0, n: 0, best: null, bestW: -9, extra }; m.set(key, t); }
        t.sum += w; t.n++;
        if (film && w > t.bestW) { t.best = film; t.bestW = w; }
      },
      // Mean weight, squashed to -1…1 and shrunk toward 0 when there are few films.
      list(minN) {
        return [...m.values()].filter((t) => t.n >= (minN || 1)).map((t) => ({
          name: t.name, n: t.n, score: +(clamp(t.sum / t.n / 1.8, -1, 1) * (t.n / (t.n + 1.5))).toFixed(2), best: t.best, role: t.extra,
        })).sort((a, b) => b.score * Math.sqrt(b.n) - a.score * Math.sqrt(a.n));
      },
      get: (key) => m.get(key),
    };
  }

  function profile() {
    const v = FL.store.version() + ":" + signals.length;
    if (cache.v === v && cache.p) return cache.p;
    const watched = FL.store.watched();
    const genres = tally(), langs = tally(), decades = tally(), people = tally();
    const rows = [];
    let ratedSum = 0, rated = 0, gap = 0, gapN = 0, votesLog = 0, votesN = 0, rt = 0, rtN = 0;
    watched.forEach((e) => {
      const f = FL.catalogue.get(e.id);
      if (!f) return;
      const w = weight(e);
      rows.push({ e, f, w });
      (f.genres || []).forEach((g) => genres.add(g, g, w, f));
      const lang = FL.catalogue.filmLang(f);
      if (lang && lang !== "World") langs.add(lang, lang, w, f);
      if (f.year) decades.add(Math.floor(f.year / 10) * 10, Math.floor(f.year / 10) * 10 + "s", w, f);
      const m = FL.meta && FL.meta.cached(f);
      const dirs = (m && m.directors && m.directors.length ? m.directors : e.directors) || [];
      dirs.slice(0, 2).forEach((d) => people.add("d:" + normalize(d), d, w, f, "director"));
      ((m && m.cast) || []).slice(0, 4).forEach((a) => people.add("a:" + normalize(a), a, w, f, "actor"));
      if (e.rating) {
        ratedSum += e.rating; rated++;
        if (f.rating) { gap += e.rating - f.rating; gapN++; }
      }
      if (f.votes) { votesLog += Math.log10(f.votes); votesN++; }
      const run = e.runtime || (m && m.runtime);
      if (run) { rt += run; rtN++; }
    });
    const label = (f, e) => f.title + (f.year ? " (" + f.year + ")" : "") + (e && e.rating ? " " + e.rating + "/10" : e && e.fav ? " ♥" : "");
    const byW = rows.slice().sort((a, b) => b.w - a.w);
    const recentRows = rows.slice().sort((a, b) => (b.e.updated || 0) - (a.e.updated || 0));
    const watchedIds = new Set(rows.map((r) => r.f.id));
    const curious = [];
    const seen = new Set();
    for (let i = signals.length - 1; i >= 0 && curious.length < 15; i--) {
      const s = signals[i];
      if (s.t < Date.now() - 45 * DAY || seen.has(s.id) || watchedIds.has(s.id)) continue;
      seen.add(s.id);
      const f = FL.catalogue.get(s.id);
      if (f) curious.push(f);
    }
    const mainstream = votesN ? votesLog / votesN : 0;
    const p = {
      films: rows.length,
      genres: genres.list(1),
      languages: langs.list(1),
      decades: decades.list(1),
      people: people.list(2),
      loved: byW.filter((r) => r.w >= 1.2).slice(0, 20).map((r) => ({ film: r.f, label: label(r.f, r.e), w: r.w })),
      disliked: rows.filter((r) => r.e.rating && r.e.rating <= 4).slice(0, 10).map((r) => ({ film: r.f, label: label(r.f, r.e) })),
      recent: recentRows.slice(0, 20).map((r) => ({ film: r.f, label: label(r.f, r.e) })),
      watchlist: FL.store.watchlist().slice(0, 20).map((e) => FL.catalogue.get(e.id)).filter(Boolean),
      curious,
      style: {
        avgRating: rated ? +(ratedSum / rated).toFixed(1) : 0,
        vsImdb: gapN >= 3 ? +(gap / gapN).toFixed(2) : 0,
        mainstream: !votesN ? "" : mainstream >= 5.2 ? "Blockbusters" : mainstream >= 4.4 ? "Popular picks" : mainstream >= 3.6 ? "A mix" : "Hidden gems",
        runtime: rtN ? Math.round(rt / rtN) : 0,
        rated, signals: signals.length,
      },
      tally: { genres, langs, people },
    };
    cache.v = v;
    cache.p = p;
    return p;
  }

  /* ---------- Will I like it? ---------- */

  function match(film, meta) {
    const p = profile();
    if (!film || p.films < 3) return null;
    const reasons = []; // [weight, text, +1/-1]
    let s = 50;
    const fg = (meta && meta.ai && meta.ai.fixes && meta.ai.fixes.genres) || film.genres || [];
    // Genres.
    const gs = fg.map((g) => p.tally.genres.get(g)).filter(Boolean);
    if (gs.length) {
      const avg = gs.reduce((a, t) => a + clamp(t.sum / t.n / 1.8, -1, 1), 0) / fg.length;
      s += avg * 26;
      const top = gs.slice().sort((a, b) => b.sum / b.n - a.sum / a.n)[0];
      const topScore = clamp(top.sum / top.n / 1.8, -1, 1);
      if (topScore > 0.35 && top.n >= 2) reasons.push([topScore * 10, "You love " + top.name.toLowerCase() + ": " + top.n + " watched" + (top.best ? ", " + top.best.title + " among them" : ""), 1]);
      const low = gs.slice().sort((a, b) => a.sum / a.n - b.sum / b.n)[0];
      if (clamp(low.sum / low.n / 1.8, -1, 1) < -0.2 && low.n >= 2) reasons.push([8, low.name + " usually isn’t your thing", -1]);
    } else if (fg.length) {
      s -= 4;
      reasons.push([3, "A genre you haven’t tried yet: " + fg[0].toLowerCase(), 0]);
    }
    // Language.
    const lang = FL.catalogue.filmLang(film);
    const lt = p.tally.langs.get(lang);
    if (lt) s += clamp(lt.sum / lt.n / 1.8, -1, 1) * 6 + Math.min(4, lt.n / 5);
    else if (lang && lang !== "World") s -= 3;
    // People: the director and the leads, against the films of theirs you've seen.
    const dirs = (meta && meta.directors) || [];
    const cast = ((meta && meta.cast) || []).slice(0, 6);
    let peopleBoost = 0;
    dirs.slice(0, 2).forEach((d) => {
      const t = p.tally.people.get("d:" + normalize(d));
      if (!t) return;
      const sc = clamp(t.sum / t.n / 1.8, -1, 1);
      peopleBoost += sc * 14;
      const best = t.best && t.best.id !== film.id ? t.best : null;
      const e = best && FL.store.peek(best.id);
      if (sc > 0.3 && best) reasons.push([sc * 14, (e && e.rating ? "You rated " + best.title + " " + e.rating + "/10" : "You liked " + best.title) + ", and this is " + d + " again", 1]);
      else if (sc < -0.2) reasons.push([7, "You didn’t enjoy " + d + "’s other films", -1]);
    });
    cast.forEach((a, i) => {
      const t = p.tally.people.get("a:" + normalize(a));
      if (!t || t.n < 2) return;
      const sc = clamp(t.sum / t.n / 1.8, -1, 1);
      peopleBoost += sc * (i < 2 ? 8 : 4);
      if (sc > 0.3) reasons.push([sc * (i < 2 ? 11 : 6), a + " is in " + t.n + " films you liked" + (t.best && t.best.id !== film.id ? ", like " + t.best.title : ""), 1]);
    });
    s += clamp(peopleBoost, -18, 24);
    // Close to something you loved.
    const near = p.loved.slice(0, 12).find((l) => l.film.id !== film.id && FL.catalogue.similar(l.film, 24).some((f) => f.id === film.id));
    if (near) { s += 7; reasons.push([9, "Close to " + near.film.title + ", one of your favourites", 1]); }
    // Quality, the way you rate.
    if (film.rating) {
      s += (film.rating - 6.6) * 5;
      if (film.rating >= 8) reasons.push([5, "Rated " + film.rating.toFixed(1) + " on IMDb", 1]);
      else if (film.rating < 5.8) reasons.push([5, "Only " + film.rating.toFixed(1) + " on IMDb", -1]);
    }
    // You were curious, or saved it.
    const st = FL.store.state(film.id);
    if (st.listed) { s += 4; reasons.push([4, "It’s on your Watch later", 1]); }
    else if (p.curious.some((f) => f.id === film.id)) s += 2;
    // Decade.
    const dt = film.year && p.decades.find((d) => d.name === Math.floor(film.year / 10) * 10 + "s");
    if (dt) s += dt.score * 4;

    const score = Math.round(clamp(s, 3, 98));
    reasons.sort((a, b) => b[0] - a[0]);
    return {
      score,
      label: score >= 78 ? "Made for you" : score >= 63 ? "Good match" : score >= 47 ? "Could go either way" : "Not your usual",
      tone: score >= 63 ? "good" : score >= 47 ? "mid" : "low",
      reasons: reasons.slice(0, 4).map(([, text, sign]) => ({ text, sign })),
    };
  }

  /* ---------- for the AI ---------- */

  function forAI() {
    const p = profile();
    const name = (f) => f.title + (f.year ? " (" + f.year + ")" : "");
    return {
      loved: p.loved.slice(0, 15).map((x) => x.label),
      disliked: p.disliked.map((x) => x.label),
      recent: p.recent.slice(0, 15).map((x) => x.label),
      watched: p.recent.concat(p.loved).map((x) => x.film.title).filter((t, i, a) => a.indexOf(t) === i).slice(0, 80),
      curious: p.curious.slice(0, 12).map(name),
      watchlist: p.watchlist.slice(0, 15).map(name),
      genres: p.genres.slice(0, 10).map((g) => ({ name: g.name, score: g.score, n: g.n })),
      languages: p.languages.slice(0, 4).map((l) => l.name),
      decades: p.decades.slice().sort((a, b) => b.n - a.n).slice(0, 4).map((d) => d.name),
      people: p.people.slice(0, 12).map((x) => ({ name: x.name, score: x.score, n: x.n, role: x.role })),
      style: { avgRating: p.style.avgRating, vsImdb: p.style.vsImdb, mainstream: p.style.mainstream, runtime: p.style.runtime },
    };
  }

  /* New and popular titles Iris has, in the languages you watch first: the AI picks the ones that fit you. */
  function trending() {
    const p = profile();
    const cy = new Date().getFullYear();
    const langs = new Set(p.languages.slice(0, 3).map((l) => l.name));
    return FL.catalogue.all().filter((f) => f.year >= cy - 1 && f.type !== "series" && !FL.store.state(f.id).watched && (f.votes || f.pop))
      .map((f) => [(f.votes ? Math.log10(f.votes) : (f.pop || 0) / 20) + (langs.has(FL.catalogue.filmLang(f)) ? 1.5 : 0) + (f.rating || 6) / 4, f])
      .sort((a, b) => b[0] - a[0]).slice(0, 40)
      .map(([, f]) => f.title + " (" + f.year + ", " + FL.catalogue.filmLang(f) + ", " + (f.genres || []).slice(0, 2).join("/") + ")");
  }

  FL.taste = { signal, profile, match, forAI, trending };
})(window.FL = window.FL || {});
