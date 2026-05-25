---
phase: 94-app-update-notification-top-strip-banner-with-etag-head-poll
plan: "01"
status: complete
subsystem: update-notification
tags: [update-check, etag, head-poll, strip-banner, passive-notification]
dependency_graph:
  requires: []
  provides: [startUpdateCheck, window.dismissUpdateBanner, "#updateStripSlot"]
  affects: [index.html, styles/components.css]
tech_stack:
  added: []
  patterns: [ETag/Last-Modified HEAD poll, visibility gate, collapsing-slot banner]
key_files:
  created:
    - app/update-check.js
  modified:
    - index.html
    - styles/components.css
decisions:
  - "no-store fetch prevents CDN/browser serving stale ETag; HEAD verb avoids body download"
  - "ETag primary, Last-Modified fallback covers Netlify deployments that omit either header"
  - "30-minute interval keeps request volume minimal for long-lived sessions"
  - "visibilityState gate skips polls while tab is hidden — no wasted bandwidth on background tabs"
  - "Variant A collapsing slot (height: 0 -> 46px) pushes nav down naturally without touching top/z-index"
  - "baseline never mutated after first capture — dismiss hides banner but allows re-show on further change"
  - "startUpdateCheck() idempotent guard (pollTimer !== null) prevents double-start on hot-module reload patterns"
metrics:
  duration: "~25 min (Tasks 1+2, checkpoint wait, and closure)"
  completed: "2026-05-25"
  tasks: 2
  files_modified: 3
---

# Phase 94 Plan 01: App Update Notification — ETag HEAD-Poll Strip Banner Summary

**One-liner:** Zero-import ETag/Last-Modified HEAD-poll module with collapsing full-width blue strip banner that slides above the nav on deploy detection, dismissible without resetting the baseline.

## What Was Built

A self-contained passive update notification system with three deliverables:

1. **`app/update-check.js`** (80 lines) — Zero-import ES6 module. Exports `startUpdateCheck()`. On call, fires an immediate HEAD poll to capture the ETag/Last-Modified baseline, then schedules a 30-minute interval. Each tick early-returns if `document.visibilityState !== 'visible'`. When the header differs from the baseline, `showUpdateBanner()` adds class `open` to `#updateStripSlot`. `window.dismissUpdateBanner` removes the class without touching the baseline, so the banner re-appears if a later poll detects another change. Failed polls are silent no-ops (try/catch returns null). No Firebase, no localStorage, no build step.

2. **`index.html`** (285 lines, +35 lines) — The strip slot `<div class="update-strip-slot" id="updateStripSlot">` is inserted immediately before `<nav class="top-nav">`. Inner markup contains the info SVG, the exact required text, and two buttons wired to `window.location.reload()` and `window.dismissUpdateBanner()`. Boot script imports `startUpdateCheck` from `./app/update-check.js` and calls it after `initRouter()` in both readyState branches.

3. **`styles/components.css`** (2065 lines, +34 lines) — `.update-strip-slot` collapses to `height: 0` by default; `.update-strip-slot.open` transitions to `height: 46px`. Inner band is `background: #1557b0` (dark primary blue). `@media (max-width: 768px)` override sets `flex-direction: column; height: auto` so text stacks above buttons on narrow screens. `.top-nav` rule is untouched.

## Spike-Validated Decisions Honored

| Decision | Implemented As |
|---|---|
| `fetch('/index.html', { method: 'HEAD', cache: 'no-store' })` | `getVersionSignal()` in update-check.js |
| ETag primary, Last-Modified fallback | `response.headers.get('ETag') \|\| response.headers.get('Last-Modified')` |
| 30-minute interval | `POLL_INTERVAL_MS = 30 * 60 * 1000` |
| Baseline in-memory only (no localStorage) | Module-scope `let baseline = null;` |
| Visibility gate — skip hidden tabs | `if (document.visibilityState !== 'visible') return;` early-return in `poll()` |
| Variant A collapsing slot (no nav `top` manipulation) | `height: 0 -> 46px` transition on `.update-strip-slot.open` |
| Dismiss does NOT reset baseline | `dismissUpdateBanner` only removes `open` class |

## Files Created / Modified

| File | Status | Lines |
|---|---|---|
| `app/update-check.js` | Created | 80 |
| `index.html` | Modified (+35) | 285 |
| `styles/components.css` | Modified (+34) | 2065 |

## Verification Results

### Automated Checks: 7/7 PASSED

| # | Check | Result |
|---|---|---|
| 1 | `index.html` has `id="updateStripSlot"` | OK |
| 2 | Strip slot precedes `.top-nav` in DOM order | OK |
| 3 | Exact banner text present | OK |
| 4 | Refresh Now reload wired (`window.location.reload()`) | OK |
| 5 | Dismiss wired (`window.dismissUpdateBanner()`) | OK |
| 6 | Boot import + `startUpdateCheck();` call present | OK |
| 7 | Strip CSS + open state present | OK |

### Human Browser Check: APPROVED

User verified all four behaviors on `python -m http.server 8000`:
- Blue strip slides in from above the nav after simulated ETag change
- "Refresh Now" reloads the page
- "Dismiss" hides the banner without showing it again on the same version
- On a narrow viewport, text block stacks above buttons (mobile stacking)

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new Firestore collections, auth paths, or trust boundaries introduced. `app/update-check.js` reads only `ETag`/`Last-Modified` response headers from `HEAD /index.html`. Banner text and button targets are hardcoded literals — no user input interpolated (T-94-02 accept). HEAD poll failure is silent (T-94-01 mitigate: try/catch returns null). No new surface beyond what the plan's threat model already covers.

## Known Stubs

None.

## Commits

| Task | Commit | Message |
|---|---|---|
| Task 1: update-check.js | e49e5a9 | `feat(94-01): create app/update-check.js HEAD-poll update detection module` |
| Task 2: index.html + CSS | 27aabb9 | `feat(94-01): add update strip banner markup, CSS, and boot wiring` |

## Self-Check: PASSED

- `app/update-check.js` exists on disk: FOUND
- `index.html` contains `id="updateStripSlot"`: FOUND (line 26)
- `styles/components.css` contains `.update-strip-slot`: FOUND (lines 19, 24, 1998)
- Commit e49e5a9 exists: FOUND
- Commit 27aabb9 exists: FOUND
