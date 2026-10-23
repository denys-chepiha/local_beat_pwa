// Core
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Components
import ReaderScreen from './ReaderScreen'
// Types
import type { ReaderBook, ReaderLocation, ReaderOutline, ReaderViewHandle, ReadingPreferences } from '@/reader/types'

const mocks = vi.hoisted(() => ({
  getBook: vi.fn(), getBookFile: vi.fn(), listBooks: vi.fn(), getCover: vi.fn(),
  saveLocation: vi.fn(), saveBookmarks: vi.fn(), openReader: vi.fn(),
  goToPage: vi.fn(), goToProgress: vi.fn(), goToOutline: vi.fn(), goToMatch: vi.fn(), search: vi.fn(),
  flowProps: vi.fn(), pdfProps: vi.fn(), rendererReady: true,
}))

vi.mock('@/services/db', () => ({ db: { readerBooks: { get: mocks.getBook }, readerCovers: { get: mocks.getCover } } }))
vi.mock('@/reader/readerRepository/readerRepository', () => ({
  BOOK_ACCEPT: '.epub,.pdf', getBookFile: mocks.getBookFile, listBooks: mocks.listBooks,
  saveLocation: mocks.saveLocation, saveBookmarks: mocks.saveBookmarks, importBook: vi.fn(), removeBook: vi.fn(),
}))
vi.mock('@/store/useUiStore', () => ({
  useUiStore: (selector: (state: { openReader: typeof mocks.openReader }) => unknown) => selector({ openReader: mocks.openReader }),
}))

