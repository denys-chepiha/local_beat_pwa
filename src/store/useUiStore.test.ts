import { describe, expect, it } from 'vitest'
import { useUiStore } from './useUiStore'

describe('section navigation', () => {
  it('remembers the playlist and audiobook when changing tabs and rehydrating', async () => {
    const ui = useUiStore.getState()
    ui.openPlaylist('playlist-1')
    ui.switchSection('audiobooks')
    ui.openAudiobook('book-1')
    ui.switchSection('video')
    ui.switchSection('music')
    expect(useUiStore.getState().screen).toEqual({ name: 'playlist', playlistId: 'playlist-1' })
    ui.switchSection('audiobooks')
    expect(useUiStore.getState().screen).toEqual({ name: 'audiobook', bookId: 'book-1' })
    await useUiStore.persist.rehydrate()
    expect(useUiStore.getState().screen).toEqual({ name: 'audiobook', bookId: 'book-1' })
  })
})
