---
name: 85-PATTERNS
description: Pattern map for Phase 85 — Collectibles Tracking. Each new file or modification mapped to its closest live-codebase analog (almost all from Phase 65 RFP/Payables, the architectural mirror). Concrete excerpts with absolute paths and line numbers; planner consumes per-plan.
type: phase-patterns
---

# Phase 85: Collectibles Tracking — Pattern Map

**Mapped:** 2026-05-02
**Files analyzed:** 8 modified + 0 new
**Analogs found:** 8 / 8

Phase 85 is a money-in mirror of Phase 65 RFP/Payables. **Almost every code unit has a 1:1 analog.** The only conceptually new surface is the project-scoped sequential ID generator (D-20) — but even that has a Phase 65.4 lesson and the per-PO RFP generator (`generateRFPId`) as a near-exact template.

No greenfield files; all edits land in existing modules per the integration map in CONTEXT.md `<code_context>`.

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `app/views/finance.js` | view (5th sub-tab + table + filters + payment modal + CSV export) | request-response + onSnapshot | `app/views/finance.js` Payables tab itself (lines 90-101 state, 497-502 filter handler, 675-782 renderRFPTable, 1135-1166 initPayablesTab, 2005-2100 markup) | **exact** (same file) |
| `app/views/procurement.js` | view (RFP creation + tranche-builder + right-click cancel + notification fan-out) | event-driven + Firestore writes | `app/views/procurement.js` lines 76-183 (renderTrancheBuilder), 220-261 (generateRFPId), 446-549 (cancelRFPDocument + showRFPContextMenu), 775-934 (openRFPModal), 1260-1375 (submitRFP + notification) | **exact** (same file) |
| `app/views/project-detail.js` | view (Financial Summary cells) | Firestore read aggregation | `app/views/project-detail.js` lines 386-431 (Paid + Remaining Payable cells), 770-810 (rfp-driven currentExpense calc) | **exact** (same file) |
| `app/views/service-detail.js` | view (Financial Summary cells) | Firestore read aggregation | `app/views/service-detail.js` lines 367-440 (Paid + Remaining Payable cells, mirrored from project-detail) | **exact** (same file) |
| `app/views/projects.js` | view (`collection_tranches` editor inside create/edit form) | request-response, doc write | Tranche-builder helpers in `app/views/procurement.js` lines 76-183 + `addProject`/`saveEdit` in `app/views/projects.js` lines 576-684, 970-1091 | role-match (form-side) + tranche-builder cross-file |
| `app/views/services.js` | view (`collection_tranches` editor inside create/edit form) | request-response, doc write | Mirrors `projects.js` (Phase 36 unification) — same pattern as projects | role-match |
| `app/expense-modal.js` | shared modal (5th tab "Collectibles") | Firestore reads + tab switching | `app/expense-modal.js` lines 657-727 (Payables tab markup + `_switchExpenseBreakdownTab`) | **exact** (same file) |
| `app/notifications.js` | enum extension | n/a (constant) | `app/notifications.js` lines 30-48 `NOTIFICATION_TYPES` enum | **exact** (same file) |
| `firestore.rules` | security (collectibles rules) | n/a (declarative) | `firestore.rules` lines 6-39 ADDING NEW COLLECTIONS template + lines 443-455 rfps rules | **exact** (same file) |

> **Why no "new files" row:** All 9 surfaces above are extensions to already-loaded modules. There is no need for a `app/views/collectibles.js` because Phase 65 itself never created one (RFP logic lives inside finance.js + procurement.js).

---

## Pattern Assignments

### `app/views/finance.js` (view — 5th sub-tab + flat table + filters + pagination + payment modal + CSV)

**Analog:** `app/views/finance.js` itself (the existing Payables sub-tab code from Phase 65 + its variants)

#### Pattern 1: Imports (already present — extend with `createNotificationForRoles`)

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 6-11:
```javascript
import { db, collection, query, where, onSnapshot, getDocs, getDoc, doc, updateDoc, addDoc, getAggregateFromServer, sum, count, serverTimestamp, arrayUnion, arrayRemove } from '../firebase.js';
import { showToast, showLoading, formatCurrency, formatDate, formatTimestamp, getStatusClass, downloadCSV, escapeHTML } from '../utils.js';
import { showExpenseBreakdownModal } from '../expense-modal.js';
import { getMRFLabel, getDeptBadgeHTML, skeletonTableRows, createModal } from '../components.js';
import { showProofModal } from '../proof-modal.js';
import { createNotification, NOTIFICATION_TYPES } from '../notifications.js';
```
**Phase 85 add to imports:** `createNotificationForRoles` (already used in procurement.js line 11). `deleteDoc` (for cancel-collectible if Finance also gets it; otherwise procurement.js holds the cancel).

#### Pattern 2: Module-state for tab — 4 independent filter vars + pagination state (Phase 65.1 + 65.7)

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 86-101:
```javascript
// Payables tab state
let rfpsData = [];                // all RFP documents from onSnapshot
let posAmountMap = new Map();     // po_id -> total_amount from PO document
let posNameMap = new Map();       // po_id -> { project_name, service_name } from PO document
// Table 1 (RFP Processing) filter state
let rfpStatusFilter = '';
let rfpDeptFilter = '';
let rfpSearchQuery = '';
// Table 2 (PO Payment Summary) filter state
let poSummaryStatusFilter = '';
let poSummaryDeptFilter = '';
let poSummarySearchQuery = '';
// Table 2 (PO Payment Summary) pagination state
let poSummaryCurrentPage = 1;
const poSummaryItemsPerPage = 15;
```
**Phase 85 mirror — five state vars (D-03 Project, Status, Due-date range, Department + D-04 page):**
```javascript
// Collectibles tab state
let collectiblesData = [];        // all collectibles documents from onSnapshot
let projectsForCollMap = new Map(); // project_code/service_code -> { name, contract_cost, collection_tranches }
// Filter state (Phase 65.1 independence pattern)
let collProjectFilter = '';
let collStatusFilter = '';
let collDeptFilter = '';          // 'projects' | 'services' | ''
let collDueFromFilter = '';
let collDueToFilter = '';
// Pagination state (Phase 65.7)
let collCurrentPage = 1;
const collItemsPerPage = 15;
```

#### Pattern 3: 5th pill-bar sub-tab markup (D-02)

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 1738-1760:
```javascript
        <!-- Finance sub-tab navigation (Phase 73.3: unified pill bar + sticky + scroll-hide) -->
        <nav class="finance-sub-nav" id="financeSubNav" role="navigation" aria-label="Finance sections">
            <div class="finance-sub-nav-inner">
                <div class="finance-sub-nav-tabs" role="tablist">
                    <a href="#/finance/approvals"
                       class="finance-sub-nav-tab ${activeTab === 'approvals' ? 'finance-sub-nav-tab--active' : ''}"
                       role="tab"
                       aria-selected="${activeTab === 'approvals' ? 'true' : 'false'}">Pending Approvals</a>
                    <a href="#/finance/pos"
                       class="finance-sub-nav-tab ${activeTab === 'pos' ? 'finance-sub-nav-tab--active' : ''}"
                       role="tab"
                       aria-selected="${activeTab === 'pos' ? 'true' : 'false'}">Purchase Orders</a>
                    <a href="#/finance/projects"
                       class="finance-sub-nav-tab ${activeTab === 'projects' ? 'finance-sub-nav-tab--active' : ''}"
                       role="tab"
                       aria-selected="${activeTab === 'projects' ? 'true' : 'false'}">Project List</a>
                    <a href="#/finance/payables"
                       class="finance-sub-nav-tab ${activeTab === 'payables' ? 'finance-sub-nav-tab--active' : ''}"
                       role="tab"
                       aria-selected="${activeTab === 'payables' ? 'true' : 'false'}">Payables</a>
                </div>
            </div>
        </nav>
```
**Phase 85:** Insert as 5th `<a href="#/finance/collectibles">` immediately after the Payables `<a>`. Use the SAME `finance-sub-nav-tab` / `finance-sub-nav-tab--active` classes — no new CSS.

