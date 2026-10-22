// Core
import { describe, expect, it } from 'vitest'
// Types
import type { Audiobook } from '@/types'
// Utils
import { sortFrequentlyListened } from '@/utils/frequentlyListened'

function book(overrides: Partial<Audiobook>): Audiobook {
  return {
    id: overrides.id ?? 'b',
    title: 'Book',
    status: 'in_progress',
    currentChapterIndex: 0,
    currentTime: 0,
    totalDuration: 0,
    listenedDuration: 0,
    progressPercent: 0,
    playCount: 0,
    totalListeningTime: 0,
    fingerprint: 'fp',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('sortFrequentlyListened', () => {
  it('excludes books that have never been played', () => {
    const books = [book({ id: 'never', playCount: 0 }), book({ id: 'played', playCount: 1 })]
    const result = sortFrequentlyListened(books)
    expect(result.map((b) => b.id)).toEqual(['played'])
  })

  it('ranks higher play count above lower, all else equal', () => {
    const books = [
      book({ id: 'low', playCount: 1, totalListeningTime: 0 }),
      book({ id: 'high', playCount: 5, totalListeningTime: 0 }),
    ]
    const result = sortFrequentlyListened(books)
    expect(result.map((b) => b.id)).toEqual(['high', 'low'])
  })

  it('recently listened books outrank equally-played older ones', () => {
    const now = Date.now()
    const books = [
      book({ id: 'stale', playCount: 3, lastListenedAt: now - 60 * 86_400_000 }),
      book({ id: 'recent', playCount: 3, lastListenedAt: now - 1000 }),
    ]
    const result = sortFrequentlyListened(books, now)
    expect(result.map((b) => b.id)).toEqual(['recent', 'stale'])
  })

  it('long total listening time can outweigh a lower play count', () => {
    const books = [
      book({ id: 'short-frequent', playCount: 3, totalListeningTime: 0 }),
      book({ id: 'long-single', playCount: 1, totalListeningTime: 10 * 3600 }), // 10 hours
    ]
    const result = sortFrequentlyListened(books)
    expect(result.map((b) => b.id)).toEqual(['long-single', 'short-frequent'])
  })
})
