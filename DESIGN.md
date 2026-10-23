---
name: "Local Beat"
description: "The established dark Local Beat interface with purple controls and selectable reading tones."
colors:
  bg: "#0b0b0f"
  bg-elev: "#15151c"
  bg-elev-2: "#1e1e28"
  surface: "rgba(255, 255, 255, 0.04)"
  surface-hover: "rgba(255, 255, 255, 0.08)"
  border: "rgba(255, 255, 255, 0.08)"
  text: "#f4f4f6"
  text-dim: "#a0a0ad"
  text-faint: "#6b6b78"
  accent: "#7c5cff"
  accent-2: "#c049ff"
  danger: "#ff5c7a"
  white: "#fff"
  danger-surface: "rgba(255, 92, 122, 0.12)"
  reader-cover: "#252033"
  reader-cover-text: "#ddd5ff"
  reader-selected: "#342855"
  reader-selected-text: "#e7deff"
  reader-focus: "#ad9aff"
  reader-paper: "#fcfcfa"
  reader-paper-ink: "#25232b"
  reader-sepia: "#f3e7cd"
  reader-sepia-ink: "#443926"
  reader-night: "#202027"
  reader-night-ink: "#e3e0d8"
  reader-night-choice: "#282830"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    letterSpacing: "-0.02em"
  title-reader:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.4
  title-card:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.4
  title-cover:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "clamp(16px, 1.7vw, 22px)"
    fontWeight: 650
    lineHeight: 1.35
  label-button:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  label-navigation:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 700
  label-muted:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13px"
  reader-serif:
    fontFamily: "Georgia, \"Times New Roman\", serif"
    fontSize: "18px"
    lineHeight: 1.65
  reader-sans:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "18px"
    lineHeight: 1.65
rounded:
  radius: "16px"
  radius-sm: "10px"
  cover: "12px"
  page-input: "8px"
  pill: "999px"
  circle: "50%"
spacing:
  "4": "4px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "20": "20px"
  "24": "24px"
  "32": "32px"
components:
  button-primary:
    textColor: "{colors.white}"
    typography: "{typography.label-button}"
    rounded: "{rounded.radius-sm}"
    padding: "12px 18px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label-button}"
    rounded: "{rounded.radius-sm}"
    padding: "12px 18px"
  button-danger:
    backgroundColor: "{colors.danger-surface}"
    textColor: "{colors.danger}"
    typography: "{typography.label-button}"
    rounded: "{rounded.radius-sm}"
    padding: "12px 18px"
  button-icon:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.circle}"
    width: "42px"
    height: "42px"
  input-library:
    backgroundColor: "{colors.bg-elev}"
    textColor: "{colors.text}"
    rounded: "{rounded.radius-sm}"
    padding: "12px"
  navigation-tab:
    textColor: "{colors.text-dim}"
    typography: "{typography.label-navigation}"
    rounded: "{rounded.pill}"
    padding: "9px 12px"
  navigation-tab-active:
    textColor: "{colors.white}"
    typography: "{typography.label-navigation}"
    rounded: "{rounded.pill}"
    padding: "9px 12px"
  reader-title-cover:
    backgroundColor: "{colors.reader-cover}"
    textColor: "{colors.reader-cover-text}"
    typography: "{typography.title-cover}"
    rounded: "{rounded.cover}"
    padding: "20px"
    width: "100%"
  reader-tone-paper:
    backgroundColor: "{colors.reader-paper}"
    textColor: "{colors.reader-paper-ink}"
    rounded: "{rounded.radius-sm}"
    padding: "14px 6px"
  reader-tone-sepia:
    backgroundColor: "{colors.reader-sepia}"
    textColor: "{colors.reader-sepia-ink}"
    rounded: "{rounded.radius-sm}"
    padding: "14px 6px"
  reader-tone-night:
    backgroundColor: "{colors.reader-night-choice}"
    textColor: "{colors.reader-night-ink}"
    rounded: "{rounded.radius-sm}"
    padding: "14px 6px"
  progress-slider:
    rounded: "{rounded.pill}"
    height: "44px"
    width: "100%"
---

# Design System: Local Beat

## Overview

**Creative North Star: "Preserve the established Local Beat interface"**

Local Beat uses a dark application shell, purple gradient primary actions, rounded controls and the operating system's sans-serif typeface. This document records that incumbent system and its reader extension. The approved direction is preservation; it introduces no replacement identity or new brand metaphor.

