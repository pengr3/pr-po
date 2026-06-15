# Phase 67: Extend TR Proof, Badges, and RFP Features to PO Column - Research

**Researched:** 2026-03-24
**Domain:** Vanilla JS inline HTML rendering, Firestore schema extension, proof modal reuse, RFP payment tracking
**Confidence:** HIGH

## Summary

Phases 64, 65, 65.x, and 66 built a rich set of features for Purchase Orders (POs) in the MRF Records table: proof-of-procurement indicators (green dot / orange dash / empty circle), payment progress bars below PO badge pills, and right-click context menus to submit Requests for Payment (RFPs). Transport Requests (TRs) appear in the same MRF Records table, but they received none of these features. Currently, TR rows show a plain `status-badge` chip in the PRs column (finance status only), with dashes in the POs, Proof, and Procurement Status columns.

Phase 67's purpose is to bring TR display up to parity with PO display in the same table. There are three distinct feature surfaces to extend: (1) proof indicators on TR badges so procurement can attach proof of transport completion, (2) payment progress bars below TR badges driven by RFP data keyed to `tr_id` instead of `po_id`, and (3) right-click context menu on TR badges to open RFP creation modal for transport-linked payments.

The changes are confined almost entirely to `app/views/procurement.js`. Two key architectural decisions must be made before planning: (a) whether `rfps` collection supports `tr_id`-keyed documents in addition to `po_id`-keyed, or uses a unified `linked_id` field; and (b) whether `proof-modal.js` is extended to handle TR documents alongside PO documents, or a separate `saveProofUrl` variant is created for TRs. Both questions have clear answers based on the existing code.

**Primary recommendation:** Store TR proof on `transport_requests` documents using the same `proof_url` / `proof_remarks` / `proof_attached_at` fields POs use. Extend `proof-modal.js` to accept a `collection` parameter so the same modal saves to either `pos` or `transport_requests`. For RFPs linked to TRs, add a `tr_id` field to `rfps` documents (alongside the existing `po_id` field) and build a parallel `rfpsByTR` lookup map. All TR payment progress bars reuse `getPOPaymentFill()` logic via a new `getTRPaymentFill()` function.

## Standard Stack

No new libraries. This is a pure JavaScript/Firestore change within the existing zero-build system.

### Core
| Component | Current | Extended To |
|-----------|---------|-------------|
| `proof-modal.js` | Saves to `pos` collection | Extended to accept `collectionName` param — saves to `transport_requests` when `'transport_requests'` is passed |
| `rfpsData` / `rfpsByPO` | Module-level state in `procurement.js` | Add `rfpsByTR` parallel map keyed by `tr_id` |
| `getPOPaymentFill(poId)` | PO-specific payment fill computation | Add `getTRPaymentFill(trId)` with same logic, using `rfpsByTR` |
| `showRFPContextMenu` | PO-only right-click menu | Extend with `type` param (`'po'` or `'tr'`) or create `showTRRFPContextMenu` |
| `openRFPModal` | Opens RFP creation modal pre-filled with PO data | Add `openTRRFPModal(trDocId)` pre-filled with TR data |

### Supporting
| Component | Purpose |
|-----------|---------|
| `getStatusClass(status)` from `app/utils.js` | Already used for TR badge finance status — no change needed |
| `escapeHTML(str)` from `app/utils.js` | Already used everywhere — no change |
| Firestore `transport_requests` collection | Gets `proof_url`, `proof_remarks`, `proof_attached_at` fields added to existing docs |
| Firestore `rfps` collection | Gets `tr_id` field alongside existing `po_id` field on TR-linked documents |

**Installation:** None — zero-build system, no npm changes.

## Architecture Patterns

### Recommended Project Structure (No Change)
The phase modifies only `app/views/procurement.js` and `app/proof-modal.js`. No new files required.

### Pattern 1: Proof Modal Collection Generalization

**What:** `proof-modal.js` currently hardcodes `doc(db, 'pos', poId)` in `saveProofUrl`. Extend the signature to accept `collectionName` with a default of `'pos'`.

