// Core
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Components
import AudiobookImportWizard from '@/components/AudiobookImportWizard'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('audiobook import duration reads', () => {
  it.each(['Close', 'Cancel', 'unmount'])('releases the active decoder and skips later files on %s', async (exit) => {
    const create = vi.spyOn(document, 'createElement')
    const createUrl = vi.spyOn(URL, 'createObjectURL')
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL')
    const onClose = vi.fn()
    const view = render(<AudiobookImportWizard onClose={onClose} />)
    const input = view.container.querySelector<HTMLInputElement>('input[accept^="audio/"]')!

    fireEvent.change(input, {
      target: { files: [new File(['audio'], '01.mp3'), new File(['audio'], '02.mp3')] },
    })
    const audio = create.mock.results.find((result) =>
      result.value instanceof HTMLAudioElement && result.value.hasAttribute('src'),
    )!.value as HTMLAudioElement
    const url = audio.src
    expect(createUrl).toHaveBeenCalledTimes(1)

    await act(async () => {
      if (exit === 'unmount') view.unmount()
      else fireEvent.click(screen.getByRole('button', { name: exit }))
    })

    expect(onClose).toHaveBeenCalledTimes(exit === 'unmount' ? 0 : 1)
    expect(audio.onloadedmetadata).toBeNull()
    expect(audio.onerror).toBeNull()
    expect(audio.hasAttribute('src')).toBe(false)
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith(url)
    expect(createUrl).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
