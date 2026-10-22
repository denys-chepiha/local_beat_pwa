const SUPPORTED_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'oga', 'opus']
const METADATA_TIMEOUT_MS = 8000

export interface ExtractedMeta {
  title: string
  artist: string
  album: string
  duration: number
  cover?: Blob
}

/** Best-effort check that a File is a playable audio file. */
export function isAudioFile(file: File): boolean {
  if (file.type && file.type.startsWith('audio/')) return true
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return SUPPORTED_EXTENSIONS.includes(ext)
}

/** File name without its extension — used as a title fallback. */
export function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

/** Read the audio duration via a throwaway HTMLAudioElement. */
export function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio')
    let url: string | undefined
    let settled = false
    const finish = (duration: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      audio.onloadedmetadata = null
      audio.onerror = null
      if (url) URL.revokeObjectURL(url)
      audio.removeAttribute('src')
      resolve(duration)
      // Release the media resource even when a mobile decoder has stalled.
      audio.load()
    }
    // Metadata is optional: mobile browsers/providers may never emit either
    // event, and that must not prevent the file from being saved.
    const timer = setTimeout(() => finish(0), METADATA_TIMEOUT_MS)
    try {
      url = URL.createObjectURL(file)
      audio.preload = 'metadata'
      audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : 0)
      audio.onerror = () => finish(0)
      audio.src = url
      audio.load()
    } catch {
      finish(0)
    }
  })
}

/**
 * Recover Cyrillic text from mis-decoded ID3 tags.
 *
 * Many Russian/Ukrainian MP3s store text frames marked as ISO-8859-1
 * (ID3 encoding byte 0) while the bytes are really Windows-1251. jsmediatags
 * decodes them as Latin-1, so every Cyrillic byte ends up as a stray
 * character in the 0x80–0xFF range (mojibake). We detect that case — every
 * code unit fits in a single byte and at least two are high Latin-1 — repack
 * the chars back into bytes and decode them as Windows-1251. Strings that are
 * already valid Unicode (code units > 0xFF, i.e. proper UTF-8/UTF-16 frames)
 * or pure ASCII are left untouched.
 */
function fixCyrillic(value: string): string {
  let highBytes = 0
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code > 0xff) return value // genuine Unicode — already correct
    if (code >= 0x80) highBytes++
  }
  if (highBytes < 2) return value // pure ASCII or a stray accent — leave it
  try {
    const bytes = new Uint8Array(value.length)
    for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i)
    const decoded = new TextDecoder('windows-1251').decode(bytes)
    // Only accept the re-decode if it actually yielded Cyrillic letters.
    return /[Ѐ-ӿ]/.test(decoded) ? decoded : value
  } catch {
    return value
  }
}

/** Trim a tag value and run Cyrillic recovery, returning undefined when empty. */
function cleanTag(value?: string): string | undefined {
  if (typeof value !== 'string' || !value) return undefined
  const fixed = fixCyrillic(value).trim()
  return fixed || undefined
}

/** Read ID3 / tag metadata (title, artist, album, cover art). */
async function readTags(file: File): Promise<Partial<ExtractedMeta>> {
  const { default: jsmediatags } = await import('jsmediatags')
  return new Promise((resolve) => {
    let settled = false
    const finish = (tags: Partial<ExtractedMeta>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(tags)
    }
    const timer = setTimeout(() => finish({}), METADATA_TIMEOUT_MS)
    try {
      jsmediatags.read(file, {
        onSuccess: ({ tags }) => {
          if (settled) return
          try {
            let cover: Blob | undefined
            if (tags.picture) {
              const { data, format } = tags.picture
              cover = new Blob([new Uint8Array(data)], { type: format || 'image/jpeg' })
            }
            finish({
              title: cleanTag(tags.title),
              artist: cleanTag(tags.artist),
              album: cleanTag(tags.album),
              cover,
            })
          } catch {
            finish({})
          }
        },
        onError: () => finish({}),
      })
    } catch {
      finish({})
    }
  })
}

/** Combine tag + duration metadata with sensible fallbacks. */
export async function extractMetadata(file: File): Promise<ExtractedMeta> {
  const [duration, tags] = await Promise.all([readAudioDuration(file), readTags(file)])
  return {
    title: tags.title || baseName(file.name),
    artist: tags.artist || 'Unknown Artist',
    album: tags.album || '',
    duration,
    cover: tags.cover,
  }
}
