---
phase: 60-fix-tr-rejection-independence-decouple-tr-status-from-mrf-and-treat-trs-as-child-records-like-prs
plan: 02
subsystem: ui
tags: [procurement, transport-requests, firestore, onSnapshot, rejection-workflow]

# Dependency graph
requires:
  - phase: 60-01
    provides: "TR Finance rejection no longer cascades to MRF status — MRF stays Approved when TR is rejected"
provides:
  - "Rejected TRs with mrf_id surface in a dedicated 'Rejected Transport Requests' panel in Procurement"
  - "Procurement can view TR rejection reason and resubmit same TR doc to Finance (tr_id preserved)"
  - "MRF query no longer includes TR Rejected status — old TR Rejected MRFs stay out of Pending area"
affects: [finance.js pending-approvals, transport-requests collection]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rejected child record listener: separate onSnapshot on transport_requests where finance_status=Rejected surfaces rejected TRs independently of MRF status"
    - "Resubmit pattern: updateDoc resets finance_status to Pending, archives prior rejection into rejection_history array (same doc, tr_id preserved)"

key-files:
  created: []
  modified:
    - app/views/procurement.js

key-decisions:
  - "Rejected TRs filter by mrf_id presence — standalone TRs without mrf_id are excluded from this panel as they follow a different flow"
  - "resubmitRejectedTR does NOT clear rejection_reason on the doc — Finance modal uses it to show 'Previously rejected' notice (per Plan 60-01 Task 2)"
  - "Empty state check updated to include cachedRejectedTRs.length so the panel stays visible even when materialMRFs and transportMRFs are empty"

patterns-established:
  - "cachedRejectedTRs pattern: module-level array updated by dedicated onSnapshot, drives panel re-render via reFilterAndRenderMRFs()"

requirements-completed: [TR-INDEP-02, TR-INDEP-04]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Phase 60 Plan 02: TR Rejection Independence — Procurement View Summary

**Dedicated rejected-TR panel in Procurement: onSnapshot listener surfaces Finance-rejected TRs independently, with resubmit-to-Finance via updateDoc on same TR doc (tr_id preserved, rejection archived to history)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T10:57:00Z
- **Completed:** 2026-03-05T10:59:07Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Removed 'TR Rejected' from loadMRFs() statuses array and both canEdit checks — Finance-rejected TRs no longer re-enter the MRF Processing Area
- Added loadRejectedTRs() onSnapshot listener (transport_requests where finance_status=Rejected and mrf_id set) feeding cachedRejectedTRs
- Added "Rejected Transport Requests" red panel at bottom of Pending Transportation Requests section showing each rejected TR with reason, rejected_by, and Resubmit button
- Added selectRejectedTR() to display TR details (items table, rejection info, total) in the details panel on click
- Added resubmitRejectedTR() to reset finance_status to Pending on same TR document while archiving prior rejection into rejection_history array

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove TR Rejected from MRF query and canEdit checks** - `1520683` (fix)
2. **Task 2: Add rejected TR listener, display panel, and resubmit function** - `c6d8efe` (feat)

## Files Created/Modified
- `app/views/procurement.js` - TR rejection independence: removed 'TR Rejected' from query/canEdit, added cachedRejectedTRs, loadRejectedTRs(), rejected TR panel in renderMRFList(), selectRejectedTR(), resubmitRejectedTR()

## Decisions Made
- Rejected TRs filter by mrf_id presence — standalone TRs without mrf_id excluded from this panel
- resubmitRejectedTR does NOT clear rejection_reason on the doc so Finance modal can show "Previously rejected" notice (Plan 60-01 dependency)
- Empty state condition updated to include cachedRejectedTRs so details panel clears only when all three lists are empty

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated empty-state condition in renderMRFList to include cachedRejectedTRs**
- **Found during:** Task 2 (renderMRFList extension)
- **Issue:** The empty-state check `materialMRFs.length === 0 && transportMRFs.length === 0` would clear the details panel and hide the Generate PR button even when rejected TRs were present — the panel would flash empty before rerender
- **Fix:** Added `&& cachedRejectedTRs.length === 0` to the condition so the panel stays populated when only rejected TRs exist
- **Files modified:** app/views/procurement.js
- **Verification:** Condition verified in place at line 997
- **Committed in:** c6d8efe (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (missing correctness guard)
**Impact on plan:** Minor correctness fix. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 60 Plan 02 complete. Both plan 60-01 and 60-02 together deliver full TR rejection independence.
- TR rejection cycle is now: Finance rejects TR → TR finance_status=Rejected, MRF stays Approved → Procurement sees rejected TR in dedicated panel → Resubmit resets finance_status=Pending → Finance sees TR again in Pending Approvals.

---
*Phase: 60-fix-tr-rejection-independence-decouple-tr-status-from-mrf-and-treat-trs-as-child-records-like-prs*
*Completed: 2026-03-05*
