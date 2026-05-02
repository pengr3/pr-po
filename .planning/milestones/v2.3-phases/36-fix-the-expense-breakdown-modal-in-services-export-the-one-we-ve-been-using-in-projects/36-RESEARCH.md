# Phase 36: Fix the Expense Breakdown Modal in Services — Research

**Researched:** 2026-02-23
**Domain:** Internal refactor — ES6 module consolidation, DOM modal rendering
**Confidence:** HIGH (all findings verified directly from codebase)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **What's broken:** The services modal has wrong scorecards (MRF count, PR total, PO total instead of Material/Transport/Subcon) and wrong tabs (Purchase Requests / Purchase Orders instead of By Category / Transport Fees). Fix: services modal should query POs by `service_code` and apply the exact same item-level category breakdown logic as the projects modal.
- **Code unification:** Unify into one function — `showExpenseBreakdownModal` — that accepts a mode parameter (`'project'` or `'service'`). Delete `showServiceExpenseBreakdownModal` — do not keep as wrapper. Update ALL call sites: both `service-detail.js` and `project-detail.js` call the new unified function directly. Clean up old window function registrations in expense-modal.js accordingly.
- **Budget field:** Use the `budget` field for services (same field name as projects). Label it `Budget` (not "Service Budget" or "Project Budget").

### Claude's Discretion

- Exact function signature for the unified function.
- How to thread mode through the internal helpers (query builder, scorecard builder, etc.).
- Window function naming for modal interaction (`_closeExpenseBreakdownModal`, `_toggleExpenseCategory`, etc.) — reuse existing names where possible.

### Deferred Ideas (OUT OF SCOPE)

None.
</user_constraints>

---

## Summary

Phase 36 is a pure code refactor with a visual fix — no new Firebase schema changes, no new routes, no new UI patterns. The current `app/expense-modal.js` exports two separate functions: `showExpenseBreakdownModal` (projects) and `showServiceExpenseBreakdownModal` (services). The services function implements a structurally different modal (wrong scorecards, wrong tabs). The fix unifies both into a single `showExpenseBreakdownModal` that accepts an options object carrying `mode`, identifier, display name, and budget.

The project version's logic — querying `pos` by `project_name`, parsing `items_json`, computing Material/Transport/Subcon scorecards, and rendering By Category / Transport Fees tabs — needs to be applied verbatim to the services path, with only the Firestore query filter changed from `where('project_name', '==', name)` to `where('service_code', '==', code)`. The services path also needs the `transport_requests` query, which the current services modal omits entirely.

There are exactly three call sites: `project-detail.js`, `service-detail.js`, and `finance.js`. The finance.js call is projects-only and stays on the existing `'project'` mode. All three must be updated to the new unified signature.

**Primary recommendation:** Collapse both functions into one `showExpenseBreakdownModal(identifier, options)` where `options = { mode, displayName, budget }`. Keep all existing project window function names (`_closeExpenseBreakdownModal`, `_switchExpenseBreakdownTab`, `_toggleExpenseCategory`). Delete the four service-specific window functions and the `_closeServiceExpenseBreakdownModal`, `_switchSvcExpBreakdownTab` registrations at the bottom of expense-modal.js.

---

## Architecture Patterns

### Existing Structure (what exists now)

**`app/expense-modal.js` — 553 lines**

Two exported async functions, four module-level window registrations:

```
showExpenseBreakdownModal(projectName)          // lines 14–294  — projects only
  └─ queries: pos by project_name
              transport_requests by project_name
              projects by project_name (for budget)
  └─ window._closeExpenseBreakdownModal
  └─ window._switchExpenseBreakdownTab
  └─ window._toggleExpenseCategory

showServiceExpenseBreakdownModal(serviceCode, serviceName, budget)  // lines 345–524 — WRONG impl
  └─ queries: mrfs by service_code (for count)
              prs by service_code (for PR total)
              pos by service_code (for PO total)
  └─ window._closeServiceExpenseBreakdownModal  // separate close fn
  └─ window._switchSvcExpBreakdownTab           // separate tab switch fn
  // reuses window._toggleExpenseCategory
```

**Call sites:**

| File | Import | Usage |
|------|--------|-------|
| `app/views/project-detail.js` line 8 | `import { showExpenseBreakdownModal }` | `window.showExpenseModal = () => showExpenseBreakdownModal(currentProject.project_name)` |
| `app/views/service-detail.js` line 10 | `import { showServiceExpenseBreakdownModal }` | `window.showServiceExpenseModal = () => showServiceExpenseBreakdownModal(currentService.service_code, currentService.service_name, currentService.budget)` |
| `app/views/finance.js` line 8 | `import { showExpenseBreakdownModal }` | `window.showProjectExpenseModal = (name) => showExpenseBreakdownModal(name)` |

