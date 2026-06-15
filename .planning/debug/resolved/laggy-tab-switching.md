---
status: diagnosed
trigger: "Procurement tab switching feels laggy + MRF Records loading spinner"
created: 2026-03-01T00:00:00Z
updated: 2026-03-01T00:00:00Z
---

## Current Focus

hypothesis: Tab switching is slow because render() rebuilds entire DOM (including skeleton/loading placeholders) on every tab switch, and init() then re-awaits async data loading before the DOM is populated -- creating a visible flash of loading state even when data is already cached in memory.
test: Traced the full code path for a tab switch within the procurement view
expecting: Confirmation that render() wipes DOM and init() re-fetches
next_action: Document findings (research only)

## Symptoms

expected: Instant tab switching within the procurement view -- clicking between MRF Processing, Supplier Management, and MRF Records should feel immediate since data is already loaded.
actual: Tab switches feel laggy. MRF Records tab briefly shows a loading/spinning indicator. There is a visible flash of skeleton/loading state on every tab switch.
errors: None (no console errors)
reproduction: Navigate to Procurement view. Click between tabs rapidly. Observe brief loading states on each switch.
started: After Phase 48-04 added TTL cache guards (though the core issue predates TTL -- TTL guards just failed to fix a deeper architectural problem).

## Eliminated

(none -- investigation converged on root cause directly)

## Evidence

- timestamp: 2026-03-01T00:01:00Z
  checked: app/router.js navigate() function (lines 219-368)
  found: |
    On EVERY tab switch within the same view, the router:
    1. Calls showLoading(true) (line 275) -- shows global loading overlay
    2. Skips destroy() (correctly, line 286-288)
    3. Calls appContainer.innerHTML = module.render(activeTab) (line 310) -- WIPES entire DOM
    4. Calls await module.init(activeTab) (line 319) -- re-runs all async initialization
    5. Calls showLoading(false) in finally block (line 367)
    The router treats tab switches identically to full view loads except it skips destroy().
    The entire DOM is rebuilt from scratch via render(), replacing any already-rendered data
    with fresh skeleton/placeholder HTML.
  implication: This is the primary mechanism causing the visual lag. The DOM is destroyed and rebuilt with loading placeholders, then init() must re-populate it.

- timestamp: 2026-03-01T00:02:00Z
  checked: procurement.js render() function (lines 155-407)
  found: |
    render() returns a complete HTML string with hardcoded loading/placeholder content:
    - Line 193-195: MRF list shows "Loading MRFs..." placeholder
    - Line 266: Suppliers table shows skeletonTableRows(5, 5) -- animated skeleton rows
    - Line 374: MRF Records container shows "Loading MRF records..." text
    - Line 303/326: Scoreboard values reset to "0"
    Every tab switch wipes whatever was previously rendered and replaces it with these placeholders.
  implication: Even if data is cached in memory, the user sees loading placeholders flash because render() always outputs them, and init() must run async code to replace them.

- timestamp: 2026-03-01T00:03:00Z
  checked: procurement.js init() function (lines 417-457)
  found: |
    init() runs on EVERY tab switch. Its sequence:
    1. attachWindowFunctions() -- fast, no issue
    2. await Promise.all([loadProjects(), loadServicesForNewMRF(), loadSuppliers()]) -- waits for all 3
    3. await loadMRFs() -- waits for MRF listener to fire
    4. If activeTab === 'records': await loadPRPORecords() + await loadPOTracking()

    Even though TTL guards let loadProjects/loadServices/loadSuppliers return early (cache hit),
    the code still awaits them AND then awaits loadMRFs(), which has NO TTL guard at all.

    loadMRFs() creates a NEW onSnapshot listener every time (line 720-761).
    Since destroy() is not called on tab switches, this creates DUPLICATE listeners.
    Each tab switch adds another MRF listener to the listeners[] array.
  implication: |
    Multiple problems compound:
    A) Even with cache hits, the await chain introduces microtask delays before DOM is populated
    B) loadMRFs() has no TTL guard -- always creates a new Firestore listener (listener leak)
    C) The new onSnapshot fires asynchronously, meaning render() placeholders are visible until the callback runs

- timestamp: 2026-03-01T00:04:00Z
  checked: loadMRFs() (lines 715-762) -- NO TTL guard
  found: |
    Unlike loadProjects/loadSuppliers/loadServicesForNewMRF, loadMRFs() has ZERO caching or
    dedup logic. Every call to init() -> loadMRFs() creates a new onSnapshot listener.
    After 5 tab switches, there are 5 concurrent MRF listeners all firing on every MRF change.
    The listeners[] array grows unboundedly during a session within the procurement view.

    loadProjects() and loadSuppliers() also use onSnapshot and also leak listeners when cache
    expires (after 5 min), but the TTL guard prevents new listeners on most tab switches.
    However, when TTL expires, they too will create duplicate listeners without cleaning up old ones.
  implication: Listener leak causes increasing resource usage over time. Each duplicate listener triggers redundant re-renders.

