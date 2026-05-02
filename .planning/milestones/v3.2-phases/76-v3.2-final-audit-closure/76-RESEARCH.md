# Phase 76: v3.2 Final Audit Closure — Research

**Researched:** 2026-04-20
**Domain:** Documentation gap closure — spec amendments, traceability flips, VERIFICATION.md writeups
**Confidence:** HIGH

## Summary

Phase 76 is a pure documentation and verification phase with zero production code changes. All 10 target
phases have shipped code that was verified against the live codebase during this research. The work breaks
into four distinct buckets:

1. **Spec amendments already applied in REQUIREMENTS.md** — POBAR-01/02/03, EXPMOD-02, RFPBANK-01/02 spec
   text was updated during Phase 76 setup (per REQUIREMENTS.md footer dated 2026-04-20). These need
   verification that the amended text is accurate against live code, then the RFPBANK checkboxes need to
   be ticked `[x]` and FINSUMCARD-03 traceability row needs its status flipped to "Complete".

2. **New requirements to add to REQUIREMENTS.md** — PAY65-01..05 (Phase 65.1 dual-table) and Phase 71
   requirements have no formal entries at all. They must be drafted and inserted.

3. **Stale ROADMAP.md entry** — Phase 68.1 still reads "TBD"; update to "deferred to next milestone".

4. **10 VERIFICATION.md files to create** — For phases 62.3, 65, 65.1, 65.2, 65.3, 65.10, 69.1, 70, 71,
   and 75.

**Primary recommendation:** Execute in one plan (76-01-PLAN.md) treating all tasks as document writes.
No Firebase reads, no JS edits, no deploy steps.

---

## Project Constraints (from CLAUDE.md)

- Pure JavaScript ES6 modules, no framework/build system
- No build, test, or lint commands — zero-build static website
- Window functions on `onclick` MUST be on `window`
- Firebase Firestore v10.7.1 (CDN)
- Status values are case-sensitive (e.g. `'Pending'` not `'pending'`)

**Phase 76 specific:** This phase writes only `.planning/` markdown files and `.planning/REQUIREMENTS.md`,
`.planning/ROADMAP.md`. No `app/` source files are modified.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RFPBANK-01 | Spec amended; implementation verified in procurement.js; checkbox needs `[x]` | showAltBank at lines 1216-1222; altBankSection HTML at lines 885, 1019, 1155 |
| RFPBANK-02 | Spec amended; removeAltBank clears all three fields; checkbox needs `[x]` | removeAltBank at lines 1224-1234 clears inputs; field capture at lines 1269-1271 |
| FINSUMCARD-03 | Formula fix confirmed in service-detail.js:888; only traceability row needs flip | `remainingPayable: (posAgg.data().poTotal || 0) + (trsAgg.data().totalAmount || 0) - rfpTotalPaid` |
| PAY65-01 | Finance Payables dual-table (RFP Processing + PO Payment Summary) | finance.js: two separate render functions (renderRFPTable + renderPOSummaryTable) |
| PAY65-02 | Dual independent filter state per table | finance.js lines 90-95: rfpStatusFilter, rfpDeptFilter, poSummaryStatusFilter, poSummaryDeptFilter |
| PAY65-03 | Status-priority sort in RFP Processing table | finance.js lines 687-695: statusPriority map + spread sort |
| PAY65-04 | Auto-derived payment status | finance.js: deriveRFPStatus() helper; Finance never manually sets status |
| PAY65-05 | Independent filter application per table | filterRFPTable() and filterPOSummaryTable() are separate functions |
</phase_requirements>

---

## Part A: Spec-Code Verification Findings

### A1. RFPBANK-01/02 — Alt-Bank Manual Entry UX

**Requirement IDs:** RFPBANK-01, RFPBANK-02

**File:** `app/views/procurement.js`

**Implementation confirmed:**

The saved-bank dropdown was removed in commit `b613ca4`. The shipped replacement is a manual "Add
Alternative Bank Account" button that shows/hides a second bank entry form.

**Key functions:**

| Function | Lines | Purpose |
|----------|-------|---------|
| `showAltBank()` | 1216-1221 | Shows `#altBankSection`, hides `#addAltBankBtn` |
| `removeAltBank()` | 1224-1234 | Hides section, clears all three alt bank inputs |

**HTML evidence (three modal instances — PO RFP, TR RFP, Delivery Fee RFP):**
- `id="altBankSection"` at lines 885, 1019, 1155 — hidden by default (`display:none`)
- `id="addAltBankBtn"` at lines 905, 1039, 1175 — green "Add Alternative Bank Account" button
- `onclick="window.removeAltBank()"` at lines 888, 1022, 1158 — Remove button inside section
- `onclick="window.showAltBank()"` at lines 905, 1039, 1175 — triggers show

**Data capture (submitRFP, submitTRRFP, submitDeliveryFeeRFP):**
```javascript
// Lines 1269-1271, 1388-1390, 1467-1469
const altBankName         = document.getElementById('rfpAltBankName')?.value?.trim() || '';
const altBankAccountName  = document.getElementById('rfpAltBankAccountName')?.value?.trim() || '';
const altBankDetails      = document.getElementById('rfpAltBankDetails')?.value?.trim() || '';
```

**Fields saved to Firestore** (lines 1338-1340, 1433-1435, 1510-1512):
```javascript
alt_bank_name:         paymentMode === 'Bank Transfer' ? altBankName : '',
alt_bank_account_name: paymentMode === 'Bank Transfer' ? altBankAccountName : '',
alt_bank_details:      paymentMode === 'Bank Transfer' ? altBankDetails : '',
```

