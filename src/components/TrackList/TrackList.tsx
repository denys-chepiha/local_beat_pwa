// Core
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
// Components
import TrackItem from '@/components/TrackItem'
// Services
import { usePlayerStore } from '@/store/usePlayerStore'
// Types
import type { Track } from '@/types'
// Styles
import './TrackList.css'

interface Props {
  tracks: Track[]
  editing: boolean
  onPlay: (id: string) => void
  onRemove: (id: string) => void
  onRename: (id: string) => void
  onReorder: (ids: string[]) => void
}
interface Drag {
  id: string
  pointer: number
  startY: number
  offset: number
  from: number
  to: number
  height: number
  scrollTop: number
  scroller: HTMLElement | null
}

export default function TrackList({ tracks, editing, onPlay, onRemove, onRename, onReorder }: Props) {
  const currentId = usePlayerStore((s) => s.source === 'music' ? s.currentTrackId : null)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const rows = useRef<Record<string, HTMLDivElement | null>>({})
  const active = useRef<Drag | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const ids = tracks.map((t) => t.id).join(',')
  const cancel = () => { active.current = null; setDrag(null) }
  useEffect(() => { cancel() }, [ids])

  const commit = (from: number, to: number) => {
    if (from === to) return
    const next = tracks.map((t) => t.id)
    next.splice(to, 0, next.splice(from, 1)[0])
    onReorder(next)
    setAnnouncement(`${tracks[from].title} moved to position ${to + 1} of ${tracks.length}`)
  }
  const start = (id: string, from: number, e: ReactPointerEvent) => {
    if (e.button !== 0 || active.current) return
    const row = rows.current[id]
    if (!row) return
    e.preventDefault()
    const scroller = row.closest<HTMLElement>('.playlist-scroll')
    const next = { id, pointer: e.pointerId, startY: e.clientY, offset: 0, from, to: from,
      height: row.getBoundingClientRect().height, scroller, scrollTop: scroller?.scrollTop ?? 0 }
    active.current = next
    setDrag(next)
    e.currentTarget.setPointerCapture(e.pointerId)
    setAnnouncement(`Moving ${tracks[from].title}. Release to drop; Escape to cancel.`)
  }
  const move = (e: ReactPointerEvent) => {
    const d = active.current
    if (!d || d.pointer !== e.pointerId) return
    e.preventDefault()
    if (d.scroller) {
      const bounds = d.scroller.getBoundingClientRect()
      if (e.clientY < bounds.top + 40) d.scroller.scrollTop -= 18
      if (e.clientY > bounds.bottom - 40) d.scroller.scrollTop += 18
    }
    const offset = e.clientY - d.startY + (d.scroller?.scrollTop ?? 0) - d.scrollTop
    const to = Math.max(0, Math.min(tracks.length - 1, d.from + Math.round(offset / d.height)))
    const next = { ...d, offset, to }
    active.current = next
    setDrag(next)
  }
  const end = (e: ReactPointerEvent) => {
    const d = active.current
    if (!d || d.pointer !== e.pointerId) return
    cancel()
    commit(d.from, d.to)
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  return (
    <div className="track-list" onKeyDown={(e) => { if (e.key === 'Escape') cancel() }}>
      <span className="sr-only" role="status">{announcement}</span>
      {tracks.map((track, i) => {
        let offset = 0
        if (drag) {
          if (i === drag.from) offset = drag.offset
          else if (i > drag.from && i <= drag.to) offset = -drag.height
          else if (i < drag.from && i >= drag.to) offset = drag.height
        }
        return <TrackItem key={track.id} track={track} index={i} editing={editing}
          isCurrent={currentId === track.id} isPlaying={currentId === track.id && isPlaying}
          isDragging={drag?.id === track.id}
          style={{ transform: `translateY(${offset}px)` }}
          registerRef={(el) => { rows.current[track.id] = el }}
          onPlay={() => onPlay(track.id)} onRemove={() => onRemove(track.id)} onRename={() => onRename(track.id)}
          onDragStart={(e) => start(track.id, i, e)} onDragMove={move} onDragEnd={end} onDragCancel={cancel}
          onReorderKey={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              commit(i, Math.max(0, Math.min(tracks.length - 1, i + (e.key === 'ArrowUp' ? -1 : 1))))
            }
          }} />
      })}
    </div>
  )
}