- timestamp: 2026-03-01T00:05:00Z
  checked: loadPRPORecords() (lines 2295-2355) and renderPRPORecords() (lines 2621+)
  found: |
    loadPRPORecords() calls showLoading(true) at line 2296 -- this shows a GLOBAL loading overlay.
    It then does two sequential Firestore getDocs() calls (MRFs + POs).
    This is the "loading rotating sign" the user sees on the MRF Records tab.

    Additionally, renderPRPORecords() at line 2645 sets its container innerHTML to
    "Loading document references..." WHILE it awaits per-row PR/PO fetches.
    So there are TWO loading indicators: the global overlay AND the inline text.

    loadPRPORecords() has NO caching at all -- every visit to Records tab re-fetches
    all historical MRFs and all POs from Firestore.
  implication: Records tab always feels slow because it makes uncached network requests on every visit.

- timestamp: 2026-03-01T00:06:00Z
  checked: showLoading() in utils.js (lines 96-101) and router.js line 275
  found: |
    showLoading(true) shows #loadingOverlay with class 'active'.
    The router calls showLoading(true) at the START of every navigate() call (line 275),
    even for same-view tab switches. This means there's always a brief global loading
    overlay flash, even if init() returns quickly.
    showLoading(false) is called in the finally block after init() completes.
  implication: The global loading overlay contributes to the "laggy" perception even when actual data loading is fast.

## Resolution

root_cause: |
  **Multiple compounding issues cause laggy tab switching:**

  1. **DOM rebuild on every tab switch (PRIMARY):** The router calls render() on every tab
     switch, which replaces the entire innerHTML with fresh HTML containing loading
     placeholders ("Loading MRFs...", skeleton rows, "Loading MRF records..."). This
     wipes already-rendered data. Then init() must asynchronously re-populate the DOM.
     The user sees a flash of loading state on every switch.

  2. **Global loading overlay on every tab switch:** The router calls showLoading(true)
     at line 275 for ALL navigations including tab switches. This shows a spinning
     overlay even for near-instant cache-hit tab switches.

  3. **loadMRFs() has no TTL guard (listener leak):** Unlike the other load functions,
     loadMRFs() always creates a new onSnapshot listener. Since destroy() is not called
     on tab switches, each switch adds a duplicate listener. After N switches, there
     are N concurrent listeners, all triggering redundant re-renders.

  4. **loadPRPORecords() is completely uncached:** The Records tab always does fresh
     Firestore getDocs() calls (all historical MRFs + all POs) with no caching whatsoever.
     It also calls showLoading(true), adding the global overlay on top of the DOM
     rebuild's inline "Loading MRF records..." text.

  5. **onSnapshot listeners leak on TTL expiry:** When TTL expires for loadProjects()
     and loadSuppliers(), they create NEW onSnapshot listeners without unsubscribing
     old ones. The old listener is still in listeners[] but still active.

  **The TTL cache guards (Phase 48-04) only address PART of the problem:**
  They prevent re-creating Firestore listeners for projects/services/suppliers within
  5 minutes. But they do NOT address the fundamental issue: render() rebuilds the DOM
  with loading placeholders on every tab switch, so even when data is cached in memory,
  the user sees a flash of skeleton/loading state while init() re-renders.

fix: (research only -- no code changes made)
verification: (research only)
files_changed: []

## Suggested Fix Direction

**Option A: Tab-aware rendering (recommended)**
- Modify the router or procurement.js to NOT call render() on tab switches
- Instead, toggle CSS visibility/display of section elements (#mrfs-section, #suppliers-section, #records-section)
- Only call tab-specific init logic (e.g., load records data) when switching TO that tab for the first time
- Skip showLoading() for same-view tab switches in the router

**Option B: Synchronous cache rendering**
- When TTL cache has data, render it synchronously in render() instead of showing placeholders
- Pass cached data to render() so it can populate tables immediately
- Only show loading state when cache is empty (first visit)

**Option C: Hybrid (best UX)**
- Router: skip showLoading() for same-view tab switches
- Router: skip render() call on same-view tab switches (just call init with new tab)
- init(): toggle section visibility instead of DOM rebuild
- init(): use cached data to populate immediately, skip Firestore calls when cache is warm
- Add TTL guard to loadMRFs() to prevent listener leaks
- Add caching to loadPRPORecords() for Records tab

**Critical bug to fix regardless of approach:**
- loadMRFs() MUST have a dedup/TTL guard to prevent listener accumulation
- loadProjects()/loadSuppliers() TTL expiry path must unsubscribe old listener before creating new one
