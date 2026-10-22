export type RepeatMode = 'off' | 'one' | 'all'

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
  createdAt: number
  updatedAt: number
}

/**
 * Lightweight track record stored in the `tracks` table. The actual audio data
 * and cover art live separately in the `blobs` table so that listing tracks
 * never forces large Blobs into memory.
 */
export interface Track {
  id: string
  playlistId: string
  title: string
  artist: string
  album: string
  duration: number
  fileName: string
  fileSize: number
  mimeType: string
  hasCover: boolean
  createdAt: number
}

/** Heavy payload kept out of the metadata table. */
export interface TrackBlob {
  id: string
  blob: Blob
  cover?: Blob
}

export type PlaybackSource = 'music' | 'audiobook'

export interface PlayerState {
  id: 'player'
  /** Which of the two independent sessions below was active when the app closed. */
  source: PlaybackSource
  volume: number
  shuffleEnabled: boolean
  repeatMode: RepeatMode
  // -- Last music session (only touched while source === 'music') --
  currentPlaylistId: string | null
  currentTrackId: string | null
  currentTime: number
  queue: string[]
  queueIndex: number
  // -- Last audiobook session (only touched while source === 'audiobook') --
  // The book's own record (see `Audiobook`) is the source of truth for chapter/
  // position; this just remembers *which* book to resume into.
  currentBookId: string | null
}

export type AudiobookStatus = 'not_started' | 'in_progress' | 'completed'

/**
 * Book-level metadata and aggregate progress. Chapter-level data lives in
 * `AudiobookChapter`; the heavy audio/cover payloads live in `AudiobookBlob`.
 */
export interface Audiobook {
  id: string
  title: string
  author?: string

  coverBlobId?: string
  coverThumbnailBlobId?: string

  status: AudiobookStatus

  currentChapterId?: string
  currentChapterIndex: number
  currentTime: number

  totalDuration: number
  listenedDuration: number
  progressPercent: number

  playCount: number
  totalListeningTime: number

  /** Identifies re-imports of the same folder so duplicates can be detected. */
  fingerprint: string

  createdAt: number
  updatedAt: number
  lastOpenedAt?: number
  lastListenedAt?: number
  completedAt?: number
}

export interface AudiobookChapter {
  id: string
  bookId: string

  title: string
  fileName: string
  relativePath?: string
  mimeType: string
  size: number

  order: number
  duration: number

  audioBlobId: string

  completed: boolean
  lastPosition: number

  createdAt: number
}

/** Heavy payload (chapter audio or book cover) kept out of the metadata tables. */
export interface AudiobookBlob {
  id: string
  blob: Blob
}