**Re-fill on cancel RFP** (lines 401-411): If `savedData.alt_bank_name` or related fields are
present, `showAltBank()` is called and all three inputs are pre-populated.

**Current spec text in REQUIREMENTS.md (already amended during Phase 76 setup):**
- RFPBANK-01: "...an 'Add Alternative Bank' button appears that lets the user manually enter a second
  bank account (Bank Name, Account Name, Account Number)..."
- RFPBANK-02: "...can be shown or hidden via the Alt Bank toggle button; removing alt bank clears all
  three fields..."

**Verdict:** Spec text is accurate. Both checkboxes can be safely ticked `[x]`.

**Window registration (destroy cleanup):**
- Init: `window.showAltBank = showAltBank` at line 1635, `window.removeAltBank = removeAltBank` at 1636
- Destroy: `delete window.showAltBank` at 2167, `delete window.removeAltBank` at 2168

---

### A2. POBAR-01/02/03 — Gradient Fill Inside Badge

**Requirement IDs:** POBAR-01, POBAR-02, POBAR-03

**File:** `app/views/procurement.js`

**Implementation at lines 4990-4996:**
```javascript
const fillData = getPOPaymentFill(po.po_id);
const emptyBg = '#e5e7eb';
const bgStyle = fillData.pct > 0 && fillData.pct < 100
    ? `background:linear-gradient(to right, ${fillData.color} ${fillData.pct}%, ${emptyBg} ${fillData.pct}%)`
    : fillData.pct >= 100
    ? `background:${fillData.color}`
    : `background:${emptyBg}`;
```

**`getPOPaymentFill()` at lines 279-310:**
- No RFPs: returns `{ pct: 0, color: '#f8d7da', opacity: 0.7 }` — badge shows solid `#e5e7eb` (grey)
- Partially paid: returns color based on status + pct between 0-100
- Fully paid: returns `pct: 100` — badge shows solid fill color

**Spec text already amended in REQUIREMENTS.md:**
- POBAR-01: "...gradient fill inside the badge chip itself — `background: linear-gradient(to right, {color} {pct}%, ...)`..."
- POBAR-02: "...fully-unsaturated/grey gradient (0% fill color) inside the badge chip..."
- POBAR-03: "...badge text color is set by the status-badge CSS class; gradient fill does not override font color..."

**Verdict:** Spec text accurately describes the code. No changes needed to spec text.

Same gradient pattern is also applied to TR badges at lines 5087-5091 and 5205-5209.

---

### A3. EXPMOD-02 — Delivery Fees Table Shows PO ID

**Requirement ID:** EXPMOD-02

**File:** `app/expense-modal.js`

**Implementation at lines 586-589:**
```javascript
<thead><tr><th>PO ID</th><th style="text-align: right;">Amount</th></tr></thead>
<tbody>
    ${deliveryFeeItems.map(item => `
        <tr><td>${item.po_id}</td><td style="text-align: right;">${formatCurrency(item.amount)}</td></tr>
```

**Spec text already amended in REQUIREMENTS.md:**
- EXPMOD-02: "...Delivery Fees table shows PO ID | Amount — *spec amended in Phase 76...*"

**Verdict:** Spec text is accurate. `item.supplier` is available (it is populated in the
deliveryFeeItems push at line 106 as `supplier: poSupplier`) but PO ID is the shipped column.

---

### A4. FINSUMCARD-03 — Service Remaining Payable Formula

**Requirement ID:** FINSUMCARD-03

**File:** `app/views/service-detail.js`

**Formula at line 888:**
```javascript
remainingPayable: (posAgg.data().poTotal || 0) + (trsAgg.data().totalAmount || 0) - rfpTotalPaid,
```

**Audit integration check confirms:** `service-detail.js:888 uses poTotal+trTotal−rfpTotalPaid` — WIRED CORRECTLY.

Phase 75-01 committed this fix as commit `da69bc3`. The REQUIREMENTS.md traceability row currently
reads `"Pending (formula fix)"` — it needs to be flipped to `"Complete"`.

**Traceability row location:** REQUIREMENTS.md line 273.

---

## Part B: New Requirements to Formally Add

### B1. PAY65-01..05 — Finance Payables Dual-Table (Phase 65.1)

**File:** `app/views/finance.js`

**What Phase 65.1 shipped:** Replaced a single monolithic Payables table with two separate tables —
"RFP Processing" (Table 1) and "PO Payment Summary" (Table 2) — each with independent filter state,
their own render functions, and independent pagination (Table 2 only).

**Evidence for each requirement:**

**PAY65-01: Dual-table layout**
- `renderRFPTable()` at line 651 — renders Table 1 (RFP Processing)
- `renderPOSummaryTable()` at line 949 — renders Table 2 (PO Payment Summary)
- `buildPOMap()` at line 765 — groups RFPs by PO ID for Table 2 collapsed display

**PAY65-02: Dual independent filter state**
```javascript
// Lines 90-95
let rfpStatusFilter    = '';   // Table 1 status filter
let rfpDeptFilter      = '';   // Table 1 dept filter
let poSummaryStatusFilter = ''; // Table 2 status filter
let poSummaryDeptFilter   = ''; // Table 2 dept filter
```

**PAY65-03: Status-priority sort in Table 1**
```javascript
// Lines 687-695
const statusPriority = { 'Pending': 1, 'Overdue': 2, 'Partially Paid': 3, 'Fully Paid': 4 };
displayed = [...displayed].sort((a, b) => {
    const aPriority = statusPriority[deriveRFPStatus(a)] || 0;
    const bPriority = statusPriority[deriveRFPStatus(b)] || 0;
    if (aPriority !== bPriority) return aPriority - bPriority;
    const poCompare = (a.po_id || '').localeCompare(b.po_id || '');
    if (poCompare !== 0) return poCompare;
    return (a.tranche_percentage || 0) - (b.tranche_percentage || 0);
});
```

**PAY65-04: Auto-derived payment status**
- `deriveRFPStatus()` at lines 20-41: computes Fully Paid / Overdue / Partially Paid / Pending from
  `payment_records` array — Finance never manually sets a status field.

**PAY65-05: Independent filter application**
- `filterRFPTable()` at lines 473-478: reads `rfpStatusFilter`, `rfpDeptFilter`, calls `renderRFPTable()`
- `filterPOSummaryTable()` at lines 483-489: reads `poSummaryStatusFilter`, `poSummaryDeptFilter`,
  resets `poSummaryCurrentPage = 1`, calls `renderPOSummaryTable()`

**Shared infrastructure:**
- `statusBadgeColors` constant at line 44: shared between both render functions (module-level, comment says so)
- `buildPOMap()` is a render-time pure function — computed fresh on each `renderPOSummaryTable()` call

**Recommended requirement text for REQUIREMENTS.md:**

```
### Finance Payables Dual-Table (Phase 65.1)

