/* ========================================
   USER MANAGEMENT VIEW
   Super Admin interface for managing users and invitation codes
   ======================================== */

import { db } from '../firebase.js';
import {
    collection,
    doc,
    onSnapshot,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp
} from '../firebase.js';
import { showToast } from '../utils.js';

/* ========================================
   MODULE STATE
   ======================================== */

let listeners = [];              // Array of unsubscribe functions
let invitationCodes = [];        // Loaded invitation codes
let pendingUsers = [];           // Loaded pending users
let pendingUsersListener = null; // Listener for pending users
let selectedUserForApproval = null; // User being approved
let allUsers = [];               // All active/deactivated users (excludes pending)
let allUsersListener = null;     // Listener for all users
let userSearchQuery = '';        // Search query for user filtering

/* ========================================
   RENDER FUNCTION
   ======================================== */

/**
 * Render the User Management view with 3-tab layout
 * @param {string} activeTab - Active tab ID (defaults to 'codes')
 * @returns {string} HTML for the view
 */
export function render(activeTab = null) {
    // Role gate (defense in depth)
    const user = window.getCurrentUser?.();
    if (!user || user.role !== 'super_admin') {
        return `
            <div class="container" style="padding: 4rem 2rem;">
                <div class="card">
                    <div class="card-body">
                        <div class="empty-state">
                            <div class="empty-state-icon">🔒</div>
                            <h3>Access Denied</h3>
                            <p>Only Super Admin can manage users.</p>
                            <button class="btn btn-primary" onclick="location.hash='#/'">Go to Dashboard</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Default to invitation codes tab
    const currentTab = activeTab || 'codes';

    return `
        <div class="container" style="margin-top: 2rem;">
            <div class="card">
                <div class="suppliers-header">
                    <h2>User Management</h2>
                </div>

                <!-- Tab Navigation -->
                <div class="tab-buttons">
                    <button class="tab-btn ${currentTab === 'approvals' ? 'active' : ''}"
                            onclick="switchUserMgmtTab('approvals')">
                        Pending Approvals
                    </button>
                    <button class="tab-btn ${currentTab === 'users' ? 'active' : ''}"
                            onclick="switchUserMgmtTab('users')">
                        All Users
                    </button>
                    <button class="tab-btn ${currentTab === 'codes' ? 'active' : ''}"
                            onclick="switchUserMgmtTab('codes')">
                        Invitation Codes
                    </button>
                </div>

                <!-- Tab Content -->
                <div id="approvalsTab" class="tab-content" style="display: ${currentTab === 'approvals' ? 'block' : 'none'};">
                    <!-- Pending Approvals Header -->
                    <div class="suppliers-header" style="border-top: 1px solid #e5e7eb; padding-top: 1.5rem;">
                        <div>
                            <h3 style="font-size: 1.125rem; margin: 0;">Pending User Approvals</h3>
                            <span id="pendingUsersBadge" class="status-badge" style="display: inline-block; margin-top: 0.5rem; font-size: 0.875rem;">
                                Loading...
                            </span>
                        </div>
                    </div>

                    <!-- Pending Users Table -->
                    <div id="pendingUsersContainer">
                        <p style="color: #64748b; padding: 1rem;">Loading pending users...</p>
                    </div>
                </div>

                <div id="usersTab" class="tab-content" style="display: ${currentTab === 'users' ? 'block' : 'none'};">
                    <!-- All Users Header -->
                    <div class="suppliers-header" style="border-top: 1px solid #e5e7eb; padding-top: 1.5rem;">
                        <div>
                            <h3 style="font-size: 1.125rem; margin: 0;">All Users</h3>
                            <span id="allUsersBadge" class="status-badge" style="display: inline-block; margin-top: 0.5rem; font-size: 0.875rem;">
                                Loading...
                            </span>
                        </div>
                    </div>

                    <!-- Search Bar -->
                    <div style="margin-bottom: 1.5rem;">
                        <input type="text"
                               class="form-input"
                               placeholder="Search by email..."
                               value="${userSearchQuery}"
                               oninput="handleUserSearch(event)"
                               style="max-width: 400px;">
                    </div>

                    <!-- Users Table Container -->
                    <div id="usersTableContainer">
                        <p style="color: #64748b; padding: 1rem;">Loading users...</p>
                    </div>
                </div>

                <div id="codesTab" class="tab-content" style="display: ${currentTab === 'codes' ? 'block' : 'none'};">
                    <!-- Invitation Codes Header -->
                    <div class="suppliers-header" style="border-top: 1px solid #e5e7eb; padding-top: 1.5rem;">
                        <h3 style="font-size: 1.125rem; margin: 0;">Invitation Codes</h3>
                        <button class="btn btn-primary" onclick="generateInvitationCode()">
                            Generate New Code
                        </button>
                    </div>

                    <!-- Info Box -->
                    <div class="info-box" style="margin-bottom: 1.5rem; padding: 0.75rem 1rem; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 6px; color: #92400e;">
                        ⏱️ Codes expire after 3 hours if unused
                    </div>

                    <!-- Invitation Codes Table -->
                    <div id="invitationCodesTableContainer">
                        <p style="color: #64748b; padding: 1rem;">Loading codes...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/* ========================================
   INITIALIZATION
   ======================================== */

/**
 * Initialize the view: set up listeners and register window functions
 * @param {string} activeTab - Active tab ID
 */
export async function init(activeTab = null) {
    console.log('[UserManagement] Initializing...');

    // Role gate check (defense in depth)
    const user = window.getCurrentUser?.();
    if (!user || user.role !== 'super_admin') {
        console.warn('[UserManagement] Access denied -- not super_admin');
        return;
    }

    // Register window functions for event handlers
    window.switchUserMgmtTab = switchUserMgmtTab;
    window.generateInvitationCode = generateInvitationCode;
    window.copyCodeToClipboard = copyCodeToClipboard;
    window.openApprovalModal = openApprovalModal;
    window.handleRejectUser = handleRejectUser;
    window.confirmApproval = confirmApproval;
    window.closeApprovalModal = closeApprovalModal;
    window.handleUserSearch = handleUserSearch;
    window.toggleUserActionMenu = toggleUserActionMenu;
    window.handleEditRole = handleEditRole;
    window.handleDeactivateUser = handleDeactivateUser;
    window.handleReactivateUser = handleReactivateUser;
    window.handleDeleteUser = handleDeleteUser;

    // Clean up expired codes first (before setting up listener)
    await cleanupExpiredCodes();

    // Set up listener for invitation_codes collection
    const codesQuery = query(
        collection(db, 'invitation_codes'),
        orderBy('created_at', 'desc')
    );

    const codesListener = onSnapshot(codesQuery, (snapshot) => {
        invitationCodes = [];
        snapshot.forEach(d => invitationCodes.push({ id: d.id, ...d.data() }));
        console.log('[UserManagement] Invitation codes loaded:', invitationCodes.length);
        renderInvitationCodesTable();
    });

    listeners.push(codesListener);

    // Set up listener for pending users
    const pendingQuery = query(
        collection(db, 'users'),
        where('status', '==', 'pending'),
        orderBy('created_at', 'desc')
    );

    pendingUsersListener = onSnapshot(pendingQuery, (snapshot) => {
        pendingUsers = [];
        snapshot.forEach(d => pendingUsers.push({ id: d.id, ...d.data() }));
        console.log('[UserManagement] Pending users loaded:', pendingUsers.length);
        renderPendingUsersTable();
    });

    listeners.push(pendingUsersListener);

    // Set up listener for all users (active and deactivated, exclude pending)
    const allUsersQuery = query(
        collection(db, 'users'),
        where('status', 'in', ['active', 'deactivated'])
    );

    allUsersListener = onSnapshot(allUsersQuery, (snapshot) => {
        allUsers = [];
        snapshot.forEach(d => allUsers.push({ id: d.id, ...d.data() }));
        allUsers.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
        console.log('[UserManagement] All users loaded:', allUsers.length);
        renderUsersTable();
    });

    listeners.push(allUsersListener);

    // Close action menus when clicking outside
    document.addEventListener('click', closeAllActionMenus);
}

/* ========================================
   TAB SWITCHING
   ======================================== */

/**
 * Switch between User Management tabs
 * @param {string} tabId - Tab ID to switch to
 */
function switchUserMgmtTab(tabId) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    // Update tab content visibility
    document.getElementById('approvalsTab').style.display = tabId === 'approvals' ? 'block' : 'none';
    document.getElementById('usersTab').style.display = tabId === 'users' ? 'block' : 'none';
    document.getElementById('codesTab').style.display = tabId === 'codes' ? 'block' : 'none';

    // Update URL hash
    window.location.hash = `#/user-management/${tabId}`;
}

/* ========================================
   PENDING USERS TABLE RENDERING
   ======================================== */

/**
 * Render the pending users table
 */
function renderPendingUsersTable() {
    const container = document.getElementById('pendingUsersContainer');
    const badge = document.getElementById('pendingUsersBadge');

    if (!container) return;

    // Update badge
    if (badge) {
        if (pendingUsers.length === 0) {
            badge.textContent = 'No pending users';
            badge.style.background = '#e5e7eb';
            badge.style.color = '#64748b';
        } else {
            badge.textContent = `${pendingUsers.length} pending`;
            badge.style.background = '#fef3c7';
            badge.style.color = '#92400e';
            badge.style.border = '1px solid #fbbf24';
        }
    }

    if (pendingUsers.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 2rem;">
                <div class="empty-state-icon">✅</div>
                <p style="color: #64748b;">No pending registrations</p>
            </div>
        `;
        return;
    }

    const tableRows = pendingUsers.map(user => {
        const createdAt = user.created_at?.toDate ? user.created_at.toDate() : new Date();
        const invitationCode = user.invitation_code || 'Unknown';
        const truncatedCode = invitationCode.length > 8 ? invitationCode.substring(0, 8) + '...' : invitationCode;

        // Format registration date
        const timeDiff = Date.now() - createdAt.getTime();
        const hoursAgo = Math.floor(timeDiff / (1000 * 60 * 60));
        const daysAgo = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

        let registeredDisplay = '';
        if (daysAgo === 0) {
            if (hoursAgo === 0) {
                registeredDisplay = 'Just now';
            } else {
                registeredDisplay = `${hoursAgo}h ago`;
            }
        } else if (daysAgo === 1) {
            registeredDisplay = 'Yesterday';
        } else {
            registeredDisplay = `${daysAgo}d ago`;
        }

        return `
            <tr>
                <td>${user.email || 'Unknown'}</td>
                <td>${user.full_name || 'Unknown'}</td>
                <td>
                    <div style="font-weight: 500; color: #1e293b;">${registeredDisplay}</div>
                    <div style="font-size: 0.8125rem; color: #64748b;">
                        ${createdAt.toLocaleDateString()} ${createdAt.toLocaleTimeString()}
                    </div>
                </td>
                <td>
                    <code style="font-size: 0.8125rem; background: #f1f5f9; padding: 0.25rem 0.5rem; border-radius: 4px;">
                        ${truncatedCode}
                    </code>
                </td>
                <td>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-primary btn-sm" onclick="openApprovalModal('${user.id}')">
                            Approve
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="handleRejectUser('${user.id}')" style="background: white; color: #ef4444; border: 1px solid #ef4444;">
                            Reject
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Email</th>
                    <th>Full Name</th>
                    <th>Registered</th>
                    <th>Invitation Code</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;
}

/* ========================================
   ALL USERS TABLE RENDERING
   ======================================== */

/**
 * Render the all users table with action menus
 */
function renderUsersTable() {
    const container = document.getElementById('usersTableContainer');
    const badge = document.getElementById('allUsersBadge');

    if (!container) return;

    // Update badge
    if (badge) {
        badge.textContent = `${allUsers.length} users`;
        badge.style.background = '#e0f2fe';
        badge.style.color = '#0369a1';
        badge.style.border = '1px solid #0ea5e9';
    }

    // Filter users by search query
    let filteredUsers = allUsers;
    if (userSearchQuery.trim()) {
        const searchLower = userSearchQuery.toLowerCase();
        filteredUsers = allUsers.filter(user =>
            (user.email || '').toLowerCase().includes(searchLower)
        );
    }

    if (filteredUsers.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 2rem;">
                <div class="empty-state-icon">🔍</div>
                <p style="color: #64748b;">
                    ${userSearchQuery.trim() ? 'No users match your search' : 'No users found'}
                </p>
            </div>
        `;
        return;
    }

    // Get current user to prevent actions on self
    const currentUser = window.getCurrentUser?.();
    const currentUserId = currentUser?.uid;

    const tableRows = filteredUsers.map(user => {
        const isCurrentUser = user.id === currentUserId;

        // Role label mapping
        const roleLabels = {
            'super_admin': 'Super Admin',
            'operations_admin': 'Operations Admin',
            'operations_user': 'Operations User',
            'finance': 'Finance',
            'procurement': 'Procurement'
        };
        const roleLabel = roleLabels[user.role] || user.role || 'Unknown';

        // Status badge
        const isActive = user.status === 'active';
        const statusBadge = isActive
            ? '<span class="status-badge approved" style="background: #d1fae5; color: #065f46;">Active</span>'
            : '<span class="status-badge" style="background: #e5e7eb; color: #475569;">Deactivated</span>';

        // Assigned projects display
        let assignedProjectsDisplay = '-';
        if (user.role === 'operations_user') {
            if (user.all_projects === true) {
                assignedProjectsDisplay = 'All projects';
            } else if (Array.isArray(user.assigned_project_codes) && user.assigned_project_codes.length > 0) {
                assignedProjectsDisplay = `${user.assigned_project_codes.length} projects`;
            } else {
                assignedProjectsDisplay = 'No projects';
            }
        }

        // Action menu items
        let actionMenuItems = '';
        if (!isCurrentUser) {
            actionMenuItems = `
                <button class="action-menu-item" onclick="handleEditRole('${user.id}'); event.stopPropagation();">
                    Edit Role
                </button>
                ${user.role === 'operations_user' ? `
                    <a href="#/project-assignments" class="action-menu-item" style="display: block; color: inherit; text-decoration: none;">
                        Assign Projects
                    </a>
                ` : ''}
                ${isActive ? `
                    <button class="action-menu-item action-menu-danger" onclick="handleDeactivateUser('${user.id}'); event.stopPropagation();">
                        Deactivate
                    </button>
                ` : `
                    <button class="action-menu-item" onclick="handleReactivateUser('${user.id}'); event.stopPropagation();">
                        Reactivate
                    </button>
                    <button class="action-menu-item action-menu-danger" onclick="handleDeleteUser('${user.id}'); event.stopPropagation();">
                        Delete
                    </button>
                `}
            `;
        }

        // Row styling for current user
        const rowStyle = isCurrentUser ? 'background: #fef3c7;' : '';

        return `
            <tr style="${rowStyle}">
                <td>
                    ${user.email || 'Unknown'}
                    ${isCurrentUser ? '<span style="color: #92400e; font-size: 0.75rem; margin-left: 0.5rem;">(You)</span>' : ''}
                </td>
                <td>${user.full_name || '-'}</td>
                <td>${roleLabel}</td>
                <td>${statusBadge}</td>
                <td>${assignedProjectsDisplay}</td>
                <td style="position: relative;">
                    ${!isCurrentUser ? `
                        <button class="action-menu-btn" onclick="toggleUserActionMenu('${user.id}'); event.stopPropagation();" title="Actions">
                            ⋮
                        </button>
                        <div id="actionMenu-${user.id}" class="action-menu" style="display: none;">
                            ${actionMenuItems}
                        </div>
                    ` : '<span style="color: #94a3b8; font-size: 0.875rem;">-</span>'}
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Email</th>
                    <th>Full Name</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Assigned Projects</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;
}

/**
 * Handle user search input
 * @param {Event} event - Input event from search field
 */
function handleUserSearch(event) {
    userSearchQuery = event.target.value;
    renderUsersTable();
}

/**
 * Toggle visibility of action menu for a specific user
 * @param {string} userId - User ID to toggle menu for
 */
function toggleUserActionMenu(userId) {
    // Close all other menus
    document.querySelectorAll('.action-menu').forEach(menu => {
        if (menu.id !== `actionMenu-${userId}`) {
            menu.style.display = 'none';
        }
    });

    // Toggle this menu
    const menu = document.getElementById(`actionMenu-${userId}`);
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

/**
 * Close all action menus when clicking outside
 */
function closeAllActionMenus(event) {
    // Check if click is on action menu button or inside menu
    if (!event.target.closest('.action-menu-btn') && !event.target.closest('.action-menu')) {
        document.querySelectorAll('.action-menu').forEach(menu => {
            menu.style.display = 'none';
        });
    }
}

/* ========================================
   USER APPROVAL WORKFLOW
   ======================================== */

/**
 * Open approval modal with role selection
 * @param {string} userId - User ID to approve
 */
function openApprovalModal(userId) {
    // Store userId for later use
    selectedUserForApproval = userId;

    // Find user data
    const user = pendingUsers.find(u => u.id === userId);
    if (!user) {
        showToast('User not found', 'error');
        return;
    }

    // Format registration date
    const createdAt = user.created_at?.toDate ? user.created_at.toDate() : new Date();
    const registeredDate = createdAt.toLocaleDateString() + ' ' + createdAt.toLocaleTimeString();

    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'approvalModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    // Create modal dialog
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 2rem;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    `;

    dialog.innerHTML = `
        <h3 style="margin: 0 0 1.5rem 0; font-size: 1.25rem; color: #1e293b;">
            Approve User
        </h3>

        <!-- User Info -->
        <div style="background: #f8fafc; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
            <div style="margin-bottom: 0.5rem;">
                <strong style="color: #475569;">Email:</strong>
                <span style="color: #1e293b;">${user.email}</span>
            </div>
            <div style="margin-bottom: 0.5rem;">
                <strong style="color: #475569;">Full Name:</strong>
                <span style="color: #1e293b;">${user.full_name || 'Unknown'}</span>
            </div>
            <div>
                <strong style="color: #475569;">Registered:</strong>
                <span style="color: #1e293b;">${registeredDate}</span>
            </div>
        </div>

        <!-- Role Selection -->
        <div style="margin-bottom: 1.5rem;">
            <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: #1e293b;">
                Select Role <span style="color: #ef4444;">*</span>
            </label>
            <select id="approvalRoleSelect" class="form-input" style="width: 100%; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.9375rem;">
                <option value="operations_user">Operations User</option>
                <option value="super_admin">Super Admin</option>
                <option value="operations_admin">Operations Admin</option>
                <option value="finance">Finance</option>
                <option value="procurement">Procurement</option>
            </select>
        </div>

        <!-- Warning -->
        <div style="background: #fef3c7; border: 1px solid #fbbf24; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.5rem;">
            <p style="margin: 0; color: #92400e; font-size: 0.875rem;">
                ⚠️ Approved users will have immediate access to the system with the assigned role.
            </p>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
            <button id="cancelApproval" class="btn btn-secondary" style="min-width: 100px;">
                Cancel
            </button>
            <button id="confirmApprovalBtn" class="btn btn-primary" style="min-width: 100px;">
                Approve
            </button>
        </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    // Handle cancel
    document.getElementById('cancelApproval').addEventListener('click', closeApprovalModal);

    // Handle confirm
    document.getElementById('confirmApprovalBtn').addEventListener('click', confirmApproval);

    // Handle click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeApprovalModal();
        }
    });
}

/**
 * Close approval modal
 */
function closeApprovalModal() {
    const modal = document.getElementById('approvalModal');
    if (modal) {
        document.body.removeChild(modal);
    }
    selectedUserForApproval = null;
}

/**
 * Confirm user approval with selected role
 */
async function confirmApproval() {
    try {
        if (!selectedUserForApproval) {
            showToast('No user selected', 'error');
            return;
        }

        // Get selected role
        const roleSelect = document.getElementById('approvalRoleSelect');
        const selectedRole = roleSelect?.value;

        if (!selectedRole) {
            showToast('Please select a role', 'error');
            return;
        }

        // Get current user for audit trail
        const currentUser = window.getCurrentUser?.();
        if (!currentUser) {
            showToast('Authentication required', 'error');
            return;
        }

        // Update user document
        await updateDoc(doc(db, 'users', selectedUserForApproval), {
            status: 'active',
            role: selectedRole,
            approved_at: serverTimestamp(),
            approved_by: currentUser.uid,
            updated_at: serverTimestamp()
        });

        // Close modal
        closeApprovalModal();

        // Show success message
        showToast('User approved successfully', 'success');

        console.log('[UserManagement] User approved:', selectedUserForApproval, 'Role:', selectedRole);
    } catch (error) {
        console.error('[UserManagement] Error approving user:', error);
        showToast('Failed to approve user', 'error');
    }
}

/**
 * Handle user rejection with confirmation
 * @param {string} userId - User ID to reject
 */
async function handleRejectUser(userId) {
    // Find user data
    const user = pendingUsers.find(u => u.id === userId);
    if (!user) {
        showToast('User not found', 'error');
        return;
    }

    // Show confirmation modal
    const confirmed = await showRejectConfirmation(user);
    if (!confirmed) {
        console.log('[UserManagement] Rejection cancelled');
        return;
    }

    try {
        // Delete user document from Firestore
        await deleteDoc(doc(db, 'users', userId));
        showToast('User rejected and deleted', 'success');
        console.log('[UserManagement] User rejected and deleted:', userId);
    } catch (error) {
        console.error('[UserManagement] Error rejecting user:', error);
        showToast('Failed to reject user', 'error');
    }
}

/**
 * Show rejection confirmation modal
 * @param {Object} user - User to reject
 * @returns {Promise<boolean>} True if confirmed, false if cancelled
 */
function showRejectConfirmation(user) {
    return new Promise((resolve) => {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.id = 'rejectModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        // Create modal dialog
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 2rem;
            max-width: 450px;
            width: 90%;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        `;

        dialog.innerHTML = `
            <h3 style="margin: 0 0 1rem 0; font-size: 1.25rem; color: #dc2626;">
                Reject User
            </h3>

            <p style="margin: 0 0 1rem 0; color: #475569; font-size: 0.9375rem;">
                Are you sure you want to reject <strong>${user.email}</strong>?
            </p>

            <p style="margin: 0 0 1rem 0; color: #475569; font-size: 0.9375rem;">
                This will <strong>permanently delete</strong> their registration.
            </p>

            <!-- Warning Box -->
            <div style="background: #fee2e2; border: 1px solid #ef4444; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.5rem;">
                <p style="margin: 0; color: #991b1b; font-size: 0.875rem; font-weight: 500;">
                    ⚠️ This action cannot be undone.
                </p>
            </div>

            <!-- Action Buttons -->
            <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
                <button id="cancelReject" class="btn btn-secondary" style="min-width: 90px;">
                    Cancel
                </button>
                <button id="confirmReject" class="btn btn-danger" style="min-width: 90px;">
                    Reject
                </button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        // Handle cancel
        document.getElementById('cancelReject').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(false);
        });

        // Handle confirm
        document.getElementById('confirmReject').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(true);
        });

        // Handle click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                resolve(false);
            }
        });
    });
}

