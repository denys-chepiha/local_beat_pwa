// Types
import type { ReaderLocation } from '../types'

/** Serialize writes and never retry an older location after a newer update. */
export function createProgressWriter(save: (location: ReaderLocation) => Promise<void>, onError: () => void) {
  let generation = 0
  let pending: { generation: number; location: ReaderLocation } | undefined
  let writes = Promise.resolve()
  return {
    update(location: ReaderLocation) { pending = { generation: ++generation, location } },
    flush(): Promise<void> {
      const next = pending
      if (!next) return writes
      pending = undefined
      writes = writes.then(() => save(next.location)).catch(() => {
        if (generation === next.generation) pending ??= next
        onError()
      })
      return writes
    },
  }
}
