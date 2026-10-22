// Core
import { StrictMode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
// Components
import App from './App'
// Services
import { useLibraryStore } from '@/store/useLibraryStore'
import { useAudiobookStore } from '@/store/useAudiobookStore'
import { usePlayerStore } from '@/store/usePlayerStore'

afterEach(cleanup)
it('shares startup in StrictMode and waits for restored player state before showing controls', async () => {
  let finish!: () => void
  const init = vi.fn(() => new Promise<void>((resolve) => { finish = () => { usePlayerStore.setState({ initialized: true }); resolve() } }))
  const loadMusic = vi.fn(async () => { useLibraryStore.setState({ loaded: true }) })
  const loadBooks = vi.fn(async () => { useAudiobookStore.setState({ loaded: true }) })
  useLibraryStore.setState({ loaded: false, loadAll: loadMusic })
  useAudiobookStore.setState({ loaded: false, loadAll: loadBooks })
  usePlayerStore.setState({ initialized: false, init })
  render(<StrictMode><App /></StrictMode>)
  await act(async () => {})
  expect(screen.getByText('Loading your library…')).toBeInTheDocument()
  expect(loadMusic).toHaveBeenCalledTimes(1)
  expect(loadBooks).toHaveBeenCalledTimes(1)
  expect(init).toHaveBeenCalledTimes(1)
  await act(async () => finish())
  expect(screen.getByRole('button', { name: 'New Playlist' })).toBeInTheDocument()
})
