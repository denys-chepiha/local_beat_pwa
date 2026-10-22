// Components
import { BookIcon, CheckCircleIcon, MoreIcon } from '@/components/Icons'
// Hooks
import { useAudiobookCoverUrl } from '@/hooks/useAudiobookCoverUrl'
// Store
import { useAudiobookStore } from '@/store/useAudiobookStore'
// Types
import type { Audiobook } from '@/types'
// Utils
import { formatRelativeDate } from '@/utils/format'

interface Props {
  book: Audiobook
  onClick: () => void
  onMenu: () => void
}

export default function AudiobookCard({ book, onClick, onMenu }: Props) {
  const coverUrl = useAudiobookCoverUrl(book.coverThumbnailBlobId ?? book.coverBlobId)
  const chapterCount = useAudiobookStore((s) => s.chaptersByBook[book.id]?.length ?? 0)
  const currentChapterNumber = Math.min(book.currentChapterIndex + 1, Math.max(chapterCount, 1))
  const progress = Math.round(book.progressPercent)
  const started = book.status !== 'not_started'

  return (
    <div className="book-card">
      <button type="button" className="book-card-main" onClick={onClick}>
        <div className="book-card-cover">
          {coverUrl ? <img src={coverUrl} alt="" /> : <BookIcon width={28} height={28} />}
          {book.status === 'completed' && (
            <span className="book-card-badge">
              <CheckCircleIcon width={14} height={14} />
            </span>
          )}
        </div>
        <div className="book-card-meta">
          <div className="title">{book.title}</div>
          {book.author && <div className="author">{book.author}</div>}
          {chapterCount > 0 && (
            <div className="chapter-line">
              {started ? `Chapter ${currentChapterNumber} of ${chapterCount}` : `${chapterCount} chapter${chapterCount === 1 ? '' : 's'}`}
            </div>
          )}
          {started && (
            <>
              <div className="progress-line">{progress}%</div>
              <div className="progress-bar">
                <div className="fill" style={{ width: `${progress}%` }} />
              </div>
            </>
          )}
          {book.lastListenedAt && (
            <div className="date">Last listened {formatRelativeDate(book.lastListenedAt)}</div>
          )}
        </div>
      </button>
      <button type="button" className="book-card-more" onClick={onMenu} aria-label={`Actions for ${book.title}`}>
        <MoreIcon width={20} height={20} />
      </button>
    </div>
  )
}
