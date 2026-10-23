// Core
import { describe, expect, it, vi } from 'vitest'
// Services
import { createProgressWriter } from './progressWriter'
const location = (page: number) => ({ page, totalPages: 10, progress: (page - 1) / 9 })
describe('reading progress writes', () => {
  it('coalesces updates and serializes in-flight writes without retrying stale failures', async () => {
    let reject!: (error: Error) => void
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail })).mockResolvedValue(undefined)
    const error = vi.fn(); const writer = createProgressWriter(save, error)
    writer.update(location(2)); const first = writer.flush(); await Promise.resolve()
    writer.update(location(3)); writer.update(location(4)); const second = writer.flush()
    expect(save).toHaveBeenCalledTimes(1)
    reject(new Error('Disk unavailable')); await first; await second; await writer.flush()
    expect(save.mock.calls.map(([value]) => value.page)).toEqual([2, 4]); expect(error).toHaveBeenCalledTimes(1)
  })
  it('retries the latest failed position on an explicit flush', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Disk unavailable')).mockResolvedValue(undefined)
    const writer = createProgressWriter(save, vi.fn()); writer.update(location(7)); await writer.flush(); await writer.flush()
    expect(save.mock.calls.map(([value]) => value.page)).toEqual([7, 7])
  })
})
