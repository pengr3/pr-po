/* ========================================
   PROCUREMENT VIEW - Complete Migration
   Manages MRFs, Suppliers, PO Tracking, and Historical Data
   Migrated from archive/index.html
   ======================================== */

import { db, collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, orderBy, limit } from '../firebase.js';
import { formatCurrency, formatDate, showLoading, showToast, generateSequentialId } from '../utils.js';
import { createStatusBadge, createModal } from '../components.js';

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

let allHistoricalMRFs = [];
let filteredHistoricalMRFs = [];
let currentPage = 1;
const itemsPerPage = 10;

// Firebase listeners for cleanup
let listeners = [];

// ========================================
// VIEW RENDERING
// ========================================

/**
 * Render the procurement view HTML
 * @param {string} activeTab - Active tab (mrfs, suppliers, records)
 * @returns {string} HTML string
 */
export function render(activeTab = 'mrfs') {
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
                <div class="dashboard-grid">
                    <!-- MRF List -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Pending MRFs</h3>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn btn-primary" onclick="window.createNewMRF()">New</button>
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
                            <div style="display: flex; gap: 0.5rem;" id="mrfActions">
                                <button class="btn btn-primary" onclick="window.saveProgress()">Save Progress</button>
                                <button class="btn btn-success" id="generatePRBtn" onclick="window.generatePR()" style="display: none;">Generate PR</button>
                            </div>
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
                <div class="card">
                    <div class="suppliers-header">
                        <h2>Supplier Management</h2>
                        <button class="btn btn-primary" onclick="window.toggleAddForm()">Add Supplier</button>
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

            <!-- MRF Records Section -->
            <section id="records-section" class="section ${activeTab === 'records' ? 'active' : ''}">
                <div class="card">
                    <div class="card-header">
                        <h2>MRF Records</h2>
                        <button class="btn btn-primary" onclick="window.loadHistoricalMRFs()">Refresh</button>
                    </div>

                    <!-- Filters -->
                    <div class="historical-filters">
                        <div class="filter-group">
                            <label>Search</label>
                            <input type="text" id="histSearchInput" placeholder="Search MRF ID, Project..." onkeyup="window.filterHistoricalMRFs()">
                        </div>
                        <div class="filter-group">
                            <label>Status</label>
                            <select id="histStatusFilter" onchange="window.filterHistoricalMRFs()">
                                <option value="">All Statuses</option>
                                <option value="PR Generated">PR Generated</option>
                                <option value="TR Submitted">TR Submitted</option>
                                <option value="Finance Approved">Finance Approved</option>
                            </select>
                        </div>
                    </div>

                    <!-- Historical MRFs Container -->
                    <div id="historicalMRFsContainer">
                        <div style="text-align: center; padding: 2rem;">Loading historical MRFs...</div>
                    </div>
                    <div id="historicalPagination"></div>
                </div>
            </section>
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
    console.log('Initializing procurement view, tab:', activeTab);

    try {
        // Load all data
        await loadProjects();
        await loadSuppliers();
        await loadMRFs();
        await loadHistoricalMRFs();

        console.log('Procurement view initialized successfully');
    } catch (error) {
        console.error('Error initializing procurement view:', error);
        showToast('Error loading procurement data', 'error');
    }
}

/**
 * Cleanup when leaving the view
 */
