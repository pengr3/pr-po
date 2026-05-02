# Phase 22: Bug Fixes & UX Improvements - Research

**Researched:** 2026-02-10
**Domain:** Bug fixes (Firestore timestamps, document generation, security rules, status persistence) + UX feature (sortable table headers)
**Confidence:** HIGH

## Summary

Phase 22 addresses six distinct issues spanning four bug categories and one UX feature. Research involved direct source code analysis of `finance.js`, `procurement.js`, `projects.js`, `clients.js`, `utils.js`, `auth.js`, `permissions.js`, and `firestore.rules`.

All six issues have clear root causes identified through code inspection:
1. **PO date rendering bug**: Two code paths create POs -- the legacy path stores `date_issued` as an ISO string, the Phase 18 path stores it as `serverTimestamp()`. The finance view uses `formatDate()` which calls `new Date(dateString)` on Firestore Timestamp objects, producing "Invalid Date".
2. **Blank document details**: Finance's `generatePODocument()` falls back to hardcoded defaults (`'As per agreement'`, `'Standard terms apply'`, `'TBD'`) when PO fields are empty, instead of leaving them blank.
3. **Firestore permission errors**: The `projects.js` view loads `onSnapshot` on the `users` collection (line 378), but Firestore security rules only allow `super_admin` and `operations_admin` to list users. Procurement users (who have read-only access to Projects tab) trigger permission-denied errors.
4. **Procurement status + delivery fee persistence**: The `updatePOStatus()` function in `procurement.js` correctly saves `delivery_fee` and status timestamps to Firestore. However, delivery fees are NOT included in project expense aggregation queries (which only sum `total_amount`).
5. **Sortable table headers**: Projects view already has a working implementation that should be replicated to Finance (Project List, PO list, Pending Approvals) and Clients views.

**Primary recommendation:** Fix each bug at its root cause with minimal code changes. Use the existing `projects.js` sort pattern as the template for sortable headers.

## Standard Stack

No new libraries required. All fixes use existing stack:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore | v10.7.1 | Database, real-time listeners | Already in use |
| Vanilla JS ES6 | N/A | All view logic | No-framework SPA |

### Supporting
No additional libraries needed. The sortable tables feature uses pure CSS and vanilla JS, following the existing `projects.js` pattern.

## Architecture Patterns

### Bug 1: PO Date Rendering - Root Cause Analysis

**What's happening:**

Two PO creation paths exist:

1. **Legacy path** (`generatePOsForPR` at finance.js:2107-2121):
   ```javascript
   date_issued: new Date().toISOString().split('T')[0],  // "2026-02-10" string
   created_at: new Date().toISOString(),                   // ISO string
   ```

2. **Phase 18 path** (`generatePOsForPRWithSignature` at finance.js:1789-1791):
   ```javascript
   date_issued: serverTimestamp(),                          // Firestore Timestamp object
   date_issued_legacy: new Date().toISOString().split('T')[0],
   created_at: serverTimestamp(),
   ```

The finance PO list renders with `formatDate(po.date_issued)` (finance.js:2208). The `formatDate()` utility (utils.js:29-42) does:
```javascript
const date = new Date(dateString);  // new Date(FirestoreTimestamp) = Invalid Date
```

The PO list sort also breaks: `poData.sort((a, b) => new Date(b.date_issued) - new Date(a.date_issued))` (finance.js:2157).

**Fix pattern:** Use `formatTimestamp()` (utils.js:49-62) which already handles both Firestore Timestamps and strings:
```javascript
const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
```

### Bug 2: Blank Document Details - Root Cause Analysis

**What's happening:**

Finance view `generatePODocument()` at finance.js:487-489:
```javascript
PAYMENT_TERMS: po.payment_terms || 'As per agreement',
CONDITION: po.condition || 'Standard terms apply',
DELIVERY_DATE: formatDocumentDate(po.delivery_date || 'TBD'),
```

Same issue in procurement.js:4953-4955.

The success criterion says: "View PO in Finance shows blank fields for delivery_date, condition, payment_terms when procurement hasn't filled them."

**Fix pattern:** Replace fallback values with empty strings:
```javascript
PAYMENT_TERMS: po.payment_terms || '',
CONDITION: po.condition || '',
DELIVERY_DATE: po.delivery_date ? formatDocumentDate(po.delivery_date) : '',
```

### Bug 3: Firestore Permission Errors - Root Cause Analysis

**What's happening:**

`projects.js` line 370-396 (`loadActiveUsers()`) sets up:
```javascript
const usersQuery = query(
    collection(db, 'users'),
    where('status', '==', 'active')
);
const listener = onSnapshot(usersQuery, ...);
```

