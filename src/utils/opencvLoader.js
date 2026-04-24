/**
 * OpenCV.js loader.
 *
 * OpenCV.js is large (~8MB). We load it on-demand the first time
 * something needs it, then cache the resolved promise so subsequent
 * callers get the same instance instantly.
 *
 * The library exposes itself globally as `window.cv`. We resolve once
 * its `onRuntimeInitialized` fires (or immediately if it's already ready).
 */

const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js'

let loadPromise = null

export function loadOpenCV(onProgress) {
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    // Already loaded?
    if (typeof window !== 'undefined' && window.cv && window.cv.Mat) {
      resolve(window.cv)
      return
    }

    // Already loaded but still initializing the WASM runtime?
    if (typeof window !== 'undefined' && window.cv && !window.cv.Mat) {
      window.cv.onRuntimeInitialized = () => resolve(window.cv)
      return
    }

    const script = document.createElement('script')
    script.src = OPENCV_URL
    script.async = true
    script.onload = () => {
      // window.cv is set, but the WASM runtime may not be ready yet.
      const checkReady = () => {
        if (window.cv && window.cv.Mat) {
          resolve(window.cv)
        } else if (window.cv && typeof window.cv.then === 'function') {
          // Newer builds expose `cv` as a promise-like
          window.cv.then((cv) => {
            window.cv = cv
            resolve(cv)
          })
        } else if (window.cv) {
          window.cv.onRuntimeInitialized = () => resolve(window.cv)
        } else {
          reject(new Error('OpenCV failed to initialize.'))
        }
      }
      checkReady()
    }
    script.onerror = () => {
      loadPromise = null // allow retry
      reject(new Error('Could not download OpenCV.'))
    }

    if (onProgress) onProgress('downloading')
    document.head.appendChild(script)
  })

  return loadPromise
}

/** Returns true if OpenCV is fully ready right now. */
export function isOpenCVReady() {
  return typeof window !== 'undefined' && !!window.cv && !!window.cv.Mat
}
