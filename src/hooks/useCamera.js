import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * useCamera — wraps getUserMedia with sensible defaults for document scanning.
 *
 * Returns:
 *  - videoRef:   attach to your <video> element
 *  - status:     'idle' | 'requesting' | 'streaming' | 'denied' | 'unsupported' | 'error'
 *  - errorMessage: human-readable string when status is 'denied' or 'error'
 *  - start(facingMode?): request a stream
 *  - stop():     stop tracks
 *  - capture():  return a Promise<HTMLImageElement> of the current frame
 */
export function useCamera() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const stop = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const start = useCallback(async (facingMode = 'environment') => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      setErrorMessage('Camera access is not supported in this browser.')
      return
    }

    setStatus('requesting')
    setErrorMessage('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        // iOS Safari requires playsInline + muted to autoplay
        videoRef.current.setAttribute('playsinline', 'true')
        videoRef.current.muted = true
        await videoRef.current.play().catch(() => { /* ignore play interruption */ })
      }
      setStatus('streaming')
    } catch (err) {
      const name = err?.name || ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setStatus('denied')
        setErrorMessage('Camera permission was denied. Please enable camera access in your browser settings.')
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setStatus('error')
        setErrorMessage('No camera was found on this device.')
      } else if (name === 'NotReadableError') {
        setStatus('error')
        setErrorMessage('The camera is being used by another app.')
      } else {
        setStatus('error')
        setErrorMessage(err?.message || 'Could not start the camera.')
      }
    }
  }, [])

  /** Capture the current video frame as an HTMLImageElement. */
  const capture = useCallback(async () => {
    const video = videoRef.current
    if (!video || video.readyState < 2) {
      throw new Error('Camera is not ready yet.')
    }
    const w = video.videoWidth
    const h = video.videoHeight
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, w, h)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error('Could not capture frame.'))
      img.src = dataUrl
    })
    return img
  }, [])

  // Clean up on unmount
  useEffect(() => () => stop(), [stop])

  return { videoRef, status, errorMessage, start, stop, capture }
}
