# Local Beat — Offline Music Player

A personal, offline-first music player PWA. No subscriptions, no ads, no accounts,
no servers. You add your own local audio files, the app stores them on your device,
and you listen to your music — even without internet.

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

The shared Music / Audio Books / Video menu is available throughout the app. Add multiple local videos to a session playlist, including files from external drives visible in the system picker. Files are not uploaded or copied into IndexedDB. The queue survives section navigation but is cleared on reload/close; only the active video's decoder URL is retained.

Video controls include play/pause, previous/next, automatic advance, repeat, timeline, ±10 seconds, speed, mute and desktop volume. Fullscreen keeps these controls and the playlist available. During playback controls disappear after 2.5 seconds; move the mouse, tap the picture or use the keyboard to reveal them. The first reveal tap does not pause playback. Where container fullscreen is unavailable, the player fills the browser window. On iPad use the device's volume buttons.

Keyboard when the video stage has focus: Space/K play or pause, Left/Right seek ten seconds, F fullscreen, M mute, Escape exits fullscreen. Music reorder handles also support Up/Down; Escape or pointer cancellation cancels a drag.

Tablet layouts adapt to portrait and landscape; the full audio player uses two columns in landscape. Browser codecs determine which video files play. H.264/AAC MP4 is a useful compatibility choice; unsupported files display a recovery message.

## Verification

```bash
pnpm test
pnpm build
pnpm audit
```

Review findings and device checks: docs/review-2026-10-22.md.

## iPhone / Safari notes

The app is Safari-first. The first playback must follow a user tap (iOS blocks
autoplay). Once a track is playing you can lock the screen and keep listening; automatic
track switching on a locked screen depends on the iOS version. Browsers may clear local
storage when space runs low — **keep the original files on your device.**

---

Designed & developed by [chepio.tech](https://chepio.tech)
