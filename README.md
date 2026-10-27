# Bench Lab

[![CI](https://github.com/remikwisniewski/bench-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/remikwisniewski/bench-lab/actions/workflows/ci.yml)
![Vanilla JS](https://img.shields.io/badge/JavaScript-ES2022-f7df1e?logo=javascript&logoColor=000)

A CPU benchmark and system monitor that runs in the browser. It path traces a 3D scene on every core, tile by tile, and scores your machine in points. It guesses your hardware from timing tests, shows live sensors, and compares your score with reference runs on known hardware.

## What it does

- **CPU (Multi Core) and CPU (Single Core).** Renders a 1280 × 720 still life of glass, chrome and matte spheres in golden-hour light. Tiles spiral out from the centre, one per thread, with brackets around the tiles in progress. The score is rays traced per second, divided by 10,000.
- **MP Ratio.** How many times faster all cores are than one.
- **Minimum test duration.** Repeats the multi-core test for 10 or 30 minutes and charts the score of every pass, to show whether the machine holds its speed once it's hot or starts throttling.
- **Hardware guess.** Browsers hide the CPU model, so Bench Lab works it out: it measures your cache sizes and counts your real cores, then matches them against the specifications of real CPUs. **Detect** fills in your processor's name.
- **Ranking.** Your best scores next to reference runs on known hardware. Results stay in your browser.
- **System summary.** Logical processors, architecture, GPU, WebGL and WebGPU limits, memory, display (with a measured refresh rate), OS and browser, storage, network and battery, with a note on where each value comes from.
- **Sensors.** Live readings with Current, Minimum, Maximum and Average columns: render speed per thread and in total, a CPU speed probe, frame rate, main-thread lag, JavaScript memory, network and battery.

A web page can't read the CPU's model, temperatures, clocks or voltages. Bench Lab doesn't pretend to: every sensor is something it measures, and it's named for what it measures. You can type your CPU's name to label your results.

## How the hardware guess works

About fifteen seconds of tests in Web Workers (`src/bench/probe.worker.js`), analysed by pure functions (`src/core/hardware.js`):

- **Cache sizes.**
  - **The probe:** a pointer chase through a randomly shuffled chain of 64-byte cache lines, timed at 61 sizes from 4 KB to 128 MB. Every read depends on the one before, so the CPU can't run ahead. The loop is warmed up first so the JIT has optimised it, unrolled eight times so bookkeeping barely shows, and each size keeps the best of two readings.
  - **Finding the levels:** latency climbs at each cache's edge. The curve is median-filtered, and climbs are found as runs of half-octave rises. Each level's size is where latency crosses halfway between that level and the next, snapped to sizes caches really come in. A big shared L3 loses random reads early, crossing halfway at about half its size, so that reading is doubled.
- **Physical cores.**
  - **The probe:** the same arithmetic runs on 1, 2, 3… threads at once. Each thread runs eight independent floating-point chains, enough to keep a core busy on its own.
  - **Counting:** a second thread on the same core (hyper-threading) adds almost nothing, while each real core adds a full share. Cores are counted as the threads needed to reach 90% of peak throughput, after removing spikes and dips.
- **Matching.** The measured threads, cores, L2 and L3, the architecture, and any integrated GPU's maker are scored against a table of real CPU specifications. CPUs with identical cores and caches are grouped, because no timing test can tell them apart.

The detection is tested against two real recordings from an Intel Core i9-9900K. Both read 32 KB L1, 256 KB L2, a 12–16 MB L3, and 8 cores with hyper-threading. Run live on that machine, it puts the i9-9900K / i7-10700K group first.

## How the benchmark works

### The renderer

A path tracer written from scratch in plain JavaScript (`src/core/render`):

- **Materials:** diffuse, metal with roughness, glass with Fresnel reflection (Schlick), and emissive.
- **Lighting:** a sky gradient and a sun, sampled directly at every diffuse bounce for soft shadows; depth of field from a thin-lens camera; Russian roulette to end dim paths early.
- **Acceleration:** a bounding volume hierarchy over the 145 spheres, flattened into typed arrays and walked with an explicit stack.
- **Speed:** no objects are created per ray. Vectors are spelled out as numbers, and the scene lives in `Float64Array`s.
- **Exposure:** a filmic tone curve and gamma, so the output looks like a photograph rather than a raw buffer.

### Fair, repeatable scores

- **Same scene everywhere:** the scene is generated from a fixed seed, so every device renders the same image.
- **Same work everywhere:** every pixel has its own seeded random stream, so the image and the number of rays traced are identical on every device and in any tile order. The tests check this by rendering in tiles and comparing against a whole render.
- **Set-up isn't timed:** each render thread builds its scene before the clock starts.
- **Precise timers:** the site is cross-origin isolated (`COOP` and `COEP` headers), which gives it precise timers.

### Threads

A pool of Web Workers, one per logical processor, pulls tiles from a shared queue in spiral order. Pixels come back as transferable buffers and are painted as each tile finishes.

## Engineering

- **Pure, typed core** (`src/core`): the tracer, scene, BVH, tiles, scoring, stability analysis, hardware detection, device parsing and share links. No DOM, with JSDoc types checked by TypeScript in strict mode.
- **68 unit tests:**
  - **Renderer:** the scene is deterministic; tiled and whole renders match pixel for pixel; every sphere sits in exactly one BVH leaf.
  - **Hardware guess:** cache and core detection run on real recordings and realistic synthetic curves (Intel, 3D V-Cache, Apple, hybrid), with spikes and dips; matching picks the right family.
  - **Share links:** names are cleaned and tampered links are sanitised.
- **CI:** GitHub Actions lints, checks formatting, type-checks, tests with coverage thresholds and builds on every push.

## Run it

Requires Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

| Script             | What it does                             |
| ------------------ | ---------------------------------------- |
| `npm run dev`      | Start the Vite dev server (isolated)     |
| `npm test`         | Run the test suite                       |
| `npm run coverage` | Tests with a coverage report             |
| `npm run check`    | Lint, format check, type-check and tests |
| `npm run build`    | Production build to `dist/`              |

## License

MIT © Remigiusz Wisniewski