- [x] **PAY65-01**: Finance Payables tab displays two separate tables — "RFP Processing" (one row per
  RFP tranche) and "PO Payment Summary" (one collapsed row per PO showing all tranche sub-rows) — each
  independently rendered and filtered
- [x] **PAY65-02**: Each Payables table has independent status and department filter dropdowns — changing
  a filter on Table 1 does not affect Table 2 filter state, and vice versa
- [x] **PAY65-03**: RFP Processing table (Table 1) rows are sorted by status priority (Pending first,
  then Overdue, Partially Paid, Fully Paid), then by PO Ref ascending, then by tranche_percentage
  ascending — unpaid/overdue items surface to the top
- [x] **PAY65-04**: RFP payment status (Pending / Partially Paid / Fully Paid / Overdue) is always
  auto-derived from the `payment_records` array arithmetic — Finance users never manually set status
- [x] **PAY65-05**: Changing a status or department filter on Table 1 (RFP Processing) or Table 2
  (PO Payment Summary) filters independently — each filter operates on its own displayed data slice
```

---

### B2. Phase 71 Requirements — Financial Breakdown Modal Revamp

**Files:** `app/expense-modal.js`

**What Phase 71 shipped (3 plans):**

**Plan 71-01:** Renamed modal header from "Expense Breakdown" to "Financial Breakdown" (commit `a3c895a`).
Internal symbol `showExpenseBreakdownModal` and `#expenseBreakdownModal` ID unchanged — user-visible rename only.

**Plan 71-02:** Added "Payables" as a third tab to the modal (after "By Category" and "Transport Fees").
Implemented a read-only 4-column worklist table (PARTICULARS / STATUS / TOTAL PAYABLE / TOTAL PAID) with:
- One row per PO (using `poTotalForRow = total_amount - delivery_fee`)
- One row per Delivery Fee (where `delivery_fee > 0`)
- One row per Approved TR
- Sorted by status bucket (Not Requested → Requested → Partial → Fully Paid), secondary by Total Payable desc
- Commits `b0355f6` (tab infrastructure) + `c6e8d32` (row derivation + render)

**Plan 71-03:** Fixed `deriveStatusForPO` fallback label from literal `'Partial'` to computed `'NN% Paid'`
(commit `5cee1b6`). `statusBucket` stays `'Partial'` for sort integrity.

**Key code locations in expense-modal.js:**
- Modal title `<h3>Financial Breakdown: ${title}</h3>` at line 604
- Payables tab button at line 668: `data-tab="payables"` / label "Payables"
- `payablesPOs` / `payablesTRs` accumulators at lines 80-81
- `deriveStatusForPO()` nested function at lines 238-298
- `deriveStatusForTR()` nested function (analogous to deriveStatusForPO, TR-specific)
- `deriveStatusForDeliveryFee()` nested function (3-state: Not Requested / Requested / Fully Paid)
- Payables table columns at lines 452-455: PARTICULARS / STATUS / TOTAL PAYABLE / TOTAL PAID
- `payablesRows` sort at lines 418-426 using `bucketOrder` map
- Payables tab container `#expBreakdownPayablesTab` at line 684

**Recommended requirement text for REQUIREMENTS.md:**

