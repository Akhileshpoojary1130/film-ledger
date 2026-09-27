// Unit tests for the sync store (no network: Upstash's REST API is faked in memory): node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import handler, { creds } from "../api/sync.js";

const ID = "a".repeat(64);
const URL_BASE = "https://iris.test/api/sync";

/* Just enough of Upstash: EVAL of the two scripts in api/sync.js, on a hash with rev and data. */
function fakeRedis() {
  const db = new Map();
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const cmd = JSON.parse(init.body);
    calls.push(cmd);
    assert.equal(init.headers.Authorization, "Bearer tok");
    const [, script, , key, ...args] = cmd;
    const row = db.get(key);
    let result;
    if (/'data', ARGV\[2\]/.test(script)) {
      const cur = row ? row.rev : 0;
      if (cur !== +args[0]) result = [0, cur];
      else { db.set(key, { rev: cur + 1, data: args[1] }); result = [1, cur + 1]; }
    } else {
      result = !row ? [0, ""] : String(row.rev) === args[0] ? [row.rev, ""] : [row.rev, row.data];
    }
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
  return { db, calls };
}

const get = (q) => handler(new Request(URL_BASE + "?" + q)).then(async (r) => ({ status: r.status, body: await r.json() }));
const post = (q, body) => handler(new Request(URL_BASE + "?" + q, { method: "POST", body: JSON.stringify(body) }))
  .then(async (r) => ({ status: r.status, body: await r.json() }));

test("creds finds Vercel's Upstash variables, with or without a custom prefix", () => {
  assert.equal(creds({}), null);
  assert.deepEqual(creds({ KV_REST_API_URL: "https://x.upstash.io/", KV_REST_API_TOKEN: "t" }), { url: "https://x.upstash.io", token: "t" });
  assert.deepEqual(creds({ UPSTASH_REDIS_REST_URL: "https://y", UPSTASH_REDIS_REST_TOKEN: "u" }), { url: "https://y", token: "u" });
  assert.deepEqual(creds({ STORAGE_KV_REST_API_URL: "https://z", STORAGE_KV_REST_API_TOKEN: "v" }), { url: "https://z", token: "v" });
});

test("without a store it says so instead of failing", async () => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  assert.deepEqual((await get("status=1")).body, { ready: false });
  assert.equal((await get("id=" + ID)).status, 503);
});

test("reads, writes and refuses a write from a stale revision", async () => {
  process.env.KV_REST_API_URL = "https://redis.test";
  process.env.KV_REST_API_TOKEN = "tok";
  const { calls } = fakeRedis();
  assert.deepEqual((await get("status=1")).body, { ready: true });
  assert.equal((await get("id=nothex")).status, 400);

  assert.deepEqual((await get("id=" + ID)).body, { rev: 0 }, "a new code has nothing yet");
  assert.deepEqual((await post("id=" + ID, { rev: 0, data: "z1.AAAA" })).body, { rev: 1 });
  assert.deepEqual((await get("id=" + ID)).body, { rev: 1, data: "z1.AAAA" });
  assert.deepEqual((await get("id=" + ID + "&since=1")).body, { rev: 1, same: true }, "no data when nothing changed");

  // Two devices both merged from revision 1: the first write wins, the second is told to pull again.
  assert.deepEqual((await post("id=" + ID, { rev: 1, data: "z1.BBBB" })).body, { rev: 2 });
  const late = await post("id=" + ID, { rev: 1, data: "z1.CCCC" });
  assert.equal(late.status, 409);
  assert.equal(late.body.rev, 2);
  assert.deepEqual((await get("id=" + ID + "&since=1")).body, { rev: 2, data: "z1.BBBB" });

  assert.equal((await post("id=" + ID, { rev: 2, data: "not base64!" })).status, 400);
  assert.ok(calls.every((c) => c[0] === "EVAL" && c[3] === "iris:sync:" + ID));
});
