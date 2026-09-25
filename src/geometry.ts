import * as hb from 'harfbuzzjs';
import type { CrossSection, Manifold, ManifoldToplevel, Vec2 } from 'manifold-3d';
import type { LabelInput, LabelResult, MeshGeometry, Settings, TextRow } from './types.ts';
import { threeMf } from './three-mf.ts';

const PT_TO_MM = 25.4 / 72;
const TOLERANCE = 0.01;
type Disposable = { delete(): void };
const midpoint = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const x = b[0] - a[0], y = b[1] - a[1];
  const length2 = x*x + y*y;
  const t = length2 ? Math.max(0, Math.min(1, ((p[0]-a[0])*x + (p[1]-a[1])*y)/length2)) : 0;
  return Math.hypot(p[0]-a[0]-t*x, p[1]-a[1]-t*y);
}

function flatten(a: Vec2, b: Vec2, c: Vec2, d: Vec2, points: Vec2[], depth = 0): void {
  if (Math.max(segmentDistance(b, a, d), segmentDistance(c, a, d)) <= TOLERANCE) {
    points.push(d);
    return;
  }
  if (depth >= 24) throw new Error('A font curve is too complex to process. Choose another font.');
  const ab = midpoint(a, b), bc = midpoint(b, c), cd = midpoint(c, d);
  const abc = midpoint(ab, bc), bcd = midpoint(bc, cd), mid = midpoint(abc, bcd);
  flatten(a, ab, abc, mid, points, depth+1);
  flatten(mid, bcd, cd, d, points, depth+1);
}

export class FontOutlines {
  private face: hb.Face;
  private font: hb.Font;
  private buffer = new hb.Buffer();

  constructor(bytes: ArrayBuffer, weight?: number) {
    const signature = new DataView(bytes);
    if (bytes.byteLength < 12 || ![0x4f54544f, 0x00010000, 0x74727565].includes(signature.getUint32(0))) {
      throw new Error('Choose an OpenType (.otf) or TrueType (.ttf) font file.');
    }
    this.face = new hb.Face(new hb.Blob(bytes));
    if (!this.face.referenceTable('head') || !this.face.referenceTable('maxp') ||
        !(this.face.referenceTable('CFF ') || this.face.referenceTable('CFF2') || this.face.referenceTable('glyf'))) {
      throw new Error('This file does not contain usable font outlines. Choose an .otf or .ttf font.');
    }
    this.font = new hb.Font(this.face);
    this.font.setScale(this.face.upem, this.face.upem);
    if (weight !== undefined) this.font.setVariations([new hb.Variation('wght', weight)]);
  }

  contours(text: string, size: number): Vec2[][] {
    const scale = size * PT_TO_MM / this.face.upem;
    this.buffer.reset();
    this.buffer.addText(text);
    this.buffer.guessSegmentProperties();
    hb.shape(this.font, this.buffer);
    const infos = this.buffer.getGlyphInfos(), positions = this.buffer.getGlyphPositions();
    const contours: Vec2[][] = [];
    let x = 0, y = 0;
    for (let i = 0; i < infos.length; i++) {
      const gid = infos[i].codepoint, position = positions[i];
      if (gid === 0) throw new Error(`The selected font is missing a character in “${text}”.`);
      const point = (values: number[], offset: number): Vec2 => [
        (values[offset] + x + position.xOffset)*scale,
        (values[offset+1] + y + position.yOffset)*scale,
      ];
      let points: Vec2[] = [];
      for (const command of this.font.glyphToJson(gid)) {
        const v = command.values;
        switch (command.type) {
          case 'M': points = [point(v, 0)]; break;
          case 'L': points.push(point(v, 0)); break;
          case 'C': flatten(points[points.length-1], point(v, 0), point(v, 2), point(v, 4), points); break;
          case 'Q': {
            const a = points[points.length-1], control = point(v, 0), end = point(v, 2);
            flatten(a, [a[0]+(control[0]-a[0])*2/3, a[1]+(control[1]-a[1])*2/3],
              [end[0]+(control[0]-end[0])*2/3, end[1]+(control[1]-end[1])*2/3], end, points);
            break;
          }
          case 'Z': {
            if (points.length > 1 && points[0][0] === points[points.length-1][0] && points[0][1] === points[points.length-1][1]) points.pop();
            if (points.length >= 3) contours.push(points);
            points = [];
            break;
          }
          default: throw new Error(`Unsupported font outline command: ${command.type}.`);
        }
      }
      x += position.xAdvance;
      y += position.yAdvance;
    }
    return contours;
  }
}

