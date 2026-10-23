// Core
import { createRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
// Components
import ProgressSlider from './ProgressSlider'

afterEach(cleanup)

describe('ProgressSlider', () => {
  it('shows normalized progress for ranges with a non-zero minimum', () => {
    const { rerender } = render(<ProgressSlider aria-label="Page" min={10} max={110} value={60} onChange={() => {}} />)
    const slider = screen.getByRole('slider', { name: 'Page' })
    expect(slider).toHaveValue('60')
    expect(slider.style.getPropertyValue('--progress-slider-fill')).toBe('50%')
    rerender(<ProgressSlider aria-label="Page" min={10} max={110} value={200} onChange={() => {}} />)
    expect(slider).toHaveValue('110')
    expect(slider.style.getPropertyValue('--progress-slider-fill')).toBe('100%')
  })

  it('contains invalid bounds, values and step without emitting NaN styles', () => {
    const { rerender } = render(<ProgressSlider aria-label="Position" min={5} max={50} value={NaN} step={-1} onChange={() => {}} />)
    const slider = screen.getByRole('slider')
    expect(slider).toHaveValue('5')
    expect(slider).toHaveAttribute('step', '1')
    expect(slider.style.getPropertyValue('--progress-slider-fill')).toBe('0%')
    rerender(<ProgressSlider aria-label="Position" min={NaN} max={Infinity} value={Infinity} onChange={() => {}} />)
    expect(slider).toBeDisabled()
    expect(slider).toHaveValue('0')
    expect(slider.style.getPropertyValue('--progress-slider-fill')).toBe('0%')
    rerender(<ProgressSlider aria-label="Position" min={-1e308} max={1e308} value={0} onChange={() => {}} />)
    expect(slider.style.getPropertyValue('--progress-slider-fill')).toBe('50%')
  })

  it('forwards the input ref, accessible text and native interaction handlers', () => {
    const ref = createRef<HTMLInputElement>()
    const change = vi.fn()
    const pointer = vi.fn()
    const key = vi.fn()
    render(<ProgressSlider ref={ref} aria-label="Seek" aria-valuetext="One minute of two minutes" min={0} max={120} value={60}
      className="custom-slider" style={{ opacity: 0.8 }} onChange={change} onPointerDown={pointer} onKeyDown={key} />)
    const slider = screen.getByRole('slider', { name: 'Seek' })
    expect(ref.current).toBe(slider)
    expect(slider).toHaveAttribute('aria-valuetext', 'One minute of two minutes')
    expect(slider).toHaveClass('progress-slider', 'custom-slider')
    expect(slider).toHaveStyle({ opacity: '0.8' })
    fireEvent.change(slider, { target: { value: '80' } })
    fireEvent.pointerDown(slider)
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(change).toHaveBeenCalledTimes(1)
    expect(pointer).toHaveBeenCalledTimes(1)
    expect(key).toHaveBeenCalledTimes(1)
  })
})
