/* ========================================
   PROJECT ASSIGNMENTS VIEW
   Admin panel for assigning projects to Operations Users
   ======================================== */

import { db, collection, onSnapshot, updateDoc, doc, query, where, arrayUnion, arrayRemove } from '../firebase.js';
import { showToast } from '../utils.js';

// Module-level state
let usersListener = null;
let projectsListener = null;
let opsUsers = [];        // All operations_user documents
let allProjects = [];     // All active projects (for checkboxes)

/**
 * Render the Project Assignments view container.
 * Content is populated dynamically by init() after listeners fire.
 * Role gate: only super_admin and operations_admin.
 */
export function render() {
    // Role gate: only super_admin and operations_admin
    const user = window.getCurrentUser?.();
    if (!user || (user.role !== 'super_admin' && user.role !== 'operations_admin')) {
        return `
            <div class="container" style="padding: 4rem 2rem;">
                <div class="card">
                    <div class="card-body">
                        <div class="empty-state">
                            <div class="empty-state-icon">🔒</div>
                            <h3>Access Denied</h3>
                            <p>Only Super Admin and Operations Admin can manage project assignments.</p>
                            <button class="btn btn-primary" onclick="location.hash='#/'">Go to Dashboard</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    return `
        <div class="container" style="margin-top: 2rem;">
            <div class="card">
                <div class="suppliers-header">
                    <h2>Project Assignments</h2>
                </div>
                <p style="color: #64748b; margin-bottom: 1.5rem;">Assign projects to Operations Users. Changes save automatically.</p>
                <div id="assignmentsList">
                    <p style="color: #64748b; padding: 1rem;">Loading users...</p>
                </div>
            </div>
        </div>
    `;
}

/**
 * Initialize view: set up two onSnapshot listeners (users, projects).
 * Both call renderAssignmentsList() when data arrives.
 */
export async function init() {
    console.log('[ProjectAssignments] Initializing...');

    // Re-expose window functions on every init (destroy() removes them, and ES module
    // top-level code only runs once on first import, so re-assignment is required here)
    window.handleAllProjectsChange = handleAllProjectsChange;
    window.handleProjectCheckboxChange = handleProjectCheckboxChange;

    // Role gate check (defense in depth -- render() already checked)
    const user = window.getCurrentUser?.();
    if (!user || (user.role !== 'super_admin' && user.role !== 'operations_admin')) {
        console.warn('[ProjectAssignments] Access denied -- not super_admin or operations_admin');
        return;
    }

    // Listener 1: all operations_user and operations_admin documents
    const usersQuery = query(
        collection(db, 'users'),
        where('role', 'in', ['operations_user', 'operations_admin'])
    );
    usersListener = onSnapshot(usersQuery, (snapshot) => {
        opsUsers = [];
        snapshot.forEach(d => opsUsers.push({ id: d.id, ...d.data() }));
        opsUsers.sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
        console.log('[ProjectAssignments] Ops users loaded:', opsUsers.length);
        renderAssignmentsList();
    });

    // Listener 2: all active projects
    const projQuery = query(collection(db, 'projects'), where('active', '==', true));
    projectsListener = onSnapshot(projQuery, (snapshot) => {
        allProjects = [];
        snapshot.forEach(d => allProjects.push({ id: d.id, ...d.data() }));
        allProjects.sort((a, b) => (a.project_code || '').localeCompare(b.project_code || ''));
        console.log('[ProjectAssignments] Projects loaded:', allProjects.length);
        renderAssignmentsList();
    });
}

/**
 * Render the full list of Operations Users with their assignment checkboxes.
 * Called whenever either listener fires.
 */
function renderAssignmentsList() {
    const container = document.getElementById('assignmentsList');
    if (!container) return;

    if (opsUsers.length === 0) {
        container.innerHTML = '<p style="color: #64748b; padding: 1rem;">No Operations Users found.</p>';
        return;
    }

    let html = '';
    opsUsers.forEach(user => {
        const isAllProjects = user.all_projects === true;
        const assignedCodes = Array.isArray(user.assigned_project_codes) ? user.assigned_project_codes : [];

        html += `
            <div class="card" style="margin-bottom: 1rem;">
                <div class="card-body" style="padding: 1rem 1.5rem;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                        <div>
                            <strong style="font-size: 1rem;">${user.full_name || 'Unknown'}</strong>
                            <span style="color: #64748b; font-size: 0.875rem; margin-left: 0.5rem;">${user.email || ''}</span>
                        </div>
                        <span class="status-badge ${isAllProjects ? 'approved' : (assignedCodes.length > 0 ? 'pending' : 'rejected')}">
                            ${isAllProjects ? 'All Projects' : (assignedCodes.length > 0 ? assignedCodes.length + ' project(s)' : 'No projects')}
                        </span>
                    </div>

                    <!-- All Projects checkbox -->
                    <div style="margin-bottom: 0.75rem;">
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: 600;">
                            <input type="checkbox"
                                   class="all-projects-checkbox"
                                   data-userid="${user.id}"
                                   ${isAllProjects ? 'checked' : ''}
                                   onchange="handleAllProjectsChange(this)">
                            All Projects (includes future projects automatically)
                        </label>
                    </div>

                    <!-- Individual project checkboxes -->
                    <div id="projects-${user.id}" style="display: ${isAllProjects ? 'none' : 'block'}; padding-left: 1.5rem;">
                        ${allProjects.length === 0
                            ? '<p style="color: #64748b; font-size: 0.875rem;">No active projects available.</p>'
                            : allProjects.map(project => {
                                const isAssigned = assignedCodes.includes(project.project_code);
                                return `
                                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.25rem 0;">
                                        <input type="checkbox"
                                               class="project-checkbox"
                                               data-userid="${user.id}"
                                               data-projectcode="${project.project_code}"
                                               ${isAssigned ? 'checked' : ''}
                                               onchange="handleProjectCheckboxChange('${user.id}')">
                                        ${project.project_code} - ${project.project_name}
                                    </label>
                                `;
                            }).join('')
                        }
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * Handle "All Projects" checkbox toggle.
 * Writes to Firestore immediately and toggles individual checkbox visibility.
 * @param {HTMLInputElement} checkbox - The All Projects checkbox element
 */
async function handleAllProjectsChange(checkbox) {
    const userId = checkbox.dataset.userid;
    const isChecked = checkbox.checked;

    // Toggle individual project checkboxes visibility
    const projectsDiv = document.getElementById('projects-' + userId);
    if (projectsDiv) {
        projectsDiv.style.display = isChecked ? 'none' : 'block';
    }

    // Write to Firestore
    try {
        if (isChecked) {
            // Set all_projects flag. Clear assigned_project_codes to keep doc clean.
            await updateDoc(doc(db, 'users', userId), {
                all_projects: true,
                assigned_project_codes: []
            });
        } else {
            // Unset all_projects. Read current individual checkboxes to build the array.
            const codes = readCheckedProjectCodes(userId);
            await updateDoc(doc(db, 'users', userId), {
                all_projects: false,
                assigned_project_codes: codes
            });
        }
        console.log('[ProjectAssignments] Updated all_projects for', userId, ':', isChecked);
    } catch (error) {
        console.error('[ProjectAssignments] Error updating assignments:', error);
        showToast('Error saving assignment change', 'error');
    }
}

/**
 * Handle individual project checkbox change.
 * Reads all checked project checkboxes for the user and writes the full array to Firestore.
 * @param {string} userId - The target user's document ID
 */
async function handleProjectCheckboxChange(userId) {
    // Capture old assignments before updating
    const user = opsUsers.find(u => u.id === userId);
    const oldCodes = Array.isArray(user?.assigned_project_codes) ? user.assigned_project_codes : [];
    const newCodes = readCheckedProjectCodes(userId);

    try {
        await updateDoc(doc(db, 'users', userId), {
            all_projects: false,
            assigned_project_codes: newCodes
        });
        console.log('[ProjectAssignments] Updated assigned_project_codes for', userId, ':', newCodes);

        // Reverse sync: update project personnel to match assignment changes
        syncAssignmentToPersonnel(userId, user, oldCodes, newCodes)
            .catch(err => console.error('[ProjectAssignments] Personnel sync failed:', err));
    } catch (error) {
        console.error('[ProjectAssignments] Error updating assignments:', error);
        showToast('Error saving assignment change', 'error');
    }
}

/**
 * Reverse sync: when assignments change, update project documents' personnel arrays.
 * Fire-and-forget — errors are logged but do not block the assignment save.
 * @param {string} userId - The user's document ID
 * @param {object} user - The user object (from opsUsers) with full_name
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
    console.log(`[ProjectAssignments] Personnel sync for user ${userName} (${userId})`);
    console.log(`[ProjectAssignments] Old codes:`, oldCodes, `New codes:`, newCodes);
    console.log(`[ProjectAssignments] Added:`, addedCodes, `Removed:`, removedCodes);

    const errors = [];

    // Add user as personnel on newly assigned projects
    for (const code of addedCodes) {
        const project = allProjects.find(p => p.project_code === code);
        if (!project) {
            console.warn(`[ProjectAssignments] Project not found for code: ${code}`);
            continue;
        }
        try {
            console.log(`[ProjectAssignments] Adding ${userName} to project ${code} (doc: ${project.id})`);
            await updateDoc(doc(db, 'projects', project.id), {
                personnel_user_ids: arrayUnion(userId),
                personnel_names: arrayUnion(userName)
            });
            console.log(`[ProjectAssignments] ✓ Added ${userName} to ${code}`);
        } catch (err) {
            console.error(`[ProjectAssignments] ✗ Failed to add ${userName} to ${code}:`, err);
            errors.push({ code, action: 'add', error: err.message });
        }
    }

    // Remove user as personnel from unassigned projects
    for (const code of removedCodes) {
        const project = allProjects.find(p => p.project_code === code);
        if (!project) {
            console.warn(`[ProjectAssignments] Project not found for code: ${code}`);
            continue;
        }
        try {
            console.log(`[ProjectAssignments] Removing ${userName} from project ${code} (doc: ${project.id})`);
            await updateDoc(doc(db, 'projects', project.id), {
                personnel_user_ids: arrayRemove(userId),
                personnel_names: arrayRemove(userName)
            });
            console.log(`[ProjectAssignments] ✓ Removed ${userName} from ${code}`);
        } catch (err) {
            console.error(`[ProjectAssignments] ✗ Failed to remove ${userName} from ${code}:`, err);
            errors.push({ code, action: 'remove', error: err.message });
        }
    }

    if (errors.length > 0) {
        console.warn('[ProjectAssignments] Personnel sync had', errors.length, 'errors:', errors);
    } else if (addedCodes.length > 0 || removedCodes.length > 0) {
        console.log('[ProjectAssignments] Personnel sync complete — no errors');
    }
}

/**
 * Read currently-checked project codes for a given user from the DOM.
 * @param {string} userId - The target user's document ID
 * @returns {string[]} Array of project_code values for checked checkboxes
 */
function readCheckedProjectCodes(userId) {
    const checkboxes = document.querySelectorAll(
        `.project-checkbox[data-userid="${userId}"]:checked`
    );
    const codes = [];
    checkboxes.forEach(cb => codes.push(cb.dataset.projectcode));
    return codes;
}

/**
 * Cleanup: unsubscribe listeners and remove window functions.
 */
export async function destroy() {
    console.log('[ProjectAssignments] Destroying...');
    if (usersListener) { usersListener(); usersListener = null; }
    if (projectsListener) { projectsListener(); projectsListener = null; }
    opsUsers = [];
    allProjects = [];

    // Clean up window functions
    delete window.handleAllProjectsChange;
    delete window.handleProjectCheckboxChange;

    console.log('[ProjectAssignments] Destroyed');
}

console.log('[ProjectAssignments] View module loaded');
