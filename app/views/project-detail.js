/* ========================================
   PROJECT DETAIL VIEW
   Full-page project detail with inline editing
   ======================================== */

import { db, collection, doc, getDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, getAggregateFromServer, sum, count } from '../firebase.js';
import { formatCurrency, formatDate, showLoading, showToast, normalizePersonnel, syncPersonnelToAssignments } from '../utils.js';

let currentProject = null;
let projectCode = null;
let listener = null;
let usersData = [];
let usersListenerUnsub = null;
let currentExpense = { total: 0, poCount: 0, trCount: 0 };
let detailSelectedPersonnel = []; // Array of { id: string, name: string } for pill state
let personnelClickOutsideHandler = null;

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

    // Click-outside handler to close personnel dropdown
    personnelClickOutsideHandler = (e) => {
        const container = document.getElementById('detailPillContainer');
        const dropdown = document.getElementById('detailPersonnelDropdown');
        if (dropdown && container && !container.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    };
    document.addEventListener('mousedown', personnelClickOutsideHandler);

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

        // Calculate initial expense (silent — no toast on page load)
        await refreshExpense(true);

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

    // Clean up personnel pill state
    if (personnelClickOutsideHandler) {
        document.removeEventListener('mousedown', personnelClickOutsideHandler);
        personnelClickOutsideHandler = null;
    }
    detailSelectedPersonnel = [];

    currentProject = null;
    projectCode = null;

    delete window.saveField;
    delete window.toggleActive;
    delete window.confirmDelete;
    delete window.refreshExpense;
    delete window.showExpenseModal;
    delete window.closeExpenseModal;
    delete window.selectDetailPersonnel;
    delete window.removeDetailPersonnel;
    delete window.filterDetailPersonnel;
    delete window.showDetailPersonnelDropdown;

    console.log('[ProjectDetail] View destroyed');
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

    // Personnel editing restricted to super_admin and operations_admin only
    const user = window.getCurrentUser?.();
    const canEditPersonnel = showEditControls && (user?.role === 'super_admin' || user?.role === 'operations_admin');

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
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.25rem;">Project Name *</label>
                            <input type="text" data-field="project_name" value="${currentProject.project_name || ''}" onblur="window.saveField('project_name', this.value)" placeholder="Enter project name" ${!showEditControls ? 'disabled' : ''}>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Client</label>
                            <div style="color: #64748b; font-size: 1rem;">${currentProject.client_code || 'N/A'}</div>
                        </div>
                        ${renderPersonnelPills(canEditPersonnel)}
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
        if (focusedField === 'personnel-pills') {
            const searchInput = document.getElementById('detailPersonnelSearch');
            searchInput?.focus();
        } else {
            const field = document.querySelector(`[data-field="${focusedField}"]`);
            if (field) field.focus();
        }
    }
}

// Personnel pill rendering helper
function renderPersonnelPills(showEditControls) {
    const normalized = normalizePersonnel(currentProject);

    // Update module state (but only if search input is not focused, to preserve typing state)
    const searchFocused = document.activeElement?.id === 'detailPersonnelSearch';
    if (!searchFocused) {
        detailSelectedPersonnel = [];
        for (let i = 0; i < normalized.names.length; i++) {
            detailSelectedPersonnel.push({
                id: normalized.userIds[i] || '',
                name: normalized.names[i]
            });
        }
    }

    const pillsHtml = detailSelectedPersonnel.map(user => `
        <span class="personnel-pill ${user.id ? '' : 'legacy'}" data-user-id="${user.id || ''}">
            ${user.name}
            ${showEditControls ? `<button type="button" class="pill-remove"
                onmousedown="event.preventDefault(); window.removeDetailPersonnel('${user.id || ''}', '${user.name.replace(/'/g, "\\'")}')">&times;</button>` : ''}
        </span>
    `).join('');

    if (!showEditControls) {
        return `
            <div class="form-group" style="margin-bottom: 0;">
                <label style="margin-bottom: 0.25rem;">Assigned Personnel</label>
                <div class="pill-input-container disabled">
                    ${pillsHtml || '<span style="color: #94a3b8; font-size: 0.875rem;">Not assigned</span>'}
                </div>
            </div>`;
    }

    return `
        <div class="form-group" style="margin-bottom: 0; position: relative;">
            <label style="margin-bottom: 0.25rem;">Assigned Personnel</label>
            <div class="pill-input-container" id="detailPillContainer"
                 onclick="document.getElementById('detailPersonnelSearch')?.focus()">
                ${pillsHtml}
                <input type="text"
                       class="pill-search-input"
                       id="detailPersonnelSearch"
                       data-field="personnel-pills"
                       placeholder="${detailSelectedPersonnel.length === 0 ? 'Type name or email...' : ''}"
                       oninput="window.filterDetailPersonnel(this.value)"
                       onfocus="window.showDetailPersonnelDropdown()"
                       autocomplete="off">
            </div>
            <div class="pill-dropdown" id="detailPersonnelDropdown" style="display: none;"></div>
        </div>`;
}

// Personnel pill interaction functions
function filterDetailPersonnel(searchText) {
    const dropdown = document.getElementById('detailPersonnelDropdown');
    if (!dropdown) return;

    const term = searchText.toLowerCase().trim();
    const selectedIds = detailSelectedPersonnel.map(u => u.id).filter(Boolean);

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
             onmousedown="event.preventDefault(); window.selectDetailPersonnel('${user.id}', '${user.full_name.replace(/'/g, "\\'")}')">
            <strong>${user.full_name}</strong>
            <span style="color: #64748b; margin-left: 0.5rem;">${user.email}</span>
        </div>
    `).join('');

    dropdown.style.display = 'block';
}

