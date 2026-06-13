/* ========================================
   PROJECTS VIEW
   Project management with CRUD operations
   ======================================== */

import { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot } from '../firebase.js';
import { showLoading, showToast, generateProjectCode, normalizePersonnel, syncPersonnelToAssignments, downloadCSV, escapeHTML, formatCurrency } from '../utils.js';
import { recordEditHistory } from '../edit-history.js';
import { createEngagement } from '../engagement-create.js';
import { renderTrancheBuilder, readTranchesFromDOM, addTranche, removeTranche, recalculateTranches } from '../tranche-builder.js';

// Global state
let projectsData = [];
let clientsData = [];
let usersData = [];  // Active users for personnel selection
let editingProject = null;
let selectedPersonnel = []; // Array of { id: string, name: string } for pill state
let editingProjectTranches = []; // Phase 85: populated from project.collection_tranches when editing; reset on cancel/submit
let currentPage = 1;
const itemsPerPage = 15;
let listeners = [];

// Filtering state
let allProjects = [];           // Unfiltered data from Firebase
let filteredProjects = [];      // Filtered subset for display
let activeStatusFilter = null;

// Status options
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

// Phase 103 D-07 — urgency thresholds (days). Named constants for post-launch tuning.
const URGENCY_THRESHOLDS = {
    PROPOSAL_STALE_DAYS: 14,      // Proposal Under Client Review
    INSPECTION_OVERDUE_DAYS: 30,  // For Inspection
    ONGOING_QUIET_DAYS: 7,        // On-going with no activity
    REVISION_DAYS: 5,             // For Revision
    MOBILIZATION_DAYS: 3          // For Mobilization
};

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

// Attach window functions
function attachWindowFunctions() {
    window.toggleAddProjectForm = toggleAddProjectForm;
    window.addProject = addProject;
    window.editProject = editProject;
    window.cancelEdit = cancelEdit;
    window.saveEdit = saveEdit;
    window.deleteProject = deleteProject;
    window.toggleProjectActive = toggleProjectActive;
    window.applyFilters = applyFilters;
    window.debouncedFilter = debouncedFilter;
    window.exportProjectsCSV = exportProjectsCSV;
    window.selectPersonnel = selectPersonnel;
    window.removePersonnel = removePersonnel;
    window.filterPersonnelDropdown = filterPersonnelDropdown;
    window.showPersonnelDropdown = showPersonnelDropdown;
    // Phase 85: tranche-builder helpers (shared module). NOTE: procurement.js (Phase 65 PO
    // tranche-builder) ALSO attaches the same window function names for its PO tranche UI.
    // Both implementations follow the same DOM contract (id="trancheBuilder_<scopeKey>"),
    // so whichever view is active "wins" — calls from either view's HTML route correctly
    // through the shared scopeKey parameter. Procurement's PO scopeKey = poId, projects' = 'projectForm'.
    window.addTranche = (scopeKey) => addTranche(scopeKey);
    window.removeTranche = (button, scopeKey) => removeTranche(button, scopeKey);
    window.recalculateTranches = (scopeKey) => recalculateTranches(scopeKey);
    window.handleScorecardClick = handleScorecardClick;
    window.vmSwitch = vmSwitch;   // Phase 103 — portfolio view-mode toggle
}

