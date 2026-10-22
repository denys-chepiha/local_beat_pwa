// Core
import { describe, expect, it } from 'vitest'
// Utils
import { comparePaths, naturalCompare, sortByPath } from '@/utils/naturalSort'

describe('naturalCompare', () => {
  it('orders numbers numerically, not lexically', () => {
    const names = ['10.mp3', '2.mp3', '1.mp3']
    expect(names.slice().sort(naturalCompare)).toEqual(['1.mp3', '2.mp3', '10.mp3'])
  })

  it('orders zero-padded numbers correctly too', () => {
    const names = ['09 - Chapter Nine.mp3', '10 - Chapter Ten.mp3', '01 - Chapter One.mp3']
    expect(names.slice().sort(naturalCompare)).toEqual([
      '01 - Chapter One.mp3',
      '09 - Chapter Nine.mp3',
      '10 - Chapter Ten.mp3',
    ])
  })
})

describe('comparePaths / sortByPath', () => {
  it('sorts by folder first, then naturally by filename', () => {
    const paths = [
      'Book/Part 2/02.mp3',
      'Book/Part 1/10.mp3',
      'Book/Part 1/2.mp3',
      'Book/Part 1/1.mp3',
    ]
    const sorted = sortByPath(paths, (p) => p)
    expect(sorted).toEqual([
      'Book/Part 1/1.mp3',
      'Book/Part 1/2.mp3',
      'Book/Part 1/10.mp3',
      'Book/Part 2/02.mp3',
    ])
  })

  it('treats flat (no-folder) file lists as a natural sort by name', () => {
    const paths = ['1.mp3', '10.mp3', '2.mp3']
    expect(sortByPath(paths, (p) => p)).toEqual(['1.mp3', '2.mp3', '10.mp3'])
  })

  it('comparePaths is a valid comparator (zero on equal paths)', () => {
    expect(comparePaths('a/b.mp3', 'a/b.mp3')).toBe(0)
  })
})
