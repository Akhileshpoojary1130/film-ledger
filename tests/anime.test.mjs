// Unit tests for Sakura's Zoro TV reader (api/anime.js), on markup shaped like the site's: node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import handler, { cards, servers, series, latest } from "../api/anime.js";

const b64 = (s) => Buffer.from(s).toString("base64");
const card = (href, title, type, epx, img) => '<article class="bs" itemscope="itemscope"><div class="bsx"><a href="' + href + '" itemprop="url" title="' + title +
  '" class="tip" rel="1"><div class="limit"><div class="typez ' + type + '">' + type + '</div><div class="bt"><span class="epx">' + epx + "</span></div>" +
  '<img decoding="async" src="' + img + '" width="350" /></div><div class="tt">' + title + "</div></a></div></article>";

test("cards reads series and episode cards", () => {
  const html = card("https://zorotv.com.in/anime/365-days-to-the-wedding/", "365 Days to the Wedding", "TV", "Ep 12", "https://zorotv.com.in/wp-content/uploads/2026/09/a.jpg") +
    card("https://zorotv.com.in/solo-leveling-season-2-arise-from-the-shadow-episode-13/", "Solo Leveling Season 2 Arise from the Shadow Episode 13", "TV", "Ep 13", "https://zorotv.com.in/b.jpg") +
    card("https://zorotv.com.in/anime/naruto/", "Frieren Beyond Journey&#8217;s End", "Movie", "Completed", "https://zorotv.com.in/c.jpg") +
    card("https://elsewhere.test/page/", "Not a title", "TV", "Ep 1", "https://x.test/d.jpg");
  const list = cards(html);
  assert.equal(list.length, 3);
  assert.deepEqual(list[0], { slug: "365-days-to-the-wedding", title: "365 Days to the Wedding", type: "TV", poster: "https://zorotv.com.in/wp-content/uploads/2026/09/a.jpg", eps: 12 });
  assert.deepEqual(list[1], { slug: "solo-leveling-season-2-arise-from-the-shadow", title: "Solo Leveling Season 2 Arise from the Shadow", type: "TV", poster: "https://zorotv.com.in/b.jpg", ep: 13 });
  assert.equal(list[2].title, "Frieren Beyond Journey’s End");
  assert.equal(list[2].eps, 0, "a status instead of an episode count");
});

test("servers decodes the sub and dub players", () => {
  const frame = (src) => b64('<iframe width="100%" height="100%" src="' + src + '" frameborder="0" allowfullscreen></iframe>');
  const html = '<div class="server-item"><a href="javascript:;" class="btn active" data-hash="' + frame("https://gogoanime.com.by/streaming.php?ep=12352&type=sub") + '">HD-SUB</a></div>' +
    '<div class="server-item"><a href="javascript:;" class="btn" data-hash="' + frame("https://gogoanime.com.by/streaming.php?ep=12352&amp;type=dub") + '">HD-DUB</a></div>' +
    '<div class="server-item"><a class="btn" data-hash="' + frame("http://insecure.test/x") + '">Old</a></div>';
  assert.deepEqual(servers(html), [
    { label: "HD-SUB", type: "sub", url: "https://gogoanime.com.by/streaming.php?ep=12352&type=sub" },
    { label: "HD-DUB", type: "dub", url: "https://gogoanime.com.by/streaming.php?ep=12352&type=dub" },
  ]);
  // A page with only the player itself.
  assert.deepEqual(servers('<div class="player-embed" id="pembed"><iframe src="https://p.test/e/1?type=sub"></iframe></div>'),
    [{ label: "HD-SUB", type: "sub", url: "https://p.test/e/1?type=sub" }]);
});

test("series reads the facts and every episode number", () => {
  const html = '<h1 class="entry-title" itemprop="name">Naruto</h1><span class="alter">ナルト</span>' +
    '<div class="spe"><span><b>Status:</b> Completed</span><span><b>Type:</b> TV</span><span class="split"><b>Released:</b> Oct 3, 2002</span></div>' +
    '<div class="genxed"><a href="https://zorotv.com.in/genres/action/" rel="tag">Action</a><a href="#" rel="tag">Shounen</a></div>' +
    '<a href="https://zorotv.com.in/naruto-episode-50/" class="item ep-item " data-number="50" data-id="1">' +
    '<a href="https://zorotv.com.in/naruto-episode-2/" class="item ep-item " data-number="2" data-id="2">' +
    '<a href="https://zorotv.com.in/naruto-episode-1/" class="item ep-item active" data-number="1" data-id="3">' +
    '<div class="entry-content" itemprop="description"><p>Moments prior to Naruto&#8217;s birth…</p></div>';
  const s = series(html);
  assert.equal(s.title, "Naruto");
  assert.equal(s.alt, "ナルト");
  assert.equal(s.status, "Completed");
  assert.equal(s.type, "TV");
  assert.deepEqual(s.genres, ["Action", "Shounen"]);
  assert.deepEqual(s.episodes, [1, 2, 50]);
  assert.equal(s.links.get(2), "https://zorotv.com.in/naruto-episode-2/");
  assert.match(s.synopsis, /^Moments prior to Naruto’s birth/);
});

test("latest keeps the Latest Release section's episodes only", () => {
  const html = '<div class="releases"><h2>Popular Today</h2></div>' + card("https://zorotv.com.in/one-piece-episode-1100/", "One Piece Episode 1100", "TV", "Ep 1100", "https://x.test/p.jpg") +
    '<div class="releases latesthome"><h2>Latest Release</h2></div>' + card("https://zorotv.com.in/koupen-chan-episode-76/", "Koupen chan Episode 76", "TV", "Ep 76", "https://x.test/k.jpg") +
    '<div class="releases"><h3>Recommendation</h3></div>' + card("https://zorotv.com.in/anime/naruto/", "Naruto", "TV", "Ep 220", "https://x.test/n.jpg");
  assert.deepEqual(latest(html).map((c) => [c.slug, c.ep]), [["koupen-chan", 76]]);
});

test("the handler refuses bad input before asking Zoro TV", async () => {
  let asked = 0;
  globalThis.fetch = async () => { asked++; return new Response("", { status: 200 }); };
  const get = (q) => handler(new Request("https://iris.test/api/anime?" + q)).then(async (r) => ({ status: r.status, body: await r.json() }));
  assert.equal((await get("slug=../../etc")).status, 400);
  assert.equal((await get("slug=naruto&ep=-1")).status, 400);
  assert.equal((await get("slug=naruto&ep=2.5")).status, 400);
  assert.deepEqual((await get("q=a")).body, { results: [] });
  assert.equal(asked, 0);
});
