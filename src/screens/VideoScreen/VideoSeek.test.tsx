// Core
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
// Components
import VideoSeek from './VideoSeek'

afterEach(() => { cleanup(); vi.useRealTimers() })

it('keeps preview staging separate from committed playback and cancels interrupted drags', () => {
  vi.useFakeTimers()
  const seek = vi.fn()
  const onScrubbing = vi.fn()
  render(<VideoSeek file={new File(['video'], 'movie.mp4')} time={20} duration={100} seek={seek} onScrubbing={onScrubbing} />)
  const slider = screen.getByRole('slider', { name: 'Seek video' })
  expect(slider).toHaveClass('progress-slider')
  expect(slider.style.getPropertyValue('--progress-slider-fill')).toBe('20%')
  fireEvent.pointerDown(slider)
  fireEvent.change(slider, { target: { value: 60 } })
  expect(slider.style.getPropertyValue('--progress-slider-fill')).toBe('60%')
  expect(seek).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1000))
  expect(screen.getByLabelText('Video preview')).toBeInTheDocument()
  fireEvent.pointerCancel(slider)
  expect(screen.queryByLabelText('Video preview')).toBeNull()
  expect(slider).toHaveValue('20')
  expect(seek).not.toHaveBeenCalled()
  expect(onScrubbing).toHaveBeenLastCalledWith(false)
  fireEvent.change(slider, { target: { value: 35 } })
  expect(seek).toHaveBeenCalledWith(35)
})
