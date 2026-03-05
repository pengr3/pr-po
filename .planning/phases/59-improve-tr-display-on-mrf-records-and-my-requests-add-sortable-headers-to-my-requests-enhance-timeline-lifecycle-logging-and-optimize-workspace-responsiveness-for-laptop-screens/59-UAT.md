---
status: complete
phase: 59-improve-tr-display
source: [59-01-SUMMARY.md, 59-02-SUMMARY.md, 59-03-SUMMARY.md, 59-04-SUMMARY.md]
started: 2026-03-05T08:10:00Z
updated: 2026-03-05T08:10:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. TR badge in My Requests
expected: In My Requests tab (MRF Form view), Transport MRF rows show a colored pill badge in the MRF Status column — yellow for Pending, green for Approved, red for Rejected. Material MRF rows are unaffected (still show their normal approval status).
result: pass
note: "Badges show correctly but formatting doesn't match existing MRF Status badge style — user wants same color/format as other status badges in the column"

### 2. TR badge in MRF Records
expected: In Procurement > MRF Records tab, Transport MRF rows show the same colored pill badge (yellow/green/red) in the MRF Status column instead of an em dash. Material rows are unaffected.
result: pass

### 3. Timeline rejection event
expected: On a PR or TR that has been rejected by Finance, click the "Timeline" button on that MRF. The modal shows a red "Rejected" event entry that includes the rejection reason, the name of who rejected it, and the timestamp.
result: pass

### 4. Timeline happy path unaffected
expected: On a PR or TR that was approved without ever being rejected, the Timeline modal shows a clean single green Approved event — no extra "Rejected" or "Resubmitted" events appear.
result: pass

### 5. My Requests default sort
expected: When opening (or switching to) the My Requests tab, the table is sorted by Date Needed ascending by default. The Date Needed column header shows a blue ↑ arrow. Other sortable headers (MRF ID, MRF Status, Procurement Status) show a grey ⇅.
result: pass

### 6. My Requests clickable sort
expected: Clicking the MRF ID, Date Needed, MRF Status, or Procurement Status column headers re-sorts the table. Clicking the same header again reverses the sort direction (↑ becomes ↓). The active column shows a blue arrow, inactive columns show grey ⇅.
result: pass
note: "Sort works but table disappears briefly (loading state) before reappearing sorted — user wants in-place sort like other tables. Same issue in Procurement MRF Records sort."

### 7. Laptop layout
expected: At approximately 1366px browser width (typical laptop), the Procurement MRF Processing split panel (pending list + MRF details) is fully visible without a horizontal scrollbar. Finance view tables are also readable at this width.
result: pass

## Summary

total: 7
passed: 7
issues: 2
pending: 0
skipped: 0

## Gaps

- truth: "TR finance_status badge uses same color and format as existing MRF Status badges in the column"
  status: failed
  reason: "User reported: formatting issue, use the color and format of existing MRF Status Badges"
  severity: cosmetic
  test: 1
  artifacts: []
  missing: []

- truth: "Clicking a sort header in My Requests re-sorts the visible rows in-place without a loading flash"
  status: failed
  reason: "User reported: table disappears for a while and returns sorted — wants in-place sort like other tables. Also affects Procurement MRF Records sort."
  severity: major
  test: 6
  artifacts: []
  missing: []
