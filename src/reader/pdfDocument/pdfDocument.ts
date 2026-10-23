// Core
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
// Types
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'

GlobalWorkerOptions.workerSrc = workerUrl

export function loadPdf(blob: Blob, signal?: AbortSignal, password?: (submit: (value: string) => void, incorrect: boolean) => void): { promise: Promise<PDFDocumentProxy>; destroy: () => Promise<void> } {
  let task: PDFDocumentLoadingTask | undefined
  let closed = false
  const destroy = async () => { closed = true; signal?.removeEventListener('abort', abort); await task?.destroy() }
  const abort = () => { void destroy() }
  signal?.addEventListener('abort', abort, { once: true })
  const promise = (async () => {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    if (closed || signal?.aborted) throw new DOMException('Reading cancelled', 'AbortError')
    task = getDocument({
      data: bytes, enableXfa: false, useWasm: false,
      cMapUrl: '/pdf-assets/cmaps/', cMapPacked: true,
      standardFontDataUrl: '/pdf-assets/standard_fonts/', wasmUrl: '/pdf-assets/wasm/',
      useSystemFonts: true, maxImageSize: 32_000_000, canvasMaxAreaInBytes: 32_000_000,
    })
    if (password) task.onPassword = (submit: (value: string) => void, reason: number) => password(submit, reason === 2)
    const pdf = await task.promise
    if (pdf.numPages > 5000) { await destroy(); throw new Error('This PDF exceeds the 5,000-page reading limit.') }
    return pdf
  })()
  return { promise, destroy }
}

export async function inspectPdf(blob: Blob, signal?: AbortSignal): Promise<{ title?: string; author?: string; totalPages: number; cover?: Blob }> {
  const task = loadPdf(blob, signal)
  try {
    const pdf = await task.promise
    const metadata = await pdf.getMetadata().catch(() => null)
    const info = metadata?.info as { Title?: unknown; Author?: unknown } | undefined
    const first = await pdf.getPage(1)
    const viewport = first.getViewport({ scale: 1 })
    const scaled = first.getViewport({ scale: 320 / Math.max(viewport.width, viewport.height) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(scaled.width); canvas.height = Math.ceil(scaled.height)
    const rendering = first.render({ canvas, viewport: scaled })
    const cancel = () => rendering.cancel()
    signal?.addEventListener('abort', cancel, { once: true })
    let cover: Blob | undefined
    try {
      await rendering.promise
      cover = await new Promise<Blob | undefined>((resolve) => canvas.toBlob((value) => resolve(value ?? undefined), 'image/webp', 0.82))
    } finally { signal?.removeEventListener('abort', cancel); canvas.width = 0; canvas.height = 0 }
    return { title: typeof info?.Title === 'string' ? info.Title.trim() || undefined : undefined, author: typeof info?.Author === 'string' ? info.Author.trim() || undefined : undefined, totalPages: pdf.numPages, cover }
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') return { totalPages: 0 }
    throw error
  } finally { await task.destroy() }
}
