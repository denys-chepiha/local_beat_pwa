# Reader interaction and startup improvements

## Scope
User-approved branch fix/reader-experience. Remove the reader progress slider, provide icon toolbar and immersive fullscreen with only a bottom-right exit control, add pinch zoom and panning, animate page changes, improve measured loading work, and replace New Playlist's modal with an inline naming field focused during the tap.

## Constraints
Keep the existing stack, local-only media, opaque document isolation and bounded PDF canvases. No new dependencies or destructive migrations. Native fullscreen is feature-detected; iPhone browser chrome cannot be hidden where the platform does not support it. Preserve accessibility and reduced-motion support. No commit or deployment without new approval.

## Steps
- [x] Inspect current behavior and agree branch.
- [x] Implement reader chrome, fullscreen and inline playlist naming with tests.
- [x] Implement pinch/pan and short directional page motion with cancellation and reduced motion.
- [x] Reduce unnecessary parser loading and PDF page rerenders; measure before/after with the same fixtures.
- [x] Run targeted/full tests, build and isolated Chromium/WebKit checks; update documentation.

## Motion
Page navigation shows a short horizontal transition (180 ms); no animation on startup/reflow, no delayed controls. Respect reduced motion. Pinch previews use transforms; expensive PDF raster changes happen when fingers lift.

## Verification
pnpm test; pnpm build; git diff --check. Browser checks: phone/tablet, fullscreen exit, pinch and pan at 300%, multi-touch never turns pages, inline name focus/save/cancel, Reader offline and production CSP. Record real-device limitations separately.

## Result
Implemented and verified; review evidence: docs/review-reader-experience-2026-10-23.md. Commit/push/deployment approved on 2026-10-23. Production verification and physical-device checks remain.
