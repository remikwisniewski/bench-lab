// @ts-check
// Guessing hardware from timing. Browsers hide the CPU model, but a CPU's cache
// sizes and core count show up in how fast memory reads and parallel work run.
// These functions turn raw measurements into those numbers, then match them
// against a table of real CPU specifications.

/** @typedef {{ bytes: number, ns: number }} LatencyPoint */
/** @typedef {{ sizeBytes: number, latencyNs: number }} CacheLevel */

/**
 * Snaps a measured size to the nearest size a cache is actually built in:
 * 2ⁿ, 1.25 × 2ⁿ, 1.5 × 2ⁿ or 1.75 × 2ⁿ bytes (e.g. 32 KB, 1.25 MB, 12 MB, 96 MB).
 * @param {number} bytes
 */
export function niceCacheSize(bytes) {
  if (!(bytes > 0)) return 0;
  const exp = Math.floor(Math.log2(bytes));
  let best = 2 ** exp;
  for (const e of [exp - 1, exp, exp + 1]) {
    for (const m of [1, 1.25, 1.5, 1.75]) {
      const size = m * 2 ** e;
      if (Math.abs(Math.log2(size / bytes)) < Math.abs(Math.log2(best / bytes))) best = size;
    }
  }
  return best;
}

/** Sizes caches ship in, by level. L2 is per core (Apple: per cluster). */
export const L1_SIZES_KB = Object.freeze([16, 32, 48, 64, 128, 192]);
export const L2_SIZES_KB = Object.freeze([256, 512, 1024, 1280, 2048, 2560, 3072, 12288, 16384]);
export const LAST_LEVEL_SIZES_MB = Object.freeze([
  2, 3, 4, 6, 8, 9, 12, 16, 18, 20, 24, 25, 30, 32, 33, 36, 48, 64, 96, 128,
]);

const PRIVATE_SIZES_KB = Object.freeze([...new Set([...L1_SIZES_KB, ...L2_SIZES_KB])]);

/** @param {number} bytes @param {readonly number[]} sizes @param {number} unit */
const snap = (bytes, sizes, unit) => {
  let best = sizes[0];
  for (const size of sizes)
    if (Math.abs(Math.log2((size * unit) / bytes)) < Math.abs(Math.log2((best * unit) / bytes))) best = size;
  return best * unit;
};

/** @param {number} bytes */
export const nearestLastLevel = (bytes) => snap(bytes, LAST_LEVEL_SIZES_MB, 1024 * 1024);

/**
 * Finds the cache levels in a latency curve: time per random read against the
 * amount of data read from. Reads are quick while the data fits in a cache and
 * climb when it spills into the next level.
 *
 * Real curves are noisy and climb gradually, so the curve is smoothed first and
 * a climb is any run of half-octave steps where latency rises by more than
 * 16% each, adding up to at least 57%. Some climbs are steep (L1 to L2) and
 * some are gradual over a couple of octaves (L2 to L3 on Intel), while the
 * flat stretches inside a level rise only a few percent. Each level's size is where latency crosses halfway
 * (on a log scale) between that level and the next, snapped to the sizes caches
 * really come in. A large shared last-level cache loses random reads well before
 * it is full, crossing halfway at about half its size, so that size is doubled.
 * @param {LatencyPoint[]} points
 * @returns {{ levels: CacheLevel[], memoryNs: number }}
 */
export function detectCacheLevels(points) {
  const sorted = [...points].filter((p) => p.ns > 0 && p.bytes > 0).sort((a, b) => a.bytes - b.bytes);
  if (sorted.length < 6) return { levels: [], memoryNs: NaN };
  // Three-point median filter: one jumpy reading can't fake a level.
  const ns = sorted.map((p, i) => {
    const window = [sorted[Math.max(0, i - 1)].ns, p.ns, sorted[Math.min(sorted.length - 1, i + 1)].ns];
    return window.sort((a, b) => a - b)[1];
  });
  const tail = ns.slice(-5).sort((a, b) => a - b);
  const memoryNs = tail[2];

  /** @type {{ start: number, end: number }[]} */
  const climbs = [];
  for (let i = 0; i + 2 < ns.length; i++) {
    if (Math.log(ns[i + 2] / ns[i]) <= 0.15) continue;
    let end = i + 2;
    while (end + 1 < ns.length && Math.log(ns[end + 1] / ns[end - 1]) > 0.15) end++;
    if (Math.log(ns[end] / ns[i]) >= 0.45) climbs.push({ start: i, end });
    i = end - 1;
  }
  if (climbs.length === 0) return { levels: [], memoryNs };

  /** @param {number} a @param {number} b */
  const plateau = (a, b) => {
    const slice = ns.slice(a, b + 1).sort((x, y) => x - y);
    return slice[Math.floor(slice.length / 2)];
  };

  /** @type {CacheLevel[]} */
  const levels = [];
  let from = 0;
  climbs.forEach((climb, i) => {
    const latencyNs = plateau(from, climb.start);
    const last = i === climbs.length - 1;
    const next = last ? memoryNs : plateau(climb.end, climbs[i + 1].start);
    const half = Math.sqrt(latencyNs * next);
    let crossing = sorted[climb.start].bytes;
    for (let k = climb.start + 1; k <= climb.end; k++) {
      if (ns[k] >= half) {
        const t = Math.log(half / ns[k - 1]) / Math.log(ns[k] / ns[k - 1]);
        crossing =
          sorted[k - 1].bytes * (sorted[k].bytes / sorted[k - 1].bytes) ** Math.min(1, Math.max(0, t));
        break;
      }
    }
    const sizeBytes = last ? nearestLastLevel(crossing * 2) : snap(crossing, PRIVATE_SIZES_KB, 1024);
    levels.push({ sizeBytes, latencyNs });
    from = climb.end;
  });
  return { levels, memoryNs };
}

