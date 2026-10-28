# ADR-0009: Video playlist order

## Status
Accepted. Adds playlist reordering, which ADR-0008 listed as non-scope.

## Date
2026-10-28

## Context
The user requested animated drag reordering in the video playlist and a small sort-by-name control at the top of the playlist panel that does not crowd the existing controls. Saved videos are IndexedDB records keyed by id, and hydration returned them in id order, so any reordering was lost on reload.

## Decision
Persist the playlist order as a list of entry ids with the video session preferences (active video, progress, repeat) in localStorage. Hydration orders the stored files by that list; files without a position, such as those saved before this change, keep their id order after the ordered ones. Video records are not rewritten.

Each playlist row has a drag handle. Pointer drags (mouse and touch) shift the other rows aside, auto-scroll near the list edges and pick the slot from the dragged row's centre, so wrapped names of different heights work. Arrow keys on a focused handle move the row one place, and focus stays on the handle. When the order changes, rows animate from their previous positions (FLIP with the Web Animations API). With reduced motion, nothing animates.

The sort control is a one-time action, not a mode. It sorts names naturally (`2` before `10`, case-insensitive) from A to Z; when the list is already A–Z, it sorts Z–A. The label names the order a press will apply. The manual order before sorting is not kept, and the playlist can still be dragged afterwards. Reordering and sorting change neither the current video nor its playback; auto-advance follows the new order.

## Alternatives and consequences
Storing a position field in each IndexedDB record would rewrite large video records on every move. A persistent sort mode would conflict with dragging and was declined by the user. If localStorage is cleared or unavailable, the saved videos remain but return to the order in which they were added.

## Verification
VideoPlaylist tests cover pointer drag displacement and drop, cancellation, arrow keys with focus retention, natural A–Z/Z–A sorting, the animation deltas and reduced motion. Session tests cover the order restored after a module reload; VideoScreen tests cover uninterrupted playback and auto-advance after sorting and reordering. Chromium checks with real media covered mouse drag, emulated touch drag on a phone viewport, sorting, keyboard moves and reload.

## Reconsider when
Users need an undo for sorting, a persistent sort mode, or the order to survive cleared preference storage.
