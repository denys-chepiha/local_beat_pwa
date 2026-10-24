// Core
import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'

// `addFiles` reads real audio duration via a throwaway <audio> element and
// waits for `loadedmetadata` — jsdom never fires that event, so it would
// hang forever. Stub metadata extraction; nothing in these tests depends on
// realistic tag data, only on tracks existing with a known duration.
vi.mock('@/utils/audioFile', async () => {
  const actual = await vi.importActual<typeof import('@/utils/audioFile')>('@/utils/audioFile')
  return {
    ...actual,
    extractMetadata: async (file: File) => ({
      title: actual.baseName(file.name),
      artist: 'Unknown Artist',
      album: '',
      duration: 180,
      cover: undefined,
    }),
  }
})

async function freshModules(opts: { skipPlayerInit?: boolean } = {}) {
  vi.resetModules()
  const { db } = await import('@/services/db')
  const { useLibraryStore } = await import('@/store/useLibraryStore')
  const { useAudiobookStore } = await import('@/store/useAudiobookStore')
  const { usePlayerStore } = await import('@/store/usePlayerStore')
  await db.playlists.clear()
  await db.tracks.clear()
  await db.blobs.clear()
  await db.playerState.clear()
  await db.audiobooks.clear()
  await db.audiobookChapters.clear()
  await db.audiobookBlobs.clear()
  if (!opts.skipPlayerInit) await usePlayerStore.getState().init()
  return { db, useLibraryStore, useAudiobookStore, usePlayerStore }
}

