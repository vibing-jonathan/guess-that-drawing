# Design System: Guess That Drawing

**Status:** Authoritative production specification
**Scope:** Responsive web, light theme only
**Canonical artifact:** `DESIGN.md`
**Design source:** User-supplied brief; no Stitch project ID is assigned

This system makes the drawing canvas feel like a fresh sheet of paper dropped onto a warm tabletop. Expressive Nunito headings bring party-game energy; restrained DM Sans UI, strong ink outlines, and a disciplined four-color semantic palette keep play fast, legible, and grown-up.

---

## 1. Product and experience principles

### 1.1 Visual atmosphere

- **Playful, not juvenile.** Use confident color blocks, rounded geometry, and concise copy. Avoid nursery motifs, confetti fields, and novelty fonts.
- **Crafted, not messy.** The sketchbook character comes from two-pixel ink outlines, small offset shadows, and occasional ruled-paper details outside active play. Do not rotate interface components or add simulated smudges behind content.
- **Tabletop, not dashboard.** Screens should feel composed around an activity: a clear central object, a few nearby controls, and socially meaningful side content. Avoid generic KPI cards and admin-style grids.
- **Canvas-first.** Pure white is reserved for drawing. In a game, the canvas is always the largest, highest-contrast visual object.
- **Quiet during play.** Reduce decoration, shadow, and supporting copy once a round starts. Color indicates action, status, or private feedback—not ambient decoration.
- **Warm but precise.** Paper and warm-white surfaces soften the shell; ink, focus rings, and predictable alignment make every interaction unambiguous.

### 1.2 Product hierarchy

1. Current turn and remaining time.
2. Drawing canvas or current round outcome.
3. The player’s next legal action.
4. Social context: guesses, player status, and score movement.
5. Secondary room and theme controls.

Never allow room decoration, chat, player avatars, or score animation to compete with the canvas or the current legal action.

### 1.3 Interaction principles

- Every visible control has a visible label; icon-only controls are allowed only where space is constrained and must have an accessible name plus tooltip.
- Every pointer target is at least `44×44px`; primary mobile actions should be `48–56px` high.
- State changes are confirmed in place and announced when useful. Avoid unnecessary navigation after a small action.
- Keyboard and pointer interactions are equivalent. No essential interaction depends on hover, drag alone, or color alone.
- Private information remains private in structure, placement, and announcement—not merely by color.
- Motion explains state or spatial change and lasts `150–300ms`. It never delays a legal move.

---

## 2. Color palette and semantic roles

### 2.1 Core palette

Values are recorded in both source hex and CSS-ready OKLCH. Use the OKLCH token in implementation; the hex value is the immutable visual reference.

| Role | Natural-language color | Hex | OKLCH | Use |
|---|---|---:|---:|---|
| Page background | Warm sketchbook paper | `#F6F1E7` | `oklch(0.959 0.014 84.6)` | App shell and non-game background |
| Surface | Soft warm white | `#FFFDF8` | `oklch(0.994 0.007 88.6)` | Cards, panels, dialogs, sheets |
| Canvas | Pure white | `#FFFFFF` | `oklch(1 0 0)` | Drawing canvas only; tiny white text is allowed on dark fills |
| Ink | Deep blue graphite | `#1F2937` | `oklch(0.278 0.030 256.8)` | Main text, icons, strong outlines |
| Muted ink | Cool pencil slate | `#5F6B7A` | `oklch(0.523 0.028 254.1)` | Secondary text; `4.82:1` on paper |
| Border | Graphite wash | `#D7D0C5` | `oklch(0.860 0.017 79.3)` | Dividers and default one-pixel borders |
| Strong border | Worn graphite | `#918A80` | `oklch(0.637 0.017 77.0)` | Inputs, inactive controls, structural outlines |
| Primary | Confident cobalt | `#1D4ED8` | `oklch(0.488 0.217 264.4)` | Primary actions, active turn, links, focus |
| Accent | Warm coral | `#C2415A` | `oklch(0.564 0.164 12.7)` | Special emphasis, close-guess energy, destructive action |
| Success/support | Clear teal | `#0F766E` | `oklch(0.511 0.086 186.4)` | Success, connected state, supportive hints |
| Highlight | Pencil yellow | `#FACC15` | `oklch(0.861 0.173 91.9)` | Selected word, score change, transient highlight |

### 2.2 Complete color tokens

```css
:root {
  color-scheme: light;

  /* Canonical six-token brand contract */
  --bg: oklch(0.959 0.014 84.6);        /* #F6F1E7 */
  --surface: oklch(0.994 0.007 88.6);   /* #FFFDF8 */
  --fg: oklch(0.278 0.030 256.8);       /* #1F2937 */
  --muted: oklch(0.523 0.028 254.1);    /* #5F6B7A */
  --border: oklch(0.860 0.017 79.3);    /* #D7D0C5 */
  --accent: oklch(0.564 0.164 12.7);    /* #C2415A */

  /* Foundations */
  --color-paper: var(--bg);
  --color-surface: var(--surface);
  --color-canvas: oklch(1 0 0);         /* #FFFFFF */
  --color-ink: var(--fg);
  --color-text-muted: var(--muted);
  --color-border: var(--border);
  --color-border-strong: oklch(0.637 0.017 77);    /* #918A80 */
  --color-disabled-bg: oklch(0.920 0.012 84.6);   /* #E8E4DC */
  --color-disabled-text: oklch(0.488 0.014 79.7); /* #645F57 */
  --color-scrim: oklch(0.278 0.030 256.8 / 0.56);

  /* Cobalt primary */
  --color-primary: oklch(0.488 0.217 264.4);         /* #1D4ED8 */
  --color-primary-hover: oklch(0.424 0.181 265.6);   /* #1E40AF */
  --color-primary-pressed: oklch(0.379 0.138 265.5); /* #1E3A8A */
  --color-primary-subtle: oklch(0.966 0.016 262.8);  /* #EEF4FF */
  --color-primary-border: oklch(0.770 0.099 263.2);  /* #93B4F4 */
  --color-on-primary: oklch(1 0 0);                  /* #FFFFFF */
  --color-on-primary-subtle: oklch(0.383 0.145 263.5); /* #173B8F */

  /* Coral accent and danger */
  --color-accent: oklch(0.564 0.164 12.7);         /* #C2415A */
  --color-accent-hover: oklch(0.507 0.150 12);      /* #A9364E */
  --color-accent-pressed: oklch(0.432 0.127 10.1);  /* #872A40 */
  --color-accent-subtle: oklch(0.969 0.015 12.4);   /* #FFF1F2 */
  --color-accent-border: oklch(0.810 0.106 11.6);   /* #FDA4AF */
  --color-on-accent: oklch(1 0 0);                  /* #FFFFFF */
  --color-on-accent-subtle: oklch(0.410 0.150 10.3); /* #881337 */
  --color-danger: var(--color-accent-hover);
  --color-danger-subtle: var(--color-accent-subtle);
  --color-on-danger-subtle: var(--color-on-accent-subtle);

  /* Teal success and support */
  --color-success: oklch(0.511 0.086 186.4);         /* #0F766E */
  --color-success-hover: oklch(0.437 0.071 188.2);   /* #115E59 */
  --color-success-pressed: oklch(0.386 0.059 188.4); /* #134E4A */
  --color-success-subtle: oklch(0.984 0.014 180.7);  /* #F0FDFA */
  --color-success-border: oklch(0.855 0.125 181.1);  /* #5EEAD4 */
  --color-on-success: oklch(1 0 0);                  /* #FFFFFF */
  --color-on-success-subtle: oklch(0.437 0.071 188.2); /* #115E59 */

  /* Yellow highlight and warning */
  --color-highlight: oklch(0.861 0.173 91.9);         /* #FACC15 */
  --color-highlight-hover: oklch(0.795 0.162 86);     /* #EAB308 */
  --color-highlight-pressed: oklch(0.681 0.142 75.8); /* #CA8A04 */
  --color-highlight-subtle: oklch(0.973 0.069 103.2); /* #FEF9C3 */
  --color-highlight-border: oklch(0.795 0.162 86);    /* #EAB308 */
  --color-on-highlight: oklch(0.286 0.064 53.8);      /* #422006 */
  --color-on-highlight-subtle: oklch(0.421 0.090 57.7); /* #713F12 */

  /* Semantic aliases */
  --color-info: var(--color-primary);
  --color-info-subtle: var(--color-primary-subtle);
  --color-warning: var(--color-highlight);
  --color-warning-subtle: var(--color-highlight-subtle);
  --color-focus: var(--color-primary);
  --color-link: var(--color-primary);
  --color-link-hover: var(--color-primary-hover);
}
```

