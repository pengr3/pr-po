/* ========================================
   PROCUREMENT VIEW - Complete Migration
   Manages MRFs, Suppliers, PO Tracking, and Historical Data
   Migrated from archive/index.html
   ======================================== */

import { db, collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, orderBy, limit, getAggregateFromServer, sum, count, serverTimestamp } from '../firebase.js';
import { formatCurrency, formatDate, formatTimestamp, showLoading, showToast, generateSequentialId, getStatusClass, downloadCSV, escapeHTML } from '../utils.js';
import { createStatusBadge, createModal, openModal, closeModal, createTimeline, getMRFLabel, getDeptBadgeHTML, skeletonTableRows } from '../components.js';
import { showProofModal, saveProofUrl } from '../proof-modal.js';

// ========================================
// GLOBAL STATE
// ========================================

let currentMRF = null;
let suppliersData = [];
let filteredSuppliersData = []; // filtered view for search; pagination operates on this
let projectsData = [];
let editingSupplier = null;
let suppliersCurrentPage = 1;
const suppliersItemsPerPage = 15;

let poData = [];
let poCurrentPage = 1;
const poItemsPerPage = 15;

let allPRPORecords = [];
let filteredPRPORecords = [];
let prpoCurrentPage = 1;
const prpoItemsPerPage = 10;

let cachedAllMRFs = [];   // Holds raw MRF snapshot for re-filtering on assignment change
let cachedServicesForNewMRF = [];   // Holds active services for the inline New MRF form dropdown
let cachedRejectedTRs = []; // TRs with finance_status='Rejected' belonging to an MRF

// Department filter state for PO Tracking table
let activePODeptFilter = ''; // '' = All, 'projects' = Projects only, 'services' = Services only

// Sort state for MRF Records table (Records tab)
let prpoSortColumn = 'date_needed';
let prpoSortDirection = 'desc';

// Firebase listeners for cleanup
let listeners = [];

// In-memory TTL cache timestamps (PERF-05)
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _projectsCachedAt = 0;
let _servicesCachedAt = 0;
let _suppliersCachedAt = 0;
let _prpoRecordsCachedAt = 0;
let _prpoSubDataCache = new Map(); // key: mrf.id, value: { prDataArray, poDataArray, totalCost, prCount, prApprovedCount, trCost, trFinanceStatus }

// Listener dedup guards — prevent duplicate onSnapshot registrations on tab switches
let _mrfListenerActive = false;
let _poTrackingListenerActive = false;
let _rfpListenerActive = false;

// RFP payment data
let rfpsData = [];        // all RFP documents from onSnapshot
let rfpsByPO = {};        // { po_id: [rfp, rfp, ...] } for O(1) lookup per PO row
let rfpsByTR = {};        // { tr_id: [rfp, rfp, ...] } for O(1) lookup per TR row

// ========================================
// TRANCHE BUILDER HELPERS
// ========================================

/**
 * Generate HTML for the tranche builder UI.
 * @param {Array} tranches - Array of { label, percentage } objects
 * @param {string} poId - Firestore document ID of the PO (used for element IDs)
 * @returns {string} HTML string
 */
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

/**
 * Read all tranche rows from the DOM for a given PO.
 * @param {string} poId
 * @returns {Array} Array of { label, percentage }
 */
function readTranchesFromDOM(poId) {
    const container = document.getElementById(`trancheBuilder_${poId}`);
    if (!container) return [{ label: 'Full Payment', percentage: 100 }];
    const rows = container.querySelectorAll('.tranche-row');
    return Array.from(rows).map(row => ({
        label: row.querySelector('.tranche-label')?.value?.trim() || '',
        percentage: parseFloat(row.querySelector('.tranche-pct')?.value) || 0
    }));
}

/**
 * Recalculate and display the running total for the tranche builder.
 * @param {string} poId
 */
function recalculateTranches(poId) {
    const tranches = readTranchesFromDOM(poId);
    const total = tranches.reduce((s, t) => s + t.percentage, 0);
    const totalEl = document.getElementById(`trancheTotalValue_${poId}`);
    const totalContainer = document.getElementById(`trancheTotal_${poId}`);
    if (totalEl) totalEl.textContent = total.toFixed(2).replace(/\.?0+$/, '');
    if (totalContainer) totalContainer.style.color = Math.abs(total - 100) < 0.01 ? '#059669' : '#ef4444';
}

/**
 * Add a new empty tranche row to the builder.
 * @param {string} poId
 */
function addTranche(poId) {
    const container = document.getElementById(`trancheBuilder_${poId}`);
    if (!container) return;
    const addBtn = container.querySelector('button.btn-outline');
    const row = document.createElement('div');
    row.className = 'tranche-row';
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;';
    row.innerHTML = `
        <input type="text" class="form-control tranche-label" placeholder="Label" value=""
               style="flex:0 0 65%;padding:0.5rem;border:1.5px solid #cbd5e1;border-radius:6px;font-size:0.875rem;"
               oninput="window.recalculateTranches('${poId}')">
        <input type="number" class="form-control tranche-pct" placeholder="%" value=""
               min="0" max="100" step="0.01"
               style="flex:0 0 25%;padding:0.5rem;border:1.5px solid #cbd5e1;border-radius:6px;font-size:0.875rem;"
               oninput="window.recalculateTranches('${poId}')">
        <button type="button" class="icon-btn" aria-label="Remove tranche"
                onclick="window.removeTranche(this, '${poId}')"
                style="flex:0 0 10%;padding:0.25rem 0.5rem;border:1.5px solid #cbd5e1;border-radius:6px;cursor:pointer;background:#fff;">&times;</button>
    `;
    container.insertBefore(row, addBtn);
    // Enable remove buttons now that there are multiple rows
    container.querySelectorAll('.tranche-row button').forEach(btn => btn.disabled = false);
    recalculateTranches(poId);
}

/**
 * Remove a tranche row from the builder.
 * @param {HTMLElement} button - The remove button that was clicked
 * @param {string} poId
 */
function removeTranche(button, poId) {
    const container = document.getElementById(`trancheBuilder_${poId}`);
    if (!container) return;
    const row = button.closest('.tranche-row');
    if (row) row.remove();
    // Disable remove button if only 1 row remains
    const remaining = container.querySelectorAll('.tranche-row');
    if (remaining.length === 1) {
        remaining[0].querySelector('button').disabled = true;
    }
    recalculateTranches(poId);
}

/**
 * Apply department filter to scoreboards and MRF Records table.
 * Called by the dept filter dropdown onchange handler.
 */
function applyPODeptFilter(value) {
    activePODeptFilter = value;
    renderPOTrackingTable(poData);
    filterPRPORecords();
}

function getPRPOSortIndicator(col) {
    if (col === prpoSortColumn) {
        return `<span style="color: #1a73e8;">${prpoSortDirection === 'asc' ? ' \u2191' : ' \u2193'}</span>`;
    }
    return `<span style="color: #94a3b8;"> \u21C5</span>`;
}

// Ordinal order for Procurement Status sorting — matches process flow dropdown order
const PROCUREMENT_STATUS_ORDER = {
    // Material PO statuses (process order)
    'Pending Procurement': 1,
    'Procuring': 2,
    'Procured': 3,
    'Delivered': 4,
    // SUBCON PO statuses (process order)
    'Pending': 1,
    'Processing': 2,
    'Processed': 3
};

// ========================================
// RFP (REQUEST FOR PAYMENT) HELPERS — Phase 65
// ========================================

/**
 * Generate a PO-scoped RFP ID: RFP-{PO-ID}-{n} (sequence per PO)
 * @param {string} poId - e.g. "PO-2026-001"
 * @returns {Promise<string>} e.g. "RFP-PO-2026-001-1"
 */
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

/**
 * Generate a TR-scoped RFP ID: RFP-{TR-ID}-{n} (sequence per TR)
 * @param {string} trId - e.g. "TR-2026-001"
 * @returns {Promise<string>} e.g. "RFP-TR-2026-001-1"
 */
async function generateTRRFPId(trId) {
    const rfpsSnap = await getDocs(
        query(collection(db, 'rfps'), where('tr_id', '==', trId))
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
    return `RFP-${trId}-${maxNum + 1}`;
}

/**
 * Derive human-readable RFP payment status from payment_records array.
 * @param {Object} rfp - RFP document
 * @returns {string} 'Pending' | 'Partially Paid' | 'Fully Paid' | 'Overdue'
 */
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

/**
 * Compute fill data for a PO ID cell based on RFP payment status.
 * @param {string} poId - PO ID string (e.g. "PO-2026-001"), NOT the Firestore doc ID
 * @returns {{ pct: number, color: string, opacity: number, tooltip: string }}
 */
function getPOPaymentFill(poId) {
    // Exclude Delivery Fee RFPs — they are tracked separately via the dot indicator
    const rfps = (rfpsByPO[poId] || []).filter(r => r.tranche_label !== 'Delivery Fee');
    if (rfps.length === 0) {
        return { pct: 0, color: '#f8d7da', opacity: 0.7, tooltip: 'No payment requests submitted' };
    }
    // Find PO to get total_amount
    const po = poData.find(p => p.po_id === poId);
    const poTotal = po ? parseFloat(po.total_amount) || 0 : 0;
    let totalPaidAllRFPs = 0;
    let allFullyPaid = true;
    let totalRequested = 0;
    for (const rfp of rfps) {
        const paid = (rfp.payment_records || [])
            .filter(r => r.status !== 'voided')
            .reduce((s, r) => s + (r.amount || 0), 0);
        totalPaidAllRFPs += paid;
        totalRequested += (rfp.amount_requested || 0);
        if (paid < rfp.amount_requested) allFullyPaid = false;
    }
    if (allFullyPaid && rfps.length > 0) {
        return { pct: 100, color: '#d4edda', opacity: 0.7, tooltip: `Fully paid: ${formatCurrency(totalPaidAllRFPs)}` };
    }
    const percentPaid = poTotal > 0 ? Math.min(100, Math.round((totalPaidAllRFPs / poTotal) * 100)) : 0;
    const balance = poTotal - totalPaidAllRFPs;
    return {
        pct: percentPaid,
        color: '#fff3cd',
        opacity: 0.7,
        tooltip: `Paid: ${formatCurrency(totalPaidAllRFPs)} | Balance: ${formatCurrency(balance)} | ${percentPaid}% complete`
    };
}

/**
 * Compute fill data for a TR badge based on RFP payment status.
 * @param {string} trId - TR ID string (e.g. "TR-2026-001")
 * @param {number} trTotalAmount - Total amount from the TR document
 * @returns {{ pct: number, color: string, opacity: number, tooltip: string }}
 */
function getTRPaymentFill(trId, trTotalAmount) {
    const rfps = rfpsByTR[trId] || [];
    if (rfps.length === 0) {
        return { pct: 0, color: '#f8d7da', opacity: 0.7, tooltip: 'No payment requests submitted' };
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
        return { pct: 100, color: '#d4edda', opacity: 0.7, tooltip: `Fully paid: ${formatCurrency(totalPaidAllRFPs)}` };
    }
    const trTotal = parseFloat(trTotalAmount) || 0;
    const percentPaid = trTotal > 0 ? Math.min(100, Math.round((totalPaidAllRFPs / trTotal) * 100)) : 0;
    const balance = trTotal - totalPaidAllRFPs;
    return {
        pct: percentPaid,
        color: '#fff3cd',
        opacity: 0.7,
        tooltip: `Paid: ${formatCurrency(totalPaidAllRFPs)} | Balance: ${formatCurrency(balance)} | ${percentPaid}% complete`
    };
}

/**
 * Check if an RFP can be cancelled (zero non-voided payments recorded).
 * @param {Object} rfp - RFP document from rfpsData
 * @returns {boolean}
 */
function isRFPCancellable(rfp) {
    const totalPaid = (rfp.payment_records || [])
        .filter(r => r.status !== 'voided')
        .reduce((sum, r) => sum + (r.amount || 0), 0);
    return totalPaid === 0;
}

/**
 * Pre-fill the RFP modal form fields with data from a cancelled RFP.
 * Must be called AFTER the modal HTML is inserted into the DOM.
 * @param {Object} savedData - Captured fields from the cancelled RFP document
 */
function prefillRFPForm(savedData) {
    // Invoice number
    const invoiceEl = document.getElementById('rfpInvoiceNumber');
    if (invoiceEl && savedData.invoice_number) invoiceEl.value = savedData.invoice_number;

    // Due date
    const dueDateEl = document.getElementById('rfpDueDate');
    if (dueDateEl && savedData.due_date) dueDateEl.value = savedData.due_date;

    // Payment mode
    const modeEl = document.getElementById('rfpPaymentMode');
    if (modeEl && savedData.mode_of_payment) {
        const standardModes = ['Bank Transfer', 'Check', 'Cash', 'Other'];
        if (standardModes.includes(savedData.mode_of_payment)) {
            modeEl.value = savedData.mode_of_payment;
        } else {
            // Non-standard mode: user originally selected "Other" and typed a custom value
            modeEl.value = 'Other';
        }
        // Trigger the bank fields toggle so the correct sections show
        toggleRFPBankFields();
    }

    // Bank fields (only relevant when mode is Bank Transfer)
    if (savedData.mode_of_payment === 'Bank Transfer') {
        const bankNameEl = document.getElementById('rfpBankName');
        if (bankNameEl && savedData.bank_name) bankNameEl.value = savedData.bank_name;

        const bankAccNameEl = document.getElementById('rfpBankAccountName');
        if (bankAccNameEl && savedData.bank_account_name) bankAccNameEl.value = savedData.bank_account_name;

        const bankDetailsEl = document.getElementById('rfpBankDetails');
        if (bankDetailsEl && savedData.bank_details) bankDetailsEl.value = savedData.bank_details;

        // Alt bank fields - if any alt bank data exists, show the alt bank section
        if (savedData.alt_bank_name || savedData.alt_bank_account_name || savedData.alt_bank_details) {
            showAltBank(); // shows alt section and hides the "Add" button
            const altBankNameEl = document.getElementById('rfpAltBankName');
            if (altBankNameEl && savedData.alt_bank_name) altBankNameEl.value = savedData.alt_bank_name;

            const altBankAccNameEl = document.getElementById('rfpAltBankAccountName');
            if (altBankAccNameEl && savedData.alt_bank_account_name) altBankAccNameEl.value = savedData.alt_bank_account_name;

            const altBankDetailsEl = document.getElementById('rfpAltBankDetails');
            if (altBankDetailsEl && savedData.alt_bank_details) altBankDetailsEl.value = savedData.alt_bank_details;
        }
    }

    // Other payment mode text
    const standardModes = ['Bank Transfer', 'Check', 'Cash', 'Other'];
    if (savedData.mode_of_payment && !standardModes.includes(savedData.mode_of_payment)) {
        const otherEl = document.getElementById('rfpPaymentModeOther');
        if (otherEl) otherEl.value = savedData.mode_of_payment;
    }

    // Tranche selection (PO RFPs only, not TR/Delivery Fee)
    if (savedData.tranche_index != null) {
        const trancheSelect = document.getElementById('rfpTrancheSelect');
        if (trancheSelect) {
            // The cancelled RFP's tranche is now available again (document was deleted),
            // so the option should no longer be disabled. Set it as selected.
            const option = trancheSelect.querySelector(`option[value="${savedData.tranche_index}"]`);
            if (option && !option.disabled) {
                trancheSelect.value = savedData.tranche_index;
                // Trigger amount update for this tranche
                if (window.updateRFPAmount && savedData.po_doc_id) {
                    window.updateRFPAmount(savedData.po_doc_id);
                }
            }
        }
    }
}

/**
 * Cancel (delete) an RFP document with zero payments, then re-open the
 * RFP filing form pre-filled with the cancelled RFP's details for easy re-filing.
 * @param {string} rfpDocId - Firestore document ID of the RFP
 */
async function cancelRFPDocument(rfpDocId) {
    document.getElementById('rfpContextMenu')?.remove();
    const rfp = rfpsData.find(r => r.id === rfpDocId);
    if (!rfp) { showToast('RFP not found', 'error'); return; }
    if (!isRFPCancellable(rfp)) {
        showToast('Cannot cancel — payment has been recorded on this RFP', 'error');
        return;
    }
    if (!confirm(`Cancel ${rfp.rfp_id}?\n\nThis will delete the RFP and re-open the form with its details pre-filled so you can re-file.`)) return;

    // Capture the RFP's data BEFORE deleting so we can pre-fill the re-opened form
    const savedData = {
        invoice_number: rfp.invoice_number || '',
        due_date: rfp.due_date || '',
        mode_of_payment: rfp.mode_of_payment || '',
        bank_name: rfp.bank_name || '',
        bank_account_name: rfp.bank_account_name || '',
        bank_details: rfp.bank_details || '',
        alt_bank_name: rfp.alt_bank_name || '',
        alt_bank_account_name: rfp.alt_bank_account_name || '',
        alt_bank_details: rfp.alt_bank_details || '',
        tranche_index: rfp.tranche_index,
        tranche_label: rfp.tranche_label || '',
        po_doc_id: rfp.po_doc_id || '',
        tr_doc_id: rfp.tr_doc_id || '',
        po_id: rfp.po_id || '',
        tr_id: rfp.tr_id || ''
    };

    try {
        await deleteDoc(doc(db, 'rfps', rfpDocId));
        showToast(`${rfp.rfp_id} cancelled — re-filing form opened`, 'success');

        // Determine which modal to re-open based on the RFP type, then pre-fill
        if (savedData.tr_id && savedData.tr_doc_id) {
            // TR RFP — re-open TR RFP modal
            await openTRRFPModal(savedData.tr_doc_id);
            prefillRFPForm(savedData);
        } else if (savedData.tranche_label === 'Delivery Fee' && savedData.po_doc_id) {
            // Delivery Fee RFP — re-open Delivery Fee RFP modal
            await openDeliveryFeeRFPModal(savedData.po_doc_id);
            prefillRFPForm(savedData);
        } else if (savedData.po_doc_id) {
            // Regular PO tranche RFP — re-open standard RFP modal
            await openRFPModal(savedData.po_doc_id);
            prefillRFPForm(savedData);
        }
    } catch (err) {
        console.error('[Procurement] RFP cancel error:', err);
        showToast('Failed to cancel RFP. Check permissions.', 'error');
    }
}

/**
 * Show right-click context menu on PO ID cell with "Request Payment" option.
 * @param {MouseEvent} event
 * @param {string} poDocId - Firestore document ID of the PO
 */
function showRFPContextMenu(event, poDocId) {
    // Remove any existing context menu
    const existing = document.getElementById('rfpContextMenu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'rfpContextMenu';
    menu.style.cssText = `position:fixed;left:${event.clientX}px;top:${event.clientY}px;background:white;border:1px solid #e5e7eb;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:4px 0;z-index:10000;min-width:180px;`;
    const po = poData.find(p => p.id === poDocId);
    const hasDeliveryFee = po && parseFloat(po.delivery_fee) > 0;
    const deliveryFeeRFPExists = hasDeliveryFee && (rfpsByPO[po.po_id] || []).some(r => r.tranche_label === 'Delivery Fee');
    const existingRFPs = rfpsByPO[po?.po_id] || [];
    const cancellableRFPs = existingRFPs.filter(r => isRFPCancellable(r));

    menu.innerHTML = `
        <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#1e293b;"
             onmouseenter="this.style.background='#eff6ff'"
             onmouseleave="this.style.background='transparent'"
             onclick="window.openRFPModal('${poDocId}')">
            Request Payment
        </div>
        ${hasDeliveryFee ? `
        <div style="padding:8px 16px;cursor:${deliveryFeeRFPExists ? 'not-allowed' : 'pointer'};font-size:0.875rem;color:${deliveryFeeRFPExists ? '#9ca3af' : '#1e293b'};${deliveryFeeRFPExists ? 'opacity:0.6;' : ''}"
             ${deliveryFeeRFPExists ? '' : `onmouseenter="this.style.background='#eff6ff'" onmouseleave="this.style.background='transparent'"`}
             onclick="${deliveryFeeRFPExists ? '' : `window.openDeliveryFeeRFPModal('${poDocId}')`}">
            Request Delivery Fee Payment${deliveryFeeRFPExists ? ' <span style="font-size:0.75rem;color:#9ca3af;">(RFP exists)</span>' : ''}
        </div>` : ''}
        ${cancellableRFPs.length > 0 ? `
            <div style="border-top:1px solid #f1f5f9;margin:4px 0;"></div>
            ${cancellableRFPs.map(rfp => `
                <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#ef4444;"
                     onmouseenter="this.style.background='#fef2f2'"
                     onmouseleave="this.style.background='transparent'"
                     onclick="window.cancelRFPDocument('${rfp.id}')">
                    Cancel ${escapeHTML(rfp.rfp_id)}${rfp.tranche_label ? ` <span style="font-size:0.75rem;color:#b91c1c;">(${escapeHTML(rfp.tranche_label)})</span>` : ''}
                </div>`).join('')}` : ''}
    `;
    document.body.appendChild(menu);
    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', function handler() {
            menu.remove();
            document.removeEventListener('click', handler);
        }, { once: true });
    }, 10);
}

/**
 * Show right-click context menu on TR badge with "Request Payment (TR)" option.
 * @param {MouseEvent} event
 * @param {string} trDocId - Firestore document ID of the TR
 */
