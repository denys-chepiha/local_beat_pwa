// Core
import { useEffect, useRef, useState } from 'react'
import { shallow } from 'zustand/shallow'
// Components
import TrackList from '@/components/TrackList/TrackList'
import PlaylistFormModal from '@/components/PlaylistFormModal'
import { BackIcon, PlusIcon, MusicIcon, EditIcon, FolderPlusIcon } from '@/components/Icons'
// Store
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore } from '@/store/useUiStore'
// Utils
import { formatTotalDuration } from '@/utils/format'

const ACCEPT = 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac'

interface Props {
  playlistId: string
}

export default function PlaylistScreen({ playlistId }: Props) {
  const playlist = useLibraryStore((s) => s.getPlaylist(playlistId))
  const tracks = useLibraryStore((s) => s.getPlaylistTracks(playlistId))
  const { addFiles, removeTrack, renameTrack, reorderTracks, importProgress } = useLibraryStore()
  const player = usePlayerStore((s) => ({ source: s.source, currentTrackId: s.currentTrackId,
    nowPlaying: s.nowPlaying, togglePlay: s.togglePlay, playPlaylist: s.playPlaylist,
    handleTrackRemoved: s.handleTrackRemoved, syncMusicQueue: s.syncMusicQueue,
  }), shallow)
  const { goHome, showToast } = useUiStore()
  // Android document providers can report audio as application/octet-stream.
  // Let the user select it, then validate its MIME type/extension in addFiles.
  const accept = /Android/i.test(navigator.userAgent) ? undefined : ACCEPT

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dirInputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [renamingTrackId, setRenamingTrackId] = useState<string | null>(null)
  const renamingTrack = renamingTrackId
    ? tracks.find((t) => t.id === renamingTrackId)
    : undefined

  // `webkitdirectory` is not a typed React attribute — set it imperatively so
  // the picker lets the user choose a whole folder (and its subfolders).
  useEffect(() => {
    if (dirInputRef.current) {
      dirInputRef.current.setAttribute('webkitdirectory', '')
      dirInputRef.current.setAttribute('directory', '')
    }
  }, [])

  if (!playlist) {
    // Playlist was deleted — bounce home.
    goHome()
    return null
  }

  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0)
  const trackSummary = `${playlist.trackIds.length} ${
    playlist.trackIds.length === 1 ? 'track' : 'tracks'
  }${totalDuration > 0 ? ` · ${formatTotalDuration(totalDuration)}` : ''}`

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)
    try {
      const result = await addFiles(playlistId, files)
      if (result.added > 0 && result.skipped.length > 0) {
        showToast(`Added ${result.added}, skipped ${result.skipped.length} file(s)`)
      } else if (result.added > 0) {
        showToast(`Added ${result.added} track${result.added === 1 ? '' : 's'}`)
      } else {
        showToast('No readable audio files found. Try another file.')
      }
    } catch {
      showToast('Could not save audio files. Check available storage and try again.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (dirInputRef.current) dirInputRef.current.value = ''
    }
  }

  const playTrack = (trackId: string) => {
    // Guard on `source` too: `currentTrackId` is the last-known music track
    // and stays set even while an audiobook is playing, so without this an
    // audiobook session could be toggled instead of starting this track.
    if (player.source === 'music' && player.currentTrackId === trackId) {
      void player.togglePlay()
    } else {
      void player.playPlaylist(playlistId, trackId)
    }
  }

  const handleRemove = (trackId: string) => {
    void removeTrack(playlistId, trackId)
    player.handleTrackRemoved(trackId)
  }

  const handleReorder = (trackIds: string[]) => {
    void reorderTracks(playlistId, trackIds).then(() => player.syncMusicQueue()).catch(() => showToast('Could not save track order. Try again.'))
  }

  return (
    <div className={`playlist-screen${player.nowPlaying ? ' has-mini' : ''}`}>
      <div className="playlist-static">
        <div className="topbar">
          <button className="icon-btn" onClick={goHome} aria-label="Back">
            <BackIcon />
          </button>
          <div className="playlist-title">
            <h1>{playlist.name}</h1>
            <div className="sub">{trackSummary}</div>
          </div>
          <button
            className={`icon-btn${editing ? ' active' : ''}`}
            onClick={() => setEditing((v) => !v)}
            aria-label="Edit tracks"
            aria-pressed={editing}
            title="Edit tracks"
            disabled={tracks.length === 0}
          >
            <EditIcon />
          </button>
          <button
            className="icon-btn"
            onClick={() => dirInputRef.current?.click()}
            aria-label="Add folder"
            title="Add a whole folder"
            disabled={!!importProgress}
          >
            <FolderPlusIcon />
          </button>
          <button
            className="icon-btn"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Add music"
            title="Add files"
            disabled={!!importProgress}
          >
            <PlusIcon />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          hidden
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <input
          ref={dirInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => void handleFiles(e.target.files)}
        />

        {importProgress && (
          <div className="import-bar">
            Importing {importProgress.done} / {importProgress.total}…
            <div className="track">
              <div
                className="fill"
                style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="playlist-scroll">
        {tracks.length === 0 && !importProgress ? (
          <div className="empty">
            <div className="empty-icon">
              <MusicIcon width={40} height={40} />
            </div>
            <h2>Empty playlist</h2>
            <p>Tap the folder icon to import a whole folder, or + to pick individual files.</p>
          </div>
        ) : (
          <TrackList
            tracks={tracks}
            editing={editing}
            onPlay={playTrack}
            onRemove={handleRemove}
            onRename={(trackId) => setRenamingTrackId(trackId)}
            onReorder={handleReorder}
          />
        )}
      </div>

      {renamingTrack && (
        <PlaylistFormModal
          title="Rename Track"
          initialValue={renamingTrack.title}
          confirmLabel="Save"
          onSubmit={(title) => {
            void renameTrack(renamingTrack.id, title)
            setRenamingTrackId(null)
          }}
          onClose={() => setRenamingTrackId(null)}
        />
      )}
    </div>
  )
}
