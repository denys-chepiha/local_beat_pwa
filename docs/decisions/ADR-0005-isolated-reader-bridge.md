# ADR-0005: Opaque-origin reader bridge for WebKit

## Status
External script delivery superseded by ADR-0006; the isolation and messaging boundary remains accepted. Supersedes only the iframe access arrangement in ADR-0003; its format, storage and presentation decisions remain in effect.

## Date
2026-10-23

## Context
Real WebKit verification found that a sandboxed, same-origin, scriptless iframe suppresses parent-installed scroll, touch, click and keyboard listeners. A minimal isolated probe reproduced the problem, matching WebKit bug 218086. Chromium did not expose it. Page controls in the parent worked, but continuous position tracking and page swipes could not work reliably on Safari.

## Decision
Render sanitized rich documents in an opaque-origin iframe with only `allow-scripts`; do not grant `allow-same-origin`. Run one trusted, locally bundled reading bridge, loaded as an external classic script under the production parent CSP and a per-document nonce in the child CSP. Imported scripts remain forbidden. Do not relax the application's `script-src 'self'` or introduce eval/inline-script allowances.

The bridge owns pagination, scrolling, internal links, selection/search and touch/keyboard handling. The parent retains parsing, file storage, preferences and bookmarks. Communicate through a bounded protocol that checks the exact sending window, a per-document channel and validated message fields. The opaque frame cannot read the parent DOM or browser storage. Transfer only approved local raster resources; create their object URLs in the receiving frame and release them on disposal.

The bridge is precached with other application assets. A search request must settle or time out; replacing/closing a document cancels stale work and releases resources.

## Rationale and alternatives
Adding `allow-scripts` alongside `allow-same-origin` would remove the useful origin boundary and is rejected. Polling scroll position preserves scriptless isolation but does not restore touch, links or keyboard events. Moving book HTML directly into the application DOM removes a separate security boundary. An opaque frame with a narrow trusted bridge preserves isolation while supporting Safari interactions.

An inline nonce script cannot widen the parent CSP inherited by srcdoc. An external same-origin application asset satisfies the existing parent policy, while the child policy permits only the specific trusted script. Parent-owned blob image URLs are inaccessible from the opaque frame; transferring the bounded image data preserves local-only reading without granting origin access.

## Consequences
The rendering boundary needs protocol validation, readiness/error handling and request cleanup. Reader views remain behind the same imperative interface, so book storage, PDF rendering and page controls are unchanged. Source fixtures and isolated browser tests must exercise the production CSP, not only Vite development behavior.

## Validation
Protocol spoofing/malformed-input tests, lifecycle/search cleanup tests, and Chromium/WebKit checks for real text, local images, swipes, scrolling, search and fullscreen. Verify that imported unnonced scripts cannot execute, the iframe cannot access parent storage/DOM, and offline reading loads the bridge asset.

## Reconsider when
WebKit changes its sandbox behavior or the reader requires a new cross-frame capability. New capabilities must extend the explicit protocol rather than grant same-origin access.

## References
- https://bugs.webkit.org/show_bug.cgi?id=218086
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox
- https://www.w3.org/TR/CSP3/#security-inherit-csp
- https://www.w3.org/TR/CSP3/#multiple-policies
