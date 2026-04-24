/**
 * Document detection and perspective correction using OpenCV.js.
 *
 * Memory discipline is critical. OpenCV.js runs inside a WASM heap with a
 * hard cap (~384 MB on iOS Safari, ~500 MB on Android Chrome). A 12 MP phone
 * photo decoded to RGBA is ~50 MB, and each derived Mat (grayscale, blur,
 * edges, dilated) adds more. This module:
 *
 *   1. Downscales to <= 500px long edge for detection. The page outline is
 *      very low-frequency — we lose nothing by working at thumbnail size.
 *   2. Uses a single try/finally that cleans up EVERY allocation, even if
 *      an intermediate op threw.
 *   3. Caps warp input at 1800px long edge so the output canvas stays small.
 */

const DETECT_LONG_EDGE = 500
const MAX_WARP_DIM = 1800

const MIN_CONTOUR_AREA_RATIO = 0.15
const APPROX_EPSILON_RATIO = 0.02

/* -------------------------------------------------------------------------- */
/*  Detection                                                                 */
/* -------------------------------------------------------------------------- */

export function detectDocument(cv, source) {
  const sourceWidth = source.naturalWidth || source.videoWidth || source.width
  const sourceHeight = source.naturalHeight || source.videoHeight || source.height
  if (!sourceWidth || !sourceHeight) return null

  const scale = Math.min(1, DETECT_LONG_EDGE / Math.max(sourceWidth, sourceHeight))
  const w = Math.max(1, Math.round(sourceWidth * scale))
  const h = Math.max(1, Math.round(sourceHeight * scale))

  const tmpCanvas = document.createElement('canvas')
  tmpCanvas.width = w
  tmpCanvas.height = h
  tmpCanvas.getContext('2d').drawImage(source, 0, 0, w, h)

  // Collect every allocation so finally can delete them even on partial failure
  const allocs = []
  const track = (mat) => { allocs.push(mat); return mat }

  let bestQuad = null

  try {
    const src = track(cv.imread(tmpCanvas))
    const gray = track(new cv.Mat())
    const blur = track(new cv.Mat())
    const edges = track(new cv.Mat())
    const dilated = track(new cv.Mat())
    const contours = track(new cv.MatVector())
    const hierarchy = track(new cv.Mat())

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0)
    cv.Canny(blur, edges, 50, 150)

    const kernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)))
    cv.dilate(edges, dilated, kernel)

    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    const minArea = w * h * MIN_CONTOUR_AREA_RATIO
    let bestArea = 0

    const cnCount = contours.size()
    for (let i = 0; i < cnCount; i++) {
      let cnt = null
      let approx = null
      try {
        cnt = contours.get(i)
        const area = cv.contourArea(cnt)
        if (area < minArea) continue

        const peri = cv.arcLength(cnt, true)
        approx = new cv.Mat()
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
      } finally {
        if (approx) approx.delete()
        if (cnt) cnt.delete()
      }
    }

    if (!bestQuad) return null
    return {
      corners: orderCorners(bestQuad),
      sourceWidth,
      sourceHeight,
    }
  } catch (err) {
    console.warn('[detectDocument] failed:', err?.message || err)
    return null
  } finally {
    // Delete everything, ignoring individual failures
    for (const mat of allocs) {
      try { mat.delete() } catch { /* ignore */ }
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Corner ordering                                                           */
/* -------------------------------------------------------------------------- */

export function orderCorners(pts) {
  if (!Array.isArray(pts) || pts.length !== 4) return pts
  const sums = pts.map((p) => p.x + p.y)
  const diffs = pts.map((p) => p.y - p.x)

  const tlIdx = sums.indexOf(Math.min(...sums))
  const brIdx = sums.indexOf(Math.max(...sums))
  const trIdx = diffs.indexOf(Math.min(...diffs))
  const blIdx = diffs.indexOf(Math.max(...diffs))

  const set = new Set([tlIdx, trIdx, brIdx, blIdx])
  if (set.size !== 4) return pts // degenerate — caller handles it

  return [pts[tlIdx], pts[trIdx], pts[brIdx], pts[blIdx]]
}

export function destinationSize(corners) {
  const [tl, tr, br, bl] = corners
  const wTop = Math.hypot(tr.x - tl.x, tr.y - tl.y)
  const wBot = Math.hypot(br.x - bl.x, br.y - bl.y)
  const hL = Math.hypot(bl.x - tl.x, bl.y - tl.y)
  const hR = Math.hypot(br.x - tr.x, br.y - tr.y)
  return {
    width: Math.max(1, Math.round((wTop + wBot) / 2)),
    height: Math.max(1, Math.round((hL + hR) / 2)),
  }
}

/* -------------------------------------------------------------------------- */
/*  Warp                                                                      */
/* -------------------------------------------------------------------------- */

function validateQuad(corners, sourceWidth, sourceHeight) {
  if (!Array.isArray(corners) || corners.length !== 4) {
    return 'Need exactly 4 corners.'
  }
  for (const c of corners) {
    if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y)) {
      return 'Corner coordinates are invalid.'
    }
  }
  let area = 0
  for (let i = 0; i < 4; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % 4]
    area += a.x * b.y - b.x * a.y
  }
  area = Math.abs(area) / 2
  if (area < sourceWidth * sourceHeight * 0.01) {
    return 'Selected area is too small.'
  }
  return null
}

export function warpDocument(cv, source, rawCorners) {
  const sourceWidth = source.naturalWidth || source.width
  const sourceHeight = source.naturalHeight || source.height
  if (!sourceWidth || !sourceHeight) {
    throw new Error('Source image has no dimensions.')
  }

  const ordered = orderCorners(
    rawCorners.map((c) => ({
      x: Math.max(0, Math.min(sourceWidth, Number(c.x) || 0)),
      y: Math.max(0, Math.min(sourceHeight, Number(c.y) || 0)),
    })),
  )

  const validationError = validateQuad(ordered, sourceWidth, sourceHeight)
  if (validationError) throw new Error(validationError)

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
  const safeWidth = Math.min(width, MAX_WARP_DIM)
  const safeHeight = Math.min(height, MAX_WARP_DIM)

  const allocs = []
  const track = (mat) => { allocs.push(mat); return mat }

  try {
    const src = track(cv.imread(sourceCanvas))
    const dst = track(new cv.Mat())

    const [tl, tr, br, bl] = scaledCorners

    const srcTri = track(cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y,
    ]))
    const dstTri = track(cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0, safeWidth, 0, safeWidth, safeHeight, 0, safeHeight,
    ]))

    const M = track(cv.getPerspectiveTransform(srcTri, dstTri))
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
    console.error('[warpDocument]', err)
    const msg = err?.message || err?.msg || String(err) || 'Unknown error'
    throw new Error(`Perspective warp failed: ${msg}`)
  } finally {
    for (const mat of allocs) {
      try { mat.delete() } catch { /* ignore */ }
    }
  }
}

export function defaultCorners(width, height, inset = 0) {
  return [
    { x: inset,         y: inset },
    { x: width - inset, y: inset },
    { x: width - inset, y: height - inset },
    { x: inset,         y: height - inset },
  ]
}
