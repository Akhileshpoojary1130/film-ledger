// Live check of every stream server Iris uses, from this machine's network: node tests/servers.mjs [site]
// The fixed servers are read from assets/js/player.js; Vega's per-title links come from the site's /api/vega
// (default: the live site). One request per host, no retries loop, so it's light enough to run any time.
import { readFileSync } from "node:fs";
import { resolve4 } from "node:dns/promises";

const SITE = (process.argv[2] || "https://film-ledger-mocha.vercel.app").replace(/\/$/, "");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";
const SINKHOLES = new Set(["49.44.79.236"]); // where Jio points hosts it blocks

const SAMPLES = [
  { what: "KGF Chapter 2", q: "title=K.G.F%3A+Chapter+2&year=2022&imdb=tt10698680", imdb: "tt10698680" },
  { what: "Dangal", q: "title=Dangal&year=2016&imdb=tt5074352", imdb: "tt5074352" },
  { what: "Mirzapur S3·E4", q: "title=Mirzapur&imdb=tt6473300&s=3&e=4" },
  { what: "Panchayat S4·E2", q: "title=Panchayat&imdb=tt12004706&s=4&e=2" },
];

async function timed(url, ms = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": UA }, redirect: "follow" });
    const body = await res.text();
    return { status: res.status, ms: Date.now() - t0, body };
  } catch (err) {
    return { status: 0, ms: Date.now() - t0, body: "", error: err.cause ? err.cause.code || err.cause.message : err.name };
  } finally {
    clearTimeout(timer);
  }
}

async function dns(host) {
  try {
    const ips = await resolve4(host);
    return ips.some((ip) => SINKHOLES.has(ip)) ? "blocked by ISP" : "ok";
  } catch (err) {
    return "no DNS (" + err.code + ")";
  }
}

async function checkHost(label, url) {
  const host = new URL(url).hostname;
  const [d, r] = await Promise.all([dns(host), timed(url)]);
  const verdict = d !== "ok" ? d : r.status === 0 ? "unreachable (" + r.error + ")" : r.status >= 400 ? "HTTP " + r.status
    : /can.?t find the video|video not found/i.test(r.body) ? "reachable, video gone" : "ok";
  return { label, host, verdict, ms: r.status ? r.ms : "" };
}

function table(rows) {
  const cols = ["label", "host", "verdict", "ms"];
  const width = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)));
  const line = (r) => cols.map((c, i) => String(r[c]).padEnd(width[i])).join("  ");
  console.log(line(Object.fromEntries(cols.map((c) => [c, c.toUpperCase()]))));
  rows.forEach((r) => console.log(line(r)));
}

const player = readFileSync(new URL("../assets/js/player.js", import.meta.url), "utf8");
const fixed = [...player.matchAll(/id: "([\w-]+)", name: "([^"]+)"[^\n]*?origin: "(https:\/\/[^"]+)"/g)].map((m) => ({ id: m[1], name: m[2], origin: m[3] }));

console.log("\nFixed servers (" + fixed.length + ")\n");
table(await Promise.all(fixed.map((s) => checkHost(s.name, s.origin + "/"))));

const superPlayer = fixed.find((s) => s.id === "vega");
if (superPlayer) {
  console.log("\nVega Super Player by IMDb id\n");
  table(await Promise.all(SAMPLES.filter((x) => x.imdb).map(async (x) => {
    const r = await timed(superPlayer.origin + "/play/" + x.imdb);
    return { label: x.what, host: new URL(superPlayer.origin).hostname, verdict: r.status ? (/video not found/i.test(r.body) ? "not on Super" : "has it") : "unreachable", ms: r.ms };
  })));
}

console.log("\nVega's own players via " + SITE + "/api/vega\n");
let failed = 0;
for (const x of SAMPLES) {
  const r = await timed(SITE + "/api/vega?" + x.q, 20000);
  let data = null;
  try { data = JSON.parse(r.body); } catch (e) { /* reported below */ }
  if (!data || r.status !== 200) {
    failed++;
    console.log(x.what + ": lookup failed (" + (r.status || r.error) + ") " + (r.body || "").slice(0, 120));
    continue;
  }
  console.log(x.what + ": " + (data.match ? data.match.title : "not on Vega") + "  (" + r.ms + " ms)");
  if (data.servers.length) table(await Promise.all(data.servers.map((s) => checkHost(s.label, s.url))));
  console.log("");
}
process.exitCode = failed ? 1 : 0;
