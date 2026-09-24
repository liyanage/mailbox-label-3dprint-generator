import assert from 'node:assert/strict';

export function inspectStl(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangles = view.getUint32(80, true);
  assert.equal(bytes.byteLength, 84 + 50 * triangles);
  const edges = new Map(), levels = new Set();
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let volume = 0;
  for (let i = 0; i < triangles; i++) {
    const offset = 84 + i * 50;
    const points = Array.from({ length: 3 }, (_, j) => Array.from({ length: 3 }, (_, k) => view.getFloat32(offset + 12 + j * 12 + k * 4, true)));
    for (const point of points) {
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(Number.isFinite(point[axis]));
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
      levels.add(point[2]);
    }
    const [a, b, c] = points;
    const cross = [(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]), (b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]), (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])];
    assert.ok(Math.hypot(...cross) > 0);
    const normal = [0, 1, 2].map(k => view.getFloat32(offset + k*4, true));
    assert.ok(normal.reduce((sum, n, k) => sum + n*cross[k], 0) > 0);
    volume += (a[0]*(b[1]*c[2]-b[2]*c[1]) + a[1]*(b[2]*c[0]-b[0]*c[2]) + a[2]*(b[0]*c[1]-b[1]*c[0])) / 6;
    for (let j = 0; j < 3; j++) {
      const a = points[j].join(','), b = points[(j+1)%3].join(',');
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const edge = edges.get(key) ?? { count: 0, winding: 0 };
      edge.count++; edge.winding += a < b ? 1 : -1;
      edges.set(key, edge);
    }
  }
  for (const edge of edges.values()) { assert.equal(edge.count, 2); assert.equal(edge.winding, 0); }
  assert.ok(volume > 0);
  return { triangles, min, max, levels: [...levels].sort((a, b) => a-b), volume };
}
