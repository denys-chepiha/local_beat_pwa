// Core
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { SetStateAction } from 'react'
// Services
import { db } from '@/services/db'

// Utils
import { browserStorage } from '@/utils/browserStorage/browserStorage'

export type VideoEntry = { id: number; file: File }
export type VideoRepeat = 'off' | 'all' | 'one'
type Progress = { time: number; completed: boolean }
interface VideoSession {
  entries: VideoEntry[]
  activeId: number | null
  progress: Record<number, Progress>
  repeat: VideoRepeat
  loaded: boolean
  storageError: string | null
  saving: boolean
  retrySave: () => Promise<void>
  hydrate: () => Promise<void>
  setEntries: (next: SetStateAction<VideoEntry[]>) => Promise<void>
  setActiveId: (id: number | null) => void
  setRepeat: (repeat: VideoRepeat) => void
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
  entries: [], activeId: null, progress: {}, repeat: 'off', loaded: false, storageError: null, saving: false,

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

  retrySave: () => get().setEntries((entries) => entries),

  setEntries: (next) => {
    get().flushProgress()
    const entries = typeof next === 'function' ? next(get().entries) : next
    const version = ++mutationVersion
    set({ entries })
    // Diff the committed database, not the optimistic UI: a later retry must
    // include files from any earlier failed addition.
    writes = writes.then(async () => {
      set({ saving: true })
      try {
        const existingIds = await db.videoFiles.toCollection().primaryKeys()
        const existing = new Set(existingIds)
        const wanted = new Set(entries.map((entry) => entry.id))
        const removed = existingIds.filter((id) => !wanted.has(id))
        if (removed.length) await db.videoFiles.bulkDelete(removed)
        const failures: { name: string; error: unknown }[] = []
        for (const entry of entries) {
          if (existing.has(entry.id)) continue
          try { await db.videoFiles.put(entry) }
          catch (error) { failures.push({ name: entry.file.name, error }) }
        }
        savedEntries = await db.videoFiles.toArray()
        if (version === mutationVersion) {
          const ids = new Set(entries.map((entry) => entry.id))
          const progress = Object.fromEntries(Object.entries(get().progress).filter(([id]) => ids.has(Number(id))))
          let storageError: string | null = null
          if (failures.length) {
            const first = failures[0]
            const error = first.error as { name?: string; inner?: { name?: string } }
            const kind = error?.inner?.name ?? error?.name ?? 'StorageError'
            const reason = kind === 'QuotaExceededError'
              ? 'Device storage is full. Remove saved videos you no longer need, then retry.'
              : kind === 'NotReadableError' || kind === 'DataCloneError'
                ? 'The selected file could not be copied. Download it to this device first, then remove and add it again.'
                : `Local storage could not complete the save (${kind}). Retry when the app is in the foreground.`
            storageError = `${failures.length} video(s) not saved for next time: ${first.name}. ${reason} You can keep watching in this session.`
          }
          set({ progress, storageError })
        }
      } catch {
        if (version === mutationVersion) {
          // Keep unsuccessful additions available for retry and restore files
          // whose deletion failed, so the visible playlist reflects that failure.
          const ids = new Set(entries.map((entry) => entry.id))
          const restored = [...entries, ...savedEntries.filter((entry) => !ids.has(entry.id))]
          set({ entries: restored, activeId: get().activeId ?? restored[0]?.id ?? null,
            storageError: 'Video changes could not be saved. Check device storage and retry saving.' })
        }
      } finally { set({ saving: false }) }
    })
    return writes
  },

  setActiveId: (activeId) => {
    get().flushProgress()
    set({ activeId })
  },

  setRepeat: (repeat) => set({ repeat }),

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
}), { name: 'local-beat-video-session', storage: createJSONStorage(() => browserStorage), partialize: (s) => ({ activeId: s.activeId, progress: s.progress, repeat: s.repeat }) }))
