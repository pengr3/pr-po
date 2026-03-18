# Phase 65: RFP + Payables Tracking — Research

**Researched:** 2026-03-18
**Domain:** Firebase Firestore (new collection), pure JS SPA view modification, payment workflow
**Confidence:** HIGH — all findings verified directly from codebase source files

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- RFP trigger: right-click on PO row in PO Tracking opens context menu — same `oncontextmenu` pattern as existing proof modal (~line 3584 procurement.js)
- RFP creation pre-fills supplier, PO amount, and available tranches from the PO document
- Multiple RFPs per PO allowed (progress billing, one RFP per tranche)
- Payment terms on POs change from free-text string to structured tranche array: `[{ label: string, percentage: number }]`
- Tranches must total exactly 100% (enforced on save)
- Default new PO: single tranche `{ label: "Full Payment", percentage: 100 }`
- RFP collection: `rfps` (dedicated, not embedded on PO)
- RFP ID format: `RFP-[PROJECT CODE]-###` scoped per project code (NOT year-based) — `generateSequentialId()` NOT usable; custom inline generator required
- RFP key fields: `rfp_id`, `po_id`, `mrf_id`, `project_code`, `supplier_name`, `tranche_label`, `tranche_percentage`, `amount_requested`, `due_date`, `payment_records` (array), no stored `status` field
- `payment_records` is an array on the RFP doc (not a subcollection)
- Payables tab is the 3rd tab in Finance view (after "Pending Approvals" and "Purchase Orders")
- Payables tab: one row per RFP, flat table (not grouped by PO)
- Payables columns: RFP ID | Supplier | PO Ref | Project/Service | Tranche Label | Amount | Paid | Balance | Due Date | Status | Actions
- Status values: Pending / Partially Paid / Fully Paid / Overdue — auto-derived at render time, NEVER written to Firestore
- Overdue = due date passed AND not Fully Paid → red badge + #fef2f2 row background
- Payables filters: Status (All / Pending / Partially Paid / Fully Paid / Overdue) + Department (All / Projects / Services)
- Fully paid RFPs remain visible by default
- Finance role only records payments; Procurement cannot
- Payment modal: amount read-only (pre-filled with tranche amount — tranches not partially payable), date, method dropdown, reference
- Payment methods: Bank Transfer | Check | Cash | GCash/E-Wallet | Other (Other reveals text input)
- Payment history: expandable row per RFP (chevron toggle), showing chronological records
- Void policy: void only (no edit), voided = `status: 'voided'` on payment record, amount excluded from total
- PO ID cell payment fill: position:relative + absolute child div, width = % paid, transition: width 0.4s ease
- Fill colors: No RFPs → #ea4335 at 20% opacity full-width; In progress → #fbbc04 35% opacity partial-width; Fully paid → #34a853 35% opacity 100% width
- Hover tooltip via `title` attribute (no library)
- Security rules for `rfps` MUST deploy in the same commit as the first `addDoc` to `rfps`
- No new CSS files — all styles go in styles/views.css or inline

### Claude's Discretion

- Exact CSS implementation of the progress fill effect on PO ID cells
- Tooltip styling and positioning
- Animation/transition on the progress fill (if any)
- Tranche row add/remove UI within the PO edit modal

### Deferred Ideas (OUT OF SCOPE)

