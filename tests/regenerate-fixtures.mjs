import { readFileSync, writeFileSync } from 'node:fs';
import initManifold from 'manifold-3d';
import { FontOutlines, generateLabel } from '../src/geometry.ts';
import { defaults } from '../src/types.ts';

const fontPath = process.env.MAILBOX_TEST_FONT ?? '/Library/Fonts/SF-Pro-Rounded-Bold.otf';
const wasm = await initManifold();
wasm.setup();
const font = new FontOutlines(Uint8Array.from(readFileSync(fontPath)).buffer);

const examples = [
  ['48-example', '48', ['EXAMPLE']],
  ['50-sample', '50', ['SAMPLE']],
  ['52-placeholder', '52', ['PLACEHOLDER']],
  ['54-alpha-beta', '54', ['ALPHA', 'BETA']],
];

for (const [slug, unit, names] of examples) {
  const result = generateLabel(wasm, font, { unit, names, settings: { ...defaults } });
  const fixture = {
    units: 'mm',
    settings: {
      width: defaults.width,
      height: defaults.height,
      radius: defaults.radius,
      base_thickness: defaults.baseThickness,
      text_thickness: defaults.textThickness,
      number_pt: defaults.numberPt,
      name_pt: defaults.namePt,
      margin: defaults.margin,
      tolerance: 0.01,
      fit: defaults.fit,
    },
    rows: result.rows.map(row => ({
      text: row.text,
      requested_pt: row.requestedPt,
      effective_pt: row.effectivePt,
      bounds_mm: row.bounds,
    })),
    volume_mm3: result.volume,
    triangles: result.triangles,
    color_change_z_mm: defaults.baseThickness,
    bounds_mm: [...result.bounds.min, ...result.bounds.max],
  };
  writeFileSync(new URL(`./fixtures/${slug}.json`, import.meta.url), `${JSON.stringify(fixture, null, 2)}\n`);
}