### 2.3 Contrast-safe pairings

| Foreground / background | Contrast | Approved use |
|---|---:|---|
| Ink / paper | `13.04:1` | All text |
| Ink / surface | `14.44:1` | All text |
| Muted ink / paper | `4.82:1` | Normal secondary text |
| Muted ink / surface | `5.34:1` | Normal secondary text |
| White / cobalt | `6.70:1` | Button text and icons |
| White / coral | `5.00:1` | Accent or destructive button text |
| White / teal | `5.47:1` | Success button text and icons |
| Dark brown ink / yellow | `9.52:1` | Highlight text and icons |
| Disabled text / disabled background | `4.99:1` | Readable disabled label; disabled state also needs shape/cursor treatment |

Do not place white text on yellow. Do not use border colors as text colors. Never express success, warning, danger, connection, turn ownership, or close-guess feedback by color alone.

### 2.4 Color discipline

- Cobalt is the only primary-action color.
- Coral appears at most twice in a view: one active accent and, when needed, a danger or close-guess treatment.
- Yellow is a highlight surface, not a general button color. Use dark text on it.
- Teal communicates confirmed success, connection, or support. It must not mark “your turn”; cobalt owns turn state.
- Pure white belongs to the drawing canvas. Small white-on-color text is the exception.
- Do not use gradients, translucency-heavy glass surfaces, or decorative rainbow palettes.

---

## 3. Typography

### 3.1 Families

```css
:root {
  --font-display: "Nunito Variable", "Nunito", ui-rounded, sans-serif;
  --font-body: "DM Sans Variable", "DM Sans", system-ui, sans-serif;
}
```

- Self-host variable WOFF2 files when possible. Use weights `600–800` for Nunito and `400–700` for DM Sans.
- Nunito is for page titles, round announcements, word cards, and prominent scores. Do not use it for dense chat or form help.
- DM Sans is for body copy, labels, inputs, chat, menus, buttons, and all compact game UI.
- Do not introduce a display serif, handwriting font, or monospace font. Timers and scores use DM Sans tabular figures.

### 3.2 Fluid scale

```css
:root {
  --text-xs: clamp(0.75rem, 0.73rem + 0.08vw, 0.8125rem);
  --text-sm: clamp(0.875rem, 0.85rem + 0.10vw, 0.9375rem);
  --text-body: clamp(1rem, 0.98rem + 0.10vw, 1.0625rem);
  --text-lg: clamp(1.125rem, 1.07rem + 0.24vw, 1.25rem);
  --text-xl: clamp(1.25rem, 1.12rem + 0.52vw, 1.5rem);
  --text-2xl: clamp(1.5rem, 1.28rem + 0.90vw, 2rem);
  --text-3xl: clamp(1.875rem, 1.55rem + 1.35vw, 2.625rem);
  --text-4xl: clamp(2.25rem, 1.70rem + 2.20vw, 3.5rem);
  --text-score: clamp(2.5rem, 1.85rem + 2.60vw, 4rem);

  --leading-tight: 1.08;
  --leading-heading: 1.16;
  --leading-ui: 1.35;
  --leading-body: 1.55;
  --tracking-tight: -0.025em;
  --tracking-label: 0.015em;
  --measure-body: 68ch;
  --measure-compact: 48ch;
}
```

| Style | Family / weight | Line height | Use |
|---|---|---:|---|
| Display | Nunito `800` | `1.08` | Home hero and final result only |
| Page title | Nunito `750–800` | `1.16` | Screen headings |
| Section title | Nunito `700` | `1.2` | Group labels and dialogs |
| Body | DM Sans `400–500` | `1.55` | Instructions and supporting copy |
| UI label | DM Sans `600` | `1.35` | Buttons, controls, tabs |
| Timer / score | DM Sans `700`, tabular | `1` | Timers, room score, rankings |

```css
.numeric {
  font-family: var(--font-body);
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: "tnum" 1, "lnum" 1;
}
```

- Mobile body text never drops below `16px`; compact labels may be `14px` only when not carrying instructions.
- Long instructions use `max-inline-size: var(--measure-body)`. Dialog and sheet copy uses `var(--measure-compact)`.
- Buttons and status labels use sentence case. Avoid all caps except the visually hidden expansion of short room codes.
- Do not squeeze headings with negative tracking beyond `-0.025em`.

---

## 4. Geometry, spacing, and elevation

### 4.1 Token set

```css
:root {
  /* 4/8px rhythm */
  --space-0: 0;
  --space-1: 0.25rem;  /* 4 */
  --space-2: 0.5rem;   /* 8 */
  --space-3: 0.75rem;  /* 12 */
  --space-4: 1rem;     /* 16 */
  --space-5: 1.25rem;  /* 20 */
  --space-6: 1.5rem;   /* 24 */
  --space-8: 2rem;     /* 32 */
  --space-10: 2.5rem;  /* 40 */
  --space-12: 3rem;    /* 48 */
  --space-16: 4rem;    /* 64 */
  --space-20: 5rem;    /* 80 */
  --space-24: 6rem;    /* 96 */

  /* Corners: rounded, not bubbly */
  --radius-xs: 0.375rem; /* 6 */
  --radius-sm: 0.5rem;   /* 8 */
  --radius-md: 0.75rem;  /* 12 */
  --radius-lg: 1rem;     /* 16 */
  --radius-xl: 1.375rem; /* 22 */
  --radius-round: 999px; /* avatars, swatches, status dots only */

  --border-hairline: 1px;
  --border-standard: 2px;
  --border-emphasis: 3px;

  /* Outlined, lightly hand-set depth */
  --shadow-flat: 0 1px 0 oklch(0.278 0.030 256.8 / 0.08);
  --shadow-raised: 2px 3px 0 oklch(0.278 0.030 256.8 / 0.14);
  --shadow-overlay:
    0 16px 40px oklch(0.278 0.030 256.8 / 0.18),
    2px 3px 0 oklch(0.278 0.030 256.8 / 0.12);
  --shadow-focus: 0 0 0 4px oklch(0.488 0.217 264.4 / 0.24);

  --icon-xs: 1rem;      /* 16 */
  --icon-sm: 1.25rem;   /* 20 */
  --icon-md: 1.5rem;    /* 24 */
  --icon-lg: 2rem;      /* 32 */

  --control-sm: 2.75rem; /* 44 */
  --control-md: 3rem;    /* 48 */
  --control-lg: 3.5rem;  /* 56 */

  --tap-target: 2.75rem; /* 44 */
}
```

