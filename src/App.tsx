// Core
import { useEffect, useState } from 'react'
// Components
import SectionSwitcher from '@/components/SectionSwitcher'
import ChepioTechFooter from '@/components/ChepioTechFooter/ChepioTechFooter'
import MiniPlayer from '@/components/MiniPlayer'
import FullPlayer from '@/components/FullPlayer'
// Screens
import { useVideoSession } from '@/screens/VideoScreen/useVideoSession'
import VideoScreen from '@/screens/VideoScreen/VideoScreen'
import HomeScreen from '@/screens/HomeScreen'
import PlaylistScreen from '@/screens/PlaylistScreen'
import SettingsScreen from '@/screens/SettingsScreen'
import AudiobookLibraryScreen from '@/screens/AudiobookLibraryScreen'
import AudiobookScreen from '@/screens/AudiobookScreen'
// Store
import { useLibraryStore } from '@/store/useLibraryStore'
import { useAudiobookStore } from '@/store/useAudiobookStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore } from '@/store/useUiStore'

let startup: Promise<void> | null = null

export default function App() {
  const loaded = useLibraryStore((s) => s.loaded)
  const loadAll = useLibraryStore((s) => s.loadAll)
  const audiobooksLoaded = useAudiobookStore((s) => s.loaded)
  const loadAudiobooks = useAudiobookStore((s) => s.loadAll)
  const initialized = usePlayerStore((s) => s.initialized)
  const initPlayer = usePlayerStore((s) => s.init)
  const nowPlaying = usePlayerStore((s) => s.nowPlaying)
  const { screen, fullPlayerOpen, toast } = useUiStore()

  const [startupError, setStartupError] = useState(false)
  const playbackError = usePlayerStore((s) => s.playbackError)

  // Load both libraries first, then restore the player session (which may
  // point at either a music track or an audiobook chapter).
  useEffect(() => {
    startup ??= Promise.all([loadAll(), loadAudiobooks(), useVideoSession.getState().hydrate()]).then(() => initPlayer())
    void startup.catch(() => setStartupError(true))
  }, [loadAll, loadAudiobooks, initPlayer])

  if (startupError) return <main className="screen"><h1>Library unavailable</h1><p>Local storage could not be opened. Close other tabs, check free storage and try again.</p><button className="btn" onClick={() => window.location.reload()}>Retry</button></main>

  if (!loaded || !audiobooksLoaded || !initialized) {
    return (
      <div className="app">
        <div className="empty" style={{ flex: 1 }}>
          <div className="empty-icon spin" style={{ borderRadius: '50%' }} />
          <p>Loading your library…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <SectionSwitcher />
      {screen.name === 'video' && <VideoScreen />}
      {playbackError && screen.name !== 'video' && <p className="playback-error" role="alert">{playbackError}</p>}
      {screen.name === 'home' && <HomeScreen />}
      {screen.name === 'playlist' && <PlaylistScreen playlistId={screen.playlistId} />}
      {screen.name === 'settings' && <SettingsScreen />}
      {screen.name === 'audiobooks' && <AudiobookLibraryScreen />}
      {screen.name === 'audiobook' && <AudiobookScreen bookId={screen.bookId} />}

      {nowPlaying && !fullPlayerOpen && screen.name !== 'video' && <MiniPlayer />}
      {fullPlayerOpen && <FullPlayer />}

      {toast && <div className="toast">{toast}</div>}

      {screen.name === 'settings' && <ChepioTechFooter />}
    </div>
  )
}
