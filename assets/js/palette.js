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
    { id: "shows", label: "Shows — reality, talent & series", icon: "tv", keys: "g t", run: () => go("#/shows") },
    { id: "watchlist", label: "Open watchlist", icon: "bookmark", keys: "g w", run: () => go("#/library/watchlist") },
    { id: "library", label: "Open library", icon: "layers", keys: "g l", run: () => go("#/library/watched") },
    { id: "diary", label: "Open diary", icon: "calendar", keys: "g d", run: () => go("#/diary") },
    { id: "stats", label: "Open stats", icon: "chart", keys: "g s", run: () => go("#/stats") },
    { id: "collections", label: "Marvel & DC collections", icon: "film", run: () => go("#/library/collections") },
    { id: "pick", label: "Surprise me — pick a film", icon: "shuffle", keys: "r", run: () => pick() },
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
        FL.remote.search(fixed || q).then(() => {
          if (input.value.trim() !== q || !paletteOpen) return;
          busy.hidden = true;
          update();
        });
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
        toast((e && e.listed ? "Added to watchlist: " : "Removed from watchlist: ") + f.title);
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
    const desc = (m && m.desc) || film.desc || "";
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
      FL.ui.segmented("psource", [["watchlist", "Watchlist"], ["foryou", "For you"], ["acclaimed", "Acclaimed"]], pickState.source) +
      FL.ui.segmented("plang", [["", "Any"], ["Hindi", "Hindi"], ["English", "English"], ["OtherIndian", "Regional"], ["Superhero", "Marvel & DC"]], pickState.lang) +
      '</div><div class="pick-stage"><div class="pick-ring-wrap"><div class="pick-ring"></div></div><div class="pick-body" aria-live="polite"></div></div></div>', { cls: "modal-pick", label: "Surprise me" });
    const ring = $(".pick-ring", m.el);
    const body = $(".pick-body", m.el);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function roll() {
      const pool = pickPool();
      if (!pool.length) {
        ring.innerHTML = "";
        body.innerHTML = FL.ui.empty(pickState.source === "watchlist" ? "Nothing on your watchlist matches." : "Nothing matches.", "Switch the source or language above.");
        body.classList.add("in");
        return;
      }
      let film;
      do { film = pool[Math.floor(Math.random() * pool.length)]; } while (pool.length > 1 && film === pickState.last);
      pickState.last = film;
      // Fill the ring with random neighbours, the pick at slot 0.
      const others = pool.filter((f) => f !== film).sort(() => Math.random() - 0.5);
      const slots = [film];
      for (let i = 1; i < RING; i++) slots.push(others[(i - 1) % Math.max(1, others.length)] || film);
      ring.innerHTML = slots.map((f, i) => '<div class="pick-face" style="--i:' + i + '">' + art(f, { size: "medium", eager: i < 3 }) + "</div>").join("");
      FL.ui.watchPosters(ring);
      body.classList.remove("in");
      const label = { watchlist: "Tonight · from your watchlist", foryou: "Tonight · picked for you", acclaimed: "Tonight · acclaimed, unwatched" }[pickState.source];
      // Spin at least two turns and land slot 0 at the front.
      pickState.angle -= reduced ? 0 : 720 + 360;
      pickState.angle = Math.round(pickState.angle / 360) * 360;
      ring.style.transition = reduced ? "none" : "";
      requestAnimationFrame(() => { ring.style.transform = "translateZ(calc(var(--ring-r) * -1)) rotateY(" + pickState.angle + "deg)"; });
      setTimeout(() => {
        body.innerHTML = details(film, label);
        body.classList.add("in");
        if (!FL.meta.cached(film)) {
          FL.meta.details(film).then((meta) => {
            const d = $("[data-pick-desc]", body);
            if (d && meta && meta.desc && pickState.last === film && !d.textContent) d.textContent = meta.desc;
          });
        }
      }, reduced ? 0 : 900);
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
    const styleDefault = (id) => ({ bg: { cinema: "#0A0A0B", material: "#17151B", mac: "#1C1C1E" }[id], s: { cinema: "#27272C", material: "#36343B", mac: "#3A3A3C" }[id], text: "#F5F5F2", accent: T.THEMES[id].accent.dark });
    const presets = T.PRESETS.map((p) => {
      const pal = T.PALETTES.find((x) => x.id === p.set.palette);
      const pv = (pal && T.preview(pal, mode)) || styleDefault(p.set.theme);
      const on = a.theme === p.set.theme && (a.palette || "default") === p.set.palette && (a.glass || "off") === p.set.glass && (a.ambient || "off") === p.set.ambient;
      return '<button type="button" class="preset' + (on ? " is-on" : "") + '" data-preset="' + p.id + '" aria-pressed="' + on + '" style="' + swatchStyle(pv) + '">' +
        '<span class="preset-art" data-ambient-preview="' + p.set.ambient + '" data-glass-preview="' + p.set.glass + '" aria-hidden="true"><i></i><i></i></span><span>' + p.name + "</span></button>";
    }).join("");
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
    return '<h4 class="set-sub">Quick looks</h4><div class="preset-row">' + presets + "</div>" +
      '<h4 class="set-sub">Style</h4><div class="theme-grid">' + themes + "</div>" +
      '<h4 class="set-sub">Palette <span class="muted">' + T.PALETTES.length + "</span></h4><div class=\"palette-grid\">" + palettes + "</div>" +
      '<div class="setting-row"><span>Mode</span>' + FL.ui.segmented("mode", [["dark", "Dark"], ["light", "Light"], ["system", "Auto"]], a.mode) + "</div>" +
      '<div class="setting-row"><span>Accent</span><div class="swatches">' + swatches + "</div></div>" +
      '<div class="setting-row"><span>Liquid glass<small>Frosted, see-through panels and bars</small></span>' + FL.ui.segmented("glass", T.GLASS, T.glass()) + "</div>" +
      '<div class="setting-row"><span>Background<small>Lights drift behind frosted glass; Aurora is slow colour</small></span>' + FL.ui.segmented("ambient", T.AMBIENT, T.ambient()) + "</div>" +
      '<div class="setting-row"><span>Motion<small>Calm turns off tilt, drift and page effects</small></span>' + FL.ui.segmented("motion", [["full", "Full"], ["calm", "Calm"]], a.motion === "calm" ? "calm" : "full") + "</div>";
  }

  function homeHtml() {
    const max = (FL.store.prefs().home || {}).continueMax || 3;
    return '<div class="setting-row"><span>Continue watching<small>How many unfinished titles Home shows</small></span>' +
      FL.ui.segmented("cwmax", [["1", "1"], ["2", "2"], ["3", "3"]], String(max)) + "</div>";
  }

  function storageHtml(status, protectedStorage) {
    const fileBlock = !status.supported
      ? '<p class="sub">This browser can’t keep a live file. Use <strong>Export backup</strong> now and then — or open Iris in Chrome or Edge on a computer to save automatically.</p>'
      : status.active
        ? '<div class="file-status ok">' + icon("folder") + "<div><strong>" + esc(status.name) + "</strong><small>Saving automatically" + (status.lastSaved ? " · last saved " + new Date(status.lastSaved).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "") + "</small></div>" +
          '<button type="button" class="btn btn-sm btn-ghost" data-set="file-stop">Stop</button></div>'
        : status.needsPermission
          ? '<div class="file-status warn">' + icon("folder") + "<div><strong>" + esc(status.name) + "</strong><small>Paused — the browser needs your permission again.</small></div>" +
            '<button type="button" class="btn btn-sm btn-primary" data-set="file-reconnect">Resume saving</button></div>'
          : '<button type="button" class="btn btn-primary" data-set="file-connect">' + icon("folder") + "Keep a copy on this computer…</button>" +
            '<p class="footnote">Iris saves every change to a file you choose. It survives clearing browser data. Put it in iCloud Drive, Google Drive or Dropbox and it follows you to other computers.</p>';
    return '<p class="sub">Your library lives in this browser (' + plural(FL.store.entries().length, "title") + ", " + kb(FL.store.storageBytes()) + " incl. caches). Clearing browsing data erases it — keep a copy below." +
      (protectedStorage ? " The browser won’t clear it on its own." : "") + "</p>" + fileBlock +
      '<div class="btn-row">' +
        (status.supported ? '<button type="button" class="btn" data-set="file-restore">' + icon("upload") + "Restore from file…</button>" : '<label class="btn">' + icon("upload") + 'Restore from file…<input type="file" accept="application/json,.json" data-set="import" hidden></label>') +
        '<button type="button" class="btn btn-ghost" data-set="export">' + icon("download") + "Export backup</button>" +
        '<button type="button" class="btn btn-ghost" data-set="csv">' + icon("download") + "Letterboxd CSV</button>" +
      "</div>";
  }

  function serverRows() {
    return FL.player.SERVERS.map((s) => '<li data-srv-row="' + s.id + '"><i class="srv-dot"></i><span>' + s.name + '</span><small class="muted">' + s.origin.replace("https://", "") + "</small><em>…</em></li>").join("");
  }

  function settings(focus) {
    const prefs = FL.store.prefs();
    const m = modal(
      '<div class="modal-pad settings">' +
        '<h2 class="h2">Settings</h2>' +
        '<section data-sec="appearance"><h3 class="label">Appearance</h3><div data-appearance>' + appearanceHtml() + "</div></section>" +
        '<section data-sec="home"><h3 class="label">Home</h3><div data-homeset>' + homeHtml() + "</div></section>" +
        '<section><label class="label" for="set-name">Your name</label>' +
          '<input class="input" id="set-name" maxlength="40" placeholder="Used in the greeting" value="' + esc(prefs.name || "") + '"></section>' +
        '<section data-sec="storage"><h3 class="label">Storage</h3><div data-storage>' + storageHtml(FL.persist.status(), false) + "</div></section>" +
        '<section><h3 class="label">Stream servers</h3><p class="sub">Reachability from your network right now; the player skips servers that don’t answer. ' +
          "“Unreachable” usually means your internet provider or an ad blocker blocks that server — it isn’t something Iris can change. Titles no server carries have a <em>Where to watch</em> link.</p>" +
          '<ul class="server-list">' + serverRows() + '</ul><button type="button" class="btn btn-sm btn-ghost" data-set="recheck">Re-check</button></section>' +
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

    function paintServers(results) {
      FL.player.SERVERS.forEach((s, i) => {
        const li = $('[data-srv-row="' + s.id + '"]', m.el);
        const r = results[i];
        if (!li || !r) return;
        li.className = r.ok ? "srv-ok" : "srv-down";
        li.querySelector("em").textContent = r.ok ? r.ms + " ms" : "unreachable";
      });
    }
    FL.player.probeAll().then(paintServers);

    if (focus) {
      const sec = $('[data-sec="' + focus + '"]', m.el);
      if (sec) setTimeout(() => sec.scrollIntoView({ block: "start" }), 60);
    }

    const name = $("#set-name", m.el);
    name.addEventListener("change", () => { FL.store.setPref("name", name.value.trim().slice(0, 40)); FL.app.refresh(); });

    function repaintAppearance() {
      const box = $("[data-appearance]", m.el);
      if (box) box.innerHTML = appearanceHtml();
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
      const fail = (err) => { if (err && err.name !== "AbortError") toast("That didn’t work — " + (err.message || "try again") + "."); };
      if (act === "export") exportJSON();
      else if (act === "csv") { download("iris-" + todayISO() + ".csv", FL.store.exportCSV(), "text/csv"); toast("CSV downloaded."); }
      else if (act === "file-connect") FL.persist.connect().then(() => toast("Saving to " + FL.persist.status().name + "."), fail);
      else if (act === "file-reconnect") FL.persist.reconnect().catch(fail);
      else if (act === "file-stop") FL.persist.disconnect();
      else if (act === "file-restore") FL.persist.restore().then((n) => toast("Restored " + plural(n, "title") + "."), fail);
      else if (act === "recheck") { $$("[data-srv-row] em", m.el).forEach((x) => { x.textContent = "…"; }); FL.player.probeAll(true).then(paintServers); }
      else if (act === "clear-cache") { FL.meta.clearCaches(); toast("Cache cleared — artwork and details will reload."); }
      else if (act === "reset") {
        FL.ui.confirm({ title: "Erase your whole library?", body: "Watch history, ratings, shows and watchlist will be deleted from this browser. Export a backup first if you might want it back.", confirmLabel: "Erase everything", danger: true })
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
      ["Anywhere", [[[mod, "K"], "Search films, shows & commands"], [["/"], "Search"], [["R"], "Surprise me"], [["?"], "This list"], [["Esc"], "Close"]]],
      ["Go to", [[["G", "H"], "Home"], [["G", "Y"], "Years"], [["G", "B"], "Browse"], [["G", "T"], "Shows"], [["G", "W"], "Watchlist"], [["G", "D"], "Diary"], [["G", "S"], "Stats"]]],
      ["On a film page", [[["P"], "Play"], [["T"], "Trailer"], [["W"], "Watchlist"], [["M"], "Mark watched"], [["F"], "Favourite"]]],
      ["Player", [[["N"], "Next server"], [["1"], "–", ["5"], "Pick a server"], [["F"], "Fullscreen"], [["Esc"], "Close player"]]],
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
