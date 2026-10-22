// Core
import { describe, expect, it } from 'vitest'
// Utils
import { calculateAudiobookProgress, computeAudiobookStatus } from '@/utils/audiobookProgress'

describe('calculateAudiobookProgress', () => {
  it('matches the spec example: 20m done, 40m current @10m, 60m remaining -> 25%', () => {
    const chapters = [
      { id: 'c1', duration: 20 * 60, completed: true },
      { id: 'c2', duration: 40 * 60, completed: false },
      { id: 'c3', duration: 60 * 60, completed: false },
    ]
    const pct = calculateAudiobookProgress({
      chapters,
      currentChapterId: 'c2',
      currentPositionInCurrentChapter: 10 * 60,
    })
    expect(pct).toBeCloseTo(25, 5)
  })

  it('returns 0 when nothing has duration data yet', () => {
    const pct = calculateAudiobookProgress({
      chapters: [{ id: 'c1', duration: 0, completed: false }],
      currentChapterId: 'c1',
      currentPositionInCurrentChapter: 0,
    })
    expect(pct).toBe(0)
  })

  it('does not double count the current chapter even if flagged completed', () => {
    const chapters = [{ id: 'c1', duration: 100, completed: true }]
    const pct = calculateAudiobookProgress({
      chapters,
      currentChapterId: 'c1',
      currentPositionInCurrentChapter: 50,
    })
    expect(pct).toBe(50)
  })

  it('does not credit progress for chapters skipped ahead of (not marked completed)', () => {
    const chapters = [
      { id: 'c1', duration: 100, completed: false },
      { id: 'c2', duration: 100, completed: false },
      { id: 'c3', duration: 100, completed: false },
    ]
    // Jumped straight to chapter 3 without listening to 1-2.
    const pct = calculateAudiobookProgress({
      chapters,
      currentChapterId: 'c3',
      currentPositionInCurrentChapter: 50,
    })
    expect(pct).toBeCloseTo((50 / 300) * 100, 5)
  })

  it('clamps to [0, 100]', () => {
    const chapters = [{ id: 'c1', duration: 100, completed: true }]
    const pct = calculateAudiobookProgress({
      chapters,
      currentChapterId: 'c1',
      currentPositionInCurrentChapter: 500, // overshoot
    })
    expect(pct).toBe(100)
  })
})

describe('computeAudiobookStatus', () => {
  it('is not_started when nothing has played and progress is 0', () => {
    expect(computeAudiobookStatus(0, false)).toBe('not_started')
  })

  it('is in_progress once playback has started, even at 0%', () => {
    expect(computeAudiobookStatus(0, true)).toBe('in_progress')
  })

  it('is in_progress at partial progress', () => {
    expect(computeAudiobookStatus(42, false)).toBe('in_progress')
  })

  it('is completed at 100%', () => {
    expect(computeAudiobookStatus(100, true)).toBe('completed')
  })
})
