// Core
import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Services
import source from './flowBridgeRuntime.js?raw'
// Types
import type { ReaderLocation, ReadingPreferences } from '@/reader/types'

const channel = 'a'.repeat(32)
const preferences: ReadingPreferences = { mode: 'paged', theme: 'paper', font: 'serif', fontSize: 18, lineHeight: 1.65 }
let close: (() => void) | undefined
beforeEach(() => { document.body.innerHTML = '<div id="reader-scroll"><article id="reader-content"><p id="chapter">Local book</p></article></div>' })
afterEach(() => { close?.(); close = undefined; vi.restoreAllMocks(); document.body.innerHTML = '' })

function openRuntime(initialPages: number, progress = 2 / 30, mode: ReadingPreferences['mode'] = 'paged') {
  let pages = initialPages
  const content = document.getElementById('reader-content')!
  const scroller = document.getElementById('reader-scroll')!
  const parentWindow = { postMessage: vi.fn() }
  const script = document.createElement('script')
  script.dataset.readerChannel = channel
  script.dataset.parentOrigin = location.origin
  vi.spyOn(document, 'currentScript', 'get').mockReturnValue(script)
  Object.defineProperties(window, { innerWidth: { value: 816, writable: true, configurable: true }, innerHeight: { value: 648, writable: true, configurable: true } })
  Object.defineProperties(content, {
    scrollWidth: { get: () => pages * (Math.min(760, window.innerWidth - 56) + 40) - 40, configurable: true },
    scrollHeight: { get: () => pages * 600, configurable: true },
  })
  Object.defineProperties(scroller, { scrollHeight: { get: () => pages * 600 + 48, configurable: true }, clientHeight: { value: 648, configurable: true } })
  const frames = new Map<number, FrameRequestCallback>()
  let frameId = 0
  // Execute the exact trusted application asset, never document-supplied code.
  // jsdom supplies DOM/events; explicit geometry isolates layout-state behavior.
  runInNewContext(source, {
    window, document, parent: parentWindow, Element, NodeFilter, Blob, URL,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    ResizeObserver: class { observe() {} disconnect() {} },
    setTimeout, clearTimeout,
  })
  const command = (data: Record<string, unknown>) => window.dispatchEvent(new MessageEvent('message', {
    source: parentWindow as unknown as Window, origin: location.origin, data: { scope: 'local-beat-flow', channel, ...data },
  }))
  close = () => command({ type: 'dispose' })
  command({ type: 'init', preferences: { ...preferences, mode }, progress, resources: [] })
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(0)) }
  const locations = () => parentWindow.postMessage.mock.calls.map(([message]) => message).filter((message) => message.type === 'location').map((message) => message.location as ReaderLocation)
  return {
    command, content, scroller, flush, locations,
    latest: () => { const all = locations(); return all[all.length - 1] },
    resize: (count: number, width = 816) => { pages = count; window.innerWidth = width; window.dispatchEvent(new Event('resize')); flush() },
  }
}

describe('flow runtime logical position', () => {
  it('restores page three after the inline script first sees a transient one-page layout', () => {
    const view = openRuntime(1)
    expect(view.latest()).toEqual({ page: 1, totalPages: 1, progress: 2 / 30 })
    view.resize(31)
    expect(view.latest()).toEqual({ page: 3, totalPages: 31, progress: 2 / 30 })
    expect(view.locations().every((location) => location.progress === 2 / 30)).toBe(true)
  })

  it('preserves exact progress over repeated sidebar and viewport reflows', () => {
    const view = openRuntime(31)
    for (let iteration = 0; iteration < 4; iteration++) {
      view.resize(51, 516)
      expect(view.latest()).toEqual({ page: 4, totalPages: 51, progress: 2 / 30 })
      view.resize(1, 200)
      expect(view.latest().progress).toBe(2 / 30)
      view.resize(31)
      expect(view.latest()).toEqual({ page: 3, totalPages: 31, progress: 2 / 30 })
    }
  })

  it('uses explicit page navigation as the new logical position', () => {
    const view = openRuntime(31)
    view.command({ type: 'page', page: 7 })
    expect(view.latest()).toEqual({ page: 7, totalPages: 31, progress: .2 })
    view.resize(51, 516)
    expect(view.latest()).toEqual({ page: 11, totalPages: 51, progress: .2 })
    view.resize(31)
    expect(view.latest()).toEqual({ page: 7, totalPages: 31, progress: .2 })
  })

  it('retains a bookmark fraction when the selected page is rounded in a narrower layout', () => {
    const view = openRuntime(51, 0)
    view.command({ type: 'progress', progress: 2 / 30 })
    expect(view.latest()).toEqual({ page: 4, totalPages: 51, progress: 2 / 30 })
    view.resize(31)
    expect(view.latest()).toEqual({ page: 3, totalPages: 31, progress: 2 / 30 })
  })

  it('preserves continuous-scroll progress for automatic offsets but updates actual scrolling', () => {
    const view = openRuntime(1, .123456, 'scroll')
    expect(view.latest().progress).toBe(.123456)
    view.resize(31)
    view.scroller.dispatchEvent(new Event('scroll')); view.flush()
    expect(view.latest().progress).toBe(.123456)
    view.scroller.scrollTop = (view.scroller.scrollHeight - view.scroller.clientHeight) / 2
    view.scroller.dispatchEvent(new Event('scroll')); view.flush()
    expect(view.latest().progress).toBe(.5)
    view.resize(51, 516)
    expect(view.latest().progress).toBe(.5)
  })

  it('keeps outline navigation when typography already has a measurement scheduled', () => {
    const view = openRuntime(31, .2, 'scroll')
    const target = document.getElementById('chapter')!
    vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => ({ top: 9024 - view.scroller.scrollTop }) as DOMRect)
    view.command({ type: 'preferences', preferences: { ...preferences, mode: 'scroll', fontSize: 22 } })
    view.command({ type: 'outline', id: 'chapter' })
    view.flush()
    expect(view.scroller.scrollTop).toBe(9000)
    expect(view.latest().progress).toBe(.5)
  })

  it('ignores an old scroll offset when viewport geometry changes before its resize callback', () => {
    const view = openRuntime(31, .4, 'scroll')
    window.innerWidth = 516
    view.scroller.scrollTop = 0
    view.scroller.dispatchEvent(new Event('scroll')); view.flush(); view.flush()
    expect(view.latest().progress).toBe(.4)
    expect(view.scroller.scrollTop).toBeGreaterThan(0)
  })
})
