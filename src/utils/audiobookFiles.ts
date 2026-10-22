// Utils
import { isAudioFile, baseName } from '@/utils/audioFile'
import { comparePaths } from '@/utils/naturalSort'

const COVER_NAME_HINTS = ['cover', 'folder', 'poster', 'front', 'artwork']
const COVER_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']

const EXTENSION_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
}

function extOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

/** Dotfiles, resource forks and common OS junk that folder pickers surface. */
export function isHiddenOrSystemFile(fileName: string): boolean {
  const name = fileName.split('/').pop() ?? fileName
  if (name.startsWith('.')) return true
  if (name === 'Thumbs.db' || name === 'desktop.ini') return true
  return false
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return COVER_EXTENSIONS.includes(extOf(file.name))
}

let probeEl: HTMLAudioElement | null = null
function getProbe(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null
  if (!probeEl) probeEl = document.createElement('audio')
  return probeEl
}

/** Whether `canPlayType` is meaningfully implemented in this environment. */
function canPlayTypeIsReliable(probe: HTMLAudioElement): boolean {
  // mp3 is near-universally supported; if even this reports nothing, canPlayType
  // isn't wired up here (e.g. some headless/test environments) — don't trust it.
  try {
    return probe.canPlayType('audio/mpeg') !== ''
  } catch {
    return false
  }
}

/**
 * Best-effort "can this device actually play this file" check. Extension/MIME
 * alone can't tell you a browser lacks a codec (e.g. Safari + FLAC), so when
 * `HTMLAudioElement.canPlayType` is available we defer to it; otherwise we
 * fall back to the same extension/MIME heuristic the music importer uses.
 */
export function isSupportedAudioFile(file: File): boolean {
  if (!isAudioFile(file)) return false
  const probe = getProbe()
  if (!probe || !canPlayTypeIsReliable(probe)) return true
  const mime = file.type || EXTENSION_MIME[extOf(file.name)] || ''
  if (!mime) return true
  return probe.canPlayType(mime) !== ''
}

function scoreCoverCandidate(fileName: string): number {
  const base = baseName(fileName.split('/').pop() ?? fileName).toLowerCase()
  const idx = COVER_NAME_HINTS.findIndex((hint) => base.includes(hint))
  return idx === -1 ? 0 : COVER_NAME_HINTS.length - idx
}

/** Rank cover candidates best-first (filename hints like "cover" > "folder" > ...). */
export function rankCoverCandidates(files: File[]): File[] {
  return files
    .map((f) => ({ f, score: scoreCoverCandidate(f.name) }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.f)
}

export interface ImportFileEntry {
  file: File
  relativePath: string
}

export interface ChapterCandidate {
  file: File
  relativePath: string
  title: string
}

export interface ImportCandidate {
  suggestedTitle: string
  chapters: ChapterCandidate[]
  coverCandidates: File[]
  skipped: { name: string; reason: string }[]
}

function relativePathOf(file: File): string {
  const withPath = file as File & { webkitRelativePath?: string }
  return withPath.webkitRelativePath || file.name
}

function deriveFolderName(entries: ImportFileEntry[]): string | undefined {
  const withFolder = entries.find((e) => e.relativePath.includes('/'))
  if (!withFolder) return undefined
  return withFolder.relativePath.split('/')[0]
}

/**
 * Classify a flat FileList (from a folder picker or a multi-file fallback
 * picker) into sorted chapters + cover candidates + skipped junk.
 */
export function buildImportCandidate(files: File[], manualTitle?: string): ImportCandidate {
  const visible = files.filter((f) => !isHiddenOrSystemFile(relativePathOf(f)))
  const entries: ImportFileEntry[] = visible.map((f) => ({ file: f, relativePath: relativePathOf(f) }))

  const audioEntries = entries.filter((e) => isSupportedAudioFile(e.file))
  const imageEntries = entries.filter((e) => isImageFile(e.file))
  const classified = new Set([...audioEntries, ...imageEntries])
  const skipped = entries
    .filter((e) => !classified.has(e))
    .map((e) => ({ name: e.relativePath, reason: 'Unsupported file type' }))

  const sortedAudio = audioEntries
    .slice()
    .sort((a, b) => comparePaths(a.relativePath, b.relativePath))

  const suggestedTitle = manualTitle?.trim() || deriveFolderName(entries) || 'Untitled Audiobook'

  return {
    suggestedTitle,
    chapters: sortedAudio.map((e) => ({
      file: e.file,
      relativePath: e.relativePath,
      title: baseName(e.file.name),
    })),
    coverCandidates: rankCoverCandidates(imageEntries.map((e) => e.file)),
    skipped,
  }
}

/** Feature detection for the `webkitdirectory` folder picker. */
export function supportsDirectoryPicker(): boolean {
  if (typeof document === 'undefined') return false
  const input = document.createElement('input')
  return 'webkitdirectory' in input
}
