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
 * Each role MUST have all 12 tabs defined (access: true/false, edit: true/false)
 * Phase 91 — added 4 sub-tab keys per role and 2 new role objects (services_admin, services_user)
 * Bugfix — added missing `services` tab key; fixed operations_user projects.edit (was false)
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
                services: { access: true, edit: true },
                mrf_form: { access: true, edit: true },
                procurement: { access: true, edit: true },
                finance: { access: true, edit: true },
                role_config: { access: true, edit: true },
                procurement_request:   { access: true, edit: true },
                procurement_mrfs:      { access: true, edit: true },
                procurement_suppliers: { access: true, edit: true },
                procurement_records:   { access: true, edit: true }
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
                services: { access: true, edit: true },
                mrf_form: { access: true, edit: true },
                procurement: { access: true, edit: true },
                finance: { access: true, edit: false },
                role_config: { access: false, edit: false },
                procurement_request:   { access: true, edit: true },
                procurement_mrfs:      { access: true, edit: true },
                procurement_suppliers: { access: true, edit: true },
                procurement_records:   { access: true, edit: true }
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
                projects: { access: true, edit: true },
                services: { access: true, edit: true },
                mrf_form: { access: true, edit: true },
                procurement: { access: true, edit: false },
                finance: { access: false, edit: false },
                role_config: { access: false, edit: false },
                procurement_request:   { access: true, edit: true },
                procurement_mrfs:      { access: true, edit: false },
                procurement_suppliers: { access: true, edit: false },
                procurement_records:   { access: true, edit: false }
            }
        }
    },
    {
        role_id: 'services_admin',
        role_name: 'Services Admin',
        permissions: {
            tabs: {
                dashboard: { access: true, edit: false },
                clients: { access: true, edit: true },
                projects: { access: true, edit: true },
                services: { access: true, edit: true },
                mrf_form: { access: true, edit: true },
                procurement: { access: true, edit: true },
                finance: { access: true, edit: false },
                role_config: { access: false, edit: false },
                procurement_request:   { access: true, edit: true },
                procurement_mrfs:      { access: true, edit: true },
                procurement_suppliers: { access: true, edit: true },
                procurement_records:   { access: true, edit: true }
            }
        }
    },
    {
        role_id: 'services_user',
        role_name: 'Services User',
        permissions: {
            tabs: {
                dashboard: { access: true, edit: false },
                clients: { access: true, edit: false },
                projects: { access: true, edit: true },
                services: { access: true, edit: true },
                mrf_form: { access: true, edit: true },
                procurement: { access: true, edit: false },
                finance: { access: false, edit: false },
                role_config: { access: false, edit: false },
                procurement_request:   { access: true, edit: true },
                procurement_mrfs:      { access: true, edit: false },
                procurement_suppliers: { access: true, edit: false },
                procurement_records:   { access: true, edit: false }
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
                services: { access: true, edit: false },
                mrf_form: { access: false, edit: false },
                procurement: { access: false, edit: false },
                finance: { access: true, edit: true },
                role_config: { access: false, edit: false },
                procurement_request:   { access: false, edit: false },
                procurement_mrfs:      { access: false, edit: false },
                procurement_suppliers: { access: false, edit: false },
                procurement_records:   { access: false, edit: false }
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
                services: { access: true, edit: false },
                mrf_form: { access: false, edit: false },
                procurement: { access: true, edit: true },
                finance: { access: false, edit: false },
                role_config: { access: false, edit: false },
                procurement_request:   { access: false, edit: false },
                procurement_mrfs:      { access: true, edit: true },
                procurement_suppliers: { access: true, edit: true },
                procurement_records:   { access: true, edit: true }
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
        // Check if super_admin template already exists
        const superAdminDoc = await getDoc(doc(db, 'role_templates', 'super_admin'));

        if (superAdminDoc.exists()) {
            console.warn('[RoleSeeder] Role templates already exist - skipping seeding');
            return;
        }

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
    } catch (error) {
        console.error('[RoleSeeder] Error seeding role templates:', error);
        throw error;
    }
}

/**
 * Phase 91 — call this once after deploy to push the 4 new sub-tab permission keys to live role documents.
 * Force reseed role templates (overwrites existing)
 * Use for testing or resetting to defaults
 * @returns {Promise<void>}
 */
export async function forceReseedRoleTemplates() {
    try {
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
 * Checks all 7 roles exist and each has all 12 tabs defined
 * @returns {Promise<{valid: boolean, errors: Array<string>}>}
 */
export async function verifyRoleTemplates() {
    const roles = ['super_admin', 'operations_admin', 'operations_user', 'services_admin', 'services_user', 'finance', 'procurement'];
    const requiredTabs = ['dashboard', 'clients', 'projects', 'services', 'mrf_form', 'procurement', 'finance', 'role_config',
                          'procurement_request', 'procurement_mrfs', 'procurement_suppliers', 'procurement_records'];
    const results = { valid: true, errors: [] };

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

    return results;
}

/* ========================================
   WINDOW EXPOSURE
   ======================================== */

// Expose functions to window for browser console access
window.seedRoleTemplates = seedRoleTemplates;
window.forceReseedRoleTemplates = forceReseedRoleTemplates;
window.verifyRoleTemplates = verifyRoleTemplates;
