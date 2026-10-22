// Types
import type { Audiobook } from '@/types'

const RECENT_WINDOW_MS = 14 * 86_400_000 // 2 weeks

/**
 * Simple local "frequently listened" score — not a recommendation engine,
 * just a heuristic blend of how often, how long, and how recently a book
 * was played:
 *
 *   score = playCount * 2 + totalListeningMinutes / 30 + recentActivityBonus
 */
export function frequentlyListenedScore(book: Audiobook, now = Date.now()): number {
  const totalListeningMinutes = book.totalListeningTime / 60
  const recentActivityBonus =
    book.lastListenedAt != null && now - book.lastListenedAt < RECENT_WINDOW_MS ? 3 : 0
  return book.playCount * 2 + totalListeningMinutes / 30 + recentActivityBonus
}

/** Books with any listening activity, ranked by `frequentlyListenedScore` (highest first). */
export function sortFrequentlyListened(books: Audiobook[], now = Date.now()): Audiobook[] {
  return books
    .filter((b) => b.playCount > 0)
    .map((b) => ({ b, score: frequentlyListenedScore(b, now) }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.b)
}
