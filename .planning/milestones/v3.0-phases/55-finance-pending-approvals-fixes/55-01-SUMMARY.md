---
phase: 55-finance-pending-approvals-fixes
plan: 01
subsystem: ui
tags: [firebase, firestore, finance, pending-approvals, scoreboard]

# Dependency graph
requires:
  - phase: 54-mrf-table-fixes
    provides: finance.js view file with PR/TR approval workflow
provides:
  - Finance Pending Approvals tables with Date Issued + Date Needed columns (no Status column)
  - mrfCache map populating date_needed and justification from linked MRF documents
  - PR modal with JUSTIFICATION row between Delivery Address and Total Amount
  - Accurate Approved This Month scoreboard counting POs by date_issued + approved TRs by date_submitted
affects: [finance-view, pending-approvals, scoreboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "mrfCache Map: module-level cache keyed by mrf_id, populated via batch getDocs with 'in' query (30-item chunks), re-used across PR and TR render functions"
    - "Scoreboard fix: updateStats() iterates poData array checking date_issued Timestamp/seconds/string fallback against current month; calls updateStats() from loadPOs() onSnapshot so scoreboard recalculates as POs load"

key-files:
  created: []
  modified:
    - app/views/finance.js

key-decisions:
  - "mrfCache populated asynchronously inside PR and TR onSnapshot callbacks using batch getDocs to avoid N+1 queries; renderMaterialPRs/renderTransportRequests called after cache resolves"
  - "renderMaterialPRs and renderTransportRequests called immediately if all mrf_ids already cached, otherwise called inside Promise.all .then() after batch fetch completes"
  - "approvedTRsThisMonthCount loaded once in init() via loadApprovedTRsThisMonth() — not re-loaded on subsequent onSnapshot triggers; TR approval count is stable within a session"
  - "destroy() resets mrfCache to new Map() and approvedTRsThisMonthCount to 0 to ensure clean state on view reinit"

patterns-established:
  - "Batch MRF lookup pattern: filter uncached mrf_ids, split into 30-item chunks, Promise.all getDocs with 'in' query, populate cache, then re-render"

requirements-completed: [FINANCE-01, FINANCE-02, SCORE-01]

# Metrics
duration: 5min
completed: 2026-03-04
---

# Phase 55 Plan 01: Finance Pending Approvals Fixes Summary

**PR/TR tables restructured with Date Issued + Date Needed columns (no Status), plain project names, JUSTIFICATION in PR modal, and Approved This Month scoreboard fixed to count actual POs + approved TRs in current calendar month**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-04T05:27:33Z
- **Completed:** 2026-03-04T05:32:30Z
- **Tasks:** 2 (committed together in single atomic commit since both modify same file)
- **Files modified:** 1

## Accomplishments
- Removed Status column from Material PRs and Transport Requests tables; added Date Needed column fetched from linked MRF via mrfCache
- Renamed "Date" header to "Date Issued" in both PR and TR tables for clarity
- Replaced badge+code Department/Project cells with plain project_name or service_name (e.g., "Aircon Repair")
- Added mrfCache Map populated via batch getDocs with Firestore 'in' query — avoids per-row fetches, handles 30-item chunk limit
- Added JUSTIFICATION row in PR Review modal between Delivery Address and Total Amount rows
- Fixed Approved This Month scoreboard: was hardcoded to '0'; now counts POs by date_issued in current month plus approved TRs via loadApprovedTRsThisMonth()
- Added updateStats() call in loadPOs() onSnapshot so scoreboard refreshes when PO data loads

## Task Commits

1. **Task 1 + Task 2: Restructure PR/TR tables, add JUSTIFICATION modal row, fix scoreboard** - `ee96399` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `app/views/finance.js` - All changes: table theads, row templates, mrfCache, viewPRDetails JUSTIFICATION, updateStats scoreboard, loadApprovedTRsThisMonth, init() call

## Decisions Made
- mrfCache populated asynchronously inside PR and TR onSnapshot callbacks using batch getDocs with 'in' query (30-item chunks); render functions called after cache resolves
- If all mrf_ids already cached, render functions called immediately (synchronous path); otherwise called inside Promise.all .then() after batch fetch
- approvedTRsThisMonthCount loaded once in init() via loadApprovedTRsThisMonth() — TR approval count is stable within a session
- destroy() resets mrfCache to new Map() and approvedTRsThisMonthCount to 0 for clean view reinit

## Deviations from Plan

**1. [Rule 2 - Missing Critical] Added immediate render path when all mrf_ids already cached**
- **Found during:** Task 1 (mrfCache implementation)
- **Issue:** Plan's code snippet always went through Promise.all even when all mrf_ids were already in cache; this would cause an unnecessary async delay on re-renders (e.g., sort changes)
- **Fix:** Added `else { renderMaterialPRs(); }` / `else { renderTransportRequests(); }` branch so render fires synchronously when cache is warm
- **Files modified:** app/views/finance.js
- **Committed in:** ee96399

**2. [Rule 2 - Missing Critical] Added mrfCache fallback in viewPRDetails justification lookup**
- **Found during:** Task 1 (JUSTIFICATION modal row)
- **Issue:** Plan specified fetching justification via mrf_doc_id getDoc, but did not use the already-populated mrfCache; this would cause an extra Firestore read when cache already has the data
- **Fix:** Added `if (!mrfJustification && pr.mrf_id && mrfCache.has(pr.mrf_id))` fallback after the mrf_doc_id getDoc attempt
- **Files modified:** app/views/finance.js
- **Committed in:** ee96399

---

**Total deviations:** 2 auto-fixed (both Rule 2 - missing critical optimizations)
**Impact on plan:** Both auto-fixes improve correctness and reduce unnecessary Firestore reads. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 55 Plan 01 complete; Finance Pending Approvals tables now have correct column structure
- Finance view scoreboard now accurate for current month's approved POs + TRs
- Ready for Phase 56 (role-config.js fixes, per ROADMAP)

## Self-Check: PASSED

- FOUND: app/views/finance.js
- FOUND: commit ee96399 (feat(55-01): restructure PR/TR table columns, add Date Needed, fix PR modal)
- Key identifiers verified in file: Date Issued, Date Needed, mrfCache, JUSTIFICATION, approvedTRsThisMonthCount, loadApprovedTRsThisMonth

---
*Phase: 55-finance-pending-approvals-fixes*
*Completed: 2026-03-04*
