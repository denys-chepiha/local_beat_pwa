// Core
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
// Components
import VideoScreen from './VideoScreen'
import { useVideoSession } from './useVideoSession'
// Services
import { usePlayerStore } from '@/store/usePlayerStore'

beforeEach(() => {
  useVideoSession.setState({ entries: [], activeId: null })
  usePlayerStore.setState({ pause: vi.fn() })
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => `blob:${(blob as File).name}`)
  vi.spyOn(URL, 'revokeObjectURL')
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })
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

it('keeps fullscreen last in the transport and restores volume after muting', () => {
  const { container } = render(<VideoScreen />)
  choose('volume.mp4')
  const group = container.querySelector('.video-transport')!
  expect(group.lastElementChild).toHaveAttribute('aria-label', 'Enter fullscreen')
  const slider = screen.getByRole('slider', { name: 'Video volume' })
  fireEvent.change(slider, { target: { value: 0 } })
  expect(screen.getByRole('button', { name: 'Unmute video' })).toHaveClass('video-control--muted')
  expect(container.querySelector('video')!.muted).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Unmute video' }))
  expect(container.querySelector('video')!.volume).toBe(1)
  expect(container.querySelector('video')!.muted).toBe(false)
  fireEvent.change(slider, { target: { value: 0.37 } })
  fireEvent.click(screen.getByRole('button', { name: 'Mute video' }))
  expect(slider).toHaveValue('0')
  expect(screen.getByRole('button', { name: 'Unmute video' })).toHaveClass('video-control--muted')
  fireEvent.click(screen.getByRole('button', { name: 'Unmute video' }))
  expect(slider).toHaveValue('0.37')
  expect(container.querySelector('video')!.volume).toBe(0.37)
  fireEvent.change(slider, { target: { value: 0 } })
  fireEvent.click(screen.getByRole('button', { name: 'Unmute video' }))
  expect(slider).toHaveValue('0.37')
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

it('silences and suspends iOS Web Audio on pause without resuming when volume changes', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
  const gain = { gain: { value: 1 }, connect: vi.fn() }
  const suspend = vi.fn(async () => {})
  const resume = vi.fn(async () => {})
  vi.stubGlobal('AudioContext', class {
    destination = {}
    createGain = () => gain
    createMediaElementSource = () => ({ connect: () => gain })
    suspend = suspend
    resume = resume
    close = vi.fn(async () => {})
  })
  try {
    const { container } = render(<VideoScreen />)
    choose('pause.mp4')
    metadata(container.querySelector('video')!)
    fireEvent.change(screen.getByLabelText('Video volume'), { target: { value: 0.4 } })
    expect(gain.gain.value).toBe(0)
    expect(resume).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }))
    expect(gain.gain.value).toBe(0.4)
    expect(resume).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Pause video' }))
    expect(gain.gain.value).toBe(0)
    expect(suspend).toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Video volume'), { target: { value: 0.6 } })
    expect(gain.gain.value).toBe(0)
    expect(resume).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }))
    expect(gain.gain.value).toBe(0.6)
  } finally { cleanup(); vi.unstubAllGlobals() }
})

it('double taps seek on the matching half, clamp at either end and preserve playback', () => {
  vi.useFakeTimers()
  const { container } = render(<VideoScreen />)
  choose('gestures.mp4')
  const video = container.querySelector('video')!
  metadata(video)
  vi.spyOn(video, 'getBoundingClientRect').mockReturnValue({ left: 20, width: 400 } as DOMRect)
  const tap = (x: number) => fireEvent.click(video, { clientX: x })
  video.currentTime = 50
  tap(350)
  expect(video.currentTime).toBe(50)
  act(() => vi.advanceTimersByTime(150))
  tap(350)
  expect(video.currentTime).toBe(60)
  expect(video.paused).toBe(true)
  tap(50); tap(50)
  expect(video.currentTime).toBe(50)
  video.currentTime = 4
  tap(50); tap(50)
  expect(video.currentTime).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Play video' }))
  video.currentTime = 96
  tap(350); tap(350)
  expect(video.currentTime).toBe(100)
  expect(video.paused).toBe(false)
  video.currentTime = 40
  tap(50); tap(350)
  expect(video.currentTime).toBe(40)
  act(() => vi.advanceTimersByTime(400))
  tap(350)
  expect(video.currentTime).toBe(40)
})

it('shows a central play button on pause and hides it when playback starts', () => {
  const { container } = render(<VideoScreen />)
  choose('center.mp4')
  const video = container.querySelector('video')!
  metadata(video)
  fireEvent.click(screen.getByRole('button', { name: 'Play video from center' }))
  expect(video.paused).toBe(false)
  expect(screen.queryByRole('button', { name: 'Play video from center' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Pause video' }))
  expect(video.paused).toBe(true)
  expect(screen.getByRole('button', { name: 'Play video from center' })).toBeVisible()
})


it('opens one lower panel at a time and keeps settings visible during playback', () => {
  vi.useFakeTimers()
  const { container } = render(<VideoScreen />)
  choose('settings.mp4', 'next.mp4')
  metadata(container.querySelector('video')!)
  fireEvent.click(screen.getByRole('button', { name: 'Play video' }))
  fireEvent.click(screen.getByRole('button', { name: 'Show playlist' }))
  expect(screen.getByRole('complementary', { name: 'Video playlist' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Video settings' }))
  expect(screen.queryByRole('complementary', { name: 'Video playlist' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Video settings' })).toHaveAttribute('aria-expanded', 'true')
  act(() => vi.advanceTimersByTime(2600))
  expect(container.querySelector('.video-overlay')).not.toHaveClass('video-overlay--hidden')
  fireEvent.click(screen.getByRole('button', { name: 'Show playlist' }))
  expect(screen.getByRole('button', { name: 'Video settings' })).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(screen.getByRole('button', { name: '1settings.mp4' }))
  expect(screen.queryByRole('complementary', { name: 'Video playlist' })).toBeNull()
  expect(container.querySelector('video')!.paused).toBe(false)
})

it('dismisses lower panels with Escape and restores focus to their toggles', () => {
  render(<VideoScreen />)
  choose('keyboard.mp4')
  fireEvent.click(screen.getByRole('button', { name: 'Show playlist' }))
  const close = screen.getByRole('button', { name: 'Close playlist' })
  close.focus()
  fireEvent.keyDown(close, { key: 'Escape' })
  expect(screen.queryByRole('complementary', { name: 'Video playlist' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Show playlist' })).toHaveFocus()
  const settings = screen.getByRole('button', { name: 'Video settings' })
  fireEvent.click(settings)
  const speed = screen.getByRole('combobox', { name: 'Playback speed' })
  speed.focus()
  fireEvent.keyDown(speed, { key: 'Escape' })
  expect(settings).toHaveAttribute('aria-expanded', 'false')
  expect(settings).toHaveFocus()
})

it('uses full-window fallback on Safari so the playlist remains available', () => {
  const { container } = render(<VideoScreen />)
  choose('safari.mp4')
  const video = container.querySelector('video')!
  const nativeFullscreen = vi.fn()
  Object.defineProperty(video, 'webkitEnterFullscreen', { value: nativeFullscreen })
  fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }))
  expect(nativeFullscreen).not.toHaveBeenCalled()
  expect(container.querySelector('.video-stage')).toHaveClass('video-stage--expanded')
  fireEvent.click(screen.getByRole('button', { name: 'Show playlist' }))
  expect(screen.getByRole('complementary', { name: 'Video playlist' })).toBeVisible()
})
