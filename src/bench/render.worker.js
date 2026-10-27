// One render thread. It builds its own copy of the scene, then renders whatever
// tile it is given and sends the pixels back along with how many rays it traced.

import { createScene } from "../core/render/scene.js";
import { createTracer } from "../core/render/tracer.js";

/** @type {ReturnType<typeof createTracer> | null} */
let tracer = null;

self.onmessage = (event) => {
  const message = event.data;
  if (message.type === "init") {
    tracer = createTracer(createScene({ seed: message.sceneSeed }), {
      width: message.width,
      height: message.height,
    });
    self.postMessage({ type: "ready" });
    return;
  }
  if (message.type === "tile" && tracer) {
    const { tile, samples } = message;
    const pixels = new Uint8ClampedArray(tile.w * tile.h * 4);
    const start = performance.now();
    const rays = tracer.renderTile(tile.x, tile.y, tile.w, tile.h, samples, pixels);
    const ms = performance.now() - start;
    self.postMessage({ type: "done", tile, pixels, rays, ms }, [pixels.buffer]);
  }
};
