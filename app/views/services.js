/* ========================================
   SERVICES VIEW
   Service management with CRUD operations,
   sub-tab filtering (one-time vs recurring),
   and personnel assignment pill UI
   ======================================== */

import { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot } from '../firebase.js';
import { showLoading, showToast, generateServiceCode, normalizePersonnel, syncServicePersonnelToAssignments, getAssignedServiceCodes, downloadCSV, escapeHTML, formatCurrency } from '../utils.js';
import { recordEditHistory } from '../edit-history.js';
import { createEngagement } from '../engagement-create.js';
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

// Filtering state
let allServices = [];           // Unfiltered data from Firebase
let filteredServices = [];      // Filtered subset for display

// Module-level active tab - persists across re-renders
let currentActiveTab = 'services';

// Phase 92.2: Scorecard filter state — null = "Total" (all statuses)
let activeServiceStatusFilter = null;

// Unified status options (11 values since Phase 88 D-05 added Draft)
const UNIFIED_STATUS_OPTIONS = [
    'Draft',  // Phase 88 D-05 — pre-proposal stage; engagements created from the Proposals tab default here.
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

// Phase 92.2: Scorecard strip excludes 'Draft' (Draft services are proposals; not surfaced as a status filter)
const SCORECARD_STATUS_OPTIONS = UNIFIED_STATUS_OPTIONS.filter(s => s !== 'Draft');

// Predicate: true for non-empty project_status values that fall outside UNIFIED_STATUS_OPTIONS.
// 'Draft' is canonical in services (included above), so it is NOT legacy.
// Empty/missing statuses are NOT legacy — they must NOT be pulled into the Legacy bucket.
const isLegacyStatus = (s) => !!s && !UNIFIED_STATUS_OPTIONS.includes(s);

// Phase 103.1 D-04 — two-tier urgency thresholds (days). Mirror of projects.js (operator-confirmed).
const URGENCY_THRESHOLDS = {
    FOR_PROPOSAL_WATCH: 2,        FOR_PROPOSAL_URGENT: 5,         // For Proposal
    INTERNAL_APPROVAL_WATCH: 2,   INTERNAL_APPROVAL_URGENT: 5,    // Proposal for Internal Approval
    CLIENT_REVIEW_WATCH: 7,       CLIENT_REVIEW_URGENT: 14,       // Proposal Under Client Review
    FOR_REVISION_WATCH: 2,        FOR_REVISION_URGENT: 3,         // For Revision
    CLIENT_APPROVED_WATCH: 3,     CLIENT_APPROVED_URGENT: 7,      // Client Approved
    MOBILIZATION_WATCH: 3,        MOBILIZATION_URGENT: 10,        // For Mobilization
    FOR_INSPECTION_WATCH: 2,      FOR_INSPECTION_URGENT: 5,       // For Inspection
    ONGOING_QUIET_WATCH: 7,       ONGOING_QUIET_URGENT: 14,       // On-going (D-05: services watch-only cap)
    DLP_SOON_DAYS: 14             // DLP expiring soon watch (D-06)
};

// Phase 103 D-03 — Browse All stage groups for services. Mirror of projects.js PLUS a leading
// 'Draft' group so all 11 services statuses (incl. Phase 88 Draft) map to exactly one group.
// Inline hex spine colors (NO var(--*)).
const SERVICE_STAGE_GROUPS = [
    { key: 'draft',       label: 'Draft',                   statuses: ['Draft'],                                          color: '#94a3b8' },
    { key: 'ongoing',     label: 'On-going',                statuses: ['On-going'],                                       color: '#1a73e8' },
    { key: 'contracted',  label: 'Contracted & Mobilizing', statuses: ['Client Approved', 'For Mobilization'],           color: '#f59e0b' },
    { key: 'proposal',    label: 'Proposal Stage',          statuses: ['For Proposal', 'Proposal for Internal Approval', 'Proposal Under Client Review', 'For Revision'], color: '#7c3aed' },
    { key: 'inspection',  label: 'For Inspection',          statuses: ['For Inspection'],                                color: '#94a3b8' },
    { key: 'completed',   label: 'Completed',               statuses: ['Completed'],                                      color: '#059669' },
    { key: 'loss',        label: 'Loss',                    statuses: ['Loss'],                                           color: '#64748b' }
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
    window.applyServiceFilters = applyServiceFilters;
    window.handleServiceScorecardClick = handleServiceScorecardClick;
    window.debouncedServiceFilter = debouncedServiceFilter;
    window.exportServicesCSV = exportServicesCSV;
    window.vmSwitchService = vmSwitchService;               // Phase 103 — service view-mode toggle
    window.toggleServiceStageGroup = toggleServiceStageGroup; // Phase 103 — Browse All group collapse
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

                <!-- Phase 92.2: Status Scorecard Strip (mirrors Phase 92 projects pattern) -->
                <div id="serviceScorecards" class="project-scorecards">
                    ${SCORECARD_STATUS_OPTIONS.map(s => `
                        <div class="project-scorecard-card" data-status="${s}" onclick="window.handleServiceScorecardClick('${s}'); event.stopPropagation()">
                            <span class="scorecard-label">${s}</span>
                            <span class="scorecard-count" id="service-scorecard-count-${s.replace(/\s+/g, '_')}">—</span>
                        </div>
                    `).join('')}
                    <div class="project-scorecard-card project-scorecard-card--total" data-status="__total__" onclick="window.handleServiceScorecardClick(null); event.stopPropagation()">
                        <span class="scorecard-label">Total</span>
                        <span class="scorecard-count" id="service-scorecard-count-total">—</span>
                    </div>
                </div>

                <!-- Filter Bar -->
                <div class="filter-bar" style="display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: #f8fafc; border-radius: 0.5rem;">
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

                <!-- Phase 103 — Portfolio view-mode toggle + dual render containers (replaces flat table) -->
                <div class="vm-toggle">
                    <button class="vm-btn" id="vm-feed-svc" onclick="window.vmSwitchService('feed')">🔥 Priority Feed</button>
                    <button class="vm-btn" id="vm-browse-svc" onclick="window.vmSwitchService('browse')">≡ Browse All</button>
                </div>
                <div id="pdb-feed-svc" class="pdb-mode"></div>
                <div id="pdb-browse-svc" class="pdb-mode" style="display:none;"></div>
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

    // Listen for permission changes and re-render the portfolio (Feed + Browse All)
    const permissionChangeHandler = () => {
        renderServicePortfolio();
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

    // Phase 92.2: Reset scorecard filter on fresh init; click-outside clears active scorecard
    activeServiceStatusFilter = null;
    window._serviceScorecardClickOutside = (e) => {
        const strip = document.getElementById('serviceScorecards');
        if (!strip) return;
        if (!strip.contains(e.target)) {
            activeServiceStatusFilter = null;
            applyServiceFilters();
        }
    };
    document.addEventListener('click', window._serviceScorecardClickOutside);

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
    currentActiveTab = 'services';

    // Clean up personnel pill state
    if (window._servicePersonnelClickOutside) {
        document.removeEventListener('mousedown', window._servicePersonnelClickOutside);
        delete window._servicePersonnelClickOutside;
    }
    selectedPersonnel = [];

    // Phase 92.2: Tear down scorecard click-outside handler and reset filter state
    if (window._serviceScorecardClickOutside) {
        document.removeEventListener('click', window._serviceScorecardClickOutside);
        delete window._serviceScorecardClickOutside;
    }
    activeServiceStatusFilter = null;

    delete window.toggleAddServiceForm;
    delete window.addService;
    delete window.editService;
    delete window.cancelServiceEdit;
    delete window.saveServiceEdit;
    delete window.deleteService;
    delete window.toggleServiceActive;
    delete window.applyServiceFilters;
    delete window.debouncedServiceFilter;
    delete window.exportServicesCSV;
    delete window.vmSwitchService;               // Phase 103
    delete window.toggleServiceStageGroup;       // Phase 103
    delete window.selectServicePersonnel;
    delete window.removeServicePersonnel;
    delete window.filterServicePersonnelDropdown;
    delete window.showServicePersonnelDropdown;
    delete window.handleServiceScorecardClick;
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
        renderServicePortfolio();
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
        // Phase 88-01: shared engagement-create helper (D-04)
        await createEngagement({
            type: service_type,
            clientId,
            clientCode,
            name: service_name,
            location: location || null,
            projectStatus: project_status,
            budget,
            contractCost: contract_cost,
            personnel: selectedPersonnel,
            collectionTranches: finalTranches,
            onAfterCreate: ({ code }) => {
                syncServicePersonnelToAssignments(code, [], selectedPersonnel.map(u => u.id).filter(Boolean))
                    .catch(err => console.error('[Services] Assignment sync failed:', err));
            }
        });

        showToast(`Service "${service_name}" created successfully!`, 'success');
        toggleAddServiceForm();
    } catch (error) {
        console.error('[Services] Error adding service:', error);
        showToast('Failed to create service', 'error');
    } finally {
        showLoading(false);
    }
}

// Phase 92.2: Render scorecard counts and active highlight
// baseServices = services scoped only by sub-tab type + services_user assignments
// (NOT filtered by client/search/status — counts reflect the "what's available" pool
// for this tab so toggling a card never makes its own count change)
function renderServiceScorecards(baseServices) {
    for (const s of SCORECARD_STATUS_OPTIONS) {
        const count = baseServices.filter(sv => sv.project_status === s).length;
        const key = s.replace(/\s+/g, '_');
        const el = document.getElementById(`service-scorecard-count-${key}`);
        if (el) el.textContent = count;
    }
    const totalEl = document.getElementById('service-scorecard-count-total');
    if (totalEl) totalEl.textContent = baseServices.length;

    document.querySelectorAll('#serviceScorecards .project-scorecard-card').forEach(card => {
        card.classList.remove('project-scorecard-card--active');
    });
    const activeKey = activeServiceStatusFilter || '__total__';
    document.querySelector(`#serviceScorecards .project-scorecard-card[data-status="${activeKey}"]`)
        ?.classList.add('project-scorecard-card--active');
}

// Phase 92.2: Toggle scorecard filter — clicking the active card or passing null clears it
function handleServiceScorecardClick(status) {
    if (status === null || status === activeServiceStatusFilter) {
        activeServiceStatusFilter = null;
    } else {
        activeServiceStatusFilter = status;
    }
    applyServiceFilters();
}

// Apply filters (includes sub-tab type filter and services_user scope)
function applyServiceFilters() {
    const searchTerm = document.getElementById('serviceSearchInput')?.value.toLowerCase() || '';
    const clientFilter = document.getElementById('serviceClientFilter')?.value || '';

    // Sub-tab determines service_type filter
    const serviceTypeFilter = (currentActiveTab === 'recurring') ? 'recurring' : 'one-time';

    // ASSIGN-04: Scope to assigned services for services_user
    // getAssignedServiceCodes() returns null (no filter) for all roles except
    // services_user without all_services. Returns [] if zero assignments.
    const assignedCodes = getAssignedServiceCodes();

    // Phase 92.2: Build the "scoped" pool first — service_type + assignment scope only.
    // Scorecards count from this pool so toggling a status card never changes its own count.
    const scopedServicesForTab = allServices.filter(sv =>
        sv.service_type === serviceTypeFilter &&
        (assignedCodes === null || assignedCodes.includes(sv.service_code))
    );

    filteredServices = scopedServicesForTab.filter(service => {
        // Search filter (OR across code and name)
        const matchesSearch = !searchTerm ||
            (service.service_code && service.service_code.toLowerCase().includes(searchTerm)) ||
            (service.service_name && service.service_name.toLowerCase().includes(searchTerm));

        // Phase 92.2: Status filter now driven by scorecard click state
        const matchesProjectStatus = activeServiceStatusFilter === null ||
            service.project_status === activeServiceStatusFilter;

        // Client filter (match by ID)
        const matchesClient = !clientFilter ||
            service.client_id === clientFilter;

        // AND logic - all conditions must be true
        return matchesSearch && matchesProjectStatus && matchesClient;
    });

    // Phase 103: the new renderers impose their own ordering (Feed partitions by urgency,
    // Browse All groups by stage), so no global sort of filteredServices is needed (W-3).
    renderServicePortfolio();
    renderServiceScorecards(scopedServicesForTab);
}

// Phase 92.2: rebuildServiceStatusFilterOptions() removed — the status filter
// dropdown was replaced by the scorecard strip, which uses the fixed
// SCORECARD_STATUS_OPTIONS set. Legacy status values still display on rows
// via project_status, but are no longer surfaced as a filter affordance.

// Create debounced filter
const debouncedServiceFilter = debounce(applyServiceFilters, 300);

// Load services with real-time listener
async function loadServices() {
    try {
        // ASSIGN-04: services_user may only read their assigned services.
        // An unscoped collection query would include docs they're not assigned to,
        // which Firestore's per-document list rule would deny for the entire query.
        const currentUser = window.getCurrentUser?.();
        const role = currentUser?.role;
        const assignedCodes = getAssignedServiceCodes();
        let servicesQuery;
        if (role === 'operations_user') {
            // operations_user: scoped by the firestore.rules services.list per-doc predicate
            // (request.auth.uid in resource.data.personnel_user_ids). An unscoped query would
            // be denied for the whole list, so we must filter to assigned services here. Every
            // doc returned by array-contains satisfies the rule predicate.
            const uid = currentUser?.uid;
            if (!uid) {
                allServices = [];
                applyServiceFilters();
                return;
            }
            servicesQuery = query(collection(db, 'services'), where('personnel_user_ids', 'array-contains', uid));
        } else if (assignedCodes !== null) {
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

/* ========================================
   Phase 103 — Portfolio redesign helpers (Plan 04, mirror of projects.js Plans 02+03)
   Shared computation layer for the service Priority Feed + Browse All. Renders within the
   active service_type sub-tab pool (filteredServices is already sub-tab + scope + filter narrowed).
   ======================================== */

// Phase 103 D-08 — updated_at is written as ISO string AND Firestore Timestamp; normalize both.
// Returns epoch-ms number, or null when missing/unparseable (caller degrades to On Track).
function normalizeUpdatedAt(v) {
    if (v == null) return null;
    if (typeof v === 'object') {
        if (typeof v.toDate === 'function') { const d = v.toDate(); return isNaN(d) ? null : d.getTime(); }
        if (typeof v.seconds === 'number') return v.seconds * 1000;
        return null;
    }
    if (typeof v === 'number') return isNaN(v) ? null : v;
    const t = new Date(v).getTime();
    return isNaN(t) ? null : t;
}

// Phase 103.1 D-02 — stage-duration clock: status_changed_at ?? updated_at ?? created_at.
function stageDaysInStageService(s, now) {
    const ms = normalizeUpdatedAt(s.status_changed_at) ?? normalizeUpdatedAt(s.updated_at) ?? normalizeUpdatedAt(s.created_at);
    return ms == null ? null : (now - ms) / 86400000;
}

// Phase 103 D-05 — mirrored render-only DLP state (no isRetentionCollected branch; no new listener).
// Returns 'active' when dlp_months absent or status !== 'Completed', so sparse-DLP services are safe.
function getDlpState(service) {
    if (!service || !service.dlp_months || service.project_status !== 'Completed') return 'active';
    if (service.retention_released_at) return 'released';
    if (Date.now() > new Date(service.dlp_expires_at || null).getTime()) return 'expired';
    return 'in-dlp';
}

// Phase 103 D-07 — a status-appropriate "On Track" phrase for the default ok signal.
function getServiceDefaultOkSignal(s) {
    switch (s.project_status) {
        case 'On-going':   return 'On track';
        case 'Completed':  return getDlpState(s) === 'released' ? 'Fully collected' : 'Completed';
        case 'Loss':       return 'Lost engagement';
        default:           return s.project_status || '—';
    }
}

// Phase 103.1 D-04 — two-tier urgency signal, mirror of projects.js getProjectSignal. ONLY the On-going
// branch diverges (D-05 conservative): services have no activity clock, so On-going is watch-only.
function getServiceSignal(s, now) {
    const status = s.project_status;
    const dlp = getDlpState(s);

    // (1) DLP expired — highest urgent
    if (dlp === 'expired')
        return { level: 'urgent', text: 'Retention release overdue', hint: 'DLP expired — retention not yet released' };

    // (2) On-going — D-05 CONSERVATIVE: watch only (never urgent), 14d, one-time only.
    //     Recurring services are quiet by design → always On Track (suppressed). No activity clock;
    //     reads updated_at (services have no journal/activity-recency timestamp).
    if (status === 'On-going') {
        if (s.service_type !== 'recurring') {
            // Phase 104 D-13 — one-time services now have an activity clock (journal writes populate last_activity_at).
            const ms = normalizeUpdatedAt(s.last_activity_at) ?? normalizeUpdatedAt(s.updated_at);
            const d = ms == null ? null : (now - ms) / 86400000;
            if (d != null && d > URGENCY_THRESHOLDS.ONGOING_QUIET_URGENT)
                return { level: 'urgent', text: `No activity in ${Math.round(d)} days`, hint: 'On-going service has gone quiet' };
            if (d != null && d > URGENCY_THRESHOLDS.ONGOING_QUIET_WATCH)
                return { level: 'watch', text: `Quiet for ${Math.round(d)} days`, hint: 'No journal activity recently' };
        }
        if (dlp === 'in-dlp') return { level: 'ok', text: 'In defect liability period', hint: 'Retention held pending DLP' };
        return { level: 'ok', text: getServiceDefaultOkSignal(s), hint: '' };
    }

    // (3) Stage-duration funnel statuses — two-tier on status_changed_at (MIRROR Plan 03 FUNNEL map verbatim)
    const d = stageDaysInStageService(s, now);
    const FUNNEL = {
        'For Proposal': {
            watch: URGENCY_THRESHOLDS.FOR_PROPOSAL_WATCH, urgent: URGENCY_THRESHOLDS.FOR_PROPOSAL_URGENT,
            watchText: dd => ({ text: `Proposal not yet sent — ${dd}d`, hint: 'Client awaiting our quote' }),
            urgentText: dd => ({ text: `Proposal stalled — ${dd}d`, hint: `No proposal sent in ${dd} days` })
        },
        'Proposal for Internal Approval': {
            watch: URGENCY_THRESHOLDS.INTERNAL_APPROVAL_WATCH, urgent: URGENCY_THRESHOLDS.INTERNAL_APPROVAL_URGENT,
            watchText: dd => ({ text: `Awaiting internal sign-off — ${dd}d`, hint: 'Proposal ready, pending approval' }),
            urgentText: dd => ({ text: `Sign-off overdue — ${dd}d`, hint: 'Finished proposal blocked internally' })
        },
        'Proposal Under Client Review': {
            watch: URGENCY_THRESHOLDS.CLIENT_REVIEW_WATCH, urgent: URGENCY_THRESHOLDS.CLIENT_REVIEW_URGENT,
            watchText: dd => ({ text: `Awaiting client response — ${dd}d`, hint: 'Client reviewing the proposal' }),
            urgentText: dd => ({ text: `Proposal stale — ${dd}d`, hint: "Client hasn't responded" })
        },
        'For Revision': {
            watch: URGENCY_THRESHOLDS.FOR_REVISION_WATCH, urgent: URGENCY_THRESHOLDS.FOR_REVISION_URGENT,
            watchText: dd => ({ text: `Revision requested — ${dd}d`, hint: 'Tight turnaround expected' }),
            urgentText: dd => ({ text: `Revision overdue — ${dd}d`, hint: 'Revision turnaround exceeded' })
        },
        'Client Approved': {
            watch: URGENCY_THRESHOLDS.CLIENT_APPROVED_WATCH, urgent: URGENCY_THRESHOLDS.CLIENT_APPROVED_URGENT,
            watchText: dd => ({ text: `Won — not yet mobilized — ${dd}d`, hint: 'Client expects kickoff' }),
            urgentText: dd => ({ text: `Kickoff overdue — ${dd}d`, hint: `Won work idle ${dd} days` })
        },
        'For Mobilization': {
            watch: URGENCY_THRESHOLDS.MOBILIZATION_WATCH, urgent: URGENCY_THRESHOLDS.MOBILIZATION_URGENT,
            watchText: dd => ({ text: 'Contract signed, not mobilized', hint: `${dd}d since For Mobilization` }),
            urgentText: dd => ({ text: `Mobilization overdue — ${dd}d`, hint: 'Not mobilized after sign-off' })
        },
        'For Inspection': {
            watch: URGENCY_THRESHOLDS.FOR_INSPECTION_WATCH, urgent: URGENCY_THRESHOLDS.FOR_INSPECTION_URGENT,
            watchText: dd => ({ text: `Inspection pending — ${dd}d`, hint: 'Chase inspection' }),
            urgentText: dd => ({ text: `Inspection overdue — ${dd}d`, hint: 'No progress since assigned' })
        }
    };
    const cfg = FUNNEL[status];
    if (cfg && d != null) {
        const dd = Math.round(d);
        if (d > cfg.urgent) return { level: 'urgent', ...cfg.urgentText(dd) };
        if (d > cfg.watch)  return { level: 'watch', ...cfg.watchText(dd) };
    }

    // (4) DLP-soon watch (D-06) — mirror Plan 03
    if (dlp === 'in-dlp') {
        const exp = normalizeUpdatedAt(s.dlp_expires_at);
        if (exp != null) {
            const daysToExpiry = (exp - now) / 86400000;
            if (daysToExpiry >= 0 && daysToExpiry <= URGENCY_THRESHOLDS.DLP_SOON_DAYS)
                return { level: 'watch', text: `Retention release due in ${Math.ceil(daysToExpiry)}d`, hint: 'Finance lead time before overdue' };
        }
        return { level: 'ok', text: 'In defect liability period', hint: 'Retention held pending DLP' };
    }

    // (5) On Track
    return { level: 'ok', text: getServiceDefaultOkSignal(s), hint: '' };
}

// Phase 103 — partition a service list into { urgent, watch, ok }, each row carrying its signal.
function computeServiceUrgencySignals(services) {
    const now = Date.now();
    const urgent = [], watch = [], ok = [];
    for (const s of services) {
        const signal = getServiceSignal(s, now);
        if (signal.level === 'urgent') urgent.push({ ...s, signal });
        else if (signal.level === 'watch') watch.push({ ...s, signal });
        else ok.push({ ...s, signal });
    }
    return { urgent, watch, ok };
}

// Phase 103 CONSTRAINT — billed% is NOT computable at render time (no billed data without a
// listener; D-05). Returns null so renderServiceFinancial shows tranche structure without a
// misleading filled bar. Mirror of projects.js computeBillingPct.
function computeServiceBillingPct(service) {
    return null;
}

// Phase 103 D-06 — stage-aware finance cell (4 display states). Mirror of projects.js renderFinancial.
function renderServiceFinancial(service) {
    const status = service.project_status;
    const pre = ['For Inspection', 'For Proposal', 'Proposal for Internal Approval', 'Proposal Under Client Review', 'For Revision'];
    const contracted = ['Client Approved', 'For Mobilization'];

    if (pre.includes(status)) {
        const val = service.budget ? `Est. ₱${formatCurrency(service.budget)}` : '—';
        return `<div class="fin-pre"><div class="fin-pre-amount">${val}</div><div class="fin-pre-label">Pre-contract</div></div>`;
    }
    if (contracted.includes(status)) {
        return `<div class="fin-ready"><div class="fin-ready-amount">₱${formatCurrency(service.contract_cost)}</div><div class="fin-ready-label">Contract signed · billing not started</div></div>`;
    }
    if (status === 'On-going') {
        const trancheCount = (service.collection_tranches || []).length;
        const sub = trancheCount > 0 ? `${trancheCount} tranches defined` : 'Billing in progress';
        const pct = computeServiceBillingPct(service);   // null this phase → empty track (no fake %)
        const fillW = pct == null ? 0 : pct;
        return `<div class="fin-active">
            <div class="fin-active-top"><span>₱${formatCurrency(service.contract_cost)}</span></div>
            <div class="mini-bar"><div class="mini-fill fill-blue" style="width:${fillW}%"></div></div>
            <div class="fin-active-sub">${sub}</div></div>`;
    }
    if (status === 'Completed') {
        const dlpState = getDlpState(service);
        const amount = `<div class="fin-done-amount" style="margin-top:4px;">₱${formatCurrency(service.contract_cost)}</div>`;
        if (dlpState === 'in-dlp')
            return `<div class="fin-done"><span class="portfolio-dlp-tag" style="background:#fef3c7;color:#92400e;">◑ In DLP</span>${amount}</div>`;
        if (dlpState === 'expired')
            return `<div class="fin-done"><span class="portfolio-dlp-tag" style="background:#fee2e2;color:#991b1b;">⚠ Retention Overdue</span>${amount}</div>`;
        if (dlpState === 'released')
            return `<div class="fin-done"><span class="portfolio-dlp-tag" style="background:#dcfce7;color:#166534;">✓ Fully Collected</span>${amount}</div>`;
        return `<div class="fin-done"><div class="fin-done-amount">₱${formatCurrency(service.contract_cost)}</div><div class="fin-done-label">Fully billed · 100% ✓</div></div>`;
    }
    if (status === 'Loss') {
        return `<div class="fin-loss"><div class="fin-loss-label">Lost engagement</div></div>`;
    }
    // Draft and any legacy/other status → pre-contract placeholder
    return `<div class="fin-pre"><div class="fin-pre-amount">—</div><div class="fin-pre-label">Pre-contract</div></div>`;
}

// Phase 103 D-03 — Browse All collapse persistence (services key, separate from projects).
// Completed, Loss AND Draft default-collapsed.
function getServiceCollapseState(key) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('browse-collapse-services') || '{}'); } catch (_) {}
    return saved[key] ?? (key === 'completed' || key === 'loss' || key === 'draft' || key === 'legacy');
}
function setServiceCollapseState(key, collapsed) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('browse-collapse-services') || '{}'); } catch (_) {}
    saved[key] = collapsed;
    localStorage.setItem('browse-collapse-services', JSON.stringify(saved));
}

