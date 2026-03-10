/* ========================================
   CLIENTS VIEW
   Client management with CRUD operations
   ======================================== */

import { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where } from '../firebase.js';
import { showLoading, showToast, formatCurrency, escapeHTML } from '../utils.js';
import { createModal, openModal, closeModal, skeletonTableRows } from '../components.js';

// Global state
let clientsData = [];
let editingClient = null;
let currentPage = 1;
const itemsPerPage = 15;
let listeners = [];

// Sort state
let sortColumn = 'company_name';
let sortDirection = 'asc';

// Attach window functions
function attachWindowFunctions() {
    window.toggleAddClientForm = toggleAddClientForm;
    window.addClient = addClient;
    window.editClient = editClient;
    window.cancelEdit = cancelEdit;
    window.saveEdit = saveEdit;
    window.deleteClient = deleteClient;
    window.changeClientsPage = changeClientsPage;
    window.sortClients = sortClients;
    window.showClientDetail = showClientDetail;
    window.closeClientDetailModal = closeClientDetailModal;
    window.filterClients = filterClients;
}

// Render view HTML
export function render(activeTab = null) {
    // Check edit permission
    const canEdit = window.canEditTab?.('clients');
    // IMPORTANT: Use strict equality to distinguish undefined (not loaded) from false (no permission)
    // canEdit === false -> no permission, hide edit controls
    // canEdit === undefined -> not loaded yet, show controls (backwards compatible)
    // canEdit === true -> has permission, show controls
    const showEditControls = canEdit !== false;

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
                    <h2>Client Management</h2>
                    ${showEditControls ? `
                        <button class="btn btn-primary" onclick="window.toggleAddClientForm()">Add Client</button>
                    ` : ''}
                </div>

                <!-- Add Client Form -->
                <div id="addClientForm" class="add-form" style="display: none;">
                    <h3 style="margin-bottom: 1rem;">Add New Client</h3>
                    <div class="form-group">
                        <label>Client Code *</label>
                        <input type="text" id="newClientCode" required style="text-transform: uppercase;" placeholder="e.g., ACME">
                    </div>
                    <div class="form-group">
                        <label>Company Name *</label>
                        <input type="text" id="newCompanyName" required>
                    </div>
                    <div class="form-group">
                        <label>Contact Person *</label>
                        <input type="text" id="newContactPerson" required>
                    </div>
                    <div class="form-group">
                        <label>Contact Details *</label>
                        <input type="text" id="newContactDetails" required placeholder="Email, phone, address">
                    </div>
                    <div class="form-actions">
                        <button class="btn btn-secondary" onclick="window.toggleAddClientForm()">Cancel</button>
                        <button class="btn btn-success" onclick="window.addClient()">Add Client</button>
                    </div>
                </div>

                <!-- Search Bar -->
                <div class="historical-filters" style="margin-bottom: 1rem;">
                    <div class="filter-group">
                        <label style="font-size: 0.875rem; margin-bottom: 0.25rem;">Search</label>
                        <input type="text" id="clientSearchInput" placeholder="Search by code or company name..." onkeyup="window.filterClients()" style="width: 100%; max-width: 350px;">
                    </div>
                </div>

                <!-- Clients Table -->
                <table>
                    <thead>
                        <tr>
                            <th onclick="window.sortClients('client_code')" style="cursor: pointer; user-select: none;">
                                Client Code <span class="sort-indicator" data-col="client_code"></span>
                            </th>
                            <th onclick="window.sortClients('company_name')" style="cursor: pointer; user-select: none;">
                                Company Name <span class="sort-indicator" data-col="company_name"></span>
                            </th>
                            <th onclick="window.sortClients('contact_person')" style="cursor: pointer; user-select: none;">
                                Contact Person <span class="sort-indicator" data-col="contact_person"></span>
                            </th>
                            <th>Contact Details</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="clientsTableBody">
                        ${skeletonTableRows(5, 5)}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Initialize view
export async function init(activeTab = null) {
    attachWindowFunctions();

    // Listen for permission changes and re-render table
    const permissionChangeHandler = () => {
        renderClientsTable();
    };
    window.addEventListener('permissionsChanged', permissionChangeHandler);

    // Store handler for cleanup
    if (!window._clientsPermissionHandler) {
        window._clientsPermissionHandler = permissionChangeHandler;
    }

    await loadClients();
}

// Cleanup
export async function destroy() {
    // Remove permission change listener
    if (window._clientsPermissionHandler) {
        window.removeEventListener('permissionsChanged', window._clientsPermissionHandler);
        delete window._clientsPermissionHandler;
    }

    listeners.forEach(unsubscribe => unsubscribe?.());
    listeners = [];
    clientsData = [];
    editingClient = null;
    currentPage = 1;

    delete window.toggleAddClientForm;
    delete window.addClient;
    delete window.editClient;
    delete window.cancelEdit;
    delete window.saveEdit;
    delete window.deleteClient;
    delete window.changeClientsPage;
    delete window.sortClients;
    delete window.showClientDetail;
    delete window.closeClientDetailModal;
    delete window.filterClients;

    // Remove client detail modal if open
    const existingModal = document.getElementById('clientDetailModalContainer');
    if (existingModal) existingModal.remove();

    // Reset sort state
    sortColumn = 'company_name';
    sortDirection = 'asc';
}

// Load clients with real-time listener
async function loadClients() {
    try {
        const listener = onSnapshot(collection(db, 'clients'), (snapshot) => {
            clientsData = [];
            snapshot.forEach(doc => {
                clientsData.push({ id: doc.id, ...doc.data() });
            });

            // Sort by current user-selected column (default: company_name ascending)
            clientsData.sort((a, b) => {
                let aVal = a[sortColumn];
                let bVal = b[sortColumn];
                if (aVal == null) return sortDirection === 'asc' ? 1 : -1;
                if (bVal == null) return sortDirection === 'asc' ? -1 : 1;
                if (typeof aVal === 'string') {
                    return sortDirection === 'asc'
                        ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                }
                return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
            });

            renderClientsTable();
        });

        listeners.push(listener);
    } catch (error) {
        console.error('[Clients] Error loading:', error);
    }
}

/**
 * Close client detail modal
 */
function closeClientDetailModal() {
    closeModal('clientDetailModal');
    const container = document.getElementById('clientDetailModalContainer');
    if (container) container.remove();
}

/**
 * Show client detail modal with linked projects and services
 */
async function showClientDetail(clientId) {
    // If row is in edit mode, do nothing
    if (editingClient === clientId) return;

    const client = clientsData.find(c => c.id === clientId);
    if (!client) return;

    showLoading(true);

    try {
        // Fetch linked projects and services in parallel
        const [projectsSnap, servicesSnap] = await Promise.all([
            getDocs(query(collection(db, 'projects'), where('client_code', '==', client.client_code))),
            getDocs(query(collection(db, 'services'), where('client_code', '==', client.client_code)))
        ]);

        const linkedProjects = [];
        projectsSnap.forEach(d => linkedProjects.push({ id: d.id, ...d.data() }));

        const linkedServices = [];
        servicesSnap.forEach(d => linkedServices.push({ id: d.id, ...d.data() }));

        // Build client info section
        const clientInfoHtml = `
            <div class="modal-details-grid" style="margin-bottom: 2rem;">
                <div class="modal-detail-item">
                    <span class="modal-detail-label">Client Code</span>
                    <span class="modal-detail-value"><strong>${escapeHTML(client.client_code || '—')}</strong></span>
                </div>
                <div class="modal-detail-item">
                    <span class="modal-detail-label">Company Name</span>
                    <span class="modal-detail-value">${escapeHTML(client.company_name || '—')}</span>
                </div>
                <div class="modal-detail-item">
                    <span class="modal-detail-label">Contact Person</span>
                    <span class="modal-detail-value">${escapeHTML(client.contact_person || '—')}</span>
                </div>
                <div class="modal-detail-item">
                    <span class="modal-detail-label">Contact Details</span>
                    <span class="modal-detail-value">${escapeHTML(client.contact_details || '—')}</span>
                </div>
            </div>
        `;

        // Build linked projects section
        let projectsHtml;
        if (linkedProjects.length === 0) {
            projectsHtml = `<p style="color: #64748b; font-style: italic; margin: 0.5rem 0 1.5rem;">No projects linked to this client.</p>`;
        } else {
            const rows = linkedProjects.map(p => `
                <tr>
                    <td><a href="#/projects/detail/${encodeURIComponent(p.project_code)}" onclick="window.closeClientDetailModal()" style="color: #1a73e8; text-decoration: none; font-weight: 500;">${escapeHTML(p.project_code || '—')}</a></td>
                    <td><a href="#/projects/detail/${encodeURIComponent(p.project_code)}" onclick="window.closeClientDetailModal()" style="color: #1a73e8; text-decoration: none;">${escapeHTML(p.project_name || '—')}</a></td>
                    <td style="text-align: right;">${p.budget != null ? '\u20B1' + formatCurrency(p.budget) : '—'}</td>
                    <td style="text-align: right;">${p.contract_cost != null ? '\u20B1' + formatCurrency(p.contract_cost) : '—'}</td>
                </tr>
            `).join('');
            projectsHtml = `
                <div style="overflow-x: auto; margin-bottom: 1.5rem;">
                    <table class="modal-items-table">
                        <thead>
                            <tr>
                                <th>Project Code</th>
                                <th>Project Name</th>
                                <th style="text-align: right;">Budget</th>
                                <th style="text-align: right;">Contract Cost</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
        }

        // Build linked services section
        let servicesHtml;
        if (linkedServices.length === 0) {
            servicesHtml = `<p style="color: #64748b; font-style: italic; margin: 0.5rem 0 0;">No services linked to this client.</p>`;
        } else {
            const rows = linkedServices.map(s => `
                <tr>
                    <td><a href="#/services/detail/${encodeURIComponent(s.service_code)}" onclick="window.closeClientDetailModal()" style="color: #1a73e8; text-decoration: none; font-weight: 500;">${escapeHTML(s.service_code || '—')}</a></td>
                    <td><a href="#/services/detail/${encodeURIComponent(s.service_code)}" onclick="window.closeClientDetailModal()" style="color: #1a73e8; text-decoration: none;">${escapeHTML(s.service_name || '—')}</a></td>
                    <td style="text-align: right;">${s.budget != null ? '\u20B1' + formatCurrency(s.budget) : '—'}</td>
                    <td style="text-align: right;">${s.contract_cost != null ? '\u20B1' + formatCurrency(s.contract_cost) : '—'}</td>
                </tr>
            `).join('');
            servicesHtml = `
                <div style="overflow-x: auto; margin-bottom: 0;">
                    <table class="modal-items-table">
                        <thead>
                            <tr>
                                <th>Service Code</th>
                                <th>Service Name</th>
                                <th style="text-align: right;">Budget</th>
                                <th style="text-align: right;">Contract Cost</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
        }

        const modalBody = `
            <h4 style="margin: 0 0 0.75rem; color: #1e293b; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">Client Information</h4>
            ${clientInfoHtml}
            <h4 style="margin: 0 0 0.75rem; color: #1e293b; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">Linked Projects (${linkedProjects.length})</h4>
            ${projectsHtml}
            <h4 style="margin: 0 0 0.75rem; color: #1e293b; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">Linked Services (${linkedServices.length})</h4>
            ${servicesHtml}
        `;

        // Reuse or create modal container
        let container = document.getElementById('clientDetailModalContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'clientDetailModalContainer';
            document.body.appendChild(container);
        }

        container.innerHTML = createModal({
            id: 'clientDetailModal',
            title: `${escapeHTML(client.company_name)} (${escapeHTML(client.client_code)})`,
            body: modalBody,
            footer: `<button class="btn btn-secondary" onclick="window.closeClientDetailModal()">Close</button>`,
            size: 'large'
        });

        openModal('clientDetailModal');

    } catch (error) {
        console.error('[Clients] Error loading client detail:', error);
        showToast('Failed to load client details', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Sort clients by column
 */
function sortClients(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }
    // Reset pagination
    currentPage = 1;
    // Sort the data
    clientsData.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];
        if (aVal == null) return sortDirection === 'asc' ? 1 : -1;
        if (bVal == null) return sortDirection === 'asc' ? -1 : 1;
        if (typeof aVal === 'string') {
            return sortDirection === 'asc'
                ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    renderClientsTable();
}

function filterClients() {
    currentPage = 1;
    renderClientsTable();
}

function getFilteredClients() {
    const searchTerm = document.getElementById('clientSearchInput')?.value.toLowerCase() || '';
    if (!searchTerm) return clientsData;
    return clientsData.filter(c =>
        (c.client_code && c.client_code.toLowerCase().includes(searchTerm)) ||
        (c.company_name && c.company_name.toLowerCase().includes(searchTerm))
    );
}

function renderClientsTable() {
    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;

    const filtered = getFilteredClients();

    if (filtered.length === 0) {
        const searchTerm = document.getElementById('clientSearchInput')?.value || '';
        const message = searchTerm ? 'No clients match your search.' : 'No clients yet. Add your first client!';
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem;">${message}</td></tr>`;
        const paginationDiv = document.getElementById('clientsPagination');
        if (paginationDiv) paginationDiv.style.display = 'none';
        return;
    }

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filtered.length);
    const pageItems = filtered.slice(startIndex, endIndex);

    // Check edit permission for action buttons
    const canEdit = window.canEditTab?.('clients');
    const showEditControls = canEdit !== false;

    tbody.innerHTML = pageItems.map(client => {
        if (editingClient === client.id) {
            return `
                <tr>
                    <td><input type="text" id="edit-code" value="${escapeHTML(client.client_code)}" style="width: 100%; text-transform: uppercase;"></td>
                    <td><input type="text" id="edit-company" value="${escapeHTML(client.company_name)}" style="width: 100%;"></td>
                    <td><input type="text" id="edit-contact" value="${escapeHTML(client.contact_person)}" style="width: 100%;"></td>
                    <td><input type="text" id="edit-details" value="${escapeHTML(client.contact_details)}" style="width: 100%;"></td>
                    <td style="white-space: nowrap;">
                        <button class="btn btn-sm btn-success" onclick="saveEdit('${client.id}')">Save</button>
                        <button class="btn btn-sm btn-secondary" onclick="cancelEdit()">Cancel</button>
                    </td>
                </tr>
            `;
        } else {
            return `
                <tr onclick="window.showClientDetail('${client.id}')" style="cursor: pointer;" class="clickable-row">
                    <td><strong>${escapeHTML(client.client_code)}</strong></td>
                    <td>${escapeHTML(client.company_name)}</td>
                    <td>${escapeHTML(client.contact_person)}</td>
                    <td>${escapeHTML(client.contact_details)}</td>
                    ${showEditControls ? `
                        <td style="white-space: nowrap;" onclick="event.stopPropagation()">
                            <button class="btn btn-sm btn-primary" onclick="window.editClient('${client.id}')">Edit</button>
                            <button class="btn btn-sm btn-danger" onclick="window.deleteClient('${client.id}', '${escapeHTML(client.company_name).replace(/'/g, "\\'")}')">Delete</button>
                        </td>
                    ` : `
                        <td class="actions-cell" onclick="event.stopPropagation()">
                            <span class="view-only-badge">View Only</span>
                        </td>
                    `}
                </tr>
            `;
        }
    }).join('');

    updatePaginationControls(totalPages, startIndex, endIndex, filtered.length);

    // Update sort indicators
    document.querySelectorAll('.sort-indicator').forEach(indicator => {
        const col = indicator.dataset.col;
        if (col === sortColumn) {
            indicator.textContent = sortDirection === 'asc' ? ' \u2191' : ' \u2193';
            indicator.style.color = '#1a73e8';
        } else {
            indicator.textContent = ' \u21C5';
            indicator.style.color = '#94a3b8';
        }
    });
}

function toggleAddClientForm() {
    // Guard: check edit permission
    if (window.canEditTab?.('clients') === false) {
        showToast('You do not have permission to edit clients', 'error');
        return;
    }

    const form = document.getElementById('addClientForm');
    if (!form) return;

    if (form.style.display === 'none') {
        form.style.display = 'block';
        document.getElementById('newClientCode').focus();
    } else {
        form.style.display = 'none';
        document.getElementById('newClientCode').value = '';
        document.getElementById('newCompanyName').value = '';
        document.getElementById('newContactPerson').value = '';
        document.getElementById('newContactDetails').value = '';
    }
}

async function addClient() {
    // Guard: check edit permission
    if (window.canEditTab?.('clients') === false) {
        showToast('You do not have permission to edit clients', 'error');
        return;
    }

    const client_code = document.getElementById('newClientCode').value.trim().toUpperCase();
    const company_name = document.getElementById('newCompanyName').value.trim();
    const contact_person = document.getElementById('newContactPerson').value.trim();
    const contact_details = document.getElementById('newContactDetails').value.trim();

    if (!client_code || !company_name || !contact_person || !contact_details) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    const duplicate = clientsData.find(c => c.client_code === client_code);
    if (duplicate) {
        showToast(`Client code "${client_code}" already exists`, 'error');
        return;
    }

    showLoading(true);

    try {
        await addDoc(collection(db, 'clients'), {
            client_code,
            company_name,
            contact_person,
            contact_details,
            created_at: new Date().toISOString()
        });

        showToast(`Client "${company_name}" added successfully!`, 'success');
        toggleAddClientForm();
    } catch (error) {
        console.error('[Clients] Error adding:', error);
        showToast('Failed to add client', 'error');
    } finally {
        showLoading(false);
    }
}

function editClient(clientId) {
    // Guard: check edit permission
    if (window.canEditTab?.('clients') === false) {
        showToast('You do not have permission to edit clients', 'error');
        return;
    }

    editingClient = clientId;
    renderClientsTable();
}

function cancelEdit() {
    editingClient = null;
    renderClientsTable();
}

async function saveEdit(clientId) {
    // Guard: check edit permission
    if (window.canEditTab?.('clients') === false) {
        showToast('You do not have permission to edit clients', 'error');
        return;
    }

    const client_code = document.getElementById('edit-code').value.trim().toUpperCase();
    const company_name = document.getElementById('edit-company').value.trim();
    const contact_person = document.getElementById('edit-contact').value.trim();
    const contact_details = document.getElementById('edit-details').value.trim();

    if (!client_code || !company_name || !contact_person || !contact_details) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    const duplicate = clientsData.find(c => c.client_code === client_code && c.id !== clientId);
    if (duplicate) {
        showToast(`Client code "${client_code}" already exists`, 'error');
        return;
    }

    showLoading(true);

    try {
        const clientRef = doc(db, 'clients', clientId);
        await updateDoc(clientRef, {
            client_code,
            company_name,
            contact_person,
            contact_details,
            updated_at: new Date().toISOString()
        });

        showToast('Client updated successfully', 'success');
        editingClient = null;
        renderClientsTable();
    } catch (error) {
        console.error('[Clients] Error updating:', error);
        showToast('Failed to update client', 'error');
    } finally {
        showLoading(false);
    }
}

async function deleteClient(clientId, companyName) {
    // Guard: check edit permission
    if (window.canEditTab?.('clients') === false) {
        showToast('You do not have permission to edit clients', 'error');
        return;
    }

    if (editingClient === clientId) {
        editingClient = null;
    }

    if (!confirm(`Are you sure you want to delete client "${companyName}"?`)) {
        return;
    }

    showLoading(true);

    try {
        await deleteDoc(doc(db, 'clients', clientId));
        showToast(`Client "${companyName}" deleted`, 'success');
    } catch (error) {
        console.error('[Clients] Error deleting:', error);
        showToast('Failed to delete client', 'error');
    } finally {
        showLoading(false);
    }
}

function changeClientsPage(direction) {
    const totalPages = Math.ceil(clientsData.length / itemsPerPage);

    if (direction === 'prev' && currentPage > 1) {
        currentPage--;
    } else if (direction === 'next' && currentPage < totalPages) {
        currentPage++;
    } else if (typeof direction === 'number') {
        currentPage = direction;
    }

    renderClientsTable();
}

function updatePaginationControls(totalPages, startIndex, endIndex, totalItems) {
    let paginationDiv = document.getElementById('clientsPagination');

    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.id = 'clientsPagination';
        paginationDiv.className = 'pagination-container';

        const section = document.querySelector('.container');
        const table = section?.querySelector('table');
        if (table && table.parentNode) {
            table.parentNode.insertBefore(paginationDiv, table.nextSibling);
        }
    }

    let paginationHTML = `
        <div class="pagination-info">
            Showing <strong>${startIndex + 1}-${endIndex}</strong> of <strong>${totalItems}</strong> clients
        </div>
        <div class="pagination-controls">
            <button class="pagination-btn" onclick="changeClientsPage('prev')" ${currentPage === 1 ? 'disabled' : ''}>
                ← Previous
            </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            paginationHTML += `
                <button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="changeClientsPage(${i})">
                    ${i}
                </button>
            `;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            paginationHTML += '<span class="pagination-ellipsis">...</span>';
        }
    }

    paginationHTML += `
            <button class="pagination-btn" onclick="changeClientsPage('next')" ${currentPage === totalPages ? 'disabled' : ''}>
                Next →
            </button>
        </div>
    `;

    paginationDiv.innerHTML = paginationHTML;
}

