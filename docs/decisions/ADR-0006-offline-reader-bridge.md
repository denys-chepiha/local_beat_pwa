# ADR-0006: Hash-pinned inline reader bridge for offline use

## Status
Accepted. Supersedes only the external script delivery in ADR-0005. Its opaque-origin sandbox and validated message boundary remain in effect.

## Date
2026-10-23

## Context
The external trusted bridge passed online Chromium and WebKit checks under the production CSP. Installed-PWA testing then showed that an opaque-origin frame cannot obtain that external script from the parent application's service-worker cache while offline. Precaching the asset alone does not make the frame a controlled client.

## Decision
Embed the exact static bridge source in the generated document. The parent CSP permits its SHA-256 hash; the frame CSP also requires a fresh per-document nonce. No document data is interpolated into the script body. The channel and trusted parent origin are separate escaped attributes. Keep `allow-scripts` without `allow-same-origin`.

The normal build checks that the deployment CSP contains the source hash and that the source cannot terminate its script element. A regression test compares the embedded bytes with the source and checks both policies. Any runtime edit must update the hash in vercel.json. TypeScript checkJs continues to check the runtime.

## Rationale and alternatives
The inline script needs no separate request and remains available when the reader bundle is cached. An exact hash permits only shipped code; a nonce alone cannot widen the inherited parent policy. Broad inline-script allowances, same-origin access and weakened sandboxing are rejected. Rendering documents in the application DOM would remove the existing isolation boundary.

## Consequences
The runtime and its deployment hash must change together. Book markup still passes the strict sanitizer, and the child policy blocks every other script. Raster resources continue to cross the validated message boundary as bounded Blobs with child-owned object URLs.

## Validation
Run `pnpm test` and `pnpm build`. Verify first offline document opening in an installed PWA with the actual response headers. Chromium and WebKit probes must show working pagination/images, blocked parent DOM/storage access, and blocked arbitrary scripts even when given the bridge nonce.

## Reconsider when
Browser service-worker control of opaque frames changes or the bridge requires external code. Preserve the origin boundary and exact code authorization when reconsidering delivery.

## References
- docs/decisions/ADR-0005-isolated-reader-bridge.md
- https://www.w3.org/TR/CSP3/#security-inherit-csp
- https://www.w3.org/TR/CSP3/#multiple-policies
