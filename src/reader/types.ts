export type BookFormat = 'pdf' | 'epub' | 'fb2' | 'txt' | 'md' | 'html' | 'docx' | 'image'
export type ReadingMode = 'paged' | 'scroll'
export type ReadingTheme = 'paper' | 'sepia' | 'night'

export interface ReadingBookmark {
  id: string
  page: number
  progress: number
  label: string
}

export interface ReaderBook {
  id: string
  title: string
  author?: string
  fileName: string
  format: BookFormat
  size: number
  fingerprint: string
  addedAt: number
  lastReadAt?: number
  hasCover: boolean
  page: number
  totalPages: number
  progress: number
  bookmarks: ReadingBookmark[]
}

export interface ReaderPayload { id: string; blob: Blob }
export interface ReadingPreferences {
  mode: ReadingMode
  theme: ReadingTheme
  fontSize: number
  font: 'sans' | 'serif'
  lineHeight: number
}

export interface ReaderLocation { page: number; totalPages: number; progress: number }
export interface ReaderOutline { title: string; id: string }
export interface SearchMatch { label: string; page?: number; id?: string }

export interface ReaderViewHandle {
  goToPage: (page: number) => void
  goToProgress: (progress: number) => void
  goToOutline: (id: string) => void
  search: (query: string) => Promise<SearchMatch[]>
  goToMatch: (match: SearchMatch) => void
}
