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
  hydrate: () => Promise<void>
  setEntries: (next: SetStateAction<VideoEntry[]>) => void
  setActiveId: (id: number | null) => void
  saveProgress: (id: number, time: number, completed?: boolean) => void
}
let writes = Promise.resolve()
export const useVideoSession = create<VideoSession>()(persist((set, get) => ({
  entries: [], activeId: null, progress: {}, storageError: null,
  hydrate: async () => {
    try {
      const entries = await db.videoFiles.toArray()
      set({ entries, activeId: entries.some((e) => e.id === get().activeId) ? get().activeId : entries[0]?.id ?? null })
    } catch { set({ storageError: 'Could not restore videos. Check available device storage.' }) }
  },
  setEntries: (next) => {
    const entries = typeof next === 'function' ? next(get().entries) : next
    const previous = get().entries
    set({ entries })
    // Serialize mutations; progress writes never copy large video blobs.
    writes = writes.then(() => db.transaction('rw', db.videoFiles, async () => {
      await db.videoFiles.bulkDelete(previous.filter((e) => !entries.some((n) => n.id === e.id)).map((e) => e.id))
      await db.videoFiles.bulkPut(entries.filter((e) => !previous.some((p) => p.id === e.id)))
    })).then(() => { set({ storageError: null }) }).catch(() => {
      set({ storageError: 'Videos could not be saved for next time. Free device storage and add them again.' })
    })
  },
  setActiveId: (activeId) => set({ activeId }),
  saveProgress: (id, time, completed = false) => {
    if (!Number.isFinite(time)) return
    set((s) => ({ progress: { ...s.progress, [id]: { time: Math.max(0, time), completed: completed || !!s.progress[id]?.completed } } }))
  },
}), { name: 'local-beat-video-session', partialize: (s) => ({ activeId: s.activeId, progress: s.progress }) }))
