// Core
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Services
import { db } from '@/services/db'
import { useLibraryStore } from '@/store/useLibraryStore'
// Types
import type { ExtractedMeta } from '@/utils/audioFile'
// Utils
import { baseName, extractMetadata } from '@/utils/audioFile'

vi.mock('@/utils/audioFile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/audioFile')>()
  return {
    ...actual,
    extractMetadata: vi.fn(async (file: File) => ({
      title: actual.baseName(file.name), artist: 'Unknown Artist', album: '', duration: 0,
    })),
  }
})

beforeEach(async () => {
  await db.playlists.clear()
  await db.tracks.clear()
  await db.blobs.clear()
  useLibraryStore.setState(useLibraryStore.getInitialState(), true)
  vi.mocked(extractMetadata).mockReset().mockImplementation(async (file) => ({
    title: baseName(file.name), artist: 'Unknown Artist', album: '', duration: 0,
  }))
})

afterEach(() => vi.restoreAllMocks())

describe('music import', () => {
  it.each(['clearAllMusic', 'deleteAllPlaylists'] as const)(
    '%s discards pending metadata and never reads the remaining files',
    async (reset) => {
      const playlist = await useLibraryStore.getState().createPlaylist('Pending')
      let finishMetadata!: (metadata: ExtractedMeta) => void
      vi.mocked(extractMetadata)
        .mockResolvedValueOnce({ title: 'Prepared', artist: '', album: '', duration: 1 })
        .mockImplementationOnce(() => new Promise((resolve) => {
          finishMetadata = resolve
        }))
      const pending = useLibraryStore.getState().addFiles(playlist.id, [
        new File(['audio'], 'prepared.mp3'),
        new File(['audio'], 'pending.mp3'),
        new File(['audio'], 'unopened.mp3'),
      ])
      await Promise.resolve()

      await useLibraryStore.getState()[reset]()
      expect(useLibraryStore.getState().importProgress).toBeNull()
      finishMetadata({ title: 'Pending', artist: '', album: '', duration: 1 })

      expect(await pending).toEqual({ added: 0, skipped: [] })
      expect(extractMetadata).toHaveBeenCalledTimes(2)
      expect(await db.tracks.count()).toBe(0)
      expect(await db.blobs.count()).toBe(0)
      expect(useLibraryStore.getState().tracks).toEqual({})
      expect(useLibraryStore.getState().importProgress).toBeNull()
      expect(await db.playlists.count()).toBe(reset === 'clearAllMusic' ? 1 : 0)
    },
  )

  it('an invalidated import cannot clear a newer import progress indicator', async () => {
    const playlist = await useLibraryStore.getState().createPlaylist('Retry')
    const finishMetadata: ((metadata: ExtractedMeta) => void)[] = []
    vi.mocked(extractMetadata).mockImplementation(() => new Promise((resolve) => {
      finishMetadata.push(resolve)
    }))
    const oldImport = useLibraryStore.getState().addFiles(playlist.id, [new File(['audio'], 'old.mp3')])
    await useLibraryStore.getState().clearAllMusic()
    const newImport = useLibraryStore.getState().addFiles(playlist.id, [new File(['audio'], 'new.mp3')])

    finishMetadata[0]({ title: 'Old', artist: '', album: '', duration: 1 })
    await oldImport
    expect(useLibraryStore.getState().importProgress).toEqual({ done: 0, total: 1 })

    finishMetadata[1]({ title: 'New', artist: '', album: '', duration: 2 })
    expect(await newImport).toEqual({ added: 1, skipped: [] })
    expect(useLibraryStore.getState().getPlaylistTracks(playlist.id).map((track) => track.title)).toEqual(['New'])
    expect(await db.blobs.count()).toBe(1)
    expect(useLibraryStore.getState().importProgress).toBeNull()
  })

  it('saves audio with missing metadata and generic provider MIME types', async () => {
    const playlist = await useLibraryStore.getState().createPlaylist('Android files')
    const result = await useLibraryStore.getState().addFiles(playlist.id, [
      new File(['audio'], 'Song.MP3', { type: 'application/octet-stream' }),
      new File(['audio'], 'Other.m4a'),
      new File(['text'], 'notes.txt'),
    ])

    expect(result).toEqual({ added: 2, skipped: ['notes.txt'] })
    expect(useLibraryStore.getState().getPlaylistTracks(playlist.id).map((track) => track.title)).toEqual(['Song', 'Other'])
    expect(await db.blobs.count()).toBe(2)
    expect(useLibraryStore.getState().importProgress).toBeNull()
  })

  it('rolls back a storage failure, clears progress, and allows retrying', async () => {
    const playlist = await useLibraryStore.getState().createPlaylist('Retry')
    const files = [new File(['audio'], 'song.mp3')]
    vi.spyOn(db.blobs, 'bulkAdd').mockRejectedValueOnce(new Error('Storage full'))

    await expect(useLibraryStore.getState().addFiles(playlist.id, files)).rejects.toThrow('Storage full')
    expect(useLibraryStore.getState().importProgress).toBeNull()
    expect(useLibraryStore.getState().getPlaylistTracks(playlist.id)).toEqual([])
    expect(await db.tracks.count()).toBe(0)
    expect(await db.blobs.count()).toBe(0)

    expect(await useLibraryStore.getState().addFiles(playlist.id, files)).toEqual({ added: 1, skipped: [] })
    expect(useLibraryStore.getState().getPlaylistTracks(playlist.id)).toHaveLength(1)
  })
})

it('does not leave orphaned media when a playlist disappears before import commits', async () => {
  await expect(useLibraryStore.getState().addFiles('deleted', [new File(['audio'], 'song.mp3')])).rejects.toThrow('Playlist was deleted')
  expect(await db.blobs.count()).toBe(0)
  expect(await db.tracks.count()).toBe(0)
})
