// Core
import { useState } from 'react'
// Components
import PlaylistCard from '@/components/PlaylistCard'
import PlaylistFormModal from '@/components/PlaylistFormModal'
import { PlusIcon, SettingsIcon, MusicIcon } from '@/components/Icons'
// Store
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore } from '@/store/useUiStore'

export default function HomeScreen() {
  const playlists = useLibraryStore((s) => s.playlists)
  const createPlaylist = useLibraryStore((s) => s.createPlaylist)
  const deletePlaylist = useLibraryStore((s) => s.deletePlaylist)
  const { openPlaylist, openSettings, showToast } = useUiStore()
  const nowPlaying = usePlayerStore((s) => s.nowPlaying)
  const handleTracksRemoved = usePlayerStore((s) => s.handleTracksRemoved)
  const [creating, setCreating] = useState(false)

  const handleCreate = async (name: string) => {
    const playlist = await createPlaylist(name)
    setCreating(false)
    openPlaylist(playlist.id)
  }

  const handleDeletePlaylist = (playlistId: string, trackIds: string[]) => {
    handleTracksRemoved(trackIds)
    void deletePlaylist(playlistId).then(() => showToast('Playlist deleted'))
  }

  return (
    <div className={`home-screen${nowPlaying ? ' has-mini' : ''}`}>
      <header className="home-header topbar">
        <div className="brand">
          <img className="brand-logo" src="/icons/logo.png" alt="Local Beat" />
          <div>
            <h1 style={{ fontSize: 22 }}>Local Beat</h1>
            <span className="subtitle">Your offline music</span>
          </div>
        </div>
        <button className="icon-btn" onClick={openSettings} aria-label="Settings">
          <SettingsIcon />
        </button>
      </header>


      <section className="home-playlists" aria-labelledby="home-playlists-title">
        <div className="section-title" id="home-playlists-title">
          Your Playlists
        </div>
        {playlists.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <MusicIcon width={40} height={40} />
            </div>
            <h2>No playlists yet</h2>
            <p>
              Create a playlist and add your own audio files from this device. Everything stays on
              your phone — no accounts, no internet needed.
            </p>
          </div>
        ) : (
          <div className="card-grid">
            {playlists.map((p) => (
              <PlaylistCard
                key={p.id}
                playlist={p}
                onClick={() => openPlaylist(p.id)}
                onDelete={() => handleDeletePlaylist(p.id, p.trackIds)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="home-create">
        <button className="btn primary block" onClick={() => setCreating(true)}>
          <PlusIcon width={18} height={18} /> New Playlist
        </button>
      </section>

      {creating && (
        <PlaylistFormModal
          title="New Playlist"
          confirmLabel="Create"
          onSubmit={handleCreate}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  )
}
