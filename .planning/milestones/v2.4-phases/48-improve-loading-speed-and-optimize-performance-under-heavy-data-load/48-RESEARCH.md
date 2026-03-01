# Phase 48: Improve Loading Speed and Optimize Performance Under Heavy Data Load - Research

**Researched:** 2026-03-01
**Domain:** Firebase Firestore performance, perceived loading UX, caching
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Skeleton screens** for all data-loading areas (tables, cards, stats) — show gray placeholder shapes matching the layout that fill in as data arrives
- **Instant view swaps with skeleton** — no fade transition animations between views
- **Keep numbered pagination UX** — familiar Previous/1/2/3/Next buttons, unchanged from current behavior
- **Stale-while-revalidate for home dashboard stats** — show last-known values immediately with subtle refresh indicator, swap in fresh data when ready
- **Keep real-time onSnapshot listeners** everywhere, but scope them to visible data (current page, active filters)
- **No prefetching** — only fetch data when user navigates to a view
- **Target scale: 500-2000 records per collection**
- **Enable Firebase offline persistence (`enableIndexedDbPersistence`)** — first load from network, subsequent loads read local cache first
- **No Service Worker** — rely on existing HTTP caching (1-year immutable headers for JS/CSS)
- **No background prefetching of next-likely views**
- **Apply optimizations uniformly across all views** (Home, Procurement, Finance, MRF Records, Projects, Services, etc.)
- **Proactive optimization** — no specific user-reported pain points yet, getting ahead of scale issues

### Claude's Discretion
- Data fetching strategy: query-side Firestore pagination (limit/startAfter) vs enhanced in-memory approach — pick what works best per view
- Tab-switch data handling: whether to cache between tabs or re-fetch, per-tab basis
- Firestore composite indexes: add selectively where queries would benefit most
- In-memory reference data cache: whether suppliers/projects need an extra cache layer on top of Firebase persistence
- Whether to use `startAfter`-based cursor pagination or keep the current in-memory pagination approach
- Performance monitoring: lightweight timing logs where most useful for debugging

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 48 adds performance optimizations to a zero-build vanilla JS + Firebase Firestore SPA. The current app has two primary performance gaps: (1) every collection is loaded in full via `onSnapshot` with no document limit, meaning 2000-record collections send the entire dataset on every page load; (2) there are no loading states during data fetch — the full-screen `showLoading()` overlay is hidden as soon as `init()` completes but before `onSnapshot` callbacks fire, leaving users watching blank tables. The user experience degrades non-linearly at 500+ records because bandwidth, parsing, and re-render costs compound.

The fix strategy is a two-track approach: **perceived performance** (skeleton screens make the UI appear instant) and **actual performance** (Firebase offline persistence serves the last-known cache immediately so real data arrives faster on repeat visits, plus Firestore query scoping with `limit()`/`startAfter()` for the largest collection loads). The `enableIndexedDbPersistence` API specified in the user's locked decisions has been superseded in Firebase v10 by `initializeFirestore` with `persistentLocalCache()` — this is the most critical technical finding and the plan MUST use the modern API.

The architecture constraint is unchanged: pure ES6 modules loaded from CDN, no bundler, no build step. All solutions must be importable from `https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js`. Skeleton CSS goes in `styles/components.css`, firebase persistence config goes in `app/firebase.js`, and each view's `render()` function is the injection point for skeleton HTML.

