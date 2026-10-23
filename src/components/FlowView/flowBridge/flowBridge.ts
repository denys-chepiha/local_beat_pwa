// Core
import bridgeSource from './flowBridgeRuntime.js?raw'
// Types
import type { ReaderLocation, ReadingPreferences, SearchMatch } from '@/reader/types'

const SCOPE = 'local-beat-flow'
const SEARCH_TIMEOUT = 10_000
const MAX_PAGES = 100_000

export function createFlowChannel() {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) => value.toString(16).padStart(8, '0')).join('')
}

export function createFlowClient(target: Window, channel: string, options: {
  preferences: ReadingPreferences
  progress: number
  resources: Blob[]
  onLocation: (location: ReaderLocation) => void
  onFontSize?: (size: number) => void
  onEscape: () => void
  onError: (message: string) => void
}) {
  let ready = false
  let initializing = false
  let disposed = false
  let sequence = 0
  let preferences = options.preferences
  let queued: Record<string, unknown>[] = []
  const pending = new Map<number, { resolve: (matches: SearchMatch[]) => void; timer: ReturnType<typeof setTimeout> }>()
  const send = (message: Record<string, unknown>) => {
    if (!disposed) target.postMessage({ scope: SCOPE, channel, ...message }, '*')
  }
  const command = (message: Record<string, unknown>) => {
    if (disposed) return
    if (ready) send(message)
    else { queued = queued.filter((item) => item.type !== message.type); queued.push(message) }
  }
  const cancelSearch = () => {
    for (const item of pending.values()) { clearTimeout(item.timer); item.resolve([]) }
    pending.clear()
    queued = queued.filter((item) => item.type !== 'search')
    command({ type: 'cancel-search' })
  }
  const receive = (event: MessageEvent) => {
    if (disposed || event.source !== target || event.origin !== 'null' || !event.data || typeof event.data !== 'object') return
    const data = event.data as Record<string, unknown>
    if (data.scope !== SCOPE || data.channel !== channel) return
    if (data.type === 'ready') {
      if (ready || initializing) return
      initializing = true
      send({ type: 'init', preferences, resources: options.resources, progress: Number.isFinite(options.progress) ? Math.max(0, Math.min(1, options.progress)) : 0 })
    } else if (data.type === 'initialized' && initializing && !ready) {
      ready = true
      send({ type: 'preferences', preferences })
      queued.forEach(send); queued = []
    } else if (data.type === 'location') {
      const value = data.location as Record<string, unknown> | undefined
      if (!value || !Number.isFinite(value.page) || !Number.isFinite(value.totalPages) || !Number.isFinite(value.progress)) return
      const totalPages = Math.max(1, Math.min(MAX_PAGES, Math.round(value.totalPages as number)))
      options.onLocation({ totalPages, page: Math.max(1, Math.min(totalPages, Math.round(value.page as number))), progress: Math.max(0, Math.min(1, value.progress as number)) })
    } else if (data.type === 'search-result' && Number.isSafeInteger(data.requestId)) {
      const request = pending.get(data.requestId as number)
      if (!request || !Array.isArray(data.matches) || data.matches.length > 200) return
      const valid = data.matches.every((match: unknown) => {
        if (!match || typeof match !== 'object') return false
        const value = match as Record<string, unknown>
        return typeof value.id === 'string' && /^reader-match-\d+$/.test(value.id) && typeof value.label === 'string' && value.label.length <= 512
      })
      if (!valid) return
      clearTimeout(request.timer); pending.delete(data.requestId as number)
      request.resolve(data.matches as SearchMatch[])
    } else if (data.type === 'font-size' && Number.isFinite(data.fontSize) && Number(data.fontSize) >= 14 && Number(data.fontSize) <= 32) options.onFontSize?.(Math.round(Number(data.fontSize)))
    else if (data.type === 'escape') options.onEscape()
    else if (data.type === 'error') options.onError('This document could not be displayed. Close it and try again.')
  }
  return {
    receive,
    hello: () => send({ type: 'hello' }),
    preferences: (next: ReadingPreferences) => { preferences = next; if (ready) send({ type: 'preferences', preferences: next }) },
    page: (page: number) => { if (Number.isFinite(page)) command({ type: 'page', page: Math.max(1, Math.min(MAX_PAGES, Math.round(page))) }) },
    progress: (progress: number) => { if (Number.isFinite(progress)) command({ type: 'progress', progress: Math.max(0, Math.min(1, progress)) }) },
    outline: (id: string) => { if (typeof id === 'string' && id.length <= 512) command({ type: 'outline', id }) },
    search: (query: string): Promise<SearchMatch[]> => {
      cancelSearch()
      if (disposed) return Promise.resolve([])
      const requestId = ++sequence
      return new Promise((resolve) => {
        const timer = setTimeout(() => { pending.delete(requestId); queued = queued.filter((item) => item.requestId !== requestId); resolve([]); command({ type: 'cancel-search' }) }, SEARCH_TIMEOUT)
        pending.set(requestId, { resolve, timer })
        command({ type: 'search', requestId, query: query.slice(0, 512) })
      })
    },
    dispose: () => {
      cancelSearch(); send({ type: 'dispose' }); disposed = true; queued = []
    },
  }
}

export function createFlowSource(html: string, css: string, channel: string, nonce: string) {
  // The parent policy pins this exact trusted source by hash; the frame also
  // requires its nonce. Embedding avoids opaque-frame network access when offline.
  const parentOrigin = location.origin.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; img-src blob: data:; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'"><style>${css}</style></head><body><div id="reader-scroll"><article id="reader-content">${html}</article></div><script nonce="${nonce}" data-reader-channel="${channel}" data-parent-origin="${parentOrigin}">${bridgeSource}</script></body></html>`
}

export function prepareFlowResources(html: string, ownedResources: readonly { url: string; blob: Blob }[] = []) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const owned = new Map(ownedResources.map((resource) => [resource.url, resource.blob]))
  const resources: Blob[] = []
  const indices = new Map<string, number>()
  for (const image of doc.querySelectorAll('img[src]')) {
    const src = image.getAttribute('src') ?? ''
    if (!src.startsWith('blob:')) continue
    // Only exact parser-owned blobs cross the opaque-origin boundary; no fetch.
    const blob = owned.get(src)
    if (!blob) { image.removeAttribute('src'); continue }
    let index = indices.get(src)
    if (index === undefined) {
      if (resources.length >= 1000) { image.removeAttribute('src'); continue }
      index = resources.length; indices.set(src, index); resources.push(blob)
    }
    image.removeAttribute('src'); image.setAttribute('data-reader-resource', String(index))
  }
  return { html: doc.body.innerHTML, resources }
}
