// Core
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { SetStateAction } from 'react'
// Services
import { db } from '@/services/db'

// Utils
import { browserStorage } from '@/utils/browserStorage/browserStorage'

export type VideoEntry = { id: number; file: File }
type Progress = { time: number; completed: boolean }
interface VideoSession {
  entries: VideoEntry[]
  activeId: number | null
  progress: Record<number, Progress>
  loaded: boolean
  storageError: string | null
  hydrate: () => Promise<void>
  setEntries: (next: SetStateAction<VideoEntry[]>) => Promise<void>
  setActiveId: (id: number | null) => void
  saveProgress: (id: number, time: number, completed?: boolean) => void
  flushProgress: () => void
}

const PROGRESS_INTERVAL_MS = 4000
let writes = Promise.resolve()
let hydration: Promise<void> | null = null
let savedEntries: VideoEntry[] = []
let mutationVersion = 0
let progressTimer: ReturnType<typeof setTimeout> | null = null
const pendingProgress = new Map<number, Progress>()

export const useVideoSession = create<VideoSession>()(persist((set, get) => ({
  entries: [], activeId: null, progress: {}, loaded: false, storageError: null,

  hydrate: () => {
    if (get().loaded) return Promise.resolve()
    if (hydration) return hydration
    hydration = (async () => {
      try {
        await writes
        const entries = await db.videoFiles.toArray()
        savedEntries = entries
        const ids = new Set(entries.map((entry) => entry.id))
        const progress = Object.fromEntries(Object.entries(get().progress).filter(([id]) => ids.has(Number(id))))
        set({ entries, progress, loaded: true, storageError: null,
          activeId: ids.has(get().activeId!) ? get().activeId : entries[0]?.id ?? null })
      } catch {
        set({ storageError: 'Could not restore videos. Check available device storage and try again.' })
      } finally {
        hydration = null
      }
    })()
    return hydration
  },

  setEntries: (next) => {
    get().flushProgress()
    const entries = typeof next === 'function' ? next(get().entries) : next
    const version = ++mutationVersion
    set({ entries })
    // Diff the committed database, not the optimistic UI: a later retry must
    // include files from any earlier failed addition.
    writes = writes.then(async () => {
      try {
        await db.transaction('rw', db.videoFiles, async () => {
          const existingIds = await db.videoFiles.toCollection().primaryKeys()
          const existing = new Set(existingIds)
          const wanted = new Set(entries.map((entry) => entry.id))
          const removed = existingIds.filter((id) => !wanted.has(id))
          const added = entries.filter((entry) => !existing.has(entry.id))
          if (removed.length) await db.videoFiles.bulkDelete(removed)
          if (added.length) await db.videoFiles.bulkPut(added)
        })
        savedEntries = entries
        if (version === mutationVersion) {
          const ids = new Set(entries.map((entry) => entry.id))
          const progress = Object.fromEntries(Object.entries(get().progress).filter(([id]) => ids.has(Number(id))))
          set({ progress, storageError: null })
        }
      } catch {
        if (version === mutationVersion) {
          // Keep unsuccessful additions available for retry and restore files
          // whose deletion failed, so the visible playlist reflects that failure.
          const ids = new Set(entries.map((entry) => entry.id))
          const restored = [...entries, ...savedEntries.filter((entry) => !ids.has(entry.id))]
          set({ entries: restored, activeId: get().activeId ?? restored[0]?.id ?? null })
        }
        set({ storageError: 'Video changes could not be saved. Check device storage and try adding or removing the files again.' })
      }
    })
    return writes
  },

  setActiveId: (activeId) => {
    get().flushProgress()
    set({ activeId })
  },

  saveProgress: (id, time, completed = false) => {
    if (!Number.isFinite(time) || !get().entries.some((entry) => entry.id === id)) return
    const previous = pendingProgress.get(id) ?? get().progress[id]
    const next = { time: Math.max(0, time), completed: completed || !!previous?.completed }
    if (previous?.time === next.time && previous.completed === next.completed) return
    pendingProgress.set(id, next)
    if (completed) get().flushProgress()
    else if (!progressTimer) progressTimer = setTimeout(() => get().flushProgress(), PROGRESS_INTERVAL_MS)
  },

  flushProgress: () => {
    if (progressTimer) clearTimeout(progressTimer)
    progressTimer = null
    if (!pendingProgress.size) return
    const ids = new Set(get().entries.map((entry) => entry.id))
    const progress = { ...get().progress }
    for (const [id, value] of pendingProgress) if (ids.has(id)) progress[id] = value
    pendingProgress.clear()
    set({ progress })
  },
}), { name: 'local-beat-video-session', storage: createJSONStorage(() => browserStorage), partialize: (s) => ({ activeId: s.activeId, progress: s.progress }) }))
