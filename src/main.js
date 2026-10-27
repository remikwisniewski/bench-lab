import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./styles/main.css";

import {
  IMAGE,
  TESTS,
  formatDuration,
  mpRatio,
  points,
  progress,
  remaining,
  stability,
} from "./core/benchmark.js";
import { cleanName, decodeCard, encodeCard } from "./core/result.js";
import { availableThreads, runTest } from "./bench/pool.js";
import { collectSystem } from "./ui/system.js";
import { runHardwareTest } from "./bench/hardware.js";
import { guessDeviceType } from "./core/hardware.js";
import { createSensors } from "./ui/sensors.js";
import {
  buildRanking,
  fetchLeaderboard,
  loadHistory,
  saveToHistory,
  submitResult,
  yourLabel,
} from "./ui/ranking.js";
import {
  drawBracket,
  drawPasses,
  formatPoints,
  renderRanking,
  renderSensors,
  renderSystem,
  renderGuess,
} from "./ui/views.js";

/** @typedef {"multi" | "single"} TestKind */

const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (document.querySelector(s));
const $$ = (/** @type {string} */ s) => /** @type {HTMLElement[]} */ ([...document.querySelectorAll(s)]);

// ---------- Tabs ----------

function showTab(/** @type {string} */ name) {
  for (const tab of $$("[data-tab]")) tab.setAttribute("aria-selected", String(tab.dataset.tab === name));
  for (const view of $$("[data-view]")) view.hidden = view.dataset.view !== name;
  if (name === "sensors") drawSensors();
}
for (const tab of $$("[data-tab]"))
  tab.addEventListener("click", () => showTab(/** @type {string} */ (tab.dataset.tab)));

// ---------- System ----------

const threads = availableThreads();
/** @type {import("./ui/system.js").Summary} */
let system = {
  threads,
  gpu: "–",
  os: "–",
  osLabel: "–",
  browser: "–",
  chip: null,
  arch: "",
  memoryGB: 0,
  battery: null,
  mobile: false,
};

const cpuInput = /** @type {HTMLInputElement} */ ($("[data-cpu-name]"));
try {
  cpuInput.value = localStorage.getItem("bench-lab:cpu") ?? "";
} catch {
  // Storage blocked: start empty.
}
cpuInput.addEventListener("change", () => {
  cpuInput.value = cleanName(cpuInput.value);
  try {
    localStorage.setItem("bench-lab:cpu", cpuInput.value);
  } catch {
    // Not remembered; still used for this visit.
  }
  refreshRanking();
});

collectSystem().then(({ sections, summary }) => {
  system = { ...summary, threads: summary.threads || threads };
  renderSystem($("[data-system]"), sections);
  $("[data-spec=threads]").textContent = String(system.threads);
  $("[data-spec=gpu]").textContent = system.gpu;
  $("[data-spec=gpu]").title = system.gpu;
  $("[data-spec=os]").textContent = system.osLabel;
  $("[data-spec=browser]").textContent = system.browser;
  if (!cpuInput.value && system.chip) cpuInput.value = system.chip;
  refreshRanking();
});

// ---------- Sensors ----------

const sensors = createSensors();
const compact = /** @type {HTMLTableElement} */ ($("[data-sensors-compact]"));
const full = /** @type {HTMLTableElement} */ ($("[data-sensors-full]"));
function drawSensors() {
  const list = sensors.list();
  renderSensors(compact, list, { compact: true, groups: ["Render", "Processor", "Browser"] });
  if (!$("[data-view=sensors]").hidden) renderSensors(full, list);
}
sensors.onUpdate(drawSensors);
$("[data-reset]").addEventListener("click", () => {
  sensors.resetAll();
  drawSensors();
});

// ---------- Ranking ----------

/** @type {TestKind} */
let rankingTest = "multi";
/** @type {Record<TestKind, number>} */
const best = { multi: 0, single: 0 };
for (const entry of loadHistory()) best[entry.test] = Math.max(best[entry.test], entry.points);

async function refreshRanking() {
  const test = rankingTest;
  const label = yourLabel({
    cpuName: cpuInput.value,
    gpu: system.gpu,
    threads: system.threads,
    os: system.osLabel,
  });
  const you = best[test] ? { points: best[test], label } : null;
  const list = $("[data-ranking]");
  const note = $("[data-ranking-note]");
  renderRanking(list, buildRanking(test, null, you));
  const board = await fetchLeaderboard(test);
  if (test !== rankingTest) return;
  renderRanking(list, buildRanking(test, board, you));
  note.textContent = board
    ? `${board.total.toLocaleString("en-US")} results submitted. Blue is a reference run.`
    : "The public ranking couldn't be reached, so this shows reference runs and your own results.";
}
for (const button of $$("[data-rank]")) {
  button.addEventListener("click", () => {
    rankingTest = /** @type {TestKind} */ (button.dataset.rank);
    for (const b of $$("[data-rank]")) b.setAttribute("aria-pressed", String(b === button));
    refreshRanking();
  });
}

// ---------- Scores ----------

