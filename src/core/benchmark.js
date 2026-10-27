// @ts-check
// The benchmark's fixed settings and how a run becomes a score.

import { median } from "./stats.js";

export const IMAGE = Object.freeze({ width: 1280, height: 720 });
export const TILE_SIZE = 64;
export const SCENE_SEED = 2026;

/**
 * @typedef {"multi" | "single"} TestKind
 * @typedef {{ kind: TestKind, label: string, samples: number }} TestSpec
 */

/** @type {Readonly<Record<TestKind, TestSpec>>} */
export const TESTS = Object.freeze({
  multi: { kind: "multi", label: "CPU (Multi Core)", samples: 256 },
  single: { kind: "single", label: "CPU (Single Core)", samples: 16 },
});

/** Points are rays per second divided by this. */
export const POINTS_DIVISOR = 10_000;

/**
 * @param {number} rays
 * @param {number} seconds
 */
export function points(rays, seconds) {
  if (!(rays > 0) || !(seconds > 0)) return 0;
  return Math.round(rays / seconds / POINTS_DIVISOR);
}

/**
 * Where a score sits among the hardware standards, in plain words:
 * "Like a Gaming PC", "Between a Gaming PC and a High-end PC",
 * "Below an Everyday PC" or "Beyond a Workstation".
 * @param {number} score
 * @param {readonly { name: string, multi: number, single: number }[]} standards
 * @param {TestKind} test
 */
export function hardwareClass(score, standards, test) {
  if (!(score > 0) || standards.length === 0) return null;
  const tiers = [...standards]
    .map((s) => ({ name: s.name, points: s[test] }))
    .sort((a, b) => a.points - b.points);
  const article = (/** @type {string} */ name) => (/^[AEIOU]/i.test(name) ? `an ${name}` : `a ${name}`);
  // Within 8% of a standard counts as matching it.
  const close = tiers.find((t) => Math.abs(score / t.points - 1) <= 0.08);
  if (close) return { label: `Like ${article(close.name)}`, tier: close.name };
  if (score < tiers[0].points) return { label: `Below ${article(tiers[0].name)}`, tier: null };
  const top = tiers[tiers.length - 1];
  if (score > top.points) return { label: `Beyond ${article(top.name)}`, tier: top.name };
  const upper = /** @type {{ name: string, points: number }} */ (tiers.find((t) => t.points > score));
  const lower = tiers[tiers.indexOf(upper) - 1];
  return { label: `Between ${article(lower.name)} and ${article(upper.name)}`, tier: lower.name };
}

/**
 * Share of the image finished, from 0 to 1.
 * @param {number} done tiles finished
 * @param {number} total tiles in the image
 */
export const progress = (done, total) => (total > 0 ? Math.min(1, done / total) : 0);

/**
 * Seconds until the test ends, judged from progress so far.
 * @param {number} elapsed seconds
 * @param {number} fraction 0–1
 */
export function remaining(elapsed, fraction) {
  if (!(fraction > 0)) return NaN;
  return Math.max(0, (elapsed * (1 - fraction)) / fraction);
}

/**
 * A stability run repeats the multi-core test. Like a long burn-in on a test
 * bench, the question is whether the score holds up once the chip is hot.
 * @param {number[]} passes points per pass, in order
 */
export function stability(passes) {
  if (passes.length === 0) return null;
  const first = passes[0];
  const last = passes[passes.length - 1];
  const best = Math.max(...passes);
  const worst = Math.min(...passes);
  const drop = best > 0 ? ((best - last) / best) * 100 : 0;
  return {
    passes: passes.length,
    score: median(passes),
    first,
    last,
    best,
    worst,
    dropPercent: Math.round(drop * 10) / 10,
    // Under 5% from best to last is a steady machine; beyond 15% it is clearly throttling.
    verdict: drop < 5 ? "steady" : drop < 15 ? "some throttling" : "heavy throttling",
  };
}

/**
 * @param {number} seconds
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "–";
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}
