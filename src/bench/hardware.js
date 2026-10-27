// Runs the hardware probes and turns them into a guess. About fifteen seconds.

import {
  classifyLevels,
  detectCacheLevels,
  detectPhysicalCores,
  groupCandidates,
  matchCpu,
} from "../core/hardware.js";
import { CPUS } from "../data/cpus.js";

const newProbe = () => new Worker(new URL("./probe.worker.js", import.meta.url), { type: "module" });

/** @param {Worker} worker @param {object} message @param {string} reply @param {(m: any) => void} [onOther] */
function ask(worker, message, reply, onOther) {
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => (e.data.type === reply ? resolve(e.data) : onOther?.(e.data));
    worker.onerror = (e) => reject(e.error ?? new Error(e.message));
    worker.postMessage(message);
  });
}

/** Thread counts to test: every count on small machines, a spread on big ones. */
export function scalingSteps(/** @type {number} */ logical) {
  if (logical <= 16) return Array.from({ length: logical }, (_, i) => i + 1);
  const steps = new Set([1, 2, 4]);
  for (let k = 8; k < logical; k += Math.max(2, Math.round(logical / 12))) steps.add(k);
  [logical / 2 - 1, logical / 2, logical / 2 + 1, logical].forEach((k) => k > 0 && steps.add(Math.round(k)));
  return [...steps].sort((a, b) => a - b);
}

/**
 * @param {{ threads: number, gpu: string, arch: "x86" | "arm" | "", memoryGB?: number, onProgress?: (text: string, fraction: number) => void }} context
 */
export async function runHardwareTest({ threads, gpu, arch, memoryGB = 8, onProgress = () => {} }) {
  // 1. Memory latency from 4 KB to 128 MB, four sizes per doubling.
  const sizes = [];
  for (let e = 12; e <= 27; e += 0.25) sizes.push(Math.round(2 ** e / 64) * 64);
  const latencyWorker = newProbe();
  const { points } = await ask(latencyWorker, { type: "latency", sizes, budgetMs: 20 }, "latency", (m) =>
    onProgress("Timing memory reads at each size", (m.done / m.total) * 0.45)
  );

  // 2. Bandwidth, on a block well beyond any cache.
  onProgress("Measuring memory bandwidth", 0.47);
  const blockMB = memoryGB >= 8 ? 384 : 128;
  const { gbPerSecond } = await ask(
    latencyWorker,
    { type: "bandwidth", bytes: blockMB * 1024 * 1024 },
    "bandwidth"
  );
  latencyWorker.terminate();

  // 3. Scaling: run the same work on k threads at once and add it up.
  const workers = Array.from({ length: threads }, newProbe);
  const steps = scalingSteps(threads);
  const runs = [];
  try {
    for (const [i, k] of steps.entries()) {
      onProgress(`Running work on ${k} thread${k > 1 ? "s" : ""} at once`, 0.5 + (i / steps.length) * 0.5);
      // Twice, keeping the better: a background hiccup can only slow a run down.
      let total = 0;
      for (let attempt = 0; attempt < 2; attempt++) {
        const results = await Promise.all(
          workers.slice(0, k).map((w) => ask(w, { type: "spin", ms: 250 }, "spin"))
        );
        total = Math.max(
          total,
          results.reduce((s, r) => s + r.opsPerSecond, 0)
        );
      }
      runs.push({ threads: k, total });
    }
  } finally {
    workers.forEach((w) => w.terminate());
  }

  const { levels, memoryNs } = detectCacheLevels(points);
  const cores = detectPhysicalCores(runs, threads);
  const { l2Bytes, l3Bytes } = classifyLevels(levels);
  const measured = { threads, arch, physical: cores.physical, l2Bytes, l3Bytes, gpu };
  const candidates = groupCandidates(matchCpu(measured, CPUS), 3);
  onProgress("Done", 1);
  return { points, levels, memoryNs, runs, cores, gbPerSecond, candidates, measured };
}
