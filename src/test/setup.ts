// Core
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

// Node's optional Web Storage global is not the browser storage supplied by jsdom.
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: window.localStorage })
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: window.sessionStorage })

// jsdom has no HTMLMediaElement playback engine — stub the bits the app touches
// so play()/pause() dispatch real events (driving the store's own listeners,
// just like a real browser) and readyState reflects a loaded source.
if (typeof HTMLMediaElement !== 'undefined') {
  const pausedState = new WeakMap<HTMLMediaElement, boolean>()
  const readyStateMap = new WeakMap<HTMLMediaElement, number>()

  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return pausedState.get(this) ?? true
    },
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return readyStateMap.get(this) ?? 0
    },
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value(this: HTMLMediaElement) {
      pausedState.set(this, false)
      this.dispatchEvent(new Event('play'))
      return Promise.resolve()
    },
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value(this: HTMLMediaElement) {
      pausedState.set(this, true)
      this.dispatchEvent(new Event('pause'))
    },
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    configurable: true,
    value(this: HTMLMediaElement) {
      this.currentTime = 0
      readyStateMap.set(this, 1)
    },
  })
}

// Vitest 4 exposes Node's blob URL API, which cannot consume jsdom File
// objects cloned by fake-indexeddb. No real decoder uses these URLs in jsdom.
let objectUrlId = 0
URL.createObjectURL = () => `blob:mock-${++objectUrlId}`
URL.revokeObjectURL = () => {}
