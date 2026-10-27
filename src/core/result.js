// @ts-check
// A finished result: how it is shared in a link and checked before the
// leaderboard accepts it. The same checks run in the browser and on the server.

/**
 * @typedef {object} Result
 * @property {"multi" | "single"} test
 * @property {number} points
 * @property {number} seconds
 * @property {number} threads
 * @property {string} [cpuName]
 * @property {string} [gpu]
 * @property {string} [os]
 * @property {string} [browser]
 */

export const NAME_MAX = 48;

/** Keeps a user-typed CPU name readable and harmless. @param {unknown} value */
export function cleanName(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} ()+\-.,®™@/_]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);
}

/** @param {unknown} value @param {number} max */
const cleanText = (value, max) =>
  typeof value === "string"
    ? value
        .replace(/[^\w .,()+\-/]/g, "")
        .trim()
        .slice(0, max)
    : "";

/**
 * Checks a result is well formed and physically plausible. Returns the cleaned
 * result, or the reasons it was rejected.
 * @param {unknown} input
 * @returns {{ ok: true, result: Result } | { ok: false, errors: string[] }}
 */
export function validateResult(input) {
  const errors = [];
  const r = /** @type {Record<string, unknown>} */ (input && typeof input === "object" ? input : {});
  const test = r.test;
  if (test !== "multi" && test !== "single") errors.push("test must be multi or single");
  const points = Number(r.points);
  const seconds = Number(r.seconds);
  const threads = Number(r.threads);
  if (!Number.isInteger(points) || points <= 0) errors.push("points must be a positive whole number");
  if (!Number.isFinite(seconds) || seconds < 1) errors.push("seconds must be at least 1");
  if (!Number.isInteger(threads) || threads < 1 || threads > 512)
    errors.push("threads must be between 1 and 512");

  // Plausibility: points per thread far beyond any real core means a forged or broken run.
  const maxPerThread = 900;
  if (errors.length === 0) {
    const perThread = test === "single" ? points : points / threads;
    if (perThread > maxPerThread) errors.push("score is not plausible for this many threads");
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    result: {
      test: /** @type {"multi" | "single"} */ (test),
      points,
      seconds: Math.round(seconds * 10) / 10,
      threads,
      cpuName: cleanName(r.cpuName) || undefined,
      gpu: cleanText(r.gpu, 80) || undefined,
      os: cleanText(r.os, 40) || undefined,
      browser: cleanText(r.browser, 40) || undefined,
    },
  };
}

/** @param {string} text */
const toBase64Url = (text) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** @param {string} b64 */
const fromBase64Url = (b64) => {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/**
 * Both scores in one compact link: "#r=eyJt…".
 * @param {{ multi?: number, single?: number, threads: number, cpuName?: string, gpu?: string, os?: string, browser?: string }} card
 */
export function encodeCard(card) {
  return `#r=${toBase64Url(JSON.stringify(card))}`;
}

/**
 * @param {string} hash
 * @returns {{ multi?: number, single?: number, threads: number, cpuName?: string, gpu?: string, os?: string, browser?: string } | null}
 */
export function decodeCard(hash) {
  const m = hash.match(/[#&]r=([\w-]+)/);
  if (!m) return null;
  try {
    const raw = JSON.parse(fromBase64Url(m[1]));
    const card = {
      multi: Number.isInteger(raw.multi) && raw.multi > 0 ? raw.multi : undefined,
      single: Number.isInteger(raw.single) && raw.single > 0 ? raw.single : undefined,
      threads: Number.isInteger(raw.threads) && raw.threads > 0 && raw.threads <= 512 ? raw.threads : 0,
      cpuName: cleanName(raw.cpuName) || undefined,
      gpu: cleanText(raw.gpu, 80) || undefined,
      os: cleanText(raw.os, 40) || undefined,
      browser: cleanText(raw.browser, 40) || undefined,
    };
    if (!card.multi && !card.single) return null;
    return card;
  } catch {
    return null;
  }
}
