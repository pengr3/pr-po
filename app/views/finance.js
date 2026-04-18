/* ========================================
   FINANCE VIEW - Complete Implementation
   PR/TR Approval, PO Generation, Project Expenses
   ======================================== */

import { db, collection, query, where, onSnapshot, getDocs, getDoc, doc, updateDoc, addDoc, getAggregateFromServer, sum, count, serverTimestamp, arrayUnion, arrayRemove } from '../firebase.js';
import { showToast, showLoading, formatCurrency, formatDate, formatTimestamp, getStatusClass, downloadCSV, escapeHTML } from '../utils.js';
import { showExpenseBreakdownModal } from '../expense-modal.js';
import { getMRFLabel, getDeptBadgeHTML, skeletonTableRows, createModal } from '../components.js';
import { showProofModal } from '../proof-modal.js';

// ========================================
// UTILITY: Debounce helper for search inputs
// ========================================
function debounce(callback, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            callback(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Derive RFP payment status from payment_records arithmetic.
 * Status is NEVER stored in Firestore — always computed at render time.
 * Priority: Fully Paid > Overdue > Partially Paid > Pending
 */
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

// Format PO date - handles Firestore Timestamps, {seconds} objects, and strings
function formatPODate(po) {
    const ts = po.date_issued;
    if (ts) {
        try {
            if (typeof ts.toDate === 'function') {
                return ts.toDate().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
            }
            if (ts.seconds != null) {
                return new Date(ts.seconds * 1000).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
            }
            const d = new Date(ts);
            if (!isNaN(d.getTime())) {
                return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
            }
        } catch (e) { /* fall through */ }
    }
    return po.date_issued_legacy ? formatDate(po.date_issued_legacy) : 'N/A';
}

// View state
let listeners = [];
let materialPRs = [];
let transportRequests = [];
let poData = [];
// Cache of MRF docs keyed by mrf_id for date_needed and justification lookups
let mrfCache = new Map(); // mrf_id -> { date_needed, justification }
let approvedTRsThisMonthCount = 0;
let currentPRForApproval = null;
let currentPRForRejection = null;
let projectExpenses = [];
let approvalSignaturePad = null;
let currentApprovalTarget = null;

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

// Sort state for Project List
let projectExpenseSortColumn = 'projectName';
let projectExpenseSortDirection = 'asc';

// TTL cache for project expenses (avoid re-fetching on tab switches)
const PROJECT_EXPENSES_TTL_MS = 300000; // 5 minutes
let _projectExpensesCachedAt = 0;

// Service & Recurring expense data + sort state
let serviceExpenses = [];
let recurringExpenses = [];
let serviceExpenseSortColumn = 'serviceName';
let serviceExpenseSortDirection = 'asc';
let recurringExpenseSortColumn = 'serviceName';
let recurringExpenseSortDirection = 'asc';

// TTL caches for service/recurring expenses
let _serviceExpensesCachedAt = 0;
let _recurringExpensesCachedAt = 0;

// Active sub-tab within the "Project List" main tab
// 'projects' | 'services' | 'recurring'
let activeExpenseSubTab = 'projects';

// Search state for expense sub-tabs
let projectExpenseSearchTerm = '';
let serviceExpenseSearchTerm = '';
let recurringExpenseSearchTerm = '';

// Sort state for Purchase Orders
let poSortColumn = 'date_issued';
let poSortDirection = 'desc';

// Sort state for Material PRs (Pending Approvals)
let prSortColumn = 'date_generated';
let prSortDirection = 'desc';

// Sort state for Transport Requests (Pending Approvals)
let trSortColumn = 'date_submitted';
let trSortDirection = 'desc';

// Department filter state for Pending Approvals and POs
let activeDeptFilter = ''; // '' = All, 'projects' = Projects only, 'services' = Services only

// Phase 73.3: Scroll-hide/show handler for sticky Finance sub-nav
let _financeNavScrollHandler = null;
let _financeNavLastScrollY = 0;

/**
 * Apply department filter to all three finance tables.
 * Called by the dept filter dropdown onchange handler.
 */
function applyFinanceDeptFilter(value) {
    activeDeptFilter = value;
    renderMaterialPRs();
    renderTransportRequests();
    renderPOs();
}

/**
 * Switch between Projects, Services, and Recurring sub-tabs in the Project List section.
 * @param {string} tab - 'projects' | 'services' | 'recurring'
 */
function switchExpenseSubTab(tab) {
    activeExpenseSubTab = tab;

    // Show/hide sections
    ['projects', 'services', 'recurring'].forEach(t => {
        const section = document.getElementById(`${t}ExpenseSection`);
        if (section) section.style.display = t === tab ? '' : 'none';
    });

    // Update sub-tab button active states
    document.querySelectorAll('.expense-subtab-btn').forEach(btn => {
        const isActive = btn.dataset.tab === tab;
        btn.classList.toggle('active', isActive);
        btn.style.color = isActive ? '#1a73e8' : '#64748b';
        btn.style.borderBottomColor = isActive ? '#1a73e8' : 'transparent';
    });

    // Load data for the active sub-tab if not yet loaded
    if (tab === 'services' && serviceExpenses.length === 0) {
        refreshServiceExpenses();
    } else if (tab === 'recurring' && recurringExpenses.length === 0) {
        refreshRecurringExpenses();
    } else if (tab === 'services') {
        renderServiceExpensesTable();
    } else if (tab === 'recurring') {
        renderRecurringExpensesTable();
    }
}

/**
 * Attach all window functions for use in onclick handlers
 * This needs to be called every time init() runs to ensure
 * functions are available after tab navigation
 */
function attachWindowFunctions() {
    // PR/TR Review Functions
    window.refreshPRs = refreshPRs;
    window.viewPRDetails = viewPRDetails;
    window.viewTRDetails = viewTRDetails;
    window.approveTR = approveTR;
    window.rejectPR = rejectPR;

    // Signature Functions
    window.clearApprovalSignature = clearApprovalSignature;
    window.approvePRWithSignature = approvePRWithSignature;

    // Approval Modal Functions
    window.showApprovalModal = showApprovalModal;
    window.closeApprovalModal = closeApprovalModal;
    window.confirmApproval = confirmApproval;

    // Modal Management
    window.closePRModal = closePRModal;
    window.closeRejectionModal = closeRejectionModal;
    window.submitRejection = submitRejection;

    // PO Functions
    window.refreshPOs = refreshPOs;
    window.exportPOsCSV = exportPOsCSV;
    window.promptPODocument = promptPODocument;
    window.generatePODocument = generatePODocument;
    window.viewPODetailsFromRFP = viewPODetailsFromRFP;

    // Proof URL helper — uses shared modal from proof-modal.js
    window.financeShowProofModal = function(poId, currentUrl, currentRemarks) {
        showProofModal(poId, currentUrl || '', false, null, currentRemarks || '');
    };

    // Project Expense Functions
    window.refreshProjectExpenses = refreshProjectExpenses;
    window.showProjectExpenseModal = (name) => showExpenseBreakdownModal(name, { mode: 'project' });
    // closeProjectExpenseModal replaced by shared _closeExpenseBreakdownModal in expense-modal.js
    window.sortProjectExpenses = sortProjectExpenses;
    window.sortPOs = sortPOs;
    window.sortMaterialPRs = sortMaterialPRs;
    window.sortTransportRequests = sortTransportRequests;
    window.applyFinanceDeptFilter = applyFinanceDeptFilter;

    // Service/Recurring Expense Functions
    window.refreshServiceExpenses = () => refreshServiceExpenses(true);
    window.refreshRecurringExpenses = () => refreshRecurringExpenses(true);
    window.showServiceExpenseModal = (code, budget) => showExpenseBreakdownModal(code, { mode: 'service', budget });
    window.sortServiceExpenses = sortServiceExpenses;
    window.sortRecurringExpenses = sortRecurringExpenses;
    window.switchExpenseSubTab = switchExpenseSubTab;

    // Search debounced functions
    window.debouncedProjectExpenseSearch = debounce(() => {
        projectExpenseSearchTerm = document.getElementById('projectExpenseSearch')?.value.toLowerCase() || '';
        renderProjectExpensesTable();
    }, 300);
    window.debouncedServiceExpenseSearch = debounce(() => {
        serviceExpenseSearchTerm = document.getElementById('serviceExpenseSearch')?.value.toLowerCase() || '';
        renderServiceExpensesTable();
    }, 300);
    window.debouncedRecurringExpenseSearch = debounce(() => {
        recurringExpenseSearchTerm = document.getElementById('recurringExpenseSearch')?.value.toLowerCase() || '';
        renderRecurringExpensesTable();
    }, 300);

    // Payables tab window functions
    window.filterRFPTable = filterRFPTable;
    window.filterPOSummaryTable = filterPOSummaryTable;
    window.togglePOExpand = togglePOExpand;
    window.togglePOCardExpand = togglePOCardExpand;
    window.changePOSummaryPage = changePOSummaryPage;
    window.openRecordPaymentModal = openRecordPaymentModal;
    window.voidPaymentRecord = voidPaymentRecord;
    window.submitPaymentRecord = submitPaymentRecord;
}

// ========================================
// PAYABLES TAB
// ========================================

/**
 * Open the Record Payment modal for the given RFP document ID.
 * Amount is read-only (full tranche amount). Finance user supplies date, method, reference.
 */
function openRecordPaymentModal(rfpDocId) {
    const rfp = rfpsData.find(r => r.id === rfpDocId);
    if (!rfp) { showToast('RFP not found', 'error'); return; }

    const today = new Date().toISOString().split('T')[0];

    const bankCardStyle = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;';
    const bankLabelStyle = 'font-size:0.6875rem;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;';
    const bankRowStyle = 'display:flex;justify-content:space-between;align-items:center;font-size:0.8125rem;color:#1e293b;padding:2px 0;';
    const bankRowLabelStyle = 'color:#64748b;font-weight:500;';

    const buildBankCard = (label, bankName, acctName, acctNo) => `
        <div style="${bankCardStyle}">
            <div style="${bankLabelStyle}">${label}</div>
            <div style="${bankRowStyle}"><span style="${bankRowLabelStyle}">Bank</span><span style="font-weight:600;">${escapeHTML(bankName)}</span></div>
            ${acctName ? `<div style="${bankRowStyle}"><span style="${bankRowLabelStyle}">Account Name</span><span>${escapeHTML(acctName)}</span></div>` : ''}
            ${acctNo ? `<div style="${bankRowStyle}"><span style="${bankRowLabelStyle}">Account No.</span><span style="font-family:monospace;">${escapeHTML(acctNo)}</span></div>` : ''}
        </div>`;

    const bankInfo = rfp.mode_of_payment === 'Bank Transfer' && rfp.bank_name
        ? `<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
               ${buildBankCard('Primary Account', rfp.bank_name, rfp.bank_account_name, rfp.bank_details)}
               ${rfp.alt_bank_name ? buildBankCard('Alternative Account', rfp.alt_bank_name, rfp.alt_bank_account_name, rfp.alt_bank_details) : ''}
           </div>`
        : '';

    // Build "Existing Payments" section
    const records = rfp.payment_records || [];
    const activeRecords = records.filter(r => r.status !== 'voided');
    let existingPaymentsHtml = '';
    if (activeRecords.length > 0) {
        const rowsHtml = activeRecords.map(r => `
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;">
                <div style="display:flex;flex-direction:column;gap:2px;">
                    <span style="font-size:0.8125rem;font-weight:600;color:#1e293b;">${formatCurrency(r.amount)}</span>
                    <span style="font-size:0.75rem;color:#64748b;">${r.date || ''}${r.reference ? ' &mdash; ' + escapeHTML(r.reference) : ''}</span>
                </div>
                <button class="btn btn-sm" style="background:#fef2f2;color:#991b1b;border:1px solid #fecaca;padding:4px 10px;font-size:0.75rem;border-radius:4px;cursor:pointer;"
                    onclick="window.voidPaymentRecord('${rfpDocId}', '${escapeHTML(r.payment_id)}'); document.getElementById('recordPaymentModal').remove();">Void</button>
            </div>`).join('');
        existingPaymentsHtml = `
            <div style="margin-bottom:1.25rem;padding-bottom:1.25rem;border-bottom:1px solid #e5e7eb;">
                <div style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">Existing Payments (${activeRecords.length})</div>
                <div style="display:flex;flex-direction:column;gap:6px;">${rowsHtml}</div>
            </div>`;
    }

    // Determine if RFP is fully paid to conditionally show/hide the new-payment form
    const totalActivePaid = activeRecords.reduce((s, r) => s + (r.amount || 0), 0);
    const isFullyPaid = totalActivePaid >= (rfp.amount_requested || 0) && (rfp.amount_requested || 0) > 0;

    const newPaymentFormHtml = isFullyPaid
        ? `<div style="padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;color:#065f46;font-size:0.875rem;">
               This RFP is fully paid. You can void existing payments above to record a correction.
           </div>`
        : `<div style="display:flex;flex-direction:column;gap:1rem;">
                <div>
                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Amount</label>
                    <input type="text" id="paymentAmount" class="form-control" value="${formatCurrency(rfp.amount_requested || 0)}" readonly
                           style="width:100%;background:#f1f5f9;cursor:not-allowed;">
                </div>
                <div>
                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Payment Date <span style="color:#ea4335;">*</span></label>
                    <input type="date" id="paymentDate" class="form-control" value="${today}" style="width:100%;" required>
                </div>
                <div>
                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Reference Number</label>
                    <input type="text" id="paymentReference" class="form-control" placeholder="Check number, transfer ref, etc." style="width:100%;">
                </div>
            </div>
            <div id="paymentErrorAlert" style="display:none;margin-top:1rem;padding:8px 12px;background:#fef2f2;color:#991b1b;border-radius:6px;font-size:0.875rem;"></div>`;

    const footerHtml = isFullyPaid
        ? `<button class="btn btn-outline" onclick="document.getElementById('recordPaymentModal').remove()">Close</button>`
        : `<button class="btn btn-outline" onclick="document.getElementById('recordPaymentModal').remove()">Discard Payment</button>
           <button class="btn btn-primary" style="background:#059669;border-color:#059669;" onclick="window.submitPaymentRecord('${rfpDocId}')">Record Payment</button>`;

    const modalHtml = `
    <div id="recordPaymentModal" class="modal" style="display:flex;">
        <div class="modal-content" style="max-width:480px;margin:auto;">
            <div class="modal-header">
                <h2 style="font-size:1.125rem;font-weight:600;">Record Payment &mdash; ${escapeHTML(rfp.rfp_id)}</h2>
                <button class="modal-close" onclick="document.getElementById('recordPaymentModal').remove()">&times;</button>
            </div>
            <div class="modal-body" style="padding:1.5rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
                    <div>
                        <div style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Supplier</div>
                        <div style="font-weight:600;color:#1e293b;">${escapeHTML(rfp.supplier_name)}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">RFP Amount</div>
                        <div style="font-weight:600;color:#1e293b;">${formatCurrency(rfp.amount_requested || 0)}</div>
                    </div>
                    <div style="grid-column:span 2;">
                        <div style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Mode of Payment</div>
                        <div style="font-weight:600;color:#1e293b;">${escapeHTML(rfp.mode_of_payment || 'Not specified')}</div>
                        ${bankInfo}
                    </div>
                    <div style="grid-column:span 2;">
                        <div style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Proof</div>
                        <div style="font-weight:600;color:#1e293b;">${rfp.invoice_number && rfp.invoice_number.startsWith('http')
                            ? `<a href="${escapeHTML(rfp.invoice_number)}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;text-decoration:underline;">${escapeHTML(rfp.invoice_number)}</a>`
                            : escapeHTML(rfp.invoice_number || 'Not provided')}</div>
                    </div>
                </div>
                ${existingPaymentsHtml}
                ${newPaymentFormHtml}
            </div>
            <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:1rem 1.5rem;border-top:1px solid #e5e7eb;">
                ${footerHtml}
            </div>
        </div>
    </div>`;

    const existing = document.getElementById('recordPaymentModal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * Validate and submit a payment record for an RFP.
 * Appends to Firestore rfps document payment_records array via arrayUnion.
 */
async function submitPaymentRecord(rfpDocId) {
    const rfp = rfpsData.find(r => r.id === rfpDocId);
    if (!rfp) { showToast('RFP not found', 'error'); return; }

    const paymentDate = document.getElementById('paymentDate')?.value;
    const reference = document.getElementById('paymentReference')?.value?.trim() || '';
    const errorEl = document.getElementById('paymentErrorAlert');

    if (!paymentDate) {
        if (errorEl) { errorEl.textContent = 'Payment date is required.'; errorEl.style.display = 'block'; }
        return;
    }

    const paymentRecord = {
        payment_id: `PAY-${Date.now()}`,
        amount: rfp.amount_requested,
        date: paymentDate,
        method: rfp.mode_of_payment || '',
        reference: reference,
        status: 'active',
        recorded_at: new Date().toISOString()
    };

    try {
        await updateDoc(doc(db, 'rfps', rfpDocId), {
            payment_records: arrayUnion(paymentRecord)
        });
        document.getElementById('recordPaymentModal')?.remove();
        showToast(`Payment recorded for ${rfp.rfp_id}`, 'success');
    } catch (error) {
        console.error('[Finance] Payment record error:', error);
        if (errorEl) {
            errorEl.textContent = 'Failed to record payment. Check your connection and try again.';
            errorEl.style.display = 'block';
        }
    }
}

/**
 * Void a payment record by its payment_id. Uses read-modify-write to preserve audit trail.
 * Voided records remain in the array with status: 'voided' and are excluded from paid totals.
 */
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

/**
 * Filter Table 1 (RFP Processing) by reading its own filter dropdowns.
 */
function filterRFPTable() {
    rfpStatusFilter = document.getElementById('rfpStatusFilter')?.value || '';
    rfpDeptFilter = document.getElementById('rfpDeptFilter')?.value || '';
    rfpSearchQuery = document.getElementById('rfpSearchInput')?.value?.trim()?.toLowerCase() || '';
    renderRFPTable();
}

/**
 * Filter Table 2 (PO Payment Summary) by reading its own filter dropdowns.
 */
function filterPOSummaryTable() {
    poSummaryStatusFilter = document.getElementById('poSummaryStatusFilter')?.value || '';
    poSummaryDeptFilter = document.getElementById('poSummaryDeptFilter')?.value || '';
    poSummarySearchQuery = document.getElementById('poSummarySearchInput')?.value?.trim()?.toLowerCase() || '';
    poSummaryCurrentPage = 1;
    renderPOSummaryTable();
}

/**
 * Toggle expanded sub-table row for a PO in the PO Payment Summary table.
 */
function togglePOExpand(poId) {
    const row = document.getElementById(`po-expand-${poId}`);
    const chevron = document.getElementById(`po-chevron-${poId}`);
    if (!row) return;
    const isOpen = row.style.display === 'table-row';
    row.style.display = isOpen ? 'none' : 'table-row';
    if (chevron) chevron.innerHTML = isOpen ? '&#9654;' : '&#9660;';
}

/**
 * Toggle the fc-sub-list for a PO Summary card on mobile (Phase 73.1).
 * Uses DISTINCT IDs (po-card-expand-*, po-card-chevron-*) to avoid colliding with
 * desktop togglePOExpand which targets <tr> elements and sets display: table-row.
 */
function togglePOCardExpand(safePoId) {
    const expandEl = document.getElementById('po-card-expand-' + safePoId);
    const chevron = document.getElementById('po-card-chevron-' + safePoId);
    const btnLabel = document.getElementById('po-card-btn-label-' + safePoId);
    if (!expandEl) return;
    const isOpen = expandEl.style.display === 'block';
    expandEl.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.innerHTML = isOpen ? '&#9654;' : '&#9660;';
    if (btnLabel) btnLabel.textContent = isOpen ? 'Show Tranches' : 'Hide Tranches';
}

/**
 * Change the current page of the PO Payment Summary table.
 * @param {string|number} direction - 'prev', 'next', or a page number
 */
function changePOSummaryPage(direction) {
    const poMap = buildPOMap(rfpsData);
    let entryCount = 0;
    poMap.forEach(() => entryCount++);
    const totalPages = Math.ceil(entryCount / poSummaryItemsPerPage);

    if (direction === 'prev' && poSummaryCurrentPage > 1) {
        poSummaryCurrentPage--;
    } else if (direction === 'next' && poSummaryCurrentPage < totalPages) {
        poSummaryCurrentPage++;
    } else if (typeof direction === 'number') {
        poSummaryCurrentPage = direction;
    }

    renderPOSummaryTable();
}

/**
 * Render or update the pagination controls for the PO Payment Summary table.
 * Inserts the pagination div after the table if it doesn't exist yet.
 */
function updatePOSummaryPagination(totalPages, startIndex, endIndex, totalItems) {
    let paginationDiv = document.getElementById('poSummaryPagination');

    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.id = 'poSummaryPagination';
        paginationDiv.className = 'pagination-container';

        const tbody = document.getElementById('poSummaryTableBody');
        const table = tbody?.closest('table');
        if (table && table.parentNode) {
            table.parentNode.insertBefore(paginationDiv, table.nextSibling);
        }
    }

    if (totalPages <= 1) {
        paginationDiv.style.display = 'none';
        return;
    }
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
                </button>
            `;
        } else if (i === poSummaryCurrentPage - 2 || i === poSummaryCurrentPage + 2) {
            paginationHTML += '<span class="pagination-ellipsis">...</span>';
        }
    }

    paginationHTML += `
            <button class="pagination-btn" onclick="window.changePOSummaryPage('next')" ${poSummaryCurrentPage === totalPages ? 'disabled' : ''}>
                Next &rarr;
            </button>
        </div>
    `;

    paginationDiv.innerHTML = paginationHTML;
}

/**
 * Build a mobile card for a single RFP (Phase 73.1).
 * Mirrors the desktop tr rendering in renderRFPTable — due_date rendered raw (string, not Timestamp).
 */
function buildRFPCard(rfp) {
    const status = deriveRFPStatus(rfp);
    const totalPaid = (rfp.payment_records || [])
        .filter(r => r.status !== 'voided')
        .reduce((s, r) => s + (r.amount || 0), 0);
    const balance = (rfp.amount_requested || 0) - totalPaid;
    const isOverdue = status === 'Overdue';
    const deptLabel = rfp.service_code
        ? escapeHTML(rfp.service_code)
        : escapeHTML(rfp.project_code || '');
    const badgeStyle = statusBadgeColors[status] || '';

    const canEdit = window.canEditTab?.('finance');
    const showEditControls = canEdit !== false;
    const actionBtn = showEditControls
        ? (status === 'Fully Paid'
            ? '<button class="btn btn-sm btn-outline" onclick="window.openRecordPaymentModal(\'' + rfp.id + '\')">Manage Payments</button>'
            : '<button class="btn btn-sm btn-primary" onclick="window.openRecordPaymentModal(\'' + rfp.id + '\')">Record Payment</button>')
        : '';

    const poRefDisplay = rfp.po_id
        ? '<a href="javascript:void(0)" onclick="window.viewPODetailsFromRFP(\'' + (rfp.po_doc_id || '') + '\')" style="color:#1a73e8;text-decoration:none;cursor:pointer;">' + escapeHTML(rfp.po_id) + '</a>'
        : rfp.tr_id
        ? '<span style="color:#1e293b;font-weight:600;">' + escapeHTML(rfp.tr_id) + '</span>'
        : '<span style="color:#999;">-</span>';

    return `
        <div class="fc-card${isOverdue ? ' fc-overdue' : ''}">
            <div class="fc-card-header">
                <span class="fc-card-id">${escapeHTML(rfp.rfp_id || '')}</span>
                <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;${badgeStyle}">${status}</span>
            </div>
            <div class="fc-card-body">
                <div class="fc-card-row"><span class="fc-label">Supplier</span><span class="fc-value">${escapeHTML(rfp.supplier_name || '')}</span></div>
                <div class="fc-card-row"><span class="fc-label">PO Ref</span><span class="fc-value">${poRefDisplay}</span></div>
                <div class="fc-card-row"><span class="fc-label">Project / Service</span><span class="fc-value">${deptLabel}</span></div>
                <div class="fc-card-row"><span class="fc-label">Tranche</span><span class="fc-value">${escapeHTML(rfp.tranche_label || '')} (${rfp.tranche_percentage || 0}%)</span></div>
                <div class="fc-card-row"><span class="fc-label">Amount</span><span class="fc-value fc-amount">${formatCurrency(rfp.amount_requested || 0)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Paid</span><span class="fc-value">${formatCurrency(totalPaid)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Balance</span><span class="fc-value">${formatCurrency(balance)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Due Date</span><span class="fc-value">${rfp.due_date || 'N/A'}</span></div>
            </div>
            ${actionBtn ? '<div class="fc-card-actions">' + actionBtn + '</div>' : ''}
        </div>`;
}

/**
 * Render Table 1: flat RFP list into rfpTableBody.
 * No chevron column, no expand/history rows per D-02.
 */
function renderRFPTable() {
    const tbody = document.getElementById('rfpTableBody');
    if (!tbody) return;

    const canEdit = window.canEditTab?.('finance');
    const showEditControls = canEdit !== false;

    // Apply Table 1 filters
    let displayed = rfpsData;

    // Default: hide Fully Paid RFPs unless explicitly filtered to show them
    if (rfpStatusFilter !== 'Fully Paid') {
        displayed = displayed.filter(r => deriveRFPStatus(r) !== 'Fully Paid');
    }

    if (rfpStatusFilter) {
        displayed = displayed.filter(r => deriveRFPStatus(r) === rfpStatusFilter);
    }
    if (rfpDeptFilter) {
        displayed = displayed.filter(r => {
            const dept = r.service_code ? 'services' : 'projects';
            return dept === rfpDeptFilter;
        });
    }
    if (rfpSearchQuery) {
        displayed = displayed.filter(r => {
            const code = (r.service_code || r.project_code || '').toLowerCase();
            const pn = posNameMap.get(r.po_id) || {};
            const name = (r.service_name || r.project_name || pn.service_name || pn.project_name || '').toLowerCase();
            const poId = (r.po_id || '').toLowerCase();
            const rfpId = (r.rfp_id || '').toLowerCase();
            return code.includes(rfpSearchQuery) || name.includes(rfpSearchQuery) || poId.includes(rfpSearchQuery) || rfpId.includes(rfpSearchQuery);
        });
    }

    // D-20: Sort by status priority asc (unpaid first globally), then PO Ref asc, tranche_percentage asc
    const statusPriority = { 'Pending': 1, 'Overdue': 2, 'Partially Paid': 3, 'Fully Paid': 4 };
    displayed = [...displayed].sort((a, b) => {
        const aPriority = statusPriority[deriveRFPStatus(a)] || 0;
        const bPriority = statusPriority[deriveRFPStatus(b)] || 0;
        if (aPriority !== bPriority) return aPriority - bPriority;
        const poCompare = (a.po_id || '').localeCompare(b.po_id || '');
        if (poCompare !== 0) return poCompare;
        return (a.tranche_percentage || 0) - (b.tranche_percentage || 0);
    });

    if (displayed.length === 0) {
        const isFiltered = rfpStatusFilter || rfpDeptFilter || rfpSearchQuery;
        const emptyMsg = isFiltered
            ? 'No RFPs match the selected filters. Clear filters to see all requests.'
            : 'No outstanding payment requests. Use the status filter to view Fully Paid RFPs, or check the PO Payment Summary below.';
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:2rem;color:#64748b;">' + emptyMsg + '</td></tr>';
        const rfpCardListEmpty = document.getElementById('rfpCardList');
        if (rfpCardListEmpty) rfpCardListEmpty.innerHTML = '<div class="fc-empty">' + emptyMsg + '</div>';
        return;
    }

    tbody.innerHTML = displayed.map(rfp => {
        const status = deriveRFPStatus(rfp);
        const totalPaid = (rfp.payment_records || [])
            .filter(r => r.status !== 'voided')
            .reduce((s, r) => s + (r.amount || 0), 0);
        const balance = (rfp.amount_requested || 0) - totalPaid;
        const isOverdue = status === 'Overdue';
        const deptCode = rfp.service_code || rfp.project_code || '';
        const poNames = posNameMap.get(rfp.po_id) || {};
        const deptName = rfp.service_name || rfp.project_name || poNames.service_name || poNames.project_name || '';
        const deptLabel = deptName
            ? `${escapeHTML(deptCode)}<br><span style="font-size:0.75rem;color:#64748b;">${escapeHTML(deptName)}</span>`
            : escapeHTML(deptCode);
        const badgeStyle = statusBadgeColors[status] || '';

        const recordPaymentBtn = showEditControls
            ? (status === 'Fully Paid'
                ? `<button class="btn btn-sm btn-outline" onclick="window.openRecordPaymentModal('${rfp.id}')" style="white-space:nowrap;">Manage Payments</button>`
                : `<button class="btn btn-sm btn-primary" onclick="window.openRecordPaymentModal('${rfp.id}')" style="white-space:nowrap;">Record Payment</button>`)
            : '';

        // D-02: NO chevron column, NO history expand row — flat list only
        return `<tr style="${isOverdue ? 'background-color:#fef2f2;' : ''}">
            <td style="font-weight:600;">${escapeHTML(rfp.rfp_id || '')}</td>
            <td>${escapeHTML(rfp.supplier_name || '')}</td>
            <td>${rfp.po_id
                ? `<a href="javascript:void(0)" onclick="window.viewPODetailsFromRFP('${rfp.po_doc_id || ''}')" style="color:#1a73e8;text-decoration:none;cursor:pointer;">${escapeHTML(rfp.po_id)}</a>`
                : rfp.tr_id
                ? `<span style="color:#1e293b;font-weight:600;">${escapeHTML(rfp.tr_id)}</span>`
                : '<span style="color:#999;">-</span>'
            }</td>
            <td>${deptLabel}</td>
            <td>${rfp.invoice_number && rfp.invoice_number.startsWith('http')
                ? `<a href="${escapeHTML(rfp.invoice_number)}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;text-decoration:none;">View</a>`
                : escapeHTML(rfp.invoice_number || '-')}</td>
            <td>${escapeHTML(rfp.tranche_label || '')} (${rfp.tranche_percentage || 0}%)</td>
            <td style="text-align:right;">${formatCurrency(rfp.amount_requested || 0)}</td>
            <td style="text-align:right;">${formatCurrency(totalPaid)}</td>
            <td style="text-align:right;">${formatCurrency(balance)}</td>
            <td>${rfp.due_date || 'N/A'}</td>
            <td><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;${badgeStyle}">${status}</span></td>
            <td>${recordPaymentBtn}</td>
        </tr>`;
    }).join('');

    // Mobile card list (Phase 73.1) — populated alongside tbody
    const rfpCardList = document.getElementById('rfpCardList');
    if (rfpCardList) {
        rfpCardList.innerHTML = displayed.map(rfp => buildRFPCard(rfp)).join('');
    }
}

/**
 * Group an array of RFPs by PO ID into a Map.
 * Each entry contains the PO metadata and its list of RFPs.
 * Computed at render time — NOT stored as module-level state.
 */
function buildPOMap(rfps) {
    const poMap = new Map();
    rfps.forEach(rfp => {
        const groupKey = rfp.po_id || rfp.tr_id || '';
        if (!poMap.has(groupKey)) {
            const dCode = rfp.service_code || rfp.project_code || '';
            const poNames = posNameMap.get(groupKey) || {};
            const dName = rfp.service_name || rfp.project_name || poNames.service_name || poNames.project_name || '';
            const label = dName
                ? `${escapeHTML(dCode)}<br><span style="font-size:0.75rem;color:#64748b;">${escapeHTML(dName)}</span>`
                : escapeHTML(dCode);
            poMap.set(groupKey, {
                poId: groupKey,
                supplier: rfp.supplier_name || '',
                deptLabel: label,
                deptCode: dCode,
                deptName: dName,
                isService: !!rfp.service_code,
                isTR: !rfp.po_id && !!rfp.tr_id,
                rfps: []
            });
        }
        poMap.get(groupKey).rfps.push(rfp);
    });
    return poMap;
}

/**
 * Compute aggregate totals and overall status for a PO from its RFP list.
 * D-09: Current Active Tranche = first non-Fully-Paid tranche by tranche_percentage asc.
 * D-10: Total Amount = sum of amount_requested across all RFPs.
 * D-11: Total Paid = sum of non-voided payment records across all RFPs.
 * D-12: Remaining = Total Amount - Total Paid.
 * D-13: Overall Status: Fully Paid > Overdue > Partially Paid > Pending.
 * @param {Array} rfpList - RFPs for this PO
 * @param {number} [poTotalAmount] - PO document total_amount (authoritative); falls back to sum of RFP amounts if not provided
 */
function derivePOSummary(rfpList, poTotalAmount) {
    // Exclude Delivery Fee RFPs from tranche progress — they are separate from the PO payment schedule
    const regularRFPs = rfpList.filter(r => r.tranche_label !== 'Delivery Fee');

    const sorted = [...regularRFPs].sort((a, b) =>
        (a.tranche_percentage || 0) - (b.tranche_percentage || 0)
    );

    const totalAmount = (poTotalAmount != null && poTotalAmount > 0)
        ? poTotalAmount
        : regularRFPs.reduce((s, r) => s + (r.amount_requested || 0), 0);

    const totalPaid = regularRFPs.reduce((s, r) => {
        return s + (r.payment_records || [])
            .filter(p => p.status !== 'voided')
            .reduce((ps, p) => ps + (p.amount || 0), 0);
    }, 0);

    const remaining = totalAmount - totalPaid;

    // D-09: first non-fully-paid tranche label + payment progress for partially paid POs
    // Use PO-level arithmetic (remaining) to determine if truly fully paid — aligns with overallStatus
    const firstUnpaid = sorted.find(r => deriveRFPStatus(r) !== 'Fully Paid');
    let currentTranche;
    if (remaining <= 0 && totalAmount > 0) {
        currentTranche = 'Fully Paid';
    } else if (firstUnpaid) {
        const trancheText = `${escapeHTML(firstUnpaid.tranche_label || '')} (${firstUnpaid.tranche_percentage || 0}%)`;
        if (totalPaid > 0 && totalAmount > 0) {
            const pctPaid = Math.round((totalPaid / totalAmount) * 100);
            currentTranche = `${trancheText} \u2014 ${pctPaid}% Paid`;
        } else {
            currentTranche = trancheText;
        }
    } else {
        // All RFPs individually closed but PO still has remaining balance (data edge case)
        const pctPaid = totalAmount > 0 ? Math.round((totalPaid / totalAmount) * 100) : 0;
        currentTranche = totalPaid > 0 ? `${pctPaid}% Paid` : 'Pending';
    }

    // D-13: Overall status priority
    let overallStatus;
    if (remaining <= 0 && totalAmount > 0) {
        overallStatus = 'Fully Paid';
    } else if (regularRFPs.some(r => deriveRFPStatus(r) === 'Overdue')) {
        overallStatus = 'Overdue';
    } else if (totalPaid > 0) {
        overallStatus = 'Partially Paid';
    } else {
        overallStatus = 'Pending';
    }

    // sortedRFPs includes all RFPs (including Delivery Fee) for sub-table display;
    // aggregate calculations above use regularRFPs only.
    const allSorted = [...rfpList].sort((a, b) =>
        (a.tranche_percentage || 0) - (b.tranche_percentage || 0)
    );
    return { totalAmount, totalPaid, remaining, currentTranche, overallStatus, sortedRFPs: allSorted };
}

/**
 * Build a mobile sub-card for a single RFP tranche row inside a PO Summary card (Phase 73.1).
 * due_date rendered raw (string, not Timestamp) — matches desktop sub-table at renderPOSummaryTable.
 */
function buildPOTrancheSubCard(rfp) {
    const rfpStatus = deriveRFPStatus(rfp);
    const rfpTotalPaid = (rfp.payment_records || [])
        .filter(r => r.status !== 'voided')
        .reduce((s, r) => s + (r.amount || 0), 0);
    const rfpBalance = (rfp.amount_requested || 0) - rfpTotalPaid;
    const rfpBadgeStyle = statusBadgeColors[rfpStatus] || '';

    const canEdit = window.canEditTab?.('finance');
    const showEditControls = canEdit !== false;
    const subBtn = showEditControls
        ? (rfpStatus === 'Fully Paid'
            ? '<button class="btn btn-sm btn-outline" onclick="window.openRecordPaymentModal(\'' + rfp.id + '\')">Manage Payments</button>'
            : '<button class="btn btn-sm btn-primary" onclick="window.openRecordPaymentModal(\'' + rfp.id + '\')">Record Payment</button>')
        : '';

    return `
        <div class="fc-sub-card">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.25rem;">
                <span style="font-weight:700;color:#1e293b;">${escapeHTML(rfp.rfp_id || '')}</span>
                <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;${rfpBadgeStyle}">${rfpStatus}</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:0.25rem;font-size:0.75rem;">
                <div style="display:flex;justify-content:space-between;"><span style="color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">Tranche</span><span>${escapeHTML(rfp.tranche_label || '')} (${rfp.tranche_percentage || 0}%)</span></div>
                <div style="display:flex;justify-content:space-between;"><span style="color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">Amount</span><span>${formatCurrency(rfp.amount_requested || 0)}</span></div>
                <div style="display:flex;justify-content:space-between;"><span style="color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">Paid</span><span>${formatCurrency(rfpTotalPaid)}</span></div>
                <div style="display:flex;justify-content:space-between;"><span style="color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">Balance</span><span>${formatCurrency(rfpBalance)}</span></div>
                <div style="display:flex;justify-content:space-between;"><span style="color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">Due Date</span><span>${rfp.due_date || 'N/A'}</span></div>
            </div>
            ${subBtn ? '<div style="margin-top:0.5rem;">' + subBtn + '</div>' : ''}
        </div>`;
}

/**
 * Build a mobile card for a PO Payment Summary row (Phase 73.1).
 * Includes an expand/collapse sub-list of tranche sub-cards via togglePOCardExpand.
 * Uses distinct IDs (po-card-expand-*, po-card-chevron-*) to avoid collision with desktop togglePOExpand.
 */
function buildPOSummaryCard(po) {
    const badgeStyle = statusBadgeColors[po.overallStatus] || '';
    const isOverdue = po.overallStatus === 'Overdue';
    const safePoId = po.poId.replace(/[^a-zA-Z0-9_-]/g, '_');

    const refDisplay = po.isTR
        ? '<span style="font-weight:600;color:#1e293b;">' + escapeHTML(po.poId) + '</span>'
        : '<a href="javascript:void(0)" onclick="window.viewPODetailsFromRFP(\'' + po.poId + '\')" style="color:#1a73e8;text-decoration:none;cursor:pointer;font-weight:600;">' + escapeHTML(po.poId) + '</a>';

    const subCards = po.sortedRFPs.map(rfp => buildPOTrancheSubCard(rfp)).join('');

    return `
        <div class="fc-card${isOverdue ? ' fc-overdue' : ''}">
            <div class="fc-card-header">
                <span class="fc-card-id">${refDisplay}</span>
                <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;${badgeStyle}">${po.overallStatus}</span>
            </div>
            <div class="fc-card-body">
                <div class="fc-card-row"><span class="fc-label">Supplier</span><span class="fc-value">${escapeHTML(po.supplier || '')}</span></div>
                <div class="fc-card-row"><span class="fc-label">Project / Service</span><span class="fc-value">${po.deptLabel}</span></div>
                <div class="fc-card-row"><span class="fc-label">Current Active Tranche</span><span class="fc-value">${po.currentTranche}</span></div>
                <div class="fc-card-row"><span class="fc-label">Total Amount</span><span class="fc-value">${formatCurrency(po.totalAmount)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Total Paid</span><span class="fc-value">${formatCurrency(po.totalPaid)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Remaining</span><span class="fc-value fc-amount">${formatCurrency(po.remaining)}</span></div>
            </div>
            <div class="fc-card-actions">
                <button class="btn btn-sm btn-secondary" id="po-card-btn-${safePoId}" onclick="window.togglePOCardExpand('${safePoId}')">
                    <span id="po-card-chevron-${safePoId}">&#9654;</span> <span id="po-card-btn-label-${safePoId}">Show Tranches</span>
                </button>
            </div>
            <div class="fc-sub-list" id="po-card-expand-${safePoId}" style="display:none;">
                ${subCards}
            </div>
        </div>`;
}

/**
 * Render the PO Payment Summary table (Table 2).
 * Groups rfpsData by PO ID and shows aggregated totals with expandable sub-tables.
 * D-07: One row per unique PO ID.
 * D-08: Columns: Chevron | PO ID | Supplier | Dept | Current Active Tranche | Total Amount | Total Paid | Remaining | Overall Status.
 * D-14: Expand chevron toggles sub-table of RFPs under this PO.
 * D-16: Filters apply to PO rows by overall status and dept.
 * D-21: Sorted by PO ID alphabetically.
 */
function renderPOSummaryTable() {
    const tbody = document.getElementById('poSummaryTableBody');
    if (!tbody) return;

    const canEdit = window.canEditTab?.('finance');
    const showEditControls = canEdit !== false;

    const poMap = buildPOMap(rfpsData);

    // Convert to array and derive summaries
    let poEntries = [];
    poMap.forEach((entry) => {
        const summary = derivePOSummary(entry.rfps, posAmountMap.get(entry.poId));
        poEntries.push({
            poId: entry.poId,
            supplier: entry.supplier,
            deptLabel: entry.deptLabel,
            deptCode: entry.deptCode || '',
            deptName: entry.deptName || '',
            isService: entry.isService,
            isTR: entry.isTR || false,
            rfps: entry.rfps,
            ...summary
        });
    });

    // D-16: Apply PO-level filters
    if (poSummaryStatusFilter) {
        poEntries = poEntries.filter(po => po.overallStatus === poSummaryStatusFilter);
    }
    if (poSummaryDeptFilter) {
        poEntries = poEntries.filter(po => {
            const dept = po.isService ? 'services' : 'projects';
            return dept === poSummaryDeptFilter;
        });
    }
    if (poSummarySearchQuery) {
        poEntries = poEntries.filter(po => {
            const code = (po.deptCode || '').toLowerCase();
            const name = (po.deptName || '').toLowerCase();
            const poId = (po.poId || '').toLowerCase();
            const rfpIds = po.rfps ? po.rfps.map(r => (r.rfp_id || '').toLowerCase()).join(' ') : '';
            return code.includes(poSummarySearchQuery) || name.includes(poSummarySearchQuery) || poId.includes(poSummarySearchQuery) || rfpIds.includes(poSummarySearchQuery);
        });
    }

    // D-21: Sort by overall status priority (unpaid first), then PO ID alphabetically
    const poStatusPriority = { 'Pending': 1, 'Overdue': 2, 'Partially Paid': 3, 'Fully Paid': 4 };
    poEntries.sort((a, b) => {
        const aPriority = poStatusPriority[a.overallStatus] || 0;
        const bPriority = poStatusPriority[b.overallStatus] || 0;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return (a.poId || '').localeCompare(b.poId || '');
    });

    if (poEntries.length === 0) {
        const isFiltered = poSummaryStatusFilter || poSummaryDeptFilter;
        const emptyMsg = isFiltered
            ? 'No POs match the selected filters. Clear filters to see all.'
            : 'No payment requests yet. PO summaries will appear once RFPs are submitted.';
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:#64748b;">' + emptyMsg + '</td></tr>';
        const poSummaryCardListEmpty = document.getElementById('poSummaryCardList');
        if (poSummaryCardListEmpty) poSummaryCardListEmpty.innerHTML = '<div class="fc-empty">' + emptyMsg + '</div>';
        const paginationDiv = document.getElementById('poSummaryPagination');
        if (paginationDiv) paginationDiv.style.display = 'none';
        return;
    }

    // Pagination
    const totalPages = Math.ceil(poEntries.length / poSummaryItemsPerPage);
    if (poSummaryCurrentPage > totalPages && totalPages > 0) poSummaryCurrentPage = totalPages;
    const startIndex = (poSummaryCurrentPage - 1) * poSummaryItemsPerPage;
    const endIndex = Math.min(startIndex + poSummaryItemsPerPage, poEntries.length);
    const totalFiltered = poEntries.length;
    const pageEntries = poEntries.slice(startIndex, endIndex);

    tbody.innerHTML = pageEntries.map(po => {
        const badgeStyle = statusBadgeColors[po.overallStatus] || '';
        const isOverdue = po.overallStatus === 'Overdue';

        // D-14: Build the sub-table for expanded view
        const subTableRows = po.sortedRFPs.map(rfp => {
            const rfpStatus = deriveRFPStatus(rfp);
            const rfpTotalPaid = (rfp.payment_records || [])
                .filter(r => r.status !== 'voided')
                .reduce((s, r) => s + (r.amount || 0), 0);
            const rfpBalance = (rfp.amount_requested || 0) - rfpTotalPaid;
            const rfpBadgeStyle = statusBadgeColors[rfpStatus] || '';
            const rfpIsOverdue = rfpStatus === 'Overdue';

            // D-15: Record Payment / Manage Payments button in expanded sub-rows
            const subRecordBtn = showEditControls
                ? (rfpStatus === 'Fully Paid'
                    ? `<button class="btn btn-sm btn-outline" onclick="window.openRecordPaymentModal('${rfp.id}')" style="white-space:nowrap;">Manage Payments</button>`
                    : `<button class="btn btn-sm btn-primary" onclick="window.openRecordPaymentModal('${rfp.id}')" style="white-space:nowrap;">Record Payment</button>`)
                : '';

            return `<tr style="${rfpIsOverdue ? 'background-color:#fef2f2;' : ''}">
                <td style="font-weight:600;">${escapeHTML(rfp.rfp_id || '')}</td>
                <td>${escapeHTML(rfp.tranche_label || '')} (${rfp.tranche_percentage || 0}%)</td>
                <td style="text-align:right;">${formatCurrency(rfp.amount_requested || 0)}</td>
                <td style="text-align:right;">${formatCurrency(rfpTotalPaid)}</td>
                <td style="text-align:right;">${formatCurrency(rfpBalance)}</td>
                <td>${rfp.due_date || 'N/A'}</td>
                <td><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;${rfpBadgeStyle}">${rfpStatus}</span></td>
                <td>${subRecordBtn}</td>
            </tr>`;
        }).join('');

        const subTableHtml = `<table style="width:100%;font-size:0.875rem;border-collapse:collapse;">
            <thead><tr style="border-bottom:1px solid #e5e7eb;">
                <th style="text-align:left;padding:6px 8px;font-weight:600;">RFP ID</th>
                <th style="text-align:left;padding:6px 8px;font-weight:600;">Tranche</th>
                <th style="text-align:right;padding:6px 8px;font-weight:600;">Amount</th>
                <th style="text-align:right;padding:6px 8px;font-weight:600;">Paid</th>
                <th style="text-align:right;padding:6px 8px;font-weight:600;">Balance</th>
                <th style="text-align:left;padding:6px 8px;font-weight:600;">Due Date</th>
                <th style="text-align:left;padding:6px 8px;font-weight:600;">Status</th>
                <th style="text-align:left;padding:6px 8px;font-weight:600;">Actions</th>
            </tr></thead>
            <tbody>${subTableRows}</tbody>
        </table>`;

        // Sanitize poId for use in DOM element IDs (replace special chars)
        const safePoId = po.poId.replace(/[^a-zA-Z0-9_-]/g, '_');

        const refDisplay = po.isTR
            ? `<span style="font-weight:600;color:#1e293b;">${escapeHTML(po.poId)}</span>`
            : `<a href="javascript:void(0)" onclick="window.viewPODetailsFromRFP('${po.poId}')" style="color:#1a73e8;text-decoration:none;cursor:pointer;font-weight:600;">${escapeHTML(po.poId)}</a>`;

        return `<tr style="${isOverdue ? 'background-color:#fef2f2;' : ''}">
            <td style="text-align:center;cursor:pointer;user-select:none;" onclick="window.togglePOExpand('${safePoId}')">
                <span id="po-chevron-${safePoId}" style="font-size:0.75rem;">&#9654;</span>
            </td>
            <td>${refDisplay}</td>
            <td>${escapeHTML(po.supplier)}</td>
            <td>${po.deptLabel}</td>
            <td>${po.currentTranche}</td>
            <td style="text-align:right;">${formatCurrency(po.totalAmount)}</td>
            <td style="text-align:right;">${formatCurrency(po.totalPaid)}</td>
            <td style="text-align:right;">${formatCurrency(po.remaining)}</td>
            <td><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;${badgeStyle}">${po.overallStatus}</span></td>
        </tr>
        <tr id="po-expand-${safePoId}" style="display:none;">
            <td colspan="9" style="padding:8px 16px;border-left:4px solid #e5e7eb;background:#f9fafb;">
                ${subTableHtml}
            </td>
        </tr>`;
    }).join('');

    updatePOSummaryPagination(totalPages, startIndex, endIndex, totalFiltered);

    // Mobile card list (Phase 73.1) — populated from same pageEntries (pagination applies to both)
    const poSummaryCardList = document.getElementById('poSummaryCardList');
    if (poSummaryCardList) {
        poSummaryCardList.innerHTML = pageEntries.map(po => buildPOSummaryCard(po)).join('');
    }
}

/**
 * Initialize the Payables tab — sets up rfps and pos onSnapshot listeners.
 */
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
        // Re-render both tables with updated PO data
        renderRFPTable();
        renderPOSummaryTable();
    });
    listeners.push(posUnsub);
}

/**
 * Setup modal keyboard event listeners
 * Uses AbortController for clean one-call cleanup
 */
let modalAbortController = null;

function setupModalListeners() {
    // Abort previous listeners if they exist (idempotent)
    if (modalAbortController) {
        modalAbortController.abort();
    }

    // Create new controller for this view lifecycle
    modalAbortController = new AbortController();
    const { signal } = modalAbortController;

    // ESC key closes active modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const prModal = document.getElementById('prModal');
            const rejectionModal = document.getElementById('rejectionModal');
            const expenseBreakdownModal = document.getElementById('expenseBreakdownModal');
            const approvalModal = document.getElementById('approvalModal');

            // Close whichever modal is currently active
            if (approvalModal?.classList.contains('active')) {
                closeApprovalModal();
            } else if (prModal?.classList.contains('active')) {
                closePRModal();
            } else if (rejectionModal?.classList.contains('active')) {
                closeRejectionModal();
            } else if (expenseBreakdownModal) {
                window._closeExpenseBreakdownModal();
            }
        }
    }, { signal }); // AbortController signal handles cleanup automatically
}

/**
 * Initialize signature pad with high-DPI support
 * Source: https://github.com/szimek/signature_pad README
 */
function initializeApprovalSignaturePad() {
    const canvas = document.getElementById('approvalSignatureCanvas');
    if (!canvas) return null;

    const signaturePad = new SignaturePad(canvas, {
        minWidth: 0.5,
        maxWidth: 2.5,
        penColor: 'rgb(0, 0, 0)',
        backgroundColor: 'rgb(255, 255, 255)',
        throttle: 16 // 60fps
    });

    // Handle high-DPI displays (retina scaling)
    function resizeCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const { width, height } = canvas.getBoundingClientRect();

        // Save signature data before resize to prevent clearing
        const data = signaturePad.toData();

        canvas.width = width * ratio;
        canvas.height = height * ratio;
        canvas.getContext("2d").scale(ratio, ratio);

        // Restore signature after resize
        if (data && data.length > 0) {
            signaturePad.fromData(data);
        }
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return signaturePad;
}

/**
 * Clear signature canvas
 */
function clearApprovalSignature() {
    if (approvalSignaturePad) {
        approvalSignaturePad.clear();
    }
}

// ========================================
// PO DOCUMENT GENERATION (Finance View)
// Duplicated from procurement.js for
// independent finance access
// ========================================

const DOCUMENT_CONFIG = {
    defaultFinancePIC: 'Finance Approver',
    companyInfo: {
        name: 'C. Lacsamana Management and Construction Corporation',
        address: '133 Pinatubo St. City of Mandaluyong City',
        tel: '09178182993',
        email: 'cgl@consultclm.com',
        logo: '/CLMC Registered Logo Cropped (black fill).png'
    }
};

/**
 * Generate HTML table for items
 * @param {Array} items - Array of item objects
 * @param {string} type - 'PR' or 'PO'
 * @returns {string} - HTML table string
 */
function generateItemsTableHTML(items, type) {
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th style="width: 5%;">No.</th>
                    <th style="width: 25%;">Description</th>
                    ${type === 'PR' ? '<th style="width: 15%;">Category</th>' : ''}
                    <th style="width: 10%;">Qty</th>
                    <th style="width: 10%;">Unit</th>
                    <th style="width: 15%;">Unit Cost</th>
                    <th style="width: 15%;">Total</th>
                </tr>
            </thead>
            <tbody>
    `;

    items.forEach((item, index) => {
        const qty = item.qty || item.quantity || 0;
        const unitCost = parseFloat(item.unit_cost || 0);
        const subtotal = qty * unitCost;

        tableHTML += `
            <tr>
                <td style="text-align: center;">${index + 1}</td>
                <td>${escapeHTML(item.item || item.item_name)}</td>
                ${type === 'PR' ? `<td>${escapeHTML(item.category || 'N/A')}</td>` : ''}
                <td style="text-align: center;">${qty}</td>
                <td>${item.unit}</td>
                <td style="text-align: right;">₱${formatCurrency(unitCost)}</td>
                <td style="text-align: right;">₱${formatCurrency(subtotal)}</td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    return tableHTML;
}

/**
 * Generate PO HTML document
 * @param {Object} data - Document data with all placeholders
 * @returns {string} - Complete HTML document
 */
function generatePOHTML(data) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${data.PO_ID} - Purchase Order</title>
            <style>
                @media print {
                    @page {
                        size: A4;
                        margin: 0;
                    }
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                }
                html, body {
                    margin: 0;
                    padding: 0;
                }
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: Arial, sans-serif;
                    font-size: 11pt;
                    line-height: 1.4;
                    color: #000;
                    max-width: 8.5in;
                    margin: 0 auto;
                }
                .header {
                    background-color: #000;
                    color: #fff;
                    padding: 15px 30px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                }
                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 22px;
                }
                .header-logo {
                    width: 70px;
                    height: 70px;
                    object-fit: contain;
                }
                .header-company {
                    font-size: 16pt;
                    font-weight: bold;
                    max-width: 320px;
                    line-height: 1.3;
                }
                .header-right {
                    text-align: right;
                    font-size: 8pt;
                    line-height: 1.6;
                }
                .content {
                    padding: 25px 30px;
                    margin: 0 0.5in 0.5in 0.5in;
                }
                .title {
                    text-align: center;
                    font-size: 16pt;
                    font-weight: bold;
                    margin: 20px 0;
                    text-decoration: underline;
                }
                .section {
                    margin: 15px 0;
                }
                .field {
                    margin: 8px 0;
                    page-break-inside: avoid;
                }
                .label {
                    font-weight: bold;
                    display: inline-block;
                    width: 150px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 15px 0;
                    page-break-inside: avoid;
                }
                th, td {
                    border: 1px solid #000;
                    padding: 8px;
                    text-align: left;
                }
                th {
                    background-color: #f0f0f0;
                    font-weight: bold;
                    font-size: 10pt;
                }
                td {
                    font-size: 10pt;
                }
                .signature-section {
                    margin-top: 2rem;
                    page-break-inside: avoid;
                }
                .signature-box {
                    text-align: left;
                }
                .signature-box p {
                    margin: 0.25rem 0;
                    font-size: 0.875rem;
                }
                .signature-box .sig-label {
                    font-weight: bold;
                    font-size: 10pt;
                    margin-bottom: 0.5rem;
                }
                .signature-box img {
                    max-width: 200px;
                    height: auto;
                    max-height: 60px;
                    margin-bottom: 0.5rem;
                    display: block;
                }
                .sig-line {
                    border-top: 1px solid #000;
                    width: 200px;
                    margin: 0.5rem 0 0.25rem 0;
                }
                .sig-placeholder {
                    height: 60px;
                    width: 200px;
                    margin: 0 0 0.5rem 0;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="header-left">
                    <img src="${data.company_info.logo}" class="header-logo" alt="Logo">
                    <div class="header-company">${data.company_info.name}</div>
                </div>
                <div class="header-right">
                    <div>${data.company_info.address}</div>
                    <div>Tel: ${data.company_info.tel}</div>
                    <div>Email: ${data.company_info.email}</div>
                </div>
            </div>

            <div class="content">
                <div class="title">PURCHASE ORDER</div>

                <div class="section">
                    <div class="field"><span class="label">P.O. No.:</span> ${data.PO_ID}</div>
                    <div class="field"><span class="label">Project:</span> ${data.PROJECT}</div>
                    <div class="field"><span class="label">Date:</span> ${data.DATE}</div>
                    <div class="field"><span class="label">Supplier:</span> ${data.SUPPLIER}</div>
                    <div class="field"><span class="label">Quote Ref:</span> ${data.QUOTE_REF}</div>
                </div>

                <div class="section">
                    <h3 style="margin: 10px 0;">Order Details:</h3>
                    ${data.ITEMS_TABLE}
                </div>

                <div class="section">
                    <div class="field"><span class="label">Delivery Address:</span> ${data.DELIVERY_ADDRESS}</div>
                    <div class="field"><span class="label">Payment Terms:</span> ${data.PAYMENT_TERMS}</div>
                    <div class="field"><span class="label">Condition:</span> ${data.CONDITION}</div>
                    <div class="field"><span class="label">Delivery Date:</span> ${data.DELIVERY_DATE}</div>
                </div>

                <div class="signature-section">
                    <div class="signature-box">
                        <p class="sig-label">Approved by:</p>
                        ${data.FINANCE_SIGNATURE_URL ? `
                            <img src="${data.FINANCE_SIGNATURE_URL}" alt="Finance Signature">
                        ` : `
                            <div class="sig-placeholder"></div>
                        `}
                        <div class="sig-line"></div>
                        <p>${data.FINANCE_APPROVER}</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Open print window with generated HTML
 * @param {string} html - Complete HTML document
 * @param {string} filename - Suggested filename
 */
function openPrintWindow(html, filename) {
    const printWindow = window.open('', '_blank');

    if (!printWindow) {
        alert('Please allow pop-ups to generate PDF documents');
        return;
    }

    printWindow.document.write(html);
    printWindow.document.close();

    // Wait for content to load, then trigger print
    printWindow.onload = function() {
        setTimeout(() => {
            printWindow.print();
        }, 250);
    };
}

/**
 * Format date for documents
 * @param {string} dateString - ISO date string
 * @returns {string} - Formatted date
 */
function formatDocumentDate(dateString) {
    if (!dateString || dateString === 'TBD' || dateString === 'Pending') {
        return dateString;
    }
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

async function viewPODetailsFromRFP(poDocId) {
    showLoading(true);
    try {
        const poDoc = await getDoc(doc(db, 'pos', poDocId));
        if (!poDoc.exists()) {
            showToast('PO not found', 'error');
            return;
        }
        const po = { id: poDoc.id, ...poDoc.data() };
        const items = JSON.parse(po.items_json || '[]');

        const isSubcon = po.is_subcon || false;
        const defaultStatus = isSubcon ? 'Pending' : 'Pending Procurement';
        const status = po.procurement_status || defaultStatus;
        let statusBg = '#fef3c7', statusColor = '#92400e';
        if (['Delivered', 'Processed'].includes(status)) { statusBg = '#d1fae5'; statusColor = '#065f46'; }
        else if (['Procured', 'Processing'].includes(status)) { statusBg = '#dbeafe'; statusColor = '#1e40af'; }

        const bodyHTML = `
            <div style="max-height:60vh;overflow-y:auto;">
                <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:1rem;margin-bottom:1.5rem;">
                    <div>
                        <div style="font-size:0.75rem;color:#5f6368;">PO ID</div>
                        <div style="font-weight:600;">${escapeHTML(po.po_id)}${isSubcon ? ' <span style="background:#e0f2fe;color:#0369a1;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:600;">SUBCON</span>' : ''}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem;color:#5f6368;">MRF Reference</div>
                        <div style="font-weight:600;">${escapeHTML(po.mrf_id || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem;color:#5f6368;">Supplier</div>
                        <div style="font-weight:600;">${escapeHTML(po.supplier_name || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem;color:#5f6368;">Project</div>
                        <div>${escapeHTML(getMRFLabel(po))}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem;color:#5f6368;">Date Issued</div>
                        <div>${formatTimestamp(po.date_issued) || 'N/A'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem;color:#5f6368;">Status</div>
                        <div><span style="background:${statusBg};color:${statusColor};padding:0.375rem 0.75rem;border-radius:6px;font-size:0.875rem;font-weight:600;display:inline-block;">${escapeHTML(status)}</span></div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem;color:#5f6368;">Total Amount</div>
                        <div style="font-weight:600;">${formatCurrency(po.total_amount || 0)}</div>
                    </div>
                </div>
                <div style="margin-top:1.5rem;">
                    <h4 style="margin-bottom:0.75rem;">Items (${items.length})</h4>
                    <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
                        <thead><tr style="background:#f3f4f6;">
                            <th style="padding:0.5rem;text-align:left;border-bottom:2px solid #e5e7eb;">Item</th>
                            <th style="padding:0.5rem;text-align:left;border-bottom:2px solid #e5e7eb;">Category</th>
                            <th style="padding:0.5rem;text-align:left;border-bottom:2px solid #e5e7eb;">Qty</th>
                            <th style="padding:0.5rem;text-align:left;border-bottom:2px solid #e5e7eb;">Unit Cost</th>
                            <th style="padding:0.5rem;text-align:left;border-bottom:2px solid #e5e7eb;">Subtotal</th>
                        </tr></thead>
                        <tbody>${items.map(item => `<tr>
                            <td style="padding:0.5rem;border-bottom:1px solid #e5e7eb;">${escapeHTML(item.item || item.item_name || '')}</td>
                            <td style="padding:0.5rem;border-bottom:1px solid #e5e7eb;">${escapeHTML(item.category || 'N/A')}</td>
                            <td style="padding:0.5rem;border-bottom:1px solid #e5e7eb;">${item.qty || item.quantity || 0} ${escapeHTML(item.unit || 'pcs')}</td>
                            <td style="padding:0.5rem;border-bottom:1px solid #e5e7eb;">${formatCurrency(item.unit_cost || 0)}</td>
                            <td style="padding:0.5rem;border-bottom:1px solid #e5e7eb;">${formatCurrency((item.qty || item.quantity || 0) * (item.unit_cost || 0))}</td>
                        </tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>`;

        let container = document.getElementById('poDetailsModalContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'poDetailsModalContainer';
            document.body.appendChild(container);
        }
        container.innerHTML = createModal({
            id: 'poDetailsModal',
            title: `Purchase Order Details: ${po.po_id}`,
            body: bodyHTML,
            footer: `
                <button class="btn btn-secondary" onclick="closeModal('poDetailsModal')">Close</button>
                <button class="btn btn-primary" onclick="window.promptPODocument('${po.id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;vertical-align:middle;">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                    View PO
                </button>`,
            size: 'large'
        });
        openModal('poDetailsModal');
    } catch (err) {
        console.error('[Finance] viewPODetailsFromRFP error:', err);
        showToast('Failed to load PO details', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Generate PO Document
 * @param {string} poDocId - Firestore document ID of the PO
 */
async function generatePODocument(poDocId) {
    showLoading(true);

    try {
        // Fetch PO data from Firestore
        const poRef = doc(db, 'pos', poDocId);
        const poDoc = await getDoc(poRef);

        if (!poDoc.exists()) {
            throw new Error('PO not found');
        }

        const po = poDoc.data();
        const items = JSON.parse(po.items_json || '[]');

        // Prepare document data
        const documentData = {
            PO_ID: po.po_id,
            PROJECT: getMRFLabel(po),
            DATE: formatPODate({ date_issued: po.date_issued, date_issued_legacy: po.date_issued_legacy }),
            SUPPLIER: po.supplier_name,
            QUOTE_REF: po.quote_ref || 'N/A',
            ITEMS_TABLE: generateItemsTableHTML(items, 'PO'),
            DELIVERY_ADDRESS: po.delivery_address,
            PAYMENT_TERMS: po.payment_terms || '',
            CONDITION: po.condition || '',
            DELIVERY_DATE: po.delivery_date ? formatDocumentDate(po.delivery_date) : '',
            FINANCE_APPROVER: po.finance_approver_name || po.finance_approver || DOCUMENT_CONFIG.defaultFinancePIC,
            FINANCE_SIGNATURE_URL: po.finance_signature_url || '',
            company_info: DOCUMENT_CONFIG.companyInfo
        };

        // Generate HTML and open in print window
        const html = generatePOHTML(documentData);
        openPrintWindow(html, documentData.PO_ID);

        showToast('PO document opened. Use browser Print -> Save as PDF', 'success');

    } catch (error) {
        console.error('[Finance] Error generating PO document:', error);
        showToast('Failed to generate PO document', 'error');
        throw error;
    } finally {
        showLoading(false);
    }
}

/**
 * View PO document from Finance view
 * Generates document directly - Finance users view only, Procurement manages document details
 * @param {string} poDocId - Firestore document ID of the PO
 */
async function promptPODocument(poDocId) {
    await generatePODocument(poDocId);
}


/**
 * Render the finance view
 * @param {string} activeTab - Active tab (approvals, pos, projects)
 * @returns {string} HTML string for finance view
 */
export function render(activeTab = 'approvals') {
    // Get edit permission
    const canEdit = window.canEditTab?.('finance');
    const showEditControls = canEdit !== false;

    return `
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

        <div class="container" style="max-width: 1600px; margin: 0 auto; padding: 1.5rem;">
            <!-- Tab 1: Pending Approvals -->
            <section id="approvals-section" class="section ${activeTab === 'approvals' ? 'active' : ''}">
                ${!showEditControls ? '<div class="view-only-notice"><span class="notice-icon">👁️</span> <span>View-only mode: You can view pending approvals but cannot approve or reject requests.</span></div>' : ''}
                <!-- Stats Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                    <div class="card" style="padding: 1.5rem; background: linear-gradient(135deg, #fef3c7, #fde047);">
                        <div style="font-size: 0.875rem; font-weight: 600; color: #854d0e;">Material PRs Pending</div>
                        <div id="materialPendingCount" style="font-size: 2rem; font-weight: 700; color: #a16207;">0</div>
                    </div>
                    <div class="card" style="padding: 1.5rem; background: linear-gradient(135deg, #fecaca, #f87171);">
                        <div style="font-size: 0.875rem; font-weight: 600; color: #7f1d1d;">Transport Requests Pending</div>
                        <div id="transportPendingCount" style="font-size: 2rem; font-weight: 700; color: #991b1b;">0</div>
                    </div>
                    <div class="card" style="padding: 1.5rem; background: linear-gradient(135deg, #d1fae5, #86efac);">
                        <div style="font-size: 0.875rem; font-weight: 600; color: #14532d;">Approved This Month</div>
                        <div id="approvedCount" style="font-size: 2rem; font-weight: 700; color: #15803d;">0</div>
                    </div>
                    <div class="card" style="padding: 1.5rem;">
                        <div style="font-size: 0.875rem; font-weight: 600; color: #5f6368;">Total Pending Amount</div>
                        <div id="pendingAmount" style="font-size: 2rem; font-weight: 700; color: #1f2937;">₱0</div>
                    </div>
                </div>

                <!-- Material PRs -->
                <div class="card">
                    <div class="card-header">
                        <h2>🛒 Material Purchase Requests</h2>
                        <div style="display:flex;gap:0.5rem;align-items:center;">
                            <select id="deptFilterApprovals"
                                    onchange="window.applyFinanceDeptFilter(this.value)"
                                    style="padding:0.35rem 0.6rem;border:1.5px solid #e2e8f0;border-radius:6px;font-size:0.875rem;color:#475569;">
                                <option value="">All Departments</option>
                                <option value="projects">Projects</option>
                                <option value="services">Services</option>
                            </select>
                            <button class="btn btn-secondary" onclick="window.refreshPRs()">🔄 Refresh</button>
                        </div>
                    </div>
                    <div class="table-scroll-container">
                    <table>
                        <thead>
                            <tr>
                                <th onclick="window.sortMaterialPRs('pr_id')" style="cursor: pointer; user-select: none;">PR ID <span class="sort-indicator" data-col="pr_id"></span></th>
                                <th onclick="window.sortMaterialPRs('mrf_id')" style="cursor: pointer; user-select: none;">MRF ID <span class="sort-indicator" data-col="mrf_id"></span></th>
                                <th>Department / Project</th>
                                <th onclick="window.sortMaterialPRs('date_generated')" style="cursor: pointer; user-select: none;">Date Issued <span class="sort-indicator" data-col="date_generated"></span></th>
                                <th onclick="window.sortMaterialPRs('mrf_date_needed')" style="cursor: pointer; user-select: none;">Date Needed <span class="sort-indicator" data-col="mrf_date_needed"></span></th>
                                <th onclick="window.sortMaterialPRs('urgency_level')" style="cursor: pointer; user-select: none;">Urgency <span class="sort-indicator" data-col="urgency_level"></span></th>
                                <th onclick="window.sortMaterialPRs('total_amount')" style="cursor: pointer; user-select: none; text-align: right;">Total Cost <span class="sort-indicator" data-col="total_amount"></span></th>
                                <th onclick="window.sortMaterialPRs('supplier_name')" style="cursor: pointer; user-select: none;">Supplier <span class="sort-indicator" data-col="supplier_name"></span></th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="materialPRsBody">
                            ${skeletonTableRows(9, 5)}
                        </tbody>
                    </table>
                    </div>
                    <div class="fc-card-list" id="materialPRsCardList"></div>
                </div>

                <div style="margin: 2rem 0;"></div>

                <!-- Transport Requests -->
                <div class="card">
                    <div class="card-header">
                        <h2>🚚 Transport Requests</h2>
                    </div>
                    <div class="table-scroll-container">
                    <table>
                        <thead>
                            <tr>
                                <th onclick="window.sortTransportRequests('tr_id')" style="cursor: pointer; user-select: none;">TR ID <span class="sort-indicator" data-col="tr_id"></span></th>
                                <th onclick="window.sortTransportRequests('mrf_id')" style="cursor: pointer; user-select: none;">MRF ID <span class="sort-indicator" data-col="mrf_id"></span></th>
                                <th>Project</th>
                                <th onclick="window.sortTransportRequests('date_submitted')" style="cursor: pointer; user-select: none;">Date Issued <span class="sort-indicator" data-col="date_submitted"></span></th>
                                <th onclick="window.sortTransportRequests('mrf_date_needed')" style="cursor: pointer; user-select: none;">Date Needed <span class="sort-indicator" data-col="mrf_date_needed"></span></th>
                                <th onclick="window.sortTransportRequests('urgency_level')" style="cursor: pointer; user-select: none;">Urgency <span class="sort-indicator" data-col="urgency_level"></span></th>
                                <th onclick="window.sortTransportRequests('total_amount')" style="cursor: pointer; user-select: none; text-align: right;">Total Cost <span class="sort-indicator" data-col="total_amount"></span></th>
                                <th>Service Type</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="transportRequestsBody">
                            ${skeletonTableRows(9, 5)}
                        </tbody>
                    </table>
                    </div>
                    <div class="fc-card-list" id="transportRequestsCardList"></div>
                </div>
            </section>

            <!-- Tab 2: Purchase Orders -->
            <section id="pos-section" class="section ${activeTab === 'pos' ? 'active' : ''}">
                ${!showEditControls ? '<div class="view-only-notice"><span class="notice-icon">👁️</span> <span>View-only mode: You can view purchase orders but cannot modify them.</span></div>' : ''}
                <div class="card">
                    <div class="card-header">
                        <h2>Recently Generated Purchase Orders</h2>
                        <div style="display:flex;gap:0.5rem;align-items:center;">
                            <select id="deptFilterPOs"
                                    onchange="window.applyFinanceDeptFilter(this.value)"
                                    style="padding:0.35rem 0.6rem;border:1.5px solid #e2e8f0;border-radius:6px;font-size:0.875rem;color:#475569;">
                                <option value="">All Departments</option>
                                <option value="projects">Projects</option>
                                <option value="services">Services</option>
                            </select>
                            <button class="btn btn-secondary" onclick="window.exportPOsCSV()">Export CSV</button>
                        <button class="btn btn-secondary" onclick="window.refreshPOs()">🔄 Refresh</button>
                        </div>
                    </div>
                    <div id="poList">
                        <div style="text-align: center; padding: 2rem;">Loading purchase orders...</div>
                    </div>
                </div>
            </section>

            <!-- Tab 3: Project List & Expenses -->
            <section id="projects-section" class="section ${activeTab === 'projects' ? 'active' : ''}">
                ${!showEditControls ? '<div class="view-only-notice"><span class="notice-icon">👁️</span> <span>View-only mode: You can view project expenses.</span></div>' : ''}
                <div class="card">
                    <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                        <h2>Project List & Expenses</h2>
                    </div>

                    <!-- Sub-tab bar: Projects | Services | Recurring -->
                    <div class="finance-expense-subtab-bar" style="display: flex; gap: 0; border-bottom: 2px solid #e5e7eb; margin-bottom: 1rem; padding: 0 1rem;">
                        <button class="expense-subtab-btn active" data-tab="projects"
                                onclick="window.switchExpenseSubTab('projects')"
                                style="padding: 0.5rem 1rem; border: none; background: none; cursor: pointer; font-size: 0.875rem; font-weight: 600; color: #1a73e8; border-bottom: 2px solid #1a73e8; margin-bottom: -2px;">
                            Projects
                        </button>
                        <button class="expense-subtab-btn" data-tab="services"
                                onclick="window.switchExpenseSubTab('services')"
                                style="padding: 0.5rem 1rem; border: none; background: none; cursor: pointer; font-size: 0.875rem; font-weight: 600; color: #64748b; border-bottom: 2px solid transparent; margin-bottom: -2px;">
                            Services
                        </button>
                        <button class="expense-subtab-btn" data-tab="recurring"
                                onclick="window.switchExpenseSubTab('recurring')"
                                style="padding: 0.5rem 1rem; border: none; background: none; cursor: pointer; font-size: 0.875rem; font-weight: 600; color: #64748b; border-bottom: 2px solid transparent; margin-bottom: -2px;">
                            Recurring
                        </button>
                    </div>

                    <!-- Projects Sub-tab Section -->
                    <div id="projectsExpenseSection" style="padding: 0 1rem 1rem;">
                        <div class="filter-toolbar" style="display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1rem;">
                            <input type="text" id="projectExpenseSearch"
                                   placeholder="Search by name or code..."
                                   oninput="window.debouncedProjectExpenseSearch()"
                                   style="flex: 1; padding: 0.5rem 0.75rem; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 0.875rem; color: #1e293b; outline: none;"
                                   onfocus="this.style.borderColor='#1a73e8'; this.style.boxShadow='0 0 0 3px rgba(26,115,232,0.1)'"
                                   onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'">
                            <button class="btn btn-secondary" onclick="window.refreshProjectExpenses(true)" style="font-size: 0.875rem; white-space: nowrap;">
                                Refresh Totals
                            </button>
                        </div>
                        <div id="projectExpensesContainer">
                            <div class="table-scroll-container">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>Project Name</th>
                                            <th>Client</th>
                                            <th style="text-align: right;">Budget</th>
                                            <th style="text-align: right;">Total Expense</th>
                                            <th style="text-align: right;">Remaining</th>
                                            <th style="text-align: center;">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>${skeletonTableRows(6, 5)}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <!-- Services Sub-tab Section -->
                    <div id="servicesExpenseSection" style="display: none; padding: 0 1rem 1rem;">
                        <div class="filter-toolbar" style="display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1rem;">
                            <input type="text" id="serviceExpenseSearch"
                                   placeholder="Search by name or code..."
                                   oninput="window.debouncedServiceExpenseSearch()"
                                   style="flex: 1; padding: 0.5rem 0.75rem; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 0.875rem; color: #1e293b; outline: none;"
                                   onfocus="this.style.borderColor='#1a73e8'; this.style.boxShadow='0 0 0 3px rgba(26,115,232,0.1)'"
                                   onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'">
                            <button class="btn btn-secondary" onclick="window.refreshServiceExpenses()" style="font-size: 0.875rem; white-space: nowrap;">
                                Refresh Totals
                            </button>
                        </div>
                        <div id="serviceExpensesContainer">
                            <div class="table-scroll-container">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>Service Name</th>
                                            <th>Client</th>
                                            <th style="text-align: right;">Budget</th>
                                            <th style="text-align: right;">Total Expense</th>
                                            <th style="text-align: right;">Remaining</th>
                                            <th style="text-align: center;">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>${skeletonTableRows(6, 5)}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <!-- Recurring Sub-tab Section -->
                    <div id="recurringExpenseSection" style="display: none; padding: 0 1rem 1rem;">
                        <div class="filter-toolbar" style="display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1rem;">
                            <input type="text" id="recurringExpenseSearch"
                                   placeholder="Search by name or code..."
                                   oninput="window.debouncedRecurringExpenseSearch()"
                                   style="flex: 1; padding: 0.5rem 0.75rem; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 0.875rem; color: #1e293b; outline: none;"
                                   onfocus="this.style.borderColor='#1a73e8'; this.style.boxShadow='0 0 0 3px rgba(26,115,232,0.1)'"
                                   onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'">
                            <button class="btn btn-secondary" onclick="window.refreshRecurringExpenses()" style="font-size: 0.875rem; white-space: nowrap;">
                                Refresh Totals
                            </button>
                        </div>
                        <div id="recurringExpensesContainer">
                            <div class="table-scroll-container">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>Service Name</th>
                                            <th>Client</th>
                                            <th style="text-align: right;">Budget</th>
                                            <th style="text-align: right;">Total Expense</th>
                                            <th style="text-align: right;">Remaining</th>
                                            <th style="text-align: center;">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>${skeletonTableRows(6, 5)}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Tab 4: Payables -->
            <section id="payables-section" class="section ${activeTab === 'payables' ? 'active' : ''}">

                <!-- Table 1: RFP Processing -->
                <div class="card" style="margin-bottom:1.5rem;">
                    <div class="card-header">
                        <h2>RFP Processing</h2>
                    </div>
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

                <!-- Table 2: PO Payment Summary -->
                <div class="card">
                    <div class="card-header">
                        <h2>PO Payment Summary</h2>
                    </div>
                    <div style="padding:1rem;">
                        <div style="display:flex;gap:1rem;margin-bottom:0.75rem;align-items:center;flex-wrap:wrap;">
                            <select id="poSummaryStatusFilter" class="form-control" style="width:auto;min-width:160px;font-size:0.875rem;" onchange="window.filterPOSummaryTable()">
                                <option value="">All Statuses</option>
                                <option value="Pending">Pending</option>
                                <option value="Partially Paid">Partially Paid</option>
                                <option value="Fully Paid">Fully Paid</option>
                                <option value="Overdue">Overdue</option>
                            </select>
                            <select id="poSummaryDeptFilter" class="form-control" style="width:auto;min-width:160px;font-size:0.875rem;" onchange="window.filterPOSummaryTable()">
                                <option value="">All Departments</option>
                                <option value="projects">Projects</option>
                                <option value="services">Services</option>
                            </select>
                            <input type="text" id="poSummarySearchInput" class="form-control" placeholder="Search project, PO ID, or RFP ID..." style="width:auto;min-width:240px;font-size:0.875rem;" oninput="window.filterPOSummaryTable()">
                        </div>
                        <div class="table-scroll-container">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th style="width:30px;"></th>
                                        <th>PO ID</th>
                                        <th>Supplier</th>
                                        <th>Project / Service</th>
                                        <th>Current Active Tranche</th>
                                        <th style="text-align:right;">Total Amount</th>
                                        <th style="text-align:right;">Total Paid</th>
                                        <th style="text-align:right;">Remaining</th>
                                        <th>Overall Status</th>
                                    </tr>
                                </thead>
                                <tbody id="poSummaryTableBody">
                                    <tr><td colspan="9" style="text-align:center;padding:2rem;color:#64748b;">Loading PO summary...</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="fc-card-list" id="poSummaryCardList"></div>
                        <div id="poSummaryPagination" class="pagination-container"></div>
                    </div>
                </div>
            </section>
        </div>

        <!-- PR Details Modal -->
        <div id="prModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="prModalTitle">Purchase Request Details</h2>
                    <button class="modal-close" onclick="window.closePRModal()">&times;</button>
                </div>
                <div class="modal-body" id="prModalBody"></div>
                <div class="modal-footer" id="prModalFooter"></div>
            </div>
        </div>

        <!-- Rejection Modal -->
        <div id="rejectionModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Reject Request</h2>
                    <button class="modal-close" onclick="window.closeRejectionModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 1rem;">Please provide a reason for rejection:</p>
                    <textarea id="rejectionReason" rows="4" style="width: 100%; padding: 0.75rem; border: 1.5px solid #e2e8f0; border-radius: 8px; font-family: inherit; font-size: 0.875rem; transition: all 0.2s;" onfocus="this.style.borderColor='#1a73e8'; this.style.boxShadow='0 0 0 4px rgba(26, 115, 232, 0.1)'" onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'"></textarea>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="window.closeRejectionModal()">Cancel</button>
                    <button class="btn btn-danger" onclick="window.submitRejection()">Submit Rejection</button>
                </div>
            </div>
        </div>

        <!-- Approval Modal (separate from PR review modal) -->
        <div id="approvalModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Approve & Sign</h2>
                    <button class="modal-close" onclick="window.closeApprovalModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 1rem; color: #475569;">Please draw your signature below to confirm approval.</p>
                    <canvas id="approvalSignatureCanvas"
                            style="border: 1.5px solid #e2e8f0; border-radius: 8px; background: white;
                                   width: 100%; max-width: 400px; height: 150px; cursor: crosshair; display: block;">
                    </canvas>
                    <button class="btn btn-secondary"
                            onclick="window.clearApprovalSignature()"
                            style="margin-top: 0.5rem; font-size: 0.875rem; padding: 0.5rem 1rem;">
                        Clear Signature
                    </button>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="window.closeApprovalModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="window.confirmApproval()">Confirm Approval</button>
                </div>
            </div>
        </div>

        <!-- Expense breakdown modal injected dynamically by expense-modal.js -->
    `;
}

/**
 * Initialize the finance view
 * @param {string} activeTab - Active tab to display
 */
export async function init(activeTab = 'approvals') {
    // CRITICAL: Re-attach window functions every init (router skips destroy on tab switch)
    attachWindowFunctions();

    // Setup ESC key modal listeners
    setupModalListeners();

    // Phase 73.3: Attach scroll-hide/show listener for the sticky Finance sub-nav.
    // Router does NOT call destroy() when switching sub-tabs within Finance view,
    // so guard against re-attach on repeated init() calls.
    if (!_financeNavScrollHandler) {
        _financeNavLastScrollY = window.scrollY || 0;
        _financeNavScrollHandler = function () {
            const nav = document.getElementById('financeSubNav');
            if (!nav) return;
            const currentY = window.scrollY || 0;
            const prevY = _financeNavLastScrollY;
            _financeNavLastScrollY = currentY; // always update first
            if (currentY < 80) {
                nav.classList.remove('finance-sub-nav--hidden');
            } else if (currentY > prevY) {
                // Scrolling DOWN -> hide
                nav.classList.add('finance-sub-nav--hidden');
            } else if (currentY < prevY) {
                // Scrolling UP -> show
                nav.classList.remove('finance-sub-nav--hidden');
            }
        };
        window.addEventListener('scroll', _financeNavScrollHandler, { passive: true });
    }

    try {
        await loadPRs();
        await loadPOs();
        await loadApprovedTRsThisMonth();

        // Load project expenses if on projects tab
        if (activeTab === 'projects') {
            await refreshProjectExpenses();
            // If returning to this tab with a service/recurring sub-tab active, load that data too
            if (activeExpenseSubTab === 'services') {
                await refreshServiceExpenses();
            } else if (activeExpenseSubTab === 'recurring') {
                await refreshRecurringExpenses();
            }
        }

        // Load payables if on payables tab
        if (activeTab === 'payables') {
            await initPayablesTab();
        }

    } catch (error) {
        console.error('Error initializing finance view:', error);
        showToast('Error loading finance data', 'error');
    }
}

// ========================================
// PROJECT EXPENSE TRACKING
// ========================================

/**
 * Calculate project expenses using server-side aggregation
 * Source: Phase 13 pattern (getAggregateFromServer)
 * Note: Uses existing projectExpenses array declared at line 16
 */
async function refreshProjectExpenses(forceRefresh = false) {
    // TTL cache guard: skip fetch if data is fresh (unless force-refreshed by user)
    if (!forceRefresh && projectExpenses.length > 0 && (Date.now() - _projectExpensesCachedAt) < PROJECT_EXPENSES_TTL_MS) {
        renderProjectExpensesTable();
        return;
    }

    showLoading(true);

    try {
        // Get all projects (active and inactive) — Finance needs full visibility for historical tracking
        const projectsSnapshot = await getDocs(collection(db, 'projects'));

        // Aggregate PO + TR totals for all projects in parallel (instead of sequential loop)
        const projectPromises = projectsSnapshot.docs.map(async (projectDoc) => {
            const project = projectDoc.data();

            // Run PO and TR aggregation in parallel for each project
            const [posAgg, trAgg] = await Promise.all([
                getAggregateFromServer(
                    query(collection(db, 'pos'), where('project_name', '==', project.project_name)),
                    { totalExpense: sum('total_amount'), poCount: count() }
                ),
                getAggregateFromServer(
                    query(collection(db, 'transport_requests'), where('project_name', '==', project.project_name), where('finance_status', '==', 'Approved')),
                    { transportTotal: sum('total_amount'), trCount: count() }
                )
            ]);

            const totalExpense = (posAgg.data().totalExpense || 0) + (trAgg.data().transportTotal || 0);
            const budget = project.budget || 0;

            return {
                projectCode: project.project_code || 'N/A',
                projectName: project.project_name,
                clientCode: project.client_code || 'N/A',
                totalExpense: totalExpense,
                budget: budget,
                remainingBudget: budget - totalExpense,
                poCount: posAgg.data().poCount || 0,
                trCount: trAgg.data().trCount || 0,
                active: project.active !== false
            };
        });

        projectExpenses = await Promise.all(projectPromises);

        // Sort: active projects A-Z first, then inactive A-Z
        projectExpenses.sort((a, b) => {
            if (a.active !== b.active) return a.active ? -1 : 1;
            return (a.projectName || '').localeCompare(b.projectName || '');
        });

        _projectExpensesCachedAt = Date.now();

        renderProjectExpensesTable();

    } catch (error) {
        console.error('[Finance] Error calculating project expenses:', error);
        showToast('Failed to calculate project expenses: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Build a single project expense card for mobile card layout.
 * Entire card is clickable (fc-clickable) — mirrors desktop tr onclick pattern (Pitfall 6).
 * escapeHTML in onclick converts ' to &#39; which browser HTML-decodes back to ' before JS
 * evaluation — safe for project names containing apostrophes (REVIEWS Suggestion 3).
 */
function buildProjectExpenseCard(proj) {
    const isOverBudget = proj.remainingBudget < 0;
    const remainingColor = isOverBudget ? '#ef4444' : '#1e293b';
    const remainingWeight = isOverBudget ? '700' : '400';
    const statusClass = proj.active ? 'approved' : 'rejected';
    const statusLabel = proj.active ? 'Active' : 'Inactive';
    return `
        <div class="fc-card fc-clickable" onclick="window.showProjectExpenseModal('${escapeHTML(proj.projectName)}')">
            <div class="fc-card-header">
                <span class="fc-card-id">${escapeHTML(proj.projectName)}</span>
                <span class="status-badge ${statusClass}">${statusLabel}</span>
            </div>
            <div class="fc-card-body">
                <div class="fc-card-row"><span class="fc-label">Code</span><span class="fc-value" style="font-size:0.8125rem;color:#64748b;">${escapeHTML(proj.projectCode)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Client</span><span class="fc-value">${escapeHTML(proj.clientCode)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Budget</span><span class="fc-value">₱${formatCurrency(proj.budget)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Total Expense</span><span class="fc-value">₱${formatCurrency(proj.totalExpense)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Remaining</span><span class="fc-value" style="color:${remainingColor};font-weight:${remainingWeight};">${isOverBudget ? '⚠️ ' : ''}₱${formatCurrency(Math.abs(proj.remainingBudget))}${isOverBudget ? ' over' : ''}</span></div>
            </div>
        </div>`;
}

/**
 * Render project expenses table
 * Uses formatCurrency() imported from utils.js
 */
function renderProjectExpensesTable() {
    const container = document.getElementById('projectExpensesContainer');
    if (!container) return;

    // Apply search filter
    const filtered = projectExpenseSearchTerm
        ? projectExpenses.filter(p =>
            (p.projectName && p.projectName.toLowerCase().includes(projectExpenseSearchTerm)) ||
            (p.projectCode && p.projectCode.toLowerCase().includes(projectExpenseSearchTerm)))
        : projectExpenses;

    if (projectExpenses.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #666;">
                <p>No projects found</p>
            </div>
        `;
        return;
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #666;">
                <p>No projects match your search</p>
            </div>
        `;
        return;
    }

    // Build table
    let tableHTML = `
        <div class="table-scroll-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th onclick="window.sortProjectExpenses('projectName')" style="cursor: pointer; user-select: none;">
                            Project Name <span class="sort-indicator" data-col="projectName"></span>
                        </th>
                        <th onclick="window.sortProjectExpenses('clientCode')" style="cursor: pointer; user-select: none;">
                            Client <span class="sort-indicator" data-col="clientCode"></span>
                        </th>
                        <th onclick="window.sortProjectExpenses('budget')" style="cursor: pointer; user-select: none; text-align: right;">
                            Budget <span class="sort-indicator" data-col="budget"></span>
                        </th>
                        <th onclick="window.sortProjectExpenses('totalExpense')" style="cursor: pointer; user-select: none; text-align: right;">
                            Total Expense <span class="sort-indicator" data-col="totalExpense"></span>
                        </th>
                        <th onclick="window.sortProjectExpenses('remainingBudget')" style="cursor: pointer; user-select: none; text-align: right;">
                            Remaining <span class="sort-indicator" data-col="remainingBudget"></span>
                        </th>
                        <th onclick="window.sortProjectExpenses('status')" style="cursor: pointer; user-select: none; text-align: center;">
                            Status <span class="sort-indicator" data-col="status"></span>
                        </th>
                    </tr>
                </thead>
                <tbody>
    `;

    filtered.forEach(proj => {
        const isOverBudget = proj.remainingBudget < 0;
        const remainingStyle = isOverBudget ? 'color: #ef4444; font-weight: 600;' : '';

        tableHTML += `
            <tr onclick="window.showProjectExpenseModal(this.dataset.projectName)" data-project-name="${escapeHTML(proj.projectName)}" style="cursor: pointer;">
                <td>
                    <div style="font-weight: 600;">${escapeHTML(proj.projectName)}</div>
                    <div style="font-size: 0.75rem; color: #64748b;">${escapeHTML(proj.projectCode)}</div>
                </td>
                <td>${escapeHTML(proj.clientCode)}</td>
                <td style="text-align: right;">₱${formatCurrency(proj.budget)}</td>
                <td style="text-align: right;">₱${formatCurrency(proj.totalExpense)}</td>
                <td style="text-align: right; ${remainingStyle}">
                    ${isOverBudget ? '⚠️ ' : ''}₱${formatCurrency(Math.abs(proj.remainingBudget))}
                    ${isOverBudget ? ' over' : ''}
                </td>
                <td style="text-align: center;">
                    <span class="status-badge ${proj.active ? 'approved' : 'rejected'}">
                        ${proj.active ? 'Active' : 'Inactive'}
                    </span>
                </td>
            </tr>
        `;
    });

    tableHTML += `
                </tbody>
            </table>
        </div>
        <div class="fc-card-list">
            ${filtered.map(proj => buildProjectExpenseCard(proj)).join('')}
        </div>
    `;

    container.innerHTML = tableHTML;

    // Update sort indicators for project expenses table
    container.querySelectorAll('.sort-indicator').forEach(indicator => {
        const col = indicator.dataset.col;
        if (col === projectExpenseSortColumn) {
            indicator.textContent = projectExpenseSortDirection === 'asc' ? ' \u2191' : ' \u2193';
            indicator.style.color = '#1a73e8';
        } else {
            indicator.textContent = ' \u21C5';
            indicator.style.color = '#94a3b8';
        }
    });
}

/**
 * Sort project expenses by column
 */
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

// showProjectExpenseModal and closeProjectExpenseModal replaced by shared expense-modal.js

// ========================================
// SERVICE EXPENSE TRACKING (one-time)
// ========================================

/**
 * Calculate service expenses (one-time) using server-side aggregation.
 * Mirrors refreshProjectExpenses() pattern.
 */
async function refreshServiceExpenses(forceRefresh = false) {
    if (!forceRefresh && serviceExpenses.length > 0 && (Date.now() - _serviceExpensesCachedAt) < PROJECT_EXPENSES_TTL_MS) {
        renderServiceExpensesTable();
        return;
    }

    showLoading(true);
    try {
        // Get all services with service_type 'one-time'
        const servicesSnapshot = await getDocs(
            query(collection(db, 'services'), where('service_type', '==', 'one-time'))
        );

        const servicePromises = servicesSnapshot.docs.map(async (serviceDoc) => {
            const service = serviceDoc.data();
            const code = service.service_code || '';

            // Aggregate PO totals + fetch TRs client-side (avoids composite index on transport_requests)
            const [posAgg, trSnap] = await Promise.all([
                getAggregateFromServer(
                    query(collection(db, 'pos'), where('service_code', '==', code)),
                    { totalExpense: sum('total_amount'), poCount: count() }
                ),
                getDocs(query(collection(db, 'transport_requests'), where('service_code', '==', code)))
            ]);

            let transportTotal = 0, trCount = 0;
            trSnap.forEach(d => {
                if (d.data().finance_status === 'Approved') {
                    transportTotal += (d.data().total_amount || 0);
                    trCount++;
                }
            });

            const totalExpense = (posAgg.data().totalExpense || 0) + transportTotal;
            const budget = service.budget || 0;

            return {
                serviceCode: code,
                serviceName: service.service_name || '',
                clientCode: service.client_code || 'N/A',
                totalExpense,
                budget,
                remainingBudget: budget - totalExpense,
                poCount: posAgg.data().poCount || 0,
                trCount,
                status: service.status || 'active'
            };
        });

        serviceExpenses = await Promise.all(servicePromises);
        _serviceExpensesCachedAt = Date.now();
        renderServiceExpensesTable();
    } catch (error) {
        console.error('[Finance] Error calculating service expenses:', error);
        showToast('Failed to calculate service expenses: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Calculate recurring service expenses using server-side aggregation.
 * Mirrors refreshServiceExpenses() but filters by service_type 'recurring'.
 */
async function refreshRecurringExpenses(forceRefresh = false) {
    if (!forceRefresh && recurringExpenses.length > 0 && (Date.now() - _recurringExpensesCachedAt) < PROJECT_EXPENSES_TTL_MS) {
        renderRecurringExpensesTable();
        return;
    }

    showLoading(true);
    try {
        // Get all services with service_type 'recurring'
        const servicesSnapshot = await getDocs(
            query(collection(db, 'services'), where('service_type', '==', 'recurring'))
        );

        const servicePromises = servicesSnapshot.docs.map(async (serviceDoc) => {
            const service = serviceDoc.data();
            const code = service.service_code || '';

            // Aggregate PO totals + fetch TRs client-side (avoids composite index on transport_requests)
            const [posAgg, trSnap] = await Promise.all([
                getAggregateFromServer(
                    query(collection(db, 'pos'), where('service_code', '==', code)),
                    { totalExpense: sum('total_amount'), poCount: count() }
                ),
                getDocs(query(collection(db, 'transport_requests'), where('service_code', '==', code)))
            ]);

            let transportTotal = 0, trCount = 0;
            trSnap.forEach(d => {
                if (d.data().finance_status === 'Approved') {
                    transportTotal += (d.data().total_amount || 0);
                    trCount++;
                }
            });

            const totalExpense = (posAgg.data().totalExpense || 0) + transportTotal;
            const budget = service.budget || 0;

            return {
                serviceCode: code,
                serviceName: service.service_name || '',
                clientCode: service.client_code || 'N/A',
                totalExpense,
                budget,
                remainingBudget: budget - totalExpense,
                poCount: posAgg.data().poCount || 0,
                trCount,
                status: service.status || 'active'
            };
        });

        recurringExpenses = await Promise.all(servicePromises);
        _recurringExpensesCachedAt = Date.now();
        renderRecurringExpensesTable();
    } catch (error) {
        console.error('[Finance] Error calculating recurring expenses:', error);
        showToast('Failed to calculate recurring expenses: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Build a single service expense card for mobile card layout.
 * Entire card is clickable (fc-clickable) — mirrors desktop tr onclick pattern (Pitfall 6).
 * escapeHTML in onclick is safe for service codes containing apostrophes (REVIEWS Suggestion 3).
 */
function buildServiceExpenseCard(svc) {
    const isOverBudget = svc.remainingBudget < 0;
    const remainingColor = isOverBudget ? '#ef4444' : '#1e293b';
    const remainingWeight = isOverBudget ? '700' : '400';
    const isActive = svc.status === 'active';
    const badgeClass = isActive ? 'badge-success' : 'badge-secondary';
    const statusLabel = isActive ? 'Active' : 'Inactive';
    return `
        <div class="fc-card fc-clickable" onclick="window.showServiceExpenseModal('${escapeHTML(svc.serviceCode)}', ${svc.budget})">
            <div class="fc-card-header">
                <span class="fc-card-id">${escapeHTML(svc.serviceName)}</span>
                <span class="badge ${badgeClass}">${statusLabel}</span>
            </div>
            <div class="fc-card-body">
                <div class="fc-card-row"><span class="fc-label">Code</span><span class="fc-value" style="font-size:0.8125rem;color:#64748b;">${escapeHTML(svc.serviceCode)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Client</span><span class="fc-value">${escapeHTML(svc.clientCode)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Budget</span><span class="fc-value">₱${formatCurrency(svc.budget)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Total Expense</span><span class="fc-value">₱${formatCurrency(svc.totalExpense)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Remaining</span><span class="fc-value" style="color:${remainingColor};font-weight:${remainingWeight};">${isOverBudget ? '⚠️ ' : ''}₱${formatCurrency(Math.abs(svc.remainingBudget))}${isOverBudget ? ' over' : ''}</span></div>
            </div>
        </div>`;
}

/**
 * Render service expenses table (one-time services).
 * Mirrors renderProjectExpensesTable().
 */
function renderServiceExpensesTable() {
    const container = document.getElementById('serviceExpensesContainer');
    if (!container) return;

    // Apply search filter
    const filtered = serviceExpenseSearchTerm
        ? serviceExpenses.filter(s =>
            (s.serviceName && s.serviceName.toLowerCase().includes(serviceExpenseSearchTerm)) ||
            (s.serviceCode && s.serviceCode.toLowerCase().includes(serviceExpenseSearchTerm)))
        : serviceExpenses;

    // Apply sort
    const sorted = [...filtered].sort((a, b) => {
        let aVal = a[serviceExpenseSortColumn];
        let bVal = b[serviceExpenseSortColumn];
        if (aVal == null) return serviceExpenseSortDirection === 'asc' ? 1 : -1;
        if (bVal == null) return serviceExpenseSortDirection === 'asc' ? -1 : 1;
        if (typeof aVal === 'string') {
            return serviceExpenseSortDirection === 'asc'
                ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return serviceExpenseSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    if (serviceExpenses.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 2rem; color: #666;"><p>No services found</p></div>`;
        return;
    }

    if (sorted.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 2rem; color: #666;"><p>No services match your search</p></div>`;
        return;
    }

    let tableHTML = `<div class="table-scroll-container"><table class="data-table"><thead><tr>
        <th onclick="window.sortServiceExpenses('serviceName')" style="cursor: pointer; user-select: none;">Service Name <span class="sort-indicator" data-col="serviceName"></span></th>
        <th onclick="window.sortServiceExpenses('clientCode')" style="cursor: pointer; user-select: none;">Client <span class="sort-indicator" data-col="clientCode"></span></th>
        <th onclick="window.sortServiceExpenses('budget')" style="cursor: pointer; user-select: none; text-align: right;">Budget <span class="sort-indicator" data-col="budget"></span></th>
        <th onclick="window.sortServiceExpenses('totalExpense')" style="cursor: pointer; user-select: none; text-align: right;">Total Expense <span class="sort-indicator" data-col="totalExpense"></span></th>
        <th onclick="window.sortServiceExpenses('remainingBudget')" style="cursor: pointer; user-select: none; text-align: right;">Remaining <span class="sort-indicator" data-col="remainingBudget"></span></th>
        <th onclick="window.sortServiceExpenses('status')" style="cursor: pointer; user-select: none; text-align: center;">Status <span class="sort-indicator" data-col="status"></span></th>
    </tr></thead><tbody>`;

    sorted.forEach(svc => {
        const isOverBudget = svc.remainingBudget < 0;
        const remainingStyle = isOverBudget ? 'color: #ef4444; font-weight: 600;' : '';
        tableHTML += `
            <tr onclick="window.showServiceExpenseModal('${escapeHTML(svc.serviceCode)}', ${svc.budget})" style="cursor: pointer;">
                <td>
                    <div style="font-weight: 600;">${escapeHTML(svc.serviceName)}</div>
                    <div style="font-size: 0.75rem; color: #64748b;">${escapeHTML(svc.serviceCode)}</div>
                </td>
                <td>${escapeHTML(svc.clientCode)}</td>
                <td style="text-align: right;">₱${formatCurrency(svc.budget)}</td>
                <td style="text-align: right;">₱${formatCurrency(svc.totalExpense)}</td>
                <td style="text-align: right; ${remainingStyle}">
                    ${isOverBudget ? '⚠️ ' : ''}₱${formatCurrency(Math.abs(svc.remainingBudget))}
                    ${isOverBudget ? ' over' : ''}
                </td>
                <td style="text-align: center;">
                    <span class="badge badge-${svc.status === 'active' ? 'success' : 'secondary'}">
                        ${svc.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                </td>
            </tr>`;
    });

    tableHTML += `</tbody></table></div>
        <div class="fc-card-list">
            ${sorted.map(svc => buildServiceExpenseCard(svc)).join('')}
        </div>`;
    container.innerHTML = tableHTML;

    // Update sort indicators
    container.querySelectorAll('.sort-indicator').forEach(indicator => {
        const col = indicator.dataset.col;
        if (col === serviceExpenseSortColumn) {
            indicator.textContent = serviceExpenseSortDirection === 'asc' ? ' \u2191' : ' \u2193';
            indicator.style.color = '#1a73e8';
        } else {
            indicator.textContent = ' \u21C5';
            indicator.style.color = '#94a3b8';
        }
    });
}

/**
 * Build a single recurring expense card for mobile card layout.
 * Recurring expenses share the same data shape as one-time services.
 * Both use window.showServiceExpenseModal per existing tr onclick pattern.
 * Thin alias to buildServiceExpenseCard — documents architectural intent
 * and leaves room for future divergence.
 */
function buildRecurringExpenseCard(svc) {
    return buildServiceExpenseCard(svc);
}

/**
 * Render recurring service expenses table.
 * Mirrors renderServiceExpensesTable() but uses recurringExpenses array.
 */
function renderRecurringExpensesTable() {
    const container = document.getElementById('recurringExpensesContainer');
    if (!container) return;

    // Apply search filter
    const filtered = recurringExpenseSearchTerm
        ? recurringExpenses.filter(s =>
            (s.serviceName && s.serviceName.toLowerCase().includes(recurringExpenseSearchTerm)) ||
            (s.serviceCode && s.serviceCode.toLowerCase().includes(recurringExpenseSearchTerm)))
        : recurringExpenses;

    // Apply sort
    const sorted = [...filtered].sort((a, b) => {
        let aVal = a[recurringExpenseSortColumn];
        let bVal = b[recurringExpenseSortColumn];
        if (aVal == null) return recurringExpenseSortDirection === 'asc' ? 1 : -1;
        if (bVal == null) return recurringExpenseSortDirection === 'asc' ? -1 : 1;
        if (typeof aVal === 'string') {
            return recurringExpenseSortDirection === 'asc'
                ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return recurringExpenseSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    if (recurringExpenses.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 2rem; color: #666;"><p>No recurring services found</p></div>`;
        return;
    }

    if (sorted.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 2rem; color: #666;"><p>No recurring services match your search</p></div>`;
        return;
    }

    let tableHTML = `<div class="table-scroll-container"><table class="data-table"><thead><tr>
        <th onclick="window.sortRecurringExpenses('serviceName')" style="cursor: pointer; user-select: none;">Service Name <span class="sort-indicator" data-col="serviceName"></span></th>
        <th onclick="window.sortRecurringExpenses('clientCode')" style="cursor: pointer; user-select: none;">Client <span class="sort-indicator" data-col="clientCode"></span></th>
        <th onclick="window.sortRecurringExpenses('budget')" style="cursor: pointer; user-select: none; text-align: right;">Budget <span class="sort-indicator" data-col="budget"></span></th>
        <th onclick="window.sortRecurringExpenses('totalExpense')" style="cursor: pointer; user-select: none; text-align: right;">Total Expense <span class="sort-indicator" data-col="totalExpense"></span></th>
        <th onclick="window.sortRecurringExpenses('remainingBudget')" style="cursor: pointer; user-select: none; text-align: right;">Remaining <span class="sort-indicator" data-col="remainingBudget"></span></th>
        <th onclick="window.sortRecurringExpenses('status')" style="cursor: pointer; user-select: none; text-align: center;">Status <span class="sort-indicator" data-col="status"></span></th>
    </tr></thead><tbody>`;

    sorted.forEach(svc => {
        const isOverBudget = svc.remainingBudget < 0;
        const remainingStyle = isOverBudget ? 'color: #ef4444; font-weight: 600;' : '';
        tableHTML += `
            <tr onclick="window.showServiceExpenseModal('${escapeHTML(svc.serviceCode)}', ${svc.budget})" style="cursor: pointer;">
                <td>
                    <div style="font-weight: 600;">${escapeHTML(svc.serviceName)}</div>
                    <div style="font-size: 0.75rem; color: #64748b;">${escapeHTML(svc.serviceCode)}</div>
                </td>
                <td>${escapeHTML(svc.clientCode)}</td>
                <td style="text-align: right;">₱${formatCurrency(svc.budget)}</td>
                <td style="text-align: right;">₱${formatCurrency(svc.totalExpense)}</td>
                <td style="text-align: right; ${remainingStyle}">
                    ${isOverBudget ? '⚠️ ' : ''}₱${formatCurrency(Math.abs(svc.remainingBudget))}
                    ${isOverBudget ? ' over' : ''}
                </td>
                <td style="text-align: center;">
                    <span class="badge badge-${svc.status === 'active' ? 'success' : 'secondary'}">
                        ${svc.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                </td>
            </tr>`;
    });

    tableHTML += `</tbody></table></div>
        <div class="fc-card-list">
            ${sorted.map(svc => buildRecurringExpenseCard(svc)).join('')}
        </div>`;
    container.innerHTML = tableHTML;

    // Update sort indicators
    container.querySelectorAll('.sort-indicator').forEach(indicator => {
        const col = indicator.dataset.col;
        if (col === recurringExpenseSortColumn) {
            indicator.textContent = recurringExpenseSortDirection === 'asc' ? ' \u2191' : ' \u2193';
            indicator.style.color = '#1a73e8';
        } else {
            indicator.textContent = ' \u21C5';
            indicator.style.color = '#94a3b8';
        }
    });
}

/**
 * Sort service expenses by column
 */
function sortServiceExpenses(column) {
    if (serviceExpenseSortColumn === column) {
        serviceExpenseSortDirection = serviceExpenseSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        serviceExpenseSortColumn = column;
        serviceExpenseSortDirection = 'asc';
    }
    renderServiceExpensesTable();
}

/**
 * Sort recurring expenses by column
 */
function sortRecurringExpenses(column) {
    if (recurringExpenseSortColumn === column) {
        recurringExpenseSortDirection = recurringExpenseSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        recurringExpenseSortColumn = column;
        recurringExpenseSortDirection = 'asc';
    }
    renderRecurringExpensesTable();
}

/**
 * Cleanup when leaving the view
 */
export async function destroy() {
    // Cleanup modal event listeners
    if (modalAbortController) {
        modalAbortController.abort();
        modalAbortController = null;
    }

    // Unsubscribe from all listeners
    listeners.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });
    listeners = [];

    // Phase 73.3: Detach scroll-hide/show listener.
    if (_financeNavScrollHandler) {
        window.removeEventListener('scroll', _financeNavScrollHandler);
        _financeNavScrollHandler = null;
    }
    _financeNavLastScrollY = 0;

    // Clean up signature pad
    if (approvalSignaturePad) {
        approvalSignaturePad.off();
        approvalSignaturePad = null;
    }

    // Clear state
    materialPRs = [];
    transportRequests = [];
    poData = [];
    mrfCache = new Map();
    approvedTRsThisMonthCount = 0;
    currentPRForApproval = null;
    currentPRForRejection = null;
    currentApprovalTarget = null;
    projectExpenses = [];
    _projectExpensesCachedAt = 0;
    serviceExpenses = [];
    recurringExpenses = [];
    _serviceExpensesCachedAt = 0;
    _recurringExpensesCachedAt = 0;
    activeExpenseSubTab = 'projects';
    projectExpenseSearchTerm = '';
    serviceExpenseSearchTerm = '';
    recurringExpenseSearchTerm = '';

    // Clean up window functions
    delete window.refreshPRs;
    delete window.viewPRDetails;
    delete window.viewTRDetails;
    delete window.approveTR;
    delete window.rejectPR;
    delete window.closePRModal;
    delete window.closeRejectionModal;
    delete window.submitRejection;
    delete window.refreshPOs;
    delete window.exportPOsCSV;
    delete window.promptPODocument;
    delete window.generatePODocument;
    delete window.viewPODetailsFromRFP;
    delete window.financeShowProofModal;
    delete window.refreshProjectExpenses;
    delete window.showProjectExpenseModal;
    // closeProjectExpenseModal cleanup not needed - shared modal handles its own window functions
    delete window.clearApprovalSignature;
    delete window.approvePRWithSignature;
    delete window.showApprovalModal;
    delete window.closeApprovalModal;
    delete window.confirmApproval;
    delete window.sortProjectExpenses;
    delete window.sortPOs;
    delete window.sortMaterialPRs;
    delete window.sortTransportRequests;
    delete window.applyFinanceDeptFilter;
    activeDeptFilter = '';

    // Clean up new service/recurring window functions
    delete window.refreshServiceExpenses;
    delete window.refreshRecurringExpenses;
    delete window.showServiceExpenseModal;
    delete window.sortServiceExpenses;
    delete window.sortRecurringExpenses;
    delete window.switchExpenseSubTab;
    delete window.debouncedProjectExpenseSearch;
    delete window.debouncedServiceExpenseSearch;
    delete window.debouncedRecurringExpenseSearch;

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

    // Reset sort state
    projectExpenseSortColumn = 'projectName';
    projectExpenseSortDirection = 'asc';
    serviceExpenseSortColumn = 'serviceName';
    serviceExpenseSortDirection = 'asc';
    recurringExpenseSortColumn = 'serviceName';
    recurringExpenseSortDirection = 'asc';
    poSortColumn = 'date_issued';
    poSortDirection = 'desc';
    prSortColumn = 'date_generated';
    prSortDirection = 'desc';
    trSortColumn = 'date_submitted';
    trSortDirection = 'desc';
}

// ========================================
// PR/TR LOADING FUNCTIONS
// ========================================

/**
 * Load PRs and Transport Requests with real-time listeners
 */
async function loadPRs() {
    // Load Material PRs from prs collection
    const prsRef = collection(db, 'prs');
    const prQuery = query(prsRef, where('finance_status', '==', 'Pending'));

    const prListener = onSnapshot(prQuery, (snapshot) => {
        materialPRs = [];

        snapshot.forEach((docSnap) => {
            const pr = { id: docSnap.id, ...docSnap.data() };
            // Only include non-transport PRs
            if (!pr.pr_id?.startsWith('TR-') && pr.request_type !== 'service') {
                materialPRs.push(pr);
            }
        });

        // Re-apply current sort order after Firestore update
        materialPRs.sort((a, b) => {
            let aVal = a[prSortColumn];
            let bVal = b[prSortColumn];
            if (aVal == null) return prSortDirection === 'asc' ? 1 : -1;
            if (bVal == null) return prSortDirection === 'asc' ? -1 : 1;
            if (typeof aVal === 'string') {
                return prSortDirection === 'asc'
                    ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return prSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        });

        // Fetch MRF data for date_needed/justification lookups
        const uncachedPRMrfIds = materialPRs
            .map(pr => pr.mrf_id)
            .filter(id => id && !mrfCache.has(id));

        if (uncachedPRMrfIds.length > 0) {
            const chunks = [];
            for (let i = 0; i < uncachedPRMrfIds.length; i += 30) {
                chunks.push(uncachedPRMrfIds.slice(i, i + 30));
            }
            Promise.all(
                chunks.map(chunk =>
                    getDocs(query(collection(db, 'mrfs'), where('mrf_id', 'in', chunk)))
                )
            ).then(snapshots => {
                snapshots.forEach(snap =>
                    snap.forEach(d => {
                        const data = d.data();
                        if (data.mrf_id) mrfCache.set(data.mrf_id, { date_needed: data.date_needed || '', justification: data.justification || '' });
                    })
                );
                renderMaterialPRs();
            });
        } else {
            renderMaterialPRs();
        }
        updateStats();
    });
    listeners.push(prListener);

    // Load Transport Requests from transport_requests collection
    const trsRef = collection(db, 'transport_requests');
    const trQuery = query(trsRef, where('finance_status', '==', 'Pending'));

    const trListener = onSnapshot(trQuery, (snapshot) => {
        transportRequests = [];

        snapshot.forEach((docSnap) => {
            const tr = { id: docSnap.id, ...docSnap.data() };
            transportRequests.push(tr);
        });

        // Re-apply current sort order after Firestore update
        transportRequests.sort((a, b) => {
            let aVal = a[trSortColumn];
            let bVal = b[trSortColumn];
            if (aVal == null) return trSortDirection === 'asc' ? 1 : -1;
            if (bVal == null) return trSortDirection === 'asc' ? -1 : 1;
            if (typeof aVal === 'string') {
                return trSortDirection === 'asc'
                    ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return trSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        });

        // Fetch MRF data for date_needed lookups
        const uncachedTRMrfIds = transportRequests
            .map(tr => tr.mrf_id)
            .filter(id => id && !mrfCache.has(id));

        if (uncachedTRMrfIds.length > 0) {
            const chunks = [];
            for (let i = 0; i < uncachedTRMrfIds.length; i += 30) {
                chunks.push(uncachedTRMrfIds.slice(i, i + 30));
            }
            Promise.all(
                chunks.map(chunk =>
                    getDocs(query(collection(db, 'mrfs'), where('mrf_id', 'in', chunk)))
                )
            ).then(snapshots => {
                snapshots.forEach(snap =>
                    snap.forEach(d => {
                        const data = d.data();
                        if (data.mrf_id) mrfCache.set(data.mrf_id, { date_needed: data.date_needed || '', justification: data.justification || '' });
                    })
                );
                renderTransportRequests();
            });
        } else {
            renderTransportRequests();
        }
        updateStats();
    });
    listeners.push(trListener);
}

/**
 * Build a mobile card HTML string for a single Material PR.
 * Mirrors the table row columns from renderMaterialPRs().
 * Note: desktop PR rows do NOT apply overdue highlighting, so .fc-overdue is not used here
 * (REVIEWS Concern 1 — parity with desktop).
 */
function buildMaterialPRCard(pr) {
    const items = JSON.parse(pr.items_json || '[]');
    const supplier = pr.supplier_name || (items[0] && items[0].supplier) || 'N/A';
    const urgencyLevel = pr.urgency_level || 'Low';
    const urgencyColors = {
        'Critical': { bg: '#fef2f2', color: '#dc2626' },
        'High':     { bg: '#fef2f2', color: '#ef4444' },
        'Medium':   { bg: '#fef3c7', color: '#f59e0b' },
        'Low':      { bg: '#dcfce7', color: '#22c55e' }
    };
    const uc = urgencyColors[urgencyLevel] || urgencyColors['Low'];
    const dateNeeded = mrfCache.get(pr.mrf_id)?.date_needed
        ? formatDate(mrfCache.get(pr.mrf_id).date_needed)
        : '—';
    return `
        <div class="fc-card">
            <div class="fc-card-header">
                <span class="fc-card-id">${escapeHTML(pr.pr_id || '')}</span>
                <span style="background:${uc.bg};color:${uc.color};padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">${urgencyLevel}</span>
            </div>
            <div class="fc-card-body">
                <div class="fc-card-row"><span class="fc-label">Project</span><span class="fc-value">${getDeptBadgeHTML(pr)} ${escapeHTML(pr.project_name || pr.service_name || 'N/A')}</span></div>
                <div class="fc-card-row"><span class="fc-label">Supplier</span><span class="fc-value">${escapeHTML(supplier)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Amount</span><span class="fc-value fc-amount">₱${formatCurrency(pr.total_amount || 0)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Date Issued</span><span class="fc-value">${formatDate(pr.date_generated)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Date Needed</span><span class="fc-value">${dateNeeded}</span></div>
                <div class="fc-card-row"><span class="fc-label">MRF</span><span class="fc-value" style="font-size:0.8125rem;color:#64748b;">${escapeHTML(pr.mrf_id || '')}</span></div>
            </div>
            <div class="fc-card-actions">
                <button class="btn btn-sm btn-primary" onclick="window.viewPRDetails('${pr.id}')">Review PR</button>
            </div>
        </div>`;
}

/**
 * Render Material PRs table
 */
function renderMaterialPRs() {
    const tbody = document.getElementById('materialPRsBody');

    const filtered = activeDeptFilter
        ? materialPRs.filter(pr => (pr.department || 'projects') === activeDeptFilter)
        : materialPRs;

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 2rem; color: #666;">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">✓</div>
                    <div>No pending material PRs${activeDeptFilter ? ' for ' + (activeDeptFilter === 'services' ? 'Services' : 'Projects') : ''}</div>
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = filtered.map(pr => {
            const items = JSON.parse(pr.items_json || '[]');
            const supplier = pr.supplier_name || (items[0] && items[0].supplier) || 'N/A';
            const urgencyLevel = pr.urgency_level || 'Low';

            const urgencyColors = {
                'Critical': { bg: '#fef2f2', color: '#dc2626' },
                'High': { bg: '#fef2f2', color: '#ef4444' },
                'Medium': { bg: '#fef3c7', color: '#f59e0b' },
                'Low': { bg: '#dcfce7', color: '#22c55e' }
            };
            const colors = urgencyColors[urgencyLevel] || urgencyColors['Low'];

            return `
            <tr>
                <td><strong>${pr.pr_id}</strong></td>
                <td>${pr.mrf_id}</td>
                <td><span style="display:inline-flex;align-items:center;gap:6px;">${getDeptBadgeHTML(pr)} ${escapeHTML(pr.project_name || pr.service_name || 'N/A')}</span></td>
                <td>${formatDate(pr.date_generated)}</td>
                <td>${mrfCache.get(pr.mrf_id)?.date_needed ? formatDate(mrfCache.get(pr.mrf_id).date_needed) : '—'}</td>
                <td><span style="background: ${colors.bg}; color: ${colors.color}; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">${urgencyLevel}</span></td>
                <td><strong>₱${formatCurrency(pr.total_amount || 0)}</strong></td>
                <td>${escapeHTML(supplier)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.viewPRDetails('${pr.id}')">Review</button>
                </td>
            </tr>
        `;
        }).join('');
    }

    // Update sort indicators for Material PRs table (runs for both empty and non-empty)
    const prTable = tbody.closest('table');
    if (prTable) {
        prTable.querySelectorAll('.sort-indicator').forEach(indicator => {
            const col = indicator.dataset.col;
            if (col === prSortColumn) {
                indicator.textContent = prSortDirection === 'asc' ? ' \u2191' : ' \u2193';
                indicator.style.color = '#1a73e8';
            } else {
                indicator.textContent = ' \u21C5';
                indicator.style.color = '#94a3b8';
            }
        });
    }

    // Mobile card list (Phase 73.1) — populated alongside tbody
    const cardList = document.getElementById('materialPRsCardList');
    if (cardList) {
        if (filtered.length === 0) {
            cardList.innerHTML = `<div class="fc-empty">No pending material PRs to review${activeDeptFilter ? ' for ' + (activeDeptFilter === 'services' ? 'Services' : 'Projects') : ''}</div>`;
        } else {
            cardList.innerHTML = filtered.map(pr => buildMaterialPRCard(pr)).join('');
        }
    }
}

/**
 * Build a mobile card HTML string for a single Transport Request.
 * Mirrors the table row columns from renderTransportRequests().
 * Note: desktop TR rows do NOT apply overdue highlighting (REVIEWS Concern 1 — parity with desktop).
 */
function buildTRCard(tr) {
    const items = JSON.parse(tr.items_json || '[]');
    const serviceType = items[0]?.category || 'Transportation';
    const urgencyLevel = tr.urgency_level || 'Low';
    const urgencyColors = {
        'Critical': { bg: '#fef2f2', color: '#dc2626' },
        'High':     { bg: '#fef2f2', color: '#ef4444' },
        'Medium':   { bg: '#fef3c7', color: '#f59e0b' },
        'Low':      { bg: '#dcfce7', color: '#22c55e' }
    };
    const uc = urgencyColors[urgencyLevel] || urgencyColors['Low'];
    const dateNeeded = mrfCache.get(tr.mrf_id)?.date_needed
        ? formatDate(mrfCache.get(tr.mrf_id).date_needed)
        : '—';
    return `
        <div class="fc-card">
            <div class="fc-card-header">
                <span class="fc-card-id">${escapeHTML(tr.tr_id || '')}</span>
                <span style="background:${uc.bg};color:${uc.color};padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">${urgencyLevel}</span>
            </div>
            <div class="fc-card-body">
                <div class="fc-card-row"><span class="fc-label">Project</span><span class="fc-value">${getDeptBadgeHTML(tr)} ${escapeHTML(tr.project_name || tr.service_name || 'N/A')}</span></div>
                <div class="fc-card-row"><span class="fc-label">Service Type</span><span class="fc-value">${escapeHTML(serviceType)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Amount</span><span class="fc-value fc-amount">₱${formatCurrency(tr.total_amount || 0)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Date Issued</span><span class="fc-value">${formatDate(tr.date_submitted)}</span></div>
                <div class="fc-card-row"><span class="fc-label">Date Needed</span><span class="fc-value">${dateNeeded}</span></div>
                <div class="fc-card-row"><span class="fc-label">MRF</span><span class="fc-value" style="font-size:0.8125rem;color:#64748b;">${escapeHTML(tr.mrf_id || '')}</span></div>
            </div>
            <div class="fc-card-actions">
                <button class="btn btn-sm btn-primary" onclick="window.viewTRDetails('${tr.id}')">Review TR</button>
            </div>
        </div>`;
}

/**
 * Render Transport Requests table
 */
function renderTransportRequests() {
    const tbody = document.getElementById('transportRequestsBody');

    const filtered = activeDeptFilter
        ? transportRequests.filter(tr => (tr.department || 'projects') === activeDeptFilter)
        : transportRequests;

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 2rem; color: #666;">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">✓</div>
                    <div>No pending transport requests${activeDeptFilter ? ' for ' + (activeDeptFilter === 'services' ? 'Services' : 'Projects') : ''}</div>
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = filtered.map(tr => {
            const items = JSON.parse(tr.items_json || '[]');
            const serviceType = items[0]?.category || 'Transportation';
            const urgencyLevel = tr.urgency_level || 'Low';

            const urgencyColors = {
                'Critical': { bg: '#fef2f2', color: '#dc2626' },
                'High': { bg: '#fef2f2', color: '#ef4444' },
                'Medium': { bg: '#fef3c7', color: '#f59e0b' },
                'Low': { bg: '#dcfce7', color: '#22c55e' }
            };
            const colors = urgencyColors[urgencyLevel] || urgencyColors['Low'];

            return `
            <tr>
                <td><strong>${tr.tr_id}</strong></td>
                <td>${tr.mrf_id}</td>
                <td><span style="display:inline-flex;align-items:center;gap:6px;">${getDeptBadgeHTML(tr)} ${escapeHTML(tr.project_name || tr.service_name || 'N/A')}</span></td>
                <td>${formatDate(tr.date_submitted)}</td>
                <td>${mrfCache.get(tr.mrf_id)?.date_needed ? formatDate(mrfCache.get(tr.mrf_id).date_needed) : '—'}</td>
                <td><span style="background: ${colors.bg}; color: ${colors.color}; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">${urgencyLevel}</span></td>
                <td><strong>₱${formatCurrency(tr.total_amount || 0)}</strong></td>
                <td>${escapeHTML(serviceType)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.viewTRDetails('${tr.id}')">Review</button>
                </td>
            </tr>
        `;
        }).join('');
    }

    // Update sort indicators for Transport Requests table (runs for both empty and non-empty)
    const trTable = tbody.closest('table');
    if (trTable) {
        trTable.querySelectorAll('.sort-indicator').forEach(indicator => {
            const col = indicator.dataset.col;
            if (col === trSortColumn) {
                indicator.textContent = trSortDirection === 'asc' ? ' \u2191' : ' \u2193';
                indicator.style.color = '#1a73e8';
            } else {
                indicator.textContent = ' \u21C5';
                indicator.style.color = '#94a3b8';
            }
        });
    }

    // Mobile card list (Phase 73.1) — populated alongside tbody
    const trCardList = document.getElementById('transportRequestsCardList');
    if (trCardList) {
        if (filtered.length === 0) {
            trCardList.innerHTML = `<div class="fc-empty">No pending transport requests to review${activeDeptFilter ? ' for ' + (activeDeptFilter === 'services' ? 'Services' : 'Projects') : ''}</div>`;
        } else {
            trCardList.innerHTML = filtered.map(tr => buildTRCard(tr)).join('');
        }
    }
}

/**
 * Sort Material PRs by column
 */
function sortMaterialPRs(column) {
    if (prSortColumn === column) {
        prSortDirection = prSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        prSortColumn = column;
        prSortDirection = 'asc';
    }
    materialPRs.sort((a, b) => {
        let aVal = column === 'mrf_date_needed' ? (mrfCache.get(a.mrf_id)?.date_needed || '') : a[column];
        let bVal = column === 'mrf_date_needed' ? (mrfCache.get(b.mrf_id)?.date_needed || '') : b[column];
        if (aVal == null || aVal === '') return prSortDirection === 'asc' ? 1 : -1;
        if (bVal == null || bVal === '') return prSortDirection === 'asc' ? -1 : 1;
        if (typeof aVal === 'string') {
            return prSortDirection === 'asc'
                ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return prSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    renderMaterialPRs();
}

/**
 * Sort Transport Requests by column
 */
function sortTransportRequests(column) {
    if (trSortColumn === column) {
        trSortDirection = trSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        trSortColumn = column;
        trSortDirection = 'asc';
    }
    transportRequests.sort((a, b) => {
        let aVal = column === 'mrf_date_needed' ? (mrfCache.get(a.mrf_id)?.date_needed || '') : a[column];
        let bVal = column === 'mrf_date_needed' ? (mrfCache.get(b.mrf_id)?.date_needed || '') : b[column];
        if (aVal == null || aVal === '') return trSortDirection === 'asc' ? 1 : -1;
        if (bVal == null || bVal === '') return trSortDirection === 'asc' ? -1 : 1;
        if (typeof aVal === 'string') {
            return trSortDirection === 'asc'
                ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return trSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    renderTransportRequests();
}

/**
 * Update statistics cards
 */
function updateStats() {
    document.getElementById('materialPendingCount').textContent = materialPRs.length;
    document.getElementById('transportPendingCount').textContent = transportRequests.length;

    const totalPending = materialPRs.reduce((sum, pr) => sum + parseFloat(pr.total_amount || 0), 0) +
                        transportRequests.reduce((sum, tr) => sum + parseFloat(tr.total_amount || 0), 0);

    document.getElementById('pendingAmount').textContent = '₱' + formatCurrency(totalPending);

    // Count POs issued in the current calendar month
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    let approvedThisMonth = 0;
    for (const po of poData) {
        let poDate = null;
        const ts = po.date_issued;
        if (ts) {
            if (typeof ts.toDate === 'function') {
                poDate = ts.toDate();
            } else if (ts.seconds != null) {
                poDate = new Date(ts.seconds * 1000);
            } else {
                const d = new Date(ts);
                if (!isNaN(d.getTime())) poDate = d;
            }
        }
        // Fallback to date_issued_legacy (ISO string)
        if (!poDate && po.date_issued_legacy) {
            const d = new Date(po.date_issued_legacy);
            if (!isNaN(d.getTime())) poDate = d;
        }
        if (poDate && poDate.getFullYear() === currentYear && poDate.getMonth() === currentMonth) {
            approvedThisMonth++;
        }
    }

    // Also count approved TRs submitted this month
    approvedThisMonth += approvedTRsThisMonthCount;

    document.getElementById('approvedCount').textContent = approvedThisMonth;
}

/**
 * Load count of TRs with finance_status == 'Approved' submitted in the current calendar month
 */
async function loadApprovedTRsThisMonth() {
    try {
        const now = new Date();
        // Compute start/end of current month as ISO date strings for comparison
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

        const snap = await getDocs(
            query(
                collection(db, 'transport_requests'),
                where('finance_status', '==', 'Approved'),
                where('date_submitted', '>=', monthStart),
                where('date_submitted', '<=', monthEnd)
            )
        );
        approvedTRsThisMonthCount = snap.size;
    } catch (e) {
        console.warn('[Finance] Could not load approved TR count:', e);
        approvedTRsThisMonthCount = 0;
    }
}

/**
 * Refresh PRs manually
 */
async function refreshPRs() {
    await loadPRs();
    showToast('PR list refreshed', 'success');
}

// ========================================
// PR/TR DETAILS & APPROVAL
// ========================================

/**
 * View PR Details
 */
async function viewPRDetails(prId) {
    showLoading(true);

    try {
        const prDoc = await getDoc(doc(db, 'prs', prId));

        if (!prDoc.exists()) {
            showToast('PR not found', 'error');
            return;
        }

        const pr = { id: prDoc.id, ...prDoc.data() };
        currentPRForApproval = pr;
        currentPRForRejection = pr;

        // Fetch MRF justification for this PR
        let mrfJustification = pr.justification || null;
        if (!mrfJustification && pr.mrf_doc_id) {
            try {
                const mrfSnap = await getDoc(doc(db, 'mrfs', pr.mrf_doc_id));
                if (mrfSnap.exists()) {
                    mrfJustification = mrfSnap.data().justification || null;
                }
            } catch (e) { /* silent — justification is informational */ }
        }
        // Also try mrfCache if available
        if (!mrfJustification && pr.mrf_id && mrfCache.has(pr.mrf_id)) {
            mrfJustification = mrfCache.get(pr.mrf_id).justification || null;
        }
        mrfJustification = mrfJustification || '—';

        const items = JSON.parse(pr.items_json || '[]');
        const urgencyLevel = pr.urgency_level || 'Low';

        const urgencyColors = {
            'Critical': { bg: '#fef2f2', color: '#dc2626' },
            'High': { bg: '#fef2f2', color: '#ef4444' },
            'Medium': { bg: '#fef3c7', color: '#f59e0b' },
            'Low': { bg: '#dcfce7', color: '#22c55e' }
        };
        const colors = urgencyColors[urgencyLevel] || urgencyColors['Low'];

        const modalContent = `
            <div class="modal-details-grid">
                <div class="modal-detail-item">
                    <div class="modal-detail-label">PR ID:</div>
                    <div class="modal-detail-value"><strong>${pr.pr_id}</strong></div>
                </div>
                <div class="modal-detail-item">
                    <div class="modal-detail-label">MRF Reference:</div>
                    <div class="modal-detail-value">${pr.mrf_id}</div>
                </div>
                <div class="modal-detail-item">
                    <div class="modal-detail-label">Department:</div>
                    <div class="modal-detail-value" style="display:flex;align-items:center;gap:6px;">${getDeptBadgeHTML(pr)} ${escapeHTML(getMRFLabel(pr))}</div>
                </div>
                <div class="modal-detail-item">
                    <div class="modal-detail-label">Requestor:</div>
                    <div class="modal-detail-value">${escapeHTML(pr.requestor_name)}</div>
                </div>
                <div class="modal-detail-item">
                    <div class="modal-detail-label">Urgency Level:</div>
                    <div class="modal-detail-value">
                        <span style="background: ${colors.bg}; color: ${colors.color}; padding: 0.25rem 0.75rem; border-radius: 6px; font-weight: 600; font-size: 0.875rem;">${urgencyLevel}</span>
                    </div>
                </div>
                <div class="modal-detail-item">
                    <div class="modal-detail-label">Date Generated:</div>
                    <div class="modal-detail-value">${formatDate(pr.date_generated)}</div>
                </div>
                <div class="modal-detail-item full-width">
                    <div class="modal-detail-label">Delivery Address:</div>
                    <div class="modal-detail-value">${escapeHTML(pr.delivery_address || 'N/A')}</div>
                </div>
                <div class="modal-detail-item full-width">
                    <div class="modal-detail-label">JUSTIFICATION:</div>
                    <div class="modal-detail-value">${escapeHTML(mrfJustification)}</div>
                </div>
                <div class="modal-detail-item full-width">
                    <div class="modal-detail-label">Total Amount:</div>
                    <div class="modal-detail-value"><strong style="color: #059669; font-size: 1.5rem;">₱${formatCurrency(pr.total_amount || 0)}</strong></div>
                </div>
                <div class="modal-detail-item">
                    <div class="modal-detail-label">Supplier:</div>
                    <div class="modal-detail-value">${escapeHTML(pr.supplier_name || 'N/A')}</div>
                </div>
            </div>

            <h4 style="margin-bottom: 1rem; font-size: 1rem; font-weight: 600; color: #1e293b;">Items Breakdown</h4>
                <div class="pr-items-scroll">
                <table class="modal-items-table pr-items-table">
                    <thead>
                    <tr>
                        <th>Item</th>
                        <th>Category</th>
                        <th>Qty</th>
                        <th>Unit Cost</th>
                        <th>Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(item => `
                        <tr>
                            <td>${escapeHTML(item.item || item.item_name)}</td>
                            <td>${escapeHTML(item.category || 'N/A')}</td>
                            <td>${escapeHTML(String(item.qty || item.quantity || ''))} ${escapeHTML(item.unit || '')}</td>
                            <td>₱${formatCurrency(item.unit_cost || 0)}</td>
                            <td><strong>₱${formatCurrency(item.subtotal || 0)}</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="4" style="text-align: right; font-weight: 600;">TOTAL:</td>
                        <td>₱${formatCurrency(pr.total_amount || 0)}</td>
                    </tr>
                </tfoot>
                </table>
                </div>
        `;

        document.getElementById('prModalTitle').textContent = `Purchase Request - ${pr.pr_id}`;
        document.getElementById('prModalBody').innerHTML = modalContent;

        // JS sticky first column: CSS position:sticky is broken inside overflow-y:auto modal bodies.
        // translateX on scroll is the reliable fallback.
        const _prScrollWrap = document.getElementById('prModalBody').querySelector('.pr-items-scroll');
        if (_prScrollWrap) {
            _prScrollWrap.addEventListener('scroll', function() {
                const sx = this.scrollLeft;
                this.querySelectorAll('.pr-items-table th:first-child, .pr-items-table td:first-child').forEach(function(el) {
                    el.style.transform = 'translateX(' + sx + 'px)';
                });
            }, { passive: true });
        }

        const canEdit = window.canEditTab?.('finance');
        const showEditControls = canEdit !== false;

        const footer = document.getElementById('prModalFooter');
        footer.innerHTML = `
            <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                ${showEditControls ? `
                    <button class="btn btn-danger" onclick="window.rejectPR('${pr.id}')">
                        Reject
                    </button>
                    <button class="btn btn-primary" onclick="window.showApprovalModal('${pr.id}', 'pr')">
                        Approve & Generate PO
                    </button>
                ` : ''}
                <button class="btn btn-secondary" onclick="window.closePRModal()">Close</button>
            </div>
        `;

        document.getElementById('prModal').classList.add('active');

    } catch (error) {
        console.error('Error loading PR details:', error);
        showToast('Failed to load PR details', 'error');
    } finally {
        showLoading(false);
    }
};

/**
 * View TR Details
 */
async function viewTRDetails(trId) {
    showLoading(true);

    try {
        const trDoc = await getDoc(doc(db, 'transport_requests', trId));

        if (!trDoc.exists()) {
            showToast('Transport Request not found', 'error');
            return;
        }

        const tr = { id: trDoc.id, ...trDoc.data() };
        tr.isTransportRequest = true;
        tr.pr_id = tr.tr_id;
        currentPRForApproval = tr;
        currentPRForRejection = tr;

        // Fetch MRF justification for this TR
        let mrfJustification = tr.justification || null;
        if (!mrfJustification && tr.mrf_id && mrfCache.has(tr.mrf_id)) {
            mrfJustification = mrfCache.get(tr.mrf_id).justification || null;
        }
        if (!mrfJustification && tr.mrf_doc_id) {
            try {
                const mrfSnap = await getDoc(doc(db, 'mrfs', tr.mrf_doc_id));
                if (mrfSnap.exists()) mrfJustification = mrfSnap.data().justification || null;
            } catch (e) { /* silent */ }
        }
        mrfJustification = mrfJustification || '—';

        const items = JSON.parse(tr.items_json || '[]');
        const urgencyLevel = tr.urgency_level || 'Low';

        const urgencyColors = {
            'Critical': { bg: '#fef2f2', color: '#dc2626' },
            'High': { bg: '#fef2f2', color: '#ef4444' },
            'Medium': { bg: '#fef3c7', color: '#f59e0b' },
            'Low': { bg: '#dcfce7', color: '#22c55e' }
        };
        const colors = urgencyColors[urgencyLevel] || urgencyColors['Low'];

        const modalContent = `
            <div class="modal-details-grid">
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">TR ID:</div>
                    <div><strong>${tr.tr_id}</strong></div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">MRF Reference:</div>
                    <div>${tr.mrf_id}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Department:</div>
                    <div style="display:flex;align-items:center;gap:6px;">${getDeptBadgeHTML(tr)} ${escapeHTML(getMRFLabel(tr))}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Requestor:</div>
                    <div>${escapeHTML(tr.requestor_name)}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Urgency Level:</div>
                    <div><span style="background: ${colors.bg}; color: ${colors.color}; padding: 0.25rem 0.75rem; border-radius: 4px; font-weight: 600;">${urgencyLevel}</span></div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Date Submitted:</div>
                    <div>${formatDate(tr.date_submitted)}</div>
                </div>
                <div style="grid-column: 1 / -1;">
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Delivery Address:</div>
                    <div>${escapeHTML(tr.delivery_address || 'N/A')}</div>
                </div>
                <div style="grid-column: 1 / -1;">
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Justification:</div>
                    <div>${escapeHTML(mrfJustification)}</div>
                </div>
                <div style="grid-column: 1 / -1;">
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Total Cost:</div>
                    <div><strong style="color: #34a853; font-size: 1.25rem;">₱${formatCurrency(tr.total_amount || 0)}</strong></div>
                </div>
            </div>

            <div style="margin: 1.5rem 0; padding: 1.5rem; background: #f8f9fa; border-radius: 8px;">
                <h4 style="margin-bottom: 1rem;">Service Items</h4>
                    <div class="pr-items-scroll">
                    <table class="modal-items-table pr-items-table">
                    <thead>
                        <tr>
                            <th>Service</th>
                            <th>Category</th>
                            <th>Qty</th>
                            <th>Unit Cost</th>
                            <th>Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr>
                                <td>${escapeHTML(item.item || item.item_name)}</td>
                                <td>${escapeHTML(item.category || 'N/A')}</td>
                                <td>${escapeHTML(String(item.qty || item.quantity || ''))} ${escapeHTML(item.unit || '')}</td>
                                <td>₱${formatCurrency(item.unit_cost || 0)}</td>
                                <td><strong>₱${formatCurrency(item.subtotal || 0)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="4" style="text-align: right; border-top: 2px solid #dee2e6;">TOTAL:</td>
                            <td style="border-top: 2px solid #dee2e6;">₱${formatCurrency(tr.total_amount || 0)}</td>
                        </tr>
                    </tfoot>
                </table>
                </div>
            </div>

            ${tr.rejection_reason ? `
                <div style="margin: 1rem 0; padding: 1rem; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px;">
                    <div style="font-weight: 600; color: #dc2626; margin-bottom: 0.5rem;">Previously Rejected</div>
                    <div style="font-size: 0.875rem; color: #7f1d1d;">
                        <strong>Reason:</strong> ${escapeHTML(tr.rejection_reason)}<br>
                        <strong>Rejected by:</strong> ${escapeHTML(tr.rejected_by || 'Finance')}<br>
                        ${tr.rejected_at ? `<strong>Rejected at:</strong> ${new Date(tr.rejected_at).toLocaleString()}` : ''}
                    </div>
                </div>
            ` : ''}
        `;

        document.getElementById('prModalTitle').textContent = `Transport Request - ${tr.tr_id}`;
        document.getElementById('prModalBody').innerHTML = modalContent;

        // JS sticky first column (same reason as PR modal — CSS sticky broken by modal-body overflow)
        const _trScrollWrap = document.getElementById('prModalBody').querySelector('.pr-items-scroll');
        if (_trScrollWrap) {
            _trScrollWrap.addEventListener('scroll', function() {
                const sx = this.scrollLeft;
                this.querySelectorAll('.pr-items-table th:first-child, .pr-items-table td:first-child').forEach(function(el) {
                    el.style.transform = 'translateX(' + sx + 'px)';
                });
            }, { passive: true });
        }

        const canEdit = window.canEditTab?.('finance');
        const showEditControls = canEdit !== false;

        const footer = document.getElementById('prModalFooter');
        footer.innerHTML = `
            <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                ${showEditControls ? `
                    <button class="btn btn-danger" onclick="window.rejectPR('${tr.id}')">
                        Reject
                    </button>
                    <button class="btn btn-primary" onclick="window.approveTR('${tr.id}')">
                        Approve Transport Request
                    </button>
                ` : ''}
                <button class="btn btn-secondary" onclick="window.closePRModal()">Close</button>
            </div>
        `;

        document.getElementById('prModal').classList.add('active');

    } catch (error) {
        console.error('Error loading TR details:', error);
        showToast('Failed to load TR details', 'error');
    } finally {
        showLoading(false);
    }
};

/**
 * Approve PR with signature validation and user attribution
 * Creates PO with embedded signature and finance approver identity
 */
async function approvePRWithSignature(prId) {
    if (window.canEditTab?.('finance') === false) {
        showToast('You do not have permission to approve PRs', 'error');
        return;
    }

    const currentUser = window.getCurrentUser();
    if (!currentUser) {
        showToast('Session expired. Please log in again.', 'error');
        return;
    }

    // Validate signature exists
    if (!approvalSignaturePad || approvalSignaturePad.isEmpty()) {
        showToast('Please provide your signature before approving', 'error');
        return;
    }

    // Export signature as base64 PNG
    const signatureDataURL = approvalSignaturePad.toDataURL('image/png');

    showLoading(true);

    try {
        // Get PR document
        const prRef = doc(db, 'prs', prId);
        const prDoc = await getDoc(prRef);

        if (!prDoc.exists()) {
            throw new Error('PR not found');
        }

        const pr = prDoc.data();

        // Update PR status with finance approver attribution
        await updateDoc(prRef, {
            finance_status: 'Approved',
            finance_approver_user_id: currentUser.uid,
            finance_approver_name: currentUser.full_name || currentUser.email || 'Finance User',
            finance_approved_at: serverTimestamp(),
            date_approved: new Date().toISOString().split('T')[0], // Legacy compatibility
            approved_by_name: currentUser.full_name || currentUser.email || 'Finance User',
            approved_by_uid: currentUser.uid
        });

        // Update MRF status
        const mrfsRef = collection(db, 'mrfs');
        const mrfQuery = query(mrfsRef, where('mrf_id', '==', pr.mrf_id));
        const mrfSnapshot = await getDocs(mrfQuery);

        if (!mrfSnapshot.empty) {
            const mrfDoc = mrfSnapshot.docs[0];
            await updateDoc(doc(db, 'mrfs', mrfDoc.id), {
                status: 'Finance Approved',
                updated_at: new Date().toISOString()
            });
        }

        // Generate POs with signature data
        const poCount = await generatePOsForPRWithSignature(pr, signatureDataURL, currentUser);

        showToast(`PR approved! Generated ${poCount} PO(s) successfully.`, 'success');

        // Refresh PR list and close approval modal - STAY on approvals tab
        await refreshPRs();
        closeApprovalModal();

    } catch (error) {
        console.error('[Finance] Error approving PR:', error);
        showToast('Failed to approve PR: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Generate POs from approved PR with signature and user attribution
 * @param {Object} pr - PR data
 * @param {string} signatureDataURL - Base64 signature image
 * @param {Object} currentUser - Current user object
 * @returns {number} Number of POs created
 */
async function generatePOsForPRWithSignature(pr, signatureDataURL, currentUser) {
    const items = JSON.parse(pr.items_json || '[]');

    // Group items by supplier
    const itemsBySupplier = {};
    items.forEach(item => {
        const supplier = item.supplier || 'Unknown Supplier';
        if (!itemsBySupplier[supplier]) {
            itemsBySupplier[supplier] = [];
        }
        itemsBySupplier[supplier].push(item);
    });

    const suppliers = Object.keys(itemsBySupplier);

    // Get next PO number
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const currentMonthPrefix = `PO_${year}_${month}`;

    const posRef = collection(db, 'pos');
    const allPOsSnapshot = await getDocs(posRef);
    let maxPONum = 0;

    allPOsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.po_id && data.po_id.startsWith(currentMonthPrefix)) {
            const match = data.po_id.match(/PO_\d{4}_\d{2}-(\d+)/);
            if (match) {
                const num = parseInt(match[1]);
                if (num > maxPONum) maxPONum = num;
            }
        }
    });

    let nextPONum = maxPONum + 1;
    let poCount = 0;

    // Create PO for each supplier with signature
    for (const supplier of suppliers) {
        const supplierItems = itemsBySupplier[supplier];
        const supplierTotal = supplierItems.reduce((s, item) => s + parseFloat(item.subtotal || 0), 0);

        const firstWord = supplier.split(/\s+/)[0] || supplier;
        const supplierSlug = firstWord.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toUpperCase();
        const poId = `PO_${year}_${month}-${String(nextPONum).padStart(3, '0')}-${supplierSlug}`;

        await addDoc(collection(db, 'pos'), {
            po_id: poId,
            pr_id: pr.pr_id,
            mrf_id: pr.mrf_id,
            supplier_name: supplier,
            project_code: pr.project_code || '',
            project_name: pr.project_name,
            service_code: pr.service_code || '',
            service_name: pr.service_name || '',
            department: pr.department || 'projects',
            requestor_name: pr.requestor_name,
            delivery_address: pr.delivery_address || '',
            items_json: JSON.stringify(supplierItems),
            total_amount: supplierTotal,
            procurement_status: 'Pending Procurement',
            is_subcon: false,
            finance_approver_user_id: currentUser.uid,
            finance_approver_name: currentUser.full_name || currentUser.email || 'Finance User',
            finance_signature_url: signatureDataURL,
            date_issued: serverTimestamp(),
            date_issued_legacy: new Date().toISOString().split('T')[0],
            created_at: serverTimestamp()
        });

        nextPONum++;
        poCount++;
    }

    return poCount;
}

/**
 * Approve TR (Transport Request)
 */
async function approveTR(trId) {
    if (window.canEditTab?.('finance') === false) {
        showToast('You do not have permission to edit finance data', 'error');
        return;
    }

    const currentUser = window.getCurrentUser();
    if (!currentUser) {
        showToast('Session expired. Please log in again.', 'error');
        return;
    }

    if (!confirm('Approve this Transport Request?')) {
        return;
    }

    const tr = currentPRForApproval;
    if (!tr || tr.id !== trId) {
        showToast('TR reference lost. Please refresh and try again.', 'error');
        return;
    }

    showLoading(true);

    try {
        // Update TR status
        const trRef = doc(db, 'transport_requests', tr.id);
        await updateDoc(trRef, {
            finance_status: 'Approved',
            finance_approver: currentUser.full_name || currentUser.email || 'Finance User',
            finance_approver_user_id: currentUser.uid,
            finance_approver_name: currentUser.full_name || currentUser.email || 'Finance User',
            date_approved: new Date().toISOString().split('T')[0],
            approved_at: new Date().toISOString(),
            approved_by_name: currentUser.full_name || currentUser.email || 'Finance User',
            approved_by_uid: currentUser.uid
        });

        // Close modal only after successful approval
        window.closePRModal();

        showToast('✓ Transport Request approved successfully!', 'success');

    } catch (error) {
        console.error('Error approving TR:', error);
        showToast('Failed to approve TR. Please try again.', 'error');
        // Modal stays open on error so user can retry
    } finally {
        showLoading(false);
        currentPRForApproval = null;
    }
};

/**
 * Show approval modal with signature canvas
 * Opens after closing PR review modal for two-step approval flow
 */
function showApprovalModal(id, type) {
    currentApprovalTarget = { id, type };

    // Close the review modal first
    closePRModal();

    // Open approval modal
    document.getElementById('approvalModal').classList.add('active');

    // Initialize signature pad after DOM is ready
    requestAnimationFrame(() => {
        approvalSignaturePad = initializeApprovalSignaturePad();
    });
}

/**
 * Close approval modal and clean up signature pad
 */
function closeApprovalModal() {
    // Clean up signature pad
    if (approvalSignaturePad) {
        approvalSignaturePad.off();
        approvalSignaturePad = null;
    }

    document.getElementById('approvalModal')?.classList.remove('active');
    currentApprovalTarget = null;
}

/**
 * Confirm approval from the approval modal
 * Routes to appropriate approval function based on type
 */
async function confirmApproval() {
    if (!currentApprovalTarget) {
        showToast('No approval target set. Please try again.', 'error');
        return;
    }

    if (currentApprovalTarget.type === 'pr') {
        await approvePRWithSignature(currentApprovalTarget.id);
    }
}

/**
 * Close PR Modal
 */
function closePRModal() {
    // Clean up signature pad to prevent memory leaks
    if (approvalSignaturePad) {
        approvalSignaturePad.off(); // Remove event listeners
        approvalSignaturePad = null;
    }

    const modal = document.getElementById('prModal');
    modal?.classList.remove('active');
}

// ========================================
// REJECTION WORKFLOW
// ========================================

/**
 * Reject PR/TR
 */
function rejectPR(prId) {
    if (window.canEditTab?.('finance') === false) {
        showToast('You do not have permission to edit finance data', 'error');
        return;
    }

    // Store current PR for rejection
    if (!currentPRForRejection || currentPRForRejection.id !== prId) {
        showToast('Request reference lost. Please refresh and try again.', 'error');
        return;
    }

    // Close PR modal and open rejection modal
    window.closePRModal();
    document.getElementById('rejectionReason').value = '';
    document.getElementById('rejectionModal').classList.add('active');
};

/**
 * Close Rejection Modal
 */
function closeRejectionModal() {
    document.getElementById('rejectionModal').classList.remove('active');
}

/**
 * Submit Rejection
 */
async function submitRejection() {
    if (window.canEditTab?.('finance') === false) {
        showToast('You do not have permission to edit finance data', 'error');
        return;
    }

    const reason = document.getElementById('rejectionReason').value.trim();

    if (!reason) {
        showToast('Please provide a rejection reason', 'error');
        return;
    }

    const request = currentPRForRejection;
    if (!request) {
        showToast('Request reference lost. Please refresh and try again.', 'error');
        return;
    }

    window.closeRejectionModal();
    showLoading(true);

    try {
        const isTransport = request.isTransportRequest || request.tr_id;
        const currentUser = window.getCurrentUser();

        if (isTransport) {
            // Reject TR
            const trRef = doc(db, 'transport_requests', request.id);
            await updateDoc(trRef, {
                finance_status: 'Rejected',
                rejection_reason: reason,
                rejected_at: new Date().toISOString(),
                rejected_by: currentUser?.full_name || currentUser?.email || 'Finance User',
                rejected_by_user_id: currentUser?.uid,
                approved_by_name: currentUser?.full_name || currentUser?.email || 'Finance User',
                approved_by_uid: currentUser?.uid
            });

            showToast('Transport Request rejected', 'success');
        } else {
            // Reject PR
            const prRef = doc(db, 'prs', request.id);
            await updateDoc(prRef, {
                finance_status: 'Rejected',
                rejection_reason: reason,
                rejected_at: new Date().toISOString(),
                rejected_by: currentUser?.full_name || currentUser?.email || 'Finance User',
                rejected_by_user_id: currentUser?.uid,
                approved_by_name: currentUser?.full_name || currentUser?.email || 'Finance User',
                approved_by_uid: currentUser?.uid
            });

            // Update MRF
            const mrfsRef = collection(db, 'mrfs');
            const mrfQuery = query(mrfsRef, where('mrf_id', '==', request.mrf_id));
            const mrfSnapshot = await getDocs(mrfQuery);

            if (!mrfSnapshot.empty) {
                const mrfDoc = mrfSnapshot.docs[0];
                await updateDoc(doc(db, 'mrfs', mrfDoc.id), {
                    status: 'PR Rejected',
                    rejected_pr_id: request.pr_id,
                    pr_rejection_reason: reason,
                    rejection_reason: reason,
                    is_rejected: true,
                    rejected_by: currentUser?.full_name || currentUser?.email || 'Finance User',
                    rejected_by_user_id: currentUser?.uid,
                    updated_at: new Date().toISOString()
                });
            }

            showToast('Purchase Request rejected', 'success');
        }

    } catch (error) {
        console.error('Error rejecting request:', error);
        showToast('Failed to reject request', 'error');
    } finally {
        showLoading(false);
        currentPRForRejection = null;
    }
}

// ========================================
// PO MANAGEMENT
// ========================================

/**
 * Load POs with real-time listener
 */
async function loadPOs() {
    const posRef = collection(db, 'pos');

    const poListener = onSnapshot(posRef, (snapshot) => {
        poData = [];

        snapshot.forEach((docSnap) => {
            poData.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Sort using current user-selected sort state (default: date_issued desc)
        poData.sort((a, b) => {
            let aVal = a[poSortColumn];
            let bVal = b[poSortColumn];
            if (poSortColumn === 'date_issued') {
                aVal = aVal?.toDate ? aVal.toDate() : new Date(aVal || 0);
                bVal = bVal?.toDate ? bVal.toDate() : new Date(bVal || 0);
            }
            if (aVal == null) return poSortDirection === 'asc' ? 1 : -1;
            if (bVal == null) return poSortDirection === 'asc' ? -1 : 1;
            if (typeof aVal === 'string') {
                return poSortDirection === 'asc'
                    ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return poSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        });

        renderPOs();
        updateStats(); // Recalculate scoreboard when PO data changes
    });

    listeners.push(poListener);
}

/**
 * Build the proof indicator HTML span for a PO (3-state: filled URL / remarks-only / empty).
 * Extracted from inline renderPOs logic so card layout can reuse (Phase 73.1 / RESEARCH Pitfall 5).
 * @param {object} po - PO document with optional proof_url and proof_remarks
 * @returns {string} HTML string for the indicator span
 */
function buildProofIndicator(po) {
    const hasProof = !!po.proof_url;
    const hasRemarks = !!po.proof_remarks;
    if (hasProof) {
        return `<span class="proof-indicator proof-filled"
                title="Left-click to open proof &middot; Right-click to replace"
                onclick="window.open('${escapeHTML(po.proof_url)}', '_blank')"
                oncontextmenu="event.preventDefault(); window.financeShowProofModal('${po.id}', '${escapeHTML(po.proof_url)}', '${escapeHTML(po.proof_remarks || '')}')"
                onmouseenter="this.style.opacity='0.85'" onmouseleave="this.style.opacity='1'"
                ontouchstart="window._proofLongPress=setTimeout(()=>{event.preventDefault();window.financeShowProofModal('${po.id}','${escapeHTML(po.proof_url)}','${escapeHTML(po.proof_remarks || '')}')},600)"
                ontouchend="clearTimeout(window._proofLongPress)"
                style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#34a853;color:#fff;font-size:12px;cursor:pointer;user-select:none;">&#10003;</span>`;
    } else if (hasRemarks) {
        return `<span class="proof-indicator proof-remarks"
                title="Remarks only (no link) &middot; Click to view/edit"
                onclick="window.financeShowProofModal('${po.id}', '', '${escapeHTML(po.proof_remarks || '')}')"
                onmouseenter="this.style.opacity='0.85'" onmouseleave="this.style.opacity='1'"
                style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#f59e0b;color:#fff;font-size:14px;font-weight:700;cursor:pointer;user-select:none;">&ndash;</span>`;
    } else {
        return `<span class="proof-indicator proof-empty"
                title="Click to attach proof"
                onclick="window.financeShowProofModal('${po.id}', '', '')"
                onmouseenter="this.style.borderColor='#1a73e8';this.style.background='rgba(26,115,232,0.05)'"
                onmouseleave="this.style.borderColor='#bdc1c6';this.style.background='transparent'"
                style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;border:1.5px solid #bdc1c6;background:transparent;cursor:pointer;user-select:none;">&nbsp;</span>`;
    }
}

/**
 * Build a mobile card HTML string for a single PO (Phase 73.1).
 * Mirrors the table row columns from renderPOs().
 *
 * statusLabel and statusClass BOTH derive from the same fallback 'Pending Procurement'
 * so null-status POs never show text/class mismatch (REVIEWS Suggestion).
 */
function buildPOCard(po) {
    const proofIndicator = buildProofIndicator(po);
    const statusValue = po.procurement_status || 'Pending Procurement';
    const statusLabel = statusValue;
    const statusClass = getStatusClass(statusValue);
    return `
        <div class="fc-card">
            <div class="fc-card-header">
                <span class="fc-card-id">${escapeHTML(po.po_id || '')}</span>
                <span class="status-badge ${statusClass}">${escapeHTML(statusLabel)}</span>
            </div>
            <div class="fc-card-body">
                <div class="fc-card-row"><span class="fc-label">Proof</span><span class="fc-value">${proofIndicator}</span></div>
                <div class="fc-card-row"><span class="fc-label">Supplier</span><span class="fc-value">${escapeHTML(po.supplier_name || '')}</span></div>
                <div class="fc-card-row"><span class="fc-label">Project</span><span class="fc-value">${getDeptBadgeHTML(po)} ${escapeHTML(getMRFLabel(po))}</span></div>
                <div class="fc-card-row"><span class="fc-label">Amount</span><span class="fc-value fc-amount">&#8369;${formatCurrency(po.total_amount || 0)}</span></div>
                <div class="fc-card-row"><span class="fc-label">PR ID</span><span class="fc-value" style="font-size:0.8125rem;color:#64748b;">${escapeHTML(po.pr_id || '')}</span></div>
                <div class="fc-card-row"><span class="fc-label">Date Issued</span><span class="fc-value">${formatPODate(po)}</span></div>
            </div>
            <div class="fc-card-actions">
                <button class="btn btn-sm btn-secondary" onclick="promptPODocument('${po.id}')">View PO</button>
            </div>
        </div>`;
}

/**
 * Render POs list
 */
function renderPOs() {
    const container = document.getElementById('poList');

    const filteredPOs = activeDeptFilter
        ? poData.filter(po => (po.department || 'projects') === activeDeptFilter)
        : poData;

    if (filteredPOs.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #666;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📄</div>
                <h3>No Purchase Orders Yet</h3>
                <p>POs will appear here after approving Purchase Requests</p>
            </div>
        `;
        return;
    }

    // Show only recent 20 POs
    const recentPOs = filteredPOs.slice(0, 20);

    container.innerHTML = `
        <div class="table-scroll-container">
        <table>
            <thead>
                <tr>
                    <th onclick="window.sortPOs('po_id')" style="cursor: pointer; user-select: none;">
                        PO ID <span class="sort-indicator" data-col="po_id"></span>
                    </th>
                    <th style="text-align: center; width: 40px;">Proof</th>
                    <th onclick="window.sortPOs('pr_id')" style="cursor: pointer; user-select: none;">
                        PR ID <span class="sort-indicator" data-col="pr_id"></span>
                    </th>
                    <th onclick="window.sortPOs('supplier_name')" style="cursor: pointer; user-select: none;">
                        Supplier <span class="sort-indicator" data-col="supplier_name"></span>
                    </th>
                    <th onclick="window.sortPOs('project_name')" style="cursor: pointer; user-select: none;">
                        Project <span class="sort-indicator" data-col="project_name"></span>
                    </th>
                    <th onclick="window.sortPOs('total_amount')" style="cursor: pointer; user-select: none;">
                        Amount <span class="sort-indicator" data-col="total_amount"></span>
                    </th>
                    <th onclick="window.sortPOs('date_issued')" style="cursor: pointer; user-select: none;">
                        Date Issued <span class="sort-indicator" data-col="date_issued"></span>
                    </th>
                    <th onclick="window.sortPOs('procurement_status')" style="cursor: pointer; user-select: none;">
                        Status <span class="sort-indicator" data-col="procurement_status"></span>
                    </th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${recentPOs.map(po => {
                    const proofIndicator = buildProofIndicator(po);
                    return `
                    <tr>
                        <td><strong>${po.po_id}</strong></td>
                        <td style="text-align: center;">${proofIndicator}</td>
                        <td>${po.pr_id}</td>
                        <td>${escapeHTML(po.supplier_name)}</td>
                        <td><span style="display:inline-flex;align-items:center;gap:6px;">${getDeptBadgeHTML(po)} ${escapeHTML(getMRFLabel(po))}</span></td>
                        <td><strong>&#8369;${formatCurrency(po.total_amount || 0)}</strong></td>
                        <td>${formatPODate(po)}</td>
                        <td><span class="status-badge ${getStatusClass(po.procurement_status || 'Pending Procurement')}">${po.procurement_status || 'Pending'}</span></td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="promptPODocument('${po.id}')">View PO</button>
                        </td>
                    </tr>
                `;
                }).join('')}
            </tbody>
        </table>
        </div>
        <div class="fc-card-list">
            ${recentPOs.map(po => buildPOCard(po)).join('')}
        </div>
        ${filteredPOs.length > 20 ? `<p style="text-align: center; margin-top: 1rem; color: #666;">Showing 20 most recent POs</p>` : ''}
    `;

    // Update sort indicators for PO table
    container.querySelectorAll('.sort-indicator').forEach(indicator => {
        const col = indicator.dataset.col;
        if (col === poSortColumn) {
            indicator.textContent = poSortDirection === 'asc' ? ' \u2191' : ' \u2193';
            indicator.style.color = '#1a73e8';
        } else {
            indicator.textContent = ' \u21C5';
            indicator.style.color = '#94a3b8';
        }
    });
}

/**
 * Sort POs by column
 */
function sortPOs(column) {
    if (poSortColumn === column) {
        poSortDirection = poSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        poSortColumn = column;
        poSortDirection = 'asc';
    }
    // Sort poData - handle Firestore Timestamps for date_issued
    poData.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];
        if (column === 'date_issued') {
            aVal = aVal?.toDate ? aVal.toDate() : new Date(aVal || 0);
            bVal = bVal?.toDate ? bVal.toDate() : new Date(bVal || 0);
        }
        if (aVal == null) return poSortDirection === 'asc' ? 1 : -1;
        if (bVal == null) return poSortDirection === 'asc' ? -1 : 1;
        if (typeof aVal === 'string') {
            return poSortDirection === 'asc'
                ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return poSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    renderPOs();
}

/**
 * Refresh POs manually
 */
async function refreshPOs() {
    await loadPOs();
    showToast('PO list refreshed', 'success');
}

/**
 * Export the currently-visible (dept-filtered) POs as a CSV file.
 * Exports ALL poData rows (not just the 20 shown), after dept filter.
 */
function exportPOsCSV() {
    const filteredPOs = activeDeptFilter
        ? poData.filter(po => (po.department || 'projects') === activeDeptFilter)
        : poData;

    if (filteredPOs.length === 0) {
        showToast('No purchase orders to export', 'info');
        return;
    }

    const headers = ['PO ID', 'PR ID', 'Supplier', 'Project / Service', 'Amount (PHP)', 'Date Issued', 'Status'];
    const rows = filteredPOs.map(po => {
        return [
            po.po_id || '',
            po.pr_id || '',
            po.supplier_name || '',
            po.project_name || po.service_name || po.mrf_id || '',
            parseFloat(po.total_amount || 0).toFixed(2),
            formatPODate(po),
            po.procurement_status || 'Pending'
        ];
    });

    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(headers, rows, `purchase-orders-${date}.csv`);
}

