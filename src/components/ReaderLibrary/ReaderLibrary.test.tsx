// Core
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Components
import ReaderLibrary from './ReaderLibrary'
// Types
import type { ReaderBook } from '@/reader/types'

const mocks = vi.hoisted(() => ({ listBooks: vi.fn(), importBook: vi.fn(), removeBook: vi.fn(), getCover: vi.fn() }))
vi.mock('@/services/db', () => ({ db: { readerCovers: { get: mocks.getCover } } }))
vi.mock('@/reader/readerRepository/readerRepository', () => ({ BOOK_ACCEPT: '.epub,.pdf', ...mocks }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function book(id: string, overrides: Partial<ReaderBook> = {}): ReaderBook {
  return { id, title: id, fileName: `${id}.epub`, format: 'epub', size: 20, fingerprint: id,
    addedAt: 1, hasCover: false, page: 1, totalPages: 0, progress: 0, bookmarks: [], ...overrides }
}
const choose = (...names: string[]) => fireEvent.change(screen.getByLabelText('Choose books'), {
  target: { files: names.map((name) => new File(['book'], name, { type: 'application/epub+zip' })) },
})
const observers: TestObserver[] = []
class TestObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  constructor(private readonly callback: IntersectionObserverCallback) { observers.push(this) }
  reveal() { this.callback([{ isIntersecting: true, target: this.observe.mock.calls[0][0] } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
}

beforeEach(() => {
  vi.resetAllMocks()
  observers.length = 0
  vi.stubGlobal('IntersectionObserver', TestObserver)
  mocks.listBooks.mockResolvedValue([])
  mocks.removeBook.mockResolvedValue(undefined)
  mocks.getCover.mockResolvedValue(undefined)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:reader-cover')
  vi.spyOn(URL, 'revokeObjectURL')
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('ReaderLibrary', () => {
  it('rejects input while the initial list is pending, then retains saved books and new imports', async () => {
    const loading = deferred<ReaderBook[]>()
    mocks.listBooks.mockReturnValueOnce(loading.promise)
    mocks.importBook.mockResolvedValue({ book: book('New'), duplicate: false })
    const onOpen = vi.fn()
    render(<ReaderLibrary onOpen={onOpen} />)
    expect(screen.getByRole('button', { name: 'Add books' })).toBeDisabled()
    choose('early.epub')
    expect(mocks.importBook).not.toHaveBeenCalled()
    await act(async () => { loading.resolve([book('Saved')]) })
    expect(screen.getByRole('button', { name: 'Add books' })).toBeEnabled()
    choose('new.epub')
    await screen.findByRole('button', { name: 'Read New' })
    expect(screen.getByRole('button', { name: 'Read Saved' })).toBeInTheDocument()
    expect(mocks.importBook).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Read New' }))
    expect(onOpen).toHaveBeenCalledWith('New')
  })

  it('loads a cover only when its card approaches the viewport and revokes its URL on unmount', async () => {
    const cover = new Blob(['cover'])
    mocks.listBooks.mockResolvedValue([book('Illustrated', { hasCover: true })])
    mocks.getCover.mockResolvedValue({ id: 'Illustrated', blob: cover })
    const result = render(<ReaderLibrary onOpen={vi.fn()} />)
    const card = await screen.findByRole('button', { name: 'Read Illustrated' })
    expect(mocks.getCover).not.toHaveBeenCalled()
    await act(async () => { observers[0].reveal() })
    expect(mocks.getCover).toHaveBeenCalledWith('Illustrated')
    expect(card.querySelector('img')).toHaveAttribute('src', 'blob:reader-cover')
    expect(URL.createObjectURL).toHaveBeenCalledWith(cover)
    expect(observers[0].disconnect).toHaveBeenCalled()
    result.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:reader-cover')
  })

  it('does not create a URL when a filtered-out card finishes loading its cover', async () => {
    const cover = deferred<{ id: string; blob: Blob }>()
    mocks.listBooks.mockResolvedValue([book('Slow cover', { hasCover: true })])
    mocks.getCover.mockReturnValue(cover.promise)
    render(<ReaderLibrary onOpen={vi.fn()} />)
    await screen.findByRole('button', { name: 'Read Slow cover' })
    act(() => observers[0].reveal())
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search library' }), { target: { value: 'missing' } })
    expect(screen.queryByRole('button', { name: 'Read Slow cover' })).not.toBeInTheDocument()
    await act(async () => { cover.resolve({ id: 'Slow cover', blob: new Blob(['cover']) }) })
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it('keeps completed imports when a later file is cancelled and never starts the rest of the batch', async () => {
    mocks.importBook.mockImplementation((file: File, signal: AbortSignal) => {
      if (file.name === 'first.epub') return Promise.resolve({ book: book('First'), duplicate: false })
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true }))
    })
    render(<ReaderLibrary onOpen={vi.fn()} />)
    await screen.findByRole('button', { name: 'Choose your first book' })
    choose('first.epub', 'second.epub', 'third.epub')
    await screen.findByRole('button', { name: 'Read First' })
    await waitFor(() => expect(mocks.importBook).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Stop import' }))
    await screen.findByText(/1 book added · Import stopped/)
    expect(mocks.importBook.mock.calls.map(([file]) => file.name)).toEqual(['first.epub', 'second.epub'])
    expect(screen.getByRole('button', { name: 'Read First' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add books' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('aborts an active import when navigation unmounts the library', async () => {
    const pending = deferred<{ book: ReaderBook; duplicate: boolean }>()
    mocks.importBook.mockReturnValue(pending.promise)
    const result = render(<ReaderLibrary onOpen={vi.fn()} />)
    await screen.findByRole('button', { name: 'Choose your first book' })
    choose('pending.epub', 'later.epub')
    const signal = mocks.importBook.mock.calls[0][1] as AbortSignal
    expect(signal.aborted).toBe(false)
    result.unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => { pending.reject(new DOMException('Stopped', 'AbortError')) })
    expect(mocks.importBook).toHaveBeenCalledOnce()
  })

  it('keeps a book when deletion fails and removes it only after a successful retry', async () => {
    mocks.listBooks.mockResolvedValue([book('Keep me')])
    mocks.removeBook.mockRejectedValueOnce(new Error('storage unavailable'))
    render(<ReaderLibrary onOpen={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Keep me' }))
    expect(mocks.removeBook).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Read Keep me' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await screen.findByRole('button', { name: 'Choose your first book' })
    expect(mocks.removeBook).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: 'Read Keep me' })).not.toBeInTheDocument()
  })
})
