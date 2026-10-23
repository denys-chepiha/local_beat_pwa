# Plan: Local reader and performance refactor

## Goal
Add a persistent, local-only book library and complete reading controls while reducing unnecessary startup work and storage writes. Default to Music, with Music / Audio Books / Reader / Video navigation.

## Context
Branch feature/reader starts from 85cecc2. The user approved PDF, EPUB, FB2, TXT, Markdown, HTML, DOCX, JPG, PNG and WebP; persistent local storage and additive database tables; pdfjs-dist (Apache-2.0), fflate (MIT), DOMPurify (Apache-2.0 or MPL-2.0), marked (MIT), mammoth (BSD-2-Clause). Existing video persistence from the base commit is retained.

## Constraints
Keep the React/TypeScript stack and incumbent visual system. No uploads, remote book resources, editing, DRM removal or cloud sync. Existing music, audiobook and video records remain intact. Reader parsers load on demand; the application shell remains available offline. Commit and release require separate approval.

## Affected areas
Navigation, reader parsing/rendering/storage, database schema, startup, media persistence, bulk deletion, import cancellation, tests, PWA assets and security policy.

## Steps
- [x] Confirm branch, format scope, persistence and dependencies.
- [x] Audit existing performance and security behavior; establish baseline.
- [x] Fix storage correctness, excessive persistence and bulk queue processing with regression tests.
- [x] Implement bounded local document parsing and sanitized content with hostile-input tests.
- [x] Add metadata/blob separation, thumbnails, library cards, sorting/filtering and reading progress.
- [x] Implement paged/swipe and continuous reading, page counts/jump, zoom/type controls, themes, fullscreen, search, contents and bookmarks.
- [x] Unify media seek bars and reader page progress with the audio-player slider design (user follow-up).
- [x] Integrate ordered navigation and lazy modules; preserve offline support.
- [x] Resolve WebKit sandbox event suppression with an opaque-origin trusted reader bridge; verify source-validated messages and keep imported scripts blocked.
- [x] Verify supported formats, mobile/tablet/desktop behavior, CSP, persistence and bundle changes.
- [x] Update architecture, decisions, README and current state.
- [x] Obtain commit/release approval and release to Vercel production (2026-10-23).

## Validation
Narrow module tests while iterating. Final `pnpm test`, `pnpm build`, `pnpm audit`, `git diff --check`. Isolated browser fixtures for all formats, offline reload, fullscreen, swipe, search, bookmark/resume, destructive-input network isolation and responsive layouts. Never clear a user's browser profile.

## Risks
PDF workers/fonts increase offline asset size. Browser storage can be evicted or exhausted. Password-protected PDFs require a password; EPUB DRM is unsupported. Reflowed document pagination changes with viewport and font size. DOCX conversion preserves readable structure rather than print fidelity. Physical iPad validation is separate from browser emulation.

## Rollback
Revert code in this branch; additive reader tables can remain without affecting previous media records. Keep original source files. No destructive migration.

## Baseline
At 85cecc2: build passes; initial JS 352.90 kB (110.66 kB gzip), CSS 30.32 kB (6.39 kB gzip), precache 540.96 KiB. Dependency audit reports zero advisories. Tests: 91 pass, 13 fail because Node's incomplete localStorage global shadows jsdom storage; repair the test environment and protect production storage writes.

## Direction contract
THESIS: an offline personal bookshelf with quiet reading controls and recognizable book covers. OWN-WORLD: preserve the dark Local Beat shell, purple active controls, system UI type and existing corner radii; reading pages offer paper, sepia and night tones. STORY: add books, choose a cover, resume reading, adjust presentation. FIRST VIEWPORT: four ordered tabs, Reader title and Add books, search/sort controls, responsive cover grid; an open book prioritizes its page with compact tools above and page progress below. FORM: user-specified card library and simplified reader; extend the incumbent system without a concept tournament. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Progress
Implementation and verification are complete. 256 tests pass; production build and dependency audit pass. Chromium verifies approved-format import, swipe, search, bookmark/resume, continuous scrolling and offline PDF/EPUB reload under the service worker. WebKit verifies text/PDF/EPUB rendering, navigation and isolation under the production CSP with an in-memory file adapter. Physical-device file persistence remains unverified. The independent finish review returned ship, including the shared slider captures. DESIGN.md and the local design sidecar record the existing visual system and reader extension. Commit/release approval was received; implementation was merged with main and released as a071dec. Final integration passes 264 tests. Physical-device verification remains. Detailed evidence: docs/review-2026-10-23.md.

## Discoveries
WebKit suppresses parent-installed events in a scriptless sandbox; ADR-0005 records the opaque-origin bridge boundary. The opaque frame cannot retrieve an external bridge from the parent's service-worker cache; ADR-0006 records exact-hash inline delivery. Inline startup exposed transient one-page layout and repeated pagination rounding that could overwrite the saved place. The runtime retains logical progress across automatic reflow, with regression tests for startup, sidebar changes, bookmarks, scrolling and pending-layout navigation.
