// Types
import type { StateStorage } from 'zustand/middleware'

/** Preference failures must not interrupt playback or navigation. Media stays in IndexedDB. */
export const browserStorage: StateStorage = {
  getItem: (name) => { try { return window.localStorage.getItem(name) } catch { return null } },
  setItem: (name, value) => { try { window.localStorage.setItem(name, value) } catch { /* The session remains usable when preference storage is unavailable. */ } },
  removeItem: (name) => { try { window.localStorage.removeItem(name) } catch { /* Unavailable browser storage. */ } },
}