function showScores() {
  $("[data-score=multi]").textContent = formatPoints(best.multi);
  $("[data-score=single]").textContent = formatPoints(best.single);
  const ratio = mpRatio(best.multi, best.single);
  $("[data-ratio]").textContent = Number.isFinite(ratio) ? ratio.toFixed(2) : "–";
}

// ---------- Running a test ----------

const render = /** @type {HTMLCanvasElement} */ ($("[data-render]"));
const overlay = /** @type {HTMLCanvasElement} */ ($("[data-overlay]"));
const rctx = /** @type {CanvasRenderingContext2D} */ (render.getContext("2d"));
const octx = /** @type {CanvasRenderingContext2D} */ (overlay.getContext("2d"));
const statusEl = $("[data-status]");
const barEl = $("[data-bar]");
const elapsedEl = $("[data-elapsed]");
const leftEl = $("[data-left]");
const durationSelect = /** @type {HTMLSelectElement} */ ($("[data-duration]"));
const consent = /** @type {HTMLInputElement} */ ($("[data-consent]"));

/** @type {AbortController | null} */
let controller = null;
/** @type {TestKind | null} */
let runningTest = null;

function setButtons() {
  for (const button of $$("[data-start]")) {
    const kind = button.dataset.start;
    const isThis = kind === runningTest;
    button.textContent = isThis ? "Stop" : "Start";
    button.classList.toggle("is-stop", isThis);
    /** @type {HTMLButtonElement} */ (button).disabled = runningTest !== null && !isThis;
  }
  durationSelect.disabled = runningTest !== null;
  for (const b of $$("[data-detect], [data-guess-run]"))
    /** @type {HTMLButtonElement} */ (b).disabled = runningTest !== null || detecting;
  if (detecting) for (const b of $$("[data-start]")) /** @type {HTMLButtonElement} */ (b).disabled = true;
}

// ---------- Hardware guess ----------

let detecting = false;

/** Runs the hardware test and shows the guess. Returns the best name, if it's a fair guess. */
async function detectHardware() {
  if (detecting || runningTest) return null;
  detecting = true;
  setButtons();
  const status = $("[data-guess-status]");
  const bar = $("[data-guess-bar]");
  const detect = $("[data-detect]");
  detect.textContent = "Testing…";
  try {
    const result = await runHardwareTest({
      threads,
      gpu: system.gpu,
      arch: system.arch,
      memoryGB: system.memoryGB,
      onProgress: (text, fraction) => {
        status.textContent = text;
        bar.style.width = `${fraction * 100}%`;
      },
    });
    const deviceType = guessDeviceType({
      touchPoints: navigator.maxTouchPoints,
      screenShort: Math.min(screen.width, screen.height),
      mobileUa: system.mobile,
      battery: system.battery,
      os: system.os,
    });
    const body = $("[data-guess-body]");
    renderGuess(body, result, { deviceType, gpu: system.gpu, memoryGB: system.memoryGB });
    body.hidden = false;
    const top = result.candidates[0];
    const named = top
      ? top.names.length > 1
        ? `${top.names.slice(0, -1).join(", ")} or ${top.names.at(-1)}`
        : top.names[0]
      : "";
    status.textContent = top
      ? `Best guess: ${named} (${top.confidence}% likely). Run it again with nothing else busy if it looks off.`
      : "Couldn't match a CPU from the table.";
    return top && top.confidence >= 30 ? top.names[0] : null;
  } catch (error) {
    status.textContent = "The hardware test couldn't run in this browser.";
    console.error(error);
    return null;
  } finally {
    detecting = false;
    detect.textContent = "Detect";
    setButtons();
  }
}

$("[data-guess-run]").addEventListener("click", () => detectHardware());
$("[data-detect]").addEventListener("click", async () => {
  const name = await detectHardware();
  if (name) {
    cpuInput.value = name;
    cpuInput.dispatchEvent(new Event("change"));
  }
});

/** One full render of the image. @param {TestKind} kind @param {AbortSignal} signal @param {string} passLabel */
async function renderPass(kind, signal, passLabel) {
  const spec = TESTS[kind];
  const runThreads = kind === "single" ? 1 : threads;
  const total = Math.ceil(IMAGE.width / 64) * Math.ceil(IMAGE.height / 64);
  let done = 0;
  const start = performance.now();
  rctx.fillStyle = "#050607";
  rctx.fillRect(0, 0, IMAGE.width, IMAGE.height);
  octx.clearRect(0, 0, IMAGE.width, IMAGE.height);
  $("[data-idle]").hidden = true;
  sensors.startRun(runThreads);

  const tick = setInterval(() => {
    const elapsed = (performance.now() - start) / 1000;
    elapsedEl.textContent = formatDuration(elapsed);
    leftEl.textContent = formatDuration(remaining(elapsed, progress(done, total)));
  }, 250);

  try {
    const result = await runTest({
      threads: runThreads,
      samples: spec.samples,
      signal,
      onTileStart: (tile) => drawBracket(octx, tile),
      onTileDone: (tile, pixels, info) => {
        rctx.putImageData(new ImageData(pixels, tile.w, tile.h), tile.x, tile.y);
        octx.clearRect(tile.x, tile.y, tile.w, tile.h);
        done++;
        sensors.recordTile(info.thread, info.rays, info.ms);
        const fraction = progress(done, total);
        barEl.style.width = `${fraction * 100}%`;
        statusEl.textContent = `${passLabel} · rendering with ${runThreads} thread${runThreads > 1 ? "s" : ""} · ${Math.round(fraction * 100)}%`;
      },
    });
    return points(result.rays, result.seconds);
  } finally {
    clearInterval(tick);
    sensors.stopRun();
  }
}

