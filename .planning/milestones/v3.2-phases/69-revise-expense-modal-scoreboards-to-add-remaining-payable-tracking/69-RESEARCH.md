# Phase 69: Revise Expense Modal Scoreboards to Add Remaining Payable Tracking - Research

**Researched:** 2026-03-25
**Domain:** Firebase Firestore reads, expense-modal.js scoreboard UI, RFP payables integration
**Confidence:** HIGH

## Summary

Phase 69 extends the shared expense breakdown modal (`app/expense-modal.js`) with a new "Remaining Payable" dimension. Currently the modal shows budget vs. total cost scoreboards but has no awareness of how much of that total cost has actually been paid via the RFP workflow. This phase adds a query to the `rfps` collection filtered by the same `project_name` or `service_code` identifier and calculates: total requested (RFPs submitted), total paid (sum of `payment_records` amounts), and remaining payable (requested minus paid). These figures become additional scoreboard cards below the existing Budget / Remaining Budget row.

The `rfps` collection is already well-established from Phase 65 and carries `project_code`, `service_code`, `po_id`, `tr_id`, `amount_requested`, and `payment_records[]` on every document. RFP documents do NOT store `project_name` directly — they store `project_code`. The expense modal is keyed on `project_name` (project mode) or `service_code` (service mode), so the project-mode query needs to join through the PO/TR snapshots already fetched (each PO/TR carries `project_name`) to collect matching `po_id` / `tr_id` sets, then filter `rfpsData` in-memory — OR issue an `in` query on `rfps` using the collected PO IDs. The service-mode path is simpler: RFP documents have `service_code` and can be queried directly.

**Primary recommendation:** Fetch RFPs by collecting all `po_id` and `tr_id` values from the already-fetched PO/TR snapshots, then use a Firestore `in` query (up to 30 elements) or a `where('service_code', '==', identifier)` for service mode. Compute payable totals in the same downstream block and render two new scoreboard cards alongside or below the existing category scoreboards.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore v10.7.1 | CDN | Query `rfps` collection | Already in use; same `getDocs`/`query`/`where`/`collection` pattern used throughout |
| Pure ES6 JavaScript | — | Calculation + DOM injection | Zero-build SPA — no framework |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `formatCurrency` (utils.js) | — | Currency display | All monetary amounts in this modal use it |

**Installation:** No new packages needed.

## Architecture Patterns

### Relevant Existing Pattern: expense-modal.js Flow

The full query + compute + render cycle lives in the single exported `showExpenseBreakdownModal` async function. The pattern is:

1. **Query** — fetch `pos` and `transport_requests` snapshots via `Promise.all`.
2. **Compute** — iterate snapshots, compute category totals, TR totals, delivery fees.
3. **Build HTML** — template-string scorecards + category cards + transport cards.
4. **Inject** — `document.body.insertAdjacentHTML('beforeend', modalHTML)`.

Phase 69 adds a **step 1.5** (fetch `rfps` after the PO/TR snapshots are available) and expands **step 3** with new scoreboard cards.

### RFP Query Strategy

**Service mode** — direct query:
```javascript
// Source: app/views/procurement.js submitRFP (rfp doc schema)
const rfpsSnapshot = await getDocs(
    query(collection(db, 'rfps'), where('service_code', '==', identifier))
);
```

**Project mode** — RFPs store `project_code` NOT `project_name`. The PO snapshot is already fetched; collect po_ids:
```javascript
// Collect all po_ids from already-fetched posSnapshot
const poIds = [];
posSnapshot.forEach(doc => { const pid = doc.data().po_id; if (pid) poIds.push(pid); });
const trIds = [];
trsSnapshot.forEach(doc => { const tid = doc.data().tr_id; if (tid) trIds.push(tid); });

// Firestore `in` query — max 30 elements; chunk if >30
// For most projects this will be well under 30
let rfpsSnapshot = { forEach: () => {} }; // default empty
if (poIds.length > 0 || trIds.length > 0) {
    const allIds = [...poIds, ...trIds];
    // Firestore `in` supports up to 30 values
    const rfpsSnap = await getDocs(
        query(collection(db, 'rfps'), where('po_id', 'in', poIds.slice(0, 30)))
    );
    // ... handle tr_id separately if needed
}
```

