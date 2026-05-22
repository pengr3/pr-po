/* ========================================
   SERVICE DETAIL VIEW
   Full-page service detail with inline editing,
   personnel assignment pills, and expense stub
   ======================================== */

import { db, collection, doc, getDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, getAggregateFromServer, sum, count } from '../firebase.js';
import { formatCurrency, formatDate, showLoading, showToast, normalizePersonnel, syncServicePersonnelToAssignments, getAssignedServiceCodes, downloadCSV, escapeHTML } from '../utils.js';
import { recordEditHistory, showEditHistoryModal } from '../edit-history.js';
import { showExpenseBreakdownModal } from '../expense-modal.js';
import { createNotificationForUsers, NOTIFICATION_TYPES } from '../notifications.js';
// Phase 87.1 D-05 — inline proposal card
import { renderAgeBadge, _applyProposalStateTransition } from './proposals.js';
import { openProposalModal, openCreateProposalModal } from '../proposal-modal.js';

let currentService = null;
let currentServiceDocId = null;
let serviceParam = null;
let clientsData = [];
let usersData = [];
let selectedDetailPersonnel = []; // Array of { id: string, name: string } for pill state
let listener = null;
let usersListenerUnsub = null;
let personnelClickOutsideHandler = null;
let currentServiceExpense = { mrfCount: 0, prTotal: 0, prCount: 0, poTotal: 0, poCount: 0, totalPaid: 0, remainingPayable: 0, hasRfps: false };
// Phase 85 D-06 / D-01: collectibles aggregation alongside currentServiceExpense (mirror of project-detail.js currentCollectibles)
let currentServiceCollectibles = { totalRequested: 0, totalCollected: 0, remainingCollectible: 0 };

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

