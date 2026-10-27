// The few Redis commands the leaderboard needs, behind one small interface:
// Upstash's REST API in production, and an in-memory version for tests and
// local development.

/**
 * @typedef {object} Store
 * @property {(key: string, score: number, member: string, onlyIfGreater?: boolean) => Promise<void>} zadd
 * @property {(key: string) => Promise<number>} zcard
 * @property {(key: string, min: string, max: string) => Promise<number>} zcount
 * @property {(key: string, count: number) => Promise<{ member: string, score: number }[]>} topWithScores
 * @property {(key: string, field: string, value: string) => Promise<void>} hset
 * @property {(key: string, fields: string[]) => Promise<(string | null)[]>} hmget
 * @property {(key: string, seconds: number) => Promise<number>} incrWithExpiry
 */

/** @returns {Store} */
export function createMemoryStore() {
  /** @type {Map<string, Map<string, number>>} */
  const zsets = new Map();
  /** @type {Map<string, Map<string, string>>} */
  const hashes = new Map();
  /** @type {Map<string, number>} */
  const counters = new Map();
  const zset = (/** @type {string} */ key) => zsets.get(key) ?? zsets.set(key, new Map()).get(key);
  /** @param {string} bound */
  const test = (bound, isMin) => {
    if (bound === "-inf") return () => true;
    if (bound === "+inf") return () => true;
    const open = bound.startsWith("(");
    const value = Number(open ? bound.slice(1) : bound);
    return isMin ? (v) => (open ? v > value : v >= value) : (v) => (open ? v < value : v <= value);
  };
  return {
    async zadd(key, score, member, onlyIfGreater = false) {
      const set = /** @type {Map<string, number>} */ (zset(key));
      const old = set.get(member);
      if (!onlyIfGreater || old === undefined || score > old) set.set(member, score);
    },
    async zcard(key) {
      return zsets.get(key)?.size ?? 0;
    },
    async zcount(key, min, max) {
      const lo = test(min, true);
      const hi = test(max, false);
      return [...(zsets.get(key)?.values() ?? [])].filter((v) => lo(v) && hi(v)).length;
    },
    async topWithScores(key, count) {
      return [...(zsets.get(key)?.entries() ?? [])]
        .map(([member, score]) => ({ member, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, count);
    },
    async hset(key, field, value) {
      (hashes.get(key) ?? hashes.set(key, new Map()).get(key))?.set(field, value);
    },
    async hmget(key, fields) {
      return fields.map((f) => hashes.get(key)?.get(f) ?? null);
    },
    async incrWithExpiry(key) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
  };
}

/**
 * Upstash Redis over its REST API. No SDK: one fetch per pipeline.
 * @param {string} url
 * @param {string} token
 * @returns {Store}
 */
export function createUpstashStore(url, token) {
  /** @param {(string | number)[][]} commands */
  async function pipeline(commands) {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`Store error ${res.status}`);
    const results = await res.json();
    const failed = results.find((/** @type {{ error?: string }} */ r) => r.error);
    if (failed) throw new Error(failed.error);
    return results.map((/** @type {{ result: unknown }} */ r) => r.result);
  }
  return {
    async zadd(key, score, member, onlyIfGreater = false) {
      await pipeline([onlyIfGreater ? ["ZADD", key, "GT", score, member] : ["ZADD", key, score, member]]);
    },
    async zcard(key) {
      return Number((await pipeline([["ZCARD", key]]))[0]);
    },
    async zcount(key, min, max) {
      return Number((await pipeline([["ZCOUNT", key, min, max]]))[0]);
    },
    async topWithScores(key, count) {
      const flat = /** @type {string[]} */ (
        (await pipeline([["ZRANGE", key, 0, count - 1, "REV", "WITHSCORES"]]))[0]
      );
      const out = [];
      for (let i = 0; i < flat.length; i += 2) out.push({ member: flat[i], score: Number(flat[i + 1]) });
      return out;
    },
    async hset(key, field, value) {
      await pipeline([["HSET", key, field, value]]);
    },
    async hmget(key, fields) {
      if (fields.length === 0) return [];
      return /** @type {(string | null)[]} */ ((await pipeline([["HMGET", key, ...fields]]))[0]);
    },
    async incrWithExpiry(key, seconds) {
      const [count] = await pipeline([
        ["INCR", key],
        ["EXPIRE", key, seconds, "NX"],
      ]);
      return Number(count);
    },
  };
}

/** The store for this deployment, or null when no database is connected yet. */
export function storeFromEnv(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? createUpstashStore(url, token) : null;
}
