---
name: QuickCut
description: Video review tool, edge-native. The Edit Room as an interface.
colors:
  bg-primary-light: "#ffffff"
  bg-primary-dark: "#0d0d0f"
  bg-secondary-light: "#f7f7f8"
  bg-secondary-dark: "#161619"
  bg-tertiary-light: "#eeeef1"
  bg-tertiary-dark: "#1e1e22"
  bg-input-light: "#ffffff"
  bg-input-dark: "#232328"
  border-default-light: "#e3e3e8"
  border-default-dark: "#2a2a2f"
  border-hover-light: "#c8c8d0"
  border-hover-dark: "#3a3a42"
  text-primary-light: "#0d0d0f"
  text-primary-dark: "#f0f0f3"
  text-secondary-light: "#5a5a66"
  text-secondary-dark: "#a0a0ab"
  text-tertiary-light: "#8a8a94"
  text-tertiary-dark: "#6b6b76"
  signal-violet: "#6c5ce7"
  signal-violet-hover-light: "#5848d4"
  signal-violet-hover-dark: "#7c6ff0"
  accent-secondary-light: "#00a383"
  accent-secondary-dark: "#00b894"
  accent-warning-light: "#d97706"
  accent-warning-dark: "#f39c12"
  accent-danger-light: "#dc2626"
  accent-danger-dark: "#e74c3c"
  accent-info-light: "#2980b9"
  accent-info-dark: "#3498db"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3.5rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.02em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.signal-violet}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 20px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.signal-violet-hover-light}"
  button-secondary:
    backgroundColor: "{colors.bg-secondary-light}"
    textColor: "{colors.text-primary-light}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
    typography: "{typography.body}"
  button-danger:
    backgroundColor: "{colors.accent-danger-light}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 20px"
    typography: "{typography.body}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary-light}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
    typography: "{typography.body}"
  input:
    backgroundColor: "{colors.bg-input-light}"
    textColor: "{colors.text-primary-light}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.bg-secondary-light}"
    rounded: "{rounded.lg}"
    padding: "20px"
  chip-status:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary-light}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
    typography: "{typography.label}"
  modal:
    backgroundColor: "{colors.bg-secondary-light}"
    rounded: "{rounded.xl}"
    padding: "24px"
---

# Design System: QuickCut

## 1. Overview

**Creative North Star: "The Edit Room"**

QuickCut is an edit room rendered as software. A post-production suite at night: low light, a single bright frame in the center, instruments arranged around it. The interface is the room, not the showroom. The video is the only thing the eye should fight for; everything else is the panel around the panel.

The system runs in both dark and light, but dark is the home register. Dark mode is the "lights down to watch a cut" state; light mode is the "lights up to read the brief" state. Both modes tint every neutral toward a faint cool axis (no pure black, no pure white) so the frame has a perimeter the eye can locate. Surfaces are flat at rest. Depth is reserved for things that genuinely float — menus, popovers, modals, the timeline tooltip — not for buttons, not for cards, not for decoration.

Density is deliberate but never crowded. Inter is the only voice. JetBrains Mono is the timecode voice. The single accent — Signal Violet (`#6c5ce7`) — is rationed: it marks the path forward (primary CTA), the focus ring, the speaker initial avatar, the timeline scrub head. When it appears, it means something. When it appears next to itself, one of them is wrong.

This system explicitly rejects: SaaS-template gradients, glassmorphism-as-default, hero-metric card grids, side-stripe alert borders, identical icon-tile feature rows, gradient text, neon decorative glows, and any chrome that calls attention to itself while a video is playing. We are not Frame.io's enterprise weight, and we are not the AI-landing-page reflex.

**Key Characteristics:**
- **Flat surfaces, lifted overlays.** Pages don't have shadows; popovers do.
- **One accent, rationed.** Signal Violet occupies ≤10% of any screen.
- **Frame is the largest mass.** Anywhere the video appears, it owns the optical center.
- **Inter for everything; JetBrains Mono for timecodes.** No third font.
- **No pure black, no pure white.** Every neutral is tinted toward a cool axis.

## 2. Colors

