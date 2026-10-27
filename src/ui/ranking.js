// Your past results, kept in this browser, and the label used for your device.

import { deviceLabel } from "../core/device.js";

const HISTORY_KEY = "bench-lab:history";

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

/** @param {{ cpuName?: string, gpu?: string, threads?: number, os?: string }} info */
export const yourLabel = (info) => deviceLabel(info);
