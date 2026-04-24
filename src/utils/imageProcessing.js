/**
 * Scanner-style image enhancement.
 *
 * COLOR mode aims to look like a flatbed scanner output:
 *   1. Estimate the brightest "paper" areas with a coarse-grid local maximum.
 *   2. Divide the image by that local illumination to flatten lighting
 *      (the same trick used by ScanTailor / OpenCV's "shading correction").
 *   3. Apply an aggressive S-curve to deepen ink and brighten paper.
 *   4. Slight desaturation toward neutral so it reads as "document"
 *      not "vivid photo".
 *
 * BW mode aims to look like a Xerox photocopy:
 *   1. Same shading correction.
 *   2. 3x3 box blur (cheap denoise) on grayscale.
 *   3. Bradley-Roth adaptive threshold via integral image.
 *   4. Speckle removal — flip isolated lonely pixels.
 *
 * All operations are pure Canvas2D + typed arrays. No deps.
 */

const MAX_DIM = 2200

export function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to decode image'))
    img.crossOrigin = 'anonymous'
    if (typeof source === 'string') img.src = source
    else img.src = URL.createObjectURL(source)
  })
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function sourceToCanvas(source, maxDim = MAX_DIM) {
  const w0 = source.naturalWidth || source.width
  const h0 = source.naturalHeight || source.height
  const scale = Math.min(1, maxDim / Math.max(w0, h0))
  const w = Math.max(1, Math.round(w0 * scale))
  const h = Math.max(1, Math.round(h0 * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(source, 0, 0, w, h)
  return { canvas, ctx, width: w, height: h }
}

/**
 * Build a per-pixel "paper white" reference by taking the brightest pixel
 * in each cell of a coarse grid, smoothing the grid, and bilinearly
 * upsampling. Used for shading correction.
 */
function estimateIllumination(srcData, w, h) {
  const cellsX = 24
  const cellsY = Math.max(8, Math.round(cellsX * (h / w)))
  const cellW = w / cellsX
  const cellH = h / cellsY

  const grid = new Uint8ClampedArray(cellsX * cellsY * 3)

  for (let cy = 0; cy < cellsY; cy++) {
    const y0 = Math.floor(cy * cellH)
    const y1 = Math.min(h, Math.floor((cy + 1) * cellH))
    for (let cx = 0; cx < cellsX; cx++) {
      const x0 = Math.floor(cx * cellW)
      const x1 = Math.min(w, Math.floor((cx + 1) * cellW))

      let mr = 0, mg = 0, mb = 0
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * w + x) * 4
          if (srcData[i]     > mr) mr = srcData[i]
          if (srcData[i + 1] > mg) mg = srcData[i + 1]
          if (srcData[i + 2] > mb) mb = srcData[i + 2]
        }
      }
      const gi = (cy * cellsX + cx) * 3
      grid[gi]     = mr
      grid[gi + 1] = mg
      grid[gi + 2] = mb
    }
  }

  // Light box-blur over the grid to remove cell-edge artifacts
  const smoothed = new Uint8ClampedArray(grid.length)
  for (let cy = 0; cy < cellsY; cy++) {
    for (let cx = 0; cx < cellsX; cx++) {
      let sr = 0, sg = 0, sb = 0, n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = cy + dy, nx = cx + dx
          if (nx < 0 || ny < 0 || nx >= cellsX || ny >= cellsY) continue
          const gi = (ny * cellsX + nx) * 3
          sr += grid[gi]; sg += grid[gi + 1]; sb += grid[gi + 2]
          n++
        }
      }
      const oi = (cy * cellsX + cx) * 3
      smoothed[oi]     = sr / n
      smoothed[oi + 1] = sg / n
      smoothed[oi + 2] = sb / n
    }
  }

  // Bilinear upsample to (w, h, 3)
  const illum = new Float32Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    const gy = (y / h) * cellsY - 0.5
    const gy0 = Math.max(0, Math.floor(gy))
    const gy1 = Math.min(cellsY - 1, gy0 + 1)
    const fy = Math.max(0, Math.min(1, gy - gy0))

    for (let x = 0; x < w; x++) {
      const gx = (x / w) * cellsX - 0.5
      const gx0 = Math.max(0, Math.floor(gx))
      const gx1 = Math.min(cellsX - 1, gx0 + 1)
      const fx = Math.max(0, Math.min(1, gx - gx0))

      const i00 = (gy0 * cellsX + gx0) * 3
      const i01 = (gy0 * cellsX + gx1) * 3
      const i10 = (gy1 * cellsX + gx0) * 3
      const i11 = (gy1 * cellsX + gx1) * 3

      const oi = (y * w + x) * 3
      for (let c = 0; c < 3; c++) {
        const v00 = smoothed[i00 + c]
        const v01 = smoothed[i01 + c]
        const v10 = smoothed[i10 + c]
        const v11 = smoothed[i11 + c]
        const top = v00 * (1 - fx) + v01 * fx
        const bot = v10 * (1 - fx) + v11 * fx
        // floor at 60 to avoid divide-by-tiny in dark regions
        illum[oi + c] = Math.max(60, top * (1 - fy) + bot * fy)
      }
    }
  }

  return illum
}

