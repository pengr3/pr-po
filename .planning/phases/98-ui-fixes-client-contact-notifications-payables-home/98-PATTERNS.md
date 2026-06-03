# Phase 98: UI/UX Fixes — Client Contact Split, Notifications Alignment, Payables PO Ref, Home Fit - Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 6 (all edits — no new files)
**Analogs found:** 6 / 6 (this is an all-edits phase; the "analog" for each slice is the existing code being modified, captured verbatim below)

> All four slices are independent and share no structure. Each section below extracts the exact current code at the anchors so the planner can write grep-verifiable acceptance criteria. Line numbers are from the **v3.3 working tree** as read on 2026-06-03.

---

## File Classification

| File | Role | Data Flow | Slice | Closest Analog / Pattern Source | Match Quality |
|------|------|-----------|-------|----------------------------------|---------------|
| `app/views/clients.js` | view (CRUD) | request-response | 1 | itself (in-place edit) + `app/utils.js` `downloadCSV` for D-05 | exact |
| `app/views/notifications.js` | view (render-only) | request-response | 2 | itself — `renderRows()` | exact |
| `styles/components.css` | stylesheet | n/a | 2 | itself — `.notif-row*` rules | exact |
| `app/views/finance.js` | view (CRUD/render) | request-response | 3 | itself + `viewTRDetailsLocal` (mrf-records.js) for D-12 TR route | role-match (TR modal must be ported) |
| `app/views/home.js` | view (render-only) | request-response | 4 | itself — `render()` hero block | exact |
| `styles/hero.css` | stylesheet | n/a | 4 | itself — `.hero-*` / `.dept-cards*` rules | exact |

---

## Shared Patterns (cross-cutting)

### escapeHTML on all displayed values (D-06)
**Source:** `app/utils.js` (imported as `import { ..., escapeHTML } from '../utils.js'`)
Already used pervasively in clients.js, finance.js, notifications.js. New Phone/Email display points (Slice 1) and the new TR/PO ref/detail (Slice 3) MUST wrap user/Firestore values in `escapeHTML(...)`.

### downloadCSV signature (Slice 1 D-05 — only if client export added)
**Source:** `app/utils.js:789`
```javascript
export function downloadCSV(headers, rows, filename) { ... }
// headers: string[]; rows: (string|number|null)[][]; filename: include ".csv"
// Auto-quotes cells containing , " or newline.
```
**⚠ VERIFY-BEFORE-ASSUMING (D-05):** **No client CSV export exists.** Grep of `clients.js` for `csv|downloadCSV|export|exportClients|toCSV` returned **zero matches**. There is no "Export" button in `render()` and no import of `downloadCSV` in clients.js. The shared exporter exists in utils.js but is not wired to clients anywhere. **The planner must treat the CSV surface as ABSENT** — either (a) drop CSV from D-05 scope, or (b) add a brand-new export button + handler (this would be net-new code, not an edit to an existing surface). Confirm with the user before building it.

### Modal plumbing (Slice 1 + Slice 3)
**Source:** `app/components.js` — `createModal`, `openModal`, `closeModal`; `app/utils.js` — `showToast`, `showLoading`.
- clients.js imports: `import { createModal, openModal, closeModal, skeletonTableRows } from '../components.js';`
- finance.js `viewPODetailsFromRFP` already uses this exact plumbing (see Slice 3). The TR-route (D-12) should follow the identical create-container → `createModal` → `openModal` pattern.

---

## Slice 1 — Client Contact Split (`app/views/clients.js`, view/CRUD)

**Analog:** the file itself. Single source for form, list, detail modal, and Firestore writes. Fully read (693 lines).

### A. Form input + label (current single field) — lines 77-80
```javascript
<div class="form-group">
    <label>Contact Details *</label>
    <input type="text" id="newContactDetails" required placeholder="Email, phone, address">
</div>
```
**Split into two inputs:** Phone (`id="newClientPhone"`) + Email (`id="newClientEmail"`). Required marker per D-03 ("at least one"). Keep the `contact_person` field above (lines 73-76) UNCHANGED.