type FlowProps = {
  fileName: string
  initialProgress: number
  preferences: ReadingPreferences
  onLocation: (location: ReaderLocation) => void
  onOutline: (outline: ReaderOutline[]) => void
}
vi.mock('@/components/FlowView/FlowView', async () => {
  const { forwardRef, useEffect, useImperativeHandle } = await import('react')
  return { default: forwardRef<ReaderViewHandle, FlowProps>(function FakeFlow(props, ref) {
    mocks.flowProps(props)
    useEffect(() => { props.onOutline([{ id: 'chapter-two', title: 'Second chapter' }]) }, [props.onOutline])
    useEffect(() => {
      if (mocks.rendererReady) props.onLocation({ page: Math.round(props.initialProgress * 9) + 1, totalPages: 10, progress: props.initialProgress })
    }, [props.initialProgress, props.onLocation])
    useImperativeHandle(ref, () => ({
      goToPage: (page) => { mocks.goToPage(page); props.onLocation({ page, totalPages: 10, progress: (page - 1) / 9 }) },
      goToProgress: mocks.goToProgress, goToOutline: mocks.goToOutline, goToMatch: mocks.goToMatch, search: mocks.search,
    }))
    return <div aria-label="Flow document">{props.fileName}</div>
  }) }
})
vi.mock('@/components/PdfView/PdfView', async () => {
  const { forwardRef, useEffect, useImperativeHandle } = await import('react')
  return { default: forwardRef<ReaderViewHandle, { zoom: number; rotation: number; initialPage: number; initialProgress: number; onLocation: FlowProps['onLocation'] }>(function FakePdf(props, ref) {
    mocks.pdfProps(props)
    useEffect(() => {
      if (mocks.rendererReady) props.onLocation({ page: props.initialPage, totalPages: 10, progress: props.initialProgress })
    }, [props.initialPage, props.initialProgress, props.onLocation])
    useImperativeHandle(ref, () => ({ goToPage: mocks.goToPage, goToProgress: mocks.goToProgress, goToOutline: mocks.goToOutline, goToMatch: mocks.goToMatch, search: mocks.search }))
    return <div aria-label="PDF document" />
  }) }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function book(overrides: Partial<ReaderBook> = {}): ReaderBook {
  return { id: 'book-one', title: 'Local chapters', author: 'A Reader', fileName: 'chapters.epub', format: 'epub', size: 20,
    fingerprint: 'one', addedAt: 1, hasCover: false, page: 2, totalPages: 10, progress: 1 / 9, bookmarks: [], ...overrides }
}
function LibraryHarness() {
  const [id, setId] = useState<string>()
  mocks.openReader.mockImplementation(setId)
  return <ReaderScreen bookId={id} />
}
async function openBook(value = book()) {
  mocks.getBook.mockResolvedValue(value)
  const result = render(<ReaderScreen bookId={value.id} />)
  await screen.findByRole('heading', { name: value.title })
  return result
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.rendererReady = true
  localStorage.clear()
  document.body.style.overflow = ''
  mocks.getBook.mockResolvedValue(book())
  mocks.getBookFile.mockResolvedValue(new Blob(['local document']))
  mocks.listBooks.mockResolvedValue([book()])
  mocks.getCover.mockResolvedValue(undefined)
  mocks.saveLocation.mockResolvedValue(undefined)
  mocks.saveBookmarks.mockResolvedValue(undefined)
  mocks.search.mockResolvedValue([{ id: 'match-one', label: 'A matching paragraph' }])
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.style.overflow = '' })

describe('ReaderScreen', () => {
  it('keeps page controls disabled until the renderer replaces the saved pagination with a ready location', async () => {
    mocks.rendererReady = false
    await openBook(book({ page: 22, totalPages: 100 }))
    vi.useFakeTimers()
    const input = screen.getByRole('spinbutton', { name: 'Page number' })
    const next = screen.getByRole('button', { name: 'Next page' })
    expect(screen.queryByRole('slider', { name: 'Reading progress' })).not.toBeInTheDocument()
    expect(input).toHaveValue(22)
    expect(input).toBeDisabled()
    expect(next).toBeDisabled()
    fireEvent.click(next)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mocks.goToPage).not.toHaveBeenCalled()
    expect(mocks.saveLocation).not.toHaveBeenCalled()

    const props = mocks.flowProps.mock.calls[mocks.flowProps.mock.calls.length - 1][0] as FlowProps
    act(() => props.onLocation({ page: 2, totalPages: 10, progress: 1 / 9 }))
    expect(input).toBeEnabled()
    expect(input).toHaveValue(2)
    expect(input).toHaveAttribute('max', '10')
    expect(next).toBeEnabled()
    fireEvent.click(next)
    expect(mocks.goToPage).toHaveBeenCalledWith(3)
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(mocks.saveLocation).toHaveBeenLastCalledWith('book-one', { page: 3, totalPages: 10, progress: 2 / 9 })
  })

  it('opens a library book, sends page controls to its view, and saves the latest place before returning', async () => {
    render(<LibraryHarness />)
    fireEvent.click(await screen.findByRole('button', { name: 'Read Local chapters' }))
    await screen.findByLabelText('Flow document')
    expect(mocks.getBookFile).toHaveBeenCalledWith('book-one')
    expect(screen.getByRole('spinbutton', { name: 'Page number' })).toHaveValue(2)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(mocks.goToPage).toHaveBeenLastCalledWith(3)
    const input = screen.getByRole('spinbutton', { name: 'Page number' })
    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.submit(input.closest('form')!)
    expect(mocks.goToPage).toHaveBeenLastCalledWith(7)
    fireEvent.change(input, { target: { value: '9' } }); fireEvent.submit(input.closest('form')!)
    fireEvent.click(screen.getByRole('button', { name: 'Back to book library' }))
    await screen.findByRole('button', { name: 'Read Local chapters' })
    expect(mocks.saveLocation).toHaveBeenLastCalledWith('book-one', { page: 9, totalPages: 10, progress: 8 / 9 })
    expect(screen.queryByLabelText('Flow document')).not.toBeInTheDocument()
  })

  it('applies and persists reading mode, type and theme across reopening', async () => {
    const first = await openBook()
    fireEvent.change(screen.getByRole('combobox', { name: 'Reading mode' }), { target: { value: 'scroll' } })
    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }))
    fireEvent.click(screen.getByRole('button', { name: 'Night' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Reading font' }), { target: { value: 'sans' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Text size' }), { target: { value: '24' } })
    expect(mocks.flowProps).toHaveBeenLastCalledWith(expect.objectContaining({ preferences: expect.objectContaining({ mode: 'scroll', theme: 'night', font: 'sans', fontSize: 24 }) }))
    first.unmount()
    await openBook()
    expect(screen.getByRole('combobox', { name: 'Reading mode' })).toHaveValue('scroll')
    expect(screen.getByRole('main')).toHaveAttribute('data-theme', 'night')
    expect(JSON.parse(localStorage.getItem('local-beat-reading')!)).toMatchObject({ mode: 'scroll', theme: 'night', fontSize: 24 })
  })

  it('routes contents and search results to the loaded view', async () => {
    await openBook()
    fireEvent.click(screen.getByRole('button', { name: 'Contents' }))
    fireEvent.click(screen.getByRole('button', { name: 'Second chapter' }))
    expect(mocks.goToOutline).toHaveBeenCalledWith('chapter-two')
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find text' }), { target: { value: '  matching  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find' }))
    fireEvent.click(await screen.findByRole('button', { name: 'A matching paragraph' }))
    expect(mocks.search).toHaveBeenCalledWith('matching')
    expect(mocks.goToMatch).toHaveBeenCalledWith({ id: 'match-one', label: 'A matching paragraph' })
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('blocks overlapping bookmark writes, preserves failed removals, and retries from the current list', async () => {
    const first = { id: 'first', label: 'Page 3', page: 3, progress: 2 / 9 }
    const second = { id: 'second', label: 'Page 8', page: 8, progress: 7 / 9 }
    const pending = deferred<void>()
    mocks.saveBookmarks.mockReturnValueOnce(pending.promise)
    await openBook(book({ bookmarks: [first, second] }))
    fireEvent.click(screen.getByRole('button', { name: 'Bookmarks' }))
    const removeFirst = screen.getByRole('button', { name: 'Remove bookmark Page 3' })
    const removeSecond = screen.getByRole('button', { name: 'Remove bookmark Page 8' })
    act(() => { removeFirst.click(); removeSecond.click() })
    expect(mocks.saveBookmarks).toHaveBeenCalledTimes(1)
    expect(removeSecond).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Bookmark page 2' })).toBeDisabled()
    await act(async () => { pending.reject(new Error('quota')) })
    expect(screen.getByRole('alert')).toHaveTextContent('bookmark could not be saved')
    expect(removeFirst).toBeEnabled()
    expect(removeSecond).toBeEnabled()
    fireEvent.click(removeFirst)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove bookmark Page 3' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Remove bookmark Page 8' }))
    await screen.findByText('Save a place to return to later.')
    expect(mocks.saveBookmarks.mock.calls.map(([, marks]) => marks)).toEqual([[second], [second], []])
  })

  it('waits for an in-flight save and the newer location before navigating back', async () => {
    await openBook()
    vi.useFakeTimers()
    const first = deferred<void>()
    const second = deferred<void>()
    mocks.saveLocation.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to book library' }))
    expect(mocks.saveLocation).toHaveBeenCalledTimes(1)
    expect(mocks.openReader).not.toHaveBeenCalled()
    await act(async () => { first.resolve() })
    expect(mocks.saveLocation).toHaveBeenLastCalledWith('book-one', { page: 4, totalPages: 10, progress: 1 / 3 })
    expect(mocks.openReader).not.toHaveBeenCalled()
    await act(async () => { second.resolve() })
    expect(mocks.openReader).toHaveBeenCalledOnce()
  })

  it('uses full-window reading when native fullscreen rejects and restores body scrolling', async () => {
    document.body.style.overflow = 'clip'
    const result = await openBook()
    Object.defineProperty(screen.getByRole('main'), 'requestFullscreen', { value: vi.fn().mockRejectedValue(new Error('unsupported')) })
    fireEvent.click(screen.getByRole('button', { name: 'Enter reading fullscreen' }))
    await screen.findByRole('button', { name: 'Exit reading fullscreen' })
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.body.style.overflow).toBe('clip')
    fireEvent.click(screen.getByRole('button', { name: 'Enter reading fullscreen' }))
    await screen.findByRole('button', { name: 'Exit reading fullscreen' })
    result.unmount()
    expect(document.body.style.overflow).toBe('clip')
  })

  it.each(['resolve', 'reject'] as const)('ignores an older book load that will %s after navigation', async (outcome) => {
    const oldMetadata = deferred<ReaderBook>()
    const oldFile = deferred<Blob>()
    mocks.getBook.mockImplementation((id) => id === 'old' ? oldMetadata.promise : Promise.resolve(book({ id: 'new', title: 'New book', fileName: 'new.epub' })))
    mocks.getBookFile.mockImplementation((id) => id === 'old' ? oldFile.promise : Promise.resolve(new Blob(['new'])))
    const result = render(<ReaderScreen bookId="old" />)
    expect(screen.getByRole('status')).toHaveTextContent('Opening book')
    result.rerender(<ReaderScreen bookId="new" />)
    await screen.findByRole('heading', { name: 'New book' })
    await act(async () => {
      oldMetadata.resolve(book({ id: 'old', title: 'Old book' }))
      if (outcome === 'resolve') oldFile.resolve(new Blob(['old']))
      else oldFile.reject(new Error('Old file failed'))
    })
    expect(screen.getByRole('heading', { name: 'New book' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mocks.flowProps.mock.calls.every(([props]) => props.fileName === 'new.epub')).toBe(true)
  })

  it('passes fit-page, zoom and rotation choices to the PDF view', async () => {
    await openBook(book({ format: 'pdf', fileName: 'local.pdf' }))
    await screen.findByLabelText('PDF document')
    expect(mocks.pdfProps).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 0, rotation: 0 }))
    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Document zoom' }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rotate page' }))
    expect(mocks.pdfProps).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 2, rotation: 90 }))
  })

  it('releases the image document URL when returning to the library', async () => {
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = disconnect })
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:reader-image')
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const result = await openBook(book({ format: 'image', fileName: 'photo.png' }))
    expect(screen.getByRole('img', { name: 'Opened document' })).toHaveAttribute('src', 'blob:reader-image')
    expect(create).toHaveBeenCalledOnce()
    result.rerender(<ReaderScreen />)
    await screen.findByRole('heading', { name: 'Reader' })
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:reader-image')
    expect(disconnect).toHaveBeenCalledOnce()
  })
})


