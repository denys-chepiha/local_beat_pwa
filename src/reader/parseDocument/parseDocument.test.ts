// Core
import { afterEach, describe, expect, it, vi } from 'vitest'
import { strToU8, Zip, ZipPassThrough, zipSync } from 'fflate'
// Utils
import { DOCUMENT_LIMITS, parseDocument } from './parseDocument'
import { readArchive } from './readArchive'

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
const PNG = Uint8Array.from(atob(PNG_BASE64), (character) => character.charCodeAt(0))
const cleanups: Array<() => void> = []

function makeZip(entries: Record<string, string | Uint8Array>): Uint8Array<ArrayBuffer> {
  return zipSync(Object.fromEntries(Object.entries(entries).map(([name, content]) => [name, typeof content === 'string' ? strToU8(content) : content])))
}

async function open(source: string | Uint8Array<ArrayBuffer>, fileName: string) {
  const result = await parseDocument(new File([source], fileName), fileName)
  cleanups.push(result.dispose)
  return result
}

function documentHtml(html: string): HTMLElement {
  const element = document.createElement('div')
  element.innerHTML = html
  return element
}

function epub(overrides: Record<string, string | Uint8Array> = {}) {
  return makeZip({
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'OPS/book.opf': '<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>A local book</dc:title><dc:creator>Test Author</dc:creator></metadata><manifest><item id="cover" href="Images/cover.png" media-type="image/png" properties="cover-image"/><item id="second" href="Text/second.xhtml" media-type="application/xhtml+xml"/><item id="first" href="Text/first.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="first"/><itemref idref="second"/></spine></package>',
    'OPS/Text/first.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1 id="one">First chapter</h1><p>First words.</p><img src="../Images/cover.png" alt="Cover"/><a href="second.xhtml#two">Next</a></body></html>',
    'OPS/Text/second.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><body><h2 id="two">Second chapter</h2><p>Second words.</p><a href="first.xhtml#one">Back</a></body></html>',
    'OPS/Images/cover.png': PNG,
    ...overrides,
  })
}

function fb2(body = '<section id="chapter"><title><p>Chapter one</p></title><p>Local <emphasis>reading</emphasis>.</p><image l:href="#cover"/><a l:href="#note">Note</a></section>') {
  return `<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink"><description><title-info><author><first-name>Olena</first-name><last-name>Test</last-name></author><book-title>Місцева книга</book-title><coverpage><image l:href="#cover"/></coverpage></title-info></description><body>${body}</body><body name="notes"><section id="note"><title><p>Notes</p></title><p>Footnote text</p></section></body><binary id="cover" content-type="image/png">${PNG_BASE64}</binary></FictionBook>`
}

function docx(overrides: Record<string, string | Uint8Array> = {}) {
  return makeZip({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Word heading</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Local DOCX text.</w:t></w:r></w:p><w:p><w:hyperlink r:id="external"><w:r><w:t>Unsafe hyperlink</w:t></w:r></w:hyperlink></w:p></w:body></w:document>',
    'word/styles.xml': '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>',
    'word/_rels/document.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="external" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://untrusted.invalid/" TargetMode="External"/></Relationships>',
    'docProps/core.xml': '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Word document</dc:title><dc:creator>Local Author</dc:creator></cp:coreProperties>',
    ...overrides,
  })
}

afterEach(() => {
  for (const dispose of cleanups.splice(0)) dispose()
  vi.restoreAllMocks()
})

