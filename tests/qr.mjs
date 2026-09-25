export function rasterizeQrBack(mesh, settings, size = 35, pixels = 410) {
  const data = new Uint8ClampedArray(pixels*pixels*4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const left = (settings.width-size)/2, bottom = (settings.height-size)/2;
  const edge = (a, b, x, y) => (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const vertices = [0, 1, 2].map(j => Array.from(mesh.positions.slice(mesh.indices[i+j]*3, mesh.indices[i+j]*3+3)));
    if (vertices.some(p => Math.abs(p[2]) > 1e-7)) continue;
    const points = vertices.map(([x, y]) => [(settings.width-x-left)/size*pixels, (settings.height-y-bottom)/size*pixels]);
    const xmin = Math.max(0, Math.floor(Math.min(...points.map(p => p[0]))));
    const xmax = Math.min(pixels-1, Math.ceil(Math.max(...points.map(p => p[0]))));
    const ymin = Math.max(0, Math.floor(Math.min(...points.map(p => p[1]))));
    const ymax = Math.min(pixels-1, Math.ceil(Math.max(...points.map(p => p[1]))));
    for (let y = ymin; y <= ymax; y++) for (let x = xmin; x <= xmax; x++) {
      const signs = points.map((p, j) => edge(p, points[(j+1)%3], x+0.5, y+0.5));
      if (signs.every(n => n >= -1e-6) || signs.every(n => n <= 1e-6)) {
        const offset = (y*pixels+x)*4;
        data[offset] = data[offset+1] = data[offset+2] = 255;
      }
    }
  }
  return { data, width: pixels, height: pixels };
}
