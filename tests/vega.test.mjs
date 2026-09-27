// Unit tests for the Vega lookup's matching and clean-up (no network): node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { parseTitle, similar, queries, playerOptions, episodeOf, cleanUrl, episodeLink, GONE, language, posterOf, downloadLinks, parseHot, hotDownloads } from "../api/vega.js";

test("parseTitle reads name, year and season off Vega's post titles", () => {
  assert.deepEqual(
    [parseTitle("KGF Chapter 2 (2022) Hindi Dubbed")].map(({ name, year, season, daily }) => ({ name, year, season, daily }))[0],
    { name: "KGF Chapter 2", year: 2022, season: 0, daily: false },
  );
  assert.equal(parseTitle("Mirzapur (2024) Hindi Season 3 Complete AMZN").season, 3);
  assert.equal(parseTitle("Mirzapur (2018) Hindi Season 01 Complete").season, 1);
  const part = parseTitle("Bigg Boss Part-2 (2025) Hindi Season 19 Complete");
  assert.equal(part.name, "Bigg Boss");
  assert.equal(part.season, 19);
  assert.equal(parseTitle("Bigg Boss &#8211; S17 E84 &#8211; 6nd January (2024) Hindi").daily, true);
  assert.equal(parseTitle("Fast &amp; Furious (2009) Hindi Dubbed").name, "Fast & Furious");
});

test("similar accepts the same film written differently and rejects neighbours", () => {
  assert.equal(similar("K.G.F: Chapter 2", "KGF Chapter 2"), 1);
  assert.equal(similar("Pushpa 2: The Rule", "Pushpa 2 The Rule"), 1);
  assert.ok(similar("Pushpa: The Rise", "Pushpa: The Rise - Part 1") >= 0.75);
  assert.ok(similar("KGF Chapter 1", "KGF Chapter 2") < 0.75);
  assert.ok(similar("Don", "Don 2") < 0.75);
  assert.ok(similar("Mirzapur", "Mirzapur: The Movie") < 0.75);
  assert.equal(similar("", "Anything"), 0);
});

test("queries try both spellings of dotted names and add the season for shows", () => {
  assert.deepEqual(queries("K.G.F: Chapter 2", 0), ["KGF Chapter 2", "K.G.F Chapter 2"]);
  // Long titles also get a broader two-word search as a last try.
  assert.deepEqual(queries("Pushpa: The Rise - Part 1", 0), ["Pushpa The Rise Part 1", "Pushpa Rise"]);
  assert.deepEqual(queries("Mirzapur", 3), ["Mirzapur season 3"]);
  assert.equal(queries("Don't Breathe", 0)[0], "Don t Breathe");
});

test("playerOptions lists a post's players without the trailer", () => {
  const html =
    '<li id="player-option-trailer" class="dooplay_player_option" data-post="1" data-type="movie" data-nume="trailer"><span class="title">Watch trailer</span></li>' +
    '<li id="player-option-1" class="dooplay_player_option" data-type="movie" data-post="1" data-nume="1"><i></i><span class="title">Super Player</span><span class="server">x.com</span></li>' +
    '<li id="player-option-2" class="dooplay_player_option" data-type="movie" data-post="1" data-nume="2"><span class="title">EPISODE-1</span></li>' +
    '<li id="player-option-11" class="dooplay_player_option" data-type="movie" data-post="1" data-nume="11"><span class="title">EPISODE-10</span></li>';
  assert.deepEqual(playerOptions(html), [
    { nume: "1", type: "movie", label: "Super Player" },
    { nume: "2", type: "movie", label: "EPISODE-1" },
    { nume: "11", type: "movie", label: "EPISODE-10" },
  ]);
  assert.deepEqual(playerOptions("<p>no players</p>"), []);
});

test("episodeOf reads episode labels and ignores everything else", () => {
  assert.equal(episodeOf("EPISODE-4"), 4);
  assert.equal(episodeOf("Episode 10"), 10);
  assert.equal(episodeOf("EPISODE-01"), 1);
  assert.equal(episodeOf("Fast Player-2"), 0);
  assert.equal(episodeOf("Bonus Episode"), 0);
});

