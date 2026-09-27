/* Iris — Browse & search: every filter in one bar, results rendered in pages as you scroll. */
(function (FL) {
  "use strict";

  const { esc, debounce, $ } = FL.util;
  const { icon, card, row, segmented } = FL.ui;

  const PAGE = 60;
  const restore = {}; // hash -> { y, count } so Back lands where you left off

  const CATEGORIES = [["all", "All"]].concat(FL.catalogue.LANGS.map((l) => [l.id, l.label]), [["Dubbed", "Hindi dubbed"], ["Global", "World"], ["Shows", "Shows"]]);
  const SORT_LABELS = { relevance: "Best match", popular: "Most popular", rating: "IMDb rating", newest: "Newest", oldest: "Oldest", title: "Title A–Z" };

  function readState(query) {
    const saved = FL.store.prefs().browse;
    const s = Object.assign({}, saved, { q: "" });
    if (query && [...query.keys()].length) {
      ["q", "lang", "year", "genre", "region", "status", "sort", "view"].forEach((k) => { if (query.has(k)) s[k] = query.get(k); });
      if (query.has("min")) s.minRating = +query.get("min") || 0;
      if (!query.has("lang")) s.lang = "all";
      if (!query.has("year")) s.year = "all";
      if (!query.has("genre")) s.genre = "";
      if (!query.has("region")) s.region = "";
      if (!query.has("min")) s.minRating = 0;
      if (!query.has("status")) s.status = "all";
    }
    if (s.q && !query.has("sort")) s.sort = "relevance";
    if (!s.q && s.sort === "relevance") s.sort = "popular";
    return s;
  }

  function toQuery(s) {
    const p = new URLSearchParams();
    if (s.q) p.set("q", s.q);
    if (s.lang && s.lang !== "all") p.set("lang", s.lang);
    if (s.year && s.year !== "all") p.set("year", s.year);
    if (s.genre) p.set("genre", s.genre);
    if (s.region) p.set("region", s.region);
    if (s.minRating) p.set("min", s.minRating);
    if (s.status && s.status !== "all") p.set("status", s.status);
    if (s.sort && s.sort !== (s.q ? "relevance" : "popular")) p.set("sort", s.sort);
    const str = p.toString();
    return "#/browse" + (str ? "?" + str : "");
  }

  function yearOptions(value) {
    const max = FL.catalogue.yearRange[1];
    const min = 1970; // before the bundle starts, years are filled from the web
    let html = '<option value="all">Any year</option><optgroup label="Decades">';
    for (let d = Math.floor(max / 10) * 10; d >= Math.floor(min / 10) * 10; d -= 10) {
      html += '<option value="' + d + 's"' + (value === d + "s" ? " selected" : "") + ">" + d + "s</option>";
    }
    html += '</optgroup><optgroup label="Years">';
    for (let y = max; y >= min; y--) html += '<option value="' + y + '"' + (String(value) === String(y) ? " selected" : "") + ">" + y + "</option>";
    return html + "</optgroup>";
  }

  function select(name, label, optionsHtml) {
    return '<label class="select"><span class="sr-only">' + label + '</span><select data-f="' + name + '">' + optionsHtml + "</select>" + icon("chevron-down") + "</label>";
  }

  function opts(list, value, anyLabel) {
    return (anyLabel ? '<option value="">' + anyLabel + "</option>" : "") +
      list.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(v) === String(value) ? " selected" : "") + ">" + esc(l) + "</option>").join("");
  }

  const activeCount = (s) => ["year", "genre", "region", "minRating", "status"].filter((k) => s[k] && s[k] !== "all" && s[k] !== "0").length;

  function controls(s) {
    const genres = FL.catalogue.genresFor(s.lang).map((g) => [g, g]);
    const sorts = (s.q ? ["relevance"] : []).concat(["popular", "rating", "newest", "oldest", "title"]).map((k) => [k, SORT_LABELS[k]]);
    return '<div class="filters">' +
      '<div class="search-field" data-page-search><span class="search-field-icon">' + icon("search") + '</span>' +
        '<input type="search" data-f="q" value="' + esc(s.q) + '" placeholder="Search ' + (Math.floor(FL.catalogue.all().length / 1000) * 1000).toLocaleString() + '+ titles, genres, years…" aria-label="Search films" autocomplete="off" spellcheck="false">' +
        '<kbd class="hide-sm">/</kbd></div>' + recentChips(s) +
      '<div class="filter-row filter-main">' + segmented("lang", CATEGORIES, s.lang) +
        '<button type="button" class="icon-btn filters-toggle" data-ftoggle aria-expanded="false" aria-label="More filters">' + icon("sliders") +
        (activeCount(s) ? "<b>" + activeCount(s) + "</b>" : "") + "</button></div>" +
      '<div class="filter-row filter-more">' +
        select("year", "Year", yearOptions(s.year)) +
        select("genre", "Genre", opts(genres, s.genre, "Any genre")) +
        (s.lang === "OtherIndian" ? select("region", "Language", opts(FL.catalogue.regions().map((r) => [r, r]), s.region, "Any language")) : "") +
        select("minRating", "Minimum IMDb rating", opts([[0, "Any rating"], [6, "IMDb 6+"], [7, "IMDb 7+"], [8, "IMDb 8+"]], s.minRating)) +
        select("status", "Watch status", opts([["all", "All films"], ["unwatched", "Unwatched"], ["watchlist", "In Watch later"], ["watched", "Watched"]], s.status)) +
        '<span class="grow"></span>' +
        select("sort", "Sort", opts(sorts, s.sort)) +
        segmented("view", [["grid", icon("grid") + '<span class="sr-only">Grid</span>'], ["list", icon("list") + '<span class="sr-only">List</span>']], s.view) +
      "</div></div>";
  }

  function recentChips(s) {
    const list = FL.store.prefs().searches || [];
    if (s.q || !list.length) return "";
    return '<div class="recent-searches"><span class="label">Recent</span>' +
      list.map((q) => '<button type="button" class="chip" data-recent="' + esc(q) + '">' + icon("history") + esc(q) + "</button>").join("") +
      '<button type="button" class="link small" data-recent-clear>Clear</button></div>';
  }

  FL.views = FL.views || {};
  FL.views.browse = {
    title: "Browse",
    mount(el, params, query) {
      const s = readState(query);
      let items = [];
      let shown = 0;
      let currentKey = location.hash;
      const back = restore[currentKey];

      let corrected = "";
      let alive = true;
      let webToken = 0;
      el.innerHTML = '<div class="container page">' +
        '<header class="page-head"><div><h1 class="h1">Browse</h1><p class="sub" data-count></p></div></header>' +
        controls(s) +
        '<div class="did-you-mean" data-dym hidden></div>' +
        '<div data-results></div><div class="sentinel" aria-hidden="true"></div><div class="year-more" data-web></div></div>';

      const results = $("[data-results]", el);
      const count = $("[data-count]", el);
      const sentinel = $(".sentinel", el);

      function persist() {
        const { q, ...rest } = s;
        FL.store.patchPref("browse", Object.assign({}, rest, { sort: rest.sort === "relevance" ? FL.store.prefs().browse.sort : rest.sort }));
        const next = toQuery(s);
        if (next !== location.hash) history.replaceState(null, "", next);
        currentKey = next;
      }

      function describe() {
        const n = items.length.toLocaleString();
        const noun = s.lang === "Shows" ? ["show", "shows"] : ["film", "films"];
        if (s.q) return n + (items.length === 1 ? " match" : " matches") + " for “" + esc(corrected || s.q) + "”";
        return n + " " + (items.length === 1 ? noun[0] : noun[1]);
      }

      /* Nothing found? Try the autocorrected query and say so, Google-style. */
      function compute() {
        corrected = "";
        let list = FL.catalogue.browse(s);
        if (!list.length && s.q) {
          const fix = FL.catalogue.suggest(s.q);
          if (fix) {
            const alt = FL.catalogue.browse(Object.assign({}, s, { q: fix }));
            if (alt.length) { corrected = fix; list = alt; }
          }
        }
        const dym = $("[data-dym]", el);
        dym.hidden = !corrected;
        if (corrected) dym.innerHTML = "Showing results for <strong>" + esc(corrected) + '</strong>. <button type="button" class="link" data-exact>Search for “' + esc(s.q) + "” instead</button>";
        return list;
      }

      /* Titles the bundle doesn't have come from the web; they're appended as they arrive. */
      function searchWeb() {
        const web = $("[data-web]", el);
        const q = s.q;
        if (!q || q.length < 2) { web.innerHTML = ""; return; }
        const token = ++webToken;
        web.innerHTML = FL.ui.loader(22) + "<span>Searching everywhere…</span>";
        FL.remote.search(corrected || q).then(() => {
          if (token !== webToken || !alive) return;
          web.innerHTML = "";
          const before = new Set(items.map((f) => f.id));
          const next = compute();
          const fresh = next.filter((f) => !before.has(f.id));
          if (!fresh.length) return;
          if (!items.length) { run(); return; }
          items = items.concat(fresh);
          count.innerHTML = describe();
          if (shown >= items.length - fresh.length) more(PAGE);
        });
      }

      const rememberSearch = debounce(() => { if (s.q && items.length) FL.store.pushSearch(s.q); }, 1800);

      /* The bundle starts in 1990: picking an earlier year (or decade) pulls that year's films from the web and
         Wikipedia, and the results fill in as they arrive. */
      let oldKey = "";
      let oldToken = 0;
      let oldBusy = false;
      function fillOld() {
        const key = s.year + "|" + s.lang;
        if (key === oldKey) return;
        oldKey = key;
        const m = /^(\d{4})s$/.exec(s.year || "");
        const years = (m ? Array.from({ length: 10 }, (_, i) => +m[1] + i) : s.year && s.year !== "all" ? [+s.year] : []).filter((y) => y >= 1970 && y < 1990);
        if (!years.length) return;
        const tok = ++oldToken;
        oldBusy = true;
        const web = $("[data-web]", el);
        web.innerHTML = FL.ui.loader(22) + "<span>Finding films from " + (m ? s.year : years[0]) + "…</span>";
        const jobs = [];
        years.forEach((y) => {
          jobs.push(FL.remote.yearPage(y, 0));
          if (!m) jobs.push(FL.remote.yearPage(y, 1));
          ["Hindi", "OtherIndian", "English"].forEach((l) => {
            if ((s.lang === "all" && (!m || l === "Hindi")) || s.lang === l) jobs.push(FL.remote.wikiYear(l, y));
          });
        });
        Promise.all(jobs).then(() => {
          if (tok !== oldToken || !alive) return;
          oldBusy = false;
          web.innerHTML = "";
          run(Math.max(PAGE, shown));
        });
      }

      function run(keepCount) {
        fillOld();
        items = compute();
        count.innerHTML = describe();
        shown = 0;
        results.className = s.view === "list" ? "rows" : "grid";
        results.innerHTML = "";
        if (!items.length) {
          results.className = "";
          if (oldBusy) { results.innerHTML = ""; return; }
          results.innerHTML = FL.ui.empty(
            s.q ? "Nothing matches “" + esc(s.q) + "”." : "No films match these filters.",
            s.q ? "Try fewer words, a different spelling, or clear the filters." : "Loosen a filter to see more.",
            '<button type="button" class="btn btn-ghost" data-clear>Clear filters</button>'
          );
          return;
        }
        more(keepCount || PAGE);
      }

      function more(n) {
        const slice = items.slice(shown, shown + n);
        shown += slice.length;
        const html = s.view === "list" ? slice.map((f) => row(f)).join("") : slice.map((f) => card(f)).join("");
        results.insertAdjacentHTML("beforeend", html);
        FL.ui.watchPosters(results);
        sentinel.hidden = shown >= items.length;
      }

      const io = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && shown < items.length) more(PAGE);
      }, { rootMargin: "1200px 0px" });
      io.observe(sentinel);

      const onSearch = debounce(() => {
        const prevQ = s.q;
        s.q = $('[data-f="q"]', el).value.trim();
        if (!!prevQ !== !!s.q) {
          s.sort = s.q ? "relevance" : FL.store.prefs().browse.sort || "popular";
          const sortSel = $('[data-f="sort"]', el);
          sortSel.innerHTML = opts((s.q ? ["relevance"] : []).concat(["popular", "rating", "newest", "oldest", "title"]).map((k) => [k, SORT_LABELS[k]]), s.sort);
        }
        persist();
        run();
        searchWeb();
        rememberSearch();
      }, 120);

      function onInput(e) {
        if (e.target.matches('[data-f="q"]')) onSearch();
      }

      function onChange(e) {
        const f = e.target.dataset.f;
        if (!f || f === "q") return;
        s[f] = f === "minRating" ? +e.target.value : e.target.value;
        persist();
        run();
      }

      function onClick(e) {
        const tog = e.target.closest("[data-ftoggle]");
        if (tog) {
          const box = tog.closest(".filters");
          const open = !box.classList.contains("is-open");
          box.classList.toggle("is-open", open);
          tog.setAttribute("aria-expanded", open);
          return;
        }
        const seg = e.target.closest("[data-seg]");
        if (seg) {
          const name = seg.dataset.seg;
          s[name] = seg.dataset.value;
          if (name === "lang") {
            s.genre = FL.catalogue.genresFor(s.lang).indexOf(s.genre) === -1 ? "" : s.genre;
            s.region = "";
            const box = $(".filters", el);
            const q = $('[data-f="q"]', el);
            const hadFocus = document.activeElement === q;
            box.outerHTML = controls(s);
            if (FL.app && FL.app.watchSearch) FL.app.watchSearch();
            if (hadFocus) $('[data-f="q"]', el).focus();
          } else {
            seg.parentNode.querySelectorAll(".seg-btn").forEach((b) => {
              const on = b === seg;
              b.classList.toggle("is-on", on);
              b.setAttribute("aria-checked", on);
            });
          }
          persist();
          run();
          return;
        }
        const recent = e.target.closest("[data-recent]");
        if (recent) {
          const input = $('[data-f="q"]', el);
          input.value = recent.dataset.recent;
          onSearch();
          return;
        }
        if (e.target.closest("[data-recent-clear]")) {
          FL.store.clearSearches();
          const chips = $(".recent-searches", el);
          if (chips) chips.remove();
          return;
        }
        if (e.target.closest("[data-exact]")) {
          corrected = "";
          $("[data-dym]", el).hidden = true;
          items = FL.catalogue.browse(s);
          count.innerHTML = describe();
          results.innerHTML = "";
          shown = 0;
          if (!items.length) results.innerHTML = FL.ui.empty("Nothing matches “" + esc(s.q) + "”.", "");
          else more(PAGE);
          return;
        }
        if (e.target.closest("[data-clear]")) {
          Object.assign(s, { q: "", lang: "all", year: "all", genre: "", region: "", minRating: 0, status: "all", sort: "popular" });
          $(".filters", el).outerHTML = controls(s);
            if (FL.app && FL.app.watchSearch) FL.app.watchSearch();
          persist();
          run();
        }
      }

      el.addEventListener("input", onInput);
      el.addEventListener("change", onChange);
      el.addEventListener("click", onClick);

      run(back ? Math.max(PAGE, back.count) : 0);
      // Vega's catalogue joins a moment after start: when it lands, the list redraws in place.
      FL.remote.loadVega().then((n) => {
        if (!alive || !n) return;
        const y = window.scrollY;
        run(shown);
        window.scrollTo(0, y);
      });
      if (back) window.scrollTo(0, back.y); // synchronous, so page transitions morph to the right place
      else if (s.q && query.has("focus")) $('[data-f="q"]', el).focus();
      if (s.q) searchWeb();

      return {
        update(detail) {
          // Status filters depend on the library; everything else is refreshed card-by-card.
          if (s.status !== "all" && detail.kind !== "progress") {
            const y = window.scrollY;
            run(shown);
            window.scrollTo(0, y);
          }
        },
        focusSearch() {
          const q = $('[data-f="q"]', el);
          q.focus();
          q.select();
        },
        destroy() {
          alive = false;
          restore[currentKey] = { y: window.scrollY, count: shown };
          io.disconnect();
          onSearch.cancel();
          rememberSearch.cancel();
          webToken++;
          el.removeEventListener("input", onInput);
          el.removeEventListener("change", onChange);
          el.removeEventListener("click", onClick);
        },
      };
    },
  };
})(window.FL = window.FL || {});
