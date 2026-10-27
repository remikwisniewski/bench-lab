import { defineConfig } from "vite";

// Cross-origin isolation: browsers only give precise timers and SharedArrayBuffer
// to pages that send these two headers. vercel.json sets the same in production.
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: "es" },
});
