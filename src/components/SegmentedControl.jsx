import { useId } from 'react'
import './SegmentedControl.css'

/**
 * iOS-style segmented control. Implemented as a radiogroup for accessibility.
 *
 * options: [{ value, label, icon? }]
 */
export default function SegmentedControl({
  value,
  onChange,
  options,
  label,
  ariaLabel,
}) {
  const groupId = useId()
  const labelId = `${groupId}-label`

  return (
    <div className="seg-wrap">
      {label && (
        <span className="seg-wrap__label" id={labelId}>
          {label}
        </span>
      )}
      <div
        className="seg"
        role="radiogroup"
        aria-labelledby={label ? labelId : undefined}
        aria-label={!label ? ariaLabel : undefined}
      >
        {options.map((opt) => {
          const isActive = opt.value === value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              className={`seg__opt ${isActive ? 'seg__opt--active' : ''}`}
              onClick={() => {
                if (!isActive) onChange(opt.value)
              }}
            >
              {opt.icon && <span className="seg__icon" aria-hidden="true">{opt.icon}</span>}
              <span>{opt.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
