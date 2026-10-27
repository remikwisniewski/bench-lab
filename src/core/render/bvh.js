// @ts-check
// A bounding volume hierarchy over the spheres, flattened into typed arrays so
// the tracer walks it without allocating. Without it every ray would test every
// sphere; with it a ray only visits the few boxes it actually passes through.

/**
 * @typedef {object} Bvh
 * @property {Float64Array} bounds  minX, minY, minZ, maxX, maxY, maxZ per node (stride 6)
 * @property {Int32Array} nodes     for each node: [left child | -1 for a leaf, right child or first item, item count]
 * @property {Int32Array} items     sphere indices, ordered so each leaf's items are contiguous
 * @property {number} nodeCount
 */

const LEAF_SIZE = 2;

/**
 * @param {Float64Array} spheres x, y, z, r (stride 4)
 * @param {number} count
 * @returns {Bvh}
 */
export function buildBvh(spheres, count) {
  const items = Int32Array.from({ length: count }, (_, i) => i);
  /** @type {number[]} */
  const bounds = [];
  /** @type {number[]} */
  const nodes = [];

  const centre = (/** @type {number} */ i, /** @type {number} */ axis) => spheres[i * 4 + axis];

  /** Builds the node covering items[start, end) and returns its index. */
  function build(/** @type {number} */ start, /** @type {number} */ end) {
    const index = nodes.length / 3;
    nodes.push(0, 0, 0);
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let k = start; k < end; k++) {
      const i = items[k] * 4;
      const r = Math.abs(spheres[i + 3]);
      minX = Math.min(minX, spheres[i] - r);
      minY = Math.min(minY, spheres[i + 1] - r);
      minZ = Math.min(minZ, spheres[i + 2] - r);
      maxX = Math.max(maxX, spheres[i] + r);
      maxY = Math.max(maxY, spheres[i + 1] + r);
      maxZ = Math.max(maxZ, spheres[i + 2] + r);
    }
    bounds.push(minX, minY, minZ, maxX, maxY, maxZ);

    if (end - start <= LEAF_SIZE) {
      nodes[index * 3] = -1;
      nodes[index * 3 + 1] = start;
      nodes[index * 3 + 2] = end - start;
      return index;
    }

    // Split on the longest axis at the median centre.
    const extents = [maxX - minX, maxY - minY, maxZ - minZ];
    const axis = extents.indexOf(Math.max(...extents));
    const slice = Array.from(items.subarray(start, end)).sort((a, b) => centre(a, axis) - centre(b, axis));
    items.set(slice, start);
    const mid = (start + end) >> 1;
    const left = build(start, mid);
    const right = build(mid, end);
    nodes[index * 3] = left;
    nodes[index * 3 + 1] = right;
    nodes[index * 3 + 2] = 0;
    return index;
  }

  if (count > 0) build(0, count);
  return {
    bounds: Float64Array.from(bounds),
    nodes: Int32Array.from(nodes),
    items,
    nodeCount: nodes.length / 3,
  };
}
