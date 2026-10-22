// Core
import { create } from 'zustand'
// Services
import { db } from '@/services/db'
// Types
import type { Audiobook, AudiobookBlob, AudiobookChapter, AudiobookStatus } from '@/types'
// Utils
import { uid } from '@/utils/id'
import { calculateAudiobookProgress, computeAudiobookStatus } from '@/utils/audiobookProgress'
import { sortFrequentlyListened } from '@/utils/frequentlyListened'
import { createImageThumbnail } from '@/utils/imageThumbnail'

export type AudiobookImportErrorKind = 'storage-full' | 'save-failed' | 'no-chapters'

export class AudiobookImportError extends Error {
  kind: AudiobookImportErrorKind
  constructor(kind: AudiobookImportErrorKind, message: string) {
    super(message)
    this.kind = kind
    this.name = 'AudiobookImportError'
  }
}

function isQuotaExceeded(err: unknown): boolean {
  // Dexie wraps native IDB errors in its own error classes, so check by
  // duck-typed `.name`/`.code` rather than `instanceof DOMException` — that
  // instanceof check fails once the original exception has been wrapped.
  if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) return true
  if (err && typeof err === 'object' && 'name' in err) {
    return (err as { name: unknown }).name === 'QuotaExceededError'
  }
  return false
}

export interface ImportChapterInput {
  file: File
  title: string
  relativePath?: string
  duration: number
}

export interface ImportBookInput {
  title: string
  author?: string
  cover?: Blob
  chapters: ImportChapterInput[]
  fingerprint: string
  /** Set when the user chose "Replace existing book" after a duplicate was found. */
  replaceBookId?: string
}

interface AudiobookStore {
  books: Audiobook[]
  chaptersByBook: Record<string, AudiobookChapter[]>
  loaded: boolean
  importProgress: { done: number; total: number } | null

  loadAll: () => Promise<void>

  findDuplicate: (fingerprint: string) => Audiobook | undefined
  importBook: (input: ImportBookInput) => Promise<Audiobook>

  updateBookMeta: (
    bookId: string,
    patch: { title?: string; author?: string | null; cover?: Blob | null },
  ) => Promise<void>
  renameChapter: (bookId: string, chapterId: string, title: string) => Promise<void>
  deleteBook: (bookId: string) => Promise<void>
  clearAllBooks: () => Promise<void>

  saveChapterProgress: (
    bookId: string,
    chapterId: string,
    patch: { position: number; completed?: boolean },
  ) => Promise<void>
  recordPlayStart: (bookId: string) => Promise<void>
  addListeningTime: (bookId: string, seconds: number) => Promise<void>
  advanceToChapter: (bookId: string, chapterIndex: number) => Promise<void>
  markCompleted: (bookId: string) => Promise<void>
  resetProgress: (bookId: string) => Promise<void>

  getBook: (id: string) => Audiobook | undefined
  getChapters: (bookId: string) => AudiobookChapter[]
  getBlob: (id: string) => Promise<AudiobookBlob | undefined>

  getContinueListening: () => Audiobook[]
  getFrequentlyListened: () => Audiobook[]
  getCompleted: () => Audiobook[]
}

/** Recompute + persist a book's aggregate progress/status from its chapters. */
function deriveBookAggregate(
  book: Audiobook,
  chapters: AudiobookChapter[],
  opts: { currentChapterId: string; currentTime: number; hasStarted: boolean },
): Pick<Audiobook, 'progressPercent' | 'status' | 'totalDuration'> {
  const totalDuration = chapters.reduce((sum, c) => sum + (c.duration || 0), 0)
  const progressPercent = calculateAudiobookProgress({
    chapters,
    currentChapterId: opts.currentChapterId,
    currentPositionInCurrentChapter: opts.currentTime,
  })
  const status: AudiobookStatus =
    book.status === 'completed' && progressPercent < 100
      ? 'completed' // manual completion / "listen again" is handled explicitly elsewhere
      : computeAudiobookStatus(progressPercent, opts.hasStarted)
  return { progressPercent, status, totalDuration }
}

