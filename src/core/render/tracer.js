// @ts-check
// A small, fast path tracer. It is the benchmark: every device runs exactly this
// code on exactly this scene, and the score is how many rays per second it traces.
//
// Written for speed in plain JavaScript: no objects are created per ray, vectors
// are spelled out as numbers, and the scene lives in typed arrays. Every pixel
// has its own seeded random stream, so the image is identical on every device
// and in every tile order, and so is the number of rays traced.

import { buildBvh } from "./bvh.js";
import { DIFFUSE, EMISSIVE, METAL } from "./scene.js";

/** @typedef {import("./scene.js").Scene} Scene */

const MAX_DEPTH = 8;
const T_MIN = 1e-4;
const FLOOR = -2;
const NONE = -1;
const EXPOSURE = 0.62;
/** Caps one path's brightness, so rare paths through glass to the sun can't speckle the image. */
const FIREFLY_CLAMP = 12;

/**
 * Integer hash (Wang/Jenkins style) for seeding each pixel's random stream.
 * @param {number} a
 */
export function hash32(a) {
  a = a ^ 61 ^ (a >>> 16);
  a = (a + (a << 3)) | 0;
  a ^= a >>> 4;
  a = Math.imul(a, 0x27d4eb2d);
  a ^= a >>> 15;
  return a >>> 0;
}

/**
 * Exposure, a filmic tone curve (Narkowicz's ACES fit) and gamma, to 0–255.
 * @param {number} linear radiance
 */
export function toByte(linear) {
  if (!(linear > 0)) return 0;
  const x = linear * EXPOSURE;
  const v = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  const clamped = v < 0 ? 0 : v > 1 ? 1 : v;
  return Math.round(Math.pow(clamped, 1 / 2.2) * 255);
}

/**
 * @param {Scene} scene
 * @param {{ width: number, height: number, seed?: number }} frame
 */