### B. Create handler — read + validate — lines 505-513
```javascript
const client_code = document.getElementById('newClientCode').value.trim().toUpperCase();
const company_name = document.getElementById('newCompanyName').value.trim();
const contact_person = document.getElementById('newContactPerson').value.trim();
const contact_details = document.getElementById('newContactDetails').value.trim();

if (!client_code || !company_name || !contact_person || !contact_details) {
    showToast('Please fill in all fields', 'error');
    return;
}
```
**Rewrite the validation** to: required `client_code`, `company_name`, `contact_person`, plus **at least one of phone/email** (D-03), plus **email-format-if-present** (D-04: blank email OK; non-empty email must be well-formed or block save). Phone has no format check (D-04).

### C. Create handler — Firestore write — lines 524-530
```javascript
await addDoc(collection(db, 'clients'), {
    client_code,
    company_name,
    contact_person,
    contact_details,
    created_at: new Date().toISOString()
});
```
**Replace `contact_details` with `phone` + `email`** (schemaless add, no migration). Decide whether to also keep writing `contact_details` (recommend: drop it on new docs; legacy docs retain theirs untouched per D-02).

### D. Form reset on toggle — lines 491-494 (must add new fields)
```javascript
document.getElementById('newClientCode').value = '';
document.getElementById('newCompanyName').value = '';
document.getElementById('newContactPerson').value = '';
document.getElementById('newContactDetails').value = '';
```
Reset the two new inputs instead of `newContactDetails`; also focus stays on `newClientCode` (line 488).

### E. Edit handler — read + validate — lines 565-573
```javascript
const client_code = document.getElementById('edit-code').value.trim().toUpperCase();
const company_name = document.getElementById('edit-company').value.trim();
const contact_person = document.getElementById('edit-contact').value.trim();
const contact_details = document.getElementById('edit-details').value.trim();

if (!client_code || !company_name || !contact_person || !contact_details) {
    showToast('Please fill in all fields', 'error');
    return;
}
```
Same D-03/D-04 rewrite as the create handler. New inline-edit input ids needed (e.g. `edit-phone`, `edit-email`).

### F. Edit handler — Firestore write — lines 585-591
```javascript
const clientRef = doc(db, 'clients', clientId);
await updateDoc(clientRef, {
    client_code,
    company_name,
    contact_person,
    contact_details,
    updated_at: new Date().toISOString()
});
```
Write `phone` + `email`. (Note: `updateDoc` merges; legacy `contact_details` left in place if not overwritten — consistent with D-02.)

### G. List table header — line 112
```javascript
<th>Contact Details</th>
```
Replace with **two columns** (e.g. `<th>Phone</th><th>Email</th>`) OR one combined "Contact" column — planner's call, but note the **colspan** values used in empty-state (line 410: `colspan="5"`) must be updated if column count changes. Header currently sits in a 5-column table (Client Code / Company / Contact Person / Contact Details / Actions).

### H. List cell — view row — lines 444-445
```javascript
<td>${escapeHTML(client.contact_person)}</td>
<td>${escapeHTML(client.contact_details)}</td>
```
Render `client.phone` / `client.email` with **legacy fallback** (D-02): when phone AND email are both blank, fall back to displaying `client.contact_details` read-only so no legacy info is hidden.

### I. List cell — edit row — line 432
```javascript
<td><input type="text" id="edit-details" value="${escapeHTML(client.contact_details)}" style="width: 100%;"></td>
```
Split into Phone + Email inline inputs, pre-filled from `client.phone` / `client.email`.

### J. Detail modal label/value — lines 258-261
```javascript
<div class="modal-detail-item">
    <span class="modal-detail-label">Contact Details</span>
    <span class="modal-detail-value">${escapeHTML(client.contact_details || '—')}</span>
</div>
```
Replace with separate Phone + Email `.modal-detail-item` blocks (D-05), with legacy `contact_details` fallback (D-02). Follow the exact sibling markup at lines 254-257 (Contact Person item).

