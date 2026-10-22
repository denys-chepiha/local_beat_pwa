// Core
import { describe, expect, it } from 'vitest'
// Utils
import { computeAudiobookFingerprint } from '@/utils/audiobookFingerprint'

describe('computeAudiobookFingerprint', () => {
  const entries = [
    { relativePath: 'Book/01.mp3', size: 1000, lastModified: 111 },
    { relativePath: 'Book/02.mp3', size: 2000, lastModified: 222 },
  ]

  it('is stable for the same input', () => {
    const a = computeAudiobookFingerprint('Book', entries)
    const b = computeAudiobookFingerprint('Book', entries)
    expect(a).toBe(b)
  })

  it('is independent of file order', () => {
    const a = computeAudiobookFingerprint('Book', entries)
    const b = computeAudiobookFingerprint('Book', entries.slice().reverse())
    expect(a).toBe(b)
  })

  it('changes when a file size differs', () => {
    const a = computeAudiobookFingerprint('Book', entries)
    const changed = [{ ...entries[0], size: 9999 }, entries[1]]
    const b = computeAudiobookFingerprint('Book', changed)
    expect(a).not.toBe(b)
  })

  it('changes when the title differs', () => {
    const a = computeAudiobookFingerprint('Book', entries)
    const b = computeAudiobookFingerprint('Other Book', entries)
    expect(a).not.toBe(b)
  })
})
