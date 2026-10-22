import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import jsmediatags from 'jsmediatags'
import { extractMetadata, isAudioFile, readAudioDuration } from '@/utils/audioFile'

vi.mock('jsmediatags', () => ({ default: { read: vi.fn() } }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(jsmediatags.read).mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('audio file import metadata', () => {
  it.each(['', 'application/octet-stream'])('accepts a supported filename with provider MIME type "%s"', (type) => {
    expect(isAudioFile(new File(['audio'], 'Song.MP3', { type }))).toBe(true)
    expect(isAudioFile(new File(['audio'], 'Song.m4a', { type }))).toBe(true)
    expect(isAudioFile(new File(['text'], 'notes.txt', { type }))).toBe(false)
  })

  it.each(['loadedmetadata', 'error', 'timeout'])('releases the duration probe on %s', async (event) => {
    const create = vi.spyOn(document, 'createElement')
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const result = readAudioDuration(new File(['audio'], 'song.mp3'))
    const audio = create.mock.results.find((result) => result.value instanceof HTMLAudioElement)!.value as HTMLAudioElement
    Object.defineProperty(audio, 'duration', { value: 120 })

    if (event === 'timeout') await vi.advanceTimersByTimeAsync(8000)
    else audio.dispatchEvent(new Event(event))

    expect(await result).toBe(event === 'loadedmetadata' ? 120 : 0)
    expect(audio.onloadedmetadata).toBeNull()
    expect(audio.onerror).toBeNull()
    expect(audio.hasAttribute('src')).toBe(false)
    expect(revoke).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(8000)
    expect(revoke).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['no callback', 'throws', 'malformed tags'])('uses filename fallback when the tag reader %s', async (failure) => {
    vi.mocked(jsmediatags.read).mockImplementation((_file, callbacks) => {
      if (failure === 'throws') throw new Error('Unreadable tags')
      if (failure === 'malformed tags') callbacks.onSuccess({ tags: null } as never)
    })

    const result = extractMetadata(new File(['audio'], 'My song.mp3', { type: 'application/octet-stream' }))
    // Neither media event arrives; both optional metadata readers must settle.
    await vi.advanceTimersByTimeAsync(8000)

    expect(await result).toEqual({
      title: 'My song', artist: 'Unknown Artist', album: '', duration: 0, cover: undefined,
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves valid tags and duration', async () => {
    vi.mocked(jsmediatags.read).mockImplementation((_file, callbacks) => {
      callbacks.onSuccess({ tags: { title: ' Song ', artist: 'Artist', album: 'Album' } })
    })
    const create = vi.spyOn(document, 'createElement')
    const result = extractMetadata(new File(['audio'], 'file.mp3'))
    const audio = create.mock.results.find((result) => result.value instanceof HTMLAudioElement)!.value as HTMLAudioElement
    Object.defineProperty(audio, 'duration', { value: 90 })
    audio.dispatchEvent(new Event('loadedmetadata'))

    expect(await result).toEqual({ title: 'Song', artist: 'Artist', album: 'Album', duration: 90, cover: undefined })
    expect(vi.getTimerCount()).toBe(0)
  })
})