- Google Drive Picker API for proof documents — deferred to v4.0+
- Scheduled/recurring payment reminders — future phase
- Bulk payment recording across multiple RFPs — future phase
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RFP-01 | Procurement user can submit a Request for Payment linked to any existing PO (regardless of procurement status), including invoice number, amount, payment terms, and due date | Right-click context menu on PO row triggers RFP creation modal; PO data available in `poData` array in procurement.js; custom sequential ID generator needed scoped to project_code |
| RFP-02 | Finance user can view a Payables tab listing all open RFPs with supplier, amount, balance remaining, due date, and payment status | New 3rd tab in finance.js using established `tab-btn` / `section` pattern; `onSnapshot` on `rfps` collection; balance computed client-side from `payment_records` array |
| RFP-03 | Finance user can record a payment against an RFP (partial or full), including payment amount, date, method, and reference | Record Payment modal; `updateDoc` appends to `payment_records` array using `arrayUnion`; amount is read-only (full tranche amount) |
| RFP-04 | System automatically derives payment status from running total vs amount requested — Finance never manually sets status | Pure client-side derivation: `sum(payment_records.filter(r => r.status !== 'voided').map(r => r.amount))` vs `amount_requested`; no status field written to Firestore |
| RFP-05 | Overdue indicator displayed when RFP due date has passed and not fully paid | `new Date(rfp.due_date) < new Date()` AND status !== 'Fully Paid' → Overdue badge + #fef2f2 row tint; evaluated at render time |
| RFP-06 | Procurement user can see RFP status on their PO Tracking view | PO ID cell payment fill effect; requires `rfps` onSnapshot listener in procurement.js init; `rfpsData` keyed by `po_id` for O(1) lookup per row |
</phase_requirements>

---

## Summary

Phase 65 is a pure-JavaScript feature addition to an existing zero-build SPA. No new external libraries, no build pipeline changes. The work touches three existing files (`procurement.js`, `finance.js`, `firestore.rules`) and two CSS files (`styles/views.css` for fill styles). A new Firestore collection `rfps` is introduced.

The most structurally significant change is replacing the `payment_terms` free-text field on `pos` documents with a structured `tranches` array. This is a schema migration in a schemaless database — old POs that lack `tranches` must be handled defensively via a fallback that treats absent `tranches` as a single Full Payment tranche. No backfill migration script is needed; the read-path fallback is sufficient.

The second significant change is adding a 4th data listener in `procurement.js` init (for `rfps`), which must be managed in the `listeners` array and cleaned up in `destroy()`. The Payables tab in `finance.js` follows the identical `onSnapshot` + render pattern already present for PRs and POs.

**Primary recommendation:** Implement in four logical work units: (1) tranche builder on PO modal + firestore.rules, (2) RFP creation flow in procurement.js, (3) Payables tab in finance.js, (4) PO ID payment fill in procurement.js. Security rules must ship with unit 1 (first `addDoc` to `rfps` happens in unit 2, but rules must exist before that).

---

## Standard Stack

### Core (already in project — no new installs)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| Firebase Firestore | v10.7.1 (CDN) | `rfps` collection reads/writes | Already imported; `arrayUnion` needed for `payment_records` append |
| Pure JS ES6 modules | — | All logic | No framework |
| CSS variables | — | Design tokens from styles/main.css | No new tokens needed |

### Firebase Imports Needed (additions to existing imports)

`arrayUnion` is available from `firebase/firestore` but must be added to imports in `procurement.js` and `finance.js` if not already present.

**Verification:** Check top of each file for existing `arrayUnion` import before adding.

```javascript
// In procurement.js / finance.js — add to existing import line if missing:
import { ..., arrayUnion } from '../firebase.js';
// And in firebase.js re-export if not already re-exported:
export { ..., arrayUnion } from 'firebase/firestore';
```

### No New Libraries

This phase uses zero new dependencies. All UI patterns, color tokens, modal structure, and Firebase patterns already exist in the codebase.

---

## Architecture Patterns

### Recommended File Modification Order

```
firestore.rules          — Add rfps rules FIRST (must exist before any rfps write)
app/views/procurement.js — Tranche builder in PO modal, RFP creation, payment fill
app/views/finance.js     — Payables tab (3rd tab), payment recording modal
styles/views.css         — PO ID fill styles (.po-payment-fill, .po-id-cell)
```

### Pattern 1: RFP Sequential ID Generation (Custom — project_code scoped)

`generateSequentialId()` in utils.js uses `PREFIX-YYYY-###` format. RFP IDs use `RFP-[PROJECT_CODE]-###` with no year component. Custom inline generator required:

