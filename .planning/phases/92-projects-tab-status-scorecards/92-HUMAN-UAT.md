---
status: partial
phase: 92-projects-tab-status-scorecards
source: [92-VERIFICATION.md]
started: 2026-05-18
updated: 2026-05-18
---

## Current Test

[awaiting human testing]

## Tests

### 1. Scorecard strip visual layout and real-time count population
expected: 6-col × 2-row grid appears above the filter bar; Total card spans 2 cols; each card shows a live count (not "—") after Firestore loads; counts update in real time
result: [pending]

### 2. Status card click — filter activation and blue highlight toggle
expected: clicking a status card highlights it (blue border + light blue bg) and filters the project table to matching rows; clicking the same card again or clicking Total clears the filter and shows all rows; Total card is highlighted when no status filter is active
result: [pending]

### 3. Click-outside clears active filter
expected: clicking anywhere outside the scorecard strip (e.g., the table, filter bar) clears the active status filter and removes the blue highlight from the active card; Total becomes highlighted
result: [pending]

### 4. AND-filter combination (status + Search/Client)
expected: selecting a status card AND typing in Search narrows the table to projects matching BOTH; selecting a status card AND selecting a Client narrows to projects matching BOTH; clearing one filter independently works
result: [pending]

### 5. "Proposal for Internal Approval" label wraps without truncation
expected: the long label text wraps to 2 lines inside the card without overflow, ellipsis, or hiding the count number
result: [pending]

### 6. Home page — no Projects canvas/chart for operations roles, no JS errors
expected: loading #/ as an operations_admin or operations_user shows only the Procurement stat card (Pending MRFs, Pending PRs, Active POs); no Projects status chart canvas; no JS console errors
result: [pending]

### 7. Services chart on Home page unaffected
expected: loading #/ as a super_admin or services role shows the Services chart with all status bars rendering correctly; no regression from home.js cleanup
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