### 4.2 Shape rules

- Default buttons, inputs, tool controls, cards, and banners use `--radius-md`.
- Large sheets, dialogs, lobby panels, and the canvas shell use `--radius-lg` or `--radius-xl`.
- Reserve full pills for avatar chips, compact statuses, short segmented control tracks, and tags. Most cards and buttons must not be pills.
- Use two-pixel borders on interactive components and the canvas shell. One-pixel rules separate content.
- The “hand-set” character comes from `--shadow-raised`, never from arbitrary component rotation. A single hero word card may rotate by at most `1deg`; repeated controls and gameplay surfaces remain aligned.
- Shadows are opaque enough to define layers but never blurred into floating glass. Do not stack decorative outlines.

---

## 5. Responsive layout system

### 5.1 Breakpoints and containers

```css
:root {
  --bp-compact: 390px;
  --bp-tablet: 768px;
  --bp-desktop: 1024px;
  --bp-wide: 1440px;

  --container-sm: 40rem;   /* focused forms */
  --container-md: 64rem;   /* lobby and editor */
  --container-lg: 90rem;   /* game shell */
  --container-wide: 112rem;

  --page-gutter: clamp(1rem, 0.65rem + 1.5vw, 2rem);
  --section-gap: clamp(2rem, 1.4rem + 2vw, 4rem);

  --safe-top: env(safe-area-inset-top, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
}
```

CSS custom properties cannot drive media-query conditions directly; implementations use the documented literal thresholds:

```css
@media (min-width: 390px) { /* compact-plus */ }
@media (min-width: 768px) { /* tablet */ }
@media (min-width: 1024px) { /* desktop */ }
@media (min-width: 1440px) { /* wide */ }
```

| Width | Composition rule |
|---|---|
| `<390px` | Single-column, essential actions only, 16px gutters, sheets for supporting content |
| `390–767px` | Mobile composition with slightly larger canvas and two-up setup controls where safe |
| `768–1023px` | Tablet composition; canvas remains full-strength, supporting panels become tabs, rails, or sheets |
| `1024–1439px` | Three-region game layout; compact left and right rails |
| `≥1440px` | Three-region layout with more breathing room, never a larger chat-to-canvas ratio |

### 5.2 General responsive rules

- No horizontal scrolling at `360`, `390`, `430`, `600`, `768`, `820`, `1024`, `1366`, `1440`, or `1920px`.
- Page shells use `inline-size: min(100% - 2 * var(--page-gutter), var(--container-*)); margin-inline: auto`.
- Respect all four safe-area insets. Mobile fixed docks include `padding-bottom: max(var(--space-3), var(--safe-bottom))`.
- Use `min-inline-size: 0` on grid and flex children. Wrap room names and player names; truncate only when the full value is available to assistive technology and on focus/tooltip.
- Do not shrink controls below their token height. Change the composition instead: collapse labels, move secondary groups into a sheet, or reduce columns.
- Portrait and landscape mobile both keep the canvas first. In short landscape, put status in a slim left rail and tools in a slim right or bottom rail; never reduce tools below `44px`.

### 5.3 Game shell

Desktop at `≥1024px`:

```css
.game-shell {
  display: grid;
  grid-template-columns:
    minmax(13rem, 17rem)
    minmax(32rem, 1fr)
    minmax(17rem, 21rem);
  grid-template-areas: "players play chat";
  gap: clamp(0.75rem, 1.4vw, 1.5rem);
  max-inline-size: var(--container-wide);
}
```

- Left: players and scores.
- Center: compact status, dominant canvas, compact tool row.
- Right: chat/guess log and guess composer.
- The center track must stay wider than either side rail. At `1024–1180px`, reduce rail padding and content density before reducing the canvas.
- The canvas uses the largest viable rectangle within the viewport with its authored aspect ratio preserved. Avoid a fixed pixel size.

Tablet at `768–1023px`:

- Use a two-row composition: compact status, canvas, and tools first; supporting content second.
- Player score summary becomes a horizontally scroll-free two-column list or a collapsible panel.
- Chat/guess composer remains directly reachable; message history may live in an adjacent tab or sheet.
- Never shrink swatches, slider thumbs, or toolbar targets. Wrap tool groups or open an “More drawing tools” sheet.

Mobile below `768px`:

- Top status bar: round, masked word or drawer word, timer, and connection indicator.
- Canvas immediately follows and uses available width. Keep at least `8px` breathing room from screen edges.
- Bottom drawing dock for the drawer; bottom guess composer for guessers. It is safe-area aware and never obscures the canvas.
- Players and chat/history open in labeled sheets or tabs. Show unread counts as text-equivalent badges, not color-only dots.
- In portrait, sheets slide from the bottom. In landscape, a side sheet is allowed if it leaves the canvas dominant.
- The canvas element uses `touch-action: none`; page chrome around it preserves normal scrolling. Prevent browser gesture conflicts only within the active drawing area.

---

## 6. Z-index, focus, and motion

### 6.1 Layer scale

```css
:root {
  --z-base: 0;
  --z-raised: 10;       /* sticky local headers, selected cards */
  --z-dock: 20;         /* drawing dock, mobile guess composer */
  --z-dropdown: 30;     /* menus, color popovers */
  --z-tooltip: 40;
  --z-sheet-scrim: 50;
  --z-sheet: 60;
  --z-dialog-scrim: 70;
  --z-dialog: 80;
  --z-toast: 90;
  --z-critical: 100;    /* reconnect/server outage blocking status */
}
```

Do not invent one-off values. A child cannot escape an ancestor stacking context; avoid transforms on page shells and gameplay columns.

### 6.2 Focus and keyboard treatment

```css
:where(button, a, input, select, textarea, [role="button"], [role="tab"], [role="slider"]):focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
  box-shadow: var(--shadow-focus);
}
```

- Focus must remain visible over paper, surface, canvas, cobalt, and coral. On a cobalt control, add an inner white outline or use `outline: 3px solid #FFFFFF` plus the cobalt outer ring.
- Do not remove focus outlines unless an equal or stronger replacement is rendered.
- Roving focus is required for toolbar groups, segmented controls, tabs, word choices, and swatch grids.
- `Escape` closes the topmost non-blocking overlay and returns focus to its trigger.
- Opening a modal dialog or sheet moves focus to its heading or first legal control. Closing it restores focus.
- Disabled controls remain readable, are omitted from the tab order, and expose the disabled state semantically.

### 6.3 Motion tokens

```css
:root {
  --motion-instant: 0ms;
  --motion-fast: 150ms;
  --motion-base: 200ms;
  --motion-emphasis: 260ms;
  --motion-max: 300ms;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}
```

- Hover and press: `150ms`.
- Banners, tooltips, menus: `150–200ms`.
- Sheets, dialogs, result transitions: `200–300ms`.
- Use opacity and translations of `4–12px`. Never animate from `scale(0)`; if scale is needed, use `0.96–1`.
- Timer updates do not pulse every second. Animate only threshold changes at 10 and 5 seconds, with text plus icon/label support.
- Score changes may count once over `260ms`, while the exact final value remains immediately available to assistive technology.
- No continuous canvas-adjacent decorative animation.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Reduced-motion mode preserves state changes with immediate opacity swaps, text updates, and focus movement. Do not hide information because its animation is disabled.

---

## 7. Iconography and imagery

