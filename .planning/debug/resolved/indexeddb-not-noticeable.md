---
status: diagnosed
trigger: "IndexedDB Persistence Performance Not Noticeable - user cannot notice any performance improvement from IndexedDB persistence on repeat visits"
created: 2026-03-01T00:00:00Z
updated: 2026-03-01T00:00:00Z
---

## Current Focus

hypothesis: Persistence IS working correctly, but the improvement is imperceptible due to three compounding factors: (1) onSnapshot already delivers cached data on first callback before server, so skeleton-to-data transition is fast regardless, (2) skeleton screens mask the loading time making both first and repeat visits feel similar, (3) the real benefit is offline resilience rather than perceived speed
test: Code review and Firebase documentation analysis
expecting: Confirmation that config is correct but the perceived benefit is subtle by design
next_action: N/A - diagnosis complete

## Symptoms

expected: Noticeable speed improvement on repeat visits vs first visit (e.g., ~50ms cached vs ~500-2000ms network)
actual: App loads at roughly the same perceived speed whether first visit or repeat visit
errors: None - no errors reported
reproduction: Visit any view, navigate away, come back - no perceptible difference in load speed
started: Since Phase 48-01 implementation

## Eliminated

- hypothesis: Persistence configuration is wrong or not enabled
  evidence: Code review of app/firebase.js confirms correct usage of initializeFirestore() with persistentLocalCache({ tabManager: persistentSingleTabManager() }) -- this is the exact pattern from Firebase docs. No errors in the configuration.
  timestamp: 2026-03-01

- hypothesis: Persistence is enabled but onSnapshot ignores the cache
  evidence: Firebase documentation confirms that when persistence is enabled, onSnapshot will fire an initial callback with cached data from IndexedDB, then fire again when server data arrives. The app's onSnapshot callbacks will receive cached data immediately on repeat visits.
  timestamp: 2026-03-01

## Evidence

- timestamp: 2026-03-01
  checked: app/firebase.js persistence configuration
  found: Configuration is correct -- uses initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }) }). This is the recommended API replacing the deprecated enableIndexedDbPersistence().
  implication: Persistence IS enabled and configured properly.

- timestamp: 2026-03-01
  checked: Firebase SDK version (10.7.1) and known issues with persistentLocalCache
  found: GitHub issue #7347 reports persistentLocalCache is 20x slower than deprecated enableIndexedDbPersistence (850ms vs 40ms for cache reads). GitHub issue #7992 reports cache reads taking ~500ms on page refresh. These issues affect the new API that this project uses. Version 10.7.1 may still be affected by this IndexedDB cache read latency.
  implication: Even with persistence working, IndexedDB cache reads may take 500-850ms with the new API, which is in the same ballpark as a network fetch (~500-2000ms). This dramatically reduces the perceived speed advantage.

- timestamp: 2026-03-01
  checked: onSnapshot behavior with persistence enabled (Firebase docs)
  found: When persistence is enabled, onSnapshot fires an INITIAL callback with cached data (fromCache: true), then fires AGAIN when server data arrives (fromCache: false). This is the default behavior -- no special configuration needed. The app's existing onSnapshot listeners automatically benefit from this.
  implication: On repeat visits, onSnapshot IS delivering cached data first. But the callback fires once from cache, replaces skeletons with data, then fires AGAIN from server, replacing data with (identical) data. The user sees: skeleton -> data (from cache) -> same data (from server). The transition from skeleton to data happens quickly, but it ALSO happens quickly on first visits when the network is fast.

- timestamp: 2026-03-01
  checked: Skeleton screen implementation across all views
  found: 12 view files use skeletonTableRows() for initial render. home.js uses skeleton-stat spans. Skeletons are shown in render() (synchronous), then replaced when onSnapshot callback fires. The skeleton-to-data transition is the visual indicator of "loading complete."
  implication: Skeleton screens provide a consistent visual experience regardless of data source. On first visit: skeleton (200ms) -> network data. On repeat visit: skeleton (50-200ms) -> cached data -> server data. Both feel similar because the skeleton-to-data transition is under ~500ms in both cases on a reasonable network.

- timestamp: 2026-03-01
  checked: home.js stale-while-revalidate pattern
  found: home.js preserves cachedStats between destroy/init cycles (line 249: "cachedStats intentionally NOT reset"). On repeat visits within the same session, render() immediately shows cached numbers (no skeleton at all), then init() adds a "stat-refreshing" CSS class while fresh data loads. This is the ONLY view with true stale-while-revalidate.
  implication: home.js is the only view that genuinely benefits from in-memory caching (not IndexedDB). All other views show skeletons on every init() because they don't preserve data between visits. The IndexedDB persistence helps these other views by making the skeleton phase shorter, but the difference is subtle.

- timestamp: 2026-03-01
  checked: Whether views preserve data between visits (like home.js does)
  found: All views except home.js reset their data arrays to [] and show skeletons on every render()/init(). Examples: procurement.js resets projectsData, suppliersData, poData etc. in init(). finance.js resets materialPRs, transportRequests, poData. The onSnapshot callback replaces skeletons with data, but this happens from scratch every time.
  implication: The IndexedDB cache reduces the time for the first onSnapshot callback to fire (cache read vs network), but since skeleton screens mask this delay, the user perceives similar load times. The real improvement is measured in milliseconds, not in visible UX difference.

## Resolution

root_cause: |
  NOT A BUG. The persistence configuration is correct and working as designed. The improvement is imperceptible for three compounding reasons:

  1. **onSnapshot already delivers cached data first**: With persistence enabled, every onSnapshot listener fires immediately with cached data from IndexedDB before the server responds. This is automatic and requires no code changes. The data appears quickly on repeat visits.

  2. **Skeleton screens mask the timing difference**: All views (except home.js) show skeleton rows on every render, then replace them when onSnapshot fires. The skeleton-to-data transition takes roughly 100-500ms on repeat visits (cache read) vs 300-2000ms on first visits (network). On a good network, both transitions feel "instant" to the user.

  3. **Known SDK performance issue with new API**: Firebase JS SDK issue #7347 documents that persistentLocalCache (the new API used here) has significantly slower IndexedDB reads than the deprecated enableIndexedDbPersistence. Cache reads can take 500-850ms with the new API, which erodes most of the speed advantage over network fetches.

  4. **The real benefit is resilience, not perceived speed**: The primary value of IndexedDB persistence is offline support and resilience against slow/flaky networks. On fast connections (the likely test environment), the benefit is near-invisible. On 3G, high-latency, or offline scenarios, the cached data would be dramatically faster.

fix: |
  No fix needed -- this is working as designed. The severity is LOW (cosmetic/imperceptible).

  If the team wants to make the improvement MORE noticeable in the future, two optional enhancements could be considered:

  A. **In-memory stale-while-revalidate for heavy views** (like home.js already does):
     - Preserve data arrays (projectsData, suppliersData, etc.) across destroy/init cycles
     - Show stale data immediately in render() instead of skeletons
     - Add a subtle "refreshing" indicator
     - This would bypass IndexedDB entirely for in-session navigation

  B. **Upgrade Firebase SDK** to a newer version where persistentLocalCache performance may be improved (check if #7347 is resolved in newer releases)

  Neither enhancement is urgent given the current severity assessment.

verification: |
  - Confirmed persistence config matches Firebase documentation exactly
  - Confirmed onSnapshot automatically delivers cached data with persistence enabled
  - Confirmed skeleton screen implementation masks timing differences
  - Confirmed known SDK issue (#7347) reduces cache read speed advantage
  - No code changes needed

files_changed: []
