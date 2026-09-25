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
    [/^\/collection\/([\w-]+)$/, "collection"],
  ];

  const NAV_FOR = { home: "home", years: "years", browse: "browse", shows: "shows", show: "shows", film: "", library: "library", collection: "library", diary: "library", stats: "stats" };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  let viewEl = null;
  let current = { name: "", handle: {}, hash: "" };
  let depth = 0;
  let lastArt = null;

  /* ---------- chrome ---------- */

  function brand() {
    return '<a class="brand" href="#/" aria-label="Iris — home">' + FL.theme.mark({ size: 26, cls: "brand-mark" }) + '<span class="brand-word">Iris</span></a>';
  }

  function chromeHtml() {
    const mod = FL.palette.isMac() ? "⌘K" : "Ctrl K";
    const { icon } = FL.ui;
    return {
      top: '<header class="topbar"><div class="container topbar-inner">' + brand() +
        '<nav class="nav" aria-label="Primary">' +
          '<a href="#/" data-nav="home">Home</a><a href="#/years" data-nav="years">Years</a><a href="#/browse" data-nav="browse">Browse</a>' +
          '<a href="#/shows" data-nav="shows">Shows</a><a href="#/library/watchlist" data-nav="library">Library</a><a href="#/stats" data-nav="stats">Stats</a>' +
        "</nav>" +
        '<div class="topbar-actions">' +
          '<button type="button" class="search-trigger" data-open="palette" aria-label="Search (' + mod + ')">' + icon("search") + "<span>Search</span><kbd>" + mod + "</kbd></button>" +
          '<button type="button" class="icon-btn" data-open="pick" aria-label="Surprise me" title="Surprise me (R)">' + icon("shuffle") + "</button>" +
          '<button type="button" class="icon-btn" data-open="settings" aria-label="Settings" title="Settings, theme & storage">' + icon("sliders") + "</button>" +
        "</div></div></header>",
      bottom: '<footer class="site-foot"><div class="container">' +
          "<span>Iris · " + FL.catalogue.films.filter((f) => !f.remote).length.toLocaleString() + " films bundled, more from the web · " + FL.catalogue.yearRange[0] + "–today</span>" +
          "<span>Your library stays on this device. Artwork: Metahub, IMDb & Wikipedia · Details: Cinemeta.</span>" +
          '<button type="button" class="link" data-open="shortcuts">Keyboard shortcuts</button>' +
        "</div></footer>" +
        '<nav class="tabbar" aria-label="Primary">' +
          '<a href="#/" data-nav="home">' + icon("home") + "<span>Home</span></a>" +
          '<a href="#/years" data-nav="years">' + icon("years") + "<span>Years</span></a>" +
          '<button type="button" class="tab-search" data-open="palette" aria-label="Search">' + icon("search") + "</button>" +
          '<a href="#/shows" data-nav="shows">' + icon("tv") + "<span>Shows</span></a>" +
          '<a href="#/library/watchlist" data-nav="library">' + icon("layers") + "<span>Library</span></a>" +
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
        else if (what === "pick") FL.palette.pick();
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
    $$("[data-nav]").forEach((a) => {
      const on = a.dataset.nav === key;
      a.classList.toggle("is-on", !!on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

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

  function doMount(name, params, query) {
    if (current.handle && current.handle.destroy) current.handle.destroy();
    const view = FL.views[name] || notFound;
    document.title = (view.title ? view.title + " · " : "") + "Iris";
    window.scrollTo(0, 0);
    viewEl.innerHTML = "";
    current = { name, handle: {}, hash: location.hash };
    current.handle = view.mount(viewEl, params, query) || {};
    FL.ui.watchPosters(viewEl);
    setNav(name);
  }

  /* Cross-fade between pages; the poster you clicked glides into the film page's poster. */
  function mount(name, params, query) {
    const canMorph = document.startViewTransition && !reduced.matches && current.name && !document.hidden;
    if (!canMorph) {
      doMount(name, params, query);
      viewEl.classList.remove("enter");
      void viewEl.offsetWidth;
      viewEl.classList.add("enter");
      return;
    }
    const from = lastArt && document.contains(lastArt) && (name === "film" || name === "show") ? lastArt : null;
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

    if (FL.player.isOpen()) FL.player.close();
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
      if (!FL.player.isOpen()) FL.palette.open();
      return;
    }
    if (FL.player.isOpen() || FL.ui.isModalOpen() || isTyping(e) || mod || e.altKey) return;
    const k = e.key;

    if (gPending) {
      clearTimeout(gPending);
      gPending = 0;
      const dest = GO[k.toLowerCase()];
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
      FL.palette.pick();
    } else if (current.handle.key && current.handle.key(k.toLowerCase())) {
      e.preventDefault();
    }
  });

  /* ---------- boot ---------- */

  FL.app = {
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

  chrome();
  window.addEventListener("hashchange", () => { depth++; route(); });
  depth = 1;
  route();
  reveal();

  // Fill in runtimes/directors for watched films in the background so hours are right everywhere.
  setTimeout(() => FL.util.idle(() => {
    FL.stats.backfill(40, (left) => { if (!left && current.name === "home" && current.handle.update) current.handle.update({ id: null, kind: "details" }); });
  }), 2500);
})(window.FL = window.FL || {});
