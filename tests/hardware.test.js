import { describe, expect, it } from "vitest";
import {
  LAST_LEVEL_SIZES_MB,
  classifyLevels,
  detectCacheLevels,
  nearestLastLevel,
  detectPhysicalCores,
  formatCacheSize,
  groupCandidates,
  guessDeviceType,
  matchCpu,
  niceCacheSize,
  vendorFromGpu,
} from "../src/core/hardware.js";
import { CPUS } from "../src/data/cpus.js";
import { I9_9900K, I9_9900K_SECOND } from "./fixtures-latency.js";

const KB = 1024;
const MB = 1024 * 1024;

/**
 * A latency curve shaped like real hardware: private levels end sharply at their
 * size; the last level fades out between a quarter of its size and its full size.
 */
function curve(levels, memoryNs) {
  const points = [];
  const [llcSize, llcNs] = levels[levels.length - 1];
  for (let e = 12; e <= 27; e += 0.25) {
    const bytes = Math.round(2 ** e);
    let ns = memoryNs;
    const privateLevel = levels.slice(0, -1).find(([size]) => bytes <= size);
    if (privateLevel) ns = privateLevel[1];
    else if (bytes <= llcSize / 4) ns = llcNs;
    else if (bytes < llcSize * 2) {
      const t = Math.min(1, Math.log2(bytes / (llcSize / 4)) / 2);
      ns = Math.exp(Math.log(llcNs) + t * (Math.log(memoryNs) - Math.log(llcNs)));
    }
    points.push({ bytes, ns: ns * (1 + ((e * 7) % 3) / 100) });
  }
  return points;
}

describe("niceCacheSize", () => {
  it("snaps to sizes caches are built in", () => {
    expect(niceCacheSize(31 * KB)).toBe(32 * KB);
    expect(niceCacheSize(1.3 * MB)).toBe(1.25 * MB);
    expect(niceCacheSize(11.5 * MB)).toBe(12 * MB);
    expect(niceCacheSize(90 * MB)).toBe(96 * MB);
    expect(niceCacheSize(0)).toBe(0);
  });
});

describe("nearestLastLevel", () => {
  it("snaps to real last-level cache sizes", () => {
    expect(nearestLastLevel(15.5 * MB)).toBe(16 * MB);
    expect(nearestLastLevel(100 * MB)).toBe(96 * MB);
    expect(LAST_LEVEL_SIZES_MB).toContain(36);
  });
});

describe("detectCacheLevels", () => {
  it("reads 32 KB, 256 KB and 16 MB from a real i9-9900K recording", () => {
    const { levels, memoryNs } = detectCacheLevels(I9_9900K);
    expect(levels.map((l) => l.sizeBytes)).toEqual([32 * KB, 256 * KB, 16 * MB]);
    expect(levels[0].latencyNs).toBeLessThan(2);
    expect(memoryNs).toBeGreaterThan(70);
  });

  it("reads the private caches from a second, noisier recording", () => {
    const { levels } = detectCacheLevels(I9_9900K_SECOND);
    expect(levels.slice(0, 2).map((l) => l.sizeBytes)).toEqual([32 * KB, 256 * KB]);
    // The shared L3 reads 12-16 MB depending on what else is using it.
    expect([12 * MB, 16 * MB]).toContain(levels[2].sizeBytes);
    const { l2Bytes, l3Bytes } = classifyLevels(levels);
    const top = groupCandidates(
      matchCpu({ threads: 16, arch: "x86", physical: 8, l2Bytes, l3Bytes }, CPUS)
    )[0];
    expect(top.names).toContain("Intel Core i9-9900K");
  });

  it("matches the i9-9900K family from the real recording", () => {
    const { levels } = detectCacheLevels(I9_9900K);
    const ranked = matchCpu(
      { threads: 16, arch: "x86", physical: 8, l2Bytes: levels[1].sizeBytes, l3Bytes: levels[2].sizeBytes },
      CPUS
    );
    expect(groupCandidates(ranked)[0].names).toContain("Intel Core i9-9900K");
  });

  it("finds L1, L2 and L3 on an Intel i9-9900K shaped curve", () => {
    const { levels, memoryNs } = detectCacheLevels(
      curve(
        [
          [32 * KB, 1.1],
          [256 * KB, 3],
          [16 * MB, 11],
        ],
        75
      )
    );
    expect(levels.map((l) => l.sizeBytes)).toEqual([32 * KB, 256 * KB, 16 * MB]);
    expect(levels[2].latencyNs).toBeGreaterThan(levels[1].latencyNs);
    expect(memoryNs).toBeGreaterThan(70);
  });

  it("finds a 96 MB 3D V-Cache", () => {
    const { levels } = detectCacheLevels(
      curve(
        [
          [32 * KB, 1],
          [512 * KB, 3],
          [96 * MB, 12],
        ],
        80
      )
    );
    expect(levels.at(-1).sizeBytes).toBe(96 * MB);
  });

  it("finds Apple's big shared L2", () => {
    const { levels } = detectCacheLevels(
      curve(
        [
          [128 * KB, 1],
          [16 * MB, 5],
        ],
        100
      )
    );
    expect(levels.map((l) => l.sizeBytes)).toEqual([128 * KB, 16 * MB]);
  });

  it("needs a few points, and a flat curve has no levels", () => {
    expect(detectCacheLevels([{ bytes: 1, ns: 1 }]).levels).toEqual([]);
    const flat = [1, 2, 3, 4, 5, 6, 7].map((k) => ({ bytes: k * KB, ns: 5 }));
    expect(detectCacheLevels(flat)).toEqual({ levels: [], memoryNs: 5 });
  });

  it("ignores a single jumpy reading", () => {
    const noisy = I9_9900K.map((p) => (p.bytes === 128 * KB ? { ...p, ns: 9 } : p));
    expect(detectCacheLevels(noisy).levels.map((l) => l.sizeBytes)).toEqual([32 * KB, 256 * KB, 16 * MB]);
  });
});

