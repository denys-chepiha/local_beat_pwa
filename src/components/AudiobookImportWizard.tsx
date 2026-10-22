// Core
import { useEffect, useMemo, useRef, useState } from 'react'
// Components
import { BookIcon, FolderPlusIcon, ImageIcon, PlusIcon, TrashIcon, XIcon } from '@/components/Icons'
// Services
import { estimateDeviceStorage } from '@/services/db'
// Store
import { AudiobookImportError, useAudiobookStore } from '@/store/useAudiobookStore'
import { useUiStore } from '@/store/useUiStore'
// Types
import type { Audiobook } from '@/types'
// Utils
import { computeAudiobookFingerprint } from '@/utils/audiobookFingerprint'
import { buildImportCandidate, supportsDirectoryPicker } from '@/utils/audiobookFiles'
import type { ChapterCandidate } from '@/utils/audiobookFiles'
import { readAudioDuration } from '@/utils/audioFile'
import { formatBytes, formatTotalDuration } from '@/utils/format'

interface Props {
  onClose: () => void
}

interface EditableChapter extends ChapterCandidate {
  key: string
  duration: number | null
}

type Step = 'source' | 'preview' | 'importing' | 'error'

function useObjectUrl(file: File | undefined | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) {
      setUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])
  return url
}

function useObjectUrls(files: File[]): string[] {
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    const next = files.map((f) => URL.createObjectURL(f))
    setUrls(next)
    return () => next.forEach((u) => URL.revokeObjectURL(u))
  }, [files])
  return urls
}

