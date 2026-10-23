import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import MiniPlayer from '@/components/MiniPlayer'
import { usePlayerStore } from '@/store/usePlayerStore'

beforeEach(() => {
  usePlayerStore.setState({
    ...usePlayerStore.getInitialState(),
    nowPlaying: { title: 'Song', subtitle: 'Artist', label: 'Playlist', kind: 'music' },
    musicQueue: ['first', 'middle', 'last'],
    musicQueueIndex: 0,
    next: vi.fn(async () => {}),
    previousTrack: vi.fn(async () => {}),
  }, true)
})

afterEach(cleanup)

describe('mini player navigation', () => {
  it.each([0, 2])('keeps both music buttons enabled at queue index %s', (musicQueueIndex) => {
    usePlayerStore.setState({ musicQueueIndex })
    render(<MiniPlayer />)
    const previous = screen.getByRole('button', { name: 'Previous track' })
    const next = screen.getByRole('button', { name: 'Next track' })
    expect(previous).toBeEnabled()
    expect(next).toBeEnabled()
    fireEvent.click(previous)
    fireEvent.click(next)
    expect(usePlayerStore.getState().previousTrack).toHaveBeenCalledTimes(1)
    expect(usePlayerStore.getState().next).toHaveBeenCalledTimes(1)
  })

  it('disables transport for an empty music queue', () => {
    usePlayerStore.setState({ musicQueue: [], musicQueueIndex: -1 })
    render(<MiniPlayer />)
    expect(screen.getByRole('button', { name: 'Previous track' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next track' })).toBeDisabled()
  })

  it.each([0, 2])('keeps audiobook boundaries at chapter index %s', (bookQueueIndex) => {
    usePlayerStore.setState({ source: 'audiobook', bookQueue: ['a', 'b', 'c'], bookQueueIndex })
    render(<MiniPlayer />)
    expect(screen.getByRole('button', { name: 'Previous track' })).toHaveProperty('disabled', bookQueueIndex === 0)
    expect(screen.getByRole('button', { name: 'Next track' })).toHaveProperty('disabled', bookQueueIndex === 2)
  })
})


it('shows live progress after seeking without a release event and after changing tracks', () => {
  usePlayerStore.setState({ duration: 180, currentTime: 0, seek: (time) => usePlayerStore.setState({ currentTime: time }) })
  render(<MiniPlayer />)
  expect(screen.getByRole('slider')).toHaveClass('progress-slider')
  fireEvent.change(screen.getByRole('slider'), { target: { value: '90' } })
  expect(screen.getByRole('slider').style.getPropertyValue('--progress-slider-fill')).toBe('50%')
  act(() => usePlayerStore.setState({ currentTime: 91 }))
  expect(screen.getByRole('slider')).toHaveValue('91')
  act(() => usePlayerStore.setState({ currentTrackId: 'next', currentTime: 0, duration: 120 }))
  expect(screen.getByRole('slider')).toHaveValue('0')
})