#### Pattern 4: Section markup with filter bar + flat table (D-05) — clone from Payables markup

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 2005-2053 (Table 1 — RFP Processing flat table is the closest D-05 analog because it's a one-row-per-RFP layout, NOT the grouped PO-Summary pattern):
```javascript
<section id="payables-section" class="section ${activeTab === 'payables' ? 'active' : ''}">
    <!-- Table 1: RFP Processing -->
    <div class="card" style="margin-bottom:1.5rem;">
        <div class="card-header"><h2>RFP Processing</h2></div>
        <div style="padding:1rem;">
            <div style="display:flex;gap:1rem;margin-bottom:0.75rem;align-items:center;flex-wrap:wrap;">
                <select id="rfpStatusFilter" class="form-control" style="width:auto;min-width:160px;font-size:0.875rem;" onchange="window.filterRFPTable()">
                    <option value="">Outstanding (default)</option>
                    <option value="Pending">Pending</option>
                    <option value="Partially Paid">Partially Paid</option>
                    <option value="Fully Paid">Fully Paid</option>
                    <option value="Overdue">Overdue</option>
                </select>
                <select id="rfpDeptFilter" class="form-control" style="width:auto;min-width:160px;font-size:0.875rem;" onchange="window.filterRFPTable()">
                    <option value="">All Departments</option>
                    <option value="projects">Projects</option>
                    <option value="services">Services</option>
                </select>
                <input type="text" id="rfpSearchInput" class="form-control" placeholder="Search project, PO ID, or RFP ID..." style="width:auto;min-width:240px;font-size:0.875rem;" oninput="window.filterRFPTable()">
            </div>
            <div class="table-scroll-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>RFP ID</th>
                            <th>Supplier</th>
                            <th>PO Ref</th>
                            <th>Project / Service</th>
                            <th>Proof</th>
                            <th>Tranche</th>
                            <th style="text-align:right;">Amount</th>
                            <th style="text-align:right;">Paid</th>
                            <th style="text-align:right;">Balance</th>
                            <th>Due Date</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="rfpTableBody">
                        <tr><td colspan="12" style="text-align:center;padding:2rem;color:#64748b;">Loading RFPs...</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="fc-card-list" id="rfpCardList"></div>
        </div>
    </div>
</section>
```
**Phase 85 D-05 columns:** ID | Project/Service | Department badge | Tranche Label | Amount | Paid | Balance | Due Date | Status | Actions. Add 2 date inputs (`collDueFromFilter`/`collDueToFilter`) + a project dropdown (D-03) + an "Export CSV" button (D-26) + a `<div id="collPagination" class="pagination-container">` (D-04). Use the SAME `data-table` / `table-scroll-container` / `pagination-container` CSS classes — no new CSS.

#### Pattern 5: Status derivation (D-18 / D-19 — never persisted)

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 33-50:
```javascript
function deriveRFPStatus(rfp) {
    const totalPaid = (rfp.payment_records || [])
        .filter(r => r.status !== 'voided')
        .reduce((s, r) => s + (r.amount || 0), 0);
    const isOverdue = rfp.due_date && new Date(rfp.due_date) < new Date();
    if (totalPaid >= rfp.amount_requested && rfp.amount_requested > 0) return 'Fully Paid';
    if (isOverdue) return 'Overdue';
    if (totalPaid > 0) return 'Partially Paid';
    return 'Pending';
}

// Status badge color map — shared by renderRFPTable and renderPOSummaryTable
const statusBadgeColors = {
    'Pending': 'background:#fff3cd;color:#856404;',
    'Partially Paid': 'background:#dbeafe;color:#1d4ed8;',
    'Fully Paid': 'background:#d1fae5;color:#065f46;',
    'Overdue': 'background:#fee2e2;color:#991b1b;'
};
```
**Phase 85:** Copy verbatim — rename to `deriveCollectibleStatus(coll)`. Same `statusBadgeColors` (reuse the same constant — D-05 says "Phase 64+ status badge classes"). Note: priority order is **Fully Paid > Overdue > Partially Paid > Pending** (lines 38-41).

#### Pattern 6: Filter handler (Phase 65.1 dual-state — apply own dropdowns, no shared state)

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 497-502:
```javascript
function filterRFPTable() {
    rfpStatusFilter = document.getElementById('rfpStatusFilter')?.value || '';
    rfpDeptFilter = document.getElementById('rfpDeptFilter')?.value || '';
    rfpSearchQuery = document.getElementById('rfpSearchInput')?.value?.trim()?.toLowerCase() || '';
    renderRFPTable();
}
```
**Phase 85 mirror — `filterCollectiblesTable()`:** read own 5 dropdowns/inputs + reset `collCurrentPage = 1`. Re-call `renderCollectiblesTable()`.

#### Pattern 7: Render flat table with filter pipeline + sort + empty-state + status priority sort + filter-aware pagination

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 675-782 — this is the canonical analog for the entire Phase 85 collectibles render. Key sub-patterns:

- Apply filters in sequence on a copy: `displayed = rfpsData; if (rfpStatusFilter) displayed = displayed.filter(...);`
- Status priority sort (lines 711-719): `Pending=1, Overdue=2, Partially=3, Fully=4` — unpaid first
- Empty-state with filter-aware copy (lines 721-730)
- Render row HTML with `tbody.innerHTML = displayed.map(rfp => '<tr>...</tr>').join('')`

**Phase 85 amendment for D-04 pagination:** apply filters → sort → slice for current page → render. Use the **`poSummaryCurrentPage`** sub-table in finance.js lines 1043-1063 (offset=`(currentPage-1)*itemsPerPage`) as the slicing template. The pagination control HTML at lines 589-618 is the renderer template — copy verbatim, just rename the `changePOSummaryPage` window function to `changeCollectiblesPage`.

```javascript
// Pagination slice (line 1043-1064 pattern)
if (poSummaryCurrentPage > totalPages && totalPages > 0) poSummaryCurrentPage = totalPages;
const startIndex = (poSummaryCurrentPage - 1) * poSummaryItemsPerPage;
const endIndex = Math.min(startIndex + poSummaryItemsPerPage, totalItems);
const pageItems = displayed.slice(startIndex, endIndex);
```

#### Pattern 8: Pagination control rendering (Phase 65.7)

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 583-619:
```javascript
if (totalPages <= 1) { paginationDiv.style.display = 'none'; return; }
paginationDiv.style.display = '';

let paginationHTML = `
    <div class="pagination-info">
        Showing <strong>${startIndex + 1}-${endIndex}</strong> of <strong>${totalItems}</strong> POs
    </div>
    <div class="pagination-controls">
        <button class="pagination-btn" onclick="window.changePOSummaryPage('prev')" ${poSummaryCurrentPage === 1 ? 'disabled' : ''}>
            &larr; Previous
        </button>
`;
for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= poSummaryCurrentPage - 1 && i <= poSummaryCurrentPage + 1)) {
        paginationHTML += `
            <button class="pagination-btn ${i === poSummaryCurrentPage ? 'active' : ''}" onclick="window.changePOSummaryPage(${i})">
                ${i}
            </button>`;
    } else if (i === poSummaryCurrentPage - 2 || i === poSummaryCurrentPage + 2) {
        paginationHTML += '<span class="pagination-ellipsis">...</span>';
    }
}
paginationHTML += `
        <button class="pagination-btn" onclick="window.changePOSummaryPage('next')" ${poSummaryCurrentPage === totalPages ? 'disabled' : ''}>
            Next &rarr;
        </button>
    </div>`;
paginationDiv.innerHTML = paginationHTML;
```
**Phase 85:** Verbatim — replace `poSummaryCurrentPage` → `collCurrentPage`, `changePOSummaryPage` → `changeCollectiblesPage`, "POs" → "Collectibles".

#### Pattern 9: Tab onSnapshot setup + listener cleanup (Firebase Listener Management per CLAUDE.md)

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 1135-1166:
```javascript
async function initPayablesTab() {
    const rfpsUnsub = onSnapshot(collection(db, 'rfps'), (snapshot) => {
        rfpsData = [];
        snapshot.forEach(docSnap => {
            rfpsData.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderRFPTable();
        renderPOSummaryTable();
    });
    listeners.push(rfpsUnsub);

    const posUnsub = onSnapshot(collection(db, 'pos'), (snapshot) => {
        posAmountMap = new Map();
        posNameMap = new Map();
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.po_id) {
                if (data.total_amount != null) {
                    posAmountMap.set(data.po_id, data.total_amount);
                }
                posNameMap.set(data.po_id, {
                    project_name: data.project_name || '',
                    service_name: data.service_name || ''
                });
            }
        });
        renderRFPTable();
        renderPOSummaryTable();
    });
    listeners.push(posUnsub);
}
```
**Phase 85 mirror — `initCollectiblesTab()`:** `onSnapshot(collection(db, 'collectibles'), ...)` for collectibles, plus an `onSnapshot(collection(db, 'projects'))` and `onSnapshot(collection(db, 'services'))` to keep `projectsForCollMap` (which holds `contract_cost`, `collection_tranches`, `project_name` for cell denormalization). Push all 3 listeners into `listeners[]` (already declared at line 73). Wire from `init(activeTab)` lines 2214-2217 with `if (activeTab === 'collectibles') await initCollectiblesTab();`.

#### Pattern 10: Record Payment modal — exact mirror for D-14, D-15, D-17

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 311-403 — full payment modal with existing-payments list (line 312-330), void buttons (line 322-323), and inline new-payment form (line 336-355). Use as template for `openRecordCollectiblePaymentModal(collDocId)`.

**KEY DEVIATION (D-15):** RFP modal pre-fills the amount as `formatCurrency(rfp.amount_requested)` and READONLY (line 343-344) because Phase 65 tranches are atomic. Phase 85 must allow PARTIAL amounts — change the input to:
```html
<input type="number" id="paymentAmount" class="form-control"
       min="0.01" step="0.01" max="${remainingBalance}"
       placeholder="Amount in PHP" required>
```
Validate `parseFloat(amount) > 0 && parseFloat(amount) <= (amount_requested - totalPaid)`.

**Mode dropdown (D-14):** clone the rfpPaymentMode select markup from procurement.js lines 864-872, expanded for Phase 85's mode set:
```html
<select id="paymentMode" class="form-control" onchange="window.toggleCollPaymentOtherField()">
    <option value="">Select method...</option>
    <option value="Bank Transfer">Bank Transfer</option>
    <option value="Check">Check</option>
    <option value="Cash">Cash</option>
    <option value="GCash/E-Wallet">GCash/E-Wallet</option>
    <option value="Other">Other</option>
</select>
```
Add `<input id="paymentModeOther">` revealed when value === "Other" (procurement.js lines 910-913 pattern).

#### Pattern 11: Submit payment — append to `payment_records` array (D-15 multi-payment)

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 409-468:
```javascript
async function submitPaymentRecord(rfpDocId) {
    const rfp = rfpsData.find(r => r.id === rfpDocId);
    if (!rfp) { showToast('RFP not found', 'error'); return; }

    const paymentDate = document.getElementById('paymentDate')?.value;
    const reference = document.getElementById('paymentReference')?.value?.trim() || '';
    const errorEl = document.getElementById('paymentErrorAlert');

    if (!paymentDate) { errorEl.textContent = 'Payment date is required.'; errorEl.style.display = 'block'; return; }

    const paymentRecord = {
        payment_id: `PAY-${Date.now()}`,
        amount: rfp.amount_requested,         // ⚠️ Phase 85: replace with user-entered partial amount
        date: paymentDate,
        method: rfp.mode_of_payment || '',    // ⚠️ Phase 85: read from #paymentMode dropdown
        reference: reference,
        status: 'active',
        recorded_at: new Date().toISOString()
    };

    try {
        await updateDoc(doc(db, 'rfps', rfpDocId), {
            payment_records: arrayUnion(paymentRecord)
        });
        // ... fire-and-forget Fully-Paid notification (Phase 85: SKIP — D-23 defers this)
        document.getElementById('recordPaymentModal')?.remove();
        showToast(`Payment recorded for ${rfp.rfp_id}`, 'success');
    } catch (error) {
        console.error('[Finance] Payment record error:', error);
        errorEl.textContent = 'Failed to record payment. Check your connection and try again.';
        errorEl.style.display = 'block';
    }
}
```
**Phase 85 — `submitCollectiblePayment(collDocId)`:** Replace `rfps` → `collectibles`. Read user-entered `amount`, `method` (with `Other` freetext fallback), `reference`, `date`. Validate amount > 0 and amount <= remaining balance. Use `arrayUnion` exactly as line 433. **Skip the Fully-Paid notification** per D-23.

#### Pattern 12: Void payment — read-modify-write (D-16, mirrors Phase 65 D-60+)

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 474-492:
```javascript
async function voidPaymentRecord(rfpDocId, paymentId) {
    if (!confirm('Void this payment record? This cannot be undone.')) return;

    try {
        const rfpRef = doc(db, 'rfps', rfpDocId);
        const snap = await getDoc(rfpRef);
        if (!snap.exists()) { showToast('RFP not found', 'error'); return; }

        const records = snap.data().payment_records || [];
        const updated = records.map(r =>
            r.payment_id === paymentId ? { ...r, status: 'voided' } : r
        );
        await updateDoc(rfpRef, { payment_records: updated });
        showToast('Payment record voided', 'success');
    } catch (error) {
        console.error('[Finance] Void payment error:', error);
        showToast('Failed to void payment record', 'error');
    }
}
```
**Phase 85 — `voidCollectiblePayment(collDocId, paymentId)`:** Verbatim with rfps → collectibles. Add `voided_by`, `voided_at`, `void_reason` per D-16 — extend the spread:
```javascript
r.payment_id === paymentId
    ? { ...r, status: 'voided', voided: true, voided_by: window.getCurrentUser?.()?.uid ?? null, voided_at: new Date().toISOString(), void_reason: reasonFromPrompt || '' }
    : r
```

#### Pattern 13: CSV export wired to filter-aware data set (D-26)

`C:\Users\franc\dev\projects\pr-po\app\utils.js` lines 789-814:
```javascript
export function downloadCSV(headers, rows, filename) {
    const escape = (val) => {
        if (val == null) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    };
    const csvLines = [
        headers.map(escape).join(','),
        ...rows.map(row => row.map(escape).join(','))
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
```
**Phase 85 — `exportCollectiblesCSV()`:** Headers from D-27 (13 columns). Rows = same `displayed` filter pipeline output that `renderCollectiblesTable()` uses (extract pipeline into `getDisplayedCollectibles()` helper for reuse). Filename: `` `collectibles-${new Date().toISOString().slice(0,10)}.csv` ``. Existing call sites in finance.js: search for `exportPOsCSV` (line 2906 destroy, calls `downloadCSV` with similar headers/rows pattern).

#### Pattern 14: Window-function attach + destroy cleanup (CLAUDE.md SPA pattern)

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 2937-2952 (existing destroy block):
```javascript
// Clean up payables window functions
delete window.filterRFPTable;
delete window.filterPOSummaryTable;
delete window.togglePOExpand;
delete window.changePOSummaryPage;
delete window.openRecordPaymentModal;
delete window.voidPaymentRecord;
delete window.submitPaymentRecord;

// Reset payables filter state
rfpsData = [];
rfpStatusFilter = '';
rfpDeptFilter = '';
poSummaryStatusFilter = '';
poSummaryDeptFilter = '';
poSummaryCurrentPage = 1;
```
**Phase 85 cleanup — add to destroy:** `delete window.filterCollectiblesTable; delete window.changeCollectiblesPage; delete window.openRecordCollectiblePaymentModal; delete window.voidCollectiblePayment; delete window.submitCollectiblePayment; delete window.exportCollectiblesCSV; delete window.openCreateCollectibleModal; delete window.cancelCollectible; delete window.showCollectibleContextMenu; delete window.toggleCollPaymentHistory;` + reset 6 module-state vars.

---

### `app/views/procurement.js` (view — collectible-side: tranche-builder helpers reused, RFP-creation pattern reused, right-click cancel reused, notification fan-out reused)

**Analog:** `app/views/procurement.js` itself (Phase 65 RFP logic)

> **Note for planner:** Per CONTEXT.md `<code_context>` Integration Points, "create collectible" is invoked from the **Finance Collectibles sub-tab** (not the procurement view's MRF Records). However, the helpers here — `renderTrancheBuilder` / `readTranchesFromDOM` / `recalculateTranches` / `addTranche` / `removeTranche` (lines 76-183) — are **directly reusable** by the project/service tranche-editor (D-10) and the collectible-creation modal's tranche dropdown (D-12). Either:
> 1. Lift these 5 helpers into a new shared module `app/tranche-builder.js`, OR
> 2. Duplicate them as `renderCollTrancheBuilder` etc. in finance.js + projects.js
>
> **Recommendation:** option 1 (shared module) — but planner's call. Phase 65 left them in procurement.js because they only had one caller; Phase 85 needs them in 3 places (collectibles modal + projects.js form + services.js form).

#### Pattern 15: Tranche builder UI (D-09, D-10) — running-total badge with green/red color

`C:\Users\franc\dev\projects\pr-po\app\views\procurement.js` lines 76-108:
```javascript
function renderTrancheBuilder(tranches, poId) {
    const rows = tranches.map((t, i) => `
        <div class="tranche-row" style="display:flex;gap:5px;align-items:center;margin-bottom:3px;">
            <input type="text" class="form-control tranche-label" placeholder="Label" value="${escapeHTML(t.label)}"
                   style="flex:1 1 auto;padding:0.25rem 0.4rem;border:1px solid #cbd5e1;border-radius:4px;font-size:0.8125rem;"
                   oninput="window.recalculateTranches('${poId}')">
            <input type="number" class="form-control tranche-pct" placeholder="%" value="${t.percentage}"
                   min="0" max="100" step="0.01"
                   style="flex:0 0 56px;padding:0.25rem 0.4rem;border:1px solid #cbd5e1;border-radius:4px;font-size:0.8125rem;text-align:right;"
                   oninput="window.recalculateTranches('${poId}')">
            <span style="flex:0 0 auto;font-size:0.75rem;color:#94a3b8;">%</span>
            <button type="button" aria-label="Remove tranche"
                    onclick="window.removeTranche(this, '${poId}')"
                    style="flex:0 0 auto;width:20px;height:20px;padding:0;border:1px solid #cbd5e1;border-radius:3px;cursor:pointer;background:#fff;font-size:0.8rem;line-height:1;color:#94a3b8;"
                    ${tranches.length === 1 ? 'disabled' : ''}>&times;</button>
        </div>
    `).join('');

    const initialTotal = tranches.reduce((s, t) => s + (parseFloat(t.percentage) || 0), 0);
    const totalColor = Math.abs(initialTotal - 100) < 0.01 ? '#059669' : '#ef4444';

    return `
        <div id="trancheBuilder_${poId}">
            ${rows}
            <button type="button" class="btn btn-outline btn-sm"
                    onclick="window.addTranche('${poId}')"
                    style="margin-top:3px;padding:0.2rem 0.55rem;font-size:0.78rem;">+ Add Tranche</button>
        </div>
        <div id="trancheTotal_${poId}" style="font-size:0.78rem;font-weight:600;margin-top:3px;color:${totalColor};">
            Total: <span id="trancheTotalValue_${poId}">${initialTotal.toFixed(2).replace(/\.?0+$/, '')}</span>% / 100%
        </div>
    `;
}
```
And lines 115-183 — `readTranchesFromDOM` / `recalculateTranches` / `addTranche` / `removeTranche` round it out. **Verbatim mirror** for `collection_tranches` editor in projects.js / services.js. Just rename ID prefix from `trancheBuilder_${poId}` to `collTrancheBuilder_${projectDocId}` (or `_new` for create form) so the same project-edit can also have a PO tranche builder open without ID collision.

#### Pattern 16: Sum-100 validation on save (D-09)

`C:\Users\franc\dev\projects\pr-po\app\views\procurement.js` lines 8542-8556 (existing validation in `saveProgress` / similar):
```javascript
const tranches = readTranchesFromDOM(poId);
const trancheTotal = tranches.reduce((s, t) => s + t.percentage, 0);

if (Math.abs(trancheTotal - 100) > 0.01) {
    showToast(`Tranches must sum to 100% (currently ${trancheTotal.toFixed(2)}%)`, 'error');
    return;
}

// Persist:
updateData.tranches = tranches;
updateData.payment_terms = tranches.map(t => `${t.label} (${t.percentage}%)`).join(', ');
```
**Phase 85:** copy verbatim into projects.js `addProject` / `saveEdit` and services.js equivalents. Persist as `collection_tranches` (not `tranches` — the field name differs to keep it parallel to `tranches` on POs without conflict).

#### Pattern 17: Custom inline ID generator (D-20) — Phase 65.4 lesson

`C:\Users\franc\dev\projects\pr-po\app\views\procurement.js` lines 220-261:
```javascript
async function generateRFPId(poId) {
    const rfpsSnap = await getDocs(
        query(collection(db, 'rfps'), where('po_id', '==', poId))
    );
    let maxNum = 0;
    rfpsSnap.forEach(docSnap => {
        const id = docSnap.data().rfp_id;
        if (id) {
            const lastDash = id.lastIndexOf('-');
            const seqStr = id.slice(lastDash + 1);
            const num = parseInt(seqStr);
            if (!isNaN(num) && num > maxNum) maxNum = num;
        }
    });
    return `RFP-${poId}-${maxNum + 1}`;
}
```
**Phase 85 mirror — `generateCollectibleId(scopeCode, dept)`:** Query `collection(db, 'collectibles')` filtered by `where(dept === 'projects' ? 'project_code' : 'service_code', '==', scopeCode)`. Use `lastIndexOf('-')` parser. Return `COLL-${scopeCode}-${maxNum + 1}`. **Do NOT use `generateSequentialId` from `utils.js` lines 173-198** — Phase 65.4 lesson learned (year-counter caused collisions; project-scoped is collision-safe).

#### Pattern 18: Right-click context menu — cancel-collectible (Claude's discretion, mirrors Phase 65.10)

`C:\Users\franc\dev\projects\pr-po\app\views\procurement.js` lines 504-549 — full template:
```javascript
function showRFPContextMenu(event, poDocId) {
    const existing = document.getElementById('rfpContextMenu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'rfpContextMenu';
    menu.style.cssText = `position:fixed;left:${event.clientX}px;top:${event.clientY}px;background:white;border:1px solid #e5e7eb;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:4px 0;z-index:10000;min-width:180px;`;
    // ... menu options ...
    const cancellableRFPs = existingRFPs.filter(r => isRFPCancellable(r));
    menu.innerHTML = `
        ...
        ${cancellableRFPs.length > 0 ? `
            <div style="border-top:1px solid #f1f5f9;margin:4px 0;"></div>
            ${cancellableRFPs.map(rfp => `
                <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#ef4444;"
                     onmouseenter="this.style.background='#fef2f2'"
                     onmouseleave="this.style.background='transparent'"
                     onclick="window.cancelRFPDocument('${rfp.id}')">
                    Cancel ${escapeHTML(rfp.rfp_id)}
                </div>`).join('')}` : ''}
    `;
    document.body.appendChild(menu);
    setTimeout(() => {
        document.addEventListener('click', function handler() {
            menu.remove();
            document.removeEventListener('click', handler);
        }, { once: true });
    }, 10);
}
```
And `isRFPCancellable` at lines 356-361:
```javascript
function isRFPCancellable(rfp) {
    const totalPaid = (rfp.payment_records || [])
        .filter(r => r.status !== 'voided')
        .reduce((sum, r) => sum + (r.amount || 0), 0);
    return totalPaid === 0;
}
```
And `cancelRFPDocument` at lines 446-497.

**Phase 85 — `showCollectibleContextMenu(event, collDocId)` + `isCollectibleCancellable(coll)` + `cancelCollectible(collDocId)`:** Verbatim with rfps → collectibles. Cancel is `deleteDoc(doc(db, 'collectibles', collDocId))`. **Trigger the menu from the collectible row's ID cell** in the Finance Collectibles table via `oncontextmenu="event.preventDefault(); window.showCollectibleContextMenu(event, '${coll.id}'); return false;"` — same syntax as procurement.js line 5287.

#### Pattern 19: Notification fan-out to Finance (D-21) — fire-and-forget

`C:\Users\franc\dev\projects\pr-po\app\views\procurement.js` lines 1349-1364 (canonical try/catch pattern):
```javascript
await addDoc(collection(db, 'rfps'), rfpDoc);

// Phase 84 NOTIF-08: notify Finance of new RFP needing review (D-03: fire-and-forget)
try {
    await createNotificationForRoles({
        roles: ['finance'],
        type: NOTIFICATION_TYPES.RFP_REVIEW_NEEDED,
        message: `New RFP pending Finance review: ${rfpId} for PO ${po.po_id}`,
        link: '#/finance/pending',
        source_collection: 'rfps',
        source_id: rfpId
    });
} catch (notifErr) {
    console.error('[Procurement] NOTIF-08 submitRFP notification failed:', notifErr);
}
```
**Phase 85 — `submitCollectible()` after `addDoc(collection(db, 'collectibles'), collDoc)`:**
```javascript
try {
    await createNotificationForRoles({
        roles: ['finance'],
        type: NOTIFICATION_TYPES.COLLECTIBLE_CREATED,
        message: `New collectible filed: ${collId} (${trancheLabel}, PHP ${formatCurrency(amountRequested)}) on Project ${projectName}`,
        link: '#/finance/collectibles',
        source_collection: 'collectibles',
        source_id: collId
    });
} catch (notifErr) {
    console.error('[Collectibles] COLLECTIBLE_CREATED notification failed:', notifErr);
}
```
Note `excludeActor` defaults to `true` (notifications.js line 546) — actor-as-finance won't self-notify, which is the desired behavior.

#### Pattern 20: Create-modal with tranche dropdown filtering used tranches (D-12 strict 1:1)

`C:\Users\franc\dev\projects\pr-po\app\views\procurement.js` lines 783-814 — open-RFP modal logic:
```javascript
const tranches = Array.isArray(po.tranches) && po.tranches.length > 0
    ? po.tranches
    : [{ label: po.payment_terms || 'Full Payment', percentage: 100 }];

const poTotal = parseFloat(po.total_amount) || 0;

// Check which tranches already have RFPs
const existingRFPs = rfpsByPO[po.po_id] || [];
const usedTrancheIndices = new Set(
    existingRFPs.filter(r => r.tranche_index != null).map(r => r.tranche_index)
);
existingRFPs
    .filter(r => r.tranche_index == null && r.tranche_label !== 'Delivery Fee')
    .forEach(r => {
        const matchIdx = tranches.findIndex((t, i) => t.label === r.tranche_label && !usedTrancheIndices.has(i));
        if (matchIdx >= 0) usedTrancheIndices.add(matchIdx);
    });

const trancheOptions = tranches.map((t, i) => {
    const used = usedTrancheIndices.has(i);
    return `<option value="${i}" ${used ? 'disabled' : ''} ${i === 0 && !used ? 'selected' : ''}>${escapeHTML(t.label)} (${t.percentage}%)${used ? ' — RFP exists' : ''}</option>`;
}).join('');

const firstAvailable = tranches.findIndex((t, i) => !usedTrancheIndices.has(i));
const defaultAmount = firstAvailable >= 0 ? (tranches[firstAvailable].percentage / 100 * poTotal) : 0;
```
**Phase 85 — `openCreateCollectibleModal(projectOrServiceDocId, dept)`:** Replace `po.tranches` → `project.collection_tranches` (or `service.collection_tranches`); `existingRFPs` → `collectiblesData.filter(c => dept === 'projects' ? c.project_id === project.id : c.service_id === service.id)`. `poTotal` → `parseFloat(project.contract_cost || 0)`. `defaultAmount = firstAvailable >= 0 ? (tranches[firstAvailable].percentage / 100 * contractCost) : 0`.

**D-11 block UI:** if `!Array.isArray(project.collection_tranches) || project.collection_tranches.length === 0` (no tranches set), render the BLOCK message:
```html
<div style="padding:12px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;border-radius:6px;font-size:0.875rem;">
    Set up collection tranches on this project before creating a collectible.
    <a href="#/projects/detail/${escapeHTML(project.project_code)}">Click here to edit the project.</a>
</div>
```
Disable the submit button when blocked (procurement.js line 919 has `${firstAvailable < 0 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}` — same pattern).

**D-20 clientless-project block:** if `!project.project_code` (Phase 78 deferred-code project), render:
```html
<div style="padding:12px;background:#fef2f2;color:#991b1b;...">
    This project doesn't have a project code yet. Assign a client to issue the code, then return to create collectibles.
</div>
```

#### Pattern 21: Submit-RFP frozen denormalized fields (D-13)

`C:\Users\franc\dev\projects\pr-po\app\views\procurement.js` lines 1316-1348 — RFP doc shape:
```javascript
const rfpId = await generateRFPId(po.po_id);
const amountRequested = tranche.percentage / 100 * poTotal;

const rfpDoc = {
    rfp_id: rfpId,
    po_id: po.po_id,
    po_doc_id: poDocId,
    mrf_id: po.mrf_id || '',
    project_code: po.project_code || '',
    project_id: po.project_id || '',
    project_name: po.project_name || '',
    service_code: po.service_code || '',
    service_name: po.service_name || '',
    supplier_name: po.supplier_name,
    tranche_index: idx,
    tranche_label: tranche.label,            // ← denormalized (frozen at creation per D-13)
    tranche_percentage: tranche.percentage,  // ← denormalized
    amount_requested: amountRequested,       // ← denormalized
    invoice_number: invoiceNumber,
    due_date: dueDate,
    mode_of_payment: paymentMode === 'Other' ? paymentModeOther : paymentMode,
    // ...bank fields...
    payment_records: [],
    rfp_creator_user_id: window.getCurrentUser?.()?.uid ?? null,
    rfp_creator_name: window.getCurrentUser?.()?.full_name || window.getCurrentUser?.()?.email || 'Unknown User',
    date_submitted: serverTimestamp()
};

await addDoc(collection(db, 'rfps'), rfpDoc);
```
**Phase 85 — collectible doc shape:**
```javascript
const collId = await generateCollectibleId(scopeCode, dept);  // dept = 'projects' | 'services'
const amountRequested = tranche.percentage / 100 * contractCost;

const collDoc = {
    coll_id: collId,
    department: dept,                                   // 'projects' | 'services' (Phase 29 pattern)
    project_id: dept === 'projects' ? project.id : '', // doc id
    project_code: dept === 'projects' ? project.project_code : '',
    project_name: dept === 'projects' ? project.project_name : '',
    service_id: dept === 'services' ? service.id : '',
    service_code: dept === 'services' ? service.service_code : '',
    service_name: dept === 'services' ? service.service_name : '',
    tranche_index: idx,
    tranche_label: tranche.label,           // frozen (D-13)
    tranche_percentage: tranche.percentage, // frozen (D-13)
    amount_requested: amountRequested,      // frozen (D-13)
    contract_cost_at_creation: contractCost, // optional snapshot for audit
    description: description || '',
    due_date: dueDate,
    payment_records: [],
    created_by_user_id: window.getCurrentUser?.()?.uid ?? null,
    created_by_name: window.getCurrentUser?.()?.full_name || window.getCurrentUser?.()?.email || 'Unknown User',
    date_created: serverTimestamp()
};

await addDoc(collection(db, 'collectibles'), collDoc);
```

---

### `app/views/project-detail.js` (view — 2 cells in Financial Summary card)

**Analog:** `app/views/project-detail.js` itself — Paid + Remaining Payable cells

#### Pattern 22: Always-render zero-state cell (Phase 75 / D-06)

`C:\Users\franc\dev\projects\pr-po\app\views\project-detail.js` lines 419-430:
```javascript
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
```
**Phase 85 — insert below these (still inside the `repeat(2, 1fr)` grid at line 386):**
```javascript
<div class="form-group" style="margin-bottom: 0;">
    <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Collected</label>
    <div style="font-weight: 600; color: #059669; font-size: 1.125rem;">
        ${formatCurrency(currentCollectibles.totalCollected)}
    </div>
</div>
<div class="form-group" style="margin-bottom: 0;">
    <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Remaining Collectible</label>
    <div style="font-weight: 600; color: ${currentCollectibles.remainingCollectible > 0 ? '#ef4444' : '#059669'}; font-size: 1.125rem;">
        ${formatCurrency(currentCollectibles.remainingCollectible)}
    </div>
</div>
```
**Always renders even at zero** — no conditional wrapping.

#### Pattern 23: Aggregation alongside existing currentExpense calc

`C:\Users\franc\dev\projects\pr-po\app\views\project-detail.js` lines 770-810 — extend `refreshAndShowExpenseModal` (or whichever code path computes `currentExpense`) to also compute `currentCollectibles`:
```javascript
// existing: collect RFP total paid for payables
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
```
**Phase 85 add a sibling block:**
```javascript
let collTotalRequested = 0;
let collTotalCollected = 0;
if (projectCode) {
    const collSnap = await getDocs(
        query(collection(db, 'collectibles'), where('project_code', '==', projectCode))
    );
    collSnap.forEach(d => {
        const coll = d.data();
        collTotalRequested += parseFloat(coll.amount_requested || 0);
        collTotalCollected += (coll.payment_records || [])
            .filter(r => r.status !== 'voided')
            .reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    });
}
currentCollectibles = {
    totalRequested: collTotalRequested,
    totalCollected: collTotalCollected,
    remainingCollectible: collTotalRequested - collTotalCollected
};
```
Add module state `let currentCollectibles = { totalRequested: 0, totalCollected: 0, remainingCollectible: 0 };` next to `currentExpense` at line 17. Reset to zero in the same place line 225 resets `currentExpense`.

---

### `app/views/service-detail.js` (view — same 2 cells)

**Analog:** `app/views/service-detail.js` itself — already mirrors project-detail at lines 367-440 (Paid + Remaining Payable). Apply identical changes (Pattern 22 markup + Pattern 23 aggregation) — replace `project_code` with `service_code` in the `where()` clause; replace `currentExpense.*` cell labels with `currentServiceCollectibles.*`. State var: `let currentServiceCollectibles = { ... };`. Reset alongside `currentServiceExpense` at line 22 + line 203.

---

### `app/views/projects.js` (view — `collection_tranches` editor in create + edit forms)

**Analog (form structure):** `app/views/projects.js` itself — existing budget/contract_cost form-groups at lines 136-146

**Analog (tranche helpers):** `app/views/procurement.js` lines 76-183 (Pattern 15) — copy or import via shared module

#### Pattern 24: Form-group insertion + onchange persistence (D-10)

`C:\Users\franc\dev\projects\pr-po\app\views\projects.js` lines 136-146 (existing form-group for contract_cost):
```javascript
<div class="form-group">
    <label>Contract Cost (Optional)</label>
    <input type="number" id="contractCost" min="0" step="0.01" placeholder="0.00">
    <small class="form-hint">Leave blank if not applicable. Must be positive if provided.</small>
</div>
```
**Phase 85 insert BELOW the contract_cost form-group:**
```javascript
<div class="form-group">
    <label>Collection Tranches (Optional)</label>
    <div id="collTrancheBuilderWrapper">
        ${renderCollTrancheBuilder(currentTranches, 'projectForm')}
    </div>
    <small class="form-hint">Define how the contract cost is split into billable tranches. Must sum to 100%.</small>
</div>
```
where `renderCollTrancheBuilder` is the lifted helper from procurement.js. Pass `[]` for the create form; pass `project.collection_tranches || []` for the edit form.

#### Pattern 25: addProject / saveEdit — read tranches + validate sum=100 + persist

`C:\Users\franc\dev\projects\pr-po\app\views\projects.js` line 639 (the `addDoc(collection(db, 'projects'), {...})` write block):
```javascript
const docRef = await addDoc(collection(db, 'projects'), {
    project_code: project_code || null,
    project_name,
    client_id: clientId || null,
    client_code: clientCode || null,
    project_status,
    budget,
    contract_cost,
    personnel_user_ids: selectedPersonnel.map(u => u.id).filter(Boolean),
    // ...
});
```
**Phase 85 — before this addDoc, read + validate tranches:**
```javascript
const collectionTranches = readTranchesFromDOM('projectForm'); // helper from procurement.js
const tranchesProvided = collectionTranches.length > 0 && collectionTranches.some(t => t.label || t.percentage > 0);
if (tranchesProvided) {
    const total = collectionTranches.reduce((s, t) => s + (parseFloat(t.percentage) || 0), 0);
    if (Math.abs(total - 100) > 0.01) {
        showToast(`Collection tranches must sum to 100% (currently ${total.toFixed(2)}%)`, 'error');
        return;
    }
    // any blank labels?
    if (collectionTranches.some(t => !t.label.trim())) {
        showToast('All tranche labels must be filled in', 'error');
        return;
    }
}
// ... in addDoc payload:
collection_tranches: tranchesProvided ? collectionTranches : []
```
And `saveEdit` at line 1038 follows the same pattern (read→validate→include in updateDoc payload). Add `collection_tranches` to the `editChanges` audit array (see lines 1059-1066 for the change-tracking pattern).

#### Pattern 26: Confirmation warning when editing tranches with existing collectibles (D-25)

No direct analog (Phase 65 didn't have this guard for PO tranches). **Closest pattern:** the personnel-removal confirmation in projects.js. Quickest path — add a pre-save async check inside `saveEdit`:
```javascript
const trancheChanged = JSON.stringify(currentTranches) !== JSON.stringify(originalTranches);
if (trancheChanged && project_code) {
    const existingColl = await getDocs(
        query(collection(db, 'collectibles'), where('project_code', '==', project_code))
    );
    if (existingColl.size > 0) {
        const ok = confirm(
            `This project has ${existingColl.size} existing collectible(s). ` +
            `Existing collectibles keep their original tranche label and amount — only future collectibles will use the new tranches. Continue?`
        );
        if (!ok) return;
    }
}
```

---

### `app/views/services.js` (view — `collection_tranches` editor)

**Analog:** `app/views/services.js` itself — mirrors `projects.js` because Phase 36 unified the project + service data model. Apply identical Pattern 24, 25, 26 changes with `services` collection name and `service_code` field.

---

### `app/expense-modal.js` (shared modal — 5th tab "Collectibles")

**Analog:** `app/expense-modal.js` itself — Payables tab (Phase 71)

#### Pattern 27: Tab button markup (D-07)

`C:\Users\franc\dev\projects\pr-po\app\expense-modal.js` lines 658-672:
```javascript
<!-- Tab Navigation -->
<div class="em-tab-bar">
    <button class="expense-tab active" onclick="window._switchExpenseBreakdownTab('category')" data-tab="category"
        style="padding: 0.75rem 1.5rem; border: none; background: none; cursor: pointer; font-weight: 600; color: #1a73e8; border-bottom: 2px solid #1a73e8; margin-bottom: -2px;">
        By Category
    </button>
    <button class="expense-tab" onclick="window._switchExpenseBreakdownTab('transport')" data-tab="transport"
        style="padding: 0.75rem 1.5rem; border: none; background: none; cursor: pointer; font-weight: 600; color: #64748b;">
        Transport Fees
    </button>
    <button class="expense-tab" onclick="window._switchExpenseBreakdownTab('payables')" data-tab="payables"
        style="padding: 0.75rem 1.5rem; border: none; background: none; cursor: pointer; font-weight: 600; color: #64748b;">
        Payables
    </button>
</div>
```
**Phase 85 — add 4th button:**
```javascript
<button class="expense-tab" onclick="window._switchExpenseBreakdownTab('collectibles')" data-tab="collectibles"
    style="padding: 0.75rem 1.5rem; border: none; background: none; cursor: pointer; font-weight: 600; color: #64748b;">
    Collectibles
</button>
```

#### Pattern 28: Tab content div + switcher

`C:\Users\franc\dev\projects\pr-po\app\expense-modal.js` lines 684-687 (existing payables div) + lines 704-726 (`_switchExpenseBreakdownTab` switcher):
```javascript
<!-- Payables Tab -->
<div id="expBreakdownPayablesTab" style="display: none; margin-top: 1.5rem;">
    ${payablesHTML}
</div>

// switcher:
window._switchExpenseBreakdownTab = function(tab) {
    const categoryTab = document.getElementById('expBreakdownCategoryTab');
    const transportTab = document.getElementById('expBreakdownTransportTab');
    const payablesTab = document.getElementById('expBreakdownPayablesTab');
    if (!categoryTab || !transportTab || !payablesTab) return;

    const buttons = document.querySelectorAll('#expenseBreakdownModal .expense-tab');
    buttons.forEach(btn => {
        if (btn.dataset.tab === tab) {
            btn.style.color = '#1a73e8';
            btn.style.borderBottom = '2px solid #1a73e8';
            btn.classList.add('active');
        } else {
            btn.style.color = '#64748b';
            btn.style.borderBottom = 'none';
            btn.classList.remove('active');
        }
    });

    categoryTab.style.display = tab === 'category' ? 'block' : 'none';
    transportTab.style.display = tab === 'transport' ? 'block' : 'none';
    payablesTab.style.display = tab === 'payables' ? 'block' : 'none';
};
```
**Phase 85 — add `<div id="expBreakdownCollectiblesTab" style="display: none; margin-top: 1.5rem;">${collectiblesHTML}</div>` and extend the switcher:**
```javascript
const collectiblesTab = document.getElementById('expBreakdownCollectiblesTab');
if (!categoryTab || !transportTab || !payablesTab || !collectiblesTab) return;
// ...
collectiblesTab.style.display = tab === 'collectibles' ? 'block' : 'none';
```

#### Pattern 29: Build collectibles fetch + collectiblesHTML markup (D-07)

`C:\Users\franc\dev\projects\pr-po\app\expense-modal.js` lines 47-74 — RFP fetch for payables tab:
```javascript
// Fetch RFPs for remaining payable calculation
let rfpsForPayable = [];
if (mode === 'service') {
    const rfpSnap = await getDocs(
        query(collection(db, 'rfps'), where('service_code', '==', identifier))
    );
    rfpSnap.forEach(d => rfpsForPayable.push(d.data()));
} else {
    const projectSnapshot2 = await getDocs(
        query(collection(db, 'projects'), where('project_name', '==', identifier))
    );
    const projectForRfp = projectSnapshot2.docs[0]?.data() || {};
    const projectCode = projectForRfp.project_code || '';
    if (projectCode) {
        const rfpSnap = await getDocs(
            query(collection(db, 'rfps'), where('project_code', '==', projectCode))
        );
        rfpSnap.forEach(d => rfpsForPayable.push(d.data()));
    }
}
```
**Phase 85 — sibling block fetching collectibles by `project_code` / `service_code`.** Build `collectiblesHTML` as a single collapsible card per D-07 — mirror lines 430-474 (Payables tab markup) which produces one row per payable with status badge. For Phase 85: one row per collectible with expandable payment-history sub-row.

**Refresh hook (Phase 72):** the existing `refreshAndShowExpenseModal()` in project-detail.js / service-detail.js refreshes BOTH the cells (Pattern 23) AND opens the expense modal. Phase 85 piggybacks on this — no extra wiring needed.

---

### `app/notifications.js` (enum extension)

**Analog:** `app/notifications.js` itself — `NOTIFICATION_TYPES` enum

#### Pattern 30: Add `COLLECTIBLE_CREATED` to enum (D-21)

`C:\Users\franc\dev\projects\pr-po\app\notifications.js` lines 30-48:
```javascript
export const NOTIFICATION_TYPES = Object.freeze({
    MRF_APPROVED: 'MRF_APPROVED',
    MRF_REJECTED: 'MRF_REJECTED',
    PR_REVIEW_NEEDED: 'PR_REVIEW_NEEDED',
    TR_REVIEW_NEEDED: 'TR_REVIEW_NEEDED',
    RFP_REVIEW_NEEDED: 'RFP_REVIEW_NEEDED',
    PROJECT_STATUS_CHANGED: 'PROJECT_STATUS_CHANGED',
    REGISTRATION_PENDING: 'REGISTRATION_PENDING',
    PROPOSAL_SUBMITTED: 'PROPOSAL_SUBMITTED',
    PROPOSAL_DECIDED: 'PROPOSAL_DECIDED',
    MRF_SUBMITTED: 'MRF_SUBMITTED',
    PR_DECIDED: 'PR_DECIDED',
    TR_DECIDED: 'TR_DECIDED',
    RFP_PAID: 'RFP_PAID',
    PO_DELIVERED: 'PO_DELIVERED',
    PROJECT_COST_CHANGED: 'PROJECT_COST_CHANGED'
});
```
**Phase 85 — add one entry:**
```javascript
COLLECTIBLE_CREATED: 'COLLECTIBLE_CREATED'
```
Plus a `TYPE_META` entry at lines 68-85:
```javascript
COLLECTIBLE_CREATED: { label: 'New Collectible', icon: '$', color: '#059669' }
```
(Green to signal money-in, like `RFP_PAID` at line 83.)

---

### `firestore.rules` (security)

**Analog:** ADDING NEW COLLECTIONS template (lines 6-39) + `match /rfps/{rfpId}` block (lines 443-455)

#### Pattern 31: New `match /collectibles/{collId}` block (D-24)

Template (lines 13-26):
```
//   match /[collection_name]/{docId} {
//     // All active users can read
//     allow read: if isActiveUser();
//
//     // Create/Update: super_admin, operations_admin
//     allow create: if hasRole(['super_admin', 'operations_admin']);
//     allow update: if hasRole(['super_admin', 'operations_admin']);
//     allow delete: if hasRole(['super_admin', 'operations_admin']);
//   }
```
RFP analog (lines 443-455):
```
match /rfps/{rfpId} {
    allow read: if isActiveUser();
    allow create: if hasRole(['super_admin', 'procurement']);
    allow update: if hasRole(['super_admin', 'finance', 'procurement']);
    allow delete: if hasRole(['super_admin', 'procurement']);
}
```
**Phase 85 — add to firestore.rules (insert BEFORE the closing `}` of the service block at line 495), per D-24 Operations Admin + Finance:**
```
// =============================================
// collectibles collection (Phase 85)
// =============================================
// Manual money-in tracking against projects + services. Mirrors rfps schema:
// payment_records array with void semantics, denormalized tranche fields.
match /collectibles/{collId} {
    // All active users can read (financial summary cells need read on project-detail / service-detail)
    allow read: if isActiveUser();

    // Create / Update: operations_admin, finance, super_admin
    // (Operations Admin or Finance files collectibles; Finance records payments via array updateDoc)
    allow create: if hasRole(['super_admin', 'operations_admin', 'finance']);
    allow update: if hasRole(['super_admin', 'operations_admin', 'finance']);

    // Delete: zero-payment cancellation (client-side guard) — same roles
    allow delete: if hasRole(['super_admin', 'operations_admin', 'finance']);
}
```
**Per D-25:** the `collection_tranches` field on `projects` / `services` docs is governed by EXISTING rules (lines 200-305 / services equivalent). No edits to those blocks needed.

---

## Shared Patterns

### Cross-cutting #1: Window functions for onclick (CLAUDE.md)

**Source:** `C:\Users\franc\dev\projects\pr-po\CLAUDE.md` "Window Functions for Event Handlers" section + `C:\Users\franc\dev\projects\pr-po\app\views\finance.js` `attachWindowFunctions()` pattern

**Apply to:** every Phase 85 function called from HTML — must be on `window`. Comprehensive list:
- `window.filterCollectiblesTable`
- `window.changeCollectiblesPage`
- `window.openCreateCollectibleModal`
- `window.submitCollectible`
- `window.openRecordCollectiblePaymentModal`
- `window.submitCollectiblePayment`
- `window.voidCollectiblePayment`
- `window.toggleCollPaymentHistory` (for D-17 expandable row)
- `window.exportCollectiblesCSV`
- `window.cancelCollectible`
- `window.showCollectibleContextMenu`
- `window.toggleCollPaymentOtherField` (D-14 Other reveal)
- `window.addCollTranche` / `window.removeCollTranche` / `window.recalculateCollTranches` (if NOT lifted into shared module)

All must be matched by `delete window.X;` calls in the relevant view's `destroy()`.

### Cross-cutting #2: Status case-sensitivity (CLAUDE.md)

**Apply to:** all Phase 85 status comparisons — exact strings: `'Pending'`, `'Partially Paid'`, `'Fully Paid'`, `'Overdue'`. NEVER lowercase. Procurement.js line 268-277 `deriveRFPStatus` is the canonical pattern.

### Cross-cutting #3: Read-modify-write for `payment_records` (D-16, Phase 65 D-60+)

**Source:** `app/views/finance.js` lines 474-492 (Pattern 12)

**Apply to:** `voidCollectiblePayment` only. The CREATE-payment path in Pattern 11 uses `arrayUnion` (atomic append) — no read-modify-write needed for adds. Voids must read full array, map to mutate one entry, write full array back. **Do NOT use Firestore `arrayRemove` then `arrayUnion`** — order isn't guaranteed and audit timestamps would be lost.

### Cross-cutting #4: Fire-and-forget notifications (Phase 83 + 84)

**Source:** `app/views/procurement.js` lines 1349-1364 (Pattern 19)

**Apply to:** the single `COLLECTIBLE_CREATED` trigger (D-21). Wrap in try/catch; `console.error` on failure; **NEVER re-throw** — collectible creation must succeed even if notification fan-out fails.

### Cross-cutting #5: Currency + date formatters

**Source:** `app/utils.js` lines 36-89

**Apply to:** all amount displays (`formatCurrency`), all due-date / created-date displays (`formatDate` for date-string `due_date`, `formatTimestamp` for `serverTimestamp` `date_created`).

### Cross-cutting #6: Department badge (Phase 38)

**Source:** `app/components.js` lines 487-493 (Pattern 14 reference in `<specifics>` of CONTEXT.md)

**Apply to:** D-05 Department column in the Collectibles table:
```javascript
${getDeptBadgeHTML({ department: coll.department })}
```
Already imported in finance.js line 9 (`getDeptBadgeHTML`). Resolves to `Projects` (blue) / `Services` (purple) badge.

### Cross-cutting #7: Tab navigation does NOT call destroy (CLAUDE.md)

**Source:** CLAUDE.md "CRITICAL - Tab Navigation" — router calls `init(activeTab)` but NOT `destroy()` when switching sub-tabs within the same view.

**Apply to:** Phase 85 must guard `initCollectiblesTab` against double-attaching `onSnapshot` listeners on repeat-navigation. Pattern: check `if (listeners.some(l => l._isCollListener))` or simpler — let the existing `listeners[]` cleanup in `destroy()` handle it (Phase 65 also doesn't guard re-init; the unsubscribe is cheap because tab-switch doesn't trigger destroy).

### Cross-cutting #8: Skeleton + empty-state row (no spinner)

**Source:** `finance.js` line 2047 (Loading row), lines 721-730 (empty-state) + `components.js` line 506-510 (`skeletonTableRows`)

**Apply to:** Collectibles table initial render (Loading), filter-no-match (empty with hint), full-empty (zero collectibles overall — different copy).

---

## No Analog Found

**None.** Every Phase 85 surface has a Phase 65 (or Phase 71/75/78/83/84) analog in the live codebase. The single conceptually new behavior — **partial-payment validation against remaining balance** (D-15) — is a small validation tweak inside an existing payment-modal flow, not a new pattern.

---

## Risk / Lesson Reminders for Planner

1. **D-20 ID generator must NOT use `generateSequentialId`** (utils.js line 173). That helper is year-counter-keyed (`PREFIX-YYYY-###`) and Phase 65.4 documented year-counter collisions. Use the per-PO `generateRFPId` template (procurement.js lines 220-239) — query collectibles WHERE project_code (or service_code) match, parse last segment with `lastIndexOf('-')`, return `COLL-{CODE}-{n}` with NO zero-padding (Phase 65.4 key decision).

