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
                    <div class="empty-state" style="padding: 3rem;">
                        <div class="empty-state-icon">👥</div>
                        <h3>All Users</h3>
                        <p style="color: #64748b;">View and manage all system users.</p>
                        <p style="color: #94a3b8; font-size: 0.875rem;">(Coming in next plan)</p>
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
 * Handle user rejection (placeholder for Task 3)
 * @param {string} userId - User ID to reject
 */
async function handleRejectUser(userId) {
    // Implementation in Task 3
    showToast('Rejection functionality coming soon', 'info');
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

    // Unsubscribe all listeners
    listeners.forEach(unsubscribe => unsubscribe?.());
    listeners = [];

    // Clear module state
    invitationCodes = [];
    pendingUsers = [];
    pendingUsersListener = null;
    selectedUserForApproval = null;

    // Remove window functions
    delete window.switchUserMgmtTab;
    delete window.generateInvitationCode;
    delete window.copyCodeToClipboard;
    delete window.openApprovalModal;
    delete window.handleRejectUser;
    delete window.confirmApproval;
    delete window.closeApprovalModal;
}

console.log('[UserManagement] Module loaded');
