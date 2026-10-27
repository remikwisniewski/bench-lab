import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RANKING_SIZE,
  RATE_LIMIT_PER_HOUR,
  deviceDetail,
  deviceKey,
  hashIp,
  ranking,
  submit,
} from "../api/_lib/leaderboard.js";
import { createMemoryStore, createUpstashStore, storeFromEnv } from "../api/_lib/store.js";
import { POST } from "../api/results.js";
import { GET } from "../api/ranking.js";

const result = (points, extra = {}) => ({
  test: "multi",
  points,
  seconds: 40,
  threads: 16,
  os: "Linux",
  browser: "Chrome 152",
  ...extra,
});

describe("submit", () => {
  it("stores a result and reports its rank and percentile", async () => {
    const store = createMemoryStore();
    for (const [i, p] of [1000, 2000, 3000].entries()) {
      await submit(store, result(p, { cpuName: `CPU ${i}` }), { ipHash: "a" });
    }
    const out = await submit(store, result(2500, { cpuName: "Mine" }), { ipHash: "a" });
    expect(out.status).toBe(201);
    expect(out.body).toEqual({ rank: 2, total: 4, percentile: 50 });
  });

  it("rejects invalid and implausible results", async () => {
    const store = createMemoryStore();
    expect((await submit(store, { test: "multi" }, { ipHash: "a" })).status).toBe(400);
    expect((await submit(store, result(99_999), { ipHash: "a" })).status).toBe(400);
  });

  it("limits how many results one visitor can send an hour", async () => {
    const store = createMemoryStore();
    const now = Date.UTC(2026, 9, 26, 12);
    for (let i = 0; i < RATE_LIMIT_PER_HOUR; i++) {
      expect((await submit(store, result(1000 + i), { ipHash: "busy", now })).status).toBe(201);
    }
    expect((await submit(store, result(5000), { ipHash: "busy", now })).status).toBe(429);
    expect((await submit(store, result(5000), { ipHash: "other", now })).status).toBe(201);
    expect((await submit(store, result(5000), { ipHash: "busy", now: now + 3_600_000 })).status).toBe(201);
  });
});

describe("ranking", () => {
  it("lists each device once, at its best score, highest first", async () => {
    const store = createMemoryStore();
    await submit(store, result(1800, { cpuName: "Intel Core i9-9900K" }), { ipHash: "a" });
    await submit(store, result(1700, { cpuName: "Intel Core i9-9900K" }), { ipHash: "a" });
    await submit(store, result(2400, { cpuName: "AMD Ryzen 7 7800X3D" }), { ipHash: "b" });
    const out = await ranking(store, "multi");
    expect(out.status).toBe(200);
    expect(out.body.total).toBe(3);
    expect(out.body.entries.map((e) => [e.label, e.points])).toEqual([
      ["AMD Ryzen 7 7800X3D", 2400],
      ["Intel Core i9-9900K", 1800],
    ]);
    expect(out.body.entries[1].detail).toBe("16 threads · Chrome 152 on Linux");
  });

  it("keeps multi and single separate and caps the list", async () => {
    const store = createMemoryStore();
    for (let i = 0; i < RANKING_SIZE + 5; i++)
      await submit(store, result(1000 + i, { cpuName: `CPU ${i}` }), { ipHash: `ip${i}` });
    await submit(store, result(250, { test: "single", cpuName: "Solo" }), { ipHash: "z" });
    expect((await ranking(store, "multi")).body.entries).toHaveLength(RANKING_SIZE);
    expect((await ranking(store, "single")).body.entries.map((e) => e.label)).toEqual(["Solo"]);
    expect((await ranking(store, "gpu")).status).toBe(400);
  });

  it("survives a damaged device record", async () => {
    const store = createMemoryStore();
    await store.zadd("best:multi", 100, "ghost");
    await store.hset("devices", "ghost", "{not json");
    expect((await ranking(store, "multi")).body.entries[0]).toEqual({
      label: "Unknown device",
      detail: "",
      points: 100,
    });
  });
});

describe("helpers", () => {
  it("hashes IPs with a salt and never returns the IP", () => {
    expect(hashIp("1.2.3.4", "s")).toHaveLength(32);
    expect(hashIp("1.2.3.4", "s")).not.toBe(hashIp("1.2.3.4", "t"));
    expect(hashIp("1.2.3.4", "s")).not.toContain("1.2.3.4");
  });

  it("builds device keys and details", () => {
    const r = { test: "single", points: 200, seconds: 20, threads: 8, os: "macOS", gpu: "Apple M2" };
    expect(deviceKey(r)).toBe("apple m2 · 8 threads|8|macos");
    expect(deviceDetail(r)).toBe("1 thread · Apple M2 · on macOS");
  });
});

describe("Upstash store", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends Redis commands as one authenticated pipeline", async () => {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        const command = JSON.parse(init.body)[0][0];
        const result =
          command === "ZRANGE"
            ? ["a", "300", "b", "200"]
            : command === "HMGET"
              ? ["x", null]
              : command === "INCR"
                ? 3
                : 1;
        return new Response(JSON.stringify(JSON.parse(init.body).map(() => ({ result }))));
      })
    );
    const store = createUpstashStore("https://db.example", "secret");
    await store.zadd("k", 5, "m", true);
    expect(await store.topWithScores("k", 2)).toEqual([
      { member: "a", score: 300 },
      { member: "b", score: 200 },
    ]);
    expect(await store.hmget("h", ["x", "y"])).toEqual(["x", null]);
    expect(await store.hmget("h", [])).toEqual([]);
    expect(await store.incrWithExpiry("r", 60)).toBe(3);
    expect(await store.zcard("k")).toBe(1);
    expect(await store.zcount("k", "-inf", "+inf")).toBe(1);
    await store.hset("h", "f", "v");
    expect(calls[0].url).toBe("https://db.example/pipeline");
    expect(calls[0].init.headers.authorization).toBe("Bearer secret");
    expect(calls[0].body).toEqual([["ZADD", "k", "GT", 5, "m"]]);
    expect(calls.find((c) => c.body[0][0] === "INCR").body[1]).toEqual(["EXPIRE", "r", 60, "NX"]);
  });

  it("raises store errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 }))
    );
    await expect(createUpstashStore("https://db", "t").zcard("k")).rejects.toThrow("Store error 500");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([{ error: "WRONGTYPE" }])))
    );
    await expect(createUpstashStore("https://db", "t").zcard("k")).rejects.toThrow("WRONGTYPE");
  });

  it("is only used when credentials are configured", () => {
    expect(storeFromEnv({})).toBeNull();
    expect(storeFromEnv({ KV_REST_API_URL: "https://x", KV_REST_API_TOKEN: "t" })).not.toBeNull();
    expect(
      storeFromEnv({ UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" })
    ).not.toBeNull();
  });
});

describe("endpoints without a database", () => {
  it("answer 503 so the page falls back to reference runs", async () => {
    const env = { ...process.env };
    delete process.env.KV_REST_API_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    const post = await POST(new Request("https://x/api/results", { method: "POST", body: "{}" }));
    const get = await GET(new Request("https://x/api/ranking?test=multi"));
    expect(post.status).toBe(503);
    expect(get.status).toBe(503);
    process.env = env;
  });
});
