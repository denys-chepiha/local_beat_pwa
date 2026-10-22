import { expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import Dexie from 'dexie'
import { db } from '@/services/db'
import { useVideoSession } from './useVideoSession'

it('persists files separately from progress and restores the active playlist after reload', async () => {
  await db.videoFiles.clear()
  const store = useVideoSession.getState()
  store.setEntries([{ id: 901, file: new File(['video'], 'saved.mp4', { type: 'video/mp4' }) }])
  store.setActiveId(901)
  store.saveProgress(901, 37, true)
  await waitFor(async () => expect(await db.videoFiles.count()).toBe(1))
  useVideoSession.setState({ entries: [] })
  await store.hydrate()
  expect(useVideoSession.getState().entries.map((e) => e.id)).toEqual([901])
  expect(useVideoSession.getState().activeId).toBe(901)
  await useVideoSession.persist.rehydrate()
  expect(useVideoSession.getState().progress[901]).toEqual({ time: 37, completed: true })
  store.setEntries([])
  await waitFor(async () => expect(await db.videoFiles.count()).toBe(0))
})


it('keeps successful saves when one file fails and retries the missing file', async () => {
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
