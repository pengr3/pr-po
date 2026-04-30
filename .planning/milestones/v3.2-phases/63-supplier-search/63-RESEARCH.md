# Phase 63: Supplier Search - Research

**Researched:** 2026-03-16
**Domain:** Client-side in-memory filtering with pagination integration (pure JavaScript SPA)
**Confidence:** HIGH

## Summary

Phase 63 adds a search bar to the Supplier Management tab in `procurement.js` so users can filter
the supplier list by supplier name or contact person without any Firestore interaction. The entire
feature is a pure client-side concern: filter the in-memory `suppliersData` array, maintain a
`filteredSuppliersData` variable for pagination, and re-render the existing table.

The implementation pattern is already proven in this codebase: `clients.js` uses an identical
approach — a `filter-bar` div with an `<input>` wired to `oninput`, a `getFilteredClients()`
helper that reads the input and filters the array, and `renderClientsTable()` that consumes the
filtered array for pagination. The supplier search should follow this pattern exactly.

The two non-trivial concerns are (1) keeping `filteredSuppliersData` in sync whenever `suppliersData`
is refreshed by the `onSnapshot` listener, and (2) resetting page to 1 when the search term changes.
Both are solved by the existing clients.js pattern.

**Primary recommendation:** Mirror the `clients.js` filter pattern in `procurement.js` — introduce
`filteredSuppliersData`, add `getFilteredSuppliers()`, update `renderSuppliersTable()` to consume
the filtered array, insert a `filter-bar` div above the suppliers table, and wire `filterSuppliers()`
to the input.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SUPSRCH-01 | User can filter supplier list by typing in a search bar that matches supplier name | `supplier_name` field on every `suppliersData` item; case-insensitive `.toLowerCase().includes()` filter |
| SUPSRCH-02 | Same search bar also matches contact person name (both fields searched simultaneously) | `contact_person` field on every `suppliersData` item; OR condition in the filter |
| SUPSRCH-03 | User can clear the search to restore the full supplier list | Empty-string guard in `getFilteredSuppliers()` returns full `suppliersData`; matches clients.js precedent |
| SUPSRCH-04 | Pagination reflects the filtered result count, not the total count | Pagination derived from `filteredSuppliersData.length` instead of `suppliersData.length`; `suppliersCurrentPage` reset to 1 on search |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla JS ES6 | — | In-memory array filter | Zero-build SPA constraint — no framework allowed |
| Firebase Firestore v10.7.1 CDN | 10.7.1 | `onSnapshot` live updates for suppliersData | Already in use — no change needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | — | — | No additional libraries; everything is native DOM |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory filter | Firestore query with `where` | Firestore text search requires exact-match or third-party (Algolia) — ruled out by decision; in-memory is instant |
| Plain `oninput` | Debounced input | Debounce unnecessary — dataset is small (suppliers list), instant filter is responsive enough |

**Installation:** None required.

## Architecture Patterns

### Relevant Project Structure (files touched)
```
app/views/
└── procurement.js    # All changes confined here — suppliers section only
```

No new files. No CSS changes (existing `filter-bar` class used verbatim from clients.js).

### Pattern 1: Filtered Array Variable

**What:** Introduce `filteredSuppliersData` as a module-level variable that mirrors `suppliersData`
when no search is active, or holds the subset when a search term is present.

**When to use:** Any time a paginated list needs client-side filtering.

**How clients.js does it:** `clients.js` does not declare a separate `filteredClientsData` variable;
instead `getFilteredClients()` re-computes from the input value on every render call. The procurement
view's decision log (STATE.md) explicitly calls for a `filteredSuppliersData` variable — follow that
decision.

```javascript
// Module-level state (add near existing suppliersData declaration)
let suppliersData = [];
let filteredSuppliersData = []; // NEW — populated by applySupplierSearch()
```

### Pattern 2: getFilteredSuppliers + applySupplierSearch

**What:** A helper that reads the search input value, filters `suppliersData`, stores the result
into `filteredSuppliersData`, resets the page, and triggers a render.

