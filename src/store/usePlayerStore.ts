// Core
import { create } from 'zustand'
// Services
import { db } from '@/services/db'
// Store
import { useLibraryStore } from '@/store/useLibraryStore'
import { useAudiobookStore } from '@/store/useAudiobookStore'
// Types
import type { Audiobook, AudiobookChapter, PlaybackSource, PlayerState, RepeatMode, Track } from '@/types'
// Utils
import { buildShuffledQueue } from '@/utils/shuffle'

/** Single shared HTMLAudioElement — the most reliable option on iOS Safari.
 * Both music tracks and audiobook chapters play through this one element;
 * there is never a second, competing audio element. */
let audio: HTMLAudioElement | null = null
let initialization: Promise<void> | null = null
/** Object URL for whatever is currently loaded (track or chapter audio). */
let currentObjectUrl: string | null = null
/** Object URL for the current *music track's* embedded cover art. */
let currentCoverUrl: string | null = null
/** Cached object URL for the current *audiobook's* cover — kept across
 * chapter changes within the same book so we don't re-decode the cover image
 * on every chapter switch, only revoked when the active book changes. */
let currentBookCoverBookId: string | null = null
let currentBookCoverUrl: string | null = null

let musicSaveTimer: ReturnType<typeof setTimeout> | null = null
let audiobookSaveTimer: ReturnType<typeof setTimeout> | null = null
let listeningAccumSeconds = 0
let lastListeningTickAt = Date.now()

const CONTINUE_REWIND_SECONDS = 3
const CONTINUE_REWIND_MIN_POSITION = 8

/**
 * Whether the user *wants* audio to be playing. Set true on a successful
 * `play()`, false only on an explicit user pause/stop. Used to tell an
 * iOS-initiated background suspension apart from a real user pause, and to
 * auto-resume when the app returns to the foreground.
 */
let intendedToPlay = false
let loadGeneration = 0
let cancelPendingSeek: (() => void) | null = null

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio()
    // iOS background-audio hardening: a DOM-connected element with these
    // attributes survives lock-screen / app-switch far more reliably than a
    // detached `new Audio()`.
    audio.preload = 'auto'
    audio.setAttribute('playsinline', '')
    audio.setAttribute('webkit-playsinline', '')
    audio.setAttribute('x-webkit-airplay', 'allow')
    if (typeof document !== 'undefined' && document.body) {
      audio.style.display = 'none'
      document.body.appendChild(audio)
    }
  }
  return audio
}

/** Keep music in the playback category when WebKit suspends/reactivates output. */
function activatePlaybackSession() {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (!session) return
  try {
    session.type = 'playback'
  } catch {
    // Experimental API: ordinary media playback must still work without it.
  }
}

function resetBookCoverCache() {
  if (currentBookCoverUrl) URL.revokeObjectURL(currentBookCoverUrl)
  currentBookCoverUrl = null
  currentBookCoverBookId = null
}

interface NowPlayingMeta {
  title: string
  subtitle: string
  label: string
  kind: PlaybackSource
  chapterPosition?: { index: number; count: number }
}

interface PlayerStore {
  initialized: boolean
  source: PlaybackSource
  isPlaying: boolean
  isLoading: boolean
  playbackError: string | null
  currentTime: number
  duration: number
  volume: number
  coverUrl: string | null
  nowPlaying: NowPlayingMeta | null
  /** True when a prior session was restored but nothing has been played yet. */
  canResume: boolean

  // -- music session --
  currentTrackId: string | null
  currentPlaylistId: string | null
  musicQueue: string[]
  musicQueueIndex: number
  musicCurrentTime: number
  shuffleEnabled: boolean
  repeatMode: RepeatMode

  // -- audiobook session --
  currentBookId: string | null
  currentChapterId: string | null
  currentChapterIndex: number
  bookQueue: string[]
  bookQueueIndex: number

  restoreSource: (source: PlaybackSource) => Promise<void>
  init: () => Promise<void>
  playPlaylist: (playlistId: string, startTrackId?: string) => Promise<void>
  playRandom: (trackIds: string[], playlistId?: string | null) => Promise<void>
  playAudiobook: (bookId: string, opts?: { chapterId?: string; fromBeginning?: boolean }) => Promise<void>
  playChapter: (bookId: string, chapterId: string) => Promise<void>
  togglePlay: () => Promise<void>
  next: () => Promise<void>
  previous: () => Promise<void>
  previousTrack: () => Promise<void>
  seek: (time: number) => void
  setVolume: (volume: number) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  pause: () => void
  syncMusicQueue: () => void
  stop: () => void
  resume: () => Promise<void>
  handleTrackRemoved: (trackId: string) => void
  handleTracksRemoved: (trackIds: string[]) => void
  handleBookRemoved: (bookId: string) => void
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  /** Persist the durable slice of player state to IndexedDB. Safe to call
   * regardless of which source is active — music and audiobook fields are
   * independent, so this never clobbers the "other" session's data. */
  const persistPlayerState = () => {
    const s = get()
    const state: PlayerState = {
      id: 'player',
      source: s.source,
      volume: s.volume,
      shuffleEnabled: s.shuffleEnabled,
      repeatMode: s.repeatMode,
      currentPlaylistId: s.currentPlaylistId,
      currentTrackId: s.currentTrackId,
      currentTime: s.source === 'music' ? s.currentTime : s.musicCurrentTime,
      queue: s.musicQueue,
      queueIndex: s.musicQueueIndex,
      currentBookId: s.currentBookId,
    }
    void db.playerState.put(state).catch(() => set({ playbackError: 'Could not save playback position. Check available storage.' }))
  }

