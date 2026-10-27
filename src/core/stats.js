// @ts-check
// Small statistics helpers.

/** @param {number[]} values */
export function median(values) {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** @param {number[]} values */
export const mean = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : NaN);

/**
 * Percentile rank: the share of `values` strictly below `value`, plus half of the ties.
 * @param {number[]} values
 * @param {number} value
 */
export function percentileRank(values, value) {
  if (values.length === 0) return NaN;
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  return ((below + equal / 2) / values.length) * 100;
}

/**
 * A running sensor reading: current, minimum, maximum and average, like a
 * hardware monitor's columns.
 */
export function createReading() {
  let current = NaN;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  return {
    /** @param {number} value */
    push(value) {
      if (!Number.isFinite(value)) return;
      current = value;
      min = Math.min(min, value);
      max = Math.max(max, value);
      sum += value;
      count++;
    },
    reset() {
      current = NaN;
      min = Infinity;
      max = -Infinity;
      sum = 0;
      count = 0;
    },
    get current() {
      return current;
    },
    get min() {
      return count ? min : NaN;
    },
    get max() {
      return count ? max : NaN;
    },
    get average() {
      return count ? sum / count : NaN;
    },
    get count() {
      return count;
    },
  };
}
