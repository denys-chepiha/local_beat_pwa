// Core
import { create } from 'zustand'
// Services
import { db } from '@/services/db'
// Types
import type { Playlist, Track, TrackBlob } from '@/types'
// Utils
import { uid } from '@/utils/id'
import { extractMetadata, isAudioFile } from '@/utils/audioFile'

let importGeneration = 0
let progressOwner = 0

export interface ImportResult {
  added: number
  skipped: string[]
}

interface LibraryState {
  playlists: Playlist[]
  /** All track metadata keyed by id (blobs are loaded on demand). */
  tracks: Record<string, Track>
  loaded: boolean
  /** Progress of an in-flight import, or null when idle. */
  importProgress: { done: number; total: number } | null

  loadAll: () => Promise<void>
  createPlaylist: (name: string) => Promise<Playlist>
  renamePlaylist: (id: string, name: string) => Promise<void>
  deletePlaylist: (id: string) => Promise<void>
  addFiles: (playlistId: string, files: File[]) => Promise<ImportResult>
  removeTrack: (playlistId: string, trackId: string) => Promise<void>
  renameTrack: (trackId: string, title: string) => Promise<void>
  reorderTracks: (playlistId: string, trackIds: string[]) => Promise<void>
  clearAllMusic: () => Promise<void>
  deleteAllPlaylists: () => Promise<void>

  getPlaylist: (id: string) => Playlist | undefined
  getPlaylistTracks: (id: string) => Track[]
  getTrack: (id: string) => Track | undefined
  getBlob: (id: string) => Promise<TrackBlob | undefined>
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  playlists: [],
  tracks: {},
  loaded: false,
  importProgress: null,

  async loadAll() {
    const [playlists, tracks] = await Promise.all([
      db.playlists.orderBy('updatedAt').reverse().toArray(),
      db.tracks.toArray(),
    ])
    const map: Record<string, Track> = {}
    for (const t of tracks) map[t.id] = t
    set({ playlists, tracks: map, loaded: true })
  },

  async createPlaylist(name) {
    const now = Date.now()
    const playlist: Playlist = {
      id: uid(),
      name: name.trim(),
      trackIds: [],
      createdAt: now,
      updatedAt: now,
    }
    await db.playlists.add(playlist)
    set((s) => ({ playlists: [playlist, ...s.playlists] }))
    return playlist
  },

  async renamePlaylist(id, name) {
    const updatedAt = Date.now()
    await db.playlists.update(id, { name: name.trim(), updatedAt })
    set((s) => ({
      playlists: s.playlists.map((p) => (p.id === id ? { ...p, name: name.trim(), updatedAt } : p)),
    }))
  },

  async deletePlaylist(id) {
    const playlist = get().getPlaylist(id)
    const trackIds = playlist?.trackIds ?? []
    await db.transaction('rw', db.playlists, db.tracks, db.blobs, async () => {
      await db.playlists.delete(id)
      await db.tracks.bulkDelete(trackIds)
      await db.blobs.bulkDelete(trackIds)
    })
    set((s) => {
      const tracks = { ...s.tracks }
      for (const tid of trackIds) delete tracks[tid]
      return { playlists: s.playlists.filter((p) => p.id !== id), tracks }
    })
  },

