// Unit tests for the AI endpoint (no network: Upstash, Cinemeta, the catalogue and Gemini are faked): node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import handler, { catalogueIds, cleanFixes, cleanPicks, models, keys, gemini, facts, runCheck } from "../api/ai.js";

const BASE = "https://iris.test/api/ai";

const CATALOGUE = "/* comment */\nwindow.FILM_STATIC_CATALOGUE = " + JSON.stringify({
  schema: 2,
  movies: {
    "2009": { Hindi: [["3 Idiots", "Comedy / Drama", 8.4, "2009-12-25", "3 Idiots", "", "", 450000, "tt1187043", 5]], English: [], OtherIndian: [], Superhero: [] },
    "2014": { Hindi: [], English: [["Interstellar", "Sci-Fi", 8.7, "2014-11-07", "Interstellar", "", "", 2600000, "tt0816692", 5], ["No id", "Drama", 6, "2014-01-01", "x", "", "", 9, "", 3]], OtherIndian: [], Superhero: [] },
  },
}) + ";\n";

/* Upstash in memory: strings, a hash and a set. */
function fakeWorld(opts) {
  const o = opts || {};
  const kv = new Map();
  const hash = new Map(Object.entries(o.checks || {}));
  const lists = new Map();
  const set = new Set(o.want || []);
  const prompts = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u === "https://kv.test") {
      const cmd = JSON.parse(init.body);
      let result = null;
      const [op, key, ...rest] = cmd;
      if (op === "GET") result = kv.get(key) || null;
      else if (op === "SET") { kv.set(key, rest[0]); result = "OK"; }
      else if (op === "INCR") { const n = (+kv.get(key) || 0) + 1; kv.set(key, String(n)); result = n; }
      else if (op === "EXPIRE") result = 1;
      else if (op === "HMGET") result = rest.map((f) => (hash.has(f) ? hash.get(f) : null));
      else if (op === "HGET") result = hash.has(rest[0]) ? hash.get(rest[0]) : null;
      else if (op === "LPUSH") { const l = lists.get(key) || []; rest.forEach((x) => l.unshift(x)); lists.set(key, l); result = l.length; }
      else if (op === "LTRIM") { lists.set(key, (lists.get(key) || []).slice(+rest[0], +rest[1] + 1)); result = "OK"; }
      else if (op === "LRANGE") result = (lists.get(key) || []).slice(+rest[0], +rest[1] + 1);
      else if (op === "SREM") { rest.forEach((x) => set.delete(x)); result = 1; }
      else if (op === "HSET") { for (let i = 0; i < rest.length; i += 2) hash.set(rest[i], rest[i + 1]); result = rest.length / 2; }
      else if (op === "HLEN") result = hash.size;
      else if (op === "SCARD") result = set.size;
      else if (op === "SADD") { let n = 0; rest.forEach((x) => { if (!set.has(x)) { set.add(x); n++; } }); result = n; }
      else if (op === "SPOP") { const n = +rest[0]; result = [...set].slice(0, n); result.forEach((x) => set.delete(x)); }
      return new Response(JSON.stringify({ result }));
    }
    if (u.endsWith("/data/catalogue.js")) return new Response(CATALOGUE);
    if (u.startsWith("https://v3-cinemeta.strem.io/meta/movie/")) {
      const id = u.split("/").pop().replace(".json", "");
      const metas = {
        tt0816692: { name: "Interstellar", year: "2014", genres: ["Adventure", "Drama"], director: ["C. Nolan"], cast: ["Matthew McConaughey"], runtime: "160 min" },
        tt1187043: { name: "3 Idiots", year: "2009", genres: ["Comedy", "Drama"], director: ["Rajkumar Hirani"], cast: ["Aamir Khan"], runtime: "170 min" },
        tt0000001: { name: "Wanted Film", year: "2001", genres: ["Drama"], director: ["Someone"], cast: [] },
      };
      return metas[id] ? new Response(JSON.stringify({ meta: metas[id] })) : new Response("{}", { status: 404 });
    }
    if (u.startsWith("https://generativelanguage.googleapis.com/")) {
      const body = JSON.parse(init.body);
      const text = body.contents[0].parts[0].text;
      prompts.push({ url: u, text });
      if (o.gemini) return o.gemini(u, text);
      const films = JSON.parse(text.slice(text.indexOf("Films:\n") + 7));
      const answer = { films: films.map((f) => (f.id === "tt0816692"
        ? { id: f.id, verdict: "fixed", fixes: { directors: ["Christopher Nolan"], genres: ["Sci-Fi", "Drama", "Adventure"], runtime: 169 }, notes: "Director spelled out, Sci-Fi added." }
        : { id: f.id, verdict: "ok", fixes: {} })) };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }));
    }
    throw new Error("unexpected fetch " + u);
  };
  return { kv, hash, set, lists, prompts };
}

