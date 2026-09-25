import './style.css';
import { defaults } from './types.ts';
import type { EngineRequest, EngineResponse, LabelInput, LabelResult, Settings } from './types.ts';
import { readFont, saveFont, forgetFont, readFontSelection, saveFontSelection } from './storage.ts';
import type { SavedFont } from './storage.ts';
import { bundledFonts, defaultFontSelection } from './fonts.ts';
import { LabelViewer } from './viewer.ts';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = element<HTMLFormElement>('label-form');
const generate = element<HTMLButtonElement>('generate');
const download = element<HTMLButtonElement>('download');
const download3mf = element<HTMLButtonElement>('download-3mf');
const fileInput = element<HTMLInputElement>('font-file');
const choose = element<HTMLButtonElement>('choose-font');
const forget = element<HTMLButtonElement>('forget-font');
const sourceUpload = element<HTMLButtonElement>('source-upload');
const sourceIncluded = element<HTMLButtonElement>('source-included');
const includedFont = element<HTMLSelectElement>('included-font');
const retryFont = element<HTMLButtonElement>('retry-font');
let fontSelection = { ...defaultFontSelection };
let uploadedFont: SavedFont | undefined;
let uploadSaved = false;
for (const font of bundledFonts) includedFont.add(new Option(font.label, font.id));
const status = element<HTMLParagraphElement>('status');
const stage = element<HTMLDivElement>('stage');
let viewer: LabelViewer | undefined;
let result: LabelResult | null = null;
let generatedInput: LabelInput | null = null;
let fontReady = false;
let busy = false;
let revision = 0;
let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<number, { resolve(value: LabelResult | null): void; reject(reason: Error): void; timeout: ReturnType<typeof setTimeout> }>();

function notify(message: string, error = false): void {
  status.textContent = message;
  status.classList.toggle('error', error);
  status.setAttribute('role', error ? 'alert' : 'status');
}

function syncButtons(): void {
  generate.disabled = busy || !fontReady;
  generate.textContent = busy ? (fontReady ? 'Generating…' : 'Reading font…') : 'Generate label';
  generate.setAttribute('aria-busy', String(busy));
  choose.disabled = busy;
  forget.disabled = busy;
  sourceUpload.disabled = sourceIncluded.disabled = includedFont.disabled = retryFont.disabled = busy;
}

function disableDownloads(disabled: boolean): void {
  download.disabled = download3mf.disabled = disabled;
}

function syncPrintingGuidance(): void {
  const height = element<HTMLInputElement>('setting-baseThickness').valueAsNumber;
  const boundary = Number.isFinite(height) && height >= 0.2 && height <= 10 ? `${height} mm` : 'the top of the base';
  element('layer-note').textContent = `In your slicer, configure a color change at ${boundary}, switching to white for the first text layer above the black base.`;
}

function invalidate(): void {
  revision++;
  disableDownloads(true);
  syncPrintingGuidance();
  if (result) {
    stage.classList.add('stale');
    notify('Generate again to apply your changes.');
  }
}

function stopWorker(reason = 'Font changed. Generate again.'): void {
  worker?.terminate(); worker = undefined;
  for (const request of pending.values()) {
    clearTimeout(request.timeout);
    request.reject(new Error(reason));
  }
  pending.clear();
}

function send(request: Omit<Extract<EngineRequest, { kind: 'font' }>, 'id'> | Omit<Extract<EngineRequest, { kind: 'generate' }>, 'id'>): Promise<LabelResult | null> {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<EngineResponse>) => {
      const item = pending.get(data.id);
      if (!item) return;
      pending.delete(data.id);
      clearTimeout(item.timeout);
      if (data.ok) item.resolve(data.result); else item.reject(new Error(data.error));
    };
    worker.onerror = () => {
      fontReady = false;
      stopWorker('The generator could not start. Reload this page and choose your font again.');
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => {
      fontReady = false;
      stopWorker('The generator took too long to respond. Choose your font again and retry.');
    }, 30000);
    pending.set(id, { resolve, reject, timeout });
    worker!.postMessage({ ...request, id });
  });
}