/* ========================================
   USER DEACTIVATION & REACTIVATION
   ======================================== */

/**
 * Handle user deactivation with Super Admin protection
 * @param {string} userId - User ID to deactivate
 */
async function handleDeactivateUser(userId) {
    try {
        // Find user data
        const user = allUsers.find(u => u.id === userId);
        if (!user) {
            showToast('User not found', 'error');
            return;
        }

        // Check if user is super_admin
        if (user.role === 'super_admin') {
            // Count active Super Admins
            const activeSuperAdminCount = countActiveSuperAdmins();

            if (activeSuperAdminCount <= 1) {
                // Show error modal - cannot deactivate last Super Admin
                showErrorModal(
                    'Cannot Deactivate Last Super Admin',
                    'Cannot deactivate the last Super Admin account. Promote another user to Super Admin first.'
                );
                return;
            }
        }

        // Show deactivation confirmation modal
        await showDeactivationModal(user);
    } catch (error) {
        console.error('[UserManagement] Error in deactivation flow:', error);
        showToast('Error initiating deactivation', 'error');
    }
}

/**
 * Count active Super Admins
 * @returns {number} Count of active Super Admins
 */
function countActiveSuperAdmins() {
    return allUsers.filter(u => u.role === 'super_admin' && u.status === 'active').length;
}

