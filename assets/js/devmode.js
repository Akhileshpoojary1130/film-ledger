/* Iris — Dev mode (Settings → Developer, on by default). A slim card in the bottom-right corner: every request the
   app makes arrives as a spark that arcs from the cloud to the device, trailing a tapered ribbon of light, coloured by
   what it carries, bigger for bigger replies and slower for slower ones. When it lands the device's aperture blinks
   and a little bloom of sparks spills out; a failed one turns red, stalls halfway and fizzles down. Under it, one
   line: requests, data, average time, speed. Tap for the mix by type and the last requests, named by what they were
   for (posters, film details, AI…), never where they came from.

   Canvas only, and the loop only runs while something moves: nothing to pay for when idle, no layout while you
   scroll. Watching only: PerformanceObserver reports finished requests, a fetch wrapper catches failures, image errors
   are caught on the way up. Kept per device. */
(function (FL) {
  "use strict";

  const KEY = "iris_dev_v1";
  const LOG_MAX = 30;
  const MAX_FLYING = 24;
  const PAD = 18; // where the sparks leave and land, from each edge of the stage

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
  let stage = null, ctx = null;
  let observer = null;
  let raf = 0;
  const packets = [];
  const bits = [];
  const blooms = [];
  const log = [];
  const totals = { n: 0, bytes: 0, ms: 0, fails: 0 };
  const byKind = {};
  const recent = []; // [time, bytes] for the speed readout

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  function readOn() {
    try { return localStorage.getItem(KEY) !== "0"; } catch (e) { return true; }
  }
  let accentCache = "";
  function accent() {
    return accentCache || (accentCache = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#0A84FF");
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

  function hexA(color, alpha) {
    const m = /^#?([0-9a-f]{6})/i.exec(String(color).trim());
    if (!m) return "rgba(10,132,255," + alpha + ")";
    const n = parseInt(m[1], 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + alpha + ")";
  }

  /* ---------- the card ---------- */

  function build() {
    el = document.createElement("section");
    el.className = "devnet";
    el.setAttribute("aria-label", "Dev mode: network");
    el.innerHTML =
      '<button type="button" class="devnet-main" data-dn="toggle" aria-expanded="false" title="Dev mode: tap for details">' +
        '<span class="devnet-stage"><canvas aria-hidden="true"></canvas>' +
          '<span class="devnet-node devnet-cloud" aria-hidden="true"><svg viewBox="0 0 24 24" width="12" height="12"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.1 4.5 4.5 0 0 0 7 18z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></span>' +
          '<span class="devnet-node devnet-device" aria-hidden="true">' + (FL.theme && FL.theme.mark ? FL.theme.mark({ size: 15, open: 0.9, blink: true }) : "") + "</span>" +
        "</span>" +
        '<span class="devnet-line"><i class="devnet-live"></i><b data-dn="n">0</b> req<span>·</span><b data-dn="bytes">0 B</b><span>·</span><b data-dn="ms">–</b>' +
          '<em data-dn="fails"></em><span class="devnet-rate" data-dn="rate"></span></span>' +
      "</button>" +
      '<div class="devnet-more" hidden>' +
        '<div class="devnet-mix" data-dn="mix"></div>' +
        '<div class="devnet-legend" data-dn="legend"></div>' +
        '<ol class="devnet-log" data-dn="log"></ol>' +
        '<div class="devnet-actions"><button type="button" data-dn="clear">Clear</button><button type="button" data-dn="off">Turn off</button></div>' +
      "</div>";
    stage = el.querySelector("canvas");
    ctx = stage.getContext("2d");
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
      requestAnimationFrame(size);
      paintMore();
    } else if (what === "clear") {
      log.length = 0; recent.length = 0;
      Object.keys(totals).forEach((k) => { totals[k] = 0; });
      Object.keys(byKind).forEach((k) => delete byKind[k]);
      paintLine(); paintMore();
    } else if (what === "off") {
      set(false);
      if (FL.ui && FL.ui.toast) FL.ui.toast("Dev mode is off. Turn it back on in Settings → Developer.");
    }
  }

  function size() {
    if (!el) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = stage.getBoundingClientRect();
    stage.width = Math.max(1, Math.round(r.width * dpr));
    stage.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    accentCache = "";
    idle();
  }

  function paintLine() {
    if (!el) return;
    accentCache = ""; // the look may have changed
    const q = (k) => el.querySelector('[data-dn="' + k + '"]');
    q("n").textContent = totals.n.toLocaleString();
    q("bytes").textContent = fmtBytes(totals.bytes);
    q("ms").textContent = totals.n ? fmtMs(totals.ms / totals.n) : "–";
    q("fails").textContent = totals.fails ? "✕ " + totals.fails : "";
    const now = performance.now();
    while (recent.length && now - recent[0][0] > 5000) recent.shift();
    const rate = recent.reduce((a, x) => a + x[1], 0) / 5;
    q("rate").textContent = rate ? fmtBytes(rate) + "/s" : "";
  }

  function paintMore() {
    if (!el || el.querySelector(".devnet-more").hidden) return;
    const kinds = Object.keys(KINDS).filter((k) => byKind[k]);
    const sum = kinds.reduce((a, k) => a + Math.max(1, byKind[k].bytes), 0) || 1;
    el.querySelector('[data-dn="mix"]').innerHTML = kinds.map((k) =>
      '<i style="flex:' + Math.max(1, byKind[k].bytes) / sum + ";background:" + colorOf(k) + '"></i>').join("");
    el.querySelector('[data-dn="legend"]').innerHTML = kinds.map((k) =>
      '<span><i style="background:' + colorOf(k) + '"></i>' + KINDS[k].label + " <b>" + byKind[k].n + "</b></span>").join("");
    el.querySelector('[data-dn="log"]').innerHTML = log.length
      ? log.map((r) => '<li class="' + (r.fail ? "is-fail" : "") + '"><i style="background:' + (r.fail ? FAIL : colorOf(r.kind)) + '"></i>' +
          '<span class="devnet-what">' + esc(r.what) + "</span>" +
          '<span class="devnet-num">' + (r.fail ? esc(r.status || "failed") : r.bytes ? fmtBytes(r.bytes) : "–") + "</span>" +
          '<span class="devnet-num">' + fmtMs(r.ms) + "</span></li>").join("")
      : '<li class="devnet-empty">Waiting for the next request…</li>';
  }

  /* ---------- sparks ---------- */

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // ease in-out cubic

  function launch(kind, bytes, ms, fail) {
    if (!el || document.hidden || packets.length >= MAX_FLYING) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    const size = Math.max(1.3, Math.min(3.2, 1.1 + Math.log2(1 + (bytes || 0) / 4096) * 0.45));
    const dur = Math.max(560, Math.min(1800, 520 + (ms || 0) * 0.8));
    const bend = (Math.random() * 2 - 1) * h * 0.55; // each spark its own arc
    const color = fail ? FAIL : colorOf(kind);
    packets.push({ t0: performance.now(), dur, size, fail, color, x0: PAD, y0: h / 2, x1: w - PAD, y1: h / 2, cx: w / 2, cy: h / 2 + bend,
      trail: [], stopAt: fail ? 0.5 + Math.random() * 0.12 : 1, phase: Math.random() * 6.28 });
    blooms.push({ x: PAD, y: h / 2, r: 3, life: 0.6, color }); // a puff as it leaves
    run();
  }

  function at(p, t) {
    const u = 1 - t;
    return [u * u * p.x0 + 2 * u * t * p.cx + t * t * p.x1, u * u * p.y0 + 2 * u * t * p.cy + t * t * p.y1];
  }

  function spill(x, y, color, n, fizzle) {
    for (let i = 0; i < n; i++) {
      const a = fizzle ? Math.PI / 2 + (Math.random() - 0.5) * 1.4 : Math.PI + (Math.random() - 0.5) * 2.6;
      const v = fizzle ? 0.3 + Math.random() * 0.6 : 0.5 + Math.random() * 1.3;
      bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, decay: 0.03 + Math.random() * 0.03, color, r: 0.5 + Math.random() * 0.9, g: fizzle ? 0.06 : 0.012 });
    }
  }

  function run() { if (!raf) raf = requestAnimationFrame(frame); }

  function wire(now) {
    const w = stage.clientWidth, h = stage.clientHeight;
    const g = ctx.createLinearGradient(PAD, 0, w - PAD, 0);
    g.addColorStop(0, "rgba(160,166,176,0.05)");
    g.addColorStop(0.5, "rgba(160,166,176,0.22)");
    g.addColorStop(1, "rgba(160,166,176,0.05)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 1;
    ctx.setLineDash([1.5, 4]);
    ctx.lineDashOffset = -((now || 0) / 70) % 5.5;
    ctx.beginPath(); ctx.moveTo(PAD, h / 2); ctx.lineTo(w - PAD, h / 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  function frame(now) {
    raf = 0;
    if (!el) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    ctx.clearRect(0, 0, w, h);
    wire(now);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i];
      const raw = Math.min(1, (now - p.t0) / p.dur);
      const t = Math.min(p.stopAt, ease(raw));
      let [x, y] = at(p, t);
      y += Math.sin(t * 9 + p.phase) * 1.2 * (1 - t); // a slight flutter that settles as it lands
      p.trail.push([x, y]);
      if (p.trail.length > 16) p.trail.shift();
      // The ribbon: thin and faint at the tail, full and bright at the head.
      const n = p.trail.length;
      for (let k = 1; k < n; k++) {
        const f = k / n;
        ctx.strokeStyle = hexA(p.color, f * f * 0.9);
        ctx.lineWidth = p.size * (0.25 + f * 1.1);
        ctx.beginPath(); ctx.moveTo(p.trail[k - 1][0], p.trail[k - 1][1]); ctx.lineTo(p.trail[k][0], p.trail[k][1]); ctx.stroke();
      }
      ctx.fillStyle = hexA(p.color, 0.25);
      ctx.beginPath(); ctx.arc(x, y, p.size * 2.6, 0, 6.283); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(x, y, p.size * 0.65, 0, 6.283); ctx.fill();

      if (t >= p.stopAt) {
        packets.splice(i, 1);
        if (p.fail) spill(x, y, FAIL, 9, true);
        else {
          spill(x, y, p.color, 5 + Math.round(p.size * 2), false);
          blooms.push({ x: w - PAD, y: h / 2, r: 5, life: 1, color: p.color });
          land();
        }
      }
    }

    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.x += b.vx; b.y += b.vy; b.vy += b.g; b.vx *= 0.96; b.vy *= 0.98; b.life -= b.decay;
      if (b.life <= 0) { bits.splice(i, 1); continue; }
      ctx.fillStyle = hexA(b.color, b.life * 0.9);
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.4 + b.life * 0.6), 0, 6.283); ctx.fill();
    }

    for (let i = blooms.length - 1; i >= 0; i--) {
      const r = blooms[i];
      r.r += 0.7; r.life -= 0.05;
      if (r.life <= 0) { blooms.splice(i, 1); continue; }
      ctx.strokeStyle = hexA(r.color, r.life * 0.55);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r + 4, 0, 6.283); ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    if (packets.length || bits.length || blooms.length) run();
    else idle();
  }

  function idle() {
    if (!ctx) return;
    ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
    wire(0);
  }

  // The device's aperture blinks as a spark lands (not more than about four times a second).
  let lastBlink = 0;
  function land() {
    const now = performance.now();
    if (now - lastBlink < 240 || !el) return;
    lastBlink = now;
    const dev = el.querySelector(".devnet-device");
    dev.classList.remove("is-hit"); void dev.offsetWidth; dev.classList.add("is-hit");
    if (FL.theme && FL.theme.markBlink) FL.theme.markBlink(dev.querySelector("svg"));
  }

  /* ---------- recording ---------- */

  function record(url, kind, bytes, ms, fail, status) {
    if (/\/assets\/js\/devmode\.js/.test(url)) return;
    totals.n++;
    totals.bytes += bytes || 0;
    totals.ms += ms || 0;
    if (fail) totals.fails++;
    const k = byKind[kind] || (byKind[kind] = { n: 0, bytes: 0 });
    k.n++; k.bytes += bytes || 0;
    recent.push([performance.now(), bytes || 0]);
    log.unshift({ what: purposeOf(url, kind), kind, bytes, ms: ms || 0, fail, status });
    if (log.length > LOG_MAX) log.length = LOG_MAX;
    launch(kind, bytes, ms, fail);
    schedulePaint();
  }

  let paintTimer = 0;
  function schedulePaint() {
    if (paintTimer) return;
    paintTimer = setTimeout(() => { paintTimer = 0; paintLine(); paintMore(); }, 150);
  }

  function onEntries(list) {
    if (!on) return;
    list.getEntries().forEach((e) => {
      const status = e.responseStatus || 0;
      const fail = status >= 400;
      record(e.name, kindOf(e.name, e.initiatorType), e.transferSize || e.encodedBodySize || 0, e.duration, fail, fail ? String(status) : "");
    });
  }

  const realFetch = window.fetch;
  if (realFetch && !realFetch.__irisDev) {
    const wrapped = function (input) {
      const t0 = performance.now();
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      return realFetch.apply(this, arguments).catch((err) => {
        if (on && !(err && err.name === "AbortError")) record(url, "data", 0, performance.now() - t0, true, "no answer");
        throw err;
      });
    };
    wrapped.__irisDev = true;
    window.fetch = wrapped;
  }
  window.addEventListener("error", (e) => {
    const t = e.target;
    if (on && t && t.tagName === "IMG" && t.src && !t.src.startsWith("data:")) record(t.currentSrc || t.src, "img", 0, 0, true, "broken");
  }, true);

  let lineTimer = 0;
  function start() {
    if (!el) build();
    if (!observer && "PerformanceObserver" in window) {
      observer = new PerformanceObserver(onEntries);
      try { observer.observe({ type: "resource", buffered: true }); } catch (e) { observer.observe({ entryTypes: ["resource"] }); }
    }
    clearInterval(lineTimer);
    lineTimer = setInterval(() => { if (!document.hidden) paintLine(); }, 1000); // the speed settles back to nothing
    paintLine();
  }

  function stop() {
    if (observer) { observer.disconnect(); observer = null; }
    clearInterval(lineTimer);
    cancelAnimationFrame(raf); raf = 0;
    packets.length = bits.length = blooms.length = 0;
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
