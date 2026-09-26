/* Iris — Vega lookup, the one part of Iris that runs on a server (a Vercel function).
   Vega (vegamovito.run) is a Dooplay WordPress site strong on Hindi and Hindi-dubbed titles. Each title lists its own
   player links on several hosts, found through the site's search — and that search wants a nonce printed in its pages,
   which a browser can't read from another origin. So the lookup happens here and the player gets the links.

   GET /api/vega?title=K.G.F: Chapter 2&year=2022&imdb=tt10698680
   GET /api/vega?title=Mirzapur&imdb=tt6473300&s=3&e=4
   → { match: { id, title } | null, servers: [{ label, url }] } */
"use strict";

const SITE = "https://vegamovito.run";
const UA = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36";
const NONCE_TTL = 2 * 3600e3; // WordPress nonces live 12–24 h
const BUDGET = 8000; // stop trying further candidates after this; Vercel cuts functions off at 10 s

let nonce = { value: "", at: 0 };

function get(url, json) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  const headers = { "user-agent": UA, accept: json ? "application/json" : "text/html" };
  if (json) headers["x-requested-with"] = "XMLHttpRequest";
  return fetch(url, { signal: ctrl.signal, headers })
    .then((res) => {
      if (!res.ok) throw new Error(url.replace(SITE, "") + " → HTTP " + res.status);
      return res.text();
    })
    .finally(() => clearTimeout(timer));
}

async function searchNonce(fresh) {
  if (!fresh && nonce.value && Date.now() - nonce.at < NONCE_TTL) return nonce.value;
  const html = await get(SITE + "/");
  const m = html.match(/dtGonza\s*=\s*\{[^}]*?"nonce"\s*:\s*"(\w+)"/);
  if (!m) throw new Error("no search nonce on Vega's home page");
  nonce = { value: m[1], at: Date.now() };
  return nonce.value;
}

