import { useEffect, useRef } from 'react'
import { IconClose, IconAperture, IconSparkle, IconContrast, IconPalette } from './Icons'
import { haptics } from '../utils/haptics'
import './AboutSheet.css'

/**
 * Modal sheet — accessible dialog with focus trap and Esc to dismiss.
 */
export default function AboutSheet({ open, onClose }) {
  const sheetRef = useRef(null)
  const closeBtnRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    if (!open) return

    previousFocusRef.current = document.activeElement
    closeBtnRef.current?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'Tab') {
        // Focus trap
        const focusables = sheetRef.current?.querySelectorAll(
          'button, [href], input, [tabindex]:not([tabindex="-1"])'
        )
        if (!focusables || focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)

    // Lock body scroll while open
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previousFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="about-backdrop"
      onClick={() => { haptics.light(); onClose() }}
      role="presentation"
    >
      <div
        ref={sheetRef}
        className="about-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="about-grabber" aria-hidden="true" />

        <header className="about-header">
          <div className="about-header-spacer" />
          <h2 id="about-title" className="about-title">About</h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="about-close"
            onClick={() => { haptics.light(); onClose() }}
            aria-label="Close"
          >
            <IconClose size={20} />
          </button>
        </header>

        <div className="about-body">
          <div className="about-mark">
            <IconAperture size={36} />
          </div>
          <h3 className="about-name">JustScan</h3>
          <p className="about-tagline">A portable CamScanner.<br />No fuss, just scan.</p>

          <div className="about-features">
            <Feature
              icon={<IconSparkle size={18} />}
              title="On-device processing"
              text="Your documents never leave your phone. Everything happens locally in the browser."
            />
            <Feature
              icon={<IconPalette size={18} />}
              title="Color enhance"
              text="Auto white balance and contrast lift make documents look crisp and bright."
            />
            <Feature
              icon={<IconContrast size={18} />}
              title="Black & white"
              text="Adaptive thresholding produces sharp, photocopier-style output ideal for text."
            />
          </div>

          <div className="about-credit">
            <p className="about-credit-text">
              Created by <strong>Joe Dacillo</strong>
            </p>
            <p className="about-credit-version">Version 1.0</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Feature({ icon, title, text }) {
  return (
    <div className="about-feature">
      <div className="about-feature__icon" aria-hidden="true">{icon}</div>
      <div className="about-feature__body">
        <p className="about-feature__title">{title}</p>
        <p className="about-feature__text">{text}</p>
      </div>
    </div>
  )
}
