/* Iris — Home: what to watch next, built from what you've watched and saved. */
(function (FL) {
  "use strict";

  const { esc, fmtDate, fmtClock, fmtHours, hash, todayISO } = FL.util;
  const { icon, rail, stars, art, card } = FL.ui;

  const filmsOf = (entries) => entries.map((e) => FL.catalogue.get(e.id)).filter(Boolean);

  function hero(name, hasLibrary) {
    const count = FL.catalogue.all().length;
    const mod = FL.palette.isMac() ? "⌘K" : "Ctrl K";
    const g = FL.voice.greeting(name);
    const text = g.line[0] + " " + g.line[1];
    return '<section class="home-hero" data-slot-time="' + g.id + '">' +
      '<p class="eyebrow">' + esc(g.eyebrow) + "</p>" +
      '<h1 class="display hero-line"><span class="hero-words"' + FL.voice.moodAttrs(text) + ">" + esc(g.line[0]) + " <em>" + esc(g.line[1]) + "</em></span></h1>" +
      '<button type="button" class="hero-search" data-open="palette" data-page-search>' + icon("search") +
        "<span>Search " + Math.floor(count / 1000) + ",000+ films and shows</span><kbd>" + mod + "</kbd></button>" +
      // The numbers strip is off unless turned on (Settings → Home); Stats has the same numbers and more.
      (hasLibrary ? ((FL.store.prefs().home || {}).glance ? glance() : "") : (FL.persist.supported ? '<p class="footnote"><button type="button" class="link" data-home="restore">Restore your library from a file</button></p>' : "")) +
      "</section>";
  }

  function glance() {
    const s = FL.stats.summary("all");
    const year = new Date().getFullYear();
    const y = FL.stats.summary(year);
    const items = [
      ["#/library/watched", s.films.toLocaleString(), s.films === 1 ? "film watched" : "films watched", "watched"],
      ["#/diary", y.films.toLocaleString(), "in " + year],
      ["#/stats", fmtHours(s.minutes), "cinema time"],
      ["#/library/watchlist", FL.store.watchlist().length.toLocaleString(), "on watchlist", "to watch"],
    ];
    // A shorter label for phones, where "films watched" would wrap and throw the row out of line.
    return '<div class="glance">' + items.map(([href, n, label, short]) =>
      '<a class="glance-item" href="' + href + '"><strong>' + n + "</strong><span" + (short ? ' data-short="' + short + '"' : "") + ">" + label + "</span></a>").join("") + "</div>" +
      (s.missingRuntime && FL.stats.backfillPending() ? '<p class="footnote">Fetching runtimes for ' + s.missingRuntime + " films…</p>" : "");
  }

  /* Up Next: where you stopped (films and episodes), then the shows you follow — one row at the top of Home. */
  function continueRail() {
    const max = Math.min(3, Math.max(1, +(FL.store.prefs().home || {}).continueMax || 3));
    const list = FL.store.continueWatching().slice(0, max);
    const shows = filmsOf(FL.store.shows()).filter((f) => !list.some((e) => e.id === f.id)).slice(0, 12);
    if (!list.length && !shows.length) return "";
    const cards = list.map((e) => {
      const film = FL.catalogue.get(e.id);
      if (!film) return "";
      const p = e.progress;
      const ep = p.s ? "?s=" + p.s + "&e=" + p.e : "";
      const bg = FL.meta.backdrop(film);
      const left = p.approx ? "Started " + (p.s ? "S" + p.s + " · E" + p.e : "") : (p.s ? "S" + p.s + " · E" + p.e + " · " : "") + fmtClock(p.d - p.t) + " left";
      return '<article class="resume-card tilt" data-resume="' + esc(film.id) + '"><a class="resume-link" href="#/watch/' + encodeURIComponent(film.id) + ep + '">' +
        '<div class="resume-art">' + (bg ? '<img src="' + esc(bg) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : art(film)) +
        '<span class="resume-play">' + icon("play") + "</span>" +
        '<div class="card-progress"><i style="width:' + ((p.t / p.d) * 100).toFixed(1) + '%"></i></div></div>' +
        '<div class="resume-body"><strong>' + esc(film.title) + "</strong><span>" + esc(left) + "</span></div></a>" +
        '<button type="button" class="resume-x" data-home="forget" aria-label="Remove ' + esc(film.title) + ' from Up Next" title="Remove from Up Next">' + icon("x") + "</button></article>";
    }).join("") + shows.map(showCard).join("");
    return '<section class="rail"><header class="section-head"><div><h2 class="h2">Up Next</h2></div>' +
      (shows.length ? '<div class="section-tools"><a class="link-more" href="#/library/shows">Shows' + icon("arrow-right") + "</a></div>" : "") +
      '</header><div class="rail-track rail-wide">' + cards + "</div></section>";
  }

  /* A show you follow: the last episode you ticked (or that you're following it), and its page one tap away. */
  function showCard(film) {
    const e = FL.store.peek(film.id);
    const eps = Object.keys((e && e.episodes) || {}).map((k) => k.split(":").map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const last = eps[eps.length - 1];
    const bg = FL.meta.backdrop(film);
    return '<article class="resume-card tilt" data-show="' + esc(film.id) + '"><a class="resume-link" href="#/show/' + encodeURIComponent(film.id) + '">' +
      '<div class="resume-art">' + (bg ? '<img src="' + esc(bg) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : art(film)) +
      '<span class="resume-play">' + icon("play") + "</span></div>" +
      '<div class="resume-body"><strong>' + esc(film.title) + "</strong><span>" + (last ? "S" + last[0] + " · E" + last[1] + " ✓" : "Following") + "</span></div></a>" +
      '<button type="button" class="resume-x" data-home="dropshow" aria-label="Remove ' + esc(film.title) + ' from Up Next" title="Remove from Up Next">' + icon("x") + "</button></article>";
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

  /* Tonight's three, as wide artwork cards (Apple TV style): the film's backdrop, or its poster blurred when there's
     none, with why it's here, the title and Play. Three across on a wide screen; a swipeable row on a phone. */
  function tonight() {
    const picks = tonightPicks();
    if (!picks.length) return "";
    const h = new Date().getHours();
    const label = h >= 5 && h < 12 ? "For later today" : h >= 12 && h < 17 ? "This afternoon" : "Tonight";
    return '<section class="tonight-row" aria-label="' + label + ': three picks">' +
      '<header class="section-head tonight-head"><div><h2 class="h2">' + (label === "Tonight" ? "Tonight’s Trio" : "Today’s Trio") + "</h2></div>" +
      '<button type="button" class="btn btn-ghost btn-sm tonight-more" data-home="another" aria-label="Another three" title="Another three">' + icon("shuffle") + '<span class="hide-sm">Another three</span></button></header>' +
      '<ol class="tn-list">' + picks.map(({ film, reason }) => {
        const m = FL.meta.cached(film);
        const facts = [FL.catalogue.yearLabel(film), FL.catalogue.filmLang(film), m && m.runtime ? FL.util.fmtRuntime(m.runtime) : film.genres[0]]
          .filter((x) => x && x !== "World").map(esc).join(" · ");
        const href = "#/film/" + encodeURIComponent(film.id);
        const bg = FL.meta.backdrop(film);
        return '<li class="tn-card' + (bg ? "" : " is-posteronly") + '" data-tonight="' + esc(film.id) + '">' +
          '<a class="tn-link" href="' + href + '" aria-label="' + esc(film.title) + '">' +
            '<span class="tn-media">' +
              (bg ? '<img class="tn-bg" src="' + esc(bg) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest(\'.tn-card\').classList.add(\'is-posteronly\');this.remove()">' : "") +
              '<span class="tn-poster">' + art(film) + "</span>" +
            "</span>" +
            '<span class="tn-body"><span class="tn-why">' + esc(reason) + '</span><strong class="tn-title">' + esc(film.title) + "</strong>" +
              '<span class="tn-facts">' + facts + "</span></span>" +
          "</a>" +
          '<a class="tn-play" href="#/watch/' + encodeURIComponent(film.id) + '" aria-label="Play ' + esc(film.title) + '">' + icon("play") + "<span>Play</span></a>" +
          "</li>";
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
        id: "newep", dismiss: "newep",
        caption: (f) => { const x = byId.get(f.id); return esc("S" + x.next.s + " · E" + x.next.e + (x.count > 1 ? " · " + x.count + " new" : " is new")); },
      });
      FL.ui.watchPosters(el.querySelector('[data-rail-id="newep"]') || el);
    });
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
    out.push('<section class="rail" data-rail-id="reality"><header class="section-head"><div><h2 class="h2">Reality &amp; talent shows</h2></div>' +
      '<div class="section-tools"><a class="link-more" href="#/shows">All shows' + icon("arrow-right") + "</a></div></header>" +
      '<div class="rail-loading">' + FL.ui.loader(28) + "</div></section>");
    const ty = throwbackYear();
    out.push('<section class="rail" data-rail-id="throwback"><header class="section-head"><div><h2 class="h2">Throwback <em>' + ty + "</em></h2>" +
      "</div>" +
      '<div class="section-tools"><a class="link-more" href="#/years/' + ty + '">See ' + ty + icon("arrow-right") + "</a></div></header>" +
      '<div class="rail-loading">' + FL.ui.loader(28) + "</div></section>");
    const mcu = FL.catalogue.franchises()[0];
    if (mcu) out.push(rail(esc(mcu.name), mcu.films.slice(0, 20), { more: "#/collection/" + mcu.id }));
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
      '<header class="section-head"><div><h2 class="h2">' + (p.role === "Director" ? "More from " : "More with ") + esc(p.name) + "</h2></div>" +
      '<div class="section-tools"><a class="link-more" href="' + FL.people.href(p.name, p.role) + '">All' + icon("arrow-right") + "</a></div></header>" +
      '<div class="rail-loading">' + FL.ui.loader(28) + "</div></section>").join("");
  }

  function fillPeople(el) {
    el.querySelectorAll("[data-person]").forEach((slot) => {
      const name = slot.dataset.person;
      FL.people.filmography(name, slot.dataset.role === "Director").then((list) => {
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
      el.innerHTML = '<div class="container page">' + hero(name, false) + '<section class="rail" data-rail-id="dubbed"></section>' + discovery() + "</div>";
      fillReality(el);
      fillThrowback(el);
      fillDubbed(el);
      return;
    }
    const listed = filmsOf(FL.store.watchlist());
    const next = FL.catalogue.nextInSeries().slice(0, 16);
    const nextIds = new Set(next.map((x) => x.film.id));
    const forYou = FL.catalogue.forYou(30).filter((x) => !nextIds.has(x.film.id)).slice(0, 20);
    el.innerHTML = '<div class="container page">' +
      hero(name, true) +
      "<div data-continue>" + continueRail() + "</div>" +
      tonight() +
      reasonRail("Up next in your series", next) +
      reasonRail("For you", forYou) +
      peopleSlots() +
      (FL.store.shows().length ? '<section class="rail" data-rail-id="newep"></section>' : "") +
      rail("Watch later", listed.slice(0, 24), { more: "#/library/watchlist", empty: FL.ui.empty("Your next favourite hasn’t been saved yet.", "Tap the bookmark on any poster.") }) +
      '<section class="rail" data-rail-id="dubbed"></section>' +
      discovery() +
      "</div>";
    fillReality(el);
    fillThrowback(el);
    fillPeople(el);
    fillNewEpisodes(el);
    fillDubbed(el);
    // The Artwork background takes its colours from tonight's first pick.
    const first = tonightPicks()[0];
    if (first) FL.ambient.art(FL.meta.backdrop(first.film) || FL.meta.posterCandidates(first.film, "small")[0]);
  }

  /* Vega's newest Hindi dubbed films, once its catalogue has loaded. */
  function fillDubbed(el) {
    FL.remote.vegaDubbed(24).then((films) => {
      const slot = el.querySelector('[data-rail-id="dubbed"]');
      if (!slot) return;
      if (!films.length) { slot.remove(); return; }
      slot.outerHTML = rail("Hindi dubbed, just in", films, { id: "dubbed", more: "#/browse?lang=Dubbed&sort=newest" });
      FL.ui.watchPosters(el.querySelector('[data-rail-id="dubbed"]') || el);
    });
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
        const forget = e.target.closest('[data-home="forget"]');
        if (forget) { forgetResume(forget.closest("[data-resume]")); return; }
        const drop = e.target.closest('[data-home="dropshow"]');
        if (drop) {
          const show = FL.catalogue.get(drop.closest("[data-show]").dataset.show);
          if (!show) return;
          FL.store.dropShow(show);
          FL.ui.toast("Removed " + show.title + " from Up Next", { action: "Undo", onAction: () => FL.store.undropShow(show) });
          return;
        }
        if (!e.target.closest('[data-home="another"]')) return;
        pickOffset++;
        const cardEl = el.querySelector(".tonight-row");
        const tmp = document.createElement("div");
        tmp.innerHTML = tonight();
        if (cardEl && tmp.firstChild) {
          tmp.firstChild.classList.add("swap-in");
          cardEl.replaceWith(tmp.firstChild);
          FL.ui.watchPosters(el);
          loadTonight();
        }
      };
      /* × on a Continue watching card: forget where you stopped (the film stays in your library otherwise). The row
         redraws, so the next unfinished title moves up; Undo puts it back exactly as it was. */
      function redrawContinue() {
        const box = el.querySelector("[data-continue]");
        if (!box) return;
        box.innerHTML = continueRail();
        FL.ui.watchPosters(box);
      }
      function forgetResume(card) {
        if (!card) return;
        const id = card.dataset.resume;
        const entry = FL.store.peek(id);
        if (!entry || !entry.progress) return;
        const saved = JSON.parse(JSON.stringify(entry));
        const film = FL.catalogue.get(id);
        FL.store.clearProgress(id);
        card.classList.add("is-leaving");
        setTimeout(redrawContinue, FL.theme.calm() ? 0 : 240);
        FL.ui.toast("Removed " + (film ? film.title : "it") + " from Up Next", { action: "Undo", onAction: () => { FL.store.restoreProgress(id, saved); redrawContinue(); } });
      }
      /* Runtimes for the picks, so "2h 10m" shows and short-film preferences have something to go on. */
      function loadTonight() {
        el.querySelectorAll("[data-tonight]").forEach((t) => {
          const film = FL.catalogue.get(t.dataset.tonight);
          if (!film || FL.meta.cached(film)) return;
          FL.meta.details(film).then((m) => {
            const facts = el.querySelector('[data-tonight="' + CSS.escape(film.id) + '"] .tn-facts');
            if (m && m.runtime && facts && facts.textContent.indexOf("m") === -1) facts.textContent += " · " + FL.util.fmtRuntime(m.runtime);
          });
        });
      }
      el.addEventListener("click", click);
      loadTonight();


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
        },
        destroy() {
          clearInterval(clock);
          el.removeEventListener("click", click);
        },
      };
    },
  };
})(window.FL = window.FL || {});
