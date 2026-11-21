/* Iris — Dev mode (Settings → Developer, on by default). A small card in the bottom-right corner that shows the app's
   network as it happens. Every request arrives as a spark: a comet with a glowing tail that arcs from the cloud to the
   device, coloured by what it carries, bigger for bigger replies, slower for slower ones, and bursts into a little
   shower of sparks when it lands. A failed one turns red, stalls halfway and fizzles out.

   Under it: throughput over the last minute, and totals (requests, data, average time, how much came from cache).
   Tap the card for the mix by type and the last 40 requests. It says what each request was for (posters, film
   details, AI…), never where it came from.

   Drawn on canvas, and the animation loop only runs while something is moving, so it costs nothing when idle and
   never makes the page relayout while you scroll. Watching only: PerformanceObserver reports finished requests, a
   fetch wrapper catches failures, image errors are caught on the way up. Kept per device. */
(function (FL) {
  "use strict";

  const KEY = "iris_dev_v1";
  const LOG_MAX = 40;
  const MAX_FLYING = 30;
  const WINDOW = 60; // seconds of throughput history

  const KINDS = {
    data: { label: "Data", color: null }, // the accent
    img: { label: "Pictures", color: "#FF6FAE" },
    code: { label: "App code", color: "#FFB547" },
    font: { label: "Fonts", color: "#B794FF" },
    media: { label: "Video", color: "#3EE0C8" },
    other: { label: "Other", color: "#A0A6B0" },
  };
  const FAIL = "#FF4D5E";

  let on = false;
  let el = null;
  let stage = null, sctx = null, spark = null, kctx = null;
  let observer = null;
  let raf = 0;
  let paused = false;
  const packets = [];
  const bits = []; // landing sparks and fizzles
  const ripples = [];
  const log = [];
  const totals = { n: 0, bytes: 0, ms: 0, fails: 0, cached: 0 };
  const byKind = {};
  const perSec = new Array(WINDOW).fill(0);
  let secAt = Math.floor(Date.now() / 1000);

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  function readOn() {
    try { return localStorage.getItem(KEY) !== "0"; } catch (e) { return true; }
  }

  function accent() {
    return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#0A84FF";
  }
  const colorOf = (kind) => KINDS[kind].color || accent();

  /* ---------- what a request was (never where it went) ---------- */

  function kindOf(url, initiator) {
    const path = String(url).split("?")[0].toLowerCase();
    if (/\.(png|jpe?g|webp|gif|svg|avif|ico)$/.test(path) || initiator === "img" || initiator === "image") return "img";
    if (/\.(woff2?|ttf|otf)$/.test(path) || /fonts\.(gstatic|googleapis)/.test(path)) return "font";
    if (/\.(m3u8|mp4|webm|m4s)$/.test(path) || initiator === "video") return "media";
    if (/\.(m?js|css)$/.test(path) || initiator === "script" || initiator === "link" || initiator === "css") return "code";
    if (initiator === "fetch" || initiator === "xmlhttprequest" || initiator === "beacon" || /\.json$/.test(path) || /\/api\//.test(path)) return "data";
    return "other";
  }

  function purposeOf(url, kind) {
    const u = String(url).toLowerCase();
    if (/\/api\/ai/.test(u)) return "AI";
    if (/\/api\/sync/.test(u)) return "Relay sync";
    if (/\/api\/where/.test(u)) return "Where to watch";
    if (/\/api\/(vega|anime)/.test(u)) return "Player";
    if (/\/data\/[a-z]+\.js/.test(u)) return "Catalogue";
    if (kind === "img") return /ytimg/.test(u) ? "Trailer still" : /commons|wikipedia\/commons|upload\.wiki/.test(u) ? "Photo" : "Poster";
    if (kind === "font") return "Font";
    if (kind === "code") return "App code";
    if (kind === "media") return "Video";
    if (/cinemeta|metahub|imdb/.test(u)) return "Film details";
    if (/wikidata|wikipedia|wikimedia/.test(u)) return "Cast & facts";
    if (/anilist|kitsu|jikan/.test(u)) return "Anime details";
    if (/tvmaze/.test(u)) return "Episodes";
    if (/justwatch/.test(u)) return "Where to watch";
    if (/youtube|ytimg/.test(u)) return "Trailer";
    return kind === "data" ? "Data" : "Other";
  }

  function fmtBytes(b) {
    if (!b) return "0 B";
    return b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : b >= 1024 ? (b / 1024).toFixed(b >= 10240 ? 0 : 1) + " KB" : Math.round(b) + " B";
  }
  const fmtMs = (ms) => (ms >= 1000 ? (ms / 1000).toFixed(1) + " s" : Math.round(ms) + " ms");

  /* ---------- the card ---------- */

  function build() {
    el = document.createElement("section");
    el.className = "devnet";
    el.setAttribute("aria-label", "Dev mode: network");
    el.innerHTML =
      '<button type="button" class="devnet-head" data-dn="toggle" aria-expanded="false">' +
        '<span class="devnet-live"><i></i>Live</span><span class="devnet-title">Network</span>' +
        '<span class="devnet-rate" data-dn="rate">0 B/s</span>' +
        '<svg class="devnet-chev" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      "</button>" +
      '<div class="devnet-stage"><canvas data-dn="stage" aria-hidden="true"></canvas>' +
        '<span class="devnet-node devnet-cloud" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.1 4.5 4.5 0 0 0 7 18z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></span>' +
        '<span class="devnet-node devnet-device" aria-hidden="true">' + (FL.theme && FL.theme.mark ? FL.theme.mark({ size: 18, open: 0.9 }) : "") + "</span>" +
      "</div>" +
      '<canvas class="devnet-spark" data-dn="spark" aria-hidden="true"></canvas>' +
      '<dl class="devnet-stats">' +
        '<div><dt>Reqs</dt><dd data-dn="n">0</dd></div>' +
        '<div><dt>Data</dt><dd data-dn="bytes">0 B</dd></div>' +
        '<div><dt>Avg</dt><dd data-dn="ms">–</dd></div>' +
        '<div><dt>Cache</dt><dd data-dn="cached">–</dd></div>' +
      "</dl>" +
      '<p class="devnet-fails" data-dn="fails" hidden></p>' +
      '<div class="devnet-more" hidden>' +
        '<div class="devnet-mix" data-dn="mix"></div>' +
        '<div class="devnet-legend" data-dn="legend"></div>' +
        '<div class="devnet-best" data-dn="best"></div>' +
        '<ol class="devnet-log" data-dn="log"></ol>' +
        '<div class="devnet-actions"><button type="button" data-dn="pause">Pause</button><button type="button" data-dn="clear">Clear</button><button type="button" data-dn="off">Turn off</button></div>' +
      "</div>";
    stage = el.querySelector('[data-dn="stage"]');
    spark = el.querySelector('[data-dn="spark"]');
    sctx = stage.getContext("2d");
    kctx = spark.getContext("2d");
    el.addEventListener("click", onClick);
    document.body.appendChild(el);
    size();
    window.addEventListener("resize", size);
    requestAnimationFrame(() => el.classList.add("is-in"));
  }

  function onClick(e) {
    const b = e.target.closest("[data-dn]");
    const what = b && b.dataset.dn;
    if (what === "toggle") {
      const more = el.querySelector(".devnet-more");
      more.hidden = !more.hidden;
      el.classList.toggle("is-open", !more.hidden);
      b.setAttribute("aria-expanded", String(!more.hidden));
      size();
      paintMore();
    } else if (what === "clear") {
      log.length = 0; perSec.fill(0);
      Object.keys(totals).forEach((k) => { totals[k] = 0; });
      Object.keys(byKind).forEach((k) => delete byKind[k]);
      paintStats(); paintMore(); drawSpark();
    } else if (what === "pause") {
      paused = !paused;
      b.textContent = paused ? "Resume" : "Pause";
      el.classList.toggle("is-paused", paused);
    } else if (what === "off") {
      set(false);
      if (FL.ui && FL.ui.toast) FL.ui.toast("Dev mode is off. Turn it back on in Settings → Developer.");
    }
  }

  function size() {
    if (!el) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    [stage, spark].forEach((c) => {
      const r = c.getBoundingClientRect();
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
      c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    drawSpark();
  }

  function paintStats() {
    if (!el) return;
    const q = (k) => el.querySelector('[data-dn="' + k + '"]');
    q("n").textContent = totals.n.toLocaleString();
    q("bytes").textContent = fmtBytes(totals.bytes);
    q("ms").textContent = totals.n ? fmtMs(totals.ms / totals.n) : "–";
    q("cached").textContent = totals.n ? Math.round((totals.cached / totals.n) * 100) + "%" : "–";
    const f = q("fails");
    f.hidden = !totals.fails;
    f.textContent = totals.fails + " failed · " + Math.round(((totals.n - totals.fails) / Math.max(1, totals.n)) * 100) + "% ok";
  }

  function paintMore() {
    if (!el || el.querySelector(".devnet-more").hidden) return;
    const kinds = Object.keys(KINDS).filter((k) => byKind[k]);
    const sum = kinds.reduce((a, k) => a + Math.max(1, byKind[k].bytes), 0) || 1;
    el.querySelector('[data-dn="mix"]').innerHTML = kinds.map((k) =>
      '<i style="flex:' + Math.max(1, byKind[k].bytes) / sum + ";background:" + colorOf(k) + '"></i>').join("");
    el.querySelector('[data-dn="legend"]').innerHTML = kinds.map((k) =>
      '<span><i style="background:' + colorOf(k) + '"></i>' + KINDS[k].label + " <b>" + byKind[k].n + "</b><small>" + fmtBytes(byKind[k].bytes) + "</small></span>").join("");
    const done = log.filter((r) => !r.fail);
    const slow = done.slice().sort((a, b) => b.ms - a.ms)[0];
    const big = done.slice().sort((a, b) => b.bytes - a.bytes)[0];
    el.querySelector('[data-dn="best"]').innerHTML = (slow ? "<span>Slowest <b>" + esc(slow.what) + "</b> " + fmtMs(slow.ms) + "</span>" : "") +
      (big && big.bytes ? "<span>Biggest <b>" + esc(big.what) + "</b> " + fmtBytes(big.bytes) + "</span>" : "");
    el.querySelector('[data-dn="log"]').innerHTML = log.length
      ? log.map((r) => '<li class="' + (r.fail ? "is-fail" : "") + '"><i style="background:' + (r.fail ? FAIL : colorOf(r.kind)) + '"></i>' +
          '<span class="devnet-what">' + esc(r.what) + "<small>" + r.ago() + "</small></span>" +
          "<span class=\"devnet-num\">" + (r.fail ? esc(r.status || "failed") : r.cached ? "cache" : r.bytes ? fmtBytes(r.bytes) : "–") + "</span>" +
          '<span class="devnet-num">' + fmtMs(r.ms) + "</span></li>").join("")
      : '<li class="devnet-empty">Waiting for the next request…</li>';
  }

  /* ---------- throughput sparkline ---------- */

  function tick() {
    const now = Math.floor(Date.now() / 1000);
    while (secAt < now) { perSec.shift(); perSec.push(0); secAt++; }
  }

  function drawSpark() {
    if (!el || !kctx) return;
    tick();
    const w = spark.clientWidth, h = spark.clientHeight;
    kctx.clearRect(0, 0, w, h);
    const max = Math.max(2048, ...perSec);
    const pts = perSec.map((v, i) => [(i / (WINDOW - 1)) * w, h - 2 - (v / max) * (h - 6)]);
    const a = accent();
    const g = kctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, hexA(a, 0.35));
    g.addColorStop(1, hexA(a, 0));
    kctx.beginPath();
    pts.forEach(([x, y], i) => (i ? kctx.lineTo(x, y) : kctx.moveTo(x, y)));
    kctx.lineTo(w, h); kctx.lineTo(0, h); kctx.closePath();
    kctx.fillStyle = g; kctx.fill();
    kctx.beginPath();
    pts.forEach(([x, y], i) => (i ? kctx.lineTo(x, y) : kctx.moveTo(x, y)));
    kctx.strokeStyle = a; kctx.lineWidth = 1.4; kctx.lineJoin = "round"; kctx.stroke();
    const last = pts[pts.length - 1];
    kctx.beginPath(); kctx.arc(last[0] - 1.5, last[1], 2.2, 0, Math.PI * 2); kctx.fillStyle = "#fff"; kctx.fill();
    const rate = el.querySelector('[data-dn="rate"]');
    const recent = perSec.slice(-5).reduce((x, y) => x + y, 0) / 5;
    rate.textContent = fmtBytes(recent) + "/s";
  }

  function hexA(color, alpha) {
    const m = /^#?([0-9a-f]{6})/i.exec(color.trim());
    if (!m) return "rgba(10,132,255," + alpha + ")";
    const n = parseInt(m[1], 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + alpha + ")";
  }

  /* ---------- sparks ---------- */

  function launch(kind, bytes, ms, fail) {
    if (!el || paused || document.hidden || packets.length >= MAX_FLYING) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    const size = Math.max(1.6, Math.min(4.2, 1.2 + Math.log2(1 + (bytes || 0) / 4096) * 0.55));
    const dur = Math.max(520, Math.min(1900, 480 + (ms || 0) * 0.9));
    const bend = (Math.random() * 2 - 1) * h * 0.42; // each spark takes its own arc
    packets.push({
      t0: performance.now(), dur, size, fail, color: fail ? FAIL : colorOf(kind),
      x0: 26, y0: h / 2, x1: w - 26, y1: h / 2, cx: w / 2, cy: h / 2 + bend, trail: [],
      stopAt: fail ? 0.5 + Math.random() * 0.15 : 1,
    });
    run();
  }

  function at(p, t) {
    const u = 1 - t;
    return [u * u * p.x0 + 2 * u * t * p.cx + t * t * p.x1, u * u * p.y0 + 2 * u * t * p.cy + t * t * p.y1];
  }

  function burst(x, y, color, n, spread, fizzle) {
    for (let i = 0; i < n; i++) {
      const a = fizzle ? Math.PI / 2 + (Math.random() - 0.5) * 1.6 : Math.PI + (Math.random() - 0.5) * spread;
      const v = fizzle ? 0.4 + Math.random() * 0.8 : 0.6 + Math.random() * 1.5;
      bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (fizzle ? 0 : 0.4), life: 1, decay: 0.022 + Math.random() * 0.03, color, r: 0.6 + Math.random() * 1.2, g: fizzle ? 0.05 : 0.025 });
    }
  }

  const sprites = new Map();
  function sprite(color) {
    if (sprites.has(color)) return sprites.get(color);
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, hexA(color, 0.95));
    g.addColorStop(0.35, hexA(color, 0.45));
    g.addColorStop(1, hexA(color, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
    if (sprites.size > 12) sprites.clear(); // the accent changed a few times
    sprites.set(color, c);
    return c;
  }

  function run() { if (!raf) raf = requestAnimationFrame(frame); }

  function frame(now) {
    raf = 0;
    if (!el) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    sctx.clearRect(0, 0, w, h);
    // The wire: a faint dotted arc of where sparks travel.
    sctx.save();
    sctx.setLineDash([2, 4]);
    sctx.lineDashOffset = -(now / 60) % 6;
    sctx.strokeStyle = "rgba(160,166,176,.28)";
    sctx.lineWidth = 1;
    sctx.beginPath(); sctx.moveTo(26, h / 2); sctx.lineTo(w - 26, h / 2); sctx.stroke();
    sctx.restore();
    sctx.globalCompositeOperation = "lighter";

    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i];
      const raw = Math.min(1, (now - p.t0) / p.dur);
      const t = Math.min(p.stopAt, raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2); // ease in-out
      const [x, y] = at(p, t);
      p.trail.push([x, y]);
      if (p.trail.length > 12) p.trail.shift();
      // Tail: the glow sprite stamped along the last few positions, fading and shrinking toward the back; then the
      // head: a bright core in a soft halo. Sprites, not gradients per frame, so a busy minute stays cheap.
      const glow = sprite(p.color);
      const n = p.trail.length;
      for (let k = 0; k < n; k++) {
        const f = (k + 1) / n;
        const r = p.size * (1.2 + 2.2 * f);
        sctx.globalAlpha = f * 0.55;
        sctx.drawImage(glow, p.trail[k][0] - r, p.trail[k][1] - r, r * 2, r * 2);
      }
      sctx.globalAlpha = 1;
      const hr = p.size * 4.2;
      sctx.drawImage(glow, x - hr, y - hr, hr * 2, hr * 2);
      sctx.fillStyle = "#fff";
      sctx.beginPath(); sctx.arc(x, y, p.size * 0.7, 0, Math.PI * 2); sctx.fill();

      if (t >= p.stopAt) {
        packets.splice(i, 1);
        if (p.fail) burst(x, y, FAIL, 10, 0, true);
        else {
          burst(x, y, p.color, 6 + Math.round(p.size * 2), 2.2, false);
          ripples.push({ x: w - 26, y: h / 2, r: 6, life: 1, color: p.color });
          const dev = el.querySelector(".devnet-device");
          dev.classList.remove("is-hit"); void dev.offsetWidth; dev.classList.add("is-hit");
        }
      }
    }

    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.x += b.vx; b.y += b.vy; b.vy += b.g; b.vx *= 0.97; b.life -= b.decay;
      if (b.life <= 0) { bits.splice(i, 1); continue; }
      sctx.fillStyle = hexA(b.color, b.life);
      sctx.beginPath(); sctx.arc(b.x, b.y, b.r * (0.5 + b.life * 0.5), 0, Math.PI * 2); sctx.fill();
    }

    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.r += 0.9; r.life -= 0.045;
      if (r.life <= 0) { ripples.splice(i, 1); continue; }
      sctx.strokeStyle = hexA(r.color, r.life * 0.7);
      sctx.lineWidth = 1.2;
      sctx.beginPath(); sctx.arc(r.x, r.y, r.r + 6, 0, Math.PI * 2); sctx.stroke();
    }
    sctx.globalCompositeOperation = "source-over";
    if (packets.length || bits.length || ripples.length) run();
    else frameIdle();
  }

  // One last plain frame with the wire, so the stage isn't left with a half-faded spark.
  function frameIdle() {
    const w = stage.clientWidth, h = stage.clientHeight;
    sctx.clearRect(0, 0, w, h);
    sctx.setLineDash([2, 4]);
    sctx.strokeStyle = "rgba(160,166,176,.28)";
    sctx.lineWidth = 1;
    sctx.beginPath(); sctx.moveTo(26, h / 2); sctx.lineTo(w - 26, h / 2); sctx.stroke();
    sctx.setLineDash([]);
  }

  /* ---------- recording ---------- */

  function record(url, kind, bytes, ms, fail, status, cached) {
    if (/\/assets\/js\/devmode\.js/.test(url)) return;
    totals.n++;
    totals.bytes += bytes || 0;
    totals.ms += ms || 0;
    if (fail) totals.fails++;
    if (cached) totals.cached++;
    const k = byKind[kind] || (byKind[kind] = { n: 0, bytes: 0 });
    k.n++; k.bytes += bytes || 0;
    tick();
    perSec[WINDOW - 1] += bytes || 0;
    const at0 = Date.now();
    log.unshift({ what: purposeOf(url, kind), kind, bytes, ms: ms || 0, fail, status, cached, ago: () => {
      const s = Math.round((Date.now() - at0) / 1000);
      return s < 5 ? "just now" : s < 60 ? s + "s ago" : Math.round(s / 60) + "m ago";
    } });
    if (log.length > LOG_MAX) log.length = LOG_MAX;
    launch(kind, bytes, ms, fail);
    schedulePaint();
  }

  let paintTimer = 0;
  function schedulePaint() {
    if (paintTimer) return;
    paintTimer = setTimeout(() => { paintTimer = 0; paintStats(); paintMore(); drawSpark(); }, 120);
  }

  function onEntries(list) {
    if (!on) return;
    list.getEntries().forEach((e) => {
      const status = e.responseStatus || 0;
      const fail = status >= 400;
      const bytes = e.transferSize || 0;
      const cached = !fail && bytes === 0 && (e.decodedBodySize > 0 || e.duration < 5);
      record(e.name, kindOf(e.name, e.initiatorType), bytes || e.encodedBodySize || 0, e.duration, fail, fail ? String(status) : "", cached);
    });
  }

  const realFetch = window.fetch;
  if (realFetch && !realFetch.__irisDev) {
    const wrapped = function (input) {
      const t0 = performance.now();
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      return realFetch.apply(this, arguments).catch((err) => {
        if (on && !(err && err.name === "AbortError")) record(url, "data", 0, performance.now() - t0, true, "no answer", false);
        throw err;
      });
    };
    wrapped.__irisDev = true;
    window.fetch = wrapped;
  }
  window.addEventListener("error", (e) => {
    const t = e.target;
    if (on && t && t.tagName === "IMG" && t.src && !t.src.startsWith("data:")) record(t.currentSrc || t.src, "img", 0, 0, true, "broken", false);
  }, true);

  let sparkTimer = 0;
  function start() {
    if (!el) build();
    if (!observer && "PerformanceObserver" in window) {
      observer = new PerformanceObserver(onEntries);
      try { observer.observe({ type: "resource", buffered: true }); } catch (e) { observer.observe({ entryTypes: ["resource"] }); }
    }
    clearInterval(sparkTimer);
    sparkTimer = setInterval(() => { if (!document.hidden) drawSpark(); }, 1000);
    paintStats();
    frameIdle();
  }

  function stop() {
    if (observer) { observer.disconnect(); observer = null; }
    clearInterval(sparkTimer);
    cancelAnimationFrame(raf); raf = 0;
    packets.length = bits.length = ripples.length = 0;
    window.removeEventListener("resize", size);
    if (el) {
      const old = el;
      el = null;
      old.classList.remove("is-in");
      setTimeout(() => old.remove(), 260);
    }
  }

  function set(value) {
    on = !!value;
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) { /* private mode: for this visit only */ }
    on ? start() : stop();
    if (FL.app && FL.app.devChanged) FL.app.devChanged(on);
  }

  function init() {
    on = readOn();
    if (on) start();
  }

  FL.devmode = { set, get on() { return on; }, init };
  // Deferred scripts run before DOMContentLoaded, ahead of theme.js (the card shows the Iris mark), so wait for it;
  // the observer is buffered and still sees what loaded during boot.
  if (document.readyState === "complete") init();
  else document.addEventListener("DOMContentLoaded", init, { once: true });
})(window.FL = window.FL || {});