function withEnv(vars, fn) {
  const old = {};
  Object.keys(vars).forEach((k) => { old[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; });
  return Promise.resolve().then(fn).finally(() => Object.keys(old).forEach((k) => { if (old[k] == null) delete process.env[k]; else process.env[k] = old[k]; }));
}
const ENV = { KV_REST_API_URL: "https://kv.test", KV_REST_API_TOKEN: "tok", GEMINI_API_KEY: "key", GEMINI_API_KEY_2: null, GEMINI_API_KEYS: null, CRON_SECRET: "s3cret", GEMINI_MODEL: null, GEMINI_FALLBACK_MODELS: null, AI_DAILY: "6", AI_RUNS: "2" };

test("catalogueIds reads the bundled script: films with an IMDb id, most voted first", () => {
  const rows = catalogueIds(CATALOGUE);
  assert.deepEqual(rows.map((r) => r.id), ["tt0816692", "tt1187043"]);
  assert.equal(rows[1].lang, "Hindi");
});

test("models: Flash-Lite 3.5 first, 3.1 as the fallback, both overridable", () => {
  assert.deepEqual(models({}), ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]);
  assert.deepEqual(models({ GEMINI_MODEL: "m1", GEMINI_FALLBACK_MODELS: "m2, m1 ,m3" }), ["m1", "m2", "m3"]);
});

test("keys: up to ten, from numbered variables or a comma list, no repeats", () => {
  assert.deepEqual(keys({ GEMINI_API_KEY: "a", GEMINI_API_KEY_2: "b", GEMINI_API_KEY_10: "j", GEMINI_API_KEYS: "b, c" }), ["a", "b", "j", "c"]);
  assert.deepEqual(keys({}), []);
  assert.deepEqual(models({}, "gemini-3.1-flash-lite"), ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]);
  assert.deepEqual(models({}, "not-allowed"), ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]);
});

test("a key at its limit hands over to the next key before the next model", () => withEnv(Object.assign({}, ENV, { GEMINI_API_KEY_2: "key2" }), async () => {
  const used = [];
  globalThis.fetch = async (u, init) => {
    used.push(init.headers["x-goog-api-key"] + "@" + (String(u).includes("3.5") ? "3.5" : "3.1"));
    return init.headers["x-goog-api-key"] === "key" ? new Response("{}", { status: 429 })
      : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":1}' }] } }] }));
  };
  for (let i = 0; i < 2; i++) { const r = await gemini("x", {}); assert.equal(r.model, "gemini-3.5-flash-lite"); }
  assert.ok(used.every((x) => x.endsWith("@3.5")));
  assert.ok(used.includes("key2@3.5"));
}));