export const useAudiobookStore = create<AudiobookStore>((set, get) => ({
  books: [],
  chaptersByBook: {},
  loaded: false,
  importProgress: null,

  async loadAll() {
    const [books, chapters] = await Promise.all([
      db.audiobooks.orderBy('updatedAt').reverse().toArray(),
      db.audiobookChapters.toArray(),
    ])
    const chaptersByBook: Record<string, AudiobookChapter[]> = {}
    for (const c of chapters) {
      ;(chaptersByBook[c.bookId] ??= []).push(c)
    }
    for (const bookId in chaptersByBook) {
      chaptersByBook[bookId].sort((a, b) => a.order - b.order)
    }
    set({ books, chaptersByBook, loaded: true })
  },

  findDuplicate(fingerprint) {
    return get().books.find((b) => b.fingerprint === fingerprint)
  },

  async importBook(input) {
    if (input.chapters.length === 0) {
      throw new AudiobookImportError('no-chapters', 'No supported chapters were found to import.')
    }

    const now = Date.now()
    const bookId = uid()
    const oldBook = input.replaceBookId ? get().getBook(input.replaceBookId) : undefined
    const oldChapters = input.replaceBookId ? get().getChapters(input.replaceBookId) : []

    const chapterRecords: AudiobookChapter[] = input.chapters.map((c, i) => ({
      id: uid(),
      bookId,
      title: c.title,
      fileName: c.file.name,
      relativePath: c.relativePath,
      mimeType: c.file.type || 'audio/mpeg',
      size: c.file.size,
      order: i,
      duration: c.duration || 0,
      audioBlobId: '', // filled below once id is known
      completed: false,
      lastPosition: 0,
      createdAt: now,
    }))
    chapterRecords.forEach((c) => {
      c.audioBlobId = c.id
    })

    let coverBlobId: string | undefined
    let coverThumbnailBlobId: string | undefined
    let coverThumbBlob: Blob | undefined
    if (input.cover) {
      coverBlobId = `${bookId}:cover`
      try {
        coverThumbBlob = await createImageThumbnail(input.cover)
        coverThumbnailBlobId = `${bookId}:cover-thumb`
      } catch {
        // Thumbnail is a nice-to-have; fall back to the original cover only.
      }
    }

    const totalDuration = chapterRecords.reduce((sum, c) => sum + (c.duration || 0), 0)

    // Preserve progress across a "replace" when the chapter list lines up.
    const canCarryProgress =
      !!oldBook &&
      oldChapters.length === chapterRecords.length &&
      oldChapters.every((oc, i) => oc.fileName === chapterRecords[i].fileName)

    const book: Audiobook = {
      id: bookId,
      title: input.title.trim(),
      author: input.author?.trim() || undefined,
      coverBlobId,
      coverThumbnailBlobId,
      status: canCarryProgress ? oldBook!.status : 'not_started',
      currentChapterId: canCarryProgress ? chapterRecords[oldBook!.currentChapterIndex]?.id : undefined,
      currentChapterIndex: canCarryProgress ? oldBook!.currentChapterIndex : 0,
      currentTime: canCarryProgress ? oldBook!.currentTime : 0,
      totalDuration,
      listenedDuration: canCarryProgress ? oldBook!.listenedDuration : 0,
      progressPercent: canCarryProgress ? oldBook!.progressPercent : 0,
      playCount: canCarryProgress ? oldBook!.playCount : 0,
      totalListeningTime: canCarryProgress ? oldBook!.totalListeningTime : 0,
      fingerprint: input.fingerprint,
      createdAt: canCarryProgress ? oldBook!.createdAt : now,
      updatedAt: now,
      lastOpenedAt: canCarryProgress ? oldBook!.lastOpenedAt : undefined,
      lastListenedAt: canCarryProgress ? oldBook!.lastListenedAt : undefined,
      completedAt: canCarryProgress ? oldBook!.completedAt : undefined,
    }
    if (canCarryProgress) {
      // Carry per-chapter completed/lastPosition too.
      chapterRecords.forEach((c, i) => {
        c.completed = oldChapters[i].completed
        c.lastPosition = oldChapters[i].lastPosition
      })
    }

    set({ importProgress: { done: 0, total: chapterRecords.length } })
    try {
      await db.transaction(
        'rw',
        db.audiobooks,
        db.audiobookChapters,
        db.audiobookBlobs,
        async () => {
          if (input.replaceBookId) {
            await db.audiobooks.delete(input.replaceBookId)
            await db.audiobookChapters.where('bookId').equals(input.replaceBookId).delete()
            const staleBlobIds = [
              ...oldChapters.map((c) => c.audioBlobId),
              oldBook?.coverBlobId,
              oldBook?.coverThumbnailBlobId,
            ].filter((id): id is string => !!id)
            if (staleBlobIds.length > 0) await db.audiobookBlobs.bulkDelete(staleBlobIds)
          }

          for (let i = 0; i < chapterRecords.length; i++) {
            const chapter = chapterRecords[i]
            const blob: AudiobookBlob = { id: chapter.audioBlobId, blob: input.chapters[i].file }
            await db.audiobookBlobs.add(blob)
            await db.audiobookChapters.add(chapter)
            set({ importProgress: { done: i + 1, total: chapterRecords.length } })
          }
          if (coverBlobId) await db.audiobookBlobs.add({ id: coverBlobId, blob: input.cover! })
          if (coverThumbnailBlobId && coverThumbBlob) {
            await db.audiobookBlobs.add({ id: coverThumbnailBlobId, blob: coverThumbBlob })
          }
          await db.audiobooks.add(book)
        },
      )
    } catch (err) {
      set({ importProgress: null })
      if (isQuotaExceeded(err)) {
        throw new AudiobookImportError(
          'storage-full',
          'Not enough free storage on this device to save this audiobook.',
        )
      }
      throw new AudiobookImportError('save-failed', 'Saving the audiobook failed. Nothing was changed.')
    }

    set((s) => {
      const books = input.replaceBookId ? s.books.filter((b) => b.id !== input.replaceBookId) : s.books
      const chaptersByBook = { ...s.chaptersByBook, [bookId]: chapterRecords }
      if (input.replaceBookId) delete chaptersByBook[input.replaceBookId]
      return { books: [book, ...books], chaptersByBook, importProgress: null }
    })
    return book
  },

  async updateBookMeta(bookId, patch) {
    const book = get().getBook(bookId)
    if (!book) return
    const updatedAt = Date.now()
    const dbPatch: Partial<Audiobook> = { updatedAt }
    if (patch.title != null) dbPatch.title = patch.title.trim()
    if (patch.author !== undefined) dbPatch.author = patch.author?.trim() || undefined

    let newCoverBlobs: AudiobookBlob[] = []
    let staleCoverIds: string[] = []
    if (patch.cover !== undefined) {
      const staleIds = [book.coverBlobId, book.coverThumbnailBlobId].filter(
        (id): id is string => !!id,
      )
      staleCoverIds = staleIds
      if (patch.cover === null) {
        dbPatch.coverBlobId = undefined
        dbPatch.coverThumbnailBlobId = undefined
      } else {
        const coverBlobId = `${bookId}:cover:${uid()}`
        let coverThumbnailBlobId: string | undefined
        const newBlobs: AudiobookBlob[] = [{ id: coverBlobId, blob: patch.cover }]
        try {
          const thumb = await createImageThumbnail(patch.cover)
          coverThumbnailBlobId = `${coverBlobId}:thumb`
          newBlobs.push({ id: coverThumbnailBlobId, blob: thumb })
        } catch {
          /* thumbnail optional */
        }
        newCoverBlobs = newBlobs
        dbPatch.coverBlobId = coverBlobId
        dbPatch.coverThumbnailBlobId = coverThumbnailBlobId
      }
    }

    await db.transaction('rw', db.audiobooks, db.audiobookBlobs, async () => {
      if (newCoverBlobs.length) await db.audiobookBlobs.bulkAdd(newCoverBlobs)
      await db.audiobooks.update(bookId, dbPatch)
      if (staleCoverIds.length) await db.audiobookBlobs.bulkDelete(staleCoverIds)
    })
    set((s) => ({
      books: s.books.map((b) => (b.id === bookId ? { ...b, ...dbPatch } : b)),
    }))
  },

  async renameChapter(bookId, chapterId, title) {
    const name = title.trim()
    if (!name) return
    await db.audiobookChapters.update(chapterId, { title: name })
    set((s) => ({
      chaptersByBook: {
        ...s.chaptersByBook,
        [bookId]: (s.chaptersByBook[bookId] ?? []).map((c) =>
          c.id === chapterId ? { ...c, title: name } : c,
        ),
      },
    }))
  },

  async deleteBook(bookId) {
    const book = get().getBook(bookId)
    const chapters = get().getChapters(bookId)
    const blobIds = [
      ...chapters.map((c) => c.audioBlobId),
      book?.coverBlobId,
      book?.coverThumbnailBlobId,
    ].filter((id): id is string => !!id)

    await db.transaction('rw', db.audiobooks, db.audiobookChapters, db.audiobookBlobs, async () => {
      await db.audiobooks.delete(bookId)
      await db.audiobookChapters.where('bookId').equals(bookId).delete()
      if (blobIds.length) await db.audiobookBlobs.bulkDelete(blobIds)
    })

    set((s) => {
      const chaptersByBook = { ...s.chaptersByBook }
      delete chaptersByBook[bookId]
      return { books: s.books.filter((b) => b.id !== bookId), chaptersByBook }
    })
  },

  async clearAllBooks() {
    await db.transaction('rw', db.audiobooks, db.audiobookChapters, db.audiobookBlobs, async () => {
      await db.audiobooks.clear()
      await db.audiobookChapters.clear()
      await db.audiobookBlobs.clear()
    })
    set({ books: [], chaptersByBook: {} })
  },

  async saveChapterProgress(bookId, chapterId, patch) {
    const book = get().getBook(bookId)
    const chapters = get().getChapters(bookId)
    const chapterIndex = chapters.findIndex((c) => c.id === chapterId)
    if (!book || chapterIndex < 0) return
    const now = Date.now()

    const updatedChapters = chapters.map((c, i) =>
      i === chapterIndex
        ? { ...c, lastPosition: patch.position, completed: patch.completed ?? c.completed }
        : c,
    )
    const aggregate = deriveBookAggregate(book, updatedChapters, {
      currentChapterId: chapterId,
      currentTime: patch.position,
      hasStarted: true,
    })

    const bookPatch: Partial<Audiobook> = {
      currentChapterId: chapterId,
      currentChapterIndex: chapterIndex,
      currentTime: patch.position,
      progressPercent: aggregate.progressPercent,
      totalDuration: aggregate.totalDuration,
      status: aggregate.status,
      updatedAt: now,
      lastListenedAt: now,
    }

    await db.transaction('rw', db.audiobooks, db.audiobookChapters, async () => {
      await db.audiobookChapters.update(chapterId, {
        lastPosition: patch.position,
        completed: patch.completed ?? updatedChapters[chapterIndex].completed,
      })
      await db.audiobooks.update(bookId, bookPatch)
    })

    set((s) => ({
      books: s.books.map((b) => (b.id === bookId ? { ...b, ...bookPatch } : b)),
      chaptersByBook: { ...s.chaptersByBook, [bookId]: updatedChapters },
    }))
  },

  async recordPlayStart(bookId) {
    const book = get().getBook(bookId)
    if (!book) return
    const now = Date.now()
    const patch: Partial<Audiobook> = {
      playCount: book.playCount + 1,
      lastOpenedAt: now,
      lastListenedAt: now,
      status: book.status === 'not_started' ? 'in_progress' : book.status,
      updatedAt: now,
    }
    await db.audiobooks.update(bookId, patch)
    set((s) => ({ books: s.books.map((b) => (b.id === bookId ? { ...b, ...patch } : b)) }))
  },

  async addListeningTime(bookId, seconds) {
    if (seconds <= 0) return
    const book = get().getBook(bookId)
    if (!book) return
    const patch: Partial<Audiobook> = {
      totalListeningTime: book.totalListeningTime + seconds,
      listenedDuration: book.listenedDuration + seconds,
    }
    await db.audiobooks.update(bookId, patch)
    set((s) => ({ books: s.books.map((b) => (b.id === bookId ? { ...b, ...patch } : b)) }))
  },

  async advanceToChapter(bookId, chapterIndex) {
    const chapters = get().getChapters(bookId)
    const chapter = chapters[chapterIndex]
    if (!chapter) return
    const patch: Partial<Audiobook> = {
      currentChapterId: chapter.id,
      currentChapterIndex: chapterIndex,
      currentTime: 0,
      updatedAt: Date.now(),
    }
    await db.audiobooks.update(bookId, patch)
    set((s) => ({ books: s.books.map((b) => (b.id === bookId ? { ...b, ...patch } : b)) }))
  },

  async markCompleted(bookId) {
    const now = Date.now()
    const chapters = get().getChapters(bookId)
    await db.transaction('rw', db.audiobooks, db.audiobookChapters, async () => {
      if (chapters.length) {
        await db.audiobookChapters
          .where('bookId')
          .equals(bookId)
          .modify({ completed: true })
      }
      await db.audiobooks.update(bookId, {
        status: 'completed',
        progressPercent: 100,
        completedAt: now,
        updatedAt: now,
      })
    })
    set((s) => ({
      books: s.books.map((b) =>
        b.id === bookId
          ? { ...b, status: 'completed', progressPercent: 100, completedAt: now, updatedAt: now }
          : b,
      ),
      chaptersByBook: {
        ...s.chaptersByBook,
        [bookId]: (s.chaptersByBook[bookId] ?? []).map((c) => ({ ...c, completed: true })),
      },
    }))
  },

  async resetProgress(bookId) {
    const now = Date.now()
    const chapters = get().getChapters(bookId)
    const firstChapterId = chapters[0]?.id
    await db.transaction('rw', db.audiobooks, db.audiobookChapters, async () => {
      if (chapters.length) {
        await db.audiobookChapters
          .where('bookId')
          .equals(bookId)
          .modify({ completed: false, lastPosition: 0 })
      }
      await db.audiobooks.update(bookId, {
        status: 'not_started',
        currentChapterId: firstChapterId,
        currentChapterIndex: 0,
        currentTime: 0,
        progressPercent: 0,
        completedAt: undefined,
        updatedAt: now,
      })
    })
    set((s) => ({
      books: s.books.map((b) =>
        b.id === bookId
          ? {
              ...b,
              status: 'not_started',
              currentChapterId: firstChapterId,
              currentChapterIndex: 0,
              currentTime: 0,
              progressPercent: 0,
              completedAt: undefined,
              updatedAt: now,
            }
          : b,
      ),
      chaptersByBook: {
        ...s.chaptersByBook,
        [bookId]: (s.chaptersByBook[bookId] ?? []).map((c) => ({
          ...c,
          completed: false,
          lastPosition: 0,
        })),
      },
    }))
  },

  getBook(id) {
    return get().books.find((b) => b.id === id)
  },

  getChapters(bookId) {
    return get().chaptersByBook[bookId] ?? []
  },

  async getBlob(id) {
    return db.audiobookBlobs.get(id)
  },

  getContinueListening() {
    return get()
      .books.filter((b) => b.status === 'in_progress')
      .sort((a, b) => (b.lastListenedAt ?? 0) - (a.lastListenedAt ?? 0))
  },

  getFrequentlyListened() {
    return sortFrequentlyListened(get().books)
  },

  getCompleted() {
    return get()
      .books.filter((b) => b.status === 'completed')
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
  },
}))