async function seedPlaylist(
  useLibraryStore: Awaited<ReturnType<typeof freshModules>>['useLibraryStore'],
  trackCount: number,
) {
  const playlist = await useLibraryStore.getState().createPlaylist('Regression Playlist')
  const files = Array.from(
    { length: trackCount },
    (_, i) => new File([new Uint8Array(1024)], `${i + 1}.mp3`, { type: 'audio/mpeg' }),
  )
  await useLibraryStore.getState().addFiles(playlist.id, files)
  const tracks = useLibraryStore.getState().getPlaylistTracks(playlist.id)
  return { playlist, tracks }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('usePlayerStore — music playback (post audiobook refactor)', () => {
  it('initializes concurrently without advancing twice for one ended event', async () => {
    const { useLibraryStore, usePlayerStore } = await freshModules({ skipPlayerInit: true })
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 2)
    await Promise.all([usePlayerStore.getState().init(), usePlayerStore.getState().init()])
    await usePlayerStore.getState().playPlaylist(playlist.id)
    const next = vi.spyOn(usePlayerStore.getState(), 'next')

    document.querySelector('audio')!.dispatchEvent(new Event('ended'))

    expect(next).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(usePlayerStore.getState().currentTrackId).toBe(tracks[1].id))
  })

  it('playPlaylist starts the first track with source "music" and correct nowPlaying', async () => {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 3)

    await usePlayerStore.getState().playPlaylist(playlist.id)

    const s = usePlayerStore.getState()
    expect(s.source).toBe('music')
    expect(s.currentTrackId).toBe(tracks[0].id)
    expect(s.nowPlaying?.kind).toBe('music')
    expect(s.isPlaying).toBe(true)
  })

  it('next()/previous() wrap cyclically for music, unlike audiobooks', async () => {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist } = await seedPlaylist(useLibraryStore, 2)
    await usePlayerStore.getState().playPlaylist(playlist.id)

    expect(usePlayerStore.getState().musicQueueIndex).toBe(0)
    await usePlayerStore.getState().next()
    expect(usePlayerStore.getState().musicQueueIndex).toBe(1)
    await usePlayerStore.getState().next() // past the end -> wraps to the first track
    expect(usePlayerStore.getState().musicQueueIndex).toBe(0)
    await usePlayerStore.getState().previous()
    expect(usePlayerStore.getState().musicQueueIndex).toBe(1)
  })

  it('keeps playlist order when a selected middle track ends', async () => {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 4)
    const ids = tracks.map((track) => track.id)

    await usePlayerStore.getState().playPlaylist(playlist.id, ids[1])
    expect(usePlayerStore.getState().musicQueue).toEqual(ids)
    expect(usePlayerStore.getState().musicQueueIndex).toBe(1)

    for (const index of [2, 3, 0]) {
      document.querySelector('audio')!.dispatchEvent(new Event('ended'))
      await waitFor(() => expect(usePlayerStore.getState().currentTrackId).toBe(ids[index]))
      expect(usePlayerStore.getState().musicQueue).toEqual(ids)
      expect(usePlayerStore.getState().musicQueueIndex).toBe(index)
    }
  })

  it.each(['previous', 'previousTrack'] as const)('%s wraps from the first song even after playback has advanced', async (action) => {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 3)
    await usePlayerStore.getState().playPlaylist(playlist.id)
    usePlayerStore.getState().seek(20)

    await usePlayerStore.getState()[action]()

    expect(usePlayerStore.getState().currentTrackId).toBe(tracks[2].id)
    expect(usePlayerStore.getState().musicQueueIndex).toBe(2)
    expect(usePlayerStore.getState().currentTime).toBe(0)
  })

  it('repeat-one repeats an ended song but still allows manual navigation', async () => {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 2)
    await usePlayerStore.getState().playPlaylist(playlist.id)
    usePlayerStore.setState({ repeatMode: 'one' })
    usePlayerStore.getState().seek(20)

    document.querySelector('audio')!.dispatchEvent(new Event('ended'))
    expect(usePlayerStore.getState().currentTrackId).toBe(tracks[0].id)
    expect(usePlayerStore.getState().currentTime).toBe(0)

    await usePlayerStore.getState().next()
    expect(usePlayerStore.getState().currentTrackId).toBe(tracks[1].id)
    await usePlayerStore.getState().next()
    expect(usePlayerStore.getState().currentTrackId).toBe(tracks[0].id)
    await usePlayerStore.getState().previousTrack()
    expect(usePlayerStore.getState().currentTrackId).toBe(tracks[1].id)
  })

  it('keeps a selected song first in shuffle and restores playlist order when shuffle is disabled', async () => {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 4)
    const ids = tracks.map((track) => track.id)
    usePlayerStore.setState({ shuffleEnabled: true })
    await usePlayerStore.getState().playPlaylist(playlist.id, ids[2])

    const shuffled = usePlayerStore.getState().musicQueue
    expect(shuffled[0]).toBe(ids[2])
    expect(new Set(shuffled)).toEqual(new Set(ids))
    await usePlayerStore.getState().next()
    expect(usePlayerStore.getState().currentTrackId).toBe(shuffled[1])

    usePlayerStore.getState().toggleShuffle()
    expect(usePlayerStore.getState().musicQueue).toEqual(ids)
    expect(usePlayerStore.getState().musicQueueIndex).toBe(ids.indexOf(shuffled[1]))
  })

  it.each([false, true])('restores the index by track ID with shuffle=%s', async (shuffleEnabled) => {
    const { db, useLibraryStore, usePlayerStore } = await freshModules({ skipPlayerInit: true })
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 4)
    const ids = tracks.map((track) => track.id)
    await db.playerState.put({
      id: 'player', source: 'music', volume: 1, shuffleEnabled, repeatMode: 'off',
      currentPlaylistId: playlist.id, currentTrackId: ids[2], currentTime: 25,
      queue: ['removed-track', ids[2], ids[0], ids[1], ids[3]], queueIndex: 1,
      currentBookId: null,
    })

    await usePlayerStore.getState().init()

    expect(usePlayerStore.getState().currentTime).toBe(25)
    expect(usePlayerStore.getState().musicQueueIndex).toBe(shuffleEnabled ? 0 : 2)
    expect(usePlayerStore.getState().musicQueue).toEqual(shuffleEnabled ? [ids[2], ids[0], ids[1], ids[3]] : ids)
    await usePlayerStore.getState().next()
    expect(usePlayerStore.getState().currentTrackId).toBe(shuffleEnabled ? ids[0] : ids[3])
  })

  it('handles manual navigation for empty and single-track queues', async () => {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    await usePlayerStore.getState().next()
    await usePlayerStore.getState().previousTrack()
    expect(usePlayerStore.getState().currentTrackId).toBeNull()

    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 1)
    await usePlayerStore.getState().playPlaylist(playlist.id)
    for (const action of ['next', 'previousTrack'] as const) {
      usePlayerStore.getState().seek(20)
      await usePlayerStore.getState()[action]()
      expect(usePlayerStore.getState().currentTrackId).toBe(tracks[0].id)
      expect(usePlayerStore.getState().currentTime).toBe(0)
    }
  })

  it('switching to an audiobook and back preserves each session state independently', async () => {
    const { useLibraryStore, useAudiobookStore, usePlayerStore } = await freshModules()
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 2)
    await usePlayerStore.getState().playPlaylist(playlist.id, tracks[0].id)
    await usePlayerStore.getState().next() // move to track index 1 so we have a non-zero pointer

    const musicTrackId = usePlayerStore.getState().currentTrackId
    const musicQueueIndex = usePlayerStore.getState().musicQueueIndex

    const book = await useAudiobookStore.getState().importBook({
      title: 'Interrupting Book',
      chapters: [
        {
          file: new File([new Uint8Array(1024)], 'ch1.mp3', { type: 'audio/mpeg' }),
          title: 'Chapter 1',
          duration: 60,
        },
      ],
      fingerprint: 'fp-cross',
    })
    await usePlayerStore.getState().playAudiobook(book.id)

    // The audiobook is now live, but the music session's own fields must be untouched.
    let s = usePlayerStore.getState()
    expect(s.source).toBe('audiobook')
    expect(s.currentTrackId).toBe(musicTrackId)
    expect(s.musicQueueIndex).toBe(musicQueueIndex)

    // Switching back to music resumes exactly where the music session left off.
    await usePlayerStore.getState().playPlaylist(playlist.id, musicTrackId!)
    s = usePlayerStore.getState()
    expect(s.source).toBe('music')
    expect(s.currentTrackId).toBe(musicTrackId)
  })

  it('a stale currentTrackId from a prior music session never impersonates the live audiobook', async () => {
    const { useLibraryStore, useAudiobookStore, usePlayerStore } = await freshModules()
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 1)
    await usePlayerStore.getState().playPlaylist(playlist.id, tracks[0].id)

    const book = await useAudiobookStore.getState().importBook({
      title: 'Another Book',
      chapters: [
        {
          file: new File([new Uint8Array(1024)], 'ch1.mp3', { type: 'audio/mpeg' }),
          title: 'Chapter 1',
          duration: 60,
        },
      ],
      fingerprint: 'fp-stale',
    })
    await usePlayerStore.getState().playAudiobook(book.id)

    const s = usePlayerStore.getState()
    // currentTrackId is still the old music track (by design — it's the music
    // session's own pointer), but source correctly reflects the live audiobook.
    expect(s.currentTrackId).toBe(tracks[0].id)
    expect(s.source).toBe('audiobook')
    expect(s.nowPlaying?.kind).toBe('audiobook')
  })
})


