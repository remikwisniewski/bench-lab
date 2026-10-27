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
 * How many times faster all cores are than one.
 * @param {number} multi
 * @param {number} single
 */
export const mpRatio = (multi, single) =>
  multi > 0 && single > 0 ? Math.round((multi / single) * 100) / 100 : NaN;

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
