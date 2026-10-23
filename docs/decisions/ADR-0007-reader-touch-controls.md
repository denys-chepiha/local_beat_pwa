# ADR-0007: Immersive reader and touch controls

## Status
Accepted. Supersedes ADR-0003's reader progress-slider presentation; storage and isolation decisions remain unchanged.

## Date
2026-10-23

## Context
The owner requested removal of the audio-style reader progress slider, icon actions, fullscreen reading with only a bottom-right exit icon, pinch zoom, panning at 300%, animated page turns and faster loading. New Playlist should reveal a name field immediately on iPhone.

## Decision
Keep page-number entry and previous/next controls outside fullscreen, but remove the progress slider. Named icon buttons open Appearance, Contents, Search and Bookmarks. Immersive reading hides application/reader controls and retains one 44px exit target containing a small icon. Request standard or prefixed native fullscreen where available; otherwise fill the application viewport. Browser chrome cannot be removed on unsupported iPhone Safari versions; installed standalone mode avoids browser toolbars.

Two fingers preview PDF/image zoom with a transform and commit a bounded scale when released. Single-finger scrolling pans oversized pages, and must not turn them. Text pinch changes font size with logical progress preserved. Page motion is short, directional and interruptible, disabled for reduced motion and automatic reflow.

Keep at most three adjacent paged PDF canvases at fit/normal scale and one at high zoom; continuous reading retains its five-page bound. Load converters by format and the mini-player on demand. New Playlist uses an inline form whose input is focused synchronously within the initiating tap.

## Alternatives and consequences
Global browser zoom also enlarges app controls and cannot reliably provide a book-only experience. Rasterizing every touch movement wastes CPU; retaining every PDF page wastes memory. The bounded adjacent cache exchanges some memory for repeat-navigation speed. Dynamic converters add small lazy chunks while retaining offline precaching. Inline naming avoids a modal without changing playlist storage.

## Verification
Touch zoom unit tests; source/channel/range validation for text pinch messages; fullscreen/pan/inline-form regressions; PDF cache reuse and release tests. Chromium synthesized native touch and WebKit rendering checks supplement automated tests. Physical iPhone/iPad gesture, keyboard and installed-mode behavior require device checks.

## Reconsider when
iPhone Safari adds arbitrary-element fullscreen, document sizes require more aggressive PDF virtualization, or measured device memory requires a smaller adjacent cache.

## References
- https://bugs.webkit.org/show_bug.cgi?id=206854
- docs/architecture/reader.md
- docs/review-reader-experience-2026-10-23.md