function validate({ unit, names, settings: s }: LabelInput): void {
  if (!unit.trim()) throw new Error('Enter a unit number.');
  if (names.length < 1 || names.length > 2 || names.some(name => !name.trim())) throw new Error('Enter one or two name lines.');
  for (const text of [unit, ...names]) {
    if (text.length > 80 || /[\u0000-\u001f\u007f]/.test(text)) throw new Error('Use a single line of up to 80 characters per field.');
  }
  for (const value of Object.values(s)) {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Enter a valid number for every dimension.');
  }
  if (s.width < 10 || s.width > 300 || s.height < 10 || s.height > 300) throw new Error('Width and height must be between 10 and 300 mm.');
  if (s.radius < 0 || s.radius > Math.min(s.width, s.height)/2) throw new Error('The corner radius must fit within half the shorter side.');
  if (s.margin < 0 || s.margin >= s.width/2) throw new Error('The side margin must be less than half the width.');
  if ([s.baseThickness, s.textThickness].some(n => n < 0.2 || n > 10)) throw new Error('Thicknesses must be between 0.2 and 10 mm.');
  if ([s.numberPt, s.namePt].some(n => n < 4 || n > 180)) throw new Error('Type sizes must be between 4 and 180 pt.');
  if (!['shrink', 'error'].includes(s.fit)) throw new Error('Choose a valid text-fit option.');
}

function baseContour(s: Settings): Vec2[] {
  const { width: w, height: h, radius: r } = s;
  if (r === 0) return [[0, 0], [w, 0], [w, h], [0, h]];
  const count = Math.max(4, Math.ceil((Math.PI/2)/(2*Math.acos(Math.max(-1, 1-TOLERANCE/r)))));
  const points: Vec2[] = [];
  for (const [cx, cy, start] of [[w-r, h-r, 0], [r, h-r, 90], [r, r, 180], [w-r, r, 270]]) {
    for (let i = 0; i <= count; i++) {
      const angle = (start + 90*i/count)*Math.PI/180;
      points.push([cx + r*Math.cos(angle), cy + r*Math.sin(angle)]);
    }
  }
  return points;
}

function svgPreview(base: CrossSection, lettering: CrossSection, s: Settings): string {
  const path = (shape: CrossSection) => shape.toPolygons().map(contour =>
    `M${contour.map(([x, y]) => `${x.toFixed(5)},${(s.height-y).toFixed(5)}`).join(' L')} Z`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.width} ${s.height}" width="${s.width}mm" height="${s.height}mm"><path fill="#111111" fill-rule="nonzero" d="${path(base)}"/><path fill="#ffffff" fill-rule="nonzero" d="${path(lettering)}"/></svg>`;
}

export function binaryStl(positions: Float32Array, indices: Uint32Array): ArrayBuffer {
  const count = indices.length/3, bytes = new ArrayBuffer(84+count*50), view = new DataView(bytes);
  new Uint8Array(bytes, 0, 80).set(new TextEncoder().encode('Mailbox label; millimeters; underside Z=0'));
  view.setUint32(80, count, true);
  for (let triangle = 0; triangle < count; triangle++) {
    const a = indices[triangle*3]*3, b = indices[triangle*3+1]*3, c = indices[triangle*3+2]*3;
    const ux = positions[b]-positions[a], uy = positions[b+1]-positions[a+1], uz = positions[b+2]-positions[a+2];
    const vx = positions[c]-positions[a], vy = positions[c+1]-positions[a+1], vz = positions[c+2]-positions[a+2];
    const normal = [uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx], length = Math.hypot(...normal);
    if (length === 0) throw new Error('The generated mesh contains a degenerate triangle.');
    let offset = 84+triangle*50;
    for (const component of normal) { view.setFloat32(offset, component/length, true); offset += 4; }
    for (const index of [a, b, c]) for (let axis = 0; axis < 3; axis++) {
      view.setFloat32(offset, positions[index+axis], true); offset += 4;
    }
  }
  return bytes;
}

