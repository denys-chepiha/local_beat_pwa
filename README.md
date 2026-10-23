# Local Beat — Offline Media and Reader

A personal, offline-first PWA for music, audiobooks, video and reading. No subscriptions,
no ads, no accounts, no servers. Add your own local files, keep them on your device,
and listen, watch or read — even without internet.

## How it works

- **Your files only.** Add audio from your device with the system file picker. Nothing
  is downloaded from the internet and no music service is touched.
- **Stored locally.** Audio files, cover art, playlists and player state live in
  **IndexedDB** (via Dexie). The Cache API / service worker only stores the app shell
  (HTML/CSS/JS/icons) — never the audio.
- **Works offline.** After the first visit the app is installable and runs without a
  network connection.

## Features

- Create / rename / delete unlimited playlists (auto-saved)
- Add multiple local files at once — `mp3, m4a, aac, wav, ogg, flac, opus`
- Metadata extraction (title / artist / album / cover art) with filename fallback
- Per-track duration, file size and storage stats
- Reorder and remove tracks
- Full playback engine: play / pause, next / previous, auto-advance, seek, volume
- Shuffle (non-repeating temporary queue) and repeat one / all / off
- "Shuffle All" across the whole library, and "Continue listening" from the last position
- Mini-player + full-screen player
- **Media Session API** — lock screen / Control Center / headphone controls
- Persisted player state (last playlist, track, position, volume, shuffle, repeat)
- PWA: manifest, service worker, icons, offline app shell

## Tech stack

React · TypeScript · Vite · Zustand · Dexie (IndexedDB) · vite-plugin-pwa ·
HTMLAudioElement · Media Session API · File API

## Develop

Use Node.js 22.13 or newer and pnpm.

```bash
pnpm install
pnpm dev      # local dev server
pnpm build    # production build -> dist/
pnpm preview  # serve the production build
```

## Deploy (Vercel)

The repo includes `vercel.json`. Import the project in Vercel (or run `vercel`) — it
builds with `pnpm build` and serves `dist/`.

## Video and tablets

The shared Music / Audio Books / Reader / Video menu is available throughout the app. Add multiple local videos to a persistent playlist, including files from external drives visible in the system picker. Files are saved locally in IndexedDB and never uploaded. The playlist, active video, playback position and watched markers survive navigation and reloads. Saving requires enough device storage; errors are shown in the player. Clearing site data removes these copies.

On phones (including landscape), the video keeps its own unobstructed area. A compact panel below it contains the yellow timeline, play/pause, playlist, settings and fullscreen controls. Double-tap the left/right half of the picture to seek ten seconds. Speed, repeat and the thin mute/volume slider are in settings. The playlist opens below the panel with a scrollable list, add/remove actions and watched markers; selecting a video closes it. Settings and the playlist open one at a time, and Escape dismisses either panel.

Desktop controls also include previous/next and ±10-second buttons. Hold the timeline for one second to see a frame preview; release to seek. Completed videos are marked in the playlist. Inline phone controls stay visible. In fullscreen and desktop playback, controls disappear after 2.5 seconds; move the mouse, tap the picture or use the keyboard to reveal them. The first reveal tap does not pause playback. Fullscreen keeps the controls and playlist available; on phones they remain below the picture. A full-window fallback is used when container fullscreen is unavailable, including iPhone Safari, so the app playlist stays accessible. On iOS, volume uses Web Audio when supported; a recovery message advises device buttons if unavailable.

Keyboard when the video stage has focus: Space/K play or pause, Left/Right seek ten seconds, F fullscreen, M mute, Escape exits fullscreen. Music reorder handles also support Up/Down; Escape or pointer cancellation cancels a drag.

Tablet layouts adapt to portrait and landscape; the full audio player uses two columns in landscape. Browser codecs determine which video files play. H.264/AAC MP4 is a useful compatibility choice; unsupported files display a recovery message.

## Verification

```bash
pnpm test
pnpm build
pnpm audit
```

Review findings and device checks: docs/review-2026-10-23.md; previous media review: docs/review-2026-10-22.md.

## iPhone / Safari notes

The app is Safari-first. The first playback must follow a user tap (iOS blocks
autoplay). Once a track is playing you can lock the screen and keep listening; automatic
track switching on a locked screen depends on the iOS version. Browsers may clear local
storage when space runs low — **keep the original files on your device.**

## Reader

Music opens by default. The top tabs are Music, Audio Books, Reader, Video; each section remembers its last destination.

Add PDF, EPUB, FB2 (including .fb2.zip), TXT, Markdown, HTML, DOCX, JPEG, PNG and WebP to the local book library. Cover cards use the PDF first page, an embedded book cover or a title fallback. Search/filter/sort the library, reopen at the saved reading position, and remove local copies when finished. Files and bookmarks survive reload on the same device; there is no cloud sync. Import originals separately on other devices.

Reading supports paged mode with left/right swipes, continuous scrolling, page counts/jump, the shared progress slider, search, contents, bookmarks and fullscreen. Keyboard Left/Right and Page Up/Down move pages; Escape closes a panel or exits fullscreen fallback. Paper, sepia and night tones change the reading surface. Text documents have font, size and line-spacing controls; PDF/images offer fit, zoom and rotation. PDF text is selectable when the document includes a text layer; password-protected PDFs prompt for their password.

Reflowed page numbers depend on screen/font settings. Scanned PDFs and images have no text search without OCR. DOCX conversion is for reading, not exact print reproduction. DRM-encrypted books, legacy DOC, DjVu, MOBI, spreadsheets and presentations are unsupported; export them to PDF first. Document scripts, external resources, SVG, embedded styles and fonts are omitted. Reading tones do not alter system display temperature.

Books are limited to 150 MiB/5,000 PDF pages; archive and embedded-resource limits are stricter to protect mobile memory. Keep originals: browsers may evict local files under storage pressure. PDF resources increase the offline app cache; reader engines load on demand for the UI. Details and checks: docs/architecture/reader.md and docs/review-2026-10-23.md.

---

Designed & developed by [chepio.tech](https://chepio.tech)
