// Core
import Dexie from 'dexie'
import { waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function freshSession() {
  vi.resetModules()
  const { db } = await import('@/services/db')
  const { useVideoSession } = await import('./useVideoSession')
  await db.videoFiles.clear()
  await useVideoSession.getState().hydrate()
  return { db, useVideoSession }
}
const entry = (id: number) => ({ id, file: new File(['video'], `${id}.mp4`, { type: 'video/mp4' }) })

beforeEach(() => localStorage.clear())
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('persistent video session', () => {
  it('persists files separately from progress and restores the active playlist after reload', async () => {
    const { db, useVideoSession } = await freshSession()
    const store = useVideoSession.getState()
    await store.setEntries([entry(901)])
    store.setActiveId(901)
    store.saveProgress(901, 37, true)
    expect(await db.videoFiles.count()).toBe(1)
    useVideoSession.setState({ entries: [], loaded: false })
    await store.hydrate()
    expect(useVideoSession.getState().entries.map((e) => e.id)).toEqual([901])
    expect(useVideoSession.getState().activeId).toBe(901)
    await useVideoSession.persist.rehydrate()
    expect(useVideoSession.getState().progress[901]).toEqual({ time: 37, completed: true })
    await store.setEntries([])
    expect(await db.videoFiles.count()).toBe(0)
    expect(useVideoSession.getState().progress).toEqual({})
  })

  it('coalesces frequent progress events and flushes the latest position explicitly', async () => {
    const { useVideoSession } = await freshSession()
    const store = useVideoSession.getState()
    await store.setEntries([entry(1)])
    vi.useFakeTimers()
    const write = vi.spyOn(Storage.prototype, 'setItem')
    for (let time = 1; time <= 100; time++) store.saveProgress(1, time / 10)
    expect(write).not.toHaveBeenCalled()
    expect(useVideoSession.getState().progress[1]).toBeUndefined()
    vi.advanceTimersByTime(4000)
    expect(write).toHaveBeenCalledTimes(1)
    expect(useVideoSession.getState().progress[1].time).toBe(10)
    store.saveProgress(1, 11)
    store.flushProgress()
    expect(write).toHaveBeenCalledTimes(2)
    expect(useVideoSession.getState().progress[1].time).toBe(11)
    vi.advanceTimersByTime(4000)
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('flushes progress on selection and completion without resurrecting removed entries', async () => {
    const { useVideoSession } = await freshSession()
    const store = useVideoSession.getState()
    await store.setEntries([entry(1), entry(2)])
    store.saveProgress(1, 7)
    store.setActiveId(2)
    expect(useVideoSession.getState().progress[1].time).toBe(7)
    store.saveProgress(2, 100, true)
    store.saveProgress(2, 3)
    store.flushProgress()
    expect(useVideoSession.getState().progress[2]).toEqual({ time: 3, completed: true })
    await store.setEntries([entry(1)])
    store.saveProgress(2, 9)
    store.flushProgress()
    expect(useVideoSession.getState().progress[2]).toBeUndefined()
  })

  it('retries an unsuccessful addition when the next playlist change succeeds', async () => {
    const { db, useVideoSession } = await freshSession()
    const store = useVideoSession.getState()
    vi.spyOn(db.videoFiles, 'put').mockRejectedValueOnce(new Error('Quota exceeded'))
    await store.setEntries([entry(1)])
    expect(useVideoSession.getState().storageError).toBeTruthy()
    expect(useVideoSession.getState().entries.map((e) => e.id)).toEqual([1])
    expect(await db.videoFiles.count()).toBe(0)
    await store.setEntries((entries) => [...entries, entry(2)])
    expect(await db.videoFiles.toCollection().primaryKeys()).toEqual([1, 2])
    expect(useVideoSession.getState().storageError).toBeNull()
  })

  it('restores an unsuccessful deletion visibly and retains its progress', async () => {
    const { db, useVideoSession } = await freshSession()
    const store = useVideoSession.getState()
    await store.setEntries([entry(1)])
    store.saveProgress(1, 12, true)
    vi.spyOn(db.videoFiles, 'bulkDelete').mockRejectedValueOnce(new Error('Storage unavailable'))
    await store.setEntries([])
    expect(useVideoSession.getState().entries.map((e) => e.id)).toEqual([1])
    expect(useVideoSession.getState().storageError).toBeTruthy()
    expect(useVideoSession.getState().progress[1].time).toBe(12)
    expect(await db.videoFiles.count()).toBe(1)
    await store.setEntries([])
    expect(useVideoSession.getState().progress).toEqual({})
    expect(useVideoSession.getState().storageError).toBeNull()
  })

  it('hydrates once across concurrent and subsequent requests', async () => {
    const { db, useVideoSession } = await freshSession()
    useVideoSession.setState({ loaded: false })
    const read = vi.spyOn(db.videoFiles, 'toArray')
    await Promise.all([useVideoSession.getState().hydrate(), useVideoSession.getState().hydrate()])
    await useVideoSession.getState().hydrate()
    expect(read).toHaveBeenCalledTimes(1)
    expect(useVideoSession.getState().loaded).toBe(true)
  })

  it('restores the saved playlist order after reload and keeps unordered files last', async () => {
    const { db, useVideoSession } = await freshSession()
    await useVideoSession.getState().setEntries([entry(1), entry(2), entry(3)])
    await useVideoSession.getState().setEntries((entries) => [entries[2], entries[0], entries[1]])
    // A file stored before playlist order was saved has no position yet.
    await db.videoFiles.put(entry(4))
    vi.resetModules()
    const { useVideoSession: reloaded } = await import('./useVideoSession')
    await reloaded.getState().hydrate()
    expect(reloaded.getState().entries.map((e) => e.id)).toEqual([3, 1, 2, 4])
    expect(reloaded.getState().order).toEqual([3, 1, 2, 4])
    await reloaded.getState().setEntries([])
  })
})


it('keeps successful saves when one file fails and retries the missing file', async () => {
  const { db, useVideoSession } = await freshSession()
  await db.videoFiles.clear()
  useVideoSession.setState({ entries: [], storageError: null })
  const put = db.videoFiles.put.bind(db.videoFiles)
  let fail = true
  const spy = vi.spyOn(db.videoFiles, 'put').mockImplementation((entry) => {
    if (entry.id === 903 && fail) return Dexie.Promise.reject(new DOMException('Full', 'QuotaExceededError'))
    return put(entry)
  })
  try {
    const store = useVideoSession.getState()
    store.setEntries([902, 903].map((id) => ({ id, file: new File(['video'], `${id}.mp4`) })))
    await waitFor(() => expect(useVideoSession.getState().storageError).toContain('Device storage is full'))
    expect(await db.videoFiles.get(902)).toBeDefined()
    expect(await db.videoFiles.get(903)).toBeUndefined()
    fail = false
    await store.retrySave()
    expect(await db.videoFiles.count()).toBe(2)
    expect(useVideoSession.getState().storageError).toBeNull()
    expect(spy.mock.calls.filter(([entry]) => entry.id === 902)).toHaveLength(1)
    store.setEntries([])
    await waitFor(async () => expect(await db.videoFiles.count()).toBe(0))
  } finally { spy.mockRestore() }
})


it('serializes overlapping playlist changes and does not retain an older save error', async () => {
  const { db, useVideoSession } = await freshSession()
  const store = useVideoSession.getState()
  vi.spyOn(db.videoFiles, 'put').mockRejectedValueOnce(new Error('Temporary failure'))
  const first = store.setEntries([entry(1)])
  const second = store.setEntries((entries) => [...entries, entry(2)])
  const third = store.setEntries([entry(2)])
  await Promise.all([first, second, third])
  expect(await db.videoFiles.toCollection().primaryKeys()).toEqual([2])
  expect(useVideoSession.getState().entries.map((entry) => entry.id)).toEqual([2])
  expect(useVideoSession.getState().storageError).toBeNull()
  expect(useVideoSession.getState().saving).toBe(false)
})