**Primary recommendation:** Add skeleton screens in `render()` functions + Firebase `persistentLocalCache` in `firebase.js` + `limit()`-based Firestore pagination for the largest non-realtime fetches (MRF Records, PO Tracking). Home dashboard gets stale-while-revalidate using cached stat values in module scope.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore JS SDK | 10.7.1 (already in use) | `initializeFirestore`, `persistentLocalCache`, `limit`, `startAfter` | Already the app's database layer — no new dependency |
| CSS animations | native | Skeleton shimmer animation | Zero-dependency, ships with every browser |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `startAfter` / `limit` | Firestore built-in | Server-side cursor pagination | Large collections where client-side pagination would download thousands of docs |
| Module-scoped cache vars | vanilla JS | In-memory reference data cache for suppliers/projects | Reference data that changes infrequently, loaded as `getDocs` one-offs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `persistentLocalCache` (new) | `enableIndexedDbPersistence` (old) | Old API is deprecated in v10, will be removed in future versions |
| Skeleton screens | Full-screen `showLoading()` spinner | Spinner blocks interaction; skeleton shows layout structure immediately |
| `limit()`/`startAfter()` | In-memory pagination (current) | Current approach loads all docs; cursor pagination scales to 10k+ records at cost of more implementation complexity |

**Installation:** No new packages — all from existing Firebase CDN import.

---

## Architecture Patterns

### Recommended Project Structure
No new files needed. Changes touch:
```
app/
├── firebase.js          # Add initializeFirestore + persistentLocalCache
├── views/
│   ├── home.js          # Add stale-while-revalidate for stats
│   ├── procurement.js   # Add skeleton in render(), limit() for getDocs fetches
│   ├── finance.js       # Add skeleton in render()
│   ├── mrf-records.js   # Add limit()/startAfter() for main query
│   └── [all others]     # Add skeleton in render()
styles/
└── components.css       # Add .skeleton-* CSS classes
```

### Pattern 1: Firebase Offline Persistence (Modern API)

**What:** Replace `getFirestore(app)` with `initializeFirestore(app, { localCache: persistentLocalCache() })`. On first visit data is fetched from network and stored in IndexedDB. On subsequent visits, `onSnapshot` resolves from local cache first (sub-50ms), then syncs from server.

**When to use:** Single call in `app/firebase.js` at initialization. Must happen before any other Firestore operation.

**CRITICAL:** `enableIndexedDbPersistence` referenced in CONTEXT.md is the **deprecated v9 API**. Firebase v10 uses `initializeFirestore` with `localCache` option. The deprecated API still works in v10.7.1 but will eventually be removed and shows deprecation warnings.

**Example:**
```javascript
// app/firebase.js — REPLACE getFirestore(app) with this:
import {
    initializeFirestore,
    persistentLocalCache,
    persistentSingleTabManager,
    // ... all other imports stay the same
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Replace:
//   const db = getFirestore(app);
// With:
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager()
    })
});
```

**Why `persistentSingleTabManager` not `persistentMultipleTabManager`:** The SPA runs in one browser tab per session. Multi-tab manager adds cross-tab coordination overhead that isn't needed here.

**Fallback:** If IndexedDB is unavailable (private browsing in some browsers), Firebase automatically falls back to memory cache — no error handling needed.

### Pattern 2: Skeleton Screens

**What:** Replace blank table areas with gray animated placeholder shapes during data load. Shown immediately on `render()`, hidden when first real data callback fires.

**When to use:** Every view. Injected into `render()` return HTML. Replaced by actual data in the `onSnapshot`/`getDocs` callback.

**Example CSS (in `styles/components.css`):**
```css
/* Skeleton base */
.skeleton {
    background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.5s infinite;
    border-radius: 4px;
}

@keyframes skeleton-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

.skeleton-row { height: 48px; margin-bottom: 2px; }
.skeleton-stat { height: 32px; width: 60px; display: inline-block; }
.skeleton-card { height: 100px; margin-bottom: 1rem; }
```

**Example in a view's `render()` (inline, no JS needed to show):**
```javascript
export function render(activeTab = 'mrfs') {
    return `
        <div class="container">
            <table class="data-table">
                <thead>...</thead>
                <tbody id="mrfTableBody">
                    <!-- Skeleton rows shown until data arrives -->
                    <tr><td colspan="8"><div class="skeleton skeleton-row"></div></td></tr>
                    <tr><td colspan="8"><div class="skeleton skeleton-row"></div></td></tr>
                    <tr><td colspan="8"><div class="skeleton skeleton-row"></div></td></tr>
                </tbody>
            </table>
        </div>
    `;
}
```

