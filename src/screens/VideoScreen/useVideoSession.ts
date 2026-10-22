import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SetStateAction } from 'react'
import { db } from '@/services/db'

export type VideoEntry = { id: number; file: File }
type Progress = { time: number; completed: boolean }
interface VideoSession {
  entries: VideoEntry[]
  activeId: number | null
  progress: Record<number, Progress>
  storageError: string | null
  saving: boolean
  retrySave: () => Promise<void>
  hydrate: () => Promise<void>
  setEntries: (next: SetStateAction<VideoEntry[]>) => void
  setActiveId: (id: number | null) => void
  saveProgress: (id: number, time: number, completed?: boolean) => void
}
let writes = Promise.resolve()
export const useVideoSession = create<VideoSession>()(persist((set, get) => ({
  entries: [], activeId: null, progress: {}, storageError: null, saving: false,
  hydrate: async () => {
    try {
      const entries = await db.videoFiles.toArray()
      set({ entries, activeId: entries.some((e) => e.id === get().activeId) ? get().activeId : entries[0]?.id ?? null })
    } catch { set({ storageError: 'Could not restore videos. Check available device storage.' }) }
  },
  setEntries: (next) => {
    const entries = typeof next === 'function' ? next(get().entries) : next
    set({ entries })
    void get().retrySave()
  },
  retrySave: () => {
    // Reconcile against the database, not the in-memory playlist: a previous
    // failed write must remain eligible for retry. Each file commits separately.
    writes = writes.then(async () => {
      const entries = get().entries.slice()
      set({ saving: true })
      try {
        const stored = new Set(await db.videoFiles.toCollection().primaryKeys())
        await db.videoFiles.bulkDelete([...stored].filter((id) => !entries.some((entry) => entry.id === id)))
        const failures: { name: string; error: unknown }[] = []
        for (const entry of entries) {
          if (stored.has(entry.id)) continue
          try { await db.videoFiles.put(entry) }
          catch (error) { failures.push({ name: entry.file.name, error }) }
        }
        if (!failures.length) set({ storageError: null })
        else {
          const first = failures[0]
          const error = first.error as { name?: string; inner?: { name?: string } }
          const kind = error?.inner?.name ?? error?.name ?? 'StorageError'
          const reason = kind === 'QuotaExceededError'
            ? 'Device storage is full. Remove saved videos you no longer need, then retry.'
            : kind === 'NotReadableError' || kind === 'DataCloneError'
              ? 'The selected file could not be copied. Download it to this device first, then remove and add it again.'
              : `Local storage could not complete the save (${kind}). Retry when the app is in the foreground.`
          set({ storageError: `${failures.length} video(s) not saved for next time: ${first.name}. ${reason} You can keep watching in this session.` })
        }
      } catch (error) {
        const kind = (error as { name?: string })?.name ?? 'StorageError'
        set({ storageError: `Video storage is unavailable (${kind}). Retry saving; current playback is still available.` })
      } finally { set({ saving: false }) }
    })
    return writes
  },
  setActiveId: (activeId) => set({ activeId }),
  saveProgress: (id, time, completed = false) => {
    if (!Number.isFinite(time)) return
    set((s) => ({ progress: { ...s.progress, [id]: { time: Math.max(0, time), completed: completed || !!s.progress[id]?.completed } } }))
  },
}), { name: 'local-beat-video-session', partialize: (s) => ({ activeId: s.activeId, progress: s.progress }) }))
