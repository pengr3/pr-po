# Phase 33: Service Expense Breakdown - Research

**Researched:** 2026-02-19
**Domain:** Firestore aggregation queries, service-detail.js, expense breakdown UI pattern
**Confidence:** HIGH

## Summary

Phase 33 replaces the static stub message "Expense tracking requires MRF-Service integration (coming in Phase 29)" in `service-detail.js` (line 358) with a real aggregation query. The stub was intentionally left in Phase 28 because Phase 29 had not yet linked MRFs to services. Phase 29 (completed 2026-02-18) added `service_code`, `service_name`, and `department` fields to MRFs, PRs, TRs, and POs via the full chain: `mrf-form.js → procurement.js → finance.js`. The data now exists in Firestore — it just has never been queried from service-detail.js.

The reference implementation for this phase is `project-detail.js`'s `refreshExpense()` function. It uses `getAggregateFromServer()` with `sum()` and `count()` from the Firestore SDK (already exported from `app/firebase.js`) to aggregate POs and TRs filtered by `project_name`. Phase 33 mirrors this exact pattern but queries by `service_code` instead of `project_name`. The expense breakdown card is already positioned in the correct location in the HTML (rendered inside the "Financial Summary" card, `grid-column: 1 / -1`). Only the content of that div needs to be replaced.

The scope is deliberately narrow: one function to fetch data (`refreshServiceExpense()`), one inline card replace for the expense breakdown display, and one module-level variable to hold the cached result (`currentServiceExpense`). No new modal, no deep category breakdown — the projects pattern shows a total amount plus count of linked documents, and a "Refresh" button and optionally a "View Breakdown" link. The success criteria state the card shows total MRF value, PR value, and PO value. This means three separate aggregations (or one `getDocs` pass), not just a PO+TR total. This is a deliberate difference from the projects pattern and must be planned for explicitly.

**Primary recommendation:** Mirror `project-detail.js` refreshExpense() using `getAggregateFromServer` + `sum('total_amount')` per collection, queried by `where('service_code', '==', currentService.service_code)`. Display three scorecards (MRF count, PR total, PO total) inline in the existing card slot. Add a Refresh button with the same pattern. No separate modal needed for this phase.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SERV-11 | Service detail page includes expense breakdown (MRFs/PRs/POs linked to service) | Firestore data exists post-Phase 29; query by `service_code` on mrfs/prs/pos collections; `getAggregateFromServer` + `sum` already exported from firebase.js; mirror `refreshExpense()` in project-detail.js |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore SDK | 10.7.1 (CDN) | Aggregation queries against mrfs, prs, pos | Already in use; `getAggregateFromServer`, `sum`, `count` already exported from `app/firebase.js` |
| Vanilla JS ES6 modules | — | DOM update, module state | Zero-build constraint; all views use this |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `formatCurrency` | utils.js | Display monetary values | Already imported in service-detail.js |
| `showLoading`, `showToast` | utils.js | Loading feedback, error toasts | Already imported in service-detail.js |

### No New Dependencies
This phase adds zero new libraries or imports beyond what `service-detail.js` already imports plus `getAggregateFromServer`, `sum`, and `count` from firebase.js (already exported, just not currently imported by service-detail.js).

**Import addition required in service-detail.js:**
```javascript
// Current import from firebase.js:
import { db, collection, doc, getDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs } from '../firebase.js';

// Add to that import:
import { db, collection, doc, getDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, getAggregateFromServer, sum, count } from '../firebase.js';
```

## Architecture Patterns

### Recommended Change Structure
```
app/views/
└── service-detail.js    # ONLY FILE modified
    ├── Add import: getAggregateFromServer, sum, count
    ├── Add module variable: currentServiceExpense
    ├── Add function: refreshServiceExpense(silent = false)
    ├── Modify: renderServiceDetail() — replace stub div with expense scorecards
    ├── Modify: attachWindowFunctions() — add window.refreshServiceExpense
    └── Modify: destroy() — delete window.refreshServiceExpense
```

