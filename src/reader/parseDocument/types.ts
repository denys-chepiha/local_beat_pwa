export interface ParsedDocument {
  title: string
  author?: string
  html: string
  text: string
  cover?: Blob
  resources?: ReadonlyArray<{ url: string; blob: Blob }>
  outline: Array<{ title: string; id: string }>
  dispose: () => void
}

export const DOCUMENT_LIMITS = {
  inputBytes: 64 * 1024 * 1024,
  expandedBytes: 128 * 1024 * 1024,
  entryBytes: 32 * 1024 * 1024,
  entries: 3000,
  textBytes: 16 * 1024 * 1024,
  nodes: 100000,
  depth: 128,
  imageBytes: 10 * 1024 * 1024,
  images: 300,
  imageTotalBytes: 64 * 1024 * 1024,
} as const

export class DocumentParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentParseError'
  }
}