```javascript
// Source: CONTEXT.md + CLAUDE.md pattern
async function generateRFPId(projectCode) {
    const rfpsSnap = await getDocs(
        query(collection(db, 'rfps'), where('project_code', '==', projectCode))
    );
    let maxNum = 0;
    rfpsSnap.forEach(doc => {
        const id = doc.data().rfp_id; // "RFP-CLMC-001"
        if (id) {
            const parts = id.split('-');
            // parts[0]=RFP, parts[1]=CLMC, parts[2]=001
            // But project_code itself may contain hyphens (e.g. CLMC-ACME-2026001)
            // Take the last segment as the sequence number
            const seqStr = parts[parts.length - 1];
            const num = parseInt(seqStr);
            if (!isNaN(num) && num > maxNum) maxNum = num;
        }
    });
    return `RFP-${projectCode}-${String(maxNum + 1).padStart(3, '0')}`;
}
```

**Critical note:** `project_code` values follow the format `CLMC-[CLIENT]-[YEAR][SEQ]` (e.g., `CLMC-ACME-2026001`). An RFP ID for this project would be `RFP-CLMC-ACME-2026001-001`. The sequence number is always the final hyphen-delimited segment — parse with `parts[parts.length - 1]`.

### Pattern 2: Payment Status Derivation (Client-side, never persisted)

```javascript
// Source: CONTEXT.md decisions + UI-SPEC executor notes
function deriveRFPStatus(rfp) {
    const totalPaid = (rfp.payment_records || [])
        .filter(r => r.status !== 'voided')
        .reduce((sum, r) => sum + (r.amount || 0), 0);
    const isOverdue = rfp.due_date && new Date(rfp.due_date) < new Date();
    if (totalPaid >= rfp.amount_requested && rfp.amount_requested > 0) return 'Fully Paid';
    if (isOverdue) return 'Overdue';
    if (totalPaid > 0) return 'Partially Paid';
    return 'Pending';
}
```

**Note:** Overdue overrides Partially Paid but NOT Fully Paid. If fully paid but due date passed, still show Fully Paid.

### Pattern 3: Finance Tab Addition (3rd tab)

Verified from finance.js render() at line 680:

```javascript
// Current tab nav (lines 690–698):
<a href="#/finance/approvals" class="tab-btn ...">Pending Approvals</a>
<a href="#/finance/pos" class="tab-btn ...">Purchase Orders</a>
<a href="#/finance/projects" class="tab-btn ...">Project List</a>

// Addition — new 4th tab (Payables is the new 3rd, projects shifts or stays):
<a href="#/finance/payables" class="tab-btn ${activeTab === 'payables' ? 'active' : ''}">
    Payables
</a>
```

And in `init()` at line 1008: add `if (activeTab === 'payables') { initPayablesTab(); }` — matching pattern for `projects` tab initialization.

Router in `app/router.js` already handles sub-routes like `#/finance/approvals` — adding `#/finance/payables` requires no router changes, only the tab nav link and section handling in finance.js.

### Pattern 4: Expandable Payment History Row

```javascript
// Source: UI-SPEC executor notes + existing table patterns
// Each RFP generates two <tr> elements:
`<tr oncontextmenu="..." class="rfp-row">
    <td>
        <span class="chevron" onclick="window.togglePaymentHistory('${rfp.rfp_id}')"
              id="chevron-${rfp.rfp_id}" style="cursor:pointer;user-select:none;">▶</span>
    </td>
    <!-- ... other cells ... -->
</tr>
<tr class="payment-history-row" id="history-${rfp.rfp_id}" style="display:none;">
    <td colspan="11" style="padding: 8px 16px; border-left: 4px solid var(--gray-200);">
        <!-- nested payment records table or div list -->
    </td>
</tr>`

window.togglePaymentHistory = function(rfpId) {
    const row = document.getElementById(`history-${rfpId}`);
    const chevron = document.getElementById(`chevron-${rfpId}`);
    if (!row) return;
    const isOpen = row.style.display === 'table-row';
    row.style.display = isOpen ? 'none' : 'table-row';
    chevron.textContent = isOpen ? '▶' : '▼';
};
```

