// Core
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
// Components
import TrackList from './TrackList'
// Types
import type { Track } from '@/types'

afterEach(cleanup)
const tracks = ['First', 'Second', 'Third'].map((title, i) => ({ id: String(i), title, artist: 'Artist', duration: 60 }) as Track)
const renderList = () => {
  const onReorder = vi.fn()
  const view = render(<TrackList tracks={tracks} editing={false} onReorder={onReorder} onPlay={vi.fn()} onRemove={vi.fn()} onRename={vi.fn()} />)
  return { ...view, onReorder }
}
describe('track reordering', () => {
  it('moves a track with the keyboard and announces its new position', () => {
    const { onReorder } = renderList()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder First' }), { key: 'ArrowDown' })
    expect(onReorder).toHaveBeenCalledWith(['1', '0', '2'])
    expect(screen.getByRole('status')).toHaveTextContent('position 2 of 3')
  })
  it('cancels a pointer drag without saving a new order', () => {
    const { onReorder } = renderList()
    const handle = screen.getByRole('button', { name: 'Reorder First' })
    handle.setPointerCapture = vi.fn()
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 30 })
    expect(handle.closest('.track-item')).toHaveClass('dragging')
    fireEvent.pointerCancel(handle, { pointerId: 1 })
    expect(onReorder).not.toHaveBeenCalled()
    expect(handle.closest('.track-item')).not.toHaveClass('dragging')
  })
})
