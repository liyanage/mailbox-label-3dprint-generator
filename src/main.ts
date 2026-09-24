import './style.css';
import { defaults } from './types.ts';
import type { EngineRequest, EngineResponse, LabelInput, LabelResult, Settings } from './types.ts';
import { readFont, saveFont, forgetFont } from './storage.ts';
import type { SavedFont } from './storage.ts';
import { LabelViewer } from './viewer.ts';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = element<HTMLFormElement>('label-form');
const generate = element<HTMLButtonElement>('generate');
const download = element<HTMLButtonElement>('download');
const fileInput = element<HTMLInputElement>('font-file');
const choose = element<HTMLButtonElement>('choose-font');
const forget = element<HTMLButtonElement>('forget-font');
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
}

function invalidate(): void {
  revision++;
  download.disabled = true;
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

async function loadFont(font: SavedFont, persist: boolean): Promise<void> {
  busy = true; fontReady = false; syncButtons(); invalidate();
  notify('Reading font…');
  stopWorker();
  try {
    await send({ kind: 'font', bytes: font.bytes });
    fontReady = true;
    element('font-name').textContent = font.name;
    element('font-note').textContent = 'Saved in this browser.';
    choose.textContent = 'Change font';
    forget.hidden = false;
    if (persist) {
      try { await saveFont(font); }
      catch { element('font-note').textContent = 'Ready for this visit. Browser storage is unavailable.'; }
    }
    notify('');
  } catch (error) {
    stopWorker();
    element('font-name').textContent = 'Choose an outline font';
    element('font-note').textContent = 'Use /Library/Fonts/SF-Pro-Rounded-Bold.otf.';
    choose.textContent = 'Choose font';
    notify(error instanceof Error ? error.message : 'This font could not be read.', true);
  } finally { busy = false; syncButtons(); }
}

choose.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  if (file.size > 30*1024*1024) { notify('Choose a font smaller than 30 MB.', true); return; }
  try { await loadFont({ name: file.name, bytes: await file.arrayBuffer() }, true); }
  catch { notify('The selected file could not be read. Choose it again.', true); }
});

forget.addEventListener('click', async () => {
  fontReady = false; invalidate(); stopWorker();
  result = null; generatedInput = null;
  viewer?.showBase(defaults);
  element('fallback-preview').replaceChildren();
  element('font-name').textContent = 'No font selected';
  choose.textContent = 'Choose font';
  forget.hidden = true;
  element('font-note').textContent = 'Use /Library/Fonts/SF-Pro-Rounded-Bold.otf.';
  stage.classList.remove('stale');
  element('fit-note').textContent = '';
  element('dimensions').textContent = '44.5 × 38.5 × 3 mm';
  element('layer-note').textContent = 'Change color above 2 mm.';
  try { await forgetFont(); notify(''); }
  catch { forget.hidden = false; notify('The font was cleared from this page, but browser storage could not be cleared. Try Forget font again or clear this site’s data.', true); }
  syncButtons();
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
  busy = true; download.disabled = true; syncButtons(); notify('Building your label…');
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
    element('layer-note').textContent = `Change color above ${next.settings.baseThickness} mm.`;
    const reduced = next.rows.filter(row => row.effectivePt < row.requestedPt - 0.001);
    element('fit-note').textContent = reduced.map(row => `“${row.text}” fitted at ${row.effectivePt.toFixed(1)} pt.`).join(' ');
    notify(''); download.disabled = false;
  } catch (error) { notify(error instanceof Error ? error.message : 'Could not generate the label.', true); }
  finally { busy = false; syncButtons(); }
});

download.addEventListener('click', () => {
  if (!result || !generatedInput || download.disabled) return;
  const stem = [generatedInput.unit, ...generatedInput.names].join('-').normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'mailbox-label';
  const url = URL.createObjectURL(new Blob([result.stl], { type: 'model/stl' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${stem}.stl`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

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

syncButtons();
try {
  const font = await readFont();
  if (font && !fontReady && !busy) await loadFont(font, false);
} catch { element('font-note').textContent = 'Choose a font for this visit. Browser storage is unavailable.'; }
