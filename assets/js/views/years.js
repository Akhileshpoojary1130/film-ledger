/* Iris — Years: go through cinema one year at a time and tick off what you've seen.
   The year is picked on a dial — old years to the left, new to the right, the chosen one in the centre.
   Turn it by scrolling over it, dragging, swiping or tapping a year; it snaps like a camera dial.
   Each year merges the bundled vault, the web's catalogue for that year (loaded as you scroll) and
   Wikipedia's film lists for Indian years the vault doesn't cover. */
(function (FL) {
  "use strict";

  const { esc, $, $$, plural } = FL.util;
  const { icon, card, row, segmented } = FL.ui;

  const FIRST = 1970;
  const PAGE = 60;
  const WEB_PAGES = 6;
  const LANGS = [["all", "All"], ["Hindi", "Hindi"], ["English", "English"], ["OtherIndian", "Regional"], ["Superhero", "Marvel & DC"], ["Global", "World"]];
  const SHOW = [["all", "All"], ["unwatched", "To watch"], ["must", "Must watch"], ["watched", "Watched"]];
  const ORDER = [["rating", "IMDb rating"], ["popular", "Most popular"], ["title", "Title A–Z"]];

  const lastYear = () => new Date().getFullYear() + 1;
  const clampYear = (y) => Math.min(lastYear(), Math.max(FIRST, y));

  function langTest(lang) {
    if (lang === "Superhero") return (f) => !!f.universe;
    if (!lang || lang === "all") return () => true;
    return (f) => f.lang === lang;
  }

  /* ---------- ordering ---------- */

  function score(f) {
    if (f.votes) return Math.log10(f.votes + 1) * 14;
    return (f.pop || 0) + (f.rating ? (f.rating - 6.5) * 2.5 : 0);
  }

  /* IMDb rating, high to low — in two tiers so a 9.4 from forty votes doesn't sit above Sholay: first the titles
     people actually watch (bundled films with real vote counts, and the better-known 40% of web titles), strictly by
     rating; then the rest, also by rating; unrated last. */
  function byRating(list) {
    const pct = (vals, p) => { vals.sort((a, b) => a - b); return vals.length ? vals[Math.floor(vals.length * p)] : 0; };
    const webCut = pct(list.filter((f) => f.remote && f.pop).map((f) => f.pop), 0.6);
    const votesCut = Math.max(1000, pct(list.filter((f) => !f.remote && f.votes).map((f) => f.votes), 0.5));
    // Recent bundled films have no vote count yet; their place in the bundle (box-office order) stands in for it.
    const rankCut = pct(list.filter((f) => !f.remote && !f.votes).map((f) => f.rank || 0), 0.4);
    const tier = (f) => {
      if (!f.rating) return 2;
      if (f.remote) return f.pop >= webCut ? 0 : 1;
      if (f.votes) return f.votes >= votesCut ? 0 : 1;
      return (f.rank || 0) <= rankCut ? 0 : 1;
    };
    list.sort((a, b) => tier(a) - tier(b) || (b.rating || 0) - (a.rating || 0) || score(b) - score(a));
    list.splitAt = list.findIndex((f) => tier(f) > 0);
    return list;
  }

  /* Popularity: the vault and the web rank on different scales, and Hollywood out-votes every other cinema, so
     each source × language is ranked on its own and the groups are interleaved by relative position. */
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

  function order(list, how) {
    if (how === "popular") return rankPopular(list);
    if (how === "title") return list.sort((a, b) => a.title.localeCompare(b.title));
    return byRating(list);
  }

  /* ---------- watched per year ---------- */

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

  function barHtml(y, counts, max) {
    const n = counts[y] || 0;
    return n ? '<i style="--w:' + Math.max(20, (n / max) * 100).toFixed(0) + '%"></i>' : "";
  }

  /* ---------- the dial ---------- */

  /* Four ways to pick a year, chosen in Settings: the camera dial (default), an iPhone-camera-style wheel of
     labels, a measuring-tape ruler, or Material filter chips. Same mechanics, different faces. */
  const PICKERS = ["dial", "wheel", "ruler", "chips"];
  const pickerStyle = () => (PICKERS.indexOf(FL.store.prefs().years.picker) !== -1 ? FL.store.prefs().years.picker : "dial");

  function dialHtml(year, style) {
    const counts = watchedByYear();
    const max = Math.max(1, ...Object.values(counts));
    let items = "";
    for (let y = FIRST; y <= lastYear(); y++) {
      const n = counts[y] || 0;
      items += '<a class="dial-yr' + (y % 10 === 0 ? " is-decade" : y % 5 === 0 ? " is-five" : "") + '" href="#/years/' + y + '" data-year="' + y + '" role="option" aria-selected="' + (y === year) + '"' +
        (n ? ' title="' + plural(n, "film") + ' watched"' : "") + "><b>" + y + "</b>" + barHtml(y, counts, max) + "</a>";
    }
    return '<div class="dial dial-' + style + '" data-dial>' +
      '<button type="button" class="dial-step" data-dstep="-1" aria-label="Previous year">' + icon("chevron-left") + "</button>" +
      '<div class="dial-window"><span class="dial-lens" aria-hidden="true"></span>' +
        (style === "ruler" ? '<span class="dial-tag" aria-hidden="true">' + year + "</span>" : "") +
        '<div class="dial-track" role="listbox" aria-label="Year: scroll, drag or tap to choose" tabindex="0">' +
          '<span class="dial-pad" aria-hidden="true"></span>' + items + '<span class="dial-pad" aria-hidden="true"></span>' +
        "</div></div>" +
      '<button type="button" class="dial-step" data-dstep="1" aria-label="Next year">' + icon("chevron-right") + "</button>" +
      "</div>";
  }

  FL.views = FL.views || {};
  FL.views.years = {
    title: "Years",
    mount(el, params, query) {
      const saved = FL.store.prefs().years;
      let year = clampYear(+(params[0] || 0) || new Date().getFullYear());
      const s = {
        lang: query.get("lang") || saved.lang || "all",
        show: query.get("show") || saved.show || "all",
        order: saved.order || "rating",
        view: saved.view || "grid",
      };
      let items = [];
      let shown = 0;
      let webPage = 0;
      let webBusy = false;
      let webDone = false;
      let alive = true;
      let token = 0;

      el.innerHTML = '<div class="container page years">' +
        '<header class="years-head"><p class="eyebrow">Year by year</p></header>' +
        dialHtml(year, pickerStyle()) +
        '<div class="filters years-filters">' +
          '<div class="filter-row filter-main">' + segmented("ylang", LANGS, s.lang) +
            '<button type="button" class="icon-btn filters-toggle" data-ftoggle aria-expanded="false" aria-label="Sort and filter">' + icon("sliders") + "</button></div>" +
          '<div class="filter-row filter-more">' + segmented("yshow", SHOW, s.show) + '<span class="grow"></span>' +
            '<label class="select"><span class="sr-only">Order</span><select data-yorder>' + ORDER.map(([v, l]) => '<option value="' + v + '"' + (v === s.order ? " selected" : "") + ">" + l + "</option>").join("") + "</select>" + icon("chevron-down") + "</label>" +
            segmented("yview", [["grid", icon("grid") + '<span class="sr-only">Grid</span>'], ["list", icon("list") + '<span class="sr-only">List</span>']], s.view) +
          "</div></div>" +
        '<section class="year-summary" data-summary></section>' +
        '<div data-results></div><div class="sentinel" aria-hidden="true"></div>' +
        '<div class="year-more" data-more></div></div>';

      const results = $("[data-results]", el);
      const summary = $("[data-summary]", el);
      const more = $("[data-more]", el);
      const sentinel = $(".sentinel", el);
      const filters = $(".years-filters", el);
      const track = $(".dial-track", el);
      const yrs = $$(".dial-yr", track);
      const tag = $(".dial-tag", el);
      document.title = year + " · Iris";

      /* ----- dial mechanics ----- */

      let W = 0;
      let target = year;
      let paintFrame = 0;
      let settleTimer = 0;
      let centre = -1;
      const measure = () => { W = yrs[0].getBoundingClientRect().width || 80; };
      const indexOf = (y) => y - FIRST;

      function centerOn(y, smooth) {
        target = clampYear(y);
        track.scrollTo({ left: indexOf(target) * W, behavior: smooth && !FL.theme.calm() ? "smooth" : "auto" });
        if (!smooth) paint();
      }

      /* Numbers sit on a drum: the centre one is large and faces you, the rest shrink, fade and turn away. */
      function paint() {
        paintFrame = 0;
        if (!W) return;
        const pos = track.scrollLeft / W;
        const from = Math.max(0, Math.floor(pos - 9));
        const to = Math.min(yrs.length - 1, Math.ceil(pos + 9));
        for (let i = from; i <= to; i++) {
          const d = i - pos;
          const a = Math.abs(d);
          const scale = a < 1 ? 1 + 0.95 * (1 - a) * (1 - a * 0.35) : Math.max(0.66, 1 - (a - 1) * 0.08);
          const st = yrs[i].style;
          st.setProperty("--s", scale.toFixed(3));
          st.setProperty("--o", Math.max(0.14, a < 1 ? 1 : 1 - (a - 1) * 0.17).toFixed(3));
          st.setProperty("--r", Math.max(-68, Math.min(68, d * -13)).toFixed(2) + "deg");
        }
        const c = Math.round(pos);
        if (c !== centre) {
          if (yrs[centre]) yrs[centre].classList.remove("is-center");
          centre = c;
          if (yrs[c]) yrs[c].classList.add("is-center");
          if (tag && yrs[c]) tag.textContent = yrs[c].dataset.year;
        }
      }
      const schedulePaint = () => { if (!paintFrame) paintFrame = requestAnimationFrame(paint); };

      function settle() {
        clearTimeout(settleTimer);
        if (dragging) return;
        const y = clampYear(FIRST + Math.round(track.scrollLeft / W));
        target = y;
        if (y !== year) setYear(y);
      }

      track.addEventListener("scroll", () => {
        schedulePaint();
        clearTimeout(settleTimer);
        settleTimer = setTimeout(settle, 160);
      }, { passive: true });
      if ("onscrollend" in window) track.addEventListener("scrollend", settle);

      function stepBy(n) {
        const next = clampYear(target + n);
        if (next === target) return false;
        centerOn(next, true);
        return true;
      }

      // A mouse wheel turns the dial one year per notch; at either end the page scrolls as usual.
      let wheelAcc = 0;
      track.addEventListener("wheel", (e) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // trackpad sideways: native scrolling
        const dir = Math.sign(e.deltaY);
        if (!dir || (dir < 0 && target === FIRST) || (dir > 0 && target === lastYear())) return;
        e.preventDefault();
        wheelAcc += e.deltaY * (e.deltaMode === 1 ? 40 : 1);
        const steps = Math.trunc(wheelAcc / 100);
        if (steps) { wheelAcc -= steps * 100; stepBy(steps); }
      }, { passive: false });

      // Drag with a mouse (touch already scrolls natively).
      let dragging = false;
      let dragMoved = false;
      let dragX = 0;
      let dragLeft = 0;
      track.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "mouse" || e.button !== 0) return;
        dragging = true;
        dragMoved = false;
        dragX = e.clientX;
        dragLeft = track.scrollLeft;
        track.classList.add("is-dragging");
      });
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", onDragEnd);
      function onDragMove(e) {
        if (!dragging) return;
        const dx = e.clientX - dragX;
        if (Math.abs(dx) > 4) dragMoved = true;
        track.scrollLeft = dragLeft - dx;
      }
      function onDragEnd() {
        if (!dragging) return;
        dragging = false;
        track.classList.remove("is-dragging");
        centerOn(FIRST + Math.round(track.scrollLeft / W), true);
      }

      track.addEventListener("click", (e) => {
        const a = e.target.closest(".dial-yr");
        if (!a) return;
        e.preventDefault();
        if (dragMoved) { dragMoved = false; return; }
        centerOn(+a.dataset.year, true);
      });
      track.addEventListener("keydown", (e) => {
        if (e.key === "Home") { e.preventDefault(); centerOn(FIRST, true); }
        if (e.key === "End") { e.preventDefault(); centerOn(lastYear(), true); }
      });

      const onResize = FL.util.debounce(() => { measure(); centerOn(target, false); }, 120);
      window.addEventListener("resize", onResize);
      requestAnimationFrame(() => { measure(); centerOn(year, false); });

      /* ----- results ----- */

      function all() {
        const t = langTest(s.lang);
        const seen = new Set();
        return FL.catalogue.films.filter((f) => {
          if (f.type === "series" || f.year !== year || !t(f)) return false;
          const key = FL.meta.idFor(f) || f.id; // a bundled film and its web twin resolve to one IMDb id
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      function compute() {
        const list = all();
        let watched = 0;
        list.forEach((f) => { if (FL.store.state(f.id).watched) watched++; });
        const visible = list.filter((f) => {
          if (s.show === "all") return true;
          if (s.show === "must") return FL.ui.mustWatch(f);
          const w = FL.store.state(f.id).watched;
          return s.show === "watched" ? w : !w;
        });
        order(visible, s.order);
        if (s.order !== "rating") visible.splitAt = -1;
        const pct = list.length ? Math.round((watched / list.length) * 100) : 0;
        summary.innerHTML = '<div class="year-count"><strong>' + watched.toLocaleString() + "</strong> of " + list.length.toLocaleString() + " watched in " + year +
          " <span class='muted'>· " + pct + "%</span></div>" + '<span class="meter"><i style="width:' + pct + '%"></i></span>';
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
            s.show === "watched" ? "Tick films as you watch them and this year fills up." : "Try another language.");
        }
        append(count);
      }

      function append(n) {
        const start = shown;
        const slice = items.slice(shown, shown + n);
        shown += slice.length;
        results.insertAdjacentHTML("beforeend", slice.map((f, i) =>
          (start + i === items.splitAt && start + i > 0 ? '<p class="grid-divider">Fewer IMDb votes, still by rating</p>' : "") +
          (s.view === "list" ? row(f) : card(f))).join(""));
        FL.ui.watchPosters(results);
      }

      /* Entries that arrive later are appended below what's on screen, never reshuffled — unless you're still at the top. */
      function merge() {
        const onScreen = new Set(Array.from(results.children).map((c) => c.dataset.id));
        const next = compute();
        if (window.scrollY < 420 && shown <= PAGE) { render(false); return; }
        const fresh = next.filter((f) => !onScreen.has(f.id));
        items = next.filter((f) => onScreen.has(f.id)).concat(fresh);
        results.insertAdjacentHTML("beforeend", fresh.slice(0, PAGE).map((f) => (s.view === "list" ? row(f) : card(f))).join(""));
        shown = onScreen.size + Math.min(PAGE, fresh.length);
        FL.ui.watchPosters(results);
      }

      function status(text, busy) {
        more.innerHTML = busy ? FL.ui.loader(24) + "<span>" + text + "</span>" : text ? "<span>" + text + "</span>" : "";
      }

      /* Titles without an IMDb rating yet (Wikipedia's classic lists, regional films) are looked up in the background,
         the most prominent first, so "IMDb rating" can place them. */
      const reorder = FL.util.debounce(() => { if (alive && window.scrollY < 420 && shown <= PAGE) render(false); }, 700);
      function rateMissing(list, tok) {
        const bundled = list.filter((f) => !f.rating && !f.remote).sort((a, b) => (a.rank || 0) - (b.rank || 0)).slice(0, 25);
        const web = list.filter((f) => !f.rating && f.remote).sort((a, b) => (b.pop || 0) - (a.pop || 0)).slice(0, 20);
        bundled.concat(web).forEach((f) => {
          FL.meta.details(f).then(() => { if (tok === token && f.rating) reorder(); });
        });
      }

      function loadWeb() {
        if (webBusy || webDone || !alive) return;
        webBusy = true;
        const tok = token;
        status("Finding more films from " + year + "…", true);
        // The first visit pulls three pages at once so the order has enough to go on; later pages load on scroll.
        const pages = webPage === 0 ? [0, 1, 2] : [webPage];
        const jobs = pages.map((p) => FL.remote.yearPage(year, p));
        // Before 1990 the bundle is empty, so Wikipedia's film lists fill each language in.
        if (webPage === 0 && year < 1990) {
          ["Hindi", "OtherIndian", "English"].forEach((l) => { if (s.lang === "all" || s.lang === l) jobs.push(FL.remote.wikiYear(l, year)); });
        }
        Promise.all(jobs).then((lists) => {
          if (!alive || tok !== token) return;
          webBusy = false;
          webPage += pages.length;
          if (!lists[pages.length - 1].length || webPage >= (year < 1990 ? 10 : WEB_PAGES)) webDone = true;
          status("", false);
          merge();
          rateMissing(all(), tok);
        });
      }

      function setYear(y) {
        if (y === year) return;
        year = y;
        token++;
        history.replaceState(null, "", "#/years/" + y);
        document.title = y + " · Iris";
        yrs.forEach((a) => a.setAttribute("aria-selected", +a.dataset.year === y));
        webPage = 0;
        webBusy = false;
        webDone = false;
        shown = 0;
        results.classList.add("is-swapping");
        render(false);
        requestAnimationFrame(() => results.classList.remove("is-swapping"));
        loadWeb();
      }

      const io = new IntersectionObserver((en) => {
        if (!en[0].isIntersecting) return;
        if (shown < items.length) append(PAGE);
        else loadWeb();
      }, { rootMargin: "1200px 0px" });
      io.observe(sentinel);

      function persist() {
        FL.store.patchPref("years", { lang: s.lang, show: s.show, order: s.order, view: s.view });
      }

      function onClick(e) {
        const step = e.target.closest("[data-dstep]");
        if (step) { stepBy(+step.dataset.dstep); return; }
        const tog = e.target.closest("[data-ftoggle]");
        if (tog) {
          const open = !filters.classList.contains("is-open");
          filters.classList.toggle("is-open", open);
          tog.setAttribute("aria-expanded", open);
          return;
        }
        const seg = e.target.closest("[data-seg]");
        if (!seg) return;
        const key = { ylang: "lang", yshow: "show", yview: "view" }[seg.dataset.seg];
        if (!key) return;
        s[key] = seg.dataset.value;
        seg.parentNode.querySelectorAll(".seg-btn").forEach((b) => { b.classList.toggle("is-on", b === seg); b.setAttribute("aria-checked", b === seg); });
        persist();
        if (key === "lang") { webDone = false; webPage = 0; } // pages already fetched come back from memory
        render(false);
        if (key === "lang") loadWeb();
      }
      function onChange(e) {
        if (!e.target.matches("[data-yorder]")) return;
        s.order = e.target.value;
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
          const counts = watchedByYear();
          const max = Math.max(1, ...Object.values(counts));
          yrs.forEach((a) => {
            const old = a.querySelector("i");
            const html = barHtml(+a.dataset.year, counts, max);
            if (old) old.remove();
            if (html) a.insertAdjacentHTML("beforeend", html);
          });
        },
        key(k) {
          if (k === "arrowleft") return stepBy(-1) || true;
          if (k === "arrowright") return stepBy(1) || true;
          return false;
        },
        destroy() {
          alive = false;
          io.disconnect();
          cancelAnimationFrame(paintFrame);
          clearTimeout(settleTimer);
          window.removeEventListener("resize", onResize);
          window.removeEventListener("pointermove", onDragMove);
          window.removeEventListener("pointerup", onDragEnd);
          el.removeEventListener("click", onClick);
          el.removeEventListener("change", onChange);
        },
      };
    },
  };
})(window.FL = window.FL || {});
