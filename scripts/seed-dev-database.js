// USAGE:
// 1. python -m http.server 8000 (or npx http-server)
// 2. Open http://localhost:8000 and log in as Super Admin dev account
// 3. Verify the yellow DEV ENVIRONMENT banner is visible at the bottom of the page
//    (If no banner: you're on prod — DO NOT run this script)
// 4. Open DevTools console (F12)
// 5. Paste this entire file content and press Enter

(async () => {
    // SAFETY GUARD: Only run on localhost to prevent accidental prod writes
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        console.error('[SeedDev] ABORTED: This script must only be run on localhost or 127.0.0.1.');
        console.error(`[SeedDev] Current hostname: ${hostname}`);
        console.error('[SeedDev] If you see a yellow DEV ENVIRONMENT banner, you are on the correct environment.');
        return;
    }
    console.log('[SeedDev] Localhost check passed. Running on:', hostname);

    // IMPORTS: Use the established project pattern
    const { db } = await import('/app/firebase.js');
    const { doc, setDoc, addDoc, collection, serverTimestamp } =
        await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    // VERIFY DB
    if (!db) {
        console.error('[SeedDev] db is not available. Make sure the app is running and you are logged in.');
        return;
    }

    // ROLE TEMPLATES — 7 documents
    // Document IDs match ROLE_ORDER from role-config.js exactly.
    // Each document has role_id, role_name, and permissions.tabs with all 8 tab IDs.
    // Tab permission notation: (access, edit)
    const roleTemplates = [
        {
            id: 'super_admin',
            role_name: 'Super Admin',
            permissions: {
                tabs: {
                    dashboard:    { access: true,  edit: true  },
                    clients:      { access: true,  edit: true  },
                    projects:     { access: true,  edit: true  },
                    services:     { access: true,  edit: true  },
                    mrf_form:     { access: true,  edit: true  },
                    procurement:  { access: true,  edit: true  },
                    finance:      { access: true,  edit: true  },
                    role_config:  { access: true,  edit: true  }
                }
            }
        },
        {
            id: 'operations_admin',
            role_name: 'Operations Admin',
            permissions: {
                tabs: {
                    dashboard:    { access: true,  edit: false },
                    clients:      { access: true,  edit: true  },
                    projects:     { access: true,  edit: true  },
                    services:     { access: false, edit: false },
                    mrf_form:     { access: true,  edit: true  },
                    procurement:  { access: true,  edit: true  },
                    finance:      { access: true,  edit: false },
                    role_config:  { access: false, edit: false }
                }
            }
        },
        {
            id: 'operations_user',
            role_name: 'Operations User',
            permissions: {
                tabs: {
                    dashboard:    { access: true,  edit: false },
                    clients:      { access: true,  edit: false },
                    projects:     { access: true,  edit: false },
                    services:     { access: false, edit: false },
                    mrf_form:     { access: true,  edit: true  },
                    procurement:  { access: true,  edit: true  },
                    finance:      { access: true,  edit: false },
                    role_config:  { access: false, edit: false }
                }
            }
        },
        {
            id: 'services_admin',
            role_name: 'Services Admin',
            permissions: {
                tabs: {
                    dashboard:    { access: true,  edit: false },
                    clients:      { access: true,  edit: true  },
                    projects:     { access: false, edit: false },
                    services:     { access: true,  edit: true  },
                    mrf_form:     { access: true,  edit: true  },
                    procurement:  { access: true,  edit: true  },
                    finance:      { access: true,  edit: false },
                    role_config:  { access: false, edit: false }
                }
            }
        },
        {
            id: 'services_user',
            role_name: 'Services User',
            permissions: {
                tabs: {
                    dashboard:    { access: true,  edit: false },
                    clients:      { access: true,  edit: false },
                    projects:     { access: false, edit: false },
                    services:     { access: true,  edit: false },
                    mrf_form:     { access: true,  edit: true  },
                    procurement:  { access: true,  edit: true  },
                    finance:      { access: true,  edit: false },
                    role_config:  { access: false, edit: false }
                }
            }
        },
        {
            id: 'finance',
            role_name: 'Finance',
            permissions: {
                tabs: {
                    dashboard:    { access: true,  edit: false },
                    clients:      { access: false, edit: false },
                    projects:     { access: false, edit: false },
                    services:     { access: true,  edit: false },
                    mrf_form:     { access: false, edit: false },
                    procurement:  { access: false, edit: false },
                    finance:      { access: true,  edit: true  },
                    role_config:  { access: false, edit: false }
                }
            }
        },
        {
            id: 'procurement',
            role_name: 'Procurement',
            permissions: {
                tabs: {
                    dashboard:    { access: true,  edit: false },
                    clients:      { access: false, edit: false },
                    projects:     { access: false, edit: false },
                    services:     { access: false, edit: false },
                    mrf_form:     { access: true,  edit: true  },
                    procurement:  { access: true,  edit: true  },
                    finance:      { access: false, edit: false },
                    role_config:  { access: false, edit: false }
                }
            }
        }
    ];

    // Write role_templates documents
    let roleSuccessCount = 0;
    for (const role of roleTemplates) {
        try {
            await setDoc(doc(db, 'role_templates', role.id), {
                role_id: role.id,
                role_name: role.role_name,
                permissions: role.permissions
            });
            console.log(`[SeedDev] role_templates/${role.id}: OK`);
            roleSuccessCount++;
        } catch (err) {
            console.error(`[SeedDev] role_templates/${role.id}: FAILED`, err);
        }
    }

    // SEED INVITATION_CODE — 1 document using addDoc (auto-ID)
    try {
        await addDoc(collection(db, 'invitation_codes'), {
            code: 'DEV-SEED-2026',
            status: 'active',
            created_at: serverTimestamp(),
            created_by: 'seed-script',
            used_at: null,
            used_by: null
        });
        console.log('[SeedDev] invitation_codes: DEV-SEED-2026 created OK');
    } catch (err) {
        console.error('[SeedDev] invitation_codes: FAILED', err);
    }

    // SUMMARY
    console.log('[SeedDev] === Seed Complete ===');
    console.log(`[SeedDev] role_templates: ${roleSuccessCount} documents written`);
    console.log('[SeedDev] invitation_codes: 1 document created (code: DEV-SEED-2026)');
    console.log('[SeedDev] Next steps:');
    console.log('[SeedDev]   1. Open Firebase Console -> clmc-procurement-dev -> Firestore to verify documents');
    console.log('[SeedDev]   2. Log out and log back in to refresh permissions');
    console.log('[SeedDev]   3. Verify all nav items appear correctly for your Super Admin account');
})();
