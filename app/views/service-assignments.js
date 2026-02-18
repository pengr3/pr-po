/* ========================================
   SERVICE ASSIGNMENTS VIEW
   Admin panel for assigning services to Services Users
   ======================================== */

import { db, collection, onSnapshot, updateDoc, doc, query, where, arrayUnion, arrayRemove } from '../firebase.js';
import { showToast } from '../utils.js';

// Module-level state
let usersListener = null;
let servicesListener = null;
let servicesUsers = [];   // All services_user and services_admin documents
let allServices = [];     // All services (for checkboxes)

/**
 * Render the Service Assignments view container.
 * Content is populated dynamically by init() after listeners fire.
 * Role gate: only super_admin and services_admin.
 */
export function render() {
    // Role gate: only super_admin and services_admin
    const user = window.getCurrentUser?.();
    if (!user || (user.role !== 'super_admin' && user.role !== 'services_admin')) {
        return `
            <div class="container" style="padding: 4rem 2rem;">
                <div class="card">
                    <div class="card-body">
                        <div class="empty-state">
                            <div class="empty-state-icon">🔒</div>
                            <h3>Access Denied</h3>
                            <p>Only Super Admin and Services Admin can manage service assignments.</p>
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
                    <h2>Service Assignments</h2>
                </div>
                <p style="color: #64748b; margin-bottom: 1.5rem;">Assign services to Services Users. Changes save automatically.</p>
                <div id="assignmentsList">
                    <p style="color: #64748b; padding: 1rem;">Loading users...</p>
                </div>
            </div>
        </div>
    `;
}

/**
 * Initialize view: set up two onSnapshot listeners (users, services).
 * Both call renderAssignmentsList() when data arrives.
 */
export async function init() {
    console.log('[ServiceAssignments] Initializing...');

    // Re-expose window functions on every init (destroy() removes them)
    window.handleAllServicesChange = handleAllServicesChange;
    window.handleServiceCheckboxChange = handleServiceCheckboxChange;

    // Role gate check (defense in depth — render() already checked)
    const user = window.getCurrentUser?.();
    if (!user || (user.role !== 'super_admin' && user.role !== 'services_admin')) {
        console.warn('[ServiceAssignments] Access denied — not super_admin or services_admin');
        return;
    }

    // Listener 1: all services_user and services_admin documents
    const usersQuery = query(
        collection(db, 'users'),
        where('role', 'in', ['services_user', 'services_admin'])
    );
    usersListener = onSnapshot(usersQuery, (snapshot) => {
        servicesUsers = [];
        snapshot.forEach(d => servicesUsers.push({ id: d.id, ...d.data() }));
        servicesUsers.sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
        console.log('[ServiceAssignments] Services users loaded:', servicesUsers.length);
        renderAssignmentsList();
    });

    // Listener 2: all services (not filtered by active — show all for assignment)
    servicesListener = onSnapshot(collection(db, 'services'), (snapshot) => {
        allServices = [];
        snapshot.forEach(d => allServices.push({ id: d.id, ...d.data() }));
        allServices.sort((a, b) => (a.service_code || '').localeCompare(b.service_code || ''));
        console.log('[ServiceAssignments] Services loaded:', allServices.length);
        renderAssignmentsList();
    });
}

/**
 * Render the full list of Services Users with their assignment checkboxes.
 * Called whenever either listener fires.
 */
function renderAssignmentsList() {
    const container = document.getElementById('assignmentsList');
    if (!container) return;

    if (servicesUsers.length === 0) {
        container.innerHTML = '<p style="color: #64748b; padding: 1rem;">No Services Users found.</p>';
        return;
    }

    let html = '';
    servicesUsers.forEach(user => {
        const isAllServices = user.all_services === true;
        const assignedCodes = Array.isArray(user.assigned_service_codes) ? user.assigned_service_codes : [];

        html += `
            <div class="card" style="margin-bottom: 1rem;">
                <div class="card-body" style="padding: 1rem 1.5rem;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                        <div>
                            <strong style="font-size: 1rem;">${user.full_name || 'Unknown'}</strong>
                            <span style="color: #64748b; font-size: 0.875rem; margin-left: 0.5rem;">${user.email || ''}</span>
                            <span class="status-badge ${user.role === 'services_admin' ? 'approved' : 'pending'}" style="margin-left: 0.5rem; font-size: 0.75rem;">${user.role === 'services_admin' ? 'Admin' : 'User'}</span>
                        </div>
                        <span class="status-badge ${isAllServices ? 'approved' : (assignedCodes.length > 0 ? 'pending' : 'rejected')}">
                            ${isAllServices ? 'All Services' : (assignedCodes.length > 0 ? assignedCodes.length + ' service(s)' : 'No services')}
                        </span>
                    </div>

                    <!-- All Services checkbox -->
                    <div style="margin-bottom: 0.75rem;">
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: 600;">
                            <input type="checkbox"
                                   class="all-services-checkbox"
                                   data-userid="${user.id}"
                                   ${isAllServices ? 'checked' : ''}
                                   onchange="handleAllServicesChange(this)">
                            All Services (includes future services automatically)
                        </label>
                    </div>

                    <!-- Individual service checkboxes -->
                    <div id="services-${user.id}" style="display: ${isAllServices ? 'none' : 'block'}; padding-left: 1.5rem;">
                        ${allServices.length === 0
                            ? '<p style="color: #64748b; font-size: 0.875rem;">No services available.</p>'
                            : allServices.map(service => {
                                const isAssigned = assignedCodes.includes(service.service_code);
                                return `
                                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.25rem 0;">
                                        <input type="checkbox"
                                               class="service-checkbox"
                                               data-userid="${user.id}"
                                               data-servicecode="${service.service_code}"
                                               ${isAssigned ? 'checked' : ''}
                                               onchange="handleServiceCheckboxChange('${user.id}')">
                                        ${service.service_code} — ${service.service_name || '(Unnamed)'}
                                        <span style="color: #94a3b8; font-size: 0.75rem; margin-left: 0.25rem;">${service.service_type === 'recurring' ? '(recurring)' : '(one-time)'}</span>
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
 * Handle "All Services" checkbox toggle.
 * Writes to Firestore immediately and toggles individual checkbox visibility.
 * @param {HTMLInputElement} checkbox - The All Services checkbox element
 */
async function handleAllServicesChange(checkbox) {
    const userId = checkbox.dataset.userid;
    const isChecked = checkbox.checked;

    // Toggle individual service checkboxes visibility
    const servicesDiv = document.getElementById('services-' + userId);
    if (servicesDiv) {
        servicesDiv.style.display = isChecked ? 'none' : 'block';
    }

    // Write to Firestore
    try {
        if (isChecked) {
            // Set all_services flag. Clear assigned_service_codes to keep doc clean.
            await updateDoc(doc(db, 'users', userId), {
                all_services: true,
                assigned_service_codes: []
            });
        } else {
            // Unset all_services. Read current individual checkboxes to build the array.
            const codes = readCheckedServiceCodes(userId);
            await updateDoc(doc(db, 'users', userId), {
                all_services: false,
                assigned_service_codes: codes
            });
        }
        console.log('[ServiceAssignments] Updated all_services for', userId, ':', isChecked);
    } catch (error) {
        console.error('[ServiceAssignments] Error updating assignments:', error);
        showToast('Error saving assignment change', 'error');
    }
}

/**
 * Handle individual service checkbox change.
 * Reads all checked service checkboxes for the user and writes the full array to Firestore.
 * @param {string} userId - The target user's document ID
 */
async function handleServiceCheckboxChange(userId) {
    const newCodes = readCheckedServiceCodes(userId);

    try {
        await updateDoc(doc(db, 'users', userId), {
            all_services: false,
            assigned_service_codes: newCodes
        });
        console.log('[ServiceAssignments] Updated assigned_service_codes for', userId, ':', newCodes);
    } catch (error) {
        console.error('[ServiceAssignments] Error updating assignments:', error);
        showToast('Error saving assignment change', 'error');
    }
}

/**
 * Read currently-checked service codes for a given user from the DOM.
 * @param {string} userId - The target user's document ID
 * @returns {string[]} Array of service_code values for checked checkboxes
 */
function readCheckedServiceCodes(userId) {
    const checkboxes = document.querySelectorAll(
        `.service-checkbox[data-userid="${userId}"]:checked`
    );
    const codes = [];
    checkboxes.forEach(cb => codes.push(cb.dataset.servicecode));
    return codes;
}

/**
 * Cleanup: unsubscribe listeners and remove window functions.
 */
export async function destroy() {
    console.log('[ServiceAssignments] Destroying...');
    if (usersListener) { usersListener(); usersListener = null; }
    if (servicesListener) { servicesListener(); servicesListener = null; }
    servicesUsers = [];
    allServices = [];

    // Clean up window functions
    delete window.handleAllServicesChange;
    delete window.handleServiceCheckboxChange;

    console.log('[ServiceAssignments] Destroyed');
}

console.log('[ServiceAssignments] View module loaded');