/* -------------------------------------------------------------------------- */
/*  Color mode                                                                */
/* -------------------------------------------------------------------------- */

function enhanceColor(imageData) {
  const { data, width: w, height: h } = imageData
  const len = data.length

  // 1. Estimate per-channel illumination
  const illum = estimateIllumination(data, w, h)

  // 2. Shading correction
  for (let i = 0, p = 0; i < len; i += 4, p += 3) {
    const r = data[i]     / illum[p]     * 255
    const g = data[i + 1] / illum[p + 1] * 255
    const b = data[i + 2] / illum[p + 2] * 255
    data[i]     = r > 255 ? 255 : r
    data[i + 1] = g > 255 ? 255 : g
    data[i + 2] = b > 255 ? 255 : b
  }

  // 3. Aggressive S-curve via LUT
  //    Anchors (in 0-255):
  //      0   -> 0
  //      80  -> 40   (deepen ink/shadows)
  //      180 -> 230  (push paper toward white)
  //      255 -> 255
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) {
    let out
    if (v < 80) {
      out = (v / 80) * 40
    } else if (v < 180) {
      out = 40 + ((v - 80) / 100) * 190
    } else {
      out = 230 + ((v - 180) / 75) * 25
    }
    lut[v] = Math.round(out)
  }
  for (let i = 0; i < len; i += 4) {
    data[i]     = lut[data[i]]
    data[i + 1] = lut[data[i + 1]]
    data[i + 2] = lut[data[i + 2]]
  }

  // 4. Slight desaturation (mix 25% toward grayscale luminance)
  const desat = 0.25
  for (let i = 0; i < len; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const lum = r * 0.299 + g * 0.587 + b * 0.114
    data[i]     = r + (lum - r) * desat
    data[i + 1] = g + (lum - g) * desat
    data[i + 2] = b + (lum - b) * desat
  }

  return imageData
}

/* -------------------------------------------------------------------------- */
/*  B&W mode                                                                  */
/* -------------------------------------------------------------------------- */

function integralImage(gray, w, h) {
  const integral = new Float64Array(w * h)
  for (let y = 0; y < h; y++) {
    let rowSum = 0
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      rowSum += gray[idx]
      integral[idx] = rowSum + (y > 0 ? integral[idx - w] : 0)
    }
  }
  return integral
}

function toBlackAndWhite(imageData) {
  const { data, width: w, height: h } = imageData

  // 1. Shading correction
  const illum = estimateIllumination(data, w, h)
  for (let i = 0, p = 0; i < data.length; i += 4, p += 3) {
    const r = data[i]     / illum[p]     * 255
    const g = data[i + 1] / illum[p + 1] * 255
    const b = data[i + 2] / illum[p + 2] * 255
    data[i]     = r > 255 ? 255 : r
    data[i + 1] = g > 255 ? 255 : g
    data[i + 2] = b > 255 ? 255 : b
  }

  // 2. Grayscale
  const gray = new Uint8ClampedArray(w * h)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
  }

  // 3. 3x3 box blur (cheap denoise)
  const blurred = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= w) continue
          sum += gray[ny * w + nx]
          n++
        }
      }
      blurred[y * w + x] = sum / n
    }
  }

  // 4. Bradley-Roth adaptive threshold
  const integral = integralImage(blurred, w, h)
  const half = Math.max(8, Math.floor(Math.min(w, h) / 28))
  const t = 0.18

  const bin = new Uint8Array(w * h)
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
      const isBlack = blurred[idx] * count < sum * (1 - t)
      bin[idx] = isBlack ? 0 : 1
    }
  }

  // 5. Speckle removal: flip isolated pixels
  const cleaned = new Uint8Array(bin)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x
      let sum = 0
      sum += bin[idx - w - 1] + bin[idx - w] + bin[idx - w + 1]
      sum += bin[idx - 1]                    + bin[idx + 1]
      sum += bin[idx + w - 1] + bin[idx + w] + bin[idx + w + 1]
      if (bin[idx] === 1 && sum <= 1) cleaned[idx] = 0
      else if (bin[idx] === 0 && sum >= 7) cleaned[idx] = 1
    }
  }

  // 6. Write back to RGBA
  for (let p = 0, i = 0; p < cleaned.length; p++, i += 4) {
    const v = cleaned[p] ? 255 : 0
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
    data[i + 3] = 255
  }

  return imageData
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

export function processDocument(source, mode = 'color') {
  const { canvas, ctx, width, height } = sourceToCanvas(source)
  const imageData = ctx.getImageData(0, 0, width, height)

  if (mode === 'bw') {
    toBlackAndWhite(imageData)
  } else {
    enhanceColor(imageData)
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.92) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function timestampForFilename() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}
