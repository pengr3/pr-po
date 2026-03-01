---
status: complete
phase: 48-improve-loading-speed-and-optimize-performance-under-heavy-data-load
source: 48-01-SUMMARY.md, 48-02-SUMMARY.md, 48-03-SUMMARY.md, 48-04-SUMMARY.md
started: 2026-03-01T06:00:00Z
updated: 2026-03-01T07:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Home Dashboard Skeleton Stats on First Load
expected: Hard-refresh the page (Ctrl+Shift+R to bypass cache). The Home dashboard stat cards should show animated shimmer/skeleton placeholders (grey pulsing bars) before the real numbers appear from Firestore.
result: pass

### 2. Home Dashboard Stale-While-Revalidate on Return
expected: Navigate away from Home (e.g., go to Procurement), then navigate back to Home. The stat values should appear immediately with your last-known numbers (no "0" or blank flash), with a subtle refresh indicator while fresh data loads from Firestore.
result: pass

### 3. Procurement Supplier Table Skeleton
expected: Navigate to Procurement > Suppliers tab. Before supplier data loads, the table should show animated shimmer skeleton rows (grey pulsing bars spanning the table columns) instead of a blank table.
result: pass (retest after 48-05 fix)

### 4. Finance PR/TR Tables Skeleton
expected: Navigate to Finance > Pending Approvals. Both the Material PRs table and Transport Requests table should show skeleton shimmer rows before real data loads.
result: pass

### 5. Other Views Skeleton Loading (Spot Check)
expected: Navigate to at least 2 of these views: Projects, Services, Clients, Assignments, or User Management. Each table should show animated skeleton placeholder rows before real data loads (instead of a blank table).
result: pass

### 6. Role Config Permission Matrix Skeleton
expected: Navigate to Role Config. The permission matrix should show skeleton rows before populating with actual role/permission checkboxes. You should NOT see a flash of all-unchecked checkboxes before the real state loads.
result: pass

### 7. Fast Procurement Tab Switching (TTL Cache)
expected: In the Procurement view, switch between tabs rapidly (MRFs > Suppliers > PR/TR Generation > back to MRFs). After the first load, tab switches should feel instant with no visible re-fetching delay for reference data (projects, services, suppliers).
result: pass (retest after fc9c76d fix)

### 8. Repeat Visit Performance (IndexedDB Persistence)
expected: After using the app for a bit, close the browser tab and reopen the app. Data should appear noticeably faster than a first-ever visit — Firestore serves cached data from IndexedDB (~50ms) while fresh data syncs in the background.
result: issue
reported: "I DONT NOTICE"
severity: minor

### 9. Finance Projects Tab Loading Speed
expected: Navigate to Finance > Projects tab. The table should show skeleton loading rows, then data should load promptly without a long wait.
result: pass (retest after da9d61c fix)

## Summary

total: 9
passed: 8
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Supplier table skeleton should be replaced by real data when Firestore snapshot arrives"
  status: resolved
  reason: "User reported: Fail, it shows grey pulsing bars for so long and does not leave that state unless i refresh it."
  severity: blocker
  test: 3
  root_cause: "TTL cache guard in loadSuppliers() returns early when suppliersData is cached, but render() already wiped DOM with fresh skeleton HTML. renderSuppliersTable() is only called inside onSnapshot callback which doesn't fire again on tab switch. Cached in-memory data never gets painted to the new DOM."
  fix: "Plan 48-05: loadSuppliers() TTL early-return now calls renderSuppliersTable()"
  debug_session: ".planning/debug/supplier-skeleton-stuck.md"

- truth: "PR/PO Records tab should render data on tab switch, not show blank table"
  status: resolved
  reason: "User reported: /#/procurement/records still gives a blank table"
  severity: major
  test: 7
  root_cause: "renderPRPORecords() is async but TTL early-return called it without await — function returned before DOM was painted"
  fix: "Added await before renderPRPORecords() in TTL early-return branch (line 2320)"
  debug_session: ""

- truth: "Repeat visits should feel noticeably faster due to IndexedDB persistence"
  status: wontfix
  reason: "User reported: I DONT NOTICE"
  severity: minor
  test: 8
  root_cause: "NOT A BUG — Firebase SDK persistentLocalCache has known slow IndexedDB reads (~500-850ms). No code fix available."
  debug_session: ".planning/debug/indexeddb-not-noticeable.md"

- truth: "Finance Projects tab should load promptly with skeleton screen and cached data"
  status: resolved
  reason: "User reported: Finance > Projects tab was untouched and still loads long"
  severity: major
  test: 9
  root_cause: "No skeleton, sequential N+2 queries, no TTL caching."
  fix: "Commit da9d61c: skeleton screen, parallel queries, TTL cache"
  debug_session: ""