- Use one consistent outlined, Lucide-compatible SVG set with `round` line caps and joins.
- Default stroke is `2px`; use `2.25px` only for large empty-state art. Icons inherit `currentColor`.
- Standard sizes are `16`, `20`, `24`, and `32px`; controls normally use `20` or `24px`.
- Never use emoji as controls, statuses, avatars, or feedback.
- Icon-only controls require `aria-label` and a tooltip. Decorative icons use `aria-hidden="true"`.
- Status icons must be paired with visible text: `Wifi` + “Connected,” `CloudOff` + “Server unavailable,” `Lightbulb` + “Very close.”
- Avatars may use authored simple line-art faces, objects, or creatures. They must share the same outline weight and must not imitate platform emoji.
- Keep illustrative motifs outside the active game shell. The canvas never receives decorative overlays.

---

## 8. Core component patterns

### 8.1 Buttons

All buttons are at least `44px` high, have a visible text label unless the compact toolbar contract applies, and keep a minimum `12px` gap between adjacent targets.

| Variant | Rest | Hover | Pressed | Focus | Disabled |
|---|---|---|---|---|---|
| Primary | Cobalt fill, white label, `2px` cobalt border, raised shadow | Darker cobalt, shadow retained | Pressed cobalt, shadow contracts to `1px 1px` | White inner + cobalt outer ring | Disabled surface/text, no shadow |
| Secondary | Warm surface, ink label, strong border | Primary subtle tint, cobalt border | Primary subtle tint, `1px` shadow | Cobalt ring | Disabled surface/text |
| Accent/danger | Coral fill, white label | Coral hover | Coral pressed | White inner + cobalt outer ring | Disabled surface/text |
| Quiet | Transparent, ink label | Warm surface | Primary subtle tint | Cobalt ring | Muted label |
| Icon tool | `44×44px`, surface, strong border | Primary tint | Cobalt fill when active, white icon | Cobalt ring | Disabled surface/text |

- Pressed state uses both fill and a `1–2px` downward translation; it must not rely on motion alone.
- Loading replaces a leading icon with a stroked spinner, preserves the label and width, sets `aria-busy="true"`, and blocks repeat submission.
- Destructive confirmation uses explicit copy such as “Leave room,” never “Yes.”

### 8.2 Inputs and text areas

- Visible label above the field; optional help below. Placeholder text is an example, not the label.
- Base: surface fill, `2px` strong border, `--radius-md`, `48px` minimum height, `16px` input text.
- Hover: ink border. Focus: cobalt border plus focus ring. Filled: unchanged structure.
- Error: coral/danger border, `CircleAlert` icon, and a specific error message linked with `aria-describedby`.
- Success is shown only when useful, with teal border, `CircleCheck`, and text.
- Disabled: disabled fill/text and semantic `disabled`; read-only uses surface fill plus a lock or copy affordance where relevant.
- Password-like room values are not used. Room codes remain visible and easy to copy.
- Submission on `Enter` is allowed only when it cannot create accidental multiline loss; chat uses `Enter` to send and `Shift+Enter` for a newline.

### 8.3 Segmented controls and tabs

- Use for `2–4` mutually exclusive views such as Players / Chat or Public / Private.
- Track: surface fill, `2px` border, `--radius-md`; segments are at least `44px` high.
- Selected segment: cobalt fill and white text. Also set `aria-selected="true"` or native checked state.
- Arrow keys move through segments; `Home` and `End` jump to first/last.
- Badges include a number or “New,” never an unlabeled colored dot.
- Do not use segmented controls for primary navigation across unrelated setup screens.

### 8.4 Cards and containers

- Standard card: warm surface, `1–2px` border, `--radius-lg`, `--shadow-flat`.
- Interactive card: `2px` strong border; hover may use `--shadow-raised`; selection uses cobalt border plus a top-right `Check` and the text “Selected.”
- Avoid a rounded card around every paragraph. Group by task or decision.
- Cards never use a colored left border as their only state marker.

### 8.5 Player and avatar chips

- Avatar: `40px` in dense score rows, `48px` in lobby lists, `64–96px` in profile selection.
- Player chip contains avatar, display name, and optional status. It may be pill-shaped because its content is identity-sized.
- Current drawer: cobalt outline plus `Pencil` icon and visible “Drawing.”
- Current user: append visually clear “You.”
- Disconnected: muted appearance plus `WifiOff` and “Reconnecting,” never opacity alone.
- Host: `Crown` icon plus “Host”; do not use yellow alone.
- Names wrap once or truncate with the complete accessible name preserved.

### 8.6 Score rows

- Order: rank, avatar/name, role/status, score.
- Score uses tabular DM Sans and aligns to the end edge.
- A score delta appears as `+120` with a `TrendingUp` icon and teal text for one result transition; the numeric label supplies the meaning.
- Ties share rank and receive the same visual weight.
- The current player row uses a primary-subtle background and “You,” not a different ordering rule.

### 8.7 Room-code field

- Use a labeled group: “Room code,” a large `4–6` character code, Copy button, and optional Share button.
- Code uses DM Sans `700`, tabular lining figures, `0.12em` letter spacing, and at least `24px` text.
- Copy confirmation changes the label to “Copied” with `Check` for two seconds and announces politely.
- Joining accepts pasted codes, ignores spaces/hyphens, normalizes case, and shows the normalized value.
- Error copy distinguishes invalid, expired, full, and kicked states; do not show a generic “Something went wrong.”

### 8.8 Theme cards

- A theme card contains name, one-line prompt description, visibility, edit affordance, and selection state.
- Use text or authored line iconography, not unrelated stock thumbnails.
- Selected state: cobalt border, `Check`, and “Selected.”
- Built-in themes and custom themes have explicit labels. Private themes show `LockKeyhole` + “Room only.”
- Editing opens the theme editor; selecting never silently edits.

### 8.9 Chat and guess bubbles

- Guess log uses compact rows rather than oversized conversational bubbles when message volume is high.
- Own message: primary-subtle surface. Other message: warm surface. System event: unboxed centered text with icon.
- Correct guesses never reveal the submitted word publicly during an active turn; replace content with `CircleCheck` + “Sam guessed the word.”
- Close-guess feedback is not inserted into the public log.
- Messages expose author and time to assistive technology. Avoid relying on left/right alignment to identify the sender.
- The composer has a visible “Your guess” label on mobile and an accessible label everywhere, a character limit, Send button, and error/status region.

### 8.10 Private feedback banners

- Render adjacent to the guess composer, not in public chat.
- Close guess: highlight-subtle background, highlight border, `Lightbulb` icon, bold “Very close,” and text such as “Check the spelling.” Include a small `LockKeyhole` plus “Only you can see this.”
- Invalid guess: accent-subtle background, `CircleAlert`, and specific corrective text.
- Already guessed: success-subtle background, `CircleCheck`, “You already found it—watch the drawing and cheer them on.”
- Use `role="status"` and `aria-live="polite"`; do not steal focus.
- Never reveal edit distance, target letters, or drawer-only information.

### 8.11 Toasts and live regions

- Toasts confirm non-blocking actions such as copy, theme save, or restored connection.
- Position: top end on desktop; above the safe-area bottom dock on mobile.
- Maximum three visible; newer toasts queue. Auto-dismiss informational toasts after `4–6s`; errors persist until dismissed or resolved.
- Each toast includes icon, concise text, and optional action. Dismiss controls have accessible names.
- Use a dedicated visually hidden polite live region for ordinary updates and an assertive region only for blocking loss of play, server outage, or ejection.
- Do not announce every timer second or every stroke.

### 8.12 Dialogs and sheets