describe("classifyLevels", () => {
  it("finds L2 and L3 by size, even when L1 was missed", () => {
    const full = [{ sizeBytes: 32 * KB }, { sizeBytes: 256 * KB }, { sizeBytes: 16 * MB }];
    expect(classifyLevels(full)).toEqual({ l2Bytes: 256 * KB, l3Bytes: 16 * MB });
    expect(classifyLevels(full.slice(1))).toEqual({ l2Bytes: 256 * KB, l3Bytes: 16 * MB });
    expect(classifyLevels([{ sizeBytes: 128 * KB }, { sizeBytes: 16 * MB }])).toEqual({
      l2Bytes: undefined,
      l3Bytes: 16 * MB,
    });
    expect(classifyLevels([{ sizeBytes: 32 * KB }])).toEqual({ l2Bytes: undefined, l3Bytes: undefined });
  });
});

describe("detectPhysicalCores", () => {
  const runs = (perThread, logical) =>
    Array.from({ length: logical }, (_, i) => ({ threads: i + 1, total: perThread(i + 1) }));

  it("spots 8 cores with hyper-threading on 16 threads", () => {
    // As measured on an i9-9900K: real cores scale, hyper-threads add a few percent.
    const smt = (k) => (k <= 8 ? k * 100 : 800 + (k - 8) * 4);
    expect(detectPhysicalCores(runs(smt, 16), 16)).toMatchObject({ physical: 8, smt: true, hybrid: false });
    // Measured only at a few thread counts, as on a big machine
    const sparse = [1, 2, 4, 8, 12, 16].map((k) => ({ threads: k, total: smt(k) }));
    expect(detectPhysicalCores(sparse, 16)).toMatchObject({ physical: 8, smt: true });
  });

  it("counts cores without SMT", () => {
    const linear = (k) => k * 98;
    expect(detectPhysicalCores(runs(linear, 8), 8)).toMatchObject({ physical: 8, smt: false, hybrid: false });
  });

  it("reads the real i9-9900K scaling run, noise and all", () => {
    const measured = [
      [1, 4.54],
      [2, 9.05],
      [4, 18.0],
      [6, 25.61],
      [7, 31.2],
      [8, 33.15],
      [9, 35.35],
      [10, 35.65],
      [12, 35.74],
      [16, 36.12],
    ].map(([threads, total]) => ({ threads, total }));
    expect(detectPhysicalCores(measured, 16)).toMatchObject({ physical: 8, smt: true });
  });

  it("isn't fooled by one spike or dip", () => {
    const smt = (k) => (k <= 8 ? k * 100 : 800 + (k - 8) * 4);
    const noisy = runs(smt, 16).map((r) =>
      r.threads === 14
        ? { ...r, total: r.total * 1.25 }
        : r.threads === 8
          ? { ...r, total: r.total * 0.93 }
          : r
    );
    expect(detectPhysicalCores(noisy, 16)).toMatchObject({ physical: 8, smt: true });
  });

  it("flags a hybrid chip whose extra cores add less", () => {
    const hybrid = (k) => (k <= 4 ? k * 100 : 400 + (k - 4) * 45);
    expect(detectPhysicalCores(runs(hybrid, 8), 8)).toMatchObject({ smt: false, hybrid: true });
  });

  it("falls back to the logical count without a single-thread run", () => {
    expect(detectPhysicalCores([{ threads: 4, total: 10 }], 4)).toMatchObject({ physical: 4 });
  });
});

