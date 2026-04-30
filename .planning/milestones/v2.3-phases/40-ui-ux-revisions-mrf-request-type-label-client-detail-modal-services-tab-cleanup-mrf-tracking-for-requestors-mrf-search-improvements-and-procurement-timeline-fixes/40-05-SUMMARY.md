---
phase: 40-ui-ux-revisions
plan: 05
subsystem: ui
tags: [mrf, procurement, firestore, async, pagination]

# Dependency graph
requires:
  - phase: 40-04
    provides: mrf-records.js shared module and My Requests sub-tab in mrf-form.js

provides:
  - mrf-records.js rewritten with async PR/PO sub-row Firestore queries matching Procurement MRF Records layout
  - My Requests filter bar updated to 3-column grid with labeled filter groups

affects: [mrf-form, procurement, my-requests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promise.all per-row async pattern for fetching PR/PO sub-data on current page only"
    - "Read-only status badge spans (not editable selects) for requestor-facing procurement status"
    - "calculateMRFStatus/renderMRFStatusBadge copied locally into shared module — procurement.js unchanged (zero regression risk)"

key-files:
  created: []
  modified:
    - app/views/mrf-records.js
    - app/views/mrf-form.js

key-decisions:
  - "PR badges rendered as non-clickable <span> elements (not <a> with onclick) because window.viewPRDetails is a procurement.js function unavailable in mrf-form context"
  - "PO IDs rendered as green-styled text (not clickable links) because window.viewPODetails is similarly unavailable in mrf-form context"
  - "Procurement Status column shows read-only colored <span> badges (not editable <select> dropdowns) — requestors see but cannot modify procurement status"
  - "Transport type shows em dash for MRF Status and dashes for PRs/POs columns — same pattern as procurement.js"
  - "filter() and goToPage() pagination callback both made async to properly await render()"
  - "calculateMRFStatus and renderMRFStatusBadge duplicated locally in mrf-records.js (not exported from procurement.js) — procurement.js is 3761 lines, extracting shared logic carries regression risk"

patterns-established:
  - "Async render pattern: show loading state -> Promise.all page items -> replace container innerHTML"
  - "Read-only badge pattern: statusColors map + inline <span> style for requestor-facing views"

requirements-completed: [UX-06]

# Metrics
duration: 15min
completed: 2026-02-26
---

# Phase 40 Plan 05: My Requests Full MRF Records Layout Summary

**My Requests table rewritten to match Procurement MRF Records exactly: async PR/PO sub-row Firestore queries, calculateMRFStatus badges, and read-only procurement status badges — 7 columns minus Actions column**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-26T03:00:14Z
- **Completed:** 2026-02-26T03:15:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Rewrote mrf-records.js render pipeline to match full Procurement MRF Records table (async per-row PR/PO queries, calculateMRFStatus, read-only procurement status badges)
- Updated My Requests filter bar to 3-column grid with labeled filter groups, matching procurement.js filter bar layout
- Transport request type shows em dash for MRF Status and dashes for PR/PO columns, exactly as in procurement.js

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite mrf-records.js render pipeline** - `0d7c638` (feat)
2. **Task 2: Update My Requests filter bar** - `9df3c89` (feat)

**Plan metadata:** _(final docs commit follows)_

## Files Created/Modified
- `app/views/mrf-records.js` - Full rewrite: async render pipeline with PR/PO sub-rows matching procurement.js renderPRPORecords layout
- `app/views/mrf-form.js` - Filter bar updated to 3-column grid with labeled filter-group/label pattern

## Decisions Made
- PR badges are non-clickable `<span>` elements (not `<a>` with onclick) because `window.viewPRDetails` is a procurement.js window function unavailable when mrf-form.js is the active view
- PO IDs are green-styled text (not clickable links) for the same reason re: `window.viewPODetails`
- Procurement Status column shows read-only colored `<span>` badges (not editable `<select>`) — requestors can track status but cannot modify it
- `calculateMRFStatus` and `renderMRFStatusBadge` duplicated locally in mrf-records.js rather than extracted from procurement.js — avoids touching the 3761-line procurement.js (zero regression risk)
- `filter()` and the paginator `goToPage()` callback both made `async` to properly `await render()` which now fetches Firestore data

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- My Requests now visually identical to Procurement MRF Records (minus Actions column and clickable links)
- UAT Test 10 gap closed: requestors see full PR/PO sub-row data in the same table structure as procurement staff
- Phase 40 plan sequence complete

---
*Phase: 40-ui-ux-revisions*
*Completed: 2026-02-26*
