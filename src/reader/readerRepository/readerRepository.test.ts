// Core
import { Blob as NativeBlob, File as NativeFile } from 'node:buffer'
import Dexie from 'dexie'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Services
import { db } from '@/services/db'
// Repositories
import { BOOK_ACCEPT, MAX_BOOK_BYTES, bookFormat, getBookFile, importBook, listBooks, removeBook, saveBookmarks, saveLocation } from './readerRepository'
// Types
import type { ReaderBook, ReadingBookmark } from '../types'

const mocks = vi.hoisted(() => ({ parseDocument: vi.fn(), inspectPdf: vi.fn(), thumbnail: vi.fn(), dispose: vi.fn() }))

vi.mock('../parseDocument/parseDocument', () => ({ parseDocument: mocks.parseDocument }))
vi.mock('../pdfDocument/pdfDocument', () => ({ inspectPdf: mocks.inspectPdf }))
vi.mock('@/utils/imageThumbnail', () => ({ createImageThumbnail: mocks.thumbnail }))

// Native Blob structured cloning exercises stored bytes, rather than jsdom's
// File shim, which fake-indexeddb cannot clone with its content intact.
function file(name = 'book.epub', content = 'original document bytes', lastModified = 1700000000000): File {
  return new NativeFile([content], name, { type: 'application/octet-stream', lastModified }) as unknown as File
}

function blob(content: string, type: string): Blob {
  return new NativeBlob([content], { type }) as unknown as Blob
}

async function storedText(value: Blob): Promise<string> { return value.text() }

beforeEach(async () => {
  await db.delete()
  await db.open()
  mocks.dispose.mockReset()
  mocks.parseDocument.mockReset().mockImplementation(async () => ({
    title: 'Parsed book', author: 'Local Author', cover: blob('original cover', 'image/png'),
    html: '<p>Document</p>', text: 'Document', outline: [], dispose: mocks.dispose,
  }))
  mocks.inspectPdf.mockReset().mockResolvedValue({ title: 'PDF title', author: 'PDF author', totalPages: 12, cover: blob('PDF cover', 'image/webp') })
  mocks.thumbnail.mockReset().mockResolvedValue(blob('small cover', 'image/webp'))
})

afterEach(() => vi.restoreAllMocks())
afterAll(async () => { await db.delete() })

