# Phase 72: Add Paid and Remaining Payable to Project/Service Financial Summary Cards with Clickable Refresh - Research

**Researched:** 2026-04-10
**Domain:** project-detail.js, service-detail.js — Financial Summary card augmentation with RFP payables data
**Confidence:** HIGH

## Summary

Phase 72 adds two new data fields — **Paid** and **Remaining Payable** — to the Financial Summary card in both Project Detail and Service Detail pages. These values are derived from the same `rfps` collection that Phase 69 introduced into the expense modal. The feature also converts the existing Refresh button into a clickable button that, when clicked, first refreshes the totals AND then opens the Financial Breakdown modal.

Currently, the Financial Summary card (Card 2) in both `project-detail.js` and `service-detail.js` shows a 2-column grid with four cells: Budget, Contract Cost, Expense (with Refresh button), and Remaining Budget. The Expense amount is clickable and opens the Financial Breakdown modal. The Refresh button only recalculates `currentExpense.total` via `getAggregateFromServer` — it does NOT query RFPs.

Phase 72 extends `refreshExpense` / `refreshServiceExpense` to also query the `rfps` collection, stores `totalPaid` and `remainingPayable` in the module-level state objects (`currentExpense` / `currentServiceExpense`), and renders Paid and Remaining Payable cells in the card grid below Expense. The Refresh button behavior changes: clicking it refreshes data AND then redirects to the Financial Breakdown modal.

**Primary recommendation:** Extend `currentExpense` / `currentServiceExpense` objects with `totalPaid` and `remainingPayable` fields; extend the refresh functions to query RFPs the same way Phase 69 does in `expense-modal.js`; extend the card HTML to render two new cells below the Expense row; change the Refresh button handler to call refresh-then-open-modal.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore v10.7.1 | CDN | Query `rfps` collection | Already imported in both files via `../firebase.js` |
| Pure ES6 JavaScript | — | State extension + DOM rendering | Zero-build SPA |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `formatCurrency` (utils.js) | — | Currency display | All monetary fields in card use it |
| `getAggregateFromServer` (firebase.js) | v10.7.1 | Existing PO/TR aggregation | Already imported; RFP query uses `getDocs` (no aggregate needed — need payment_records array) |

**Installation:** No new packages needed.

## Architecture Patterns

### Current Financial Summary Card Structure (Both Files)

Both `project-detail.js` and `service-detail.js` share the same Financial Summary card layout:

```
Card 2 — Financial Summary
  Header: "Financial Summary" | Export CSV button
  Grid (2-col, repeat(2, 1fr)):
    Cell 1: Budget input
    Cell 2: Contract Cost input
    Cell 3: Expense amount (clickable → opens Financial Breakdown modal)
             + Refresh button (🔄)
             + "Click amount to view breakdown" hint
    Cell 4: Remaining Budget (computed)
```

Phase 72 adds below this grid (or extending it to 4-col → 2-col-2-row, or appending rows):

```
  Additional cells (or new row):
    Cell 5: Paid (totalPaid from RFPs)
    Cell 6: Remaining Payable (totalRequested - totalPaid)
```

### Module-Level State Extension

**project-detail.js** — extend `currentExpense`:
```javascript
// Before (line 16):
let currentExpense = { total: 0, poCount: 0, trCount: 0 };

// After:
let currentExpense = { total: 0, poCount: 0, trCount: 0, totalPaid: 0, remainingPayable: 0, hasRfps: false };
```

**service-detail.js** — extend `currentServiceExpense`:
```javascript
// Before (line 21):
let currentServiceExpense = { mrfCount: 0, prTotal: 0, prCount: 0, poTotal: 0, poCount: 0 };

// After:
let currentServiceExpense = { mrfCount: 0, prTotal: 0, prCount: 0, poTotal: 0, poCount: 0, totalPaid: 0, remainingPayable: 0, hasRfps: false };
```

