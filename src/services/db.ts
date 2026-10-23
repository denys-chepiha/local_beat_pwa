// Core
import Dexie from 'dexie'
import type { VideoEntry } from '@/screens/VideoScreen/useVideoSession'
import type { Table } from 'dexie'
// Types
import type { ReaderBook, ReaderPayload } from '@/reader/types'
import type {
  Playlist,
  Track,
  TrackBlob,
  PlayerState,
  Audiobook,
  AudiobookChapter,
  AudiobookBlob,
} from '@/types'

/**
 * IndexedDB layer. Playlists, track metadata, the raw audio blobs and the
 * persisted player state all live here. The Cache API (service worker) only
 * ever stores the app shell — never audio files.
 *
 * Audiobooks get their own tables (v2) so the two libraries never collide and
 * a migration here can never touch existing music data.
 */
class LocalBeatDB extends Dexie {
  readerBooks!: Table<ReaderBook, string>
  readerFiles!: Table<ReaderPayload, string>
  readerCovers!: Table<ReaderPayload, string>
  videoFiles!: Table<VideoEntry, number>
  playlists!: Table<Playlist, string>
  tracks!: Table<Track, string>
  blobs!: Table<TrackBlob, string>
  playerState!: Table<PlayerState, string>
  audiobooks!: Table<Audiobook, string>
  audiobookChapters!: Table<AudiobookChapter, string>
  audiobookBlobs!: Table<AudiobookBlob, string>

  constructor() {
    super('local-beat')
    this.version(1).stores({
      playlists: 'id, name, updatedAt',
      tracks: 'id, playlistId, createdAt',
      blobs: 'id',
      playerState: 'id',
    })
    // v2: additive only — adds audiobook tables, touches nothing music-related.
    this.version(2).stores({
      playlists: 'id, name, updatedAt',
      tracks: 'id, playlistId, createdAt',
      blobs: 'id',
      playerState: 'id',
      audiobooks: 'id, status, updatedAt, lastListenedAt, fingerprint',
      audiobookChapters: 'id, bookId, order',
      audiobookBlobs: 'id',
    })
    this.version(3).stores({ videoFiles: 'id' })
    this.version(4).stores({
      readerBooks: 'id, title, addedAt, lastReadAt, &fingerprint',
      readerFiles: 'id',
      readerCovers: 'id',
    })
  }
}

export const db = new LocalBeatDB()

/** Total bytes used by stored music audio (metadata + cover overhead ignored). */
export async function estimateStorageBytes(): Promise<number> {
  const tracks = await db.tracks.toArray()
  return tracks.reduce((sum, t) => sum + (t.fileSize || 0), 0)
}

/** Total bytes used by stored audiobook audio (cover overhead ignored). */
export async function estimateAudiobookStorageBytes(): Promise<number> {
  const chapters = await db.audiobookChapters.toArray()
  return chapters.reduce((sum, c) => sum + (c.size || 0), 0)
}

/** Device-wide storage quota/usage, when the browser exposes it. */
export async function estimateDeviceStorage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  try {
    const { usage, quota } = await navigator.storage.estimate()
    if (usage == null || quota == null) return null
    return { usage, quota }
  } catch {
    return null
  }
}
