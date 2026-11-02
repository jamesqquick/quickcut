# Video Tab Position Preservation

## Goal

Keep a reviewer at the same playback position when they switch from the Video
tab to the Details tab and return to Video. This applies to both authenticated
project pages and public share pages.

## Context

The tab links currently navigate to a new server-rendered URL. That unmounts
`VideoDetailView`, including the Cloudflare Stream iframe. Returning to Video
creates a new player at time zero.

## Design

Update the shared `useStreamPlayer` hook rather than changing either tab page.
When a Stream player is active, use a `sessionStorage` entry keyed by its
`streamVideoId`:

- Save the current time from Stream `timeupdate` and `pause` events, explicit
  timeline seeks, and `pagehide` navigation events.
- Save once more during hook cleanup so a tab navigation captures the latest
  position.
- Read the saved value after Stream initializes and restore it through the
  player `currentTime` setter once Stream reports a usable duration.
- Ignore missing, non-numeric, negative, or otherwise invalid stored values.
- Ignore storage failures so private browsing or restricted storage does not
  break playback.

Using the Stream video ID isolates positions between videos while allowing the
same uploaded video to resume consistently from either page type. The existing
URL navigation, SSR tab selection, and player UI remain unchanged.

## Testing

- Run `pnpm build` to verify the shared hook and both page consumers compile.
- On an authenticated project page, play to a nonzero position, open Details,
  return to Video, and verify playback resumes at that position.
- Repeat the same flow on a public share page.
- Confirm a video without a saved position still starts normally.

## Scope

No database, API, routing, or persistent cross-session changes are required.
