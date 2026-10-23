// Core
import { forwardRef } from 'react'
import type { CSSProperties, InputHTMLAttributes } from 'react'
// Styles
import './ProgressSlider.css'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'min' | 'max' | 'step'> {
  value: number
  min?: number
  max?: number
  step?: number | 'any'
}

const ProgressSlider = forwardRef<HTMLInputElement, Props>(function ProgressSlider({
  value, min = 0, max = 100, step = 1, disabled, className = '', style, ...props
}, ref) {
  const lower = Number.isFinite(min) ? min : 0
  const upper = Number.isFinite(max) ? Math.max(lower, max) : lower
  const current = Number.isFinite(value) ? Math.max(lower, Math.min(upper, value)) : lower
  const span = upper - lower
  const fraction = upper === lower ? 0 : Number.isFinite(span)
    ? (current - lower) / span
    : (current / 2 - lower / 2) / (upper / 2 - lower / 2)
  const progress = Math.max(0, Math.min(100, fraction * 100))
  const increment = step === 'any' || (Number.isFinite(step) && step > 0) ? step : 1

  return <input {...props} ref={ref} type="range" className={`progress-slider${className ? ` ${className}` : ''}`}
    min={lower} max={upper} step={increment} value={current} disabled={disabled || upper === lower}
    style={{ ...style, '--progress-slider-fill': `${progress}%` } as CSSProperties} />
})

export default ProgressSlider
