/* ========================================
   AUTHENTICATION UTILITIES
   User authentication, invitation codes, and user document management
   ======================================== */

import { db, auth } from './firebase.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    query,
    where,
    serverTimestamp,
    onAuthStateChanged,
    onSnapshot
} from './firebase.js';
import { signOut } from './firebase.js';
import { initPermissionsObserver, destroyPermissionsObserver } from './permissions.js';

// ========================================
// PERMISSION CHANGE LISTENER (MODULE LEVEL)
// Updates navigation when permissions change (PERM-18)
// ========================================
window.addEventListener('permissionsChanged', (event) => {
    console.log('[Auth] Permissions changed, updating navigation');
    const user = getCurrentUser();
    if (user) {
        updateNavForAuth(user);
    }
});

/* ========================================
   FIRESTORE SCHEMA DOCUMENTATION
   ======================================== */

// users collection:
// - email: string
// - full_name: string
// - status: 'pending' | 'active' | 'rejected' | 'deactivated'
// - role: null | 'super_admin' | 'operations_admin' | 'operations_user' | 'finance' | 'procurement'
// - invitation_code: string
// - created_at: Timestamp
// - updated_at: Timestamp

// invitation_codes collection:
// - code: string (unique)
// - status: 'active' | 'used'
// - created_at: Timestamp
// - created_by: string (admin userId)
// - used_at: Timestamp | null
// - used_by: string | null (userId who used it)

/* ========================================
   INVITATION CODE VALIDATION
   ======================================== */

/**
 * Validate invitation code
 * @param {string} code - Invitation code to validate
 * @returns {Promise<{valid: boolean, docId?: string, error?: string}>}
 */
export async function validateInvitationCode(code) {
    try {
        const q = query(
            collection(db, 'invitation_codes'),
            where('code', '==', code),
            where('status', '==', 'active')
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            return {
                valid: false,
                error: 'Invalid or already used invitation code'
            };
        }

        const invitationDoc = snapshot.docs[0];
        return {
            valid: true,
            docId: invitationDoc.id
        };
    } catch (error) {
        console.error('[Auth] Error validating invitation code:', error);
        return {
            valid: false,
            error: 'Error validating invitation code'
        };
    }
}

/**
 * Mark invitation code as used
 * @param {string} docId - Invitation code document ID
 * @param {string} userEmail - Email of user who used the code
 * @returns {Promise<void>}
 */
export async function markInvitationCodeUsed(docId, userEmail) {
    try {
        await updateDoc(doc(db, 'invitation_codes', docId), {
            status: 'used',
            used_at: serverTimestamp(),
            used_by: userEmail
        });
    } catch (error) {
        console.error('[Auth] Error marking invitation code as used:', error);
        throw error;
    }
}

/* ========================================
   USER DOCUMENT MANAGEMENT
   ======================================== */

/**
 * Create user document in Firestore
 * @param {string} userId - Firebase Auth user ID
 * @param {Object} data - User data (email, full_name, invitationCode)
 * @returns {Promise<void>}
 */
export async function createUserDocument(userId, data) {
    try {
        await setDoc(doc(db, 'users', userId), {
            email: data.email,
            full_name: data.full_name,
            status: 'pending',
            role: null,
            invitation_code: data.invitationCode,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        });
        console.log('[Auth] User document created:', userId);
    } catch (error) {
        console.error('[Auth] Error creating user document:', error);
        throw error;
    }
}

/**
 * Get user document from Firestore
 * @param {string} userId - Firebase Auth user ID
 * @returns {Promise<Object|null>}
 */
export async function getUserDocument(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));

        if (!userDoc.exists()) {
            return null;
        }

        return {
            id: userDoc.id,
            ...userDoc.data()
        };
    } catch (error) {
        console.error('[Auth] Error getting user document:', error);
        return null;
    }
}

/* ========================================
   AUTH STATE OBSERVER
   ======================================== */

// Module-level variables to track current user and listeners
let currentUser = null;
let userDocUnsubscribe = null;
let initialRouteHandled = false;

/**
 * Get current authenticated user data
 * @returns {Object|null} User data from Firestore or null if not authenticated
 */
export function getCurrentUser() {
    return currentUser;
}

/**
 * Check if user is authenticated
 * @returns {boolean} True if user is authenticated
 */
export function isAuthenticated() {
    return currentUser !== null;
}

/**
 * Initialize authentication state observer
 * Sets up onAuthStateChanged listener and real-time user document monitoring
 * Handles AUTH-09: Auto-logout for deactivated users
 */
