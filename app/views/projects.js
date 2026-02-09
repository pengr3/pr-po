/* ========================================
   PROJECTS VIEW
   Project management with CRUD operations
   ======================================== */

import { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot } from '../firebase.js';
import { showLoading, showToast, generateProjectCode, normalizePersonnel, syncPersonnelToAssignments } from '../utils.js';

// Global state
let projectsData = [];
let clientsData = [];
let usersData = [];  // Active users for personnel selection
let editingProject = null;
let selectedPersonnel = []; // Array of { id: string, name: string } for pill state
let currentPage = 1;
const itemsPerPage = 15;
let listeners = [];

// Filtering and sorting state
let allProjects = [];           // Unfiltered data from Firebase
let filteredProjects = [];      // Filtered subset for display
let sortColumn = 'created_at';  // Default sort column
let sortDirection = 'desc';     // Most recent first (PROJ-15)

// Status options
const INTERNAL_STATUS_OPTIONS = [
    'For Inspection',
    'For Proposal',
    'For Internal Approval',
    'Ready to Submit'
];

const PROJECT_STATUS_OPTIONS = [
    'Pending Client Review',
    'Under Client Review',
    'Approved by Client',
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

// Attach window functions
function attachWindowFunctions() {
    console.log('[Projects] Attaching window functions...');
    window.toggleAddProjectForm = toggleAddProjectForm;
    window.addProject = addProject;
    window.editProject = editProject;
    window.cancelEdit = cancelEdit;
    window.saveEdit = saveEdit;
    window.deleteProject = deleteProject;
    window.toggleProjectActive = toggleProjectActive;
    window.changeProjectsPage = changeProjectsPage;
    window.applyFilters = applyFilters;
    window.debouncedFilter = debouncedFilter;
    window.sortProjects = sortProjects;
    window.selectPersonnel = selectPersonnel;
    window.removePersonnel = removePersonnel;
    window.filterPersonnelDropdown = filterPersonnelDropdown;
    window.showPersonnelDropdown = showPersonnelDropdown;
    console.log('[Projects] Window functions attached');
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
                    ${canCreateProject ? `
                        <button class="btn btn-primary" onclick="window.toggleAddProjectForm()">Add Project</button>
                    ` : ''}
                </div>

                <!-- Add Project Form -->
                <div id="addProjectForm" class="add-form" style="display: none;">
                    <h3 id="formTitle" style="margin-bottom: 1rem;">Add New Project</h3>

                    <div class="form-group">
                        <label>Client *</label>
                        <select id="projectClient" required>
                            <option value="">-- Select Client --</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Project Name *</label>
                        <input type="text" id="projectName" required>
                    </div>

                    <div class="form-group">
                        <label>Internal Status *</label>
                        <select id="internalStatus" required>
                            <option value="">-- Select Internal Status --</option>
                            ${INTERNAL_STATUS_OPTIONS.map(s =>
                                `<option value="${s}">${s}</option>`
                            ).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Project Status *</label>
                        <select id="projectStatus" required>
                            <option value="">-- Select Project Status --</option>
                            ${PROJECT_STATUS_OPTIONS.map(s =>
                                `<option value="${s}">${s}</option>`
                            ).join('')}
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

                <!-- Filter Bar -->
                <div class="filter-bar" style="display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: #f8fafc; border-radius: 0.5rem;">
                    <div class="form-group" style="margin: 0; flex: 1; min-width: 150px;">
                        <label style="font-size: 0.875rem; margin-bottom: 0.25rem;">Internal Status</label>
                        <select id="internalStatusFilter" onchange="window.applyFilters()" style="width: 100%;">
                            <option value="">All Internal Statuses</option>
                            ${INTERNAL_STATUS_OPTIONS.map(s =>
                                `<option value="${s}">${s}</option>`
                            ).join('')}
                        </select>
                    </div>

                    <div class="form-group" style="margin: 0; flex: 1; min-width: 150px;">
                        <label style="font-size: 0.875rem; margin-bottom: 0.25rem;">Project Status</label>
                        <select id="projectStatusFilter" onchange="window.applyFilters()" style="width: 100%;">
                            <option value="">All Project Statuses</option>
                            ${PROJECT_STATUS_OPTIONS.map(s =>
                                `<option value="${s}">${s}</option>`
                            ).join('')}
                        </select>
                    </div>

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

                <!-- Projects Table -->
                <table>
                    <thead>
                        <tr>
                            <th onclick="window.sortProjects('project_code')" style="cursor: pointer; user-select: none;">
                                Code <span class="sort-indicator" data-col="project_code"></span>
                            </th>
                            <th onclick="window.sortProjects('project_name')" style="cursor: pointer; user-select: none;">
                                Name <span class="sort-indicator" data-col="project_name"></span>
                            </th>
                            <th onclick="window.sortProjects('client_code')" style="cursor: pointer; user-select: none;">
                                Client <span class="sort-indicator" data-col="client_code"></span>
                            </th>
                            <th onclick="window.sortProjects('internal_status')" style="cursor: pointer; user-select: none;">
                                Internal Status <span class="sort-indicator" data-col="internal_status"></span>
                            </th>
                            <th onclick="window.sortProjects('project_status')" style="cursor: pointer; user-select: none;">
                                Project Status <span class="sort-indicator" data-col="project_status"></span>
                            </th>
                            <th onclick="window.sortProjects('active')" style="cursor: pointer; user-select: none;">
                                Active <span class="sort-indicator" data-col="active"></span>
                            </th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="projectsTableBody">
                        <tr>
                            <td colspan="7" style="text-align: center; padding: 2rem;">Loading projects...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Initialize view
export async function init(activeTab = null) {
    console.log('[Projects] Initializing projects view...');
    attachWindowFunctions();

    // Listen for permission changes and re-render table
    const permissionChangeHandler = () => {
        console.log('[Projects] Permissions changed, re-rendering table...');
        renderProjectsTable();
    };
    window.addEventListener('permissionsChanged', permissionChangeHandler);

    // Store handler for cleanup
    if (!window._projectsPermissionHandler) {
        window._projectsPermissionHandler = permissionChangeHandler;
    }

    // Phase 7: Re-filter when assignments change
    const assignmentChangeHandler = () => {
        console.log('[Projects] Assignments changed, re-filtering...');
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

    await loadClients();
    await loadActiveUsers();
    await loadProjects();
}

// Cleanup
export async function destroy() {
    console.log('[Projects] Destroying projects view...');

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
    sortColumn = 'created_at';
    sortDirection = 'desc';

    // Clean up personnel pill state
    if (window._personnelClickOutside) {
        document.removeEventListener('mousedown', window._personnelClickOutside);
        delete window._personnelClickOutside;
    }
    selectedPersonnel = [];

    delete window.toggleAddProjectForm;
    delete window.addProject;
    delete window.editProject;
    delete window.cancelEdit;
    delete window.saveEdit;
    delete window.deleteProject;
    delete window.toggleProjectActive;
    delete window.changeProjectsPage;
    delete window.applyFilters;
    delete window.debouncedFilter;
    delete window.sortProjects;
    delete window.selectPersonnel;
    delete window.removePersonnel;
    delete window.filterPersonnelDropdown;
    delete window.showPersonnelDropdown;

    console.log('[Projects] View destroyed');
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

            console.log('[Projects] Clients loaded:', clientsData.length);
            renderClientDropdown();
        });

        listeners.push(listener);
    } catch (error) {
        console.error('[Projects] Error loading clients:', error);
    }
}

// Load active users for personnel datalist
async function loadActiveUsers() {
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
            console.log('[Projects] Active users loaded:', usersData.length);
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
            <strong>${user.full_name}</strong>
            <span style="color: #64748b; margin-left: 0.5rem;">${user.email}</span>
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
            <option value="${client.id}"
                    data-code="${client.client_code}"
                    ${selected}>
                ${client.company_name} (${client.client_code})
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
            filterOptionsHtml += `<option value="${client.id}" ${selected}>${client.company_name}</option>`;
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
        document.getElementById('internalStatus').value = '';
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
        renderProjectsTable();
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
    const internal_status = document.getElementById('internalStatus').value;
    const project_status = document.getElementById('projectStatus').value;
    const budgetVal = document.getElementById('projectBudget').value;
    const contractVal = document.getElementById('contractCost').value;

    // Validate required fields
    if (!clientId || !project_name || !internal_status || !project_status) {
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
    if (!INTERNAL_STATUS_OPTIONS.includes(internal_status)) {
        showToast('Invalid internal status', 'error');
        return;
    }

    if (!PROJECT_STATUS_OPTIONS.includes(project_status)) {
        showToast('Invalid project status', 'error');
        return;
    }

    showLoading(true);

    try {
        // Generate project code
        const project_code = await generateProjectCode(clientCode);

        await addDoc(collection(db, 'projects'), {
            project_code,
            project_name,
            client_id: clientId,
            client_code: clientCode,
            internal_status,
            project_status,
            budget,
            contract_cost,
            personnel_user_ids: selectedPersonnel.map(u => u.id).filter(Boolean),
            personnel_names: selectedPersonnel.map(u => u.name),
            personnel_user_id: null,
            personnel_name: null,
            personnel: null,
            active: true,
            created_at: new Date().toISOString()
        });

        // Sync personnel to user assignments (fire-and-forget)
        const newUserIds = selectedPersonnel.map(u => u.id).filter(Boolean);
        syncPersonnelToAssignments(project_code, [], newUserIds)
            .catch(err => console.error('[Projects] Assignment sync failed:', err));

        showToast(`Project "${project_name}" created successfully!`, 'success');
        toggleAddProjectForm();
    } catch (error) {
        console.error('[Projects] Error adding project:', error);
        showToast('Failed to create project', 'error');
    } finally {
        showLoading(false);
    }
}

// Apply filters
function applyFilters() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const internalStatusFilter = document.getElementById('internalStatusFilter')?.value || '';
    const projectStatusFilter = document.getElementById('projectStatusFilter')?.value || '';
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

        // Status filters (exact match)
        const matchesInternalStatus = !internalStatusFilter ||
            project.internal_status === internalStatusFilter;
        const matchesProjectStatus = !projectStatusFilter ||
            project.project_status === projectStatusFilter;

        // Client filter (match by ID)
        const matchesClient = !clientFilter ||
            project.client_id === clientFilter;

        // AND logic - all conditions must be true
        return matchesSearch && matchesInternalStatus &&
               matchesProjectStatus && matchesClient;
    });

    // Reset pagination when filters change
    currentPage = 1;

    // Apply current sort
    sortFilteredProjects();

    renderProjectsTable();
}

