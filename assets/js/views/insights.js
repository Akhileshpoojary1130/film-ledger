/* Iris — viewing statistics: the numbers (FL.stats), small chart primitives (FL.chart) and the Stats page. */
(function (FL) {
  "use strict";

  const { esc, MONTHS, MONTHS_SHORT, fmtRuntime, fmtHours, fmtDate, parseISO, plural } = FL.util;
  const { icon, stars } = FL.ui;

  /* ---------- numbers ---------- */

  let cache = {};
  let cacheVersion = -1;

  function filmFor(entry) {
    return FL.catalogue.get(entry.id) || { id: entry.id, title: entry.title, year: entry.year, lang: entry.lang, region: "", genres: entry.genres || [], rating: null };
  }

  function top(counts, n) {
    return Object.keys(counts).map((label) => ({ label, n: counts[label] })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).slice(0, n);
  }

  /* scope: "all" or a year number. */
  function summary(scope) {
    if (cacheVersion !== FL.store.version()) { cache = {}; cacheVersion = FL.store.version(); }
    const key = String(scope);
    if (cache[key]) return cache[key];

    const all = scope === "all";
    const year = all ? 0 : +scope;
    const viewings = []; // { entry, date|"" }
    FL.store.watched().forEach((e) => {
      if (all) {
        if (e.watches.length) e.watches.forEach((d) => viewings.push({ entry: e, date: d }));
        else viewings.push({ entry: e, date: "" });
      } else {
        e.watches.forEach((d) => { if (+d.slice(0, 4) === year) viewings.push({ entry: e, date: d }); });
      }
    });

    const entries = Array.from(new Set(viewings.map((v) => v.entry)));
    const s = {
      scope, films: entries.length, viewings: viewings.length, minutes: 0, timed: 0, missingRuntime: 0,
      months: new Array(12).fill(0), monthMinutes: new Array(12).fill(0), monthFilms: MONTHS.map(() => []),
      years: {}, weekdays: new Array(7).fill(0), ratings: new Array(10).fill(0),
      genres: [], languages: [], decades: [], directors: [],
      avgRating: 0, rated: 0, rewatches: 0, favorites: 0, streak: null, longest: null, shortest: null, mostRewatched: null, vsImdb: null,
      cast: [], hours: new Array(6).fill(0), sittings: 0, weekAll: new Array(7).fill(0),
    };

    const missing = new Set();
    const seenOnce = new Set();
    viewings.forEach((v) => {
      const rt = v.entry.runtime || 0;
      if (rt) { s.minutes += rt; s.timed++; }
      else missing.add(v.entry.id);
      if (seenOnce.has(v.entry.id)) s.rewatches++;
      seenOnce.add(v.entry.id);
      if (v.date) {
        const d = parseISO(v.date);
        s.weekdays[(d.getDay() + 6) % 7]++;
        if (!all) {
          s.months[d.getMonth()]++;
          s.monthMinutes[d.getMonth()] += rt;
          s.monthFilms[d.getMonth()].push(v.entry.title);
        }
        const y = d.getFullYear();
        s.years[y] = (s.years[y] || 0) + 1;
      }
    });
    // For "all", rewatches are dated watches beyond the first per film.
    if (all) s.rewatches = viewings.length - entries.length;
    s.missingRuntime = missing.size;

    const genres = {};
    const langs = {};
    const decades = {};
    const directors = {};
    let ratingSum = 0;
    let diffSum = 0;
    let diffN = 0;
    let over = null;
    let under = null;
    entries.forEach((e) => {
      const f = filmFor(e);
      (f.genres || []).forEach((g) => { genres[g] = (genres[g] || 0) + 1; });
      const lang = FL.catalogue.filmLang(f);
      langs[lang] = (langs[lang] || 0) + 1;
      const dec = Math.floor(f.year / 10) * 10 + "s";
      decades[dec] = (decades[dec] || 0) + 1;
      (e.directors || []).forEach((d) => {
        if (!directors[d]) directors[d] = { name: d, n: 0, rated: 0, sum: 0 };
        directors[d].n++;
        if (e.rating) { directors[d].rated++; directors[d].sum += e.rating; }
      });
      if (e.fav) s.favorites++;
      if (e.rating) {
        s.rated++;
        ratingSum += e.rating;
        s.ratings[e.rating - 1]++;
        const imdb = f.rating || (FL.meta.cached(f) || {}).rating || 0;
        if (imdb) {
          const diff = e.rating - imdb; // both on a 10-point scale
          diffSum += diff;
          diffN++;
          if (!over || diff > over.diff) over = { film: f, diff, you: e.rating, imdb };
          if (!under || diff < under.diff) under = { film: f, diff, you: e.rating, imdb };
        }
      }
      if (e.runtime) {
        if (!s.longest || e.runtime > s.longest.runtime) s.longest = { film: f, runtime: e.runtime };
        if (!s.shortest || e.runtime < s.shortest.runtime) s.shortest = { film: f, runtime: e.runtime };
      }
      const count = all ? e.watches.length : e.watches.filter((d) => +d.slice(0, 4) === year).length;
      if (count > 1 && (!s.mostRewatched || count > s.mostRewatched.count)) s.mostRewatched = { film: f, count };
    });
    // Faces you see most: the first-billed cast of the films you watched (from their details).
    const cast = {};
    entries.forEach((e) => {
      const m = FL.meta.cached(filmFor(e));
      ((m && m.cast) || []).slice(0, 5).forEach((n) => {
        if (!cast[n]) cast[n] = { name: n, n: 0, films: [] };
        cast[n].n++;
        cast[n].films.push(e.title);
      });
    });
    s.cast = Object.values(cast).filter((c) => c.n >= 1).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 8);

    // When you watch: moments of real watching (player sittings, watches logged the same day) by time of day and weekday.
    FL.store.entries().forEach((e) => {
      (e.times || []).forEach((t) => {
        const d = new Date(t);
        if (!all && d.getFullYear() !== year) return;
        const h = d.getHours();
        s.hours[h < 4 ? 5 : h < 8 ? 0 : h < 12 ? 1 : h < 17 ? 2 : h < 21 ? 3 : 4]++;
        s.weekAll[(d.getDay() + 6) % 7]++;
        s.sittings++;
      });
    });
    s.weekdays.forEach((n, i) => { s.weekAll[i] += n; });

    s.avgRating = s.rated ? ratingSum / s.rated / 2 : 0;
    s.genres = top(genres, 8);
    s.languages = top(langs, 6);
    s.decades = Object.keys(decades).sort().map((label) => ({ label, n: decades[label] }));
    s.directors = Object.values(directors).sort((a, b) => b.n - a.n || b.sum / (b.rated || 1) - a.sum / (a.rated || 1)).slice(0, 8);
    if (diffN >= 3) s.vsImdb = { avg: diffSum / diffN, n: diffN, over, under };

    // Longest run of consecutive days with at least one film.
    const days = Array.from(new Set(viewings.filter((v) => v.date).map((v) => v.date))).sort();
    let best = null;
    let runStart = 0;
    for (let i = 1; i <= days.length; i++) {
      const contiguous = i < days.length && (parseISO(days[i]) - parseISO(days[i - 1])) / 864e5 === 1;
      if (!contiguous) {
        const len = i - runStart;
        if (len >= 2 && (!best || len > best.days)) best = { days: len, from: days[runStart], to: days[i - 1] };
        runStart = i;
      }
    }
    s.streak = best;
    cache[key] = s;
    return s;
  }

  function years() {
    const set = new Set([new Date().getFullYear()]);
    FL.store.entries().forEach((e) => e.watches.forEach((d) => set.add(+d.slice(0, 4))));
    return Array.from(set).sort((a, b) => b - a);
  }

  /* Watched films without runtime/director get their details fetched (Cinemeta, 4 at a time) so hours and
     directors fill in. onProgress(pending) fires as results land. */
  let backfilling = null;
  function backfill(limit, onProgress) {
    if (backfilling) { if (onProgress) backfilling.listeners.push(onProgress); return backfilling.pending; }
    const todo = FL.store.watched().filter((e) => !e.runtime || !e.directors).slice(0, limit);
    if (!todo.length) return 0;
    backfilling = { pending: todo.length, listeners: onProgress ? [onProgress] : [] };
    const job = backfilling;
    todo.forEach((e) => {
      const film = FL.catalogue.get(e.id);
      const done = () => {
        job.pending--;
        job.listeners.forEach((fn) => fn(job.pending));
        if (!job.pending) backfilling = null;
      };
      if (!film) { done(); return; }
      FL.meta.details(film).then(done, done);
    });
    return job.pending;
  }
  const backfillPending = () => (backfilling ? backfilling.pending : 0);

  FL.stats = { summary, years, backfill, backfillPending };

  /* ---------- chart primitives (HTML, single series, one hue) ---------- */

  let tip = null;
  function showTip(target) {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "tip";
      tip.setAttribute("role", "tooltip");
      document.body.appendChild(tip);
    }
    const lines = target.dataset.tip.split("\n");
    tip.textContent = "";
    lines.forEach((line, i) => {
      const div = document.createElement("div");
      div.className = i === 0 ? "tip-value" : "tip-label";
      div.textContent = line;
      tip.appendChild(div);
    });
    const r = target.getBoundingClientRect();
    tip.style.display = "block";
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let x = r.left + r.width / 2 - w / 2;
    x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    let y = r.top - h - 8;
    if (y < 8) y = r.bottom + 8;
    tip.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
  }
  function hideTip() { if (tip) tip.style.display = "none"; }

  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest && e.target.closest("[data-tip]");
    if (t) showTip(t); else hideTip();
  });
  document.addEventListener("focusin", (e) => {
    const t = e.target.closest && e.target.closest("[data-tip]");
    if (t) showTip(t); else hideTip();
  });
  document.addEventListener("scroll", hideTip, { passive: true });

  /* Vertical columns with labels under each; only the peak carries a value label. */
  function columns(values, labels, tips, opts) {
    const o = opts || {};
    const max = Math.max(1, ...values);
    const peak = values.indexOf(Math.max(...values));
    return '<div class="cols' + (o.dense ? " cols-dense" : "") + '" role="img" aria-label="' + esc(o.label || "") + '">' +
      values.map((v, i) => '<div class="col" tabindex="0" data-tip="' + esc(tips[i]) + '">' +
        '<div class="col-plot">' + (i === peak && v ? '<span class="col-val">' + v + "</span>" : "") +
        '<span class="col-bar' + (v ? "" : " is-zero") + '" style="height:' + (v / max) * 100 + '%"></span></div>' +
        '<span class="col-label">' + esc(labels[i]) + "</span></div>").join("") + "</div>";
  }

  /* Ranked horizontal bars; value at the tip, label on the left. */
  function bars(items, opts) {
    const o = opts || {};
    if (!items.length) return '<p class="muted small">Nothing yet.</p>';
    const max = Math.max(...items.map((x) => x.n));
    return '<ol class="bars">' + items.map((x) => '<li tabindex="0" data-tip="' + esc(plural(x.n, o.unit || "film") + "\n" + x.label) + '">' +
      '<span class="bar-label">' + esc(x.label) + "</span>" +
      '<span class="bar-track"><span class="bar-fill" style="width:' + Math.max(2, (x.n / max) * 100) + '%"></span></span>' +
      '<span class="bar-val">' + x.n + "</span></li>").join("") + "</ol>";
  }

  /* Table fallback so no value is hover-only. */
  function table(caption, rows) {
    return '<table class="sr-only"><caption>' + esc(caption) + "</caption><tbody>" + rows.map(([k, v]) => "<tr><th>" + esc(k) + "</th><td>" + esc(v) + "</td></tr>").join("") + "</tbody></table>";
  }

  FL.chart = { columns, bars, table };

  /* ---------- page ---------- */

  function tile(value, label, sub) {
    return '<div class="tile"><span class="tile-label">' + label + '</span><span class="tile-value">' + value + "</span>" + (sub ? '<span class="tile-sub">' + sub + "</span>" : "") + "</div>";
  }

  function filmLink(f) {
    return '<a href="#/film/' + encodeURIComponent(f.id) + '">' + esc(f.title) + "</a>";
  }

  function render(el, scope, backfill) {
    const s = summary(scope);
    const all = scope === "all";
    const yearList = years();
    const scopeNav = FL.ui.segmented("scope", [["all", "All time"]].concat(yearList.map((y) => [y, y])), scope);

    if (!s.films) {
      el.innerHTML = '<div class="container page"><header class="page-head"><div><p class="eyebrow">Stats</p><h1 class="display">' +
        (all ? "Your cinema, in numbers." : "Your cinema in " + scope + ".") + "</h1></div></header>" +
        '<div class="scope-nav">' + scopeNav + "</div>" +
        FL.ui.empty(all ? "No films watched yet." : "Nothing logged in " + scope + ".",
          all ? "Mark films as watched and log dates, and this page fills itself in." : "Log a watch with a date on any film page and it will show up here.",
          '<a class="btn" href="#/browse">Browse films</a>') + "</div>";
      return;
    }

    const runtimeNote = s.missingRuntime
      ? '<p class="footnote">' + (backfill && backfill.pending ? '<span class="spinner spinner-sm"></span>Fetching runtimes for ' + backfill.pending + " films… " : "") +
        "Hours include " + (s.films - s.missingRuntime) + " of " + s.films + " films; runtime unknown for the rest.</p>"
      : "";

    let timeline;
    if (all) {
      const ys = Object.keys(s.years).map(Number).sort();
      if (ys.length) {
        const from = ys[0];
        const to = Math.max(ys[ys.length - 1], new Date().getFullYear());
        const labels = [];
        const vals = [];
        for (let y = from; y <= to; y++) { labels.push(String(y)); vals.push(s.years[y] || 0); }
        timeline = '<section class="panel chart-panel"><header class="section-head"><div><h2 class="h3">Films per year</h2><p class="sub">Dated watches, including rewatches</p></div></header>' +
          columns(vals, labels.map((l) => (labels.length > 12 ? "’" + l.slice(2) : l)), vals.map((v, i) => plural(v, "film") + "\n" + labels[i]), { label: "Films per year", dense: labels.length > 12 }) +
          table("Films per year", labels.map((l, i) => [l, vals[i]])) + "</section>";
      } else {
        timeline = "";
      }
    } else {
      timeline = '<section class="panel chart-panel"><header class="section-head"><div><h2 class="h3">Films per month</h2><p class="sub">Including rewatches</p></div></header>' +
        columns(s.months, MONTHS_SHORT, s.months.map((v, i) => plural(v, "film") + (s.monthMinutes[i] ? " · " + fmtRuntime(s.monthMinutes[i]) : "") + "\n" + MONTHS[i] + " " + scope), { label: "Films per month in " + scope }) +
        table("Films per month", MONTHS.map((m, i) => [m, s.months[i]])) + "</section>";
    }

    const ratingLabels = ["½", "1", "1½", "2", "2½", "3", "3½", "4", "4½", "5"];
    const ratingsPanel = '<section class="panel chart-panel"><header class="section-head"><div><h2 class="h3">Your ratings</h2><p class="sub">' +
      (s.rated ? plural(s.rated, "film") + " rated · average " + s.avgRating.toFixed(1) + " ★" : "Rate films to see your spread") + "</p></div></header>" +
      columns(s.ratings, ratingLabels, s.ratings.map((v, i) => plural(v, "film") + "\n" + ratingLabels[i] + " ★"), { label: "Rating distribution" }) + "</section>";

    const decadesPanel = '<section class="panel chart-panel"><header class="section-head"><div><h2 class="h3">Release decades</h2><p class="sub">When the films you watched came out</p></div></header>' +
      columns(s.decades.map((d) => d.n), s.decades.map((d) => d.label), s.decades.map((d) => plural(d.n, "film") + "\n" + d.label), { label: "Films by release decade" }) + "</section>";

    const directorsPanel = '<section class="panel"><header class="section-head"><div><h2 class="h3">Directors</h2><p class="sub">Most-watched</p></div></header>' +
      (s.directors.length
        ? '<ol class="ranked-list">' + s.directors.map((d, i) => "<li><span class='rank'>" + String(i + 1).padStart(2, "0") + "</span><span class='grow'>" + esc(d.name) + "</span>" +
            (d.rated ? stars(Math.round(d.sum / d.rated), "stars-sm") : "") + "<span class='muted'>" + plural(d.n, "film") + "</span></li>").join("") + "</ol>"
        : '<p class="muted small">Directors appear once film details have loaded.</p>') + "</section>";

    const castPanel = '<section class="panel"><header class="section-head"><div><h2 class="h3">Faces you watch most</h2><p class="sub">Actors &amp; actresses, first-billed</p></div></header>' +
      (s.cast.length
        ? '<ol class="ranked-list face-list">' + s.cast.map((c, i) => "<li><span class='rank'>" + String(i + 1).padStart(2, "0") + "</span>" +
            '<a class="face-row" href="' + FL.people.href(c.name) + '">' + FL.people.face(c.name, 30) + "<span class='grow'>" + esc(c.name) + "</span></a>" +
            "<span class='muted' data-tip=\"" + esc(c.films.join(", ")) + "\">" + plural(c.n, "film") + "</span></li>").join("") + "</ol>"
        : '<p class="muted small">Appears once details for your watched films have loaded.</p>') + "</section>";

    const SLOTS = ["Early morning", "Morning", "Afternoon", "Evening", "Night", "Late night"];
    const SLOT_TIMES = ["4–8 am", "8 am–12", "12–5 pm", "5–9 pm", "9 pm–12", "12–4 am"];
    const timePanel = '<section class="panel chart-panel"><header class="section-head"><div><h2 class="h3">Time of day</h2><p class="sub">When you actually press play</p></div></header>' +
      (s.sittings
        ? columns(s.hours, ["Early", "Morning", "Afternoon", "Evening", "Night", "Late"], s.hours.map((n, i) => plural(n, "sitting") + "\n" + SLOTS[i] + " · " + SLOT_TIMES[i]), { label: "Watching by time of day" })
        : '<p class="muted small">Fills in as you watch in the player or log a watch on the day.</p>') + "</section>";
    const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const weekPanel = '<section class="panel chart-panel"><header class="section-head"><div><h2 class="h3">Day of the week</h2><p class="sub">Which days you watch most</p></div></header>' +
      (s.weekAll.some(Boolean)
        ? columns(s.weekAll, DAYS, s.weekAll.map((n, i) => plural(n, "viewing") + "\n" + ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"][i]), { label: "Watching by weekday" })
        : '<p class="muted small">Needs watches with a date or time.</p>') + "</section>";
    const busiestSlot = s.hours.indexOf(Math.max(...s.hours));

    const records = [];
    if (s.sittings && s.hours[busiestSlot]) records.push(["Your hour", SLOTS[busiestSlot], SLOT_TIMES[busiestSlot]]);
    if (s.longest) records.push(["Longest", filmLink(s.longest.film), fmtRuntime(s.longest.runtime)]);
    if (s.shortest && s.shortest !== s.longest) records.push(["Shortest", filmLink(s.shortest.film), fmtRuntime(s.shortest.runtime)]);
    if (s.mostRewatched) records.push(["Most rewatched", filmLink(s.mostRewatched.film), s.mostRewatched.count + "×"]);
    if (s.streak) records.push(["Longest streak", s.streak.days + " days in a row", fmtDate(s.streak.from, "short") + " – " + fmtDate(s.streak.to, "short")]);
    const busiest = s.weekdays.indexOf(Math.max(...s.weekdays));
    if (s.weekdays[busiest]) records.push(["Favourite day", ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"][busiest], plural(s.weekdays[busiest], "film")]);
    if (!all) {
      const bm = s.months.indexOf(Math.max(...s.months));
      if (s.months[bm]) records.push(["Busiest month", MONTHS[bm], plural(s.months[bm], "film")]);
    }
    if (s.vsImdb) {
      const a = s.vsImdb.avg;
      records.push(["You vs IMDb", Math.abs(a) < 0.15 ? "Right in line" : (a > 0 ? "Kinder" : "Harsher") + " by " + Math.abs(a).toFixed(1), "across " + s.vsImdb.n + " rated films"]);
      if (s.vsImdb.over && s.vsImdb.over.diff >= 1) records.push(["You loved it more", filmLink(s.vsImdb.over.film), (s.vsImdb.over.you / 2) + "★ vs IMDb " + s.vsImdb.over.imdb.toFixed(1)]);
      if (s.vsImdb.under && s.vsImdb.under.diff <= -1) records.push(["IMDb loved it more", filmLink(s.vsImdb.under.film), (s.vsImdb.under.you / 2) + "★ vs IMDb " + s.vsImdb.under.imdb.toFixed(1)]);
    }
    const recordsPanel = '<section class="panel"><header class="section-head"><div><h2 class="h3">Records</h2></div></header>' +
      (records.length ? '<dl class="records">' + records.map(([k, v, sub]) => "<div><dt>" + k + "</dt><dd>" + v + "<small>" + esc(sub) + "</small></dd></div>").join("") + "</dl>" : '<p class="muted small">Log dates and ratings to unlock records.</p>') + "</section>";

    el.innerHTML = '<div class="container page stats">' +
      '<header class="page-head"><div><p class="eyebrow">Stats</p><h1 class="display">' + (all ? "Your cinema, <em>in numbers.</em>" : "Your cinema in <em>" + scope + ".</em>") + "</h1></div></header>" +
      '<div class="scope-nav">' + scopeNav + "</div>" +
      '<section class="stat-hero">' +
        '<div class="hero-figure"><span class="hero-num">' + s.films.toLocaleString() + '</span><span class="hero-label">' + (s.films === 1 ? "film" : "films") + (all ? " watched" : " in " + scope) + "</span></div>" +
        '<div class="tiles">' +
          tile(fmtHours(s.minutes), "Cinema time", s.timed ? fmtRuntime(Math.round(s.minutes / s.timed)) + " on average" : "") +
          tile(s.rated ? s.avgRating.toFixed(1) + " ★" : "—", "Average rating", s.rated ? plural(s.rated, "film") + " rated" : "Rate a film to see it") +
          tile(s.rewatches.toLocaleString(), "Rewatches", s.viewings + " viewings in all") +
          tile(s.favorites.toLocaleString(), "Favourites", "") +
        "</div></section>" +
      runtimeNote +
      timeline +
      '<div class="two-col">' +
        '<section class="panel"><header class="section-head"><div><h2 class="h3">Genres</h2><p class="sub">Films can count toward several</p></div></header>' + bars(s.genres) + "</section>" +
        '<section class="panel"><header class="section-head"><div><h2 class="h3">Languages</h2></div></header>' + bars(s.languages) + "</section>" +
      "</div>" +
      '<div class="two-col">' + ratingsPanel + decadesPanel + "</div>" +
      '<div class="two-col">' + castPanel + directorsPanel + "</div>" +
      '<div class="two-col">' + timePanel + weekPanel + "</div>" +
      recordsPanel +
      "</div>";
    if (s.cast.length) FL.people.photos(s.cast.map((c) => c.name)).then(() => { if (el.querySelector(".face-list")) FL.people.paint(el); });
  }

  FL.views = FL.views || {};
  FL.views.stats = {
    title: "Stats",
    mount(el, params) {
      let scope = params[0] && /^\d{4}$/.test(params[0]) ? +params[0] : "all";
      const backfill = { pending: 0 };
      let rerender = 0;
      let alive = true;

      backfill.pending = FL.stats.backfill(300, (pending) => {
        backfill.pending = pending;
        clearTimeout(rerender);
        rerender = setTimeout(() => {
          if (!alive) return;
          const y = window.scrollY;
          render(el, scope, backfill);
          window.scrollTo(0, y);
        }, pending ? 1500 : 0);
      });
      render(el, scope, backfill);

      function onClick(e) {
        const seg = e.target.closest('[data-seg="scope"]');
        if (!seg) return;
        scope = seg.dataset.value === "all" ? "all" : +seg.dataset.value;
        history.replaceState(null, "", scope === "all" ? "#/stats" : "#/stats/" + scope);
        render(el, scope, backfill);
      }
      el.addEventListener("click", onClick);
      return {
        update(detail) {
          if (detail.kind === "progress" || detail.kind === "note") return;
          const y = window.scrollY;
          render(el, scope, backfill);
          window.scrollTo(0, y);
        },
        destroy() { alive = false; clearTimeout(rerender); el.removeEventListener("click", onClick); hideTip(); },
      };
    },
  };
})(window.FL = window.FL || {});