// Phase 103 — service view-mode toggle: swap Feed / Browse containers, persist choice (D-04).
function vmSwitchService(mode) {
    const feed = document.getElementById('pdb-feed-svc');
    const browse = document.getElementById('pdb-browse-svc');
    if (!feed || !browse) return;
    feed.style.display   = mode === 'feed'   ? 'block' : 'none';
    browse.style.display = mode === 'browse' ? 'block' : 'none';
    document.getElementById('vm-feed-svc')?.classList.toggle('vm-on', mode === 'feed');
    document.getElementById('vm-browse-svc')?.classList.toggle('vm-on', mode === 'browse');
    localStorage.setItem('services-view-mode', mode);
    if (mode === 'browse') renderServiceBrowseAll();
}

// Phase 103 — portfolio dispatcher: applyServiceFilters() calls this instead of the flat-table
// renderer. Renders BOTH modes from filteredServices (already sub-tab + scope + filter narrowed),
// then restores the persisted mode (first-time default Feed — D-04).
function renderServicePortfolio() {
    renderServiceFeed();
    renderServiceBrowseAll();
    const saved = localStorage.getItem('services-view-mode') || 'feed';
    vmSwitchService(saved);
}

// Phase 103.1 D-04 — scoped ambient day-count for on-track stage-duration service rows (mirror of projects).
// "In {stage} · {d}d". Stage-duration statuses ONLY — never On-going and never terminal Completed/Loss.
function getServiceStageAmbient(s, now = Date.now()) {
    const STAGE_LABEL = {
        'For Proposal': 'proposal stage',
        'Proposal for Internal Approval': 'internal approval',
        'Proposal Under Client Review': 'client review',
        'For Revision': 'revision',
        'Client Approved': 'won · awaiting kickoff',
        'For Mobilization': 'mobilization',
        'For Inspection': 'inspection'
    };
    const label = STAGE_LABEL[s.project_status];
    if (!label) return '';
    const d = stageDaysInStageService(s, now);
    if (d == null) return '';
    return `In ${label} · ${Math.round(d)}d`;
}

