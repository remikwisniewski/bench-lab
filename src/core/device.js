// @ts-check
// Turning what the browser reports into readable system information.

/**
 * @typedef {object} BrowserInfo
 * @property {string} os
 * @property {string} osVersion
 * @property {string} browser
 * @property {string} browserVersion
 */

/**
 * Best-effort operating system and browser from a user-agent string. Client
 * hints are preferred when available; this is the fallback.
 * @param {string} ua
 * @returns {BrowserInfo}
 */
export function parseUserAgent(ua) {
  /** @type {[RegExp, string, ((m: RegExpMatchArray) => string)?][]} */
  const systems = [
    [/Windows NT 10\.0/, "Windows", () => "10 or 11"],
    [/Windows NT ([\d.]+)/, "Windows", (m) => m[1]],
    [/(?:iPhone|iPad|iPod).*? OS ([\d_]+)/, "iOS", (m) => m[1].replace(/_/g, ".")],
    [/Android ([\d.]+)/, "Android", (m) => m[1]],
    [/Mac OS X ([\d_.]+)/, "macOS", (m) => m[1].replace(/_/g, ".")],
    [/CrOS/, "ChromeOS"],
    [/Linux/, "Linux"],
  ];
  let os = "Unknown";
  let osVersion = "";
  for (const [pattern, name, version] of systems) {
    const m = ua.match(pattern);
    if (m) {
      os = name;
      osVersion = version ? version(m) : "";
      break;
    }
  }

  /** @type {[RegExp, string][]} */
  const browsers = [
    [/Edg\/([\d.]+)/, "Edge"],
    [/OPR\/([\d.]+)/, "Opera"],
    [/SamsungBrowser\/([\d.]+)/, "Samsung Internet"],
    [/Firefox\/([\d.]+)/, "Firefox"],
    [/FxiOS\/([\d.]+)/, "Firefox"],
    [/CriOS\/([\d.]+)/, "Chrome"],
    [/Chrome\/([\d.]+)/, "Chrome"],
    [/Version\/([\d.]+).*Safari/, "Safari"],
  ];
  let browser = "Unknown";
  let browserVersion = "";
  for (const [pattern, name] of browsers) {
    const m = ua.match(pattern);
    if (m) {
      browser = name;
      browserVersion = m[1].split(".")[0];
      break;
    }
  }
  return { os, osVersion, browser, browserVersion };
}

/**
 * Tidies a WebGL renderer string. Chrome wraps it as
 * "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)".
 * @param {string} renderer
 */
export function cleanGpuName(renderer) {
  if (!renderer) return "Unknown";
  let name = renderer.trim();
  const angle = name.match(/^ANGLE \((.*)\)$/);
  if (angle) {
    const parts = angle[1].split(", ");
    name = parts.length >= 2 ? parts[1] : parts[0];
  }
  const wrapped = name.match(/^Google Inc\. \((.+)\)$/);
  if (wrapped) name = wrapped[1];
  return (
    name
      .replace(/^ANGLE Metal Renderer:\s*/i, "")
      .replace(/\s*\(0x[0-9a-f]+\)/gi, "")
      .replace(/\s+(Direct3D|D3D|OpenGL|Vulkan|vs_|ps_).*$/i, "")
      .replace(/\s*\/PCIe\/SSE2/i, "")
      .replace(/\s+/g, " ")
      .trim() || "Unknown"
  );
}

/**
 * The likely chip for Apple Silicon, where the GPU name is the chip name.
 * @param {string} gpu
 */
export function appleChip(gpu) {
  const m = gpu.match(/Apple (M\d+(?: (?:Pro|Max|Ultra))?|A\d+\w*)/);
  return m ? `Apple ${m[1]}` : null;
}

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/**
 * A short label for a result: the CPU name if the user gave one, otherwise
 * what we can tell (chip or GPU, thread count, OS).
 * @param {{ cpuName?: string, gpu?: string, threads?: number, os?: string }} info
 */
export function deviceLabel(info) {
  if (info.cpuName) return info.cpuName;
  const chip = info.gpu ? appleChip(info.gpu) : null;
  const parts = [chip ?? (info.os ? `${info.os} device` : "Unknown device")];
  if (info.threads) parts.push(`${info.threads} threads`);
  return parts.join(" · ");
}
