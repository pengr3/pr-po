/* ========================================
   SERVICES VIEW
   Service management with CRUD operations,
   sub-tab filtering (one-time vs recurring),
   and personnel assignment pill UI
   ======================================== */

import { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot } from '../firebase.js';
import { showLoading, showToast, generateServiceCode, normalizePersonnel, syncServicePersonnelToAssignments, getAssignedServiceCodes, downloadCSV, escapeHTML } from '../utils.js';
import { recordEditHistory } from '../edit-history.js';
import { skeletonTableRows } from '../components.js';
import { renderTrancheBuilder, readTranchesFromDOM, addTranche, removeTranche, recalculateTranches } from '../tranche-builder.js';

// Global state
let servicesData = [];
let clientsData = [];
let usersData = [];  // Active users for personnel selection
let editingService = null;
let editingServiceTranches = []; // Phase 85: populated from service.collection_tranches when editing; reset on cancel/submit
let selectedPersonnel = []; // Array of { id: string, name: string } for pill state
let currentPage = 1;
const itemsPerPage = 15;
let listeners = [];

// Filtering and sorting state
let allServices = [];           // Unfiltered data from Firebase
let filteredServices = [];      // Filtered subset for display
let sortColumn = 'created_at';  // Default sort column
let sortDirection = 'desc';     // Most recent first

// Module-level active tab - persists across re-renders
let currentActiveTab = 'services';

// Unified status options (10 values — replaces separate internal + project status)
const UNIFIED_STATUS_OPTIONS = [
    'For Inspection',
    'For Proposal',
    'Proposal for Internal Approval',
    'Proposal Under Client Review',
    'For Revision',
    'Client Approved',
    'For Mobilization',
    'On-going',
    'Completed',
    'Loss'
];

// Debounce utility function
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

// Attach window functions (all Service-prefixed to avoid collision with projects.js)
function attachWindowFunctions() {
    window.toggleAddServiceForm = toggleAddServiceForm;
    window.addService = addService;
    window.editService = editService;
    window.cancelServiceEdit = cancelServiceEdit;
    window.saveServiceEdit = saveServiceEdit;
    window.deleteService = deleteService;
    window.toggleServiceActive = toggleServiceActive;
    window.changeServicesPage = changeServicesPage;
    window.applyServiceFilters = applyServiceFilters;
    window.debouncedServiceFilter = debouncedServiceFilter;
    window.sortServices = sortServices;
    window.exportServicesCSV = exportServicesCSV;
    window.selectServicePersonnel = selectServicePersonnel;
    window.removeServicePersonnel = removeServicePersonnel;
    window.filterServicePersonnelDropdown = filterServicePersonnelDropdown;
    window.showServicePersonnelDropdown = showServicePersonnelDropdown;
    // Phase 85 D-01: tranche-builder window helpers (shared with projects.js — same names, same shared module)
    window.addTranche = (scopeKey) => addTranche(scopeKey);
    window.removeTranche = (button, scopeKey) => removeTranche(button, scopeKey);
    window.recalculateTranches = (scopeKey) => recalculateTranches(scopeKey);
}