Firestore security rules (firestore.rules:60-62):
```
// users collection
allow list: if isRole('super_admin') || isRole('operations_admin');
```

The `procurement` role has `projects: { access: true, edit: false }` (seed-roles.js:84-85), so procurement users CAN navigate to the Projects tab. When they do, `loadActiveUsers()` fires and gets permission-denied.

The users list is needed for the personnel pill selector (Phase 20), which is an edit feature. Read-only users don't need it.

**Fix pattern:** Guard `loadActiveUsers()` with an edit permission check:
```javascript
async function loadActiveUsers() {
    const canEdit = window.canEditTab?.('projects');
    if (canEdit === false) {
        console.log('[Projects] Skipping user load (view-only mode)');
        return;
    }
    // ... existing listener code
}
```

Alternatively, expand the Firestore rules to allow procurement to list users. But the guard approach is simpler and maintains the principle of least privilege.

### Bug 4: Procurement Status + Delivery Fee Persistence

**What's happening:**

The `updatePOStatus()` function (procurement.js:3808-3903) correctly persists:
- `procurement_status` (the new status value)
- `delivery_fee` (when status = 'Delivered')
- Timestamps (`procurement_started_at`, `procured_at`, `delivered_at`) via `serverTimestamp()`
- Legacy date fields (`procured_date`, `delivered_date`)

**Evidence of correct persistence:** The code path at procurement.js:3860-3884 properly calls `updateDoc(poRef, updateData)`.

However, the **expense totals** do NOT include delivery fees:

1. **Finance project expenses** (finance.js:788): `sum('total_amount')` -- only sums PO item totals, not delivery_fee
2. **Project detail expenses** (project-detail.js:626-627): `sum('total_amount')` -- same issue
3. **Finance expense modal** (finance.js:927-928): `sum('total_amount')` -- same issue

The delivery fee is stored as a separate field (`delivery_fee`) and is NOT added to `total_amount` when the status changes to Delivered. The aggregation queries only sum `total_amount`.

**Fix pattern:** Two options:
- **Option A (Recommended):** When setting delivery fee, also update `total_amount` to include it: `total_amount: po.total_amount + deliveryFee`. This is the cleanest because all aggregation queries automatically pick it up.
- **Option B:** Add separate `sum('delivery_fee')` aggregation queries alongside `sum('total_amount')`. More complex, requires changes in 3+ places.

Option A is recommended because it keeps expense queries simple and consistent. The delivery fee should conceptually be part of the PO's total cost.

### Bug 5: Sortable Table Headers - Existing Pattern

**What's happening:**

`projects.js` already has a complete sortable table implementation:

1. **State variables** (projects.js:22-23):
   ```javascript
   let sortColumn = 'created_at';
   let sortDirection = 'desc';
   ```

2. **Header HTML** (projects.js:220-236):
   ```html
   <th onclick="window.sortProjects('project_code')" style="cursor: pointer; user-select: none;">
       Project Code <span class="sort-indicator" data-col="project_code"></span>
   </th>
   ```

3. **Sort function** (projects.js:762-779):
   ```javascript
   function sortProjects(column) {
       if (sortColumn === column) {
           sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
       } else {
           sortColumn = column;
           sortDirection = 'asc';
       }
       currentPage = 1;
       sortFilteredProjects();
       renderProjectsTable();
   }
   ```

4. **Sort comparator** (projects.js:722-756): Handles null, dates, booleans, strings, numbers.

5. **Sort indicators** (projects.js:782-793): Updates `sort-indicator` spans with arrows.

**Target views for sortable headers:**

| View | Table | Columns to Sort |
|------|-------|-----------------|
| Finance - Project List | `projectExpensesContainer` | Project Name, Client, Budget, Total Expense, Remaining, Status |
| Finance - Purchase Orders | `poList` | PO ID, PR ID, Supplier, Project, Amount, Date Issued, Status |
| Finance - Pending Approvals | Material PRs table, TR table | PR/TR ID, MRF ID, Project, Date, Urgency, Total Cost, Supplier |
| Clients | `clientsTableBody` | Client Code, Company Name, Contact Person |

### Anti-Patterns to Avoid

- **Don't modify aggregation queries for delivery fees.** Instead, add delivery_fee to total_amount at write time (Option A above). This keeps all 3+ aggregation sites consistent without touching them.
- **Don't add a new utility function for date formatting.** `formatTimestamp()` already handles both Firestore Timestamps and ISO strings. Use it instead of `formatDate()` where Firestore Timestamp objects may appear.
- **Don't create a shared sort module.** The sort logic is view-specific (different columns, different comparators). Inline it per view following the `projects.js` pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Firestore Timestamp to Date | Custom date parsing for timestamps | `formatTimestamp()` from utils.js | Already handles `.toDate()` and fallback |
| Sort indicators | Custom arrow icons | Unicode arrows (`\u2191`, `\u2193`, `\u21C5`) | Matches existing projects.js pattern |
| Sort comparator | Per-view custom sort | Copy `sortFilteredProjects()` pattern from projects.js | Handles null, dates, strings, numbers |

