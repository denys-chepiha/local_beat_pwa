// Core
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Services
import { db } from '@/services/db'
// Store
import { AudiobookImportError, useAudiobookStore } from '@/store/useAudiobookStore'
import type { ImportChapterInput } from '@/store/useAudiobookStore'
// Types
import type { AudiobookChapter } from '@/types'

function makeFile(name: string, size = 1024, type = 'audio/mpeg'): File {
  return new File([new Uint8Array(size)], name, { type })
}

function makeChapters(count: number, durationEach = 60): ImportChapterInput[] {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, '0')
    return {
      file: makeFile(`${n} - Chapter ${i + 1}.mp3`),
      title: `Chapter ${i + 1}`,
      relativePath: `Book/${n} - Chapter ${i + 1}.mp3`,
      duration: durationEach,
    }
  })
}

beforeEach(async () => {
  await db.audiobooks.clear()
  await db.audiobookChapters.clear()
  await db.audiobookBlobs.clear()
  useAudiobookStore.setState({ books: [], chaptersByBook: {}, loaded: false, importProgress: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('importBook', () => {
  it('saves the book, chapters and blobs to IndexedDB', async () => {
    const cover = makeFile('cover.jpg', 10, 'image/jpeg')
    const book = await useAudiobookStore.getState().importBook({
      title: 'The Hobbit',
      author: 'J.R.R. Tolkien',
      cover,
      chapters: makeChapters(3),
      fingerprint: 'fp-1',
    })

    expect(book.title).toBe('The Hobbit')
    expect(book.status).toBe('not_started')
    expect(book.totalDuration).toBe(180)

    const dbBook = await db.audiobooks.get(book.id)
    expect(dbBook).toBeTruthy()
    const dbChapters = await db.audiobookChapters.where('bookId').equals(book.id).toArray()
    expect(dbChapters).toHaveLength(3)
    expect(dbChapters.map((c) => c.order).sort()).toEqual([0, 1, 2])
    for (const c of dbChapters) {
      expect(await db.audiobookBlobs.get(c.audioBlobId)).toBeTruthy()
    }
    expect(await db.audiobookBlobs.get(dbBook!.coverBlobId!)).toBeTruthy()

    expect(useAudiobookStore.getState().getBook(book.id)?.id).toBe(book.id)
    expect(useAudiobookStore.getState().getChapters(book.id)).toHaveLength(3)
  })

  it('rejects an import with no chapters', async () => {
    await expect(
      useAudiobookStore.getState().importBook({ title: 'Empty', chapters: [], fingerprint: 'fp' }),
    ).rejects.toThrow(AudiobookImportError)
  })

  it('rolls back completely when a write fails partway through (atomicity)', async () => {
    let calls = 0
    const realAdd = db.audiobookChapters.add.bind(db.audiobookChapters)
    vi.spyOn(db.audiobookChapters, 'add').mockImplementation(((record: AudiobookChapter) => {
      calls++
      if (calls === 2) throw new Error('simulated failure')
      return realAdd(record)
    }) as typeof db.audiobookChapters.add)

    await expect(
      useAudiobookStore.getState().importBook({
        title: 'Broken Book',
        chapters: makeChapters(3),
        fingerprint: 'fp-broken',
      }),
    ).rejects.toThrow(AudiobookImportError)

    expect(await db.audiobooks.count()).toBe(0)
    expect(await db.audiobookChapters.count()).toBe(0)
    expect(await db.audiobookBlobs.count()).toBe(0)
    expect(useAudiobookStore.getState().books).toHaveLength(0)
  })

  it('surfaces a storage-full error on QuotaExceededError and leaves existing books untouched', async () => {
    const existing = await useAudiobookStore.getState().importBook({
      title: 'Existing Book',
      chapters: makeChapters(1),
      fingerprint: 'fp-existing',
    })

    vi.spyOn(db.audiobookBlobs, 'add').mockRejectedValue(new DOMException('quota', 'QuotaExceededError'))

    await expect(
      useAudiobookStore.getState().importBook({
        title: 'Too Big Book',
        chapters: makeChapters(2),
        fingerprint: 'fp-toobig',
      }),
    ).rejects.toMatchObject({ kind: 'storage-full' })

    expect(await db.audiobooks.count()).toBe(1)
    expect(await db.audiobooks.get(existing.id)).toBeTruthy()
    expect(useAudiobookStore.getState().books.map((b) => b.id)).toEqual([existing.id])
  })
})

describe('duplicate detection and replace', () => {
  it('findDuplicate matches by fingerprint', async () => {
    const book = await useAudiobookStore.getState().importBook({
      title: 'Dup Book',
      chapters: makeChapters(2),
      fingerprint: 'fp-dup',
    })
    expect(useAudiobookStore.getState().findDuplicate('fp-dup')?.id).toBe(book.id)
    expect(useAudiobookStore.getState().findDuplicate('nope')).toBeUndefined()
  })

  it('replace preserves progress when the chapter list matches', async () => {
    const original = await useAudiobookStore.getState().importBook({
      title: 'Series',
      chapters: makeChapters(2),
      fingerprint: 'fp-a',
    })
    const [ch1] = useAudiobookStore.getState().getChapters(original.id)
    await useAudiobookStore.getState().saveChapterProgress(original.id, ch1.id, {
      position: 30,
      completed: true,
    })

    const replaced = await useAudiobookStore.getState().importBook({
      title: 'Series',
      chapters: makeChapters(2),
      fingerprint: 'fp-a',
      replaceBookId: original.id,
    })

    expect(replaced.id).not.toBe(original.id)
    expect(replaced.progressPercent).toBeGreaterThan(0)
    expect(useAudiobookStore.getState().getBook(original.id)).toBeUndefined()
    const newChapters = useAudiobookStore.getState().getChapters(replaced.id)
    expect(replaced.currentChapterId).toBe(newChapters[0].id)
    expect(newChapters[0].completed).toBe(true)
    expect(newChapters[0].lastPosition).toBe(30)
  })
})

describe('deleteBook', () => {
  it('removes the book, its chapters and all blobs', async () => {
    const cover = makeFile('cover.jpg', 10, 'image/jpeg')
    const book = await useAudiobookStore.getState().importBook({
      title: 'To Delete',
      cover,
      chapters: makeChapters(2),
      fingerprint: 'fp-del',
    })
    const chapters = useAudiobookStore.getState().getChapters(book.id)
    const blobIds = [...chapters.map((c) => c.audioBlobId), book.coverBlobId!]

    await useAudiobookStore.getState().deleteBook(book.id)

    expect(await db.audiobooks.get(book.id)).toBeUndefined()
    expect(await db.audiobookChapters.where('bookId').equals(book.id).count()).toBe(0)
    for (const id of blobIds) {
      expect(await db.audiobookBlobs.get(id)).toBeUndefined()
    }
    expect(useAudiobookStore.getState().getBook(book.id)).toBeUndefined()
  })
})

describe('progress lifecycle', () => {
  it('saveChapterProgress updates the chapter and recomputes the book aggregate + status', async () => {
    const book = await useAudiobookStore.getState().importBook({
      title: 'Prog Book',
      chapters: makeChapters(2, 60),
      fingerprint: 'fp-prog',
    })
    const [ch1] = useAudiobookStore.getState().getChapters(book.id)
    await useAudiobookStore.getState().saveChapterProgress(book.id, ch1.id, { position: 30 })
    const updated = useAudiobookStore.getState().getBook(book.id)!
    expect(updated.status).toBe('in_progress')
    expect(updated.currentChapterId).toBe(ch1.id)
    expect(updated.progressPercent).toBeCloseTo(25, 5) // 30 / 120 * 100
  })

  it('markCompleted sets status/progress and flags all chapters completed', async () => {
    const book = await useAudiobookStore.getState().importBook({
      title: 'Complete Book',
      chapters: makeChapters(2),
      fingerprint: 'fp-complete',
    })
    await useAudiobookStore.getState().markCompleted(book.id)
    const updated = useAudiobookStore.getState().getBook(book.id)!
    expect(updated.status).toBe('completed')
    expect(updated.progressPercent).toBe(100)
    expect(updated.completedAt).toBeTruthy()
    expect(useAudiobookStore.getState().getChapters(book.id).every((c) => c.completed)).toBe(true)
  })

  it('resetProgress clears status/position back to the first chapter', async () => {
    const book = await useAudiobookStore.getState().importBook({
      title: 'Reset Book',
      chapters: makeChapters(2),
      fingerprint: 'fp-reset',
    })
    await useAudiobookStore.getState().markCompleted(book.id)
    await useAudiobookStore.getState().resetProgress(book.id)
    const updated = useAudiobookStore.getState().getBook(book.id)!
    expect(updated.status).toBe('not_started')
    expect(updated.progressPercent).toBe(0)
    expect(updated.currentChapterIndex).toBe(0)
    expect(
      useAudiobookStore.getState().getChapters(book.id).every((c) => !c.completed && c.lastPosition === 0),
    ).toBe(true)
  })

  it('recordPlayStart increments playCount and flips not_started to in_progress', async () => {
    const book = await useAudiobookStore.getState().importBook({
      title: 'Play Book',
      chapters: makeChapters(1),
      fingerprint: 'fp-play',
    })
    await useAudiobookStore.getState().recordPlayStart(book.id)
    const updated = useAudiobookStore.getState().getBook(book.id)!
    expect(updated.playCount).toBe(1)
    expect(updated.status).toBe('in_progress')
    expect(updated.lastOpenedAt).toBeTruthy()
  })
})

it('preserves the old cover if saving replacement metadata fails', async () => {
  const book = await useAudiobookStore.getState().importBook({
    title: 'Cover rollback', chapters: makeChapters(1), fingerprint: 'cover-rollback',
    cover: new Blob(['original'], { type: 'image/png' }),
  })
  const blobCount = await db.audiobookBlobs.count()
  vi.spyOn(db.audiobooks, 'update').mockRejectedValueOnce(new Error('Storage full'))
  await expect(useAudiobookStore.getState().updateBookMeta(book.id, {
    cover: new Blob(['replacement'], { type: 'image/png' }),
  })).rejects.toThrow('Storage full')
  expect(await db.audiobookBlobs.count()).toBe(blobCount)
  expect(await db.audiobookBlobs.get(book.coverBlobId!)).toBeDefined()
  expect(useAudiobookStore.getState().getBook(book.id)?.coverBlobId).toBe(book.coverBlobId)
})
