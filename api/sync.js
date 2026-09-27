/* Iris — sync store (Relay): one encrypted library per sync code, kept in this project's Upstash Redis (Vercel →
   Storage). Browsers encrypt before sending (AES-GCM, with a key only the sync code gives), so this only keeps opaque
   text plus a revision number: a write names the revision it started from, and loses if another device got there
   first (it pulls, merges and tries again). Untouched libraries expire after 400 days.

   Built to be cheap on a free plan: "anything new?" is one GET of a small revision key; the library itself is read
   only when it changed, and written with one script.

   GET  ?status=1               → { ready }                       is a store connected?
   GET  ?id=<64 hex>&since=<rev> → { rev, data } | { rev, same } | { rev: 0 }
   POST ?id=<64 hex>  { rev, data } → { rev } | 409 { rev }        */

export const config = { runtime: "edge" };

const ID = /^[a-f0-9]{64}$/;
const DATA = /^[a-z0-9]{1,4}\.[A-Za-z0-9_-]+$/;
const MAX = 2000000; // characters of ciphertext — far above a big library (~60 KB for 1,000 titles)
const TTL = String(400 * 86400);

// Compare-and-set on the revision key; the library and its revision are written together. (KEYS[3] is the older
// single-hash layout, read once and dropped on the first write.)
const WRITE = `local r = tonumber(redis.call('GET', KEYS[1]) or redis.call('HGET', KEYS[3], 'rev') or '0')
if r ~= tonumber(ARGV[1]) then return {0, r} end
redis.call('SET', KEYS[1], r + 1, 'EX', ARGV[3])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
redis.call('DEL', KEYS[3])
return {1, r + 1}`;

/* Vercel's Upstash integration adds KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*, or the same
   names behind a custom prefix). */
export function creds(env) {
  const e = env || (typeof process !== "undefined" && process.env) || {};
  const pairs = [["KV_REST_API_URL", "KV_REST_API_TOKEN"], ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]];
  let names = [];
  try { names = Object.keys(e); } catch (err) { /* not enumerable here */ }
  names.forEach((k) => { if (/(?:REST_API|REDIS_REST)_URL$/.test(k)) pairs.push([k, k.replace(/URL$/, "TOKEN")]); });
  for (const [u, t] of pairs) if (e[u] && e[t]) return { url: String(e[u]).replace(/\/+$/, ""), token: String(e[t]) };
  return null;
}

async function redis(c, cmd) {
  const r = await fetch(c.url, {
    method: "POST",
    headers: { Authorization: "Bearer " + c.token, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || "store answered " + r.status);
  return j.result;
}

const json = (body, status) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export default async function handler(req) {
  const url = new URL(req.url);
  const c = creds();
  if (url.searchParams.has("status")) return json({ ready: !!c });
  if (!c) return json({ error: "not-configured" }, 503);
  const id = url.searchParams.get("id") || "";
  if (!ID.test(id)) return json({ error: "bad-id" }, 400);
  const key = "iris:sync:" + id;
  try {
    if (req.method === "GET") {
      const since = url.searchParams.get("since") || "";
      let rev = +(await redis(c, ["GET", key + ":rev"])) || 0;
      if (!rev) {
        // A library saved before the two-key layout.
        const [old, oldData] = (await redis(c, ["HMGET", key, "rev", "data"])) || [];
        rev = +old || 0;
        if (!rev) return json({ rev: 0 });
        return json(since === String(rev) ? { rev, same: true } : { rev, data: oldData });
      }
      if (since === String(rev)) return json({ rev, same: true });
      return json({ rev, data: await redis(c, ["GET", key + ":data"]) });
    }
    if (req.method === "POST") {
      const body = await req.text();
      if (body.length > MAX) return json({ error: "too-big" }, 413);
      let p = null;
      try { p = JSON.parse(body); } catch (err) { /* handled below */ }
      if (!p || typeof p.data !== "string" || !DATA.test(p.data) || !(+p.rev >= 0)) return json({ error: "bad-body" }, 400);
      const [ok, rev] = await redis(c, ["EVAL", WRITE, "3", key + ":rev", key + ":data", key, String(Math.floor(+p.rev)), p.data, TTL]);
      return ok ? json({ rev }) : json({ error: "conflict", rev }, 409);
    }
    return json({ error: "method" }, 405);
  } catch (err) {
    return json({ error: "store", detail: String((err && err.message) || err).slice(0, 160) }, 502);
  }
}