**When to use:** Whenever proof is attached to a TR instead of a PO.

**Current signature:**
```javascript
// app/proof-modal.js (line 100)
export async function saveProofUrl(poId, url, isFirstAttach = true, remarks = '', onSaved = null)
```

**Extended signature:**
```javascript
export async function saveProofUrl(
    docId,
    url,
    isFirstAttach = true,
    remarks = '',
    onSaved = null,
    collectionName = 'pos'   // NEW — pass 'transport_requests' for TRs
)
```

**saveProofUrl body change (one line):**
```javascript
// Before
const poRef = doc(db, 'pos', poId);
// After
const poRef = doc(db, collectionName, docId);
```

`showProofModal` must also thread `collectionName` through to its internal `saveProofUrl` call.

### Pattern 2: rfpsByTR Parallel Lookup Map

**What:** The existing `rfpsByPO` map is populated by the rfps `onSnapshot` in `loadPOTracking`. Add a parallel `rfpsByTR` map populated in the same snapshot handler.

**Where:** `procurement.js` module-level state (around line 62) and the `onSnapshot` handler (around line 5102).

**Code addition — module-level state (line ~62):**
```javascript
let rfpsByTR = {};   // { tr_id: [rfp, rfp, ...] } for O(1) lookup per TR row
```

**Code addition — inside rfps onSnapshot (line ~5104-5110):**
```javascript
rfpsData = [];
rfpsByPO = {};
rfpsByTR = {};   // ADD THIS
snapshot.forEach(docSnap => {
    const rfp = { id: docSnap.id, ...docSnap.data() };
    rfpsData.push(rfp);
    const poId = rfp.po_id;
    if (poId) {
        if (!rfpsByPO[poId]) rfpsByPO[poId] = [];
        rfpsByPO[poId].push(rfp);
    }
    const trId = rfp.tr_id;   // ADD THIS BLOCK
    if (trId) {
        if (!rfpsByTR[trId]) rfpsByTR[trId] = [];
        rfpsByTR[trId].push(rfp);
    }
});
```

### Pattern 3: getTRPaymentFill — Mirrors getPOPaymentFill

**What:** New function that computes payment fill data for a TR, using `rfpsByTR[trId]` and the TR's `total_amount`.

**Signature:**
```javascript
/**
 * Compute fill data for a TR ID cell based on RFP payment status.
 * @param {string} trId - TR ID string (e.g. "TR-2026-001")
 * @param {number} trTotalAmount - TR total_amount for percentage calculation
 * @returns {{ pct: number, color: string, tooltip: string }}
 */
function getTRPaymentFill(trId, trTotalAmount) {
    const rfps = rfpsByTR[trId] || [];
    if (rfps.length === 0) {
        return { pct: 0, color: '#f8d7da', tooltip: 'No payment requests submitted' };
    }
    let totalPaidAllRFPs = 0;
    let allFullyPaid = true;
    for (const rfp of rfps) {
        const paid = (rfp.payment_records || [])
            .filter(r => r.status !== 'voided')
            .reduce((s, r) => s + (r.amount || 0), 0);
        totalPaidAllRFPs += paid;
        if (paid < rfp.amount_requested) allFullyPaid = false;
    }
    if (allFullyPaid && rfps.length > 0) {
        return { pct: 100, color: '#d4edda', tooltip: `Fully paid: ${formatCurrency(totalPaidAllRFPs)}` };
    }
    const trTotal = parseFloat(trTotalAmount) || 0;
    const percentPaid = trTotal > 0 ? Math.min(100, Math.round((totalPaidAllRFPs / trTotal) * 100)) : 0;
    const balance = trTotal - totalPaidAllRFPs;
    return {
        pct: percentPaid,
        color: '#fff3cd',
        tooltip: `Paid: ${formatCurrency(totalPaidAllRFPs)} | Balance: ${formatCurrency(balance)} | ${percentPaid}% complete`
    };
}
```

