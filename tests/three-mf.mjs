import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { binaryStl } from '../src/geometry.ts';
import { inspectStl } from './stl.mjs';

export function inspectThreeMf(bytes) {
  const files = unzipSync(bytes);
  assert.deepEqual(Object.keys(files).sort(), ['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels'].sort());
  const xml = strFromU8(files['3D/3dmodel.model']);
  assert.match(xml, /unit="millimeter"/);
  assert.match(strFromU8(files['_rels/.rels']), /Target="\/3D\/3dmodel.model"/);
  const objects = new Map(), references = [];
  for (const match of xml.matchAll(/<object id="(\d+)" type="model" name="([^"]*)">([\s\S]*?)<\/object>/g)) {
    const id = Number(match[1]), content = match[3];
    const name = match[2].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
    assert.ok(id > 0 && !objects.has(id));
    const children = [...content.matchAll(/<component objectid="(\d+)"\/>/g)].map(child => {
      const childId = Number(child[1]);
      assert.ok(objects.has(childId), 'Referenced children must be defined before their parent.');
      references.push(childId);
      return objects.get(childId);
    });
    let geometry;
    if (children.length) {
      assert.doesNotMatch(content, /<mesh>/);
      geometry = {
        children,
        triangles: children.reduce((sum, child) => sum+child.triangles, 0),
        volume: children.reduce((sum, child) => sum+child.volume, 0),
        min: [0, 1, 2].map(axis => Math.min(...children.map(child => child.min[axis]))),
        max: [0, 1, 2].map(axis => Math.max(...children.map(child => child.max[axis]))),
        levels: [...new Set(children.flatMap(child => child.levels))].sort((a, b) => a-b),
      };
    } else {
      assert.match(content, /<mesh>/);
      assert.doesNotMatch(content, /<components>/);
      const positions = new Float32Array([...content.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].flatMap(vertex => vertex.slice(1).map(Number)));
      const indices = new Uint32Array([...content.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].flatMap(triangle => triangle.slice(1).map(Number)));
      assert.ok(positions.length > 0 && indices.length > 0);
      assert.ok(indices.every(i => i < positions.length/3));
      geometry = { ...inspectStl(new Uint8Array(binaryStl(positions, indices))), mesh: { positions, indices } };
    }
    objects.set(id, { name, ...geometry });
  }
  assert.equal(objects.size, [...xml.matchAll(/<object\s/g)].length);
  const items = [...xml.matchAll(/<item objectid="(\d+)"\/>/g)];
  assert.equal(items.length, 1);
  const rootId = Number(items[0][1]), root = objects.get(rootId);
  assert.equal(root?.name, 'Mailbox label');
  assert.ok(root.children.length > 0);
  assert.deepEqual([...references, rootId].sort((a, b) => a-b), [...objects.keys()].sort((a, b) => a-b));
  return root.children;
}
