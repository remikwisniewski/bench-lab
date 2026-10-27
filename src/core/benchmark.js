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

/** The dial's default full scale for each test, in points. */
export const DIAL_MAX = Object.freeze({ multi: 12_000, single: 600 });

/**
 * A rev-counter style scale for a score: numbered marks from zero to full scale
 * ("×1000 pts" for multi-core, "×100 pts" for single-core), and where the
 * needle points. Full scale grows when a machine goes past it, so the needle
 * never pins against the stop.
 * @param {number} score
 * @param {TestKind} test
 */
export function dialScale(score, test) {
  const unit = test === "multi" ? 1000 : 100;
  const base = DIAL_MAX[test];
  const wanted = score > base / 1.1 ? score * 1.1 : base;
  // At most a dozen numbers round the dial, and full scale lands on one of them.
  const step = unit * Math.max(1, Math.ceil(wanted / unit / 12));
  const max = Math.ceil(wanted / step) * step;
  const marks = [];
  for (let value = 0; value <= max; value += step)
    marks.push({ label: String(value / unit), at: value / max });
  return {
    max,
    marks,
    unitLabel: `×${unit.toLocaleString("en-US")} pts`,
    position: score > 0 ? Math.min(1, score / max) : 0,
  };
}

/**
 * The score as the measurement behind it: millions of rays traced per second.
 * @param {number} score
 */
export const millionRaysPerSecond = (score) =>
  score > 0 ? Math.round((score * POINTS_DIVISOR) / 1e5) / 10 : 0;

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
