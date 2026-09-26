/* Iris — keep the library in a real file on disk (File System Access API, Chrome / Edge desktop).
   The file survives "Clear browsing data"; put it in iCloud Drive / Google Drive / Dropbox and it follows you
   to other computers. The file handle itself is kept in IndexedDB so saving resumes after a reload. */
(function (FL) {
  "use strict";

  const { debounce } = FL.util;
  const DB = "iris";
  const STORE = "handles";
  const supported = typeof window.showSaveFilePicker === "function" && typeof window.showOpenFilePicker === "function";

  const state = { handle: null, name: "", active: false, needsPermission: false, lastSaved: 0, error: "" };
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn(status()));

  /* ---------- tiny IndexedDB key/value ---------- */

  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => { resolve(req && req.result); open.result.close(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }
  const idbGet = (k) => idb("readonly", (s) => s.get(k)).catch(() => null);
  const idbSet = (k, v) => idb("readwrite", (s) => s.put(v, k)).catch(() => null);
  const idbDel = (k) => idb("readwrite", (s) => s.delete(k)).catch(() => null);

  /* ---------- writing ---------- */

  async function write() {
    if (!state.handle || !state.active) return;
    try {
      const w = await state.handle.createWritable();
      await w.write(JSON.stringify(FL.store.snapshot(), null, 1));
      await w.close();
      state.lastSaved = Date.now();
      state.error = "";
    } catch (e) {
      state.error = e && e.name === "NotAllowedError" ? "Permission was withdrawn. Reconnect the file." : "Couldn't write the file.";
      if (e && e.name === "NotAllowedError") { state.active = false; state.needsPermission = true; }
    }
    notify();
  }
  const scheduleWrite = debounce(write, 1500);

  FL.store.on((d) => { if (d.kind !== "progress") scheduleWrite(); });

  async function adopt(handle) {
    state.handle = handle;
    state.name = handle.name;
    state.active = true;
    state.needsPermission = false;
    await idbSet("library", handle);
    await write();
  }

  /* ---------- public ---------- */

  async function init() {
    if (!supported) return;
    const handle = await idbGet("library");
    if (!handle) return;
    state.handle = handle;
    state.name = handle.name;
    try {
      const perm = await handle.queryPermission({ mode: "readwrite" });
      state.active = perm === "granted";
      state.needsPermission = perm !== "granted";
    } catch (e) {
      state.needsPermission = true;
    }
    notify();
  }

  /* Pick a file to keep the library in (user gesture required). */
  async function connect() {
    const handle = await window.showSaveFilePicker({
      suggestedName: "iris-library.json",
      types: [{ description: "Iris library", accept: { "application/json": [".json"] } }],
    });
    await adopt(handle);
  }

  async function reconnect() {
    if (!state.handle) return connect();
    const perm = await state.handle.requestPermission({ mode: "readwrite" });
    if (perm === "granted") { state.active = true; state.needsPermission = false; await write(); }
    notify();
  }

  /* Read a library file (merging it in) and, where possible, keep saving to it. */
  async function restore() {
    if (!supported) throw new Error("unsupported");
    const [handle] = await window.showOpenFilePicker({ types: [{ description: "Iris library", accept: { "application/json": [".json"] } }] });
    const file = await handle.getFile();
    const data = JSON.parse(await file.text());
    const n = FL.store.importJSON(data, "merge");
    try {
      const perm = await handle.requestPermission({ mode: "readwrite" });
      if (perm === "granted") await adopt(handle);
    } catch (e) { /* read-only is fine */ }
    return n;
  }

  async function disconnect() {
    state.handle = null;
    state.name = "";
    state.active = false;
    state.needsPermission = false;
    await idbDel("library");
    notify();
  }

  function status() {
    return { supported, active: state.active, needsPermission: state.needsPermission, name: state.name, lastSaved: state.lastSaved, error: state.error };
  }

  async function storageProtected() {
    try { return !!(navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()); } catch (e) { return false; }
  }

  FL.persist = {
    supported, init, connect, reconnect, restore, disconnect, status, storageProtected, save: write,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  init();
})(window.FL = window.FL || {});