// Phase 103 — shared service row builder for BOTH Feed and Browse rows (mirror of projects buildFeedRow).
// Derives the signal on demand if the row was not pre-tagged by computeServiceUrgencySignals.
function buildServiceRow(s) {
    const signal = s.signal || getServiceSignal(s, Date.now());
    const level = signal.level;
    const ambient = (signal.level === 'ok') ? getServiceStageAmbient(s) : '';   // Phase 103.1 D-04 — scoped ambient subtext
    const dlpState = getDlpState(s);
    const dlpClass = dlpState === 'in-dlp' ? 'dlp-amber' : dlpState === 'expired' ? 'dlp-red' : dlpState === 'released' ? 'dlp-green' : '';
    const detailParam = s.service_code || s.id;
    const codeDisplay = s.service_code || '—';
    const client = clientsData.find(c => c.id === s.client_id);
    const clientName = client ? client.company_name : (s.client_code || '—');
    const statusRaw = s.project_status || '';
    const statusDisplay = (statusRaw && !UNIFIED_STATUS_OPTIONS.includes(statusRaw))
        ? `<span style="color:#94a3b8;font-style:italic;">${escapeHTML(statusRaw)} (legacy)</span>`
        : escapeHTML(statusRaw);
    return `
        <div class="feed-row tier-${level} ${dlpClass}"
             onclick="window.location.hash = '#/services/detail/${escapeHTML(detailParam)}'">
            <div class="feed-row-main">
                <div class="feed-row-title">${escapeHTML(codeDisplay)}${s.service_name ? ' — ' + escapeHTML(s.service_name) : ''}</div>
                <div class="feed-row-sub">${escapeHTML(clientName)} · ${statusDisplay}</div>
                ${ambient ? `<div class="feed-row-ambient" style="color:#94a3b8;font-size:12px;margin-top:2px;">${escapeHTML(ambient)}</div>` : ''}
            </div>
            <div class="feed-row-signal tier-${level}">${escapeHTML(signal.text)}${signal.hint ? `<div class="feed-row-hint">${escapeHTML(signal.hint)}</div>` : ''}</div>
            <div class="feed-row-fin">${renderServiceFinancial(s)}</div>
        </div>`;
}