No new files. No changes to firebase.js, expense-modal.js, or any other view.

### Pattern 1: Expense Aggregation with getAggregateFromServer
**What:** One async function that runs three parallel aggregations (mrfs, prs, pos) filtered by service_code.
**When to use:** Called on init (silent) and on Refresh button click (with toast).
**Source:** Directly mirrors `refreshExpense()` in `app/views/project-detail.js` lines 644-690.

```javascript
// Source: adapted from project-detail.js refreshExpense()
let currentServiceExpense = { mrfCount: 0, prTotal: 0, prCount: 0, poTotal: 0, poCount: 0 };

async function refreshServiceExpense(silent = false) {
    if (!currentService) return;

    showLoading(true);
    try {
        const serviceCode = currentService.service_code;

        // MRF aggregation — count MRFs linked to this service
        const mrfsQuery = query(
            collection(db, 'mrfs'),
            where('service_code', '==', serviceCode)
        );
        const mrfsAggregate = await getAggregateFromServer(mrfsQuery, {
            mrfCount: count()
        });

        // PR aggregation — sum total_amount for PRs linked to this service
        const prsQuery = query(
            collection(db, 'prs'),
            where('service_code', '==', serviceCode)
        );
        const prsAggregate = await getAggregateFromServer(prsQuery, {
            prTotal: sum('total_amount'),
            prCount: count()
        });

        // PO aggregation — sum total_amount for POs linked to this service
        const posQuery = query(
            collection(db, 'pos'),
            where('service_code', '==', serviceCode)
        );
        const posAggregate = await getAggregateFromServer(posQuery, {
            poTotal: sum('total_amount'),
            poCount: count()
        });

        currentServiceExpense = {
            mrfCount: mrfsAggregate.data().mrfCount || 0,
            prTotal: prsAggregate.data().prTotal || 0,
            prCount: prsAggregate.data().prCount || 0,
            poTotal: posAggregate.data().poTotal || 0,
            poCount: posAggregate.data().poCount || 0
        };

        renderServiceDetail(); // Re-render to show updated data
        if (!silent) showToast('Expense refreshed', 'success');
    } catch (error) {
        console.error('[ServiceDetail] Expense calculation failed:', error);
        if (!silent) showToast('Failed to calculate expense', 'error');
    } finally {
        showLoading(false);
    }
}
```

### Pattern 2: Expense Breakdown Card HTML
**What:** Replace the static stub div with three scorecards showing MRF count, PR total, PO total.
**Where:** Inside `renderServiceDetail()`, the `grid-column: 1 / -1` div that currently shows the stub.

