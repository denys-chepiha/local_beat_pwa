// Core
import { useEffect, useRef, useState, type CSSProperties } from 'react'
// Components
import { VideoIcon, PlusIcon, PlayIcon, PauseIcon, PrevIcon, NextIcon, Rewind10Icon, Forward10Icon, XIcon } from '@/components/Icons'
// Services
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore } from '@/store/useUiStore'
import { useVideoSession } from './useVideoSession'
// Utils
import VideoSeek from './VideoSeek'
// Styles
import './VideoScreen.css'

export default function VideoScreen() {
  const { entries, setEntries, activeId, setActiveId, progress, saveProgress, storageError } = useVideoSession()
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
  const [scrubbing, setScrubbing] = useState(false)
  const audioGraph = useRef<{ context: AudioContext; gain: GainNode } | null>(null)
  const lastVolume = useRef(1)
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

  useEffect(() => { pauseAudio(); return () => { if (audioGraph.current) { void audioGraph.current.context.close(); audioGraph.current = null } } }, [pauseAudio])
  useEffect(() => {
    if (!playing || queueOpen || controlsFocused || scrubbing) { setControlsVisible(true); return }
    const timer = setTimeout(() => setControlsVisible(false), 2500)
    return () => clearTimeout(timer)
  }, [playing, queueOpen, controlsFocused, activity, scrubbing])
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
    setTime(useVideoSession.getState().progress[activeId!]?.time ?? 0); setDuration(0); setPlaying(false); setError(null); wake()
    const url = URL.createObjectURL(file)
    video.src = url
    video.load()
    return () => {
      if (video.readyState >= 1 && activeId !== null) saveProgress(activeId, video.currentTime, video.ended)
      video.pause()
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
    }
  }, [file])

  const changeVolume = (value: number) => {
    const video = videoRef.current
    if (!video) return
    if (value > 0) lastVolume.current = value
    setVolume(value); setMuted(value === 0)
    if (supportsVolume) video.volume = value
    else {
      try {
        if (!audioGraph.current) {
          const context = new AudioContext()
          const gain = context.createGain()
          context.createMediaElementSource(video).connect(gain).connect(context.destination)
          audioGraph.current = { context, gain }
        }
        audioGraph.current.gain.gain.value = value
        void audioGraph.current.context.resume().catch(() => setError('Volume control is unavailable. Use the device volume buttons.'))
      } catch { setError('Volume control is unavailable. Use the device volume buttons.') }
    }
    wake()
  }
  const toggleMute = () => {
    if (muted || volume === 0) { changeVolume(volume || lastVolume.current); setMuted(false) }
    else setMuted(true)
    wake()
  }
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
    if (audioGraph.current) void audioGraph.current.context.resume()
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
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    if (video?.webkitEnterFullscreen) {
      try { video.webkitEnterFullscreen(); return } catch { /* Full-window fallback. */ }
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
          if (event.key === 'm') toggleMute()
        }}>
        <input ref={inputRef} type="file" hidden multiple aria-label="Choose video files"
          accept="video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi"
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? [])
            event.target.value = ''
            if (!selected.length) return
            const valid = selected.filter((f) => f.size > 0 && (f.type.startsWith('video/') || /\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(f.name)))
            const additions = valid.filter((f) => !entries.some((entry) => entry.file.name === f.name && entry.file.size === f.size && entry.file.lastModified === f.lastModified))
              .map((f) => ({ id: nextId.current = Math.max(Date.now(), nextId.current + 1), file: f }))
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
                const saved = useVideoSession.getState().progress[activeId!]
                if (saved && Number.isFinite(video.duration)) { video.currentTime = saved.time >= video.duration ? 0 : Math.min(saved.time, video.duration); setTime(video.currentTime) }
                video.playbackRate = rate
                if (supportsVolume) video.volume = volume
                if (autoplay.current) { autoplay.current = false; play() }
              }}
              onDurationChange={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
              onTimeUpdate={(e) => { setTime(e.currentTarget.currentTime); if (activeId !== null && e.currentTarget.readyState >= 1) saveProgress(activeId, e.currentTarget.currentTime) }}
              onPlay={() => { handoff(); setPlaying(true); setError(null) }} onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false)
                if (activeId !== null) saveProgress(activeId, duration, true)
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
              </div>
              <div className="video-bottom-controls">
                <VideoSeek key={activeId} file={file} time={time} duration={duration} seek={seek} onScrubbing={setScrubbing} />
                <div className="video-transport">
                  <button className="video-control" onClick={() => navigate(-1)} disabled={activeIndex <= 0} aria-label="Previous video"><PrevIcon /></button>
                  <button className="video-control" onClick={() => seek(time - 10)} aria-label="Rewind video 10 seconds"><Rewind10Icon /></button>
                  <button className="video-control video-control--play" onClick={togglePlay} aria-label={playing ? 'Pause video' : 'Play video'}>{playing ? <PauseIcon /> : <PlayIcon />}</button>
                  <button className="video-control" onClick={() => seek(time + 10)} aria-label="Forward video 10 seconds"><Forward10Icon /></button>
                  <button className="video-control" onClick={() => navigate(1)} disabled={activeIndex >= entries.length - 1} aria-label="Next video"><NextIcon /></button>
                  <button className="video-control" aria-label={`Repeat video: ${repeat}`} aria-pressed={repeat !== 'off'} onClick={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}>Repeat: {repeat}</button>
                  <label className="video-speed"><span className="sr-only">Playback speed</span><select aria-label="Playback speed" value={rate} onChange={(e) => { const v = Number(e.target.value); setRate(v); if (videoRef.current) videoRef.current.playbackRate = v }}>{[0.5,0.75,1,1.25,1.5,2].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
                  <div className="video-right-controls">
                    <button className={`video-control${muted || volume === 0 ? ' video-control--muted' : ''}`} aria-label={muted || volume === 0 ? 'Unmute video' : 'Mute video'} aria-pressed={muted || volume === 0} onClick={toggleMute}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H3v6h3l5 4Z" /><path d={muted || volume === 0 ? "M16 9l6 6m0-6-6 6" : "M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"} /></svg></button>
                    <label className="video-volume-control"><input className="video-volume" style={{ "--volume-fill": `${(muted ? 0 : volume) * 100}%` } as CSSProperties} aria-label="Video volume" type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} onChange={(e) => changeVolume(Number(e.target.value))} /></label>
                    <button className="video-control" onClick={() => void fullscreen()} aria-label={expanded ? 'Exit fullscreen' : 'Enter fullscreen'}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={expanded ? 'M4 9h5V4m6 0v5h5M4 15h5v5m6 0v-5h5' : 'M9 4H4v5m11-5h5v5M4 15v5h5m6 0h5v-5'} /></svg></button>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="video-empty"><VideoIcon width={56} height={56} /><h2>Your videos, right here</h2><p>Choose videos from this device or a connected drive to build a playlist.</p><button className="btn" onClick={() => inputRef.current?.click()}>Choose videos</button></div>
        )}
        {queueOpen && file && <aside className="video-queue" aria-label="Video playlist"><div className="video-queue-heading"><h2>Playlist</h2><button className="video-control" onClick={() => setQueueOpen(false)} aria-label="Close playlist"><XIcon /></button></div>
          <button className="btn" onClick={() => inputRef.current?.click()}><PlusIcon /> Add videos</button>
          <ol>{entries.map((entry, i) => <li key={entry.id} className={`${entry.id === activeId ? 'is-active' : ''}${progress[entry.id]?.completed ? ' is-watched' : ''}`}><button onClick={() => select(entry.id)} aria-current={entry.id === activeId ? 'true' : undefined}><span>{i + 1}</span><span>{entry.file.name}{progress[entry.id]?.completed && <small className="video-watched-label">✓ Watched</small>}</span></button><button className="video-control" onClick={() => remove(entry.id)} aria-label={`Remove ${entry.file.name}`}><XIcon width={18} height={18} /></button></li>)}</ol>
        </aside>}
        {(error || storageError) && <p className="video-error" role="alert">{error || storageError}</p>}
      </div>
      {file && <div className="video-details"><div><h2>{file.name}</h2><p>{activeIndex + 1} of {entries.length} · {(file.size / 1024 / 1024).toFixed(1)} MB</p></div><button className="btn" onClick={() => { setQueueOpen(!queueOpen); wake() }}>Show playlist</button></div>}
      <p className="video-note">Videos are saved on this device for next time. Your playlist, watched videos and playback positions are remembered. Clearing browser data removes saved videos. During playback, controls hide automatically; move the pointer or tap the video to show them.</p>
    </main>
  )
}
