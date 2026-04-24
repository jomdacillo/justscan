import { useRef } from 'react'
import Button from './Button'
import SegmentedControl from './SegmentedControl'
import {
  IconCamera,
  IconUpload,
  IconInfo,
  IconPalette,
  IconContrast,
  IconSparkle,
  IconAperture,
} from './Icons'
import { haptics } from '../utils/haptics'
import './HomeScreen.css'

export default function HomeScreen({ mode, onModeChange, onOpenCamera, onPickFile, onOpenAbout }) {
  const fileInputRef = useRef(null)

  const triggerFilePicker = () => {
    haptics.light()
    fileInputRef.current?.click()
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) onPickFile(file)
    // reset so the same file can be picked again
    e.target.value = ''
  }

  return (
    <div className="home">
      {/* Top bar: about button only — no hamburger */}
      <header className="home__topbar">
        <div className="home__topbar-spacer" />
        <button
          type="button"
          className="home__icon-btn"
          onClick={() => { haptics.light(); onOpenAbout() }}
          aria-label="About JustScan"
        >
          <IconInfo size={22} />
        </button>
      </header>

      <main className="home__main">
        {/* Large title */}
        <div className="home__title-block">
          <h1 className="home__title">JustScan</h1>
          <p className="home__subtitle">A portable CamScanner. No fuss, just scan.</p>
        </div>

        {/* Hero card with the aperture mark */}
        <section className="home__hero" aria-hidden="true">
          <div className="hero-stage">
            <div className="hero-stage__page hero-stage__page--back" />
            <div className="hero-stage__page hero-stage__page--mid" />
            <div className="hero-stage__page hero-stage__page--front">
              <div className="hero-stage__lines">
                <span style={{ width: '70%' }} />
                <span style={{ width: '92%' }} />
                <span style={{ width: '85%' }} />
                <span style={{ width: '60%' }} />
                <span style={{ width: '78%' }} />
                <span style={{ width: '50%' }} />
              </div>
              <div className="hero-stage__aperture">
                <IconAperture size={28} />
              </div>
            </div>
          </div>
        </section>

        {/* Output style */}
        <section className="home__section" aria-labelledby="style-heading">
          <h2 id="style-heading" className="home__section-title">Output Style</h2>
          <SegmentedControl
            value={mode}
            onChange={(v) => { haptics.selection(); onModeChange(v) }}
            options={[
              { value: 'color', label: 'Color',         icon: <IconPalette size={16} /> },
              { value: 'bw',    label: 'Black & White', icon: <IconContrast size={16} /> },
            ]}
            ariaLabel="Output style"
          />
          <p className="home__hint">
            <IconSparkle size={14} aria-hidden="true" />
            <span>
              {mode === 'color'
                ? 'Auto white-balance and contrast lift for vivid documents.'
                : 'Adaptive thresholding for crisp, photocopier-style text.'}
            </span>
          </p>
        </section>
      </main>

      {/* Bottom action area — thumb zone */}
      <footer className="home__actions">
        <Button
          variant="prominent"
          size="lg"
          fullWidth
          startIcon={<IconCamera size={20} />}
          onClick={() => { haptics.medium(); onOpenCamera() }}
        >
          Open Camera
        </Button>
        <Button
          variant="bordered"
          size="lg"
          fullWidth
          startIcon={<IconUpload size={20} />}
          onClick={triggerFilePicker}
        >
          Choose from Library
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFileChange}
          aria-label="Choose an image from your library"
        />
      </footer>
    </div>
  )
}
