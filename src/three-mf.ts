import { strToU8, zipSync } from 'fflate';
import type { MeshGeometry } from './types.ts';

export function threeMf(parts: (MeshGeometry & { name: string })[]): ArrayBuffer {
  const vertices: string[] = [], triangles: string[] = [], volumes: string[] = [];
  let offset = 0;
  for (const mesh of parts) {
    const firstTriangle = triangles.length;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      vertices.push(`<vertex x="${mesh.positions[i]}" y="${mesh.positions[i+1]}" z="${mesh.positions[i+2]}"/>`);
    }
    for (let i = 0; i < mesh.indices.length; i += 3) {
      triangles.push(`<triangle v1="${mesh.indices[i]+offset}" v2="${mesh.indices[i+1]+offset}" v3="${mesh.indices[i+2]+offset}"/>`);
    }
    offset += mesh.positions.length/3;
    const name = mesh.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    volumes.push(`<volume firstid="${firstTriangle}" lastid="${triangles.length-1}"><metadata type="volume" key="name" value="${name}"/></volume>`);
  }
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Application">Mailbox label generator</metadata>
  <resources><object id="1" type="model" name="Mailbox label"><mesh>
    <vertices>${vertices.join('')}</vertices>
    <triangles>${triangles.join('')}</triangles>
  </mesh></object></resources>
  <build><item objectid="1"/></build>
</model>`;
  // PrusaSlicer uses triangle ranges to preserve named parts, including all
  // disconnected letters as one volume, without importing printer settings.
  const config = `<?xml version="1.0" encoding="UTF-8"?>
<config><object id="1" instances_count="1">
  ${volumes.join('\n  ')}
</object></config>`;
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Default Extension="config" ContentType="application/xml"/>
</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`,
    '3D/3dmodel.model': model,
    'Metadata/Slic3r_PE_model.config': config,
  };
  const archive = zipSync(Object.fromEntries(Object.entries(files).map(([name, xml]) => [name, strToU8(xml)])), { level: 6 });
  return new Uint8Array(archive).buffer;
}
