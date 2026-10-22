const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Natural, numeric-aware string comparison: "2" < "10", not the other way round. */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b)
}

/**
 * Compare two relative paths segment by segment so files group by folder
 * first, then sort naturally by name within a folder.
 */
export function comparePaths(a: string, b: string): number {
  const segA = a.split('/')
  const segB = b.split('/')
  const len = Math.max(segA.length, segB.length)
  for (let i = 0; i < len; i++) {
    const cmp = collator.compare(segA[i] ?? '', segB[i] ?? '')
    if (cmp !== 0) return cmp
  }
  return 0
}

/** Sort items by a derived relative-path string, folder-then-name, naturally. */
export function sortByPath<T>(items: readonly T[], getPath: (item: T) => string): T[] {
  return items.slice().sort((a, b) => comparePaths(getPath(a), getPath(b)))
}
