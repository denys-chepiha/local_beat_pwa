// Types
import { DocumentParseError } from './types'
import type { DocumentArchive } from './readArchive'
import type { DocumentAssets } from './documentAssets'
import type { DocumentSection } from './sanitizeDocument'
// Utils
import { decodeText, elements, firstText, parseXml, checkAbort, yieldToBrowser } from './readDocument'
import { resolveArchivePath } from './readArchive'

interface EpubItem { id: string; path: string; mediaType: string; properties: string[] }

const FONT_OBFUSCATION = new Set(['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'])
const FONT_TYPES = new Set(['font/otf', 'font/ttf', 'font/woff', 'font/woff2', 'application/vnd.ms-opentype', 'application/font-sfnt', 'application/font-woff', 'application/x-font-ttf', 'application/x-font-opentype'])

export async function parseEpub(archive: DocumentArchive, assets: DocumentAssets, signal?: AbortSignal): Promise<{ title?: string; author?: string; cover?: Blob; sections: DocumentSection[] }> {
  const encryption = archive.get('META-INF/encryption.xml')
  const mimetype = archive.get('mimetype')
  if (mimetype && decodeText(mimetype).trim() !== 'application/epub+zip') throw new DocumentParseError('This archive is not an EPUB book.')
  const containerBytes = archive.get('META-INF/container.xml')
  if (!containerBytes) throw new DocumentParseError('The EPUB container is missing.')
  const container = parseXml(decodeText(containerBytes))
  const rootfile = elements(container, 'rootfile').find((node) => node.getAttribute('media-type') === 'application/oebps-package+xml') ?? elements(container, 'rootfile')[0]
  const packageReference = rootfile?.getAttribute('full-path')
  const packagePath = packageReference ? resolveArchivePath('', packageReference) : undefined
  const packageBytes = packagePath ? archive.get(packagePath) : undefined
  if (!packagePath || !packageBytes) throw new DocumentParseError('The EPUB package is missing.')
  const packageDocument = parseXml(decodeText(packageBytes))
  const manifest = new Map<string, EpubItem>()
  for (const item of elements(packageDocument, 'item')) {
    const id = item.getAttribute('id')
    const path = resolveArchivePath(packagePath, item.getAttribute('href') || '')
    if (!id || !path) continue
    if (manifest.has(id)) throw new DocumentParseError('The EPUB contains duplicate manifest identifiers.')
    manifest.set(id, { id, path, mediaType: item.getAttribute('media-type') || '', properties: (item.getAttribute('properties') || '').split(/\s+/) })
  }
  const omittedFonts = new Set<string>()
  if (encryption) {
    for (const encrypted of elements(parseXml(decodeText(encryption)), 'EncryptedData')) {
      const algorithm = elements(encrypted, 'EncryptionMethod')[0]?.getAttribute('Algorithm') || ''
      const references = elements(encrypted, 'CipherReference')
      if (!FONT_OBFUSCATION.has(algorithm) || !references.length) throw new DocumentParseError('DRM-protected or encrypted EPUB content is not supported.')
      for (const reference of references) {
        const path = resolveArchivePath('', reference.getAttribute('URI') || '')
        const items = Array.from(manifest.values()).filter((candidate) => candidate.path === path)
        if (!path || !items.length || items.some((item) => !FONT_TYPES.has(item.mediaType))) throw new DocumentParseError('DRM-protected or encrypted EPUB content is not supported.')
        // Standard font obfuscation is not DRM. Reader typography replaces
        // publication fonts, so these resources never need to be decoded.
        omittedFonts.add(path)
      }
    }
  }
  const metadata = elements(packageDocument, 'metadata')[0]
  const title = metadata && firstText(metadata, 'title')
  const author = metadata && elements(metadata, 'creator').map((node) => node.textContent?.trim()).filter(Boolean).join(', ')
  const coverId = elements(packageDocument, 'meta').find((meta) => meta.getAttribute('name') === 'cover')?.getAttribute('content')
  const coverItem = Array.from(manifest.values()).find((item) => item.properties.includes('cover-image')) ?? (coverId ? manifest.get(coverId) : undefined)
  const coverData = coverItem && !omittedFonts.has(coverItem.path) ? archive.get(coverItem.path) : undefined
  const cover = coverData && assets.add(coverItem!.path, coverData)?.blob
  const sections: DocumentSection[] = []
  const visited = new Set<string>()
  const spine = elements(packageDocument, 'spine')[0]
  if (!spine) throw new DocumentParseError('The EPUB reading order is missing.')
  for (const reference of elements(spine, 'itemref')) {
    checkAbort(signal)
    const item = manifest.get(reference.getAttribute('idref') || '')
    if (!item || !archive.has(item.path)) throw new DocumentParseError('An EPUB chapter is missing from the archive.')
    if (visited.has(item.path)) continue
    if (!['application/xhtml+xml', 'text/html'].includes(item.mediaType)) throw new DocumentParseError('This EPUB uses an unsupported chapter format.')
    visited.add(item.path)
    const html = decodeText(archive.get(item.path)!)
    // XHTML may declare the HTML doctype but may never declare entities.
    if (/<!\s*ENTITY\b|<!\s*DOCTYPE[^>]*\[/i.test(html)) throw new DocumentParseError('EPUB chapters with entity declarations are not supported.')
    sections.push({
      key: item.path, html,
      image: (source) => {
        const path = resolveArchivePath(item.path, source)
        if (path && omittedFonts.has(path)) return undefined
        const bytes = path && archive.get(path)
        return bytes ? assets.add(path!, bytes)?.url : undefined
      },
      link: (source) => {
        const key = resolveArchivePath(item.path, source)
        if (!key) return undefined
        try { return { key, fragment: decodeURIComponent(source.includes('#') ? source.slice(source.indexOf('#') + 1) : '') } }
        catch { return undefined }
      },
    })
    await yieldToBrowser(signal)
  }
  if (!sections.length) throw new DocumentParseError('The EPUB has no readable chapters.')
  return { title, author: author || undefined, cover, sections }
}
