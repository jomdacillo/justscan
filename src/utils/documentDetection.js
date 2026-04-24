/**
 * Document detection and perspective correction using OpenCV.js.
 *
 * Defensive rules for working with OpenCV.js in JS land:
 *   - Every Mat/MatVector created must be .delete()'d in a finally block.
 *     OpenCV.js leaks WASM heap memory aggressively otherwise.
 *   - Cap source dimensions before cv.imread on large phone photos to avoid
 *     OOM on memory-constrained devices.
 *   - Validate the user's corner quad before warping (non-collinear, non-zero
 *     area, ordered) — the warp matrix will fail silently otherwise.
 */

const MIN_CONTOUR_AREA_RATIO = 0.15
const APPROX_EPSILON_RATIO = 0.02

/* Cap source for warp at this long-edge size. Detection runs on a smaller
 * downscale internally. Keeping warp at <= 2400 keeps memory safe on iOS
 * Safari (which kills tabs around ~512MB of WASM heap). */
const MAX_WARP_DIM = 2400

/** Detect the largest 4-corner document in a video/image source. */
export function detectDocument(cv, source) {
  const sourceWidth = source.naturalWidth || source.videoWidth || source.width
  const sourceHeight = source.naturalHeight || source.videoHeight || source.height
  if (!sourceWidth || !sourceHeight) return null

  // Detection downscale — long edge ~600px is plenty for finding the page
  const maxDim = 600
  const scale = Math.min(1, maxDim / Math.max(sourceWidth, sourceHeight))
  const w = Math.round(sourceWidth * scale)
  const h = Math.round(sourceHeight * scale)

  const tmpCanvas = document.createElement('canvas')
  tmpCanvas.width = w
  tmpCanvas.height = h
  tmpCanvas.getContext('2d').drawImage(source, 0, 0, w, h)

  const src = cv.imread(tmpCanvas)
  const gray = new cv.Mat()
  const blur = new cv.Mat()
  const edges = new cv.Mat()
  const dilated = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()

  let bestQuad = null

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0)
    cv.Canny(blur, edges, 50, 150)

    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
    cv.dilate(edges, dilated, kernel)
    kernel.delete()

    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    const minArea = w * h * MIN_CONTOUR_AREA_RATIO
    let bestArea = 0

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i)
      const area = cv.contourArea(cnt)
      if (area < minArea) {
        cnt.delete()
        continue
      }

      const peri = cv.arcLength(cnt, true)
      const approx = new cv.Mat()
      cv.approxPolyDP(cnt, approx, APPROX_EPSILON_RATIO * peri, true)

      if (approx.rows === 4 && cv.isContourConvex(approx) && area > bestArea) {
        const pts = []
        for (let p = 0; p < 4; p++) {
          pts.push({
            x: approx.intAt(p, 0) / scale,
            y: approx.intAt(p, 1) / scale,
          })
        }
        bestQuad = pts
        bestArea = area
      }

      approx.delete()
      cnt.delete()
    }

    if (!bestQuad) return null

    return {
      corners: orderCorners(bestQuad),
      sourceWidth,
      sourceHeight,
    }
  } catch (err) {
    console.error('detectDocument:', err)
    return null
  } finally {
    src.delete()
    gray.delete()
    blur.delete()
    edges.delete()
    dilated.delete()
    contours.delete()
    hierarchy.delete()
  }
}

/**
 * Order 4 unsorted corners as [TL, TR, BR, BL].
 * Uses the sums/diffs trick: TL = min(x+y), BR = max(x+y),
 * TR = min(y-x), BL = max(y-x).
 */
export function orderCorners(pts) {
  if (!pts || pts.length !== 4) return pts
  const sums = pts.map((p) => p.x + p.y)
  const diffs = pts.map((p) => p.y - p.x)

  const tlIdx = sums.indexOf(Math.min(...sums))
  const brIdx = sums.indexOf(Math.max(...sums))
  const trIdx = diffs.indexOf(Math.min(...diffs))
  const blIdx = diffs.indexOf(Math.max(...diffs))

  // Defensive: if duplicate indices (degenerate quad), bail out unsorted
  const set = new Set([tlIdx, trIdx, brIdx, blIdx])
  if (set.size !== 4) return pts

  return [pts[tlIdx], pts[trIdx], pts[brIdx], pts[blIdx]]
}