Note: `trDataArray` entries currently only carry `{ docId, tr_id, finance_status }`. To compute payment fill, `total_amount` must also be stored in `trDataArray`. This requires updating the Firestore fetch at lines ~3757 and ~3827 to include `total_amount`.

### Pattern 4: TR Badge with Proof Indicator and Progress Bar

**What:** The TR badge in `prHtml` (the PRs column for Transport-type rows) is extended to show: (a) a proof indicator circle next to the badge, (b) a progress bar below the badge, and (c) a right-click context menu for RFP submission.

**Current rendering (line ~4053-4062 for Transport type):**
```javascript
prHtml = trDataArray.map((tr, i) => {
    const statusClass = getStatusClass(tr.finance_status || 'Pending');
    return `<div style="${rowStyle(i)}">
        <span class="status-badge ${statusClass}"
            style="font-size: 0.75rem; display: inline-block; white-space: nowrap; cursor: pointer;"
            onclick="window.viewTRDetails('${tr.docId}')">
            ${escapeHTML(tr.tr_id)}
        </span>
    </div>`;
}).join('');
```

**Target rendering pattern (mirrors Phase 66 PO column pattern):**
```javascript
prHtml = trDataArray.map((tr, i) => {
    const statusClass = getStatusClass(tr.finance_status || 'Pending');
    const fillData = getTRPaymentFill(tr.tr_id, tr.total_amount);
    const hasProof = !!tr.proof_url;
    const hasRemarks = !!tr.proof_remarks;
    // Proof indicator
    let proofDot;
    if (hasProof) {
        proofDot = `<span class="proof-indicator proof-filled" ...onclick open URL...></span>`;
    } else if (hasRemarks) {
        proofDot = `<span class="proof-indicator proof-remarks" ...onclick showProofModal for TR...></span>`;
    } else {
        proofDot = `<span class="proof-indicator proof-empty" ...onclick showProofModal for TR...></span>`;
    }
    return `<div style="${rowStyle(i)}; align-items: center; gap: 4px;">
        <span style="display:inline-flex;flex-direction:column;align-items:stretch;vertical-align:middle;gap:2px;">
            <span class="status-badge ${statusClass}"
                style="font-size:0.75rem;display:inline-block;white-space:nowrap;cursor:pointer;"
                title="${escapeHTML(fillData.tooltip)}"
                onclick="window.viewTRDetails('${tr.docId}')"
                oncontextmenu="event.preventDefault(); window.showTRRFPContextMenu(event, '${tr.docId}'); return false;">
                ${escapeHTML(tr.tr_id)}
            </span>
            <div style="width:100%;height:3px;border-radius:2px;background:#e5e7eb;overflow:hidden;">
                <div style="height:100%;width:${fillData.pct}%;background:${fillData.color};transition:width 0.4s ease;"></div>
            </div>
        </span>
        ${proofDot}
    </div>`;
}).join('');
```

**Key differences from PO rendering:**
- TR badge uses `<span>` not `<a>` (TRs are not clickable links, they open a modal via `onclick`)
- Left-click opens `viewTRDetails` (existing); right-click opens TR RFP context menu (new)
- Proof indicator appears inline next to the badge (same position as Proof column for POs)
- Progress bar is a 3px flush bar below the badge (same Phase 66 pattern)

### Pattern 5: TR Proof Column Entry (proofHtml for Transport Type)

**What:** Currently `proofHtml` defaults to `'-'` for all non-Material MRFs. For Transport-type MRFs, the Proof column should show proof indicators for TRs.

**Current code (line 4066-4108):**
```javascript
let proofHtml = '<span style="color: #999; font-size: 0.875rem;">-</span>';
if (type === 'Material' && prDataArray.length > 0) { /* ... */ }
```

**Extension:**
```javascript
// After the Material block:
if (type === 'Transport' && trDataArray.length > 0) {
    proofHtml = trDataArray.map((tr, i) => {
        const hasProof = !!tr.proof_url;
        const hasRemarks = !!tr.proof_remarks;
        // Same three-state proof indicator as PO proof column
        // onclick calls showProofModal(tr.docId, ..., ..., ..., ..., 'transport_requests')
    }).join('');
}
```