## Common Pitfalls

### Pitfall 1: Firestore Timestamp vs String in Date Formatting
**What goes wrong:** `new Date(firestoreTimestamp)` returns Invalid Date because Firestore Timestamp objects are not ISO strings.
**Why it happens:** Two PO creation paths use different date storage formats (string vs serverTimestamp).
**How to avoid:** Always use `formatTimestamp()` for fields that might contain Firestore Timestamps. Check the write path to know what format a field uses.
**Warning signs:** "Invalid Date" displayed in UI, `NaN` in date sort comparisons.

### Pitfall 2: Sort Resets Pagination
**What goes wrong:** Clicking a sort header shows page 1 data but pagination shows old page number.
**Why it happens:** Sort changes the order of data but pagination state is stale.
**How to avoid:** Always reset `currentPage = 1` when sort column/direction changes. The projects.js pattern does this correctly (line 772).
**Warning signs:** Pagination info shows wrong range after sorting.

### Pitfall 3: Delivery Fee Double-Counting
**What goes wrong:** If delivery_fee is added to total_amount AND a separate delivery_fee aggregation exists, the fee is counted twice.
**Why it happens:** Adding fee to total_amount makes it part of the existing aggregation, so a separate sum would double-count.
**How to avoid:** Choose ONE approach: either add to total_amount (recommended) or keep separate and modify all aggregation queries. Never both.
**Warning signs:** Expense totals are higher than expected after adding delivery fees.

### Pitfall 4: Guard vs Rules for Permission Errors
**What goes wrong:** Adding Firestore rules to allow procurement to list users would grant too broad access.
**Why it happens:** The users listener is only needed for the personnel edit feature, not for view-only access.
**How to avoid:** Guard the listener with `canEditTab()` check rather than broadening security rules. The guard approach maintains least-privilege.
**Warning signs:** Console errors with `FirebaseError: Missing or insufficient permissions`.

### Pitfall 5: onSnapshot Error Callback Required
**What goes wrong:** If a guarded listener is still somehow triggered, unhandled promise rejection crashes the view.
**Why it happens:** `onSnapshot` without error callback throws unhandled errors.
**How to avoid:** Always provide error callback to `onSnapshot`: `onSnapshot(query, successCb, errorCb)`.
**Warning signs:** Red errors in browser console with Firestore permission-denied.

## Code Examples

### Date Formatting Fix (Bug 1)

The `formatTimestamp` utility already exists in utils.js:49-62:
```javascript
// Source: app/utils.js lines 49-62
export function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    try {
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (error) {
        return 'N/A';
    }
}
```

Replace `formatDate(po.date_issued)` with `formatTimestamp(po.date_issued)` in finance.js.

Also fix the sort comparator in finance.js:2157:
```javascript
// Current (broken for Timestamps):
poData.sort((a, b) => new Date(b.date_issued) - new Date(a.date_issued));

// Fixed:
poData.sort((a, b) => {
    const dateA = a.date_issued?.toDate ? a.date_issued.toDate() : new Date(a.date_issued);
    const dateB = b.date_issued?.toDate ? b.date_issued.toDate() : new Date(b.date_issued);
    return dateB - dateA;
});
```

### Sortable Table Header Pattern (Bug 6)

Replicate from projects.js -- minimal example for Finance Project List:

```javascript
// State
let projectExpenseSortColumn = 'projectName';
let projectExpenseSortDirection = 'asc';

// Header HTML
`<th onclick="window.sortProjectExpenses('projectName')" style="cursor: pointer; user-select: none;">
    Project Name <span class="sort-indicator" data-col="projectName"></span>
</th>`

// Sort function
function sortProjectExpenses(column) {
    if (projectExpenseSortColumn === column) {
        projectExpenseSortDirection = projectExpenseSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        projectExpenseSortColumn = column;
        projectExpenseSortDirection = 'asc';
    }
    // Sort the data
    projectExpenses.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];
        if (aVal == null) return projectExpenseSortDirection === 'asc' ? 1 : -1;
        if (bVal == null) return projectExpenseSortDirection === 'asc' ? -1 : 1;
        if (typeof aVal === 'string') {
            return projectExpenseSortDirection === 'asc'
                ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return projectExpenseSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    renderProjectExpensesTable();
}
```