The palette is a tinted dark/light dual system organized around one accent. Signal Violet does identity work; the secondary teal does success work; warning amber and danger red do their literal jobs. Info blue exists for share-link / share-state copy. Everything else is grayscale — but never grayscale-with-no-hue. Each neutral leans slightly cool.

### Primary

- **Signal Violet** (`#6c5ce7`): the one accent that earns its place. Primary buttons, focus rings, the timeline scrub head, the speaker initial in the comment compose, the brand wordmark accent. Hover: `#5848d4` (light) / `#7c6ff0` (dark). Used at ≤10% surface coverage per screen.

### Secondary

- **Approval Teal** (`#00a383` light / `#00b894` dark): the success voice. Approved states, "ready" status, accept-invite affordance, version-uploaded toasts. Never used decoratively.
- **Caution Amber** (`#d97706` light / `#f39c12` dark): the processing voice. The pulsing dot on Processing status badges, "uploading" indicators, target-date-near-now hints. Note: the light/dark variants differ in saturation more than ideal; treat as a known inconsistency until resolved.
- **Halt Red** (`#dc2626` light / `#e74c3c` dark): the destructive voice. Delete, revoke, error inline, "failed" badge.
- **Reference Blue** (`#2980b9` light / `#3498db` dark): the share-link voice. External link affordances, "active share" pill.

### Neutral

The neutral stack is six surface tones plus three text tones, all faintly cool-tinted. Light and dark mirror each other; the same role-name in both themes carries the same job.

- **Surface — Page** (`#ffffff` light / `#0d0d0f` dark): the page background. The light value is functionally white but the dark is near-black, not pure black. *Known issue: the light value should move to a tinted off-white like `#fafafb` per the no-pure-white rule.*
- **Surface — Panel** (`#f7f7f8` light / `#161619` dark): the secondary fill. Cards, sections, side panels, modal bodies, the comment column.
- **Surface — Recess** (`#eeeef1` light / `#1e1e22` dark): the tertiary fill. Inset chips, file-info recesses inside the upload modal, low-contrast pills.
- **Surface — Input** (`#ffffff` light / `#232328` dark): input fields. Slightly lighter than Panel in dark mode so fields read as openings, not as raised surfaces.
- **Stroke — Default** (`#e3e3e8` light / `#2a2a2f` dark): the resting border for cards, inputs, sections, modal frames.
- **Stroke — Hover** (`#c8c8d0` light / `#3a3a42` dark): the hover border for cards and interactive containers. Never used at rest.
- **Ink — Primary** (`#0d0d0f` light / `#f0f0f3` dark): body text. Headlines. Anything load-bearing.
- **Ink — Secondary** (`#5a5a66` light / `#a0a0ab` dark): meta text. Timestamps, helper text, "uploaded 2d ago."
- **Ink — Tertiary** (`#8a8a94` light / `#6b6b76` dark): de-emphasized text. Placeholders, disabled labels, resolved-comment body.

### Named Rules

**The One Voice Rule.** Signal Violet appears on ≤10% of any screen. If two violet things are within 100px of each other, kill one. The primary CTA, the focus ring, the timeline scrub head, the comment-compose avatar — these are the only canonical homes. Adding a fifth job dilutes all four.

**The No-Pure-Surface Rule.** No `#000`, no `#fff`. Every background, every panel, every text color is tinted. The player iframe currently uses `bg-black` (`#000`); that is a violation and needs a tinted player surface (`#0a0a0c`) introduced as its own token.

**The Color-Plus-Glyph Rule.** Status, urgency, and severity are never communicated by color alone. Always pair color with a glyph, label, or shape. Critical and Idea cannot look identical at a glance.

## 3. Typography

**Display Font:** Inter (fallback: `ui-sans-serif, system-ui, sans-serif`)
**Body Font:** Inter (same family, different weights)
**Label/Mono Font:** JetBrains Mono (fallback: `ui-monospace, monospace`)

**Character:** Inter does everything visible to a reviewer except numbers that need to align. JetBrains Mono is reserved for timecodes, upload percentages, share-link tokens, and any monospaced data the editor needs to scan in a column. The system has exactly two voices.