// Render view HTML
export function render(activeTab = null) {
    // Check edit permission
    const canEdit = window.canEditTab?.('projects');
    // IMPORTANT: Use strict equality to distinguish undefined (not loaded) from false (no permission)
    // canEdit === false -> no permission, hide edit controls
    // canEdit === undefined -> not loaded yet, show controls (backwards compatible)
    // canEdit === true -> has permission, show controls
    const showEditControls = canEdit !== false;

    // Check role for project creation (only super_admin and operations_admin)
    const user = window.getCurrentUser?.();
    const canCreateProject = user?.role === 'super_admin' || user?.role === 'operations_admin';

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
                    <h2>Project Management</h2>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-secondary" onclick="window.exportProjectsCSV()">Export CSV</button>
                        ${canCreateProject ? `
                            <button class="btn btn-primary" onclick="window.toggleAddProjectForm()">Add Project</button>
                        ` : ''}
                    </div>
                </div>

                <!-- Add Project Form -->
                <div id="addProjectForm" class="add-form" style="display: none;">
                    <h3 id="formTitle" style="margin-bottom: 1rem;">Add New Project</h3>

                    <div class="form-group">
                        <label>Client <span style="color:#64748b;font-size:0.85em;">(optional — assign later to issue project code)</span></label>
                        <select id="projectClient">
                            <option value="">-- Select Client (optional) --</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Project Name *</label>
                        <input type="text" id="projectName" required>
                    </div>

                    <div class="form-group">
                        <label>Location (Optional)</label>
                        <input type="text" id="projectLocation" placeholder="e.g., Manila, Cebu, Davao">
                    </div>

                    <div class="form-group">
                        <label>Status *</label>
                        <select id="projectStatus" required>
                            <option value="">-- Select Status --</option>
                            ${UNIFIED_STATUS_OPTIONS.map(s => `<option value="${s}">${s}</option>`).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Budget (Optional)</label>
                        <input type="number" id="projectBudget" min="0" step="0.01" placeholder="0.00">
                        <small class="form-hint">Leave blank if not applicable. Must be positive if provided.</small>
                    </div>

                    <div class="form-group">
                        <label>Contract Cost (Optional)</label>
                        <input type="number" id="contractCost" min="0" step="0.01" placeholder="0.00">
                        <small class="form-hint">Leave blank if not applicable. Must be positive if provided.</small>
                    </div>

                    <div class="form-group">
                        <label>Collection Tranches (Optional)</label>
                        <div id="collTrancheBuilderWrapper">
                            ${renderTrancheBuilder([], 'projectForm')}
                        </div>
                        <small class="form-hint">Define how the contract cost is split into billable tranches. Must sum to 100% if any tranches are provided. Required to bill collectibles against this project (Phase 85).</small>
                    </div>

                    <div class="form-group" style="position: relative;">
                        <label>Personnel *</label>
                        <div class="pill-input-container" id="personnelPillContainer"
                             onclick="document.getElementById('personnelSearchInput')?.focus()">
                            <input type="text"
                                   class="pill-search-input"
                                   id="personnelSearchInput"
                                   placeholder="Type name or email..."
                                   oninput="window.filterPersonnelDropdown(this.value)"
                                   onfocus="window.showPersonnelDropdown()"
                                   autocomplete="off">
                        </div>
                        <div class="pill-dropdown" id="personnelDropdown" style="display: none;"></div>
                        <small class="form-hint">Select one or more active users. Required for new projects.</small>
                    </div>

                    <div class="form-actions">
                        <button class="btn btn-secondary" onclick="window.toggleAddProjectForm()">Cancel</button>
                        <button class="btn btn-success" id="submitProjectBtn" onclick="window.addProject()">Add Project</button>
                    </div>
                </div>

                <!-- Status Scorecard Strip -->
                <div id="projectScorecards" class="project-scorecards">
                    ${UNIFIED_STATUS_OPTIONS.map(s => `
                    <div class="project-scorecard-card" data-status="${s}" onclick="window.handleScorecardClick('${s}'); event.stopPropagation()">
                        <span class="scorecard-label">${s}</span>
                        <span class="scorecard-count" id="scorecard-count-${s.replace(/\s+/g, '_')}">—</span>
                    </div>`).join('')}
                    <div class="project-scorecard-card project-scorecard-card--total" data-status="__total__" onclick="window.handleScorecardClick(null); event.stopPropagation()">
                        <span class="scorecard-label">Total</span>
                        <span class="scorecard-count" id="scorecard-count-total">—</span>
                    </div>
                </div>

                <!-- Filter Bar -->
                <div class="filter-bar" style="display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: #f8fafc; border-radius: 0.5rem;">
                    <div class="form-group" style="margin: 0; flex: 1; min-width: 150px;">
                        <label style="font-size: 0.875rem; margin-bottom: 0.25rem;">Client</label>
                        <select id="clientFilter" onchange="window.applyFilters()" style="width: 100%;">
                            <option value="">All Clients</option>
                        </select>
                    </div>

                    <div class="form-group" style="margin: 0; flex: 2; min-width: 200px;">
                        <label style="font-size: 0.875rem; margin-bottom: 0.25rem;">Search</label>
                        <input type="text"
                               id="searchInput"
                               placeholder="Search by code or name..."
                               oninput="window.debouncedFilter()"
                               style="width: 100%;">
                    </div>
                </div>

                <!-- Phase 103 — Portfolio view-mode toggle + dual render containers (replaces flat table) -->
                <div class="vm-toggle">
                    <button class="vm-btn" id="vm-feed" onclick="window.vmSwitch('feed')">🔥 Priority Feed</button>
                    <button class="vm-btn" id="vm-browse" onclick="window.vmSwitch('browse')">≡ Browse All</button>
                </div>
                <div id="pdb-feed" class="pdb-mode"></div>
                <div id="pdb-browse" class="pdb-mode" style="display:none;"></div>
            </div>
        </div>
    `;
}

// Initialize view
export async function init(activeTab = null) {
    attachWindowFunctions();

    // Listen for permission changes and re-render the portfolio (Feed + Browse All)
    const permissionChangeHandler = () => {
        renderPortfolio();
    };
    window.addEventListener('permissionsChanged', permissionChangeHandler);

    // Store handler for cleanup
    if (!window._projectsPermissionHandler) {
        window._projectsPermissionHandler = permissionChangeHandler;
    }

    // Phase 7: Re-filter when assignments change
    const assignmentChangeHandler = () => {
        applyFilters();
    };
    window.addEventListener('assignmentsChanged', assignmentChangeHandler);
    if (!window._projectsAssignmentHandler) {
        window._projectsAssignmentHandler = assignmentChangeHandler;
    }

    // Click-outside handler to close personnel dropdown
    const clickOutsideHandler = (e) => {
        const container = document.getElementById('personnelPillContainer');
        const dropdown = document.getElementById('personnelDropdown');
        if (dropdown && container && !container.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    };
    document.addEventListener('mousedown', clickOutsideHandler);
    window._personnelClickOutside = clickOutsideHandler;

    window._scorecardClickOutside = (e) => {
        const strip = document.getElementById('projectScorecards');
        if (!strip) return;
        if (!strip.contains(e.target)) {
            activeStatusFilter = null;
            applyFilters();
        }
    };
    document.addEventListener('click', window._scorecardClickOutside);

    await loadClients();
    await loadActiveUsers();
    await loadProjects();
}

/**
 * Export the currently-filtered projects list as a CSV file.
 */
function exportProjectsCSV() {
    if (filteredProjects.length === 0) {
        showToast('No projects to export', 'info');
        return;
    }
    const headers = ['Code', 'Name', 'Client', 'Status', 'Active'];
    const rows = filteredProjects.map(project => {
        const client = clientsData.find(c => c.id === project.client_id);
        const clientName = client ? client.company_name : (project.client_code || '');
        return [
            project.project_code || '',
            project.project_name || '',
            clientName,
            project.project_status || '',
            project.active ? 'Yes' : 'No'
        ];
    });
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(headers, rows, `projects-${date}.csv`);
}
window.exportProjectsCSV = exportProjectsCSV;

// Cleanup
export async function destroy() {
    // Remove permission change listener
    if (window._projectsPermissionHandler) {
        window.removeEventListener('permissionsChanged', window._projectsPermissionHandler);
        delete window._projectsPermissionHandler;
    }

    // Phase 7: Remove assignment change listener
    if (window._projectsAssignmentHandler) {
        window.removeEventListener('assignmentsChanged', window._projectsAssignmentHandler);
        delete window._projectsAssignmentHandler;
    }

    listeners.forEach(unsubscribe => unsubscribe?.());
    listeners = [];
    projectsData = [];
    clientsData = [];
    usersData = [];
    editingProject = null;
    currentPage = 1;
    allProjects = [];
    filteredProjects = [];

    // Clean up personnel pill state
    if (window._personnelClickOutside) {
        document.removeEventListener('mousedown', window._personnelClickOutside);
        delete window._personnelClickOutside;
    }
    selectedPersonnel = [];

    if (window._scorecardClickOutside) {
        document.removeEventListener('click', window._scorecardClickOutside);
        delete window._scorecardClickOutside;
    }
    activeStatusFilter = null;

    delete window.toggleAddProjectForm;
    delete window.addProject;
    delete window.editProject;
    delete window.cancelEdit;
    delete window.saveEdit;
    delete window.deleteProject;
    delete window.toggleProjectActive;
    delete window.applyFilters;
    delete window.debouncedFilter;
    delete window.exportProjectsCSV;
    delete window.vmSwitch;   // Phase 103
    delete window.selectPersonnel;
    delete window.removePersonnel;
    delete window.filterPersonnelDropdown;
    delete window.showPersonnelDropdown;
    // Phase 85: tranche-builder window helpers. NOTE: procurement.js attaches the same
    // names — see comment in attachWindowFunctions(). Whichever view destroys last
    // leaves a clean slate; whichever destroys first gets re-attached on next mount.
    delete window.addTranche;
    delete window.removeTranche;
    delete window.recalculateTranches;
    delete window.handleScorecardClick;
    editingProjectTranches = [];
}

// Load clients with real-time listener
async function loadClients() {
    try {
        const listener = onSnapshot(collection(db, 'clients'), (snapshot) => {
            clientsData = [];
            snapshot.forEach(doc => {
                clientsData.push({ id: doc.id, ...doc.data() });
            });

            clientsData.sort((a, b) => a.company_name.localeCompare(b.company_name));

            renderClientDropdown();
        });

        listeners.push(listener);
    } catch (error) {
        console.error('[Projects] Error loading clients:', error);
    }
}

// Load active users for personnel datalist
async function loadActiveUsers() {
    // Personnel pill selector is an edit feature - skip for view-only users
    // Firestore rules only allow super_admin/operations_admin to list users
    const canEdit = window.canEditTab?.('projects');
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
            console.warn('[Projects] Users listener error (likely permissions):', error.message);
        });

        listeners.push(listener);
    } catch (error) {
        console.error('[Projects] Error loading users:', error);
    }
}

// Pill rendering and interaction functions
function renderPills() {
    const container = document.getElementById('personnelPillContainer');
    if (!container) return;

    const searchInput = document.getElementById('personnelSearchInput');
    const searchValue = searchInput?.value || '';

    const pillsHtml = selectedPersonnel.map(user => `
        <span class="personnel-pill ${user.id ? '' : 'legacy'}" data-user-id="${user.id || ''}">
            ${user.name}
            <button type="button" class="pill-remove"
                onmousedown="event.preventDefault(); window.removePersonnel('${user.id || ''}', '${user.name.replace(/'/g, "\\'")}')">&times;</button>
        </span>
    `).join('');

    container.innerHTML = `
        ${pillsHtml}
        <input type="text"
               class="pill-search-input"
               id="personnelSearchInput"
               placeholder="${selectedPersonnel.length === 0 ? 'Type name or email...' : ''}"
               value="${searchValue}"
               oninput="window.filterPersonnelDropdown(this.value)"
               onfocus="window.showPersonnelDropdown()"
               autocomplete="off">
    `;

    const newSearchInput = document.getElementById('personnelSearchInput');
    if (document.activeElement === container || searchValue) {
        newSearchInput?.focus();
    }
}

function filterPersonnelDropdown(searchText) {
    const dropdown = document.getElementById('personnelDropdown');
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
             onmousedown="event.preventDefault(); window.selectPersonnel('${user.id}', '${user.full_name.replace(/'/g, "\\'")}')">
            <strong>${escapeHTML(user.full_name)}</strong>
            <span style="color: #64748b; margin-left: 0.5rem;">${escapeHTML(user.email)}</span>
        </div>
    `).join('');

    dropdown.style.display = 'block';
}

