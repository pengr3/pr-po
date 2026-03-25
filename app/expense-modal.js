/* ========================================
   EXPENSE BREAKDOWN MODAL - Shared Module
   Unified expense modal used by Finance, Project Detail, and Service Detail views
   ======================================== */

import { db, collection, query, where, getDocs } from './firebase.js';
import { formatCurrency, downloadCSV } from './utils.js';

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
    // All downstream logic is identical for both modes
    // -----------------------------------------------------------------------

    // Parse items from POs for category breakdown
    const categoryTotals = {};
    const transportCategoryItems = [];
    const deliveryFeeItems = [];
    let materialTotal = 0;
    let deliveryFeeTotal = 0;
    let subconTotal = 0;
    let subconCount = 0;
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

            if (isTransportItem) {
                transportCategoryItems.push({
                    po_id: po.po_id, item_name: itemName,
                    quantity: qty, unit, unit_cost: unitCost, subtotal, category,
                    date: poDate, supplier: poSupplier
                });
            } else if (!isSubcon) {
                if (!categoryTotals[category]) {
                    categoryTotals[category] = { amount: 0, items: [] };
                }
                categoryTotals[category].amount += subtotal;
                categoryTotals[category].items.push({
                    po_id: po.po_id, item_name: itemName,
                    quantity: qty, unit, unit_cost: unitCost, subtotal,
                    date: poDate, supplier: poSupplier
                });
            }

            if (!isSubcon) materialTotal += subtotal;
        });
    });

    // Fetch TRs
    const transportRequests = [];
    let trTotal = 0;

    trsSnapshot.forEach(trDoc => {
        const tr = trDoc.data();
        if (tr.finance_status === 'Approved') {
            const amount = parseFloat(tr.total_amount || 0);
            trTotal += amount;
            transportRequests.push({
                tr_id: tr.tr_id, supplier: tr.supplier_name || 'N/A', amount
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
        transportRequests.forEach(tr => {
            rows.push(['', 'Transport Fees', tr.supplier, 'Transport Request', 1, 'lot', tr.amount.toFixed(2), tr.amount.toFixed(2), '', '']);
        });
        if (rows.length === 0) return;
        const today = new Date().toISOString().slice(0, 10);
        const safeName = exportTitle.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '');
        downloadCSV(headers, rows, `${safeName}-expenses-${today}.csv`);
    };

    // Calculate totals
    const transportCategoryTotal = transportCategoryItems.reduce((s, item) => s + item.subtotal, 0);
    const materialsDisplay = materialTotal - transportCategoryTotal;
    const transportDisplay = trTotal + transportCategoryTotal + deliveryFeeTotal;
    const totalCost = materialsDisplay + transportDisplay + subconTotal;
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
                        <thead><tr><th>TR ID</th><th>Supplier</th><th style="text-align: right;">Amount</th></tr></thead>
                        <tbody>
                            ${transportRequests.map(tr => `
                                <tr><td>${tr.tr_id}</td><td>${tr.supplier}</td><td style="text-align: right;">${formatCurrency(tr.amount)}</td></tr>
                            `).join('')}
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
                        <thead><tr><th>Supplier</th><th style="text-align: right;">Amount</th></tr></thead>
                        <tbody>
                            ${deliveryFeeItems.map(item => `
                                <tr><td>${item.supplier}</td><td style="text-align: right;">${formatCurrency(item.amount)}</td></tr>
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
                    <h3>Expense Breakdown: ${title}</h3>
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
                            <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">${subconCount} POs</div>
                        </div>
                    </div>

                    <!-- Total Cost -->
                    <div style="background: #eff6ff; border: 2px solid #3b82f6; padding: 1rem; border-radius: 8px; margin-bottom: 2rem;">
                        <div style="font-size: 0.875rem; color: #1e40af; font-weight: 600; margin-bottom: 0.5rem;">Total Cost</div>
                        <div style="font-size: 2rem; font-weight: 700; color: #1e40af;">&#8369;${formatCurrency(totalCost)}</div>
                    </div>

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
                    </div>

                    <!-- By Category Tab -->
                    <div id="expBreakdownCategoryTab" style="margin-top: 1.5rem;">
                        ${categoryHTML}
                    </div>

                    <!-- Transport Fees Tab -->
                    <div id="expBreakdownTransportTab" style="display: none; margin-top: 1.5rem;">
                        ${transportHTML}
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
    if (!categoryTab || !transportTab) return;

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