Data callbacks replace `tbody` contents — skeleton disappears automatically when real rows are written.

### Pattern 3: Stale-While-Revalidate for Home Stats

**What:** Keep stat values in module-level variables that persist between destroy/init cycles. On `init()`, immediately write last-known values to the DOM (stat elements show real numbers instantly), then let `onSnapshot` update them when fresh data arrives from cache/network.

**When to use:** `home.js` only (locked decision). Stats are counters — showing a 1-2 second old count is acceptable and preferable to showing "0" or a spinner.

**Example:**
```javascript
// home.js — module-level persisted cache
let cachedStats = {
    activeMRFs: null,
    pendingPRs: null,
    activePOs: null,
    activeServices: null,
    servicesMRFs: null
};

function updateStatDisplay(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value;
        element.classList.remove('skeleton');
        element.classList.remove('stat-refreshing'); // remove subtle indicator
    }
}

export async function init() {
    // 1. Show last-known values immediately (if any)
    if (cachedStats.activeMRFs !== null) {
        updateStatDisplay('stat-mrfs', cachedStats.activeMRFs);
        // Add subtle "refreshing" indicator
        document.querySelectorAll('.stat-value').forEach(el => el.classList.add('stat-refreshing'));
    }
    // 2. Set up real-time listeners — will fire from cache first (with persistence), then network
    loadStats(mode);
}

// In the onSnapshot callbacks, also update cachedStats:
// cachedStats.activeMRFs = count;
// destroy() no longer resets cachedStats (only resets listeners[])
```

**Note on `destroy()` change:** Currently `destroy()` resets `stats = { activeMRFs: 0, ... }`. With stale-while-revalidate, keep the cached values across destroy/init cycles. Only the listener subscriptions get cleaned up.

### Pattern 4: Scoped onSnapshot with `limit()`

**What:** Add `limit(N)` to `onSnapshot` queries so only the current page's records are streamed. Requires `startAfter(lastDoc)` cursor to navigate pages.

**When to use:** The CONTEXT.md says "scope them to visible data (current page, active filters)". However, this is architecturally complex in the current pattern because:
1. The current pagination is all-client-side (load all, slice for display)
2. Changing to cursor pagination breaks search/filter (can't filter what you haven't loaded)
3. Many views use `onSnapshot` for real-time updates — cursor pagination and real-time updates are difficult to combine