export default function AudiobookImportWizard({ onClose }: Props) {
  const importBook = useAudiobookStore((s) => s.importBook)
  const findDuplicate = useAudiobookStore((s) => s.findDuplicate)
  const importProgress = useAudiobookStore((s) => s.importProgress)
  const showToast = useUiStore((s) => s.showToast)

  const [step, setStep] = useState<Step>('source')
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [chapters, setChapters] = useState<EditableChapter[]>([])
  const [coverCandidates, setCoverCandidates] = useState<File[]>([])
  const [coverIndex, setCoverIndex] = useState<number | null>(null)
  const [customCover, setCustomCover] = useState<File | null>(null)
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [storageWarning, setStorageWarning] = useState<string | null>(null)
  const [duplicateOf, setDuplicateOf] = useState<Audiobook | null>(null)
  const [fingerprint, setFingerprint] = useState('')

  const dirInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const readTokenRef = useRef(0)

  const dirSupported = useMemo(() => supportsDirectoryPicker(), [])

  useEffect(() => {
    if (dirInputRef.current) {
      dirInputRef.current.setAttribute('webkitdirectory', '')
      dirInputRef.current.setAttribute('directory', '')
    }
  }, [])

  const coverFile = customCover ?? (coverIndex != null ? coverCandidates[coverIndex] : undefined)
  const coverPreviewUrl = useObjectUrl(coverFile)
  const coverCandidateUrls = useObjectUrls(coverCandidates)

  const totalSize = chapters.reduce((sum, c) => sum + c.file.size, 0)
  const totalDuration = chapters.reduce((sum, c) => sum + (c.duration ?? 0), 0)
  const readingDurations = chapters.some((c) => c.duration == null)

  const readDurations = async (list: EditableChapter[]) => {
    const token = ++readTokenRef.current
    for (const item of list) {
      const duration = await readAudioDuration(item.file)
      if (readTokenRef.current !== token) return // superseded by a newer selection
      setChapters((prev) => prev.map((c) => (c.key === item.key ? { ...c, duration } : c)))
    }
  }

  const checkStorage = async (bytes: number) => {
    const estimate = await estimateDeviceStorage()
    if (!estimate) {
      setStorageWarning(null)
      return
    }
    const available = estimate.quota - estimate.usage
    if (available < bytes) {
      setStorageWarning(
        `This book is about ${formatBytes(bytes)}, but only ${formatBytes(Math.max(0, available))} appears free on this device. Import may fail if storage runs out.`,
      )
    } else {
      setStorageWarning(null)
    }
  }

  const loadFiles = (files: File[], manualTitle?: string) => {
    const candidate = buildImportCandidate(files, manualTitle)
    if (candidate.chapters.length === 0) {
      setError('No supported audio files were found in your selection.')
      setStep('error')
      return
    }
    const editable: EditableChapter[] = candidate.chapters.map((c, i) => ({
      ...c,
      key: `${i}-${c.file.name}-${c.file.size}`,
      duration: null,
    }))
    setTitle(candidate.suggestedTitle)
    setAuthor('')
    setChapters(editable)
    setCoverCandidates(candidate.coverCandidates)
    setCoverIndex(candidate.coverCandidates.length > 0 ? 0 : null)
    setCustomCover(null)
    setSkipped(candidate.skipped)
    setStep('preview')

    setFingerprint(
      computeAudiobookFingerprint(
        candidate.suggestedTitle,
        candidate.chapters.map((c) => ({
          relativePath: c.relativePath,
          size: c.file.size,
          lastModified: c.file.lastModified,
        })),
      ),
    )

    void checkStorage(files.reduce((s, f) => s + f.size, 0))
    void readDurations(editable)
  }

  const handleDirSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    loadFiles(Array.from(fileList))
    if (dirInputRef.current) dirInputRef.current.value = ''
  }

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    loadFiles(Array.from(fileList))
    if (filesInputRef.current) filesInputRef.current.value = ''
  }

  const handleCoverSelected = (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) return
    setCustomCover(file)
    setCoverIndex(null)
    if (coverInputRef.current) coverInputRef.current.value = ''
  }

  const moveChapter = (index: number, dir: -1 | 1) => {
    setChapters((prev) => {
      const target = index + dir
      if (target < 0 || target >= prev.length) return prev
      const next = prev.slice()
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const removeChapter = (key: string) => setChapters((prev) => prev.filter((c) => c.key !== key))
  const renameChapter = (key: string, newTitle: string) =>
    setChapters((prev) => prev.map((c) => (c.key === key ? { ...c, title: newTitle } : c)))

  const runImport = async (replaceBookId?: string) => {
    setStep('importing')
    setError(null)
    try {
      await importBook({
        title: title.trim() || 'Untitled Audiobook',
        author: author.trim() || undefined,
        cover: coverFile,
        chapters: chapters.map((c) => ({
          file: c.file,
          title: c.title.trim() || c.file.name,
          relativePath: c.relativePath,
          duration: c.duration ?? 0,
        })),
        fingerprint,
        replaceBookId,
      })
      showToast('Audiobook added')
      onClose()
    } catch (err) {
      const message =
        err instanceof AudiobookImportError ? err.message : 'Something went wrong saving this audiobook.'
      setError(message)
      setStep('error')
    }
  }

  const handleSaveClick = () => {
    if (chapters.length === 0) return
    const dup = findDuplicate(fingerprint)
    if (dup) {
      setDuplicateOf(dup)
      return
    }
    void runImport()
  }

  return (
    <div className="full-player import-wizard">
      <div className="full-top">
        <button className="icon-btn ghost" onClick={onClose} aria-label="Close">
          <XIcon />
        </button>
        <div className="label">Add Audio Book</div>
        <span style={{ width: 42 }} />
      </div>

      <div className="import-scroll">
        {step === 'source' && (
          <div className="import-source">
            <p className="hint">
              Create a folder on your device with the book's chapter files (and optionally a cover
              image), then add it here. Everything stays on this device.
            </p>
            {dirSupported ? (
              <button className="btn primary block" onClick={() => dirInputRef.current?.click()}>
                <FolderPlusIcon width={18} height={18} /> Choose a folder
              </button>
            ) : (
              <div className="notice">
                Folder selection isn't available on this device — pick the chapter files instead.
              </div>
            )}
            <button className="btn block" onClick={() => filesInputRef.current?.click()}>
              <PlusIcon width={18} height={18} />
              {dirSupported ? 'Or choose files instead' : 'Choose audio files'}
            </button>

            <input
              ref={dirInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => handleDirSelected(e.target.files)}
            />
            <input
              ref={filesInputRef}
              type="file"
              accept="audio/*,.mp3,.m4a,.m4b,.aac,.wav,.ogg,.oga,.opus,.flac"
              multiple
              hidden
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
          </div>
        )}

        {step === 'preview' && (
          <div className="import-preview">
            <div className="import-cover-row">
              <div className="import-cover">
                {coverPreviewUrl ? <img src={coverPreviewUrl} alt="" /> : <BookIcon width={32} height={32} />}
              </div>
              <div className="import-cover-actions">
                {coverCandidates.length > 1 && (
                  <div className="cover-candidates">
                    {coverCandidates.map((f, i) => (
                      <button
                        key={f.name + i}
                        type="button"
                        className={`cover-thumb${!customCover && coverIndex === i ? ' active' : ''}`}
                        onClick={() => {
                          setCoverIndex(i)
                          setCustomCover(null)
                        }}
                      >
                        {coverCandidateUrls[i] && <img src={coverCandidateUrls[i]} alt={f.name} />}
                      </button>
                    ))}
                  </div>
                )}
                <button className="btn" onClick={() => coverInputRef.current?.click()}>
                  <ImageIcon width={16} height={16} /> Choose cover
                </button>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handleCoverSelected(e.target.files)}
                />
              </div>
            </div>

            <label className="field">
              <span>Title</span>
              <input type="text" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="field">
              <span>Author</span>
              <input
                type="text"
                value={author}
                maxLength={120}
                placeholder="Optional"
                onChange={(e) => setAuthor(e.target.value)}
              />
            </label>

            <div className="import-stats">
              {chapters.length} chapter{chapters.length === 1 ? '' : 's'} · {formatBytes(totalSize)}
              {!readingDurations && totalDuration > 0 && ` · ${formatTotalDuration(totalDuration)}`}
              {readingDurations && ' · reading chapter lengths…'}
            </div>

            {storageWarning && <div className="notice">{storageWarning}</div>}
            {skipped.length > 0 && (
              <div className="notice">
                Skipped {skipped.length} unsupported file{skipped.length === 1 ? '' : 's'}.
              </div>
            )}

            <div className="section-title">Chapters</div>
            <div className="chapter-edit-list">
              {chapters.map((c, i) => (
                <div key={c.key} className="chapter-edit-row">
                  <span className="index">{i + 1}</span>
                  <input type="text" value={c.title} onChange={(e) => renameChapter(c.key, e.target.value)} />
                  <span className="dur">{c.duration != null ? formatTotalDuration(c.duration) : '…'}</span>
                  <button type="button" onClick={() => moveChapter(i, -1)} disabled={i === 0} aria-label="Move up">
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveChapter(i, 1)}
                    disabled={i === chapters.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => removeChapter(c.key)} aria-label="Remove chapter">
                    <TrashIcon width={16} height={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="import-progress-screen">
            <div className="empty-icon spin" style={{ borderRadius: '50%' }} />
            <p>
              Importing book…
              <br />
              {importProgress ? `${importProgress.done} of ${importProgress.total} files` : 'Preparing…'}
            </p>
          </div>
        )}

        {step === 'error' && (
          <div className="import-progress-screen">
            <h2>Import failed</h2>
            <p>{error}</p>
            <button className="btn primary" onClick={() => setStep('preview')}>
              Back
            </button>
          </div>
        )}
      </div>

      {step === 'preview' && (
        <div className="import-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={handleSaveClick}
            disabled={readingDurations || chapters.length === 0}
          >
            Save
          </button>
        </div>
      )}

      {duplicateOf && (
        <div className="modal-backdrop" onClick={() => setDuplicateOf(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Looks like a duplicate</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.5 }}>
              "{duplicateOf.title}" already appears to be in your library.
            </p>
            <div className="actions" style={{ flexDirection: 'column' }}>
              <button className="btn" onClick={() => setDuplicateOf(null)}>
                Cancel
              </button>
              <button
                className="btn"
                onClick={() => {
                  const dupId = duplicateOf.id
                  setDuplicateOf(null)
                  void runImport(dupId)
                }}
              >
                Replace existing book
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setDuplicateOf(null)
                  void runImport()
                }}
              >
                Add as a separate copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
