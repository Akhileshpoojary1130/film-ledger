/* Iris public demo guard.
   - Each visitor gets 5 minutes of use (time only counts while the tab is visible). After that the demo
     stays blocked in this browser.
   - While developer tools are open, the app pauses and makes no network requests.
   - Play buttons are shown but blocked: they open a note instead of the player.
   Loaded before every other script. */
(function () {
  "use strict";

  var LIMIT_MS = 5 * 60 * 1000;
  var KEY = "iris_demo_v2";
  var COOKIE = "iris_demo_v2_done";
  var used = 0;
  var blocked = false;
  var paused = false;
  var overlay = null;

  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || "null");
      if (v && typeof v.used === "number") used = v.used;
      if (v && v.done) blocked = true;
    } catch (e) {}
    if (document.cookie.indexOf(COOKIE + "=1") >= 0) blocked = true;
  }
  function write() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ used: used, done: blocked }));
    } catch (e) {}
    if (blocked) document.cookie = COOKIE + "=1; max-age=31536000; path=/; SameSite=Lax";
  }

  // ---------- network gate: nothing leaves the page while paused or blocked ----------
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  if (realFetch) {
    window.fetch = function () {
      if (paused || blocked) return Promise.reject(new Error("Iris demo is paused"));
      return realFetch.apply(window, arguments);
    };
  }
  var realSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (paused || blocked) {
      this.abort();
      return;
    }
    return realSend.apply(this, arguments);
  };

  // ---------- overlay ----------
  function show(kind) {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", function () { show(kind); });
      return;
    }
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "demo-gate";
      overlay.setAttribute("role", "alertdialog");
      overlay.setAttribute("aria-modal", "true");
      document.body.appendChild(overlay);
    }
    overlay.dataset.kind = kind;
    overlay.innerHTML =
      kind === "over"
        ? '<div class="demo-card"><p class="demo-eyebrow">Iris · demo</p><h2>Thanks for trying Iris.</h2>' +
          "<p>The public demo is limited to 5 minutes per visitor, and your time is up. Iris is a personal project by Akhilesh Poojary.</p>" +
          '<a class="demo-btn" href="https://akhilesh-poojary.vercel.app/">See Akhilesh\'s portfolio</a></div>'
        : '<div class="demo-card"><p class="demo-eyebrow">Iris · demo</p><h2>Paused</h2>' +
          "<p>Developer tools are open, so the demo is paused and makes no requests. Close them to continue.</p></div>";
    overlay.hidden = false;
    document.documentElement.classList.add("demo-locked");
  }
  function hide() {
    if (overlay) overlay.hidden = true;
    document.documentElement.classList.remove("demo-locked");
  }

  // ---------- developer tools ----------
  function devtoolsOpen() {
    // A `debugger` statement only stops execution while developer tools are open, so a long gap means
    // they are. (Window-size checks are not used: browser zoom and side panels give false alarms.)
    var t = performance.now();
    // eslint-disable-next-line no-debugger
    debugger;
    return performance.now() - t > 120;
  }

  function check() {
    if (blocked) return;
    var open = devtoolsOpen();
    if (open && !paused) {
      paused = true;
      show("paused");
    } else if (!open && paused) {
      paused = false;
      hide();
    }
  }

  // ---------- time limit ----------
  var last = Date.now();
  function tick() {
    var now = Date.now();
    if (!blocked && !paused && document.visibilityState === "visible") used += Math.min(now - last, 2000);
    last = now;
    if (!blocked && used >= LIMIT_MS) {
      blocked = true;
      show("over");
    }
    write();
    var badge = document.getElementById("demo-left");
    if (badge && !blocked) {
      var left = Math.max(0, LIMIT_MS - used);
      var m = Math.floor(left / 60000);
      var s = Math.floor((left % 60000) / 1000);
      badge.textContent = "Demo · " + m + ":" + (s < 10 ? "0" : "") + s + " left";
    }
  }

  // ---------- shortcuts and context menu ----------
  window.addEventListener(
    "keydown",
    function (e) {
      var k = (e.key || "").toLowerCase();
      var mod = e.ctrlKey || e.metaKey;
      if (k === "f12" || (mod && e.shiftKey && (k === "i" || k === "j" || k === "c")) || (e.metaKey && e.altKey && (k === "i" || k === "j" || k === "c" || k === "u")) || (mod && k === "u")) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );
  window.addEventListener("contextmenu", function (e) { e.preventDefault(); }, true);

  // ---------- Play buttons: visible, but they open a note instead of the player ----------
  document.addEventListener(
    "click",
    function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href*="#/watch/"], a[href*="#/anime/watch/"]') : null;
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      if (window.FL && FL.player && FL.player.blocked) FL.player.blocked();
    },
    true
  );

  read();
  if (blocked) show("over");
  document.addEventListener("DOMContentLoaded", function () {
    var b = document.createElement("div");
    b.id = "demo-left";
    b.className = "demo-badge";
    document.body.appendChild(b);
    tick();
  });
  setInterval(tick, 1000);
  setInterval(check, 1500);
})();
