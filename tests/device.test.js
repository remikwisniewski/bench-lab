import { describe, expect, it } from "vitest";
import { appleChip, cleanGpuName, deviceLabel, formatBytes, parseUserAgent } from "../src/core/device.js";

const UA = {
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1",
  android:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
  oldWindows: "Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0",
};

describe("parseUserAgent", () => {
  it.each([
    ["chromeWindows", "Windows", "Chrome", "141"],
    ["edge", "Windows", "Edge", "141"],
    ["safariMac", "macOS", "Safari", "18"],
    ["iphone", "iOS", "Safari", "18"],
    ["android", "Android", "Chrome", "141"],
    ["firefoxLinux", "Linux", "Firefox", "140"],
    ["oldWindows", "Windows", "Firefox", "115"],
  ])("reads %s", (key, os, browser, version) => {
    const info = parseUserAgent(UA[key]);
    expect(info.os).toBe(os);
    expect(info.browser).toBe(browser);
    expect(info.browserVersion).toBe(version);
  });

  it("reads versions where the UA gives them", () => {
    expect(parseUserAgent(UA.iphone).osVersion).toBe("18.4");
    expect(parseUserAgent(UA.oldWindows).osVersion).toBe("6.1");
    expect(parseUserAgent("curl/8.0")).toEqual({
      os: "Unknown",
      osVersion: "",
      browser: "Unknown",
      browserVersion: "",
    });
  });
});

describe("cleanGpuName", () => {
  it("unwraps ANGLE strings and drops driver noise", () => {
    expect(
      cleanGpuName("ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)")
    ).toBe("NVIDIA GeForce RTX 3070");
    expect(cleanGpuName("ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)")).toBe(
      "Apple M2"
    );
    expect(cleanGpuName("Mesa Intel(R) UHD Graphics 630 (CFL GT2)")).toBe(
      "Mesa Intel(R) UHD Graphics 630 (CFL GT2)"
    );
    expect(cleanGpuName("GeForce GTX 1080/PCIe/SSE2")).toBe("GeForce GTX 1080");
    expect(cleanGpuName("Google Inc. (NVIDIA Corporation)")).toBe("NVIDIA Corporation");
    expect(cleanGpuName("")).toBe("Unknown");
    expect(cleanGpuName("ANGLE (single)")).toBe("single");
  });
});

describe("appleChip and deviceLabel", () => {
  it("names Apple Silicon from its GPU", () => {
    expect(appleChip("Apple M2 Pro")).toBe("Apple M2 Pro");
    expect(appleChip("ANGLE Metal Renderer: Apple M3")).toBe("Apple M3");
    expect(appleChip("Apple A17 Pro GPU")).toBe("Apple A17");
    expect(appleChip("NVIDIA GeForce RTX 3070")).toBeNull();
  });

  it("prefers the name the user gave", () => {
    expect(deviceLabel({ cpuName: "Intel Core i9-9900K", threads: 16 })).toBe("Intel Core i9-9900K");
    expect(deviceLabel({ gpu: "Apple M2", threads: 8, os: "macOS" })).toBe("Apple M2 · 8 threads");
    expect(deviceLabel({ threads: 16, os: "Linux" })).toBe("Linux device · 16 threads");
    expect(deviceLabel({})).toBe("Unknown device");
  });
});

describe("formatBytes", () => {
  it("uses binary units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(8 * 1024 ** 3)).toBe("8.0 GB");
    expect(formatBytes(300 * 1024 ** 3)).toBe("300 GB");
    expect(formatBytes(-1)).toBe("–");
  });
});
