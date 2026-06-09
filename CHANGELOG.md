# Changelog

All notable changes to QuickCut are listed here, newest first.

---

## June 9, 2026

- Script collaboration now happens outside QuickCut, so the Script tab and all script-related labels and statuses have been removed from projects. Your existing comments and videos are unaffected. (#213)

## May 27, 2026

- URLs in comments and replies are now clickable links. (#210)
- The video automatically pauses and the timestamp locks when you start typing a comment, so your note is always attached to the right moment. (#209)
- The comment timeline is now a seekable scrubber — click anywhere on it to jump directly to that moment in the video. (#208)
- Guest reviewers no longer see a name prompt flash on every tab switch — your name is remembered for the session. (#179)

## May 22, 2026

- Creator avatars now appear on project cards so you can see at a glance who uploaded the video. (#205)
- Project settings (rename, delete, manage members) are now restricted to the space owner or the person who created the project. (#203)

## May 21, 2026

- You can now sign in with Google in addition to the magic-link email flow. (#202)

## May 15, 2026

- Improved comment selection and highlight UX in the script workspace. (#155)
- Error messages across the app have been updated to be clear and user-friendly rather than exposing raw server details. (#172, #181)

## May 7–8, 2026

- Video uploads now use resumable uploads — if your connection drops mid-upload, the upload picks up where it left off instead of starting over. (#144)
- Several security improvements: rate limiting on OTP and share-view endpoints, origin validation on all authenticated mutations, hardened webhook token verification, and stricter privacy scoping on member data. (#146, #147, #148, #149, #150)
- Transcript processing is now more reliable and less likely to silently fail on longer videos. (#151)

## May 6, 2026

- Added a Brainstorm board to each space — a shared backlog where your team can collect ideas and promote them directly to projects. (#137)
- Projects now have their own phase that automatically advances to the next stage when all required approvals are collected. (#135)
- Guest reviewers on share links now see a navbar with a theme toggle. (#132)
- Notifications are automatically marked as read when you open the video or content they reference. (#125)
- Video title and description are now treated as project-level fields rather than being duplicated across every uploaded version. (#124)
- Logged-in users visiting a share link now see the video using their account identity rather than as a guest. (#130)
