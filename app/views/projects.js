/* ========================================
   PROJECTS VIEW
   Project management with CRUD operations
   ======================================== */

import { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot } from '../firebase.js';
import { showLoading, showToast, generateProjectCode } from '../utils.js';

// Global state
let projectsData = [];
let clientsData = [];
let editingProject = null;
let currentPage = 1;
const itemsPerPage = 15;
let listeners = [];

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
    console.log('[Projects] Window functions attached');
}

// Render view HTML
export function render(activeTab = null) {
    return `
        <div class="container" style="margin-top: 2rem;">
            <div class="card">
                <div class="suppliers-header">
                    <h2>Project Management</h2>
                    <button class="btn btn-primary" onclick="window.toggleAddProjectForm()">Add Project</button>
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

                    <div class="form-group">
                        <label>Personnel (Optional)</label>
                        <input type="text" id="personnel" placeholder="John Doe, Jane Smith">
                        <small class="form-hint">Freetext field for personnel assignment.</small>
                    </div>

                    <div class="form-actions">
                        <button class="btn btn-secondary" onclick="window.toggleAddProjectForm()">Cancel</button>
                        <button class="btn btn-success" id="submitProjectBtn" onclick="window.addProject()">Add Project</button>
                    </div>
                </div>

                <!-- Projects Table -->
                <table>
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Name</th>
                            <th>Client</th>
                            <th>Internal Status</th>
                            <th>Project Status</th>
                            <th>Active</th>
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
    await loadClients();
    await loadProjects();
}

// Cleanup
export async function destroy() {
    console.log('[Projects] Destroying projects view...');

    listeners.forEach(unsubscribe => unsubscribe?.());
    listeners = [];
    projectsData = [];
    clientsData = [];
    editingProject = null;
    currentPage = 1;

    delete window.toggleAddProjectForm;
    delete window.addProject;
    delete window.editProject;
    delete window.cancelEdit;
    delete window.saveEdit;
    delete window.deleteProject;
    delete window.toggleProjectActive;
    delete window.changeProjectsPage;

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
}

// Toggle add/edit form visibility
function toggleAddProjectForm() {
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
        document.getElementById('personnel').value = '';

        document.getElementById('projectName').focus();
    } else {
        form.style.display = 'none';
        editingProject = null;
        renderProjectsTable();
    }
}

// Add project
async function addProject() {
    const clientSelect = document.getElementById('projectClient');
    const clientId = clientSelect.value;
    const clientCode = clientSelect.selectedOptions[0]?.getAttribute('data-code');
    const project_name = document.getElementById('projectName').value.trim();
    const internal_status = document.getElementById('internalStatus').value;
    const project_status = document.getElementById('projectStatus').value;
    const budgetVal = document.getElementById('projectBudget').value;
    const contractVal = document.getElementById('contractCost').value;
    const personnel = document.getElementById('personnel').value.trim();

    // Validate required fields
    if (!clientId || !project_name || !internal_status || !project_status) {
        showToast('Please fill in all required fields', 'error');
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
            personnel: personnel || null,
            active: true,
            created_at: new Date().toISOString()
        });

        showToast(`Project "${project_name}" created successfully!`, 'success');
        toggleAddProjectForm();
    } catch (error) {
        console.error('[Projects] Error adding project:', error);
        showToast('Failed to create project', 'error');
    } finally {
        showLoading(false);
    }
}

// Load projects with real-time listener
async function loadProjects() {
    try {
        const listener = onSnapshot(collection(db, 'projects'), (snapshot) => {
            projectsData = [];
            snapshot.forEach(doc => {
                projectsData.push({ id: doc.id, ...doc.data() });
            });

            // Sort by created_at descending (most recent first)
            projectsData.sort((a, b) =>
                new Date(b.created_at) - new Date(a.created_at)
            );

            console.log('[Projects] Loaded:', projectsData.length);
            renderProjectsTable();
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

    if (projectsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No projects yet. Add your first project!</td></tr>';
        const paginationDiv = document.getElementById('projectsPagination');
        if (paginationDiv) paginationDiv.style.display = 'none';
        return;
    }

    // Pagination
    const totalPages = Math.ceil(projectsData.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, projectsData.length);
    const pageItems = projectsData.slice(startIndex, endIndex);

    tbody.innerHTML = pageItems.map(project => {
        // Find client name
        const client = clientsData.find(c => c.id === project.client_id);
        const clientName = client ? client.company_name : project.client_code;

        return `
            <tr>
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
                <td style="white-space: nowrap;">
                    <button class="btn btn-sm btn-primary" onclick="editProject('${project.id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteProject('${project.id}', '${project.project_name.replace(/'/g, "\\'")}')">Delete</button>
                </td>
            </tr>
        `;
    }).join('');

    updatePaginationControls(totalPages, startIndex, endIndex, projectsData.length);
}

// Edit project
function editProject(projectId) {
    const project = projectsData.find(p => p.id === projectId);
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
    document.getElementById('personnel').value = project.personnel || '';
}

// Cancel edit
function cancelEdit() {
    toggleAddProjectForm();
}

// Save edit
async function saveEdit() {
    if (!editingProject) return;

    const clientSelect = document.getElementById('projectClient');
    const clientId = clientSelect.value;
    const clientCode = clientSelect.selectedOptions[0]?.getAttribute('data-code');
    const project_name = document.getElementById('projectName').value.trim();
    const internal_status = document.getElementById('internalStatus').value;
    const project_status = document.getElementById('projectStatus').value;
    const budgetVal = document.getElementById('projectBudget').value;
    const contractVal = document.getElementById('contractCost').value;
    const personnel = document.getElementById('personnel').value.trim();

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
            personnel: personnel || null,
            updated_at: new Date().toISOString()
        });

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
    const totalPages = Math.ceil(projectsData.length / itemsPerPage);

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
