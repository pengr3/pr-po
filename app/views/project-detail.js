/* ========================================
   PROJECT DETAIL VIEW
   Full-page project detail with inline editing
   ======================================== */

import { db, collection, doc, getDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, writeBatch, getAggregateFromServer, sum, count } from '../firebase.js';
import { formatCurrency, formatDate, showLoading, showToast, normalizePersonnel, syncPersonnelToAssignments, downloadCSV, escapeHTML, generateProjectCode } from '../utils.js';
import { showExpenseBreakdownModal } from '../expense-modal.js';
import { recordEditHistory, showEditHistoryModal } from '../edit-history.js';
import { createNotificationForUsers, NOTIFICATION_TYPES } from '../notifications.js';

let currentProject = null;
let projectCode = null;
let listener = null;
let usersData = [];
let usersListenerUnsub = null;
let currentExpense = { total: 0, poCount: 0, trCount: 0, totalPaid: 0, remainingPayable: 0, hasRfps: false };
// Phase 85 D-06: collectibles aggregation alongside currentExpense
let currentCollectibles = { totalRequested: 0, totalCollected: 0, remainingCollectible: 0 };
let detailSelectedPersonnel = []; // Array of { id: string, name: string } for pill state
let personnelClickOutsideHandler = null;
// Phase 78 D-04: clients cache for the issuance client-select control (lazy-loaded when needed)
let clientsCacheForIssuance = [];
let clientsCacheLoaded = false;

// Phase 86 — Project Plan summary card
let currentTasks = [];
let currentTasksListenerUnsub = null;
let currentProjectProgress = { taskCount: 0, percentComplete: 0, recentDone: null, nextMilestone: null, ongoingMilestone: null };

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
    // If a previous init left a handler attached (e.g., destroy() was skipped on a tab swap),
    // detach it before adding the new one so we don't leak listeners across re-inits.
    if (window._projectDetailPermissionHandler) {
        window.removeEventListener('permissionsChanged', window._projectDetailPermissionHandler);
    }
    const permissionChangeHandler = () => {
        renderProjectDetail();
    };
    window.addEventListener('permissionsChanged', permissionChangeHandler);
    window._projectDetailPermissionHandler = permissionChangeHandler;

    // Phase 7: Re-check access when assignments change
    if (window._projectDetailAssignmentHandler) {
        window.removeEventListener('assignmentsChanged', window._projectDetailAssignmentHandler);
    }
    const assignmentChangeHandler = () => {
        if (currentProject) {
            checkProjectAccess(); // Will render access denied if project no longer assigned
        }
    };
    window.addEventListener('assignmentsChanged', assignmentChangeHandler);
    window._projectDetailAssignmentHandler = assignmentChangeHandler;

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

    // Phase 78 D-06: Try project_code lookup first (existing behavior). If no match, fall back to Firestore doc ID lookup
    // for clientless projects whose URL param is the doc ID rather than a project_code.
    const q = query(collection(db, 'projects'), where('project_code', '==', projectCode));
    listener = onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) {
            // Phase 78 D-06: fallback — projectCode might actually be a Firestore doc ID for a clientless project
            try {
                const docRef = doc(db, 'projects', projectCode);
                const docSnap2 = await getDoc(docRef);
                if (docSnap2.exists()) {
                    // Tear down the project_code listener and rebind a per-doc listener for live updates
                    if (typeof listener === 'function') listener();
                    listener = onSnapshot(docRef, async (snap) => {
                        if (!snap.exists()) {
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
                        currentProject = { id: snap.id, ...snap.data() };
                        await refreshExpense(true);
                        // Phase 78 D-04: load clients once when the user views a clientless project
                        if (!currentProject.client_code) {
                            await loadClientsCache();
                        }
                        // Phase 86 — Project Plan summary listener (idempotent attach)
                        ensureTasksListener();
                        if (checkProjectAccess()) {
                            renderProjectDetail();
                        }
                    });
                    return;
                }
            } catch (err) {
                console.error('[ProjectDetail] Doc-ID fallback lookup failed:', err);
            }
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

        // Phase 78 D-04: load clients once when the user views a clientless project (rare for the project_code-found branch but possible if a user navigates to #/projects/detail/{code} where code is empty — defensive)
        if (!currentProject.client_code) {
            await loadClientsCache();
        }

        // Phase 86 — Project Plan summary listener (idempotent attach once currentProject.id is known)
        ensureTasksListener();

        // Phase 7: Check project assignment access for operations_user
        if (checkProjectAccess()) {
            renderProjectDetail();
        }
        // If checkProjectAccess() returns false, it already rendered the access denied message
    });
}

