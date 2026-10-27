import { describe, expect, it } from "vitest";
import { buildBvh } from "../src/core/render/bvh.js";
import { DIFFUSE, EMISSIVE, GLASS, METAL, createScene } from "../src/core/render/scene.js";
import { createTracer, hash32, toByte } from "../src/core/render/tracer.js";

const W = 48;
const H = 27;

function render(tracer, x, y, w, h, spp) {
  const out = new Uint8ClampedArray(w * h * 4);
  const rays = tracer.renderTile(x, y, w, h, spp, out);
  return { out, rays };
}

describe("scene", () => {
  const scene = createScene();

  it("is the same every time", () => {
    expect(createScene()).toEqual(scene);
    expect(createScene({ seed: 7 })).not.toEqual(scene);
  });

  it("has every kind of material and no overlapping small spheres", () => {
    const kinds = new Set();
    for (let m = 0; m < scene.materials.length; m += 5) kinds.add(scene.materials[m]);
    expect([...kinds].sort()).toEqual([DIFFUSE, METAL, GLASS, EMISSIVE].sort());
    expect(scene.sphereCount).toBeGreaterThan(100);
    for (let i = 5; i < scene.sphereCount; i++) {
      for (let j = i + 1; j < scene.sphereCount; j++) {
        const [a, b] = [i * 4, j * 4];
        const d = Math.hypot(
          scene.spheres[a] - scene.spheres[b],
          scene.spheres[a + 2] - scene.spheres[b + 2]
        );
        expect(d).toBeGreaterThan(scene.spheres[a + 3] + scene.spheres[b + 3]);
      }
    }
  });

  it("can be built smaller for quick tests", () => {
    expect(createScene({ smallSpheres: 3 }).sphereCount).toBe(5 + 3);
  });
});

describe("bvh", () => {
  it("puts every sphere in exactly one leaf, inside its box", () => {
    const scene = createScene();
    const bvh = buildBvh(scene.spheres, scene.sphereCount);
    const seen = new Uint8Array(scene.sphereCount);
    for (let n = 0; n < bvh.nodeCount; n++) {
      if (bvh.nodes[n * 3] !== -1) continue;
      const first = bvh.nodes[n * 3 + 1];
      for (let k = first; k < first + bvh.nodes[n * 3 + 2]; k++) {
        const s = bvh.items[k];
        seen[s]++;
        const r = Math.abs(scene.spheres[s * 4 + 3]);
        for (let axis = 0; axis < 3; axis++) {
          expect(scene.spheres[s * 4 + axis] - r).toBeGreaterThanOrEqual(bvh.bounds[n * 6 + axis] - 1e-9);
          expect(scene.spheres[s * 4 + axis] + r).toBeLessThanOrEqual(bvh.bounds[n * 6 + 3 + axis] + 1e-9);
        }
      }
    }
    expect(seen.every((c) => c === 1)).toBe(true);
  });

  it("handles an empty scene", () => {
    expect(buildBvh(new Float64Array(0), 0).nodeCount).toBe(0);
  });
});

describe("tracer", () => {
  const scene = createScene();

  it("renders the same pixels and ray count every time", () => {
    const a = render(createTracer(scene, { width: W, height: H }), 0, 0, W, H, 2);
    const b = render(createTracer(scene, { width: W, height: H }), 0, 0, W, H, 2);
    expect(a.rays).toBe(b.rays);
    expect(a.out).toEqual(b.out);
  });

  it("gives the same image whether rendered whole or in tiles, in any order", () => {
    const tracer = createTracer(scene, { width: W, height: H });
    const whole = render(tracer, 0, 0, W, H, 2);
    const stitched = new Uint8ClampedArray(W * H * 4);
    let rays = 0;
    for (const [x, y, w, h] of [
      [24, 13, 24, 14],
      [0, 0, 24, 13],
      [24, 0, 24, 13],
      [0, 13, 24, 14],
    ]) {
      const tile = render(tracer, x, y, w, h, 2);
      rays += tile.rays;
      for (let row = 0; row < h; row++)
        stitched.set(tile.out.subarray(row * w * 4, (row + 1) * w * 4), ((y + row) * W + x) * 4);
    }
    expect(stitched).toEqual(whole.out);
    expect(rays).toBe(whole.rays);
  });

  it("traces a few rays per sample and fills every pixel", () => {
    const { out, rays } = render(createTracer(scene, { width: W, height: H }), 0, 0, W, H, 2);
    const perSample = rays / (W * H * 2);
    expect(perSample).toBeGreaterThan(1.5);
    expect(perSample).toBeLessThan(8);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });

  it("draws a brighter sky than floor shadows", () => {
    const { out } = render(createTracer(scene, { width: W, height: H }), 0, 0, W, H, 4);
    const lum = (x, y) => out[(y * W + x) * 4] + out[(y * W + x) * 4 + 1] + out[(y * W + x) * 4 + 2];
    expect(lum(2, 1)).toBeGreaterThan(200);
    let darkest = 765;
    for (let y = H / 2; y < H; y++)
      for (let x = 0; x < W; x++) darkest = Math.min(darkest, lum(x, Math.floor(y)));
    expect(darkest).toBeLessThan(lum(2, 1));
  });

  it("renders with a different seed to a different image", () => {
    const a = render(createTracer(scene, { width: W, height: H, seed: 1 }), 0, 0, W, H, 1);
    const b = render(createTracer(scene, { width: W, height: H, seed: 2 }), 0, 0, W, H, 1);
    expect(a.out).not.toEqual(b.out);
  });
});

describe("helpers", () => {
  it("hashes integers to well-spread unsigned values", () => {
    const values = new Set(Array.from({ length: 1000 }, (_, i) => hash32(i)));
    expect(values.size).toBe(1000);
    for (const v of values) expect(v).toBeGreaterThanOrEqual(0);
  });

  it("tone maps black to 0, keeps order, and saturates bright light", () => {
    expect(toByte(0)).toBe(0);
    expect(toByte(-1)).toBe(0);
    expect(toByte(0.2)).toBeLessThan(toByte(0.5));
    expect(toByte(100)).toBe(255);
  });
});