export async function destroy() {
    console.log('Destroying procurement view...');

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
    allHistoricalMRFs = [];
    filteredHistoricalMRFs = [];

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
    delete window.loadHistoricalMRFs;
    delete window.filterHistoricalMRFs;

    console.log('Procurement view destroyed');
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
            where('status', '==', 'active')
        );

        const listener = onSnapshot(q, (snapshot) => {
            projectsData = [];
            snapshot.forEach(doc => {
                projectsData.push({ id: doc.id, ...doc.data() });
            });

            // Sort alphabetically
            projectsData.sort((a, b) => a.project_name.localeCompare(b.project_name));

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
window.loadMRFs = async function() {
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

        // Separate by request type
        const materialMRFs = allMRFs.filter(m => m.request_type !== 'service');
        const transportMRFs = allMRFs.filter(m => m.request_type === 'service');

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
                <div style="font-size: 0.875rem; color: #5f6368;">${mrf.project_name}</div>
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
                    <div style="font-size: 0.875rem; color: #5f6368;">${mrf.project_name}</div>
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
window.createNewMRF = function() {
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
window.selectMRF = async function(mrfId, element) {
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

    // Show correct button based on whether it's new or existing
    if (isNew) {
        // For new MRFs, only show Save button
        let buttons = '<button class="btn btn-primary" onclick="window.saveNewMRF()">💾 Save New MRF</button>';
        document.getElementById('mrfActions').innerHTML = buttons;
    } else {
        // For existing MRFs, show normal buttons
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
        document.getElementById('mrfActions').innerHTML = buttons;
    }

    const requestTypeLabel = mrf.request_type === 'service' ?
        'Delivery/Hauling/Transportation' : 'Material Request';

    // Build project options for dropdown
    const projectOptions = projectsData.map(p =>
        `<option value="${p.project_name}" ${p.project_name === mrf.project_name ? 'selected' : ''}>${p.project_name}</option>`
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
                ` : `<div style="font-weight: 600;">${mrf.project_name}</div>`}
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
window.calculateSubtotal = function(index) {
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
window.updateActionButtons = function() {
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

    document.getElementById('mrfActions').innerHTML = buttons;
};

/**
 * Add new line item
 */
window.addLineItem = function() {
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
window.deleteLineItem = function(index) {
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
window.saveNewMRF = async function() {
    if (!currentMRF || currentMRF.id !== null) {
        showToast('This is not a new MRF', 'error');
        return;
    }

    // Collect form data
    const requestType = document.getElementById('requestType')?.value || 'material';
    const projectName = document.getElementById('projectName')?.value?.trim();
    const requestorName = document.getElementById('requestorName')?.value?.trim();
    const dateNeeded = document.getElementById('dateNeeded')?.value;
    const urgencyLevel = document.getElementById('urgencyLevel')?.value || 'Low';
    const deliveryAddress = document.getElementById('deliveryAddress')?.value?.trim();

    // Validate required fields
    if (!projectName) {
        showToast('Please select a project', 'error');
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
            project_name: projectName,
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
window.saveProgress = async function() {
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
window.deleteMRF = async function() {
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
                    <td>${supplier.supplier_name}</td>
                    <td>${supplier.contact_person}</td>
                    <td>${supplier.email}</td>
                    <td>${supplier.phone}</td>
                    <td class="actions">
                        <button class="icon-btn" onclick="window.editSupplier('${supplier.id}')">Edit</button>
                        <button class="icon-btn" onclick="window.deleteSupplier('${supplier.id}', '${supplier.supplier_name}')">Delete</button>
                    </td>
                </tr>
            `;
        }
    }).join('');

    // Update pagination controls
    updateSuppliersPaginationControls(totalPages, startIndex, endIndex, suppliersData.length);
}

// Supplier management functions
window.toggleAddForm = function() {
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

window.addSupplier = async function() {
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

window.editSupplier = function(supplierId) {
    editingSupplier = supplierId;
    renderSuppliersTable();
};

window.cancelEdit = function() {
    editingSupplier = null;
    renderSuppliersTable();
};

window.saveEdit = async function(supplierId) {
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

window.deleteSupplier = async function(supplierId, supplierName) {
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

window.changeSuppliersPage = function(direction) {
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
        paginationDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: #f8f9fa; border-radius: 6px; margin-top: 1rem;';

        const table = document.querySelector('#suppliers-section table');
        if (table && table.parentNode) {
            table.parentNode.insertBefore(paginationDiv, table.nextSibling);
        }
    }

    paginationDiv.style.display = 'flex';

    let paginationHTML = `
        <div style="color: #5f6368; font-size: 0.875rem;">
            Showing ${startIndex + 1}-${endIndex} of ${totalItems} Suppliers
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button onclick="window.changeSuppliersPage('prev')" ${suppliersCurrentPage === 1 ? 'disabled' : ''}
                style="padding: 0.5rem 1rem; border: 1px solid #dadce0; background: white; border-radius: 4px; cursor: pointer; font-size: 0.875rem; ${suppliersCurrentPage === 1 ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                Previous
            </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= suppliersCurrentPage - 1 && i <= suppliersCurrentPage + 1)) {
            paginationHTML += `
                <button
                    onclick="window.changeSuppliersPage(${i})"
                    style="padding: 0.5rem 0.75rem; border: 1px solid #dadce0; background: ${i === suppliersCurrentPage ? '#1a73e8' : 'white'}; color: ${i === suppliersCurrentPage ? 'white' : '#1f2937'}; border-radius: 4px; cursor: pointer; font-size: 0.875rem; font-weight: ${i === suppliersCurrentPage ? '600' : '400'};"
                >
                    ${i}
                </button>
            `;
        } else if (i === suppliersCurrentPage - 2 || i === suppliersCurrentPage + 2) {
            paginationHTML += '<span style="padding: 0.5rem;">...</span>';
        }
    }

    paginationHTML += `
            <button onclick="window.changeSuppliersPage('next')" ${suppliersCurrentPage === totalPages ? 'disabled' : ''}
                style="padding: 0.5rem 1rem; border: 1px solid #dadce0; background: white; border-radius: 4px; cursor: pointer; font-size: 0.875rem; ${suppliersCurrentPage === totalPages ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                Next
            </button>
        </div>
    `;

    paginationDiv.innerHTML = paginationHTML;
}

// ========================================
// HISTORICAL MRFS
// ========================================

window.loadHistoricalMRFs = async function() {
    console.log('Loading historical MRFs...');
    try {
        const mrfsRef = collection(db, 'mrfs');
        const historicalStatuses = ['TR Submitted', 'PR Generated', 'PR Rejected', 'Finance Approved', 'PO Issued', 'Delivered', 'Completed'];
        const q = query(mrfsRef, where('status', 'in', historicalStatuses));

        const snapshot = await getDocs(q);
        allHistoricalMRFs = [];

        snapshot.forEach((doc) => {
            allHistoricalMRFs.push({ id: doc.id, ...doc.data() });
        });

        // Sort by date (newest first)
        allHistoricalMRFs.sort((a, b) => {
            const dateA = new Date(a.created_at || a.date_submitted);
            const dateB = new Date(b.created_at || b.date_submitted);
            return dateB - dateA;
        });

        filteredHistoricalMRFs = [...allHistoricalMRFs];
        currentPage = 1;

        console.log(`Loaded ${allHistoricalMRFs.length} historical MRFs`);
        renderHistoricalMRFs();
    } catch (error) {
        console.error('Error loading historical MRFs:', error);
        showToast('Error loading historical MRFs', 'error');
    }
};

window.filterHistoricalMRFs = function() {
    const searchInput = document.getElementById('histSearchInput')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('histStatusFilter')?.value || '';

    filteredHistoricalMRFs = allHistoricalMRFs.filter(mrf => {
        const matchesSearch = !searchInput ||
            (mrf.mrf_id && mrf.mrf_id.toLowerCase().includes(searchInput)) ||
            (mrf.project_name && mrf.project_name.toLowerCase().includes(searchInput));

        const matchesStatus = !statusFilter || mrf.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    currentPage = 1;
    renderHistoricalMRFs();
};

function renderHistoricalMRFs() {
    const container = document.getElementById('historicalMRFsContainer');
    if (!container) return;

    if (filteredHistoricalMRFs.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #999;">
                <div style="font-size: 1.125rem; margin-bottom: 0.5rem;">No historical MRFs found</div>
                <div style="font-size: 0.875rem;">Historical MRFs will appear here once processed</div>
            </div>
        `;
        return;
    }

    const totalPages = Math.ceil(filteredHistoricalMRFs.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredHistoricalMRFs.length);
    const pageItems = filteredHistoricalMRFs.slice(startIndex, endIndex);

    let html = '<table><thead><tr><th>MRF ID</th><th>Project</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>';

    pageItems.forEach(mrf => {
        const statusColor = mrf.status === 'PR Generated' ? '#34a853' :
                            mrf.status === 'Finance Approved' ? '#1a73e8' : '#5f6368';

        html += `
            <tr>
                <td style="font-weight: 600;">${mrf.mrf_id}</td>
                <td>${mrf.project_name}</td>
                <td>${formatDate(mrf.date_submitted || mrf.created_at)}</td>
                <td><span style="color: ${statusColor}; font-weight: 500;">${mrf.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="viewHistoricalMRFDetails('${mrf.id}')">View</button>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    renderHistoricalPagination(totalPages);
}

function renderHistoricalPagination(totalPages) {
    const paginationDiv = document.getElementById('historicalPagination');
    if (!paginationDiv || totalPages <= 1) return;

    let html = '<div style="display: flex; justify-content: center; gap: 0.5rem; padding: 1rem;">';

    for (let i = 1; i <= totalPages; i++) {
        html += `
            <button
                onclick="goToHistoricalPage(${i})"
                class="btn ${i === currentPage ? 'btn-primary' : 'btn-secondary'}"
                style="min-width: 2.5rem;"
            >
                ${i}
            </button>
        `;
    }

    html += '</div>';
    paginationDiv.innerHTML = html;
}

window.goToHistoricalPage = function(page) {
    currentPage = page;
    renderHistoricalMRFs();
};

window.viewHistoricalMRFDetails = function(mrfId) {
    // TODO: Implement modal view for historical MRF details
    showToast('Historical MRF details view coming soon', 'info');
};

// Placeholder stubs for remaining functions
// ========================================
// PR & TR GENERATION FUNCTIONS
// ========================================

/**
 * Submit Transport Request (TR) for transport/hauling items
 * Filters transport items, validates, and creates TR document
 */
window.submitTransportRequest = async function() {
    if (!currentMRF) return;

    const mrfData = currentMRF;
    console.log('📦 Submitting Transport Request for MRF:', mrfData.mrf_id);

    // Transport categories
    const transportCategories = ['TRANSPORTATION', 'HAULING & DELIVERY'];

    // Collect all items from DOM
    const itemRows = document.querySelectorAll('#mrfDetailsItemRows tr');
    const allItems = [];

    for (const row of itemRows) {
        const itemName = row.querySelector('input[data-field="item_name"]')?.value || '';
        const category = row.querySelector('select[data-field="category"]')?.value || '';
        const qty = parseFloat(row.querySelector('input[data-field="qty"]')?.value) || 0;
        const unit = row.querySelector('input[data-field="unit"]')?.value || 'pcs';
        const unitCost = parseFloat(row.querySelector('input[data-field="unit_cost"]')?.value) || 0;
        const supplier = row.querySelector('select[data-field="supplier"]')?.value || '';

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
window.generatePR = async function() {
    if (!currentMRF) return;

    const mrfData = currentMRF;
    console.log('📋 Generating PR for MRF:', mrfData.mrf_id);

    // Transport categories
    const transportCategories = ['TRANSPORTATION', 'HAULING & DELIVERY'];

    // Collect all items from DOM
    const itemRows = document.querySelectorAll('#mrfDetailsItemRows tr');
    const allItems = [];

    for (const row of itemRows) {
        const itemName = row.querySelector('input[data-field="item_name"]')?.value || '';
        const category = row.querySelector('select[data-field="category"]')?.value || '';
        const qty = parseFloat(row.querySelector('input[data-field="qty"]')?.value) || 0;
        const unit = row.querySelector('input[data-field="unit"]')?.value || 'pcs';
        const unitCost = parseFloat(row.querySelector('input[data-field="unit_cost"]')?.value) || 0;
        const supplier = row.querySelector('select[data-field="supplier"]')?.value || '';

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
                    resubmitted_at: new Date().toISOString()
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
                        items_merged: true
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
                    project_name: mrfData.project_name,
                    requestor_name: mrfData.requestor_name,
                    delivery_address: deliveryAddress,
                    items_json: JSON.stringify(supplierItems),
                    total_amount: supplierTotal,
                    finance_status: 'Pending',
                    date_generated: new Date().toISOString().split('T')[0],
                    created_at: new Date().toISOString()
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
window.generatePRandTR = async function() {
    if (!currentMRF) return;

    const mrfData = currentMRF;
    console.log('📋📦 Generating PR & TR for MRF:', mrfData.mrf_id);

    // Transport categories
    const transportCategories = ['TRANSPORTATION', 'HAULING & DELIVERY'];

    // Collect all items from DOM
    const itemRows = document.querySelectorAll('#mrfDetailsItemRows tr');
    const allItems = [];

    for (const row of itemRows) {
        const itemName = row.querySelector('input[data-field="item_name"]')?.value || '';
        const category = row.querySelector('select[data-field="category"]')?.value || '';
        const qty = parseFloat(row.querySelector('input[data-field="qty"]')?.value) || 0;
        const unit = row.querySelector('input[data-field="unit"]')?.value || 'pcs';
        const unitCost = parseFloat(row.querySelector('input[data-field="unit_cost"]')?.value) || 0;
        const supplier = row.querySelector('select[data-field="supplier"]')?.value || '';

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
                    project_name: mrfData.project_name,
                    requestor_name: mrfData.requestor_name,
                    delivery_address: deliveryAddress,
                    items_json: JSON.stringify(supplierItems),
                    total_amount: supplierTotal,
                    finance_status: 'Pending',
                    date_generated: new Date().toISOString().split('T')[0],
                    created_at: new Date().toISOString()
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

console.log('Procurement view module loaded successfully');