### Pattern 5: PO ID Payment Fill Effect

```javascript
// Source: UI-SPEC component inventory
// In renderPOTrackingRow() — replace the PO ID <td> HTML:
const fillData = getPOPaymentFill(po.id); // { pct, color, opacity, tooltip }

`<td class="po-id-cell" title="${fillData.tooltip}" style="position:relative;overflow:hidden;">
    <div class="po-payment-fill" style="
        position:absolute;left:0;top:0;height:100%;
        width:${fillData.pct}%;
        background:${fillData.color};
        opacity:${fillData.opacity};
        transition:width 0.4s ease;
    "></div>
    <span style="position:relative;z-index:1;">
        <strong><a href="javascript:void(0)" onclick="window.viewPODetails('${po.id}')"
                   style="color:#1a73e8;text-decoration:none;">${escapeHTML(po.po_id)}</a></strong>
    </span>
</td>`
```

`getPOPaymentFill(poId)` computes from the `rfpsData` map (keyed by `po_id`):
- No RFPs for this PO: `{ pct: 100, color: '#ea4335', opacity: 0.20, tooltip: 'No payment requests submitted' }`
- RFPs exist, not fully paid: `{ pct: percentPaid, color: '#fbbc04', opacity: 0.35, tooltip: 'Paid: ₱X | Balance: ₱X | XX% complete' }`
- All tranches fully paid: `{ pct: 100, color: '#34a853', opacity: 0.35, tooltip: 'Fully paid: ₱X' }`

### Pattern 6: Tranche Builder in PO Edit Modal

Replace lines 5338–5341 in procurement.js (the `editPaymentTerms_${po.id}` input) and lines 6343–6345 in the `promptPODocument` modal with the tranche builder UI.

Existing `savePODocumentFields()` writes `payment_terms` as a string — must update to write `tranches` as array. Existing `generatePODocument()` uses `PAYMENT_TERMS: po.payment_terms` for the printed document — update to render tranches as a human-readable string for the print template.

### Pattern 7: Firestore Security Rules for `rfps`

Follow the existing template at the top of `firestore.rules`:

```
// rfps collection
match /rfps/{rfpId} {
    // All active users can read
    allow read: if isActiveUser();

    // Create: procurement role submits RFPs
    allow create: if hasRole(['super_admin', 'procurement']);

    // Update: finance records payments (arrayUnion on payment_records); procurement can update pre-submission
    allow update: if hasRole(['super_admin', 'finance', 'procurement']);

    // Delete: super_admin only (audit preservation)
    allow delete: if hasRole(['super_admin']);
}
```

**Role justification:**
- `create`: Procurement submits RFPs (per CONTEXT.md)
- `update`: Finance records payments via `arrayUnion` on `payment_records`; procurement might need to correct pre-submission fields
- `read`: All active users (procurement sees RFP status on PO Tracking — RFP-06)

### Anti-Patterns to Avoid

- **Writing `status` to Firestore:** Status is always derived in JS at render time from `payment_records` sum. Never `updateDoc` with a `status` field on an `rfps` document.
- **Using `generateSequentialId()` for RFP IDs:** It uses YYYY-based keys. RFP IDs are project-code-scoped. Use the custom inline generator in Pattern 1.
- **Split commit for security rules + first write:** Rules and the first `addDoc` to `rfps` must be in the same deployment/commit (prior milestone lesson, documented in STATE.md).
- **Subcollection for payment records:** Decided as array on doc (1-5 records per RFP). Do not use subcollection.
- **Editing payment records:** Void-only policy. Never implement an edit path on payment records.
- **Partially paying a tranche:** UI enforces full tranche payment. Amount field in Record Payment modal is read-only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal structure | Custom dialog | `createModal()` + `openModal()` / `closeModal()` pattern already in codebase | Established pattern used by all existing modals |
| Toast notifications | Custom toast | `showToast(message, type)` from utils.js | Already imported in both files |
| Currency display | Custom formatter | `formatCurrency()` from utils.js | Consistent ₱ format across all views |
| Date formatting | Custom formatter | `formatDate()` from utils.js | Consistent date format |
| HTML escaping | Custom escape | `escapeHTML()` from utils.js | XSS prevention — never skip this |
| Status badge CSS | New classes | `getStatusClass()` in procurement.js (extend for RFP statuses) | Consistent badge styling |
| Dept badge | New component | `getDeptBadgeHTML(po)` from components.js | Already handles projects/services distinction |
| Real-time updates | Manual polling | `onSnapshot()` listener pattern | Already standard; cleanup in `listeners` array |