```javascript
// Source: mirrors clients.js getFilteredClients() / filterClients()
function applySupplierSearch() {
    const term = document.getElementById('supplierSearchInput')?.value?.toLowerCase() || '';
    if (!term) {
        filteredSuppliersData = [...suppliersData];
    } else {
        filteredSuppliersData = suppliersData.filter(s =>
            (s.supplier_name && s.supplier_name.toLowerCase().includes(term)) ||
            (s.contact_person && s.contact_person.toLowerCase().includes(term))
        );
    }
    suppliersCurrentPage = 1;
    renderSuppliersTable();
}
window.applySupplierSearch = applySupplierSearch;
```

### Pattern 3: Sync filteredSuppliersData on onSnapshot refresh

**What:** When `onSnapshot` fires (live Firestore update), `suppliersData` is replaced. The
filtered view must be re-derived so stale search results are not shown.

```javascript
// Inside loadSuppliers() onSnapshot callback, after sort:
suppliersData.sort((a, b) => a.supplier_name.localeCompare(b.supplier_name));
_suppliersCachedAt = Date.now();
// Re-apply search filter to new data before rendering
applySupplierSearch(); // replaces direct renderSuppliersTable() call
```

### Pattern 4: renderSuppliersTable reads filteredSuppliersData

**What:** `renderSuppliersTable()` currently derives pagination from `suppliersData`. After the
change it must derive pagination from `filteredSuppliersData`.

```javascript
// Before (current code):
const totalPages = Math.ceil(suppliersData.length / suppliersItemsPerPage);
const startIndex = (suppliersCurrentPage - 1) * suppliersItemsPerPage;
const endIndex = Math.min(startIndex + suppliersItemsPerPage, suppliersData.length);
const pageItems = suppliersData.slice(startIndex, endIndex);

// After:
const totalPages = Math.ceil(filteredSuppliersData.length / suppliersItemsPerPage);
const startIndex = (suppliersCurrentPage - 1) * suppliersItemsPerPage;
const endIndex = Math.min(startIndex + suppliersItemsPerPage, filteredSuppliersData.length);
const pageItems = filteredSuppliersData.slice(startIndex, endIndex);
```

### Pattern 5: changeSuppliersPage reads filteredSuppliersData

```javascript
// Before:
const totalPages = Math.ceil(suppliersData.length / suppliersItemsPerPage);

// After:
const totalPages = Math.ceil(filteredSuppliersData.length / suppliersItemsPerPage);
```

### Pattern 6: Search bar HTML — filter-bar div (exact match to clients.js)

**What:** Insert a `filter-bar` div between the `addSupplierForm` and the `table-scroll-container`.

```html
<!-- Source: mirrors clients.js filter-bar (line 88-97) -->
<div class="filter-bar" style="display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: #f8fafc; border-radius: 0.5rem;">
    <div class="form-group" style="margin: 0; flex: 2; min-width: 200px;">
        <label style="font-size: 0.875rem; margin-bottom: 0.25rem;">Search</label>
        <input type="text"
               id="supplierSearchInput"
               placeholder="Search by supplier name or contact person..."
               oninput="window.applySupplierSearch()"
               style="width: 100%;">
    </div>
</div>
```

### Pattern 7: Initialize filteredSuppliersData on loadSuppliers cache-hit path

**What:** The TTL cache-hit path at the top of `loadSuppliers()` calls `renderSuppliersTable()`
directly. After the change this path must also initialise `filteredSuppliersData` if it is empty
(first call after a tab switch) to avoid rendering nothing.

```javascript
async function loadSuppliers() {
    if (suppliersData.length > 0 && (Date.now() - _suppliersCachedAt) < CACHE_TTL_MS) {
        if (filteredSuppliersData.length === 0) {
            filteredSuppliersData = [...suppliersData]; // ensure populated on cache-hit
        }
        renderSuppliersTable();
        return;
    }
    // ... rest unchanged
}
```

### Pattern 8: Clear filteredSuppliersData in destroy()

The existing `destroy()` block in `procurement.js` resets `suppliersData = []`. Add:

```javascript
filteredSuppliersData = [];
```

So stale filtered state does not survive a full view destroy/re-init cycle.

### Anti-Patterns to Avoid

- **Filtering inside `renderSuppliersTable()` on every render:** The clients.js approach re-computes
  the filter from the DOM input on every render call, which is fine for a simple list. The STATE.md
  decision says to maintain `filteredSuppliersData` explicitly — use that. It avoids re-reading the
  DOM in every render and is clearer about what pagination operates on.
