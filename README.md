# JustScan

**A portable CamScanner. No fuss, just scan.**

A mobile-first React + Vite app that turns your phone's camera into a real document scanner. Captures a photo (or accepts one from your library), automatically detects the document edges, lets you fine-tune the corners, then warps the page flat and applies a true scanner-style enhancement in **Color** or **Black & White**. Everything runs on-device — no uploads, no accounts, no telemetry.

Created by **Joe Dacillo**.

## Features

- 📷 **Live document detection** in the viewfinder — green outline shows what will be captured.
- 🔍 **Auto edge detection** powered by OpenCV.js (Canny edges → contour finding → 4-corner approximation).
- ✋ **Manual corner adjustment** — drag any of the 4 handles to refine the boundaries.
- 📐 **Perspective warp** flattens skewed/tilted documents into a clean rectangle.
- 🎨 **True scanner enhancement**:
  - **Color** — local-illumination shading correction, aggressive S-curve, slight desaturation.
  - **Black & White** — shading correction, denoise, Bradley-Roth adaptive threshold, speckle removal.
- 💾 **Save** as JPEG. **Share** via the native share sheet.
- 🌓 Light & Dark Mode, **Increased Contrast** support, **Reduced Motion** respected.
- ♿ Accessible: focus-visible outlines, ARIA labels, focus trap in modals, polite live regions.

## Stack

- **React 18** + **Vite 5**
- **OpenCV.js** (the `@techstark/opencv-js` npm package — bundled with the app and served from your own origin via Vite's `public/` folder, so detection works without third-party CDNs)
- Pure CSS — no preprocessor, no UI framework
- Canvas2D + typed arrays for the styling pipeline (zero deps)

## OpenCV bundling

OpenCV.js is a ~10 MB WASM-embedded JavaScript file. Rather than depending on a third-party CDN (which can be slow, region-blocked, or fail entirely), JustScan bundles it with the app:

1. `npm install` pulls `@techstark/opencv-js` (verbatim mirror of official OpenCV.js 4.10.0)
2. The `postinstall` script (`scripts/copy-opencv.js`) copies `node_modules/@techstark/opencv-js/dist/opencv.js` to `public/opencv.js`
3. Vite serves `public/` verbatim, so the file is available at `/opencv.js` in dev and `dist/opencv.js` in production
4. The runtime loader (`src/utils/opencvLoader.js`) tries `/opencv.js` first, then falls back to jsDelivr/unpkg only if local somehow fails
5. The `public/_headers` file tells Cloudflare Pages to cache it for a year (immutable)

First scan downloads the ~10 MB once; every subsequent scan is instant.

## Run locally

```bash
npm install
npm run dev
```

Open the printed network URL on your phone. **Note:** browsers require HTTPS or `localhost` for `getUserMedia`. For LAN testing use a tunnel (Cloudflare Tunnel, ngrok) or enable Vite's HTTPS option.

## Build

```bash
npm run build
npm run preview
```

## Project layout

```
src/
├── App.jsx                       # Screen routing
├── main.jsx                      # React entry
├── components/
│   ├── HomeScreen.jsx/.css       # Large title + CTAs
│   ├── CameraScreen.jsx/.css     # Viewfinder + live edge detection
│   ├── PreviewScreen.jsx/.css    # Edit corners → review styled output
│   ├── CornerEditor.jsx/.css     # Draggable 4-corner overlay
│   ├── AboutSheet.jsx/.css       # Modal sheet
│   ├── Button.jsx/.css
│   ├── SegmentedControl.jsx/.css
│   └── Icons.jsx
├── hooks/
│   └── useCamera.js              # getUserMedia wrapper
└── utils/
    ├── opencvLoader.js           # Lazy CDN loader for OpenCV.js
    ├── documentDetection.js      # Detect quads, warp perspective
    ├── imageProcessing.js        # Scanner-style color + B&W enhancement
    └── haptics.js
```

## License

MIT
