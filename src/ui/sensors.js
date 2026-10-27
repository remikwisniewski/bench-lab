// Live sensors with Current, Minimum, Maximum and Average columns, like a
// hardware monitor. A browser can't read temperatures, clocks or voltages, so
// every sensor here is something the page can actually measure, and is named
// for what it measures.

import { createReading } from "../core/stats.js";

/**
 * @typedef {object} Sensor
 * @property {string} id
 * @property {string} group
 * @property {string} label
 * @property {string} unit
 * @property {number} digits
 * @property {string} [hint]
 * @property {ReturnType<typeof createReading>} reading
 */

/** A fixed chunk of integer work; how fast it runs tracks the CPU's current speed. */
function probe() {
  let x = 2463534242;
  const start = performance.now();
  for (let i = 0; i < 300_000; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
  }
  const ms = performance.now() - start;
  return { opsPerMs: 300_000 / Math.max(ms, 0.01), sink: x };
}

export function createSensors() {
  /** @type {Map<string, Sensor>} */
  const sensors = new Map();
  /** @type {Set<() => void>} */
  const listeners = new Set();

  /** @param {string} id @param {string} group @param {string} label @param {string} unit @param {number} digits @param {string} [hint] */
  const add = (id, group, label, unit, digits, hint) => {
    if (!sensors.has(id)) sensors.set(id, { id, group, label, unit, digits, hint, reading: createReading() });
    return /** @type {Sensor} */ (sensors.get(id));
  };

  add(
    "render.total",
    "Render",
    "Total throughput",
    "Mrays/s",
    2,
    "All threads, averaged over the last 3 seconds"
  );
  add(
    "cpu.probe",
    "Processor",
    "Main-thread speed",
    "Mops/s",
    0,
    "A fixed integer loop, run once a second. Drops when the CPU throttles or is busy."
  );
  add("browser.fps", "Browser", "Frame rate", "fps", 0);
  add("browser.lag", "Browser", "Main-thread lag", "ms", 1, "How late a 100 ms timer fires");
  if (/** @type {any} */ (performance).memory)
    add("browser.heap", "Browser", "JavaScript heap used", "MB", 1);
  const connection = /** @type {any} */ (navigator).connection;
  if (connection?.rtt !== undefined) add("net.rtt", "Network", "Round trip (estimate)", "ms", 0);
  if (connection?.downlink !== undefined) add("net.down", "Network", "Downlink (estimate)", "Mbit/s", 1);

  /** @type {any} */
  let battery = null;
  /** @type {any} */ (navigator)
    .getBattery?.()
    .then((/** @type {any} */ b) => {
      battery = b;
      add("power.level", "Power", "Battery level", "%", 0);
      add("power.charging", "Power", "Charging", "", 0);
    })
    .catch(() => {});

  // ---- Frame rate and lag ----
  let frames = 0;
  const countFrame = () => {
    frames++;
    requestAnimationFrame(countFrame);
  };
  requestAnimationFrame(countFrame);
  let lagSum = 0;
  let lagCount = 0;
  let expected = performance.now() + 100;
  setInterval(() => {
    const now = performance.now();
    lagSum += Math.max(0, now - expected);
    lagCount++;
    expected = now + 100;
  }, 100);

  // ---- Render throughput, fed by the benchmark ----
  // Tiles finish in bursts, so total throughput is averaged over a few seconds.
  let raysThisSecond = 0;
  /** @type {{ rays: number, seconds: number }[]} */
  let recent = [];

  let last = performance.now();
  function sample() {
    const now = performance.now();
    const seconds = (now - last) / 1000;
    last = now;
    const read = (/** @type {string} */ id) => sensors.get(id)?.reading;

    read("browser.fps")?.push(frames / seconds);
    frames = 0;
    read("browser.lag")?.push(lagCount ? lagSum / lagCount : 0);
    lagSum = 0;
    lagCount = 0;
    read("cpu.probe")?.push(probe().opsPerMs / 1000);
    const heap = /** @type {any} */ (performance).memory;
    if (heap) read("browser.heap")?.push(heap.usedJSHeapSize / 1024 / 1024);
    if (connection) {
      read("net.rtt")?.push(connection.rtt);
      read("net.down")?.push(connection.downlink);
    }
    if (battery) {
      read("power.level")?.push(battery.level * 100);
      read("power.charging")?.push(battery.charging ? 1 : 0);
    }
    if (running) {
      recent = [...recent, { rays: raysThisSecond, seconds }].slice(-3);
      const rays = recent.reduce((s, w) => s + w.rays, 0);
      const span = recent.reduce((s, w) => s + w.seconds, 0);
      if (recent.length === 3) read("render.total")?.push(rays / span / 1e6);
    }
    raysThisSecond = 0;
    listeners.forEach((fn) => fn());
  }
  let running = false;
  setInterval(sample, 1000);

  return {
    /** Sensors grouped in display order. */
    list: () => [...sensors.values()],
    /** @param {() => void} fn */
    onUpdate(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** A test is starting: add a sensor per render thread. @param {number} threads */
    startRun(threads) {
      running = true;
      recent = [];
      for (let t = 0; t < threads; t++)
        add(`render.t${t}`, "Render", `Thread ${t}`, "Mrays/s", 2, "Speed of its latest tile");
    },
    stopRun() {
      running = false;
    },
    /** @param {number} thread @param {number} rays @param {number} ms */
    recordTile(thread, rays, ms) {
      raysThisSecond += rays;
      if (ms > 0) sensors.get(`render.t${thread}`)?.reading.push(rays / ms / 1000);
    },
    resetAll() {
      sensors.forEach((s) => s.reading.reset());
    },
  };
}