function showDetailPersonnelDropdown() {
    const searchInput = document.getElementById('detailPersonnelSearch');
    if (searchInput?.value?.trim()) {
        filterDetailPersonnel(searchInput.value);
    }
}

async function selectDetailPersonnel(userId, userName) {
    if (!currentProject) return;
    if (detailSelectedPersonnel.some(u => u.id === userId)) return;

    // Capture old state for sync diff
    const previousUserIds = detailSelectedPersonnel.map(u => u.id).filter(Boolean);

    detailSelectedPersonnel.push({ id: userId, name: userName });

    // Save immediately to Firestore
    try {
        await updateDoc(doc(db, 'projects', currentProject.id), {
            personnel_user_ids: detailSelectedPersonnel.map(u => u.id).filter(Boolean),
            personnel_names: detailSelectedPersonnel.map(u => u.name),
            personnel_user_id: null,
            personnel_name: null,
            personnel: null,
            updated_at: new Date().toISOString()
        });
        console.log('[ProjectDetail] Personnel added:', userName);

        // Sync assignment (fire-and-forget)
        const newUserIds = detailSelectedPersonnel.map(u => u.id).filter(Boolean);
        syncPersonnelToAssignments(currentProject.project_code, previousUserIds, newUserIds)
            .catch(err => console.error('[ProjectDetail] Assignment sync failed:', err));
    } catch (error) {
        console.error('[ProjectDetail] Error saving personnel:', error);
        showToast('Failed to add personnel', 'error');
        detailSelectedPersonnel = detailSelectedPersonnel.filter(u => u.id !== userId);
    }

    // Clear search and close dropdown
    const searchInput = document.getElementById('detailPersonnelSearch');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    const dropdown = document.getElementById('detailPersonnelDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

async function removeDetailPersonnel(userId, userName) {
    if (!currentProject) return;

    const previousState = [...detailSelectedPersonnel];

    if (userId) {
        detailSelectedPersonnel = detailSelectedPersonnel.filter(u => u.id !== userId);
    } else {
        detailSelectedPersonnel = detailSelectedPersonnel.filter(u => u.name !== userName);
    }

    // Save immediately to Firestore
    try {
        await updateDoc(doc(db, 'projects', currentProject.id), {
            personnel_user_ids: detailSelectedPersonnel.map(u => u.id).filter(Boolean),
            personnel_names: detailSelectedPersonnel.map(u => u.name),
            personnel_user_id: null,
            personnel_name: null,
            personnel: null,
            updated_at: new Date().toISOString()
        });
        console.log('[ProjectDetail] Personnel removed:', userName || userId);

        // Sync assignment (fire-and-forget)
        const previousUserIds = previousState.map(u => u.id).filter(Boolean);
        const newUserIds = detailSelectedPersonnel.map(u => u.id).filter(Boolean);
        syncPersonnelToAssignments(currentProject.project_code, previousUserIds, newUserIds)
            .catch(err => console.error('[ProjectDetail] Assignment sync failed:', err));
    } catch (error) {
        console.error('[ProjectDetail] Error removing personnel:', error);
        showToast('Failed to remove personnel', 'error');
        detailSelectedPersonnel = previousState;
    }
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
async function refreshExpense(silent = false) {
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

        if (!silent) showToast('Expense refreshed', 'success');
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
        const transportCategoryItems = [];
        let materialTotal = 0;

        posSnapshot.forEach(poDoc => {
            const po = poDoc.data();
            const items = JSON.parse(po.items_json || '[]');

            items.forEach(item => {
                // Handle different property name variations (item vs item_name, qty vs quantity, etc.)
                const itemName = item.item || item.item_name || item.itemName || item.name || 'Unnamed Item';
                const qty = item.qty || item.quantity || 0;
                const unit = item.unit || 'pcs';
                const unitCost = parseFloat(item.unit_cost || item.unitCost || item.price || 0);
                const subtotal = parseFloat(item.subtotal || item.total || (qty * unitCost) || 0);
                const category = item.category || 'Uncategorized';

                // Check if this is a transportation item
                const isTransportItem = category.toLowerCase().includes('transportation') ||
                                       category.toLowerCase().includes('hauling');

                if (isTransportItem) {
                    // Add to transport category items
                    transportCategoryItems.push({
                        po_id: po.po_id,
                        item_name: itemName,
                        quantity: qty,
                        unit: unit,
                        unit_cost: unitCost,
                        subtotal: subtotal,
                        category: category
                    });
                } else {
                    // Regular material category
                    if (!categoryTotals[category]) {
                        categoryTotals[category] = { amount: 0, items: [], expanded: false };
                    }
                    categoryTotals[category].amount += subtotal;
                    categoryTotals[category].items.push({
                        po_id: po.po_id,
                        item_name: itemName,
                        quantity: qty,
                        unit: unit,
                        unit_cost: unitCost,
                        subtotal: subtotal
                    });
                }

                materialTotal += subtotal;
            });
        });

        // Fetch TRs for transport fees
        const trsQuery = query(
            collection(db, 'transport_requests'),
            where('project_name', '==', currentProject.project_name)
        );

        const trsSnapshot = await getDocs(trsQuery);
        const transportRequests = [];
        let transportTotal = 0;

        trsSnapshot.forEach(trDoc => {
            const tr = trDoc.data();
            const amount = parseFloat(tr.total_amount || 0);
            transportTotal += amount;
            transportRequests.push({
                tr_id: tr.tr_id,
                supplier: tr.supplier_name || 'N/A',
                amount: amount,
                date: tr.date_generated
            });
        });

        // Add transport category items to transport total
        const transportCategoryTotal = transportCategoryItems.reduce((sum, item) => sum + item.subtotal, 0);
        transportTotal += transportCategoryTotal;

        // Create and show modal with tabs
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
                                <div class="expense-summary-value">${formatCurrency(materialTotal - transportCategoryTotal)}</div>
                            </div>
                            <div class="expense-summary-card">
                                <div class="expense-summary-label">Transport Fees</div>
                                <div class="expense-summary-value">${formatCurrency(transportTotal)}</div>
                            </div>
                            <div class="expense-summary-card total">
                                <div class="expense-summary-label">Total Expense</div>
                                <div class="expense-summary-value">${formatCurrency(materialTotal + (transportTotal - transportCategoryTotal))}</div>
                            </div>
                        </div>

                        <!-- Tab Navigation -->
                        <div class="expense-tabs" style="margin-top: 2rem; border-bottom: 2px solid #e5e7eb;">
                            <button class="expense-tab active" onclick="window.switchExpenseTab('category')" data-tab="category">
                                By Category
                            </button>
                            <button class="expense-tab" onclick="window.switchExpenseTab('transport')" data-tab="transport">
                                Transport Fees
                            </button>
                        </div>

                        <!-- By Category Tab Content -->
                        <div id="categoryTabContent" class="expense-tab-content active" style="margin-top: 1.5rem;">
                            ${Object.keys(categoryTotals).length > 0 ? `
                                ${Object.entries(categoryTotals).map(([category, data]) => `
                                    <div class="category-card collapsible">
                                        <div class="category-header" onclick="window.toggleCategory(this)">
                                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                <span class="category-toggle">▶</span>
                                                <span class="category-name">${category}</span>
                                            </div>
                                            <span class="category-amount">${formatCurrency(data.amount)}</span>
                                        </div>
                                        <div class="category-items" style="display: none;">
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
                            ` : '<p style="color: #64748b; text-align: center; padding: 2rem;">No material purchases recorded.</p>'}
                        </div>

                        <!-- Transport Fees Tab Content -->
                        <div id="transportTabContent" class="expense-tab-content" style="display: none; margin-top: 1.5rem;">
                            ${transportRequests.length > 0 || transportCategoryItems.length > 0 ? `
                                ${transportRequests.length > 0 ? `
                                    <div class="category-card collapsible">
                                        <div class="category-header" onclick="window.toggleCategory(this)">
                                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                <span class="category-toggle">▶</span>
                                                <span class="category-name">Transport Requests</span>
                                            </div>
                                            <span class="category-amount">${formatCurrency(transportRequests.reduce((sum, tr) => sum + tr.amount, 0))}</span>
                                        </div>
                                        <div class="category-items" style="display: none;">
                                            <table class="modal-items-table">
                                                <thead>
                                                    <tr>
                                                        <th>TR ID</th>
                                                        <th>Supplier</th>
                                                        <th style="text-align: right;">Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${transportRequests.map(tr => `
                                                        <tr>
                                                            <td>${tr.tr_id}</td>
                                                            <td>${tr.supplier}</td>
                                                            <td style="text-align: right;">${formatCurrency(tr.amount)}</td>
                                                        </tr>
                                                    `).join('')}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ` : ''}
                                ${transportCategoryItems.length > 0 ? `
                                    <div class="category-card collapsible">
                                        <div class="category-header" onclick="window.toggleCategory(this)">
                                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                <span class="category-toggle">▶</span>
                                                <span class="category-name">Transportation & Hauling</span>
                                            </div>
                                            <span class="category-amount">${formatCurrency(transportCategoryTotal)}</span>
                                        </div>
                                        <div class="category-items" style="display: none;">
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
                                                    ${transportCategoryItems.map(item => `
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
                                ` : ''}
                            ` : '<p style="color: #64748b; text-align: center; padding: 2rem;">No transport fees recorded.</p>'}
                        </div>
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

// Switch expense modal tabs
function switchExpenseTab(tabName) {
    // Update tab buttons
    const tabs = document.querySelectorAll('.expense-tab');
    tabs.forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Update tab content
    const categoryContent = document.getElementById('categoryTabContent');
    const transportContent = document.getElementById('transportTabContent');

    if (tabName === 'category') {
        categoryContent.style.display = 'block';
        transportContent.style.display = 'none';
    } else {
        categoryContent.style.display = 'none';
        transportContent.style.display = 'block';
    }
}

// Toggle category expansion
function toggleCategory(headerElement) {
    const card = headerElement.closest('.category-card');
    const itemsDiv = card.querySelector('.category-items');
    const toggle = card.querySelector('.category-toggle');

    if (itemsDiv.style.display === 'none' || !itemsDiv.style.display) {
        itemsDiv.style.display = 'block';
        toggle.textContent = '▼';
        card.classList.add('expanded');
    } else {
        itemsDiv.style.display = 'none';
        toggle.textContent = '▶';
        card.classList.remove('expanded');
    }
}

// Toggle active status
async function toggleActive(newValue) {
    // Guard: check edit permission
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return;
    }

    // Confirm deactivation only (Active → Inactive)
    if (!newValue) {
        const confirmed = confirm('Deactivate this project? Inactive projects cannot be selected for MRFs.');
        if (!confirmed) return;
    }

    try {
        const projectRef = doc(db, 'projects', currentProject.id);
        await updateDoc(projectRef, {
            active: newValue,
            updated_at: new Date().toISOString()
        });
        showToast(`Project ${newValue ? 'activated' : 'deactivated'}`, 'success');
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
    window.switchExpenseTab = switchExpenseTab;
    window.toggleCategory = toggleCategory;
    window.selectDetailPersonnel = selectDetailPersonnel;
    window.removeDetailPersonnel = removeDetailPersonnel;
    window.filterDetailPersonnel = filterDetailPersonnel;
    window.showDetailPersonnelDropdown = showDetailPersonnelDropdown;
}

console.log('[ProjectDetail] Module loaded');
