import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  { ignores: ["dist/", "coverage/", "node_modules/", ".vercel/"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-var": "error",
      "prefer-const": "error",
      "object-shorthand": "error",
      eqeqeq: ["error", "always"],
    },
  },
  {
    // The core is pure logic shared by the page, the workers, the API and the tests.
    files: ["src/core/**/*.js"],
    languageOptions: {
      globals: { TextEncoder: "readonly", TextDecoder: "readonly", btoa: "readonly", atob: "readonly" },
    },
  },
  {
    // Benchmarks run inside Web Workers.
    files: ["src/bench/**/*.js"],
    languageOptions: { globals: { ...globals.worker } },
  },
  {
    files: ["scripts/**/*.js", "tests/**/*.js", "*.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  // Turns off style rules that Prettier owns. Must stay last.
  prettier,
];