describe('local text document formats', () => {
  it('keeps TXT literal in body paragraphs, preserving newlines and Unicode without interpreting markup', async () => {
    const result = await open('Привіт\n  <script>unsafe()</script> & text', 'Notes.TXT')
    expect(result.title).toBe('Notes')
    expect(result.text).toContain('<script>unsafe()</script>')
    expect(result.text).toContain('Привіт')
    expect(documentHtml(result.html).querySelector('script')).toBeNull()
    const root = documentHtml(result.html)
    expect(root.querySelector('pre,code')).toBeNull()
    expect(root.querySelector('p')?.textContent).toContain('  <script>')
    expect(root.querySelector('br')).not.toBeNull()
  })

  it('uses separate TXT paragraphs for blank lines and normalizes Windows newlines', async () => {
    const result = await open('First line\r\nSecond line\r\n\r\nNew paragraph', 'paragraphs.txt')
    const root = documentHtml(result.html)
    expect(root.querySelectorAll('p')).toHaveLength(2)
    expect(root.querySelectorAll('br')).toHaveLength(1)
    expect(result.text).toContain('First line\nSecond line')
  })

  it('decodes a UTF-16 text BOM', async () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x48, 0, 0x69, 0])
    expect((await open(bytes, 'utf16.txt')).text).toBe('Hi')
  })

  it('renders Markdown headings, lists, tables and code while removing HTML attacks', async () => {
    const result = await open('# Reading\n\n- one\n- two\n\n| Name | Value |\n| --- | --- |\n| A | B |\n\n`<code>`\n\n<script>evil()</script>\n<img src="https://untrusted.invalid/a" onerror="evil()">', 'book.md')
    const html = documentHtml(result.html)
    expect(result.title).toBe('Reading')
    expect(result.outline).toHaveLength(1)
    expect(html.querySelectorAll('li')).toHaveLength(2)
    expect(html.querySelector('table')).not.toBeNull()
    expect(html.querySelector('code')?.textContent).toBe('<code>')
    expect(html.querySelector('script,img')).toBeNull()
    expect(result.html).not.toContain('untrusted.invalid')
  })

  it('sanitizes HTML, keeps only mapped local anchors, and owns embedded image URLs', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const result = await open(`<html><head><title>Safe &amp; local</title><style>@import 'https://untrusted.invalid';</style></head><body onload="evil()"><h1 id="entry">Heading</h1><a href="#entry">Jump</a><a href="javascript:evil()">Bad link</a><a href="https://untrusted.invalid">Remote</a><img src="data:image/png;base64,${PNG_BASE64}" srcset="https://untrusted.invalid/image" style="background:url(https://untrusted.invalid)"><img src="//untrusted.invalid/image"><img src="blob:https://untrusted.invalid/fake"><iframe src="https://untrusted.invalid"></iframe><form action="https://untrusted.invalid"><input name="password"></form><svg><script>evil()</script></svg><math href="https://untrusted.invalid"></math><x-widget onclick="evil()">Keep text</x-widget></body></html>`, 'page.html')
    const root = documentHtml(result.html)
    expect(result.title).toBe('Safe & local')
    expect(root.querySelectorAll('img')).toHaveLength(1)
    expect(root.querySelector('img')?.getAttribute('src')).toMatch(/^blob:/)
    expect(root.querySelector('a')?.getAttribute('href')).toBe(`#${root.querySelector('h1')?.id}`)
    expect(root.querySelectorAll('a[href]')).toHaveLength(1)
    expect(root.querySelector('script,style,iframe,form,input,svg,math,x-widget,[onclick],[onload],[srcset]')).toBeNull()
    expect(result.html).not.toMatch(/untrusted\.invalid|javascript:|onerror|background/)
    expect(result.text).toContain('Keep text')
    result.dispose()
    result.dispose()
    expect(revoke).toHaveBeenCalledTimes(1)
  })

  it('discards SVG images even when supplied as an inline data URL', async () => {
    const result = await open('<h1>Safe</h1><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">', 'image.html')
    expect(documentHtml(result.html).querySelector('img')).toBeNull()
  })
})

