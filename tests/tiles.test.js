import { describe, expect, it } from "vitest";
import { spiralOrder, tileGrid } from "../src/core/tiles.js";

describe("tileGrid", () => {
  it("covers every pixel exactly once, with smaller tiles at the edges", () => {
    const tiles = tileGrid(130, 70, 64);
    expect(tiles).toHaveLength(3 * 2);
    const covered = new Uint8Array(130 * 70);
    for (const t of tiles)
      for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) covered[y * 130 + x]++;
    expect(covered.every((c) => c === 1)).toBe(true);
    expect(tiles.at(-1)).toMatchObject({ x: 128, y: 64, w: 2, h: 6 });
  });
});

describe("spiralOrder", () => {
  it("starts at the centre and works outwards", () => {
    const tiles = tileGrid(640, 384, 64);
    const order = spiralOrder(tiles, 640, 384);
    expect(order).toHaveLength(tiles.length);
    expect(new Set(order.map((t) => t.index)).size).toBe(tiles.length);
    const dist = (t) => Math.hypot(t.x + 32 - 320, t.y + 32 - 192);
    expect(dist(order[0])).toBeLessThan(80);
    const avg = (list) => list.reduce((s, v) => s + v, 0) / list.length;
    const quarters = [0, 1, 2, 3].map((q) =>
      avg(order.slice((q * order.length) / 4, ((q + 1) * order.length) / 4).map(dist))
    );
    expect(quarters).toEqual([...quarters].sort((a, b) => a - b));
  });
});
