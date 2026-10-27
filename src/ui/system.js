// Gathers everything the browser will say about this machine, grouped like a
// system summary. Each value notes how it was found; nothing is guessed.

import { appleChip, cleanGpuName, formatBytes, parseUserAgent } from "../core/device.js";

/** @typedef {{ label: string, value: string, note?: string }} Row */
/** @typedef {{ title: string, rows: Row[] }} Section */

const yes = (/** @type {boolean} */ v) => (v ? "Yes" : "No");

function webglInfo() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return null;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const vendor = debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const info = {
      renderer: String(renderer),
      vendor: String(vendor),
      version: String(gl.getParameter(gl.VERSION)),
      maxTexture: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
      maxViewport: /** @type {Int32Array} */ (gl.getParameter(gl.MAX_VIEWPORT_DIMS)),
    };
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return info;
  } catch {
    return null;
  }
}

async function webgpuInfo() {
  const gpu = /** @type {any} */ (navigator).gpu;
  if (!gpu) return null;
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return null;
    const info = adapter.info ?? {};
    return {
      vendor: info.vendor || "",
      architecture: info.architecture || "",
      description: info.description || "",
      maxBuffer: Number(adapter.limits?.maxBufferSize ?? 0),
      maxWorkgroup: Number(adapter.limits?.maxComputeInvocationsPerWorkgroup ?? 0),
    };
  } catch {
    return null;
  }
}

async function clientHints() {
  const data = /** @type {any} */ (navigator).userAgentData;
  if (!data?.getHighEntropyValues) return null;
  try {
    return await data.getHighEntropyValues([
      "architecture",
      "bitness",
      "model",
      "platformVersion",
      "fullVersionList",
    ]);
  } catch {
    return null;
  }
}

/** Measures the display's refresh rate from animation frames. */
function refreshRate() {
  return new Promise((resolve) => {
    const times = /** @type {number[]} */ ([]);
    const tick = (/** @type {number} */ t) => {
      times.push(t);
      if (times.length < 40) requestAnimationFrame(tick);
      else {
        const gaps = times
          .slice(1)
          .map((v, i) => v - times[i])
          .sort((a, b) => a - b);
        const typical = gaps[Math.floor(gaps.length / 2)];
        resolve(typical > 0 ? Math.round(1000 / typical) : NaN);
      }
    };
    requestAnimationFrame(tick);
    setTimeout(() => resolve(NaN), 2000);
  });
}

function wasmFeatures() {
  const valid = (/** @type {number[]} */ bytes) => {
    try {
      return WebAssembly.validate(new Uint8Array(bytes));
    } catch {
      return false;
    }
  };
  // Minimal modules that use one feature each.
  const simd = valid([
    0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98,
    11,
  ]);
  const threads = typeof SharedArrayBuffer === "function" && crossOriginIsolated;
  return { simd, threads };
}

/**
 * Everything at once, for the System tab and the benchmark sidebar.
 * @returns {Promise<{ sections: Section[], summary: { threads: number, gpu: string, os: string, browser: string, chip: string | null } }>}
 */
