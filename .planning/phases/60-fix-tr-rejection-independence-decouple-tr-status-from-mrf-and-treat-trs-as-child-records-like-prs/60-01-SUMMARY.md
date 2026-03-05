---
phase: 60-tr-rejection-independence
plan: 01
subsystem: ui
tags: [finance, transport-requests, firestore, procurement-workflow]

# Dependency graph
requires:
  - phase: 58-fix-tr-rejection
    provides: TR Rejected status added to canEdit checks and resubmission flow
provides:
  - TR rejection writes only to transport_requests — no MRF status cascade
  - TR approval writes only to transport_requests — no MRF status cascade
  - Finance TR modal shows prior rejection context when resubmitted TR is opened
affects: [finance, procurement, mrf-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns: [child-record independence — TR lifecycle fully owned by transport_requests collection]

key-files:
  created: []
  modified:
    - app/views/finance.js

key-decisions:
  - "TR rejection does NOT cascade status to parent MRF — TRs are child records like PRs and own their own finance_status"
  - "TR approval does NOT write 'Finance Approved' to parent MRF — MRF approval is a one-way door unaffected by TR outcomes"
  - "PR rejection still cascades 'PR Rejected' to MRF — this behavior is intentional and unchanged"
  - "Prior rejection notice shown in Finance TR modal when tr.rejection_reason is set — gives Finance context on resubmitted TRs without cluttering fresh TRs"

patterns-established:
  - "Child records (PRs, TRs) own their own finance_status; only PR rejection cascades to MRF — TR outcomes are fully scoped to transport_requests"

requirements-completed: [TR-INDEP-01, TR-INDEP-03]

# Metrics
duration: 5min
completed: 2026-03-05
---

# Phase 60 Plan 01: TR Rejection Independence Summary

**Surgically removed two MRF status cascade blocks from finance.js so TR rejection and TR approval no longer overwrite the parent MRF document, plus added a prior-rejection notice in the Finance TR review modal**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-05T10:56:29Z
- **Completed:** 2026-03-05T11:01:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Removed `updateDoc mrfs` block from `submitRejection` isTransport branch — TR rejection no longer sets MRF status to `TR Rejected`
- Removed `updateDoc mrfs` block from `approveTR` function — TR approval no longer sets MRF status to `Finance Approved`
- PR rejection cascade (`PR Rejected` on MRF) fully preserved and unchanged
- Added conditional "Previously Rejected" section to `viewTRDetails` modal content — renders reason, rejector, and timestamp when `tr.rejection_reason` is set; hidden for fresh TRs

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove MRF status cascade from TR rejection and TR approval** - `5388e59` (fix)
2. **Task 2: Show prior rejection notice in Finance TR review modal** - `bd12c42` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `app/views/finance.js` - Removed 32 lines (two MRF update blocks); added 11 lines (prior rejection notice block)

## Decisions Made
- TR rejection no longer cascades to MRF — MRF approved status is a one-way door; a rejected TR returns to Procurement without making the MRF re-editable
- PR rejection cascade preserved intentionally — PR and TR have different workflow semantics
- Prior rejection notice uses `#fef2f2` red-tinted banner consistent with existing urgency color tokens

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- TR rejection independence complete — rejected TRs now return to Procurement without touching MRF status
- PR workflow unchanged — safe to deploy

---
*Phase: 60-tr-rejection-independence*
*Completed: 2026-03-05*
