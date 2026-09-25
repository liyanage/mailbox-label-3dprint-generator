import qrcode from 'qrcode-generator';
import type { Vec2 } from 'manifold-3d';

export const QR_URL = 'https://liyanage.github.io/mailbox-label-3dprint-generator/';
export const QR_SIZE = 36.9;
export const QR_DEPTH = 0.2;
export const QR_QUIET_ZONE = 4;

const code = qrcode(4, 'M');
code.addData(QR_URL, 'Byte');
code.make();
export const qrModules = Array.from({ length: code.getModuleCount() }, (_, row) =>
  Array.from({ length: code.getModuleCount() }, (_, col) => code.isDark(row, col)));

export function qrContours(): { square: Vec2[]; dark: Vec2[][]; size: number } {
  const size = qrModules.length+2*QR_QUIET_ZONE;
  const rectangle = (x: number, y: number, w: number, h: number): Vec2[] =>
    [[x, y], [x+w, y], [x+w, y+h], [x, y+h]];
  const dark: Vec2[][] = [];
  for (const [row, modules] of qrModules.entries()) {
    for (let col = 0; col < modules.length;) {
      if (!modules[col]) { col++; continue; }
      const start = col;
      while (col < modules.length && modules[col]) col++;
      // Mirror X in model coordinates so the code reads correctly from underneath.
      dark.push(rectangle(size-QR_QUIET_ZONE-col,
        size-QR_QUIET_ZONE-row-1, col-start, 1));
    }
  }
  return { square: rectangle(0, 0, size, size), dark, size };
}
