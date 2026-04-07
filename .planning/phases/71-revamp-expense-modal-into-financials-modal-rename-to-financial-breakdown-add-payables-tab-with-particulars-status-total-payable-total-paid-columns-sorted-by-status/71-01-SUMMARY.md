---
phase: 71-revamp-expense-modal-into-financials-modal
plan: 01
subsystem: ui
tags: [expense-modal, modal, rename, firebase, spa]

requires:
  - phase: 69-revise-expense-modal-scoreboards-to-add-remaining-payable-tracking
    provides: Expense Breakdown modal with scoreboards, the file this plan edits

provides:
  - Modal header text reads "Financial Breakdown: {name}" instead of "Expense Breakdown: {name}"

affects:
  - 71-02 (Payables tab plan — adds new tab to the same modal)

tech-stack:
  added: []
  patterns:
    - "User-visible string rename without touching internal symbols — deliberate low-risk diff"

key-files:
  created: []
  modified:
    - app/expense-modal.js

key-decisions:
  - "Per D-09: rename is user-visible only. Internal symbols (showExpenseBreakdownModal, #expenseBreakdownModal, .expense-tab, window._* functions) stay unchanged to produce a zero-risk one-line diff."

patterns-established:
  - "One-line rename pattern: change user-visible <h3> text while leaving all internal symbols frozen for a trivially reviewable diff"

requirements-completed: []

duration: 5min
completed: 2026-04-07
---

# Phase 71 Plan 01: Rename Modal Title to Financial Breakdown Summary

**Modal `<h3>` title changed from "Expense Breakdown: {name}" to "Financial Breakdown: {name}" — one-line diff, all internal symbols frozen**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-07T09:50:00Z
- **Completed:** 2026-04-07T09:55:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Changed `<h3>Expense Breakdown: ${title}</h3>` to `<h3>Financial Breakdown: ${title}</h3>` at `app/expense-modal.js:341`
- All four grep verifications passed: `Financial Breakdown:` count=1, `Expense Breakdown` count=0, `showExpenseBreakdownModal` count=1, `expenseBreakdownModal` count=4, window functions count=13
- No other files modified — `app/views/finance.js` and `app/views/procurement.js` (which have unrelated in-progress dirty edits) were NOT staged

## Task Commits

1. **Task 1: Rename modal h3 from Expense Breakdown to Financial Breakdown** - `a3c895a` (feat)

## Files Created/Modified

- `app/expense-modal.js` — line 341 `<h3>` text changed from "Expense Breakdown" to "Financial Breakdown"

## Decisions Made

Per D-09 of CONTEXT.md: user-visible rename only. All internal symbols left unchanged to make the diff trivially reviewable and zero-risk to callers.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 71-02 (Payables tab) can proceed immediately — the modal title is now correct and the file is otherwise untouched
- No blockers

---
*Phase: 71-revamp-expense-modal-into-financials-modal*
*Completed: 2026-04-07*
