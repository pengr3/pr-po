/* ========================================
   UNIFIED ASSIGNMENTS VIEW
   Admin panel for assigning projects and services to users.
   Replaces project-assignments.js and service-assignments.js with a
   compact table + modal interface that scales to any number of users.
   ======================================== */

import { db, collection, onSnapshot, updateDoc, doc, query, where, arrayUnion, arrayRemove } from '../firebase.js';
import { showToast } from '../utils.js';
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
let pendingModalCodes = null;  // Set of codes currently checked in open modal, or null if no modal open
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
    console.log('[Assignments] Initializing...');

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
    pendingModalCodes = null;
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
        console.log('[Assignments] Users loaded:', usersData.length);
        renderUsersTable();
    });
    listeners.push(usersUnsub);

    // Listener 2: all projects (unfiltered — admin can assign any)
    const projectsUnsub = onSnapshot(collection(db, 'projects'), (snapshot) => {
        projectsData = [];
        snapshot.forEach(d => projectsData.push({ id: d.id, ...d.data() }));
        projectsData.sort((a, b) => (a.project_code || '').localeCompare(b.project_code || ''));
        console.log('[Assignments] Projects loaded:', projectsData.length);
        renderUsersTable();
    });
    listeners.push(projectsUnsub);

    // Listener 3: all services (unfiltered — admin can assign any)
    const servicesUnsub = onSnapshot(collection(db, 'services'), (snapshot) => {
        servicesData = [];
        snapshot.forEach(d => servicesData.push({ id: d.id, ...d.data() }));
        servicesData.sort((a, b) => (a.service_code || '').localeCompare(b.service_code || ''));
        console.log('[Assignments] Services loaded:', servicesData.length);
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
    console.log('[Assignments] Destroying...');

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
    pendingModalCodes = null;
    currentModalUserId = null;
    currentModalType = null;
    activeSubTab = 'projects';

    console.log('[Assignments] Destroyed');
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
    if (pendingModalCodes !== null) {
        return;
    }

    // Filter users by sub-tab role scope
    let filteredUsers;
    if (activeSubTab === 'projects') {
        filteredUsers = usersData.filter(u =>
            u.role === 'operations_user' || u.role === 'operations_admin'
        );
    } else {
        filteredUsers = usersData.filter(u =>
            u.role === 'services_user' || u.role === 'services_admin'
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
                    <div style="font-weight: 600; color: #1e293b;">${user.full_name || user.display_name || 'Unknown'}</div>
                    <div style="font-size: 0.8rem; color: #94a3b8;">${user.email || ''}</div>
                </td>
                <td>
                    <span style="font-size: 0.875rem; color: #475569;">${roleLabel}</span>
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
 * @param {object} user - User document data
 * @param {string} type - 'projects' | 'services'
 * @returns {string} Display label
 */
function getAssignmentCount(user, type) {
    if (type === 'projects') {
        if (user.all_projects === true) return 'All (legacy)';
        const codes = user.assigned_project_codes || [];
        return codes.length === 0 ? 'None' : `${codes.length} project(s)`;
    } else {
        if (user.all_services === true) return 'All (legacy)';
        const codes = user.assigned_service_codes || [];
        return codes.length === 0 ? 'None' : `${codes.length} service(s)`;
    }
}

/* ========================================
   MODAL — OPEN
   ======================================== */

/**
 * Open the Manage Assignments modal for a given user.
 * Pre-populates checkboxes from user's current codes.
 * For users with all_projects/all_services=true, pre-checks all items
 * so they are not stripped on Save (migrate-on-edit pattern, Pitfall 1).
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

    // Determine starting set of codes (migrate-on-edit for legacy all_* flag)
    let currentCodes;
    if (type === 'projects') {
        if (user.all_projects === true) {
            // Pre-populate with ALL project codes — migrate on Save
            currentCodes = projectsData.map(p => p.project_code).filter(Boolean);
        } else {
            currentCodes = Array.isArray(user.assigned_project_codes) ? user.assigned_project_codes : [];
        }
    } else {
        if (user.all_services === true) {
            // Pre-populate with ALL service codes — migrate on Save
            currentCodes = servicesData.map(s => s.service_code).filter(Boolean);
        } else {
            currentCodes = Array.isArray(user.assigned_service_codes) ? user.assigned_service_codes : [];
        }
    }

    // Set modal state
    pendingModalCodes = new Set(currentCodes);
    currentModalUserId = userId;
    currentModalType = type;

    const userName = user.full_name || user.display_name || 'User';
    const typeLabel = type === 'projects' ? 'Projects' : 'Services';
    const items = type === 'projects' ? projectsData : servicesData;

    const itemsHtml = items.length === 0
        ? `<p style="color: #64748b; padding: 1rem; text-align: center;">No ${typeLabel.toLowerCase()} available to assign.</p>`
        : items.map(item => {
            const code = type === 'projects' ? item.project_code : item.service_code;
            const name = type === 'projects' ? item.project_name : item.service_name;
            const isChecked = pendingModalCodes.has(code);
            const label = code && name ? `${code} — ${name}` : (code || name || '(Unknown)');

            return `
                <label class="assign-modal-item" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border-radius: 6px; cursor: pointer; user-select: none; transition: background 0.15s;"
                       onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                    <input type="checkbox"
                           data-code="${code}"
                           ${isChecked ? 'checked' : ''}
                           style="cursor: pointer; width: 16px; height: 16px; flex-shrink: 0;"
                           onchange="
                               if (this.checked) {
                                   window._pendingModalCodes && window._pendingModalCodes.add(this.dataset.code);
                               } else {
                                   window._pendingModalCodes && window._pendingModalCodes.delete(this.dataset.code);
                               }
                           ">
                    <span style="font-size: 0.875rem; color: #374151; line-height: 1.4;">${label}</span>
                </label>
            `;
        }).join('');

    // Expose pendingModalCodes on window so inline onchange handlers can update it
    window._pendingModalCodes = pendingModalCodes;

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
                        <p style="margin: 0.25rem 0 0 0; font-size: 0.8rem; color: #64748b;">${userName}</p>
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
                        ${pendingModalCodes.size} selected
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
                countEl.textContent = `${pendingModalCodes.size} selected`;
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
 * - Writes explicit assigned_project_codes or assigned_service_codes array
 * - Sets all_projects/all_services to false (migrate-on-edit for legacy flags)
 * - For projects: fires reverse personnel sync on project documents
 * - For services: no reverse sync (intentional asymmetry, per research)
 */
async function saveManageModal() {
    if (pendingModalCodes === null || !currentModalUserId || !currentModalType) {
        console.warn('[Assignments] saveManageModal called with no open modal');
        return;
    }

    const userId = currentModalUserId;
    const type = currentModalType;
    const newCodes = [...pendingModalCodes];

    const field = type === 'projects' ? 'assigned_project_codes' : 'assigned_service_codes';
    const allFlag = type === 'projects' ? 'all_projects' : 'all_services';

    // Capture old codes for reverse sync (projects only)
    const user = usersData.find(u => u.id === userId);
    const oldCodes = type === 'projects'
        ? (Array.isArray(user?.assigned_project_codes) ? user.assigned_project_codes : [])
        : [];

    // Close modal first (gives immediate feedback, avoids modal state race)
    const modal = document.getElementById('manageAssignModal');
    if (modal) modal.remove();
    pendingModalCodes = null;
    currentModalUserId = null;
    currentModalType = null;
    delete window._pendingModalCodes;

    try {
        // Write codes to user doc, clear legacy all_* flag
        await updateDoc(doc(db, 'users', userId), {
            [field]: newCodes,
            [allFlag]: false
        });
        console.log(`[Assignments] Saved ${type} for ${userId}:`, newCodes);

        // Reverse sync for projects only
        if (type === 'projects' && user) {
            syncAssignmentToPersonnel(userId, user, oldCodes, newCodes)
                .catch(err => console.error('[Assignments] Personnel sync failed:', err));
        }

        showToast('Assignments saved', 'success');
    } catch (error) {
        console.error('[Assignments] Error saving assignments:', error);
        showToast('Error saving assignments', 'error');
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

    pendingModalCodes = null;
    currentModalUserId = null;
    currentModalType = null;
    delete window._pendingModalCodes;

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

/* ========================================
   REVERSE PERSONNEL SYNC (projects only)
   ======================================== */

/**
 * When a user's project assignments change, update the project documents'
 * personnel_user_ids and personnel_names arrays to match.
 * This is a fire-and-forget operation — errors are logged but do not block
 * the assignment save.
 *
 * @param {string} userId - The user's document ID
 * @param {object} user - User object with full_name / email
 * @param {string[]} oldCodes - Previous assigned_project_codes
 * @param {string[]} newCodes - New assigned_project_codes
 */
async function syncAssignmentToPersonnel(userId, user, oldCodes, newCodes) {
    const oldSet = new Set(oldCodes);
    const newSet = new Set(newCodes);
    const addedCodes = newCodes.filter(c => !oldSet.has(c));
    const removedCodes = oldCodes.filter(c => !newSet.has(c));

    if (addedCodes.length === 0 && removedCodes.length === 0) return;

    const userName = user?.full_name || user?.email || 'Unknown';
    console.log(`[Assignments] Personnel sync for ${userName} (${userId})`);
    console.log(`[Assignments] Added codes:`, addedCodes, `Removed codes:`, removedCodes);

    const errors = [];

    // Add user as personnel on newly assigned projects
    for (const code of addedCodes) {
        const project = projectsData.find(p => p.project_code === code);
        if (!project) {
            console.warn(`[Assignments] Project not found for code: ${code}`);
            continue;
        }
        try {
            await updateDoc(doc(db, 'projects', project.id), {
                personnel_user_ids: arrayUnion(userId),
                personnel_names: arrayUnion(userName)
            });
            console.log(`[Assignments] Added ${userName} to project ${code}`);
        } catch (err) {
            console.error(`[Assignments] Failed to add ${userName} to ${code}:`, err);
            errors.push({ code, action: 'add', error: err.message });
        }
    }

    // Remove user as personnel from unassigned projects
    for (const code of removedCodes) {
        const project = projectsData.find(p => p.project_code === code);
        if (!project) {
            console.warn(`[Assignments] Project not found for code: ${code}`);
            continue;
        }
        try {
            await updateDoc(doc(db, 'projects', project.id), {
                personnel_user_ids: arrayRemove(userId),
                personnel_names: arrayRemove(userName)
            });
            console.log(`[Assignments] Removed ${userName} from project ${code}`);
        } catch (err) {
            console.error(`[Assignments] Failed to remove ${userName} from ${code}:`, err);
            errors.push({ code, action: 'remove', error: err.message });
        }
    }

    if (errors.length > 0) {
        console.warn('[Assignments] Personnel sync had', errors.length, 'error(s):', errors);
        showToast(`Personnel sync: ${errors.length} error(s)`, 'error');
    } else {
        console.log('[Assignments] Personnel sync complete — no errors');
    }
}

console.log('[Assignments] Unified assignments module loaded');