// Phase 86 — idempotent attach of project_tasks listener. Computes summary stats + Highlights
// and patches the Project Plan card DOM in place (avoids full re-render of project-detail).
function ensureTasksListener() {
    if (currentTasksListenerUnsub) return; // already attached
    if (!currentProject || !currentProject.id) return;
    currentTasksListenerUnsub = onSnapshot(
        query(collection(db, 'project_tasks'), where('project_id', '==', currentProject.id)),
        (snap) => {
            currentTasks = [];
            snap.forEach(d => currentTasks.push({ id: d.id, ...d.data() }));
            currentProjectProgress = computeProjectProgress(currentTasks);
            // Patch DOM in place (avoid full re-render of the project-detail page)
            const taskCountEl = document.getElementById('planCardTaskCount');
            if (taskCountEl) taskCountEl.textContent = currentProjectProgress.taskCount;
            const pctEl = document.getElementById('planCardPctComplete');
            if (pctEl) pctEl.textContent = `${currentProjectProgress.percentComplete}%`;
            const recentEl = document.getElementById('planCardRecentDone');
            if (recentEl) recentEl.textContent = currentProjectProgress.recentDone || 'No completed tasks yet.';
            const nextEl = document.getElementById('planCardNextMilestone');
            if (nextEl) nextEl.textContent = currentProjectProgress.nextMilestone || 'No upcoming milestones.';
            const ongoingEl = document.getElementById('planCardOngoingMilestone');
            if (ongoingEl) ongoingEl.textContent = currentProjectProgress.ongoingMilestone || 'No active milestones.';
        }
    );
}

