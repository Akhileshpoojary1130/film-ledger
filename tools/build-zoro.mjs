// Builds data/zoro.js: Zoro TV's A–Z list (every series it has: slug, name, type, episodes, poster) for Sakura's A–Z
// page, and so a title from AniList can be found on Zoro TV without a search.
//   node tools/build-zoro.mjs        (about a minute: one page at a time, gently)
import { writeFileSync } from "node:fs";
import { cards } from "../api/anime.js";

const SITE = "https://zorotv.com.in";
const UA = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36";
const PAUSE = 1200;
const OUT = process.env.OUT || "../data/zoro.js";
const TYPES = { TV: "t", Movie: "m", ONA: "o", OVA: "v", Special: "s", Music: "u" };
const UPLOADS = SITE + "/wp-content/uploads/";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(n) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(SITE + "/az-list/?paged=" + n, { headers: { "user-agent": UA, accept: "text/html" } });
    const text = await res.text();
    if (/<title>Just a moment/i.test(text)) throw new Error("Zoro TV is showing a Cloudflare check; stopping (not going around it).");
    if (res.ok) return text;
    if (attempt >= 3) throw new Error("page " + n + " → HTTP " + res.status);
    await wait(4000 * attempt);
  }
}

const rows = [];
const seen = new Set();
for (let n = 1; n < 400; n++) {
  const found = cards(await page(n)).filter((c) => !c.ep && !seen.has(c.slug));
  if (!found.length) break;
  found.forEach((c) => {
    seen.add(c.slug);
    rows.push([c.slug, c.title, TYPES[c.type] || "", c.eps || 0, c.poster.startsWith(UPLOADS) ? c.poster.slice(UPLOADS.length) : c.poster]);
  });
  process.stdout.write(".");
  await wait(PAUSE);
}
process.stdout.write("\n");

writeFileSync(new URL(OUT, import.meta.url),
  "/* Zoro TV's A–Z list — built by tools/build-zoro.mjs. Rows: [slug, name, type (t TV, m movie, o ONA, v OVA,\n" +
  "   s special, u music), episodes, poster (under " + UPLOADS + ", or a full url)] */\n" +
  "window.ZORO_CATALOGUE = " + JSON.stringify({ generated: new Date().toISOString().slice(0, 10), rows }) + ";\n");
console.log(rows.length + " series");