function showPersonnelDropdown() {
    const searchInput = document.getElementById('personnelSearchInput');
    if (searchInput?.value?.trim()) {
        filterPersonnelDropdown(searchInput.value);
    }
}

function selectPersonnel(userId, userName) {
    if (selectedPersonnel.some(u => u.id === userId)) return;

    selectedPersonnel.push({ id: userId, name: userName });
    renderPills();

    const searchInput = document.getElementById('personnelSearchInput');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    const dropdown = document.getElementById('personnelDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

function removePersonnel(userId, userName) {
    if (userId) {
        selectedPersonnel = selectedPersonnel.filter(u => u.id !== userId);
    } else {
        selectedPersonnel = selectedPersonnel.filter(u => u.name !== userName);
    }
    renderPills();
}

// Render client dropdown
function renderClientDropdown() {
    const select = document.getElementById('projectClient');
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
    const filterSelect = document.getElementById('clientFilter');
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
function toggleAddProjectForm() {
    // Guard: check edit permission
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return;
    }

    // Guard: check role for project creation
    const user = window.getCurrentUser?.();
    if (!user || (user.role !== 'super_admin' && user.role !== 'operations_admin')) {
        showToast('Only Operations Admin and Super Admin can create projects', 'error');
        return;
    }

    const form = document.getElementById('addProjectForm');
    if (!form) return;

    if (form.style.display === 'none') {
        editingProject = null;
        form.style.display = 'block';
        document.getElementById('formTitle').textContent = 'Add New Project';
        document.getElementById('submitProjectBtn').textContent = 'Add Project';
        document.getElementById('submitProjectBtn').onclick = window.addProject;

        // Clear form
        document.getElementById('projectClient').value = '';
        document.getElementById('projectName').value = '';
        document.getElementById('projectLocation').value = '';
        document.getElementById('projectStatus').value = '';
        document.getElementById('projectBudget').value = '';
        document.getElementById('contractCost').value = '';

        // Clear personnel pills
        selectedPersonnel = [];
        renderPills();

        document.getElementById('projectName').focus();
    } else {
        form.style.display = 'none';
        editingProject = null;
        renderPortfolio();
    }
}

// Add project
async function addProject() {
    // Guard: check edit permission
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return;
    }

    // Guard: check role for project creation
    const user = window.getCurrentUser?.();
    if (!user || (user.role !== 'super_admin' && user.role !== 'operations_admin')) {
        showToast('Only Operations Admin and Super Admin can create projects', 'error');
        return;
    }

    const clientSelect = document.getElementById('projectClient');
    const clientId = clientSelect.value;
    const clientCode = clientSelect.selectedOptions[0]?.getAttribute('data-code');
    const project_name = document.getElementById('projectName').value.trim();
    const location = document.getElementById('projectLocation').value.trim();
    const project_status = document.getElementById('projectStatus').value;
    const budgetVal = document.getElementById('projectBudget').value;
    const contractVal = document.getElementById('contractCost').value;

    // Validate required fields
    // Phase 78 D-01/D-03: client is now optional (clientless projects allowed for lead-stage TR support)
    if (!project_name || !project_status) {
        showToast('Please fill in all required fields', 'error');
        return;
    }

    // Validate personnel selection
    if (selectedPersonnel.length === 0) {
        showToast('Personnel field is required - select at least one user', 'error');
        return;
    }

    // Validate optional positive numbers (must be > 0, not just >= 0)
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
        showToast('Invalid project status', 'error');
        return;
    }

    // Phase 85 D-09: read + validate collection_tranches from form
    const collectionTranches = readTranchesFromDOM('projectForm');
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
        const { code: project_code } = await createEngagement({
            type: 'project',
            clientId: clientId || null,
            clientCode: clientCode || null,
            name: project_name,
            location: location || null,
            projectStatus: project_status,
            budget,
            contractCost: contract_cost,
            personnel: selectedPersonnel,
            collectionTranches: finalTranches,
            onAfterCreate: ({ code }) => {
                // Phase 78 D-04: skip personnel sync when project_code is null (clientless project)
                if (code) {
                    syncPersonnelToAssignments(code, [], selectedPersonnel.map(u => u.id).filter(Boolean))
                        .catch(err => console.error('[Projects] Assignment sync failed:', err));
                }
            }
        });

        showToast(`Project "${project_name}" created successfully${project_code ? '' : ' (no code yet — assign a client to issue code)'}!`, 'success');
        toggleAddProjectForm();
    } catch (error) {
        console.error('[Projects] Error adding project:', error);
        showToast('Failed to create project', 'error');
    } finally {
        showLoading(false);
    }
}