describe('reader import validation', () => {
  it.each([
    ['book.PDF', 'pdf'], ['book.ePub', 'epub'], ['book.FB2', 'fb2'], ['book.fb2.ZIP', 'fb2'],
    ['notes.TXT', 'txt'], ['notes.md', 'md'], ['notes.markdown', 'md'], ['page.htm', 'html'],
    ['page.HTML', 'html'], ['document.docx', 'docx'], ['photo.JPG', 'image'], ['photo.jpeg', 'image'],
    ['photo.png', 'image'], ['photo.webp', 'image'],
  ])('recognizes %s from its filename', (name, expected) => {
    expect(bookFormat(name)).toBe(expected)
    const extension = name.slice(name.lastIndexOf('.')).toLowerCase()
    expect(BOOK_ACCEPT.split(',')).toContain(extension === '.zip' ? '.fb2.zip' : extension)
  })

  it.each(['book.exe', 'book.pdf.exe', 'archive.zip', 'document.doc', 'no-extension'])('rejects unsupported filename %s', async (name) => {
    expect(bookFormat(name)).toBeNull()
    await expect(importBook(file(name))).rejects.toThrow(/Unsupported format/)
    expect(mocks.parseDocument).not.toHaveBeenCalled()
    expect(await db.readerBooks.count()).toBe(0)
  })

  it('rejects empty and oversized files before parsing or saving', async () => {
    await expect(importBook(file('empty.txt', ''))).rejects.toThrow(/empty/i)
    const oversized = file('large.pdf')
    Object.defineProperty(oversized, 'size', { value: MAX_BOOK_BYTES + 1 })
    await expect(importBook(oversized)).rejects.toThrow(/limit/)
    expect(mocks.inspectPdf).not.toHaveBeenCalled()
    expect(mocks.parseDocument).not.toHaveBeenCalled()
    expect(await db.readerFiles.count()).toBe(0)
  })

  it('rejects oversized images before requesting a thumbnail', async () => {
    const image = file('large.png')
    Object.defineProperty(image, 'size', { value: 25 * 1024 * 1024 + 1 })
    await expect(importBook(image)).rejects.toThrow(/25 MB/)
    expect(mocks.thumbnail).not.toHaveBeenCalled()
  })

  it('rejects an already cancelled import without parsing or writing', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(importBook(file(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.parseDocument).not.toHaveBeenCalled()
    expect(await db.readerBooks.count()).toBe(0)
  })
})

describe('reader persistence', () => {
  it('rejects huge raster dimensions before creating a decoded thumbnail', async () => {
    const png = new Uint8Array(24); png.set([137, 80, 78, 71, 13, 10, 26, 10]); const view = new DataView(png.buffer); view.setUint32(16, 100000); view.setUint32(20, 100000)
    await expect(importBook(new NativeFile([png], 'huge.png') as unknown as File)).rejects.toThrow('too many pixels')
    expect(mocks.thumbnail).not.toHaveBeenCalled(); expect(await db.readerBooks.count()).toBe(0)
  })

  it('persists metadata, original file bytes and a thumbnail across database reopen', async () => {
    const source = file()
    const result = await importBook(source)
    expect(result.duplicate).toBe(false)
    expect(result.book).toMatchObject({
      title: 'Parsed book', author: 'Local Author', fileName: source.name, format: 'epub',
      size: source.size, hasCover: true, page: 1, progress: 0, bookmarks: [],
    })
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
    db.close()
    await db.open()
    expect(await listBooks()).toEqual([result.book])
    expect(await storedText(await getBookFile(result.book.id))).toBe('original document bytes')
    const cover = await db.readerCovers.get(result.book.id)
    expect(cover?.blob.type).toBe('image/webp')
    expect(await storedText(cover!.blob)).toBe('small cover')
  })

  it('saves PDF inspection metadata and image files with one page', async () => {
    const pdf = await importBook(file('pages.pdf'))
    expect(pdf.book).toMatchObject({ title: 'PDF title', author: 'PDF author', totalPages: 12, format: 'pdf', hasCover: true })
    expect(await storedText((await db.readerCovers.get(pdf.book.id))!.blob)).toBe('PDF cover')
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6qUAAAAAASUVORK5CYII='), (value) => value.charCodeAt(0))
    const image = await importBook(new NativeFile([png], 'picture.png') as unknown as File)
    expect(image.book).toMatchObject({ title: 'picture', format: 'image', totalPages: 1, hasCover: true })
    expect(mocks.parseDocument).not.toHaveBeenCalled()
  })

  it('preserves the file even when optional cover generation fails', async () => {
    mocks.thumbnail.mockRejectedValueOnce(new Error('Decoder unavailable'))
    const { book } = await importBook(file())
    expect(book.hasCover).toBe(false)
    expect(await db.readerCovers.count()).toBe(0)
    expect(await storedText(await getBookFile(book.id))).toBe('original document bytes')
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
  })

  it('returns an existing duplicate without parsing or replacing saved reading state', async () => {
    const first = await importBook(file())
    await saveLocation(first.book.id, { page: 4, totalPages: 10, progress: 0.4 })
    const second = await importBook(file())
    expect(second.duplicate).toBe(true)
    expect(second.book).toMatchObject({ id: first.book.id, page: 4, progress: 0.4 })
    expect(mocks.parseDocument).toHaveBeenCalledTimes(1)
    expect(await db.readerBooks.count()).toBe(1)
    expect(await db.readerFiles.count()).toBe(1)
    expect(await db.readerCovers.count()).toBe(1)
  })

  it('keeps concurrent imports from creating duplicate metadata or orphan payloads', async () => {
    const outcomes = await Promise.allSettled([importBook(file()), importBook(file())])
    const successful = outcomes.filter((outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof importBook>>> => outcome.status === 'fulfilled')
    expect(successful.length).toBeGreaterThan(0)
    expect(new Set(successful.map((outcome) => outcome.value.book.id)).size).toBe(1)
    for (const outcome of outcomes) if (outcome.status === 'rejected') expect(outcome.reason).toMatchObject({ name: 'ConstraintError' })
    expect(await db.readerBooks.count()).toBe(1)
    expect(await db.readerFiles.count()).toBe(1)
    expect(await db.readerCovers.count()).toBe(1)
  })

  it('treats a changed file size or modification time as a new document', async () => {
    await importBook(file())
    expect((await importBook(file('book.epub', 'changed bytes'))).duplicate).toBe(false)
    expect((await importBook(file('book.epub', 'original document bytes', 1700000000001))).duplicate).toBe(false)
    expect(await db.readerBooks.count()).toBe(3)
  })

  it('removes metadata, source and cover while retaining another book', async () => {
    const removed = await importBook(file('first.epub'))
    const retained = await importBook(file('second.epub'))
    await removeBook(removed.book.id)
    expect(await listBooks()).toEqual([retained.book])
    expect(await db.readerFiles.get(removed.book.id)).toBeUndefined()
    expect(await db.readerCovers.get(removed.book.id)).toBeUndefined()
    await expect(getBookFile(removed.book.id)).rejects.toThrow(/no longer stored/)
    expect(await getBookFile(retained.book.id)).toBeDefined()
    expect(await db.readerCovers.get(retained.book.id)).toBeDefined()
  })

  it('stores bookmarks and reading state without recreating a removed book', async () => {
    const { book } = await importBook(file())
    const bookmarks: ReadingBookmark[] = [{ id: 'bookmark-1', page: 2, progress: 0.2, label: 'Saved passage' }]
    await saveBookmarks(book.id, bookmarks)
    await saveLocation(book.id, { page: 2, totalPages: 10, progress: 0.2 })
    expect(await db.readerBooks.get(book.id)).toMatchObject({ bookmarks, page: 2, totalPages: 10, progress: 0.2, lastReadAt: expect.any(Number) })
    await removeBook(book.id)
    await saveLocation(book.id, { page: 3, totalPages: 10, progress: 0.3 })
    await saveBookmarks(book.id, bookmarks)
    expect(await db.readerBooks.count()).toBe(0)
    expect(await db.readerFiles.count()).toBe(0)
    expect(await db.readerCovers.count()).toBe(0)
  })

  it('ignores non-finite progress and clamps finite values', async () => {
    const { book } = await importBook(file())
    await saveLocation(book.id, { page: Number.NaN, totalPages: 5, progress: 0.3 })
    expect(await db.readerBooks.get(book.id)).toMatchObject({ page: 1, totalPages: 0, progress: 0 })
    await saveLocation(book.id, { page: -4, totalPages: -2, progress: 2 })
    expect(await db.readerBooks.get(book.id)).toMatchObject({ page: 1, totalPages: 1, progress: 1 })
  })

  it.each(['readerFiles', 'readerCovers'] as const)('rolls back every new record when %s fails', async (table) => {
    const retained = await importBook(file('retained.epub'))
    vi.spyOn(db[table], 'add').mockRejectedValueOnce(new Error('Storage unavailable'))
    await expect(importBook(file('new.epub'))).rejects.toThrow('Storage unavailable')
    expect(await listBooks()).toEqual([retained.book])
    expect(await db.readerFiles.count()).toBe(1)
    expect(await db.readerCovers.count()).toBe(1)
    expect(await storedText(await getBookFile(retained.book.id))).toBe('original document bytes')
    expect(mocks.dispose).toHaveBeenCalledTimes(2)
  })

  it('rolls back a failed delete so source, metadata and cover stay together', async () => {
    const { book } = await importBook(file())
    vi.spyOn(db.readerCovers, 'delete').mockRejectedValueOnce(new Error('Delete unavailable'))
    await expect(removeBook(book.id)).rejects.toThrow('Delete unavailable')
    expect(await db.readerBooks.get(book.id)).toEqual(book)
    expect(await getBookFile(book.id)).toBeDefined()
    expect(await db.readerCovers.get(book.id)).toBeDefined()
  })

  it('disposes parser resources and saves nothing when cancelled during metadata work', async () => {
    const controller = new AbortController()
    mocks.thumbnail.mockImplementationOnce(async () => {
      controller.abort()
      return blob('thumbnail', 'image/webp')
    })
    await expect(importBook(file(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
    expect(await db.readerBooks.count()).toBe(0)
    expect(await db.readerFiles.count()).toBe(0)
    expect(await db.readerCovers.count()).toBe(0)
  })
})

it('upgrades v3 additively while preserving music, audiobook, playback and video data', async () => {
  await db.delete()
  const legacy = new Dexie(db.name)
  legacy.version(3).stores({
    playlists: 'id, name, updatedAt', tracks: 'id, playlistId, createdAt', blobs: 'id', playerState: 'id',
    audiobooks: 'id, status, updatedAt, lastListenedAt, fingerprint', audiobookChapters: 'id, bookId, order', audiobookBlobs: 'id', videoFiles: 'id',
  })
  const records: Record<string, { id: string | number } & Record<string, unknown>> = {
    playlists: { id: 'playlist', name: 'Existing music', trackIds: ['track'], updatedAt: 1 },
    tracks: { id: 'track', playlistId: 'playlist', title: 'Existing track', createdAt: 1 },
    blobs: { id: 'track', blob: blob('existing audio', 'audio/mpeg') },
    playerState: { id: 'player', source: 'music', currentTrackId: 'track', currentTime: 24 },
    audiobooks: { id: 'audiobook', title: 'Existing audiobook', status: 'in_progress', fingerprint: 'old-book', updatedAt: 1 },
    audiobookChapters: { id: 'chapter', bookId: 'audiobook', order: 0, lastPosition: 37 },
    audiobookBlobs: { id: 'chapter', blob: blob('existing audiobook audio', 'audio/mpeg') },
    videoFiles: { id: 42, file: file('existing.mp4', 'existing video') },
  }
  try {
    await legacy.open()
    for (const [table, record] of Object.entries(records)) await legacy.table(table).add(record)
  } finally { legacy.close() }
  await db.open()
  expect(db.verno).toBe(4)
  for (const [table, record] of Object.entries(records)) {
    const saved = await db.table(table).get(record.id)
    expect(saved).toBeDefined()
    if (table === 'blobs' || table === 'audiobookBlobs') {
      expect(await storedText(saved.blob)).toBe(await storedText(record.blob as Blob))
    } else if (table === 'videoFiles') expect(await storedText(saved.file)).toBe('existing video')
    else expect(saved).toEqual(record)
  }
  expect(await db.readerBooks.count()).toBe(0)
  const imported = await importBook(file('new.epub'))
  expect(await db.readerBooks.get(imported.book.id)).toEqual<ReaderBook>(imported.book)
  expect(await db.tracks.count()).toBe(1)
  expect(await db.audiobooks.count()).toBe(1)
  expect(await db.videoFiles.count()).toBe(1)
})