---

## Common Pitfalls

### Pitfall 1: `payment_terms` Free-Text vs Structured Tranches — Legacy POs

**What goes wrong:** Existing POs have `payment_terms` as a string (e.g., `"50% down, 50% on delivery"`). After Phase 65, new POs have `tranches` as an array. Reading `po.tranches` on a legacy PO returns `undefined`.

**Why it happens:** Firestore is schemaless; old documents are not migrated.

**How to avoid:** In all tranche-reading code, use a defensive fallback:
```javascript
const tranches = Array.isArray(po.tranches) && po.tranches.length > 0
    ? po.tranches
    : [{ label: po.payment_terms || 'Full Payment', percentage: 100 }];
```

This applies in: RFP creation modal (tranche selector), PO edit modal (tranche builder pre-fill), and PO document generation (PAYMENT_TERMS template variable).

**Warning signs:** RFP creation modal shows empty tranche dropdown for older POs.

### Pitfall 2: RFP ID Parse with Multi-Segment Project Codes

**What goes wrong:** `project_code` values like `CLMC-ACME-2026001` result in RFP IDs like `RFP-CLMC-ACME-2026001-001`. Splitting on `-` gives 5 parts, not 3.

**Why it happens:** The ID format is `RFP-{project_code}-{seq}` and project codes themselves contain hyphens.

**How to avoid:** Parse sequence number from the LAST segment, not a fixed index:
```javascript
const parts = id.split('-');
const seq = parseInt(parts[parts.length - 1]);
```

**Warning signs:** ID generation returns `RFP-CLMC-001` for a `CLMC-ACME-2026001` project (truncated project code).

### Pitfall 3: `rfps` Listener Not Cleaned Up in `destroy()`

**What goes wrong:** Navigating away from procurement view leaves an `rfps` `onSnapshot` listener active. On return, a second listener is registered — double-rendering and potential state conflicts.

**Why it happens:** Router calls `destroy()` only when switching between views, not tabs. But `init()` is called fresh each time the view is entered.

**How to avoid:** All `onSnapshot` calls in procurement.js must push to the `listeners` array. The `destroy()` function iterates and calls all unsubscribers. Pattern already established for MRF and PO listeners — replicate exactly.

**Warning signs:** Console showing duplicate `[Procurement]` log entries for rfps snapshots.

### Pitfall 4: `rfps` Security Rules Not Deployed Before First Write

**What goes wrong:** Even Super Admin gets "Missing or insufficient permissions" error when calling `addDoc(collection(db, 'rfps'), ...)`.

**Why it happens:** Firestore defaults to deny-all. Rules must exist before any access — this is documented in STATE.md as a recurring issue.

**How to avoid:** Include the `rfps` security rules block in the same git commit and deploy as the plan that contains the first `addDoc` to `rfps`. Typically this means rules go in Plan 1 (tranche builder + rules setup) with the first write happening in Plan 2 (RFP creation), but the safest approach is to include rules in whatever plan contains the first `addDoc`.

**Warning signs:** "Missing or insufficient permissions" in browser console on RFP Submit.

### Pitfall 5: Payables Tab Filter Applies to `rfpsData` Not Firestore Query

**What goes wrong:** Building a Firestore query with `where('status', '==', 'Pending')` — but `status` is never stored in Firestore.

**Why it happens:** Status is derived client-side. Firestore has no `status` field to query against.

