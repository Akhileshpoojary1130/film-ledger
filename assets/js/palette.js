/* Iris — command palette (⌘K), Surprise me, Settings (appearance, storage, backup), keyboard shortcuts. */
(function (FL) {
  "use strict";

  const { esc, normalize, $, $$, fmtRuntime, download, todayISO, plural } = FL.util;
  const { icon, art, modal, toast } = FL.ui;

  /* ---------- commands ---------- */

  const COMMANDS = [
    { id: "home", label: "Go to Home", icon: "home", keys: "g h", run: () => go("#/") },
    { id: "years", label: "Year by year", icon: "years", keys: "g y", run: () => go("#/years") },
    { id: "browse", label: "Browse everything", icon: "compass", keys: "g b", run: () => go("#/browse") },
    { id: "shows", label: "Shows: reality, talent & series", icon: "tv", keys: "g t", run: () => go("#/shows") },
    { id: "watchlist", label: "Open watchlist", icon: "bookmark", keys: "g w", run: () => go("#/library/watchlist") },
    { id: "library", label: "Open library", icon: "layers", keys: "g l", run: () => go("#/library/watched") },
    { id: "diary", label: "Open diary", icon: "calendar", keys: "g d", run: () => go("#/diary") },
    { id: "stats", label: "Open stats", icon: "chart", keys: "g s", run: () => go("#/stats") },
    { id: "collections", label: "Collections: series & universes", icon: "collections", run: () => go("#/collections") },
    { id: "match", label: "Movie night: compare Watch later with a friend", icon: "users", run: () => go("#/match") },
    { id: "move", label: "Relay: your library on every device (phone ↔ laptop)", icon: "devices", run: () => go("#/move") },
    { id: "pick", label: "Reel Spin: let Iris pick a film", icon: "shuffle", keys: "r", run: () => pick() },
    { id: "appearance", label: "Theme & colours", icon: "palette", run: () => settings("appearance") },
    { id: "settings", label: "Settings, storage & backup", icon: "sliders", run: () => settings() },
    { id: "export", label: "Export backup (.json)", icon: "download", run: () => exportJSON() },
    { id: "shortcuts", label: "Keyboard shortcuts", icon: "keyboard", keys: "?", run: () => shortcuts() },
  ];

  function go(hash) { location.hash = hash; }

  /* ---------- palette ---------- */

  let paletteOpen = null;

  function palette(initial) {
    if (paletteOpen) { $("input", paletteOpen.el).focus(); return; }
    const m = modal(
      '<div class="palette">' +
        '<div class="palette-input">' + icon("search") +
          '<input type="text" placeholder="Films, shows, or a command…" aria-label="Search films, shows and commands" autocomplete="off" spellcheck="false" autofocus role="combobox" aria-expanded="true" aria-controls="palette-list">' +
          '<span class="palette-busy" hidden>' + FL.ui.loader(18) + "</span><kbd>esc</kbd></div>" +
        '<div class="palette-list" id="palette-list" role="listbox"></div>' +
        '<footer class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>' + (isMac() ? "⌘" : "Ctrl") + "</kbd><kbd>↵</kbd> play</span><span><kbd>⇧</kbd><kbd>↵</kbd> watchlist</span></footer>" +
      "</div>",
      { cls: "modal-palette", label: "Search", noClose: true, onClose: () => { paletteOpen = null; } }
    );
    paletteOpen = m;
    const input = $("input", m.el);
    const list = $(".palette-list", m.el);
    const busy = $(".palette-busy", m.el);
    let items = [];
    let active = 0;
    let frame = 0;
    let webTimer = 0;
    let lastQ = "";
    const vegaHits = new Map(); // query -> Vega's films for it

    /* A Vega result as an Iris film: the one Iris already has (same title and year), else a web title made from
       Vega's name, year and poster — its page fills in from IMDb, and Play finds it on Vega's servers. */
    function vegaFilm(h) {
      const local = FL.catalogue.findLocal("", h.title, h.year);
      if (local) return local;
      return FL.catalogue.addRemote({
        id: "vega-" + h.post, type: "movie", title: h.title, year: h.year, genres: [], poster: h.poster || "",
        lang: h.lang || undefined, region: h.region || "", pop: 20,
      });
    }

    function filmItem(f, i) {
      const st = FL.store.state(f.id);
      const mark = st.watched ? icon("check", "i-ok") : st.episodes ? icon("tv", "i-ok") : st.listed ? icon("bookmark") : "";
      return '<div class="pal-item pal-film" role="option" id="pal-' + i + '" data-i="' + i + '">' +
        '<span class="pal-art">' + art(f) + "</span>" +
        '<span class="pal-main"><strong>' + esc(f.title) + "</strong><small>" + FL.ui.metaLine(f) + (f.rating ? " · ★ " + f.rating.toFixed(1) : "") + "</small></span>" +
        '<span class="pal-mark">' + mark + "</span></div>";
    }

    function cmdItem(c, i) {
      return '<div class="pal-item" role="option" id="pal-' + i + '" data-i="' + i + '"><span class="pal-icon">' + icon(c.icon) + '</span><span class="pal-main"><strong>' + esc(c.label) + "</strong></span>" +
        (c.keys ? '<span class="pal-keys">' + c.keys.split(" ").map((k) => "<kbd>" + k + "</kbd>").join("") + "</span>" : "") + "</div>";
    }

    function update() {
      const q = input.value.trim();
      items = [];
      let html = "";
      if (!q) {
        const searches = FL.store.prefs().searches || [];
        if (searches.length) {
          html += '<div class="pal-group">Recent searches</div>';
          searches.slice(0, 5).forEach((s) => {
            html += cmdItem({ label: s, icon: "history" }, items.length);
            items.push({ fill: s });
          });
        }
        const recent = (FL.store.prefs().recent || []).map((id) => FL.catalogue.get(id)).filter(Boolean).slice(0, 5);
        if (recent.length) {
          html += '<div class="pal-group">Recently opened</div>';
          recent.forEach((f) => { html += filmItem(f, items.length); items.push({ film: f }); });
        }
        html += '<div class="pal-group">Go to</div>';
        COMMANDS.forEach((c) => { html += cmdItem(c, items.length); items.push({ cmd: c }); });
      } else {
        let res = FL.catalogue.searchAll(q, { limit: 8 });
        let fixed = "";
        if (!res.items.length) {
          fixed = FL.catalogue.suggest(q);
          if (fixed) res = FL.catalogue.searchAll(fixed, { limit: 8 });
          if (!res.items.length) fixed = "";
        }
        if (res.items.length) {
          html += '<div class="pal-group">' + (fixed ? "Showing results for “" + esc(fixed) + "”" : "Titles") + "</div>";
          res.items.forEach((f) => { html += filmItem(f, items.length); items.push({ film: f }); });
        }
        if (res.total > res.items.length) {
          const target = fixed || q;
          const all = { cmd: { label: "See all " + res.total.toLocaleString() + " results for “" + target + "”", icon: "arrow-right", run: () => { FL.store.pushSearch(target); go("#/browse?q=" + encodeURIComponent(target)); } } };
          html += cmdItem(all.cmd, items.length);
          items.push(all);
        }
        // Vega's catalogue: new and dubbed releases Iris doesn't have yet, playable on Vega's servers.
        const shown = new Set(items.filter((x) => x.film).map((x) => x.film.id));
        const vega = (vegaHits.get(q) || []).map(vegaFilm).filter((f) => f && !shown.has(f.id)).slice(0, 5);
        if (vega.length) {
          html += '<div class="pal-group">On Vega<span class="pal-group-note">plays on Vega’s servers</span></div>';
          vega.forEach((f) => { html += filmItem(f, items.length); items.push({ film: f }); });
        }
        const nq = normalize(q);
        const cmds = COMMANDS.filter((c) => nq.split(" ").every((t) => normalize(c.label + " " + c.id).indexOf(t) !== -1));
        if (cmds.length) {
          html += '<div class="pal-group">Commands</div>';
          cmds.forEach((c) => { html += cmdItem(c, items.length); items.push({ cmd: c }); });
        }
        if (!items.length) html = '<div class="pal-empty">' + (busy.hidden ? "Nothing matches “" + esc(q) + "”." : "Looking further…") + "</div>";
      }
      const keepActive = q === lastQ ? active : 0;
      lastQ = q;
      list.innerHTML = html;
      FL.ui.watchPosters(list);
      active = Math.min(keepActive, Math.max(0, items.length - 1));
      highlight();
    }

    /* Web results land a moment later and slot into the same list. */
    function searchWeb() {
      clearTimeout(webTimer);
      const q = input.value.trim();
      if (q.length < 2) { busy.hidden = true; return; }
      webTimer = setTimeout(() => {
        busy.hidden = false;
        const fixed = FL.catalogue.searchAll(q).total ? "" : FL.catalogue.suggest(q);
        const web = FL.remote.search(fixed || q);
        const vega = FL.player.vegaSearch(q).then((hits) => { vegaHits.set(q, hits); });
        web.then(() => {
          if (input.value.trim() !== q || !paletteOpen) return;
          busy.hidden = true;
          update();
        });
        vega.then(() => { if (input.value.trim() === q && paletteOpen && vegaHits.get(q).length) update(); });
      }, 250);
    }

    function highlight() {
      $$(".pal-item", list).forEach((el) => el.classList.toggle("is-active", +el.dataset.i === active));
      const el = $('.pal-item[data-i="' + active + '"]', list);
      if (el) {
        el.scrollIntoView({ block: "nearest" });
        input.setAttribute("aria-activedescendant", el.id);
      }
    }

    function choose(i, mode) {
      const it = items[i];
      if (!it) return;
      if (it.fill) { input.value = it.fill; update(); searchWeb(); return; }
      const q = input.value.trim();
      m.close();
      if (it.cmd) { it.cmd.run(); return; }
      if (q) FL.store.pushSearch(q);
      const f = it.film;
      if (mode === "play") go(f.type === "series" ? FL.ui.hrefFor(f) : "#/watch/" + encodeURIComponent(f.id));
      else if (mode === "list") {
        const e = FL.store.toggleList(f);
        toast((e && e.listed ? "Saved to Watch later: " : "Removed from Watch later: ") + f.title);
      } else go(FL.ui.hrefFor(f));
    }

    input.addEventListener("input", () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
      searchWeb();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(items.length - 1, active + 1); highlight(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); highlight(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        choose(active, e.metaKey || e.ctrlKey ? "play" : e.shiftKey ? "list" : "open");
      }
    });
    list.addEventListener("mousemove", (e) => {
      const el = e.target.closest(".pal-item");
      if (el && +el.dataset.i !== active) { active = +el.dataset.i; highlight(); }
    });
    list.addEventListener("click", (e) => {
      const el = e.target.closest(".pal-item");
      if (el) choose(+el.dataset.i, e.metaKey || e.ctrlKey ? "play" : "open");
    });

    if (initial) input.value = initial;
    update();
    if (initial) searchWeb();
  }

  /* ---------- surprise me: a 3D ring of posters that spins and lands on the pick ---------- */

  const pickState = { source: "watchlist", lang: "", last: null, angle: 0 };
  const RING = 10;

  function pickPool() {
    const lang = pickState.lang;
    const fits = (f) => f && f.type !== "series" && (!lang || (lang === "Superhero" ? f.universe : f.lang === lang));
    if (pickState.source === "watchlist") return FL.store.watchlist().map((e) => FL.catalogue.get(e.id)).filter(fits);
    if (pickState.source === "foryou") return FL.catalogue.forYou(80).map((x) => x.film).filter(fits);
    return FL.catalogue.acclaimed({ lang, minVotes: 20000, minRating: 7.3, exclude: (f) => FL.store.state(f.id).watched }).slice(0, 400);
  }

  function details(film, label) {
    const m = FL.meta.cached(film);
    const facts = [FL.catalogue.yearLabel(film), FL.catalogue.filmLang(film), film.genres.slice(0, 2).join(", "), m && m.runtime ? fmtRuntime(m.runtime) : "", film.rating ? "IMDb " + film.rating.toFixed(1) : ""]
      .filter((x) => x && x !== "World").map(esc).join(" · ");
    const desc = FL.util.prose((m && m.desc) || film.desc || "");
    return '<p class="eyebrow">' + label + "</p>" +
      '<h2 class="display-sm">' + esc(film.title) + "</h2>" +
      '<p class="muted">' + facts + "</p>" +
      '<p class="pick-overview" data-pick-desc>' + esc(desc) + "</p>" +
      '<div class="btn-row"><a class="btn btn-primary" href="#/watch/' + encodeURIComponent(film.id) + '" data-close>' + icon("play") + "Play</a>" +
      '<a class="btn" href="#/film/' + encodeURIComponent(film.id) + '" data-close>Details</a>' +
      '<button type="button" class="btn btn-ghost" data-pick="again">' + icon("shuffle") + "Another <kbd>R</kbd></button></div>";
  }

  function pick() {
    if (!FL.store.watchlist().some((e) => e.type !== "series")) pickState.source = FL.store.watched().length ? "foryou" : "acclaimed";
    const m = modal('<div class="pick"><div class="pick-controls">' +
      FL.ui.segmented("psource", [["watchlist", "Watch later"], ["foryou", "For you"], ["acclaimed", "Acclaimed"]], pickState.source) +
      FL.ui.segmented("plang", [["", "Any"], ["Hindi", "Hindi"], ["English", "English"], ["OtherIndian", "Regional"], ["Superhero", "Marvel & DC"]], pickState.lang) +
      '</div><div class="pick-stage"><div class="pick-ring-wrap"><div class="pick-ring"></div></div><div class="pick-body" aria-live="polite"></div></div></div>', { cls: "modal-pick", label: "Reel Spin" });
    const ring = $(".pick-ring", m.el);
    const body = $(".pick-body", m.el);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const opened = performance.now();

    function roll() {
      const pool = pickPool();
      if (!pool.length) {
        ring.innerHTML = "";
        body.innerHTML = FL.ui.empty(pickState.source === "watchlist" ? "Nothing in Watch later matches." : "Nothing matches.", "Switch the source or language above.");
        body.classList.add("in");
        return;
      }
      let film;
      do { film = pool[Math.floor(Math.random() * pool.length)]; } while (pool.length > 1 && film === pickState.last);
      pickState.last = film;
      // One to two turns, not three: a lower top speed, so the posters glide instead of strobing past. The ring
      // lands on whichever slot holds the pick.
      pickState.angle -= reduced ? 0 : 360 + 36 * (3 + Math.floor(Math.random() * 5));
      const front = (((-pickState.angle / 36) % RING) + RING) % RING;
      // The pool repeats in order around the ring, so a short list never puts the same film on both sides of the pick.
      const cycle = [film].concat(pool.filter((f) => f !== film).sort(() => Math.random() - 0.5));
      const slots = [];
      for (let i = 0; i < RING; i++) slots[(front + i) % RING] = cycle[i % cycle.length];
      ring.innerHTML = slots.map((f, i) => '<div class="pick-face" style="--i:' + i + '">' + art(f, { size: "medium", eager: true }) + "</div>").join("");
      body.classList.remove("in");
      const label = { watchlist: "Tonight · from Watch later", foryou: "Tonight · picked for you", acclaimed: "Tonight · acclaimed, unwatched" }[pickState.source];
      ring.style.transition = reduced ? "none" : "";
      // Decode the posters first (briefly), so none is decoded mid-spin, and let the sheet finish opening, so the
      // spin is seen from its start (on a phone the sheet slides up for a moment).
      const decoded = Array.from(ring.querySelectorAll("img")).map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()));
      const settled = new Promise((r) => setTimeout(r, Math.max(0, 320 - (performance.now() - opened))));
      Promise.all([settled, Promise.race([Promise.all(decoded), new Promise((r) => setTimeout(r, 450))])]).then(() => {
        requestAnimationFrame(() => { ring.style.transform = "translateZ(calc(var(--ring-r) * -1)) rotateY(" + pickState.angle + "deg)"; });
      });
      setTimeout(() => {
        body.innerHTML = details(film, label);
        body.classList.add("in");
        if (!FL.meta.cached(film)) {
          FL.meta.details(film).then((meta) => {
            const d = $("[data-pick-desc]", body);
            if (d && meta && meta.desc && pickState.last === film && !d.textContent) d.textContent = FL.util.prose(meta.desc);
          });
        }
      }, reduced ? 0 : 1900);
    }

    m.el.addEventListener("click", (e) => {
      const seg = e.target.closest("[data-seg]");
      if (seg) {
        if (seg.dataset.seg === "psource") pickState.source = seg.dataset.value;
        else pickState.lang = seg.dataset.value;
        $$('[data-seg="' + seg.dataset.seg + '"]', m.el).forEach((b) => { b.classList.toggle("is-on", b === seg); b.setAttribute("aria-checked", b === seg); });
        roll();
      } else if (e.target.closest('[data-pick="again"]')) roll();
    });
    m.el.addEventListener("keydown", (e) => {
      if ((e.key === "r" || e.key === "R") && !FL.util.isTyping(e) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); roll(); }
    });
    roll();
  }

  /* ---------- settings ---------- */

  function exportJSON() {
    download("iris-backup-" + todayISO() + ".json", FL.store.exportJSON(), "application/json");
    toast("Backup downloaded.");
  }

  function kb(bytes) { return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB"; }

  function swatchStyle(pv) {
    return "--pv-bg:" + pv.bg + ";--pv-s:" + pv.s + ";--pv-text:" + pv.text + ";--pv-accent:" + pv.accent;
  }

  function appearanceHtml() {
    const a = FL.store.prefs().appearance;
    const T = FL.theme;
    const mode = T.mode();
    const current = T.accent();
    const DEF_BG = { cinema: "#0A0A0B", material: "#17151B", mac: "#1C1C1E", fluent: "#1C1C1C", oneui: "#000000", nothing: "#000000", pop: "#1B1A22", neon: "#07060F", retro: "#1A1320" };
    const styleDefault = (id) => ({ bg: DEF_BG[id] || "#0A0A0B", s: "#2A2A2E", text: "#F5F5F2", accent: T.THEMES[id].accent.dark });
    const themes = Object.keys(T.THEMES).map((id) => {
      const t = T.THEMES[id];
      return '<button type="button" class="theme-card theme-' + id + (a.theme === id ? " is-on" : "") + '" data-theme-pick="' + id + '" aria-pressed="' + (a.theme === id) + '">' +
        '<span class="theme-preview" aria-hidden="true"><i></i><i></i><i></i></span><strong>' + t.label + "</strong><small>" + t.note + "</small></button>";
    }).join("");
    const palettes = T.PALETTES.map((p) => {
      const pv = T.preview(p, mode) || styleDefault(T.id());
      const on = (a.palette || "default") === p.id;
      return '<button type="button" class="pal-swatch' + (on ? " is-on" : "") + '" data-palette="' + p.id + '" aria-pressed="' + on + '" title="' + esc(p.name) + '" style="' + swatchStyle(pv) + '">' +
        '<span class="pal-swatch-art" aria-hidden="true"><i></i></span><small>' + esc(p.name) + "</small></button>";
    }).join("");
    const swatches = '<button type="button" class="swatch swatch-auto' + (!a.accent ? " is-on" : "") + '" data-accent="" title="Palette default" aria-label="Palette default">' + icon("spark") + "</button>" +
      T.ACCENTS.map(([hex, name]) => '<button type="button" class="swatch' + (a.accent === hex ? " is-on" : "") + '" data-accent="' + hex + '" style="--sw:' + hex + '" title="' + name + '" aria-label="' + name + '"></button>').join("") +
      '<label class="swatch swatch-custom" title="Custom colour" style="--sw:' + current + '"><input type="color" value="' + current + '" data-accent-custom aria-label="Custom accent colour"></label>';
    const picker = FL.store.prefs().years.picker || "dial";
    // Most changed first: light or dark and the colour, then the style, then the finer glass and motion.
    return '<h4 class="set-sub"><span class="set-num">1</span>Colour</h4>' +
      '<div class="setting-row"><span>Mode</span>' + FL.ui.segmented("mode", [["dark", "Dark"], ["light", "Light"], ["system", "Auto"]], a.mode) + "</div>" +
      '<div class="setting-row"><span>Accent</span><div class="swatches">' + swatches + "</div></div>" +
      '<div class="pal-rail"><button type="button" class="icon-btn icon-btn-sm pal-arrow" data-palscroll="-1" aria-label="Previous palettes">' + icon("chevron-left") + "</button>" +
        '<div class="palette-row" data-palrow>' + palettes + "</div>" +
        '<button type="button" class="icon-btn icon-btn-sm pal-arrow" data-palscroll="1" aria-label="More palettes">' + icon("chevron-right") + "</button></div>" +
      '<h4 class="set-sub"><span class="set-num">2</span>Style</h4><div class="theme-grid">' + themes + "</div>" +
      '<h4 class="set-sub"><span class="set-num">3</span>Glass &amp; motion</h4>' +
      '<div class="setting-row"><span>Liquid glass<small>Frosted, see-through bars, panels and sheets</small></span>' + FL.ui.segmented("glass", T.GLASS, T.glass()) + "</div>" +
      '<div class="setting-row"><span>Background<small>Lights glow softly behind frosted glass; Aurora drifts slow colour</small></span>' + FL.ui.segmented("ambient", T.AMBIENT, T.ambient()) + "</div>" +
      '<div class="setting-row"><span>Motion<small>Calm keeps things still: no tilt, drift or page effects</small></span>' + FL.ui.segmented("motion", [["full", "Full"], ["calm", "Calm"]], a.motion === "calm" ? "calm" : "full") + "</div>" +
      '<h4 class="set-sub">More</h4>' +
      '<div class="setting-row"><span>Year picker<small>How you choose a year on the Years page</small></span>' +
        FL.ui.segmented("picker", [["dial", "Dial"], ["wheel", "Wheel"], ["ruler", "Ruler"], ["chips", "Chips"]], picker) + "</div>" +
      // Only what applies on this device: the search button is a phone thing, trailers on hover need a mouse.
      (phone() ? '<div class="setting-row"><span>Search button<small>In the middle of the top bar, or a round button under Settings</small></span>' +
        FL.ui.segmented("searchspot", [["center", "Top centre"], ["float", "Under settings"]], a.searchSpot === "float" ? "float" : "center") + "</div>" : "") +
      (mouse() ? '<div class="setting-row"><span>Trailer on hover<small>Rest the mouse on a poster for 3 seconds to preview it</small></span>' +
        FL.ui.segmented("hovertrailer", [["on", "On"], ["off", "Off"]], a.hoverTrailer === false ? "off" : "on") + "</div>" : "") +
      '<div class="setting-row"><span>Moodline<small>Home’s headline follows what you’ve been watching: its words and its typeface</small></span>' +
        FL.ui.segmented("moodtype", [["on", "On"], ["off", "Off"]], a.moodType === false ? "off" : "on") + "</div>";
  }

  function homeHtml() {
    const max = (FL.store.prefs().home || {}).continueMax || 3;
    return '<div class="setting-row"><span>Up Next<small>How many unfinished titles Home shows</small></span>' +
      FL.ui.segmented("cwmax", [["1", "1"], ["2", "2"], ["3", "3"]], String(max)) + "</div>" +
      '<div class="setting-row"><span>Glance<small>Your numbers under Home’s headline: films watched, this year, hours, Watch later</small></span>' +
      FL.ui.segmented("glance", [["on", "Show"], ["off", "Hide"]], (FL.store.prefs().home || {}).glance ? "on" : "off") + "</div>" +
      (FL.pet ? '<div class="setting-row setting-stack"><span>Pause Pals<small>On long sittings a little friend drops in at the top right: water, a stretch, rest your eyes</small></span>' +
        '<div class="pet-picker" role="radiogroup" aria-label="Break reminder companion">' + FL.pet.PETS.map(([k, label]) => {
          const on = FL.pet.choice() === k;
          return '<button type="button" role="radio" aria-checked="' + on + '" class="pet-pick' + (on ? " is-on" : "") + '" data-pet="' + k + '">' +
            '<span class="pet-pick-face">' + (k === "off" ? icon("x") : k === "mix" ? '<span class="pet-pick-mix">🎲</span>' : FL.pet.face(k)) + "</span><small>" + label + "</small></button>";
        }).join("") + "</div></div>" : "");
  }

  function storageHtml(status, protectedStorage) {
    const fileBlock = !status.supported
      ? '<p class="sub">This browser can’t keep a live file. Use <strong>Export backup</strong> now and then, or open Iris in Chrome or Edge on a computer to save automatically.</p>'
      : status.active
        ? '<div class="file-status ok">' + icon("folder") + "<div><strong>" + esc(status.name) + "</strong><small>Saving automatically" + (status.lastSaved ? " · last saved " + new Date(status.lastSaved).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "") + "</small></div>" +
          '<button type="button" class="btn btn-sm btn-ghost" data-set="file-stop">Stop</button></div>'
        : status.needsPermission
          ? '<div class="file-status warn">' + icon("folder") + "<div><strong>" + esc(status.name) + "</strong><small>Paused. The browser needs your permission again.</small></div>" +
            '<button type="button" class="btn btn-sm btn-primary" data-set="file-reconnect">Resume saving</button></div>'
          : '<button type="button" class="btn btn-primary" data-set="file-connect">' + icon("folder") + "Keep a copy on this computer…</button>" +
            '<p class="footnote">Iris saves every change to a file you choose. It survives clearing browser data. Put it in iCloud Drive, Google Drive or Dropbox and it follows you to other computers.</p>';
    return '<p class="sub">Your library lives in this browser (' + plural(FL.store.entries().length, "title") + ", " + kb(FL.store.storageBytes()) + " incl. caches). Clearing browsing data erases it, so keep a copy below." +
      (protectedStorage ? " The browser won’t clear it on its own." : "") + "</p>" + fileBlock +
      '<div class="btn-row">' +
        (status.supported ? '<button type="button" class="btn" data-set="file-restore">' + icon("upload") + "Restore from file…</button>" : '<label class="btn">' + icon("upload") + 'Restore from file…<input type="file" accept="application/json,.json" data-set="import" hidden></label>') +
        '<button type="button" class="btn btn-ghost" data-set="export">' + icon("download") + "Export backup</button>" +
        '<button type="button" class="btn btn-ghost" data-set="csv">' + icon("download") + "Letterboxd CSV</button>" +
      "</div>";
  }

  /* Sync first: it's what keeps everything else in step across devices. */
  function syncRow() {
    const on = FL.sync && FL.sync.on;
    return '<div class="setting-row"><span>Relay' + (on ? ' <span class="set-on">On</span>' : "") + "<small>" + (on
      ? "Watched, Watch later, favourites, shows, where you stopped and these settings follow you between devices"
      : "Keep your library and settings the same on your phone and laptop") + "</small></span>" +
      '<a class="btn btn-sm' + (on ? "" : " btn-primary") + '" href="#/move">' + icon("devices") + (on ? "Manage" : "Set up") + "</a></div>";
  }

  /* Player: the pop-up shield, then which servers answer from this network. */
  function playerHtml() {
    const pp = FL.store.prefs().player || {};
    const shield = pp.shield !== false;
    return '<div class="setting-row"><span>Autoplay next episode<small>At the credits, the next episode starts after a 10-second countdown</small></span>' +
      FL.ui.segmented("autonext", [["on", "On"], ["off", "Off"]], pp.autoNext === false ? "off" : "on") + "</div>" +
      '<div class="setting-row"><span>Clear Play<small>No pop-up tabs or redirects from players. Vega Super plays fully shielded; other servers refuse to play that way, so Iris asks before any of them takes you to another site. Turn off if a server stops playing.</small></span>' +
      FL.ui.segmented("shield", [["on", "On"], ["off", "Off"]], shield ? "on" : "off") + "</div>" +
      '<details class="set-details"><summary>Server status</summary>' +
        '<p class="sub set-sub-note">From your network right now. “Unreachable” usually means your internet provider blocks it; the player skips those.</p>' +
        '<ul class="server-list">' + serverRows() + '</ul><button type="button" class="btn btn-sm btn-ghost" data-set="recheck">Re-check</button></details>';
  }

  const phone = () => window.matchMedia("(max-width: 760px)").matches;
  const mouse = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function serverRows() {
    return FL.player.SERVERS.map((s) => '<li data-srv-row="' + s.id + '"><i class="srv-dot"></i><span>' + s.name + '</span><small class="muted">' + s.origin.replace("https://", "") + "</small><em>…</em></li>").join("");
  }

  function settings(focus) {
    const prefs = FL.store.prefs();
    const m = modal(
      '<div class="modal-pad settings">' +
        '<h2 class="h2">Settings</h2>' +
        '<section data-sec="relay"><h3 class="label">Relay</h3>' + syncRow() + "</section>" +
        '<section data-sec="player"><h3 class="label">Player</h3><div data-playerset>' + playerHtml() + "</div></section>" +
        '<section data-sec="appearance"><h3 class="label">Appearance</h3><div data-appearance>' + appearanceHtml() + "</div></section>" +
        '<section data-sec="home"><h3 class="label">Home</h3>' +
          '<div class="setting-row setting-stack"><label for="set-name">Your name<small>Used in Home’s greeting</small></label>' +
          '<input class="input" id="set-name" maxlength="40" placeholder="Optional" value="' + esc(prefs.name || "") + '"></div>' +
          '<div data-homeset>' + homeHtml() + "</div></section>" +
        '<section data-sec="storage"><h3 class="label">Backup</h3><div data-storage>' + storageHtml(FL.persist.status(), false) + "</div></section>" +
        '<section><h3 class="label">Maintenance</h3><div class="btn-row">' +
          '<button type="button" class="btn btn-ghost" data-set="clear-cache">Clear artwork & details cache</button>' +
          '<button type="button" class="btn btn-danger-ghost" data-set="reset">Erase library…</button></div></section>' +
      "</div>",
      { cls: "modal-md", label: "Settings" }
    );

    function paintStorage() {
      FL.persist.storageProtected().then((p) => {
        const box = $("[data-storage]", m.el);
        if (box) box.innerHTML = storageHtml(FL.persist.status(), p);
      });
    }
    paintStorage();
    const off = FL.persist.on(paintStorage);

    let lastServerResults = [];
    function paintServers(results) {
      lastServerResults = results || [];
      FL.player.SERVERS.forEach((s, i) => {
        const li = $('[data-srv-row="' + s.id + '"]', m.el);
        const r = results[i];
        if (!li || !r) return;
        li.className = r.ok ? "srv-ok" : "srv-down";
        li.querySelector("em").textContent = r.ok ? r.ms + " ms" : "unreachable";
      });
    }
    FL.player.probeAll().then(paintServers);
    requestAnimationFrame(() => {
      const row = $("[data-palrow]", m.el);
      const on = row && row.querySelector(".is-on");
      if (on) row.scrollLeft = on.offsetLeft - 40;
    });

    if (focus) {
      const sec = $('[data-sec="' + focus + '"]', m.el);
      if (sec) setTimeout(() => sec.scrollIntoView({ block: "start" }), 60);
    }

    const name = $("#set-name", m.el);
    name.addEventListener("change", () => { FL.store.setPref("name", name.value.trim().slice(0, 40)); FL.app.refresh(); });

    function repaintAppearance() {
      const box = $("[data-appearance]", m.el);
      if (!box) return;
      const row = $("[data-palrow]", box);
      const x = row ? row.scrollLeft : null;
      box.innerHTML = appearanceHtml();
      const next = $("[data-palrow]", box);
      if (next && x !== null) next.scrollLeft = x;
      else if (next) { const on = next.querySelector(".is-on"); if (on) next.scrollLeft = on.offsetLeft - 40; }
    }

    m.el.addEventListener("input", (e) => {
      if (e.target.matches("[data-accent-custom]")) { FL.theme.set({ accent: e.target.value.toUpperCase() }); e.target.closest(".swatch").style.setProperty("--sw", e.target.value); }
    });
    m.el.addEventListener("change", (e) => { if (e.target.matches("[data-accent-custom]")) repaintAppearance(); });

    m.el.addEventListener("click", (e) => {
      const pre = e.target.closest("[data-preset]");
      if (pre) {
        const p = FL.theme.PRESETS.find((x) => x.id === pre.dataset.preset);
        if (p) { FL.theme.set(Object.assign({ accent: "" }, p.set)); repaintAppearance(); }
        return;
      }
      const t = e.target.closest("[data-theme-pick]");
      if (t) { FL.theme.set({ theme: t.dataset.themePick }); repaintAppearance(); return; }
      const pal = e.target.closest("[data-palette]");
      if (pal) { FL.theme.set({ palette: pal.dataset.palette, accent: "" }); repaintAppearance(); return; }
      const sw = e.target.closest("[data-accent]");
      if (sw) { FL.theme.set({ accent: sw.dataset.accent }); repaintAppearance(); return; }
      const seg = e.target.closest('[data-seg="mode"], [data-seg="glass"], [data-seg="ambient"], [data-seg="motion"]');
      if (seg) {
        const patch = { [seg.dataset.seg]: seg.dataset.value };
        // Lights and aurora are meant to be seen through glass.
        if (seg.dataset.seg === "ambient" && seg.dataset.value !== "off" && FL.theme.glass() === "off") patch.glass = "subtle";
        FL.theme.set(patch);
        repaintAppearance();
        return;
      }
      const ps = e.target.closest("[data-palscroll]");
      if (ps) {
        const row = $("[data-palrow]", m.el);
        if (row) row.scrollBy({ left: +ps.dataset.palscroll * row.clientWidth * 0.8, behavior: "smooth" });
        return;
      }
      const pk = e.target.closest('[data-seg="picker"]');
      if (pk) { FL.store.patchPref("years", { picker: pk.dataset.value }); repaintAppearance(); FL.app.refresh(); return; }
      const an = e.target.closest('[data-seg="autonext"]');
      if (an) {
        FL.store.patchPref("player", { autoNext: an.dataset.value === "on" });
        $("[data-playerset]", m.el).innerHTML = playerHtml();
        paintServers(lastServerResults);
        return;
      }
      const sh = e.target.closest('[data-seg="shield"]');
      if (sh) {
        FL.store.patchPref("player", { shield: sh.dataset.value === "on" });
        $("[data-playerset]", m.el).innerHTML = playerHtml();
        paintServers(lastServerResults);
        return;
      }
      const sp = e.target.closest('[data-seg="searchspot"]');
      if (sp) { FL.theme.set({ searchSpot: sp.dataset.value }); repaintAppearance(); return; }
      const ht = e.target.closest('[data-seg="hovertrailer"]');
      if (ht) { FL.store.patchPref("appearance", { hoverTrailer: ht.dataset.value === "on" }); repaintAppearance(); return; }
      const mt = e.target.closest('[data-seg="moodtype"]');
      if (mt) { FL.store.patchPref("appearance", { moodType: mt.dataset.value === "on" }); repaintAppearance(); FL.app.refresh(); return; }
      const pt = e.target.closest("[data-pet]");
      if (pt) {
        FL.store.patchPref("care", { pet: pt.dataset.pet });
        $("[data-homeset]", m.el).innerHTML = homeHtml();
        if (pt.dataset.pet !== "off") FL.pet.hello(pt.dataset.pet);
        return;
      }
      const gl = e.target.closest('[data-seg="glance"]');
      if (gl) {
        FL.store.patchPref("home", { glance: gl.dataset.value === "on" });
        $("[data-homeset]", m.el).innerHTML = homeHtml();
        FL.app.refresh();
        return;
      }
      const cw = e.target.closest('[data-seg="cwmax"]');
      if (cw) {
        FL.store.patchPref("home", { continueMax: +cw.dataset.value });
        $("[data-homeset]", m.el).innerHTML = homeHtml();
        FL.app.refresh();
        return;
      }
      const b = e.target.closest("[data-set]");
      if (!b) return;
      const act = b.dataset.set;
      const fail = (err) => { if (err && err.name !== "AbortError") toast("That didn’t work: " + (err.message || "try again") + "."); };
      if (act === "export") exportJSON();
      else if (act === "csv") { download("iris-" + todayISO() + ".csv", FL.store.exportCSV(), "text/csv"); toast("CSV downloaded."); }
      else if (act === "file-connect") FL.persist.connect().then(() => toast("Saving to " + FL.persist.status().name + "."), fail);
      else if (act === "file-reconnect") FL.persist.reconnect().catch(fail);
      else if (act === "file-stop") FL.persist.disconnect();
      else if (act === "file-restore") FL.persist.restore().then((n) => toast("Restored " + plural(n, "title") + "."), fail);
      else if (act === "recheck") { $$("[data-srv-row] em", m.el).forEach((x) => { x.textContent = "…"; }); FL.player.probeAll(true).then(paintServers); }
      else if (act === "clear-cache") { FL.meta.clearCaches(); toast("Cache cleared. Artwork and details will reload."); }
      else if (act === "reset") {
        FL.ui.confirm({ title: "Erase your whole library?", body: "Watch history, ratings, shows and Watch later will be deleted from this browser. Export a backup first if you might want it back.", confirmLabel: "Erase everything", danger: true })
          .then((ok) => { if (ok) { FL.store.resetLibrary(); toast("Library erased."); } });
      }
    });

    m.el.addEventListener("change", (e) => {
      if (!e.target.matches('[data-set="import"]')) return;
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let data;
        try { data = JSON.parse(reader.result); } catch (err) { toast("That file isn't valid JSON."); return; }
        try { toast("Restored " + plural(FL.store.importJSON(data, "merge"), "title") + "."); } catch (err) { toast(err.message); }
      };
      reader.readAsText(file);
    });

    const origClose = m.close;
    m.close = () => { off(); origClose(); };
  }

  /* ---------- shortcuts ---------- */

  function isMac() { return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent); }

  function shortcuts() {
    const mod = isMac() ? "⌘" : "Ctrl";
    const groups = [
      ["Anywhere", [[[mod, "K"], "Search films, shows & commands"], [["/"], "Search"], [["R"], "Reel Spin"], [["?"], "This list"], [["Esc"], "Close"]]],
      ["Go to", [[["G", "H"], "Home"], [["G", "Y"], "Years"], [["G", "B"], "Browse"], [["G", "T"], "Shows"], [["G", "W"], "Watch later"], [["G", "D"], "Diary"], [["G", "S"], "Stats"]]],
      ["On a film page", [[["P"], "Play"], [["T"], "Trailer"], [["W"], "Watch later"], [["M"], "Mark watched"], [["F"], "Favourite"]]],
      ["Player", [[["N"], "Next server"], [["1"], "–", ["9"], "Pick a server"], [["F"], "Fullscreen"], [["Esc"], "Close player"]]],
      ["Years", [[["←"], "Previous year"], [["→"], "Next year"]]],
      ["Grids", [[["←", "→", "↑", "↓"], "Move between posters"], [["↵"], "Open"]]],
    ];
    modal('<div class="modal-pad"><h2 class="h2">Keyboard shortcuts</h2><div class="shortcut-groups">' + groups.map(([title, list]) =>
      '<section><h3 class="label">' + title + "</h3><dl>" + list.map((item) => {
        const keys = item.slice(0, -1).map((part) => Array.isArray(part) ? part.map((k) => "<kbd>" + esc(k) + "</kbd>").join("") : '<span class="muted">' + part + "</span>").join(" ");
        return "<div><dt>" + keys + "</dt><dd>" + item[item.length - 1] + "</dd></div>";
      }).join("") + "</dl></section>").join("") + "</div></div>", { cls: "modal-md", label: "Keyboard shortcuts" });
  }

  FL.palette = { open: palette, pick, settings, shortcuts, isMac };
})(window.FL = window.FL || {});
