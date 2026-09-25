import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { binaryStl } from '../src/geometry.ts';
import { inspectStl } from './stl.mjs';

export function inspectThreeMf(bytes) {
  const files = unzipSync(bytes);
  assert.deepEqual(Object.keys(files).sort(), ['3D/3dmodel.model', 'Metadata/Slic3r_PE_model.config', '[Content_Types].xml', '_rels/.rels'].sort());
  const xml = strFromU8(files['3D/3dmodel.model']);
  const config = strFromU8(files['Metadata/Slic3r_PE_model.config']);
  assert.match(xml, /unit="millimeter"/);
  assert.equal([...xml.matchAll(/<object\s/g)].length, 1);
  assert.match(xml, /<item objectid="1"\/>/);
  assert.match(strFromU8(files['_rels/.rels']), /Target="\/3D\/3dmodel.model"/);
  const positions = new Float32Array([...xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].flatMap(match => match.slice(1).map(Number)));
  const indices = [...xml.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].flatMap(match => match.slice(1).map(Number));
  assert.ok(positions.length > 0 && indices.length > 0);
  assert.ok(indices.every(i => i >= 0 && i < positions.length/3));
  const parts = [];
  let nextTriangle = 0;
  for (const match of config.matchAll(/<volume firstid="(\d+)" lastid="(\d+)">([\s\S]*?)<\/volume>/g)) {
    const first = Number(match[1]), last = Number(match[2]);
    assert.equal(first, nextTriangle);
    assert.ok(last >= first && last < indices.length/3);
    const name = /key="name" value="([^"]+)"/.exec(match[3])[1];
    const mesh = inspectStl(new Uint8Array(binaryStl(positions, new Uint32Array(indices.slice(first*3, (last+1)*3)))));
    parts.push({ name, ...mesh });
    nextTriangle = last+1;
  }
  assert.equal(nextTriangle, indices.length/3);
  return parts;
}
