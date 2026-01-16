/* ========================================
   FINANCE VIEW - Complete Implementation
   PR/TR Approval, PO Generation, Historical Data
   ======================================== */

import { db, collection, query, where, onSnapshot, getDocs, getDoc, doc, updateDoc, addDoc } from '../firebase.js';
import { showToast, showLoading, formatCurrency, formatDate } from '../utils.js';

// View state
let listeners = [];
let materialPRs = [];
let transportRequests = [];
let poData = [];
let currentPRForApproval = null;
let currentPRForRejection = null;

/**
 * Render the finance view
 * @param {string} activeTab - Active tab (approvals, pos, history, projects)
 * @returns {string} HTML string for finance view
 */
export function render(activeTab = 'approvals') {
    return `
        <div style="background: linear-gradient(135deg, #34a853 0%, #1e8e3e 100%); color: white; padding: 1.5rem 2rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="max-width: 1600px; margin: 0 auto;">
                <h1 style="font-size: 1.5rem; font-weight: 500; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                    💰 Finance Dashboard
                </h1>
                <p style="font-size: 0.875rem; opacity: 0.9; margin: 0;">CLMC Engineering</p>
            </div>
        </div>

        <!-- Tab Navigation -->
        <div style="background: white; border-bottom: 2px solid var(--gray-200);">
            <div style="max-width: 1600px; margin: 0 auto; padding: 0 2rem;">
                <div class="tabs-nav">
                    <a href="#/finance/approvals" class="tab-btn ${activeTab === 'approvals' ? 'active' : ''}">
                        📋 Pending Approvals
                    </a>
                    <a href="#/finance/pos" class="tab-btn ${activeTab === 'pos' ? 'active' : ''}">
                        📄 Purchase Orders
                    </a>
                    <a href="#/finance/history" class="tab-btn ${activeTab === 'history' ? 'active' : ''}">
                        📊 Historical Data
                    </a>
                </div>
            </div>
        </div>

        <div class="container" style="max-width: 1600px; margin: 0 auto; padding: 1.5rem;">
            <!-- Tab 1: Pending Approvals -->
            <section id="approvals-section" class="section ${activeTab === 'approvals' ? 'active' : ''}">
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
                        <button class="btn btn-secondary" onclick="window.refreshPRs()">🔄 Refresh</button>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>PR ID</th>
                                <th>MRF ID</th>
                                <th>Project</th>
                                <th>Date</th>
                                <th>Urgency</th>
                                <th>Total Cost</th>
                                <th>Supplier</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="materialPRsBody">
                            <tr>
                                <td colspan="9" style="text-align: center; padding: 2rem;">Loading material PRs...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div style="margin: 2rem 0;"></div>

                <!-- Transport Requests -->
                <div class="card">
                    <div class="card-header">
                        <h2>🚚 Transport Requests</h2>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>TR ID</th>
                                <th>MRF ID</th>
                                <th>Project</th>
                                <th>Date</th>
                                <th>Urgency</th>
                                <th>Total Cost</th>
                                <th>Service Type</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="transportRequestsBody">
                            <tr>
                                <td colspan="9" style="text-align: center; padding: 2rem;">Loading transport requests...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Tab 2: Purchase Orders -->
            <section id="pos-section" class="section ${activeTab === 'pos' ? 'active' : ''}">
                <div class="card">
                    <div class="card-header">
                        <h2>Recently Generated Purchase Orders</h2>
                        <button class="btn btn-secondary" onclick="window.refreshPOs()">🔄 Refresh</button>
                    </div>
                    <div id="poList">
                        <div style="text-align: center; padding: 2rem;">Loading purchase orders...</div>
                    </div>
                </div>
            </section>

            <!-- Tab 3: Historical Data -->
            <section id="history-section" class="section ${activeTab === 'history' ? 'active' : ''}">
                <div class="card">
                    <div class="card-header">
                        <h2>Historical Data & Analytics</h2>
                    </div>
                    <div style="text-align: center; padding: 3rem; color: #666;">
                        <div style="font-size: 3rem; margin-bottom: 1rem;">📊</div>
                        <h3>Historical Data & Analytics</h3>
                        <p>View supplier performance, price trends, and procurement analytics.</p>
                        <p style="color: var(--gray-700); margin-top: 1rem;">
                            <em>Coming soon - Analytics dashboard with charts and insights</em>
                        </p>
                    </div>
                </div>
            </section>
        </div>

        <!-- PR Details Modal -->
        <div id="prModal" class="modal">
            <div class="modal-content" style="max-width: 800px;">
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
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Reject Request</h2>
                    <button class="modal-close" onclick="window.closeRejectionModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 1rem;">Please provide a reason for rejection:</p>
                    <textarea id="rejectionReason" rows="4" style="width: 100%; padding: 0.5rem; border: 1px solid var(--gray-300); border-radius: 4px; font-family: inherit;"></textarea>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="window.closeRejectionModal()">Cancel</button>
                    <button class="btn btn-danger" onclick="window.submitRejection()">Submit Rejection</button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Initialize the finance view
 * @param {string} activeTab - Active tab to display
 */
export async function init(activeTab = 'approvals') {
    console.log('Initializing finance view, tab:', activeTab);

    try {
        await loadPRs();
        await loadPOs();

        console.log('Finance view initialized successfully');
    } catch (error) {
        console.error('Error initializing finance view:', error);
        showToast('Error loading finance data', 'error');
    }
}

/**
 * Cleanup when leaving the view
 */
export async function destroy() {
    console.log('Destroying finance view...');

    // Unsubscribe from all listeners
    listeners.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });
    listeners = [];

    // Clear state
    materialPRs = [];
    transportRequests = [];
    poData = [];
    currentPRForApproval = null;
    currentPRForRejection = null;

    // Clean up window functions
    delete window.refreshPRs;
    delete window.viewPRDetails;
    delete window.viewTRDetails;
    delete window.approvePR;
    delete window.approveTR;
    delete window.rejectPR;
    delete window.closePRModal;
    delete window.closeRejectionModal;
    delete window.submitRejection;
    delete window.refreshPOs;

    console.log('Finance view destroyed');
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
        console.log('📊 Finance: Loaded Material PRs from Firebase:', snapshot.size);
        materialPRs = [];

        snapshot.forEach((docSnap) => {
            const pr = { id: docSnap.id, ...docSnap.data() };
            // Only include non-transport PRs
            if (!pr.pr_id?.startsWith('TR-') && pr.request_type !== 'service') {
                console.log('  Material PR:', pr.pr_id, 'Status:', pr.finance_status);
                materialPRs.push(pr);
            }
        });

        console.log('📦 Material PRs:', materialPRs.length);
        renderMaterialPRs();
        updateStats();
    });
    listeners.push(prListener);

    // Load Transport Requests from transport_requests collection
    const trsRef = collection(db, 'transport_requests');
    const trQuery = query(trsRef, where('finance_status', '==', 'Pending'));

    const trListener = onSnapshot(trQuery, (snapshot) => {
        console.log('📊 Finance: Loaded Transport Requests from Firebase:', snapshot.size);
        transportRequests = [];

        snapshot.forEach((docSnap) => {
            const tr = { id: docSnap.id, ...docSnap.data() };
            console.log('  Transport:', tr.tr_id, 'Status:', tr.finance_status, 'Cost:', tr.total_amount);
            transportRequests.push(tr);
        });

        console.log('🚚 Transport Requests:', transportRequests.length);
        renderTransportRequests();
        updateStats();
    });
    listeners.push(trListener);
}

/**
 * Render Material PRs table
 */
function renderMaterialPRs() {
    const tbody = document.getElementById('materialPRsBody');

    if (materialPRs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 2rem; color: #666;">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">✓</div>
                    <div>No pending material PRs</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = materialPRs.map(pr => {
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
                <td>${pr.project_name}</td>
                <td>${formatDate(pr.date_generated)}</td>
                <td><span style="background: ${colors.bg}; color: ${colors.color}; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">${urgencyLevel}</span></td>
                <td><strong>₱${formatCurrency(pr.total_amount || 0)}</strong></td>
                <td>${supplier}</td>
                <td><span style="background: #fef3c7; color: #f59e0b; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">Pending</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.viewPRDetails('${pr.id}')">Review</button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Render Transport Requests table
 */
function renderTransportRequests() {
    const tbody = document.getElementById('transportRequestsBody');

    if (transportRequests.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 2rem; color: #666;">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">✓</div>
                    <div>No pending transport requests</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = transportRequests.map(tr => {
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
                <td>${tr.project_name}</td>
                <td>${formatDate(tr.date_submitted)}</td>
                <td><span style="background: ${colors.bg}; color: ${colors.color}; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">${urgencyLevel}</span></td>
                <td><strong>₱${formatCurrency(tr.total_amount || 0)}</strong></td>
                <td>${serviceType}</td>
                <td><span style="background: #fef3c7; color: #f59e0b; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">Pending</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.viewTRDetails('${tr.id}')">Review</button>
                </td>
            </tr>
        `;
    }).join('');
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

    // Get approved count for this month (would need query for actual count)
    document.getElementById('approvedCount').textContent = '0';
}

