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
                    <div class="empty-state" style="padding: 3rem;">
                        <div class="empty-state-icon">⏳</div>
                        <h3>Pending Approvals</h3>
                        <p style="color: #64748b;">Review and approve new user registrations.</p>
                        <p style="color: #94a3b8; font-size: 0.875rem;">(Coming in next plan)</p>
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

    // Clean up expired codes first (before setting up listener)
    await cleanupExpiredCodes();

    // Set up listener for invitation_codes collection
    const codesQuery = query(
        collection(db, 'invitation_codes'),
        orderBy('created_at', 'desc')
    );

    const listener = onSnapshot(codesQuery, (snapshot) => {
        invitationCodes = [];
        snapshot.forEach(d => invitationCodes.push({ id: d.id, ...d.data() }));
        console.log('[UserManagement] Invitation codes loaded:', invitationCodes.length);
        renderInvitationCodesTable();
    });

    listeners.push(listener);
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

    // Remove window functions
    delete window.switchUserMgmtTab;
    delete window.generateInvitationCode;
    delete window.copyCodeToClipboard;
}

console.log('[UserManagement] Module loaded');