test("cleanFixes keeps only real, well-formed changes and remembers what was there", () => {
  const had = facts("tt1", { name: "X", year: "2014", genres: ["Adventure", "Drama"], director: ["C. Nolan"], cast: ["A"], runtime: "160 min" }, null);
  const { fixes, was } = cleanFixes({
    directors: ["Christopher Nolan"], cast: ["A"], genres: ["Drama", "Adventure"], year: 2014, runtime: 161,
    released: "nonsense", language: "", writers: [],
  }, had);
  assert.deepEqual(fixes, { directors: ["Christopher Nolan"] }); // same cast, same genres in another order, same year, runtime within 2 min
  assert.deepEqual(was, { directors: ["C. Nolan"] });
  assert.deepEqual(cleanFixes({ genres: ["Space Opera", "Sci-Fi"], year: 1800, runtime: 5 }, had).fixes, { genres: ["Sci-Fi"] });
  assert.deepEqual(cleanFixes({ language: "English" }, had).fixes, {}); // no language to correct: left alone
});

test("cleanPicks drops empty titles and bad ids, and caps at ten", () => {
  const out = cleanPicks({ understood: "x", picks: [{ title: "A", year: "2003", imdb: "tt0374887", why: "w" }, { title: "", why: "" }, { title: "B", imdb: "nope", kind: "series" }] });
  assert.deepEqual(out.picks, [{ title: "A", year: 2003, imdb: "tt0374887", kind: "movie", why: "w" }, { title: "B", year: null, imdb: null, kind: "series", why: "" }]);
});

test("gemini falls back to the next model when the first is busy", () => withEnv(ENV, async () => {
  fakeWorld({ gemini: (u) => (u.includes("3.5") ? new Response("{}", { status: 429 }) : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }))) });
  const r = await gemini("hi", { type: "OBJECT" });
  assert.equal(r.model, "gemini-3.1-flash-lite");
  assert.deepEqual(r.data, { ok: true });
}));

test("the daily run: wanted films first, then the catalogue; fixes stored per id", () => withEnv(ENV, async () => {
  const w = fakeWorld({ want: ["tt0000001"] });
  const lines = [];
  const r = await runCheck({ url: "https://kv.test", token: "tok" }, "https://iris.test", (s) => lines.push(s));
  assert.deepEqual(r, { checked: 3, fixed: 1 });
  assert.equal(JSON.parse(w.kv.get("iris:ai:last")).fixed, 1);
  assert.equal(JSON.parse(w.lists.get("iris:ai:recent")[0]).id, "tt0816692");
  const inter = JSON.parse(w.hash.get("tt0816692"));
  assert.equal(inter.verdict, "fixed");
  assert.deepEqual(inter.fixes, { directors: ["Christopher Nolan"], genres: ["Sci-Fi", "Drama", "Adventure"], runtime: 169 });
  assert.deepEqual(inter.was.directors, ["C. Nolan"]);
  assert.equal(JSON.parse(w.hash.get("tt1187043")).verdict, "ok");
  assert.ok(w.hash.has("tt0000001"));
  assert.equal(w.set.size, 0);
  // A second run has nothing left in this tiny catalogue that isn't checked.
  const again = await runCheck({ url: "https://kv.test", token: "tok" }, "https://iris.test", () => {});
  assert.equal(again.checked, 0);
}));

test("cron run needs the secret; lookup returns stored checks; want queues ids", () => withEnv(ENV, async () => {
  const w = fakeWorld({ checks: { tt0816692: JSON.stringify({ v: 1, verdict: "ok", fixes: {} }) } });
  assert.equal((await handler(new Request(BASE + "?run=1"))).status, 401);
  const run = await handler(new Request(BASE + "?run=1", { headers: { authorization: "Bearer s3cret" } }));
  assert.equal(run.status, 200);
  assert.match(await run.text(), /"checked":\d/);

  const got = await (await handler(new Request(BASE + "?ids=tt0816692,tt9999999,bad"))).json();
  assert.deepEqual(Object.keys(got.checks), ["tt0816692"]);

  const q = await (await handler(new Request(BASE, { method: "POST", body: JSON.stringify({ want: ["tt5555555", "x"] }) }))).json();
  assert.equal(q.queued, 1);
  assert.ok(w.set.has("tt5555555"));
}));

