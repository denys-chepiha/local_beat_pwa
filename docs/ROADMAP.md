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
