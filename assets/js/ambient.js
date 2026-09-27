/* Iris — ambient backgrounds.
   "Lights": a few lamps drift behind a pane of frosted glass. A lamp near the glass reads as a bright, fairly
   defined glow; as it drifts away it dims and scatters wider. Lamps move slowly in 3D and bounce softly off
   each other and the edges. Drawn on a tiny canvas and scaled up, so the blur is free and the cost is negligible.
   "Aurora": slow CSS light ribbons (no script per frame). Both pause when the tab is hidden and stay still
   when motion is set to calm.
   "Artwork": the title you're looking at, blurred into a soft wash of its colours behind the page (like Apple TV).
   Pages hand it their artwork with FL.ambient.art(url); it crossfades from one to the next. */
(function (FL) {
  "use strict";

  const SCALE = 7; // canvas px per CSS px (1 / SCALE resolution)
  const COUNT = 6;
  const NEAR = 0.55; // lamps keep this far back from the glass: wide, faint glows, never a defined ball
  let host = null;
  let canvas = null;
  let ctx = null;
  let raf = 0;
  let kind = "off";
  let lamps = [];
  let palette = [];
  let last = 0;
  let still = false;

  function hsl(hex) {
    const [r, g, b] = FL.theme.parseHex(hex).map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    const l = (max + min) / 2;
    const d = max - min;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [(h + 360) % 360, s, l];
  }

  /* Lamp colours: the accent, two neighbours on the wheel and a quiet complement. */
  function colours() {
    const [h, s] = hsl(FL.theme.accent());
    const sat = Math.max(0.55, Math.min(0.9, s || 0.6));
    return [[h, sat], [h + 38, sat], [h - 46, sat * 0.9], [h + 180, sat * 0.5], [h + 12, sat], [h - 18, sat * 0.8]];
  }

  function seed() {
    lamps = [];
    for (let i = 0; i < COUNT; i++) {
      lamps.push({
        x: 0.15 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.7, z: NEAR + Math.random() * (1 - NEAR),
        vx: (Math.random() - 0.5) * 0.03, vy: (Math.random() - 0.5) * 0.024, vz: (Math.random() - 0.5) * 0.02,
        r: 0.16 + Math.random() * 0.1, c: i % palette.length,
      });
    }
  }

  function resize() {
    if (!canvas) return;
    canvas.width = Math.max(40, Math.round(innerWidth / SCALE));
    canvas.height = Math.max(40, Math.round(innerHeight / SCALE));
  }

  function step(dt) {
    lamps.forEach((p) => {
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.x < 0.02 || p.x > 0.98) { p.vx = -p.vx; p.x = Math.min(0.98, Math.max(0.02, p.x)); }
      if (p.y < 0.02 || p.y > 0.98) { p.vy = -p.vy; p.y = Math.min(0.98, Math.max(0.02, p.y)); }
      if (p.z < NEAR || p.z > 1) { p.vz = -p.vz; p.z = Math.min(1, Math.max(NEAR, p.z)); }
    });
    // Soft elastic collisions between equal lamps: swap the velocity along the line between them.
    for (let i = 0; i < lamps.length; i++) {
      for (let j = i + 1; j < lamps.length; j++) {
        const a = lamps[i];
        const b = lamps[j];
        const dx = b.x - a.x, dy = b.y - a.y, dz = (b.z - a.z) * 0.6;
        const dist = Math.hypot(dx, dy, dz) || 1e-4;
        const min = (a.r + b.r) * 0.55;
        if (dist >= min) continue;
        const nx = dx / dist, ny = dy / dist, nz = dz / dist;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny + (a.vz - b.vz) * nz;
        if (rel <= 0) continue;
        a.vx -= rel * nx; a.vy -= rel * ny; a.vz -= rel * nz;
        b.vx += rel * nx; b.vy += rel * ny; b.vz += rel * nz;
      }
    }
  }

  function draw() {
    const w = canvas.width, h = canvas.height, unit = Math.max(w, h);
    const light = document.documentElement.dataset.mode === "light";
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = light ? "source-over" : "lighter";
    lamps.slice().sort((a, b) => b.z - a.z).forEach((p) => {
      // Near the glass: smaller, brighter, a firmer core. Far: wider, dimmer, fully scattered.
      const spread = p.r * (0.75 + p.z * 1.5) * unit;
      const glow = (light ? 0.12 : 0.13) * (1 - p.z * 0.5);
      const core = 0.2 * (1 - p.z);
      const [hue, sat] = palette[p.c];
      const col = (a) => "hsla(" + hue.toFixed(0) + ", " + (sat * 100).toFixed(0) + "%, " + (light ? 62 : 48) + "%, " + a.toFixed(3) + ")";
      const g = ctx.createRadialGradient(p.x * w, p.y * h, 0, p.x * w, p.y * h, spread);
      g.addColorStop(0, col(glow));
      g.addColorStop(Math.max(0.01, core), col(glow * 0.7));
      g.addColorStop(1, col(0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (t - last < 33) return; // ~30 fps is plenty for something this slow
    const dt = Math.min(0.1, (t - last) / 1000) * (still ? 0 : 1);
    last = t;
    step(dt);
    draw();
  }

  function mount() {
    if (host) return;
    host = document.createElement("div");
    host.className = "ambient";
    host.setAttribute("aria-hidden", "true");
    document.body.prepend(host);
  }

  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

  function start(next) {
    mount();
    host.dataset.kind = next;
    host.innerHTML = next === "lights" ? "<canvas></canvas>" : next === "aurora" ? '<div class="aurora"><i></i><i></i><i></i></div>'
      : next === "art" ? '<div class="ambient-art"></div>' : "";
    if (next === "art" && artUrl) showArt(artUrl, true);
    stopLoop();
    canvas = null;
    if (next === "lights") {
      canvas = host.querySelector("canvas");
      ctx = canvas.getContext("2d");
      resize();
      palette = colours();
      seed();
      last = performance.now();
      draw();
      if (!still) raf = requestAnimationFrame(frame);
    }
    if (next === "aurora") {
      const [h, s] = hsl(FL.theme.accent());
      host.style.setProperty("--a1", "hsl(" + h + " " + Math.round(Math.max(55, s * 100)) + "% 55%)");
      host.style.setProperty("--a2", "hsl(" + (h + 50) + " 70% 50%)");
      host.style.setProperty("--a3", "hsl(" + (h - 60) + " 65% 45%)");
    }
  }

  /* Called by theme.apply() whenever appearance changes. */
  function sync() {
    if (!document.body) return;
    const next = FL.theme.ambient();
    still = FL.theme.calm();
    if (next === "off") {
      stopLoop();
      if (host) { host.remove(); host = null; canvas = null; }
      kind = "off";
      return;
    }
    if (next !== kind || !host) { kind = next; start(next); return; }
    // Same kind, new colours or motion setting.
    if (kind === "lights") {
      palette = colours();
      if (still) { stopLoop(); draw(); } else if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    } else start(kind);
  }

  window.addEventListener("resize", FL.util.debounce(() => { if (canvas) { resize(); draw(); } }, 150));
  document.addEventListener("visibilitychange", () => {
    if (kind !== "lights") return;
    if (document.hidden) stopLoop();
    else if (!still && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });

  /* Artwork: two layers crossfade, so a new title's colours arrive smoothly. */
  let artUrl = "";
  function showArt(url, instant) {
    const box = host && host.querySelector(".ambient-art");
    if (!box) return;
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.alt = "";
    img.onload = () => {
      if (url !== artUrl || !box.isConnected) return;
      box.appendChild(img);
      requestAnimationFrame(() => {
        img.classList.add("is-on");
        [...box.children].slice(0, -1).forEach((old) => { old.classList.remove("is-on"); setTimeout(() => old.remove(), instant ? 0 : 1300); });
      });
    };
    img.src = url;
  }
  function art(url) {
    if (!url || url === artUrl) return;
    artUrl = url;
    if (kind === "art") showArt(url);
  }

  FL.ambient = { sync, art };
  sync();
})(window.FL = window.FL || {});