describe('EPUB', () => {
  it('uses spine order, metadata, safe images, heading outline and cross-chapter anchors', async () => {
    const create = vi.spyOn(URL, 'createObjectURL')
    const result = await open(epub(), 'book.epub')
    expect(result.title).toBe('A local book')
    expect(result.author).toBe('Test Author')
    expect(result.cover?.type).toBe('image/png')
    expect(result.text.indexOf('First words')).toBeLessThan(result.text.indexOf('Second words'))
    expect(result.outline.map((entry) => entry.title)).toEqual(['First chapter', 'Second chapter'])
    expect(create).toHaveBeenCalledTimes(1)
    const root = documentHtml(result.html)
    const links = root.querySelectorAll('a')
    expect(links[0].getAttribute('href')).toBe(`#${result.outline[1].id}`)
    expect(links[1].getAttribute('href')).toBe(`#${result.outline[0].id}`)
  })

  it('does not retain external images, script, CSS, navigations or missing resources', async () => {
    const result = await open(epub({ 'OPS/Text/first.xhtml': '<h1>Chapter</h1><img src="https://untrusted.invalid"><img src="../../../escape.png"><img src="missing.png"><script>evil()</script><style>p{background:url(https://untrusted.invalid)}</style><a href="https://untrusted.invalid">External</a>' }), 'book.epub')
    expect(result.html).not.toMatch(/untrusted|script|style|escape\.png|missing\.png/)
    expect(documentHtml(result.html).querySelector('img')).toBeNull()
  })

  it.each<Record<string, string>>([
    { 'META-INF/encryption.xml': '<encryption><EncryptedData/></encryption>' },
    { 'META-INF/rights.xml': '<rights/>', 'META-INF/encryption.xml': '<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><CipherData><CipherReference URI="OPS/Text/first.xhtml"/></CipherData></EncryptedData></encryption>' },
  ])('rejects encrypted EPUB explicitly', async (extra) => {
    await expect(open(epub(extra), 'encrypted.epub')).rejects.toThrow(/encrypted|DRM/i)
  })

  it.each(['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'])('omits fonts declared with %s obfuscation while preserving readable content', async (algorithm) => {
    const result = await open(epub({
      'META-INF/encryption.xml': `<encryption xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="${algorithm}"/><enc:CipherData><enc:CipherReference URI="OPS/Fonts/reader.otf"/></enc:CipherData></enc:EncryptedData></encryption>`,
      'META-INF/rights.xml': '<rights><statement>License metadata does not encrypt publication content.</statement></rights>',
      'OPS/book.opf': '<package><manifest><item id="chapter" href="Text/first.xhtml" media-type="application/xhtml+xml"/><item id="font" href="Fonts/reader.otf" media-type="font/otf"/></manifest><spine><itemref idref="chapter"/></spine></package>',
      'OPS/Fonts/reader.otf': PNG,
      'OPS/Text/first.xhtml': '<h1>Readable chapter</h1><p>Text remains readable.</p><style>@font-face{src:url(../Fonts/reader.otf)}</style><img src="../Fonts/reader.otf">',
    }), 'font-obfuscation.epub')
    expect(result.text).toContain('Text remains readable.')
    expect(documentHtml(result.html).querySelector('style,img')).toBeNull()
    expect(result.html).not.toContain('reader.otf')
  })

  it('rejects content encryption falsely labelled as font obfuscation', async () => {
    await expect(open(epub({
      'META-INF/encryption.xml': '<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/><CipherData><CipherReference URI="OPS/Text/first.xhtml"/></CipherData></EncryptedData></encryption>',
    }), 'encrypted-content.epub')).rejects.toThrow(/encrypted EPUB/)
  })

  it('reports a missing chapter instead of silently omitting it', async () => {
    await expect(open(epub({ 'OPS/book.opf': '<package><manifest><item id="missing" href="missing.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="missing"/></spine></package>' }), 'broken.epub')).rejects.toThrow(/missing/i)
  })

  it('releases cover URLs when a later chapter fails', async () => {
    const create = vi.spyOn(URL, 'createObjectURL')
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    await expect(open(epub({ 'OPS/Text/second.xhtml': '<!DOCTYPE html [<!ENTITY dangerous "value">]><p>&dangerous;</p>' }), 'broken.epub')).rejects.toThrow(/entity/i)
    expect(create).toHaveBeenCalledTimes(1)
    expect(revoke).toHaveBeenCalledWith(create.mock.results[0].value)
  })
})

