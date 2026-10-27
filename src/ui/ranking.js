// Hardware standards, a reference run and your own best results, side by side.
// Everything stays on this device.

import { REFERENCE } from "../data/reference.js";
import { STANDARDS } from "../data/standards.js";
import { deviceLabel } from "../core/device.js";

const HISTORY_KEY = "bench-lab:history";
const LIMIT = 12;

/** @typedef {import("./views.js").RankEntry} RankEntry */
/** @typedef {{ test: "multi" | "single", points: number, seconds: number, threads: number, at: number, cpuName?: string }} HistoryEntry */

/** @returns {HistoryEntry[]} */
export function loadHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** @param {HistoryEntry} entry */
export function saveToHistory(entry) {
  try {
    const list = [entry, ...loadHistory()].slice(0, 50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // Private mode or storage blocked: the result still shows for this visit.
  }
}

/**
 * Builds the list shown in the sidebar.
 * @param {"multi" | "single"} test
 * @param {{ points: number, label: string } | null} you
 * @returns {RankEntry[]}
 */
export function buildRanking(test, you) {
  /** @type {RankEntry[]} */
  const entries = [
    ...STANDARDS.map((s) => ({
      label: s.name,
      points: s[test],
      detail: s.hardware,
      kind: /** @type {const} */ ("standard"),
    })),
    ...REFERENCE.filter((r) => r.test === test).map((r) => ({
      label: r.label,
      points: r.points,
      detail: r.detail,
      kind: /** @type {const} */ ("reference"),
    })),
  ];
  entries.sort((a, b) => b.points - a.points);
  const top = entries.slice(0, LIMIT - (you ? 1 : 0));
  if (you) top.push({ label: `${you.label} (you)`, points: you.points, kind: "you" });
  return top.sort((a, b) => b.points - a.points);
}

/** @param {{ cpuName?: string, gpu?: string, threads?: number, os?: string }} info */
export const yourLabel = (info) => deviceLabel(info);
