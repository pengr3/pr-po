---
phase: 29-mrf-integration
plan: 03
subsystem: ui
tags: [firestore, firebase, procurement, finance, services, department, mrf-display, pr-display, po-display]

# Dependency graph
requires:
  - phase: 29-02
    provides: MRF/PR/TR documents now store department/service_code/service_name fields on all addDoc paths
  - phase: 28-services-view
    provides: services Firestore collection with service_code/service_name fields
provides:
  - getMRFLabel() helper in procurement.js covering all 10 display call sites
  - getMRFLabel() helper in finance.js covering all 7 display call sites
  - PO addDoc in approvePR() carries service_code, service_name, department from PR
  - Services MRFs display service code and name instead of "No project" in all list/detail/document views
affects: [procurement-display, finance-display, po-tracking, document-generation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getMRFLabel() helper pattern: single function with department check + service_code fallback for display label — avoids 17 duplicated inline ternary patterns"
    - "Department-aware display: department === 'services' || (!department && service_code) -- covers pre-existing docs without department field"
    - "service_code fallback: (!doc.department && doc.service_code) catches pre-Plan-02 docs that have service_code but no department field"

key-files:
  created: []
  modified:
    - app/views/procurement.js
    - app/views/finance.js

key-decisions:
  - "getMRFLabel() uses two-condition check (department OR fallback service_code) to handle both new docs (have department field) and any pre-existing edge cases without department"
  - "Dropdown builder at procurement.js line ~993 intentionally left unchanged — maps projectsData array, not MRF/PR/PO documents, so project_code ternary is correct there"
  - "No null-guard issues arise because getMRFLabel() treats undefined the same as falsy — doc.department === 'services' is false for undefined, and doc.service_code is falsy for undefined"

patterns-established:
  - "Single helper pattern: one getMRFLabel() function in each view file eliminates N inline display expressions — future views with MRF context should import or duplicate same helper"
  - "Denormalized chain: MRF -> PR/TR (Plan 02) -> PO (Plan 03) — service_code/service_name/department flows through full document chain without joins"

requirements-completed: [MRF-10]

# Metrics
duration: 15min
completed: 2026-02-18
---

# Phase 29 Plan 03: MRF Display Labels for Services Department Summary

**getMRFLabel() department-aware helper eliminates 17 inline project_code ternary patterns across procurement.js and finance.js, plus PO addDoc now carries service_code/service_name/department completing the MRF-to-PO service data chain**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-18
- **Completed:** 2026-02-18
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `getMRFLabel(doc)` helper to procurement.js — checks `department === 'services'` (or service_code fallback for pre-existing docs), returns service label or project label accordingly
- Replaced all 10 old `project_code ? project_code + ' - ' : ''` display patterns in procurement.js with `getMRFLabel()` calls (PO stats table, 2 MRF list items, MRF detail view, PR/PO records table, PO tracking row, PR detail card, PO detail card, PR document generation, PO document generation)
- Added identical `getMRFLabel(doc)` helper to finance.js and replaced all 7 display patterns (PO document generation, PR table row, TR table row, PR detail modal, TR detail view, PO table row)
- Added `service_code`, `service_name`, `department` fields to `approvePR()` PO `addDoc` call — completing the MRF → PR → PO service data chain

## Task Commits

Each task was committed atomically:

1. **Task 1: Add getMRFLabel() helper and update all 10 display locations in procurement.js** - `30433a2` (feat)
2. **Task 2: Add getMRFLabel() to finance.js, update 7 display locations, copy service fields to PO creation** - `16523ae` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `app/views/procurement.js` - Added getMRFLabel() function at module level; 10 display call sites updated to use helper
- `app/views/finance.js` - Added getMRFLabel() function at module level; 7 display call sites updated; approvePR() PO addDoc extended with service_code/service_name/department

## Decisions Made
- `getMRFLabel()` uses dual-condition check: `department === 'services' OR (!department AND service_code)` — the fallback handles any pre-existing documents that may have `service_code` but were created before the `department` field was introduced in Plan 02
- The dropdown builder at procurement.js line ~993 (`projectOptions` map over `projectsData`) was intentionally left with the old ternary — it renders `<option>` labels for `projectsData` array entries, not MRF/PR/PO documents, so `getMRFLabel()` is inappropriate there
- No separate null guards needed in `getMRFLabel()` — the function treats `undefined` the same as falsy in all its checks, so old documents without any service fields return the project branch correctly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 29 complete: services MRFs now display correct labels in all procurement and finance views, and the full data chain (MRF -> PR/TR -> PO) carries service fields
- Pre-existing MRF documents without department/service fields will display correctly via the project branch in getMRFLabel()
- Finance view PO creation now persists service fields so PO Tracking and document generation both show service labels for services-linked orders

---
*Phase: 29-mrf-integration*
*Completed: 2026-02-18*