**How to avoid:** Payables tab loads ALL `rfps` via `onSnapshot` (no status filter in the query). Client-side filter applies `deriveRFPStatus(rfp)` to each record before rendering:
```javascript
let displayed = rfpsData;
if (statusFilter !== '') {
    displayed = displayed.filter(r => deriveRFPStatus(r) === statusFilter);
}
if (deptFilter !== '') {
    displayed = displayed.filter(r => {
        const dept = r.service_code ? 'services' : 'projects';
        return dept === deptFilter;
    });
}
```

**Warning signs:** Filter dropdown does nothing / Firestore compound query errors.

### Pitfall 6: `arrayUnion` Not Re-exported from `firebase.js`

**What goes wrong:** `arrayUnion` is used to append to `payment_records` but throws "arrayUnion is not a function" at runtime.

**Why it happens:** `app/firebase.js` re-exports specific Firebase functions. If `arrayUnion` is not in the re-export list, it won't be available to view files that import from `../firebase.js`.

**How to avoid:** Check `app/firebase.js` for existing `arrayUnion` export before assuming it's available. Add it to both the import and export if missing.

**Warning signs:** TypeError at payment record submission.

### Pitfall 7: `tranches` Validation Allows Save When Total ≠ 100%

**What goes wrong:** PO save proceeds despite tranche percentages summing to 80% or 120%.

**Why it happens:** Save button disable relies on JS event-driven state — if the user bypasses the UI (e.g., keyboard shortcut to click disabled button via screen reader) or the recalculate function has a bug.

**How to avoid:** Double-validate inside the save function itself (not just in the UI):
```javascript
async function savePODocumentFields(poId) {
    const tranches = readTranchesFromDOM(poId);
    const total = tranches.reduce((s, t) => s + t.percentage, 0);
    if (Math.abs(total - 100) > 0.01) {
        showToast('Tranches must total exactly 100%', 'error');
        return;
    }
    // ... proceed with updateDoc
}
```

---

## Code Examples

### RFP Document Shape (Firestore write)

```javascript
// Source: CONTEXT.md RFP Data Structure + UI-SPEC
const rfpDoc = {
    rfp_id: 'RFP-CLMC-ACME-2026001-001',  // generated via custom inline generator
    po_id: 'PO-2026-001',                   // po_id string (not docId)
    po_doc_id: poDocId,                     // Firestore docId of the PO
    mrf_id: po.mrf_id,
    project_code: po.project_code || '',
    service_code: po.service_code || '',
    supplier_name: po.supplier_name,
    tranche_label: selectedTranche.label,
    tranche_percentage: selectedTranche.percentage,
    amount_requested: trancheAmount,        // percentage/100 * po.total_amount
    invoice_number: invoiceNumber,
    due_date: dueDate,                      // YYYY-MM-DD string
    payment_records: [],                    // empty array at creation
    date_submitted: serverTimestamp()
    // NO status field — derived at render time
};
```

### Payment Record Shape (appended via arrayUnion)

```javascript
// Source: CONTEXT.md + UI-SPEC Record Payment modal
const paymentRecord = {
    payment_id: `PAY-${Date.now()}`,   // local unique ID (not a Firestore doc)
    amount: trancheAmount,              // read-only, full tranche amount
    date: paymentDate,                  // YYYY-MM-DD string from date input
    method: paymentMethod,              // 'Bank Transfer' | 'Check' | etc.
    method_other: methodOther || '',    // filled when method === 'Other'
    reference: referenceNumber || '',
    status: 'active',                   // 'active' | 'voided'
    recorded_at: new Date().toISOString()
};

await updateDoc(doc(db, 'rfps', rfpDocId), {
    payment_records: arrayUnion(paymentRecord)
});
```

### Void Payment (arrayRemove + re-add)

Because `arrayUnion`/`arrayRemove` match by value equality, and payment records are objects, updating a record's `status` to `voided` cannot use `arrayRemove` directly on the old object. Use a full array replace:

