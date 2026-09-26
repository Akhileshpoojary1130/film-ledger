/* Iris — shared helpers. Every module hangs off window.FL. */
(function (FL) {
  "use strict";

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* Synopses from the web: em dashes read as commas. "A man — haunted by his past — returns" → "A man, haunted by his past, returns". */
  function prose(text) {
    return String(text == null ? "" : text).replace(/\s*—\s*/g, ", ").replace(/,\s*([,.;:!?)])/g, "$1").replace(/^,\s*|,\s*$/g, "");
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* Lowercase, strip accents and punctuation: "Spider-Man: No Way Home" -> "spider man no way home". */
  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/['’`]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  /* Loose phonetic skeleton so Hinglish spellings meet: "Chhichhore" ~ "chichore", "Dhoom" ~ "dhum". Word breaks are kept. */
  function skeleton(normalized) {
    return normalized
      .replace(/ee/g, "i")
      .replace(/oo/g, "u")
      .replace(/w/g, "v")
      .replace(/z/g, "j")
      .replace(/q/g, "k")
      .replace(/h/g, "")
      .replace(/([a-z])\1+/g, "$1");
  }

  function debounce(fn, wait) {
    let timer = 0;
    const debounced = function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
    debounced.cancel = () => clearTimeout(timer);
    return debounced;
  }

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function parseISO(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function fmtDate(iso, style) {
    if (!iso) return "";
    const d = parseISO(iso);
    if (style === "short") return d.getDate() + " " + MONTHS_SHORT[d.getMonth()];
    if (style === "month") return MONTHS[d.getMonth()] + " " + d.getFullYear();
    return d.getDate() + " " + MONTHS_SHORT[d.getMonth()] + " " + d.getFullYear();
  }

  function fmtRuntime(minutes) {
    if (!minutes) return "";
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (!h) return m + "m";
    return h + "h" + (m ? " " + pad(m) + "m" : "");
  }

  function fmtHours(minutes) {
    if (!minutes) return "0h";
    if (minutes < 60) return Math.round(minutes) + "m";
    return Math.round(minutes / 60).toLocaleString() + "h";
  }

  function fmtClock(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return (h ? h + ":" + pad(m) : m) + ":" + pad(s);
  }

  function compact(n) {
    if (n == null) return "";
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
    return String(n);
  }

  const plural = (n, word, many) => n.toLocaleString() + " " + (n === 1 ? word : many || word + "s");

  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return "Late night";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }

  /* localStorage that never throws (private mode, quota, disabled storage). */
  const storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    },
  };

  const session = {
    get(key, fallback) {
      try {
        const raw = sessionStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    },
  };

  /* Delegated listener: on(root, "click", "[data-act]", (e, el) => …). */
  function on(root, type, selector, handler, options) {
    root.addEventListener(type, (event) => {
      const target = event.target.closest ? event.target.closest(selector) : null;
      if (target && root.contains(target)) handler(event, target);
    }, options);
  }

  function fetchJSON(url, { timeout = 9000 } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    return fetch(url, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .finally(() => clearTimeout(timer));
  }

  /* Runs async jobs with a concurrency cap; returns a function that enqueues. */
  function limiter(max) {
    let active = 0;
    const queue = [];
    const next = () => {
      if (active >= max || !queue.length) return;
      active++;
      const { job, resolve, reject } = queue.shift();
      Promise.resolve()
        .then(job)
        .then(resolve, reject)
        .finally(() => { active--; next(); });
    };
    return (job) => new Promise((resolve, reject) => { queue.push({ job, resolve, reject }); next(); });
  }

  function isTyping(event) {
    const t = event.target;
    return !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const idle = window.requestIdleCallback
    ? (fn) => window.requestIdleCallback(fn, { timeout: 1500 })
    : (fn) => setTimeout(fn, 200);

  FL.util = {
    MONTHS, MONTHS_SHORT, $, $$, esc, prose, normalize, skeleton, debounce, clamp, hash, pad,
    todayISO, parseISO, fmtDate, fmtRuntime, fmtHours, fmtClock, compact, plural, greeting,
    storage, session, on, fetchJSON, limiter, isTyping, download, idle,
  };
})(window.FL = window.FL || {});
