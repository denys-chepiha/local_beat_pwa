// Core
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { TextLayer } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
// Services
import { loadPdf } from '@/reader/pdfDocument/pdfDocument'
// Types
import type { ReadingMode, ReaderLocation, ReaderOutline, ReaderViewHandle, SearchMatch } from '@/reader/types'
// Styles
import './PdfView.css'

interface Props {
  blob: Blob
  initialProgress: number
  initialPage: number
  mode: ReadingMode
  zoom: number
  rotation: number
  onLocation: (location: ReaderLocation) => void
  onOutline: (outline: ReaderOutline[]) => void
}

const MAX_CANVAS_PIXELS = 8_000_000
const MAX_CANVAS_EDGE = 4096
const MAX_VISIBLE_PAGES = 5
const clampPage = (page: number, total: number) => Math.max(1, Math.min(total, Math.round(Number.isFinite(page) ? page : 1)))

function markMatches(container: HTMLElement, query: string) {
  const needle = query.trim().toLocaleLowerCase()
  for (const span of container.querySelectorAll('span')) {
    span.classList.toggle('pdf-text-match', !!needle && (span.textContent ?? '').toLocaleLowerCase().includes(needle))
  }
}

function PdfPage({ pdf, pageNumber, width, zoom, rotation, active, defaultAspect, query, register, fitHeight }: {
  pdf: PDFDocumentProxy; pageNumber: number; width: number; zoom: number; rotation: number
  active: boolean; defaultAspect: number; query: string; fitHeight?: number
  register?: (page: number, element: HTMLDivElement | null) => void
}) {
  const surface = useRef<HTMLDivElement>(null)
  const latestQuery = useRef(query)
  latestQuery.current = query
  const [aspect, setAspect] = useState(defaultAspect)
  const [loading, setLoading] = useState(active)
  const [error, setError] = useState(false)
  const displayedAspect = rotation % 180 ? 1 / aspect : aspect
  const pageWidth = fitHeight ? Math.min(width, fitHeight * displayedAspect) : width * zoom

  useEffect(() => {
    if (surface.current) markMatches(surface.current, query)
  }, [query])

  useEffect(() => {
    if (!active || !surface.current) return
    const target = surface.current
    let closed = false
    let rendering: RenderTask | undefined
    let text: TextLayer | undefined
    let page: PDFPageProxy | undefined
    const canvas = document.createElement('canvas')
    canvas.className = 'pdf-page-canvas'
    canvas.setAttribute('aria-hidden', 'true')
    const textContainer = document.createElement('div')
    textContainer.className = 'pdf-text-layer'
    target.replaceChildren(canvas, textContainer)
    setLoading(true)
    setError(false)
    void (async () => {
      try {
        page = await pdf.getPage(pageNumber)
        if (closed) { page.cleanup(); return }
        const natural = page.getViewport({ scale: 1 })
        setAspect(natural.width / natural.height)
        const rotated = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 })
        const viewport = page.getViewport({ scale: pageWidth / rotated.width, rotation: (page.rotate + rotation) % 360 })
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2,
          MAX_CANVAS_EDGE / viewport.width, MAX_CANVAS_EDGE / viewport.height,
          Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)))
        canvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio))
        canvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio))
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        textContainer.style.setProperty('--total-scale-factor', String(viewport.scale * page.userUnit))
        rendering = page.render({ canvas, viewport, transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] })
        text = new TextLayer({ textContentSource: page.streamTextContent(), container: textContainer, viewport })
        await Promise.all([rendering.promise, text.render()])
        if (closed) return
        markMatches(textContainer, latestQuery.current)
        setLoading(false)
      } catch {
        if (!closed) { setLoading(false); setError(true) }
      }
    })()
    return () => {
      closed = true
      rendering?.cancel()
      text?.cancel()
      target.replaceChildren()
      const release = () => { canvas.width = 0; canvas.height = 0; page?.cleanup() }
      if (rendering) void rendering.promise.catch(() => {}).then(release)
      else release()
    }
  }, [pdf, pageNumber, pageWidth, rotation, active])

  return <div ref={(element) => register?.(pageNumber, element)} className="pdf-page" data-page={pageNumber}
    role="group" aria-label={`Page ${pageNumber}`} style={{ width: pageWidth, height: pageWidth / displayedAspect }}>
    <div ref={surface} className="pdf-page-surface" aria-busy={active && loading} />
    {active && loading && <span className="pdf-page-status" role="status">Loading page {pageNumber}…</span>}
    {active && error && <span className="pdf-page-status" role="alert">This page could not be rendered. Close and reopen the document.</span>}
  </div>
}

