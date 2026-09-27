/* Iris — appearance. A look is four independent choices:
   style (Cinema / Material / Cupertino: type, shapes, controls) × palette (colours, dark and light) ×
   liquid glass (off → clear) × ambient background (still / lights / aurora); plus mode, accent and motion.
   Palettes are generated in OKLCH so every one has a matching dark and light version. */
(function (FL) {
  "use strict";

  const THEMES = {
    cinema: { label: "Cinema", note: "Editorial serif, sharp", accent: { dark: "#D6A75D", light: "#A8742A" } },
    material: { label: "Material", note: "Android · Material You", accent: { dark: "#D0BCFF", light: "#6750A4" } },
    mac: { label: "Cupertino", note: "Apple · SF, rounded", accent: { dark: "#0A84FF", light: "#007AFF" } },
    fluent: { label: "Fluent", note: "Windows 11", accent: { dark: "#60CDFF", light: "#005FB8" } },
    oneui: { label: "One UI", note: "Samsung · big and round", accent: { dark: "#5E9EFF", light: "#3E91FF" } },
    nothing: { label: "Glyph", note: "Dot-matrix, Nothing-style", accent: { dark: "#D71921", light: "#D71921" } },
    pop: { label: "Pop", note: "Bold outlines, flat colour", accent: { dark: "#C6FF4F", light: "#FF4F8B" } },
    neon: { label: "Neon", note: "Night city, glowing edges", accent: { dark: "#FF3CAC", light: "#D1007A" } },
    retro: { label: "Retro", note: "80s VHS, scanlines", accent: { dark: "#FF8A3D", light: "#E4572E" } },
  };
  const ACCENTS = [
    ["#D6A75D", "Amber"], ["#FF7A59", "Coral"], ["#E5484D", "Red"], ["#F472B6", "Pink"],
    ["#A78BFA", "Violet"], ["#0A84FF", "Blue"], ["#22B8CF", "Teal"], ["#3FB950", "Green"],
  ];

  /* h = hue, c = how much of it tints the surfaces; accents are [dark, light]. */
  /* A dozen palettes that each look clearly different: the style's own, high contrast, true black, the cool greys
     and blues, a green, a warm sand, sunset, rose, lavender and Nord. */
  const PALETTES = [
    { id: "default", name: "Style default" },
    { id: "noir", name: "Noir", h: 0, c: 0, acc: ["#EDEDED", "#1A1A1A"] },
    { id: "amoled", name: "AMOLED", h: 0, c: 0, acc: ["#D6A75D", "#8A5A12"], special: "amoled" },
    { id: "contrast", name: "High contrast", h: 0, c: 0, acc: ["#FFD60A", "#0033CC"], special: "contrast" },
    { id: "graphite", name: "Graphite", h: 250, c: 0.008, acc: ["#9DB4FF", "#3552C8"] },
    { id: "midnight", name: "Midnight", h: 262, c: 0.035, acc: ["#7AA2FF", "#2F5BEA"] },
    { id: "ocean", name: "Ocean", h: 228, c: 0.035, acc: ["#3BA6FF", "#0B6BCB"] },
    { id: "forest", name: "Forest", h: 150, c: 0.03, acc: ["#5FD08F", "#2E7D4F"] },
    { id: "sand", name: "Sand", h: 80, c: 0.02, acc: ["#E6C07B", "#8C6420"] },
    { id: "sunset", name: "Sunset", h: 40, c: 0.035, acc: ["#FF8A5B", "#C2461B"] },
    { id: "rose", name: "Rose", h: 5, c: 0.03, acc: ["#FF7AA8", "#C2185B"] },
    { id: "lavender", name: "Lavender", h: 295, c: 0.025, acc: ["#B7A2FF", "#6A4FD8"] },
    { id: "nord", name: "Nord", h: 240, c: 0.025, acc: ["#88C0D0", "#3B7B8F"] },
  ];

  /* One-tap combinations, including the two animated ("dynamic") looks. */
  const PRESETS = [
    { id: "iris", name: "Iris default", set: { theme: "material", mode: "dark", palette: "contrast", accent: "#0A84FF", glass: "clear", ambient: "off", motion: "calm" } },
    { id: "classic", name: "Classic cinema", set: { theme: "cinema", palette: "default", glass: "off", ambient: "off" } },
    { id: "frost", name: "Frosted lights", set: { theme: "mac", palette: "graphite", glass: "balanced", ambient: "lights" } },
    { id: "aurora", name: "Night aurora", set: { theme: "cinema", palette: "midnight", glass: "subtle", ambient: "aurora" } },
    { id: "you", name: "Material You", set: { theme: "material", palette: "default", glass: "off", ambient: "off" } },
    { id: "glyph", name: "Glyph", set: { theme: "nothing", palette: "default", glass: "off", ambient: "off" } },
    { id: "ember", name: "Ember glass", set: { theme: "cinema", palette: "noir", glass: "subtle", ambient: "lights" } },
  ];

  const GLASS = [["off", "Off"], ["subtle", "Subtle"], ["balanced", "Balanced"], ["clear", "Clear"]];
  const AMBIENT = [["off", "Still"], ["art", "Artwork"], ["lights", "Lights"], ["aurora", "Aurora"]];

  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: light)");
  const reducedMedia = window.matchMedia("(prefers-reduced-motion: reduce)");

  function prefs() { return FL.store.prefs().appearance; }
  function themeId() { return THEMES[prefs().theme] ? prefs().theme : "cinema"; }
  function palette() { return PALETTES.find((p) => p.id === prefs().palette) || PALETTES[0]; }
  function mode() {
    const m = prefs().mode;
    return m === "system" ? (media.matches ? "light" : "dark") : m === "light" ? "light" : "dark";
  }
  /* Sakura (the anime app) has its own colour, cherry-blossom pink; Iris keeps yours. */
  const SAKURA = { dark: "#FF8FB8", light: "#D23C77" };
  const app = () => (root.dataset.app === "sakura" ? "sakura" : "iris");
  function accent(which) {
    if ((which || app()) === "sakura") return SAKURA[mode() === "light" ? "light" : "dark"];
    const p = palette();
    return prefs().accent || (p.acc ? p.acc[mode() === "light" ? 1 : 0] : THEMES[themeId()].accent[mode()]);
  }
  const glass = () => (GLASS.some(([v]) => v === prefs().glass) ? prefs().glass : "off");
  const ambient = () => (AMBIENT.some(([v]) => v === prefs().ambient) ? prefs().ambient : "off");
  const calm = () => prefs().motion === "calm" || reducedMedia.matches;

  /* ---------- colour maths ---------- */

  function oklch(L, C, h) {
    const hr = (h * Math.PI) / 180;
    const a = C * Math.cos(hr);
    const b = C * Math.sin(hr);
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
    const lin = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    return lin.map((c) => {
      const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, v)) * 255);
    });
  }
  const hex = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  const rgba = (rgb, a) => "rgba(" + rgb.join(", ") + ", " + a + ")";
  const parseHex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

  /* Text colour that reads on top of the accent. */
  function ink(h) {
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const [r, g, b] = parseHex(h);
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.36 ? "#16120A" : "#FFFFFF";
  }

  /* Every colour token for a palette in a mode; null for "Style default" (the stylesheet decides). */
  function tokens(p, m) {
    if (!p || p.id === "default") return null;
    const dark = m !== "light";
    const { h, c } = p;
    let bg, s1, s2, s3, s4, text, text2, text3, lineA = dark ? 0.085 : 0.09, line2A = dark ? 0.15 : 0.16;
    if (dark) {
      bg = oklch(0.145, c, h); s1 = oklch(0.175, c, h); s2 = oklch(0.205, c, h); s3 = oklch(0.235, c * 1.05, h); s4 = oklch(0.29, c * 1.1, h);
      text = oklch(0.955, c * 0.25, h); text2 = oklch(0.75, c * 0.4, h); text3 = oklch(0.565, c * 0.4, h);
    } else {
      bg = oklch(0.972, c * 0.6, h); s1 = oklch(0.993, c * 0.25, h); s2 = oklch(0.945, c * 0.7, h); s3 = oklch(0.915, c * 0.8, h); s4 = oklch(0.87, c * 0.9, h);
      text = oklch(0.2, Math.min(0.04, c * 1.2), h); text2 = oklch(0.45, c * 0.8, h); text3 = oklch(0.6, c * 0.6, h);
    }
    if (p.special === "amoled") {
      if (dark) { bg = [0, 0, 0]; s1 = oklch(0.13, 0, 0); s2 = oklch(0.16, 0, 0); s3 = oklch(0.2, 0, 0); s4 = oklch(0.26, 0, 0); }
      else { bg = [255, 255, 255]; s1 = [255, 255, 255]; s2 = oklch(0.96, 0, 0); s3 = oklch(0.93, 0, 0); s4 = oklch(0.88, 0, 0); }
    }
    if (p.special === "contrast") {
      if (dark) { bg = [0, 0, 0]; s1 = oklch(0.14, 0, 0); s2 = oklch(0.18, 0, 0); s3 = oklch(0.22, 0, 0); s4 = oklch(0.3, 0, 0); text = [255, 255, 255]; text2 = oklch(0.88, 0, 0); text3 = oklch(0.74, 0, 0); }
      else { bg = [255, 255, 255]; s1 = [255, 255, 255]; s2 = oklch(0.95, 0, 0); s3 = oklch(0.9, 0, 0); s4 = oklch(0.82, 0, 0); text = [0, 0, 0]; text2 = oklch(0.3, 0, 0); text3 = oklch(0.42, 0, 0); }
      lineA = 0.24; line2A = 0.4;
    }
    return {
      "--bg": hex(bg), "--s1": hex(s1), "--s2": hex(s2), "--s3": hex(s3), "--s4": hex(s4),
      "--raised": rgba(dark ? s2 : s1, 0.97),
      "--line": rgba(text, lineA), "--line-2": rgba(text, line2A),
      "--text": hex(text), "--text-2": hex(text2), "--text-3": hex(text3),
      "--glass": rgba(bg, 0.7), "--glass-2": rgba(bg, 0.88),
      "--scrim": dark ? "rgba(0, 0, 0, 0.6)" : rgba(text, 0.3),
      "--inverse": hex(text), "--inverse-ink": hex(bg),
    };
  }
  const TOKEN_NAMES = Object.keys(tokens(PALETTES[4], "dark"));

  /* Swatch colours for the palette picker. */
  function preview(p, m) {
    const t = tokens(p, m);
    const a = p.acc ? p.acc[m === "light" ? 1 : 0] : THEMES[themeId()].accent[m];
    if (!t) return null;
    return { bg: t["--bg"], s: t["--s3"], text: t["--text"], accent: a };
  }

  /* ---------- fonts ---------- */

  function loadFonts(theme) {
    const extra = { neon: "family=Chakra+Petch:wght@500;600;700", retro: "family=VT323&family=Space+Grotesk:wght@400..700" };
    if (extra[theme] && !document.getElementById("font-" + theme)) {
      const x = document.createElement("link");
      x.id = "font-" + theme;
      x.rel = "stylesheet";
      x.href = "https://fonts.googleapis.com/css2?" + extra[theme] + "&display=swap";
      document.head.appendChild(x);
    }
    if (theme === "pop" && !document.getElementById("font-pop")) {
      const p = document.createElement("link");
      p.id = "font-pop";
      p.rel = "stylesheet";
      p.href = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Space+Grotesk:wght@400..700&display=swap";
      document.head.appendChild(p);
    }
    if (theme === "nothing" && !document.getElementById("font-glyph")) {
      const g = document.createElement("link");
      g.id = "font-glyph";
      g.rel = "stylesheet";
      g.href = "https://fonts.googleapis.com/css2?family=Doto:wght@600..900&family=Space+Grotesk:wght@400..600&display=swap";
      document.head.appendChild(g);
    }
    if (theme !== "material" || document.getElementById("font-material")) return;
    // Only these glyphs are downloaded: every Material name in ui.js's MSR map must be here (tests/icons.test.mjs checks).
    const names = ["add", "arrow_back", "arrow_forward", "auto_awesome", "bar_chart", "bookmark", "calendar_month", "check",
      "chevron_left", "chevron_right", "close", "dark_mode", "delete", "download", "edit", "expand_more", "explore", "favorite",
      "folder_open", "fullscreen", "grid_view", "history", "home", "keyboard", "light_mode", "live_tv", "movie", "open_in_new",
      "palette", "person", "play_arrow", "replay", "schedule", "search", "shuffle", "smart_display", "star", "tune", "upload",
      "video_library", "view_list", "qr_code_2", "ios_share", "group", "photo_camera", "link", "devices", "refresh"];
    const link = document.createElement("link");
    link.id = "font-material";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,300..700" +
      "&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..500,0..1,0&icon_names=" + names.sort().join(",") + "&display=block";
    document.head.appendChild(link);
  }

  /* ---------- the aperture mark ---------- */

  const SPLINE = 'calcMode="spline" keyTimes="0;.5;1" keySplines=".65 0 .35 1;.65 0 .35 1"';

  /* The Iris mark: an aperture that is also an eye. Six curved blades swirl in from the rim, each a different shade of
     the accent (lit from the top left, so it has depth without a gradient), around a dark pupil with a catchlight.
     `open` (0–1) sets the pupil; `blink` makes it narrow and the blades turn as you change pages; `animate` keeps them
     turning slowly (the loaders). Colours come from the stylesheet, or from `fill` where there is none (the favicon). */
  const polar = (r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return [r * Math.cos(a), r * Math.sin(a)]; };
  const f2 = (x) => x.toFixed(2);
  const pt = (p) => f2(p[0]) + " " + f2(p[1]);
  const SHADES = [0, 18, 34, -14, -30, -12]; // + lighter, − darker, per blade
  function blade(i, r, gap) {
    const R = 46;
    const a = i * 60 + gap / 2;
    const b = (i + 1) * 60 - gap / 2;
    const swirl = 64;
    const A = polar(R, a);
    const B = polar(R, b);
    const C = polar(r, b + swirl);
    const D = polar(r, a + swirl);
    const cB = polar(R * 0.5, b + swirl * 0.22);
    const cA = polar(R * 0.5, a + swirl * 0.22);
    return "M" + pt(A) + "A" + R + " " + R + " 0 0 1 " + pt(B) + "Q" + pt(cB) + " " + pt(C) +
      "A" + f2(r) + " " + f2(r) + " 0 0 0 " + pt(D) + "Q" + pt(cA) + " " + pt(A) + "Z";
  }
  function mixHex(hex, amt) {
    const n = parseInt(String(hex).replace("#", "").slice(0, 6), 16);
    const to = amt > 0 ? 255 : 0;
    const t = Math.abs(amt) / 100;
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (to - v) * t));
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  /* Sakura's mark: the same idea as a cherry blossom. Five notched petals, shaded like the blades (lit from the top
     left), around the same pupil and catchlight; it turns and blinks the same way. */
  const PETAL_SHADE = [1, 0, 4, 3, 2]; // blade shade classes for the petals from the top, clockwise
  function petal(i, r) {
    const w = 20;
    const b = r * 0.5;
    const pts = [[0, -b], [w * 0.9, -b - 8], [w * 1.2, -30], [w * 0.9, -40.5], [w * 0.62, -47.5], [w * 0.2, -46.5], [0, -40.5]];
    const rot = (i * 72 * Math.PI) / 180;
    const P = ([x, y], m) => { const X = x * (m || 1); return pt([X * Math.cos(rot) - y * Math.sin(rot), X * Math.sin(rot) + y * Math.cos(rot)]); };
    return "M" + P(pts[0]) + "C" + P(pts[1]) + " " + P(pts[2]) + " " + P(pts[3]) + "Q" + P(pts[4]) + " " + P(pts[5]) + "L" + P(pts[6]) +
      "L" + P(pts[5], -1) + "Q" + P(pts[4], -1) + " " + P(pts[3], -1) + "C" + P(pts[2], -1) + " " + P(pts[1], -1) + " " + P(pts[0]) + "Z";
  }

  function mark(opts) {
    const o = Object.assign({ size: 28, open: 0.9, animate: false, blink: false, fill: "", kind: app() }, opts);
    if (o.kind === "sakura") return bloom(o);
    const r = 7 + 7 * o.open;
    const gap = Math.max(2.4, (100 / o.size) * 2.2); // seams stay about a screen pixel wide at any size
    const blades = [0, 1, 2, 3, 4, 5].map((i) => '<path class="mark-b' + i + '" d="' + blade(i, r, gap) + '"' +
      (o.fill ? ' fill="' + mixHex(o.fill, SHADES[i]) + '"' : "") + "/>").join("");
    const turn = o.animate
      ? '<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="3.2s" repeatCount="indefinite"/>'
      : o.blink ? '<animateTransform class="mark-blink" attributeName="transform" type="rotate" values="0;46;0" ' + SPLINE + ' dur=".7s" begin="indefinite"/>' : "";
    const pupil = o.animate
      ? '<animate attributeName="r" values="' + f2(r) + ";" + f2(r * 0.55) + ";" + f2(r) + '" ' + SPLINE + ' dur="1.6s" repeatCount="indefinite"/>'
      : o.blink ? '<animate class="mark-blink" attributeName="r" values="' + f2(r) + ";" + f2(r * 0.3) + ";" + f2(r) + '" ' + SPLINE + ' dur=".7s" begin="indefinite"/>' : "";
    return '<svg class="mark' + (o.cls ? " " + o.cls : "") + '" viewBox="-50 -50 100 100" width="' + o.size + '" height="' + o.size + '" aria-hidden="true" focusable="false">' +
      '<g class="mark-blades">' + blades + turn + "</g>" +
      '<circle class="mark-pupil" r="' + f2(r) + '"' + (o.fill ? ' fill="#0B0B0E"' : "") + ' stroke-width="' + f2(Math.max(1.2, 100 / o.size * 0.6)) + '">' + pupil + "</circle>" +
      (o.size >= 20 ? '<circle class="mark-glint" cx="' + f2(-r * 0.34) + '" cy="' + f2(-r * 0.38) + '" r="' + f2(Math.max(1.6, r * 0.2)) + '"' + (o.fill ? ' fill="#fff"' : "") + "/>" : "") +
      "</svg>";
  }

  function bloom(o) {
    const r = 6 + 5 * o.open;
    const petals = [0, 1, 2, 3, 4].map((i) => '<path class="mark-b' + PETAL_SHADE[i] + '" d="' + petal(i, r) + '"' +
      (o.fill ? ' fill="' + mixHex(o.fill, SHADES[PETAL_SHADE[i]]) + '"' : "") + "/>").join("");
    const turn = o.animate
      ? '<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="3.6s" repeatCount="indefinite"/>'
      : o.blink ? '<animateTransform class="mark-blink" attributeName="transform" type="rotate" values="0;36;0" ' + SPLINE + ' dur=".8s" begin="indefinite"/>' : "";
    const pupil = o.animate
      ? '<animate attributeName="r" values="' + f2(r) + ";" + f2(r * 0.6) + ";" + f2(r) + '" ' + SPLINE + ' dur="1.8s" repeatCount="indefinite"/>'
      : o.blink ? '<animate class="mark-blink" attributeName="r" values="' + f2(r) + ";" + f2(r * 0.35) + ";" + f2(r) + '" ' + SPLINE + ' dur=".8s" begin="indefinite"/>' : "";
    return '<svg class="mark mark-sakura' + (o.cls ? " " + o.cls : "") + '" viewBox="-50 -50 100 100" width="' + o.size + '" height="' + o.size + '" aria-hidden="true" focusable="false">' +
      '<g class="mark-blades">' + petals + turn + "</g>" +
      '<circle class="mark-pupil" r="' + f2(r) + '"' + (o.fill ? ' fill="#0B0B0E"' : "") + ' stroke-width="' + f2(Math.max(1.2, 100 / o.size * 0.6)) + '">' + pupil + "</circle>" +
      (o.size >= 20 ? '<circle class="mark-glint" cx="' + f2(-r * 0.34) + '" cy="' + f2(-r * 0.38) + '" r="' + f2(Math.max(1.5, r * 0.22)) + '"' + (o.fill ? ' fill="#fff"' : "") + "/>" : "") +
      "</svg>";
  }

  /* Blink a mark made with { blink: true } (the logo, as you change pages). */
  function markBlink(svg) {
    if (svg) svg.querySelectorAll("animate.mark-blink, animateTransform.mark-blink").forEach((a) => { if (a.beginElement) a.beginElement(); });
  }

  function favicon() {
    const a = accent();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100"><rect x="-50" y="-50" width="100" height="100" rx="22" fill="#0A0A0B"/>' +
      mark({ size: 64, open: 0.95, fill: a }).replace(/^<svg[^>]*>/, "<g transform=\"scale(.8)\">").replace(/<\/svg>$/, "</g>") + "</svg>";
    let link = document.querySelector('link[rel="icon"]');
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.href = "data:image/svg+xml," + encodeURIComponent(svg);
  }

  /* ---------- apply ---------- */

  function apply() {
    const t = themeId();
    const m = mode();
    const a = accent();
    root.dataset.theme = t;
    root.dataset.mode = m;
    root.dataset.glass = t === "pop" || t === "retro" ? "off" : glass(); // Pop and Retro are flat colour by design
    root.dataset.ambient = ambient();
    root.dataset.motion = calm() ? "calm" : "full";
    root.dataset.search = prefs().searchSpot === "float" ? "float" : "center";
    const tk = tokens(palette(), m);
    TOKEN_NAMES.forEach((k) => { if (tk) root.style.setProperty(k, tk[k]); else root.style.removeProperty(k); });
    root.style.setProperty("--accent", a);
    root.style.setProperty("--iris-accent", accent("iris")); // so the boot screen can paint Iris in its own colour
    root.style.setProperty("--accent-ink", ink(a));
    root.style.colorScheme = m;
    loadFonts(t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = (tk && tk["--bg"]) || getComputedStyle(root).getPropertyValue("--bg").trim() || "#0A0A0B";
    favicon();
    if (FL.ambient) FL.ambient.sync();
    try {
      const data = { theme: t, mode: m, glass: root.dataset.glass, ambient: root.dataset.ambient, motion: root.dataset.motion, search: root.dataset.search };
      localStorage.setItem("film_ledger_look_v1", JSON.stringify({ data, style: root.getAttribute("style") || "" }));
    } catch (e) { /* private mode: the fallback in index.html still applies the basics */ }
  }

  function set(patch) {
    FL.store.patchPref("appearance", patch);
    apply();
    if (FL.app) FL.app.rebuild();
  }

  media.addEventListener("change", () => {
    if (prefs().mode !== "system") return;
    apply();
    if (FL.app) FL.app.rebuild();
  });
  reducedMedia.addEventListener("change", apply);

  apply();

  FL.theme = {
    THEMES, ACCENTS, PALETTES, PRESETS, GLASS, AMBIENT, SAKURA, apply, set, mark, markBlink, mode, accent, palette, glass, ambient, calm, app,
    preview, parseHex, id: themeId, icons: () => (themeId() === "material" ? "material" : "line"),
  };
})(window.FL = window.FL || {});
