---
phase: 65-rfp-payables-tracking
plan: 02
subsystem: ui
tags: [firebase, firestore, rfp, payments, procurement, onSnapshot]

# Dependency graph
requires:
  - phase: 65-rfp-payables-tracking-01
    provides: tranche builder on PO documents, rfps Firestore security rules
provides:
  - RFP creation modal triggered by right-click context menu on PO Tracking rows
  - rfps onSnapshot listener with rfpsByPO index for O(1) per-row lookup
  - generateRFPId() with RFP-[PROJECT_CODE]-### scoped sequence numbering
  - getPOPaymentFill() returning color/pct/tooltip for PO ID payment fill effect
  - PO ID cells showing red/orange/green fill based on RFP payment status
affects:
  - 65-03 (Finance payables view — reads rfps collection, uses deriveRFPStatus)
  - procurement.js PO Tracking tab

# Tech tracking
tech-stack:
  added: []
  patterns:
    - rfpsByPO index object built in onSnapshot for O(1) PO-to-RFPs lookup
    - Payment fill using absolute-positioned div inside relative td with inline width/color/opacity
    - Scoped sequential ID generation (RFP-[PROJECT_CODE]-###) querying by project_code field
    - Right-click context menu created/destroyed as DOM element with click-outside auto-close

key-files:
  created: []
  modified:
    - app/views/procurement.js
    - styles/views.css

key-decisions:
  - "rfps onSnapshot placed inside loadPOTracking with _rfpListenerActive dedup guard (same pattern as _poTrackingListenerActive)"
  - "PO fill uses inline style width/color/opacity — CSS class provides only structural (position/transition/pointer-events) so fill is fully data-driven"
  - "oncontextmenu placed on <td class=po-id-cell> not on <tr> to scope right-click target to the PO ID column only"

patterns-established:
  - "Pattern: rfpsByPO = {} lookup built once in onSnapshot; all render functions read from it without re-querying Firestore"
  - "Pattern: deriveRFPStatus() is the single source of truth for RFP payment state; Finance view should import/reuse it"

requirements-completed:
  - RFP-01
  - RFP-06

# Metrics
duration: 8min
completed: 2026-03-18
---

# Phase 65 Plan 02: RFP Creation Flow and PO Payment Fill Summary

**Right-click context menu on PO rows triggers RFP modal with tranche selector; submits to rfps collection with RFP-[PROJECT_CODE]-### IDs; PO ID cells show red/orange/green fill based on payment progress**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-18T07:19:00Z
- **Completed:** 2026-03-18T07:27:32Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added RFP creation flow: right-click any PO ID cell to see "Request Payment", opens modal pre-filled with supplier/PO/tranche data, submits to rfps Firestore collection
- Added rfps onSnapshot listener that indexes RFPs by po_id for instant per-row lookup during table rendering
- Added PO ID payment fill: red (no RFPs), orange (RFPs exist, partially paid), green (fully paid) using absolutely-positioned div inside the td cell

## Task Commits

Each task was committed atomically:

1. **Task 1: RFP creation flow — context menu, modal, ID generator, Firestore write** - `59543c4` (feat)
2. **Task 2: Add PO payment fill CSS to views.css** - `68768cc` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `app/views/procurement.js` - Added rfpsData/rfpsByPO state, rfps listener, generateRFPId, deriveRFPStatus, getPOPaymentFill, showRFPContextMenu, openRFPModal, updateRFPAmount, submitRFP; modified PO row HTML for fill effect
- `styles/views.css` - Added .po-id-cell and .po-payment-fill CSS rules

## Decisions Made
- rfps onSnapshot uses the same `_rfpListenerActive` dedup guard pattern as `_poTrackingListenerActive` to prevent duplicate listeners on tab switches
- PO fill CSS class provides only structural properties (position, transition, pointer-events); width/color/opacity are set inline by `getPOPaymentFill()` so the fill is fully data-driven without CSS specificity battles
- oncontextmenu placed on `<td>` not `<tr>` to scope right-click to the PO ID column only, matching the proof indicator's oncontextmenu pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- RFP creation and PO payment fill are complete; ready for Plan 03 (Finance payables view)
- `deriveRFPStatus()` is available in procurement.js scope; Finance view (finance.js) will need its own copy or shared import for displaying RFP statuses
- rfps collection is now being written by procurement users — Finance can query/listen to it immediately

---
*Phase: 65-rfp-payables-tracking*
*Completed: 2026-03-18*
