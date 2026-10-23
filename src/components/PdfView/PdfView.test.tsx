// Core
import { createRef } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Components
import PdfView from './PdfView'
// Types
import type { ReaderViewHandle } from '@/reader/types'

const { load, textCancels } = vi.hoisted(() => ({ load: vi.fn(), textCancels: [] as ReturnType<typeof vi.fn>[] }))
vi.mock('@/reader/pdfDocument/pdfDocument', () => ({ loadPdf: load }))
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ TextLayer: class {
  container: HTMLElement
  cancel = vi.fn()
  constructor({ container }: { container: HTMLElement }) { this.container = container; textCancels.push(this.cancel) }
  async render() { const span = document.createElement('span'); span.textContent = 'Find this phrase'; this.container.appendChild(span) }
} }))

function makeDocument(total = 3) {
  const canvases: HTMLCanvasElement[] = []
  const cancellations: ReturnType<typeof vi.fn>[] = []
  const getPage = vi.fn(async (number: number) => ({
    rotate: 0, userUnit: 1,
    getViewport: ({ scale, rotation = 0 }: { scale: number; rotation?: number }) => ({
      width: (rotation % 180 ? 800 : 600) * scale,
      height: (rotation % 180 ? 600 : 800) * scale, scale, rotation,
    }),
    render: ({ canvas }: { canvas: HTMLCanvasElement }) => {
      canvases.push(canvas)
      const cancel = vi.fn(); cancellations.push(cancel)
      return { promise: Promise.resolve(), cancel }
    },
    streamTextContent: vi.fn(),
    getTextContent: vi.fn(async () => ({ items: [{ str: number === 2 ? 'Another page' : `Find this phrase on page ${number}` }] })),
    cleanup: vi.fn(),
  }))
  return { numPages: total, getPage, canvases, cancellations, getOutline: vi.fn(async () => []), getDestination: vi.fn(), getPageIndex: vi.fn() }
}
const base = () => ({ blob: new Blob(['pdf']), initialProgress: 0, initialPage: 1, mode: 'paged' as const, zoom: 1, rotation: 0, onLocation: vi.fn(), onOutline: vi.fn() })

beforeEach(() => { load.mockReset(); textCancels.length = 0 })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('PdfView', () => {
  it('renders one page, exposes selection and navigation, and releases the old raster', async () => {
    const pdf = makeDocument()
    const destroy = vi.fn(async () => {})
    load.mockReturnValue({ promise: Promise.resolve(pdf), destroy })
    const ref = createRef<ReaderViewHandle>()
    const props = base()
    const result = render(<PdfView ref={ref} {...props} />)
    await waitFor(() => expect(result.container.querySelectorAll('canvas')).toHaveLength(1))
    await waitFor(() => expect(result.container.querySelector('.pdf-text-layer span')).toHaveTextContent('Find this phrase'))
    expect(props.onLocation).toHaveBeenLastCalledWith({ page: 1, totalPages: 3, progress: 0 })
    const first = pdf.canvases[0]
    act(() => ref.current!.goToPage(3))
    await waitFor(() => expect(screen.getByRole('group', { name: 'Page 3' })).toBeInTheDocument())
    await waitFor(() => expect(first.width).toBe(0))
    expect(pdf.cancellations[0]).toHaveBeenCalled()
    expect(textCancels[0]).toHaveBeenCalled()
    expect(props.onLocation).toHaveBeenLastCalledWith({ page: 3, totalPages: 3, progress: 1 })
    result.unmount()
    await waitFor(() => expect(destroy).toHaveBeenCalled())
  })

  it('caps canvas pixels during zoom and rotation while retaining scrollable dimensions', async () => {
    const pdf = makeDocument()
    load.mockReturnValue({ promise: Promise.resolve(pdf), destroy: vi.fn(async () => {}) })
    const { container } = render(<PdfView {...base()} zoom={8} rotation={90} />)
    await waitFor(() => expect(pdf.canvases).toHaveLength(1))
    const canvas = pdf.canvases[0]
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(8_000_000)
    expect(Math.max(canvas.width, canvas.height)).toBeLessThanOrEqual(4096)
    expect(parseFloat(canvas.style.width)).toBeGreaterThan(canvas.width)
    expect(container.querySelector('.pdf-viewport')).toHaveClass('reader-document-viewport')
  })

  it('searches page text and navigates matches without enabling document links', async () => {
    const pdf = makeDocument()
    load.mockReturnValue({ promise: Promise.resolve(pdf), destroy: vi.fn(async () => {}) })
    const ref = createRef<ReaderViewHandle>()
    const { container } = render(<PdfView ref={ref} {...base()} />)
    await waitFor(() => expect(container.querySelector('.pdf-text-layer span')).not.toBeNull())
    let matches: Awaited<ReturnType<ReaderViewHandle['search']>> = []
    await act(async () => { matches = await ref.current!.search('phrase') })
    expect(matches.map((match) => match.page)).toEqual([1, 3])
    expect(container.querySelector('.pdf-text-match')).toHaveTextContent('Find this phrase')
    act(() => ref.current!.goToMatch(matches[1]))
    await waitFor(() => expect(screen.getByRole('group', { name: 'Page 3' })).toBeInTheDocument())
    expect(container.querySelector('a')).toBeNull()
  })

  it('keeps a late document load from replacing the newer document', async () => {
    let resolveOld!: (value: ReturnType<typeof makeDocument>) => void
    const oldPdf = makeDocument(99)
    const newPdf = makeDocument(2)
    load.mockReturnValueOnce({ promise: new Promise((resolve) => { resolveOld = resolve }), destroy: vi.fn(async () => {}) })
      .mockReturnValueOnce({ promise: Promise.resolve(newPdf), destroy: vi.fn(async () => {}) })
    const props = base()
    const { rerender } = render(<PdfView {...props} />)
    rerender(<PdfView {...props} blob={new Blob(['other'])} />)
    await waitFor(() => expect(props.onLocation).toHaveBeenCalledWith({ page: 1, totalPages: 2, progress: 0 }))
    await act(async () => { resolveOld(oldPdf) })
    expect(oldPdf.getPage).not.toHaveBeenCalled()
    expect(props.onLocation).toHaveBeenLastCalledWith({ page: 1, totalPages: 2, progress: 0 })
  })

  it('allows password retries and does not keep the submitted password', async () => {
    let requestPassword!: (submit: (value: string) => void, incorrect: boolean) => void
    load.mockImplementation((_blob: Blob, _signal: AbortSignal, callback: typeof requestPassword) => {
      requestPassword = callback
      return { promise: new Promise(() => {}), destroy: vi.fn(async () => {}) }
    })
    render(<PdfView {...base()} />)
    const submit = vi.fn(() => requestPassword(submit, true))
    act(() => requestPassword(submit, false))
    fireEvent.change(screen.getByLabelText('This PDF needs a password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open document' }))
    expect(submit).toHaveBeenCalledWith('wrong')
    expect(screen.getByRole('alert')).toHaveTextContent('not accepted')
    expect(screen.getByLabelText('This PDF needs a password')).toHaveValue('')
  })

  it('bounds scroll-mode raster allocation even when many pages intersect', async () => {
    let callback!: IntersectionObserverCallback
    vi.stubGlobal('IntersectionObserver', class {
      constructor(next: IntersectionObserverCallback) { callback = next }
      observe() {} disconnect() {}
    })
    const pdf = makeDocument(20)
    load.mockReturnValue({ promise: Promise.resolve(pdf), destroy: vi.fn(async () => {}) })
    const { container } = render(<PdfView {...base()} mode="scroll" />)
    await waitFor(() => expect(container.querySelectorAll('.pdf-page')).toHaveLength(20))
    act(() => callback(Array.from(container.querySelectorAll('.pdf-page')).map((target) => ({ target, isIntersecting: true } as IntersectionObserverEntry)), {} as IntersectionObserver))
    await waitFor(() => expect(container.querySelectorAll('canvas')).toHaveLength(5))
  })
})

