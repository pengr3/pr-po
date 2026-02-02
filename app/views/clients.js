/* ========================================
   CLIENTS VIEW
   Client management with CRUD operations
   ======================================== */

import { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from '../firebase.js';
import { showLoading, showToast } from '../utils.js';

// Global state
let clientsData = [];
let editingClient = null;
let currentPage = 1;
const itemsPerPage = 15;
let listeners = [];

// Attach window functions
function attachWindowFunctions() {
    console.log('[Clients] Attaching window functions...');
    window.toggleAddClientForm = toggleAddClientForm;
    window.addClient = addClient;
    window.editClient = editClient;
    window.cancelEdit = cancelEdit;
    window.saveEdit = saveEdit;
    window.deleteClient = deleteClient;
    window.changeClientsPage = changeClientsPage;
    console.log('[Clients] Window functions attached');
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

                <!-- Clients Table -->
                <table>
                    <thead>
                        <tr>
                            <th>Client Code</th>
                            <th>Company Name</th>
                            <th>Contact Person</th>
                            <th>Contact Details</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="clientsTableBody">
                        <tr>
                            <td colspan="5" style="text-align: center; padding: 2rem;">Loading clients...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Initialize view
export async function init(activeTab = null) {
    console.log('[Clients] Initializing clients view...');
    attachWindowFunctions();

    // Listen for permission changes and re-render table
    const permissionChangeHandler = () => {
        console.log('[Clients] Permissions changed, re-rendering table...');
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
    console.log('[Clients] Destroying clients view...');

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

    console.log('[Clients] View destroyed');
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

            console.log('[Clients] Loaded:', clientsData.length);
            renderClientsTable();
        });

        listeners.push(listener);
    } catch (error) {
        console.error('[Clients] Error loading:', error);
    }
}

function renderClientsTable() {
    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;

    if (clientsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">No clients yet. Add your first client!</td></tr>';
        const paginationDiv = document.getElementById('clientsPagination');
        if (paginationDiv) paginationDiv.style.display = 'none';
        return;
    }

    const totalPages = Math.ceil(clientsData.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, clientsData.length);
    const pageItems = clientsData.slice(startIndex, endIndex);

    // Check edit permission for action buttons
    const canEdit = window.canEditTab?.('clients');
    const showEditControls = canEdit !== false;

    tbody.innerHTML = pageItems.map(client => {
        if (editingClient === client.id) {
            return `
                <tr>
                    <td><input type="text" id="edit-code" value="${client.client_code}" style="width: 100%; text-transform: uppercase;"></td>
                    <td><input type="text" id="edit-company" value="${client.company_name}" style="width: 100%;"></td>
                    <td><input type="text" id="edit-contact" value="${client.contact_person}" style="width: 100%;"></td>
                    <td><input type="text" id="edit-details" value="${client.contact_details}" style="width: 100%;"></td>
                    <td style="white-space: nowrap;">
                        <button class="btn btn-sm btn-success" onclick="saveEdit('${client.id}')">Save</button>
                        <button class="btn btn-sm btn-secondary" onclick="cancelEdit()">Cancel</button>
                    </td>
                </tr>
            `;
        } else {
            return `
                <tr>
                    <td><strong>${client.client_code}</strong></td>
                    <td>${client.company_name}</td>
                    <td>${client.contact_person}</td>
                    <td>${client.contact_details}</td>
                    ${showEditControls ? `
                        <td style="white-space: nowrap;">
                            <button class="btn btn-sm btn-primary" onclick="editClient('${client.id}')">Edit</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteClient('${client.id}', '${client.company_name.replace(/'/g, "\\'")}')">Delete</button>
                        </td>
                    ` : `
                        <td class="actions-cell">
                            <span class="view-only-badge">View Only</span>
                        </td>
                    `}
                </tr>
            `;
        }
    }).join('');

    updatePaginationControls(totalPages, startIndex, endIndex, clientsData.length);
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

console.log('[Clients] Module loaded');
