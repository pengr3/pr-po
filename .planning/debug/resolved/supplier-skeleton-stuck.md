---
status: diagnosed
trigger: "Supplier Table Skeleton Stuck Forever - skeleton shimmer rows appear but never get replaced by real supplier data when navigating to Procurement > Suppliers tab"
created: 2026-03-01T00:00:00Z
updated: 2026-03-01T00:00:00Z
---

## Current Focus

hypothesis: TTL cache guard in loadSuppliers() causes early return on tab switch, but render() already overwrote the DOM with fresh skeleton HTML - cached data never reaches the DOM
test: Trace the tab-switch flow through router.js and procurement.js init()
expecting: Confirm that render() replaces DOM (including suppliersTableBody) with skeleton, then loadSuppliers() returns early due to TTL guard, skipping renderSuppliersTable()
next_action: Return diagnosis

## Symptoms

expected: When navigating to Procurement > Suppliers tab, skeleton rows should appear briefly then be replaced by real supplier data from Firestore
actual: Skeleton shimmer rows appear and remain permanently; real data never renders
errors: None visible in console (silent failure - no error thrown)
reproduction: 1. Navigate to Procurement > MRFs tab (loads suppliers into cache via init()). 2. Switch to Procurement > Suppliers tab. 3. Skeleton rows appear and stay forever.
started: After Phase 48-04 added TTL cache guards to loadSuppliers()

## Eliminated

(none - root cause found on first hypothesis)

## Evidence

- timestamp: 2026-03-01T00:01:00Z
  checked: router.js navigate() function (lines 219-368)
  found: On tab switch within the same view (isSameView === true), the router SKIPS destroy() but ALWAYS calls render() and init(). Line 286-288: skips destroy. Line 290-310: clears app-container innerHTML via render(). Line 316-319: calls init(activeTab).
  implication: Every tab switch within procurement view replaces the entire DOM (including suppliersTableBody) with fresh HTML from render(), which contains skeleton rows. But destroy() is NOT called, so in-memory state (suppliersData, _suppliersCachedAt, listeners[]) all persist from the previous tab.

- timestamp: 2026-03-01T00:02:00Z
  checked: procurement.js render() function, line 265-266
  found: render() outputs `<tbody id="suppliersTableBody">${skeletonTableRows(5, 5)}</tbody>` - always skeleton rows, regardless of whether suppliersData already exists in memory.
  implication: After tab switch, the DOM always shows skeleton. The only way to replace it is if renderSuppliersTable() is called.

- timestamp: 2026-03-01T00:03:00Z
  checked: procurement.js loadSuppliers() function (lines 2013-2035)
  found: TTL cache guard at line 2014: `if (suppliersData.length > 0 && (Date.now() - _suppliersCachedAt) < CACHE_TTL_MS) { return; }`. When cache is fresh, the function returns immediately without calling renderSuppliersTable(). The onSnapshot listener (which calls renderSuppliersTable on line 2028) is NOT re-registered because the entire try block is skipped.
  implication: This is the root cause. On tab switch: (1) suppliersData is populated from previous tab's init, (2) _suppliersCachedAt is recent, (3) cache guard returns early, (4) renderSuppliersTable() is never called, (5) DOM shows skeleton forever.

- timestamp: 2026-03-01T00:04:00Z
  checked: procurement.js init() function (lines 417-457)
  found: init() calls loadSuppliers() at line 441 (inside Promise.all). No separate call to renderSuppliersTable() exists after loadSuppliers() returns. The ONLY path to renderSuppliersTable() is through the onSnapshot callback inside loadSuppliers().
  implication: There is no fallback rendering path. If loadSuppliers() returns early due to TTL cache, renderSuppliersTable() will never be called for this tab activation.

- timestamp: 2026-03-01T00:05:00Z
  checked: procurement.js destroy() function (lines 566-615)
  found: destroy() resets _suppliersCachedAt = 0 (line 589), suppliersData = [] (line 593), and unsubscribes all listeners (lines 579-584). This properly invalidates the cache.
  implication: The bug only manifests on TAB SWITCHES (where destroy is skipped), not on full view navigation (where destroy runs and resets everything). This matches the reported symptom.

- timestamp: 2026-03-01T00:06:00Z
  checked: loadProjects() function (lines 676-706) - same TTL pattern
  found: loadProjects() has the identical TTL guard pattern but does NOT render to a visible table on tab switch - it only populates dropdown data. So its TTL guard doesn't cause a visible bug.
  implication: The TTL cache pattern is fundamentally flawed for any function that both (a) sets up an onSnapshot listener AND (b) renders to DOM elements that get replaced on tab switch. loadSuppliers() is the only function where both conditions apply.

- timestamp: 2026-03-01T00:07:00Z
  checked: The existing onSnapshot listener behavior after tab switch
  found: When the TTL guard allows loadSuppliers() through (first call), it registers an onSnapshot listener that calls renderSuppliersTable(). This listener persists across tab switches (not unsubscribed). However, after tab switch, the listener's callback targets `document.getElementById('suppliersTableBody')` - which is a NEW DOM element (re-created by render()). The OLD listener IS still active and WOULD fire on Firestore changes, and it WOULD update the new DOM element (since it looks up by ID each time). But the listener only fires on DATA CHANGES, not on tab switches. So if no supplier data changes in Firestore, the listener never fires, and the skeleton stays.
  implication: There's actually a secondary path that could rescue the situation: if ANY supplier data changes in Firestore, the existing listener would fire and render the table. But without a data change, the skeleton persists indefinitely (up to 5 minutes until TTL expires and next tab switch re-registers).

## Resolution

root_cause: The TTL cache guard in loadSuppliers() (line 2014) returns early when suppliersData is cached and fresh, skipping the onSnapshot registration and its renderSuppliersTable() callback. But the router's tab-switch flow always calls render() which replaces the DOM with skeleton HTML. Since no code path calls renderSuppliersTable() after the early return, the skeleton remains permanently. The fundamental issue: the TTL guard conflates "data is cached in memory" with "data is displayed in the DOM" - these are independent concerns.

fix: (not applied - diagnosis only)

verification: (not applied - diagnosis only)

files_changed: []

## Suggested Fix Direction

The fix should ensure renderSuppliersTable() is called even when the TTL cache guard triggers an early return. Two approaches:

**Option A (minimal):** After the early return in loadSuppliers(), call renderSuppliersTable() to paint the cached data onto the fresh DOM:
```javascript
async function loadSuppliers() {
    if (suppliersData.length > 0 && (Date.now() - _suppliersCachedAt) < CACHE_TTL_MS) {
        renderSuppliersTable(); // Paint cached data onto fresh DOM
        return;
    }
    // ... existing onSnapshot setup
}
```

**Option B (same pattern for all):** Apply the same fix to loadProjects() if it ever renders visible UI, though currently it only populates dropdowns which are also re-created in render() - so the same bug class likely exists for project dropdowns but may be masked by loadMRFs() repopulating them.

Option A is the correct minimal fix. The same pattern should be audited in loadProjects() for dropdown population after tab switch.
