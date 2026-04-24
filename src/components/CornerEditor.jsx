import { useRef, useEffect, useState, useCallback } from 'react'
import './CornerEditor.css'

/**
 * Draggable 4-corner overlay for refining document boundaries.
 *
 * Props:
 *   sourceImage - HTMLImageElement (the original captured photo)
 *   corners     - [{x,y}, {x,y}, {x,y}, {x,y}] in source-image coordinates,
 *                 ordered TL, TR, BR, BL
 *   onCornersChange - called with new corners array as user drags
 */
export default function CornerEditor({ sourceImage, corners, onCornersChange }) {
  const containerRef = useRef(null)
  const imgRef = useRef(null)
  const [layout, setLayout] = useState({
    displayWidth: 0,
    displayHeight: 0,
    offsetX: 0,
    offsetY: 0,
  })
  const [draggingIdx, setDraggingIdx] = useState(null)

  // Compute how the image actually displays inside its container (object-fit: contain)
  const recomputeLayout = useCallback(() => {
    const container = containerRef.current
    if (!container || !sourceImage) return
    const cw = container.clientWidth
    const ch = container.clientHeight
    const iw = sourceImage.naturalWidth
    const ih = sourceImage.naturalHeight
    if (!iw || !ih || !cw || !ch) return

    const imgRatio = iw / ih
    const boxRatio = cw / ch
    let displayWidth, displayHeight
    if (imgRatio > boxRatio) {
      displayWidth = cw
      displayHeight = cw / imgRatio
    } else {
      displayHeight = ch
      displayWidth = ch * imgRatio
    }
    setLayout({
      displayWidth,
      displayHeight,
      offsetX: (cw - displayWidth) / 2,
      offsetY: (ch - displayHeight) / 2,
    })
  }, [sourceImage])

  useEffect(() => {
    recomputeLayout()
    const handler = () => recomputeLayout()
    window.addEventListener('resize', handler)
    window.addEventListener('orientationchange', handler)
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('orientationchange', handler)
    }
  }, [recomputeLayout])

  // Convert source-coord -> screen-coord (relative to container)
  const sourceToScreen = (pt) => {
    if (!sourceImage) return { x: 0, y: 0 }
    const sx = (pt.x / sourceImage.naturalWidth) * layout.displayWidth + layout.offsetX
    const sy = (pt.y / sourceImage.naturalHeight) * layout.displayHeight + layout.offsetY
    return { x: sx, y: sy }
  }

  // Convert screen-coord -> source-coord, clamped to image bounds
  const screenToSource = (sx, sy) => {
    if (!sourceImage) return { x: 0, y: 0 }
    const x = ((sx - layout.offsetX) / layout.displayWidth) * sourceImage.naturalWidth
    const y = ((sy - layout.offsetY) / layout.displayHeight) * sourceImage.naturalHeight
    return {
      x: Math.max(0, Math.min(sourceImage.naturalWidth, x)),
      y: Math.max(0, Math.min(sourceImage.naturalHeight, y)),
    }
  }

  // Pointer events handle mouse + touch + pen uniformly
  const handlePointerDown = (idx) => (e) => {
    e.preventDefault()
    e.target.setPointerCapture(e.pointerId)
    setDraggingIdx(idx)
  }

  const handlePointerMove = (idx) => (e) => {
    if (draggingIdx !== idx) return
    const rect = containerRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const newPt = screenToSource(sx, sy)
    const nextCorners = corners.map((c, i) => (i === idx ? newPt : c))
    onCornersChange(nextCorners)
  }

  const handlePointerUp = () => setDraggingIdx(null)

  // Build SVG polyline points from corners
  const polylinePoints = corners
    .map((c) => {
      const s = sourceToScreen(c)
      return `${s.x},${s.y}`
    })
    .join(' ')

  return (
    <div className="ce" ref={containerRef}>
      <img
        ref={imgRef}
        src={sourceImage.src}
        alt=""
        className="ce__img"
        onLoad={recomputeLayout}
        draggable={false}
      />

      <svg
        className="ce__svg"
        width="100%"
        height="100%"
        style={{ pointerEvents: 'none' }}
        aria-hidden="true"
      >
        {/* Dim mask outside the document (cuts a hole using even-odd fill) */}
        <defs>
          <mask id="ce-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <polygon points={polylinePoints} fill="black" />
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(0,0,0,0.45)"
          mask="url(#ce-mask)"
        />

        {/* The quad outline */}
        <polygon
          points={polylinePoints}
          fill="none"
          stroke="#0A84FF"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Edge midpoint indicators (small dots) */}
        {corners.map((c, i) => {
          const next = corners[(i + 1) % corners.length]
          const mid = {
            x: (c.x + next.x) / 2,
            y: (c.y + next.y) / 2,
          }
          const s = sourceToScreen(mid)
          return (
            <circle
              key={`mid-${i}`}
              cx={s.x}
              cy={s.y}
              r="3"
              fill="#0A84FF"
              opacity="0.6"
            />
          )
        })}
      </svg>

      {/* Draggable corner handles */}
      {corners.map((c, idx) => {
        const s = sourceToScreen(c)
        const isDragging = draggingIdx === idx
        return (
          <button
            key={idx}
            type="button"
            className={`ce__handle ${isDragging ? 'ce__handle--active' : ''}`}
            style={{ left: `${s.x}px`, top: `${s.y}px` }}
            onPointerDown={handlePointerDown(idx)}
            onPointerMove={handlePointerMove(idx)}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            aria-label={`Adjust ${['top-left', 'top-right', 'bottom-right', 'bottom-left'][idx]} corner`}
          >
            <span className="ce__handle-inner" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
