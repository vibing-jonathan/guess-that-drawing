---
name: Guess That Drawing
description: A live editorial comics desk for clear, private, realtime drawing games.
colors:
  cool-proof-gray: "#d9dcde"
  proof-stock: "#f4f5f2"
  clean-canvas: "#ffffff"
  carbon-ink: "#111318"
  on-carbon: "#e6e8ea"
  on-carbon-muted: "#b9bec4"
  production-muted: "#4f555e"
  proof-keyline: "#a9aeb3"
  surface-chrome: "#e4e6e7"
  violet-private: "#6d3bff"
  violet-private-hover: "#5830db"
  violet-private-subtle: "#eee9ff"
  signal-yellow: "#ffd91a"
  signal-yellow-hover: "#efc900"
  signal-yellow-subtle: "#fff8cb"
  cyan-confirm: "#007f9e"
  cyan-confirm-subtle: "#e5f9ff"
  magenta-danger: "#b51f5b"
  magenta-danger-subtle: "#ffe9f1"
  focus-cyan: "#00a9e8"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(3.3rem, 2.2rem + 3.2vw, 5.6rem)"
    fontWeight: 900
    lineHeight: 0.9
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(2.4rem, 1.8rem + 1.7vw, 3.55rem)"
    fontWeight: 800
    lineHeight: 0.95
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(1.4rem, 1.2rem + 0.62vw, 1.8rem)"
    fontWeight: 800
    lineHeight: 0.95
  body:
    fontFamily: "Work Sans Variable, Work Sans, system-ui, sans-serif"
    fontSize: "clamp(1rem, 0.97rem + 0.1vw, 1.0625rem)"
    fontWeight: 400
    lineHeight: 1.55
  control-label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.02rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.035em"
  metadata:
    fontFamily: "Work Sans Variable, Work Sans, system-ui, sans-serif"
    fontSize: "clamp(0.75rem, 0.72rem + 0.08vw, 0.8125rem)"
    fontWeight: 700
    lineHeight: 1.28
    letterSpacing: "0.045em"
rounded:
  square: "0"
  compact: "0.125rem"
  panel: "0.2rem"
  overlay: "0.25rem"
  feature: "0.375rem"
  round: "999px"
spacing:
  "0": "0"
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "8": "2rem"
  "10": "2.5rem"
  "12": "3rem"
  "16": "4rem"
  "20": "5rem"
  "24": "6rem"
components:
  button-primary:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.carbon-ink}"
    typography: "{typography.control-label}"
    rounded: "{rounded.compact}"
    padding: "0 1rem"
    height: "3rem"
  button-primary-hover:
    backgroundColor: "{colors.signal-yellow-hover}"
    textColor: "{colors.carbon-ink}"
    typography: "{typography.control-label}"
    rounded: "{rounded.compact}"
    padding: "0 1rem"
    height: "3rem"
  button-secondary:
    backgroundColor: "{colors.proof-stock}"
    textColor: "{colors.carbon-ink}"
    typography: "{typography.control-label}"
    rounded: "{rounded.compact}"
    padding: "0 1rem"
    height: "3rem"
  button-danger:
    backgroundColor: "{colors.magenta-danger}"
    textColor: "{colors.clean-canvas}"
    typography: "{typography.control-label}"
    rounded: "{rounded.compact}"
    padding: "0 1rem"
    height: "3rem"
  field:
    backgroundColor: "{colors.clean-canvas}"
    textColor: "{colors.carbon-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.compact}"
    padding: "0.5rem 0.75rem"
    height: "3rem"
  panel:
    backgroundColor: "{colors.proof-stock}"
    textColor: "{colors.carbon-ink}"
    rounded: "{rounded.panel}"
    padding: "clamp(1rem, 2vw, 1.5rem)"
  status-badge:
    backgroundColor: "{colors.proof-stock}"
    textColor: "{colors.carbon-ink}"
    typography: "{typography.metadata}"
    rounded: "{rounded.round}"
    padding: "0.25rem 0.5rem"
  private-prompt:
    backgroundColor: "{colors.violet-private}"
    textColor: "{colors.clean-canvas}"
    typography: "{typography.title}"
    rounded: "{rounded.square}"
    padding: "0.75rem 1rem"
  drawing-canvas:
    backgroundColor: "{colors.clean-canvas}"
    textColor: "{colors.carbon-ink}"
    rounded: "{rounded.compact}"
    width: "100%"
