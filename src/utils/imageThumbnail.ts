/**
 * Best-effort downscaled copy of a cover image for library tiles, so tiles
 * never have to decode a full-resolution original just to render an 80px
 * thumbnail. Optional: callers should treat failure as "no thumbnail" and
 * fall back to the original cover, not as a hard error.
 */
export async function createImageThumbnail(source: Blob, maxDimension = 320): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    throw new Error('Thumbnail generation unsupported in this environment')
  }
  const bitmap = await createImageBitmap(source)
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob failed'))),
        'image/webp',
        0.82,
      )
    })
  } finally {
    bitmap.close?.()
  }
}
