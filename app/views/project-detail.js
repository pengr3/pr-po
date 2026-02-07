/* ========================================
   PROJECT DETAIL VIEW
   Full-page project detail with inline editing
   ======================================== */

import { db, collection, doc, getDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, getAggregateFromServer, sum, count } from '../firebase.js';
import { formatCurrency, formatDate, showLoading, showToast } from '../utils.js';

let currentProject = null;
let projectCode = null;
let listener = null;
let usersData = [];
let usersListenerUnsub = null;
let currentExpense = { total: 0, poCount: 0, trCount: 0 };

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

// Render view HTML
export function render(activeTab = null, param = null) {
    return `
        <div id="projectDetailContainer">
            <div class="container" style="margin-top: 2rem;">
                <div class="card">
                    <div class="card-body" style="text-align: center; padding: 3rem;">
                        <p style="color: #64748b;">Loading project details...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Initialize view
export async function init(activeTab = null, param = null) {
    console.log('[ProjectDetail] Initializing with param:', param);
    projectCode = param;
    attachWindowFunctions();

    // Listen for permission changes and re-render
    const permissionChangeHandler = () => {
        console.log('[ProjectDetail] Permissions changed, re-rendering...');
        renderProjectDetail();
    };
    window.addEventListener('permissionsChanged', permissionChangeHandler);

    // Store handler for cleanup
    if (!window._projectDetailPermissionHandler) {
        window._projectDetailPermissionHandler = permissionChangeHandler;
    }

    // Phase 7: Re-check access when assignments change
    const assignmentChangeHandler = () => {
        console.log('[ProjectDetail] Assignments changed, re-checking access...');
        if (currentProject) {
            checkProjectAccess(); // Will render access denied if project no longer assigned
        }
    };
    window.addEventListener('assignmentsChanged', assignmentChangeHandler);
    if (!window._projectDetailAssignmentHandler) {
        window._projectDetailAssignmentHandler = assignmentChangeHandler;
    }

    if (!projectCode) {
        document.getElementById('projectDetailContainer').innerHTML = `
            <div class="container" style="margin-top: 2rem;">
                <div class="card">
                    <div class="card-body">
                        <p>No project specified.</p>
                        <a href="#/projects" class="btn btn-primary">Back to Projects</a>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    // Load active users for personnel datalist
    const usersQuery = query(collection(db, 'users'), where('status', '==', 'active'));
    usersListenerUnsub = onSnapshot(usersQuery, (snapshot) => {
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
        populatePersonnelDatalist();
    });

    // Find project by project_code field (not document ID)
    const q = query(collection(db, 'projects'), where('project_code', '==', projectCode));
    listener = onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) {
            document.getElementById('projectDetailContainer').innerHTML = `
                <div class="container" style="margin-top: 2rem;">
                    <div class="card">
                        <div class="card-body">
                            <p>Project not found.</p>
                            <a href="#/projects" class="btn btn-primary">Back to Projects</a>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        const docSnap = snapshot.docs[0];
        currentProject = { id: docSnap.id, ...docSnap.data() };

        // Calculate initial expense
        await refreshExpense();

        // Phase 7: Check project assignment access for operations_user
        if (checkProjectAccess()) {
            renderProjectDetail();
        }
        // If checkProjectAccess() returns false, it already rendered the access denied message
    });
}

// Cleanup
export async function destroy() {
    console.log('[ProjectDetail] Destroying view...');

    // Remove permission change listener
    if (window._projectDetailPermissionHandler) {
        window.removeEventListener('permissionsChanged', window._projectDetailPermissionHandler);
        delete window._projectDetailPermissionHandler;
    }

    // Phase 7: Remove assignment change listener
    if (window._projectDetailAssignmentHandler) {
        window.removeEventListener('assignmentsChanged', window._projectDetailAssignmentHandler);
        delete window._projectDetailAssignmentHandler;
    }

    if (listener) {
        listener();
        listener = null;
    }

    if (usersListenerUnsub) {
        usersListenerUnsub();
        usersListenerUnsub = null;
    }
    usersData = [];

    currentProject = null;
    projectCode = null;

    delete window.saveField;
    delete window.toggleActive;
    delete window.confirmDelete;
    delete window.refreshExpense;
    delete window.showExpenseModal;
    delete window.closeExpenseModal;

    console.log('[ProjectDetail] View destroyed');
}

// Populate personnel datalist
function populatePersonnelDatalist() {
    const datalist = document.getElementById('personnelUsersList');
    if (!datalist) return;
    datalist.innerHTML = usersData.map(user =>
        `<option value="${user.full_name}">${user.full_name} (${user.email})</option>`
    ).join('');
}

/**
 * Check if the current user has access to the current project.
 * For operations_user without all_projects, the project must be in assigned_project_codes.
 * Returns true if access is allowed (or if no filtering applies).
 * Returns false and renders an access denied message if access is denied.
 * If the target container is not in the DOM (race condition or navigation), falls back
 * to redirecting to #/projects rather than silently returning false with nothing rendered.
 */
function checkProjectAccess() {
    const assignedCodes = window.getAssignedProjectCodes?.();

    // null means no filtering -- all roles except scoped operations_user
    if (assignedCodes === null) return true;

    // If current project has no project_code (legacy), allow access defensively
    if (!currentProject?.project_code) return true;

    // Check if this project is in the assigned set
    if (assignedCodes.includes(currentProject.project_code)) return true;

    // Access denied -- render message in place (do NOT redirect silently)
    const container = document.getElementById('projectDetailContainer');
    if (container) {
        container.innerHTML = `
            <div class="container" style="margin-top: 2rem;">
                <div class="card">
                    <div class="card-body">
                        <div class="empty-state">
                            <div class="empty-state-icon">🔒</div>
                            <h3>Access Denied</h3>
                            <p>You do not have access to this project.</p>
                            <p style="color: #64748b; font-size: 0.875rem;">This project has been removed from your assigned projects.</p>
                            <a href="#/projects" class="btn btn-primary" style="margin-top: 1rem;">Back to Projects</a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else {
        // Container not in DOM (race condition or mid-navigation) -- navigate back
        // rather than silently returning false with nothing rendered.
        window.location.hash = '#/projects';
    }
    console.log('[ProjectDetail] Access denied for project:', currentProject?.project_code);
    return false;
}

