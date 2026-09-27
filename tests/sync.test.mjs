// Unit tests for the sync store (no network: Upstash's REST API is faked in memory): node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import handler, { creds } from "../api/sync.js";

const ID = "a".repeat(64);
const URL_BASE = "https://iris.test/api/sync";

/* Just enough of Upstash: GET, HMGET, and the write script (two string keys; a legacy hash dropped on write). */
function fakeRedis(seed) {
  const db = new Map(Object.entries(seed || {}));
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const cmd = JSON.parse(init.body);
    calls.push(cmd);
    assert.equal(init.headers.Authorization, "Bearer tok");
    let result = null;
    if (cmd[0] === "GET") result = db.has(cmd[1]) ? db.get(cmd[1]) : null;
    else if (cmd[0] === "HMGET") { const h = db.get(cmd[1]) || {}; result = cmd.slice(2).map((f) => (f in h ? h[f] : null)); }
    else if (cmd[0] === "EVAL") {
      const [, , , revKey, dataKey, legacy, rev, data] = cmd;
      const cur = +(db.get(revKey) || (db.get(legacy) || {}).rev || 0);
      if (cur !== +rev) result = [0, cur];
      else { db.set(revKey, String(cur + 1)); db.set(dataKey, data); db.delete(legacy); result = [1, cur + 1]; }
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
  const before = calls.length;
  assert.deepEqual((await get("id=" + ID + "&since=1")).body, { rev: 1, same: true }, "no data when nothing changed");
  assert.equal(calls.length - before, 1, "an unchanged poll costs one command");

  // Two devices both merged from revision 1: the first write wins, the second is told to pull again.
  assert.deepEqual((await post("id=" + ID, { rev: 1, data: "z1.BBBB" })).body, { rev: 2 });
  const late = await post("id=" + ID, { rev: 1, data: "z1.CCCC" });
  assert.equal(late.status, 409);
  assert.equal(late.body.rev, 2);
  assert.deepEqual((await get("id=" + ID + "&since=1")).body, { rev: 2, data: "z1.BBBB" });

  assert.equal((await post("id=" + ID, { rev: 2, data: "not base64!" })).status, 400);
});

test("a library saved in the old one-hash layout is read, then moved on its next write", async () => {
  const OLD = "b".repeat(64);
  const { db } = fakeRedis({ ["iris:sync:" + OLD]: { rev: "4", data: "z1.OLD" } });
  assert.deepEqual((await get("id=" + OLD)).body, { rev: 4, data: "z1.OLD" });
  assert.deepEqual((await get("id=" + OLD + "&since=4")).body, { rev: 4, same: true });
  assert.deepEqual((await post("id=" + OLD, { rev: 4, data: "z1.NEW" })).body, { rev: 5 });
  assert.equal(db.has("iris:sync:" + OLD), false, "the old hash is gone");
  assert.deepEqual((await get("id=" + OLD)).body, { rev: 5, data: "z1.NEW" });
});
