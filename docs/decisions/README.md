# Decisions

- ADR-0001-local-video.md — Partially superseded by ADR-0002: session-only local video using native browser playback.
- ADR-0002-video-session-playlist.md — Storage superseded by ADR-0004; controls retained: in-memory video playlist and custom fullscreen controls; supersedes ADR-0001's single-file/native-controls behavior.

- ADR-0003-local-reader.md — Iframe access superseded by ADR-0005; reader slider presentation superseded by ADR-0007; other decisions accepted: persistent local books, restricted parsing and responsive reading controls.
- ADR-0004-existing-video-persistence.md — Records inherited persistent video behavior from 85cecc2.

- ADR-0005-isolated-reader-bridge.md — Delivery superseded by ADR-0006; boundary accepted: opaque-origin trusted reader bridge for WebKit interactions, with source-validated messaging and no imported scripts.
- ADR-0006-offline-reader-bridge.md — Accepted: exact-hash inline bridge for offline reading, with the opaque-origin sandbox retained.

- ADR-0007-reader-touch-controls.md — Accepted: immersive fullscreen, icon actions, pinch/pan, bounded adjacent-page rendering and inline playlist naming.

- ADR-0008-video-auto-advance.md — Accepted: automatic video moves keep the playlist open, skip unplayable files with a loop bound, restart watched videos, persist repeat and use ten-second timeline keys.
- ADR-0009-video-playlist-order.md — Accepted: persisted video playlist order, animated drag and keyboard reordering, and a one-time natural A–Z/Z–A name sort.
