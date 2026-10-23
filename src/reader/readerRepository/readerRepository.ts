// Services
import { db } from '@/services/db'
// Types
import type { BookFormat, ReaderBook, ReaderLocation, ReadingBookmark } from '../types'
// Utils
import { uid } from '@/utils/id'
import { createImageThumbnail } from '@/utils/imageThumbnail'

const FORMATS: Record<string, BookFormat> = { pdf: 'pdf', epub: 'epub', fb2: 'fb2', txt: 'txt', md: 'md', markdown: 'md', html: 'html', htm: 'html', docx: 'docx', jpg: 'image', jpeg: 'image', png: 'image', webp: 'image' }
export const BOOK_ACCEPT = '.pdf,.epub,.fb2,.fb2.zip,.txt,.md,.markdown,.html,.htm,.docx,.jpg,.jpeg,.png,.webp'
export const MAX_BOOK_BYTES = 150 * 1024 * 1024

export function bookFormat(name: string): BookFormat | null {
  return /\.fb2\.zip$/i.test(name) ? 'fb2' : FORMATS[name.toLowerCase().split('.').pop() ?? ''] ?? null
}
export function listBooks(): Promise<ReaderBook[]> { return db.readerBooks.orderBy('addedAt').reverse().toArray() }
export async function getBookFile(id: string): Promise<Blob> {
  const record = await db.readerFiles.get(id)
  if (!record) throw new Error('This book is no longer stored. Add the original file again.')
  return record.blob
}
export async function removeBook(id: string): Promise<void> {
  await db.transaction('rw', db.readerBooks, db.readerFiles, db.readerCovers, async () => {
    await Promise.all([db.readerBooks.delete(id), db.readerFiles.delete(id), db.readerCovers.delete(id)])
  })
}
export async function saveLocation(id: string, location: ReaderLocation): Promise<void> {
  if (![location.page, location.totalPages, location.progress].every(Number.isFinite)) return
  await db.readerBooks.update(id, {
    page: Math.max(1, Math.floor(location.page)), totalPages: Math.max(1, Math.floor(location.totalPages)),
    progress: Math.min(1, Math.max(0, location.progress)), lastReadAt: Date.now(),
  })
}
export async function saveBookmarks(id: string, bookmarks: ReadingBookmark[]): Promise<void> { await db.readerBooks.update(id, { bookmarks }) }

export async function importBook(file: File, signal?: AbortSignal): Promise<{ book: ReaderBook; duplicate: boolean }> {
  const format = bookFormat(file.name)
  if (!format) throw new Error('Unsupported format. Add PDF, EPUB, FB2, TXT, Markdown, HTML, DOCX, JPG, PNG or WebP.')
  if (!file.size) throw new Error('The file is empty.')
  if (file.size > MAX_BOOK_BYTES) throw new Error('This file exceeds the 150 MB book limit.')
  const fingerprint = JSON.stringify([file.name, file.size, file.lastModified])
  const existing = await db.readerBooks.where('fingerprint').equals(fingerprint).first()
  if (existing) return { book: existing, duplicate: true }
  signal?.throwIfAborted()
  let title = file.name.replace(/\.(fb2\.zip|[^.]+)$/i, '')
  let author: string | undefined
  let cover: Blob | undefined
  let totalPages = format === 'image' ? 1 : 0
  if (format === 'pdf') {
    const { inspectPdf } = await import('../pdfDocument/pdfDocument')
    const info = await inspectPdf(file, signal)
    title = info.title || title; author = info.author; cover = info.cover; totalPages = info.totalPages
  } else if (format === 'image') {
    if (file.size > 25 * 1024 * 1024) throw new Error('Images must be smaller than 25 MB.')
    const { imageType } = await import('../parseDocument/documentAssets')
    if (!imageType(new Uint8Array(await file.arrayBuffer()))) throw new Error('This file is not a supported raster image.')
    signal?.throwIfAborted()
    cover = await createImageThumbnail(file)
  } else {
    const { parseDocument } = await import('../parseDocument/parseDocument')
    const parsed = await parseDocument(file, file.name, signal)
    try {
      title = parsed.title || title; author = parsed.author
      if (parsed.cover) cover = await createImageThumbnail(parsed.cover).catch(() => undefined)
    } finally { parsed.dispose() }
  }
  signal?.throwIfAborted()
  const book: ReaderBook = { id: uid(), title: title.slice(0, 500), author: author?.slice(0, 300), fileName: file.name, format, size: file.size, fingerprint, addedAt: Date.now(), hasCover: !!cover, page: 1, totalPages, progress: 0, bookmarks: [] }
  await db.transaction('rw', db.readerBooks, db.readerFiles, db.readerCovers, async () => {
    signal?.throwIfAborted()
    await db.readerBooks.add(book)
    await db.readerFiles.add({ id: book.id, blob: file })
    if (cover) await db.readerCovers.add({ id: book.id, blob: cover })
  })
  return { book, duplicate: false }
}