/**
 * Picks out the per-core L2 and the last-level cache by size, so a level that
 * wasn't detected can't shift the others into the wrong slot.
 * @param {CacheLevel[]} levels
 * @returns {{ l2Bytes?: number, l3Bytes?: number }}
 */
export function classifyLevels(levels) {
  const KB = 1024;
  const lastLevel = levels.length >= 2 ? levels[levels.length - 1] : undefined;
  const l3Bytes = lastLevel && lastLevel.sizeBytes >= 2 * KB * KB ? lastLevel.sizeBytes : undefined;
  const l2 = levels.find((l) => l !== lastLevel && l.sizeBytes >= 192 * KB && l.sizeBytes <= 3 * KB * KB);
  return { l2Bytes: l2?.sizeBytes, l3Bytes };
}

/**
 * Estimates physical cores from how total throughput grows as threads are added.
 * The test keeps each core's arithmetic units busy with a single thread, so a
 * second thread on the same core (SMT, "hyper-threading") adds almost nothing,
 * while every real core adds a full share. Cores are counted as the threads it
 * takes to reach 90% of the best throughput.
 * @param {{ threads: number, total: number }[]} runs throughput with k threads busy
 * @param {number} logical threads the browser reports
 * @returns {{ physical: number, smt: boolean, hybrid: boolean, efficiency: number }}
 */
export function detectPhysicalCores(runs, logical) {
  const sorted = [...runs].filter((r) => r.threads > 0 && r.total > 0).sort((a, b) => a.threads - b.threads);
  const one = sorted.find((r) => r.threads === 1);
  if (!one) return { physical: logical, smt: false, hybrid: false, efficiency: NaN };
  // A reading more than 10% above both neighbours is a spike from timing noise:
  // replace it with its neighbours' level. Throughput can't really fall as
  // threads are added, so a running maximum then smooths out dips.
  const cleaned = sorted.map((r, i) => {
    const prev = sorted[i - 1]?.total;
    const next = sorted[i + 1]?.total;
    if (prev !== undefined && next !== undefined && r.total > 1.1 * Math.max(prev, next)) {
      return { threads: r.threads, total: Math.max(prev, next) };
    }
    return r;
  });
  let running = 0;
  const smoothed = cleaned.map((r) => ({
    threads: r.threads,
    total: (running = Math.max(running, r.total)),
  }));
  const best = running;
  const saturated = smoothed.find((r) => r.total >= best * 0.9) ?? smoothed[smoothed.length - 1];
  const all = sorted[sorted.length - 1];
  const smt =
    logical >= 4 &&
    logical % 2 === 0 &&
    Math.abs(saturated.threads - logical / 2) <= 1 &&
    all.threads >= logical * 0.9 &&
    all.total < saturated.total * 1.3;
  const physical = smt ? logical / 2 : saturated.threads;
  // Cores that each add clearly less than the first: a hybrid chip's efficiency cores.
  const efficiency = saturated.total / (saturated.threads * one.total);
  const hybrid = !smt && physical > 2 && efficiency < 0.8;
  return { physical, smt, hybrid, efficiency: Math.round(efficiency * 100) / 100 };
}

/**
 * @typedef {object} CpuSpec
 * @property {string} name
 * @property {"Intel" | "AMD" | "Apple" | "Qualcomm"} vendor
 * @property {"x86" | "arm"} arch
 * @property {number} cores        physical cores (all types)
 * @property {number} threads
 * @property {number} l2KB         L2 per performance core (Apple: per performance cluster)
 * @property {number} l3MB         last-level cache (Apple: system level cache)
 * @property {"desktop" | "laptop" | "phone"} segment
 * @property {number} year
 * @property {string} [igpu]       integrated GPU name, if the chip has one
 */

/**
 * @typedef {object} Measured
 * @property {number} threads                  navigator.hardwareConcurrency
 * @property {"x86" | "arm" | ""} arch          from client hints or the GPU
 * @property {number} [physical]               from the scaling test
 * @property {number} [l2Bytes]                second cache level
 * @property {number} [l3Bytes]                last cache level before memory
 * @property {string} [gpu]                    WebGL renderer, cleaned
 */

/**
 * Which maker the GPU name points to, if it's an integrated GPU.
 * @param {string} gpu
 * @returns {"Intel" | "AMD" | "Apple" | "Qualcomm" | null}
 */
