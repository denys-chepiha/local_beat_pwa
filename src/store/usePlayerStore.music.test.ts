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
  try {
    const { useLibraryStore, usePlayerStore } = await freshModules()
    const { playlist, tracks } = await seedPlaylist(useLibraryStore, 1)
    await usePlayerStore.getState().playPlaylist(playlist.id)
    usePlayerStore.getState().pause()
    mediaSession.metadata = null
    await usePlayerStore.getState().togglePlay()
    expect(mediaSession.metadata).toMatchObject({ title: tracks[0].title })
    handlers.get('pause')?.()
    handlers.get('pause')?.()
    expect(usePlayerStore.getState().isPlaying).toBe(false)
  } finally {
    if (original) Object.defineProperty(navigator, 'mediaSession', original)
    else Reflect.deleteProperty(navigator, 'mediaSession')
    vi.unstubAllGlobals()
  }
})
