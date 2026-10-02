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
        if (!id || (tv && !tmdb) || (tv && e > 100)) return null; // e > 100: a bonus episode only Vega has
        const q = "?primaryColor=" + hex() + "&secondaryColor=3A3A40&iconColor=F5F5F2&title=false&poster=true&autoplay=false" + (start ? "&startAt=" + start : "");
        return tv ? "https://vidlink.pro/tv/" + tmdb + "/" + s + "/" + e + q + "&nextbutton=false" : "https://vidlink.pro/movie/" + id + q;
      },
    },
    {
      // Refuses to play in a sandboxed frame ("Sandbox not allowed" once you press play), so it runs unshielded.
      id: "2embed", name: "2Embed", origin: "https://www.2embed.cc",
      url: ({ imdb, tmdb, tv, s, e }) => {
        const id = imdb || tmdb;
        if (!id || (tv && e > 100)) return null;
        return tv ? "https://www.2embed.cc/embedtv/" + id + "&s=" + s + "&e=" + e : "https://www.2embed.cc/embed/" + id;
      },
    },
    {
      // player.videasy.net now redirects here; its progress messages come from this origin, so it has to be the .to one.
      id: "videasy", name: "Videasy", origin: "https://player.videasy.to", resume: true, signals: true,
      url: ({ imdb, tmdb, start, tv, s, e }) => {
        const id = tmdb || imdb;
        if (!id || (tv && !tmdb) || (tv && e > 100)) return null;
        const q = "?color=" + hex() + (start ? "&progress=" + start : "");
        return tv ? "https://player.videasy.to/tv/" + tmdb + "/" + s + "/" + e + q : "https://player.videasy.to/movie/" + id + q;
      },
    },
    {
      id: "vidsrc", name: "VidSrc", origin: "https://vidsrc.me",
      url: ({ imdb, tmdb, tv, s, e }) => {
        const key = imdb ? "imdb=" + imdb : tmdb ? "tmdb=" + tmdb : "";
        if (!key || (tv && e > 100)) return null;
        return tv ? "https://vidsrc.me/embed/tv?" + key + "&season=" + s + "&episode=" + e : "https://vidsrc.me/embed/movie?" + key;
      },
    },
    {
      // Vega's "Super Player": heads the Vega group in the bar, ahead of the per-title links found below.
      id: "vega", name: "Vega", short: "Super", label: "Super Player", origin: "https://slast430did.com", sandbox: true,
      url: ({ imdb, tv }) => (imdb && !tv ? "https://slast430did.com/play/" + imdb : null),
    },
  ];

  /* Sakura's anime: hosts that take an AniList id and an episode, sub or dub, plus Zoro TV's own player for the
     episode (found by api/anime.js). None of them plays in a sandboxed frame, so all run behind the "Leave site?" guard. */
  const ANIME = [
    {
      // Posts its playback time to the page (resume, Up Next and auto-ticking work), and has both sub and dub.
      id: "megaplay", name: "MegaPlay", origin: "https://megaplay.buzz", signals: true,
      url: ({ anilist, mal, e, dub }) => (anilist || mal ? "https://megaplay.buzz/stream/" + (anilist ? "ani/" + anilist : "mal/" + mal) + "/" + e + "/" + (dub ? "dub" : "sub") : null),
    },
    {
      id: "zoro", name: "Zoro", origin: "https://gogoanime.com.by",
      url: ({ zoro, dub }) => (zoro && zoro[dub ? "dub" : "sub"]) || null,
    },
    {
      id: "videasy-anime", name: "Videasy", origin: "https://player.videasy.to", resume: true, signals: true,
      url: ({ anilist, e, dub, start }) => (anilist ? "https://player.videasy.to/anime/" + anilist + "/" + e + "?color=" + hex() + (dub ? "&dub=true" : "") + (start ? "&progress=" + start : "") : null),
    },
  ];
  const isAnime = (film) => !!(film && film.type === "anime");
  const audio = () => ((FL.store.prefs().anime || {}).audio === "dub" ? "dub" : "sub");

  /* ---------- Vega's own players ---------- */

  /* Vega (vegamovito.run) lists each title on hosts of its own — links per title, not an id pattern — so Iris's
     function (api/vega.js) looks them up when the player opens and they join the list for that title or episode.
     Local copies of Iris (localhost, *.localhost) use the deployed function: Vega's Cloudflare turns away the rest. */
  const VEGA_API = /(^|\.)localhost$|^127\.0\.0\.1$|^\[::1\]$/.test(location.hostname) ? "https://film-ledger-mocha.vercel.app/api/vega" : "/api/vega";
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

  /* { list: players, dl: download pages } for a title or episode, cached for the visit. */
  function vegaInfo(film, ep) {
    const key = film.id + (ep ? "|" + ep.s + "|" + ep.e : "");
    const hit = session.get(VEGA_KEY, {})[key];
    if (hit && hit.dl && Date.now() - hit.at < VEGA_TTL) return Promise.resolve(hit);
    if (vegaInflight.has(key)) return vegaInflight.get(key);
    const p = imdbFor(film, ep).then((imdb) => {
      const q = new URLSearchParams({ title: film.title });
      if (film.year && !ep) q.set("year", film.year);
      if (imdb) q.set("imdb", imdb);
      if (ep) { q.set("s", ep.s); q.set("e", ep.e); }
      return FL.util.fetchJSON(VEGA_API + "?" + q, { timeout: 12000 });
    }).then((d) => {
      const clean = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && /^https:\/\//.test(x.url)).slice(0, 12);
      const info = { at: Date.now(), list: clean(d && d.servers), dl: clean(d && d.downloads) };
      const cache = session.get(VEGA_KEY, {});
      cache[key] = info;
      Object.keys(cache).sort((a, b) => cache[b].at - cache[a].at).slice(60).forEach((k) => delete cache[k]);
      session.set(VEGA_KEY, cache);
      return info;
    }).catch(() => ({ list: [], dl: [] })).finally(() => vegaInflight.delete(key));
    vegaInflight.set(key, p);
    return p;
  }
  const vegaLinks = (film, ep) => vegaInfo(film, ep).then((d) => d.list);
  /* A season as Vega has it: episode numbers, bonus episodes and every download page (one lookup per season). */
  const seasonCache = new Map();
  function season(show, s) {
    const key = show.id + "|" + s;
    if (!seasonCache.has(key)) {
      const q = new URLSearchParams({ title: show.title, s, season: 1 });
      seasonCache.set(key, FL.util.fetchJSON(VEGA_API + "?" + q, { timeout: 15000 })
        .then((d) => ({ episodes: (d && d.episodes) || [], bonus: (d && d.bonus) || [], downloads: ((d && d.downloads) || []).filter((x) => x && /^https:\/\//.test(x.url)) }))
        .catch(() => { seasonCache.delete(key); return null; }));
    }
    return seasonCache.get(key);
  }

  /* Download pages for a title, from the same lookup (Vega's own download buttons). */
  const downloads = (film, ep) => vegaInfo(film, ep || null).then((d) => d.dl || []);

  /* Vega's titles for a search (films only), for the search box. Cached per query for this visit. */
  const vegaFound = new Map();
  function vegaSearch(q) {
    const key = String(q || "").trim().toLowerCase();
    if (key.length < 3) return Promise.resolve([]);
    if (!vegaFound.has(key)) {
      vegaFound.set(key, FL.util.fetchJSON(VEGA_API + "?q=" + encodeURIComponent(key), { timeout: 10000 })
        .then((d) => (d && Array.isArray(d.results) ? d.results : []))
        .catch(() => { vegaFound.delete(key); return []; }));
    }
    return vegaFound.get(key);
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
    // Of Vega's hosts only HubStream plays in the shield's sandbox (MixDrop, VSEmbed, Minochinos, MoreNcius refuse).
    return { id, name, label: link.label, origin: "https://" + host, url: () => link.url, sandbox: /(^|\.)hubstream\.art$/.test(host) };
  }

  const fixed = () => (isAnime(state.film) ? ANIME : SERVERS);
  const allServers = () => (state.extra.length ? fixed().concat(state.extra) : fixed());
  const nameOf = (s) => (s.short ? s.name + " " + s.short : s.name); // "Vega Super" in messages, "Super" on its button

  /* Film and show pages call this while you read: server checks, Vega's links for this title (or the episode you're
     up to) and an early connection to the likeliest server, so Play starts without waiting on any of it. */
  function prefetch(film, ep) {
    if (isAnime(film)) {
      ANIME.forEach((s) => probe(s));
      preconnect(ANIME[0].origin);
      if (ep && FL.anime) FL.anime.zoroServers(film, ep.e);
      return;
    }
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

  const probeAll = (force) => Promise.all(fixed().map((s) => probe(s, force)));

  /* Availability differs by catalogue (a host strong on Hollywood may lack Hindi titles), so outcomes are
     remembered per language bucket as well as globally. */
  function serverStats() { return FL.store.prefs().servers || {}; }
  const bucketOf = (film) => (film ? (film.type === "series" ? "tv" : film.type === "anime" ? "anime" : film.lang) : "");

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
      // Vega is built for Hindi and Indian films (its Super Player is what Vega's own site plays Pushpa on); until
      // your own history says otherwise, its servers lead for them.
      if (film && (film.lang === "Hindi" || film.lang === "OtherIndian") && (s.id === "vega" || /^vg-/.test(s.id))) score += 22;
      // An episode out on Vega before the usual sources list it (India's Got Latent's newest): Vega's hosts first.
      if (state.ep && state.show && /^vg-/.test(s.id) &&
        !state.show.episodes.some((x) => x.s === state.ep.s && x.e === state.ep.e && x.aired)) score += 60;
      // MixDrop fronts its player with adult ads: last resort.
      if (/^vg-mxdrop/.test(s.id)) score -= 40;
      // Indian series and shows: 2Embed and Videasy carry most of them (Bigg Boss, KBC, Panchayat, Kota Factory…);
      // VidLink often has the wrong show or none, so it waits.
      if (state.ep && film && (film.lang === "Hindi" || film.lang === "OtherIndian" || /India/.test(film.country || ""))) {
        score += { "2embed": 18, videasy: 10, vidlink: -25 }[s.id] || 0;
      }
      return [score, s];
    }).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  }

  /* ---------- state & DOM ---------- */

  const state = {
    open: false, film: null, ids: null, ep: null, show: null, server: null, extra: [], tried: new Set(), start: 0, confirmed: false, runtime: 0,
    lastSave: 0, logged: false, hintTimer: 0, openedAt: 0, token: 0, dl: [],
  };
  let root = null;
  let onClose = null;

  function icon(name) { return FL.ui.icon(name); }
  const params = () => Object.assign({}, state.ids, state.ep ? { tv: true, s: state.ep.s, e: state.ep.e } : {}, isAnime(state.film) ? { dub: audio() === "dub", zoro: state.zoro || null } : {});
  // Vega's bonus n is episode 100 + n; anime count episodes without seasons.
  const epLabel = (ep) => (isAnime(state.film) ? "Episode " + ep.e : "S" + ep.s + (ep.e > 100 ? " · Bonus " + (ep.e - 100) : " · E" + ep.e));
  const watchHash = (film, ep) => (isAnime(film) ? "#/anime/watch/" + encodeURIComponent(film.id) + "?e=" + ep.e : "#/watch/" + encodeURIComponent(film.id) + "?s=" + ep.s + "&e=" + ep.e);

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
          '<button type="button" class="btn btn-ghost btn-sm" data-pl="download" aria-expanded="false" hidden>' + icon("download") + "<span>Download</span></button>" +
          '<a class="btn btn-ghost btn-sm" data-pl="newtab" target="_blank" rel="noopener noreferrer">' + icon("external") + "<span>New tab</span></a>" +
          '<button type="button" class="icon-btn" data-pl="fullscreen" aria-label="Fullscreen (F)">' + icon("expand") + "</button>" +
        "</div>" +
      "</header>" +
      '<div class="player-stage"><div class="player-frame"></div></div>' +
      '<div class="player-hot player-hot-top" aria-hidden="true"></div><div class="player-hot player-hot-bottom" aria-hidden="true"></div>' +
      '<div class="player-notice" hidden></div>' +
      '<div class="player-dl" data-dl hidden></div>' +
      '<footer class="player-bar">' +
        '<div class="player-audio" hidden>' + FL.ui.segmented("audio", [["sub", "Sub"], ["dub", "Dub"]], "sub") + "</div>" +
        '<span class="label">Server</span>' +
        '<div class="player-servers" role="radiogroup" aria-label="Stream server"></div>' +
        '<button type="button" class="btn btn-sm" data-pl="next">Next server <kbd>N</kbd></button>' +
      "</footer>";
    document.body.appendChild(root);
    // In fullscreen, moving over Iris's own parts (the bars, the edges) brings the bars back.
    root.addEventListener("pointermove", () => { if (root.classList.contains("is-fs")) wake(); });
    // Touch: taps on the video go to the host's player, so the edge strips (or anywhere outside the frame) bring the bars back.
    root.addEventListener("pointerdown", () => { if (root.classList.contains("is-fs")) wake(); });

    FL.util.on(root, "click", "[data-pl]", (e, el) => {
      const act = el.dataset.pl;
      if (act === "close") close();
      else if (act === "fullscreen") fullscreen();
      else if (act === "next") next();
      else if (act === "next-ep") nextEpisode();
      else if (act === "restart") { state.start = 0; load(state.server, true); }
      else if (act === "dismiss") hideNotice();
      else if (act === "download") toggleDownloads();
      else if (act === "upnext-go") { cancelUpNext(); nextEpisode(); }
      else if (act === "upnext-cancel") cancelUpNext();
    });
    // The download list closes when you pick a page or click anywhere else in the player.
    root.addEventListener("click", (e) => {
      const panel = root.querySelector("[data-dl]");
      if (panel.hidden || e.target.closest('[data-pl="download"]')) return;
      if (e.target.closest(".player-dl-link") || !e.target.closest("[data-dl]")) toggleDownloads(false);
    });
    // Anime: subtitles or dubbed audio, remembered; the playing server switches over if it has the other one.
    FL.util.on(root, "click", "[data-seg=audio]", (e, el) => {
      const v = el.dataset.value === "dub" ? "dub" : "sub";
      if (v === audio()) return;
      FL.store.patchPref("anime", { audio: v });
      paintAudio();
      if (!state.ids) return;
      if (state.server && state.server.url(params())) load(state.server);
      else next();
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

  function paintAudio() {
    const box = root.querySelector(".player-audio");
    box.hidden = !isAnime(state.film);
    box.querySelectorAll(".seg-btn").forEach((b) => { const on = b.dataset.value === audio(); b.classList.toggle("is-on", on); b.setAttribute("aria-checked", String(on)); });
  }

  /* Download: the title's download pages from Vega, when it has any (the button stays hidden otherwise). */
  function paintDownloads() {
    const btn = root.querySelector('[data-pl="download"]');
    const panel = root.querySelector("[data-dl]");
    const list = state.dl || [];
    btn.hidden = !list.length;
    if (!list.length) toggleDownloads(false);
    panel.innerHTML = '<p class="label">Download</p>' + list.map((d) =>
      '<a class="player-dl-link" href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer nofollow">' + icon("download") +
      "<span>" + esc(d.label) + "</span>" + icon("external") + "</a>").join("") +
      '<p class="player-dl-note">Opens the download page in a new tab. It may ask you to confirm you’re human before the file starts.</p>';
  }
  function toggleDownloads(force) {
    const panel = root.querySelector("[data-dl]");
    const open = force != null ? !!force : panel.hidden && !!(state.dl && state.dl.length);
    panel.hidden = !open;
    root.querySelector('[data-pl="download"]').setAttribute("aria-expanded", String(open));
  }

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
      const na = isAnime(state.film) ? (p.dub ? "No dub here for this episode" : "Doesn't have this episode") : state.ep ? "Doesn't carry shows" : "Needs an id this title doesn't have";
      const label = (s.label ? "Vega · " + s.label + " · " : "") +
        { na, wait: "Checking…", ok: h && h.ms + " ms", down: "Unreachable from your network" }[status];
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
    root.hidden = false;
    document.documentElement.classList.add("has-player");
    hideNotice();
    start(film, film.type === "series" || isAnime(film) ? { s: +o.s || 1, e: +o.e || 1 } : null);
    setTimeout(() => root.querySelector('[data-pl="close"]').focus(), 30);
  }

  /* Resolve ids, probe servers, then load the best candidate. */
  function start(film, ep) {
    cancelUpNext();
    state.autoTried = {}; // each title or episode gets its own automatic server hop
    state.tried = new Set(); // servers loaded for this title or episode, so "Next" moves on to fresh ones
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
    state.zoro = undefined; // anime: Zoro TV's { sub, dub } once looked up, false when it hasn't this episode
    root.querySelector(".player-servers").scrollLeft = 0; // a new title starts at the first server
    if (isAnime(film)) state.show = { episodes: film._eps || FL.anime.episodes(film, {}, []) };
    paintAudio();
    setTitle();
    renderServers();
    status(FL.ui.loader(44, "Loading") + "<p>Finding " + (ep ? "this episode" : "this film") + " on the stream servers…</p>");

    const probes = probeAll();
    const settled = Promise.race([probes, new Promise((r) => setTimeout(r, 1600))]);

    const ids = isAnime(film)
      ? Promise.resolve({ anilist: film.anilist || 0, mal: film.mal || 0 }).then((x) => { state.runtime = film.duration || 24; return x; })
      : ep
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

    state.dl = [];
    paintDownloads();
    if (!isAnime(film)) downloads(film, ep).then((list) => { if (token === state.token) { state.dl = list; paintDownloads(); } });

    // Anime: Zoro TV's player for this episode joins when found (the only server for a title AniList doesn't have).
    const vega = isAnime(film)
      ? FL.anime.zoroServers(film, ep.e).then((z) => {
        if (token !== state.token) return;
        state.zoro = z || false;
        renderServers();
        if (state.ids && !state.server) begin(state.ids);
      })
      : vegaLinks(film, ep)
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
      if (!pick && isAnime(film) && state.zoro === undefined) {
        status(FL.ui.loader(44, "Loading") + "<p>Looking for this episode on Zoro TV…</p>");
        return; // Zoro TV's answer calls begin() again
      }
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
    if (isAnime(film)) {
      status("<h3>This episode isn’t on the servers yet.</h3><p>New episodes usually arrive within a few hours of airing." +
        (audio() === "dub" ? " Dubs come later: try <strong>Sub</strong> below." : "") + "</p>");
      return;
    }
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
    state.tried.add(server.id);
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
    // The shield. Hosts that play in a sandboxed frame (Vega's Super Player) get one: they can play but can't
    // open ad tabs or send this page elsewhere. Most hosts refuse to play sandboxed ("Please disable sandbox"), so they
    // run as they are, and any attempt to navigate Iris away gets the browser's "Leave site?" question instead.
    const shield = (FL.store.prefs().player || {}).shield !== false;
    if (shield && server.sandbox) iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-orientation-lock");
    state.guard = shield && !server.sandbox;
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
        '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener noreferrer" href="' + FL.ui.whereToWatch(film) + '">How to Watch ↗</a>' +
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
  /* The best-ranked server not yet tried for this title (skipping ones that failed the reachability check, unless
     all did); once every one has had a go, round the list again. */
  function next() {
    if (!state.ids) return;
    const usable = ranked(state.film, FL.store.peek(state.film.id)).filter((s) => s.url(params()));
    const reachable = usable.filter((s) => !health[s.id] || health[s.id].ok);
    const order = reachable.length > 1 || (reachable.length === 1 && reachable[0] !== state.server) ? reachable : usable;
    const fresh = order.find((s) => s !== state.server && !state.tried.has(s.id));
    if (fresh) { load(fresh); return; }
    const list = allServers().filter((s) => order.indexOf(s) !== -1);
    const nxt = list[(list.indexOf(state.server) + 1) % list.length];
    if (nxt && nxt !== state.server) load(nxt);
  }

  function nextEp() {
    if (!state.ep || !state.show) return null;
    const list = state.show.episodes.filter((x) => x.s > 0 && x.aired);
    const i = list.findIndex((x) => x.s === state.ep.s && x.e === state.ep.e);
    return i !== -1 ? list[i + 1] || null : null;
  }

  /* Up Next: at the credits (the player says it's 92% through), the next episode is announced and starts after a
     10-second countdown — Play now to skip the wait, Cancel to stay. Settings → Player turns it off. */
  const UP_NEXT_SECONDS = 10;
  function upNext(n) {
    cancelUpNext();
    const info = state.show && state.show.episodes.find((x) => x.s === n.s && x.e === n.e);
    const title = info && info.title && !/^episode \d+$/i.test(info.title) ? info.title : "";
    const box = document.createElement("div");
    box.className = "player-upnext";
    box.setAttribute("role", "status");
    box.innerHTML = (info && info.thumb ? '<img src="' + esc(info.thumb) + '" alt="" referrerpolicy="no-referrer">' : "") +
      '<div class="upnext-text"><small>Up next</small><strong>' + esc(epLabel(n) + (title ? " · " + title : "")) + "</strong>" +
        '<span data-upcount>Plays in ' + UP_NEXT_SECONDS + " s</span></div>" +
      '<div class="upnext-actions"><button type="button" class="btn btn-primary btn-sm" data-pl="upnext-go">' + icon("play") + "Play now</button>" +
        '<button type="button" class="btn btn-ghost btn-sm" data-pl="upnext-cancel">Cancel</button></div>' +
      '<i class="upnext-bar" style="animation-duration:' + UP_NEXT_SECONDS + 's"></i>';
    root.appendChild(box);
    FL.ui.overTop(box); // over a video site's own fullscreen too
    let left = UP_NEXT_SECONDS;
    state.upNext = setInterval(() => {
      left--;
      const c = box.querySelector("[data-upcount]");
      if (c) c.textContent = "Plays in " + left + " s";
      if (left <= 0) { cancelUpNext(); nextEpisode(); }
    }, 1000);
  }
  function cancelUpNext() {
    clearInterval(state.upNext);
    state.upNext = 0;
    if (root) root.querySelectorAll(".player-upnext").forEach((x) => x.remove());
  }

  function nextEpisode() {
    const n = nextEp();
    if (!n) return;
    history.replaceState(null, "", watchHash(state.film, n));
    start(state.film, { s: n.s, e: n.e });
  }

  /* The whole player goes fullscreen (not just the video's frame), so Iris's own things — break reminders, toasts,
     the server bar — can still appear over the film. The bars fade after a few still seconds and come back when
     the pointer reaches the top or bottom edge. Phones without element fullscreen fall back to the video's. */
  function fullscreen() {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const target = root.requestFullscreen || root.webkitRequestFullscreen ? root : root.querySelector(".player-iframe");
    if (!target) return;
    const req = target.requestFullscreen || target.webkitRequestFullscreen;
    const p = req && req.call(target);
    // Phones turn to landscape for the film (where the browser allows it: Android, installed apps).
    const landscape = () => { try { if (screen.orientation && screen.orientation.lock && matchMedia("(pointer: coarse)").matches) screen.orientation.lock("landscape").catch(() => {}); } catch (e) { /* not allowed here */ } };
    if (p && p.then) p.then(landscape).catch(() => {}); else landscape();
  }

  let idleTimer = 0;
  function wake() {
    root.classList.remove("is-idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (root.classList.contains("is-fs")) root.classList.add("is-idle"); }, 2600);
  }
  function onFullscreen() {
    if (!root) return;
    const el = document.fullscreenElement || document.webkitFullscreenElement;
    // The video site's own fullscreen button: hand fullscreen to Iris's player instead, so Up Next, reminders and the
    // bars still show. A tap inside the site's frame counts for this page too, so the browser allows it; where it
    // doesn't, theirs stays and our overlays use the top layer (FL.ui.overTop).
    if (el && el.tagName === "IFRAME" && state.open && root.contains(el) && root.requestFullscreen && document.exitFullscreen &&
      navigator.userActivation && navigator.userActivation.isActive) {
      document.exitFullscreen().then(() => fullscreen()).catch(() => {});
      return;
    }
    const fs = el === root;
    root.classList.toggle("is-fs", fs);
    if (fs) wake(); else {
      clearTimeout(idleTimer);
      root.classList.remove("is-idle");
      try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { /* nothing locked */ }
    }
  }
  document.addEventListener("fullscreenchange", onFullscreen);
  document.addEventListener("webkitfullscreenchange", onFullscreen);

  /* ---------- outcomes: learning which server works, and logging what you watched ---------- */

  /* Hosts without player events (2Embed, Vega) count as working once someone has watched for a while. */
  /* How a server did, when you move off it. Switching servers soon after it started counts against it; closing the
     player within 20 seconds says nothing either way (a peek, or the wrong title), so it counts as neither. */
  function settleServer(closing) {
    if (!state.server || !state.film || state.confirmed) return;
    const dwell = Date.now() - state.openedAt;
    if (closing && dwell < 20e3) return;
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
      if (FL.pet && FL.pet.onEpisode) FL.pet.onEpisode();
      const n = nextEp();
      const auto = n && state.open && (FL.store.prefs().player || {}).autoNext !== false;
      if (auto) upNext(n);
      FL.ui.toast("Marked " + epLabel(ep) + " watched", n && state.open && !auto
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
    settleServer(true);
    if (state.confirmed || state.logged) return;
    const minutes = (Date.now() - state.openedAt) / 60e3;
    const runtime = state.runtime || (state.ep ? 45 : 120);
    if (minutes >= runtime * 0.7) logWatched();
    else if (minutes >= 8) {
      FL.store.setProgress(state.film, Object.assign({ t: Math.round(minutes * 60), d: runtime * 60, at: Date.now(), srv: state.server.id, approx: true },
        state.ep ? { s: state.ep.s, e: state.ep.e } : {}));
    }
  }

  function close() {
    if (!state.open) return;
    cancelUpNext();
    state.open = false; // before settle(): a closing player offers Undo, not "Next episode"
    settle();
    if (FL.sync) setTimeout(() => FL.sync.flush(), 300); // Relay: where you stopped, to your other devices now
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
    if (e.key === "Escape" && root && !root.querySelector("[data-dl]").hidden) { e.preventDefault(); toggleDownloads(false); } // first Esc closes the list
    else if (e.key === "Escape" && !document.fullscreenElement) { e.preventDefault(); close(); }
    else if (e.key === "n" || e.key === "N") { e.preventDefault(); next(); }
    else if (e.key === "f" || e.key === "F") { e.preventDefault(); fullscreen(); }
    else if (/^[1-9]$/.test(e.key)) {
      const s = allServers()[+e.key - 1];
      if (s) { e.preventDefault(); switchTo(s); }
    }
  }, true);

  window.addEventListener("pagehide", () => { if (state.open) settle(); });
  // An unshielded player that tries to send this page to another site gets the browser's "Leave site?" question.
  window.addEventListener("beforeunload", (e) => { if (state.open && state.guard) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- trailers ---------- */

  function trailer(film, ytId) {
    const src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(ytId) + "?autoplay=1&rel=0&modestbranding=1&playsinline=1";
    FL.ui.modal(
      '<div class="trailer"><iframe src="' + src + '" title="' + esc(film.title) + ' trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>',
      { cls: "modal-trailer", label: film.title + " trailer" }
    );
  }

  FL.player = {
    SERVERS, open, close, trailer, probeAll, prefetch, vegaSearch, downloads, season,
    isOpen: () => state.open,
    current: () => state.film,
  };
})(window.FL = window.FL || {});