function meshGeometry(solid: Manifold): MeshGeometry {
  const mesh = solid.getMesh();
  const positions = new Float32Array(mesh.numVert*3);
  for (let i = 0; i < mesh.numVert; i++) for (let axis = 0; axis < 3; axis++) positions[i*3+axis] = mesh.vertProperties[i*mesh.numProp+axis];
  return { positions, indices: new Uint32Array(mesh.triVerts) };
}

export function generateLabel(wasm: ManifoldToplevel, font: FontOutlines, input: LabelInput): LabelResult {
  validate(input);
  const s = input.settings, allocated: Disposable[] = [];
  const keep = <T extends Disposable>(object: T): T => { allocated.push(object); return object; };
  try {
    const base = keep(new wasm.CrossSection([baseContour(s)], 'NonZero'));
    const two = input.names.length === 2, ratio = s.height/38.5;
    const baselines = two ? [27.6979040487, 34.7534519624] : [31.4014447112];
    const specifications = [
      { text: input.unit.trim(), pt: s.numberPt, baseline: (two ? 17.2338977987 : 19.3496738778)*ratio },
      ...input.names.map((text, i) => ({ text: text.trim(), pt: s.namePt, baseline: baselines[i]*ratio })),
    ];
    const rows: TextRow[] = [], shapes: CrossSection[] = [];
    for (const { text, pt, baseline } of specifications) {
      const raw = keep(new wasm.CrossSection(font.contours(text, pt), 'NonZero'));
      if (raw.isEmpty()) throw new Error(`“${text}” has no printable outlines.`);
      const bounds = raw.bounds();
      const factor = Math.min(1, (s.width-2*s.margin)/(bounds.max[0]-bounds.min[0]));
      if (factor < 1 && s.fit === 'error') throw new Error(`“${text}” is too wide. Reduce its type size or select “Shrink to fit”.`);
      const scaled = keep(raw.scale([factor, factor])), scaledBounds = scaled.bounds();
      const placed = keep(scaled.translate([(s.width-scaledBounds.min[0]-scaledBounds.max[0])/2, s.height-baseline]));
      if (keep(placed.subtract(base)).area() > 1e-7) throw new Error(`“${text}” extends past the label. Reduce its type size or increase the label dimensions.`);
      const box = placed.bounds();
      if (shapes.length && box.max[1] >= shapes[shapes.length-1].bounds().min[1]) throw new Error('The text lines overlap. Reduce their type sizes.');
      shapes.push(placed);
      rows.push({ text, requestedPt: pt, effectivePt: pt*factor, bounds: [box.min[0], box.min[1], box.max[0], box.max[1]] });
    }
    let letters = shapes[0];
    for (const shape of shapes.slice(1)) letters = keep(letters.add(shape));
    const slab = keep(base.extrude(s.baseThickness));
    const text = keep(keep(letters.extrude(s.textThickness)).translate([0, 0, s.baseThickness]));
    // STL and the preview use the union to avoid internal faces. 3MF retains
    // the two closed volumes so the slicer can assign a filament to each.
    const solid: Manifold = keep(slab.add(text));
    if (solid.status() !== 'NoError' || solid.isEmpty()) throw new Error('The label could not be made into a closed solid.');
    const components = solid.decompose();
    components.forEach(keep);
    if (components.length !== 1) throw new Error('Some lettering is disconnected from the base.');
    const { positions, indices } = meshGeometry(solid);
    return { positions, indices, stl: binaryStl(positions, indices),
      threeMf: threeMf([{ name: 'Base', ...meshGeometry(slab) }, { name: 'Text', ...meshGeometry(text) }]), svg: svgPreview(base, letters, s),
      rows, settings: { ...s }, volume: solid.volume(), triangles: solid.numTri(), bounds: solid.boundingBox() };
  } finally {
    for (const object of allocated.reverse()) object.delete();
  }
}
