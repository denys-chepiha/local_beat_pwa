// Core
import { useEffect, useState } from 'react'
// Store
import { useAudiobookStore } from '@/store/useAudiobookStore'

/**
 * Lazily resolves a cover/thumbnail Blob to an object URL, only while the
 * consuming component is mounted. Nothing is decoded until this hook runs —
 * library tiles never eagerly load every book's artwork up front.
 */
export function useAudiobookCoverUrl(blobId: string | undefined): string | null {
  const getBlob = useAudiobookStore((s) => s.getBlob)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blobId) {
      setUrl(null)
      return
    }
    setUrl(null)
    let objectUrl: string | null = null
    let cancelled = false
    void getBlob(blobId).then((record) => {
      if (cancelled || !record) return
      objectUrl = URL.createObjectURL(record.blob)
      setUrl(objectUrl)
    }).catch(() => { if (!cancelled) setUrl(null) })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [blobId, getBlob])

  return url
}
