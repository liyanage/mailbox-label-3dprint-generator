# Mailbox label generator

[Open the app](https://liyanage.github.io/mailbox-label-3dprint-generator/)

A browser app for making 3D-printable mailbox labels from a unit number and one or two name lines. Preview the result in interactive 3D and download a single, closed STL solid or a multipart 3MF for PrusaSlicer.

All font processing, geometry, and file generation happen locally in your browser. There is no backend, analytics, or font upload to a server.

## Run locally

Use Node.js 22.18 or newer. From this folder:

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. For a production build:

```sh
npm run build
npm run preview
```

The build produces a self-contained `dist/` folder suitable for a static web host, including deployment under a subdirectory. Serve it over HTTP or HTTPS; opening `index.html` directly as a file will not run the worker correctly. The host must serve `.wasm` files with the `application/wasm` content type.

## GitHub Pages

The app is published at <https://liyanage.github.io/mailbox-label-3dprint-generator/>.
The deployment workflow builds and publishes `dist/` on every push to `main`, or when run manually from the Actions tab. Pages uses GitHub Actions as its publishing source. Relative asset URLs allow the same build to work locally and under the repository URL.

The workflow uses Node.js 24 and installs locked dependencies with `npm ci`. Dosis geometry tests run on GitHub. Tests requiring SF Pro Rounded are skipped there because that font is not distributed; run them locally before publishing changes to the geometry.

## Make a label

1. **Upload your own** is selected initially. Choose **SF-Pro-Rounded-Bold.otf** from your computer (on macOS, `/Library/Fonts/SF-Pro-Rounded-Bold.otf`). Alternatively, select **Included fonts** and choose **Dosis — Bold (700)**, especially on iPhone or iPad where uploading a font is less convenient.
2. Enter the unit number and name. Select **Add a second name** for a second line. Case, spaces, and accents are preserved when the font supports them.
3. Select **Generate label**. Drag the preview to rotate, scroll to zoom, or select **Reset** to return to the starting angle.
4. Select **Download STL** for a single solid with a layer-height color change, or **Download 3MF** to try the experimental hierarchy described below.

The browser remembers the selected font source, included typeface, and uploaded font in IndexedDB for this site. Switching to Included fonts keeps your uploaded font available when you switch back. **Forget font** removes the uploaded copy. Clearing site data also removes these preferences. If browser storage is unavailable, fonts can still be used for the current visit. Names are not saved between visits.

Dosis is bundled with the app under the [SIL Open Font License 1.1](public/fonts/dosis/OFL.txt); its [source and attribution](public/fonts/dosis/README.md) are included. The original variable font is used at weight 700 when generating outlines. SF Pro Rounded is not bundled. Included fonts are served from the app itself, with no third-party font service.

Dimensions, thicknesses, typography, corner radius, margins, long-text fitting, and the back-side QR switch are under **Advanced**. Editing an input disables the old download until you generate again. Unsupported characters, text extending beyond the base, and overlapping rows produce an error.

Long text shrinks proportionally to the available width by default; the app reports its resulting point size. Choose **Keep size and report overflow** to reject text that needs shrinking. Check that small lettering is suitable for your printer.

## Design and printing

| Setting | Default |
| --- | --- |
| Base width × height | 44.5 × 38.5 mm |
| Base thickness | 2 mm |
| Raised text | 1 mm |
| Total thickness | 3 mm |
| Corner radius | 3.465 mm |
| Number | SF Pro Rounded Bold, 50 pt |
| Names | SF Pro Rounded Bold, 20 pt |
| Side margin | 3 mm |
| Curve approximation tolerance | 0.01 mm |
| Back-side QR (3MF) | Enabled; 35.1 mm square including quiet zone, 0.2 mm deep |

Use PETG with a **0.1 mm layer height, including the first layer**. Recommended nozzles are 0.4 mm for black and 0.25 mm for white lettering and the QR inset. Rounded fonts tend to print more cleanly than fonts with sharp corners.

Each line is centered by its visible outline, with kerning and shaping applied. The vertical layout adapts to one or two name lines and scales with the base height. Font sizes and corner radius remain as entered; long-text fitting can reduce the font size.

The STL has its underside at Z = 0. Print the base in black and change to white for the first text layer above Z = 2 mm, or above your chosen base thickness. Set the change at that boundary and inspect your slicer's layer preview. STL does not store colors and omits the back-side QR color pattern; use 3MF for the QR.

The experimental 3MF uses standard nested components, in millimeters:

```text
Mailbox label
├── Base
├── Text
│   ├── Text 1
│   ├── Text 2
│   └── …
└── QR white
```

Each Text child is a separate connected solid from the lettering, including the unit number. Dots and accents can therefore be separate children. All meshes retain their original positions, with the lettering on top of the base. Only Mailbox label is placed in the build.

With a multi-material printer profile, assign **black to Base** and **white to Text and QR white** (or their individual parts, depending on how your slicer exposes the hierarchy). The file uses nested 3MF components and omits flat PrusaSlicer metadata; its UI hierarchy behavior has not been verified. It does not set filaments, printer profiles, or slicing settings.

The QR links directly to <https://liyanage.github.io/mailbox-label-3dprint-generator/> with no redirect service. It uses black squares on a white background, version 4 with medium error correction: 33 × 33 modules plus a three-module white quiet zone on every side. The 35.1 mm footprint keeps each module at 0.9 mm for the 0.25 mm white nozzle while reducing the white border from 3.6 to 2.7 mm per side. [The QR standard calls for four modules](https://www.qrcode.com/en/howto/code.html), so check scanning on a physical print. Actual extrusion width depends on the slicer profile. QR white is flush with the underside at Z = 0 and extends to Z = 0.2 mm, replacing that region of the black base without overlapping it. The code is oriented to read from underneath; rotate the preview to inspect it.

At 0.1 mm layers the inset occupies the first two layers and needs black and white in each, so a layer-height color change alone is insufficient. Test-print to check white opacity, first-layer detail, and phone scanning. The 35.1 mm square must fit inside the base, including its rounded corners, and the base must be at least 0.3 mm thick. Turn off **QR code on back — links to this app (3MF)** under Advanced for smaller labels or an unmarked back.

## Mailbox compatibility

Designed for door identification on **Florence versatile™ 4C centralized
mailboxes**, with the default size fitted to model
[4C06S-04](https://www.florencemailboxes.com/products/std-4c-mailboxes/4c-recessed-mount-mailboxes/versatile-4c06s-04/).
These belong to the broader **STD-4C multi-tenant mailbox** category commonly used
in apartment and condominium buildings.

Florence specifies a common adhesive door-decal size across its versatile 4C
modules: **1¾ inches wide × 1½ inches high (44.45 × 38.1 mm)**. The default printed
label is **44.5 × 38.5 mm**, covering approximately that footprint while being
0.05 mm wider and 0.4 mm taller. See the manufacturer's
[4C catalog, page 4, Door ID Options](https://images.salsify.com/images/ky7gbqqhs0t5gl6s048q/Florence-4C-Catalog-4CPROD1125.pdf#page=4).

The shared decal size makes the Florence versatile 4C family the intended
compatibility target. Fit on other models or brands depends on the available
door-label area and clearance for the 3 mm raised label; an STD-4C designation
alone does not establish compatibility. Check those dimensions and adjust
Width and Height under Advanced as needed.

## Implementation

- **TypeScript and Vite** provide the app and production build, with plain HTML and CSS for the interface.
- **HarfBuzz.js / WebAssembly** reads the locally selected font, shapes text, and extracts glyph outlines. Bézier curves are flattened to a 0.01 mm tolerance.
- **Manifold / WebAssembly** builds filled 2D regions with letter counters, extrudes the base and lettering, and combines them into one closed solid.
- A **Web Worker** handles font processing and geometry so the interface remains responsive.
- **Three.js** renders the separate black and white meshes, including the underside QR, with orbit controls. A flat front outline preview is available when WebGL is unavailable.
- **qrcode-generator** encodes the fixed website URL locally. QR geometry receives a microscopic corner clearance to avoid non-manifold contacts between diagonally touching squares.
- A small binary STL writer exports the same mesh shown in the preview. The 3MF writer retains the separate closed volumes and their names, using **fflate** to package the XML and meshes into a ZIP archive. **IndexedDB** stores the uploaded font and font-selection preferences. `src/fonts.ts` lists included fonts and their outline weights; add entries there to offer more typefaces.

## Verification

SF Pro Rounded geometry tests require your own font file. They use `/Library/Fonts/SF-Pro-Rounded-Bold.otf` by default; set `MAILBOX_TEST_FONT` for another location. Bundled Dosis tests need no additional font.

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

For an already installed Chromium-based browser, set `PLAYWRIGHT_EXECUTABLE_PATH` to its executable instead of installing Playwright's browser. Geometry and browser tests that require the font are explicitly skipped when it is unavailable.

The checks cover reference dimensions and lettering placement, closed edges, face orientation, volume, extrusion heights, counters in the digit 8, long-text fitting, accents, and invalid input. Dosis tests also verify weight 700 affects the outlines. 3MF checks cover archive structure, part grouping, closed meshes, preserved heights, and agreement with the STL volume. Browser checks exercise uploaded and included fonts, source switching and persistence, both name layouts, preview controls, stale-download prevention, errors, mobile layout, and both downloaded formats.

QR checks independently decode both a rasterized underside of the exported 3MF mesh and a screenshot of the rotated browser preview using **jsQR**. They also verify normal polarity, the quiet zone, 0.2 mm inset depth, no overlap with the black base, and unchanged STL output.

A slicer preview and a physical test print remain the final checks for your printer and mailbox.
