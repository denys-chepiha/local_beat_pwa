// Core
import { create } from 'zustand'
import type { SetStateAction } from 'react'

export type VideoEntry = { id: number; file: File }
interface VideoSession {
  entries: VideoEntry[]
  activeId: number | null
  setEntries: (next: SetStateAction<VideoEntry[]>) => void
  setActiveId: (id: number | null) => void
}

// Deliberately not persisted: File references survive navigation, never a reload.
export const useVideoSession = create<VideoSession>((set) => ({
  entries: [],
  activeId: null,
  setEntries: (next) => set((s) => ({ entries: typeof next === 'function' ? next(s.entries) : next })),
  setActiveId: (activeId) => set({ activeId }),
}))
