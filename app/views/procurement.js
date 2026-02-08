/* ========================================
   PROCUREMENT VIEW - Complete Migration
   Manages MRFs, Suppliers, PO Tracking, and Historical Data
   Migrated from archive/index.html
   ======================================== */

import { db, collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, orderBy, limit, getAggregateFromServer, sum, count, serverTimestamp } from '../firebase.js';
import { formatCurrency, formatDate, showLoading, showToast, generateSequentialId } from '../utils.js';
import { createStatusBadge, createModal, openModal, closeModal, createTimeline } from '../components.js';

// ========================================
// GLOBAL STATE
// ========================================

let currentMRF = null;
let suppliersData = [];
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

// Firebase listeners for cleanup
let listeners = [];

// ========================================
// WINDOW FUNCTIONS ATTACHMENT
// ========================================

/**
 * Attach all window functions for use in onclick handlers
 * This needs to be called every time init() runs to ensure
 * functions are available after tab navigation
 */
function attachWindowFunctions() {
    console.log('[Procurement] Attaching window functions...');
    // MRF Management Functions
    window.loadMRFs = loadMRFs;
    window.createNewMRF = createNewMRF;
    window.selectMRF = selectMRF;
    window.saveProgress = saveProgress;
    window.saveNewMRF = saveNewMRF;
    window.deleteMRF = deleteMRF;
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

    // MRF Records Functions
    window.loadPRPORecords = loadPRPORecords;
    window.filterPRPORecords = filterPRPORecords;
    window.goToPRPOPage = goToPRPOPage;
    window.viewPRDetails = viewPRDetails;
    window.viewPODetails = viewPODetails;
    window.viewPOTimeline = viewPOTimeline;
    window.updatePOStatus = updatePOStatus;
    window.showProcurementTimeline = showProcurementTimeline;
    window.closeTimelineModal = closeTimelineModal;
    window.showSupplierPurchaseHistory = showSupplierPurchaseHistory;
    window.closeSupplierHistoryModal = closeSupplierHistoryModal;

    // Document Generation Functions
    window.generatePRDocument = generatePRDocument;
    window.generatePODocument = generatePODocument;
    window.promptPODocument = promptPODocument;
    window.generatePOWithFields = generatePOWithFields;
    window.viewPODocument = viewPODocument;
    window.downloadPODocument = downloadPODocument;
    window.generateAllPODocuments = generateAllPODocuments;
    console.log('[Procurement] ✅ All window functions attached successfully');
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
            <div style="max-width: 1400px; margin: 0 auto; padding: 0 2rem;">
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

        <div class="container" style="margin-top: 2rem;">
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

                    <!-- Suppliers Table -->
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
                            <tr>
                                <td colspan="5" style="text-align: center; padding: 2rem;">
                                    Loading suppliers...
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <div id="suppliersPagination"></div>
                </div>
            </section>

            <!-- PR-PO Records Section -->
            <section id="records-section" class="section ${activeTab === 'records' ? 'active' : ''}">
                ${!showEditControls ? '<div class="view-only-notice"><span class="notice-icon">👁️</span> <span>View-only mode: You can view records but cannot update PO statuses.</span></div>' : ''}
                <div class="card">
                    <div class="card-header">
                        <h2>MRF Records</h2>
                        <button class="btn btn-primary" onclick="window.loadPRPORecords()">🔄 Refresh</button>
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
                                    <option value="PR Generated">PR Generated</option>
                                    <option value="TR Submitted">TR Submitted</option>
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
    console.log('[Procurement] 🔵 Initializing procurement view, tab:', activeTab);

    // Re-attach all window functions (needed after tab navigation)
    attachWindowFunctions();

    // Phase 7: Re-filter MRF list when assignments change
    // Guard: only register once (init() is called on every tab switch without destroy)
    if (!window._procurementAssignmentHandler) {
        const assignmentChangeHandler = () => {
            console.log('[Procurement] Assignments changed, re-filtering MRF list...');
            reFilterAndRenderMRFs();
        };
        window.addEventListener('assignmentsChanged', assignmentChangeHandler);
        window._procurementAssignmentHandler = assignmentChangeHandler;
    }

    console.log('[Procurement] Testing window.loadMRFs availability:', typeof window.loadMRFs);

    try {
        // Load all data
        await loadProjects();
        await loadSuppliers();
        await loadMRFs();

        // Load PR-PO records if on records tab
        if (activeTab === 'records') {
            await loadPRPORecords();
        }

        console.log('[Procurement] ✅ Procurement view initialized successfully');
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
    console.log('[Procurement] Loading supplier purchase history for:', supplierName);
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

        console.log('[Procurement] Supplier totals:', { totalPurchases, orderCount });

        // Load PO details for table
        const posSnapshot = await getDocs(q);
        const pos = [];
        posSnapshot.forEach(doc => pos.push({ id: doc.id, ...doc.data() }));

        console.log('[Procurement] Loaded', pos.length, 'POs for supplier');

        // Render modal content
        const modalContent = `
            <div class="modal-details-grid">
                <div class="modal-detail-item">
                    <div class="modal-detail-label">Supplier:</div>
                    <div class="modal-detail-value"><strong>${supplierName}</strong></div>
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
                            <td><strong>${po.po_id}</strong></td>
                            <td>${po.project_code ? po.project_code + ' - ' : ''}${po.project_name || 'N/A'}</td>
                            <td>${formatDate(po.date_issued)}</td>
                            <td><strong>₱${formatCurrency(po.total_amount)}</strong></td>
                            <td><span style="background: #fef3c7; color: #f59e0b; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">${po.procurement_status}</span></td>
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
    console.log('[Procurement] 🔴 Destroying procurement view...');

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

    // Clear global state
    currentMRF = null;
    suppliersData = [];
    projectsData = [];
    poData = [];
    allPRPORecords = [];
    filteredPRPORecords = [];

    // Clean up window functions
    delete window.loadMRFs;
    delete window.createNewMRF;
    delete window.selectMRF;
    delete window.saveProgress;
    delete window.saveNewMRF;
    delete window.deleteMRF;
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
    delete window.loadPRPORecords;
    delete window.filterPRPORecords;
    delete window.goToPRPOPage;
    delete window.viewPRDetails;
    delete window.viewPODetails;
    delete window.viewPOTimeline;
    delete window.updatePOStatus;
    delete window.generatePRDocument;
    delete window.generatePODocument;
    delete window.promptPODocument;
    delete window.generatePOWithFields;
    delete window.viewPODocument;
    delete window.downloadPODocument;
    delete window.generateAllPODocuments;

    console.log('[Procurement] 🗑️ All window functions deleted');
    console.log('[Procurement] ✅ Procurement view destroyed');
}

// ========================================
// PROJECTS MANAGEMENT
// ========================================

/**
 * Load active projects from Firebase
 */
async function loadProjects() {
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

            // Sort by created_at descending (most recent first)
            projectsData.sort((a, b) => {
                const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                return bTime - aTime; // Most recent first
            });

            console.log('Projects loaded:', projectsData.length);
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
    console.log('🔍 Setting up MRF listener...');
    const mrfsRef = collection(db, 'mrfs');
    const statuses = ['Pending', 'In Progress', 'PR Rejected', 'Finance Rejected'];
    console.log('  Querying statuses:', statuses);
    const q = query(mrfsRef, where('status', 'in', statuses));

    const listener = onSnapshot(q, (snapshot) => {
        console.log('🔔 MRF snapshot received, documents:', snapshot.size);
        const allMRFs = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            console.log('  ', doc.id, '- Status:', data.status, '- Type:', data.request_type, '- MRF ID:', data.mrf_id);
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

        console.log('  Rendering - Material:', materialMRFs.length, 'Transport:', transportMRFs.length);
        renderMRFList(materialMRFs, transportMRFs);
    }, (error) => {
        console.error('  MRF listener error:', error);
        showToast('Error loading MRFs: ' + error.message, 'error');
    });

    listeners.push(listener);
};

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

    console.log('[Procurement] Re-filtered - Material:', materialMRFs.length, 'Transport:', transportMRFs.length);
    renderMRFList(materialMRFs, transportMRFs);
}

/**
 * Render MRF list
 */
function renderMRFList(materialMRFs, transportMRFs) {
    console.log('🎨 Rendering MRF list...');
    console.log('  Material MRFs to render:', materialMRFs.length);
    console.log('  Transport MRFs to render:', transportMRFs.length);

    const mrfList = document.getElementById('mrfList');
    if (!mrfList) {
        console.error('❌ mrfList element not found!');
        return;
    }

    let html = '';

    // Material Requests Section
    html += '<div style="font-weight: 600; padding: 0.5rem; background: #f8f9fa; border-radius: 4px; margin-bottom: 0.5rem;">Material Requests</div>';

    if (materialMRFs.length === 0) {
        html += '<div style="text-align: center; padding: 1rem; color: #999; font-size: 0.875rem;">No pending material requests</div>';
    } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        html += materialMRFs.map(mrf => {
        const dateNeeded = new Date(mrf.date_needed);
        dateNeeded.setHours(0, 0, 0, 0);
        const daysRemaining = Math.ceil((dateNeeded - today) / (1000 * 60 * 60 * 24));

        // Check if rejected
        const isRejected = mrf.status === 'PR Rejected';
        const rejectionStyle = isRejected ? 'border: 4px solid #dc2626; background: #fee2e2;' : '';

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
                 style="${rejectionStyle} border-left: 4px solid ${urgencyLevelColor};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                    <span style="font-weight: 600;">
                        ${mrf.mrf_id}
                        ${isRejected ? '<span style="color: #dc2626; font-size: 0.75rem; margin-left: 0.5rem;">PR REJECTED</span>' : ''}
                    </span>
                    <span style="background: ${urgencyLevelBg}; color: ${urgencyLevelColor}; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">
                        ${mrf.urgency_level || 'Low'}
                    </span>
                </div>
                <div style="font-size: 0.875rem; color: #5f6368;">${mrf.project_code ? mrf.project_code + ' - ' : ''}${mrf.project_name || 'No project'}</div>
                ${isRejected ? `
                    <div style="margin-top: 0.5rem; padding: 0.5rem; background: white; border-radius: 4px; font-size: 0.75rem; color: #dc2626;">
                        <strong>Reason:</strong> ${mrf.pr_rejection_reason || 'No reason provided'}
                    </div>
                ` : ''}
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

    // Transport Requests Section
    html += '<div style="font-weight: 600; padding: 0.5rem; background: #fef3c7; border-radius: 4px; margin: 1rem 0 0.5rem 0;">Pending Transportation Requests</div>';

    if (transportMRFs.length === 0) {
        html += '<div style="text-align: center; padding: 1rem; color: #999; font-size: 0.875rem;">No pending transport requests</div>';
    } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        html += transportMRFs.map(mrf => {
            const dateNeeded = new Date(mrf.date_needed);
            dateNeeded.setHours(0, 0, 0, 0);
            const daysRemaining = Math.ceil((dateNeeded - today) / (1000 * 60 * 60 * 24));

            const isRejected = mrf.status === 'PR Rejected';
            const rejectionStyle = isRejected ? 'border: 4px solid #dc2626; background: #fee2e2;' : '';

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
                     style="${rejectionStyle} border-left: 4px solid ${urgencyLevelColor};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                        <span style="font-weight: 600;">
                            ${mrf.mrf_id}
                            ${isRejected ? '<span style="color: #dc2626; font-size: 0.75rem; margin-left: 0.5rem;">PR REJECTED</span>' : ''}
                        </span>
                        <span style="background: ${urgencyLevelBg}; color: ${urgencyLevelColor}; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">
                            ${mrf.urgency_level || 'Low'}
                        </span>
                    </div>
                    <div style="font-size: 0.875rem; color: #5f6368;">${mrf.project_code ? mrf.project_code + ' - ' : ''}${mrf.project_name || 'No project'}</div>
                    ${isRejected ? `
                        <div style="margin-top: 0.5rem; padding: 0.5rem; background: white; border-radius: 4px; font-size: 0.75rem; color: #dc2626;">
                            <strong>Reason:</strong> ${mrf.pr_rejection_reason || 'No reason provided'}
                        </div>
                    ` : ''}
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

    console.log('✅ Setting innerHTML, total length:', html.length, 'chars');
    mrfList.innerHTML = html;
    console.log('✅ MRF list rendered successfully');

    // Clear MRF details if no pending MRFs
    if (materialMRFs.length === 0 && transportMRFs.length === 0) {
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
        requestor_name: '',
        date_needed: '',
        delivery_address: '',
        items_json: JSON.stringify([{item: '', qty: 1, unit: '', category: '', unit_cost: 0, supplier: ''}]),
        status: 'Pending'
    };

    renderMRFDetails(currentMRF, true); // true indicates this is a new MRF
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
            // Add delete button for procurement to remove unnecessary requests
            buttons += ' <button class="btn btn-danger" onclick="window.deleteMRF()" style="margin-left: 0.5rem;">🗑️ Delete MRF</button>';
            mrfActionsEl.innerHTML = buttons;
        }
    }

    const requestTypeLabel = mrf.request_type === 'service' ?
        'Delivery/Hauling/Transportation' : 'Material Request';

    // Build project options for dropdown
    const projectOptions = projectsData.map(p =>
        `<option value="${p.project_code}" data-project-name="${p.project_name}" ${p.project_code === mrf.project_code ? 'selected' : (!mrf.project_code && p.project_name === mrf.project_name ? 'selected' : '')}>${p.project_code ? p.project_code + ' - ' : ''}${p.project_name}</option>`
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
                ` : `<div style="font-weight: 600;">${requestTypeLabel}</div>`}
            </div>
            <div>
                <div style="font-size: 0.75rem; color: #5f6368;">Project *</div>
                ${isNew ? `
                    <select id="projectName" required style="width: 100%; padding: 0.5rem; border: 2px solid #dadce0; border-radius: 4px; background-color: #ffffff; font-family: inherit; transition: all 0.2s;" onfocus="this.style.borderColor='#1a73e8'; this.style.backgroundColor='#f8fbff';" onblur="this.style.borderColor='#dadce0'; this.style.backgroundColor='#ffffff';">
                        <option value="">-- Select a project --</option>
                        ${projectOptions}
                    </select>
                ` : `<div style="font-weight: 600;">${mrf.project_code ? mrf.project_code + ' - ' : ''}${mrf.project_name || 'No project'}</div>`}
            </div>
            <div>
                <div style="font-size: 0.75rem; color: #5f6368;">Requestor *</div>
                ${isNew ? `
                    <input type="text" id="requestorName" value="${mrf.requestor_name || ''}" required style="width: 100%; padding: 0.5rem; border: 2px solid #dadce0; border-radius: 4px; background-color: #ffffff; font-family: inherit; transition: all 0.2s;" onfocus="this.style.borderColor='#1a73e8'; this.style.backgroundColor='#f8fbff';" onblur="this.style.borderColor='#dadce0'; this.style.backgroundColor='#ffffff';" placeholder="Enter requestor name">
                ` : `<div>${mrf.requestor_name}</div>`}
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
            <textarea id="deliveryAddress" rows="2" style="width: 100%; padding: 0.5rem; border: 2px solid #dadce0; border-radius: 4px; resize: none; background-color: #ffffff; font-family: inherit; transition: all 0.2s;" onfocus="this.style.borderColor='#1a73e8'; this.style.backgroundColor='#f8fbff';" onblur="this.style.borderColor='#dadce0'; this.style.backgroundColor='#ffffff';">${mrf.delivery_address || ''}</textarea>
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
                                       value="${item.item || item.item_name || ''}"
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
                                    <option value="OTHERS" ${(item.category || '') === 'OTHERS' ? 'selected' : ''}>OTHERS</option>
                                </select>
                            </td>
                            <td>
                                <input type="number"
                                       class="item-qty table-input table-input-sm"
                                       data-index="${index}"
                                       value="${item.qty || item.quantity || ''}"
                                       min="1"
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
                                        <option value="${s.supplier_name}" ${s.supplier_name === item.supplier ? 'selected' : ''}>
                                            ${s.supplier_name}
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
    if (!currentMRF) return;
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
    if (!currentMRF) return;
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

    // Add delete button for procurement to remove unnecessary requests
    buttons += ' <button class="btn btn-danger" onclick="window.deleteMRF()" style="margin-left: 0.5rem;">🗑️ Delete MRF</button>';

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
    if (!currentMRF) return;

    const tbody = document.getElementById('lineItemsBody');
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
                <option value="OTHERS">OTHERS</option>
            </select>
        </td>
        <td>
            <input type="number"
                   class="item-qty table-input table-input-sm"
                   data-index="${newIndex}"
                   value=""
                   min="1"
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
                    <option value="${s.supplier_name}">${s.supplier_name}</option>
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
    const selectedProjectCode = document.getElementById('projectName')?.value?.trim();
    const requestorName = document.getElementById('requestorName')?.value?.trim();
    const dateNeeded = document.getElementById('dateNeeded')?.value;
    const urgencyLevel = document.getElementById('urgencyLevel')?.value || 'Low';
    const deliveryAddress = document.getElementById('deliveryAddress')?.value?.trim();

    // Validate required fields
    if (!selectedProjectCode) {
        showToast('Please select a project', 'error');
        return;
    }

    // Find the selected project to get both code and name
    const selectedProject = projectsData.find(p => p.project_code === selectedProjectCode);
    if (!selectedProject) {
        showToast('Selected project not found', 'error');
        return;
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
            project_code: selectedProject.project_code,
            project_name: selectedProject.project_name,
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

// ========================================
// SUPPLIER MANAGEMENT
// ========================================

/**
 * Load suppliers from Firebase
 */
async function loadSuppliers() {
    try {
        const listener = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
            suppliersData = [];
            snapshot.forEach(doc => {
                suppliersData.push({ id: doc.id, ...doc.data() });
            });

            // Sort alphabetically
            suppliersData.sort((a, b) => a.supplier_name.localeCompare(b.supplier_name));

            console.log('Suppliers loaded:', suppliersData.length);
            renderSuppliersTable();
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

    if (suppliersData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">No suppliers yet. Add your first supplier!</td></tr>';
        const paginationDiv = document.getElementById('suppliersPagination');
        if (paginationDiv) paginationDiv.style.display = 'none';
        return;
    }

    // Calculate pagination
    const totalPages = Math.ceil(suppliersData.length / suppliersItemsPerPage);
    const startIndex = (suppliersCurrentPage - 1) * suppliersItemsPerPage;
    const endIndex = Math.min(startIndex + suppliersItemsPerPage, suppliersData.length);
    const pageItems = suppliersData.slice(startIndex, endIndex);

    tbody.innerHTML = pageItems.map(supplier => {
        if (editingSupplier === supplier.id) {
            return `
                <tr class="edit-row">
                    <td><input type="text" value="${supplier.supplier_name}" id="edit-name"></td>
                    <td><input type="text" value="${supplier.contact_person}" id="edit-contact"></td>
                    <td><input type="email" value="${supplier.email}" id="edit-email"></td>
                    <td><input type="text" value="${supplier.phone}" id="edit-phone"></td>
                    <td class="actions">
                        <button class="btn btn-success" onclick="window.saveEdit('${supplier.id}')">Save</button>
                        <button class="btn btn-secondary" onclick="window.cancelEdit()">Cancel</button>
                    </td>
                </tr>
            `;
        } else {
            return `
                <tr>
                    <td class="clickable-supplier" onclick="window.showSupplierPurchaseHistory('${supplier.supplier_name}')">${supplier.supplier_name}</td>
                    <td>${supplier.contact_person}</td>
                    <td>${supplier.email}</td>
                    <td>${supplier.phone}</td>
                    <td class="actions">
                        ${showEditControls ? `
                        <button class="icon-btn" onclick="window.editSupplier('${supplier.id}')">Edit</button>
                        <button class="icon-btn" onclick="window.deleteSupplier('${supplier.id}', '${supplier.supplier_name}')">Delete</button>
                        ` : '<span class="view-only-badge">View Only</span>'}
                    </td>
                </tr>
            `;
        }
    }).join('');

    // Update pagination controls
    updateSuppliersPaginationControls(totalPages, startIndex, endIndex, suppliersData.length);
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

function changeSuppliersPage(direction) {
    const totalPages = Math.ceil(suppliersData.length / suppliersItemsPerPage);

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
    console.log('Loading MRF Records...');
    showLoading(true);

    try {
        // Fetch all MRFs with historical statuses
        const mrfsRef = collection(db, 'mrfs');
        const historicalStatuses = ['TR Submitted', 'PR Generated', 'PR Rejected', 'Finance Approved', 'PO Issued', 'Delivered', 'Completed'];
        const mrfQuery = query(mrfsRef, where('status', 'in', historicalStatuses));
        const mrfSnapshot = await getDocs(mrfQuery);

        allPRPORecords = [];
        mrfSnapshot.forEach((doc) => {
            allPRPORecords.push({ id: doc.id, ...doc.data() });
        });

        // Sort by date (newest first)
        allPRPORecords.sort((a, b) => {
            const dateA = new Date(a.created_at || a.date_submitted);
            const dateB = new Date(b.created_at || b.date_submitted);
            return dateB - dateA;
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

        console.log(`Loaded ${allPRPORecords.length} MRFs and ${allPOData.length} POs`);
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
        // Search filter
        const matchesSearch = !searchInput ||
            (mrf.mrf_id && mrf.mrf_id.toLowerCase().includes(searchInput)) ||
            (mrf.project_name && mrf.project_name.toLowerCase().includes(searchInput));

        // MRF status filter
        const matchesMRFStatus = !mrfStatusFilter || mrf.status === mrfStatusFilter;

        // Note: PO status filter would require checking related POs
        // For now, we only filter by MRF status and search

        return matchesSearch && matchesMRFStatus;
    });

    prpoCurrentPage = 1;
    renderPRPORecords();
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
            color: '#ef4444', // Red
            description: 'No PRs generated yet'
        };
    } else if (poCount === 0) {
        // PRs exist but no POs
        return {
            status: '0/' + prCount + ' PO Issued',
            color: '#f59e0b', // Yellow
            description: 'PRs approved, awaiting PO generation'
        };
    } else if (poCount === prCount) {
        // All POs issued
        return {
            status: prCount + '/' + prCount + ' PO Issued',
            color: '#22c55e', // Green
            description: 'All POs issued'
        };
    } else {
        // Partial PO issuance
        return {
            status: poCount + '/' + prCount + ' PO Issued',
            color: '#f59e0b', // Yellow
            description: 'Partial PO issuance'
        };
    }
}

/**
 * Render MRF status badge with color coding
 */
function renderMRFStatusBadge(statusObj) {
    return `<span style="
        background: ${statusObj.color};
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
        white-space: nowrap;
        display: inline-block;
    ">${statusObj.status}</span>`;
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

    // Show loading state
    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #999;">Loading document references...</div>';

    // Fetch PR and PO data for current page items only
    const rows = await Promise.all(pageItems.map(async (mrf) => {
        const type = mrf.request_type === 'service' ? 'Transport' : 'Material';

        // Fetch PRs for this MRF
        let prHtml = '<span style="color: #999; font-size: 0.875rem;">-</span>';
        let totalCost = 0;
        let prCount = 0;
        let prApprovedCount = 0;
        let prDataArray = []; // Store for MRF status calculation

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

                    const prIds = prDataArray.map(pr => {
                        let badgeColor = '#6b7280';
                        let badgeText = '';
                        if (pr.finance_status === 'Rejected') {
                            badgeColor = '#dc2626';
                            badgeText = 'REJECTED';
                        } else if (pr.finance_status === 'Approved') {
                            badgeColor = '#16a34a';
                            badgeText = 'APPROVED';
                        } else if (pr.finance_status === 'Pending') {
                            badgeColor = '#f59e0b';
                            badgeText = 'PENDING';
                        }
                        return `<div style="display: flex; flex-direction: column; gap: 2px; min-height: 52px; justify-content: center;">
                            <a href="javascript:void(0)" onclick="window.viewPRDetails('${pr.docId}')" style="color: #1a73e8; text-decoration: none; font-weight: 600; font-size: 0.8rem; word-break: break-word;">${pr.pr_id}</a>
                            ${badgeText ? `<span style="background: ${badgeColor}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 0.65rem; font-weight: 600; width: fit-content;">${badgeText}</span>` : ''}
                        </div>`;
                    });
                    prHtml = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">' + prIds.join('') + '</div>';
                }
            } catch (error) {
                console.error('Error fetching PRs for', mrf.mrf_id, error);
            }
        } else if (type === 'Transport') {
            // Fetch cost from transport_requests collection
            try {
                const trsRef = collection(db, 'transport_requests');
                const trQuery = query(trsRef, where('mrf_id', '==', mrf.mrf_id));
                const trSnapshot = await getDocs(trQuery);

                if (!trSnapshot.empty) {
                    trSnapshot.forEach((doc) => {
                        const trData = doc.data();
                        totalCost = parseFloat(trData.total_amount || 0);
                    });
                }

                // Fallback: Calculate from MRF items_json if cost not found in TR
                if (totalCost === 0 && mrf.items_json) {
                    const items = JSON.parse(mrf.items_json);
                    items.forEach(item => {
                        const qty = parseFloat(item.qty || item.quantity || 0);
                        const unitCost = parseFloat(item.unit_cost || 0);
                        totalCost += qty * unitCost;
                    });
                }
            } catch (error) {
                console.error('Error fetching transport request cost for', mrf.mrf_id, error);
            }
        }

        const totalCostHtml = totalCost > 0
            ? `<strong style="color: #1f2937;">₱${totalCost.toLocaleString('en-PH', {minimumFractionDigits: 2})}</strong>`
            : '<span style="color: #999; font-size: 0.875rem;">-</span>';

        // Fetch POs for this MRF (only for Material requests)
        let poHtml = '<span style="color: #999; font-size: 0.875rem;">-</span>';
        let poStatusHtml = '<span style="color: #999; font-size: 0.875rem;">-</span>';
        let poTimelineHtml = '<span style="color: #999; font-size: 0.875rem;">-</span>';
        let poCount = 0;
        let poDataArray = []; // Store for MRF status calculation

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
                            procurement_status: poData.procurement_status,
                            is_subcon: poData.is_subcon || false,
                            supplier_name: poData.supplier_name
                        });
                    });

                    // Sort PO IDs by number
                    poDataArray.sort((a, b) => {
                        const numA = parseInt((a.po_id.match(/-(\d+)-/) || ['', '0'])[1]);
                        const numB = parseInt((b.po_id.match(/-(\d+)-/) || ['', '0'])[1]);
                        return numA - numB;
                    });

                    const poLinks = poDataArray.map(po => {
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

                        return {
                            linkHtml: `<div style="min-height: 52px; display: flex; flex-direction: column; gap: 2px; justify-content: center;">
                                <a href="javascript:void(0)" onclick="window.viewPODetails('${po.docId}')" style="color: #34a853; text-decoration: none; font-weight: 600; font-size: 0.8rem; word-break: break-word;">${po.po_id}</a>${isSubcon ? ' <span style="background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; font-weight: 600;">SUBCON</span>' : ''}
                            </div>`,
                            statusHtml: `<div style="min-height: 52px; display: flex; align-items: center;">
                                ${showEditControls ? `
                                <select class="status-select" data-po-id="${po.docId}" data-is-subcon="${isSubcon}"
                                        onchange="window.updatePOStatus('${po.docId}', this.value, '${currentStatus}', ${isSubcon})"
                                        ${isFinalStatus ? 'disabled' : ''}
                                        style="padding: 0.35rem 0.5rem; border: 1px solid #dadce0; border-radius: 4px; font-size: 0.75rem; ${isFinalStatus ? 'opacity: 0.6; cursor: not-allowed;' : 'cursor: pointer;'}">
                                    ${statusOptions}
                                </select>
                                ` : `<span style="background: ${statusColor.bg}; color: ${statusColor.color}; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">${currentStatus}</span>`}
                            </div>`,
                            timelineHtml: `<div style="min-height: 52px; display: flex; align-items: center;">
                                <button onclick="window.viewPOTimeline('${po.docId}')" style="padding: 6px 12px; font-size: 0.75rem; background: #1a73e8; color: white; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">Timeline</button>
                            </div>`
                        };
                    });

                    poHtml = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">' + poLinks.map(p => p.linkHtml).join('') + '</div>';
                    poStatusHtml = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">' + poLinks.map(p => p.statusHtml).join('') + '</div>';
                    poTimelineHtml = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">' + poLinks.map(p => p.timelineHtml).join('') + '</div>';
                }
            } catch (error) {
                console.error('Error fetching POs for', mrf.mrf_id, error);
            }
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

        const displayId = (type === 'Transport' && mrf.tr_id) ? mrf.tr_id : mrf.mrf_id;

        // Calculate MRF Status badge (only for Material requests)
        let mrfStatusHtml = '<span style="color: #64748b; font-size: 0.75rem;">—</span>';
        if (type === 'Material') {
            const statusObj = calculateMRFStatus(prDataArray, poDataArray);
            mrfStatusHtml = renderMRFStatusBadge(statusObj);
        }

        return `
            <tr>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; font-size: 0.85rem; text-align: center; vertical-align: middle;"><strong>${displayId}</strong></td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; font-size: 0.85rem; text-align: left; vertical-align: middle;">${mrf.project_code ? mrf.project_code + ' - ' : ''}${mrf.project_name || 'No project'}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: center; vertical-align: middle; font-size: 0.85rem;">${new Date(mrf.date_needed || mrf.date_submitted || mrf.created_at).toLocaleDateString()}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top;">${prHtml}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top;">${poHtml}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: middle;">
                    ${mrfStatusHtml}
                </td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top;">${poStatusHtml}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: center; vertical-align: middle;">
                    <button class="btn btn-sm btn-secondary" style="padding: 6px 12px; font-size: 0.75rem; white-space: nowrap;" onclick="window.showProcurementTimeline('${mrf.mrf_id}')">
                        📅 Timeline
                    </button>
                </td>
            </tr>
        `;
    }));

    // Build complete table
    let html = `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #f8f9fa;">
                    <th style="padding: 0.75rem 1rem; text-align: center; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">MRF ID</th>
                    <th style="padding: 0.75rem 1rem; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Project</th>
                    <th style="padding: 0.75rem 1rem; text-align: center; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Date Needed</th>
                    <th style="padding: 0.75rem 1rem; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">PRs</th>
                    <th style="padding: 0.75rem 1rem; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">POs</th>
                    <th style="padding: 0.75rem 1rem; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">MRF Status</th>
                    <th style="padding: 0.75rem 1rem; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Procurement Status</th>
                    <th style="padding: 0.75rem 1rem; text-align: center; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${rows.join('')}
            </tbody>
        </table>
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
    console.log('📦 Submitting Transport Request for MRF:', mrfData.mrf_id);

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
                // Match new format: TR_YYYY_MM-###-SUPPLIER
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

        // Generate supplier slug
        const firstWord = primarySupplier.split(/\s+/)[0] || primarySupplier;
        const supplierSlug = firstWord.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toUpperCase();
        const trId = `TR_${year}_${month}-${String(maxTRNum + 1).padStart(3, '0')}-${supplierSlug}`;

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

        // Update MRF status
        const mrfRef = doc(db, 'mrfs', mrfData.id);
        await updateDoc(mrfRef, {
            status: 'TR Submitted',
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
    console.log('📋 Generating PR for MRF:', mrfData.mrf_id);

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
                console.log(`♻️ Reusing rejected PR ${rejectedPR.pr_id} for supplier: ${supplier}`);
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
                console.log(`🔗 Merging items into approved PR ${approvedPR.pr_id} for supplier: ${supplier}`);
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
                console.log(`✨ Creating new PR for supplier: ${supplier}`);
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
                    requestor_name: mrfData.requestor_name,
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
                console.log(`🗑️ Deleting orphaned rejected PR ${rejectedPR.pr_id} (supplier changed)`);
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
    console.log('📋📦 Generating PR & TR for MRF:', mrfData.mrf_id);

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
        console.log('📋 Processing PR items...');

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
                    requestor_name: mrfData.requestor_name,
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
        console.log('📦 Processing TR items...');

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

        const firstWord = primarySupplier.split(/\s+/)[0] || primarySupplier;
        const supplierSlug = firstWord.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toUpperCase();
        trId = `TR_${year}_${month}-${String(maxTRNum + 1).padStart(3, '0')}-${supplierSlug}`;

        // Create TR document
        await addDoc(collection(db, 'transport_requests'), {
            tr_id: trId,
            mrf_id: mrfData.mrf_id,
            mrf_doc_id: mrfData.id,
            project_code: mrfData.project_code || '',
            project_name: mrfData.project_name,
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
            status: 'PR & TR Submitted',
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
        console.log('POs updated:', poData.length);
    });

    listeners.push(listener);
}

/**
 * Refresh PO tracking manually
 */
async function refreshPOTracking() {
    await loadPOTracking();
    showToast('PO list refreshed', 'success');
};

/**
 * Render PO Tracking Table
 */
function renderPOTrackingTable(pos) {
    const tbody = document.getElementById('poTrackingBody');

    const canEdit = window.canEditTab?.('procurement');
    const showEditControls = canEdit !== false;

    // Calculate separate scoreboard counts for Materials and Subcon
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

    pos.forEach(po => {
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

    if (pos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No POs yet</td></tr>';
        // Hide pagination if no results
        const paginationDiv = document.getElementById('poPagination');
        if (paginationDiv) paginationDiv.style.display = 'none';
        return;
    }

    // Calculate pagination
    const totalPages = Math.ceil(pos.length / poItemsPerPage);
    const startIndex = (poCurrentPage - 1) * poItemsPerPage;
    const endIndex = Math.min(startIndex + poItemsPerPage, pos.length);
    const pageItems = pos.slice(startIndex, endIndex);

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

        return `
        <tr>
            <td><strong><a href="javascript:void(0)" onclick="viewPODetails('${po.id}')" style="color: #1a73e8; text-decoration: none; cursor: pointer;">${po.po_id}</a></strong>${isSubcon ? ' <span style="background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">SUBCON</span>' : ''}</td>
            <td>${po.supplier_name}</td>
            <td>${po.project_code ? po.project_code + ' - ' : ''}${po.project_name || 'No project'}</td>
            <td>PHP ${parseFloat(po.total_amount).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            <td>${new Date(po.date_issued).toLocaleDateString()}</td>
            <td>
                ${showEditControls ? `
                <select class="status-select" data-po-id="${po.id}" data-is-subcon="${isSubcon}"
                        onchange="updatePOStatus('${po.id}', this.value, '${currentStatus}', ${isSubcon})"
                        ${isFinalStatus ? 'disabled style="opacity: 0.6; cursor: not-allowed;"' : ''}>
                    ${statusOptions}
                </select>
                ` : `<span style="background: ${statusColor.bg}; color: ${statusColor.color}; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">${currentStatus}</span>`}
            </td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="promptPODocument('${po.id}')" style="margin-right: 4px;">View PO</button>
                <button class="btn btn-sm btn-primary" onclick="viewPOTimeline('${po.id}')">Timeline</button>
            </td>
        </tr>
    `}).join('');

    // Update pagination controls
    updatePOPaginationControls(totalPages, startIndex, endIndex, pos.length);
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
            }
        }

        const poRef = doc(db, 'pos', poId);
        await updateDoc(poRef, updateData);

        const successMsg = isSubcon
            ? `SUBCON status updated to ${newStatus}`
            : `PO status updated to ${newStatus}${newStatus === 'Delivered' ? ' with delivery fee: PHP ' + deliveryFee.toLocaleString('en-PH', {minimumFractionDigits: 2}) : ''}`;
        showToast(successMsg, 'success');
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

/**
 * View PR Details in a modal
 */
async function viewPRDetails(prDocId) {
    console.log('Loading PR details for:', prDocId);
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
                        <div style="font-weight: 600;">${pr.pr_id}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">MRF Reference</div>
                        <div style="font-weight: 600;">${pr.mrf_id}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Supplier</div>
                        <div style="font-weight: 600;">${pr.supplier_name || 'Not specified'}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Prepared By</div>
                        <div style="padding: 0.5rem 0.75rem; background: #f8f9fa; border-radius: 4px; color: #1e293b; font-size: 0.875rem;">
                            ${pr.pr_creator_name || 'Unknown User'}
                        </div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Project</div>
                        <div>${pr.project_code ? pr.project_code + ' - ' : ''}${pr.project_name || 'No project'}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Date Generated</div>
                        <div>${pr.date_generated}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Status</div>
                        <div><span style="background: ${pr.finance_status === 'Approved' ? '#d1fae5' : pr.finance_status === 'Rejected' ? '#fee2e2' : '#fef3c7'}; color: ${pr.finance_status === 'Approved' ? '#065f46' : pr.finance_status === 'Rejected' ? '#991b1b' : '#92400e'}; padding: 0.375rem 0.75rem; border-radius: 6px; font-size: 0.875rem; font-weight: 600; display: inline-block;">${pr.finance_status || 'Pending'}</span></div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Total Amount</div>
                        <div style="font-weight: 600;">PHP ${parseFloat(pr.total_amount || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Requestor</div>
                        <div>${pr.requestor_name}</div>
                    </div>
                </div>

                <div style="margin-bottom: 1rem;">
                    <div style="font-size: 0.75rem; color: #5f6368; margin-bottom: 0.5rem;">Delivery Address</div>
                    <div style="padding: 0.75rem; background: #f9fafb; border-radius: 4px; font-size: 0.875rem;">${pr.delivery_address || 'N/A'}</div>
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
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${item.item || item.item_name}</td>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${item.category || 'N/A'}</td>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${item.qty || item.quantity} ${item.unit}</td>
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
 * View PO Details
 */
async function viewPODetails(poId) {
    console.log('Loading PO details for:', poId);
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

        // Build modal body content
        let modalBodyContent = `
            <div style="max-height: 60vh; overflow-y: auto;">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">PO ID</div>
                        <div style="font-weight: 600;">${po.po_id}${isSubcon ? ' <span style="background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">SUBCON</span>' : ''}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">MRF Reference</div>
                        <div style="font-weight: 600;">${po.mrf_id || 'N/A'}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Supplier</div>
                        <div style="font-weight: 600;">${po.supplier_name}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Project</div>
                        <div>${po.project_code ? po.project_code + ' - ' : ''}${po.project_name || 'No project'}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Date Issued</div>
                        <div>${po.date_issued ? new Date(po.date_issued).toLocaleDateString() : 'N/A'}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #5f6368;">Status</div>
                        <div><span style="background: ${statusBg}; color: ${statusColor}; padding: 0.375rem 0.75rem; border-radius: 6px; font-size: 0.875rem; font-weight: 600; display: inline-block;">${status}</span></div>
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
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${item.item || item.item_name}</td>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${item.category || 'N/A'}</td>
                                    <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${item.qty || item.quantity} ${item.unit}</td>
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
        content += `${po.date_issued ? '✓' : '○'} PO Issued: ${po.date_issued ? new Date(po.date_issued).toLocaleDateString() : 'Pending'}\n`;
        content += `${po.processing_started_at ? '✓' : '○'} Processing Started: ${po.processing_started_at ? new Date(po.processing_started_at).toLocaleDateString() : 'Not started'}\n`;
        if (po.processing_started_at && po.date_issued) {
            content += `  Time to start: ${calculateDays(po.date_issued, po.processing_started_at)}\n`;
        }
        content += `${po.processed_at || po.processed_date ? '✓' : '○'} Processed: ${(po.processed_at || po.processed_date) ? new Date(po.processed_at || po.processed_date).toLocaleDateString() : 'Not yet processed'}\n`;
        if ((po.processed_at || po.processed_date) && po.processing_started_at) {
            content += `  Processing time: ${calculateDays(po.processing_started_at, po.processed_at || po.processed_date)}\n`;
        }
        if ((po.processed_at || po.processed_date) && po.date_issued) {
            content += `\nTotal Time: ${calculateDays(po.date_issued, po.processed_at || po.processed_date)}`;
        }
    } else {
        // Material Timeline: PO Issued → Procurement Started → Items Procured → Delivered
        content = `Material Timeline: ${po.po_id}\n\n`;
        content += `${po.date_issued ? '✓' : '○'} PO Issued: ${po.date_issued ? new Date(po.date_issued).toLocaleDateString() : 'Pending'}\n`;
        content += `${po.procurement_started_at ? '✓' : '○'} Procurement Started: ${po.procurement_started_at ? new Date(po.procurement_started_at).toLocaleDateString() : 'Not started'}\n`;
        content += `${po.procured_at || po.procured_date ? '✓' : '○'} Items Procured: ${(po.procured_at || po.procured_date) ? new Date(po.procured_at || po.procured_date).toLocaleDateString() : 'Not yet procured'}\n`;
        if ((po.procured_at || po.procured_date) && po.procurement_started_at) {
            content += `  Time: ${calculateDays(po.procurement_started_at, po.procured_at || po.procured_date)}\n`;
        }
        content += `${po.delivered_at || po.delivered_date ? '✓' : '○'} Delivered: ${(po.delivered_at || po.delivered_date) ? new Date(po.delivered_at || po.delivered_date).toLocaleDateString() : 'Not yet delivered'}\n`;
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

        // Build timeline items array
        const timelineItems = [
            {
                title: `📝 MRF Created: ${mrf.mrf_id}`,
                date: formatDate(mrf.created_at),
                description: `Requestor: ${mrf.requestor_name} | Project: ${mrf.project_name || 'N/A'}`,
                status: 'completed'
            }
        ];

        // Add PRs
        prs.forEach(pr => {
            timelineItems.push({
                title: `🛒 Purchase Request: ${pr.pr_id}`,
                date: formatDate(pr.date_generated),
                description: `Supplier: ${pr.supplier_name} | Amount: ₱${formatCurrency(pr.total_amount)}`,
                status: pr.finance_status === 'Approved' ? 'completed' :
                        pr.finance_status === 'Rejected' ? 'rejected' : 'pending'
            });
        });

        // Add TRs
        trs.forEach(tr => {
            timelineItems.push({
                title: `🚚 Transport Request: ${tr.tr_id}`,
                date: formatDate(tr.date_submitted),
                description: `Amount: ₱${formatCurrency(tr.total_amount)}`,
                status: tr.finance_status === 'Approved' ? 'completed' :
                        tr.finance_status === 'Rejected' ? 'rejected' : 'pending'
            });
        });

        // Add POs
        pos.forEach(po => {
            timelineItems.push({
                title: `📄 Purchase Order: ${po.po_id}`,
                date: formatDate(po.date_issued),
                description: `Supplier: ${po.supplier_name} | Status: ${po.procurement_status}`,
                status: po.procurement_status === 'Delivered' ? 'completed' : 'active'
            });
        });

        // Render timeline using createTimeline component
        const timelineHtml = createTimeline(timelineItems);

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
    defaultFinancePIC: 'Ma. Thea Angela R. Lacsamana',
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
                    <div style="margin-top: 30px;">
                        <div style="text-align: left; min-width: 200px; display: inline-block;">
                            <p style="font-weight: bold; font-size: 10pt; margin-bottom: 0.5rem;">Prepared by:</p>
                            <div style="border-top: 1px solid #000; width: 200px; margin: 0.5rem 0 0.25rem 0;"></div>
                            <p style="margin: 0.25rem 0; font-size: 0.875rem;">${data.PREPARED_BY}</p>
                        </div>
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
                    margin-top: 3rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    padding: 0 2rem;
                    page-break-inside: avoid;
                }
                .signature-box {
                    text-align: center;
                    min-width: 200px;
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
                    margin-left: auto;
                    margin-right: auto;
                }
                .sig-line {
                    border-top: 1px solid #000;
                    width: 200px;
                    margin: 0.5rem auto 0.25rem auto;
                }
                .sig-placeholder {
                    height: 60px;
                    width: 200px;
                    margin: 0 auto 0.5rem auto;
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

                <div class="signature-section" style="justify-content: flex-end;">
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
    console.log('Generating PR document for:', prDocId);
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
            PROJECT: pr.project_code ? `${pr.project_code} - ${pr.project_name}` : pr.project_name,
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
    console.log('Generating PO document for:', poDocId);
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
            PROJECT: po.project_code ? `${po.project_code} - ${po.project_name}` : po.project_name,
            DATE: formatDocumentDate(po.date_issued || new Date().toISOString()),
            SUPPLIER: po.supplier_name,
            QUOTE_REF: po.quote_ref || 'N/A',
            ITEMS_TABLE: generateItemsTableHTML(items, 'PO'),
            DELIVERY_ADDRESS: po.delivery_address,
            PAYMENT_TERMS: po.payment_terms || 'As per agreement',
            CONDITION: po.condition || 'Standard terms apply',
            DELIVERY_DATE: formatDocumentDate(po.delivery_date || 'TBD'),
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
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #1e293b;">Payment Terms</label>
                    <input type="text" id="poDocPaymentTerms" value="${po.payment_terms || ''}" placeholder="e.g., 50% down payment, 50% upon delivery"
                           style="width: 100%; padding: 0.75rem; border: 1.5px solid #e2e8f0; border-radius: 8px; font-family: inherit; font-size: 0.875rem;">
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
 * Save PO document fields and generate the document
 * @param {string} poDocId - Firestore document ID of the PO
 */
async function generatePOWithFields(poDocId) {
    const paymentTerms = document.getElementById('poDocPaymentTerms')?.value?.trim() || '';
    const condition = document.getElementById('poDocCondition')?.value?.trim() || '';
    const deliveryDate = document.getElementById('poDocDeliveryDate')?.value || '';

    try {
        // Save fields to Firestore so they persist for future views
        const updateData = {};
        if (paymentTerms) updateData.payment_terms = paymentTerms;
        if (condition) updateData.condition = condition;
        if (deliveryDate) updateData.delivery_date = deliveryDate;

        if (Object.keys(updateData).length > 0) {
            const poRef = doc(db, 'pos', poDocId);
            await updateDoc(poRef, updateData);
        }

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
    console.log('Viewing PO document for:', poDocId);

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
    console.log('Downloading PO document for:', poDocId);

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
    console.log('Generating documents for POs:', poDocIds);

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

console.log('Procurement view module loaded successfully');