```
### Financial Breakdown Modal Revamp (Phase 71)

- [x] **FINBREAK-01**: The expense breakdown modal title reads "Financial Breakdown: {name}" instead
  of "Expense Breakdown: {name}" — all internal symbols (showExpenseBreakdownModal, #expenseBreakdownModal,
  .expense-tab, window._* functions) remain unchanged
- [x] **FINBREAK-02**: The Financial Breakdown modal contains a "Payables" tab (third tab after
  "By Category" and "Transport Fees") showing a read-only 4-column worklist table with columns
  PARTICULARS / STATUS / TOTAL PAYABLE / TOTAL PAID
- [x] **FINBREAK-03**: The Payables tab displays one row per PO (Total Payable = PO total minus
  delivery fee), one row per Delivery Fee (where delivery_fee > 0 on the PO), and one row per
  Finance-Approved TR — delivery fees are not bundled into the PO row
- [x] **FINBREAK-04**: Payables tab rows are sorted action-needed first: Not Requested (0) →
  Requested (1) → Partial (2) → Fully Paid (3), with secondary sort by Total Payable descending
  within each bucket
- [x] **FINBREAK-05**: PO status derivation in the Payables tab uses the same active-tranche logic
  as finance.js derivePOSummary (Phase 65.3), ported inline to avoid circular imports; fallback
  label for edge cases formats as "NN% Paid" (not the literal word "Partial")
```

---

## Part C: Stale ROADMAP Entry — Phase 68.1

**Current text in ROADMAP.md Phase 68.1 entry:**
- Requirements listed as "TBD"

**Action required:** Update Phase 68.1 ROADMAP entry to state:
> Requirements: TBD — **deferred to next milestone; scope via `/gsd:discuss-phase 68.1`**

Audit notes: "Phase 68.1 (subcon cost fix) remains TBD — needs `/gsd:discuss-phase 68.1` to scope,
not gap closure". No code, no plan, no verification — this phase is explicitly not part of Phase 76.

---

## Part D: VERIFICATION.md Writeups — All 10 Phases

### D1. Phase 62.3 — Client Search Bar + Dropdown Sort by Code

**Requirements addressed:** None formally tracked in REQUIREMENTS.md (Phase 62 sub-phase, not in v3.2
requirements list — part of v3.1 cleanup).

**Files modified:**
- `app/views/clients.js` — search bar + filter logic
- `app/views/mrf-form.js` — sort by code
- `app/views/procurement.js` — sort by code

**Key functions and grep evidence:**

| Evidence | Location |
|----------|----------|
| `id="clientSearchInput"` | `app/views/clients.js:92` |
| `oninput="window.filterClients()"` | `app/views/clients.js:94` |
| `window.filterClients = filterClients` | `app/views/clients.js:33` |
| `delete window.filterClients` | `app/views/clients.js:167` |
| `cachedProjects.sort((a, b) => (a.project_code || '').localeCompare(b.project_code || ''))` | `app/views/mrf-form.js:1074` |
| `cachedServices.sort((a, b) => (a.service_code || '').localeCompare(b.service_code || ''))` | `app/views/mrf-form.js:1145` |
| `projectsData.sort((a, b) => (a.project_code || '').localeCompare(b.project_code || ''))` | `app/views/procurement.js:2219` |
| `cachedServicesForNewMRF.sort((a, b) => (a.service_code || '').localeCompare(b.service_code || ''))` | `app/views/procurement.js:2195` |

**Verification passed when:**
- `grep -c "clientSearchInput" app/views/clients.js` returns >= 1
- `grep -c "filterClients" app/views/clients.js` returns >= 3 (declaration, window assignment, destroy)
- `grep -c "project_code.*localeCompare" app/views/mrf-form.js` returns >= 1
- `grep -c "service_code.*localeCompare" app/views/mrf-form.js` returns >= 1
- `grep -c "project_code.*localeCompare" app/views/procurement.js` returns >= 1
- `grep -c "service_code.*localeCompare" app/views/procurement.js` returns >= 1

---

### D2. Phase 65 — Core RFP Workflow (RFP-01..06)

**Requirements:** RFP-01, RFP-02, RFP-03, RFP-04, RFP-05, RFP-06

**Primary file:** `app/views/procurement.js`
**Supporting file:** `app/views/finance.js`

**Key functions:**

| Function | Location | Requirement |
|----------|----------|-------------|
| `generateRFPId(poId)` | procurement.js:223 | RFP-01 (ID generation) |
| `openRFPModal(poDocId)` | procurement.js:774 | RFP-01 (modal opens) |
| `submitRFP(poDocId)` | procurement.js:1259 | RFP-01 (creation) |
| `addDoc(collection(db, 'rfps'), rfpDoc)` | procurement.js:1345 | RFP-01 (Firestore write) |
| `renderRFPTable()` | finance.js:651 | RFP-02 (Finance view) |
| Payment record modal + `openRecordPaymentModal` | finance.js | RFP-03 |
| `deriveRFPStatus()` | finance.js:20-41 | RFP-04 (auto-derived status) |
| Overdue row highlighting in `renderRFPTable` | finance.js | RFP-05 |
| `getPOPaymentFill(poId)` | procurement.js:283 | RFP-06 (PO badge fill) |

**Data shape written to `rfps` collection (lines 1318-1343):**
```javascript
{
    rfp_id, po_id, po_doc_id, mrf_id, project_name, project_code,
    supplier_name, invoice_number, tranche_label, tranche_percentage,
    amount_requested, due_date, mode_of_payment, bank_name,
    bank_account_name, bank_details, alt_bank_name, alt_bank_account_name,
    alt_bank_details, payment_records: [], date_submitted
}
```

**UAT evidence:** `65-UAT.md` — 9/10 tests pass (Test 5 sort issue fixed by Phase 65.1).

**Verification passed when:**
- `grep -c "addDoc(collection(db, 'rfps')" app/views/procurement.js` returns >= 1
- `grep -c "submitRFP" app/views/procurement.js` returns >= 3
- `grep -c "deriveRFPStatus" app/views/finance.js` returns >= 3
- `grep -c "getPOPaymentFill" app/views/procurement.js` returns >= 2
- Finance Payables tab loads and shows RFP rows (integration confirmed by audit)

