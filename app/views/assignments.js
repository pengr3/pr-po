/* ========================================
   UNIFIED ASSIGNMENTS VIEW
   Admin panel for assigning projects and services to users.
   Replaces project-assignments.js and service-assignments.js with a
   compact table + modal interface that scales to any number of users.
   ======================================== */

import { db, collection, onSnapshot, updateDoc, doc, query, where, arrayUnion, arrayRemove } from '../firebase.js';
import { showToast, escapeHTML } from '../utils.js';
import { skeletonTableRows } from '../components.js';

/* ========================================
   MODULE STATE
   ======================================== */

let activeSubTab = 'projects'; // 'projects' | 'services'
let usersData = [];            // All approved users (filtered for display by sub-tab)
let projectsData = [];         // All projects (for modal checkboxes)
let servicesData = [];         // All services (for modal checkboxes)
let listeners = [];

// Modal state — held until Save is clicked
let pendingModalIds = null;    // Set of container document IDs currently checked in open modal, or null if no modal open
let currentModalUserId = null;
let currentModalType = null;   // 'projects' | 'services'

/* ========================================
   ROLE HELPERS
   ======================================== */

const ROLE_LABELS = {
    super_admin: 'Super Admin',
    operations_admin: 'Operations Admin',
    operations_user: 'Operations User',
    services_admin: 'Services Admin',
    services_user: 'Services User',
    finance: 'Finance',
    procurement: 'Procurement'
};

/**
 * Determine which sub-tabs are visible for the current user's role.
 * @returns {{ showProjects: boolean, showServices: boolean }}
 */
function getVisibleSubTabs() {
    const user = window.getCurrentUser?.();
    const role = user?.role || '';
    if (role === 'services_admin') {
        return { showProjects: false, showServices: true };
    }
    if (role === 'operations_admin') {
        return { showProjects: true, showServices: false };
    }
    // super_admin and any other admin role: show both
    return { showProjects: true, showServices: true };
}

/* ========================================
   RENDER FUNCTION
   ======================================== */

/**
 * Render the Assignments wrapper with sub-tab buttons.
 * @param {string} subTab - Active sub-tab ('projects' | 'services')
 * @returns {string} HTML for the view
 */
