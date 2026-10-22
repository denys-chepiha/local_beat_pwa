import { expect, it } from 'vitest'
import { waitFor } from '@testing-library/react'
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
