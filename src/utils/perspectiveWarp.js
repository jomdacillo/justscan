/**
 * Perspective warp in pure JavaScript.
 *
 * Given 4 corners on a source image, flatten the enclosed quadrilateral
 * into a rectangle. This is what every document scanner does after the
 * user confirms the page edges.
 *
 * How it works:
 *   1. Solve an 8-parameter projective transform (3x3 matrix with
 *      bottom-right = 1) that maps the 4 source corners to the 4
 *      destination corners. This is a linear system of 8 equations in
 *      8 unknowns — we solve it with Gaussian elimination.
 *   2. Invert the forward transform to get a dest→source mapping.
 *   3. For each destination pixel, compute the source coordinate and
 *      bilinear-sample. Processing happens in row bands with periodic
 *      yields to the main thread so the UI stays responsive.
 *
 * No dependencies. No WASM. No CDN.
 */

/* -------------------------------------------------------------------------- */
/*  Corner ordering and helpers                                               */
/* -------------------------------------------------------------------------- */

/** Order 4 corners as [top-left, top-right, bottom-right, bottom-left]. */
export function orderCorners(pts) {
  if (!Array.isArray(pts) || pts.length !== 4) return pts
  const sums = pts.map((p) => p.x + p.y)
  const diffs = pts.map((p) => p.y - p.x)

  const tlIdx = sums.indexOf(Math.min(...sums))
  const brIdx = sums.indexOf(Math.max(...sums))
  const trIdx = diffs.indexOf(Math.min(...diffs))
  const blIdx = diffs.indexOf(Math.max(...diffs))

  const set = new Set([tlIdx, trIdx, brIdx, blIdx])
  if (set.size !== 4) return pts

  return [pts[tlIdx], pts[trIdx], pts[brIdx], pts[blIdx]]
}

/** Destination rectangle dimensions — average the quad's two width and two height sides. */
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

/** Default "full image" quad for users who just want the whole photo. */
export function defaultCorners(width, height, inset = 0) {
  return [
    { x: inset,         y: inset },
    { x: width - inset, y: inset },
    { x: width - inset, y: height - inset },
    { x: inset,         y: height - inset },
  ]
}

/* -------------------------------------------------------------------------- */
/*  Linear system solver                                                      */
/* -------------------------------------------------------------------------- */

/**
 * In-place Gaussian elimination with partial pivoting.
 * Solves Ax = b for x, where A is an n×n matrix flattened row-major
 * and b is an n-vector. Mutates A and b; returns the solution vector.
 */
function solveLinearSystem(A, b, n) {
  for (let i = 0; i < n; i++) {
    // Partial pivot — find row with the largest magnitude in column i
    let maxRow = i
    let maxVal = Math.abs(A[i * n + i])
    for (let r = i + 1; r < n; r++) {
      const v = Math.abs(A[r * n + i])
      if (v > maxVal) { maxVal = v; maxRow = r }
    }
    if (maxVal < 1e-12) {
      throw new Error('Perspective transform is singular — corners are collinear.')
    }
    if (maxRow !== i) {
      for (let c = 0; c < n; c++) {
        const tmp = A[i * n + c]
        A[i * n + c] = A[maxRow * n + c]
        A[maxRow * n + c] = tmp
      }
      const tmpB = b[i]
      b[i] = b[maxRow]
      b[maxRow] = tmpB
    }
    // Eliminate column i in rows below
    const pivot = A[i * n + i]
    for (let r = i + 1; r < n; r++) {
      const factor = A[r * n + i] / pivot
      if (factor === 0) continue
      for (let c = i; c < n; c++) {
        A[r * n + c] -= factor * A[i * n + c]
      }
      b[r] -= factor * b[i]
    }
  }
  // Back-substitute
  const x = new Float64Array(n)
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i]
    for (let c = i + 1; c < n; c++) {
      sum -= A[i * n + c] * x[c]
    }
    x[i] = sum / A[i * n + i]
  }
  return x
}

