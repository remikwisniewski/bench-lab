// @ts-check
// The image is cut into square tiles ("buckets"). Threads take the next tile in
// a spiral from the centre outwards, so the picture grows from the middle.

/** @typedef {{ index: number, x: number, y: number, w: number, h: number }} Tile */

/**
 * @param {number} width
 * @param {number} height
 * @param {number} size
 * @returns {Tile[]}
 */
export function tileGrid(width, height, size) {
  /** @type {Tile[]} */
  const tiles = [];
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      tiles.push({ index: tiles.length, x, y, w: Math.min(size, width - x), h: Math.min(size, height - y) });
    }
  }
  return tiles;
}

/**
 * Orders tiles in rings around the image centre, each ring swept clockwise
 * starting from the top, like a bucket renderer.
 * @param {Tile[]} tiles
 * @param {number} width
 * @param {number} height
 */
export function spiralOrder(tiles, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const key = (/** @type {Tile} */ t) => {
    const dx = t.x + t.w / 2 - cx;
    const dy = t.y + t.h / 2 - cy;
    // Chebyshev distance in tile units gives square rings; aspect-correct the width.
    const ring = Math.round(Math.max(Math.abs(dx) * (height / width), Math.abs(dy)) / Math.max(1, t.h));
    const angle = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
    return { ring, angle };
  };
  return tiles
    .map((tile) => ({ tile, ...key(tile) }))
    .sort((a, b) => a.ring - b.ring || a.angle - b.angle || a.tile.index - b.tile.index)
    .map((k) => k.tile);
}