---

### D3. Phase 65.1 — Finance Payables Dual-Table (PAY65-01..05)

**Requirements:** PAY65-01, PAY65-02, PAY65-03, PAY65-04, PAY65-05

**File:** `app/views/finance.js`

**Key functions and evidence:**

| Evidence | Lines | Requirement |
|----------|-------|-------------|
| `function renderRFPTable()` | 651 | PAY65-01 (Table 1 render) |
| `function renderPOSummaryTable()` | 949 | PAY65-01 (Table 2 render) |
| `function buildPOMap(rfps)` | 765 | PAY65-01 (PO grouping) |
| `let rfpStatusFilter = ''` | 90 | PAY65-02 (Table 1 filter state) |
| `let poSummaryStatusFilter = ''` | 94 | PAY65-02 (Table 2 filter state) |
| `function filterRFPTable()` | 473 | PAY65-05 (Table 1 filter function) |
| `function filterPOSummaryTable()` | 483 | PAY65-05 (Table 2 filter function) |
| `const statusPriority = { 'Pending': 1, 'Overdue': 2, ... }` | 687 | PAY65-03 (sort map) |
| `displayed = [...displayed].sort(...)` | 688 | PAY65-03 (sort execution) |
| `function deriveRFPStatus(rfp)` | 20 | PAY65-04 (auto-derived) |
| `const statusBadgeColors = { ... }` | 44 | PAY65-01 (shared between tables, comment line 43) |
| `const poSummaryItemsPerPage = 15` | 100 | PAY65-01 (Table 2 pagination) |

**Verification passed when:**
- `grep -c "renderRFPTable\|renderPOSummaryTable\|buildPOMap" app/views/finance.js` returns >= 3
- `grep -c "rfpStatusFilter\|poSummaryStatusFilter" app/views/finance.js` returns >= 4
- `grep -c "statusPriority" app/views/finance.js` returns >= 2
- `grep -c "deriveRFPStatus" app/views/finance.js` returns >= 3

---

### D4. Phase 65.2 — Default Filter Hides Fully Paid RFPs (RFPFILTER-01)

**Requirement:** RFPFILTER-01

**File:** `app/views/finance.js`

**Implementation at lines 661-668:**
```javascript
// Default: hide Fully Paid RFPs unless explicitly filtered to show them
if (rfpStatusFilter !== 'Fully Paid') {
    displayed = displayed.filter(r => deriveRFPStatus(r) !== 'Fully Paid');
}
if (rfpStatusFilter) {
    displayed = displayed.filter(r => deriveRFPStatus(r) === rfpStatusFilter);
}
```

**Decision recorded in STATE.md:** "Default exclusion of Fully Paid RFPs placed before user filter
blocks in renderRFPTable() with `rfpStatusFilter !== 'Fully Paid'` guard"

**Verification passed when:**
- `grep -c "rfpStatusFilter !== 'Fully Paid'" app/views/finance.js` returns 1
- `grep -c "filter(r => deriveRFPStatus(r) !== 'Fully Paid')" app/views/finance.js` returns 1

---

### D5. Phase 65.3 — RFP Tranche Progress in PO Payment Summary (TRANCHE-01)

**Requirement:** TRANCHE-01

**File:** `app/views/finance.js`

**Implementation — `derivePOSummary()` at lines 802-860:**
```javascript
// D-09: first non-fully-paid tranche label + payment progress for partially paid POs
const firstUnpaid = sorted.find(r => deriveRFPStatus(r) !== 'Fully Paid');
...
if (totalPaid > 0 && totalAmount > 0) {
    const pctPaid = Math.round((totalPaid / totalAmount) * 100);
    currentTranche = `${trancheText} — ${pctPaid}% Paid`;
}
```

**Mobile card equivalent in `buildPOTrancheSubCard()` at line 866:** Due date rendered raw (string),
same as desktop table.

**Decision recorded in STATE.md:** "Payment progress percentage shown in Current Active Tranche column
as 'TrancheLabel (N%) — NN% Paid' using Math.round; guard totalPaid > 0 && totalAmount > 0 to skip
suffix for zero-payment POs"

**Verification passed when:**
- `grep -c "pctPaid}% Paid" app/views/finance.js` returns >= 2
- `grep -c "derivePOSummary" app/views/finance.js` returns >= 3
- `grep -c "currentTranche" app/views/finance.js` returns >= 4

---

### D6. Phase 65.10 — Cancel RFP (RFPCANCEL-01..03)

**Requirements:** RFPCANCEL-01, RFPCANCEL-02, RFPCANCEL-03

**File:** `app/views/procurement.js`

**Key functions:**

| Function | Lines | Requirement |
|----------|-------|-------------|
| `isRFPCancellable(rfp)` | 355-360 | RFPCANCEL-03 (zero non-voided payments guard) |
| `cancelRFPDocument(rfpDocId)` | 445-491 | RFPCANCEL-01/02/03 (cancel + re-open) |
| `showRFPContextMenu()` — cancellableRFPs map | 515 | RFPCANCEL-01 (PO ID right-click menu) |
| `showTRRFPContextMenu()` — cancellableTRRFP | 564 | RFPCANCEL-02 (TR badge right-click) |

