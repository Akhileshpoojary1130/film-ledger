/* Iris — Sync (the same library and settings on every device you link; sync.js) with a one-time copy by QR code
   as the no-internet fallback, and Movie night (compare Watch later lists with a friend by link). The one-time copy
   and Movie night need no server: the data travels inside the QR codes and the link's #fragment. */
(function (FL) {
  "use strict";

  const { esc, plural, storage, $ } = FL.util;
  const { icon, card, art, empty, toast } = FL.ui;

  FL.views = FL.views || {};

  /* ---------- Move ---------- */

  const PARTS_KEY = "film_ledger_move_parts";

  FL.views.move = {
    title: "Sync your devices",
    mount(el, params, query, joinCode) {
      let alive = true;
      let cycle = 0;
      let paused = false;
      let release = null;
      let scan = null;
      let parts = null;
      let pending = null;
      let lastHint = 0;

      const watched = FL.store.watched().length;
      const listed = FL.store.watchlist().length;
      const shows = FL.store.shows().length;
      const total = FL.store.entries().length;

      el.innerHTML = '<div class="container page move-page">' +
        '<header class="page-head"><div><p class="eyebrow">Phone ↔ laptop</p>' +
          '<h1 class="display-sm">Sync your <em>devices.</em></h1>' +
          '<p class="sub">Watched, Watch later, favourites, ratings, shows, where you stopped and your settings: the same on every device you link.</p></div></header>' +
        '<section class="panel move-card sync-card" data-sync aria-live="polite"></section>' +
        '<div class="move-grid">' +
          '<section class="panel move-card" data-recv>' +
            '<div class="move-head"><span class="move-ico">' + icon("camera") + '</span><div><h2 class="h3">Scan a code</h2>' +
              '<p class="sub">Point this camera at the sync code on your other device. One-time copy codes work here too.</p></div></div>' +
            '<div class="scan-stage" data-scan hidden><video muted playsinline></video><i class="scan-box" aria-hidden="true"></i>' +
              '<div class="scan-meter" data-meter aria-live="polite"></div></div>' +
            '<div data-recvbody></div>' +
            '<div class="btn-row" data-recvbtns><button type="button" class="btn btn-primary" data-move="scan">' + icon("camera") + "Scan code</button></div>" +
          "</section>" +
          '<section class="panel move-card" data-send>' +
            '<div class="move-head"><span class="move-ico">' + icon("qr") + '</span><div><h2 class="h3">One-time copy</h2>' +
              '<p class="sub">No internet needed: ' + (total ? [plural(watched, "film") + " watched", listed + " to watch", shows ? plural(shows, "show") : ""].filter(Boolean).join(" · ") : "nothing to send yet") +
              " travel inside the code. It doesn’t stay in sync.</p></div></div>" +
            '<button type="button" class="qr-stage" data-qr hidden aria-label="Pause or resume the code"></button>' +
            '<p class="qr-foot" data-qrfoot hidden></p>' +
            '<div class="btn-row"><button type="button" class="btn btn-ghost" data-move="show"' + (total ? "" : " disabled") + ">" + icon("qr") + "Show code</button></div>" +
          "</section>" +
        "</div></div>";

      const qrStage = $("[data-qr]", el);
      const qrFoot = $("[data-qrfoot]", el);
      const scanStage = $("[data-scan]", el);
      const video = $("video", el);
      const meter = $("[data-meter]", el);
      const recvBody = $("[data-recvbody]", el);
      const recvBtns = $("[data-recvbtns]", el);

      /* ----- sending ----- */

      function stopSending() {
        clearInterval(cycle);
        cycle = 0;
        if (release) { release(); release = null; }
      }

      async function showCode(btn) {
        btn.disabled = true;
        btn.innerHTML = FL.ui.loader(16) + "Preparing…";
        try {
          const list = FL.share.frames(await FL.share.pack(FL.share.libraryPayload()));
          const svgs = await Promise.all(list.map((t) => FL.share.qrSvg(t)));
          if (!alive) return;
          qrStage.innerHTML = svgs.map((s, i) => '<span class="qr-frame"' + (i ? " hidden" : "") + ">" + s + "</span>").join("");
          qrStage.hidden = false;
          qrFoot.hidden = false;
          const n = list.length;
          let i = 0;
          const foot = () => {
            qrFoot.innerHTML = n === 1
              ? "Scan with Iris on your other device, or with its camera app."
              : '<span class="qr-parts">' + Array.from({ length: n }, (_, k) => "<i" + (k === i ? ' class="on"' : "") + "></i>").join("") + "</span>" +
                "<span>Part " + (i + 1) + " of " + n + " · " + (paused ? "paused, tap the code to resume" : "keep it steady; tap to pause") + "</span>";
          };
          const show = (k) => {
            const fr = qrStage.children;
            fr[i].hidden = true;
            i = (k + n) % n;
            fr[i].hidden = false;
            foot();
          };
          foot();
          stopSending();
          // A big library is several codes shown in turn; Iris on the other side collects them in any order.
          if (n > 1) cycle = setInterval(() => { if (!paused) show(i + 1); }, 320);
          qrStage.onclick = () => { if (n > 1) { paused = !paused; foot(); } };
          qrStage.onkeydown = (e) => {
            if (n < 2 || !/Arrow(Left|Right)/.test(e.key)) return;
            e.preventDefault();
            paused = true;
            show(i + (e.key === "ArrowRight" ? 1 : -1));
          };
          release = FL.share.keepAwake();
          btn.dataset.move = "hide";
          btn.className = "btn btn-ghost";
          btn.innerHTML = icon("x") + "Hide code";
          qrStage.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } catch (err) {
          btn.innerHTML = icon("qr") + "Show code";
          toast("Couldn’t make the code: " + (err.message || "try again") + ".");
        }
        btn.disabled = false;
      }

      function hideCode(btn) {
        stopSending();
        paused = false;
        qrStage.hidden = true;
        qrFoot.hidden = true;
        qrStage.innerHTML = "";
        btn.dataset.move = "show";
        btn.className = "btn btn-ghost";
        btn.innerHTML = icon("qr") + "Show code";
      }

      /* ----- receiving ----- */

      function paintMeter() {
        if (!parts) { meter.innerHTML = "<span>Looking for a code…</span>"; return; }
        const got = Object.keys(parts.got).length;
        meter.innerHTML = '<span class="scan-bar"><i style="width:' + (got / parts.n) * 100 + '%"></i></span><span>' +
          (parts.n === 1 ? "Reading…" : got + " of " + parts.n + " parts") + "</span>";
      }

      function stopScan() {
        if (scan) { scan.stop(); scan = null; }
        scanStage.hidden = true;
      }

      function startScan() {
        recvBody.innerHTML = "";
        recvBtns.innerHTML = '<button type="button" class="btn btn-ghost" data-move="stopscan">' + icon("x") + "Stop</button>";
        scanStage.hidden = false;
        paintMeter();
        scan = FL.share.scanner(video, onCode);
        scan.ready.catch((err) => {
          if (!alive) return;
          stopScan();
          const blocked = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
          const none = err && (err.name === "NotFoundError" || err.name === "OverconstrainedError");
          recvBody.innerHTML = '<p class="move-note warn">' + esc(blocked
            ? "Camera access is off for this site. Allow the camera in your browser’s site settings, then try again."
            : none ? "No camera found on this device. Show the code here and scan it from the other one instead."
            : (err && err.message) || "The camera didn’t start.") + "</p>";
          recvBtns.innerHTML = '<button type="button" class="btn btn-primary" data-move="scan">' + icon("camera") + "Try again</button>";
        });
        scanStage.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }

      function onCode(text) {
        const code = FL.sync && FL.sync.codeFrom(text);
        if (code) {
          stopScan();
          recvBtns.innerHTML = '<button type="button" class="btn btn-primary" data-move="scan">' + icon("camera") + "Scan code</button>";
          if (navigator.vibrate) navigator.vibrate(12);
          offerJoin(code);
          return;
        }
        const f = FL.share.parseFrame(text);
        if (!f) {
          if (Date.now() - lastHint > 4000) { lastHint = Date.now(); toast("That QR code isn’t from Iris."); }
          return;
        }
        if (!parts || parts.sid !== f.sid) parts = { sid: f.sid, n: f.n, got: {}, at: Date.now() };
        if (parts.got[f.i]) return;
        parts.got[f.i] = f.data;
        if (navigator.vibrate) navigator.vibrate(12);
        paintMeter();
        if (Object.keys(parts.got).length === parts.n) finish();
      }

      async function finish() {
        stopScan();
        storage.remove(PARTS_KEY);
        const packed = Array.from({ length: parts.n }, (_, k) => parts.got[k + 1]).join("");
        parts = null;
        try {
          const payload = await FL.share.unpack(packed);
          if (!payload || payload.app !== "iris-move") throw new Error("not a library");
          if (alive) offer(payload);
        } catch (err) {
          if (!alive) return;
          recvBody.innerHTML = '<p class="move-note warn">Couldn’t read that code. Scan it again and hold steady until every part is in.</p>';
          recvBtns.innerHTML = '<button type="button" class="btn btn-primary" data-move="scan">' + icon("camera") + "Scan again</button>";
        }
      }

      function offer(payload) {
        const d = FL.share.describe(payload);
        pending = payload;
        const who = payload.name ? esc(String(payload.name).slice(0, 40)) + "’s " + esc(payload.device || "device") : "Your " + esc(payload.device || "other device");
        recvBody.innerHTML = '<div class="move-found"><span class="move-ico">' + icon("devices") + "</span><div>" +
          "<strong>" + who + "</strong>" +
          "<span>" + [plural(d.watched, "film") + " watched", d.listed + " to watch", d.shows ? plural(d.shows, "show") : ""].filter(Boolean).join(" · ") + "</span></div></div>" +
          '<p class="footnote">Added to what’s already here. Nothing on this device is removed. Where both have a rating, the newer one wins.</p>';
        recvBtns.innerHTML = '<button type="button" class="btn btn-primary" data-move="import">' + icon("download") + "Add to this device</button>" +
          '<button type="button" class="btn btn-ghost" data-move="cancel">Cancel</button>';
      }

      function doImport() {
        if (!pending) return;
        try {
          const n = FL.share.importLibrary(pending);
          pending = null;
          recvBody.innerHTML = '<div class="move-found is-done"><span class="move-ico">' + icon("check") + "</span><div><strong>All in: " + plural(n, "title") + " merged.</strong>" +
            "<span>Watched, Watch later, ratings, shows and where you stopped.</span></div></div>";
          recvBtns.innerHTML = '<a class="btn btn-primary" href="#/library/watched">Open Library</a><button type="button" class="btn btn-ghost" data-move="scan">' + icon("camera") + "Scan another</button>";
          toast("Library moved: " + plural(n, "title") + " merged.");
        } catch (err) {
          toast(err.message || "That didn’t work.");
        }
      }

      /* ----- sync ----- */

      const syncCard = $("[data-sync]", el);
      let ready = null; // is a store connected on the server? (null until asked)
      let showQr = false;
      let joining = "";
      let qrCache = "";
      const ago = (ms) => {
        const s = (Date.now() - ms) / 1000;
        if (s < 50) return "just now";
        if (s < 3600) return Math.round(s / 60) + " min ago";
        const d = new Date(ms);
        return (s < 20 * 3600 ? "at " : d.toLocaleDateString([], { day: "numeric", month: "short" }) + ", ") + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      };
      const head = (ico, title, sub) => '<div class="move-head"><span class="move-ico">' + icon(ico) + '</span><div><h2 class="h3">' + title + "</h2>" +
        (sub ? '<p class="sub">' + sub + "</p>" : "") + "</div></div>";
      const SETUP = "It needs a free Upstash Redis store connected to this site in Vercel (Storage → Upstash → Connect). Until then, a one-time copy below still works.";

      function paintSync() {
        if (!alive) return;
        const st = FL.sync.state();
        if (joining) {
          const other = st.on && FL.sync.link().slice(-43) !== joining;
          syncCard.innerHTML = head("sync", other ? "Switch to that library?" : "Link this device?",
            other ? "This device is linked to a different library. Switching adds what’s here to the new one; the old one stays on your other devices."
              : "What’s on this device is added to your synced library, and from then on both stay the same.") +
            '<div class="btn-row"><button type="button" class="btn btn-primary" data-move="sync-join">' + icon("sync") + (other ? "Switch" : "Link this device") + "</button>" +
            '<button type="button" class="btn btn-ghost" data-move="sync-cancel">Cancel</button></div>';
          return;
        }
        if (!st.on) {
          if (ready === false) {
            syncCard.innerHTML = head("sync", "Sync isn’t switched on for this site yet", SETUP);
            return;
          }
          syncCard.innerHTML = head("sync", "Keep this device in sync",
            "Turn it on here, then scan the code with your other device. It’s encrypted before it leaves the device; only devices with your code can read it.") +
            '<div class="btn-row"><button type="button" class="btn btn-primary" data-move="sync-on"' + (ready ? "" : " disabled") + ">" +
              (ready == null ? FL.ui.loader(16) : icon("sync")) + "Turn on sync</button>" +
            '<button type="button" class="btn btn-ghost" data-move="scan">' + icon("camera") + "I have a code</button></div>";
          return;
        }
        const line = st.phase === "syncing" ? "Syncing…"
          : st.phase === "error" ? (st.code === "not-configured" ? SETUP : "Couldn’t sync: " + esc(st.error) + ". It tries again on its own.")
          : st.at ? "Synced " + ago(st.at) + ". Changes reach your other devices within a minute." : "Linked.";
        syncCard.innerHTML = head("sync", "Sync is on", line) +
          (showQr ? '<div class="qr-stage is-static" data-syncqr>' + qrCache + "</div>" +
            '<p class="qr-foot"><span>Scan it with the other device’s camera, or open Iris there → Settings → Sync → <strong>I have a code</strong>. ' +
            "Anyone with this code can see and change your library, so keep it to your own devices.</span></p>" : "") +
          '<div class="btn-row">' +
            (showQr ? '<button type="button" class="btn btn-primary" data-move="sync-copy">' + icon("link") + "Copy link</button>" +
              '<button type="button" class="btn btn-ghost" data-move="sync-hide">' + icon("x") + "Hide code</button>"
              : '<button type="button" class="btn btn-primary" data-move="sync-add">' + icon("qr") + "Add a device</button>" +
              '<button type="button" class="btn btn-ghost" data-move="sync-now"' + (st.phase === "syncing" ? " disabled" : "") + ">" + icon("sync") + "Sync now</button>") +
            '<button type="button" class="btn btn-ghost" data-move="sync-off">Turn off here</button>' +
          "</div>";
        if (showQr) {
          if (!qrCache) FL.share.qrSvg(FL.sync.link()).then((svg) => { qrCache = svg; const q = $("[data-syncqr]", el); if (q) q.innerHTML = svg; });
          if (!release) release = FL.share.keepAwake();
        }
      }

      function offerJoin(code) {
        if (FL.sync.on && FL.sync.link().slice(-43) === code) { toast("This device is already linked to that library."); return; }
        joining = code;
        paintSync();
        syncCard.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }

      function syncAction(act) {
        if (act === "sync-on") {
          qrCache = "";
          FL.sync.create().then((st) => {
            showQr = !!st.on && st.phase !== "error";
            paintSync();
            if (st.phase !== "error") toast("Sync is on. Scan the code with your other device.");
          });
          paintSync();
        } else if (act === "sync-join") {
          const code = joining;
          joining = "";
          qrCache = "";
          FL.sync.join(code).then((st) => {
            paintSync();
            if (st.phase === "error") toast("Couldn’t link: " + st.error + ".");
            else toast("Linked. This device now stays in sync.");
          });
          paintSync();
        } else if (act === "sync-cancel") { joining = ""; paintSync(); }
        else if (act === "sync-add") { showQr = true; paintSync(); }
        else if (act === "sync-hide") { showQr = false; if (release) { release(); release = null; } paintSync(); }
        else if (act === "sync-copy") FL.share.copy(FL.sync.link()).then(() => toast("Link copied. Open it on your other device."));
        else if (act === "sync-now") FL.sync.now();
        else if (act === "sync-off") {
          // Two taps: the first asks, so a stray tap doesn't unlink the device.
          const btn = $('[data-move="sync-off"]', el);
          if (btn && !btn.dataset.armed) {
            btn.dataset.armed = "1";
            btn.classList.add("btn-danger");
            btn.textContent = "Tap again to turn off";
            setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.classList.remove("btn-danger"); btn.textContent = "Turn off here"; } }, 4000);
            return;
          }
          FL.sync.leave();
          showQr = false;
          qrCache = "";
          if (release) { release(); release = null; }
          paintSync();
          toast("Sync is off on this device.");
        }
      }

      const unlisten = FL.sync.listen(paintSync);
      if (joinCode) { history.replaceState(null, "", "#/move"); joining = FL.sync.codeFrom(joinCode); }
      paintSync();
      FL.sync.ready().then((ok) => { ready = ok; paintSync(); });
      if (joining && FL.sync.on && FL.sync.link().slice(-43) === joining) { joining = ""; paintSync(); toast("This device is already linked to that library."); }

      /* Opened from a phone's camera app: the link is one part of the code. Parts from earlier scans wait in storage. */
      if (params[0]) {
        const f = FL.share.parseFrame("#/move/" + params[0]);
        history.replaceState(null, "", "#/move");
        if (f) {
          let saved = storage.get(PARTS_KEY, null);
          if (!saved || saved.sid !== f.sid || Date.now() - (saved.at || 0) > 30 * 60e3) saved = { sid: f.sid, n: f.n, got: {}, at: Date.now() };
          saved.got[f.i] = f.data;
          saved.at = Date.now();
          parts = saved;
          if (Object.keys(parts.got).length === parts.n) finish();
          else {
            storage.set(PARTS_KEY, saved);
            recvBody.innerHTML = '<p class="move-note">Got ' + Object.keys(parts.got).length + " of " + f.n + " parts. The library is split over several codes. Scan the rest here with Iris; it collects them in any order.</p>";
            recvBtns.innerHTML = '<button type="button" class="btn btn-primary" data-move="scan">' + icon("camera") + "Scan the rest</button>";
          }
        }
      }

      function onClick(e) {
        const b = e.target.closest("[data-move]");
        if (!b) return;
        const act = b.dataset.move;
        if (act.indexOf("sync-") === 0) { syncAction(act); return; }
        if (act === "show") showCode(b);
        else if (act === "hide") hideCode(b);
        else if (act === "scan") startScan();
        else if (act === "stopscan") {
          stopScan();
          recvBtns.innerHTML = '<button type="button" class="btn btn-primary" data-move="scan">' + icon("camera") + "Scan code</button>";
        } else if (act === "import") doImport();
        else if (act === "cancel") {
          pending = null;
          recvBody.innerHTML = "";
          recvBtns.innerHTML = '<button type="button" class="btn btn-primary" data-move="scan">' + icon("camera") + "Scan code</button>";
        }
      }
      el.addEventListener("click", onClick);

      return {
        destroy() {
          alive = false;
          unlisten();
          stopSending();
          stopScan();
          el.removeEventListener("click", onClick);
        },
      };
    },
  };

  FL.views.sync = {
    title: "Sync your devices",
    mount: (el, params, query) => FL.views.move.mount(el, [], query, params[0]),
  };

  /* ---------- Movie night ---------- */

  const vw = (f) => { const v = f.votes || 0; const r = f.rating || 0; return r ? (v * r + 3000 * 6.5) / (v + 3000) : 0; };
  const cleanName = (s) => String(s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40);
  const ID_RE = /^(tt\d{5,10}|wk\d{4}_[\w-]{1,100})$/;

  /* A friend's refs → films. Known titles resolve at once; web titles not seen on this device are fetched after. */
  function resolveRefs(refs) {
    const films = [];
    const later = [];
    const seen = new Set();
    const add = (f) => { if (f && !seen.has(f.id)) { seen.add(f.id); films.push(f); } };
    (Array.isArray(refs) ? refs : []).slice(0, 300).forEach((r) => {
      if (typeof r === "string" && r.length <= 120) {
        const f = /^tt\d+$/.test(r) ? FL.catalogue.byImdb(r) || FL.catalogue.get(r) : FL.catalogue.get(r);
        if (f) add(f);
        else if (/^tt\d{5,10}$/.test(r)) later.push(r);
      } else if (Array.isArray(r) && typeof r[0] === "string") {
        let f = FL.catalogue.get(r[0]);
        if (!f && ID_RE.test(r[0]) && r[1]) {
          f = FL.catalogue.addRemote({
            id: r[0], imdbId: /^tt/.test(r[0]) ? r[0] : "", title: String(r[1]).slice(0, 200), year: +r[2] || 0,
            type: r[3] === "series" ? "series" : "movie", genres: [],
          });
        }
        add(f);
      }
    });
    return { films, later: later.slice(0, 60) };
  }

  function rememberFriend(name, payload, count) {
    const key = name.toLowerCase();
    const list = (FL.store.prefs().friends || []).filter((x) => x && String(x.n).toLowerCase() !== key);
    list.unshift({ n: name, p: payload, c: count, at: Date.now() });
    FL.store.setPref("friends", list.slice(0, 6));
  }

  function linkFrom(text) {
    const s = String(text || "").trim();
    const m = /#\/match\/([A-Za-z0-9_-]+)/.exec(s);
    if (m) return m[1];
    return /^[zj][A-Za-z0-9_-]{8,}$/.test(s) ? s : "";
  }

  function ago(ms) {
    const d = Math.floor((Date.now() - ms) / 864e5);
    return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 30 ? d + " days ago" : new Date(ms).toLocaleDateString([], { day: "numeric", month: "short" });
  }

  function shareMine(btn, how) {
    const list = FL.store.watchlist();
    if (!list.length) { toast("Save a few films to Watch later first."); return; }
    const name = FL.store.prefs().name;
    if (btn) btn.disabled = true;
    FL.share.matchLink().then((url) => {
      if (how === "copy") return FL.share.copy(url);
      return FL.share.send(url, "Movie night", (name ? name + "’s" : "My") + " Watch later on Iris. Open it to see what we both want to watch.");
    }).then((r) => {
      if (r === "copied") toast("Link copied. Send it to a friend.");
      else if (r === "shared") toast("Sent.");
    }).catch(() => toast("Couldn’t copy the link. Try again.")).then(() => { if (btn) btn.disabled = false; });
  }

  function home(el) {
    let alive = true;
    function render() {
      const prefs = FL.store.prefs();
      const list = FL.store.watchlist();
      const covers = list.map((e) => FL.catalogue.get(e.id)).filter(Boolean).slice(0, 5);
      const canShare = !!navigator.share && matchMedia("(pointer: coarse)").matches;
      const friends = (prefs.friends || []).filter((x) => x && x.p);
      el.innerHTML = '<div class="container page match-page">' +
        '<header class="page-head"><div><p class="eyebrow">Movie night</p>' +
          '<h1 class="display-sm">What should we <em>watch together?</em></h1>' +
          '<p class="sub">Send your Watch later to a friend. When they open the link, Iris shows the films you’ve both saved, and they can send theirs back. The list travels inside the link; nothing is uploaded.</p></div></header>' +
        '<div class="move-grid">' +
          '<section class="panel move-card">' +
            '<div class="move-head"><span class="match-covers">' + (covers.length ? covers.map((f) => art(f)).join("") : '<span class="move-ico">' + icon("bookmark") + "</span>") + "</span>" +
              '<div><h2 class="h3">Your Watch later</h2><p class="sub">' + (list.length ? plural(list.length, "film") + " saved" : "Empty for now. Tap the bookmark on any poster to save one.") + "</p></div></div>" +
            (prefs.name ? "" : '<label class="label" for="mn-name">Your name</label><input class="input" id="mn-name" maxlength="40" placeholder="So your friend knows it’s you">') +
            '<div class="btn-row">' +
              (canShare ? '<button type="button" class="btn btn-primary" data-mn="send"' + (list.length ? "" : " disabled") + ">" + icon("share") + "Send link</button>" : "") +
              '<button type="button" class="btn ' + (canShare ? "btn-ghost" : "btn-primary") + '" data-mn="copy"' + (list.length ? "" : " disabled") + ">" + icon("link") + "Copy link</button>" +
              '<button type="button" class="btn btn-ghost" data-mn="qr"' + (list.length ? "" : " disabled") + ">" + icon("qr") + "Show QR</button>" +
            "</div><div data-mnqr></div>" +
          "</section>" +
          '<section class="panel move-card">' +
            '<div class="move-head"><span class="move-ico">' + icon("users") + '</span><div><h2 class="h3">Got a friend’s link?</h2>' +
              '<p class="sub">Open it on this device, or paste it here.</p></div></div>' +
            '<form class="match-paste" data-mnpaste><input class="input" name="link" placeholder="Paste the link" autocomplete="off" aria-label="Friend’s link">' +
              '<button type="submit" class="btn">Compare</button></form>' +
            (friends.length ? '<h3 class="label match-recent-label">Recent movie nights</h3><ul class="match-recent">' + friends.map((x, i) =>
              '<li><a href="#/match/' + esc(x.p) + '"><strong>' + esc(cleanName(x.n) || "A friend") + "</strong><span data-common=\"" + i + '">' + plural(+x.c || 0, "film") + " · " + ago(x.at) + "</span></a>" +
              '<button type="button" class="icon-btn icon-btn-sm" data-forget="' + i + '" aria-label="Forget">' + icon("x") + "</button></li>").join("") + "</ul>" : "") +
          "</section>" +
        "</div></div>";
      // How many of each friend's films are on your list too — worked out from their saved link.
      friends.forEach((x, i) => {
        FL.share.unpack(x.p).then((d) => {
          if (!alive) return;
          const mine = new Set(FL.store.watchlist().map((e) => e.id));
          const { films } = resolveRefs(d && d.l);
          const both = films.filter((f) => mine.has(f.id)).length;
          const span = el.querySelector('[data-common="' + i + '"]');
          if (span) span.textContent = plural(films.length, "film") + " · " + (both ? both + " in common" : "none in common yet") + " · " + ago(x.at);
        }).catch(() => {});
      });
    }

    function onClick(e) {
      const b = e.target.closest("[data-mn], [data-forget]");
      if (!b) return;
      if (b.dataset.forget != null) {
        const list = (FL.store.prefs().friends || []).slice();
        list.splice(+b.dataset.forget, 1);
        FL.store.setPref("friends", list);
        render();
        return;
      }
      const act = b.dataset.mn;
      if (act === "send" || act === "copy") shareMine(b, act);
      else if (act === "qr") {
        const slot = $("[data-mnqr]", el);
        if (slot.innerHTML) { slot.innerHTML = ""; return; }
        b.disabled = true;
        // A QR code stays easy to scan up to ~1,800 characters; long lists share their most recent saves.
        const tries = [200, 90, 50, 25];
        const attempt = (k) => FL.share.matchLink(tries[k]).then((url) => (url.length > 1800 && k < tries.length - 1 ? attempt(k + 1) : { url, k }));
        attempt(0).then(({ url, k }) => FL.share.qrSvg(url).then((svg) => {
          const n = FL.store.watchlist().length;
          slot.innerHTML = '<div class="qr-stage is-static">' + svg + '</div><p class="qr-foot">Scan with a phone camera to open it' +
            (k && n > tries[k] ? " (it holds your " + tries[k] + " most recent saves)" : "") + ".</p>";
        })).catch((err) => toast("Couldn’t make the code: " + (err.message || "try again") + "."))
          .then(() => { b.disabled = false; });
      }
    }
    function onInput(e) {
      if (e.target.id === "mn-name") FL.store.setPref("name", cleanName(e.target.value));
    }
    function onSubmit(e) {
      if (!e.target.matches("[data-mnpaste]")) return;
      e.preventDefault();
      const p = linkFrom(e.target.link.value);
      if (p) location.hash = "#/match/" + p;
      else toast("That doesn’t look like an Iris movie-night link.");
    }
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el.addEventListener("submit", onSubmit);
    render();
    return {
      update(d) { if (d.kind === "list" || d.kind === "import" || d.kind === "reset") render(); },
      destroy() {
        alive = false;
        el.removeEventListener("click", onClick);
        el.removeEventListener("input", onInput);
        el.removeEventListener("submit", onSubmit);
      },
    };
  }

  function compare(el, payload) {
    let alive = true;
    let name = "Your friend";
    let films = [];
    let waiting = 0;
    el.innerHTML = '<div class="container page page-loading">' + FL.ui.loader(44, "Opening the list") + "</div>";

    function pickCard(film) {
      const m = FL.meta.cached(film);
      const facts = [FL.catalogue.yearLabel(film), FL.catalogue.filmLang(film), m && m.runtime ? FL.util.fmtRuntime(m.runtime) : film.genres[0]]
        .filter((x) => x && x !== "World").map(esc).join(" · ");
      const href = FL.ui.hrefFor(film);
      return '<li class="pick-card"><a class="pick-art tilt" href="' + href + '" tabindex="-1">' + art(film) + "</a>" +
        '<div class="pick-text"><a class="pick-title" href="' + href + '">' + esc(film.title) + "</a>" +
          '<span class="pick-facts">' + facts + "</span>" +
          '<span class="pick-why">' + (film.rating ? "IMDb " + film.rating.toFixed(1) + " · " : "") + "on both lists</span></div>" +
        '<a class="icon-btn pick-play" href="#/watch/' + encodeURIComponent(film.id) + '" aria-label="Play ' + esc(film.title) + '" title="Play">' + icon("play") + "</a></li>";
    }

    function section(title, sub, list) {
      if (!list.length) return "";
      return '<section class="match-sec"><header class="section-head"><div><h2 class="h2">' + title + "</h2>" + (sub ? '<p class="sub">' + sub + "</p>" : "") +
        '</div></header><div class="grid">' + list.map((f) => card(f)).join("") + "</div></section>";
    }

    function render() {
      const mine = new Set(FL.store.watchlist().map((e) => e.id));
      const byScore = (a, b) => vw(b) - vw(a);
      const both = films.filter((f) => mine.has(f.id)).sort(byScore);
      const seen = films.filter((f) => !mine.has(f.id) && FL.store.state(f.id).watched);
      const theirs = films.filter((f) => !mine.has(f.id) && !FL.store.state(f.id).watched);
      const who = esc(name);
      el.innerHTML = '<div class="container page match-page">' +
        '<header class="page-head"><div><p class="eyebrow"><a href="#/match">Movie night</a></p>' +
          '<h1 class="display-sm">You &amp; <em>' + who + ".</em></h1>" +
          '<p class="sub">' + who + " saved " + plural(films.length, "film") + (waiting ? " (" + waiting + " still loading)" : "") + " · " +
            (both.length ? "<strong>" + both.length + "</strong> " + (both.length === 1 ? "is" : "are") + " on your Watch later too." : "none on your Watch later yet. Add any that appeal below.") + "</p></div>" +
          '<div class="btn-row head-actions"><button type="button" class="btn btn-primary" data-mn="back">' + icon("share") + "Send yours back</button></div></header>" +
        (both.length ? '<article class="tonight match-top"><header class="tonight-head"><div><p class="eyebrow">You both want to watch</p><h2 class="h2">' +
          (both.length === 1 ? "Tonight’s pick" : "Best of the overlap") + "</h2></div></header>" +
          '<ol class="tonight-list">' + both.slice(0, 3).map(pickCard).join("") + "</ol></article>" : "") +
        section("Also on both lists", "", both.slice(3)) +
        section(who + " wants to watch", "Tap the bookmark on any you’d watch too and it moves up to the shared list.", theirs) +
        section("You’ve already seen", "Tell " + who + " which ones are worth it.", seen) +
        (films.length ? "" : empty("This list is empty.", who + " hasn’t saved anything to Watch later yet.")) +
        "</div>";
      FL.ui.watchPosters(el);
    }

    function onClick(e) {
      if (e.target.closest('[data-mn="back"]')) shareMine(e.target.closest("button"), "send");
    }
    el.addEventListener("click", onClick);

    FL.share.unpack(payload).then((data) => {
      if (!alive) return;
      if (!data || !Array.isArray(data.l)) throw new Error("bad list");
      name = cleanName(data.n) || "Your friend";
      const res = resolveRefs(data.l);
      films = res.films;
      waiting = res.later.length;
      rememberFriend(name, payload, data.l.length);
      render();
      // Titles only the friend's device knew: fetch a few at a time, then fold them in.
      let i = 0;
      const next = () => {
        if (!alive || i >= res.later.length) return Promise.resolve();
        const tt = res.later[i++];
        return FL.remote.byId(tt).then((f) => { if (f && !films.some((x) => x.id === f.id)) films.push(f); }, () => {})
          .then(() => { waiting--; }).then(next);
      };
      if (res.later.length) Promise.all([next(), next(), next(), next()]).then(() => { if (alive) render(); });
    }).catch(() => {
      if (!alive) return;
      el.innerHTML = '<div class="container page">' + empty("That link didn’t open.", "It may have been cut short when it was copied. Ask your friend to send it again.", '<a class="btn" href="#/match">Movie night</a>') + "</div>";
    });

    return {
      update(d) { if (d.kind !== "progress" && films.length) { const y = window.scrollY; render(); window.scrollTo(0, y); } },
      destroy() { alive = false; el.removeEventListener("click", onClick); },
    };
  }

  FL.views.match = {
    title: "Movie night",
    mount(el, params) {
      return params[0] ? compare(el, params[0]) : home(el);
    },
  };
})(window.FL = window.FL || {});
