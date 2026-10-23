// Types
import { DOCUMENT_LIMITS, DocumentParseError } from './types'
import type { DocumentArchive } from './readArchive'
import type { DocumentAssets } from './documentAssets'
import type { DocumentSection } from './sanitizeDocument'
// Utils
import { abortable, checkAbort, decodeText, firstText, parseXml, yieldToBrowser } from './readDocument'

export async function parseDocx(bytes: Uint8Array<ArrayBuffer>, archive: DocumentArchive, assets: DocumentAssets, signal?: AbortSignal): Promise<{ title?: string; author?: string; sections: DocumentSection[] }> {
  if (!archive.has('[Content_Types].xml') || !archive.has('word/document.xml')) throw new DocumentParseError('This archive is not a Word DOCX document.')
  let xmlSize = 0
  let xmlNodes = 0
  for (const [name, entry] of archive) {
    if (name.startsWith('word/media/') && entry.length > DOCUMENT_LIMITS.imageBytes) throw new DocumentParseError('An embedded image exceeds the 10 MiB size limit.')
    if (!/\.(xml|rels)$/i.test(name)) continue
    xmlSize += entry.length
    if (xmlSize > DOCUMENT_LIMITS.textBytes) throw new DocumentParseError('The Word document contains too much XML to open safely.')
    const xml = parseXml(decodeText(entry))
    xmlNodes += xml.getElementsByTagName('*').length
    if (xmlNodes > DOCUMENT_LIMITS.nodes) throw new DocumentParseError('The Word document structure is too complex to open safely.')
    await yieldToBrowser(signal)
  }
  const core = archive.get('docProps/core.xml')
  const properties = core ? parseXml(decodeText(core)) : undefined
  const title = properties && firstText(properties, 'title')
  const author = properties && firstText(properties, 'creator')
  const { default: mammoth } = await import('mammoth/mammoth.browser')
  checkAbort(signal)
  let imageIndex = 0
  let imageError: unknown
  const result = await abortable(mammoth.convertToHtml({ arrayBuffer: bytes.buffer }, {
    externalFileAccess: false,
    includeEmbeddedStyleMap: false,
    idPrefix: 'docx-',
    convertImage: mammoth.images.imgElement(async (image) => {
      checkAbort(signal)
      if (imageError) throw imageError
      if (++imageIndex > DOCUMENT_LIMITS.images) {
        imageError = new DocumentParseError('The document contains too many embedded images.')
        throw imageError
      }
      if (!/^image\/(png|jpeg|gif|webp)$/i.test(image.contentType)) return { src: '' }
      const content = new Uint8Array(await abortable(image.readAsArrayBuffer(), signal))
      try { return { src: assets.add(`docx-image-${imageIndex}`, content)?.url || '' } }
      catch (error) { imageError = error; throw error }
    }),
  }), signal)
  checkAbort(signal)
  if (imageError) throw imageError
  return { title, author, sections: [{ key: 'docx', html: result.value }] }
}