- Dialogs handle focused decisions: leave room, delete theme, round summary. Sheets handle supporting content: players, chat history, tool overflow.
- Desktop dialog max width `32rem`; complex editor dialog max `44rem`. Mobile dialogs use `calc(100% - 2rem)` unless the flow benefits from a bottom sheet.
- Bottom sheets have a visible heading and close button. A drag handle may be decorative but cannot be the only close mechanism.
- Trap focus only in modal surfaces. Set background inert. Restore trigger focus on close.
- Blocking connection and outage states are dialogs/banners only when gameplay truly cannot continue.

### 8.13 Word cards

- During selecting-word, show `3` choices as real buttons with a visible “Choose a word” group label.
- Each card uses Nunito `700`, ink text, warm surface, and `2px` border. Hover adds primary border; selected uses cobalt fill and white text.
- Choices remain text, never icon-only. Keyboard users can tab or use arrow keys; selection requires one activation.
- Do not rank or hint at difficulty unless the game supplies real difficulty data.
- On mobile, stack vertically; keep all choices above the fold when practical without shrinking below `48px`.

### 8.14 Timer

- Use DM Sans `700` tabular numerals. Pair the number with a visible “seconds” label when context is not obvious and an accessible name such as “18 seconds remaining.”
- Normal: ink. At `10s`: yellow-subtle container plus `Clock3` and “Hurry.” At `5s`: coral-subtle plus `AlarmClock` and “5 seconds.”
- The timer may use a filled progress track; never an outline-only ring. The progress bar has an accessible text equivalent.
- Do not pulse each second. One threshold transition is enough.
- When time expires, announce “Time’s up” once and transition to the result state.

### 8.15 Masked word

- Guesser view shows fixed-width grapheme slots or underscores with spaces preserved and a text equivalent such as “Two words, five and four letters.”
- Drawer view shows the full word in a yellow-subtle card labeled “Your word.”
- Revealed letters use ink and are announced only when the game actually reveals them.
- Never expose the full word in DOM text, accessible labels, analytics attributes, or tooltips for guessers.

### 8.16 Connection status

- Connected: teal, `Wifi`, “Connected.”
- Reconnecting: yellow-subtle, `RefreshCw`, “Reconnecting…” with a non-spinning reduced-motion equivalent.
- Offline: coral-subtle, `WifiOff`, “You’re offline.”
- Restored: teal toast, `Wifi`, “Back online.”
- Status sits in the compact top bar and is always text-equivalent. A dot may accompany it but never stand alone.
- Avoid optimistic “Connected” until the multiplayer session is actually synchronized.

### 8.17 Canvas shell

- Pure white canvas inside a `2px` ink border, `--radius-lg`, and restrained `--shadow-raised`.
- Keep the authored drawing coordinate system stable across resizing. Scale presentation with `contain`; map input coordinates back to the canonical canvas.
- Maintain visible canvas bounds on paper and surface backgrounds.
- The canvas is the dominant visual object in every game state, including read-only guesser mode.
- Drawer canvas: interactive, `touch-action: none`, keyboard-accessible toolbar. Guesser canvas: read-only with an accessible status “Drawing in progress.”
- Provide undo/redo status outside the canvas. Do not overlay chat, timer, scores, or decoration on the drawing.
- If drawing cannot be made fully keyboard-operable, offer keyboard-accessible shape/stamp tools and an equivalent clear/undo workflow; document the remaining freehand limitation honestly.

### 8.18 Drawing toolbar

- Primary tools: pencil, eraser, stroke color, stroke size, undo, redo, clear. Secondary tools may open from “More tools.”
- Each control is `44×44px` minimum with a visible label in expanded layouts and an accessible name everywhere.
- Use a semantic toolbar with a visible “Drawing tools” label. Arrow keys rove through controls.
- Active tool: cobalt fill, white icon, and `aria-pressed="true"`.
- Undo/redo disabled state is semantic and readable. Clear opens a confirmation when destructive.
- Desktop: compact row directly beneath or beside canvas. Tablet: wrapping row without target shrinkage. Mobile: safe-area bottom dock with the most-used tools first.
- Shortcuts appear in tooltips and never replace labels: `P` pencil, `E` eraser, `[` / `]` size, `Cmd/Ctrl+Z` undo.

### 8.19 Color swatches

- Swatches are at least `44×44px`, arranged in a labeled grid with roving focus.
- Each has a text name in its accessible label, such as “Cobalt blue.” Do not expose hex alone.
- Selected swatch has an ink double ring plus `Check`; selection cannot depend on the swatch hue.
- Include black/ink and a controlled drawing palette. Do not let game-semantic colors imply UI state inside the drawing palette.
- A custom color picker is optional and belongs in a popover or sheet; it requires a visible label and current-value preview.

### 8.20 Sliders

- Stroke-size slider has a visible “Brush size” label, numeric or verbal current value, and a live preview dot.
- Track is at least `4px`; interaction region and thumb are at least `44px`.
- Arrow keys change one step; Page Up/Down change larger steps; Home/End set bounds.
- Use an accessible native range input where possible. Focus ring surrounds the thumb or full control.
- Pair range with discrete presets on mobile when precision is difficult.

### 8.21 Tooltips

- Tooltips supplement labels; they do not contain essential instructions or interactive content.
- Show after `400–600ms` hover delay, immediately on keyboard focus, and dismiss on pointer leave, blur, or `Escape`.
- Use ink background and white DM Sans text, `--radius-sm`, no more than two lines.
- Keep within the viewport and outside the active stroke area. Do not show on coarse pointers unless triggered deliberately.

### 8.22 Leaderboards

- Use a ranked list, not a dashboard table. Top three receive stronger typography and a restrained yellow highlight for the winner.
- Every row includes numeric rank, avatar/name, score, and optional round delta.
- Winner treatment includes `Trophy` + “Winner”; yellow alone is insufficient.
- Ties share rank. Do not silently reorder tied players.
- Final leaderboard provides primary “Play again” and secondary “Leave room” actions. The host also receives “Change settings.”
- On mobile, keep name and score visible; move round breakdown into an expandable row or detail sheet.

---

## 9. Screen composition

### 9.1 Home

- One decisive Nunito headline, one sentence of copy, and two actions: primary “Create a room,” secondary “Join a room.”
- A small authored sample canvas or line-art mark may establish the premise, but it must not resemble an active game canvas.
- Desktop: asymmetric two-column hero with actions on the left and visual on the right.
- Mobile: headline, action stack, then visual. Keep both actions in the initial viewport at `390×844` where practical.
- Do not add feature-card grids or invented player metrics.

### 9.2 Profile

- Focused form for display name and current avatar.
- Live preview is paired with explicit fields; saving is a clear primary action.
- Desktop/tablet: preview beside form. Mobile: compact preview above form.
- Validation is local and specific: name length, disallowed blank value, or duplicate where known.

### 9.3 Avatar selection

- Responsive grid of authored avatars with `64–96px` previews.
- Each option is a real radio or radio-like button with name, selected check, and visible focus.
- Filters are allowed only when the real collection is large enough to need them.
- Mobile uses `3–4` columns without reducing targets below `44px`.

### 9.4 Create room

- A short step flow: Profile, Mode & settings, Theme, Review. Phone Mode skips Theme and uses Profile, Mode & settings, Review. Avoid a long dashboard form.
- Each step has a clear heading, progress text such as “Step 2 of 4,” and Back/Continue controls.
- Desktop: form plus concise live summary. Mobile: single column; summary collapses after current fields.
- Defaults are visible and editable. Do not hide consequential rules behind an info icon.