/**
 * Show deactivation modal with email confirmation
 * @param {Object} user - User object to deactivate
 */
function showDeactivationModal(user) {
    return new Promise((resolve) => {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.id = 'deactivationModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        // Create modal dialog
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 2rem;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        `;

        dialog.innerHTML = `
            <h3 style="margin: 0 0 1rem 0; font-size: 1.25rem; color: #dc2626;">
                ⚠️ Deactivate User Account
            </h3>

            <p style="margin: 0 0 1rem 0; color: #475569; font-size: 0.9375rem;">
                You are about to deactivate <strong>${user.email}</strong>
            </p>

            <div style="background: #fee2e2; border: 1px solid #ef4444; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.5rem;">
                <p style="margin: 0; color: #991b1b; font-size: 0.875rem; font-weight: 500;">
                    This will immediately log them out and prevent future access.
                </p>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: #1e293b;">
                    Type the user's email to confirm:
                </label>
                <input type="text"
                       id="deactivationEmailInput"
                       class="form-input"
                       placeholder="${user.email}"
                       style="width: 100%; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.9375rem;">
            </div>

            <!-- Action Buttons -->
            <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
                <button id="cancelDeactivation" class="btn btn-secondary" style="min-width: 100px;">
                    Cancel
                </button>
                <button id="confirmDeactivationBtn" class="btn btn-danger" style="min-width: 100px;" disabled>
                    Deactivate
                </button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        // Get references
        const emailInput = document.getElementById('deactivationEmailInput');
        const confirmBtn = document.getElementById('confirmDeactivationBtn');

        // Enable button only when email matches exactly
        emailInput.addEventListener('input', () => {
            confirmBtn.disabled = emailInput.value !== user.email;
        });

        // Handle cancel
        document.getElementById('cancelDeactivation').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(false);
        });

        // Handle confirm
        confirmBtn.addEventListener('click', async () => {
            if (emailInput.value !== user.email) {
                showToast('Email does not match', 'error');
                return;
            }

            try {
                // Get current user for audit trail
                const currentUser = window.getCurrentUser?.();

                // Update user document
                await updateDoc(doc(db, 'users', user.id), {
                    status: 'deactivated',
                    deactivated_at: serverTimestamp(),
                    deactivated_by: currentUser?.uid || 'unknown'
                });

                // Close modal
                document.body.removeChild(modal);

                // Show success message
                showToast('User deactivated', 'success');

                console.log('[UserManagement] User deactivated:', user.id);
                resolve(true);
            } catch (error) {
                console.error('[UserManagement] Error deactivating user:', error);
                showToast('Failed to deactivate user', 'error');
                resolve(false);
            }
        });

        // Handle click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                resolve(false);
            }
        });
    });
}

