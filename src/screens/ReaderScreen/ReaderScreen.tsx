// Core
import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
// Components
import ProgressSlider from '@/components/ProgressSlider/ProgressSlider'
import { BackIcon, BookIcon, XIcon, SettingsIcon, PlaylistIcon } from '@/components/Icons'
import ReaderLibrary from '@/components/ReaderLibrary/ReaderLibrary'
import FlowView from '@/components/FlowView/FlowView'
// Hooks
import { useTouchZoom } from '@/reader/touchZoom/touchZoom'
// Services
import { db } from '@/services/db'
import { createProgressWriter } from '@/reader/progressWriter/progressWriter'
import { getBookFile, saveBookmarks, saveLocation } from '@/reader/readerRepository/readerRepository'
import { useUiStore } from '@/store/useUiStore'
// Types
import type { ReaderBook, ReaderLocation, ReaderOutline, ReaderViewHandle, ReadingPreferences, SearchMatch } from '@/reader/types'
// Utils
import { uid } from '@/utils/id'
// Styles
import './ReaderScreen.css'

const PdfView = lazy(() => import('@/components/PdfView/PdfView'))
const DEFAULT_PREFERENCES: ReadingPreferences = { mode: 'paged', theme: 'paper', fontSize: 18, font: 'serif', lineHeight: 1.65 }
function readPreferences(): ReadingPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem('local-beat-reading') ?? '{}')
    return { mode: saved.mode === 'scroll' ? 'scroll' : 'paged', theme: ['paper', 'sepia', 'night'].includes(saved.theme) ? saved.theme : 'paper', font: saved.font === 'sans' ? 'sans' : 'serif', fontSize: Number.isFinite(saved.fontSize) ? Math.min(32, Math.max(14, saved.fontSize)) : 18, lineHeight: [1.4, 1.65, 1.9].includes(saved.lineHeight) ? saved.lineHeight : 1.65 }
  } catch { return DEFAULT_PREFERENCES }
}
function SearchIcon({ width = 20, height = 20 }: { width?: number; height?: number }) {
  return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></svg>
}
function BookmarkIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4Z" /></svg>
}
const fullscreenDocument = () => document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> }
const currentFullscreen = () => document.fullscreenElement ?? fullscreenDocument().webkitFullscreenElement
const exitFullscreen = async () => {
  if (document.exitFullscreen) await document.exitFullscreen()
  else await fullscreenDocument().webkitExitFullscreen?.()
}
function FullscreenIcon({ exit }: { exit: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={exit ? 'M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6' : 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6'} /></svg>
}
const ImageView = forwardRef<ReaderViewHandle, { blob: Blob; zoom: number; onZoom: (zoom: number) => void; rotation: number; onLocation: (location: ReaderLocation) => void }>(function ImageView({ blob, zoom, onZoom, rotation, onLocation }, ref) {
  const [url, setUrl] = useState('')
  const [size, setSize] = useState({ width: 1, height: 1 })
  const [width, setWidth] = useState(600)
  const container = useRef<HTMLDivElement>(null)
  const imageContent = useRef<HTMLDivElement>(null)
  useTouchZoom(container, imageContent, () => zoom, onZoom)
  useEffect(() => { const next = URL.createObjectURL(blob); setUrl(next); return () => URL.revokeObjectURL(next) }, [blob])
  useEffect(() => { onLocation({ page: 1, totalPages: 1, progress: 1 }) }, [onLocation])
  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(() => setWidth(Math.max(100, element.clientWidth - 40)))
    observer.observe(element); return () => observer.disconnect()
  }, [])
  useImperativeHandle(ref, () => ({ goToPage: () => {}, goToProgress: () => {}, goToOutline: () => {}, search: async () => [], goToMatch: () => {} }))
  const turned = rotation % 180 !== 0
  const displayWidth = width * zoom
  const displayHeight = displayWidth / (turned ? size.height / size.width : size.width / size.height)
  const imageWidth = turned ? displayHeight : displayWidth
  const imageHeight = turned ? displayWidth : displayHeight
  return <div ref={container} className="reader-image"><div ref={imageContent} style={{ position: 'relative', width: displayWidth, height: displayHeight, margin: '0 auto' }}><img src={url} alt="Opened document" onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} style={{ position: 'absolute', left: (displayWidth - imageWidth) / 2, top: (displayHeight - imageHeight) / 2, width: imageWidth, height: imageHeight, transform: `rotate(${rotation}deg)` }} /></div></div>
})

