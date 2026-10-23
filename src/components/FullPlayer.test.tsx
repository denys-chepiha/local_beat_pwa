// Core
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
// Components
import FullPlayer from './FullPlayer'
// Services
import { usePlayerStore } from '@/store/usePlayerStore'

afterEach(cleanup)

it('uses shared filled sliders for playback and volume while preserving actions', () => {
  const seek = vi.fn()
  const setVolume = vi.fn()
  usePlayerStore.setState({ ...usePlayerStore.getInitialState(), duration: 120, currentTime: 30, volume: 0.5, seek, setVolume,
    nowPlaying: { title: 'Song', subtitle: 'Artist', label: 'Playlist', kind: 'music' } }, true)
  render(<FullPlayer />)
  const timeline = screen.getByRole('slider', { name: 'Seek track' })
  const volume = screen.getByRole('slider', { name: 'Volume' })
  expect(timeline).toHaveClass('progress-slider')
  expect(timeline.style.getPropertyValue('--progress-slider-fill')).toBe('25%')
  expect(timeline).toHaveAttribute('aria-valuetext', '0:30 of 2:00')
  expect(volume.style.getPropertyValue('--progress-slider-fill')).toBe('50%')
  fireEvent.change(timeline, { target: { value: 45 } })
  fireEvent.change(volume, { target: { value: 0.8 } })
  expect(seek).toHaveBeenCalledWith(45)
  expect(setVolume).toHaveBeenCalledWith(0.8)
})
