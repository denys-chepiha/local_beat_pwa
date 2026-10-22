// Types
import type { AudiobookChapter, AudiobookStatus } from '@/types'

/**
 * Overall book progress by *duration*, not chapter count:
 *
 *   (durationOfCompletedChapters + currentPositionInCurrentChapter) / totalDuration
 *
 * Only chapters flagged `completed` count toward the completed portion — a
 * chapter jumped to directly (skipping earlier ones) does not inflate
 * progress just because its index is higher.
 */
export function calculateAudiobookProgress(params: {
  chapters: Pick<AudiobookChapter, 'id' | 'duration' | 'completed'>[]
  currentChapterId: string | null
  currentPositionInCurrentChapter: number
}): number {
  const { chapters, currentChapterId, currentPositionInCurrentChapter } = params
  const totalDuration = chapters.reduce((sum, c) => sum + (c.duration || 0), 0)
  if (totalDuration <= 0) return 0

  const completedDuration = chapters
    .filter((c) => c.completed && c.id !== currentChapterId)
    .reduce((sum, c) => sum + (c.duration || 0), 0)

  const raw =
    ((completedDuration + Math.max(0, currentPositionInCurrentChapter)) / totalDuration) * 100
  return Math.max(0, Math.min(100, raw))
}

/** Derive a book's status from its progress and whether playback has ever started. */
export function computeAudiobookStatus(progressPercent: number, hasStarted: boolean): AudiobookStatus {
  if (progressPercent >= 100) return 'completed'
  if (hasStarted || progressPercent > 0) return 'in_progress'
  return 'not_started'
}