This is the standalone Proof column — separate from the inline proof dot next to the badge in prHtml. The planner must decide: show proof in BOTH the badge row (inline dot) AND the Proof column, OR only in the Proof column (to avoid duplication). Recommendation: mirror PO pattern — proof indicator appears in the Proof column only, and the TR badge row shows just the progress bar (no inline dot). This keeps TR and PO columns visually consistent.

### Pattern 6: RFP Modal for TRs

**What:** `openRFPModal(poDocId)` queries `pos` and `rfps` collections to pre-fill the RFP creation modal. A parallel `openTRRFPModal(trDocId)` queries `transport_requests` and `rfps` to pre-fill for a TR.

**Key differences from PO RFP modal:**
- Source collection: `transport_requests` instead of `pos`
- Document ID field: `tr_id` instead of `po_id` on the RFP being created
- RFP ID generation: uses TR ID as the scope key — e.g., `RFP-TR-2026-001-1` (following the PO-scoped ID pattern from Phase 65.4)
- RFP Firestore document: `{ tr_id: tr.tr_id, po_id: null or absent, ... }`

**RFP ID generation for TRs:**
Phase 65.4 changed RFP IDs to `RFP-{PO-ID}-{n}` (e.g. `RFP-PO-2026-001-1`). For TRs, the equivalent is `RFP-{TR-ID}-{n}` (e.g. `RFP-TR-2026-001-1`). The existing counter queries `rfps` where `po_id == poId` — the TR equivalent queries `rfps` where `tr_id == trId`.

### Anti-Patterns to Avoid

- **Reusing `po_id` field for TRs in rfps documents:** Do not store `tr_id` as the value of `po_id`. The Finance payables view filters and renders based on `rfp.po_id`. TR-linked RFPs must use a separate `tr_id` field, and the Finance view may need to be updated to handle TR-linked RFPs.
- **Modifying `proof-modal.js` to import from `procurement.js`:** Circular dependency. Keep proof-modal.js as a pure utility — pass the collection name as a parameter, not as a view-specific import.
- **Forgetting to update `_prpoSubDataCache` structure:** The cache at line 3841 stores `trDataArray` entries with only `{ docId, tr_id, finance_status }`. If `total_amount` and `proof_url`/`proof_remarks` are needed for rendering, they must be added to the cache entry at fetch time (lines 3757-3761 and 3827-3831).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Payment percentage calculation | Custom TR payment math | Copy `getPOPaymentFill` logic as `getTRPaymentFill` — same arithmetic, different lookup map |
| Proof URL validation | Custom validation | Reuse existing proof-modal.js validation (`url.startsWith('https://')`) |
| Proof save to Firestore | Direct `updateDoc` in TR rendering code | Extend `saveProofUrl(docId, url, ..., 'transport_requests')` in proof-modal.js |
| RFP ID counter for TRs | New counter system | Reuse inline counter pattern from Phase 65.4 — query `rfps` where `tr_id == trId`, find max suffix |
| Proof indicator HTML | New indicator components | Reuse the three-state indicator HTML pattern already in the PO proof column (lines 4076-4100) |
| Context menu for TR | Separate implementation | Mirror `showRFPContextMenu` as `showTRRFPContextMenu` — same structure, different modal call |

**Key insight:** This entire phase is extension by composition. Every feature being added has an exact PO analog already implemented. Copy the PO pattern, substitute `tr_id` for `po_id`, `transport_requests` for `pos`, `rfpsByTR` for `rfpsByPO`, and `getTRPaymentFill` for `getPOPaymentFill`.

## Common Pitfalls