### 9.5 Join room

- Room code is the dominant field, followed by identity confirmation and one “Join room” action.
- Paste is supported. Normalize code formatting without moving focus unexpectedly.
- Known failures render inline using the dedicated room-state patterns in Section 10.
- Mobile keyboard choice must suit alphanumeric codes and must not cover the primary action.

### 9.6 Theme editor

- Organize fields into theme name, prompt/word entries, visibility, and preview.
- Word entries use a clear list editor with count, validation, duplicate detection, and keyboard-accessible add/remove.
- Desktop: editor main column and sticky preview/validation summary. Tablet/mobile: preview becomes a collapsible section or sheet.
- Save has one primary placement. Unsaved changes are clearly indicated with text and confirmed before leaving.
- Do not fill the page with repeated cards; use ruled sections inside one focused editing surface.

### 9.7 Lobby

- Room code/share group at top, then player list, game settings summary, and host action.
- Host sees primary “Start game”; others see “Waiting for host” with a calm status icon.
- Ready states, if the game supports them, use text plus check/clock icons.
- Desktop: players and settings in a balanced two-column composition. Mobile: players first, settings disclosure second, action dock last.
- Do not simulate a game canvas in the lobby.

### 9.8 Game

- Apply the canvas-first composition from Section 5.3 without exception.
- Drawer: full toolbar and full word visible; guess composer removed.
- Guesser: read-only canvas, masked word, guess composer; drawing toolbar removed.
- Already-guessed: read-only canvas plus supportive private banner; composer disabled or replaced with a clear success state.
- Selecting-word: canvas remains reserved but visually quiet; word cards become the central legal action.
- Reconnecting: preserve the last synchronized canvas, disable irreversible actions, and show a clear connection banner without clearing player context.

### 9.9 Results

- Turn results: revealed word, drawer, who guessed, score deltas, and “Next round” countdown/action.
- Final results: winner statement, leaderboard, exact scores, and replay/leave actions.
- Desktop may pair result summary with leaderboard. Mobile stacks summary, leaderboard, then actions.
- Keep celebrations restrained: one authored flourish or brief stroke reveal, never full-screen confetti over important scores.

---

## 10. Game, room, and system states

### 10.1 Role and turn states

| State | Primary message | Available controls | Visual treatment | Announcement |
|---|---|---|---|---|
| Drawer | “Draw: lighthouse” | Drawing tools, undo/redo, clear | Full word in yellow-subtle card; cobalt active tool | “You are drawing. Your word is lighthouse.” |
| Guesser | “Guess the drawing” | Guess composer, players/chat sheets | Masked word; canvas read-only | “Sam is drawing. Enter your guess.” |
| Already guessed | “You got it!” | Players/chat, reactions if supported | Teal private banner; composer replaced/disabled | Polite success announcement once |
| Selecting word | “Choose a word” | Three word cards | Word cards are central; timer remains visible | “Choose one of three words.” |
| Reconnecting | “Reconnecting…” | Cancel/leave only if safe | Last canvas preserved; yellow banner | Assert only if play is blocked |
| Turn ended | “The word was lighthouse” | Continue/ready if required | Result summary and score deltas | Polite result summary |
| Final results | “Maya wins!” | Play again, leave; settings for host | Winner plus ranked list | Assert winner once, then polite details |

### 10.2 Close-guess privacy

- A close guess never appears in the public chat stream.
- The response is rendered only within the submitting player’s private composer region.
- Use `Lightbulb` + bold “Very close” + corrective text + `LockKeyhole` + “Only you can see this.”
- Use yellow-subtle or accent-subtle color only as reinforcement. Icon and text carry the meaning.
- Announce via that player’s polite live region. Never send a room-wide announcement.
- Do not disclose which letters are correct unless that is an explicit game rule.

### 10.3 Room-entry failures

| State | Icon + heading | Explanation | Primary action | Secondary action |
|---|---|---|---|---|
| Invalid code | `CircleX` + “Room not found” | “Check the code and try again.” | “Try another code” | “Create a room” |
| Expired room | `Clock3` + “This room has ended” | “The host closed it or the session expired.” | “Create a new room” | “Back home” |
| Full room | `UsersRound` + “Room is full” | “All player spots are taken.” | “Try another room” | “Back home” |
| Kicked | `LogOut` + “You were removed” | Neutral factual copy; preserve no private room data | “Back home” | “Join another room” |

- Errors are specific, persistent, and focus the heading on navigation to the state.
- Preserve the entered room code only for invalid/full cases where retry is reasonable.
- Do not repeatedly auto-retry invalid or kicked rooms.

### 10.4 Connection and server failures

**Transient reconnecting**

- Preserve last synchronized canvas and scores.
- Block drawing submission and guesses only when delivery cannot be guaranteed.
- Show attempt status and a visible “Leave room” escape after a reasonable delay.
- When restored, reconcile state before enabling controls and show a teal “Back online” toast.

**Server outage**

- Use a blocking surface with `CloudOff`, “The game server is unavailable,” concise impact, and honest retry status.
- Primary action: “Try again.” Secondary: “Back home” if home can function offline; otherwise “Reload.”
- Do not show a fake progress percentage or invented recovery time.
- Use assertive live announcement once. Avoid repeated announcements on each retry.

### 10.5 Turn results

- Reveal the word in Nunito with a “The word was” label.
- Show drawer and correct guessers. Do not shame non-guessers.
- Score deltas and totals both remain visible, use tabular figures, and settle within `260ms`.
- The next-round control is primary for the host only when host action is required; otherwise show an accurate countdown/status.
- Maintain player order until score settling completes, then reorder once with a clear position change.

### 10.6 Final leaderboard

- Name the winner with text and `Trophy`; yellow highlight reinforces the result.
- Show the complete ranked list and exact final scores.
- Ties are explicit: “Tied for 1st.”
- Primary action is “Play again.” Preserve the room and group when possible.
- Host-only settings action is clearly marked; non-hosts see “Waiting for host” after opting in.

---

## 11. Accessibility and input contract

### 11.1 Required baseline

- Target WCAG 2.2 AA.
- Support keyboard, mouse, touch, stylus, screen magnification, high zoom, and reduced motion.
- Interactive targets are at least `44×44px` with at least `8px` visual separation where possible.
- At `200%` zoom, content reflows without two-dimensional scrolling except the drawing canvas itself.
- DOM order matches the visual reading order at every breakpoint.
- Use landmarks: banner, navigation, main, complementary player/chat regions, and contentinfo where present.
- Use one `h1` per screen and a logical heading hierarchy inside dialogs and sheets.

### 11.2 Names, labels, and descriptions

- Visible labels are the default. `aria-label` is for compact icon tools only.
- Accessible names include purpose, not just icon: “Undo last stroke,” “Open players,” “Copy room code.”
- Counts include context: “3 unread chat messages,” “7 players.”
- Errors and help are connected with `aria-describedby`; invalid fields expose `aria-invalid="true"`.
- Do not put hidden full target words into guesser accessible names.

### 11.3 Keyboard model

- `Tab` moves between groups and independent actions.
- Arrow keys move within toolbars, tabs, segmented controls, radio grids, word choices, and swatches.
- `Space` activates buttons/toggles and draws only when a keyboard drawing mode is explicitly active.
- `Enter` submits room/join/setup forms and guesses where safe.
- `Escape` closes the topmost non-blocking overlay; a confirmation prevents accidental room exit.
- Undo/redo shortcuts follow platform conventions and are disabled only when unavailable.

