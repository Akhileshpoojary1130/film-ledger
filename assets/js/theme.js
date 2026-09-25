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
  };
  const ACCENTS = [
    ["#D6A75D", "Amber"], ["#FF7A59", "Coral"], ["#E5484D", "Red"], ["#F472B6", "Pink"],
    ["#A78BFA", "Violet"], ["#0A84FF", "Blue"], ["#22B8CF", "Teal"], ["#3FB950", "Green"],
  ];

  /* h = hue, c = how much of it tints the surfaces; accents are [dark, light]. */
  const PALETTES = [
    { id: "default", name: "Style default" },
    { id: "noir", name: "Noir", h: 0, c: 0, acc: ["#EDEDED", "#1A1A1A"] },
    { id: "amoled", name: "AMOLED", h: 0, c: 0, acc: ["#D6A75D", "#8A5A12"], special: "amoled" },
    { id: "contrast", name: "High contrast", h: 0, c: 0, acc: ["#FFD60A", "#0033CC"], special: "contrast" },
    { id: "graphite", name: "Graphite", h: 250, c: 0.008, acc: ["#9DB4FF", "#3552C8"] },
    { id: "midnight", name: "Midnight", h: 262, c: 0.035, acc: ["#7AA2FF", "#2F5BEA"] },
    { id: "ocean", name: "Ocean", h: 228, c: 0.035, acc: ["#3BA6FF", "#0B6BCB"] },
    { id: "lagoon", name: "Lagoon", h: 195, c: 0.03, acc: ["#2CD3C4", "#0B8578"] },
    { id: "mint", name: "Mint", h: 165, c: 0.022, acc: ["#3EE6A8", "#0F8A5F"] },
    { id: "forest", name: "Forest", h: 150, c: 0.03, acc: ["#5FD08F", "#2E7D4F"] },
    { id: "olive", name: "Olive", h: 118, c: 0.025, acc: ["#B7CF5E", "#5E7A12"] },
    { id: "sand", name: "Sand", h: 80, c: 0.02, acc: ["#E6C07B", "#8C6420"] },
    { id: "cinema-gold", name: "Gold", h: 78, c: 0.012, acc: ["#D6A75D", "#A8742A"] },
    { id: "marigold", name: "Marigold", h: 62, c: 0.03, acc: ["#FFB020", "#B86E00"] },
    { id: "coffee", name: "Coffee", h: 55, c: 0.03, acc: ["#D2A679", "#7E5230"] },
    { id: "sunset", name: "Sunset", h: 40, c: 0.035, acc: ["#FF8A5B", "#C2461B"] },
    { id: "crimson", name: "Crimson", h: 22, c: 0.035, acc: ["#FF5A60", "#C21F2A"] },
    { id: "rose", name: "Rose", h: 5, c: 0.03, acc: ["#FF7AA8", "#C2185B"] },
    { id: "sakura", name: "Sakura", h: 350, c: 0.02, acc: ["#F9A8D4", "#B83280"] },
    { id: "grape", name: "Grape", h: 315, c: 0.035, acc: ["#D08CFF", "#8E24AA"] },
    { id: "lavender", name: "Lavender", h: 295, c: 0.025, acc: ["#B7A2FF", "#6A4FD8"] },
    { id: "indigo", name: "Indigo", h: 272, c: 0.045, acc: ["#8C96FF", "#3F4AE0"] },
    { id: "nord", name: "Nord", h: 240, c: 0.025, acc: ["#88C0D0", "#3B7B8F"] },
    { id: "dracula", name: "Dracula", h: 285, c: 0.04, acc: ["#BD93F9", "#7C4DDB"] },
    { id: "tokyo", name: "Tokyo Night", h: 268, c: 0.05, acc: ["#7AA2F7", "#3D59C9"] },
    { id: "catppuccin", name: "Catppuccin", h: 290, c: 0.03, acc: ["#CBA6F7", "#8839EF"] },
    { id: "gruvbox", name: "Gruvbox", h: 70, c: 0.035, acc: ["#FABD2F", "#B57614"] },
    { id: "solar", name: "Solarized", h: 215, c: 0.05, acc: ["#2AA2E0", "#1F6FAE"] },
  ];

  /* One-tap combinations, including the two animated ("dynamic") looks. */
  const PRESETS = [
    { id: "classic", name: "Classic cinema", set: { theme: "cinema", palette: "default", glass: "off", ambient: "off" } },
    { id: "frost", name: "Frosted lights", set: { theme: "mac", palette: "midnight", glass: "balanced", ambient: "lights" } },
    { id: "aurora", name: "Aurora glass", set: { theme: "cinema", palette: "tokyo", glass: "subtle", ambient: "aurora" } },
    { id: "you", name: "Material You", set: { theme: "material", palette: "default", glass: "off", ambient: "off" } },
    { id: "ember", name: "Ember", set: { theme: "cinema", palette: "sunset", glass: "subtle", ambient: "lights" } },
  ];

  const GLASS = [["off", "Off"], ["subtle", "Subtle"], ["balanced", "Balanced"], ["clear", "Clear"]];
  const AMBIENT = [["off", "Still"], ["lights", "Lights"], ["aurora", "Aurora"]];

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
  function accent() {
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
    if (theme !== "material" || document.getElementById("font-material")) return;
    const names = ["add", "arrow_back", "arrow_forward", "auto_awesome", "bar_chart", "bookmark", "calendar_month", "check",
      "chevron_left", "chevron_right", "close", "dark_mode", "delete", "download", "edit", "expand_more", "explore", "favorite",
      "folder_open", "fullscreen", "grid_view", "history", "home", "keyboard", "light_mode", "live_tv", "movie", "open_in_new",
      "palette", "person", "play_arrow", "replay", "schedule", "search", "shuffle", "smart_display", "star", "tune", "upload",
      "video_library", "view_list"];
    const link = document.createElement("link");
    link.id = "font-material";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,300..700" +
      "&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..500,0..1,0&icon_names=" + names.sort().join(",") + "&display=block";
    document.head.appendChild(link);
  }

  /* ---------- the aperture mark ---------- */

  let markId = 0;

  /* Six blades pivoting on the rim; `open` is the blade angle (0° = wide open, ~80° = shut). */
  function mark(opts) {
    const o = Object.assign({ size: 28, open: 52, animate: false, fill: "", ring: "" }, opts);
    const id = "irisclip" + ++markId;
    const R = 46;
    let blades = "";
    for (let i = 0; i < 6; i++) {
      const anim = o.animate
        ? '<animateTransform attributeName="transform" type="rotate" values="' + o.open + ";14;" + o.open +
          '" keyTimes="0;.5;1" calcMode="spline" keySplines=".6 0 .4 1;.6 0 .4 1" dur="2.4s" repeatCount="indefinite"/>'
        : "";
      blades += '<g transform="rotate(' + i * 60 + ") translate(" + R + ' 0) rotate(90)"><path class="blade" d="M-130 0H130V-130H-130Z" transform="rotate(' +
        o.open + ')"' + (o.fill ? ' fill="' + o.fill + '"' : "") + ">" + anim + "</path></g>";
    }
    return '<svg class="mark' + (o.cls ? " " + o.cls : "") + '" viewBox="-50 -50 100 100" width="' + o.size + '" height="' + o.size + '" aria-hidden="true" focusable="false">' +
      '<defs><clipPath id="' + id + '"><circle r="' + R + '"/></clipPath></defs>' +
      '<g clip-path="url(#' + id + ')">' + blades + "</g>" +
      '<circle class="mark-ring" r="' + R + '"' + (o.ring ? ' stroke="' + o.ring + '"' : "") + "/></svg>";
  }

  function favicon() {
    const a = accent();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100"><rect x="-50" y="-50" width="100" height="100" rx="22" fill="#0A0A0B"/>' +
      mark({ size: 100, open: 54, fill: a, ring: a }).replace(/^<svg[^>]*>/, "<g transform=\"scale(.78)\">").replace(/<\/svg>$/, "</g>")
        .replace(/class="blade"/g, 'stroke="#0A0A0B" stroke-width="3"').replace(/class="mark-ring"/, 'fill="none" stroke-width="5"') + "</svg>";
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
    root.dataset.glass = glass();
    root.dataset.ambient = ambient();
    root.dataset.motion = calm() ? "calm" : "full";
    const tk = tokens(palette(), m);
    TOKEN_NAMES.forEach((k) => { if (tk) root.style.setProperty(k, tk[k]); else root.style.removeProperty(k); });
    root.style.setProperty("--accent", a);
    root.style.setProperty("--accent-ink", ink(a));
    root.style.colorScheme = m;
    loadFonts(t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = (tk && tk["--bg"]) || getComputedStyle(root).getPropertyValue("--bg").trim() || "#0A0A0B";
    favicon();
    if (FL.ambient) FL.ambient.sync();
    try {
      const data = { theme: t, mode: m, glass: root.dataset.glass, ambient: root.dataset.ambient, motion: root.dataset.motion };
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
    THEMES, ACCENTS, PALETTES, PRESETS, GLASS, AMBIENT, apply, set, mark, mode, accent, palette, glass, ambient, calm,
    preview, parseHex, id: themeId, icons: () => (themeId() === "material" ? "material" : "line"),
  };
})(window.FL = window.FL || {});