- **Firing a Firestore query per keystroke:** Firestore text search is not available; all filtering
  must be in-memory.
- **Forgetting to reset `suppliersCurrentPage = 1` when filter changes:** Failing to reset the page
  means users will land on page 3 of 1-page filtered results and see an empty table.
- **Forgetting to re-derive filteredSuppliersData after onSnapshot:** If `suppliersData` changes
  but `filteredSuppliersData` is not updated, deleted/added suppliers will not appear correctly
  while the search is active.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy/ranked text search | Custom scoring algorithm | Simple `.toLowerCase().includes()` | Project has no use case for ranked relevance; substring match is sufficient and already proven in clients.js |
| Debounce utility | Custom setTimeout wrapper | None (plain `oninput`) | Supplier dataset is small; instant filter is acceptable; no debounce needed |

## Common Pitfalls

### Pitfall 1: filteredSuppliersData empty on first tab load

**What goes wrong:** If `loadSuppliers()` fires the cache-hit path before `filteredSuppliersData`
is populated, `renderSuppliersTable()` shows an empty table even though `suppliersData` has data.

**Why it happens:** `filteredSuppliersData` starts as `[]`; the cache-hit path skips the
`onSnapshot` callback that would call `applySupplierSearch()`.

**How to avoid:** Guard the cache-hit path as shown in Pattern 7 above.

**Warning signs:** Table shows "No suppliers" immediately after a tab switch when suppliers exist.

### Pitfall 2: Pagination count mismatch

**What goes wrong:** "Showing 1-15 of 43 Suppliers" when only 3 suppliers match the search.

**Why it happens:** `updateSuppliersPaginationControls()` is called with `suppliersData.length`
instead of `filteredSuppliersData.length`.

**How to avoid:** All three places that read the suppliers array length must switch to
`filteredSuppliersData`: `renderSuppliersTable()`, `changeSuppliersPage()`, and
`updateSuppliersPaginationControls()`.

**Warning signs:** Pagination shows more pages than rows visible; "Next" button navigates to an
empty page.

### Pitfall 3: Window function not attached on tab switch

**What goes wrong:** `window.applySupplierSearch is not a function` after switching away and back
to the Suppliers tab.

**Why it happens:** The router does not call `destroy()` on tab switches; but `attachWindowFunctions()`
IS called on every `init()`. So as long as `window.applySupplierSearch = applySupplierSearch` is
inside `attachWindowFunctions()`, it will always be available.

**How to avoid:** Register `window.applySupplierSearch` inside `attachWindowFunctions()`.

**Warning signs:** Console error on first keystroke after returning to Suppliers tab.

### Pitfall 4: Edit row breaks when active during search

**What goes wrong:** If a user has a supplier row in edit mode (`editingSupplier !== null`) and
then types in the search bar, the table re-renders and the edit row disappears.

**Why it happens:** `renderSuppliersTable()` re-renders the full `filteredSuppliersData` slice.
If the edited supplier is not in the filtered set, the inline edit row vanishes without saving.

**How to avoid:** This is acceptable/expected behaviour — the same thing happens in clients.js.
No special handling required; the planner does not need to address it.

## Code Examples

### Full filter flow (verified pattern from this codebase)

```javascript
// Source: clients.js filterClients() + getFilteredClients() pattern
// Translated to suppliers domain

// 1. Module-level variable (near existing suppliersData declaration)
let filteredSuppliersData = [];

// 2. Filter function — attached to window in attachWindowFunctions()
function applySupplierSearch() {
    const term = document.getElementById('supplierSearchInput')?.value?.toLowerCase() || '';
    filteredSuppliersData = !term
        ? [...suppliersData]
        : suppliersData.filter(s =>
            (s.supplier_name && s.supplier_name.toLowerCase().includes(term)) ||
            (s.contact_person && s.contact_person.toLowerCase().includes(term))
          );
    suppliersCurrentPage = 1;
    renderSuppliersTable();
}

// 3. renderSuppliersTable — pagination from filteredSuppliersData
function renderSuppliersTable() {
    const tbody = document.getElementById('suppliersTableBody');
    if (!tbody) return;

    if (filteredSuppliersData.length === 0) {
        const term = document.getElementById('supplierSearchInput')?.value || '';
        const message = term ? 'No suppliers match your search.' : 'No suppliers yet. Add your first supplier!';
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;">${message}</td></tr>`;
        const paginationDiv = document.getElementById('suppliersPagination');
        if (paginationDiv) paginationDiv.style.display = 'none';
        return;
    }

    const totalPages = Math.ceil(filteredSuppliersData.length / suppliersItemsPerPage);
    const startIndex = (suppliersCurrentPage - 1) * suppliersItemsPerPage;
    const endIndex = Math.min(startIndex + suppliersItemsPerPage, filteredSuppliersData.length);
    const pageItems = filteredSuppliersData.slice(startIndex, endIndex);

    // ... row rendering unchanged ...

    updateSuppliersPaginationControls(totalPages, startIndex, endIndex, filteredSuppliersData.length);
}

