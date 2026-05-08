---
phase: quick
plan: 260508-g2p
subsystem: gantt
tags: [bug-fix, gantt, vertical-alignment, scroll-sync, css]
dependency_graph:
  requires: [Phase 86.6 Plan 01 diagnostic evidence]
  provides: [Gantt bar/row vertical alignment at all scroll positions]
  affects: [app/views/project-plan.js, styles/views.css]
tech_stack:
  added: []
  patterns: [diff-based paddingBottom equalization, nowrap+ellipsis for fixed-height cells]
key_files:
  created: []
  modified:
    - styles/views.css
    - app/views/project-plan.js
decisions:
  - paddingBottom reset before height assignment so each fixGanttContainerScroll() call measures a clean baseline
  - diff computed dynamically (never hardcoded) to avoid repeating the failed 42px regression (reverted 317d973/3f2a24e)
metrics:
  duration: 5
  completed: "2026-05-08T03:38:05Z"
---

# Quick Task 260508-g2p: Gantt/Grid Vertical Alignment Fix (Phase 86.6 Plan 02)

**One-liner:** Two-bug fix for Gantt bar/row vertical drift — CSS nowrap+ellipsis on `.tg-locked` (Bug H2) and diff-based paddingBottom equalization in `fixGanttContainerScroll` (Bug H1).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix .tg-locked wrapping (Bug H2) | c00a3fd | styles/views.css |
| 2 | Equalize rail/container maxScrollTop in fixGanttContainerScroll (Bug H1) | ef795c9 | app/views/project-plan.js |

## What Was Done

### Task 1 — Bug H2: Parent row height drift (styles/views.css)

Added three properties to the `.tg-locked` rule:
- `white-space: nowrap` — prevents content from wrapping to a second line
- `overflow: hidden` — clips overflowing text
- `text-overflow: ellipsis` — shows ellipsis instead of clipped text

Root cause per Plan 01 diagnostic: a long parent task name caused `.tg-locked` to wrap to 2 lines, expanding one `<tr>` from 42px to 48.5px. Since rail.scrollHeight accumulates those heights, every row below the oversized parent was offset by a fixed N-pixel amount relative to the Gantt SVG which uses constant 42px row heights.

### Task 2 — Bug H1: Scroll range mismatch (app/views/project-plan.js)

Replaced the `fixGanttContainerScroll()` body with a version that:
1. Resets `container.style.paddingBottom = '0px'` **before** setting height — ensures each call measures a clean baseline
2. Sets height, overflowY, overflowAnchor as before
3. Reads `taskGridRail` via `getElementById('taskGridRail')` inside the function
4. Computes `diff = (rail.scrollHeight - rail.clientHeight) - (container.scrollHeight - container.clientHeight)`
5. Applies `container.style.paddingBottom = diff + 'px'` only when `diff > 0`

Root cause per Plan 01 diagnostic: `rail.maxScrollTop = 282`, `ganttEl.maxScrollTop = 265`, diff = 17px. At max rail scroll the container clamped 17px lower. `_syncingScroll` flag blocked the reverse-sync path, leaving bars permanently drifted above their rows. The `.gantt-container` is `box-sizing: border-box` with an 8px border, so adding paddingBottom extends scrollHeight without changing clientHeight, making maxScrollTop grow by exactly `diff`.

No hardcoded pixel constant is used — the prior failed attempt (42px, reverted in commits 317d973 / 3f2a24e) is explicitly avoided.

## Verification Results

All automated checks passed:

- CSS check (Bug H2): `OK` — white-space: nowrap, overflow: hidden, text-overflow: ellipsis present in `.tg-locked`
- JS check (Bug H1): `OK` — paddingBottom='0px' reset present, diff+'px' applied, no 42px constant
- Collateral damage check: only 2 files modified, insertions only (no deletions)

Browser UAT (manual, post-merge — user-driven per project workflow):
- Open `/project-plan` for a project with 10+ tasks including a long-named parent task
- Confirm every parent row is 42px (no 48.5px outlier)
- Scroll rail to maximum: bars stay vertically aligned (no 17px drift)
- Scroll gantt container: rail mirrors position with no jitter or clamp

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- styles/views.css modified: confirmed (3 insertions)
- app/views/project-plan.js modified: confirmed (21 insertions)
- Commit c00a3fd exists: confirmed
- Commit ef795c9 exists: confirmed
