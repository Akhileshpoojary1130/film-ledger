/* Sakura — Iris's anime app. Its catalogue is AniList (artwork, scores, characters, sequels, what's airing); Zoro TV
   (zorotv.com.in) adds its A–Z list and its own players (through api/anime.js). An anime is { id: "an<AniList id>",
   type: "anime", … } and lives in the same library as Iris's films, so Relay syncs it too; Iris's own lists leave
   it out (store.entries()). A title only Zoro TV has is "zr-<slug>". */
(function (FL) {
  "use strict";

  const { storage, session, hash } = FL.util;

  const ANILIST = "https://graphql.anilist.co";
  // Local copies use the deployed function (a static server has no /api), like Vega's lookup.
  const ZORO_API = /(^|\.)localhost$|^127\.0\.0\.1$|^\[::1\]$/.test(location.hostname) ? "https://film-ledger-mocha.vercel.app/api/anime" : "/api/anime";
  const ZORO_SITE = "https://zorotv.com.in";
  const ZORO_UPLOADS = ZORO_SITE + "/wp-content/uploads/";
  const Q_KEY = "film_ledger_anime_q"; // this visit's AniList answers
  const HOME_KEY = "film_ledger_anime_home"; // the home page's, kept so Sakura opens instantly next time
  const META_KEY = "film_ledger_anime_meta_v1"; // name, artwork and episodes of titles you've opened (library, offline)
  const MAP_KEY = "film_ledger_anime_zoro_v1"; // AniList id ↔ Zoro TV slug
  const GENRES = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Romance", "Slice of Life", "Sci-Fi", "Mystery",
    "Psychological", "Supernatural", "Sports", "Horror", "Thriller", "Mecha", "Music", "Mahou Shoujo"];
  const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"];
  const FORMAT = { TV: "TV", TV_SHORT: "TV short", MOVIE: "Movie", SPECIAL: "Special", OVA: "OVA", ONA: "ONA", MUSIC: "Music" };
  const STATUS = { FINISHED: "Finished", RELEASING: "Airing", NOT_YET_RELEASED: "Coming soon", CANCELLED: "Cancelled", HIATUS: "On hiatus" };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ").trim();

  /* ---------- AniList ---------- */

  const MEDIA = "id idMal title{romaji english native} format status episodes duration season seasonYear averageScore popularity " +
    "genres coverImage{extraLarge large color} bannerImage nextAiringEpisode{episode airingAt} startDate{year} synonyms";
  const SMALL = "id idMal title{romaji english native} format status episodes duration seasonYear averageScore popularity genres " +
    "coverImage{extraLarge large color} bannerImage nextAiringEpisode{episode airingAt} startDate{year} type";

  const inflight = new Map();
  let chain = Promise.resolve(); // AniList allows ~30 requests a minute: one at a time, never a burst

  function gql(query, variables, ttl) {
    const key = String(hash(query + "|" + JSON.stringify(variables || {})));
    const cache = session.get(Q_KEY, {});
    const hit = cache[key];
    if (hit && Date.now() - hit.at < (ttl || 3 * 3600e3)) return Promise.resolve(hit.data);
    if (inflight.has(key)) return inflight.get(key);
    const run = (attempt) => fetch(ANILIST, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query, variables: variables || {} }),
    }).then(async (r) => {
      if (r.status === 429 && attempt < 2) {
        await wait(Math.min(12, +r.headers.get("retry-after") || 4) * 1000);
        return run(attempt + 1);
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.errors) throw new Error((j.errors && j.errors[0] && j.errors[0].message) || "AniList answered " + r.status);
      return j.data;
    });
    const p = (chain = chain.catch(() => {}).then(() => run(0))).then((data) => {
      const c = session.get(Q_KEY, {});
      c[key] = { at: Date.now(), data };
      Object.keys(c).sort((a, b) => c[b].at - c[a].at).slice(24).forEach((k) => delete c[k]);
      session.set(Q_KEY, c);
      return data;
    }).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  /* ---------- anime objects ---------- */

  const known = new Map(); // id → anime, for this visit
  const meta = storage.get(META_KEY, {});

  function airedOf(m) {
    if (m.status === "NOT_YET_RELEASED") return 0;
    if (m.nextAiringEpisode) return Math.max(0, m.nextAiringEpisode.episode - 1);
    return m.episodes || 0;
  }

  function fromMedia(m) {
    const t = m.title || {};
    const a = {
      id: "an" + m.id, type: "anime", anilist: m.id, mal: m.idMal || 0,
      title: t.english || t.romaji || t.native || "Untitled", romaji: t.romaji || "", native: t.native || "",
      year: m.seasonYear || (m.startDate && m.startDate.year) || 0, season: m.season || "",
      format: m.format || "", status: m.status || "", episodes: m.episodes || 0, aired: airedOf(m),
      next: m.nextAiringEpisode || null, duration: m.duration || 0, score: m.averageScore || 0, pop: m.popularity || 0,
      genres: m.genres || [], synonyms: m.synonyms || [], lang: "Japanese",
      cover: (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || "", color: (m.coverImage && m.coverImage.color) || "",
      banner: m.bannerImage || "",
    };
    const prev = known.get(a.id);
    if (prev && prev.zoro) a.zoro = prev.zoro;
    known.set(a.id, a);
    return a;
  }

  /* A title only Zoro TV has (AniList has no match for it). */
  function fromZoroRow(row, info) {
    const i = info || {};
    const a = {
      id: "zr-" + row.slug, type: "anime", anilist: 0, mal: 0, zoro: row.slug,
      title: i.title || row.title, romaji: "", native: i.alt || "", year: parseInt((i.released || "").slice(-4), 10) || 0, season: "",
      format: { TV: "TV", Movie: "MOVIE", ONA: "ONA", OVA: "OVA", Special: "SPECIAL" }[i.type || row.type] || "",
      status: /complete/i.test(i.status || "") ? "FINISHED" : /ongoing/i.test(i.status || "") ? "RELEASING" : "",
      episodes: (i.episodes && i.episodes.length) || row.eps || 0, aired: (i.episodes && i.episodes.length) || row.eps || 0, next: null,
      duration: 24, score: 0, pop: 0, genres: i.genres || [], synonyms: [], lang: "Japanese",
      cover: i.poster || row.poster || "", color: "", banner: "", desc: i.synopsis || "",
    };
    known.set(a.id, a);
    return a;
  }

  /* Enough of a title to draw it in your library without the network. */
  function remember(a) {
    if (!a || !a.id) return;
    meta[a.id] = { t: a.title, r: a.romaji, c: a.cover, k: a.color, y: a.year, f: a.format, s: a.status, n: a.episodes, a: a.aired,
      d: a.duration, g: a.genres.slice(0, 3), m: a.mal, z: a.zoro || "", x: a.next ? a.next.airingAt : 0, at: Date.now() };
    const ids = Object.keys(meta);
    if (ids.length > 600) ids.sort((x, y) => meta[x].at - meta[y].at).slice(0, ids.length - 600).forEach((k) => delete meta[k]);
    storage.set(META_KEY, meta);
  }

  function get(id) {
    if (known.has(id)) return known.get(id);
    const m = meta[id];
    if (!m) return null;
    const anilist = /^an\d+$/.test(id) ? +id.slice(2) : 0;
    const a = {
      id, type: "anime", anilist, mal: m.m || 0, zoro: m.z || (anilist ? "" : id.slice(3)), title: m.t, romaji: m.r || "", native: "",
      year: m.y || 0, season: "", format: m.f || "", status: m.s || "", episodes: m.n || 0, aired: m.a || 0,
      next: m.x ? { airingAt: m.x, episode: (m.a || 0) + 1 } : null, duration: m.d || 24, score: 0, pop: 0, genres: m.g || [],
      synonyms: [], lang: "Japanese", cover: m.c || "", color: m.k || "", banner: "",
    };
    known.set(id, a);
    return a;
  }

  /* ---------- lists ---------- */

  function seasonOf(date) {
    const d = date || new Date();
    return { season: SEASONS[Math.floor(d.getMonth() / 3)], year: d.getFullYear() };
  }
  function nextSeason(s) {
    const i = SEASONS.indexOf(s.season);
    return i === 3 ? { season: SEASONS[0], year: s.year + 1 } : { season: SEASONS[i + 1], year: s.year };
  }

  const page = (alias, args, n) => alias + ": Page(perPage:" + (n || 20) + "){ media(type:ANIME,isAdult:false," + args + "){...m} }";

  /* Home in one request: trending, this season, next season, all-time popular, top rated, films. */
  function home() {
    const now = seasonOf();
    const nx = nextSeason(now);
    const q = "query($season:MediaSeason,$year:Int,$ns:MediaSeason,$ny:Int){" +
      page("trending", "sort:TRENDING_DESC") + page("season", "season:$season,seasonYear:$year,sort:POPULARITY_DESC") +
      page("upcoming", "season:$ns,seasonYear:$ny,sort:POPULARITY_DESC") + page("popular", "sort:POPULARITY_DESC") +
      page("top", "sort:SCORE_DESC") + page("movies", "format:MOVIE,sort:POPULARITY_DESC") + "} fragment m on Media{" + MEDIA + "}";
    const shape = (d) => {
      const out = { now, next: nx }; // the seasons; the lists are trending, season, upcoming, popular, top, movies
      Object.keys(d).forEach((k) => { out[k] = d[k].media.map(fromMedia); });
      return out;
    };
    const saved = storage.get(HOME_KEY, null);
    const fresh = gql(q, { season: now.season, year: now.year, ns: nx.season, ny: nx.year }, 3 * 3600e3).then((d) => {
      storage.set(HOME_KEY, { at: Date.now(), data: d });
      return shape(d);
    });
    // Last visit's answer straight away (under a day old); the fresh one replaces it when it lands.
    return { cached: saved && Date.now() - saved.at < 86400e3 ? shape(saved.data) : null, fresh };
  }

  function search(q) {
    const s = String(q || "").trim();
    if (s.length < 2) return Promise.resolve([]);
    return gql("query($q:String){Page(perPage:20){media(type:ANIME,isAdult:false,search:$q,sort:[SEARCH_MATCH,POPULARITY_DESC]){" + MEDIA + "}}}", { q: s })
      .then((d) => d.Page.media.map(fromMedia));
  }

  /* A page of a filtered list: a season, a genre, a format; sorted by popularity, score, trend or date. */
  function browse(o) {
    const args = [];
    const vars = { p: o.page || 1 };
    const types = ["$p:Int"];
    if (o.season) { args.push("season:$s,seasonYear:$y"); vars.s = o.season; vars.y = o.year; types.push("$s:MediaSeason", "$y:Int"); }
    else if (o.year) { args.push("seasonYear:$y"); vars.y = o.year; types.push("$y:Int"); }
    if (o.genre) { args.push("genre_in:[$g]"); vars.g = o.genre; types.push("$g:String"); }
    if (o.format) { args.push("format_in:$f"); vars.f = o.format === "TV" ? ["TV", "TV_SHORT"] : [o.format]; types.push("$f:[MediaFormat]"); }
    if (o.status) { args.push("status:$st"); vars.st = o.status; types.push("$st:MediaStatus"); }
    const sort = { top: "SCORE_DESC", trending: "TRENDING_DESC", new: "START_DATE_DESC", popular: "POPULARITY_DESC" }[o.sort] || "POPULARITY_DESC";
    if (o.sort === "new") args.push("status_not:NOT_YET_RELEASED");
    const q = "query(" + types.join(",") + "){Page(page:$p,perPage:30){pageInfo{hasNextPage} media(type:ANIME,isAdult:false," +
      (args.length ? args.join(",") + "," : "") + "sort:[" + sort + ",ID]){" + MEDIA + "}}}";
    return gql(q, vars).then((d) => ({ items: d.Page.media.map(fromMedia), more: !!d.Page.pageInfo.hasNextPage }));
  }

  /* Everything for a title page: the title, its characters and voice actors, sequels and prequels, recommendations,
     and episode names and stills (where AniList has them). */
  function load(id) {
    if (/^zr-/.test(id)) return fromZoro(id.slice(3)).then((a) => (a.anilist ? load(a.id) : zoroDetail(a)));
    const n = +String(id).replace(/^an/, "");
    if (!n) return Promise.reject(new Error("bad id"));
    const q = "query($id:Int){Media(id:$id,type:ANIME){" + MEDIA + " description(asHtml:false) studios(isMain:true){nodes{name}} trailer{id site}" +
      " characters(sort:[ROLE,RELEVANCE,ID],perPage:24){edges{role node{name{full} image{large}} voiceActors(language:JAPANESE,sort:[RELEVANCE,ID]){name{full} image{large}}}}" +
      " relations{edges{relationType(version:2) node{" + SMALL + "}}}" +
      " recommendations(perPage:14,sort:RATING_DESC){nodes{mediaRecommendation{" + SMALL + "}}}" +
      " streamingEpisodes{title thumbnail}}}";
    return gql(q, { id: n }, 6 * 3600e3).then((d) => {
      const m = d.Media;
      const a = fromMedia(m);
      a.desc = cleanDesc(m.description);
      a.studios = ((m.studios && m.studios.nodes) || []).map((s) => s.name);
      a.trailer = m.trailer && m.trailer.site === "youtube" ? m.trailer.id : "";
      remember(a);
      const stills = {};
      (m.streamingEpisodes || []).forEach((x) => {
        const mm = /^Episode\s+(\d+)\s*[-–:]\s*(.*)$/i.exec(x.title || "");
        if (mm && !stills[+mm[1]]) stills[+mm[1]] = { title: mm[2], thumb: x.thumbnail };
      });
      return {
        anime: a,
        characters: ((m.characters && m.characters.edges) || []).map((e) => ({
          name: e.node.name.full, image: e.node.image && e.node.image.large, role: e.role,
          va: e.voiceActors[0] ? { name: e.voiceActors[0].name.full, image: e.voiceActors[0].image && e.voiceActors[0].image.large } : null,
        })),
        relations: ((m.relations && m.relations.edges) || []).filter((e) => e.node.type === "ANIME")
          .map((e) => ({ rel: e.relationType, anime: fromMedia(e.node) })),
        recs: ((m.recommendations && m.recommendations.nodes) || []).map((x) => x.mediaRecommendation).filter((x) => x && !x.isAdult).map(fromMedia),
        stills,
      };
    });
  }

  /* For you: AniList's community recommendations for the anime you've liked most (rated, favourited, watched the most
     of, lately), added up. A title recommended from several of yours, and strongly, comes first; ones you already
     have are left out. One request. */
  function forYou() {
    const mine = FL.store.animeEntries();
    const have = new Set(mine.map((e) => e.id));
    const seeds = mine.filter((e) => /^an\d+$/.test(e.id)).map((e) => {
      const eps = Object.keys(e.episodes || {}).length;
      let w = (eps ? 0.3 + Math.min(1.2, eps / 8) : 0) + (e.progress ? 0.3 : 0) + (e.fav ? 1.5 : 0) + (e.rating ? (e.rating - 5) / 2.5 : 0) + (e.listed ? 0.3 : 0);
      const months = (Date.now() - (e.updated || Date.now())) / (30.4 * 864e5);
      if (w > 0) w *= 0.4 + 0.6 * Math.pow(0.5, Math.max(0, months) / 12);
      return [w, e];
    }).filter(([w]) => w > 0.25).sort((a, b) => b[0] - a[0]).slice(0, 8);
    if (!seeds.length) return Promise.resolve([]);
    const q = "query($ids:[Int]){Page(perPage:8){media(id_in:$ids,type:ANIME){id title{english romaji} " +
      "recommendations(perPage:12,sort:RATING_DESC){nodes{rating mediaRecommendation{" + SMALL + " isAdult}}}}}}";
    return gql(q, { ids: seeds.map(([, e]) => +e.id.slice(2)) }, 6 * 3600e3).then((d) => {
      const found = new Map();
      d.Page.media.forEach((m) => {
        const seed = seeds.find(([, e]) => e.id === "an" + m.id);
        if (!seed) return;
        const name = m.title.english || m.title.romaji;
        ((m.recommendations && m.recommendations.nodes) || []).forEach((n, i) => {
          const r = n.mediaRecommendation;
          if (!r || r.isAdult || have.has("an" + r.id)) return;
          const add = seed[0] * Math.log2(2 + Math.max(0, n.rating || 0)) * (1 - i * 0.04);
          const cur = found.get(r.id) || { anime: fromMedia(r), score: 0, best: 0, because: name };
          cur.score += add;
          if (add > cur.best) { cur.best = add; cur.because = name; }
          found.set(r.id, cur);
        });
      });
      return [...found.values()].map((x) => Object.assign(x, { score: x.score + (x.anime.score || 60) / 25 }))
        .sort((a, b) => b.score - a.score).slice(0, 20);
    });
  }

  function cleanDesc(s) {
    return String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\(Source:[^)]*\)\s*$/i, "")
      .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
  }

  /* ---------- collections: a whole franchise in release order ----------
     From AniList's links between titles, taken so that crossovers can't merge two franchises: climb from the title to
     its main story (PARENT), follow that story's sequel/prequel chain, then add each entry's side stories, spin-offs,
     recaps and films — with their own sequel chains, but no further side links (so "Lupin III vs. Detective Conan"
     is part of Conan's collection without pulling in all of Lupin III). Live, so new sequels appear by themselves;
     kept for a week. */
  const COLL_KEY = "film_ledger_anime_coll_v1";
  const COLL_TTL = 7 * 86400e3;
  const FULL = "id idMal title{romaji english native} format status episodes duration season seasonYear averageScore popularity genres " +
    "coverImage{extraLarge large color} bannerImage nextAiringEpisode{episode airingAt} startDate{year month day} synonyms isAdult " +
    "relations{edges{relationType(version:2) node{id type format}}}";
  const CHAIN = new Set(["SEQUEL", "PREQUEL"]);
  const BRANCH = new Set(["SIDE_STORY", "SPIN_OFF", "ALTERNATIVE", "SUMMARY", "COMPILATION", "PARENT"]);
  const raw = new Map(); // AniList id → media with its links, this visit

  function fetchMedia(ids) {
    const want = Array.from(new Set(ids)).filter((id) => !raw.has(id));
    const batches = [];
    for (let i = 0; i < want.length; i += 50) batches.push(want.slice(i, i + 50));
    return batches.reduce((p, b) => p.then(() => gql("query($ids:[Int]){Page(perPage:50){media(id_in:$ids,type:ANIME){" + FULL + "}}}", { ids: b }, COLL_TTL)
      .then((d) => d.Page.media.forEach((m) => raw.set(m.id, m)))), Promise.resolve())
      .then(() => ids.map((id) => raw.get(id)).filter(Boolean));
  }
  const links = (m, set) => ((m.relations && m.relations.edges) || [])
    .filter((e) => e.node.type === "ANIME" && e.node.format !== "MUSIC" && set.has(e.relationType)).map((e) => e.node.id);
  function chainFrom(start) {
    const seen = new Set(start);
    const step = (frontier) => (!frontier.length ? Promise.resolve(seen) : fetchMedia(frontier).then((ms) => {
      const next = [];
      ms.forEach((m) => links(m, CHAIN).forEach((id) => { if (!seen.has(id)) { seen.add(id); next.push(id); } }));
      return step(next);
    }));
    return step(start.slice());
  }
  const dateKey = (d) => ((d && d.year) || 9999) * 10000 + ((d && d.month) || 12) * 100 + ((d && d.day) || 31);
  function franchiseName(m) {
    let t = (m.title.english || m.title.romaji || "").replace(/\s*\(\d{4}\)\s*$/, "").replace(/\s+(Season|Part|Cour)\s*\d+.*$/i, "");
    const head = t.split(/:\s+/)[0];
    return head.length >= 3 ? head : t;
  }
  // Compact rows, so a collection draws instantly next time: [id, title, romaji, format, y, m, d, cover, colour, eps, status, score, banner].
  const toRow = (m) => [m.id, m.title.english || m.title.romaji || "", m.title.romaji || "", m.format || "", (m.startDate || {}).year || 0, (m.startDate || {}).month || 0,
    (m.startDate || {}).day || 0, (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || "", (m.coverImage && m.coverImage.color) || "", m.episodes || 0, m.status || "", m.averageScore || 0, m.bannerImage || ""];
  function fromRow(r) {
    const id = "an" + r[0];
    const a = known.get(id) || {
      id, type: "anime", anilist: r[0], mal: 0, title: r[1], romaji: r[2], native: "", year: r[4], season: "", format: r[3], status: r[10],
      episodes: r[9], aired: r[10] === "FINISHED" ? r[9] : 0, next: null, duration: 24, score: r[11], pop: 0, genres: [], synonyms: [],
      lang: "Japanese", cover: r[7], color: r[8], banner: r[12],
    };
    if (!known.has(id)) known.set(id, a);
    a._date = r[4] * 10000 + r[5] * 100 + r[6];
    return a;
  }
  function shape(c) {
    return { top: c.top, name: c.name, items: c.rows.map(fromRow).sort((x, y) => (x._date || 99999999) - (y._date || 99999999)) };
  }

  function collection(id) {
    const n = +String(id).replace(/^an/, "");
    if (!n) return Promise.reject(new Error("bad id"));
    const saved = storage.get(COLL_KEY, { c: {}, m: {} });
    const hit = saved.m[n] && saved.c[saved.m[n]];
    if (hit && Date.now() - hit.at < COLL_TTL) return Promise.resolve(shape(hit));
    const climb = (cur, hops) => fetchMedia([cur]).then(([m]) => {
      const up = m && ((m.relations && m.relations.edges) || []).find((e) => e.relationType === "PARENT" && e.node.type === "ANIME" && e.node.format !== "MUSIC");
      return up && hops < 3 ? climb(up.node.id, hops + 1) : cur;
    });
    return climb(n, 0).then((top) => chainFrom([top]).then((core) => fetchMedia(Array.from(core)).then((coreMs) => {
      const starts = new Set();
      coreMs.forEach((m) => links(m, BRANCH).forEach((x) => { if (!core.has(x)) starts.add(x); }));
      return chainFrom(Array.from(starts)).then((branches) => fetchMedia(Array.from(new Set([...core, ...branches, n])))).then((all) => {
        const list = all.filter((m) => !m.isAdult && m.format !== "MUSIC").sort((x, y) => dateKey(x.startDate) - dateKey(y.startDate));
        const main = coreMs.filter((m) => !m.isAdult).sort((x, y) => dateKey(x.startDate) - dateKey(y.startDate));
        const lead = main.find((m) => m.format === "TV") || main[0] || list[0];
        const c = { at: Date.now(), top, name: lead ? franchiseName(lead) : "", rows: list.map(toRow) };
        const store = storage.get(COLL_KEY, { c: {}, m: {} });
        store.c[top] = c;
        list.forEach((m) => { store.m[m.id] = top; });
        // Keep the 40 most recent collections.
        const tops = Object.keys(store.c).sort((x, y) => store.c[y].at - store.c[x].at);
        tops.slice(40).forEach((t) => { delete store.c[t]; });
        Object.keys(store.m).forEach((k) => { if (!store.c[store.m[k]]) delete store.m[k]; });
        storage.set(COLL_KEY, store);
        return shape(c);
      });
    })));
  }

  /* Popular franchises, for the Collections page: the most popular anime, grouped by their sequel/prequel links
     (directly, or through one title in between), one card each — named after the first series. One request. */
  function popularCollections() {
    return gql("query{a:Page(page:1,perPage:50){media(type:ANIME,isAdult:false,sort:POPULARITY_DESC,format_in:[TV,MOVIE,ONA]){" + FULL + "}}" +
      " b:Page(page:2,perPage:50){media(type:ANIME,isAdult:false,sort:POPULARITY_DESC,format_in:[TV,MOVIE,ONA]){" + FULL + "}}}", {}, 86400e3).then((d) => {
      const list = d.a.media.concat(d.b.media).filter((m) => !m.isAdult);
      const parent = new Map();
      const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
      const union = (a, b) => { parent.set(find(a), find(b)); };
      list.forEach((m) => parent.set(m.id, m.id));
      const via = new Map(); // a title between two popular ones → the popular ones linked to it
      list.forEach((m) => links(m, new Set(["SEQUEL", "PREQUEL", "PARENT", "SIDE_STORY"])).forEach((x) => {
        if (parent.has(x)) union(m.id, x);
        else { if (!via.has(x)) via.set(x, []); via.get(x).push(m.id); }
      }));
      via.forEach((ids) => ids.slice(1).forEach((x) => union(ids[0], x)));
      const groups = new Map();
      list.forEach((m) => { const r = find(m.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(m); });
      const related = new Set(["SEQUEL", "PREQUEL", "PARENT", "SIDE_STORY", "SPIN_OFF", "ALTERNATIVE", "SUMMARY", "COMPILATION"]);
      // A franchise has more than one title: two popular ones, or one with a sequel, film or special of its own.
      return Array.from(groups.values()).filter((g) => g.length > 1 || links(g[0], related).length > 0).map((g) => {
        g.sort((x, y) => dateKey(x.startDate) - dateKey(y.startDate));
        const lead = g.find((m) => m.format === "TV") || g[0];
        const a = fromMedia(lead);
        return { anime: a, name: franchiseName(lead), size: g.length, pop: Math.max.apply(null, g.map((m) => m.popularity || 0)) };
      }).sort((x, y) => y.pop - x.pop);
    });
  }

  /* ---------- Zoro TV ---------- */

  let zoroRows = null;
  function zoroList() {
    if (zoroRows) return Promise.resolve(zoroRows);
    if (window.ZORO_CATALOGUE) return Promise.resolve(parseRows());
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "data/zoro.js";
      s.onload = () => resolve(parseRows());
      s.onerror = () => resolve([]);
      document.head.appendChild(s);
    });
  }
  const TYPE = { t: "TV", m: "Movie", o: "ONA", v: "OVA", s: "Special", u: "Music" };
  function parseRows() {
    const rows = ((window.ZORO_CATALOGUE && window.ZORO_CATALOGUE.rows) || []).map(([slug, title, type, eps, poster]) => ({
      slug, title, type: TYPE[type] || "", eps, key: norm(title),
      poster: !poster ? "" : /^https:/.test(poster) ? poster : ZORO_UPLOADS + poster,
    }));
    zoroRows = rows;
    return rows;
  }

  const zoroFetch = (q) => FL.util.fetchJSON(ZORO_API + "?" + q, { timeout: 12000 });

  /* Zoro TV's slug for an AniList title: its names against the A–Z list here, else Zoro TV's own search. */
  const maps = storage.get(MAP_KEY, { z: {}, a: {} }); // z: anilist → slug, a: slug → anilist
  function saveMap() { storage.set(MAP_KEY, maps); }

  function bestRow(rows, a) {
    const names = [a.title, a.romaji].concat(a.synonyms || []).map(norm).filter(Boolean);
    const film = a.format === "MOVIE";
    let best = null;
    let bestScore = 0;
    rows.forEach((r) => {
      names.forEach((n, i) => {
        let s = r.key === n ? 1 : similar(r.key, n);
        if (film !== (r.type === "Movie")) s -= 0.08;
        if (i > 1) s -= 0.02; // a synonym, not the title
        if (s > bestScore) { bestScore = s; best = r; }
      });
    });
    return bestScore >= 0.9 ? best : null;
  }

  function zoroSlug(a) {
    if (a.zoro) return Promise.resolve(a.zoro);
    if (!a.anilist) return Promise.resolve("");
    if (maps.z[a.anilist] !== undefined) { a.zoro = maps.z[a.anilist]; return Promise.resolve(a.zoro); }
    return zoroList().then((rows) => {
      const hit = bestRow(rows, a);
      if (hit) return hit.slug;
      return zoroFetch("q=" + encodeURIComponent(a.title)).then((d) => {
        const found = ((d && d.results) || []).map((r) => Object.assign({ key: norm(r.title) }, r));
        let row = bestRow(found, a);
        if (!row && a.romaji && a.romaji !== a.title) {
          return zoroFetch("q=" + encodeURIComponent(a.romaji)).then((d2) => {
            row = bestRow(((d2 && d2.results) || []).map((r) => Object.assign({ key: norm(r.title) }, r)), a);
            return row ? row.slug : "";
          });
        }
        return row ? row.slug : "";
      }).catch(() => null);
    }).then((slug) => {
      if (slug === null) return ""; // offline or Zoro TV down: try again another time
      maps.z[a.anilist] = slug;
      if (slug) maps.a[slug] = a.anilist;
      saveMap();
      a.zoro = slug;
      if (meta[a.id]) remember(a);
      return slug;
    });
  }

  /* Zoro TV's players for one episode: { sub, dub } urls (either may be missing). */
  const serverCache = new Map();
  function zoroServers(a, e) {
    return zoroSlug(a).then((slug) => {
      if (!slug) return null;
      const key = slug + "|" + e;
      if (!serverCache.has(key)) {
        serverCache.set(key, zoroFetch("slug=" + encodeURIComponent(slug) + "&ep=" + e).then((d) => {
          const out = {};
          ((d && d.servers) || []).forEach((s) => { if (/^https:\/\//.test(s.url) && !out[s.type]) out[s.type] = s.url; });
          return out.sub || out.dub ? out : null;
        }).catch(() => { serverCache.delete(key); return null; }));
      }
      return serverCache.get(key);
    });
  }

  /* A series as Zoro TV has it (episode numbers, facts), for long runs AniList doesn't count and Zoro-only titles. */
  const seriesCache = new Map();
  function zoroSeries(slug) {
    if (!slug) return Promise.resolve(null);
    if (!seriesCache.has(slug)) {
      seriesCache.set(slug, zoroFetch("slug=" + encodeURIComponent(slug)).catch(() => { seriesCache.delete(slug); return null; }));
    }
    return seriesCache.get(slug);
  }

  /* A Zoro TV slug → the AniList title (so its page has artwork, characters…), else a Zoro-only title. */
  function fromZoro(slug) {
    if (maps.a[slug]) {
      const id = "an" + maps.a[slug];
      const hit = known.get(id) || get(id);
      if (hit) return Promise.resolve(hit);
    }
    return zoroList().then((rows) => {
      const row = rows.find((r) => r.slug === slug) || { slug, title: slug.replace(/-/g, " "), type: "", eps: 0, poster: "" };
      const fmt = { TV: ["TV", "TV_SHORT"], Movie: ["MOVIE"], ONA: ["ONA"], OVA: ["OVA"], Special: ["SPECIAL"] }[row.type];
      return gql("query($q:String,$f:[MediaFormat]){Page(perPage:10){media(type:ANIME,isAdult:false,search:$q,format_in:$f,sort:[SEARCH_MATCH,POPULARITY_DESC]){" + MEDIA + "}}}",
        { q: row.title, f: fmt || undefined }).then((d) => {
        const list = d.Page.media.map(fromMedia);
        const key = norm(row.title);
        const scored = list.map((a) => [Math.max.apply(null, [a.title, a.romaji].concat(a.synonyms).map((n) => (norm(n) === key ? 1 : similar(norm(n), key)))), a]);
        scored.sort((x, y) => y[0] - x[0]);
        const hit = scored[0] && scored[0][0] >= 0.86 ? scored[0][1] : null;
        if (hit) {
          hit.zoro = slug;
          maps.a[slug] = hit.anilist;
          maps.z[hit.anilist] = slug;
          saveMap();
          return hit;
        }
        return fromZoroRow(row);
      }).catch(() => fromZoroRow(row));
    });
  }

  function zoroDetail(a) {
    return zoroSeries(a.zoro).then((info) => {
      const row = { slug: a.zoro, title: a.title, type: "", eps: a.episodes, poster: a.cover };
      const full = info && info.title ? fromZoroRow(row, info) : a;
      remember(full);
      return { anime: full, characters: [], relations: [], recs: [], stills: {}, zoroEpisodes: (info && info.episodes) || [] };
    });
  }

  /* Newest episodes on Zoro TV (home's "Just out"). */
  function latest() {
    return zoroFetch("latest=1").then((d) => (d && d.results) || []).catch(() => []);
  }

  /* ---------- episodes ---------- */

  /* 1…n with what's out, names and stills. `zoroEps` fills in when AniList doesn't count a long run (One Piece). */
  function episodes(a, stills, zoroEps) {
    const zmax = zoroEps && zoroEps.length ? Math.max.apply(null, zoroEps) : 0;
    const smax = Object.keys(stills || {}).reduce((m, k) => Math.max(m, +k), 0);
    let aired = a.aired;
    if (a.status === "RELEASING" && !a.next) aired = Math.max(aired, zmax, smax);
    if (!aired && a.status !== "NOT_YET_RELEASED") aired = Math.max(a.episodes || 0, zmax, smax, a.format === "MOVIE" ? 1 : 0);
    const total = Math.max(a.episodes || 0, aired + (a.next ? 1 : 0));
    const list = [];
    for (let e = 1; e <= total; e++) {
      const st = (stills || {})[e];
      list.push({ s: 1, e, title: st ? st.title : "", thumb: st ? st.thumb : "", aired: e <= aired,
        date: a.next && e === a.next.episode ? new Date(a.next.airingAt * 1000).toISOString().slice(0, 10) : "" });
    }
    if (aired !== a.aired) { a.aired = aired; if (meta[a.id]) remember(a); }
    return list;
  }

  /* ---------- helpers ---------- */

  function similar(a, b) {
    if (a === b) return 1;
    if (!a || !b) return 0;
    const grams = (s) => { const g = new Map(); const t = " " + s + " "; for (let i = 0; i < t.length - 1; i++) { const k = t.slice(i, i + 2); g.set(k, (g.get(k) || 0) + 1); } return g; };
    const x = grams(a);
    const y = grams(b);
    let common = 0;
    x.forEach((n, k) => { common += Math.min(n, y.get(k) || 0); });
    return (2 * common) / (a.length + b.length + 2);
  }

  const formatLabel = (a) => FORMAT[a.format] || a.format || "";
  const statusLabel = (a) => STATUS[a.status] || "";
  const seasonLabel = (season, year) => (season ? season.charAt(0) + season.slice(1).toLowerCase() + " " : "") + (year || "");
  function airingIn(a) {
    if (!a.next || !a.next.airingAt) return "";
    const s = a.next.airingAt - Date.now() / 1000;
    if (s <= 0) return "Episode " + a.next.episode + " out now";
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    return "Episode " + a.next.episode + " in " + (d ? d + (d === 1 ? " day" : " days") : h ? h + (h === 1 ? " hour" : " hours") : Math.max(1, Math.round(s / 60)) + " min");
  }

  /* Sakura is on when the page is one of its own (#/anime…). */
  const active = () => document.documentElement.dataset.app === "sakura";

  /* Your anime, from the shared library. */
  const entries = () => FL.store.animeEntries();

  FL.anime = {
    GENRES, SEASONS, FORMAT, active, home, search, browse, load, get, remember, episodes, entries, forYou, collection, popularCollections,
    zoroList, zoroSlug, zoroServers, zoroSeries, fromZoro, latest, seasonOf, nextSeason,
    formatLabel, statusLabel, seasonLabel, airingIn, norm, similar,
    zoroUrl: (slug) => ZORO_SITE + "/anime/" + slug + "/",
    /* A Zoro TV row (A–Z, search, newest) as a card-ready title; its page finds the AniList match. */
    zoroItem: (r) => known.get("zr-" + r.slug) || fromZoroRow(r),
  };
})(window.FL = window.FL || {});