```javascript
// CURRENT (service-detail.js line 355-361):
<div class="form-group" style="margin-bottom: 0; grid-column: 1 / -1;">
    <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Expense Breakdown</label>
    <div style="padding: 0.75rem 1rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem; color: #64748b; font-size: 0.875rem; font-style: italic;">
        Expense tracking requires MRF-Service integration (coming in Phase 29)
    </div>
</div>

// REPLACEMENT — mirrors project-detail.js Financial Summary card layout:
<div class="form-group" style="margin-bottom: 0; grid-column: 1 / -1;">
    <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">
        Expense Breakdown
        <button class="btn btn-sm btn-secondary" onclick="window.refreshServiceExpense()"
                style="margin-left: 0.75rem; padding: 0.25rem 0.5rem; font-size: 0.75rem;">
            Refresh
        </button>
    </label>
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
        <div style="padding: 0.75rem 1rem; border-radius: 0.5rem; border: 1px solid #e2e8f0; text-align: center;">
            <div style="font-size: 0.75rem; color: #64748b; font-weight: 600; margin-bottom: 0.25rem;">MRFs Linked</div>
            <div style="font-size: 1.25rem; font-weight: 700; color: #1e293b;">${currentServiceExpense.mrfCount}</div>
        </div>
        <div style="padding: 0.75rem 1rem; border-radius: 0.5rem; border: 1px solid #e2e8f0; text-align: center;">
            <div style="font-size: 0.75rem; color: #64748b; font-weight: 600; margin-bottom: 0.25rem;">PR Value</div>
            <div style="font-size: 1.25rem; font-weight: 700; color: #1e293b;">
                ${currentServiceExpense.prTotal > 0 ? 'PHP ' + formatCurrency(currentServiceExpense.prTotal) : '—'}
            </div>
            <div style="font-size: 0.7rem; color: #94a3b8;">${currentServiceExpense.prCount} PR${currentServiceExpense.prCount !== 1 ? 's' : ''}</div>
        </div>
        <div style="padding: 0.75rem 1rem; border-radius: 0.5rem; border: 1px solid #e2e8f0; text-align: center;">
            <div style="font-size: 0.75rem; color: #64748b; font-weight: 600; margin-bottom: 0.25rem;">PO Value</div>
            <div style="font-size: 1.25rem; font-weight: 700; color: #1e293b;">
                ${currentServiceExpense.poTotal > 0 ? 'PHP ' + formatCurrency(currentServiceExpense.poTotal) : '—'}
            </div>
            <div style="font-size: 0.7rem; color: #94a3b8;">${currentServiceExpense.poCount} PO${currentServiceExpense.poCount !== 1 ? 's' : ''}</div>
        </div>
    </div>
</div>
```

### Pattern 3: Initialization — Call refreshServiceExpense() After Service Loads
**What:** Call `refreshServiceExpense(true)` (silent) after the service document loads, inside the `onSnapshot` callback, before calling `renderServiceDetail()`.
**Source:** Exactly mirrors `project-detail.js` line 142: `await refreshExpense(true);`

```javascript
// In init() onSnapshot callback — after currentService is set:
listener = onSnapshot(q, async (snapshot) => {  // Note: async callback
    // ...existing code to set currentService...

    // Calculate initial expense (silent — no toast on page load)
    await refreshServiceExpense(true);

    if (checkServiceAccess()) {
        renderServiceDetail();
    }
});
```

Note: The existing `onSnapshot` callback in service-detail.js is NOT async. Changing it to `async` is required for the `await refreshServiceExpense(true)` call. This is the same approach used in project-detail.js.

### Pattern 4: Module State Variable
**What:** Module-level variable to hold current expense totals between renders.
**Where:** At top of service-detail.js alongside other module-level variables.

```javascript
// Add alongside existing module variables:
let currentServiceExpense = { mrfCount: 0, prTotal: 0, prCount: 0, poTotal: 0, poCount: 0 };
```

This variable must be reset in `destroy()`:
```javascript
// In destroy():
currentServiceExpense = { mrfCount: 0, prTotal: 0, prCount: 0, poTotal: 0, poCount: 0 };
```

### Pattern 5: attachWindowFunctions() and destroy() Updates

```javascript
// In attachWindowFunctions():
window.refreshServiceExpense = refreshServiceExpense;

// In destroy() — add to existing deletes:
delete window.refreshServiceExpense;
```

### Anti-Patterns to Avoid