/** @param {TestKind} kind */
async function start(kind) {
  if (runningTest) {
    controller?.abort();
    return;
  }
  runningTest = kind;
  controller = new AbortController();
  setButtons();
  $("[data-result]").hidden = true;
  const minSeconds = kind === "multi" ? Number(durationSelect.value) : 0;
  /** @type {number[]} */
  const passes = [];
  const began = performance.now();
  try {
    do {
      const label = minSeconds ? `Pass ${passes.length + 1}` : TESTS[kind].label;
      passes.push(await renderPass(kind, controller.signal, label));
      if (minSeconds) {
        drawPasses(/** @type {HTMLCanvasElement} */ ($("[data-passes-chart]")), passes);
        $("[data-result]").hidden = false;
        $("[data-passes]").hidden = false;
      }
    } while (minSeconds && (performance.now() - began) / 1000 < minSeconds);

    const summary = stability(passes);
    const score = minSeconds && summary ? Math.round(summary.score) : passes[0];
    best[kind] = Math.max(best[kind], score);
    showScores();
    const seconds = (performance.now() - began) / 1000 / passes.length;
    saveToHistory({
      test: kind,
      points: score,
      seconds,
      threads: kind === "single" ? 1 : threads,
      at: Date.now(),
      cpuName: cpuInput.value || undefined,
    });
    statusEl.textContent = `Done: ${formatPoints(score)} pts`;
    leftEl.textContent = "0:00";

    let line = `${TESTS[kind].label}: ${formatPoints(score)} pts in ${formatDuration(seconds)}.`;
    if (minSeconds && summary) {
      line += ` Median of ${summary.passes} passes; best ${formatPoints(summary.best)}, last ${formatPoints(summary.last)}.`;
      $("[data-verdict]").textContent = `· ${summary.verdict} (${summary.dropPercent}% from best to last)`;
    } else {
      $("[data-passes]").hidden = true;
    }
    if (consent.checked) {
      const placed = await submitResult({
        test: kind,
        points: score,
        seconds,
        threads,
        cpuName: cpuInput.value || undefined,
        gpu: system.gpu,
        os: system.osLabel,
        browser: system.browser,
      });
      if (placed)
        line += ` That's faster than ${Math.round(placed.percentile)}% of ${placed.total.toLocaleString("en-US")} submitted results.`;
    }
    $("[data-result-line]").textContent = line;
    $("[data-result]").hidden = false;
    rankingTest = kind;
    for (const b of $$("[data-rank]")) b.setAttribute("aria-pressed", String(b.dataset.rank === kind));
    refreshRanking();
  } catch (error) {
    if (/** @type {Error} */ (error).name === "AbortError") {
      statusEl.textContent = "Stopped";
      octx.clearRect(0, 0, IMAGE.width, IMAGE.height);
    } else {
      statusEl.textContent = "Something went wrong running the test";
      console.error(error);
    }
  } finally {
    runningTest = null;
    controller = null;
    setButtons();
  }
}

for (const button of $$("[data-start]")) {
  button.addEventListener("click", () => start(/** @type {TestKind} */ (button.dataset.start)));
}

// ---------- Share ----------

$("[data-share]").addEventListener("click", async (event) => {
  const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
  const hash = encodeCard({
    multi: best.multi || undefined,
    single: best.single || undefined,
    threads,
    cpuName: cpuInput.value || undefined,
    gpu: system.gpu,
    os: system.osLabel,
    browser: system.browser,
  });
  const url = `${location.origin}${location.pathname}${hash}`;
  try {
    await navigator.clipboard.writeText(url);
    button.textContent = "Link copied";
  } catch {
    history.replaceState(null, "", hash);
    button.textContent = "Copy it from the address bar";
  }
  setTimeout(() => (button.textContent = "Copy result link"), 2000);
});

// A shared link shows someone else's scores until you run your own.
const shared = decodeCard(location.hash);
if (shared) {
  $("[data-score=multi]").textContent = formatPoints(shared.multi ?? 0);
  $("[data-score=single]").textContent = formatPoints(shared.single ?? 0);
  const ratio = mpRatio(shared.multi ?? 0, shared.single ?? 0);
  $("[data-ratio]").textContent = Number.isFinite(ratio) ? ratio.toFixed(2) : "–";
  statusEl.textContent = `Showing a shared result: ${yourLabel({ ...shared, threads: shared.threads })}${shared.browser ? ` · ${shared.browser}` : ""}`;
} else {
  showScores();
}

if (!crossOriginIsolated) {
  console.warn("Not cross-origin isolated: timers are coarse, scores may vary a little more.");
}
setButtons();
refreshRanking();
drawSensors();