describe('playback race regressions', () => {
  it('keeps current audio active during the next file read and avoids a startup seek', async () => {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 2)
    await usePlayerStore.getState().playPlaylist(playlist.id)
    const audio = document.querySelector('audio')!
    const blob = await useLibraryStore.getState().getBlob(tracks[1].id)
    let finish!: (value: typeof blob) => void
    vi.spyOn(useLibraryStore.getState(), 'getBlob').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const pause = vi.spyOn(audio, 'pause')
    const seek = vi.spyOn(audio, 'currentTime', 'set')
    const pending = usePlayerStore.getState().next()
    expect(audio.paused).toBe(false)
    expect(usePlayerStore.getState().isPlaying).toBe(true)
    expect(pause).not.toHaveBeenCalled()
    finish(blob)
    await pending
    expect(usePlayerStore.getState().currentTrackId).toBe(tracks[1].id)
    expect(audio.paused).toBe(false)
    // The test media load() resets currentTime once; the player must not seek again.
    expect(seek).toHaveBeenCalledTimes(1)
  })

  it('stops the old track if reading the replacement fails', async () => {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist } = await seedPlaylist(useLibraryStore, 2)
    await usePlayerStore.getState().playPlaylist(playlist.id)
    vi.spyOn(useLibraryStore.getState(), 'getBlob').mockRejectedValueOnce(new Error('Storage failure'))
    await usePlayerStore.getState().next()
    expect(document.querySelector('audio')!.paused).toBe(true)
    expect(usePlayerStore.getState().isPlaying).toBe(false)
    expect(usePlayerStore.getState().playbackError).toContain('Could not open')
  })

  it('keeps the last requested track when older storage reads finish late', async () => {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 3)
    const first = await useLibraryStore.getState().getBlob(tracks[0].id)
    let finish!: (value: typeof first) => void
    vi.spyOn(useLibraryStore.getState(), 'getBlob').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const older = usePlayerStore.getState().playPlaylist(playlist.id, tracks[0].id)
    await usePlayerStore.getState().playPlaylist(playlist.id, tracks[2].id)
    finish(first)
    await older
    expect(usePlayerStore.getState().currentTrackId).toBe(tracks[2].id)
    expect(usePlayerStore.getState().musicQueueIndex).toBe(2)
  })

  it('cancels pending audio when paused for video', async () => {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 1)
    const blob = await useLibraryStore.getState().getBlob(tracks[0].id)
    let finish!: (value: typeof blob) => void
    vi.spyOn(useLibraryStore.getState(), 'getBlob').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const pending = usePlayerStore.getState().playPlaylist(playlist.id)
    usePlayerStore.getState().pause()
    finish(blob)
    await pending
    expect(usePlayerStore.getState().isPlaying).toBe(false)
  })

  it('follows a reordered playlist without restarting the current song', async () => {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 3)
    await usePlayerStore.getState().playPlaylist(playlist.id)
    usePlayerStore.getState().seek(40)
    await useLibraryStore.getState().reorderTracks(playlist.id, [tracks[2].id, tracks[0].id, tracks[1].id])
    usePlayerStore.getState().syncMusicQueue()
    expect(usePlayerStore.getState().currentTime).toBe(40)
    expect(usePlayerStore.getState().musicQueueIndex).toBe(1)
    await usePlayerStore.getState().next()
    expect(usePlayerStore.getState().currentTrackId).toBe(tracks[1].id)
  })

  it('removes a deferred resume seek before another track loads', async () => {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist } = await seedPlaylist(useLibraryStore, 2)
    await usePlayerStore.getState().playPlaylist(playlist.id)
    usePlayerStore.getState().seek(90)
    const audio = document.querySelector('audio')!
    Object.defineProperty(audio, 'readyState', { configurable: true, value: 0 })
    await usePlayerStore.getState().resume()
    await usePlayerStore.getState().next()
    Object.defineProperty(audio, 'readyState', { configurable: true, value: 1 })
    audio.dispatchEvent(new Event('loadedmetadata'))
    expect(audio.currentTime).toBe(0)
    expect(usePlayerStore.getState().currentTime).toBe(0)
  })

  it('rejects non-finite seek and volume inputs', async () => {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist } = await seedPlaylist(useLibraryStore, 1)
    await usePlayerStore.getState().playPlaylist(playlist.id)
    usePlayerStore.getState().seek(NaN)
    usePlayerStore.getState().setVolume(Infinity)
    expect(usePlayerStore.getState().currentTime).toBe(0)
    expect(usePlayerStore.getState().volume).toBe(1)
  })
})

