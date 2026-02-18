/**
 * SEED: Services Tab Role Permissions
 *
 * Run once from browser console on the production Firebase project.
 * Open index.html in browser, open DevTools console, paste this script.
 *
 * USAGE:
 * 1. Start local server: python -m http.server 8000
 * 2. Open http://localhost:8000 in browser and log in
 * 3. Open DevTools console (F12 -> Console)
 * 4. Paste this entire script and press Enter
 *
 * What this script does:
 * - Sets tabs.services.access and tabs.services.edit per role
 * - Sets tabs.projects.access and tabs.projects.edit to false for services-only roles
 * - Uses dot-notation field paths (updateDoc) - does NOT overwrite the entire tabs object
 * - Covers all 6 role types: services_admin, services_user, operations_admin,
 *   operations_user, super_admin, finance_staff (procurement_staff if present)
 */

(async () => {
    // Use the already-initialized db from the running app
    const { db } = await import('/app/firebase.js');
    const { collection, getDocs, updateDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    if (!db) {
        console.error('[SeedServicesRoles] db is not available. Make sure the app is running and you are logged in.');
        return;
    }

    // Role permission updates to apply (dot-notation field paths for updateDoc)
    const roleUpdates = {
        services_admin: {
            'tabs.services.access': true,
            'tabs.services.edit': true,
            'tabs.projects.access': false,
            'tabs.projects.edit': false
        },
        services_user: {
            'tabs.services.access': true,
            'tabs.services.edit': false,
            'tabs.projects.access': false,
            'tabs.projects.edit': false
        },
        operations_admin: {
            'tabs.services.access': false,
            'tabs.services.edit': false
        },
        operations_user: {
            'tabs.services.access': false,
            'tabs.services.edit': false
        },
        super_admin: {
            'tabs.services.access': true,
            'tabs.services.edit': false
        },
        finance_staff: {
            'tabs.services.access': true,
            'tabs.services.edit': false
        },
        procurement_staff: {
            'tabs.services.access': true,
            'tabs.services.edit': false
        }
    };

    console.log('[SeedServicesRoles] Loading role_templates collection...');

    const snapshot = await getDocs(collection(db, 'role_templates'));
    console.log(`[SeedServicesRoles] Found ${snapshot.size} role template(s) in Firestore`);

    const results = [];

    for (const roleDoc of snapshot.docs) {
        const roleId = roleDoc.id;
        const updates = roleUpdates[roleId];

        if (!updates) {
            console.log(`[SeedServicesRoles] Skipping ${roleId} (no update defined for this role)`);
            results.push({ role: roleId, status: 'skipped' });
            continue;
        }

        try {
            await updateDoc(doc(db, 'role_templates', roleId), updates);
            console.log(`[SeedServicesRoles] Updated ${roleId}:`, updates);
            results.push({ role: roleId, status: 'updated', updates });
        } catch (err) {
            console.error(`[SeedServicesRoles] Failed to update ${roleId}:`, err);
            results.push({ role: roleId, status: 'error', error: err.message });
        }
    }

    console.log('\n[SeedServicesRoles] Results summary:');
    results.forEach(r => {
        const statusLabel = r.status === 'updated' ? 'OK' :
                            r.status === 'skipped' ? 'SKIP' : 'ERROR';
        console.log(`  [${statusLabel}] ${r.role}`);
    });

    console.log('[Done] All role_templates updated');
    console.log('\nNext steps:');
    console.log('  1. Log out and log back in to refresh permissions');
    console.log('  2. Verify services tab appears for services_admin and services_user');
    console.log('  3. Verify projects tab is hidden for services_admin and services_user');
    console.log('  4. Verify services tab is hidden for operations_admin and operations_user');
})();
