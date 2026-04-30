---
phase: 59-improve-tr-display
plan: 01
subsystem: ui
tags: [procurement, transport-request, finance-status, badge, firestore]

# Dependency graph
requires:
  - phase: 58-fix-tr-rejection
    provides: TR Rejected status handling in canEdit and histStatusFilter
provides:
  - TR rows in My Requests table show finance_status pill badge (Pending/Approved/Rejected) instead of em dash
  - TR rows in Procurement MRF Records table show finance_status pill badge instead of em dash
affects: [mrf-records, procurement, finance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Fetch transport_requests.finance_status per-row in render loops for Transport type MRFs
    - Store fetched TR finance_status on mrf._tr_finance_status for badge rendering
    - Inline badge style using design-system colors (Pending=#fef3c7/#f59e0b, Approved=#d1fae5/#059669, Rejected=#fee2e2/#ef4444)

key-files:
  created: []
  modified:
    - app/views/mrf-records.js
    - app/views/procurement.js

key-decisions:
  - "TR finance_status is not stored on the mrfs document — must be fetched from transport_requests collection per-row"
  - "Store fetched finance_status on mrf._tr_finance_status (ephemeral per-render) in procurement.js to avoid re-fetch between data assembly and badge render"
  - "Fetch finance_status inline in mrf-records.js render loop alongside PR/PO data (parallel per row via Promise.all)"

patterns-established:
  - "Pattern: For Transport rows, fetch transport_requests.finance_status in the per-row render async function alongside other sub-document fetches"

requirements-completed: [TR-01, TR-02]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Phase 59 Plan 01: TR Finance Status Badge Summary

**Color-coded finance_status pill badges (yellow/green/red) replace the em dash in the MRF Status column for TR rows in both the My Requests table (mrf-records.js) and Procurement MRF Records table (procurement.js)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T07:51:22Z
- **Completed:** 2026-03-05T07:53:36Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- TR rows in My Requests now show a colored finance_status badge instead of a grey em dash
- TR rows in Procurement MRF Records now show a colored finance_status badge instead of a grey em dash
- Badge colors match the existing design system: yellow for Pending, green for Approved, red for Rejected
- Material rows in both tables are completely unaffected

## Task Commits

Each task was committed atomically:

1. **Task 1: TR finance_status badge in mrf-records.js** - `2f3d2f3` (feat)
2. **Task 2: TR finance_status badge in procurement.js** - `c2cee8a` (feat)

**Plan metadata:** (docs commit, see below)

## Files Created/Modified
- `app/views/mrf-records.js` - Added Transport fetch block for finance_status + updated mrfStatusHtml to render badge
- `app/views/procurement.js` - Added finance_status capture in TR cost fetch loop + updated mrfStatusHtml to render badge

## Decisions Made
- TR `finance_status` is stored in the `transport_requests` Firestore collection, not on the `mrfs` document. Each Transport row requires a separate fetch from `transport_requests` to get this field.
- In `mrf-records.js`: fetched inline in the per-row async render function (sits alongside PR/PO fetches inside `Promise.all`).
- In `procurement.js`: captured as `mrf._tr_finance_status` during the existing TR cost fetch loop, so no additional Firestore read is needed — the data is fetched in one pass.

## Deviations from Plan

None - plan executed exactly as written. The plan's note about verifying the actual field name was addressed by reading the code: `finance_status` is on the `transport_requests` collection doc, not on `mrf.finance_status` directly, so a fetch was added in both controllers rather than just reading an existing field.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- TR status visibility is now complete for both table views
- Phase 59 has additional plans (sortable headers, timeline logging, workspace responsiveness) ready to execute

---
*Phase: 59-improve-tr-display*
*Completed: 2026-03-05*
