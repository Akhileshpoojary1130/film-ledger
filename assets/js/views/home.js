/* Iris — Home: what to watch next, built from what you've watched and saved. */
(function (FL) {
  "use strict";

  const { esc, fmtDate, fmtClock, fmtHours, hash, todayISO } = FL.util;
  const { icon, rail, stars, art, card } = FL.ui;

  const filmsOf = (entries) => entries.map((e) => FL.catalogue.get(e.id)).filter(Boolean);

  function hero(name, hasLibrary) {
    const count = FL.catalogue.films.filter((f) => !f.remote).length;
    const mod = FL.palette.isMac() ? "⌘K" : "Ctrl K";
    const g = FL.voice.greeting(name);
    const text = g.line[0] + " " + g.line[1];
    return '<section class="home-hero" data-slot-time="' + g.id + '">' +
      '<div class="home-brand" aria-hidden="true">' + FL.theme.mark({ size: 60, cls: "home-mark" }) + '<span class="home-word">Iris</span></div>' +
      '<p class="eyebrow">' + esc(g.eyebrow) + "</p>" +
      '<h1 class="display hero-line"><span class="hero-words"' + FL.voice.moodAttrs(text) + ">" + esc(g.line[0]) + " <em>" + esc(g.line[1]) + "</em></span></h1>" +
      '<button type="button" class="hero-search" data-open="palette">' + icon("search") +
        "<span>Search " + Math.floor(count / 1000) + ",000+ films and shows</span><kbd>" + mod + "</kbd></button>" +
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

  /* ---------- tonight: three picks from three angles ---------- */

  let pickOffset = 0;

  /* One from your taste, one you saved, one that's simply a must-watch you haven't seen — each says why.
     They rotate daily (and on "Another"); at lunch or late at night, shorter films are preferred when known. */
  function tonightPicks() {
    const salt = hash(todayISO()) + pickOffset;
    const h = new Date().getHours();
    const short = (h >= 11 && h < 16) || h < 4;
    const fits = (f) => {
      const m = FL.meta.cached(f);
      return !short || !m || !m.runtime || m.runtime <= 130;
    };
    const taken = new Set();
    const from = (list, reason) => {
      const pool = list.filter((x) => x.film && !taken.has(x.film.id) && fits(x.film));
      if (!pool.length) return null;
      const x = pool[salt % Math.min(pool.length, 12)];
      taken.add(x.film.id);
      return { film: x.film, reason: x.reason || reason };
    };
    const picks = [];
    const recs = FL.catalogue.forYou(40).filter((x) => (x.film.rating || 0) >= 6.5);
    picks.push(from(recs, "Matches what you watch"));
    const saved = FL.store.watchlist().map((e) => ({ film: FL.catalogue.get(e.id), reason: "You saved it " + fmtDate(new Date(e.listedAt || e.added || Date.now()).toISOString().slice(0, 10), "short") }))
      .filter((x) => x.film && x.film.type !== "series");
    picks.push(from(saved, "From Watch later") || from(recs.slice(12), "Matches what you watch"));
    const langs = FL.stats.summary("all").languages.map((l) => l.label);
    const lang = { Hindi: "Hindi", English: "English" }[langs[0]] || "";
    const must = FL.catalogue.acclaimed({ lang, minVotes: 40000, minRating: 8, exclude: (f) => FL.store.state(f.id).watched })
      .slice(0, 60).map((f) => ({ film: f, reason: "Must watch · IMDb " + f.rating.toFixed(1) }));
    picks.push(from(must, "Must watch"));
    return picks.filter(Boolean);
  }

  function tonight() {
    const picks = tonightPicks();
    if (!picks.length) return "";
    const h = new Date().getHours();
    const label = h >= 5 && h < 12 ? "For later today" : h >= 12 && h < 17 ? "This afternoon" : "Tonight";
    return '<article class="tonight">' +
      '<header class="tonight-head"><div><p class="eyebrow">' + label + "</p><h2 class=\"h2\">Three picks for you</h2></div>" +
      '<button type="button" class="btn btn-ghost btn-sm" data-home="another">' + icon("shuffle") + "Another three</button></header>" +
      '<ol class="tonight-list">' + picks.map(({ film, reason }) => {
        const m = FL.meta.cached(film);
        const facts = [FL.catalogue.yearLabel(film), FL.catalogue.filmLang(film), m && m.runtime ? FL.util.fmtRuntime(m.runtime) : film.genres[0]]
          .filter((x) => x && x !== "World").map(esc).join(" · ");
        const href = "#/film/" + encodeURIComponent(film.id);
        return '<li class="pick-card" data-tonight="' + esc(film.id) + '">' +
          '<a class="pick-art tilt" href="' + href + '" tabindex="-1">' + art(film) + "</a>" +
          '<div class="pick-text"><a class="pick-title" href="' + href + '">' + esc(film.title) + "</a>" +
            '<span class="pick-facts">' + facts + "</span>" +
            '<span class="pick-why">' + esc(reason) + "</span></div>" +
          '<a class="icon-btn pick-play" href="#/watch/' + encodeURIComponent(film.id) + '" aria-label="Play ' + esc(film.title) + '" title="Play">' + icon("play") + "</a>" +
          "</li>";
      }).join("") + "</ol></article>";
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

  /* New episodes of shows you're watching, found live — a new season shows up here the week it starts. */
  function fillNewEpisodes(el) {
    if (!FL.store.shows().length) return;
    FL.remote.newEpisodes(8).then((list) => {
      const slot = el.querySelector('[data-rail-id="newep"]');
      if (!slot) return;
      if (!list.length) { slot.remove(); return; }
      const byId = new Map(list.map((x) => [x.film.id, x]));
      slot.outerHTML = rail("New episodes", list.map((x) => x.film), {
        id: "newep", sub: "In the shows you're watching",
        caption: (f) => { const x = byId.get(f.id); return esc("S" + x.next.s + " · E" + x.next.e + (x.count > 1 ? " · " + x.count + " new" : " is new")); },
      });
      FL.ui.watchPosters(el.querySelector('[data-rail-id="newep"]') || el);
    });
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
    const ty = throwbackYear();
    out.push('<section class="rail" data-rail-id="throwback"><header class="section-head"><div><h2 class="h2">Throwback <em>' + ty + "</em></h2>" +
      '<p class="sub">The best-rated films of the year — a different year every day</p></div>' +
      '<div class="section-tools"><a class="link-more" href="#/years/' + ty + '">See ' + ty + icon("arrow-right") + "</a></div></header>" +
      '<div class="rail-loading">' + FL.ui.loader(28) + "</div></section>");
    const mcu = FL.catalogue.franchises()[0];
    if (mcu) out.push(rail(esc(mcu.name), mcu.films.slice(0, 20), { more: "#/collection/" + mcu.id, sub: "In release order" }));
    return out.join("");
  }

  /* One classic year a day, 1970–1989 — the years the bundle doesn't cover. */
  const throwbackYear = () => 1970 + (hash("throwback|" + todayISO()) % 20);

  function fillThrowback(el) {
    const y = throwbackYear();
    Promise.all([FL.remote.yearPage(y, 0), FL.remote.yearPage(y, 1), FL.remote.wikiYear("Hindi", y)]).then((lists) => {
      const slot = el.querySelector('[data-rail-id="throwback"]');
      if (!slot) return;
      const seen = new Set();
      const films = [].concat.apply([], lists).filter((f) => {
        if (!f.rating || f.rating < 7 || seen.has(f.id) || f.type === "series") return false;
        seen.add(f.id);
        return (f.pop || 0) >= 50;
      }).sort((a, b) => b.rating - a.rating).slice(0, 18);
      if (films.length < 4) { slot.remove(); return; }
      const track = document.createElement("div");
      track.className = "rail-track";
      track.innerHTML = films.map((f) => card(f)).join("");
      slot.querySelector(".rail-loading").replaceWith(track);
      FL.ui.watchPosters(slot);
    }).catch(() => {
      const slot = el.querySelector('[data-rail-id="throwback"]');
      if (slot) slot.remove();
    });
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
      fillThrowback(el);
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
      (FL.store.shows().length ? '<section class="rail" data-rail-id="newep"></section>' : "") +
      yourShows() +
      rail("Watch later", listed.slice(0, 24), { more: "#/library/watchlist", sub: listed.length ? FL.util.plural(listed.length, "title") : "", empty: FL.ui.empty("Your next favourite hasn’t been saved yet.", "Tap the bookmark on any poster.") }) +
      (favs.length ? rail("Films that stayed with you", favs.slice(0, 24), { more: "#/library/favorites" }) : "") +
      discovery() +
      "</div>";
    fillReality(el);
    fillThrowback(el);
    fillPeople(el);
    fillNewEpisodes(el);
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
      /* Runtimes for the picks, so "2h 10m" shows and short-film preferences have something to go on. */
      function loadTonight() {
        el.querySelectorAll("[data-tonight]").forEach((t) => {
          const film = FL.catalogue.get(t.dataset.tonight);
          if (!film || FL.meta.cached(film)) return;
          FL.meta.details(film).then((m) => {
            const facts = el.querySelector('[data-tonight="' + CSS.escape(film.id) + '"] .pick-facts');
            if (m && m.runtime && facts && facts.textContent.indexOf("m") === -1) facts.textContent += " · " + FL.util.fmtRuntime(m.runtime);
          });
        });
      }
      el.addEventListener("click", click);
      loadTonight();

      /* As you scroll, the big logo shrinks away and the top bar's takes over; once the big search bar has
         scrolled under the top bar, the small one appears in its place (and page changes morph between them). */
      const root = document.documentElement;
      let dockFrame = 0;
      function dock() {
        dockFrame = 0;
        const p = Math.min(1, Math.max(0, window.scrollY / 150));
        const brand = el.querySelector(".home-brand");
        if (brand) brand.style.setProperty("--dock", p.toFixed(3));
        root.classList.toggle("brand-docked", p > 0.8);
        const search = el.querySelector(".hero-search");
        const bar = document.querySelector(".topbar");
        root.classList.toggle("search-docked", !!(search && bar && search.getBoundingClientRect().bottom < bar.getBoundingClientRect().bottom + 8));
      }
      const onScroll = () => { if (!dockFrame) dockFrame = requestAnimationFrame(dock); };
      window.addEventListener("scroll", onScroll, { passive: true });
      dock();
      // The greeting follows the clock: swap it when the time of day moves on.
      const clock = setInterval(() => {
        const h = el.querySelector(".home-hero");
        const g = FL.voice.greeting(FL.store.prefs().name);
        if (!h || h.dataset.slotTime === g.id) return;
        const tmp = document.createElement("div");
        tmp.innerHTML = hero(FL.store.prefs().name, FL.store.entries().length > 0);
        h.replaceWith(tmp.firstChild);
      }, 5 * 60e3);
      return {
        update(detail) {
          if (detail.kind === "progress") return;
          const y = window.scrollY;
          render(el);
          FL.ui.watchPosters(el);
          window.scrollTo(0, y);
          dock();
        },
        destroy() {
          clearInterval(clock);
          window.removeEventListener("scroll", onScroll);
          cancelAnimationFrame(dockFrame);
          el.removeEventListener("click", click);
        },
      };
    },
  };
})(window.FL = window.FL || {});
