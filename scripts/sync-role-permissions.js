/**
 * ROLE PERMISSION SYNC UTILITY
 *
 * Syncs role template permissions from seed-roles.js to Firestore
 *
 * USAGE:
 * 1. Open browser console while logged in as Super Admin
 * 2. Copy and paste this entire file
 * 3. Run: await syncRolePermissions()
 *
 * This ensures Firestore role_templates match the code definitions
 */

async function syncRolePermissions() {
    console.log('🔄 Starting role permission sync...\n');

    // Import Firebase SDK
    const { db } = await import('../app/firebase.js');
    const { collection, getDocs, doc, updateDoc, serverTimestamp } = await import('../app/firebase.js');

    // Define default role templates (source of truth from seed-roles.js)
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
                    procurement: { access: true, edit: true },
                    finance: { access: true, edit: false },
                    role_config: { access: false, edit: false }
                }
            }
        },
        {
            role_id: 'finance_user',
            role_name: 'Finance User',
            permissions: {
                tabs: {
                    dashboard: { access: true, edit: false },
                    clients: { access: false, edit: false },
                    projects: { access: false, edit: false },
                    mrf_form: { access: false, edit: false },
                    procurement: { access: false, edit: false },
                    finance: { access: true, edit: true },
                    role_config: { access: false, edit: false }
                }
            }
        },
        {
            role_id: 'viewer',
            role_name: 'Viewer',
            permissions: {
                tabs: {
                    dashboard: { access: true, edit: false },
                    clients: { access: true, edit: false },
                    projects: { access: true, edit: false },
                    mrf_form: { access: true, edit: false },
                    procurement: { access: true, edit: false },
                    finance: { access: true, edit: false },
                    role_config: { access: false, edit: false }
                }
            }
        }
    ];

    try {
        // Fetch existing role templates from Firestore
        const rolesSnapshot = await getDocs(collection(db, 'role_templates'));

        console.log(`📋 Found ${rolesSnapshot.size} role(s) in Firestore\n`);

        let updateCount = 0;
        let skipCount = 0;
        const results = [];

        // Process each role
        for (const roleTemplate of defaultRoleTemplates) {
            const roleId = roleTemplate.role_id;
            const roleDoc = rolesSnapshot.docs.find(d => d.id === roleId);

            if (!roleDoc) {
                console.warn(`⚠️  Role "${roleId}" not found in Firestore - skipping`);
                results.push({
                    role: roleTemplate.role_name,
                    status: '❌ NOT FOUND',
                    message: 'Create this role in Firestore first'
                });
                skipCount++;
                continue;
            }

            const existingData = roleDoc.data();
            const newPermissions = roleTemplate.permissions;

            // Compare permissions
            const hasChanges = JSON.stringify(existingData.permissions?.tabs) !==
                              JSON.stringify(newPermissions.tabs);

            if (hasChanges) {
                // Update Firestore
                await updateDoc(doc(db, 'role_templates', roleId), {
                    permissions: newPermissions,
                    updated_at: serverTimestamp()
                });

                console.log(`✅ Updated: ${roleTemplate.role_name}`);

                // Show what changed
                const oldTabs = Object.keys(existingData.permissions?.tabs || {});
                const newTabs = Object.keys(newPermissions.tabs);
                const addedTabs = newTabs.filter(t => !oldTabs.includes(t));
                const removedTabs = oldTabs.filter(t => !newTabs.includes(t));

                const changes = [];
                if (addedTabs.length > 0) changes.push(`+${addedTabs.join(', ')}`);
                if (removedTabs.length > 0) changes.push(`-${removedTabs.join(', ')}`);

                results.push({
                    role: roleTemplate.role_name,
                    status: '✅ UPDATED',
                    changes: changes.length > 0 ? changes.join(' | ') : 'permissions modified'
                });

                updateCount++;
            } else {
                console.log(`⏭️  Skipped: ${roleTemplate.role_name} (no changes)`);
                results.push({
                    role: roleTemplate.role_name,
                    status: '⏭️ NO CHANGES',
                    message: 'Already up to date'
                });
                skipCount++;
            }
        }

        // Print summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 SYNC SUMMARY');
        console.log('='.repeat(60));
        console.log(`✅ Updated: ${updateCount} role(s)`);
        console.log(`⏭️  Skipped: ${skipCount} role(s) (no changes or not found)`);
        console.log('='.repeat(60));
        console.log('\n📋 DETAILED RESULTS:\n');

        results.forEach((r, i) => {
            console.log(`${i + 1}. ${r.role}`);
            console.log(`   Status: ${r.status}`);
            if (r.changes) console.log(`   Changes: ${r.changes}`);
            if (r.message) console.log(`   Note: ${r.message}`);
            console.log('');
        });

        console.log('✨ Sync complete!');
        console.log('\n💡 Next steps:');
        console.log('   1. Log out and log back in to refresh permissions');
        console.log('   2. Test tab visibility for each role');
        console.log('   3. Clear browser cache if tabs still not appearing\n');

        return { success: true, updated: updateCount, skipped: skipCount };

    } catch (error) {
        console.error('❌ Sync failed:', error);
        console.error('\n🔧 Troubleshooting:');
        console.error('   1. Make sure you\'re logged in as Super Admin');
        console.error('   2. Check browser console for Firebase errors');
        console.error('   3. Verify Firestore connection is working\n');
        return { success: false, error: error.message };
    }
}

// Auto-export if running in module context
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { syncRolePermissions };
}

// Instructions
console.log(`
╔════════════════════════════════════════════════════════════════╗
║  ROLE PERMISSION SYNC UTILITY LOADED                           ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  This utility syncs role permissions from seed-roles.js        ║
║  to Firestore role_templates collection.                       ║
║                                                                ║
║  USAGE:                                                        ║
║  1. Make sure you're logged in as Super Admin                 ║
║  2. Run: await syncRolePermissions()                           ║
║                                                                ║
║  The sync will:                                                ║
║  - Update existing roles with latest permissions              ║
║  - Add new tabs to role templates                              ║
║  - Show detailed results of what changed                       ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);