/**
 * Refresh PRs manually
 */
window.refreshPRs = async function() {
    await loadPRs();
    showToast('PR list refreshed', 'success');
};

// ========================================
// PR/TR DETAILS & APPROVAL
// ========================================

/**
 * View PR Details
 */
window.viewPRDetails = async function(prId) {
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
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">PR ID:</div>
                    <div><strong>${pr.pr_id}</strong></div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">MRF Reference:</div>
                    <div>${pr.mrf_id}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Project:</div>
                    <div>${pr.project_name}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Requestor:</div>
                    <div>${pr.requestor_name}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Urgency Level:</div>
                    <div><span style="background: ${colors.bg}; color: ${colors.color}; padding: 0.25rem 0.75rem; border-radius: 4px; font-weight: 600;">${urgencyLevel}</span></div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Date Generated:</div>
                    <div>${formatDate(pr.date_generated)}</div>
                </div>
                <div style="grid-column: 1 / -1;">
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Delivery Address:</div>
                    <div>${pr.delivery_address || 'N/A'}</div>
                </div>
                <div style="grid-column: 1 / -1;">
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Total Amount:</div>
                    <div><strong style="color: #34a853; font-size: 1.25rem;">₱${formatCurrency(pr.total_amount || 0)}</strong></div>
                </div>
            </div>

            <div style="margin: 1.5rem 0; padding: 1.5rem; background: #f8f9fa; border-radius: 8px;">
                <h4 style="margin-bottom: 1rem;">Items Breakdown</h4>
                <table style="width: 100%; font-size: 0.875rem;">
                    <thead>
                        <tr style="background: white;">
                            <th style="padding: 0.5rem;">Item</th>
                            <th style="padding: 0.5rem;">Category</th>
                            <th style="padding: 0.5rem;">Qty</th>
                            <th style="padding: 0.5rem;">Unit Cost</th>
                            <th style="padding: 0.5rem;">Supplier</th>
                            <th style="padding: 0.5rem;">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr style="background: white;">
                                <td style="padding: 0.5rem;">${item.item || item.item_name}</td>
                                <td style="padding: 0.5rem;">${item.category || 'N/A'}</td>
                                <td style="padding: 0.5rem;">${item.qty || item.quantity} ${item.unit}</td>
                                <td style="padding: 0.5rem;">₱${formatCurrency(item.unit_cost || 0)}</td>
                                <td style="padding: 0.5rem;">${item.supplier || 'N/A'}</td>
                                <td style="padding: 0.5rem;"><strong>₱${formatCurrency(item.subtotal || 0)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="background: white; font-weight: 600;">
                            <td colspan="5" style="padding: 0.75rem; text-align: right; border-top: 2px solid #dee2e6;">TOTAL:</td>
                            <td style="padding: 0.75rem; border-top: 2px solid #dee2e6;">₱${formatCurrency(pr.total_amount || 0)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;

        document.getElementById('prModalTitle').textContent = `Purchase Request - ${pr.pr_id}`;
        document.getElementById('prModalBody').innerHTML = modalContent;

        const footer = document.getElementById('prModalFooter');
        footer.innerHTML = `
            <button class="btn btn-secondary" onclick="window.closePRModal()">Close</button>
            <button class="btn btn-danger" onclick="window.rejectPR('${pr.id}')">✗ Reject</button>
            <button class="btn btn-success" onclick="window.approvePR('${pr.id}')">✓ Approve & Generate POs</button>
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
window.viewTRDetails = async function(trId) {
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
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">TR ID:</div>
                    <div><strong>${tr.tr_id}</strong></div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">MRF Reference:</div>
                    <div>${tr.mrf_id}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Project:</div>
                    <div>${tr.project_name}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Requestor:</div>
                    <div>${tr.requestor_name}</div>
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
                    <div>${tr.delivery_address || 'N/A'}</div>
                </div>
                <div style="grid-column: 1 / -1;">
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Total Cost:</div>
                    <div><strong style="color: #34a853; font-size: 1.25rem;">₱${formatCurrency(tr.total_amount || 0)}</strong></div>
                </div>
            </div>

            <div style="margin: 1.5rem 0; padding: 1.5rem; background: #f8f9fa; border-radius: 8px;">
                <h4 style="margin-bottom: 1rem;">Service Items</h4>
                <table style="width: 100%; font-size: 0.875rem;">
                    <thead>
                        <tr style="background: white;">
                            <th style="padding: 0.5rem;">Service</th>
                            <th style="padding: 0.5rem;">Category</th>
                            <th style="padding: 0.5rem;">Qty</th>
                            <th style="padding: 0.5rem;">Unit Cost</th>
                            <th style="padding: 0.5rem;">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr style="background: white;">
                                <td style="padding: 0.5rem;">${item.item || item.item_name}</td>
                                <td style="padding: 0.5rem;">${item.category || 'N/A'}</td>
                                <td style="padding: 0.5rem;">${item.qty || item.quantity} ${item.unit}</td>
                                <td style="padding: 0.5rem;">₱${formatCurrency(item.unit_cost || 0)}</td>
                                <td style="padding: 0.5rem;"><strong>₱${formatCurrency(item.subtotal || 0)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="background: white; font-weight: 600;">
                            <td colspan="4" style="padding: 0.75rem; text-align: right; border-top: 2px solid #dee2e6;">TOTAL:</td>
                            <td style="padding: 0.75rem; border-top: 2px solid #dee2e6;">₱${formatCurrency(tr.total_amount || 0)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;

        document.getElementById('prModalTitle').textContent = `Transport Request - ${tr.tr_id}`;
        document.getElementById('prModalBody').innerHTML = modalContent;

        const footer = document.getElementById('prModalFooter');
        footer.innerHTML = `
            <button class="btn btn-secondary" onclick="window.closePRModal()">Close</button>
            <button class="btn btn-danger" onclick="window.rejectPR('${tr.id}')">✗ Reject</button>
            <button class="btn btn-success" onclick="window.approveTR('${tr.id}')">✓ Approve</button>
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
 * Approve PR and generate POs
 */
window.approvePR = async function(prId) {
    if (!confirm('Approve this Purchase Request and generate Purchase Orders?')) {
        return;
    }

    const pr = currentPRForApproval;
    if (!pr || pr.id !== prId) {
        showToast('PR reference lost. Please refresh and try again.', 'error');
        return;
    }

    window.closePRModal();
    showLoading(true);

    try {
        // Update PR status
        const prRef = doc(db, 'prs', pr.id);
        await updateDoc(prRef, {
            finance_status: 'Approved',
            finance_approver: 'Ma. Thea Angela R. Lacsamana',
            date_approved: new Date().toISOString().split('T')[0],
            approved_at: new Date().toISOString()
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

        // Generate POs
        const poCount = await generatePOsForPR(pr);

        showToast(`✓ PR approved successfully! Generated ${poCount} PO(s).`, 'success');

        // Switch to PO tab
        setTimeout(() => {
            window.location.hash = '#/finance/pos';
        }, 1500);

    } catch (error) {
        console.error('Error approving PR:', error);
        showToast('Failed to approve PR', 'error');
    } finally {
        showLoading(false);
        currentPRForApproval = null;
    }
};

/**
 * Approve TR (Transport Request)
 */
window.approveTR = async function(trId) {
    if (!confirm('Approve this Transport Request?')) {
        return;
    }

    const tr = currentPRForApproval;
    if (!tr || tr.id !== trId) {
        showToast('TR reference lost. Please refresh and try again.', 'error');
        return;
    }

    window.closePRModal();
    showLoading(true);

    try {
        // Update TR status
        const trRef = doc(db, 'transport_requests', tr.id);
        await updateDoc(trRef, {
            finance_status: 'Approved',
            finance_approver: 'Ma. Thea Angela R. Lacsamana',
            date_approved: new Date().toISOString().split('T')[0],
            approved_at: new Date().toISOString()
        });

        // Update MRF status
        const mrfsRef = collection(db, 'mrfs');
        const mrfQuery = query(mrfsRef, where('mrf_id', '==', tr.mrf_id));
        const mrfSnapshot = await getDocs(mrfQuery);

        if (!mrfSnapshot.empty) {
            const mrfDoc = mrfSnapshot.docs[0];
            await updateDoc(doc(db, 'mrfs', mrfDoc.id), {
                status: 'Finance Approved',
                updated_at: new Date().toISOString()
            });
        }

        showToast('✓ Transport Request approved successfully!', 'success');

    } catch (error) {
        console.error('Error approving TR:', error);
        showToast('Failed to approve TR', 'error');
    } finally {
        showLoading(false);
        currentPRForApproval = null;
    }
};

/**
 * Close PR Modal
 */
window.closePRModal = function() {
    document.getElementById('prModal').classList.remove('active');
};

// ========================================
// REJECTION WORKFLOW
// ========================================

/**
 * Reject PR/TR
 */
window.rejectPR = function(prId) {
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
window.closeRejectionModal = function() {
    document.getElementById('rejectionModal').classList.remove('active');
};

/**
 * Submit Rejection
 */
window.submitRejection = async function() {
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

        if (isTransport) {
            // Reject TR
            const trRef = doc(db, 'transport_requests', request.id);
            await updateDoc(trRef, {
                finance_status: 'Rejected',
                rejection_reason: reason,
                rejected_at: new Date().toISOString(),
                rejected_by: 'Ma. Thea Angela R. Lacsamana'
            });

            // Update MRF
            const mrfsRef = collection(db, 'mrfs');
            const mrfQuery = query(mrfsRef, where('mrf_id', '==', request.mrf_id));
            const mrfSnapshot = await getDocs(mrfQuery);

            if (!mrfSnapshot.empty) {
                const mrfDoc = mrfSnapshot.docs[0];
                await updateDoc(doc(db, 'mrfs', mrfDoc.id), {
                    status: 'TR Rejected',
                    rejection_reason: reason,
                    updated_at: new Date().toISOString()
                });
            }

            showToast('Transport Request rejected', 'success');
        } else {
            // Reject PR
            const prRef = doc(db, 'prs', request.id);
            await updateDoc(prRef, {
                finance_status: 'Rejected',
                rejection_reason: reason,
                rejected_at: new Date().toISOString(),
                rejected_by: 'Ma. Thea Angela R. Lacsamana'
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
                    rejection_reason: reason,
                    is_rejected: true,
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
};

// ========================================
// PO GENERATION
// ========================================

/**
 * Generate POs from approved PR
 * Returns number of POs created
 */
async function generatePOsForPR(pr) {
    console.log('🔄 Generating POs for PR:', pr.pr_id);

    try {
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
        console.log('📦 Creating POs for', suppliers.length, 'supplier(s)');

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

        // Create PO for each supplier
        for (const supplier of suppliers) {
            const supplierItems = itemsBySupplier[supplier];
            const supplierTotal = supplierItems.reduce((sum, item) => sum + parseFloat(item.subtotal || 0), 0);

            const firstWord = supplier.split(/\s+/)[0] || supplier;
            const supplierSlug = firstWord.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toUpperCase();
            const poId = `PO_${year}_${month}-${String(nextPONum).padStart(3, '0')}-${supplierSlug}`;

            await addDoc(collection(db, 'pos'), {
                po_id: poId,
                pr_id: pr.pr_id,
                mrf_id: pr.mrf_id,
                supplier_name: supplier,
                project_name: pr.project_name,
                requestor_name: pr.requestor_name,
                delivery_address: pr.delivery_address || '',
                items_json: JSON.stringify(supplierItems),
                total_amount: supplierTotal,
                procurement_status: 'Pending Procurement',
                date_issued: new Date().toISOString().split('T')[0],
                created_at: new Date().toISOString(),
                is_subcon: false
            });

            console.log('✅ Created PO:', poId);
            nextPONum++;
            poCount++;
        }

        console.log('✅ Generated', poCount, 'PO(s) for PR:', pr.pr_id);
        return poCount;

    } catch (error) {
        console.error('Error generating POs:', error);
        throw error;
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
        console.log('📊 Finance: Loaded POs from Firebase:', snapshot.size);
        poData = [];

        snapshot.forEach((docSnap) => {
            poData.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Sort by date (newest first)
        poData.sort((a, b) => new Date(b.date_issued) - new Date(a.date_issued));

        console.log('📄 POs loaded:', poData.length);
        renderPOs();
    });

    listeners.push(poListener);
}

/**
 * Render POs list
 */
function renderPOs() {
    const container = document.getElementById('poList');

    if (poData.length === 0) {
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
    const recentPOs = poData.slice(0, 20);

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>PO ID</th>
                    <th>PR ID</th>
                    <th>Supplier</th>
                    <th>Project</th>
                    <th>Amount</th>
                    <th>Date Issued</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${recentPOs.map(po => `
                    <tr>
                        <td><strong>${po.po_id}</strong></td>
                        <td>${po.pr_id}</td>
                        <td>${po.supplier_name}</td>
                        <td>${po.project_name}</td>
                        <td><strong>₱${formatCurrency(po.total_amount || 0)}</strong></td>
                        <td>${formatDate(po.date_issued)}</td>
                        <td><span style="background: #fef3c7; color: #f59e0b; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">${po.procurement_status || 'Pending'}</span></td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="window.location.hash='#/procurement/tracking'">View in Procurement</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${poData.length > 20 ? `<p style="text-align: center; margin-top: 1rem; color: #666;">Showing 20 most recent POs. View all in Procurement > PO Tracking</p>` : ''}
    `;
}

/**
 * Refresh POs manually
 */
window.refreshPOs = async function() {
    await loadPOs();
    showToast('PO list refreshed', 'success');
};

console.log('Finance view module loaded successfully');
