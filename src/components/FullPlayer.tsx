// Core
import { useEffect } from 'react'
// Components
import {
  PlayIcon,
  PauseIcon,
  NextIcon,
  PrevIcon,
  ShuffleIcon,
  RepeatIcon,
  RepeatOneIcon,
  ChevronDownIcon,
  MusicIcon,
  VolumeIcon,
  Rewind10Icon,
  Forward10Icon,
} from '@/components/Icons'
// Store
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore } from '@/store/useUiStore'
// Utils
import { formatTime } from '@/utils/format'

export default function FullPlayer() {
  const player = usePlayerStore()
  const {
    nowPlaying,
    isPlaying,
    currentTime,
    duration,
    volume,
    shuffleEnabled,
    repeatMode,
    coverUrl,
    source,
  } = player
  const closeFullPlayer = useUiStore((s) => s.closeFullPlayer)

  const shownTime = currentTime

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeFullPlayer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeFullPlayer])

  if (!nowPlaying) return null

  const isAudiobook = source === 'audiobook'
  const supportsVolume = !(/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

  return (
    <div className="full-player">
      <div className="full-top">
        <button className="icon-btn ghost" onClick={closeFullPlayer} aria-label="Close player">
          <ChevronDownIcon />
        </button>
        <div className="label">{nowPlaying.label}</div>
        <span style={{ width: 42 }} />
      </div>

      <div className="full-art-wrap">
        <div className="full-art">
          {coverUrl ? <img src={coverUrl} alt="" /> : <MusicIcon width={96} height={96} />}
        </div>
      </div>

      <div className="full-meta">
        <div className="title">{nowPlaying.title}</div>
        <div className="artist">{nowPlaying.subtitle}</div>
        {nowPlaying.chapterPosition && (
          <div className="chapter-position">
            Chapter {nowPlaying.chapterPosition.index + 1} of {nowPlaying.chapterPosition.count}
          </div>
        )}
      </div>

      <div className="seek">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(shownTime, duration || 0)}
          aria-label="Seek track"
          disabled={duration <= 0 || player.isLoading || player.canResume}
          onChange={(e) => player.seek(Number(e.target.value))}
        />
        <div className="times">
          <span>{formatTime(shownTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="transport">
        {isAudiobook ? (
          <button className="side" onClick={() => player.seek(currentTime - 30)} aria-label="Back 30 seconds">
            <Rewind10Icon width={22} height={22} />
          </button>
        ) : (
          <button
            className={`side${shuffleEnabled ? ' active' : ''}`}
            onClick={player.toggleShuffle}
            aria-label="Shuffle"
          >
            <ShuffleIcon width={22} height={22} />
          </button>
        )}
        <button className="nav" onClick={() => void player.previous()} aria-label="Previous">
          <PrevIcon width={34} height={34} />
        </button>
        <button className="play" onClick={() => void player.togglePlay()} aria-label="Play/Pause">
          {isPlaying ? <PauseIcon width={34} height={34} /> : <PlayIcon width={34} height={34} />}
        </button>
        <button className="nav" onClick={() => void player.next()} aria-label="Next">
          <NextIcon width={34} height={34} />
        </button>
        {isAudiobook ? (
          <button className="side" onClick={() => player.seek(currentTime + 30)} aria-label="Forward 30 seconds">
            <Forward10Icon width={22} height={22} />
          </button>
        ) : (
          <button
            className={`side${repeatMode !== 'off' ? ' active' : ''}`}
            onClick={player.cycleRepeat}
            aria-label="Repeat"
          >
            {repeatMode === 'one' ? (
              <RepeatOneIcon width={22} height={22} />
            ) : (
              <RepeatIcon width={22} height={22} />
            )}
          </button>
        )}
      </div>

      {supportsVolume && (
        <div className="volume-row">
          <VolumeIcon width={20} height={20} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => player.setVolume(Number(e.target.value))}
          />
        </div>
      )}
    </div>
  )
}