it('treats a rejected superseded search as cancellation', async () => {
  const pdf = makeDocument(1)
  const page = await pdf.getPage(1)
  pdf.getPage.mockResolvedValue(page)
  let rejectOld!: (error: Error) => void
  page.getTextContent.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject }))
  load.mockReturnValue({ promise: Promise.resolve(pdf), destroy: vi.fn(async () => {}) })
  const ref = createRef<ReaderViewHandle>()
  const { container } = render(<PdfView ref={ref} {...base()} />)
  await waitFor(() => expect(container.querySelector('canvas')).not.toBeNull())
  let old!: Promise<unknown>
  act(() => { old = ref.current!.search('old') })
  await waitFor(() => expect(page.getTextContent).toHaveBeenCalledTimes(1))
  await act(async () => { await ref.current!.search('phrase') })
  await act(async () => { rejectOld(new Error('Worker destroyed')); expect(await old).toEqual([]) })
})

it('reports completion at scroll bottom even when the final page is short', async () => {
  const pdf = makeDocument(3)
  load.mockReturnValue({ promise: Promise.resolve(pdf), destroy: vi.fn(async () => {}) })
  const props = base()
  const { container } = render(<PdfView {...props} mode="scroll" />)
  await waitFor(() => expect(container.querySelector('.pdf-viewport')).not.toBeNull())
  const viewport = container.querySelector('.pdf-viewport')!
  Object.defineProperties(viewport, { scrollHeight: { value: 1800 }, clientHeight: { value: 1000 }, scrollTop: { value: 800, writable: true } })
  fireEvent.scroll(viewport)
  await waitFor(() => expect(props.onLocation).toHaveBeenLastCalledWith({ page: 3, totalPages: 3, progress: 1 }))
})

it('releases a page that arrives after its frame was replaced', async () => {
  const pdf = makeDocument()
  const first = await pdf.getPage(1)
  const second = await pdf.getPage(2)
  let finish!: (page: typeof first) => void
  pdf.getPage.mockReset().mockResolvedValueOnce(first)
    .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    .mockResolvedValue(second)
  load.mockReturnValue({ promise: Promise.resolve(pdf), destroy: vi.fn(async () => {}) })
  const ref = createRef<ReaderViewHandle>()
  render(<PdfView ref={ref} {...base()} />)
  await waitFor(() => expect(pdf.getPage).toHaveBeenCalledTimes(2))
  act(() => ref.current!.goToPage(2))
  await act(async () => { finish(first) })
  expect(first.cleanup).toHaveBeenCalled()
})

it('reuses nearby page canvases when turning back and keeps the cache bounded', async () => {
  const pdf = makeDocument(12)
  load.mockReturnValue({ promise: Promise.resolve(pdf), destroy: vi.fn(async () => {}) })
  const ref = createRef<ReaderViewHandle>()
  const { container } = render(<PdfView ref={ref} {...base()} />)
  await waitFor(() => expect(container.querySelectorAll('canvas')).toHaveLength(2))
  const first = container.querySelector('[data-page="1"] canvas')
  act(() => ref.current!.goToPage(2))
  await waitFor(() => expect(container.querySelectorAll('canvas')).toHaveLength(3))
  act(() => ref.current!.goToPage(1))
  expect(container.querySelector('[data-page="1"] canvas')).toBe(first)
  expect(container.querySelectorAll('.pdf-page:not([hidden])')).toHaveLength(1)
  expect(container.querySelectorAll('canvas').length).toBeLessThanOrEqual(3)
})
