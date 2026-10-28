// Core
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
// Components
import { DragIcon, PlusIcon, SortIcon, XIcon } from '@/components/Icons'
// Types
import type { VideoEntry, VideoProgress } from './useVideoSession'
// Utils
import { naturalCompare } from '@/utils/naturalSort'

interface Props {
  entries: VideoEntry[]
  activeId: number | null
  progress: Record<number, VideoProgress>
  onSelect: (id: number) => void
  onRemove: (id: number) => void
  /** Must apply the new order synchronously, so rows can animate from their previous places. */
  onReorder: (entries: VideoEntry[]) => void
  onAdd: () => void
  onClose: () => void
}
interface Drag {
  id: number
  pointer: number
  from: number
  to: number
  startY: number
  clientY: number
  offset: number
  height: number
  // Row centers when the drag started; names may wrap, so rows differ in height.
  centers: number[]
  scroller: HTMLElement | null
  scrollTop: number
}

const EDGE = 48
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

export default function VideoPlaylist({ entries, activeId, progress, onSelect, onRemove, onReorder, onAdd, onClose }: Props) {
  const rows = useRef(new Map<number, HTMLLIElement>())
  const active = useRef<Drag | null>(null)
  const frame = useRef(0)
  // Row tops captured before an order change or a drop, so each row glides from where it was (FLIP).
  const before = useRef<Map<number, number> | null>(null)
  const refocus = useRef<number | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const order = entries.map((entry) => entry.id).join(',')
  const ascending = entries.length > 1 && entries.every((entry, i) => i === 0 || naturalCompare(entries[i - 1].file.name, entry.file.name) <= 0)
  const nextSort = ascending ? 'Z–A' : 'A–Z'

  const stopScroll = () => { cancelAnimationFrame(frame.current); frame.current = 0 }
  const cancel = () => { stopScroll(); active.current = null; setDrag(null) }
  useEffect(() => { cancel(); return stopScroll }, [order])
  useLayoutEffect(() => {
    const previous = before.current
    before.current = null
    // Moving a focused row in the DOM can blur it; keep keyboard reordering on the same handle.
    if (refocus.current !== null) {
      rows.current.get(refocus.current)?.querySelector<HTMLButtonElement>('.video-queue-handle')?.focus()
      refocus.current = null
    }
    if (!previous || reducedMotion()) return
    for (const [id, row] of rows.current) {
      const delta = (previous.get(id) ?? 0) - row.getBoundingClientRect().top
      if (previous.has(id) && Math.abs(delta) >= 1) {
        row.animate?.([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.16,1,.3,1)' })
      }
    }
  })

  const capture = () => { before.current = new Map([...rows.current].map(([id, row]) => [id, row.getBoundingClientRect().top])) }
  const commit = (from: number, to: number) => {
    if (from === to) return
    const next = entries.slice()
    next.splice(to, 0, next.splice(from, 1)[0])
    onReorder(next)
    setAnnouncement(`${entries[from].file.name} moved to position ${to + 1} of ${entries.length}`)
  }
  const update = (d: Drag) => {
    const offset = d.clientY - d.startY + (d.scroller?.scrollTop ?? 0) - d.scrollTop
    const center = d.centers[d.from] + offset
    const next = { ...d, offset, to: d.centers.filter((c, i) => i !== d.from && c < center).length }
    active.current = next
    setDrag(next)
  }
  // Scrolls while the pointer rests near an edge of the list, faster the closer it gets.
  const autoScroll = () => {
    frame.current = 0
    const d = active.current
    if (!d?.scroller) return
    const bounds = d.scroller.getBoundingClientRect()
    const above = bounds.top + EDGE - d.clientY
    const depth = above > 0 ? -above : Math.max(d.clientY - bounds.bottom + EDGE, 0)
    const top = d.scroller.scrollTop
    d.scroller.scrollTop += Math.max(-EDGE, Math.min(EDGE, depth)) / 3
    if (d.scroller.scrollTop === top) return
    update(d)
    frame.current = requestAnimationFrame(autoScroll)
  }
  const start = (id: number, from: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    const row = rows.current.get(id)
    if (event.button !== 0 || active.current || !row) return
    event.preventDefault()
    const scroller = row.closest<HTMLElement>('.video-queue')
    const centers = entries.map((entry) => {
      const bounds = rows.current.get(entry.id)?.getBoundingClientRect()
      return bounds ? bounds.top + bounds.height / 2 : 0
    })
    const next: Drag = { id, pointer: event.pointerId, from, to: from, startY: event.clientY, clientY: event.clientY, offset: 0,
      height: row.getBoundingClientRect().height, centers, scroller, scrollTop: scroller?.scrollTop ?? 0 }
    active.current = next
    setDrag(next)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setAnnouncement(`Moving ${entries[from].file.name}. Release to drop it.`)
  }
  const move = (event: ReactPointerEvent) => {
    const d = active.current
    if (!d || d.pointer !== event.pointerId) return
    event.preventDefault()
    update({ ...d, clientY: event.clientY })
    if (!frame.current) frame.current = requestAnimationFrame(autoScroll)
  }
  const end = (event: ReactPointerEvent) => {
    const d = active.current
    if (!d || d.pointer !== event.pointerId) return
    capture()
    cancel()
    commit(d.from, d.to)
  }
  const abort = () => {
    if (!active.current) return
    capture()
    cancel()
    setAnnouncement('Reordering cancelled.')
  }
  const reorderKey = (index: number, event: KeyboardEvent) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const to = index + (event.key === 'ArrowUp' ? -1 : 1)
    if (to < 0 || to >= entries.length) return
    refocus.current = entries[index].id
    capture()
    commit(index, to)
  }
  const sort = () => {
    const direction = nextSort === 'A–Z' ? 1 : -1
    capture()
    cancel()
    onReorder(entries.slice().sort((a, b) => direction * naturalCompare(a.file.name, b.file.name)))
    setAnnouncement(`Playlist sorted by name, ${nextSort}.`)
  }

  return (
    <aside id="video-playlist" className="video-queue" aria-label="Video playlist">
      <div className="video-queue-heading">
        <h2>Playlist</h2>
        <button className="video-queue-sort" onClick={sort} disabled={entries.length < 2} aria-label={`Sort by name, ${nextSort}`} title={`Sort by name, ${nextSort}`}>
          <SortIcon width={14} height={14} />{nextSort}
        </button>
        <button className="video-control" onClick={onClose} aria-label="Close playlist"><XIcon /></button>
      </div>
      <button className="btn" onClick={onAdd}><PlusIcon /> Add videos</button>
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <ol className={drag ? 'is-reordering' : undefined}>{entries.map((entry, i) => {
        let offset = 0
        if (drag) {
          if (i === drag.from) offset = drag.offset
          else if (i > drag.from && i <= drag.to) offset = -drag.height
          else if (i < drag.from && i >= drag.to) offset = drag.height
        }
        const watched = progress[entry.id]?.completed
        return <li key={entry.id} ref={(row) => { if (row) rows.current.set(entry.id, row); else rows.current.delete(entry.id) }}
          className={`${entry.id === activeId ? 'is-active' : ''}${watched ? ' is-watched' : ''}${drag?.id === entry.id ? ' is-dragging' : ''}`}
          style={drag ? { transform: `translateY(${offset}px)` } : undefined}>
          <button className="video-queue-handle" aria-label={`Reorder ${entry.file.name}`} title="Drag to reorder, or use the arrow keys"
            onPointerDown={(event) => start(entry.id, i, event)} onPointerMove={move} onPointerUp={end} onPointerCancel={abort} onLostPointerCapture={abort}
            onKeyDown={(event) => reorderKey(i, event)}><DragIcon width={20} height={20} /></button>
          <button className="video-queue-item" onClick={() => onSelect(entry.id)} aria-current={entry.id === activeId ? 'true' : undefined}>
            <span>{i + 1}</span><span>{entry.file.name}{watched && <small className="video-watched-label">✓ Watched</small>}</span>
          </button>
          <button className="video-control" onClick={() => onRemove(entry.id)} aria-label={`Remove ${entry.file.name}`}><XIcon width={18} height={18} /></button>
        </li>
      })}</ol>
    </aside>
  )
}