// Render view HTML
export function render(activeTab = null) {
    // Update module-level active tab if provided
    if (activeTab) {
        currentActiveTab = activeTab;
    }
    // Default to 'services' sub-tab if not set
    if (currentActiveTab !== 'services' && currentActiveTab !== 'recurring') {
        currentActiveTab = 'services';
    }

    // Check edit permission
    const canEdit = window.canEditTab?.('services');
    const showEditControls = canEdit !== false;

    // Check role for service creation (only super_admin and services_admin)
    const user = window.getCurrentUser?.();
    const canCreateService = user?.role === 'super_admin' || user?.role === 'services_admin';

    // Default service_type for add form based on active sub-tab
    const defaultServiceType = currentActiveTab === 'recurring' ? 'recurring' : 'one-time';

    return `
        <div class="container" style="margin-top: 2rem;">
            ${canEdit === false ? `
                <div class="view-only-notice">
                    <span class="notice-icon">👁</span>
                    <span>You have view-only access to this section.</span>
                </div>
            ` : ''}
            <div class="card">
                <div class="suppliers-header">
                    <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
                        <h2>Service Management</h2>
                        <div class="tab-bar" style="display: flex; gap: 0.5rem;">
                            <button class="tab-btn ${currentActiveTab === 'services' ? 'active' : ''}"
                                    onclick="window.navigateToTab('services')">Services</button>
                            <button class="tab-btn ${currentActiveTab === 'recurring' ? 'active' : ''}"
                                    onclick="window.navigateToTab('recurring')">Recurring</button>
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-secondary" onclick="window.exportServicesCSV()">Export CSV</button>
                        ${canCreateService ? `
                            <button class="btn btn-primary" onclick="window.toggleAddServiceForm()">Add Service</button>
                        ` : ''}
                    </div>
                </div>

                <!-- Add Service Form -->
                <div id="addServiceForm" class="add-form" style="display: none;">
                    <h3 id="serviceFormTitle" style="margin-bottom: 1rem;">Add New Service</h3>

                    <div class="form-group">
                        <label>Client *</label>
                        <select id="serviceClient" required>
                            <option value="">-- Select Client --</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Service Name *</label>
                        <input type="text" id="serviceName" required>
                    </div>

                    <div class="form-group">
                        <label>Service Type *</label>
                        <select id="serviceType" required>
                            <option value="one-time" ${defaultServiceType === 'one-time' ? 'selected' : ''}>One-Time</option>
                            <option value="recurring" ${defaultServiceType === 'recurring' ? 'selected' : ''}>Recurring</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Location (Optional)</label>
                        <input type="text" id="serviceLocation" placeholder="e.g., Manila, Cebu, Davao">
                    </div>

                    <div class="form-group">
                        <label>Status *</label>
                        <select id="serviceProjectStatus" required>
                            <option value="">-- Select Status --</option>
                            ${UNIFIED_STATUS_OPTIONS.map(s =>
                                `<option value="${s}">${s}</option>`
                            ).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Budget (Optional)</label>
                        <input type="number" id="serviceBudget" min="0" step="0.01" placeholder="0.00">
                        <small class="form-hint">Leave blank if not applicable. Must be positive if provided.</small>
                    </div>

                    <div class="form-group">
                        <label>Contract Cost (Optional)</label>
                        <input type="number" id="serviceContractCost" min="0" step="0.01" placeholder="0.00">
                        <small class="form-hint">Leave blank if not applicable. Must be positive if provided.</small>
                    </div>

                    <div class="form-group">
                        <label>Collection Tranches (Optional)</label>
                        <div id="collTrancheBuilderWrapperService">
                            ${renderTrancheBuilder([], 'serviceForm')}
                        </div>
                        <small class="form-hint">Define how the contract cost is split into billable tranches. Must sum to 100% if provided. Required to bill collectibles against this service (Phase 85).</small>
                    </div>

                    <div class="form-group" style="position: relative;">
                        <label>Personnel *</label>
                        <div class="pill-input-container" id="servicePillContainer"
                             onclick="document.getElementById('servicePersonnelSearchInput')?.focus()">
                            <input type="text"
                                   class="pill-search-input"
                                   id="servicePersonnelSearchInput"
                                   placeholder="Type name or email..."
                                   oninput="window.filterServicePersonnelDropdown(this.value)"
                                   onfocus="window.showServicePersonnelDropdown()"
                                   autocomplete="off">
                        </div>
                        <div class="pill-dropdown" id="servicePersonnelDropdown" style="display: none;"></div>
                        <small class="form-hint">Select one or more active users. Required for new services.</small>
                    </div>

                    <div class="form-actions">
                        <button class="btn btn-secondary" onclick="window.toggleAddServiceForm()">Cancel</button>
                        <button class="btn btn-success" id="submitServiceBtn" onclick="window.addService()">Add Service</button>
                    </div>
                </div>

                <!-- Filter Bar -->
                <div class="filter-bar" style="display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: #f8fafc; border-radius: 0.5rem;">
                    <div class="form-group" style="margin: 0; flex: 1; min-width: 150px;">
                        <label style="font-size: 0.875rem; margin-bottom: 0.25rem;">Status</label>
                        <select id="serviceProjectStatusFilter" onchange="window.applyServiceFilters()" style="width: 100%;">
                            <option value="">All Statuses</option>
                            ${UNIFIED_STATUS_OPTIONS.map(s =>
                                `<option value="${s}">${s}</option>`
                            ).join('')}
                        </select>
                    </div>

                    <div class="form-group" style="margin: 0; flex: 1; min-width: 150px;">
                        <label style="font-size: 0.875rem; margin-bottom: 0.25rem;">Client</label>
                        <select id="serviceClientFilter" onchange="window.applyServiceFilters()" style="width: 100%;">
                            <option value="">All Clients</option>
                        </select>
                    </div>

                    <div class="form-group" style="margin: 0; flex: 2; min-width: 200px;">
                        <label style="font-size: 0.875rem; margin-bottom: 0.25rem;">Search</label>
                        <input type="text"
                               id="serviceSearchInput"
                               placeholder="Search by code or name..."
                               oninput="window.debouncedServiceFilter()"
                               style="width: 100%;">
                    </div>
                </div>

                <!-- Services Table -->
                <div class="table-scroll-container">
                <table>
                    <thead>
                        <tr>
                            <th onclick="window.sortServices('service_code')" style="cursor: pointer; user-select: none;">
                                Code <span class="sort-indicator" data-col="service_code"></span>
                            </th>
                            <th onclick="window.sortServices('service_name')" style="cursor: pointer; user-select: none;">
                                Name <span class="sort-indicator" data-col="service_name"></span>
                            </th>
                            <th onclick="window.sortServices('client_code')" style="cursor: pointer; user-select: none;">
                                Client <span class="sort-indicator" data-col="client_code"></span>
                            </th>
                            <th onclick="window.sortServices('project_status')" style="cursor: pointer; user-select: none;">
                                Status <span class="sort-indicator" data-col="project_status"></span>
                            </th>
                            <th onclick="window.sortServices('active')" style="cursor: pointer; user-select: none;">
                                Active <span class="sort-indicator" data-col="active"></span>
                            </th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="servicesTableBody">
                        ${skeletonTableRows(7, 5)}
                    </tbody>
                </table>
                </div>
            </div>
        </div>
    `;
}