### Hierarchy

- **Display** (700, `clamp(2.25rem, 5vw, 3.5rem)`, line-height 1.05, letter-spacing `-0.02em`): hero headlines on the landing page only. Tight tracking pulls the form together at large sizes. Never used inside the app.
- **Headline** (700, `1.5rem`/24px, line-height 1.2, letter-spacing `-0.01em`): page titles. Dashboard `Projects` heading, settings page headings, notifications page heading.
- **Title** (600, `1.125rem`/18px, line-height 1.3): section titles inside a page. Card titles. Modal titles.
- **Body** (400, `0.875rem`/14px, line-height 1.5): the default. Comment text, helper text, form labels, button labels, navigation. Maximum line length 65–75ch.
- **Label** (500, `0.75rem`/12px, line-height 1.4, letter-spacing `0.02em`): status pill labels, chip text, table column headers, the eyebrow above a section heading.
- **Mono** (400, `0.8125rem`/13px, JetBrains Mono): timecodes (`0:12`, `01:23:45`), upload progress percentages (`42%`), share tokens.

### Named Rules

**The Two-Voice Rule.** Inter and JetBrains Mono. No third font. No display serif, no rounded variant, no condensed cut. If a screen needs more typographic differentiation, use weight (400 / 500 / 600 / 700) and size, not a new family.

**The Numerals-Are-Mono-When-Aligned Rule.** Numerals that appear in a column (durations, file sizes, upload percentages, comment counts in a list) use JetBrains Mono. Numerals that appear in prose (`2 days ago`, `3 unresolved`) use Inter.

**The 65ch Rule.** Body copy is capped at 65–75ch. The comment column is sized for this. The brief panel is sized for this. The script editor is sized for this. Wider columns betray a layout decision, not a typography one.

## 4. Elevation

The system is **flat surfaces, lifted overlays**. The page itself has no shadows. Cards have a 1px border and a tinted fill; that's the whole vocabulary of a surface at rest. Depth only appears on things that genuinely float above the page: dropdown menus, popovers, modals, the timeline-marker hover tooltip, the share-link copy popover. When you see a shadow, something is supposed to feel detached from the layer behind it.

The current codebase has a known anti-pattern that violates this: the primary button uses `hover:shadow-[0_2px_8px_rgba(108,92,231,0.3)]` (a purple glow). Buttons do not float. Remove. The card-hover shadow `hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]` is also a violation; if a card needs hover feedback, use a border darkening (`border-hover` token) instead.

### Shadow Vocabulary

- **Overlay — Subtle** (`box-shadow: 0 4px 12px rgba(0,0,0,0.15)`; Tailwind `shadow-lg`): dropdown menus, the comment-marker tooltip, small popovers. The "I'm close to the page but not on it" lift.
- **Overlay — Lifted** (`box-shadow: 0 10px 25px rgba(0,0,0,0.2)`; Tailwind `shadow-xl`): the user menu, space switcher, version switcher, target-date editor. The "I'm a real panel above the page" lift.
- **Overlay — Modal** (`box-shadow: 0 25px 50px rgba(0,0,0,0.3)`; Tailwind `shadow-2xl`): modals only. The "I'm blocking the page" lift, paired with the `bg-black/85` backdrop.

### Named Rules

**The Flat-By-Default Rule.** Surfaces at rest have no shadow. Ever. Cards, sections, panels, side rails, sidebars — flat. If a card has a shadow, you've borrowed a Material-3 reflex.

**The Floating-Means-Detached Rule.** Shadows mean "I'm not part of the layer behind me." Menus, popovers, modals. That is the complete list. Buttons aren't floating. Cards aren't floating. The CTA glow is not depth — it's decoration, and it's prohibited.

## 5. Components

### Buttons