### Integration note (Slice 1)
**No `firestore.rules` change needed.** `match /clients/{clientId}` (firestore.rules:285-297) gates create/update/delete by **role only** (`super_admin`, `operations_admin`, `services_admin`) — there is **no field whitelist**, so new `phone`/`email` fields write fine under existing rules.

---

## Slice 2 — Notifications Alignment (`app/views/notifications.js` + `styles/components.css`)

**Analog:** the file itself — `renderRows()`.

### ⚠ BASELINE RECONCILIATION (resolves the CONTEXT working-tree-vs-deploy flag, D-07)
The **v3.3 working-tree `renderRows()` builds a STACKED label-above-message body**, NOT inline rows. This is the live baseline the alignment CSS must target. Structure per row (notifications.js:270-302):
- `.notif-type-badge` (icon square) — flex child 1
- `.notif-row-body` (flex:1) — contains THREE stacked divs: `.notif-row-label` (type label, uppercase, colored) → `.notif-row-message` → `.notif-row-time`
- `.notif-row-mark-read` (✓ button) — flex child 3

Note D-07 says "keep the current inline format." The working tree is **stacked**, so the planner must decide whether D-07's "inline" refers to the dev-deployed screenshot (which differs). **Recommendation:** treat the working tree as the source of truth for what code exists; the fix is to make the label a **fixed-width left column** so message-start-x is constant, and right-align time + ✓. If the user's screenshot shows a single-line inline layout, the markup may need restructuring — flag this as the one decision the plan must lock before writing CSS.

### A. Current `renderRows()` row markup — notifications.js:270-302 (verbatim)
```javascript
return `
    <div class="notif-row ${isUnread ? 'notif-row--unread' : ''}"
         style="display:flex;align-items:flex-start;gap:0.75rem;cursor:pointer;"
         onclick="window.handleNotificationClick('${docId}')">
        <span class="notif-type-badge"
              style="background:${meta.color}15;color:${meta.color};"
              title="${escapeHTML(meta.label)}">
            ${meta.icon}
        </span>
        <div class="notif-row-body" style="flex:1;min-width:0;">
            <div class="notif-row-label"
                 style="font-size:0.7rem;font-weight:600;color:${meta.color};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.2rem;">
                ${escapeHTML(meta.label)}
            </div>
            <div class="notif-row-message"
                 style="font-size:0.875rem;color:#1e293b;line-height:1.4;${isUnread ? 'font-weight:600;' : ''}">
                ${message}
            </div>
            <div class="notif-row-time"
                 style="font-size:0.75rem;color:#64748b;margin-top:0.25rem;"
                 title="${absoluteDate}">
                ${relativeTime}
            </div>
        </div>
        <button class="notif-row-mark-read"
                style="flex-shrink:0;background:none;border:1px solid #e2e8f0;border-radius:4px;padding:0.25rem 0.5rem;font-size:0.75rem;color:#64748b;cursor:pointer;white-space:nowrap;"
                onclick="event.stopPropagation(); window.markNotificationRead('${docId}')"
                aria-label="Mark as read"
                title="Mark as read">
            ✓
        </button>
    </div>
`;
```
> Note: alignment-relevant styling is INLINE on each element (`style="..."`). The planner must decide whether to keep inline styles or move to the `.notif-row*` CSS classes. The fixed-width label column (D-08) is the new piece — applied to `.notif-row-label` (or a wrapping left column if the layout is restructured to inline).
> Container wrapper: `list.innerHTML = `<div class="notif-rows-container">${rowsHtml}</div>`;` (line 305).

