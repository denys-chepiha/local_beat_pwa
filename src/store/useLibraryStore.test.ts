import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/services/db'
import { useLibraryStore } from '@/store/useLibraryStore'

vi.mock('@/utils/audioFile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/audioFile')>()
  return {
    ...actual,
    extractMetadata: async (file: File) => ({
      title: actual.baseName(file.name), artist: 'Unknown Artist', album: '', duration: 0,
    }),
  }
})

beforeEach(async () => {
  await db.playlists.clear()
  await db.tracks.clear()
  await db.blobs.clear()
  useLibraryStore.setState(useLibraryStore.getInitialState(), true)
})

afterEach(() => vi.restoreAllMocks())

describe('music import', () => {
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