Also extend destroy() resets:
- `project-detail.js`: reset to `{ total: 0, poCount: 0, trCount: 0, totalPaid: 0, remainingPayable: 0, hasRfps: false }`
- `service-detail.js`: reset to `{ mrfCount: 0, prTotal: 0, prCount: 0, poTotal: 0, poCount: 0, totalPaid: 0, remainingPayable: 0, hasRfps: false }`

### RFP Query Strategy (Already Proven in expense-modal.js)

**project-detail.js** — project mode, query by `project_code`:
```javascript
// Source: app/expense-modal.js lines 56-67 (Phase 69 implementation)
// project_code is on currentProject directly — no second Firestore fetch needed
const projectCode = currentProject.project_code || '';
let rfpTotalRequested = 0;
let rfpTotalPaid = 0;
let hasRfps = false;
if (projectCode) {
    const rfpSnap = await getDocs(
        query(collection(db, 'rfps'), where('project_code', '==', projectCode))
    );
    hasRfps = rfpSnap.size > 0;
    rfpSnap.forEach(d => {
        const rfp = d.data();
        rfpTotalRequested += parseFloat(rfp.amount_requested || 0);
        rfpTotalPaid += (rfp.payment_records || [])
            .filter(r => r.status !== 'voided')
            .reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    });
}
```

**service-detail.js** — service mode, query by `service_code`:
```javascript
// Source: app/expense-modal.js lines 51-55 (Phase 69 implementation)
const code = currentService.service_code;
let rfpTotalRequested = 0;
let rfpTotalPaid = 0;
let hasRfps = false;
if (code) {
    const rfpSnap = await getDocs(
        query(collection(db, 'rfps'), where('service_code', '==', code))
    );
    hasRfps = rfpSnap.size > 0;
    rfpSnap.forEach(d => {
        const rfp = d.data();
        rfpTotalRequested += parseFloat(rfp.amount_requested || 0);
        rfpTotalPaid += (rfp.payment_records || [])
            .filter(r => r.status !== 'voided')
            .reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    });
}
```

Note: `getDocs` is already imported in `project-detail.js` (line 6). Confirm it's also in `service-detail.js` — the file uses `getDocs` for CSV export so it is already imported.

### Refresh Button Behavior Change

Current: "🔄 Refresh" calls `window.refreshExpense()` / `window.refreshServiceExpense()` — recalculates aggregates, re-renders page, no modal.

Phase 72 requirement: clicking Refresh should refresh data AND redirect to the Financial Breakdown modal.

Two implementation options:
1. Change the button's `onclick` to a new window function `window.refreshAndShowModal()` that internally calls `refreshExpense()` then `showExpenseModal()`.
2. Add `silent=false` behavior inside `refreshExpense` that accepts a flag to open modal after refresh.

**Option 1 is cleaner** — a separate `refreshAndShowModal` function is explicit and doesn't change the existing `refreshExpense` silent/non-silent API.

```javascript
// In attachWindowFunctions() — project-detail.js:
window.refreshAndShowExpenseModal = async () => {
    await refreshExpense(true); // silent=true: no toast, re-renders with updated data
    showExpenseBreakdownModal(currentProject.project_name, { mode: 'project' });
};
```

```javascript
// In attachWindowFunctions() — service-detail.js:
window.refreshAndShowServiceExpenseModal = async () => {
    await refreshServiceExpense(true);
    showExpenseBreakdownModal(currentService.service_code, {
        mode: 'service',
        displayName: currentService.service_name,
        budget: currentService.budget
    });
};
```

HTML button changes:
```html
<!-- project-detail.js Card 2 -->
<button class="btn btn-sm btn-secondary"
        onclick="window.refreshAndShowExpenseModal()"
        style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
    Refresh
</button>

<!-- service-detail.js Card 2 -->
<button class="btn btn-sm btn-secondary"
        onclick="window.refreshAndShowServiceExpenseModal()"
        style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
    Refresh
</button>
```