### 11.4 Live updates

- Polite: copied code, close guess, correct guess, score update, connection restored, player joined/left.
- Assertive: kicked, server unavailable, turn forcibly ended, connection lost when interaction is blocked.
- Do not announce each stroke, pointer move, timer tick, or decorative animation.
- Avoid duplicating visible text into multiple live regions.

### 11.5 Canvas equivalence

- The game is visual by nature, but surrounding state, current role, timer, word mask structure, tool selection, and results must be exposed semantically.
- Provide keyboard-operable structured tools where feasible.
- Never claim the freehand drawing surface is fully screen-reader equivalent. Keep the rest of the round playable and understandable, and document any remaining limitation in product accessibility notes.

---

## 12. Content and voice

- Warm, direct, and specific: “Room is full” beats “Oops! Something went wrong.”
- Use party language sparingly. The game should feel friendly without exclamation marks on every surface.
- Prefer verbs: “Create room,” “Join room,” “Choose a word,” “Send guess.”
- Never blame a player for network or validation failures.
- Private status says who can see it: “Only you can see this.”
- Use sentence case. Keep headings short enough to wrap to two lines at `360px`.
- Do not invent activity, player counts, scores, recovery estimates, or theme content.

---

## 13. Implementation guardrails

### Required

- Light theme only with `color-scheme: light`.
- Supplied paper, surface, canvas, and ink values remain unchanged.
- Cobalt primary, coral accent/danger, teal success/support, and yellow highlight use the verified contrast pairings in this document.
- Nunito for expressive headings; DM Sans for body, UI, timers, and scores.
- Lucide-compatible outlined SVGs; no emoji controls.
- Canvas-first game composition at all breakpoints.
- Visible focus, semantic state, keyboard access, `44×44px` targets, and reduced-motion handling.
- Private close-guess feedback stays structurally private and uses icon plus text.

### Prohibited

- Gradients, glassmorphism, fake 3D, glossy skeuomorphism, or blurred translucent cards.
- Generic dashboard grids, metric tiles, or sidebar-first game layouts.
- Decorative clutter over or around the active canvas.
- Excessive rotation, simulated torn paper, random squiggle borders, or distressed text.
- Pill shapes on most buttons and cards.
- Color-only state, unlabeled dots, hover-only disclosure, or inaccessible drag-only interactions.
- Emoji controls, mixed icon families, stock “AI sparkle” motifs, purple gradient washes, or template-style feature-card rows.
- Full-screen celebration effects that cover scores, actions, or the canvas.

---

## 14. Game modes and synchronized Phone Mode

### 14.1 Mode selection and setup flow

- Step 2 is always “Mode & settings” and presents three real radio-card choices: Classic, Pro, and Phone. Each card includes a name, plain-language rule summary, selected text/check, visible focus, and full-card target of at least `44px`.
- Classic uses the established take-turns drawing and guessing model. Step 2 contains exactly these non-theme room settings: Player cap, Drawing cycles, Turn time, and Word selection time. Theme remains the separate step 3.
- Pro uses the Classic turn structure and the same separate Theme step. Step 2 contains Player cap, Drawing cycles, Turn time, and Word selection time, plus the visible rule “Incorrect guess: −25 points.” Do not hide this consequence in help text or a tooltip.
- Phone uses a three-step flow: Profile → Mode & settings → Review. It skips Theme entirely; back/continue navigation, progress semantics, and review copy must never imply that a theme is pending.
- Phone settings are Player cap (`4–12`), Text timer (`30–120` seconds, default `60`), Drawing timer (`60–180` seconds, default `120`), and a fixed four-link chain. Text and drawing timers are independent authoritative settings. The review states explicitly say that player sentences replace theme prompts and that chat and scoring are off.
- Classic and Pro use four-step progress with Theme before Review. Every mode gets its own review state and mode-specific summary before room creation.
- Changing the selected mode updates conditional settings, step count, summary, and legal next action together. Hidden mode fields are removed from submission and the accessibility tree rather than merely concealed visually.
- Rooms are private by code only. Setup presents this as informational copy, not a setting. There is no “Who can join?” control, host-approval option, or approval workflow.

### 14.2 Mode-aware lobby

- The lobby heading includes a persistent text mode badge. Color and icon may reinforce the badge but cannot replace the mode name.
- Classic lobby settings show player cap, drawing cycles, turn time, word selection time, and the selected theme.
- Pro lobby settings show the Classic values plus “Incorrect guess: −25 points” for both host and guests.
- Phone lobby settings show player cap, text timer, drawing timer, the four-link sequence, and “Theme, chat & scores: off.” Defaults are `60` seconds for text and `120` seconds for drawing. Player rows in Phone Mode never include scores.
- Phone Mode requires at least four synchronized players. Before the server confirms the fourth player, “Start” is disabled and the lobby states the current count, the minimum, and the recovery action (“Invite one more player”).
- A host can edit only the settings legal for the selected mode. Guests receive the same values as a read-only definition list and a clear waiting-for-host state.

### 14.3 Pro incorrect-guess feedback

- The server validates each submitted Pro guess before the client changes score.
- An incorrect guess remains visible in the public room chat as a normal guess with its submitting player and timestamp.
- The server applies `-min(25, currentScore)`, so the authoritative score never falls below zero. The resulting score change is public through the normal player/score update.
- Only the penalty feedback is private to the submitting player. It appears in that player’s action region with `CircleX`, “Incorrect guess,” the actual signed score delta, and the previous/resulting totals when authoritative. At the zero floor, the actual delta is `0`.
- Negative penalty feedback uses coral/danger semantics plus icon and text. Do not rely on color alone.
- Correct guesses remain suppressed and are replaced by the public “Name guessed the word” event. Close guesses remain private and are not published. Existing invalid, duplicate, rate-limited, and post-correct submission behavior remains unchanged.

### 14.4 Phone active phases

Phone Mode runs four simultaneous, server-synchronized phases:

1. **Write a sentence.** Every player writes one drawable sentence and submits privately.
2. **Draw an assigned prompt.** Every player receives a sentence from another chain and draws it on the standard canvas.
3. **Guess an assigned drawing.** Every player receives a drawing and writes the sentence they believe it represents.
4. **Draw an assigned guess.** Every player receives the phase-three sentence and creates the final drawing.

- The Write and Guess text tasks accept `1–180` characters after trimming leading and trailing whitespace. Both use a visible trimmed-character counter, a visible label, help text that states the range, `maxlength="180"`, and submission validation against the trimmed value.
- The active header says “Phone Mode,” names the task, and exposes “Phase N of 4” in visible text and an accessible progress list.
- Every player sees the same authoritative server deadline for the active phase. Phases 1 and 3 use the configured Text timer; phases 2 and 4 use the independently configured Drawing timer. The timer names which setting is active, shows a filled track, and never resets or extends from local focus, reload, backgrounding, or reconnect alone.
- Public player cards use only Working, Submitted, Skipped, or Disconnected, with icon and text. The phase heading and task copy describe whether players are writing, guessing, or drawing. A local connection banner may say Reconnecting, but that player’s synchronized public roster card says Disconnected. Phone status rows contain no score or rank.
- Assigned prompts and drawings are private. Their originating author is absent from visible copy, accessible names, DOM attributes, analytics payloads, tooltips, and network responses available to the recipient until summary.
- Submission locks the current private item and replaces the primary action with a Submitted state that explains the room will advance only on the authoritative phase transition.
- A skipped contribution is informational. The next contributor sees the most recent valid prompt or drawing plus a persistent visible skipped-step warning and count. Writing or drawing remains enabled, and work continues under the current authoritative phase deadline with no reset or extension.
- Reconnect preserves the local draft or last synchronized canvas, disables submission, resynchronizes assignment plus deadline, and enables submission only after both match the room.
- Phone Mode has no public chat, guess stream, score rows, rank, leaderboard, or score-shaped empty space during active phases.
- Drawing phases continue to use the established white canvas, tool semantics, confirmation behavior, and canvas-first hierarchy. Writing and guessing phases treat the single focused authoring surface as the dominant play object rather than replacing it with a dashboard.