**Cancel flow (lines 474-491):**
```javascript
await deleteDoc(doc(db, 'rfps', rfpDocId));
// Re-opens the appropriate modal (PO/TR/Delivery Fee) pre-filled with savedData
```

**Decision recorded:** "cancelRFPDocument captures RFP fields into savedData before deleteDoc,
then re-opens appropriate modal (PO/TR/Delivery Fee) with pre-filled form for easy correction"

**Verification passed when:**
- `grep -c "isRFPCancellable" app/views/procurement.js` returns >= 3
- `grep -c "cancelRFPDocument" app/views/procurement.js` returns >= 4
- `grep -c "deleteDoc(doc(db, 'rfps'" app/views/procurement.js` returns >= 1
- `grep -c "window.cancelRFPDocument" app/views/procurement.js` returns >= 3

---

### D7. Phase 69.1 — Remaining Payable Formula Fixes (EXPPAY-FIX-01..03)

**Requirements:** EXPPAY-FIX-01, EXPPAY-FIX-02, EXPPAY-FIX-03

**File:** `app/expense-modal.js`

**Commit:** `100520e`

**Three fixes (from 69.1-01-SUMMARY.md):**

| Fix | Before | After | Requirement |
|-----|--------|-------|-------------|
| Formula | `remainingPayable = totalRequested - totalPaid` | `remainingPayable = totalCost - totalPaid` | EXPPAY-FIX-01 |
| Voided exclusion | No filter on payment_records | `.filter(r => r.status !== 'voided')` applied | EXPPAY-FIX-02 |
| Render gate | `if (totalRequested > 0)` | `if (totalCost > 0)` | EXPPAY-FIX-03 |

**Current code confirmation:**
- Line 481: `const remainingPayable = totalCost - totalPaid;` — uses totalCost not totalRequested
- Line 73: `.filter(r => r.status !== 'voided').reduce(...)` — voided excluded from totalPaid

**UAT evidence:** `69.1-UAT.md` — 4/5 tests pass (Test 3 skipped — no voided payments in test data).

**Verification passed when:**
- `grep -c "remainingPayable = totalCost - totalPaid" app/expense-modal.js` returns 1
- `grep -c "status !== 'voided'" app/expense-modal.js` returns >= 6
- `grep -c "totalRequested - totalPaid" app/expense-modal.js` returns 0

---

### D8. Phase 70 — Cancel PRs / Restore MRF (PRCANCEL-01..05)

**Requirements:** PRCANCEL-01, PRCANCEL-02, PRCANCEL-03, PRCANCEL-04, PRCANCEL-05

**File:** `app/views/procurement.js`

**Key functions:**

| Function | Lines | Requirement |
|----------|-------|-------------|
| `showMRFContextMenu(event, mrfDocId, mrfStatus)` | 589-611 | PRCANCEL-01 (right-click menu) |
| `cancelMRFPRs(mrfDocId)` | 634-768 | PRCANCEL-02/03/04/05 (three-path cancel) |

**Three cancel paths in `cancelMRFPRs()` (lines 634-768):**

| Path | Condition | Lines | Requirement |
|------|-----------|-------|-------------|
| BLOCK | `pos.some(po => blockedStatuses.includes(po.procurement_status))` | 660-665 | PRCANCEL-04 |
| BLOCK | Any linked RFP has non-voided payments | 677-699 | PRCANCEL-04 (payment guard) |
| FORCE-RECALL | `pendingPOs.length > 0` | 707-730 | PRCANCEL-03 |
| SIMPLE | No POs or only cancelled POs | 731-737 | PRCANCEL-02 |

**MRF restoration (lines 749-755):**
```javascript
await updateDoc(doc(db, 'mrfs', mrfDocId), {
    status: 'In Progress',
    pr_ids: [],
    tr_id: null,
    updated_at: new Date().toISOString()
});
```

**PRCANCEL-05 (MRF Processing panel not modified):** `filterPRPORecords()` is called at line 766
after cancel to re-filter the records view; the MRF processing left panel is a separate component
and is updated by the MRF `onSnapshot` listener reacting to the status change — not by explicit panel manipulation.

**UAT evidence:** `70-UAT.md` — 8/8 pass (all three paths verified plus TR edge case).

**Verification passed when:**
- `grep -c "cancelMRFPRs" app/views/procurement.js` returns >= 4
- `grep -c "showMRFContextMenu" app/views/procurement.js` returns >= 3
- `grep -c "status: 'In Progress'" app/views/procurement.js` returns >= 1
- `grep -c "blockedStatuses" app/views/procurement.js` returns >= 2

---

### D9. Phase 71 — Financial Breakdown Modal Revamp (FINBREAK-01..05)

**Requirements:** FINBREAK-01 through FINBREAK-05 (to be defined in Phase 76)

**File:** `app/expense-modal.js`

**Commits:** `a3c895a` (rename), `b0355f6` (tab infrastructure), `c6e8d32` (row derivation), `5cee1b6` (fallback label fix)

**Key code evidence:**