The emoji (🔄) can be kept or dropped — the requirement says "clickable refresh" without specifying the label. Keeping it consistent with existing style is fine.

### New Card Cells HTML Pattern

The existing Financial Summary grid uses `repeat(2, 1fr)` — a 2-column grid. The four existing cells (Budget, Contract Cost, Expense, Remaining Budget) occupy 2 rows. Adding Paid and Remaining Payable as cells 5 and 6 naturally creates a third row in the same 2-column grid — no grid restructuring needed.

Show Paid and Remaining Payable cells only when `currentExpense.hasRfps` is true (mirrors Phase 69 EXPPAY-02 decision: hide when no RFPs exist):

```javascript
// In renderProjectDetail() card HTML (project-detail.js):
${currentExpense.hasRfps ? `
    <div class="form-group" style="margin-bottom: 0;">
        <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Paid</label>
        <div style="font-weight: 600; color: #059669; font-size: 1.125rem;">
            ${formatCurrency(currentExpense.totalPaid)}
        </div>
    </div>
    <div class="form-group" style="margin-bottom: 0;">
        <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Remaining Payable</label>
        <div style="font-weight: 600; color: ${currentExpense.remainingPayable > 0 ? '#ef4444' : '#059669'}; font-size: 1.125rem;">
            ${formatCurrency(currentExpense.remainingPayable)}
        </div>
    </div>
` : ''}
```

Same pattern for `service-detail.js` using `currentServiceExpense.hasRfps`, `currentServiceExpense.totalPaid`, `currentServiceExpense.remainingPayable`.

### Destroy Reset Pattern

Both `destroy()` functions must reset the state objects to include the new fields:
- `project-detail.js` line 16: needs initializer reset in destroy
- `service-detail.js` line 206: `currentServiceExpense = { mrfCount: 0, prTotal: 0, prCount: 0, poTotal: 0, poCount: 0 }` — must also reset `totalPaid`, `remainingPayable`, `hasRfps`

### Anti-Patterns to Avoid

- **Querying RFPs by `project_name`**: RFP documents store `project_code`, not `project_name`. Use `currentProject.project_code` directly (already on the in-memory object — no extra Firestore read needed).
- **Adding a live `onSnapshot` on rfps**: The expense card uses a one-shot aggregation pattern (`getAggregateFromServer` + `getDocs`). Stay consistent — use `getDocs` for RFPs, triggered only on refresh.
- **Showing ₱0.00 Paid when no RFPs exist**: Confusing for projects with no payment history. Use the `hasRfps` guard to hide the cells entirely.
- **Forgetting the destroy() reset**: If `currentExpense` isn't reset on destroy, stale `totalPaid` / `remainingPayable` values from a previous project session can leak into the next project load.
- **Double-counting voided payments**: The `expense-modal.js` Phase 69 implementation filters `r.status !== 'voided'` before reducing. The Phase 72 implementation must use the same filter.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Currency formatting | Custom number formatting | `formatCurrency(utils.js)` | Consistent peso sign and commas throughout the app |
| RFP payment computation | Custom payment status logic | Same `payment_records.filter(r => r.status !== 'voided').reduce(...)` pattern from expense-modal.js line 73 | Already proven in production; voided-record handling already figured out |
| RFP querying | REST calls | Firebase SDK `getDocs`/`query`/`where` already imported in both files | Consistent with all existing Firestore patterns |

## Common Pitfalls

### Pitfall 1: RFP Query Key Mismatch (project_name vs project_code)
**What goes wrong:** Using `where('project_name', '==', currentProject.project_name)` on the `rfps` collection returns zero results because RFP documents store `project_code`, not `project_name`.
**Why it happens:** The card pages identify projects by `project_name` for navigation, but the RFP schema (set in Phase 65/67) stores `project_code` on each RFP document.
**How to avoid:** Use `currentProject.project_code` directly — it is already loaded into `currentProject` from the Firestore listener. No extra fetch needed.
**Warning signs:** Paid shows ₱0.00 and Remaining Payable equals total expense even though Finance has recorded payments.

