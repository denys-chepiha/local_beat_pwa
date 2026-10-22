// Core
import { afterEach, describe, expect, it, vi } from 'vitest'
// Utils
import {
  buildImportCandidate,
  isHiddenOrSystemFile,
  isSupportedAudioFile,
  rankCoverCandidates,
} from '@/utils/audiobookFiles'

function fileWithPath(name: string, relativePath: string, opts: Partial<FilePropertyBag> = {}): File {
  const file = new File(['x'], name, { type: 'audio/mpeg', ...opts })
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath, configurable: true })
  return file
}

describe('isHiddenOrSystemFile', () => {
  it('flags dotfiles and known OS junk', () => {
    expect(isHiddenOrSystemFile('.DS_Store')).toBe(true)
    expect(isHiddenOrSystemFile('The Hobbit/.DS_Store')).toBe(true)
    expect(isHiddenOrSystemFile('Thumbs.db')).toBe(true)
    expect(isHiddenOrSystemFile('desktop.ini')).toBe(true)
  })

  it('leaves normal files alone', () => {
    expect(isHiddenOrSystemFile('01 - Chapter One.mp3')).toBe(false)
  })
})

describe('isSupportedAudioFile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts common audio extensions', () => {
    expect(isSupportedAudioFile(new File(['x'], 'chapter.mp3', { type: 'audio/mpeg' }))).toBe(true)
  })

  it('rejects non-audio files', () => {
    expect(isSupportedAudioFile(new File(['x'], 'cover.jpg', { type: 'image/jpeg' }))).toBe(false)
  })

  it('defers to canPlayType when it is reliably implemented, rejecting unplayable formats', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation((type: string) =>
      type === 'audio/mpeg' ? 'probably' : '',
    )
    const flac = new File(['x'], 'chapter.flac', { type: 'audio/flac' })
    expect(isSupportedAudioFile(flac)).toBe(false)
    const mp3 = new File(['x'], 'chapter.mp3', { type: 'audio/mpeg' })
    expect(isSupportedAudioFile(mp3)).toBe(true)
  })
})

describe('rankCoverCandidates', () => {
  it('prioritizes filenames that hint at a cover image', () => {
    const files = [
      new File(['x'], 'random-photo.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'cover.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'folder.png', { type: 'image/png' }),
    ]
    const ranked = rankCoverCandidates(files)
    expect(ranked[0].name).toBe('cover.jpg')
  })
})

describe('buildImportCandidate', () => {
  it('sorts chapters naturally, finds the cover, skips junk, derives title from folder', () => {
    const files = [
      fileWithPath('10 - Chapter Ten.mp3', 'The Hobbit/10 - Chapter Ten.mp3'),
      fileWithPath('2 - Chapter Two.mp3', 'The Hobbit/2 - Chapter Two.mp3'),
      fileWithPath('1 - Chapter One.mp3', 'The Hobbit/1 - Chapter One.mp3'),
      fileWithPath('cover.jpg', 'The Hobbit/cover.jpg', { type: 'image/jpeg' }),
      fileWithPath('.DS_Store', 'The Hobbit/.DS_Store', { type: '' }),
      fileWithPath('notes.txt', 'The Hobbit/notes.txt', { type: 'text/plain' }),
    ]

    const candidate = buildImportCandidate(files)

    expect(candidate.suggestedTitle).toBe('The Hobbit')
    expect(candidate.chapters.map((c) => c.title)).toEqual([
      '1 - Chapter One',
      '2 - Chapter Two',
      '10 - Chapter Ten',
    ])
    expect(candidate.coverCandidates).toHaveLength(1)
    expect(candidate.coverCandidates[0].name).toBe('cover.jpg')
    expect(candidate.skipped.map((s) => s.name)).toEqual(['The Hobbit/notes.txt'])
  })

  it('falls back to a manual title when there is no common folder', () => {
    const files = [
      new File(['x'], '1.mp3', { type: 'audio/mpeg' }),
      new File(['x'], '2.mp3', { type: 'audio/mpeg' }),
    ]
    const candidate = buildImportCandidate(files, 'My Book')
    expect(candidate.suggestedTitle).toBe('My Book')
    expect(candidate.chapters).toHaveLength(2)
  })
})
