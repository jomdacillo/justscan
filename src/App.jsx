import { useState } from 'react'
import HomeScreen from './components/HomeScreen'
import CameraScreen from './components/CameraScreen'
import PreviewScreen from './components/PreviewScreen'
import AboutSheet from './components/AboutSheet'
import ErrorBoundary from './components/ErrorBoundary'
import { loadImage } from './utils/imageProcessing'
import { haptics } from './utils/haptics'

export default function App() {
  const [screen, setScreen] = useState('home')
  const [mode, setMode] = useState('color')
  const [sourceImage, setSourceImage] = useState(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [bootKey, setBootKey] = useState(0)

  const handleCaptured = (img) => {
    setSourceImage(img)
    setScreen('preview')
  }

  const handlePickFile = async (file) => {
    try {
      const img = await loadImage(file)
      setSourceImage(img)
      setScreen('preview')
    } catch (err) {
      console.error(err)
      haptics.error()
      setErrorMessage("Sorry, that file couldn't be opened.")
      setTimeout(() => setErrorMessage(null), 3000)
    }
  }

  const handleRetake = () => {
    setSourceImage(null)
    setScreen('camera')
  }

  const handleBackToHome = () => {
    setSourceImage(null)
    setScreen('home')
  }

  const handleBoundaryReset = () => {
    setSourceImage(null)
    setScreen('home')
    setAboutOpen(false)
    setErrorMessage(null)
    setBootKey((k) => k + 1)
  }

  return (
    <ErrorBoundary onReset={handleBoundaryReset}>
      <div key={bootKey} style={{ height: '100%' }}>
        {screen === 'home' && (
          <HomeScreen
            mode={mode}
            onModeChange={setMode}
            onOpenCamera={() => setScreen('camera')}
            onPickFile={handlePickFile}
            onOpenAbout={() => setAboutOpen(true)}
          />
        )}

        {screen === 'camera' && (
          <CameraScreen
            onCancel={() => setScreen('home')}
            onCaptured={handleCaptured}
          />
        )}

        {screen === 'preview' && sourceImage && (
          <PreviewScreen
            sourceImage={sourceImage}
            initialMode={mode}
            onBack={handleBackToHome}
            onRetake={handleRetake}
            onNewScan={handleRetake}
          />
        )}

        <AboutSheet open={aboutOpen} onClose={() => setAboutOpen(false)} />

        {errorMessage && (
          <div
            role="alert"
            style={{
              position: 'fixed',
              left: '50%',
              top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
              transform: 'translateX(-50%)',
              backgroundColor: 'var(--color-destructive)',
              color: '#fff',
              padding: '10px 16px',
              borderRadius: '999px',
              fontSize: 'var(--text-subhead)',
              fontWeight: 500,
              boxShadow: 'var(--shadow-lg)',
              zIndex: 300,
              maxWidth: 'calc(100% - 32px)',
            }}
          >
            {errorMessage}
          </div>
        )}
      </div>
    </ErrorBoundary>
  )
}
