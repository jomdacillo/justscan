/**
 * Document detection and perspective correction using OpenCV.js.
 *
 * The algorithm:
 *   1. Downscale the source for speed.
 *   2. Convert to grayscale, blur to reduce noise.
 *   3. Adaptive threshold + morphological close to expose the page outline.
 *   4. Canny edge detection.
 *   5. Find external contours.
 *   6. Approximate each contour to a polygon; keep the largest 4-vertex one.
 *   7. Order corners (top-left, top-right, bottom-right, bottom-left).
 *   8. Build a perspective-transform matrix and warp the source to a clean rectangle.
 *
 * Every Mat we create is .delete()'d in a finally block — OpenCV.js leaks
 * memory aggressively if you don't.
 */

const MIN_CONTOUR_AREA_RATIO = 0.15 // contour must cover at least 15% of frame
const APPROX_EPSILON_RATIO = 0.02   // polygon approximation tolerance

/**
 * Detect the largest 4-corner document in an image source.
 *
 * @param {object} cv - The loaded OpenCV instance.
 * @param {HTMLImageElement | HTMLCanvasElement | HTMLVideoElement} source
 * @returns {{corners: Array<{x:number, y:number}>, sourceWidth:number, sourceHeight:number} | null}
 *          Corners in source coordinates (TL, TR, BR, BL order), or null if no
 *          plausible document was found.
 */
export function detectDocument(cv, source) {
  const sourceWidth = source.naturalWidth || source.videoWidth || source.width
  const sourceHeight = source.naturalHeight || source.videoHeight || source.height
  if (!sourceWidth || !sourceHeight) return null

  // Downscale for speed — long edge ~600px is plenty for detection
  const maxDim = 600
  const scale = Math.min(1, maxDim / Math.max(sourceWidth, sourceHeight))
  const w = Math.round(sourceWidth * scale)
  const h = Math.round(sourceHeight * scale)

  // Pull pixels into a canvas at the scaled size
  const tmpCanvas = document.createElement('canvas')
  tmpCanvas.width = w
  tmpCanvas.height = h
  const tctx = tmpCanvas.getContext('2d')
  tctx.drawImage(source, 0, 0, w, h)

  const src = cv.imread(tmpCanvas)
  const gray = new cv.Mat()
  const blur = new cv.Mat()
  const edges = new cv.Mat()
  const dilated = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()

  let bestQuad = null

  try {
    // 1. Grayscale + blur
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0)

    // 2. Canny edges
    cv.Canny(blur, edges, 50, 150)

    // 3. Dilate to close gaps in edges
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
    cv.dilate(edges, dilated, kernel)
    kernel.delete()

    // 4. Find external contours
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

      // 5. Approximate to polygon
      const peri = cv.arcLength(cnt, true)
      const approx = new cv.Mat()
      cv.approxPolyDP(cnt, approx, APPROX_EPSILON_RATIO * peri, true)

      if (approx.rows === 4 && cv.isContourConvex(approx) && area > bestArea) {
        // Extract 4 points
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
    console.error('detectDocument error', err)
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
 * Order 4 unsorted corners as [top-left, top-right, bottom-right, bottom-left].
 * Method: TL has smallest x+y, BR has largest x+y, TR has smallest y-x, BL has largest y-x.
 */
export function orderCorners(pts) {
  const sums = pts.map(p => p.x + p.y)
  const diffs = pts.map(p => p.y - p.x)

  const tl = pts[sums.indexOf(Math.min(...sums))]
  const br = pts[sums.indexOf(Math.max(...sums))]
  const tr = pts[diffs.indexOf(Math.min(...diffs))]
  const bl = pts[diffs.indexOf(Math.max(...diffs))]

  return [tl, tr, br, bl]
}

/**
 * Compute the destination rectangle dimensions from 4 corners,
 * preserving the average width and height of the input quad.
 */
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

/**
 * Apply a perspective warp to extract a flat rectangle from a quadrilateral.
 *
 * @param {object} cv - The loaded OpenCV instance.
 * @param {HTMLImageElement | HTMLCanvasElement} source
 * @param {Array<{x:number, y:number}>} corners - In TL/TR/BR/BL order
 * @returns {HTMLCanvasElement} - A new canvas containing the flattened document.
 */
export function warpDocument(cv, source, corners) {
  const { width, height } = destinationSize(corners)

  // Read source into a Mat
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = source.naturalWidth || source.width
  sourceCanvas.height = source.naturalHeight || source.height
  sourceCanvas.getContext('2d').drawImage(source, 0, 0)

  const src = cv.imread(sourceCanvas)
  const dst = new cv.Mat()
  let M = null
  let srcTri = null
  let dstTri = null

  try {
    const [tl, tr, br, bl] = corners

    srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl.x, tl.y,
      tr.x, tr.y,
      br.x, br.y,
      bl.x, bl.y,
    ])

    dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      width, 0,
      width, height,
      0, height,
    ])

    M = cv.getPerspectiveTransform(srcTri, dstTri)
    cv.warpPerspective(
      src, dst, M,
      new cv.Size(width, height),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255),
    )

    // Convert dst Mat back to a canvas
    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    cv.imshow(out, dst)
    return out
  } finally {
    src.delete()
    dst.delete()
    if (M) M.delete()
    if (srcTri) srcTri.delete()
    if (dstTri) dstTri.delete()
  }
}

/** Convenience: detect + warp in one call. Returns null if no document found. */
export function detectAndWarp(cv, source) {
  const detection = detectDocument(cv, source)
  if (!detection) return null
  return {
    canvas: warpDocument(cv, source, detection.corners),
    corners: detection.corners,
  }
}

/** Build a default "full image" set of corners (for the manual fallback). */
export function defaultCorners(width, height, inset = 0) {
  return [
    { x: inset,         y: inset },
    { x: width - inset, y: inset },
    { x: width - inset, y: height - inset },
    { x: inset,         y: height - inset },
  ]
}
