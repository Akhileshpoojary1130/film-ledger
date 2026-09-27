/* Iris — people: small portraits for cast and crew, and their other films.
   Portraits come from Wikipedia (one request covers up to 40 names; a page only counts if its description
   says actor/director/writer…, so "Lal" never shows a random lal). Filmographies come from Cinemeta search,
   which indexes cast and crew; only titles that actually credit the person are kept. */
(function (FL) {
  "use strict";

  const { storage, fetchJSON, limiter, normalize, esc, hash, debounce } = FL.util;

  const KEY = "film_ledger_people_v1";
  const TTL = 30 * 864e5;
  const CAP = 1500;
  const ROLE = /\b(actor|actress|director|film|cinema|screenwriter|writer|producer|filmmaker|comedian|singer|composer|cinematographer|lyricist|model|television|presenter|dancer|choreographer|playwright|author|novelist|musician|rapper|host|personality|anchor)\b/i;

  let cache = storage.get(KEY, {}); // name -> { u: thumbnail url or "", d: short description, t: page title, at }
  const queue = limiter(2);
  const waiting = new Map();

  const save = debounce(() => {
    const names = Object.keys(cache);
    if (names.length > CAP) {
      names.sort((a, b) => cache[a].at - cache[b].at).slice(0, names.length - CAP).forEach((n) => delete cache[n]);
    }
    storage.set(KEY, cache);
  }, 1200);

  const fresh = (e) => e && Date.now() - e.at < TTL;

  function lookup(titles) {
    const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages%7Cdescription" +
      "&piprop=thumbnail&pithumbsize=160&titles=" + encodeURIComponent(titles.join("|"));
    return queue(() => fetchJSON(url, { timeout: 12000 })).then((data) => {
      const q = (data && data.query) || {};
      const alias = {};
      (q.normalized || []).forEach((n) => { alias[n.from] = n.to; });
      (q.redirects || []).forEach((r) => { alias[r.from] = r.to; });
      const pages = {};
      Object.values(q.pages || {}).forEach((p) => { pages[p.title] = p; });
      return (t) => {
        let cur = t;
        for (let i = 0; i < 3 && alias[cur]; i++) cur = alias[cur];
        const p = pages[cur];
        return p && !("missing" in p) && ROLE.test(p.description || "") ? p : null;
      };
    });
  }

  /* Resolves once every name has an entry (a portrait or a known miss). `roles` (name -> "Director"/"Writer"/"Cast")
     decides which disambiguation to try first: "Siddique (director)" for a writer, "Siddique (actor)" for cast. */
  function photos(names, roles) {
    const want = Array.from(new Set(names.filter(Boolean))).filter((n) => !fresh(cache[n]) && !waiting.has(n));
    const jobs = [];
    for (let i = 0; i < want.length; i += 40) {
      const batch = want.slice(i, i + 40);
      const job = lookup(batch).then((find) => {
        const missing = [];
        batch.forEach((n) => {
          const p = find(n);
          if (p) cache[n] = { u: (p.thumbnail && p.thumbnail.source) || "", d: p.description || "", t: p.title, at: Date.now() };
          else missing.push(n);
        });
        // Second try for common names: "Govinda (actor)", "Lal (director)".
        if (!missing.length) return;
        const suffixes = (n) => (/Director|Writer/.test((roles && roles[n]) || "") ? ["director", "filmmaker", "screenwriter", "actor"] : ["actor", "actress", "director", "filmmaker"]);
        const alt = [];
        missing.forEach((n) => suffixes(n).forEach((r) => alt.push(n + " (" + r + ")")));
        const second = [];
        for (let j = 0; j < alt.length; j += 48) second.push(lookup(alt.slice(j, j + 48)));
        return Promise.all(second).then((finds) => {
          missing.forEach((n) => {
            let p = null;
            suffixes(n).some((r) => finds.some((f) => (p = f(n + " (" + r + ")"))));
            cache[n] = p ? { u: (p.thumbnail && p.thumbnail.source) || "", d: p.description || "", t: p.title, at: Date.now() }
              : { u: "", d: "", t: "", at: Date.now() };
          });
        });
      }).catch(() => { /* offline — initials for now, try again next time */ })
        .finally(() => { batch.forEach((n) => waiting.delete(n)); save(); });
      batch.forEach((n) => waiting.set(n, job));
      jobs.push(job);
    }
    names.forEach((n) => { if (waiting.has(n) && jobs.indexOf(waiting.get(n)) === -1) jobs.push(waiting.get(n)); });
    return Promise.all(jobs).then(() => {
      const out = {};
      names.forEach((n) => { out[n] = cache[n] || null; });
      return out;
    });
  }

  const info = (name) => cache[name] || null;
  const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  // Crew (directors, writers) carry a hint so "Siddique" the writer-director isn't confused with Siddique the actor.
  const isCrew = (role) => /Director|Writer|Music|Cinematography/.test(role || "");
  const href = (name, role) => "#/person/" + encodeURIComponent(name) + (isCrew(role) ? "?as=crew" : "");

  function face(name, size) {
    const e = cache[name];
    return '<span class="avatar" style="--ph:' + (hash(name) % 360) + ";--sz:" + (size || 36) + 'px" data-face="' + esc(name) + '">' +
      "<span>" + esc(initials(name)) + "</span>" +
      (e && e.u ? '<img src="' + esc(e.u) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">' : "") + "</span>";
  }

  function chip(name, role) {
    return '<a class="person" href="' + href(name, role) + '">' + face(name, 36) +
      '<span class="person-text"><b>' + esc(name) + "</b>" + (role ? "<small>" + esc(role) + "</small>" : "") + "</span></a>";
  }

  /* Fill in portraits that arrived after the markup was drawn. */
  function paint(root) {
    (root || document).querySelectorAll(".avatar[data-face]").forEach((el) => {
      if (el.querySelector("img")) return;
      const e = cache[el.dataset.face];
      if (!e || !e.u) return;
      const img = new Image();
      img.alt = "";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => img.remove();
      img.src = e.u;
      el.appendChild(img);
    });
  }

  /* ---------- filmographies ---------- */

  const works = new Map(); // name -> Promise<[{ film, role }]>

  /* The person's Wikidata item, found through their Wikipedia page (trying "(actor)", "(director)"… for common names). */
  function qidFor(name, crew) {
    const key = crew ? name + "|crew" : name;
    const e = cache[key];
    if (e && e.q) return Promise.resolve(e.q);
    const titles = crew
      ? [name + " (director)", name + " (filmmaker)", name + " (screenwriter)", name, name + " (actor)"]
      : [name, name + " (actor)", name + " (actress)", name + " (director)", name + " (filmmaker)"];
    const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageprops%7Cdescription" +
      "&ppprop=wikibase_item&titles=" + encodeURIComponent(titles.join("|"));
    return queue(() => fetchJSON(url, { timeout: 12000 })).then((data) => {
      const q = (data && data.query) || {};
      const alias = {};
      (q.normalized || []).forEach((n) => { alias[n.from] = n.to; });
      (q.redirects || []).forEach((r) => { alias[r.from] = r.to; });
      const pages = {};
      Object.values(q.pages || {}).forEach((p) => { pages[p.title] = p; });
      for (const t of titles) {
        let cur = t;
        for (let i = 0; i < 3 && alias[cur]; i++) cur = alias[cur];
        const p = pages[cur];
        const id = p && p.pageprops && p.pageprops.wikibase_item;
        if (id && ROLE.test(p.description || "")) {
          cache[key] = Object.assign({ u: "", d: p.description || "", t: p.title, at: Date.now() }, cache[key], { q: id });
          save();
          return id;
        }
      }
      return "";
    }).catch(() => "");
  }

  /* Every film and series Wikidata credits them on — as cast, director or writer — with IMDb ids and years. */
  function wikidataWorks(name, crew) {
    const key = crew ? name + "|crew" : name;
    const e = cache[key];
    if (e && e.w && Date.now() - (e.wat || 0) < 14 * 864e5) return Promise.resolve(e.w);
    return qidFor(name, crew).then((qid) => {
      if (!qid) return [];
      const sparql = 'SELECT ?imdb ?filmLabel ?date ?role ?kind WHERE { VALUES (?prop ?role) { (wdt:P161 "Cast") (wdt:P57 "Director") (wdt:P58 "Writer") (wdt:P86 "Music") (wdt:P344 "Cinematography") } ' +
        "VALUES ?kind { wd:Q11424 wd:Q5398426 } ?film ?prop wd:" + qid + " ; wdt:P31 ?kind ; wdt:P345 ?imdb . OPTIONAL { ?film wdt:P577 ?date } " +
        'SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }';
      return fetchJSON("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(sparql), { timeout: 20000 }).then((d) => {
        const byTt = new Map();
        ((d && d.results && d.results.bindings) || []).forEach((b) => {
          const tt = b.imdb.value;
          if (!/^tt\d+$/.test(tt)) return;
          const year = b.date ? +b.date.value.slice(0, 4) : 0;
          const row = byTt.get(tt) || { tt, title: b.filmLabel.value, year: 0, roles: [], series: /Q5398426$/.test(b.kind.value) };
          if (year && (!row.year || year < row.year)) row.year = year;
          if (row.roles.indexOf(b.role.value) === -1) row.roles.push(b.role.value);
          byTt.set(tt, row);
        });
        const rows = Array.from(byTt.values());
        cache[key] = Object.assign({ u: "", d: "", t: "", at: Date.now() }, cache[key], { w: rows, wat: Date.now() });
        save();
        return rows;
      });
    }).catch(() => []);
  }

  function filmography(name, crew) {
    const wkey = crew ? name + "|crew" : name;
    if (works.has(wkey)) return works.get(wkey);
    const key = normalize(name);
    const credited = (list) => (list || []).some((x) => normalize(x) === key);
    const search = Promise.all(["movie", "series"].map((type) => FL.meta.cinemetaSearch(name, true, type).catch(() => [])));
    const p = Promise.all([wikidataWorks(name, crew), search]).then(([rows, [movies, shows]]) => {
      const out = [];
      const have = new Set();
      const push = (film, role) => {
        if (!film) return;
        const k = film.id + "|" + role;
        if (have.has(k)) return;
        have.add(k);
        out.push({ film, role });
      };
      rows.forEach((r) => {
        const film = FL.catalogue.byImdb(r.tt) || FL.catalogue.findLocal(r.tt, r.title, r.year) ||
          FL.catalogue.addRemote({ imdbId: r.tt, type: r.series ? "series" : "movie", title: r.title, year: r.year, genres: [], poster: "" });
        r.roles.forEach((role) => push(film, role));
      });
      const add = (metas, type) => metas.forEach((m) => {
        const role = credited(m.director) ? "Director" : credited(m.cast) ? "Cast" : credited(m.writer) ? "Writer" : "";
        if (!role) return;
        const [film] = FL.remote.ingest([m], { type, keepBare: true });
        push(film, role);
      });
      add(movies, "movie");
      add(shows, "series");
      return out.sort((a, b) => (b.film.year || 9999) - (a.film.year || 9999));
    });
    works.set(wkey, p);
    // An empty answer is usually a failed request — don't remember it.
    p.then((list) => { if (!list.length) works.delete(wkey); }, () => works.delete(wkey));
    return p;
  }

  /* ---------- full credits ---------- */

  const CREDITS_KEY = "film_ledger_credits_v2"; // v2: hosts and creators too
  const creditCache = storage.get(CREDITS_KEY, {}); // tt -> { at, c: [[name, role, character, image, links]] }
  const creditJobs = new Map();

  /* A film's whole billed cast (with the characters they play) and its director, writers, composer and
     cinematographer, from Wikidata by IMDb id. Cinemeta names only the three or four leads; this fills in the rest,
     and each person's Wikidata portrait saves a Wikipedia lookup. [{ name, role, character, links }] */
  function credits(tt) {
    if (!/^tt\d+$/.test(tt || "")) return Promise.resolve([]);
    const hit = creditCache[tt];
    if (hit && Date.now() - hit.at < TTL) return Promise.resolve(expand(hit.c));
    if (creditJobs.has(tt)) return creditJobs.get(tt);
    const sparql = 'SELECT ?role ?p ?pLabel ?img ?links ?char WHERE { ?f wdt:P345 "' + tt + '" . ' +
      '{ ?f p:P161 ?st . ?st ps:P161 ?p . BIND("Cast" AS ?role) OPTIONAL { ?st pq:P453 ?c . ?c rdfs:label ?char FILTER(lang(?char) = "en") } OPTIONAL { ?st pq:P4633 ?char } } ' +
      'UNION { ?f wdt:P57 ?p . BIND("Director" AS ?role) } UNION { ?f wdt:P58 ?p . BIND("Writer" AS ?role) } ' +
      'UNION { ?f wdt:P86 ?p . BIND("Music" AS ?role) } UNION { ?f wdt:P344 ?p . BIND("Cinematography" AS ?role) } ' +
      'UNION { ?f wdt:P371 ?p . BIND("Host" AS ?role) } UNION { ?f wdt:P170 ?p . BIND("Creator" AS ?role) } ' +
      'OPTIONAL { ?p wdt:P18 ?img } OPTIONAL { ?p wikibase:sitelinks ?links } SERVICE wikibase:label { bd:serviceParam wikibase:language "en,hi". } }';
    const job = fetchJSON("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(sparql), { timeout: 15000 }).then((d) => {
      const rows = new Map();
      ((d && d.results && d.results.bindings) || []).forEach((b) => {
        const name = b.pLabel && b.pLabel.value;
        if (!name || /^Q\d+$/.test(name)) return;
        const k = name + "|" + b.role.value;
        const row = rows.get(k) || [name, b.role.value, "", "", 0];
        if (b.char && !row[2]) row[2] = b.char.value;
        if (b.img && !row[3]) row[3] = b.img.value.replace(/^http:/, "https:") + "?width=160";
        if (b.links) row[4] = +b.links.value;
        rows.set(k, row);
      });
      const c = Array.from(rows.values());
      creditCache[tt] = { at: Date.now(), c };
      const keys = Object.keys(creditCache);
      if (keys.length > 300) keys.sort((a, b) => creditCache[a].at - creditCache[b].at).slice(0, keys.length - 300).forEach((x) => delete creditCache[x]);
      storage.set(CREDITS_KEY, creditCache);
      return expand(c);
    }).catch(() => []).finally(() => creditJobs.delete(tt));
    creditJobs.set(tt, job);
    return job;
  }

  function expand(rows) {
    let seeded = false;
    const out = rows.map(([name, role, character, image, links]) => {
      // A Wikidata portrait counts as found, so the Wikipedia lookup is skipped for this person.
      if (image && !(cache[name] && cache[name].u)) { cache[name] = Object.assign({ d: "", t: "" }, cache[name], { u: image, at: Date.now() }); seeded = true; }
      return { name, role, character, links };
    });
    if (seeded) save();
    return out;
  }

  /* The people behind what you watch and rate highly: directors count most, then the first-billed cast. */
  function favourites(limit) {
    const score = {};
    const seen = {};
    FL.store.watched().forEach((e) => {
      const film = FL.catalogue.get(e.id);
      const m = film && FL.meta.cached(film);
      if (!m) return;
      const st = FL.store.state(film.id);
      const w = (st.rating ? st.rating / 5 : 1) + (st.fav ? 1 : 0) + (st.count > 1 ? 0.5 : 0);
      const credit = (name, k, role) => {
        score[name] = (score[name] || 0) + k * w;
        seen[name] = seen[name] || { role, films: 0 };
        seen[name].films++;
      };
      (m.directors || []).slice(0, 2).forEach((n) => credit(n, 3, "Director"));
      (m.cast || []).slice(0, 4).forEach((n, i) => credit(n, i < 2 ? 1.5 : 1, "Cast"));
    });
    return Object.keys(score)
      .filter((n) => seen[n].films >= 2 || score[n] >= 5)
      .sort((a, b) => score[b] - score[a])
      .slice(0, limit || 3)
      .map((n) => ({ name: n, role: seen[n].role, films: seen[n].films }));
  }

  /* A cast list that starts short — one row on a phone (two or three faces, by width), 12 elsewhere — with
     "Show all" for the rest. */
  function block(label, chips) {
    if (!chips.length) return "";
    return '<h2 class="label">' + label + '</h2><div class="people is-collapsed">' + chips.join("") + "</div>" +
      (chips.length > 2 ? '<button type="button" class="btn btn-sm btn-ghost people-more' + (chips.length > 12 ? " is-many" : "") + (chips.length === 3 ? " is-three" : "") +
        '" data-people-more aria-expanded="false">Show all ' + chips.length + "</button>" : "");
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-people-more]");
    if (!b) return;
    const list = b.previousElementSibling;
    if (!list || !list.classList.contains("people")) return;
    const open = list.classList.toggle("is-collapsed") === false;
    b.setAttribute("aria-expanded", String(open));
    b.textContent = open ? "Show fewer" : "Show all " + list.children.length;
  });

  /* A show's hosts and regulars from TVmaze (free, no key), for the reality shows Wikidata knows little about. */
  const tvmazeJobs = new Map();
  function tvmazeCast(tt) {
    if (!/^tt\d+$/.test(tt || "")) return Promise.resolve([]);
    if (!tvmazeJobs.has(tt)) {
      tvmazeJobs.set(tt, fetchJSON("https://api.tvmaze.com/lookup/shows?imdb=" + tt, { timeout: 8000 })
        .then((show) => (show && show.id ? fetchJSON("https://api.tvmaze.com/shows/" + show.id + "/cast", { timeout: 8000 }) : []))
        .then((list) => (Array.isArray(list) ? list : []).map((x) => ({
          name: x.person && x.person.name, character: (x.character && x.character.name) || "",
          image: x.person && x.person.image && x.person.image.medium ? x.person.image.medium.replace(/^http:/, "https:") : "",
        })).filter((x) => x.name))
        .catch(() => []));
    }
    return tvmazeJobs.get(tt);
  }

  FL.people = { photos, info, face, chip, paint, href, filmography, favourites, credits, block, tvmazeCast };
})(window.FL = window.FL || {});