// Phase 103 — service Priority Feed over filteredServices (the sub-tab is the OUTER filter — D-01).
function renderServiceFeed() {
    const el = document.getElementById('pdb-feed-svc');
    if (!el) return;
    const { urgent, watch, ok } = computeServiceUrgencySignals(filteredServices);
    // Pull legacy-status rows out of the ok bucket so they don't mislabel as On Track.
    const legacy = ok.filter(s => isLegacyStatus(s.project_status));
    const okClean = ok.filter(s => !isLegacyStatus(s.project_status));
    const sections = [
        { tier: 'urgent', label: 'Needs Attention', icon: '🔴', rows: urgent,  hideWhenEmpty: true },
        { tier: 'watch',  label: 'Worth Watching',  icon: '🟠', rows: watch,   hideWhenEmpty: true },
        { tier: 'ok',     label: 'On Track',        icon: '🟢', rows: okClean, hideWhenEmpty: false },
        { tier: 'legacy', label: 'Legacy',          icon: '🗂️', rows: legacy,  hideWhenEmpty: true }
    ];
    el.innerHTML = sections.map(sec => {
        if (sec.hideWhenEmpty && sec.rows.length === 0) return '';
        const body = sec.rows.length
            ? sec.rows.map(buildServiceRow).join('')
            : '<div class="feed-empty">Nothing here</div>';
        return `
            <div class="feed-section tier-${sec.tier}">
                <div class="feed-section-header">${sec.icon} ${sec.label}
                    <span class="feed-section-count">${sec.rows.length}</span>
                </div>
                ${body}
            </div>`;
    }).join('') || '<div class="feed-empty">No services match the current filters.</div>';
}

