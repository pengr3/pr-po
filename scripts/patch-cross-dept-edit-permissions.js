/**
 * CROSS-DEPARTMENT MEMBER-EDIT PERMISSION PATCH  (Quick 260627-kg0)
 *
 * WHY: Cross-department assignment parity (quick 260627-kg0) flips two member-edit flags in
 *      app/seed-roles.js so an assigned cross-dept *_user gets the in-page edit affordances and
 *      unified nav for the OTHER department:
 *        - operations_user.tabs.services.edit : false -> true
 *        - services_user.tabs.projects.edit   : false -> true
 *      The RUNNING app reads the LIVE role_templates Firestore docs, not the seed, so until these
 *      docs are patched the cross-dept nav link + member-edit controls stay hidden even though the
 *      firestore.rules (wave 1) and client gates (wave 3) already permit the writes.
 *
 * WHAT: SURGICAL, ADDITIVE merge. Sets ONLY the single `edit` boolean per role via a dotted field
 *       path, leaving `access` and every other tab/customization untouched. Idempotent (safe to
 *       re-run). Tab ACCESS was already `true` on both cross-dept tabs in seed-roles.js, so only the
 *       edit flag needs flipping.
 *
 * SCOPE: operations_admin / services_admin are NOT touched (department admins stay department-scoped,
 *        CONTEXT D-1). Only the two *_user roles change.
 *
 * USAGE (DEV first for UAT, then PROD as the standing rules-deploy debt is cleared):
 *   1. Log in as Super Admin (only super_admin may write role_templates — firestore.rules:168).
 *   2. Open the browser console on the running app.
 *   3. Paste this whole file, then run:  await patchCrossDeptEditPermissions()
 *   4. Hard-refresh. As a services_user the Projects nav + project member-edit controls should
 *      render; as an operations_user the Services nav + service member-edit controls should render.
 */

async function patchCrossDeptEditPermissions() {
    const { db, doc, getDoc, updateDoc, serverTimestamp } = await import('/app/firebase.js');

    // role -> dotted field path to flip to edit:true. Mirrors app/seed-roles.js (260627-kg0).
    const TARGETS = {
        operations_user: 'permissions.tabs.services.edit',  // ops user assigned to a service may edit it
        services_user:   'permissions.tabs.projects.edit',  // services user assigned to a project may edit it
    };

    const results = [];
    for (const [role, fieldPath] of Object.entries(TARGETS)) {
        const ref = doc(db, 'role_templates', role);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            console.warn(`⚠️  skip — role_templates/${role} does not exist`);
            results.push({ role, status: 'MISSING DOC' });
            continue;
        }
        await updateDoc(ref, {
            [fieldPath]: true,
            updated_at: serverTimestamp(),
        });
        console.log(`✅ patched role_templates/${role}  (${fieldPath} = true)`);
        results.push({ role, status: 'PATCHED', field: fieldPath });
    }

    console.table(results);
    console.log('\nNext: hard-refresh, then verify cross-dept nav + member-edit controls render for an assigned *_user.');
    return results;
}

if (typeof window !== 'undefined') window.patchCrossDeptEditPermissions = patchCrossDeptEditPermissions;
