// Store
import { useAudiobookStore } from '@/store/useAudiobookStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore } from '@/store/useUiStore'

/** Shared book-level actions used by both the library tiles and the book detail page. */
export function useAudiobookActions() {
  const markCompleted = useAudiobookStore((s) => s.markCompleted)
  const resetProgress = useAudiobookStore((s) => s.resetProgress)
  const deleteBook = useAudiobookStore((s) => s.deleteBook)
  const playAudiobook = usePlayerStore((s) => s.playAudiobook)
  const handleBookRemoved = usePlayerStore((s) => s.handleBookRemoved)
  const showToast = useUiStore((s) => s.showToast)

  return {
    continueListening: (bookId: string) => {
      void playAudiobook(bookId)
    },
    startFromBeginning: (bookId: string) => {
      void playAudiobook(bookId, { fromBeginning: true })
    },
    markCompleted: async (bookId: string) => {
      await markCompleted(bookId)
      showToast('Marked as completed')
    },
    resetProgress: async (bookId: string) => {
      handleBookRemoved(bookId)
      await resetProgress(bookId)
      showToast('Progress reset')
    },
    deleteBook: async (bookId: string) => {
      handleBookRemoved(bookId)
      await deleteBook(bookId)
      showToast('Audiobook deleted')
    },
  }
}