The reader keeps the same navigation and action styles, with icon actions and page-number navigation instead of a media progress slider. Its library gives real covers room to remain recognizable, with a plain title card when a cover is unavailable. Opening a book introduces a selectable paper, sepia or night page inside the dark application controls. Reading typography is separate from interface typography.

**Key Characteristics:**

- Dark tonal layers with muted metadata and bright primary text.
- Purple gradient primary actions and selected navigation.
- Rounded rectangles, pill tabs and circular icon controls.
- Real cover imagery, legible title fallbacks and selectable page tones.
- Shared progress-slider geometry across music, audiobooks and video; the reader uses page navigation.

## Colors

The shell uses nearly black neutrals; purple identifies primary actions and selected sections. The frontmatter preserves source color notation, including translucent `rgba()` surfaces.

### Primary

- **Accent** and **Accent 2** form the existing diagonal action gradient. The gradient is an image value in `--accent-grad`, so its exact declaration belongs in the sidecar component snippets rather than a color primitive.
- **Reader focus** is the lighter purple outline used inside the reader and library.
- **Reader selected** and **Reader selected text** indicate an open toolbar panel. **Reader cover** and **Reader cover text** belong to coverless title cards.

### Neutral

- **Background**, **elevated background** and **second elevated background** separate the shell, panels, controls and cover containers.
- **Surface**, **surface hover** and **border** are translucent white overlays. **Text**, **dim text** and **faint text** establish primary content and subordinate metadata.
- **White** is used on gradient actions and as the shared slider's default fill and thumb.
- **Paper**, **sepia** and **night** each pair a reader page background with its ink color. The night-tone button uses its own existing, slightly lighter background; it is not an exact page-color swatch.

### Functional color

**Danger** and **danger surface** identify removal actions. They are status colors, not a second brand accent.

## Typography

The interface uses the system sans-serif stack. Screen headings are strong and slightly tight; buttons and section tabs use semibold or bold text. Supporting metadata is smaller and dimmer. No display typeface or geometric type scale is established in the source.

The frontmatter roles record the observed screen heading, reader title, card title, title fallback, button and navigation styles. The body role intentionally records only the font family: the global stylesheet does not declare a body font size or line height.

Reflowable books default to Georgia with Times New Roman and serif fallbacks. The optional sans-serif reading stack is independent of the interface stack. Text size can range from 14 to 32 pixels; line spacing offers 1.4, 1.65 and 1.9. The selected size and line spacing determine pagination. Document headings retain semantic hierarchy with a compact line height, and reading links remain underlined.

## Layout

The application is centered with a maximum width of 640 pixels below the tablet breakpoint and 1200 pixels from 768 pixels upward. The shared navigation is sticky, reserves 68 pixels plus the top safe area and presents Music, Audio Books, Reader and Video in that order. The selected tab fills its equal-width segment.

The reader library uses 24-pixel horizontal padding and a cover grid with auto-filled columns of at least 170 pixels, with 26-pixel row and 22-pixel column gaps. At widths up to 599 pixels it uses two equal columns, 16-pixel page padding and 24-by-16-pixel grid gaps; the search field takes a complete row. These are surface-specific rules, not a universal card grid.

An open book fills the viewport below navigation. Its compact heading and horizontally scrollable toolbar sit above a flexible document area; page-number navigation sits below it. The document frame keeps the dark controls outside the reading tone. A 300-pixel panel sits beside the document on wider screens. At widths up to 767 pixels it overlays the document, capped at 340 pixels. Fullscreen fills the application viewport with only a small bottom-right exit icon; its touch target respects safe areas.

Reflow text has a maximum content width of 760 pixels, 28-pixel minimum horizontal insets and 24-pixel vertical insets. Paged layout uses a 40-pixel inter-column gap. Short landscape screens compact the controls. Tablet media players also adapt their existing controls and artwork layout; their rules remain in the global stylesheet.

## Elevation & Depth

Most application structure comes from dark tonal layers and thin translucent borders. The interface is not globally flat: the mini-player and full-player artwork have shadows, the slider thumb has a small shadow, and PDF pages have a restrained page shadow. Reader covers lift on hover-capable devices; mobile reader panels cast a side shadow when they overlay the page.

Exact shadow declarations are recorded in the sidecar. Keep each shadow attached to its observed role rather than applying the largest player shadow to ordinary cards. Cover movement is enabled only when reduced motion is not requested; the global reduced-motion rule minimizes other animation and transition durations.

