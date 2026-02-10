/* ========================================
   EXPENSE BREAKDOWN MODAL - Shared Module
   Unified expense modal used by both Finance and Project Detail views
   ======================================== */

import { db, collection, query, where, getDocs } from './firebase.js';
import { formatCurrency } from './utils.js';

/**
 * Show unified expense breakdown modal for a project
 * Combines Finance-style scorecards with item-level category breakdown
 * @param {string} projectName - The project name to show expenses for
 */
export async function showExpenseBreakdownModal(projectName) {
    // Show loading indicator
    const existingModal = document.getElementById('expenseBreakdownModal');
    if (existingModal) existingModal.remove();

    // Fetch project data for budget
    const projectQuery = query(collection(db, 'projects'), where('project_name', '==', projectName));
    const projectSnapshot = await getDocs(projectQuery);
    const project = projectSnapshot.docs.length > 0 ? projectSnapshot.docs[0].data() : {};

    // Fetch all POs for this project
    const posQuery = query(collection(db, 'pos'), where('project_name', '==', projectName));
    const posSnapshot = await getDocs(posQuery);

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

        // Collect delivery fees
        const fee = parseFloat(po.delivery_fee || 0);
        if (fee > 0) {
            deliveryFeeTotal += fee;
            deliveryFeeItems.push({ po_id: po.po_id, amount: fee });
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
                    quantity: qty, unit, unit_cost: unitCost, subtotal, category
                });
            } else if (!isSubcon) {
                if (!categoryTotals[category]) {
                    categoryTotals[category] = { amount: 0, items: [] };
                }
                categoryTotals[category].amount += subtotal;
                categoryTotals[category].items.push({
                    po_id: po.po_id, item_name: itemName,
                    quantity: qty, unit, unit_cost: unitCost, subtotal
                });
            }

            if (!isSubcon) materialTotal += subtotal;
        });
    });

    // Fetch TRs
    const trsQuery = query(
        collection(db, 'transport_requests'),
        where('project_name', '==', projectName)
    );
    const trsSnapshot = await getDocs(trsQuery);
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

    // Calculate totals
    const transportCategoryTotal = transportCategoryItems.reduce((s, item) => s + item.subtotal, 0);
    const materialsDisplay = materialTotal - transportCategoryTotal - deliveryFeeTotal;
    const transportDisplay = trTotal + transportCategoryTotal + deliveryFeeTotal;
    const totalCost = materialsDisplay + transportDisplay + subconTotal;
    const budget = parseFloat(project.budget || 0);
    const remaining = budget - totalCost;

    // Build category sections HTML
    const categoryHTML = Object.keys(categoryTotals).length > 0
        ? Object.entries(categoryTotals).map(([category, data]) => `
            <div class="category-card collapsible">
                <div class="category-header" onclick="window._toggleExpenseCategory(this)">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="category-toggle">▶</span>
                        <span class="category-name">${category}</span>
                    </div>
                    <span class="category-amount">${formatCurrency(data.amount)}</span>
                </div>
                <div class="category-items" style="display: none;">
                    <table class="modal-items-table">
                        <thead><tr><th>PO ID</th><th>Item</th><th>Qty</th><th>Unit Cost</th><th style="text-align: right;">Subtotal</th></tr></thead>
                        <tbody>
                            ${data.items.map(item => `
                                <tr>
                                    <td>${item.po_id}</td><td>${item.item_name}</td>
                                    <td>${item.quantity} ${item.unit}</td><td>${formatCurrency(item.unit_cost)}</td>
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
                        <span class="category-toggle">▶</span>
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
                        <span class="category-toggle">▶</span>
                        <span class="category-name">Transportation & Hauling</span>
                    </div>
                    <span class="category-amount">${formatCurrency(transportCategoryTotal)}</span>
                </div>
                <div class="category-items" style="display: none;">
                    <table class="modal-items-table">
                        <thead><tr><th>PO ID</th><th>Item</th><th>Qty</th><th>Unit Cost</th><th style="text-align: right;">Subtotal</th></tr></thead>
                        <tbody>
                            ${transportCategoryItems.map(item => `
                                <tr>
                                    <td>${item.po_id}</td><td>${item.item_name}</td>
                                    <td>${item.quantity} ${item.unit}</td><td>${formatCurrency(item.unit_cost)}</td>
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
                        <span class="category-toggle">▶</span>
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
    const modalHTML = `
        <div id="expenseBreakdownModal" class="modal active">
            <div class="modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h3>Expense Breakdown: ${projectName}</h3>
                    <button class="modal-close" onclick="window._closeExpenseBreakdownModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <!-- Budget Row -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                        <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 1rem; border-radius: 8px;">
                            <div style="font-size: 0.875rem; color: #166534; font-weight: 600; margin-bottom: 0.5rem;">Project Budget</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: #166534;">₱${formatCurrency(budget)}</div>
                        </div>
                        <div style="background: ${remaining >= 0 ? '#f0fdf4' : '#fef2f2'}; border-left: 4px solid ${remaining >= 0 ? '#22c55e' : '#ef4444'}; padding: 1rem; border-radius: 8px;">
                            <div style="font-size: 0.875rem; color: ${remaining >= 0 ? '#166534' : '#991b1b'}; font-weight: 600; margin-bottom: 0.5rem;">Remaining Budget</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: ${remaining >= 0 ? '#166534' : '#991b1b'};">
                                ${remaining < 0 ? '⚠️ ' : ''}₱${formatCurrency(Math.abs(remaining))}${remaining < 0 ? ' over' : ''}
                            </div>
                        </div>
                    </div>

                    <!-- Category Scorecards -->
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                        <div style="padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                            <div style="font-size: 0.875rem; color: #64748b; font-weight: 600; margin-bottom: 0.5rem;">Material Purchases</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: #1e293b;">₱${formatCurrency(materialsDisplay)}</div>
                            <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">${materialCount} POs</div>
                        </div>
                        <div style="padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                            <div style="font-size: 0.875rem; color: #64748b; font-weight: 600; margin-bottom: 0.5rem;">Transport Fees</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: #1e293b;">₱${formatCurrency(transportDisplay)}</div>
                            <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">${transportRequests.length} TRs</div>
                        </div>
                        <div style="padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                            <div style="font-size: 0.875rem; color: #64748b; font-weight: 600; margin-bottom: 0.5rem;">Subcon Cost</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: #1e293b;">₱${formatCurrency(subconTotal)}</div>
                            <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">${subconCount} POs</div>
                        </div>
                    </div>

                    <!-- Total Cost -->
                    <div style="background: #eff6ff; border: 2px solid #3b82f6; padding: 1rem; border-radius: 8px; margin-bottom: 2rem;">
                        <div style="font-size: 0.875rem; color: #1e40af; font-weight: 600; margin-bottom: 0.5rem;">Total Project Cost</div>
                        <div style="font-size: 2rem; font-weight: 700; color: #1e40af;">₱${formatCurrency(totalCost)}</div>
                        <div style="font-size: 0.75rem; color: #1e40af; margin-top: 0.25rem;">${materialCount + transportRequests.length + subconCount} documents</div>
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
        toggle.textContent = '▼';
    } else {
        items.style.display = 'none';
        toggle.textContent = '▶';
    }
};

console.log('Expense modal module loaded successfully');
