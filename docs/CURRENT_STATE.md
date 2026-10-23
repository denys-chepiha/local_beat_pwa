# Current state — 2026-10-23

Implemented on feature/reader from 85cecc2, pending commit/release approval:
- Music / Audio Books / Reader / Video navigation, with Music selected at startup and independent audio session restoration.
- Persistent local book library with cover cards and the approved document formats.
- Paged/swipe and continuous reading, page jump/progress, search, contents, bookmarks, fullscreen, reading tones and type/zoom controls.
- Shared progress/volume slider across audio, video and reading controls.
- Lazy screens/parsers, bounded document rendering, fewer storage writes, batch queue removal and import cancellation/correctness fixes.
- Bounded/sanitized local document handling and production security policy updates.

Verification: `pnpm test` (256 tests), `pnpm build`, `pnpm audit` (zero known advisories), `git diff --check`; Chromium format/reading/offline checks and scoped WebKit rendering checks passed. Initial JavaScript is about 14% smaller than the base commit. Evidence and limitations: docs/review-2026-10-23.md.

Inherited video persistence is recorded in docs/decisions/ADR-0004-existing-video-persistence.md. Physical iPad file persistence and installed-PWA behavior still require device testing.

Next: user review and commit approval, then release checks in docs/ROADMAP.md. No merge or deployment for this reader change yet.
