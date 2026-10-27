// Leaderboard logic, independent of HTTP and of which store backs it.
//
// Keys:
//   scores:<test>   every accepted result, for totals and percentiles
//   best:<test>     each device's best score, for the ranking list
//   devices         device key → { label, detail } as JSON
//   rate:<ip>:<hour> submissions per visitor per hour

import { createHash, randomUUID } from "node:crypto";
import { deviceLabel } from "../../src/core/device.js";
import { validateResult } from "../../src/core/result.js";

export const RATE_LIMIT_PER_HOUR = 30;
export const RANKING_SIZE = 12;

/** @param {string} ip @param {string} salt */
export const hashIp = (ip, salt) => createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);

/** @param {import("../../src/core/result.js").Result} r */
export function deviceKey(r) {
  return [deviceLabel(r).toLowerCase(), r.threads, (r.os ?? "").toLowerCase()].join("|");
}

/** @param {import("../../src/core/result.js").Result} r */
export function deviceDetail(r) {
  const threads = r.test === "single" ? "1 thread" : `${r.threads} threads`;
  const where = [r.browser, r.os && `on ${r.os}`].filter(Boolean).join(" ");
  return [threads, r.gpu, where].filter(Boolean).join(" · ");
}

/**
 * @param {import("./store.js").Store} store
 * @param {unknown} body
 * @param {{ ipHash: string, now?: number }} who
 */
export async function submit(store, body, { ipHash, now = Date.now() }) {
  const checked = validateResult(body);
  if (!checked.ok) return { status: 400, body: { errors: checked.errors } };
  const result = checked.result;

  const hour = Math.floor(now / 3_600_000);
  const count = await store.incrWithExpiry(`rate:${ipHash}:${hour}`, 3600);
  if (count > RATE_LIMIT_PER_HOUR) return { status: 429, body: { errors: ["Too many results this hour"] } };

  const id = randomUUID();
  const key = deviceKey(result);
  await store.zadd(`scores:${result.test}`, result.points, id);
  await store.zadd(`best:${result.test}`, result.points, key, true);
  await store.hset(
    "devices",
    key,
    JSON.stringify({ label: deviceLabel(result), detail: deviceDetail(result) })
  );

  const total = await store.zcard(`scores:${result.test}`);
  const below = await store.zcount(`scores:${result.test}`, "-inf", `(${result.points}`);
  const above = await store.zcount(`scores:${result.test}`, `(${result.points}`, "+inf");
  return {
    status: 201,
    body: { rank: above + 1, total, percentile: Math.round((below / total) * 1000) / 10 },
  };
}

/**
 * @param {string | null} raw
 * @returns {{ label?: string, detail?: string }}
 */
function parseDevice(raw) {
  try {
    return JSON.parse(raw ?? "{}");
  } catch {
    return {};
  }
}

/**
 * @param {import("./store.js").Store} store
 * @param {string | null} test
 */
export async function ranking(store, test) {
  if (test !== "multi" && test !== "single")
    return { status: 400, body: { errors: ["test must be multi or single"] } };
  const top = await store.topWithScores(`best:${test}`, RANKING_SIZE);
  const info = await store.hmget(
    "devices",
    top.map((t) => t.member)
  );
  const entries = top.map((t, i) => {
    const meta = parseDevice(info[i]);
    return { label: meta.label ?? "Unknown device", detail: meta.detail ?? "", points: t.score };
  });
  return { status: 200, body: { entries, total: await store.zcard(`scores:${test}`) } };
}