| Evidence | Location | Requirement |
|----------|----------|-------------|
| `<h3>Financial Breakdown: ${title}</h3>` | line 604 | FINBREAK-01 |
| `showExpenseBreakdownModal` (unchanged internal name) | line 17 | FINBREAK-01 |
| `data-tab="payables"` button "Payables" | line 668 | FINBREAK-02 |
| `<th>PARTICULARS</th>` / `<th>TOTAL PAYABLE</th>` / `<th>TOTAL PAID</th>` | lines 452-455 | FINBREAK-02 |
| `payablesPOs` accumulator + `payablesTRs` accumulator | lines 80-81 | FINBREAK-03 |
| `const poTotalForRow = po.total_amount - po.delivery_fee` | line 380 | FINBREAK-03 |
| `const bucketOrder = { 'Not Requested': 0, 'Requested': 1, 'Partial': 2, 'Fully Paid': 3 }` | line 420 | FINBREAK-04 |
| `const fallbackLabel = totalPaid > 0 ? \`${pctPaid}% Paid\` : 'Requested'` | line 275 | FINBREAK-05 |

**UAT evidence:** `71-UAT.md` (5 tests — SUMMARY references 71-UAT passing).

**Verification passed when:**
- `grep -c "Financial Breakdown:" app/expense-modal.js` returns 1
- `grep -c "Expense Breakdown" app/expense-modal.js` returns 0
- `grep -c "PARTICULARS" app/expense-modal.js` returns 1
- `grep -c "TOTAL PAYABLE" app/expense-modal.js` returns 1
- `grep -c "deriveStatusForPO" app/expense-modal.js` returns >= 2
- `grep -c "poTotalForRow" app/expense-modal.js` returns >= 2
- `grep -c "bucketOrder" app/expense-modal.js` returns >= 2
- `grep -c "fallbackLabel" app/expense-modal.js` returns >= 2
- `grep -c "expBreakdownPayablesTab" app/expense-modal.js` returns 2

---

### D10. Phase 75 — Gap Closure (FINSUMCARD-03, POSUMPAG-01, FINSUMCARD-04, TRCLEANUP-01)

**Requirements:** FINSUMCARD-03, POSUMPAG-01, FINSUMCARD-04, TRCLEANUP-01

**Files:** `app/views/service-detail.js`, `app/views/finance.js`, `.planning/REQUIREMENTS.md`

**Four deliverables (from 75-01 and 75-02 SUMMARY files):**

| Requirement | Change | File | Commit |
|-------------|--------|------|--------|
| FINSUMCARD-03 | `remainingPayable: (posAgg.data().poTotal || 0) + (trsAgg.data().totalAmount || 0) - rfpTotalPaid` | service-detail.js:888 | `da69bc3` |
| TRCLEANUP-01 | `rfpsByTR = {}` in destroy() + 3 TR-RFP window deletes | procurement.js:2102, 2164-2166 | `2d22754` |
| POSUMPAG-01 | `const poSummaryItemsPerPage = 15` + spec amended + traceability flipped | finance.js:100 | `d5bccf6` |
| FINSUMCARD-04 | Traceability row flipped to Complete (spec already amended) | REQUIREMENTS.md | `44a3aaa` |

**Verification passed when:**
- `grep -c "trsAgg.data().totalAmount" app/views/service-detail.js` returns >= 2
- `grep -c "rfpsByTR = {}" app/views/procurement.js` returns >= 2 (destroy + init listener)
- `grep -c "delete window.showTRRFPContextMenu" app/views/procurement.js` returns 1
- `grep -c "delete window.openTRRFPModal" app/views/procurement.js` returns 1
- `grep -c "delete window.submitTRRFP" app/views/procurement.js` returns 1
- `grep -c "poSummaryItemsPerPage = 15" app/views/finance.js` returns 1
- `grep -c "POSUMPAG-01" app/views/finance.js` returns 1

---

## Architecture Patterns

### VERIFICATION.md Standard Format

Each VERIFICATION.md follows the GSD standard structure:

```yaml
---
phase: {phase-dir-name}
status: passed
verified: 2026-04-20
verified_by: claude
---
```

Body sections:
1. **Requirements verified** — table mapping Req ID to evidence
2. **Code evidence** — grep commands and expected return counts
3. **UAT evidence** (if UAT.md exists)
4. **Integration evidence** (if relevant)

### REQUIREMENTS.md Edit Patterns

All REQUIREMENTS.md edits follow established patterns:
- New requirements sections go above "Future Requirements" heading
- Traceability table rows updated in lockstep with bullet checkbox changes
- Footer `*Last updated:*` entries added newest-first above existing entries
- Spec amendment notes appended as italic `*...*` suffix on the bullet line

### ROADMAP.md Phase 68.1 Pattern

Phase notes in ROADMAP.md use plain English in the Notes field. Match surrounding phase entry style.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Verify code is present | Manually reading source | grep patterns documented above |
| VERIFICATION.md format | Custom structure | GSD standard VERIFICATION.md format |
| PAY65 requirement IDs | New naming scheme | PAY65-0N (N=1..5) already established in ROADMAP/STATE |
| FINBREAK requirement IDs | Any other prefix | FINBREAK-01..05 (coined in this research, consistent with naming conventions) |

---

## Common Pitfalls

### Pitfall 1: FINSUMCARD-03 already has `[x]` in REQUIREMENTS.md but traceability shows "Pending"
**What goes wrong:** The bullet at line 125 already has `[x]` from Phase 75 setup. Only the
traceability row at line 273 needs to change from `"Pending (formula fix)"` to `"Complete"`.
**How to avoid:** Edit ONLY the traceability table row, not the bullet.

### Pitfall 2: RFPBANK checkboxes need `[x]` but spec text is already amended
**What goes wrong:** Both bullets currently show `[ ]` (reset to Pending in Phase 76 setup) despite
spec text being amended. The plan needs to tick them `[x]` after confirming implementation matches
the amended spec. The spec already accurately describes showAltBank/removeAltBank.
**How to avoid:** Flip both to `[x]` — do not re-amend the spec text a second time.