test("cleanUrl tidies Vega's links and refuses anything else", () => {
  assert.equal(cleanUrl("https://vsembed.ru//embed//tt10698680"), "https://vsembed.ru/embed/tt10698680");
  assert.equal(cleanUrl("//mxdrop.to/e/owzko1m7arzzgo "), "https://mxdrop.to/e/owzko1m7arzzgo");
  assert.equal(cleanUrl("https://hdmovie1.rpmvip.com/#li6ytd "), "https://hdmovie1.rpmvip.com/#li6ytd");
  assert.equal(cleanUrl("https://new.multicloudlinks.com/player.php/?v=jmy9tl"), "https://new.multicloudlinks.com/player.php/?v=jmy9tl");
  assert.equal(cleanUrl("https://molop.art/watch?v=F9TD6I0E"), "", "retired Ultra Stream V2 host");
  assert.equal(cleanUrl("javascript:alert(1)"), "");
  assert.equal(cleanUrl("http://insecure.example/e/1"), "");
  assert.equal(cleanUrl(null), "");
});

test("episodeLink points a show-wide player at one episode", () => {
  assert.equal(episodeLink("https://vsembed.su/embed/tt6473300", 3, 4), "https://vsembed.su/embed/tv?imdb=tt6473300&season=3&episode=4");
  assert.equal(episodeLink("https://slast430did.com/play/tt6473300", 3, 4), "");
  assert.equal(episodeLink("https://molop.art/watch?v=F9TD6I0E", 3, 4), "");
});

test("GONE spots dead-video pages only", () => {
  assert.ok(GONE.test("WE ARE SORRY We can't find the video you are looking for."));
  assert.ok(GONE.test("Video Not Found !"));
  assert.ok(GONE.test("This file was deleted by the owner"));
  assert.ok(!GONE.test("<title>Loading...</title>"));
  assert.ok(!GONE.test("<title>Dangal (2016) Hindi HD Netflix - 720P.mkv</title>"));
});

test("language reads Vega's tag after the year", () => {
  assert.deepEqual(language("KGF Chapter 2 (2022) Hindi Dubbed"), { lang: "", dubbed: true });
  assert.deepEqual(language("Awarapan 2 (2026) Hindi"), { lang: "Hindi" });
  assert.deepEqual(language("Laatu (2018) Punjabi HD"), { lang: "OtherIndian", region: "Punjabi" });
  assert.deepEqual(language("Some Film (2020)"), { lang: "" });
});

test("posterOf turns Vega's thumbnails into full-size posters", () => {
  assert.equal(posterOf("https://vegamovito.run/wp-content/uploads/2025/09/52G8MVrrcmS7lHjDRnQbJz3VtkW-90x135.jpg"),
    "https://image.tmdb.org/t/p/w342/52G8MVrrcmS7lHjDRnQbJz3VtkW.jpg");
  assert.equal(posterOf("https://vegamovito.run/wp-content/uploads/2022/04/khNVygolU0TxLIDWff5tQlAhZ23-1-200x300-1-90x135.jpg"),
    "https://image.tmdb.org/t/p/w342/khNVygolU0TxLIDWff5tQlAhZ23.jpg");
  assert.equal(posterOf("https://vegamovito.run/wp-content/uploads/2026/05/download-5-90x135.jpg"),
    "https://vegamovito.run/wp-content/uploads/2026/05/download-5.jpg");
  assert.equal(posterOf("https://vegamovito.run/wp-content/uploads/2026/09/kalyanamkamaniyamjeevitam-185x278.jpg"),
    "https://vegamovito.run/wp-content/uploads/2026/09/kalyanamkamaniyamjeevitam.jpg", "a plain word isn't a TMDB id");
  assert.equal(posterOf(""), "");
});

