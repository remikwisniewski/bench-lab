import { describe, expect, it } from "vitest";
import {
  IMAGE,
  POINTS_DIVISOR,
  TESTS,
  TILE_SIZE,
  formatDuration,
  hardwareClass,
  points,
  progress,
  remaining,
  stability,
} from "../src/core/benchmark.js";
import { STANDARDS } from "../src/data/standards.js";

const standards = STANDARDS;

describe("settings", () => {
  it("renders a 720p image in 64-pixel tiles, multi-core at 16× the single-core samples", () => {
    expect(IMAGE).toEqual({ width: 1280, height: 720 });
    expect(TILE_SIZE).toBe(64);
    expect(TESTS.multi.samples / TESTS.single.samples).toBe(16);
  });
});

describe("points", () => {
  it("is rays per second over the divisor", () => {
    expect(points(POINTS_DIVISOR * 2500 * 10, 10)).toBe(2500);
    expect(points(0, 10)).toBe(0);
    expect(points(100, 0)).toBe(0);
  });
});

describe("hardwareClass", () => {
  const standards = STANDARDS;

  it("names the standard a score matches", () => {
    expect(hardwareClass(3550, standards, "multi")?.label).toBe("Like a Gaming PC");
    expect(hardwareClass(10400, standards, "multi")?.label).toBe("Like a Workstation");
    expect(hardwareClass(330, standards, "single")?.label).toBe("Like an Everyday PC");
  });

  it("places scores between standards, below the first and beyond the last", () => {
    expect(hardwareClass(4600, standards, "multi")?.label).toBe("Between a Gaming PC and a High-end PC");
    expect(hardwareClass(1792, standards, "multi")?.label).toBe("Below an Everyday PC");
    expect(hardwareClass(15000, standards, "multi")?.label).toBe("Beyond a Workstation");
  });

  it("compares single-core scores against single-core standards", () => {
    expect(hardwareClass(470, standards, "single")?.label).toBe("Beyond a High-end PC");
  });

  it("needs a score", () => {
    expect(hardwareClass(0, standards, "multi")).toBeNull();
    expect(hardwareClass(100, [], "multi")).toBeNull();
  });
});

describe("standards", () => {
  it("rise with each class in multi-core", () => {
    const multi = standards.map((s) => s.multi);
    expect(multi).toEqual([...multi].sort((a, b) => a - b));
    expect(new Set(standards.map((s) => s.id)).size).toBe(standards.length);
  });
});

describe("progress and time left", () => {
  it("estimates from the share finished", () => {
    expect(progress(5, 20)).toBe(0.25);
    expect(progress(25, 20)).toBe(1);
    expect(progress(1, 0)).toBe(0);
    expect(remaining(10, 0.25)).toBe(30);
    expect(remaining(10, 1)).toBe(0);
    expect(remaining(10, 0)).toBeNaN();
  });

  it("formats durations as m:ss", () => {
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(5.4)).toBe("0:05");
    expect(formatDuration(Number.NaN)).toBe("–");
  });
});

describe("stability", () => {
  it("calls a flat run steady", () => {
    expect(stability([2800, 2790, 2805, 2795])).toMatchObject({ passes: 4, verdict: "steady", best: 2805 });
  });

  it("measures the drop from best to last and names throttling", () => {
    const s = stability([3000, 2900, 2700, 2550]);
    expect(s?.dropPercent).toBe(15);
    expect(s?.verdict).toBe("heavy throttling");
    expect(stability([3000, 2800])?.verdict).toBe("some throttling");
    expect(s?.score).toBe(2800);
  });

  it("returns null with no passes", () => {
    expect(stability([])).toBeNull();
    expect(stability([0])?.dropPercent).toBe(0);
  });
});