  async addFiles(playlistId, files) {
    const result: ImportResult = { added: 0, skipped: [] }
    const audioFiles = files.filter((f) => {
      if (isAudioFile(f)) return true
      result.skipped.push(f.name)
      return false
    })

    if (audioFiles.length === 0) {
      return result
    }

    const generation = importGeneration
    const owner = ++progressOwner
    const isCurrent = () => generation === importGeneration
    set({ importProgress: { done: 0, total: audioFiles.length } })
    try {
      const newTracks: Track[] = []
      const newBlobs: TrackBlob[] = []

      for (let i = 0; i < audioFiles.length; i++) {
        if (!isCurrent()) return result
        const file = audioFiles[i]
        try {
          const meta = await extractMetadata(file)
          if (!isCurrent()) return result
          const id = uid()
          newTracks.push({
            id,
            playlistId,
            title: meta.title,
            artist: meta.artist,
            album: meta.album,
            duration: meta.duration,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || 'audio/mpeg',
            hasCover: !!meta.cover,
            createdAt: Date.now(),
          })
          newBlobs.push({ id, blob: file, cover: meta.cover })
        } catch {
          if (!isCurrent()) return result
          result.skipped.push(file.name)
        }
        if (owner === progressOwner) {
          set({ importProgress: { done: i + 1, total: audioFiles.length } })
        }
      }

      if (newTracks.length > 0) {
        const updatedAt = Date.now()
        const ids = newTracks.map((t) => t.id)
        const saved = await db.transaction('rw', db.tracks, db.blobs, db.playlists, async () => {
          const playlist = await db.playlists.get(playlistId)
          if (!isCurrent()) return false
          if (!playlist) throw new Error('Playlist was deleted during import')
          await db.tracks.bulkAdd(newTracks)
          await db.blobs.bulkAdd(newBlobs)
          if (playlist) {
            await db.playlists.update(playlistId, {
              trackIds: [...ids, ...playlist.trackIds],
              updatedAt,
            })
          }
          return true
        })
        if (!saved || !isCurrent()) return result
        result.added = newTracks.length
        set((s) => {
          const tracks = { ...s.tracks }
          for (const t of newTracks) tracks[t.id] = t
          return {
            tracks,
            playlists: s.playlists.map((p) =>
              p.id === playlistId
                ? { ...p, trackIds: [...ids, ...p.trackIds], updatedAt }
                : p,
            ),
          }
        })
      }

      return result
    } finally {
      if (owner === progressOwner) set({ importProgress: null })
    }
  },

  async removeTrack(playlistId, trackId) {
    const updatedAt = Date.now()
    await db.transaction('rw', db.tracks, db.blobs, db.playlists, async () => {
      await db.tracks.delete(trackId)
      await db.blobs.delete(trackId)
      const playlist = await db.playlists.get(playlistId)
      if (playlist) {
        await db.playlists.update(playlistId, {
          trackIds: playlist.trackIds.filter((id) => id !== trackId),
          updatedAt,
        })
      }
    })
    set((s) => {
      const tracks = { ...s.tracks }
      delete tracks[trackId]
      return {
        tracks,
        playlists: s.playlists.map((p) =>
          p.id === playlistId
            ? { ...p, trackIds: p.trackIds.filter((id) => id !== trackId), updatedAt }
            : p,
        ),
      }
    })
  },

  async renameTrack(trackId, title) {
    const name = title.trim()
    if (!name) return
    await db.tracks.update(trackId, { title: name })
    set((s) => {
      const track = s.tracks[trackId]
      if (!track) return {}
      return { tracks: { ...s.tracks, [trackId]: { ...track, title: name } } }
    })
  },

  async reorderTracks(playlistId, trackIds) {
    const updatedAt = Date.now()
    await db.playlists.update(playlistId, { trackIds, updatedAt })
    set((s) => ({
      playlists: s.playlists.map((p) =>
        p.id === playlistId ? { ...p, trackIds, updatedAt } : p,
      ),
    }))
  },

  async clearAllMusic() {
    importGeneration++
    progressOwner++
    set({ importProgress: null })
    const updatedAt = Date.now()
    await db.transaction('rw', db.tracks, db.blobs, db.playlists, async () => {
      await db.tracks.clear()
      await db.blobs.clear()
      const playlists = await db.playlists.toArray()
      await Promise.all(
        playlists.map((p) => db.playlists.update(p.id, { trackIds: [], updatedAt })),
      )
    })
    set((s) => ({
      tracks: {},
      playlists: s.playlists.map((p) => ({ ...p, trackIds: [], updatedAt })),
    }))
  },

  async deleteAllPlaylists() {
    importGeneration++
    progressOwner++
    set({ importProgress: null })
    await db.transaction('rw', db.tracks, db.blobs, db.playlists, async () => {
      await db.tracks.clear()
      await db.blobs.clear()
      await db.playlists.clear()
    })
    set({ tracks: {}, playlists: [] })
  },

  getPlaylist(id) {
    return get().playlists.find((p) => p.id === id)
  },

  getPlaylistTracks(id) {
    const { playlists, tracks } = get()
    const playlist = playlists.find((p) => p.id === id)
    if (!playlist) return []
    return playlist.trackIds.map((tid) => tracks[tid]).filter(Boolean) as Track[]
  },

  getTrack(id) {
    return get().tracks[id]
  },

  async getBlob(id) {
    return db.blobs.get(id)
  },
}))