const decode = (s) => String(s || "")
  .replace(/<[^>]*>/g, "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
  .replace(/\s+/g, " ").trim();

/* "KGF Chapter 2 (2022) Hindi Dubbed" → name, year; "Bigg Boss Part-2 (2025) Hindi Season 19 Complete" → season 19. */
function parseTitle(raw) {
  const title = decode(raw);
  const m = title.match(/^(.*?)\s*\((\d{4})\)/);
  const season = title.match(/\bseason\s*0*(\d{1,3})\b/i);
  return {
    title,
    name: (m ? m[1] : title).replace(/\s*part[\s-]*\d+$/i, ""),
    year: m ? +m[2] : 0,
    season: season ? +season[1] : 0,
    daily: /\bS\d+\s*E\d+\b/i.test(title), // one post per daily episode (Bigg Boss) — not something we can map
  };
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/[.'’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/* 1 for the same name, else the share of words in common (Dice). "Pushpa: The Rise" vs "Pushpa: The Rise - Part 1" = 0.75. */
function similar(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = new Set(x.split(" "));
  const B = new Set(y.split(" "));
  let common = 0;
  A.forEach((w) => { if (B.has(w)) common++; });
  return (2 * common) / (A.size + B.size);
}

async function search(keyword) {
  const url = (n) => SITE + "/wp-json/dooplay/search/?keyword=" + encodeURIComponent(keyword) + "&nonce=" + n;
  let text = await get(url(await searchNonce()), true);
  if (/no_verify_nonce/.test(text)) text = await get(url(await searchNonce(true)), true);
  const data = JSON.parse(text);
  if (!data || data.error) return [];
  // Object keys that look like numbers iterate in numeric order; read the ids off the text to keep relevance order.
  const ids = [...text.matchAll(/"(\d+)"\s*:\s*\{/g)].map((m) => m[1]).filter((id) => data[id]);
  return ids.map((id) => Object.assign({ id: +id, url: String(data[id].url || "") }, parseTitle(data[id].title)));
}

/* Search matches every word anywhere in a post, and Vega writes "KGF" and "K.G.F" in different posts — so try a few spellings. */
function queries(title, s) {
  const base = String(title).replace(/['’]/g, " ").replace(/[^\p{L}\p{N}.]+/gu, " ").replace(/\s+/g, " ").trim();
  const bare = base.replace(/\./g, "");
  const words = bare.split(" ").filter((w) => w.length > 1 && !/^(the|a|an|of|and)$/i.test(w));
  const list = [bare, base, words.length > 2 ? words.slice(0, 2).join(" ") : ""];
  return [...new Set(list.filter(Boolean))].map((q) => (s ? q + " season " + s : q));
}

function playerOptions(html) {
  const out = [];
  const re = /<li\b[^>]*\bid=["']player-option-([\w-]+)["'][^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] === "trailer") continue;
    const attr = (name) => (m[0].match(new RegExp("data-" + name + "=[\"']([\\w-]+)[\"']")) || [])[1];
    out.push({
      nume: attr("nume") || m[1],
      type: attr("type") || "movie",
      label: decode((m[2].match(/<span class=["']title["']>([\s\S]*?)<\/span>/) || [])[1]),
    });
  }
  return out;
}

function embed(post, opt) {
  return get(SITE + "/wp-json/dooplayer/v2/" + post + "/" + opt.type + "/" + opt.nume, true)
    .then((text) => {
      let url = String(JSON.parse(text).embed_url || "").trim();
      if (url.startsWith("//")) url = "https:" + url;
      return /^https:\/\/[^\s"'<>]+$/.test(url) ? url : "";
    })
    .catch(() => "");
}

const episodeOf = (label) => { const m = label.match(/\bepisode[\s-]*0*(\d+)\b/i); return m ? +m[1] : 0; };

async function lookup({ title, year, imdb, s, e }) {
  const t0 = Date.now();
  const tv = s > 0;
  const seen = new Set();
  for (const q of queries(title, s)) {
    if (Date.now() - t0 > BUDGET) break;
    const found = await search(q);
    const candidates = found
      .filter((r) => !seen.has(r.id) && r.url.startsWith(SITE + "/") && !r.daily)
      .map((r) => Object.assign(r, { score: similar(r.name, title) }))
      .filter((r) => r.score >= 0.75 && (tv
        ? r.season === s
        : !r.season && (!year || !r.year || Math.abs(r.year - year) <= 1)))
      .sort((a, b) => b.score - a.score || (b.year === year) - (a.year === year));
    for (const c of candidates) {
      if (Date.now() - t0 > BUDGET) break;
      seen.add(c.id);
      const options = playerOptions(await get(c.url));
      // Shows: the episode's own link. "Super Player" and "Ultra Stream" carry the IMDb id, so they're fetched to check the match.
      const checks = options.filter((o) => /super|ultra/i.test(o.label));
      const wanted = tv ? options.filter((o) => episodeOf(o.label) === e) : options.filter((o) => !episodeOf(o.label));
      if (!wanted.length) continue;
      const list = [...new Set(wanted.concat(checks))];
      const urls = await Promise.all(list.map((o) => embed(c.id, o)));
      const tts = urls.map((u) => (u.match(/\btt\d{6,}\b/) || [])[0]).filter(Boolean);
      if (imdb && tts.length && tts.indexOf(imdb) === -1) continue; // a different film with the same name
      const servers = [];
      list.forEach((o, i) => {
        const url = urls[i];
        // /play/tt… is the Vega server Iris already has; show-level players don't know the episode.
        if (!url || wanted.indexOf(o) === -1 || /\/play\/tt\d+/.test(url) || servers.some((x) => x.url === url)) return;
        servers.push({ label: o.label, url });
      });
      if (servers.length) return { match: { id: c.id, title: c.title }, servers };
    }
  }
  return { match: null, servers: [] };
}

module.exports = async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("content-type", "application/json; charset=utf-8");
  const q = new URL(req.url, "http://localhost").searchParams;
  const int = (k, max) => { const n = parseInt(q.get(k), 10); return n > 0 && n <= max ? n : 0; };
  const input = {
    title: String(q.get("title") || "").trim().slice(0, 120),
    year: int("year", 2100),
    imdb: /^tt\d{5,10}$/.test(q.get("imdb") || "") ? q.get("imdb") : "",
    s: int("s", 999),
    e: int("e", 9999),
  };
  if (!input.title || (input.s && !input.e)) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "title (and e with s) required" }));
    return;
  }
  try {
    const out = await lookup(input);
    // Links rarely change once posted; a miss is re-checked sooner so new uploads show up.
    res.setHeader("cache-control", out.servers.length
      ? "public, max-age=3600, s-maxage=43200, stale-while-revalidate=172800"
      : "public, max-age=600, s-maxage=21600");
    res.end(JSON.stringify(out));
  } catch (err) {
    res.statusCode = 502;
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ error: String((err && err.message) || err) }));
  }
};