it('restores audio metadata after video and treats repeated system pause as pause', async () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'mediaSession')
  const originalAudioSession = Object.getOwnPropertyDescriptor(navigator, 'audioSession')
  const audioSession = { type: 'auto' }
  Object.defineProperty(navigator, 'audioSession', { configurable: true, value: audioSession })
  const handlers = new Map<string, (() => void) | null>()
  const mediaSession = { metadata: null as { title: string } | null, playbackState: 'none',
    setActionHandler: (action: string, handler: (() => void) | null) => handlers.set(action, handler),
    setPositionState: vi.fn(),
  }
  Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: mediaSession })
  vi.stubGlobal('MediaMetadata', class {
    title: string
    constructor(init: MediaMetadataInit) { this.title = init.title ?? '' }
  })
  const listeners = vi.spyOn(document, 'addEventListener')
  try {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const visibilityChanged = listeners.mock.calls.find(([type]) => type === 'visibilitychange')![1] as EventListener
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 1)
    await usePlayerStore.getState().playPlaylist(playlist.id)
    usePlayerStore.getState().pause()
    mediaSession.metadata = null
    await usePlayerStore.getState().togglePlay()
    expect(mediaSession.metadata).toMatchObject({ title: tracks[0].title })
    const audio = document.querySelector('audio')!
    // A native/background resume must restore controls even without togglePlay.
    usePlayerStore.getState().pause()
    mediaSession.metadata = null
    handlers.clear()
    await audio.play()
    expect(mediaSession.metadata).toMatchObject({ title: tracks[0].title })
    expect(handlers.get('play')).toBeTypeOf('function')

    // Remote Play must reach the media element even with stale UI/paused state.
    audio.pause()
    usePlayerStore.setState({ isPlaying: true })
    handlers.get('play')?.()
    await waitFor(() => expect(audio.paused).toBe(false))
    usePlayerStore.setState({ isPlaying: false })
    const nativePlay = audio.play.bind(audio)
    audioSession.type = 'auto'
    const play = vi.spyOn(audio, 'play').mockImplementation(() => {
      expect(audioSession.type).toBe('playback')
      // Do not replace metadata or publish paused state before the play request.
      expect(mediaSession.metadata).toEqual({ title: 'Existing session' })
      return nativePlay()
    })
    mediaSession.metadata = { title: 'Existing session' }
    handlers.get('play')?.()
    expect(play).toHaveBeenCalledTimes(1)
    expect(audio.paused).toBe(false)
    await waitFor(() => expect(mediaSession.metadata).toMatchObject({ title: tracks[0].title }))
    play.mockRestore()

    usePlayerStore.getState().pause()
    const rejectedPlay = vi.spyOn(audio, 'play').mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'))
    handlers.get('play')?.()
    await waitFor(() => expect(usePlayerStore.getState().playbackError).toContain('Audio could not resume'))
    expect(mediaSession.playbackState).toBe('paused')
    rejectedPlay.mockRestore()
    Object.defineProperty(audioSession, 'type', { set() { throw new Error('Unsupported') } })
    handlers.get('play')?.()
    await waitFor(() => expect(audio.paused).toBe(false))
    expect(usePlayerStore.getState().playbackError).toBeNull()

    mediaSession.metadata = null
    visibilityChanged(new Event('visibilitychange'))
    expect(mediaSession.metadata).toMatchObject({ title: tracks[0].title })
    handlers.get('pause')?.()
    handlers.get('pause')?.()
    // Video owns the session after an explicit audio pause.
    mediaSession.metadata = null
    visibilityChanged(new Event('visibilitychange'))
    expect(mediaSession.metadata).toBeNull()
    expect(usePlayerStore.getState().isPlaying).toBe(false)
  } finally {
    if (original) Object.defineProperty(navigator, 'mediaSession', original)
    else Reflect.deleteProperty(navigator, 'mediaSession')
    if (originalAudioSession) Object.defineProperty(navigator, 'audioSession', originalAudioSession)
    else Reflect.deleteProperty(navigator, 'audioSession')
    vi.unstubAllGlobals()
  }
})