function renderFontChoice(): void {
  const uploading = fontSelection.source === 'upload';
  sourceUpload.setAttribute('aria-pressed', String(uploading));
  sourceIncluded.setAttribute('aria-pressed', String(!uploading));
  element('upload-font-panel').hidden = !uploading;
  element('included-font-panel').hidden = uploading;
  includedFont.value = fontSelection.bundledId;
  element('font-name').textContent = uploadedFont?.name ?? 'No font selected';
  choose.textContent = uploadedFont ? 'Change font' : 'Choose font';
  forget.hidden = !uploadedFont;
  element('font-note').textContent = uploadedFont
    ? (uploadSaved ? 'Saved in this browser.' : 'Ready for this visit.')
    : 'Use /Library/Fonts/SF-Pro-Rounded-Bold.otf.';
}

function storageUnavailable(): void {
  element('font-storage-note').hidden = false;
  element('font-storage-note').textContent = 'Browser storage is unavailable. Font choices apply to this visit only.';
}

async function activateFont(persist: boolean, newUpload?: SavedFont): Promise<void> {
  busy = true; fontReady = false; syncButtons(); invalidate();
  renderFontChoice();
  retryFont.hidden = true;
  notify('Reading font…');
  stopWorker();
  try {
    if (persist) {
      try { await saveFontSelection(fontSelection); }
      catch { storageUnavailable(); }
    }
    let font = newUpload ?? uploadedFont;
    let weight: number | undefined;
    if (fontSelection.source === 'included') {
      const bundled = bundledFonts.find(font => font.id === fontSelection.bundledId)!;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}${bundled.path}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Font download failed (${response.status}).`);
        font = { name: bundled.label, bytes: await response.arrayBuffer() };
        weight = bundled.weight;
      } finally { clearTimeout(timeout); }
    }
    if (!font) { notify(''); return; }
    await send({ kind: 'font', bytes: font.bytes, weight });
    fontReady = true;
    if (newUpload) {
      uploadedFont = newUpload;
      uploadSaved = false;
      try { await saveFont(newUpload); uploadSaved = true; }
      catch { storageUnavailable(); }
    }
    renderFontChoice();
    notify('');
  } catch (error) {
    stopWorker();
    retryFont.hidden = fontSelection.source !== 'included';
    notify(error instanceof Error ? error.message : 'This font could not be read.', true);
  } finally { busy = false; syncButtons(); }
}

for (const [button, source] of [[sourceUpload, 'upload'], [sourceIncluded, 'included']] as const) {
  button.addEventListener('click', async () => {
    if (busy || fontSelection.source === source) return;
    fontSelection.source = source;
    await activateFont(true);
  });
}
includedFont.addEventListener('change', async () => {
  fontSelection.bundledId = includedFont.value;
  await activateFont(true);
});
retryFont.addEventListener('click', () => activateFont(false));

choose.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file || busy) return;
  if (file.size > 30*1024*1024) { notify('Choose a font smaller than 30 MB.', true); return; }
  busy = true; syncButtons();
  try { await activateFont(true, { name: file.name, bytes: await file.arrayBuffer() }); }
  catch { notify('The selected file could not be read. Choose it again.', true); }
  finally { busy = false; syncButtons(); }
});

forget.addEventListener('click', async () => {
  busy = true; syncButtons();
  fontReady = false; invalidate(); stopWorker();
  uploadedFont = undefined; uploadSaved = false;
  result = null; generatedInput = null;
  viewer?.showBase(defaults);
  element('fallback-preview').replaceChildren();
  renderFontChoice();
  stage.classList.remove('stale');
  element('fit-note').textContent = '';
  element('dimensions').textContent = '44.5 × 38.5 × 3 mm';
  try { await forgetFont(); notify(''); }
  catch { forget.hidden = false; notify('The font was cleared from this page, but browser storage could not be cleared. Try Forget font again or clear this site’s data.', true); }
  busy = false; syncButtons();
});

element('add-name').addEventListener('click', () => {
  element('second-name-row').hidden = false;
  const input = element<HTMLInputElement>('name-two');
  input.disabled = false; input.required = true;
  element('add-name').hidden = true;
  input.focus(); invalidate();
});

element('remove-name').addEventListener('click', () => {
  element('second-name-row').hidden = true;
  const input = element<HTMLInputElement>('name-two');
  input.disabled = true; input.required = false;
  element('add-name').hidden = false;
  element('add-name').focus(); invalidate();
});

form.addEventListener('input', invalidate);
form.addEventListener('change', invalidate);
form.addEventListener('invalid', event => {
  const advanced = (event.target as HTMLElement).closest('details');
  if (advanced) advanced.open = true;
}, true);

function inputs(): LabelInput {
  const settings = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof Settings)[]) {
    const input = element<HTMLInputElement | HTMLSelectElement>(`setting-${key}`);
    if (key === 'fit') settings.fit = input.value as Settings['fit'];
    else settings[key] = Number(input.value);
  }
  return { unit: element<HTMLInputElement>('unit').value.trim(),
    names: [element<HTMLInputElement>('name-one').value.trim(),
      ...(!element('second-name-row').hidden ? [element<HTMLInputElement>('name-two').value.trim()] : [])], settings };
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!fontReady || busy || !form.reportValidity()) return;
  const input = inputs(), startedRevision = revision;
  busy = true; disableDownloads(true); syncButtons(); notify('Building your label…');
  try {
    const next = await send({ kind: 'generate', input });
    if (!next) throw new Error('No label was returned. Try generating again.');
    if (startedRevision !== revision) { notify('Your inputs changed while generating. Generate again to update.'); return; }
    result = next; generatedInput = input;
    viewer?.show(next);
    if (!viewer) {
      const img = new Image();
      const url = URL.createObjectURL(new Blob([next.svg], { type: 'image/svg+xml' }));
      img.onload = () => URL.revokeObjectURL(url);
      img.alt = 'Generated label, top view'; img.src = url;
      element('fallback-preview').replaceChildren(img);
    }
    stage.classList.remove('stale');
    element('dimensions').textContent = `${next.settings.width} × ${next.settings.height} × ${Number((next.settings.baseThickness+next.settings.textThickness).toFixed(3))} mm`;
    const reduced = next.rows.filter(row => row.effectivePt < row.requestedPt - 0.001);
    element('fit-note').textContent = reduced.map(row => `“${row.text}” fitted at ${row.effectivePt.toFixed(1)} pt.`).join(' ');
    notify(''); disableDownloads(false);
  } catch (error) { notify(error instanceof Error ? error.message : 'Could not generate the label.', true); }
  finally { busy = false; syncButtons(); }
});

function downloadLabel(format: 'stl' | '3mf'): void {
  if (!result || !generatedInput || download.disabled || download3mf.disabled) return;
  const stem = [generatedInput.unit, ...generatedInput.names].join('-').normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'mailbox-label';
  const url = URL.createObjectURL(new Blob([format === 'stl' ? result.stl : result.threeMf], { type: `model/${format}` }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${stem}.${format}`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

download.addEventListener('click', () => downloadLabel('stl'));
download3mf.addEventListener('click', () => downloadLabel('3mf'));

element('reset-settings').addEventListener('click', () => {
  for (const [key, value] of Object.entries(defaults)) element<HTMLInputElement | HTMLSelectElement>(`setting-${key}`).value = String(value);
  invalidate();
});

try { viewer = new LabelViewer(element('canvas-container')); viewer.showBase(defaults); }
catch {
  element('canvas-container').hidden = true;
  element('view-controls').hidden = true;
  element('preview-note').hidden = false;
  element('preview-note').textContent = '3D unavailable. Showing a top view.';
}

element('reset-view').addEventListener('click', () => viewer?.reset());

busy = true; syncButtons();
try {
  const [font, selection] = await Promise.all([readFont(), readFontSelection()]);
  uploadedFont = font; uploadSaved = !!font;
  if (selection && ['upload', 'included'].includes(selection.source) && bundledFonts.some(font => font.id === selection.bundledId)) fontSelection = selection;
  renderFontChoice();
  await activateFont(false);
} catch { storageUnavailable(); }
finally { busy = false; syncButtons(); }
