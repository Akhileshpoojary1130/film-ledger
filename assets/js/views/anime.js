/* Sakura — the anime app's pages: Home, Seasons, Explore, A–Z, Library and a title page, plus its search, Spin, and
   the switch between Iris (films & web series) and Sakura (anime). Built from Iris's own parts — cards, rails, the
   hero, the episode list, the record panel and the player — so the two apps look and move alike. */
(function (FL) {
  "use strict";

  FL.views = FL.views || {};
  const { $, $$, esc, plural, fmtDate, hash, on } = FL.util;
  const icon = (n, c) => FL.ui.icon(n, c);
  const AN = () => FL.anime;

  /* ---------- parts ---------- */

  const hrefOf = (a) => "#/anime/" + encodeURIComponent(a.id);
  const watchHref = (a, e) => "#/anime/watch/" + encodeURIComponent(a.id) + "?e=" + (e || 1);

  function art(a, eager) {
    const hue = hash(a.title) % 360;
    return '<div class="art" style="--ph:' + hue + '"><div class="ph" style="--ph:' + hue + '"><span class="ph-title">' + esc(a.title) +
      '</span><span class="ph-year">' + esc(a.year || "") + "</span></div>" +
      (a.cover ? '<img src="' + esc(a.cover) + '" alt="" loading="' + (eager ? "eager" : "lazy") + '" decoding="async" referrerpolicy="no-referrer" draggable="false">' : "") + "</div>";
  }

  function metaOf(a) {
    return [AN().formatLabel(a), a.year || "", a.episodes > 1 ? a.episodes + " eps" : ""].filter(Boolean).map(esc).join(" · ");
  }

  function progressBar(a) {
    const e = FL.store.peek(a.id);
    const p = e && e.progress;
    if (!p || !p.d || p.t < 60 || p.t / p.d >= 0.92) return "";
    return '<div class="card-progress"><i style="width:' + Math.min(100, (p.t / p.d) * 100).toFixed(1) + '%"></i></div>';
  }

  function card(a, o) {
    const opt = o || {};
    const st = FL.store.state(a.id);
    const link = hrefOf(a);
    const badges = (st.fav ? '<span class="badge badge-fav" title="Favourite">' + icon("heart") + "</span>" : "") +
      (st.episodes ? '<span class="badge badge-seen" title="Episodes watched">' + icon("tv") + "<b>" + st.episodes + "</b></span>" : "");
    return '<article class="card acard" data-aid="' + esc(a.id) + '">' +
      '<a class="card-link" href="' + link + '" aria-label="' + esc(a.title) + '">' + art(a) +
        (badges ? '<div class="badges">' + badges + "</div>" : "") +
        (a.status === "RELEASING" ? '<span class="tag-must tag-air">Airing</span>' : "") + progressBar(a) + "</a>" +
      (opt.noQuick ? "" : '<div class="card-quick"><button type="button" class="qa qa-later' + (st.listed ? " on" : "") + '" data-aqa="list" aria-pressed="' + st.listed +
        '" aria-label="' + (st.listed ? "Remove from Plan to watch" : "Plan to watch") + '" title="' + (st.listed ? "On your Plan to watch" : "Plan to watch") + '">' + icon("bookmark") + "</button></div>") +
      '<div class="card-body"><a class="card-title" href="' + link + '" tabindex="-1">' + esc(a.title) + "</a>" +
        '<div class="card-meta"><span>' + metaOf(a) + "</span>" +
        (st.rating ? FL.ui.stars(st.rating, "stars-sm") : a.score ? '<span class="imdb" title="AniList score">★ ' + (a.score / 10).toFixed(1) + "</span>" : "") + "</div>" +
        (opt.caption ? '<div class="card-caption">' + opt.caption + "</div>" : "") + "</div></article>";
  }

  function railHead(title, o) {
    return '<header class="section-head"><div>' + (o.eyebrow ? '<p class="eyebrow">' + o.eyebrow + "</p>" : "") + '<h2 class="h2">' + title + "</h2>" +
      (o.sub ? '<p class="sub">' + o.sub + "</p>" : "") + "</div>" +
      '<div class="section-tools">' + (o.more ? '<a class="link-more" href="' + o.more + '">See all' + icon("arrow-right") + "</a>" : "") +
      '<button type="button" class="icon-btn icon-btn-sm rail-btn" data-rail="-1" aria-label="Scroll left">' + icon("chevron-left") + "</button>" +
      '<button type="button" class="icon-btn icon-btn-sm rail-btn" data-rail="1" aria-label="Scroll right">' + icon("chevron-right") + "</button></div></header>";
  }

  function rail(title, list, o) {
    const opt = o || {};
    if (!list.length && !opt.empty) return "";
    return '<section class="rail' + (opt.cls ? " " + opt.cls : "") + '"' + (opt.id ? ' data-rail-id="' + opt.id + '"' : "") + ">" + railHead(title, opt) +
      (list.length ? '<div class="rail-track">' + list.map((a) => card(a, { caption: opt.caption ? opt.caption(a) : "", noQuick: opt.noQuick })).join("") + "</div>" : opt.empty) + "</section>";
  }

  const grid = (list, o) => '<div class="grid">' + list.map((a) => card(a, o)).join("") + "</div>";

  /* Your library's copy of a title (name, artwork) when this visit hasn't loaded it. */
  function fromEntry(e) {
    return AN().get(e.id) || { id: e.id, type: "anime", title: e.title, year: e.year, genres: e.genres || [], cover: "", format: "", episodes: 0, aired: 0, status: "" };
  }

  /* Plan to watch from any card. */
  on(document, "click", "[data-aqa]", (e, btn) => {
    e.preventDefault();
    const host = btn.closest("[data-aid]");
    const a = host && AN().get(host.dataset.aid);
    if (!a) return;
    AN().remember(a);
    const entry = FL.store.toggleList(a);
    const listed = !!(entry && entry.listed);
    btn.classList.toggle("on", listed);
    btn.setAttribute("aria-pressed", String(listed));
    FL.ui.toast((listed ? "Added to Plan to watch: " : "Removed from Plan to watch: ") + a.title);
  });

  // Whatever you do with an anime, its name and artwork are kept for your library.
  FL.store.on((d) => { if (d.id && /^(an\d+|zr-)/.test(d.id)) { const a = AN().get(d.id); if (a) AN().remember(a); } });

  /* ---------- episodes you're up to ---------- */

  function nextUp(a, list) {
    const aired = list.filter((v) => v.aired);
    if (!aired.length) return null;
    const e = FL.store.peek(a.id);
    if (e && e.progress && e.progress.e && e.progress.t / (e.progress.d || 1) < 0.92) {
      const hit = aired.find((v) => v.e === e.progress.e);
      if (hit) return hit;
    }
    let last = -1;
    aired.forEach((v, i) => { if (FL.store.episodeWatched(a.id, 1, v.e)) last = i; });
    return aired[last + 1] || null;
  }

  /* Up Next: anime you're partway through (where you stopped, else the next episode that's out). */
  function upNextList(max) {
    return AN().entries()
      .filter((e) => !e.dropped && (e.progress || Object.keys(e.episodes || {}).length))
      .sort((x, y) => Math.max(y.updated, (y.progress && y.progress.at) || 0) - Math.max(x.updated, (x.progress && x.progress.at) || 0))
      .map((e) => {
        const a = fromEntry(e);
        const p = e.progress;
        if (p && p.e && p.d && p.t / p.d < 0.92) return { a, e: p.e, p };
        const seen = Object.keys(e.episodes || {}).map((k) => +k.split(":")[1]);
        const n = (seen.length ? Math.max.apply(null, seen) : 0) + 1;
        const aired = a.aired || a.episodes || 0;
        return aired && n > aired ? null : { a, e: n, p: null };
      }).filter(Boolean).slice(0, max || 3);
  }

  function upNextRail() {
    const list = upNextList(3);
    if (!list.length) return "";
    return '<section class="rail"><header class="section-head"><div><h2 class="h2">Up Next</h2></div></header><div class="rail-track rail-wide">' +
      list.map(({ a, e, p }) => {
        const left = p ? "E" + e + " · " + FL.util.fmtClock(p.d - p.t) + " left" : "Episode " + e;
        return '<article class="resume-card tilt" data-resume="' + esc(a.id) + '"><a class="resume-link" href="' + watchHref(a, e) + '">' +
          '<div class="resume-art">' + (a.banner ? '<img src="' + esc(a.banner) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : art(a)) +
          '<span class="resume-play">' + icon("play") + "</span>" +
          (p ? '<div class="card-progress"><i style="width:' + ((p.t / p.d) * 100).toFixed(1) + '%"></i></div>' : "") + "</div>" +
          '<div class="resume-body"><strong>' + esc(a.title) + "</strong><span>" + esc(left) + "</span></div></a></article>";
      }).join("") + "</div></section>";
  }

  /* ---------- Home ---------- */

  const LINES = {
    morning: [["One episode", "before the day begins?"], ["Morning.", "Your next arc is ready."], ["Rise and shine,", "the opening theme is waiting."]],
    noon: [["Lunch break?", "That's one episode."], ["Afternoon.", "Time for a cour or two."], ["Twenty-four minutes", "of pure joy, anyone?"]],
    evening: [["Evening.", "Your next arc awaits."], ["Tonight's lineup", "is looking strong."], ["Put the kettle on.", "The episode's starting."]],
    night: [["Still up?", "One more episode, then sleep."], ["Late-night anime", "hits different."], ["Just one more", "(we both know it isn't)."]],
  };
  function greeting() {
    const h = new Date().getHours();
    const slot = h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "noon" : h >= 17 && h < 22 ? "evening" : "night";
    const pool = LINES[slot];
    const g = FL.voice && FL.voice.greeting ? FL.voice.greeting(FL.store.prefs().name) : null;
    return { eyebrow: g ? g.eyebrow : "", line: pool[hash(FL.util.todayISO()) % pool.length] };
  }

  function hero() {
    const g = greeting();
    const mod = FL.palette.isMac() ? "⌘K" : "Ctrl K";
    return '<section class="home-hero sakura-hero">' +
      (g.eyebrow ? '<p class="eyebrow">' + esc(g.eyebrow) + "</p>" : "") +
      '<h1 class="display hero-line"><span class="hero-words">' + esc(g.line[0]) + " <em>" + esc(g.line[1]) + "</em></span></h1>" +
      '<button type="button" class="hero-search" data-open="palette" data-page-search>' + icon("search") + "<span>Search anime</span><kbd>" + mod + "</kbd></button>" +
      "</section>";
  }

  /* Spotlight: three of the week's most talked-about, as wide artwork cards (Tonight's Trio, for anime). */
  function spotlight(list) {
    const picks = list.filter((a) => a.banner).slice(0, 3);
    if (!picks.length) return "";
    return '<section class="tonight-row" aria-label="Spotlight">' +
      '<header class="section-head tonight-head"><div><h2 class="h2">Spotlight</h2></div></header>' +
      '<ol class="tn-list">' + picks.map((a, i) => {
        const facts = [AN().formatLabel(a), AN().seasonLabel(a.season, a.year), a.score ? "★ " + (a.score / 10).toFixed(1) : ""].filter(Boolean).map(esc).join(" · ");
        const why = AN().airingIn(a) || (a.genres.slice(0, 2).join(" · ")) || "#" + (i + 1) + " this week";
        const st = FL.store.peek(a.id);
        const seen = st ? Object.keys(st.episodes || {}).map((k) => +k.split(":")[1]) : [];
        const e = seen.length ? Math.max.apply(null, seen) + 1 : 1;
        return '<li class="tn-card" data-tonight="' + esc(a.id) + '">' +
          '<a class="tn-link" href="' + hrefOf(a) + '" aria-label="' + esc(a.title) + '">' +
            '<span class="tn-media"><img class="tn-bg" src="' + esc(a.banner) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest(\'.tn-card\').classList.add(\'is-posteronly\');this.remove()">' +
              '<span class="tn-poster">' + art(a) + "</span></span>" +
            '<span class="tn-body"><span class="tn-why">' + esc(why) + '</span><strong class="tn-title">' + esc(a.title) + "</strong>" +
              '<span class="tn-facts">' + facts + "</span></span>" +
          "</a>" +
          (a.aired ? '<a class="tn-play" href="' + watchHref(a, Math.min(e, a.aired)) + '" aria-label="Play ' + esc(a.title) + '">' + icon("play") + "<span>" + (e > 1 ? "E" + Math.min(e, a.aired) : "Play") + "</span></a>" : "") +
          "</li>";
      }).join("") + "</ol></section>";
  }

  function genreChips() {
    return '<section class="rail sakura-genres"><header class="section-head"><div><h2 class="h2">Genres</h2></div></header><div class="chip-row">' +
      AN().GENRES.map((g) => '<a class="chip" href="#/anime/explore?genre=' + encodeURIComponent(g) + '">' + esc(g) + "</a>").join("") + "</div></section>";
  }

  FL.views.animeHome = {
    title: "Home",
    mount(el) {
      let alive = true;
      const h = AN().home();
      function paint(d) {
        if (!alive) return;
        const shown = new Set(d.trending.filter((a) => a.banner).slice(0, 3).map((a) => a.id));
        const mine = AN().entries().filter((e) => e.listed).sort((x, y) => y.listedAt - x.listedAt).map(fromEntry);
        el.innerHTML = '<div class="container page sakura-home">' + hero() + upNextRail() + spotlight(d.trending) +
          '<section class="rail" data-rail-id="foryou"></section>' +
          '<section class="rail" data-rail-id="latest"></section>' +
          rail("This season", d.season, { more: "#/anime/seasons/" + d.now.year + "/" + d.now.season.toLowerCase(), caption: (a) => esc(AN().airingIn(a)) }) +
          rail("Trending now", d.trending.filter((a) => !shown.has(a.id))) +
          (mine.length ? rail("Plan to watch", mine.slice(0, 24), { more: "#/anime/library/plan" }) : "") +
          rail("Next season", d.upcoming, { more: "#/anime/seasons/" + d.next.year + "/" + d.next.season.toLowerCase() }) +
          '<section class="rail" data-rail-id="colls"></section>' +
          genreChips() +
          rail("All-time favourites", d.popular, { more: "#/anime/explore?sort=popular" }) +
          rail("Top rated", d.top, { more: "#/anime/explore?sort=top" }) +
          rail("Films", d.movies, { more: "#/anime/explore?format=MOVIE" }) +
          "</div>";
        if (FL.app) FL.app.watchSearch();
        fillForYou();
        fillLatest();
        fillCollections();
        const first = d.trending.find((a) => a.banner);
        if (first) FL.ambient.art(first.banner);
      }
      /* Popular franchises, each one card that opens its collection. */
      function fillCollections() {
        AN().popularCollections().then((list) => {
          const box = alive && $('[data-rail-id="colls"]', el);
          if (!box || !list.length) return;
          box.outerHTML = '<section class="rail">' + railHead("Collections", { more: "#/anime/collections" }) + '<div class="rail-track">' + list.slice(0, 16).map(collCard).join("") + "</div></section>";
        }).catch(() => {});
      }
      /* For you: from what you've watched and liked (AniList's community recommendations). */
      function fillForYou() {
        AN().forYou().then((list) => {
          const box = alive && $('[data-rail-id="foryou"]', el);
          if (!box) return;
          if (!list.length) { box.remove(); return; }
          const why = new Map(list.map((x) => [x.anime.id, x.because]));
          box.outerHTML = rail("For you", list.map((x) => x.anime), { caption: (a) => esc("Because you liked " + why.get(a.id)) });
        }).catch(() => { const box = $('[data-rail-id="foryou"]', el); if (box) box.remove(); });
      }
      /* Zoro TV's newest episodes. */
      function fillLatest() {
        AN().latest().then((list) => {
          const box = alive && $('[data-rail-id="latest"]', el);
          if (!box || !list.length) return;
          const items = list.slice(0, 20).map((r) => Object.assign(AN().zoroItem(r), { _ep: r.ep }));
          box.outerHTML = rail("Just out", items, { noQuick: true, caption: (a) => "Episode " + a._ep });
        });
      }
      if (h.cached) paint(h.cached);
      else el.innerHTML = '<div class="container page sakura-home">' + hero() + upNextRail() + '<div class="page-loading">' + FL.ui.loader(40, "Loading") + "</div></div>";
      h.fresh.then((d) => { if (!h.cached || alive) { const y = window.scrollY; paint(d); window.scrollTo(0, y); } }).catch(() => {
        if (alive && !h.cached) $(".page-loading", el).innerHTML = FL.ui.empty("AniList didn’t answer.", "Check your connection and try again.", '<button type="button" class="btn" onclick="FL.app.refresh()">Try again</button>');
      });
      return {
        update(detail) {
          if (detail.kind === "progress" || detail.kind === "episode" || detail.kind === "sync") {
            const box = $(".sakura-home > .rail:not([data-rail-id])", el);
            if (box && box.querySelector(".resume-card")) { const tmp = document.createElement("div"); tmp.innerHTML = upNextRail(); box.replaceWith(tmp.firstChild || document.createTextNode("")); }
          }
        },
        destroy() { alive = false; },
      };
    },
  };

  /* ---------- a list page: Seasons and Explore share it ---------- */

  function listPage(el, head, opts, controls) {
    let alive = true;
    let page = 1;
    let items = [];
    const seen = new Set();
    el.innerHTML = '<div class="container page">' + head + controls + '<div data-results><div class="page-loading">' + FL.ui.loader(36, "Loading") + '</div></div><div class="year-more" data-more></div></div>';
    const results = $("[data-results]", el);
    const more = $("[data-more]", el);
    function load() {
      more.innerHTML = page > 1 ? FL.ui.loader(24) : "";
      AN().browse(Object.assign({}, opts, { page })).then((d) => {
        if (!alive) return;
        d.items.forEach((a) => { if (!seen.has(a.id)) { seen.add(a.id); items.push(a); } });
        results.innerHTML = items.length ? grid(items) : FL.ui.empty("Nothing here yet.", "Try another season, genre or format.");
        more.innerHTML = d.more ? '<button type="button" class="btn" data-an="more">Show more</button>' : "";
      }).catch(() => {
        if (!alive) return;
        if (!items.length) results.innerHTML = FL.ui.empty("AniList didn’t answer.", "Check your connection and try again.");
        more.innerHTML = '<button type="button" class="btn" data-an="more">Try again</button>';
      });
    }
    const onClick = (e) => { if (e.target.closest('[data-an="more"]')) { page += items.length ? 1 : 0; load(); } };
    el.addEventListener("click", onClick);
    load();
    return { destroy() { alive = false; el.removeEventListener("click", onClick); } };
  }

  const FORMATS = [["", "All"], ["TV", "TV"], ["MOVIE", "Films"], ["ONA", "ONA"], ["OVA", "OVA"]];
  const seg = (name, list, value) => FL.ui.segmented(name, list, value);

  FL.views.animeSeasons = {
    title: "Seasons",
    mount(el, params, query) {
      const now = AN().seasonOf();
      const year = +params[0] || now.year;
      const season = (params[1] || (params[0] ? "" : now.season)).toUpperCase();
      const format = (query && query.get("format")) || "";
      const years = [];
      for (let y = now.year + 1; y >= 1990; y--) years.push(y);
      const go = (y, s, f) => "#/anime/seasons/" + y + "/" + s.toLowerCase() + (f ? "?format=" + f : "");
      const strip = '<nav class="year-strip sakura-years" aria-label="Year">' + years.map((y) =>
        '<a class="chip' + (y === year ? " is-on" : "") + '" href="' + go(y, season || "WINTER", format) + '"' + (y === year ? ' aria-current="true"' : "") + ">" + y + "</a>").join("") + "</nav>";
      const seasons = '<div class="sakura-controls">' + '<div class="seg" role="radiogroup" aria-label="Season">' + AN().SEASONS.map((s) =>
        '<a role="radio" class="seg-btn' + (s === season ? " is-on" : "") + '" aria-checked="' + (s === season) + '" href="' + go(year, s, format) + '">' +
        ({ WINTER: "❄︎ ", SPRING: "✿ ", SUMMER: "☀︎ ", FALL: "❦ " })[s] + s.charAt(0) + s.slice(1).toLowerCase() + "</a>").join("") + "</div>" +
        '<div class="seg" role="radiogroup" aria-label="Format">' + FORMATS.slice(0, 4).map(([v, l]) =>
          '<a role="radio" class="seg-btn' + (v === format ? " is-on" : "") + '" aria-checked="' + (v === format) + '" href="' + go(year, season || "WINTER", v) + '">' + l + "</a>").join("") + "</div></div>";
      const head = '<header class="page-head"><div><h1 class="h1">' + esc(AN().seasonLabel(season, year)) + "</h1></div></header>";
      const h = listPage(el, head, { season, year, format, sort: "popular" }, strip + seasons);
      const on = $(".sakura-years .is-on", el);
      if (on) on.scrollIntoView({ inline: "center", block: "nearest" });
      return h;
    },
  };

  FL.views.animeExplore = {
    title: "Explore",
    mount(el, params, query) {
      const genre = (query && query.get("genre")) || "";
      const sort = (query && query.get("sort")) || "popular";
      const format = (query && query.get("format")) || "";
      const q = (g, s, f) => "#/anime/explore?" + [g ? "genre=" + encodeURIComponent(g) : "", s && s !== "popular" ? "sort=" + s : "", f ? "format=" + f : ""].filter(Boolean).join("&");
      const mod = FL.palette.isMac() ? "⌘K" : "Ctrl K";
      const controls = '<button type="button" class="hero-search" data-open="palette" data-page-search>' + icon("search") + "<span>Search anime</span><kbd>" + mod + "</kbd></button>" +
        '<div class="chip-row sakura-chips"><a class="chip' + (!genre ? " is-on" : "") + '" href="' + q("", sort, format) + '">All genres</a>' +
        AN().GENRES.map((g) => '<a class="chip' + (g === genre ? " is-on" : "") + '" href="' + q(g, sort, format) + '">' + esc(g) + "</a>").join("") + "</div>" +
        '<div class="sakura-controls"><div class="seg" role="radiogroup" aria-label="Sort">' +
          [["popular", "Popular"], ["top", "Top rated"], ["trending", "Trending"], ["new", "Newest"]].map(([v, l]) =>
            '<a role="radio" class="seg-btn' + (v === sort ? " is-on" : "") + '" aria-checked="' + (v === sort) + '" href="' + q(genre, v, format) + '">' + l + "</a>").join("") + "</div>" +
          '<div class="seg" role="radiogroup" aria-label="Format">' + FORMATS.slice(0, 3).map(([v, l]) =>
            '<a role="radio" class="seg-btn' + (v === format ? " is-on" : "") + '" aria-checked="' + (v === format) + '" href="' + q(genre, sort, v) + '">' + l + "</a>").join("") + "</div></div>";
      const head = '<header class="page-head"><div><h1 class="h1">' + esc(genre || (format === "MOVIE" ? "Anime films" : "Explore")) + "</h1></div></header>";
      const h = listPage(el, head, { genre, sort, format }, controls);
      if (FL.app) FL.app.watchSearch();
      return h;
    },
  };

  /* ---------- A–Z (Zoro TV's list) ---------- */

  FL.views.animeAz = {
    title: "A–Z",
    mount(el, params, query) {
      let alive = true;
      const letter = (params[0] || "a").toLowerCase();
      const type = (query && query.get("type")) || "";
      const letters = ["0"].concat("abcdefghijklmnopqrstuvwxyz".split(""));
      const go = (l, t) => "#/anime/az/" + l + (t ? "?type=" + t : "");
      el.innerHTML = '<div class="container page">' +
        '<header class="page-head"><div><h1 class="h1">A–Z</h1><p class="sub" data-count></p></div></header>' +
        '<nav class="az-strip" aria-label="Letter">' + letters.map((l) =>
          '<a class="az-letter' + (l === letter ? " is-on" : "") + '" href="' + go(l, type) + '"' + (l === letter ? ' aria-current="true"' : "") + ">" + (l === "0" ? "#" : l.toUpperCase()) + "</a>").join("") + "</nav>" +
        '<div class="sakura-controls"><div class="seg" role="radiogroup" aria-label="Type">' +
          [["", "All"], ["TV", "TV"], ["Movie", "Films"], ["ONA", "ONA"], ["OVA", "OVA"], ["Special", "Specials"]].map(([v, l]) =>
            '<a role="radio" class="seg-btn' + (v === type ? " is-on" : "") + '" aria-checked="' + (v === type) + '" href="' + go(letter, v) + '">' + l + "</a>").join("") + "</div></div>" +
        '<div data-results><div class="page-loading">' + FL.ui.loader(36, "Loading") + "</div></div></div>";
      AN().zoroList().then((rows) => {
        if (!alive) return;
        const list = rows.filter((r) => (letter === "0" ? !/^[a-z]/i.test(r.title) : r.title.charAt(0).toLowerCase() === letter) && (!type || r.type === type));
        $("[data-count]", el).textContent = plural(list.length, "series", "series");
        $("[data-results]", el).innerHTML = list.length ? grid(list.map(AN().zoroItem), { noQuick: true })
          : FL.ui.empty(rows.length ? "Nothing under this letter." : "The A–Z list didn’t load.", rows.length ? "Try another letter or type." : "Check your connection and reload.");
      });
      const on = $(".az-strip .is-on", el);
      if (on) on.scrollIntoView({ inline: "center", block: "nearest" });
      return { destroy() { alive = false; } };
    },
  };

  /* ---------- Library ---------- */

  const TABS = [["watching", "Watching"], ["plan", "Plan to watch"], ["done", "Completed"], ["favorites", "Favourites"]];

  function libraryLists() {
    const all = AN().entries();
    const done = (e) => {
      const a = fromEntry(e);
      const n = Object.keys(e.episodes || {}).length;
      return a.status === "FINISHED" && (a.episodes || a.aired) > 0 && n >= (a.episodes || a.aired);
    };
    const byUpdate = (x, y) => y.updated - x.updated;
    return {
      watching: all.filter((e) => !done(e) && (Object.keys(e.episodes || {}).length || e.progress)).sort(byUpdate),
      plan: all.filter((e) => e.listed && !Object.keys(e.episodes || {}).length).sort((x, y) => y.listedAt - x.listedAt),
      done: all.filter(done).sort(byUpdate),
      favorites: all.filter((e) => e.fav).sort(byUpdate),
    };
  }

  FL.views.animeLibrary = {
    title: "Library",
    mount(el, params) {
      const tab = TABS.some(([t]) => t === params[0]) ? params[0] : "watching";
      function render() {
        const lists = libraryLists();
        const list = lists[tab].map(fromEntry);
        const empty = {
          watching: ["Nothing on the go.", "Play an episode and it shows up here, with where you stopped."],
          plan: ["Your Plan to watch is empty.", "Tap the bookmark on any poster to save it for later."],
          done: ["No finished series yet.", "Tick the last episode of a finished series and it lands here."],
          favorites: ["No favourites yet.", "Tap the heart on a title’s page."],
        }[tab];
        el.innerHTML = '<div class="container page">' +
          '<header class="page-head"><div><h1 class="h1">Library</h1></div></header>' +
          '<nav class="tabs" aria-label="Lists">' + TABS.map(([t, l]) =>
            '<a class="tab' + (t === tab ? " is-on" : "") + '" href="#/anime/library/' + t + '"' + (t === tab ? ' aria-current="page"' : "") + ">" + l +
            "<span>" + lists[t].length + "</span></a>").join("") + "</nav>" +
          (list.length ? grid(list) : FL.ui.empty(empty[0], empty[1], '<a class="btn" href="#/anime">Find something to watch</a>')) + "</div>";
      }
      const current = () => { const on = $(".tabs .is-on", el); if (on) on.scrollIntoView({ inline: "center", block: "nearest" }); };
      render();
      current();
      return { update(d) { if (d.kind !== "progress") { const y = window.scrollY; render(); window.scrollTo(0, y); current(); } } };
    },
  };

  /* ---------- a title ---------- */

  const REL = { PREQUEL: "Prequel", SEQUEL: "Sequel", PARENT: "Main story", SIDE_STORY: "Side story", SPIN_OFF: "Spin-off",
    ALTERNATIVE: "Alternative", SUMMARY: "Recap", COMPILATION: "Compilation", CONTAINS: "Contains", ADAPTATION: "Adaptation", OTHER: "Related", CHARACTER: "Same characters" };

  FL.views.animeTitle = {
    title: "Anime",
    mount(el, params) {
      const id = decodeURIComponent(params[0]);
      let alive = true;
      let d = null;
      let list = [];
      let range = -1;
      let zoroEps = [];
      el.innerHTML = '<div class="container page"><div class="page-loading">' + FL.ui.loader(40, "Loading") + "</div></div>";

      function header() {
        const a = d.anime;
        const st = FL.store.state(a.id);
        const up = nextUp(a, list);
        const aired = list.filter((v) => v.aired);
        const seenCount = aired.filter((v) => FL.store.episodeWatched(a.id, 1, v.e)).length;
        const film = a.format === "MOVIE" && list.length <= 1;
        const eyebrow = [AN().formatLabel(a), AN().seasonLabel(a.season, a.year), (a.studios || [])[0]].filter(Boolean).map(esc).join(" · ");
        const facts = [film ? (a.duration ? FL.util.fmtRuntime(a.duration) : "") : list.length ? plural(a.episodes || list.length, "episode") + (a.duration ? " · " + a.duration + " min" : "") : "",
          AN().statusLabel(a), a.genres.slice(0, 3).join(", ")].filter(Boolean).map(esc).join('<span class="sep">·</span>');
        const alt = [a.romaji !== a.title ? a.romaji : "", a.native].filter(Boolean).map(esc).join(" · ");
        const playLabel = film ? "Play" : seenCount ? "Continue" : "Start";
        return '<div class="film-backdrop" aria-hidden="true"></div>' +
          '<div class="container film-hero">' +
            '<div class="film-poster">' + art(a, true) + "</div>" +
            '<div class="film-head">' +
              '<p class="eyebrow">' + eyebrow + "</p>" +
              '<h1 class="display film-title">' + esc(a.title) + "</h1>" +
              (alt ? '<p class="film-alt">' + alt + "</p>" : "") +
              '<p class="film-facts">' + facts + "</p>" +
              '<p class="film-scores">' + (a.score ? '<span class="imdb-score"><b>AniList</b> ' + (a.score / 10).toFixed(1) + "</span>" : "") +
                (AN().airingIn(a) ? '<span class="air-next">' + icon("clock") + esc(AN().airingIn(a)) + "</span>" : "") +
                (seenCount && !film ? '<span class="muted show-seen">' + seenCount + " of " + aired.length + " episodes watched</span>" : "") + "</p>" +
              '<div class="film-actions">' +
                (up ? '<a class="btn btn-primary btn-lg" href="' + watchHref(a, up.e) + '">' + icon("play") + playLabel + (film ? "" : " <small>E" + up.e + "</small>") + "</a>" : "") +
                '<button type="button" class="btn btn-lg toggle' + (st.listed ? " is-on" : "") + '" data-aa="list" aria-pressed="' + st.listed + '">' + icon("bookmark") + (st.listed ? "On your list" : "Plan to watch") + "</button>" +
                '<button type="button" class="icon-btn icon-btn-lg toggle fav' + (st.fav ? " is-on" : "") + '" data-aa="fav" aria-pressed="' + st.fav + '" aria-label="Favourite">' + icon("heart") + "</button>" +
                (a.trailer ? '<button type="button" class="icon-btn icon-btn-lg" data-aa="trailer" aria-label="Trailer" title="Trailer">' + icon("trailer") + "</button>" : "") +
              "</div>" +
            "</div>" +
          "</div>";
      }

      const PER = 100;
      function episodesHtml() {
        const a = d.anime;
        if (!list.length) return "";
        if (a.format === "MOVIE" && list.length <= 1) return "";
        const ranges = Math.ceil(list.length / PER);
        if (range < 0) { const up = nextUp(a, list); range = up ? Math.floor((up.e - 1) / PER) : 0; }
        const shown = list.slice(range * PER, range * PER + PER);
        const today = new Date().toISOString().slice(0, 10);
        const aired = shown.filter((v) => v.aired);
        const all = aired.length && aired.every((v) => FL.store.episodeWatched(a.id, 1, v.e));
        const fallbackThumb = a.banner || "";
        return '<section class="show-season">' +
          (ranges > 1 ? '<div class="season-nav">' + FL.ui.segmented("range", Array.from({ length: ranges }, (_, i) => [i, (i * PER + 1) + "–" + Math.min(list.length, i * PER + PER)]), range) + "</div>" : "") +
          '<div class="season-head"><h2 class="h2">Episodes <span class="muted">' + list.length + "</span></h2>" +
          '<div class="season-actions">' + (aired.length ? '<button type="button" class="btn btn-sm btn-ghost" data-aa="range">' + icon("check") + (all ? "Unmark these" : "Mark these watched") + "</button>" : "") + "</div></div>" +
          '<ol class="episodes"' + (fallbackThumb ? ' style="--bd:url(\'' + esc(fallbackThumb) + '\')"' : "") + ">" + shown.map((v) => {
            const w = FL.store.episodeWatched(a.id, 1, v.e);
            return '<li class="ep' + (w ? " is-watched" : "") + (v.aired ? "" : " is-upcoming") + '" data-ep="' + v.e + '">' +
              '<a class="ep-thumb" ' + (v.aired ? 'href="' + watchHref(a, v.e) + '"' : 'aria-disabled="true"') + ' tabindex="-1">' +
                '<span class="ep-fallback" aria-hidden="true"><b>E' + v.e + "</b></span>" +
                (v.thumb ? '<img src="' + esc(v.thumb) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">' : "") +
                (v.aired ? '<span class="ep-play">' + icon("play") + "</span>" : "") + "</a>" +
              '<div class="ep-main"><div class="ep-title"><span class="ep-num">E' + v.e + "</span>" + esc(v.title || "Episode " + v.e) + "</div>" +
                '<div class="ep-date">' + (v.aired ? "" : v.date ? (v.date > today ? "Airs " : "") + fmtDate(v.date) : "Coming soon") + "</div></div>" +
              '<div class="ep-actions">' + (v.aired ? '<button type="button" class="qa' + (w ? " on" : "") + '" data-aa="ep" aria-pressed="' + w + '" aria-label="' + (w ? "Watched" : "Mark watched") + '">' + icon("check") + "</button>" : "") + "</div>" +
              "</li>";
          }).join("") + "</ol></section>";
      }

      function charactersHtml() {
        if (!d.characters.length) return "";
        const chips = d.characters.map((c) => '<span class="person char">' +
          '<span class="avatar" style="--ph:' + (hash(c.name) % 360) + ';--sz:36px"><span>' + esc(c.name.split(" ").map((x) => x.charAt(0)).slice(0, 2).join("")) + "</span>" +
            (c.image ? '<img src="' + esc(c.image) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">' : "") + "</span>" +
          '<span class="person-text"><b>' + esc(c.name) + "</b><small>" + esc((c.role === "MAIN" ? "Main" : c.role === "SUPPORTING" ? "Supporting" : "Background") + (c.va ? " · " + c.va.name : "")) + "</small></span></span>");
        return FL.people.block("Characters &amp; voices", chips);
      }

      function relationsHtml() {
        const order = ["PREQUEL", "PARENT", "SEQUEL", "SIDE_STORY", "SPIN_OFF", "ALTERNATIVE", "SUMMARY", "COMPILATION", "CONTAINS", "OTHER", "CHARACTER"];
        const rel = d.relations.slice().sort((x, y) => (x.anime.year || 9999) - (y.anime.year || 9999) || order.indexOf(x.rel) - order.indexOf(y.rel));
        return rail("The story so far", rel.map((r) => Object.assign(r.anime, { _rel: REL[r.rel] || "Related" })), { caption: (a) => esc(a._rel) });
      }

      function linksHtml(a) {
        return (a.anilist ? '<a class="link" target="_blank" rel="noopener noreferrer" href="https://anilist.co/anime/' + a.anilist + '">AniList ↗</a>' : "") +
          (a.mal ? '<a class="link" target="_blank" rel="noopener noreferrer" href="https://myanimelist.net/anime/' + a.mal + '">MyAnimeList ↗</a>' : "") +
          (a.zoro ? '<a class="link" target="_blank" rel="noopener noreferrer" href="' + esc(AN().zoroUrl(a.zoro)) + '">Zoro TV ↗</a>' : "");
      }

      function render() {
        const a = d.anime;
        el.innerHTML = '<article class="film show anime-page">' + header() +
          '<div class="container film-body">' +
            '<div class="film-main">' +
              (a.desc ? '<section><h2 class="label">About</h2><p class="lede">' + esc(a.desc).replace(/\n+/g, "<br><br>") + "</p></section>" : "") +
              '<section class="show-cast">' + charactersHtml() + "</section>" +
              '<div data-episodes>' + episodesHtml() + "</div>" +
            "</div>" +
            '<aside class="film-record panel" aria-label="Your record"><h2 class="h3">Your rating</h2>' + FL.ui.ratingWidget(a) +
              '<p class="ext-links">' + linksHtml(a) + "</p>" +
            "</aside>" +
          "</div>" +
          '<div class="container"><div data-collection>' + relationsHtml() + "</div>" + rail("More like this", d.recs) + "</div>" +
          "</article>";
        const bg = a.banner;
        FL.ambient.art(bg || a.cover);
        if (bg) {
          const box = $(".film-backdrop", el);
          const img = new Image();
          img.alt = "";
          img.referrerPolicy = "no-referrer";
          img.onload = () => box.classList.add("is-in");
          img.src = bg;
          box.appendChild(img);
        }
        const onSeg = el.querySelector(".season-nav .is-on");
        if (onSeg) onSeg.scrollIntoView({ inline: "center", block: "nearest" });
      }

      function refresh() {
        const y = window.scrollY;
        const hero = el.querySelector(".film-hero");
        if (hero) { const tmp = document.createElement("div"); tmp.innerHTML = header(); hero.replaceWith(tmp.querySelector(".film-hero")); }
        const eps = $("[data-episodes]", el);
        if (eps) eps.innerHTML = episodesHtml();
        window.scrollTo(0, y);
      }

      function load() {
        AN().load(id).then((data) => {
          if (!alive) return;
          // A Zoro TV link that turned out to be on AniList: move to its AniList page (Back skips the hop).
          if (data.anime.id !== id) { location.replace(hrefOf(data.anime)); return; }
          d = data;
          const a = d.anime;
          document.title = a.title + " · Sakura";
          zoroEps = d.zoroEpisodes || [];
          list = AN().episodes(a, d.stills, zoroEps);
          a._eps = list; // the player's Up Next shows names and stills from it
          render();
          // Long runs AniList doesn't count (One Piece) and Zoro-only titles: Zoro TV knows how many are out.
          const needZoro = a.status === "RELEASING" && !a.next;
          if (needZoro || !list.length) {
            AN().zoroSlug(a).then((slug) => AN().zoroSeries(slug)).then((info) => {
              if (!alive || !info || !info.episodes || !info.episodes.length) return;
              zoroEps = info.episodes;
              list = AN().episodes(a, d.stills, zoroEps);
              a._eps = list;
              refresh();
            });
          }
          // Ahead of Play (the player's Zoro server), and for the Zoro TV link.
          AN().zoroSlug(a).then(() => { const box = alive && $(".ext-links", el); if (box) box.innerHTML = linksHtml(a); });
          const up = nextUp(a, list);
          if (up) FL.util.idle(() => FL.player.prefetch(a, { s: 1, e: up.e }));
          // The whole franchise in release order (seasons, films, specials), in place of the direct links.
          if (a.anilist) AN().collection(a.id).then((c) => {
            const box = alive && $("[data-collection]", el);
            if (!box || c.items.length < 2) return;
            box.innerHTML = rail(esc(c.name) + " collection", c.items.slice(0, 30), {
              more: collHref(a.id, a.id),
              caption: (x) => (x.id === a.id ? "This one" : esc([AN().formatLabel(x), x.year || "Coming"].join(" · "))),
            });
          }).catch(() => {});
        }).catch(() => {
          if (!alive) return;
          el.innerHTML = '<div class="container page">' + FL.ui.empty("This title couldn’t be loaded.", "Check your connection and try again.", '<button type="button" class="btn" data-aa="retry">Try again</button>') + "</div>";
        });
      }

      function onClick(e) {
        const b = e.target.closest("[data-aa], [data-seg=range]");
        if (!b) return;
        if (b.dataset.seg === "range") { range = +b.dataset.value; const eps = $("[data-episodes]", el); if (eps) eps.innerHTML = episodesHtml(); return; }
        const act = b.dataset.aa;
        if (act === "retry") { load(); return; }
        if (!d) return;
        const a = d.anime;
        AN().remember(a);
        if (act === "list") FL.store.toggleList(a);
        else if (act === "fav") FL.store.toggleFav(a);
        else if (act === "trailer") FL.player.trailer(a, a.trailer);
        else if (act === "ep") FL.store.toggleEpisode(a, 1, +b.closest("[data-ep]").dataset.ep);
        else if (act === "range") {
          const aired = list.slice(range * PER, range * PER + PER).filter((v) => v.aired);
          const all = aired.every((v) => FL.store.episodeWatched(a.id, 1, v.e));
          FL.store.setEpisodes(a, aired.map((v) => [1, v.e]), !all);
        }
      }

      el.addEventListener("click", onClick);
      load();
      return {
        update(detail) {
          if (!d || (detail.id && detail.id !== d.anime.id) || detail.kind === "progress") return;
          refresh();
        },
        destroy() { alive = false; el.removeEventListener("click", onClick); },
      };
    },
  };

  /* ---------- collections ---------- */

  const KIND = (f) => (f === "MOVIE" ? "films" : f === "OVA" || f === "SPECIAL" ? "extras" : "series");
  const collHref = (id, from) => "#/anime/collection/" + encodeURIComponent(id) + (from ? "?from=" + encodeURIComponent(from) : "");

  /* A franchise as a card: its first series' artwork and the franchise's name; opens the collection. */
  function collCard(x) {
    const a = x.anime;
    return '<article class="card acard" data-aid="' + esc(a.id) + '"><a class="card-link" href="' + collHref(a.id) + '" aria-label="' + esc(x.name) + '">' + art(a) + "</a>" +
      '<div class="card-body"><a class="card-title" href="' + collHref(a.id) + '" tabindex="-1">' + esc(x.name) + "</a>" +
      '<div class="card-meta"><span>' + esc(String(a.year || "")) + "</span></div></div></article>";
  }

  FL.views.animeCollection = {
    title: "Collection",
    mount(el, params, query) {
      const id = decodeURIComponent(params[0]);
      const kind = (query && query.get("kind")) || "";
      const from = (query && query.get("from")) || id;
      let alive = true;
      let data = null;
      el.innerHTML = '<div class="container page"><div class="page-loading">' + FL.ui.loader(40, "Loading") + "</div></div>";

      function row(a, i) {
        const st = FL.store.state(a.id);
        const total = a.episodes || 0;
        const you = st.episodes ? (total && st.episodes >= total ? '<span class="muted">' + icon("check") + "</span>" : '<span class="muted">' + st.episodes + (total ? "/" + total : "") + "</span>") : "";
        const meta = [AN().formatLabel(a), a.year || "Coming", total > 1 ? total + " eps" : ""].filter(Boolean).map(esc).join(" · ");
        return '<article class="row' + (a.id === from ? " is-here" : "") + '" data-aid="' + esc(a.id) + '">' +
          '<span class="row-rank">' + String(i + 1).padStart(2, "0") + "</span>" +
          '<a class="row-art" href="' + hrefOf(a) + '" tabindex="-1" aria-hidden="true">' + art(a) + "</a>" +
          '<div class="row-main"><a class="row-title" href="' + hrefOf(a) + '">' + esc(a.title) + '</a><div class="row-meta">' + meta + "</div></div>" +
          '<div class="row-score">' + (a.score ? '<span class="imdb" title="AniList score">★ ' + (a.score / 10).toFixed(1) + "</span>" : "") + "</div>" +
          '<div class="row-you">' + you + "</div>" +
          '<div class="row-actions"><button type="button" class="qa' + (st.listed ? " on" : "") + '" data-aqa="list" aria-pressed="' + st.listed + '" aria-label="Plan to watch" title="Plan to watch">' + icon("bookmark") + "</button>" +
            (a.status !== "NOT_YET_RELEASED" ? '<a class="qa" href="' + watchHref(a, 1) + '" aria-label="Play" title="Play">' + icon("play") + "</a>" : "") + "</div></article>";
      }

      const segHref = (k) => {
        const q = new URLSearchParams();
        if (from !== id) q.set("from", from);
        if (k) q.set("kind", k);
        return "#/anime/collection/" + encodeURIComponent(id) + (q.toString() ? "?" + q : "");
      };

      function render() {
        const all = data.items;
        const count = (k) => all.filter((a) => KIND(a.format) === k).length;
        const kinds = [["", "All", all.length], ["series", "Series", count("series")], ["films", "Films", count("films")], ["extras", "Extras", count("extras")]].filter((k) => k[2]);
        const shown = all.map((a, i) => [a, i]).filter(([a]) => !kind || KIND(a.format) === kind);
        el.innerHTML = '<div class="container page">' +
          '<header class="page-head"><div><h1 class="h1">' + esc(data.name) + '</h1><p class="sub">' + plural(all.length, "title") + "</p></div></header>" +
          (kinds.length > 2 ? '<div class="sakura-controls"><div class="seg" role="radiogroup" aria-label="Show">' + kinds.map(([k, l, n]) =>
            '<a role="radio" class="seg-btn' + (k === kind ? " is-on" : "") + '" aria-checked="' + (k === kind) + '" href="' + segHref(k) + '">' + l + ' <small class="muted">' + n + "</small></a>").join("") + "</div></div>" : "") +
          '<div class="rows ranked">' + shown.map(([a, i]) => row(a, i)).join("") + "</div></div>";
        const banner = all.find((a) => a.banner);
        FL.ambient.art(banner ? banner.banner : (all[0] && all[0].cover) || "");
        const here = $(".row.is-here", el);
        if (here && !kind) here.scrollIntoView({ block: "center" });
      }

      function load() {
        AN().collection(id).then((c) => {
          if (!alive) return;
          data = c;
          document.title = c.name + " · Sakura";
          render();
        }).catch(() => {
          if (!alive) return;
          el.innerHTML = '<div class="container page">' + FL.ui.empty("This collection couldn’t be loaded.", "Check your connection and try again.", '<button type="button" class="btn" data-ac="retry">Try again</button>') + "</div>";
        });
      }
      const onClick = (e) => { if (e.target.closest('[data-ac="retry"]')) load(); };
      el.addEventListener("click", onClick);
      load();
      return {
        update(d) { if (data && d.kind !== "progress") { const y = window.scrollY; render(); window.scrollTo(0, y); } },
        destroy() { alive = false; el.removeEventListener("click", onClick); },
      };
    },
  };

  FL.views.animeCollections = {
    title: "Collections",
    mount(el) {
      let alive = true;
      el.innerHTML = '<div class="container page"><header class="page-head"><div><h1 class="h1">Collections</h1></div></header>' +
        '<section class="rail" data-rail-id="mine"></section><div data-results><div class="page-loading">' + FL.ui.loader(36, "Loading") + "</div></div></div>";
      // Yours: the franchises of the anime in your library (each worked out once, then kept).
      const mine = AN().entries().filter((e) => /^an\d+$/.test(e.id)).sort((x, y) => y.updated - x.updated).slice(0, 8);
      const seen = new Set();
      const yours = [];
      mine.reduce((p, e) => p.then(() => (alive ? AN().collection(e.id).then((c) => {
        if (seen.has(c.top) || c.items.length < 2) return;
        seen.add(c.top);
        const lead = c.items.find((a) => a.format === "TV") || c.items[0];
        yours.push({ anime: lead, name: c.name });
        const box = $('[data-rail-id="mine"]', el);
        if (box) box.innerHTML = railHead("Yours", {}) + '<div class="rail-track">' + yours.map(collCard).join("") + "</div>";
      }).catch(() => {}) : null)), Promise.resolve());
      AN().popularCollections().then((list) => {
        if (!alive) return;
        $("[data-results]", el).innerHTML = '<h2 class="h2 coll-sub">Popular</h2><div class="grid">' + list.map(collCard).join("") + "</div>";
      }).catch(() => {
        if (alive) $("[data-results]", el).innerHTML = FL.ui.empty("AniList didn’t answer.", "Check your connection and try again.");
      });
      return { destroy() { alive = false; } };
    },
  };

  /* ---------- search ---------- */

  let searchOpen = null;
  function search(initial) {
    if (searchOpen) { $("input", searchOpen.el).focus(); return; }
    const m = FL.ui.modal(
      '<div class="palette">' +
        '<div class="palette-input">' + icon("search") +
          '<input type="text" placeholder="Anime, in English or Japanese…" aria-label="Search anime" autocomplete="off" spellcheck="false" autofocus role="combobox" aria-expanded="true" aria-controls="sakura-list">' +
          '<span class="palette-busy" hidden>' + FL.ui.loader(18) + "</span><kbd>esc</kbd></div>" +
        '<div class="palette-list" id="sakura-list" role="listbox"></div>' +
        '<footer class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>' + (FL.palette.isMac() ? "⌘" : "Ctrl") + "</kbd><kbd>↵</kbd> play</span></footer>" +
      "</div>",
      { cls: "modal-palette", label: "Search anime", noClose: true, onClose: () => { searchOpen = null; } }
    );
    searchOpen = m;
    const input = $("input", m.el);
    const list = $(".palette-list", m.el);
    const busy = $(".palette-busy", m.el);
    let items = [];
    let active = 0;
    let timer = 0;
    const found = new Map();
    let rows = [];
    AN().zoroList().then((r) => { rows = r; if (input.value.trim()) update(); });

    const GO = [
      { label: "Sakura home", icon: "home", href: "#/anime" }, { label: "Seasons", icon: "calendar", href: "#/anime/seasons" },
      { label: "Explore", icon: "compass", href: "#/anime/explore" }, { label: "A–Z", icon: "list", href: "#/anime/az/a" },
      { label: "Your anime", icon: "layers", href: "#/anime/library" }, { label: "Switch to Iris · films & web series", icon: "film", href: "#/" },
    ];
    const animeItem = (a, i) => '<div class="pal-item pal-film" role="option" id="sk-' + i + '" data-i="' + i + '">' +
      '<span class="pal-art">' + art(a) + '</span><span class="pal-main"><strong>' + esc(a.title) + "</strong><small>" + metaOf(a) +
      (a.score ? " · ★ " + (a.score / 10).toFixed(1) : "") + "</small></span></div>";
    const cmdItem = (c, i) => '<div class="pal-item" role="option" id="sk-' + i + '" data-i="' + i + '"><span class="pal-icon">' + icon(c.icon) + '</span><span class="pal-main"><strong>' + esc(c.label) + "</strong></span></div>";

    function update() {
      const q = input.value.trim();
      items = [];
      let html = "";
      if (!q) {
        html += '<div class="pal-group">Go to</div>';
        GO.forEach((c) => { html += cmdItem(c, items.length); items.push({ go: c.href }); });
      } else {
        const hits = found.get(q) || [];
        if (hits.length) {
          html += '<div class="pal-group">Anime</div>';
          hits.slice(0, 10).forEach((a) => { html += animeItem(a, items.length); items.push({ anime: a }); });
        }
        const nq = AN().norm(q);
        const shown = new Set(hits.map((a) => AN().norm(a.title)));
        const z = rows.filter((r) => r.key.indexOf(nq) !== -1 && !shown.has(r.key)).slice(0, 6);
        if (z.length) {
          html += '<div class="pal-group">On Zoro TV</div>';
          z.forEach((r) => { const a = AN().zoroItem(r); html += animeItem(a, items.length); items.push({ anime: a }); });
        }
        if (!items.length) html = '<div class="pal-empty">' + (busy.hidden ? "Nothing matches “" + esc(q) + "”." : "Looking…") + "</div>";
      }
      list.innerHTML = html;
      active = Math.min(active, Math.max(0, items.length - 1));
      highlight();
    }
    function highlight() {
      $$(".pal-item", list).forEach((x) => x.classList.toggle("is-active", +x.dataset.i === active));
      const x = $('.pal-item[data-i="' + active + '"]', list);
      if (x) { x.scrollIntoView({ block: "nearest" }); input.setAttribute("aria-activedescendant", x.id); }
    }
    function fetchResults() {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2 || found.has(q)) { busy.hidden = true; return; }
      timer = setTimeout(() => {
        busy.hidden = false;
        AN().search(q).then((list2) => { found.set(q, list2); }).catch(() => found.set(q, [])).then(() => {
          if (!searchOpen || input.value.trim() !== q) return;
          busy.hidden = true;
          update();
        });
      }, 320);
    }
    function choose(i, play) {
      const it = items[i];
      if (!it) return;
      m.close();
      if (it.go) { location.hash = it.go; return; }
      const a = it.anime;
      location.hash = play && a.anilist ? watchHref(a, 1) : hrefOf(a);
    }
    input.addEventListener("input", () => { active = 0; update(); fetchResults(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(items.length - 1, active + 1); highlight(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); highlight(); }
      else if (e.key === "Enter") { e.preventDefault(); choose(active, e.metaKey || e.ctrlKey); }
    });
    list.addEventListener("mousemove", (e) => { const x = e.target.closest(".pal-item"); if (x && +x.dataset.i !== active) { active = +x.dataset.i; highlight(); } });
    list.addEventListener("click", (e) => { const x = e.target.closest(".pal-item"); if (x) choose(+x.dataset.i, e.metaKey || e.ctrlKey); });
    if (initial) input.value = initial;
    update();
    if (initial) fetchResults();
  }

  /* ---------- Spin: Sakura picks for you ---------- */

  function spin() {
    const plan = AN().entries().filter((e) => e.listed && !Object.keys(e.episodes || {}).length).map(fromEntry);
    const pickFrom = (pool, why) => {
      if (!pool.length) return false;
      const a = pool[Math.floor(Math.random() * pool.length)];
      FL.ui.toast("Sakura picked " + a.title + " · " + why);
      location.hash = hrefOf(a);
      return true;
    };
    if (pickFrom(plan, "from your Plan to watch")) return;
    const h = AN().home();
    (h.cached ? Promise.resolve(h.cached) : h.fresh).then((d) => {
      pickFrom(d.top.concat(d.popular).filter((a) => !FL.store.state(a.id).episodes), "a fan favourite you haven’t started");
    }).catch(() => FL.ui.toast("Couldn’t reach AniList for a pick."));
  }

  /* ---------- switching apps ---------- */

  /* The two apps as tiles, at the top of Settings (the logo switches too). */
  function appTiles() {
    const cur = FL.theme.app();
    const tile = (app, name, what, href) => '<a class="app-tile' + (cur === app ? " is-on" : "") + '" href="' + href + '" data-app-go="' + app + '"' + (cur === app ? ' aria-current="true"' : "") + ">" +
      '<span class="app-icon" style="--accent:' + FL.theme.accent(app) + '">' + FL.theme.mark({ kind: app, size: 56 }) + "</span>" +
      '<span class="app-text"><strong>' + name + "</strong><small>" + what + "</small></span>" + (cur === app ? '<span class="app-check">' + icon("check") + "</span>" : "") + "</a>";
    return '<div class="apps-grid">' +
      tile("iris", "Iris", "Movies &amp; web series", FL.app.lastHash("iris") || "#/") +
      tile("sakura", "Sakura", "Anime", FL.app.lastHash("sakura") || "#/anime") + "</div>";
  }

  FL.sakura = { search, spin, appTiles, card, rail };
})(window.FL = window.FL || {});
