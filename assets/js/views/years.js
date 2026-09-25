/* Iris — Years: go through cinema one year at a time and tick off what you've seen.
   Each year merges the bundled vault, the web's most-watched list for that year (loaded as you scroll),
   and Wikipedia's film lists for Indian years the vault doesn't cover. */
(function (FL) {
  "use strict";

  const { esc, $, plural } = FL.util;
  const { icon, card, row, segmented } = FL.ui;

  const FIRST = 1970;
  const PAGE = 60;
  const WEB_PAGES = 6;
  const LANGS = [["all", "All"], ["Hindi", "Hindi"], ["English", "English"], ["OtherIndian", "Regional"], ["Superhero", "Marvel & DC"], ["Global", "World"]];
  const SHOW = [["all", "All"], ["unwatched", "To watch"], ["watched", "Watched"]];
  const SORT = [["popular", "Most popular"], ["rating", "IMDb rating"], ["title", "Title A–Z"]];

  const lastYear = () => new Date().getFullYear() + 1;

  function langTest(lang) {
    if (lang === "Superhero") return (f) => !!f.universe;
    if (!lang || lang === "all") return () => true;
    return (f) => f.lang === lang;
  }

  /* One popularity scale across bundled, Wikipedia and web entries. Web popularity is nudged by rating so
     briefly-trending low-rated titles don't outrank the year's classics. */
  function score(f) {
    if (f.votes) return Math.log10(f.votes + 1) * 14;
    return (f.pop || 0) + (f.rating ? (f.rating - 6.5) * 2.5 : 0);
  }
  /* The bundled vault and the web rank on different scales, and Hollywood out-votes every other cinema, so each
     source × language is ranked on its own and the groups are interleaved by relative position: every group's #1
     leads, then every #2, and so on — the year's Hindi, English, regional and world hits all surface together. */
  function rankPopular(list) {
    const by = (a, b) => score(b) - score(a) || a.title.localeCompare(b.title);
    const groups = new Map();
    list.forEach((f) => {
      const k = (f.remote ? "w:" : "l:") + f.lang;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(f);
    });
    const pos = new Map();
    groups.forEach((g, k) => {
      const tie = k[0] === "w" ? 1e-6 : 0;
      g.sort(by).forEach((f, i) => pos.set(f, (i + 0.5) / g.length + tie));
    });
    return list.sort((a, b) => pos.get(a) - pos.get(b) || score(b) - score(a));
  }
  const SORTS = {
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || score(b) - score(a),
    title: (a, b) => a.title.localeCompare(b.title),
  };

  let countsCache = { v: -1, map: {} };
  function watchedByYear() {
    if (countsCache.v === FL.store.version()) return countsCache.map;
    const map = {};
    FL.store.watched().forEach((e) => {
      const f = FL.catalogue.get(e.id);
      const y = (f && f.year) || e.year;
      if (y) map[y] = (map[y] || 0) + 1;
    });
    countsCache = { v: FL.store.version(), map };
    return map;
  }

  function strip(year) {
    const counts = watchedByYear();
    const max = Math.max(1, ...Object.values(counts));
    let html = "";
    for (let y = lastYear(); y >= FIRST; y--) {
      const n = counts[y] || 0;
      html += '<a class="yr' + (y === year ? " is-on" : "") + '" href="#/years/' + y + '" data-year="' + y + '"' + (y === year ? ' aria-current="page"' : "") +
        (n ? ' title="' + plural(n, "film") + ' watched"' : "") + ">" + y +
        (n ? '<i style="--w:' + Math.max(18, (n / max) * 100) + '%"></i>' : "") + "</a>";
    }
    return '<nav class="year-strip" aria-label="Years">' + html + "</nav>";
  }

  FL.views = FL.views || {};
  FL.views.years = {
    title: "Years",
    mount(el, params, query) {
      const saved = FL.store.prefs().years;
      const year = Math.min(lastYear(), Math.max(FIRST, +(params[0] || 0) || new Date().getFullYear()));
      const s = {
        lang: query.get("lang") || saved.lang || "all",
        show: query.get("show") || saved.show || "all",
        sort: saved.sort || "popular",
        view: saved.view || "grid",
      };
      let items = [];
      let shown = 0;
      let webPage = 0;
      let webBusy = false;
      let webDone = false;
      let alive = true;

      el.innerHTML = '<div class="container page years">' +
        '<header class="page-head"><div><p class="eyebrow">Year by year</p><h1 class="display year-title">' + year + "</h1></div>" +
        '<div class="year-nav">' +
          (year > FIRST ? '<a class="btn btn-ghost" href="#/years/' + (year - 1) + '">' + icon("chevron-left") + (year - 1) + "</a>" : "") +
          (year < lastYear() ? '<a class="btn btn-ghost" href="#/years/' + (year + 1) + '">' + (year + 1) + icon("chevron-right") + "</a>" : "") +
        "</div></header>" +
        strip(year) +
        '<div class="filters years-filters"><div class="filter-row">' + segmented("ylang", LANGS, s.lang) + "</div>" +
        '<div class="filter-row">' + segmented("yshow", SHOW, s.show) + '<span class="grow"></span>' +
          '<label class="select"><span class="sr-only">Sort</span><select data-ysort>' + SORT.map(([v, l]) => '<option value="' + v + '"' + (v === s.sort ? " selected" : "") + ">" + l + "</option>").join("") + "</select>" + icon("chevron-down") + "</label>" +
          segmented("yview", [["grid", icon("grid") + '<span class="sr-only">Grid</span>'], ["list", icon("list") + '<span class="sr-only">List</span>']], s.view) +
        "</div></div>" +
        '<section class="year-summary" data-summary></section>' +
        '<div data-results></div><div class="sentinel" aria-hidden="true"></div>' +
        '<div class="year-more" data-more></div></div>';

      const results = $("[data-results]", el);
      const summary = $("[data-summary]", el);
      const more = $("[data-more]", el);
      const sentinel = $(".sentinel", el);

      requestAnimationFrame(() => {
        const on = el.querySelector(".yr.is-on");
        if (on) on.scrollIntoView({ inline: "center", block: "nearest" });
      });

      function all() {
        const t = langTest(s.lang);
        return FL.catalogue.films.filter((f) => f.type !== "series" && f.year === year && t(f));
      }

      function compute() {
        const list = all();
        let watched = 0;
        list.forEach((f) => { if (FL.store.state(f.id).watched) watched++; });
        const visible = list.filter((f) => {
          if (s.show === "all") return true;
          const w = FL.store.state(f.id).watched;
          return s.show === "watched" ? w : !w;
        });
        if (SORTS[s.sort]) visible.sort(SORTS[s.sort]);
        else rankPopular(visible);
        const pct = list.length ? Math.round((watched / list.length) * 100) : 0;
        summary.innerHTML = '<div class="year-count"><strong>' + watched.toLocaleString() + "</strong> of " + list.length.toLocaleString() + " watched <span class='muted'>· " + pct + "%</span></div>" +
          '<span class="meter"><i style="width:' + pct + '%"></i></span>';
        return visible;
      }

      function render(keep) {
        items = compute();
        const count = keep ? Math.max(PAGE, shown) : PAGE;
        shown = 0;
        results.className = s.view === "list" ? "rows" : "grid";
        results.innerHTML = "";
        if (!items.length && (webDone || webBusy)) {
          results.className = "";
          results.innerHTML = webBusy ? "" : FL.ui.empty(s.show === "watched" ? "Nothing watched from " + year + " yet." : "Nothing here yet.",
            s.show === "watched" ? "Tick films as you watch them — this year fills up." : "Try another language.");
        }
        append(count);
      }

      function append(n) {
        const slice = items.slice(shown, shown + n);
        shown += slice.length;
        results.insertAdjacentHTML("beforeend", slice.map((f) => (s.view === "list" ? row(f) : card(f))).join(""));
        FL.ui.watchPosters(results);
      }

      /* Web entries that arrive later are appended below what's already on screen, never reshuffled. */
      function merge() {
        const onScreen = new Set(Array.from(results.children).map((c) => c.dataset.id));
        const next = compute();
        if (window.scrollY < 300 && shown <= PAGE) { render(false); return; }
        const fresh = next.filter((f) => !onScreen.has(f.id));
        items = next.filter((f) => onScreen.has(f.id)).concat(fresh);
        results.insertAdjacentHTML("beforeend", fresh.slice(0, PAGE).map((f) => (s.view === "list" ? row(f) : card(f))).join(""));
        shown = onScreen.size + Math.min(PAGE, fresh.length);
        FL.ui.watchPosters(results);
      }

      function status(text, busy) {
        more.innerHTML = busy ? FL.ui.loader(24) + "<span>" + text + "</span>" : text ? "<span>" + text + "</span>" : "";
      }

      function loadWeb() {
        if (webBusy || webDone || !alive) return;
        webBusy = true;
        status("Finding more films from " + year + "…", true);
        // The first visit pulls three pages at once so "Most popular" has enough to rank; later pages load on scroll.
        const pages = webPage === 0 ? [0, 1, 2] : [webPage];
        const jobs = pages.map((p) => FL.remote.yearPage(year, p));
        if (webPage === 0 && year < 1990) {
          if (s.lang === "all" || s.lang === "Hindi") jobs.push(FL.remote.wikiYear("Hindi", year));
          if (s.lang === "OtherIndian") jobs.push(FL.remote.wikiYear("OtherIndian", year));
        }
        Promise.all(jobs).then((lists) => {
          if (!alive) return;
          webBusy = false;
          webPage += pages.length;
          if (!lists[pages.length - 1].length || webPage >= WEB_PAGES) webDone = true;
          status("", false);
          merge();
        });
      }

      const io = new IntersectionObserver((en) => {
        if (!en[0].isIntersecting) return;
        if (shown < items.length) append(PAGE);
        else loadWeb();
      }, { rootMargin: "1200px 0px" });
      io.observe(sentinel);

      function persist() {
        FL.store.patchPref("years", { lang: s.lang, show: s.show, sort: s.sort, view: s.view });
      }

      function onClick(e) {
        const seg = e.target.closest("[data-seg]");
        if (!seg) return;
        const name = seg.dataset.seg;
        const key = { ylang: "lang", yshow: "show", yview: "view" }[name];
        if (!key) return;
        s[key] = seg.dataset.value;
        seg.parentNode.querySelectorAll(".seg-btn").forEach((b) => { b.classList.toggle("is-on", b === seg); b.setAttribute("aria-checked", b === seg); });
        persist();
        if (key === "lang") { webDone = false; webPage = 0; } // pages already fetched come back from memory
        render(false);
        if (key === "lang") loadWeb();
      }
      function onChange(e) {
        if (!e.target.matches("[data-ysort]")) return;
        s.sort = e.target.value;
        persist();
        render(false);
      }
      el.addEventListener("click", onClick);
      el.addEventListener("change", onChange);

      render(false);
      loadWeb();

      return {
        update(detail) {
          if (detail.kind === "progress") return;
          const y = window.scrollY;
          if (s.show !== "all") { render(true); window.scrollTo(0, y); } else compute();
          const bar = el.querySelector(".year-strip");
          if (bar) { const x = bar.scrollLeft; bar.outerHTML = strip(year); el.querySelector(".year-strip").scrollLeft = x; }
        },
        key(k) {
          if (k === "arrowleft" && year > FIRST) { location.hash = "#/years/" + (year - 1); return true; }
          if (k === "arrowright" && year < lastYear()) { location.hash = "#/years/" + (year + 1); return true; }
          return false;
        },
        destroy() {
          alive = false;
          io.disconnect();
          el.removeEventListener("click", onClick);
          el.removeEventListener("change", onChange);
        },
      };
    },
  };
})(window.FL = window.FL || {});