**Simpler alternative for project mode:** since `rfps` stores `project_code`, fetch the project code from the already-fetched project doc and query directly:
```javascript
const projectCode = project.project_code || '';
if (projectCode) {
    rfpsSnapshot = await getDocs(
        query(collection(db, 'rfps'), where('project_code', '==', projectCode))
    );
}
```
This is the cleanest approach — mirrors service mode exactly and avoids chunked `in` queries.

### Payable Totals Computation

```javascript
// Source: app/views/finance.js lines 580-583 (same pattern)
let totalRequested = 0;
let totalPaid = 0;
rfpsSnapshot.forEach(rfpDoc => {
    const rfp = rfpDoc.data();
    totalRequested += parseFloat(rfp.amount_requested || 0);
    const paid = (rfp.payment_records || []).reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    totalPaid += paid;
});
const remainingPayable = totalRequested - totalPaid;
```

### New Scoreboard Cards

The existing modal has two layout rows of scoreboards:
1. **Row 1 (2-col grid):** Budget | Remaining Budget
2. **Row 2 (3-col grid):** Material Purchases | Transport Fees | Subcon Cost

Phase 69 adds a **Row 3** (up to 3-col grid) below the existing rows but before Total Cost:
- **Total Requested** — sum of `amount_requested` across matching RFPs
- **Total Paid** — sum of all `payment_records[].amount`
- **Remaining Payable** — `totalRequested - totalPaid` (red when > 0, green when 0)

If no RFPs exist for this project/service, this row should either be hidden or show a neutral "No RFPs submitted" placeholder — not show a misleading ₱0.00 figure.

### Anti-Patterns to Avoid

- **Querying rfps in a separate onSnapshot**: The modal is a one-shot async function, not a live view. Use `getDocs` (one-time read), same as all other modal queries in this codebase.
- **Hardcoding `project_name` as a query key on rfps**: RFPs do not have `project_name` — they have `project_code`. Use the project's `project_code` fetched from the `projects` collection (already fetched in project mode).
- **Ignoring TR-linked RFPs**: `tr_id` RFPs also carry `project_code`/`service_code`. A single query on `project_code` or `service_code` captures both PO and TR RFPs — no separate query needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Currency formatting | Custom toFixed() | `formatCurrency(utils.js)` | Consistent peso sign + comma formatting across entire app |
| Payment status derivation | Custom logic | Same `payment_records.reduce()` pattern from finance.js | Already proven in production |
| Firestore querying | REST fetch | Firebase SDK `getDocs`/`query`/`where` | Already imported in expense-modal.js |

## Common Pitfalls

### Pitfall 1: RFPs Not Linked to project_name
**What goes wrong:** Querying `rfps` with `where('project_name', '==', identifier)` returns 0 results because RFP documents store `project_code`, not `project_name`.
**Why it happens:** The expense modal identifies projects by `project_name`, but procurement workflow stores `project_code` on RFPs.
**How to avoid:** Fetch the project's `project_code` from the `projects` snapshot (already fetched in project mode at line 36-40 of expense-modal.js), then query `rfps` by `project_code`.
**Warning signs:** Scoreboard showing ₱0.00 total requested even though RFPs exist in Firestore.

### Pitfall 2: Importing getDocs Without Already Being Present
**What goes wrong:** `getDocs` is already imported in expense-modal.js at line 6. Adding a second query does not require any import change — but forgetting that `query`, `where`, `collection` are also needed.
**How to avoid:** Check line 6 of expense-modal.js — `import { db, collection, query, where, getDocs } from './firebase.js';` — all needed symbols are already imported.

### Pitfall 3: Showing Payable Scoreboards When No RFPs Exist
**What goes wrong:** A project with zero RFPs shows ₱0.00 for both "Total Requested" and "Remaining Payable", which looks confusing and clutters the modal.
**How to avoid:** Conditionally render the payable row only when `totalRequested > 0`. When zero, render a subtle "No RFPs submitted yet" note or omit the row entirely.

