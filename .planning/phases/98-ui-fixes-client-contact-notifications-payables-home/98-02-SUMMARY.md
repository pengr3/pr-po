---
phase: 98-ui-fixes-client-contact-notifications-payables-home
plan: 02
subsystem: ui
tags: [notifications, css, flexbox, alignment, escapeHTML]

# Dependency graph
requires:
  - phase: 95-notification-anatomy
    provides: TYPE_META + .na-* dropdown anatomy (left untouched here)
  - phase: 83.1-notifications-history
    provides: #/notifications history page + .notif-row* classes
provides:
  - Inline single-line notification history rows with a fixed-width type-label column (constant message-start-x)
  - Right-aligned relative time + check mark-read cluster across all rows/types
affects: [notifications-history]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Fixed-width flex label column for column-aligned list rows", "Remove conflicting inline styles so class CSS owns layout (inline-precedence pitfall)"]

key-files:
  created: []
  modified: [app/views/notifications.js, styles/components.css]

key-decisions:
  - ".notif-row-label sized flex:0 0 160px to fit longest label 'REGISTRATION PENDING' (20ch uppercase @0.7rem); bump to 165-170px during UAT if clipped"
  - "Stacked .notif-row-body wrapper removed; label/message/time/check become direct .notif-row flex children so margin-left:auto on time pushes the trailing cluster right"
  - "Unread bold moved from inline font-weight to .notif-row-message--unread modifier class (keeps inline-precedence-free layout)"
  - "Per-type color kept inline on label + badge (color is not an alignment property)"

patterns-established:
  - "List-row column alignment via fixed-basis flex label column"

requirements-completed: []

# Metrics
duration: ~8min
completed: 2026-06-03
---

# Phase 98 Plan 02: Notifications Alignment Summary

**Restructured #/notifications history rows from a stacked label-above-message body back to an inline single-line layout — fixed-width type-label column gives every row a constant message-start-x and the time + check mark-read cluster is right-aligned across all rows and types.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-06-03
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- New `.notif-row-label` fixed-width (160px) column sized to "REGISTRATION PENDING"; `.notif-row` + `.notif-row-body` switched to `align-items:center` inline
- `.notif-row-time` gets `margin-left:auto` → relative time + ✓ button flush-right consistently
- `renderRows()` now emits inline children (badge / label / message / time / ✓) with the conflicting inline `display/align-items/flex/margin` styles removed so the Task-1 CSS governs layout
- Unread bold handled by `.notif-row-message--unread`; label still escaped (`escapeHTML(meta.label)`)
- `.na-*` dropdown anatomy (Phase 95), `TYPE_META`, truncation, and click handlers untouched (D-10)

## Task Commits

1. **Task 1 (CSS) + Task 2 (markup)** — `dafac92` (feat)
2. **Follow-up fix: scope inline layout to history page, protect bell dropdown** — `468268d` (fix)

_Both plan tasks committed together (tightly coupled CSS+markup alignment change) under inline orchestrator execution; the follow-up fix corrects a shared-class regression (see Deviations)._

## Files Created/Modified
- `app/views/notifications.js` — `renderRows()` stacked → inline restructure
- `styles/components.css` — `.notif-row*` inline layout: label column, right-aligned time, unread modifier

## Decisions Made
See key-decisions frontmatter. Followed plan as written.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Shared-class regression to the bell dropdown**
- **Found during:** Post-execution self-review (cross-file consumer check)
- **Issue:** The plan's Task 1 changed the base `.notif-row` (`align-items:center`) and `.notif-row-body` (`align-items:center; gap:0.75rem`) rules. Those two classes are shared: the bell **dropdown** (`app/notifications.js:212`) renders `.notif-row > .notif-row-body > .na-body` and would have had its badge re-centered against the multi-line `.na-body` and its badge↔text gap widened — a D-10 violation ("dropdown visually unchanged"). The history page no longer uses `.notif-row-body` at all, so that base change was pure dropdown regression with zero history-page benefit.
- **Fix:** Reverted `.notif-row` and `.notif-row-body` base rules to their originals (`align-items:flex-start`, body `gap:0.5rem`); added a scoped `.notif-rows-container .notif-row { align-items:center }` so only the history page (which wraps rows in `.notif-rows-container`) gets the inline single-line alignment. The dropdown injects into `.notif-dropdown-rows`, not `.notif-rows-container`, so it is untouched.
- **Files modified:** styles/components.css
- **Verification:** 98-02 T1 grep-verify still PASS; dropdown base rules confirmed back to flex-start/0.5rem; scoped history rule present.
- **Committed in:** `468268d`

---

**Total deviations:** 1 auto-fixed (1 bug — shared-class regression)
**Impact on plan:** Fix preserves both the plan's history-page intent (inline alignment) AND the explicit D-10 constraint (dropdown unchanged). No scope creep — same files as the plan's `files_modified`.

## Issues Encountered
None.

## Verification
- Task 1 (CSS) grep-verify: PASS
- Task 2 (markup) grep-verify: PASS
- Label-escaped guard: PASS; `.na-*` present guard: PASS; unread-modifier guard: PASS
- `node --check` (ES module) on notifications.js: PASS
- Manual browser UAT (compare to notifications-alignment-screenshot.png; confirm 160px fits "REGISTRATION PENDING") pending.

## Self-Check: PASSED
- `app/views/notifications.js` + `styles/components.css` modified and present
- Commit `dafac92` present in git log

## Next Phase Readiness
Independent slice. Browser UAT outstanding — confirm no clipping of longest label; bump flex-basis if needed.

---
*Phase: 98-ui-fixes-client-contact-notifications-payables-home*
*Completed: 2026-06-03*