### B. `.notif-row*` CSS rules — `styles/components.css`
```css
/* :1952 */ .notif-row { display:flex; align-items:flex-start; gap:0.75rem; padding:0.75rem 1rem;
                          border-bottom:1px solid #f1f5f9; border-left:3px solid transparent;
                          cursor:pointer; transition:background 0.12s ease; }
/* :1963 */ .notif-row:hover { background:#f8fafc; }
/* :1967 */ .notif-row--unread { background:#f8fbff; border-left-color:#1a73e8; }
/* :1972 */ .notif-row--unread:hover { background:#eff6ff; }
/* :1976 */ .notif-type-badge { display:inline-flex; align-items:center; justify-content:center;
                                width:28px; height:28px; border-radius:6px; flex-shrink:0; }
/* :1986 */ .notif-type-badge svg { width:16px; height:16px; stroke:currentColor; fill:none;
                                    stroke-width:1.75; stroke-linecap:round; stroke-linejoin:round; flex-shrink:0; }
/* :1997 */ .notif-row-body { display:flex; align-items:flex-start; gap:0.5rem; flex:1; min-width:0; cursor:pointer; }
/* :2030 */ .notif-row-message { flex:1 1 auto; font-size:0.875rem; color:#1e293b; line-height:1.4;
                                 min-width:0; word-wrap:break-word; overflow-wrap:anywhere; }
/* :2043 */ .notif-row-time { font-size:0.75rem; color:#64748b; flex-shrink:0; white-space:nowrap; }
/* :2135 */ .notif-row-mark-read { background:transparent; border:1px solid transparent; color:#64748b;
                                   cursor:pointer; padding:0.25rem; border-radius:4px; flex-shrink:0; }
/* :2145 */ .notif-row-mark-read:hover { background:#fff; border-color:#e2e8f0; color:#1a73e8; }
```
**No `.notif-row-label` CSS rule exists** — the label is styled purely inline in renderRows (item A). A fixed-width column rule for the label is net-new CSS. Other present-but-unused-by-history-view rules: `.notif-row-content` (:2006), `.notif-row-read-btn` (:2011), and the `.na-*` anatomy block (:2056-2133, Phase 95 — used by the dropdown, NOT this page; do not touch per D-10).
**⚠ Inline-style precedence:** the row markup carries inline `style` attributes that will **override** any class rules. To make CSS-only alignment changes effective, the planner must either remove the conflicting inline styles from renderRows OR apply alignment via the markup. This is the key implementation pitfall for Slice 2.

