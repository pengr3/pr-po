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
 * @param {string} userId - User ID who used the code
 * @returns {Promise<void>}
 */
export async function markInvitationCodeUsed(docId, userId) {
    try {
        await updateDoc(doc(db, 'invitation_codes', docId), {
            status: 'used',
            used_at: serverTimestamp(),
            used_by: userId
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

            // Fetch user document from Firestore
            try {
                const userData = await getUserDocument(user.uid);

                if (userData) {
                    // Store user data
                    currentUser = { uid: user.uid, ...userData };

                    // Dispatch custom event for auth state change
                    window.dispatchEvent(new CustomEvent('authStateChanged', {
                        detail: { user: currentUser }
                    }));

                    // Set up real-time listener on user document (AUTH-09)
                    userDocUnsubscribe = onSnapshot(doc(db, 'users', user.uid), (docSnapshot) => {
                        if (docSnapshot.exists()) {
                            const updatedUserData = docSnapshot.data();
                            currentUser = { uid: user.uid, ...updatedUserData };

                            console.log('[Auth] User document updated:', updatedUserData.status);

                            // AUTH-09: If status changes to 'deactivated', force logout
                            if (updatedUserData.status === 'deactivated') {
                                console.warn('[Auth] User deactivated - forcing logout');

                                // Clean up listener before logout
                                if (userDocUnsubscribe) {
                                    userDocUnsubscribe();
                                    userDocUnsubscribe = null;
                                }

                                // Sign out
                                signOut(auth).then(() => {
                                    window.location.hash = '#/login';
                                    alert('Your account has been deactivated. Please contact an administrator.');
                                }).catch(error => {
                                    console.error('[Auth] Error signing out deactivated user:', error);
                                });
                            }
                        }
                    });
                } else {
                    console.warn('[Auth] User document not found for:', user.email);
                    currentUser = { uid: user.uid, email: user.email };
                }
            } catch (error) {
                console.error('[Auth] Error fetching user document:', error);
                currentUser = { uid: user.uid, email: user.email };
            }
        } else {
            console.log('[Auth] User signed out');

            // Clear current user
            currentUser = null;

            // Dispatch custom event for auth state change
            window.dispatchEvent(new CustomEvent('authStateChanged', {
                detail: { user: null }
            }));
        }
    });
}

// Expose functions to window for onclick handlers
window.validateInvitationCode = validateInvitationCode;
window.createUserDocument = createUserDocument;
window.getUserDocument = getUserDocument;
window.getCurrentUser = getCurrentUser;
window.isAuthenticated = isAuthenticated;
