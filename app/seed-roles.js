/* ========================================
   ROLE TEMPLATE SEEDING UTILITY
   One-time initialization and verification of role templates
   ======================================== */

import { db } from './firebase.js';
import { doc, setDoc, serverTimestamp, writeBatch, getDoc } from './firebase.js';

/* ========================================
   ROLE TEMPLATE DATA
   ======================================== */

/**
 * Default role templates with tab permissions
 * Each role MUST have all 7 tabs defined (access: true/false, edit: true/false)
 */
const defaultRoleTemplates = [
    {
        role_id: 'super_admin',
        role_name: 'Super Admin',
        permissions: {
            tabs: {
                dashboard: { access: true, edit: true },
                clients: { access: true, edit: true },
                projects: { access: true, edit: true },
                mrf_form: { access: true, edit: true },
                procurement: { access: true, edit: true },
                finance: { access: true, edit: true },
                role_config: { access: true, edit: true }
            }
        }
    },
    {
        role_id: 'operations_admin',
        role_name: 'Operations Admin',
        permissions: {
            tabs: {
                dashboard: { access: true, edit: false },
                clients: { access: true, edit: true },
                projects: { access: true, edit: true },
                mrf_form: { access: true, edit: true },
                procurement: { access: true, edit: true },
                finance: { access: true, edit: false },
                role_config: { access: false, edit: false }
            }
        }
    },
    {
        role_id: 'operations_user',
        role_name: 'Operations User',
        permissions: {
            tabs: {
                dashboard: { access: true, edit: false },
                clients: { access: true, edit: false },
                projects: { access: true, edit: false },
                mrf_form: { access: true, edit: true },
                procurement: { access: true, edit: false },
                finance: { access: false, edit: false },
                role_config: { access: false, edit: false }
            }
        }
    },
    {
        role_id: 'finance',
        role_name: 'Finance',
        permissions: {
            tabs: {
                dashboard: { access: true, edit: false },
                clients: { access: true, edit: false },
                projects: { access: true, edit: false },
                mrf_form: { access: false, edit: false },
                procurement: { access: false, edit: false },
                finance: { access: true, edit: true },
                role_config: { access: false, edit: false }
            }
        }
    },
    {
        role_id: 'procurement',
        role_name: 'Procurement',
        permissions: {
            tabs: {
                dashboard: { access: true, edit: false },
                clients: { access: true, edit: false },
                projects: { access: true, edit: false },
                mrf_form: { access: false, edit: false },
                procurement: { access: true, edit: true },
                finance: { access: false, edit: false },
                role_config: { access: false, edit: false }
            }
        }
    }
];

/* ========================================
   SEEDING FUNCTIONS
   ======================================== */

/**
 * Seed role templates to Firestore
 * Checks if templates already exist to avoid overwriting
 * @returns {Promise<void>}
 */
export async function seedRoleTemplates() {
    try {
        console.log('[RoleSeeder] Checking for existing role templates...');

        // Check if super_admin template already exists
        const superAdminDoc = await getDoc(doc(db, 'role_templates', 'super_admin'));

        if (superAdminDoc.exists()) {
            console.warn('[RoleSeeder] Role templates already exist - skipping seeding');
            console.log('[RoleSeeder] Use forceReseedRoleTemplates() to overwrite existing templates');
            return;
        }

        console.log('[RoleSeeder] Seeding role templates...');

        // Use batch write for atomic operation
        const batch = writeBatch(db);

        defaultRoleTemplates.forEach(roleTemplate => {
            const roleRef = doc(db, 'role_templates', roleTemplate.role_id);
            batch.set(roleRef, {
                ...roleTemplate,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            });
        });

        // Commit all role templates atomically
        await batch.commit();

        console.log('[RoleSeeder] Successfully seeded', defaultRoleTemplates.length, 'role templates');
        console.log('[RoleSeeder] Roles:', defaultRoleTemplates.map(r => r.role_id).join(', '));
    } catch (error) {
        console.error('[RoleSeeder] Error seeding role templates:', error);
        throw error;
    }
}

/**
 * Force reseed role templates (overwrites existing)
 * Use for testing or resetting to defaults
 * @returns {Promise<void>}
 */
export async function forceReseedRoleTemplates() {
    try {
        console.log('[RoleSeeder] Force reseeding role templates...');

        // Use batch write for atomic operation
        const batch = writeBatch(db);

        defaultRoleTemplates.forEach(roleTemplate => {
            const roleRef = doc(db, 'role_templates', roleTemplate.role_id);
            batch.set(roleRef, {
                ...roleTemplate,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            });
        });

        // Commit all role templates atomically
        await batch.commit();

        console.log('[RoleSeeder] Successfully force-reseeded', defaultRoleTemplates.length, 'role templates');
        console.log('[RoleSeeder] Roles:', defaultRoleTemplates.map(r => r.role_id).join(', '));
    } catch (error) {
        console.error('[RoleSeeder] Error force-reseeding role templates:', error);
        throw error;
    }
}

/* ========================================
   VERIFICATION FUNCTIONS
   ======================================== */

/**
 * Verify role templates have correct structure
 * Checks all 5 roles exist and each has all 7 tabs defined
 * @returns {Promise<{valid: boolean, errors: Array<string>}>}
 */
export async function verifyRoleTemplates() {
    const roles = ['super_admin', 'operations_admin', 'operations_user', 'finance', 'procurement'];
    const requiredTabs = ['dashboard', 'clients', 'projects', 'mrf_form', 'procurement', 'finance', 'role_config'];
    const results = { valid: true, errors: [] };

    console.log('[RoleSeeder] Verifying role templates...');

    for (const roleId of roles) {
        const docRef = doc(db, 'role_templates', roleId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            results.valid = false;
            results.errors.push(`Missing role template: ${roleId}`);
            continue;
        }

        const data = docSnap.data();

        // Check each required tab exists in permissions.tabs
        for (const tabId of requiredTabs) {
            if (!data.permissions?.tabs?.[tabId]) {
                results.valid = false;
                results.errors.push(`Role ${roleId} missing tab: ${tabId}`);
            } else {
                // Verify tab has both access and edit properties
                const tab = data.permissions.tabs[tabId];
                if (typeof tab.access !== 'boolean' || typeof tab.edit !== 'boolean') {
                    results.valid = false;
                    results.errors.push(`Role ${roleId} tab ${tabId} has invalid permissions structure`);
                }
            }
        }
    }

    console.log('[RoleSeeder] Verification result:', results);
    return results;
}

/* ========================================
   WINDOW EXPOSURE
   ======================================== */

// Expose functions to window for browser console access
window.seedRoleTemplates = seedRoleTemplates;
window.forceReseedRoleTemplates = forceReseedRoleTemplates;
window.verifyRoleTemplates = verifyRoleTemplates;