it('uses named icon actions and leaves only the exit control in immersive reading', async () => {
  await openBook()
  for (const name of ['Appearance', 'Contents', 'Search', 'Bookmarks']) {
    const button = screen.getByRole('button', { name })
    expect(button.querySelector('svg')).not.toBeNull()
    expect(button.textContent).toBe('')
  }
  fireEvent.click(screen.getByRole('button', { name: 'Enter reading fullscreen' }))
  await screen.findByRole('button', { name: 'Exit reading fullscreen' })
  expect(screen.queryByRole('button', { name: 'Appearance' })).not.toBeInTheDocument()
  expect(screen.queryByRole('spinbutton', { name: 'Page number' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Exit reading fullscreen' })).toHaveClass('reader-exit-fullscreen')
  fireEvent.click(screen.getByRole('button', { name: 'Exit reading fullscreen' }))
  await screen.findByRole('button', { name: 'Appearance' })
})

it('does not change PDF pages while panning at 300 percent or after a pinch', async () => {
  await openBook(book({ format: 'pdf' }))
  await screen.findByLabelText('PDF document')
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }))
  fireEvent.change(screen.getByLabelText('Document zoom'), { target: { value: '3' } })
  const page = screen.getByLabelText('Document pages')
  fireEvent.touchStart(page, { touches: [{ clientX: 300, clientY: 100 }] })
  fireEvent.touchEnd(page, { changedTouches: [{ clientX: 50, clientY: 100 }] })
  expect(mocks.goToPage).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Document zoom'), { target: { value: '1' } })
  fireEvent.touchStart(page, { touches: [{ clientX: 300, clientY: 100 }] })
  fireEvent.touchStart(page, { touches: [{ clientX: 300, clientY: 100 }, { clientX: 400, clientY: 100 }] })
  fireEvent.touchEnd(page, { changedTouches: [{ clientX: 50, clientY: 100 }] })
  expect(mocks.goToPage).not.toHaveBeenCalled()
})
