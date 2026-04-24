import { useEffect, useState } from 'react'
import { useCamera } from '../hooks/useCamera'
import { IconClose, IconSwap, IconCamera } from './Icons'
import Button from './Button'
import { haptics } from '../utils/haptics'
import './CameraScreen.css'

export default function CameraScreen({ onCancel, onCaptured }) {
  const { videoRef, status, errorMessage, start, stop, capture } = useCamera()
  const [facing, setFacing] = useState('environment')
  const [isCapturing, setIsCapturing] = useState(false)
  const [flashFlash, setFlashFlash] = useState(false) // brief white flash on shutter

  // Start the camera on mount, restart when facing changes
  useEffect(() => {
    start(facing)
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing])

  const handleCapture = async () => {
    if (status !== 'streaming' || isCapturing) return
    setIsCapturing(true)
    haptics.heavy()
    setFlashFlash(true)
    setTimeout(() => setFlashFlash(false), 140)
    try {
      const img = await capture()
      onCaptured(img)
    } catch (err) {
      // surface error to user via the screen's error state
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
      {/* Video viewport */}
      <div className="cam__viewport">
        <video
          ref={videoRef}
          className="cam__video"
          playsInline
          muted
          autoPlay
        />

        {/* Document framing guide */}
        {status === 'streaming' && (
          <div className="cam__guide" aria-hidden="true">
            <span className="cam__corner cam__corner--tl" />
            <span className="cam__corner cam__corner--tr" />
            <span className="cam__corner cam__corner--bl" />
            <span className="cam__corner cam__corner--br" />
          </div>
        )}

        {/* Shutter flash */}
        <div className={`cam__flash ${flashFlash ? 'cam__flash--on' : ''}`} aria-hidden="true" />

        {/* Status overlays */}
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

      {/* Top bar: cancel + swap camera */}
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
          <span>Position document inside the frame</span>
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

      {/* Bottom controls — large shutter in the thumb zone */}
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
