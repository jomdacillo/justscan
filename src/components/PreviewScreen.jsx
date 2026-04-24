import { useEffect, useRef, useState } from 'react'
import Button from './Button'
import SegmentedControl from './SegmentedControl'
import CornerEditor from './CornerEditor'
import {
  IconChevronLeft,
  IconDownload,
  IconShare,
  IconRetake,
  IconPalette,
  IconContrast,
  IconCheck,
  IconSparkle,
} from './Icons'
import {
  processDocument,
  canvasToBlob,
  downloadBlob,
  timestampForFilename,
} from '../utils/imageProcessing'
import {
  detectDocument,
  warpDocument,
  defaultCorners,
  orderCorners,
} from '../utils/documentDetection'
import { loadOpenCV, resetOpenCVLoader } from '../utils/opencvLoader'
import { haptics } from '../utils/haptics'
import './PreviewScreen.css'

/**
 * Two-stage flow:
 *   STAGE 'edit'    — show captured image with draggable corner handles.
 *                     User confirms boundaries, then we warp.
 *   STAGE 'review'  — show flattened + style-processed result. User picks
 *                     color/B&W and saves or shares.
 */
export default function PreviewScreen({
  sourceImage,
  initialCorners,
  initialMode,
  onBack,
  onRetake,
}) {
  const [stage, setStage] = useState('edit')
  const [corners, setCorners] = useState(() => {
    // Start with a sensible default IMMEDIATELY so the user sees their photo
    // the instant they land on this screen. Detection runs in the background
    // and updates corners when it finishes.
    const w = sourceImage?.naturalWidth || 0
    const h = sourceImage?.naturalHeight || 0
    if (!w || !h) return null
    const inset = Math.round(Math.min(w, h) * 0.05)
    // If the camera already ran live detection, use that as the starting point
    if (initialCorners && initialCorners.length === 4) {
      return orderCorners(initialCorners)
    }
    return defaultCorners(w, h, inset)
  })
  const [mode, setMode] = useState(initialMode)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDetecting, setIsDetecting] = useState(true)
  const [cvLoadError, setCvLoadError] = useState(null)
  const [retryToken, setRetryToken] = useState(0)
  const [toast, setToast] = useState(null)

  const warpedCanvasRef = useRef(null) // flattened (pre-style) canvas
  const finalCanvasRef = useRef(null)  // styled (final) canvas

  /* ---------------------------------------------------------------------- */
  /*  Background auto-detection (non-blocking)                                */
  /*                                                                          */
  /*  The user can already see their photo and the default quad. This effect  */
  /*  just refines the corners if OpenCV finds a better fit. If OpenCV fails  */
  /*  to load or detection finds nothing, the defaults stay.                  */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false
    setIsDetecting(true)
    setCvLoadError(null)

    ;(async () => {
      let cv
      try {
        cv = await loadOpenCV()
      } catch (err) {
        if (cancelled) return
        console.error('OpenCV load failed:', err)
        setCvLoadError(err?.message || 'Could not load detection engine.')
        setIsDetecting(false)
        return
      }

      if (cancelled) return

      // Yield to the main thread so the UI paints before we start the
      // CPU-heavy detection pass.
      await new Promise((r) => setTimeout(r, 0))
      if (cancelled) return

      try {
        const result = detectDocument(cv, sourceImage)
        if (!cancelled && result?.corners) {
          setCorners(orderCorners(result.corners))
        }
      } catch (e) {
        console.warn('Detection failed, keeping default corners:', e)
      }

      if (!cancelled) setIsDetecting(false)
    })()

    return () => { cancelled = true }
  }, [sourceImage, retryToken])

  /** Try loading OpenCV again (called from the retry button). */
  const handleRetryCV = () => {
    haptics.light()
    resetOpenCVLoader()
    setRetryToken((t) => t + 1)
  }

  /* ---------------------------------------------------------------------- */
  /*  Stage 1 actions                                                        */
  /* ---------------------------------------------------------------------- */

  const handleAutoDetect = async () => {
    haptics.light()
    try {
      const cv = await loadOpenCV()
      const result = detectDocument(cv, sourceImage)
      if (result?.corners) {
        setCorners(orderCorners(result.corners))
        haptics.success()
        setToast({ kind: 'success', message: 'Document detected.' })
      } else {
        haptics.warning()
        setToast({ kind: 'error', message: "Couldn't find a document edge." })
      }
    } catch (err) {
      haptics.error()
      setToast({ kind: 'error', message: 'Detection engine not loaded.' })
    }
  }

  const handleUseFullImage = () => {
    haptics.light()
    setCorners(defaultCorners(sourceImage.naturalWidth, sourceImage.naturalHeight, 0))
  }

  const handleConfirmCorners = async () => {
    if (!corners) return
    haptics.medium()
    setIsProcessing(true)
    setStage('review')

    // Defer to next frame so the stage swap renders the spinner first
    await new Promise(requestAnimationFrame)
    try {
      const cv = await loadOpenCV()
      const warped = warpDocument(cv, sourceImage, corners)
      warpedCanvasRef.current = warped
      // Apply current style
      const styled = processDocument(warped, mode)
      finalCanvasRef.current = styled
      setPreviewUrl(styled.toDataURL('image/jpeg', 0.92))
    } catch (err) {
      console.error('Confirm corners failed:', err)
      haptics.error()
      const message = err?.message
        ? `Couldn't process: ${err.message}`
        : 'Could not process the document.'
      setToast({ kind: 'error', message })
      setStage('edit')
    } finally {
      setIsProcessing(false)
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  Stage 2 — Re-style on mode change                                      */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    if (stage !== 'review' || !warpedCanvasRef.current) return
    let cancelled = false
    setIsProcessing(true)
    const id = requestAnimationFrame(() => {
      try {
        const styled = processDocument(warpedCanvasRef.current, mode)
        if (cancelled) return
        finalCanvasRef.current = styled
        setPreviewUrl(styled.toDataURL('image/jpeg', 0.92))
      } catch (err) {
        console.error(err)
      } finally {
        if (!cancelled) setIsProcessing(false)
      }
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  /* Auto-dismiss toast */
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(t)
  }, [toast])

  /* ---------------------------------------------------------------------- */
  /*  Stage 2 actions                                                        */
  /* ---------------------------------------------------------------------- */

  const handleSave = async () => {
    const canvas = finalCanvasRef.current
    if (!canvas) return
    haptics.medium()
    try {
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92)
      if (!blob) throw new Error('Could not create file.')
      const filename = `JustScan-${timestampForFilename()}.jpg`
      downloadBlob(blob, filename)
      haptics.success()
      setToast({ kind: 'success', message: 'Saved to your device.' })
    } catch (err) {
      console.error(err)
      haptics.error()
      setToast({ kind: 'error', message: 'Could not save the file.' })
    }
  }

  const handleShare = async () => {
    const canvas = finalCanvasRef.current
    if (!canvas) return
    haptics.light()
    try {
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92)
      if (!blob) throw new Error('Could not prepare file.')
      const filename = `JustScan-${timestampForFilename()}.jpg`
      const file = new File([blob], filename, { type: 'image/jpeg' })

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'JustScan', text: 'Scanned with JustScan' })
        haptics.success()
        return
      }
      downloadBlob(blob, filename)
      setToast({ kind: 'success', message: 'Saved to your device.' })
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error(err)
        setToast({ kind: 'error', message: 'Could not share the file.' })
      }
    }
  }

  const handleEditAgain = () => {
    haptics.light()
    setStage('edit')
  }

  /* ---------------------------------------------------------------------- */
  /*  Render                                                                 */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="prev">
      <header className="prev__topbar">
        <button
          type="button"
          className="prev__back"
          onClick={() => {
            haptics.light()
            if (stage === 'review') setStage('edit')
            else onBack()
          }}
        >
          <IconChevronLeft size={22} />
          <span>{stage === 'review' ? 'Edit' : 'Back'}</span>
        </button>
        <h1 className="prev__title">
          {stage === 'edit' ? 'Adjust Edges' : 'Scan Preview'}
        </h1>
        <div className="prev__topbar-spacer" />
      </header>

      {stage === 'edit' && (
        <>
          <main className="prev__main prev__main--edit">
            <div className="prev__editor">
              {corners ? (
                <CornerEditor
                  sourceImage={sourceImage}
                  corners={corners}
                  onCornersChange={setCorners}
                />
              ) : (
                <div className="prev__busy" role="status" aria-live="polite">
                  <div className="prev__busy-spinner" aria-hidden="true" />
                  <span>Loading photo…</span>
                </div>
              )}
              {isDetecting && corners && (
                <div className="prev__detect-badge" role="status" aria-live="polite">
                  <div className="prev__detect-badge-spinner" aria-hidden="true" />
                  <span>Detecting edges…</span>
                </div>
              )}
            </div>

            {cvLoadError ? (
              <div className="prev__cv-error" role="alert">
                <p className="prev__cv-error-title">Auto-detection unavailable</p>
                <p className="prev__cv-error-msg">{cvLoadError}</p>
                <p className="prev__cv-error-msg">
                  You can still drag the corners manually and continue.
                </p>
                <Button variant="bordered" size="sm" onClick={handleRetryCV}>
                  Retry
                </Button>
              </div>
            ) : (
              <p className="prev__hint">
                <IconSparkle size={14} aria-hidden="true" />
                <span>Drag any corner to fit the page edges.</span>
              </p>
            )}

            <div className="prev__edit-quick">
              <Button
                variant="bordered"
                size="sm"
                onClick={handleAutoDetect}
                disabled={!!cvLoadError || isDetecting}
              >
                Auto-detect
              </Button>
              <Button variant="plain" size="sm" onClick={handleUseFullImage}>
                Use whole image
              </Button>
            </div>
          </main>

          <footer className="prev__actions">
            <Button
              variant="prominent"
              size="lg"
              fullWidth
              onClick={handleConfirmCorners}
              disabled={!corners || isDetecting}
            >
              Continue
            </Button>
            <Button
              variant="bordered"
              size="md"
              fullWidth
              startIcon={<IconRetake size={18} />}
              onClick={() => { haptics.light(); onRetake() }}
            >
              Retake Photo
            </Button>
          </footer>
        </>
      )}

      {stage === 'review' && (
        <>
          <main className="prev__main">
            <div className="prev__stage" aria-live="polite">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt={`Scanned document, ${mode === 'bw' ? 'black and white' : 'color'} mode`}
                  className={`prev__image ${isProcessing ? 'prev__image--busy' : ''}`}
                  draggable={false}
                />
              )}
              {isProcessing && (
                <div className="prev__busy" role="status" aria-live="polite">
                  <div className="prev__busy-spinner" aria-hidden="true" />
                  <span>Processing…</span>
                </div>
              )}
            </div>

            <div className="prev__controls">
              <SegmentedControl
                label="Output Style"
                value={mode}
                onChange={(v) => { haptics.selection(); setMode(v) }}
                options={[
                  { value: 'color', label: 'Color',         icon: <IconPalette size={16} /> },
                  { value: 'bw',    label: 'Black & White', icon: <IconContrast size={16} /> },
                ]}
              />
            </div>
          </main>

          <footer className="prev__actions">
            <Button
              variant="prominent"
              size="lg"
              fullWidth
              startIcon={<IconDownload size={20} />}
              onClick={handleSave}
              disabled={isProcessing}
            >
              Save
            </Button>
            <div className="prev__actions-row">
              <Button
                variant="bordered"
                size="md"
                fullWidth
                startIcon={<IconShare size={18} />}
                onClick={handleShare}
                disabled={isProcessing}
              >
                Share
              </Button>
              <Button
                variant="bordered"
                size="md"
                fullWidth
                startIcon={<IconRetake size={18} />}
                onClick={handleEditAgain}
              >
                Edit Edges
              </Button>
            </div>
          </footer>
        </>
      )}

      {toast && (
        <div
          className={`prev__toast prev__toast--${toast.kind}`}
          role="status"
          aria-live="polite"
        >
          {toast.kind === 'success' && <IconCheck size={18} aria-hidden="true" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  )
}
