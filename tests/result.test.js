import { describe, expect, it } from "vitest";
import { NAME_MAX, cleanName, decodeCard, encodeCard, validateResult } from "../src/core/result.js";

const good = {
  test: "multi",
  points: 2800,
  seconds: 31.24,
  threads: 16,
  cpuName: "Intel Core i9-9900K",
  os: "Linux",
};

describe("validateResult", () => {
  it("accepts and tidies a real result", () => {
    const v = validateResult(good);
    expect(v.ok).toBe(true);
    expect(v.ok && v.result).toMatchObject({
      test: "multi",
      points: 2800,
      seconds: 31.2,
      threads: 16,
      cpuName: "Intel Core i9-9900K",
    });
  });

  it("rejects malformed results with reasons", () => {
    const v = validateResult({ test: "gpu", points: -1, seconds: 0, threads: 0 });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.errors).toHaveLength(4);
    expect(validateResult(null).ok).toBe(false);
  });

  it("rejects scores no real core could reach", () => {
    expect(validateResult({ ...good, points: 900 * 16 + 16 }).ok).toBe(false);
    expect(validateResult({ ...good, test: "single", points: 5000 }).ok).toBe(false);
    expect(validateResult({ ...good, test: "single", points: 300 }).ok).toBe(true);
  });

  it("drops empty optional fields", () => {
    const v = validateResult({ test: "single", points: 280, seconds: 17, threads: 16, cpuName: "   " });
    expect(v.ok && v.result.cpuName).toBeUndefined();
  });
});

describe("cleanName", () => {
  it("strips markup and odd characters and caps the length", () => {
    expect(cleanName("<script>alert(1)</script>Ryzen 7 7800X3D")).toBe(
      "scriptalert(1)/scriptRyzen 7 7800X3D"
    );
    // NFKC folds look-alike characters, so ™ becomes TM.
    expect(cleanName("Intel® Core™ i7-1185G7 @ 3.00GHz")).toBe("Intel® CoreTM i7-1185G7 @ 3.00GHz");
    expect(cleanName("x".repeat(100))).toHaveLength(NAME_MAX);
    expect(cleanName(42)).toBe("");
  });
});

describe("share cards", () => {
  it("round-trips through the URL hash", () => {
    const card = {
      multi: 2800,
      single: 275,
      threads: 16,
      cpuName: "Intel Core i9-9900K",
      os: "Linux",
      browser: "Chrome 141",
    };
    const hash = encodeCard(card);
    expect(hash).toMatch(/^#r=[\w-]+$/);
    expect(decodeCard(hash)).toEqual({ ...card, gpu: undefined });
  });

  it("rejects missing, broken or empty cards", () => {
    expect(decodeCard("")).toBeNull();
    expect(decodeCard("#r=!!!")).toBeNull();
    expect(decodeCard("#r=bm90LWpzb24")).toBeNull();
    expect(decodeCard(encodeCard({ threads: 8 }))).toBeNull();
  });

  it("sanitises a tampered card", () => {
    const hash = encodeCard({ multi: 2800.5, single: 300, threads: 9999, cpuName: "<b>x</b>" });
    expect(decodeCard(hash)).toMatchObject({ multi: undefined, single: 300, threads: 0, cpuName: "bx/b" });
  });
});