export async function collectSystem() {
  const ua = parseUserAgent(navigator.userAgent);
  const [hints, gpu2, hz] = await Promise.all([clientHints(), webgpuInfo(), refreshRate()]);
  const gl = webglInfo();
  const threads = navigator.hardwareConcurrency || 0;
  const memory = /** @type {any} */ (navigator).deviceMemory;
  const gpuName = cleanGpuName(gl?.renderer ?? "");
  const chip = appleChip(gpuName);
  const wasm = wasmFeatures();

  const brand = hints?.fullVersionList?.find((b) => !/Not.?A.?Brand|Chromium/i.test(b.brand));
  const browser = brand
    ? `${brand.brand} ${brand.version.split(".")[0]}`
    : `${ua.browser} ${ua.browserVersion}`.trim();
  const osVersion = hints?.platformVersion
    ? ua.os === "Windows"
      ? Number(hints.platformVersion.split(".")[0]) >= 13
        ? "11"
        : "10"
      : hints.platformVersion
    : ua.osVersion;
  const os = `${ua.os}${osVersion ? ` ${osVersion}` : ""}`;

  const storage = await navigator.storage?.estimate().catch(() => null);
  const connection = /** @type {any} */ (navigator).connection;
  /** @type {any} */
  const battery = await /** @type {any} */ (navigator).getBattery?.().catch(() => null);

  /** @type {Section[]} */
  const sections = [
    {
      title: "Processor",
      rows: [
        {
          label: "Model",
          value: chip ?? "Not exposed by the browser",
          note: chip
            ? "From the GPU name (Apple Silicon)"
            : "Type it in the benchmark panel to label your results",
        },
        {
          label: "Logical processors",
          value: threads ? String(threads) : "Unknown",
          note: "navigator.hardwareConcurrency",
        },
        {
          label: "Architecture",
          value: hints?.architecture ? `${hints.architecture} (${hints.bitness}-bit)` : "Unknown",
          note: "Client hints",
        },
        { label: "WebAssembly SIMD", value: yes(wasm.simd) },
        { label: "Shared memory threads", value: yes(wasm.threads), note: "Needs cross-origin isolation" },
      ],
    },
    {
      title: "Graphics",
      rows: [
        { label: "GPU", value: gpuName, note: "WebGL renderer string" },
        { label: "Vendor", value: gl?.vendor ? cleanGpuName(gl.vendor) : "Unknown" },
        { label: "WebGL", value: gl?.version ?? "Not available" },
        { label: "Max texture size", value: gl ? `${gl.maxTexture} × ${gl.maxTexture}` : "–" },
        {
          label: "WebGPU",
          value: gpu2
            ? `Yes${gpu2.architecture ? ` (${gpu2.vendor} ${gpu2.architecture})` : ""}`
            : "Not available",
        },
        { label: "WebGPU max buffer", value: gpu2?.maxBuffer ? formatBytes(gpu2.maxBuffer) : "–" },
      ],
    },
    {
      title: "Memory",
      rows: [
        {
          label: "Installed (approx.)",
          value: memory ? `${memory >= 8 ? "8 GB or more" : `${memory} GB`}` : "Not exposed",
          note: "navigator.deviceMemory, capped at 8 for privacy",
        },
        {
          label: "JavaScript heap limit",
          value: /** @type {any} */ (performance).memory
            ? formatBytes(/** @type {any} */ (performance).memory.jsHeapSizeLimit)
            : "Not exposed",
        },
      ],
    },
    {
      title: "Display",
      rows: [
        { label: "Resolution", value: `${screen.width} × ${screen.height}` },
        { label: "Pixel ratio", value: `${devicePixelRatio}×` },
        {
          label: "Rendered at",
          value: `${Math.round(screen.width * devicePixelRatio)} × ${Math.round(screen.height * devicePixelRatio)}`,
        },
        {
          label: "Refresh rate",
          value: Number.isFinite(hz) ? `${hz} Hz` : "Unknown",
          note: "Measured from animation frames",
        },
        {
          label: "Colour gamut",
          value: matchMedia("(color-gamut: rec2020)").matches
            ? "Rec. 2020"
            : matchMedia("(color-gamut: p3)").matches
              ? "Display P3"
              : "sRGB",
        },
        { label: "HDR", value: yes(matchMedia("(dynamic-range: high)").matches) },
        { label: "Colour depth", value: `${screen.colorDepth}-bit` },
      ],
    },
    {
      title: "Operating system and browser",
      rows: [
        { label: "Operating system", value: os },
        { label: "Browser", value: browser },
        { label: "Language", value: navigator.language },
        { label: "Time zone", value: Intl.DateTimeFormat().resolvedOptions().timeZone },
        { label: "Touch points", value: String(navigator.maxTouchPoints) },
        { label: "Precise timers", value: yes(crossOriginIsolated), note: "Cross-origin isolated" },
      ],
    },
    {
      title: "Storage and network",
      rows: [
        {
          label: "Storage this site may use",
          value: storage?.quota ? formatBytes(storage.quota) : "Unknown",
        },
        {
          label: "Connection",
          value: connection?.effectiveType ? connection.effectiveType.toUpperCase() : "Not exposed",
        },
        { label: "Downlink (estimate)", value: connection?.downlink ? `${connection.downlink} Mbit/s` : "–" },
        {
          label: "Round trip (estimate)",
          value: connection?.rtt !== undefined ? `${connection.rtt} ms` : "–",
        },
      ],
    },
    {
      title: "Power",
      rows: battery
        ? [
            { label: "Battery", value: `${Math.round(battery.level * 100)}%` },
            { label: "Charging", value: yes(battery.charging) },
          ]
        : [{ label: "Battery", value: "Not exposed (or no battery)" }],
    },
  ];

  return { sections, summary: { threads, gpu: gpuName, os, browser, chip } };
}
