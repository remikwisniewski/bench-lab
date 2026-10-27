// Rendering helpers for the System and Sensors views, the ranking and the
// stability chart. All text from outside the page goes through escapeHtml.

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
