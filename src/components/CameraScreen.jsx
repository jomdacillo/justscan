import { useEffect, useRef, useState } from 'react'
import { useCamera } from '../hooks/useCamera'
import { IconClose, IconSwap, IconCamera } from './Icons'
import Button from './Button'
import { haptics } from '../utils/haptics'
import { loadOpenCV, isOpenCVReady } from '../utils/opencvLoader'
import { detectDocument } from '../utils/documentDetection'
import './CameraScreen.css'

/**
 * Run live document detection on the video stream at ~3 fps,
 * drawing the detected quad on a transparent overlay canvas.
 */
function useLiveDetection(videoRef, overlayRef, status) {
  const detectionRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    if (status !== 'streaming') return

    let cancelled = false
    let lastRun = 0
    const INTERVAL = 333 // ms between detections

    const tick = (ts) => {
      if (cancelled) return
      rafRef.current = requestAnimationFrame(tick)

      const video = videoRef.current
      const overlay = overlayRef.current
      if (!video || !overlay || !isOpenCVReady() || video.readyState < 2) return

      // Always size the overlay to match the video's display rect
      const rect = video.getBoundingClientRect()
      if (overlay.width !== rect.width || overlay.height !== rect.height) {
        overlay.width = rect.width
        overlay.height = rect.height
      }

      // Throttle the actual detection
      if (ts - lastRun < INTERVAL) {
        // Still draw the cached detection so the overlay doesn't flicker
        drawOverlay(overlay, detectionRef.current, video)
        return
      }
      lastRun = ts

      try {
        const result = detectDocument(window.cv, video)
        detectionRef.current = result
        drawOverlay(overlay, result, video)
      } catch {
        // ignore transient errors
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [status, videoRef, overlayRef])

  return detectionRef
}

/**
 * Map source-coordinate corners onto the overlay canvas accounting for
 * the video's `object-fit: cover` cropping.
 */
function drawOverlay(canvas, detection, video) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (!detection || !detection.corners) return

  const vw = video.videoWidth
  const vh = video.videoHeight
  const cw = canvas.width
  const ch = canvas.height

  // object-fit: cover math
  const videoRatio = vw / vh
  const canvasRatio = cw / ch
  let drawW, drawH, offsetX, offsetY
  if (videoRatio > canvasRatio) {
    drawH = ch
    drawW = ch * videoRatio
    offsetX = (cw - drawW) / 2
    offsetY = 0
  } else {
    drawW = cw
    drawH = cw / videoRatio
    offsetX = 0
    offsetY = (ch - drawH) / 2
  }
  const sx = drawW / vw
  const sy = drawH / vh

  const pts = detection.corners.map((p) => ({
    x: p.x * sx + offsetX,
    y: p.y * sy + offsetY,
  }))

  // Filled translucent quad
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
  ctx.fillStyle = 'rgba(48, 209, 88, 0.18)'
  ctx.fill()

  // Outline
  ctx.lineWidth = 3
  ctx.strokeStyle = '#30D158'
  ctx.lineJoin = 'round'
  ctx.stroke()

  // Corner dots
  ctx.fillStyle = '#FFFFFF'
  ctx.strokeStyle = '#30D158'
  ctx.lineWidth = 2.5
  for (const p of pts) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
}

export default function CameraScreen({ onCancel, onCaptured }) {
  const { videoRef, status, errorMessage, start, stop, capture } = useCamera()
  const overlayRef = useRef(null)
  const [facing, setFacing] = useState('environment')
  const [isCapturing, setIsCapturing] = useState(false)
  const [flashFlash, setFlashFlash] = useState(false)
  const [cvReady, setCvReady] = useState(isOpenCVReady())

  // Lazy-load OpenCV when camera mounts
  useEffect(() => {
    let cancelled = false
    loadOpenCV()
      .then(() => { if (!cancelled) setCvReady(true) })
      .catch((err) => {
        // Non-fatal — capture still works, just no live detection
        console.warn('OpenCV failed to load', err)
      })
    return () => { cancelled = true }
  }, [])

  // Start camera; restart on facing change
  useEffect(() => {
    start(facing)
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing])

  const detectionRef = useLiveDetection(videoRef, overlayRef, status)

  const handleCapture = async () => {
    if (status !== 'streaming' || isCapturing) return
    setIsCapturing(true)
    haptics.heavy()
    setFlashFlash(true)
    setTimeout(() => setFlashFlash(false), 140)
    try {
      const img = await capture()
      // Pass along the latest detection (if any) so PreviewScreen can pre-fill corners
      const detection = detectionRef.current
      onCaptured(img, detection?.corners || null)
    } catch (err) {
      console.error(err)
    } finally {
      setIsCapturing(false)
    }
  }

  const handleSwap = () => {
    haptics.selection()
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'))
  }

  return (
    <div className="cam">
      <div className="cam__viewport">
        <video
          ref={videoRef}
          className="cam__video"
          playsInline
          muted
          autoPlay
        />

        {/* Live edge-detection overlay */}
        <canvas
          ref={overlayRef}
          className="cam__overlay-canvas"
          aria-hidden="true"
        />

        <div className={`cam__flash ${flashFlash ? 'cam__flash--on' : ''}`} aria-hidden="true" />

        {status === 'requesting' && (
          <div className="cam__overlay" role="status" aria-live="polite">
            <div className="cam__spinner" aria-hidden="true" />
            <p>Starting camera…</p>
          </div>
        )}

        {(status === 'denied' || status === 'error' || status === 'unsupported') && (
          <div className="cam__overlay cam__overlay--error" role="alert">
            <p className="cam__overlay-title">Can't access the camera</p>
            <p className="cam__overlay-msg">{errorMessage}</p>
            <Button variant="bordered" size="md" onClick={() => start(facing)}>
              Try Again
            </Button>
          </div>
        )}
      </div>

      <header className="cam__topbar">
        <button
          type="button"
          className="cam__round-btn"
          onClick={() => { haptics.light(); onCancel() }}
          aria-label="Close camera"
        >
          <IconClose size={22} />
        </button>
        <div className="cam__topbar-title">
          <IconCamera size={16} aria-hidden="true" />
          <span>{cvReady ? 'Hold steady — auto-detecting' : 'Position document inside the frame'}</span>
        </div>
        <button
          type="button"
          className="cam__round-btn"
          onClick={handleSwap}
          aria-label="Switch camera"
          disabled={status !== 'streaming'}
        >
          <IconSwap size={20} />
        </button>
      </header>

      <footer className="cam__controls">
        <button
          type="button"
          className="cam__shutter"
          onClick={handleCapture}
          disabled={status !== 'streaming' || isCapturing}
          aria-label="Capture document"
        >
          <span className="cam__shutter-inner" />
        </button>
      </footer>
    </div>
  )
}
