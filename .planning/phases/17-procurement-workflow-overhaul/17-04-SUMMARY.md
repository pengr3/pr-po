---
phase: 17-procurement-workflow-overhaul
plan: 04
subsystem: ui
tags: [procurement, supplier-history, ui-simplification, navigation]

# Dependency graph
requires:
  - phase: 17-02
    provides: MRF Records table structure
provides:
  - Clickable supplier names removed from PRs and POs columns in MRF Records
  - Single access point for supplier purchase history (Supplier Management tab)
  - Reduced visual clutter in MRF Records table
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - app/views/procurement.js

key-decisions:
  - "Remove inline supplier links from PRs and POs columns in MRF Records table"
  - "Supplier purchase history modal accessed only from Supplier Management tab"
  - "Simplified column content: PRs column shows only PR IDs, POs column shows only PO IDs + SUBCON badge"

patterns-established:
  - "Consistent supplier modal behavior: always triggered from canonical location (Supplier Management)"
  - "MRF Records table focuses on documents (IDs), not supplier relationships"

# Metrics
duration: 4min
completed: 2026-02-07
---

# Phase 17 Plan 04: Remove Inline Supplier Links Summary

**Cleaned MRF Records table with PR/PO IDs only, supplier history accessible via Supplier Management tab**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-07T06:00:00Z (approx)
- **Completed:** 2026-02-07T06:04:06Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Removed clickable supplier names from PRs column in MRF Records table
- Removed clickable supplier names from POs column in MRF Records table
- PRs column now displays only PR IDs (clickable to viewPRDetails modal)
- POs column now displays only PO IDs with SUBCON badge (clickable to viewPODetails modal)
- Supplier purchase history modal remains fully functional via Supplier Management tab
- Single, canonical access point established for supplier purchase history

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove inline supplier links from PRs column** - `4c36d71` (refactor)
2. **Task 2: Remove inline supplier links from POs column** - `4c36d71` (refactor)

Combined commit: `4c36d71` (refactor: remove inline supplier links from MRF Records table)

## Files Created/Modified
- `app/views/procurement.js` - Removed supplier links from PR and PO column rendering

## Decisions Made
- **Single access point:** Supplier purchase history modal now accessible only from Supplier Management tab where supplier name is clickable
- **Simplified columns:** PRs and POs columns show only document IDs (no inline supplier names), reducing visual clutter
- **Navigation consistency:** All supplier-related features accessed from Supplier Management tab, establishing clear information architecture
- **Details modals preserved:** Supplier information still visible in PR/PO Details modals (opened via View button), just not as clickable links

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - straightforward removal of inline supplier links from table rendering.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Plan 03 (if not already complete):** MRF Status Badges implementation.

**Integration verified:** Supplier purchase history remains fully functional:
- Clicking supplier name in Supplier Management tab opens purchase history modal
- Modal displays all POs for that supplier with complete details
- No other way to access supplier purchase history exists (enforces single access point)
- PR and PO Details modals still functional via View buttons in Actions column
- Visual simplification improves table scannability and reduces cognitive load

**User Experience impact:**
- MRF Records table is cleaner and easier to scan (fewer clickable elements)
- Supplier history access is predictable (always from Supplier Management)
- No functionality lost - all information remains accessible via appropriate views

---
*Phase: 17-procurement-workflow-overhaul*
*Completed: 2026-02-07*