export function render(subTab = null) {
    const user = window.getCurrentUser?.();
    if (!user || (user.role !== 'super_admin' && user.role !== 'operations_admin' && user.role !== 'services_admin')) {
        return `
            <div class="container" style="padding: 4rem 2rem;">
                <div class="card">
                    <div class="card-body">
                        <div class="empty-state">
                            <div class="empty-state-icon">🔒</div>
                            <h3>Access Denied</h3>
                            <p>Only Super Admin, Operations Admin, and Services Admin can manage assignments.</p>
                            <button class="btn btn-primary" onclick="location.hash='#/'">Go to Dashboard</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    const { showProjects, showServices } = getVisibleSubTabs();
    // Resolve effective default sub-tab
    const effectiveSubTab = subTab || (showProjects ? 'projects' : 'services');

    return `
        <div class="container" style="margin-top: 2rem;">
            <div class="card">
                <div class="card-body" style="padding: 1.5rem 2rem;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
                        <div>
                            <h2 style="margin: 0 0 0.25rem 0; font-size: 1.25rem; color: #1e293b;">User Assignments</h2>
                            <p style="margin: 0; color: #64748b; font-size: 0.875rem;">
                                Assign projects or services to users. Click [Manage] to open the assignment modal.
                            </p>
                        </div>

                        ${(showProjects && showServices) ? `
                        <div style="display: flex; gap: 0.5rem; background: #f1f5f9; padding: 0.25rem; border-radius: 8px;">
                            <button id="subTabProjects"
                                    class="tab-btn ${effectiveSubTab === 'projects' ? 'active' : ''}"
                                    style="padding: 0.4rem 1rem; font-size: 0.875rem;"
                                    onclick="window.switchAssignmentSubTab('projects')">
                                Projects
                            </button>
                            <button id="subTabServices"
                                    class="tab-btn ${effectiveSubTab === 'services' ? 'active' : ''}"
                                    style="padding: 0.4rem 1rem; font-size: 0.875rem;"
                                    onclick="window.switchAssignmentSubTab('services')">
                                Services
                            </button>
                        </div>
                        ` : ''}
                    </div>

                    <div id="assignmentsTableContainer">
                        <div style="overflow-x: auto;">
                        <table class="table" style="width: 100%;">
                            <thead>
                                <tr>
                                    <th style="width: 35%;">Name</th>
                                    <th style="width: 20%;">Role</th>
                                    <th style="width: 20%;">Assignment Count</th>
                                    <th style="width: 25%;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>${skeletonTableRows(4, 5)}</tbody>
                        </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/* ========================================
   INIT FUNCTION
   ======================================== */

/**
 * Initialize the Assignments view.
 * Sets up three Firestore onSnapshot listeners: users, projects, services.
 * @param {string} subTab - Sub-tab to activate ('projects' | 'services')
 */
export async function init(subTab = null) {
    // Role gate
    const user = window.getCurrentUser?.();
    if (!user || (user.role !== 'super_admin' && user.role !== 'operations_admin' && user.role !== 'services_admin')) {
        console.warn('[Assignments] Access denied');
        return;
    }

    const { showProjects, showServices } = getVisibleSubTabs();
    // Set active sub-tab
    if (subTab) {
        activeSubTab = subTab;
    } else {
        activeSubTab = showProjects ? 'projects' : 'services';
    }

    // Register window functions (re-register on every init — destroy() removes them)
    window.openManageModal = openManageModal;
    window.saveManageModal = saveManageModal;
    window.closeManageModal = closeManageModal;
    window.switchAssignmentSubTab = switchAssignmentSubTab;
    window.filterModalItems = filterModalItems;

    // Reset modal state
    pendingModalIds = null;
    currentModalUserId = null;
    currentModalType = null;

    // Listener 1: all approved users with assignable roles
    const usersQuery = query(
        collection(db, 'users'),
        where('status', '==', 'active')
    );
    const usersUnsub = onSnapshot(usersQuery, (snapshot) => {
        usersData = [];
        snapshot.forEach(d => usersData.push({ id: d.id, ...d.data() }));
        usersData.sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''));
        renderUsersTable();
    });
    listeners.push(usersUnsub);

    // Listener 2: all projects (unfiltered — admin can assign any)
    const projectsUnsub = onSnapshot(collection(db, 'projects'), (snapshot) => {
        projectsData = [];
        snapshot.forEach(d => projectsData.push({ id: d.id, ...d.data() }));
        projectsData.sort((a, b) => (a.project_code || '').localeCompare(b.project_code || ''));
        renderUsersTable();
    });
    listeners.push(projectsUnsub);

    // Listener 3: all services (unfiltered — admin can assign any)
    const servicesUnsub = onSnapshot(collection(db, 'services'), (snapshot) => {
        servicesData = [];
        snapshot.forEach(d => servicesData.push({ id: d.id, ...d.data() }));
        servicesData.sort((a, b) => (a.service_code || '').localeCompare(b.service_code || ''));
        renderUsersTable();
    });
    listeners.push(servicesUnsub);
}

/* ========================================
   DESTROY FUNCTION
   ======================================== */

/**
 * Cleanup: unsubscribe all listeners and remove window functions.
 */
export async function destroy() {
    listeners.forEach(unsub => unsub?.());
    listeners = [];

    // Remove window functions
    delete window.openManageModal;
    delete window.saveManageModal;
    delete window.closeManageModal;
    delete window.switchAssignmentSubTab;
    delete window.filterModalItems;

    // Reset module state
    usersData = [];
    projectsData = [];
    servicesData = [];
    pendingModalIds = null;
    currentModalUserId = null;
    currentModalType = null;
    activeSubTab = 'projects';
}

/* ========================================
   PERSONNEL MEMBERSHIP HELPER
   ======================================== */

/**
 * Get all items (projects or services) whose personnel_user_ids includes the given user id.
 * Single shared source of truth used by getAssignmentCount, the cross-department row filter,
 * and saveManageModal's old/new id diffing — so the displayed count and the row-visibility
 * filter can never disagree (Phase 113 D-10).
 * @param {object[]} itemsList - projectsData or servicesData
 * @param {string} userId
 * @returns {object[]} matching items (each carries at least an `id` field)
 */
function getPersonnelMemberships(itemsList, userId) {
    if (!userId) return [];
    return itemsList.filter(item => Array.isArray(item.personnel_user_ids) && item.personnel_user_ids.includes(userId));
}

/* ========================================
   TABLE RENDERING
   ======================================== */