---

# Design System: Guess That Drawing

## Overview

**Creative North Star: "The Live Comics Desk"**

Guess That Drawing is staged as an independent-comics production desk in motion. Cool proof stock, carbon keylines, compact prepress marks, and decisive condensed type turn each room state into an active proof: social and expressive, but controlled enough that a player always knows the private information, current phase, and next legal action.

The system rejects both the soft pastel doodle app and the neon game-show shell. Personality comes from panel rhythm, imposition details, halftone texture, editorial typography, and the contrast between clean drawing proofs and dark production chrome. Saturated colors remain operational: violet marks private or selected state, cyan confirms connection and success, and signal yellow identifies the dominant action or deadline.

Product access commitments remain part of the system. Semantic controls, visible focus, screen-reader labels and live announcements, keyboard operation, touch-sized targets, reduced-motion equivalents, and layouts that survive a 320px viewport are preserved across setup, play, reveal, and recovery.

**Key Characteristics:**

- Carbon mastheads and keylines over cool proof-gray and near-white stock
- Condensed, high-impact production type paired with practical Work Sans copy
- Violet private states, cyan confirmation, and signal-yellow legal actions
- Flat editorial panels with sparse crop, registration, halftone, and annotation details
- A clean white drawing proof that remains the dominant active surface
- Responsive recomposition that preserves task order rather than shrinking the desk

## Colors

The palette behaves like production ink on proof stock: neutrals carry the desk, while three saturated signals communicate state and priority.

### Primary

- **Signal Yellow** (`colors.signal-yellow`): the dominant legal action, current setup step, room-code proof, deadline, selection highlight, and winning emphasis.
- **Signal Yellow Hover** (`colors.signal-yellow-hover`): active pointer feedback for yellow actions.
- **Signal Yellow Wash** (`colors.signal-yellow-subtle`): warning, waiting, and caption surfaces that need emphasis without becoming the primary action.

### Secondary

- **Private Violet** (`colors.violet-private`): private prompts, selected state, active proof, and the strongest editorial accent.
- **Private Violet Hover** (`colors.violet-private-hover`): deeper interactive feedback for violet links and private-state controls.
- **Private Violet Wash** (`colors.violet-private-subtle`): selected rows and private informational surfaces.

### Tertiary

- **Confirmation Cyan** (`colors.cyan-confirm`): connection, completion, and success.
- **Confirmation Cyan Wash** (`colors.cyan-confirm-subtle`): success banners and completed steps.
- **Danger Magenta** (`colors.magenta-danger`): blocking errors and destructive actions.
- **Danger Magenta Wash** (`colors.magenta-danger-subtle`): written error guidance and quieter danger surfaces.
- **Focus Cyan** (`colors.focus-cyan`): the high-visibility keyboard focus ring.

### Neutral

- **Cool Proof Gray** (`colors.cool-proof-gray`): the application ground around bounded production surfaces.
- **Proof Stock** (`colors.proof-stock`): the default panel, form, and card surface.
- **Clean Canvas** (`colors.clean-canvas`): drawing, writing, and form-entry proofs; also text on sufficiently dark signals.
- **Carbon Ink** (`colors.carbon-ink`): mastheads, primary text, icons, and structural borders.
- **On-Carbon / On-Carbon Muted** (`colors.on-carbon`, `colors.on-carbon-muted`): text and metadata inside carbon regions.
- **Production Muted** (`colors.production-muted`): secondary copy outside dark chrome.
- **Proof Keyline / Surface Chrome** (`colors.proof-keyline`, `colors.surface-chrome`): passive dividers and stable action rails.

**The Signal Assignment Rule.** Yellow means act or attend, violet means private or selected, cyan means confirmed, and magenta means blocking or destructive. Never swap these roles for variety.

**The Clean Proof Rule.** White belongs to active drawing, writing, and entry surfaces. It does not replace proof stock as the general page ground.

**The No-Color-Alone Rule.** State always has a label, icon, structural position, or pattern in addition to color.

## Typography

**Display Font:** Barlow Condensed, with Arial Narrow and sans-serif fallbacks  
**Body Font:** Work Sans Variable, with Work Sans and system sans-serif fallbacks