/**
 * Handle user reactivation
 * @param {string} userId - User ID to reactivate
 */
async function handleReactivateUser(userId) {
    try {
        // Find user data
        const user = allUsers.find(u => u.id === userId);
        if (!user) {
            showToast('User not found', 'error');
            return;
        }

        // Show confirmation
        const confirmed = await showSimpleConfirmation(
            'Reactivate User',
            `Reactivate <strong>${user.email}</strong>? They will regain access to the system.`
        );

        if (!confirmed) {
            console.log('[UserManagement] Reactivation cancelled');
            return;
        }

        // Get current user for audit trail
        const currentUser = window.getCurrentUser?.();

        // Update user document
        await updateDoc(doc(db, 'users', userId), {
            status: 'active',
            reactivated_at: serverTimestamp(),
            reactivated_by: currentUser?.uid || 'unknown'
        });

        showToast('User reactivated', 'success');
        console.log('[UserManagement] User reactivated:', userId);
    } catch (error) {
        console.error('[UserManagement] Error reactivating user:', error);
        showToast('Failed to reactivate user', 'error');
    }
}

/**
 * Show simple confirmation modal
 * @param {string} title - Modal title
 * @param {string} message - Modal message (HTML allowed)
 * @returns {Promise<boolean>} True if confirmed
 */