export function initAuthObserver() {
    onAuthStateChanged(auth, async (user) => {
        // Clean up previous user document listener if exists
        if (userDocUnsubscribe) {
            userDocUnsubscribe();
            userDocUnsubscribe = null;
        }

        if (user) {
            console.log('[Auth] User signed in:', user.email);

            // Force a token refresh so Firestore WebSocket receives valid auth BEFORE
            // any collection listener starts. Without this, listeners that use
            // getUserData() in security rules fail on the first onAuthStateChanged
            // event (which fires with the cached, unvalidated token).
            try { await user.getIdToken(true); } catch (e) { console.warn('[Auth] Token refresh failed:', e); }

            // Use a single onSnapshot for both initial load and real-time updates.
            // getDoc() internally creates an onSnapshot without an error callback,
            // which causes Firebase SDK to log "Uncaught Error in snapshot listener"
            // when the auth token hasn't propagated to Firestore yet.
            // onSnapshot with an explicit error callback prevents that log entirely.
            let isFirstSnapshot = true;

            userDocUnsubscribe = onSnapshot(
                doc(db, 'users', user.uid),
                async (docSnapshot) => {
                    if (docSnapshot.exists()) {
                        const userData = docSnapshot.data();

                        // Capture previous state for change detection (Phase 7, PERM-19)
                        const previousRole = currentUser?.role;
                        const previousAssignedCodes = currentUser?.assigned_project_codes;
                        const previousAllProjects = currentUser?.all_projects;
                        const previousAssignedServiceCodes = currentUser?.assigned_service_codes;
                        const previousAllServices = currentUser?.all_services;

                        currentUser = { uid: user.uid, ...userData };

                        if (isFirstSnapshot) {
                            isFirstSnapshot = false;

                            // Initialize permissions if user is active with a role (PERM-16, PERM-17)
                            if (userData.status === 'active' && userData.role) {
                                await initPermissionsObserver(currentUser);
                            }

                            // Update navigation for authenticated user
                            updateNavForAuth(currentUser);

                            // Status-based routing (AUTH-08)
                            const currentHash = window.location.hash;

                            if (userData.status === 'pending') {
                                if (!currentHash.includes('/pending')) {
                                    console.log('[Auth] Pending user - redirecting to pending page');
                                    const currentPath = window.location.hash.slice(1);
                                    if (currentPath && currentPath !== '/' && currentPath !== '/pending' && currentPath !== '/login') {
                                        console.log('[Auth] Preserving intended route for pending user:', currentPath);
                                        sessionStorage.setItem('intendedRoute', currentPath);
                                    }
                                    window.location.hash = '#/pending';
                                }
                            } else if (userData.status === 'rejected') {
                                if (!currentHash.includes('/pending')) {
                                    console.log('[Auth] Rejected user - redirecting to pending page');
                                    const currentPath = window.location.hash.slice(1);
                                    if (currentPath && currentPath !== '/' && currentPath !== '/pending' && currentPath !== '/login') {
                                        console.log('[Auth] Preserving intended route for rejected user:', currentPath);
                                        sessionStorage.setItem('intendedRoute', currentPath);
                                    }
                                    window.location.hash = '#/pending';
                                }
                            } else if (userData.status === 'deactivated') {
                                console.log('[Auth] Deactivated user - signing out');
                                if (userDocUnsubscribe) { userDocUnsubscribe(); userDocUnsubscribe = null; }
                                await signOut(auth);
                                window.location.hash = '#/login';
                                return;
                            }
                            // Active users: no forced redirect

                            window.dispatchEvent(new CustomEvent('authStateChanged', {
                                detail: { user: currentUser }
                            }));

                            if (!initialRouteHandled && window.handleInitialRoute) {
                                initialRouteHandled = true;
                                window.handleInitialRoute();
                            }
                        } else {
                            // Subsequent real-time updates (AUTH-09, PERM-19, Phase 7)
                            console.log('[Auth] User document updated:', userData.status);

                            if (previousRole !== userData.role) {
                                console.log('[Auth] Role changed:', previousRole, '->', userData.role);
                                if (userData.status === 'active' && userData.role) {
                                    await initPermissionsObserver(currentUser);
                                } else {
                                    destroyPermissionsObserver();
                                }
                            }

                            if (JSON.stringify(userData.assigned_project_codes) !== JSON.stringify(previousAssignedCodes) ||
                                userData.all_projects !== previousAllProjects ||
                                JSON.stringify(userData.assigned_service_codes) !== JSON.stringify(previousAssignedServiceCodes) ||
                                userData.all_services !== previousAllServices) {
                                console.log('[Auth] Assignments changed, dispatching event');
                                window.dispatchEvent(new CustomEvent('assignmentsChanged', {
                                    detail: { user: currentUser }
                                }));
                            }

                            if (userData.status === 'deactivated') {
                                console.warn('[Auth] User deactivated - forcing logout');
                                if (userDocUnsubscribe) { userDocUnsubscribe(); userDocUnsubscribe = null; }
                                signOut(auth).then(() => {
                                    window.location.hash = '#/login';
                                    alert('Your account has been deactivated. Please contact an administrator.');
                                }).catch(error => {
                                    console.error('[Auth] Error signing out deactivated user:', error);
                                });
                            }
                        }
                    } else if (isFirstSnapshot) {
                        isFirstSnapshot = false;
                        console.warn('[Auth] User document not found for:', user.email);

                        // Check if user was deleted (moved to deleted_users collection)
                        try {
                            const deletedUserDoc = await getDoc(doc(db, 'deleted_users', user.uid));
                            if (deletedUserDoc.exists()) {
                                console.error('[Auth] User account deleted - forcing sign out');
                                await signOut(auth);
                                window.location.hash = '#/login';
                                return;
                            }
                        } catch (error) {
                            console.error('[Auth] Error checking deleted_users:', error);
                        }

                        console.error('[Auth] User document missing - forcing sign out for security');
                        await signOut(auth);
                        window.location.hash = '#/login';
                        return;
                    }
                },
                (error) => {
                    console.error('[Auth] User document listener error:', error);
                }
            );
        } else {
            console.log('[Auth] User signed out');

            // Clean up permissions observer
            destroyPermissionsObserver();

            // Clear current user
            currentUser = null;

            // Update navigation for unauthenticated state
            updateNavForAuth(null);

            // Dispatch custom event for auth state change
            window.dispatchEvent(new CustomEvent('authStateChanged', {
                detail: { user: null }
            }));

            // Handle initial route for unauthenticated state (SEC-01)
            if (!initialRouteHandled && window.handleInitialRoute) {
                initialRouteHandled = true;
                window.handleInitialRoute();
            }
        }
    });
}