export function createTracer(scene, { width, height, seed = 1 }) {
  const { spheres, sphereMaterial, materials, sun } = scene;
  const bvh = buildBvh(spheres, scene.sphereCount);
  const { bounds, nodes, items } = bvh;
  const stack = new Int32Array(64);
  const seedHash = hash32(seed);

  // ---- Camera ----
  const cam = scene.camera;
  const [fx, fy, fz] = cam.from;
  let wx = fx - cam.at[0];
  let wy = fy - cam.at[1];
  let wz = fz - cam.at[2];
  const wl = Math.hypot(wx, wy, wz);
  wx /= wl;
  wy /= wl;
  wz /= wl;
  // u = up × w, with up = (0, 1, 0)
  let ux = wz;
  const uy = 0;
  let uz = -wx;
  const ul = Math.hypot(ux, uy, uz);
  ux /= ul;
  uz /= ul;
  const vx = wy * uz - wz * uy;
  const vy = wz * ux - wx * uz;
  const vz = wx * uy - wy * ux;
  const viewH = 2 * Math.tan((cam.fov * Math.PI) / 360);
  const viewW = (viewH * width) / height;
  const hx = ux * viewW * cam.focus;
  const hy = uy * viewW * cam.focus;
  const hz = uz * viewW * cam.focus;
  const qx = vx * viewH * cam.focus;
  const qy = vy * viewH * cam.focus;
  const qz = vz * viewH * cam.focus;
  const llx = fx - hx / 2 - qx / 2 - wx * cam.focus;
  const lly = fy - hy / 2 - qy / 2 - wy * cam.focus;
  const llz = fz - hz / 2 - qz / 2 - wz * cam.focus;
  const lensRadius = cam.aperture / 2;

  // ---- Sun ----
  const [sdx, sdy, sdz] = sun.dir;
  const [sr, sg, sb] = sun.color;
  const sunCos = sun.cosAngle;
  const sunRadiance = 1 / (2 * Math.PI * (1 - sunCos));
  // Basis around the sun direction, for sampling its disc.
  let sux = Math.abs(sdx) > 0.9 ? 0 : 1;
  let suy = Math.abs(sdx) > 0.9 ? 1 : 0;
  let suz = 0;
  {
    // sux = normalize(a × sun)
    const cx = suy * sdz - suz * sdy;
    const cy = suz * sdx - sux * sdz;
    const cz = sux * sdy - suy * sdx;
    const cl = Math.hypot(cx, cy, cz);
    sux = cx / cl;
    suy = cy / cl;
    suz = cz / cl;
  }
  const svx = sdy * suz - sdz * suy;
  const svy = sdz * sux - sdx * suz;
  const svz = sdx * suy - sdy * sux;

  // ---- Random numbers: xorshift32, reseeded per pixel ----
  let state = 1;
  const rand = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };

  // ---- Intersection results (shared to avoid allocation) ----
  let hitT = 0;
  let hitIndex = NONE;
  let rays = 0;

  /** Nearest hit along the ray, or false. Sets hitT and hitIndex. */
  function intersect(
    /** @type {number} */ ox,
    /** @type {number} */ oy,
    /** @type {number} */ oz,
    /** @type {number} */ dx,
    /** @type {number} */ dy,
    /** @type {number} */ dz
  ) {
    rays++;
    let best = Infinity;
    hitIndex = NONE;
    // The floor: the plane y = 0.
    if (dy < -1e-9) {
      const t = -oy / dy;
      if (t > T_MIN) {
        best = t;
        hitIndex = FLOOR;
      }
    }
    const ix = 1 / dx;
    const iy = 1 / dy;
    const iz = 1 / dz;
    let sp = 0;
    stack[sp++] = 0;
    while (sp > 0) {
      const node = stack[--sp];
      const b = node * 6;
      // Slab test against the node's box.
      let t0 = (bounds[b] - ox) * ix;
      let t1 = (bounds[b + 3] - ox) * ix;
      let tmin = t0 < t1 ? t0 : t1;
      let tmax = t0 < t1 ? t1 : t0;
      t0 = (bounds[b + 1] - oy) * iy;
      t1 = (bounds[b + 4] - oy) * iy;
      tmin = Math.max(tmin, t0 < t1 ? t0 : t1);
      tmax = Math.min(tmax, t0 < t1 ? t1 : t0);
      t0 = (bounds[b + 2] - oz) * iz;
      t1 = (bounds[b + 5] - oz) * iz;
      tmin = Math.max(tmin, t0 < t1 ? t0 : t1);
      tmax = Math.min(tmax, t0 < t1 ? t1 : t0);
      if (tmax < tmin || tmax < T_MIN || tmin > best) continue;

      const n = node * 3;
      if (nodes[n] === -1) {
        const first = nodes[n + 1];
        const end = first + nodes[n + 2];
        for (let k = first; k < end; k++) {
          const s = items[k];
          const i = s * 4;
          const ocx = ox - spheres[i];
          const ocy = oy - spheres[i + 1];
          const ocz = oz - spheres[i + 2];
          const r = spheres[i + 3];
          const half = ocx * dx + ocy * dy + ocz * dz;
          const c = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
          const disc = half * half - c;
          if (disc < 0) continue;
          const sq = Math.sqrt(disc);
          let t = -half - sq;
          if (t < T_MIN) t = -half + sq;
          if (t > T_MIN && t < best) {
            best = t;
            hitIndex = s;
          }
        }
      } else {
        stack[sp++] = nodes[n];
        stack[sp++] = nodes[n + 1];
      }
    }
    hitT = best;
    return hitIndex !== NONE;
  }

  /** Is anything between the point and the sky in this direction? */
  function occluded(
    /** @type {number} */ ox,
    /** @type {number} */ oy,
    /** @type {number} */ oz,
    /** @type {number} */ dx,
    /** @type {number} */ dy,
    /** @type {number} */ dz
  ) {
    intersect(ox, oy, oz, dx, dy, dz);
    return hitIndex !== NONE;
  }

  // Sky colour for a direction, written to these:
  let skyR = 0;
  let skyG = 0;
  let skyB = 0;
  function sky(
    /** @type {number} */ dx,
    /** @type {number} */ dy,
    /** @type {number} */ dz,
    /** @type {boolean} */ withSun
  ) {
    const t = dy > 0 ? Math.sqrt(dy) : 0;
    skyR = 0.95 * (1 - t) + 0.12 * t;
    skyG = 0.5 * (1 - t) + 0.24 * t;
    skyB = 0.3 * (1 - t) + 0.62 * t;
    const toward = dx * sdx + dy * sdy + dz * sdz;
    if (toward > 0) {
      const glow = Math.pow(toward, 48) * 0.35;
      skyR += sr * glow;
      skyG += sg * glow;
      skyB += sb * glow;
      if (withSun && toward > sunCos) {
        skyR += sr * sunRadiance;
        skyG += sg * sunRadiance;
        skyB += sb * sunRadiance;
      }
    }
  }

  // ---- One camera path ----
  let outR = 0;
  let outG = 0;
  let outB = 0;

  function tracePath(/** @type {number} */ px, /** @type {number} */ py) {
    // Lens and pixel jitter
    /** @type {number} */ let lx;
    /** @type {number} */ let ly;
    do {
      lx = rand() * 2 - 1;
      ly = rand() * 2 - 1;
    } while (lx * lx + ly * ly > 1);
    lx *= lensRadius;
    ly *= lensRadius;
    const s = (px + rand()) / width;
    const t = 1 - (py + rand()) / height;
    let ox = fx + ux * lx + vx * ly;
    let oy = fy + uy * lx + vy * ly;
    let oz = fz + uz * lx + vz * ly;
    let dx = llx + s * hx + t * qx - ox;
    let dy = lly + s * hy + t * qy - oy;
    let dz = llz + s * hz + t * qz - oz;
    let dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
    dx /= dl;
    dy /= dl;
    dz /= dl;

    let tr = 1;
    let tg = 1;
    let tb = 1;
    let r = 0;
    let g = 0;
    let b = 0;
    let lastDiffuse = false;

    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      if (!intersect(ox, oy, oz, dx, dy, dz)) {
        // The sun was already sampled directly after a diffuse bounce.
        sky(dx, dy, dz, !lastDiffuse);
        r += tr * skyR;
        g += tg * skyG;
        b += tb * skyB;
        break;
      }
      const px2 = ox + dx * hitT;
      const py2 = oy + dy * hitT;
      const pz2 = oz + dz * hitT;
      let nx = 0;
      let ny = 1;
      let nz = 0;
      let kind = DIFFUSE;
      /** @type {number} */ let ar;
      /** @type {number} */ let ag;
      /** @type {number} */ let ab;
      let param = 0;
      if (hitIndex === FLOOR) {
        // Checkered floor that fades into the distance
        // Fade to the average grey far away, where the squares would only shimmer.
        const check = (Math.floor(px2 * 1.6) + Math.floor(pz2 * 1.6)) & 1;
        const fade = Math.min(1, hitT / 40);
        const v = (check ? 0.42 : 0.07) * (1 - fade) + 0.2 * fade;
        ar = v;
        ag = v * 0.96;
        ab = v * 0.9;
      } else {
        const i = hitIndex * 4;
        const radius = spheres[i + 3];
        nx = (px2 - spheres[i]) / radius;
        ny = (py2 - spheres[i + 1]) / radius;
        nz = (pz2 - spheres[i + 2]) / radius;
        const m = sphereMaterial[hitIndex] * 5;
        kind = materials[m];
        ar = materials[m + 1];
        ag = materials[m + 2];
        ab = materials[m + 3];
        param = materials[m + 4];
      }

      if (kind === EMISSIVE) {
        r += tr * ar;
        g += tg * ag;
        b += tb * ab;
        break;
      }

      const front = dx * nx + dy * ny + dz * nz < 0;
      if (!front) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }

      if (kind === DIFFUSE) {
        // Direct sunlight: one shadow ray to a random point on the sun's disc.
        /** @type {number} */ let ex;
        /** @type {number} */ let ey;
        do {
          ex = rand() * 2 - 1;
          ey = rand() * 2 - 1;
        } while (ex * ex + ey * ey > 1);
        const spread = Math.sqrt(1 - sunCos * sunCos);
        let lx2 = sdx + (sux * ex + svx * ey) * spread;
        let ly2 = sdy + (suy * ex + svy * ey) * spread;
        let lz2 = sdz + (suz * ex + svz * ey) * spread;
        const ll = Math.sqrt(lx2 * lx2 + ly2 * ly2 + lz2 * lz2);
        lx2 /= ll;
        ly2 /= ll;
        lz2 /= ll;
        const cosL = nx * lx2 + ny * ly2 + nz * lz2;
        if (cosL > 0 && !occluded(px2, py2, pz2, lx2, ly2, lz2)) {
          r += tr * ar * sr * cosL;
          g += tg * ag * sg * cosL;
          b += tb * ab * sb * cosL;
        }
        // Bounce in a cosine-weighted random direction.
        /** @type {number} */ let rx;
        /** @type {number} */ let ry;
        /** @type {number} */ let rz;
        /** @type {number} */ let rl;
        do {
          rx = rand() * 2 - 1;
          ry = rand() * 2 - 1;
          rz = rand() * 2 - 1;
          rl = rx * rx + ry * ry + rz * rz;
        } while (rl > 1 || rl < 1e-6);
        rl = Math.sqrt(rl);
        dx = nx + rx / rl;
        dy = ny + ry / rl;
        dz = nz + rz / rl;
        tr *= ar;
        tg *= ag;
        tb *= ab;
        lastDiffuse = true;
      } else if (kind === METAL) {
        const dn = dx * nx + dy * ny + dz * nz;
        dx -= 2 * dn * nx;
        dy -= 2 * dn * ny;
        dz -= 2 * dn * nz;
        if (param > 0) {
          /** @type {number} */ let rx;
          /** @type {number} */ let ry;
          /** @type {number} */ let rz;
          do {
            rx = rand() * 2 - 1;
            ry = rand() * 2 - 1;
            rz = rand() * 2 - 1;
          } while (rx * rx + ry * ry + rz * rz > 1);
          dx += rx * param;
          dy += ry * param;
          dz += rz * param;
        }
        if (dx * nx + dy * ny + dz * nz <= 0) break;
        tr *= ar;
        tg *= ag;
        tb *= ab;
        lastDiffuse = false;
      } else {
        // GLASS: refract or reflect, chosen by Schlick's approximation.
        const eta = front ? 1 / param : param;
        const cosI = Math.min(-(dx * nx + dy * ny + dz * nz), 1);
        const sin2T = eta * eta * (1 - cosI * cosI);
        let r0 = (1 - eta) / (1 + eta);
        r0 *= r0;
        const reflectance = r0 + (1 - r0) * Math.pow(1 - cosI, 5);
        if (sin2T > 1 || rand() < reflectance) {
          const dn = dx * nx + dy * ny + dz * nz;
          dx -= 2 * dn * nx;
          dy -= 2 * dn * ny;
          dz -= 2 * dn * nz;
        } else {
          const k = eta * cosI - Math.sqrt(1 - sin2T);
          dx = eta * dx + k * nx;
          dy = eta * dy + k * ny;
          dz = eta * dz + k * nz;
        }
        lastDiffuse = false;
      }

      dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
      dx /= dl;
      dy /= dl;
      dz /= dl;
      ox = px2;
      oy = py2;
      oz = pz2;

      // Russian roulette: let dim paths end early, without biasing the image.
      if (depth >= 3) {
        const p = Math.max(0.05, Math.min(0.95, Math.max(tr, tg, tb)));
        if (rand() > p) break;
        tr /= p;
        tg /= p;
        tb /= p;
      }
    }
    const peak = Math.max(r, g, b);
    const scale = peak > FIREFLY_CLAMP ? FIREFLY_CLAMP / peak : 1;
    outR = r * scale;
    outG = g * scale;
    outB = b * scale;
  }

  return {
    width,
    height,
    bvh,
    /**
     * Render one rectangle of the image into `out` (RGBA, w × h), with
     * `samples` paths per pixel. Returns the number of rays traced.
     * @param {number} x0 @param {number} y0 @param {number} w @param {number} h
     * @param {number} samples @param {Uint8ClampedArray} out
     */
    renderTile(x0, y0, w, h, samples, out) {
      rays = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const px = x0 + x;
          const py = y0 + y;
          state = hash32(px + hash32(py + seedHash)) | 1;
          let r = 0;
          let g = 0;
          let b = 0;
          for (let s = 0; s < samples; s++) {
            tracePath(px, py);
            r += outR;
            g += outG;
            b += outB;
          }
          const o = (y * w + x) * 4;
          out[o] = toByte(r / samples);
          out[o + 1] = toByte(g / samples);
          out[o + 2] = toByte(b / samples);
          out[o + 3] = 255;
        }
      }
      return rays;
    },
  };
}
