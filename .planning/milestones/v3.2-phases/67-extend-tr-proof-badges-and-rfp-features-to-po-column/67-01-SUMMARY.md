---
phase: 67-extend-tr-proof-badges-and-rfp-features-to-po-column
plan: "01"
subsystem: procurement-records
tags: [tr-proof, payment-progress, rfp, transport-requests, proof-modal]
dependency_graph:
  requires: []
  provides: [TR proof indicators, TR payment progress bars, collection-parameterized proof modal]
  affects: [app/proof-modal.js, app/views/procurement.js]
tech_stack:
  added: []
  patterns: [collection-parameterized save, rfpsByTR O(1) lookup map, getTRPaymentFill mirror of getPOPaymentFill]
key_files:
  created: []
  modified:
    - app/proof-modal.js
    - app/views/procurement.js
decisions:
  - "proof-modal.js collectionName defaults to 'pos' so all existing callers are unaffected"
  - "saveProofUrl parameter renamed from poId to docId to reflect collection-agnostic usage"
  - "getTRPaymentFill takes trTotalAmount as direct parameter instead of looking up from a data array"
  - "TR proof indicators for Transport-type MRFs use same three-state pattern as PO proof indicators (green/orange/empty circle)"
metrics:
  duration: 3 minutes
  completed: "2026-03-24"
  tasks_completed: 2
  files_modified: 2
---

# Phase 67 Plan 01: Extend TR Proof, Badges, and RFP Features to PO Column Summary

**One-liner:** Collection-parameterized proof modal and rfpsByTR map bring TR proof indicators and payment progress bars to Transport MRF rows, achieving parity with PO display.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Extend proof-modal.js with collection parameter; add rfpsByTR map and getTRPaymentFill | 1c7b51f | app/proof-modal.js, app/views/procurement.js |
| 2 | Render TR proof indicators and payment progress bars in MRF Records | 8b9f702 | app/views/procurement.js |

## What Was Built

### proof-modal.js: Collection-parameterized proof save

- `showProofModal` now accepts `collectionName = 'pos'` as 7th parameter
- `saveProofUrl` now accepts `collectionName = 'pos'` as 6th parameter; uses `doc(db, collectionName, docId)` instead of hardcoded `doc(db, 'pos', poId)`
- `_proofModalSave` threads `collectionName` to `saveProofUrl` call
- All existing callers unaffected (default `'pos'` preserves backward compatibility)

### procurement.js: rfpsByTR infrastructure

- Added `let rfpsByTR = {}` module-level map declaration
- rfps onSnapshot resets `rfpsByTR = {}` and populates it from `rfp.tr_id` alongside the existing `rfpsByPO` map
- TR data fetches (both Transport-type and Material+TR paths) now push `total_amount`, `proof_url`, `proof_remarks` fields
- Added `getTRPaymentFill(trId, trTotalAmount)` function that mirrors `getPOPaymentFill` but uses `rfpsByTR`

### procurement.js: MRF Records TR rendering

- Transport-type TR badges now wrap in flex column with 3px progress bar below (same pattern as Phase 66 PO badges)
- Transport-type MRF rows now render three-state proof indicators (green checkmark / orange dash / empty circle) in the Proof column
- All TR proof indicator onclick/oncontextmenu calls pass `'transport_requests'` as collection parameter to `showProofModal`
- Material+TR mixed rows also render progress bars below appended TR badges

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

Files verified:
- app/proof-modal.js: `collectionName = 'pos'` in showProofModal signature (line 20) and saveProofUrl signature (line 102); `doc(db, collectionName, docId)` at line 104
- app/views/procurement.js: `rfpsByTR` at lines 63, 300, 5146, 5155-5156; `getTRPaymentFill` defined at line 299, called at lines 4096 and 4202; `transport_requests` collection param in all four TR proof indicator modal calls (lines 4171, 4173, 4179, 4185)

Commits verified:
- 1c7b51f: feat(67-01): extend proof-modal with collection param; add rfpsByTR and getTRPaymentFill
- 8b9f702: feat(67-01): render TR proof indicators and payment progress bars in MRF Records