/* ========================================
   LOGOUT FUNCTIONALITY
   ======================================== */

/**
 * Update navigation UI based on authentication state
 * @param {Object|null} user - Current user data or null
 */
function updateNavForAuth(user) {
    const logoutBtn = document.getElementById('logoutBtn');
    const navLinks = document.querySelectorAll('.nav-link[data-route]');

    if (user) {
        // Show logout button for authenticated users
        if (logoutBtn) logoutBtn.style.display = 'block';

        // Filter navigation based on permissions (PERM-13, PERM-14)
        const permissions = window.getCurrentPermissions?.();

        navLinks.forEach(link => {
            const route = link.getAttribute('data-route');
            const hasAccess = permissions?.tabs?.[route]?.access ?? true; // Default to true if no permissions loaded yet

            link.style.display = hasAccess ? '' : 'none';
        });

        // Handle dropdown containers (Admin dropdown)
        const dropdowns = document.querySelectorAll('.nav-dropdown[data-route]');
        dropdowns.forEach(dropdown => {
            const route = dropdown.getAttribute('data-route');
            const hasAccess = permissions?.tabs?.[route]?.access ?? true;
            dropdown.style.display = hasAccess ? '' : 'none';
        });
    } else {
        // Hide logout button for unauthenticated users
        if (logoutBtn) logoutBtn.style.display = 'none';

        // SEC-04: Hide all nav links for unauthenticated users
        // Only auth pages (login/register) should be accessible
        navLinks.forEach(link => {
            link.style.display = 'none';
        });

        // Also hide dropdown containers
        const dropdowns = document.querySelectorAll('.nav-dropdown[data-route]');
        dropdowns.forEach(dropdown => {
            dropdown.style.display = 'none';
        });

        console.log('[Auth] Navigation hidden for unauthenticated user');
    }
}

/**
 * Show logout confirmation modal
 * @returns {Promise<boolean>} True if user confirms, false if cancelled
 */
function showLogoutConfirmation() {
    return new Promise((resolve) => {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
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
            max-width: 400px;
            width: 90%;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        `;

        dialog.innerHTML = `
            <h3 style="margin: 0 0 1rem 0; font-size: 1.25rem; color: var(--gray-900);">
                Confirm Logout
            </h3>
            <p style="margin: 0 0 1.5rem 0; color: var(--gray-700); font-size: 0.9375rem;">
                Are you sure you want to log out?
            </p>
            <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
                <button id="cancelLogout" class="btn btn-secondary" style="min-width: 90px;">
                    Cancel
                </button>
                <button id="confirmLogout" class="btn btn-danger" style="min-width: 90px;">
                    Log Out
                </button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        // Handle cancel
        document.getElementById('cancelLogout').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(false);
        });

        // Handle confirm
        document.getElementById('confirmLogout').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(true);
        });

        // Handle click outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                resolve(false);
            }
        });
    });
}

/**
 * Handle logout from navigation header
 */
export async function handleLogout() {
    console.log('[Auth] Logout requested');

    // Show confirmation modal
    const confirmed = await showLogoutConfirmation();

    if (!confirmed) {
        console.log('[Auth] Logout cancelled');
        return;
    }

    try {
        // Clear any saved intended route (SEC-02)
        sessionStorage.removeItem('intendedRoute');

        await signOut(auth);
        console.log('[Auth] User signed out successfully');
        window.location.hash = '#/login';
    } catch (error) {
        console.error('[Auth] Error signing out:', error);
        alert('Error logging out. Please try again.');
    }
}

// Expose functions to window for onclick handlers
window.validateInvitationCode = validateInvitationCode;
window.createUserDocument = createUserDocument;
window.getUserDocument = getUserDocument;
window.getCurrentUser = getCurrentUser;
window.isAuthenticated = isAuthenticated;
window.handleLogout = handleLogout;