describe("vendorFromGpu", () => {
  it("reads the maker from integrated graphics", () => {
    expect(vendorFromGpu("Intel(R) UHD Graphics 630")).toBe("Intel");
    expect(vendorFromGpu("AMD Radeon Graphics")).toBe("AMD");
    expect(vendorFromGpu("Radeon 780M")).toBe("AMD");
    expect(vendorFromGpu("Apple M2")).toBe("Apple");
    expect(vendorFromGpu("Adreno (TM) 740")).toBe("Qualcomm");
    expect(vendorFromGpu("NVIDIA GeForce RTX 3070")).toBeNull();
    expect(vendorFromGpu("AMD Radeon RX 7900 XTX")).toBeNull();
    expect(vendorFromGpu()).toBeNull();
  });
});

describe("matchCpu", () => {
  it("puts the i9-9900K family first for its measurements", () => {
    const ranked = matchCpu(
      { threads: 16, arch: "x86", physical: 8, l2Bytes: 256 * KB, l3Bytes: 16 * MB, gpu: "Quadro P2200" },
      CPUS
    );
    const top = groupCandidates(ranked);
    expect(top[0].names).toEqual(expect.arrayContaining(["Intel Core i9-9900K", "Intel Core i7-10700K"]));
    expect(top[0].confidence).toBeGreaterThan(50);
    expect(top[0].reasons).toContain("16 threads");
  });

  it("tells a 5800X3D from a 5800X by its cache", () => {
    const ranked = matchCpu({ threads: 16, arch: "x86", l2Bytes: 512 * KB, l3Bytes: 96 * MB }, CPUS);
    expect(ranked[0].spec.name).toBe("AMD Ryzen 7 5800X3D");
  });

  it("uses integrated graphics to pick the maker", () => {
    const ranked = matchCpu(
      { threads: 12, arch: "x86", l2Bytes: 512 * KB, l3Bytes: 16 * MB, gpu: "AMD Radeon Graphics" },
      CPUS
    );
    expect(ranked[0].spec.name).toBe("AMD Ryzen 5 5600G");
  });

  it("trusts Apple's GPU name", () => {
    const ranked = matchCpu({ threads: 8, arch: "arm", gpu: "Apple M2" }, CPUS);
    expect(ranked[0].spec.name).toBe("Apple M2");
    expect(ranked[0].reasons[0]).toBe("GPU reports Apple M2");
    expect(matchCpu({ threads: 10, arch: "arm", gpu: "Apple M1 Pro" }, CPUS)[0].spec.name).toBe(
      "Apple M1 Pro"
    );
  });

  it("only considers the right architecture, and confidences add up", () => {
    const ranked = matchCpu({ threads: 8, arch: "arm" }, CPUS);
    expect(ranked.every((r) => r.spec.arch === "arm")).toBe(true);
    const total = ranked.reduce((s, r) => s + r.confidence, 0);
    expect(total).toBeGreaterThanOrEqual(97);
    expect(total).toBeLessThanOrEqual(103);
  });
});

describe("groupCandidates", () => {
  it("merges CPUs the tests can't tell apart and caps the list", () => {
    const groups = groupCandidates(matchCpu({ threads: 16, arch: "x86" }, CPUS), 2);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.spec.threads))).toEqual(new Set([16]));
  });
});

describe("guessDeviceType", () => {
  const base = { touchPoints: 0, screenShort: 1080, mobileUa: false, battery: null, os: "Windows" };
  it("tells phones, tablets, laptops and desktops apart", () => {
    expect(guessDeviceType({ ...base, mobileUa: true, touchPoints: 5, screenShort: 390 })).toBe("Phone");
    expect(guessDeviceType({ ...base, mobileUa: true, touchPoints: 5, screenShort: 800 })).toBe("Tablet");
    expect(guessDeviceType({ ...base, os: "macOS", touchPoints: 5 })).toBe("Tablet");
    expect(guessDeviceType({ ...base, os: "iOS" })).toBe("Tablet");
    expect(guessDeviceType({ ...base, battery: { level: 0.6, charging: false } })).toBe("Laptop");
    expect(guessDeviceType({ ...base, os: "ChromeOS" })).toBe("Laptop");
    expect(guessDeviceType({ ...base, battery: { level: 1, charging: true } })).toBe(
      "Desktop (or a plugged-in laptop)"
    );
  });
});

describe("CPU table", () => {
  it("has sane, unique entries", () => {
    expect(new Set(CPUS.map((c) => c.name)).size).toBe(CPUS.length);
    for (const c of CPUS) {
      expect(c.threads).toBeGreaterThanOrEqual(c.cores * (c.vendor === "Apple" ? 1 : 0.5));
      expect(c.threads).toBeLessThanOrEqual(c.cores * 2);
      expect(c.l2KB).toBeGreaterThanOrEqual(256);
      expect(c.l3MB).toBeGreaterThan(0);
    }
  });

  it("formats cache sizes", () => {
    expect(formatCacheSize(32 * KB)).toBe("32 KB");
    expect(formatCacheSize(1.25 * MB)).toBe("1.25 MB");
    expect(formatCacheSize(16 * MB)).toBe("16 MB");
    expect(formatCacheSize(0)).toBe("–");
  });
});
