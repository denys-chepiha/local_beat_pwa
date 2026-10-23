// Core
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// Components
import HomeScreen from './HomeScreen'
// Services
import { useLibraryStore } from '@/store/useLibraryStore'
import { useUiStore } from '@/store/useUiStore'
const create = vi.fn()
const open = vi.fn()
beforeEach(() => { create.mockReset(); open.mockReset(); useLibraryStore.setState({ playlists: [], createPlaylist: create }); useUiStore.setState({ openPlaylist: open }) })
afterEach(cleanup)
it('opens a focused inline name field and creates one trimmed playlist', async () => {
  create.mockResolvedValue({ id: 'new' })
  render(<HomeScreen />)
  fireEvent.click(screen.getByRole('button', { name: 'New Playlist' }))
  const input = screen.getByRole('textbox', { name: 'Playlist name' })
  expect(input).toHaveFocus()
  expect(document.querySelector('.modal-backdrop')).toBeNull()
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  fireEvent.change(input, { target: { value: '  Summer  ' } })
  fireEvent.submit(input.closest('form')!)
  await waitFor(() => expect(open).toHaveBeenCalledWith('new'))
  expect(create).toHaveBeenCalledExactlyOnceWith('Summer')
})
it('cancels without saving and returns focus to New Playlist', () => {
  render(<HomeScreen />)
  fireEvent.click(screen.getByRole('button', { name: 'New Playlist' }))
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
  expect(screen.getByRole('button', { name: 'New Playlist' })).toHaveFocus()
  expect(create).not.toHaveBeenCalled()
})
it('retains the name after a failed save so the user can retry', async () => {
  create.mockRejectedValueOnce(new Error('storage')).mockResolvedValueOnce({ id: 'retry' })
  render(<HomeScreen />)
  fireEvent.click(screen.getByRole('button', { name: 'New Playlist' }))
  const input = screen.getByRole('textbox')
  fireEvent.change(input, { target: { value: 'Saved name' } })
  fireEvent.submit(input.closest('form')!)
  await screen.findByRole('alert')
  expect(input).toHaveValue('Saved name')
  fireEvent.submit(input.closest('form')!)
  await waitFor(() => expect(open).toHaveBeenCalledWith('retry'))
})
