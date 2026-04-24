# JustScan

**A portable CamScanner. No fuss, just scan.**

A mobile-first React + Vite app that turns your phone's camera into a document scanner. Capture a photo (or pick one from your library), and JustScan applies a "scanned document" treatment in either **Color** or **Black & White** mode. Everything runs on-device — no uploads, no accounts, no telemetry.

Created by **Joe Dacillo**.

---

## Features

- 📷 **Live camera capture** via `getUserMedia` with rear-camera preference and a swap-camera control.
- 🖼️ **Library picker** for processing images you already have.
- 🎨 **Two output styles**:
  - **Color** — auto white-balance + soft S-curve contrast lift.
  - **Black & White** — adaptive (Bradley-Roth) thresholding for crisp text.
- 💾 **Save** as JPEG to your device. **Share** via the native share sheet where supported (iOS/Android).
- 🌓 **Light & Dark Mode** via `prefers-color-scheme`. **Increased Contrast** support via `prefers-contrast`.
- ♿ **Accessible**: semantic HTML, focus-visible outlines, ARIA labels on icon-only buttons, polite live regions for status, focus trap in the About sheet, reduced-motion respected.
- 📱 **iOS HIG-compliant** layout: 44pt minimum touch targets, primary CTAs in the thumb zone, safe-area insets honored, large titles, semantic system colors.

## Tech

- **React 18** + **Vite 5**
- Pure CSS (custom properties, no preprocessor)
- Canvas 2D for all image processing — zero dependencies for the imaging pipeline
- Web Share API + `<a download>` fallback

## Run locally

```bash
npm install
npm run dev
```

Vite will print a network URL (e.g. `http://192.168.x.x:5173`). Open it on your phone — that's the easiest way to test the camera. **Note:** modern browsers require HTTPS or `localhost` for `getUserMedia`. For phone testing over LAN you may need to use a tunneling tool (Cloudflare Tunnel, ngrok) or run Vite with HTTPS.

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
│   ├── CameraScreen.jsx/.css     # Viewfinder + shutter
│   ├── PreviewScreen.jsx/.css    # Processed result + actions
│   ├── AboutSheet.jsx/.css       # Modal sheet
│   ├── Button.jsx/.css
│   ├── SegmentedControl.jsx/.css
│   └── Icons.jsx                 # Inline SVG icon set
├── hooks/
│   └── useCamera.js              # getUserMedia wrapper
├── utils/
│   ├── imageProcessing.js        # Color enhance + B&W threshold
│   └── haptics.js                # Vibration API helper
└── styles/
    └── global.css                # Design tokens, reset
```

## License

MIT
