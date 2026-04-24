/**
 * OpenCV.js loader.
 *
 * Tries multiple CDNs in order, with a timeout per attempt. On failure it
 * resets the cached promise so the user can retry without reloading the page.
 *
 * CDN order (first to succeed wins):
 *   1. jsDelivr  — multi-CDN, sub-50ms TTFB globally, 99.99% uptime
 *   2. unpkg     — fallback, also fronted by Cloudflare
 *   3. docs.opencv.org — official source, but slowest / least reliable
 *
 * Once loaded, OpenCV.js exposes itself globally as `window.cv`. We resolve
 * once `cv.Mat` is available (the WASM runtime has finished initializing).
 */

const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js',
  'https://unpkg.com/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js',
  'https://docs.opencv.org/4.10.0/opencv.js',
]

const SCRIPT_TIMEOUT_MS = 30_000   // give each CDN 30s before giving up
const RUNTIME_TIMEOUT_MS = 15_000  // and 15s after script load for WASM init

let loadPromise = null

export function loadOpenCV() {
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    // Already fully loaded?
    if (typeof window !== 'undefined' && window.cv && window.cv.Mat) {
      return window.cv
    }

    let lastError = null
    for (const url of CDN_URLS) {
      try {
        await injectScript(url)
        const cv = await waitForRuntime()
        return cv
      } catch (err) {
        console.warn(`[opencvLoader] ${url} failed:`, err?.message || err)
        lastError = err
        // Clean up the failed script tag so the next attempt has a clean slate
        cleanupOpenCVGlobals()
      }
    }

    // All attempts failed — clear cache so a retry is possible
    loadPromise = null
    throw new Error(
      `Couldn't download OpenCV from any source. Check your connection and try again. (${lastError?.message || 'unknown error'})`,
    )
  })()

  return loadPromise
}

/** Manually reset the cache (for retry buttons in the UI). */
export function resetOpenCVLoader() {
  loadPromise = null
  cleanupOpenCVGlobals()
}

/** Returns true if OpenCV is fully ready right now. */
export function isOpenCVReady() {
  return typeof window !== 'undefined' && !!window.cv && !!window.cv.Mat
}

/* -------------------------------------------------------------------------- */
/*  Internals                                                                 */
/* -------------------------------------------------------------------------- */

function injectScript(url) {
  return new Promise((resolve, reject) => {
    // If a script with this URL is already in the page (from a prior attempt
    // that we failed to clean up), reuse it.
    const existing = document.querySelector(`script[data-opencv-loader="${url}"]`)
    if (existing) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.crossOrigin = 'anonymous'
    script.dataset.opencvLoader = url

    let timeoutId = null
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId)
      script.onload = null
      script.onerror = null
    }

    script.onload = () => {
      cleanup()
      resolve()
    }
    script.onerror = () => {
      cleanup()
      script.remove()
      reject(new Error('Network error'))
    }
    timeoutId = setTimeout(() => {
      cleanup()
      script.remove()
      reject(new Error(`Timed out after ${SCRIPT_TIMEOUT_MS / 1000}s`))
    }, SCRIPT_TIMEOUT_MS)

    document.head.appendChild(script)
  })
}

/**
 * Wait for the OpenCV WASM runtime to finish initializing. The script tag
 * load only means the JS file is parsed — the WASM module loads asynchronously
 * inside it. Several patterns exist depending on build version:
 *   - window.cv exposes `Mat` directly   → ready
 *   - window.cv is a Promise              → await it
 *   - window.cv has `onRuntimeInitialized`→ assign callback
 */
function waitForRuntime() {
  return new Promise((resolve, reject) => {
    const start = Date.now()

    const check = () => {
      const cv = typeof window !== 'undefined' ? window.cv : null

      if (cv && cv.Mat) {
        resolve(cv)
        return
      }

      // Some builds expose `cv` as a Promise<cv>
      if (cv && typeof cv.then === 'function') {
        cv.then((resolved) => {
          window.cv = resolved
          resolve(resolved)
        }).catch(reject)
        return
      }

      // Standard pattern: assign onRuntimeInitialized once `cv` exists
      if (cv && typeof cv === 'object') {
        cv.onRuntimeInitialized = () => {
          if (window.cv && window.cv.Mat) resolve(window.cv)
          else reject(new Error('Runtime initialized but cv.Mat is missing'))
        }
        return
      }

      // `cv` not yet assigned — poll for a brief window
      if (Date.now() - start > RUNTIME_TIMEOUT_MS) {
        reject(new Error('Runtime did not appear in time'))
        return
      }
      setTimeout(check, 100)
    }

    check()
  })
}

/** Tear down a partial OpenCV load so the next attempt has a clean state. */
function cleanupOpenCVGlobals() {
  if (typeof window === 'undefined') return
  try {
    delete window.cv
  } catch {
    window.cv = undefined
  }
  // Remove any orphaned script tags from prior attempts
  document.querySelectorAll('script[data-opencv-loader]').forEach((el) => el.remove())
}
