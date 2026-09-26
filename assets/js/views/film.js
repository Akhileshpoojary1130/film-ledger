/* Iris — film page (facts + your record, series, similar) and franchise collections. */
(function (FL) {
  "use strict";

  const { esc, fmtDate, fmtRuntime, fmtClock, compact, todayISO, $ } = FL.util;
  const { icon, art, stars, ratingWidget, rail, row } = FL.ui;

  function actionButtons(film) {
    const st = FL.store.state(film.id);
    const e = FL.store.peek(film.id);
    const p = e && e.progress;
    const resume = p && p.d && p.t > 90 && p.t / p.d < 0.92;
    return '<a class="btn btn-primary btn-lg" href="#/watch/' + encodeURIComponent(film.id) + '">' + icon("play") +
        (resume ? "Resume <small>" + fmtClock(p.t) + "</small>" : "Play") + "</a>" +
      '<button type="button" class="btn btn-lg" data-fa="trailer" hidden>' + icon("trailer") + "Trailer</button>" +
      '<button type="button" class="btn btn-lg toggle' + (st.listed ? " is-on" : "") + '" data-fa="list" aria-pressed="' + st.listed + '">' + icon("bookmark") + (st.listed ? "Saved for later" : "Watch later") + "</button>" +
      '<button type="button" class="btn btn-lg toggle' + (st.watched ? " is-on" : "") + '" data-fa="seen" aria-pressed="' + st.watched + '">' + icon("check") +
        (st.watched ? "Watched" + (st.count > 1 ? " " + st.count + "×" : "") : "Mark watched") + "</button>" +
      '<button type="button" class="icon-btn icon-btn-lg toggle fav' + (st.fav ? " is-on" : "") + '" data-fa="fav" aria-pressed="' + st.fav + '" aria-label="Favourite" title="Favourite (F)">' + icon("heart") + "</button>";
  }

  function record(film) {
    const e = FL.store.peek(film.id);
    const st = FL.store.state(film.id);
    const watches = e ? e.watches : [];
    let summary;
    if (watches.length) {
      summary = "Watched " + (watches.length === 1 ? "once" : watches.length + " times") +
        (watches.length > 1 ? " · first " + fmtDate(watches[0]) : "") + " · last " + fmtDate(watches[watches.length - 1]);
    } else if (st.watched) {
      summary = "Watched · date not recorded";
    } else {
      summary = "Not watched yet";
    }
    const list = watches.length
      ? '<ol class="log">' + watches.map((d, i) => '<li><span>' + icon(i ? "rewatch" : "calendar") + fmtDate(d) + (i ? ' <em>rewatch</em>' : "") + "</span>" +
          '<button type="button" class="icon-btn icon-btn-sm" data-fa="unlog" data-i="' + i + '" aria-label="Remove ' + fmtDate(d) + '">' + icon("x") + "</button></li>").reverse().join("") + "</ol>"
      : "";
    return '<div class="record-block"><span class="label">Your rating</span>' + ratingWidget(film) + "</div>" +
      '<div class="record-block"><span class="label">History</span><p class="record-summary">' + summary + "</p>" + list +
      '<button type="button" class="link small" data-fa="add-date">' + icon("plus") + (watches.length ? "Add a rewatch date" : "Add a watch date") + "</button>" +
      '<form class="log-form" data-log hidden><label class="sr-only" for="log-date">Watch date</label>' +
      '<input class="input" type="date" id="log-date" value="' + todayISO() + '" max="' + todayISO() + '" min="1950-01-01" required>' +
      '<button class="btn" type="submit">' + icon("plus") + (watches.length ? "Log a rewatch" : "Log a watch") + "</button></form></div>";
  }

  function facts(film, m) {
    const bits = [];
    if (m && m.runtime) bits.push(fmtRuntime(m.runtime));
    if (film.genres.length) bits.push(film.genres.slice(0, 3).join(", "));
    if (m && m.directors.length) bits.push("Dir. " + m.directors.join(", "));
    return bits.length ? bits.map(esc).join('<span class="sep">·</span>') : "";
  }

  function scores(film, m) {
    const r = film.rating || (m && m.rating) || 0;
    if (!r) return "";
    return '<span class="imdb-score"><b>IMDb</b> ' + r.toFixed(1) + (film.votes ? " <small>" + compact(film.votes) + " votes</small>" : "") + "</span>";
  }

  function detailsList(film, m) {
    const rows = [];
    rows.push(["Released", film.date ? fmtDate(film.date) : m && m.released ? fmtDate(m.released) : String(film.year)]);
    rows.push(["Language", FL.catalogue.filmLang(film)]);
    if (film.universe) rows.push(["Universe", film.universe + (film.era ? " · " + film.era : "")]);
    if (m && m.country) rows.push(["Country", m.country]);
    if (m && m.awards) rows.push(["Awards", m.awards]);
    return '<dl class="details">' + rows.map(([k, v]) => "<dt>" + k + "</dt><dd>" + esc(v) + "</dd>").join("") + "</dl>";
  }

  /* Cast & crew as small portrait chips; each opens that person's films. */
  function credits(m) {
    if (!m) return '<h2 class="label">Cast &amp; crew</h2><div class="people"><span class="skeleton-line"></span></div>';
    const roles = new Map();
    const add = (name, role) => {
      if (!name) return;
      const r = roles.get(name) || [];
      if (r.indexOf(role) === -1) r.push(role);
      roles.set(name, r);
    };
    m.directors.forEach((n) => add(n, "Director"));
    m.writers.forEach((n) => add(n, "Writer"));
    m.cast.forEach((n) => add(n, "Cast"));
    if (!roles.size) return "";
    return '<h2 class="label">Cast &amp; crew</h2><div class="people">' +
      Array.from(roles).map(([name, r]) => FL.people.chip(name, r.join(" · "))).join("") + "</div>";
  }

  const castNames = (m) => (m ? m.directors.concat(m.writers, m.cast) : []);
  const castRoles = (m) => {
    const r = {};
    m.cast.forEach((n) => { r[n] = "Cast"; });
    m.writers.forEach((n) => { r[n] = "Writer"; });
    m.directors.forEach((n) => { r[n] = "Director"; });
    return r;
  };

  function links(film) {
    const tt = FL.meta.idFor(film);
    const out = [];
    if (tt) out.push('<a class="link" target="_blank" rel="noopener noreferrer" href="https://www.imdb.com/title/' + tt + '/">IMDb ↗</a>');
    out.push('<a class="link" target="_blank" rel="noopener noreferrer" href="https://en.wikipedia.org/wiki/' + encodeURIComponent((film.wiki || film.title).replace(/ /g, "_")) + '">Wikipedia ↗</a>');
    out.push('<a class="link" target="_blank" rel="noopener noreferrer" href="' + FL.ui.whereToWatch(film) + '">Where to watch ↗</a>');
    return '<p class="ext-links">' + out.join("") + "</p>";
  }

  function franchiseBlock(film) {
    const fr = FL.catalogue.franchiseOf(film);
    if (!fr) return "";
    const seen = fr.films.filter((f) => FL.store.state(f.id).watched).length;
    const pos = fr.films.indexOf(film) + 1;
    return '<a class="franchise" href="#/collection/' + fr.id + '"><span class="label">Part of</span><strong>' + esc(fr.name) + "</strong>" +
      "<span>Film " + pos + " of " + fr.films.length + " · you’ve seen " + seen + '</span><span class="meter"><i style="width:' + (seen / fr.films.length) * 100 + '%"></i></span></a>';
  }

  FL.views = FL.views || {};

  /* "In this series" rail: bundled instalments now, plus any the web knows about (e.g. an announced sequel). */
  function seriesRail(film) {
    const s = FL.catalogue.series(film);
    if (!s) return "";
    const idx = s.films.indexOf(film);
    const coll = FL.catalogue.collection("s-" + s.key);
    return rail("The " + esc(s.name) + " series", s.films, {
      cls: "rail-series",
      more: coll ? "#/collection/" + coll.id : "",
      sub: "In release order" + (idx !== -1 ? " · this is part " + (idx + 1) + " of " + s.films.length : ""),
      caption: (f) => (f === film ? "You’re here" : FL.store.state(f.id).watched ? "Watched" : ""),
    });
  }

  FL.views.film = {
    mount(el, params) {
      const id = decodeURIComponent(params[0]);
      const found = FL.catalogue.get(id);
      if (found && found.type === "series") { location.replace("#/show/" + encodeURIComponent(found.id)); return {}; }
      if (found) return mountFilm(el, found, id);

      // Titles from the web (or a shared link to one) are fetched, then shown like any other film.
      let handle = {};
      let alive = true;
      if (/^tt\d+$/.test(id)) {
        el.innerHTML = '<div class="container page page-loading">' + FL.ui.loader(44, "Loading") + "</div>";
        FL.remote.byId(id).then((film) => {
          if (!alive) return;
          if (film) handle = mountFilm(el, film, id) || {};
          else notFound(el);
        });
      } else {
        notFound(el);
      }
      return {
        update(d) { if (handle.update) handle.update(d); },
        key(k) { return handle.key ? handle.key(k) : false; },
        destroy() { alive = false; if (handle.destroy) handle.destroy(); },
      };
    },
  };

  function notFound(el) {
    el.innerHTML = '<div class="container page">' + FL.ui.empty("This film couldn’t be found.", "The link may be broken, or the title is no longer listed.", '<a class="btn" href="#/browse">Browse films</a>') + "</div>";
  }

  function mountFilm(el, film, requested) {
    if (film.id !== requested) history.replaceState(null, "", "#/film/" + encodeURIComponent(film.id));
    document.title = film.title + (film.year ? " (" + film.year + ")" : "") + " · Iris";
    FL.store.pushRecent(film.id);
    if (film.remote) FL.remote.touch(film);

    let m = FL.meta.cached(film);
    const desc = () => FL.util.prose((m && m.desc) || film.desc || "");

    el.innerHTML =
      '<article class="film">' +
        '<div class="film-backdrop" aria-hidden="true"></div>' +
        '<div class="container film-hero">' +
          '<div class="film-poster">' + art(film, { size: "medium", eager: true }) + "</div>" +
          '<div class="film-head">' +
            '<p class="eyebrow">' + [FL.catalogue.filmLang(film), FL.catalogue.yearLabel(film), film.universe].filter((x) => x && x !== "World").map(esc).join(" · ") +
              (FL.ui.mustWatch(film) ? ' <span class="tag-must tag-inline">Must watch</span>' : "") + "</p>" +
            '<h1 class="display film-title">' + esc(film.title) + "</h1>" +
            '<p class="film-facts" data-slot="facts">' + (facts(film, m) || '<span class="skeleton-line short"></span>') + "</p>" +
            '<p class="film-scores" data-slot="scores">' + scores(film, m) + "</p>" +
            '<div class="film-actions" data-slot="actions">' + actionButtons(film) + "</div>" +
          "</div>" +
        "</div>" +
        '<div class="container film-body">' +
          '<div class="film-main">' +
            '<section><h2 class="label">Overview</h2><p class="lede" data-slot="overview">' + (desc() ? esc(desc()) : '<span class="skeleton-line"></span><span class="skeleton-line"></span><span class="skeleton-line short"></span>') + "</p></section>" +
            '<section data-slot="trailer" hidden></section>' +
            '<section data-slot="credits">' + credits(m) + "</section>" +
            franchiseBlock(film) +
            '<section><h2 class="label">Details</h2><div data-slot="details">' + detailsList(film, m) + "</div>" + links(film) + "</section>" +
          "</div>" +
          '<aside class="film-record panel" aria-label="Your record">' +
            '<h2 class="h3">Your record</h2>' +
            '<div data-slot="record">' + record(film) + "</div>" +
            '<p class="footnote">Saved on this device. See Settings → Storage to keep a copy that survives clearing browser data.</p>' +
          "</aside>" +
        "</div>" +
        '<div class="container" data-slot="series">' + seriesRail(film) + "</div>" +
        '<div class="container" data-slot="people"></div>' +
        '<div class="container" data-slot="similar">' + rail("More like this", FL.catalogue.similar(film, 18)) + "</div>" +
      "</article>";

    // The view container outlives this page; its own article tells us whether we're still on screen.
    const page = el.firstElementChild;
    const slot = (name) => $('[data-slot="' + name + '"]', el);

    function setBackdrop() {
      const bg = FL.meta.backdrop(film);
      const box = $(".film-backdrop", el);
      if (!bg || !box || box.firstChild) return;
      const img = new Image();
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.decoding = "async";
      img.onload = () => box.classList.add("is-in");
      img.src = bg;
      box.appendChild(img);
    }

    function showMeta(meta) {
      m = meta;
      slot("facts").innerHTML = facts(film, m);
      slot("scores").innerHTML = scores(film, m);
      slot("overview").textContent = desc() || "No synopsis available.";
      slot("credits").innerHTML = credits(m || { directors: [], writers: [], cast: [] });
      if (m) {
        FL.people.photos(castNames(m), castRoles(m)).then(() => { if (page.isConnected) FL.people.paint(slot("credits")); });
        moreFrom(m);
      }
      slot("details").innerHTML = detailsList(film, m);
      const tr = $('[data-fa="trailer"]', el);
      if (tr) tr.hidden = !(m && m.trailer);
      showTrailer();
      setBackdrop();
      const poster = $(".film-poster .art", el);
      if (poster && !poster.querySelector("img.is-in") && FL.meta.idFor(film)) {
        poster.outerHTML = art(film, { size: "medium", eager: true });
      }
    }

    /* The trailer, right on the page: a still with a play button that turns into the video in place. */
    function showTrailer() {
      const box = slot("trailer");
      if (!box || !m || !m.trailer || box.dataset.id === m.trailer) return;
      box.dataset.id = m.trailer;
      box.hidden = false;
      box.innerHTML = '<h2 class="label">Trailer</h2><button type="button" class="trailer-inline" data-fa="play-trailer" aria-label="Play the trailer">' +
        '<img src="https://i.ytimg.com/vi/' + esc(m.trailer) + '/hqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer">' +
        '<span class="trailer-play">' + icon("play") + "</span></button>";
    }
    function playTrailer() {
      const box = slot("trailer");
      if (!box || !m || !m.trailer) return;
      box.hidden = false;
      box.querySelector(".trailer-inline, .trailer-frame").outerHTML = '<div class="trailer-frame"><iframe src="https://www.youtube-nocookie.com/embed/' + esc(m.trailer) +
        '?autoplay=1&rel=0&modestbranding=1&playsinline=1" title="' + esc(film.title) + ' trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
      box.scrollIntoView({ behavior: FL.theme.calm() ? "auto" : "smooth", block: "center" });
    }

    /* "More from Rajkumar Hirani": the director's other films, fetched once per session. */
    let moreShown = false;
    function moreFrom(meta) {
      const dir = meta.directors[0];
      if (!dir || moreShown) return;
      moreShown = true;
      FL.people.filmography(dir, true).then((list) => {
        const box = slot("people");
        if (!box || !page.isConnected) return;
        const films = list.filter((x) => x.role === "Director" && x.film.type !== "series" && x.film.id !== film.id).map((x) => x.film);
        if (films.length < 2) return;
        box.innerHTML = rail("More from " + esc(dir), films.slice(0, 20), { more: FL.people.href(dir, "Director"), sub: "Directed by the same filmmaker" });
        FL.ui.watchPosters(box);
      }).catch(() => {});
    }

    if (m) showMeta(m);
    else setBackdrop();
    FL.meta.details(film).then((meta) => { if (page.isConnected) showMeta(meta); });

    // Ask the web for instalments the bundle doesn't have ("Hera Pheri 3"), then redraw the series rail.
    const stem = FL.catalogue.stemOf(film.title);
    if (stem.length >= 3) {
      FL.remote.search(stem).then(() => {
        const box = slot("series");
        if (!box || !page.isConnected) return;
        const html = seriesRail(film);
        if (html && html !== box.innerHTML) { box.innerHTML = html; FL.ui.watchPosters(box); }
      });
    }

    // Warm up server probes so Play starts faster.
    FL.util.idle(() => FL.player.probeAll());

    function act(name) {
      const st = FL.store.state(film.id);
      if (name === "list") FL.store.toggleList(film);
      else if (name === "fav") FL.store.toggleFav(film);
      else if (name === "seen") {
        if (st.count) {
          FL.ui.confirm({ title: "Clear this film’s history?", body: "It has " + FL.util.plural(st.count, "dated watch", "dated watches") + ". Marking it unwatched removes them.", confirmLabel: "Mark unwatched", danger: true })
            .then((ok) => { if (ok) FL.store.setSeen(film, false); });
        } else {
          FL.store.setSeen(film, !st.watched);
        }
      } else if ((name === "trailer" || name === "play-trailer") && m && m.trailer) playTrailer();
      else if (name === "play") location.hash = "#/watch/" + encodeURIComponent(film.id);
    }

    function onClick(ev) {
      const b = ev.target.closest("[data-fa]");
      if (!b) return;
      const a = b.dataset.fa;
      if (a === "unlog") FL.store.removeWatch(film, +b.dataset.i);
      else if (a === "add-date") { const f = $("[data-log]", el); if (f) { f.hidden = false; f.querySelector("input").focus(); } b.remove(); }
      else act(a);
    }
    function onSubmit(ev) {
      if (!ev.target.matches("[data-log]")) return;
      ev.preventDefault();
      const d = ev.target.querySelector("input").value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      if (d > todayISO()) { FL.ui.toast("That date is in the future."); return; }
      FL.store.logWatch(film, d);
      FL.ui.toast("Logged " + film.title + " · " + fmtDate(d));
    }

    el.addEventListener("click", onClick);
    el.addEventListener("submit", onSubmit);

    return {
      film,
      update(detail) {
        if (detail.id && detail.id !== film.id) return;
        slot("actions").innerHTML = actionButtons(film);
        const tr = $('[data-fa="trailer"]', el);
        if (tr) tr.hidden = !(m && m.trailer);
        if (detail.kind !== "progress") {
          const focusedDate = document.activeElement && document.activeElement.id === "log-date";
          slot("record").innerHTML = record(film);
          if (focusedDate) { const f = $("[data-log]", el); f.hidden = false; $("#log-date", el).focus(); }
        }
      },
      key(k) {
        const map = { w: "list", m: "seen", f: "fav", p: "play", t: "trailer" };
        if (!map[k]) return false;
        act(map[k]);
        return true;
      },
      destroy() {
        el.removeEventListener("click", onClick);
        el.removeEventListener("submit", onSubmit);
      },
    };
  }

  FL.views.collection = {
    mount(el, params) {
      const fr = FL.catalogue.collection(params[0]);
      if (!fr) {
        el.innerHTML = '<div class="container page">' + FL.ui.empty("Collection not found.", "", '<a class="btn" href="#/collections">All collections</a>') + "</div>";
        return {};
      }
      document.title = fr.name + " · Iris";
      function render() {
        const seen = fr.films.filter((f) => FL.store.state(f.id).watched).length;
        const pct = Math.round((seen / fr.films.length) * 100);
        el.innerHTML = '<div class="container page">' +
          '<header class="page-head"><div><p class="eyebrow"><a href="#/collections">Collections</a></p><h1 class="h1">' + esc(fr.name) + "</h1>" +
          '<p class="sub">' + seen + " of " + fr.films.length + " watched · " + pct + '% · in release order</p></div></header>' +
          '<div class="meter meter-lg" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></div>' +
          '<div class="rows ranked">' + fr.films.map((f, i) => row(f, { rank: i + 1, caption: f.order ? esc(f.order) : "" })).join("") + "</div></div>";
        FL.ui.watchPosters(el);
      }
      render();
      return {
        update(detail) {
          if (detail.kind === "progress") return;
          const y = window.scrollY;
          render();
          window.scrollTo(0, y);
        },
      };
    },
  };
})(window.FL = window.FL || {});
