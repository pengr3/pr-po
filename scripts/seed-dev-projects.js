// SEED DEV PROJECTS — Priority Feed test dataset (Phase 103 / 103.1)
//
// Wipes ALL documents in the `projects` collection on the DEV database, then seeds
// 10 projects spread across the lifecycle with backdated `status_changed_at` so every
// Priority Feed two-tier signal (watch / urgent / on-track + ambient + DLP-soon) is
// visible immediately. Uses ONLY real schema fields (createEngagement finalShape +
// the lifecycle/DLP fields written by the project-detail gates). No invented fields.
//
// USAGE:
//   1. python -m http.server 8000   (serve the app)
//   2. Open http://localhost:8000 and log in as a Super Admin dev account
//   3. Confirm the yellow "DEV ENVIRONMENT — clmc-procurement-dev" banner at the bottom
//      (no banner = you are on prod — DO NOT run this)
//   4. Open DevTools console (F12), paste this entire file, press Enter
//
// SAFETY: aborts unless hostname is localhost/127.0.0.1 AND the live Firestore
// projectId is clmc-procurement-dev. Runs under your logged-in admin auth (passes rules).

(async () => {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
        console.error('[SeedProjects] ABORTED — not localhost/127.0.0.1 (current:', host, '). Run on http://localhost:8000.');
        return;
    }

    const { db, auth } = await import('/app/firebase.js');
    const { collection, getDocs, doc, deleteDoc, addDoc } =
        await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    const projectId = db?.app?.options?.projectId;
    if (projectId !== 'clmc-procurement-dev') {
        console.error('[SeedProjects] ABORTED — live projectId is', projectId, '— expected clmc-procurement-dev. Refusing to touch a non-dev database.');
        return;
    }
    const me = auth?.currentUser;
    if (!me) {
        console.error('[SeedProjects] ABORTED — not logged in. Log in as Super Admin first.');
        return;
    }
    console.log('[SeedProjects] project:', projectId, '| user:', me.email, '— OK');

    // ---- date helpers ----
    const DAY = 86400000;
    const ago = n => new Date(Date.now() - n * DAY).toISOString();   // n days in the past (ISO — matches funnel/saveField convention)
    const ahead = n => new Date(Date.now() + n * DAY).toISOString(); // n days in the future
    const ymd = iso => iso.slice(0, 10);

    // ---- 1) WIPE existing projects ----
    const existing = await getDocs(collection(db, 'projects'));
    console.log(`[SeedProjects] Wiping ${existing.size} existing project(s)...`);
    let deleted = 0;
    for (const d of existing.docs) {
        try { await deleteDoc(doc(db, 'projects', d.id)); deleted++; }
        catch (err) { console.error('  delete failed', d.id, err?.code || err); }
    }
    console.log(`[SeedProjects] Deleted ${deleted} project(s). (Any orphaned subcollections under deleted docs are harmless — invisible without a parent.)`);

    // ---- optional: reference real clients if any exist (else clientless) ----
    let clients = [];
    try {
        const cs = await getDocs(collection(db, 'clients'));
        clients = cs.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (_) {}
    const pickClient = i => clients.length ? clients[i % clients.length] : null;

    // ---- shared shape ----
    const TRANCHES = [
        { label: 'Downpayment', percentage: 30, is_retention: false },
        { label: 'Progress Billing', percentage: 60, is_retention: false },
        { label: 'Retention', percentage: 10, is_retention: true }
    ];
    const personFields = {
        personnel_user_ids: [me.uid],
        personnel_names: [me.displayName || me.email || 'Seed Admin'],
        personnel_user_id: null, personnel_name: null, personnel: null
    };

    function mk(i, code, name, status, scAgo, extra) {
        const client = pickClient(i);
        const sc = ago(scAgo);
        return {
            project_code: code,
            project_name: name,
            client_id: client ? client.id : null,
            client_code: client ? (client.client_code || null) : null,
            project_status: status,
            budget: extra.budget ?? null,
            contract_cost: extra.contract_cost ?? null,
            location: extra.location || 'Metro Manila',
            active: true,
            created_at: ago(scAgo + 20),
            status_changed_at: sc,                       // Phase 103.1 stage clock
            updated_at: extra.updated_at || sc,
            collection_tranches: extra.collection_tranches || [],
            ...personFields,
            ...(extra.fields || {})
        };
    }

    // ---- 2) the 10 projects (expected feed tier in the comment) ----
    const SEED = [
        // 🟢 On Track + ambient "In proposal stage · 1d"  (For Proposal, 1d < 2 watch)
        mk(0, 'CLMC-DEV-001', 'Bonifacio Tower Fit-out', 'For Proposal', 1, { budget: 2400000 }),

        // 🔴 Needs Attention — "Sign-off overdue — 6d"  (Internal Approval, 6 > 5 urgent)
        mk(1, 'CLMC-DEV-002', 'Ayala North Annex Retrofit', 'Proposal for Internal Approval', 6, { budget: 5800000 }),

        // 🟠 Worth Watching — "Awaiting client response — 9d"  (Client Review, 7 < 9 < 14)
        mk(2, 'CLMC-DEV-003', 'Cebu IT Park Data Center', 'Proposal Under Client Review', 9, { budget: 3100000 }),

        // 🔴 Needs Attention — "Revision overdue — 4d"  (For Revision, 4 > 3 urgent)
        mk(3, 'CLMC-DEV-004', 'Davao Riverside Clubhouse', 'For Revision', 4, { budget: 1750000 }),

        // 🟠 Worth Watching — "Won — not yet mobilized — 4d"  (Client Approved, 3 < 4 < 7)
        mk(4, 'CLMC-DEV-005', 'Makati Mixed-Use Podium', 'Client Approved', 4, { contract_cost: 8100000 }),

        // 🔴 Needs Attention — "Mobilization overdue — 12d"  (For Mobilization, 12 > 10 urgent)
        mk(5, 'CLMC-DEV-006', 'Clark Logistics Warehouse', 'For Mobilization', 12, {
            contract_cost: 12500000,
            fields: { mobilization_started_at: ago(12) }
        }),

        // 🟠 Worth Watching — "Inspection pending — 3d"  (For Inspection, 2 < 3 < 5)
        mk(6, 'CLMC-DEV-007', 'Pasig Riverbank Survey', 'For Inspection', 3, { budget: 980000 }),

        // 🟢 On Track — active billing (mini-bar + tranche count); last_activity 1d ago
        mk(7, 'CLMC-DEV-008', 'Taguig BGC Curtain Wall', 'On-going', 30, {
            contract_cost: 39500000,
            collection_tranches: TRANCHES,
            updated_at: ago(1),
            fields: { project_started_at: ago(30), last_activity_at: ago(1) }
        }),

        // 🔴 Needs Attention — "No activity in 20 days"  (On-going, last_activity 20d > 14 urgent)
        mk(8, 'CLMC-DEV-009', 'San Juan Bridge Rehabilitation', 'On-going', 45, {
            contract_cost: 17200000,
            collection_tranches: TRANCHES,
            updated_at: ago(20),
            fields: { project_started_at: ago(45), last_activity_at: ago(20) }
        }),

        // 🟠 Worth Watching — "Retention release due in 10d"  (Completed, in-DLP, expires in 10 < 14)
        mk(9, 'CLMC-DEV-010', 'Quezon City Civic Center', 'Completed', 20, {
            contract_cost: 9000000,
            collection_tranches: TRANCHES,
            updated_at: ago(20),
            fields: {
                project_completed_at: ago(20),
                dlp_months: 12,
                dlp_start_date: ymd(ago(20)),
                dlp_expires_at: ahead(10),           // within DLP_SOON_DAYS (14) → DLP-soon watch
                retention_percentage: 10,
                retention_amount: 900000,
                retention_released_at: null
            }
        })
    ];

    // ---- 3) write them ----
    let created = 0;
    for (const p of SEED) {
        try { await addDoc(collection(db, 'projects'), p); created++; console.log(`  + ${p.project_code} · ${p.project_status}`); }
        catch (err) { console.error('  create failed', p.project_code, err?.code || err); }
    }

    console.log(`[SeedProjects] === Done === wiped ${deleted}, created ${created}/10.`);
    console.log('[SeedProjects] Expected Priority Feed: Needs Attention 4 (002/004/006/009) · Worth Watching 4 (003/005/007/010) · On Track 2 (001 ambient, 008).');
    console.log('[SeedProjects] Open the Projects view (hard-refresh) to see them.');
})();
