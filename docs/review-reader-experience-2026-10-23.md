# Reader interaction verification — 2026-10-23

## Scope
Branch fix/reader-experience from 3f71cca. User-approved code commit 2f3af23 is merged into main, pushed and deployed. Reader chrome, fullscreen, PDF/image pinch and panning, text-size pinch, page animation, converter loading and inline playlist naming. No dependency additions, storage migrations or user-profile data clearing.

## Changes and checks
- Removed reading progress slider; retained page number/jump outside fullscreen. Named icon actions preserve accessible labels and 44px targets.
- Fullscreen hides headings, toolbar and pagination, leaving a bottom-right exit icon. Native and prefixed fullscreen are feature-detected; full-window fallback retains body-scroll cleanup.
- PDF/image pinch previews without per-move raster work, commits a bounded scale and restores the content anchor. Native panning works at 300%; multi-touch and oversized-page movement do not trigger page turns.
- Text pinch updates a validated font-size preference through the existing source/channel-checked opaque-frame bridge. Logical place survives reflow. Updated CSP hash authorizes only the new trusted runtime.
- Page transitions last 180ms, cancel on replacement/reflow, and respect reduced motion. Paged PDF rendering retains a bounded adjacent cache at normal scale; high zoom renders only the active page. Canvas cleanup and reuse have regression tests.
- New Playlist opens an inline naming form and focuses its input in the initiating tap. Tests cover trimmed names, cancellation/focus return, failed saves and retry.

## Performance evidence
Local production builds, pnpm build, same machine and fixtures:

| Output | Before | After |
| --- | ---: | ---: |
| Initial JS | 303.87 kB | 301.54 kB |
| Common parseDocument chunk | 99.63 kB | 36.32 kB |
| App precache | 4,791.71 KiB | 4,801.55 KiB |

The common parser chunk is 63.5% smaller; format-specific code remains lazy and precached. The initial bundle is only about 0.8% smaller, not a large application-wide speedup. Initial media-session restoration remains intact. Adjacent-page reuse is verified by retaining the same canvas through forward/back navigation rather than claiming a universal timing improvement.

Single cold Chromium lab samples at 390×844, local server without throttling: first contentful paint 136ms before and 296ms after; PDF open 221ms before and 187ms after; three page actions 70/82/83ms before and 209/57/55ms after. Other verification was running concurrently, and motion changes the action timing. These samples are noisy and do not establish a reliable elapsed-time improvement or regression. No field Core Web Vitals or real-device latency claim is made.

## Automated verification

`pnpm test`: 275 tests in 33 files passed. `pnpm build`: TypeScript and production/PWA build passed (existing lazy PDF chunk size warning). `git diff --check`: passed. Pre-release `pnpm audit`: no known vulnerabilities.

## Browser evidence
Chromium with production CSP and an isolated profile: imported all eight existing format fixtures; tested inline playlist creation, icon controls, absence of the progress slider, fullscreen layout/exit, PDF navigation and offline text reload. CDP synthesized native two-finger pinch and separate horizontal/vertical touch pans at 300%; page number stayed unchanged. Image zoom/pan geometry and synthetic text pinch passed. No page exceptions. Phone 390×844 and tablet 820×1180 screenshots were reviewed after settled rendering.

WebKit: inline input focus, text page navigation/resume, swipe/keyboard, continuous scrolling/search, fullscreen exit, PDF/EPUB rendering and opaque-frame CSP isolation passed. Files were supplied through the established isolated in-memory IDB get adapter; this does not certify WebKit Blob persistence. Blocked injected-script console messages are expected negative security tests.

## Production release
Vercel deployment local-beat-eakjtuy81-denys-chepihas-projects.vercel.app reached Ready and serves https://local-beat-pwa.vercel.app. Live response headers match vercel.json; the entry bundle and service-worker body match the tested production build; the manifest identity remains /local-beat.

An isolated Chromium profile repeated all eight fixture imports, inline playlist focus/creation, icon toolbar and absence of the reading slider, fullscreen layout/exit, PDF navigation, native two-finger pinch, separate horizontal/vertical touch panning at 300% without a page turn, image zoom/pan geometry, text-size pinch and offline text reload. All passed without page exceptions. No existing user browser profile or data was modified.

## Remaining limitations
Physical iPhone/iPad testing is still required for keyboard appearance, gestures, installed PWA safe areas and persistence. On unsupported iPhone Safari versions, the website cannot remove browser chrome; standalone installation provides the application viewport without browser toolbars.
