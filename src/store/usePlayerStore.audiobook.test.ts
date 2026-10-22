// Core
import { afterEach, describe, expect, it, vi } from 'vitest'
// Types
import type { ImportChapterInput } from '@/store/useAudiobookStore'

function makeFile(name: string, size = 1024, type = 'audio/mpeg'): File {
  return new File([new Uint8Array(size)], name, { type })
}

function makeChapters(count: number, durationEach = 60): ImportChapterInput[] {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, '0')
    return {
      file: makeFile(`${n} - Chapter ${i + 1}.mp3`),
      title: `Chapter ${i + 1}`,
      relativePath: `Book/${n} - Chapter ${i + 1}.mp3`,
      duration: durationEach,
    }
  })
}

/**
 * Both `usePlayerStore` and its shared `HTMLAudioElement`/object-URL globals
 * live at module scope, so each test needs a genuinely fresh module graph —
 * otherwise state (and the one real `<audio>` element) would leak between
 * tests. `vi.resetModules()` + dynamic import gives every test its own
 * instances while still sharing the same fake IndexedDB backing store.
 */
async function freshModules(opts: { skipPlayerInit?: boolean; skipDbClear?: boolean } = {}) {
  vi.resetModules()
  const { db } = await import('@/services/db')
  const { useAudiobookStore } = await import('@/store/useAudiobookStore')
  const { usePlayerStore } = await import('@/store/usePlayerStore')
  // `db` is a fresh module (and Dexie connection) each call, but it points at
  // the same underlying fake-indexeddb database — clear it for test isolation
  // unless the caller is simulating a reload and wants the prior data intact.
  if (!opts.skipDbClear) {
    await db.audiobooks.clear()
    await db.audiobookChapters.clear()
    await db.audiobookBlobs.clear()
    await db.playerState.clear()
  }
  // `init()` wires up the audio element's event listeners (ended/play/pause) —
  // production code always calls it once at startup (see App.tsx), so tests
  // need it too unless they want to control its timing themselves (the
  // restore-after-reload test does exactly that).
  if (!opts.skipPlayerInit) await usePlayerStore.getState().init()
  return { db, useAudiobookStore, usePlayerStore }
}

function getAudioEl(): HTMLAudioElement {
  const el = document.querySelector('audio')
  if (!el) throw new Error('no audio element mounted')
  return el
}

/**
 * fake-indexeddb resolves its promises through its own internal async
 * scheduling, so a fixed number of `setTimeout(0)` hops after firing an
 * event or calling a fire-and-forget persistence method is a race — poll
 * instead of guessing how many ticks are needed.
 */