// Render status scorecard counts and active highlight
function renderScorecards(baseProjects) {
    for (const s of UNIFIED_STATUS_OPTIONS) {
        const count = baseProjects.filter(p => p.project_status === s).length;
        const el = document.getElementById(`scorecard-count-${s.replace(/\s+/g, '_')}`);
        if (el) el.textContent = count;
    }
    const totalEl = document.getElementById('scorecard-count-total');
    if (totalEl) totalEl.textContent = baseProjects.length;

    document.querySelectorAll('.project-scorecard-card').forEach(card => {
        card.classList.remove('project-scorecard-card--active');
    });
    const activeKey = activeStatusFilter || '__total__';
    document.querySelector(`.project-scorecard-card[data-status="${activeKey}"]`)
        ?.classList.add('project-scorecard-card--active');
}

// Handle scorecard card click — toggle filter
function handleScorecardClick(status) {
    if (status === null || status === activeStatusFilter) {
        activeStatusFilter = null;
    } else {
        activeStatusFilter = status;
    }
    applyFilters();
}

// Apply filters
function applyFilters() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const clientFilter = document.getElementById('clientFilter')?.value || '';

    // Phase 7: Scope to assigned projects for operations_user
    // getAssignedProjectCodes() returns null (no filter) for all roles except
    // operations_user without all_projects. Returns [] if zero assignments.
    const assignedCodes = window.getAssignedProjectCodes?.();
    let scopedProjects = allProjects;
    if (assignedCodes !== null) {
        // Filter to assigned projects only. Defensively include any project that
        // lacks a project_code field (legacy pre-Phase-4 data) so they are never
        // accidentally hidden.
        scopedProjects = allProjects.filter(project =>
            !project.project_code || assignedCodes.includes(project.project_code)
        );
    }

    filteredProjects = scopedProjects.filter(project => {
        // Search filter (OR across code and name)
        const matchesSearch = !searchTerm ||
            (project.project_code && project.project_code.toLowerCase().includes(searchTerm)) ||
            (project.project_name && project.project_name.toLowerCase().includes(searchTerm));

        // Status filter (exact match)
        const matchesProjectStatus = !activeStatusFilter ||
            project.project_status === activeStatusFilter;

        // Client filter (match by ID)
        const matchesClient = !clientFilter ||
            project.client_id === clientFilter;

        // AND logic - all conditions must be true
        return matchesSearch && matchesProjectStatus && matchesClient;
    });

    // Phase 103: the new renderers impose their own ordering (Feed partitions by urgency,
    // Browse All groups by stage), so no global sort of filteredProjects is needed (W-3).
    renderPortfolio();
    renderScorecards(scopedProjects);
}