**Character:** Barlow Condensed supplies the urgent voice of issue labels, room codes, headlines, timers, and actions. Work Sans carries instructions, forms, metadata, chat, and dense game state without adopting a generic dashboard tone.

### Hierarchy

- **Display** (`typography.display`): the entry statement and rare outcome-scale moments; tight, heavy, and allowed to break into short stacked lines.
- **Headline** (`typography.headline`): page titles, round announcements, and room-code values.
- **Title** (`typography.title`): panel titles, private prompts, mode names, and result labels.
- **Body** (`typography.body`): instructions and conversational copy, normally constrained to a readable 36–65 character measure.
- **Control Label** (`typography.control-label`): uppercase buttons and compact production controls.
- **Metadata** (`typography.metadata`): uppercase step, state, and byline data that supports rather than carries the next action.

**The Two-Presses Rule.** Barlow Condensed announces the production state; Work Sans explains and operates it. Do not introduce rounded display, handwriting, serif, or monospace novelty faces.

**The Short-Label Rule.** Uppercase condensed type is for concise production language. Instructions and multi-line guidance stay in sentence-case Work Sans.

## Layout

The spatial system uses the inherited 4/8-pixel rhythm, fluid gutters, and bounded containers at 42rem, 68rem, 94rem, and 116rem. Hard adjoining panel gutters establish editorial sequence; whitespace inside each proof keeps the interface legible. The home surface demonstrates the grammar with four unequal panels and a six-stage rail, while setup and gameplay reuse the grammar without pretending to be the same composition.

Wide gameplay places roster and social support in narrow side proofs around a flexible canvas. Setup uses a bounded stage, numbered production steps, and a stable action rail. Phone mode treats the private assignment as the active proof. At 74rem the entry strip becomes a two-by-two imposition; below 64rem game support regions stack or become sheets; below 48rem primary flows become a single task-ordered column. The 26.875rem compact threshold removes lower-priority masthead facts rather than compressing critical labels.

Horizontal phase rails may scroll when their sequence is wider than a phone, but the primary document and form region must not gain a competing nested viewport. Safe-area insets, long names, private prompts, zoom, and 320px layouts remain first-class constraints.

**The Active Proof Rule.** The canvas, writing surface, or current setup form is the largest and clearest object in its phase; roster, chat, chrome, and decoration remain supporting proofs.

**The Recompose, Don’t Miniaturize Rule.** Responsive layouts change order and topology to preserve the task. They do not scale a desktop imposition until labels and targets fail.

**The Honest Rail Rule.** Progress rails communicate server-owned sequence; only controls that are actually actionable may look navigable.

## Elevation & Depth

Depth is structural and sparse. Carbon borders, tonal panels, and adjoining gutters do most of the work. Shadows appear on important physical proofs, hoverable choices, overlays, and game shells; they are soft production lift, not hard offset decoration.

### Shadow Vocabulary

- **Proof Rest** (`1px 2px 8px rgb(17 19 24 / 8%)`): mode and theme cards at rest.
- **Active Proof** (`3px 5px 16px rgb(17 19 24 / 15%)`): primary actions, the drawing canvas, avatar spotlight, and raised cards.
- **Overlay Desk** (`7px 12px 32px rgb(17 19 24 / 24%)`): dialogs, setup frames, game shells, and blocking state cards.
- **Focus Halo** (`0 0 0 5px rgb(0 169 232 / 28%)`): supplements the three-pixel focus outline.

**The Keylines Before Lift Rule.** Establish grouping with carbon borders and tonal contrast first. Add elevation only when an object must read as interactive, active, or overlaid.

**The Sparse Proof Detail Rule.** Halftone, crop, registration, and annotation marks frame the work; they stay outside dense copy and never masquerade as controls.

## Shapes

The system is nearly square. Shared panels and repeated rows use square or hairline-soft corners; controls and canvas proofs use the compact radius; overlays receive only a slightly larger corner. Full pills are reserved for intrinsically compact statuses, avatar circles, signals, and swatches.

One-pixel lines divide passive content, two-pixel carbon rules define controls and panel boundaries, and three-pixel rules mark exceptional emphasis. Repeated cards remain aligned to the production grid; crop and registration geometry may sit at the perimeter but must remain unmistakably decorative.

