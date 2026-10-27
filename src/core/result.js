// @ts-check
// Results in share links: tidy names in, and nothing harmful out of a link
// someone else made.

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