function showTRRFPContextMenu(event, trDocId) {
    const existing = document.getElementById('rfpContextMenu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'rfpContextMenu';
    menu.style.cssText = `position:fixed;left:${event.clientX}px;top:${event.clientY}px;background:white;border:1px solid #e5e7eb;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:4px 0;z-index:10000;min-width:180px;`;
    const tr = poData.flatMap(p => p.transportRequests || []).find(t => t.docId === trDocId) || {};
    const existingTRRFPs = rfpsByTR[tr?.tr_id] || [];
    const cancellableTRRFP = existingTRRFPs.find(r => isRFPCancellable(r));
    menu.innerHTML = `
        <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#1e293b;"
             onmouseenter="this.style.background='#eff6ff'"
             onmouseleave="this.style.background='transparent'"
             onclick="window.openTRRFPModal('${trDocId}')">
            Request Payment
        </div>
        ${cancellableTRRFP ? `
            <div style="border-top:1px solid #f1f5f9;margin:4px 0;"></div>
            <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#ef4444;"
                 onmouseenter="this.style.background='#fef2f2'"
                 onmouseleave="this.style.background='transparent'"
                 onclick="window.cancelRFPDocument('${cancellableTRRFP.id}')">
                Cancel ${escapeHTML(cancellableTRRFP.rfp_id)}
            </div>` : ''}
    `;
    document.body.appendChild(menu);

    const closeMenu = (e) => {
        if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeMenu); }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

/**
 * Show right-click context menu on MRF ID cell with "Cancel PRs" option.
 * @param {MouseEvent} event
 * @param {string} mrfDocId - Firestore document ID of the MRF
 * @param {string} mrfStatus - Current MRF status
 */
function showMRFContextMenu(event, mrfDocId, mrfStatus) {
    document.getElementById('mrfContextMenu')?.remove();

    const menu = document.createElement('div');
    menu.id = 'mrfContextMenu';
    menu.style.cssText = `position:fixed;left:${event.clientX}px;top:${event.clientY}px;background:white;border:1px solid #e5e7eb;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:4px 0;z-index:10000;min-width:200px;`;

    const cancellableStatuses = ['PR Generated', 'PR Submitted', 'Finance Approved', 'PO Issued'];
    if (cancellableStatuses.includes(mrfStatus)) {
        menu.innerHTML = `
            <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#ef4444;"
                 onmouseenter="this.style.background='#fef2f2'"
                 onmouseleave="this.style.background='transparent'"
                 onclick="window.cancelMRFPRs('${mrfDocId}')">
                Cancel MRF
            </div>
        `;
    } else {
        menu.innerHTML = `
            <div style="padding:8px 16px;font-size:0.875rem;color:#9ca3af;cursor:default;">
                No actions available
            </div>
        `;
    }

    document.body.appendChild(menu);
    setTimeout(() => {
        document.addEventListener('click', function handler() {
            menu.remove();
            document.removeEventListener('click', handler);
        }, { once: true });
    }, 10);
}

/**
 * Cancel all PRs for an MRF and restore MRF to In Progress status.
 * Handles three paths: simple cancel, force-recall (POs at Pending), and block (POs in progress).
 * @param {string} mrfDocId - Firestore document ID of the MRF
 */
async function cancelMRFPRs(mrfDocId) {
    document.getElementById('mrfContextMenu')?.remove();

    const mrf = allPRPORecords.find(m => m.id === mrfDocId);
    if (!mrf) { showToast('MRF not found', 'error'); return; }

    // Fetch linked PRs
    const prSnap = await getDocs(query(collection(db, 'prs'), where('mrf_id', '==', mrf.mrf_id)));
    const prs = [];
    prSnap.forEach(d => prs.push({ id: d.id, ...d.data() }));

    // Fetch linked TRs
    const trSnap = await getDocs(query(collection(db, 'transport_requests'), where('mrf_id', '==', mrf.mrf_id)));
    const trs = [];
    trSnap.forEach(d => trs.push({ id: d.id, ...d.data() }));

    if (prs.length === 0 && trs.length === 0) {
        showToast('No PRs or TRs found for this MRF', 'error');
        return;
    }

    // Fetch linked POs
    const poSnap = await getDocs(query(collection(db, 'pos'), where('mrf_id', '==', mrf.mrf_id)));
    const pos = [];
    poSnap.forEach(d => pos.push({ id: d.id, ...d.data() }));

    // BLOCK CHECK: POs already in procurement progress
    const blockedStatuses = ['Procuring', 'Procured', 'Delivered', 'Processing', 'Processed'];
    if (pos.some(po => blockedStatuses.includes(po.procurement_status))) {
        showToast('Cannot cancel — PO(s) already in procurement progress. Contact admin.', 'error');
        return;
    }

    // BLOCK CHECK: Any RFP linked to a PO or TR has been (at least partially) paid
    // Payment status is computed from payment_records — never stored directly on the rfp document.
    // We mirror the same arithmetic used by deriveRFPStatus.
    const rfpHasPaidAmount = (rfp) => {
        const totalPaid = (rfp.payment_records || [])
            .filter(r => r.status !== 'voided')
            .reduce((sum, r) => sum + (r.amount || 0), 0);
        return totalPaid > 0;
    };

    // Check PO-linked RFPs
    for (const po of pos) {
        if (!po.po_id) continue;
        const poRfpSnap = await getDocs(query(collection(db, 'rfps'), where('po_id', '==', po.po_id)));
        for (const rfpDoc of poRfpSnap.docs) {
            if (rfpHasPaidAmount(rfpDoc.data())) {
                showToast(`Cannot cancel — ${po.po_id} has recorded payment(s). Contact admin.`, 'error');
                return;
            }
        }
    }

    // Check TR-linked RFPs
    for (const tr of trs) {
        if (!tr.tr_id) continue;
        const trRfpSnap = await getDocs(query(collection(db, 'rfps'), where('tr_id', '==', tr.tr_id)));
        for (const rfpDoc of trRfpSnap.docs) {
            if (rfpHasPaidAmount(rfpDoc.data())) {
                showToast(`Cannot cancel — ${tr.tr_id} has recorded payment(s). Contact admin.`, 'error');
                return;
            }
        }
    }

    // Build summary for confirm dialog
    const parts = [];
    if (prs.length > 0) parts.push(`${prs.length} PR(s)`);
    if (trs.length > 0) parts.push(`${trs.length} TR(s)`);
    const docSummary = parts.join(' and ');

    // FORCE-RECALL: POs at Pending Procurement
    const pendingPOs = pos.filter(po => po.procurement_status === 'Pending Procurement' || po.procurement_status === 'Pending');
    if (pendingPOs.length > 0) {
        const confirmed = confirm(
            `${pos.length} PO(s) have been issued (Pending Procurement). Cancelling will:\n\n` +
            `- Set ${pos.length} PO(s) to Cancelled status\n` +
            `- Delete ${docSummary}\n` +
            `- Restore MRF to In Progress\n\n` +
            `Continue?`
        );
        if (!confirmed) return;

        // Cancel POs and delete linked RFPs
        for (const po of pendingPOs) {
            await updateDoc(doc(db, 'pos', po.id), {
                procurement_status: 'Cancelled',
                cancelled_at: new Date().toISOString(),
                cancelled_reason: 'PR cancellation — MRF recalled for revision'
            });
            const rfpSnap = await getDocs(query(collection(db, 'rfps'), where('po_id', '==', po.po_id)));
            rfpSnap.forEach(async (rfpDoc) => {
                await deleteDoc(doc(db, 'rfps', rfpDoc.id));
            });
        }
    } else {
        // SIMPLE CANCEL: No POs or only cancelled POs
        const confirmed = confirm(
            `Cancel ${docSummary} for ${mrf.mrf_id}?\n\nThis will delete all linked PRs/TRs and restore the MRF to In Progress for revision.`
        );
        if (!confirmed) return;
    }

    // Delete all PRs
    for (const pr of prs) {
        await deleteDoc(doc(db, 'prs', pr.id));
    }

    // Delete all TRs
    for (const tr of trs) {
        await deleteDoc(doc(db, 'transport_requests', tr.id));
    }

    // Restore MRF to In Progress — clear pr_ids and tr_id
    await updateDoc(doc(db, 'mrfs', mrfDocId), {
        status: 'In Progress',
        pr_ids: [],
        tr_id: null,
        updated_at: new Date().toISOString()
    });

    // Invalidate cache and update local state
    _prpoSubDataCache.delete(mrfDocId);
    const localMrf = allPRPORecords.find(m => m.id === mrfDocId);
    if (localMrf) {
        localMrf.status = 'In Progress';
        localMrf.pr_ids = [];
        localMrf.tr_id = null;
    }

    filterPRPORecords();
    showToast(`${docSummary} cancelled. MRF restored to In Progress.`, 'success');
}

/**
 * Open RFP creation modal pre-filled with PO data.
 * @param {string} poDocId - Firestore document ID of the PO
 */
async function openRFPModal(poDocId) {
    // Close context menu if still open
    const ctx = document.getElementById('rfpContextMenu');
    if (ctx) ctx.remove();

    const po = poData.find(p => p.id === poDocId);
    if (!po) { showToast('PO not found', 'error'); return; }

    const tranches = Array.isArray(po.tranches) && po.tranches.length > 0
        ? po.tranches
        : [{ label: po.payment_terms || 'Full Payment', percentage: 100 }];

    const poTotal = parseFloat(po.total_amount) || 0;

    // Check which tranches already have RFPs
    // Use tranche_index (position-based) for deduplication so two tranches with identical
    // labels are treated independently. Fall back to label-based matching for legacy RFPs
    // that pre-date tranche_index being stored.
    const existingRFPs = rfpsByPO[po.po_id] || [];
    const usedTrancheIndices = new Set(
        existingRFPs
            .filter(r => r.tranche_index != null)
            .map(r => r.tranche_index)
    );
    // Legacy fallback: for RFPs without tranche_index, find the first tranche whose label
    // matches and mark that index used (best-effort — avoids double-filing on old data).
    existingRFPs
        .filter(r => r.tranche_index == null && r.tranche_label !== 'Delivery Fee')
        .forEach(r => {
            const matchIdx = tranches.findIndex((t, i) => t.label === r.tranche_label && !usedTrancheIndices.has(i));
            if (matchIdx >= 0) usedTrancheIndices.add(matchIdx);
        });

    const trancheOptions = tranches.map((t, i) => {
        const used = usedTrancheIndices.has(i);
        return `<option value="${i}" ${used ? 'disabled' : ''} ${i === 0 && !used ? 'selected' : ''}>${escapeHTML(t.label)} (${t.percentage}%)${used ? ' \u2014 RFP exists' : ''}</option>`;
    }).join('');

    const firstAvailable = tranches.findIndex((t, i) => !usedTrancheIndices.has(i));
    const defaultAmount = firstAvailable >= 0 ? (tranches[firstAvailable].percentage / 100 * poTotal) : 0;

    const deptLabel = po.service_code
        ? `Service: ${escapeHTML(po.service_code)}`
        : `Project: ${escapeHTML(po.project_code || '')}`;

    const modalHtml = `
    <div id="rfpModal" class="modal" style="display:flex;">
        <div class="modal-content" style="max-width:520px;margin:auto;">
            <div class="modal-header">
                <h2 style="font-size:1.125rem;font-weight:600;">Create Request for Payment</h2>
                <button class="modal-close" onclick="document.getElementById('rfpModal').remove()">&times;</button>
            </div>
            <div class="modal-body" style="padding:1.5rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
                    <div>
                        <div class="modal-detail-label" style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Supplier</div>
                        <div style="font-weight:600;color:#1e293b;">${escapeHTML(po.supplier_name)}</div>
                    </div>
                    <div>
                        <div class="modal-detail-label" style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">PO Reference</div>
                        <div style="font-weight:600;color:#1e293b;">${escapeHTML(po.po_id)}</div>
                    </div>
                    <div style="grid-column:span 2;">
                        <div class="modal-detail-label" style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Department</div>
                        <div style="font-weight:600;color:#1e293b;">${deptLabel}</div>
                    </div>
                </div>
                ${firstAvailable < 0 ? '<div style="margin-bottom:1rem;padding:8px 12px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;border-radius:6px;font-size:0.875rem;">RFPs have already been submitted for all tranches on this PO. You cannot create another one.</div>' : ''}
                <div style="display:flex;flex-direction:column;gap:1rem;">
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Tranche</label>
                        <select id="rfpTrancheSelect" class="form-control" onchange="window.updateRFPAmount('${poDocId}')" style="width:100%;">
                            ${trancheOptions}
                        </select>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Amount Requested</label>
                        <input type="text" id="rfpAmount" class="form-control" value="${formatCurrency(defaultAmount)}" readonly
                               style="width:100%;background:#f1f5f9;cursor:not-allowed;">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Proof <span style="color:#ea4335;">*</span></label>
                        <input type="text" id="rfpInvoiceNumber" class="form-control" placeholder="Paste URL or enter proof details" style="width:100%;" required>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Due Date <span style="color:#ea4335;">*</span></label>
                        <input type="date" id="rfpDueDate" class="form-control" style="width:100%;" required>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Mode of Payment <span style="color:#ea4335;">*</span></label>
                        <select id="rfpPaymentMode" class="form-control" style="width:100%;" onchange="window.toggleRFPBankFields()" required>
                            <option value="">Select payment mode...</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Check">Check</option>
                            <option value="Cash">Cash</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div id="rfpBankFields" style="display:none;flex-direction:column;gap:1rem;">
                        <div>
                            <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Bank <span style="color:#ea4335;">*</span></label>
                            <input type="text" id="rfpBankName" class="form-control" placeholder="e.g. BDO, BPI, Metrobank" style="width:100%;">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Account Name <span style="color:#ea4335;">*</span></label>
                            <input type="text" id="rfpBankAccountName" class="form-control" placeholder="Account holder name" style="width:100%;">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Account Number <span style="color:#ea4335;">*</span></label>
                            <input type="text" id="rfpBankDetails" class="form-control" placeholder="Account number" style="width:100%;">
                        </div>
                        <div id="altBankSection" style="display:none;border-top:1px dashed #cbd5e1;padding-top:0.75rem;margin-top:0.25rem;">
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
                                <span style="font-weight:600;color:#475569;font-size:0.8125rem;">Alternative Bank Account</span>
                                <button type="button" class="btn btn-outline" onclick="window.removeAltBank()" style="font-size:0.75rem;padding:2px 8px;color:#ef4444;border-color:#ef4444;">Remove</button>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:0.75rem;">
                                <div>
                                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Bank</label>
                                    <input type="text" id="rfpAltBankName" class="form-control" placeholder="e.g. BDO, BPI, Metrobank" style="width:100%;">
                                </div>
                                <div>
                                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Account Name</label>
                                    <input type="text" id="rfpAltBankAccountName" class="form-control" placeholder="Account holder name" style="width:100%;">
                                </div>
                                <div>
                                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Account Number</label>
                                    <input type="text" id="rfpAltBankDetails" class="form-control" placeholder="Account number" style="width:100%;">
                                </div>
                            </div>
                        </div>
                        <button type="button" id="addAltBankBtn" class="btn btn-outline" onclick="window.showAltBank()" style="width:100%;font-size:0.8125rem;padding:6px 12px;margin-top:0.25rem;color:#059669;border-color:#059669;">
                            + Add Alternative Bank Account
                        </button>
                    </div>
                    <div id="rfpOtherModeWrapper" style="display:none;">
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Specify Payment Mode <span style="color:#ea4335;">*</span></label>
                        <input type="text" id="rfpPaymentModeOther" class="form-control" placeholder="Enter payment mode" style="width:100%;">
                    </div>
                </div>
                <div id="rfpErrorAlert" style="display:none;margin-top:1rem;padding:8px 12px;background:#fef2f2;color:#991b1b;border-radius:6px;font-size:0.875rem;"></div>
            </div>
            <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:1rem 1.5rem;border-top:1px solid #e5e7eb;">
                <button class="btn btn-outline" onclick="document.getElementById('rfpModal').remove()">Discard RFP</button>
                <button class="btn btn-primary" onclick="window.submitRFP('${poDocId}')" ${firstAvailable < 0 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>Submit RFP</button>
            </div>
        </div>
    </div>`;

    // Remove any existing modal first
    const existingModal = document.getElementById('rfpModal');
    if (existingModal) existingModal.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Set the tranche select to the first available
    if (firstAvailable >= 0) {
        document.getElementById('rfpTrancheSelect').value = firstAvailable;
    }
}

/**
 * Open simplified Delivery Fee RFP creation modal pre-filled with PO delivery fee data.
 * @param {string} poDocId - Firestore document ID of the PO
 */
async function openDeliveryFeeRFPModal(poDocId) {
    const ctx = document.getElementById('rfpContextMenu');
    if (ctx) ctx.remove();

    const po = poData.find(p => p.id === poDocId);
    if (!po) { showToast('PO not found', 'error'); return; }

    const deliveryFee = parseFloat(po.delivery_fee) || 0;
    if (deliveryFee <= 0) { showToast('No delivery fee on this PO', 'error'); return; }

    // Double-check dedup
    const existingRFPs = rfpsByPO[po.po_id] || [];
    if (existingRFPs.some(r => r.tranche_label === 'Delivery Fee')) {
        showToast('A Delivery Fee RFP already exists for this PO', 'error');
        return;
    }

    const deptLabel = po.service_code
        ? `Service: ${escapeHTML(po.service_code)}`
        : `Project: ${escapeHTML(po.project_code || '')}`;

    const modalHtml = `
    <div id="rfpModal" class="modal" style="display:flex;">
        <div class="modal-content" style="max-width:520px;margin:auto;">
            <div class="modal-header">
                <h2 style="font-size:1.125rem;font-weight:600;">Create Request for Payment (Delivery Fee)</h2>
                <button class="modal-close" onclick="document.getElementById('rfpModal').remove()">&times;</button>
            </div>
            <div class="modal-body" style="padding:1.5rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
                    <div>
                        <div class="modal-detail-label" style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Supplier</div>
                        <div style="font-weight:600;color:#1e293b;">${escapeHTML(po.supplier_name)}</div>
                    </div>
                    <div>
                        <div class="modal-detail-label" style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">PO Reference</div>
                        <div style="font-weight:600;color:#1e293b;">${escapeHTML(po.po_id)}</div>
                    </div>
                    <div style="grid-column:span 2;">
                        <div class="modal-detail-label" style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Department</div>
                        <div style="font-weight:600;color:#1e293b;">${deptLabel}</div>
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:1rem;">
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Amount Requested (Delivery Fee)</label>
                        <input type="text" id="rfpAmount" class="form-control" value="${formatCurrency(deliveryFee)}" readonly
                               style="width:100%;background:#f1f5f9;cursor:not-allowed;">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Proof <span style="color:#ea4335;">*</span></label>
                        <input type="text" id="rfpInvoiceNumber" class="form-control" placeholder="Paste URL or enter proof details" style="width:100%;" required>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Due Date <span style="color:#ea4335;">*</span></label>
                        <input type="date" id="rfpDueDate" class="form-control" style="width:100%;" required>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Mode of Payment <span style="color:#ea4335;">*</span></label>
                        <select id="rfpPaymentMode" class="form-control" style="width:100%;" onchange="window.toggleRFPBankFields()" required>
                            <option value="">Select payment mode...</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Check">Check</option>
                            <option value="Cash">Cash</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div id="rfpBankFields" style="display:none;flex-direction:column;gap:1rem;">
                        <div>
                            <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Bank <span style="color:#ea4335;">*</span></label>
                            <input type="text" id="rfpBankName" class="form-control" placeholder="e.g. BDO, BPI, Metrobank" style="width:100%;">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Account Name <span style="color:#ea4335;">*</span></label>
                            <input type="text" id="rfpBankAccountName" class="form-control" placeholder="Account holder name" style="width:100%;">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Account Number <span style="color:#ea4335;">*</span></label>
                            <input type="text" id="rfpBankDetails" class="form-control" placeholder="Account number" style="width:100%;">
                        </div>
                        <div id="altBankSection" style="display:none;border-top:1px dashed #cbd5e1;padding-top:0.75rem;margin-top:0.25rem;">
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
                                <span style="font-weight:600;color:#475569;font-size:0.8125rem;">Alternative Bank Account</span>
                                <button type="button" class="btn btn-outline" onclick="window.removeAltBank()" style="font-size:0.75rem;padding:2px 8px;color:#ef4444;border-color:#ef4444;">Remove</button>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:0.75rem;">
                                <div>
                                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Bank</label>
                                    <input type="text" id="rfpAltBankName" class="form-control" placeholder="e.g. BDO, BPI, Metrobank" style="width:100%;">
                                </div>
                                <div>
                                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Account Name</label>
                                    <input type="text" id="rfpAltBankAccountName" class="form-control" placeholder="Account holder name" style="width:100%;">
                                </div>
                                <div>
                                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Account Number</label>
                                    <input type="text" id="rfpAltBankDetails" class="form-control" placeholder="Account number" style="width:100%;">
                                </div>
                            </div>
                        </div>
                        <button type="button" id="addAltBankBtn" class="btn btn-outline" onclick="window.showAltBank()" style="width:100%;font-size:0.8125rem;padding:6px 12px;margin-top:0.25rem;color:#059669;border-color:#059669;">
                            + Add Alternative Bank Account
                        </button>
                    </div>
                    <div id="rfpOtherModeWrapper" style="display:none;">
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Specify Payment Mode <span style="color:#ea4335;">*</span></label>
                        <input type="text" id="rfpPaymentModeOther" class="form-control" placeholder="Enter payment mode" style="width:100%;">
                    </div>
                </div>
                <div id="rfpErrorAlert" style="display:none;margin-top:1rem;padding:8px 12px;background:#fef2f2;color:#991b1b;border-radius:6px;font-size:0.875rem;"></div>
            </div>
            <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:1rem 1.5rem;border-top:1px solid #e5e7eb;">
                <button class="btn btn-outline" onclick="document.getElementById('rfpModal').remove()">Discard RFP</button>
                <button class="btn btn-primary" onclick="window.submitDeliveryFeeRFP('${poDocId}')">Submit RFP</button>
            </div>
        </div>
    </div>`;

    // Remove any existing modal first
    const existingModal = document.getElementById('rfpModal');
    if (existingModal) existingModal.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * Open TR RFP creation modal pre-filled with TR data.
 * @param {string} trDocId - Firestore document ID of the TR
 */
async function openTRRFPModal(trDocId) {
    const ctx = document.getElementById('rfpContextMenu');
    if (ctx) ctx.remove();

    // Fetch TR document from Firestore
    let tr;
    try {
        const trDocRef = doc(db, 'transport_requests', trDocId);
        const trSnap = await getDoc(trDocRef);
        if (!trSnap.exists()) { showToast('TR not found', 'error'); return; }
        tr = { id: trSnap.id, ...trSnap.data() };
    } catch (error) {
        console.error('[Procurement] Error fetching TR for RFP:', error);
        showToast('Failed to load TR data', 'error');
        return;
    }

    const trTotal = parseFloat(tr.total_amount) || 0;

    // Check existing RFPs for this TR
    const existingRFPs = rfpsByTR[tr.tr_id] || [];
    const hasExistingRFP = existingRFPs.length > 0;

    const deptLabel = tr.service_code
        ? `Service: ${escapeHTML(tr.service_code)}`
        : `Project: ${escapeHTML(tr.project_code || '')}`;

    const modalHtml = `
    <div id="rfpModal" class="modal" style="display:flex;">
        <div class="modal-content" style="max-width:520px;margin:auto;">
            <div class="modal-header">
                <h2 style="font-size:1.125rem;font-weight:600;">Create Request for Payment (TR)</h2>
                <button class="modal-close" onclick="document.getElementById('rfpModal').remove()">&times;</button>
            </div>
            <div class="modal-body" style="padding:1.5rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
                    <div>
                        <div class="modal-detail-label" style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Supplier</div>
                        <div style="font-weight:600;color:#1e293b;">${escapeHTML(tr.supplier_name || '')}</div>
                    </div>
                    <div>
                        <div class="modal-detail-label" style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">TR Reference</div>
                        <div style="font-weight:600;color:#1e293b;">${escapeHTML(tr.tr_id || '')}</div>
                    </div>
                    <div style="grid-column:span 2;">
                        <div class="modal-detail-label" style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Department</div>
                        <div style="font-weight:600;color:#1e293b;">${deptLabel}</div>
                    </div>
                </div>
                ${hasExistingRFP ? '<div style="margin-bottom:1rem;padding:8px 12px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;border-radius:6px;font-size:0.875rem;">An RFP already exists for this TR. You cannot create another one.</div>' : ''}
                <div style="display:flex;flex-direction:column;gap:1rem;">
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Amount Requested</label>
                        <input type="text" id="rfpAmount" class="form-control" value="${formatCurrency(trTotal)}" readonly
                               style="width:100%;background:#f1f5f9;cursor:not-allowed;">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Proof <span style="color:#ea4335;">*</span></label>
                        <input type="text" id="rfpInvoiceNumber" class="form-control" placeholder="Paste URL or enter proof details" style="width:100%;" required>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Due Date <span style="color:#ea4335;">*</span></label>
                        <input type="date" id="rfpDueDate" class="form-control" style="width:100%;" required>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Mode of Payment <span style="color:#ea4335;">*</span></label>
                        <select id="rfpPaymentMode" class="form-control" style="width:100%;" onchange="window.toggleRFPBankFields()" required>
                            <option value="">Select payment mode...</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Check">Check</option>
                            <option value="Cash">Cash</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div id="rfpBankFields" style="display:none;flex-direction:column;gap:1rem;">
                        <div>
                            <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Bank <span style="color:#ea4335;">*</span></label>
                            <input type="text" id="rfpBankName" class="form-control" placeholder="e.g. BDO, BPI, Metrobank" style="width:100%;">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Account Name <span style="color:#ea4335;">*</span></label>
                            <input type="text" id="rfpBankAccountName" class="form-control" placeholder="Account holder name" style="width:100%;">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Account Number <span style="color:#ea4335;">*</span></label>
                            <input type="text" id="rfpBankDetails" class="form-control" placeholder="Account number" style="width:100%;">
                        </div>
                        <div id="altBankSection" style="display:none;border-top:1px dashed #cbd5e1;padding-top:0.75rem;margin-top:0.25rem;">
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
                                <span style="font-weight:600;color:#475569;font-size:0.8125rem;">Alternative Bank Account</span>
                                <button type="button" class="btn btn-outline" onclick="window.removeAltBank()" style="font-size:0.75rem;padding:2px 8px;color:#ef4444;border-color:#ef4444;">Remove</button>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:0.75rem;">
                                <div>
                                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Bank</label>
                                    <input type="text" id="rfpAltBankName" class="form-control" placeholder="e.g. BDO, BPI, Metrobank" style="width:100%;">
                                </div>
                                <div>
                                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Account Name</label>
                                    <input type="text" id="rfpAltBankAccountName" class="form-control" placeholder="Account holder name" style="width:100%;">
                                </div>
                                <div>
                                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Account Number</label>
                                    <input type="text" id="rfpAltBankDetails" class="form-control" placeholder="Account number" style="width:100%;">
                                </div>
                            </div>
                        </div>
                        <button type="button" id="addAltBankBtn" class="btn btn-outline" onclick="window.showAltBank()" style="width:100%;font-size:0.8125rem;padding:6px 12px;margin-top:0.25rem;color:#059669;border-color:#059669;">
                            + Add Alternative Bank Account
                        </button>
                    </div>
                    <div id="rfpOtherModeWrapper" style="display:none;">
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Specify Payment Mode <span style="color:#ea4335;">*</span></label>
                        <input type="text" id="rfpPaymentModeOther" class="form-control" placeholder="Enter payment mode" style="width:100%;">
                    </div>
                </div>
                <div id="rfpErrorAlert" style="display:none;margin-top:1rem;padding:8px 12px;background:#fef2f2;color:#991b1b;border-radius:6px;font-size:0.875rem;"></div>
            </div>
            <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:1rem 1.5rem;border-top:1px solid #e5e7eb;">
                <button class="btn btn-outline" onclick="document.getElementById('rfpModal').remove()">Discard RFP</button>
                <button class="btn btn-primary" onclick="window.submitTRRFP('${trDocId}')" ${hasExistingRFP ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>Submit RFP</button>
            </div>
        </div>
    </div>`;

    const existingModal = document.getElementById('rfpModal');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * Update the Amount Requested field when the tranche selector changes.
 * @param {string} poDocId - Firestore document ID of the PO
 */
function updateRFPAmount(poDocId) {
    const po = poData.find(p => p.id === poDocId);
    if (!po) return;
    const tranches = Array.isArray(po.tranches) && po.tranches.length > 0
        ? po.tranches
        : [{ label: po.payment_terms || 'Full Payment', percentage: 100 }];
    const select = document.getElementById('rfpTrancheSelect');
    const idx = parseInt(select.value);
    const tranche = tranches[idx];
    const poTotal = parseFloat(po.total_amount) || 0;
    const amount = tranche ? (tranche.percentage / 100 * poTotal) : 0;
    document.getElementById('rfpAmount').value = formatCurrency(amount);
}

function showAltBank() {
    const section = document.getElementById('altBankSection');
    const btn = document.getElementById('addAltBankBtn');
    if (section) section.style.display = 'block';
    if (btn) btn.style.display = 'none';
}
window.showAltBank = showAltBank;

function removeAltBank() {
    const section = document.getElementById('altBankSection');
    const btn = document.getElementById('addAltBankBtn');
    if (section) {
        section.style.display = 'none';
        const inputs = section.querySelectorAll('input');
        inputs.forEach(inp => inp.value = '');
    }
    if (btn) btn.style.display = 'block';
}
window.removeAltBank = removeAltBank;

/**
 * Show/hide bank fields or "Other" specifier based on selected payment mode.
 */
function toggleRFPBankFields() {
    const mode = document.getElementById('rfpPaymentMode')?.value;
    const bankFields = document.getElementById('rfpBankFields');
    const otherWrapper = document.getElementById('rfpOtherModeWrapper');
    if (bankFields) bankFields.style.display = mode === 'Bank Transfer' ? 'flex' : 'none';
    if (otherWrapper) otherWrapper.style.display = mode === 'Other' ? 'block' : 'none';
    // Reset alt bank when switching away from Bank Transfer
    if (mode !== 'Bank Transfer') {
        const altSection = document.getElementById('altBankSection');
        if (altSection) { altSection.style.display = 'none'; altSection.querySelectorAll('input').forEach(inp => inp.value = ''); }
        const altBtn = document.getElementById('addAltBankBtn');
        if (altBtn) altBtn.style.display = 'block';
    }
}
window.toggleRFPBankFields = toggleRFPBankFields;

/**
 * Submit the RFP form and write a document to the rfps Firestore collection.
 * @param {string} poDocId - Firestore document ID of the PO
 */
async function submitRFP(poDocId) {
    const po = poData.find(p => p.id === poDocId);
    if (!po) { showToast('PO not found', 'error'); return; }

    const invoiceNumber = document.getElementById('rfpInvoiceNumber')?.value?.trim();
    const dueDate = document.getElementById('rfpDueDate')?.value;
    const paymentMode = document.getElementById('rfpPaymentMode')?.value;
    const bankName = document.getElementById('rfpBankName')?.value?.trim() || '';
    const bankAccountName = document.getElementById('rfpBankAccountName')?.value?.trim() || '';
    const bankDetails = document.getElementById('rfpBankDetails')?.value?.trim() || '';
    const altBankName = document.getElementById('rfpAltBankName')?.value?.trim() || '';
    const altBankAccountName = document.getElementById('rfpAltBankAccountName')?.value?.trim() || '';
    const altBankDetails = document.getElementById('rfpAltBankDetails')?.value?.trim() || '';
    const paymentModeOther = document.getElementById('rfpPaymentModeOther')?.value?.trim() || '';
    const errorEl = document.getElementById('rfpErrorAlert');

    if (!invoiceNumber || !dueDate || !paymentMode) {
        if (errorEl) { errorEl.textContent = 'Proof, due date, and mode of payment are required.'; errorEl.style.display = 'block'; }
        return;
    }
    if (paymentMode === 'Bank Transfer' && (!bankName || !bankAccountName || !bankDetails)) {
        if (errorEl) { errorEl.textContent = 'Bank, account name, and account number are required for Bank Transfer.'; errorEl.style.display = 'block'; }
        return;
    }
    if (paymentMode === 'Other' && !paymentModeOther) {
        if (errorEl) { errorEl.textContent = 'Please specify the payment mode.'; errorEl.style.display = 'block'; }
        return;
    }

    const tranches = Array.isArray(po.tranches) && po.tranches.length > 0
        ? po.tranches
        : [{ label: po.payment_terms || 'Full Payment', percentage: 100 }];
    const select = document.getElementById('rfpTrancheSelect');
    const idx = parseInt(select.value);
    const tranche = tranches[idx];
    if (!tranche) { showToast('Please select a tranche', 'error'); return; }

    // Guard against duplicate tranche submission (also prevents bypass via browser console)
    const existingRFPsForPO = rfpsByPO[po.po_id] || [];
    const usedIndicesCheck = new Set(
        existingRFPsForPO.filter(r => r.tranche_index != null).map(r => r.tranche_index)
    );
    existingRFPsForPO
        .filter(r => r.tranche_index == null && r.tranche_label !== 'Delivery Fee')
        .forEach(r => {
            const matchIdx = tranches.findIndex((t, i) => t.label === r.tranche_label && !usedIndicesCheck.has(i));
            if (matchIdx >= 0) usedIndicesCheck.add(matchIdx);
        });
    if (usedIndicesCheck.has(idx)) {
        showToast('An RFP already exists for this tranche', 'error');
        return;
    }

    const poTotal = parseFloat(po.total_amount) || 0;
    const amountRequested = tranche.percentage / 100 * poTotal;

    try {
        const rfpId = await generateRFPId(po.po_id);

        const rfpDoc = {
            rfp_id: rfpId,
            po_id: po.po_id,
            po_doc_id: poDocId,
            mrf_id: po.mrf_id || '',
            project_code: po.project_code || '',
            project_name: po.project_name || '',
            service_code: po.service_code || '',
            service_name: po.service_name || '',
            supplier_name: po.supplier_name,
            tranche_index: idx,
            tranche_label: tranche.label,
            tranche_percentage: tranche.percentage,
            amount_requested: amountRequested,
            invoice_number: invoiceNumber,
            due_date: dueDate,
            mode_of_payment: paymentMode === 'Other' ? paymentModeOther : paymentMode,
            bank_name: paymentMode === 'Bank Transfer' ? bankName : '',
            bank_account_name: paymentMode === 'Bank Transfer' ? bankAccountName : '',
            bank_details: paymentMode === 'Bank Transfer' ? bankDetails : '',
            alt_bank_name: paymentMode === 'Bank Transfer' ? altBankName : '',
            alt_bank_account_name: paymentMode === 'Bank Transfer' ? altBankAccountName : '',
            alt_bank_details: paymentMode === 'Bank Transfer' ? altBankDetails : '',
            payment_records: [],
            date_submitted: serverTimestamp()
        };

        await addDoc(collection(db, 'rfps'), rfpDoc);

        document.getElementById('rfpModal')?.remove();
        showToast(`RFP ${rfpId} submitted successfully`, 'success');
    } catch (error) {
        console.error('[Procurement] RFP submission error:', error);
        if (errorEl) {
            errorEl.textContent = 'Failed to submit RFP. Check your connection and try again.';
            errorEl.style.display = 'block';
        }
    }
}

/**
 * Submit the TR RFP form and write a document to the rfps Firestore collection.
 * @param {string} trDocId - Firestore document ID of the TR
 */
async function submitTRRFP(trDocId) {
    let tr;
    try {
        const trDocRef = doc(db, 'transport_requests', trDocId);
        const trSnap = await getDoc(trDocRef);
        if (!trSnap.exists()) { showToast('TR not found', 'error'); return; }
        tr = { id: trSnap.id, ...trSnap.data() };
    } catch (error) {
        console.error('[Procurement] Error fetching TR for RFP submit:', error);
        showToast('Failed to load TR data', 'error');
        return;
    }

    // Guard against duplicates (also prevents bypass via browser console)
    const existingRFPs = rfpsByTR[tr.tr_id] || [];
    if (existingRFPs.length > 0) {
        showToast('An RFP already exists for this TR', 'error');
        return;
    }

    const invoiceNumber = document.getElementById('rfpInvoiceNumber')?.value?.trim();
    const dueDate = document.getElementById('rfpDueDate')?.value;
    const paymentMode = document.getElementById('rfpPaymentMode')?.value;
    const bankName = document.getElementById('rfpBankName')?.value?.trim() || '';
    const bankAccountName = document.getElementById('rfpBankAccountName')?.value?.trim() || '';
    const bankDetails = document.getElementById('rfpBankDetails')?.value?.trim() || '';
    const altBankName = document.getElementById('rfpAltBankName')?.value?.trim() || '';
    const altBankAccountName = document.getElementById('rfpAltBankAccountName')?.value?.trim() || '';
    const altBankDetails = document.getElementById('rfpAltBankDetails')?.value?.trim() || '';
    const paymentModeOther = document.getElementById('rfpPaymentModeOther')?.value?.trim() || '';
    const errorEl = document.getElementById('rfpErrorAlert');

    if (!invoiceNumber || !dueDate || !paymentMode) {
        if (errorEl) { errorEl.textContent = 'Proof, due date, and mode of payment are required.'; errorEl.style.display = 'block'; }
        return;
    }
    if (paymentMode === 'Bank Transfer' && (!bankName || !bankAccountName || !bankDetails)) {
        if (errorEl) { errorEl.textContent = 'Bank, account name, and account number are required for Bank Transfer.'; errorEl.style.display = 'block'; }
        return;
    }
    if (paymentMode === 'Other' && !paymentModeOther) {
        if (errorEl) { errorEl.textContent = 'Please specify the payment mode.'; errorEl.style.display = 'block'; }
        return;
    }

    const trTotal = parseFloat(tr.total_amount) || 0;

    try {
        const rfpId = await generateTRRFPId(tr.tr_id);

        const rfpDoc = {
            rfp_id: rfpId,
            tr_id: tr.tr_id,
            tr_doc_id: trDocId,
            po_id: '',
            po_doc_id: '',
            mrf_id: tr.mrf_id || '',
            project_code: tr.project_code || '',
            project_name: tr.project_name || '',
            service_code: tr.service_code || '',
            service_name: tr.service_name || '',
            supplier_name: tr.supplier_name || '',
            tranche_label: 'Full Payment',
            tranche_percentage: 100,
            amount_requested: trTotal,
            invoice_number: invoiceNumber,
            due_date: dueDate,
            mode_of_payment: paymentMode === 'Other' ? paymentModeOther : paymentMode,
            bank_name: paymentMode === 'Bank Transfer' ? bankName : '',
            bank_account_name: paymentMode === 'Bank Transfer' ? bankAccountName : '',
            bank_details: paymentMode === 'Bank Transfer' ? bankDetails : '',
            alt_bank_name: paymentMode === 'Bank Transfer' ? altBankName : '',
            alt_bank_account_name: paymentMode === 'Bank Transfer' ? altBankAccountName : '',
            alt_bank_details: paymentMode === 'Bank Transfer' ? altBankDetails : '',
            payment_records: [],
            date_submitted: serverTimestamp()
        };

        await addDoc(collection(db, 'rfps'), rfpDoc);

        document.getElementById('rfpModal')?.remove();
        showToast(`RFP ${rfpId} submitted successfully`, 'success');
    } catch (error) {
        console.error('[Procurement] TR RFP submission error:', error);
        if (errorEl) {
            errorEl.textContent = 'Failed to submit RFP. Check your connection and try again.';
            errorEl.style.display = 'block';
        }
    }
}

/**
 * Submit the Delivery Fee RFP form and write a document to the rfps Firestore collection.
 * @param {string} poDocId - Firestore document ID of the PO
 */
async function submitDeliveryFeeRFP(poDocId) {
    const po = poData.find(p => p.id === poDocId);
    if (!po) { showToast('PO not found', 'error'); return; }

    const invoiceNumber = document.getElementById('rfpInvoiceNumber')?.value?.trim();
    const dueDate = document.getElementById('rfpDueDate')?.value;
    const paymentMode = document.getElementById('rfpPaymentMode')?.value;
    const bankName = document.getElementById('rfpBankName')?.value?.trim() || '';
    const bankAccountName = document.getElementById('rfpBankAccountName')?.value?.trim() || '';
    const bankDetails = document.getElementById('rfpBankDetails')?.value?.trim() || '';
    const altBankName = document.getElementById('rfpAltBankName')?.value?.trim() || '';
    const altBankAccountName = document.getElementById('rfpAltBankAccountName')?.value?.trim() || '';
    const altBankDetails = document.getElementById('rfpAltBankDetails')?.value?.trim() || '';
    const paymentModeOther = document.getElementById('rfpPaymentModeOther')?.value?.trim() || '';
    const errorEl = document.getElementById('rfpErrorAlert');

    if (!invoiceNumber || !dueDate || !paymentMode) {
        if (errorEl) { errorEl.textContent = 'Proof, due date, and mode of payment are required.'; errorEl.style.display = 'block'; }
        return;
    }
    if (paymentMode === 'Bank Transfer' && (!bankName || !bankAccountName || !bankDetails)) {
        if (errorEl) { errorEl.textContent = 'Bank, account name, and account number are required for Bank Transfer.'; errorEl.style.display = 'block'; }
        return;
    }
    if (paymentMode === 'Other' && !paymentModeOther) {
        if (errorEl) { errorEl.textContent = 'Please specify the payment mode.'; errorEl.style.display = 'block'; }
        return;
    }

    const deliveryFee = parseFloat(po.delivery_fee) || 0;

    try {
        const rfpId = await generateRFPId(po.po_id);

        const rfpDoc = {
            rfp_id: rfpId,
            po_id: po.po_id,
            po_doc_id: poDocId,
            mrf_id: po.mrf_id || '',
            project_code: po.project_code || '',
            project_name: po.project_name || '',
            service_code: po.service_code || '',
            service_name: po.service_name || '',
            supplier_name: po.supplier_name,
            tranche_label: 'Delivery Fee',
            tranche_percentage: 0,
            amount_requested: deliveryFee,
            invoice_number: invoiceNumber,
            due_date: dueDate,
            mode_of_payment: paymentMode === 'Other' ? paymentModeOther : paymentMode,
            bank_name: paymentMode === 'Bank Transfer' ? bankName : '',
            bank_account_name: paymentMode === 'Bank Transfer' ? bankAccountName : '',
            bank_details: paymentMode === 'Bank Transfer' ? bankDetails : '',
            alt_bank_name: paymentMode === 'Bank Transfer' ? altBankName : '',
            alt_bank_account_name: paymentMode === 'Bank Transfer' ? altBankAccountName : '',
            alt_bank_details: paymentMode === 'Bank Transfer' ? altBankDetails : '',
            payment_records: [],
            date_submitted: serverTimestamp()
        };

        await addDoc(collection(db, 'rfps'), rfpDoc);
        document.getElementById('rfpModal')?.remove();
        showToast(`RFP ${rfpId} (Delivery Fee) submitted successfully`, 'success');
    } catch (error) {
        console.error('[Procurement] Delivery Fee RFP submission error:', error);
        if (errorEl) {
            errorEl.textContent = 'Failed to submit RFP. Check your connection and try again.';
            errorEl.style.display = 'block';
        }
    }
}

// ========================================
// WINDOW FUNCTIONS ATTACHMENT
// ========================================

/**
 * Attach all window functions for use in onclick handlers
 * This needs to be called every time init() runs to ensure
 * functions are available after tab navigation
 */
function attachWindowFunctions() {
    // MRF Management Functions
    window.loadMRFs = loadMRFs;
    window.createNewMRF = createNewMRF;
    window.selectMRF = selectMRF;
    window.saveProgress = saveProgress;
    window.saveNewMRF = saveNewMRF;
    window.deleteMRF = deleteMRF;
    window.rejectMRF = rejectMRF;
    window.generatePR = generatePR;
    window.generatePRandTR = generatePRandTR;
    window.submitTransportRequest = submitTransportRequest;

    // Line Items Functions
    window.calculateSubtotal = calculateSubtotal;
    window.addLineItem = addLineItem;
    window.deleteLineItem = deleteLineItem;
    window.updateActionButtons = updateActionButtons;

    // Supplier Management Functions
    window.toggleAddForm = toggleAddForm;
    window.addSupplier = addSupplier;
    window.editSupplier = editSupplier;
    window.cancelEdit = cancelEdit;
    window.saveEdit = saveEdit;
    window.deleteSupplier = deleteSupplier;
    window.changeSuppliersPage = changeSuppliersPage;
    window.applySupplierSearch = applySupplierSearch;

    // MRF Records Functions
    window.loadPRPORecords = loadPRPORecords;
    window.filterPRPORecords = filterPRPORecords;
    window.goToPRPOPage = goToPRPOPage;
    window.viewPRDetails = viewPRDetails;
    window.viewTRDetails = viewTRDetails;
    window.viewPODetails = viewPODetails;
    window.viewPOTimeline = viewPOTimeline;
    window.updatePOStatus = updatePOStatus;
    window.showProcurementTimeline = showProcurementTimeline;
    window.applyPODeptFilter = applyPODeptFilter;
    window.sortPRPORecords = sortPRPORecords;
    window.closeTimelineModal = closeTimelineModal;
    window.showSupplierPurchaseHistory = showSupplierPurchaseHistory;
    window.closeSupplierHistoryModal = closeSupplierHistoryModal;

    // Proof of Procurement — re-render callback for shared modal
    window._proofOnSaved = () => {
        _prpoSubDataCache = new Map();
        if (document.getElementById('histSearchInput')) {
            filterPRPORecords();
        }
    };

    // Tranche Builder Functions
    window.recalculateTranches = recalculateTranches;
    window.addTranche = addTranche;
    window.removeTranche = removeTranche;

    // Document Generation Functions
    window.generatePRDocument = generatePRDocument;
    window.generatePODocument = generatePODocument;
    window.promptPODocument = promptPODocument;
    window.generatePOWithFields = generatePOWithFields;
    window.savePODocumentFields = savePODocumentFields;
    window.viewPODocument = viewPODocument;
    window.downloadPODocument = downloadPODocument;
    window.generateAllPODocuments = generateAllPODocuments;
    window.exportPRPORecordsCSV = exportPRPORecordsCSV;
    window.exportPOTrackingCSV = exportPOTrackingCSV;

    // Rejected TR Functions
    window.selectRejectedTR = selectRejectedTR;
    window.resubmitRejectedTR = resubmitRejectedTR;
    window.saveRejectedTRChanges = saveRejectedTRChanges;
    window.deleteRejectedTR = deleteRejectedTR;

    // RFP Functions
    window.showRFPContextMenu = showRFPContextMenu;
    window.openRFPModal = openRFPModal;
    window.updateRFPAmount = updateRFPAmount;
    window.submitRFP = submitRFP;
    window.openDeliveryFeeRFPModal = openDeliveryFeeRFPModal;
    window.submitDeliveryFeeRFP = submitDeliveryFeeRFP;

    // TR RFP Functions
    window.showTRRFPContextMenu = showTRRFPContextMenu;
    window.openTRRFPModal = openTRRFPModal;
    window.submitTRRFP = submitTRRFP;

    // MRF Cancel PRs Functions
    window.showMRFContextMenu = showMRFContextMenu;
    window.cancelMRFPRs = cancelMRFPRs;

    // RFP Cancel Functions
    window.cancelRFPDocument = cancelRFPDocument;

    // Saved Bank Functions
    window.showAltBank = showAltBank;
    window.removeAltBank = removeAltBank;
}

// ========================================
// VIEW RENDERING
// ========================================

/**
 * Render the procurement view HTML
 * @param {string} activeTab - Active tab (mrfs, suppliers, records)
 * @returns {string} HTML string
 */
export function render(activeTab = 'mrfs') {
    // Get edit permission
    const canEdit = window.canEditTab?.('procurement');
    const showEditControls = canEdit !== false;

    return `
        <!-- Tab Navigation -->
        <div style="background: white; border-bottom: 1px solid var(--gray-200);">
            <div style="max-width: 1600px; margin: 0 auto; padding: 0 2rem;">
                <div class="tabs-nav">
                    <a href="#/procurement/mrfs" class="tab-btn ${activeTab === 'mrfs' ? 'active' : ''}">
                        MRF Processing
                    </a>
                    <a href="#/procurement/suppliers" class="tab-btn ${activeTab === 'suppliers' ? 'active' : ''}">
                        Supplier Management
                    </a>
                    <a href="#/procurement/records" class="tab-btn ${activeTab === 'records' ? 'active' : ''}">
                        MRF Records
                    </a>
                </div>
            </div>
        </div>

        <div style="max-width: 1600px; margin: 2rem auto 0; padding: 0 2rem;">
            <!-- MRF Processing Section -->
            <section id="mrfs-section" class="section ${activeTab === 'mrfs' ? 'active' : ''}">
                ${!showEditControls ? '<div class="view-only-notice"><span class="notice-icon">👁️</span> <span>View-only mode: You can view MRF data but cannot create or process MRFs.</span></div>' : ''}
                <div class="dashboard-grid">
                    <!-- MRF List -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Pending MRFs</h3>
                            <div style="display: flex; gap: 0.5rem;">
                                ${showEditControls ? '<button class="btn btn-primary" onclick="window.createNewMRF()">New</button>' : ''}
                                <button class="btn btn-secondary" onclick="window.loadMRFs()">Refresh</button>
                            </div>
                        </div>
                        <div class="mrf-list" id="mrfList">
                            <div style="text-align: center; padding: 2rem; color: #999;">
                                Loading MRFs...
                            </div>
                        </div>
                    </div>

                    <!-- MRF Details -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">MRF Details</h3>
                            ${showEditControls ? `
                            <div style="display: flex; gap: 0.5rem;" id="mrfActions">
                                <button class="btn btn-primary" onclick="window.saveProgress()">Save Progress</button>
                                <button class="btn btn-success" id="generatePRBtn" onclick="window.generatePR()" style="display: none;">Generate PR</button>
                            </div>
                            ` : ''}
                        </div>
                        <div id="mrfDetails">
                            <div style="text-align: center; padding: 3rem; color: #999;">
                                Select an MRF to view details
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Supplier Management Section -->
            <section id="suppliers-section" class="section ${activeTab === 'suppliers' ? 'active' : ''}">
                ${!showEditControls ? '<div class="view-only-notice"><span class="notice-icon">👁️</span> <span>View-only mode: You can view suppliers but cannot add, edit, or delete suppliers.</span></div>' : ''}
                <div class="card">
                    <div class="suppliers-header">
                        <h2>Supplier Management</h2>
                        ${showEditControls ? '<button class="btn btn-primary" onclick="window.toggleAddForm()">Add Supplier</button>' : ''}
                    </div>

                    <!-- Add Supplier Form -->
                    <div id="addSupplierForm" class="add-form" style="display: none;">
                        <h3 style="margin-bottom: 1rem;">Add New Supplier</h3>
                        <div class="form-group">
                            <label>Supplier Name *</label>
                            <input type="text" id="newSupplierName" required>
                        </div>
                        <div class="form-group">
                            <label>Contact Person *</label>
                            <input type="text" id="newContactPerson" required>
                        </div>
                        <div class="form-group">
                            <label>Email *</label>
                            <input type="email" id="newEmail" required>
                        </div>
                        <div class="form-group">
                            <label>Phone *</label>
                            <input type="text" id="newPhone" required>
                        </div>
                        <div class="form-actions">
                            <button class="btn btn-secondary" onclick="window.toggleAddForm()">Cancel</button>
                            <button class="btn btn-success" onclick="window.addSupplier()">Add Supplier</button>
                        </div>
                    </div>

                    <!-- Supplier Search Filter Bar -->
                    <div class="filter-bar" style="display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: #f8fafc; border-radius: 0.5rem;">
                        <div class="form-group" style="margin: 0; flex: 2; min-width: 200px;">
                            <label style="font-size: 0.875rem; margin-bottom: 0.25rem;">Search</label>
                            <input type="text"
                                   id="supplierSearchInput"
                                   placeholder="Search by supplier name or contact person..."
                                   oninput="window.applySupplierSearch()"
                                   style="width: 100%;">
                        </div>
                    </div>

                    <!-- Suppliers Table -->
                    <div class="table-scroll-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Supplier Name</th>
                                <th>Contact Person</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="suppliersTableBody">
                            ${skeletonTableRows(5, 5)}
                        </tbody>
                    </table>
                    </div>
                    <div id="suppliersPagination"></div>
                </div>
            </section>

            <!-- MRF Records Section -->
            <section id="records-section" class="section ${activeTab === 'records' ? 'active' : ''}">
                ${!showEditControls ? '<div class="view-only-notice"><span class="notice-icon">👁️</span> <span>View-only mode: You can view records but cannot update PO statuses.</span></div>' : ''}
                <div class="card">
                    <div class="card-header">
                        <h2>MRF Records</h2>
                        <div style="display:flex;gap:0.5rem;align-items:center;">
                            <select id="deptFilterPOTracking"
                                    onchange="window.applyPODeptFilter(this.value)"
                                    style="padding:0.35rem 0.6rem;border:1.5px solid #e2e8f0;border-radius:6px;font-size:0.875rem;color:#475569;">
                                <option value="">All Departments</option>
                                <option value="projects">Projects</option>
                                <option value="services">Services</option>
                            </select>
                            <button class="btn btn-secondary" onclick="window.exportPOTrackingCSV()">Export PO CSV</button>
                            <button class="btn btn-secondary" onclick="window.exportPRPORecordsCSV()">Export MRF CSV</button>
                            <button class="btn btn-primary" onclick="window.loadPRPORecords()">🔄 Refresh</button>
                        </div>
                    </div>

                    <!-- PO Scoreboards -->
                    <div style="padding: 1.5rem 1.5rem 0 1.5rem;">
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; margin-bottom: 1.5rem;">
                            <!-- Materials Scoreboards -->
                            <div>
                                <div style="font-size: 0.85rem; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.75rem;">Materials Procurement</div>
                                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
                                    <div style="background: linear-gradient(135deg, #fee 0%, #fcc 100%); padding: 1rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(220, 38, 38, 0.1); border-left: 4px solid #dc2626;">
                                        <div style="font-size: 0.7rem; font-weight: 600; color: #991b1b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.35rem;">Pending</div>
                                        <div id="scoreMaterialsPending" style="font-size: 1.75rem; font-weight: 700; color: #dc2626;">0</div>
                                    </div>
                                    <div style="background: linear-gradient(135deg, #fef9e7 0%, #fef3c7 100%); padding: 1rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(234, 179, 8, 0.1); border-left: 4px solid #eab308;">
                                        <div style="font-size: 0.7rem; font-weight: 600; color: #854d0e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.35rem;">Procuring</div>
                                        <div id="scoreMaterialsProcuring" style="font-size: 1.75rem; font-weight: 700; color: #ca8a04;">0</div>
                                    </div>
                                    <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); padding: 1rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(34, 197, 94, 0.1); border-left: 4px solid #22c55e;">
                                        <div style="font-size: 0.7rem; font-weight: 600; color: #14532d; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.35rem;">Procured</div>
                                        <div id="scoreMaterialsProcured" style="font-size: 1.75rem; font-weight: 700; color: #16a34a;">0</div>
                                    </div>
                                    <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding: 1rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.1); border-left: 4px solid #3b82f6;">
                                        <div style="font-size: 0.7rem; font-weight: 600; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.35rem;">Delivered</div>
                                        <div id="scoreMaterialsDelivered" style="font-size: 1.75rem; font-weight: 700; color: #2563eb;">0</div>
                                    </div>
                                </div>
                            </div>

                            <!-- Subcon Scoreboards -->
                            <div>
                                <div style="font-size: 0.85rem; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.75rem;">Subcon Processing</div>
                                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
                                    <div style="background: linear-gradient(135deg, #fee 0%, #fcc 100%); padding: 1rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(220, 38, 38, 0.1); border-left: 4px solid #dc2626;">
                                        <div style="font-size: 0.7rem; font-weight: 600; color: #991b1b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.35rem;">Pending</div>
                                        <div id="scoreSubconPending" style="font-size: 1.75rem; font-weight: 700; color: #dc2626;">0</div>
                                    </div>
                                    <div style="background: linear-gradient(135deg, #fef9e7 0%, #fef3c7 100%); padding: 1rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(234, 179, 8, 0.1); border-left: 4px solid #eab308;">
                                        <div style="font-size: 0.7rem; font-weight: 600; color: #854d0e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.35rem;">Processing</div>
                                        <div id="scoreSubconProcessing" style="font-size: 1.75rem; font-weight: 700; color: #ca8a04;">0</div>
                                    </div>
                                    <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); padding: 1rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(34, 197, 94, 0.1); border-left: 4px solid #22c55e; grid-column: span 2;">
                                        <div style="font-size: 0.7rem; font-weight: 600; color: #14532d; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.35rem;">Processed</div>
                                        <div id="scoreSubconProcessed" style="font-size: 1.75rem; font-weight: 700; color: #16a34a;">0</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Filters -->
                    <div style="padding: 0 1.5rem 1.5rem 1.5rem;">
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
                            <div class="filter-group">
                                <label>PO Status</label>
                                <select id="poStatusFilter" onchange="window.filterPRPORecords()">
                                    <option value="">All PO Statuses</option>
                                    <option value="Pending Procurement">Pending Procurement</option>
                                    <option value="Procuring">Procuring</option>
                                    <option value="Procured">Procured</option>
                                    <option value="Delivered">Delivered</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label>MRF Status</label>
                                <select id="histStatusFilter" onchange="window.filterPRPORecords()">
                                    <option value="">All MRF Statuses</option>
                                    <option value="Pending">Pending</option>
                                    <option value="Approved">Approved</option>
                                    <option value="PR Generated">PR Generated</option>
                                    <option value="TR Submitted">TR Submitted</option>
                                    <option value="PR Rejected">PR Rejected</option>
                                    <option value="TR Rejected">TR Rejected</option>
                                    <option value="Finance Approved">Finance Approved</option>
                                    <option value="PO Issued">PO Issued</option>
                                    <option value="Delivered">Delivered</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label>Search</label>
                                <input type="text" id="histSearchInput" placeholder="MRF ID, Project..." onkeyup="window.filterPRPORecords()">
                            </div>
                        </div>
                    </div>

                    <!-- MRF Records Container -->
                    <div id="prpoRecordsContainer">
                        <div style="text-align: center; padding: 2rem;">Loading MRF records...</div>
                    </div>
                    <div id="prpoPagination"></div>
                </div>

                <!-- Procurement Timeline Modal -->
                <div id="timelineModal" class="modal">
                    <div class="modal-content" style="max-width: 800px;">
                        <div class="modal-header">
                            <h2 id="timelineModalTitle">Procurement Timeline</h2>
                            <button class="modal-close" onclick="window.closeTimelineModal()">&times;</button>
                        </div>
                        <div class="modal-body" id="timelineModalBody">
                            <!-- Dynamically populated with createTimeline() -->
                        </div>
                    </div>
                </div>
            </section>

            <!-- Supplier Purchase History Modal -->
            <div id="supplierHistoryModal" class="modal">
                <div class="modal-content" style="max-width: 900px;">
                    <div class="modal-header">
                        <h2 id="supplierHistoryModalTitle">Supplier Purchase History</h2>
                        <button class="modal-close" onclick="window.closeSupplierHistoryModal()">&times;</button>
                    </div>
                    <div class="modal-body" id="supplierHistoryModalBody">
                        <!-- Dynamically populated -->
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ========================================
// INITIALIZATION & CLEANUP
// ========================================

/**
 * Initialize the procurement view
 * @param {string} activeTab - Active tab to display
 */
export async function init(activeTab = 'mrfs') {
    // Re-attach all window functions (needed after tab navigation)
    attachWindowFunctions();

    // Phase 7: Re-filter MRF list when assignments change
    // Guard: only register once (init() is called on every tab switch without destroy)
    if (!window._procurementAssignmentHandler) {
        const assignmentChangeHandler = () => {
            reFilterAndRenderMRFs();
        };
        window.addEventListener('assignmentsChanged', assignmentChangeHandler);
        window._procurementAssignmentHandler = assignmentChangeHandler;
    }

    try {
        // Reference data is independent — load in parallel for faster init
        await Promise.all([
            loadProjects(),
            loadServicesForNewMRF(),
            loadSuppliers()
        ]);
        // MRF list loads after reference data (dropdown population)
        await loadMRFs();
        await loadRejectedTRs();

        // Load PR-PO records and PO data (for scoreboards) if on records tab
        if (activeTab === 'records') {
            await loadPRPORecords();
            await loadPOTracking();
        }

    } catch (error) {
        console.error('Error initializing procurement view:', error);
        showToast('Error loading procurement data', 'error');
    }
}

// ========================================
// SUPPLIER PURCHASE HISTORY
// ========================================

/**
 * Show supplier purchase history modal
 * @param {string} supplierName - Supplier name to show history for
 */
async function showSupplierPurchaseHistory(supplierName) {
    showLoading(true);

    try {
        const q = query(
            collection(db, 'pos'),
            where('supplier_name', '==', supplierName),
            orderBy('date_issued', 'desc')
        );

        // Get aggregated totals
        const aggSnapshot = await getAggregateFromServer(q, {
            totalPurchases: sum('total_amount'),
            orderCount: count()
        });

        const totalPurchases = aggSnapshot.data().totalPurchases || 0;
        const orderCount = aggSnapshot.data().orderCount || 0;

        // Load PO details for table
        const posSnapshot = await getDocs(q);
        const pos = [];
        posSnapshot.forEach(doc => pos.push({ id: doc.id, ...doc.data() }));

        // Render modal content
        const modalContent = `
            <div class="modal-details-grid">
                <div class="modal-detail-item">
                    <div class="modal-detail-label">Supplier:</div>
                    <div class="modal-detail-value"><strong>${escapeHTML(supplierName)}</strong></div>
                </div>
                <div class="modal-detail-item">
                    <div class="modal-detail-label">Total Purchase Orders:</div>
                    <div class="modal-detail-value">${orderCount}</div>
                </div>
                <div class="modal-detail-item full-width">
                    <div class="modal-detail-label">Total Purchases:</div>
                    <div class="modal-detail-value">
                        <strong style="color: #059669; font-size: 1.5rem;">₱${formatCurrency(totalPurchases)}</strong>
                    </div>
                </div>
            </div>

            <h4 style="margin: 1.5rem 0 1rem; font-size: 1rem; font-weight: 600;">Purchase History</h4>
            <table class="modal-items-table">
                <thead>
                    <tr>
                        <th>PO ID</th>
                        <th>Project</th>
                        <th>Date Issued</th>
                        <th>Amount</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${pos.map(po => `
                        <tr>
                            <td><strong>${escapeHTML(po.po_id)}</strong></td>
                            <td>${escapeHTML(getMRFLabel(po))}</td>
                            <td>${formatTimestamp(po.date_issued) || 'N/A'}</td>
                            <td><strong>₱${formatCurrency(po.total_amount)}</strong></td>
                            <td><span class="status-badge ${getStatusClass(po.procurement_status || 'Pending Procurement')}">${escapeHTML(po.procurement_status)}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        document.getElementById('supplierHistoryModalTitle').textContent = `Supplier Purchase History - ${supplierName}`;
        document.getElementById('supplierHistoryModalBody').innerHTML = modalContent;
        document.getElementById('supplierHistoryModal').classList.add('active');

    } catch (error) {
        console.error('[Procurement] Error loading supplier history:', error);
        showToast('Failed to load supplier purchase history', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Close supplier history modal
 */
function closeSupplierHistoryModal() {
    document.getElementById('supplierHistoryModal').classList.remove('active');
}

// ========================================
// CLEANUP
// ========================================

/**
 * Cleanup when leaving the view
 */
export async function destroy() {
    // Phase 7: Remove assignment change listener
    if (window._procurementAssignmentHandler) {
        window.removeEventListener('assignmentsChanged', window._procurementAssignmentHandler);
        delete window._procurementAssignmentHandler;
    }

    // Phase 7: Clear cached MRF data
    cachedAllMRFs = [];

    // Unsubscribe from all Firebase listeners
    listeners.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });
    listeners = [];

    // Reset TTL cache timestamps so returning to this view fetches fresh data
    _projectsCachedAt = 0;
    _servicesCachedAt = 0;
    _suppliersCachedAt = 0;
    _prpoRecordsCachedAt = 0;

    // Reset listener dedup guards so new listeners are registered on next view entry
    _mrfListenerActive = false;
    _poTrackingListenerActive = false;
    _rfpListenerActive = false;

    // Clear global state
    currentMRF = null;
    suppliersData = [];
    filteredSuppliersData = [];
    projectsData = [];
    poData = [];
    rfpsData = [];
    rfpsByPO = {};
    rfpsByTR = {};
    allPRPORecords = [];
    filteredPRPORecords = [];
    _prpoSubDataCache = new Map();

    // Clean up window functions
    delete window.loadMRFs;
    delete window.createNewMRF;
    delete window.selectMRF;
    delete window.saveProgress;
    delete window.saveNewMRF;
    delete window.deleteMRF;
    delete window.rejectMRF;
    delete window.generatePR;
    delete window.generatePRandTR;
    delete window.submitTransportRequest;
    delete window.calculateSubtotal;
    delete window.addLineItem;
    delete window.deleteLineItem;
    delete window.updateActionButtons;
    delete window.toggleAddForm;
    delete window.addSupplier;
    delete window.editSupplier;
    delete window.cancelEdit;
    delete window.saveEdit;
    delete window.deleteSupplier;
    delete window.changeSuppliersPage;
    delete window.applySupplierSearch;
    delete window.loadPRPORecords;
    delete window.filterPRPORecords;
    delete window.goToPRPOPage;
    delete window.viewPRDetails;
    delete window.viewTRDetails;
    delete window.viewPODetails;
    delete window.viewPOTimeline;
    delete window.updatePOStatus;
    delete window.recalculateTranches;
    delete window.addTranche;
    delete window.removeTranche;
    delete window.generatePRDocument;
    delete window.generatePODocument;
    delete window.promptPODocument;
    delete window.generatePOWithFields;
    delete window.savePODocumentFields;
    delete window.viewPODocument;
    delete window.downloadPODocument;
    delete window.generateAllPODocuments;
    delete window.applyPODeptFilter;
    delete window.sortPRPORecords;
    delete window.exportPRPORecordsCSV;
    delete window.exportPOTrackingCSV;
    delete window.selectRejectedTR;
    delete window.resubmitRejectedTR;
    delete window.saveRejectedTRChanges;
    delete window.deleteRejectedTR;
    delete window._proofOnSaved;
    delete window.showRFPContextMenu;
    delete window.openRFPModal;
    delete window.updateRFPAmount;
    delete window.submitRFP;
    delete window.openDeliveryFeeRFPModal;
    delete window.submitDeliveryFeeRFP;
    delete window.showTRRFPContextMenu;
    delete window.openTRRFPModal;
    delete window.submitTRRFP;
    delete window.showAltBank;
    delete window.removeAltBank;
    delete window.showMRFContextMenu;
    delete window.cancelMRFPRs;
    delete window.cancelRFPDocument;
    activePODeptFilter = '';
    cachedRejectedTRs = [];
}

// ========================================
// PROJECTS MANAGEMENT
// ========================================

/**
 * Load active projects from Firebase
 */
async function loadServicesForNewMRF() {
    if (cachedServicesForNewMRF.length > 0 && (Date.now() - _servicesCachedAt) < CACHE_TTL_MS) {
        return; // Use cached data
    }
    try {
        const q = query(collection(db, 'services'), where('active', '==', true));
        const snapshot = await getDocs(q);
        cachedServicesForNewMRF = [];
        snapshot.forEach(docSnap => {
            cachedServicesForNewMRF.push({ id: docSnap.id, ...docSnap.data() });
        });
        // Sort alphabetically A-Z by service code
        cachedServicesForNewMRF.sort((a, b) => (a.service_code || '').localeCompare(b.service_code || ''));
        _servicesCachedAt = Date.now();
    } catch (error) {
        console.error('[Procurement] Error loading services for new MRF:', error);
    }
}

async function loadProjects() {
    if (projectsData.length > 0 && (Date.now() - _projectsCachedAt) < CACHE_TTL_MS) {
        return; // Listener still has fresh data
    }
    try {
        const q = query(
            collection(db, 'projects'),
            where('active', '==', true)
        );

        const listener = onSnapshot(q, (snapshot) => {
            projectsData = [];
            snapshot.forEach(doc => {
                projectsData.push({ id: doc.id, ...doc.data() });
            });

            // Sort alphabetically A-Z by project code
            projectsData.sort((a, b) => (a.project_code || '').localeCompare(b.project_code || ''));
            _projectsCachedAt = Date.now();

        });

        listeners.push(listener);
    } catch (error) {
        console.error('Error loading projects:', error);
    }
}

// ========================================
// MRF MANAGEMENT
// ========================================

/**
 * Load MRFs with real-time updates
 */
async function loadMRFs() {
    if (_mrfListenerActive) {
        // Listener already registered — just re-render from cached data
        if (cachedAllMRFs.length > 0) {
            reFilterAndRenderMRFs();
        }
        return;
    }
    _mrfListenerActive = true;

    const mrfsRef = collection(db, 'mrfs');
    const statuses = ['Pending', 'In Progress', 'Rejected', 'PR Rejected', 'TR Rejected', 'Finance Rejected'];
    const q = query(mrfsRef, where('status', 'in', statuses));

    const listener = onSnapshot(q, (snapshot) => {
        const allMRFs = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            allMRFs.push({ id: doc.id, ...data });
        });

        // Cache raw data for re-filtering on assignment change (Phase 7)
        cachedAllMRFs = [...allMRFs];

        // Phase 7: Scope MRF list to assigned projects for operations_user.
        // Runs BEFORE the material/transport split so both lists are filtered.
        const assignedCodes = window.getAssignedProjectCodes?.();
        let scopedMRFs = allMRFs;
        if (assignedCodes !== null) {
            scopedMRFs = allMRFs.filter(mrf =>
                // Defensively include legacy MRFs that lack project_code (pre-Phase-4 data)
                !mrf.project_code || assignedCodes.includes(mrf.project_code)
            );
        }

        // Separate by request type
        const materialMRFs = scopedMRFs.filter(m => m.request_type !== 'service');
        const transportMRFs = scopedMRFs.filter(m => m.request_type === 'service');

        // Sort by date_needed (nearest deadline first)
        const sortByDeadline = (a, b) => {
            const dateA = new Date(a.date_needed);
            const dateB = new Date(b.date_needed);
            return dateA - dateB;
        };

        materialMRFs.sort(sortByDeadline);
        transportMRFs.sort(sortByDeadline);

        renderMRFList(materialMRFs, transportMRFs);
    }, (error) => {
        console.error('  MRF listener error:', error);
        showToast('Error loading MRFs: ' + error.message, 'error');
    });

    listeners.push(listener);
};

/**
 * Load rejected TRs that belong to an MRF (to display in Pending Transportation panel).
 * These are TRs with finance_status='Rejected' that have an mrf_id set.
 * After Plan 60-01, Finance rejection no longer cascades to MRF status,
 * so rejected TRs must surface here independently.
 */
async function loadRejectedTRs() {
    const trsRef = collection(db, 'transport_requests');
    const q = query(trsRef, where('finance_status', '==', 'Rejected'));

    const listener = onSnapshot(q, (snapshot) => {
        const rejected = [];
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            // Only show TRs that belong to an MRF (mrf_id set)
            // Standalone TRs (no mrf_id) are handled via their own service-MRF flow
            if (data.mrf_id) {
                rejected.push({ id: docSnap.id, ...data });
            }
        });
        cachedRejectedTRs = rejected;
        // Re-render the MRF list to refresh the rejected TR panel
        reFilterAndRenderMRFs();
    }, (error) => {
        console.error('[Procurement] Rejected TR listener error:', error);
    });

    listeners.push(listener);
}

/**
 * Re-apply the assignment filter and re-render MRF list.
 * Uses cachedAllMRFs (set by the loadMRFs onSnapshot callback) so we do not
 * create duplicate Firestore listeners.
 */
function reFilterAndRenderMRFs() {
    const assignedCodes = window.getAssignedProjectCodes?.();
    let scopedMRFs = cachedAllMRFs;
    if (assignedCodes !== null) {
        scopedMRFs = cachedAllMRFs.filter(mrf =>
            !mrf.project_code || assignedCodes.includes(mrf.project_code)
        );
    }

    const materialMRFs = scopedMRFs.filter(m => m.request_type !== 'service');
    const transportMRFs = scopedMRFs.filter(m => m.request_type === 'service');

    const sortByDeadline = (a, b) => {
        const dateA = new Date(a.date_needed);
        const dateB = new Date(b.date_needed);
        return dateA - dateB;
    };

    materialMRFs.sort(sortByDeadline);
    transportMRFs.sort(sortByDeadline);

    renderMRFList(materialMRFs, transportMRFs);
}

/**
 * Render MRF list
 */
function renderMRFList(materialMRFs, transportMRFs) {
    const mrfList = document.getElementById('mrfList');
    if (!mrfList) {
        console.error('❌ mrfList element not found!');
        return;
    }

    // Split rejected MRFs out of incoming arrays so pending sections stay clean
    const isRejectedStatus = (s) => s === 'Rejected' || s === 'PR Rejected' || s === 'TR Rejected' || s === 'Finance Rejected';

    const pendingMaterialMRFs = materialMRFs.filter(m => !isRejectedStatus(m.status));
    const rejectedMaterialMRFs = materialMRFs.filter(m => isRejectedStatus(m.status));

    const pendingTransportMRFs = transportMRFs.filter(m => !isRejectedStatus(m.status));
    const rejectedTransportMRFs = transportMRFs.filter(m => isRejectedStatus(m.status));

    const allRejectedMRFs = [...rejectedMaterialMRFs, ...rejectedTransportMRFs];

    let html = '';

    // Material Requests Section (pending only)
    html += '<div style="font-weight: 600; padding: 0.5rem; background: #f8f9fa; border-radius: 4px; margin-bottom: 0.5rem;">Material Requests</div>';

    if (pendingMaterialMRFs.length === 0) {
        html += '<div style="text-align: center; padding: 1rem; color: #999; font-size: 0.875rem;">No pending material requests</div>';
    } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        html += pendingMaterialMRFs.map(mrf => {
        const dateNeeded = new Date(mrf.date_needed);
        dateNeeded.setHours(0, 0, 0, 0);
        const daysRemaining = Math.ceil((dateNeeded - today) / (1000 * 60 * 60 * 24));

        let urgencyColor, urgencyBg;
        if (daysRemaining <= 3) {
            urgencyColor = '#dc2626';
            urgencyBg = '#fee2e2';
        } else if (daysRemaining <= 10) {
            urgencyColor = '#f59e0b';
            urgencyBg = '#fef3c7';
        } else {
            urgencyColor = '#059669';
            urgencyBg = '#d1fae5';
        }

        const urgencyLevelColor = mrf.urgency_level === 'Critical' ? '#dc2626' :
                                  mrf.urgency_level === 'High' ? '#ef4444' :
                                  mrf.urgency_level === 'Medium' ? '#f59e0b' : '#22c55e';
        const urgencyLevelBg = mrf.urgency_level === 'Critical' ? '#fef2f2' :
                               mrf.urgency_level === 'High' ? '#fef2f2' :
                               mrf.urgency_level === 'Medium' ? '#fef3c7' : '#dcfce7';

        return `
            <div class="mrf-item" data-mrf-id="${mrf.id}" onclick="window.selectMRF('${mrf.id}', this)"
                 style="border-left: 4px solid ${urgencyLevelColor};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                    <span style="font-weight: 600;">${escapeHTML(mrf.mrf_id)}</span>
                    <span style="background: ${urgencyLevelBg}; color: ${urgencyLevelColor}; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">
                        ${escapeHTML(mrf.urgency_level || 'Low')}
                    </span>
                </div>
                <div style="font-size: 0.875rem; color: #5f6368;">${escapeHTML(getMRFLabel(mrf))}</div>
                <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.75rem;">
                    <span style="color: #999;">Needed: ${new Date(mrf.date_needed).toLocaleDateString()}</span>
                    <span style="background: ${urgencyBg}; color: ${urgencyColor}; padding: 0.125rem 0.5rem; border-radius: 4px; font-weight: 600;">
                        ${daysRemaining} days
                    </span>
                </div>
            </div>
        `;
    }).join('');
    }

    // Transport Requests Section (pending only)
    html += '<div style="font-weight: 600; padding: 0.5rem; background: #fef3c7; border-radius: 4px; margin: 1rem 0 0.5rem 0;">Pending Transportation Requests</div>';

    if (pendingTransportMRFs.length === 0) {
        html += '<div style="text-align: center; padding: 1rem; color: #999; font-size: 0.875rem;">No pending transport requests</div>';
    } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        html += pendingTransportMRFs.map(mrf => {
            const dateNeeded = new Date(mrf.date_needed);
            dateNeeded.setHours(0, 0, 0, 0);
            const daysRemaining = Math.ceil((dateNeeded - today) / (1000 * 60 * 60 * 24));

            let urgencyColor = '#f59e0b';
            let urgencyBg = '#fef3c7';

            const urgencyLevelColor = mrf.urgency_level === 'Critical' ? '#dc2626' :
                                      mrf.urgency_level === 'High' ? '#ef4444' :
                                      mrf.urgency_level === 'Medium' ? '#f59e0b' : '#22c55e';
            const urgencyLevelBg = mrf.urgency_level === 'Critical' ? '#fef2f2' :
                                   mrf.urgency_level === 'High' ? '#fef2f2' :
                                   mrf.urgency_level === 'Medium' ? '#fef3c7' : '#dcfce7';

            return `
                <div class="mrf-item" data-mrf-id="${mrf.id}" onclick="window.selectMRF('${mrf.id}', this)"
                     style="border-left: 4px solid ${urgencyLevelColor};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                        <span style="font-weight: 600;">${escapeHTML(mrf.mrf_id)}</span>
                        <span style="background: ${urgencyLevelBg}; color: ${urgencyLevelColor}; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">
                            ${escapeHTML(mrf.urgency_level || 'Low')}
                        </span>
                    </div>
                    <div style="font-size: 0.875rem; color: #5f6368;">${escapeHTML(getMRFLabel(mrf))}</div>
                    <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.75rem;">
                        <span style="color: #999;">Needed: ${new Date(mrf.date_needed).toLocaleDateString()}</span>
                        <span style="background: ${urgencyBg}; color: ${urgencyColor}; padding: 0.125rem 0.5rem; border-radius: 4px; font-weight: 600;">
                            ${daysRemaining} days
                        </span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Rejected MRFs section (PR Rejected, TR Rejected, Finance Rejected) -- dedicated panel
    if (allRejectedMRFs.length > 0) {
        html += '<div style="font-weight: 600; padding: 0.5rem; background: #fee2e2; border-radius: 4px; margin: 1rem 0 0.5rem 0; color: #dc2626;">Rejected MRFs</div>';
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        html += allRejectedMRFs.map(mrf => {
            const dateNeeded = new Date(mrf.date_needed);
            dateNeeded.setHours(0, 0, 0, 0);
            const daysRemaining = Math.ceil((dateNeeded - today) / (1000 * 60 * 60 * 24));

            const statusLabel = mrf.status === 'Rejected' ? 'REJECTED'
                : mrf.status === 'TR Rejected' ? 'TR REJECTED'
                : mrf.status === 'Finance Rejected' ? 'FINANCE REJECTED'
                : 'PR REJECTED';

            const urgencyLevelColor = mrf.urgency_level === 'Critical' ? '#dc2626'
                : mrf.urgency_level === 'High' ? '#ef4444'
                : mrf.urgency_level === 'Medium' ? '#f59e0b' : '#22c55e';

            return `
                <div class="mrf-item" data-mrf-id="${mrf.id}" onclick="window.selectMRF('${mrf.id}', this)"
                     style="border: 2px solid #dc2626; background: #fee2e2; border-left: 4px solid ${urgencyLevelColor};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                        <span style="font-weight: 600;">${escapeHTML(mrf.mrf_id)}</span>
                        <span style="background: #fef2f2; color: #dc2626; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">${statusLabel}</span>
                    </div>
                    <div style="font-size: 0.875rem; color: #5f6368;">${escapeHTML(getMRFLabel(mrf))}</div>
                    <div style="margin-top: 0.5rem; padding: 0.5rem; background: white; border-radius: 4px; font-size: 0.75rem; color: #dc2626;">
                        <strong>Reason:</strong> ${escapeHTML(mrf.pr_rejection_reason || mrf.rejection_reason || 'No reason provided')}
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.75rem;">
                        <span style="color: #999;">Needed: ${new Date(mrf.date_needed).toLocaleDateString()}</span>
                        <span style="background: #fee2e2; color: #dc2626; padding: 0.125rem 0.5rem; border-radius: 4px; font-weight: 600;">
                            ${daysRemaining} days
                        </span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Rejected TRs section (TRs returned from Finance, awaiting Procurement resubmission)
    if (cachedRejectedTRs.length > 0) {
        html += '<div style="font-weight: 600; padding: 0.5rem; background: #fee2e2; border-radius: 4px; margin: 1rem 0 0.5rem 0; color: #dc2626;">Rejected Transport Requests</div>';
        html += cachedRejectedTRs.map(tr => {
            const rejectionReason = tr.rejection_reason || 'No reason provided';
            const rejectedBy = tr.rejected_by || 'Finance';
            return `
                <div class="mrf-item" data-tr-id="${tr.id}" style="border: 2px solid #dc2626; background: #fee2e2; border-radius: 6px; padding: 0.75rem; margin-bottom: 0.5rem; cursor: pointer;"
                     onclick="window.selectRejectedTR('${tr.id}')">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                        <span style="font-weight: 600;">${escapeHTML(tr.tr_id)}</span>
                        <span style="background: #fef2f2; color: #dc2626; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">TR REJECTED</span>
                    </div>
                    <div style="font-size: 0.875rem; color: #5f6368;">${escapeHTML(tr.project_name || tr.mrf_id || '')}</div>
                    <div style="margin-top: 0.5rem; padding: 0.5rem; background: white; border-radius: 4px; font-size: 0.75rem; color: #dc2626;">
                        <strong>Reason:</strong> ${escapeHTML(rejectionReason)}<br>
                        <strong>Rejected by:</strong> ${escapeHTML(rejectedBy)}
                    </div>
                </div>
            `;
        }).join('');
    }

    mrfList.innerHTML = html;

    // Clear MRF details if no pending MRFs or rejected TRs
    if (materialMRFs.length === 0 && transportMRFs.length === 0 && cachedRejectedTRs.length === 0) {
        currentMRF = null;
        const mrfDetails = document.getElementById('mrfDetails');
        if (mrfDetails) {
            mrfDetails.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #999;">
                    <div style="font-size: 0.875rem; margin-top: 0.5rem;">No pending MRFs</div>
                    <div style="font-size: 0.75rem; margin-top: 0.5rem;">Select an MRF from the list to view details</div>
                </div>
            `;
        }
        // Hide Generate PR button
        const generatePRBtn = document.getElementById('generatePRBtn');
        if (generatePRBtn) {
            generatePRBtn.style.display = 'none';
        }
    }
}

/**
 * Select a rejected TR to view its details in the details panel.
 * Shows TR info inline without opening the full MRF editing form.
 */
function selectRejectedTR(trDocId) {
    const tr = cachedRejectedTRs.find(t => t.id === trDocId);
    if (!tr) return;

    // Highlight selected
    document.querySelectorAll('.mrf-item').forEach(el => el.classList.remove('selected'));
    document.querySelector(`[data-tr-id="${trDocId}"]`)?.classList.add('selected');

    const mrfDetails = document.getElementById('mrfDetails');
    if (!mrfDetails) return;

    // Hide MRF action buttons (Save Progress / Generate PR) — TR panel has its own buttons
    const mrfActionsEl = document.getElementById('mrfActions');
    if (mrfActionsEl) mrfActionsEl.innerHTML = '';

    const items = JSON.parse(tr.items_json || '[]');
    const grandTotal = items.reduce((sum, item) => sum + ((item.qty || 0) * (item.unit_cost || 0)), 0);

    const itemRowsHtml = items.map((item, index) => `
        <tr data-index="${index}">
            <td>
                <input type="text"
                       class="item-name table-input"
                       data-index="${index}"
                       value="${escapeHTML(item.item || '')}"
                       placeholder="Enter item name">
            </td>
            <td>
                <select class="item-category table-select" data-index="${index}">
                    <option value="">Select</option>
                    <option value="CIVIL" ${(item.category || '') === 'CIVIL' ? 'selected' : ''}>CIVIL</option>
                    <option value="ELECTRICAL" ${(item.category || '') === 'ELECTRICAL' ? 'selected' : ''}>ELECTRICAL</option>
                    <option value="HVAC" ${(item.category || '') === 'HVAC' ? 'selected' : ''}>HVAC</option>
                    <option value="PLUMBING" ${(item.category || '') === 'PLUMBING' ? 'selected' : ''}>PLUMBING</option>
                    <option value="TOOLS & EQUIPMENTS" ${(item.category || '') === 'TOOLS & EQUIPMENTS' ? 'selected' : ''}>TOOLS & EQUIPMENTS</option>
                    <option value="SAFETY" ${(item.category || '') === 'SAFETY' ? 'selected' : ''}>SAFETY</option>
                    <option value="SUBCON" ${(item.category || '') === 'SUBCON' ? 'selected' : ''}>SUBCON</option>
                    <option value="TRANSPORTATION" ${(item.category || '') === 'TRANSPORTATION' ? 'selected' : ''}>TRANSPORTATION</option>
                    <option value="HAULING & DELIVERY" ${(item.category || '') === 'HAULING & DELIVERY' ? 'selected' : ''}>HAULING & DELIVERY</option>
                    <option value="DELIVERY BY SUPPLIER" ${(item.category || '') === 'DELIVERY BY SUPPLIER' ? 'selected' : ''}>DELIVERY BY SUPPLIER</option>
                    <option value="OTHERS" ${(item.category || '') === 'OTHERS' ? 'selected' : ''}>OTHERS</option>
                </select>
            </td>
            <td>
                <input type="number"
                       class="item-qty table-input table-input-sm"
                       data-index="${index}"
                       value="${item.qty || ''}"
                       min="0.01" step="any"
                       placeholder="0"
                       oninput="window.calculateSubtotal(${index})">
            </td>
            <td>
                <select class="item-unit table-select" data-index="${index}">
                    <option value="">Select</option>
                    <option value="pcs" ${(item.unit || '') === 'pcs' ? 'selected' : ''}>pcs</option>
                    <option value="boxes" ${(item.unit || '') === 'boxes' ? 'selected' : ''}>boxes</option>
                    <option value="bags" ${(item.unit || '') === 'bags' ? 'selected' : ''}>bags</option>
                    <option value="lot" ${(item.unit || '') === 'lot' ? 'selected' : ''}>lot</option>
                    <option value="gallons" ${(item.unit || '') === 'gallons' ? 'selected' : ''}>gallons</option>
                    <option value="bottles" ${(item.unit || '') === 'bottles' ? 'selected' : ''}>bottles</option>
                    <option value="bundle" ${(item.unit || '') === 'bundle' ? 'selected' : ''}>bundle</option>
                    <option value="cans" ${(item.unit || '') === 'cans' ? 'selected' : ''}>cans</option>
                    <option value="trucks" ${(item.unit || '') === 'trucks' ? 'selected' : ''}>trucks</option>
                    <option value="ride" ${(item.unit || '') === 'ride' ? 'selected' : ''}>ride</option>
                    <option value="sheets" ${(item.unit || '') === 'sheets' ? 'selected' : ''}>sheets</option>
                    <option value="yards" ${(item.unit || '') === 'yards' ? 'selected' : ''}>yards</option>
                    <option value="pail" ${(item.unit || '') === 'pail' ? 'selected' : ''}>pail</option>
                    <option value="meters" ${(item.unit || '') === 'meters' ? 'selected' : ''}>meters</option>
                    <option value="kg" ${(item.unit || '') === 'kg' ? 'selected' : ''}>kg</option>
                    <option value="liters" ${(item.unit || '') === 'liters' ? 'selected' : ''}>liters</option>
                    <option value="rolls" ${(item.unit || '') === 'rolls' ? 'selected' : ''}>rolls</option>
                    <option value="sets" ${(item.unit || '') === 'sets' ? 'selected' : ''}>sets</option>
                    <option value="packs" ${(item.unit || '') === 'packs' ? 'selected' : ''}>Packs</option>
                    <option value="pairs" ${(item.unit || '') === 'pairs' ? 'selected' : ''}>pairs</option>
                    <option value="quarts" ${(item.unit || '') === 'quarts' ? 'selected' : ''}>quarts</option>
                </select>
            </td>
            <td>
                <input type="number"
                       class="unit-cost table-input table-input-cost"
                       data-index="${index}"
                       value="${item.unit_cost || ''}"
                       step="0.01"
                       placeholder="0.00"
                       oninput="window.calculateSubtotal(${index})">
            </td>
            <td>
                <select class="supplier-select table-select" data-index="${index}">
                    <option value="">Select Supplier</option>
                    ${suppliersData.map(s => `
                        <option value="${escapeHTML(s.supplier_name)}" ${s.supplier_name === item.supplier ? 'selected' : ''}>
                            ${escapeHTML(s.supplier_name)}
                        </option>
                    `).join('')}
                </select>
            </td>
            <td class="subtotal-cell" id="subtotal-${index}">
                ${((item.qty || 0) * (item.unit_cost || 0)).toLocaleString('en-PH', {minimumFractionDigits: 2})}
            </td>
            <td>
                <button type="button"
                        class="btn-delete"
                        onclick="window.deleteLineItem(${index})"
                        title="Remove item">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            </td>
        </tr>
    `).join('');

    mrfDetails.innerHTML = `
        <div style="padding: 1rem;">
            <div style="background: #fee2e2; border: 1px solid #fca5a5; border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
                <div style="font-weight: 600; color: #dc2626; margin-bottom: 0.5rem;">TR REJECTED &mdash; ${escapeHTML(tr.tr_id)}</div>
                <div style="font-size: 0.875rem;"><strong>Reason:</strong> ${escapeHTML(tr.rejection_reason || 'No reason provided')}</div>
                <div style="font-size: 0.875rem;"><strong>Rejected by:</strong> ${escapeHTML(tr.rejected_by || 'Finance')}</div>
                ${tr.rejected_at ? `<div style="font-size: 0.75rem; color: #666; margin-top: 0.25rem;">${new Date(tr.rejected_at).toLocaleString()}</div>` : ''}
            </div>
            <div style="margin-bottom: 1rem;">
                <div><strong>MRF ID:</strong> ${escapeHTML(tr.mrf_id || '')}</div>
                <div><strong>Supplier:</strong> ${escapeHTML(tr.supplier_name || '')}</div>
                <div><strong>Project:</strong> ${escapeHTML(tr.project_name || '')}</div>
            </div>
            <div class="items-table-wrapper" style="margin-bottom: 1rem;">
                <table class="items-table">
                    <thead>
                        <tr>
                            <th>Item Description</th>
                            <th>Category</th>
                            <th>Qty</th>
                            <th>Unit</th>
                            <th>Unit Cost</th>
                            <th>Supplier</th>
                            <th>Subtotal</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="lineItemsBody">
                        ${itemRowsHtml}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="7" class="total-label">Grand Total</td>
                            <td id="grandTotal" class="total-value">PHP ${grandTotal.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <div class="add-item-container">
                <button type="button" class="btn-add-item" onclick="window.addLineItem()">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="16"></line>
                        <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                    Add Line Item
                </button>
            </div>
            <div style="display: flex; gap: 0.75rem;">
                <button class="btn btn-secondary" onclick="window.saveRejectedTRChanges('${tr.id}')">
                    Save Changes
                </button>
                <button class="btn btn-primary" onclick="window.resubmitRejectedTR('${tr.id}')">
                    Resubmit to Finance
                </button>
                <button class="btn btn-danger" onclick="window.deleteRejectedTR('${tr.id}')">
                    Delete TR
                </button>
            </div>
        </div>
    `;
}

/**
 * Save edited items on a rejected TR back to Firestore.
 * Reads the editable #lineItemsBody table, writes updated items_json and total_amount,
 * and refreshes cachedRejectedTRs in-place so the list reflects the new total immediately.
 */
async function saveRejectedTRChanges(trDocId) {
    if (window.canEditTab?.('procurement') === false) {
        showToast('You do not have permission to edit procurement data', 'error');
        return;
    }

    const tr = cachedRejectedTRs.find(t => t.id === trDocId);
    if (!tr) {
        showToast('TR not found. Please refresh and try again.', 'error');
        return;
    }

    const rows = document.querySelectorAll('#lineItemsBody tr');
    const updatedItems = [];
    for (const row of rows) {
        const itemName = row.querySelector('input.item-name')?.value?.trim() || '';
        const category = row.querySelector('select.item-category')?.value || '';
        const qty      = parseFloat(row.querySelector('input.item-qty')?.value) || 0;
        const unit     = row.querySelector('select.item-unit')?.value || 'pcs';
        const unitCost = parseFloat(row.querySelector('input.unit-cost')?.value) || 0;
        const supplier = row.querySelector('select.supplier-select')?.value || '';
        if (!itemName) continue;
        updatedItems.push({ item: itemName, category, qty, unit, unit_cost: unitCost, subtotal: qty * unitCost, supplier });
    }

    if (updatedItems.length === 0) {
        showToast('At least one item is required', 'error');
        return;
    }

    const totalAmount = updatedItems.reduce((sum, i) => sum + i.subtotal, 0);

    showLoading(true);
    try {
        const trRef = doc(db, 'transport_requests', trDocId);
        await updateDoc(trRef, {
            items_json: JSON.stringify(updatedItems),
            total_amount: totalAmount
        });

        // Update cachedRejectedTRs in-place so the list panel reflects the new total
        const idx = cachedRejectedTRs.findIndex(t => t.id === trDocId);
        if (idx !== -1) {
            cachedRejectedTRs[idx] = {
                ...cachedRejectedTRs[idx],
                items_json: JSON.stringify(updatedItems),
                total_amount: totalAmount
            };
        }

        showToast('TR changes saved. Ready to resubmit.', 'success');
    } catch (error) {
        console.error('[Procurement] Error saving TR changes:', error);
        showToast('Failed to save changes: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Resubmit a rejected TR back to Finance.
 * Resets finance_status to 'Pending' on the SAME TR document (tr_id preserved).
 * Stores prior rejection in rejection_history array for audit trail.
 */
async function resubmitRejectedTR(trDocId) {
    if (window.canEditTab?.('procurement') === false) {
        showToast('You do not have permission to edit procurement data', 'error');
        return;
    }

    const tr = cachedRejectedTRs.find(t => t.id === trDocId);
    if (!tr) {
        showToast('TR not found. Please refresh and try again.', 'error');
        return;
    }

    if (!confirm(`Resubmit ${tr.tr_id} to Finance for review?`)) return;

    showLoading(true);

    try {
        const trRef = doc(db, 'transport_requests', trDocId);

        // Build rejection history entry from current rejection data
        const historyEntry = {
            reason: tr.rejection_reason || '',
            rejected_by: tr.rejected_by || 'Finance',
            rejected_at: tr.rejected_at || new Date().toISOString()
        };

        // Read existing history if any
        const existingHistory = Array.isArray(tr.rejection_history) ? tr.rejection_history : [];

        await updateDoc(trRef, {
            finance_status: 'Pending',
            // Move current rejection into history array for full audit trail
            rejection_history: [...existingHistory, historyEntry],
            resubmitted_at: new Date().toISOString(),
            resubmitted_by: window.getCurrentUser?.()?.full_name || window.getCurrentUser?.()?.email || 'Procurement',
            updated_at: new Date().toISOString()
        });

        showToast(`${tr.tr_id} resubmitted to Finance successfully`, 'success');

        // Clear detail panel
        const mrfDetails = document.getElementById('mrfDetails');
        if (mrfDetails) {
            mrfDetails.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #666;">
                    <div style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">TR Resubmitted</div>
                    <div style="font-size: 0.875rem; margin-top: 0.5rem;">Transport Request sent back to Finance for review.</div>
                </div>
            `;
        }
    } catch (error) {
        console.error('[Procurement] Error resubmitting TR:', error);
        showToast('Failed to resubmit TR: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Permanently delete a Finance-rejected TR from Firestore.
 * Requires confirmation. Splices from cachedRejectedTRs and re-renders list.
 */
async function deleteRejectedTR(trDocId) {
    if (!confirm('Delete this rejected TR permanently? This cannot be undone.')) return;
    try {
        await deleteDoc(doc(db, 'transport_requests', trDocId));
        cachedRejectedTRs = cachedRejectedTRs.filter(tr => tr.id !== trDocId);
        reFilterAndRenderMRFs();
        showToast('TR deleted.', 'success');
    } catch (err) {
        console.error('[Procurement] deleteRejectedTR error:', err);
        showToast('Failed to delete TR: ' + err.message, 'error');
    }
}

/**
 * Create new MRF
 */
function createNewMRF() {
    if (window.canEditTab?.('procurement') === false) {
        showToast('You do not have permission to edit procurement data', 'error');
        return;
    }

    // Clear selection from MRF list
    document.querySelectorAll('.mrf-item').forEach(el => el.classList.remove('selected'));

    // Create a new empty MRF object
    currentMRF = {
        id: null, // null ID indicates this is a new MRF
        mrf_id: 'NEW', // Temporary ID
        request_type: 'material',
        urgency_level: 'Low',
        project_name: '',
        requestor_name: window.getCurrentUser?.()?.full_name || '',
        date_needed: '',
        delivery_address: '',
        items_json: JSON.stringify([{item: '', qty: 1, unit: '', category: '', unit_cost: 0, supplier: ''}]),
        status: 'Pending'
    };

    renderMRFDetails(currentMRF, true); // true indicates this is a new MRF

    // Mobile split-panel: reveal detail card so user can fill in the form
    const grid = document.querySelector('.dashboard-grid');
    if (grid) grid.classList.add('mrf-selected');
};

/**
 * Select MRF
 */
async function selectMRF(mrfId, element) {
    const mrfsRef = collection(db, 'mrfs');
    const snapshot = await getDocs(mrfsRef);

    snapshot.forEach((doc) => {
        if (doc.id === mrfId) {
            currentMRF = { id: doc.id, ...doc.data() };
        }
    });

    if (currentMRF) {
        renderMRFDetails(currentMRF, false); // false indicates this is an existing MRF

        // Update selected state
        document.querySelectorAll('.mrf-item').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');

        // Mobile split-panel: reveal detail card and auto-scroll to it
        if (window.innerWidth <= 768) {
            const grid = document.querySelector('.dashboard-grid');
            if (grid) {
                grid.classList.add('mrf-selected');
                // Smooth scroll to detail card (second child)
                const detailCard = grid.querySelector('.card:nth-child(2)');
                if (detailCard) {
                    detailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        }
    }
};

/**
 * Render MRF details
 */
function renderMRFDetails(mrf, isNew = false) {
    const items = JSON.parse(mrf.items_json);

    // Only update action buttons if the mrfActions container exists (hidden for view-only users)
    const mrfActionsEl = document.getElementById('mrfActions');

    // Show correct button based on whether it's new or existing
    if (isNew) {
        // For new MRFs, only show Save button
        if (mrfActionsEl) {
            let buttons = '<button class="btn btn-primary" onclick="window.saveNewMRF()">💾 Save New MRF</button>';
            mrfActionsEl.innerHTML = buttons;
        }
    } else {
        // For existing MRFs, show normal buttons
        if (mrfActionsEl) {
            const isService = mrf.request_type === 'service';
            const canEdit = mrf.status === 'Pending' || mrf.status === 'In Progress' || mrf.status === 'PR Rejected';

            let buttons = '<button class="btn btn-primary" onclick="window.saveProgress()">💾 Save</button>';
            if (canEdit) {
                if (isService) {
                    buttons += ' <button class="btn btn-success" onclick="window.submitTransportRequest()">📄 Submit to Finance</button>';
                } else {
                    buttons += ' <button class="btn btn-success" onclick="window.generatePR()">📄 Generate PR</button>';
                }
            }
            // Add reject button for procurement to soft-reject unnecessary requests
            buttons += ' <button class="btn btn-danger" onclick="window.rejectMRF()" style="margin-left: 0.5rem;">&#10005; Reject MRF</button>';
            mrfActionsEl.innerHTML = buttons;
        }
    }

    const requestTypeLabel = mrf.request_type === 'service' ?
        'Delivery/Hauling/Transportation' : 'Material Request';

    // Build project options for unified dropdown
    const projectOptions = projectsData.map(p =>
        `<option value="${escapeHTML(p.project_code)}" data-type="project" data-name="${escapeHTML(p.project_name)}">${p.project_code ? escapeHTML(p.project_code) + ' - ' : ''}${escapeHTML(p.project_name)}</option>`
    ).join('');

    // Build service options for unified dropdown
    const serviceOptions = cachedServicesForNewMRF.map(s =>
        `<option value="${escapeHTML(s.service_code)}" data-type="service" data-name="${escapeHTML(s.service_name)}">${escapeHTML(s.service_code)} - ${escapeHTML(s.service_name)}</option>`
    ).join('');

    const details = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 2rem;">
            <div>
                <div style="font-size: 0.75rem; color: #5f6368;">MRF ID</div>
                <div style="font-weight: 600;">${isNew ? '(Will be auto-generated)' : mrf.mrf_id}</div>
            </div>
            <div>
                <div style="font-size: 0.75rem; color: #5f6368;">Request Type</div>
                ${isNew ? `
                    <select id="requestType" style="width: 100%; padding: 0.5rem; border: 2px solid #dadce0; border-radius: 4px; background-color: #ffffff; font-family: inherit;">
                        <option value="material" ${mrf.request_type === 'material' ? 'selected' : ''}>Material Request</option>
                        <option value="service" ${mrf.request_type === 'service' ? 'selected' : ''}>Delivery/Hauling/Transportation</option>
                    </select>
                ` : `<div style="font-weight: 600;">${escapeHTML(requestTypeLabel)}</div>`}
            </div>
            <div style="grid-column: 1 / -1;">
                <div style="font-size: 0.75rem; color: #5f6368;">Project / Service *</div>
                ${isNew ? `
                    <select id="projectServiceSelect" style="width: 100%; padding: 0.5rem; border: 2px solid #dadce0; border-radius: 4px; background-color: #ffffff; font-family: inherit; transition: all 0.2s;" onfocus="this.style.borderColor='#1a73e8'; this.style.backgroundColor='#f8fbff';" onblur="this.style.borderColor='#dadce0'; this.style.backgroundColor='#ffffff';">
                        <option value="">-- Select a project or service --</option>
                        <optgroup label="Projects">${projectOptions}</optgroup>
                        <optgroup label="Services">${serviceOptions}</optgroup>
                    </select>
                ` : `<div style="font-weight: 600;">${escapeHTML(getMRFLabel(mrf))}</div>`}
            </div>
            <div>
                <div style="font-size: 0.75rem; color: #5f6368;">Requestor *</div>
                ${isNew ? `
                    <input type="text" id="requestorName" value="${escapeHTML(mrf.requestor_name || '')}" required style="width: 100%; padding: 0.5rem; border: 2px solid #dadce0; border-radius: 4px; background-color: #ffffff; font-family: inherit; transition: all 0.2s;" onfocus="this.style.borderColor='#1a73e8'; this.style.backgroundColor='#f8fbff';" onblur="this.style.borderColor='#dadce0'; this.style.backgroundColor='#ffffff';" placeholder="Enter requestor name">
                ` : `<div>${escapeHTML(mrf.requestor_name)}</div>`}
            </div>
            <div>
                <div style="font-size: 0.75rem; color: #5f6368;">Date Needed *</div>
                ${isNew ? `
                    <input type="date" id="dateNeeded" value="${mrf.date_needed || ''}" required min="${new Date().toISOString().split('T')[0]}" style="width: 100%; padding: 0.5rem; border: 2px solid #dadce0; border-radius: 4px; background-color: #ffffff; font-family: inherit; transition: all 0.2s;" onfocus="this.style.borderColor='#1a73e8'; this.style.backgroundColor='#f8fbff';" onblur="this.style.borderColor='#dadce0'; this.style.backgroundColor='#ffffff';">
                ` : `<div>${new Date(mrf.date_needed).toLocaleDateString()}</div>`}
            </div>
            <div>
                <div style="font-size: 0.75rem; color: #5f6368;">Status</div>
                <div>${mrf.status}</div>
            </div>
            <div>
                <div style="font-size: 0.75rem; color: #5f6368;">Urgency Level *</div>
                ${isNew ? `
                    <select id="urgencyLevel" style="width: 100%; padding: 0.5rem; border: 2px solid #dadce0; border-radius: 4px; background-color: #ffffff; font-family: inherit; transition: all 0.2s;" onfocus="this.style.borderColor='#1a73e8'; this.style.backgroundColor='#f8fbff';" onblur="this.style.borderColor='#dadce0'; this.style.backgroundColor='#ffffff';">
                        <option value="Low" ${(mrf.urgency_level || 'Low') === 'Low' ? 'selected' : ''}>Low</option>
                        <option value="Medium" ${mrf.urgency_level === 'Medium' ? 'selected' : ''}>Medium</option>
                        <option value="High" ${mrf.urgency_level === 'High' ? 'selected' : ''}>High</option>
                        <option value="Critical" ${mrf.urgency_level === 'Critical' ? 'selected' : ''}>Critical</option>
                    </select>
                ` : `
                    <div style="font-weight: 600; color: ${
                        mrf.urgency_level === 'Critical' ? '#dc2626' :
                        mrf.urgency_level === 'High' ? '#ef4444' :
                        mrf.urgency_level === 'Medium' ? '#f59e0b' : '#22c55e'
                    };">${mrf.urgency_level || 'Low'}</div>
                `}
            </div>
        </div>

        <div style="margin-bottom: 1rem;">
            <label style="font-size: 0.875rem; font-weight: 500; display: block; margin-bottom: 0.5rem;">Delivery Address</label>
            <textarea id="deliveryAddress" rows="2" style="width: 100%; padding: 0.5rem; border: 2px solid #dadce0; border-radius: 4px; resize: none; background-color: #ffffff; font-family: inherit; transition: all 0.2s;" onfocus="this.style.borderColor='#1a73e8'; this.style.backgroundColor='#f8fbff';" onblur="this.style.borderColor='#dadce0'; this.style.backgroundColor='#ffffff';">${escapeHTML(mrf.delivery_address || '')}</textarea>
        </div>

        <div class="items-table-container">
            <div class="items-table-header">
                <h4>ITEMS TABLE</h4>
                <span class="item-count">${items.length} item${items.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="items-table-wrapper">
            <table class="items-table" id="lineItemsTable">
                <thead>
                    <tr>
                        <th>Item Description</th>
                        <th>Category</th>
                        <th>Qty</th>
                        <th>Unit</th>
                        <th>Unit Cost</th>
                        <th>Supplier</th>
                        <th>Subtotal</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="lineItemsBody">
                    ${items.map((item, index) => `
                        <tr data-index="${index}">
                            <td>
                                <input type="text"
                                       class="item-name table-input"
                                       data-index="${index}"
                                       value="${escapeHTML(item.item || item.item_name || '')}"
                                       placeholder="Enter item name">
                            </td>
                            <td>
                                <select class="item-category table-select" data-index="${index}" onchange="window.updateActionButtons()">
                                    <option value="">Select</option>
                                    <option value="CIVIL" ${(item.category || '') === 'CIVIL' ? 'selected' : ''}>CIVIL</option>
                                    <option value="ELECTRICAL" ${(item.category || '') === 'ELECTRICAL' ? 'selected' : ''}>ELECTRICAL</option>
                                    <option value="HVAC" ${(item.category || '') === 'HVAC' ? 'selected' : ''}>HVAC</option>
                                    <option value="PLUMBING" ${(item.category || '') === 'PLUMBING' ? 'selected' : ''}>PLUMBING</option>
                                    <option value="TOOLS & EQUIPMENTS" ${(item.category || '') === 'TOOLS & EQUIPMENTS' ? 'selected' : ''}>TOOLS & EQUIPMENTS</option>
                                    <option value="SAFETY" ${(item.category || '') === 'SAFETY' ? 'selected' : ''}>SAFETY</option>
                                    <option value="SUBCON" ${(item.category || '') === 'SUBCON' ? 'selected' : ''}>SUBCON</option>
                                    <option value="TRANSPORTATION" ${(item.category || '') === 'TRANSPORTATION' ? 'selected' : ''}>TRANSPORTATION</option>
                                    <option value="HAULING & DELIVERY" ${(item.category || '') === 'HAULING & DELIVERY' ? 'selected' : ''}>HAULING & DELIVERY</option>
                                    <option value="DELIVERY BY SUPPLIER" ${(item.category || '') === 'DELIVERY BY SUPPLIER' ? 'selected' : ''}>DELIVERY BY SUPPLIER</option>
                                    <option value="OTHERS" ${(item.category || '') === 'OTHERS' ? 'selected' : ''}>OTHERS</option>
                                </select>
                            </td>
                            <td>
                                <input type="number"
                                       class="item-qty table-input table-input-sm"
                                       data-index="${index}"
                                       value="${item.qty || item.quantity || ''}"
                                       min="0.01" step="any"
                                       placeholder="0"
                                       oninput="window.calculateSubtotal(${index})">
                            </td>
                            <td>
                                <select class="item-unit table-select" data-index="${index}">
                                    <option value="">Select</option>
                                    <option value="pcs" ${(item.unit || '') === 'pcs' ? 'selected' : ''}>pcs</option>
                                    <option value="boxes" ${(item.unit || '') === 'boxes' ? 'selected' : ''}>boxes</option>
                                    <option value="bags" ${(item.unit || '') === 'bags' ? 'selected' : ''}>bags</option>
                                    <option value="lot" ${(item.unit || '') === 'lot' ? 'selected' : ''}>lot</option>
                                    <option value="gallons" ${(item.unit || '') === 'gallons' ? 'selected' : ''}>gallons</option>
                                    <option value="bottles" ${(item.unit || '') === 'bottles' ? 'selected' : ''}>bottles</option>
                                    <option value="bundle" ${(item.unit || '') === 'bundle' ? 'selected' : ''}>bundle</option>
                                    <option value="cans" ${(item.unit || '') === 'cans' ? 'selected' : ''}>cans</option>
                                    <option value="trucks" ${(item.unit || '') === 'trucks' ? 'selected' : ''}>trucks</option>
                                    <option value="ride" ${(item.unit || '') === 'ride' ? 'selected' : ''}>ride</option>
                                    <option value="sheets" ${(item.unit || '') === 'sheets' ? 'selected' : ''}>sheets</option>
                                    <option value="yards" ${(item.unit || '') === 'yards' ? 'selected' : ''}>yards</option>
                                    <option value="pail" ${(item.unit || '') === 'pail' ? 'selected' : ''}>pail</option>
                                    <option value="meters" ${(item.unit || '') === 'meters' ? 'selected' : ''}>meters</option>
                                    <option value="kg" ${(item.unit || '') === 'kg' ? 'selected' : ''}>kg</option>
                                    <option value="liters" ${(item.unit || '') === 'liters' ? 'selected' : ''}>liters</option>
                                    <option value="rolls" ${(item.unit || '') === 'rolls' ? 'selected' : ''}>rolls</option>
                                    <option value="sets" ${(item.unit || '') === 'sets' ? 'selected' : ''}>sets</option>
                                    <option value="packs" ${(item.unit || '') === 'packs' ? 'selected' : ''}>Packs</option>
                                    <option value="pairs" ${(item.unit || '') === 'pairs' ? 'selected' : ''}>pairs</option>
                                    <option value="quarts" ${(item.unit || '') === 'quarts' ? 'selected' : ''}>quarts</option>
                                </select>
                            </td>
                            <td>
                                <input type="number"
                                       class="unit-cost table-input table-input-cost"
                                       data-index="${index}"
                                       value="${item.unit_cost || ''}"
                                       step="0.01"
                                       placeholder="0.00"
                                       oninput="window.calculateSubtotal(${index})">
                            </td>
                            <td>
                                <select class="supplier-select table-select" data-index="${index}">
                                    <option value="">Select Supplier</option>
                                    ${suppliersData.map(s => `
                                        <option value="${escapeHTML(s.supplier_name)}" ${s.supplier_name === item.supplier ? 'selected' : ''}>
                                            ${escapeHTML(s.supplier_name)}
                                        </option>
                                    `).join('')}
                                </select>
                            </td>
                            <td class="subtotal-cell" id="subtotal-${index}">
                                ${((item.qty || item.quantity || 0) * (item.unit_cost || 0)).toLocaleString('en-PH', {minimumFractionDigits: 2})}
                            </td>
                            <td>
                                <button type="button"
                                        class="btn-delete"
                                        onclick="window.deleteLineItem(${index})"
                                        title="Remove item">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M3 6h18"></path>
                                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                        <line x1="10" y1="11" x2="10" y2="17"></line>
                                        <line x1="14" y1="11" x2="14" y2="17"></line>
                                    </svg>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="6" class="total-label">Grand Total</td>
                        <td id="grandTotal" class="total-value">PHP 0.00</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
            </div>
            <div class="add-item-container">
                <button type="button" class="btn-add-item" onclick="window.addLineItem()">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="16"></line>
                        <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                    Add Line Item
                </button>
            </div>
        </div>
    `;

    document.getElementById('mrfDetails').innerHTML = details;
    calculateGrandTotal();
    // Update buttons based on actual item categories (auto-detect transport items)
    window.updateActionButtons();
}

// ========================================
// LINE ITEMS MANAGEMENT
// ========================================

/**
 * Calculate subtotal for a line item
 */
function calculateSubtotal(index) {
    const qtyInput = document.querySelector(`input.item-qty[data-index="${index}"]`);
    const unitCostInput = document.querySelector(`input.unit-cost[data-index="${index}"]`);
    const qty = parseFloat(qtyInput?.value) || 0;
    const unitCost = parseFloat(unitCostInput?.value) || 0;
    const subtotal = qty * unitCost;

    const subtotalCell = document.getElementById(`subtotal-${index}`);
    if (subtotalCell) {
        subtotalCell.textContent = `${subtotal.toLocaleString('en-PH', {minimumFractionDigits: 2})}`;
    }
    calculateGrandTotal();
};

/**
 * Calculate grand total
 */
function calculateGrandTotal() {
    let total = 0;

    const rows = document.querySelectorAll('#lineItemsBody tr');
    rows.forEach((row, index) => {
        const qtyInput = row.querySelector('input.item-qty');
        const unitCostInput = row.querySelector('input.unit-cost');
        const qty = parseFloat(qtyInput?.value) || 0;
        const unitCost = parseFloat(unitCostInput?.value) || 0;
        total += qty * unitCost;
    });

    const grandTotalEl = document.getElementById('grandTotal');
    if (grandTotalEl) {
        grandTotalEl.textContent = `PHP ${total.toLocaleString('en-PH', {minimumFractionDigits: 2})}`;
    }
}

/**
 * Update action buttons based on item categories
 */
function updateActionButtons() {
    if (!currentMRF) return;

    // Don't update buttons for new MRFs - they have their own button
    if (currentMRF.id === null) return;

    const rows = document.querySelectorAll('#lineItemsBody tr');
    const transportCategories = ['TRANSPORTATION', 'HAULING & DELIVERY'];
    let hasTransport = false;
    let hasNonTransport = false;
    let hasItems = rows.length > 0;

    rows.forEach(row => {
        const category = row.querySelector('select.item-category')?.value || '';
        if (transportCategories.includes(category)) {
            hasTransport = true;
        } else if (category) {
            hasNonTransport = true;
        }
    });

    const canEdit = currentMRF.status === 'Pending' || currentMRF.status === 'In Progress' || currentMRF.status === 'PR Rejected';
    let buttons = '<button class="btn btn-primary" onclick="window.saveProgress()">💾 Save</button>';

    if (canEdit && hasItems) {
        if (hasTransport && hasNonTransport) {
            // Mixed items: single unified button for both PR and TR
            buttons += ' <button class="btn btn-success" onclick="window.generatePRandTR()">📄 Generate PR & TR</button>';
        } else if (hasNonTransport) {
            // Only PR items
            buttons += ' <button class="btn btn-success" onclick="window.generatePR()">📄 Generate PR</button>';
        } else if (hasTransport) {
            // Only TR items
            buttons += ' <button class="btn btn-info" onclick="window.submitTransportRequest()">📄 Submit as TR</button>';
        }
    }

    // Add reject button for procurement to soft-reject unnecessary requests
    buttons += ' <button class="btn btn-danger" onclick="window.rejectMRF()" style="margin-left: 0.5rem;">&#10005; Reject MRF</button>';

    // Only update if container exists (hidden for view-only users)
    const mrfActionsEl = document.getElementById('mrfActions');
    if (mrfActionsEl) {
        mrfActionsEl.innerHTML = buttons;
    }
};

/**
 * Add new line item
 */
function addLineItem() {
    const tbody = document.getElementById('lineItemsBody');
    if (!tbody) return;

    const currentRowCount = tbody.querySelectorAll('tr').length;
    const newIndex = currentRowCount;

    const newRow = document.createElement('tr');
    newRow.setAttribute('data-index', newIndex);
    newRow.innerHTML = `
        <td>
            <input type="text"
                   class="item-name table-input"
                   data-index="${newIndex}"
                   value=""
                   placeholder="Enter item name">
        </td>
        <td>
            <select class="item-category table-select" data-index="${newIndex}" onchange="window.updateActionButtons()">
                <option value="">Select</option>
                <option value="CIVIL">CIVIL</option>
                <option value="ELECTRICAL">ELECTRICAL</option>
                <option value="HVAC">HVAC</option>
                <option value="PLUMBING">PLUMBING</option>
                <option value="TOOLS & EQUIPMENTS">TOOLS & EQUIPMENTS</option>
                <option value="SAFETY">SAFETY</option>
                <option value="SUBCON">SUBCON</option>
                <option value="TRANSPORTATION">TRANSPORTATION</option>
                <option value="HAULING & DELIVERY">HAULING & DELIVERY</option>
                <option value="DELIVERY BY SUPPLIER">DELIVERY BY SUPPLIER</option>
                <option value="OTHERS">OTHERS</option>
            </select>
        </td>
        <td>
            <input type="number"
                   class="item-qty table-input table-input-sm"
                   data-index="${newIndex}"
                   value=""
                   min="0.01" step="any"
                   placeholder="0"
                   oninput="window.calculateSubtotal(${newIndex})">
        </td>
        <td>
            <select class="item-unit table-select" data-index="${newIndex}">
                <option value="">Select</option>
                <option value="pcs">pcs</option>
                <option value="boxes">boxes</option>
                <option value="bags">bags</option>
                <option value="lot">lot</option>
                <option value="gallons">gallons</option>
                <option value="bottles">bottles</option>
                <option value="bundle">bundle</option>
                <option value="cans">cans</option>
                <option value="trucks">trucks</option>
                <option value="ride">ride</option>
                <option value="sheets">sheets</option>
                <option value="yards">yards</option>
                <option value="pail">pail</option>
                <option value="meters">meters</option>
                <option value="kg">kg</option>
                <option value="liters">liters</option>
                <option value="rolls">rolls</option>
                <option value="sets">sets</option>
                <option value="packs">Packs</option>
                <option value="pairs">pairs</option>
                <option value="quarts">quarts</option>
            </select>
        </td>
        <td>
            <input type="number"
                   class="unit-cost table-input table-input-cost"
                   data-index="${newIndex}"
                   value=""
                   step="0.01"
                   placeholder="0.00"
                   oninput="window.calculateSubtotal(${newIndex})">
        </td>
        <td>
            <select class="supplier-select table-select" data-index="${newIndex}">
                <option value="">Select Supplier</option>
                ${suppliersData.map(s => `
                    <option value="${escapeHTML(s.supplier_name)}">${escapeHTML(s.supplier_name)}</option>
                `).join('')}
            </select>
        </td>
        <td class="subtotal-cell" id="subtotal-${newIndex}">
            PHP 0.00
        </td>
        <td>
            <button type="button"
                    class="btn-delete"
                    onclick="window.deleteLineItem(${newIndex})"
                    title="Remove item">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"></path>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </button>
        </td>
    `;

    tbody.appendChild(newRow);
    updateItemCount();
    window.updateActionButtons();
    showToast('New line item added', 'success');
};

/**
 * Update item count in header
 */
function updateItemCount() {
    const tbody = document.getElementById('lineItemsBody');
    const count = tbody ? tbody.querySelectorAll('tr').length : 0;
    const itemCountEl = document.querySelector('.items-table-header .item-count');
    if (itemCountEl) {
        itemCountEl.textContent = `${count} item${count !== 1 ? 's' : ''}`;
    }
}

/**
 * Delete line item
 */
function deleteLineItem(index) {
    const tbody = document.getElementById('lineItemsBody');
    const rows = tbody.querySelectorAll('tr');

    if (rows.length <= 1) {
        showToast('Cannot delete the last item. At least one item is required.', 'error');
        return;
    }

    // Find and remove the row with the matching data-index
    const rowToDelete = tbody.querySelector(`tr[data-index="${index}"]`);
    if (rowToDelete) {
        rowToDelete.remove();

        // Re-index remaining rows
        const remainingRows = tbody.querySelectorAll('tr');
        remainingRows.forEach((row, newIndex) => {
            row.setAttribute('data-index', newIndex);

            // Update all data-index attributes and oninput handlers
            row.querySelector('input.item-name').setAttribute('data-index', newIndex);
            row.querySelector('select.item-category').setAttribute('data-index', newIndex);

            const qtyInput = row.querySelector('input.item-qty');
            qtyInput.setAttribute('data-index', newIndex);
            qtyInput.setAttribute('oninput', `window.calculateSubtotal(${newIndex})`);

            row.querySelector('select.item-unit').setAttribute('data-index', newIndex);

            const unitCostInput = row.querySelector('input.unit-cost');
            unitCostInput.setAttribute('data-index', newIndex);
            unitCostInput.setAttribute('oninput', `window.calculateSubtotal(${newIndex})`);

            row.querySelector('select.supplier-select').setAttribute('data-index', newIndex);

            const subtotalCell = row.querySelector('.subtotal-cell');
            subtotalCell.setAttribute('id', `subtotal-${newIndex}`);

            const deleteBtn = row.querySelector('button.btn-delete');
            deleteBtn.setAttribute('onclick', `window.deleteLineItem(${newIndex})`);
        });

        calculateGrandTotal();
        updateItemCount();
        window.updateActionButtons();
        showToast('Line item deleted', 'success');
    }
};

// ========================================
// MRF SAVE & DELETE OPERATIONS
// ========================================

/**
 * Save new MRF
 */
async function saveNewMRF() {
    if (window.canEditTab?.('procurement') === false) {
        showToast('You do not have permission to edit procurement data', 'error');
        return;
    }

    if (!currentMRF || currentMRF.id !== null) {
        showToast('This is not a new MRF', 'error');
        return;
    }

    // Collect form data
    const requestType = document.getElementById('requestType')?.value || 'material';
    const requestorName = document.getElementById('requestorName')?.value?.trim();
    const dateNeeded = document.getElementById('dateNeeded')?.value;
    const urgencyLevel = document.getElementById('urgencyLevel')?.value || 'Low';
    const deliveryAddress = document.getElementById('deliveryAddress')?.value?.trim();

    // Read from unified project/service dropdown
    const selectEl = document.getElementById('projectServiceSelect');
    const selectedOption = selectEl?.options[selectEl?.selectedIndex];
    const selectedType = selectedOption?.dataset?.type || '';
    const selectedCode = selectEl?.value?.trim() || '';
    const selectedName = selectedOption?.dataset?.name || '';

    const hasProject = selectedType === 'project' && !!selectedCode;
    const hasService = selectedType === 'service' && !!selectedCode;
    const department = hasService ? 'services' : 'projects';
    const serviceCode = hasService ? selectedCode : '';
    const serviceName = hasService ? selectedName : '';

    // Validate: must select a project or service
    if (!hasProject && !hasService) {
        showToast('Please select a project or service', 'error');
        return;
    }

    // Find the selected project to get both code and name (only needed when project selected)
    let selectedProject = null;
    if (hasProject) {
        selectedProject = projectsData.find(p => p.project_code === selectedCode);
        if (!selectedProject) {
            showToast('Selected project not found', 'error');
            return;
        }
    }
    if (!requestorName) {
        showToast('Please enter requestor name', 'error');
        return;
    }
    if (!dateNeeded) {
        showToast('Please select date needed', 'error');
        return;
    }
    if (!deliveryAddress) {
        showToast('Please enter delivery address', 'error');
        return;
    }

    // Collect items from DOM rows
    const rows = document.querySelectorAll('#lineItemsBody tr');
    const items = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const itemName = row.querySelector('input.item-name')?.value?.trim() || '';
        const category = row.querySelector('select.item-category')?.value || '';
        const qty = parseFloat(row.querySelector('input.item-qty')?.value) || 0;
        const unit = row.querySelector('select.item-unit')?.value || '';
        const unitCost = parseFloat(row.querySelector('input.unit-cost')?.value) || 0;
        const supplier = row.querySelector('select.supplier-select')?.value || '';

        // Validate required fields
        if (!itemName) {
            showToast(`Please enter an item name for row ${i + 1}`, 'error');
            return;
        }
        if (!category) {
            showToast(`Please select a category for "${itemName}"`, 'error');
            return;
        }
        if (qty <= 0) {
            showToast(`Please enter a valid quantity for "${itemName}"`, 'error');
            return;
        }
        if (!unit) {
            showToast(`Please select a unit for "${itemName}"`, 'error');
            return;
        }

        items.push({
            item: itemName,
            category: category,
            qty: qty,
            unit: unit,
            unit_cost: unitCost,
            supplier: supplier,
            subtotal: qty * unitCost
        });
    }

    if (items.length === 0) {
        showToast('At least one item is required', 'error');
        return;
    }

    showLoading(true);

    try {
        // Generate MRF ID
        const year = new Date().getFullYear();
        const mrfsRef = collection(db, 'mrfs');
        const snapshot = await getDocs(mrfsRef);

        let maxNum = 0;
        const yearPrefix = `MRF-${year}-`;

        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.mrf_id && data.mrf_id.startsWith(yearPrefix)) {
                const match = data.mrf_id.match(/MRF-\d{4}-(\d+)/);
                if (match) {
                    const num = parseInt(match[1]);
                    if (num > maxNum) {
                        maxNum = num;
                    }
                }
            }
        });

        const mrfId = `MRF-${year}-${String(maxNum + 1).padStart(3, '0')}`;

        // Create MRF document
        const mrfDoc = {
            mrf_id: mrfId,
            request_type: requestType,
            urgency_level: urgencyLevel,
            department: department,
            project_code: hasProject ? selectedProject.project_code : '',
            project_name: hasProject ? selectedProject.project_name : '',
            service_code: hasService ? serviceCode : '',
            service_name: hasService ? serviceName : '',
            requestor_name: requestorName,
            date_needed: dateNeeded,
            date_submitted: new Date().toISOString().split('T')[0],
            delivery_address: deliveryAddress,
            items_json: JSON.stringify(items),
            status: 'Pending',
            created_at: new Date().toISOString()
        };

        // Save to Firebase
        await addDoc(mrfsRef, mrfDoc);
        _prpoRecordsCachedAt = 0; // Invalidate Records tab cache so new MRF appears immediately

        showToast(`New MRF created successfully! MRF ID: ${mrfId}`, 'success');

        // Clear the form and reset currentMRF
        currentMRF = null;
        document.getElementById('mrfDetails').innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #999;">
                <div style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem; color: #059669;">✓ MRF Created Successfully</div>
                <div style="font-size: 0.875rem; margin-top: 0.5rem;">MRF ID: ${mrfId}</div>
                <div style="font-size: 0.875rem; margin-top: 0.5rem;">Select an MRF to view details or create a new one</div>
            </div>
        `;

        // Refresh MRF list
        await window.loadMRFs();

    } catch (error) {
        console.error('Error creating new MRF:', error);
        showToast('Failed to create MRF: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
};

/**
 * Save progress
 */
async function saveProgress() {
    if (window.canEditTab?.('procurement') === false) {
        showToast('You do not have permission to edit procurement data', 'error');
        return;
    }

    if (!currentMRF) return;

    // Collect items from DOM rows (supports add/edit/delete)
    const rows = document.querySelectorAll('#lineItemsBody tr');
    const updatedItems = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const itemName = row.querySelector('input.item-name')?.value?.trim() || '';
        const category = row.querySelector('select.item-category')?.value || '';
        const qty = parseFloat(row.querySelector('input.item-qty')?.value) || 0;
        const unit = row.querySelector('select.item-unit')?.value || '';
        const unitCost = parseFloat(row.querySelector('input.unit-cost')?.value) || 0;
        const supplier = row.querySelector('select.supplier-select')?.value || '';

        // Validate required fields
        if (!itemName) {
            showToast(`Please enter an item name for row ${i + 1}`, 'error');
            return;
        }
        if (qty <= 0) {
            showToast(`Please enter a valid quantity for "${itemName}"`, 'error');
            return;
        }

        updatedItems.push({
            item: itemName,
            category: category || 'N/A',
            qty: qty,
            unit: unit || 'pcs',
            unit_cost: unitCost,
            supplier: supplier,
            subtotal: qty * unitCost
        });
    }

    if (updatedItems.length === 0) {
        showToast('At least one item is required', 'error');
        return;
    }

    const deliveryAddress = document.getElementById('deliveryAddress').value;

    showLoading(true);

    try {
        const mrfRef = doc(db, 'mrfs', currentMRF.id);
        await updateDoc(mrfRef, {
            items_json: JSON.stringify(updatedItems),
            delivery_address: deliveryAddress,
            status: 'In Progress',
            updated_at: new Date().toISOString()
        });

        // Update local currentMRF to reflect changes
        currentMRF.items_json = JSON.stringify(updatedItems);
        currentMRF.delivery_address = deliveryAddress;

        showToast('Progress saved successfully', 'success');
    } catch (error) {
        console.error('Error saving progress:', error);
        showToast('Failed to save progress', 'error');
    } finally {
        showLoading(false);
    }
};

/**
 * Delete MRF - allows procurement to delete unnecessary requests
 */
async function deleteMRF() {
    if (window.canEditTab?.('procurement') === false) {
        showToast('You do not have permission to edit procurement data', 'error');
        return;
    }

    if (!currentMRF) {
        showToast('No MRF selected', 'error');
        return;
    }

    const mrfId = currentMRF.mrf_id;
    const isRejected = currentMRF.status === 'PR Rejected' || currentMRF.is_rejected;

    // Fetch all related documents to show what will be deleted
    const prsRef = collection(db, 'prs');
    const prQuery = query(prsRef, where('mrf_id', '==', mrfId));
    const prSnapshot = await getDocs(prQuery);

    const posRef = collection(db, 'pos');
    const poQuery = query(posRef, where('mrf_id', '==', mrfId));
    const poSnapshot = await getDocs(poQuery);

    const trsRef = collection(db, 'transport_requests');
    const trQuery = query(trsRef, where('mrf_id', '==', mrfId));
    const trSnapshot = await getDocs(trQuery);

    // Analyze related documents
    let hasRejectedPRs = false;
    let hasApprovedPRs = false;
    let rejectedSuppliers = [];
    let approvedSuppliers = [];

    prSnapshot.forEach((docSnap) => {
        const prData = docSnap.data();
        if (prData.finance_status === 'Rejected') {
            hasRejectedPRs = true;
            rejectedSuppliers.push(prData.supplier_name);
        } else if (prData.finance_status === 'Approved') {
            hasApprovedPRs = true;
            approvedSuppliers.push(prData.supplier_name);
        }
    });

    // If MRF is rejected and has a mix of approved/rejected PRs, guide user
    if (isRejected && hasApprovedPRs && hasRejectedPRs) {
        const guidance = `This MRF has both approved and rejected PRs.\n\n` +
            `Approved suppliers: ${approvedSuppliers.join(', ')}\n` +
            `Rejected suppliers: ${rejectedSuppliers.join(', ')}\n\n` +
            `TIP: Instead of deleting the entire MRF, you can:\n` +
            `1. Remove the line items for rejected suppliers from the table\n` +
            `2. Click "Save" to update\n` +
            `3. Click "Generate PR" to resubmit - rejected PRs will be auto-cleaned\n\n` +
            `Do you still want to DELETE THE ENTIRE MRF and all related documents?`;

        if (!confirm(guidance)) {
            return;
        }
    }

    // Build warning message about related documents
    let warningMessage = '';
    let prDetails = [];
    let poDetails = [];
    let trDetails = [];

    prSnapshot.forEach((docSnap) => {
        const prData = docSnap.data();
        prDetails.push(`${prData.pr_id} (${prData.finance_status || 'Pending'})`);
    });

    poSnapshot.forEach((docSnap) => {
        const poData = docSnap.data();
        poDetails.push(`${poData.po_id} (${poData.procurement_status || 'Pending'})`);
    });

    trSnapshot.forEach((docSnap) => {
        const trData = docSnap.data();
        trDetails.push(`${trData.tr_id} (${trData.finance_status || 'Pending'})`);
    });

    if (prDetails.length > 0) {
        warningMessage += `\n- ${prDetails.length} Purchase Request(s): ${prDetails.join(', ')}`;
    }
    if (poDetails.length > 0) {
        warningMessage += `\n- ${poDetails.length} Purchase Order(s): ${poDetails.join(', ')}`;
    }
    if (trDetails.length > 0) {
        warningMessage += `\n- ${trDetails.length} Transport Request(s): ${trDetails.join(', ')}`;
    }

    // Prompt for deletion reason
    let promptMessage = 'Please provide a reason for deleting this MRF:\n\n(This action cannot be undone)';
    if (warningMessage) {
        promptMessage = `WARNING: The following related documents will also be PERMANENTLY deleted:${warningMessage}\n\nPlease provide a reason for deleting this MRF:\n\n(This action cannot be undone)`;
    }

    const reason = prompt(promptMessage);

    if (reason === null) {
        return;
    }

    if (!reason.trim()) {
        showToast('Deletion reason is required', 'error');
        return;
    }

    // Confirm deletion
    let confirmMessage = `Are you sure you want to delete MRF "${currentMRF.mrf_id}"?`;
    if (warningMessage) {
        confirmMessage += `\n\nThe following will be PERMANENTLY deleted:${warningMessage}`;
    }
    confirmMessage += `\n\nReason: ${reason}\n\nThis action cannot be undone.`;

    const confirmDelete = confirm(confirmMessage);

    if (!confirmDelete) {
        return;
    }

    showLoading(true);

    try {
        // Store deletion record for audit trail
        const deletedMrfData = {
            ...currentMRF,
            deleted_at: new Date().toISOString(),
            deletion_reason: reason.trim(),
            deleted_by: 'Procurement',
            deleted_prs: [],
            deleted_pos: [],
            deleted_trs: []
        };

        // Delete ALL related PRs and store their details for audit
        for (const prDoc of prSnapshot.docs) {
            const prData = prDoc.data();
            deletedMrfData.deleted_prs.push({
                pr_id: prData.pr_id,
                supplier_name: prData.supplier_name,
                total_amount: prData.total_amount,
                finance_status: prData.finance_status
            });
            await deleteDoc(doc(db, 'prs', prDoc.id));
        }

        // Delete ALL related POs and store their details for audit
        for (const poDoc of poSnapshot.docs) {
            const poData = poDoc.data();
            deletedMrfData.deleted_pos.push({
                po_id: poData.po_id,
                supplier_name: poData.supplier_name,
                total_amount: poData.total_amount,
                procurement_status: poData.procurement_status
            });
            await deleteDoc(doc(db, 'pos', poDoc.id));
        }

        // Delete ALL related Transport Requests and store their details for audit
        for (const trDoc of trSnapshot.docs) {
            const trData = trDoc.data();
            deletedMrfData.deleted_trs.push({
                tr_id: trData.tr_id,
                total_amount: trData.total_amount,
                finance_status: trData.finance_status
            });
            await deleteDoc(doc(db, 'transport_requests', trDoc.id));
        }

        // Add to deleted_mrfs collection for audit trail
        const deletedMrfsRef = collection(db, 'deleted_mrfs');
        await addDoc(deletedMrfsRef, deletedMrfData);

        // Delete the MRF document
        const mrfRef = doc(db, 'mrfs', currentMRF.id);
        await deleteDoc(mrfRef);

        // Clear current selection
        currentMRF = null;

        // Reset MRF details panel
        const mrfDetails = document.getElementById('mrfDetails');
        if (mrfDetails) {
            mrfDetails.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #999;">
                    Select an MRF to view details
                </div>
            `;
        }

        // Reset action buttons
        document.getElementById('mrfActions').innerHTML = `
            <button class="btn btn-primary" onclick="window.saveProgress()">Save Progress</button>
        `;

        showToast('MRF deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting MRF:', error);
        showToast('Failed to delete MRF: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
};

/**
 * Reject MRF - soft-reject by setting status='Rejected' with a reason.
 * Preserves the MRF and all linked PRs/TRs in Firestore for audit trail.
 */
async function rejectMRF() {
    if (window.canEditTab?.('procurement') === false) {
        showToast('You do not have permission to edit procurement data', 'error');
        return;
    }

    if (!currentMRF) {
        showToast('No MRF selected', 'error');
        return;
    }

    const reason = prompt(`Please provide a reason for rejecting MRF "${currentMRF.mrf_id}":\n\n(The MRF will be marked Rejected and removed from the pending list)`);

    if (reason === null) return; // User cancelled

    if (!reason.trim()) {
        showToast('Rejection reason is required', 'error');
        return;
    }

    const confirmReject = confirm(`Reject MRF "${currentMRF.mrf_id}"?\n\nReason: ${reason}\n\nThe MRF will be marked as Rejected and will no longer appear in the pending list. Related PRs and TRs are preserved.`);
    if (!confirmReject) return;

    showLoading(true);
    try {
        const mrfRef = doc(db, 'mrfs', currentMRF.id);
        await updateDoc(mrfRef, {
            status: 'Rejected',
            rejection_reason: reason.trim(),
            rejected_by: 'Procurement',
            rejected_at: new Date().toISOString()
        });

        currentMRF = null;

        // Reset MRF details panel
        const mrfDetails = document.getElementById('mrfDetails');
        if (mrfDetails) {
            mrfDetails.innerHTML = `<div style="text-align: center; padding: 3rem; color: #999;">Select an MRF to view details</div>`;
        }

        // Reset action buttons
        const mrfActionsEl = document.getElementById('mrfActions');
        if (mrfActionsEl) {
            mrfActionsEl.innerHTML = `<button class="btn btn-primary" onclick="window.saveProgress()">Save Progress</button>`;
        }

        showToast('MRF rejected successfully', 'success');
    } catch (error) {
        console.error('Error rejecting MRF:', error);
        showToast('Failed to reject MRF: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ========================================
// SUPPLIER MANAGEMENT
// ========================================

/**
 * Load suppliers from Firebase
 */
async function loadSuppliers() {
    if (suppliersData.length > 0 && (Date.now() - _suppliersCachedAt) < CACHE_TTL_MS) {
        if (filteredSuppliersData.length === 0) {
            filteredSuppliersData = [...suppliersData]; // ensure populated on cache-hit
        }
        renderSuppliersTable(); // Paint cached data onto fresh DOM after tab switch
        return;
    }
    try {
        const listener = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
            suppliersData = [];
            snapshot.forEach(doc => {
                suppliersData.push({ id: doc.id, ...doc.data() });
            });

            // Sort alphabetically
            suppliersData.sort((a, b) => a.supplier_name.localeCompare(b.supplier_name));
            _suppliersCachedAt = Date.now();

            applySupplierSearch(); // re-derive filtered view and render
        });

        listeners.push(listener);
    } catch (error) {
        console.error('Error loading suppliers:', error);
    }
}

/**
 * Render suppliers table
 */
function renderSuppliersTable() {
    const tbody = document.getElementById('suppliersTableBody');
    if (!tbody) return;

    const canEdit = window.canEditTab?.('procurement');
    const showEditControls = canEdit !== false;

    if (filteredSuppliersData.length === 0) {
        const term = document.getElementById('supplierSearchInput')?.value || '';
        const message = term
            ? 'No suppliers match your search.'
            : 'No suppliers yet. Add your first supplier!';
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem;">${message}</td></tr>`;
        const paginationDiv = document.getElementById('suppliersPagination');
        if (paginationDiv) paginationDiv.style.display = 'none';
        return;
    }

    // Calculate pagination
    const totalPages = Math.ceil(filteredSuppliersData.length / suppliersItemsPerPage);
    const startIndex = (suppliersCurrentPage - 1) * suppliersItemsPerPage;
    const endIndex = Math.min(startIndex + suppliersItemsPerPage, filteredSuppliersData.length);
    const pageItems = filteredSuppliersData.slice(startIndex, endIndex);

    tbody.innerHTML = pageItems.map(supplier => {
        if (editingSupplier === supplier.id) {
            return `
                <tr class="edit-row">
                    <td><input type="text" value="${escapeHTML(supplier.supplier_name)}" id="edit-name"></td>
                    <td><input type="text" value="${escapeHTML(supplier.contact_person)}" id="edit-contact"></td>
                    <td><input type="email" value="${escapeHTML(supplier.email)}" id="edit-email"></td>
                    <td><input type="text" value="${escapeHTML(supplier.phone)}" id="edit-phone"></td>
                    <td class="actions">
                        <button class="btn btn-success" onclick="window.saveEdit('${supplier.id}')">Save</button>
                        <button class="btn btn-secondary" onclick="window.cancelEdit()">Cancel</button>
                    </td>
                </tr>
            `;
        } else {
            return `
                <tr>
                    <td class="clickable-supplier" onclick="window.showSupplierPurchaseHistory('${escapeHTML(supplier.supplier_name)}')">${escapeHTML(supplier.supplier_name)}</td>
                    <td>${escapeHTML(supplier.contact_person)}</td>
                    <td>${escapeHTML(supplier.email)}</td>
                    <td>${escapeHTML(supplier.phone)}</td>
                    <td class="actions">
                        ${showEditControls ? `
                        <button class="icon-btn" onclick="window.editSupplier('${supplier.id}')">Edit</button>
                        <button class="icon-btn" onclick="window.deleteSupplier('${supplier.id}', '${escapeHTML(supplier.supplier_name)}')">Delete</button>
                        ` : '<span class="view-only-badge">View Only</span>'}
                    </td>
                </tr>
            `;
        }
    }).join('');

    // Update pagination controls
    updateSuppliersPaginationControls(totalPages, startIndex, endIndex, filteredSuppliersData.length);
}

// Supplier management functions
function toggleAddForm() {
    const form = document.getElementById('addSupplierForm');
    if (form.style.display === 'none') {
        form.style.display = 'block';
    } else {
        form.style.display = 'none';
        clearAddForm();
    }
};

function clearAddForm() {
    document.getElementById('newSupplierName').value = '';
    document.getElementById('newContactPerson').value = '';
    document.getElementById('newEmail').value = '';
    document.getElementById('newPhone').value = '';
}

async function addSupplier() {
    if (window.canEditTab?.('procurement') === false) {
        showToast('You do not have permission to edit procurement data', 'error');
        return;
    }

    const supplier_name = document.getElementById('newSupplierName').value.trim();
    const contact_person = document.getElementById('newContactPerson').value.trim();
    const email = document.getElementById('newEmail').value.trim();
    const phone = document.getElementById('newPhone').value.trim();

    if (!supplier_name || !contact_person || !email || !phone) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    showLoading(true);

    try {
        await addDoc(collection(db, 'suppliers'), {
            supplier_name,
            contact_person,
            email,
            phone,
            created_at: new Date().toISOString()
        });

        showToast(`Supplier "${supplier_name}" added successfully!`, 'success');
        window.toggleAddForm();
    } catch (error) {
        console.error('Error adding supplier:', error);
        showToast('Failed to add supplier', 'error');
    } finally {
        showLoading(false);
    }
};

function editSupplier(supplierId) {
    if (window.canEditTab?.('procurement') === false) {
        showToast('You do not have permission to edit procurement data', 'error');
        return;
    }

    editingSupplier = supplierId;
    renderSuppliersTable();
};

function cancelEdit() {
    editingSupplier = null;
    renderSuppliersTable();
};

async function saveEdit(supplierId) {
    if (window.canEditTab?.('procurement') === false) {
        showToast('You do not have permission to edit procurement data', 'error');
        return;
    }

    const supplier_name = document.getElementById('edit-name').value.trim();
    const contact_person = document.getElementById('edit-contact').value.trim();
    const email = document.getElementById('edit-email').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();

    if (!supplier_name || !contact_person || !email || !phone) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    showLoading(true);

    try {
        const supplierRef = doc(db, 'suppliers', supplierId);
        await updateDoc(supplierRef, {
            supplier_name,
            contact_person,
            email,
            phone,
            updated_at: new Date().toISOString()
        });

        showToast('Supplier updated successfully', 'success');
        editingSupplier = null;
        renderSuppliersTable();
    } catch (error) {
        console.error('Error updating supplier:', error);
        showToast('Failed to update supplier', 'error');
    } finally {
        showLoading(false);
    }
};

async function deleteSupplier(supplierId, supplierName) {
    if (window.canEditTab?.('procurement') === false) {
        showToast('You do not have permission to edit procurement data', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to delete supplier "${supplierName}"?`)) {
        return;
    }

    showLoading(true);

    try {
        await deleteDoc(doc(db, 'suppliers', supplierId));
        showToast(`Supplier "${supplierName}" deleted`, 'success');
    } catch (error) {
        console.error('Error deleting supplier:', error);
        showToast('Failed to delete supplier', 'error');
    } finally {
        showLoading(false);
    }
};

function applySupplierSearch() {
    const term = document.getElementById('supplierSearchInput')?.value?.toLowerCase() || '';
    filteredSuppliersData = !term
        ? [...suppliersData]
        : suppliersData.filter(s =>
            (s.supplier_name && s.supplier_name.toLowerCase().includes(term)) ||
            (s.contact_person && s.contact_person.toLowerCase().includes(term))
          );
    suppliersCurrentPage = 1;
    renderSuppliersTable();
}

function changeSuppliersPage(direction) {
    const totalPages = Math.ceil(filteredSuppliersData.length / suppliersItemsPerPage);

    if (direction === 'prev' && suppliersCurrentPage > 1) {
        suppliersCurrentPage--;
    } else if (direction === 'next' && suppliersCurrentPage < totalPages) {
        suppliersCurrentPage++;
    } else if (typeof direction === 'number') {
        suppliersCurrentPage = direction;
    }

    renderSuppliersTable();
};

function updateSuppliersPaginationControls(totalPages, startIndex, endIndex, totalItems) {
    let paginationDiv = document.getElementById('suppliersPagination');

    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.id = 'suppliersPagination';
        paginationDiv.className = 'pagination-container';

        const table = document.querySelector('#suppliers-section table');
        if (table && table.parentNode) {
            table.parentNode.insertBefore(paginationDiv, table.nextSibling);
        }
    }

    let paginationHTML = `
        <div class="pagination-info">
            Showing <strong>${startIndex + 1}-${endIndex}</strong> of <strong>${totalItems}</strong> Suppliers
        </div>
        <div class="pagination-controls">
            <button class="pagination-btn" onclick="window.changeSuppliersPage('prev')" ${suppliersCurrentPage === 1 ? 'disabled' : ''}>
                ← Previous
            </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= suppliersCurrentPage - 1 && i <= suppliersCurrentPage + 1)) {
            paginationHTML += `
                <button class="pagination-btn ${i === suppliersCurrentPage ? 'active' : ''}" onclick="window.changeSuppliersPage(${i})">
                    ${i}
                </button>
            `;
        } else if (i === suppliersCurrentPage - 2 || i === suppliersCurrentPage + 2) {
            paginationHTML += '<span class="pagination-ellipsis">...</span>';
        }
    }

    paginationHTML += `
            <button class="pagination-btn" onclick="window.changeSuppliersPage('next')" ${suppliersCurrentPage === totalPages ? 'disabled' : ''}>
                Next →
            </button>
        </div>
    `;

    paginationDiv.innerHTML = paginationHTML;
}

// ========================================
// HISTORICAL MRFS
// ========================================

/**
 * Load MRF Records (combines MRFs, PRs, and POs)
 */
async function loadPRPORecords() {
    // If records are cached and fresh, render from cache (no Firestore fetch, no loading overlay)
    if (allPRPORecords.length > 0 && (Date.now() - _prpoRecordsCachedAt) < CACHE_TTL_MS) {
        filteredPRPORecords = [...allPRPORecords];
        prpoCurrentPage = 1;
        await renderPRPORecords();
        return;
    }

    showLoading(true);

    try {
        // Fetch all MRFs (all statuses including Pending and Approved)
        const mrfsRef = collection(db, 'mrfs');
        const mrfSnapshot = await getDocs(mrfsRef);

        allPRPORecords = [];
        _prpoSubDataCache = new Map(); // invalidate on fresh MRF load
        mrfSnapshot.forEach((doc) => {
            allPRPORecords.push({ id: doc.id, ...doc.data() });
        });

        // Sort by current sort state (default: date_needed desc — newest first)
        allPRPORecords.sort((a, b) => {
            let aVal = a[prpoSortColumn];
            let bVal = b[prpoSortColumn];
            // Custom ordinal sort for procurement status
            if (prpoSortColumn === 'procurement_status') {
                aVal = a._procurement_status;
                bVal = b._procurement_status;
                if (!aVal && !bVal) return 0;
                if (!aVal) return prpoSortDirection === 'asc' ? 1 : -1;
                if (!bVal) return prpoSortDirection === 'asc' ? -1 : 1;
                const aOrd = PROCUREMENT_STATUS_ORDER[aVal] || 99;
                const bOrd = PROCUREMENT_STATUS_ORDER[bVal] || 99;
                return prpoSortDirection === 'asc' ? aOrd - bOrd : bOrd - aOrd;
            }
            if (aVal == null) return prpoSortDirection === 'asc' ? 1 : -1;
            if (bVal == null) return prpoSortDirection === 'asc' ? -1 : 1;
            if (typeof aVal === 'string') {
                return prpoSortDirection === 'asc'
                    ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return prpoSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        });

        // Fetch all POs for scoreboard
        const posRef = collection(db, 'pos');
        const posSnapshot = await getDocs(posRef);
        const allPOData = [];
        posSnapshot.forEach((doc) => {
            allPOData.push({ id: doc.id, ...doc.data() });
        });

        // Update scoreboards
        updatePOScoreboards(allPOData);

        filteredPRPORecords = [...allPRPORecords];
        prpoCurrentPage = 1;
        _prpoRecordsCachedAt = Date.now();

        renderPRPORecords();
    } catch (error) {
        console.error('Error loading PR-PO records:', error);
        showToast('Error loading PR-PO records', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Update PO Scoreboards
 */
function updatePOScoreboards(pos) {
    const materialCounts = {
        pending: 0,
        procuring: 0,
        procured: 0,
        delivered: 0
    };

    const subconCounts = {
        pending: 0,
        processing: 0,
        processed: 0
    };

    pos.forEach(po => {
        const defaultStatus = po.is_subcon ? 'Pending' : 'Pending Procurement';
        const status = po.procurement_status || defaultStatus;

        if (po.is_subcon) {
            if (status === 'Pending') subconCounts.pending++;
            else if (status === 'Processing') subconCounts.processing++;
            else if (status === 'Processed') subconCounts.processed++;
        } else {
            if (status === 'Pending Procurement') materialCounts.pending++;
            else if (status === 'Procuring') materialCounts.procuring++;
            else if (status === 'Procured') materialCounts.procured++;
            else if (status === 'Delivered') materialCounts.delivered++;
        }
    });

    // Update DOM elements
    const elements = {
        scoreMaterialsPending: document.getElementById('scoreMaterialsPending'),
        scoreMaterialsProcuring: document.getElementById('scoreMaterialsProcuring'),
        scoreMaterialsProcured: document.getElementById('scoreMaterialsProcured'),
        scoreMaterialsDelivered: document.getElementById('scoreMaterialsDelivered'),
        scoreSubconPending: document.getElementById('scoreSubconPending'),
        scoreSubconProcessing: document.getElementById('scoreSubconProcessing'),
        scoreSubconProcessed: document.getElementById('scoreSubconProcessed')
    };

    if (elements.scoreMaterialsPending) elements.scoreMaterialsPending.textContent = materialCounts.pending;
    if (elements.scoreMaterialsProcuring) elements.scoreMaterialsProcuring.textContent = materialCounts.procuring;
    if (elements.scoreMaterialsProcured) elements.scoreMaterialsProcured.textContent = materialCounts.procured;
    if (elements.scoreMaterialsDelivered) elements.scoreMaterialsDelivered.textContent = materialCounts.delivered;
    if (elements.scoreSubconPending) elements.scoreSubconPending.textContent = subconCounts.pending;
    if (elements.scoreSubconProcessing) elements.scoreSubconProcessing.textContent = subconCounts.processing;
    if (elements.scoreSubconProcessed) elements.scoreSubconProcessed.textContent = subconCounts.processed;
}

/**
 * Filter MRF Records
 */
function filterPRPORecords() {
    const searchInput = document.getElementById('histSearchInput')?.value.toLowerCase() || '';
    const mrfStatusFilter = document.getElementById('histStatusFilter')?.value || '';
    const poStatusFilter = document.getElementById('poStatusFilter')?.value || '';

    filteredPRPORecords = allPRPORecords.filter(mrf => {
        // Department filter
        const mrfDept = mrf.department || (mrf.service_code ? 'services' : 'projects');
        const matchesDept = !activePODeptFilter || mrfDept === activePODeptFilter;

        // Search filter
        const matchesSearch = !searchInput ||
            (mrf.mrf_id && mrf.mrf_id.toLowerCase().includes(searchInput)) ||
            (mrf.project_name && mrf.project_name.toLowerCase().includes(searchInput)) ||
            (mrf.requestor_name && mrf.requestor_name.toLowerCase().includes(searchInput)) ||
            (mrf.service_name && mrf.service_name.toLowerCase().includes(searchInput));

        // MRF status filter
        const matchesMRFStatus = !mrfStatusFilter || mrf.status === mrfStatusFilter;

        return matchesDept && matchesSearch && matchesMRFStatus;
    });

    prpoCurrentPage = 1;
    renderPRPORecords();
}

/**
 * Sort the MRF Records table by a column.
 * Toggles direction on same column; resets to ascending on new column.
 * Sorts allPRPORecords (source array) then calls filterPRPORecords() to re-render.
 */
function sortPRPORecords(column) {
    if (prpoSortColumn === column) {
        prpoSortDirection = prpoSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        prpoSortColumn = column;
        prpoSortDirection = 'asc';
    }
    allPRPORecords.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];
        // Custom ordinal sort for procurement status
        if (column === 'procurement_status') {
            aVal = a._procurement_status;
            bVal = b._procurement_status;
            // Empty/null statuses sort to end
            if (!aVal && !bVal) return 0;
            if (!aVal) return prpoSortDirection === 'asc' ? 1 : -1;
            if (!bVal) return prpoSortDirection === 'asc' ? -1 : 1;
            const aOrd = PROCUREMENT_STATUS_ORDER[aVal] || 99;
            const bOrd = PROCUREMENT_STATUS_ORDER[bVal] || 99;
            return prpoSortDirection === 'asc' ? aOrd - bOrd : bOrd - aOrd;
        }
        if (aVal == null) return prpoSortDirection === 'asc' ? 1 : -1;
        if (bVal == null) return prpoSortDirection === 'asc' ? -1 : 1;
        if (typeof aVal === 'string') {
            return prpoSortDirection === 'asc'
                ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return prpoSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    filterPRPORecords();
}

/**
 * Export the currently-filtered MRF Records (PR/PO Records) as a CSV file.
 * Fetches PR and PO data per MRF from Firestore to include in the export.
 * Exports filteredPRPORecords (all rows, not paginated).
 */
async function exportPRPORecordsCSV() {
    if (filteredPRPORecords.length === 0) {
        showToast('No records to export', 'info');
        return;
    }

    showLoading(true);
    try {
        const headers = [
            'MRF ID', 'Type', 'Project / Service', 'Requestor',
            'MRF Status', 'Urgency', 'Date Needed',
            'PR IDs', 'PR Suppliers', 'PR Total (PHP)',
            'PO IDs', 'PO Status'
        ];

        const rows = await Promise.all(filteredPRPORecords.map(async (mrf) => {
            const type = mrf.request_type === 'service' ? 'Transport' : 'Material';
            const displayId = (type === 'Transport' && mrf.tr_id) ? mrf.tr_id : mrf.mrf_id;
            const label = getMRFLabel(mrf);
            const dateNeeded = mrf.date_needed
                ? formatDate(mrf.date_needed)
                : (formatTimestamp(mrf.date_submitted || mrf.created_at) || '');

            let prIds = '';
            let prSuppliers = '';
            let prTotal = 0;
            let poIds = '';
            let poStatuses = '';

            if (type === 'Material') {
                try {
                    const prSnapshot = await getDocs(
                        query(collection(db, 'prs'), where('mrf_id', '==', mrf.mrf_id))
                    );
                    const prs = [];
                    prSnapshot.forEach(d => prs.push(d.data()));
                    prs.sort((a, b) => (a.pr_id || '').localeCompare(b.pr_id || ''));

                    prIds = prs.map(p => p.pr_id || '').join('; ');
                    prSuppliers = [...new Set(prs.map(p => p.supplier_name || '').filter(Boolean))].join('; ');
                    prTotal = prs
                        .filter(p => p.finance_status !== 'Rejected')
                        .reduce((sum, p) => sum + parseFloat(p.total_amount || 0), 0);
                } catch (e) {
                    console.error('[Procurement] Export: error fetching PRs for', mrf.mrf_id, e);
                }

                try {
                    const poSnapshot = await getDocs(
                        query(collection(db, 'pos'), where('mrf_id', '==', mrf.mrf_id))
                    );
                    const pos = [];
                    poSnapshot.forEach(d => pos.push(d.data()));
                    pos.sort((a, b) => (a.po_id || '').localeCompare(b.po_id || ''));

                    poIds = pos.map(p => p.po_id || '').join('; ');
                    poStatuses = [...new Set(pos.map(p => p.procurement_status || 'Pending Procurement').filter(Boolean))].join('; ');
                } catch (e) {
                    console.error('[Procurement] Export: error fetching POs for', mrf.mrf_id, e);
                }
            }

            return [
                displayId,
                type,
                label,
                mrf.requestor_name || '',
                mrf.status || '',
                mrf.urgency_level || '',
                dateNeeded,
                prIds,
                prSuppliers,
                prTotal > 0 ? prTotal.toFixed(2) : '',
                poIds,
                poStatuses
            ];
        }));

        const date = new Date().toISOString().slice(0, 10);
        downloadCSV(headers, rows, `mrf-pr-po-records-${date}.csv`);
        showToast(`Exported ${filteredPRPORecords.length} records`, 'success');
    } catch (error) {
        console.error('[Procurement] Export error:', error);
        showToast('Export failed: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Calculate MRF status based on PR/PO state
 * Returns status text and color for badge rendering
 */
function calculateMRFStatus(prs, pos) {
    const prCount = prs.length;
    const poCount = pos.length;

    if (prCount === 0) {
        // No PRs generated yet
        return {
            status: 'Awaiting PR',
            badgeClass: 'rejected',
            description: 'No PRs generated yet'
        };
    } else if (poCount === 0) {
        // PRs exist but no POs
        return {
            status: '0/' + prCount + ' PO Issued',
            badgeClass: 'pending',
            description: 'PRs approved, awaiting PO generation'
        };
    } else if (poCount === prCount) {
        // All POs issued
        return {
            status: prCount + '/' + prCount + ' PO Issued',
            badgeClass: 'approved',
            description: 'All POs issued'
        };
    } else {
        // Partial PO issuance
        return {
            status: poCount + '/' + prCount + ' PO Issued',
            badgeClass: 'procuring',
            description: 'Partial PO issuance'
        };
    }
}

/**
 * Render MRF status badge with color coding
 */
function renderMRFStatusBadge(statusObj) {
    return `<span class="status-badge ${statusObj.badgeClass}">${statusObj.status}</span>`;
}

/**
 * Render MRF Records Table (merged view)
 */
async function renderPRPORecords() {
    const container = document.getElementById('prpoRecordsContainer');
    if (!container) return;

    const canEdit = window.canEditTab?.('procurement');
    const showEditControls = canEdit !== false;

    if (filteredPRPORecords.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #999;">
                <div style="font-size: 1.125rem; margin-bottom: 0.5rem;">No MRF records found</div>
                <div style="font-size: 0.875rem;">MRF records will appear here once processed</div>
            </div>
        `;
        return;
    }

    // Calculate pagination
    const totalPages = Math.ceil(filteredPRPORecords.length / prpoItemsPerPage);
    const startIndex = (prpoCurrentPage - 1) * prpoItemsPerPage;
    const endIndex = Math.min(startIndex + prpoItemsPerPage, filteredPRPORecords.length);
    const pageItems = filteredPRPORecords.slice(startIndex, endIndex);

    // Show loading state only on first render (cache empty); skip on sort/filter/page-change
    if (_prpoSubDataCache.size === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #999;">Loading document references...</div>';
    }

    // Fetch PR and PO data for current page items only
    const rows = await Promise.all(pageItems.map(async (mrf) => {
        const type = mrf.request_type === 'service' ? 'Transport' : 'Material';

        let totalCost = 0;
        let prCount = 0;
        let prApprovedCount = 0;
        let prDataArray = [];
        let poCount = 0;
        let poDataArray = [];
        let trCost = 0;
        let trFinanceStatus = null;
        let trDataArray = [];

        // Check cache first — skip Firestore if sub-data already loaded for this MRF
        if (_prpoSubDataCache.has(mrf.id)) {
            const cached = _prpoSubDataCache.get(mrf.id);
            ({ prDataArray, poDataArray, totalCost, prCount, prApprovedCount, trCost, trFinanceStatus } = cached);
            trDataArray = cached.trDataArray || [];
            poCount = poDataArray.length;
            mrf._tr_finance_status = trFinanceStatus;
        } else {
            if (type === 'Material') {
                try {
                    const prsRef = collection(db, 'prs');
                    const prQuery = query(prsRef, where('mrf_id', '==', mrf.mrf_id));
                    const prSnapshot = await getDocs(prQuery);

                    if (!prSnapshot.empty) {
                        prSnapshot.forEach((doc) => {
                            const prData = doc.data();
                            prCount++;
                            if (prData.finance_status === 'Approved') {
                                prApprovedCount++;
                            }
                            prDataArray.push({
                                docId: doc.id,
                                pr_id: prData.pr_id,
                                total_amount: parseFloat(prData.total_amount || 0),
                                finance_status: prData.finance_status,
                                supplier_name: prData.supplier_name
                            });
                            if (prData.finance_status !== 'Rejected') {
                                totalCost += parseFloat(prData.total_amount || 0);
                            }
                        });

                        // Sort PR IDs by number
                        prDataArray.sort((a, b) => {
                            const numA = parseInt((a.pr_id.match(/-(\d+)-/) || ['', '0'])[1]);
                            const numB = parseInt((b.pr_id.match(/-(\d+)-/) || ['', '0'])[1]);
                            return numA - numB;
                        });

                        // (prIds / prHtml block removed — PR display is now handled by prPoHtml below)
                    }
                } catch (error) {
                    console.error('Error fetching PRs for', mrf.mrf_id, error);
                }
            } else if (type === 'Transport') {
                // Fetch cost and TR data from transport_requests collection
                try {
                    const trsRef = collection(db, 'transport_requests');
                    const trQuery = query(trsRef, where('mrf_id', '==', mrf.mrf_id));
                    const trSnapshot = await getDocs(trQuery);

                    if (!trSnapshot.empty) {
                        trSnapshot.forEach((docSnap) => {
                            const trData = docSnap.data();
                            trDataArray.push({
                                docId: docSnap.id,
                                tr_id: trData.tr_id || '',
                                finance_status: trData.finance_status || 'Pending',
                                total_amount: parseFloat(trData.total_amount || 0),
                                proof_url: trData.proof_url || '',
                                proof_remarks: trData.proof_remarks || ''
                            });
                            trCost = parseFloat(trData.total_amount || 0);
                            trFinanceStatus = trData.finance_status || 'Pending';
                            mrf._tr_finance_status = trFinanceStatus;
                        });
                    }

                    // Fallback: Calculate from MRF items_json if cost not found in TR
                    if (trCost === 0 && mrf.items_json) {
                        const items = JSON.parse(mrf.items_json);
                        items.forEach(item => {
                            const qty = parseFloat(item.qty || item.quantity || 0);
                            const unitCost = parseFloat(item.unit_cost || 0);
                            trCost += qty * unitCost;
                        });
                    }
                    totalCost = trCost;
                } catch (error) {
                    console.error('Error fetching transport request cost for', mrf.mrf_id, error);
                }
            }

            if (type === 'Material') {
                try {
                    const posRef = collection(db, 'pos');
                    const poQuery = query(posRef, where('mrf_id', '==', mrf.mrf_id));
                    const poSnapshot = await getDocs(poQuery);

                    if (!poSnapshot.empty) {
                        poSnapshot.forEach((doc) => {
                            const poData = doc.data();
                            poCount++;
                            poDataArray.push({
                                docId: doc.id,
                                po_id: poData.po_id,
                                pr_id: poData.pr_id,
                                procurement_status: poData.procurement_status,
                                is_subcon: poData.is_subcon || false,
                                supplier_name: poData.supplier_name,
                                proof_url: poData.proof_url || '',
                                proof_remarks: poData.proof_remarks || '',
                                delivery_fee: parseFloat(poData.delivery_fee) || 0
                            });
                        });

                        // Sort PO IDs by number
                        poDataArray.sort((a, b) => {
                            const numA = parseInt((a.po_id.match(/-(\d+)-/) || ['', '0'])[1]);
                            const numB = parseInt((b.po_id.match(/-(\d+)-/) || ['', '0'])[1]);
                            return numA - numB;
                        });

                        // (poLinks block removed — PO display is now handled by prPoHtml below)
                    }
                } catch (error) {
                    console.error('Error fetching POs for', mrf.mrf_id, error);
                }

                // Also fetch TRs for Material MRFs with transport items (tr_id set by generatePRandTR/submitTransportRequest)
                if (mrf.tr_id) {
                    try {
                        const trsRef = collection(db, 'transport_requests');
                        const trQuery = query(trsRef, where('mrf_id', '==', mrf.mrf_id));
                        const trSnapshot = await getDocs(trQuery);
                        if (!trSnapshot.empty) {
                            trSnapshot.forEach((trDoc) => {
                                const trData = trDoc.data();
                                trDataArray.push({
                                    docId: trDoc.id,
                                    tr_id: trData.tr_id || '',
                                    finance_status: trData.finance_status || 'Pending',
                                    total_amount: parseFloat(trData.total_amount || 0),
                                    proof_url: trData.proof_url || '',
                                    proof_remarks: trData.proof_remarks || ''
                                });
                            });
                        }
                    } catch (error) {
                        console.error('Error fetching TR for Material MRF', mrf.mrf_id, error);
                    }
                }
            }

            // Store in cache for subsequent sort/filter/page-change renders
            _prpoSubDataCache.set(mrf.id, { prDataArray, poDataArray, totalCost, prCount, prApprovedCount, trCost, trFinanceStatus, trDataArray });
        }

        const totalCostHtml = totalCost > 0
            ? `<strong style="color: #1f2937;">₱${totalCost.toLocaleString('en-PH', {minimumFractionDigits: 2})}</strong>`
            : '<span style="color: #999; font-size: 0.875rem;">-</span>';

        // Store resolved procurement status on the MRF record for sorting
        // Use the least-progressed (bottleneck) PO status as summary
        if (poDataArray.length > 0) {
            let minOrdinal = Infinity;
            let summaryStatus = '';
            for (const po of poDataArray) {
                const defaultStatus = po.is_subcon ? 'Pending' : 'Pending Procurement';
                const status = po.procurement_status || defaultStatus;
                const ordinal = PROCUREMENT_STATUS_ORDER[status] || 0;
                if (ordinal < minOrdinal) {
                    minOrdinal = ordinal;
                    summaryStatus = status;
                }
            }
            mrf._procurement_status = summaryStatus;
        } else {
            mrf._procurement_status = '';  // No POs — Transport or no POs yet
        }

        // Calculate detailed status
        let detailedStatus = mrf.status;
        let statusColor = '#999';

        if (type === 'Transport') {
            if (mrf.status === 'Pending' || mrf.status === 'Requested' || mrf.status === 'MRF Submitted') {
                detailedStatus = 'Pending';
                statusColor = '#dc3545';
            } else if (mrf.status === 'TR Submitted') {
                detailedStatus = 'For Approval';
                statusColor = '#fbbc04';
            } else if (mrf.status === 'Finance Approved' || mrf.status === 'Completed' || mrf.status === 'Delivered') {
                detailedStatus = 'Approved';
                statusColor = '#34a853';
            }
        } else if (type === 'Material') {
            if (mrf.status === 'Pending' || mrf.status === 'Requested' || mrf.status === 'MRF Submitted') {
                detailedStatus = 'Pending';
                statusColor = '#dc3545';
            } else if (mrf.status === 'PR Generated' && prCount > 0) {
                if (prCount === 1) {
                    if (prApprovedCount === 0) {
                        detailedStatus = 'For Approval';
                        statusColor = '#fbbc04';
                    } else {
                        if (poCount === 0) {
                            detailedStatus = 'Approved - Awaiting PO';
                            statusColor = '#34a853';
                        } else {
                            detailedStatus = 'Approved';
                            statusColor = '#34a853';
                        }
                    }
                } else {
                    if (prApprovedCount < prCount) {
                        detailedStatus = `${prApprovedCount}/${prCount} PR Approved`;
                        statusColor = '#fbbc04';
                    } else {
                        if (poCount < prCount) {
                            detailedStatus = `${poCount}/${prCount} PO Issued`;
                            statusColor = '#fbbc04';
                        } else {
                            detailedStatus = 'Approved';
                            statusColor = '#34a853';
                        }
                    }
                }
            } else if ((mrf.status === 'Finance Approved' || mrf.status === 'PO Issued') && prCount > 0) {
                if (poCount < prCount) {
                    detailedStatus = `${poCount}/${prCount} PO Issued`;
                    statusColor = '#fbbc04';
                } else {
                    detailedStatus = 'Approved';
                    statusColor = '#34a853';
                }
            } else if (mrf.status === 'Completed' || mrf.status === 'Delivered') {
                detailedStatus = 'Approved';
                statusColor = '#34a853';
            }
        }

        const displayId = mrf.mrf_id;

        // Calculate MRF Status badge — computed for Material; finance_status badge for Transport
        let mrfStatusHtml = '<span style="color: #64748b; font-size: 0.75rem;">—</span>';
        if (mrf.status === 'Rejected') {
            mrfStatusHtml = renderMRFStatusBadge({ status: 'Rejected', badgeClass: 'rejected' });
        } else if (type === 'Material') {
            const statusObj = calculateMRFStatus(prDataArray, poDataArray);
            mrfStatusHtml = renderMRFStatusBadge(statusObj);
        } else if (type === 'Transport') {
            const financeStatus = mrf._tr_finance_status || 'Pending';
            mrfStatusHtml = `<span class="status-badge ${getStatusClass(financeStatus)}">${escapeHTML(financeStatus)}</span>`;
        }

        // Build merged PRs / POs cell — index POs by their parent pr_id, then render one row per PR
        const posByPrId = {};
        poDataArray.forEach(po => {
            const key = po.pr_id || '_unlinked';
            if (!posByPrId[key]) posByPrId[key] = [];
            posByPrId[key].push(po);
        });

        let prHtml = '<span style="color: #999; font-size: 0.875rem;">-</span>';
        let poHtml = '<span style="color: #999; font-size: 0.875rem;">-</span>';
        let procStatusHtml = '<span style="color: #999; font-size: 0.875rem;">-</span>';

        if (type === 'Material' && prDataArray.length > 0) {
            const rowStyle = (i) => i === 0
                ? 'height: 30px; display: flex; align-items: center;'
                : 'height: 30px; display: flex; align-items: center; border-top: 1px dashed #e5e7eb;';

            prHtml = prDataArray.map((pr, i) => {
                const statusClass = getStatusClass(pr.finance_status || 'Pending');
                return `<div style="${rowStyle(i)}">
                    <a href="javascript:void(0)"
                        onclick="window.viewPRDetails('${pr.docId}')"
                        class="status-badge ${statusClass}"
                        style="font-size: 0.75rem; text-decoration: none; cursor: pointer; display: inline-block; white-space: nowrap;">
                        ${escapeHTML(pr.pr_id)}
                    </a>
                </div>`;
            }).join('');

            poHtml = prDataArray.map((pr, i) => {
                const matchedPOs = posByPrId[pr.pr_id] || [];
                let content;
                if (matchedPOs.length === 0) {
                    content = `<span style="color: #94a3b8; font-size: 0.75rem; font-style: italic;">&#8212;</span>`;
                } else {
                    content = matchedPOs.map(po => {
                        const isSubcon = po.is_subcon;
                        const subconBadge = isSubcon
                            ? ' <span style="background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; font-weight: 600;">SUBCON</span>'
                            : '';
                        const fillData = getPOPaymentFill(po.po_id);
                        const emptyBg = '#e5e7eb';
                        const bgStyle = fillData.pct > 0 && fillData.pct < 100
                            ? `background:linear-gradient(to right, ${fillData.color} ${fillData.pct}%, ${emptyBg} ${fillData.pct}%)`
                            : fillData.pct >= 100
                            ? `background:${fillData.color}`
                            : `background:${emptyBg}`;
                        // Delivery fee dot
                        let chipDotHtml = '';
                        const chipDeliveryFee = parseFloat(po.delivery_fee) || 0;
                        if (chipDeliveryFee > 0) {
                            const dfRFPs = (rfpsByPO[po.po_id] || []).filter(r => r.tranche_label === 'Delivery Fee');
                            let chipDotColor, chipDotLabel;
                            if (dfRFPs.length === 0) {
                                chipDotColor = '#ef4444'; chipDotLabel = 'No RFP submitted';
                            } else {
                                const dfTotalPaid = (dfRFPs[0].payment_records || [])
                                    .filter(r => r.status !== 'voided')
                                    .reduce((sum, r) => sum + (r.amount || 0), 0);
                                const dfPaid = dfTotalPaid >= dfRFPs[0].amount_requested && dfRFPs[0].amount_requested > 0;
                                chipDotColor = dfPaid ? '#059669' : '#f59e0b';
                                chipDotLabel = dfPaid ? 'Paid' : 'RFP submitted, not yet paid';
                            }
                            const chipDotTip = `Delivery Fee: PHP ${chipDeliveryFee.toLocaleString('en-PH', {minimumFractionDigits: 2})} \u2014 ${chipDotLabel}`;
                            chipDotHtml = `<span title="${escapeHTML(chipDotTip)}" style="position:absolute;top:2px;right:2px;width:7px;height:7px;border-radius:50%;background:${chipDotColor};z-index:2;pointer-events:auto;"></span>`;
                        }
                        return `<span style="position:relative;display:inline-block;"><a href="javascript:void(0)"
                                onclick="window.viewPODetails('${po.docId}')"
                                oncontextmenu="event.preventDefault(); window.showRFPContextMenu(event, '${po.docId}'); return false;"
                                title="${escapeHTML(fillData.tooltip)}"
                                style="padding:0.25rem 0.75rem;border-radius:12px;font-size:0.75rem;font-weight:600;color:#1e293b;text-decoration:none;cursor:pointer;white-space:nowrap;display:inline-block;${bgStyle}">
                                ${escapeHTML(po.po_id)}</a>${chipDotHtml}</span>${subconBadge}`;
                    }).join(' ');
                }
                return `<div style="${rowStyle(i)}">${content}</div>`;
            }).join('');

            const poStatusColors = {
                'Pending Procurement': { bg: '#fef3c7', color: '#f59e0b' },
                'Pending': { bg: '#fef3c7', color: '#f59e0b' },
                'Procuring': { bg: '#dbeafe', color: '#3b82f6' },
                'Processing': { bg: '#dbeafe', color: '#3b82f6' },
                'Procured': { bg: '#d1fae5', color: '#22c55e' },
                'Processed': { bg: '#d1fae5', color: '#22c55e' },
                'Delivered': { bg: '#eff6ff', color: '#2563eb' }
            };

            procStatusHtml = prDataArray.map((pr, i) => {
                const matchedPOs = posByPrId[pr.pr_id] || [];
                let content;
                if (matchedPOs.length === 0) {
                    content = `<span style="color: #94a3b8; font-size: 0.75rem;">&#8212;</span>`;
                } else {
                    content = matchedPOs.map(po => {
                        const isSubcon = po.is_subcon;
                        const defaultStatus = isSubcon ? 'Pending' : 'Pending Procurement';
                        const currentStatus = po.procurement_status || defaultStatus;
                        const isFinalStatus = isSubcon ? currentStatus === 'Processed' : currentStatus === 'Delivered';
                        let statusOptions;
                        if (isSubcon) {
                            statusOptions = `
                                <option value="Pending" ${currentStatus === 'Pending' ? 'selected' : ''}>Pending</option>
                                <option value="Processing" ${currentStatus === 'Processing' ? 'selected' : ''}>Processing</option>
                                <option value="Processed" ${currentStatus === 'Processed' ? 'selected' : ''}>Processed</option>
                            `;
                        } else {
                            statusOptions = `
                                <option value="Pending Procurement" ${currentStatus === 'Pending Procurement' ? 'selected' : ''}>Pending</option>
                                <option value="Procuring" ${currentStatus === 'Procuring' ? 'selected' : ''}>Procuring</option>
                                <option value="Procured" ${currentStatus === 'Procured' ? 'selected' : ''}>Procured</option>
                                <option value="Delivered" ${currentStatus === 'Delivered' ? 'selected' : ''}>Delivered</option>
                            `;
                        }
                        const statusColor = poStatusColors[currentStatus] || { bg: '#f3f4f6', color: '#6b7280' };
                        return showEditControls
                            ? `<select class="status-select" data-po-id="${po.docId}" data-is-subcon="${isSubcon}"
                                    onchange="window.updatePOStatus('${po.docId}', this.value, '${currentStatus}', ${isSubcon})"
                                    ${isFinalStatus ? 'disabled' : ''}
                                    style="padding: 0.2rem 0.4rem; border: 1px solid #dadce0; border-radius: 4px; font-size: 0.72rem; ${isFinalStatus ? 'opacity: 0.6; cursor: not-allowed;' : 'cursor: pointer;'}">
                                ${statusOptions}
                               </select>`
                            : `<span style="background: ${statusColor.bg}; color: ${statusColor.color}; padding: 0.2rem 0.4rem; border-radius: 4px; font-weight: 600; font-size: 0.72rem;">${escapeHTML(currentStatus)}</span>`;
                    }).join(' ');
                }
                return `<div style="${rowStyle(i)}">${content}</div>`;
            }).join('');
        } else if (type === 'Transport' && trDataArray.length > 0) {
            const rowStyle = (i) => i === 0
                ? 'height: 30px; display: flex; align-items: center;'
                : 'height: 30px; display: flex; align-items: center; border-top: 1px dashed #e5e7eb;';
            prHtml = trDataArray.map((tr, i) => {
                const statusClass = getStatusClass(tr.finance_status || 'Pending');
                const isApproved = tr.finance_status === 'Approved';
                let badge;
                if (isApproved) {
                    const fillData = getTRPaymentFill(tr.tr_id, tr.total_amount);
                    const emptyBg = '#e5e7eb';
                    const bgStyle = fillData.pct > 0 && fillData.pct < 100
                        ? `background:linear-gradient(to right, ${fillData.color} ${fillData.pct}%, ${emptyBg} ${fillData.pct}%)`
                        : fillData.pct >= 100
                        ? `background:${fillData.color}`
                        : `background:${emptyBg}`;
                    badge = `<a href="javascript:void(0)"
                        onclick="window.viewTRDetails('${tr.docId}')"
                        oncontextmenu="event.preventDefault(); window.showTRRFPContextMenu(event, '${tr.docId}'); return false;"
                        title="${escapeHTML(fillData.tooltip)}"
                        style="padding:0.25rem 0.75rem;border-radius:12px;font-size:0.75rem;font-weight:600;color:#1e293b;text-decoration:none;cursor:pointer;white-space:nowrap;display:inline-block;${bgStyle}">
                        ${escapeHTML(tr.tr_id)}</a>`;
                } else {
                    badge = `<span class="status-badge ${statusClass}"
                        style="font-size:0.75rem;display:inline-block;white-space:nowrap;cursor:pointer;"
                        onclick="window.viewTRDetails('${tr.docId}')">
                        ${escapeHTML(tr.tr_id)}</span>`;
                }
                return `<div style="${rowStyle(i)}">${badge}</div>`;
            }).join('');
            // poHtml stays '-'; procStatusHtml stays '-'
        }

        let proofHtml = '<span style="color: #999; font-size: 0.875rem;">-</span>';

        if (type === 'Material' && prDataArray.length > 0) {
            proofHtml = prDataArray.map((pr, i) => {
                const matchedPOs = posByPrId[pr.pr_id] || [];
                let content;
                if (matchedPOs.length === 0) {
                    content = `<span style="color: #94a3b8; font-size: 0.75rem;">&#8212;</span>`;
                } else {
                    content = matchedPOs.map(po => {
                        const hasProof = !!po.proof_url;
                        const hasRemarks = !!po.proof_remarks;
                        if (hasProof) {
                            return `<span class="proof-indicator proof-filled"
                                title="Left-click to open proof &middot; Right-click to replace"
                                onclick="window.open('${escapeHTML(po.proof_url)}', '_blank')"
                                oncontextmenu="event.preventDefault(); window.showProofModal('${po.docId}', '${escapeHTML(po.proof_url)}', false, null, '${escapeHTML(po.proof_remarks || '')}')"
                                onmouseenter="this.style.opacity='0.85'" onmouseleave="this.style.opacity='1'"
                                ontouchstart="window._proofLongPress=setTimeout(()=>{event.preventDefault();window.showProofModal('${po.docId}','${escapeHTML(po.proof_url)}',false,null,'${escapeHTML(po.proof_remarks || '')}')},600)"
                                ontouchend="clearTimeout(window._proofLongPress)"
                                style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#34a853;color:#fff;font-size:12px;cursor:pointer;user-select:none;">&#10003;</span>`;
                        } else if (hasRemarks) {
                            return `<span class="proof-indicator proof-remarks"
                                title="Remarks only (no link) &middot; Click to view/edit"
                                onclick="window.showProofModal('${po.docId}', '', false, null, '${escapeHTML(po.proof_remarks)}')"
                                onmouseenter="this.style.opacity='0.85'" onmouseleave="this.style.opacity='1'"
                                style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#f59e0b;color:#fff;font-size:14px;font-weight:700;cursor:pointer;user-select:none;">&ndash;</span>`;
                        } else {
                            return `<span class="proof-indicator proof-empty"
                                title="Click to attach proof"
                                onclick="window.showProofModal('${po.docId}', '', false, null, '')"
                                onmouseenter="this.style.borderColor='#1a73e8';this.style.background='rgba(26,115,232,0.05)'"
                                onmouseleave="this.style.borderColor='#bdc1c6';this.style.background='transparent'"
                                style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;border:1.5px solid #bdc1c6;background:transparent;cursor:pointer;user-select:none;">&nbsp;</span>`;
                        }
                    }).join(' ');
                }
                const rowStyle = i === 0
                    ? 'height: 30px; display: flex; align-items: center; justify-content: center;'
                    : 'height: 30px; display: flex; align-items: center; justify-content: center; border-top: 1px dashed #e5e7eb;';
                return `<div style="${rowStyle}">${content}</div>`;
            }).join('');
        }

        if (type === 'Transport' && trDataArray.length > 0) {
            proofHtml = trDataArray.map((tr, i) => {
                const isApproved = tr.finance_status === 'Approved';
                if (!isApproved) {
                    const proofRowStyle = i === 0
                        ? 'height: 30px; display: flex; align-items: center; justify-content: center;'
                        : 'height: 30px; display: flex; align-items: center; justify-content: center; border-top: 1px dashed #e5e7eb;';
                    return `<div style="${proofRowStyle}">&nbsp;</div>`;
                }
                const hasProof = !!tr.proof_url;
                const hasRemarks = !!tr.proof_remarks;
                let content;
                if (hasProof) {
                    content = `<span class="proof-indicator proof-filled"
                        title="Left-click to open proof &middot; Right-click to replace"
                        onclick="window.open('${escapeHTML(tr.proof_url)}', '_blank')"
                        oncontextmenu="event.preventDefault(); window.showProofModal('${tr.docId}', '${escapeHTML(tr.proof_url)}', false, null, '${escapeHTML(tr.proof_remarks || '')}', null, 'transport_requests')"
                        onmouseenter="this.style.opacity='0.85'" onmouseleave="this.style.opacity='1'"
                        ontouchstart="window._proofLongPress=setTimeout(()=>{event.preventDefault();window.showProofModal('${tr.docId}','${escapeHTML(tr.proof_url)}',false,null,'${escapeHTML(tr.proof_remarks || '')}',null,'transport_requests')},600)"
                        ontouchend="clearTimeout(window._proofLongPress)"
                        style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#34a853;color:#fff;font-size:12px;cursor:pointer;user-select:none;">&#10003;</span>`;
                } else if (hasRemarks) {
                    content = `<span class="proof-indicator proof-remarks"
                        title="Remarks only (no link) &middot; Click to view/edit"
                        onclick="window.showProofModal('${tr.docId}', '', false, null, '${escapeHTML(tr.proof_remarks)}', null, 'transport_requests')"
                        onmouseenter="this.style.opacity='0.85'" onmouseleave="this.style.opacity='1'"
                        style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#f59e0b;color:#fff;font-size:14px;font-weight:700;cursor:pointer;user-select:none;">&ndash;</span>`;
                } else {
                    content = `<span class="proof-indicator proof-empty"
                        title="Click to attach proof"
                        onclick="window.showProofModal('${tr.docId}', '', false, null, '', null, 'transport_requests')"
                        onmouseenter="this.style.borderColor='#1a73e8';this.style.background='rgba(26,115,232,0.05)'"
                        onmouseleave="this.style.borderColor='#bdc1c6';this.style.background='transparent'"
                        style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;border:1.5px solid #bdc1c6;background:transparent;cursor:pointer;user-select:none;">&nbsp;</span>`;
                }
                const proofRowStyle = i === 0
                    ? 'height: 30px; display: flex; align-items: center; justify-content: center;'
                    : 'height: 30px; display: flex; align-items: center; justify-content: center; border-top: 1px dashed #e5e7eb;';
                return `<div style="${proofRowStyle}">${content}</div>`;
            }).join('');
        }

        // Append TR badge(s) for Material MRFs that also have transport items (mixed PRs + TRs)
        if (type === 'Material' && trDataArray.length > 0) {
            const hasPrs = prDataArray.length > 0;
            const trBadges = trDataArray.map((tr, i) => {
                const statusClass = getStatusClass(tr.finance_status || 'Pending');
                const isApproved = tr.finance_status === 'Approved';
                let badge;
                if (isApproved) {
                    const fillData = getTRPaymentFill(tr.tr_id, tr.total_amount);
                    const emptyBg = '#e5e7eb';
                    const bgStyle = fillData.pct > 0 && fillData.pct < 100
                        ? `background:linear-gradient(to right, ${fillData.color} ${fillData.pct}%, ${emptyBg} ${fillData.pct}%)`
                        : fillData.pct >= 100
                        ? `background:${fillData.color}`
                        : `background:${emptyBg}`;
                    badge = `<a href="javascript:void(0)"
                        onclick="window.viewTRDetails('${tr.docId}')"
                        oncontextmenu="event.preventDefault(); window.showTRRFPContextMenu(event, '${tr.docId}'); return false;"
                        title="${escapeHTML(fillData.tooltip)}"
                        style="padding:0.25rem 0.75rem;border-radius:12px;font-size:0.75rem;font-weight:600;color:#1e293b;text-decoration:none;cursor:pointer;white-space:nowrap;display:inline-block;${bgStyle}">
                        ${escapeHTML(tr.tr_id)}</a>`;
                } else {
                    badge = `<span class="status-badge ${statusClass}"
                        style="font-size:0.75rem;display:inline-block;white-space:nowrap;cursor:pointer;"
                        onclick="window.viewTRDetails('${tr.docId}')">
                        ${escapeHTML(tr.tr_id)}</span>`;
                }
                const rowStyleStr = (hasPrs || i > 0)
                    ? 'height: 30px; display: flex; align-items: center; border-top: 1px dashed #e5e7eb;'
                    : 'height: 30px; display: flex; align-items: center;';
                return `<div style="${rowStyleStr}">${badge}</div>`;
            }).join('');
            prHtml = hasPrs ? prHtml + trBadges : trBadges;

            // Append TR proof indicators for Material+TR mixed rows
            const hasPOProof = prDataArray.length > 0;
            const trProofIndicators = trDataArray.map((tr, i) => {
                const isApprovedTR = tr.finance_status === 'Approved';
                if (!isApprovedTR) {
                    const proofRowStyle = (hasPOProof || i > 0)
                        ? 'height: 30px; display: flex; align-items: center; justify-content: center; border-top: 1px dashed #e5e7eb;'
                        : 'height: 30px; display: flex; align-items: center; justify-content: center;';
                    return `<div style="${proofRowStyle}">&nbsp;</div>`;
                }
                const hasProof = !!tr.proof_url;
                const hasRemarks = !!tr.proof_remarks;
                let content;
                if (hasProof) {
                    content = `<span class="proof-indicator proof-filled"
                        title="Left-click to open proof &middot; Right-click to replace"
                        onclick="window.open('${escapeHTML(tr.proof_url)}', '_blank')"
                        oncontextmenu="event.preventDefault(); window.showProofModal('${tr.docId}', '${escapeHTML(tr.proof_url)}', false, null, '${escapeHTML(tr.proof_remarks || '')}', null, 'transport_requests')"
                        onmouseenter="this.style.opacity='0.85'" onmouseleave="this.style.opacity='1'"
                        ontouchstart="window._proofLongPress=setTimeout(()=>{event.preventDefault();window.showProofModal('${tr.docId}','${escapeHTML(tr.proof_url)}',false,null,'${escapeHTML(tr.proof_remarks || '')}',null,'transport_requests')},600)"
                        ontouchend="clearTimeout(window._proofLongPress)"
                        style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#34a853;color:#fff;font-size:12px;cursor:pointer;user-select:none;">&#10003;</span>`;
                } else if (hasRemarks) {
                    content = `<span class="proof-indicator proof-remarks"
                        title="Remarks only (no link) &middot; Click to view/edit"
                        onclick="window.showProofModal('${tr.docId}', '', false, null, '${escapeHTML(tr.proof_remarks)}', null, 'transport_requests')"
                        onmouseenter="this.style.opacity='0.85'" onmouseleave="this.style.opacity='1'"
                        style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#f59e0b;color:#fff;font-size:14px;font-weight:700;cursor:pointer;user-select:none;">&ndash;</span>`;
                } else {
                    content = `<span class="proof-indicator proof-empty"
                        title="Click to attach proof"
                        onclick="window.showProofModal('${tr.docId}', '', false, null, '', null, 'transport_requests')"
                        onmouseenter="this.style.borderColor='#1a73e8';this.style.background='rgba(26,115,232,0.05)'"
                        onmouseleave="this.style.borderColor='#bdc1c6';this.style.background='transparent'"
                        style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;border:1.5px solid #bdc1c6;background:transparent;cursor:pointer;user-select:none;">&nbsp;</span>`;
                }
                const proofRowStyle = (hasPOProof || i > 0)
                    ? 'height: 30px; display: flex; align-items: center; justify-content: center; border-top: 1px dashed #e5e7eb;'
                    : 'height: 30px; display: flex; align-items: center; justify-content: center;';
                return `<div style="${proofRowStyle}">${content}</div>`;
            }).join('');
            proofHtml = hasPOProof ? proofHtml + trProofIndicators : trProofIndicators;
        }

        return `
            <tr>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; font-size: 0.85rem; text-align: center; vertical-align: middle; cursor: context-menu;"
                    oncontextmenu="event.preventDefault(); window.showMRFContextMenu(event, '${mrf.id}', '${escapeHTML(mrf.status)}'); return false;">
                    <strong>${escapeHTML(displayId)}</strong></td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; font-size: 0.85rem; text-align: left; vertical-align: middle;">${escapeHTML(getMRFLabel(mrf))}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: center; vertical-align: middle; font-size: 0.85rem;">${mrf.date_needed ? formatDate(mrf.date_needed) : (formatTimestamp(mrf.date_submitted || mrf.created_at) || 'N/A')}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top;">${prHtml}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top;">${poHtml}</td>
                <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid #e5e7eb; text-align: center; vertical-align: top;">${proofHtml}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: middle;">
                    ${mrfStatusHtml}
                </td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top;">${procStatusHtml}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: center; vertical-align: middle;">
                    <button class="btn btn-sm btn-secondary" style="padding: 6px 12px; font-size: 0.75rem; white-space: nowrap;" onclick="window.showProcurementTimeline('${mrf.mrf_id}')">
                        Timeline
                    </button>
                </td>
            </tr>
        `;
    }));

    // Build complete table
    let html = `
        <div class="table-scroll-container">
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #f8f9fa;">
                    <th onclick="window.sortPRPORecords('mrf_id')" style="text-align: center; cursor: pointer; user-select: none;">
                        MRF ID ${getPRPOSortIndicator('mrf_id')}
                    </th>
                    <th style="text-align: left;">Project</th>
                    <th onclick="window.sortPRPORecords('date_needed')" style="text-align: center; cursor: pointer; user-select: none;">
                        Date Needed ${getPRPOSortIndicator('date_needed')}
                    </th>
                    <th style="text-align: left;">PRs</th>
                    <th style="text-align: left;">POs</th>
                    <th style="text-align: center; width: 40px;">Proof</th>
                    <th onclick="window.sortPRPORecords('status')" style="text-align: left; cursor: pointer; user-select: none;">
                        MRF Status ${getPRPOSortIndicator('status')}
                    </th>
                    <th onclick="window.sortPRPORecords('procurement_status')" style="text-align: left; cursor: pointer; user-select: none;">
                        Procurement Status ${getPRPOSortIndicator('procurement_status')}
                    </th>
                    <th style="text-align: center;">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${rows.join('')}
            </tbody>
        </table>
        </div>
    `;

    container.innerHTML = html;
    renderPRPOPagination(totalPages);
}

/**
 * Render MRF Records Pagination
 */
function renderPRPOPagination(totalPages) {
    const paginationDiv = document.getElementById('prpoPagination');
    if (!paginationDiv || totalPages <= 1) {
        if (paginationDiv) paginationDiv.innerHTML = '';
        return;
    }

    const startIndex = (prpoCurrentPage - 1) * prpoItemsPerPage;
    const endIndex = Math.min(startIndex + prpoItemsPerPage, filteredPRPORecords.length);

    let html = `
        <div class="pagination-info">
            Showing <strong>${startIndex + 1}-${endIndex}</strong> of <strong>${filteredPRPORecords.length}</strong> Records
        </div>
        <div class="pagination-controls">
            <button class="pagination-btn" onclick="goToPRPOPage(${prpoCurrentPage - 1})" ${prpoCurrentPage === 1 ? 'disabled' : ''}>
                ← Previous
            </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= prpoCurrentPage - 1 && i <= prpoCurrentPage + 1)) {
            html += `
                <button class="pagination-btn ${i === prpoCurrentPage ? 'active' : ''}" onclick="goToPRPOPage(${i})">
                    ${i}
                </button>
            `;
        } else if (i === prpoCurrentPage - 2 || i === prpoCurrentPage + 2) {
            html += '<span class="pagination-ellipsis">...</span>';
        }
    }

    html += `
            <button class="pagination-btn" onclick="goToPRPOPage(${prpoCurrentPage + 1})" ${prpoCurrentPage === totalPages ? 'disabled' : ''}>
                Next →
            </button>
        </div>
    `;

    paginationDiv.className = 'pagination-container';
    paginationDiv.innerHTML = html;
}

/**
 * Go to PR-PO Page
 */
function goToPRPOPage(page) {
    prpoCurrentPage = page;
    renderPRPORecords();
}

// Placeholder stubs for remaining functions
// ========================================
// PR & TR GENERATION FUNCTIONS
// ========================================

/**
 * Submit Transport Request (TR) for transport/hauling items
 * Filters transport items, validates, and creates TR document
 */
async function submitTransportRequest() {
    if (window.canEditTab?.('procurement') === false) {
        showToast('You do not have permission to edit procurement data', 'error');
        return;
    }

    if (!currentMRF) return;

    const mrfData = currentMRF;

    // Transport categories
    const transportCategories = ['TRANSPORTATION', 'HAULING & DELIVERY'];

    // Collect all items from DOM
    const itemRows = document.querySelectorAll('#lineItemsBody tr');
    const allItems = [];

    for (const row of itemRows) {
        const itemName = row.querySelector('input.item-name')?.value?.trim() || '';
        const category = row.querySelector('select.item-category')?.value || '';
        const qty = parseFloat(row.querySelector('input.item-qty')?.value) || 0;
        const unit = row.querySelector('select.item-unit')?.value || 'pcs';
        const unitCost = parseFloat(row.querySelector('input.unit-cost')?.value) || 0;
        const supplier = row.querySelector('select.supplier-select')?.value || '';

        if (!itemName) continue;

        if (qty <= 0) {
            showToast(`Please enter quantity for item: ${itemName}`, 'error');
            return;
        }
        if (unitCost === 0) {
            showToast(`Please enter unit cost for item: ${itemName}`, 'error');
            return;
        }

        allItems.push({
            item: itemName,
            category: category || 'N/A',
            qty: qty,
            unit: unit || 'pcs',
            unit_cost: unitCost,
            supplier: supplier,
            subtotal: qty * unitCost
        });
    }

    if (allItems.length === 0) {
        showToast('At least one item is required', 'error');
        return;
    }

    // Filter transport items only
    const trItems = allItems.filter(item => transportCategories.includes(item.category));

    if (trItems.length === 0) {
        showToast('No transport/hauling items found. Use Generate PR for material items.', 'error');
        return;
    }

    const nonTRItems = allItems.filter(item => !transportCategories.includes(item.category));
    if (nonTRItems.length > 0) {
        showToast('Mixed items detected. Use "Generate PR & TR" button for items with both materials and transport.', 'error');
        return;
    }

    // Validate all TR items
    for (const item of trItems) {
        if (item.qty <= 0 || item.unit_cost === 0) {
            showToast(`Invalid quantity or cost for item: ${item.item}`, 'error');
            return;
        }
    }

    // Show confirmation
    const totalCost = trItems.reduce((sum, item) => sum + item.subtotal, 0);
    const confirmMsg = `Submit Transport Request for ${trItems.length} item(s)?\n\nTotal Cost: PHP ${totalCost.toLocaleString()}`;

    if (!confirm(confirmMsg)) return;

    showLoading(true);

    try {
        // Get primary supplier (first transport item with supplier, or default to 'TRANSPORT')
        const primarySupplier = trItems.find(item => item.supplier)?.supplier || 'TRANSPORT';

        // Generate TR ID: TR_YYYY_MM-###-SUPPLIER
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const currentMonthPrefix = `TR_${year}_${month}`;

        // Get all TRs to find next number
        const trsSnapshot = await getDocs(collection(db, 'transport_requests'));
        let maxTRNum = 0;

        trsSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.tr_id) {
                // Match format: TR_YYYY_MM-###
                const newMatch = data.tr_id.match(/TR_\d{4}_\d{2}-(\d+)/);
                if (newMatch && data.tr_id.startsWith(currentMonthPrefix)) {
                    const num = parseInt(newMatch[1]);
                    if (num > maxTRNum) maxTRNum = num;
                }
                // Also check old format: TR-YYYY-###
                const oldMatch = data.tr_id.match(/TR-\d{4}-(\d+)/);
                if (oldMatch) {
                    const num = parseInt(oldMatch[1]);
                    if (num > maxTRNum) maxTRNum = num;
                }
            }
        });

        const trId = `TR_${year}_${month}-${String(maxTRNum + 1).padStart(3, '0')}`;

        // Get delivery address
        const deliveryAddressEl = document.getElementById('deliveryAddress');
        const deliveryAddress = deliveryAddressEl ? deliveryAddressEl.value : (mrfData.delivery_address || '');

        // Create TR document
        await addDoc(collection(db, 'transport_requests'), {
            tr_id: trId,
            mrf_id: mrfData.mrf_id,
            mrf_doc_id: mrfData.id,
            project_code: mrfData.project_code || '',
            project_name: mrfData.project_name,
            service_code: mrfData.service_code || '',
            service_name: mrfData.service_name || '',
            department: mrfData.department || 'projects',
            requestor_name: mrfData.requestor_name,
            urgency_level: mrfData.urgency_level || 'Low',
            supplier_name: primarySupplier,
            delivery_address: deliveryAddress,
            items_json: JSON.stringify(trItems),
            justification: mrfData.justification || '',
            cost: totalCost,
            total_amount: totalCost,
            finance_status: 'Pending',
            date_submitted: new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString()
        });

        // Update MRF with TR link — do NOT change MRF status (TR actions are scoped to transport_requests)
        const mrfRef = doc(db, 'mrfs', mrfData.id);
        await updateDoc(mrfRef, {
            tr_id: trId,
            items_json: JSON.stringify(trItems),
            updated_at: new Date().toISOString()
        });

        showToast(`Transport Request submitted successfully! TR ID: ${trId}`, 'success');

        // Clear MRF details
        currentMRF = null;
        const mrfDetails = document.getElementById('mrfDetails');
        if (mrfDetails) {
            mrfDetails.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #666;">
                    <div style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">✓ Transport Request Submitted</div>
                    <div style="font-size: 0.875rem; margin-top: 0.5rem;">TR has been sent to Finance for approval.</div>
                    <div style="font-size: 0.875rem; margin-top: 0.25rem;">Select another MRF to view details.</div>
                </div>
            `;
        }

    } catch (error) {
        console.error('Error submitting transport request:', error);
        showToast('Failed to submit transport request: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
};

/**
 * Generate Purchase Request (PR) for material items
 * Handles update/merge/create logic for PRs grouped by supplier
 */
async function generatePR() {
    if (window.canEditTab?.('procurement') === false) {
        showToast('You do not have permission to edit procurement data', 'error');
        return;
    }

    if (!currentMRF) return;

    const currentUser = window.getCurrentUser();

    if (!currentUser) {
        showToast('Session expired. Please log in again.', 'error');
        return;
    }

    const mrfData = currentMRF;

    // Transport categories
    const transportCategories = ['TRANSPORTATION', 'HAULING & DELIVERY'];

    // Collect all items from DOM
    const itemRows = document.querySelectorAll('#lineItemsBody tr');
    const allItems = [];

    for (const row of itemRows) {
        const itemName = row.querySelector('input.item-name')?.value?.trim() || '';
        const category = row.querySelector('select.item-category')?.value || '';
        const qty = parseFloat(row.querySelector('input.item-qty')?.value) || 0;
        const unit = row.querySelector('select.item-unit')?.value || 'pcs';
        const unitCost = parseFloat(row.querySelector('input.unit-cost')?.value) || 0;
        const supplier = row.querySelector('select.supplier-select')?.value || '';

        if (!itemName) continue;

        if (qty <= 0) {
            showToast(`Please enter quantity for item: ${itemName}`, 'error');
            return;
        }
        if (unitCost === 0) {
            showToast(`Please enter unit cost for item: ${itemName}`, 'error');
            return;
        }
        // Supplier is required for PR items
        if (!transportCategories.includes(category) && !supplier) {
            showToast(`Please select supplier for item: ${itemName}`, 'error');
            return;
        }

        allItems.push({
            item: itemName,
            category: category || 'N/A',
            qty: qty,
            unit: unit || 'pcs',
            unit_cost: unitCost,
            supplier: supplier,
            subtotal: qty * unitCost
        });
    }

    if (allItems.length === 0) {
        showToast('At least one item is required', 'error');
        return;
    }

    // Filter PR items (exclude transport items)
    const prItems = allItems.filter(item => !transportCategories.includes(item.category));

    if (prItems.length === 0) {
        showToast('No material items found. Use Submit TR for transport items.', 'error');
        return;
    }

    const trItems = allItems.filter(item => transportCategories.includes(item.category));
    if (trItems.length > 0) {
        showToast('Mixed items detected. Use "Generate PR & TR" button for items with both materials and transport.', 'error');
        return;
    }

    // Show confirmation
    const totalCost = prItems.reduce((sum, item) => sum + item.subtotal, 0);
    const uniqueSuppliers = [...new Set(prItems.map(item => item.supplier))];
    const confirmMsg = `Generate PR for ${prItems.length} item(s) from ${uniqueSuppliers.length} supplier(s)?\n\nTotal: PHP ${totalCost.toLocaleString()}`;

    if (!confirm(confirmMsg)) return;

    showLoading(true);

    try {
        const generatedPRIds = [];
        const updatedPRIds = [];
        const mergedPRIds = [];

        // Group items by supplier
        const itemsBySupplier = {};
        prItems.forEach(item => {
            if (!itemsBySupplier[item.supplier]) {
                itemsBySupplier[item.supplier] = [];
            }
            itemsBySupplier[item.supplier].push(item);
        });

        const suppliers = Object.keys(itemsBySupplier);
        const prsRef = collection(db, 'prs');

        // Check for existing PRs for this MRF
        const existingPRsQuery = query(prsRef, where('mrf_id', '==', mrfData.mrf_id));
        const existingPRsSnapshot = await getDocs(existingPRsQuery);

        const existingPRsBySupplier = {};
        const rejectedPRs = [];
        const approvedPRs = [];

        existingPRsSnapshot.forEach((docSnap) => {
            const pr = { id: docSnap.id, ...docSnap.data() };
            const supplierName = pr.supplier_name;
            if (!existingPRsBySupplier[supplierName]) {
                existingPRsBySupplier[supplierName] = [];
            }
            existingPRsBySupplier[supplierName].push(pr);
            if (pr.finance_status === 'Rejected') {
                rejectedPRs.push(pr);
            } else if (pr.finance_status === 'Approved') {
                approvedPRs.push(pr);
            }
        });

        // Get next PR number
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const currentMonthPrefix = `PR_${year}_${month}`;

        const allPRsSnapshot = await getDocs(prsRef);
        let maxPRNum = 0;
        allPRsSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.pr_id) {
                const match = data.pr_id.match(/PR_\d{4}_\d{2}-(\d+)/);
                if (match && data.pr_id.startsWith(currentMonthPrefix)) {
                    const num = parseInt(match[1]);
                    if (num > maxPRNum) maxPRNum = num;
                }
            }
        });
        let nextNum = maxPRNum + 1;

        // Get delivery address
        const deliveryAddressEl = document.getElementById('deliveryAddress');
        const deliveryAddress = deliveryAddressEl ? deliveryAddressEl.value : (mrfData.delivery_address || '');

        // Process each supplier's items
        for (const supplier of suppliers) {
            const supplierItems = itemsBySupplier[supplier];
            const supplierTotal = supplierItems.reduce((sum, item) => sum + item.subtotal, 0);
            const existingPRs = existingPRsBySupplier[supplier] || [];
            const rejectedPR = existingPRs.find(pr => pr.finance_status === 'Rejected');
            const approvedPR = existingPRs.find(pr => pr.finance_status === 'Approved');

            if (rejectedPR) {
                // Case 1: Update rejected PR (reuse PR ID, change status to Pending)
                const prRef = doc(db, 'prs', rejectedPR.id);
                await updateDoc(prRef, {
                    items_json: JSON.stringify(supplierItems),
                    total_amount: supplierTotal,
                    finance_status: 'Pending',
                    updated_at: new Date().toISOString(),
                    resubmitted_at: new Date().toISOString(),
                    pr_creator_user_id: currentUser.uid,
                    pr_creator_name: currentUser.full_name || currentUser.email || 'Unknown User'
                });
                generatedPRIds.push(rejectedPR.pr_id);
                updatedPRIds.push(rejectedPR.pr_id);

            } else if (approvedPR) {
                // Case 2: Merge into approved PR (add new items to existing PR)
                const existingItems = JSON.parse(approvedPR.items_json || '[]');
                const existingItemNames = existingItems.map(i => i.item);

                // Only add items that don't already exist
                const itemsToAdd = supplierItems.filter(i => !existingItemNames.includes(i.item));

                if (itemsToAdd.length > 0) {
                    const mergedItems = [...existingItems, ...itemsToAdd];
                    const mergedTotal = mergedItems.reduce((sum, item) => sum + parseFloat(item.subtotal || 0), 0);

                    const prRef = doc(db, 'prs', approvedPR.id);
                    await updateDoc(prRef, {
                        items_json: JSON.stringify(mergedItems),
                        total_amount: mergedTotal,
                        updated_at: new Date().toISOString(),
                        items_merged: true,
                        pr_creator_user_id: currentUser.uid,
                        pr_creator_name: currentUser.full_name || currentUser.email || 'Unknown User'
                    });
                    mergedPRIds.push(approvedPR.pr_id);
                }
                generatedPRIds.push(approvedPR.pr_id);

            } else {
                // Case 3: Create new PR
                const firstWord = supplier.split(/\s+/)[0] || supplier;
                const supplierSlug = firstWord.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toUpperCase();
                const prId = `PR_${year}_${month}-${String(nextNum).padStart(3, '0')}-${supplierSlug}`;

                const prDoc = {
                    pr_id: prId,
                    mrf_id: mrfData.mrf_id,
                    mrf_doc_id: mrfData.id,
                    supplier_name: supplier,
                    project_code: mrfData.project_code || '',
                    project_name: mrfData.project_name,
                    service_code: mrfData.service_code || '',
                    service_name: mrfData.service_name || '',
                    department: mrfData.department || 'projects',
                    requestor_name: mrfData.requestor_name,
                    urgency_level: mrfData.urgency_level || 'Low',
                    delivery_address: deliveryAddress,
                    items_json: JSON.stringify(supplierItems),
                    total_amount: supplierTotal,
                    finance_status: 'Pending',
                    date_generated: new Date().toISOString().split('T')[0],
                    created_at: serverTimestamp(),
                    pr_creator_user_id: currentUser.uid,
                    pr_creator_name: currentUser.full_name || currentUser.email || 'Unknown User'
                };

                await addDoc(collection(db, 'prs'), prDoc);
                generatedPRIds.push(prId);
                nextNum++;
            }
        }

        // Delete rejected PRs that were NOT updated (supplier was changed)
        const deletedPRIds = [];
        for (const rejectedPR of rejectedPRs) {
            if (!updatedPRIds.includes(rejectedPR.pr_id)) {
                const prRef = doc(db, 'prs', rejectedPR.id);
                await deleteDoc(prRef);
                deletedPRIds.push(rejectedPR.pr_id);
            }
        }

        // Update MRF status
        const mrfRef = doc(db, 'mrfs', mrfData.id);
        await updateDoc(mrfRef, {
            status: 'PR Generated',
            pr_ids: generatedPRIds,
            items_json: JSON.stringify(prItems),
            updated_at: new Date().toISOString(),
            pr_rejection_reason: null,
            rejected_pr_id: null,
            is_rejected: false
        });

        // Build success message
        const msgParts = [];
        if (updatedPRIds.length > 0) {
            msgParts.push(`Updated ${updatedPRIds.length} rejected PR(s): ${updatedPRIds.join(', ')}`);
        }
        if (mergedPRIds.length > 0) {
            msgParts.push(`Merged items into ${mergedPRIds.length} approved PR(s): ${mergedPRIds.join(', ')}`);
        }
        const newPRIds = generatedPRIds.filter(id => !updatedPRIds.includes(id) && !mergedPRIds.includes(id));
        if (newPRIds.length > 0) {
            msgParts.push(`Created ${newPRIds.length} new PR(s): ${newPRIds.join(', ')}`);
        }
        if (deletedPRIds.length > 0) {
            msgParts.push(`Removed ${deletedPRIds.length} old rejected PR(s): ${deletedPRIds.join(', ')}`);
        }

        showToast(`PR(s) processed successfully! ${msgParts.join('. ')}`, 'success');

        // Clear MRF details
        currentMRF = null;
        const mrfDetails = document.getElementById('mrfDetails');
        if (mrfDetails) {
            mrfDetails.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #666;">
                    <div style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">✓ PR Generated Successfully</div>
                    <div style="font-size: 0.875rem; margin-top: 0.5rem;">The MRF has been processed and moved to Historical MRFs.</div>
                    <div style="font-size: 0.875rem; margin-top: 0.25rem;">Select another MRF to view details.</div>
                </div>
            `;
        }

    } catch (error) {
        console.error('Error generating PR:', error);
        showToast('Failed to generate PR: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
};

/**
 * Generate PR & TR - Unified function for mixed items
 * Processes both material items (as PR) and transport items (as TR) in one action
 */
async function generatePRandTR() {
    if (window.canEditTab?.('procurement') === false) {
        showToast('You do not have permission to edit procurement data', 'error');
        return;
    }

    if (!currentMRF) return;

    const currentUser = window.getCurrentUser();

    if (!currentUser) {
        showToast('Session expired. Please log in again.', 'error');
        return;
    }

    const mrfData = currentMRF;

    // Transport categories
    const transportCategories = ['TRANSPORTATION', 'HAULING & DELIVERY'];

    // Collect all items from DOM
    const itemRows = document.querySelectorAll('#lineItemsBody tr');
    const allItems = [];

    for (const row of itemRows) {
        const itemName = row.querySelector('input.item-name')?.value?.trim() || '';
        const category = row.querySelector('select.item-category')?.value || '';
        const qty = parseFloat(row.querySelector('input.item-qty')?.value) || 0;
        const unit = row.querySelector('select.item-unit')?.value || 'pcs';
        const unitCost = parseFloat(row.querySelector('input.unit-cost')?.value) || 0;
        const supplier = row.querySelector('select.supplier-select')?.value || '';

        if (!itemName) continue;

        if (qty <= 0) {
            showToast(`Please enter quantity for item: ${itemName}`, 'error');
            return;
        }
        if (unitCost === 0) {
            showToast(`Please enter unit cost for item: ${itemName}`, 'error');
            return;
        }
        // Supplier is required for PR items, optional for TR items
        if (!transportCategories.includes(category) && !supplier) {
            showToast(`Please select supplier for item: ${itemName}`, 'error');
            return;
        }

        allItems.push({
            item: itemName,
            category: category || 'N/A',
            qty: qty,
            unit: unit || 'pcs',
            unit_cost: unitCost,
            supplier: supplier,
            subtotal: qty * unitCost
        });
    }

    if (allItems.length === 0) {
        showToast('At least one item is required', 'error');
        return;
    }

    // Separate items
    const prItems = allItems.filter(item => !transportCategories.includes(item.category));
    const trItems = allItems.filter(item => transportCategories.includes(item.category));

    if (prItems.length === 0 || trItems.length === 0) {
        showToast('Mixed items required for PR & TR. Use individual buttons for single type.', 'error');
        return;
    }

    // Show confirmation with summary
    const confirmMsg = `Generate PR & TR for this MRF?\n\n` +
        `PR Items: ${prItems.length} item(s) - PHP ${prItems.reduce((sum, i) => sum + i.subtotal, 0).toLocaleString()}\n` +
        `TR Items: ${trItems.length} item(s) - PHP ${trItems.reduce((sum, i) => sum + i.subtotal, 0).toLocaleString()}`;

    if (!confirm(confirmMsg)) return;

    showLoading(true);

    try {
        const generatedPRIds = [];
        const updatedPRIds = [];
        const mergedPRIds = [];
        let trId = null;

        // ========== PART 1: Process PR Items ==========

        // Group PR items by supplier
        const itemsBySupplier = {};
        prItems.forEach(item => {
            if (!itemsBySupplier[item.supplier]) {
                itemsBySupplier[item.supplier] = [];
            }
            itemsBySupplier[item.supplier].push(item);
        });

        const suppliers = Object.keys(itemsBySupplier);
        const prsRef = collection(db, 'prs');

        // Check for existing PRs for this MRF
        const existingPRsQuery = query(prsRef, where('mrf_id', '==', mrfData.mrf_id));
        const existingPRsSnapshot = await getDocs(existingPRsQuery);

        const existingPRsBySupplier = {};
        const rejectedPRs = [];
        const approvedPRs = [];

        existingPRsSnapshot.forEach((docSnap) => {
            const pr = { id: docSnap.id, ...docSnap.data() };
            const supplierName = pr.supplier_name;
            if (!existingPRsBySupplier[supplierName]) {
                existingPRsBySupplier[supplierName] = [];
            }
            existingPRsBySupplier[supplierName].push(pr);
            if (pr.finance_status === 'Rejected') {
                rejectedPRs.push(pr);
            } else if (pr.finance_status === 'Approved') {
                approvedPRs.push(pr);
            }
        });

        // Get next PR number
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const currentMonthPrefix = `PR_${year}_${month}`;

        const allPRsSnapshot = await getDocs(prsRef);
        let maxPRNum = 0;
        allPRsSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.pr_id) {
                const match = data.pr_id.match(/PR_\d{4}_\d{2}-(\d+)/);
                if (match && data.pr_id.startsWith(currentMonthPrefix)) {
                    const num = parseInt(match[1]);
                    if (num > maxPRNum) maxPRNum = num;
                }
            }
        });
        let nextPRNum = maxPRNum + 1;

        // Process each supplier's items
        const deliveryAddressEl = document.getElementById('deliveryAddress');
        const deliveryAddress = deliveryAddressEl ? deliveryAddressEl.value : (mrfData.delivery_address || '');

        for (const supplier of suppliers) {
            const supplierItems = itemsBySupplier[supplier];
            const supplierTotal = supplierItems.reduce((sum, item) => sum + item.subtotal, 0);
            const existingPRs = existingPRsBySupplier[supplier] || [];
            const rejectedPR = existingPRs.find(pr => pr.finance_status === 'Rejected');
            const approvedPR = existingPRs.find(pr => pr.finance_status === 'Approved');

            if (rejectedPR) {
                // Update rejected PR
                const prRef = doc(db, 'prs', rejectedPR.id);
                await updateDoc(prRef, {
                    items_json: JSON.stringify(supplierItems),
                    total_amount: supplierTotal,
                    finance_status: 'Pending',
                    updated_at: new Date().toISOString(),
                    resubmitted_at: new Date().toISOString()
                });
                generatedPRIds.push(rejectedPR.pr_id);
                updatedPRIds.push(rejectedPR.pr_id);
            } else if (approvedPR) {
                // Merge into approved PR
                const existingItems = JSON.parse(approvedPR.items_json || '[]');
                const existingItemNames = existingItems.map(i => i.item);
                const itemsToAdd = supplierItems.filter(i => !existingItemNames.includes(i.item));

                if (itemsToAdd.length > 0) {
                    const mergedItems = [...existingItems, ...itemsToAdd];
                    const mergedTotal = mergedItems.reduce((sum, item) => sum + parseFloat(item.subtotal || 0), 0);

                    const prRef = doc(db, 'prs', approvedPR.id);
                    await updateDoc(prRef, {
                        items_json: JSON.stringify(mergedItems),
                        total_amount: mergedTotal,
                        updated_at: new Date().toISOString(),
                        items_merged: true
                    });
                    mergedPRIds.push(approvedPR.pr_id);
                }
                generatedPRIds.push(approvedPR.pr_id);
            } else {
                // Create new PR
                const firstWord = supplier.split(/\s+/)[0] || supplier;
                const supplierSlug = firstWord.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toUpperCase();
                const prId = `PR_${year}_${month}-${String(nextPRNum).padStart(3, '0')}-${supplierSlug}`;

                await addDoc(collection(db, 'prs'), {
                    pr_id: prId,
                    mrf_id: mrfData.mrf_id,
                    mrf_doc_id: mrfData.id,
                    supplier_name: supplier,
                    project_code: mrfData.project_code || '',
                    project_name: mrfData.project_name,
                    service_code: mrfData.service_code || '',
                    service_name: mrfData.service_name || '',
                    department: mrfData.department || 'projects',
                    requestor_name: mrfData.requestor_name,
                    urgency_level: mrfData.urgency_level || 'Low',
                    delivery_address: deliveryAddress,
                    items_json: JSON.stringify(supplierItems),
                    total_amount: supplierTotal,
                    finance_status: 'Pending',
                    date_generated: new Date().toISOString().split('T')[0],
                    created_at: serverTimestamp(),
                    pr_creator_user_id: currentUser.uid,
                    pr_creator_name: currentUser.full_name || currentUser.email || 'Unknown User'
                });
                generatedPRIds.push(prId);
                nextPRNum++;
            }
        }

        // Delete orphaned rejected PRs
        for (const rejectedPR of rejectedPRs) {
            if (!updatedPRIds.includes(rejectedPR.pr_id)) {
                const prRef = doc(db, 'prs', rejectedPR.id);
                await deleteDoc(prRef);
            }
        }

        // ========== PART 2: Process TR Items ==========

        const trTotalCost = trItems.reduce((sum, item) => sum + item.subtotal, 0);
        const primarySupplier = trItems.find(item => item.supplier)?.supplier || 'TRANSPORT';

        // Generate TR ID
        const currentTRMonthPrefix = `TR_${year}_${month}`;
        const trsRef = collection(db, 'transport_requests');
        const trsSnapshot = await getDocs(trsRef);

        let maxTRNum = 0;
        trsSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.tr_id) {
                const newMatch = data.tr_id.match(/TR_\d{4}_\d{2}-(\d+)/);
                if (newMatch && data.tr_id.startsWith(currentTRMonthPrefix)) {
                    const num = parseInt(newMatch[1]);
                    if (num > maxTRNum) maxTRNum = num;
                }
                const oldMatch = data.tr_id.match(/TR-\d{4}-(\d+)/);
                if (oldMatch) {
                    const num = parseInt(oldMatch[1]);
                    if (num > maxTRNum) maxTRNum = num;
                }
            }
        });

        trId = `TR_${year}_${month}-${String(maxTRNum + 1).padStart(3, '0')}`;

        // Create TR document
        await addDoc(collection(db, 'transport_requests'), {
            tr_id: trId,
            mrf_id: mrfData.mrf_id,
            mrf_doc_id: mrfData.id,
            project_code: mrfData.project_code || '',
            project_name: mrfData.project_name,
            service_code: mrfData.service_code || '',
            service_name: mrfData.service_name || '',
            department: mrfData.department || 'projects',
            requestor_name: mrfData.requestor_name,
            urgency_level: mrfData.urgency_level || 'Low',
            supplier_name: primarySupplier,
            delivery_address: deliveryAddress,
            items_json: JSON.stringify(trItems),
            justification: mrfData.justification || '',
            cost: trTotalCost,
            total_amount: trTotalCost,
            finance_status: 'Pending',
            date_submitted: new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString()
        });

        // ========== PART 3: Update MRF Status ==========
        const mrfRef = doc(db, 'mrfs', mrfData.id);
        await updateDoc(mrfRef, {
            status: 'PR Submitted',
            pr_ids: generatedPRIds,
            tr_id: trId,
            items_json: JSON.stringify(allItems),
            updated_at: new Date().toISOString(),
            pr_rejection_reason: null,
            rejected_pr_id: null,
            is_rejected: false
        });

        // Build success message
        const prMsg = generatedPRIds.length === 1
            ? `PR: ${generatedPRIds[0]}`
            : `PRs: ${generatedPRIds.join(', ')}`;
        showToast(`PR & TR submitted successfully! ${prMsg}, TR: ${trId}`, 'success');

        // Clear MRF details
        currentMRF = null;
        const mrfDetails = document.getElementById('mrfDetails');
        if (mrfDetails) {
            mrfDetails.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #666;">
                    <div style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">✓ PR & TR Submitted Successfully</div>
                    <div style="font-size: 0.875rem; margin-top: 0.5rem;">Both PR and TR have been created and sent to Finance for approval.</div>
                    <div style="font-size: 0.875rem; margin-top: 0.25rem;">Select another MRF to view details.</div>
                </div>
            `;
        }

    } catch (error) {
        console.error('Error generating PR & TR:', error);
        showToast('Failed to generate PR & TR: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
};

// ========================================
// PO STATUS & TIMELINE FUNCTIONS
// ========================================

/**
 * Load PO Tracking with real-time listener
 */
async function loadPOTracking() {
    if (_poTrackingListenerActive) {
        // Listener already registered — re-render from cached data
        if (poData.length > 0) {
            renderPOTrackingTable(poData);
            updatePOScoreboards(poData);
        }
        return;
    }
    _poTrackingListenerActive = true;

    const posRef = collection(db, 'pos');

    const listener = onSnapshot(posRef, (snapshot) => {
        poData = [];
        snapshot.forEach((doc) => {
            poData.push({ id: doc.id, ...doc.data() });
        });

        // Sort by status (pending, procuring, procured, delivered), then by date within each status
        // SUBCON items use: Pending → Processing → Processed
        // Material items use: Pending Procurement → Procuring → Procured → Delivered
        const statusOrder = {
            'Pending Procurement': 1,
            'Pending': 1,  // SUBCON equivalent
            'Procuring': 2,
            'Processing': 2,  // SUBCON equivalent
            'Procured': 3,
            'Processed': 3,  // SUBCON equivalent
            'Delivered': 4
        };

        poData.sort((a, b) => {
            const defaultStatus = a.is_subcon ? 'Pending' : 'Pending Procurement';
            const defaultStatusB = b.is_subcon ? 'Pending' : 'Pending Procurement';
            const statusA = a.procurement_status || defaultStatus;
            const statusB = b.procurement_status || defaultStatusB;
            const orderA = statusOrder[statusA] || 999;
            const orderB = statusOrder[statusB] || 999;

            // First sort by status
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            // Then by date (newest first within each status)
            return new Date(b.date_issued) - new Date(a.date_issued);
        });

        renderPOTrackingTable(poData);
    });

    listeners.push(listener);

    // RFP listener — load alongside PO tracking, deduped with same guard scope
    if (!_rfpListenerActive) {
        _rfpListenerActive = true;
        const rfpsUnsub = onSnapshot(collection(db, 'rfps'), (snapshot) => {
            rfpsData = [];
            rfpsByPO = {};
            rfpsByTR = {};
            snapshot.forEach(docSnap => {
                const rfp = { id: docSnap.id, ...docSnap.data() };
                rfpsData.push(rfp);
                const poId = rfp.po_id;
                if (!rfpsByPO[poId]) rfpsByPO[poId] = [];
                rfpsByPO[poId].push(rfp);
                const trId = rfp.tr_id;
                if (trId) {
                    if (!rfpsByTR[trId]) rfpsByTR[trId] = [];
                    rfpsByTR[trId].push(rfp);
                }
            });
            // Re-render PO tracking table if it's currently visible to update fill colors
            const recordsSection = document.getElementById('records-section');
            if (recordsSection && recordsSection.classList.contains('active')) {
                renderPOTrackingTable(poData);
                // Also re-render MRF Records chips so delivery fee dots update immediately
                renderPRPORecords();
            }
        });
        listeners.push(rfpsUnsub);
    }
}

/**
 * Refresh PO tracking manually
 */
async function refreshPOTracking() {
    await loadPOTracking();
    showToast('PO list refreshed', 'success');
};

/**
 * Export the currently dept-filtered PO Tracking list as a CSV file.
 * Uses poData (real-time state), filtered by activePODeptFilter.
 * Exports ALL rows — not paginated.
 */
function exportPOTrackingCSV() {
    const filteredPOs = activePODeptFilter
        ? poData.filter(po => (po.department || 'projects') === activePODeptFilter)
        : poData;

    if (filteredPOs.length === 0) {
        showToast('No PO tracking records to export', 'info');
        return;
    }

    const headers = ['PO ID', 'Type', 'Supplier', 'Project / Service', 'Amount (PHP)', 'Date Issued', 'Status'];
    const rows = filteredPOs.map(po => {
        const type = po.is_subcon ? 'Subcon' : 'Material';
        const defaultStatus = po.is_subcon ? 'Pending' : 'Pending Procurement';
        const status = po.procurement_status || defaultStatus;
        const label = getMRFLabel(po);
        return [
            po.po_id || '',
            type,
            po.supplier_name || '',
            label,
            parseFloat(po.total_amount || 0).toFixed(2),
            formatTimestamp(po.date_issued) || '',
            status
        ];
    });

    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(headers, rows, `po-tracking-${date}.csv`);
    showToast(`Exported ${filteredPOs.length} PO records`, 'success');
}

/**
 * Render PO Tracking Table
 */
function renderPOTrackingTable(pos) {
    const tbody = document.getElementById('poTrackingBody');

    const canEdit = window.canEditTab?.('procurement');
    const showEditControls = canEdit !== false;

    // Filter POs by department if active, then calculate scoreboard counts
    const scoreboardPos = activePODeptFilter
        ? pos.filter(po => (po.department || 'projects') === activePODeptFilter)
        : pos;

    const materialCounts = {
        pending: 0,      // Pending Procurement
        procuring: 0,    // Procuring
        procured: 0,     // Procured
        delivered: 0     // Delivered
    };

    const subconCounts = {
        pending: 0,      // Pending
        processing: 0,   // Processing
        processed: 0     // Processed
    };

    scoreboardPos.forEach(po => {
        const defaultStatus = po.is_subcon ? 'Pending' : 'Pending Procurement';
        const status = po.procurement_status || defaultStatus;

        if (po.is_subcon) {
            // SUBCON counts
            if (status === 'Pending') subconCounts.pending++;
            else if (status === 'Processing') subconCounts.processing++;
            else if (status === 'Processed') subconCounts.processed++;
        } else {
            // Material counts
            if (status === 'Pending Procurement') materialCounts.pending++;
            else if (status === 'Procuring') materialCounts.procuring++;
            else if (status === 'Procured') materialCounts.procured++;
            else if (status === 'Delivered') materialCounts.delivered++;
        }
    });

    // Update Materials scoreboard
    document.getElementById('scoreMaterialsPending').textContent = materialCounts.pending;
    document.getElementById('scoreMaterialsProcuring').textContent = materialCounts.procuring;
    document.getElementById('scoreMaterialsProcured').textContent = materialCounts.procured;
    document.getElementById('scoreMaterialsDelivered').textContent = materialCounts.delivered;

    // Update Subcon scoreboard
    document.getElementById('scoreSubconPending').textContent = subconCounts.pending;
    document.getElementById('scoreSubconProcessing').textContent = subconCounts.processing;
    document.getElementById('scoreSubconProcessed').textContent = subconCounts.processed;

    // MRF Records tab has scoreboards but no PO table body — exit after scoreboards
    if (!tbody) return;

    // Apply department filter before pagination
    const displayPos = activePODeptFilter
        ? pos.filter(po => (po.department || 'projects') === activePODeptFilter)
        : pos;

    if (displayPos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">No POs yet</td></tr>';
        // Hide pagination if no results
        const paginationDiv = document.getElementById('poPagination');
        if (paginationDiv) paginationDiv.style.display = 'none';
        return;
    }

    // Calculate pagination
    const totalPages = Math.ceil(displayPos.length / poItemsPerPage);
    const startIndex = (poCurrentPage - 1) * poItemsPerPage;
    const endIndex = Math.min(startIndex + poItemsPerPage, displayPos.length);
    const pageItems = displayPos.slice(startIndex, endIndex);

    tbody.innerHTML = pageItems.map(po => {
        const isSubcon = po.is_subcon;
        const defaultStatus = isSubcon ? 'Pending' : 'Pending Procurement';
        const currentStatus = po.procurement_status || defaultStatus;
        const isFinalStatus = isSubcon ? currentStatus === 'Processed' : currentStatus === 'Delivered';

        // Generate status options based on whether it's SUBCON or material
        let statusOptions;
        if (isSubcon) {
            // SUBCON: Pending → Processing → Processed
            statusOptions = `
                <option value="Pending" ${currentStatus === 'Pending' ? 'selected' : ''}>Pending</option>
                <option value="Processing" ${currentStatus === 'Processing' ? 'selected' : ''}>Processing</option>
                <option value="Processed" ${currentStatus === 'Processed' ? 'selected' : ''}>Processed</option>
            `;
        } else {
            // Material: Pending Procurement → Procuring → Procured → Delivered
            statusOptions = `
                <option value="Pending Procurement" ${currentStatus === 'Pending Procurement' ? 'selected' : ''}>Pending</option>
                <option value="Procuring" ${currentStatus === 'Procuring' ? 'selected' : ''}>Procuring</option>
                <option value="Procured" ${currentStatus === 'Procured' ? 'selected' : ''}>Procured</option>
                <option value="Delivered" ${currentStatus === 'Delivered' ? 'selected' : ''}>Delivered</option>
            `;
        }

        // Status badge colors for view-only display
        const statusColors = {
            'Pending Procurement': { bg: '#fef3c7', color: '#f59e0b' },
            'Pending': { bg: '#fef3c7', color: '#f59e0b' },
            'Procuring': { bg: '#dbeafe', color: '#3b82f6' },
            'Processing': { bg: '#dbeafe', color: '#3b82f6' },
            'Procured': { bg: '#d1fae5', color: '#22c55e' },
            'Processed': { bg: '#d1fae5', color: '#22c55e' },
            'Delivered': { bg: '#eff6ff', color: '#2563eb' }
        };
        const statusColor = statusColors[currentStatus] || { bg: '#f3f4f6', color: '#6b7280' };

        const hasProof = !!po.proof_url;
        const hasRemarks = !!po.proof_remarks;
        let proofIndicator;
        if (hasProof) {
            // Green checkmark — has URL
            proofIndicator = `<span class="proof-indicator proof-filled"
                    title="Left-click to open proof \u00b7 Right-click to replace"
                    onclick="window.open('${escapeHTML(po.proof_url)}', '_blank')"
                    oncontextmenu="event.preventDefault(); window.showProofModal('${po.id}', '${escapeHTML(po.proof_url)}', false, null, '${escapeHTML(po.proof_remarks || '')}')"
                    onmouseenter="this.style.opacity='0.85'"
                    onmouseleave="this.style.opacity='1'"
                    ontouchstart="window._proofLongPress=setTimeout(()=>{event.preventDefault();window.showProofModal('${po.id}','${escapeHTML(po.proof_url)}',false,null,'${escapeHTML(po.proof_remarks || '')}')},600)"
                    ontouchend="clearTimeout(window._proofLongPress)"
                    style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#34a853;color:#fff;font-size:12px;cursor:pointer;user-select:none;">&#10003;</span>`;
        } else if (hasRemarks) {
            // Orange circle with dash — has remarks but no URL
            proofIndicator = `<span class="proof-indicator proof-remarks"
                    title="Remarks only (no link) \u00b7 Click to view/edit"
                    onclick="window.showProofModal('${po.id}', '', false, null, '${escapeHTML(po.proof_remarks)}')"
                    onmouseenter="this.style.opacity='0.85'" onmouseleave="this.style.opacity='1'"
                    style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#f59e0b;color:#fff;font-size:14px;font-weight:700;cursor:pointer;user-select:none;">&ndash;</span>`;
        } else {
            // Empty circle — nothing attached
            proofIndicator = `<span class="proof-indicator proof-empty"
                    title="Click to attach proof"
                    onclick="window.showProofModal('${po.id}', '', false, null, '')"
                    onmouseenter="this.style.borderColor='#1a73e8';this.style.background='rgba(26,115,232,0.05)'"
                    onmouseleave="this.style.borderColor='#bdc1c6';this.style.background='transparent'"
                    style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;border:1.5px solid #bdc1c6;background:transparent;color:#bdc1c6;font-size:12px;cursor:pointer;user-select:none;">&nbsp;</span>`;
        }

        const fillData = getPOPaymentFill(po.po_id);

        // Delivery fee status dot (shown only when delivery_fee > 0)
        let deliveryFeeDotHtml = '';
        const poDeliveryFee = parseFloat(po.delivery_fee) || 0;
        if (poDeliveryFee > 0) {
            const deliveryFeeRFPs = (rfpsByPO[po.po_id] || []).filter(r => r.tranche_label === 'Delivery Fee');
            let dotColor, dotLabel;
            if (deliveryFeeRFPs.length === 0) {
                dotColor = '#ef4444'; dotLabel = 'No RFP submitted';
            } else {
                const dfRfp = deliveryFeeRFPs[0];
                const dfTotalPaid = (dfRfp.payment_records || [])
                    .filter(r => r.status !== 'voided')
                    .reduce((sum, r) => sum + (r.amount || 0), 0);
                const dfPaid = dfTotalPaid >= dfRfp.amount_requested && dfRfp.amount_requested > 0;
                dotColor = dfPaid ? '#059669' : '#f59e0b';
                dotLabel = dfPaid ? 'Paid' : 'RFP submitted, not yet paid';
            }
            const dotTooltip = `Delivery Fee: PHP ${poDeliveryFee.toLocaleString('en-PH', {minimumFractionDigits: 2})} \u2014 ${dotLabel}`;
            deliveryFeeDotHtml = `<span title="${escapeHTML(dotTooltip)}" style="position:absolute;top:4px;right:4px;width:8px;height:8px;border-radius:50%;background:${dotColor};z-index:2;pointer-events:auto;"></span>`;
        }

        return `
        <tr>
            <td class="po-id-cell" title="${escapeHTML(fillData.tooltip)}" style="position:relative;overflow:hidden;"
                oncontextmenu="event.preventDefault(); window.showRFPContextMenu(event, '${po.id}')">
                <div class="po-payment-fill" style="position:absolute;left:0;top:0;height:100%;width:${fillData.pct}%;background:${fillData.color};opacity:${fillData.opacity};transition:width 0.4s ease;pointer-events:none;"></div>
                ${deliveryFeeDotHtml}
                <span style="position:relative;z-index:1;">
                    <strong><a href="javascript:void(0)" onclick="window.viewPODetails('${po.id}')" oncontextmenu="event.preventDefault(); window.showRFPContextMenu(event, '${po.id}'); return false;" style="color:#1a73e8;text-decoration:none;cursor:pointer;">${escapeHTML(po.po_id)}</a></strong>${isSubcon ? ' <span style="background:#e0f2fe;color:#0369a1;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:600;">SUBCON</span>' : ''}
                </span>
            </td>
            <td>${escapeHTML(po.supplier_name)}</td>
            <td><span style="display:inline-flex;align-items:center;gap:6px;">${getDeptBadgeHTML(po)} ${escapeHTML(getMRFLabel(po))}</span></td>
            <td>PHP ${parseFloat(po.total_amount).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            <td>${formatTimestamp(po.date_issued) || 'N/A'}</td>
            <td>
                ${showEditControls ? `
                <select class="status-select" data-po-id="${po.id}" data-is-subcon="${isSubcon}"
                        onchange="updatePOStatus('${po.id}', this.value, '${currentStatus}', ${isSubcon})"
                        ${isFinalStatus ? 'disabled style="opacity: 0.6; cursor: not-allowed;"' : ''}>
                    ${statusOptions}
                </select>
                ` : `<span style="background: ${statusColor.bg}; color: ${statusColor.color}; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">${currentStatus}</span>`}
            </td>
            <td style="text-align: center; vertical-align: middle;">${proofIndicator}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="promptPODocument('${po.id}')" style="margin-right: 4px;">View PO</button>
                <button class="btn btn-sm btn-primary" onclick="viewPOTimeline('${po.id}')">Timeline</button>
            </td>
        </tr>
    `}).join('');

    // Update pagination controls
    updatePOPaginationControls(totalPages, startIndex, endIndex, displayPos.length);
}

/**
 * Change PO Page
 */
function changePOPage(direction) {
    const totalPages = Math.ceil(poData.length / poItemsPerPage);

    if (direction === 'prev' && poCurrentPage > 1) {
        poCurrentPage--;
    } else if (direction === 'next' && poCurrentPage < totalPages) {
        poCurrentPage++;
    } else if (typeof direction === 'number') {
        poCurrentPage = direction;
    }

    renderPOTrackingTable(poData);
};

/**
 * Update PO Pagination Controls
 */
function updatePOPaginationControls(totalPages, startIndex, endIndex, totalItems) {
    let paginationDiv = document.getElementById('poPagination');

    // Create pagination div if it doesn't exist
    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.id = 'poPagination';
        paginationDiv.className = 'pagination-container';

        // Insert after the table
        const section = document.getElementById('tracking-section');
        const table = section?.querySelector('table');
        if (table && table.parentNode) {
            table.parentNode.insertBefore(paginationDiv, table.nextSibling);
        }
    }

    // Build pagination HTML
    let paginationHTML = `
        <div class="pagination-info">
            Showing <strong>${startIndex + 1}-${endIndex}</strong> of <strong>${totalItems}</strong> POs
        </div>
        <div class="pagination-controls">
            <button class="pagination-btn" onclick="changePOPage('prev')" ${poCurrentPage === 1 ? 'disabled' : ''}>
                ← Previous
            </button>
    `;

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= poCurrentPage - 1 && i <= poCurrentPage + 1)) {
            paginationHTML += `
                <button class="pagination-btn ${i === poCurrentPage ? 'active' : ''}" onclick="changePOPage(${i})">
                    ${i}
                </button>
            `;
        } else if (i === poCurrentPage - 2 || i === poCurrentPage + 2) {
            paginationHTML += '<span class="pagination-ellipsis">...</span>';
        }
    }

    paginationHTML += `
            <button class="pagination-btn" onclick="changePOPage('next')" ${poCurrentPage === totalPages ? 'disabled' : ''}>
                Next →
            </button>
        </div>
    `;

    paginationDiv.innerHTML = paginationHTML;
}

/**
 * Update PO Status
 */
async function updatePOStatus(poId, newStatus, currentStatus, isSubcon = false) {
    if (window.canEditTab?.('procurement') === false) {
        showToast('You do not have permission to edit procurement data', 'error');
        const select = document.querySelector(`select[data-po-id="${poId}"]`);
        if (select) select.value = currentStatus;
        return;
    }

    if (newStatus === currentStatus) return;

    // Prevent changing status if already at final status
    const finalStatus = isSubcon ? 'Processed' : 'Delivered';
    if (currentStatus === finalStatus) {
        showToast(`Cannot change status once ${finalStatus.toLowerCase()}`, 'error');
        const select = document.querySelector(`select[data-po-id="${poId}"]`);
        if (select) select.value = currentStatus;
        return;
    }

    // If marking as Delivered (materials only), prompt for delivery fee
    let deliveryFee = 0;
    if (newStatus === 'Delivered' && !isSubcon) {
        const feeInput = prompt('Enter Delivery Fee (PHP):', '0');
        if (feeInput === null) {
            // User cancelled
            const select = document.querySelector(`select[data-po-id="${poId}"]`);
            if (select) select.value = currentStatus;
            return;
        }
        deliveryFee = parseFloat(feeInput) || 0;
        if (deliveryFee < 0) {
            showToast('Delivery fee cannot be negative', 'error');
            const select = document.querySelector(`select[data-po-id="${poId}"]`);
            if (select) select.value = currentStatus;
            return;
        }
    }

    const confirmMsg = isSubcon
        ? `Update SUBCON status to "${newStatus}"?`
        : `Update status to "${newStatus}"?${newStatus === 'Delivered' ? '\nDelivery Fee: PHP ' + deliveryFee.toLocaleString('en-PH', {minimumFractionDigits: 2}) : ''}`;

    if (!confirm(confirmMsg)) {
        // Reset dropdown
        const select = document.querySelector(`select[data-po-id="${poId}"]`);
        if (select) select.value = currentStatus;
        return;
    }

    showLoading(true);

    try {
        const poRef = doc(db, 'pos', poId); // Declared early: needed in Delivered branch for getDoc

        const updateData = {
            procurement_status: newStatus,
            updated_at: new Date().toISOString()
        };

        if (isSubcon) {
            // SUBCON status timestamps: Pending → Processing → Processed
            if (newStatus === 'Processing' && currentStatus !== 'Processing') {
                updateData.processing_started_at = serverTimestamp(); // Server timestamp for precision
            } else if (newStatus === 'Processed') {
                updateData.processed_at = serverTimestamp(); // Server timestamp for precision
                updateData.processed_date = new Date().toISOString().split('T')[0]; // Keep for backward compat
            }
        } else {
            // Material status timestamps: Pending Procurement → Procuring → Procured → Delivered
            if (newStatus === 'Procuring' && currentStatus !== 'Procuring') {
                updateData.procurement_started_at = serverTimestamp(); // Server timestamp for precision
            } else if (newStatus === 'Procured') {
                updateData.procured_at = serverTimestamp(); // Server timestamp for precision
                updateData.procured_date = new Date().toISOString().split('T')[0]; // Keep for backward compat
            } else if (newStatus === 'Delivered') {
                updateData.delivered_at = serverTimestamp(); // Server timestamp for precision
                updateData.delivered_date = new Date().toISOString().split('T')[0]; // Keep for backward compat
                updateData.delivery_fee = deliveryFee;
                // Add delivery fee to total_amount so expense aggregation
                // queries (sum('total_amount')) automatically include delivery costs
                if (deliveryFee > 0) {
                    const poDoc = await getDoc(poRef);
                    const currentTotal = poDoc.data()?.total_amount || 0;
                    updateData.total_amount = currentTotal + deliveryFee;
                }
            }
        }

        await updateDoc(poRef, updateData);

        const successMsg = isSubcon
            ? `SUBCON status updated to ${newStatus}`
            : `PO status updated to ${newStatus}${newStatus === 'Delivered' ? ' with delivery fee: PHP ' + deliveryFee.toLocaleString('en-PH', {minimumFractionDigits: 2}) : ''}`;
        showToast(successMsg, 'success');

        // Prompt for proof URL on Procured (material) or Processed (SUBCON)
        if ((newStatus === 'Procured' && !isSubcon) || (newStatus === 'Processed' && isSubcon)) {
            const currentPO = poData.find(p => p.id === poId);
            const currentRemarks = currentPO?.proof_remarks || '';
            showProofModal(poId, currentPO?.proof_url || '', true, null, currentRemarks);
        }
    } catch (error) {
        console.error('Error updating PO status:', error);
        showToast('Failed to update status', 'error');
        // Reset dropdown
        const select = document.querySelector(`select[data-po-id="${poId}"]`);
        if (select) select.value = currentStatus;
    } finally {
        showLoading(false);
    }
};

// showProofModal and saveProofUrl are imported from ../proof-modal.js
// Re-render callback registered as window._proofOnSaved in init()

/**
 * View PR Details in a modal
 */
async function viewPRDetails(prDocId) {
    showLoading(true);

    try {
        const prRef = doc(db, 'prs', prDocId);
        const prDoc = await getDoc(prRef);

        if (!prDoc.exists()) {
            showToast('PR not found', 'error');
            return;
        }

        const pr = { id: prDoc.id, ...prDoc.data() };
        const items = JSON.parse(pr.items_json || '[]');

        // Build modal body content
        let modalBodyContent = `
            <div style="max-height: 60vh; overflow-y: auto;">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">PR ID</div>
                        <div style="font-weight: 600;">${escapeHTML(pr.pr_id)}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">MRF Reference</div>
                        <div style="font-weight: 600;">${escapeHTML(pr.mrf_id)}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Supplier</div>
                        <div style="font-weight: 600;">${escapeHTML(pr.supplier_name || 'Not specified')}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Prepared By</div>
                        <div style="padding: 0.5rem 0.75rem; background: #f8f9fa; border-radius: 4px; color: #1e293b; font-size: 0.875rem;">
                            ${escapeHTML(pr.pr_creator_name || 'Unknown User')}
                        </div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Project</div>
                        <div>${escapeHTML(getMRFLabel(pr))}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Date Generated</div>
                        <div>${escapeHTML(pr.date_generated)}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Status</div>
                        <div><span class="status-badge ${getStatusClass(pr.finance_status || 'Pending')}">${escapeHTML(pr.finance_status || 'Pending')}</span></div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Total Amount</div>
                        <div style="font-weight: 600;">PHP ${parseFloat(pr.total_amount || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Requestor</div>
                        <div>${escapeHTML(pr.requestor_name)}</div>
                    </div>
                </div>

                <div style="margin-bottom: 1rem;">
                    <div style="font-size: 0.75rem; color: #5f6368; margin-bottom: 0.5rem;">Delivery Address</div>
                    <div style="padding: 0.75rem; background: #f9fafb; border-radius: 4px; font-size: 0.875rem;">${escapeHTML(pr.delivery_address || 'N/A')}</div>
                </div>

                <div style="margin-top: 1.5rem;">
                    <h4 style="margin-bottom: 0.75rem;">Items</h4>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
                        <thead>
                            <tr style="background: #f3f4f6;">
                                <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Item</th>
                                <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Category</th>
                                <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Qty</th>
                                <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Unit Cost</th>
                                <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(item => `
                                <tr>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${escapeHTML(item.item || item.item_name)}</td>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${escapeHTML(item.category || 'N/A')}</td>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${escapeHTML(String(item.qty || item.quantity))} ${escapeHTML(item.unit)}</td>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">PHP ${parseFloat(item.unit_cost || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">PHP ${parseFloat(item.subtotal || ((item.qty || item.quantity) * item.unit_cost) || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Create modal container if it doesn't exist
        let modalContainer = document.getElementById('prDetailsModalContainer');
        if (!modalContainer) {
            modalContainer = document.createElement('div');
            modalContainer.id = 'prDetailsModalContainer';
            document.body.appendChild(modalContainer);
        }

        // Insert modal HTML with View PR button
        modalContainer.innerHTML = createModal({
            id: 'prDetailsModal',
            title: `Purchase Request Details: ${pr.pr_id}`,
            body: modalBodyContent,
            footer: `
                <button class="btn btn-secondary" onclick="closeModal('prDetailsModal')">Close</button>
                <button class="btn btn-primary" onclick="window.generatePRDocument('${pr.id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; vertical-align: middle;">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                    View PR
                </button>
            `,
            size: 'large'
        });

        // Open the modal
        openModal('prDetailsModal');

    } catch (error) {
        console.error('Error loading PR details:', error);
        showToast('Failed to load PR details', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * View TR Details — opens a modal with transport request details.
 * Called from TR badge spans in MRF Records and My Requests tables.
 */
async function viewTRDetails(trDocId) {
    showLoading(true);
    try {
        const trRef = doc(db, 'transport_requests', trDocId);
        const trDoc = await getDoc(trRef);

        if (!trDoc.exists()) {
            showToast('TR not found', 'error');
            return;
        }

        const tr = { id: trDoc.id, ...trDoc.data() };
        const items = JSON.parse(tr.items_json || '[]');

        const modalBodyContent = `
            <div style="max-height: 60vh; overflow-y: auto;">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">TR ID</div>
                        <div style="font-weight: 600;">${escapeHTML(tr.tr_id)}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">MRF Reference</div>
                        <div style="font-weight: 600;">${escapeHTML(tr.mrf_id || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Supplier</div>
                        <div style="font-weight: 600;">${escapeHTML(tr.supplier_name || 'Not specified')}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Finance Status</div>
                        <div><span class="status-badge ${getStatusClass(tr.finance_status || 'Pending')}">${escapeHTML(tr.finance_status || 'Pending')}</span></div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Total Amount</div>
                        <div style="font-weight: 600;">PHP ${parseFloat(tr.total_amount || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Date Submitted</div>
                        <div>${tr.date_submitted ? formatTimestamp(tr.date_submitted) : 'N/A'}</div>
                    </div>
                </div>
                ${tr.rejection_reason ? `
                <div style="margin-bottom: 1rem; padding: 0.75rem; background: #fee2e2; border-radius: 4px; border-left: 3px solid #dc2626;">
                    <div style="font-size: 0.75rem; color: #dc2626; font-weight: 600; margin-bottom: 0.25rem;">Rejection Reason</div>
                    <div style="font-size: 0.875rem; color: #1e293b;">${escapeHTML(tr.rejection_reason)}</div>
                </div>` : ''}
                <div style="margin-top: 1.5rem;">
                    <h4 style="margin-bottom: 0.75rem;">Items</h4>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
                        <thead>
                            <tr style="background: #f3f4f6;">
                                <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Item</th>
                                <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Category</th>
                                <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Qty</th>
                                <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Unit Cost</th>
                                <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.length > 0 ? items.map(item => `
                                <tr>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${escapeHTML(item.item || item.item_name || '')}</td>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${escapeHTML(item.category || 'N/A')}</td>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${escapeHTML(String(item.qty || item.quantity || 0))} ${escapeHTML(item.unit || 'pcs')}</td>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">PHP ${parseFloat(item.unit_cost || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">PHP ${parseFloat(item.subtotal || ((item.qty || item.quantity || 0) * (item.unit_cost || 0))).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                                </tr>
                            `).join('') : '<tr><td colspan="5" style="padding: 0.5rem; color: #64748b;">No items found</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        let modalContainer = document.getElementById('trDetailsModalContainer');
        if (!modalContainer) {
            modalContainer = document.createElement('div');
            modalContainer.id = 'trDetailsModalContainer';
            document.body.appendChild(modalContainer);
        }

        modalContainer.innerHTML = createModal({
            id: 'trDetailsModal',
            title: `Transport Request Details: ${tr.tr_id}`,
            body: modalBodyContent,
            footer: `<button class="btn btn-secondary" onclick="closeModal('trDetailsModal')">Close</button>`,
            size: 'large'
        });

        openModal('trDetailsModal');
    } catch (error) {
        console.error('Error loading TR details:', error);
        showToast('Failed to load TR details', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * View PO Details
 */
async function viewPODetails(poId) {
    showLoading(true);

    try {
        const poRef = doc(db, 'pos', poId);
        const poDoc = await getDoc(poRef);

        if (!poDoc.exists()) {
            showToast('PO not found', 'error');
            return;
        }

        const po = { id: poDoc.id, ...poDoc.data() };
        const items = JSON.parse(po.items_json || '[]');

        // Determine status color
        const isSubcon = po.is_subcon || false;
        const defaultStatus = isSubcon ? 'Pending' : 'Pending Procurement';
        const status = po.procurement_status || defaultStatus;
        let statusBg = '#fef3c7';
        let statusColor = '#92400e';

        if (isSubcon) {
            if (status === 'Processed') {
                statusBg = '#d1fae5';
                statusColor = '#065f46';
            } else if (status === 'Processing') {
                statusBg = '#dbeafe';
                statusColor = '#1e40af';
            }
        } else {
            if (status === 'Delivered') {
                statusBg = '#d1fae5';
                statusColor = '#065f46';
            } else if (status === 'Procured') {
                statusBg = '#dbeafe';
                statusColor = '#1e40af';
            } else if (status === 'Procuring') {
                statusBg = '#fef3c7';
                statusColor = '#92400e';
            }
        }

        // Build tranche data for the payment tranches builder
        const poTranches = Array.isArray(po.tranches) && po.tranches.length > 0
            ? po.tranches
            : [{ label: po.payment_terms || 'Full Payment', percentage: 100 }];

        // Lock predicate: any active non-Delivery-Fee RFP against this PO
        const hasActiveRFP = (rfpsByPO[po.po_id] || [])
            .some(r => r.tranche_label !== 'Delivery Fee');

        // Build Document Details section (locked or editable)
        const documentDetailsHTML = hasActiveRFP
            ? `<div style="margin-top: 1.5rem; padding: 1rem; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <h4 style="margin-bottom: 1rem; color: #1e293b;">Document Details</h4>
                    <div style="padding: 0.5rem 0.75rem; background: #fef3c7; color: #92400e; border-radius: 6px; font-size: 0.8125rem; margin-bottom: 0.75rem; font-weight: 600;">
                        Locked: Document Details cannot be edited while an active RFP is in progress. Cancel all RFPs for this PO to edit again.
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                        <div style="grid-column: span 2;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #475569; font-size: 0.875rem;">Payment Tranches</label>
                            <ul style="margin: 0; padding-left: 1.25rem; font-size: 0.875rem; color: #1e293b;">
                                ${poTranches.map(t => `<li>${escapeHTML(t.label || '')} — ${Number(t.percentage || 0)}%</li>`).join('')}
                            </ul>
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #475569; font-size: 0.875rem;">Condition</label>
                            <span style="display: block; font-size: 0.875rem; color: #1e293b;">${escapeHTML(po.condition || '—')}</span>
                        </div>
                        <div style="grid-column: span 2;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #475569; font-size: 0.875rem;">Delivery Date</label>
                            <span style="display: block; font-size: 0.875rem; color: #1e293b;">${escapeHTML(po.delivery_date || '—')}</span>
                        </div>
                    </div>
                </div>`
            : `<div style="margin-top: 1.5rem; padding: 1rem; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <h4 style="margin-bottom: 1rem; color: #1e293b;">Document Details</h4>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                        <div style="grid-column: span 2;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #475569; font-size: 0.875rem;">Payment Tranches</label>
                            ${renderTrancheBuilder(poTranches, po.id)}
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #475569; font-size: 0.875rem;">Condition</label>
                            <input type="text" id="editCondition_${po.id}" value="${po.condition || ''}"
                                   placeholder="e.g., Items must meet quality standards"
                                   style="width: 100%; padding: 0.5rem; border: 1.5px solid #cbd5e1; border-radius: 6px; font-size: 0.875rem;">
                        </div>
                        <div style="grid-column: span 2;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #475569; font-size: 0.875rem;">Delivery Date</label>
                            <input type="date" id="editDeliveryDate_${po.id}" value="${po.delivery_date || ''}"
                                   style="width: 100%; padding: 0.5rem; border: 1.5px solid #cbd5e1; border-radius: 6px; font-size: 0.875rem;">
                        </div>
                    </div>
                    <button class="btn btn-sm btn-primary" onclick="savePODocumentFields('${po.id}')"
                            style="margin-top: 1rem;">
                        Save Document Details
                    </button>
                </div>`;

        // Build modal body content
        let modalBodyContent = `
            <div style="max-height: 60vh; overflow-y: auto;">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">PO ID</div>
                        <div style="font-weight: 600;">${escapeHTML(po.po_id)}${isSubcon ? ' <span style="background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">SUBCON</span>' : ''}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">MRF Reference</div>
                        <div style="font-weight: 600;">${escapeHTML(po.mrf_id || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Supplier</div>
                        <div style="font-weight: 600;">${escapeHTML(po.supplier_name)}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Project</div>
                        <div>${escapeHTML(getMRFLabel(po))}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Date Issued</div>
                        <div>${formatTimestamp(po.date_issued) || 'N/A'}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Status</div>
                        <div><span style="background: ${statusBg}; color: ${statusColor}; padding: 0.375rem 0.75rem; border-radius: 6px; font-size: 0.875rem; font-weight: 600; display: inline-block;">${escapeHTML(status)}</span></div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Total Amount</div>
                        <div style="font-weight: 600;">PHP ${parseFloat(po.total_amount || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</div>
                    </div>
                    ${po.delivery_fee ? `
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Delivery Fee</div>
                        <div style="font-weight: 600;">PHP ${parseFloat(po.delivery_fee).toLocaleString('en-PH', {minimumFractionDigits: 2})}</div>
                    </div>
                    ` : ''}
                </div>

                ${documentDetailsHTML}

                <div style="margin-top: 1.5rem;">
                    <h4 style="margin-bottom: 0.75rem;">Items (${items.length})</h4>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
                        <thead>
                            <tr style="background: #f3f4f6;">
                                <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Item</th>
                                <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Category</th>
                                <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Qty</th>
                                <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Unit Cost</th>
                                <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(item => `
                                <tr>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${escapeHTML(item.item || item.item_name)}</td>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${escapeHTML(item.category || 'N/A')}</td>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${escapeHTML(String(item.qty || item.quantity))} ${escapeHTML(item.unit)}</td>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">PHP ${parseFloat(item.unit_cost || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">PHP ${parseFloat(item.subtotal || ((item.qty || item.quantity) * item.unit_cost) || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Create modal container if it doesn't exist
        let modalContainer = document.getElementById('poDetailsModalContainer');
        if (!modalContainer) {
            modalContainer = document.createElement('div');
            modalContainer.id = 'poDetailsModalContainer';
            document.body.appendChild(modalContainer);
        }

        // Insert modal HTML with View PO button
        modalContainer.innerHTML = createModal({
            id: 'poDetailsModal',
            title: `Purchase Order Details: ${po.po_id}`,
            body: modalBodyContent,
            footer: `
                <button class="btn btn-secondary" onclick="closeModal('poDetailsModal')">Close</button>
                <button class="btn btn-primary" onclick="window.promptPODocument('${po.id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; vertical-align: middle;">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                    View PO
                </button>
            `,
            size: 'large'
        });

        // Open the modal
        openModal('poDetailsModal');

    } catch (error) {
        console.error('Error loading PO details:', error);
        showToast('Failed to load PO details', 'error');
    } finally {
        showLoading(false);
    }
};

/**
 * View PO Timeline
 */
function viewPOTimeline(poId) {
    const po = poData.find(p => p.id === poId);
    if (!po) return;

    const calculateDays = (start, end) => {
        if (!start || !end) return 'N/A';
        const s = new Date(start);
        const e = new Date(end);
        return Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + ' days';
    };

    let content;

    if (po.is_subcon) {
        // SUBCON Timeline: PO Issued → Processing Started → Processed
        const defaultStatus = 'Pending';
        const currentStatus = po.procurement_status || defaultStatus;

        content = `SUBCON Timeline: ${po.po_id}\n\n`;
        content += `${po.date_issued ? '✓' : '○'} PO Issued: ${formatTimestamp(po.date_issued) || 'Pending'}\n`;
        content += `${po.processing_started_at ? '✓' : '○'} Processing Started: ${formatTimestamp(po.processing_started_at) || 'Not started'}\n`;
        if (po.processing_started_at && po.date_issued) {
            content += `  Time to start: ${calculateDays(po.date_issued, po.processing_started_at)}\n`;
        }
        content += `${po.proof_url ? '✓' : '○'} Proof Attached: ${po.proof_attached_at ? formatTimestamp(po.proof_attached_at) : '(none)'}${po.proof_url ? ' \u2014 ' + (po.proof_url.length > 60 ? po.proof_url.substring(0, 60) + '...' : po.proof_url) : ''}\n`;
        content += `${po.processed_at || po.processed_date ? '✓' : '○'} Processed: ${(po.processed_at || po.processed_date) ? formatTimestamp(po.processed_at || po.processed_date) || 'Not yet processed' : 'Not yet processed'}\n`;
        if ((po.processed_at || po.processed_date) && po.processing_started_at) {
            content += `  Processing time: ${calculateDays(po.processing_started_at, po.processed_at || po.processed_date)}\n`;
        }
        if ((po.processed_at || po.processed_date) && po.date_issued) {
            content += `\nTotal Time: ${calculateDays(po.date_issued, po.processed_at || po.processed_date)}`;
        }
    } else {
        // Material Timeline: PO Issued → Procurement Started → Items Procured → Delivered
        content = `Material Timeline: ${po.po_id}\n\n`;
        content += `${po.date_issued ? '✓' : '○'} PO Issued: ${formatTimestamp(po.date_issued) || 'Pending'}\n`;
        content += `${po.procurement_started_at ? '✓' : '○'} Procurement Started: ${formatTimestamp(po.procurement_started_at) || 'Not started'}\n`;
        content += `${po.procured_at || po.procured_date ? '✓' : '○'} Items Procured: ${(po.procured_at || po.procured_date) ? formatTimestamp(po.procured_at || po.procured_date) || 'Not yet procured' : 'Not yet procured'}\n`;
        if ((po.procured_at || po.procured_date) && po.procurement_started_at) {
            content += `  Time: ${calculateDays(po.procurement_started_at, po.procured_at || po.procured_date)}\n`;
        }
        content += `${po.proof_url ? '✓' : '○'} Proof Attached: ${po.proof_attached_at ? formatTimestamp(po.proof_attached_at) : '(none)'}${po.proof_url ? ' \u2014 ' + (po.proof_url.length > 60 ? po.proof_url.substring(0, 60) + '...' : po.proof_url) : ''}\n`;
        content += `${po.delivered_at || po.delivered_date ? '✓' : '○'} Delivered: ${(po.delivered_at || po.delivered_date) ? formatTimestamp(po.delivered_at || po.delivered_date) || 'Not yet delivered' : 'Not yet delivered'}\n`;
        if ((po.delivered_at || po.delivered_date) && (po.procured_at || po.procured_date)) {
            content += `  Time: ${calculateDays(po.procured_at || po.procured_date, po.delivered_at || po.delivered_date)}\n`;
        }
        if ((po.delivered_at || po.delivered_date) && po.date_issued) {
            content += `\nTotal Time: ${calculateDays(po.date_issued, po.delivered_at || po.delivered_date)}`;
        }
    }

    // Show in alert for now (will add proper modal later)
    alert(content);
};

/**
 * Show Procurement Timeline
 * Displays complete procurement audit trail for an MRF (MRF → PRs → TRs → POs)
 */
async function showProcurementTimeline(mrfId) {
    showLoading(true);

    try {
        // Fetch MRF
        const mrfQuery = query(
            collection(db, 'mrfs'),
            where('mrf_id', '==', mrfId)
        );
        const mrfSnapshot = await getDocs(mrfQuery);

        if (mrfSnapshot.empty) {
            showToast('MRF not found', 'error');
            showLoading(false);
            return;
        }

        const mrf = { id: mrfSnapshot.docs[0].id, ...mrfSnapshot.docs[0].data() };

        // Fetch PRs
        const prsQuery = query(
            collection(db, 'prs'),
            where('mrf_id', '==', mrfId)
        );
        const prsSnapshot = await getDocs(prsQuery);
        const prs = [];
        prsSnapshot.forEach(doc => prs.push(doc.data()));

        // Fetch TRs
        const trsQuery = query(
            collection(db, 'transport_requests'),
            where('mrf_id', '==', mrfId)
        );
        const trsSnapshot = await getDocs(trsQuery);
        const trs = [];
        trsSnapshot.forEach(doc => trs.push(doc.data()));

        // Fetch POs
        const posQuery = query(
            collection(db, 'pos'),
            where('mrf_id', '==', mrfId),
            orderBy('date_issued', 'asc')
        );
        const posSnapshot = await getDocs(posQuery);
        const pos = [];
        posSnapshot.forEach(doc => pos.push(doc.data()));

        // Group POs by pr_id for parent-child pairing
        const posByPR = {};
        pos.forEach(po => {
            const prId = po.pr_id || '_unlinked';
            if (!posByPR[prId]) posByPR[prId] = [];
            posByPR[prId].push(po);
        });

        // Helper: get status class for PR/TR finance_status
        const getPRStatusClass = (financeStatus) => {
            if (financeStatus === 'Approved') return 'completed';
            if (financeStatus === 'Rejected') return 'rejected';
            return 'pending';
        };

        // Helper: get status class for PO procurement_status
        const getPOStatusClass = (procStatus) => {
            if (procStatus === 'Delivered' || procStatus === 'Processed') return 'completed';
            if (procStatus === 'Procuring' || procStatus === 'Processing') return 'active';
            return 'pending';
        };

        // Build custom timeline HTML with PR->PO nesting
        const deptLabel = mrf.department === 'services' ? 'Service' : 'Project';
        let timelineHtml = '<div class="timeline">';

        // 1. MRF Created entry
        timelineHtml += `
            <div class="timeline-item completed">
                <div class="timeline-item-title">MRF Created: ${escapeHTML(mrf.mrf_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(mrf.created_at) || 'N/A'}</div>
                <div class="timeline-item-description">Requestor: ${escapeHTML(mrf.requestor_name)} | ${escapeHTML(deptLabel)}: ${escapeHTML(getMRFLabel(mrf))}</div>
            </div>`;

        // 1b. MRF Rejected event (if status is 'Rejected')
        if (mrf.status === 'Rejected') {
            timelineHtml += `
            <div class="timeline-item rejected">
                <div class="timeline-item-title">MRF Rejected: ${escapeHTML(mrf.mrf_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(mrf.rejected_at) || 'N/A'}</div>
                <div class="timeline-item-description">Reason: ${escapeHTML(mrf.rejection_reason || 'No reason provided')} | Rejected by: ${escapeHTML(mrf.rejected_by || 'Procurement')}</div>
            </div>`;
        }

        // 2. PRs with nested child POs — lifecycle-aware (Submitted → Rejected → Resubmitted)
        prs.forEach(pr => {
            const hasRejection = !!(pr.rejection_reason || pr.rejected_at);
            const hasResubmission = hasRejection && !!pr.resubmitted_at;
            const childPOs = posByPR[pr.pr_id] || [];

            const childHtml = childPOs.map(po => {
                const poStatusClass = getPOStatusClass(po.procurement_status);
                return `
                <div class="timeline-child-item ${poStatusClass}">
                    <div class="timeline-item-title">Purchase Order: ${escapeHTML(po.po_id)}</div>
                    <div class="timeline-item-date">${formatTimestamp(po.date_issued) || 'N/A'}</div>
                    <div class="timeline-item-description">Supplier: ${escapeHTML(po.supplier_name)}</div>
                    <div class="timeline-procurement-status">
                        <span class="status-badge ${getStatusClass(po.procurement_status || 'Pending Procurement')}">
                            ${escapeHTML(po.procurement_status || 'Pending Procurement')}
                        </span>
                    </div>
                </div>`;
            }).join('');

            // Submitted event: green if Approved (and no rejection), grey otherwise
            const submittedClass = (pr.finance_status === 'Approved' && !hasRejection) ? 'completed' : 'pending';
            timelineHtml += `
            <div class="timeline-item ${submittedClass}">
                <div class="timeline-item-title">Purchase Request Submitted: ${escapeHTML(pr.pr_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(pr.date_generated) || 'N/A'}</div>
                <div class="timeline-item-description">Supplier: ${escapeHTML(pr.supplier_name)} | Amount: ₱${formatCurrency(pr.total_amount)}</div>
            </div>`;

            // Rejection event
            if (hasRejection) {
                timelineHtml += `
            <div class="timeline-item rejected">
                <div class="timeline-item-title">❌ PR Rejected: ${escapeHTML(pr.pr_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(pr.rejected_at) || 'N/A'}</div>
                <div class="timeline-item-description">Reason: ${escapeHTML(pr.rejection_reason || 'No reason provided')} | Rejected by: ${escapeHTML(pr.rejected_by || 'Finance')}</div>
            </div>`;
            }

            // Resubmission event
            if (hasResubmission) {
                timelineHtml += `
            <div class="timeline-item active">
                <div class="timeline-item-title">↩ Resubmitted: ${escapeHTML(pr.pr_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(pr.resubmitted_at) || 'N/A'}</div>
                <div class="timeline-item-description">Resubmitted for Finance review</div>
            </div>`;
            }

            // Approved event (with nested POs) — only shown if finance_status is Approved
            if (pr.finance_status === 'Approved') {
                timelineHtml += `
            <div class="timeline-item completed">
                <div class="timeline-item-title">PR Approved: ${escapeHTML(pr.pr_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(pr.date_generated) || 'N/A'}</div>
                <div class="timeline-item-description">Finance approved | Amount: ₱${formatCurrency(pr.total_amount)}</div>
                ${childPOs.length > 0 ? `<div class="timeline-children">${childHtml}</div>` : ''}
            </div>`;
            } else if (!hasRejection && childPOs.length > 0) {
                // Edge case: POs exist but PR not yet approved — show children under submitted entry
                timelineHtml += `<div class="timeline-children">${childHtml}</div>`;
            }
        });

        // 3. TRs as standalone items — lifecycle-aware (Submitted → Rejected → Resubmitted)
        trs.forEach(tr => {
            const hasRejection = !!(tr.rejection_reason || tr.rejected_at);
            const hasResubmission = hasRejection && !!tr.resubmitted_at;

            // Submitted event
            const submittedClass = (tr.finance_status === 'Approved' && !hasRejection) ? 'completed' : 'pending';
            timelineHtml += `
            <div class="timeline-item ${submittedClass}">
                <div class="timeline-item-title">Transport Request Submitted: ${escapeHTML(tr.tr_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(tr.date_submitted) || 'N/A'}</div>
                <div class="timeline-item-description">Amount: ₱${formatCurrency(tr.total_amount)}</div>
            </div>`;

            // Rejection event
            if (hasRejection) {
                timelineHtml += `
            <div class="timeline-item rejected">
                <div class="timeline-item-title">❌ TR Rejected: ${escapeHTML(tr.tr_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(tr.rejected_at) || 'N/A'}</div>
                <div class="timeline-item-description">Reason: ${escapeHTML(tr.rejection_reason || 'No reason provided')} | Rejected by: ${escapeHTML(tr.rejected_by || 'Finance')}</div>
            </div>`;
            }

            // Resubmission event
            if (hasResubmission) {
                timelineHtml += `
            <div class="timeline-item active">
                <div class="timeline-item-title">↩ Resubmitted: ${escapeHTML(tr.tr_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(tr.resubmitted_at) || 'N/A'}</div>
                <div class="timeline-item-description">Resubmitted for Finance review</div>
            </div>`;
            }

            // Approved event
            if (tr.finance_status === 'Approved') {
                timelineHtml += `
            <div class="timeline-item completed">
                <div class="timeline-item-title">TR Approved: ${escapeHTML(tr.tr_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(tr.date_submitted) || 'N/A'}</div>
                <div class="timeline-item-description">Finance approved | Amount: ₱${formatCurrency(tr.total_amount)}</div>
            </div>`;
            }
        });

        // 4. Orphan POs (not linked to any PR)
        const orphanPOs = posByPR['_unlinked'] || [];
        orphanPOs.forEach(po => {
            const poStatusClass = getPOStatusClass(po.procurement_status);
            timelineHtml += `
            <div class="timeline-item ${poStatusClass}">
                <div class="timeline-item-title">Purchase Order: ${escapeHTML(po.po_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(po.date_issued) || 'N/A'}</div>
                <div class="timeline-item-description">Supplier: ${escapeHTML(po.supplier_name)}</div>
                <div class="timeline-procurement-status">
                    <span class="status-badge ${getStatusClass(po.procurement_status || 'Pending Procurement')}">
                        ${escapeHTML(po.procurement_status || 'Pending Procurement')}
                    </span>
                </div>
            </div>`;
        });

        timelineHtml += '</div>';

        document.getElementById('timelineModalTitle').textContent = `Procurement Timeline - ${mrfId}`;
        document.getElementById('timelineModalBody').innerHTML = timelineHtml;
        document.getElementById('timelineModal').classList.add('active');

    } catch (error) {
        console.error('[Procurement] Error loading timeline:', error);
        showToast('Failed to load procurement timeline', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Close Timeline Modal
 */
function closeTimelineModal() {
    document.getElementById('timelineModal').classList.remove('active');
}

// ========================================
// DOCUMENT GENERATION FUNCTIONS
// ========================================

/**
 * Document Configuration
 */
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
                <td>${item.item || item.item_name}</td>
                ${type === 'PR' ? `<td>${item.category || 'N/A'}</td>` : ''}
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
 * Generate PR HTML document
 * @param {Object} data - Document data with all placeholders
 * @returns {string} - Complete HTML document
 */
function generatePRHTML(data) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${data.PR_ID} - Purchase Request</title>
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
                .total {
                    font-size: 12pt;
                    font-weight: bold;
                    margin: 15px 0;
                    text-align: right;
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
                <div class="title">PURCHASE REQUEST FORM (PR)</div>

                <div class="section">
                    <div class="field"><span class="label">Document No.:</span> ${data.PR_ID}</div>
                    <div class="field"><span class="label">MRF Reference:</span> ${data.MRF_ID}</div>
                    <div class="field"><span class="label">Date:</span> ${data.DATE}</div>
                    <div class="field"><span class="label">Prepared by:</span> ${data.PREPARED_BY}</div>
                </div>

                <div class="section">
                    <div class="field"><span class="label">Project:</span> ${data.PROJECT}</div>
                    <div class="field"><span class="label">Delivery Address:</span> ${data.ADDRESS}</div>
                    <div class="field"><span class="label">Supplier:</span> ${data.SUPPLIER}</div>
                </div>

                <div class="section">
                    <h3 style="margin: 10px 0;">Items Requested:</h3>
                    ${data.ITEMS_TABLE}
                </div>

                <div class="total">
                    TOTAL AMOUNT: ₱${data.TOTAL_COST}
                </div>

                <div style="margin-top: 40px; page-break-inside: avoid;">
                    <div style="margin: 8px 0;">
                        <span style="font-weight: bold; display: inline-block; width: 150px;">Requested By:</span> ${data.REQUESTOR}
                    </div>
                    <div style="margin: 8px 0;">
                        <span style="font-weight: bold; display: inline-block; width: 150px;">Prepared by:</span> ${data.PREPARED_BY}
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
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

/**
 * Generate PR Document
 * @param {string} prDocId - Firestore document ID of the PR
 */
async function generatePRDocument(prDocId) {
    showLoading(true);

    try {
        // Fetch PR data from Firestore
        const prRef = doc(db, 'prs', prDocId);
        const prDoc = await getDoc(prRef);

        if (!prDoc.exists()) {
            throw new Error('PR not found');
        }

        const pr = prDoc.data();
        const items = JSON.parse(pr.items_json || '[]');

        // Prepare document data
        const documentData = {
            PR_ID: pr.pr_id,
            MRF_ID: pr.mrf_id,
            DATE: formatDocumentDate(pr.date_generated || new Date().toISOString()),
            PROJECT: getMRFLabel(pr),
            ADDRESS: pr.delivery_address,
            SUPPLIER: pr.supplier_name || 'Not specified',
            ITEMS_TABLE: generateItemsTableHTML(items, 'PR'),
            TOTAL_COST: formatCurrency(pr.total_amount),
            REQUESTOR: pr.requestor_name,
            PREPARED_BY: pr.pr_creator_name || pr.procurement_pic || 'Procurement Team',
            company_info: DOCUMENT_CONFIG.companyInfo
        };

        // Generate HTML and open in print window
        const html = generatePRHTML(documentData);
        openPrintWindow(html, documentData.PR_ID);

        showToast('PR document opened. Use browser Print → Save as PDF', 'success');

    } catch (error) {
        console.error('Error generating PR document:', error);
        showToast('Failed to generate PR document', 'error');
        throw error;
    } finally {
        showLoading(false);
    }
};

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
            DATE: formatTimestamp(po.date_issued) || formatDocumentDate(po.date_issued_legacy) || 'N/A',
            SUPPLIER: po.supplier_name,
            QUOTE_REF: po.quote_ref || 'N/A',
            ITEMS_TABLE: generateItemsTableHTML(items, 'PO'),
            DELIVERY_ADDRESS: po.delivery_address,
            PAYMENT_TERMS: Array.isArray(po.tranches) && po.tranches.length > 0
                ? po.tranches.map(t => `${t.label} (${t.percentage}%)`).join(', ')
                : (po.payment_terms || ''),
            CONDITION: po.condition || '',
            DELIVERY_DATE: po.delivery_date ? formatDocumentDate(po.delivery_date) : '',
            FINANCE_APPROVER: po.finance_approver_name || po.finance_approver || DOCUMENT_CONFIG.defaultFinancePIC,
            FINANCE_SIGNATURE_URL: po.finance_signature_url || '',
            company_info: DOCUMENT_CONFIG.companyInfo
        };

        // Generate HTML and open in print window
        const html = generatePOHTML(documentData);
        openPrintWindow(html, documentData.PO_ID);

        showToast('PO document opened. Use browser Print → Save as PDF', 'success');

    } catch (error) {
        console.error('Error generating PO document:', error);
        showToast('Failed to generate PO document', 'error');
        throw error;
    } finally {
        showLoading(false);
    }
};

/**
 * Prompt for PO document fields then generate document
 * Shows a modal with input fields for payment terms, condition, and delivery date
 * @param {string} poDocId - Firestore document ID of the PO
 */
async function promptPODocument(poDocId) {
    // Fetch current PO data to pre-fill fields
    try {
        const poRef = doc(db, 'pos', poDocId);
        const poDoc = await getDoc(poRef);
        if (!poDoc.exists()) {
            showToast('PO not found', 'error');
            return;
        }
        const po = poDoc.data();

        // If all three document fields already exist, skip prompt and generate directly
        if ((Array.isArray(po.tranches) && po.tranches.length > 0 || po.payment_terms) && po.condition && po.delivery_date) {
            await generatePODocument(poDocId);
            return;
        }

        // Build tranche data for the prompt modal
        const promptTranches = Array.isArray(po.tranches) && po.tranches.length > 0
            ? po.tranches
            : [{ label: po.payment_terms || 'Full Payment', percentage: 100 }];

        // Create prompt modal using the codebase's createModal pattern
        let modalContainer = document.getElementById('poDocFieldsModalContainer');
        if (!modalContainer) {
            modalContainer = document.createElement('div');
            modalContainer.id = 'poDocFieldsModalContainer';
            document.body.appendChild(modalContainer);
        }

        const modalBody = `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                <div>
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #1e293b;">Payment Tranches</label>
                    ${renderTrancheBuilder(promptTranches, poDocId)}
                </div>
                <div>
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #1e293b;">Condition</label>
                    <input type="text" id="poDocCondition" value="${po.condition || ''}" placeholder="e.g., Items must meet quality standards"
                           style="width: 100%; padding: 0.75rem; border: 1.5px solid #e2e8f0; border-radius: 8px; font-family: inherit; font-size: 0.875rem;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #1e293b;">Delivery Date</label>
                    <input type="date" id="poDocDeliveryDate" value="${po.delivery_date || ''}"
                           style="width: 100%; padding: 0.75rem; border: 1.5px solid #e2e8f0; border-radius: 8px; font-family: inherit; font-size: 0.875rem;">
                </div>
            </div>
        `;

        modalContainer.innerHTML = createModal({
            id: 'poDocFieldsModal',
            title: `PO Document Details: ${po.po_id}`,
            body: modalBody,
            footer: `
                <button class="btn btn-secondary" onclick="closeModal('poDocFieldsModal')">Cancel</button>
                <button class="btn btn-primary" onclick="generatePOWithFields('${poDocId}')">Generate PO Document</button>
            `,
            size: 'medium'
        });

        openModal('poDocFieldsModal');

    } catch (error) {
        console.error('Error loading PO for document prompt:', error);
        showToast('Failed to load PO details', 'error');
    }
}

/**
 * Save PO document fields from the PO Details Modal (editable section)
 * @param {string} poId - Firestore document ID of the PO
 */
async function savePODocumentFields(poId) {
    const tranches = readTranchesFromDOM(poId);
    const trancheTotal = tranches.reduce((s, t) => s + t.percentage, 0);
    if (Math.abs(trancheTotal - 100) > 0.01) {
        showToast('Tranches must total exactly 100%. Current total: ' + trancheTotal.toFixed(2) + '%', 'error');
        return;
    }
    const condition = document.getElementById(`editCondition_${poId}`)?.value?.trim() || '';
    const deliveryDate = document.getElementById(`editDeliveryDate_${poId}`)?.value || '';

    try {
        const updateData = {};
        updateData.tranches = tranches;
        // Also write a human-readable payment_terms string for backward compat with PO document template
        updateData.payment_terms = tranches.map(t => `${t.label} (${t.percentage}%)`).join(', ');
        if (condition) updateData.condition = condition;
        if (deliveryDate) updateData.delivery_date = deliveryDate;

        await updateDoc(doc(db, 'pos', poId), updateData);
        showToast('Document details updated successfully', 'success');
    } catch (error) {
        console.error('Error saving document fields:', error);
        showToast('Failed to save document details', 'error');
    }
}

/**
 * Save PO document fields and generate the document
 * @param {string} poDocId - Firestore document ID of the PO
 */
async function generatePOWithFields(poDocId) {
    const tranches = readTranchesFromDOM(poDocId);
    const trancheTotal = tranches.reduce((s, t) => s + t.percentage, 0);
    if (Math.abs(trancheTotal - 100) > 0.01) {
        showToast('Tranches must total exactly 100%. Current total: ' + trancheTotal.toFixed(2) + '%', 'error');
        return;
    }
    const condition = document.getElementById('poDocCondition')?.value?.trim() || '';
    const deliveryDate = document.getElementById('poDocDeliveryDate')?.value || '';

    try {
        // Save fields to Firestore so they persist for future views
        const updateData = {};
        updateData.tranches = tranches;
        // Also write a human-readable payment_terms string for backward compat with PO document template
        updateData.payment_terms = tranches.map(t => `${t.label} (${t.percentage}%)`).join(', ');
        if (condition) updateData.condition = condition;
        if (deliveryDate) updateData.delivery_date = deliveryDate;

        const poRef = doc(db, 'pos', poDocId);
        await updateDoc(poRef, updateData);

        // Close the fields modal
        closeModal('poDocFieldsModal');

        // Generate the document (it will re-read from Firestore with updated fields)
        await generatePODocument(poDocId);

    } catch (error) {
        console.error('Error saving PO fields:', error);
        showToast('Failed to save PO details', 'error');
    }
}

/**
 * View PO Document (wrapper for generatePODocument)
 */
async function viewPODocument(poDocId) {
    try {
        await generatePODocument(poDocId);
    } catch (error) {
        console.error('Error viewing PO document:', error);
        showToast('Failed to open PO document', 'error');
    }
};

/**
 * Download PO Document (wrapper for generatePODocument)
 */
async function downloadPODocument(poDocId) {
    try {
        await generatePODocument(poDocId);
    } catch (error) {
        console.error('Error downloading PO document:', error);
        showToast('Failed to download PO document', 'error');
    }
};

/**
 * Generate All PO Documents - Opens document for each PO with a delay
 * @param {Array<string>} poDocIds - Array of Firestore document IDs for POs
 */
async function generateAllPODocuments(poDocIds) {
    if (!poDocIds || poDocIds.length === 0) {
        showToast('No POs to generate documents for', 'error');
        return;
    }

    showToast(`Generating ${poDocIds.length} PO document(s)... Please allow pop-ups.`, 'info');

    // Generate documents with a small delay between each to prevent browser blocking
    for (let i = 0; i < poDocIds.length; i++) {
        try {
            await generatePODocument(poDocIds[i]);

            // Add a small delay between documents to prevent browser from blocking pop-ups
            if (i < poDocIds.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (error) {
            console.error(`Error generating document for PO ${poDocIds[i]}:`, error);
        }
    }

    showToast(`Generated ${poDocIds.length} PO document(s). Check your browser tabs/windows.`, 'success');
};