### Pitfall 2: getDocs Not Imported in service-detail.js
**What goes wrong:** Adding `getDocs` call to `refreshServiceExpense` causes `ReferenceError: getDocs is not defined` at runtime.
**Why it happens:** `service-detail.js` imports `getAggregateFromServer`, `sum`, `count`, `onSnapshot`, `query`, `where` — but `getDocs` must be confirmed as imported.
**How to avoid:** Check the import line at the top of `service-detail.js`. The CSV export function uses `getDocs` on line ~864, so it IS already imported. No import change needed.
**Warning signs:** Console error on first Refresh click after landing on a service detail page.

### Pitfall 3: Forgetting to Register/Delete New Window Functions
**What goes wrong:** `window.refreshAndShowExpenseModal` and `window.refreshAndShowServiceExpenseModal` are called from inline `onclick` but not registered on `window`, causing `TypeError: window.refreshAndShowExpenseModal is not a function`.
**Why it happens:** SPA pattern requires all onclick-referenced functions to be on `window`. The destroy pattern also requires they be deleted on teardown.
**How to avoid:** Add both to `attachWindowFunctions()` in their respective files AND add `delete window.refreshAndShowExpenseModal` in destroy().

### Pitfall 4: Stale State on Destroy
**What goes wrong:** User navigates to Project A (Paid: ₱50,000), navigates away, navigates to Project B (no RFPs), sees ₱50,000 stale Paid from Project A briefly before refresh completes.
**Why it happens:** Module-level `currentExpense` persists across SPA navigations if destroy() doesn't fully reset it.
**How to avoid:** In destroy(), reset `currentExpense` to include the new fields: `currentExpense = { total: 0, poCount: 0, trCount: 0, totalPaid: 0, remainingPayable: 0, hasRfps: false }`.

### Pitfall 5: Remaining Payable Computation Mismatch with expense-modal.js
**What goes wrong:** Card shows different Remaining Payable than the Financial Breakdown modal.
**Why it happens:** In `expense-modal.js`, `remainingPayable = totalCost - totalPaid` (where `totalCost` = PO+TR sum). In the summary card, the expense total is the PO+TR aggregate from `getAggregateFromServer`. The values should match.
**How to avoid:** Remaining Payable in the card = `rfpTotalRequested - rfpTotalPaid` (how much of total RFP-requested amount is still unpaid). This is consistent with EXPPAY-03 — it is NOT expense minus paid; it is requested-via-RFP minus paid. The card label should be "Remaining Payable" (matching the modal), and the computation is `totalRequested - totalPaid` from RFPs.

## Code Examples

### refreshExpense Extension (project-detail.js)

```javascript
// Source: app/views/project-detail.js — extends existing refreshExpense function
async function refreshExpense(silent = false) {
    if (!currentProject) return;

    showLoading(true);
    try {
        // Existing PO aggregation
        const posQuery = query(
            collection(db, 'pos'),
            where('project_name', '==', currentProject.project_name)
        );
        const posAggregate = await getAggregateFromServer(posQuery, {
            totalAmount: sum('total_amount'),
            poCount: count()
        });

        // Existing TR aggregation
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

        // NEW: RFP payables query
        let rfpTotalRequested = 0;
        let rfpTotalPaid = 0;
        let hasRfps = false;
        const projectCode = currentProject.project_code || '';
        if (projectCode) {
            const rfpSnap = await getDocs(
                query(collection(db, 'rfps'), where('project_code', '==', projectCode))
            );
            hasRfps = rfpSnap.size > 0;
            rfpSnap.forEach(d => {
                const rfp = d.data();
                rfpTotalRequested += parseFloat(rfp.amount_requested || 0);
                rfpTotalPaid += (rfp.payment_records || [])
                    .filter(r => r.status !== 'voided')
                    .reduce((s, r) => s + parseFloat(r.amount || 0), 0);
            });
        }

        currentExpense = {
            total: poTotal + trTotal,
            poCount: posAggregate.data().poCount || 0,
            trCount: trsAggregate.data().trCount || 0,
            totalPaid: rfpTotalPaid,
            remainingPayable: rfpTotalRequested - rfpTotalPaid,
            hasRfps
        };

        renderProjectDetail();
        if (!silent) showToast('Expense refreshed', 'success');
    } catch (error) {
        console.error('[ProjectDetail] Expense calculation failed:', error);
        showToast('Failed to calculate expense', 'error');
    } finally {
        showLoading(false);
    }
}
```

