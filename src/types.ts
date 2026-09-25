export interface Settings {
  width: number;
  height: number;
  radius: number;
  baseThickness: number;
  textThickness: number;
  numberPt: number;
  namePt: number;
  margin: number;
  fit: 'shrink' | 'error';
  qr: boolean;
}

export const defaults: Settings = {
  width: 44.5, height: 38.5, radius: 3.465,
  baseThickness: 2, textThickness: 1, numberPt: 50, namePt: 20,
  margin: 3, fit: 'shrink', qr: true,
};

export interface LabelInput {
  unit: string;
  names: string[];
  settings: Settings;
}

export interface TextRow {
  text: string;
  requestedPt: number;
  effectivePt: number;
  bounds: [number, number, number, number];
}

export interface MeshGeometry {
  positions: Float32Array;
  indices: Uint32Array;
}

export interface LabelResult extends MeshGeometry {
  previewParts: (MeshGeometry & { material: 0 | 1 })[];
  stl: ArrayBuffer;
  threeMf: ArrayBuffer;
  svg: string;
  rows: TextRow[];
  settings: Settings;
  volume: number;
  triangles: number;
  bounds: { min: number[]; max: number[] };
}

export type EngineRequest =
  | { id: number; kind: 'font'; bytes: ArrayBuffer; weight?: number }
  | { id: number; kind: 'generate'; input: LabelInput };

export type EngineResponse =
  | { id: number; ok: true; result: LabelResult | null }
  | { id: number; ok: false; error: string };
