/* Iris — Library (watchlist, watched, favourites, collections) and Diary. */
(function (FL) {
  "use strict";

  const { esc, fmtDate, fmtRuntime, fmtHours, MONTHS, MONTHS_SHORT, parseISO, plural, pad, $ } = FL.util;
  const { icon, card, row, stars, art, segmented, empty } = FL.ui;

  const PAGE = 90;

  const TABS = [
    ["watchlist", "Watch later"],
    ["watched", "Watched"],
    ["favorites", "Favourites"],
    ["shows", "Shows"],
  ];

  const SORTS = [
    ["recent", "Recently added"],
    ["rating", "Your rating"],
    ["imdb", "IMDb rating"],
    ["newest", "Release: newest"],
    ["oldest", "Release: oldest"],
    ["title", "Title A–Z"],
  ];

  const lastWatch = (e) => (e.watches.length ? e.watches[e.watches.length - 1] : "");

  function sortEntries(list, sort, tab) {
    const film = (e) => FL.catalogue.get(e.id) || {};
    const by = {
      recent: tab === "watchlist" ? (a, b) => b.listedAt - a.listedAt
        : tab === "watched" ? (a, b) => lastWatch(b).localeCompare(lastWatch(a)) || b.updated - a.updated
        : (a, b) => b.updated - a.updated,
      rating: (a, b) => b.rating - a.rating || b.updated - a.updated,
      imdb: (a, b) => (film(b).rating || 0) - (film(a).rating || 0),
      newest: (a, b) => b.year - a.year || a.title.localeCompare(b.title),
      oldest: (a, b) => a.year - b.year || a.title.localeCompare(b.title),
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return list.slice().sort(by[sort] || by.recent);
  }

  function entriesFor(tab) {
    if (tab === "watchlist") return FL.store.watchlist();
    if (tab === "watched") return FL.store.watched();
    if (tab === "favorites") return FL.store.favorites();
    if (tab === "shows") return FL.store.shows();
    return [];
  }

  function emptyFor(tab) {
    if (tab === "watchlist") return empty("Your next favourite hasn’t been saved yet.", "Tap the bookmark on any poster to keep it here.", '<a class="btn" href="#/browse">Browse films</a>');
    if (tab === "watched") return empty("No films logged yet.", "Mark films you’ve seen with ✓ and your stats build from here.", '<a class="btn" href="#/browse">Browse films</a>');
    if (tab === "shows") return empty("No shows yet.", "Follow a show or tick an episode and it lands here with your place kept.", '<a class="btn" href="#/shows">Browse shows</a>');
    return empty("No films have earned the heart yet.", "Favourite a film from its page and it collects here.");
  }

  function collectionsHtml(list) {
    return '<div class="collections">' + (list || FL.catalogue.franchises()).map((fr) => {
      const seen = fr.films.filter((f) => FL.store.state(f.id).watched).length;
      const cover = fr.films.slice().sort((a, b) => (b.votes || 0) - (a.votes || 0)).slice(0, 4);
      return '<a class="coll" href="#/collection/' + fr.id + '"><div class="coll-cover">' + cover.map((f) => art(f)).join("") + "</div>" +
        '<div class="coll-body"><strong>' + esc(fr.name) + "</strong><span>" + seen + " / " + fr.films.length + " watched</span>" +
        '<span class="meter"><i style="width:' + (seen / fr.films.length) * 100 + '%"></i></span></div></a>';
    }).join("") + "</div>";
  }

  FL.views = FL.views || {};

  /* ---------- collections: universes and film series, to work through in order ---------- */

  const COLL_FILTERS = [["all", "All"], ["started", "In progress"], ["Hindi", "Hindi"], ["English", "English"], ["OtherIndian", "Regional"], ["universe", "Universes"]];

  /* Library's sections, with Collections at the end (on phones the tab bar has no room for it, so this is its door). */
  function libraryTabs(active) {
    const counts = { watchlist: FL.store.watchlist().length, watched: FL.store.watched().length, favorites: FL.store.favorites().length, shows: FL.store.shows().length };
    return '<nav class="tabs" aria-label="Library sections">' + TABS.map(([t, label]) =>
      '<a class="tab' + (t === active ? " is-on" : "") + '" href="#/library/' + t + '"' + (t === active ? ' aria-current="page"' : "") + ">" + label + "<span>" + counts[t] + "</span></a>").join("") +
      '<a class="tab' + (active === "collections" ? " is-on" : "") + '" href="#/collections"' + (active === "collections" ? ' aria-current="page"' : "") + ">Collections<span>" +
      FL.catalogue.collections().length + "</span></a></nav>";
  }

  /* On a phone the tab row is wider than the screen: bring the current tab into view. */
  function showActiveTab(el) {
    const row = el.querySelector(".tabs");
    const on = row && row.querySelector(".is-on");
    if (on && row.scrollWidth > row.clientWidth) row.scrollLeft = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
  }

  FL.views.collections = {
    title: "Collections",
    mount(el) {
      let filter = "all";
      const seenIn = (c) => c.films.filter((f) => FL.store.state(f.id).watched).length;
      function list() {
        const all = FL.catalogue.collections();
        let out = all.filter((c) => {
          if (filter === "all") return true;
          if (filter === "started") { const n = seenIn(c); return n > 0 && n < c.films.length; }
          if (filter === "universe") return c.kind === "universe";
          return c.kind === "series" && c.films[0].lang === filter;
        });
        // Each language's biggest series lead together, then the next, so Hindi and regional sit beside Hollywood.
        const groups = {};
        out.forEach((c) => { const k = c.kind === "universe" ? "U" : c.films[0].lang; (groups[k] = groups[k] || []).push(c); });
        const pos = new Map();
        Object.values(groups).forEach((g) => g.sort((a, b) => b.audience - a.audience).forEach((c, i) => pos.set(c, (i + 0.5) / g.length)));
        out = out.sort((a, b) => (seenIn(b) > 0) - (seenIn(a) > 0) || pos.get(a) - pos.get(b));
        return out;
      }
      function render() {
        const items = list();
        el.innerHTML = '<div class="container page">' +
          '<div class="lib-tabs-top">' + libraryTabs("collections") + "</div>" +
          '<header class="page-head"><div><p class="eyebrow">Collections</p><h1 class="display">Series &amp; <em>universes.</em></h1>' +
          '<p class="sub">' + FL.catalogue.collections().length + " collections, each in release order. Tick your way through.</p></div></header>" +
          '<div class="filter-row coll-filters">' + segmented("cfilter", COLL_FILTERS, filter) + "</div>" +
          (items.length ? collectionsHtml(items) : empty("Nothing here yet.", filter === "started" ? "Watch one film from a series and it shows up here." : "Try another filter.")) + "</div>";
        FL.ui.watchPosters(el);
        showActiveTab(el);
      }
      function onClick(e) {
        const seg = e.target.closest('[data-seg="cfilter"]');
        if (!seg) return;
        filter = seg.dataset.value;
        render();
      }
      el.addEventListener("click", onClick);
      render();
      return {
        update(detail) { if (detail.kind !== "progress") { const y = window.scrollY; render(); window.scrollTo(0, y); } },
        destroy() { el.removeEventListener("click", onClick); },
      };
    },
  };

  FL.views.library = {
    title: "Library",
    mount(el, params) {
      if (params[0] === "collections") { location.replace("#/collections"); return {}; }
      const tab = TABS.some(([t]) => t === params[0]) ? params[0] : "watchlist";
      let shown = 0;
      let films = [];

      function render() {
        const prefs = FL.store.prefs().library;
        const counts = { watchlist: FL.store.watchlist().length, watched: FL.store.watched().length };
        const tabs = libraryTabs(tab);
        const toolbar = tab === "collections" ? "" :
          '<div class="filter-row"><label class="select"><span class="sr-only">Sort</span><select data-lib="sort">' +
          SORTS.map(([v, l]) => '<option value="' + v + '"' + (v === prefs.sort ? " selected" : "") + ">" + (v === "recent" && tab === "watched" ? "Recently watched" : l) + "</option>").join("") +
          "</select>" + icon("chevron-down") + '</label><span class="grow"></span>' +
          segmented("libview", [["grid", icon("grid") + '<span class="sr-only">Grid</span>'], ["list", icon("list") + '<span class="sr-only">List</span>']], prefs.view) + "</div>";

        el.innerHTML = '<div class="container page">' +
          '<header class="page-head"><div><h1 class="h1">Library</h1><p class="sub">' + plural(counts.watched, "film") + " watched · " + plural(counts.watchlist, "film") + " to watch</p></div>" +
          '<div class="btn-row head-actions"><a class="btn btn-ghost" href="#/match">' + icon("users") + "Movie night</a>" +
          '<a class="btn btn-ghost" href="#/diary">' + icon("calendar") + "Diary</a>" +
          '<a class="btn btn-ghost" href="#/stats">' + icon("chart") + "Stats</a></div></header>" +
          tabs + toolbar + '<div data-lib-results></div><div class="sentinel" aria-hidden="true"></div></div>';
        showActiveTab(el);

        const results = $("[data-lib-results]", el);
        if (tab === "collections") {
          results.innerHTML = collectionsHtml();
          FL.ui.watchPosters(results);
          return;
        }
        films = sortEntries(entriesFor(tab), prefs.sort, tab).map((e) => FL.catalogue.get(e.id)).filter(Boolean);
        shown = 0;
        if (!films.length) { results.innerHTML = emptyFor(tab); return; }
        results.className = prefs.view === "list" ? "rows" : "grid";
        more();
      }

      function more() {
        const results = $("[data-lib-results]", el);
        const prefs = FL.store.prefs().library;
        const slice = films.slice(shown, shown + PAGE);
        shown += slice.length;
        results.insertAdjacentHTML("beforeend", slice.map((f) => (prefs.view === "list" ? row(f) : card(f))).join(""));
        FL.ui.watchPosters(results);
      }

      const io = new IntersectionObserver((en) => { if (en[0].isIntersecting && shown < films.length) more(); }, { rootMargin: "1000px 0px" });

      function onChange(e) {
        if (e.target.dataset.lib === "sort") {
          FL.store.patchPref("library", { sort: e.target.value });
          render();
          io.observe($(".sentinel", el));
        }
      }
      function onClick(e) {
        const seg = e.target.closest('[data-seg="libview"]');
        if (!seg) return;
        FL.store.patchPref("library", { view: seg.dataset.value });
        render();
        io.observe($(".sentinel", el));
      }

      render();
      io.observe($(".sentinel", el));
      el.addEventListener("change", onChange);
      el.addEventListener("click", onClick);

      return {
        update(detail) {
          if (detail.kind === "progress" || detail.kind === "note") return;
          // Leave cards in place (refreshed individually) unless membership of this tab changed.
          const ids = new Set(entriesFor(tab).map((e) => e.id));
          const same = tab === "collections" || (ids.size === films.length && films.every((f) => ids.has(f.id)));
          if (same && tab !== "collections") return;
          const y = window.scrollY;
          render();
          io.observe($(".sentinel", el));
          window.scrollTo(0, y);
        },
        destroy() {
          io.disconnect();
          el.removeEventListener("change", onChange);
          el.removeEventListener("click", onClick);
        },
      };
    },
  };

  /* ---------- diary ---------- */

  function heatmap(year, rows) {
    const byDay = {};
    // Films you ticked count on the day you ticked them, so the calendar fills in as you use Iris.
    rows.forEach((r) => { (byDay[r.date] = byDay[r.date] || []).push(r.entry.title + (r.marked ? " (ticked)" : "")); });
    const start = new Date(year, 0, 1);
    const offset = (start.getDay() + 6) % 7; // Monday-first
    const days = (new Date(year + 1, 0, 1) - start) / 864e5;
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push('<i class="h-pad"></i>');
    const monthCols = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(year, 0, 1 + i);
      const iso = year + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
      const titles = byDay[iso] || [];
      const lvl = Math.min(3, titles.length);
      if (d.getDate() === 1) monthCols.push([d.getMonth(), Math.floor((i + offset) / 7)]);
      cells.push('<i class="l' + lvl + '"' + (titles.length ? ' data-tip="' + esc(plural(titles.length, "film") + "\n" + fmtDate(iso) + ": " + titles.join(", ")) + '"' : ' data-tip="' + esc("No films\n" + fmtDate(iso)) + '"') + "></i>");
    }
    const weeks = Math.ceil((days + offset) / 7);
    const activeDays = Object.keys(byDay).length;
    return '<div class="heat-wrap"><div class="heat" style="--weeks:' + weeks + '" role="img" aria-label="' + esc(year + ": films on " + plural(activeDays, "day")) + '">' +
      '<div class="heat-months">' + monthCols.map(([m, col]) => '<span style="grid-column:' + (col + 1) + '">' + MONTHS_SHORT[m] + "</span>").join("") + "</div>" +
      '<div class="heat-grid">' + cells.join("") + "</div></div>" +
      '<div class="heat-legend" aria-hidden="true"><span>Less</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><span>More</span></div></div>';
  }

  function monthBlock(key, rows) {
    const [y, m] = key.split("-").map(Number);
    const ids = new Set(rows.map((r) => r.id));
    const minutes = rows.reduce((sum, r) => sum + (r.entry.runtime || 0), 0);
    const rated = Array.from(ids).map((id) => FL.store.peek(id)).filter((e) => e && e.rating);
    const avg = rated.length ? rated.reduce((s, e) => s + e.rating, 0) / rated.length : 0;
    const summary = [plural(rows.length, "film")];
    if (minutes) summary.push(fmtRuntime(minutes));
    if (avg) summary.push("avg " + (avg / 2).toFixed(1) + " ★");
    return '<section class="month"><header class="month-head"><h2 class="h2">' + MONTHS[m - 1] + " <span>" + y + "</span></h2>" +
      '<p class="muted">' + summary.join(" · ") + "</p></header><ol class='diary-list'>" +
      rows.map((r) => {
        const film = FL.catalogue.get(r.id);
        if (!film) return "";
        const d = parseISO(r.date);
        return '<li class="diary-row"><span class="diary-day"><strong>' + d.getDate() + "</strong><small>" + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()] + "</small></span>" +
          '<a class="diary-art" href="#/film/' + encodeURIComponent(film.id) + '" tabindex="-1" aria-hidden="true">' + art(film) + "</a>" +
          '<div class="diary-main"><a class="diary-title" href="#/film/' + encodeURIComponent(film.id) + '">' + esc(film.title) + "</a> <span class='muted'>" + film.year + "</span>" +
          (r.rewatch ? ' <span class="rewatch" title="Rewatch">' + icon("rewatch") + "</span>" : "") +
          (r.marked ? ' <span class="diary-mark" title="Ticked as watched on this day, with no watch date">ticked</span>' : "") + "</div>" +
          '<div class="diary-rating">' + (r.entry.rating ? stars(r.entry.rating, "stars-sm") : "") + (r.entry.fav ? '<span class="fav-mark" title="Favourite">' + icon("heart") + "</span>" : "") + "</div></li>";
      }).join("") + "</ol></section>";
  }

  FL.views.diary = {
    title: "Diary",
    mount(el, params) {
      function render() {
        const all = FL.store.diary();
        const years = FL.stats.years();
        const chosen = params[0] && /^\d{4}$/.test(params[0]) ? +params[0] : +(all[0] ? all[0].date.slice(0, 4) : new Date().getFullYear());
        if (years.indexOf(chosen) === -1) years.push(chosen);
        const rows = all.filter((r) => +r.date.slice(0, 4) === chosen);
        const undated = 0; // ticked films now appear on the day they were ticked
        const s = FL.stats.summary(chosen);

        const groups = [];
        rows.forEach((r) => {
          const k = r.date.slice(0, 7);
          if (!groups.length || groups[groups.length - 1][0] !== k) groups.push([k, []]);
          groups[groups.length - 1][1].push(r);
        });

        el.innerHTML = '<div class="container page diary">' +
          '<header class="page-head"><div><p class="eyebrow">Diary</p><h1 class="display">Your year in <em>film.</em></h1></div>' +
          '<a class="btn btn-ghost" href="#/stats/' + chosen + '">' + icon("chart") + chosen + " stats</a></header>" +
          '<div class="scope-nav">' + segmented("dyear", years.sort((a, b) => b - a).map((y) => [y, y]), chosen) + "</div>" +
          '<section class="panel">' + heatmap(chosen, rows) +
          '<p class="heat-summary">' + (rows.some((r) => !r.marked)
            ? "<strong>" + plural(s.films, "film") + "</strong> · " + plural(s.viewings, "viewing") + (s.minutes ? " · " + fmtHours(s.minutes) : "") + (s.rated ? " · avg " + s.avgRating.toFixed(1) + " ★" : "") + (s.rewatches ? " · " + plural(s.rewatches, "rewatch", "rewatches") : "")
            : rows.length ? "<strong>" + plural(rows.length, "film") + "</strong> in " + chosen + " · ticked as watched" : "Nothing in " + chosen + " yet.") + "</p></section>" +
          (groups.length ? groups.map(([k, list]) => monthBlock(k, list)).join("")
            : empty("Your film history, day by day.", "Tick a film as watched, or finish one in the player, and it shows up here on that day.", '<a class="btn" href="#/years">Pick from the years</a>')) +
          (undated ? '<p class="footnote">' + plural(undated, "film") + " marked watched without a date. They count in all-time stats. <a class=\"link\" href=\"#/library/watched\">Add dates from their pages</a>.</p>" : "") +
          "</div>";
        FL.ui.watchPosters(el);
      }
      render();
      function onClick(e) {
        const seg = e.target.closest('[data-seg="dyear"]');
        if (seg) location.hash = "#/diary/" + seg.dataset.value;
      }
      el.addEventListener("click", onClick);
      return {
        update(detail) {
          if (detail.kind === "progress") return;
          const y = window.scrollY;
          render();
          window.scrollTo(0, y);
        },
        destroy() { el.removeEventListener("click", onClick); },
      };
    },
  };
})(window.FL = window.FL || {});
