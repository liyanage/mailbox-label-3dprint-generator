export const bundledFonts = [
  { id: 'dosis-700', label: 'Dosis — Bold (700)', path: 'fonts/dosis/Dosis-variable.ttf', weight: 700 },
];

export interface FontSelection {
  source: 'upload' | 'included';
  bundledId: string;
}

export const defaultFontSelection: FontSelection = { source: 'upload', bundledId: bundledFonts[0].id };