### Pitfall 1: trDataArray Missing Fields
**What goes wrong:** `trDataArray` entries (built at lines 3757-3761 and 3827-3831) only carry `{ docId, tr_id, finance_status }`. The rendering code for proof and progress bar also needs `proof_url`, `proof_remarks`, and `total_amount`. If these fields are not added to the Firestore fetch and cache entry, the proof indicator renders incorrectly and `getTRPaymentFill` receives undefined total.
**How to avoid:** Update the TR fetch blocks (both the Transport-type block and the Material+TR block) to capture `total_amount`, `proof_url`, and `proof_remarks`. Update the `_prpoSubDataCache` write at line 3841 — the cache already stores `trDataArray`, so the fields propagate automatically once they're added to the push objects.
**Warning signs:** Proof indicator always shows empty circle; progress bar always 0% even for paid TRs.

### Pitfall 2: Finance View (finance.js) Not Updated for TR-Linked RFPs
**What goes wrong:** `finance.js` renders the Payables tab using `rfp.po_id` to look up PO data. If TR-linked RFPs have `tr_id` but no `po_id`, the Finance view will show blank supplier/amount data for TR RFPs.
**How to avoid:** Before adding TR RFP creation, audit how `finance.js` uses `rfp.po_id`. Either (a) always write a nullable `po_id: null` on TR RFPs and guard the display, or (b) add `tr_id` support to `renderRFPTable` in `finance.js` so TR-linked RFPs display TR metadata.
**Warning signs:** TR-linked RFPs appear in Finance payables with empty supplier or N/A amount.

### Pitfall 3: rfpsByTR Not Populated Before MRF Records Render
**What goes wrong:** The `rfpsByTR` map is populated inside `loadPOTracking()` (the PO Tracking tab initializer). If the user navigates directly to MRF Records without visiting the PO Tracking tab first, `rfpsByTR` is empty and all TR progress bars show 0%.
**How to avoid:** Check how `rfpsByPO` is populated for MRF Records. Currently the rfps `onSnapshot` is in `loadPOTracking`. If MRF Records renders before PO Tracking is initialized, `rfpsByPO` is also empty — but this issue exists for POs already. The existing pattern is acceptable (tab initialization loads the listener). Confirm the rfps listener is registered on MRF Records tab init as well, or document that TR payment fill only works after PO Tracking tab is visited. Best fix: move rfps listener registration to a shared `initRFPListener()` helper called from both tab inits.
**Warning signs:** TR progress bars always empty on first page load; become correct after visiting PO Tracking tab.

### Pitfall 4: Proof Modal Collection Routing
**What goes wrong:** `proof-modal.js` registers `window.showProofModal = showProofModal`. The TR proof indicator's `onclick` calls `window.showProofModal(tr.docId, ...)`. If `showProofModal` doesn't route the save to `transport_requests`, proof is saved to `pos` with the TR docId, corrupting PO data.
**How to avoid:** Add `collectionName` as the last parameter of both `showProofModal` and `saveProofUrl`. The TR proof indicator's onclick must pass `'transport_requests'` explicitly. The PO proof indicators must pass `'pos'` (or rely on the default).
**Warning signs:** Clicking "Attach Proof" on a TR updates the wrong Firestore document.

### Pitfall 5: RFP Right-Click on TR Badge in Material+TR Mixed Rows
**What goes wrong:** Material MRFs with transport items (mixed rows) render TR badges appended to `prHtml` (lines 4111-4123). These TR badges currently use `onclick="window.viewTRDetails()"` only. Adding `oncontextmenu` for RFP to these badges must not conflict with the PO `oncontextmenu` handler on the same row's PO column.
**How to avoid:** The context menu handlers are separate functions (`showRFPContextMenu` for POs, `showTRRFPContextMenu` for TRs) and are scoped to their respective `<a>` or `<span>` elements. No conflict risk as long as they are not both placed on the same DOM element.

## Code Examples

### Current TR data fetch (lines 3754-3765) — must be extended
```javascript
// Source: app/views/procurement.js lines ~3754-3765
trSnapshot.forEach((docSnap) => {
    const trData = docSnap.data();
    trDataArray.push({
        docId: docSnap.id,
        tr_id: trData.tr_id || '',
        finance_status: trData.finance_status || 'Pending'
        // MISSING: total_amount, proof_url, proof_remarks
    });
    trCost = parseFloat(trData.total_amount || 0);
    trFinanceStatus = trData.finance_status || 'Pending';
});
```

