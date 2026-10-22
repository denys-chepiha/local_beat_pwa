/** FNV-1a — fast, deterministic, non-cryptographic. Plenty for local dedup. */
function fnv1aHex(str: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export interface FingerprintEntry {
  relativePath: string
  size: number
  lastModified: number
}

/**
 * Identity fingerprint for an imported book: title + each chapter's path,
 * size and mtime. Used to detect re-imports of the same folder so the user
 * can choose to replace, add-as-copy, or cancel instead of silently
 * duplicating a book.
 */
export function computeAudiobookFingerprint(title: string, entries: FingerprintEntry[]): string {
  const sorted = entries.slice().sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  const raw =
    title.trim().toLowerCase() +
    '\n' +
    sorted.map((e) => `${e.relativePath}|${e.size}|${e.lastModified}`).join('\n')
  return fnv1aHex(raw)
}
