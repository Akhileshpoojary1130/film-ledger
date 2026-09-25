/* Iris — appearance: theme (Cinema / Material / macOS), light-dark mode, accent colour, and the aperture mark. */
(function (FL) {
  "use strict";

  const THEMES = {
    cinema: { label: "Cinema", note: "Near-black, editorial serif", accent: { dark: "#D6A75D", light: "#A8742A" } },
    material: { label: "Material", note: "Android · Material You", accent: { dark: "#D0BCFF", light: "#6750A4" } },
    mac: { label: "macOS", note: "Apple · SF style", accent: { dark: "#0A84FF", light: "#007AFF" } },
  };
  const ACCENTS = [
    ["#D6A75D", "Amber"], ["#FF7A59", "Coral"], ["#E5484D", "Red"], ["#F472B6", "Pink"],
    ["#A78BFA", "Violet"], ["#0A84FF", "Blue"], ["#22B8CF", "Teal"], ["#3FB950", "Green"],
  ];

  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: light)");

  function prefs() { return FL.store.prefs().appearance; }
  function themeId() { return THEMES[prefs().theme] ? prefs().theme : "cinema"; }
  function mode() {
    const m = prefs().mode;
    return m === "system" ? (media.matches ? "light" : "dark") : m === "light" ? "light" : "dark";
  }
  function accent() { return prefs().accent || THEMES[themeId()].accent[mode()]; }

  /* Text colour that reads on top of the accent. */
  function ink(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return L > 0.36 ? "#16120A" : "#FFFFFF";
  }

  function loadFonts(theme) {
    if (theme !== "material" || document.getElementById("font-material")) return;
    const names = ["add", "arrow_back", "arrow_forward", "auto_awesome", "bar_chart", "bookmark", "calendar_month", "check",
      "chevron_left", "chevron_right", "close", "dark_mode", "delete", "download", "edit", "expand_more", "explore", "favorite",
      "folder_open", "fullscreen", "grid_view", "history", "home", "keyboard", "light_mode", "live_tv", "movie", "open_in_new",
      "palette", "play_arrow", "replay", "schedule", "search", "shuffle", "smart_display", "star", "tune", "upload",
      "video_library", "view_list"];
    const link = document.createElement("link");
    link.id = "font-material";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,300..700" +
      "&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..500,0..1,0&icon_names=" + names.join(",") + "&display=block";
    document.head.appendChild(link);
  }

  let markId = 0;

  /* The aperture: six blades pivoting on the rim; `open` is the blade angle (0° = wide open, ~80° = shut). */
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

  function apply() {
    const t = themeId();
    const m = mode();
    const a = accent();
    root.dataset.theme = t;
    root.dataset.mode = m;
    root.style.setProperty("--accent", a);
    root.style.setProperty("--accent-ink", ink(a));
    root.style.colorScheme = m;
    loadFonts(t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue("--bg").trim() || "#0A0A0B";
    favicon();
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

  apply();

  FL.theme = { THEMES, ACCENTS, apply, set, mark, mode, accent, id: themeId, icons: () => (themeId() === "material" ? "material" : "line") };
})(window.FL = window.FL || {});
