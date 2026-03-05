---
phase: 59-improve-tr-display
plan: 02
subsystem: ui
tags: [timeline, procurement, finance, rejection, lifecycle, modal]

# Dependency graph
requires:
  - phase: 58-fix-tr-rejection-not-reappearing
    provides: "rejection_reason, rejected_at, rejected_by, resubmitted_at fields written to prs/transport_requests on Finance rejection/resubmission"
provides:
  - "Timeline modal in Procurement MRF Records shows full PR/TR rejection lifecycle with reason, actor, timestamp"
  - "Timeline modal in My Requests shows same lifecycle events"
  - "Color-coded events: pending=grey, rejected=red, active=yellow-orange, completed=green"
affects: [procurement, mrf-records, finance-workflow, timeline-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lifecycle event pattern: single PR/TR document emits multiple chronological timeline events"
    - "Conditional event emission: hasRejection flag gates rejection + resubmission event rendering"

key-files:
  created: []
  modified:
    - app/views/procurement.js
    - app/views/mrf-records.js

key-decisions:
  - "Submitted event shown as 'completed' (green) only when finance_status=Approved AND no rejection history — keeps non-rejected approvals as single green entry"
  - "Approved PRs with rejection history emit 4 events: Submitted (grey) + Rejected (red) + Resubmitted (orange) + Approved (green with POs) — full audit trail"
  - "PO children nested under Approved event, not Submitted event — logically correct since POs are only created after Finance approval"

patterns-established:
  - "lifecycle-timeline: emit multiple timeline-item divs per document when rejection/resubmission history exists"
  - "hasRejection guard: !!(doc.rejection_reason || doc.rejected_at) — handles both old and new rejection data formats"

requirements-completed: [TIMELINE-01]

# Metrics
duration: 5min
completed: 2026-03-05
---

# Phase 59 Plan 02: Timeline Lifecycle Events Summary

**Timeline modals in procurement.js and mrf-records.js now display full PR/TR rejection audit trail — reason, actor, and timestamp shown as color-coded events in chronological order**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-05T07:58:50Z
- **Completed:** 2026-03-05T08:04:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- PR/TR timeline events now expand to show: Submitted (grey/green) → Rejected (red, with reason + actor + timestamp) → Resubmitted (yellow-orange) → Approved (green, with nested POs)
- Non-rejected Approved PRs still render as a single green entry — no regression
- Both Procurement MRF Records Timeline and My Requests Timeline modals now show identical lifecycle event structure
- `escapeHTML()` applied to all user-provided strings (reason, actor names) preventing XSS in timeline output

## Task Commits

Each task was committed atomically:

1. **Task 1: Enhance showProcurementTimeline in procurement.js** - `591d2a9` (feat)
2. **Task 2: Sync lifecycle changes to showTimelineLocal in mrf-records.js** - `d7a3db0` (feat)

**Plan metadata:** (docs commit — see final_commit step)

## Files Created/Modified
- `app/views/procurement.js` - showProcurementTimeline: PRs and TRs now emit Submitted/Rejected/Resubmitted/Approved events
- `app/views/mrf-records.js` - showTimelineLocal: same lifecycle event logic synced from procurement.js

## Decisions Made
- Submitted event uses `completed` (green) class only when `finance_status === 'Approved'` AND no rejection history exists. This keeps the happy-path single-entry view for clean approvals while showing the full trail for rejected/resubmitted cases.
- Approved PRs with rejection history show a dedicated "PR Approved" event at the end (after the Rejected and Resubmitted events) with nested PO children — making the chronological flow readable.
- Used `!!(pr.rejection_reason || pr.rejected_at)` to detect rejection — handles both cases where only one field may be present in older documents.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Timeline lifecycle events complete for both procurement and My Requests views
- Phase 59 timeline objective fully met — rejection audit trail visible in both modals
- No blockers; remaining Phase 59 plans (01, 03, 04) handle separate concerns

## Self-Check: PASSED

- FOUND: app/views/procurement.js
- FOUND: app/views/mrf-records.js
- FOUND: 59-02-SUMMARY.md
- FOUND commit: 591d2a9 (feat: procurement.js lifecycle events)
- FOUND commit: d7a3db0 (feat: mrf-records.js lifecycle events)
- FOUND commit: 2055227 (docs: metadata)

---
*Phase: 59-improve-tr-display*
*Completed: 2026-03-05*
