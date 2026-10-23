// Core
import { useEffect, useMemo, useRef, useState } from 'react'
// Components
import { BookIcon, PlusIcon, TrashIcon } from '@/components/Icons'
// Services
import { db } from '@/services/db'
import { BOOK_ACCEPT, importBook, listBooks, removeBook } from '@/reader/readerRepository/readerRepository'
// Types
import type { ReaderBook } from '@/reader/types'
// Styles
import './ReaderLibrary.css'

function BookCard({ book, open, remove }: { book: ReaderBook; open: () => void; remove: () => void }) {
  const [cover, setCover] = useState<string>()
  const [confirm, setConfirm] = useState(false)
  const element = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!book.hasCover) return
    let cancelled = false
    let url: string | undefined
    const load = async () => {
      const record = await db.readerCovers.get(book.id).catch(() => undefined)
      if (!record || cancelled) return
      url = URL.createObjectURL(record.blob); setCover(url)
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer?.disconnect(); void load() }
    }, { rootMargin: '240px' })
    if (observer && element.current) observer.observe(element.current)
    else void load()
    return () => { cancelled = true; observer?.disconnect(); if (url) URL.revokeObjectURL(url) }
  }, [book.id, book.hasCover])
  return <article className="reader-card" ref={element}>
    <button className="reader-card__open" onClick={open} aria-label={`Read ${book.title}`}>
      <div className={`reader-card__cover${cover ? '' : ' reader-card__cover--text'}`}>
        {cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : <><BookIcon width={28} height={28} /><span>{book.title}</span><small>{book.format.toUpperCase()}</small></>}
      </div>
      <h2 title={book.title}>{book.title}</h2>
      {book.author && <p className="reader-card__author">{book.author}</p>}
      <div className="reader-card__status"><span>{book.format === 'image' ? 'Image' : book.format.toUpperCase()}</span><span>{book.lastReadAt ? `${Math.round(book.progress * 100)}% read` : 'Not started'}</span></div>
      <progress max={1} value={book.progress} aria-label={`${book.title} reading progress`} />
    </button>
    {confirm ? <div className="reader-card__confirm"><p>Remove this local copy?</p><button className="btn danger" onClick={remove}>Remove</button><button className="btn" onClick={() => setConfirm(false)}>Keep</button></div> : <button className="reader-card__remove" aria-label={`Remove ${book.title}`} onClick={() => setConfirm(true)}><TrashIcon width={16} height={16} /></button>}
  </article>
}

export default function ReaderLibrary({ onOpen }: { onOpen: (id: string) => void }) {
  const [books, setBooks] = useState<ReaderBook[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('recent')
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController>()
  useEffect(() => {
    let current = true
    void listBooks().then((items) => { if (current) { setBooks(items); setLoading(false) } }).catch(() => { if (current) { setLoading(false); setError('Books could not be loaded. Check device storage and reopen Reader.') } })
    return () => { current = false; controller.current?.abort() }
  }, [])
  const visible = useMemo(() => books.filter((book) => `${book.title} ${book.author ?? ''} ${book.fileName}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (filter === 'all' || (filter === 'reading' ? !!book.lastReadAt && book.progress < 1 : !book.lastReadAt)))
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'added' ? b.addedAt - a.addedAt : (b.lastReadAt ?? b.addedAt) - (a.lastReadAt ?? a.addedAt)), [books, query, sort, filter])
  const add = async (files: File[]) => {
    if (!files.length || importing || loading) return
    const current = new AbortController(); controller.current = current
    setError(''); setNotice(''); setImporting({ done: 0, total: files.length })
    const failures: string[] = []; let added = 0; let duplicates = 0
    try {
      for (let index = 0; index < files.length; index++) {
        if (current.signal.aborted) break
        try {
          const result = await importBook(files[index], current.signal)
          if (result.duplicate) duplicates++
          else { added++; setBooks((items) => [result.book, ...items]) }
        } catch (failure) {
          if (current.signal.aborted) break
          const reason = failure instanceof Error ? failure.message : 'Could not save this file. Check free storage.'
          failures.push(`${files[index].name}: ${reason}`)
        }
        if (!current.signal.aborted) setImporting({ done: index + 1, total: files.length })
      }
      setNotice(`${added} ${added === 1 ? 'book' : 'books'} added${duplicates ? ` · ${duplicates} already in your library` : ''}${current.signal.aborted ? ' · Import stopped' : ''}.`)
      if (failures.length) setError(failures.slice(0, 5).join('\n'))
    } finally { setImporting(null) }
  }
  return <main className="reader-library">
    <header className="topbar"><div className="reader-library__title"><h1>Reader</h1><p>{books.length ? `${books.length} ${books.length === 1 ? 'book' : 'books'} on this device` : 'Your books, always within reach'}</p></div><button className="btn primary" disabled={!!importing || loading} onClick={() => input.current?.click()}><PlusIcon width={18} height={18} />Add books</button></header>
    <input ref={input} type="file" multiple hidden accept={BOOK_ACCEPT} aria-label="Choose books" onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void add(files) }} />
    {books.length > 0 && <div className="reader-library__tools"><input type="search" aria-label="Search library" placeholder="Search title or author" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Filter books" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All books</option><option value="reading">In progress</option><option value="new">Not started</option></select><select aria-label="Sort books" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Recently opened</option><option value="added">Recently added</option><option value="title">Title A–Z</option></select></div>}
    {importing && <div className="reader-import" role="status"><span>Adding books · {importing.done} / {importing.total}</span><progress value={importing.done} max={importing.total} /><button className="btn" onClick={() => controller.current?.abort()}>Stop import</button></div>}
    {error && <p className="reader-message reader-message--error" role="alert">{error}</p>}
    {notice && <p className="reader-message" role="status">{notice}</p>}
    {loading ? <p role="status">Loading books…</p> : books.length === 0 ? <div className="reader-library__empty"><BookIcon width={48} height={48} /><h2>A place for every book</h2><p>Add books and documents to read offline. Your place and bookmarks stay saved on this device.</p><p className="reader-library__formats">PDF · EPUB · FB2 · TXT · Markdown · HTML · DOCX · Images</p><button className="btn" disabled={!!importing || loading} onClick={() => input.current?.click()}>Choose your first book</button></div> : visible.length === 0 ? <p className="reader-library__empty">No books match. Try another title or filter.</p> : <div className="reader-library__grid">{visible.map((book) => <BookCard key={book.id} book={book} open={() => onOpen(book.id)} remove={() => { void removeBook(book.id).then(() => setBooks((items) => items.filter((item) => item.id !== book.id))).catch(() => setError('This book could not be removed. Check device storage and try again.')) }} />)}</div>}
  </main>
}
