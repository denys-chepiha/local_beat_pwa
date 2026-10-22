// Core
import { type CSSProperties } from 'react'
// Components
import {
  PlayIcon,
  PauseIcon,
  NextIcon,
  PrevIcon,
  MusicIcon,
  Rewind10Icon,
  Forward10Icon,
} from '@/components/Icons'
// Store
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore } from '@/store/useUiStore'
// Utils
import { formatTime } from '@/utils/format'

export default function MiniPlayer() {
  const {
    nowPlaying,
    isPlaying,
    currentTime,
    duration,
    coverUrl,
    source,
    musicQueue,
    musicQueueIndex,
    bookQueue,
    bookQueueIndex,
    togglePlay,
    next,
    previousTrack,
    seek,
  } = usePlayerStore()
  const openFullPlayer = useUiStore((s) => s.openFullPlayer)

  if (!nowPlaying) return null

  const totalDuration = duration || 0
  const shownTime = Math.min(currentTime, totalDuration || currentTime)
  const progress = totalDuration > 0 ? Math.min(100, (shownTime / totalDuration) * 100) : 0
  const queueIndex = source === 'music' ? musicQueueIndex : bookQueueIndex
  const queueLength = source === 'music' ? musicQueue.length : bookQueue.length
  const hasPreviousTrack = source === 'music' ? queueLength > 0 : queueIndex > 0
  const hasNextTrack = source === 'music'
    ? queueLength > 0
    : queueIndex >= 0 && queueIndex < queueLength - 1
  const seekTo = (time: number) => seek(Math.max(0, Math.min(time, totalDuration || time)))
  const jumpBy = (seconds: number) => {
    seekTo(shownTime + seconds)
  }

  return (
    <div className="mini-player">
      <div className="mini-inner">
        <div className="mini-main">
          <button
            type="button"
            className="mini-art"
            onClick={openFullPlayer}
            aria-label="Open player"
          >
            {coverUrl ? <img src={coverUrl} alt="" /> : <MusicIcon width={22} height={22} />}
          </button>
          <button type="button" className="mini-info" onClick={openFullPlayer}>
            <div className="title">{nowPlaying.title}</div>
            <div className="artist">{nowPlaying.subtitle}</div>
          </button>
        </div>

        <div className="mini-seek">
          <input
            className="mini-scrub"
            type="range"
            min={0}
            max={totalDuration}
            step={0.1}
            value={shownTime}
            disabled={totalDuration <= 0}
            aria-label="Seek track"
            style={{
              '--mini-progress': `${progress}%`,
            } as CSSProperties}
            onChange={(e) => {
              const value = Number(e.target.value)
              seekTo(value)
            }}
          />
          <div className="mini-times">
            <span>{formatTime(shownTime)}</span>
            <span>{formatTime(totalDuration)}</span>
          </div>
        </div>

        <div className="mini-controls" aria-label="Mini player controls">
          <button
            type="button"
            className="ctrl"
            onClick={() => void previousTrack()}
            aria-label="Previous track"
            disabled={!hasPreviousTrack}
          >
            <PrevIcon width={28} height={28} />
          </button>
          <button
            type="button"
            className="ctrl"
            onClick={() => jumpBy(-10)}
            aria-label="Rewind 10 seconds"
          >
            <Rewind10Icon width={28} height={28} />
          </button>
          <button
            type="button"
            className="ctrl play-toggle"
            onClick={() => void togglePlay()}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon width={32} height={32} /> : <PlayIcon width={32} height={32} />}
          </button>
          <button
            type="button"
            className="ctrl"
            onClick={() => jumpBy(10)}
            aria-label="Forward 10 seconds"
          >
            <Forward10Icon width={28} height={28} />
          </button>
          <button
            type="button"
            className="ctrl"
            onClick={() => void next()}
            aria-label="Next track"
            disabled={!hasNextTrack}
          >
            <NextIcon width={28} height={28} />
          </button>
        </div>
      </div>
    </div>
  )
}