// Initialize view
export async function init(activeTab = null) {
    // Update module-level active tab
    if (activeTab && (activeTab === 'services' || activeTab === 'recurring')) {
        currentActiveTab = activeTab;
    }

    attachWindowFunctions();

    // Listen for permission changes and re-render table
    const permissionChangeHandler = () => {
        renderServicesTable();
    };
    window.addEventListener('permissionsChanged', permissionChangeHandler);

    if (!window._servicesPermissionHandler) {
        window._servicesPermissionHandler = permissionChangeHandler;
    }

    // ASSIGN-06: Re-filter when assignments change
    const assignmentChangeHandler = () => {
        applyServiceFilters();
    };
    window.addEventListener('assignmentsChanged', assignmentChangeHandler);
    window._servicesAssignmentHandler = assignmentChangeHandler;

    // Click-outside handler to close personnel dropdown
    const clickOutsideHandler = (e) => {
        const container = document.getElementById('servicePillContainer');
        const dropdown = document.getElementById('servicePersonnelDropdown');
        if (dropdown && container && !container.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    };
    document.addEventListener('mousedown', clickOutsideHandler);
    window._servicePersonnelClickOutside = clickOutsideHandler;

    await loadServiceClients();
    await loadServiceActiveUsers();
    await loadServices();
}

/**
 * Export the currently-filtered services list as a CSV file.
 */
function exportServicesCSV() {
    if (filteredServices.length === 0) {
        showToast('No services to export', 'info');
        return;
    }
    const headers = ['Code', 'Name', 'Client', 'Status', 'Active'];
    const rows = filteredServices.map(service => {
        const client = clientsData.find(c => c.id === service.client_id);
        const clientName = client ? client.company_name : (service.client_code || '');
        return [
            service.service_code || '',
            service.service_name || '',
            clientName,
            service.project_status || '',
            service.active ? 'Yes' : 'No'
        ];
    });
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(headers, rows, `services-${date}.csv`);
}
window.exportServicesCSV = exportServicesCSV;

// Cleanup
export async function destroy() {
    // Remove permission change listener
    if (window._servicesPermissionHandler) {
        window.removeEventListener('permissionsChanged', window._servicesPermissionHandler);
        delete window._servicesPermissionHandler;
    }

    // Remove assignment change listener (ASSIGN-06)
    if (window._servicesAssignmentHandler) {
        window.removeEventListener('assignmentsChanged', window._servicesAssignmentHandler);
        delete window._servicesAssignmentHandler;
    }

    listeners.forEach(unsubscribe => unsubscribe?.());
    listeners = [];
    servicesData = [];
    clientsData = [];
    usersData = [];
    editingService = null;
    currentPage = 1;
    allServices = [];
    filteredServices = [];
    sortColumn = 'created_at';
    sortDirection = 'desc';
    currentActiveTab = 'services';

    // Clean up personnel pill state
    if (window._servicePersonnelClickOutside) {
        document.removeEventListener('mousedown', window._servicePersonnelClickOutside);
        delete window._servicePersonnelClickOutside;
    }
    selectedPersonnel = [];

    delete window.toggleAddServiceForm;
    delete window.addService;
    delete window.editService;
    delete window.cancelServiceEdit;
    delete window.saveServiceEdit;
    delete window.deleteService;
    delete window.toggleServiceActive;
    delete window.changeServicesPage;
    delete window.applyServiceFilters;
    delete window.debouncedServiceFilter;
    delete window.sortServices;
    delete window.exportServicesCSV;
    delete window.selectServicePersonnel;
    delete window.removeServicePersonnel;
    delete window.filterServicePersonnelDropdown;
    delete window.showServicePersonnelDropdown;
    // Phase 85 D-01: detach tranche-builder window helpers
    delete window.addTranche;
    delete window.removeTranche;
    delete window.recalculateTranches;
    editingServiceTranches = [];
}

// Load clients with real-time listener
async function loadServiceClients() {
    try {
        const listener = onSnapshot(collection(db, 'clients'), (snapshot) => {
            clientsData = [];
            snapshot.forEach(doc => {
                clientsData.push({ id: doc.id, ...doc.data() });
            });

            clientsData.sort((a, b) => a.company_name.localeCompare(b.company_name));

            renderServiceClientDropdown();
        }, (error) => {
            console.error('[Services] Error loading clients:', error);
        });

        listeners.push(listener);
    } catch (error) {
        console.error('[Services] Error loading clients:', error);
    }
}

// Load active users for personnel pill selector
async function loadServiceActiveUsers() {
    // Personnel pill selector is an edit feature - skip for view-only users
    const canEdit = window.canEditTab?.('services');
    if (canEdit === false) {
        return;
    }

    try {
        const usersQuery = query(
            collection(db, 'users'),
            where('status', '==', 'active')
        );

        const listener = onSnapshot(usersQuery, (snapshot) => {
            usersData = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                usersData.push({
                    id: doc.id,
                    full_name: data.full_name || '',
                    email: data.email || ''
                });
            });
            usersData.sort((a, b) => a.full_name.localeCompare(b.full_name));
        }, (error) => {
            console.warn('[Services] Users listener error (likely permissions):', error.message);
        });

        listeners.push(listener);
    } catch (error) {
        console.error('[Services] Error loading users:', error);
    }
}

// Pill rendering and interaction functions
function renderServicePills() {
    const container = document.getElementById('servicePillContainer');
    if (!container) return;

    const searchInput = document.getElementById('servicePersonnelSearchInput');
    const searchValue = searchInput?.value || '';

    const pillsHtml = selectedPersonnel.map(user => `
        <span class="personnel-pill ${user.id ? '' : 'legacy'}" data-user-id="${user.id || ''}">
            ${user.name}
            <button type="button" class="pill-remove"
                onmousedown="event.preventDefault(); window.removeServicePersonnel('${user.id || ''}', '${user.name.replace(/'/g, "\\'")}')">&times;</button>
        </span>
    `).join('');

    container.innerHTML = `
        ${pillsHtml}
        <input type="text"
               class="pill-search-input"
               id="servicePersonnelSearchInput"
               placeholder="${selectedPersonnel.length === 0 ? 'Type name or email...' : ''}"
               value="${searchValue}"
               oninput="window.filterServicePersonnelDropdown(this.value)"
               onfocus="window.showServicePersonnelDropdown()"
               autocomplete="off">
    `;

    const newSearchInput = document.getElementById('servicePersonnelSearchInput');
    if (document.activeElement === container || searchValue) {
        newSearchInput?.focus();
    }
}