describe('batch music removal', () => {
  it('removes a large inactive queue in one persistence write and keeps the current index', async () => {
    const { db, usePlayerStore } = await freshModules()
    const ids = Array.from({ length: 5000 }, (_, index) => `track-${index}`)
    usePlayerStore.setState({ musicQueue: ids, currentTrackId: ids[4999], musicQueueIndex: 4999 })
    const write = vi.spyOn(db.playerState, 'put')
    usePlayerStore.getState().handleTracksRemoved(ids.slice(0, 4999))
    expect(usePlayerStore.getState().musicQueue).toEqual([ids[4999]])
    expect(usePlayerStore.getState().musicQueueIndex).toBe(0)
    expect(write).toHaveBeenCalledTimes(1)
    usePlayerStore.getState().handleTracksRemoved(['not-in-queue'])
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('releases the active song and saves the cleared session once', async () => {
    const { db, useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 3)
    await usePlayerStore.getState().playPlaylist(playlist.id)
    const write = vi.spyOn(db.playerState, 'put')
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    usePlayerStore.getState().handleTracksRemoved(tracks.map((track) => track.id))
    expect(usePlayerStore.getState()).toMatchObject({ musicQueue: [], currentTrackId: null, isPlaying: false, nowPlaying: null })
    expect(document.querySelector('audio')!.getAttribute('src')).toBeNull()
    expect(revoke).toHaveBeenCalled()
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('clears the inactive music pointer without changing active audiobook playback', async () => {
    const { db, usePlayerStore } = await freshModules()
    const metadata = { title: 'Book', subtitle: 'Chapter', label: 'Book', kind: 'audiobook' as const }
    usePlayerStore.setState({ source: 'audiobook', currentBookId: 'book', currentChapterId: 'chapter',
      currentTime: 42, isPlaying: true, nowPlaying: metadata, currentTrackId: 'song',
      musicQueue: ['song'], musicQueueIndex: 0, musicCurrentTime: 19 })
    const write = vi.spyOn(db.playerState, 'put')
    usePlayerStore.getState().handleTracksRemoved(['song'])
    expect(usePlayerStore.getState()).toMatchObject({ source: 'audiobook', currentBookId: 'book',
      currentChapterId: 'chapter', currentTime: 42, isPlaying: true, nowPlaying: metadata,
      currentTrackId: null, musicQueue: [], musicQueueIndex: -1, musicCurrentTime: 0 })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('cancels a pending deleted song before its storage read completes', async () => {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 1)
    const blob = await useLibraryStore.getState().getBlob(tracks[0].id)
    let finish!: (value: typeof blob) => void
    vi.spyOn(useLibraryStore.getState(), 'getBlob').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const loading = usePlayerStore.getState().playPlaylist(playlist.id)
    usePlayerStore.getState().handleTracksRemoved([tracks[0].id])
    finish(blob)
    await loading
    expect(usePlayerStore.getState()).toMatchObject({ currentTrackId: null, musicQueue: [], isPlaying: false, isLoading: false })
  })
})


it('keeps a pending queue target when an unrelated track is removed before it', async () => {
  const { useLibraryStore, usePlayerStore } = await freshModules()
  const { playlist, tracks } = await seedPlaylist(useLibraryStore, 3)
  await usePlayerStore.getState().playPlaylist(playlist.id)
  const blob = await useLibraryStore.getState().getBlob(tracks[1].id)
  let finish!: (value: typeof blob) => void
  vi.spyOn(useLibraryStore.getState(), 'getBlob').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const loading = usePlayerStore.getState().playPlaylist(playlist.id, tracks[1].id)
  usePlayerStore.getState().handleTracksRemoved([tracks[2].id])
  expect(usePlayerStore.getState().musicQueueIndex).toBe(1)
  usePlayerStore.getState().handleTracksRemoved([tracks[1].id])
  finish(blob)
  await loading
  expect(usePlayerStore.getState()).toMatchObject({ currentTrackId: null, musicQueue: [tracks[0].id], isPlaying: false, isLoading: false })
})

describe('independent remembered sessions on startup', () => {
  it.each(['music', 'audiobook'] as const)('restores both sessions when the last active source was %s', async (source) => {
    const { db, useLibraryStore, useAudiobookStore, usePlayerStore } = await freshModules({ skipPlayerInit: true })
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 2)
    const book = await useAudiobookStore.getState().importBook({ title: 'Remembered book', fingerprint: `restore-${source}`,
      chapters: [1, 2].map((number) => ({ file: new File(['audio'], `chapter-${number}.mp3`), title: `Chapter ${number}`, duration: 120 })),
    })
    const chapters = useAudiobookStore.getState().getChapters(book.id)
    await useAudiobookStore.getState().saveChapterProgress(book.id, chapters[1].id, { position: 22 })
    await db.playerState.put({ id: 'player', source, volume: 1, shuffleEnabled: false, repeatMode: 'off',
      currentPlaylistId: playlist.id, currentTrackId: tracks[1].id, currentTime: 45,
      queue: tracks.map((track) => track.id), queueIndex: 1, currentBookId: book.id })

    await usePlayerStore.getState().init()
    expect(usePlayerStore.getState()).toMatchObject({ currentTrackId: tracks[1].id, musicCurrentTime: 45, musicQueueIndex: 1,
      currentBookId: book.id, currentChapterId: chapters[1].id, currentChapterIndex: 1, bookQueueIndex: 1 })
    await usePlayerStore.getState().restoreSource('music')
    expect(usePlayerStore.getState()).toMatchObject({ source: 'music', currentTime: 45, nowPlaying: { title: tracks[1].title, kind: 'music' }, isPlaying: false })
    expect(useAudiobookStore.getState().getBook(book.id)).toMatchObject({ currentChapterId: chapters[1].id, currentTime: 22, playCount: 0 })
    await usePlayerStore.getState().restoreSource('audiobook')
    expect(usePlayerStore.getState()).toMatchObject({ source: 'audiobook', currentTime: 22, musicCurrentTime: 45,
      currentTrackId: tracks[1].id, nowPlaying: { title: 'Chapter 2', kind: 'audiobook' }, isPlaying: false })
  })

  it.each([null, 'deleted-track'])('switches to empty music when its remembered track is %s without losing the book', async (currentTrackId) => {
    const { db, useAudiobookStore, usePlayerStore } = await freshModules({ skipPlayerInit: true })
    const book = await useAudiobookStore.getState().importBook({ title: 'Only book', fingerprint: `empty-${currentTrackId}`,
      chapters: [{ file: new File(['audio'], 'chapter.mp3'), title: 'Chapter', duration: 120 }],
    })
    const chapter = useAudiobookStore.getState().getChapters(book.id)[0]
    await useAudiobookStore.getState().saveChapterProgress(book.id, chapter.id, { position: 37 })
    await db.playerState.put({ id: 'player', source: 'audiobook', volume: 1, shuffleEnabled: false, repeatMode: 'off',
      currentPlaylistId: null, currentTrackId, currentTime: 45, queue: currentTrackId ? [currentTrackId] : [], queueIndex: 0, currentBookId: book.id })
    await usePlayerStore.getState().init()
    expect(usePlayerStore.getState().nowPlaying?.kind).toBe('audiobook')
    await usePlayerStore.getState().restoreSource('music')
    expect(usePlayerStore.getState()).toMatchObject({ source: 'music', currentTrackId: null, currentTime: 0, nowPlaying: null, canResume: false,
      currentBookId: book.id, currentChapterId: chapter.id, isPlaying: false })
    expect(document.querySelector('audio')!.getAttribute('src')).toBeNull()
    expect(useAudiobookStore.getState().getBook(book.id)?.currentTime).toBe(37)
    await usePlayerStore.getState().restoreSource('audiobook')
    expect(usePlayerStore.getState()).toMatchObject({ source: 'audiobook', currentTime: 37, nowPlaying: { kind: 'audiobook' } })
  })
})