```javascript
// Correct void pattern — read-modify-write
async function voidPaymentRecord(rfpDocId, paymentId) {
    if (!confirm('Void this payment record? This cannot be undone.')) return;
    const rfpRef = doc(db, 'rfps', rfpDocId);
    const snap = await getDoc(rfpRef);
    const records = snap.data().payment_records || [];
    const updated = records.map(r =>
        r.payment_id === paymentId ? { ...r, status: 'voided' } : r
    );
    await updateDoc(rfpRef, { payment_records: updated });
    showToast('Payment record voided', 'success');
}
```

### Tranche Builder HTML Template

```javascript
// Source: UI-SPEC Tranche Builder component
function renderTrancheBuilder(tranches, poId) {
    const rows = tranches.map((t, i) => `
        <div class="tranche-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
            <input type="text" class="form-control tranche-label"
                   placeholder="Label" value="${escapeHTML(t.label)}"
                   style="flex:0 0 65%;" oninput="recalculateTranches('${poId}')">
            <input type="number" class="form-control tranche-pct"
                   placeholder="%" value="${t.percentage}" min="0" max="100" step="0.01"
                   style="flex:0 0 25%;" oninput="recalculateTranches('${poId}')">
            <button type="button" class="icon-btn" aria-label="Remove tranche"
                    onclick="removeTranche(this, '${poId}')"
                    style="flex:0 0 10%;"
                    ${tranches.length === 1 ? 'disabled' : ''}>×</button>
        </div>
    `).join('');
    return `
        <div id="trancheBuilder_${poId}">
            ${rows}
        </div>
        <button type="button" class="btn btn-outline btn-sm"
                onclick="addTranche('${poId}')">+ Add Tranche</button>
        <div id="trancheTotal_${poId}" style="font-size:0.875rem;font-weight:600;margin-top:8px;">
            Total: <span id="trancheTotalValue_${poId}">100</span>% / 100%
        </div>
    `;
}
```

### Payables Tab in Finance render()

```javascript
// Add to tab nav (after line 697 in finance.js):
<a href="#/finance/payables" class="tab-btn ${activeTab === 'payables' ? 'active' : ''}">
    Payables
</a>

// Add section (after projects-section closing tag):
<section id="payables-section" class="section ${activeTab === 'payables' ? 'active' : ''}">
    <!-- filter bar, table, modals -->
</section>
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| `payment_terms` as free-text string on POs | `tranches` as `[{ label, percentage }]` array | Breaking schema change; backward compat via fallback read |
| No payment tracking | `rfps` collection with `payment_records` array | New collection; dedicated Firestore listener needed |
| Finance has 3 tabs (Approvals, POs, Projects) | Finance has 4 tabs (+ Payables) | Route `#/finance/payables` added |
| PO ID cell is plain text link | PO ID cell has payment fill background | CSS `position:relative` + absolute child div |

**Deprecated/outdated:**

- `po.payment_terms` (string): Replaced by `po.tranches` (array). Old field retained for backward compat on PO document print template only — read defensively.

---

## Open Questions

1. **`arrayUnion` availability in `app/firebase.js`**
   - What we know: `firebase.js` re-exports specific Firestore functions; existing imports include `updateDoc`, `addDoc`
   - What's unclear: Whether `arrayUnion` is currently re-exported (file not fully read)
   - Recommendation: Executor must check the top of `app/firebase.js` and add `arrayUnion` to both import and export if absent — this is a Wave 0 task

2. **PO Tracking table column count for `colspan`**
   - What we know: Current PO row (line 4793) has 8 columns: PO ID, Supplier, Project, Amount, Date, Status, Proof, Actions
   - What's unclear: Whether this column count changes in Phase 65 (a payment fill column is NOT added — the fill is in the existing PO ID cell)
   - Recommendation: Use `colspan="8"` in Payables history rows within finance.js; `colspan` does not apply to procurement.js PO Tracking since no expandable rows are added there

