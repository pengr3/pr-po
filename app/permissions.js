/* ========================================
   PERMISSIONS MODULE
   Permission checking utilities and role template real-time listener
   ======================================== */

import { db } from './firebase.js';
import { doc, onSnapshot } from './firebase.js';

/* ========================================
   MODULE STATE
   ======================================== */

// Current user's permissions loaded from their role template
let currentPermissions = null;

// Cleanup function for role template listener
let roleTemplateUnsubscribe = null;

/* ========================================
   PERMISSION CHECK UTILITIES
   ======================================== */

/**
 * Get current user's permissions object
 * @returns {Object|null} Permissions object or null if not loaded
 */
export function getCurrentPermissions() {
    return currentPermissions;
}

/**
 * Check if user has access to a tab
 * @param {string} tabId - Tab identifier ('dashboard', 'clients', 'projects', 'mrf_form', 'procurement', 'finance', 'role_config')
 * @returns {boolean} True if user has access permission
 */
export function hasTabAccess(tabId) {
    return currentPermissions?.tabs?.[tabId]?.access || false;
}

/**
 * Check if user has edit permission for a tab
 * @param {string} tabId - Tab identifier
 * @returns {boolean} True if user has edit permission
 */
export function canEditTab(tabId) {
    return currentPermissions?.tabs?.[tabId]?.edit || false;
}

/* ========================================
   REAL-TIME PERMISSIONS OBSERVER
   ======================================== */

/**
 * Initialize permissions observer for user's role
 * Sets up real-time listener on role template document
 * @param {Object} user - User object with role property
 * @returns {Promise<void>}
 */
export async function initPermissionsObserver(user) {
    // Clean up existing listener first (prevents memory leaks on role change)
    if (roleTemplateUnsubscribe) {
        console.log('[Permissions] Cleaning up existing listener');
        roleTemplateUnsubscribe();
        roleTemplateUnsubscribe = null;
    }

    // If user has no role assigned, set permissions to null
    if (!user.role) {
        console.log('[Permissions] No role assigned, permissions disabled');
        currentPermissions = null;
        return;
    }

    console.log('[Permissions] Initializing observer for role:', user.role);

    // Create real-time listener on role template document
    const roleDocRef = doc(db, 'role_templates', user.role);

    roleTemplateUnsubscribe = onSnapshot(
        roleDocRef,
        (docSnapshot) => {
            if (docSnapshot.exists()) {
                const roleData = docSnapshot.data();
                currentPermissions = roleData.permissions;

                console.log('[Permissions] Permissions loaded for role:', user.role);
                console.log('[Permissions] Permissions:', currentPermissions);

                // Dispatch custom event for UI updates (e.g., navigation menu)
                window.dispatchEvent(new CustomEvent('permissionsChanged', {
                    detail: {
                        permissions: currentPermissions,
                        role: user.role
                    }
                }));
            } else {
                console.warn('[Permissions] Role template not found:', user.role);
                currentPermissions = null;
            }
        },
        (error) => {
            console.error('[Permissions] Error listening to role template:', error);

            // Handle permission-denied errors gracefully
            if (error.code === 'permission-denied') {
                console.error('[Permissions] Permission denied accessing role template:', user.role);
                currentPermissions = null;
            }
        }
    );
}

/**
 * Destroy permissions observer and clear permissions
 * Call on logout or before initializing new observer
 */
export function destroyPermissionsObserver() {
    if (roleTemplateUnsubscribe) {
        console.log('[Permissions] Destroying permissions observer');
        roleTemplateUnsubscribe();
        roleTemplateUnsubscribe = null;
    }
    currentPermissions = null;
}

/* ========================================
   WINDOW EXPOSURE
   ======================================== */

// Expose functions to window for global access
window.getCurrentPermissions = getCurrentPermissions;
window.hasTabAccess = hasTabAccess;
window.canEditTab = canEditTab;
