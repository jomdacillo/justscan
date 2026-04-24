/**
 * Icons inspired by SF Symbols. Inline SVGs that inherit currentColor.
 * Decorative (aria-hidden) — text labels carry the meaning.
 */

const baseProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.8',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  focusable: 'false',
}

export const IconCamera = ({ size = 24, ...rest }) => (
  <svg {...baseProps} width={size} height={size} {...rest}>
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.4a1 1 0 0 0 .8-.4l1-1.3a1.5 1.5 0 0 1 1.2-.6h4.2a1.5 1.5 0 0 1 1.2.6l1 1.3a1 1 0 0 0 .8.4h1.4A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
)

export const IconUpload = ({ size = 24, ...rest }) => (
  <svg {...baseProps} width={size} height={size} {...rest}>
    <path d="M12 16V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M5 20h14" />
  </svg>
)

export const IconDocument = ({ size = 24, ...rest }) => (
  <svg {...baseProps} width={size} height={size} {...rest}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </svg>
)

export const IconSwap = ({ size = 24, ...rest }) => (
  <svg {...baseProps} width={size} height={size} {...rest}>
    <path d="M16 3h5v5" />
    <path d="M21 3 13 11" />
    <path d="M8 21H3v-5" />
    <path d="m3 21 8-8" />
  </svg>
)

export const IconClose = ({ size = 24, ...rest }) => (
  <svg {...baseProps} width={size} height={size} {...rest}>
    <path d="M6 6 18 18M18 6 6 18" />
  </svg>
)

export const IconChevronRight = ({ size = 24, ...rest }) => (
  <svg {...baseProps} width={size} height={size} {...rest}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

export const IconChevronLeft = ({ size = 24, ...rest }) => (
  <svg {...baseProps} width={size} height={size} {...rest}>
    <path d="m15 6-6 6 6 6" />
  </svg>
)

export const IconDownload = ({ size = 24, ...rest }) => (
  <svg {...baseProps} width={size} height={size} {...rest}>
    <path d="M12 4v12" />
    <path d="m7 11 5 5 5-5" />
    <path d="M5 20h14" />
  </svg>
)

export const IconShare = ({ size = 24, ...rest }) => (
  <svg {...baseProps} width={size} height={size} {...rest}>
    <path d="M12 3v13" />
    <path d="m7 8 5-5 5 5" />
    <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </svg>
)

export const IconRetake = ({ size = 24, ...rest }) => (
  <svg {...baseProps} width={size} height={size} {...rest}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </svg>
)

export const IconInfo = ({ size = 24, ...rest }) => (
  <svg {...baseProps} width={size} height={size} {...rest}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8" r="0.6" fill="currentColor" />
  </svg>
)

export const IconSparkle = ({ size = 24, ...rest }) => (
  <svg {...baseProps} width={size} height={size} {...rest}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
  </svg>
)

export const IconPalette = ({ size = 24, ...rest }) => (
  <svg {...baseProps} width={size} height={size} {...rest}>
    <path d="M12 3a9 9 0 1 0 0 18c1.7 0 3-1.3 3-3 0-.8-.3-1.5-.8-2-.5-.5-.8-1.2-.8-2 0-1.7 1.3-3 3-3h1A3.6 3.6 0 0 0 21 7.4 9 9 0 0 0 12 3z" />
    <circle cx="7.5" cy="11" r="0.8" fill="currentColor" />
    <circle cx="9.5" cy="7" r="0.8" fill="currentColor" />
    <circle cx="14.5" cy="7" r="0.8" fill="currentColor" />
    <circle cx="16.5" cy="11" r="0.8" fill="currentColor" />
  </svg>
)

export const IconContrast = ({ size = 24, ...rest }) => (
  <svg {...baseProps} width={size} height={size} {...rest}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none" />
  </svg>
)

export const IconCheck = ({ size = 24, ...rest }) => (
  <svg {...baseProps} width={size} height={size} {...rest}>
    <path d="m5 12 5 5L20 7" />
  </svg>
)

export const IconAperture = ({ size = 24, ...rest }) => (
  <svg {...baseProps} width={size} height={size} {...rest}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v8.5l7-3.5" />
    <path d="M21 12h-8.5L17 19" />
    <path d="M12 21v-8.5L5 16" />
    <path d="M3 12h8.5L7 5" />
  </svg>
)
