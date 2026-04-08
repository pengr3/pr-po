---
status: resolved
trigger: "void-button-missing-payables-table2"
created: 2026-04-08T00:00:00Z
updated: 2026-04-08T00:00:00Z
---

## Current Focus

hypothesis: renderPOSummaryTable sub-row action button logic (line 837) only renders a button for non-Fully-Paid RFPs, leaving Fully Paid sub-rows with no button at all — the identical pattern fix applied to renderRFPTable was not applied here.
test: Read lines 836-839 of finance.js — confirmed the ternary only produces a button when rfpStatus !== 'Fully Paid'.
expecting: Replacing the simple conditional with the same ternary used in renderRFPTable (Fully Paid → "Manage Payments" outline btn, otherwise → "Record Payment" primary btn) will surface the void flow from Table 2 sub-rows.
next_action: Apply one-line fix to subRecordBtn assignment in renderPOSummaryTable.

## Symptoms

expected: Finance > Payables tab should show a "Manage Payments" button on Fully Paid RFP sub-rows in the PO Payment Summary (Table 2), and clicking it should open openRecordPaymentModal with existing payments + void buttons. Non-Fully-Paid RFPs should show "Record Payment" button.
actual: Fully Paid RFPs in Table 2 sub-rows (e.g. RFP-CLMC-ABC-2026001-001) have NO button in the Actions column. The void UI is completely inaccessible from Table 2.
errors: No JS errors — just missing UI.
reproduction: Finance > Payables tab > expand any PO row in PO Payment Summary > look at Actions column for a Fully Paid RFP sub-row.
started: Quick task 260408-g2n commit 21a682c made a partial fix — updated renderRFPTable but not renderPOSummaryTable.

## Eliminated

- hypothesis: openRecordPaymentModal or voidPaymentRecord are missing/broken
  evidence: These were confirmed fixed in commit 21a682c and both functions exist; issue is purely that no button calls them from Table 2 sub-rows.
  timestamp: 2026-04-08T00:00:00Z

## Evidence

- timestamp: 2026-04-08T00:00:00Z
  checked: finance.js lines 836-839 (subRecordBtn assignment in renderPOSummaryTable)
  found: "const subRecordBtn = showEditControls && rfpStatus !== 'Fully Paid' ? `<button ...Record Payment...>` : '';" — the else branch is an empty string, so Fully Paid rows get no button.
  implication: Root cause confirmed. The fix is to mirror the renderRFPTable ternary: Fully Paid → "Manage Payments" outline button; otherwise → "Record Payment" primary button.

- timestamp: 2026-04-08T00:00:00Z
  checked: finance.js lines 626-630 (recordPaymentBtn in renderRFPTable — the already-fixed Table 1)
  found: "const recordPaymentBtn = showEditControls ? (status === 'Fully Paid' ? outline Manage Payments btn : primary Record Payment btn) : '';"
  implication: Exact pattern to replicate in subRecordBtn.

## Resolution

root_cause: renderPOSummaryTable's subRecordBtn conditional (line 837) uses `rfpStatus !== 'Fully Paid'` as a gate, producing an empty string for Fully Paid sub-rows. The same function that renders Fully Paid action buttons in Table 1 (renderRFPTable) was not applied to Table 2 sub-rows.
fix: Replace the two-branch conditional with the same ternary as renderRFPTable — when showEditControls is true, show "Manage Payments" outline btn for Fully Paid, or "Record Payment" primary btn otherwise.
verification: Fix applied. subRecordBtn now uses the same ternary as renderRFPTable — Fully Paid sub-rows get "Manage Payments" (btn-outline), all others get "Record Payment" (btn-primary). Both call openRecordPaymentModal which already shows existing payments with void buttons.
files_changed: [app/views/finance.js]