// Create debounced filter
const debouncedFilter = debounce(applyFilters, 300);

// Load projects with real-time listener
async function loadProjects() {
    try {
        const listener = onSnapshot(collection(db, 'projects'), (snapshot) => {
            allProjects = [];
            snapshot.forEach(doc => {
                allProjects.push({ id: doc.id, ...doc.data() });
            });

            // Apply filters (which will also sort and render)
            applyFilters();
        });

        listeners.push(listener);
    } catch (error) {
        console.error('[Projects] Error loading projects:', error);
    }
}

// Render projects table
// Phase 102 Plan 05 — DLP state machine mirroring the D-16 contract from project-detail.js.
// Drives the portfolio-table 4-state DLP visuals (left-accent border + status tag).
// NOTE: project-detail's copy gained an extra isRetentionCollected()->'released' short-circuit
// (commit 9229c21) that needs per-project collectible payment records. The portfolio table is
// render-only and does NOT load collectible docs (Plan 05 must-have: no new listener), so that
// auto-detect branch is intentionally omitted here. retention_released_at — set by Finance via
// Plan 04's Record Release — is the canonical 'released' signal honored by both surfaces.
function getDlpState(project) {
    if (!project || !project.dlp_months || project.project_status !== 'Completed') return 'active';
    if (project.retention_released_at) return 'released';
    if (Date.now() > new Date(project.dlp_expires_at || null).getTime()) return 'expired';
    return 'in-dlp';
}

