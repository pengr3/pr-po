---
status: complete
phase: 36-fix-the-expense-breakdown-modal-in-services-export-the-one-we-ve-been-using-in-projects
source: [36-01-SUMMARY.md]
started: 2026-02-23T03:45:00Z
updated: 2026-02-23T04:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. No import errors on page load
expected: Open the app and DevTools Console. No "does not provide an export named 'showServiceExpenseBreakdownModal'" error. Page loads cleanly with zero red import errors.
result: pass

### 2. Service expense modal — correct scorecards
expected: Navigate to a service detail page. Click the expense total figure (the clickable number in Card 2 / the expense card). The modal that opens should show three scorecards labeled "Material Purchases", "Transport Fees", and "Subcon Cost" — NOT the old "MRFs", "Purchase Requests", "Purchase Orders" count display.
result: pass

### 3. Service expense modal — correct tabs
expected: With the service expense modal open, the tab strip should show two tabs: "By Category" and "Transport Fees" — NOT "Purchase Requests" / "Purchase Orders". Both tabs should be clickable and switch content.
result: pass

### 4. Service expense modal — By Category tab content
expected: With the service modal open on the "By Category" tab, you should see collapsible category rows (e.g., "Materials", "Subcontractor", etc.) — the same item-level breakdown as the project modal. If the service has no linked POs, the tab shows an empty state or zero totals.
result: pass

### 5. Project expense modal — no regression
expected: Navigate to a project detail page. Click the expense figure. The modal opens with the same three scorecards (Material Purchases / Transport Fees / Subcon Cost) and same two tabs (By Category / Transport Fees) as before. Project modal behavior is unchanged.
result: pass

### 6. Finance view expense modal — no regression
expected: Navigate to Finance → Project List (tab 3). Click any project row. The expense breakdown modal opens correctly with the project breakdown (Material/Transport/Subcon scorecards, By Category / Transport Fees tabs). No errors in the console.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