### Pitfall 4: Double-Counting TR-Linked RFPs
**What goes wrong:** Building two queries (one for `project_code`, one by iterating `trIds`) and summing both would double-count RFPs that have `project_code` set.
**How to avoid:** Use a single query on `project_code` (project mode) or `service_code` (service mode). TR RFPs also carry these fields, so one query is sufficient.

## Code Examples

### Current expense-modal.js Query Block (lines 25-45)
```javascript
// Source: app/expense-modal.js lines 25-45
if (mode === 'service') {
    budget = parseFloat(budget || 0);
    [posSnapshot, trsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'pos'), where('service_code', '==', identifier))),
        getDocs(query(collection(db, 'transport_requests'), where('service_code', '==', identifier)))
    ]);
} else {
    const projectSnapshot = await getDocs(
        query(collection(db, 'projects'), where('project_name', '==', identifier))
    );
    const project = projectSnapshot.docs[0]?.data() || {};
    budget = parseFloat(project.budget || 0);
    [posSnapshot, trsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'pos'), where('project_name', '==', identifier))),
        getDocs(query(collection(db, 'transport_requests'), where('project_name', '==', identifier)))
    ]);
}
```

In the project branch, `project` is already available — `project.project_code` can be used immediately for the RFP query.

### Proposed RFP Query Addition (after existing query block)
```javascript
// Fetch RFPs for payable tracking
let rfpsForPayable = [];
if (mode === 'service') {
    const rfpSnap = await getDocs(
        query(collection(db, 'rfps'), where('service_code', '==', identifier))
    );
    rfpSnap.forEach(d => rfpsForPayable.push(d.data()));
} else {
    const projectCode = (mode === 'project' && project?.project_code) ? project.project_code : '';
    if (projectCode) {
        const rfpSnap = await getDocs(
            query(collection(db, 'rfps'), where('project_code', '==', projectCode))
        );
        rfpSnap.forEach(d => rfpsForPayable.push(d.data()));
    }
}
let totalRequested = 0;
let totalPaid = 0;
rfpsForPayable.forEach(rfp => {
    totalRequested += parseFloat(rfp.amount_requested || 0);
    totalPaid += (rfp.payment_records || []).reduce((s, r) => s + parseFloat(r.amount || 0), 0);
});
const remainingPayable = totalRequested - totalPaid;
```

### Payable Scoreboard Card HTML Pattern
```javascript
// Mirrors existing scoreboard card style (lines 321-330 of expense-modal.js)
const payableRowHTML = totalRequested > 0 ? `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
        <div style="padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div style="font-size: 0.875rem; color: #64748b; font-weight: 600; margin-bottom: 0.5rem;">Total Requested (RFPs)</div>
            <div style="font-size: 1.5rem; font-weight: 700; color: #1e293b;">&#8369;${formatCurrency(totalRequested)}</div>
        </div>
        <div style="padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div style="font-size: 0.875rem; color: #064748b; font-weight: 600; margin-bottom: 0.5rem;">Total Paid</div>
            <div style="font-size: 1.5rem; font-weight: 700; color: #059669;">&#8369;${formatCurrency(totalPaid)}</div>
        </div>
        <div style="padding: 1rem; border-radius: 8px; border: 1px solid ${remainingPayable > 0 ? '#fca5a5' : '#e2e8f0'}; background: ${remainingPayable > 0 ? '#fef2f2' : 'white'};">
            <div style="font-size: 0.875rem; color: ${remainingPayable > 0 ? '#991b1b' : '#64748b'}; font-weight: 600; margin-bottom: 0.5rem;">Remaining Payable</div>
            <div style="font-size: 1.5rem; font-weight: 700; color: ${remainingPayable > 0 ? '#ef4444' : '#059669'};">&#8369;${formatCurrency(remainingPayable)}</div>
        </div>
    </div>
` : '';
```

## Affected Files

| File | Change Type | Description |
|------|-------------|-------------|
| `app/expense-modal.js` | Modify | Add RFP query, payable computation, new scoreboard row in modal HTML template |

