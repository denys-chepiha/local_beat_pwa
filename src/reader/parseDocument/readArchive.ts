// Core
import { Inflate } from 'fflate'
// Types
import { DOCUMENT_LIMITS, DocumentParseError } from './types'
// Utils
import { checkAbort, yieldToBrowser } from './readDocument'

interface ArchiveEntry {
  name: string
  compressedSize: number
  size: number
  method: number
  crc: number
  headerStart: number
  start: number
  end: number
  recordEnd: number
}

export type DocumentArchive = Map<string, Uint8Array<ArrayBuffer>>

export function safeArchivePath(name: string): string {
  if (!name || name.length > 1024 || /[\\\x00-\x1f\x7f:#?]/.test(name) || name.startsWith('/') || /%[0-9a-f]{2}/i.test(name)) {
    throw new DocumentParseError('The archive contains an unsafe file path.')
  }
  const parts = name.replace(/\/$/, '').split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new DocumentParseError('The archive contains an unsafe file path.')
  return name.normalize('NFC')
}

/** Resolve only archive-local references; parent segments cannot escape its root. */
export function resolveArchivePath(baseFile: string, reference: string): string | undefined {
  if (!reference || /[\\\x00-\x1f\x7f]/.test(reference) || reference.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(reference)) return undefined
  let path: string
  try { path = decodeURIComponent(reference.split(/[?#]/)[0]) }
  catch { return undefined }
  if (!path) return baseFile
  if (/[\\\x00-\x1f\x7f:#?]/.test(path) || path.startsWith('/')) return undefined
  const parts = baseFile.split('/').slice(0, -1)
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') { if (!parts.length) return undefined; parts.pop() }
    else parts.push(part)
  }
  return parts.join('/').normalize('NFC') || undefined
}

function archiveEntries(bytes: Uint8Array): ArchiveEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (offset: number) => view.getUint16(offset, true)
  const u32 = (offset: number) => view.getUint32(offset, true)
  let end = bytes.length - 22
  while (end >= Math.max(0, bytes.length - 65557)) {
    if (u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length) break
    end--
  }
  if (end < Math.max(0, bytes.length - 65557)) throw new DocumentParseError('This is not a valid ZIP document.')
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) throw new DocumentParseError('Multi-volume archives are not supported.')
  const count = u16(end + 10)
  const centralSize = u32(end + 12)
  const centralStart = u32(end + 16)
  if (!count || count > DOCUMENT_LIMITS.entries || centralStart === 0xffffffff || centralSize === 0xffffffff) throw new DocumentParseError('The archive has too many entries or uses unsupported ZIP64 storage.')
  if (centralStart + centralSize !== end) throw new DocumentParseError('The archive directory is invalid.')
  const names = new Set<string>()
  const entries: ArchiveEntry[] = []
  let expanded = 0
  let cursor = centralStart
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) throw new DocumentParseError('The archive directory is damaged.')
    const flags = u16(cursor + 8)
    const method = u16(cursor + 10)
    const crc = u32(cursor + 16)
    const compressedSize = u32(cursor + 20)
    const size = u32(cursor + 24)
    const nameLength = u16(cursor + 28)
    const next = cursor + 46 + nameLength + u16(cursor + 30) + u16(cursor + 32)
    if (next > end) throw new DocumentParseError('The archive directory is damaged.')
    if (flags & 0x2041) throw new DocumentParseError('Encrypted or password-protected documents are not supported.')
    if (method !== 0 && method !== 8) throw new DocumentParseError('This archive uses unsupported compression.')
    if (u16(cursor + 34) || size === 0xffffffff || compressedSize === 0xffffffff) throw new DocumentParseError('ZIP64 and multi-volume archives are not supported.')
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength)
    let name: string
    try { name = safeArchivePath(new TextDecoder('utf-8', { fatal: true }).decode(rawName)) }
    catch (error) { if (error instanceof DocumentParseError) throw error; throw new DocumentParseError('Archive filenames must use UTF-8.') }
    if (names.has(name)) throw new DocumentParseError('The archive contains duplicate file paths.')
    names.add(name)
    expanded += size
    if (size > DOCUMENT_LIMITS.entryBytes || expanded > DOCUMENT_LIMITS.expandedBytes || size > Math.max(1024 * 1024, compressedSize * 1000)) {
      throw new DocumentParseError('The archive expands beyond the safe document size limit.')
    }
    const local = u32(cursor + 42)
    if (local + 30 > centralStart || u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method) throw new DocumentParseError('Archive headers do not agree.')
    const localNameLength = u16(local + 26)
    const start = local + 30 + localNameLength + u16(local + 28)
    const dataEnd = start + compressedSize
    if (start > centralStart || dataEnd > centralStart || localNameLength !== rawName.length || rawName.some((byte, index) => byte !== bytes[local + 30 + index])) throw new DocumentParseError('Archive headers do not agree.')
    if (!(flags & 8) && (u32(local + 14) !== crc || u32(local + 18) !== compressedSize || u32(local + 22) !== size)) throw new DocumentParseError('Archive sizes do not agree.')
    let recordEnd = dataEnd
    if (flags & 8) {
      if (recordEnd + 12 > centralStart) throw new DocumentParseError('The archive data descriptor is missing.')
      const descriptor = u32(recordEnd) === 0x08074b50 ? recordEnd + 4 : recordEnd
      recordEnd = descriptor + 12
      if (recordEnd > centralStart || u32(descriptor) !== crc || u32(descriptor + 4) !== compressedSize || u32(descriptor + 8) !== size) throw new DocumentParseError('Archive sizes do not agree.')
    }
    if (method === 0 && compressedSize !== size) throw new DocumentParseError('The archive contains an invalid stored file.')
    if (name.endsWith('/') && size !== 0) throw new DocumentParseError('The archive contains an invalid directory.')
    entries.push({ name, compressedSize, size, method, crc, headerStart: local, start, end: dataEnd, recordEnd })
    cursor = next
  }
  if (cursor !== end) throw new DocumentParseError('The archive directory is damaged.')
  const ranges = entries.slice().sort((a, b) => a.headerStart - b.headerStart)
  for (let i = 1; i < ranges.length; i++) if (ranges[i].headerStart < ranges[i - 1].recordEnd) throw new DocumentParseError('The archive contains overlapping files.')
  return entries
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0)
  return value >>> 0
})

