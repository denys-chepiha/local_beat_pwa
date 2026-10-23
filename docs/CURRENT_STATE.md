# Current state — 2026-10-23

Released to production on 2026-10-23 at https://local-beat-pwa.vercel.app (code commit a071dec):
- Music / Audio Books / Reader / Video navigation, with Music selected at startup and independent audio session restoration.
- Persistent local book library with cover cards and the approved document formats.
- Paged/swipe and continuous reading, page jump/progress, search, contents, bookmarks, fullscreen, reading tones and type/zoom controls.
- Shared progress/volume slider across audio, video and reading controls.
- Lazy screens/parsers, bounded document rendering, fewer storage writes, batch queue removal and import cancellation/correctness fixes.
- Bounded/sanitized local document handling and production security policy updates.

Verification: `pnpm test` (264 tests), `pnpm build`, `pnpm audit` (zero known advisories), `git diff --check`; Chromium format/reading/offline checks and scoped WebKit rendering checks passed. Initial JavaScript is about 14% smaller than the base commit. Evidence and limitations: docs/review-2026-10-23.md.

Inherited video persistence is recorded in docs/decisions/ADR-0004-existing-video-persistence.md. Physical iPad file persistence and installed-PWA behavior still require device testing.

Reader changes and the latest mobile video fixes are merged into main and pushed. Vercel production build passed; live security headers, manifest identity and service-worker content match the tested build. Production Reader format/import/search/resume/offline checks and video playback, mobile panels and file persistence passed. Previous-to-current service-worker activation, saved-video preservation and offline reload passed against local production builds.

Next: complete the remaining device checks in docs/ROADMAP.md.

## Pending reader experience changes

Implemented on fix/reader-experience, pending commit/release approval: icon actions without a reading progress slider, immersive fullscreen exit, pinch zoom/text size, panning at high zoom, page motion, bounded adjacent PDF caching, per-format parser loading and inline New Playlist input. Verification and performance limits: docs/review-reader-experience-2026-10-23.md. Production remains the preceding release.
