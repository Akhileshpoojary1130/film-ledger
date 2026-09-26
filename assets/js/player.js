/* Iris — theatre player for films and show episodes.
   Embeds are cross-origin iframes, so their video controls are theirs. Everything around them is ours:
   reachability probes, server choice, id resolution, resume, progress, auto-logging and failover. */
(function (FL) {
  "use strict";

  const { esc, session, fmtClock } = FL.util;

  const hex = () => (FL.theme ? FL.theme.accent() : "#D6A75D").replace("#", "");

  /* Order is the default preference. Probes and past success re-rank at runtime.
     `url` gets { imdb, tmdb, start, tv, s, e } and returns null when the host can't serve that title. */
  const SERVERS = [
    {
      id: "vidlink", name: "VidLink", origin: "https://vidlink.pro", resume: true,
      url: ({ imdb, tmdb, start, tv, s, e }) => {
        const id = tmdb || imdb;
        if (!id || (tv && !tmdb)) return null;
        const q = "?primaryColor=" + hex() + "&secondaryColor=3A3A40&iconColor=F5F5F2&title=false&poster=true&autoplay=false" + (start ? "&startAt=" + start : "");
        return tv ? "https://vidlink.pro/tv/" + tmdb + "/" + s + "/" + e + q + "&nextbutton=false" : "https://vidlink.pro/movie/" + id + q;
      },
    },
    {
      id: "2embed", name: "2Embed", origin: "https://www.2embed.cc",
      url: ({ imdb, tmdb, tv, s, e }) => {
        const id = imdb || tmdb;
        if (!id) return null;
        return tv ? "https://www.2embed.cc/embedtv/" + id + "&s=" + s + "&e=" + e : "https://www.2embed.cc/embed/" + id;
      },
    },
    {
      id: "vega", name: "Vega", origin: "https://slast430did.com",
      url: ({ imdb, tv }) => (imdb && !tv ? "https://slast430did.com/play/" + imdb : null),
    },
    {
      id: "videasy", name: "Videasy", origin: "https://player.videasy.net", resume: true,
      url: ({ imdb, tmdb, start, tv, s, e }) => {
        const id = tmdb || imdb;
        if (!id || (tv && !tmdb)) return null;
        const q = "?color=" + hex() + (start ? "&progress=" + start : "");
        return tv ? "https://player.videasy.net/tv/" + tmdb + "/" + s + "/" + e + q : "https://player.videasy.net/movie/" + id + q;
      },
    },
    {
      id: "vidsrc", name: "VidSrc", origin: "https://vidsrc.me",
      url: ({ imdb, tmdb, tv, s, e }) => {
        const key = imdb ? "imdb=" + imdb : tmdb ? "tmdb=" + tmdb : "";
        if (!key) return null;
        return tv ? "https://vidsrc.me/embed/tv?" + key + "&season=" + s + "&episode=" + e : "https://vidsrc.me/embed/movie?" + key;
      },
    },
  ];
  const ORIGINS = new Set(SERVERS.map((s) => s.origin));

  /* ---------- reachability ---------- */

  const HEALTH_KEY = "film_ledger_server_health";
  const HEALTH_TTL = 10 * 60e3;
  const health = session.get(HEALTH_KEY, {});
  const probing = {};

  /* A no-cors request resolves (opaque) when the host answers at all and rejects on DNS, TLS,
     refused or timed-out connections — exactly the failures that leave an embed blank. */
  function probe(server, force) {
    const h = health[server.id];
    if (!force && h && Date.now() - h.at < HEALTH_TTL) return Promise.resolve(h);
    if (probing[server.id]) return probing[server.id];
    const t0 = performance.now();
    // Slow isn't down: allow 9 s, and one retry, before calling a host unreachable (a busy 2Embed takes 3–4 s).
    const once = () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      return fetch(server.origin + "/favicon.ico", { mode: "no-cors", cache: "no-store", signal: ctrl.signal, referrerPolicy: "no-referrer" })
        .finally(() => clearTimeout(timer));
    };
    const p = once().catch(() => new Promise((res) => setTimeout(res, 600)).then(once))
      .then(() => ({ ok: true, ms: Math.round(performance.now() - t0) }), () => ({ ok: false, ms: 0 }))
      .then((r) => {
        r.at = Date.now();
        health[server.id] = r;
        session.set(HEALTH_KEY, health);
        delete probing[server.id];
        if (state.open) renderServers();
        return r;
      });
    probing[server.id] = p;
    return p;
  }

  const probeAll = (force) => Promise.all(SERVERS.map((s) => probe(s, force)));

  /* Availability differs by catalogue (a host strong on Hollywood may lack Hindi titles), so outcomes are
     remembered per language bucket as well as globally. */
  function serverStats() { return FL.store.prefs().servers || {}; }
  const bucketOf = (film) => (film ? (film.type === "series" ? "tv" : film.lang) : "");

  function bumpStat(id, field, film) {
    const stats = Object.assign({}, serverStats());
    [id, id + "|" + bucketOf(film)].forEach((key) => {
      const s = Object.assign({ ok: 0, fail: 0 }, stats[key]);
      s[field] = Math.min(50, s[field] + 1);
      stats[key] = s;
    });
    FL.store.setPref("servers", stats);
  }

  function lastServerFor(film) {
    const last = FL.store.prefs().lastServer;
    if (typeof last === "string") return last;
    return (last && (last[bucketOf(film)] || last.any)) || "";
  }

  function rememberServer(film, id) {
    const prev = FL.store.prefs().lastServer;
    const map = Object.assign({}, typeof prev === "object" && prev ? prev : {});
    map[bucketOf(film)] = id;
    map.any = id;
    FL.store.setPref("lastServer", map);
  }

  function ranked(film, entry) {
    const stats = serverStats();
    const last = lastServerFor(film);
    const filmSrv = entry && entry.progress && entry.progress.srv;
    const zero = { ok: 0, fail: 0 };
    return SERVERS.map((s, i) => {
      const h = health[s.id];
      const all = stats[s.id] || zero;
      const local = stats[s.id + "|" + bucketOf(film)] || zero;
      let score = -i * 4;
      if (h) score += h.ok ? 100 - Math.min(15, h.ms / 120) : -200;
      score += Math.min(40, local.ok * 6 + all.ok * 2) - Math.min(40, local.fail * 5 + all.fail * 1.5);
      if (s.id === last) score += 15;
      if (s.id === filmSrv) score += 30;
      return [score, s];
    }).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  }

  /* ---------- state & DOM ---------- */

  const state = {
    open: false, film: null, ids: null, ep: null, show: null, server: null, start: 0, confirmed: false, runtime: 0,
    lastSave: 0, logged: false, hintTimer: 0, openedAt: 0, token: 0,
  };
  let root = null;
  let onClose = null;

  function icon(name) { return FL.ui.icon(name); }
  const params = () => Object.assign({}, state.ids, state.ep ? { tv: true, s: state.ep.s, e: state.ep.e } : {});
  const epLabel = (ep) => "S" + ep.s + " · E" + ep.e;

  function build() {
    root = document.createElement("div");
    root.className = "player";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Player");
    root.hidden = true;
    root.innerHTML =
      '<header class="player-top">' +
        '<button type="button" class="icon-btn" data-pl="close" aria-label="Close player">' + icon("arrow-left") + "</button>" +
        '<div class="player-title"></div>' +
        '<div class="player-top-actions">' +
          '<button type="button" class="btn btn-sm btn-ghost" data-pl="next-ep" hidden>' + "Next episode" + icon("chevron-right") + "</button>" +
          '<a class="btn btn-ghost btn-sm" data-pl="newtab" target="_blank" rel="noopener noreferrer">' + icon("external") + "<span>New tab</span></a>" +
          '<button type="button" class="icon-btn" data-pl="fullscreen" aria-label="Fullscreen (F)">' + icon("expand") + "</button>" +
        "</div>" +
      "</header>" +
      '<div class="player-stage"><div class="player-frame"></div></div>' +
      '<div class="player-notice" hidden></div>' +
      '<footer class="player-bar">' +
        '<span class="label">Server</span>' +
        '<div class="player-servers" role="radiogroup" aria-label="Stream server"></div>' +
        '<button type="button" class="btn btn-sm" data-pl="next">Next server <kbd>N</kbd></button>' +
      "</footer>";
    document.body.appendChild(root);

    FL.util.on(root, "click", "[data-pl]", (e, el) => {
      const act = el.dataset.pl;
      if (act === "close") close();
      else if (act === "fullscreen") fullscreen();
      else if (act === "next") next();
      else if (act === "next-ep") nextEpisode();
      else if (act === "restart") { state.start = 0; load(state.server, true); }
      else if (act === "dismiss") hideNotice();
    });
    FL.util.on(root, "click", "[data-srv]", (e, el) => {
      const s = SERVERS.find((x) => x.id === el.dataset.srv);
      if (s) switchTo(s);
    });
    FL.util.on(root, "submit", "form[data-pl-imdb]", (e, form) => {
      e.preventDefault();
      const tt = (form.querySelector("input").value || "").trim().match(/tt\d{5,}/);
      if (tt && FL.meta.setImdb(state.film, tt[0])) start(state.film, state.ep);
      else FL.ui.toast("That doesn't look like an IMDb id (tt1234567).");
    });
  }

  function frame() { return root.querySelector(".player-frame"); }

  function setTitle() {
    const f = state.film;
    const ep = state.ep;
    const epInfo = ep && state.show ? state.show.episodes.find((x) => x.s === ep.s && x.e === ep.e) : null;
    root.querySelector(".player-title").innerHTML = "<strong>" + esc(f.title) + "</strong><span>" +
      (ep ? esc(epLabel(ep) + (epInfo && epInfo.title && !/^episode \d+$/i.test(epInfo.title) ? " — " + epInfo.title : "")) : esc(FL.catalogue.yearLabel(f)) + (f.genres[0] ? " · " + esc(f.genres[0]) : "")) + "</span>";
    const nextBtn = root.querySelector('[data-pl="next-ep"]');
    nextBtn.hidden = !(ep && nextEp());
  }

  function renderServers() {
    const wrap = root.querySelector(".player-servers");
    const p = params();
    wrap.innerHTML = SERVERS.map((s) => {
      const h = health[s.id];
      const usable = !!(state.ids && s.url(p));
      const status = state.ids && !usable ? "na" : !h ? "wait" : h.ok ? "ok" : "down";
      const label = { na: state.ep ? "Doesn't carry shows" : "Needs an id this title doesn't have", wait: "Checking…", ok: h && h.ms + " ms", down: "Unreachable from your network" }[status];
      const active = state.server && state.server.id === s.id;
      return '<button type="button" role="radio" aria-checked="' + active + '" class="srv srv-' + status + (active ? " is-active" : "") +
        '" data-srv="' + s.id + '" title="' + esc(label) + '"' + (status === "na" ? " disabled" : "") + ">" +
        '<i class="srv-dot" aria-hidden="true"></i><span>' + s.name + "</span>" +
        (status === "ok" ? "<small>" + h.ms + "ms</small>" : status === "down" ? "<small>down</small>" : "") + "</button>";
    }).join("");
    const url = state.server && state.ids ? state.server.url(Object.assign(params(), { start: state.start })) : "";
    const a = root.querySelector('[data-pl="newtab"]');
    if (url) a.href = url; else a.removeAttribute("href");
  }

  function status(html) {
    frame().innerHTML = '<div class="player-status">' + html + "</div>";
  }

  function notice(html, persistent) {
    const n = root.querySelector(".player-notice");
    n.dataset.kind = "";
    n.innerHTML = html;
    n.hidden = false;
    n.dataset.persistent = persistent ? "1" : "";
  }
  function hideNotice() { root.querySelector(".player-notice").hidden = true; }

  /* ---------- lifecycle ---------- */

  /* opts: { onClose, s, e } — s/e for a show episode. */
  function open(film, opts) {
    if (!root) build();
    const o = opts || {};
    onClose = o.onClose || null;
    state.open = true;
    clearInterval(careTimer);
    careTimer = setInterval(careTick, 60e3);
    root.hidden = false;
    document.documentElement.classList.add("has-player");
    hideNotice();
    start(film, film.type === "series" ? { s: +o.s || 1, e: +o.e || 1 } : null);
    setTimeout(() => root.querySelector('[data-pl="close"]').focus(), 30);
  }

  /* Resolve ids, probe servers, then load the best candidate. */
  function start(film, ep) {
    settle();
    const token = ++state.token;
    state.film = film;
    state.ep = ep;
    state.server = null;
    state.ids = null;
    state.confirmed = false;
    state.logged = false;
    state.runtime = 0;
    state.openedAt = Date.now();
    setTitle();
    renderServers();
    status(FL.ui.loader(44, "Loading") + "<p>Finding " + (ep ? "this episode" : "this film") + " on the stream servers…</p>");

    const probes = probeAll();
    const settled = Promise.race([probes, new Promise((r) => setTimeout(r, 1600))]);

    const ids = ep
      ? FL.remote.show(film.imdbId || film.id).then((show) => {
        state.show = show;
        state.runtime = show.runtime || 0;
        return { imdb: film.imdbId || film.id, tmdb: show.tmdb || 0 };
      }).catch(() => ({ imdb: film.imdbId || film.id, tmdb: film.tmdb || 0 }))
      : FL.meta.resolveImdb(film).then((imdb) => {
        if (!imdb) return null;
        const detail = Promise.race([FL.meta.details(film), new Promise((r) => setTimeout(() => r(FL.meta.cached(film)), 3500))]);
        return detail.then((m) => {
          state.runtime = (m && m.runtime) || 0;
          return { imdb, tmdb: (m && m.tmdb) || 0 };
        });
      });

    Promise.all([ids, settled]).then(([resolved]) => {
      if (token !== state.token) return;
      if (!resolved) { needId(film); return; }
      state.ids = resolved;
      setTitle();
      const entry = FL.store.peek(film.id);
      const p = entry && entry.progress;
      const sameEp = !ep || (p && p.s === ep.s && p.e === ep.e);
      state.start = p && sameEp && !p.approx && p.d && p.t > 90 && p.t / p.d < 0.92 ? Math.floor(p.t) : 0;
      const pick = ranked(film, entry).find((s) => s.url(params())) || null;
      if (!pick) { needId(film); return; }
      load(pick);
    });
  }

  function needId(film) {
    renderServers();
    if (!navigator.onLine) {
      status("<h3>You're offline.</h3><p>Reconnect and reopen the player — your library still works offline.</p>");
      return;
    }
    const q = encodeURIComponent(film.title + " " + (film.year || ""));
    status(
      "<h3>We couldn't match this title to an IMDb id.</h3>" +
      "<p>Stream servers look titles up by IMDb id. Paste it from the IMDb page and it will be remembered.</p>" +
      '<form class="inline-form" data-pl-imdb><input class="input" placeholder="tt1234567" aria-label="IMDb id" autocomplete="off">' +
      '<button class="btn btn-primary" type="submit">Use this id</button></form>' +
      '<p><a class="link" target="_blank" rel="noopener noreferrer" href="https://www.imdb.com/find/?s=tt&q=' + q + '">Search IMDb for “' + esc(film.title) + "” ↗</a></p>"
    );
  }

  function load(server, restart) {
    const film = state.film;
    if (state.server && state.server.id !== server.id) settleServer();
    state.server = server;
    state.confirmed = false;
    state.openedAt = Date.now();
    const url = server.url(Object.assign(params(), { start: server.resume ? state.start : 0 }));
    rememberServer(film, server.id);
    renderServers();

    frame().innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.className = "player-iframe";
    iframe.src = url;
    iframe.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;
    // Browser-default referrer: several hosts refuse to play when the embedding page is anonymous.
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.title = film.title + (state.ep ? " " + epLabel(state.ep) : "") + " — " + server.name;
    frame().appendChild(iframe);
    // Big hosts show a blank or spinning frame for 10–20 s; say so, so a working server isn't abandoned.
    const starting = document.createElement("div");
    starting.className = "player-starting";
    starting.innerHTML = FL.ui.loader(16) + "<span>Starting " + esc(server.name) + " — can take up to 20 seconds</span>";
    frame().appendChild(starting);
    const hideStarting = () => starting.classList.add("is-gone");
    iframe.addEventListener("load", () => setTimeout(hideStarting, 7000));
    setTimeout(hideStarting, 22000);

    hideNotice();
    if (state.start && server.resume && !restart) {
      notice('<span>Resuming at <strong>' + fmtClock(state.start) + '</strong></span><button type="button" class="btn btn-sm btn-ghost" data-pl="restart">Start over</button><button type="button" class="icon-btn icon-btn-sm" data-pl="dismiss" aria-label="Dismiss">' + icon("x") + "</button>");
      setTimeout(() => { const n = root.querySelector(".player-notice"); if (n && !n.dataset.persistent) hideNotice(); }, 8000);
    }
    const h = health[server.id];
    if (h && !h.ok) {
      notice("<span>" + server.name + " didn't answer a reachability check from your network. If the frame stays blank, press <kbd>N</kbd>.</span>", true);
    }
    clearTimeout(state.hintTimer);
    state.hintTimer = setTimeout(() => {
      // Clicking into the frame (to press play) moves focus to the iframe — take that as "it's working".
      if (!state.open || state.confirmed || state.server !== server || document.activeElement === iframe) return;
      notice('<span>Not playing? Try the next server — or see where it streams officially.</span><button type="button" class="btn btn-sm" data-pl="next">Next server <kbd>N</kbd></button>' +
        '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener noreferrer" href="' + FL.ui.whereToWatch(film) + '">Where to watch ↗</a>' +
        '<button type="button" class="icon-btn icon-btn-sm" data-pl="dismiss" aria-label="Dismiss">' + icon("x") + "</button>", true);
      const n = root.querySelector(".player-notice");
      n.dataset.kind = "hint";
      setTimeout(() => { if (n.dataset.kind === "hint") hideNotice(); }, 12000);
    }, 25000);
  }

  function switchTo(server) {
    if (!state.ids || !server.url(params())) return;
    if (state.server && state.server.id === server.id) return;
    load(server);
  }

  /* Cycle in the fixed server order, skipping hosts that failed the reachability probe (unless all did). */
  function next() {
    if (!state.ids) return;
    const usable = SERVERS.filter((s) => s.url(params()));
    const reachable = usable.filter((s) => !health[s.id] || health[s.id].ok);
    const order = reachable.length > 1 || (reachable.length === 1 && reachable[0] !== state.server) ? reachable : usable;
    const i = order.indexOf(state.server);
    const nxt = order[(i + 1) % order.length];
    if (nxt && nxt !== state.server) load(nxt);
  }

  function nextEp() {
    if (!state.ep || !state.show) return null;
    const list = state.show.episodes.filter((x) => x.s > 0 && x.aired);
    const i = list.findIndex((x) => x.s === state.ep.s && x.e === state.ep.e);
    return i !== -1 ? list[i + 1] || null : null;
  }

  function nextEpisode() {
    const n = nextEp();
    if (!n) return;
    history.replaceState(null, "", "#/watch/" + encodeURIComponent(state.film.id) + "?s=" + n.s + "&e=" + n.e);
    start(state.film, { s: n.s, e: n.e });
  }

  function fullscreen() {
    const target = root.querySelector(".player-iframe") || root;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (target.requestFullscreen) target.requestFullscreen().catch(() => {});
    else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
  }

  /* ---------- outcomes: learning which server works, and logging what you watched ---------- */

  /* Hosts without player events (2Embed, Vega) count as working once someone has watched for a while. */
  function settleServer() {
    if (!state.server || !state.film || state.confirmed) return;
    const dwell = Date.now() - state.openedAt;
    if (dwell > 5 * 60e3) bumpStat(state.server.id, "ok", state.film);
    else if (dwell < 90e3) bumpStat(state.server.id, "fail", state.film);
  }

  function logWatched() {
    if (state.logged || !state.film) return;
    state.logged = true;
    const film = state.film;
    if (state.ep) {
      const ep = state.ep;
      FL.store.toggleEpisode(film, ep.s, ep.e, true);
      FL.store.clearProgress(film.id);
      const n = nextEp();
      FL.ui.toast("Marked " + epLabel(ep) + " watched", n && state.open
        ? { action: "Next episode", onAction: nextEpisode }
        : { action: "Undo", onAction: () => FL.store.toggleEpisode(film, ep.s, ep.e, false) });
    } else {
      FL.store.logWatch(film);
      FL.store.clearProgress(film.id);
      FL.ui.toast("Logged " + film.title + " for today", {
        action: "Undo",
        onAction: () => {
          const e = FL.store.peek(film.id);
          if (e && e.watches.length) FL.store.removeWatch(film, e.watches.lastIndexOf(FL.util.todayISO()));
        },
      });
    }
  }

  /* When the player closes or moves on: without player events, time spent decides.
     ≥70% of the runtime counts as watched; ≥8 minutes goes into Continue watching. */
  function settle() {
    if (!state.film || !state.server) return;
    settleServer();
    if (state.confirmed || state.logged) return;
    const minutes = (Date.now() - state.openedAt) / 60e3;
    const runtime = state.runtime || (state.ep ? 45 : 120);
    if (minutes >= runtime * 0.7) logWatched();
    else if (minutes >= 8) {
      FL.store.setProgress(state.film, Object.assign({ t: Math.round(minutes * 60), d: runtime * 60, at: Date.now(), srv: state.server.id, approx: true },
        state.ep ? { s: state.ep.s, e: state.ep.e } : {}));
    }
  }

  /* ---------- a gentle nudge on long sessions ---------- */

  const CARE_KEY = "film_ledger_watch_session";
  let careTimer = 0;

  /* Minutes watched this sitting (a 20-minute break starts a new one); the little Iris character checks in at
     1, 2, 3 and 4 hours, and once if it's gone well past midnight. */
  function careTick() {
    if (!state.open || document.hidden) return;
    const s = session.get(CARE_KEY, { min: 0, at: 0, shown: [] });
    if (Date.now() - s.at > 20 * 60e3) { s.min = 0; s.shown = []; }
    s.min += 1;
    s.at = Date.now();
    const due = FL.voice.CARE.find(([m]) => s.min >= m && s.shown.indexOf(m) === -1);
    const h = new Date().getHours();
    if (due) { s.shown.push(due[0]); FL.ui.nudge(due[1], due[2]); }
    else if (h < 4 && s.min >= 40 && s.shown.indexOf("late") === -1) { s.shown.push("late"); FL.ui.nudge("It's getting late — this one could finish tomorrow.", "🌙"); }
    session.set(CARE_KEY, s);
  }

  function close() {
    if (!state.open) return;
    state.open = false; // before settle(): a closing player offers Undo, not "Next episode"
    clearInterval(careTimer);
    settle();
    state.token++;
    state.film = null;
    state.server = null;
    clearTimeout(state.hintTimer);
    frame().innerHTML = ""; // unloading the iframe stops playback
    root.hidden = true;
    document.documentElement.classList.remove("has-player");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const cb = onClose;
    onClose = null;
    if (cb) cb();
  }

  /* ---------- player events (VidLink / Videasy post progress to the parent) ---------- */

  function parse(raw) {
    let d = raw;
    if (typeof d === "string") {
      if (d.charAt(0) !== "{") return null;
      try { d = JSON.parse(d); } catch (e) { return null; }
    }
    if (!d || typeof d !== "object") return null;
    if (d.type === "MEDIA_DATA" && d.data && typeof d.data === "object") {
      const item = Object.values(d.data).find((x) => x && x.progress);
      if (!item) return null;
      return { event: "progress", t: +item.progress.watched || 0, d: +item.progress.duration || 0 };
    }
    const body = d.data && typeof d.data === "object" ? d.data : d;
    const event = String(body.event || d.event || d.type || "").toLowerCase();
    const t = +(body.currentTime != null ? body.currentTime : body.timestamp != null ? body.timestamp : body.time) || 0;
    const dur = +body.duration || 0;
    if (!event && !t) return null;
    return { event, t: isFinite(t) ? t : 0, d: isFinite(dur) ? dur : 0 };
  }

  window.addEventListener("message", (ev) => {
    if (!state.open || !state.server || !ORIGINS.has(ev.origin) || ev.origin !== state.server.origin) return;
    const info = parse(ev.data);
    if (!info) return;
    // Hosts post messages even on their own "not found" screens; only a real duration means media loaded.
    if (!state.confirmed && info.d > 0) {
      state.confirmed = true;
      const st = root.querySelector(".player-starting");
      if (st) st.classList.add("is-gone");
      bumpStat(state.server.id, "ok", state.film);
      const n = root.querySelector(".player-notice");
      if (n && n.dataset.persistent) hideNotice();
    }
    const now = Date.now();
    if (info.t >= 30 && info.d > 0 && !state.logged && (now - state.lastSave > 15000 || /pause|ended/.test(info.event))) {
      state.lastSave = now;
      FL.store.setProgress(state.film, Object.assign({ t: Math.floor(info.t), d: Math.floor(info.d), at: now, srv: state.server.id },
        state.ep ? { s: state.ep.s, e: state.ep.e } : {}));
    }
    const done = /ended|complete/.test(info.event) || (info.d > 300 && info.t / info.d >= 0.92);
    if (done) logWatched();
  });

  /* ---------- keyboard (only reaches us when focus is outside the iframe) ---------- */

  document.addEventListener("keydown", (e) => {
    if (!state.open || FL.util.isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape" && !document.fullscreenElement) { e.preventDefault(); close(); }
    else if (e.key === "n" || e.key === "N") { e.preventDefault(); next(); }
    else if (e.key === "f" || e.key === "F") { e.preventDefault(); fullscreen(); }
    else if (/^[1-9]$/.test(e.key)) {
      const s = SERVERS[+e.key - 1];
      if (s) { e.preventDefault(); switchTo(s); }
    }
  }, true);

  window.addEventListener("pagehide", () => { if (state.open) settle(); });

  /* ---------- trailers ---------- */

  function trailer(film, ytId) {
    const src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(ytId) + "?autoplay=1&rel=0&modestbranding=1&playsinline=1";
    FL.ui.modal(
      '<div class="trailer"><iframe src="' + src + '" title="' + esc(film.title) + ' trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>',
      { cls: "modal-trailer", label: film.title + " trailer" }
    );
  }

  FL.player = {
    SERVERS, open, close, trailer, probeAll,
    isOpen: () => state.open,
    current: () => state.film,
  };
})(window.FL = window.FL || {});