function filterServicePersonnelDropdown(searchText) {
    const dropdown = document.getElementById('servicePersonnelDropdown');
    if (!dropdown) return;

    const term = searchText.toLowerCase().trim();
    const selectedIds = selectedPersonnel.map(u => u.id).filter(Boolean);

    const matches = term ? usersData.filter(user =>
        !selectedIds.includes(user.id) &&
        (user.full_name.toLowerCase().includes(term) ||
         user.email.toLowerCase().includes(term))
    ) : [];

    if (matches.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    dropdown.innerHTML = matches.slice(0, 10).map(user => `
        <div class="pill-dropdown-item"
             onmousedown="event.preventDefault(); window.selectServicePersonnel('${user.id}', '${user.full_name.replace(/'/g, "\\'")}')">
            <strong>${escapeHTML(user.full_name)}</strong>
            <span style="color: #64748b; margin-left: 0.5rem;">${escapeHTML(user.email)}</span>
        </div>
    `).join('');

    dropdown.style.display = 'block';
}

function showServicePersonnelDropdown() {
    const searchInput = document.getElementById('servicePersonnelSearchInput');
    if (searchInput?.value?.trim()) {
        filterServicePersonnelDropdown(searchInput.value);
    }
}

function selectServicePersonnel(userId, userName) {
    if (selectedPersonnel.some(u => u.id === userId)) return;

    selectedPersonnel.push({ id: userId, name: userName });
    renderServicePills();

    const searchInput = document.getElementById('servicePersonnelSearchInput');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    const dropdown = document.getElementById('servicePersonnelDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

function removeServicePersonnel(userId, userName) {
    if (userId) {
        selectedPersonnel = selectedPersonnel.filter(u => u.id !== userId);
    } else {
        selectedPersonnel = selectedPersonnel.filter(u => u.name !== userName);
    }
    renderServicePills();
}

// Render client dropdown
function renderServiceClientDropdown() {
    const select = document.getElementById('serviceClient');
    if (!select) return;

    const currentValue = select.value;

    let optionsHtml = '<option value="">-- Select Client --</option>';
    clientsData.forEach(client => {
        const selected = client.id === currentValue ? 'selected' : '';
        optionsHtml += `
            <option value="${escapeHTML(client.id)}"
                    data-code="${escapeHTML(client.client_code)}"
                    ${selected}>
                ${escapeHTML(client.company_name)} (${escapeHTML(client.client_code)})
            </option>
        `;
    });

    select.innerHTML = optionsHtml;

    // Also update client filter dropdown
    const filterSelect = document.getElementById('serviceClientFilter');
    if (filterSelect) {
        const currentFilterValue = filterSelect.value;
        let filterOptionsHtml = '<option value="">All Clients</option>';
        clientsData.forEach(client => {
            const selected = client.id === currentFilterValue ? 'selected' : '';
            filterOptionsHtml += `<option value="${escapeHTML(client.id)}" ${selected}>${escapeHTML(client.company_name)}</option>`;
        });
        filterSelect.innerHTML = filterOptionsHtml;
    }
}

// Toggle add/edit form visibility
function toggleAddServiceForm() {
    // Guard: check edit permission
    if (window.canEditTab?.('services') === false) {
        showToast('You do not have permission to edit services', 'error');
        return;
    }

    // Guard: check role for service creation
    const user = window.getCurrentUser?.();
    if (!user || (user.role !== 'super_admin' && user.role !== 'services_admin')) {
        showToast('Only Services Admin and Super Admin can create services', 'error');
        return;
    }

    const form = document.getElementById('addServiceForm');
    if (!form) return;

    if (form.style.display === 'none') {
        editingService = null;
        form.style.display = 'block';
        document.getElementById('serviceFormTitle').textContent = 'Add New Service';
        document.getElementById('submitServiceBtn').textContent = 'Add Service';
        document.getElementById('submitServiceBtn').onclick = window.addService;

        // Clear form
        document.getElementById('serviceClient').value = '';
        document.getElementById('serviceName').value = '';
        document.getElementById('serviceLocation').value = '';
        document.getElementById('serviceType').value = currentActiveTab === 'recurring' ? 'recurring' : 'one-time';
        document.getElementById('serviceProjectStatus').value = '';
        document.getElementById('serviceBudget').value = '';
        document.getElementById('serviceContractCost').value = '';

        // Clear personnel pills
        selectedPersonnel = [];
        renderServicePills();

        document.getElementById('serviceName').focus();
    } else {
        form.style.display = 'none';
        editingService = null;
        renderServicesTable();
    }
}

// Add service
async function addService() {
    // Guard: check edit permission
    if (window.canEditTab?.('services') === false) {
        showToast('You do not have permission to edit services', 'error');
        return;
    }

    // Guard: check role for service creation
    const user = window.getCurrentUser?.();
    if (!user || (user.role !== 'super_admin' && user.role !== 'services_admin')) {
        showToast('Only Services Admin and Super Admin can create services', 'error');
        return;
    }

    const clientSelect = document.getElementById('serviceClient');
    const clientId = clientSelect.value;
    const clientCode = clientSelect.selectedOptions[0]?.getAttribute('data-code');
    const service_name = document.getElementById('serviceName').value.trim();
    const service_type = document.getElementById('serviceType').value;
    const location = document.getElementById('serviceLocation').value.trim();
    const project_status = document.getElementById('serviceProjectStatus').value;
    const budgetVal = document.getElementById('serviceBudget').value;
    const contractVal = document.getElementById('serviceContractCost').value;

    // Validate required fields
    if (!clientId || !service_name || !service_type || !project_status) {
        showToast('Please fill in all required fields', 'error');
        return;
    }

    // Validate personnel selection
    if (selectedPersonnel.length === 0) {
        showToast('Personnel field is required - select at least one user', 'error');
        return;
    }

    // Validate optional positive numbers
    const budget = budgetVal ? parseFloat(budgetVal) : null;
    const contract_cost = contractVal ? parseFloat(contractVal) : null;

    if (budget !== null && (isNaN(budget) || budget <= 0)) {
        showToast('Budget must be a positive number (greater than 0)', 'error');
        return;
    }

    if (contract_cost !== null && (isNaN(contract_cost) || contract_cost <= 0)) {
        showToast('Contract cost must be a positive number (greater than 0)', 'error');
        return;
    }

    // Validate status values
    if (!UNIFIED_STATUS_OPTIONS.includes(project_status)) {
        showToast('Invalid status', 'error');
        return;
    }

    // Validate service type
    if (!['one-time', 'recurring'].includes(service_type)) {
        showToast('Invalid service type', 'error');
        return;
    }

    // Phase 85 D-09: read + validate collection_tranches from service form
    const collectionTranches = readTranchesFromDOM('serviceForm');
    const tranchesProvided = collectionTranches.length > 0
        && collectionTranches.some(t => t.label.trim() !== '' || t.percentage > 0);
    if (tranchesProvided) {
        const total = collectionTranches.reduce((s, t) => s + (parseFloat(t.percentage) || 0), 0);
        if (Math.abs(total - 100) > 0.01) {
            showToast(`Collection tranches must sum to 100% (currently ${total.toFixed(2)}%)`, 'error');
            return;
        }
        if (collectionTranches.some(t => !t.label.trim())) {
            showToast('All tranche labels must be filled in', 'error');
            return;
        }
    }
    const finalTranches = tranchesProvided ? collectionTranches : [];

    showLoading(true);

    try {
        // Generate service code (requires client_code for shared CLMC sequence)
        const service_code = await generateServiceCode(clientCode);

        const newUserIds = selectedPersonnel.map(u => u.id).filter(Boolean);
        const newUserNames = selectedPersonnel.map(u => u.name);

        const docRef = await addDoc(collection(db, 'services'), {
            service_code,
            service_name,
            service_type,        // 'one-time' | 'recurring'
            client_id: clientId,
            client_code: clientCode,  // REQUIRED: for generateServiceCode range query
            project_status,
            budget,
            contract_cost,
            personnel_user_ids: newUserIds,
            personnel_names: newUserNames,
            location: location || null,
            personnel_user_id: null,
            personnel_name: null,
            personnel: null,
            active: true,
            created_at: new Date().toISOString(),
            collection_tranches: finalTranches  // Phase 85 D-09: always-written, [] if user provided no tranche data
        });

        // Record creation in edit history (fire-and-forget)
        recordEditHistory(docRef.id, 'create', [
            { field: 'service_name', old_value: null, new_value: service_name },
            { field: 'service_type', old_value: null, new_value: service_type },
            { field: 'client', old_value: null, new_value: clientCode },
            ...(location ? [{ field: 'location', old_value: null, new_value: location }] : []),
            { field: 'project_status', old_value: null, new_value: project_status },
            ...(budget ? [{ field: 'budget', old_value: null, new_value: budget }] : []),
            ...(contract_cost ? [{ field: 'contract_cost', old_value: null, new_value: contract_cost }] : []),
            ...(newUserNames.length > 0 ? [{ field: 'personnel', old_value: null, new_value: newUserNames.join(', ') }] : []),
            ...(tranchesProvided ? [{ field: 'collection_tranches', old_value: null, new_value: JSON.stringify(finalTranches) }] : [])
        ], 'services').catch(err => console.error('[EditHistory] addService failed:', err));

        // Sync personnel to service assignments (fire-and-forget)
        syncServicePersonnelToAssignments(service_code, [], newUserIds)
            .catch(err => console.error('[Services] Assignment sync failed:', err));

        showToast(`Service "${service_name}" created successfully!`, 'success');
        toggleAddServiceForm();
    } catch (error) {
        console.error('[Services] Error adding service:', error);
        showToast('Failed to create service', 'error');
    } finally {
        showLoading(false);
    }
}

// Apply filters (includes sub-tab type filter and services_user scope)
function applyServiceFilters() {
    const searchTerm = document.getElementById('serviceSearchInput')?.value.toLowerCase() || '';
    const projectStatusFilter = document.getElementById('serviceProjectStatusFilter')?.value || '';
    const clientFilter = document.getElementById('serviceClientFilter')?.value || '';

    // Sub-tab determines service_type filter
    const serviceTypeFilter = (currentActiveTab === 'recurring') ? 'recurring' : 'one-time';

    // ASSIGN-04: Scope to assigned services for services_user
    // getAssignedServiceCodes() returns null (no filter) for all roles except
    // services_user without all_services. Returns [] if zero assignments.
    const assignedCodes = getAssignedServiceCodes();

    filteredServices = allServices.filter(service => {
        // Sub-tab type filter (always applied)
        const matchesType = service.service_type === serviceTypeFilter;

        // Search filter (OR across code and name)
        const matchesSearch = !searchTerm ||
            (service.service_code && service.service_code.toLowerCase().includes(searchTerm)) ||
            (service.service_name && service.service_name.toLowerCase().includes(searchTerm));

        // Status filter (exact match)
        const matchesProjectStatus = !projectStatusFilter ||
            service.project_status === projectStatusFilter;

        // Client filter (match by ID)
        const matchesClient = !clientFilter ||
            service.client_id === clientFilter;

        // ASSIGN-04: services_user scope restriction
        if (assignedCodes !== null && !assignedCodes.includes(service.service_code)) {
            return false;
        }

        // AND logic - all conditions must be true
        return matchesType && matchesSearch && matchesProjectStatus && matchesClient;
    });

    // Reset pagination when filters change
    currentPage = 1;

    // Apply current sort
    sortFilteredServices();

    renderServicesTable();
}

// Sort filtered services
function sortFilteredServices() {
    filteredServices.sort((a, b) => {
        let aVal = a[sortColumn];
        let bVal = b[sortColumn];

        // Handle null/undefined (sort to end)
        if (aVal == null) return sortDirection === 'asc' ? 1 : -1;
        if (bVal == null) return sortDirection === 'asc' ? -1 : 1;

        // Handle dates
        if (sortColumn === 'created_at' || sortColumn === 'updated_at') {
            aVal = new Date(aVal);
            bVal = new Date(bVal);
        }

        // Handle booleans
        if (sortColumn === 'active') {
            // Active first when descending, inactive first when ascending
            return sortDirection === 'asc'
                ? (aVal === bVal ? 0 : aVal ? 1 : -1)
                : (aVal === bVal ? 0 : aVal ? -1 : 1);
        }

        // String comparison
        if (typeof aVal === 'string') {
            return sortDirection === 'asc'
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal);
        }

        // Numeric/date comparison
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
}

// Rebuild status filter dropdown — injects legacy values discovered in servicesData
// under an "Other (legacy)" optgroup so users can find and update them.
function rebuildServiceStatusFilterOptions() {
    const select = document.getElementById('serviceProjectStatusFilter');
    if (!select) return;
    const previousValue = select.value;
    const legacyValues = new Set();
    for (const service of allServices) {
        const v = service.project_status;
        if (v && !UNIFIED_STATUS_OPTIONS.includes(v)) {
            legacyValues.add(v);
        }
    }
    const unifiedHtml = UNIFIED_STATUS_OPTIONS
        .map(s => `<option value="${s}">${s}</option>`)
        .join('');
    const legacyHtml = legacyValues.size > 0
        ? `<optgroup label="Other (legacy)">${[...legacyValues].sort().map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)} (legacy)</option>`).join('')}</optgroup>`
        : '';
    select.innerHTML = `<option value="">All Statuses</option>${unifiedHtml}${legacyHtml}`;
    if (previousValue && [...select.options].some(o => o.value === previousValue)) {
        select.value = previousValue;
    }
}

// Create debounced filter
const debouncedServiceFilter = debounce(applyServiceFilters, 300);

// Sort services by column
function sortServices(column) {
    // Toggle direction if clicking same column
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc'; // Default to ascending on new column
    }

    // Reset pagination
    currentPage = 1;

    // Sort the filtered data
    sortFilteredServices();

    // Re-render table with updated headers
    renderServicesTable();
}

// Update sort indicators
function updateServiceSortIndicators() {
    document.querySelectorAll('.sort-indicator').forEach(indicator => {
        const col = indicator.dataset.col;
        if (col === sortColumn) {
            indicator.textContent = sortDirection === 'asc' ? ' ↑' : ' ↓';
            indicator.style.color = '#1a73e8';
        } else {
            indicator.textContent = ' ⇅';
            indicator.style.color = '#94a3b8';
        }
    });
}

// Load services with real-time listener
async function loadServices() {
    try {
        // ASSIGN-04: services_user may only read their assigned services.
        // An unscoped collection query would include docs they're not assigned to,
        // which Firestore's per-document list rule would deny for the entire query.
        const assignedCodes = getAssignedServiceCodes();
        let servicesQuery;
        if (assignedCodes !== null) {
            // services_user: scope query to assigned service_codes only
            if (assignedCodes.length === 0) {
                allServices = [];
                applyServiceFilters();
                return;
            }
            servicesQuery = query(collection(db, 'services'), where('service_code', 'in', assignedCodes));
        } else {
            servicesQuery = collection(db, 'services');
        }

        const listener = onSnapshot(servicesQuery, (snapshot) => {
            allServices = [];
            snapshot.forEach(doc => {
                allServices.push({ id: doc.id, ...doc.data() });
            });

            // Apply filters (which will also sort and render)
            applyServiceFilters();
        }, (error) => {
            console.error('[Services] Error loading services:', error);
        });

        listeners.push(listener);
    } catch (error) {
        console.error('[Services] Error loading services:', error);
    }
}

// Render services table
function renderServicesTable() {
    rebuildServiceStatusFilterOptions();
    const tbody = document.getElementById('servicesTableBody');
    if (!tbody) return;

    if (filteredServices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No services found matching filters.</td></tr>';
        const paginationDiv = document.getElementById('servicesPagination');
        if (paginationDiv) paginationDiv.style.display = 'none';
        return;
    }

    // Pagination
    const totalPages = Math.ceil(filteredServices.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredServices.length);
    const pageItems = filteredServices.slice(startIndex, endIndex);

    // Check edit permission for action buttons
    const canEdit = window.canEditTab?.('services');
    const showEditControls = canEdit !== false;

    // Check role for delete permission (only super_admin and services_admin)
    const user = window.getCurrentUser?.();
    const canDeleteService = user?.role === 'super_admin' || user?.role === 'services_admin';

    tbody.innerHTML = pageItems.map(service => {
        // Find client name
        const client = clientsData.find(c => c.id === service.client_id);
        const clientName = client ? client.company_name : service.client_code;

        return `
            <tr onclick="window.location.hash = '#/services/detail/${escapeHTML(service.service_code)}'"
                style="cursor: pointer;"
                class="clickable-row">
                <td><strong>${escapeHTML(service.service_code || '')}</strong></td>
                <td>${escapeHTML(service.service_name || '')}</td>
                <td>${escapeHTML(clientName || '')}</td>
                <td>${(() => {
                        const v = service.project_status || '';
                        if (v && !UNIFIED_STATUS_OPTIONS.includes(v)) {
                            return `<span style="color: #94a3b8; font-style: italic;">${escapeHTML(v)} (legacy)</span>`;
                        }
                        return escapeHTML(v);
                    })()}</td>
                <td>
                    <span class="status-badge clickable-badge ${service.active ? 'approved' : 'rejected'}"
                          ${showEditControls ? `onclick="event.stopPropagation(); window.toggleServiceActive('${escapeHTML(service.id)}', ${service.active})" title="Click to ${service.active ? 'deactivate' : 'activate'}" style="cursor: pointer;"` : ''}>
                        ${service.active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                ${showEditControls ? `
                    <td style="white-space: nowrap;" onclick="event.stopPropagation()">
                        <button class="btn btn-sm btn-primary" onclick="window.editService('${escapeHTML(service.id)}')">Edit</button>
                        ${canDeleteService ? `<button class="btn btn-sm btn-danger" onclick="window.deleteService('${escapeHTML(service.id)}', '${(service.service_name || '').replace(/'/g, "\\'")}')">Delete</button>` : ''}
                    </td>
                ` : `
                    <td class="actions-cell" onclick="event.stopPropagation()">
                        <span class="view-only-badge">View Only</span>
                    </td>
                `}
            </tr>
        `;
    }).join('');

    updateServicePaginationControls(totalPages, startIndex, endIndex, filteredServices.length);

    // Update sort indicators
    updateServiceSortIndicators();
}

// Edit service
function editService(serviceId) {
    // Guard: check edit permission
    if (window.canEditTab?.('services') === false) {
        showToast('You do not have permission to edit services', 'error');
        return;
    }

    const service = allServices.find(s => s.id === serviceId);
    if (!service) return;

    editingService = serviceId;

    // Show form
    const form = document.getElementById('addServiceForm');
    form.style.display = 'block';
    document.getElementById('serviceFormTitle').textContent = 'Edit Service';
    document.getElementById('submitServiceBtn').textContent = 'Save Changes';
    document.getElementById('submitServiceBtn').onclick = window.saveServiceEdit;

    // Populate form
    document.getElementById('serviceClient').value = service.client_id;
    document.getElementById('serviceName').value = service.service_name;
    document.getElementById('serviceLocation').value = service.location || '';
    document.getElementById('serviceType').value = service.service_type || 'one-time';
    document.getElementById('serviceProjectStatus').value = service.project_status;
    document.getElementById('serviceBudget').value = service.budget || '';
    document.getElementById('serviceContractCost').value = service.contract_cost || '';

    // Phase 85 D-01: rebuild tranche editor with existing service tranches
    editingServiceTranches = Array.isArray(service.collection_tranches) ? service.collection_tranches : [];
    const trancheWrapper = document.getElementById('collTrancheBuilderWrapperService');
    if (trancheWrapper) {
        trancheWrapper.innerHTML = renderTrancheBuilder(editingServiceTranches, 'serviceForm');
    }

    // Populate pills from existing personnel data (handles all legacy formats)
    const normalized = normalizePersonnel(service);
    selectedPersonnel = [];
    for (let i = 0; i < normalized.names.length; i++) {
        selectedPersonnel.push({
            id: normalized.userIds[i] || '',
            name: normalized.names[i]
        });
    }
    renderServicePills();
}

// Cancel edit
function cancelServiceEdit() {
    toggleAddServiceForm();
}

// Save edit
async function saveServiceEdit() {
    // Guard: check edit permission
    if (window.canEditTab?.('services') === false) {
        showToast('You do not have permission to edit services', 'error');
        return;
    }

    if (!editingService) return;

    const clientSelect = document.getElementById('serviceClient');
    const clientId = clientSelect.value;
    const clientCode = clientSelect.selectedOptions[0]?.getAttribute('data-code');
    const service_name = document.getElementById('serviceName').value.trim();
    const service_type = document.getElementById('serviceType').value;
    const location = document.getElementById('serviceLocation').value.trim();
    const project_status = document.getElementById('serviceProjectStatus').value;
    const budgetVal = document.getElementById('serviceBudget').value;
    const contractVal = document.getElementById('serviceContractCost').value;

    // Build personnel payload from pill state
    const personnelUpdate = {
        personnel_user_ids: selectedPersonnel.map(u => u.id).filter(Boolean),
        personnel_names: selectedPersonnel.map(u => u.name),
        personnel_user_id: null,
        personnel_name: null,
        personnel: null
    };

    // Validate required fields
    if (!clientId || !service_name || !service_type || !project_status) {
        showToast('Please fill in all required fields', 'error');
        return;
    }

    // Validate optional positive numbers
    const budget = budgetVal ? parseFloat(budgetVal) : null;
    const contract_cost = contractVal ? parseFloat(contractVal) : null;

    if (budget !== null && (isNaN(budget) || budget <= 0)) {
        showToast('Budget must be a positive number (greater than 0)', 'error');
        return;
    }

    if (contract_cost !== null && (isNaN(contract_cost) || contract_cost <= 0)) {
        showToast('Contract cost must be a positive number (greater than 0)', 'error');
        return;
    }

    // Validate status values
    if (!UNIFIED_STATUS_OPTIONS.includes(project_status)) {
        showToast('Invalid status', 'error');
        return;
    }

    if (!['one-time', 'recurring'].includes(service_type)) {
        showToast('Invalid service type', 'error');
        return;
    }

    // Capture old personnel BEFORE save for sync diff
    const existingService = allServices.find(s => s.id === editingService);
    const oldNormalized = normalizePersonnel(existingService);
    const oldUserIds = oldNormalized.userIds;

    // Phase 85 D-09: read + validate collection_tranches
    const collectionTranches = readTranchesFromDOM('serviceForm');
    const tranchesProvided = collectionTranches.length > 0
        && collectionTranches.some(t => t.label.trim() !== '' || t.percentage > 0);
    if (tranchesProvided) {
        const total = collectionTranches.reduce((s, t) => s + (parseFloat(t.percentage) || 0), 0);
        if (Math.abs(total - 100) > 0.01) {
            showToast(`Collection tranches must sum to 100% (currently ${total.toFixed(2)}%)`, 'error');
            return;
        }
        if (collectionTranches.some(t => !t.label.trim())) {
            showToast('All tranche labels must be filled in', 'error');
            return;
        }
    }
    const finalTranches = tranchesProvided ? collectionTranches : [];

    // Phase 85 D-25: warn if existing collectibles exist when tranches are being changed
    const oldTranchesJson = JSON.stringify(existingService.collection_tranches || []);
    const newTranchesJson = JSON.stringify(finalTranches);
    if (oldTranchesJson !== newTranchesJson && existingService.service_code) {
        try {
            const existingColl = await getDocs(
                query(collection(db, 'collectibles'), where('service_code', '==', existingService.service_code))
            );
            if (existingColl.size > 0) {
                const ok = confirm(
                    `This service has ${existingColl.size} existing collectible(s). ` +
                    `Existing collectibles keep their original tranche label and amount — only future collectibles will use the new tranches. Continue?`
                );
                if (!ok) {
                    return;
                }
            }
        } catch (queryErr) {
            console.error('[Services] Existing-collectibles check failed:', queryErr);
            // Non-blocking — proceed without the warning if Firestore query fails
        }
    }

    showLoading(true);

    try {
        const serviceRef = doc(db, 'services', editingService);
        await updateDoc(serviceRef, {
            service_name,
            location: location || null,
            client_id: clientId,
            client_code: clientCode,
            service_type,
            project_status,
            budget,
            contract_cost,
            ...personnelUpdate,
            collection_tranches: finalTranches,  // Phase 85 D-09: always-written, [] if user cleared
            updated_at: new Date().toISOString()
        });

        // Build diff for edit history
        const editChanges = [];
        if (existingService.service_name !== service_name) {
            editChanges.push({ field: 'service_name', old_value: existingService.service_name, new_value: service_name });
        }
        if (existingService.client_code !== clientCode) {
            editChanges.push({ field: 'client_code', old_value: existingService.client_code, new_value: clientCode });
        }
        const oldLocation = existingService.location || '';
        if (oldLocation !== (location || '')) {
            editChanges.push({ field: 'location', old_value: oldLocation || null, new_value: location || null });
        }
        if (existingService.service_type !== service_type) {
            editChanges.push({ field: 'service_type', old_value: existingService.service_type, new_value: service_type });
        }
        if (existingService.project_status !== project_status) {
            editChanges.push({ field: 'project_status', old_value: existingService.project_status, new_value: project_status });
        }
        const oldBudget = existingService.budget != null ? parseFloat(existingService.budget) : null;
        if (oldBudget !== budget) {
            editChanges.push({ field: 'budget', old_value: oldBudget, new_value: budget });
        }
        const oldContract = existingService.contract_cost != null ? parseFloat(existingService.contract_cost) : null;
        if (oldContract !== contract_cost) {
            editChanges.push({ field: 'contract_cost', old_value: oldContract, new_value: contract_cost });
        }
        // Phase 85 D-09: record collection_tranches change in edit history
        if (oldTranchesJson !== newTranchesJson) {
            editChanges.push({ field: 'collection_tranches', old_value: oldTranchesJson, new_value: newTranchesJson });
        }
        // Check personnel changes
        const oldPersonnelNames = (existingService.personnel_names || []).sort().join(',');
        const newPersonnelNames = selectedPersonnel.map(u => u.name).sort().join(',');
        if (oldPersonnelNames !== newPersonnelNames) {
            editChanges.push({
                field: 'personnel',
                old_value: existingService.personnel_names?.join(', ') || '(none)',
                new_value: selectedPersonnel.map(u => u.name).join(', ') || '(none)'
            });
        }
        // Only record if something actually changed
        if (editChanges.length > 0) {
            recordEditHistory(editingService, 'update', editChanges, 'services')
                .catch(err => console.error('[EditHistory] saveServiceEdit failed:', err));
        }

        // Sync personnel assignment changes (fire-and-forget)
        const newUserIds = selectedPersonnel.map(u => u.id).filter(Boolean);
        const serviceCode = existingService?.service_code;
        syncServicePersonnelToAssignments(serviceCode, oldUserIds, newUserIds)
            .catch(err => console.error('[Services] Assignment sync failed:', err));

        showToast('Service updated successfully', 'success');
        editingService = null;
        toggleAddServiceForm();
    } catch (error) {
        console.error('[Services] Error updating service:', error);
        showToast('Failed to update service', 'error');
    } finally {
        showLoading(false);
    }
}

// Delete service
async function deleteService(serviceId, serviceName) {
    // Guard: check edit permission
    if (window.canEditTab?.('services') === false) {
        showToast('You do not have permission to edit services', 'error');
        return;
    }

    // Guard: only services_admin and super_admin can delete
    const user = window.getCurrentUser?.();
    if (!user || (user.role !== 'super_admin' && user.role !== 'services_admin')) {
        showToast('Only Services Admin and Super Admin can delete services', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to delete service "${serviceName}"?`)) {
        return;
    }

    showLoading(true);

    try {
        await deleteDoc(doc(db, 'services', serviceId));
        showToast(`Service "${serviceName}" deleted`, 'success');
    } catch (error) {
        console.error('[Services] Error deleting service:', error);
        showToast('Failed to delete service', 'error');
    } finally {
        showLoading(false);
    }
}

// Toggle service active status
async function toggleServiceActive(serviceId, currentStatus) {
    // Guard: check edit permission
    if (window.canEditTab?.('services') === false) {
        showToast('You do not have permission to edit services', 'error');
        return;
    }

    if (!confirm(`${currentStatus ? 'Deactivate' : 'Activate'} this service?`)) {
        return;
    }

    showLoading(true);

    try {
        await updateDoc(doc(db, 'services', serviceId), {
            active: !currentStatus,
            updated_at: new Date().toISOString()
        });

        // Record edit history (fire-and-forget)
        recordEditHistory(serviceId, 'toggle_active', [
            { field: 'active', old_value: currentStatus, new_value: !currentStatus }
        ], 'services').catch(err => console.error('[EditHistory] toggleServiceActive failed:', err));

        showToast('Service status updated', 'success');
    } catch (error) {
        console.error('[Services] Error toggling active status:', error);
        showToast('Failed to update service', 'error');
    } finally {
        showLoading(false);
    }
}

// Change page
function changeServicesPage(direction) {
    const totalPages = Math.ceil(filteredServices.length / itemsPerPage);

    if (direction === 'prev' && currentPage > 1) {
        currentPage--;
    } else if (direction === 'next' && currentPage < totalPages) {
        currentPage++;
    } else if (typeof direction === 'number') {
        currentPage = direction;
    }

    renderServicesTable();
}

// Update pagination controls
function updateServicePaginationControls(totalPages, startIndex, endIndex, totalItems) {
    let paginationDiv = document.getElementById('servicesPagination');

    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.id = 'servicesPagination';
        paginationDiv.className = 'pagination-container';

        const section = document.querySelector('.container');
        const table = section?.querySelector('table');
        if (table && table.parentNode) {
            table.parentNode.insertBefore(paginationDiv, table.nextSibling);
        }
    }

    let paginationHTML = `
        <div class="pagination-info">
            Showing <strong>${startIndex + 1}-${endIndex}</strong> of <strong>${totalItems}</strong> services
        </div>
        <div class="pagination-controls">
            <button class="pagination-btn" onclick="changeServicesPage('prev')" ${currentPage === 1 ? 'disabled' : ''}>
                &larr; Previous
            </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            paginationHTML += `
                <button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="changeServicesPage(${i})">
                    ${i}
                </button>
            `;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            paginationHTML += '<span class="pagination-ellipsis">...</span>';
        }
    }

    paginationHTML += `
            <button class="pagination-btn" onclick="changeServicesPage('next')" ${currentPage === totalPages ? 'disabled' : ''}>
                Next &rarr;
            </button>
        </div>
    `;

    paginationDiv.innerHTML = paginationHTML;
}
