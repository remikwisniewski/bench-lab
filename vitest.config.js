import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      // The core (statistics, scoring, analysis, share links, validation) is pure
      // and carries the coverage bar. Workloads are checked for correctness in tests;
      // timing code is verified in the browser.
      include: ["src/core/**/*.js"],
      reporter: ["text", "html", "lcov"],
      thresholds: { lines: 95, functions: 95, statements: 95, branches: 90 },
    },
  },
});
