import { strToU8, zipSync } from 'fflate';
import type { MeshGeometry } from './types.ts';

export type ThreeMfObject = { name: string } & (MeshGeometry | { children: ThreeMfObject[] });

export function threeMf(parts: ThreeMfObject[]): ArrayBuffer {
  const objects: string[] = [];
  function addObject(object: ThreeMfObject): number {
    let content: string;
    if ('children' in object) {
      if (!object.children.length) throw new Error('A 3MF group must contain at least one object.');
      const children = object.children.map(addObject);
      content = `<components>${children.map(id => `<component objectid="${id}"/>`).join('')}</components>`;
    } else {
      const vertices: string[] = [], triangles: string[] = [];
      for (let i = 0; i < object.positions.length; i += 3) {
        vertices.push(`<vertex x="${object.positions[i]}" y="${object.positions[i+1]}" z="${object.positions[i+2]}"/>`);
      }
      for (let i = 0; i < object.indices.length; i += 3) {
        triangles.push(`<triangle v1="${object.indices[i]}" v2="${object.indices[i+1]}" v3="${object.indices[i+2]}"/>`);
      }
      content = `<mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh>`;
    }
    // 3MF requires child resources to appear before objects referencing them.
    const id = objects.length+1;
    const name = object.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    objects.push(`<object id="${id}" type="model" name="${name}">${content}</object>`);
    return id;
  }
  const root = addObject({ name: 'Mailbox label', children: parts });
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Application">Mailbox label generator</metadata>
  <resources>${objects.join('\n  ')}</resources>
  <build><item objectid="${root}"/></build>
</model>`;
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`,
    '3D/3dmodel.model': model,
  };
  const archive = zipSync(Object.fromEntries(Object.entries(files).map(([name, xml]) => [name, strToU8(xml)])), { level: 6 });
  return new Uint8Array(archive).buffer;
}
