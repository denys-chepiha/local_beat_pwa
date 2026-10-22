// Core
import { useEffect, useRef, useState } from 'react'
// Components
import { VideoIcon, PlusIcon, PlayIcon, PauseIcon, PrevIcon, NextIcon, Rewind10Icon, Forward10Icon, XIcon, VolumeIcon } from '@/components/Icons'
// Services
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore } from '@/store/useUiStore'
import { useVideoSession } from './useVideoSession'
// Utils
import { formatTime } from '@/utils/format'
// Styles
import './VideoScreen.css'

export default function VideoScreen() {
  const { entries, setEntries, activeId, setActiveId } = useVideoSession()
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRate] = useState(1)
  const [muted, setMuted] = useState(false)
  const [repeat, setRepeat] = useState<'off' | 'all' | 'one'>('off')
  const [volume, setVolume] = useState(1)
  const [expanded, setExpanded] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [activity, setActivity] = useState(0)
  const [controlsFocused, setControlsFocused] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const nextId = useRef(Math.max(0, ...entries.map((entry) => entry.id)))
  const autoplay = useRef(false)
  const pauseAudio = usePlayerStore((s) => s.pause)
  const goHome = useUiStore((s) => s.goHome)
  const activeIndex = entries.findIndex((entry) => entry.id === activeId)
  const file = entries[activeIndex]?.file
  const supportsVolume = !(/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  const wake = () => { setControlsVisible(true); setActivity((n) => n + 1) }

  useEffect(() => { pauseAudio() }, [pauseAudio])
  useEffect(() => {
    if (!playing || queueOpen || controlsFocused) { setControlsVisible(true); return }
    const timer = setTimeout(() => setControlsVisible(false), 2500)
    return () => clearTimeout(timer)
  }, [playing, queueOpen, controlsFocused, activity])
  useEffect(() => {
    const changed = () => { setExpanded(!!document.fullscreenElement); wake() }
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])
  useEffect(() => {
    if (!expanded) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.fullscreenElement) setExpanded(false) }
    document.addEventListener('keydown', escape)
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', escape) }
  }, [expanded])
  useEffect(() => {
    const video = videoRef.current
    if (!file || !video) return
    setTime(0); setDuration(0); setPlaying(false); setError(null); wake()
    const url = URL.createObjectURL(file)
    video.src = url
    video.load()
    return () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
    }
  }, [file])

  const handoff = () => {
    pauseAudio()
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null
      const actions: MediaSessionAction[] = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekforward', 'seekbackward']
      for (const action of actions) {
        try { navigator.mediaSession.setActionHandler(action, null) } catch { /* Unsupported action. */ }
      }
    }
  }
  const play = () => {
    const video = videoRef.current
    if (!video) return
    void video.play().catch(() => { setPlaying(false); setError('Playback could not start. Press Play, or try another video format.') })
  }
  const togglePlay = () => {
    wake()
    if (videoRef.current?.paused) play()
    else videoRef.current?.pause()
  }
  const seek = (target: number) => {
    if (!videoRef.current || !Number.isFinite(target) || duration <= 0) return
    videoRef.current.currentTime = Math.max(0, Math.min(duration, target))
    setTime(videoRef.current.currentTime)
    wake()
  }
  const select = (id: number, shouldPlay = true) => {
    if (id === activeId) { if (shouldPlay) play(); return }
    autoplay.current = shouldPlay
    setActiveId(id)
    setQueueOpen(false)
  }
  const navigate = (delta: number) => {
    const next = entries[activeIndex + delta]
    if (next) select(next.id)
  }
  const fullscreen = async () => {
    wake()
    if (document.fullscreenElement) { await document.exitFullscreen(); return }
    if (expanded) { setExpanded(false); return }
    const stage = stageRef.current
    if (stage?.requestFullscreen) {
      try { await stage.requestFullscreen(); setExpanded(true); return } catch { /* Use a full-window player when Safari denies fullscreen. */ }
    }
    setExpanded(true)
  }
  const remove = (id: number) => {
    const remaining = entries.filter((entry) => entry.id !== id)
    if (id === activeId) {
      autoplay.current = playing
      setActiveId(remaining[Math.min(activeIndex, remaining.length - 1)]?.id ?? null)
      if (!remaining.length) { setExpanded(false); if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}) }
    }
    setEntries(remaining)
  }
  const library = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    goHome()
  }

  return (
    <main className="video-screen">
      <header className="topbar">
        <h1>Video</h1>
        <button className="btn primary" onClick={() => inputRef.current?.click()}><PlusIcon width={18} height={18} /> Add videos</button>
      </header>
      <div ref={stageRef} className={`video-stage${expanded ? ' video-stage--expanded' : ''}${playing && !controlsVisible ? ' video-stage--quiet' : ''}`} tabIndex={0}
        aria-label="Video player" onPointerMove={(event) => { if (event.pointerType !== 'touch') wake() }}
        onKeyDownCapture={wake}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === ' ' || event.key === 'k') { event.preventDefault(); togglePlay() }
          if (event.key === 'ArrowRight') { event.preventDefault(); seek(time + 10) }
          if (event.key === 'ArrowLeft') { event.preventDefault(); seek(time - 10) }
          if (event.key === 'f') { event.preventDefault(); void fullscreen() }
          if (event.key === 'm') setMuted((value) => !value)
        }}>
        <input ref={inputRef} type="file" hidden multiple aria-label="Choose video files"
          accept="video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi"
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? [])
            event.target.value = ''
            if (!selected.length) return
            const valid = selected.filter((f) => f.size > 0 && (f.type.startsWith('video/') || /\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(f.name)))
            const additions = valid.filter((f) => !entries.some((entry) => entry.file.name === f.name && entry.file.size === f.size && entry.file.lastModified === f.lastModified))
              .map((f) => ({ id: ++nextId.current, file: f }))
            setEntries((current) => [...current, ...additions])
            if (!file && additions[0]) { autoplay.current = false; setActiveId(additions[0].id) }
            setError(valid.length < selected.length ? 'Some files were skipped. Choose non-empty video files.' : null)
          }} />
        {file ? (
          <>
            <video ref={videoRef} playsInline preload="metadata" aria-label={file.name} muted={muted}
              onLoadedMetadata={() => {
                const video = videoRef.current!
                setDuration(Number.isFinite(video.duration) ? video.duration : 0)
                video.playbackRate = rate
                if (supportsVolume) video.volume = volume
                if (autoplay.current) { autoplay.current = false; play() }
              }}
              onDurationChange={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onPlay={() => { handoff(); setPlaying(true); setError(null) }} onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false)
                if (repeat === 'one') { seek(0); play() }
                else if (activeIndex < entries.length - 1) navigate(1)
                else if (repeat === 'all' && entries.length) { if (entries.length === 1) { seek(0); play() } else select(entries[0].id) }
              }}
              onClick={() => { if (controlsVisible) togglePlay(); else wake() }}
              onError={() => { setPlaying(false); setError('This video could not be played. Its format may be unsupported, or the drive may be disconnected. Try an MP4 with H.264 video and AAC audio.') }} />
            <div className={`video-overlay${controlsVisible ? '' : ' video-overlay--hidden'}`}
              onFocusCapture={(event) => { wake(); if (event.target.matches(':focus-visible')) setControlsFocused(true) }} onBlurCapture={() => setControlsFocused(false)}>
              <div className="video-top-controls">
                <button className="video-control" onClick={library} aria-label="Back to music"><XIcon /></button>
                <span className="video-filename">{file.name}</span>
                <button className="video-control" aria-expanded={queueOpen} onClick={() => { setQueueOpen(!queueOpen); wake() }}>Playlist ({entries.length})</button>
                <button className="video-control" onClick={() => void fullscreen()} aria-label={expanded ? 'Exit fullscreen' : 'Enter fullscreen'}>{expanded ? 'Exit fullscreen' : 'Fullscreen'}</button>
              </div>
              <div className="video-bottom-controls">
                <div className="video-timeline"><span>{formatTime(time)}</span><input aria-label="Seek video" type="range" min={0} max={duration} step={0.1} value={Math.min(time, duration)} disabled={duration <= 0} onChange={(e) => seek(Number(e.target.value))} /><span>{formatTime(duration)}</span></div>
                <div className="video-transport">
                  <button className="video-control" onClick={() => navigate(-1)} disabled={activeIndex <= 0} aria-label="Previous video"><PrevIcon /></button>
                  <button className="video-control" onClick={() => seek(time - 10)} aria-label="Rewind video 10 seconds"><Rewind10Icon /></button>
                  <button className="video-control video-control--play" onClick={togglePlay} aria-label={playing ? 'Pause video' : 'Play video'}>{playing ? <PauseIcon /> : <PlayIcon />}</button>
                  <button className="video-control" onClick={() => seek(time + 10)} aria-label="Forward video 10 seconds"><Forward10Icon /></button>
                  <button className="video-control" onClick={() => navigate(1)} disabled={activeIndex >= entries.length - 1} aria-label="Next video"><NextIcon /></button>
                  <button className="video-control" aria-label={muted ? 'Unmute video' : 'Mute video'} aria-pressed={muted} onClick={() => setMuted(!muted)}><VolumeIcon /><span>{muted ? 'Off' : ''}</span></button>
                  {supportsVolume && <input className="video-volume" aria-label="Video volume" type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => { const v = Number(e.target.value); setVolume(v); if (videoRef.current) videoRef.current.volume = v; setMuted(v === 0) }} />}
                  <button className="video-control" aria-label={`Repeat video: ${repeat}`} aria-pressed={repeat !== 'off'} onClick={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}>Repeat: {repeat}</button>
                  <label className="video-speed"><span className="sr-only">Playback speed</span><select aria-label="Playback speed" value={rate} onChange={(e) => { const v = Number(e.target.value); setRate(v); if (videoRef.current) videoRef.current.playbackRate = v }}>{[0.5,0.75,1,1.25,1.5,2].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="video-empty"><VideoIcon width={56} height={56} /><h2>Your videos, right here</h2><p>Choose videos from this device or a connected drive to build a playlist.</p><button className="btn" onClick={() => inputRef.current?.click()}>Choose videos</button></div>
        )}
        {queueOpen && file && <aside className="video-queue" aria-label="Video playlist"><div className="video-queue-heading"><h2>Playlist</h2><button className="video-control" onClick={() => setQueueOpen(false)} aria-label="Close playlist"><XIcon /></button></div>
          <button className="btn" onClick={() => inputRef.current?.click()}><PlusIcon /> Add videos</button>
          <ol>{entries.map((entry, i) => <li key={entry.id} className={entry.id === activeId ? 'is-active' : ''}><button onClick={() => select(entry.id)} aria-current={entry.id === activeId ? 'true' : undefined}><span>{i + 1}</span><span>{entry.file.name}</span></button><button className="video-control" onClick={() => remove(entry.id)} aria-label={`Remove ${entry.file.name}`}><XIcon width={18} height={18} /></button></li>)}</ol>
        </aside>}
        {error && <p className="video-error" role="alert">{error}</p>}
      </div>
      {file && <div className="video-details"><div><h2>{file.name}</h2><p>{activeIndex + 1} of {entries.length} · {(file.size / 1024 / 1024).toFixed(1)} MB</p></div><button className="btn" onClick={() => { setQueueOpen(!queueOpen); wake() }}>Show playlist</button></div>}
      <p className="video-note">Videos stay on your device and are not copied into the library. Your playlist stays available until you reload or close the app. During playback, controls hide automatically; move the pointer or tap the video to show them.</p>
    </main>
  )
}