**Target:**
```javascript
trSnapshot.forEach((docSnap) => {
    const trData = docSnap.data();
    trDataArray.push({
        docId: docSnap.id,
        tr_id: trData.tr_id || '',
        finance_status: trData.finance_status || 'Pending',
        total_amount: parseFloat(trData.total_amount || 0),  // NEW
        proof_url: trData.proof_url || '',                    // NEW
        proof_remarks: trData.proof_remarks || ''             // NEW
    });
    trCost = parseFloat(trData.total_amount || 0);
    trFinanceStatus = trData.finance_status || 'Pending';
});
```

### rfpsByTR map population (inside rfps onSnapshot, lines ~5103-5110)
```javascript
// Source: app/views/procurement.js lines ~5103-5110
rfpsData = [];
rfpsByPO = {};
rfpsByTR = {};  // NEW
snapshot.forEach(docSnap => {
    const rfp = { id: docSnap.id, ...docSnap.data() };
    rfpsData.push(rfp);
    const poId = rfp.po_id;
    if (poId) {
        if (!rfpsByPO[poId]) rfpsByPO[poId] = [];
        rfpsByPO[poId].push(rfp);
    }
    const trId = rfp.tr_id;  // NEW
    if (trId) {               // NEW
        if (!rfpsByTR[trId]) rfpsByTR[trId] = [];  // NEW
        rfpsByTR[trId].push(rfp);                   // NEW
    }
});
```

### proof-modal.js saveProofUrl extended signature
```javascript
// Source: app/proof-modal.js line ~100
export async function saveProofUrl(
    docId,
    url,
    isFirstAttach = true,
    remarks = '',
    onSaved = null,
    collectionName = 'pos'   // NEW
) {
    try {
        const ref = doc(db, collectionName, docId);  // CHANGED
        // ... rest unchanged
    }
}
```

### Firestore Security Rules — no changes needed
`transport_requests` already has security rules. The new `proof_url`, `proof_remarks`, `proof_attached_at`, `proof_updated_at` fields are plain string/timestamp writes on existing documents. No new collection, no new rules needed.

`rfps` already has security rules. TR-linked RFPs are the same document structure, just with a `tr_id` field added. No new rules needed.

## State of the Art

| Feature | PO (Current) | TR (Phase 67 Target) |
|---------|-------------|---------------------|
| Proof indicator | 3-state circle in Proof column | 3-state circle in Proof column (for Transport MRFs) |
| Proof storage | `proof_url`, `proof_remarks` on `pos` docs | `proof_url`, `proof_remarks` on `transport_requests` docs |
| Payment progress bar | 3px bar below PO badge pill | 3px bar below TR badge pill |
| RFP right-click | `showRFPContextMenu` → `openRFPModal` | `showTRRFPContextMenu` → `openTRRFPModal` |
| RFP ID format | `RFP-PO-2026-001-1` | `RFP-TR-2026-001-1` |
| Finance payables | RFP keyed by `po_id` | TR RFPs keyed by `tr_id` — Finance view needs guard |

## Open Questions

1. **Should Finance payables tab (finance.js) show TR-linked RFPs?**
   - What we know: `renderRFPTable` in `finance.js` uses `rfp.po_id` to look up PO data for display (supplier, amount). If TR RFPs have no `po_id`, they render broken.
   - What's unclear: Whether the user wants TR RFPs visible in Finance payables at all, or only in the MRF Records procurement view.
   - Recommendation: Plan should include a task to audit `finance.js` RFP rendering and add a guard for `rfp.tr_id` case. Even if Finance display of TR RFPs is deferred, the guard prevents broken rows.

