---
status: complete
phase: 71-revamp-expense-modal-into-financials-modal
source: [71-01-SUMMARY.md, 71-02-SUMMARY.md, 71-03-SUMMARY.md]
started: 2026-04-07T00:00:00Z
updated: 2026-04-07T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Modal title renamed to "Financial Breakdown"
expected: |
  Open the Expense/Financial Breakdown modal from any entry point.
  Modal header reads "Financial Breakdown: {name}" — not the old "Expense Breakdown".
  Close button, CSV export button, and scoreboards all still look the same.
result: pass

### 2. Third "Payables" tab visible and clickable
expected: |
  Inside the Financial Breakdown modal, there are now three tabs:
  "By Category", "Transport Fees", and "Payables".
  Clicking "Payables" switches the view and the tab underline moves to it.
  Clicking back to "By Category" or "Transport Fees" still works (no regression).
result: pass

### 3. Payables card layout matches By Category card visually
expected: |
  On the Payables tab, you see a single collapsible card.
  Card header reads "PAYABLES" on the left with a total amount on the right
  (sum of all Total Payable rows).
  A toggle arrow (▼/▶) collapses and expands the card body — same behavior as
  the CIVIL card on the By Category tab.
  Card body contains a 4-column table with headers:
  PARTICULARS | STATUS | TOTAL PAYABLE | TOTAL PAID
result: pass

### 4. Rows: one per PO, one per TR, separate Delivery Fee row
expected: |
  Open the modal for a project that has at least one PO, one TR, and one PO with
  a non-zero delivery fee.
  You see:
  - One row per PO labeled "{po_id} — {supplier_name}"
  - One row per TR labeled "{tr_id} — {supplier_name}"
  - A separate row "{po_id} — Delivery Fee" for any PO with delivery_fee > 0
  (Skip if test data doesn't include all three types — just test what you have.)
result: pass

### 5. Status values and multi-tranche active-tranche format
expected: |
  Rows show one of these statuses in the STATUS column:
  - "Not Requested" — no RFP filed yet
  - "Requested" — RFP filed, zero non-voided payments
  - "{TrancheLabel} — NN% Paid" — partial payment (e.g. "50% Down Payment — 40% Paid")
  - "Fully Paid" — totalPaid >= amount_requested
  For a multi-tranche PO, the status shows the CURRENTLY ACTIVE tranche label,
  not an aggregate. Same format as the "Current Active Tranche" column in
  Finance Payables (Phase 65.3).
result: pass
note: "Initially failed (literal 'Partial' instead of percentage). Fixed by gap-closure plan 71-03 (commit 5cee1b6) — fallback branch in deriveStatusForPO now computes '{pct}% Paid' mirroring finance.js:719-722. Re-verified pass after fix."

### 6. Sort order: Not Requested → Requested → Partial → Fully Paid (paid at bottom)
expected: |
  Rows appear top-to-bottom in this status order:
  1. Not Requested (top)
  2. Requested
  3. Partial (e.g. "50% Down Payment — 40% Paid")
  4. Fully Paid (bottom)
  Within each status bucket, rows are sorted by Total Payable descending
  (biggest outstanding amount first).
  (Skip tranches you don't have — just check the buckets you DO have appear in
  the right order.)
result: pass

### 7. Total Paid excludes voided payments
expected: |
  If any RFP has voided payment records, the Total Paid column shows only the
  NON-voided amount. Voided payments are NOT counted.
  Remaining Payable scoreboard (above the tabs) should agree with
  "sum of all Total Payable minus sum of all Total Paid" on the Payables table.
  (Skip with "n/a" if no voided payments exist in your test data.)
result: skipped
reason: no voided payments in test data

### 8. Read-only tab — no click/right-click actions on rows
expected: |
  Click any row in the Payables table — nothing happens (no modal opens, no
  detail drawer, no navigation).
  Right-click any row — you get the browser's default context menu only
  (no custom "File RFP" / "Cancel RFP" / "Record Payment" items).
  Intentional per D-08: Payables tab is a read-only worklist.
result: pass

### 9. By Category and Transport Fees tabs still work (no regression)
expected: |
  Click "By Category" — the existing category breakdown (CIVIL, etc.) still
  renders with expand/collapse working.
  Click "Transport Fees" — the existing transport breakdown still renders.
  Scoreboards at the top (Budget, Remaining Budget, Material Purchases,
  Transport Fees, Subcon Cost, Projected Cost, Remaining Payable) all still
  show correct values.
result: pass

### 10. Modal works from all call sites
expected: |
  The renamed modal + Payables tab work identically regardless of where it's
  opened from:
  - Procurement MRF Records → right-click on a project
  - Finance project list → Expense Breakdown button
  - Project Detail page (if you use that entry point)
  - Service Detail page (service mode, not project mode)
  No callers crashed or showed stale "Expense Breakdown" text.
result: pass

## Summary

total: 10
passed: 9
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

- truth: "Partial PO status must render a meaningful label ('{TrancheLabel} — NN% Paid' for active-tranche case, or 'NN% Paid' for all-tranches-individually-settled edge case) per D-02/D-03 and Phase 65.3 format"
  status: resolved
  resolved_by: "71-03 (commit 5cee1b6)"
  reason: "User reported: Partially paid items do not show the real percentage. PO_2026_03-002-ELECTIX shows literal 'Partial' label instead of percentage format. Total Payable 13,875.00 / Total Paid 6,937.50 = 50% — expected '50% Paid' (tranche label dropped in this edge case, matching finance.js reference)."
  severity: major
  test: 5
  root_cause: "Fallback branch at app/expense-modal.js:271-274 returns `statusLabel: 'Partial'` as a literal string. The branch fires when every RFP's `paidAmt >= reqAmt` individually but `totalPaid < totalPayable` at the PO level (un-RFP'd second tranche). The reference implementation at finance.js:719-722 handles this edge case by computing `${pctPaid}% Paid`. The Phase 71-02 port dropped the format and wrote the raw bucket name."
  affected_code: "app/expense-modal.js deriveStatusForPO function, lines 271-274 (the `!firstUnpaid` fallback block)"
  proposed_fix: |
    Replace lines 271-274:
      if (!firstUnpaid) {
          return { statusBucket: 'Partial', statusLabel: 'Partial', totalPayable, totalPaid };
      }
    With:
      if (!firstUnpaid) {
          const pctPaid = totalPayable > 0 ? Math.round((totalPaid / totalPayable) * 100) : 0;
          const fallbackLabel = totalPaid > 0 ? `${pctPaid}% Paid` : 'Requested';
          return { statusBucket: 'Partial', statusLabel: fallbackLabel, totalPayable, totalPaid };
      }
  regression_risk: "low — change is confined to a 4-line block inside deriveStatusForPO, which has no callers outside showExpenseBreakdownModal"
  artifacts: ["app/views/finance.js:719-722 reference implementation"]
  missing: []