test("downloadLinks reads a post's download buttons, grouped by page", () => {
  const page = "https://hdm2.xyz/shri-ramayan-katha-shri-ram-ki-2026-hindi-hdtc/";
  const btn = (q, url) => '<p><a href=" ' + url + ' " target="_blank" rel="noopener noreferrer nofollow"><br><button class="download-button">Download Now [' + q + ']</button><br></a></p><hr>';
  const html = '<div class="download-container"><h1>Download Multi Audio</h1>' + btn("1080p", page) + btn("1080p", page) + btn("720p", page) + btn("480p", page) +
    btn("720p", "https://other.example/file/9") + '</div><ul class="wp-tags"><li><a href="https://vegamovito.run/tag/x/" rel="tag">Download Full HD</a></li></ul>' +
    '<a href="https://t.me/vega">Download on Telegram</a><a href="https://vegamovito.run/how-to-download/">How to download</a>';
  assert.deepEqual(downloadLinks(html), [
    { label: "1080p · 720p · 480p", url: page },
    { label: "720p", url: "https://other.example/file/9" },
  ]);
  assert.deepEqual(downloadLinks("<p>no downloads</p>"), []);
  // Vega's usual layout: one page per button, two with the same words, then other languages.
  const a = (text, id) => '<a href="https://new3.extralink.ink/s/' + id + '/"><button class="download-button">' + text + "</button></a>";
  assert.deepEqual(downloadLinks(a("Download 1080p HD", "a1") + a("Download 1080p HD", "a2") + a("Download 480p SD", "a3") +
    a("Download Malayalam", "a4") + a("WATCH ONLINE", "a5")).map((d) => d.label), ["1080p HD", "1080p HD · 2", "480p SD", "Malayalam"]);
  // A season post's per-episode buttons narrow to the episode asked for; season packs stay, bonus episodes don't.
  const season = a("EP-1", "e1") + a("EP-2", "e2") + a("EP-10", "e10") + a("Bonus Episode", "b") + a("Download Complete Season [1080p]", "zip");
  assert.deepEqual(downloadLinks(season, 2).map((d) => d.label), ["EP-2", "Complete Season 1080p"]);
  assert.deepEqual(downloadLinks(season, 0).length, 5);
  assert.deepEqual(downloadLinks(a("Multiples Packs", "m") + a("EP-1", "e1") + a("Bonus Episode EP-1", "b1"), 1).map((d) => d.label), ["All episodes", "EP-1"]);
  assert.deepEqual(downloadLinks('<a href="javascript:alert(1)"><button class="download-button">Download</button></a>'), []);
});

test("parseHot reads Vega Hot's titles", () => {
  const a = parseHot("Mirzapur (2018) S01 (2018) Hindi Web Series [Complete] [HDRip]");
  assert.deepEqual([a.name, a.year, a.season], ["Mirzapur", 2018, 1]);
  const b = parseHot("The Vvaan: Force of the Forrest 2026 Hindi Line Audio V2 HQ [HQ HDTC]");
  assert.deepEqual([b.name, b.year, b.season], ["The Vvaan: Force of the Forrest", 2026, 0]);
  const c = parseHot("Bigg Boss 2026 Season 20 Hindi Audio [JioHotStar Series] [EP-20 Added] [WEB DL]");
  assert.deepEqual([c.name, c.year, c.season], ["Bigg Boss", 2026, 20]);
  const d = parseHot("1920 (2008) Hindi [HDRip]");
  assert.deepEqual([d.name, d.year], ["1920", 2008]);
});

test("hotDownloads reads both of Vega Hot's layouts", () => {
  // Newer posts: a quality heading, then a button with the size.
  const btn = (q, id, size) => '<h3 style="text-align: center;"><span style="color: #ff0000;">' + q + '</span></h3>' +
    '<h3 style="text-align: center;"><div><a class="btn" href="https://nexdrive.help/' + id + '/" target="_blank" rel="noopener"> <button class="dwd-button">' +
    '<i class="fa fa-download"></i>⚡Click Here To Download [' + size + '] ⚡</button></a></div></h3>';
  const fresh = '<h5>—–== Download Links ==—–</h5><div class="download-links-div">' + btn("480p", "a", "460MB") + btn("720p x265 HEVC", "b", "780MB") +
    btn("1080p x264", "c", "2.6GB") + '<hr></div><h3>Winding Up ❤️</h3><p><a href="/">vega-hot.com</a></p>';
  assert.deepEqual(hotDownloads(fresh).map((d) => d.label), ["480p · 460MB", "720p x265 HEVC · 780MB", "1080p x264 · 2.6GB"]);
  // Older posts: everything in the link, with pictures in between.
  const old = '<p>Download Links</p><p><a href="https://1.bp.blogspot.com/x.png"><img src="x"></a></p>' +
    '<p><a href="https://vgmlinks.live/31331">Download Complete 720p Hindi Season – 1 – GDrive – 1.6GB</a></p>' +
    '<p><a href="https://vgmlinks.live/31332">Download Complete 480p Hindi Season – 1 – GDrive – 860MB</a></p><p>Winding Up</p>';
  assert.deepEqual(hotDownloads(old), [
    { label: "720p · 1.6GB", url: "https://vgmlinks.live/31331" },
    { label: "480p · 860MB", url: "https://vgmlinks.live/31332" },
  ]);
  assert.deepEqual(hotDownloads("<p>nothing here</p>"), []);
});
