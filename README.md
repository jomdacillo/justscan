# JustScan

**A portable CamScanner. No fuss, just scan.**

A mobile-first React + Vite app that turns your phone's camera into a document scanner. Capture a photo (or pick one from your library), drag the 4 corners to fit the page edges, and JustScan flattens the perspective and applies a scanner-style enhancement in **Color** or **Black & White**. Everything runs on-device.

Created by **Joe Dacillo**.

## Features

- 📷 **Live camera capture** via `getUserMedia` with rear-camera preference.
- 🖼️ **Library picker** for processing images you already have.
- 📐 **Manual corner adjustment** — drag any of the 4 handles to fit the document.
- 🔲 **Perspective warp** (pure JavaScript) flattens skewed/tilted documents into a clean rectangle.
- 🎨 **Scanner enhancement**:
  - **Color** — shading correction, aggressive S-curve, slight desaturation.
  - **Black & White** — shading correction, denoise, Bradley-Roth adaptive threshold, speckle removal.
- 💾 **Save** as JPEG. **Share** via the native share sheet.
- 🌓 Light & Dark Mode, **Increased Contrast** and **Reduced Motion** respected.
- ♿ Accessible: focus-visible outlines, ARIA labels, focus trap in modals, polite live regions.
- 🛡️ **ErrorBoundary** catches any crash and shows a readable error instead of a white screen.

## Stack

- **React 18** + **Vite 5**
- Pure CSS — no preprocessor, no UI framework
- Pure JavaScript perspective transform + bilinear resampling (no OpenCV, no WASM, no CDN dependencies)
- Canvas2D + typed arrays for all image processing

## Run locally

```bash
npm install
npm run dev
```

Open the printed network URL on your phone. Browsers require HTTPS or `localhost` for `getUserMedia`.

## Build

```bash
npm run build
npm run preview
```

## Deploy (Cloudflare Pages)

Connect your GitHub repo, then:
- **Framework preset:** Vite
- **Build command:** `npm run build`
- **Build output directory:** `dist`

## Project layout

```
src/
├── App.jsx                       # Screen routing
├── main.jsx                      # React entry
├── components/
│   ├── HomeScreen.jsx/.css       # Large title + CTAs
│   ├── CameraScreen.jsx/.css     # Viewfinder + shutter
│   ├── PreviewScreen.jsx/.css    # Edit corners → review styled output
│   ├── CornerEditor.jsx/.css     # Draggable 4-corner overlay
│   ├── AboutSheet.jsx/.css       # Modal sheet
│   ├── ErrorBoundary.jsx         # Crash safety net
│   ├── Button.jsx/.css
│   ├── SegmentedControl.jsx/.css
│   └── Icons.jsx
├── hooks/
│   └── useCamera.js              # getUserMedia wrapper
└── utils/
    ├── perspectiveWarp.js        # 4-point perspective flattening (pure JS)
    ├── imageProcessing.js        # Scanner-style color + B&W enhancement
    └── haptics.js
```

## License

MIT
