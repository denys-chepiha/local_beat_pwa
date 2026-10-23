// Core
import { marked } from 'marked'
// Types
import type { ParsedDocument } from './types'
import { DOCUMENT_LIMITS, DocumentParseError } from './types'
// Utils
import { DocumentAssets } from './documentAssets'
import { readArchive } from './readArchive'
import { checkAbort, decodeText, escapeHtml, readDocumentBytes, yieldToBrowser } from './readDocument'
import { htmlTitle, sanitizeDocument } from './sanitizeDocument'
import { parseEpub } from './parseEpub'
import { parseFb2 } from './parseFb2'
import { parseDocx } from './parseDocx'

export type { ParsedDocument } from './types'
export { DOCUMENT_LIMITS, DocumentParseError } from './types'

/** Parse locally; caller owns dispose() until the document is closed or replaced. */
export async function parseDocument(file: Blob, fileName: string, signal?: AbortSignal): Promise<ParsedDocument> {
  checkAbort(signal)
  const name = fileName.toLowerCase()
  const extension = name.split('.').pop() || ''
  const zippedFb2 = name.endsWith('.fb2.zip')
  if (!['epub', 'fb2', 'txt', 'md', 'markdown', 'html', 'htm', 'docx'].includes(extension) && !zippedFb2) {
    throw new DocumentParseError('This document format is not supported. Choose EPUB, FB2, TXT, Markdown, HTML or DOCX.')
  }
  const archiveFormat = extension === 'epub' || extension === 'docx' || zippedFb2
  const bytes = await readDocumentBytes(file, archiveFormat ? DOCUMENT_LIMITS.inputBytes : DOCUMENT_LIMITS.textBytes, signal)
  await yieldToBrowser(signal)
  const assets = new DocumentAssets(signal)
  try {
    let title: string | undefined
    let author: string | undefined
    let cover: Blob | undefined
    let sections
    if (archiveFormat) {
      const archive = await readArchive(bytes, signal)
      if (extension === 'epub') ({ title, author, cover, sections } = await parseEpub(archive, assets, signal))
      else if (extension === 'docx') ({ title, author, sections } = await parseDocx(bytes, archive, assets, signal))
      else {
        const entries = Array.from(archive.entries()).filter(([path]) => path.toLowerCase().endsWith('.fb2'))
        if (entries.length !== 1) throw new DocumentParseError('A FictionBook ZIP must contain exactly one FB2 document.')
        ;({ title, author, cover, sections } = parseFb2(decodeText(entries[0][1]), assets, signal))
      }
    } else {
      const source = decodeText(bytes)
      if (extension === 'fb2') ({ title, author, cover, sections } = parseFb2(source, assets, signal))
      else if (extension === 'txt') sections = [{ key: 'text', html: source.replace(/\r\n?/g, '\n').split(/\n[\t ]*\n/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('\n') }]
      else if (extension === 'md' || extension === 'markdown') sections = [{ key: 'markdown', html: await marked.parse(source, { async: true, gfm: true }) }]
      else { title = htmlTitle(source); sections = [{ key: 'html', html: source }] }
    }
    checkAbort(signal)
    const content = sanitizeDocument(sections, assets, signal)
    const fallbackTitle = fileName.replace(/\.(?:fb2\.zip|[^.]+)$/i, '') || fileName
    return { title: (title || content.outline[0]?.title || fallbackTitle).slice(0, 500), author: author?.slice(0, 1000), cover, ...content, resources: assets.snapshot(), dispose: assets.dispose }
  } catch (error) {
    assets.dispose()
    throw error
  }
}