function showSimpleConfirmation(title, message) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.id = 'confirmModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 2rem;
            max-width: 450px;
            width: 90%;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        `;

        dialog.innerHTML = `
            <h3 style="margin: 0 0 1rem 0; font-size: 1.25rem; color: #1e293b;">
                ${title}
            </h3>
            <p style="margin: 0 0 1.5rem 0; color: #475569; font-size: 0.9375rem;">
                ${message}
            </p>
            <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
                <button id="cancelBtn" class="btn btn-secondary" style="min-width: 90px;">
                    Cancel
                </button>
                <button id="confirmBtn" class="btn btn-primary" style="min-width: 90px;">
                    Confirm
                </button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        document.getElementById('cancelBtn').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(false);
        });

        document.getElementById('confirmBtn').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(true);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                resolve(false);
            }
        });
    });
}

/**
 * Show error modal
 * @param {string} title - Modal title
 * @param {string} message - Error message
 */
function showErrorModal(title, message) {
    const modal = document.createElement('div');
    modal.id = 'errorModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 2rem;
        max-width: 450px;
        width: 90%;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    `;

    dialog.innerHTML = `
        <h3 style="margin: 0 0 1rem 0; font-size: 1.25rem; color: #dc2626;">
            ${title}
        </h3>
        <div style="background: #fee2e2; border: 1px solid #ef4444; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.5rem;">
            <p style="margin: 0; color: #991b1b; font-size: 0.875rem;">
                ${message}
            </p>
        </div>
        <div style="display: flex; justify-content: flex-end;">
            <button id="closeErrorBtn" class="btn btn-primary" style="min-width: 90px;">
                OK
            </button>
        </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    const closeBtn = document.getElementById('closeErrorBtn');
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

/* ========================================
   USER DELETION & ROLE EDITING
   ======================================== */

/**
 * Handle user deletion (only for deactivated users)
 * @param {string} userId - User ID to delete
 */
async function handleDeleteUser(userId) {
    try {
        // Find user data
        const user = allUsers.find(u => u.id === userId);
        if (!user) {
            showToast('User not found', 'error');
            return;
        }

        // Verify user is deactivated (defense in depth)
        if (user.status !== 'deactivated') {
            showErrorModal(
                'Cannot Delete Active User',
                'Users must be deactivated before deletion.'
            );
            return;
        }

        // Show confirmation modal
        const confirmed = await showDeleteConfirmation(user);
        if (!confirmed) {
            console.log('[UserManagement] Deletion cancelled');
            return;
        }

        // Delete user document from Firestore
        await deleteDoc(doc(db, 'users', userId));
        showToast('User deleted', 'success');
        console.log('[UserManagement] User permanently deleted:', userId);
    } catch (error) {
        console.error('[UserManagement] Error deleting user:', error);
        showToast('Failed to delete user', 'error');
    }
}

/**
 * Show delete confirmation modal
 * @param {Object} user - User to delete
 * @returns {Promise<boolean>} True if confirmed
 */
function showDeleteConfirmation(user) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.id = 'deleteModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 2rem;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        `;

        dialog.innerHTML = `
            <h3 style="margin: 0 0 1rem 0; font-size: 1.25rem; color: #dc2626;">
                Permanently Delete User
            </h3>

            <p style="margin: 0 0 0.75rem 0; color: #475569; font-size: 0.9375rem;">
                This will permanently delete <strong>${user.email}</strong> and cannot be undone.
            </p>

            <p style="margin: 0 0 1rem 0; color: #475569; font-size: 0.9375rem;">
                User's created data (MRFs, PRs, POs) will be preserved with original creator info.
            </p>

            <div style="background: #fee2e2; border: 1px solid #ef4444; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.5rem;">
                <p style="margin: 0; color: #991b1b; font-size: 0.875rem; font-weight: 500;">
                    ⚠️ This action cannot be undone.
                </p>
            </div>

            <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
                <button id="cancelDelete" class="btn btn-secondary" style="min-width: 100px;">
                    Cancel
                </button>
                <button id="confirmDelete" class="btn btn-danger" style="min-width: 100px;">
                    Delete
                </button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        document.getElementById('cancelDelete').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(false);
        });

        document.getElementById('confirmDelete').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(true);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                resolve(false);
            }
        });
    });
}

/**
 * Handle role editing for a user
 * @param {string} userId - User ID to edit role
 */
async function handleEditRole(userId) {
    try {
        // Find user data
        const user = allUsers.find(u => u.id === userId);
        if (!user) {
            showToast('User not found', 'error');
            return;
        }

        // Show role edit modal
        const newRole = await showRoleEditModal(user);
        if (!newRole) {
            console.log('[UserManagement] Role edit cancelled');
            return;
        }

        // If changing away from super_admin, check if last Super Admin
        if (user.role === 'super_admin' && newRole !== 'super_admin') {
            const activeSuperAdminCount = countActiveSuperAdmins();
            if (activeSuperAdminCount <= 1) {
                showErrorModal(
                    'Cannot Change Role',
                    'Cannot change role. This is the last Super Admin account.'
                );
                return;
            }
        }

        // Get current user for audit trail
        const currentUser = window.getCurrentUser?.();

        // Update user document
        await updateDoc(doc(db, 'users', userId), {
            role: newRole,
            role_changed_at: serverTimestamp(),
            role_changed_by: currentUser?.uid || 'unknown'
        });

        showToast('Role updated', 'success');
        console.log('[UserManagement] Role updated:', userId, 'New role:', newRole);
    } catch (error) {
        console.error('[UserManagement] Error updating role:', error);
        showToast('Failed to update role', 'error');
    }
}

/**
 * Show role edit modal
 * @param {Object} user - User to edit
 * @returns {Promise<string|null>} New role or null if cancelled
 */
function showRoleEditModal(user) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.id = 'roleEditModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 2rem;
            max-width: 450px;
            width: 90%;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        `;

        // Role label mapping
        const roleLabels = {
            'super_admin': 'Super Admin',
            'operations_admin': 'Operations Admin',
            'operations_user': 'Operations User',
            'finance': 'Finance',
            'procurement': 'Procurement'
        };

        const currentRoleLabel = roleLabels[user.role] || user.role || 'Unknown';

        dialog.innerHTML = `
            <h3 style="margin: 0 0 1rem 0; font-size: 1.25rem; color: #1e293b;">
                Change Role
            </h3>

            <div style="background: #f8fafc; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
                <div style="margin-bottom: 0.5rem;">
                    <strong style="color: #475569;">User:</strong>
                    <span style="color: #1e293b;">${user.email}</span>
                </div>
                <div>
                    <strong style="color: #475569;">Current:</strong>
                    <span style="color: #1e293b;">${currentRoleLabel}</span>
                </div>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: #1e293b;">
                    Select New Role
                </label>
                <select id="roleEditSelect" class="form-input" style="width: 100%; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.9375rem;">
                    <option value="operations_user" ${user.role === 'operations_user' ? 'selected' : ''}>Operations User</option>
                    <option value="super_admin" ${user.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
                    <option value="operations_admin" ${user.role === 'operations_admin' ? 'selected' : ''}>Operations Admin</option>
                    <option value="finance" ${user.role === 'finance' ? 'selected' : ''}>Finance</option>
                    <option value="procurement" ${user.role === 'procurement' ? 'selected' : ''}>Procurement</option>
                </select>
            </div>

            <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
                <button id="cancelRoleEdit" class="btn btn-secondary" style="min-width: 100px;">
                    Cancel
                </button>
                <button id="confirmRoleEdit" class="btn btn-primary" style="min-width: 100px;">
                    Save Changes
                </button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        const roleSelect = document.getElementById('roleEditSelect');

        document.getElementById('cancelRoleEdit').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(null);
        });

        document.getElementById('confirmRoleEdit').addEventListener('click', () => {
            const newRole = roleSelect.value;
            document.body.removeChild(modal);
            resolve(newRole);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                resolve(null);
            }
        });
    });
}

/* ========================================
   INVITATION CODE GENERATION
   ======================================== */

/**
 * Generate a new invitation code and save to Firestore
 */
async function generateInvitationCode() {
    try {
        const user = window.getCurrentUser?.();
        if (!user) {
            showToast('Authentication required', 'error');
            return;
        }

        // Generate UUID using browser native API
        const code = crypto.randomUUID();

        // Calculate expiration time (3 hours from now)
        const expiresAt = Timestamp.fromMillis(Date.now() + 3 * 60 * 60 * 1000);

        // Save to Firestore
        await addDoc(collection(db, 'invitation_codes'), {
            code: code,
            status: 'active',
            created_at: serverTimestamp(),
            expires_at: expiresAt,
            created_by: user.uid
        });

        // Copy to clipboard automatically
        await navigator.clipboard.writeText(code);
        showToast('Code generated and copied to clipboard', 'success');
    } catch (error) {
        console.error('[UserManagement] Error generating invitation code:', error);
        showToast('Failed to generate invitation code', 'error');
    }
}

/**
 * Copy invitation code to clipboard
 * @param {string} code - The invitation code to copy
 */
async function copyCodeToClipboard(code) {
    try {
        await navigator.clipboard.writeText(code);
        showToast('Code copied to clipboard', 'success');
    } catch (error) {
        console.error('[UserManagement] Error copying to clipboard:', error);
        showToast('Failed to copy code', 'error');
    }
}

/* ========================================
   INVITATION CODES TABLE RENDERING
   ======================================== */

/**
 * Render the invitation codes table
 */
function renderInvitationCodesTable() {
    const container = document.getElementById('invitationCodesTableContainer');
    if (!container) return;

    if (invitationCodes.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 2rem;">
                <div class="empty-state-icon">📋</div>
                <p style="color: #64748b;">No invitation codes yet. Generate one to get started.</p>
            </div>
        `;
        return;
    }

    const tableRows = invitationCodes.map(code => {
        const createdAt = code.created_at?.toDate ? code.created_at.toDate() : new Date();
        const expiresAt = code.expires_at?.toMillis ? code.expires_at.toMillis() : 0;
        const isExpired = code.status === 'active' && expiresAt < Date.now();
        const isUsed = code.status === 'used';

        // Determine status badge
        let statusBadge = '';
        if (isUsed) {
            statusBadge = '<span class="status-badge used">Used</span>';
        } else if (isExpired) {
            statusBadge = '<span class="status-badge expired">Expired</span>';
        } else {
            statusBadge = '<span class="status-badge unused">Unused</span>';
        }

        // Determine expiration/usage info
        let expiryInfo = '';
        if (isUsed) {
            const usedAt = code.used_at?.toDate ? code.used_at.toDate() : new Date();
            const usedByEmail = code.used_by_email || 'Unknown';
            expiryInfo = `
                <div style="font-size: 0.8125rem; color: #64748b;">
                    Used by: ${usedByEmail}<br>
                    ${usedAt.toLocaleDateString()} ${usedAt.toLocaleTimeString()}
                </div>
            `;
        } else if (isExpired) {
            expiryInfo = '<span style="color: #ef4444; font-size: 0.875rem;">Expired</span>';
        } else {
            const expiresDate = new Date(expiresAt);
            const timeRemaining = Math.ceil((expiresAt - Date.now()) / (60 * 1000)); // minutes
            expiryInfo = `
                <div style="font-size: 0.8125rem; color: #64748b;">
                    Expires in ${timeRemaining} min<br>
                    ${expiresDate.toLocaleTimeString()}
                </div>
            `;
        }

        // Copy button (only for unused, non-expired codes)
        const copyButton = !isUsed && !isExpired
            ? `<button class="btn btn-sm" onclick="copyCodeToClipboard('${code.code}')" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;">
                   Copy
               </button>`
            : '';

        // Row class for expired codes
        const rowClass = isExpired ? 'expired-code' : '';

        return `
            <tr class="${rowClass}">
                <td>
                    <code class="code-display" data-full-code="${code.code}">
                        ${code.code.substring(0, 8)}...
                    </code>
                </td>
                <td>${statusBadge}</td>
                <td style="font-size: 0.8125rem; color: #64748b;">
                    ${createdAt.toLocaleDateString()}<br>
                    ${createdAt.toLocaleTimeString()}
                </td>
                <td>${expiryInfo}</td>
                <td>${copyButton}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Code</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Expires / Used By</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;
}

/* ========================================
   CLEANUP EXPIRED CODES
   ======================================== */

/**
 * Clean up expired invitation codes from database
 * Runs silently on init (no toast notifications)
 */
async function cleanupExpiredCodes() {
    try {
        const now = Timestamp.now();
        const q = query(
            collection(db, 'invitation_codes'),
            where('status', '==', 'active')
        );

        const snapshot = await getDocs(q);
        const expiredCodes = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            const expiresAt = data.expires_at?.toMillis ? data.expires_at.toMillis() : 0;
            if (expiresAt < Date.now()) {
                expiredCodes.push(doc.ref);
            }
        });

        // Delete expired codes
        for (const codeRef of expiredCodes) {
            await deleteDoc(codeRef);
        }

        if (expiredCodes.length > 0) {
            console.log(`[UserManagement] Cleaned up ${expiredCodes.length} expired invitation codes`);
        }
    } catch (error) {
        console.error('[UserManagement] Error cleaning up expired codes:', error);
    }
}

/* ========================================
   CLEANUP
   ======================================== */

/**
 * Cleanup function: unsubscribe listeners and remove window functions
 */
export async function destroy() {
    console.log('[UserManagement] Cleaning up...');

    // Remove document event listener
    document.removeEventListener('click', closeAllActionMenus);

    // Unsubscribe all listeners
    listeners.forEach(unsubscribe => unsubscribe?.());
    listeners = [];

    // Clear module state
    invitationCodes = [];
    pendingUsers = [];
    pendingUsersListener = null;
    selectedUserForApproval = null;
    allUsers = [];
    allUsersListener = null;
    userSearchQuery = '';

    // Remove window functions
    delete window.switchUserMgmtTab;
    delete window.generateInvitationCode;
    delete window.copyCodeToClipboard;
    delete window.openApprovalModal;
    delete window.handleRejectUser;
    delete window.confirmApproval;
    delete window.closeApprovalModal;
    delete window.handleUserSearch;
    delete window.toggleUserActionMenu;
    delete window.handleEditRole;
    delete window.handleDeactivateUser;
    delete window.handleReactivateUser;
    delete window.handleDeleteUser;
}

console.log('[UserManagement] Module loaded');
