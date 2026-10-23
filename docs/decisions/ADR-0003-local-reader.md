# ADR-0003: Persistent local reader

## Status
Accepted. Iframe access arrangement superseded by ADR-0005; reader progress-slider presentation superseded by ADR-0007; other decisions retained.

## Date
2026-10-23

## Context
The owner requested a simplified document reader, a library of cover cards, phone/tablet support, fullscreen, page swipes, continuous scrolling, reading tones and saved progress. The approved formats are PDF, EPUB, FB2, TXT, Markdown, HTML, DOCX, JPEG, PNG and WebP.

## Decision
Store original books, small cover previews and lightweight library metadata in separate IndexedDB tables. Schema v4 adds tables without modifying media data. Keep reading position and bookmarks on the book record; preferences remain optional browser storage. There is no upload or cross-device synchronization.

Use PDF.js for local PDF rendering, fflate for bounded archive extraction, DOMPurify for restricted document markup, marked for Markdown, and Mammoth for DOCX. Load these modules on demand. Package PDF workers, CMaps, BSD Foxit fonts and JavaScript image decoders locally for offline use. Do not package the unused Liberation fonts, XFA support or PDF scripting engine. PDF.js 6 removed the older isEvalSupported option; the application does not load or invoke document scripting, and its CSP permits no eval.

Rich documents render inside a scriptless iframe with a restrictive content policy. The iframe permits parent access for pagination/search but does not permit scripts, forms, popups or top navigation. Only approved locally owned raster image URLs survive sanitization; links are internal document anchors. The viewer does not apply document styles or load external fonts/resources.

PDF keeps its original page count. Reflowable documents use screen-sized reading pages, so page counts change with screen, font and mode. Persist normalized progress across layout changes. All readers share media-player slider styling. The initial application section is always Music; section navigation remembers local destinations.

## Rationale and alternatives
Native PDF embedding cannot reliably provide offline search, custom page controls and consistent mobile behavior. Remote conversion would expose private documents and require a server. A full office editor is outside a read-only reader. Local original files are retained so presentation can improve without a data migration.

## Consequences
Offline shell size increases because PDF resources are bundled, while the initial JavaScript bundle is reduced through screen-level loading. DOCX preserves readable content rather than exact print layout. SVG, scripts, external resources and author CSS are omitted. EPUB font obfuscation is supported by ignoring those fonts; encrypted content and DRM are rejected. OCR, annotations, editing, cloud sync, old DOC, DjVu, MOBI, spreadsheets and presentations are outside the approved format set.

Limits are enforced by src/reader/parseDocument/types.ts, readerRepository.ts and pdfDocument.ts: 150 MiB general book size, 5,000 PDF pages, 64 MiB archives, 128 MiB expansion, 32 MiB per archive entry, 3,000 entries and 16 MiB text. Standalone images are limited to 25 MiB and 40 million pixels. Canvas memory and simultaneously rendered PDF pages are bounded separately.

## Validation
Parser/security fixtures, transactional storage and migration tests, progress-write ordering, reader UI tests, PDF lifecycle tests, and isolated browser checks for real files, CSP, swipe, search, fullscreen and offline reload. Original files must remain available as a backup because browsers may evict local storage.

## Reconsider when
The owner needs synchronization, DRM integration, exact Office layout, OCR, annotations, larger documents or additional legacy formats.

## References
- https://mozilla.github.io/pdf.js/
- https://github.com/101arrowz/fflate
- https://github.com/cure53/DOMPurify
- https://marked.js.org/
- https://github.com/mwilliamson/mammoth.js
- https://www.w3.org/TR/epub-33/#sec-font-obfuscation