/**
 * Compute the 3x3 projective transform mapping 4 source points to 4
 * destination points.
 *
 * The transform has 8 degrees of freedom (the 3x3 matrix with
 * m[2][2] = 1). Each (src, dst) pair gives 2 equations, so 4 pairs
 * gives exactly 8 equations.
 *
 * For a point (x, y) and matrix M with parameters [a b c d e f g h],
 *   X = (a*x + b*y + c) / (g*x + h*y + 1)
 *   Y = (d*x + e*y + f) / (g*x + h*y + 1)
 * Rearranged:
 *   a*x + b*y + c + 0 + 0 + 0 - X*x*g - X*y*h = X
 *   0 + 0 + 0 + d*x + e*y + f - Y*x*g - Y*y*h = Y
 *
 * Returns [a, b, c, d, e, f, g, h].
 */
function getPerspectiveMatrix(src, dst) {
  const A = new Float64Array(64) // 8x8
  const b = new Float64Array(8)

  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i]
    const { x: dx, y: dy } = dst[i]

    // Row 2i: [sx, sy, 1, 0, 0, 0, -dx*sx, -dx*sy] = dx
    A[2 * i * 8 + 0] = sx
    A[2 * i * 8 + 1] = sy
    A[2 * i * 8 + 2] = 1
    A[2 * i * 8 + 6] = -dx * sx
    A[2 * i * 8 + 7] = -dx * sy
    b[2 * i] = dx

    // Row 2i+1: [0, 0, 0, sx, sy, 1, -dy*sx, -dy*sy] = dy
    A[(2 * i + 1) * 8 + 3] = sx
    A[(2 * i + 1) * 8 + 4] = sy
    A[(2 * i + 1) * 8 + 5] = 1
    A[(2 * i + 1) * 8 + 6] = -dy * sx
    A[(2 * i + 1) * 8 + 7] = -dy * sy
    b[2 * i + 1] = dy
  }

  return solveLinearSystem(A, b, 8)
}

/**
 * Invert an 8-param perspective transform.
 * Returns [a, b, c, d, e, f, g, h] such that the inverse maps dst → src.
 *
 * Method: treat the 8 params as a 3×3 matrix with m[2][2] = 1, invert
 * algebraically, then divide through so the new m[2][2] = 1 again.
 */
function invertPerspective(m) {
  const [a, b, c, d, e, f, g, h] = m

  // 3x3 matrix cofactors
  const c00 = e * 1 - f * h
  const c01 = -(d * 1 - f * g)
  const c02 = d * h - e * g
  const c10 = -(b * 1 - c * h)
  const c11 = a * 1 - c * g
  const c12 = -(a * h - b * g)
  const c20 = b * f - c * e
  const c21 = -(a * f - c * d)
  const c22 = a * e - b * d

  const det = a * c00 + b * c01 + c * c02
  if (Math.abs(det) < 1e-12) {
    throw new Error('Perspective transform cannot be inverted.')
  }
  const inv = 1 / det

  // Adjugate (transpose of cofactors), then divide by det
  const invMat = [
    c00 * inv, c10 * inv, c20 * inv,
    c01 * inv, c11 * inv, c21 * inv,
    c02 * inv, c12 * inv, c22 * inv,
  ]
  // Normalize so the bottom-right is 1
  const scale = 1 / invMat[8]
  return [
    invMat[0] * scale, invMat[1] * scale, invMat[2] * scale,
    invMat[3] * scale, invMat[4] * scale, invMat[5] * scale,
    invMat[6] * scale, invMat[7] * scale,
  ]
}

/* -------------------------------------------------------------------------- */
/*  Warp                                                                      */
/* -------------------------------------------------------------------------- */

const MAX_WARP_DIM = 1800

