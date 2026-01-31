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
    onAuthStateChanged
} from './firebase.js';

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

/**
 * Initialize authentication state observer
 * Logs auth state changes for debugging
 */
export function initAuthObserver() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log('[Auth] User signed in:', user.email);
        } else {
            console.log('[Auth] User signed out');
        }
    });
}

// Expose functions to window for onclick handlers
window.validateInvitationCode = validateInvitationCode;
window.createUserDocument = createUserDocument;
window.getUserDocument = getUserDocument;
