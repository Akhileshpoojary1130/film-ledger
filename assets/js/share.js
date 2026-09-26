/* Iris — moving things between people and devices without a server: compact packing, QR codes, the camera
   scanner, share links, and the library's travel format. Everything rides inside a QR code or a link's #fragment,
   so nothing is uploaded anywhere. */
(function (FL) {
  "use strict";

  /* ---------- small libraries, loaded only when a QR code is shown or scanned ---------- */

  const LIBS = {
    qrcode: { src: "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js", sri: "sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k" },
    jsQR: { src: "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js", sri: "sha384-b5Ya4Bq3qCyz39m2ISh+4DxjAIljdeFwK/BsXLuj9gugaNwAcj/ia15fxNZL9Nlx" },
  };
  const loading = {};

  function lib(name) {
    if (window[name]) return Promise.resolve(window[name]);
    if (!loading[name]) {
      loading[name] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = LIBS[name].src;
        s.integrity = LIBS[name].sri;
        s.crossOrigin = "anonymous";
        s.async = true;
        s.onload = () => (window[name] ? resolve(window[name]) : reject(new Error("the QR helper didn’t start")));
        s.onerror = () => { delete loading[name]; s.remove(); reject(new Error("couldn’t load the QR helper — check your connection")); };
        document.head.appendChild(s);
      });
    }
    return loading[name];
  }

  /* ---------- packing: JSON → deflate → base64url (URL- and QR-safe) ---------- */

  function toB64u(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromB64u(str) {
    const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  const canZip = typeof CompressionStream === "function" && typeof DecompressionStream === "function";
  function through(bytes, Kind) {
    return new Response(new Blob([bytes]).stream().pipeThrough(new Kind("deflate-raw"))).arrayBuffer().then((b) => new Uint8Array(b));
  }

  /* "z…" is compressed; "j…" is plain, for browsers without CompressionStream. */
  async function pack(obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    if (canZip) {
      try { return "z" + toB64u(await through(raw, CompressionStream)); } catch (e) { /* fall back to plain */ }
    }
    return "j" + toB64u(raw);
  }
  async function unpack(str) {
    const kind = String(str || "")[0];
    const bytes = fromB64u(String(str).slice(1));
    let raw;
    if (kind === "z") {
      if (!canZip) throw new Error("This browser is too old to open it — update it and try again.");
      raw = await through(bytes, DecompressionStream);
    } else if (kind === "j") raw = bytes;
    else throw new Error("That code isn’t from Iris.");
    return JSON.parse(new TextDecoder().decode(raw));
  }

  /* ---------- QR codes ---------- */

  /* Crisp SVG: black modules on white with the standard four-module quiet zone. */
  function qrSvg(text, ecc) {
    return lib("qrcode").then((qrcode) => {
      const qr = qrcode(0, ecc || "L");
      qr.addData(text, "Byte");
      qr.make();
      const n = qr.getModuleCount();
      const q = 4;
      let d = "";
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (!qr.isDark(r, c)) continue;
          let run = 1;
          while (c + run < n && qr.isDark(r, c + run)) run++;
          d += "M" + (c + q) + " " + (r + q) + "h" + run + "v1h-" + run + "z";
          c += run - 1;
        }
      }
      const s = n + q * 2;
      return '<svg class="qr" viewBox="0 0 ' + s + " " + s + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
        '<rect width="' + s + '" height="' + s + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
    });
  }

  /* Reads QR codes from the camera until stopped; onText gets every decode (repeats included).
     Uses the browser's own detector where there is one (Chrome, Android) and jsQR elsewhere (Safari, iPhone). */
  function scanner(video, onText) {
    let stopped = false;
    let stream = null;
    let timer = 0;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const ready = (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("This browser can’t use the camera here.");
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.muted = true;
      video.setAttribute("playsinline", "");
      video.srcObject = stream;
      await video.play();

      let detect = null;
      if ("BarcodeDetector" in window) {
        try {
          if ((await window.BarcodeDetector.getSupportedFormats()).includes("qr_code")) {
            const bd = new window.BarcodeDetector({ formats: ["qr_code"] });
            detect = async () => (await bd.detect(video)).map((c) => c.rawValue);
          }
        } catch (e) { detect = null; }
      }
      if (!detect) {
        const jsQR = await lib("jsQR");
        detect = async () => {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) return [];
          const k = Math.min(1, 1024 / Math.max(w, h));
          canvas.width = Math.round(w * k);
          canvas.height = Math.round(h * k);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          return hit && hit.data ? [hit.data] : [];
        };
      }
      const tick = async () => {
        if (stopped) return;
        try { (await detect()).forEach(onText); } catch (e) { /* a dropped frame */ }
        if (!stopped) timer = setTimeout(tick, 50);
      };
      tick();
    })();

    function stop() {
      stopped = true;
      clearTimeout(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
    return { ready, stop };
  }

  /* Keeps the screen on while a code is being shown (phones dim mid-transfer otherwise). */
  function keepAwake() {
    let lock = null;
    let released = false;
    const take = () => {
      if (released || !navigator.wakeLock || document.hidden) return;
      navigator.wakeLock.request("screen").then((l) => { lock = l; if (released) l.release(); }, () => {});
    };
    const onVis = () => { if (!document.hidden) take(); };
    take();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVis);
      if (lock) lock.release().catch(() => {});
    };
  }

  /* ---------- links ---------- */

  const base = () => location.origin + location.pathname;

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => "copied");
    const t = document.createElement("textarea");
    t.value = text;
    t.setAttribute("readonly", "");
    t.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok ? Promise.resolve("copied") : Promise.reject(new Error("copy blocked"));
  }

  /* The phone's share sheet where there is one (WhatsApp, Messages…), otherwise the clipboard. */
  function send(url, title, text) {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      return navigator.share({ title, text, url }).then(() => "shared", (e) => (e && e.name === "AbortError" ? "cancelled" : copy(url)));
    }
    return copy(url);
  }

  function device() {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return "iPhone";
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
    if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
    if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
    if (/Windows/.test(ua)) return "Windows PC";
    if (/CrOS/.test(ua)) return "Chromebook";
    return "other device";
  }

  /* ---------- the library's travel format ---------- */

  /* One row per title, positional and trimmed; times are minutes since 2020 in base 36. Bundled films travel as bare ids
     (the other device has the same catalogue); titles found on the web carry enough to be rebuilt there. */
  const EPOCH = Date.UTC(2020, 0, 1);
  const t36 = (ms) => (ms > EPOCH ? Math.round((ms - EPOCH) / 60000).toString(36) : "");
  const fromT36 = (s) => (s && /^[0-9a-z]+$/.test(s) ? EPOCH + parseInt(s, 36) * 60000 : 0);

  function toRow(e) {
    const f = FL.catalogue.get(e.id);
    const p = e.progress;
    const eps = Object.keys(e.episodes || {}).map((k) => k + "=" + e.episodes[k]).join(" ");
    const row = [
      e.id, (e.seen ? 1 : 0) | (e.listed ? 2 : 0) | (e.fav ? 4 : 0), e.rating || 0,
      t36(e.added), t36(e.updated), t36(e.seenAt), t36(e.listedAt),
      (e.watches || []).join(" "), (e.times || []).map(t36).join(" "), eps,
      p && p.d ? [p.t, p.d, t36(p.at), p.srv || "", p.s || 0, p.e || 0, p.approx ? 1 : 0] : 0,
      !f || f.remote ? { ty: e.type, t: e.title, y: e.year, l: e.lang, g: (e.genres || []).slice(0, 3), i: e.imdbId || "" } : 0,
    ];
    while (row.length > 3 && !row[row.length - 1]) row.pop();
    return row;
  }

  function fromRow(r) {
    if (!Array.isArray(r) || typeof r[0] !== "string" || r[0].length > 120) return null;
    const [id, flags, rating, added, updated, seenAt, listedAt, watches, times, eps, p, m] = r;
    const episodes = {};
    String(eps || "").split(" ").forEach((kv) => { const i = kv.indexOf("="); if (i > 0) episodes[kv.slice(0, i)] = kv.slice(i + 1); });
    const out = {
      id, seen: !!(flags & 1), listed: !!(flags & 2), fav: !!(flags & 4), rating: +rating || 0,
      added: fromT36(added), updated: fromT36(updated), seenAt: fromT36(seenAt), listedAt: fromT36(listedAt),
      watches: String(watches || "").split(" ").filter(Boolean),
      times: String(times || "").split(" ").map(fromT36).filter(Boolean),
      episodes,
    };
    if (Array.isArray(p)) {
      out.progress = { t: +p[0] || 0, d: +p[1] || 0, at: fromT36(p[2]) };
      if (p[3]) out.progress.srv = String(p[3]);
      if (p[4]) { out.progress.s = +p[4]; out.progress.e = +p[5]; }
      if (p[6]) out.progress.approx = true;
    }
    if (m && typeof m === "object") Object.assign(out, { type: m.ty, title: m.t, year: m.y, lang: m.l, genres: m.g, imdbId: m.i });
    return out;
  }

  function libraryPayload() {
    const entries = FL.store.entries();
    return {
      app: "iris-move", v: 1, name: FL.store.prefs().name || "", device: device(), at: Date.now(),
      rows: entries.map(toRow),
    };
  }

  /* A summary of what a received library holds, for the "add these?" card. */
  function describe(payload) {
    const rows = (payload && payload.rows) || [];
    let watched = 0;
    let listed = 0;
    let shows = 0;
    rows.forEach((r) => {
      const e = fromRow(r);
      if (!e) return;
      const isShow = Object.keys(e.episodes).length || (e.type === "series") || (FL.catalogue.get(e.id) || {}).type === "series";
      if (isShow) shows++;
      else if (e.seen || e.watches.length) watched++;
      if (e.listed) listed++;
    });
    return { total: rows.length, watched, listed, shows };
  }

  /* Merge a received library into this one (never replaces). Returns the number of titles taken in. */
  function importLibrary(payload) {
    if (!payload || payload.app !== "iris-move" || !Array.isArray(payload.rows)) throw new Error("That code isn’t an Iris library.");
    const library = {};
    payload.rows.forEach((r) => { const e = fromRow(r); if (e) library[e.id] = e; });
    return FL.store.importJSON({ app: "film-ledger", name: payload.name, library }, "merge");
  }

  /* Split a packed library into QR frames. Each frame is a link, so a phone's own camera app can open it too. */
  const FRAME = 760;
  function frames(packed) {
    const sid = Math.random().toString(36).slice(2, 7);
    const n = Math.max(1, Math.ceil(packed.length / FRAME));
    const size = Math.ceil(packed.length / n);
    return Array.from({ length: n }, (_, i) => base() + "#/move/" + sid + "." + (i + 1) + "." + n + "." + packed.slice(i * size, (i + 1) * size));
  }
  const FRAME_RE = /(?:^|#\/move\/)([a-z0-9]{3,8})\.(\d{1,3})\.(\d{1,3})\.([A-Za-z0-9_-]+)$/;
  function parseFrame(text) {
    const m = FRAME_RE.exec(String(text || "").trim());
    if (!m) return null;
    const i = +m[2];
    const n = +m[3];
    return i >= 1 && i <= n && n <= 400 ? { sid: m[1], i, n, data: m[4] } : null;
  }

  /* ---------- movie night: a Watch later list as a link ---------- */

  /* Refs: IMDb ids where there are any, bundled ids otherwise, and [id, title, year, type] for web-only titles. */
  function watchlistRefs(limit) {
    return FL.store.watchlist().slice(0, limit || 200).map((e) => {
      const f = FL.catalogue.get(e.id);
      if (f && f.imdbId) return f.imdbId;
      if (f && !f.remote) return f.id;
      return [e.id, e.title, e.year, e.type === "series" ? "series" : "movie"];
    });
  }

  function matchLink(limit) {
    return pack({ v: 1, n: FL.store.prefs().name || "", l: watchlistRefs(limit) }).then((p) => base() + "#/match/" + p);
  }

  FL.share = {
    lib, pack, unpack, qrSvg, scanner, keepAwake, copy, send, device, base,
    libraryPayload, describe, importLibrary, frames, parseFrame, watchlistRefs, matchLink,
  };
})(window.FL = window.FL || {});