2. **Should the rfps listener be moved out of `loadPOTracking`?**
   - What we know: `rfpsByTR` will be populated by the same rfps listener. If MRF Records is loaded without visiting PO Tracking first, `rfpsByTR` is empty.
   - What's unclear: How often users go directly to MRF Records without initializing PO Tracking.
   - Recommendation: Move rfps listener registration to a shared `initRFPListener()` helper called from the Records tab init AND the PO Tracking tab init, deduped by `_rfpListenerActive`.

3. **Inline proof dot in TR badge row vs standalone Proof column?**
   - What we know: PO proof indicators appear only in the Proof column (dedicated column), not inline in the PO badge in the POs column.
   - Recommendation: TR proof indicators should appear in the Proof column only (for Transport-type MRFs). This keeps the PRs column uncluttered and consistent with how POs work.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None — manual browser testing only (zero-build static SPA) |
| Config file | None |
| Quick run command | `python -m http.server 8000` then open browser |
| Full suite command | N/A |

### Phase Requirements to Test Map
| Feature | Behavior | Test Type | Verification |
|---------|----------|-----------|--------------|
| TR proof storage | `proof_url`/`proof_remarks` saved to `transport_requests` doc | manual | Attach proof to a TR, check Firestore |
| TR proof indicator | Proof column shows 3-state indicator for Transport MRFs | manual | Navigate to MRF Records, find Transport MRF, verify Proof column |
| TR progress bar | 3px bar below TR badge shows payment fill percentage | manual | Find Transport MRF with TR-linked RFP, verify bar |
| TR progress bar empty | TR with no RFPs shows empty bar | manual | Find Transport MRF with no RFPs on the TR, verify 0% bar |
| TR right-click RFP | Right-click on TR badge opens RFP creation modal | manual | Right-click TR badge in MRF Records |
| TR RFP creation | RFP saved with `tr_id` field, no `po_id` | manual | Create TR RFP, check Firestore `rfps` collection |
| Finance guard | TR-linked RFPs don't break Finance payables table | manual | Open Finance > Payables, verify no blank rows for TR RFPs |
| Mixed Material+TR rows | TR badges in Material MRF rows retain right-click for TR RFP | manual | Find Material MRF with transport items, right-click TR badge |

### Wave 0 Gaps
None — no test infrastructure exists in this project by design.

## Sources

### Primary (HIGH confidence)
- Direct code read: `app/views/procurement.js` lines 40-62 (module-level state), 260-290 (`getPOPaymentFill`), 3690-3841 (TR/PO data fetch), 3940-4123 (prHtml/poHtml/proofHtml rendering), 4338-4391 (`submitTransportRequest`), 5099-5119 (rfps onSnapshot), 5672-5773 (`viewTRDetails`)
- Direct code read: `app/proof-modal.js` lines 1-120 (full file — modal and saveProofUrl)
- Direct code read: `.planning/REQUIREMENTS.md` (v3.2 requirements — PROOF, RFP, POBAR series)
- Direct code read: `.planning/STATE.md` (all decisions log entries for Phase 64, 65, 65.x, 66)
- Direct code read: `.planning/phases/66-*/66-RESEARCH.md` (Phase 66 exact implementation reference)
- Direct code read: `.planning/phases/66-*/66-01-PLAN.md` (Phase 66 execution plan — progress bar pattern)

### Secondary (MEDIUM confidence)
- Pattern inference: TR extension follows exact PO analog — all patterns derived from existing implemented code

## Metadata

**Confidence breakdown:**
- Current TR rendering: HIGH — read directly from procurement.js
- Proof modal extension pattern: HIGH — proof-modal.js is a simple, fully readable module
- rfpsByTR map approach: HIGH — directly mirrors existing rfpsByPO implementation
- Finance.js impact: MEDIUM — finance.js RFP table was not fully read; TR guard requirement inferred from `rfp.po_id` usage pattern
- RFP ID format for TRs: HIGH — follows Phase 65.4 pattern exactly, substituting tr_id for po_id

**Research date:** 2026-03-24
**Valid until:** Stable — all findings based on direct code reads; no external dependencies
