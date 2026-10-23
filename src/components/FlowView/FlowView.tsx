// Core
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
// Services
import { createFlowChannel, createFlowClient, createFlowSource, prepareFlowResources } from './flowBridge/flowBridge'
// Types
import type { ParsedDocument } from '@/reader/parseDocument/parseDocument'
import type { ReaderLocation, ReaderOutline, ReaderViewHandle, ReadingPreferences } from '@/reader/types'
// Styles
import './FlowView.css'

type Props = { blob: Blob; fileName: string; initialProgress: number; preferences: ReadingPreferences; onFontSize?: (size: number) => void; onLocation: (location: ReaderLocation) => void; onOutline: (outline: ReaderOutline[]) => void }
type PreparedDocument = { html: string; resources: Blob[]; channel: string; nonce: string; progress: number }
const FRAME_CSS = `*{box-sizing:border-box}html{overflow:hidden}html,body{margin:0;height:100%;background:var(--paper,#fff);color:var(--ink,#25232b)}body{touch-action:pan-y;overflow:hidden;font-family:Georgia,serif;font-size:18px;line-height:1.65}#reader-scroll{height:100%;padding:24px 28px;overflow:hidden}#reader-content{overflow-wrap:anywhere;hyphens:auto}p,ul,ol,blockquote,pre,table,figure{margin:0 0 1em}h1,h2,h3,h4,h5,h6{line-height:1.25;break-after:avoid;margin:1.4em 0 .6em}h1:first-child,h2:first-child{margin-top:0}img{max-width:100%;max-height:75vh;object-fit:contain;break-inside:avoid}table{border-collapse:collapse;max-width:100%;font-size:.9em}td,th{border:1px solid currentColor;padding:.35em}pre{white-space:pre-wrap}a{color:inherit;text-decoration:underline;text-underline-offset:.16em}blockquote{padding-inline:1em;font-style:italic}hr{border:0;border-top:1px solid currentColor;opacity:.2;margin:1.5em 0}mark{background:#f2d05e;color:#242020}::selection{background:#b6a1ff;color:#17121e}body{scrollbar-color:#8b8398 transparent}a:focus-visible{outline:2px solid #7c5cff;outline-offset:3px}`

export default forwardRef<ReaderViewHandle, Props>(function FlowView({ blob, fileName, initialProgress, preferences, onFontSize, onLocation, onOutline }, ref) {
  const [prepared, setPrepared] = useState<PreparedDocument>()
  const [error, setError] = useState('')
  const frame = useRef<HTMLIFrameElement>(null)
  const client = useRef<ReturnType<typeof createFlowClient>>()
  const current = useRef({ onFontSize, onLocation, onOutline, preferences, initialProgress })
  current.current = { onFontSize, onLocation, onOutline, preferences, initialProgress }
  useEffect(() => {
    const controller = new AbortController()
    let loaded: ParsedDocument | undefined
    const progress = current.current.initialProgress
    setError(''); setPrepared(undefined)
    void import('@/reader/parseDocument/parseDocument').then(({ parseDocument }) => parseDocument(blob, fileName, controller.signal)).then((value) => {
      loaded = value
      if (controller.signal.aborted) { value.dispose(); loaded = undefined; return }
      const resources = prepareFlowResources(value.html, value.resources)
      if (controller.signal.aborted) return
      setPrepared({ ...resources, progress, channel: createFlowChannel(), nonce: createFlowChannel() })
      current.current.onOutline(value.outline)
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'This document could not be opened.') })
    return () => { controller.abort(); loaded?.dispose() }
  }, [blob, fileName])
  const source = useMemo(() => prepared ? createFlowSource(prepared.html, FRAME_CSS, prepared.channel, prepared.nonce) : '', [prepared])
  useEffect(() => {
    const iframe = frame.current
    if (error || !prepared || !iframe?.contentWindow) return
    const timeout = setTimeout(() => setError('This document could not be displayed. Close it and try again.'), 10_000)
    const connection = createFlowClient(iframe.contentWindow, prepared.channel, {
      preferences: current.current.preferences, progress: prepared.progress, resources: prepared.resources,
      onLocation: (location) => { clearTimeout(timeout); current.current.onLocation(location) },
      onFontSize: (size) => current.current.onFontSize?.(size),
      onEscape: () => iframe.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
      onError: setError,
    })
    client.current = connection
    window.addEventListener('message', connection.receive)
    connection.hello()
    return () => {
      clearTimeout(timeout); window.removeEventListener('message', connection.receive); connection.dispose()
      if (client.current === connection) client.current = undefined
    }
  }, [prepared, error])
  useEffect(() => { client.current?.preferences(preferences) }, [preferences])
  useImperativeHandle(ref, () => ({
    goToPage: (page) => client.current?.page(page),
    goToProgress: (progress) => client.current?.progress(progress),
    goToOutline: (id) => client.current?.outline(id),
    goToMatch: (match) => { if (match.id) client.current?.outline(match.id) },
    search: (query) => client.current?.search(query) ?? Promise.resolve([]),
  }), [])
  if (error) return <p className="reader-message reader-message--error" role="alert">{error}</p>
  if (!prepared) return <p className="reader-message" role="status">Opening document…</p>
  return <iframe ref={frame} className="reader-flow" title={`Pages of ${fileName}`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={source} data-reader-channel={prepared.channel} onLoad={() => client.current?.hello()} />
})
