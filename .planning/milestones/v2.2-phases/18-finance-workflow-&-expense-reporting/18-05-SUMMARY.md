---
phase: 18-finance-workflow-&-expense-reporting
plan: 05
subsystem: ui
tags: [document-templates, po-tracking, procurement, firestore]

# Dependency graph
requires:
  - phase: 18-01
    provides: Signature capture infrastructure and finance_signature_url field on POs
  - phase: 18-02
    provides: PO/PR document templates with signature sections and attribution
  - phase: 17-01
    provides: PR creator attribution (pr_creator_name field)
provides:
  - View PO button in PO Tracking table with dynamic fields prompt
  - Corrected PO document template (Approved by only, no Prepared by)
  - Corrected PR document template (Prepared by text only, no signature infrastructure)
  - Persistent PO document fields (payment_terms, condition, delivery_date) in Firestore
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic field prompt before document generation (modal -> save to Firestore -> generate)"

key-files:
  created: []
  modified:
    - app/views/procurement.js

key-decisions:
  - "Save dynamic PO fields to Firestore before document generation so values persist for future views"
  - "PO document: only Approved by section (right-aligned) since procurement team does not sign POs"
  - "PR document: only Prepared by as plain text with underline (no signature images, no Approved by section)"

patterns-established:
  - "promptPODocument pattern: fetch data -> show modal with pre-filled fields -> save to Firestore -> generate document"

# Metrics
duration: 4min
completed: 2026-02-08
---

# Phase 18 Plan 05: PO/PR Document Layout Fixes and Dynamic PO Fields Summary

**View PO button with dynamic fields prompt (Payment Terms, Condition, Delivery Date) and corrected PO/PR document signature layouts**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-08T07:24:41Z
- **Completed:** 2026-02-08T07:28:17Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added "View PO" button to PO Tracking table with dynamic fields prompt for Payment Terms, Condition, and Delivery Date
- Fixed PO document template to show only "Approved by" section (removed unnecessary "Prepared by" box)
- Fixed PR document template to show only "Prepared by" as plain text (removed signature CSS, signature images, and "Approved by" section)
- Dynamic field values persist in Firestore and pre-fill on subsequent document generation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add View PO button to PO Tracking table and add dynamic fields prompt** - `f40b018` (feat)
2. **Task 2: Fix PO document template (remove Prepared by) and PR document template (remove signatures)** - `bb34682` (fix)

## Files Created/Modified
- `app/views/procurement.js` - Added promptPODocument/generatePOWithFields functions, updated PO table row with View PO button, fixed PO/PR document HTML templates, cleaned up unused data fields

## Decisions Made
- Save dynamic PO fields (payment_terms, condition, delivery_date) to Firestore before document generation so values persist across sessions and users
- PO document shows only "Approved by" section right-aligned (procurement team does not sign POs, only finance approval matters)
- PR document shows only "Prepared by" as simple text with underline -- no signature images needed since PRs are internal preparation documents

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All four UAT issues from Phase 18 verification are now resolved (plans 04 and 05)
- PO/PR document templates match business requirements
- Dynamic field input enables per-document customization of PO terms

---
*Phase: 18-finance-workflow-&-expense-reporting*
*Completed: 2026-02-08*
