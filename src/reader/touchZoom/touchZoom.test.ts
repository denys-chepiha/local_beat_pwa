// Core
import { fireEvent } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
// Services
import { attachTouchZoom } from './touchZoom'
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })
it('previews a pinch, commits once, anchors the viewport and removes listeners', () => {
  vi.useFakeTimers()
  const root = document.createElement('div'); const content = document.createElement('div'); root.append(content); document.body.append(root)
  root.scrollLeft = 20; root.scrollTop = 40
  const commit = vi.fn(); const detach = attachTouchZoom(root, content, { scale: () => 1, commit })
  const points = (end: number) => [{ clientX: 0, clientY: 0 }, { clientX: end, clientY: 0 }]
  fireEvent.touchStart(root, { touches: points(100) })
  fireEvent.touchMove(root, { touches: points(300) })
  vi.advanceTimersByTime(20)
  expect(content.style.transform).toBe('scale(3)'); expect(commit).not.toHaveBeenCalled()
  fireEvent.touchEnd(root)
  expect(commit).toHaveBeenCalledExactlyOnceWith(3)
  vi.advanceTimersByTime(50)
  expect(root.scrollLeft).toBe(160); expect(root.scrollTop).toBe(120)
  expect(content.style.transform).toBe('')
  detach(); fireEvent.touchStart(root, { touches: points(100) }); fireEvent.touchEnd(root)
  expect(commit).toHaveBeenCalledTimes(1)
})
it('cancels a gesture without committing a zoom', () => {
  const root = document.createElement('div'); const content = document.createElement('div');root.append(content)
  const commit = vi.fn();const detach = attachTouchZoom(root, content, { scale: () => 3, commit })
  fireEvent.touchStart(root, { touches: [{ clientX: 0, clientY: 0 }, { clientX: 100, clientY: 0 }] })
  fireEvent.touchCancel(root);fireEvent.touchEnd(root)
  expect(commit).not.toHaveBeenCalled();detach()
})