describe('FictionBook', () => {
  it.each(['book.fb2', 'book.fb2.zip'])('reads %s metadata, sections, notes and cover binaries', async (name) => {
    const source = name.endsWith('.zip') ? makeZip({ 'nested/book.fb2': fb2() }) : fb2()
    const result = await open(source, name)
    expect(result.title).toBe('Місцева книга')
    expect(result.author).toBe('Olena Test')
    expect(result.cover?.type).toBe('image/png')
    expect(result.outline.map((entry) => entry.title)).toEqual(['Chapter one', 'Notes'])
    const root = documentHtml(result.html)
    expect(root.querySelector('em')?.textContent).toBe('reading')
    expect(root.querySelector('a')?.getAttribute('href')).toMatch(/^#reader-anchor-/)
    expect(result.text).toContain('Footnote text')
  })

  it('rejects XML entity declarations and invalid XML', async () => {
    await expect(open('<!DOCTYPE FictionBook [<!ENTITY file SYSTEM "file:///etc/passwd">]><FictionBook>&file;</FictionBook>', 'evil.fb2')).rejects.toThrow(/entity|DTD/i)
    await expect(open('<FictionBook><body>', 'broken.fb2')).rejects.toThrow(/invalid XML/)
  })

  it('requires exactly one FB2 in a zipped book', async () => {
    await expect(open(makeZip({ 'a.fb2': fb2(), 'b.fb2': fb2() }), 'two.fb2.zip')).rejects.toThrow(/exactly one/)
  })
})

describe('DOCX', () => {
  it('converts Word structure and core properties, then strips external hyperlink destinations', async () => {
    const result = await open(docx(), 'book.docx')
    expect(result.title).toBe('Word document')
    expect(result.author).toBe('Local Author')
    expect(result.text).toContain('Local DOCX text.')
    expect(documentHtml(result.html).querySelector('strong')?.textContent).toBe('Local DOCX text.')
    expect(result.outline.map((entry) => entry.title)).toContain('Word heading')
    expect(result.html).not.toContain('untrusted.invalid')
    expect(documentHtml(result.html).querySelector('a[href]')).toBeNull()
  })

  it('rejects XML entities before handing the archive to the converter', async () => {
    await expect(open(docx({ 'word/document.xml': '<!DOCTYPE document [<!ENTITY external SYSTEM "https://untrusted.invalid">]><document>&external;</document>' }), 'evil.docx')).rejects.toThrow(/entity|DTD/i)
  })

  it('converts embedded pictures to owned blob URLs without loading linked images', async () => {
    const request = vi.spyOn(XMLHttpRequest.prototype, 'open')
    const result = await open(docx({
      'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml"><w:body><w:p><w:r><w:t>With pictures</w:t><w:pict><v:imagedata r:id="picture"/></w:pict><w:pict><v:imagedata r:id="linked"/></w:pict></w:r></w:p></w:body></w:document>',
      'word/_rels/document.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="picture" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image.png"/><Relationship Id="linked" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://untrusted.invalid/image.png" TargetMode="External"/></Relationships>',
      'word/media/image.png': PNG,
    }), 'pictures.docx')
    const root = documentHtml(result.html)
    expect(root.querySelectorAll('img')).toHaveLength(1)
    expect(root.querySelector('img')?.getAttribute('src')).toMatch(/^blob:/)
    expect(result.text).toContain('With pictures')
    expect(request).not.toHaveBeenCalled()
    expect(result.html).not.toContain('untrusted.invalid')
  })
})

describe('archive and resource safety', () => {
  it.each(['../book.fb2', '/book.fb2', 'nested/../../book.fb2', 'nested\\book.fb2', '%2e%2e/book.fb2'])('rejects unsafe archive path %s', async (path) => {
    await expect(open(makeZip({ [path]: fb2() }), 'book.fb2.zip')).rejects.toThrow(/unsafe file path/)
  })

  it('rejects duplicate archive names', async () => {
    const bytes = makeZip({ 'a.fb2': fb2(), 'b.fb2': fb2() })
    const target = strToU8('b.fb2')
    for (let index = 0; index <= bytes.length - target.length; index++) {
      if (target.every((value, offset) => bytes[index + offset] === value)) bytes[index] = 'a'.charCodeAt(0)
    }
    await expect(open(bytes, 'book.fb2.zip')).rejects.toThrow(/duplicate/)
  })

  it('rejects encrypted ZIP flags before extraction', async () => {
    const bytes = makeZip({ 'book.fb2': fb2() })
    const view = new DataView(bytes.buffer)
    view.setUint16(6, view.getUint16(6, true) | 1, true)
    for (let i = 0; i < bytes.length - 46; i++) if (view.getUint32(i, true) === 0x02014b50) view.setUint16(i + 8, view.getUint16(i + 8, true) | 1, true)
    await expect(open(bytes, 'book.fb2.zip')).rejects.toThrow(/Encrypted/)
  })

  it('rejects excessive declared expansion and actual expansion beyond a forged declaration', async () => {
    const mutateSize = (bytes: Uint8Array<ArrayBuffer>, size: number) => {
      const view = new DataView(bytes.buffer)
      view.setUint32(22, size, true)
      for (let i = 0; i < bytes.length - 46; i++) if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, size, true)
      return bytes
    }
    await expect(readArchive(mutateSize(makeZip({ 'a.txt': 'data' }), DOCUMENT_LIMITS.entryBytes + 1))).rejects.toThrow(/expands beyond/)
    await expect(readArchive(mutateSize(makeZip({ 'a.txt': 'repeated text '.repeat(1000) }), 1))).rejects.toThrow(/declared or safe size/)
  })

  it('rejects entry counts above the archive limit', async () => {
    const bytes = makeZip(Object.fromEntries(Array.from({ length: DOCUMENT_LIMITS.entries + 1 }, (_, index) => [`${index}.txt`, ''])))
    await expect(readArchive(bytes)).rejects.toThrow(/too many entries/)
  })

  it('accepts ZIP data descriptors while verifying the central-directory sizes', async () => {
    const chunks: Uint8Array[] = []
    const zip = new Zip((error, chunk) => { if (error) throw error; chunks.push(chunk) })
    const entry = new ZipPassThrough('a.txt')
    zip.add(entry)
    entry.push(strToU8('A data descriptor file'), true)
    zip.end()
    const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0))
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    expect(new TextDecoder().decode((await readArchive(bytes)).get('a.txt'))).toBe('A data descriptor file')
  })

  it('rejects damaged file contents using CRC', async () => {
    const bytes = zipSync({ 'a.txt': [strToU8('test content'), { level: 0 }] })
    bytes[30 + 'a.txt'.length] ^= 1
    await expect(readArchive(bytes)).rejects.toThrow(/integrity check/)
  })

  it('rejects oversized inputs before requesting their bytes', async () => {
    const arrayBuffer = vi.fn()
    const file = { size: DOCUMENT_LIMITS.inputBytes + 1, arrayBuffer } as unknown as Blob
    await expect(parseDocument(file, 'large.epub')).rejects.toThrow(/size limit/)
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('rejects excessively deep markup and huge embedded image dimensions', async () => {
    await expect(open('<div>'.repeat(150) + 'text' + '</div>'.repeat(150), 'deep.html')).rejects.toThrow(/too complex/)
    const giant = new Uint8Array(PNG)
    const view = new DataView(giant.buffer)
    view.setUint32(16, 100000)
    view.setUint32(20, 100000)
    const source = btoa(String.fromCharCode(...giant))
    await expect(open(`<img src="data:image/png;base64,${source}">`, 'large.html')).rejects.toThrow(/too many pixels/)
  })

  it('supports cancellation before file reads and during archive work', async () => {
    const before = new AbortController()
    before.abort()
    await expect(parseDocument(new File(['text'], 'book.txt'), 'book.txt', before.signal)).rejects.toMatchObject({ name: 'AbortError' })
    const controller = new AbortController()
    const result = readArchive(makeZip({ 'a.txt': 'first', 'b.txt': 'second' }), controller.signal)
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('reports empty, unsupported and malformed ZIP files', async () => {
    await expect(open('', 'empty.txt')).rejects.toThrow(/empty/)
    await expect(open('content', 'unknown.pdf')).rejects.toThrow(/not supported/)
    await expect(open('not a zip', 'bad.epub')).rejects.toThrow(/valid ZIP/)
  })
})


describe('opaque reader image resources', () => {
  it('exports only owned, deduplicated raster blobs matching sanitized image URLs', async () => {
    const result = await open(`<p>Illustrated book</p><img src="data:image/png;base64,${PNG_BASE64}"><img src="data:image/png;base64,${PNG_BASE64}"><img src="https://untrusted.invalid/image.png"><img src="blob:https://untrusted.invalid/forged">`, 'illustrated.html')
    const images = documentHtml(result.html).querySelectorAll('img')
    expect(images).toHaveLength(2)
    expect(result.resources).toHaveLength(1)
    const resource = result.resources![0]
    expect(resource.url).toBe(images[0].getAttribute('src'))
    expect(resource.url).toBe(images[1].getAttribute('src'))
    expect(resource.blob.type).toBe('image/png')
    expect(resource.blob.size).toBe(PNG.byteLength)
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    result.dispose(); result.dispose()
    expect(revoke.mock.calls.filter(([url]) => url === resource.url)).toHaveLength(1)
  })

  it('does not expose resources for text-only content', async () => {
    const result = await open('A simple local chapter.', 'chapter.txt')
    expect(result.resources).toEqual([])
  })
})
