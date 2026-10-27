// The ranking: reference runs, the public leaderboard and your own results,
// merged into one list. Works offline: the leaderboard is optional.

import { REFERENCE } from "../data/reference.js";
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
 * @param {"multi" | "single"} test
 * @returns {Promise<{ entries: { label: string, points: number, detail: string }[], total: number } | null>}
 */
export async function fetchLeaderboard(test) {
  try {
    const res = await fetch(`/api/ranking?test=${test}`, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * @param {import("../core/result.js").Result} result
 * @returns {Promise<{ rank: number, total: number, percentile: number } | null>}
 */
export async function submitResult(result) {
  try {
    const res = await fetch("/api/results", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Builds the list shown in the sidebar.
 * @param {"multi" | "single"} test
 * @param {{ entries: { label: string, points: number, detail: string }[] } | null} board
 * @param {{ points: number, label: string } | null} you
 * @returns {RankEntry[]}
 */
export function buildRanking(test, board, you) {
  /** @type {RankEntry[]} */
  const entries = [
    ...REFERENCE.filter((r) => r.test === test).map((r) => ({
      label: r.label,
      points: r.points,
      detail: r.detail,
      kind: /** @type {const} */ ("reference"),
    })),
    ...(board?.entries ?? []).map((e) => ({
      label: e.label,
      points: e.points,
      detail: e.detail,
      kind: /** @type {const} */ ("other"),
    })),
  ];
  entries.sort((a, b) => b.points - a.points);
  const top = entries.slice(0, LIMIT - (you ? 1 : 0));
  if (you) top.push({ label: `${you.label} (you)`, points: you.points, kind: "you" });
  return top.sort((a, b) => b.points - a.points);
}

/** @param {{ cpuName?: string, gpu?: string, threads?: number, os?: string }} info */
export const yourLabel = (info) => deviceLabel(info);