/* ========================================
   Phase 103 — Portfolio redesign helpers (Plan 02)
   Shared computation layer for Priority Feed (this plan) + Browse All (Plan 03).
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

// Phase 103 D-07 — a status-appropriate "On Track" phrase for the default ok signal.
function getDefaultOkSignal(p) {
    switch (p.project_status) {
        case 'On-going':   return 'On track';
        case 'Completed':  return getDlpState(p) === 'released' ? 'Fully collected' : 'Completed';
        case 'Loss':       return 'Lost engagement';
        default:           return p.project_status || '—';
    }
}

// Phase 103 D-07/D-08 — urgency signal for a project. Returns { level, text, hint }.
// "Days in stage" approximated by days since updated_at (the only signal stored, D-08).
function getProjectSignal(p, now) {
    const status = p.project_status;
    const ms = normalizeUpdatedAt(p.updated_at);
    const d = ms == null ? null : (now - ms) / 86400000;   // days; null → skip staleness checks
    const dlp = getDlpState(p);

    // Needs Attention (urgent)
    if (dlp === 'expired')
        return { level: 'urgent', text: 'Retention release overdue', hint: 'DLP expired — retention not yet released' };
    if (d != null && status === 'Proposal Under Client Review' && d > URGENCY_THRESHOLDS.PROPOSAL_STALE_DAYS)
        return { level: 'urgent', text: `Proposal stale — ${Math.round(d)}d`, hint: "Client hasn't responded" };
    if (d != null && status === 'For Inspection' && d > URGENCY_THRESHOLDS.INSPECTION_OVERDUE_DAYS)
        return { level: 'urgent', text: `Inspection overdue — ${Math.round(d)}d`, hint: 'No progress since assigned' };
    if (d != null && status === 'On-going' && d > URGENCY_THRESHOLDS.ONGOING_QUIET_DAYS)
        return { level: 'urgent', text: `No activity in ${Math.round(d)} days`, hint: 'On-going project has gone quiet' };

    // Worth Watching (watch)
    if (d != null && status === 'For Revision' && d > URGENCY_THRESHOLDS.REVISION_DAYS)
        return { level: 'watch', text: `Revision requested — ${Math.round(d)}d`, hint: 'Expected turnaround 3-5 days' };
    if (d != null && status === 'For Mobilization' && d > URGENCY_THRESHOLDS.MOBILIZATION_DAYS)
        return { level: 'watch', text: 'Contract signed, not mobilized', hint: `${Math.round(d)}d since For Mobilization` };
    // Forward hook (inert this phase — billed% not computable without a listener; see computeBillingPct / D-07):
    // const billedPct = computeBillingPct(p);
    // if (billedPct != null && billedPct >= 86 && billedPct < 100)
    //     return { level: 'watch', text: `${billedPct}% billed — final billing due`, hint: 'Last tranche not yet requested' };

    // On Track (ok)
    if (dlp === 'in-dlp')
        return { level: 'ok', text: 'In defect liability period', hint: 'Retention held pending DLP' };
    return { level: 'ok', text: getDefaultOkSignal(p), hint: '' };
}

// Phase 103 — partition a project list into { urgent, watch, ok }, each row carrying its signal.
function computeUrgencySignals(projects) {
    const now = Date.now();
    const urgent = [], watch = [], ok = [];
    for (const p of projects) {
        const signal = getProjectSignal(p, now);
        if (signal.level === 'urgent') urgent.push({ ...p, signal });
        else if (signal.level === 'watch') watch.push({ ...p, signal });
        else ok.push({ ...p, signal });
    }
    return { urgent, watch, ok };
}

// Phase 103 CONSTRAINT — billed% is NOT computable at render time. collection_tranches stores only
// { label, percentage, is_retention } and does NOT record which tranches are billed (that lives in
// billing_requests/collectibles, which the portfolio MUST NOT load — no new listener, D-05). Returns
// null so renderFinancial shows tranche structure without a misleading filled bar. A future
// billing-aware phase (with a listener) can compute a true paid% here.
function computeBillingPct(project) {
    return null;
}

// Phase 103 D-06 — stage-aware finance cell (4 display states). Reuses the Plan-01 .fin-* classes
// and the Phase 102 .portfolio-dlp-tag visuals (via getDlpState) for the Completed branch.
function renderFinancial(project) {
    const status = project.project_status;
    const pre = ['For Inspection', 'For Proposal', 'Proposal for Internal Approval', 'Proposal Under Client Review', 'For Revision'];
    const contracted = ['Client Approved', 'For Mobilization'];

    if (pre.includes(status)) {
        const val = project.budget ? `Est. ₱${formatCurrency(project.budget)}` : '—';
        return `<div class="fin-pre"><div class="fin-pre-amount">${val}</div><div class="fin-pre-label">Pre-contract</div></div>`;
    }
    if (contracted.includes(status)) {
        return `<div class="fin-ready"><div class="fin-ready-amount">₱${formatCurrency(project.contract_cost)}</div><div class="fin-ready-label">Contract signed · billing not started</div></div>`;
    }
    if (status === 'On-going') {
        const trancheCount = (project.collection_tranches || []).length;
        const sub = trancheCount > 0 ? `${trancheCount} tranches defined` : 'Billing in progress';
        const pct = computeBillingPct(project);   // null this phase → empty track (no fake %)
        const fillW = pct == null ? 0 : pct;
        return `<div class="fin-active">
            <div class="fin-active-top"><span>₱${formatCurrency(project.contract_cost)}</span></div>
            <div class="mini-bar"><div class="mini-fill fill-blue" style="width:${fillW}%"></div></div>
            <div class="fin-active-sub">${sub}</div></div>`;
    }
    if (status === 'Completed') {
        const dlpState = getDlpState(project);
        const amount = `<div class="fin-done-amount" style="margin-top:4px;">₱${formatCurrency(project.contract_cost)}</div>`;
        if (dlpState === 'in-dlp')
            return `<div class="fin-done"><span class="portfolio-dlp-tag" style="background:#fef3c7;color:#92400e;">◑ In DLP</span>${amount}</div>`;
        if (dlpState === 'expired')
            return `<div class="fin-done"><span class="portfolio-dlp-tag" style="background:#fee2e2;color:#991b1b;">⚠ Retention Overdue</span>${amount}</div>`;
        if (dlpState === 'released')
            return `<div class="fin-done"><span class="portfolio-dlp-tag" style="background:#dcfce7;color:#166534;">✓ Fully Collected</span>${amount}</div>`;
        return `<div class="fin-done"><div class="fin-done-amount">₱${formatCurrency(project.contract_cost)}</div><div class="fin-done-label">Fully billed · 100% ✓</div></div>`;
    }
    if (status === 'Loss') {
        return `<div class="fin-loss"><div class="fin-loss-label">Lost engagement</div></div>`;
    }
    return `<div class="fin-pre"><div class="fin-pre-amount">—</div><div class="fin-pre-label">Pre-contract</div></div>`;
}

// Phase 103 — view-mode toggle: swap the Priority Feed / Browse All containers, persist choice (D-04).
function vmSwitch(mode) {
    const feed = document.getElementById('pdb-feed');
    const browse = document.getElementById('pdb-browse');
    if (!feed || !browse) return;
    feed.style.display   = mode === 'feed'   ? 'block' : 'none';
    browse.style.display = mode === 'browse' ? 'block' : 'none';
    document.getElementById('vm-feed')?.classList.toggle('vm-on', mode === 'feed');
    document.getElementById('vm-browse')?.classList.toggle('vm-on', mode === 'browse');
    localStorage.setItem('projects-view-mode', mode);
    if (mode === 'browse') renderBrowseAll();   // Plan 03 supplies the real impl; placeholder until then
}

// Phase 103 — portfolio dispatcher: applyFilters() calls this instead of the old flat-table renderer.
// Renders BOTH modes from filteredProjects, then restores the persisted mode (default Feed for
// first-time users — D-04).
function renderPortfolio() {
    renderPriorityFeed();
    renderBrowseAll();   // placeholder until Plan 03 replaces it
    const saved = localStorage.getItem('projects-view-mode') || 'feed';
    vmSwitch(saved);
}

// Phase 103 — Priority Feed (Option D, default). Three urgency sections over filteredProjects.
// Confirm-in-plan resolution: HIDE empty Needs Attention / Worth Watching; ALWAYS show On Track.
function renderPriorityFeed() {
    const el = document.getElementById('pdb-feed');
    if (!el) return;
    const { urgent, watch, ok } = computeUrgencySignals(filteredProjects);
    const sections = [
        { tier: 'urgent', label: 'Needs Attention', icon: '🔴', rows: urgent, hideWhenEmpty: true },
        { tier: 'watch',  label: 'Worth Watching',  icon: '🟠', rows: watch,  hideWhenEmpty: true },
        { tier: 'ok',     label: 'On Track',        icon: '🟢', rows: ok,     hideWhenEmpty: false }
    ];
    el.innerHTML = sections.map(sec => {
        if (sec.hideWhenEmpty && sec.rows.length === 0) return '';
        const body = sec.rows.length
            ? sec.rows.map(buildFeedRow).join('')
            : '<div class="feed-empty">Nothing here</div>';
        return `
            <div class="feed-section tier-${sec.tier}">
                <div class="feed-section-header">${sec.icon} ${sec.label}
                    <span class="feed-section-count">${sec.rows.length}</span>
                </div>
                ${body}
            </div>`;
    }).join('') || '<div class="feed-empty">No projects match the current filters.</div>';
}

// Phase 103 — shared row builder for BOTH Feed rows and Browse All rows (Plan 03 reuses this).
// Derives the signal on demand if the row was not pre-tagged by computeUrgencySignals (Browse path).
function buildFeedRow(p) {
    const signal = p.signal || getProjectSignal(p, Date.now());
    const level = signal.level;
    const dlpState = getDlpState(p);
    const dlpClass = dlpState === 'in-dlp' ? 'dlp-amber' : dlpState === 'expired' ? 'dlp-red' : dlpState === 'released' ? 'dlp-green' : '';
    const detailParam = p.project_code || p.id;
    const codeDisplay = p.project_code || '—';
    const client = clientsData.find(c => c.id === p.client_id);
    const clientName = client ? client.company_name : (p.client_code || '—');
    const statusRaw = p.project_status || '';
    const statusDisplay = (statusRaw && !UNIFIED_STATUS_OPTIONS.includes(statusRaw))
        ? `<span style="color:#94a3b8;font-style:italic;">${escapeHTML(statusRaw)} (legacy)</span>`
        : escapeHTML(statusRaw);
    return `
        <div class="feed-row tier-${level} ${dlpClass}"
             onclick="window.location.hash = '#/projects/detail/${escapeHTML(detailParam)}'">
            <div class="feed-row-main">
                <div class="feed-row-title">${escapeHTML(codeDisplay)}${p.project_name ? ' — ' + escapeHTML(p.project_name) : ''}</div>
                <div class="feed-row-sub">${escapeHTML(clientName)} · ${statusDisplay}</div>
            </div>
            <div class="feed-row-signal tier-${level}">${escapeHTML(signal.text)}${signal.hint ? `<div class="feed-row-hint">${escapeHTML(signal.hint)}</div>` : ''}</div>
            <div class="feed-row-fin">${renderFinancial(p)}</div>
        </div>`;
}

// Plan 03: Browse All (stage-grouped collapsible) renderer goes here — replaces this placeholder.
function renderBrowseAll() {
    const el = document.getElementById('pdb-browse');
    if (el) el.innerHTML = '<div style="padding:1rem;color:#94a3b8;">Browse All — implemented in Plan 03.</div>';
}

// Edit project
function editProject(projectId) {
    // Guard: check edit permission
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return;
    }

    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;

    editingProject = projectId;

    // Show form
    const form = document.getElementById('addProjectForm');
    form.style.display = 'block';
    document.getElementById('formTitle').textContent = 'Edit Project';
    document.getElementById('submitProjectBtn').textContent = 'Save Changes';
    document.getElementById('submitProjectBtn').onclick = window.saveEdit;

    // Populate form
    document.getElementById('projectClient').value = project.client_id;
    document.getElementById('projectName').value = project.project_name;
    document.getElementById('projectLocation').value = project.location || '';
    document.getElementById('projectStatus').value = project.project_status;
    document.getElementById('projectBudget').value = project.budget || '';
    document.getElementById('contractCost').value = project.contract_cost || '';

    // Phase 85: rebuild tranche editor with existing tranches
    editingProjectTranches = Array.isArray(project.collection_tranches) ? project.collection_tranches : [];
    const trancheWrapper = document.getElementById('collTrancheBuilderWrapper');
    if (trancheWrapper) {
        trancheWrapper.innerHTML = renderTrancheBuilder(editingProjectTranches, 'projectForm');
    }

    // Populate pills from existing personnel data (handles all legacy formats)
    const normalized = normalizePersonnel(project);
    selectedPersonnel = [];
    for (let i = 0; i < normalized.names.length; i++) {
        selectedPersonnel.push({
            id: normalized.userIds[i] || '',
            name: normalized.names[i]
        });
    }
    renderPills();
}

// Cancel edit
function cancelEdit() {
    toggleAddProjectForm();
}

// Save edit
async function saveEdit() {
    // Guard: check edit permission
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return;
    }

    if (!editingProject) return;

    const clientSelect = document.getElementById('projectClient');
    const clientId = clientSelect.value;
    const clientCode = clientSelect.selectedOptions[0]?.getAttribute('data-code');
    const project_name = document.getElementById('projectName').value.trim();
    const location = document.getElementById('projectLocation').value.trim();
    const project_status = document.getElementById('projectStatus').value;
    const budgetVal = document.getElementById('projectBudget').value;
    const contractVal = document.getElementById('contractCost').value;

    // Build personnel payload from pill state
    const personnelUpdate = {
        personnel_user_ids: selectedPersonnel.map(u => u.id).filter(Boolean),
        personnel_names: selectedPersonnel.map(u => u.name),
        personnel_user_id: null,
        personnel_name: null,
        personnel: null
    };

    // Validate required fields
    if (!clientId || !project_name || !project_status) {
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
        showToast('Invalid project status', 'error');
        return;
    }

    // Capture old personnel BEFORE save for sync diff
    const existingProject = allProjects.find(p => p.id === editingProject);
    const oldNormalized = normalizePersonnel(existingProject);
    const oldUserIds = oldNormalized.userIds;

    // Phase 85 D-09: read + validate collection_tranches
    const collectionTranches = readTranchesFromDOM('projectForm');
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
    const oldTranchesJson = JSON.stringify(existingProject.collection_tranches || []);
    const newTranchesJson = JSON.stringify(finalTranches);
    if (oldTranchesJson !== newTranchesJson && existingProject.project_code) {
        try {
            const existingColl = await getDocs(
                query(collection(db, 'collectibles'), where('project_code', '==', existingProject.project_code))
            );
            if (existingColl.size > 0) {
                const ok = confirm(
                    `This project has ${existingColl.size} existing collectible(s). ` +
                    `Existing collectibles keep their original tranche label and amount — only future collectibles will use the new tranches. Continue?`
                );
                if (!ok) {
                    return;
                }
            }
        } catch (queryErr) {
            console.error('[Projects] Existing-collectibles check failed:', queryErr);
            // Non-blocking — proceed without the warning if Firestore query fails
        }
    }

    showLoading(true);

    try {
        const projectRef = doc(db, 'projects', editingProject);
        await updateDoc(projectRef, {
            project_name,
            location: location || null,
            client_id: clientId,
            client_code: clientCode,
            project_status,
            budget,
            contract_cost,
            ...personnelUpdate,
            collection_tranches: finalTranches,  // Phase 85 D-09: always-written, [] if user cleared
            updated_at: new Date().toISOString()
        });

        // Build diff for edit history
        const editChanges = [];
        if (existingProject.project_name !== project_name) {
            editChanges.push({ field: 'project_name', old_value: existingProject.project_name, new_value: project_name });
        }
        if (existingProject.client_code !== clientCode) {
            editChanges.push({ field: 'client_code', old_value: existingProject.client_code, new_value: clientCode });
        }
        const oldLocation = existingProject.location || '';
        if (oldLocation !== (location || '')) {
            editChanges.push({ field: 'location', old_value: oldLocation || null, new_value: location || null });
        }
        if (existingProject.project_status !== project_status) {
            editChanges.push({ field: 'project_status', old_value: existingProject.project_status, new_value: project_status });
        }
        const oldBudget = existingProject.budget != null ? parseFloat(existingProject.budget) : null;
        if (oldBudget !== budget) {
            editChanges.push({ field: 'budget', old_value: oldBudget, new_value: budget });
        }
        const oldContract = existingProject.contract_cost != null ? parseFloat(existingProject.contract_cost) : null;
        if (oldContract !== contract_cost) {
            editChanges.push({ field: 'contract_cost', old_value: oldContract, new_value: contract_cost });
        }
        // Phase 85 D-09: record collection_tranches change in edit history
        if (oldTranchesJson !== newTranchesJson) {
            editChanges.push({ field: 'collection_tranches', old_value: oldTranchesJson, new_value: newTranchesJson });
        }
        // Check personnel changes
        const oldPersonnelNames = (existingProject.personnel_names || []).sort().join(',');
        const newPersonnelNames = selectedPersonnel.map(u => u.name).sort().join(',');
        if (oldPersonnelNames !== newPersonnelNames) {
            editChanges.push({
                field: 'personnel',
                old_value: existingProject.personnel_names?.join(', ') || '(none)',
                new_value: selectedPersonnel.map(u => u.name).join(', ') || '(none)'
            });
        }
        // Only record if something actually changed
        if (editChanges.length > 0) {
            recordEditHistory(editingProject, 'update', editChanges)
                .catch(err => console.error('[EditHistory] saveEdit failed:', err));
        }

        // Sync personnel assignment changes (fire-and-forget)
        const newUserIds = selectedPersonnel.map(u => u.id).filter(Boolean);
        const projectCode = existingProject?.project_code;
        syncPersonnelToAssignments(projectCode, oldUserIds, newUserIds)
            .catch(err => console.error('[Projects] Assignment sync failed:', err));

        showToast('Project updated successfully', 'success');
        editingProject = null;
        toggleAddProjectForm();
    } catch (error) {
        console.error('[Projects] Error updating project:', error);
        showToast('Failed to update project', 'error');
    } finally {
        showLoading(false);
    }
}

// Delete project
async function deleteProject(projectId, projectName) {
    // Guard: check edit permission
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to delete project "${projectName}"?`)) {
        return;
    }

    showLoading(true);

    try {
        await deleteDoc(doc(db, 'projects', projectId));
        showToast(`Project "${projectName}" deleted`, 'success');
    } catch (error) {
        console.error('[Projects] Error deleting project:', error);
        showToast('Failed to delete project', 'error');
    } finally {
        showLoading(false);
    }
}

// Toggle project active status
async function toggleProjectActive(projectId, currentStatus) {
    // Guard: check edit permission
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return;
    }

    if (!confirm(`${currentStatus ? 'Deactivate' : 'Activate'} this project?`)) {
        return;
    }

    showLoading(true);

    try {
        await updateDoc(doc(db, 'projects', projectId), {
            active: !currentStatus,
            updated_at: new Date().toISOString()
        });

        // Record edit history (fire-and-forget)
        recordEditHistory(projectId, 'toggle_active', [
            { field: 'active', old_value: currentStatus, new_value: !currentStatus }
        ]).catch(err => console.error('[EditHistory] toggleProjectActive failed:', err));

        showToast('Project status updated', 'success');
    } catch (error) {
        console.error('[Projects] Error toggling active status:', error);
        showToast('Failed to update project', 'error');
    } finally {
        showLoading(false);
    }
}

// Change page
