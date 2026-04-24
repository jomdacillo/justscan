import { useEffect, useRef, useState } from 'react'
import Button from './Button'
import SegmentedControl from './SegmentedControl'
import {
  IconChevronLeft,
  IconDownload,
  IconShare,
  IconRetake,
  IconPalette,
  IconContrast,
  IconCheck,
} from './Icons'
import {
  processDocument,
  canvasToBlob,
  downloadBlob,
  timestampForFilename,
} from '../utils/imageProcessing'
import { haptics } from '../utils/haptics'
import './PreviewScreen.css'

export default function PreviewScreen({ sourceImage, initialMode, onBack, onRetake }) {
  const [mode, setMode] = useState(initialMode)
  const [isProcessing, setIsProcessing] = useState(true)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [toast, setToast] = useState(null) // { kind: 'success' | 'error', message }
  const canvasRef = useRef(null)
  const lastUrlRef = useRef(null)

  // Re-process whenever mode (or source) changes
  useEffect(() => {
    let cancelled = false
    setIsProcessing(true)

    // Defer to next frame so the spinner shows
    const id = requestAnimationFrame(() => {
      try {
        const canvas = processDocument(sourceImage, mode)
        if (cancelled) return
        canvasRef.current = canvas
        const url = canvas.toDataURL('image/jpeg', 0.92)
        // revoke previous url if it was an object URL (it's a data URL here, but be safe)
        if (lastUrlRef.current && lastUrlRef.current.startsWith('blob:')) {
          URL.revokeObjectURL(lastUrlRef.current)
        }
        lastUrlRef.current = url
        setPreviewUrl(url)
      } catch (err) {
        console.error(err)
        setToast({ kind: 'error', message: 'Could not process this image.' })
      } finally {
        if (!cancelled) setIsProcessing(false)
      }
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [sourceImage, mode])

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(t)
  }, [toast])

  const handleSave = async () => {
    if (!canvasRef.current) return
    haptics.medium()
    try {
      const blob = await canvasToBlob(canvasRef.current, 'image/jpeg', 0.92)
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
    if (!canvasRef.current) return
    haptics.light()
    try {
      const blob = await canvasToBlob(canvasRef.current, 'image/jpeg', 0.92)
      if (!blob) throw new Error('Could not prepare file.')
      const filename = `JustScan-${timestampForFilename()}.jpg`
      const file = new File([blob], filename, { type: 'image/jpeg' })

      // Prefer Web Share API with files
      if (
        typeof navigator !== 'undefined' &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: 'JustScan',
          text: 'Scanned with JustScan',
        })
        haptics.success()
        return
      }

      // Fallback: trigger download
      downloadBlob(blob, filename)
      setToast({ kind: 'success', message: 'Saved to your device.' })
    } catch (err) {
      // user cancelled share dialog -> AbortError, treat silently
      if (err?.name !== 'AbortError') {
        console.error(err)
        setToast({ kind: 'error', message: 'Could not share the file.' })
      }
    }
  }

  return (
    <div className="prev">
      {/* Top bar — back, title, no destructive controls here */}
      <header className="prev__topbar">
        <button
          type="button"
          className="prev__back"
          onClick={() => { haptics.light(); onBack() }}
        >
          <IconChevronLeft size={22} />
          <span>Back</span>
        </button>
        <h1 className="prev__title">Scan Preview</h1>
        <div className="prev__topbar-spacer" />
      </header>

      <main className="prev__main">
        {/* Image stage */}
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

        {/* Style toggle */}
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

      {/* Bottom action area */}
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
            onClick={() => { haptics.light(); onRetake() }}
          >
            Retake
          </Button>
        </div>
      </footer>

      {/* Toast — polite live region */}
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
