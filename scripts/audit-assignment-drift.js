// AUDIT ASSIGNMENT DRIFT — Phase 113 D-08 pre-deploy check
//
// WHAT THIS ANSWERS
// Phase 113 moves the source of truth for "what is this user assigned to" from the frozen
// `assigned_project_codes` / `assigned_service_codes` arrays on the USER document to live
// `personnel_user_ids` membership on the PROJECT / SERVICE documents.
//
// CONTEXT.md justifies shipping this with NO migration on one assumption:
//
//     "project and service documents were always written correctly under the old model,
//      so repointing reads self-heals historical assignments"
//
// If that assumption is wrong for any user — that is, their legacy array names a container that
// STILL EXISTS but does not list them in personnel_user_ids — then this phase SILENTLY REMOVES
// that user's access to it. No error, no toast; the item simply stops appearing.
//
// This script finds those users. It is READ-ONLY and writes nothing.
//
// WHY IT EXISTS
// During Phase 113 dev verification a services_user was found whose legacy array named 4 projects
// while the live cache resolved to zero. That turned out to be a FALSE ALARM — the codes were
// `CLMC-DEV-00x` from a superseded dev seed and no such documents remain, so zero was correct.
// But it demonstrated the shape of the risk, and dev data cannot tell you anything about
// production. Run this against production BEFORE deploying the tightened rules.
//
// USAGE
// 1. Open the app and log in as Super Admin (only Super Admin can read all three collections).
//    - To audit PRODUCTION, run from the deployed site, not localhost — localhost connects to
//      clmc-procurement-dev (app/firebase.js:56).
// 2. Open DevTools console (F12), paste this entire file, press Enter.
//
// INTERPRETING THE OUTPUT
//   DRIFT   — legacy array names an EXISTING container that lacks the user in personnel_user_ids.
//             This user LOSES access to it. Fix by adding them as Personnel on that container
//             (which is the correct record) before deploying.
//   STALE   — legacy array names a container that no longer exists. Harmless; nothing to restore.
//   OK      — legacy entry is backed by real personnel membership. Self-heals, as intended.
//   BONUS   — user has personnel membership NOT reflected in their legacy array. This is the
//             defect the phase FIXES (the services-user-project-hidden class): they gain access
//             they should always have had.

(async () => {
    const { db } = await import('/app/firebase.js');
    const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    if (!db) { console.error('[Drift] db unavailable — is the app running and are you logged in?'); return; }

    const user = window.getCurrentUser?.();
    console.log('[Drift] Acting as:', user?.email, '| role:', user?.role);
    if (user?.role !== 'super_admin') {
        console.error('[Drift] ABORTED: must run as super_admin — any other role cannot read all users/projects/services, and a partial read would under-report drift.');
        return;
    }

    let usersSnap, projectsSnap, servicesSnap;
    try {
        [usersSnap, projectsSnap, servicesSnap] = await Promise.all([
            getDocs(collection(db, 'users')),
            getDocs(collection(db, 'projects')),
            getDocs(collection(db, 'services'))
        ]);
    } catch (err) {
        console.error('[Drift] ABORTED: could not read all three collections:', err);
        return;
    }
    console.log(`[Drift] Scanned ${usersSnap.size} users, ${projectsSnap.size} projects, ${servicesSnap.size} services.`);

    // code -> { exists, personnel:Set }
    const build = (snap, codeField) => {
        const m = new Map();
        snap.forEach(d => {
            const data = d.data();
            const code = data[codeField];
            if (!code) return;
            m.set(code, { id: d.id, personnel: new Set(data.personnel_user_ids || []) });
        });
        return m;
    };
    const projects = build(projectsSnap, 'project_code');
    const services = build(servicesSnap, 'service_code');

    const rows = [];
    const summary = { DRIFT: 0, STALE: 0, OK: 0, BONUS: 0 };

    usersSnap.forEach(d => {
        const u = d.data();
        const uid = d.id;
        if (u.status !== 'active') return;             // inactive users cannot read anything anyway

        const dims = [
            { dim: 'project', legacy: u.assigned_project_codes || [], map: projects, seeAll: u.all_projects === true },
            { dim: 'service', legacy: u.assigned_service_codes || [], map: services, seeAll: u.all_services === true }
        ];

        for (const { dim, legacy, map, seeAll } of dims) {
            // legacy -> live
            for (const code of legacy) {
                const container = map.get(code);
                let verdict;
                if (!container) verdict = 'STALE';
                else if (container.personnel.has(uid)) verdict = 'OK';
                else verdict = 'DRIFT';
                summary[verdict]++;
                if (verdict !== 'OK') {
                    rows.push({ verdict, user: u.email || uid, role: u.role, dim, code, seeAllFlag: seeAll, note: verdict === 'DRIFT' ? 'LOSES ACCESS — add as Personnel before deploy' : 'container no longer exists — harmless' });
                }
            }
            // live -> legacy (the defect this phase fixes)
            for (const [code, container] of map) {
                if (container.personnel.has(uid) && !legacy.includes(code)) {
                    summary.BONUS++;
                    rows.push({ verdict: 'BONUS', user: u.email || uid, role: u.role, dim, code, seeAllFlag: seeAll, note: 'gains access the legacy array was hiding (phase fixes this)' });
                }
            }
        }
    });

    const drift = rows.filter(r => r.verdict === 'DRIFT');

    console.log('[Drift] Summary:', summary);
    if (drift.length) {
        console.error(`[Drift] ${drift.length} DRIFT finding(s) — these users LOSE access when Phase 113's tightened rules deploy:`);
        console.table(drift);
        console.error('[Drift] Resolve each by adding the user as Personnel on the named container, then re-run until DRIFT is 0.');
    } else {
        console.log('[Drift] No DRIFT: every legacy assignment is either backed by real personnel membership or points at a container that no longer exists. CONTEXT.md\'s no-migration assumption holds for this dataset.');
    }

    const others = rows.filter(r => r.verdict !== 'DRIFT');
    if (others.length) { console.log(`[Drift] ${others.length} non-blocking finding(s) (STALE / BONUS):`); console.table(others); }

    return { summary, drift, rows };
})();
