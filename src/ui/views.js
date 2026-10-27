// Rendering helpers for the System and Sensors views, the ranking, the
// hardware guess and the charts. All text from outside the page goes through escapeHtml.

import { formatCacheSize } from "../core/hardware.js";

/** @param {unknown} value */
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      /** @type {Record<string, string>} */ ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]
  );

const fmt = new Intl.NumberFormat("en-US");

/** @param {number} n */
export const formatPoints = (n) => (Number.isFinite(n) && n > 0 ? fmt.format(Math.round(n)) : "–");

// ---------- System ----------

/** @param {HTMLElement} root @param {import("./system.js").Section[]} sections */
export function renderSystem(root, sections) {
  root.innerHTML = sections
    .map(
      (section) => `<section>
        <h2>${escapeHtml(section.title)}</h2>
        <table><tbody>${section.rows
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.value)}${
                row.note ? `<span class="note">${escapeHtml(row.note)}</span>` : ""
              }</td></tr>`
          )
          .join("")}</tbody></table>
      </section>`
    )
    .join("");
}

// ---------- Sensors ----------

/** @param {number} value @param {number} digits */
const num = (value, digits) => (Number.isFinite(value) ? value.toFixed(digits) : "–");

/**
 * @param {HTMLTableElement} table
 * @param {import("./sensors.js").Sensor[]} sensors
 * @param {{ compact?: boolean, groups?: string[] }} [options]
 */
export function renderSensors(table, sensors, { compact = false, groups } = {}) {
  const shown = groups ? sensors.filter((s) => groups.includes(s.group)) : sensors;
  const order = [...new Set(shown.map((s) => s.group))];
  const head = compact
    ? "<thead><tr><th>Sensor</th><th>Now</th><th>Max</th></tr></thead>"
    : "<thead><tr><th>Sensor</th><th>Current</th><th>Minimum</th><th>Maximum</th><th>Average</th></tr></thead>";
  const body = order
    .map((group) => {
      const rows = shown
        .filter((s) => s.group === group)
        .map((s) => {
          const r = s.reading;
          const unit = s.unit ? ` ${s.unit}` : "";
          // The compact table keeps units beside the name, so its number columns stay narrow.
          const cellUnit = compact ? "" : unit;
          const v = (/** @type {number} */ x) =>
            s.id === "power.charging"
              ? Number.isFinite(x)
                ? x
                  ? "Yes"
                  : "No"
                : "–"
              : `${num(x, s.digits)}${Number.isFinite(x) ? cellUnit : ""}`;
          const cells = compact ? [r.current, r.max] : [r.current, r.min, r.max, r.average];
          const name =
            compact && s.unit
              ? `${escapeHtml(s.label)} <span class="unit">${escapeHtml(s.unit)}</span>`
              : escapeHtml(s.label);
          return `<tr><td title="${escapeHtml(s.hint ?? s.label)}">${name}</td>${cells
            .map((c) => `<td>${v(c)}</td>`)
            .join("")}</tr>`;
        })
        .join("");
      return `<tr class="group"><th colspan="${compact ? 3 : 5}">${escapeHtml(group)}</th></tr>${rows}`;
    })
    .join("");
  table.innerHTML = `${head}<tbody>${body}</tbody>`;
}

// ---------- Ranking ----------

/**
 * @typedef {{ label: string, points: number, kind?: "you" | "reference" | "other", detail?: string }} RankEntry
 */

/** @param {HTMLElement} list @param {RankEntry[]} entries */
export function renderRanking(list, entries) {
  const top = Math.max(1, ...entries.map((e) => e.points));
  list.innerHTML = entries
    .map(
      (e) => `<li class="rank ${e.kind === "you" ? "is-you" : e.kind === "reference" ? "is-reference" : ""}">
        <span class="rank__name" title="${escapeHtml(e.detail ?? e.label)}">${escapeHtml(e.label)}</span>
        <span class="rank__points">${formatPoints(e.points)}</span>
        <span class="rank__bar"><span style="width:${(e.points / top) * 100}%"></span></span>
      </li>`
    )
    .join("");
}

// ---------- Stability chart ----------

/** @param {HTMLCanvasElement} canvas @param {number[]} passes */
export function drawPasses(canvas, passes) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  if (passes.length === 0) return;
  const max = Math.max(...passes) * 1.05;
  const min = Math.min(...passes) * 0.9;
  const pad = 28;
  const x = (/** @type {number} */ i) =>
    pad + (passes.length === 1 ? (w - pad * 2) / 2 : (i / (passes.length - 1)) * (w - pad * 2));
  const y = (/** @type {number} */ v) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);

  ctx.strokeStyle = "#262b33";
  ctx.fillStyle = "#7c8592";
  ctx.font = "12px JetBrains Mono, monospace";
  for (let k = 0; k <= 3; k++) {
    const v = min + ((max - min) * k) / 3;
    ctx.beginPath();
    ctx.moveTo(pad, y(v));
    ctx.lineTo(w - pad, y(v));
    ctx.stroke();
    ctx.fillText(String(Math.round(v)), 0, y(v) - 3);
  }
  ctx.strokeStyle = "#ff8a3d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  passes.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
  ctx.stroke();
  ctx.fillStyle = "#ff8a3d";
  passes.forEach((v, i) => {
    ctx.beginPath();
    ctx.arc(x(i), y(v), 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ---------- Tile brackets ----------

/**
 * Corner brackets around a tile being rendered, like a bucket renderer.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number }} t
 */
export function drawBracket(ctx, t) {
  const len = Math.min(14, t.w / 3, t.h / 3);
  ctx.strokeStyle = "#ff8a3d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const x0 = t.x + 1;
  const y0 = t.y + 1;
  const x1 = t.x + t.w - 1;
  const y1 = t.y + t.h - 1;
  ctx.moveTo(x0, y0 + len);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x0 + len, y0);
  ctx.moveTo(x1 - len, y0);
  ctx.lineTo(x1, y0);
  ctx.lineTo(x1, y0 + len);
  ctx.moveTo(x1, y1 - len);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1 - len, y1);
  ctx.moveTo(x0 + len, y1);
  ctx.lineTo(x0, y1);
  ctx.lineTo(x0, y1 - len);
  ctx.stroke();
}

// ---------- Hardware guess ----------

/**
 * @param {HTMLElement} root
 * @param {Awaited<ReturnType<typeof import("../bench/hardware.js").runHardwareTest>>} r
 * @param {{ deviceType: string, gpu: string, memoryGB: number }} extra
 */
export function renderGuess(root, r, extra) {
  const candidates = r.candidates
    .map((c) => {
      const [first, ...rest] = c.names;
      return `<div class="candidate">
        <div class="candidate__top">
          <p class="candidate__name">${escapeHtml(first)}</p>
          <span class="candidate__pct">${c.confidence}%</span>
        </div>
        ${rest.length ? `<p class="candidate__also">or ${escapeHtml(rest.join(", "))}: same cores and caches, so the test can't tell them apart</p>` : ""}
        <span class="rank__bar"><span style="width:${c.confidence}%"></span></span>
        ${c.reasons.length ? `<p class="candidate__why">Matches: ${escapeHtml(c.reasons.join(", "))}</p>` : ""}
      </div>`;
    })
    .join("");

  const levelNames = r.levels.length >= 3 ? ["L1", "L2", "L3"] : ["L1", "L2", "L3"].slice(0, r.levels.length);
  const caches = r.levels
    .map(
      (l, i) =>
        `${levelNames[i] ?? `L${i + 1}`} ${formatCacheSize(l.sizeBytes)} · ${l.latencyNs.toFixed(1)} ns`
    )
    .join("<br>");
  const cores = `${r.cores.physical} ${r.cores.hybrid ? "fast " : ""}core${r.cores.physical === 1 ? "" : "s"}, ${r.measured.threads} threads${
    r.cores.smt ? " (hyper-threading)" : r.cores.hybrid ? " (plus slower efficiency cores)" : ""
  }`;
  const rows = [
    ["Device", extra.deviceType],
    ["Cores", cores],
    ["Caches (measured)", caches || "–"],
    ["Memory latency", Number.isFinite(r.memoryNs) ? `${r.memoryNs.toFixed(0)} ns` : "–"],
    ["Memory bandwidth", `${r.gbPerSecond.toFixed(1)} GB/s (one thread)`],
    [
      "Memory installed",
      extra.memoryGB ? (extra.memoryGB >= 8 ? "8 GB or more" : `About ${extra.memoryGB} GB`) : "Not exposed",
    ],
    ["GPU", extra.gpu],
  ];
  root.innerHTML = `
    <div class="guess__card">
      <h3>Processor: best guesses</h3>
      ${candidates || "<p>No match. Your CPU may be newer than the table.</p>"}
    </div>
    <div class="guess__card">
      <h3>What the tests found</h3>
      <table class="measured"><tbody>${rows
        .map(
          ([k, v]) =>
            `<tr><td>${escapeHtml(k)}</td><td>${k.startsWith("Caches") ? v : escapeHtml(v)}</td></tr>`
        )
        .join("")}</tbody></table>
    </div>
    <div class="guess__card guess__chart">
      <h3>Memory latency by size</h3>
      <canvas width="1200" height="220" data-latency-chart></canvas>
    </div>
    <p class="guess__note">A guess from timing, not a readout: other busy apps, power saving and browser limits can move the numbers. The CPU table covers common Intel, AMD and Apple chips from 2018 on.</p>`;
  drawLatency(
    /** @type {HTMLCanvasElement} */ (root.querySelector("[data-latency-chart]")),
    r.points,
    r.levels
  );
}

/**
 * Time per read against data size, log scale on both axes. Flat steps are caches.
 * @param {HTMLCanvasElement} canvas
 * @param {{ bytes: number, ns: number }[]} points
 * @param {{ sizeBytes: number }[]} levels
 */
export function drawLatency(canvas, points, levels) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  if (points.length < 2) return;
  const pad = { left: 52, right: 16, top: 12, bottom: 30 };
  const xs = points.map((p) => Math.log2(p.bytes));
  const ys = points.map((p) => Math.log10(p.ns));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.floor(Math.min(...ys) * 2) / 2, Math.ceil(Math.max(...ys) * 2) / 2];
  const X = (/** @type {number} */ v) => pad.left + ((v - x0) / (x1 - x0)) * (w - pad.left - pad.right);
  const Y = (/** @type {number} */ v) =>
    h - pad.bottom - ((v - y0) / (y1 - y0 || 1)) * (h - pad.top - pad.bottom);

  ctx.font = "12px JetBrains Mono, monospace";
  ctx.fillStyle = "#7c8592";
  ctx.strokeStyle = "#262b33";
  for (const ns of [0.5, 1, 2, 5, 10, 20, 50, 100, 200]) {
    const v = Math.log10(ns);
    if (v < y0 || v > y1) continue;
    ctx.beginPath();
    ctx.moveTo(pad.left, Y(v));
    ctx.lineTo(w - pad.right, Y(v));
    ctx.stroke();
    ctx.fillText(`${ns} ns`, 2, Y(v) + 4);
  }
  for (let e = Math.ceil(x0); e <= x1; e += 2) {
    const label = e >= 20 ? `${2 ** (e - 20)} MB` : `${2 ** (e - 10)} KB`;
    ctx.fillText(label, X(e) - 14, h - 8);
  }
  // Detected cache sizes
  ctx.strokeStyle = "rgba(90, 176, 255, 0.55)";
  ctx.setLineDash([4, 4]);
  for (const l of levels) {
    const x = X(Math.log2(l.sizeBytes));
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, h - pad.bottom);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = "#ff8a3d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(X(xs[i]), Y(ys[i])) : ctx.moveTo(X(xs[i]), Y(ys[i]))));
  ctx.stroke();
}
