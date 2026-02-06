/**
 * PERMISSION VALIDATION UTILITY
 *
 * Validates that the permission system is properly configured
 * Checks for mismatches between code and Firestore
 *
 * USAGE:
 * 1. Open browser console (any user)
 * 2. Copy and paste this entire file
 * 3. Run: await validatePermissions()
 *
 * This will check for common permission system issues
 */

async function validatePermissions() {
    console.log('🔍 Starting permission system validation...\n');

    const issues = [];
    const warnings = [];
    const info = [];

    try {
        // Import Firebase SDK
        const { db } = await import('../app/firebase.js');
        const { collection, getDocs } = await import('../app/firebase.js');

        // 1. Check if role_templates collection exists
        console.log('1️⃣ Checking role_templates collection...');
        let rolesSnapshot;
        try {
            rolesSnapshot = await getDocs(collection(db, 'role_templates'));
            info.push(`✅ Found ${rolesSnapshot.size} role template(s) in Firestore`);
        } catch (error) {
            issues.push('❌ Cannot access role_templates collection');
            issues.push(`   Error: ${error.message}`);
            return { issues, warnings, info, success: false };
        }

        // 2. Check for required tabs in each role
        console.log('2️⃣ Checking required tabs in role templates...');
        const requiredTabs = ['dashboard', 'clients', 'projects', 'mrf_form', 'procurement', 'finance', 'role_config'];

        rolesSnapshot.forEach(doc => {
            const roleData = doc.data();
            const roleName = roleData.role_name || doc.id;
            const tabs = roleData.permissions?.tabs || {};

            requiredTabs.forEach(tabId => {
                if (!tabs[tabId]) {
                    issues.push(`❌ Role "${roleName}" missing tab: ${tabId}`);
                } else if (typeof tabs[tabId].access !== 'boolean') {
                    issues.push(`❌ Role "${roleName}" tab "${tabId}" has invalid access value: ${tabs[tabId].access}`);
                } else if (typeof tabs[tabId].edit !== 'boolean') {
                    issues.push(`❌ Role "${roleName}" tab "${tabId}" has invalid edit value: ${tabs[tabId].edit}`);
                }
            });

            // Check for extra tabs (not in required list)
            const extraTabs = Object.keys(tabs).filter(t => !requiredTabs.includes(t));
            if (extraTabs.length > 0) {
                warnings.push(`⚠️  Role "${roleName}" has extra tabs: ${extraTabs.join(', ')}`);
                warnings.push(`   (These might be new tabs - update requiredTabs in validate-permissions.js)`);
            }
        });

        // 3. Check router permission map
        console.log('3️⃣ Checking router permission mappings...');

        // Expected routes from router.js
        const expectedRoutes = {
            '/': 'dashboard',
            '/clients': 'clients',
            '/projects': 'projects',
            '/project-detail': 'projects',
            '/mrf-form': 'mrf_form',
            '/procurement': 'procurement',
            '/finance': 'finance',
            '/role-config': 'role_config',
            '/project-assignments': 'role_config',
            '/user-management': 'role_config'
        };

        // Check if routes are properly mapped to tab permissions
        for (const [route, permissionKey] of Object.entries(expectedRoutes)) {
            const hasPermission = requiredTabs.includes(permissionKey);
            if (!hasPermission) {
                issues.push(`❌ Route "${route}" maps to unknown permission: ${permissionKey}`);
            } else {
                info.push(`✅ Route "${route}" → "${permissionKey}"`);
            }
        }

        // 4. Check navigation links
        console.log('4️⃣ Checking navigation links...');
        const navLinks = document.querySelectorAll('.nav-link[data-route]');

        navLinks.forEach(link => {
            const route = link.getAttribute('data-route');
            const href = link.getAttribute('href');

            if (!requiredTabs.includes(route)) {
                warnings.push(`⚠️  Navigation link "${href}" has unknown data-route: ${route}`);
            } else {
                info.push(`✅ Nav link "${href}" → data-route="${route}"`);
            }
        });

        // 5. Check current user permissions
        console.log('5️⃣ Checking current user permissions...');
        const currentPermissions = window.getCurrentPermissions?.();

        if (!currentPermissions) {
            warnings.push('⚠️  getCurrentPermissions() returned null/undefined');
            warnings.push('   User might not be logged in or permissions not loaded');
        } else if (!currentPermissions.tabs) {
            issues.push('❌ Current user permissions missing "tabs" object');
        } else {
            const userTabCount = Object.keys(currentPermissions.tabs).length;
            info.push(`✅ Current user has ${userTabCount} tab permission(s)`);

            // Check if user has access to at least one tab
            const hasAnyAccess = Object.values(currentPermissions.tabs).some(t => t.access === true);
            if (!hasAnyAccess) {
                issues.push('❌ Current user has no tab access permissions!');
            }
        }

        // 6. Check for Super Admin
        console.log('6️⃣ Checking for Super Admin role...');
        const superAdminDoc = rolesSnapshot.docs.find(d => d.id === 'super_admin');

        if (!superAdminDoc) {
            issues.push('❌ Super Admin role not found in Firestore!');
        } else {
            const superAdminTabs = superAdminDoc.data().permissions?.tabs || {};
            const allTabsEnabled = requiredTabs.every(tab =>
                superAdminTabs[tab]?.access === true &&
                superAdminTabs[tab]?.edit === true
            );

            if (allTabsEnabled) {
                info.push('✅ Super Admin has full access to all tabs');
            } else {
                const deniedTabs = requiredTabs.filter(tab =>
                    !superAdminTabs[tab] ||
                    superAdminTabs[tab]?.access !== true ||
                    superAdminTabs[tab]?.edit !== true
                );
                issues.push(`❌ Super Admin missing full access to: ${deniedTabs.join(', ')}`);
            }
        }

        // 7. Check permission utility functions
        console.log('7️⃣ Checking permission utility functions...');
        if (typeof window.hasTabAccess !== 'function') {
            issues.push('❌ window.hasTabAccess() function not found');
        } else {
            info.push('✅ window.hasTabAccess() available');
        }

        if (typeof window.canEditTab !== 'function') {
            issues.push('❌ window.canEditTab() function not found');
        } else {
            info.push('✅ window.canEditTab() available');
        }

        if (typeof window.getCurrentPermissions !== 'function') {
            issues.push('❌ window.getCurrentPermissions() function not found');
        } else {
            info.push('✅ window.getCurrentPermissions() available');
        }

        // Print results
        console.log('\n' + '='.repeat(70));
        console.log('📊 VALIDATION RESULTS');
        console.log('='.repeat(70));

        if (issues.length === 0 && warnings.length === 0) {
            console.log('\n✨ All checks passed! Permission system is healthy.\n');
        } else {
            if (issues.length > 0) {
                console.log('\n🚨 CRITICAL ISSUES:');
                issues.forEach(issue => console.log(`  ${issue}`));
            }

            if (warnings.length > 0) {
                console.log('\n⚠️  WARNINGS:');
                warnings.forEach(warning => console.log(`  ${warning}`));
            }

            if (issues.length === 0 && warnings.length > 0) {
                console.log('\n✅ No critical issues, but review warnings above.');
            }
        }

        console.log('\n📋 INFO:');
        info.forEach(item => console.log(`  ${item}`));

        console.log('\n' + '='.repeat(70));
        console.log(`✅ Passed: ${info.length}`);
        console.log(`⚠️  Warnings: ${warnings.length}`);
        console.log(`❌ Issues: ${issues.length}`);
        console.log('='.repeat(70));

        if (issues.length > 0) {
            console.log('\n🔧 RECOMMENDED ACTIONS:');
            console.log('   1. Run sync-role-permissions.js to update Firestore');
            console.log('   2. Check that seed-roles.js is up to date');
            console.log('   3. Verify Firebase Security Rules allow role_templates access');
            console.log('   4. Log out and log back in to refresh permissions\n');
        }

        return {
            success: issues.length === 0,
            issues,
            warnings,
            info,
            summary: {
                passed: info.length,
                warnings: warnings.length,
                issues: issues.length
            }
        };

    } catch (error) {
        console.error('❌ Validation failed:', error);
        return {
            success: false,
            error: error.message,
            issues: [`Fatal error: ${error.message}`],
            warnings: [],
            info: []
        };
    }
}

// Instructions
console.log(`
╔════════════════════════════════════════════════════════════════╗
║  PERMISSION VALIDATION UTILITY LOADED                          ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  This utility validates the permission system configuration    ║
║  and checks for common issues.                                 ║
║                                                                ║
║  USAGE:                                                        ║
║  Run: await validatePermissions()                              ║
║                                                                ║
║  The validation will check:                                    ║
║  - Role templates exist in Firestore                           ║
║  - All roles have required tab permissions                     ║
║  - Router permission mappings are correct                      ║
║  - Navigation links are properly configured                    ║
║  - Permission utility functions are available                  ║
║  - Super Admin has full access                                 ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);
