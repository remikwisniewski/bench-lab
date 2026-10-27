// Runs a test: a pool of render threads pulling tiles from a shared queue in
// spiral order. Reports each tile as it starts and finishes, and the total rays
// and time at the end.

import { IMAGE, SCENE_SEED, TILE_SIZE } from "../core/benchmark.js";
import { spiralOrder, tileGrid } from "../core/tiles.js";

/** @typedef {import("../core/tiles.js").Tile} Tile */

/**
 * @typedef {object} RunCallbacks
 * @property {(tile: Tile, thread: number) => void} [onTileStart]
 * @property {(tile: Tile, pixels: Uint8ClampedArray, info: { rays: number, ms: number, thread: number }) => void} [onTileDone]
 */

/**
 * @param {{ threads: number, samples: number, signal?: AbortSignal } & RunCallbacks} options
 * @returns {Promise<{ rays: number, seconds: number, tiles: number }>}
 */
export async function runTest({ threads, samples, signal, onTileStart, onTileDone }) {
  const queue = spiralOrder(tileGrid(IMAGE.width, IMAGE.height, TILE_SIZE), IMAGE.width, IMAGE.height);
  const total = queue.length;
  const workers = Array.from(
    { length: threads },
    () => new Worker(new URL("./render.worker.js", import.meta.url), { type: "module" })
  );
  const stop = () => workers.forEach((w) => w.terminate());

  try {
    // Every thread builds its scene first, so set-up time isn't counted.
    await Promise.all(
      workers.map(
        (worker) =>
          new Promise((resolve, reject) => {
            worker.onmessage = (e) => e.data.type === "ready" && resolve(undefined);
            worker.onerror = (e) => reject(e.error ?? new Error(e.message));
            worker.postMessage({ type: "init", sceneSeed: SCENE_SEED, ...IMAGE });
          })
      )
    );
    if (signal?.aborted) throw new DOMException("Stopped", "AbortError");

    return await new Promise((resolve, reject) => {
      let next = 0;
      let done = 0;
      let rays = 0;
      const start = performance.now();

      const give = (/** @type {Worker} */ worker, /** @type {number} */ thread) => {
        if (next >= total) return;
        const tile = queue[next++];
        onTileStart?.(tile, thread);
        worker.postMessage({ type: "tile", tile, samples });
      };

      signal?.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")), {
        once: true,
      });

      workers.forEach((worker, thread) => {
        worker.onerror = (e) => reject(e.error ?? new Error(e.message));
        worker.onmessage = (e) => {
          const message = e.data;
          if (message.type !== "done") return;
          rays += message.rays;
          done++;
          onTileDone?.(message.tile, message.pixels, { rays: message.rays, ms: message.ms, thread });
          if (done === total) {
            resolve({ rays, seconds: (performance.now() - start) / 1000, tiles: total });
          } else {
            give(worker, thread);
          }
        };
        give(worker, thread);
      });
    });
  } finally {
    stop();
  }
}

/** Threads the browser says it has, with a sensible fallback. */
export const availableThreads = () => Math.max(1, Math.min(256, navigator.hardwareConcurrency || 4));