### Financial Summary Card New Cells (project-detail.js)

```javascript
// Appended inside the existing grid div, after Remaining Budget cell
${currentExpense.hasRfps ? `
    <div class="form-group" style="margin-bottom: 0;">
        <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Paid</label>
        <div style="font-weight: 600; color: #059669; font-size: 1.125rem;">
            ${formatCurrency(currentExpense.totalPaid)}
        </div>
    </div>
    <div class="form-group" style="margin-bottom: 0;">
        <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Remaining Payable</label>
        <div style="font-weight: 600; color: ${currentExpense.remainingPayable > 0 ? '#ef4444' : '#059669'}; font-size: 1.125rem;">
            ${formatCurrency(currentExpense.remainingPayable)}
        </div>
    </div>
` : ''}
```

### Refresh Button with Modal Redirect

```html
<!-- Replace existing Refresh button in both files -->
<button class="btn btn-sm btn-secondary"
        onclick="window.refreshAndShowExpenseModal()"
        style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
    &#x1F504; Refresh
</button>
```

```javascript
// In attachWindowFunctions() — project-detail.js:
window.refreshAndShowExpenseModal = async () => {
    if (!currentProject) return;
    await refreshExpense(true); // silent refresh — re-renders card with updated data
    showExpenseBreakdownModal(currentProject.project_name, { mode: 'project' });
};
```

## Affected Files

| File | Change Type | Description |
|------|-------------|-------------|
| `app/views/project-detail.js` | Modify | Extend `currentExpense` state, extend `refreshExpense()` with RFP query, add Paid/Remaining Payable cells to card HTML, add `window.refreshAndShowExpenseModal`, update button onclick, update destroy() reset |
| `app/views/service-detail.js` | Modify | Extend `currentServiceExpense` state, extend `refreshServiceExpense()` with RFP query, add Paid/Remaining Payable cells to card HTML, add `window.refreshAndShowServiceExpenseModal`, update button onclick, update destroy() reset |

No other files need changes. The `expense-modal.js` is unchanged — Phase 69 already handles payables display inside the modal itself.

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Refresh button recalculates and stays on page | Phase 72: Refresh also opens Financial Breakdown modal | User requirement — both actions in one click |
| Card shows Expense + Remaining Budget only | Phase 72: Card also shows Paid + Remaining Payable | Mirrors modal scoreboards into summary card |
| RFP data only in expense modal | Phase 72: RFP-derived totals surfaced in summary card | Phase 69 precedent — no new Firestore schema changes needed |

## Open Questions

1. **Refresh button label: keep emoji or text-only?**
   - What we know: Current button is `🔄 Refresh`; requirement says "refresh button that is clickable — when clicked, still redirects to the financial breakdown modal"
   - What's unclear: Whether to keep the emoji or switch to plain text
   - Recommendation: Keep `🔄 Refresh` for visual consistency with existing UI; planner can adjust at implementation

2. **Show Paid/Remaining Payable when hasRfps=false?**
   - What we know: EXPPAY-02 decision from Phase 69 hides payable row in the modal when no RFPs exist
   - Recommendation: Follow same pattern — hide cells entirely when `hasRfps === false` to avoid confusing ₱0.00 display

