// Types
import { DOCUMENT_LIMITS, DocumentParseError } from './types'
// Utils
import { checkAbort } from './readDocument'

function checkPixels(width: number, height: number): void {
  if (width * height > 40000000) throw new DocumentParseError('An embedded image has too many pixels.')
}

export function imageType(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 24 && bytes[0] === 0x89 && String.fromCharCode(...bytes.subarray(1, 8)) === 'PNG\r\n\x1a\n') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    checkPixels(view.getUint32(16), view.getUint32(20))
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    let offset = 2
    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
      while (bytes[offset] === 0xff) offset++
      const marker = bytes[offset++]
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue
      const length = (bytes[offset] << 8) | bytes[offset + 1]
      if (length < 2 || offset + length > bytes.length) break
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
        checkPixels((bytes[offset + 5] << 8) | bytes[offset + 6], (bytes[offset + 3] << 8) | bytes[offset + 4])
        break
      }
      offset += length
    }
    return 'image/jpeg'
  }
  if (bytes.length >= 10 && /^GIF8[79]a$/.test(String.fromCharCode(...bytes.subarray(0, 6)))) {
    const width = bytes[6] | (bytes[7] << 8)
    const height = bytes[8] | (bytes[9] << 8)
    checkPixels(width, height)
    return 'image/gif'
  }
  if (bytes.length >= 30 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    const chunk = String.fromCharCode(...bytes.subarray(12, 16))
    if (chunk === 'VP8X') checkPixels(1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16))
    else if (chunk === 'VP8 ') checkPixels((bytes[26] | (bytes[27] << 8)) & 0x3fff, (bytes[28] | (bytes[29] << 8)) & 0x3fff)
    else if (chunk === 'VP8L' && bytes[20] === 0x2f) checkPixels(1 + ((bytes[21] | (bytes[22] << 8)) & 0x3fff), 1 + (((bytes[22] >> 6) | (bytes[23] << 2) | (bytes[24] << 10)) & 0x3fff))
    return 'image/webp'
  }
  return undefined
}

export class DocumentAssets {
  private readonly images = new Map<string, { url: string; blob: Blob }>()
  private readonly urls = new Set<string>()
  private total = 0
  private disposed = false

  constructor(private readonly signal?: AbortSignal) {}

  add(key: string, bytes: Uint8Array): { url: string; blob: Blob } | undefined {
    checkAbort(this.signal)
    if (this.disposed) throw new DOMException('Document opening cancelled.', 'AbortError')
    const existing = this.images.get(key)
    if (existing) return existing
    if (bytes.length > DOCUMENT_LIMITS.imageBytes) throw new DocumentParseError('An embedded image exceeds the 10 MiB size limit.')
    const type = imageType(bytes)
    if (!type) return undefined
    if (this.images.size >= DOCUMENT_LIMITS.images || this.total + bytes.length > DOCUMENT_LIMITS.imageTotalBytes) throw new DocumentParseError('The document contains too many embedded images.')
    const blob = new Blob([new Uint8Array(bytes)], { type })
    const image = { blob, url: URL.createObjectURL(blob) }
    this.images.set(key, image)
    this.urls.add(image.url)
    this.total += bytes.length
    return image
  }

  snapshot(): ReadonlyArray<{ url: string; blob: Blob }> {
    return [...this.images.values()].map(({ url, blob }) => ({ url, blob }))
  }

  owns(url: string): boolean { return this.urls.has(url) }

  dataImage(source: string): string | undefined {
    const match = /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,([a-z\d+/=\s]+)$/i.exec(source)
    if (!match) return undefined
    return this.add(source, decodeBase64(match[1]))?.url
  }

  dispose = (): void => {
    if (this.disposed) return
    this.disposed = true
    for (const url of this.urls) URL.revokeObjectURL(url)
    this.urls.clear()
    this.images.clear()
  }
}

export function decodeBase64(source: string): Uint8Array<ArrayBuffer> {
  if (source.length > Math.ceil(DOCUMENT_LIMITS.imageBytes * 4 / 3) + 100000) throw new DocumentParseError('An embedded image exceeds the 10 MiB size limit.')
  const compact = source.replace(/\s/g, '')
  if (compact.length > Math.ceil(DOCUMENT_LIMITS.imageBytes * 4 / 3) + 4 || !/^[a-z\d+/]*={0,2}$/i.test(compact)) throw new DocumentParseError('The document contains an invalid embedded image.')
  try { return Uint8Array.from(atob(compact), (character) => character.charCodeAt(0)) }
  catch { throw new DocumentParseError('The document contains an invalid embedded image.') }
}
