import { describe, expect, it } from "vitest";
import { NAME_MAX, cleanName, decodeCard, encodeCard } from "../src/core/result.js";

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