### Target Structure (after this phase)

**`app/expense-modal.js` — one exported function**

```javascript
// Unified signature — Claude's discretion on exact form
export async function showExpenseBreakdownModal(identifier, { mode = 'project', displayName, budget } = {})
```

Internal branching:
- `mode === 'project'`: query `pos` by `project_name`, query `transport_requests` by `project_name`, fetch budget from `projects` collection if not passed
- `mode === 'service'`: query `pos` by `service_code`, query `transport_requests` by `service_code`

Both modes use the same item-level category breakdown pipeline, same scorecard layout (Material Purchases / Transport Fees / Subcon Cost), same tab structure (By Category / Transport Fees).

Window functions kept: `_closeExpenseBreakdownModal`, `_switchExpenseBreakdownTab`, `_toggleExpenseCategory`.
Window functions deleted: `_closeServiceExpenseBreakdownModal`, `_switchSvcExpBreakdownTab`.

**Updated call sites:**

```javascript
// project-detail.js
window.showExpenseModal = () =>
    currentProject && showExpenseBreakdownModal(currentProject.project_name, { mode: 'project' });

// service-detail.js
window.showServiceExpenseModal = () =>
    currentService && showExpenseBreakdownModal(currentService.service_code, {
        mode: 'service',
        displayName: currentService.service_name,
        budget: currentService.budget
    });

// finance.js
window.showProjectExpenseModal = (name) => showExpenseBreakdownModal(name, { mode: 'project' });
```

Import line in `service-detail.js` must change:
```javascript
// Before
import { showServiceExpenseBreakdownModal } from '../expense-modal.js';

// After
import { showExpenseBreakdownModal } from '../expense-modal.js';
```

---

## Exact Delta — What Changes Where

### `app/expense-modal.js`

1. **Remove** the entire `showServiceExpenseBreakdownModal` export (lines 345–524).
2. **Remove** `window._closeServiceExpenseBreakdownModal` registration (lines 526–529).
3. **Remove** `window._switchSvcExpBreakdownTab` registration (lines 531–551).
4. **Modify** `showExpenseBreakdownModal` signature to accept `(identifier, options)`.
5. **Add** mode branching in the query section — project path uses `project_name`, service path uses `service_code`. Both paths then run the same category-breakdown pipeline.
6. **Add** service-mode budget handling: `budget` is passed in via `options.budget` (no secondary Firestore fetch needed for services, unlike projects which fetch from the `projects` collection).
7. **Update** modal header to use `displayName` (falls back to `identifier` if omitted).
8. **Update** budget label: change "Project Budget" hardcoded string to `"Budget"` (generic).

### `app/views/service-detail.js`

1. **Change** import on line 10: `showServiceExpenseBreakdownModal` → `showExpenseBreakdownModal`.
2. **Change** `attachWindowFunctions()` on line 860–861: update the `window.showServiceExpenseModal` arrow to call `showExpenseBreakdownModal` with the new signature.

### `app/views/project-detail.js`

1. **Change** `attachWindowFunctions()` on line 781: update `window.showExpenseModal` arrow to pass `{ mode: 'project' }` as second argument. (The import on line 8 stays the same — still imports `showExpenseBreakdownModal`.)

### `app/views/finance.js`

1. **Change** line 129: update `window.showProjectExpenseModal` arrow to pass `{ mode: 'project' }`. (The import on line 8 stays the same.)

---

## Logic Walkthrough — Service Path vs. Project Path

The project modal's breakdown pipeline (the correct one to replicate):

```
For each PO:
  is_subcon === true  → subconTotal += total_amount - delivery_fee
  is_subcon === false → materialCount++
                        parse items_json
                        per item:
                          category includes 'transportation'/'hauling'
                            → transportCategoryItems[]
                          else
                            → categoryTotals[category]
                          materialTotal += subtotal (only if !isSubcon)

  delivery_fee > 0    → deliveryFeeTotal += fee, deliveryFeeItems[]

For TRs (finance_status === 'Approved'):
  trTotal += total_amount, transportRequests[]

transportCategoryTotal = sum(transportCategoryItems.subtotal)
materialsDisplay      = materialTotal - transportCategoryTotal
transportDisplay      = trTotal + transportCategoryTotal + deliveryFeeTotal
totalCost             = materialsDisplay + transportDisplay + subconTotal
```

