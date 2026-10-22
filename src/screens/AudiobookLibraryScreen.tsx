// Core
import { useState } from 'react'
// Components
import AudiobookCard from '@/components/AudiobookCard'
import AudiobookActionMenu from '@/components/AudiobookActionMenu'
import AudiobookImportWizard from '@/components/AudiobookImportWizard'
import { PlusIcon, SettingsIcon, BookIcon } from '@/components/Icons'
// Hooks
import { useAudiobookActions } from '@/hooks/useAudiobookActions'
// Store
import { useAudiobookStore } from '@/store/useAudiobookStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore } from '@/store/useUiStore'
// Types
import type { Audiobook } from '@/types'

export default function AudiobookLibraryScreen() {
  const books = useAudiobookStore((s) => s.books)
  const getContinueListening = useAudiobookStore((s) => s.getContinueListening)
  const getFrequentlyListened = useAudiobookStore((s) => s.getFrequentlyListened)
  const getCompleted = useAudiobookStore((s) => s.getCompleted)
  const nowPlaying = usePlayerStore((s) => s.nowPlaying)
  const { openSettings, openAudiobook } = useUiStore()
  const actions = useAudiobookActions()

  const [menuBookId, setMenuBookId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Audiobook | null>(null)

  const continueListening = getContinueListening()
  const frequentlyListened = getFrequentlyListened()
  const completed = getCompleted()
  const menuBook = menuBookId ? books.find((b) => b.id === menuBookId) : undefined

  const closeMenu = () => setMenuBookId(null)

  return (
    <div className={`screen audiobook-library${nowPlaying ? ' has-mini' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src="/icons/logo.png" alt="Local Beat" />
          <div>
            <h1 style={{ fontSize: 22 }}>Local Beat</h1>
            <span className="subtitle">Your offline audiobooks</span>
          </div>
        </div>
        <button className="icon-btn" onClick={openSettings} aria-label="Settings">
          <SettingsIcon />
        </button>
      </header>


      {books.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <BookIcon width={40} height={40} />
          </div>
          <h2>No audiobooks yet</h2>
          <p>
            Add a folder of chapter files from this device and listen offline. Everything stays on
            your phone — no accounts, no internet needed.
          </p>
          <button className="btn primary" onClick={() => setImporting(true)}>
            <PlusIcon width={18} height={18} /> Add audio book
          </button>
        </div>
      ) : (
        <>
          {continueListening.length > 0 && (
            <section aria-labelledby="continue-listening-title">
              <div className="section-title" id="continue-listening-title">
                Continue Listening
              </div>
              <div className="card-grid">
                {continueListening.map((b) => (
                  <AudiobookCard
                    key={b.id}
                    book={b}
                    onClick={() => openAudiobook(b.id)}
                    onMenu={() => setMenuBookId(b.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {frequentlyListened.length > 0 && (
            <section aria-labelledby="frequently-listened-title">
              <div className="section-title" id="frequently-listened-title">
                Frequently Listened
              </div>
              <div className="card-grid">
                {frequentlyListened.map((b) => (
                  <AudiobookCard
                    key={b.id}
                    book={b}
                    onClick={() => openAudiobook(b.id)}
                    onMenu={() => setMenuBookId(b.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {completed.length > 0 && (
            <section aria-labelledby="completed-title">
              <div className="section-title" id="completed-title">
                Completed
              </div>
              <div className="card-grid">
                {completed.map((b) => (
                  <AudiobookCard
                    key={b.id}
                    book={b}
                    onClick={() => openAudiobook(b.id)}
                    onMenu={() => setMenuBookId(b.id)}
                  />
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="all-books-title">
            <div className="section-title" id="all-books-title">
              All Books
            </div>
            <div className="card-grid">
              {books.map((b) => (
                <AudiobookCard
                  key={b.id}
                  book={b}
                  onClick={() => openAudiobook(b.id)}
                  onMenu={() => setMenuBookId(b.id)}
                />
              ))}
            </div>
          </section>

          <section className="home-create" style={{ padding: '12px 0 24px' }}>
            <button className="btn primary block" onClick={() => setImporting(true)}>
              <PlusIcon width={18} height={18} /> Add audio book
            </button>
          </section>
        </>
      )}

      {menuBook && (
        <AudiobookActionMenu
          book={menuBook}
          onClose={closeMenu}
          onContinue={() => {
            actions.continueListening(menuBook.id)
            closeMenu()
          }}
          onStartOver={() => {
            actions.startFromBeginning(menuBook.id)
            closeMenu()
          }}
          onMarkCompleted={() => {
            void actions.markCompleted(menuBook.id)
            closeMenu()
          }}
          onResetProgress={() => {
            void actions.resetProgress(menuBook.id)
            closeMenu()
          }}
          onEdit={() => {
            openAudiobook(menuBook.id)
            closeMenu()
          }}
          onDelete={() => {
            setConfirmDelete(menuBook)
            closeMenu()
          }}
        />
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Delete "{confirmDelete.title}"?</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.5 }}>
              The book, its cover, all chapter audio and its listening progress will be permanently
              removed from this device. This cannot be undone.
            </p>
            <div className="actions">
              <button className="btn" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  void actions.deleteBook(confirmDelete.id)
                  setConfirmDelete(null)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {importing && <AudiobookImportWizard onClose={() => setImporting(false)} />}
    </div>
  )
}