  const persistThrottled = () => {
    if (musicSaveTimer) return
    musicSaveTimer = setTimeout(() => {
      musicSaveTimer = null
      persistPlayerState()
    }, 4000)
  }

  /** Save the current chapter's position (+ accumulated listening time) to
   * the Audiobook record — the single source of truth for resuming a book. */
  const flushAudiobookProgress = () => {
    const s = get()
    if (s.source !== 'audiobook' || !s.currentBookId || !s.currentChapterId) return
    void useAudiobookStore
      .getState()
      .saveChapterProgress(s.currentBookId, s.currentChapterId, { position: s.currentTime }).catch(() => set({ playbackError: 'Could not save audiobook progress. Check available storage.' }))
    if (listeningAccumSeconds > 0) {
      void useAudiobookStore.getState().addListeningTime(s.currentBookId, listeningAccumSeconds).catch(() => set({ playbackError: 'Could not save listening time.' }))
      listeningAccumSeconds = 0
    }
  }

  const flushAudiobookProgressNow = () => {
    if (audiobookSaveTimer) {
      clearTimeout(audiobookSaveTimer)
      audiobookSaveTimer = null
    }
    flushAudiobookProgress()
  }

  const tickAudiobookProgress = () => {
    const now = Date.now()
    const elapsed = (now - lastListeningTickAt) / 1000
    lastListeningTickAt = now
    if (get().isPlaying && elapsed > 0 && elapsed < 2) listeningAccumSeconds += elapsed
    if (audiobookSaveTimer) return
    audiobookSaveTimer = setTimeout(() => {
      audiobookSaveTimer = null
      flushAudiobookProgress()
    }, 5000)
  }

