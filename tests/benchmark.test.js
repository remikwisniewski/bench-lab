import { describe, expect, it } from "vitest";
import {
  IMAGE,
  POINTS_DIVISOR,
  TESTS,
  TILE_SIZE,
  formatDuration,
  DIAL_MAX,
  dialScale,
  points,
  progress,
  remaining,
  stability,
} from "../src/core/benchmark.js";

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

describe("dialScale", () => {
  it("numbers the multi-core dial in thousands, like a rev counter", () => {
    const dial = dialScale(1792, "multi");
    expect(dial.max).toBe(DIAL_MAX.multi);
    expect(dial.unitLabel).toBe("×1,000 pts");
    expect(dial.marks.map((m) => m.label)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
    ]);
    expect(dial.position).toBeCloseTo(1792 / 12000, 5);
  });

  it("numbers the single-core dial in hundreds", () => {
    const dial = dialScale(235, "single");
    expect(dial.unitLabel).toBe("×100 pts");
    expect(dial.marks.map((m) => m.label)).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
  });

  it("extends the scale for a machine past full scale", () => {
    const dial = dialScale(30000, "multi");
    expect(dial.max).toBeGreaterThanOrEqual(33000);
    expect(dial.position).toBeLessThan(1);
    expect(dial.marks.length).toBeLessThanOrEqual(13);
    expect(dial.marks.at(-1)?.at).toBe(1);
  });

  it("rests at zero with no score", () => {
    expect(dialScale(0, "multi").position).toBe(0);
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
