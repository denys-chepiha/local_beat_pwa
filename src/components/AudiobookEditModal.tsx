// Core
import { useEffect, useRef, useState } from 'react'
// Components
import { BookIcon, ImageIcon } from '@/components/Icons'
// Hooks
import { useAudiobookCoverUrl } from '@/hooks/useAudiobookCoverUrl'
// Store
import { useAudiobookStore } from '@/store/useAudiobookStore'
// Types
import type { Audiobook } from '@/types'

interface Props {
  book: Audiobook
  onClose: () => void
}

export default function AudiobookEditModal({ book, onClose }: Props) {
  const updateBookMeta = useAudiobookStore((s) => s.updateBookMeta)
  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author ?? '')
  const [newCover, setNewCover] = useState<File | null>(null)
  const [removeCover, setRemoveCover] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [newCoverUrl, setNewCoverUrl] = useState<string | null>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const existingCoverUrl = useAudiobookCoverUrl(book.coverBlobId)

  useEffect(() => {
    if (!newCover) {
      setNewCoverUrl(null)
      return
    }
    const url = URL.createObjectURL(newCover)
    setNewCoverUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [newCover])

  const displayCoverUrl = removeCover ? null : (newCoverUrl ?? existingCoverUrl)

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    try {
      await updateBookMeta(book.id, {
        title,
        author: author.trim() || null,
        cover: removeCover ? null : (newCover ?? undefined),
      })
      onClose()
    } catch {
      setError('Could not save changes. Check available storage and try again.')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit Book</h2>

        <div className="import-cover-row">
          <div className="import-cover">
            {displayCoverUrl ? <img src={displayCoverUrl} alt="" /> : <BookIcon width={32} height={32} />}
          </div>
          <div className="import-cover-actions">
            <button className="btn" onClick={() => coverInputRef.current?.click()}>
              <ImageIcon width={16} height={16} /> Change cover
            </button>
            {displayCoverUrl && (
              <button
                className="btn"
                onClick={() => {
                  setRemoveCover(true)
                  setNewCover(null)
                }}
              >
                Remove cover
              </button>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  setNewCover(file)
                  setRemoveCover(false)
                }
                if (coverInputRef.current) coverInputRef.current.value = ''
              }}
            />
          </div>
        </div>

        <label className="field">
          <span>Title</span>
          <input type="text" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>Author</span>
          <input
            type="text"
            value={author}
            maxLength={120}
            placeholder="Optional"
            onChange={(e) => setAuthor(e.target.value)}
          />
        </label>

        {error && <p role="alert">{error}</p>}
        <div className="actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void save()} disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
