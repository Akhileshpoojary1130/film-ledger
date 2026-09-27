/* Iris — Shows: reality, talent and series. Seasons and episodes are fetched live, so new ones appear as they air. */
(function (FL) {
  "use strict";

  const { esc, $, $$, fmtDate, plural } = FL.util;
  const { icon, art, card, rail, ratingWidget } = FL.ui;

  /* ---------- hub ---------- */

  function slot(id, title, sub) {
    return '<section class="rail" data-slot="' + id + '"><header class="section-head"><div><h2 class="h2">' + title + "</h2>" +
      (sub ? '<p class="sub">' + sub + "</p>" : "") + '</div></header><div class="rail-loading">' + FL.ui.loader(28) + "</div></section>";
  }

  function fill(el, id, promise, asGrid) {
    promise.then((items) => {
      const s = el.querySelector('[data-slot="' + id + '"]');
      if (!s) return;
      if (!items.length) { s.remove(); return; }
      const box = document.createElement("div");
      box.className = asGrid ? "grid" : "rail-track";
      box.innerHTML = items.map((f) => card(f)).join("");
      s.querySelector(".rail-loading").replaceWith(box);
      FL.ui.watchPosters(s);
    }).catch(() => {
      const s = el.querySelector('[data-slot="' + id + '"]');
      if (s) s.remove();
    });
  }

  FL.views = FL.views || {};
  FL.views.shows = {
    title: "Shows",
    mount(el) {
      const mine = FL.store.shows().map((e) => FL.catalogue.get(e.id)).filter(Boolean);
      el.innerHTML = '<div class="container page">' +
        '<header class="page-head"><div><p class="eyebrow">Shows</p><h1 class="display">Reality, talent <em>&amp; series.</em></h1>' +
        '<p class="sub page-sub">New episodes appear as they air; your place is kept.</p></div></header>' +
        (mine.length ? rail("Your shows", mine, { dismiss: true }) : "") +
        slot("reality", "Indian reality &amp; talent") +
        slot("indian", "Indian web series") +
        slot("top", "Popular series right now") +
        slot("realityworld", "Reality TV worldwide") +
        "</div>";
      fill(el, "reality", FL.remote.realityShows(), true);
      fill(el, "indian", FL.remote.indianSeries(), true);
      fill(el, "top", FL.remote.showCatalog(""));
      fill(el, "realityworld", FL.remote.showCatalog("Reality-TV"));
      return {};
    },
  };

  /* ---------- a show ---------- */

  const epKey = (v) => v.s + ":" + v.e;

  /* Reality and talent shows are watched season by season as they air, not from 2006 onward. */
  const isReality = (show) => show.genres.some((g) => /reality|game|talk|talent/i.test(g));

  function nextUp(show, data) {
    const aired = data.episodes.filter((v) => v.s > 0 && v.aired);
    if (!aired.length) return null;
    let last = -1;
    aired.forEach((v, i) => { if (FL.store.episodeWatched(show.id, v.s, v.e)) last = i; });
    if (last === -1 && isReality(show)) {
      const latest = aired[aired.length - 1].s;
      return aired.find((v) => v.s === latest);
    }
    return aired[last + 1] || null;
  }

  function seasonLabel(s) { return s === 0 ? "Specials" : "Season " + s; }

  FL.views.show = {
    mount(el, params) {
      const id = decodeURIComponent(params[0]);
      let show = FL.catalogue.get(id);
      let data = null;
      let season = null;
      let alive = true;

      el.innerHTML = '<div class="container page">' + FL.ui.loader(40, "Loading show") + "</div>";

      function header() {
        const st = FL.store.state(show.id);
        const up = data && nextUp(show, data);
        const watchedEps = st.episodes;
        // Reality shows count the season you're on (nobody tracks 1,500 episodes of Bigg Boss); series count the whole run.
        const scope = data ? data.episodes.filter((v) => v.s > 0 && v.aired && (!isReality(show) || v.s === (up ? up.s : season))) : [];
        const airedCount = scope.length;
        const seenCount = scope.filter((v) => FL.store.episodeWatched(show.id, v.s, v.e)).length;
        const scopeLabel = isReality(show) && scope.length ? " in season " + scope[0].s : "";
        const playHref = up ? "#/watch/" + encodeURIComponent(show.id) + "?s=" + up.s + "&e=" + up.e : "";
        const facts = [FL.catalogue.yearLabel(show), data && data.seasons.filter((x) => x > 0).length ? plural(data.seasons.filter((x) => x > 0).length, "season") : "",
          show.genres.slice(0, 3).join(", "), data && data.status ? data.status : ""].filter(Boolean).map(esc).join('<span class="sep">·</span>');
        return '<div class="film-backdrop" aria-hidden="true"></div>' +
          '<div class="container film-hero">' +
            '<div class="film-poster">' + art(show, { size: "medium", eager: true }) + "</div>" +
            '<div class="film-head">' +
              '<p class="eyebrow">Series' + (show.region ? " · " + esc(show.region) : "") + "</p>" +
              '<h1 class="display film-title">' + esc(show.title) + "</h1>" +
              '<p class="film-facts">' + facts + "</p>" +
              '<p class="film-scores">' + (show.rating ? '<span class="imdb-score"><b>IMDb</b> ' + show.rating.toFixed(1) + "</span>" : "") +
                (watchedEps ? '<span class="muted show-seen">' + seenCount + " of " + airedCount + " episodes watched" + scopeLabel + "</span>" : "") + "</p>" +
              '<div class="film-actions">' +
                (up ? '<a class="btn btn-primary btn-lg" href="' + playHref + '">' + icon("play") + (watchedEps ? "Continue" : "Start") + " <small>S" + up.s + " · E" + up.e + "</small></a>" : "") +
                '<button type="button" class="btn btn-lg toggle' + (st.listed ? " is-on" : "") + '" data-sa="list" aria-pressed="' + st.listed + '">' + icon("bookmark") + (st.listed ? "Following" : "Follow") + "</button>" +
                '<button type="button" class="icon-btn icon-btn-lg toggle fav' + (st.fav ? " is-on" : "") + '" data-sa="fav" aria-pressed="' + st.fav + '" aria-label="Favourite">' + icon("heart") + "</button>" +
              "</div>" +
            "</div>" +
          "</div>";
      }

      const bdrop = () => (data && (data.backdrop || FL.meta.backdrop(show))) || "";

      function episodes() {
        const list = data.episodes.filter((v) => v.s === season);
        const today = new Date().toISOString().slice(0, 10);
        const allWatched = list.filter((v) => v.aired).every((v) => FL.store.episodeWatched(show.id, v.s, v.e));
        return '<div class="season-head"><h2 class="h2">' + seasonLabel(season) + ' <span class="muted">' + plural(list.length, "episode") + "</span></h2>" +
          (list.some((v) => v.aired) ? '<button type="button" class="btn btn-sm btn-ghost" data-sa="season">' + icon("check") + (allWatched ? "Unmark season" : "Mark season watched") + "</button>" : "") + "</div>" +
          '<ol class="episodes"' + (bdrop() ? ' style="--bd:url(\'' + esc(bdrop()) + '\')"' : "") + ">" + list.map((v) => {
            const w = FL.store.episodeWatched(show.id, v.s, v.e);
            const title = v.title && !/^episode \d+$/i.test(v.title) && v.title !== "TBD" ? v.title : "Episode " + v.e;
            return '<li class="ep' + (w ? " is-watched" : "") + (v.aired ? "" : " is-upcoming") + '" data-ep="' + epKey(v) + '">' +
              '<a class="ep-thumb" ' + (v.aired ? 'href="#/watch/' + encodeURIComponent(show.id) + "?s=" + v.s + "&e=" + v.e + '"' : 'aria-disabled="true"') + ' tabindex="-1">' +
                '<span class="ep-fallback" aria-hidden="true"><b>' + (v.s ? "S" + v.s + " · " : "") + "E" + v.e + "</b></span>" +
                (v.thumb ? '<img src="' + esc(v.thumb) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">' : "") +
                (v.aired ? '<span class="ep-play">' + icon("play") + "</span>" : "") + "</a>" +
              '<div class="ep-main"><div class="ep-title"><span class="ep-num">E' + v.e + "</span>" + esc(title) + "</div>" +
                '<div class="ep-date">' + (v.date ? (v.date > today ? "Airs " : "") + fmtDate(v.date) : "Date to be announced") + "</div>" +
                (v.overview ? '<p class="ep-overview">' + esc(FL.util.prose(v.overview)) + "</p>" : "") + "</div>" +
              (v.aired ? '<button type="button" class="qa' + (w ? " on" : "") + '" data-sa="ep" aria-pressed="' + w + '" aria-label="' + (w ? "Watched" : "Mark watched") + '">' + icon("check") + "</button>" : "") +
              "</li>";
          }).join("") + "</ol>";
      }

      function seasonsNav() {
        const order = data.seasons.filter((x) => x > 0).concat(data.seasons.indexOf(0) !== -1 ? [0] : []);
        return FL.ui.segmented("season", order.map((x) => [x, x === 0 ? "Specials" : "S" + x]), season);
      }

      /* Cinemeta's cast first, then the rest Wikidata lists (best known first), with the parts they play. */
      let wdCast = null;
      function castNames() {
        const out = [];
        const seen = new Set();
        const norm = FL.util.normalize;
        const cast = (wdCast || []).filter((x) => x.role === "Cast");
        const played = new Map(cast.filter((x) => x.character).map((x) => [norm(x.name), x.character]));
        const push = (n, ch) => { if (!seen.has(norm(n))) { seen.add(norm(n)); out.push([n, ch || ""]); } };
        data.cast.slice(0, 10).forEach((n) => push(n, played.get(norm(n))));
        cast.sort((a, b) => b.links - a.links).forEach((x) => { if (out.length < 24) push(x.name, x.character); });
        return out;
      }
      function castHtml() {
        const list = castNames();
        return list.length ? '<h2 class="label">Cast &amp; hosts</h2><div class="people">' + list.map(([n, ch]) => { const part = ch.split(/,|\s[–—-]\s|\(/)[0].trim(); return FL.people.chip(n, part ? "as " + part : ""); }).join("") + "</div>" : "";
      }
      function paintCast() {
        const box = $(".show-cast", el);
        if (!box) return;
        box.innerHTML = castHtml();
        FL.people.photos(castNames().map((x) => x[0])).then(() => { if (alive) FL.people.paint(box); });
      }

      function render() {
        el.innerHTML = '<article class="film show">' + header() +
          '<div class="container film-body">' +
            '<div class="film-main">' +
              (show.desc ? '<section><h2 class="label">About</h2><p class="lede">' + esc(FL.util.prose(show.desc)) + "</p></section>" : "") +
              '<section class="show-cast">' + castHtml() + "</section>" +
              '<section class="show-season"><div class="season-nav">' + seasonsNav() + '</div><div data-episodes>' + episodes() + "</div></section>" +
            "</div>" +
            '<aside class="film-record panel" aria-label="Your record"><h2 class="h3">Your rating</h2>' + ratingWidget(show) +
              '<p class="ext-links"><a class="link" target="_blank" rel="noopener noreferrer" href="https://www.imdb.com/title/' + esc(show.imdbId || show.id) + '/">IMDb ↗</a>' +
                '<a class="link" target="_blank" rel="noopener noreferrer" href="' + FL.ui.whereToWatch(show) + '">Where to watch ↗</a></p>' +
            "</aside>" +
          "</div></article>";
        const bg = data.backdrop || FL.meta.backdrop(show);
        if (bg) {
          const box = $(".film-backdrop", el);
          const img = new Image();
          img.alt = "";
          img.referrerPolicy = "no-referrer";
          img.onload = () => box.classList.add("is-in");
          img.src = bg;
          box.appendChild(img);
        }
        FL.ui.watchPosters(el);
        paintCast();
        if (!wdCast) {
          wdCast = [];
          FL.people.credits(show.imdbId || show.id).then((list) => { if (alive && list.length) { wdCast = list; paintCast(); } });
        }
        const on = el.querySelector(".season-nav .is-on");
        if (on) on.scrollIntoView({ inline: "center", block: "nearest" });
      }

      function refreshEpisodes() {
        const box = $("[data-episodes]", el);
        if (box) box.innerHTML = episodes();
      }

      function load() {
        FL.remote.show(id).then((d) => {
          if (!alive) return;
          data = d;
          show = d.film;
          FL.remote.touch(show);
          document.title = show.title + " · Iris";
          const up = nextUp(show, data);
          const latest = data.seasons.filter((x) => x > 0 && data.episodes.some((v) => v.s === x && v.aired));
          season = up ? up.s : latest.length ? latest[latest.length - 1] : data.seasons[0];
          render();
          if (up) FL.util.idle(() => FL.player.prefetch(show, { s: up.s, e: up.e }));
        }).catch(() => {
          if (!alive) return;
          el.innerHTML = '<div class="container page">' + FL.ui.empty("This show couldn’t be loaded.", "Check your connection and try again.", '<button type="button" class="btn" data-sa="retry">Try again</button>') + "</div>";
        });
      }

      function onClick(e) {
        const b = e.target.closest("[data-sa], [data-seg=season]");
        if (!b) return;
        if (b.dataset.seg === "season") {
          season = +b.dataset.value;
          $$(".season-nav .seg-btn", el).forEach((x) => { x.classList.toggle("is-on", x === b); x.setAttribute("aria-checked", x === b); });
          refreshEpisodes();
          return;
        }
        const a = b.dataset.sa;
        if (a === "retry") { load(); return; }
        if (!show) return;
        if (a === "list") FL.store.toggleList(show);
        else if (a === "fav") FL.store.toggleFav(show);
        else if (a === "ep") {
          const [s, ep] = b.closest("[data-ep]").dataset.ep.split(":").map(Number);
          FL.store.toggleEpisode(show, s, ep);
        } else if (a === "season") {
          const aired = data.episodes.filter((v) => v.s === season && v.aired);
          const allWatched = aired.every((v) => FL.store.episodeWatched(show.id, v.s, v.e));
          FL.store.setEpisodes(show, aired.map((v) => [v.s, v.e]), !allWatched);
        }
      }

      el.addEventListener("click", onClick);
      if (!show && /^tt\d+$/.test(id)) FL.remote.byId(id, "series").then((f) => { show = f; });
      load();

      return {
        update(detail) {
          if (!data || (detail.id && detail.id !== show.id) || detail.kind === "progress") return;
          const y = window.scrollY;
          const eps = $("[data-episodes]", el);
          const hero = el.querySelector(".film-hero");
          if (hero) {
            const tmp = document.createElement("div");
            tmp.innerHTML = header();
            hero.replaceWith(tmp.querySelector(".film-hero"));
          }
          if (eps) refreshEpisodes();
          FL.ui.watchPosters(el);
          window.scrollTo(0, y);
        },
        destroy() { alive = false; el.removeEventListener("click", onClick); },
      };
    },
  };
})(window.FL = window.FL || {});
