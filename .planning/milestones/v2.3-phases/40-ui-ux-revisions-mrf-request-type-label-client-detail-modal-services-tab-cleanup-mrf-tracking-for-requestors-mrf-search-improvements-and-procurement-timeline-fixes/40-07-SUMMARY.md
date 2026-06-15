---
phase: 40-ui-ux-revisions
plan: 07
subsystem: ui
tags: [mrf-records, document-generation, print-preview, procurement, purchase-request, purchase-order]

requires:
  - phase: 40-06
    provides: viewPRDetailsLocal and viewPODetailsLocal modals in mrf-records.js

provides:
  - Self-contained PR/PO document generation in mrf-records.js (no procurement.js dependency)
  - View PR button in PR detail modal footer (My Requests context)
  - View PO button in PO detail modal footer (My Requests context)
  - window.generatePRDocumentLocal and window.generatePODocumentLocal registered/cleaned-up

affects: [mrf-records, mrf-form, any future consumers of createMRFRecordsController]

tech-stack:
  added: []
  patterns:
    - "Local-suffix duplication: copy procurement.js document generation functions with 'Local' suffix to keep mrf-records.js self-contained"
    - "window registration in factory + cleanup in destroy() for document generation functions used by modal HTML attribute onclick handlers"

key-files:
  created: []
  modified:
    - app/views/mrf-records.js

key-decisions:
  - "DOCUMENT_CONFIG_LOCAL and all helper functions use 'Local' suffix to avoid any namespace collision with procurement.js equivalents in shared window scope"
  - "window.generatePRDocumentLocal/generatePODocumentLocal registered in createMRFRecordsController factory (not module level) — consistent with other window registrations pattern in that factory"
  - "procurement.js unchanged — zero regression risk, duplication is intentional for self-containment"

patterns-established:
  - "Modal footer onclick document generation: register function on window in factory, clean up in destroy()"

requirements-completed: ["UX-05"]

duration: 2min
completed: 2026-02-26
---

# Phase 40 Plan 07: View PR/PO Document Buttons in My Requests Summary

**Self-contained PR/PO document generation added to mrf-records.js — requestors can now open printable PR/PO documents from My Requests detail modals without procurement.js being loaded**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-26T05:52:34Z
- **Completed:** 2026-02-26T05:54:41Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Copied all procurement.js document generation helpers into mrf-records.js with "Local" suffix: `DOCUMENT_CONFIG_LOCAL`, `formatDocumentDateLocal`, `generateItemsTableHTMLLocal`, `generatePRHTMLLocal`, `generatePOHTMLLocal`, `openPrintWindowLocal`
- Added `generatePRDocumentLocal(prDocId)` and `generatePODocumentLocal(poDocId)` — fetch from Firestore and open printable document in new browser tab/window
- Updated `viewPRDetailsLocal` and `viewPODetailsLocal` modal footers to include blue "View PR" / "View PO" buttons with document SVG icon alongside Close
- Registered `window.generatePRDocumentLocal` and `window.generatePODocumentLocal` in `createMRFRecordsController` factory; cleaned up in `destroy()`
- procurement.js zero changes

## Task Commits

1. **Task 1: Add self-contained document generation functions and View buttons** - `1b5bc4e` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `app/views/mrf-records.js` - Added document generation section (DOCUMENT_CONFIG_LOCAL, 6 helper functions, generatePRDocumentLocal, generatePODocumentLocal); updated PR and PO modal footers; updated factory window registrations and destroy cleanup

## Decisions Made

- Used "Local" suffix on all duplicated function names (DOCUMENT_CONFIG_LOCAL, generatePRHTMLLocal, etc.) to avoid any window namespace collision with procurement.js equivalents that may also be loaded on the page
- `window.generatePRDocumentLocal` and `window.generatePODocumentLocal` are registered at the factory level (not module top-level) — consistent with the existing pattern of `_mrfRecordsViewPR_*` etc., and ensures cleanup via `destroy()` is handled by the same controller lifecycle
- procurement.js intentionally unchanged — duplication is the correct pattern here to keep mrf-records.js fully self-contained

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both UAT gaps from 40-06 are now closed: PR detail modal has View PR button, PO detail modal has View PO button
- Phase 40 gap closure complete — requestors have full view of their requests with clickable PR/PO modals and document generation

---
*Phase: 40-ui-ux-revisions*
*Completed: 2026-02-26*

## Self-Check: PASSED

- FOUND: app/views/mrf-records.js
- FOUND: commit 1b5bc4e (feat(40-07): add View PR/PO document generation buttons)
- FOUND: 16 references to Local-suffix document generation symbols in mrf-records.js
