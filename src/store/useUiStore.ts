// Core
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
// Utils
import { browserStorage } from '@/utils/browserStorage/browserStorage'

export type AppSection = 'music' | 'audiobooks' | 'reader' | 'video'

export type Screen =
  | { name: 'video' }
  | { name: 'reader'; bookId?: string }
  | { name: 'home' }
  | { name: 'playlist'; playlistId: string }
  | { name: 'settings' }
  | { name: 'audiobooks' }
  | { name: 'audiobook'; bookId: string }

const SECTION_BY_SCREEN: Record<Screen['name'], AppSection> = {
  home: 'music',
  video: 'video',
  reader: 'reader',
  playlist: 'music',
  settings: 'music',
  audiobooks: 'audiobooks',
  audiobook: 'audiobooks',
}

interface UiState {
  screen: Screen
  lastScreens: Partial<Record<AppSection, Screen>>
  switchSection: (section: AppSection) => void
  fullPlayerOpen: boolean
  toast: string | null
  openReader: (bookId?: string) => void
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

export const useUiStore = create<UiState>()(persist((set, get) => ({
  screen: { name: 'home' },
  lastScreens: {},
  switchSection: (section) => {
    const s = get()
    if (sectionOfScreen(s.screen) === section) return
    const lastScreens = { ...s.lastScreens, [sectionOfScreen(s.screen)]: s.screen }
    const fallback: Screen = section === 'reader' ? { name: 'reader' } : section === 'video' ? { name: 'video' } : section === 'music' ? { name: 'home' } : { name: 'audiobooks' }
    set({ lastScreens, screen: lastScreens[section] ?? fallback, fullPlayerOpen: false })
  },
  fullPlayerOpen: false,
  toast: null,
  openReader: (bookId) => set({ screen: { name: 'reader', ...(bookId ? { bookId } : {}) }, fullPlayerOpen: false }),
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
}), {
  name: 'local-beat-navigation',
  storage: createJSONStorage(() => browserStorage),
  partialize: (s) => ({ lastScreens: { ...s.lastScreens, [sectionOfScreen(s.screen)]: s.screen } }),
  merge: (persisted, current) => {
    const saved = persisted as { lastScreens?: Partial<Record<AppSection, Screen>> } | undefined
    const lastScreens: Partial<Record<AppSection, Screen>> = {}
    for (const section of ['music', 'audiobooks', 'reader', 'video'] as const) {
      const screen = saved?.lastScreens?.[section]
      if (screen && typeof screen.name === 'string' && sectionOfScreen(screen) === section &&
        (screen.name !== 'playlist' || typeof screen.playlistId === 'string') &&
        (screen.name !== 'audiobook' || typeof screen.bookId === 'string') &&
        (screen.name !== 'reader' || screen.bookId === undefined || typeof screen.bookId === 'string')) lastScreens[section] = screen
    }
    return { ...current, lastScreens, screen: { name: 'home' }, fullPlayerOpen: false }
  },
}))

/** Map each screen to its top-level navigation tab. */
export function sectionOfScreen(screen: Screen): AppSection {
  return SECTION_BY_SCREEN[screen.name]
}