// Cleanup
export async function destroy() {
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

    // Phase 86 — Project Plan summary listener teardown
    if (currentTasksListenerUnsub) { try { currentTasksListenerUnsub(); } catch (e) { /* swallow */ } }
    currentTasksListenerUnsub = null;
    currentTasks = [];
    currentProjectProgress = { taskCount: 0, percentComplete: 0, recentDone: null, nextMilestone: null, ongoingMilestone: null };

    // Clean up personnel pill state
    if (personnelClickOutsideHandler) {
        document.removeEventListener('mousedown', personnelClickOutsideHandler);
        personnelClickOutsideHandler = null;
    }
    detailSelectedPersonnel = [];

    currentProject = null;
    projectCode = null;
    currentExpense = { total: 0, poCount: 0, trCount: 0, totalPaid: 0, remainingPayable: 0, hasRfps: false };
    // Phase 85 D-06: reset collectibles state alongside currentExpense
    currentCollectibles = { totalRequested: 0, totalCollected: 0, remainingCollectible: 0 };

    delete window.saveField;
    delete window.toggleActive;
    delete window.confirmDelete;
    delete window.refreshExpense;
    delete window.showExpenseModal;
    delete window.refreshAndShowExpenseModal;
    delete window.selectDetailPersonnel;
    delete window.removeDetailPersonnel;
    delete window.filterDetailPersonnel;
    delete window.showDetailPersonnelDropdown;
    delete window.showEditHistory;
    delete window.exportProjectExpenseCSV;
    delete window.startCodeIssuance;
    delete window.runCodeIssuance;
    document.getElementById('issueCodeOverlay')?.remove();
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

    // ----- Project Plan summary card (Phase 86 D-03) -----
    const planCardHtml = `
        <div class="card project-plan-card">
            <div class="card-header"><h3>Project Plan</h3></div>
            <div class="card-body">
                <div class="plan-card-stats">
                    <div class="plan-card-stat">
                        <div class="plan-card-stat-value" id="planCardTaskCount">${currentProjectProgress.taskCount}</div>
                        <div class="plan-card-stat-label">tasks</div>
                    </div>
                    <div class="plan-card-stat">
                        <div class="plan-card-stat-value" id="planCardPctComplete">${currentProjectProgress.percentComplete}%</div>
                        <div class="plan-card-stat-label">complete</div>
                    </div>
                </div>
                <div class="plan-card-highlights">
                    <div class="plan-card-highlight">
                        <div class="plan-card-highlight-label">Most recent accomplishment</div>
                        <div class="plan-card-highlight-value" id="planCardRecentDone">${escapeHTML(currentProjectProgress.recentDone || 'No completed tasks yet.')}</div>
                    </div>
                    <div class="plan-card-highlight">
                        <div class="plan-card-highlight-label">Next milestone</div>
                        <div class="plan-card-highlight-value" id="planCardNextMilestone">${escapeHTML(currentProjectProgress.nextMilestone || 'No upcoming milestones.')}</div>
                    </div>
                    <div class="plan-card-highlight">
                        <div class="plan-card-highlight-label">Ongoing milestone</div>
                        <div class="plan-card-highlight-value" id="planCardOngoingMilestone">${escapeHTML(currentProjectProgress.ongoingMilestone || 'No active milestones.')}</div>
                    </div>
                </div>
                ${currentProjectProgress.taskCount === 0
                    ? `<div class="empty-state" style="padding: 16px; text-align: center;"><strong>No tasks yet.</strong><br><span>Open the plan to get started.</span></div>`
                    : ''}
                <div style="margin-top: 16px; text-align: right;">
                    <a href="#/projects/${escapeHTML(currentProject?.project_code || '')}/plan" class="btn btn-primary"
                       ${!currentProject?.project_code ? 'style="pointer-events: none; opacity: 0.5;" title="No project code"' : ''}>
                        Open Plan
                    </a>
                </div>
            </div>
        </div>
    `;

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
                    <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 0.75rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <h3 style="margin: 0 0 0.25rem 0; font-size: 1.125rem; font-weight: 600;">Project Information</h3>
                            <p style="color: #94a3b8; font-size: 0.875rem; margin: 0;">Created: ${formatDate(currentProject.created_at)}${currentProject.updated_at ? ' | Updated: ' + formatDate(currentProject.updated_at) : ''}</p>
                        </div>
                        <button class="btn btn-sm btn-secondary" onclick="window.showEditHistory()" style="white-space: nowrap; padding: 0.4rem 0.75rem; font-size: 0.8rem;">
                            Edit History
                        </button>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Project Code</label>
                            <div style="color: #64748b; font-size: 1rem;">${escapeHTML(currentProject.project_code)}</div>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.25rem;">Project Name *</label>
                            <input type="text" data-field="project_name" value="${escapeHTML(currentProject.project_name || '')}" onblur="window.saveField('project_name', this.value)" placeholder="Enter project name" ${!showEditControls ? 'disabled' : ''}>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Client</label>
                            ${(!currentProject.client_code && showEditControls) ? `
                                <!-- Phase 78 D-04: clientless project — editable client picker that triggers code issuance on confirm -->
                                <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                                    <select id="clientAssignSelect" style="flex: 1; min-width: 200px; padding: 0.5rem; border: 2px solid #dadce0; border-radius: 4px; background-color: #ffffff;">
                                        <option value="">— Select a client to issue code —</option>
                                        ${clientsCacheForIssuance.map(c => `<option value="${escapeHTML(c.id)}" data-code="${escapeHTML(c.client_code || '')}">${escapeHTML(c.company_name)}</option>`).join('')}
                                    </select>
                                    <button class="btn btn-sm btn-primary" onclick="window.startCodeIssuance()" style="white-space: nowrap;">Assign &amp; Issue Code</button>
                                </div>
                                <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">
                                    No code yet — assigning a client will generate the project code and apply it to all linked records.
                                </div>
                            ` : `
                                <div style="color: #64748b; font-size: 1rem;">${escapeHTML(currentProject.client_code || 'N/A')}</div>
                            `}
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.25rem;">Location</label>
                            <input type="text" data-field="location" value="${escapeHTML(currentProject.location || '')}" onblur="window.saveField('location', this.value)" placeholder="(Not set)" ${!showEditControls ? 'disabled' : ''}>
                        </div>
                        ${renderPersonnelPills(canEditPersonnel)}
                    </div>
                </div>
            </div>

            <!-- Card 2 - Financial Summary -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body" style="padding: 1.5rem;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
                        <h3 style="margin: 0; font-size: 1.125rem; font-weight: 600;">Financial Summary</h3>
                        <button class="btn btn-sm btn-secondary" onclick="window.exportProjectExpenseCSV()"
                            style="font-size: 0.75rem; padding: 0.25rem 0.75rem; display: flex; align-items: center; gap: 0.35rem;${currentExpense.poCount === 0 ? ' opacity: 0.45; pointer-events: none; cursor: default;' : ''}"
                            ${currentExpense.poCount === 0 ? 'disabled' : ''}>
                            &#8681; Export CSV
                        </button>
                    </div>

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
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Projected Cost</label>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <div style="font-weight: 600; color: #1e293b; font-size: 1.125rem; cursor: pointer;"
                                     onclick="window.showExpenseModal()">
                                    ${currentExpense.total > 0 ? formatCurrency(currentExpense.total) : '—'}
                                </div>
                                <button class="btn btn-sm btn-secondary" onclick="window.refreshAndShowExpenseModal()" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">&#x1F504; Refresh</button>
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
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Paid</label>
                            <div style="font-weight: 600; color: #059669; font-size: 1.125rem;">
                                ${formatCurrency(currentExpense.totalPaid)}
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Remaining Payable</label>
                            <div style="font-weight: 600; color: ${currentExpense.remainingPayable > 0 ? '#ef4444' : '#059669'}; font-size: 1.125rem;">
                                ${formatCurrency(currentExpense.remainingPayable)}
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Collected</label>
                            <div style="font-weight: 600; color: #059669; font-size: 1.125rem;">
                                ${formatCurrency(currentCollectibles.totalCollected)}
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Remaining Collectible</label>
                            <div style="font-weight: 600; color: ${currentCollectibles.remainingCollectible > 0 ? '#ef4444' : '#059669'}; font-size: 1.125rem;">
                                ${formatCurrency(currentCollectibles.remainingCollectible)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Card 3 - Status & Assignment -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body" style="padding: 1.5rem;">
                    <h3 style="margin: 0 0 1rem 0; font-size: 1.125rem; font-weight: 600;">Status & Assignment</h3>

                    <div class="form-group" style="margin-bottom: 0;">
                        <label style="margin-bottom: 0.25rem;">Status</label>
                        <select data-field="project_status" onchange="window.saveField('project_status', this.value)" ${!showEditControls ? 'disabled' : ''}>
                            ${(() => {
                                const current = currentProject.project_status || '';
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

            ${planCardHtml}

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
        <span class="personnel-pill ${user.id ? '' : 'legacy'}" data-user-id="${escapeHTML(user.id || '')}">
            ${escapeHTML(user.name)}
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
            <strong>${escapeHTML(user.full_name)}</strong>
            <span style="color: #64748b; margin-left: 0.5rem;">${escapeHTML(user.email)}</span>
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
        // Record edit history (fire-and-forget)
        recordEditHistory(currentProject.id, 'personnel_add', [
            { field: 'personnel', old_value: null, new_value: userName }
        ]).catch(err => console.error('[EditHistory] selectPersonnel failed:', err));
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
        // Record edit history (fire-and-forget)
        recordEditHistory(currentProject.id, 'personnel_remove', [
            { field: 'personnel', old_value: userName || userId, new_value: null }
        ]).catch(err => console.error('[EditHistory] removePersonnel failed:', err));
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

    // Skip if no actual change (avoids spurious history entries and unnecessary writes)
    const oldValue = currentProject[fieldName];
    const normalizedOld = (fieldName === 'budget' || fieldName === 'contract_cost')
        ? (oldValue != null ? parseFloat(oldValue) : null)
        : oldValue;
    if (normalizedOld === valueToSave) {
        return true;
    }

    try {
        const projectRef = doc(db, 'projects', currentProject.id);
        await updateDoc(projectRef, {
            [fieldName]: valueToSave,
            updated_at: new Date().toISOString()
        });
        // Record edit history (fire-and-forget)
        recordEditHistory(currentProject.id, 'update', [
            { field: fieldName, old_value: oldValue ?? null, new_value: valueToSave }
        ]).catch(err => console.error('[EditHistory] saveField failed:', err));
        // Phase 84 NOTIF-11: notify personnel of meaningful project status change (D-03: fire-and-forget)
        const NOTIF11_STATUS_WHITELIST = ['Client Approved', 'For Mobilization', 'On-going', 'Completed', 'Loss'];
        if (fieldName === 'project_status' && NOTIF11_STATUS_WHITELIST.includes(valueToSave)) {
            const recipients = (currentProject.personnel_user_ids || []).filter(Boolean);
            if (recipients.length > 0) {
                const projectLink = currentProject.project_code
                    ? `#/projects/detail/${currentProject.project_code}`
                    : '#/projects';
                createNotificationForUsers({
                    user_ids: recipients,
                    type: NOTIFICATION_TYPES.PROJECT_STATUS_CHANGED,
                    message: `Project "${currentProject.project_name}" status changed to: ${valueToSave}`,
                    link: projectLink,
                    source_collection: 'projects',
                    source_id: currentProject.project_code || currentProject.id
                }).catch(err => console.error('[ProjectDetail] NOTIF-11 notification failed:', err));
            }
        }
        // Phase 84.1 NOTIF-19: notify personnel of meaningful project cost change (D-03: fire-and-forget)
        const NOTIF19_COST_FIELDS = ['budget', 'contract_cost'];
        if (NOTIF19_COST_FIELDS.includes(fieldName) && normalizedOld !== valueToSave) {
            const recipients = (currentProject.personnel_user_ids || []).filter(Boolean);
            if (recipients.length > 0) {
                const projectLink = currentProject.project_code
                    ? `#/projects/detail/${currentProject.project_code}`
                    : '#/projects';
                const fieldLabel = fieldName === 'contract_cost' ? 'Contract Cost' : 'Budget';
                const oldDisplay = (normalizedOld != null) ? `PHP ${formatCurrency(normalizedOld)}` : '(not set)';
                const newDisplay = (valueToSave != null) ? `PHP ${formatCurrency(valueToSave)}` : '(not set)';
                createNotificationForUsers({
                    user_ids: recipients,
                    type: NOTIFICATION_TYPES.PROJECT_COST_CHANGED,
                    message: `Project "${currentProject.project_name}" ${fieldLabel} changed: ${oldDisplay} → ${newDisplay}`,
                    link: projectLink,
                    source_collection: 'projects',
                    source_id: currentProject.project_code || currentProject.id
                }).catch(err => console.error('[ProjectDetail] NOTIF-19 cost-change notification failed:', err));
            }
        }
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

        // RFP payables query
        let rfpTotalRequested = 0;
        let rfpTotalPaid = 0;
        let hasRfps = false;
        const projectCode = currentProject.project_code || '';
        if (projectCode) {
            const rfpSnap = await getDocs(
                query(collection(db, 'rfps'), where('project_code', '==', projectCode))
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

        currentExpense = {
            total: poTotal + trTotal,
            poCount: posAggregate.data().poCount || 0,
            trCount: trsAggregate.data().trCount || 0,
            totalPaid: rfpTotalPaid,
            remainingPayable: (poTotal + trTotal) - rfpTotalPaid,
            hasRfps
        };

        // Phase 85 D-06: aggregate collectibles for this project — parallels RFP aggregation
        let collTotalRequested = 0;
        let collTotalCollected = 0;
        if (projectCode) {
            const collSnap = await getDocs(
                query(collection(db, 'collectibles'), where('project_code', '==', projectCode))
            );
            collSnap.forEach(d => {
                const coll = d.data();
                collTotalRequested += parseFloat(coll.amount_requested || 0);
                collTotalCollected += (coll.payment_records || [])
                    .filter(r => r.status !== 'voided')
                    .reduce((s, r) => s + parseFloat(r.amount || 0), 0);
            });
        }
        currentCollectibles = {
            totalRequested: collTotalRequested,
            totalCollected: collTotalCollected,
            remainingCollectible: collTotalRequested - collTotalCollected
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
        // Record edit history (fire-and-forget)
        recordEditHistory(currentProject.id, 'toggle_active', [
            { field: 'active', old_value: !newValue, new_value: newValue }
        ]).catch(err => console.error('[EditHistory] toggleActive failed:', err));
        showToast(`Project ${newValue ? 'activated' : 'deactivated'}`, 'success');
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

// Export project expense data as CSV
async function exportProjectExpenseCSV() {
    if (!currentProject) return;

    try {
        // Query all POs for this project
        const posSnap = await getDocs(
            query(collection(db, 'pos'), where('project_name', '==', currentProject.project_name))
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
        const safeName = (currentProject.project_name || 'project').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '');
        const today = new Date().toISOString().slice(0, 10);
        downloadCSV(headers, rows, `${safeName}-expenses-${today}.csv`);
    } catch (error) {
        console.error('[ProjectDetail] Export failed:', error);
        showToast('Export failed', 'error');
    }
}

// Phase 78 D-04: lazy-load clients for the issuance picker (fetched once per session)
async function loadClientsCache() {
    if (clientsCacheLoaded) return;
    try {
        const snap = await getDocs(collection(db, 'clients'));
        clientsCacheForIssuance = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.client_code) {  // only clients with a client_code can be used to generate project codes
                clientsCacheForIssuance.push({ id: d.id, company_name: data.company_name || '(unnamed)', client_code: data.client_code });
            }
        });
        clientsCacheForIssuance.sort((a, b) => a.company_name.localeCompare(b.company_name));
        clientsCacheLoaded = true;
    } catch (err) {
        console.error('[ProjectDetail] Failed to load clients for issuance:', err);
    }
}

// Phase 78 D-07: Open confirmation modal for code issuance
async function startCodeIssuance() {
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return;
    }
    if (!currentProject || currentProject.client_code) {
        showToast('Project already has a code', 'error');
        return;
    }

    const select = document.getElementById('clientAssignSelect');
    if (!select || !select.value) {
        showToast('Select a client first', 'error');
        return;
    }
    const clientId = select.value;
    const clientCode = select.selectedOptions[0]?.dataset?.code || '';
    if (!clientCode) {
        showToast('Selected client has no client_code — cannot issue project code', 'error');
        return;
    }

    showLoading(true);
    try {
        // Pre-compute the new project_code so the modal can show it
        const newProjectCode = await generateProjectCode(clientCode);

        // Count linked records by project_id (the stable backbone from Plan 02)
        const projectId = currentProject.id;
        const [mrfsCount, prsCount, posCount, trsCount, rfpsCount] = await Promise.all([
            getDocs(query(collection(db, 'mrfs'), where('project_id', '==', projectId))).then(s => s.size),
            getDocs(query(collection(db, 'prs'), where('project_id', '==', projectId))).then(s => s.size),
            getDocs(query(collection(db, 'pos'), where('project_id', '==', projectId))).then(s => s.size),
            getDocs(query(collection(db, 'transport_requests'), where('project_id', '==', projectId))).then(s => s.size),
            getDocs(query(collection(db, 'rfps'), where('project_id', '==', projectId))).then(s => s.size)
        ]);
        const totalChildren = mrfsCount + prsCount + posCount + trsCount + rfpsCount;

        // Build confirmation overlay (Phase 78 D-07: clear text showing both new code AND total children backfilled)
        const overlayHtml = `
            <div id="issueCodeOverlay" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 1rem;">
                <div class="card" style="max-width: 520px; width: 100%; background: #fff;">
                    <div class="card-body" style="padding: 1.5rem;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1.125rem; font-weight: 600;">Issue Project Code</h3>
                        <p style="margin: 0 0 0.75rem 0; color: #1e293b;">
                            This will generate <strong>${escapeHTML(newProjectCode)}</strong> and apply it to all linked records:
                        </p>
                        <ul style="margin: 0 0 1rem 1.25rem; color: #475569; font-size: 0.9rem; line-height: 1.7;">
                            <li>${mrfsCount} Material Request${mrfsCount === 1 ? '' : 's'}</li>
                            <li>${prsCount} Purchase Request${prsCount === 1 ? '' : 's'}</li>
                            <li>${posCount} Purchase Order${posCount === 1 ? '' : 's'}</li>
                            <li>${trsCount} Transport Request${trsCount === 1 ? '' : 's'}</li>
                            <li>${rfpsCount} Request for Payment${rfpsCount === 1 ? '' : 's'}</li>
                        </ul>
                        <p style="margin: 0 0 1.5rem 0; color: #64748b; font-size: 0.875rem;">
                            <strong>${totalChildren}</strong> total record${totalChildren === 1 ? '' : 's'} will be updated. After issuance, the client and project code are locked.
                        </p>
                        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                            <button class="btn btn-secondary" onclick="document.getElementById('issueCodeOverlay').remove()">Cancel</button>
                            <button class="btn btn-primary"
                                    data-action="run-code-issuance"
                                    data-client-id="${escapeHTML(clientId)}"
                                    data-client-code="${escapeHTML(clientCode)}"
                                    data-new-project-code="${escapeHTML(newProjectCode)}">Confirm &amp; Issue</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        // Remove any prior overlay before appending (defensive de-dup)
        document.getElementById('issueCodeOverlay')?.remove();
        document.body.insertAdjacentHTML('beforeend', overlayHtml);
        const confirmBtn = document.querySelector('#issueCodeOverlay [data-action="run-code-issuance"]');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => runCodeIssuance(
                confirmBtn.dataset.clientId,
                confirmBtn.dataset.clientCode,
                confirmBtn.dataset.newProjectCode
            ));
        }
    } catch (err) {
        console.error('[ProjectDetail] startCodeIssuance failed:', err);
        showToast('Failed to prepare code issuance: ' + (err.message || err), 'error');
    } finally {
        showLoading(false);
    }
}

// Phase 78 D-04, D-05, D-08, D-12: Execute the batched backfill across all 5 collections + project doc.
// CRITICAL ORDERING (REVIEWS.md MEDIUM concern fix):
//   The project doc is pushed LAST into the writes[] array, AFTER every child collection forEach loop.
//   When chunk-committing in batches of 500, the project doc lives in the FINAL chunk and commits LAST.
//   If any prior batch fails (network, browser close, rule rejection), the project doc still has
//   project_code: null on disk → the user can safely re-run runCodeIssuance. Children that already
//   received the code on the failed run get re-written with the same code on the retry (idempotent).
async function runCodeIssuance(clientId, clientCode, newProjectCode) {
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return;
    }
    if (!currentProject || currentProject.client_code) {
        showToast('Project already has a code', 'error');
        return;
    }

    // Tear down the modal immediately so the user sees progress feedback
    document.getElementById('issueCodeOverlay')?.remove();
    showLoading(true);

    try {
        const projectId = currentProject.id;

        // 1. Query all child records by project_id
        const [mrfsSnap, prsSnap, posSnap, trsSnap, rfpsSnap] = await Promise.all([
            getDocs(query(collection(db, 'mrfs'), where('project_id', '==', projectId))),
            getDocs(query(collection(db, 'prs'), where('project_id', '==', projectId))),
            getDocs(query(collection(db, 'pos'), where('project_id', '==', projectId))),
            getDocs(query(collection(db, 'transport_requests'), where('project_id', '==', projectId))),
            getDocs(query(collection(db, 'rfps'), where('project_id', '==', projectId)))
        ]);

        // 2. Build the list of writes. Children FIRST, project doc LAST (atomicity marker — see comment above).
        //    Firestore writeBatch caps at 500 writes per batch — we chunk if total writes exceed 500.
        const writes = [];

        // Children — write project_code + client_code on each. These are pushed FIRST.
        const childUpdate = { project_code: newProjectCode, client_code: clientCode };
        mrfsSnap.forEach(d => writes.push({ ref: doc(db, 'mrfs', d.id), data: childUpdate }));
        prsSnap.forEach(d => writes.push({ ref: doc(db, 'prs', d.id), data: childUpdate }));
        posSnap.forEach(d => writes.push({ ref: doc(db, 'pos', d.id), data: childUpdate }));
        trsSnap.forEach(d => writes.push({ ref: doc(db, 'transport_requests', d.id), data: childUpdate }));
        rfpsSnap.forEach(d => writes.push({ ref: doc(db, 'rfps', d.id), data: childUpdate }));

        // Project doc LAST — commits in the FINAL chunk so a partial-batch failure leaves the project
        // un-marked-issued (project_code stays null on disk) and the user can safely retry.
        // is_issued: true is the explicit flag for future security rules / UI heuristics (REVIEWS suggestion).
        writes.push({
            ref: doc(db, 'projects', projectId),
            data: {
                client_id: clientId,
                client_code: clientCode,
                project_code: newProjectCode,
                is_issued: true,  // Phase 78 D-12: explicit issued marker for future security rules / UI checks
                updated_at: new Date().toISOString()
            }
        });

        // 3. Commit in chunks of 500 (Firestore writeBatch hard limit)
        const CHUNK = 500;
        for (let i = 0; i < writes.length; i += CHUNK) {
            const batch = writeBatch(db);
            const chunk = writes.slice(i, i + CHUNK);
            chunk.forEach(w => batch.update(w.ref, w.data));
            await batch.commit();
        }

        const totalChildren = mrfsSnap.size + prsSnap.size + posSnap.size + trsSnap.size + rfpsSnap.size;

        // 4. Edit-history event — Phase 78 D-08: single combined event
        recordEditHistory(projectId, 'update', [
            { field: 'client_code', old_value: null, new_value: clientCode },
            { field: 'project_code', old_value: null, new_value: newProjectCode },
            { field: 'code_issued_backfill_count', old_value: null, new_value: totalChildren }
        ]).catch(err => console.error('[EditHistory] code_issued failed:', err));

        // 5. Sync personnel-to-assignments now that we have a project_code (skipped at create-time per Plan 01)
        const newUserIds = (currentProject.personnel_user_ids || []).filter(Boolean);
        if (newUserIds.length > 0) {
            syncPersonnelToAssignments(newProjectCode, [], newUserIds)
                .catch(err => console.error('[ProjectDetail] Post-issuance assignment sync failed:', err));
        }

        showToast(`Code ${newProjectCode} issued and applied to ${totalChildren} record${totalChildren === 1 ? '' : 's'}`, 'success');

        // 6. Redirect to the new code-based URL so the user lands on the canonical detail page
        window.location.hash = `#/projects/detail/${encodeURIComponent(newProjectCode)}`;
    } catch (err) {
        console.error('[ProjectDetail] runCodeIssuance failed:', err);
        showToast('Failed to issue code: ' + (err.message || err), 'error');
    } finally {
        showLoading(false);
    }
}

// Attach window functions
function attachWindowFunctions() {
    window.saveField = saveField;
    window.toggleActive = toggleActive;
    window.confirmDelete = confirmDelete;
    window.refreshExpense = refreshExpense;
    window.showExpenseModal = () => currentProject && showExpenseBreakdownModal(currentProject.project_name, { mode: 'project' });
    window.refreshAndShowExpenseModal = async () => {
        if (!currentProject) return;
        await refreshExpense(true);
        showExpenseBreakdownModal(currentProject.project_name, { mode: 'project' });
    };
    window.selectDetailPersonnel = selectDetailPersonnel;
    window.removeDetailPersonnel = removeDetailPersonnel;
    window.filterDetailPersonnel = filterDetailPersonnel;
    window.showDetailPersonnelDropdown = showDetailPersonnelDropdown;
    window.showEditHistory = () => currentProject && showEditHistoryModal(currentProject.id, currentProject.project_code);
    window.exportProjectExpenseCSV = exportProjectExpenseCSV;
    window.startCodeIssuance = startCodeIssuance;
    window.runCodeIssuance = runCodeIssuance;
}

// Phase 86 — Project Plan summary card helpers (D-12 weighted-by-duration leaf-only rollup)

function computeProjectProgress(tasks) {
    const result = { taskCount: tasks.length, percentComplete: 0, recentDone: null, nextMilestone: null, ongoingMilestone: null };
    if (tasks.length === 0) return result;

    const childrenByParent = new Map();
    tasks.forEach(t => {
        const key = t.parent_task_id || '__root__';
        if (!childrenByParent.has(key)) childrenByParent.set(key, []);
        childrenByParent.get(key).push(t);
    });

    // Leaves = tasks with no children
    const leaves = tasks.filter(t => !childrenByParent.has(t.task_id));
    if (leaves.length === 0) {
        result.percentComplete = 0;
        return result;
    }

    let weightedSum = 0;
    let weightTotal = 0;
    leaves.forEach(l => {
        const dur = computeDurationDays(l.start_date, l.end_date);
        const p = typeof l.progress === 'number' ? l.progress : 0;
        weightedSum += p * dur;
        weightTotal += dur;
    });
    result.percentComplete = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;

    // Highlights (Specifics)
    const today = new Date().toISOString().slice(0, 10);
    const completed = tasks.filter(t => t.progress === 100).slice().sort((a, b) => {
        const at = a.updated_at?.seconds || 0;
        const bt = b.updated_at?.seconds || 0;
        return bt - at;
    });
    if (completed.length > 0) result.recentDone = completed[0].name || completed[0].task_id;

    const upcomingMilestones = tasks.filter(t => t.is_milestone && t.end_date >= today && (t.progress ?? 0) < 100)
        .sort((a, b) => (a.end_date || '').localeCompare(b.end_date || ''));
    if (upcomingMilestones.length > 0) result.nextMilestone = upcomingMilestones[0].name || upcomingMilestones[0].task_id;

    const ongoingMilestones = tasks.filter(t => t.is_milestone && (t.progress ?? 0) < 100 && t.start_date <= today && t.end_date >= today)
        .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
    if (ongoingMilestones.length > 0) result.ongoingMilestone = ongoingMilestones[0].name || ongoingMilestones[0].task_id;

    return result;
}

function computeDurationDays(startDate, endDate) {
    if (!startDate || !endDate) return 1;
    const s = new Date(startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(endDate); e.setHours(0, 0, 0, 0);
    const days = Math.round((e - s) / 86400000) + 1;
    return Math.max(1, days);
}