function ReadingWorkspace({ book, blob }: { book: ReaderBook; blob: Blob }) {
  const [preferences, setPreferences] = useState(readPreferences)
  const [location, setLocation] = useState<ReaderLocation>({ page: book.page, totalPages: 0, progress: book.progress })
  const [outline, setOutline] = useState<ReaderOutline[]>([])
  const [bookmarks, setBookmarked] = useState(book.bookmarks)
  const [panel, setPanel] = useState<'contents' | 'search' | 'bookmarks' | 'appearance' | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [zoom, setZoom] = useState(book.format === 'pdf' ? 0 : 1)
  const [rotation, setRotation] = useState(0)
  const [jump, setJump] = useState(String(book.page))
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchMatch[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const stage = useRef<HTMLElement>(null)
  const view = useRef<ReaderViewHandle>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const mounted = useRef(true)
  const searchToken = useRef(0)
  const touch = useRef<{ x: number; y: number }>()
  const reflow = book.format !== 'pdf' && book.format !== 'image'
  const openReader = useUiStore((s) => s.openReader)
  const [writer] = useState(() => createProgressWriter((next) => saveLocation(book.id, next), () => { if (mounted.current) setError('Your place could not be saved. Check free device storage.') }))
  const bookmarkBusy = useRef(false)
  const [bookmarkSaving, setBookmarkSaving] = useState(false)
  const flush = useCallback(async () => { clearTimeout(timer.current); await writer.flush() }, [writer])
  const changed = useCallback((next: ReaderLocation) => {
    setLocation(next); setJump(String(next.page)); writer.update(next)
    clearTimeout(timer.current); timer.current = setTimeout(() => { void flush() }, 500)
  }, [flush, writer])
  const outlineChanged = useCallback((next: ReaderOutline[]) => setOutline(next), [])
  useEffect(() => {
    mounted.current = true
    const save = () => { if (document.visibilityState === 'hidden') void flush() }
    const pagehide = () => { void flush() }
    document.addEventListener('visibilitychange', save); window.addEventListener('pagehide', pagehide)
    return () => { mounted.current = false; searchToken.current++; void flush(); document.removeEventListener('visibilitychange', save); window.removeEventListener('pagehide', pagehide) }
  }, [flush])
  useEffect(() => { try { localStorage.setItem('local-beat-reading', JSON.stringify(preferences)) } catch { /* Reading remains available without preference storage. */ } }, [preferences])
  useEffect(() => {
    const change = () => setExpanded(currentFullscreen() === stage.current)
    document.addEventListener('fullscreenchange', change)
    document.addEventListener('webkitfullscreenchange', change)
    return () => { document.removeEventListener('fullscreenchange', change); document.removeEventListener('webkitfullscreenchange', change) }
  }, [])
  useEffect(() => {
    if (!expanded) return
    const before = document.body.style.overflow; document.body.style.overflow = 'hidden'
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !currentFullscreen()) setExpanded(false) }
    document.addEventListener('keydown', key)
    return () => { document.body.style.overflow = before; document.removeEventListener('keydown', key) }
  }, [expanded])
  const fullscreen = async () => {
    if (currentFullscreen()) { await exitFullscreen().catch(() => {}); setExpanded(false); return }
    if (expanded) { setExpanded(false); return }
    setPanel(null)
    const element = stage.current as (HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }) | null
    try {
      if (element?.requestFullscreen) await element.requestFullscreen()
      else if (element?.webkitRequestFullscreen) await element.webkitRequestFullscreen()
    } catch { /* Full-window reading remains available when native fullscreen is denied. */ } finally { setExpanded(true) }
  }
  const close = async () => { await flush(); if (currentFullscreen()) await exitFullscreen().catch(() => {}); openReader() }
  const togglePanel = (next: typeof panel) => setPanel((previous) => previous === next ? null : next)
  const search = async () => {
    const token = ++searchToken.current; setSearching(true); setSearched(false); setError('')
    try { const found = await view.current?.search(query.trim()) ?? []; if (token === searchToken.current) { setResults(found); setSearched(true) } }
    catch { if (token === searchToken.current) setError('Search could not finish. Try a shorter phrase.') }
    finally { if (token === searchToken.current) setSearching(false) }
  }
  const updateBookmarks = async (next: ReaderBook['bookmarks']) => {
    if (bookmarkBusy.current) return
    bookmarkBusy.current = true; setBookmarkSaving(true)
    try { await saveBookmarks(book.id, next); setBookmarked(next) } catch { setError('The bookmark could not be saved. Check free device storage.') }
    finally { bookmarkBusy.current = false; setBookmarkSaving(false) }
  }
  const bookmark = async () => {
    const existing = bookmarks.find((mark) => Math.abs(mark.progress - location.progress) < 0.001)
    const next = existing ? bookmarks.filter((mark) => mark.id !== existing.id) : [...bookmarks, { id: uid(), label: `Page ${location.page}`, page: location.page, progress: location.progress }]
    await updateBookmarks(next)
  }
  return <main ref={stage} className={`reader-workspace${expanded ? ' reader-workspace--expanded' : ''}`} data-theme={preferences.theme}
    onKeyDown={(event) => {
      if (event.key === 'Escape') { if (panel) setPanel(null); else if (expanded && !currentFullscreen()) setExpanded(false); return }
      if ((event.target as HTMLElement).closest('input,select,textarea,button')) return
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); view.current?.goToPage(location.page + 1) }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); view.current?.goToPage(location.page - 1) }
    }}>
    <header className="reader-heading" hidden={expanded}><button className="icon-btn" aria-label="Back to book library" onClick={() => { void close() }}><BackIcon /></button><div><h1 title={book.title}>{book.title}</h1><p>{book.author || book.fileName}</p></div><button className="icon-btn" aria-label="Enter reading fullscreen" onClick={() => { void fullscreen() }}><FullscreenIcon exit={expanded} /></button></header>
    <div hidden={expanded} className="reader-toolbar" aria-label="Reading controls">
      <label className="reader-select"><span className="sr-only">Reading mode</span><select aria-label="Reading mode" value={preferences.mode} onChange={(event) => setPreferences((prev) => ({ ...prev, mode: event.target.value as ReadingPreferences['mode'] }))}><option value="paged">Pages</option><option value="scroll">Continuous scroll</option></select></label>
      <button className="btn" aria-pressed={panel === 'appearance'} onClick={() => togglePanel('appearance')} aria-label="Appearance" title="Appearance"><SettingsIcon width={20} height={20} /></button>
      <button className="btn" aria-pressed={panel === 'contents'} disabled={book.format === 'image'} onClick={() => togglePanel('contents')} aria-label="Contents" title="Contents"><PlaylistIcon width={20} height={20} /></button>
      <button className="btn" aria-pressed={panel === 'search'} disabled={book.format === 'image'} onClick={() => togglePanel('search')} aria-label="Search" title="Search"><SearchIcon width={20} height={20} /></button>
      <button className="btn" aria-pressed={panel === 'bookmarks'} onClick={() => togglePanel('bookmarks')} aria-label="Bookmarks" title="Bookmarks"><BookmarkIcon /></button>
    </div>
    {error && <p className="reader-message reader-message--error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss reading error"><XIcon width={16} height={16} /></button></p>}
    <div className="reader-body">
      {panel && <aside className="reader-panel" aria-label={`${panel} panel`}><div className="reader-panel__heading"><h2>{panel === 'appearance' ? 'Reading appearance' : panel === 'contents' ? 'Contents' : panel === 'search' ? 'Find in book' : 'Bookmarks'}</h2><button className="icon-btn" aria-label="Close reading panel" onClick={() => setPanel(null)}><XIcon width={18} height={18} /></button></div>
        {panel === 'appearance' && <div className="reader-appearance"><fieldset><legend>Page tone</legend><div className="reader-theme-options">{(['paper', 'sepia', 'night'] as const).map((theme) => <button key={theme} data-theme-choice={theme} aria-pressed={preferences.theme === theme} onClick={() => setPreferences((prev) => ({ ...prev, theme }))}>{theme === 'paper' ? 'Paper' : theme === 'sepia' ? 'Sepia' : 'Night'}</button>)}</div></fieldset>
          {reflow ? <><label>Font<select aria-label="Reading font" value={preferences.font} onChange={(event) => setPreferences((prev) => ({ ...prev, font: event.target.value as ReadingPreferences['font'] }))}><option value="serif">Serif</option><option value="sans">Sans serif</option></select></label><label>Text size · {preferences.fontSize}px<ProgressSlider aria-label="Text size" min={14} max={32} step={1} value={preferences.fontSize} onChange={(event) => setPreferences((prev) => ({ ...prev, fontSize: Number(event.target.value) }))} /></label><label>Line spacing<select aria-label="Line spacing" value={preferences.lineHeight} onChange={(event) => setPreferences((prev) => ({ ...prev, lineHeight: Number(event.target.value) }))}><option value={1.4}>Compact</option><option value={1.65}>Comfortable</option><option value={1.9}>Spacious</option></select></label><p>Page numbers adapt to your screen and text size.</p></> : <><label>Zoom<select aria-label="Document zoom" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>{book.format === 'pdf' && <option value={0}>Fit page</option>}<option value={1}>Fit width</option><option value={0.75}>75%</option><option value={1.25}>125%</option><option value={1.5}>150%</option><option value={2}>200%</option><option value={3}>300%</option>{![0, 1, .75, 1.25, 1.5, 2, 3].includes(zoom) && <option value={zoom}>{Math.round(zoom * 100)}%</option>}</select></label><button className="btn" onClick={() => setRotation((value) => (value + 90) % 360)}>Rotate page</button><p>Night tone also changes the colors of page images.</p></>}
        </div>}
        {panel === 'contents' && (outline.length ? <ol className="reader-panel__list">{outline.map((item, index) => <li key={`${item.id}-${index}`}><button onClick={() => { view.current?.goToOutline(item.id); setPanel(null) }}>{item.title}</button></li>)}</ol> : <p>This document has no table of contents.</p>)}
        {panel === 'search' && <><form className="reader-search" onSubmit={(event) => { event.preventDefault(); void search() }}><input type="search" aria-label="Find text" placeholder="Word or phrase" value={query} maxLength={200} onChange={(event) => { setQuery(event.target.value); setSearched(false) }} /><button className="btn primary" disabled={searching || !query.trim()}>{searching ? 'Searching…' : 'Find'}</button></form><p role="status">{searched ? results.length ? `${results.length}${results.length >= 200 ? '+' : ''} results` : 'No matches. Scanned pages need a text layer to be searchable.' : 'Search selectable text in this book.'}</p><ol className="reader-panel__list">{results.map((item, index) => <li key={`${index}-${item.id ?? item.page}`}><button onClick={() => { view.current?.goToMatch(item); setPanel(null) }}>{item.page && <strong>Page {item.page} · </strong>}{item.label}</button></li>)}</ol></>}
        {panel === 'bookmarks' && <><button className="btn" disabled={bookmarkSaving} onClick={() => { void bookmark() }}>{bookmarks.some((mark) => Math.abs(mark.progress - location.progress) < 0.001) ? 'Remove current bookmark' : `Bookmark page ${location.page}`}</button>{!bookmarks.length && <p>Save a place to return to later.</p>}<ol className="reader-panel__list">{bookmarks.map((mark) => <li key={mark.id}><button onClick={() => { view.current?.goToProgress(mark.progress); setPanel(null) }}>{mark.label}</button><button className="reader-bookmark-remove" disabled={bookmarkSaving} aria-label={`Remove bookmark ${mark.label}`} onClick={() => { const next = bookmarks.filter((item) => item.id !== mark.id); void updateBookmarks(next) }}><XIcon width={16} height={16} /></button></li>)}</ol></>}
      </aside>}
      <section className="reader-document-viewport" aria-label="Document pages" tabIndex={0}
        onTouchStart={(event) => { touch.current = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : undefined }}
        onTouchCancel={() => { touch.current = undefined }}
        onTouchEnd={(event) => { const start = touch.current; touch.current = undefined; if (!start || zoom > 1 || preferences.mode !== 'paged' || !event.changedTouches[0] || window.getSelection()?.toString()) return; const dx = event.changedTouches[0].clientX - start.x; const dy = event.changedTouches[0].clientY - start.y; const viewport = (event.target as HTMLElement).closest('.pdf-viewport, .reader-image'); if (viewport && viewport.scrollWidth > viewport.clientWidth + 2) return; if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) view.current?.goToPage(location.page + (dx < 0 ? 1 : -1)) }}>
        <Suspense fallback={<p className="reader-message" role="status">Opening PDF reader…</p>}>{book.format === 'pdf' ? <PdfView ref={view} blob={blob} initialPage={book.page} initialProgress={book.progress} mode={preferences.mode} zoom={zoom} onZoom={setZoom} rotation={rotation} onLocation={changed} onOutline={outlineChanged} /> : book.format === 'image' ? <ImageView ref={view} blob={blob} zoom={zoom} onZoom={setZoom} rotation={rotation} onLocation={changed} /> : <FlowView ref={view} blob={blob} fileName={book.fileName} initialProgress={book.progress} preferences={preferences} onFontSize={(fontSize) => setPreferences((prev) => ({ ...prev, fontSize }))} onLocation={changed} onOutline={outlineChanged} />}</Suspense>
      </section>
    </div>
    {expanded && <button className="reader-exit-fullscreen icon-btn" aria-label="Exit reading fullscreen" title="Exit fullscreen" onClick={() => { void fullscreen() }}><FullscreenIcon exit /></button>}
    <footer hidden={expanded} className="reader-pagination"><button className="btn" aria-label="Previous page" disabled={location.page <= 1} onClick={() => view.current?.goToPage(location.page - 1)}><BackIcon width={18} height={18} /><span>Previous</span></button><form onSubmit={(event) => { event.preventDefault(); const value = Number(jump); if (Number.isFinite(value) && value >= 1) view.current?.goToPage(value) }}><label htmlFor="reader-page-input">Page</label><input id="reader-page-input" aria-label="Page number" disabled={!location.totalPages} inputMode="numeric" type="number" min={1} max={location.totalPages || 1} value={jump} onChange={(event) => setJump(event.target.value)} onBlur={() => { const value = Number(jump); if (Number.isFinite(value) && value >= 1) view.current?.goToPage(value); else setJump(String(location.page)) }} /><span role="status" aria-label={`Page ${location.page} of ${location.totalPages || '…'}`}>of {location.totalPages || '…'}</span><button type="submit" className="sr-only">Go to page</button></form><button className="btn" aria-label="Next page" disabled={!location.totalPages || location.page >= location.totalPages} onClick={() => view.current?.goToPage(location.page + 1)}><span>Next</span><BackIcon width={18} height={18} style={{ transform: 'rotate(180deg)' }} /></button></footer>
  </main>
}

function OpenBook({ id }: { id: string }) {
  const [resource, setResource] = useState<{ book: ReaderBook; blob: Blob }>()
  const [error, setError] = useState('')
  const openReader = useUiStore((s) => s.openReader)
  useEffect(() => {
    let current = true
    void Promise.all([db.readerBooks.get(id), getBookFile(id)]).then(([book, blob]) => { if (!current) return; if (!book) throw new Error('This book is no longer in the library.'); setResource({ book, blob }) }).catch((failure) => { if (current) setError(failure instanceof Error ? failure.message : 'The book could not be opened.') })
    return () => { current = false }
  }, [id])
  if (error) return <main className="reader-library"><p role="alert">{error}</p><button className="btn" onClick={() => openReader()}><BookIcon />Back to library</button></main>
  if (!resource) return <p className="reader-message" role="status">Opening book…</p>
  return <ReadingWorkspace book={resource.book} blob={resource.blob} />
}

export default function ReaderScreen({ bookId }: { bookId?: string }) {
  const openReader = useUiStore((s) => s.openReader)
  return bookId ? <OpenBook key={bookId} id={bookId} /> : <ReaderLibrary onOpen={openReader} />
}
