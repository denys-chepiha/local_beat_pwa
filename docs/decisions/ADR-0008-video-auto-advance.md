# ADR-0008: Video playlist auto-advance

## Status
Accepted. Refines the auto-advance and repeat controls retained from ADR-0002.

## Date
2026-10-26

## Context
A browser check of the video playlist found that auto-advance worked, but one file the browser could not decode stopped the remaining playlist, auto-advance closed an open playlist and moved focus, a watched video reached automatically resumed a rewatched scene, the repeat mode reset on leaving the screen, and arrow keys on the focused timeline moved 0.1 seconds. The app accepts MKV/AVI files that Safari usually cannot play.

## Decision
Automatic moves (end of video, repeat all) are separate from viewer selection. They keep the playlist open and start the next entry. If a file reached automatically fails to load, skip to the following entry and show a short notice. A file the viewer chose stays selected with the recovery message. Automatic moves are counted until playback starts; after one move per playlist entry without a start, stop and show the error, so a playlist of unplayable files cannot loop.

A completed video reached automatically starts from zero; any other saved position resumes. The repeat mode persists with the video session state, matching the music player. Arrow keys on the timeline seek ten seconds, matching the player's keyboard shortcuts.

## Alternatives and consequences
Stopping on every unplayable file preserves visibility but interrupts long playlists. Probing codecs before playback adds work for every file and remains unreliable across browsers. Persistently marking failed entries would need new stored state; the notice is transient and the failure repeats on the next attempt. Restarting watched videos on manual selection would discard deliberate resume points, so only automatic moves restart them.

## Verification
VideoScreen and VideoSeek regression tests cover advancing, keeping the playlist open, repeat all/one and persistence, skipping and the loop bound, watched restart and timeline keys. Chromium checks with real media covered desktop and emulated touch. Physical iPhone/iPad Safari autoplay after a video ends, including the Web Audio volume path, remains a device check.

## Reconsider when
Device testing shows Safari blocks automatic starts, or users need a persistent record of failed files.