### Permission Guard Pattern (Bug 3)

```javascript
// Source: Existing pattern from projects.js render() and clients.js
async function loadActiveUsers() {
    // Only load users if the current user can edit projects
    // (personnel pill selector is an edit feature)
    const canEdit = window.canEditTab?.('projects');
    if (canEdit === false) {
        console.log('[Projects] Skipping user load (view-only mode)');
        return;
    }
    // ... existing onSnapshot code
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `date_issued: new Date().toISOString().split('T')[0]` | `date_issued: serverTimestamp()` | Phase 18 (2026-02-08) | Mixed date formats in PO collection |
| Hardcoded PO doc defaults | Dynamic fields saved to Firestore | Phase 18-05 (2026-02-08) | Fields may be empty in Firestore |
| All listeners fire for all roles | Should be guarded by permissions | Phase 8 (2026-02-04) | Permission-denied errors for restricted roles |
| `formatDate()` for all dates | `formatTimestamp()` for Firestore Timestamps | Always available | Needs adoption in finance PO rendering |

**Deprecated/outdated:**
- `generatePOsForPR()` (legacy, no signature) at finance.js:2055-2136 -- creates POs with string dates. Still functional but creates inconsistent date formats. Should be updated to use `serverTimestamp()` for consistency, or left as-is with the rendering fix absorbing the difference.

## Open Questions

1. **Legacy PO date_issued data migration**
   - What we know: Old POs have string dates, new POs have Firestore Timestamps. The fix in `formatTimestamp()` handles both.
   - What's unclear: Whether the legacy `generatePOsForPR()` function (no signature) is still actively used, or if all approvals now go through `generatePOsForPRWithSignature()`.
   - Recommendation: Fix the rendering to handle both formats. Optionally update the legacy path to also use `serverTimestamp()` for consistency.

2. **Delivery fee: add to total_amount or keep separate?**
   - What we know: Currently stored as separate `delivery_fee` field, not included in `total_amount`. Expense queries only sum `total_amount`.
   - What's unclear: Whether the user wants delivery fees shown as a separate line item in expense breakdowns, or just included in totals.
   - Recommendation: Add delivery_fee to total_amount at write time (Option A) as the simplest solution. The delivery_fee field stays for display purposes.

3. **`where('active', '==', true)` in procurement.js and mrf-form.js**
   - What we know: procurement.js:584 and mrf-form.js:268 query `where('active', '==', true)` but the projects collection field is `status` ('active'/'inactive'), not `active` (boolean). However, some projects may have both fields from earlier phases.
   - What's unclear: Whether this is causing a real bug (no projects loading in MRF Processing) or if projects happen to have an `active` boolean field from legacy data.
   - Recommendation: Investigate at implementation time. If projects are loading fine, this is not blocking. If not, fix to `where('status', '==', 'active')`.

## Sources

### Primary (HIGH confidence)
- Direct source code analysis of all affected files
  - `app/views/finance.js` (2230 lines) -- PO rendering, document generation, expense aggregation
  - `app/views/procurement.js` (5000+ lines) -- updatePOStatus, PO details modal, document generation
  - `app/views/projects.js` (1050+ lines) -- sortable table reference implementation, users listener
  - `app/views/clients.js` (447 lines) -- table structure for sorting
  - `app/utils.js` (577 lines) -- formatDate, formatTimestamp, syncPersonnelToAssignments
  - `app/auth.js` -- user document listener
  - `app/permissions.js` -- permission checking utilities
  - `firestore.rules` (287 lines) -- security rules for all collections
  - `app/seed-roles.js` -- role template definitions with tab permissions

### Secondary (MEDIUM confidence)
- Phase 18 plan summaries (decisions about serverTimestamp, document fields, signature capture)
- Phase 17 plan summaries (dual timestamp strategy decisions)
- Phase 21 UAT results (permission error context from operations_user testing)
- Debug file: `.planning/debug/personnel-removal-sync.md`

## Metadata

**Confidence breakdown:**
- Bug 1 (PO date rendering): HIGH - Root cause confirmed by tracing two write paths and one read path
- Bug 2 (blank document details): HIGH - Fallback values visible in source code at exact line numbers
- Bug 3 (Firestore permissions): HIGH - Security rules + role templates + listener location all confirmed
- Bug 4 (delivery fee in expenses): HIGH - Aggregation queries and write paths fully traced
- Bug 5 (sortable tables): HIGH - Working reference implementation in projects.js confirmed
- Bug 6 (status persistence): HIGH - `updatePOStatus()` code path verified as correct; issue is limited to expense aggregation

**Research date:** 2026-02-10
**Valid until:** Indefinite (codebase-specific bugs, not library-dependent)
