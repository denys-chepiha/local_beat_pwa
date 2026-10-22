# ADR-0002: Session video playlist and fullscreen controls

## Status
Accepted; supersedes the single-file/native-controls portion of ADR-0001.

## Date
2026-10-22

## Context and decision
The user requested a video playlist, complete transport controls and a fullscreen player with controls that disappear while watching. The user explicitly chose a session playlist without file copies.

Keep File references in an in-memory session store across section navigation. Create an object URL only for the active file and release it on replacement or unmount. Reloading the app clears the queue. Use custom controls inside the fullscreen container; use a full-window CSS fallback when the browser rejects container fullscreen.

## Rationale and alternatives
Native fullscreen video controls cannot expose the app's playlist. Persistent IndexedDB video copies consume additional space and were declined. No codec/transcoding dependency is added.

## Consequences
Controls provide play/pause, previous/next, auto-advance, seek, ten-second skips, speed, mute/volume and repeat. Controls hide after 2.5 seconds of playback inactivity, and remain available for keyboard focus or an open playlist. iPad volume uses hardware controls. External-drive files may become unavailable after disconnection.

## Validation
VideoScreen component tests cover queue lifecycle, controls, hide/reveal, fullscreen fallback and navigation retention. Browser checks cover native container fullscreen and real media playback. Physical iPad installation/external-drive behavior remains a device check.

## Reconsider when
The user needs persistent libraries, subtitle files, transcoding or background video playback.