- **Shape:** Gentle radius (`rounded-lg` / 8px). Consistent across sizes; we don't change radii by button size.
- **Primary:** Signal Violet background, white text, `px-5 py-2.5` / `px-4 py-2` (md / sm). Hover: violet shifts to hover-tone (`#5848d4` light / `#7c6ff0` dark). **No shadow on hover.** Disabled: `opacity-50` + cursor `not-allowed`.
- **Secondary:** `bg-secondary` fill, default-stroke border, primary ink. Hover: `bg-tertiary` fill. Use for second-tier actions on the same row as a primary.
- **Danger:** Halt Red fill, white text. Reserved for destructive confirms. Never a default action.
- **Ghost:** No background, secondary ink, optional icon. Hover: `bg-tertiary` fill + primary ink. Use for inline action verbs ("Mark read", "Use a different email").
- **Focus:** 2px Signal Violet ring with 2px page-color offset (`focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2`). Visible on keyboard focus only.
- **Transition:** `150ms` on all-properties. No bounce, no elastic.

### Chips & Status Pills

- **Shape:** Full-radius (`rounded-full`).
- **Style:** Tinted color background at `/15` alpha + colored text at full opacity. Pattern: `bg-accent-X/15 text-accent-X`.
- **Sizes:** Status badges use `px-2.5 py-0.5 text-xs font-medium`. Inline tag chips slightly larger (`px-3 py-1 text-xs`).
- **State (processing):** Color text + a small pulsing colored dot (`h-1.5 w-1.5 animate-pulse`) inset 6px from the text. The animation IS the affordance for "actively happening."
- **Color-plus-glyph rule:** Every status pill carries text. Pills are never color-only.

### Cards / Containers

- **Corner Style:** Soft radius. Card-as-content uses `rounded-xl` (12px); modals and very large panels use `rounded-2xl` (16px).
- **Background:** `bg-secondary` (`#f7f7f8` light / `#161619` dark).
- **Shadow Strategy:** None. Flat. See Elevation section.
- **Border:** 1px `border-default`. Hover (interactive cards only): border shifts to `border-hover`. No shadow on hover.
- **Internal Padding:** `p-5` (20px) is canonical. Smaller cards inside a list use `p-4`. Dialog content uses `p-6`.
- **Nesting:** Avoid. Cards inside cards is a slop pattern; if you need internal grouping, use a divider or a `bg-tertiary` recess instead.

### Inputs / Fields

- **Style:** `bg-input` fill, `border-default` border, `rounded-lg` (8px), `px-4 py-2.5` for default md size.
- **Typography:** Body (Inter 400, 14px). Placeholder uses `text-tertiary`.
- **Focus:** Border shifts to Signal Violet (`focus:border-accent-primary focus:outline-none`). No glow, no ring on inputs (the border shift is the affordance).
- **Disabled:** `opacity-50`.
- **Error:** Inline message in `bg-accent-danger/15 text-accent-danger` chip below the field. The input border itself does not change color on error — the message does the work. This avoids screaming-red field outlines.

### Modals

- **Size:** `sm` (max-w-sm), `md` (max-w-md), `lg` (max-w-lg). Most product modals are `sm`.
- **Frame:** `rounded-2xl` (16px), 1px `border-default`, `bg-secondary`, `p-6`, `shadow-2xl`.
- **Backdrop:** `bg-black/85 backdrop-blur-sm`. The backdrop blur is *only* permitted on the modal scrim, not as a decorative effect anywhere else in the system.
- **Close affordance:** Top-right `h-8 w-8` icon button, ghost styling, only when `showCloseButton` is true.
- **Default behavior:** `closeOnBackdropClick` and `closeOnEscape` are true unless the modal blocks a destructive choice. Forced-modal patterns are prohibited (see the share-page name modal in the open critique).

### Dropdowns / Menus

- **Width:** `w-44` to `w-72` depending on content. Avoid fixed widths beyond `w-80`.
- **Style:** `rounded-lg` or `rounded-xl`, 1px `border-default`, `bg-secondary`, `shadow-lg` (small menus) or `shadow-xl` (user menus, switchers).
- **Item rows:** `px-3 py-2 text-sm` body, ghost hover (`bg-tertiary` fill).
- **Group divider:** 1px `border-default` row, no labels except where the menu spans multiple roles.

### Navigation

