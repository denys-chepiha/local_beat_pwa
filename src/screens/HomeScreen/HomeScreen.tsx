// Core
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
// Components
import PlaylistCard from '@/components/PlaylistCard'
import { PlusIcon, SettingsIcon, MusicIcon } from '@/components/Icons'
// Services
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore } from '@/store/useUiStore'
// Styles
import './HomeScreen.css'

export default function HomeScreen() {
  const playlists = useLibraryStore((s) => s.playlists)
  const createPlaylist = useLibraryStore((s) => s.createPlaylist)
  const deletePlaylist = useLibraryStore((s) => s.deletePlaylist)
  const { openPlaylist, openSettings, showToast } = useUiStore()
  const nowPlaying = usePlayerStore((s) => s.nowPlaying)
  const handleTracksRemoved = usePlayerStore((s) => s.handleTracksRemoved)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const createButton = useRef<HTMLButtonElement>(null)

  const handleCreate = async () => {
    if (saving || !name.trim()) return
    setSaving(true); setError('')
    try {
      const playlist = await createPlaylist(name.trim())
      setCreating(false); setName(''); openPlaylist(playlist.id)
    } catch { setError('The playlist could not be saved. Please try again.') }
    finally { setSaving(false) }
  }
  const cancel = () => { flushSync(() => { setCreating(false); setName(''); setError('') }); createButton.current?.focus() }

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
        {creating ? <form className="playlist-create-form" onSubmit={(event) => { event.preventDefault(); void handleCreate() }}>
          <label htmlFor="new-playlist-name">Playlist name</label>
          <input ref={input} id="new-playlist-name" type="text" maxLength={80} autoComplete="off" enterKeyHint="done" placeholder="Playlist name" value={name} disabled={saving}
            onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape' && !saving) cancel() }} />
          <div><button className="btn" type="button" disabled={saving} onClick={cancel}>Cancel</button><button className="btn primary" disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create'}</button></div>
          {error && <p role="alert">{error}</p>}
        </form> : <button ref={createButton} className="btn primary block" onClick={() => {
          // Keep focus in the original tap so iOS can open its keyboard.
          flushSync(() => setCreating(true)); input.current?.focus()
        }}><PlusIcon width={18} height={18} /> New Playlist</button>}
      </section>
    </div>
  )
}
