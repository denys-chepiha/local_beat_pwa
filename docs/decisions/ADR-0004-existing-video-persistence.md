# ADR-0004: Retain the existing persistent video library

## Status
Recorded existing implementation; supersedes the session-only storage portion of ADR-0002. Fullscreen/control decisions remain unchanged.

## Date
2026-10-23

## Context
The reader task starts from commit 85cecc2, which already changed video storage to IndexedDB, retained progress and restored media sessions. The current README and interface describe persistent videos, while the earlier ADR and local context still described session-only files.

## Decision
Preserve the supplied persistent-video behavior during the reader/refactor task. Separate file changes from progress writes, restore videos only on entering Video, and make failed persistence visible and retryable. This records the inherited baseline; it does not claim a new user storage decision in this task.

## Consequences
Video imports consume device storage and survive reload. Clearing or changing playlists must not silently leave the visible state inconsistent with failed storage operations. A four-second progress write interval is flushed on pause, seeking, switching and page hiding. Changes to the storage model require a new owner decision.

## Alternatives
Reverting to session-only video would remove existing functionality outside the reader scope. Rewriting the previous ADR's historical decision would hide how behavior changed.

## Validation
Video store and screen tests cover persistence, failed additions/deletions, hydration and bounded progress writes. Existing media remains intact during the additive reader migration.

## Reconsider when
The owner requests session-only video or a different storage policy.
