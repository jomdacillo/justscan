import './Button.css'

/**
 * iOS-style button.
 *
 * Variants mirror SwiftUI button styles:
 *  - 'prominent' : .borderedProminent (filled accent)
 *  - 'bordered'  : .bordered (tinted fill)
 *  - 'plain'     : .borderless (text only)
 *
 * Roles:
 *  - 'default' | 'destructive' | 'cancel'
 *
 * Size:
 *  - 'lg' (primary actions) | 'md' (default) | 'sm'
 */
export default function Button({
  children,
  variant = 'prominent',
  role = 'default',
  size = 'md',
  fullWidth = false,
  type = 'button',
  startIcon,
  endIcon,
  disabled = false,
  ...rest
}) {
  const className = [
    'jb',
    `jb--${variant}`,
    `jb--${role}`,
    `jb--${size}`,
    fullWidth && 'jb--block',
  ].filter(Boolean).join(' ')

  return (
    <button type={type} className={className} disabled={disabled} {...rest}>
      {startIcon && <span className="jb__icon" aria-hidden="true">{startIcon}</span>}
      <span className="jb__label">{children}</span>
      {endIcon && <span className="jb__icon" aria-hidden="true">{endIcon}</span>}
    </button>
  )
}