/**
 * Render the users table for the active sub-tab.
 * Skips re-render if a modal is currently open to prevent it from disappearing
 * due to background Firestore snapshot updates (Pitfall 2).
 */
function renderUsersTable() {
    const container = document.getElementById('assignmentsTableContainer');
    if (!container) return;

    // Guard: if modal is open, skip re-render
    if (pendingModalIds !== null) {
        return;
    }

    // Filter users by sub-tab. Native department roles always show; plus (Quick 260627-kg0)
    // a cross-department *_user who HOLDS assignments in this department stays visible + manageable
    // here, so their assignments survive a role/department change instead of being orphaned in the
    // admin grid. Phase 113 D-10: personnel_user_ids on the live projects/services documents is the
    // sole record now — a cross-department user stays visible whenever at least one container in
    // this department lists them as personnel.
    let filteredUsers;
    if (activeSubTab === 'projects') {
        filteredUsers = usersData.filter(u =>
            u.role === 'operations_user' || u.role === 'operations_admin' ||
            (u.role === 'services_user' && getPersonnelMemberships(projectsData, u.id).length > 0) ||
            // Quick 260706-mco: cross-dept services_admin stays manageable once it holds project personnel membership.
            (u.role === 'services_admin' && getPersonnelMemberships(projectsData, u.id).length > 0)
        );
    } else {
        filteredUsers = usersData.filter(u =>
            u.role === 'services_user' || u.role === 'services_admin' ||
            (u.role === 'operations_user' && getPersonnelMemberships(servicesData, u.id).length > 0) ||
            // Quick 260706-mco: cross-dept operations_admin stays manageable once it holds service personnel membership.
            (u.role === 'operations_admin' && getPersonnelMemberships(servicesData, u.id).length > 0)
        );
    }

    if (filteredUsers.length === 0) {
        const type = activeSubTab === 'projects' ? 'Operations' : 'Services';
        container.innerHTML = `<p style="color: #64748b; padding: 1rem 0;">No ${type} Users found.</p>`;
        return;
    }

    const rows = filteredUsers.map(user => {
        const roleLabel = ROLE_LABELS[user.role] || user.role || 'Unknown';
        const countDisplay = getAssignmentCount(user, activeSubTab);
        const countClass = countDisplay === 'None' ? 'rejected' : (countDisplay === 'All (legacy)' ? 'approved' : 'pending');

        return `
            <tr>
                <td>
                    <div style="font-weight: 600; color: #1e293b;">${escapeHTML(user.full_name || user.display_name || 'Unknown')}</div>
                    <div style="font-size: 0.8rem; color: #94a3b8;">${escapeHTML(user.email || '')}</div>
                </td>
                <td>
                    <span style="font-size: 0.875rem; color: #475569;">${escapeHTML(roleLabel)}</span>
                </td>
                <td>
                    <span class="status-badge ${countClass}" style="font-size: 0.75rem;">
                        ${countDisplay}
                    </span>
                </td>
                <td>
                    <button class="btn btn-secondary btn-sm"
                            style="padding: 0.3rem 0.75rem; font-size: 0.8rem;"
                            onclick="window.openManageModal('${user.id}', '${activeSubTab}')">
                        Manage
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div style="overflow-x: auto;">
            <table class="table" style="width: 100%;">
                <thead>
                    <tr>
                        <th style="width: 35%;">Name</th>
                        <th style="width: 20%;">Role</th>
                        <th style="width: 20%;">Assignment Count</th>
                        <th style="width: 25%;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

/* ========================================
   ASSIGNMENT COUNT HELPER
   ======================================== */

/**
 * Get a display string for how many items are assigned to a user.
 * Handles legacy all_projects/all_services flag with migrate-on-edit pattern.
 * Count is derived from live personnel_user_ids membership (Phase 113 D-10) —
 * a container that does not exist cannot appear in the count, so no
 * cross-reference-against-existing-codes step is needed.
 * @param {object} user - User document data
 * @param {string} type - 'projects' | 'services'
 * @returns {string} Display label
 */
function getAssignmentCount(user, type) {
    if (type === 'projects') {
        if (user.all_projects === true) return 'All (legacy)';
        const validCount = getPersonnelMemberships(projectsData, user.id).length;
        return validCount === 0 ? 'None' : `${validCount} project(s)`;
    } else {
        if (user.all_services === true) return 'All (legacy)';
        const validCount = getPersonnelMemberships(servicesData, user.id).length;
        return validCount === 0 ? 'None' : `${validCount} service(s)`;
    }
}

/* ========================================
   MODAL — OPEN
   ======================================== */

/**
 * Open the Manage Assignments modal for a given user.
 * Pre-populates checkboxes from the user's current personnel_user_ids membership
 * across the loaded container set (Phase 113 D-05/D-10 — personnel_user_ids on the
 * container document is authoritative, not the legacy user-document code arrays).
 * For users with all_projects/all_services=true, pre-checks all items
 * so they are not stripped on Save (migrate-on-edit pattern, D-09).
 *
 * @param {string} userId - User document ID
 * @param {string} type - 'projects' | 'services'
 */
function openManageModal(userId, type) {
    const user = usersData.find(u => u.id === userId);
    if (!user) {
        console.error('[Assignments] User not found:', userId);
        return;
    }

    const items = type === 'projects' ? projectsData : servicesData;

    // Determine starting set of container document IDs (migrate-on-edit for legacy all_* flag)
    let currentIds;
    if (type === 'projects') {
        if (user.all_projects === true) {
            // Pre-check EVERY project — migrate on Save
            currentIds = items.map(p => p.id);
        } else {
            currentIds = getPersonnelMemberships(items, userId).map(p => p.id);
        }
    } else {
        if (user.all_services === true) {
            // Pre-check EVERY service — migrate on Save
            currentIds = items.map(s => s.id);
        } else {
            currentIds = getPersonnelMemberships(items, userId).map(s => s.id);
        }
    }

    // Set modal state
    pendingModalIds = new Set(currentIds);
    currentModalUserId = userId;
    currentModalType = type;

    const userName = user.full_name || user.display_name || 'User';
    const typeLabel = type === 'projects' ? 'Projects' : 'Services';

    const itemsHtml = items.length === 0
        ? `<p style="color: #64748b; padding: 1rem; text-align: center;">No ${typeLabel.toLowerCase()} available to assign.</p>`
        : items.map(item => {
            const code = type === 'projects' ? item.project_code : item.service_code;
            const name = type === 'projects' ? item.project_name : item.service_name;
            const isChecked = pendingModalIds.has(item.id);
            const label = code && name ? `${code} — ${name}` : (code || name || '(Unknown)');

            return `
                <label class="assign-modal-item" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border-radius: 6px; cursor: pointer; user-select: none; transition: background 0.15s;"
                       onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                    <input type="checkbox"
                           data-id="${item.id}"
                           ${isChecked ? 'checked' : ''}
                           style="cursor: pointer; width: 16px; height: 16px; flex-shrink: 0;"
                           onchange="
                               if (this.checked) {
                                   window._pendingModalIds && window._pendingModalIds.add(this.dataset.id);
                               } else {
                                   window._pendingModalIds && window._pendingModalIds.delete(this.dataset.id);
                               }
                           ">
                    <span style="font-size: 0.875rem; color: #374151; line-height: 1.4;">${escapeHTML(label)}</span>
                </label>
            `;
        }).join('');

    // Expose pendingModalIds on window so inline onchange handlers can update it
    window._pendingModalIds = pendingModalIds;

    const modalHtml = `
        <div id="manageAssignModal"
             style="position: fixed; inset: 0; background: rgba(0,0,0,0.35); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 9999;"
             onclick="if(event.target===this) window.closeManageModal()">
            <div style="background: white; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); width: 540px; max-width: 95vw; display: flex; flex-direction: column; max-height: 85vh;"
                 onclick="event.stopPropagation()">

                <!-- Modal Header -->
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem; border-bottom: 1px solid #e5e7eb; flex-shrink: 0;">
                    <div>
                        <h3 style="margin: 0; font-size: 1.1rem; color: #1e293b;">Manage ${typeLabel}</h3>
                        <p style="margin: 0.25rem 0 0 0; font-size: 0.8rem; color: #64748b;">${escapeHTML(userName)}</p>
                    </div>
                    <button onclick="window.closeManageModal()"
                            style="background: none; border: none; cursor: pointer; color: #94a3b8; font-size: 1.25rem; padding: 0.25rem; line-height: 1; border-radius: 4px;"
                            onmouseover="this.style.color='#374151'" onmouseout="this.style.color='#94a3b8'">
                        &times;
                    </button>
                </div>

                <!-- Search Input -->
                <div style="padding: 0.75rem 1.5rem; border-bottom: 1px solid #f1f5f9; flex-shrink: 0;">
                    <input type="text"
                           id="modalSearchInput"
                           placeholder="Search ${typeLabel.toLowerCase()}..."
                           oninput="window.filterModalItems(this.value)"
                           style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.875rem; color: #374151; outline: none; box-sizing: border-box;"
                           onfocus="this.style.borderColor='#1a73e8'" onblur="this.style.borderColor='#e2e8f0'">
                </div>

                <!-- Checkbox List -->
                <div id="modalItemsList"
                     style="overflow-y: auto; padding: 0.5rem 1rem; flex: 1; min-height: 0;">
                    ${items.length === 0
                        ? `<p style="color: #64748b; padding: 1rem; text-align: center;">No ${typeLabel.toLowerCase()} available to assign.</p>`
                        : `<div id="modalCheckboxItems">${itemsHtml}</div>`
                    }
                </div>

                <!-- Modal Footer -->
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; border-top: 1px solid #e5e7eb; flex-shrink: 0;">
                    <span id="modalSelectionCount" style="font-size: 0.8rem; color: #64748b;">
                        ${pendingModalIds.size} selected
                    </span>
                    <div style="display: flex; gap: 0.75rem;">
                        <button class="btn btn-secondary"
                                onclick="window.closeManageModal()"
                                style="padding: 0.5rem 1.25rem; font-size: 0.875rem;">
                            Cancel
                        </button>
                        <button class="btn btn-primary"
                                onclick="window.saveManageModal()"
                                style="padding: 0.5rem 1.25rem; font-size: 0.875rem;">
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Update selection count on checkbox change
    const checkboxItems = document.getElementById('modalCheckboxItems');
    if (checkboxItems) {
        checkboxItems.addEventListener('change', () => {
            const countEl = document.getElementById('modalSelectionCount');
            if (countEl) {
                countEl.textContent = `${pendingModalIds.size} selected`;
            }
        });
    }

    // Focus search
    setTimeout(() => {
        const searchInput = document.getElementById('modalSearchInput');
        if (searchInput) searchInput.focus();
    }, 50);
}

/* ========================================
   MODAL — FILTER
   ======================================== */

/**
 * Filter visible checkbox items in the modal by search query.
 * Matches against both code and name fields.
 * @param {string} searchValue - User's search input
 */
function filterModalItems(searchValue) {
    const query = (searchValue || '').toLowerCase().trim();
    const items = document.querySelectorAll('#modalCheckboxItems .assign-modal-item');
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = query === '' || text.includes(query) ? '' : 'none';
    });
}