**Recommended approach per view (Claude's discretion):**

| View | Strategy | Rationale |
|------|----------|-----------|
| `procurement.js` — loadMRFs | Keep `onSnapshot` unscoped | Query already filters by `status in [...]`, limiting active/pending MRFs; at target scale this is a small subset |
| `procurement.js` — loadSuppliers | Keep `onSnapshot` unscoped | ~50-100 suppliers expected; trivially small |
| `procurement.js` — loadPRPORecords | Add `limit(100)` to `getDocs` + `startAfter` pagination | This is a one-time `getDocs` (not realtime), largest collection; cursor pagination is appropriate here |
| `procurement.js` — loadPOTracking | Keep `onSnapshot` on full collection | PO tracking is the live view where real-time updates matter most |
| `finance.js` | Keep `onSnapshot` unscoped | Filtered by `finance_status == 'Pending'` so only pending items |
| `home.js` | Keep `onSnapshot` with `where()` filters | Already filtered, small result sets |
| `mrf-records.js` | Add `limit(100)` + `startAfter` | Largest full-collection `getDocs`, good candidate for server-side pagination |

**Key insight:** With offline persistence enabled, the `onSnapshot` callbacks for commonly-visited views fire from IndexedDB cache in <50ms on repeat visits. This resolves the "blank table" problem without cursor pagination. Cursor pagination gives additional scaling headroom for very large collections (1000+) but adds implementation complexity and should be applied selectively.

### Pattern 5: In-Memory Reference Data Cache

**What:** For reference data (suppliers, projects, services) that is loaded as `getDocs` one-shots in multiple views, cache the result in a module-scoped variable and skip the network call if data is fresh (< 5 min old).

**When to use:** `loadSuppliers()` in procurement.js, `getActiveProjects()` in utils.js, `getAllSuppliers()` in utils.js. These are called every time `init()` runs (including tab switches) and the data rarely changes.

**Example:**
```javascript
// In utils.js or a new cache.js module
let _suppliersCache = null;
let _suppliersCachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getAllSuppliers() {
    const now = Date.now();
    if (_suppliersCache && (now - _suppliersCachedAt) < CACHE_TTL_MS) {
        return _suppliersCache;
    }
    const snapshot = await getDocs(collection(db, 'suppliers'));
    _suppliersCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    _suppliersCachedAt = now;
    return _suppliersCache;
}
```

**Note:** With Firebase persistence enabled, `getDocs` already reads from IndexedDB cache when offline. The in-memory cache eliminates even the IndexedDB lookup for hot paths like tab-switching.

### Anti-Patterns to Avoid

- **Don't use `showLoading(true)`/`showLoading(false)` as the primary UX for data loading in views.** The full-screen overlay hides the whole page. Use skeleton screens instead — `showLoading()` should remain for user-triggered mutations (saving, generating PR, etc.).
- **Don't call `destroy()` reset on cached reference data.** The current pattern resets all state in `destroy()`. For stale-while-revalidate to work, the cache variables must survive `destroy()`. Only reset listener subscriptions.
- **Don't add `limit()` to `onSnapshot` queries that drive search/filter.** Filtering in-memory across a limited result set produces wrong results. Keep `onSnapshot` unscoped for views with search, or accept the full-collection load.
- **Don't add cursor pagination to the supplier list.** At 15 items/page with ~100 total suppliers, the full load is fast and the complexity isn't justified.
- **Don't use `enableIndexedDbPersistence`.** It is deprecated in Firebase v10 and will be removed in a future version. Use `initializeFirestore` with `persistentLocalCache`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Skeleton shimmer animation | Custom JS timer-based animation | CSS `@keyframes` + `animation` | Pure CSS, hardware-accelerated, zero JS |
| Offline data cache | Custom IndexedDB wrapper | Firebase `persistentLocalCache` | Firebase handles cache invalidation, TTL, network sync automatically |
| Intersection Observer for lazy loading | — | Not needed yet | At 500-2000 records, viewport-based lazy loading is premature optimization |

**Key insight:** Firebase offline persistence is a complete caching layer. Don't add a parallel local storage cache that duplicates what IndexedDB already stores — layer the lightweight in-memory cache (5min TTL) on top of Firebase, not instead of it.

---

## Common Pitfalls

### Pitfall 1: Firebase v10 Persistence API Change
**What goes wrong:** Developer uses `enableIndexedDbPersistence(db)` from the locked decision in CONTEXT.md — this is the v8/v9 API. In v10 it still works (backwards compat) but throws deprecation warnings in the console and will be removed eventually.
**Why it happens:** CONTEXT.md refers to the old API by name, which was common in v8/v9 documentation.
**How to avoid:** Use `initializeFirestore(app, { localCache: persistentLocalCache({...}) })` instead of `getFirestore(app)`. Import `initializeFirestore`, `persistentLocalCache`, `persistentSingleTabManager` from the Firestore CDN URL.
**Warning signs:** Console warning: "enableIndexedDbPersistence is deprecated. Please use initialiseFirestore with the cache option instead."

### Pitfall 2: Private Browsing / Storage Quota
**What goes wrong:** `persistentLocalCache` initialization fails silently in private browsing mode or when browser storage quota is exceeded.
**Why it happens:** IndexedDB is blocked or quota-limited in incognito/private mode in some browsers.
**How to avoid:** Firebase v10 automatically falls back to memory cache when IndexedDB is unavailable — no try/catch needed. Do not throw or alert on failure. This is handled internally by the SDK.
**Warning signs:** None visible to user — Firebase handles silently.

### Pitfall 3: Tab Switch init() Re-Runs Destroy Not Called
**What goes wrong:** Router calls `init()` on every tab switch within the same view (documented behavior, from CLAUDE.md). If skeleton screens replace the full view HTML in `render()`, and `render()` is called on tab switch, the skeleton content re-appears briefly even when data is already loaded.
**Why it happens:** The router always calls `render()` + `init()` on tab switches. `render()` outputs skeleton HTML. The onSnapshot callback hasn't fired yet to replace them.
**How to avoid:** Two strategies:
1. Only put skeleton in the non-active-tab areas. The active tab's table loads skeleton; other tabs don't pre-render.
2. Check if data is already in module scope — if `suppliersData.length > 0`, render the actual data immediately in `render()` instead of skeleton.

### Pitfall 4: onSnapshot Fires Twice (Cache Then Network)
**What goes wrong:** With offline persistence, `onSnapshot` fires once from IndexedDB cache (~50ms) and a second time from the server (~500-2000ms). If UI re-render logic isn't idempotent, users see a flash/flicker on the second update.
**Why it happens:** This is the documented behavior of Firestore with persistence enabled — cache event followed by network event.
**How to avoid:** Existing `onSnapshot` render callbacks (like `renderMRFList`, `renderPOTrackingTable`) are already idempotent (they rebuild the DOM). No change needed — this behavior is actually desirable (instant cache render → silent update from network).
**Warning signs:** If a callback has side effects on the second call (like showing a toast), add a `snapshot.metadata.fromCache` check.

### Pitfall 5: stale-while-revalidate Stats Show Wrong Numbers
**What goes wrong:** Cached stats from a previous session show outdated counts before real-time data arrives. If a user submitted an MRF since last session, they briefly see the old count.
**Why it happens:** The stale-while-revalidate pattern intentionally shows stale data.
**How to avoid:** Add a visual "refreshing" indicator (e.g., subtle opacity or a tiny spinning dot) next to stat values that are being shown from cache. Remove the indicator when the first `onSnapshot` fires. This is a locked decision from CONTEXT.md ("subtle refresh indicator").

### Pitfall 6: init() Called Sequentially Blocks Tab Display
**What goes wrong:** `procurement.js` init calls `await loadProjects()`, `await loadServicesForNewMRF()`, `await loadSuppliers()`, `await loadMRFs()` sequentially. Each waits for the previous to complete. With offline persistence the cache hit is fast, but on first load these compound.
**Why it happens:** Sequential awaits — each `getDocs`/`onSnapshot` setup waits for the previous.
**How to avoid:** Parallelize independent fetches with `Promise.all`. The calls to `loadProjects()`, `loadServicesForNewMRF()`, and `loadSuppliers()` are independent and can run concurrently.
```javascript
// Instead of sequential:
await loadProjects();
await loadServicesForNewMRF();
await loadSuppliers();
await loadMRFs();

// Use parallel:
await Promise.all([loadProjects(), loadServicesForNewMRF(), loadSuppliers()]);
await loadMRFs(); // After reference data is ready (MRF list needs suppliers for dropdowns)
```

---

## Code Examples

Verified patterns from official sources:

### Firebase v10 Offline Persistence (Modern API)
```javascript
// Source: Firebase official docs — https://firebase.google.com/docs/firestore/manage-data/enable-offline
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
    initializeFirestore,
    persistentLocalCache,
    persistentSingleTabManager
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const app = initializeApp(firebaseConfig);

// Single-tab persistence (correct for this SPA)
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager()
    })
});
```

### Skeleton Row HTML (in render())
```javascript
// Shown immediately — replaced when onSnapshot callback fires
function skeletonTableRows(cols = 6, rows = 5) {
    return Array(rows).fill(`
        <tr>
            <td colspan="${cols}">
                <div class="skeleton skeleton-row"></div>
            </td>
        </tr>
    `).join('');
}

// Usage in render():
`<tbody id="mrfTableBody">${skeletonTableRows(8, 5)}</tbody>`
```

### Stale-While-Revalidate Pattern
```javascript
// home.js — persist stats across view lifecycle
let cachedStats = { activeMRFs: null, pendingPRs: null, activePOs: null,
                    activeServices: null, servicesMRFs: null };

export async function init() {
    const mode = getDashboardMode();

    // Show cached values immediately (if available from previous visit)
    if (cachedStats.activeMRFs !== null) {
        updateStatDisplay('stat-mrfs', cachedStats.activeMRFs);
        // ... show other cached values
        markStatsRefreshing(true); // subtle visual indicator
    }

    loadStats(mode); // Sets up onSnapshot — fires from IndexedDB cache fast
}

// In onSnapshot callback:
function onMRFSnapshot(snapshot) {
    cachedStats.activeMRFs = snapshot.size;
    updateStatDisplay('stat-mrfs', cachedStats.activeMRFs);
    markStatsRefreshing(false);
}

export async function destroy() {
    statsListeners.forEach(u => u?.());
    statsListeners = [];
    // NOTE: Do NOT reset cachedStats here — that's the point of stale-while-revalidate
}
```

### Parallel Init Calls
```javascript
// procurement.js init() — replace sequential awaits with parallel
export async function init(activeTab = 'mrfs') {
    attachWindowFunctions();

    try {
        // Reference data is independent — run in parallel
        await Promise.all([
            loadProjects(),
            loadServicesForNewMRF(),
            loadSuppliers()
        ]);
        // MRF list can start after reference data (dropdown population)
        await loadMRFs();

        if (activeTab === 'records') {
            await Promise.all([loadPRPORecords(), loadPOTracking()]);
        }
    } catch (error) {
        console.error('Error initializing procurement view:', error);
        showToast('Error loading procurement data', 'error');
    }
}
```

### Snapshot fromCache Check (optional, for side-effect guards)
```javascript
// Only show toasts/alerts on network data, not cache replay
onSnapshot(q, (snapshot) => {
    if (snapshot.metadata.fromCache) {
        // Fast path — restore cached data silently
        renderFromData(snapshot);
        return;
    }
    // Network path — can safely show status updates
    renderFromData(snapshot);
    // showToast('Data refreshed', 'info'); // Only if needed
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `enableIndexedDbPersistence(db)` | `initializeFirestore` + `persistentLocalCache` | Firebase v9.8+ | Deprecated in v10, removed eventually |
| Full-screen spinner overlay | Skeleton screens | Industry standard ~2019 | Users can see layout while loading |
| Sequential `await` calls in init | `Promise.all` parallel | N/A | Reduces init time proportionally |
| Client-side-only pagination (load all) | Cursor pagination with `limit`/`startAfter` | Scalable for large collections | Required at 5000+ docs |

**Deprecated/outdated:**
- `enableIndexedDbPersistence`: Deprecated in Firebase v9+. Works in v10.7.1 with deprecation warning but not recommended.
- `enableMultiTabIndexedDbPersistence`: Same deprecation status.

---

## Open Questions

1. **Does `persistentLocalCache` export from the v10.7.1 CDN URL?**
   - What we know: The functions `initializeFirestore`, `persistentLocalCache`, `persistentSingleTabManager` are part of the Firebase v9+ modular SDK and are in the `firebase-firestore` package.
   - What's unclear: The minified CDN bundle for v10.7.1 (`https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js`) was not verified to export these by name. Firebase CDN bundles are ESM-compatible for v9+.
   - Recommendation: **Test in browser first.** If the import fails, use `enableIndexedDbPersistence` as fallback (it still works in v10.7.1 with deprecation warning). Add this as a verification step in the implementation plan.

2. **Should `loadPRPORecords` move to cursor pagination or stay in-memory?**
   - What we know: `loadPRPORecords` uses `getDocs` (not onSnapshot) and loads all MRFs with historical statuses. With offline persistence, the second load comes from IndexedDB. At 2000 MRFs, this is ~200-500KB of JSON.
   - What's unclear: Whether filter/search features are used extensively on this tab. Cursor pagination would break in-memory filtering.
   - Recommendation: Keep in-memory but add a `limit(200)` to the initial load query. Show a "Load more" button if the result count hits the limit. This is the pragmatic middle ground.

3. **How many `onSnapshot` listeners is too many at once?**
   - What we know: Current codebase has 32 `onSnapshot` listeners across 12 files. They don't all run simultaneously (only the active view's listeners are live after navigate).
   - What's unclear: Whether Firebase imposes practical limits on concurrent listeners at the target scale.
   - Recommendation: No change needed. Firebase multiplexes listeners over a single WebSocket connection. The current architecture is correct.

---

## Implementation Priority Order

Based on impact vs. effort for the target scale:

1. **Firebase offline persistence** — single change in `firebase.js`, highest impact for repeat visitors. Affects all views automatically.
2. **Skeleton screens** — visible UX improvement, applies to all views. No Firebase changes needed.
3. **Parallel `Promise.all` in init()** — low-effort refactor, measurable improvement on cold load for procurement.js.
4. **Stale-while-revalidate for home stats** — small scoped change to home.js only.
5. **In-memory cache for reference data** — moderate effort, targets getDocs calls for suppliers/projects.
6. **`limit()` on large getDocs calls** — selective application to `loadPRPORecords` and `mrf-records.js` main query.

---

## Validation Architecture

No automated test framework exists in this project (zero-build SPA). Validation is manual UAT.

**Per-plan verification checklist:**
- Hard refresh (Ctrl+Shift+R) → confirm skeleton screens appear before data loads
- Navigate between views → confirm view transitions feel instant (skeleton shown)
- Navigate to a view → navigate away → navigate back → confirm data appears faster on second visit (offline persistence working)
- Home dashboard revisit → confirm stat numbers show immediately (stale-while-revalidate)
- DevTools Network tab → throttle to "Slow 3G" → verify skeleton remains visible during load
- DevTools Application → IndexedDB → confirm Firebase database entries exist after first load
- Procurement tab switch (MRFs → Suppliers → Records) → no blank tables between tabs

---

## Sources

### Primary (HIGH confidence)
- Firebase official docs — https://firebase.google.com/docs/firestore/manage-data/enable-offline — current offline persistence API
- Firebase JS SDK reference — https://firebase.google.com/docs/reference/js/firestore_.persistentlocalcache — PersistentLocalCache interface
- GitHub firebase-js-sdk issue #7347 — performance comparison of old vs new persistence API
- CONTEXT.md — user locked decisions and code insights
- Direct code audit of `app/firebase.js`, `app/router.js`, `app/utils.js`, `app/views/procurement.js`, `app/views/home.js`, `app/views/finance.js`, `app/views/mrf-records.js`

### Secondary (MEDIUM confidence)
- puf.io article — https://puf.io/posts/enable-firestore-caching-on-web/ — initializeFirestore usage pattern
- WebSearch findings on Firebase v10 persistence APIs — cross-referenced with official docs

### Tertiary (LOW confidence)
- CDN availability of `persistentLocalCache` from gstatic v10.7.1 URL — inferred from ESM module structure, not directly verified

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Firebase v10 API verified via official docs and reference pages
- Architecture patterns: HIGH — based on direct code audit of all relevant view files
- Firebase offline persistence API: HIGH — modern API confirmed, old API confirmed deprecated
- CDN export availability: LOW — not directly verified for v10.7.1 gstatic bundle; flag for Plan implementation step

**Research date:** 2026-03-01
**Valid until:** 2026-09-01 (Firebase APIs are stable; 6-month window)