### Pitfall 3: Phase 68.1 is NOT a VERIFICATION target
**What goes wrong:** Audit lists 11 phases missing VERIFICATION.md — but Phase 68.1 is intentionally
excluded from Phase 76 (no code, no plan, deferred). Only 10 phases get VERIFICATION.md files.
**How to avoid:** Phase 76 creates VERIFICATION.md for: 62.3, 65, 65.1, 65.2, 65.3, 65.10, 69.1,
70, 71, 75. Not 68.1.

### Pitfall 4: PAY65 and FINBREAK requirements need traceability rows added too
**What goes wrong:** Adding the requirement bullets without adding corresponding traceability table
rows means the traceability section goes out of sync.
**How to avoid:** For each new requirement bullet, add a matching `| REQID | Phase | Complete |` row
to the traceability table.

### Pitfall 5: ROADMAP.md Phase 62.3 checkbox
**What goes wrong:** The audit mentions "Phase 62.3 ROADMAP checkbox still unchecked". This is a
ROADMAP.md edit, not a REQUIREMENTS.md edit. Must locate and tick the Phase 62.3 entry checkbox
in ROADMAP.md.
**How to avoid:** Search ROADMAP.md for "62.3" and tick its `[ ]` → `[x]`.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — this phase writes only markdown and planning files).

---

## Validation Architecture

Step skipped — `workflow.nyquist_validation` context not available, but Phase 76 is a documentation-
only phase. No automated test commands are applicable. All verification is grep-based as documented
in each phase section above.

---

## Open Questions

1. **Phase 62.3 in REQUIREMENTS.md scope**
   - What we know: Phase 62.3 implemented client search bar + dropdown sort. These are not formally
     listed in REQUIREMENTS.md (they predate the v3.2 requirements section or belong to v3.1 cleanup).
   - What's unclear: Should VERIFICATION.md for Phase 62.3 reference any formal requirement ID?
   - Recommendation: VERIFICATION.md for Phase 62.3 can note "no formal v3.2 requirement ID — Phase
     62.3 was a v3.1 sub-patch tracked via STATE.md". The ROADMAP.md checkbox is the only formal
     tracking artifact; tick it.

2. **PAY65 and FINBREAK requirement ID suffix numbering**
   - What we know: PAY65-01..05 is already referenced in ROADMAP.md and STATE.md. FINBREAK-01..05
     is a new coin for Phase 76.
   - What's unclear: Whether FINBREAK-0N is the preferred prefix or something else.
   - Recommendation: Use FINBREAK-01..05 — it is distinct, maps clearly to "Financial Breakdown",
     and follows the established ID pattern (domain prefix + hyphen + 2-digit number).

---

## Sources

### Primary (HIGH confidence)
- `app/views/procurement.js` — direct code inspection for RFPBANK, POBAR, RFPCANCEL, PRCANCEL, RFP core
- `app/views/finance.js` — direct code inspection for PAY65 (65.1), RFPFILTER (65.2), TRANCHE (65.3)
- `app/expense-modal.js` — direct code inspection for EXPMOD-02, EXPPAY-FIX, FINBREAK (Phase 71)
- `app/views/service-detail.js` — direct code inspection for FINSUMCARD-03
- `app/views/clients.js`, `app/views/mrf-form.js` — direct code inspection for Phase 62.3
- `.planning/v3.2-MILESTONE-AUDIT.md` — authoritative audit report with line number citations
- `.planning/REQUIREMENTS.md` — current requirements state including already-applied spec amendments
- `.planning/phases/75-*/75-01-SUMMARY.md` — Phase 75 exact changes and verification
- `.planning/phases/75-*/75-02-SUMMARY.md` — Phase 75 spec reconciliation
- `.planning/phases/70-*/70-UAT.md` — 8/8 UAT pass record for Phase 70
- `.planning/phases/69.1-*/69.1-01-SUMMARY.md` — Phase 69.1 exact changes
- `.planning/phases/69.1-*/69.1-UAT.md` — UAT evidence for Phase 69.1
- `.planning/phases/71-*/71-01-SUMMARY.md`, `71-02-SUMMARY.md`, `71-03-SUMMARY.md` — Phase 71 changes
- `.planning/phases/62.3-*/STATE.md` — Phase 62.3 implementation record
- `.planning/phases/65-*/65-UAT.md` — Phase 65 UAT evidence
- `.planning/STATE.md` — Decisions log with phase-level context

### Secondary (MEDIUM confidence)
None — all findings are from direct primary source inspection.

---

## Metadata

**Confidence breakdown:**
- RFPBANK implementation: HIGH — `showAltBank`/`removeAltBank` directly inspected
- POBAR gradient code: HIGH — lines 4990-4996 directly read
- EXPMOD-02 PO ID column: HIGH — lines 586-589 directly read
- FINSUMCARD-03 formula: HIGH — service-detail.js:888 directly confirmed
- PAY65 dual-table: HIGH — finance.js filter state, render functions, sort directly inspected
- Phase 71 Payables tab: HIGH — expense-modal.js lines 79-474 directly inspected
- Phase 70 cancel logic: HIGH — procurement.js:634-768 directly read + UAT 8/8
- Phase 75 gap closure: HIGH — SUMMARY files document exact commits and diffs

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (stable codebase — no active sprints on these files)