const PdfView = forwardRef<ReaderViewHandle, Props>(function PdfView({ blob, initialProgress, initialPage, mode, zoom, rotation, onLocation, onOutline }, ref) {
  const viewport = useRef<HTMLDivElement>(null)
  const frames = useRef(new Map<number, HTMLDivElement>())
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [width, setWidth] = useState(640)
  const [height, setHeight] = useState(700)
  const [aspect, setAspect] = useState(1 / Math.SQRT2)
  const [nearby, setNearby] = useState<Set<number>>(new Set([1]))
  const [error, setError] = useState(false)
  const [password, setPassword] = useState<{ submit: (value: string) => void; incorrect: boolean } | null>(null)
  const [passwordValue, setPasswordValue] = useState('')
  const [query, setQuery] = useState('')
  const searchGeneration = useRef(0)
  const currentPage = useRef(page)
  currentPage.current = page
  const callbacks = useRef({ onLocation, onOutline })
  callbacks.current = { onLocation, onOutline }
  const initial = useRef({ page: initialPage, progress: initialProgress })
  initial.current = { page: initialPage, progress: initialProgress }
  const safeZoom = Math.max(0.25, Math.min(8, Number.isFinite(zoom) && zoom > 0 ? zoom : 1))
  const safeRotation = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360 || 0

  useEffect(() => {
    const controller = new AbortController()
    setPdf(null); setError(false); setPassword(null); setPasswordValue(''); setQuery('')
    callbacks.current.onOutline([])
    const loading = loadPdf(blob, controller.signal, (submit, incorrect) => {
      if (!controller.signal.aborted) { setPassword({ submit, incorrect }); setPasswordValue('') }
    })
    void (async () => {
      try {
        const document = await loading.promise
        if (controller.signal.aborted) return
        const requested = initial.current.page > 0 ? initial.current.page : 1 + initial.current.progress * (document.numPages - 1)
        const startPage = clampPage(requested, document.numPages)
        const first = await document.getPage(startPage)
        if (controller.signal.aborted) return
        const natural = first.getViewport({ scale: 1 })
        setAspect(natural.width / natural.height)
        setPage(startPage); currentPage.current = startPage
        setNearby(new Set([startPage])); setPdf(document); setPassword(null)
        const outline = await document.getOutline().catch(() => null)
        const pending = [...(outline ?? [])]
        const result: ReaderOutline[] = []
        let examined = 0
        while (pending.length && examined++ < 1000 && !controller.signal.aborted) {
          const item = pending.shift()!
          if (item.items?.length) pending.unshift(...item.items.slice(0, 1000 - examined))
          try {
            const destination = typeof item.dest === 'string' ? await document.getDestination(item.dest) : item.dest
            if (!destination) continue
            const index = typeof destination[0] === 'number' ? destination[0] : await document.getPageIndex(destination[0])
            if (index >= 0 && index < document.numPages) result.push({ title: item.title.trim().slice(0, 200) || `Page ${index + 1}`, id: `page-${index + 1}` })
          } catch { /* Ignore broken or external destinations. */ }
        }
        if (!controller.signal.aborted) callbacks.current.onOutline(result)
      } catch {
        if (!controller.signal.aborted) { setPassword(null); setError(true) }
      }
    })()
    return () => { ++searchGeneration.current; controller.abort(); void loading.destroy().catch(() => {}) }
  }, [blob])

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const measure = () => { if (element.clientWidth > 0) setWidth(Math.max(160, element.clientWidth - 32)); if (element.clientHeight > 0) setHeight(Math.max(100, element.clientHeight - 32)) }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [pdf])

  const register = useCallback((number: number, element: HTMLDivElement | null) => {
    if (element) frames.current.set(number, element)
    else frames.current.delete(number)
  }, [])

  const scrollToPage = useCallback((number: number) => {
    const root = viewport.current
    const frame = frames.current.get(number)
    if (root && frame) root.scrollTop += frame.getBoundingClientRect().top - root.getBoundingClientRect().top - 16
  }, [])

  const goToPage = useCallback((number: number) => {
    if (!pdf) return
    const next = clampPage(number, pdf.numPages)
    currentPage.current = next
    setPage(next)
    setNearby(new Set([next]))
    if (mode === 'scroll') scrollToPage(next)
    else if (viewport.current) { viewport.current.scrollTop = 0; viewport.current.scrollLeft = 0 }
  }, [pdf, mode, scrollToPage])

  useImperativeHandle(ref, () => ({
    goToPage,
    goToProgress: (progress) => { if (pdf) goToPage(1 + Math.max(0, Math.min(1, progress)) * (pdf.numPages - 1)) },
    goToOutline: (id) => { const match = /^page-(\d+)$/.exec(id); if (match) goToPage(Number(match[1])) },
    goToMatch: (match) => { if (match.page) goToPage(match.page) },
    search: async (value) => {
      const generation = ++searchGeneration.current
      const needle = value.trim().slice(0, 256).toLocaleLowerCase()
      setQuery(needle)
      if (!needle || !pdf) return []
      const matches: SearchMatch[] = []
      for (let number = 1; number <= pdf.numPages && matches.length < 200; number++) {
        if (generation !== searchGeneration.current) return []
        let text: string
        try {
          const foundPage = await pdf.getPage(number)
          if (generation !== searchGeneration.current) return []
          const content = await foundPage.getTextContent()
          if (generation !== searchGeneration.current) return []
          text = content.items.map((item) => 'str' in item ? item.str : '').join(' ')
        } catch (error) {
          if (generation !== searchGeneration.current) return []
          throw error
        }
        const index = text.toLocaleLowerCase().indexOf(needle)
        if (index >= 0) matches.push({ label: `Page ${number}: ${text.slice(Math.max(0, index - 35), index + needle.length + 75)}`, page: number })
      }
      return matches
    },
  }), [goToPage, pdf])

  useEffect(() => {
    if (pdf) callbacks.current.onLocation({ page, totalPages: pdf.numPages, progress: pdf.numPages > 1 ? (page - 1) / (pdf.numPages - 1) : 1 })
  }, [pdf, page])

  useEffect(() => {
    if (!pdf || mode !== 'scroll') return
    const root = viewport.current
    if (!root) return
    const frame = requestAnimationFrame(() => scrollToPage(currentPage.current))
    if (typeof IntersectionObserver === 'undefined') return () => cancelAnimationFrame(frame)
    const visible = new Set<number>([currentPage.current])
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const number = Number((entry.target as HTMLElement).dataset.page)
        if (entry.isIntersecting) visible.add(number)
        else visible.delete(number)
      }
      setNearby(new Set(visible))
    }, { root, rootMargin: '600px 0px' })
    for (const element of frames.current.values()) observer.observe(element)
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [pdf, mode, width, safeZoom, safeRotation, scrollToPage])

  useEffect(() => {
    if (!pdf || mode !== 'scroll' || !viewport.current) return
    const root = viewport.current
    let scheduled = 0
    const update = () => {
      scheduled = 0
      if (root.scrollHeight <= root.clientHeight + 1) return
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) {
        currentPage.current = pdf.numPages
        setPage(pdf.numPages)
        return
      }
      const anchor = root.getBoundingClientRect().top + Math.min(root.clientHeight / 3, 200)
      let low = 1; let high = pdf.numPages
      while (low < high) {
        const middle = Math.floor((low + high) / 2)
        const frame = frames.current.get(middle)
        if (frame && frame.getBoundingClientRect().bottom < anchor) low = middle + 1
        else high = middle
      }
      currentPage.current = low
      setPage(low)
    }
    const scroll = () => { if (!scheduled) scheduled = requestAnimationFrame(update) }
    root.addEventListener('scroll', scroll, { passive: true })
    return () => { root.removeEventListener('scroll', scroll); if (scheduled) cancelAnimationFrame(scheduled) }
  }, [pdf, mode])

  if (error) return <div className="pdf-document-status" role="alert">This PDF could not be opened. Close it and try another file.</div>
  if (password) return <form className="pdf-password" onSubmit={(event) => {
    event.preventDefault()
    if (!passwordValue) return
    const submit = password.submit
    const value = passwordValue
    setPassword(null); setPasswordValue(''); submit(value)
  }}>
    <label htmlFor="pdf-password">This PDF needs a password</label>
    <input id="pdf-password" autoFocus type="password" autoComplete="off" value={passwordValue} onChange={(event) => setPasswordValue(event.target.value)} />
    {password.incorrect && <p role="alert">That password was not accepted. Try again.</p>}
    <button className="btn primary" type="submit" disabled={!passwordValue}>Open document</button>
  </form>
  if (!pdf) return <div className="pdf-document-status" role="status">Opening PDF…</div>

  const activePages = new Set([page, ...[...nearby].filter((number) => number !== page).sort((a, b) => Math.abs(a - page) - Math.abs(b - page))].slice(0, MAX_VISIBLE_PAGES))
  return <div ref={viewport} className={`reader-document-viewport pdf-viewport pdf-viewport--${mode}`} aria-label="PDF document" tabIndex={0}>
    <div className="pdf-pages">
      {mode === 'paged' ? <PdfPage key={page} pdf={pdf} pageNumber={page} width={width} fitHeight={zoom === 0 ? height : undefined} zoom={safeZoom} rotation={safeRotation} active defaultAspect={aspect} query={query} />
        : Array.from({ length: pdf.numPages }, (_, index) => <PdfPage key={index + 1} pdf={pdf} pageNumber={index + 1} width={width} fitHeight={zoom === 0 ? height : undefined} zoom={safeZoom} rotation={safeRotation}
          active={activePages.has(index + 1)} defaultAspect={aspect} query={query} register={register} />)}
    </div>
    <span className="sr-only" role="status">Page {page} of {pdf.numPages}</span>
  </div>
})

export default PdfView