## Shapes

The established radii distinguish rounded containers, smaller controls and cover corners. Section tabs are pills; icon controls and slider thumbs are circular. The reader's fallback and image covers share a portrait 2:3 outline with clipped corners. Real cover images are contained inside that outline, preserving their complete image rather than filling by cropping.

Reader inputs retain a one-pixel border; selected tone buttons use an outline. Document pages remain rectangular. The corner and spacing primitives in the frontmatter are observed reusable values, not a new normalization of every local measurement.

## Components

### Buttons

Primary buttons reuse the violet-to-purple gradient, white text and small control radius. Secondary buttons use the translucent surface and primary text; destructive buttons use the danger treatment. Standard actions use a short press scale. Reader toolbar actions are a smaller-text variant with a minimum height of 44 pixels; pressed panel buttons use the existing muted-purple selection treatment.

Circular icon buttons use the translucent surface, with a stronger surface on press. Their base size is 42 pixels and the coarse-pointer rule increases the minimum target to 44 pixels. Reader and library focus outlines use the lighter reader focus color; global controls use the accent outline. Disabled reader buttons reduce opacity and use a default cursor.

### Inputs / Fields

The library search and selects use elevated dark backgrounds, a thin translucent border and the small control radius. Search grows to consume remaining row space. Placeholder text uses the dim text color. The reading panel uses matching dark inputs; its font and spacing selects sit above the page tone rather than adopting it. Page-number input is compact, centered and uses tabular numerals alongside its count.

### Navigation

Four shared section buttons use equal flexible widths and rounded pill shapes. The active section has a gradient fill and white text; inactive sections use dim text. Labels and inline icons remain aligned. At 480 pixels and below the navigation reduces horizontal padding and type size; at 359 pixels and below it hides the icons. Keyboard focus remains visible.

### Reader cover cards

A card's open button contains its cover, title, optional author, format, reading status and thin progress bar. Title fallbacks show the existing book icon, document title and format against the muted-purple cover background. Cover titles wrap and clamp; card titles occupy up to two lines, while author metadata truncates. On hover-capable devices, the cover lifts slightly and receives a shadow. Removing a local copy opens the existing in-card confirmation with Remove and Keep actions.

### Reader tone controls

Three adjacent buttons select Paper, Sepia or Night. Each uses its corresponding existing tone colors, and the selected button receives the reader focus outline. Reflow content uses the actual tone pairs. PDF and image content use the existing sepia or night image filters, so they are not guaranteed to match reflow-page colors exactly.

### Shared progress slider

`ProgressSlider` is the shared native range input for media progress and related range controls. It has a 44-pixel control box, 8-pixel visible track and 30-pixel circular thumb with a two-pixel border. The filled track and thumb share a customizable color; the remaining track is translucent white. The reader does not display a progress slider; its text-size setting still uses the shared range component.

The component clamps supplied values, handles invalid bounds, and disables a range with no available span. It forwards native input semantics and accessibility attributes. Keep the global raw-range rules distinct from this component's more-specific styles; they coexist in the current source.

## Do's and Don'ts

### Do:

- **Do** preserve the dark shell, purple action treatment and shared navigation when extending the application.
- **Do** use the existing CSS custom properties for shell colors and radii; treat the frontmatter as a snapshot of those source values.
- **Do** use actual local cover images when available and the existing title-card fallback otherwise.
- **Do** keep reader page tones and reading-font preferences separate from the application controls.
- **Do** reuse ProgressSlider for media progress and retain its accessible label, keyboard operation and disabled state.
- **Do** retain the responsive cover grid, horizontally scrollable reader toolbar and mobile panel behavior.

### Don't:

- **Don't** introduce a replacement palette, typeface or visual identity as part of an ordinary extension.
- **Don't** fabricate book-cover artwork when the source document has no cover.
- **Don't** treat the document preview's synthesized tonal ramps as approved application colors.
- **Don't** crop book covers to fill the library card; the implemented cover treatment contains the full image.
- **Don't** use reading-page tones to recolor the shared navigation or reader toolbar.

### Reader touch interactions

Toolbar actions are icon-only with accessible names and titles. PDF/images support pinch zoom and single-finger panning; text pinch adjusts font size. Page changes use a short 180ms directional motion, disabled for reduced motion and automatic layout changes. Fullscreen hides all reading chrome except the bottom-right exit target. New Playlist uses an inline focused text field, Cancel and Create, with recoverable save errors.