/* ========================================
   MODAL — SAVE
   ======================================== */

/**
 * Save the current modal checkbox selection to Firestore.
 *
 * Writes personnel_user_ids / personnel_names DIRECTLY onto the affected
 * projects/services documents (arrayUnion for newly-checked containers,
 * arrayRemove for newly-unchecked ones) — the container document is now the
 * only record of an assignment (Phase 113 D-05). Every container write is
 * awaited and a failure is surfaced in a toast; nothing is fire-and-forgotten.
 *
 * SUPERSEDE NOTICE (Phase 113 D-06): Quick 260706-mco's lock on this function —
 * "saveManageModal @571-573 (writes all_projects:false — the landmine source,
 * do NOT change)" (260706-mco-PLAN.md:142, restated at :296) — is DELIBERATELY
 * SUPERSEDED as of this rewrite. That lock existed to stop the all_projects:false /
 * all_services:false write from silently scoping an admin out of their own home
 * department while assigned_project_codes/assigned_service_codes were still the
 * arrays read by getAssignedProjectCodes()/getAssignedServiceCodes(). Phase 113
 * D-08 repointed both helpers onto live personnel_user_ids membership, so those
 * legacy arrays are no longer read for visibility anywhere in the app — the
 * landmine this lock protected against no longer exists.
 */