For services, the only difference is the Firestore query filter:
- Project: `where('project_name', '==', projectName)` for both `pos` and `transport_requests`
- Service: `where('service_code', '==', serviceCode)` for both `pos` and `transport_requests`

The pipeline, scorecard math, HTML template structure, and tab mechanism are **identical**.

### Budget sourcing difference

- **Project mode:** Budget is fetched from the `projects` collection via `where('project_name', '==', projectName)` (because `project-detail.js` calls with only the `project_name` string, not the budget value). This secondary fetch can remain for project mode, or optionally be removed if the caller passes budget — left to Claude's discretion.
- **Service mode:** Budget is passed in via `options.budget` directly (the caller in `service-detail.js` has `currentService.budget` available). No secondary Firestore fetch needed.

---

## Common Pitfalls

### Pitfall 1: Forgetting the transport_requests query for services
**What goes wrong:** The current services modal doesn't query `transport_requests` at all. If the unified function's service branch omits this, the Transport Fees tab will always be empty even if TRs exist for that service.
**How to avoid:** The service path must include `getDocs(query(collection(db, 'transport_requests'), where('service_code', '==', serviceCode)))` — same as the project path uses `where('project_name', '==', ...)`.

### Pitfall 2: Modal ID collision
**What goes wrong:** The project modal uses `id="expenseBreakdownModal"`. The service modal uses `id="serviceExpenseBreakdownModal"`. After unification, both use a single modal. The cleanup line `document.getElementById('expenseBreakdownModal')` at the top of the function must remove whichever modal is already on the page. Since the service modal had a different ID, a stale service modal would not be cleaned up if the project-path cleanup fires.
**How to avoid:** In the unified function, at the top, remove any existing modal — check for both IDs or standardize to one ID (`expenseBreakdownModal`) and remove only that. Since `showServiceExpenseBreakdownModal` is deleted, the `serviceExpenseBreakdownModal` ID disappears; just make sure the unified function always creates `id="expenseBreakdownModal"`.

### Pitfall 3: Window function naming collision if both modals were open simultaneously
**What goes wrong:** The old service modal had separate window function names (`_switchSvcExpBreakdownTab`) to avoid colliding with the project modal's `_switchExpenseBreakdownTab`. After unification, there is only one modal at a time, so reusing `_switchExpenseBreakdownTab` is safe — but the tab IDs inside the modal still need to resolve correctly.
**How to avoid:** The unified modal uses the same tab element IDs (`expBreakdownCategoryTab`, `expBreakdownTransportTab`) and the same button class (`expense-tab`) as the project modal. `_switchExpenseBreakdownTab` then works without modification. No name collision is possible since only one modal exists at a time.

### Pitfall 4: "Budget" label text in the modal
**What goes wrong:** The current project modal hardcodes "Project Budget" as the label. The decision says to use "Budget" (generic).
**How to avoid:** Change the single hardcoded label string in the budget row HTML from "Project Budget" to "Budget" when writing the unified modal template.

### Pitfall 5: Import name mismatch after refactor
**What goes wrong:** `service-detail.js` imports `{ showServiceExpenseBreakdownModal }` by name. After deletion of that export, this import will silently produce `undefined` (ES modules do not throw at runtime for missing named exports in all bundler setups, but this is a zero-build static app — the browser WILL throw a SyntaxError on the destructuring if the export is absent).
**How to avoid:** Update `service-detail.js` line 10 as part of the same change that modifies the export.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Modal toggle/open/close | Custom event system | The existing `window._closeExpenseBreakdownModal` + `modal.remove()` pattern already works |
| Item parsing normalization | New parser | Reuse the exact fallback chain already in `showExpenseBreakdownModal`: `item.item \|\| item.item_name \|\| item.itemName \|\| item.name \|\| 'Unnamed Item'` |
| Category breakdown | New aggregation logic | Copy the existing pipeline from `showExpenseBreakdownModal` lines 29–86 verbatim into the unified function |

---

## Code Examples

### Recommended unified signature (Claude's discretion — one option)

