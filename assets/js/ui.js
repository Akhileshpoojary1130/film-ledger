/* Iris — shared UI: icons, posters, cards, rows, rails, rating, toasts, modals, motion helpers. */
(function (FL) {
  "use strict";

  const { esc, hash, $$, on, compact } = FL.util;

  /* ---------- icons: a 24px line set; the Material theme swaps in Material Symbols ---------- */

  const ICONS = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    star: '<path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z"/>',
    heart: '<path d="M12 19.5s-7-4.3-7-9.7A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.2c0 5.4-7 9.7-7 9.7z"/>',
    play: '<path fill="currentColor" d="M8 5.8v12.4a.6.6 0 0 0 .9.5l9.7-6.2a.6.6 0 0 0 0-1L8.9 5.3a.6.6 0 0 0-.9.5z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    chart: '<path d="M5 20v-6M12 20V5M19 20v-9M3 20h18"/>',
    home: '<path d="M4 10.5L12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    layers: '<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5"/><path d="M3.5 16.5L12 21l8.5-4.5"/>',
    bookmark: '<path d="M6.5 4h11v16l-5.5-4-5.5 4z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    "arrow-left": '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    "arrow-right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    "chevron-left": '<path d="M15 6l-6 6 6 6"/>',
    "chevron-right": '<path d="M9 6l6 6-6 6"/>',
    "chevron-down": '<path d="M6 9l6 6 6-6"/>',
    shuffle: '<path d="M16 4h4v4M4 20L20 4M20 16v4h-4M14.5 14.5L20 20M4 4l5 5"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
    film: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M7.5 4v16M16.5 4v16M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4"/>',
    tv: '<rect x="3" y="6" width="18" height="12.5" rx="2"/><path d="M8.5 3l3.5 3 3.5-3M8 21h8"/>',
    rewatch: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/>',
    trash: '<path d="M5 7h14M10 11v6M14 11v6M6.5 7l1 13h9l1-13M9.5 7V4.5h5V7"/>',
    keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
    trailer: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
    list: '<path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    history: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5M12 8v4l2.5 2"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.1 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.6 0-.8.7-1.4 1.5-1.4h2.1a4.1 4.1 0 0 0 4.1-4.1C20.5 6.6 16.7 3.5 12 3.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
    folder: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    years: '<path d="M4 20V9M9 20V5M14 20v-8M19 20V8"/><path d="M3 20h18"/>',
    qr: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><path d="M13.5 13.5h2.5v2.5h-2.5zM20 13.5v2.5M13.5 20h2.5M18.5 18.5H20V20h-1.5z"/>',
    share: '<path d="M12 14.5V3.5M8 7.5l4-4 4 4"/><path d="M8.5 10.5H6.5a1 1 0 0 0-1 1V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-7.5a1 1 0 0 0-1-1h-2"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><circle cx="16.8" cy="9.3" r="2.5"/><path d="M16 14.3a4.6 4.6 0 0 1 4.8 4.7"/>',
    camera: '<path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2.2L9.3 5h5.4l1.6 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.3"/>',
    link: '<path d="M10.5 13.5a3.8 3.8 0 0 0 5.4 0l3-3a3.8 3.8 0 0 0-5.4-5.4l-1 1"/><path d="M13.5 10.5a3.8 3.8 0 0 0-5.4 0l-3 3a3.8 3.8 0 0 0 5.4 5.4l1-1"/>',
    devices: '<rect x="3" y="5" width="13" height="10" rx="1.5"/><path d="M1.5 18.5h11"/><rect x="16" y="9" width="5.5" height="10.5" rx="1.3"/>',
  };

  const MSR = {
    search: "search", plus: "add", check: "check", star: "star", heart: "favorite", play: "play_arrow", calendar: "calendar_month",
    chart: "bar_chart", home: "home", compass: "explore", layers: "video_library", bookmark: "bookmark", x: "close",
    "arrow-left": "arrow_back", "arrow-right": "arrow_forward", "chevron-left": "chevron_left", "chevron-right": "chevron_right",
    "chevron-down": "expand_more", shuffle: "shuffle", external: "open_in_new", expand: "fullscreen", sliders: "tune",
    download: "download", upload: "upload", film: "movie", tv: "live_tv", rewatch: "replay", trash: "delete", keyboard: "keyboard",
    trailer: "smart_display", grid: "grid_view", list: "view_list", clock: "schedule", history: "history", spark: "auto_awesome",
    palette: "palette", folder: "folder_open", years: "bar_chart", qr: "qr_code_2", share: "ios_share", users: "group",
    camera: "photo_camera", link: "link", devices: "devices",
  };

  function icon(name, cls) {
    if (FL.theme && FL.theme.icons() === "material" && MSR[name]) {
      return '<span class="i msr' + (cls ? " " + cls : "") + '" aria-hidden="true">' + MSR[name] + "</span>";
    }
    return '<svg class="i' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[name] || "") + "</svg>";
  }

  /* The aperture, animated — used wherever something is loading. */
  function loader(size, label) {
    return '<span class="loader" role="status"' + (label ? ' aria-label="' + esc(label) + '"' : "") + ">" + FL.theme.mark({ size: size || 28, open: 74, animate: true, cls: "mark-spin" }) + "</span>";
  }

  /* ---------- stars ---------- */

  /* Display-only stars; value is 0–10 (half-star units). */
  function stars(v10, cls) {
    return '<span class="stars' + (cls ? " " + cls : "") + '" style="--v:' + (v10 / 10) + '" role="img" aria-label="' + (v10 / 2) + ' out of 5 stars">★★★★★</span>';
  }

  function ratingWidget(film) {
    const v = FL.store.state(film.id).rating;
    return '<div class="rate" role="slider" tabindex="0" aria-label="Your rating" aria-valuemin="0" aria-valuemax="5" aria-valuenow="' + (v / 2) +
      '" aria-valuetext="' + (v ? v / 2 + " stars" : "Not rated") + '" data-rate="' + esc(film.id) + '" style="--v:' + v / 10 + '">' +
      '<span class="rate-glyphs" aria-hidden="true">★★★★★</span><span class="rate-value">' + (v ? (v / 2).toFixed(1) : "Rate") + "</span></div>";
  }

  function setRateVisual(el, v10, preview) {
    el.style.setProperty("--v", v10 / 10);
    el.classList.toggle("is-preview", !!preview);
    const val = el.querySelector(".rate-value");
    if (val) val.textContent = v10 ? (v10 / 2).toFixed(1) : "Rate";
  }

  function rateFromPointer(el, e) {
    const g = el.querySelector(".rate-glyphs").getBoundingClientRect();
    const x = FL.util.clamp((e.clientX - g.left) / g.width, 0, 1);
    return Math.max(1, Math.ceil(x * 10));
  }

  function commitRating(el, v10) {
    const film = FL.catalogue.get(el.dataset.rate);
    if (!film) return;
    const current = FL.store.state(film.id).rating;
    const next = v10 === current ? 0 : v10;
    FL.store.setRating(film, next);
    el.setAttribute("aria-valuenow", next / 2);
    el.setAttribute("aria-valuetext", next ? next / 2 + " stars" : "Not rated");
    setRateVisual(el, next);
    el.classList.remove("pop");
    void el.offsetWidth;
    if (next) el.classList.add("pop");
  }

  on(document, "pointermove", ".rate", (e, el) => { if (e.pointerType === "mouse") setRateVisual(el, rateFromPointer(el, e), true); });
  document.addEventListener("pointerout", (e) => {
    const el = e.target.closest && e.target.closest(".rate");
    if (el && !el.contains(e.relatedTarget)) setRateVisual(el, FL.store.state(el.dataset.rate).rating);
  });
  on(document, "click", ".rate", (e, el) => commitRating(el, rateFromPointer(el, e)));
  on(document, "keydown", ".rate", (e, el) => {
    const cur = FL.store.state(el.dataset.rate).rating;
    let v = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") v = Math.min(10, cur + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") v = Math.max(0, cur - 1);
    else if (/^[1-5]$/.test(e.key)) v = +e.key * 2;
    else if (e.key === "0" || e.key === "Backspace" || e.key === "Delete") v = 0;
    if (v === null) return;
    e.preventDefault();
    if (v === cur) return;
    const film = FL.catalogue.get(el.dataset.rate);
    FL.store.setRating(film, v);
    el.setAttribute("aria-valuenow", v / 2);
    setRateVisual(el, v);
  });

  /* ---------- posters ---------- */

  function placeholder(film) {
    const hue = hash(film.title) % 360;
    return '<div class="ph" style="--ph:' + hue + '"><span class="ph-title">' + esc(film.title) + '</span><span class="ph-year">' + esc(FL.catalogue.yearLabel(film)) + "</span></div>";
  }

  function art(film, opts) {
    const o = opts || {};
    const cands = FL.meta.posterCandidates(film, o.size);
    const img = cands.length
      ? '<img src="' + esc(cands[0]) + '" data-alt="' + esc(cands.slice(1).join("|")) + '" alt="" loading="' + (o.eager ? "eager" : "lazy") +
        '" decoding="async" referrerpolicy="no-referrer" draggable="false">'
      : "";
    // Indian films whose best artwork is metahub's (sometimes a foreign release poster) also ask Wikipedia for theirs.
    const indianFallback = cands.length && /metahub/.test(cands[0]) && !film.remote && (film.lang === "Hindi" || film.lang === "OtherIndian") && FL.meta.wantsLookup(film);
    return '<div class="art" data-pid="' + esc(film.id) + '"' + (!cands.length || indianFallback ? " data-need" : "") + ">" + placeholder(film) + img + "</div>";
  }

  document.addEventListener("load", (e) => {
    const t = e.target;
    if (t.tagName === "IMG" && t.parentNode && t.parentNode.classList && t.parentNode.classList.contains("art")) t.classList.add("is-in");
  }, true);

  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName !== "IMG" || !img.parentNode || !img.parentNode.classList || !img.parentNode.classList.contains("art")) return;
    fallback(img);
  }, true);

  /* Next artwork source for a poster that failed (or hung). */
  function fallback(img) {
    const rest = (img.dataset.alt || "").split("|").filter(Boolean);
    if (rest.length) {
      img.dataset.alt = rest.slice(1).join("|");
      img.src = rest[0];
      return;
    }
    const wrap = img.parentNode;
    img.remove();
    const film = FL.catalogue.get(wrap.dataset.pid);
    if (film) FL.meta.requestPoster(film);
  }

  /* An image host that answers slowly shouldn't leave a blank tile: after 7 s on screen, move on to the next source. */
  const slowObserver = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const img = en.target;
      slowObserver.unobserve(img);
      const src = img.src;
      setTimeout(() => {
        if (img.isConnected && img.src === src && !(img.complete && img.naturalWidth) && img.parentNode) fallback(img);
      }, 7000);
    });
  }, { rootMargin: "0px" }) : null;

  /* Only placeholders that scroll near the viewport trigger a lookup. */
  const needObserver = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      needObserver.unobserve(en.target);
      const film = FL.catalogue.get(en.target.dataset.pid);
      if (film) FL.meta.requestPoster(film);
    });
  }, { rootMargin: "500px 0px" }) : null;

  function watchPosters(root) {
    $$(".art[data-need]", root).forEach((el) => {
      if (needObserver) needObserver.observe(el);
      else { const f = FL.catalogue.get(el.dataset.pid); if (f) FL.meta.requestPoster(f); }
    });
    if (slowObserver) $$(".art img:not(.is-in)", root).forEach((img) => { if (!(img.complete && img.naturalWidth)) slowObserver.observe(img); });
    reveal(root);
  }

  FL.meta.onPoster((film, url) => {
    $$('.art[data-pid="' + CSS.escape(film.id) + '"]').forEach((wrap) => {
      const cur = wrap.querySelector("img");
      if (cur && /metahub/.test(cur.src) && (film.lang === "Hindi" || film.lang === "OtherIndian")) { wrap.removeAttribute("data-need"); cur.src = url; return; }
      if (cur) return;
      wrap.removeAttribute("data-need");
      const img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = url;
      wrap.appendChild(img);
    });
  });

  /* ---------- motion: scroll reveal & poster tilt ---------- */

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  const revealObserver = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add("in");
      revealObserver.unobserve(en.target);
    });
  }, { rootMargin: "0px 0px -6% 0px" }) : null;

  function reveal(root) {
    if (!revealObserver || reduced.matches || (FL.theme && FL.theme.calm())) return;
    $$(".rail, .panel, .month, .collections > *, .glance, .tonight, .show-season, .year-summary", root || document).forEach((el) => {
      if (el.dataset.revealed) return;
      el.dataset.revealed = "1";
      el.classList.add("reveal");
      revealObserver.observe(el);
    });
  }

  /* Posters lean toward the pointer (desktop only) — transform-only, so it stays on the compositor. */
  let tiltEl = null;
  let tiltFrame = 0;
  let tiltEvt = null;
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.addEventListener("pointermove", (e) => {
      tiltEvt = e;
      if (tiltFrame) return;
      tiltFrame = requestAnimationFrame(() => {
        tiltFrame = 0;
        if (reduced.matches || FL.theme.calm()) return;
        const link = tiltEvt.target.closest && tiltEvt.target.closest(".card-link, .tilt");
        const target = link && (link.querySelector(".art") || link);
        if (tiltEl && tiltEl !== target) { tiltEl.style.removeProperty("--rx"); tiltEl.style.removeProperty("--ry"); }
        tiltEl = target;
        if (!target) return;
        const r = target.getBoundingClientRect();
        const x = (tiltEvt.clientX - r.left) / r.width - 0.5;
        const y = (tiltEvt.clientY - r.top) / r.height - 0.5;
        target.style.setProperty("--ry", (x * 6).toFixed(2) + "deg");
        target.style.setProperty("--rx", (-y * 6).toFixed(2) + "deg");
      });
    }, { passive: true });
  }

  /* ---------- trailer preview: rest the mouse on a poster for ~3 s and its trailer plays inside it ---------- */

  let hoverCard = null;
  let hoverTimer = 0;
  let preview = null;
  const previewsOn = () => (FL.store.prefs().appearance || {}).hoverTrailer !== false && !reduced.matches;

  function endPreview() {
    clearTimeout(hoverTimer);
    if (!preview) return;
    const box = preview;
    preview = null;
    box.classList.remove("in");
    setTimeout(() => box.remove(), 300);
  }

  function startPreview(card, film) {
    const m = FL.meta.cached(film);
    const id = m && m.trailer;
    const artEl = card.isConnected && card.querySelector(".card-link .art");
    if (!id || !artEl || hoverCard !== card) return;
    const box = document.createElement("div");
    box.className = "art-trailer";
    box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(id) + "?autoplay=1&mute=1&controls=0&loop=1&playlist=" + esc(id) +
      "&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1&enablejsapi=1&origin=" + encodeURIComponent(location.origin) +
      '" allow="autoplay; encrypted-media" title="Trailer" tabindex="-1" aria-hidden="true"></iframe>' +
      '<span class="art-trailer-tag">' + icon("trailer") + "Trailer</span>";
    artEl.appendChild(box);
    preview = box;
    // Only show it once YouTube says it's actually playing — a paused embed would cover the poster with a play button.
    const frame = box.querySelector("iframe");
    const send = (msg) => { try { frame.contentWindow.postMessage(JSON.stringify(msg), "*"); } catch (e) { /* gone */ } };
    frame.addEventListener("load", () => {
      send({ event: "listening", id: 1, channel: "widget" });
      send({ event: "command", func: "mute", args: [] });
      send({ event: "command", func: "playVideo", args: [] });
    });
    box._frame = frame;
    setTimeout(() => { if (preview === box && !box.classList.contains("in")) endPreview(); }, 7000);
  }

  window.addEventListener("message", (e) => {
    if (!preview || !/youtube(-nocookie)?\.com$/.test(new URL(e.origin || "http://x").hostname)) return;
    if (e.source !== (preview._frame && preview._frame.contentWindow)) return;
    let d = e.data;
    try { if (typeof d === "string") d = JSON.parse(d); } catch (err) { return; }
    const playing = d && ((d.event === "onStateChange" && d.info === 1) || (d.info && d.info.playerState === 1));
    if (playing) preview.classList.add("in");
  });

  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.addEventListener("pointerover", (e) => {
      if (e.pointerType !== "mouse") return;
      const card = e.target.closest && e.target.closest(".card[data-id]");
      if (card === hoverCard) return;
      endPreview();
      hoverCard = card;
      if (!card || !previewsOn()) return;
      const film = FL.catalogue.get(card.dataset.id);
      if (!film) return;
      if (!FL.meta.cached(film)) FL.meta.details(film); // fetch the trailer id while you hover
      hoverTimer = setTimeout(() => startPreview(card, film), 2600);
    });
    document.addEventListener("pointerout", (e) => {
      if (!hoverCard || (e.relatedTarget && hoverCard.contains(e.relatedTarget))) return;
      if (e.target.closest && e.target.closest(".card[data-id]") === hoverCard) { endPreview(); hoverCard = null; }
    });
    window.addEventListener("hashchange", () => { endPreview(); hoverCard = null; });
    document.addEventListener("visibilitychange", () => { if (document.hidden) endPreview(); });
  }

  /* ---------- film cards ---------- */

  function metaLine(film) {
    if (film.type === "series") {
      return ["Series", FL.catalogue.yearLabel(film), FL.catalogue.filmLang(film) === "World" ? "" : FL.catalogue.filmLang(film)].filter(Boolean).map(esc).join(" · ");
    }
    const bits = [FL.catalogue.yearLabel(film)];
    const lang = FL.catalogue.filmLang(film);
    if (lang && lang !== "World") bits.push(lang);
    if (film.genres[0]) bits.push(film.genres[0]);
    return bits.map(esc).join(" · ");
  }

  function scoreBit(film, st) {
    if (st.rating) return stars(st.rating, "stars-sm");
    if (film.rating) return '<span class="imdb" title="IMDb rating">★ ' + film.rating.toFixed(1) + "</span>";
    return "";
  }

  /* The best of the best: rated 8+ by enough people (or a huge audience at 7.8+). */
  function mustWatch(film) {
    const r = film.rating;
    if (!r) return false;
    if (film.type === "series") return r >= 8.5 && (film.pop || 0) >= 60;
    if (film.votes) return (r >= 8 && film.votes >= 20000) || (r >= 7.8 && film.votes >= 250000);
    if (film.remote) return r >= 8 && (film.pop || 0) >= 62;
    return false;
  }

  /* Status on the poster's top-left: one tick when watched (×n for rewatches), a heart for favourites, episodes seen. */
  function badges(film, st) {
    let out = "";
    if (st.fav) out += '<span class="badge badge-fav" title="Favourite">' + icon("heart") + "</span>";
    if (film.type === "series") {
      if (st.episodes) out += '<span class="badge badge-seen" title="Episodes watched">' + icon("tv") + "<b>" + st.episodes + "</b></span>";
    } else if (st.watched) {
      out += '<span class="badge badge-seen" title="Watched' + (st.count > 1 ? " " + st.count + "×" : "") + '">' + icon("check") + (st.count > 1 ? "<b>" + st.count + "</b>" : "") + "</span>";
    }
    return (out ? '<div class="badges">' + out + "</div>" : "") + (mustWatch(film) ? '<span class="tag-must">Must watch</span>' : "");
  }

  function progressBar(film) {
    const e = FL.store.peek(film.id);
    const p = e && e.progress;
    if (!p || !p.d || p.t < 60 || p.t / p.d >= 0.92) return "";
    return '<div class="card-progress"><i style="width:' + Math.min(100, (p.t / p.d) * 100).toFixed(1) + '%"></i></div>';
  }

  /* Top-right actions: Watch later (stays visible once saved) and Mark watched (gone once watched — the badge says it). */
  function quick(film, st) {
    const later = '<button type="button" class="qa qa-later' + (st.listed ? " on" : "") + '" data-qa="list" aria-pressed="' + st.listed + '" aria-label="' +
      (st.listed ? "Remove from Watch later" : "Watch later") + '" title="' + (st.listed ? "Saved for later" : "Watch later") + '">' + icon("bookmark") + "</button>";
    const seen = film.type === "series" || st.watched ? "" :
      '<button type="button" class="qa" data-qa="seen" aria-pressed="false" aria-label="Mark as watched" title="Mark watched">' + icon("check") + "</button>";
    return '<div class="card-quick">' + later + seen + "</div>";
  }

  /* Official streaming options (JustWatch, India) — for titles the free hosts don't carry. */
  const whereToWatch = (film) => "https://www.justwatch.com/in/search?q=" + encodeURIComponent(film.title);

  const hrefFor = (film) => "#/" + (film.type === "series" ? "show" : "film") + "/" + encodeURIComponent(film.id);

  function card(film, opts) {
    const o = opts || {};
    const st = FL.store.state(film.id);
    const href = hrefFor(film);
    return '<article class="card' + (st.watched ? " is-watched" : "") + '" data-id="' + esc(film.id) + '" data-variant="card">' +
      '<a class="card-link" href="' + href + '" aria-label="' + esc(film.title) + ", " + esc(FL.catalogue.yearLabel(film)) + '">' +
        art(film, o) + badges(film, st) + progressBar(film) +
      "</a>" + quick(film, st) +
      '<div class="card-body"><a class="card-title" href="' + href + '" tabindex="-1">' + esc(film.title) + "</a>" +
      '<div class="card-meta"><span>' + metaLine(film) + "</span>" + scoreBit(film, st) + "</div>" +
      (o.caption ? '<div class="card-caption">' + o.caption + "</div>" : "") +
      "</div></article>";
  }

  function row(film, opts) {
    const o = opts || {};
    const st = FL.store.state(film.id);
    const href = hrefFor(film);
    const genres = film.genres.slice(0, 3).map(esc).join(", ");
    const lang = FL.catalogue.filmLang(film);
    const show = film.type === "series";
    return '<article class="row' + (st.watched ? " is-watched" : "") + '" data-id="' + esc(film.id) + '" data-variant="row">' +
      (o.rank ? '<span class="row-rank">' + String(o.rank).padStart(2, "0") + "</span>" : "") +
      '<a class="row-art" href="' + href + '" tabindex="-1" aria-hidden="true">' + art(film) + "</a>" +
      '<div class="row-main"><a class="row-title" href="' + href + '">' + esc(film.title) + "</a>" + (mustWatch(film) ? '<span class="tag-must tag-inline">Must watch</span>' : "") +
        '<div class="row-meta">' + (show ? "Series · " : "") + esc(FL.catalogue.yearLabel(film)) + (lang && lang !== "World" ? " · " + esc(lang) : "") + (genres ? " · " + genres : "") + "</div>" +
        (o.caption ? '<div class="row-caption">' + o.caption + "</div>" : "") +
      "</div>" +
      '<div class="row-score">' + (film.rating ? '<span class="imdb">★ ' + film.rating.toFixed(1) + "</span><small>" + compact(film.votes) + "</small>" : "") + "</div>" +
      '<div class="row-you">' + (st.rating ? stars(st.rating, "stars-sm") : st.watched ? '<span class="muted">Watched</span>' : st.episodes ? '<span class="muted">' + st.episodes + " eps</span>" : "") + "</div>" +
      '<div class="row-actions">' +
        '<button type="button" class="qa' + (st.listed ? " on" : "") + '" data-qa="list" aria-pressed="' + st.listed + '" aria-label="Watch later" title="Watch later">' + icon("bookmark") + "</button>" +
        (show ? "" : '<button type="button" class="qa' + (st.watched ? " on" : "") + '" data-qa="seen" aria-pressed="' + st.watched + '" aria-label="Watched" title="Watched">' + icon("check") + "</button>") +
        '<a class="qa" href="' + (show ? href : "#/watch/" + encodeURIComponent(film.id)) + '" aria-label="Play" title="Play">' + icon("play") + "</a>" +
      "</div></article>";
  }

  /* Re-render every visible card/row of a title after its state or data changes. */
  function refreshFilm(id) {
    const film = FL.catalogue.get(id);
    if (!film) return;
    $$('[data-id="' + CSS.escape(id) + '"][data-variant]').forEach((el) => {
      const rank = el.querySelector(".row-rank");
      const caption = el.querySelector(".card-caption, .row-caption");
      const opts = { rank: rank ? +rank.textContent : 0, caption: caption ? caption.innerHTML : "" };
      const tmp = document.createElement("div");
      tmp.innerHTML = el.dataset.variant === "row" ? row(film, opts) : card(film, opts);
      const fresh = tmp.firstChild;
      // Keep the already-loaded poster element to avoid a flash.
      const oldArt = el.querySelector(".art");
      const newArt = fresh.querySelector(".art");
      if (oldArt && newArt && oldArt.querySelector("img.is-in")) newArt.replaceWith(oldArt);
      el.replaceWith(fresh);
    });
  }

  /* Quick actions from any card or row. */
  on(document, "click", "[data-qa]", (e, btn) => {
    const host = btn.closest("[data-id]");
    const film = host && FL.catalogue.get(host.dataset.id);
    if (!film) return;
    e.preventDefault();
    e.stopPropagation();
    const act = btn.dataset.qa;
    if (act === "list") {
      const entry = FL.store.toggleList(film);
      const listed = !!(entry && entry.listed);
      toast(listed ? "Saved to Watch later" : "Removed from Watch later", { action: "Undo", onAction: () => FL.store.toggleList(film) });
    } else if (act === "seen") {
      const st = FL.store.state(film.id);
      if (st.watched && st.count) {
        location.hash = "#/film/" + encodeURIComponent(film.id);
        toast("This film has dated watches — edit them here.");
        return;
      }
      FL.store.setSeen(film, !st.watched);
      if (!st.watched) toast("Marked as watched", { action: "Undo", onAction: () => FL.store.setSeen(film, false) });
      else toast("Marked as unwatched", { action: "Undo", onAction: () => FL.store.setSeen(film, true) });
    }
  });

  /* ---------- rails ---------- */

  function rail(title, films, opts) {
    const o = opts || {};
    if (!films.length && !o.empty) return "";
    return '<section class="rail' + (o.cls ? " " + o.cls : "") + '"' + (o.id ? ' data-rail-id="' + o.id + '"' : "") + ">" +
      '<header class="section-head"><div><h2 class="h2">' + title + "</h2>" + (o.sub ? '<p class="sub">' + o.sub + "</p>" : "") + "</div>" +
      '<div class="section-tools">' + (o.more ? '<a class="link-more" href="' + o.more + '">See all' + icon("arrow-right") + "</a>" : "") +
      '<button type="button" class="icon-btn icon-btn-sm rail-btn" data-rail="-1" aria-label="Scroll left">' + icon("chevron-left") + "</button>" +
      '<button type="button" class="icon-btn icon-btn-sm rail-btn" data-rail="1" aria-label="Scroll right">' + icon("chevron-right") + "</button></div></header>" +
      (films.length ? '<div class="rail-track">' + films.map((f) => card(f, { caption: o.caption ? o.caption(f) : "" })).join("") + "</div>" : o.empty) +
      "</section>";
  }

  on(document, "click", "[data-rail]", (e, btn) => {
    const track = btn.closest(".rail").querySelector(".rail-track");
    if (track) track.scrollBy({ left: +btn.dataset.rail * track.clientWidth * 0.85, behavior: "smooth" });
  });

  /* ---------- toasts ---------- */

  let toastRoot = null;
  function toast(message, opts) {
    const o = opts || {};
    if (!toastRoot) {
      toastRoot = document.createElement("div");
      toastRoot.className = "toasts";
      toastRoot.setAttribute("role", "status");
      toastRoot.setAttribute("aria-live", "polite");
      document.body.appendChild(toastRoot);
    }
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = "<span>" + esc(message) + "</span>" + (o.action ? '<button type="button" class="toast-action">' + esc(o.action) + "</button>" : "");
    if (o.action) {
      el.querySelector("button").addEventListener("click", () => {
        if (o.onAction) o.onAction();
        dismiss();
      });
    }
    toastRoot.appendChild(el);
    while (toastRoot.children.length > 3) toastRoot.firstChild.remove();
    requestAnimationFrame(() => el.classList.add("in"));
    const timer = setTimeout(dismiss, o.timeout || 5000);
    function dismiss() {
      clearTimeout(timer);
      el.classList.remove("in");
      setTimeout(() => el.remove(), 220);
    }
    return dismiss;
  }

  /* ---------- the little Iris character: a five-second check-in at the top right ---------- */

  let nudgeEl = null;
  function nudge(text, emoji) {
    if (nudgeEl) nudgeEl.remove();
    const el = document.createElement("div");
    el.className = "nudge";
    el.setAttribute("role", "status");
    el.innerHTML = '<span class="nudge-face" aria-hidden="true">' + FL.theme.mark({ size: 34, open: 40, cls: "nudge-mark" }) + "<i></i><i></i></span>" +
      '<span class="nudge-text">' + esc(text) + (emoji ? ' <span class="nudge-emoji">' + emoji + "</span>" : "") + "</span>";
    document.body.appendChild(el);
    nudgeEl = el;
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => {
      el.classList.remove("in");
      setTimeout(() => { el.remove(); if (nudgeEl === el) nudgeEl = null; }, 450);
    }, 5000);
  }

  /* ---------- modals ---------- */

  const stack = [];

  function modal(html, opts) {
    const o = opts || {};
    const prevFocus = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop" + (o.sheet ? " is-sheet" : "");
    backdrop.innerHTML = '<div class="modal ' + (o.cls || "") + '" role="dialog" aria-modal="true" aria-label="' + esc(o.label || "Dialog") + '">' + html +
      (o.noClose ? "" : '<button type="button" class="icon-btn modal-x" data-close aria-label="Close">' + icon("x") + "</button>") + "</div>";
    document.body.appendChild(backdrop);
    document.documentElement.classList.add("has-modal");
    requestAnimationFrame(() => backdrop.classList.add("in"));
    const box = backdrop.firstChild;
    const handle = { el: box, close };
    stack.push(handle);

    backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });
    on(box, "click", "[data-close]", () => close());
    setTimeout(() => {
      const first = box.querySelector("[autofocus]") || box.querySelector("input:not([type=file]), button:not(.modal-x), [href], select, textarea, [tabindex]");
      if (first) first.focus({ preventScroll: true });
    }, 30);

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      const i = stack.indexOf(handle);
      if (i !== -1) stack.splice(i, 1);
      backdrop.classList.remove("in");
      setTimeout(() => backdrop.remove(), 220);
      if (!stack.length) document.documentElement.classList.remove("has-modal");
      if (o.onClose) o.onClose();
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    }
    return handle;
  }

  document.addEventListener("keydown", (e) => {
    if (!stack.length) return;
    const top = stack[stack.length - 1];
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      top.close();
    } else if (e.key === "Tab") {
      const f = $$("a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])", top.el).filter((x) => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  }, true);

  function confirm({ title, body, confirmLabel, danger }) {
    return new Promise((resolve) => {
      let answered = false;
      const m = modal(
        '<div class="modal-pad"><h2 class="h2">' + esc(title) + "</h2>" + (body ? '<p class="sub">' + body + "</p>" : "") +
        '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
        '<button type="button" class="btn ' + (danger ? "btn-danger" : "btn-primary") + '" data-ok>' + esc(confirmLabel || "Confirm") + "</button></div></div>",
        { cls: "modal-sm", label: title, onClose: () => { if (!answered) resolve(false); } }
      );
      m.el.querySelector("[data-ok]").addEventListener("click", () => { answered = true; resolve(true); m.close(); });
    });
  }

  const isModalOpen = () => stack.length > 0;
  const closeModals = () => { while (stack.length) stack[stack.length - 1].close(); };

  /* ---------- misc ---------- */

  function empty(title, body, action) {
    return '<div class="empty"><h3 class="h3">' + title + "</h3>" + (body ? "<p>" + body + "</p>" : "") + (action || "") + "</div>";
  }

  function segmented(name, options, value) {
    return '<div class="seg" role="radiogroup" aria-label="' + esc(name) + '">' + options.map(([v, label]) =>
      '<button type="button" role="radio" aria-checked="' + (String(v) === String(value)) + '" class="seg-btn' + (String(v) === String(value) ? " is-on" : "") + '" data-seg="' + esc(name) + '" data-value="' + esc(v) + '">' + label + "</button>"
    ).join("") + "</div>";
  }

  FL.ui = {
    icon, loader, stars, ratingWidget, art, placeholder, card, row, rail, refreshFilm, watchPosters, reveal, hrefFor, whereToWatch,
    toast, nudge, modal, confirm, isModalOpen, closeModals, empty, segmented, metaLine, mustWatch,
  };
})(window.FL = window.FL || {});