function validateQuad(corners, sourceWidth, sourceHeight) {
  if (!Array.isArray(corners) || corners.length !== 4) {
    return 'Need exactly 4 corners.'
  }
  for (const c of corners) {
    if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y)) {
      return 'Corner coordinates are invalid.'
    }
  }
  // Shoelace area
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

/**
 * Perspective-warp the source image using the 4 given corners.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} source
 * @param {Array<{x:number, y:number}>} rawCorners
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function warpDocument(source, rawCorners) {
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

  // Downscale huge phone photos (12MP+) before warping to keep memory sane
  const scale = Math.min(1, MAX_WARP_DIM / Math.max(sourceWidth, sourceHeight))
  const drawW = Math.max(1, Math.round(sourceWidth * scale))
  const drawH = Math.max(1, Math.round(sourceHeight * scale))

  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = drawW
  sourceCanvas.height = drawH
  const sctx = sourceCanvas.getContext('2d', { willReadFrequently: true })
  sctx.drawImage(source, 0, 0, drawW, drawH)
  const sourceData = sctx.getImageData(0, 0, drawW, drawH)

  const scaledCorners = ordered.map((c) => ({ x: c.x * scale, y: c.y * scale }))

  const { width: outWRaw, height: outHRaw } = destinationSize(scaledCorners)
  const outW = Math.min(outWRaw, MAX_WARP_DIM)
  const outH = Math.min(outHRaw, MAX_WARP_DIM)

  // Forward transform: source → destination
  const [tl, tr, br, bl] = scaledCorners
  const srcPts = [tl, tr, br, bl]
  const dstPts = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ]
  const forward = getPerspectiveMatrix(srcPts, dstPts)
  const inv = invertPerspective(forward)
  const [ia, ib, ic, id, ie, iff, ig, ih] = inv

  // Allocate output
  const outCanvas = document.createElement('canvas')
  outCanvas.width = outW
  outCanvas.height = outH
  const octx = outCanvas.getContext('2d')
  const outData = octx.createImageData(outW, outH)
  const out = outData.data
  const src = sourceData.data

  // Process in bands, yielding between them so the main thread can paint
  const BAND_HEIGHT = 64
  for (let y0 = 0; y0 < outH; y0 += BAND_HEIGHT) {
    const y1 = Math.min(outH, y0 + BAND_HEIGHT)
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < outW; x++) {
        // Apply inverse perspective transform
        const denom = ig * x + ih * y + 1
        const sx = (ia * x + ib * y + ic) / denom
        const sy = (id * x + ie * y + iff) / denom

        const oi = (y * outW + x) * 4

        if (sx < 0 || sy < 0 || sx > drawW - 1 || sy > drawH - 1) {
          // Outside source — fill white
          out[oi] = 255; out[oi + 1] = 255; out[oi + 2] = 255; out[oi + 3] = 255
          continue
        }

        // Bilinear sample
        const x0 = Math.floor(sx)
        const y0i = Math.floor(sy)
        const x1i = Math.min(drawW - 1, x0 + 1)
        const y1i = Math.min(drawH - 1, y0i + 1)
        const fx = sx - x0
        const fy = sy - y0i

        const i00 = (y0i * drawW + x0) * 4
        const i01 = (y0i * drawW + x1i) * 4
        const i10 = (y1i * drawW + x0) * 4
        const i11 = (y1i * drawW + x1i) * 4

        for (let c = 0; c < 3; c++) {
          const v00 = src[i00 + c]
          const v01 = src[i01 + c]
          const v10 = src[i10 + c]
          const v11 = src[i11 + c]
          const top = v00 * (1 - fx) + v01 * fx
          const bot = v10 * (1 - fx) + v11 * fx
          out[oi + c] = top * (1 - fy) + bot * fy
        }
        out[oi + 3] = 255
      }
    }
    // Yield to the browser between bands
    if (y1 < outH) await new Promise((r) => setTimeout(r, 0))
  }

  octx.putImageData(outData, 0, 0)
  return outCanvas
}
