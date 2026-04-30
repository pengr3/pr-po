---
phase: 18-finance-workflow-&-expense-reporting
plan: 06
subsystem: ui
tags: [procurement, po-tracking, document-templates, firestore, gap-closure]

# Dependency graph
requires:
  - phase: 18-05
    provides: promptPODocument function, PO/PR document templates, dynamic field persistence
  - phase: 18-02
    provides: PO/PR document templates with signature sections
provides:
  - Skip-prompt logic for PO document generation when all fields exist
  - Editable Document Details section in PO Details Modal
  - Left-aligned PO Approved by section
  - Single inline PR Prepared by (no duplicate with underline)
affects:
  - phase: 18-finance-workflow-replication
    reason: "Finance.js View PO modal should replicate the editable Document Details pattern"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional skip pattern: check existing data before showing input modal"
    - "Inline editable fields in detail modals with save-to-Firestore button"

key-files:
  created: []
  modified:
    - app/views/procurement.js

key-decisions:
  - "Skip prompt modal when all 3 document fields already exist (payment_terms, condition, delivery_date)"
  - "PO Details Modal gets editable Document Details section (payment_terms, condition, delivery_date inputs with Save button)"
  - "PO document Approved by section left-aligned (flex-start instead of flex-end)"
  - "PR document has single inline Prepared by text, duplicate section with underline removed"

patterns-established:
  - "savePODocumentFields pattern: individual field save from detail modal via updateDoc"
  - "Skip-prompt pattern: if (data.field1 && data.field2 && data.field3) { generateDirectly(); return; }"

# Metrics
duration: 4min
completed: 2026-02-08
---

# Phase 18 Plan 06: UAT Gap Closure - PO Skip-Prompt, Editable Details, Document Cosmetics Summary

**Skip-prompt logic when PO fields exist, editable Document Details in PO modal, left-aligned PO Approved by, single PR Prepared by text**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-08T09:29:00Z
- **Completed:** 2026-02-08T09:33:00Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- Added skip-prompt logic to `promptPODocument` so dynamic fields modal only appears once per PO (when any of payment_terms, condition, delivery_date is missing)
- Added editable Document Details section to PO Details Modal with Save button that persists changes to Firestore
- Changed PO document "Approved by" section from right-aligned (flex-end) to left-aligned (flex-start)
- Removed duplicate PR "Prepared by" section with underline, keeping only the single inline text at line ~4600

## Task Commits

Each task was committed atomically:

1. **Task 1: Add skip-prompt logic and editable Document Details to PO Details Modal** - `a54e871` (feat)
2. **Task 2: Fix PO document left-alignment and PR document duplicate removal** - `6896f7b` (feat)

## Files Created/Modified

- `app/views/procurement.js` - Added skip-prompt conditional in promptPODocument, editable Document Details section in viewPODetails, new savePODocumentFields function with window attach/cleanup, PO signature flex-start, removed PR duplicate Prepared by block

## Decisions Made

- Skip prompt modal when all 3 document fields already exist on the PO document (reduces repeated data entry)
- Editable Document Details in PO Details Modal allows users to set/update fields without triggering document generation
- PO document Approved by section left-aligned per UAT feedback
- PR document duplicate Prepared by with underline removed, single inline occurrence retained

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All four UAT round 2 issues (tests 8-11) are now resolved in procurement.js
- PO document fields prompt appears only once per PO when all fields are populated
- PO Details Modal provides editable interface for document fields
- Document cosmetics (PO left-align, PR single Prepared by) match business requirements
- Ready to replicate View PO pattern to finance.js

---
*Phase: 18-finance-workflow-&-expense-reporting*
*Completed: 2026-02-08*
