---
phase: 24-rejection-reason-passthrough
plan: 01
subsystem: ui
tags: [firestore, field-mismatch, rejection-workflow, backward-compatibility]

# Dependency graph
requires:
  - phase: 17-pr-po-workflow-enhancements
    provides: PR creator attribution pattern (pr_creator_name, pr_creator_user_id)
  - phase: 18-signature-document-generation
    provides: Finance approval workflow with signature capture
provides:
  - "PR rejection reason passes from Finance to Procurement MRF Processing view"
  - "TR rejection reason passes from Finance to Procurement MRF Processing view"
  - "TR-rejected MRFs visible in Procurement MRF list with red border styling"
  - "Dynamic rejection labels (PR REJECTED / TR REJECTED)"
  - "Dynamic rejector attribution using currentUser instead of hardcoded name"
  - "Backward-compatible fallback chain for existing rejected MRFs"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual field write pattern: write both pr_rejection_reason and rejection_reason for forward/backward compatibility"
    - "Fallback chain pattern: mrf.pr_rejection_reason || mrf.rejection_reason || 'No reason provided'"

key-files:
  created: []
  modified:
    - app/views/finance.js
    - app/views/procurement.js

key-decisions:
  - "Write both pr_rejection_reason and rejection_reason to MRF for backward compatibility with existing data"
  - "Use currentUser?.full_name || currentUser?.email || 'Finance User' fallback chain for rejector attribution"
  - "Add rejected_by_user_id for audit trail alongside human-readable rejected_by"

patterns-established:
  - "Dual field write: when fixing field name mismatches, write both old and new field names for backward compatibility"
  - "Three-level fallback: new field || legacy field || default string for graceful migration"

# Metrics
duration: 5min
completed: 2026-02-10
---

# Phase 24 Plan 01: Rejection Reason Passthrough Summary

**Fixed field name mismatch between Finance rejection writes and Procurement reads, added TR rejection visibility and dynamic user attribution**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-10T08:35:55Z
- **Completed:** 2026-02-10T08:41:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Fixed pr_rejection_reason field being written by finance.js so Procurement MRF cards display the actual rejection reason instead of "No reason provided"
- Added TR Rejected status to Procurement query so TR-rejected MRFs are visible (previously invisible)
- Replaced hardcoded rejector name with dynamic currentUser attribution across all 4 rejection write paths
- Added rejection_reason fallback chain for backward compatibility with MRFs rejected before this fix

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix finance.js rejection writes and user attribution** - `8548ced` (fix)
2. **Task 2: Fix procurement.js rejection query and display** - `2925981` (fix)

## Files Created/Modified
- `app/views/finance.js` - submitRejection() now writes pr_rejection_reason to MRF for both PR and TR paths; uses currentUser for rejected_by attribution; adds is_rejected, rejected_tr_id, rejected_by_user_id to TR rejection
- `app/views/procurement.js` - loadMRFs() query includes TR Rejected status; isRejected checks handle both PR and TR rejection; dynamic rejection labels; fallback chain for rejection reason display

## Decisions Made
- Write both `pr_rejection_reason` and `rejection_reason` to MRF on rejection (forward and backward compatibility with no data migration needed)
- Use `currentUser?.full_name || currentUser?.email || 'Finance User'` pattern consistent with approval flow attribution (Phases 17, 23)
- Add `rejected_by_user_id` for audit trail alongside human-readable `rejected_by` field

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Rejection reason passthrough is complete for both PR and TR workflows
- Phase 25 (Project Edit History) can proceed independently - no dependencies on this phase

---
*Phase: 24-rejection-reason-passthrough*
*Completed: 2026-02-10*
