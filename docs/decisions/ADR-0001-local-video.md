# ADR-0001: Session-only local video

## Status
Partially superseded by ADR-0002-video-session-playlist.md (playlist and controls); original decision retained below.

## Date
2026-10-22

## Context and decision
The user approved a Video section in the shared navigation, preserving the existing interface. Use a native video element with controls and playsInline, backed by File object URLs. Pause audio before video playback and keep audio progress. Release video resources on replacement and leaving the section.

## Rationale and alternatives
Copying large videos to IndexedDB consumes storage and duplicates files; it was not chosen. A separate application fragments navigation. Browser-native playback avoids new dependencies and uses platform controls.

## Consequences
Users reselect videos after leaving the section or reloading. The system file picker determines external-drive access. Browser codecs determine playable formats; no transcoding is provided.

## Validation
Component tests cover selection, audio pause, errors and URL cleanup. Browser checks cover controls, responsive layout and local playback. Physical iPad verification covers external media and installed PWA behavior.

## Reconsider when
Persistent video libraries or unsupported-codec playback become explicit requirements.
