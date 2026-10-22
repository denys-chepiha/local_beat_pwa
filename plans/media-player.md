# Plan: Media playback and tablet reliability

## Goal
Fix playback progress and ordering, add understandable track reordering, integrate local video and adapt the existing UI to tablets.

## Constraints
Keep React/TypeScript, existing visual identity and IndexedDB schema. No new dependencies or deployment without approval. Video files stay session-only; no file copies in IndexedDB. Preserve audio sessions when opening video.

## Steps
- [x] Record baseline tests/build and review playback, storage, rendering and security.
- [x] Fix asynchronous playback races, seek state and live queue ordering; add regression tests.
- [x] Add pointer/keyboard reorder feedback and cancellation; test it.
- [x] Add a Video section using native video controls and local File object URLs; test resource cleanup and audio handoff.
- [x] Adapt tablet portrait/landscape layouts, touch controls and PWA orientation.
- [x] Run tests/build, dependency audit and browser checks; document findings and device-only checks.

## Validation
`pnpm test`; `pnpm build`; `pnpm audit --json`. Browser checks at phone, tablet portrait/landscape and desktop widths: navigation, seek, reorder, video loading, resource cleanup and overflow. Physical iPad checks remain explicitly unverified without hardware.

## Follow-up scope — 2026-10-22
The user requested a video playlist, complete transport controls, fullscreen and controls that disappear during playback. Implement a session queue, previous/next/auto-advance, repeat, seek, speed and volume/mute; use container fullscreen with full-window fallback. Preserve no-copy storage unless the user changes that decision.

## Risks and rollback
Browser codecs and external-drive availability vary. Avoid storage migrations. Revert this branch to roll back code; existing libraries remain untouched.
