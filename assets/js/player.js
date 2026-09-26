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
      id: "vidlink", name: "VidLink", origin: "https://vidlink.pro", resume: true, signals: true,
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
      id: "videasy", name: "Videasy", origin: "https://player.videasy.net", resume: true, signals: true,
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
    {
      // Vega's "Super Player": heads the Vega group in the bar, ahead of the per-title links found below.
      id: "vega", name: "Vega", short: "Super", label: "Super Player", origin: "https://slast430did.com",
      url: ({ imdb, tv }) => (imdb && !tv ? "https://slast430did.com/play/" + imdb : null),
    },
  ];

  /* ---------- Vega's own players ---------- */

  /* Vega (vegamovito.run) lists each title on hosts of its own — links per title, not an id pattern — so Iris's
     function (api/vega.js) looks them up when the player opens and they join the list for that title or episode.
     Local copies of Iris use the deployed function. */
  const VEGA_API = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? "https://film-ledger-mocha.vercel.app/api/vega" : "/api/vega";
  const VEGA_KEY = "film_ledger_vega";
  const VEGA_TTL = 6 * 3600e3;
  const HOST_NAMES = { multicloudlinks: "MultiCloud", mxdrop: "MixDrop", rpmvip: "RPM", strp2p: "StreamP2P", upns: "UPNS", vsembed: "VSEmbed", bysesukior: "Byse" };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const vegaInflight = new Map();

  /* The IMDb id only double-checks Vega's match, so it isn't worth a long wait. */
  function imdbFor(film, ep) {
    const tt = (x) => (/^tt\d+$/.test(x || "") ? x : "");
    const known = tt(film.imdbId) || tt(film.id);
    if (known || ep) return Promise.resolve(known);
    return Promise.race([FL.meta.resolveImdb(film).catch(() => ""), wait(2500)]).then(tt);
  }

  function vegaLinks(film, ep) {
    const key = film.id + (ep ? "|" + ep.s + "|" + ep.e : "");
    const hit = session.get(VEGA_KEY, {})[key];
    if (hit && Date.now() - hit.at < VEGA_TTL) return Promise.resolve(hit.list);
    if (vegaInflight.has(key)) return vegaInflight.get(key);
    const p = imdbFor(film, ep).then((imdb) => {
      const q = new URLSearchParams({ title: film.title });
      if (film.year && !ep) q.set("year", film.year);
      if (imdb) q.set("imdb", imdb);
      if (ep) { q.set("s", ep.s); q.set("e", ep.e); }
      return FL.util.fetchJSON(VEGA_API + "?" + q, { timeout: 12000 });
    }).then((d) => {
      const list = (d && Array.isArray(d.servers) ? d.servers : []).filter((x) => x && /^https:\/\//.test(x.url));
      const cache = session.get(VEGA_KEY, {});
      cache[key] = { at: Date.now(), list };
      Object.keys(cache).sort((a, b) => cache[b].at - cache[a].at).slice(60).forEach((k) => delete cache[k]);
      session.set(VEGA_KEY, cache);
      return list;
    }).catch(() => []).finally(() => vegaInflight.delete(key));
    vegaInflight.set(key, p);
    return p;
  }

  /* Named and remembered by host, so "MixDrop works for Hindi" carries over from one title to the next. */
  function vegaServer(link, taken) {
    let host;
    try { host = new URL(link.url).hostname; } catch (e) { return null; }
    const key = host.split(".").slice(-2)[0].toLowerCase();
    let base = HOST_NAMES[key] || key.charAt(0).toUpperCase() + key.slice(1);
    if (SERVERS.some((s) => s.name.toLowerCase() === base.toLowerCase())) base += "." + host.split(".").pop();
    let id = "vg-" + key;
    let name = base;
    for (let n = 2; taken[id]; n++) { id = "vg-" + key + "-" + n; name = base + " " + n; }
    taken[id] = true;
    return { id, name, label: link.label, origin: "https://" + host, url: () => link.url };
  }

  const allServers = () => (state.extra.length ? SERVERS.concat(state.extra) : SERVERS);
  const nameOf = (s) => (s.short ? s.name + " " + s.short : s.name); // "Vega Super" in messages, "Super" on its button

  /* Film and show pages call this while you read: server checks, Vega's links for this title (or the episode you're
     up to) and an early connection to the likeliest server, so Play starts without waiting on any of it. */
  function prefetch(film, ep) {
    probeAll();
    if (!film) return;
    vegaLinks(film, ep || null).then((links) => {
      const taken = {};
      links.map((l) => vegaServer(l, taken)).filter(Boolean).forEach((s) => probe(s));
    });
    const last = lastServerFor(film);
    const server = SERVERS.find((s) => s.id === last) || SERVERS[0];
    preconnect(server.origin);
  }

  const warmed = new Set();
  function preconnect(origin) {
    if (warmed.has(origin)) return;
    warmed.add(origin);
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    document.head.appendChild(link);
  }

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
    return allServers().map((s, i) => {
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
    open: false, film: null, ids: null, ep: null, show: null, server: null, extra: [], start: 0, confirmed: false, runtime: 0,
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
      const s = allServers().find((x) => x.id === el.dataset.srv);
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
      (ep ? esc(epLabel(ep) + (epInfo && epInfo.title && !/^episode \d+$/i.test(epInfo.title) ? " · " + epInfo.title : "")) : esc(FL.catalogue.yearLabel(f)) + (f.genres[0] ? " · " + esc(f.genres[0]) : "")) + "</span>";
    const nextBtn = root.querySelector('[data-pl="next-ep"]');
    nextBtn.hidden = !(ep && nextEp());
  }

  function renderServers() {
    const wrap = root.querySelector(".player-servers");
    const p = params();
    wrap.innerHTML = allServers().map((s) => {
      const h = health[s.id];
      const usable = !!(state.ids && s.url(p));
      const status = state.ids && !usable ? "na" : !h ? "wait" : h.ok ? "ok" : "down";
      const label = (s.label ? "Vega · " + s.label + " · " : "") +
        { na: state.ep ? "Doesn't carry shows" : "Needs an id this title doesn't have", wait: "Checking…", ok: h && h.ms + " ms", down: "Unreachable from your network" }[status];
      const active = state.server && state.server.id === s.id;
      return (s.id === "vega" ? '<span class="label srv-sep">Vega</span>' : "") +
        '<button type="button" role="radio" aria-checked="' + active + '" class="srv srv-' + status + (active ? " is-active" : "") +
        '" data-srv="' + s.id + '" title="' + esc(label) + '"' + (status === "na" ? " disabled" : "") + ">" +
        '<i class="srv-dot" aria-hidden="true"></i><span>' + esc(s.short || s.name) + "</span>" +
        (status === "ok" ? "<small>" + h.ms + "ms</small>" : status === "down" ? "<small>down</small>" : "") + "</button>";
    }).join("");
    // The row scrolls on its own once Vega's links join; keep the playing server in sight.
    const act = wrap.querySelector(".is-active");
    if (act) {
      const a = act.getBoundingClientRect();
      const w = wrap.getBoundingClientRect();
      if (a.left < w.left || a.right > w.right) wrap.scrollLeft += a.left - w.left - 8;
    }
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
    state.autoTried = {}; // each title or episode gets its own automatic server hop
    settle();
    const token = ++state.token;
    state.film = film;
    state.ep = ep;
    state.server = null;
    state.ids = null;
    state.extra = [];
    state.confirmed = false;
    state.logged = false;
    state.runtime = 0;
    state.openedAt = Date.now();
    root.querySelector(".player-servers").scrollLeft = 0; // a new title starts at the first server
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

    const vega = vegaLinks(film, ep)
      .then((links) => {
        if (token !== state.token) return;
        const taken = {};
        state.extra = links.map((l) => vegaServer(l, taken)).filter(Boolean);
        if (!state.extra.length) return;
        renderServers();
        // Probed before the first pick so they're ranked on the same terms as the fixed servers.
        return Promise.race([Promise.all(state.extra.map((s) => probe(s))), wait(1500)]).then(() => {
          // Came in after every fixed server turned out unable to play it: start on Vega.
          if (token === state.token && state.ids && !state.server) begin(state.ids);
        });
      });
    const entry = FL.store.peek(film.id);
    const lastVega = /^vg-/.test(lastServerFor(film)) || /^vg-/.test((entry && entry.progress && entry.progress.srv) || "");
    // Join the first pick if they're quick — or worth a longer wait when this title or language last played on Vega.
    const vegaSoon = Promise.race([vega, wait(lastVega ? 8000 : 1500)]);

    function begin(resolved) {
      state.ids = resolved;
      setTitle();
      const entry = FL.store.peek(film.id);
      const p = entry && entry.progress;
      const sameEp = !ep || (p && p.s === ep.s && p.e === ep.e);
      state.start = p && sameEp && !p.approx && p.d && p.t > 90 && p.t / p.d < 0.92 ? Math.floor(p.t) : 0;
      const pick = ranked(film, entry).find((s) => s.url(params())) || null;
      if (!pick) { needId(film); return; }
      load(pick);
    }

    Promise.all([ids, settled, vegaSoon]).then(([resolved]) => {
      if (token !== state.token) return;
      if (resolved) { begin(resolved); return; }
      // No IMDb id means the fixed servers can't look it up — but Vega finds titles by name.
      status(FL.ui.loader(44, "Loading") + "<p>Looking for " + (ep ? "this episode" : "this film") + " on Vega…</p>");
      vega.then(() => {
        if (token !== state.token) return;
        if (state.extra.length) begin({});
        else needId(film);
      });
    });
  }

  function needId(film) {
    renderServers();
    if (!navigator.onLine) {
      status("<h3>You're offline.</h3><p>Reconnect and reopen the player. Your library still works offline.</p>");
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
    // Remember a server only once it has proved itself: it reported playback, or you stayed on it for 5 minutes.
    if (!server.signals) setTimeout(() => { if (state.open && state.server === server) rememberServer(film, server.id); }, 5 * 60e3);
    renderServers();

    frame().innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.className = "player-iframe";
    iframe.src = url;
    iframe.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;
    // Browser-default referrer: several hosts refuse to play when the embedding page is anonymous.
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.title = film.title + (state.ep ? " " + epLabel(state.ep) : "") + " · " + nameOf(server);
    frame().appendChild(iframe);
    // Big hosts show a blank or spinning frame for 10–20 s; say so, so a working server isn't abandoned.
    const starting = document.createElement("div");
    starting.className = "player-starting";
    starting.innerHTML = FL.ui.loader(16) + "<span>Starting " + esc(nameOf(server)) + ", can take up to 20 seconds</span>";
    frame().appendChild(starting);
    const hideStarting = () => starting.classList.add("is-gone");
    iframe.addEventListener("load", () => setTimeout(hideStarting, 7000));
    setTimeout(hideStarting, 22000);

    // VidLink and Videasy report player events as soon as a title loads (even before you press play). If the host is
    // talking to us but never mentions media, it's showing its "couldn't find this" page — move on by ourselves.
    state.pinged = false;
    state.mediaSeen = false;
    if (server.signals) {
      iframe.addEventListener("load", () => setTimeout(() => {
        if (!state.open || state.server !== server || state.confirmed || state.mediaSeen || !state.pinged) return;
        notOnServer(server);
      }, 11000));
    }

    hideNotice();
    if (state.start && server.resume && !restart) {
      notice('<span>Resuming at <strong>' + fmtClock(state.start) + '</strong></span><button type="button" class="btn btn-sm btn-ghost" data-pl="restart">Start over</button><button type="button" class="icon-btn icon-btn-sm" data-pl="dismiss" aria-label="Dismiss">' + icon("x") + "</button>");
      setTimeout(() => { const n = root.querySelector(".player-notice"); if (n && !n.dataset.persistent) hideNotice(); }, 8000);
    }
    const h = health[server.id];
    if (h && !h.ok) {
      notice("<span>" + esc(nameOf(server)) + " didn't answer a reachability check from your network. If the frame stays blank, press <kbd>N</kbd>.</span>", true);
    }
    clearTimeout(state.hintTimer);
    state.hintTimer = setTimeout(() => {
      // Clicking into the frame (to press play) moves focus to the iframe — take that as "it's working".
      if (!state.open || state.confirmed || state.server !== server || document.activeElement === iframe) return;
      notice('<span>Not playing? Try the next server, or see where it streams officially.</span><button type="button" class="btn btn-sm" data-pl="next">Next server <kbd>N</kbd></button>' +
        '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener noreferrer" href="' + FL.ui.whereToWatch(film) + '">Where to watch ↗</a>' +
        '<button type="button" class="icon-btn icon-btn-sm" data-pl="dismiss" aria-label="Dismiss">' + icon("x") + "</button>", true);
      const n = root.querySelector(".player-notice");
      n.dataset.kind = "hint";
      setTimeout(() => { if (n.dataset.kind === "hint") hideNotice(); }, 12000);
    }, 25000);
  }

  /* This server doesn't have the title: count it, and move on by ourselves (once per server per title). */
  function notOnServer(server) {
    state.autoTried = state.autoTried || {};
    if (state.autoTried[server.id]) return;
    state.autoTried[server.id] = true;
    bumpStat(server.id, "fail", state.film);
    const before = state.server;
    next();
    if (state.server !== before) FL.ui.toast("Not on " + nameOf(server) + ". Trying " + nameOf(state.server) + ".");
  }

  function switchTo(server) {
    if (!state.ids || !server.url(params())) return;
    if (state.server && state.server.id === server.id) return;
    load(server);
  }

  /* Cycle in the fixed server order, skipping hosts that failed the reachability probe (unless all did). */
  function next() {
    if (!state.ids) return;
    const usable = allServers().filter((s) => s.url(params()));
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
    else if (h < 4 && s.min >= 40 && s.shown.indexOf("late") === -1) { s.shown.push("late"); FL.ui.nudge("It's getting late. This one could finish tomorrow.", "🌙"); }
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
    if (!state.open || !state.server || ev.origin !== state.server.origin) return;
    state.pinged = true;
    const info = parse(ev.data);
    if (!info) return;
    // Vega's Super Player posts {event: "error"} on its "Video Not Found" page: that's a miss, not playback.
    if (/^(error|notfound|not_found)$/.test(info.event)) { if (!state.confirmed) notOnServer(state.server); return; }
    if (info.event && info.event !== "sr") state.mediaSeen = true;
    // Hosts post messages even on their own "not found" screens; only a real duration means media loaded.
    if (!state.confirmed && info.d > 0) {
      state.confirmed = true;
      rememberServer(state.film, state.server.id);
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
      const s = allServers()[+e.key - 1];
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
    SERVERS, open, close, trailer, probeAll, prefetch,
    isOpen: () => state.open,
    current: () => state.film,
  };
})(window.FL = window.FL || {});
