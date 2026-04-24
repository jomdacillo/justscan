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
  IconCamera,
} from './Icons'
import {
  processDocument,
  canvasToBlob,
  downloadBlob,
  timestampForFilename,
} from '../utils/imageProcessing'
import {
  warpDocument,
  defaultCorners,
  orderCorners,
} from '../utils/perspectiveWarp'
import { haptics } from '../utils/haptics'
import './PreviewScreen.css'

/**
 * Two-stage flow:
 *   STAGE 'edit'    — user drags 4 corners to the page edges.
 *   STAGE 'review'  — warped + styled output; pick color/B&W, save or share.
 *
 * No auto-detection — every scan is manually framed. The default quad is
 * a 90% inset box, so the user only needs to drag corners outward to
 * the actual page edges.
 */
export default function PreviewScreen({
  sourceImage,
  initialMode,
  onBack,
  onRetake,
  onNewScan,
}) {
  const [stage, setStage] = useState('edit')
  const [corners, setCorners] = useState(() => {
    const w = sourceImage?.naturalWidth || 0
    const h = sourceImage?.naturalHeight || 0
    if (!w || !h) return null
    const inset = Math.round(Math.min(w, h) * 0.05)
    return defaultCorners(w, h, inset)
  })
  const [mode, setMode] = useState(initialMode)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [toast, setToast] = useState(null)
  const [showOriginal, setShowOriginal] = useState(false)

  const warpedCanvasRef = useRef(null) // flattened (pre-style) canvas
  const finalCanvasRef = useRef(null)  // styled (final) canvas

  /* ---------------------------------------------------------------------- */
  /*  Stage 1 actions                                                        */
  /* ---------------------------------------------------------------------- */

  const handleResetCorners = () => {
    haptics.light()
    const w = sourceImage.naturalWidth
    const h = sourceImage.naturalHeight
    const inset = Math.round(Math.min(w, h) * 0.05)
    setCorners(defaultCorners(w, h, inset))
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

    await new Promise(requestAnimationFrame)
    try {
      const warped = await warpDocument(sourceImage, corners)
      warpedCanvasRef.current = warped
      const styled = processDocument(warped, mode)
      finalCanvasRef.current = styled
      setPreviewUrl(styled.toDataURL('image/jpeg', 0.92))
    } catch (err) {
      console.error('Processing failed:', err)
      haptics.error()
      setToast({
        kind: 'error',
        message: err?.message ? `Couldn't process: ${err.message}` : 'Could not process the document.',
      })
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
              {corners && (
                <CornerEditor
                  sourceImage={sourceImage}
                  corners={corners}
                  onCornersChange={setCorners}
                />
              )}
            </div>

            <p className="prev__hint">
              <IconSparkle size={14} aria-hidden="true" />
              <span>Drag each corner to the edges of your document.</span>
            </p>

            <div className="prev__edit-quick">
              <Button variant="bordered" size="sm" onClick={handleResetCorners}>
                Reset
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
              disabled={!corners}
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
                  src={showOriginal ? sourceImage.src : previewUrl}
                  alt={
                    showOriginal
                      ? 'Original photo before scanning'
                      : `Scanned document, ${mode === 'bw' ? 'black and white' : 'color'} mode`
                  }
                  className={`prev__image ${isProcessing ? 'prev__image--busy' : ''}`}
                  draggable={false}
                />
              )}
              {showOriginal && (
                <div className="prev__compare-badge" aria-hidden="true">
                  Original
                </div>
              )}
              {isProcessing && (
                <div className="prev__busy" role="status" aria-live="polite">
                  <div className="prev__busy-spinner" aria-hidden="true" />
                  <span>Processing…</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className="prev__compare-btn"
              onPointerDown={() => { haptics.selection(); setShowOriginal(true) }}
              onPointerUp={() => setShowOriginal(false)}
              onPointerLeave={() => setShowOriginal(false)}
              onPointerCancel={() => setShowOriginal(false)}
              aria-label="Press and hold to compare with original"
            >
              Hold to compare with original
            </button>

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
            <Button
              variant="plain"
              size="md"
              fullWidth
              startIcon={<IconCamera size={18} />}
              onClick={() => { haptics.medium(); onNewScan?.() }}
            >
              New Scan
            </Button>
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