3. **Remaining Payable: use totalRequested - totalPaid or expense - totalPaid?**
   - What we know: Phase 69 modal uses `totalCost - totalPaid` for its card. REQUIREMENTS.md EXPPAY-01 labels it "Remaining Payable" derived from RFPs.
   - Recommendation: Use `rfpTotalRequested - rfpTotalPaid` — amount still owed of what was formally requested via RFP. This is consistent with EXPPAY-01 ("Total Requested") minus EXPPAY-02 ("Total Paid"). It is semantically cleaner than expense-minus-paid which would include non-RFP portions.

## Environment Availability

Step 2.6: SKIPPED — phase is code-only changes to two existing static JS view files; no external CLI tools or services beyond already-running Firebase.

## Validation Architecture

`nyquist_validation` key is absent from `.planning/config.json`. This is a zero-build static SPA with no test framework — consistent with all previous phases. Manual browser UAT is the established validation pattern.

**Manual verification checklist (planner should include these as verification steps):**

- Open a project detail page for a project that has RFPs with recorded payments → Paid and Remaining Payable cells appear with correct amounts
- Open a project detail page for a project with zero RFPs → Paid and Remaining Payable cells are hidden entirely
- Click the Refresh button → page refreshes totals AND Financial Breakdown modal opens
- Click the Expense amount (not the button) → Financial Breakdown modal opens without refresh
- Open a service detail page with RFPs → same Paid/Remaining Payable cells appear
- Open a service detail page with no RFPs → cells are hidden
- Navigate from Project A (has RFPs) to Project B (no RFPs) → stale data does not bleed across

## Sources

### Primary (HIGH confidence)
- `app/views/project-detail.js` (lines 16, 313-360, 640-687, 833-844) — current state object, Financial Summary card HTML, refreshExpense function, window function registrations
- `app/views/service-detail.js` (lines 21, 369-430, 794-855, 919-937) — current state object, Financial Summary card HTML, refreshServiceExpense function, window function registrations
- `app/expense-modal.js` (lines 50-74, 481, 626-655) — Phase 69 RFP query pattern, remainingPayable computation, Row 3 scoreboard HTML
- `.planning/phases/69-revise-expense-modal-scoreboards-to-add-remaining-payable-tracking/69-RESEARCH.md` — confirmed RFP schema, query strategy, pitfalls
- `CLAUDE.md` — tech stack, Firebase schema, window function patterns

### Secondary (MEDIUM confidence)
- `ROADMAP.md` Phase 72 description — "Add paid and remaining payable to project/service financial summary cards with clickable refresh redirecting to financial breakdown modal"
- STATE.md Phase 69 decision — "Re-fetch project doc in RFP block to get project_code"; Phase 72 avoids this because `currentProject` already has `project_code` in memory

## Project Constraints (from CLAUDE.md)

- Pure JavaScript ES6 modules — no framework, no build system, no TypeScript
- Firebase Firestore v10.7.1 CDN — use SDK imports from `../firebase.js`, not npm
- All window event handlers must be assigned to `window.*` for onclick compatibility; must be deleted in `destroy()`
- Status strings are case-sensitive — `'voided'` (lowercase) matches payment_records status field
- No automated tests — manual browser UAT only
- CSS design system colors: success `#059669`, danger `#ef4444`, text `#1e293b`, muted `#64748b`
- Console log prefixes: `[ProjectDetail]` and `[ServiceDetail]` already established in both files

## Metadata

**Confidence breakdown:**
- Affected files: HIGH — direct code inspection confirms exactly two files; expense-modal.js unchanged
- RFP query strategy: HIGH — confirmed by reading both expense-modal.js Phase 69 implementation and Phase 69 RESEARCH.md
- State extension pattern: HIGH — direct read of both module-level state objects and their destroy resets
- Card HTML structure: HIGH — direct read of Financial Summary card HTML in both files
- Window function pattern: HIGH — confirmed `attachWindowFunctions()` exists in both files and destroy() deletes them

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable codebase, no external dependency changes expected)
