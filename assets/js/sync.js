/* Iris — sync: the same library and settings on every device you link.
   A sync code (32 random bytes) both names your library on the server and makes its key; the server (api/sync.js,
   this project's Redis) only ever sees ciphertext. Devices pull when Iris opens, when you come back to it and every
   minute while it's on screen, and push a moment after any change (a little later for "where you stopped", which
   the player saves every 15 seconds).
   Merging, per title: the newer edit wins; a removal wins over anything older than it; where you stopped follows the
   newest viewing; watch moments from both sides are kept. Settings merge per section, newer wins. */
(function (FL) {
  "use strict";

  const { storage } = FL.util;
  const KEY = "film_ledger_sync_v1";
  const API = "/api/sync";
  const FORGET_GONE = 120 * 864e5;

  let conf = storage.get(KEY, null); // { code, rev, hash, at }
  let keys = null;
  let busy = false;
  let again = false;
  let timer = 0;
  let state = { on: !!conf, phase: conf ? "idle" : "off", at: (conf && conf.at) || 0, error: "" };
  const listeners = new Set();

  function setState(patch) {
    state = Object.assign({}, state, patch, { on: !!conf });
    listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } });
  }
  function save() { if (conf) storage.set(KEY, conf); }

  /* ---------- bytes, keys, sealing ---------- */

  function b64u(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64u(str) {
    const bin = atob(String(str).replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const join2 = (a, b) => { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; };
  const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  const CODE = /^[A-Za-z0-9_-]{43}$/;
  const zip = typeof CompressionStream === "function" && typeof DecompressionStream === "function";
  const through = async (bytes, Kind) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Kind("gzip"))).arrayBuffer());

  async function derive(code) {
    const raw = unb64u(code);
    const enc = new TextEncoder();
    const idHash = await crypto.subtle.digest("SHA-256", join2(enc.encode("iris-sync/id/"), raw));
    const keyHash = await crypto.subtle.digest("SHA-256", join2(enc.encode("iris-sync/key/"), raw));
    return { id: hex(idHash), key: await crypto.subtle.importKey("raw", keyHash, "AES-GCM", false, ["encrypt", "decrypt"]) };
  }

  async function seal(doc) {
    let bytes = new TextEncoder().encode(JSON.stringify(doc));
    if (zip) bytes = await through(bytes, CompressionStream);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, keys.key, bytes));
    return (zip ? "z1." : "j1.") + b64u(join2(iv, ct));
  }

  async function unseal(text) {
    const dot = text.indexOf(".");
    const raw = unb64u(text.slice(dot + 1));
    let bytes = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.subarray(0, 12) }, keys.key, raw.subarray(12)));
    if (text.slice(0, dot) === "z1") bytes = await through(bytes, DecompressionStream);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  /* ---------- merging ---------- */

  /* Same content, same text: keys sorted, so two equal libraries hash alike whatever order they were built in. */
  function stable(v) {
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
    return JSON.stringify(v === undefined ? null : v);
  }
  const hashOf = (doc) => String(FL.util.hash(stable(doc)));

  const lastActive = (e) => Math.max(e.updated || 0, (e.progress && e.progress.at) || 0);

  function mergeEntry(a, b) {
    const win = (a.updated || 0) >= (b.updated || 0) ? a : b;
    const lose = win === a ? b : a;
    const out = Object.assign({}, win);
    const cleared = Math.max(a.progressCleared || 0, b.progressCleared || 0);
    let p = a.progress && b.progress ? ((a.progress.at || 0) >= (b.progress.at || 0) ? a.progress : b.progress) : a.progress || b.progress;
    if (p && (p.at || 0) <= cleared) p = undefined;
    if (p) out.progress = p; else delete out.progress;
    if (cleared) out.progressCleared = cleared;
    if (a.times || b.times) {
      const all = (a.times || []).concat(b.times || []).sort((x, y) => x - y);
      out.times = all.filter((t, i) => i === 0 || t - all[i - 1] > 120e3).slice(-40);
    }
    out.runtime = win.runtime || lose.runtime;
    out.directors = win.directors || lose.directors;
    out.imdbId = win.imdbId || lose.imdbId || "";
    return out;
  }

  /* Titles a device keeps under an older id (catalogue merges since) line up under today's. */
  function normalize(doc) {
    const films = {};
    Object.keys((doc && doc.films) || {}).forEach((id) => {
      const e = doc.films[id];
      if (!e || typeof e !== "object") return;
      const to = FL.catalogue.canonical(id);
      films[to] = Object.assign({}, e, {
        id: to, watches: Array.isArray(e.watches) ? e.watches : [], episodes: e.episodes && typeof e.episodes === "object" ? e.episodes : {},
      });
    });
    return { films, gone: (doc && doc.gone) || {}, prefs: (doc && doc.prefs) || {}, prefsAt: (doc && doc.prefsAt) || {} };
  }

  function merge(L, R) {
    const gone = {};
    [L.gone, R.gone].forEach((g) => Object.keys(g).forEach((id) => { gone[id] = Math.max(gone[id] || 0, +g[id] || 0); }));
    const films = {};
    new Set(Object.keys(L.films).concat(Object.keys(R.films))).forEach((id) => {
      const a = L.films[id];
      const b = R.films[id];
      const e = a && b ? mergeEntry(a, b) : a || b;
      if (gone[id] && lastActive(e) <= gone[id]) return;
      delete gone[id];
      films[id] = e;
    });
    const cut = Date.now() - FORGET_GONE;
    Object.keys(gone).forEach((id) => { if (gone[id] < cut) delete gone[id]; });
    const prefs = {};
    const prefsAt = {};
    new Set(Object.keys(L.prefs).concat(Object.keys(R.prefs))).forEach((k) => {
      const la = +L.prefsAt[k] || 0;
      const ra = +R.prefsAt[k] || 0;
      const fromR = !(k in L.prefs) || (k in R.prefs && ra > la);
      prefs[k] = fromR ? R.prefs[k] : L.prefs[k];
      prefsAt[k] = fromR ? ra : la;
    });
    return { films, gone, prefs, prefsAt };
  }

  /* Titles found on the web on the other device: rebuilt here from the entry's own snapshot. */
  function learnTitles(doc) {
    Object.keys(doc.films).forEach((id) => {
      if (FL.catalogue.get(id)) return;
      const e = doc.films[id];
      if (!e.title || !/^(tt\d+|wk\d{4}_|vg\d+)/.test(id)) return;
      FL.catalogue.addRemote({
        id, imdbId: e.imdbId || (/^tt/.test(id) ? id : ""), type: e.type, title: String(e.title), year: +e.year || 0,
        genres: Array.isArray(e.genres) ? e.genres : [], lang: e.lang,
      });
    });
  }

  /* ---------- the round trip ---------- */

  function fail(code, message) { const err = new Error(message || code); err.code = code; return err; }

  async function call(url, init) {
    let res;
    try { res = await fetch(url, Object.assign({ cache: "no-store" }, init)); } catch (err) { throw fail("offline", "You're offline"); }
    const body = await res.json().catch(() => ({}));
    if (res.status === 503 && body.error === "not-configured") throw fail("not-configured", "Sync isn't set up on this site yet");
    if (res.status === 409) return { conflict: true, rev: body.rev };
    if (!res.ok) throw fail("server", body.detail || body.error || "The sync server answered " + res.status);
    return body;
  }

  async function run() {
    if (!conf) return;
    if (busy) { again = true; return; }
    busy = true;
    setState({ phase: "syncing", error: "", code: "" });
    try {
      if (!keys) keys = await derive(conf.code);
      for (let tries = 0; ; tries++) {
        if (tries > 4) throw fail("busy", "Another device kept saving at the same moment; trying again shortly");
        const got = await call(API + "?id=" + keys.id + (conf.rev ? "&since=" + conf.rev : ""));
        if (!conf) return;
        const remote = got.data ? normalize(await unseal(got.data).catch(() => { throw fail("key", "This sync code doesn't open the library on the server"); })) : null;
        if (!conf) return;
        // From here to applySync nothing waits, so an edit made meanwhile can't be overwritten.
        const local = FL.store.syncDoc();
        const merged = remote ? merge(local, remote) : local;
        const mergedHash = hashOf(merged);
        if (remote) {
          learnTitles(merged);
          if (mergedHash !== hashOf(local)) afterApply(FL.store.applySync(merged));
        }
        const serverHash = remote ? hashOf(remote) : got.rev ? conf.hash : "";
        if (got.rev && mergedHash === serverHash) {
          Object.assign(conf, { rev: got.rev, hash: mergedHash });
        } else {
          const data = await seal(merged);
          const put = await call(API + "?id=" + keys.id, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rev: got.rev || 0, data }),
            keepalive: data.length < 60000,
          });
          if (!conf) return;
          if (put.conflict) { conf.rev = 0; continue; } // someone else saved first: pull everything and merge again
          Object.assign(conf, { rev: put.rev, hash: mergedHash });
        }
        conf.at = Date.now();
        save();
        setState({ phase: "idle", at: conf.at, error: "", code: "" });
        return;
      }
    } catch (err) {
      setState({ phase: "error", error: err.message || String(err), code: err.code || "" });
      if (err.code !== "not-configured" && err.code !== "key") schedule(30000);
    } finally {
      busy = false;
      if (again) { again = false; schedule(800); }
    }
  }

  /* Settings that came in: repaint the look and chrome when the look changed. */
  function afterApply(changed) {
    if (!changed || !changed.length) return;
    if (changed.indexOf("appearance") !== -1 && FL.theme) FL.theme.apply();
    if (FL.app && changed.some((k) => k === "appearance" || k === "name")) FL.app.rebuild();
  }

  function schedule(ms) {
    if (!conf) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = 0; run(); }, ms);
  }

  /* ---------- linking ---------- */

  function newCode() { return b64u(crypto.getRandomValues(new Uint8Array(32))); }

  function start(code) {
    conf = { code, rev: 0, hash: "", at: 0 };
    keys = null;
    save();
    setState({ phase: "idle", at: 0, error: "" });
    return run().then(() => state);
  }

  const api = {
    get on() { return !!conf; },
    state: () => state,
    listen(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    isCode: (text) => CODE.test(text),
    /* A sync code from a link or a scanned QR code (the whole link or just the code). */
    codeFrom(text) {
      const m = /(?:#\/sync\/|^)([A-Za-z0-9_-]{43})$/.exec(String(text || "").trim());
      return m ? m[1] : "";
    },
    link: () => (conf ? FL.share.base() + "#/sync/" + conf.code : ""),
    ready: () => fetch(API + "?status=1", { cache: "no-store" }).then((r) => r.json()).then((j) => !!j.ready).catch(() => false),
    create: () => start(newCode()),
    join: (code) => (CODE.test(code) ? start(code) : Promise.reject(fail("bad-code", "That isn't an Iris sync code"))),
    leave() {
      conf = null;
      keys = null;
      clearTimeout(timer);
      storage.remove(KEY);
      setState({ phase: "off", at: 0, error: "" });
    },
    now: () => run(),
    merge, normalize, stable, // for tests
  };

  /* ---------- when to sync ---------- */

  FL.store.on((d) => { if (d.kind !== "sync") schedule(d.kind === "progress" ? 10000 : 1200); });
  FL.store.onPrefs(() => schedule(1500));
  document.addEventListener("visibilitychange", () => {
    if (!conf) return;
    if (document.visibilityState === "visible") schedule(200);
    else if (timer) { clearTimeout(timer); timer = 0; run(); } // leaving with changes not yet sent: send them now
  });
  window.addEventListener("online", () => schedule(500));
  setInterval(() => { if (conf && document.visibilityState === "visible" && !busy) run(); }, 60000);
  if (conf) setTimeout(run, 600);

  FL.sync = api;
})(window.FL = window.FL || {});
