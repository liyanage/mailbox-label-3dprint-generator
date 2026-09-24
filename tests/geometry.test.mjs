import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import initManifold from 'manifold-3d';
import { FontOutlines, generateLabel } from '../src/geometry.ts';
import { defaults } from '../src/types.ts';
import { inspectStl } from './stl.mjs';

const fontPath = process.env.MAILBOX_TEST_FONT ?? '/Library/Fonts/SF-Pro-Rounded-Bold.otf';
const wasm = await initManifold();
wasm.setup();
const available = existsSync(fontPath);
const font = available ? new FontOutlines(Uint8Array.from(readFileSync(fontPath)).buffer) : null;
const options = { skip: available ? false : 'Set MAILBOX_TEST_FONT to SF-Pro-Rounded-Bold.otf to run geometry checks.' };
const generate = (unit, names, settings = {}) => generateLabel(wasm, font, { unit, names, settings: { ...defaults, ...settings } });

for (const file of readdirSync(new URL('./fixtures/', import.meta.url))) {
  test(`matches reference dimensions and lettering: ${file}`, options, () => {
    const reference = JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url)));
    const result = generate(reference.rows[0].text, reference.rows.slice(1).map(row => row.text));
    assert.equal(result.triangles, reference.triangles);
    assert.ok(Math.abs(result.volume - reference.volume_mm3) < 1e-6);
    result.rows.forEach((row, i) => row.bounds.forEach((n, j) => assert.ok(Math.abs(n-reference.rows[i].bounds_mm[j]) < 1e-6)));
    const mesh = inspectStl(new Uint8Array(result.stl));
    assert.deepEqual([...mesh.min, ...mesh.max], reference.bounds_mm);
    assert.deepEqual(mesh.levels, [0, 2, 3]);
    assert.ok(Math.abs(mesh.volume-result.volume) < 0.001);
  });
}

test('font validation rejects non-font data', () => {
  assert.throws(() => new FontOutlines(new ArrayBuffer(0)), /OpenType/);
  assert.throws(() => new FontOutlines(new TextEncoder().encode('not a font at all').buffer), /OpenType/);
});

test('long names shrink within margins, or report overflow', options, () => {
  const names = ['EXTRA-LONG-EXAMPLE-LABEL'];
  const result = generate('123A', names);
  assert.ok(result.rows[1].effectivePt < 20);
  assert.ok(result.rows[1].bounds[0] >= 3-1e-6);
  assert.ok(result.rows[1].bounds[2] <= 41.5+1e-6);
  inspectStl(new Uint8Array(result.stl));
  assert.throws(() => generate('123A', names, { fit: 'error' }), /too wide/);
});

test('invalid geometry and unsupported characters are rejected', options, () => {
  assert.throws(() => generate('', ['EXAMPLE']), /unit number/);
  assert.throws(() => generate('48', []), /one or two/);
  assert.throws(() => generate('48', ['A', 'B', 'C']), /one or two/);
  assert.throws(() => generate('48', ['EXAMPLE'], { width: NaN }), /valid number/);
  assert.throws(() => generate('48', ['EXAMPLE'], { radius: 25 }), /corner radius/);
  assert.throws(() => generate('48', ['EXAMPLE'], { margin: 25 }), /margin/);
  assert.throws(() => generate('48', ['EXAMPLE'], { baseThickness: 0 }), /Thickness/);
  assert.throws(() => generate('48', ['A', 'B'], { namePt: 40 }), /overlap/);
  assert.throws(() => generate('48', ['\u{10FFFF}']), /missing a character/);
});

test('accented names and customized dimensions produce closed meshes', options, () => {
  for (const radius of [0, 5.443]) {
    const result = generate('8', ['CAFÉ', 'PIÑATA'], { width: 50, height: 45, radius, baseThickness: 1.6, textThickness: 0.8 });
    const mesh = inspectStl(new Uint8Array(result.stl));
    assert.equal(mesh.max[0], 50); assert.equal(mesh.max[1], 45);
    assert.ok(Math.abs(mesh.max[2]-2.4) < 1e-6);
  }
});

test('digit 8 retains both counters', options, () => {
  const shape = new wasm.CrossSection(font.contours('8', 50), 'NonZero');
  try { assert.equal(shape.toPolygons().length, 3); } finally { shape.delete(); }
});
