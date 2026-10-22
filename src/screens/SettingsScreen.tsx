// Core
import { useEffect, useState } from 'react'
import { shallow } from 'zustand/shallow'
// Components
import { BackIcon, BookIcon, TrashIcon, MusicIcon } from '@/components/Icons'
// Services
import { estimateDeviceStorage } from '@/services/db'
// Store
import { useLibraryStore } from '@/store/useLibraryStore'
import { useAudiobookStore } from '@/store/useAudiobookStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore } from '@/store/useUiStore'
// Utils
import { formatBytes } from '@/utils/format'

type ConfirmKind = 'music' | 'playlists' | 'audiobooks' | null

export default function SettingsScreen() {
  const playlists = useLibraryStore((s) => s.playlists)
  const tracks = useLibraryStore((s) => s.tracks)
  const { clearAllMusic, deleteAllPlaylists } = useLibraryStore()
  const audiobooks = useAudiobookStore((s) => s.books)
  const chaptersByBook = useAudiobookStore((s) => s.chaptersByBook)
  const clearAllBooks = useAudiobookStore((s) => s.clearAllBooks)
  const player = usePlayerStore((s) => ({ source: s.source, nowPlaying: s.nowPlaying,
    stop: s.stop, handleTrackRemoved: s.handleTrackRemoved, handleBookRemoved: s.handleBookRemoved,
  }), shallow)
  const { goHome, showToast } = useUiStore()
  const [confirm, setConfirm] = useState<ConfirmKind>(null)
  const [deviceStorage, setDeviceStorage] = useState<{ usage: number; quota: number } | null>(null)

  useEffect(() => {
    void estimateDeviceStorage().then(setDeviceStorage)
  }, [])

  const trackList = Object.values(tracks)
  const musicBytes = trackList.reduce((sum, t) => sum + (t.fileSize || 0), 0)
  const chapterList = Object.values(chaptersByBook).flat()
  const audiobookBytes = chapterList.reduce((sum, c) => sum + (c.size || 0), 0)
  const devicePercent =
    deviceStorage && deviceStorage.quota > 0
      ? Math.min(100, Math.round((deviceStorage.usage / deviceStorage.quota) * 100))
      : null

  const stopEverything = () => {
    if (player.source === 'music') player.stop()
    Object.keys(tracks).forEach((id) => player.handleTrackRemoved(id))
  }

  const stopAudiobooks = () => {
    for (const book of audiobooks) player.handleBookRemoved(book.id)
  }

  const doClearMusic = async () => {
    stopEverything()
    await clearAllMusic()
    setConfirm(null)
    showToast('All music cleared')
  }

  const doDeletePlaylists = async () => {
    stopEverything()
    await deleteAllPlaylists()
    setConfirm(null)
    showToast('All playlists deleted')
  }

  const doClearAudiobooks = async () => {
    stopAudiobooks()
    await clearAllBooks()
    setConfirm(null)
    showToast('All audiobooks deleted')
  }

  return (
    <div className={`screen${player.nowPlaying ? ' has-mini' : ''}`}>
      <div className="topbar">
        <button className="icon-btn" onClick={goHome} aria-label="Back">
          <BackIcon />
        </button>
        <h1>Settings</h1>
      </div>

      <div className="section-title">Music Library</div>
      <div className="stat-grid">
        <div className="stat">
          <div className="value">{playlists.length}</div>
          <div className="label">Playlists</div>
        </div>
        <div className="stat">
          <div className="value">{trackList.length}</div>
          <div className="label">Tracks</div>
        </div>
        <div className="stat" style={{ gridColumn: '1 / -1' }}>
          <div className="value">{formatBytes(musicBytes)}</div>
          <div className="label">Local storage used</div>
        </div>
      </div>

      <div className="section-title">Audio Books Library</div>
      <div className="stat-grid">
        <div className="stat">
          <div className="value">{audiobooks.length}</div>
          <div className="label">Audiobooks</div>
        </div>
        <div className="stat">
          <div className="value">{chapterList.length}</div>
          <div className="label">Chapters</div>
        </div>
        <div className="stat" style={{ gridColumn: '1 / -1' }}>
          <div className="value">{formatBytes(audiobookBytes)}</div>
          <div className="label">Local storage used</div>
        </div>
      </div>

      {deviceStorage && (
        <>
          <div className="section-title">Device Storage</div>
          <div className="notice" style={{ color: 'var(--text-dim)' }}>
            <div className="progress-bar" style={{ margin: '2px 0 8px' }}>
              <div className="fill" style={{ width: `${devicePercent ?? 0}%` }} />
            </div>
            {formatBytes(deviceStorage.usage)} used of about {formatBytes(deviceStorage.quota)} available
            to this browser ({devicePercent}%).
          </div>
        </>
      )}

      <div className="notice">
        ⚠️ Your music and audiobooks are stored locally inside this browser only. Keep the original
        files on your device — if the browser clears its storage (for example when space runs low),
        your imported library may be lost and would need to be added again.
      </div>

      <div className="section-title">Danger Zone</div>
      <div className="btn-row" style={{ flexDirection: 'column' }}>
        <button
          className="btn danger block"
          onClick={() => setConfirm('music')}
          disabled={trackList.length === 0}
        >
          <MusicIcon width={18} height={18} /> Clear all music
        </button>
        <button
          className="btn danger block"
          onClick={() => setConfirm('playlists')}
          disabled={playlists.length === 0}
        >
          <TrashIcon width={18} height={18} /> Delete all playlists
        </button>
        <button
          className="btn danger block"
          onClick={() => setConfirm('audiobooks')}
          disabled={audiobooks.length === 0}
        >
          <BookIcon width={18} height={18} /> Delete all audiobooks
        </button>
      </div>

      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>
              {confirm === 'music' && 'Clear all music?'}
              {confirm === 'playlists' && 'Delete all playlists?'}
              {confirm === 'audiobooks' && 'Delete all audiobooks?'}
            </h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.5 }}>
              {confirm === 'music' &&
                'Every imported track will be removed from this device. Your playlists will remain but become empty.'}
              {confirm === 'playlists' &&
                'All playlists and all tracks will be permanently removed from this device.'}
              {confirm === 'audiobooks' &&
                'Every audiobook, its cover art, chapters and listening progress will be permanently removed from this device.'}
              {' This cannot be undone.'}
            </p>
            <div className="actions">
              <button className="btn" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  if (confirm === 'music') void doClearMusic()
                  else if (confirm === 'playlists') void doDeletePlaylists()
                  else void doClearAudiobooks()
                }}
              >
                {confirm === 'music' && 'Clear'}
                {confirm === 'playlists' && 'Delete'}
                {confirm === 'audiobooks' && 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
