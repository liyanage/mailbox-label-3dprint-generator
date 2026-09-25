import initManifold from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import type { FontOutlines } from './geometry.ts';
import type { EngineRequest, EngineResponse } from './types.ts';

// HarfBuzz awaits WASM during import. Install the handler before that import
// resolves so a message sent immediately after new Worker() cannot be lost.
const enginePromise = Promise.all([
  initManifold({ locateFile: () => wasmUrl }).then(wasm => { wasm.setup(); return wasm; }),
  import('./geometry.ts'),
]);
let font: FontOutlines | null = null;

self.onmessage = async ({ data }: MessageEvent<EngineRequest>) => {
  try {
    const [wasm, { FontOutlines, generateLabel }] = await enginePromise;
    if (data.kind === 'font') {
      font = new FontOutlines(data.bytes, data.weight);
      self.postMessage({ id: data.id, ok: true, result: null } satisfies EngineResponse);
    } else {
      if (!font) throw new Error('Choose a font before generating a label.');
      const result = generateLabel(wasm, font, data.input);
      self.postMessage({ id: data.id, ok: true, result } satisfies EngineResponse,
        { transfer: [result.positions.buffer, result.indices.buffer, result.stl, result.threeMf,
          ...result.previewParts.flatMap(part => [part.positions.buffer, part.indices.buffer])] });
    }
  } catch (error) {
    self.postMessage({ id: data.id, ok: false, error: error instanceof Error ? error.message : 'Generation failed. Check the font and settings.' } satisfies EngineResponse);
  }
};
