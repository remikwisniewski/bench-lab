# Bench Lab

[![CI](https://github.com/remikwisniewski/bench-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/remikwisniewski/bench-lab/actions/workflows/ci.yml)
![Vanilla JS](https://img.shields.io/badge/JavaScript-ES2022-f7df1e?logo=javascript&logoColor=000)

A CPU benchmark and system monitor that runs in the browser. It path traces a 3D scene on every core, tile by tile, and scores your machine in points. It also shows what the browser can tell about your hardware, with live sensors, and ranks your score against everyone else's.

## What it does

- **CPU (Multi Core) and CPU (Single Core).** Renders a 1280 × 720 still life of glass, chrome and matte spheres in golden-hour light. Tiles spiral out from the centre, one per thread, with brackets around the tiles in progress. The score is rays traced per second, divided by 10,000.
- **MP Ratio.** How many times faster all cores are than one.
- **Minimum test duration.** Repeats the multi-core test for 10 or 30 minutes and charts the score of every pass, to show whether the machine holds its speed once it's hot or starts throttling.
- **Ranking.** Your best scores against everyone who submitted theirs, plus reference runs on known hardware.
- **System summary.** Logical processors, architecture, GPU, WebGL and WebGPU limits, memory, display (with a measured refresh rate), OS and browser, storage, network and battery, with a note on where each value comes from.
- **Sensors.** Live readings with Current, Minimum, Maximum and Average columns: render speed per thread and in total, a CPU speed probe, frame rate, main-thread lag, JavaScript memory, network and battery.

A web page can't read the CPU's model, temperatures, clocks or voltages. Bench Lab doesn't pretend to: every sensor is something it measures, and it's named for what it measures. You can type your CPU's name to label your results.

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

### The ranking

Two Vercel Functions in `api/` store results in Redis (Upstash):

- `POST /api/results` checks the result with the same validation the page uses. That covers well-formed fields, plausible points per thread and a cleaned CPU name. It rate-limits each visitor by a salted hash of their IP, stores the result, and returns its rank and percentile.
- `GET /api/ranking?test=multi` returns each device's best score.

Without a database (locally, or before one is connected) the page falls back to reference runs and your own history.

## Engineering

- **Pure, typed core** (`src/core`): the tracer, scene, BVH, tiles, scoring, stability analysis, device parsing, result validation and share links. No DOM, with JSDoc types checked by TypeScript in strict mode.
- **57 unit tests:**
  - **Renderer:** the scene is deterministic; tiled and whole renders match pixel for pixel; every sphere sits in exactly one BVH leaf.
  - **Results:** forged or malformed results are rejected.
  - **Leaderboard:** ranking, percentiles and rate limiting run against an in-memory store, and the Upstash client is tested against a stubbed server.
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

To use the live ranking, connect an Upstash Redis database to the Vercel project. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`; optionally set `IP_SALT`.

## License

MIT © Remigiusz Wisniewski
