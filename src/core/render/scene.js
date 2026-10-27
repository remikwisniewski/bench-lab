// @ts-check
// The benchmark scene: a still life of glass, chrome and matte spheres on a
// checkered floor at golden hour. It is generated from a fixed seed, so every
// device renders exactly the same image and does exactly the same work.

/** Material kinds. */
export const DIFFUSE = 0;
export const METAL = 1;
export const GLASS = 2;
export const EMISSIVE = 3;

/**
 * @typedef {object} Scene
 * @property {Float64Array} spheres   x, y, z, radius per sphere (stride 4)
 * @property {Int32Array} sphereMaterial
 * @property {Float64Array} materials kind, r, g, b, param per material (stride 5)
 * @property {number} sphereCount
 * @property {Camera} camera
 * @property {Sun} sun
 */

/**
 * @typedef {object} Camera
 * @property {number[]} from
 * @property {number[]} at
 * @property {number} fov       vertical field of view in degrees
 * @property {number} aperture  lens diameter, for depth of field
 * @property {number} focus     focus distance
 */

/** @typedef {{ dir: number[], color: number[], cosAngle: number }} Sun */

/**
 * A tiny deterministic generator used only to lay out the scene.
 * @param {number} seed
 */
function layoutRng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** @param {number[]} v */
const normalize = (v) => {
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
};

/**
 * @param {{ seed?: number, smallSpheres?: number }} [options]
 * @returns {Scene}
 */
export function createScene({ seed = 2026, smallSpheres = 140 } = {}) {
  const rng = layoutRng(seed);
  /** @type {number[]} */
  const materials = [];
  /** @type {number[]} */
  const spheres = [];
  /** @type {number[]} */
  const sphereMaterial = [];

  /** @param {number} kind @param {number[]} rgb @param {number} [param] */
  const material = (kind, rgb, param = 0) => {
    materials.push(kind, rgb[0], rgb[1], rgb[2], param);
    return materials.length / 5 - 1;
  };
  /** @param {number} x @param {number} y @param {number} z @param {number} r @param {number} m */
  const sphere = (x, y, z, r, m) => {
    spheres.push(x, y, z, r);
    sphereMaterial.push(m);
  };

  // The heroes: glass in the middle, chrome on the left, terracotta on the right.
  const glass = material(GLASS, [1, 1, 1], 1.5);
  const chrome = material(METAL, [0.92, 0.92, 0.95], 0.02);
  const terracotta = material(DIFFUSE, [0.72, 0.24, 0.11]);
  const bubble = material(GLASS, [1, 1, 1], 1 / 1.5);
  sphere(0, 1, 0, 1, glass);
  sphere(0, 1, 0, -0.92, bubble); // a hollow glass ball: an inner surface facing inwards
  sphere(-2.3, 1, -0.4, 1, chrome);
  sphere(2.3, 1, -0.4, 1, terracotta);

  // A warm lantern behind the group.
  sphere(0.6, 0.35, -2.4, 0.35, material(EMISSIVE, [6, 3.8, 1.6]));

  // A field of small spheres, kept clear of the heroes.
  const palette = [
    [0.05, 0.3, 0.85],
    [0.95, 0.62, 0.05],
    [0.05, 0.55, 0.3],
    [0.8, 0.8, 0.78],
    [0.45, 0.12, 0.7],
    [0.85, 0.12, 0.15],
  ];
  const heroes = [
    [0, 0],
    [-2.3, -0.4],
    [2.3, -0.4],
    [0.6, -2.4],
  ];
  let placed = 0;
  let attempts = 0;
  while (placed < smallSpheres && attempts < smallSpheres * 50) {
    attempts++;
    const r = 0.12 + rng() * 0.16;
    const x = (rng() * 2 - 1) * 9;
    const z = (rng() * 2 - 1) * 7 - 1;
    if (heroes.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 1.35 + r)) continue;
    let clash = false;
    for (let i = 4 * 5; i < spheres.length; i += 4) {
      if (Math.hypot(x - spheres[i], z - spheres[i + 2]) < r + spheres[i + 3] + 0.05) {
        clash = true;
        break;
      }
    }
    if (clash) continue;
    const pick = rng();
    const colour = palette[Math.floor(rng() * palette.length)];
    const m =
      pick < 0.62
        ? material(DIFFUSE, colour)
        : pick < 0.88
          ? material(
              METAL,
              colour.map((c) => 0.5 + c * 0.5),
              rng() * 0.3
            )
          : material(GLASS, [1, 1, 1], 1.5);
    sphere(x, r, z, r, m);
    placed++;
  }

  return {
    spheres: Float64Array.from(spheres),
    sphereMaterial: Int32Array.from(sphereMaterial),
    materials: Float64Array.from(materials),
    sphereCount: sphereMaterial.length,
    camera: { from: [0.6, 2.6, 10.5], at: [0, 0.75, 0], fov: 30, aperture: 0.12, focus: 10.6 },
    sun: {
      dir: normalize([-0.6, 0.32, 0.4]),
      color: [4.4, 3.1, 1.9],
      cosAngle: Math.cos((2.2 * Math.PI) / 180),
    },
  };
}