### C. TYPE_META label set (for fixed-column sizing, D-08) — `app/notifications.js:72-91`
All 16 labels (longest determines the fixed column width):
```
MRF Approved, MRF Rejected, PR Review Needed, TR Review Needed, RFP Review Needed,
Project Status, Project Cost, Registration Pending, Proposal Submitted, Proposal Decided,
New MRF, PR Decision, TR Decision, RFP Paid, PO Delivered, New Collectible
```
**Longest label = "Registration Pending" (20 chars)** → uppercased "REGISTRATION PENDING". (CONTEXT D-08 guessed "PROPOSAL SUBMITTED" = 18 chars, but "Registration Pending" is longer.) Size the fixed label column to fit the 20-char uppercase string at `font-size:0.7rem; letter-spacing:0.04em` (~ 10-11rem / ~150-165px is a safe starting estimate — exact value is Claude's Discretion per CONTEXT). Do NOT change TYPE_META (D-10).

---

## Slice 3 — Payables Ref Link (`app/views/finance.js`, view/CRUD)

**Analog:** the file itself + `viewTRDetailsLocal` from `app/views/mrf-records.js` (TR-route model, D-12).

### ✅ ROOT CAUSE CONFIRMED (resolves D-11 hypothesis — it was a real ID-type mismatch)

`viewPODetailsFromRFP(poDocId)` (finance.js:2836-2937) does:
```javascript
const poDoc = await getDoc(doc(db, 'pos', poDocId));   // expects a Firestore DOC ID
```
The four call sites pass **inconsistent ID types**:

| # | Location | Function | Argument passed | Type | Works? |
|---|----------|----------|-----------------|------|--------|
| 1 | finance.js:707 | `buildRFPCard` (RFP Processing mobile card) | `rfp.po_doc_id \|\| ''` | doc ID | ✅ yes (when populated) |
| 2 | finance.js:819 | `renderRFPTable` (RFP Processing table) | `rfp.po_doc_id \|\| ''` | doc ID | ✅ yes (when populated) |
| 3 | finance.js:996 | `buildPOSummaryCard` (PO Summary mobile card) | `po.poId` | **human-readable po_id** | ❌ **BUG** |
| 4 | finance.js:1162 | `renderPOSummaryTable` (PO Summary table) | `po.poId` | **human-readable po_id** | ❌ **BUG** |

**Why #3/#4 fail:** `po.poId` originates from `buildPOMap` (finance.js:850-875):
```javascript
const groupKey = rfp.po_id || rfp.tr_id || '';   // line 853 — HUMAN-READABLE id
...
poMap.set(groupKey, {
    poId: groupKey,                               // line 862 — poId = "PO-2026-001", NOT a doc ID
    ...
    isTR: !rfp.po_id && !!rfp.tr_id,              // line 868 — row-type discriminator
    rfps: []
});
```
So `getDoc(doc(db,'pos','PO-2026-001'))` looks up a doc whose ID is the human-readable string → not found → `catch` → **"Failed to load PO details"** toast (finance.js:2933). This matches the operator report exactly.

**Authoritative doc-ID source:** RFP docs DO carry the correct doc IDs. RFP creation in `app/views/procurement.js` writes:
- PO-linked RFPs: `po_doc_id: poDocId` (procurement.js:1604, 1817) + `po_id: po.po_id`
- TR-linked RFPs: `tr_doc_id: trDocId` (procurement.js:1718) + `tr_id: tr.tr_id`, with `po_id:''`, `po_doc_id:''`
- The `updateRFP`/save path also persists `po_doc_id` + `tr_doc_id` (procurement.js:751-754).

→ The fix for #3/#4: thread `po_doc_id` (and `tr_doc_id`) from the underlying RFP through `buildPOMap` into the `poEntries` object so the summary call sites pass the **doc ID**, not `po.poId`. (Each PO group's RFPs are in `entry.rfps` — grab `entry.rfps[0].po_doc_id` / `entry.rfps[0].tr_doc_id`.)

### A. `viewPODetailsFromRFP()` definition — finance.js:2836-2937 (fetch shown)
```javascript
async function viewPODetailsFromRFP(poDocId) {
    showLoading(true);
    try {
        const poDoc = await getDoc(doc(db, 'pos', poDocId));   // <-- expects DOC ID
        if (!poDoc.exists()) {
            showToast('PO not found', 'error');
            return;
        }
        const po = { id: poDoc.id, ...poDoc.data() };
        const items = JSON.parse(po.items_json || '[]');
        ...  // builds modal via createModal({ id:'poDetailsModal', ... }), openModal('poDetailsModal')
    } catch (err) {
        console.error('[Finance] viewPODetailsFromRFP error:', err);
        showToast('Failed to load PO details', 'error');   // <-- the operator-reported error
    } finally {
        showLoading(false);
    }
}
```
Window registration: `window.viewPODetailsFromRFP = viewPODetailsFromRFP;` (finance.js:262). Cleanup: `delete window.viewPODetailsFromRFP;` (finance.js:4265).

### B. The four Ref-link call sites + row-type discriminator (D-12)

RFP Processing (gated on `rfp.po_id` → PO, else `rfp.tr_id` → TR, else `-`):
```javascript
// finance.js:706-710 (buildRFPCard)
const poRefDisplay = rfp.po_id
    ? '<a ... onclick="window.viewPODetailsFromRFP(\'' + (rfp.po_doc_id || '') + '\')" ...>' + escapeHTML(rfp.po_id) + '</a>'
    : rfp.tr_id
    ? '<span style="color:#1e293b;font-weight:600;">' + escapeHTML(rfp.tr_id) + '</span>'   // <-- TR currently NOT a link
    : '<span style="color:#999;">-</span>';

// finance.js:818-823 (renderRFPTable) — same branching
<td>${rfp.po_id
    ? `<a ... onclick="window.viewPODetailsFromRFP('${rfp.po_doc_id || ''}')" ...>${escapeHTML(rfp.po_id)}</a>`
    : rfp.tr_id
    ? `<span style="color:#1e293b;font-weight:600;">${escapeHTML(rfp.tr_id)}</span>`         // <-- TR currently NOT a link
    : '<span style="color:#999;">-</span>'
}</td>
```
PO Payment Summary (gated on `po.isTR`):
```javascript
// finance.js:994-996 (buildPOSummaryCard)
const refDisplay = po.isTR
    ? '<span style="font-weight:600;color:#1e293b;">' + escapeHTML(po.poId) + '</span>'        // <-- TR currently NOT a link
    : '<a ... onclick="window.viewPODetailsFromRFP(\'' + po.poId + '\')" ...>' + escapeHTML(po.poId) + '</a>';  // <-- BUG: po.poId is human-readable

// finance.js:1160-1162 (renderPOSummaryTable) — same branching
const refDisplay = po.isTR
    ? `<span style="font-weight:600;color:#1e293b;">${escapeHTML(po.poId)}</span>`             // <-- TR currently NOT a link
    : `<a ... onclick="window.viewPODetailsFromRFP('${po.poId}')" ...>${escapeHTML(po.poId)}</a>`;  // <-- BUG: po.poId is human-readable
```

**Reliable row-type discriminators (Integration Point):**
- **PO-linked:** `rfp.po_id` truthy (RFP Processing) / `!po.isTR` (PO Summary). Doc ID = `rfp.po_doc_id`.
- **TR-linked:** `!rfp.po_id && rfp.tr_id` (RFP Processing) / `po.isTR` i.e. `!rfp.po_id && !!rfp.tr_id` (PO Summary, computed at buildPOMap:868). Doc ID = `rfp.tr_doc_id`.
- **Standalone delivery-fee:** `rfp.tranche_label === 'Delivery Fee'` (see `derivePOSummary` filter at finance.js:889 and procurement.js:766). Per D-12 these should be **plain text, no link** (nothing to open). Note: delivery-fee RFPs typically still carry a `po_doc_id` (they attach to a PO), so the planner must decide whether D-12's "standalone delivery-fee (no PO, no TR)" means truly-unlinked rows or all Delivery-Fee rows — confirm against the data. The truly-unlinked case is `!rfp.po_id && !rfp.tr_id` (current `-` branch).

### C. TR detail modal analog (D-12 TR-route) — `app/views/mrf-records.js:805-871`
```javascript
async function viewTRDetailsLocal(trDocId) {
    showLoading(true);
    try {
        const trDoc = await getDoc(doc(db, 'transport_requests', trDocId));   // <-- expects TR DOC ID
        if (!trDoc.exists()) { showToast('TR not found', 'error'); return; }
        const tr = { id: trDoc.id, ...trDoc.data() };
        const items = JSON.parse(tr.items_json || '[]');
        ... // builds body grid (TR ID / MRF Ref / Supplier / Finance Status / Total / Date) + items table
            // + optional rejection_reason banner
        container.innerHTML = createModal({ id:'mrfRecordsTRModal', title:`Transport Request Details: ${tr.tr_id}`, body, footer:'...Close...', size:'large' });
        openModal('mrfRecordsTRModal');
    } catch (error) {
        console.error('[MRFRecords] Error loading TR details:', error);
        showToast('Failed to load TR details', 'error');
    } finally { showLoading(false); }
}
```

**⚠ Reachability — `window.viewTRDetails` is NOT reliably available on the Finance view:**
- `window.viewTRDetails` is registered ONLY by:
  - mrf-records.js:1812-1813 — conditionally (`if (!window.viewTRDetails) window.viewTRDetails = viewTRDetailsLocal;`)
  - procurement.js:1924 — unconditionally (`window.viewTRDetails = viewTRDetails;`), cleaned up at procurement.js:2569
- When the user navigates directly to `#/finance`, neither mrf-records.js nor procurement.js need have run → `window.viewTRDetails` may be `undefined`. The Finance view does not import or register it.
- Both existing implementations take a **TR doc ID** (`tr.docId`), but finance's RFP rows only carry `rfp.tr_doc_id` (the doc ID — good) and `rfp.tr_id` (human-readable). The PO Summary path must also thread `tr_doc_id` through buildPOMap.

**Recommendation (D-12):** Port a self-contained `viewTRDetailsFromRFP(trDocId)` into finance.js (mirror `viewTRDetailsLocal` above + the existing `viewPODetailsFromRFP` modal-container pattern), register it on `window` next to `viewPODetailsFromRFP` (finance.js:262) and delete it in cleanup (finance.js:4265). Do NOT depend on `window.viewTRDetails` being present. finance.js already imports `getDoc, doc, createModal, openModal, closeModal, showToast, showLoading, escapeHTML, formatCurrency, formatTimestamp` (used by viewPODetailsFromRFP), so no new imports are needed.

### D. Supporting maps (for threading doc IDs)
`app/views/finance.js:109-110`:
```javascript
let posAmountMap = new Map();     // po_id -> total_amount from PO document
let posNameMap = new Map();       // po_id -> { project_name, service_name } from PO document
```
Built from `onSnapshot(collection(db,'pos'), ...)` at finance.js:1207-1216, keyed by the **human-readable `data.po_id`** (NOT doc ID). These maps are keyed wrong for the fix — do NOT reuse them to resolve doc IDs. The correct doc ID is already on each RFP (`rfp.po_doc_id` / `rfp.tr_doc_id`); thread it through `buildPOMap`'s entry object instead.

---

## Slice 4 — Home Fit (`app/views/home.js` + `styles/hero.css`)

**Analog:** the file itself — `render()` hero block. Pure CSS/markup; no JS logic or data change (Integration Point).

### A. `render()` hero block — `app/views/home.js:129-192`
Structure (the 5 tiles + title that must fit above the fold per D-13):
```javascript
<div class="hero-section">                              // :130
    <h1 class="hero-title">🏗️ CLMC</h1>                 // :131
    <p class="hero-subtitle">Management System Portal</p> // :132

    <div class="dept-cards">                            // :134
        <div class="dept-cards-row dept-cards-row--top"> // :135  (3 tiles: Clients/Projects/Services)
            <div class="nav-card" ...>...Clients...</div>     // :136-141
            <div class="nav-card" ...>...Projects...</div>    // :142-147
            <div class="nav-card" ...>...Services...</div>    // :148-153
        </div>
        <div class="dept-cards-row dept-cards-row--bottom"> // :155  (2 tiles: Procurement/Finance)
            <div class="nav-card" ...>...Procurement...</div> // :156-161
            <div class="nav-card" ...>...Finance...</div>     // :162-167
        </div>
    </div>

    <!-- sub-nav (:172) + engagements/proposals mounts (:182-183) -->
    <div id="homeOverviewContent">                       // :186
        <div class="quick-stats">${statsContent}</div>   // :187  <-- SEPARATE overview, NOT hero tiles
    </div>
</div>
```
Each `.nav-card` = `.nav-card-icon` emoji + `<h3>` + `<p>` description + `<button>Enter →</button>`.

**⚠ `.quick-stats` (:187) is the Procurement stats overview card — NOT a hero tile.** Do not confuse it with the 5 dept tiles. D-13's "5 tiles" = the `.nav-card` items inside `.dept-cards-row--top` / `--bottom`.

### B. `styles/hero.css` — the rules to compress (D-15, height fix)
Hero header (candidates to shrink per Claude's Discretion / line 49 of CONTEXT):
```css
/* :5  */ .hero-section { min-height:calc(100vh - 64px); display:flex; flex-direction:column;
                          justify-content:center; align-items:center; padding:4rem 2rem; background:linear-gradient(...); }
/* :15 */ .hero-title { font-size:3rem; font-weight:700; margin-bottom:0.5rem; line-height:1.1; }
/* :24 */ .hero-subtitle { font-size:1.25rem; margin-bottom:4rem; font-weight:400; }   /* <-- 4rem bottom gap is large */
```
Dept tiles grid (3+2 grouping — KEEP per D-14):
```css
/* :87  */ .dept-cards { display:flex; flex-direction:column; gap:2rem; max-width:1200px; width:100%; margin-bottom:2rem; }
/* :96  */ .dept-cards-row { display:grid; gap:2rem; }
/* :101 */ .dept-cards-row--top { grid-template-columns:repeat(3,1fr); }
/* :105 */ .dept-cards-row--bottom { grid-template-columns:repeat(2,1fr); max-width:calc((100% - 4rem) * 2 / 3 + 2rem); margin:0 auto; }
```
Per-card sizing (the main vertical-space consumers):
```css
/* :42 */ .nav-card { background:white; border-radius:12px; padding:2.5rem 2rem; text-align:center; box-shadow:...; ... }
/* :59 */ .nav-card-icon { font-size:4rem; margin-bottom:1.5rem; display:block; }
/* :65 */ .nav-card h3 { font-size:1.5rem; font-weight:600; margin-bottom:1rem; }
/* :72 */ .nav-card p  { font-size:1rem; margin-bottom:2rem; line-height:1.6; }
/* :79 */ .nav-card .btn { width:100%; padding:0.75rem 1.5rem; font-size:1rem; font-weight:600; }
```
**Width cap stays (D-16):** `.dept-cards max-width:1200px` (:91) and `.navigation-cards max-width:1200px` (:37) must NOT be widened. The fix is vertical compression of: `.nav-card` padding (:45), `.nav-card-icon` size+margin (:60-61), `.nav-card h3` size+margin (:66-69), `.nav-card p` size+margin (:73-75), `.dept-cards gap` (:90) + `margin-bottom` (:93), `.dept-cards-row gap` (:98), and `.hero-subtitle margin-bottom:4rem` (:28). Optionally shrink `.hero-title`/`.hero-subtitle` font sizes (Claude's Discretion).

### C. Responsive blocks — MUST be preserved (D-16)
These media blocks already reflow for smaller screens; compression layers onto them, do NOT replace (Phase 73.1 dual-mode pattern):
```css
/* :329 */ @media (max-width: 1024px) { .dept-cards-row--top { repeat(2,1fr); }  .dept-cards-row--bottom { repeat(2,1fr); max-width:100%; } ... }
/* :353 */ @media (max-width: 768px)  { .hero-section{padding:3rem 1rem;min-height:auto;} .hero-title{2rem} .hero-subtitle{1rem;mb:2rem}
                                        .dept-cards-row--top,.dept-cards-row--bottom{1fr;max-width:100%} .nav-card{padding:2rem 1.5rem}
                                        .nav-card-icon{3rem} .nav-card h3{1.25rem} .nav-card p{0.9375rem} ... }
/* :422 */ @media (max-width: 480px)  { .hero-title{1.75rem} .hero-subtitle{0.9375rem} .nav-card{padding:1.5rem 1rem} .nav-card-icon{2.5rem} ... }
```
If the planner reduces the base (desktop) sizes substantially, verify the ≤768/≤480 overrides still make sense (they currently shrink FROM the larger base values).

---

## No Analog Found

None. Every slice modifies existing code; the "analogs" are the in-place targets captured above. The only genuinely-net-new code candidate is the **client CSV export (Slice 1 / D-05)** — see the Shared Patterns verify-before-assuming note: no client export exists today, so the planner must confirm scope before treating it as an edit.

---

## Metadata

**Analog search scope:** `app/views/{clients,notifications,finance,home,mrf-records,procurement}.js`, `app/{utils,notifications}.js`, `app/expense-modal.js`, `styles/{components,hero}.css`, `firestore.rules`.
**Files fully read:** clients.js (693L), notifications.js (370L), home.js (841L), hero.css (484L). Targeted reads: finance.js (685-844, 960-1189, 2820-2937, plus grep maps), mrf-records.js (790-929), components.css (1948-2157), notifications.js TYPE_META (72-91), utils.js downloadCSV (785-814), firestore.rules clients (285-297).
**Pattern extraction date:** 2026-06-03