async function saveManageModal() {
    if (pendingModalIds === null || !currentModalUserId || !currentModalType) {
        console.warn('[Assignments] saveManageModal called with no open modal');
        return;
    }

    const userId = currentModalUserId;
    const type = currentModalType;
    const newIds = [...pendingModalIds];

    const allFlag = type === 'projects' ? 'all_projects' : 'all_services';
    const items = type === 'projects' ? projectsData : servicesData;

    const user = usersData.find(u => u.id === userId);
    const userName = user?.full_name || user?.email || 'Unknown';

    // Old id set derived from personnel membership over the SAME container array
    // the modal was built from — NOT from assigned_project_codes/assigned_service_codes.
    const oldIds = new Set(getPersonnelMemberships(items, userId).map(item => item.id));
    const newIdSet = new Set(newIds);
    const addedIds = newIds.filter(id => !oldIds.has(id));
    const removedIds = [...oldIds].filter(id => !newIdSet.has(id));
    const shouldClearAllFlag = type === 'projects' ? user?.all_projects === true : user?.all_services === true;

    // Close modal first (gives immediate feedback, avoids modal state race)
    const modal = document.getElementById('manageAssignModal');
    if (modal) modal.remove();
    pendingModalIds = null;
    currentModalUserId = null;
    currentModalType = null;
    delete window._pendingModalIds;

    if (addedIds.length === 0 && removedIds.length === 0) {
        showToast('Assignments saved', 'success');
        renderUsersTable();
        return;
    }

    const containerErrors = [];

    for (const id of addedIds) {
        const item = items.find(i => i.id === id);
        const label = item ? (item.project_code || item.service_code || item.project_name || item.service_name || id) : id;
        try {
            await updateDoc(doc(db, type, id), {
                personnel_user_ids: arrayUnion(userId),
                personnel_names: arrayUnion(userName)
            });
        } catch (error) {
            console.error(`[Assignments] Failed to add ${userName} to ${label}:`, error);
            containerErrors.push({ label, action: 'add', error });
        }
    }

    for (const id of removedIds) {
        const item = items.find(i => i.id === id);
        const label = item ? (item.project_code || item.service_code || item.project_name || item.service_name || id) : id;
        try {
            await updateDoc(doc(db, type, id), {
                personnel_user_ids: arrayRemove(userId),
                personnel_names: arrayRemove(userName)
            });
        } catch (error) {
            console.error(`[Assignments] Failed to remove ${userName} from ${label}:`, error);
            containerErrors.push({ label, action: 'remove', error });
        }
    }

    if (containerErrors.length === 0) {
        showToast('Assignments saved', 'success');
    } else {
        showToast(`Assignments: ${containerErrors.length} container write(s) failed`, 'error');
    }

    // D-09: clear the legacy all_* flag only when the target user actually holds it,
    // as its OWN independently-erroring write — kept separate from the container-write
    // error path above because this write can legitimately be denied cross-department
    // once the users update carve-out is dropped (plan 113-10, D-17), and the admin
    // must be told that specifically rather than reading a generic "assignments failed".
    if (shouldClearAllFlag) {
        try {
            await updateDoc(doc(db, 'users', userId), { [allFlag]: false });
        } catch (error) {
            console.error(`[Assignments] Failed to clear legacy ${allFlag} flag:`, error);
            showToast(`Could not clear the legacy "${allFlag}" flag — a Super Admin must clear it manually`, 'error');
        }
    }

    // Re-render table to pick up any blocked snapshot updates
    renderUsersTable();
}

/* ========================================
   MODAL — CLOSE
   ======================================== */

/**
 * Close the modal without saving. Resets modal state and re-renders the table
 * to apply any Firestore updates that were held back while the modal was open.
 */
function closeManageModal() {
    const modal = document.getElementById('manageAssignModal');
    if (modal) modal.remove();

    pendingModalIds = null;
    currentModalUserId = null;
    currentModalType = null;
    delete window._pendingModalIds;

    // Re-render to pick up any blocked snapshot updates
    renderUsersTable();
}

/* ========================================
   SUB-TAB SWITCHING
   ======================================== */

/**
 * Switch the visible sub-tab (Projects | Services).
 * @param {string} subTab - 'projects' | 'services'
 */
function switchAssignmentSubTab(subTab) {
    if (subTab === activeSubTab) return;
    activeSubTab = subTab;

    // Update button active states
    const projectsBtn = document.getElementById('subTabProjects');
    const servicesBtn = document.getElementById('subTabServices');
    if (projectsBtn) projectsBtn.classList.toggle('active', subTab === 'projects');
    if (servicesBtn) servicesBtn.classList.toggle('active', subTab === 'services');

    renderUsersTable();
}