// Sort filtered projects
function sortFilteredProjects() {
    filteredProjects.sort((a, b) => {
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

// Create debounced filter
const debouncedFilter = debounce(applyFilters, 300);

// Sort projects by column
function sortProjects(column) {
    // Toggle direction if clicking same column
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc'; // Default to ascending on new column
    }

    // Reset pagination (per RESEARCH.md Pitfall 3)
    currentPage = 1;

    // Sort the filtered data
    sortFilteredProjects();

    // Re-render table with updated headers
    renderProjectsTable();
}

// Update sort indicators
function updateSortIndicators() {
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

// Load projects with real-time listener
async function loadProjects() {
    try {
        const listener = onSnapshot(collection(db, 'projects'), (snapshot) => {
            allProjects = [];
            snapshot.forEach(doc => {
                allProjects.push({ id: doc.id, ...doc.data() });
            });

            console.log('[Projects] Loaded:', allProjects.length);

            // Apply filters (which will also sort and render)
            applyFilters();
        });

        listeners.push(listener);
    } catch (error) {
        console.error('[Projects] Error loading projects:', error);
    }
}

// Render projects table
function renderProjectsTable() {
    const tbody = document.getElementById('projectsTableBody');
    if (!tbody) return;

    if (filteredProjects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No projects found matching filters.</td></tr>';
        const paginationDiv = document.getElementById('projectsPagination');
        if (paginationDiv) paginationDiv.style.display = 'none';
        return;
    }

    // Pagination
    const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredProjects.length);
    const pageItems = filteredProjects.slice(startIndex, endIndex);

    // Check edit permission for action buttons
    const canEdit = window.canEditTab?.('projects');
    const showEditControls = canEdit !== false;

    tbody.innerHTML = pageItems.map(project => {
        // Find client name
        const client = clientsData.find(c => c.id === project.client_id);
        const clientName = client ? client.company_name : project.client_code;

        return `
            <tr onclick="window.location.hash = '#/projects/detail/${project.project_code}'"
                style="cursor: pointer;"
                class="clickable-row">
                <td><strong>${project.project_code}</strong></td>
                <td>${project.project_name}</td>
                <td>${clientName}</td>
                <td>${project.internal_status}</td>
                <td>${project.project_status}</td>
                <td>
                    <span class="status-badge ${project.active ? 'approved' : 'rejected'}">
                        ${project.active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                ${showEditControls ? `
                    <td style="white-space: nowrap;" onclick="event.stopPropagation()">
                        <button class="btn btn-sm btn-primary" onclick="editProject('${project.id}')">Edit</button>
                        <button class="btn btn-sm btn-secondary" onclick="toggleProjectActive('${project.id}', ${project.active})">${project.active ? 'Deactivate' : 'Activate'}</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteProject('${project.id}', '${project.project_name.replace(/'/g, "\\'")}')">Delete</button>
                    </td>
                ` : `
                    <td class="actions-cell" onclick="event.stopPropagation()">
                        <span class="view-only-badge">View Only</span>
                    </td>
                `}
            </tr>
        `;
    }).join('');

    updatePaginationControls(totalPages, startIndex, endIndex, filteredProjects.length);

    // Update sort indicators
    updateSortIndicators();
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
    document.getElementById('internalStatus').value = project.internal_status;
    document.getElementById('projectStatus').value = project.project_status;
    document.getElementById('projectBudget').value = project.budget || '';
    document.getElementById('contractCost').value = project.contract_cost || '';

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
    const internal_status = document.getElementById('internalStatus').value;
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
    if (!clientId || !project_name || !internal_status || !project_status) {
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
    if (!INTERNAL_STATUS_OPTIONS.includes(internal_status)) {
        showToast('Invalid internal status', 'error');
        return;
    }

    if (!PROJECT_STATUS_OPTIONS.includes(project_status)) {
        showToast('Invalid project status', 'error');
        return;
    }

    // Capture old personnel BEFORE save for sync diff
    const existingProject = allProjects.find(p => p.id === editingProject);
    const oldNormalized = normalizePersonnel(existingProject);
    const oldUserIds = oldNormalized.userIds;

    showLoading(true);

    try {
        const projectRef = doc(db, 'projects', editingProject);
        await updateDoc(projectRef, {
            project_name,
            client_id: clientId,
            client_code: clientCode,
            internal_status,
            project_status,
            budget,
            contract_cost,
            ...personnelUpdate,
            updated_at: new Date().toISOString()
        });

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

        showToast('Project status updated', 'success');
    } catch (error) {
        console.error('[Projects] Error toggling active status:', error);
        showToast('Failed to update project', 'error');
    } finally {
        showLoading(false);
    }
}

// Change page
function changeProjectsPage(direction) {
    const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);

    if (direction === 'prev' && currentPage > 1) {
        currentPage--;
    } else if (direction === 'next' && currentPage < totalPages) {
        currentPage++;
    } else if (typeof direction === 'number') {
        currentPage = direction;
    }

    renderProjectsTable();
}

// Update pagination controls
function updatePaginationControls(totalPages, startIndex, endIndex, totalItems) {
    let paginationDiv = document.getElementById('projectsPagination');

    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.id = 'projectsPagination';
        paginationDiv.className = 'pagination-container';

        const section = document.querySelector('.container');
        const table = section?.querySelector('table');
        if (table && table.parentNode) {
            table.parentNode.insertBefore(paginationDiv, table.nextSibling);
        }
    }

    let paginationHTML = `
        <div class="pagination-info">
            Showing <strong>${startIndex + 1}-${endIndex}</strong> of <strong>${totalItems}</strong> projects
        </div>
        <div class="pagination-controls">
            <button class="pagination-btn" onclick="changeProjectsPage('prev')" ${currentPage === 1 ? 'disabled' : ''}>
                ← Previous
            </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            paginationHTML += `
                <button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="changeProjectsPage(${i})">
                    ${i}
                </button>
            `;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            paginationHTML += '<span class="pagination-ellipsis">...</span>';
        }
    }

    paginationHTML += `
            <button class="pagination-btn" onclick="changeProjectsPage('next')" ${currentPage === totalPages ? 'disabled' : ''}>
                Next →
            </button>
        </div>
    `;

    paginationDiv.innerHTML = paginationHTML;
}

console.log('[Projects] Module loaded');
