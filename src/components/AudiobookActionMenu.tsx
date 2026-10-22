// Types
import type { Audiobook } from '@/types'

interface Props {
  book: Audiobook
  onClose: () => void
  onContinue: () => void
  onStartOver: () => void
  onMarkCompleted: () => void
  onResetProgress: () => void
  onEdit: () => void
  onDelete: () => void
}

export default function AudiobookActionMenu({
  book,
  onClose,
  onContinue,
  onStartOver,
  onMarkCompleted,
  onResetProgress,
  onEdit,
  onDelete,
}: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal action-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{book.title}</h2>
        <div className="action-list">
          {book.status !== 'not_started' && (
            <button className="action-row" onClick={onContinue}>
              Continue listening
            </button>
          )}
          <button className="action-row" onClick={onStartOver}>
            Start from beginning
          </button>
          {book.status !== 'completed' && (
            <button className="action-row" onClick={onMarkCompleted}>
              Mark as completed
            </button>
          )}
          {book.status !== 'not_started' && (
            <button className="action-row" onClick={onResetProgress}>
              Reset progress
            </button>
          )}
          <button className="action-row" onClick={onEdit}>
            Edit book
          </button>
          <button className="action-row danger" onClick={onDelete}>
            Delete book
          </button>
        </div>
        <button className="btn block" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
