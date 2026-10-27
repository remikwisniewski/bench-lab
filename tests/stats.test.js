import { describe, expect, it } from "vitest";
import { createReading, mean, median, percentileRank } from "../src/core/stats.js";

describe("median and mean", () => {
  it("handles odd, even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([])).toBeNaN();
  });
});

describe("percentileRank", () => {
  it("counts values below and half the ties", () => {
    expect(percentileRank([1, 2, 3, 4], 3)).toBe(62.5);
    expect(percentileRank([1, 2, 3, 4], 10)).toBe(100);
    expect(percentileRank([1, 2, 3, 4], 0)).toBe(0);
    expect(percentileRank([], 1)).toBeNaN();
  });
});

describe("createReading", () => {
  it("tracks current, minimum, maximum and average like a sensor", () => {
    const r = createReading();
    expect(r.current).toBeNaN();
    expect(r.min).toBeNaN();
    for (const v of [5, 2, 8, Number.NaN, 5]) r.push(v);
    expect(r.current).toBe(5);
    expect(r.min).toBe(2);
    expect(r.max).toBe(8);
    expect(r.average).toBe(5);
    expect(r.count).toBe(4);
    r.reset();
    expect(r.count).toBe(0);
    expect(r.average).toBeNaN();
    expect(r.max).toBeNaN();
  });
});