No other files need changes. The modal is self-contained and called from `finance.js`, `project-detail.js`, and `service-detail.js` via the shared `showExpenseBreakdownModal` export — all callers automatically benefit.

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Manual payment status | Auto-derived from `payment_records` arithmetic | Phase 65 decision — Finance never sets status manually |
| Single expense modal | Shared `expense-modal.js` module | Refactored in Phase 36/38 to be mode-agnostic |

## Open Questions

1. **Naming: "Total Requested" vs "Total Invoiced"**
   - What we know: `amount_requested` on RFPs represents the invoiced amount per tranche
   - What's unclear: User preference for label wording
   - Recommendation: Use "Total Requested (RFPs)" to clarify source; can be adjusted at UAT

2. **Show row when totalRequested === 0?**
   - What we know: Many projects may have no RFPs yet
   - What's unclear: User preference — "hide row" vs "show ₱0.00" vs "No RFPs yet" note
   - Recommendation: Hide entire row when `totalRequested === 0` to avoid noise; surface only when actionable data exists

3. **project_code availability on the project document**
   - What we know: The `projects` collection stores `project_name`, `status`, `budget`, and `project_code` fields
   - What's unclear: Whether older project documents created before `project_code` field was introduced might have missing `project_code`
   - Recommendation: Guard with `if (projectCode)` — if empty, silently skip RFP query (same fallback as current service_code guard)

## Environment Availability

Step 2.6: SKIPPED — phase is code-only change to an existing static JS file; no external CLI tools or services beyond already-running Firebase.

## Validation Architecture

`nyquist_validation` key is absent from `.planning/config.json` (no `workflow.nyquist_validation` field). However, this is a zero-build static SPA with no test framework — consistent with all previous phases in this project. Manual UAT via browser DevTools is the established validation pattern (per `user_work_patterns.md`).

**Manual verification checklist (planner should include these as verification steps):**
- Open expense modal for a project that has RFPs → payable scoreboards appear with correct totals
- Open expense modal for a project with no RFPs → payable row is hidden (not ₱0.00)
- Open expense modal in service mode → `service_code` query works, payable totals match Finance Payables view
- `totalPaid + remainingPayable === totalRequested` arithmetic check in browser console

## Sources

### Primary (HIGH confidence)
- `app/expense-modal.js` (full read) — current modal structure, query pattern, scoreboard HTML
- `app/views/procurement.js` lines 752-910 — confirmed RFP document schema (`project_code`, `service_code`, `amount_requested`, `payment_records[]`)
- `app/views/finance.js` lines 28-37, 580-583 — payment derivation pattern (`payment_records.reduce`)
- `.planning/STATE.md` Accumulated Context — Phase 65 decisions on payment arithmetic
- `CLAUDE.md` — tech stack, Firebase schema, development patterns

### Secondary (MEDIUM confidence)
- ROADMAP.md Phase 69 description — "revise expense-modal scoreboards to add remaining payable tracking"

## Project Constraints (from CLAUDE.md)

- Pure JavaScript ES6 modules — no framework, no build system, no TypeScript
- Firebase Firestore v10.7.1 CDN — use SDK imports from `./firebase.js`, not npm
- All window event handlers must be assigned to `window.*` for onclick compatibility
- Status strings are case-sensitive — `'Fully Paid'`, `'Pending'`, `'Partially Paid'`
- `items_json` always stored as JSON string — parse with `JSON.parse()`
- No automated tests — manual browser UAT only
- No `.env` — Firebase config is in `app/firebase.js` (client-safe)
- CSS design system colors: success `#059669`, danger `#ef4444`, text `#1e293b`, muted `#64748b`
- Pagination: records use 10/page, suppliers use 15/page (not relevant here — modal has no table pagination)

## Metadata

**Confidence breakdown:**
- Affected file identification: HIGH — `expense-modal.js` is the sole file; confirmed by grep across all callers
- RFP schema: HIGH — read directly from `submitRFP` and `submitTRRFP` source
- Query strategy: HIGH — `project_code` and `service_code` fields confirmed present on RFP docs
- Scoreboard HTML pattern: HIGH — copied from existing modal template in same file
- Pitfalls: HIGH — project_name vs project_code discrepancy confirmed by direct code inspection

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable codebase, no external dependency changes expected)