// Render project detail
function renderProjectDetail() {
    const container = document.getElementById('projectDetailContainer');
    if (!container || !currentProject) return;

    // Check edit permission
    const canEdit = window.canEditTab?.('projects');
    const showEditControls = canEdit !== false;

    const focusedField = document.activeElement?.dataset?.field;

    container.innerHTML = `
        <div class="container" style="margin-top: 1rem;">
            ${canEdit === false ? `
                <div class="view-only-notice">
                    <span class="notice-icon">👁</span>
                    <span>You have view-only access to this section.</span>
                </div>
            ` : ''}

            <!-- Active Toggle Badge (Above Cards) -->
            <div style="margin-bottom: 1.5rem;">
                <div style="display: inline-flex; align-items: center; gap: 0.75rem;">
                    <span class="status-badge ${currentProject.active ? 'approved' : 'rejected'}"
                          style="cursor: pointer; font-size: 0.875rem; padding: 0.5rem 1rem; transition: all 0.2s;"
                          onclick="window.toggleActive(${!currentProject.active})">
                        ${currentProject.active ? '✓ Active' : '✗ Inactive'}
                    </span>
                    <span style="color: #64748b; font-size: 0.875rem;">
                        ${currentProject.active
                            ? 'Click to deactivate (requires confirmation)'
                            : 'Click to activate'}
                    </span>
                </div>
            </div>

            <!-- Card 1 - Project Information -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body" style="padding: 1.5rem;">
                    <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 0.75rem; margin-bottom: 1rem;">
                        <h3 style="margin: 0 0 0.25rem 0; font-size: 1.125rem; font-weight: 600;">Project Information</h3>
                        <p style="color: #94a3b8; font-size: 0.875rem; margin: 0;">Created: ${formatDate(currentProject.created_at)}${currentProject.updated_at ? ' | Updated: ' + formatDate(currentProject.updated_at) : ''}</p>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Project Code</label>
                            <div style="color: #64748b; font-size: 1rem;">${currentProject.project_code}</div>
                            <small style="color: #94a3b8; font-size: 0.75rem;">Locked field</small>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.25rem;">Project Name *</label>
                            <input type="text" data-field="project_name" value="${currentProject.project_name || ''}" onblur="window.saveField('project_name', this.value)" placeholder="Enter project name" ${!showEditControls ? 'disabled' : ''}>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Client</label>
                            <div style="color: #64748b; font-size: 1rem;">${currentProject.client_code || 'N/A'}</div>
                            <small style="color: #94a3b8; font-size: 0.75rem;">Linked to project code</small>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.25rem;">Assigned Personnel</label>
                            <input type="text" data-field="personnel" list="personnelUsersList" value="${currentProject.personnel_name || currentProject.personnel || ''}" onblur="window.saveField('personnel', this.value)" placeholder="Type name to search..." autocomplete="off" ${!showEditControls ? 'disabled' : ''}>
                            <datalist id="personnelUsersList"></datalist>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Card 2 - Financial Summary -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body" style="padding: 1.5rem;">
                    <h3 style="margin: 0 0 1rem 0; font-size: 1.125rem; font-weight: 600;">Financial Summary</h3>

                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.25rem;">Budget ${currentProject.budget ? `<small style="color: #64748b; font-weight: normal;">PHP ${formatCurrency(currentProject.budget)}</small>` : ''}</label>
                            <input type="number" data-field="budget" value="${currentProject.budget || ''}" onblur="window.saveField('budget', this.value)" placeholder="(Not set)" min="0" step="0.01" ${!showEditControls ? 'disabled' : ''}>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.25rem;">Contract Cost ${currentProject.contract_cost ? `<small style="color: #64748b; font-weight: normal;">PHP ${formatCurrency(currentProject.contract_cost)}</small>` : ''}</label>
                            <input type="number" data-field="contract_cost" value="${currentProject.contract_cost || ''}" onblur="window.saveField('contract_cost', this.value)" placeholder="(Not set)" min="0" step="0.01" ${!showEditControls ? 'disabled' : ''}>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Expense</label>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <div style="font-weight: 600; color: #1e293b; font-size: 1.125rem; cursor: pointer;"
                                     onclick="window.showExpenseModal()">
                                    ${currentExpense.total > 0 ? formatCurrency(currentExpense.total) : '—'}
                                </div>
                                <button class="btn btn-sm btn-secondary" onclick="window.refreshExpense()" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">🔄 Refresh</button>
                            </div>
                            <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">
                                Click amount to view breakdown
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Remaining Budget</label>
                            ${(() => {
                                const budget = parseFloat(currentProject.budget || 0);
                                const remaining = budget - currentExpense.total;
                                const color = remaining >= 0 ? '#059669' : '#ef4444';
                                return budget > 0
                                    ? `<div style="font-weight: 600; color: ${color}; font-size: 1.125rem;">${formatCurrency(remaining)}</div>`
                                    : `<div style="font-weight: 600; color: #64748b; font-size: 1.125rem;">—</div>`;
                            })()}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Card 3 - Status & Assignment -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body" style="padding: 1.5rem;">
                    <h3 style="margin: 0 0 1rem 0; font-size: 1.125rem; font-weight: 600;">Status & Assignment</h3>

                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.25rem;">Internal Status</label>
                            <select data-field="internal_status" onchange="window.saveField('internal_status', this.value)" ${!showEditControls ? 'disabled' : ''}>
                                ${INTERNAL_STATUS_OPTIONS.map(s => `<option value="${s}" ${currentProject.internal_status === s ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.25rem;">Project Status</label>
                            <select data-field="project_status" onchange="window.saveField('project_status', this.value)" ${!showEditControls ? 'disabled' : ''}>
                                ${PROJECT_STATUS_OPTIONS.map(s => `<option value="${s}" ${currentProject.project_status === s ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Delete Button (Below All Cards) -->
            ${showEditControls ? `
                <div style="text-align: center; margin-top: 2rem; padding-bottom: 2rem;">
                    <button class="btn btn-danger" onclick="window.confirmDelete()">Delete Project</button>
                </div>
            ` : ''}
        </div>
    `;

    // Restore focus if field was focused before re-render
    if (focusedField) {
        const field = document.querySelector(`[data-field="${focusedField}"]`);
        if (field) field.focus();
    }

    // Populate personnel datalist
    populatePersonnelDatalist();
}

// Save field
async function saveField(fieldName, newValue) {
    // Guard: check edit permission
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return false;
    }

    // Reject locked fields
    if (['project_code', 'client_id', 'client_code'].includes(fieldName)) {
        console.error('[ProjectDetail] Attempted to edit locked field:', fieldName);
        return false;
    }

    clearFieldError(fieldName);

    // Validation
    if (fieldName === 'project_name' && !newValue.trim()) {
        showFieldError(fieldName, 'Project name is required');
        return false;
    }

    if ((fieldName === 'budget' || fieldName === 'contract_cost') && newValue) {
        const num = parseFloat(newValue);
        if (isNaN(num) || num <= 0) {
            showFieldError(fieldName, 'Must be a positive number (greater than 0)');
            return false;
        }
    }

    // Prepare value
    let valueToSave = newValue;
    if (fieldName === 'budget' || fieldName === 'contract_cost') {
        valueToSave = newValue ? parseFloat(newValue) : null;
    } else if (fieldName === 'personnel') {
        const trimmedValue = newValue.trim();
        if (trimmedValue) {
            // Try to match to a real user from the datalist
            const matchedUser = usersData.find(u =>
                u.full_name === trimmedValue || u.email === trimmedValue
            );
            if (matchedUser) {
                // Migrate to new format: store user ID and name, clear legacy field
                try {
                    await updateDoc(doc(db, 'projects', currentProject.id), {
                        personnel_user_id: matchedUser.id,
                        personnel_name: matchedUser.full_name,
                        personnel: null,
                        updated_at: new Date().toISOString()
                    });
                    showToast('Personnel updated', 'success');
                } catch (error) {
                    console.error('[ProjectDetail] Error saving personnel:', error);
                    showToast('Failed to update personnel', 'error');
                }
                return; // Early return -- we handled the save ourselves
            } else {
                // Freetext fallback: keep in legacy field, clear new fields
                try {
                    await updateDoc(doc(db, 'projects', currentProject.id), {
                        personnel: trimmedValue,
                        personnel_user_id: null,
                        personnel_name: null,
                        updated_at: new Date().toISOString()
                    });
                    showToast('Personnel updated', 'success');
                } catch (error) {
                    console.error('[ProjectDetail] Error saving personnel:', error);
                    showToast('Failed to update personnel', 'error');
                }
                return; // Early return
            }
        } else {
            // Field cleared: null out ALL personnel fields
            try {
                await updateDoc(doc(db, 'projects', currentProject.id), {
                    personnel: null,
                    personnel_user_id: null,
                    personnel_name: null,
                    updated_at: new Date().toISOString()
                });
                showToast('Personnel cleared', 'success');
            } catch (error) {
                console.error('[ProjectDetail] Error clearing personnel:', error);
                showToast('Failed to clear personnel', 'error');
            }
            return; // Early return
        }
    } else if (fieldName === 'project_name') {
        valueToSave = newValue.trim();
    }

    try {
        const projectRef = doc(db, 'projects', currentProject.id);
        await updateDoc(projectRef, {
            [fieldName]: valueToSave,
            updated_at: new Date().toISOString()
        });
        // Silent success per CONTEXT.md
        console.log('[ProjectDetail] Saved', fieldName);
        return true;
    } catch (error) {
        console.error('[ProjectDetail] Save failed:', error);
        showFieldError(fieldName, 'Failed to save. Please try again.');
        return false;
    }
}

// Refresh expense calculation
async function refreshExpense() {
    if (!currentProject) return;

    showLoading(true);
    try {
        // Aggregate POs for this project
        const posQuery = query(
            collection(db, 'pos'),
            where('project_name', '==', currentProject.project_name)
        );

        const posAggregate = await getAggregateFromServer(posQuery, {
            totalAmount: sum('total_amount'),
            poCount: count()
        });

        // Aggregate TRs for this project
        const trsQuery = query(
            collection(db, 'transport_requests'),
            where('project_name', '==', currentProject.project_name)
        );

        const trsAggregate = await getAggregateFromServer(trsQuery, {
            totalAmount: sum('total_amount'),
            trCount: count()
        });

        const poTotal = posAggregate.data().totalAmount || 0;
        const trTotal = trsAggregate.data().totalAmount || 0;

        currentExpense = {
            total: poTotal + trTotal,
            poCount: posAggregate.data().poCount || 0,
            trCount: trsAggregate.data().trCount || 0
        };

        // Re-render to show updated expense
        renderProjectDetail();

        showToast('Expense refreshed', 'success');
    } catch (error) {
        console.error('[ProjectDetail] Expense calculation failed:', error);
        showToast('Failed to calculate expense', 'error');
    } finally {
        showLoading(false);
    }
}

// Show expense breakdown modal
async function showExpenseModal() {
    if (!currentProject) return;

    showLoading(true);
    try {
        // Fetch all POs for this project
        const posQuery = query(
            collection(db, 'pos'),
            where('project_name', '==', currentProject.project_name)
        );

        const posSnapshot = await getDocs(posQuery);
        const categoryTotals = {};
        let materialTotal = 0;

        posSnapshot.forEach(poDoc => {
            const po = poDoc.data();
            const items = JSON.parse(po.items_json || '[]');

            items.forEach(item => {
                const category = item.category || 'Uncategorized';
                const subtotal = parseFloat(item.subtotal || 0);

                if (!categoryTotals[category]) {
                    categoryTotals[category] = { amount: 0, items: [] };
                }
                categoryTotals[category].amount += subtotal;
                categoryTotals[category].items.push({
                    po_id: po.po_id,
                    item_name: item.item_name,
                    quantity: item.quantity,
                    unit: item.unit,
                    unit_cost: item.unit_cost,
                    subtotal
                });

                materialTotal += subtotal;
            });
        });

        // Fetch TRs for transport fees
        const trsQuery = query(
            collection(db, 'transport_requests'),
            where('project_name', '==', currentProject.project_name)
        );

        const trsSnapshot = await getDocs(trsQuery);
        let transportTotal = 0;
        trsSnapshot.forEach(trDoc => {
            const tr = trDoc.data();
            transportTotal += parseFloat(tr.total_amount || 0);
        });

        // Create and show modal
        const modalHTML = `
            <div id="expenseModal" class="modal active">
                <div class="modal-content" style="max-width: 900px;">
                    <div class="modal-header">
                        <h3>Project Expense Breakdown</h3>
                        <button class="modal-close" onclick="window.closeExpenseModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <!-- Scorecards -->
                        <div class="expense-summary-grid">
                            <div class="expense-summary-card">
                                <div class="expense-summary-label">Material Purchases</div>
                                <div class="expense-summary-value">${formatCurrency(materialTotal)}</div>
                            </div>
                            <div class="expense-summary-card">
                                <div class="expense-summary-label">Transport Fees</div>
                                <div class="expense-summary-value">${formatCurrency(transportTotal)}</div>
                            </div>
                            <div class="expense-summary-card total">
                                <div class="expense-summary-label">Total Expense</div>
                                <div class="expense-summary-value">${formatCurrency(materialTotal + transportTotal)}</div>
                            </div>
                        </div>

                        <!-- Category Breakdown -->
                        ${Object.keys(categoryTotals).length > 0 ? `
                            <h4 style="margin-top: 2rem; margin-bottom: 1rem;">By Category</h4>
                            ${Object.entries(categoryTotals).map(([category, data]) => `
                                <div class="category-card">
                                    <div class="category-header">
                                        <span class="category-name">${category}</span>
                                        <span class="category-amount">${formatCurrency(data.amount)}</span>
                                    </div>
                                    <div class="category-items">
                                        <table class="modal-items-table">
                                            <thead>
                                                <tr>
                                                    <th>PO ID</th>
                                                    <th>Item</th>
                                                    <th>Qty</th>
                                                    <th>Unit Cost</th>
                                                    <th style="text-align: right;">Subtotal</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${data.items.map(item => `
                                                    <tr>
                                                        <td>${item.po_id}</td>
                                                        <td>${item.item_name}</td>
                                                        <td>${item.quantity} ${item.unit}</td>
                                                        <td>${formatCurrency(item.unit_cost)}</td>
                                                        <td style="text-align: right;">${formatCurrency(item.subtotal)}</td>
                                                    </tr>
                                                `).join('')}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            `).join('')}
                        ` : '<p style="color: #64748b; text-align: center;">No material purchases recorded.</p>'}
                    </div>
                </div>
            </div>
        `;

        // Inject modal into DOM
        const existingModal = document.getElementById('expenseModal');
        if (existingModal) existingModal.remove();

        document.body.insertAdjacentHTML('beforeend', modalHTML);

    } catch (error) {
        console.error('[ProjectDetail] Expense modal failed:', error);
        showToast('Failed to load expense breakdown', 'error');
    } finally {
        showLoading(false);
    }
}

function closeExpenseModal() {
    const modal = document.getElementById('expenseModal');
    if (modal) modal.remove();
}

// Toggle active status
async function toggleActive(newValue) {
    // Guard: check edit permission
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return;
    }

    try {
        const projectRef = doc(db, 'projects', currentProject.id);
        await updateDoc(projectRef, {
            active: newValue,
            updated_at: new Date().toISOString()
        });
        console.log('[ProjectDetail] Active status updated to:', newValue);
    } catch (error) {
        console.error('[ProjectDetail] Toggle failed:', error);
        showToast('Failed to update status', 'error');
    }
}

// Confirm delete
async function confirmDelete() {
    // Guard: check edit permission
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return;
    }

    const confirmed = confirm(`Delete project "${currentProject.project_name}"? This cannot be undone.`);
    if (!confirmed) return;

    showLoading(true);
    try {
        await deleteDoc(doc(db, 'projects', currentProject.id));
        showToast('Project deleted', 'success');
        window.location.hash = '#/projects';
    } catch (error) {
        console.error('[ProjectDetail] Delete failed:', error);
        showToast('Failed to delete project', 'error');
    } finally {
        showLoading(false);
    }
}

// Show field error
function showFieldError(fieldName, message) {
    const field = document.querySelector(`[data-field="${fieldName}"]`);
    if (!field) return;

    clearFieldError(fieldName);

    const errorEl = document.createElement('div');
    errorEl.className = 'field-error-message';
    errorEl.textContent = message;
    errorEl.style.cssText = 'color: #ef4444; font-size: 0.875rem; margin-top: 0.25rem;';

    field.parentNode.appendChild(errorEl);
    field.style.borderColor = '#ef4444';
}

// Clear field error
function clearFieldError(fieldName) {
    const field = document.querySelector(`[data-field="${fieldName}"]`);
    if (!field) return;

    const errorMsg = field.parentNode.querySelector('.field-error-message');
    if (errorMsg) errorMsg.remove();

    field.style.borderColor = '';
}

// Attach window functions
function attachWindowFunctions() {
    window.saveField = saveField;
    window.toggleActive = toggleActive;
    window.confirmDelete = confirmDelete;
    window.refreshExpense = refreshExpense;
    window.showExpenseModal = showExpenseModal;
    window.closeExpenseModal = closeExpenseModal;
}

console.log('[ProjectDetail] Module loaded');
