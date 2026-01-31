/* ========================================
   PENDING USER VIEW
   Approval waiting page for pending users
   ======================================== */

import { db, auth } from '../firebase.js';
import { doc, getDoc } from '../firebase.js';
import { signOut } from '../firebase.js';
import { getCurrentUser } from '../auth.js';

/**
 * Render pending approval page
 * @returns {string} HTML content
 */
export function render() {
    return `
        <div class="auth-container">
            <div class="auth-card">
                <div class="auth-logo">
                    <img src="https://raw.githubusercontent.com/pengr3/pr-po/main/CLMC%20Registered%20Logo.png"
                         alt="CLMC Logo"
                         onerror="this.style.display='none'">
                </div>

                <div class="auth-header">
                    <h1>Account Pending Approval</h1>
                    <p>Your account is being reviewed by an administrator.</p>
                </div>

                <div id="userInfo" class="pending-user-info">
                    <!-- User info will be populated here -->
                </div>

                <div class="pending-timeline">
                    <div class="timeline-icon">⏱️</div>
                    <p>Approvals typically take 24-48 hours.</p>
                </div>

                <div id="statusMessage" class="status-message">
                    <!-- Status messages will appear here -->
                </div>

                <div class="auth-actions" style="gap: 0.75rem;">
                    <button id="checkStatusBtn" class="btn btn-secondary" onclick="checkStatus()">
                        Check Status
                    </button>
                    <button id="logoutBtn" class="btn btn-outline-danger" onclick="handleLogoutFromPending()">
                        Log Out
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Initialize pending view
 */
export async function init() {
    console.log('[Pending] Initializing pending view');

    // Get current user
    const user = getCurrentUser();

    if (user) {
        // Display user info
        const userInfoDiv = document.getElementById('userInfo');
        if (userInfoDiv) {
            userInfoDiv.innerHTML = `
                <div style="text-align: center;">
                    <div style="font-weight: 600; color: var(--gray-900); margin-bottom: 0.25rem;">
                        ${user.full_name || 'User'}
                    </div>
                    <div style="font-size: 0.875rem; color: var(--gray-700);">
                        ${user.email}
                    </div>
                </div>
            `;
        }
    }

    // Set up handlers
    window.checkStatus = checkStatus;
    window.handleLogoutFromPending = handleLogoutFromPending;
}

/**
 * Check current approval status
 */
async function checkStatus() {
    console.log('[Pending] Checking approval status');

    const statusDiv = document.getElementById('statusMessage');
    const checkBtn = document.getElementById('checkStatusBtn');

    // Show loading
    if (checkBtn) {
        checkBtn.disabled = true;
        checkBtn.innerHTML = '<span class="spinner-small"></span> Checking...';
    }

    try {
        const user = getCurrentUser();

        if (!user || !user.uid) {
            showStatusMessage('error', 'Unable to check status. Please try logging in again.');
            return;
        }

        // Re-fetch user document from Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));

        if (!userDoc.exists()) {
            showStatusMessage('error', 'User account not found. Please contact an administrator.');
            return;
        }

        const userData = userDoc.data();
        const status = userData.status;

        console.log('[Pending] Current status:', status);

        // Handle different statuses
        if (status === 'active') {
            showStatusMessage('success', 'Your account has been approved! Redirecting to dashboard...');

            // Redirect after 2 seconds
            setTimeout(() => {
                window.location.hash = '#/';
            }, 2000);
        } else if (status === 'rejected') {
            showStatusMessage('error', 'Your registration was not approved. Please contact an administrator for more information.');

            // Hide check status button, keep only logout
            if (checkBtn) {
                checkBtn.style.display = 'none';
            }
        } else if (status === 'pending') {
            showStatusMessage('info', 'Your account is still pending approval. Please check back later.');
        } else if (status === 'deactivated') {
            showStatusMessage('error', 'Your account has been deactivated. Please contact an administrator.');

            // Log user out
            setTimeout(async () => {
                await handleLogoutFromPending();
            }, 2000);
        } else {
            showStatusMessage('info', `Current status: ${status}`);
        }
    } catch (error) {
        console.error('[Pending] Error checking status:', error);
        showStatusMessage('error', 'Error checking status. Please try again.');
    } finally {
        // Restore button
        if (checkBtn) {
            checkBtn.disabled = false;
            checkBtn.innerHTML = 'Check Status';
        }
    }
}

/**
 * Show status message
 * @param {string} type - Message type (success, error, info)
 * @param {string} message - Message text
 */
function showStatusMessage(type, message) {
    const statusDiv = document.getElementById('statusMessage');

    if (!statusDiv) return;

    let className = 'status-message-box';
    let icon = '';

    if (type === 'success') {
        className += ' status-success';
        icon = '✓';
    } else if (type === 'error') {
        className += ' status-error';
        icon = '✗';
    } else {
        className += ' status-info';
        icon = 'ℹ';
    }

    statusDiv.innerHTML = `
        <div class="${className}">
            <span class="status-icon">${icon}</span>
            <span>${message}</span>
        </div>
    `;
}

/**
 * Handle logout from pending page
 */
async function handleLogoutFromPending() {
    console.log('[Pending] Logging out');

    try {
        await signOut(auth);
        console.log('[Pending] User signed out successfully');
        window.location.hash = '#/login';
    } catch (error) {
        console.error('[Pending] Error signing out:', error);
        alert('Error logging out. Please try again.');
    }
}

/**
 * Cleanup function
 */
export async function destroy() {
    console.log('[Pending] Cleaning up pending view');

    // Clean up window handlers
    delete window.checkStatus;
    delete window.handleLogoutFromPending;
}