test("Ask Iris answers, and stops a visitor after 60 AI calls a day", () => withEnv(ENV, async () => {
  fakeWorld({ gemini: () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ understood: "comedies", picks: [{ title: "Chhichhore", year: 2019, imdb: "tt9052870", why: "Like 3 Idiots" }] }) }] } }] })) });
  const ask = () => handler(new Request(BASE, { method: "POST", headers: { "x-forwarded-for": "1.2.3.4" }, body: JSON.stringify({ ask: "funny college films", taste: { loved: ["3 Idiots (2009)"] } }) }));
  const first = await (await ask()).json();
  assert.equal(first.picks[0].imdb, "tt9052870");
  for (let i = 0; i < 59; i++) await ask();
  assert.equal((await ask()).status, 429);
}));

test("scan checks one film now (or returns the stored check); status lists recent fixes", () => withEnv(ENV, async () => {
  fakeWorld();
  const scan = await (await handler(new Request(BASE, { method: "POST", body: JSON.stringify({ scan: "tt0816692" }) }))).json();
  assert.equal(scan.check.verdict, "fixed");
  assert.equal(scan.check.title, "Interstellar");
  const again = await (await handler(new Request(BASE, { method: "POST", body: JSON.stringify({ scan: "tt0816692" }) }))).json();
  assert.equal(again.cached, true);
  const st = await (await handler(new Request(BASE + "?status=1"))).json();
  assert.equal(st.checked, 1);
  assert.equal(st.recent[0].title, "Interstellar");
  assert.equal(st.keys, 1);
}));

test("picks and insight come back cleaned", () => withEnv(ENV, async () => {
  fakeWorld({ gemini: (u, text) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(
    /Stats page/.test(text)
      ? { headline: "A Hirani loyalist", summary: "s", traits: ["Feel-good", "Hindi", "2000s", "extra"], picks: [{ title: "PK", year: 2014, imdb: "tt2338151", why: "w" }] }
      : { understood: "mix", picks: [{ title: "PK", year: 2014, imdb: "tt2338151", why: "w" }] }) }] } }] })) });
  const picks = await (await handler(new Request(BASE, { method: "POST", body: JSON.stringify({ picks: 1, taste: {} }) }))).json();
  assert.equal(picks.picks[0].title, "PK");
  const ins = await (await handler(new Request(BASE, { method: "POST", body: JSON.stringify({ insight: 1, taste: {}, stats: { films: 10 } }) }))).json();
  assert.equal(ins.traits.length, 3);
  assert.equal(ins.headline, "A Hirani loyalist");
}));

test("a visitor's own key is used alone, and a bad one says so", () => withEnv(ENV, async () => {
  const seen = [];
  fakeWorld({ gemini: (u) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ verdict: "yes", score: 88, headline: "Right up your street", reasons: ["You rated 3 Idiots 9/10", "Hirani again", "x", "y"] }) }] } }] })) });
  const inner = globalThis.fetch;
  globalThis.fetch = (u, init) => { if (String(u).includes("generativelanguage")) seen.push(init.headers["x-goog-api-key"]); return inner(u, init); };
  const own = "AIza" + "x".repeat(35);
  const r = await (await handler(new Request(BASE, { method: "POST", headers: { "x-gemini-key": own }, body: JSON.stringify({ match: { title: "PK", genres: ["Comedy"] }, taste: { genres: [{ name: "Comedy", score: 0.8, n: 12 }] } }) }))).json();
  assert.equal(r.verdict, "yes");
  assert.equal(r.reasons.length, 3);
  assert.deepEqual(seen, [own]);
  fakeWorld({ gemini: () => new Response("{}", { status: 400 }) });
  const bad = await handler(new Request(BASE, { method: "POST", headers: { "x-gemini-key": own }, body: JSON.stringify({ ask: "x" }) }));
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, "bad-key");
}));

test("without a Gemini key, Ask Iris says it isn't set up", () => withEnv(Object.assign({}, ENV, { GEMINI_API_KEY: null }), async () => {
  fakeWorld();
  const r = await handler(new Request(BASE, { method: "POST", body: JSON.stringify({ ask: "anything" }) }));
  assert.equal(r.status, 503);
}));
