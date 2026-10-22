// Core
import { describe, expect, it } from 'vitest'
// Utils
import { formatTime } from '@/utils/format'

describe('formatTime', () => {
  it('formats sub-hour durations as m:ss', () => {
    expect(formatTime(75)).toBe('1:15')
  })

  it('formats hour-plus durations as h:mm:ss', () => {
    expect(formatTime(3661)).toBe('1:01:01')
  })
})
