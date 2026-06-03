---
phase: 98-ui-fixes-client-contact-notifications-payables-home
plan: 03
subsystem: finance
tags: [finance, payables, firestore, modal, escapeHTML, transport-requests]

# Dependency graph
requires:
  - phase: 73.1-finance-payables
    provides: buildPOMap/poEntries/PO Payment Summary tables + viewPODetailsFromRFP
  - phase: 65-rfp-payables-tracking
    provides: RFP Processing tables + Ref link surface
provides:
  - Fix for "Failed to load PO details" — PO Summary Ref now passes Firestore doc ID, not human-readable po_id
  - po_doc_id/tr_doc_id threaded through buildPOMap -> poEntries
  - Self-contained finance.js viewTRDetailsFromRFP read-only TR modal (no window.viewTRDetails dependency)
  - Route-by-type Ref links (PO modal / TR modal / plain text) across all 4 call sites
affects: [finance-payables, transport-requests]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Thread Firestore doc IDs (po_doc_id/tr_doc_id) through aggregation map to call sites", "Self-contained ported modal to avoid cross-view window.* coupling"]

key-files:
  created: []
  modified: [app/views/finance.js]

key-decisions:
  - "ROOT CAUSE fix (not a try/catch patch): PO Summary call sites pass po.po_doc_id (real Firestore doc ID) instead of po.poId; doc IDs sourced from RFP po_doc_id/tr_doc_id threaded through buildPOMap entry + poEntries push"
  - "viewTRDetailsFromRFP ported from mrf-records.js viewTRDetailsLocal with finance-unique modal id financeTRDetailsModal; uses getStatusClass + status-badge (imported in finance.js), formatCurrency, formatTimestamp; all tr.* fields escapeHTML'd"
  - "Date field: formatTimestamp(tr.date_submitted || tr.date_generated) — covers both TR date conventions present in finance.js"
  - "Delivery-fee RFPs left on the PO branch (they carry po_doc_id) — not special-cased, per plan note"

patterns-established:
  - "Read-only detail modal self-contained in its consuming view (no reliance on conditionally-registered window fns)"

requirements-completed: []

# Metrics
duration: ~15min
completed: 2026-06-03
---

# Phase 98 Plan 03: Payables Ref Link Summary

**Fixed the operator-reported "Failed to load PO details" by threading the real Firestore doc IDs (po_doc_id/tr_doc_id) from RFP docs through buildPOMap → poEntries so the PO Payment Summary Ref links call viewPODetailsFromRFP with a doc ID (not the human-readable po_id), and added route-by-type Ref links with a self-contained read-only TR detail modal.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-06-03
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Root cause fixed: PO Payment Summary card + table Ref links now pass `po.po_doc_id` (Firestore doc ID); previously passed `po.poId` → getDoc not found → error toast
- `po_doc_id`/`tr_doc_id` threaded through `buildPOMap` entry object and `poEntries` push
- New self-contained `viewTRDetailsFromRFP(trDocId)` ported from `mrf-records.js viewTRDetailsLocal`, modal id `financeTRDetailsModal`, window-registered + cleaned up, all TR fields `escapeHTML`'d
- All 4 Ref call sites route by type: PO → PO modal (doc ID), TR → TR modal (doc ID), truly-unlinked → plain `-`
- No dependency on `window.viewTRDetails` (works when navigating directly to `#/finance`)

## Task Commits

1. **Task 1 (doc-id threading + TR modal port) + Task 2 (route-by-type call sites)** — `4353f61` (fix)

## Files Created/Modified
- `app/views/finance.js` — buildPOMap/poEntries doc-id threading, viewTRDetailsFromRFP port + window wiring, 4 Ref call sites routed by type

## Decisions Made
See key-decisions frontmatter. Followed plan as written.

## Deviations from Plan
None of substance. Reference-faithful port choices: used `getStatusClass` + `status-badge` and `formatCurrency` (matching the proven `viewTRDetailsLocal` and finance.js imports) rather than the plan skeleton's looser placeholder; date field uses `date_submitted || date_generated` to match both TR conventions present in finance.js. Both are correctness-aligned with the threat model (all fields escaped). No scope creep.

## Issues Encountered
None.

## Verification
- `verify-98-03.cjs`: ALL 18 CHECKS PASS (TR modal + window wiring + doc-id threading + route-by-type + bug-gone assertions + unlinked dash)
- `node --check` (ES module) on finance.js: PASS
- Manual browser UAT (PO Ref opens correct PO modal with no error; TR Ref opens TR modal; direct `#/finance` nav) pending — see plan UAT checklist (writes-free, read-only viewing on PROD).

## Self-Check: PASSED
- `app/views/finance.js` modified and present
- Commit `4353f61` present in git log

## Next Phase Readiness
Independent slice. Browser UAT outstanding — confirm the previously-erroring PO Ref now loads, and TR rows open the new modal.

---
*Phase: 98-ui-fixes-client-contact-notifications-payables-home*
*Completed: 2026-06-03*