3. **`service_code` on RFP documents**
   - What we know: POs carry both `project_code` and `service_code` fields (from MRF data at PO creation, lines 3872–3874 procurement.js); the RFP document needs the dept badge to display correctly in Payables tab
   - What's unclear: Whether `po.service_code` is always populated for service POs
   - Recommendation: Copy both `project_code` and `service_code` from the PO to the RFP document at creation time; Payables dept filter uses `rfp.service_code ? 'services' : 'projects'`

---

## Validation Architecture

`nyquist_validation` key is absent from `.planning/config.json` — treating as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — zero-build static SPA, no test runner configured |
| Config file | None |
| Quick run command | Manual: `python -m http.server 8000` then browser DevTools |
| Full suite command | Manual browser testing per checklist |

This project has no automated test framework (per CLAUDE.md: "No build, test, or lint commands"). All validation is manual.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Manual Steps |
|--------|----------|-----------|-------------------|-------------|
| RFP-01 | Right-click PO row opens context menu → RFP modal | Manual | None | Right-click any PO row in Procurement > PO Tracking; verify modal pre-fills correctly; submit RFP; verify `rfps` doc in Firestore |
| RFP-02 | Finance Payables tab lists all RFPs | Manual | None | Navigate to Finance > Payables; verify rows appear; check column data matches Firestore |
| RFP-03 | Finance records payment against RFP | Manual | None | Click "Record Payment"; submit; verify `payment_records` array updated in Firestore |
| RFP-04 | Status auto-derives (never manually set) | Manual | None | Verify no `status` field in Firestore rfps doc; verify badge reflects sum of non-voided payments |
| RFP-05 | Overdue indicator for past-due unpaid RFPs | Manual | None | Set `due_date` to yesterday in test RFP; verify Overdue badge + red row tint |
| RFP-06 | PO ID payment fill visible in Procurement | Manual | None | After submitting RFP, verify PO ID cell shows orange fill; after payment recorded, verify green fill |

### Sampling Rate

- Per task completion: Manual smoke test for the task's feature area in browser
- Per wave merge: Full manual checklist covering all 6 requirements
- Phase gate: All 6 requirements manually verified before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] Verify `arrayUnion` is exported from `app/firebase.js` — if not, add before any other plan proceeds
- [ ] Verify `app/views/procurement.js` imports `query`, `where`, `getDocs` — needed for custom RFP ID generator (likely already imported, confirm)

*(No test files to create — project has no automated test infrastructure)*

---

## Sources

### Primary (HIGH confidence — directly read from source files)

- `app/views/procurement.js` (3761 lines) — oncontextmenu pattern (line 3584), PO row render (line 4793), payment_terms locations (lines 5339, 6287, 6327, 6344, 6390, 6418), listener management pattern
- `app/views/finance.js` (1077 lines) — tab structure (lines 680–701), attachWindowFunctions pattern, import list
- `firestore.rules` — security rule template and existing role definitions
- `app/utils.js` — `generateSequentialId()` implementation (lines 173–198), confirming it's year-based and NOT usable for RFP IDs
- `.planning/phases/65-rfp-payables-tracking/65-CONTEXT.md` — all locked decisions
- `.planning/phases/65-rfp-payables-tracking/65-UI-SPEC.md` — component inventory, color tokens, interaction contracts, executor notes
- `CLAUDE.md` — DOM patterns, Firebase listener management, window function requirements

### Secondary (MEDIUM confidence — inferred from patterns, not every line verified)

- `app/firebase.js` re-export pattern — verified by import lines in finance.js and procurement.js; exact `arrayUnion` presence not confirmed (flagged as Open Question)
- `pos` document `project_code` / `service_code` fields — verified indirectly via procurement.js lines 3872–3874

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new libraries, all existing
- Architecture patterns: HIGH — verified directly from source files
- Pitfalls: HIGH — several are documented in STATE.md / CLAUDE.md from prior milestones
- Security rules: HIGH — template is in firestore.rules header; roles are well-defined

**Research date:** 2026-03-18
**Valid until:** 2026-04-17 (stable codebase, no external dependencies changing)
