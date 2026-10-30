# Video Tab Position Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve a reviewer's Cloudflare Stream playback position when they navigate from Video to Details and back on authenticated and public share pages.

**Architecture:** Keep the existing server-rendered tab navigation. Extend the shared `useStreamPlayer` hook to persist a valid current timestamp in browser-tab `sessionStorage`, keyed by the Stream video ID, and restore it when the iframe player is recreated. Both page types already render `VideoDetailView`, so no page-specific changes are needed.

**Tech Stack:** React 19 hook, Cloudflare Stream iframe SDK, TypeScript, browser `sessionStorage`, Astro/Cloudflare build.

---

## File Map

- Modify: `src/hooks/useStreamPlayer.ts` to save, restore, and validate playback positions.
- No page or route files change because `src/pages/videos/[id]/index.astro` and `src/pages/s/[token].astro` both reach the shared hook through `VideoDetailView`.
- No automated test files are added because the repository has no test runner or test script; build verification and manual browser flows cover the behavior.

### Task 1: Add Per-Video Position Storage

**Files:**
- Modify: `src/hooks/useStreamPlayer.ts:1-209`

- [ ] **Step 1: Define the storage key from `streamVideoId`**

Inside `useStreamPlayer`, derive a nullable key using a namespaced prefix:

```ts
const positionStorageKey = streamVideoId
  ? `quickcut:video-position:${streamVideoId}`
  : null;
```

The key must be null when there is no Stream video so draft, processing, and failed states never access browser storage.

- [ ] **Step 2: Add guarded position read and write helpers inside the player effect**

Inside the hook, add a memoized `savePosition` function and within the existing `useEffect` add a `restorePosition` function. Both must catch storage or player errors so restricted browser storage cannot break playback. `savePosition` must reject non-finite and negative values. `restorePosition` must reject missing, non-finite, and negative values, wait for a usable player or initial duration, clamp values past the known duration, set the hook's `currentTime` state, and only complete restoration once.

Use this exact behavior:

```ts
const positionStorageKey = streamVideoId
  ? `quickcut:video-position:${streamVideoId}`
  : null;
const savePosition = useCallback((time: number) => {
  if (!positionStorageKey || !Number.isFinite(time) || time < 0) return;
  try {
    window.sessionStorage.setItem(positionStorageKey, String(time));
  } catch {
    // Browser storage may be unavailable in private or restricted contexts.
  }
}, [positionStorageKey]);

let positionRestored = false;

const restorePosition = () => {
  if (positionRestored || !player || !positionStorageKey) return;

  let stored: string | null;
  try {
    stored = window.sessionStorage.getItem(positionStorageKey);
  } catch {
    positionRestored = true;
    return;
  }
  if (!stored) {
    positionRestored = true;
    return;
  }

  const time = Number(stored);
  if (!Number.isFinite(time) || time < 0) {
    positionRestored = true;
    return;
  }

  const duration = player.duration || initialDuration;
  if (duration <= 0) return;

  try {
    const restoredTime = Math.min(time, duration);
    player.currentTime = restoredTime;
    setCurrentTime(restoredTime);
    positionRestored = true;
  } catch {
    // Wait for Stream to report its duration before trying again.
  }
};
```

- [ ] **Step 3: Save on Stream playback events and restore after initialization**

Update the existing handlers so `timeupdate` and `pause` both save the current player time. Save explicit timeline/comment seeks immediately, and register a `pagehide` handler so full-document tab navigation captures the latest native-player position. After registering the listeners and reading the initial duration, call `restorePosition()` once. Also call it from `handleDurationChange()` so a saved position is restored after Stream reports its duration when the initial player duration is not ready yet.

The resulting event handlers and initialization sequence should be:

```ts
const handleTimeUpdate = () => {
  if (player) {
    const time = player.currentTime || 0;
    setCurrentTime(time);
    savePosition(time);
  }
};
const handleDurationChange = () => {
  if (player) {
    setVideoDuration(player.duration || 0);
    restorePosition();
  }
};
const handlePause = () => {
  if (player) {
    const time = player.currentTime || 0;
    setCurrentTime(time);
    savePosition(time);
  }
};
const handlePageHide = () => {
  if (player) savePosition(player.currentTime || 0);
};

window.addEventListener("pagehide", handlePageHide);

player = StreamFn(iframeRef.current);
playerRef.current = player;

player.addEventListener("timeupdate", handleTimeUpdate);
player.addEventListener("durationchange", handleDurationChange);
player.addEventListener("pause", handlePause);

if (player.duration) {
  setVideoDuration(player.duration);
}
restorePosition();
```

- [ ] **Step 4: Save the final position during cleanup and update dependencies**

Before removing the listeners in the existing cleanup, remove the `pagehide` listener and save `player.currentTime`. Add `initialDuration`, `positionStorageKey`, and `savePosition` to the effect dependency list so a changed Stream video gets its own restore cycle and seeks use the current storage key.

The cleanup and dependency list should include:

```ts
return () => {
  cancelled = true;
  window.removeEventListener("pagehide", handlePageHide);
  if (player) {
    try {
      savePosition(player.currentTime || 0);
      player.removeEventListener("timeupdate", handleTimeUpdate);
      player.removeEventListener("durationchange", handleDurationChange);
      player.removeEventListener("pause", handlePause);
    } catch {
      // ignore
    }
  }
  playerRef.current = null;
};
```

The effect dependency list must be `[enabled, initialDuration, positionStorageKey, savePosition, status, streamVideoId]`. The `handleSeek` callback must also depend on `savePosition` and call it immediately after setting `player.currentTime`.

- [ ] **Step 5: Run the focused build verification**

Run from the worktree:

```bash
pnpm build
```

Expected result: Wrangler types and the Astro production build complete successfully with no TypeScript or bundling errors.

### Task 2: Verify Both User Flows

- [ ] **Step 1: Start the local application**

Run:

```bash
pnpm dev
```

Use an existing authenticated local account and an existing video with a ready Stream player. Use an existing public share link for the same or another ready video.

- [ ] **Step 2: Verify authenticated project navigation**

Open `/videos/<video-id>?tab=video`, play or seek to a clearly nonzero position, click Details, then click Video. Expected result: the Stream player returns to approximately the saved timestamp rather than starting at zero.

- [ ] **Step 3: Verify public share navigation**

Open `/s/<share-token>?tab=video`, complete the guest-name prompt if needed, play or seek to a nonzero position, click Details, then click Video. Expected result: the player returns to approximately the saved timestamp.

- [ ] **Step 4: Verify isolation and fallback behavior**

Open a different video in the same browser tab and confirm it does not resume at the first video's position. Open a video with no saved position and confirm it starts normally. If browser storage is unavailable, confirm the player still loads without a playback error.

### Task 3: Review and Commit

- [ ] **Step 1: Inspect the final diff**

Run:

```bash
git status --short
git diff --check
git diff -- src/hooks/useStreamPlayer.ts
```

Expected result: only the hook and the approved documentation files are changed, with no whitespace errors or unrelated page changes.

- [ ] **Step 2: Commit the implementation**

Run:

```bash
git add src/hooks/useStreamPlayer.ts
git commit -m "fix(video): preserve position across tab navigation"
```

- [ ] **Step 3: Prepare the pull request summary**

Describe that the shared Stream hook persists per-video positions in `sessionStorage`, covers authenticated and public share tabs, preserves existing navigation, and was verified with `pnpm build` plus both manual flows.
