/* Iris — Home: what to watch next, built from what you've watched and saved. */
(function (FL) {
  "use strict";

  const { esc, fmtDate, fmtClock, fmtHours, greeting, hash, todayISO } = FL.util;
  const { icon, rail, stars, art, card } = FL.ui;

  const filmsOf = (entries) => entries.map((e) => FL.catalogue.get(e.id)).filter(Boolean);

  function hero(name, hasLibrary) {
    const count = FL.catalogue.films.filter((f) => !f.remote).length;
    const mod = FL.palette.isMac() ? "⌘K" : "Ctrl K";
    return '<section class="home-hero">' +
      '<p class="eyebrow">' + esc(greeting() + (name ? ", " + name : "")) + "</p>" +
      '<h1 class="display">' + (hasLibrary ? "Your cinema, <em>at a glance.</em>" : "What are we <em>watching tonight?</em>") + "</h1>" +
      '<button type="button" class="hero-search" data-open="palette">' + icon("search") +
        "<span>Search " + Math.floor(count / 1000) + ",000+ films and shows — any spelling</span><kbd>" + mod + "</kbd></button>" +
      (hasLibrary ? glance() : (FL.persist.supported ? '<p class="footnote"><button type="button" class="link" data-home="restore">Restore your library from a file</button></p>' : "")) +
      "</section>";
  }

  function glance() {
    const s = FL.stats.summary("all");
    const year = new Date().getFullYear();
    const y = FL.stats.summary(year);
    const items = [
      ["#/library/watched", s.films.toLocaleString(), s.films === 1 ? "film watched" : "films watched"],
      ["#/diary", y.films.toLocaleString(), "in " + year],
      ["#/stats", fmtHours(s.minutes), "cinema time"],
      ["#/library/watchlist", FL.store.watchlist().length.toLocaleString(), "on watchlist"],
    ];
    return '<div class="glance">' + items.map(([href, n, label]) =>
      '<a class="glance-item" href="' + href + '"><strong>' + n + "</strong><span>" + label + "</span></a>").join("") + "</div>" +
      (s.missingRuntime && FL.stats.backfillPending() ? '<p class="footnote">Fetching runtimes for ' + s.missingRuntime + " films…</p>" : "");
  }

  function continueRail() {
    const max = Math.min(3, Math.max(1, +(FL.store.prefs().home || {}).continueMax || 3));
    const list = FL.store.continueWatching().slice(0, max);
    if (!list.length) return "";
    const cards = list.map((e) => {
      const film = FL.catalogue.get(e.id);
      if (!film) return "";
      const p = e.progress;
      const ep = p.s ? "?s=" + p.s + "&e=" + p.e : "";
      const bg = FL.meta.backdrop(film);
      const left = p.approx ? "Started " + (p.s ? "S" + p.s + " · E" + p.e : "") : (p.s ? "S" + p.s + " · E" + p.e + " · " : "") + fmtClock(p.d - p.t) + " left";
      return '<a class="resume-card tilt" href="#/watch/' + encodeURIComponent(film.id) + ep + '">' +
        '<div class="resume-art">' + (bg ? '<img src="' + esc(bg) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : art(film)) +
        '<span class="resume-play">' + icon("play") + "</span>" +
        '<div class="card-progress"><i style="width:' + ((p.t / p.d) * 100).toFixed(1) + '%"></i></div></div>' +
        '<div class="resume-body"><strong>' + esc(film.title) + "</strong><span>" + esc(left) + "</span></div></a>";
    }).join("");
    return '<section class="rail"><header class="section-head"><div><h2 class="h2">Continue watching</h2></div></header><div class="rail-track rail-wide">' + cards + "</div></section>";
  }

  /* ---------- tonight ---------- */

  let pickOffset = 0;

  function tonightPool() {
    const listed = filmsOf(FL.store.watchlist()).filter(FL.catalogue.isFilm);
    if (listed.length) return { films: listed, source: "From your watchlist" };
    const recs = FL.catalogue.forYou(40).map((r) => r.film);
    if (recs.length) return { films: recs, source: "Picked for you" };
    return { films: FL.catalogue.acclaimed({ minVotes: 40000, exclude: (f) => FL.store.state(f.id).watched }).slice(0, 200), source: "Acclaimed and unwatched" };
  }

  function tonight() {
    const pool = tonightPool();
    if (!pool.films.length) return "";
    const film = pool.films[(hash(todayISO()) + pickOffset) % pool.films.length];
    const m = FL.meta.cached(film);
    const facts = [FL.catalogue.yearLabel(film), FL.catalogue.filmLang(film), film.genres.slice(0, 2).join(", "), m && m.runtime ? FL.util.fmtRuntime(m.runtime) : ""]
      .filter((x) => x && x !== "World").map(esc).join(" · ");
    const overview = (m && m.desc) || film.desc || "";
    return '<article class="tonight" data-tonight="' + esc(film.id) + '">' +
      '<a class="tonight-art tilt" href="#/film/' + encodeURIComponent(film.id) + '" tabindex="-1">' + art(film, { size: "medium" }) + "</a>" +
      '<div class="tonight-body"><p class="eyebrow">Tonight · ' + pool.source + "</p>" +
      '<h2 class="display-sm"><a href="#/film/' + encodeURIComponent(film.id) + '">' + esc(film.title) + "</a></h2>" +
      '<p class="muted">' + facts + "</p>" +
      '<p class="tonight-overview">' + esc(overview) + "</p>" +
      '<div class="btn-row"><a class="btn btn-primary" href="#/watch/' + encodeURIComponent(film.id) + '">' + icon("play") + "Play</a>" +
      '<button type="button" class="btn btn-ghost" data-home="another">' + icon("shuffle") + "Another</button></div></div></article>";
  }

  function recentDiary() {
    const rows = FL.store.diary().slice(0, 6);
    if (!rows.length) return "";
    return '<section class="panel recent"><header class="section-head"><div><h2 class="h2">Recently watched</h2></div>' +
      '<a class="link-more" href="#/diary">Diary' + icon("arrow-right") + "</a></header><ol class='mini-diary'>" +
      rows.map((r) => {
        const film = FL.catalogue.get(r.id);
        if (!film) return "";
        return '<li><a href="#/film/' + encodeURIComponent(film.id) + '"><span class="mini-date">' + fmtDate(r.date, "short") + "</span>" +
          '<span class="mini-art">' + art(film) + '</span><span class="mini-title">' + esc(film.title) +
          (r.rewatch ? ' <span class="rewatch" title="Rewatch">' + icon("rewatch") + "</span>" : "") + "</span>" +
          (r.entry.rating ? stars(r.entry.rating, "stars-sm") : "") + "</a></li>";
      }).join("") + "</ol></section>";
  }

  /* ---------- rails ---------- */

  function reasonRail(title, items, opts) {
    if (!items.length) return "";
    const byId = new Map(items.map((x) => [x.film.id, x.reason]));
    return rail(title, items.map((x) => x.film), Object.assign({ caption: (f) => esc(byId.get(f.id) || "") }, opts));
  }

  function yourShows() {
    const shows = filmsOf(FL.store.shows());
    return shows.length ? rail("Your shows", shows.slice(0, 20), { more: "#/library/shows" }) : "";
  }

  function discovery() {
    const year = new Date().getFullYear();
    const bigNow = FL.catalogue.browse({ lang: "all", year: String(year), sort: "popular" }).filter((f) => f.imdbId || f.poster).slice(0, 18);
    const out = [rail("The big releases of " + year, bigNow, { more: "#/years/" + year })];
    const langs = FL.stats.summary("all").languages.map((l) => l.label);
    const order = ["Hindi", "English"].sort((a, b) => (langs.indexOf(a) === -1 ? 9 : langs.indexOf(a)) - (langs.indexOf(b) === -1 ? 9 : langs.indexOf(b)));
    const unwatched = (f) => FL.store.state(f.id).watched;
    order.forEach((lang) => {
      const films = FL.catalogue.acclaimed({ lang, minYear: year - 12, minVotes: 25000, exclude: unwatched }).slice(0, 18);
      out.push(rail("Acclaimed " + lang + ", recent years", films, { more: "#/browse?lang=" + lang + "&year=" + (Math.floor((year - 5) / 10) * 10) + "s&sort=rating" }));
    });
    out.push('<section class="rail" data-rail-id="reality"><header class="section-head"><div><h2 class="h2">Reality &amp; talent shows</h2><p class="sub">New seasons appear as they air</p></div>' +
      '<div class="section-tools"><a class="link-more" href="#/shows">All shows' + icon("arrow-right") + "</a></div></header>" +
      '<div class="rail-loading">' + FL.ui.loader(28) + "</div></section>");
    const mcu = FL.catalogue.franchises()[0];
    if (mcu) out.push(rail(esc(mcu.name), mcu.films.slice(0, 20), { more: "#/collection/" + mcu.id, sub: "In release order" }));
    return out.join("");
  }

  function fillReality(el) {
    FL.remote.realityShows().then((shows) => {
      const slot = el.querySelector('[data-rail-id="reality"]');
      if (!slot || !shows.length) { if (slot) slot.remove(); return; }
      const loading = slot.querySelector(".rail-loading");
      const track = document.createElement("div");
      track.className = "rail-track";
      track.innerHTML = shows.map((f) => card(f)).join("");
      loading.replaceWith(track);
      FL.ui.watchPosters(slot);
    }).catch(() => {
      const slot = el.querySelector('[data-rail-id="reality"]');
      if (slot) slot.remove();
    });
  }

  /* "More from Rajkumar Hirani" / "More with Pankaj Tripathi": the people behind what you watch and rate highly. */
  function peopleSlots() {
    return FL.people.favourites(2).map((p, i) =>
      '<section class="rail" data-rail-id="person-' + i + '" data-person="' + esc(p.name) + '" data-role="' + p.role + '" data-films="' + p.films + '">' +
      '<header class="section-head"><div><h2 class="h2">' + (p.role === "Director" ? "More from " : "More with ") + esc(p.name) + "</h2>" +
      '<p class="sub">You’ve watched ' + FL.util.plural(p.films, "film") + (p.role === "Director" ? " they directed" : " with them") + "</p></div>" +
      '<div class="section-tools"><a class="link-more" href="' + FL.people.href(p.name) + '">All' + icon("arrow-right") + "</a></div></header>" +
      '<div class="rail-loading">' + FL.ui.loader(28) + "</div></section>").join("");
  }

  function fillPeople(el) {
    el.querySelectorAll("[data-person]").forEach((slot) => {
      const name = slot.dataset.person;
      FL.people.filmography(name).then((list) => {
        if (!slot.isConnected) return;
        const films = list.filter((x) => x.film.type !== "series" && (slot.dataset.role !== "Director" || x.role === "Director") &&
          !FL.store.state(x.film.id).watched && x.film.year && x.film.year <= new Date().getFullYear()).map((x) => x.film);
        if (films.length < 3) { slot.remove(); return; }
        const track = document.createElement("div");
        track.className = "rail-track";
        track.innerHTML = films.slice(0, 18).map((f) => card(f)).join("");
        slot.querySelector(".rail-loading").replaceWith(track);
        FL.ui.watchPosters(slot);
      }).catch(() => slot.remove());
    });
  }

  function render(el) {
    const hasLibrary = FL.store.entries().length > 0;
    const name = FL.store.prefs().name;
    if (!hasLibrary) {
      el.innerHTML = '<div class="container page">' + hero(name, false) + discovery() + "</div>";
      fillReality(el);
      return;
    }
    const favs = filmsOf(FL.store.favorites());
    const listed = filmsOf(FL.store.watchlist());
    const next = FL.catalogue.nextInSeries().slice(0, 16);
    const nextIds = new Set(next.map((x) => x.film.id));
    const forYou = FL.catalogue.forYou(30).filter((x) => !nextIds.has(x.film.id)).slice(0, 20);
    el.innerHTML = '<div class="container page">' +
      hero(name, true) +
      continueRail() +
      '<div class="home-split">' + tonight() + recentDiary() + "</div>" +
      reasonRail("Up next in your series", next, { sub: "The next film after the ones you’ve seen" }) +
      reasonRail("For you", forYou, { sub: "From your ratings, favourites and what you watch" }) +
      peopleSlots() +
      yourShows() +
      rail("Your watchlist", listed.slice(0, 24), { more: "#/library/watchlist", sub: listed.length ? FL.util.plural(listed.length, "title") : "", empty: FL.ui.empty("Your next favourite hasn’t been saved yet.", "Tap the bookmark on any poster.") }) +
      (favs.length ? rail("Films that stayed with you", favs.slice(0, 24), { more: "#/library/favorites" }) : "") +
      discovery() +
      "</div>";
    fillReality(el);
    fillPeople(el);
  }

  FL.views = FL.views || {};
  FL.views.home = {
    title: "Home",
    mount(el) {
      render(el);
      const click = (e) => {
        if (e.target.closest('[data-home="restore"]')) {
          FL.persist.restore().then((n) => FL.ui.toast("Restored " + FL.util.plural(n, "title") + "."), (err) => { if (err && err.name !== "AbortError") FL.ui.toast("That file couldn't be read."); });
          return;
        }
        if (!e.target.closest('[data-home="another"]')) return;
        pickOffset++;
        const cardEl = el.querySelector(".tonight");
        const tmp = document.createElement("div");
        tmp.innerHTML = tonight();
        if (cardEl && tmp.firstChild) {
          tmp.firstChild.classList.add("swap-in");
          cardEl.replaceWith(tmp.firstChild);
          FL.ui.watchPosters(el);
          loadTonight();
        }
      };
      function loadTonight() {
        const t = el.querySelector("[data-tonight]");
        const film = t && FL.catalogue.get(t.dataset.tonight);
        if (!film || FL.meta.cached(film)) return;
        FL.meta.details(film).then((m) => {
          const p = el.querySelector('[data-tonight="' + CSS.escape(film.id) + '"] .tonight-overview');
          if (m && p && !p.textContent) p.textContent = m.desc;
        });
      }
      el.addEventListener("click", click);
      loadTonight();
      return {
        update(detail) {
          if (detail.kind === "progress") return;
          const y = window.scrollY;
          render(el);
          FL.ui.watchPosters(el);
          window.scrollTo(0, y);
        },
        destroy() { el.removeEventListener("click", click); },
      };
    },
  };
})(window.FL = window.FL || {});