export async function readArchive(bytes: Uint8Array, signal?: AbortSignal): Promise<DocumentArchive> {
  checkAbort(signal)
  if (bytes.length > DOCUMENT_LIMITS.inputBytes) throw new DocumentParseError('The archive exceeds the document size limit.')
  const entries = archiveEntries(bytes)
  const archive: DocumentArchive = new Map()
  let total = 0
  for (const entry of entries) {
    await yieldToBrowser(signal)
    const chunks: Uint8Array[] = []
    let length = 0
    let crc = 0xffffffff
    const receive = (chunk: Uint8Array) => {
      checkAbort(signal)
      length += chunk.length
      total += chunk.length
      if (length > entry.size || length > DOCUMENT_LIMITS.entryBytes || total > DOCUMENT_LIMITS.expandedBytes) throw new DocumentParseError('The archive expands beyond its declared or safe size.')
      for (const byte of chunk) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 255]
      chunks.push(chunk)
    }
    try {
      if (entry.method === 0) {
        for (let at = entry.start; at < entry.end; at += 65536) {
          receive(bytes.subarray(at, Math.min(at + 65536, entry.end)))
          if ((at - entry.start) % (1024 * 1024) === 0) await yieldToBrowser(signal)
        }
      } else {
        // Small compressed chunks bound transient expansion; yielding permits an
        // AbortSignal to interrupt work without creating blob-based workers.
        const inflater = new Inflate((chunk) => receive(chunk))
        if (entry.compressedSize === 0) throw new DocumentParseError('The archive contains an empty compressed stream.')
        let lastYield = performance.now()
        for (let at = entry.start; at < entry.end; at += 4096) {
          const next = Math.min(at + 4096, entry.end)
          inflater.push(bytes.subarray(at, next), next === entry.end)
          if (performance.now() - lastYield >= 8 || next === entry.end) {
            await yieldToBrowser(signal)
            lastYield = performance.now()
          }
        }
      }
    } catch (error) {
      if (error instanceof DocumentParseError || (error instanceof DOMException && error.name === 'AbortError')) throw error
      throw new DocumentParseError('The archive contains damaged compressed data.')
    }
    if (length !== entry.size || ((crc ^ 0xffffffff) >>> 0) !== entry.crc) throw new DocumentParseError('An archive file failed its integrity check.')
    if (!entry.name.endsWith('/')) {
      const output = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length }
      archive.set(entry.name, output)
    }
  }
  return archive
}
