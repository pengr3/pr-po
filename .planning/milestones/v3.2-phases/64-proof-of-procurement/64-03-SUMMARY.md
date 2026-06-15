---
phase: 64-proof-of-procurement
plan: 03
subsystem: procurement, finance
tags: [proof-of-procurement, uat-gap, bug-fix, enhancement]
dependency_graph:
  requires: [64-02]
  provides: [immediate-proof-re-render, proof-remarks, finance-proof-column-reorder]
  affects: [app/views/procurement.js, app/views/finance.js]
tech_stack:
  added: []
  patterns: [three-state-indicator, explicit-re-render-after-save]
key_files:
  modified:
    - app/views/procurement.js
    - app/views/finance.js
decisions:
  - "Three-state proof indicator: green (URL), orange dash (remarks only), empty (nothing)"
  - "saveProofUrl explicitly calls renderPOTrackingTable and filterPRPORecords after Firestore save for immediate feedback"
  - "isFirstAttach logic updated: first attach only when BOTH currentUrl and currentRemarks are empty"
metrics:
  duration: 15m
  completed_date: "2026-03-17"
  tasks_completed: 2
  files_modified: 2
---

# Phase 64 Plan 03: Proof Indicator Fix and Remarks Enhancement Summary

**One-liner:** Immediate proof indicator re-render after save, remarks textarea in proof modal with orange dash for remarks-only entries, Finance Proof column moved next to PO ID.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix immediate re-render after proof save and add remarks field | 01d53f9 | app/views/procurement.js |
| 2 | Reposition Finance Proof column and add remarks support | 8908b13 | app/views/finance.js |

## What Was Built

### Task 1: procurement.js

**Immediate re-render fix (UAT gap closed):**
- `saveProofUrl` now explicitly calls `renderPOTrackingTable(poData)` (if PO Tracking tab is active) and `filterPRPORecords()` (if MRF Records tab is active) after the Firestore `updateDoc` completes
- The `_prpoSubDataCache` is cleared first so MRF Records re-fetches with the new proof data
- The `onSnapshot` also fires asynchronously, but these explicit calls guarantee instant visual feedback

**Remarks field in proof modal:**
- `showProofModal` signature expanded to `(poId, currentUrl, isStatusChange, statusChangeCallback, currentRemarks)`
- Modal body now includes a `<textarea id="proofRemarksInput">` below the URL input
- Save handler reads both URL and remarks; allows save if either is provided (not both required)
- URL validation only applies when a URL is actually provided

**saveProofUrl extended:**
- Signature: `(poId, url, isFirstAttach, remarks)`
- Saves `proof_remarks` to Firestore alongside `proof_url`
- `isFirstAttach` is `true` only when both `currentUrl` and `currentRemarks` were empty

**Three-state indicators (PO Tracking + MRF Records proofHtml):**
- Green checkmark (`#34a853`): has `proof_url` — click opens URL, right-click edits
- Orange dash (`#f59e0b`): has `proof_remarks` but no `proof_url` — click opens modal pre-filled
- Empty circle (`#bdc1c6` border): nothing attached — click opens modal

**poDataArray cache** now includes `proof_remarks` field for MRF Records sub-rows.

**updatePOStatus** reads `currentPO.proof_remarks` from `poData` and passes it as 5th arg to `showProofModal` on Procured/Processed trigger.

### Task 2: finance.js

**Column reorder:**
- `<th>Proof</th>` moved from between Status and Actions to immediately after PO ID header
- Row template `<td>` with proof indicator moved to second position (after PO ID `<td>`)

**Three-state indicators in Finance PO table:**
- Same green/orange/empty pattern as procurement.js
- `financeShowProofModal` updated to accept `currentRemarks` as third argument and forward it to `window.showProofModal`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- app/views/procurement.js: FOUND
- app/views/finance.js: FOUND
- Commit 01d53f9 (Task 1): FOUND
- Commit 8908b13 (Task 2): FOUND
