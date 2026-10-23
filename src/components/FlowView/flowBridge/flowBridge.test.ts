// Core
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
// Services
import { createFlowChannel, createFlowClient, createFlowSource, prepareFlowResources } from './flowBridge'
import bridgeSource from './flowBridgeRuntime.js?raw'
// Types
import type { ReadingPreferences } from '@/reader/types'

const preferences: ReadingPreferences = { mode: 'scroll', theme: 'paper', fontSize: 18, font: 'serif', lineHeight: 1.65 }
const channel = 'a'.repeat(32)
function connection() {
  const target = { postMessage: vi.fn() } as unknown as Window
  const options = { preferences, progress: .25, resources: [], onLocation: vi.fn(), onFontSize: vi.fn(), onEscape: vi.fn(), onError: vi.fn() }
  const client = createFlowClient(target, channel, options)
  const receive = (data: Record<string, unknown>, source: Window = target) => client.receive(new MessageEvent('message', { source, origin: 'null', data: { scope: 'local-beat-flow', channel, ...data } }))
  return { client, target, options, receive }
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('flow bridge parent protocol', () => {
  it('rejects source/channel spoofing and initializes once with queued navigation', () => {
    const view = connection()
    view.client.page(3)
    view.receive({ type: 'ready' }, window)
    view.receive({ type: 'ready', channel: 'forged' })
    view.client.receive(new MessageEvent('message', { source: view.target, origin: location.origin, data: { scope: 'local-beat-flow', channel, type: 'ready' } }))
    expect(view.target.postMessage).not.toHaveBeenCalled()
    view.receive({ type: 'ready' })
    expect(view.target.postMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'init', preferences, progress: .25, resources: [] }), '*')
    view.receive({ type: 'initialized' })
    expect(view.target.postMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ type: 'page', page: 3 }), '*')
    view.receive({ type: 'ready' })
    expect(view.target.postMessage).toHaveBeenCalledTimes(3)
    view.client.dispose()
  })

  it('validates and clamps location values, forwards escape, ignores messages after close', () => {
    const view = connection()
    view.receive({ type: 'location', location: { page: NaN, totalPages: 8, progress: 0 } })
    view.receive({ type: 'location', location: { page: '3', totalPages: 8, progress: 0 } })
    expect(view.options.onLocation).not.toHaveBeenCalled()
    view.receive({ type: 'location', location: { page: 200, totalPages: 8, progress: 2 } })
    expect(view.options.onLocation).toHaveBeenCalledWith({ page: 8, totalPages: 8, progress: 1 })
    view.receive({ type: 'escape' }); expect(view.options.onEscape).toHaveBeenCalledOnce()
    view.client.dispose()
    view.receive({ type: 'escape' }); expect(view.options.onEscape).toHaveBeenCalledOnce()
  })

  it('resolves only valid current search results and cancels superseded requests', async () => {
    const view = connection(); view.receive({ type: 'ready' })
    const first = view.client.search('first')
    const second = view.client.search('second')
    await expect(first).resolves.toEqual([])
    view.receive({ type: 'search-result', requestId: 2, matches: [{ id: 'javascript:bad', label: 'bad' }] })
    view.receive({ type: 'search-result', requestId: 1, matches: [{ id: 'reader-match-0', label: 'old' }] })
    view.receive({ type: 'search-result', requestId: 2, matches: [{ id: 'reader-match-0', label: 'second' }] })
    await expect(second).resolves.toEqual([{ id: 'reader-match-0', label: 'second' }])
    view.client.dispose()
  })

  it('settles searches on timeout and disposal with no remaining timers', async () => {
    vi.useFakeTimers()
    const view = connection()
    const first = view.client.search('pending handshake')
    vi.advanceTimersByTime(10_000)
    await expect(first).resolves.toEqual([])
    view.receive({ type: 'ready' })
    expect(vi.mocked(view.target.postMessage).mock.calls.some(([message]) => message.type === 'search')).toBe(false)
    const second = view.client.search('pending response')
    view.client.dispose()
    await expect(second).resolves.toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('transfers only exact parser-owned image blobs and deduplicates repeated images', () => {
    const blob = new Blob(['image'], { type: 'image/png' })
    const result = prepareFlowResources('<img src="blob:owned"><img src="blob:owned"><img src="blob:forged">', [{ url: 'blob:owned', blob }])
    expect(result.resources).toEqual([blob])
    const doc = new DOMParser().parseFromString(result.html, 'text/html')
    expect([...doc.images].map((image) => image.getAttribute('src'))).toEqual([null, null, null])
    expect([...doc.images].map((image) => image.getAttribute('data-reader-resource'))).toEqual(['0', '0', null])
  })

  it('pins the exact trusted offline script in both parent and frame policies', () => {
    const nonce = createFlowChannel()
    expect(nonce).toMatch(/^[a-f0-9]{32}$/)
    const doc = new DOMParser().parseFromString(createFlowSource('<p>Sanitized book</p>', '', channel, nonce), 'text/html')
    const policy = doc.querySelector('meta[http-equiv]')!.getAttribute('content')!
    expect(policy).toContain(`script-src 'nonce-${nonce}'`)
    expect(policy).toContain("connect-src 'none'")
    expect(policy).not.toContain('unsafe-eval')
    expect(doc.scripts).toHaveLength(1)
    expect(doc.scripts[0].hasAttribute('src')).toBe(false)
    expect(doc.scripts[0].textContent).toBe(bridgeSource)
    expect(doc.scripts[0].getAttribute('data-parent-origin')).toBe(location.origin)
    expect(bridgeSource).not.toMatch(/<\/script/i)
    const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'))
    const parentPolicy = config.headers.flatMap((rule: { headers: { key: string; value: string }[] }) => rule.headers).find((header: { key: string }) => header.key === 'Content-Security-Policy').value
    const scriptPolicy = parentPolicy.split(';').find((directive: string) => directive.trim().startsWith('script-src'))
    expect(scriptPolicy).toContain(`'sha256-${createHash('sha256').update(bridgeSource).digest('base64')}'`)
    expect(scriptPolicy).not.toContain('unsafe-inline')
    expect(scriptPolicy).not.toContain('unsafe-eval')
    expect(doc.scripts[0].getAttribute('data-reader-channel')).toBe(channel)
  })
})


it('accepts bounded font-size gestures only from the authenticated frame', () => {
  const view = connection()
  for (const fontSize of [NaN, Infinity, '24', 13, 33]) view.receive({ type: 'font-size', fontSize })
  view.receive({ type: 'font-size', fontSize: 24 }, window)
  view.receive({ type: 'font-size', fontSize: 24, channel: 'forged' })
  expect(view.options.onFontSize).not.toHaveBeenCalled()
  view.receive({ type: 'font-size', fontSize: 24 })
  expect(view.options.onFontSize).toHaveBeenCalledExactlyOnceWith(24)
  view.client.dispose()
})
