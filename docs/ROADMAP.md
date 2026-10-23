# Roadmap

## Media and tablet reliability
Scope: playback correctness, security/performance review, reordering feedback, local video, tablet layouts. Non-scope: streaming, transcoding, cloud storage and framework replacement.
Dependencies: existing browser media/File APIs. Risks: Safari media permissions, codecs and external-drive availability.

- [x] Playback fixes with regression tests.
- [x] Animated and keyboard-accessible reordering.
- [x] Integrated local video with audio handoff and cleanup tests.
- [x] Tablet layout and PWA improvements.
- [x] Security/performance report and verification.

Definition of Done: `pnpm test` and `pnpm build` pass; browser checks recorded; physical-device limitations listed.

## Local reader
Scope: approved local document formats, persistent cover library, reading controls, responsive navigation and shared progress controls. Non-scope: editing, OCR, cloud sync, DRM, legacy office converters and visual identity replacement.
Dependencies: approved parsers and existing IndexedDB/PWA infrastructure. Risks: untrusted documents, storage eviction, PDF memory/assets, device-specific fullscreen and reflowed pagination.

- [x] Approve branch, formats, persistent storage and dependency licenses.
- [x] Implement bounded parsing and isolated rendering.
- [x] Add transactional library/cover storage and resume/bookmarks.
- [x] Implement paged/swipe/scroll, search, contents, presentation and fullscreen controls.
- [x] Integrate ordered tabs and common progress sliders.
- [x] Verify formats, persistence, offline behavior and responsive layouts; document device limitations.
- [x] Obtain commit approval and perform the configured release flow (main a071dec, Vercel production, 2026-10-23).
- [x] Verify live security headers and production Reader/video/offline behavior; verify previous-to-current service-worker activation and saved-video preservation in an isolated local browser.
- [ ] Verify installed PWA and real file persistence on physical iPad/Safari, including update completion on the device network.

Definition of Done for implementation: `pnpm test`, `pnpm build`, `pnpm audit`, `git diff --check`; browser evidence in docs/review-2026-10-23.md. Release requires the separate approval and device checks above.

## Performance and storage reliability
Scope: startup work, repeated storage writes, bulk queue changes and import lifecycle races. Non-scope: framework rewrites, server infrastructure and unmeasured caching layers.
Dependencies: existing stores and tests. Risks: independent media-session progress and failed/overlapping writes.

- [x] Establish build/test baseline at 85cecc2.
- [x] Defer secondary screens/parsers and video hydration.
- [x] Coalesce video progress writes and serialize queue/progress mutations.
- [x] Batch track removal and cancel abandoned import work.
- [x] Add race/recovery tests and record bundle measurements.

Definition of Done: regression tests and production build pass; measurements distinguish smaller initial bundles from increased offline assets. Commands: `pnpm test`, `pnpm build`.

## Reader touch experience
Scope: requested reader controls/fullscreen/gestures/motion, loading work and inline playlist naming. Non-scope: native iOS wrapper, new formats or storage migrations.
Dependencies: current renderers and browser APIs. Risks: iPhone fullscreen limits, pinch/scroll arbitration and canvas memory.

- [x] Remove reading progress slider; use accessible icon actions and immersive fullscreen exit.
- [x] Implement pinch, high-zoom panning and reduced-motion-aware page turns.
- [x] Add bounded PDF reuse, per-format loading and inline playlist name entry.
- [x] Verify tests/build, Chromium gestures and WebKit reading; record measured limits.
- [x] Obtain commit/release approval (2026-10-23).
- [x] Complete production deployment and live verification (code 2f3af23, 2026-10-23).
- [ ] Verify physical iPhone/iPad keyboard, gestures and installed fullscreen.

Definition of Done: pnpm test, pnpm build, git diff --check, browser evidence in docs/review-reader-experience-2026-10-23.md.
