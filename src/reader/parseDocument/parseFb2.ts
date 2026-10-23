// Types
import { DocumentParseError } from './types'
import type { DocumentAssets } from './documentAssets'
import type { DocumentSection } from './sanitizeDocument'
// Utils
import { decodeBase64 } from './documentAssets'
import { checkAbort, elements, escapeHtml, firstText, parseXml } from './readDocument'

function localHref(element: Element): string {
  return element.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || element.getAttribute('href') || ''
}

export function parseFb2(source: string, assets: DocumentAssets, signal?: AbortSignal): { title?: string; author?: string; cover?: Blob; sections: DocumentSection[] } {
  const xml = parseXml(source)
  if (xml.documentElement.localName !== 'FictionBook') throw new DocumentParseError('This file is not a FictionBook document.')
  const metadata = elements(xml, 'title-info')[0]
  const title = metadata && firstText(metadata, 'book-title')
  const author = metadata && Array.from(metadata.children).filter((child) => child.localName === 'author').map((node) => {
    return ['first-name', 'middle-name', 'last-name'].map((name) => firstText(node, name)).filter(Boolean).join(' ') || firstText(node, 'nickname')
  }).filter(Boolean).join(', ')
  const binaries = new Map<string, Element>()
  for (const binary of elements(xml, 'binary')) {
    const id = binary.getAttribute('id')
    if (!id) continue
    if (binaries.has(id)) throw new DocumentParseError('The FictionBook contains duplicate binary identifiers.')
    binaries.set(id, binary)
  }
  const decodedImages = new Map<string, ReturnType<DocumentAssets['add']>>()
  const image = (reference: string) => {
    if (!reference.startsWith('#')) return undefined
    if (decodedImages.has(reference)) return decodedImages.get(reference)
    const binary = binaries.get(reference.slice(1))
    if (!binary) return undefined
    const result = assets.add(reference, decodeBase64(binary.textContent || ''))
    decodedImages.set(reference, result)
    return result
  }
  const coverNode = metadata && elements(metadata, 'coverpage')[0]
  const coverImage = coverNode && elements(coverNode, 'image')[0]
  const cover = coverImage ? image(localHref(coverImage))?.blob : undefined
  const mapping: Record<string, string> = {
    p: 'p', section: 'section', body: 'section', subtitle: 'h3', emphasis: 'em', strong: 'strong', strikethrough: 's', sub: 'sub', sup: 'sup', code: 'code', cite: 'blockquote', epigraph: 'blockquote', poem: 'blockquote', stanza: 'div', v: 'p', 'text-author': 'p', date: 'p', annotation: 'section', table: 'table', tr: 'tr', td: 'td', th: 'th', a: 'a',
  }
  const render = (node: Node, level: number): string => {
    checkAbort(signal)
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent || '')
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const element = node as Element
    const name = element.localName
    if (['binary', 'description', 'stylesheet'].includes(name)) return ''
    if (name === 'empty-line') return '<br>'
    const id = element.getAttribute('id')
    const attributes = id ? ` id="${escapeHtml(id)}"` : ''
    if (name === 'image') {
      const source = image(localHref(element))?.url
      return source ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(element.getAttribute('alt') || '')}">` : ''
    }
    if (name === 'title') return `<h${Math.min(level, 6)}${attributes}>${escapeHtml(element.textContent?.trim() || '')}</h${Math.min(level, 6)}>`
    const children = Array.from(element.childNodes).map((child) => render(child, name === 'section' ? level + 1 : level)).join('')
    const tag = mapping[name]
    if (!tag) return children
    let extra = ''
    if (name === 'a') extra = ` href="${escapeHtml(localHref(element))}"`
    if (name === 'td' || name === 'th') {
      for (const attribute of ['colspan', 'rowspan']) {
        const value = element.getAttribute(attribute)
        if (value && /^\d{1,3}$/.test(value)) extra += ` ${attribute}="${value}"`
      }
    }
    return `<${tag}${attributes}${extra}>${children}</${tag}>`
  }
  const bodies = Array.from(xml.documentElement.children).filter((node) => node.localName === 'body')
  if (!bodies.length) throw new DocumentParseError('The FictionBook has no readable body.')
  // Notes and main text share an anchor namespace in FictionBook.
  const html = bodies.map((body) => render(body, 1)).join('\n')
  return { title, author: author || undefined, cover, sections: [{ key: 'fb2', html }] }
}