/** Compute destination rectangle dimensions from corners. */
export function destinationSize(corners) {
  const [tl, tr, br, bl] = corners
  const widthTop = Math.hypot(tr.x - tl.x, tr.y - tl.y)
  const widthBottom = Math.hypot(br.x - bl.x, br.y - bl.y)
  const heightLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y)
  const heightRight = Math.hypot(br.x - tr.x, br.y - tr.y)

  return {
    width: Math.max(1, Math.round((widthTop + widthBottom) / 2)),
    height: Math.max(1, Math.round((heightLeft + heightRight) / 2)),
  }
}

/** Validate that a quad is usable for warping (non-degenerate). */
function validateQuad(corners, sourceWidth, sourceHeight) {
  if (!Array.isArray(corners) || corners.length !== 4) {
    return 'Need exactly 4 corners.'
  }
  for (const c of corners) {
    if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y)) {
      return 'Corner coordinates are invalid.'
    }
  }
  // Shoelace formula for polygon area
  let area = 0
  for (let i = 0; i < 4; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % 4]
    area += a.x * b.y - b.x * a.y
  }
  area = Math.abs(area) / 2
  const minArea = sourceWidth * sourceHeight * 0.01 // at least 1% of source
  if (area < minArea) {
    return 'Selected area is too small.'
  }
  return null
}

/**
 * Apply a perspective warp to extract a flat rectangle from a quadrilateral.
 * Throws Error with a human-readable message on failure.
 */
export function warpDocument(cv, source, rawCorners) {
  const sourceWidth = source.naturalWidth || source.width
  const sourceHeight = source.naturalHeight || source.height

  if (!sourceWidth || !sourceHeight) {
    throw new Error('Source image has no dimensions.')
  }

  // Re-order corners (in case the user dragged TL past TR, etc.) and clamp
  // to image bounds so cv.matFromArray doesn't get out-of-range values.
  const ordered = orderCorners(
    rawCorners.map((c) => ({
      x: Math.max(0, Math.min(sourceWidth, Number(c.x) || 0)),
      y: Math.max(0, Math.min(sourceHeight, Number(c.y) || 0)),
    })),
  )

  const validationError = validateQuad(ordered, sourceWidth, sourceHeight)
  if (validationError) throw new Error(validationError)

  // Downscale source if it's huge — modern phones produce 12MP+ photos
  // which can blow OpenCV's WASM heap on iOS Safari.
  const scale = Math.min(1, MAX_WARP_DIM / Math.max(sourceWidth, sourceHeight))
  const drawW = Math.round(sourceWidth * scale)
  const drawH = Math.round(sourceHeight * scale)

  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = drawW
  sourceCanvas.height = drawH
  sourceCanvas.getContext('2d').drawImage(source, 0, 0, drawW, drawH)

  const scaledCorners = ordered.map((c) => ({
    x: c.x * scale,
    y: c.y * scale,
  }))

  const { width, height } = destinationSize(scaledCorners)

  // Cap output dimensions just in case
  const safeWidth = Math.min(width, MAX_WARP_DIM)
  const safeHeight = Math.min(height, MAX_WARP_DIM)

  let src = null
  let dst = null
  let M = null
  let srcTri = null
  let dstTri = null

  try {
    src = cv.imread(sourceCanvas)
    dst = new cv.Mat()

    const [tl, tr, br, bl] = scaledCorners

    srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl.x, tl.y,
      tr.x, tr.y,
      br.x, br.y,
      bl.x, bl.y,
    ])

    dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      safeWidth, 0,
      safeWidth, safeHeight,
      0, safeHeight,
    ])

    M = cv.getPerspectiveTransform(srcTri, dstTri)
    cv.warpPerspective(
      src, dst, M,
      new cv.Size(safeWidth, safeHeight),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255),
    )

    const out = document.createElement('canvas')
    out.width = safeWidth
    out.height = safeHeight
    cv.imshow(out, dst)
    return out
  } catch (err) {
    console.error('warpDocument:', err)
    // OpenCV throws cryptic errors like { code, msg } — surface what we can
    const msg = err?.message || err?.msg || 'Unknown OpenCV error'
    throw new Error(`Perspective warp failed: ${msg}`)
  } finally {
    if (src) src.delete()
    if (dst) dst.delete()
    if (M) M.delete()
    if (srcTri) srcTri.delete()
    if (dstTri) dstTri.delete()
  }
}

/** Build a default "full image" set of corners (with optional inset). */
export function defaultCorners(width, height, inset = 0) {
  return [
    { x: inset,         y: inset },
    { x: width - inset, y: inset },
    { x: width - inset, y: height - inset },
    { x: inset,         y: height - inset },
  ]
}