2. **D-24 security rules deploy in same commit as first write.** Phase 65 D-71 lesson: without rules, even Super Admin gets `Missing or insufficient permissions`. Plan must order: (a) write rules block + deploy via Firebase console, (b) then ship the JS code that writes to `collectibles`. CLAUDE.md "ADDING NEW COLLECTIONS" template at firestore.rules line 6 says this verbatim.

3. **D-25 `collection_tranches` rule reuse** — already covered by existing project/service edit rules (lines 200-305). No new field-level rule needed; just don't accidentally lock `collection_tranches` (Phase 78's `project_code` schema-lock pattern is NOT the right analog here).

4. **D-12 strict 1:1 dedup** — Pattern 20 uses `tranche_index` (position-based) for dedup, not `tranche_label`. If users rename a tranche on the project AFTER a collectible is created (D-25 allowed), `tranche_index` keeps the link stable. Keep this in the new collectibles too.

5. **D-13 frozen denorm fields** — `tranche_label`, `tranche_percentage`, `amount_requested` are copied at create-time and NEVER updated when the project's tranches change. Pattern 21 doc shape captures this. Future-tranche-rename must NOT cascade to historic collectibles.

6. **`excludeActor: true` is the default** in `createNotificationForRoles` (notifications.js line 546). For D-21, when a Finance user is the actor (creating their own collectible), they won't be self-notified. This is correct — confirmed in Phase 83 Pitfall 6.

7. **Phase 36 modal unification (expense-modal.js)** — the Collectibles tab works for both project + service modes via the same `mode === 'service'` branching (lines 27-45). Don't duplicate; extend the existing branches.

8. **D-04 pagination resets on filter change.** When any filter changes, set `collCurrentPage = 1` (mirror finance.js line 511). Otherwise users land on page 7 of a 1-page filtered set.

## Metadata

**Analog search scope:** `app/views/finance.js`, `app/views/procurement.js`, `app/views/project-detail.js`, `app/views/service-detail.js`, `app/views/projects.js`, `app/views/services.js`, `app/expense-modal.js`, `app/notifications.js`, `app/utils.js`, `app/components.js`, `firestore.rules`, plus Phase 65/65.1/65.4/65.7/65.10/71/75/78 SUMMARY docs in `.planning/milestones/v3.2-phases/`.

**Files scanned:** 11 source files + 7 phase-summary docs.

**Pattern extraction date:** 2026-05-02

---

*Phase: 85-collectibles-tracking*
*Patterns mapped: 2026-05-02*
