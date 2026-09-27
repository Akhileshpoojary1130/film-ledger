/* Iris — shell: chrome, hash router, page transitions, global shortcuts. Loaded last. */
(function (FL) {
  "use strict";

  const { $, $$, isTyping } = FL.util;

  const ROUTES = [
    [/^\/?$/, "home"],
    [/^\/years(?:\/(\d{4}))?$/, "years"],
    [/^\/browse$/, "browse"],
    [/^\/shows$/, "shows"],
    [/^\/show\/(.+)$/, "show"],
    [/^\/film\/(.+)$/, "film"],
    [/^\/watch\/(.+)$/, "watch"],
    [/^\/library(?:\/(\w+))?$/, "library"],
    [/^\/diary(?:\/(\d{4}))?$/, "diary"],
    [/^\/stats(?:\/(\w+))?$/, "stats"],
    [/^\/collections$/, "collections"],
    [/^\/collection\/([\w-]+)$/, "collection"],
    [/^\/person\/(.+)$/, "person"],
    [/^\/move(?:\/(.+))?$/, "move"],
    [/^\/sync\/([A-Za-z0-9_-]{43})$/, "sync"],
    [/^\/match(?:\/(.+))?$/, "match"],
    // Sakura, the anime app.
    [/^\/anime\/?$/, "animeHome"],
    [/^\/anime\/seasons(?:\/(\d{4})\/(winter|spring|summer|fall))?$/, "animeSeasons"],
    [/^\/anime\/explore$/, "animeExplore"],
    [/^\/anime\/az(?:\/([a-z0]))?$/, "animeAz"],
    [/^\/anime\/library(?:\/(\w+))?$/, "animeLibrary"],
    [/^\/anime\/watch\/(.+)$/, "animeWatch"],
    [/^\/anime\/((?:an\d+|zr-[a-z0-9-]+))$/, "animeTitle"],
  ];

  const NAV_FOR = { home: "home", years: "years", browse: "browse", shows: "shows", show: "shows", film: "", library: "library", collection: "collections", collections: "collections", diary: "library", stats: "stats", person: "", move: "", match: "library",
    animeHome: "a-home", animeSeasons: "a-seasons", animeExplore: "a-explore", animeAz: "a-az", animeLibrary: "a-library", animeTitle: "" };
  const appOf = (name) => (/^anime/.test(name) ? "sakura" : "iris");
  const LAST_KEY = "film_ledger_app_last"; // the page you were on in each app, for this visit
  const APP_KEY = "film_ledger_app"; // the app last used on this device
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  let viewEl = null;
  let current = { name: "", handle: {}, hash: "" };
  let depth = 0;
  let lastArt = null;

  /* ---------- chrome ---------- */

  /* The logo is also the switch between the two apps: Iris (films & web series) and Sakura (anime). */
  function brand() {
    const name = FL.theme.app() === "sakura" ? "Sakura" : "Iris";
    return '<button type="button" class="brand brand-switch" data-open="apps" aria-haspopup="dialog" aria-label="' + name + ': switch app" title="Switch app · Iris or Sakura">' +
      FL.theme.mark({ size: 26, blink: true, cls: "brand-mark" }) + '<span class="brand-word">' + name + "</span>" + FL.ui.icon("chevron-down", "brand-chev") + "</button>";
  }

  function chromeHtml() {
    const mod = FL.palette.isMac() ? "⌘K" : "Ctrl K";
    const { icon } = FL.ui;
    if (FL.theme.app() === "sakura") return sakuraChrome(mod, icon);
    return {
      top: '<header class="topbar"><div class="container topbar-inner">' + brand() +
        '<nav class="nav" aria-label="Primary">' +
          '<a href="#/" data-nav="home">Home</a><a href="#/years" data-nav="years">Years</a><a href="#/browse" data-nav="browse">Browse</a>' +
          '<a href="#/shows" data-nav="shows">Shows</a><a href="#/collections" data-nav="collections">Collections</a><a href="#/library/watchlist" data-nav="library">Library</a><a href="#/stats" data-nav="stats">Stats</a>' +
        "</nav>" +
        '<div class="topbar-actions">' +
          '<button type="button" class="search-trigger" data-open="palette" aria-label="Search (' + mod + ')">' + icon("search") + "<span>Search</span><kbd>" + mod + "</kbd></button>" +
          // Phones: the tab bar has no room for Collections, so it gets a button up here (hidden on wider screens).
          '<a class="icon-btn topbar-coll" href="#/collections" data-nav="collections" aria-label="Collections" title="Collections">' + icon("collections") + "</a>" +
          '<button type="button" class="icon-btn" data-open="pick" aria-label="Reel Spin: let Iris pick" title="Reel Spin (R)">' + icon("shuffle") + "</button>" +
          '<button type="button" class="icon-btn" data-open="settings" aria-label="Settings" title="Settings, theme & storage">' + icon("sliders") + "</button>" +
          // Phones can have search as a round button just under Settings instead (Settings → Appearance → Search button).
          '<button type="button" class="search-float" data-open="palette" aria-label="Search" title="Search">' + icon("search") + "</button>" +
        "</div></div></header>",
      bottom: '<footer class="site-foot"><div class="container">' +
          '<a class="foot-sign" href="#/">' + FL.theme.mark({ size: 18, cls: "foot-mark" }) + '<span class="brand-word">Iris</span></a>' +
        "</div></footer>" +
        '<nav class="tabbar" aria-label="Primary">' +
          '<a href="#/" data-nav="home">' + icon("home") + "<span>Home</span></a>" +
          '<a href="#/years" data-nav="years">' + icon("years") + "<span>Years</span></a>" +
          // Search lives in the top bar on every page, so the tab bar's big middle button is Browse.
          '<a href="#/browse" class="tab-browse" data-nav="browse" aria-label="Browse" title="Browse">' + icon("compass") + "</a>" +
          '<a href="#/shows" data-nav="shows">' + icon("tv") + "<span>Shows</span></a>" +
          '<a href="#/library/watchlist" data-nav="library">' + icon("layers") + "<span>Library</span></a>" +
        "</nav>",
    };
  }

  function sakuraChrome(mod, icon) {
    return {
      top: '<header class="topbar"><div class="container topbar-inner">' + brand() +
        '<nav class="nav" aria-label="Primary">' +
          '<a href="#/anime" data-nav="a-home">Home</a><a href="#/anime/seasons" data-nav="a-seasons">Seasons</a><a href="#/anime/explore" data-nav="a-explore">Explore</a>' +
          '<a href="#/anime/az/a" data-nav="a-az">A–Z</a><a href="#/anime/library" data-nav="a-library">Library</a>' +
        "</nav>" +
        '<div class="topbar-actions">' +
          '<button type="button" class="search-trigger" data-open="palette" aria-label="Search anime (' + mod + ')">' + icon("search") + "<span>Search</span><kbd>" + mod + "</kbd></button>" +
          '<button type="button" class="icon-btn" data-open="pick" aria-label="Spin: let Sakura pick" title="Spin (R)">' + icon("shuffle") + "</button>" +
          '<button type="button" class="icon-btn" data-open="settings" aria-label="Settings" title="Settings, theme & storage">' + icon("sliders") + "</button>" +
          '<button type="button" class="search-float" data-open="palette" aria-label="Search" title="Search">' + icon("search") + "</button>" +
        "</div></div></header>",
      bottom: '<footer class="site-foot"><div class="container">' +
          '<a class="foot-sign" href="#/anime">' + FL.theme.mark({ size: 18, cls: "foot-mark" }) + '<span class="brand-word">Sakura</span></a>' +
        "</div></footer>" +
        '<nav class="tabbar" aria-label="Primary">' +
          '<a href="#/anime" data-nav="a-home">' + icon("home") + "<span>Home</span></a>" +
          '<a href="#/anime/seasons" data-nav="a-seasons">' + icon("calendar") + "<span>Seasons</span></a>" +
          '<a href="#/anime/explore" class="tab-browse" data-nav="a-explore" aria-label="Explore" title="Explore">' + icon("compass") + "</a>" +
          '<a href="#/anime/az/a" data-nav="a-az">' + icon("list") + "<span>A–Z</span></a>" +
          '<a href="#/anime/library" data-nav="a-library">' + icon("layers") + "<span>Library</span></a>" +
        "</nav>",
    };
  }

  function paintChrome() {
    $$(".topbar, .site-foot, .tabbar").forEach((el) => el.remove());
    const html = chromeHtml();
    document.body.insertAdjacentHTML("afterbegin", html.top);
    document.body.insertAdjacentHTML("beforeend", html.bottom);
    setNav(current.name);
  }

  function chrome() {
    document.body.insertAdjacentHTML("afterbegin", '<button type="button" class="skip" data-skip>Skip to content</button>');
    viewEl = document.getElementById("view");
    paintChrome();

    document.addEventListener("click", (e) => {
      const link = e.target.closest(".card-link, .tonight-art");
      if (link) lastArt = link.querySelector(".art");
      const b = e.target.closest("[data-open]");
      if (b) {
        const what = b.dataset.open;
        if (what === "palette") FL.palette.open();
        else if (what === "apps") FL.sakura.switcher();
        else if (what === "pick") (FL.theme.app() === "sakura" ? FL.sakura.spin() : FL.palette.pick());
        else if (what === "settings") FL.palette.settings();
        else if (what === "shortcuts") FL.palette.shortcuts();
        return;
      }
      if (e.target.closest("[data-skip]")) viewEl.focus();
    }, true);

    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const bar = $(".topbar");
        if (bar) bar.classList.toggle("is-scrolled", window.scrollY > 8);
        ticking = false;
      });
    }, { passive: true });
  }

  function setNav(name) {
    const key = NAV_FOR[name];
    document.documentElement.classList.toggle("is-home", name === "home");
    $$("[data-nav]").forEach((a) => {
      const on = a.dataset.nav === key || (!!key && a.dataset.navAlso === key); // the tab bar's Library also covers Collections
      a.classList.toggle("is-on", !!on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    glide();
  }

  /* Each bar's one highlight moves to the current tab (a CSS transition does the gliding); it fades out on pages
     that aren't a tab, and lands without animating the first time. */
  function glide() {
    $$(".nav, .tabbar").forEach((bar) => {
      let pill = bar.querySelector(":scope > .nav-pill");
      if (!pill) {
        pill = document.createElement("span");
        pill.className = "nav-pill";
        pill.setAttribute("aria-hidden", "true");
        bar.prepend(pill);
      }
      const on = bar.querySelector("a.is-on:not(.tab-browse)"); // Browse's button shows its own state
      if (!on || !on.offsetWidth) { pill.style.opacity = "0"; return; }
      const first = !pill.dataset.placed;
      if (first) pill.style.transition = "none";
      pill.style.opacity = "1";
      pill.style.width = on.offsetWidth + "px";
      pill.style.height = on.offsetHeight + "px";
      pill.style.transform = "translate(" + on.offsetLeft + "px," + on.offsetTop + "px)";
      if (first) {
        void pill.offsetWidth;
        pill.style.transition = "";
        pill.dataset.placed = "1";
      }
    });
  }
  window.addEventListener("resize", FL.util.debounce(glide, 150));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(glide);

  /* The aperture opens and the app appears through it — the classic iris-out. */
  function reveal() {
    const boot = document.getElementById("boot");
    if (!boot) return;
    const wait = Math.max(0, 450 - performance.now());
    setTimeout(() => {
      boot.classList.add("is-done");
      setTimeout(() => boot.remove(), 900);
    }, reduced.matches ? 0 : wait);
  }

  /* ---------- router ---------- */

  function parse() {
    const raw = location.hash.replace(/^#/, "") || "/";
    const i = raw.indexOf("?");
    return { path: i === -1 ? raw : raw.slice(0, i), query: new URLSearchParams(i === -1 ? "" : raw.slice(i + 1)) };
  }

  function match(path) {
    for (let i = 0; i < ROUTES.length; i++) {
      const m = ROUTES[i][0].exec(path);
      if (m) return { name: ROUTES[i][1], params: m.slice(1).filter((x) => x !== undefined) };
    }
    return { name: "notfound", params: [] };
  }

  const notFound = {
    mount(el) {
      el.innerHTML = '<div class="container page">' + FL.ui.empty("This page doesn’t exist.", "The link may be broken or out of date.", '<a class="btn" href="#/">Go home</a>') + "</div>";
      return {};
    },
  };

  /* Iris ⇄ Sakura: the app follows the page. Changing app changes the colour, the logo and the bars. */
  function setApp(app) {
    const root = document.documentElement;
    // This device's, not synced: each device opens the app last used on it.
    if (FL.util.storage.get(APP_KEY, "") !== app) FL.util.storage.set(APP_KEY, app);
    if (root.dataset.app === app) return;
    root.dataset.app = app;
    FL.theme.apply();
    paintChrome();
  }

  function doMount(name, params, query) {
    if (current.handle && current.handle.destroy) current.handle.destroy();
    const view = FL.views[name] || notFound;
    const app = appOf(name);
    setApp(app);
    const last = FL.util.session.get(LAST_KEY, {});
    last[app] = location.hash;
    FL.util.session.set(LAST_KEY, last);
    document.title = (view.title ? view.title + " · " : "") + (app === "sakura" ? "Sakura" : "Iris");
    window.scrollTo(0, 0);
    viewEl.innerHTML = "";
    current = { name, handle: {}, hash: location.hash };
    try {
      current.handle = view.mount(viewEl, params, query) || {};
    } catch (err) {
      // One broken page must never take the app down with it.
      console.error(err);
      current.handle = {};
      viewEl.innerHTML = '<div class="container page">' + FL.ui.empty("Something went wrong on this page.", FL.util.esc(String(err && err.message || err)),
        '<button type="button" class="btn" onclick="location.reload()">Reload</button> <a class="btn btn-ghost" href="#/">Go home</a>') + "</div>";
    }
    FL.ui.watchPosters(viewEl);
    setNav(name);
    watchPageSearch();
    blink();
  }

  /* Pages with their own big search (Home, Browse) keep the top bar's search hidden until theirs scrolls away;
     page changes then morph one search bar into the other (view-transition-name "search"). */
  let searchObs = null;
  function watchPageSearch() {
    const root = document.documentElement;
    if (searchObs) { searchObs.disconnect(); searchObs = null; }
    const own = viewEl.querySelector("[data-page-search]");
    root.classList.toggle("has-page-search", !!own);
    root.classList.remove("search-docked");
    if (!own || !("IntersectionObserver" in window)) return;
    const bar = document.querySelector(".topbar");
    searchObs = new IntersectionObserver(([en]) => root.classList.toggle("search-docked", !en.isIntersecting),
      { rootMargin: -((bar && bar.offsetHeight) || 64) + "px 0px 0px 0px" });
    searchObs.observe(own);
  }

  /* The logo's shutter closes and reopens as you move between pages. */
  function blink() {
    if (FL.theme.calm()) return;
    FL.theme.markBlink(document.querySelector(".brand-mark"));
  }

  /* Cross-fade between pages; the poster you clicked glides into the film page's poster. */
  function mount(name, params, query) {
    const canMorph = document.startViewTransition && !reduced.matches && !FL.theme.calm() && current.name && !document.hidden;
    if (!canMorph) {
      doMount(name, params, query);
      viewEl.classList.remove("enter");
      void viewEl.offsetWidth;
      viewEl.classList.add("enter");
      return;
    }
    const from = lastArt && document.contains(lastArt) && (name === "film" || name === "show" || name === "animeTitle") ? lastArt : null;
    lastArt = null;
    if (from) from.style.viewTransitionName = "poster";
    let to = null;
    const vt = document.startViewTransition(() => {
      if (from) from.style.viewTransitionName = "";
      doMount(name, params, query);
      to = viewEl.querySelector(".film-poster .art");
      if (from && to) to.style.viewTransitionName = "poster";
    });
    vt.finished.finally(() => { if (to) to.style.viewTransitionName = ""; });
  }

  function route() {
    const { path, query } = parse();
    const { name, params } = match(path);

    if (name === "watch") {
      const id = decodeURIComponent(params[0]);
      FL.ui.closeModals();
      const fromApp = depth > 1;
      const start = (film) => {
        if (!film) { location.replace("#/"); return; }
        if (!current.name) mount(film.type === "series" ? "show" : "film", [film.id], query); // deep link: a page to return to
        FL.player.open(film, {
          s: query.get("s"), e: query.get("e"),
          onClose() {
            if (!parse().path.startsWith("/watch/")) return;
            if (fromApp) history.back();
            else location.replace("#/" + (film.type === "series" ? "show" : "film") + "/" + encodeURIComponent(film.id));
          },
        });
      };
      const film = FL.catalogue.get(id);
      if (film) start(film);
      else FL.remote.byId(id, query.get("s") ? "series" : "movie").then(start);
      return;
    }

    if (name === "animeWatch") {
      const id = decodeURIComponent(params[0]);
      FL.ui.closeModals();
      const fromApp = depth > 1;
      const start = (a) => {
        if (!a) { location.replace("#/anime"); return; }
        if (!current.name) mount("animeTitle", [a.id], query); // deep link: a page to return to
        FL.player.open(a, {
          s: 1, e: query.get("e"),
          onClose() {
            if (!parse().path.startsWith("/anime/watch/")) return;
            if (fromApp) history.back();
            else location.replace("#/anime/" + encodeURIComponent(a.id));
          },
        });
      };
      const known = FL.anime.get(id);
      if (known) start(known);
      else FL.anime.load(id).then((d) => start(d.anime), () => start(null));
      return;
    }

    if (FL.player && FL.player.isOpen()) FL.player.close();
    FL.ui.closeModals();
    // Back from the player lands on the page that was already mounted underneath: keep it as is.
    if (current.name && location.hash === current.hash) return;
    mount(name, params, query);
  }

  /* ---------- library changes → views ---------- */

  let pending = null;
  FL.store.on((detail) => {
    if (detail.id) FL.ui.refreshFilm(detail.id);
    if (!pending) {
      pending = detail;
      requestAnimationFrame(() => {
        const d = pending;
        pending = null;
        if (current.handle && current.handle.update) current.handle.update(d);
        FL.ui.watchPosters(viewEl);
      });
    } else if (pending.id !== detail.id) {
      pending = { id: null, kind: detail.kind === "progress" ? pending.kind : detail.kind };
    } else if (detail.kind !== "progress") {
      pending = detail;
    }
  });

  /* ---------- keyboard ---------- */

  let gPending = 0;
  const GO = { h: "#/", y: "#/years", b: "#/browse", t: "#/shows", w: "#/library/watchlist", l: "#/library/watched", d: "#/diary", s: "#/stats" };
  const GO_SAKURA = { h: "#/anime", s: "#/anime/seasons", e: "#/anime/explore", a: "#/anime/az/a", l: "#/anime/library" };

  function gridNav(e) {
    const link = e.target.closest(".card-link, .row-title");
    if (!link) return false;
    const box = link.closest(".grid, .rail-track, .rows, .collections");
    if (!box) return false;
    const links = $$(".card-link, .row-title", box);
    const i = links.indexOf(link);
    let j = -1;
    if (e.key === "ArrowRight") j = i + 1;
    else if (e.key === "ArrowLeft") j = i - 1;
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (box.classList.contains("rail-track")) return false;
      let cols = 1;
      if (box.classList.contains("grid")) {
        const top = links[0].getBoundingClientRect().top;
        cols = links.filter((l) => Math.abs(l.getBoundingClientRect().top - top) < 4).length || 1;
      }
      j = e.key === "ArrowDown" ? i + cols : i - cols;
    } else return false;
    if (j < 0 || j >= links.length) return true;
    links[j].focus({ preventScroll: true });
    links[j].scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    return true;
  }

  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      if (!(FL.player && FL.player.isOpen()) && FL.palette) FL.palette.open();
      return;
    }
    if ((FL.player && FL.player.isOpen()) || FL.ui.isModalOpen() || isTyping(e) || mod || e.altKey) return;
    const k = e.key;

    if (gPending) {
      clearTimeout(gPending);
      gPending = 0;
      const dest = (FL.theme.app() === "sakura" ? GO_SAKURA : GO)[k.toLowerCase()];
      if (dest) { e.preventDefault(); location.hash = dest; }
      return;
    }
    if (/^Arrow/.test(k) && gridNav(e)) { e.preventDefault(); return; }
    if (k === "/") {
      e.preventDefault();
      if (current.handle.focusSearch) current.handle.focusSearch();
      else FL.palette.open();
    } else if (k === "g" || k === "G") {
      gPending = setTimeout(() => { gPending = 0; }, 1200);
    } else if (k === "?") {
      FL.palette.shortcuts();
    } else if (k === "r" || k === "R") {
      if (FL.theme.app() === "sakura") FL.sakura.spin(); else FL.palette.pick();
    } else if (current.handle.key && current.handle.key(k.toLowerCase())) {
      e.preventDefault();
    }
  });

  /* ---------- boot ---------- */

  FL.app = {
    watchSearch: () => watchPageSearch(),
    /* Where you were in an app this visit (the app switcher returns you there). */
    lastHash: (app) => FL.util.session.get(LAST_KEY, {})[app] || "",
    refresh() {
      const { path, query } = parse();
      const { name, params } = match(path);
      if (name !== "watch") { const y = window.scrollY; doMount(name, params, query); window.scrollTo(0, y); }
    },
    /* Theme / icon changes: redraw the chrome and the current page. */
    rebuild() {
      paintChrome();
      FL.app.refresh();
    },
  };

  window.addEventListener("hashchange", () => { depth++; route(); });
  depth = 1;
  // Opening Iris without a page goes back to the app you used last.
  if (!location.hash && FL.util.storage.get(APP_KEY, "iris") === "sakura") history.replaceState(null, "", "#/anime");
  document.documentElement.dataset.app = appOf(match(parse().path).name);
  FL.theme.apply();
  try {
    chrome();
    route();
  } catch (err) {
    console.error(err);
    (viewEl || document.getElementById("view")).innerHTML = '<div class="container page">' + FL.ui.empty("Iris hit a problem while starting.", FL.util.esc(String(err && err.message || err)),
      '<button type="button" class="btn" onclick="location.reload()">Reload</button>') + "</div>";
  }
  FL.started = true;
  reveal();

  // Fill in runtimes/directors for watched films in the background so hours are right everywhere.
  setTimeout(() => FL.util.idle(() => {
    FL.stats.backfill(40, (left) => { if (!left && current.name === "home" && current.handle.update) current.handle.update({ id: null, kind: "details" }); });
  }), 2500);
})(window.FL = window.FL || {});
