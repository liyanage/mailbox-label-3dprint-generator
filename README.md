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
4. Select **Download STL** for a single solid with a layer-height color change, or **Download 3MF** for separate **Base** and **Text** parts in PrusaSlicer.

The browser remembers the selected font source, included typeface, and uploaded font in IndexedDB for this site. Switching to Included fonts keeps your uploaded font available when you switch back. **Forget font** removes the uploaded copy. Clearing site data also removes these preferences. If browser storage is unavailable, fonts can still be used for the current visit. Names are not saved between visits.

Dosis is bundled with the app under the [SIL Open Font License 1.1](public/fonts/dosis/OFL.txt); its [source and attribution](public/fonts/dosis/README.md) are included. The original variable font is used at weight 700 when generating outlines. SF Pro Rounded is not bundled. Included fonts are served from the app itself, with no third-party font service.

Dimensions, thicknesses, typography, corner radius, margins, and long-text fitting are under **Advanced**. Editing an input disables the old download until you generate again. Unsupported characters, text extending beyond the base, and overlapping rows produce an error.

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

Each line is centered by its visible outline, with kerning and shaping applied. The vertical layout adapts to one or two name lines and scales with the base height. Font sizes and corner radius remain as entered; long-text fitting can reduce the font size.

The STL has its underside at Z = 0. Print the base in black and change to white for the first text layer above Z = 2 mm, or above your chosen base thickness. Set the change at that boundary and inspect your slicer's layer preview. STL does not store colors; the black-and-white preview illustrates the intended layer change.

The 3MF includes millimeter units and PrusaSlicer part metadata. Import it as one object with two parts: **Base** and **Text**, with all letters grouped in Text and positioned on top of the base. With a multi-material printer profile selected, assign your black filament to Base and white to Text. The file contains geometry and part names only; it does not set filaments, printer profiles, or slicing settings. Other slicers may handle the part metadata differently.

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
- **Three.js** renders the actual generated mesh with orbit controls and a preview of the color-change layers. A flat outline preview is available when WebGL is unavailable.
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

A slicer preview and a physical test print remain the final checks for your printer and mailbox.
