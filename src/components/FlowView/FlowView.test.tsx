// Core
import { createRef } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Components
import FlowView from './FlowView'
// Types
import type { ReaderViewHandle, ReadingPreferences } from '@/reader/types'

const mocks = vi.hoisted(() => ({ parseDocument: vi.fn(), dispose: vi.fn() }))
vi.mock('@/reader/parseDocument/parseDocument', () => ({ parseDocument: mocks.parseDocument }))
const preferences: ReadingPreferences = { mode: 'scroll', theme: 'paper', fontSize: 18, font: 'serif', lineHeight: 1.65 }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.parseDocument.mockResolvedValue({ html: '<h1 id="chapter">Local chapter</h1><p>Local text.</p>', outline: [{ id: 'chapter', title: 'Local chapter' }], dispose: mocks.dispose })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

async function openDocument() {
  const onLocation = vi.fn(); const onOutline = vi.fn(); const ref = createRef<ReaderViewHandle>(); const blob = new Blob(['local'])
  const result = render(<FlowView ref={ref} blob={blob} fileName="local.epub" initialProgress={.25} preferences={preferences} onLocation={onLocation} onOutline={onOutline} />)
  const iframe = await screen.findByTitle<HTMLIFrameElement>('Pages of local.epub')
  await act(async () => {})
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
  const receive = (data: Record<string, unknown>, source: Window = iframe.contentWindow!) => act(() => window.dispatchEvent(new MessageEvent('message', { source, origin: 'null', data: { scope: 'local-beat-flow', channel: iframe.dataset.readerChannel, ...data } })))
  return { ...result, onLocation, onOutline, ref, blob, iframe, post, receive }
}

describe('FlowView isolated document', () => {
  it('keeps an opaque origin and receives validated locations after the handshake', async () => {
    const view = await openDocument()
    expect(view.iframe.getAttribute('sandbox')).toBe('allow-scripts')
    expect(view.onOutline).toHaveBeenCalledWith([{ id: 'chapter', title: 'Local chapter' }])
    fireEvent.load(view.iframe)
    expect(view.post).toHaveBeenCalledWith(expect.objectContaining({ type: 'hello' }), '*')
    view.receive({ type: 'ready' }); view.receive({ type: 'initialized' })
    expect(view.post).toHaveBeenCalledWith(expect.objectContaining({ type: 'init', progress: .25 }), '*')
    view.receive({ type: 'location', location: { page: 2, totalPages: 5, progress: .25 } }, window)
    expect(view.onLocation).not.toHaveBeenCalled()
    view.receive({ type: 'location', location: { page: 2, totalPages: 5, progress: .25 } })
    expect(view.onLocation).toHaveBeenCalledWith({ page: 2, totalPages: 5, progress: .25 })
  })

  it('updates typography without rebuilding the document and sends imperative commands', async () => {
    const view = await openDocument(); view.receive({ type: 'ready' }); view.receive({ type: 'initialized' })
    const source = view.iframe.srcdoc
    view.rerender(<FlowView ref={view.ref} blob={view.blob} fileName="local.epub" initialProgress={.25} preferences={{ ...preferences, fontSize: 22 }} onLocation={view.onLocation} onOutline={view.onOutline} />)
    expect(view.iframe.srcdoc).toBe(source)
    expect(mocks.parseDocument).toHaveBeenCalledOnce()
    expect(view.post).toHaveBeenCalledWith(expect.objectContaining({ type: 'preferences', preferences: expect.objectContaining({ fontSize: 22 }) }), '*')
    act(() => { view.ref.current!.goToPage(3); view.ref.current!.goToProgress(.5); view.ref.current!.goToOutline('chapter') })
    expect(view.post).toHaveBeenCalledWith(expect.objectContaining({ type: 'page', page: 3 }), '*')
    expect(view.post).toHaveBeenCalledWith(expect.objectContaining({ type: 'progress', progress: .5 }), '*')
    expect(view.post).toHaveBeenCalledWith(expect.objectContaining({ type: 'outline', id: 'chapter' }), '*')
  })

  it('cancels pending search, releases parser resources and ignores stale messages on close', async () => {
    const view = await openDocument(); view.receive({ type: 'ready' }); view.receive({ type: 'initialized' })
    const result = view.ref.current!.search('local')
    view.unmount()
    await expect(result).resolves.toEqual([])
    expect(mocks.dispose).toHaveBeenCalledOnce()
    expect(view.post).toHaveBeenCalledWith(expect.objectContaining({ type: 'dispose' }), '*')
    view.receive({ type: 'location', location: { page: 1, totalPages: 1, progress: 1 } })
    expect(view.onLocation).not.toHaveBeenCalled()
  })
})