- **Querying by service_name instead of service_code:** service_code is the stable primary key. service_name can be edited. Always filter by `where('service_code', '==', serviceCode)`.
- **Using onSnapshot for expense data:** The project-detail.js pattern correctly uses `getAggregateFromServer` (one-time fetch) for expense data, not `onSnapshot`. Aggregations with `onSnapshot` are not supported by Firestore SDK — it will throw an error.
- **Making the onSnapshot callback async without await guard:** Calling `await refreshServiceExpense()` inside an `onSnapshot` callback is fine — Firebase does not care about callback return value. However, ensure `renderServiceDetail()` is only called after `await refreshServiceExpense(true)` completes, not concurrently.
- **Running aggregations before `currentService.service_code` is set:** Always guard: `if (!currentService) return;` at the top of `refreshServiceExpense()`.
- **Re-running aggregation on every re-render:** `renderServiceDetail()` is called frequently (field edits, permission changes). The aggregation must be cached in `currentServiceExpense` and only refreshed when explicitly triggered (init load or Refresh button click). Never call `refreshServiceExpense()` from inside `renderServiceDetail()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Summing PO amounts | Client-side reduce over getDocs snapshot | `getAggregateFromServer` + `sum()` | Server-side aggregation avoids downloading all documents; scales to large datasets |
| Currency display | Custom number formatting | `formatCurrency()` from utils.js | Already imported; consistent formatting across app |
| Loading state | Custom spinner | `showLoading(true/false)` from utils.js | Already imported; matches app-wide loading pattern |
| Error notification | Alert div | `showToast()` from utils.js | Already imported; matches app-wide error pattern |

**Key insight:** The entire aggregation infrastructure (getAggregateFromServer, sum, count) is already in firebase.js exports. Do not re-implement summation client-side with getDocs + reduce.

## Common Pitfalls

### Pitfall 1: Missing `service_code` on Pre-Phase-29 Documents
**What goes wrong:** Aggregation queries by `service_code` return zero results even when the service exists.
**Why it happens:** MRFs submitted before Phase 29 (2026-02-18) do not have `service_code` field. However, for existing test/practice data this may return 0 results correctly — the v2.3 audit noted "No data migration needed (existing data is sample/practice data)".
**How to avoid:** Expected behavior. Display `—` (em dash) when values are zero. The UI pattern handles this: `currentServiceExpense.prTotal > 0 ? 'PHP ' + formatCurrency(...) : '—'`.
**Warning signs:** Always shows 0 even for services that definitely have linked MRFs — this is a data freshness issue, not a code issue.

### Pitfall 2: Non-Async onSnapshot Callback
**What goes wrong:** `SyntaxError` or silent failure when trying to `await refreshServiceExpense(true)` inside a non-async callback.
**Why it happens:** The current `onSnapshot` callback in service-detail.js is a sync arrow function `(snapshot) => { ... }`. Adding `await` requires changing it to `async (snapshot) => { ... }`.
**How to avoid:** Change `listener = onSnapshot(q, (snapshot) => {` to `listener = onSnapshot(q, async (snapshot) => {`.
**Warning signs:** TypeScript/lint error (not applicable — no build) or expense always shows 0 with no error (silent await failure in sync context — actually `await` in non-async context is a syntax error in strict mode JS modules).

### Pitfall 3: Calling refreshServiceExpense from renderServiceDetail
**What goes wrong:** Infinite async loop — renderServiceDetail calls refreshServiceExpense which awaits, then calls renderServiceDetail again.
**Why it happens:** Tempting to always refresh before render to ensure fresh data.
**How to avoid:** `renderServiceDetail()` reads from `currentServiceExpense` (module variable). `refreshServiceExpense()` updates `currentServiceExpense` then calls `renderServiceDetail()`. Never reverse this direction.

### Pitfall 4: Forgetting to Reset currentServiceExpense in destroy()
**What goes wrong:** Stale expense data from a previous service appears briefly when navigating to a different service detail page.
**Why it happens:** Module-level variable persists across navigations; `destroy()` is called between views but currentServiceExpense is not reset.
**How to avoid:** Add `currentServiceExpense = { mrfCount: 0, prTotal: 0, prCount: 0, poTotal: 0, poCount: 0 };` to `destroy()`.

### Pitfall 5: window.refreshServiceExpense Naming Conflict
**What goes wrong:** Collision with `window.refreshExpense` (project-detail.js) causes one to overwrite the other.
**Why it happens:** Both views could be loaded, or a navigation timing issue could leave stale window functions.
**How to avoid:** Use the distinct name `refreshServiceExpense` (not `refreshExpense`). The existing destroy() pattern deletes window functions on cleanup, preventing collision.

## Code Examples

Verified patterns from official sources (project-detail.js codebase):

### Existing getAggregateFromServer Usage (project-detail.js lines 649-678)
```javascript
// Source: C:/Users/Admin/Roaming/pr-po/app/views/project-detail.js lines 649-678
// Direct reference pattern for Phase 33

// Aggregate POs for this project
const posQuery = query(
    collection(db, 'pos'),
    where('project_name', '==', currentProject.project_name)
);

const posAggregate = await getAggregateFromServer(posQuery, {
    totalAmount: sum('total_amount'),
    poCount: count()
});

// Aggregate TRs for this project
const trsQuery = query(
    collection(db, 'transport_requests'),
    where('project_name', '==', currentProject.project_name)
);

const trsAggregate = await getAggregateFromServer(trsQuery, {
    totalAmount: sum('total_amount'),
    trCount: count()
});

const poTotal = posAggregate.data().totalAmount || 0;
const trTotal = trsAggregate.data().totalAmount || 0;
```

Phase 33 adapts this to query by `service_code` on mrfs, prs, and pos collections.

### Existing firebase.js Exports Confirming getAggregateFromServer Availability
```javascript
// Source: C:/Users/Admin/Roaming/pr-po/app/firebase.js lines 26-29
// Already exported — no firebase.js changes needed
getAggregateFromServer,
sum,
count,
average,
```

### Confirmed: service_code Field on MRFs/PRs/POs (Phase 29 verification)
```javascript
// Source: Phase 29 VERIFICATION.md truth #7 + #10 (verified 2026-02-18)
// MRF addDoc (mrf-form.js handleFormSubmit()):
{
    department: 'services',        // or 'projects'
    service_code: 'CLMC_...',     // populated for services MRFs
    service_name: '...'           // denormalized
}

// PR addDoc (procurement.js generatePR() — 4 PR/TR creation paths):
{
    service_code: mrfData.service_code || '',
    service_name: mrfData.service_name || '',
    department: mrfData.department || ''
}

// PO addDoc (finance.js approvePR()):
{
    service_code: pr.service_code || '',   // line 1684
}
```

### Confirmed: Firestore Rules Allow mrfs/prs/pos Reads for Services Roles
```
// Source: C:/Users/Admin/Roaming/pr-po/firestore.rules
// mrfs: allow get: if isActiveUser()  → all roles can get individual MRFs
// prs:  allow get: if isActiveUser()  → all roles can get individual PRs
// pos:  allow get: if isActiveUser()  → all roles can get individual POs
// getAggregateFromServer uses the list permission path — confirmed:
// mrfs list: hasRole(['super_admin', 'operations_admin', 'services_admin', ...]) — services_admin passes
// prs list:  hasRole(['super_admin', 'operations_admin', 'services_admin', ...]) — services_admin passes
// pos list:  hasRole(['super_admin', 'operations_admin', 'services_admin', ...]) — services_admin passes
```

Note: services_user is NOT in the list rules for prs and pos. This means the expense breakdown will only show data to services_admin and above — services_user may see 0 or get a permission error. This is acceptable for Phase 33 scope (service-detail.js is already restricted to services roles).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stub message "Expense tracking requires MRF-Service integration" | Real aggregation query by service_code | Phase 33 | SERV-11 gap closed |
| No data (Phase 28 stub) | service_code/department stored on MRFs/PRs/POs | Phase 29 (2026-02-18) | Data now exists to query |
| project-detail.js queries by project_name | service-detail.js queries by service_code | Phase 33 | More stable key (service_code doesn't change; project_name could) |

**Deprecated pattern being replaced:**
- Static stub div at service-detail.js lines 355-361: "Expense tracking requires MRF-Service integration (coming in Phase 29)"

## Open Questions

1. **services_user expense visibility**
   - What we know: Firestore list rules for `prs` and `pos` do NOT include `services_user`. Only `services_admin` and above can list these collections.
   - What's unclear: Should services_user see the expense breakdown at all, or should it be hidden/disabled for that role?
   - Recommendation: For Phase 33, show the expense breakdown card to all users but run the aggregation regardless. If a services_user triggers a permission error on prs/pos aggregation, catch it gracefully and show "—" values. This is a display issue, not a data integrity issue. The planner should decide: either gate the refresh button by role, or show "N/A" for services_user's expense row. The simplest approach is to not special-case it — if aggregation fails (permission denied), catch the error and show "—".

2. **TRs (transport_requests) inclusion**
   - What we know: The success criteria list "MRF value, PR value, and PO value" — no mention of TRs. The project-detail.js expense query includes TRs.
   - What's unclear: Should TRs linked by service_code also be aggregated?
   - Recommendation: Follow the success criteria literally — aggregate mrfs (count), prs (sum), pos (sum). Omit TRs for Phase 33. TRs can be added later as a separate enhancement. Note: the transport_requests Firestore rules DO include services_user with `isAssignedToService()` scope, so TRs would be accessible if included.

## Sources

### Primary (HIGH confidence)
- `C:/Users/Admin/Roaming/pr-po/app/views/service-detail.js` — full file read; confirmed stub location (line 355-361), confirmed existing imports, confirmed module variable pattern, confirmed destroy() pattern
- `C:/Users/Admin/Roaming/pr-po/app/views/project-detail.js` — full file read; confirmed refreshExpense() pattern (lines 644-690), confirmed async onSnapshot callback, confirmed currentExpense module variable, confirmed window function attachment/deletion pattern
- `C:/Users/Admin/Roaming/pr-po/app/firebase.js` — full file read; confirmed `getAggregateFromServer`, `sum`, `count` are exported (lines 26-29, 80-82)
- `C:/Users/Admin/Roaming/pr-po/app/expense-modal.js` — full file read; confirmed modal pattern uses getDocs (not aggregation), uses project_name as filter — NOT the pattern for Phase 33 (service-detail doesn't need a modal, just inline scorecards)
- `C:/Users/Admin/Roaming/pr-po/firestore.rules` — full file read; confirmed services_admin has list access on mrfs/prs/pos; confirmed services_user gap for prs/pos list
- `C:/Users/Admin/Roaming/pr-po/.planning/phases/29-mrf-integration/29-VERIFICATION.md` — confirmed service_code is stored on MRFs, PRs, TRs, POs (truths #7, #10 — score 11/11)
- `C:/Users/Admin/Roaming/pr-po/.planning/v2.3-MILESTONE-AUDIT.md` — confirmed SERV-11 gap evidence: "service-detail.js line 358 renders static stub... No aggregation query for MRFs/PRs/POs linked to service exists in service-detail.js"
- Phase 29 SUMMARY files (29-01, 29-02, 29-03) — confirmed exact field names written to Firestore: `service_code`, `service_name`, `department`

### Secondary (MEDIUM confidence)
- Phase 28 RESEARCH.md — original design decision to stub SERV-11 (confirmed intentional deferral to Phase 29)
- Phase 32 SUMMARY — confirmed Phase 32 completed (services_admin rules fixed); Phase 33 unblocked

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs confirmed present in codebase; no new dependencies
- Architecture: HIGH — direct mirror of verified project-detail.js pattern; only query field changes
- Data availability: HIGH — Phase 29 VERIFICATION confirmed service_code fields on MRFs/PRs/POs (2026-02-18)
- Firestore rules: HIGH — rules file read; services_admin has list access on all three collections
- Pitfalls: HIGH — all pitfalls derived from direct code inspection of service-detail.js and project-detail.js

**Research date:** 2026-02-19
**Valid until:** 2026-03-21 (30 days — codebase stable, all dependencies in-project)
