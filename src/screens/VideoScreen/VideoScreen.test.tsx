// Core
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
// Components
import VideoScreen from './VideoScreen'
import { useVideoSession } from './useVideoSession'
// Services
import { usePlayerStore } from '@/store/usePlayerStore'

beforeEach(async () => {
  await useVideoSession.getState().setEntries([])
  useVideoSession.setState({ entries: [], activeId: null, progress: {}, loaded: true, storageError: null })
  usePlayerStore.setState({ pause: vi.fn() })
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => `blob:${(blob as File).name}`)
  vi.spyOn(URL, 'revokeObjectURL')
})
afterEach(async () => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); await useVideoSession.getState().setEntries([]) })
const choose = (...names: string[]) => fireEvent.change(screen.getByLabelText('Choose video files'), {
  target: { files: names.map((name) => new File(['video'], name, { type: name.endsWith('.txt') ? 'text/plain' : 'video/mp4' })) },
})
const metadata = (video: HTMLVideoElement) => {
  Object.defineProperty(video, 'duration', { configurable: true, value: 100 })
  fireEvent.loadedMetadata(video)
}

describe('local video playlist', () => {
  it('pauses audio, loads only the active local file, advances and releases resources', () => {
    const { container, unmount } = render(<VideoScreen />)
    expect(usePlayerStore.getState().pause).toHaveBeenCalled()
    choose('first.mp4', 'second.mov')
    const video = container.querySelector('video')!
    expect(video.src).toBe('blob:first.mp4')
    expect(video).toHaveAttribute('playsinline')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    metadata(video)
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }))
    expect(usePlayerStore.getState().pause).toHaveBeenCalledTimes(2)
    fireEvent.ended(video)
    expect(video.src).toBe('blob:second.mov')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first.mp4')
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second.mov')
  })
  it('supports seeking, speed, mute, repeat and full-window fallback', () => {
    const { container } = render(<VideoScreen />)
    choose('first.mp4')
    const video = container.querySelector('video')!
    metadata(video)
    fireEvent.change(screen.getByRole('slider', { name: 'Seek video' }), { target: { value: 50 } })
    fireEvent.click(screen.getByRole('button', { name: 'Forward video 10 seconds' }))
    expect(video.currentTime).toBe(60)
    fireEvent.change(screen.getByRole('combobox', { name: 'Playback speed' }), { target: { value: 1.5 } })
    expect(video.playbackRate).toBe(1.5)
    fireEvent.click(screen.getByRole('button', { name: 'Mute video' }))
    expect(video.muted).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Repeat video: off' }))
    expect(screen.getByRole('button', { name: 'Repeat video: all' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }))
    expect(container.querySelector('.video-stage')).toHaveClass('video-stage--expanded')
    fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }))
    expect(container.querySelector('.video-stage')).not.toHaveClass('video-stage--expanded')
  })
  it('hides controls during playback and reveals them on interaction', () => {
    vi.useFakeTimers()
    const { container } = render(<VideoScreen />)
    choose('first.mp4')
    const video = container.querySelector('video')!
    metadata(video)
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }))
    act(() => vi.advanceTimersByTime(2600))
    expect(container.querySelector('.video-overlay')).toHaveClass('video-overlay--hidden')
    fireEvent.pointerDown(video, { pointerType: 'touch' })
    fireEvent.click(video)
    expect(video.paused).toBe(false)
    expect(container.querySelector('.video-overlay')).not.toHaveClass('video-overlay--hidden')
  })
  it('reports invalid files and decoder errors, and removes queue entries', () => {
    const { container } = render(<VideoScreen />)
    choose('notes.txt')
    expect(screen.getByRole('alert')).toHaveTextContent('non-empty video files')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    choose('first.mp4')
    fireEvent.error(container.querySelector('video')!)
    expect(screen.getByRole('alert')).toHaveTextContent('format may be unsupported')
    fireEvent.click(screen.getByRole('button', { name: 'Show playlist' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove first.mp4' }))
    expect(container.querySelector('video')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first.mp4')
  })
})


it('keeps the session playlist across navigation while releasing decoder URLs', () => {
  const first = render(<VideoScreen />)
  choose('retained.mp4')
  first.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:retained.mp4')
  const second = render(<VideoScreen />)
  expect(second.container.querySelector('video')?.src).toBe('blob:retained.mp4')
})

it('restores video position and marks completed files', () => {
  const first = render(<VideoScreen />)
  choose('resume.mp4', 'next.mp4')
  const video = first.container.querySelector('video')!
  metadata(video)
  video.currentTime = 42
  fireEvent.timeUpdate(video)
  first.unmount()
  const second = render(<VideoScreen />)
  const restored = second.container.querySelector('video')!
  metadata(restored)
  expect(restored.currentTime).toBe(42)
  fireEvent.ended(restored)
  fireEvent.click(screen.getByRole('button', { name: 'Show playlist' }))
  expect(screen.getByText('✓ Watched')).toBeInTheDocument()
})

it('keeps volume controls on the right and indicates zero volume as muted', () => {
  const { container } = render(<VideoScreen />)
  choose('volume.mp4')
  const group = container.querySelector('.video-right-controls')!
  expect(group.lastElementChild).toHaveAttribute('aria-label', 'Enter fullscreen')
  const slider = screen.getByRole('slider', { name: 'Video volume' })
  fireEvent.change(slider, { target: { value: 0 } })
  expect(screen.getByRole('button', { name: 'Unmute video' })).toHaveClass('video-control--muted')
  expect(container.querySelector('video')!.muted).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Unmute video' }))
  expect(container.querySelector('video')!.volume).toBe(1)
  expect(container.querySelector('video')!.muted).toBe(false)
})

it('shows preview only after holding for one second and commits on release', () => {
  vi.useFakeTimers()
  const { container } = render(<VideoScreen />)
  choose('preview.mp4')
  const video = container.querySelector('video')!
  metadata(video)
  const slider = screen.getByRole('slider', { name: 'Seek video' })
  fireEvent.pointerDown(slider)
  fireEvent.change(slider, { target: { value: 65 } })
  act(() => vi.advanceTimersByTime(999))
  expect(screen.queryByLabelText('Video preview')).toBeNull()
  expect(video.currentTime).toBe(0)
  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByLabelText('Video preview')).toBeInTheDocument()
  fireEvent.pointerUp(slider)
  expect(video.currentTime).toBe(65)
  expect(screen.queryByLabelText('Video preview')).toBeNull()
})


it('flushes the current position on pause, seek and pagehide', () => {
  const { container } = render(<VideoScreen />)
  choose('flush.mp4')
  const video = container.querySelector('video')!
  metadata(video)
  const id = useVideoSession.getState().activeId!
  video.currentTime = 17
  fireEvent.pause(video)
  expect(useVideoSession.getState().progress[id].time).toBe(17)
  fireEvent.change(screen.getByRole('slider', { name: 'Seek video' }), { target: { value: 23 } })
  expect(useVideoSession.getState().progress[id].time).toBe(23)
  video.currentTime = 31
  fireEvent(window, new Event('pagehide'))
  expect(useVideoSession.getState().progress[id].time).toBe(31)
})

it('prevents additions until saved videos are restored', async () => {
  let finish!: () => void
  useVideoSession.setState({ loaded: false })
  vi.spyOn(useVideoSession.getState(), 'hydrate').mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  render(<VideoScreen />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading your videos')
  expect(screen.queryByLabelText('Choose video files')).toBeNull()
  await act(async () => { useVideoSession.setState({ loaded: true }); finish() })
  expect(screen.getByLabelText('Choose video files')).toBeInTheDocument()
})
