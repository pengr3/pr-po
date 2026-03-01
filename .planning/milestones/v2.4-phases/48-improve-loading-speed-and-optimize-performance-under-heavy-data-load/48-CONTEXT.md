# Phase 48: Improve Loading Speed and Optimize Performance Under Heavy Data Load - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Optimize the app's loading speed and performance to handle 500-2000 records per Firestore collection gracefully. This covers data fetching efficiency, perceived loading speed, and caching — applied uniformly across all views. No new features or UI capabilities are added.

</domain>

<decisions>
## Implementation Decisions

### Loading UX
- Skeleton screens for all data-loading areas (tables, cards, stats) — show gray placeholder shapes matching the layout that fill in as data arrives
- Instant view swaps with skeleton — no fade transition animations between views
- Keep numbered pagination UX — familiar Previous/1/2/3/Next buttons, unchanged from current behavior
- Stale-while-revalidate for home dashboard stats — show last-known values immediately with subtle refresh indicator, swap in fresh data when ready

### Data Fetching
- Keep real-time onSnapshot listeners everywhere, but scope them to visible data (current page, active filters)
- No prefetching — only fetch data when user navigates to a view
- Target scale: 500-2000 records per collection

### Caching & Persistence
- Enable Firebase offline persistence (`enableIndexedDbPersistence`) — first load from network, subsequent loads read local cache first
- No Service Worker — rely on existing HTTP caching (1-year immutable headers for JS/CSS)
- No background prefetching of next-likely views

### View Prioritization
- Apply optimizations uniformly across all views (Home, Procurement, Finance, MRF Records, Projects, Services, etc.)
- Proactive optimization — no specific user-reported pain points yet, getting ahead of scale issues

### Claude's Discretion
- Data fetching strategy: query-side Firestore pagination (limit/startAfter) vs enhanced in-memory approach — pick what works best per view
- Tab-switch data handling: whether to cache between tabs or re-fetch, per-tab basis
- Firestore composite indexes: add selectively where queries would benefit most
- In-memory reference data cache: whether suppliers/projects need an extra cache layer on top of Firebase persistence
- Performance monitoring: lightweight timing logs where most useful for debugging

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Key constraint is the zero-build architecture (pure ES6 modules, no bundler, Firebase from CDN) so solutions must work without a build step.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/utils.js`: `showLoading()`/`hideLoading()` — existing full-screen overlay spinner (184 loading references across views)
- `app/components.js`: pagination helpers already generate numbered pagination controls
- `app/router.js`: lazy loading via dynamic imports already in place
- All views follow `render()`/`init()`/`destroy()` lifecycle with `listeners[]` array pattern

### Established Patterns
- **onSnapshot listeners**: 61 across 16 files — all load full collections with zero `limit()` or `startAfter()` usage
- **getDocs calls**: 109 across 18 files — many one-off queries with no caching
- **Module-scoped state**: Each view manages its own data arrays (`mrfsData`, `poData`, etc.)
- **Tab re-init**: Router calls `init()` on every tab switch (doesn't call `destroy()` for same-view tabs)
- **Pagination**: Client-side only — data loaded fully, then paginated in the UI (15/page suppliers, 10/page records)

### Integration Points
- `app/firebase.js`: Single initialization point — `enableIndexedDbPersistence` would go here
- `app/router.js`: View transition logic — skeleton injection point before `init()` completes
- `app/utils.js`: `showLoading()`/`hideLoading()` — needs skeleton screen alternative or enhancement
- `styles/components.css`: Skeleton CSS classes would be added here
- Each view's `render()`: Returns HTML string — skeleton markup injected here before data arrives

### Performance Bottlenecks Identified (from CONCERNS.md)
- Real-time listeners on large collections (no pagination limits)
- No loading states during tab switches (spinner hides before data arrives)
- Synchronous PDF generation blocks UI (500ms delays per PO)
- Items table re-renders entirely on every keystroke (no debouncing)
- No data pagination strategy (loads all documents, paginates only rendered table)
- No caching strategy (every page load fetches everything from Firebase)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 48-improve-loading-speed-and-optimize-performance-under-heavy-data-load*
*Context gathered: 2026-03-01*
