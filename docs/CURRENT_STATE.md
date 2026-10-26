# Current state — 2026-10-26

Video playlist playback fixes (branch fix/video-autoplay, ADR-0008): auto-advance keeps an open playlist, skips files that fail during automatic playback with a bounded loop, restarts watched videos reached automatically, persists the repeat mode, and timeline arrow keys seek ten seconds. Verification: `pnpm test` (283 tests in 33 files, including music changes d2b4129), `pnpm build`, `git diff --check`; Chromium checks with real media covered auto-advance, repeat off/all/one with reload, unplayable-file skipping, mouse/keyboard/touch seeking, frame preview, and Music/Audio Books/Reader/Video smoke and audio handoff. Released: code a17a3d4 merged into main, pushed and deployed by Vercel (deployment dpl_Gkaqiv2xXUVUEwYmL7tYAwJNDM8r) to https://local-beat-pwa.vercel.app. The live entry bundle, video chunk and service worker match the tested build; security headers and the /local-beat manifest identity are present. A live isolated Chromium check passed for skipping an unplayable file with the playlist open, repeat all, repeat persistence across reload and timeline keys. Physical iPhone/iPad Safari auto-advance with sound remains a device check.

Released to production on 2026-10-23 at https://local-beat-pwa.vercel.app (code commit 2f3af23):
- Music / Audio Books / Reader / Video navigation, with Music selected at startup and independent audio session restoration.
- Persistent local book library with cover cards and the approved document formats.
- Paged/swipe and continuous reading, page jump, search, contents, bookmarks, reading tones and type/zoom controls. Reader actions use icons; the reader has no progress slider.
- Immersive reader fullscreen with a bottom-right exit control, pinch zoom/text sizing, high-zoom panning and reduced-motion-aware page turns.
- Shared progress/volume slider across audio and video controls; inline playlist naming with input focus during the initiating tap.
- Lazy screens/per-format parsers, bounded document rendering and adjacent PDF reuse, fewer storage writes, batch queue removal and import cancellation/correctness fixes.
- Bounded/sanitized local document handling and production security policy updates.

Verification: `pnpm test` (275 tests in 33 files), `pnpm build`, `pnpm audit` (zero known advisories), `git diff --check`; Chromium format/reading/gesture/offline checks and scoped WebKit rendering checks passed. Current measurements and limitations: docs/review-reader-experience-2026-10-23.md. Previous release evidence: docs/review-2026-10-23.md.

Inherited video persistence is recorded in docs/decisions/ADR-0004-existing-video-persistence.md. Physical iPad file persistence and installed-PWA behavior still require device testing.

Reader experience changes are merged into main and pushed. Vercel production deployment is Ready; live security headers, manifest identity, entry bundle and service-worker content match the tested build. Live isolated Chromium checks passed for all eight format imports, inline playlist naming, icon controls, fullscreen, PDF navigation, pinch, touch panning at 300%, image zoom and offline text reload, without page exceptions. Previous release video/update verification remains recorded in docs/review-2026-10-23.md.

Next: complete the remaining device checks in docs/ROADMAP.md.

Physical iPhone/iPad keyboard, gestures and installed fullscreen still require device checks. Unsupported iPhone Safari versions retain browser chrome; fullscreen API support and the installed PWA viewport determine the available screen area.