- **Header:** `Header.astro` for app, `GuestHeader.astro` for share-link viewers. Sticky `top-0`, `bg-primary`, 1px bottom border, `h-14`.
- **Sidebar (Spaces):** Sticky `top-14`, `w-60`, 1px right border, `bg-primary`. Active route uses `bg-tertiary` fill + primary ink + small Signal Violet leading dot or icon-only highlight.
- **Mobile:** Sidebar slides in from left via `data-[state=open]:translate-x-0`, with `shadow-xl` while floating.

### Signature: Timeline Marker

The single most distinctive component. A horizontal track below the player with colored dots positioned at the exact second of each comment. Hover reveals a `shadow-lg` tooltip with the commenter's avatar initial, the timestamp in JetBrains Mono, and a 1-2 line excerpt. Click seeks the player. Marker color encodes urgency, but per the Color-Plus-Glyph Rule, marker *shape* must also vary by urgency (currently it doesn't — open issue).

### Signature: Annotation Overlay

The Pin tool drops a Signal Violet circle on the video frame at click coordinates. The Rectangle tool drags a Signal Violet-stroked rectangle. Both are anchored to the timestamp and shown in the comment list as a small icon next to the timecode. The overlay disappears when the comment is resolved.

## 6. Do's and Don'ts

### Do:
- **Do** keep Signal Violet to ≤10% of any screen. If you can see two violet things on one screen, one of them is wrong.
- **Do** pair color with a glyph, label, or shape for every status, severity, and urgency signal. Critical and Idea should never look identical at a glance.
- **Do** use Inter for everything visible and JetBrains Mono for timecodes, upload percentages, and any numeric column.
- **Do** keep surfaces flat at rest. Reserve shadows for menus, popovers, modals, and the timeline-marker tooltip.
- **Do** tint every neutral. Page-light should be off-white (`#fafafb`), page-dark should be near-black (`#0d0d0f`), the player surface should be `#0a0a0c`.
- **Do** size cards' internal padding at `p-5` (20px) by default. Modals at `p-6`.
- **Do** use the `shadow-lg` / `shadow-xl` / `shadow-2xl` triad for the three depth roles (subtle, lifted, modal). Don't invent new shadow values.
- **Do** make the video the largest visual mass on any screen it appears in. Shrink the chrome around it; never grow chrome at the frame's expense.
- **Do** keep transitions at 150ms with an ease-out curve. No bounce, no elastic.

### Don't:
- **Don't** use SaaS-template gradients. No `bg-gradient-to-r` on text. No `background-clip: text` with a gradient fill. The current landing page is a violation and the gradient hero text needs to go.
- **Don't** add the purple-glow shadow on buttons (`shadow-[0_2px_8px_rgba(108,92,231,0.3)]`). Buttons don't float. The glow is a SaaS-landing-page reflex and is prohibited everywhere, including the landing CTAs and login submit.
- **Don't** use side-stripe borders (`border-l-2` colored stripes) on cards, list items, comment items, or alerts. The current resolved-comment treatment violates this and needs replacement (strikethrough timecode + "Resolved" pill + `text-tertiary` body).
- **Don't** use glassmorphism (`backdrop-filter: blur`) decoratively. The only permitted blur is the modal backdrop scrim.
- **Don't** use pure `#000` or pure `#fff`. The current `VideoPlayer` `bg-black` and the light theme `--color-bg-primary: #ffffff` are violations and need tinted replacements.
- **Don't** build identical card grids of "icon + heading + paragraph" repeated 3–6 times. The landing page features section is a textbook violation.
- **Don't** use radial purple glow backgrounds for atmosphere. The landing page has two; both should go.
- **Don't** invent new fonts. Inter and JetBrains Mono. That's it.
- **Don't** put the same CTA in the header, the hero, and the final-CTA section. Once per surface.
- **Don't** use em dashes in JSX/Astro user-facing copy. Use periods, colons, semicolons, or parentheses.
- **Don't** use modals for routine actions. Inline-edit, popovers, and progressive disclosure exhaust first. Modals are for genuinely destructive or genuinely-must-block choices.
- **Don't** use `alert()` ever. Route through Toast or keep an open ConfirmDialog.
- **Don't** nest cards. If you reach for a card inside a card, replace the inner one with a divider or a `bg-tertiary` recess.
