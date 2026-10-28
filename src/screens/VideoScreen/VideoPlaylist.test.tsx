// Core
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
// Components
import VideoPlaylist from './VideoPlaylist'
// Types
import type { VideoEntry } from './useVideoSession'

const ROW = 50
const animate = vi.fn()
const entriesOf = (...names: string[]) => names.map((name, i) => ({ id: i + 1, file: new File(['video'], name, { type: 'video/mp4' }) }))
// jsdom has no layout: rows sit ROW pixels apart in DOM order, shifted by their inline translateY.
function layout(this: Element) {
  const row = this as HTMLElement
  const top = row.tagName === 'LI' ? Array.from(row.parentElement!.children).indexOf(row) * ROW + Number(row.style.transform.match(/-?[\d.]+/)?.[0] ?? 0) : 0
  const height = row.tagName === 'LI' ? ROW : 1000
  return { top, bottom: top + height, height, left: 0, right: 320, width: 320, x: 0, y: top, toJSON: () => ({}) } as DOMRect
}
function Harness({ initial, onReorder }: { initial: VideoEntry[]; onReorder: (entries: VideoEntry[]) => void }) {
  const [entries, setEntries] = useState(initial)
  return <VideoPlaylist entries={entries} activeId={initial[0].id} progress={{}} onSelect={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} onClose={vi.fn()}
    onReorder={(next) => { onReorder(next); setEntries(next) }} />
}
const renderPlaylist = (...files: string[]) => {
  const onReorder = vi.fn()
  const view = render(<Harness initial={entriesOf(...files)} onReorder={onReorder} />)
  const names = () => Array.from(view.container.querySelectorAll('li')).map((li) => li.querySelector('.video-queue-item span:last-child')!.textContent)
  const row = (name: string) => screen.getByRole('button', { name: `Reorder ${name}` }).closest('li')!
  return { ...view, onReorder, names, row }
}
const ids = (call: VideoEntry[]) => call.map((entry) => entry.id)

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(layout)
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate })
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  animate.mockClear()
  delete (Element.prototype as Partial<Element>).animate
})

describe('video playlist reordering', () => {
  it('drags a video past its neighbours, shifting them aside, and settles it into the new place', () => {
    const { onReorder, names, row, container } = renderPlaylist('first.mp4', 'second.mp4', 'third.mp4')
    const handle = screen.getByRole('button', { name: 'Reorder first.mp4' })
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 25 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 130 })
    expect(container.querySelector('ol')).toHaveClass('is-reordering')
    expect(row('first.mp4')).toHaveClass('is-dragging')
    expect(row('first.mp4')).toHaveStyle({ transform: 'translateY(105px)' })
    expect(row('second.mp4')).toHaveStyle({ transform: 'translateY(-50px)' })
    expect(row('third.mp4')).toHaveStyle({ transform: 'translateY(-50px)' })
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 130 })
    expect(ids(onReorder.mock.calls[0][0])).toEqual([2, 3, 1])
    expect(names()).toEqual(['second.mp4', 'third.mp4', 'first.mp4'])
    expect(container.querySelector('ol')).not.toHaveClass('is-reordering')
    expect(screen.getByText('first.mp4 moved to position 3 of 3')).toBeInTheDocument()
    // Shifted rows are already in place; only the dropped row glides the last five pixels.
    expect(animate).toHaveBeenCalledTimes(1)
    expect(animate.mock.contexts[0]).toBe(row('first.mp4'))
    expect(animate.mock.calls[0][0][0]).toEqual({ transform: 'translateY(5px)' })
  })

  it('returns a cancelled drag to its place without saving an order', () => {
    const { onReorder, names, row } = renderPlaylist('first.mp4', 'second.mp4', 'third.mp4')
    const handle = screen.getByRole('button', { name: 'Reorder first.mp4' })
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 25 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 90 })
    fireEvent.pointerCancel(handle, { pointerId: 1 })
    expect(onReorder).not.toHaveBeenCalled()
    expect(names()).toEqual(['first.mp4', 'second.mp4', 'third.mp4'])
    expect(row('first.mp4')).not.toHaveClass('is-dragging')
    expect(animate.mock.calls.map((call) => call[0][0])).toEqual([{ transform: 'translateY(65px)' }, { transform: 'translateY(-50px)' }])
    expect(screen.getByText('Reordering cancelled.')).toBeInTheDocument()
  })

  it('moves a video with the arrow keys and keeps focus on its handle', () => {
    const { onReorder, names } = renderPlaylist('first.mp4', 'second.mp4', 'third.mp4')
    const handle = screen.getByRole('button', { name: 'Reorder first.mp4' })
    handle.focus()
    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(names()).toEqual(['second.mp4', 'first.mp4', 'third.mp4'])
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reorder first.mp4' }))
    expect(screen.getByText('first.mp4 moved to position 2 of 3')).toBeInTheDocument()
    expect(animate).toHaveBeenCalledTimes(2)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder second.mp4' }), { key: 'ArrowUp' })
    expect(onReorder).toHaveBeenCalledTimes(1)
  })
})

describe('video playlist name sorting', () => {
  it('sorts names naturally from A to Z, then from Z to A, animating rows into place', () => {
    const { onReorder, names } = renderPlaylist('Episode 10.mp4', 'episode 2.mp4', 'Bonus.mp4')
    fireEvent.click(screen.getByRole('button', { name: 'Sort by name, A–Z' }))
    expect(names()).toEqual(['Bonus.mp4', 'episode 2.mp4', 'Episode 10.mp4'])
    // "episode 2" keeps the middle slot, so only the swapped ends move.
    expect(animate).toHaveBeenCalledTimes(2)
    expect(animate.mock.calls.map((call) => call[0][0])).toEqual(expect.arrayContaining([{ transform: 'translateY(-100px)' }, { transform: 'translateY(100px)' }]))
    expect(screen.getByText('Playlist sorted by name, A–Z.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sort by name, Z–A' }))
    expect(names()).toEqual(['Episode 10.mp4', 'episode 2.mp4', 'Bonus.mp4'])
    expect(onReorder).toHaveBeenCalledTimes(2)
  })

  it('places a compact sort control in the playlist heading and disables it for one video', () => {
    renderPlaylist('only.mp4')
    const heading = screen.getByRole('heading', { name: 'Playlist' }).parentElement!
    expect(within(heading).getByRole('button', { name: 'Sort by name, A–Z' })).toBeDisabled()
  })

  it('reorders without motion when the viewer prefers reduced motion', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    const { names } = renderPlaylist('b.mp4', 'a.mp4')
    fireEvent.click(screen.getByRole('button', { name: 'Sort by name, A–Z' }))
    expect(names()).toEqual(['a.mp4', 'b.mp4'])
    expect(animate).not.toHaveBeenCalled()
  })
})
