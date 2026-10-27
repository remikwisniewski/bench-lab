// Timing probes for the hardware guess: memory latency at many sizes, a
// parallel workload for counting cores, and memory bandwidth.

const LINE = 16; // 64-byte cache lines, in 4-byte ints

/** A cyclic chain through `bytes` of memory, one hop per cache line, in random order. */
function buildChain(bytes) {
  const lines = Math.max(2, Math.floor(bytes / 64));
  const chain = new Int32Array(lines * LINE);
  const order = new Int32Array(lines);
  for (let i = 0; i < lines; i++) order[i] = i;
  let seed = 0x9e3779b9;
  for (let i = lines - 1; i > 0; i--) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const j = (seed >>> 0) % (i + 1);
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  for (let i = 0; i < lines; i++) chain[order[i] * LINE] = order[(i + 1) % lines] * LINE;
  return { chain, lines };
}

/** Nanoseconds per dependent read, walking the chain for about `budgetMs`. */
function latency(bytes, budgetMs) {
  const { chain, lines } = buildChain(bytes);
  let p = 0;
  // Warm up: one lap, so the data is wherever the caches will keep it.
  for (let i = 0; i < Math.min(lines, 4_000_000); i++) p = chain[p];
  let steps = 0;
  const batch = 20_000;
  const start = performance.now();
  /** @type {number} */ let elapsed;
  do {
    // Eight dependent reads per pass, so loop bookkeeping barely shows in the timing.
    for (let i = 0; i < batch; i++) {
      p = chain[p];
      p = chain[p];
      p = chain[p];
      p = chain[p];
      p = chain[p];
      p = chain[p];
      p = chain[p];
      p = chain[p];
    }
    steps += batch * 8;
    elapsed = performance.now() - start;
  } while (elapsed < budgetMs);
  return { ns: (elapsed * 1e6) / steps, sink: p };
}

/** Eight independent floating-point chains: enough to keep one core busy on its own. */
function spin(ms) {
  let a = 1.0;
  let b = 1.1;
  let c = 1.2;
  let d = 1.3;
  let e = 1.4;
  let f = 1.5;
  let g = 1.6;
  let h = 1.7;
  const m = 0.9999999;
  const k = 1e-7;
  let rounds = 0;
  const start = performance.now();
  while (performance.now() - start < ms) {
    for (let i = 0; i < 20_000; i++) {
      a = a * m + k;
      b = b * m + k;
      c = c * m + k;
      d = d * m + k;
      e = e * m + k;
      f = f * m + k;
      g = g * m + k;
      h = h * m + k;
    }
    rounds++;
  }
  const seconds = (performance.now() - start) / 1000;
  return { opsPerSecond: (rounds * 20_000 * 8) / seconds, sink: a + b + c + d + e + f + g + h };
}

/** Read bandwidth in GB/s, summing a large array a few times. */
function bandwidth(bytes) {
  const data = new Float64Array(bytes / 8);
  for (let i = 0; i < data.length; i += 512) data[i] = i;
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i]; // warm-up pass
  const passes = 3;
  const start = performance.now();
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2] + data[i + 3];
  }
  const seconds = (performance.now() - start) / 1000;
  return { gbPerSecond: (bytes * passes) / seconds / 1e9, sink: sum };
}

self.onmessage = (event) => {
  const message = event.data;
  if (message.type === "latency") {
    // Let the JIT compiler optimise the loop first, so small sizes aren't timed
    // in the slower unoptimised code.
    for (let i = 0; i < 4; i++) latency(16 * 1024, 25);
    const points = [];
    for (const bytes of message.sizes) {
      // Best of two: interference can only make a reading slower.
      const ns = Math.min(latency(bytes, message.budgetMs).ns, latency(bytes, message.budgetMs).ns);
      points.push({ bytes, ns });
      self.postMessage({ type: "progress", done: points.length, total: message.sizes.length });
    }
    self.postMessage({ type: "latency", points });
  } else if (message.type === "spin") {
    self.postMessage({ type: "spin", ...spin(message.ms) });
  } else if (message.type === "bandwidth") {
    self.postMessage({ type: "bandwidth", ...bandwidth(message.bytes) });
  }
};