### 14.5 Phone story summary

- Host and guest views reveal exactly one item at a time in this order: sentence → drawing → sentence → drawing.
- Attribution appears for the currently revealed item during summary only, using “Name wrote,” “Name drew,” or “Name guessed.” Earlier active-phase surfaces remain anonymous.
- The host owns Previous, Next item, and Finish story controls. Previous is disabled at the first item; Finish replaces Next only at the fourth item.
- The server broadcasts the host’s current story and item index. Guest views follow that index, expose a calm “Waiting for host” status, and provide no local reveal controls.
- The summary progress list names item type and exposes “Item N of 4.” Moving backward does not change the stored chain or attribution.
- Reconnecting during summary preserves the last confirmed item and waits for the server’s current index before enabling host controls or updating a guest view.

### 14.6 Phone completion and rematch

- Completion states celebrate the finished stories without selecting a winner. Do not render a leaderboard, rank, score, podium, winner copy, or competitive metric.
- Host completion provides Play again, an optional Change settings action that returns to the Phone lobby/settings, and Leave room. Only the host can trigger the rematch.
- Guest completion provides a clear Waiting for host state and Leave room. Guests have no rematch action, response control, participant list, or response status.
- Every Phone completion state includes Leave room.
- Rematch retains the room and players when possible, clears prior private chain content, and begins again at phase 1 with new assignments.

### 14.7 Responsive Phone behavior

- At `1440px`, active Phone phases use a narrow player-status column and a dominant central play column. They never add a chat/score sidebar.
- At `1024px` and `768px`, the play column comes first in DOM and visual priority; player statuses follow as a full-width supporting region without shrinking canvas or controls.
- At `390px`, phase/task/timer remain visible before the dominant play surface. The four-step progress reflows without horizontal scrolling, drawing tools use the established safe-area dock, and the primary submit/waiting state remains reachable without covering content.
- At `844×390` landscape, supporting roster content is removed from the immediate play viewport, compact phase progress remains visible, and the canvas or authoring surface receives the available height. Fixed drawing tools reserve content space.
- Setup, lobby, active phases, story summary, and completion have no horizontal overflow at `390`, `768`, `1024`, or `1440px`. They also remain usable at the broader acceptance widths in Section 15.

### 14.8 Phone accessibility and privacy

- Phase progress, story progress, private-assignment labels, authoritative timer, submission result, reconnect, persistent skipped-step warning/count, and guest waiting state all have text equivalents.
- Live regions announce a phase transition, successful submission, loss/restoration of synchronization, and host reveal change once. They do not announce each timer tick, drawing stroke, skipped-count repaint, or player-status update.
- Phone authoring controls meet the existing `44×44px` target and visible-focus contracts. Textareas and inputs retain visible labels; canvas limitations remain documented as in Section 11.5.
- The absence of author attribution before summary is a data-minimization requirement, not only a visual treatment.

---

## 15. Production acceptance checklist

### Visual system

- [ ] All color usage resolves to documented custom properties.
- [ ] No raw replacement colors, gradients, glass, or dark-theme branches appear.
- [ ] Pure white is reserved for the drawing canvas and approved white-on-color text.
- [ ] Nunito and DM Sans load with appropriate fallbacks and no layout-breaking flash.
- [ ] Hand-drawn character comes from outline/shadow tokens, not arbitrary rotation.

### Components and states

- [ ] Buttons, fields, tabs, cards, chips, score rows, room code, theme cards, chat, banners, overlays, word cards, timer, mask, connection, canvas, toolbar, swatches, sliders, tooltips, and leaderboard implement every documented state.
- [ ] Hover, pressed, focus, disabled, loading, selected, error, and success states are distinguishable without color alone.
- [ ] Close-guess feedback is private in both the UI tree and network/state model.
- [ ] Drawer, guesser, guessed, selecting, reconnecting, turn-result, and final-result states have one obvious legal next action.
- [ ] Invalid, expired, full, kicked, and outage states have specific copy and recovery actions.
- [ ] Setup step 2 is named “Mode & settings” everywhere. Classic and Pro expose Player cap, Drawing cycles, Turn time, and Word selection time before the separate Theme step.
- [ ] Phone setup, review, and lobby expose independent Text (`30–120`, default `60`) and Drawing (`60–180`, default `120`) timers; Phone uses three steps and never renders Theme.
- [ ] No setup or lobby surface exposes room approval controls; rooms remain private by code only.
- [ ] Pro incorrect guesses remain public chat guesses; the server applies `-min(25, currentScore)` with a zero floor, publishes the resulting player/score update, and returns only the actual signed penalty delta privately. Correct, close, and post-correct behavior remains unchanged.
- [ ] Phone Write and Guess accept `1–180` trimmed characters, expose visible counters and range help, and reject empty trimmed submissions.
- [ ] Phone public roster cards use only Working, Submitted, Skipped, or Disconnected; local Reconnecting copy never changes the public status contract.
- [ ] A skipped Phone contribution keeps authoring enabled, shows the latest valid prompt or drawing plus a persistent warning/count, and preserves the existing authoritative deadline without reset or extension.
- [ ] Phone phases 1–4 expose authoritative timing, private anonymous assignment, submission, skipped-step continuity, and reconnect behavior without chat or scores.
- [ ] Phone host/guest summaries remain synchronized and reveal one sentence/drawing item at a time with attribution only in summary.
- [ ] Phone completion contains no leaderboard, rank, score, winner, podium, participant list, or response status; only the host can Play again, while every player can Leave room.

### Responsive behavior

- [ ] No horizontal overflow at `360/390/430/600/768/820/1024/1366/1440/1920px`.
- [ ] Desktop game uses left players, central canvas/tools, and right chat.
- [ ] Tablet retains full-size controls and adapts supporting content.
- [ ] Mobile uses canvas-first status, safe-area bottom dock/composer, and accessible players/chat sheets or tabs.
- [ ] Portrait and landscape preserve canvas dominance.
- [ ] Home, profile, avatar, create, join, theme editor, lobby, game, and results follow their documented compositions.
- [ ] Phone setup, lobby, all four phases, skipped-step text/drawing states, summary, and completion pass at `1440`, `1024`, `768`, `390`, and `844×390` without overlap, clipping, long-prompt escape, hidden controls, or horizontal overflow.

### Accessibility and motion

- [ ] All controls have visible labels or accessible names and at least `44×44px` targets.
- [ ] Focus order, focus return, focus trapping, roving focus, and Escape behavior are verified.
- [ ] Text and essential non-text contrast meet WCAG 2.2 AA.
- [ ] Live regions announce meaningful events once and do not announce timer ticks or drawing strokes.
- [ ] Keyboard, touch, stylus, zoom, and screen-reader-adjacent states are tested.
- [ ] Every animation lasts `150–300ms` or less and has a complete reduced-motion equivalent.

When a screen-specific decision conflicts with this document, the canvas-first hierarchy, accessibility contract, and verified semantic color roles win.
