/**
 * PROCUREMENT SUB-TAB PERMISSION PATCH  (Phase 91 follow-up / v4.0 prod gap)
 *
 * WHY: Phase 91 added four sub-tab permission keys
 *      (procurement_request / procurement_mrfs / procurement_suppliers / procurement_records)
 *      to app/seed-roles.js, but the post-deploy migration (forceReseedRoleTemplates)
 *      was never run on PROD. Live role_templates lack these keys, so canEditTab()/
 *      hasTabAccess() return false for every role — collapsing the Procurement view
 *      (even for super_admin).
 *
 * WHAT: ADDITIVE merge. Sets ONLY the four sub-tab keys per role, via dotted field
 *       paths, leaving the 8 original tabs and any in-app customizations untouched.
 *       Safe to re-run (idempotent). Values mirror app/seed-roles.js exactly.
 *
 * USAGE (PROD or DEV):
 *   1. Log in as Super Admin.
 *   2. Open the browser console.
 *   3. Paste this whole file, then run:  await patchProcurementSubtabPermissions()
 *   4. Verify:  await window.verifyRoleTemplates()   // expect { valid: true, errors: [] }
 *   5. Hard-refresh.
 */

async function patchProcurementSubtabPermissions() {
    const { db, doc, getDoc, updateDoc, serverTimestamp } = await import('/app/firebase.js');

    // [access, edit] per role — copied verbatim from app/seed-roles.js
    const TARGETS = {
        super_admin:      { request: [true, true],   mrfs: [true, true],  suppliers: [true, true],  records: [true, true]  },
        operations_admin: { request: [true, true],   mrfs: [true, true],  suppliers: [true, true],  records: [true, true]  },
        operations_user:  { request: [true, true],   mrfs: [true, false], suppliers: [true, false], records: [true, false] },
        services_admin:   { request: [true, true],   mrfs: [true, true],  suppliers: [true, true],  records: [true, true]  },
        services_user:    { request: [true, true],   mrfs: [true, false], suppliers: [true, false], records: [true, false] },
        finance:          { request: [false, false], mrfs: [false, false],suppliers: [false, false],records: [false, false]},
        procurement:      { request: [false, false], mrfs: [true, true],  suppliers: [true, true],  records: [true, true]  },
    };

    const results = [];
    for (const [role, t] of Object.entries(TARGETS)) {
        const ref = doc(db, 'role_templates', role);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            console.warn(`⚠️  skip — role_templates/${role} does not exist`);
            results.push({ role, status: 'MISSING DOC' });
            continue;
        }
        await updateDoc(ref, {
            'permissions.tabs.procurement_request':   { access: t.request[0],   edit: t.request[1]   },
            'permissions.tabs.procurement_mrfs':      { access: t.mrfs[0],      edit: t.mrfs[1]      },
            'permissions.tabs.procurement_suppliers': { access: t.suppliers[0], edit: t.suppliers[1] },
            'permissions.tabs.procurement_records':   { access: t.records[0],   edit: t.records[1]   },
            updated_at: serverTimestamp(),
        });
        console.log(`✅ patched role_templates/${role}`);
        results.push({ role, status: 'PATCHED' });
    }

    console.table(results);
    console.log('\nNext: await window.verifyRoleTemplates()  → expect { valid:true, errors:[] }, then hard-refresh.');
    return results;
}

if (typeof window !== 'undefined') window.patchProcurementSubtabPermissions = patchProcurementSubtabPermissions;