// 4. onSnapshot callback — re-derive filter after data refresh
const listener = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
    suppliersData = [];
    snapshot.forEach(doc => suppliersData.push({ id: doc.id, ...doc.data() }));
    suppliersData.sort((a, b) => a.supplier_name.localeCompare(b.supplier_name));
    _suppliersCachedAt = Date.now();
    applySupplierSearch(); // was: renderSuppliersTable()
});
```

### Search bar HTML (exact filter-bar styling from clients.js)

```html
<!-- Insert between addSupplierForm closing </div> and table-scroll-container -->
<div class="filter-bar" style="display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: #f8fafc; border-radius: 0.5rem;">
    <div class="form-group" style="margin: 0; flex: 2; min-width: 200px;">
        <label style="font-size: 0.875rem; margin-bottom: 0.25rem;">Search</label>
        <input type="text"
               id="supplierSearchInput"
               placeholder="Search by supplier name or contact person..."
               oninput="window.applySupplierSearch()"
               style="width: 100%;">
    </div>
</div>
```

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Paginate directly from `suppliersData` | Paginate from `filteredSuppliersData` | The only structural change; no API changes |
| No search | Search bar above table | Follows existing clients.js pattern |

**No deprecated items.** This phase adds new behaviour on top of stable existing code.

## Open Questions

None. The implementation is fully specified by (a) the existing clients.js pattern and (b) the
STATE.md decisions. No gaps require resolution before planning.

## Validation Architecture

> `workflow.nyquist_validation` is not present in `.planning/config.json` — treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual browser testing (zero-build SPA — no automated test framework present) |
| Config file | None |
| Quick run command | `python -m http.server 8000` then navigate to `#/procurement/suppliers` |
| Full suite command | Same — manual walkthrough of all success criteria |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUPSRCH-01 | Type "acme" — only suppliers with "acme" in name are shown | manual | n/a | n/a |
| SUPSRCH-02 | Type a contact person's name — matching suppliers appear | manual | n/a | n/a |
| SUPSRCH-03 | Clear search bar — full list restores | manual | n/a | n/a |
| SUPSRCH-04 | With filtered results, pagination shows correct count and page numbers | manual | n/a | n/a |

### Sampling Rate
- **Per task commit:** Manual smoke test: load Suppliers tab, type a search term, verify table filters
- **Per wave merge:** Full 4-criteria walkthrough against SUPSRCH-01 through SUPSRCH-04
- **Phase gate:** All 4 success criteria pass before `/gsd:verify-work`

### Wave 0 Gaps
None — no test infrastructure needed; project uses manual testing exclusively.

## Sources

### Primary (HIGH confidence)
- `app/views/clients.js` (read directly) — filter-bar HTML pattern, `filterClients()`, `getFilteredClients()`, pagination integration
- `app/views/projects.js` (read directly) — secondary filter-bar styling reference
- `app/views/procurement.js` (read directly) — current `suppliersData`, `renderSuppliersTable()`, `changeSuppliersPage()`, `updateSuppliersPaginationControls()`, `loadSuppliers()` implementations
- `.planning/STATE.md` (read directly) — locked decision: pure client-side, `filteredSuppliersData` for pagination

### Secondary (MEDIUM confidence)
None required — all findings sourced from project code directly.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero-build SPA constraint is absolute; pattern proven in clients.js
- Architecture: HIGH — code read directly from procurement.js and clients.js
- Pitfalls: HIGH — derived from reading actual implementation, not speculation

**Research date:** 2026-03-16
**Valid until:** Stable indefinitely (pure in-codebase pattern, no external dependencies)