export function vendorFromGpu(gpu = "") {
  if (/Apple/i.test(gpu)) return "Apple";
  if (/Adreno|Qualcomm/i.test(gpu)) return "Qualcomm";
  if (/Intel/i.test(gpu)) return "Intel";
  if (/^(AMD )?Radeon(\(TM\))? (Graphics|Vega|\d+M)|Radeon 7\d0M|Radeon 8\d0M/i.test(gpu)) return "AMD";
  return null;
}

/**
 * Ranks CPUs by how well they explain the measurements. Each mismatch adds a
 * penalty; confidence is relative, among the candidates.
 * @param {Measured} m
 * @param {readonly CpuSpec[]} table
 * @returns {{ spec: CpuSpec, penalty: number, confidence: number, reasons: string[] }[]}
 */
export function matchCpu(m, table) {
  const hint = vendorFromGpu(m.gpu);
  const log2 = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(Math.log2(a / b));
  const scored = [];
  for (const spec of table) {
    if (m.arch && spec.arch !== m.arch) continue;
    let penalty = 0;
    /** @type {string[]} */
    const reasons = [];
    if (m.threads) {
      const off = log2(m.threads, spec.threads);
      penalty += off * 5;
      if (off === 0) reasons.push(`${spec.threads} threads`);
    }
    if (m.l3Bytes) {
      const off = log2(m.l3Bytes, spec.l3MB * 1024 * 1024);
      penalty += off * 2.5;
      if (off < 0.3) reasons.push(`${spec.l3MB} MB L3`);
    }
    if (m.l2Bytes) {
      // Per-core L2 is measured reliably and differs a lot between CPU families.
      const off = log2(m.l2Bytes, spec.l2KB * 1024);
      penalty += off * 3;
      if (off < 0.3) reasons.push(`${spec.l2KB >= 1024 ? `${spec.l2KB / 1024} MB` : `${spec.l2KB} KB`} L2`);
    }
    if (m.physical) penalty += log2(m.physical, spec.cores) * 1.2;
    if (hint) {
      if (hint === spec.vendor) reasons.push(`${hint} graphics`);
      else penalty += 3;
    }
    // Apple Silicon names itself in the GPU string ("Apple M2"): that settles it.
    const chip = spec.vendor === "Apple" ? spec.name.replace(/^Apple /, "") : "";
    if (
      chip &&
      m.gpu &&
      new RegExp(`\\b${chip}(?![\\w ]*(Pro|Max|Ultra))\\b`).test(m.gpu.replace(/^Apple /, ""))
    ) {
      penalty -= 8;
      reasons.unshift(`GPU reports ${spec.name}`);
    }
    scored.push({ spec, penalty, confidence: 0, reasons });
  }
  scored.sort((a, b) => a.penalty - b.penalty || b.spec.year - a.spec.year);
  const weights = scored.map((s) => Math.exp(-s.penalty));
  const sum = weights.reduce((s, w) => s + w, 0) || 1;
  scored.forEach((s, i) => (s.confidence = Math.round((weights[i] / sum) * 100)));
  return scored;
}

/**
 * Groups candidates whose specs the tests can't tell apart (same threads and caches).
 * @param {ReturnType<typeof matchCpu>} ranked
 * @param {number} [limit]
 */
export function groupCandidates(ranked, limit = 3) {
  /** @type {{ names: string[], confidence: number, spec: CpuSpec, reasons: string[] }[]} */
  const groups = [];
  for (const r of ranked) {
    const key = `${r.spec.vendor}|${r.spec.threads}|${r.spec.l2KB}|${r.spec.l3MB}`;
    const existing = groups.find(
      (g) => `${g.spec.vendor}|${g.spec.threads}|${g.spec.l2KB}|${g.spec.l3MB}` === key
    );
    if (existing) {
      existing.names.push(r.spec.name);
      existing.confidence += r.confidence;
    } else {
      groups.push({ names: [r.spec.name], confidence: r.confidence, spec: r.spec, reasons: r.reasons });
    }
  }
  return groups.sort((a, b) => b.confidence - a.confidence).slice(0, limit);
}

/**
 * Phone, tablet, laptop or desktop, from what the browser exposes.
 * @param {{ touchPoints: number, screenShort: number, mobileUa: boolean, battery: { level: number, charging: boolean } | null, os: string }} d
 */
export function guessDeviceType(d) {
  if (d.mobileUa || (d.touchPoints > 1 && d.screenShort < 600))
    return d.screenShort >= 600 ? "Tablet" : "Phone";
  if (d.os === "iOS" || (d.os === "macOS" && d.touchPoints > 1)) return "Tablet";
  if (d.battery && (!d.battery.charging || d.battery.level < 1)) return "Laptop";
  if (d.os === "ChromeOS") return "Laptop";
  return "Desktop (or a plugged-in laptop)";
}

/** @param {number} bytes */
export function formatCacheSize(bytes) {
  if (!(bytes > 0)) return "–";
  if (bytes >= 1024 * 1024) {
    const mb = bytes / 1024 / 1024;
    return `${Number.isInteger(mb) ? mb : mb.toFixed(2).replace(/0$/, "")} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}
