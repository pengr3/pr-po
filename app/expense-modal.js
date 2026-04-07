/* ========================================
   EXPENSE BREAKDOWN MODAL - Shared Module
   Unified expense modal used by Finance, Project Detail, and Service Detail views
   ======================================== */

import { db, collection, query, where, getDocs } from './firebase.js';
import { formatCurrency, downloadCSV, escapeHTML } from './utils.js';

/**
 * Show unified expense breakdown modal for a project or service.
 * @param {string} identifier - project_name (mode='project') or service_code (mode='service')
 * @param {object} [options]
 * @param {string} [options.mode='project'] - 'project' | 'service'
 * @param {string} [options.displayName] - Display name for modal header (falls back to identifier)
 * @param {number} [options.budget] - Budget amount; only used in service mode (project mode fetches it)
 */
export async function showExpenseBreakdownModal(identifier, { mode = 'project', displayName, budget } = {}) {
    // Remove any existing instance of this modal
    const existingModal = document.getElementById('expenseBreakdownModal');
    if (existingModal) existingModal.remove();

    // -----------------------------------------------------------------------
    // Query branching — only this section differs between modes
    // -----------------------------------------------------------------------
    let posSnapshot, trsSnapshot;

    if (mode === 'service') {
        // identifier = service_code; budget passed in via options
        budget = parseFloat(budget || 0);
        [posSnapshot, trsSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'pos'), where('service_code', '==', identifier))),
            getDocs(query(collection(db, 'transport_requests'), where('service_code', '==', identifier)))
        ]);
    } else {
        // identifier = project_name; budget fetched from projects collection
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

    // -----------------------------------------------------------------------
    // Fetch RFPs for remaining payable calculation
    // -----------------------------------------------------------------------
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
    let totalRequested = 0;
    let totalPaid = 0;
    rfpsForPayable.forEach(rfp => {
        totalRequested += parseFloat(rfp.amount_requested || 0);
        totalPaid += (rfp.payment_records || []).filter(r => r.status !== 'voided').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    });
    // -----------------------------------------------------------------------
    // All downstream logic is identical for both modes
    // -----------------------------------------------------------------------

    // Phase 71: Payables tab data accumulators
    const payablesPOs = [];
    const payablesTRs = [];

    // Parse items from POs for category breakdown
    const categoryTotals = {};
    const transportCategoryItems = [];
    const deliveryFeeItems = [];
    let materialTotal = 0;
    let deliveryFeeTotal = 0;
    let subconTotal = 0;
    let subconCount = 0;
    const subconPoIds = new Set();
    let materialCount = 0;

    posSnapshot.forEach(poDoc => {
        const po = poDoc.data();
        const isSubcon = po.is_subcon === true;
        const poDate = po.date_issued
            ? (po.date_issued.toDate ? po.date_issued.toDate().toISOString().slice(0, 10) : String(po.date_issued).slice(0, 10))
            : '';
        const poSupplier = po.supplier_name || '';

        // Collect delivery fees
        const fee = parseFloat(po.delivery_fee || 0);
        if (fee > 0) {
            deliveryFeeTotal += fee;
            deliveryFeeItems.push({ po_id: po.po_id, amount: fee, date: poDate, supplier: poSupplier });
        }

        // Phase 71: collect raw PO data for Payables tab
        payablesPOs.push({
            po_id: po.po_id || '',
            supplier_name: poSupplier,
            total_amount: parseFloat(po.total_amount || 0),
            delivery_fee: fee,
        });

        if (isSubcon) {
            subconTotal += parseFloat(po.total_amount || 0) - fee;
            subconCount++;
        } else {
            materialCount++;
        }

        const items = JSON.parse(po.items_json || '[]');
        items.forEach(item => {
            const itemName = item.item || item.item_name || item.itemName || item.name || 'Unnamed Item';
            const qty = item.qty || item.quantity || 0;
            const unit = item.unit || 'pcs';
            const unitCost = parseFloat(item.unit_cost || item.unitCost || item.price || 0);
            const subtotal = parseFloat(item.subtotal || item.total || (qty * unitCost) || 0);
            const category = item.category || 'Uncategorized';

            const isTransportItem = category.toLowerCase().includes('transportation') ||
                                   category.toLowerCase().includes('hauling');
            // Category-level subcon detection: only for non-is_subcon POs (is_subcon POs
            // are already totalled at PO level via po.total_amount above)
            const isSubconCategory = !isSubcon && category.toLowerCase().includes('subcon');

            if (isSubcon) {
                // Already counted via po.total_amount — skip item loop entirely
            } else if (isTransportItem) {
                transportCategoryItems.push({
                    po_id: po.po_id, item_name: itemName,
                    quantity: qty, unit, unit_cost: unitCost, subtotal, category,
                    date: poDate, supplier: poSupplier
                });
            } else if (isSubconCategory) {
                subconTotal += subtotal;
                subconPoIds.add(po.po_id);
            } else {
                if (!categoryTotals[category]) {
                    categoryTotals[category] = { amount: 0, items: [] };
                }
                categoryTotals[category].amount += subtotal;
                categoryTotals[category].items.push({
                    po_id: po.po_id, item_name: itemName,
                    quantity: qty, unit, unit_cost: unitCost, subtotal,
                    date: poDate, supplier: poSupplier
                });
                materialTotal += subtotal;
            }
        });
    });

    // Fetch TRs
    const transportRequests = [];
    const trLineItems = [];
    let trTotal = 0;

    trsSnapshot.forEach(trDoc => {
        const tr = trDoc.data();
        if (tr.finance_status === 'Approved') {
            const amount = parseFloat(tr.total_amount || 0);
            trTotal += amount;
            transportRequests.push({
                tr_id: tr.tr_id, supplier: tr.supplier_name || 'N/A', amount
            });
            // Phase 71: collect raw TR data for Payables tab
            payablesTRs.push({
                tr_id: tr.tr_id || '',
                supplier_name: tr.supplier_name || 'N/A',
                total_amount: amount,
            });
            const trDate = tr.date_submitted
                ? (tr.date_submitted.toDate ? tr.date_submitted.toDate().toISOString().slice(0, 10) : String(tr.date_submitted).slice(0, 10))
                : '';
            const trSupplier = tr.supplier_name || '';
            const trItems = JSON.parse(tr.items_json || '[]');
            trItems.forEach(item => {
                const itemName = item.item || item.item_name || item.itemName || item.name || 'Unnamed Item';
                const qty = item.qty || item.quantity || 0;
                const unit = item.unit || 'pcs';
                const unitCost = parseFloat(item.unit_cost || item.unitCost || item.price || 0);
                const subtotal = parseFloat(item.subtotal || item.total || (qty * unitCost) || 0);
                trLineItems.push({ tr_id: tr.tr_id, item_name: itemName, quantity: qty, unit, unit_cost: unitCost, subtotal, date: trDate, supplier: trSupplier });
            });
        }
    });

    // Export function — closure over computed data so it can be called from the modal button
    const exportTitle = displayName || identifier;
    window._exportExpenseBreakdownCSV = function() {
        const headers = ['DATE', 'CATEGORY', 'SUPPLIER/SUBCONTRACTOR', 'ITEMS', 'QTY', 'UNIT', 'UNIT COST', 'TOTAL COST', 'REQUESTED BY', 'REMARKS'];
        const rows = [];
        Object.entries(categoryTotals).forEach(([cat, data]) => {
            data.items.forEach(item => {
                rows.push([item.date, cat, item.supplier, item.item_name, item.quantity, item.unit, item.unit_cost.toFixed(2), item.subtotal.toFixed(2), '', '']);
            });
        });
        transportCategoryItems.forEach(item => {
            rows.push([item.date, item.category, item.supplier, item.item_name, item.quantity, item.unit, item.unit_cost.toFixed(2), item.subtotal.toFixed(2), '', '']);
        });
        deliveryFeeItems.forEach(item => {
            rows.push([item.date, 'Delivery Fee', item.supplier, 'Delivery Fee', 1, 'lot', item.amount.toFixed(2), item.amount.toFixed(2), '', '']);
        });
        if (trLineItems.length > 0) {
            trLineItems.forEach(item => {
                rows.push([item.date, 'Transport Fees', item.supplier, item.item_name, item.quantity, item.unit, item.unit_cost.toFixed(2), item.subtotal.toFixed(2), '', '']);
            });
        } else {
            transportRequests.forEach(tr => {
                rows.push(['', 'Transport Fees', tr.supplier, 'Transport Request', 1, 'lot', tr.amount.toFixed(2), tr.amount.toFixed(2), '', '']);
            });
        }
        if (rows.length === 0) return;
        const today = new Date().toISOString().slice(0, 10);
        const safeName = exportTitle.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '');
        downloadCSV(headers, rows, `${safeName}-expenses-${today}.csv`);
    };

    // -----------------------------------------------------------------------
    // Phase 71: Payables tab — status derivation helpers + row construction
    // Ported from app/views/finance.js derivePOSummary (Phase 65.3) — do NOT import
    // from view modules to avoid circular dependencies.
    // -----------------------------------------------------------------------

    // Active-tranche status derivation for POs (multi-tranche collapse per D-01/D-03)
    function deriveStatusForPO(poRfps, poTotalAmount) {
        // Exclude Delivery Fee RFPs — they belong to a separate Delivery Fee row (D-01)
        const regularRFPs = poRfps.filter(r => r.tranche_label !== 'Delivery Fee');

        const totalPayable = poTotalAmount;
        const totalPaid = regularRFPs.reduce((s, r) => {
            return s + (r.payment_records || [])
                .filter(p => p.status !== 'voided')
                .reduce((ps, p) => ps + parseFloat(p.amount || 0), 0);
        }, 0);

        // No RFP at all → Not Requested
        if (regularRFPs.length === 0) {
            return { statusBucket: 'Not Requested', statusLabel: 'Not Requested', totalPayable, totalPaid: 0 };
        }

        // Fully paid (PO-level)
        if (totalPaid >= totalPayable && totalPayable > 0) {
            return { statusBucket: 'Fully Paid', statusLabel: 'Fully Paid', totalPayable, totalPaid };
        }

        // Find currently active tranche: first (sorted by tranche_percentage asc) that is not fully paid
        const sorted = [...regularRFPs].sort((a, b) =>
            (parseFloat(a.tranche_percentage) || 0) - (parseFloat(b.tranche_percentage) || 0)
        );
        const firstUnpaid = sorted.find(r => {
            const reqAmt = parseFloat(r.amount_requested || 0);
            const paidAmt = (r.payment_records || [])
                .filter(p => p.status !== 'voided')
                .reduce((s, p) => s + parseFloat(p.amount || 0), 0);
            return paidAmt < reqAmt;
        });

        if (!firstUnpaid) {
            // All individual RFPs closed but PO not fully paid (data edge case)
            return { statusBucket: 'Partial', statusLabel: 'Partial', totalPayable, totalPaid };
        }

        // Active tranche payment status
        const activePaid = (firstUnpaid.payment_records || [])
            .filter(p => p.status !== 'voided')
            .reduce((s, p) => s + parseFloat(p.amount || 0), 0);

        if (activePaid <= 0 && totalPaid <= 0) {
            // RFP exists for active tranche, no payments anywhere → Requested
            return { statusBucket: 'Requested', statusLabel: 'Requested', totalPayable, totalPaid: 0 };
        }

        // Partial: at least some payment recorded somewhere
        // Format per Phase 65.3: "{TrancheLabel} — NN% Paid"
        const pctPaid = totalPayable > 0 ? Math.round((totalPaid / totalPayable) * 100) : 0;
        const trancheLabel = firstUnpaid.tranche_label || 'Tranche';
        return {
            statusBucket: 'Partial',
            statusLabel: `${escapeHTML(trancheLabel)} \u2014 ${pctPaid}% Paid`,
            totalPayable,
            totalPaid,
        };
    }

    // TR status derivation (TRs are single-shot, simpler than PO tranches)
    function deriveStatusForTR(trRfps, trTotalAmount) {
        const totalPayable = trTotalAmount;
        const totalPaid = trRfps.reduce((s, r) => {
            return s + (r.payment_records || [])
                .filter(p => p.status !== 'voided')
                .reduce((ps, p) => ps + parseFloat(p.amount || 0), 0);
        }, 0);

        if (trRfps.length === 0) {
            return { statusBucket: 'Not Requested', statusLabel: 'Not Requested', totalPayable, totalPaid: 0 };
        }
        if (totalPaid >= totalPayable && totalPayable > 0) {
            return { statusBucket: 'Fully Paid', statusLabel: 'Fully Paid', totalPayable, totalPaid };
        }
        if (totalPaid <= 0) {
            return { statusBucket: 'Requested', statusLabel: 'Requested', totalPayable, totalPaid: 0 };
        }
        // Partial — format per Phase 65.3
        const pctPaid = totalPayable > 0 ? Math.round((totalPaid / totalPayable) * 100) : 0;
        const trancheLabel = (trRfps[0] && trRfps[0].tranche_label) || 'Payment';
        return {
            statusBucket: 'Partial',
            statusLabel: `${escapeHTML(trancheLabel)} \u2014 ${pctPaid}% Paid`,
            totalPayable,
            totalPaid,
        };
    }

    // Delivery Fee status derivation per D-04 (3-state subset: Not Requested / Requested / Fully Paid)
    function deriveStatusForDeliveryFee(dfRfps, dfAmount) {
        const totalPayable = dfAmount;
        const totalPaid = dfRfps.reduce((s, r) => {
            return s + (r.payment_records || [])
                .filter(p => p.status !== 'voided')
                .reduce((ps, p) => ps + parseFloat(p.amount || 0), 0);
        }, 0);
        if (dfRfps.length === 0) {
            return { statusBucket: 'Not Requested', statusLabel: 'Not Requested', totalPayable, totalPaid: 0 };
        }
        if (totalPaid >= totalPayable && totalPayable > 0) {
            return { statusBucket: 'Fully Paid', statusLabel: 'Fully Paid', totalPayable, totalPaid };
        }
        if (totalPaid <= 0) {
            return { statusBucket: 'Requested', statusLabel: 'Requested', totalPayable, totalPaid: 0 };
        }
        // Partial fallback per D-04 — edge case, render as generic Partial
        const pctPaid = totalPayable > 0 ? Math.round((totalPaid / totalPayable) * 100) : 0;
        return {
            statusBucket: 'Partial',
            statusLabel: `Delivery Fee \u2014 ${pctPaid}% Paid`,
            totalPayable,
            totalPaid,
        };
    }

    // Group RFPs by their target payable (D-01: one row per entity)
    const rfpsByPoId = new Map();          // po_id -> RFP[] (regular tranches only)
    const rfpsByTrId = new Map();          // tr_id -> RFP[]
    const deliveryFeeRfpsByPoId = new Map(); // po_id -> RFP[] where tranche_label === 'Delivery Fee'

    rfpsForPayable.forEach(rfp => {
        if (rfp.po_id && rfp.tranche_label === 'Delivery Fee') {
            if (!deliveryFeeRfpsByPoId.has(rfp.po_id)) deliveryFeeRfpsByPoId.set(rfp.po_id, []);
            deliveryFeeRfpsByPoId.get(rfp.po_id).push(rfp);
        } else if (rfp.po_id) {
            if (!rfpsByPoId.has(rfp.po_id)) rfpsByPoId.set(rfp.po_id, []);
            rfpsByPoId.get(rfp.po_id).push(rfp);
        } else if (rfp.tr_id) {
            if (!rfpsByTrId.has(rfp.tr_id)) rfpsByTrId.set(rfp.tr_id, []);
            rfpsByTrId.get(rfp.tr_id).push(rfp);
        }
    });

    // Build payable rows: one per PO, one per Delivery Fee, one per Approved TR (D-01)
    const payablesRows = [];

    payablesPOs.forEach(po => {
        // PO row — total_amount minus delivery fee (delivery fee is its own separate row)
        const poTotalForRow = po.total_amount - po.delivery_fee;
        if (poTotalForRow > 0) {
            const status = deriveStatusForPO(rfpsByPoId.get(po.po_id) || [], poTotalForRow);
            payablesRows.push({
                particulars: `${escapeHTML(po.po_id)} \u2014 ${escapeHTML(po.supplier_name || 'N/A')}`,
                statusBucket: status.statusBucket,
                statusLabel: status.statusLabel,
                totalPayable: status.totalPayable,
                totalPaid: status.totalPaid,
                kind: 'po',
            });
        }
        // Delivery Fee row — separate row per D-01
        if (po.delivery_fee > 0) {
            const dfStatus = deriveStatusForDeliveryFee(deliveryFeeRfpsByPoId.get(po.po_id) || [], po.delivery_fee);
            payablesRows.push({
                particulars: `${escapeHTML(po.po_id)} \u2014 Delivery Fee`,
                statusBucket: dfStatus.statusBucket,
                statusLabel: dfStatus.statusLabel,
                totalPayable: dfStatus.totalPayable,
                totalPaid: dfStatus.totalPaid,
                kind: 'delivery_fee',
            });
        }
    });

    payablesTRs.forEach(tr => {
        const status = deriveStatusForTR(rfpsByTrId.get(tr.tr_id) || [], tr.total_amount);
        payablesRows.push({
            particulars: `${escapeHTML(tr.tr_id)} \u2014 ${escapeHTML(tr.supplier_name || 'N/A')}`,
            statusBucket: status.statusBucket,
            statusLabel: status.statusLabel,
            totalPayable: status.totalPayable,
            totalPaid: status.totalPaid,
            kind: 'tr',
        });
    });

    // D-06: sort by status bucket order, action-needed first
    // D-07: secondary sort — Total Payable descending within each bucket
    const bucketOrder = { 'Not Requested': 0, 'Requested': 1, 'Partial': 2, 'Fully Paid': 3 };
    payablesRows.sort((a, b) => {
        const ba = bucketOrder[a.statusBucket] ?? 99;
        const bb = bucketOrder[b.statusBucket] ?? 99;
        if (ba !== bb) return ba - bb;
        return b.totalPayable - a.totalPayable;
    });

    const payablesTotalSum = payablesRows.reduce((s, r) => s + r.totalPayable, 0);

    // Build Payables tab card HTML (single collapsible card per D-10)
    // Status badge color palette per D-10 / Claude's Discretion
    const statusColors = {
        'Not Requested': '#991b1b',  // red — needs action
        'Requested':     '#1d4ed8',  // blue — in progress
        'Partial':       '#1d4ed8',  // blue — in progress
        'Fully Paid':    '#166534',  // green — done
    };

    const payablesHTML = payablesRows.length > 0 ? `
        <div class="category-card collapsible">
            <div class="category-header" onclick="window._toggleExpenseCategory(this)">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span class="category-toggle">&#9654;</span>
                    <span class="category-name">PAYABLES</span>
                </div>
                <span class="category-amount">${formatCurrency(payablesTotalSum)}</span>
            </div>
            <div class="category-items" style="display: none;">
                <table class="modal-items-table">
                    <thead>
                        <tr>
                            <th>PARTICULARS</th>
                            <th>STATUS</th>
                            <th style="text-align: right;">TOTAL PAYABLE</th>
                            <th style="text-align: right;">TOTAL PAID</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${payablesRows.map(row => {
                            const color = statusColors[row.statusBucket] || '#64748b';
                            return `
                                <tr>
                                    <td>${row.particulars}</td>
                                    <td style="color: ${color}; font-weight: 600;">${row.statusLabel}</td>
                                    <td style="text-align: right;">${formatCurrency(row.totalPayable)}</td>
                                    <td style="text-align: right;">${formatCurrency(row.totalPaid)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    ` : '<p style="color: #64748b; text-align: center; padding: 2rem;">No payables recorded.</p>';

    // Calculate totals
    const transportCategoryTotal = transportCategoryItems.reduce((s, item) => s + item.subtotal, 0);
    const materialsDisplay = materialTotal - transportCategoryTotal;
    const transportDisplay = trTotal + transportCategoryTotal + deliveryFeeTotal;
    const totalCost = materialsDisplay + transportDisplay + subconTotal;
    const remainingPayable = totalCost - totalPaid;
    const remaining = budget - totalCost;

    // Build category sections HTML
    const categoryHTML = Object.keys(categoryTotals).length > 0
        ? Object.entries(categoryTotals).map(([category, data]) => `
            <div class="category-card collapsible">
                <div class="category-header" onclick="window._toggleExpenseCategory(this)">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="category-toggle">&#9654;</span>
                        <span class="category-name">${category}</span>
                    </div>
                    <span class="category-amount">${formatCurrency(data.amount)}</span>
                </div>
                <div class="category-items" style="display: none;">
                    <table class="modal-items-table">
                        <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Unit Cost</th><th style="text-align: right;">Subtotal</th></tr></thead>
                        <tbody>
                            ${data.items.map(item => `
                                <tr>
                                    <td>${item.item_name}</td>
                                    <td>${item.quantity}</td><td>${item.unit}</td><td>${formatCurrency(item.unit_cost)}</td>
                                    <td style="text-align: right;">${formatCurrency(item.subtotal)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `).join('')
        : '<p style="color: #64748b; text-align: center; padding: 2rem;">No material purchases recorded.</p>';

    // Build transport sections HTML
    const hasTransportData = transportRequests.length > 0 || transportCategoryItems.length > 0 || deliveryFeeItems.length > 0;
    const transportHTML = hasTransportData ? `
        ${transportRequests.length > 0 ? `
            <div class="category-card collapsible">
                <div class="category-header" onclick="window._toggleExpenseCategory(this)">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="category-toggle">&#9654;</span>
                        <span class="category-name">Transport Requests</span>
                    </div>
                    <span class="category-amount">${formatCurrency(transportRequests.reduce((s, tr) => s + tr.amount, 0))}</span>
                </div>
                <div class="category-items" style="display: none;">
                    <table class="modal-items-table">
                        <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Unit Cost</th><th style="text-align: right;">Subtotal</th></tr></thead>
                        <tbody>
                            ${trLineItems.length > 0
                                ? trLineItems.map(item => `
                                    <tr>
                                        <td>${item.item_name}</td>
                                        <td>${item.quantity}</td><td>${item.unit}</td><td>${formatCurrency(item.unit_cost)}</td>
                                        <td style="text-align: right;">${formatCurrency(item.subtotal)}</td>
                                    </tr>
                                `).join('')
                                : transportRequests.map(tr => `
                                    <tr>
                                        <td>${tr.tr_id}</td>
                                        <td>1</td><td>lot</td><td>${formatCurrency(tr.amount)}</td>
                                        <td style="text-align: right;">${formatCurrency(tr.amount)}</td>
                                    </tr>
                                `).join('')
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        ` : ''}
        ${transportCategoryItems.length > 0 ? `
            <div class="category-card collapsible">
                <div class="category-header" onclick="window._toggleExpenseCategory(this)">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="category-toggle">&#9654;</span>
                        <span class="category-name">Transportation &amp; Hauling</span>
                    </div>
                    <span class="category-amount">${formatCurrency(transportCategoryTotal)}</span>
                </div>
                <div class="category-items" style="display: none;">
                    <table class="modal-items-table">
                        <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Unit Cost</th><th style="text-align: right;">Subtotal</th></tr></thead>
                        <tbody>
                            ${transportCategoryItems.map(item => `
                                <tr>
                                    <td>${item.item_name}</td>
                                    <td>${item.quantity}</td><td>${item.unit}</td><td>${formatCurrency(item.unit_cost)}</td>
                                    <td style="text-align: right;">${formatCurrency(item.subtotal)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        ` : ''}
        ${deliveryFeeItems.length > 0 ? `
            <div class="category-card collapsible">
                <div class="category-header" onclick="window._toggleExpenseCategory(this)">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="category-toggle">&#9654;</span>
                        <span class="category-name">Delivery Fees</span>
                    </div>
                    <span class="category-amount">${formatCurrency(deliveryFeeTotal)}</span>
                </div>
                <div class="category-items" style="display: none;">
                    <table class="modal-items-table">
                        <thead><tr><th>PO ID</th><th style="text-align: right;">Amount</th></tr></thead>
                        <tbody>
                            ${deliveryFeeItems.map(item => `
                                <tr><td>${item.po_id}</td><td style="text-align: right;">${formatCurrency(item.amount)}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        ` : ''}
    ` : '<p style="color: #64748b; text-align: center; padding: 2rem;">No transport fees recorded.</p>';

    // Render unified modal
    const title = exportTitle;
    const modalHTML = `
        <div id="expenseBreakdownModal" class="modal active">
            <div class="modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h3>Financial Breakdown: ${title}</h3>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <button onclick="window._exportExpenseBreakdownCSV()" class="btn btn-sm btn-secondary" style="font-size: 0.8125rem;">Export CSV &#8681;</button>
                        <button class="modal-close" onclick="window._closeExpenseBreakdownModal()">&times;</button>
                    </div>
                </div>
                <div class="modal-body">
                    <!-- Budget Row -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                        <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 1rem; border-radius: 8px;">
                            <div style="font-size: 0.875rem; color: #166534; font-weight: 600; margin-bottom: 0.5rem;">Budget</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: #166534;">&#8369;${formatCurrency(budget)}</div>
                        </div>
                        <div style="background: ${remaining >= 0 ? '#f0fdf4' : '#fef2f2'}; border-left: 4px solid ${remaining >= 0 ? '#22c55e' : '#ef4444'}; padding: 1rem; border-radius: 8px;">
                            <div style="font-size: 0.875rem; color: ${remaining >= 0 ? '#166534' : '#991b1b'}; font-weight: 600; margin-bottom: 0.5rem;">Remaining Budget</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: ${remaining >= 0 ? '#166534' : '#991b1b'};">
                                ${remaining < 0 ? '&#9888;&#65039; ' : ''}&#8369;${formatCurrency(Math.abs(remaining))}${remaining < 0 ? ' over' : ''}
                            </div>
                        </div>
                    </div>

                    <!-- Category Scorecards -->
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                        <div style="padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                            <div style="font-size: 0.875rem; color: #64748b; font-weight: 600; margin-bottom: 0.5rem;">Material Purchases</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: #1e293b;">&#8369;${formatCurrency(materialsDisplay)}</div>
                            <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">${materialCount} POs</div>
                        </div>
                        <div style="padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                            <div style="font-size: 0.875rem; color: #64748b; font-weight: 600; margin-bottom: 0.5rem;">Transport Fees</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: #1e293b;">&#8369;${formatCurrency(transportDisplay)}</div>
                            <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">${transportRequests.length} TRs</div>
                        </div>
                        <div style="padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                            <div style="font-size: 0.875rem; color: #64748b; font-weight: 600; margin-bottom: 0.5rem;">Subcon Cost</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: #1e293b;">&#8369;${formatCurrency(subconTotal)}</div>
                            <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">${subconCount + subconPoIds.size} POs</div>
                        </div>
                    </div>

                    <!-- Row 3: Projected Cost + Remaining Payable (only when POs exist) -->
                    ${totalCost > 0 ? `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 2rem;">
                        <div style="padding: 1.25rem; border-radius: 8px; border: 1px solid #3b82f6; background: #eff6ff;">
                            <div style="font-size: 0.875rem; color: #1d4ed8; font-weight: 600; margin-bottom: 0.5rem;">Projected Cost</div>
                            <div style="font-size: 2rem; font-weight: 700; color: #1e293b;">&#8369;${formatCurrency(totalCost)}</div>
                        </div>
                        <div style="padding: 1.25rem; border-radius: 8px; border: 1px solid ${remainingPayable > 0 ? '#fca5a5' : '#e2e8f0'}; background: ${remainingPayable > 0 ? '#fef2f2' : '#ffffff'};">
                            <div style="font-size: 0.875rem; color: ${remainingPayable > 0 ? '#991b1b' : '#64748b'}; font-weight: 600; margin-bottom: 0.5rem;">Remaining Payable</div>
                            <div style="font-size: 2rem; font-weight: 700; color: ${remainingPayable > 0 ? '#ef4444' : '#059669'};">&#8369;${formatCurrency(remainingPayable)}</div>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Tab Navigation -->
                    <div style="border-bottom: 2px solid #e5e7eb;">
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

                    <!-- By Category Tab -->
                    <div id="expBreakdownCategoryTab" style="margin-top: 1.5rem;">
                        ${categoryHTML}
                    </div>

                    <!-- Transport Fees Tab -->
                    <div id="expBreakdownTransportTab" style="display: none; margin-top: 1.5rem;">
                        ${transportHTML}
                    </div>

                    <!-- Payables Tab -->
                    <div id="expBreakdownPayablesTab" style="display: none; margin-top: 1.5rem;">
                        ${payablesHTML}
                    </div>
                </div>
            </div>
        </div>
    `;

    // Inject modal into DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Window functions for modal interaction
window._closeExpenseBreakdownModal = function() {
    const modal = document.getElementById('expenseBreakdownModal');
    if (modal) modal.remove();
    delete window._exportExpenseBreakdownCSV;
};

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

window._toggleExpenseCategory = function(headerEl) {
    const card = headerEl.closest('.category-card');
    const items = card.querySelector('.category-items');
    const toggle = card.querySelector('.category-toggle');
    if (items.style.display === 'none') {
        items.style.display = 'block';
        toggle.innerHTML = '&#9660;';
    } else {
        items.style.display = 'none';
        toggle.innerHTML = '&#9654;';
    }
};

