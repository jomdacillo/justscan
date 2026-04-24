/**
 * Image processing for the "scanned document" effect.
 *
 * Two output modes:
 *  - 'color'  : auto white balance + brightness/contrast lift to make paper pop
 *  - 'bw'     : grayscale + adaptive (local-mean) threshold for crisp text
 *
 * All processing happens client-side on a canvas. No upload, no server.
 */

/** Load an image from a File/Blob/data URL into an HTMLImageElement. */
export function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to decode image'))
    img.crossOrigin = 'anonymous'
    if (typeof source === 'string') {
      img.src = source
    } else {
      img.src = URL.createObjectURL(source)
    }
  })
}

/** Draw an image onto a canvas at a sensible max dimension, returning the ctx + ImageData. */
function drawToCanvas(img, maxDim = 2000) {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, w, h)
  return { canvas, ctx, width: w, height: h }
}

/**
 * Color document enhance.
 * Steps:
 *  1. Sample the brightest 5% of pixels to estimate "paper white".
 *  2. Scale channels so paper white -> ~255 (auto white balance).
 *  3. Apply a subtle S-curve to lift contrast.
 */
function enhanceColor(imageData) {
  const data = imageData.data
  const len = data.length

  // 1) Estimate paper white from brightness histogram
  const hist = new Uint32Array(256)
  for (let i = 0; i < len; i += 4) {
    const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0
    hist[lum]++
  }
  const totalPixels = len / 4
  const target = totalPixels * 0.05 // top 5%
  let acc = 0
  let whitePoint = 255
  for (let v = 255; v >= 0; v--) {
    acc += hist[v]
    if (acc >= target) {
      whitePoint = v
      break
    }
  }
  whitePoint = Math.max(160, whitePoint) // safety floor

  // 2) Per-channel white balance — find each channel's high quantile
  const channelWhite = [0, 0, 0]
  for (let c = 0; c < 3; c++) {
    const ch = new Uint32Array(256)
    for (let i = c; i < len; i += 4) ch[data[i]]++
    let a = 0
    let w = 255
    for (let v = 255; v >= 0; v--) {
      a += ch[v]
      if (a >= target) {
        w = v
        break
      }
    }
    channelWhite[c] = Math.max(160, w)
  }

  // Build LUTs per channel: scale + soft contrast curve
  const luts = channelWhite.map((wp) => {
    const lut = new Uint8ClampedArray(256)
    const gain = 255 / wp
    for (let v = 0; v < 256; v++) {
      // scale toward white
      let x = Math.min(255, v * gain)
      // soft S-curve around 128 to add contrast
      const n = x / 255
      const curved = 0.5 - 0.5 * Math.cos(Math.pow(n, 0.92) * Math.PI)
      lut[v] = Math.round(curved * 255)
    }
    return lut
  })

  for (let i = 0; i < len; i += 4) {
    data[i]     = luts[0][data[i]]
    data[i + 1] = luts[1][data[i + 1]]
    data[i + 2] = luts[2][data[i + 2]]
  }
  return imageData
}

/**
 * Grayscale + adaptive threshold (Bradley-Roth style).
 * Uses an integral image so the local mean is O(1) per pixel.
 * Output is binary (paper white / ink black).
 */
function toBlackAndWhite(imageData) {
  const { data, width: w, height: h } = imageData

  // 1) Convert to grayscale buffer
  const gray = new Uint8ClampedArray(w * h)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0
  }

  // 2) Build integral image (Uint32 — fits images up to ~16M pixels at value 255)
  const integral = new Uint32Array(w * h)
  for (let y = 0; y < h; y++) {
    let rowSum = 0
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      rowSum += gray[idx]
      integral[idx] = rowSum + (y > 0 ? integral[idx - w] : 0)
    }
  }

  // 3) Adaptive threshold: pixel < (local mean * (1 - t)) -> black, else white
  // window sized to ~1/8 of the smaller dimension
  const half = Math.max(8, Math.floor(Math.min(w, h) / 16))
  const t = 0.15 // threshold offset

  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - half)
    const y2 = Math.min(h - 1, y + half)
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - half)
      const x2 = Math.min(w - 1, x + half)
      const count = (x2 - x1) * (y2 - y1)

      const A = (x1 > 0 && y1 > 0) ? integral[(y1 - 1) * w + (x1 - 1)] : 0
      const B = (y1 > 0)           ? integral[(y1 - 1) * w + x2]       : 0
      const C = (x1 > 0)           ? integral[y2 * w + (x1 - 1)]       : 0
      const D = integral[y2 * w + x2]
      const sum = D - B - C + A

      const idx = y * w + x
      const pixel = gray[idx]
      const isBlack = pixel * count < sum * (1 - t)
      const out = isBlack ? 0 : 255

      const di = idx * 4
      data[di] = out
      data[di + 1] = out
      data[di + 2] = out
      data[di + 3] = 255
    }
  }
  return imageData
}

/**
 * Process a source image into a scanned-style canvas.
 * @param {HTMLImageElement} img
 * @param {'color' | 'bw'} mode
 * @returns {HTMLCanvasElement}
 */
export function processDocument(img, mode = 'color') {
  const { canvas, ctx, width, height } = drawToCanvas(img)
  const imageData = ctx.getImageData(0, 0, width, height)

  if (mode === 'bw') {
    toBlackAndWhite(imageData)
  } else {
    enhanceColor(imageData)
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/** Convert a canvas to a downloadable Blob (JPEG by default). */
export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.92) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Free the URL once the download has had a chance to start
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Small helper — formatted timestamp for filenames. */
export function timestampForFilename() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}
