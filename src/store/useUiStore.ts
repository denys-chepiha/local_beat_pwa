// Core
import { create } from 'zustand'

export type AppSection = 'music' | 'audiobooks' | 'video'

export type Screen =
  | { name: 'video' }
  | { name: 'home' }
  | { name: 'playlist'; playlistId: string }
  | { name: 'settings' }
  | { name: 'audiobooks' }
  | { name: 'audiobook'; bookId: string }

const SECTION_BY_SCREEN: Record<Screen['name'], AppSection> = {
  home: 'music',
  video: 'video',
  playlist: 'music',
  settings: 'music',
  audiobooks: 'audiobooks',
  audiobook: 'audiobooks',
}

interface UiState {
  screen: Screen
  fullPlayerOpen: boolean
  toast: string | null
  openVideo: () => void
  goHome: () => void
  openPlaylist: (playlistId: string) => void
  openSettings: () => void
  openAudiobookLibrary: () => void
  openAudiobook: (bookId: string) => void
  openFullPlayer: () => void
  closeFullPlayer: () => void
  showToast: (message: string) => void
}

let toastTimer: ReturnType<typeof setTimeout> | null = null

export const useUiStore = create<UiState>((set) => ({
  screen: { name: 'home' },
  fullPlayerOpen: false,
  toast: null,
  openVideo: () => set({ screen: { name: 'video' }, fullPlayerOpen: false }),
  goHome: () => set({ screen: { name: 'home' } }),
  openPlaylist: (playlistId) => set({ screen: { name: 'playlist', playlistId } }),
  openSettings: () => set({ screen: { name: 'settings' } }),
  openAudiobookLibrary: () => set({ screen: { name: 'audiobooks' } }),
  openAudiobook: (bookId) => set({ screen: { name: 'audiobook', bookId } }),
  openFullPlayer: () => set({ fullPlayerOpen: true }),
  closeFullPlayer: () => set({ fullPlayerOpen: false }),
  showToast: (message) => {
    set({ toast: message })
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => set({ toast: null }), 3200)
  },
}))

/** Which top-level section (Music / Audio Books) a screen belongs to. */
export function sectionOfScreen(screen: Screen): AppSection {
  return SECTION_BY_SCREEN[screen.name]
}
