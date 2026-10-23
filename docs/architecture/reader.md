# Reader boundaries and data flow

## Components
The application shell selects lazy screens. ReaderLibrary lists lightweight book metadata and loads thumbnail blobs only near the viewport. ReaderScreen owns controls, reading preferences, bookmarks and serialized progress persistence. FlowView coordinates an opaque-origin frame with a trusted local reading bridge; PdfView owns a PDF document, visible page render tasks and text layers. Reader views never modify source files.

Format parsers depend on deterministic validation, bounded archive extraction and owned local image assets. They do not depend on the UI or database. The repository coordinates parsing and atomic metadata/file/cover writes; the database imports only shared record types. Renderers read original blobs on demand and release their decoders, canvases and object URLs when replaced or closed.

## Persistence
The schema is authoritative in src/services/db.ts; record types are in src/reader/types.ts. Version 4 is additive. Book metadata, original files and cover thumbnails have separate tables, so opening the library does not load every book. A unique file fingerprint prevents duplicate records. Import and removal are transactions. Progress updates use update, never upsert, so a late save cannot recreate a deleted book. Progress writes are serialized and coalesced; a failed old write cannot overwrite a newer position. Bookmark mutations wait for persistence before allowing another mutation.

Saved library data belongs to this browser profile and origin. External-drive books are copied locally on import. Video persistence is inherited from commit 85cecc2: video files are also stored locally, with progress kept separately. The earlier session-only video ADR describes the previous release; see ADR-0004.

Reflowed books retain a logical progress fraction across automatic layout changes. Displayed page numbers may change with typography, viewport size or side panels; only explicit navigation or actual scrolling changes the saved position. A temporary one-page layout must not mark the book finished. Outline/search navigation measures pending layout before resolving its target.

## Security
Treat all imported bytes as untrusted. Archive extraction checks paths, duplicate names, headers, encryption, checksums and actual expansion, with cancellation and size/count limits. Document markup uses a strict allowlist and generated internal identifiers. External URLs, forms, scripts, style rules, frames and SVG are omitted. A second browser boundary is an opaque-origin iframe: its nonce policy allows only the trusted local reading bridge, and its sandbox never grants same-origin access. Parent/frame messages validate the exact sending window, channel and payload. Approved raster data crosses the boundary as bounded resources and receives child-owned object URLs. PDF scripting and XFA are not exposed; workers and supporting resources are same-origin and bundled. The production security policy is in vercel.json; local Vite servers do not automatically apply it.

Search works on text layers/content; scanned images are not OCR-processed. No server receives book contents. Only the app shell is service-worker cached; user files remain in IndexedDB.

## Performance and compatibility
The PDF library, worker and conversion modules do not block the Music startup bundle. Video restoration starts only when Video is opened. Paged PDF reading retains up to three adjacent page canvases at fit/normal scale and only the active canvas at high zoom. Continuous PDF reading retains lightweight page placeholders and renders at most five nearby canvases; page count and canvas dimensions are bounded. Reflowed documents use native CSS columns or scrolling, with a readable maximum line width. Reduced-motion settings are inherited from the shell.

Phone/tablet layouts use touch targets, safe-area padding, page swipes and native/prefixed fullscreen with a full-window fallback. Fullscreen hides chrome except its exit icon; iPhone Safari browser chrome is outside app control. PDF/images use native panning and a two-touch transform preview before committing zoom; text pinch changes typography through a validated bridge message. Page turns respect reduced motion. See ADR-0007. The trusted bridge is embedded as exact static source so opaque-origin frames work offline. The parent CSP pins its hash, and the child CSP requires a per-document nonce. The build verifies the deployment hash; TypeScript checkJs checks the runtime. Real iPad installation, external-drive access, background behavior and storage eviction require physical-device validation. Automated WebKit may not support IndexedDB Blob storage even when plain records work.

## Decisions and verification
Rationale and limitations: docs/decisions/ADR-0003-local-reader.md, docs/decisions/ADR-0005-isolated-reader-bridge.md and docs/decisions/ADR-0006-offline-reader-bridge.md. Commands and measured results: docs/review-2026-10-23.md.
