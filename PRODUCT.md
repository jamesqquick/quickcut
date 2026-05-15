# Product

## Register

product

## Users

Two user types share the same surface:

1. **Creators / video teams** (authenticated) — upload cuts, organize work into spaces, manage members and approvals, review their own and teammates' versions. Power users who return daily; they value speed and keyboard-friendly flows over hand-holding.
2. **External reviewers / clients** (unauthenticated, share-link only) — open a link, identify themselves with a display name, scrub through a video, drop timestamped comments, optionally resolve threads. One-shot users; they should never feel like they've stumbled into "an app."

Job to be done: "Get a cut in front of the right people, collect specific feedback at specific timecodes, and know when it's approved." The product replaces a chain of email + Drive links + Slack pings.

## Product Purpose

A focused video review tool — Frame.io's core loop without the enterprise weight. Spaces, version stacks, timestamped comments, approvals, and public share links, running entirely on Cloudflare's edge. Success looks like: a creator uploads a new cut, drops a link in Slack, and gets actionable timestamped feedback inside 10 minutes — with zero account friction for the reviewer.

## Brand Personality

Fast, focused, confident.

- **Voice:** direct, terse, builder-to-builder. No fluff, no marketing softness, no apologetic copy. "Upload a cut" not "Let's get started by uploading your first amazing video!"
- **Tone:** quiet competence. The product should feel like it was made by people who actually review video, not people selling a "video review platform."
- **Emotional goal:** the relief of a tool that just does the thing. The opposite of "what does this button do."

## Anti-references

- **Generic SaaS template look.** Hero-metric cards, identical icon-heading-text card grids, gradient text, side-stripe alert borders, three-column "Why us" landing sections. The obvious AI/template reflex. If a screen looks like it could be from any B2B SaaS, it's wrong.
- **Frame.io's enterprise heaviness** (implied by category positioning). Dense toolbars stacked three deep, nested panels, modal-on-modal. We're the small, focused alternative — the chrome should reflect that.

## Design Principles

1. **Small product, large craft.** We don't compete on feature count. Every screen we ship has to feel deliberate — typography, spacing, motion, microcopy — because there are fewer screens carrying the weight.
2. **Two audiences, one surface.** The same UI serves a power user who's here 20 times a week and a one-shot reviewer who's here for 90 seconds. Default to the reviewer's clarity; let the creator's speed surface through density, shortcuts, and progressive disclosure — not by simplifying things away.
3. **The video is the product.** The player and the timeline are the center of gravity. Chrome shrinks; the frame grows. If a UI element competes with the video for attention without earning it, cut it.
4. **Edge-native, not edge-themed.** Cloudflare is the runtime, not the aesthetic. No neon "powered by the edge" decoration. The speed should be felt, not announced.
5. **Quiet confidence, not loud reassurance.** No celebratory toasts for routine actions, no "Great job!" copy, no progress bars where instant feedback would do. The tool earns trust by getting out of the way.

## Accessibility & Inclusion

- **WCAG AA** as the baseline target across the app.
- Keyboard navigation through the review surface (play/pause, scrub, comment focus, thread navigation) — power users will expect it.
- Respect `prefers-reduced-motion` for the timeline scrubbing, comment-pin animations, and any panel transitions.
- Color is never the only signal for status (approved / processing / failed). Pair color with icon or text.
- Contrast: the dark, purple-accented theme must clear AA for body text and interactive controls in both default and hover states.
