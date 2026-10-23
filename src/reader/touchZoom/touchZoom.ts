// Core
import { useEffect, useRef, type RefObject } from 'react'

/** Native one-finger scrolling; two fingers preview zoom without rerasterizing. */
export function attachTouchZoom(root: HTMLElement, content: HTMLElement, options: { scale: () => number; commit: (scale: number) => void }) {
  let pinch: { distance: number; scale: number; x: number; y: number; left: number; top: number } | undefined
  let ratio = 1
  let frame = 0
  let restoreFrame = 0
  const distance = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
  const reset = () => { cancelAnimationFrame(frame); content.style.transform = ''; content.style.transformOrigin = '' }
  const start = (event: TouchEvent) => {
    if (event.touches.length !== 2) return
    const rect = root.getBoundingClientRect()
    pinch = { distance: Math.max(1, distance(event.touches)), scale: options.scale(), x: (event.touches[0].clientX + event.touches[1].clientX) / 2 - rect.left, y: (event.touches[0].clientY + event.touches[1].clientY) / 2 - rect.top, left: root.scrollLeft, top: root.scrollTop }
    ratio = 1
  }
  const move = (event: TouchEvent) => {
    if (!pinch || event.touches.length !== 2) return
    event.preventDefault()
    ratio = Math.max(.25, Math.min(4, pinch.scale * distance(event.touches) / pinch.distance)) / pinch.scale
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => { content.style.transformOrigin = '0 0'; content.style.transform = `scale(${ratio})` })
  }
  const end = () => {
    if (!pinch) return
    const previous = pinch; pinch = undefined
    reset(); options.commit(previous.scale * ratio)
    const appliedRatio = ratio
    restoreFrame = requestAnimationFrame(() => { restoreFrame = requestAnimationFrame(() => {
      root.scrollLeft = (previous.left + previous.x) * appliedRatio - previous.x
      root.scrollTop = (previous.top + previous.y) * appliedRatio - previous.y
    }) })
  }
  const cancel = () => { pinch = undefined; reset() }
  root.addEventListener('touchstart', start, { passive: true })
  root.addEventListener('touchmove', move, { passive: false })
  root.addEventListener('touchend', end)
  root.addEventListener('touchcancel', cancel)
  return () => { cancel(); cancelAnimationFrame(restoreFrame); root.removeEventListener('touchstart', start); root.removeEventListener('touchmove', move); root.removeEventListener('touchend', end); root.removeEventListener('touchcancel', cancel) }
}

export function useTouchZoom(root: RefObject<HTMLElement>, content: RefObject<HTMLElement>, scale: () => number, commit: (scale: number) => void, ready = true) {
  const latest = useRef({ scale, commit }); latest.current = { scale, commit }
  useEffect(() => {
    if (!ready || !root.current || !content.current) return
    return attachTouchZoom(root.current, content.current, { scale: () => latest.current.scale(), commit: (value) => latest.current.commit(value) })
  }, [root, content, ready])
}
