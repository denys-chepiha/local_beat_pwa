import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PlaylistScreen from '@/screens/PlaylistScreen'
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore } from '@/store/useUiStore'

beforeEach(() => {
  useLibraryStore.setState({
    ...useLibraryStore.getInitialState(),
    playlists: [{ id: 'playlist', name: 'Music', trackIds: [], createdAt: 0, updatedAt: 0 }],
  }, true)
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
  useUiStore.setState({ showToast: vi.fn() })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('playlist file picker', () => {
  it('opens the Android picker without filtering out generically typed audio', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14) Chrome/128 Mobile')
    const addFiles = vi.fn(async () => ({ added: 1, skipped: [] }))
    useLibraryStore.setState({ addFiles })
    const { container } = render(<PlaylistScreen playlistId="playlist" />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toHaveAttribute('accept')
    const click = vi.spyOn(input, 'click')
    fireEvent.click(screen.getByRole('button', { name: 'Add music' }))
    expect(click).toHaveBeenCalledOnce()

    const file = new File(['audio'], 'song.mp3', { type: 'application/octet-stream' })
    await userEvent.upload(input, file)
    expect(addFiles).toHaveBeenCalledWith('playlist', [file])
    await waitFor(() => expect(useUiStore.getState().showToast).toHaveBeenCalledWith('Added 1 track'))
  })

  it('shows an import error and allows selecting the same file again', async () => {
    const addFiles = vi.fn()
      .mockRejectedValueOnce(new Error('Storage full'))
      .mockResolvedValueOnce({ added: 1, skipped: [] })
    useLibraryStore.setState({ addFiles })
    const { container } = render(<PlaylistScreen playlistId="playlist" />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['audio'], 'song.mp3', { type: 'audio/mpeg' })
    const user = userEvent.setup()
    await user.upload(input, file)
    await waitFor(() => expect(useUiStore.getState().showToast).toHaveBeenCalledWith(
      'Could not save audio files. Check available storage and try again.',
    ))
    expect(input.value).toBe('')

    await user.upload(input, file)
    await waitFor(() => expect(addFiles).toHaveBeenCalledTimes(2))
    expect(useUiStore.getState().showToast).toHaveBeenLastCalledWith('Added 1 track')
  })
})