  /**
   * Register lock-screen / Now Playing transport handlers.
   *
   * iOS only shows three transport slots. For music we null the seek
   * handlers so previous/next track buttons take priority (the user can
   * still scrub via the timeline thanks to `seekto` + `setPositionState`).
   * For audiobooks, skipping ±30s within a chapter is far more valuable on
   * the lock screen than chapter skip, so we register seek handlers there
   * instead — iOS then shows skip buttons in place of prev/next, and chapter
   * navigation remains available inside the app.
   *
   * iOS recomputes the visible controls when metadata is published, and can
   * forget handlers registered only once at startup — so this is called both
   * on init and after every metadata update.
   */
  const registerMediaSessionHandlers = () => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const setAction = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try { ms.setActionHandler(action, handler) } catch { /* Older Safari may not support every action. */ }
    }
    setAction('play', () => { void playAudio() })
    setAction('pause', () => get().pause())
    setAction('previoustrack', () => void get().previous())
    setAction('nexttrack', () => void get().next())
    setAction('seekto', (d) => {
      if (typeof d.seekTime === 'number') get().seek(d.seekTime)
    })
    if (get().source === 'audiobook') {
      setAction('seekforward', (d) => get().seek(get().currentTime + (d.seekOffset || 30)))
      setAction('seekbackward', (d) => get().seek(get().currentTime - (d.seekOffset || 30)))
    } else {
      setAction('seekforward', null)
      setAction('seekbackward', null)
    }
  }

  const fallbackArtwork = [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  ]

  const setMusicMediaSession = (track: Track | undefined) => {
    if (!('mediaSession' in navigator) || !track) return
    const artwork = currentCoverUrl
      ? [{ src: currentCoverUrl, sizes: '512x512', type: 'image/jpeg' }]
      : fallbackArtwork
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork,
    })
    registerMediaSessionHandlers()
  }

  const setAudiobookMediaSession = (
    chapter: AudiobookChapter,
    book: Audiobook | undefined,
    coverUrl: string | null,
  ) => {
    if (!('mediaSession' in navigator)) return
    const artwork = coverUrl ? [{ src: coverUrl, sizes: '512x512', type: 'image/jpeg' }] : fallbackArtwork
    navigator.mediaSession.metadata = new MediaMetadata({
      title: chapter.title,
      artist: book?.author || book?.title || 'Audiobook',
      album: book?.title || '',
      artwork,
    })
    registerMediaSessionHandlers()
  }

  const refreshAudioMediaSession = () => {
    const session = get()
    if (session.source === 'music' && session.currentTrackId) {
      setMusicMediaSession(useLibraryStore.getState().getTrack(session.currentTrackId))
    } else if (session.source === 'audiobook' && session.currentBookId && session.currentChapterId) {
      const books = useAudiobookStore.getState()
      const chapter = books.getChapters(session.currentBookId).find((item) => item.id === session.currentChapterId)
      if (chapter) setAudiobookMediaSession(chapter, books.getBook(session.currentBookId), session.coverUrl)
    }
    registerMediaSessionHandlers()
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = getAudio().paused ? 'paused' : 'playing'
    updatePositionState()
  }

  // A remote Play is an idempotent command, not a UI toggle. Invoke play()
  // synchronously before changing Media Session state/handlers: the command's
  // playback authorization belongs to this callback, including after interruption.
  const playAudio = async () => {
    const a = getAudio()
    const session = get()
    if (session.isLoading) return
    if (session.source === 'music' ? !session.currentTrackId : !session.currentBookId) return
    if (!a.src) {
      await get().resume()
      return
    }
    const generation = loadGeneration
    set({ playbackError: null })
    try {
      activatePlaybackSession()
      await a.play()
      if (generation !== loadGeneration) return
      refreshAudioMediaSession()
    } catch (error) {
      if (generation !== loadGeneration) return
      intendedToPlay = false
      set({ isPlaying: false, playbackError: 'Audio could not resume. Open Local Beat and press Play again.' })
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
      console.warn('[player] audio resume rejected', error)
    }
  }

  const updatePositionState = () => {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return
    const a = getAudio()
    if (!Number.isFinite(a.duration) || a.duration <= 0) return
    try {
      navigator.mediaSession.setPositionState({
        duration: a.duration,
        position: Math.min(a.currentTime, a.duration),
        playbackRate: a.playbackRate || 1,
      })
    } catch {
      /* setPositionState can throw on some iOS versions — ignore. */
    }
  }

  const beginLoad = () => {
    const generation = ++loadGeneration
    cancelPendingSeek?.()
    cancelPendingSeek = null
    // Keep the current media session alive while IndexedDB reads the next file.
    // Replacing src/load below performs the actual transition synchronously.
    set({ isLoading: true, playbackError: null })
    return generation
  }

  const restorePosition = (position: number, generation: number) => {
    // A newly loaded source already starts at zero. Do not introduce a seek
    // during decoder startup unless there is a real saved position to restore.
    if (!Number.isFinite(position) || position <= 0) return
    const a = getAudio()
    const apply = () => {
      if (generation !== loadGeneration) return
      const limit = Number.isFinite(a.duration) ? a.duration : position
      a.currentTime = Math.max(0, Math.min(position, limit))
      set({ currentTime: a.currentTime, ...(get().source === 'music' ? { musicCurrentTime: a.currentTime } : {}) })
      updatePositionState()
    }
    if (a.readyState >= 1) apply()
    else {
      a.addEventListener('loadedmetadata', apply, { once: true })
      cancelPendingSeek = () => a.removeEventListener('loadedmetadata', apply)
    }
  }

  const failLoad = (generation: number) => {
    if (generation !== loadGeneration) return
    intendedToPlay = false
    getAudio().pause()
    set({ isLoading: false, isPlaying: false, playbackError: 'Could not open this audio file. Try selecting it again.' })
  }

  /** Load a music track's blob into the audio element. Plays when `autoplay`. */
  const loadMusicItem = async (trackId: string, autoplay: boolean, startAt = 0) => {
    const generation = beginLoad()
    const lib = useLibraryStore.getState()
    const track = lib.getTrack(trackId)
    if (!track) { failLoad(generation); return }
    const blobRecord = await lib.getBlob(trackId).catch(() => undefined)
    if (generation !== loadGeneration) return
    if (!blobRecord) { failLoad(generation); return }

    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
    if (currentCoverUrl) URL.revokeObjectURL(currentCoverUrl)
    resetBookCoverCache()
    currentObjectUrl = URL.createObjectURL(blobRecord.blob)
    currentCoverUrl = blobRecord.cover ? URL.createObjectURL(blobRecord.cover) : null

    const a = getAudio()
    intendedToPlay = false
    a.src = currentObjectUrl
    a.load()

    const playlist = lib.getPlaylist(track.playlistId)
    set({
      source: 'music',
      currentTrackId: trackId,
      musicQueueIndex: get().musicQueue.indexOf(trackId),
      isLoading: false,
      isPlaying: false,
      duration: track.duration || 0,
      currentTime: 0,
      musicCurrentTime: 0,
      coverUrl: currentCoverUrl,
      canResume: false,
      nowPlaying: {
        title: track.title,
        subtitle: track.artist,
        label: playlist?.name ?? 'Now Playing',
        kind: 'music',
      },
    })
    restorePosition(startAt, generation)
    setMusicMediaSession(track)

    if (autoplay) {
      try {
        activatePlaybackSession()
        await a.play()
      } catch {
        if (generation === loadGeneration) set({ isPlaying: false })
      }
    }
    if (generation === loadGeneration) persistPlayerState()
  }

  const playAtIndex = async (index: number, autoplay = true) => {
    const { musicQueue } = get()
    if (index < 0 || index >= musicQueue.length) return
    set({ musicQueueIndex: index })
    await loadMusicItem(musicQueue[index], autoplay)
  }

  /** Load a chapter's blob into the audio element. Plays when `autoplay`. */
  const loadChapterAtIndex = async (
    bookId: string,
    index: number,
    autoplay: boolean,
    startAtOverride?: number,
  ) => {
    const generation = beginLoad()
    const abStore = useAudiobookStore.getState()
    const chapters = abStore.getChapters(bookId)
    const chapter = chapters[index]
    if (!chapter) { failLoad(generation); return }
    const book = abStore.getBook(bookId)
    const [blobRecord, coverRecord] = await Promise.all([
      abStore.getBlob(chapter.audioBlobId),
      book?.coverBlobId && currentBookCoverBookId !== bookId ? abStore.getBlob(book.coverBlobId).catch(() => undefined) : undefined,
    ]).catch(() => [undefined, undefined])
    if (generation !== loadGeneration) return
    if (!blobRecord) { failLoad(generation); return }

    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
    if (currentCoverUrl) {
      URL.revokeObjectURL(currentCoverUrl)
      currentCoverUrl = null
    }
    currentObjectUrl = URL.createObjectURL(blobRecord.blob)
    if (currentBookCoverBookId !== bookId) {
      resetBookCoverCache()
      currentBookCoverBookId = bookId
      currentBookCoverUrl = coverRecord ? URL.createObjectURL(coverRecord.blob) : null
    }
    const coverUrl = currentBookCoverUrl

    const a = getAudio()
    intendedToPlay = false
    a.src = currentObjectUrl
    a.load()

    const startAt = startAtOverride ?? chapter.lastPosition ?? 0

    set({
      source: 'audiobook',
      isLoading: false,
      isPlaying: false,
      currentBookId: bookId,
      currentChapterId: chapter.id,
      currentChapterIndex: index,
      bookQueue: chapters.map((c) => c.id),
      bookQueueIndex: index,
      duration: chapter.duration || 0,
      currentTime: 0,
      coverUrl,
      canResume: false,
      nowPlaying: {
        title: chapter.title,
        subtitle: book?.author || book?.title || 'Audiobook',
        label: book?.title ?? 'Audiobook',
        kind: 'audiobook',
        chapterPosition: { index, count: chapters.length },
      },
    })
    restorePosition(startAt, generation)
    setAudiobookMediaSession(chapter, book, coverUrl)

    if (autoplay) {
      try {
        activatePlaybackSession()
        await a.play()
      } catch {
        if (generation === loadGeneration) set({ isPlaying: false })
      }
    }


    if (generation !== loadGeneration) return
    void abStore.saveChapterProgress(bookId, chapter.id, { position: startAt }).catch(() => set({ playbackError: 'Could not save audiobook progress.' }))
    persistPlayerState()
  }

  const handleChapterEnded = async () => {
    const generation = loadGeneration
    const { currentBookId, currentChapterId, bookQueueIndex, bookQueue } = get()
    if (!currentBookId || !currentChapterId) return
    const abStore = useAudiobookStore.getState()
    const a = getAudio()
    const finalPosition = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : get().currentTime
    await abStore.saveChapterProgress(currentBookId, currentChapterId, {
      position: finalPosition,
      completed: true,
    })
    if (generation !== loadGeneration) return
    if (bookQueueIndex >= bookQueue.length - 1) {
      await abStore.markCompleted(currentBookId)
      if (generation !== loadGeneration) return
      intendedToPlay = false
      set({ isPlaying: false })
      return
    }
    await loadChapterAtIndex(currentBookId, bookQueueIndex + 1, true)
  }

  return {
    initialized: false,
    source: 'music',
    isPlaying: false,
    isLoading: false,
    playbackError: null,
    currentTime: 0,
    duration: 0,
    volume: 1,
    coverUrl: null,
    nowPlaying: null,
    canResume: false,

    currentTrackId: null,
    currentPlaylistId: null,
    musicQueue: [],
    musicQueueIndex: -1,
    musicCurrentTime: 0,
    shuffleEnabled: false,
    repeatMode: 'off',

    currentBookId: null,
    currentChapterId: null,
    currentChapterIndex: 0,
    bookQueue: [],
    bookQueueIndex: -1,

    init() {
      // Concurrent startup calls (including React StrictMode) must share one
      // restoration and one set of media listeners, or ended skips tracks.
      if (!initialization) {
        initialization = (async () => {
          if (get().initialized) return
          const a = getAudio()

          a.addEventListener('timeupdate', () => {
            if (get().isLoading || get().canResume || !a.src || a.readyState < 1) return
            const s = get()
            set({ currentTime: a.currentTime, ...(s.source === 'music' ? { musicCurrentTime: a.currentTime } : {}) })
            if (s.source === 'music') {
              persistThrottled()
            } else {
              tickAudiobookProgress()
            }
          })
          a.addEventListener('durationchange', () => {
            if (get().isLoading || get().canResume) return
            if (Number.isFinite(a.duration) && a.duration > 0) {
              set({ duration: a.duration })
              updatePositionState()
            }
          })
          a.addEventListener('play', () => {
            intendedToPlay = true
            lastListeningTickAt = Date.now()
            set({ isPlaying: true })
            refreshAudioMediaSession()
          })
          a.addEventListener('pause', () => {
            // Distinguish an OS-initiated background suspension (iOS lock screen,
            // app switch) from a genuine user pause. We still keep playback intent
            // recorded so the app can auto-resume on return to the foreground.
            const systemSuspend = intendedToPlay && !a.ended && document.hidden
            if (systemSuspend) {
              console.warn(
                '[player] paused while hidden — iOS background suspension; will auto-resume on foreground',
                { currentTime: a.currentTime, readyState: a.readyState },
              )
            }
            set({ isPlaying: false })
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
            if (a.src) persistPlayerState()
            if (get().source === 'audiobook') flushAudiobookProgressNow()
          })
          a.addEventListener('ended', () => {
            if (get().isLoading) return
            if (get().source === 'audiobook') void handleChapterEnded().catch(() => set({ isPlaying: false, playbackError: 'Could not advance the audiobook. Try Next again.' }))
            else if (get().repeatMode === 'one') {
              a.currentTime = 0
              set({ currentTime: 0, musicCurrentTime: 0 })
              activatePlaybackSession()
              void a.play().catch(() => set({ isPlaying: false }))
            }
            else void get().next()
          })
          a.addEventListener('stalled', () =>
            console.warn('[player] stalled — network/decode stall while', document.hidden ? 'hidden' : 'visible'),
          )
          a.addEventListener('error', () => { if (a.error) failLoad(loadGeneration) })

          // Safety net: if iOS suspended playback while backgrounded, resume the
          // moment the app comes back to the foreground (intent is still "playing").
          // While hidden, flush whatever progress hasn't been persisted yet.
          document.addEventListener('visibilitychange', () => {
            // Only active audio may reclaim the session; paused audio must not
            // overwrite the video player's controls when the app is backgrounded.
            if (a.src && !a.paused) refreshAudioMediaSession()
            if (document.hidden) {
              persistPlayerState()
              if (get().source === 'audiobook') flushAudiobookProgressNow()
              return
            }
            if (intendedToPlay && a.paused && a.src) {
              activatePlaybackSession()
              a.play().catch((err) =>
                console.warn('[player] foreground auto-resume rejected', err),
              )
            }
          })
          window.addEventListener('pagehide', () => {
            persistPlayerState()
            if (get().source === 'audiobook') flushAudiobookProgressNow()
          })

          // System / lock-screen / headphone controls.
          registerMediaSessionHandlers()

          // Restore prior session (without autoplay — iOS needs a user gesture).
          const saved = await db.playerState.get('player')
          if (!saved) {
            set({ initialized: true })
            return
          }

          const lib = useLibraryStore.getState()
          const lastTrack = saved.currentTrackId ? lib.getTrack(saved.currentTrackId) : undefined
          const playlist = saved.currentPlaylistId ? lib.getPlaylist(saved.currentPlaylistId) : undefined
          const musicQueue = (!saved.shuffleEnabled && playlist ? playlist.trackIds : saved.queue)
            .filter((id) => lib.getTrack(id))
          const abStore = useAudiobookStore.getState()
          const book = saved.currentBookId ? abStore.getBook(saved.currentBookId) : undefined
          const chapters = book ? abStore.getChapters(book.id) : []
          const chapterIndex = book && chapters[book.currentChapterIndex] ? book.currentChapterIndex : 0
          const chapter = chapters[chapterIndex]
          const source = saved.source ?? 'music'

          a.volume = saved.volume
          // Both remembered sessions survive reload; only the active source
          // determines the shared transport metadata and visible position.
          set({
            volume: saved.volume,
            shuffleEnabled: saved.shuffleEnabled,
            repeatMode: saved.repeatMode,
            source,
            currentPlaylistId: saved.currentPlaylistId,
            currentTrackId: lastTrack?.id ?? null,
            musicQueue,
            musicQueueIndex: lastTrack ? musicQueue.indexOf(lastTrack.id) : -1,
            musicCurrentTime: lastTrack ? saved.currentTime : 0,
            currentBookId: book?.id ?? null,
            currentChapterId: chapter?.id ?? null,
            currentChapterIndex: chapterIndex,
            bookQueue: chapters.map((item) => item.id),
            bookQueueIndex: chapter ? chapterIndex : -1,
            initialized: true,
          })

          if (source === 'music' && lastTrack) {
            set({
              currentTime: saved.currentTime,
              duration: lastTrack.duration || 0,
              canResume: true,
              nowPlaying: {
                title: lastTrack.title,
                subtitle: lastTrack.artist,
                label: lib.getPlaylist(lastTrack.playlistId)?.name ?? 'Now Playing',
                kind: 'music',
              },
            })
          } else if (source === 'audiobook' && book && chapter) {
            set({
              currentTime: book.currentTime,
              duration: chapter.duration || 0,
              canResume: true,
              nowPlaying: {
                title: chapter.title,
                subtitle: book.author || book.title,
                label: book.title,
                kind: 'audiobook',
                chapterPosition: { index: chapterIndex, count: chapters.length },
              },
            })
          }
        })()
      }
      return initialization
    },

    async restoreSource(source) {
      const s = get()
      if (s.source === source) return
      if (s.source === 'audiobook') flushAudiobookProgressNow()
      if (source === 'music' && s.currentTrackId && useLibraryStore.getState().getTrack(s.currentTrackId)) {
        await loadMusicItem(s.currentTrackId, false, s.musicCurrentTime)
        return
      }
      if (source === 'audiobook' && s.currentBookId) {
        const abStore = useAudiobookStore.getState()
        const book = abStore.getBook(s.currentBookId)
        if (book && abStore.getChapters(book.id).length) {
          await loadChapterAtIndex(book.id, book.currentChapterIndex, false, book.currentTime)
          return
        }
      }

      // Selecting an empty section still switches the transport source. Keep
      // the other section's remembered session available for a later return.
      get().pause()
      const a = getAudio()
      a.removeAttribute('src')
      a.load()
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
      if (currentCoverUrl) URL.revokeObjectURL(currentCoverUrl)
      currentObjectUrl = null
      currentCoverUrl = null
      resetBookCoverCache()
      set({ source, currentTime: 0, duration: 0, nowPlaying: null, coverUrl: null, canResume: false, playbackError: null,
        ...(source === 'music'
          ? { currentTrackId: null, musicCurrentTime: 0, musicQueueIndex: -1 }
          : { currentBookId: null, currentChapterId: null, currentChapterIndex: 0, bookQueue: [], bookQueueIndex: -1 }),
      })
      if ('mediaSession' in navigator) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none' }
      persistPlayerState()
    },

    async playPlaylist(playlistId, startTrackId) {
      const lib = useLibraryStore.getState()
      const playlist = lib.getPlaylist(playlistId)
      if (!playlist || playlist.trackIds.length === 0) return
      flushAudiobookProgressNow()

      const { shuffleEnabled } = get()
      const start = startTrackId ?? playlist.trackIds[0]
      const queue = shuffleEnabled
        ? buildShuffledQueue(playlist.trackIds, startTrackId ? undefined : start)
        : playlist.trackIds.slice()

      // Only shuffle moves a selected track to the front. In normal playback,
      // keep the playlist order and start at the selected track's own index.
      let index = queue.indexOf(start)
      if (shuffleEnabled && startTrackId && index > 0) {
        queue.splice(index, 1)
        queue.unshift(start)
        index = 0
      }
      if (index < 0) index = 0

      set({ source: 'music', currentPlaylistId: playlistId, musicQueue: queue })
      await playAtIndex(index)
    },

    async playRandom(trackIds, playlistId = null) {
      if (trackIds.length === 0) return
      flushAudiobookProgressNow()
      const queue = buildShuffledQueue(trackIds)
      set({ source: 'music', currentPlaylistId: playlistId, musicQueue: queue, shuffleEnabled: true })
      await playAtIndex(0)
    },

    async playAudiobook(bookId, opts = {}) {
      const abStore = useAudiobookStore.getState()
      const book = abStore.getBook(bookId)
      const chapters = abStore.getChapters(bookId)
      if (!book || chapters.length === 0) return

      flushAudiobookProgressNow()
      if (get().source === 'music') persistPlayerState()

      let targetIndex: number
      let startAt: number
      if (opts.fromBeginning) {
        targetIndex = 0
        startAt = 0
      } else if (opts.chapterId) {
        const idx = chapters.findIndex((c) => c.id === opts.chapterId)
        targetIndex = idx >= 0 ? idx : 0
        const chapter = chapters[targetIndex]
        startAt = chapter.id === book.currentChapterId ? book.currentTime : chapter.lastPosition || 0
      } else {
        targetIndex = book.currentChapterId
          ? Math.max(0, chapters.findIndex((c) => c.id === book.currentChapterId))
          : 0
        const raw = book.currentTime || 0
        startAt = raw > CONTINUE_REWIND_MIN_POSITION ? raw - CONTINUE_REWIND_SECONDS : raw
      }

      const recording = abStore.recordPlayStart(bookId).catch(() => set({ playbackError: 'Could not save listening history.' }))
      await loadChapterAtIndex(bookId, targetIndex, true, startAt)
      await recording
    },

    async playChapter(bookId, chapterId) {
      await get().playAudiobook(bookId, { chapterId })
    },

    async togglePlay() {
      if (getAudio().paused) await playAudio()
      else get().pause()
    },

    async next() {
      const { source, musicQueueIndex, musicQueue, currentBookId, bookQueueIndex, bookQueue } = get()

      if (source === 'music') {
        if (musicQueue.length === 0) return
        if (musicQueueIndex < musicQueue.length - 1) {
          await playAtIndex(musicQueueIndex + 1)
        } else {
          // End of queue: loop back to the first track (cyclic playback).
          await playAtIndex(0)
        }
        return
      }

      // Audiobook: advance one chapter. No wraparound at the end — the
      // `ended` handler is what marks a book completed; a manual "next" press
      // on the last chapter is a no-op.
      if (!currentBookId || bookQueueIndex >= bookQueue.length - 1) return
      flushAudiobookProgressNow()
      await loadChapterAtIndex(currentBookId, bookQueueIndex + 1, true)
    },

    async previous() {
      if (get().source === 'music') {
        await get().previousTrack()
        return
      }
      const a = getAudio()
      // For audiobooks, restart the current chapter if we are more than 3s in.
      if (a.currentTime > 3) {
        a.currentTime = 0
        set({ currentTime: 0 })
        if (get().source === 'audiobook') flushAudiobookProgressNow()
        return
      }
      const { currentBookId, bookQueueIndex } = get()

      if (currentBookId && bookQueueIndex > 0) {
        flushAudiobookProgressNow()
        await loadChapterAtIndex(currentBookId, bookQueueIndex - 1, true)
      } else {
        a.currentTime = 0
        set({ currentTime: 0 })
      }
    },

    async previousTrack() {
      const { source, musicQueueIndex, musicQueue, currentBookId, bookQueueIndex } = get()
      if (source === 'music') {
        if (musicQueue.length === 0) return
        await playAtIndex(musicQueueIndex > 0 ? musicQueueIndex - 1 : musicQueue.length - 1)
        return
      }
      if (currentBookId && bookQueueIndex > 0) {
        flushAudiobookProgressNow()
        await loadChapterAtIndex(currentBookId, bookQueueIndex - 1, true)
      }
    },

    seek(time) {
      const a = getAudio()
      if (!Number.isFinite(time) || get().isLoading || get().canResume || !a.src) return
      const limit = Number.isFinite(a.duration) ? a.duration : get().duration
      const clamped = Math.max(0, Math.min(time, limit || time))
      a.currentTime = clamped
      const s = get()
      set({ currentTime: clamped, ...(s.source === 'music' ? { musicCurrentTime: clamped } : {}) })
      updatePositionState()
      if (s.source === 'audiobook') flushAudiobookProgressNow()
    },

    setVolume(volume) {
      if (!Number.isFinite(volume)) return
      const v = Math.max(0, Math.min(1, volume))
      getAudio().volume = v
      set({ volume: v })
      persistThrottled()
    },

    toggleShuffle() {
      if (get().source !== 'music') return
      const { shuffleEnabled, musicQueue, currentTrackId } = get()
      const next = !shuffleEnabled
      if (musicQueue.length > 0 && currentTrackId) {
        let newQueue: string[]
        let newIndex: number
        if (next) {
          // Keep current track first, shuffle the rest.
          const rest = musicQueue.filter((id) => id !== currentTrackId)
          newQueue = [currentTrackId, ...buildShuffledQueue(rest)]
          newIndex = 0
        } else {
          // Restore the playlist's natural order.
          const lib = useLibraryStore.getState()
          const playlist = get().currentPlaylistId ? lib.getPlaylist(get().currentPlaylistId!) : undefined
          newQueue = playlist ? playlist.trackIds.slice() : musicQueue.slice()
          newIndex = Math.max(0, newQueue.indexOf(currentTrackId))
        }
        set({ shuffleEnabled: next, musicQueue: newQueue, musicQueueIndex: newIndex })
      } else {
        set({ shuffleEnabled: next })
      }
      persistPlayerState()
    },

    cycleRepeat() {
      if (get().source !== 'music') return
      const order: RepeatMode[] = ['off', 'all', 'one']
      const current = get().repeatMode
      const next = order[(order.indexOf(current) + 1) % order.length]
      set({ repeatMode: next })
      persistPlayerState()
    },

    pause() {
      ++loadGeneration
      cancelPendingSeek?.()
      cancelPendingSeek = null
      intendedToPlay = false
      getAudio().pause()
      set({ isPlaying: false, isLoading: false })
      if (get().source === 'audiobook') flushAudiobookProgressNow()
      persistPlayerState()
    },

    syncMusicQueue() {
      const s = get()
      const playlist = s.currentPlaylistId ? useLibraryStore.getState().getPlaylist(s.currentPlaylistId) : undefined
      if (!playlist || s.shuffleEnabled) return
      set({ musicQueue: playlist.trackIds.slice(), musicQueueIndex: s.currentTrackId ? playlist.trackIds.indexOf(s.currentTrackId) : -1 })
      persistPlayerState()
    },

    stop() {
      get().pause()
      const a = getAudio()
      intendedToPlay = false
      if (get().source === 'audiobook') flushAudiobookProgressNow()
      a.pause()
      a.currentTime = 0
      set({ isPlaying: false, currentTime: 0 })
      persistPlayerState()
    },

    async resume() {
      const s = get()
      if (s.source === 'music' && s.currentTrackId) {
        await loadMusicItem(s.currentTrackId, true, s.currentTime)
      } else if (s.currentBookId) {
        await loadChapterAtIndex(s.currentBookId, s.currentChapterIndex, true, s.currentTime)
      }
    },

    handleTrackRemoved(trackId) {
      get().handleTracksRemoved([trackId])
    },

    handleTracksRemoved(trackIds) {
      const removed = new Set(trackIds)
      const s = get()
      const newQueue = s.musicQueue.filter((id) => !removed.has(id))
      const currentRemoved = s.currentTrackId !== null && removed.has(s.currentTrackId)
      const pendingRemoved = s.isLoading && removed.has(s.musicQueue[s.musicQueueIndex])
      if (newQueue.length === s.musicQueue.length && !currentRemoved && !pendingRemoved) return
      const activeRemoved = s.source === 'music' && (currentRemoved || pendingRemoved)
      if (activeRemoved) {
        ++loadGeneration
        cancelPendingSeek?.()
        cancelPendingSeek = null
        intendedToPlay = false
        if (musicSaveTimer) clearTimeout(musicSaveTimer)
        musicSaveTimer = null
        const a = getAudio()
        // Clear the source before pausing: its pause event must not persist
        // the removed track or produce a second write for this batch.
        a.removeAttribute('src')
        a.pause()
        a.load()
        if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
        if (currentCoverUrl) URL.revokeObjectURL(currentCoverUrl)
        currentObjectUrl = null
        currentCoverUrl = null
        set({
          musicQueue: newQueue, currentTrackId: null, musicQueueIndex: -1,
          musicCurrentTime: 0, isPlaying: false, isLoading: false,
          currentTime: 0, duration: 0, coverUrl: null, canResume: false, nowPlaying: null,
        })
      } else {
        const currentTrackId = currentRemoved ? null : s.currentTrackId
        const queueTarget = s.source === 'music' && s.isLoading
          ? s.musicQueue[s.musicQueueIndex]
          : currentTrackId
        set({ musicQueue: newQueue, currentTrackId,
          musicQueueIndex: queueTarget ? newQueue.indexOf(queueTarget) : -1,
          ...(currentRemoved ? { musicCurrentTime: 0 } : {}),
        })
      }
      persistPlayerState()
    },

    handleBookRemoved(bookId) {
      const { currentBookId } = get()
      if (currentBookId !== bookId) return
      if (get().source !== 'audiobook') { set({ currentBookId: null, currentChapterId: null, bookQueue: [], bookQueueIndex: -1 }); persistPlayerState(); return }
      get().pause()
      intendedToPlay = false
      getAudio().pause()
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
      currentObjectUrl = null
      resetBookCoverCache()
      getAudio().removeAttribute('src')
      set({
        currentBookId: null,
        currentChapterId: null,
        currentChapterIndex: 0,
        bookQueue: [],
        bookQueueIndex: -1,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        coverUrl: null,
        canResume: false,
        nowPlaying: null,
      })
      persistPlayerState()
    },
  }
})
