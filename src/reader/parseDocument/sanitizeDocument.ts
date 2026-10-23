// Core
import createDOMPurify from 'dompurify'
// Types
import type { ParsedDocument } from './types'
import { DOCUMENT_LIMITS, DocumentParseError } from './types'
// Utils
import type { DocumentAssets } from './documentAssets'
import { assertTextSize, checkAbort, validateTree } from './readDocument'

const ALLOWED_TAGS = ['p', 'div', 'section', 'article', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'small', 'sub', 'sup', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'figure', 'figcaption', 'img', 'a', 'ruby', 'rt', 'rp']
const ALLOWED_ATTR = ['id', 'href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'start', 'value', 'lang', 'dir']

export interface DocumentSection {
  key: string
  html: string
  image?: (source: string) => string | undefined
  link?: (source: string) => { key: string; fragment: string } | undefined
}

/** Every attribute-bearing node is detached and sanitized before serialization. */
export function sanitizeDocument(sections: DocumentSection[], assets: DocumentAssets, signal?: AbortSignal): Pick<ParsedDocument, 'html' | 'text' | 'outline'> {
  const purifier = createDOMPurify(window)
  const roots: Array<{ section: DocumentSection; root: HTMLElement; ids: Map<string, string> }> = []
  const links: Array<{ node: Element; key: string; fragment: string }> = []
  const outline: ParsedDocument['outline'] = []
  let totalNodes = 0
  let totalSource = 0
  let idCounter = 0
  for (const section of sections) {
    checkAbort(signal)
    totalSource += section.html.length
    if (totalSource > DOCUMENT_LIMITS.textBytes) throw new DocumentParseError('The document contains too much text to open safely.')
    assertTextSize(section.html)
    const fragment = purifier.sanitize(section.html, {
      ALLOWED_TAGS, ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      ALLOWED_URI_REGEXP: /^(?:blob:|data:image\/(?:png|jpe?g|gif|webp);base64,|[^:]*$)/i,
      FORBID_CONTENTS: ['script', 'style', 'svg', 'math', 'iframe', 'object', 'embed', 'template', 'noscript', 'form'],
      RETURN_DOM_FRAGMENT: true,
    })
    validateTree(fragment)
    totalNodes += fragment.querySelectorAll('*').length
    if (totalNodes > DOCUMENT_LIMITS.nodes) throw new DocumentParseError('The document structure is too complex to open safely.')
    const root = document.createElement('section')
    root.id = `reader-section-${roots.length + 1}`
    root.append(fragment)
    const ids = new Map<string, string>()
    for (const node of root.querySelectorAll('*')) {
      const original = node.getAttribute('id')
      if (original) {
        const id = `reader-anchor-${++idCounter}`
        if (!ids.has(original)) ids.set(original, id)
        node.id = id
      }
      if (/^H[1-6]$/.test(node.tagName)) {
        node.id ||= `reader-heading-${++idCounter}`
        const title = node.textContent?.trim()
        if (title) outline.push({ title: title.slice(0, 500), id: node.id })
      }
      for (const attribute of ['colspan', 'rowspan', 'start', 'value']) {
        if (node.hasAttribute(attribute)) {
          const value = Number(node.getAttribute(attribute))
          if (!Number.isInteger(value) || value < 1 || value > 1000) node.removeAttribute(attribute)
        }
      }
      if (node.hasAttribute('dir') && !/^(ltr|rtl|auto)$/.test(node.getAttribute('dir')!)) node.removeAttribute('dir')
      if (node.tagName === 'IMG') {
        const source = node.getAttribute('src') || ''
        const local = assets.owns(source) ? source : source.startsWith('data:') ? assets.dataImage(source) : section.image?.(source)
        if (local && assets.owns(local)) node.setAttribute('src', local)
        else node.replaceWith(document.createTextNode(node.getAttribute('alt') || ''))
      }
      if (node.tagName === 'A') {
        const source = node.getAttribute('href')
        node.removeAttribute('href')
        if (source) {
          let destination: { key: string; fragment: string } | undefined
          if (source.startsWith('#')) {
            try { destination = { key: section.key, fragment: decodeURIComponent(source.slice(1)) } } catch { /* Invalid anchor. */ }
          } else destination = section.link?.(source)
          if (destination) links.push({ node, ...destination })
        }
      } else node.removeAttribute('href')
      if (node.tagName !== 'IMG') node.removeAttribute('src')
    }
    roots.push({ section, root, ids })
  }
  const byKey = new Map(roots.map((entry) => [entry.section.key, entry]))
  for (const link of links) {
    const destination = byKey.get(link.key)
    const id = link.fragment ? destination?.ids.get(link.fragment) : destination?.root.id
    if (id) link.node.setAttribute('href', `#${id}`)
  }
  const html = roots.map(({ root }) => root.outerHTML).join('\n')
  assertTextSize(html)
  // Block boundaries remain searchable as words, rather than being concatenated.
  const text = roots.map(({ root }) => {
    const copy = root.cloneNode(true) as HTMLElement
    for (const node of copy.querySelectorAll('p,div,section,article,h1,h2,h3,h4,h5,h6,br,hr,li,tr,blockquote,pre')) node.append('\n')
    return copy.textContent || ''
  }).join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return { html, text, outline }
}

export function htmlTitle(source: string): string | undefined {
  const match = /<title(?:\s[^>]*)?>([\s\S]*?)<\/title\s*>/i.exec(source)
  if (!match) return undefined
  const clean = createDOMPurify(window).sanitize(match[1], { ALLOWED_TAGS: [], ALLOWED_ATTR: [], RETURN_DOM_FRAGMENT: true })
  return clean.textContent?.trim().slice(0, 500) || undefined
}
