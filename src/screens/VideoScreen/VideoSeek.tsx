import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { formatTime } from '@/utils/format'

export default function VideoSeek({ file, time, duration, seek, onScrubbing }: {
  file: File; time: number; duration: number; seek: (time: number) => void; onScrubbing: (active: boolean) => void
}) {
  const [preview, setPreview] = useState(false)
  const [target, setTarget] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const decoder = useRef<HTMLVideoElement | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const desired = useRef(time)
  const held = useRef(false)
  const position = target ?? time
  const progress = duration > 0 ? Math.max(0, Math.min(100, position / duration * 100)) : 0
  const cancel = () => { clearTimeout(timer.current); held.current = false; setPreview(false); setTarget(null); onScrubbing(false) }
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!preview) return
    const video = document.createElement('video')
    decoder.current = video
    video.muted = true; video.playsInline = true; video.preload = 'auto'
    const url = URL.createObjectURL(file)
    const update = () => {
      if (!video.seeking && video.readyState >= 1) video.currentTime = Math.min(desired.current, Math.max(0, video.duration - 0.05))
    }
    video.onloadedmetadata = update
    video.onseeked = () => {
      if (Math.abs(video.currentTime - desired.current) > 0.15 && desired.current < video.duration - 0.05) { update(); return }
      const surface = canvas.current
      if (surface && video.videoWidth) {
        surface.width = 160; surface.height = Math.round(160 * video.videoHeight / video.videoWidth)
        surface.getContext('2d')?.drawImage(video, 0, 0, surface.width, surface.height)
      }
    }
    video.src = url; video.load()
    return () => { video.onloadedmetadata = null; video.onseeked = null; video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); decoder.current = null }
  }, [preview, file])
  useEffect(() => {
    desired.current = position
    const video = decoder.current
    if (video && video.readyState >= 1 && !video.seeking) video.currentTime = Math.min(position, Math.max(0, video.duration - 0.05))
  }, [position])
  return <div className="video-timeline"><span>{formatTime(position)}</span><div className="video-seek-wrap">
    {preview && <div className="video-seek-preview" role="status" aria-label="Video preview" style={{ left: `clamp(80px, ${duration ? position / duration * 100 : 0}%, calc(100% - 80px))` }}><canvas ref={canvas} /><span>{formatTime(position)}</span></div>}
    <input style={{ "--seek-fill": `${progress}%` } as CSSProperties} aria-label="Seek video" type="range" min={0} max={duration} step={0.1} value={Math.min(position, duration)} disabled={duration <= 0}
      onPointerDown={(e) => { held.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); onScrubbing(true); timer.current = setTimeout(() => setPreview(true), 1000) }}
      onChange={(e) => { const next = Number(e.target.value); if (held.current) setTarget(next); else seek(next) }}
      onPointerUp={(e) => { seek(Number(e.currentTarget.value)); cancel() }} onPointerCancel={cancel} onLostPointerCapture={cancel} onBlur={cancel} />
    </div><span>{formatTime(duration)}</span></div>
}
