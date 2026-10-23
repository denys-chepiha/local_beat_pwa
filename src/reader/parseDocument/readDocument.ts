// Types
import { DOCUMENT_LIMITS, DocumentParseError } from './types'

export function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Document opening cancelled.', 'AbortError')
}

export async function yieldToBrowser(signal?: AbortSignal): Promise<void> {
  checkAbort(signal)
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  checkAbort(signal)
}

export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  checkAbort(signal)
  if (!signal) return promise
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Document opening cancelled.', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export async function readDocumentBytes(file: Blob, maximum: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  checkAbort(signal)
  if (file.size > maximum) throw new DocumentParseError(`This document exceeds the ${Math.floor(maximum / 1024 / 1024)} MiB size limit.`)
  if (file.size === 0) throw new DocumentParseError('This document is empty.')
  const buffer = typeof file.arrayBuffer === 'function'
    ? await abortable(file.arrayBuffer(), signal)
    : await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      const clean = () => signal?.removeEventListener('abort', abort)
      const abort = () => { reader.abort(); clean(); reject(new DOMException('Document opening cancelled.', 'AbortError')) }
      reader.onload = () => { clean(); resolve(reader.result as ArrayBuffer) }
      reader.onerror = () => { clean(); reject(new DocumentParseError('The document could not be read.')) }
      signal?.addEventListener('abort', abort, { once: true })
      reader.readAsArrayBuffer(file)
    })
  checkAbort(signal)
  return new Uint8Array(buffer)
}

export function decodeText(bytes: Uint8Array): string {
  if (bytes.length > DOCUMENT_LIMITS.textBytes) throw new DocumentParseError('The document contains too much text to open safely.')
  let encoding = 'utf-8'
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le'
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be'
  else {
    const header = new TextDecoder().decode(bytes.subarray(0, 256))
    const declaration = /^\s*<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i.exec(header)
    if (declaration) encoding = declaration[1]
  }
  try { return new TextDecoder(encoding).decode(bytes) }
  catch { throw new DocumentParseError('This document uses an unsupported text encoding.') }
}

export function assertTextSize(text: string): void {
  if (text.length > DOCUMENT_LIMITS.textBytes || new TextEncoder().encode(text).length > DOCUMENT_LIMITS.textBytes) {
    throw new DocumentParseError('The document contains too much text to open safely.')
  }
}

export function validateTree(root: Node): void {
  let count = 0
  const pending: Array<{ node: Node; depth: number }> = [{ node: root, depth: 0 }]
  while (pending.length) {
    const { node, depth } = pending.pop()!
    if (++count > DOCUMENT_LIMITS.nodes || depth > DOCUMENT_LIMITS.depth) throw new DocumentParseError('The document structure is too complex to open safely.')
    for (const child of node.childNodes) pending.push({ node: child, depth: depth + 1 })
  }
}

export function parseXml(source: string): XMLDocument {
  assertTextSize(source)
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)) throw new DocumentParseError('XML documents with DTDs or entity declarations are not supported.')
  const document = new DOMParser().parseFromString(source, 'application/xml')
  if (document.getElementsByTagName('parsererror').length || document.documentElement.localName === 'parsererror') {
    throw new DocumentParseError('The document contains invalid XML.')
  }
  validateTree(document)
  return document
}

export function elements(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', name))
}

export function firstText(root: Document | Element, name: string): string | undefined {
  return elements(root, name)[0]?.textContent?.trim() || undefined
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}