// Render loading skeleton — actual content renders after init() loads data
export function render(activeTab = null, param = null) {
    serviceParam = param;
    return `
        <div id="serviceDetailContainer">
            <div class="container" style="margin-top: 2rem;">
                <div class="card">
                    <div class="card-body" style="text-align: center; padding: 3rem;">
                        <p style="color: #64748b;">Loading service details...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Initialize view
export async function init(activeTab = null, param = null) {
    serviceParam = param || serviceParam;
    attachWindowFunctions();

    // Click-outside handler to close personnel dropdown
    personnelClickOutsideHandler = (e) => {
        const container = document.getElementById('serviceDetailPillContainer');
        const dropdown = document.getElementById('serviceDetailPersonnelDropdown');
        if (dropdown && container && !container.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    };
    document.addEventListener('mousedown', personnelClickOutsideHandler);

    // Listen for permission changes and re-render
    const permissionChangeHandler = () => {
        renderServiceDetail();
    };
    window.addEventListener('permissionsChanged', permissionChangeHandler);
    if (!window._serviceDetailPermissionHandler) {
        window._serviceDetailPermissionHandler = permissionChangeHandler;
    }

    // Re-check access when assignments change
    const assignmentChangeHandler = () => {
        if (currentService) {
            checkServiceAccess();
        }
    };
    window.addEventListener('assignmentsChanged', assignmentChangeHandler);
    if (!window._serviceDetailAssignmentHandler) {
        window._serviceDetailAssignmentHandler = assignmentChangeHandler;
    }

    if (!serviceParam) {
        document.getElementById('serviceDetailContainer').innerHTML = `
            <div class="container" style="margin-top: 2rem;">
                <div class="card">
                    <div class="card-body">
                        <p>No service specified.</p>
                        <a href="#/services" class="btn btn-primary">Back to Services</a>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    // Load active users for personnel datalist — only needed for admin roles that can edit personnel
    const currentUser = window.getCurrentUser?.();
    if (currentUser?.role === 'services_admin' || currentUser?.role === 'super_admin') {
        const usersQuery = query(collection(db, 'users'), where('status', '==', 'active'));
        usersListenerUnsub = onSnapshot(usersQuery,
            (snapshot) => {
                usersData = [];
                snapshot.forEach(d => {
                    const data = d.data();
                    usersData.push({
                        id: d.id,
                        full_name: data.full_name || '',
                        email: data.email || ''
                    });
                });
                usersData.sort((a, b) => a.full_name.localeCompare(b.full_name));
            },
            (error) => { console.error('[ServiceDetail] Users listener error:', error.message); }
        );
    }

    // Find service by service_code field
    const q = query(collection(db, 'services'), where('service_code', '==', serviceParam));
    listener = onSnapshot(q,
        async (snapshot) => {
            if (snapshot.empty) {
                document.getElementById('serviceDetailContainer').innerHTML = `
                    <div class="container" style="margin-top: 2rem;">
                        <div class="card">
                            <div class="card-body">
                                <p>Service not found.</p>
                                <a href="#/services" class="btn btn-primary">Back to Services</a>
                            </div>
                        </div>
                    </div>
                `;
                return;
            }

            const docSnap = snapshot.docs[0];
            currentServiceDocId = docSnap.id;
            currentService = { id: docSnap.id, ...docSnap.data() };

            if (!checkServiceAccess()) return;

            await refreshServiceExpense(true);
            // Note: refreshServiceExpense() calls renderServiceDetail() on success.
            // On error it catches silently — currentServiceExpense retains last known values.
        },
        (error) => {
            console.error('[ServiceDetail] Services listener error:', error.message);
            if (error.code === 'permission-denied') {
                const container = document.getElementById('serviceDetailContainer');
                if (container) container.innerHTML = `
                    <div class="container" style="margin-top: 2rem;">
                        <div class="card">
                            <div class="card-body">
                                <div class="empty-state">
                                    <div class="empty-state-icon">🔒</div>
                                    <h3>Access Denied</h3>
                                    <p>You do not have permission to view this service.</p>
                                    <a href="#/services" class="btn btn-primary" style="margin-top: 1rem;">Back to Services</a>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
    );
}

// Cleanup
export async function destroy() {
    if (window._serviceDetailPermissionHandler) {
        window.removeEventListener('permissionsChanged', window._serviceDetailPermissionHandler);
        delete window._serviceDetailPermissionHandler;
    }

    if (window._serviceDetailAssignmentHandler) {
        window.removeEventListener('assignmentsChanged', window._serviceDetailAssignmentHandler);
        delete window._serviceDetailAssignmentHandler;
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
    clientsData = [];

    if (personnelClickOutsideHandler) {
        document.removeEventListener('mousedown', personnelClickOutsideHandler);
        personnelClickOutsideHandler = null;
    }
    selectedDetailPersonnel = [];
    currentServiceExpense = { mrfCount: 0, prTotal: 0, prCount: 0, poTotal: 0, poCount: 0, totalPaid: 0, remainingPayable: 0, hasRfps: false };
    // Phase 85 D-06: reset collectibles state alongside currentServiceExpense
    currentServiceCollectibles = { totalRequested: 0, totalCollected: 0, remainingCollectible: 0 };

    currentService = null;
    currentServiceDocId = null;
    serviceParam = null;

    delete window.saveServiceField;
    delete window.toggleServiceDetailActive;
    delete window.selectDetailServicePersonnel;
    delete window.removeDetailServicePersonnel;
    delete window.filterDetailServicePersonnelDropdown;
    delete window.showDetailServicePersonnelDropdown;
    delete window.refreshServiceExpense;
    delete window.showServiceExpenseModal;
    delete window.refreshAndShowServiceExpenseModal;
    delete window.showEditHistory;
    delete window.exportServiceExpenseCSV;
    // Phase 87.1 D-05 — inline proposal card window functions cleanup
    delete window.openProposalModal;
    delete window.openProposalInlineSubmitModal;
    delete window.closeProposalInlineSubmitModal;
    delete window.confirmProposalInlineSubmit;
    // Phase 87.3 D-01 — Start Proposal window functions cleanup
    delete window.openCreateProposalModal;
    delete window._startProposalCallback;
    document.getElementById('proposal-inline-submit-modal')?.remove();
}

/**
 * Check if the current user has access to the current service.
 * For services_user without all_services, the service must be in assigned_service_codes.
 * Returns true if access is allowed, false and renders access denied if denied.
 */
function checkServiceAccess() {
    const assignedCodes = window.getAssignedServiceCodes?.();

    // null means no filtering — all roles except scoped services_user
    if (assignedCodes === null) return true;

    // If current service has no service_code (edge case), allow defensively
    if (!currentService?.service_code) return true;

    // Check if this service is in the assigned set
    if (assignedCodes.includes(currentService.service_code)) return true;

    // Access denied — render message in place
    const container = document.getElementById('serviceDetailContainer');
    if (container) {
        container.innerHTML = `
            <div class="container" style="margin-top: 2rem;">
                <div class="card">
                    <div class="card-body">
                        <div class="empty-state">
                            <div class="empty-state-icon">🔒</div>
                            <h3>Access Denied</h3>
                            <p>You do not have access to this service.</p>
                            <p style="color: #64748b; font-size: 0.875rem;">This service has been removed from your assigned services.</p>
                            <a href="#/services" class="btn btn-primary" style="margin-top: 1rem;">Back to Services</a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else {
        window.location.hash = '#/services';
    }
    return false;
}

// Render service detail — 3-card layout
function renderServiceDetail() {
    const container = document.getElementById('serviceDetailContainer');
    if (!container || !currentService) return;

    const canEdit = window.canEditTab?.('services');
    const showEditControls = canEdit === true;

    // Personnel editing restricted to super_admin and services_admin only
    const user = window.getCurrentUser?.();
    const canEditPersonnel = showEditControls && (user?.role === 'super_admin' || user?.role === 'services_admin');

    const focusedField = document.activeElement?.dataset?.field;

    // ----- Phase 87.3 D-07: proposalInlineCard always rendered; loadProposalCard handles all branching -----
    const proposalCardHtml = '<div id="proposalInlineCard" style="margin-top:1rem;"></div>';

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
                    <span class="status-badge ${currentService.active ? 'approved' : 'rejected'}"
                          style="cursor: ${showEditControls ? 'pointer' : 'default'}; font-size: 0.875rem; padding: 0.5rem 1rem; transition: all 0.2s;"
                          ${showEditControls ? `onclick="window.toggleServiceDetailActive(${!currentService.active})"` : ''}>
                        ${currentService.active ? '✓ Active' : '✗ Inactive'}
                    </span>
                    <button class="btn btn-sm btn-secondary"
                            onclick="window.location.hash='#/services'"
                            style="padding: 0.4rem 0.75rem; font-size: 0.8rem;">
                        ← Back to Services
                    </button>
                </div>
            </div>

            <!-- Card 1 — Service Information -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body" style="padding: 1.5rem;">
                    <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 0.75rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <h3 style="margin: 0 0 0.25rem 0; font-size: 1.125rem; font-weight: 600;">Service Information</h3>
                            <p style="color: #94a3b8; font-size: 0.875rem; margin: 0;">Created: ${formatDate(currentService.created_at)}${currentService.updated_at ? ' | Updated: ' + formatDate(currentService.updated_at) : ''}</p>
                        </div>
                        <button class="btn btn-sm btn-secondary" onclick="window.showEditHistory()" style="white-space: nowrap; padding: 0.4rem 0.75rem; font-size: 0.8rem;">
                            Edit History
                        </button>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                        <!-- Service Code — locked -->
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Service Code</label>
                            <div style="color: #64748b; font-size: 1rem; font-family: monospace;">${escapeHTML(currentService.service_code || '—')}</div>
                        </div>

                        <!-- Service Name — editable -->
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.25rem;">Service Name *</label>
                            <input type="text"
                                   data-field="service_name"
                                   value="${escapeHTML(currentService.service_name || '')}"
                                   onblur="window.saveServiceField('service_name', this.value)"
                                   placeholder="Enter service name"
                                   ${!showEditControls ? 'disabled' : ''}>
                        </div>

                        <!-- Service Type — display only (locked post-creation) -->
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Service Type</label>
                            <div>
                                <span class="status-badge ${currentService.service_type === 'recurring' ? 'approved' : 'pending'}"
                                      style="font-size: 0.8rem;">
                                    ${currentService.service_type === 'recurring' ? 'Recurring' : 'One-time'}
                                </span>
                            </div>
                        </div>

                        <!-- Client — locked -->
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Client</label>
                            <div style="color: #64748b; font-size: 1rem;">${escapeHTML(currentService.client_code || currentService.client_name || 'N/A')}</div>
                        </div>

                        <!-- Location — editable -->
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.25rem;">Location</label>
                            <input type="text"
                                   data-field="location"
                                   value="${escapeHTML(currentService.location || '')}"
                                   onblur="window.saveServiceField('location', this.value)"
                                   placeholder="(Not set)"
                                   ${!showEditControls ? 'disabled' : ''}>
                        </div>

                        <!-- Personnel Pills -->
                        ${renderPersonnelPills(canEditPersonnel)}
                    </div>
                </div>
            </div>

            <!-- Card 2 — Financial Summary -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body" style="padding: 1.5rem;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
                        <h3 style="margin: 0; font-size: 1.125rem; font-weight: 600;">Financial Summary</h3>
                        <button class="btn btn-sm btn-secondary" onclick="window.exportServiceExpenseCSV()"
                            style="font-size: 0.75rem; padding: 0.25rem 0.75rem; display: flex; align-items: center; gap: 0.35rem;${currentServiceExpense.poCount === 0 ? ' opacity: 0.45; pointer-events: none; cursor: default;' : ''}"
                            ${currentServiceExpense.poCount === 0 ? 'disabled' : ''}>
                            &#8681; Export CSV
                        </button>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.25rem;">Budget ${currentService.budget ? `<small style="color: #64748b; font-weight: normal;">PHP ${formatCurrency(currentService.budget)}</small>` : ''}</label>
                            <input type="number"
                                   data-field="budget"
                                   value="${currentService.budget || ''}"
                                   onblur="window.saveServiceField('budget', this.value)"
                                   placeholder="(Not set)"
                                   min="0"
                                   step="0.01"
                                   ${!showEditControls ? 'disabled' : ''}>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.25rem;">Contract Cost ${currentService.contract_cost ? `<small style="color: #64748b; font-weight: normal;">PHP ${formatCurrency(currentService.contract_cost)}</small>` : ''}</label>
                            <input type="number"
                                   data-field="contract_cost"
                                   value="${currentService.contract_cost || ''}"
                                   onblur="window.saveServiceField('contract_cost', this.value)"
                                   placeholder="(Not set)"
                                   min="0"
                                   step="0.01"
                                   ${!showEditControls ? 'disabled' : ''}>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Projected Cost</label>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <div style="font-weight: 600; color: #1e293b; font-size: 1.125rem; cursor: pointer;"
                                     onclick="window.showServiceExpenseModal()">
                                    ${(currentServiceExpense.prTotal + currentServiceExpense.poTotal) > 0 ? formatCurrency(currentServiceExpense.prTotal + currentServiceExpense.poTotal) : '—'}
                                </div>
                                <button class="btn btn-sm btn-secondary" onclick="window.refreshAndShowServiceExpenseModal()" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">&#x1F504; Refresh</button>
                            </div>
                            <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">
                                Click amount to view breakdown
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Remaining Budget</label>
                            ${(() => {
                                const budget = parseFloat(currentService.budget || 0);
                                const total = currentServiceExpense.prTotal + currentServiceExpense.poTotal;
                                const remaining = budget - total;
                                const color = remaining >= 0 ? '#059669' : '#ef4444';
                                return budget > 0
                                    ? `<div style="font-weight: 600; color: ${color}; font-size: 1.125rem;">${formatCurrency(remaining)}</div>`
                                    : `<div style="font-weight: 600; color: #64748b; font-size: 1.125rem;">—</div>`;
                            })()}
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Paid</label>
                            <div style="font-weight: 600; color: #059669; font-size: 1.125rem;">
                                ${formatCurrency(currentServiceExpense.totalPaid)}
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Remaining Payable</label>
                            <div style="font-weight: 600; color: ${currentServiceExpense.remainingPayable > 0 ? '#ef4444' : '#059669'}; font-size: 1.125rem;">
                                ${formatCurrency(currentServiceExpense.remainingPayable)}
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Collected</label>
                            <div style="font-weight: 600; color: #059669; font-size: 1.125rem;">
                                ${formatCurrency(currentServiceCollectibles.totalCollected)}
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Remaining Collectible</label>
                            <div style="font-weight: 600; color: ${currentServiceCollectibles.remainingCollectible > 0 ? '#ef4444' : '#059669'}; font-size: 1.125rem;">
                                ${formatCurrency(currentServiceCollectibles.remainingCollectible)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Card 3 — Status & Assignment -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body" style="padding: 1.5rem;">
                    <h3 style="margin: 0 0 1rem 0; font-size: 1.125rem; font-weight: 600;">Status & Assignment</h3>

                    <div class="form-group" style="margin-bottom: 0;">
                        <label style="margin-bottom: 0.25rem;">Status</label>
                        <select data-field="project_status"
                                onchange="window.saveServiceField('project_status', this.value)"
                                ${!showEditControls ? 'disabled' : ''}>
                            ${(() => {
                                const current = currentService.project_status || '';
                                const isLegacy = current && !UNIFIED_STATUS_OPTIONS.includes(current);
                                const legacyOption = isLegacy
                                    ? `<option value="${escapeHTML(current)}" selected style="color: #94a3b8; font-style: italic;">${escapeHTML(current)} (legacy)</option>`
                                    : '';
                                return legacyOption + UNIFIED_STATUS_OPTIONS.map(s =>
                                    `<option value="${s}" ${current === s ? 'selected' : ''}>${s}</option>`
                                ).join('');
                            })()}
                        </select>
                    </div>
                </div>
            </div>

            ${proposalCardHtml}
        </div>
    `;

    // Phase 87.3 D-07 — fire-and-forget load of proposal card (unconditional; branching inside loadProposalCard)
    if (currentServiceDocId) {
        loadProposalCard(currentServiceDocId, 'services');
    }

    // Restore focus if field was focused before re-render
    if (focusedField) {
        if (focusedField === 'service-personnel-pills') {
            const searchInput = document.getElementById('serviceDetailPersonnelSearch');
            searchInput?.focus();
        } else {
            const field = document.querySelector(`[data-field="${focusedField}"]`);
            if (field) field.focus();
        }
    }
}

// Personnel pill rendering helper
function renderPersonnelPills(showEditControls) {
    const normalized = normalizePersonnel(currentService);

    // Update module state (but only if search input is not focused, to preserve typing)
    const searchFocused = document.activeElement?.id === 'serviceDetailPersonnelSearch';
    if (!searchFocused) {
        selectedDetailPersonnel = [];
        for (let i = 0; i < normalized.names.length; i++) {
            selectedDetailPersonnel.push({
                id: normalized.userIds[i] || '',
                name: normalized.names[i]
            });
        }
    }

    const pillsHtml = selectedDetailPersonnel.map(u => `
        <span class="personnel-pill ${u.id ? '' : 'legacy'}" data-user-id="${escapeHTML(u.id || '')}">
            ${escapeHTML(u.name)}
            ${showEditControls ? `<button type="button" class="pill-remove"
                onmousedown="event.preventDefault(); window.removeDetailServicePersonnel('${u.id || ''}', '${u.name.replace(/'/g, "\\'")}')">&times;</button>` : ''}
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
            <div class="pill-input-container" id="serviceDetailPillContainer"
                 onclick="document.getElementById('serviceDetailPersonnelSearch')?.focus()">
                ${pillsHtml}
                <input type="text"
                       class="pill-search-input"
                       id="serviceDetailPersonnelSearch"
                       data-field="service-personnel-pills"
                       placeholder="${selectedDetailPersonnel.length === 0 ? 'Type name or email...' : ''}"
                       oninput="window.filterDetailServicePersonnelDropdown(this.value)"
                       onfocus="window.showDetailServicePersonnelDropdown()"
                       autocomplete="off">
            </div>
            <div class="pill-dropdown" id="serviceDetailPersonnelDropdown" style="display: none;"></div>
        </div>`;
}

// Personnel pill interaction functions
function filterDetailServicePersonnelDropdown(searchText) {
    const dropdown = document.getElementById('serviceDetailPersonnelDropdown');
    if (!dropdown) return;

    const term = searchText.toLowerCase().trim();
    const selectedIds = selectedDetailPersonnel.map(u => u.id).filter(Boolean);

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
             onmousedown="event.preventDefault(); window.selectDetailServicePersonnel('${user.id}', '${user.full_name.replace(/'/g, "\\'")}')">
            <strong>${escapeHTML(user.full_name)}</strong>
            <span style="color: #64748b; margin-left: 0.5rem;">${escapeHTML(user.email)}</span>
        </div>
    `).join('');

    dropdown.style.display = 'block';
}

function showDetailServicePersonnelDropdown() {
    const searchInput = document.getElementById('serviceDetailPersonnelSearch');
    if (searchInput?.value?.trim()) {
        filterDetailServicePersonnelDropdown(searchInput.value);
    }
}

async function selectDetailServicePersonnel(userId, userName) {
    if (!currentService || !currentServiceDocId) return;
    if (selectedDetailPersonnel.some(u => u.id === userId)) return;

    const previousUserIds = normalizePersonnel(currentService).userIds;

    selectedDetailPersonnel.push({ id: userId, name: userName });

    try {
        const newUserIds = selectedDetailPersonnel.map(u => u.id).filter(Boolean);
        const newNames = selectedDetailPersonnel.map(u => u.name);

        await updateDoc(doc(db, 'services', currentServiceDocId), {
            personnel_user_ids: newUserIds,
            personnel_names: newNames,
            personnel_user_id: null,
            personnel_name: null,
            personnel: null,
            updated_at: new Date().toISOString()
        });

        // Record edit history (fire-and-forget)
        recordEditHistory(currentServiceDocId, 'personnel_add', [
            { field: 'personnel', old_value: null, new_value: userName }
        ], 'services').catch(err => console.error('[EditHistory] selectDetailServicePersonnel failed:', err));

        // Sync assignments (fire-and-forget)
        syncServicePersonnelToAssignments(currentService.service_code, previousUserIds, newUserIds)
            .catch(err => console.error('[ServiceDetail] Assignment sync failed:', err));

        // Update local state
        currentService.personnel_user_ids = newUserIds;
        currentService.personnel_names = newNames;

    } catch (error) {
        console.error('[ServiceDetail] Error saving personnel:', error);
        showToast('Failed to add personnel', 'error');
        selectedDetailPersonnel = selectedDetailPersonnel.filter(u => u.id !== userId);
    }

    // Clear search and close dropdown
    const searchInput = document.getElementById('serviceDetailPersonnelSearch');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    const dropdown = document.getElementById('serviceDetailPersonnelDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

async function removeDetailServicePersonnel(userId, userName) {
    if (!currentService || !currentServiceDocId) return;

    const previousState = [...selectedDetailPersonnel];
    const previousUserIds = normalizePersonnel(currentService).userIds;

    if (userId) {
        selectedDetailPersonnel = selectedDetailPersonnel.filter(u => u.id !== userId);
    } else {
        selectedDetailPersonnel = selectedDetailPersonnel.filter(u => u.name !== userName);
    }

    try {
        const newUserIds = selectedDetailPersonnel.map(u => u.id).filter(Boolean);
        const newNames = selectedDetailPersonnel.map(u => u.name);

        await updateDoc(doc(db, 'services', currentServiceDocId), {
            personnel_user_ids: newUserIds,
            personnel_names: newNames,
            personnel_user_id: null,
            personnel_name: null,
            personnel: null,
            updated_at: new Date().toISOString()
        });

        // Record edit history (fire-and-forget)
        recordEditHistory(currentServiceDocId, 'personnel_remove', [
            { field: 'personnel', old_value: userName || userId, new_value: null }
        ], 'services').catch(err => console.error('[EditHistory] removeDetailServicePersonnel failed:', err));

        // Sync assignments (fire-and-forget)
        syncServicePersonnelToAssignments(currentService.service_code, previousUserIds, newUserIds)
            .catch(err => console.error('[ServiceDetail] Assignment sync failed:', err));

        // Update local state
        currentService.personnel_user_ids = newUserIds;
        currentService.personnel_names = newNames;

    } catch (error) {
        console.error('[ServiceDetail] Error removing personnel:', error);
        showToast('Failed to remove personnel', 'error');
        selectedDetailPersonnel = previousState;
    }
}

// Save field — inline edit handler
async function saveServiceField(fieldName, newValue) {
    // Guard: check edit permission
    if (window.canEditTab?.('services') !== true) {
        showToast('You do not have permission to edit services', 'error');
        return false;
    }
    // Role check: matches Firestore services update rule (prevents misleading permission-denied errors)
    const _saveUser = window.getCurrentUser?.();
    if (!['super_admin', 'services_admin', 'services_user'].includes(_saveUser?.role)) {
        showToast('Your role does not permit editing services', 'error');
        return false;
    }

    // Locked fields — never save
    if (['service_code', 'client_id', 'client_code', 'service_type'].includes(fieldName)) {
        console.error('[ServiceDetail] Attempted to edit locked field:', fieldName);
        return false;
    }

    clearServiceFieldError(fieldName);

    // Validation
    if (fieldName === 'service_name' && !newValue.trim()) {
        showServiceFieldError(fieldName, 'Service name is required');
        return false;
    }

    if ((fieldName === 'budget' || fieldName === 'contract_cost') && newValue) {
        const num = parseFloat(newValue);
        if (isNaN(num) || num <= 0) {
            showServiceFieldError(fieldName, 'Must be a positive number (greater than 0)');
            return false;
        }
    }

    // Prepare value
    let valueToSave = newValue;
    if (fieldName === 'budget' || fieldName === 'contract_cost') {
        valueToSave = newValue ? parseFloat(newValue) : null;
    } else if (fieldName === 'service_name') {
        valueToSave = newValue.trim();
    }

    // Skip if no actual change
    const oldValue = currentService[fieldName];
    const normalizedOld = (fieldName === 'budget' || fieldName === 'contract_cost')
        ? (oldValue != null ? parseFloat(oldValue) : null)
        : oldValue;
    if (normalizedOld === valueToSave) {
        return true;
    }

    // WR-03: capture recipients BEFORE the await updateDoc call — the onSnapshot
    // listener can update currentService asynchronously between the write and the
    // notification dispatch, potentially returning a stale personnel_user_ids array.
    const NOTIF11_STATUS_WHITELIST = ['Client Approved', 'For Mobilization', 'On-going', 'Completed', 'Loss'];
    const notifRecipients = (fieldName === 'project_status' && NOTIF11_STATUS_WHITELIST.includes(valueToSave))
        ? (currentService.personnel_user_ids || []).filter(Boolean)
        : [];
    const notifServiceLink = currentService.service_code
        ? `#/services/detail/${currentService.service_code}`
        : '#/services';
    const notifServiceName = currentService.service_name;
    const notifSourceId = currentService.service_code || currentServiceDocId;
    // Phase 84.1 NOTIF-19: pre-capture cost-change recipients + display strings (same WR-03 rationale)
    const NOTIF19_COST_FIELDS = ['budget', 'contract_cost'];
    const isCostChange = NOTIF19_COST_FIELDS.includes(fieldName) && normalizedOld !== valueToSave;
    const notifCostRecipients = isCostChange
        ? (currentService.personnel_user_ids || []).filter(Boolean)
        : [];
    const notifCostFieldLabel = fieldName === 'contract_cost' ? 'Contract Cost' : 'Budget';
    const notifCostOldDisplay = (normalizedOld != null) ? `PHP ${formatCurrency(normalizedOld)}` : '(not set)';
    const notifCostNewDisplay = (valueToSave != null) ? `PHP ${formatCurrency(valueToSave)}` : '(not set)';

    try {
        const serviceRef = doc(db, 'services', currentServiceDocId);
        await updateDoc(serviceRef, {
            [fieldName]: valueToSave,
            updated_at: new Date().toISOString()
        });

        // Record edit history (fire-and-forget)
        recordEditHistory(currentServiceDocId, 'update', [
            { field: fieldName, old_value: oldValue ?? null, new_value: valueToSave }
        ], 'services').catch(err => console.error('[EditHistory] saveServiceField failed:', err));

        currentService = { ...currentService, [fieldName]: valueToSave };
        // Phase 84 NOTIF-11: notify personnel of meaningful service status change (D-03: fire-and-forget)
        if (notifRecipients.length > 0) {
            createNotificationForUsers({
                user_ids: notifRecipients,
                type: NOTIFICATION_TYPES.PROJECT_STATUS_CHANGED,
                message: `Service "${notifServiceName}" status changed to: ${valueToSave}`,
                link: notifServiceLink,
                source_collection: 'services',
                source_id: notifSourceId
            }).catch(err => console.error('[ServiceDetail] NOTIF-11 notification failed:', err));
        }
        // Phase 84.1 NOTIF-19: notify personnel of meaningful service cost change (D-03: fire-and-forget)
        if (notifCostRecipients.length > 0) {
            createNotificationForUsers({
                user_ids: notifCostRecipients,
                type: NOTIFICATION_TYPES.PROJECT_COST_CHANGED,
                message: `Service "${notifServiceName}" ${notifCostFieldLabel} changed: ${notifCostOldDisplay} → ${notifCostNewDisplay}`,
                link: notifServiceLink,
                source_collection: 'services',
                source_id: notifSourceId
            }).catch(err => console.error('[ServiceDetail] NOTIF-19 cost-change notification failed:', err));
        }
        return true;
    } catch (error) {
        console.error('[ServiceDetail] Save failed:', error);
        showServiceFieldError(fieldName, 'Failed to save. Please try again.');
        return false;
    }
}

// Toggle active status
async function toggleServiceDetailActive(newValue) {
    if (window.canEditTab?.('services') !== true) {
        showToast('You do not have permission to edit services', 'error');
        return;
    }
    // Role check: matches Firestore services update rule
    const _toggleUser = window.getCurrentUser?.();
    if (!['super_admin', 'services_admin', 'services_user'].includes(_toggleUser?.role)) {
        showToast('Your role does not permit editing services', 'error');
        return;
    }

    if (!newValue) {
        const confirmed = confirm('Deactivate this service? Inactive services cannot be selected for MRFs.');
        if (!confirmed) return;
    }

    try {
        const serviceRef = doc(db, 'services', currentServiceDocId);
        await updateDoc(serviceRef, {
            active: newValue,
            updated_at: new Date().toISOString()
        });

        // Record edit history (fire-and-forget)
        recordEditHistory(currentServiceDocId, 'toggle_active', [
            { field: 'active', old_value: !newValue, new_value: newValue }
        ], 'services').catch(err => console.error('[EditHistory] toggleServiceDetailActive failed:', err));

        showToast(`Service ${newValue ? 'activated' : 'deactivated'}`, 'success');
    } catch (error) {
        console.error('[ServiceDetail] Toggle failed:', error);
        showToast('Failed to update status', 'error');
    }
}

// Show field error
function showServiceFieldError(fieldName, message) {
    const field = document.querySelector(`[data-field="${fieldName}"]`);
    if (!field) return;

    clearServiceFieldError(fieldName);

    const errorEl = document.createElement('div');
    errorEl.className = 'field-error-message';
    errorEl.textContent = message;
    errorEl.style.cssText = 'color: #ef4444; font-size: 0.875rem; margin-top: 0.25rem;';
    field.parentNode.appendChild(errorEl);
    field.style.borderColor = '#ef4444';
}

// Clear field error
function clearServiceFieldError(fieldName) {
    const field = document.querySelector(`[data-field="${fieldName}"]`);
    if (!field) return;

    const errorMsg = field.parentNode.querySelector('.field-error-message');
    if (errorMsg) errorMsg.remove();
    field.style.borderColor = '';
}

// Refresh service expense aggregation
async function refreshServiceExpense(silent = false) {
    if (!currentService?.service_code) return;

    // Defense-in-depth: skip aggregation if user cannot read services tab
    // Primary fix for services_user 403 is in Plan 03 (Firestore prs/pos rules)
    const canRead = window.hasTabAccess?.('services');
    if (canRead === false) return;

    showLoading(true);
    try {
        const code = currentService.service_code;

        // MRFs: count only — no total_amount field on MRF documents
        const mrfsQuery = query(
            collection(db, 'mrfs'),
            where('service_code', '==', code)
        );
        const mrfsAgg = await getAggregateFromServer(mrfsQuery, {
            mrfCount: count()
        });

        // PRs: sum total_amount + count
        const prsQuery = query(
            collection(db, 'prs'),
            where('service_code', '==', code)
        );
        const prsAgg = await getAggregateFromServer(prsQuery, {
            prTotal: sum('total_amount'),
            prCount: count()
        });

        // POs: sum total_amount + count
        const posQuery = query(
            collection(db, 'pos'),
            where('service_code', '==', code)
        );
        const posAgg = await getAggregateFromServer(posQuery, {
            poTotal: sum('total_amount'),
            poCount: count()
        });

        // TRs: sum total_amount + count (mirrors project-detail.js:672-680)
        // Filter by service_code per finance.js:2472, 2537 convention
        const trsQuery = query(
            collection(db, 'transport_requests'),
            where('service_code', '==', code)
        );
        const trsAgg = await getAggregateFromServer(trsQuery, {
            totalAmount: sum('total_amount'),
            trCount: count()
        });

        // RFP payables query
        let rfpTotalRequested = 0;
        let rfpTotalPaid = 0;
        let hasRfps = false;
        const serviceCode = currentService.service_code;
        if (serviceCode) {
            const rfpSnap = await getDocs(
                query(collection(db, 'rfps'), where('service_code', '==', serviceCode))
            );
            hasRfps = rfpSnap.size > 0;
            rfpSnap.forEach(d => {
                const rfp = d.data();
                rfpTotalRequested += parseFloat(rfp.amount_requested || 0);
                rfpTotalPaid += (rfp.payment_records || [])
                    .filter(r => r.status !== 'voided')
                    .reduce((s, r) => s + parseFloat(r.amount || 0), 0);
            });
        }

        currentServiceExpense = {
            mrfCount: mrfsAgg.data().mrfCount || 0,
            prTotal: prsAgg.data().prTotal || 0,
            prCount: prsAgg.data().prCount || 0,
            poTotal: posAgg.data().poTotal || 0,
            poCount: posAgg.data().poCount || 0,
            trTotal: trsAgg.data().totalAmount || 0,
            trCount: trsAgg.data().trCount || 0,
            totalPaid: rfpTotalPaid,
            remainingPayable: (posAgg.data().poTotal || 0) + (trsAgg.data().totalAmount || 0) - rfpTotalPaid,
            hasRfps
        };

        // Phase 85 D-06 / D-01: aggregate collectibles for this service — parallels RFP aggregation
        let collTotalRequested = 0;
        let collTotalCollected = 0;
        if (serviceCode) {
            const collSnap = await getDocs(
                query(collection(db, 'collectibles'), where('service_code', '==', serviceCode))
            );
            collSnap.forEach(d => {
                const coll = d.data();
                collTotalRequested += parseFloat(coll.amount_requested || 0);
                collTotalCollected += (coll.payment_records || [])
                    .filter(r => r.status !== 'voided')
                    .reduce((s, r) => s + parseFloat(r.amount || 0), 0);
            });
        }
        currentServiceCollectibles = {
            totalRequested: collTotalRequested,
            totalCollected: collTotalCollected,
            remainingCollectible: collTotalRequested - collTotalCollected
        };

        // Re-render to show updated expense (does NOT call refreshServiceExpense — no loop)
        renderServiceDetail();

        if (!silent) showToast('Expense refreshed', 'success');
    } catch (error) {
        console.error('[ServiceDetail] Expense aggregation failed:', error);
        if (!silent) showToast('Failed to calculate expense', 'error');
        renderServiceDetail(); // Render page with zeroed expense data rather than leaving blank
    } finally {
        showLoading(false);
    }
}

// Export service expense data as CSV
async function exportServiceExpenseCSV() {
    if (!currentService?.service_code) return;

    try {
        // Query all POs for this service (POs store service_code; CONTEXT.md's "filter by service_name" phrasing
        // is imprecise — service_code is the correct PO field, consistent with how refreshServiceExpense queries)
        const posSnap = await getDocs(
            query(collection(db, 'pos'), where('service_code', '==', currentService.service_code))
        );

        // Collect unique MRF IDs to fetch requestor names
        const mrfIds = [...new Set(posSnap.docs.map(d => d.data().mrf_id).filter(Boolean))];
        const mrfMap = new Map();
        if (mrfIds.length > 0) {
            // Firestore 'in' supports up to 30 values; chunk if needed
            const chunks = [];
            for (let i = 0; i < mrfIds.length; i += 30) chunks.push(mrfIds.slice(i, i + 30));
            for (const chunk of chunks) {
                const mrfSnap = await getDocs(query(collection(db, 'mrfs'), where('mrf_id', 'in', chunk)));
                mrfSnap.forEach(d => mrfMap.set(d.data().mrf_id, d.data()));
            }
        }

        // Build rows — one row per line item across all POs
        const rows = [];
        posSnap.forEach(poDoc => {
            const po = poDoc.data();
            const mrf = mrfMap.get(po.mrf_id) || {};
            const requestorName = mrf.requestor_name || '';
            const dateStr = po.date_issued
                ? (po.date_issued.toDate ? po.date_issued.toDate() : new Date(po.date_issued)).toISOString().slice(0, 10)
                : '';
            const items = JSON.parse(po.items_json || '[]');
            items.forEach(item => {
                const qty = parseFloat(item.qty || item.quantity || 0);
                const unitCost = parseFloat(item.unit_cost || item.unitCost || item.price || 0);
                rows.push([
                    dateStr,
                    item.category || 'Uncategorized',
                    po.supplier_name || '',
                    item.item || item.item_name || item.itemName || item.name || 'Unnamed Item',
                    qty,
                    item.unit || 'pcs',
                    unitCost.toFixed(2),
                    (qty * unitCost).toFixed(2),
                    requestorName,
                    '' // REMARKS — blank until payables tracking is implemented
                ]);
            });
        });

        const headers = ['DATE', 'CATEGORY', 'SUPPLIER/SUBCONTRACTOR', 'ITEMS', 'QTY', 'UNIT', 'UNIT COST', 'TOTAL COST', 'REQUESTED BY', 'REMARKS'];
        const safeName = (currentService.service_name || 'service').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '');
        const today = new Date().toISOString().slice(0, 10);
        downloadCSV(headers, rows, `${safeName}-expenses-${today}.csv`);
    } catch (error) {
        console.error('[ServiceDetail] Export failed:', error);
        showToast('Export failed', 'error');
    }
}

// ============================================================
// Phase 87.1 D-05 — Inline proposal card (service detail)
// ============================================================
// Mirror of project-detail.js. Uses currentServiceDocId as the parentDocId and
// passes 'services' as parentCollection. The proposal doc carries
// parent_collection: 'services' (set in engagement-create.js when the service
// engagement was created) so _applyProposalStateTransition writes the project
// status back to the services collection automatically via the doc's own field.
// The fresh getDoc() in confirmProposalInlineSubmit ensures the latest
// parent_collection value is read at write time.

function _renderCardAttachment(proposal) {
    if (!proposal.attachment_kind) {
        return `<div style="font-size:12px;color:#94a3b8;margin-top:4px;">No attachment</div>`;
    }
    if (proposal.attachment_kind === 'link') {
        const url = proposal.attachment_url || '';
        let label = 'View link';
        try { label = new URL(url).hostname; } catch (_) { /* keep default */ }
        return `<div style="font-size:12px;margin-top:4px;"><a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;">${escapeHTML(label)}</a></div>`;
    }
    if (proposal.attachment_kind === 'file') {
        const filename = proposal.attachment_filename || 'Download file';
        const url = proposal.attachment_url || '#';
        return `<div style="font-size:12px;margin-top:4px;"><a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;">${escapeHTML(filename)}</a></div>`;
    }
    return '';
}

function _renderCardLatestComms(proposal) {
    const log = proposal.comms_log || [];
    if (log.length === 0) {
        return `<div style="font-size:12px;color:#94a3b8;margin-top:4px;">No comms yet</div>`;
    }
    const last = log[log.length - 1];
    const date = last.date || '—';
    const rawDesc = last.description || '';
    const desc = rawDesc.length > 80 ? rawDesc.slice(0, 80) + '…' : rawDesc;
    return `<div style="font-size:12px;color:#475569;margin-top:4px;">${escapeHTML(date)} · ${escapeHTML(desc)}</div>`;
}

// Phase 87.3 D-12 — map proposal status to human-readable stage label
function _proposalStageLabel(status) {
    const labels = {
        draft: 'Draft Proposal',
        pending_internal: 'For Internal Approval',
        pending_client: 'Under Client Review',
        for_revision: 'Revision Requested',
        approved: 'Client Approved',
        loss: 'Loss',
    };
    return labels[status] || 'Proposal';
}

// Phase 87.3 D-13 — dot color per proposal status
function _proposalStatusDotColor(status) {
    const colors = {
        draft: '#94a3b8',
        pending_internal: '#f59e0b',
        pending_client: '#1a73e8',
        for_revision: '#f59e0b',
        approved: '#059669',
        loss: '#ef4444',
    };
    return colors[status] || '#94a3b8';
}

function renderInlineProposalCard(proposal, canDrive) {
    let overdueBorder = '';
    try {
        const since = proposal.current_status_since;
        if (since) {
            const sinceMs = since?.seconds ? since.seconds * 1000 : (typeof since === 'string' ? Date.parse(since) : 0);
            if (sinceMs > 0) {
                const ageDays = (Date.now() - sinceMs) / 86400000;
                if (ageDays > 7) overdueBorder = 'border-left: 3px solid #f59e0b;';
            }
        }
    } catch (_) { /* ignore */ }

    const showSubmit = canDrive && ['draft', 'for_revision'].includes(proposal.status);
    const submitBtnHtml = showSubmit
        ? `<button class="btn btn-primary" id="proposalInlineSubmitBtn" onclick="window.openProposalInlineSubmitModal('${escapeHTML(proposal.id)}')">Submit for Approval</button>`
        : '';

    return `
        <div class="proposal-inline-card" style="${overdueBorder}">
            <div class="proposal-inline-card__header">
                <span class="proposal-inline-card__status-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${_proposalStatusDotColor(proposal.status)};margin-right:6px;flex-shrink:0;"></span>
                <span class="proposal-inline-card__label">${_proposalStageLabel(proposal.status)}</span>
            </div>
            <div class="proposal-inline-card__body">
                <div style="font-size:13px;color:#1a73e8;font-weight:600;display:flex;align-items:center;gap:8px;">
                    <span>${escapeHTML(proposal.proposal_id || proposal.id)}</span>
                    <span style="color:#94a3b8;font-weight:400;">v${proposal.version || 1}</span>
                </div>
                <div style="font-size:15px;color:#1e293b;font-weight:600;margin-top:2px;">${escapeHTML(proposal.title || '(Untitled proposal)')}</div>
                <div style="font-size:13px;color:#475569;margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span>${proposal.amount != null ? 'PHP ' + formatCurrency(proposal.amount) : '—'}</span>
                    ${renderAgeBadge(proposal)}
                </div>
                ${_renderCardAttachment(proposal)}
                ${_renderCardLatestComms(proposal)}
            </div>
            <div class="proposal-inline-card__footer" style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">
                ${submitBtnHtml}
                <button class="btn btn-outline" onclick="window.openProposalModal('${escapeHTML(proposal.id)}')">View Proposal</button>
            </div>
        </div>
    `;
}

function openProposalInlineSubmitModal(proposalDocId) {
    document.getElementById('proposal-inline-submit-modal')?.remove();
    const html = `
        <div id="proposal-inline-submit-modal" class="modal-overlay" style="display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:1000;backdrop-filter:blur(2px);">
            <div class="modal-window" style="background:#ffffff;border-radius:8px;max-width:480px;width:92%;padding:0;box-shadow:0 10px 25px rgba(0,0,0,0.2);">
                <div style="padding:1rem 1.25rem;border-bottom:1px solid #e5e7eb;">
                    <h3 style="margin:0;font-size:1.05rem;font-weight:600;color:#1e293b;">Submit for Approval</h3>
                </div>
                <div style="padding:1rem 1.25rem;">
                    <p style="margin:0 0 0.75rem 0;color:#475569;font-size:0.875rem;">Submitting will advance this service to <strong>Proposal for Internal Approval</strong>. This action is recorded in the audit trail.</p>
                    <label style="display:block;font-size:0.8125rem;font-weight:600;color:#475569;margin-bottom:0.25rem;">Submission Notes (optional)</label>
                    <textarea id="proposalInlineSubmitNotes" rows="3" placeholder="Describe the proposal and any context for approvers..." style="width:100%;padding:0.5rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.875rem;resize:vertical;font-family:inherit;"></textarea>
                </div>
                <div style="padding:0.75rem 1.25rem;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:0.5rem;">
                    <button class="btn btn-secondary" onclick="window.closeProposalInlineSubmitModal()">Keep Editing</button>
                    <button class="btn btn-primary" id="proposalInlineSubmitConfirmBtn" onclick="window.confirmProposalInlineSubmit('${escapeHTML(proposalDocId)}')">Confirm Submission</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}

async function confirmProposalInlineSubmit(proposalDocId) {
    // Double-submit prevention: disable confirm button immediately
    const confirmBtn = document.getElementById('proposalInlineSubmitConfirmBtn');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Submitting...'; }

    try {
        // Fresh fetch — mirrors home.js _homeQueueConfirmAction reference pattern.
        // The proposal doc's own parent_collection field tells _applyProposalStateTransition
        // which parent collection (services here) to update.
        const snap = await getDoc(doc(db, 'proposals', proposalDocId));
        if (!snap.exists()) {
            showToast('Proposal not found.', 'error');
            return;
        }
        const proposal = { id: snap.id, ...snap.data() };
        if (!['draft', 'for_revision'].includes(proposal.status)) {
            showToast('Proposal status has changed. Please reload the page.', 'error');
            document.getElementById('proposal-inline-submit-modal')?.remove();
            return;
        }

        showLoading(true);
        try {
            await _applyProposalStateTransition({
                proposal,
                newStatus: 'pending_internal',
                newProjectStatus: 'Proposal for Internal Approval',
                auditAction: 'SUBMITTED',
                auditComment: null
            });
            document.getElementById('proposal-inline-submit-modal')?.remove();
            showToast('Proposal submitted for approval.', 'success');
            if (currentServiceDocId) {
                loadProposalCard(currentServiceDocId, 'services');
            }
        } catch (err) {
            console.error('[ServiceDetail] confirmProposalInlineSubmit transition failed:', err);
            showToast(err?.message || 'Failed to submit proposal. Please try again.', 'error');
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Submission'; }
        } finally {
            showLoading(false);
        }
    } catch (err) {
        console.error('[ServiceDetail] confirmProposalInlineSubmit outer failure:', err);
        showToast(err?.message || 'Failed to submit proposal.', 'error');
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Submission'; }
    }
}

async function loadProposalCard(parentDocId, parentCollection) {
    try {
        // Phase 87.3 D-01/D-02/D-05 — compute canDrive from current user role + personnel assignment
        const user = window.getCurrentUser?.();
        const uid = user?.uid;
        const role = user?.role;
        const adminRoles = ['super_admin', 'operations_admin', 'services_admin'];
        const assignedRoles = ['operations_user', 'services_user'];
        const parentPersonnel = currentService?.personnel_user_ids || [];
        const canDrive = adminRoles.includes(role)
            || (assignedRoles.includes(role) && uid && parentPersonnel.includes(uid));

        // parentCollection ('services') is held for clarity / future expansion;
        // the lookup is by project_id which carries the parent doc id regardless
        // of which collection it belongs to.
        const q = query(collection(db, 'proposals'), where('project_id', '==', parentDocId));
        const snap = await getDocs(q);
        const el = document.getElementById('proposalInlineCard');
        if (!el) return; // navigated away

        if (snap.empty) {
            if (currentService?.project_status === 'For Proposal' && canDrive) {
                // Show Start Proposal CTA for canDrive users on For Proposal services
                window._startProposalCallback = () => loadProposalCard(parentDocId, parentCollection);
                el.style.display = '';
                el.innerHTML = `<div class="proposal-inline-card proposal-inline-card--start">
                    <div class="proposal-inline-card__body" style="text-align:center;padding:1rem 0;">
                        <p style="margin:0 0 0.75rem 0;color:#475569;font-size:0.875rem;">No proposal yet. Ready to start one?</p>
                        <button class="btn btn-primary" onclick="window.openCreateProposalModal('${escapeHTML(parentDocId)}', window._startProposalCallback, 'services', '${escapeHTML(currentService?.service_code || '')}')">Start Proposal</button>
                    </div>
                </div>`;
            } else if (currentService?.project_status === 'For Proposal') {
                // Non-canDrive user on For Proposal — show placeholder
                el.style.display = '';
                el.innerHTML = `<div class="proposal-inline-card"><p style="color:#64748b;font-size:0.875rem;margin:0;">No proposal linked yet.</p></div>`;
            } else {
                // Not in proposal range and no proposal — hide container
                el.style.display = 'none';
            }
            return;
        }

        // Most service engagements have ≤1 active proposal; if multiple, surface the first.
        const proposal = { id: snap.docs[0].id, ...snap.docs[0].data() };
        el.style.display = '';
        el.innerHTML = renderInlineProposalCard(proposal, canDrive);
    } catch (err) {
        console.error('[ServiceDetail] loadProposalCard failed:', err);
        const el = document.getElementById('proposalInlineCard');
        if (el) {
            el.innerHTML = `<div class="proposal-inline-card"><p style="color:#ef4444;font-size:0.875rem;margin:0;">Could not load proposal.</p></div>`;
        }
    }
}

// Attach window functions
function attachWindowFunctions() {
    window.saveServiceField = saveServiceField;
    window.toggleServiceDetailActive = toggleServiceDetailActive;
    window.selectDetailServicePersonnel = selectDetailServicePersonnel;
    window.removeDetailServicePersonnel = removeDetailServicePersonnel;
    window.filterDetailServicePersonnelDropdown = filterDetailServicePersonnelDropdown;
    window.showDetailServicePersonnelDropdown = showDetailServicePersonnelDropdown;
    window.refreshServiceExpense = refreshServiceExpense;
    window.showServiceExpenseModal = () => currentService &&
        showExpenseBreakdownModal(currentService.service_code, {
            mode: 'service',
            displayName: currentService.service_name,
            budget: currentService.budget
        });
    window.refreshAndShowServiceExpenseModal = async () => {
        if (!currentService) return;
        await refreshServiceExpense(true);
        showExpenseBreakdownModal(currentService.service_code, {
            mode: 'service',
            displayName: currentService.service_name,
            budget: currentService.budget
        });
    };
    window.showEditHistory = () => currentService && currentServiceDocId &&
        showEditHistoryModal(currentServiceDocId, currentService.service_code, 'services');
    window.exportServiceExpenseCSV = exportServiceExpenseCSV;
    // Phase 87.1 D-05 — inline proposal card window functions
    window.openProposalModal = openProposalModal;
    window.openProposalInlineSubmitModal = openProposalInlineSubmitModal;
    window.closeProposalInlineSubmitModal = () => { document.getElementById('proposal-inline-submit-modal')?.remove(); };
    window.confirmProposalInlineSubmit = confirmProposalInlineSubmit;
    // Phase 87.3 D-01 — Start Proposal button support
    window.openCreateProposalModal = openCreateProposalModal;
}
