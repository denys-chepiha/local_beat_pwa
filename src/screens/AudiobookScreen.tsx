// Core
import { useState } from 'react'
import { shallow } from 'zustand/shallow'
// Components
import AudiobookActionMenu from '@/components/AudiobookActionMenu'
import AudiobookEditModal from '@/components/AudiobookEditModal'
import { BackIcon, BookIcon, CheckIcon, MoreIcon, PauseIcon, PlayIcon } from '@/components/Icons'
// Hooks
import { useAudiobookActions } from '@/hooks/useAudiobookActions'
import { useAudiobookCoverUrl } from '@/hooks/useAudiobookCoverUrl'
// Store
import { useAudiobookStore } from '@/store/useAudiobookStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore } from '@/store/useUiStore'
// Utils
import { formatTime, formatTotalDuration } from '@/utils/format'

interface Props {
  bookId: string
}

export default function AudiobookScreen({ bookId }: Props) {
  const book = useAudiobookStore((s) => s.books.find((b) => b.id === bookId))
  const chapters = useAudiobookStore((s) => s.chaptersByBook[bookId] ?? [])
  const player = usePlayerStore((s) => ({
    source: s.source, currentBookId: s.currentBookId, currentChapterId: s.currentChapterId,
    currentTime: Math.floor(s.currentTime), nowPlaying: s.nowPlaying, isPlaying: s.isPlaying,
    togglePlay: s.togglePlay, playChapter: s.playChapter,
  }), shallow)
  const openAudiobookLibrary = useUiStore((s) => s.openAudiobookLibrary)
  const actions = useAudiobookActions()
  const coverUrl = useAudiobookCoverUrl(book?.coverBlobId)

  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!book) {
    // Book was deleted — bounce to the library.
    openAudiobookLibrary()
    return null
  }

  const isCurrentBook = player.source === 'audiobook' && player.currentBookId === book.id
  const totalDuration = chapters.reduce((sum, c) => sum + (c.duration || 0), 0)
  const currentPosition = isCurrentBook ? player.currentTime : book.currentTime
  const priorChaptersDuration = chapters
    .slice(0, book.currentChapterIndex)
    .reduce((sum, c) => sum + (c.duration || 0), 0)
  const remaining = Math.max(0, totalDuration - (priorChaptersDuration + currentPosition))
  const progress = Math.round(book.progressPercent)
  const currentChapterNumber = Math.min(book.currentChapterIndex + 1, Math.max(chapters.length, 1))

  const playChapter = (chapterId: string) => {
    if (isCurrentBook && player.currentChapterId === chapterId) {
      void player.togglePlay()
    } else {
      void player.playChapter(book.id, chapterId)
    }
  }

  return (
    <div className={`screen audiobook-detail${player.nowPlaying ? ' has-mini' : ''}`}>
      <div className="topbar">
        <button className="icon-btn" onClick={openAudiobookLibrary} aria-label="Back">
          <BackIcon />
        </button>
        <div className="playlist-title">
          <h1>{book.title}</h1>
        </div>
        <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Book actions">
          <MoreIcon />
        </button>
      </div>

      <div className="audiobook-hero">
        <div className="audiobook-cover-large">
          {coverUrl ? <img src={coverUrl} alt="" /> : <BookIcon width={48} height={48} />}
        </div>
        {book.author && <div className="audiobook-author">{book.author}</div>}

        {chapters.length > 0 && (
          <>
            <div className="progress-bar large">
              <div className="fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="audiobook-progress-row">
              <span>{progress}%</span>
              <span>
                Chapter {currentChapterNumber} of {chapters.length}
              </span>
            </div>
            <div className="audiobook-duration-row">
              <span>{formatTotalDuration(totalDuration)} total</span>
              <span>{formatTotalDuration(remaining)} left</span>
            </div>
          </>
        )}

        {book.status === 'completed' ? (
          <div className="audiobook-completed">
            <div className="completed-badge">
              <CheckIcon width={16} height={16} /> Completed
            </div>
            <button className="btn primary block" onClick={() => actions.startFromBeginning(book.id)}>
              <PlayIcon width={18} height={18} /> Listen again
            </button>
          </div>
        ) : (
          <button
            className="btn primary block"
            disabled={chapters.length === 0}
            onClick={() => (isCurrentBook ? void player.togglePlay() : actions.continueListening(book.id))}
          >
            {isCurrentBook && player.isPlaying ? (
              <PauseIcon width={18} height={18} />
            ) : (
              <PlayIcon width={18} height={18} />
            )}
            {book.status === 'not_started' ? 'Start listening' : 'Continue listening'}
          </button>
        )}
      </div>

      <div className="section-title">Chapters</div>
      {chapters.length === 0 ? (
        <p style={{ color: 'var(--text-dim)', fontSize: 14, padding: '0 4px' }}>No chapters found.</p>
      ) : (
        <div className="chapter-list">
          {chapters.map((c, i) => {
            const isCurrent = isCurrentBook && player.currentChapterId === c.id
            return (
              <button
                key={c.id}
                type="button"
                className={`chapter-row${isCurrent ? ' playing' : ''}`}
                onClick={() => playChapter(c.id)}
              >
                <span className="chapter-status">
                  {c.completed ? (
                    <CheckIcon width={16} height={16} />
                  ) : isCurrent ? (
                    player.isPlaying ? (
                      <PauseIcon width={14} height={14} />
                    ) : (
                      <PlayIcon width={14} height={14} />
                    )
                  ) : (
                    String(i + 1).padStart(2, '0')
                  )}
                </span>
                <span className="chapter-title">{c.title}</span>
                <span className="chapter-dur">
                  {isCurrent ? `${formatTime(player.currentTime)} / ${formatTime(c.duration)}` : formatTime(c.duration)}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {menuOpen && (
        <AudiobookActionMenu
          book={book}
          onClose={() => setMenuOpen(false)}
          onContinue={() => {
            actions.continueListening(book.id)
            setMenuOpen(false)
          }}
          onStartOver={() => {
            actions.startFromBeginning(book.id)
            setMenuOpen(false)
          }}
          onMarkCompleted={() => {
            void actions.markCompleted(book.id)
            setMenuOpen(false)
          }}
          onResetProgress={() => {
            void actions.resetProgress(book.id)
            setMenuOpen(false)
          }}
          onEdit={() => {
            setEditing(true)
            setMenuOpen(false)
          }}
          onDelete={() => {
            setConfirmDelete(true)
            setMenuOpen(false)
          }}
        />
      )}

      {editing && <AudiobookEditModal book={book} onClose={() => setEditing(false)} />}

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Delete "{book.title}"?</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.5 }}>
              The book, its cover, all chapter audio and its listening progress will be permanently
              removed from this device. This cannot be undone.
            </p>
            <div className="actions">
              <button className="btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  setConfirmDelete(false)
                  void actions.deleteBook(book.id).then(openAudiobookLibrary)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