**The Proof-Cut Rule.** Routine cards and controls remain between square and `rounded.panel`. Do not drift back to soft, bubbly containers.

## Components

Components feel like production objects: decisive labels, carbon edges, compact geometry, immediate state feedback, and targets of at least 44px.

### Buttons

- **Primary:** signal-yellow fill, carbon label and border, compact radius, 3rem minimum height, and active-proof lift.
- **Secondary:** proof-stock fill with carbon label and border; hover moves to the signal-yellow wash.
- **Danger:** magenta fill with white label and carbon border; quieter danger retains written guidance on a wash.
- **States:** hover lifts the yellow action two pixels, active settles one pixel and reduces elevation, disabled removes lift, and keyboard focus retains both outline and halo.

### Chips

- **Style:** full-pill status badges use a one-pixel border, explicit icon or label, and the semantic wash matching the state.
- **State:** selected tools combine fill with a selected class, visible icon/label change, and focus treatment.

### Cards / Containers

- **Panels:** proof-stock fill, two-pixel carbon edge where structural, near-square corner, and no shadow by default.
- **Choices:** mode and theme cards add low rest lift, active-proof hover lift, and a violet inset registration bar when selected.
- **Dark proofs:** avatar stages, mastheads, gameplay status bars, and winner summaries use carbon with on-carbon text.

### Inputs / Fields

- **Style:** clean-white entry surface, two-pixel carbon edge, compact radius, visible Work Sans label, and 3rem minimum height.
- **Focus:** violet border plus the global focus-cyan outline and halo.
- **Error / Success:** magenta or cyan edge with written guidance; color never carries validation alone.

### Navigation

There is no persistent global navigation. Setup uses a numbered, labeled progress strip and stable back/forward actions. Gameplay uses role, timer, and labeled support sheets; the server-owned phase rail never pretends to be freely navigable.

### Drawing Proof & Tool Rail

The white canvas uses a two-pixel carbon edge, compact radius, and active-proof shadow. Drawing tools sit in a hard-edged surface-chrome rail with 44px targets, visible selected states, and labeled equivalents where an icon alone would be ambiguous.

### Private Prompt

Private information is a violet proof with white condensed title type and explicit privacy labeling. It stays structurally separate from public room state and remains visually dominant only for the player who can act on it.

### Production Rails

Home and setup rails use adjoining cells, bold condensed stage names, compact Work Sans descriptions, and a single filled current cell. Mobile rails preserve the whole sequence through bounded horizontal scrolling or compact equal-width cells.

Motion acknowledges state: 150ms for immediate control feedback, 200ms for ordinary transitions, 260ms for emphasis, and 300ms for overlays and authored proof changes. Reduced-motion mode removes spatial animation while preserving final state and feedback.

**The One Legal Action Rule.** Each state gets one signal-yellow dominant action; secondary controls and support panels stay visually quieter.

**The Motion Explains Rule.** Movement may clarify arrival, selection, score change, countdown urgency, or spatial continuity. It never loops for decoration or delays a legal move.

## Do's and Don'ts

### Do:

- **Do** preserve the cool-proof-stock, carbon-keyline, and clean-canvas hierarchy.
- **Do** keep yellow for action or attention, violet for private or selected state, cyan for confirmation, and magenta for blocking danger.
- **Do** pair condensed production type with practical Work Sans copy.
- **Do** use panel sequence, sparse imposition marks, and halftone fields to express the comics desk without reducing contrast.
- **Do** preserve semantic controls, visible focus, live announcements, 44px targets, reduced motion, and 320px support.
- **Do** recompose support regions around the active proof on smaller screens.

### Don't:

- **Don't** return to pastel doodle-app softness, rounded novelty type, or a neon game-show shell.
- **Don't** use gradients, glass, glow-heavy chrome, rainbow accents, or ambient shadows on every surface.
- **Don't** use white as the general application ground or proof stock as the drawing canvas.
- **Don't** make decorative crop, registration, annotation, or phase marks look interactive.
- **Don't** make routine cards pill-shaped, over-round repeated containers, or rotate controls for personality.
- **Don't** let chat, roster, scores, texture, or motion compete with the private prompt, active canvas, timer, or next legal action.
