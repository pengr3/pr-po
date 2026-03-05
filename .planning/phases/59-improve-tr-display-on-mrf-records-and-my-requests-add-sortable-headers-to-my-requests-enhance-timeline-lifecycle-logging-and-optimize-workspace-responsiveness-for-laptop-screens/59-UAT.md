---
status: complete
phase: 59-improve-tr-display
source: [59-01-SUMMARY.md, 59-02-SUMMARY.md, 59-03-SUMMARY.md, 59-04-SUMMARY.md, 59-05-SUMMARY.md]
started: 2026-03-05T08:10:00Z
updated: 2026-03-05T11:00:00Z
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

### 8. TR badge CSS class (gap closure — plan 59-05)
expected: In both My Requests and Procurement MRF Records, Transport rows show TR finance_status badges using the status-badge CSS class (same color/padding/border-radius as Material MRF status badges) — no inline styles.
result: pass

### 9. In-place sort without loading flash (gap closure — plan 59-05)
expected: Clicking a sort header in My Requests or Procurement MRF Records re-sorts the table immediately in-place with no "Loading document references..." flash after the first load. Sub-data (PR/PO info) is served from the Map cache.
result: pass

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0

## Gaps

- truth: "TR finance_status badge uses same color and format as existing MRF Status badges in the column"
  status: resolved
  reason: "User reported: formatting issue, use the color and format of existing MRF Status Badges"
  severity: cosmetic
  test: 1
  root_cause: "TR badge uses hand-rolled inline style (hardcoded hex colors, different padding/border-radius) instead of the CSS-class pattern used by renderMRFStatusBadge(). Fix: replace inline-style span with <span class=\"status-badge {class}\"> in both mrf-records.js (~line 1367) and procurement.js (~line 2875)."
  fix: "Plan 59-05 — replaced inline-style spans with status-badge CSS class in mrf-records.js and procurement.js"
  artifacts:
    - path: "app/views/mrf-records.js"
      issue: "Transport else-if block builds mrfStatusHtml with inline style instead of status-badge CSS class"
    - path: "app/views/procurement.js"
      issue: "Same inline-style span in Transport else-if block around line 2875"
  missing:
    - "Replace inline-style span with <span class=\"status-badge approved|rejected|pending\"> in both Transport branches"

- truth: "Clicking a sort header in My Requests re-sorts the visible rows in-place without a loading flash"
  status: resolved
  reason: "User reported: table disappears for a while and returns sorted — wants in-place sort like other tables. Also affects Procurement MRF Records sort."
  severity: major
  test: 6
  root_cause: "sort() calls render(), and render() unconditionally writes a loading placeholder then fires Firestore sub-queries (PRs/POs per row) before painting. No caching exists, so every sort/filter/page-change re-fetches all sub-data. Same path in procurement.js renderPRPORecords(). Fix: cache PR/PO sub-data (as objects) in a Map keyed by mrf.id after first load; on sort/filter, skip Firestore and omit the loading text when cache is warm."
  fix: "Plan 59-05 — sub-data Map cache added to createMRFRecordsController and _prpoSubDataCache in procurement.js; loading placeholder guarded by cache.size === 0"
  artifacts:
    - path: "app/views/mrf-records.js"
      issue: "render() shows loading text + fires Firestore queries on every sort call (line ~1209)"
    - path: "app/views/procurement.js"
      issue: "renderPRPORecords() shows loading text + fires Firestore queries on every sort/filter call (line ~2668)"
  missing:
    - "Add row sub-data cache (Map keyed by mrf.id) in createMRFRecordsController; skip loading text and Firestore fetches when cache is warm"
    - "Add same cache in procurement.js renderPRPORecords; invalidate on fresh loadPRPORecords() call"