// Phase 103 D-03 — service Browse All: 7 collapsible stage groups (incl. leading Draft) over the
// SAME filteredServices pool as the Feed. Rows reuse buildServiceRow → identical to Feed rows.
// Legacy group constant — mid-grey (#6b7280), distinct from the draft/inspection groups (#94a3b8).
// Membership is predicate-based (isLegacyStatus), not a fixed statuses[] list.
const SERVICE_LEGACY_GROUP = { key: 'legacy', label: 'Legacy / Unmapped', color: '#6b7280' };

function renderServiceBrowseAll() {
    const el = document.getElementById('pdb-browse-svc');
    if (!el) return;
    el.innerHTML = [...SERVICE_STAGE_GROUPS, SERVICE_LEGACY_GROUP].map(group => {
        const rows = (group.key === 'legacy'
            ? filteredServices.filter(s => isLegacyStatus(s.project_status))
            : filteredServices.filter(s => group.statuses.includes(s.project_status))
        ).sort((a, b) => (a.service_code || a.service_name || '').localeCompare(b.service_code || b.service_name || ''));
        const collapsed = getServiceCollapseState(group.key);
        const body = rows.length
            ? rows.map(buildServiceRow).join('')
            : '<div class="stage-group-empty">No services in this stage</div>';
        return `
            <div class="stage-group${collapsed ? ' collapsed' : ''}">
                <div class="stage-group-header" onclick="window.toggleServiceStageGroup('${group.key}')">
                    <span class="stage-group-color" style="background:${group.color}"></span>
                    <span class="stage-group-chevron">▾</span>
                    ${escapeHTML(group.label)}
                    <span class="stage-group-count">${rows.length}</span>
                </div>
                <div class="stage-group-body">${body}</div>
            </div>`;
    }).join('');
}

function toggleServiceStageGroup(key) {
    setServiceCollapseState(key, !getServiceCollapseState(key));
    renderServiceBrowseAll();
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

