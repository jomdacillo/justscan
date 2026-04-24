/**
 * OpenCV.js loader — local-first, with CDN fallbacks.
 *
 * In development and production, /opencv.js is served from the same origin
 * as the rest of the app (the file is copied from @techstark/opencv-js into
 * the public/ folder by scripts/copy-opencv.js at install/build time).
 *
 * Local-first means:
 *   - No CORS issues
 *   - No third-party uptime dependency
 *   - No CSP friction
 *   - Cloudflare Pages serves it from their global edge for free
 *   - First load downloads ~10 MB; every subsequent load is instant (browser cache)
 *
 * If the local file is somehow missing (build script didn't run, host
 * misconfigured), we fall back to npm CDNs.
 *
 * Failures don't poison the cache — `loadPromise` is reset on rejection so
 * retry buttons work without a page reload.
 */

const SOURCES = [
  '/opencv.js', // bundled with the app (same origin)
  'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js',
  'https://unpkg.com/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js',
]

const SCRIPT_TIMEOUT_MS = 12_000  // per-source timeout for the script tag itself
const RUNTIME_TIMEOUT_MS = 12_000 // and for the WASM runtime to come up after

let loadPromise = null

export function loadOpenCV() {
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    if (typeof window !== 'undefined' && window.cv && window.cv.Mat) {
      return window.cv
    }

    let lastError = null
    for (const url of SOURCES) {
      try {
        await injectScript(url)
        const cv = await waitForRuntime()
        return cv
      } catch (err) {
        console.warn(`[opencvLoader] ${url} failed:`, err?.message || err)
        lastError = err
        cleanupOpenCVGlobals()
      }
    }

    loadPromise = null
    const detail = lastError?.message ? ` (${lastError.message})` : ''
    throw new Error(`Couldn't load detection engine${detail}`)
  })()

  return loadPromise
}

/** Reset the cached promise so a retry actually retries. */
export function resetOpenCVLoader() {
  loadPromise = null
  cleanupOpenCVGlobals()
}

export function isOpenCVReady() {
  return typeof window !== 'undefined' && !!window.cv && !!window.cv.Mat
}

/* -------------------------------------------------------------------------- */

function injectScript(url) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-opencv-loader="${url}"]`)
    if (existing) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = url
    script.async = true
    // Only request CORS for cross-origin URLs; same-origin doesn't need it
    if (url.startsWith('http')) script.crossOrigin = 'anonymous'
    script.dataset.opencvLoader = url

    let timeoutId = null
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId)
      script.onload = null
      script.onerror = null
    }

    script.onload = () => { cleanup(); resolve() }
    script.onerror = () => {
      cleanup()
      script.remove()
      reject(new Error('Network error or 404'))
    }
    timeoutId = setTimeout(() => {
      cleanup()
      script.remove()
      reject(new Error(`Timed out after ${SCRIPT_TIMEOUT_MS / 1000}s`))
    }, SCRIPT_TIMEOUT_MS)

    document.head.appendChild(script)
  })
}

function waitForRuntime() {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      const cv = typeof window !== 'undefined' ? window.cv : null

      if (cv && cv.Mat) {
        resolve(cv)
        return
      }
      if (cv && typeof cv.then === 'function') {
        cv.then((resolved) => {
          window.cv = resolved
          resolve(resolved)
        }).catch(reject)
        return
      }
      if (cv && typeof cv === 'object') {
        cv.onRuntimeInitialized = () => {
          if (window.cv && window.cv.Mat) resolve(window.cv)
          else reject(new Error('Runtime initialized but cv.Mat missing'))
        }
        return
      }

      if (Date.now() - start > RUNTIME_TIMEOUT_MS) {
        reject(new Error('Runtime did not appear in time'))
        return
      }
      setTimeout(check, 100)
    }
    check()
  })
}

function cleanupOpenCVGlobals() {
  if (typeof window === 'undefined') return
  try { delete window.cv } catch { window.cv = undefined }
  document.querySelectorAll('script[data-opencv-loader]').forEach((el) => el.remove())
}
