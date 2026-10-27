// A rev-counter style dial: blue at the slow end, red at the fast end, with the
// classes of PC marked around it and a needle that sweeps up to your score.

const NS = "http://www.w3.org/2000/svg";
const CX = 120;
const CY = 118;
const R = 96;
const START = 210; // degrees, maths convention: the slow end, lower left
const SWEEP = 240; // round to the fast end, lower right

/** Angle in degrees for a position from 0 (slow) to 1 (fast). @param {number} t */
const angle = (t) => START - SWEEP * t;

/** @param {number} deg @param {number} r */
const point = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
};

/** Blue (slow) through cyan, green and yellow to red (fast). @param {number} t */
const colour = (t) => `hsl(${Math.round(215 - 215 * t)} 85% 55%)`;

/** @param {string} tag @param {Record<string, string | number>} attrs */
function el(tag, attrs) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * Draws the dial once; returns a function that moves the needle.
 * @param {SVGSVGElement} svg
 */
export function createGauge(svg) {
  svg.setAttribute("viewBox", "0 0 240 176");
  svg.textContent = "";

  // Background track, then the coloured band in short segments so the colour
  // follows the curve.
  const track = el("path", { d: arc(0, 1, R), class: "gauge__track" });
  svg.append(track);
  const segments = 48;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1.05) / segments;
    svg.append(
      el("path", { d: arc(t0, Math.min(1, t1), R), stroke: colour((t0 + t1) / 2), class: "gauge__band" })
    );
  }
  const marks = el("g", { class: "gauge__marks" });
  svg.append(marks);

  const needle = el("g", { class: "gauge__needle" });
  needle.append(el("polygon", { points: `${CX - 10},${CY - 3} ${CX + 86},${CY} ${CX - 10},${CY + 3}` }));
  needle.append(el("circle", { cx: CX, cy: CY, r: 7, class: "gauge__hub" }));
  svg.append(needle);

  const units = el("text", { x: CX, y: CY - 30, class: "gauge__units", "text-anchor": "middle" });
  svg.insertBefore(units, needle);
  const readout = el("text", { x: CX, y: CY + 38, class: "gauge__readout", "text-anchor": "middle" });
  const unit = el("text", { x: CX, y: CY + 52, class: "gauge__unit", "text-anchor": "middle" });
  svg.append(readout, unit);

  /**
   * @param {{ position: number, marks: { label: string, at: number }[], unitLabel: string }} scale
   * @param {number} score
   */
  return function update(scale, score) {
    marks.textContent = "";
    scale.marks.forEach((m, i) => {
      const deg = angle(m.at);
      const [x1, y1] = point(deg, R - 10);
      const [x2, y2] = point(deg, R - 22);
      marks.append(el("line", { x1, y1, x2, y2, class: "gauge__major" }));
      const [lx, ly] = point(deg, R - 32);
      const label = el("text", { x: lx, y: ly + 4, class: "gauge__label", "text-anchor": "middle" });
      label.textContent = m.label;
      marks.append(label);
      // A shorter tick halfway to the next number.
      const next = scale.marks[i + 1];
      if (next) {
        const mid = angle((m.at + next.at) / 2);
        const [a1, b1] = point(mid, R - 10);
        const [a2, b2] = point(mid, R - 16);
        marks.append(el("line", { x1: a1, y1: b1, x2: a2, y2: b2, class: "gauge__tick" }));
      }
    });
    units.textContent = scale.unitLabel;
    needle.style.transform = `rotate(${-angle(score > 0 ? scale.position : 0)}deg)`;
    readout.textContent = score > 0 ? Math.round(score).toLocaleString("en-US") : "–";
    unit.textContent = "pts";
    svg.setAttribute(
      "aria-label",
      score > 0 ? `Speed dial reading ${Math.round(score)} points` : "Speed dial: no score yet"
    );
  };
}

/** An arc of the dial from position t0 to t1 at radius r. @param {number} t0 @param {number} t1 @param {number} r */
function arc(t0, t1, r) {
  const [x0, y0] = point(angle(t0), r);
  const [x1, y1] = point(angle(t1), r);
  const large = SWEEP * (t1 - t0) > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}