async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: condition never became true')
    await new Promise((r) => setTimeout(r, 5))
  }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('usePlayerStore — audiobook playback', () => {
  it('playAudiobook loads the first chapter, starts playing, and records a play session', async () => {
    const { useAudiobookStore, usePlayerStore } = await freshModules()
    const book = await useAudiobookStore.getState().importBook({
      title: 'The Hobbit',
      chapters: makeChapters(3),
      fingerprint: 'fp-1',
    })

    await usePlayerStore.getState().playAudiobook(book.id)

    const s = usePlayerStore.getState()
    expect(s.source).toBe('audiobook')
    expect(s.currentBookId).toBe(book.id)
    expect(s.currentChapterIndex).toBe(0)
    expect(s.nowPlaying?.title).toBe('Chapter 1')
    expect(s.isPlaying).toBe(true)
    expect(useAudiobookStore.getState().getBook(book.id)?.playCount).toBe(1)
  })

  it('auto-advances to the next chapter on "ended", marking the finished one completed', async () => {
    const { useAudiobookStore, usePlayerStore } = await freshModules()
    const book = await useAudiobookStore.getState().importBook({
      title: 'Multi-chapter Book',
      chapters: makeChapters(3, 60),
      fingerprint: 'fp-2',
    })
    await usePlayerStore.getState().playAudiobook(book.id)
    const firstChapterId = usePlayerStore.getState().currentChapterId

    getAudioEl().dispatchEvent(new Event('ended'))
    // handleChapterEnded is async (awaits Dexie writes) — wait for it to land.
    await waitFor(() => usePlayerStore.getState().currentChapterIndex === 1)

    const s = usePlayerStore.getState()
    expect(s.currentChapterIndex).toBe(1)
    expect(s.currentChapterId).not.toBe(firstChapterId)
    expect(s.isPlaying).toBe(true)

    const chapters = useAudiobookStore.getState().getChapters(book.id)
    expect(chapters[0].completed).toBe(true)
    const book2 = useAudiobookStore.getState().getBook(book.id)!
    expect(book2.status).toBe('in_progress')
  })

  it('marks the book completed when the last chapter ends, without wrapping around', async () => {
    const { useAudiobookStore, usePlayerStore } = await freshModules()
    const book = await useAudiobookStore.getState().importBook({
      title: 'Short Book',
      chapters: makeChapters(2, 30),
      fingerprint: 'fp-3',
    })
    await usePlayerStore.getState().playAudiobook(book.id)
    getAudioEl().dispatchEvent(new Event('ended')) // chapter 1 -> 2
    await waitFor(() => usePlayerStore.getState().currentChapterIndex === 1)

    getAudioEl().dispatchEvent(new Event('ended')) // chapter 2 ends -> book completed
    await waitFor(() => useAudiobookStore.getState().getBook(book.id)?.status === 'completed')

    const s = usePlayerStore.getState()
    expect(s.isPlaying).toBe(false)
    expect(s.currentChapterIndex).toBe(1) // did not wrap back to chapter 1

    const finished = useAudiobookStore.getState().getBook(book.id)!
    expect(finished.status).toBe('completed')
    expect(finished.progressPercent).toBe(100)
    expect(finished.completedAt).toBeTruthy()
  })

  it('playChapter jumps straight to the requested chapter', async () => {
    const { useAudiobookStore, usePlayerStore } = await freshModules()
    const book = await useAudiobookStore.getState().importBook({
      title: 'Jump Book',
      chapters: makeChapters(3),
      fingerprint: 'fp-4',
    })
    const chapters = useAudiobookStore.getState().getChapters(book.id)

    await usePlayerStore.getState().playChapter(book.id, chapters[2].id)

    const s = usePlayerStore.getState()
    expect(s.currentChapterIndex).toBe(2)
    expect(s.currentChapterId).toBe(chapters[2].id)
  })

  it('manual next()/previous() do not trigger book completion', async () => {
    const { useAudiobookStore, usePlayerStore } = await freshModules()
    const book = await useAudiobookStore.getState().importBook({
      title: 'Nav Book',
      chapters: makeChapters(3),
      fingerprint: 'fp-5',
    })
    await usePlayerStore.getState().playAudiobook(book.id)
    await usePlayerStore.getState().next()
    expect(usePlayerStore.getState().currentChapterIndex).toBe(1)
    await usePlayerStore.getState().previous()
    // previous() restarts the current chapter if >3s in; at 0s it steps back.
    expect(usePlayerStore.getState().currentChapterIndex).toBe(0)
    expect(useAudiobookStore.getState().getBook(book.id)?.status).not.toBe('completed')
  })

  it('seek() immediately persists the chapter position (no throttle wait needed)', async () => {
    const { useAudiobookStore, usePlayerStore } = await freshModules()
    const book = await useAudiobookStore.getState().importBook({
      title: 'Seek Book',
      chapters: makeChapters(1, 120),
      fingerprint: 'fp-6',
    })
    await usePlayerStore.getState().playAudiobook(book.id)
    usePlayerStore.getState().seek(45)
    await waitFor(() => useAudiobookStore.getState().getBook(book.id)?.currentTime === 45)

    const updated = useAudiobookStore.getState().getBook(book.id)!
    expect(updated.currentTime).toBe(45)
  })

  it('restores the last audiobook session (chapter + position) after a simulated reload', async () => {
    const session1 = await freshModules()
    const book = await session1.useAudiobookStore.getState().importBook({
      title: 'Resume Book',
      chapters: makeChapters(3, 100),
      fingerprint: 'fp-7',
    })
    const chapters = session1.useAudiobookStore.getState().getChapters(book.id)
    await session1.usePlayerStore.getState().playChapter(book.id, chapters[1].id)
    session1.usePlayerStore.getState().seek(40)
    await waitFor(() => session1.useAudiobookStore.getState().getBook(book.id)?.currentTime === 40)
    // The book/chapter pointer is persisted separately (fire-and-forget) — wait
    // for that write to land too before simulating the reload.
    await waitFor(async () => (await session1.db.playerState.get('player'))?.currentBookId === book.id)

    // Simulate the app fully reloading: fresh modules, same underlying IDB.
    // Mirrors App.tsx's real sequencing — load the library, then init the
    // player so it can resolve the saved book/chapter pointer.
    const session2 = await freshModules({ skipPlayerInit: true, skipDbClear: true })
    await session2.useAudiobookStore.getState().loadAll()
    await session2.usePlayerStore.getState().init()

    const s = session2.usePlayerStore.getState()
    expect(s.canResume).toBe(true)
    expect(s.source).toBe('audiobook')
    expect(s.currentBookId).toBe(book.id)
    expect(s.currentChapterId).toBe(chapters[1].id)
    expect(s.currentTime).toBe(40)
  })

  it('handleBookRemoved clears the now-playing state when that book is active', async () => {
    const { useAudiobookStore, usePlayerStore } = await freshModules()
    const book = await useAudiobookStore.getState().importBook({
      title: 'Removable Book',
      chapters: makeChapters(1),
      fingerprint: 'fp-8',
    })
    await usePlayerStore.getState().playAudiobook(book.id)
    expect(usePlayerStore.getState().nowPlaying).not.toBeNull()

    usePlayerStore.getState().handleBookRemoved(book.id)

    const s = usePlayerStore.getState()
    expect(s.nowPlaying).toBeNull()
    expect(s.currentBookId).toBeNull()
    expect(s.isPlaying).toBe(false)
  })
})