```javascript
/**
 * Show unified expense breakdown modal for a project or service.
 * @param {string} identifier - project_name (mode='project') or service_code (mode='service')
 * @param {object} options
 * @param {'project'|'service'} options.mode
 * @param {string} [options.displayName] - Display name for modal header (falls back to identifier)
 * @param {number} [options.budget]      - Budget amount (service mode passes this directly)
 */
export async function showExpenseBreakdownModal(identifier, { mode = 'project', displayName, budget } = {}) {
    const existingModal = document.getElementById('expenseBreakdownModal');
    if (existingModal) existingModal.remove();

    const headerName = displayName || identifier;

    // Mode-specific queries
    let posQuery, trsQuery;
    if (mode === 'service') {
        posQuery = query(collection(db, 'pos'), where('service_code', '==', identifier));
        trsQuery = query(collection(db, 'transport_requests'), where('service_code', '==', identifier));
    } else {
        // Fetch budget from projects collection (project mode only)
        const projectSnapshot = await getDocs(
            query(collection(db, 'projects'), where('project_name', '==', identifier))
        );
        const project = projectSnapshot.docs[0]?.data() || {};
        budget = parseFloat(project.budget || 0);

        posQuery = query(collection(db, 'pos'), where('project_name', '==', identifier));
        trsQuery = query(collection(db, 'transport_requests'), where('project_name', '==', identifier));
    }

    // ... rest of pipeline is identical for both modes
}
```

### Updated call site — service-detail.js `attachWindowFunctions()`

```javascript
import { showExpenseBreakdownModal } from '../expense-modal.js';  // line 10

// Inside attachWindowFunctions():
window.showServiceExpenseModal = () => currentService &&
    showExpenseBreakdownModal(currentService.service_code, {
        mode: 'service',
        displayName: currentService.service_name,
        budget: currentService.budget
    });
```

### Updated call site — project-detail.js `attachWindowFunctions()`

```javascript
// No import change needed — already imports showExpenseBreakdownModal

// Inside attachWindowFunctions():
window.showExpenseModal = () => currentProject && showExpenseBreakdownModal(currentProject.project_name, { mode: 'project' });
```

### Updated call site — finance.js `attachWindowFunctions()`

```javascript
// No import change needed

window.showProjectExpenseModal = (name) => showExpenseBreakdownModal(name, { mode: 'project' });
```

---

## Files Changed Summary

| File | Type | Change |
|------|------|--------|
| `app/expense-modal.js` | Primary | Merge both functions; add mode parameter; delete service-specific window registrations; generalize budget label |
| `app/views/service-detail.js` | Call site | Update import name; update `window.showServiceExpenseModal` call |
| `app/views/project-detail.js` | Call site | Update `window.showExpenseModal` to pass `{ mode: 'project' }` |
| `app/views/finance.js` | Call site | Update `window.showProjectExpenseModal` to pass `{ mode: 'project' }` |

No other files reference `showExpenseBreakdownModal` or `showServiceExpenseBreakdownModal` — confirmed by grep across the entire codebase.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Two separate export functions | One unified function with mode param | Single source of truth for modal layout; services modal gets correct breakdown |
| Service modal: MRF/PR/PO scorecards | Unified: Material/Transport/Subcon scorecards | Visual parity with projects modal |
| Service modal: PR/PO list tabs | Unified: By Category / Transport Fees tabs | Functional parity — item-level breakdown instead of document-level list |
| Service modal: no TR query | Unified: TR query by service_code | Transport fees for services now correctly captured |
| "Project Budget" / "Service Budget" labels | Generic "Budget" label | Cleaner, context-independent |
| `_closeServiceExpenseBreakdownModal` + `_switchSvcExpBreakdownTab` | Reused `_closeExpenseBreakdownModal` + `_switchExpenseBreakdownTab` | Fewer global window functions |

---

## Open Questions

None — all call sites identified, all logic documented. The refactor is well-bounded.

---

## Sources

### Primary (HIGH confidence)
- `app/expense-modal.js` — direct read of both export functions and all window registrations (553 lines, fully read)
- `app/views/service-detail.js` — direct read of import, `attachWindowFunctions()`, and all call sites (867 lines, fully read)
- `app/views/project-detail.js` — direct read of import, `attachWindowFunctions()`, and all call sites (789 lines, fully read)
- `app/views/finance.js` — grep-verified lines 8, 129–130 for import and call site

### Search verification
- Grep of `expense-modal|showServiceExpenseBreakdownModal|showExpenseBreakdownModal` across all `.js` and `.html` files — confirmed exactly 3 call-site files, no others.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pure vanilla JS ES6 modules, no external deps, verified from source
- Architecture: HIGH — all four files read directly; diff is precise and line-accurate
- Pitfalls: HIGH — derived from direct code inspection of both modal implementations

**Research date:** 2026-02-23
**Valid until:** Until any of the four listed files change
