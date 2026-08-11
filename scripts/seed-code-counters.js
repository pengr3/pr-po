// SEED CLMC CODE COUNTERS — Phase 113 D-16 migration
//
// WHAT THIS DOES
// Phase 113 replaced the CLMC code generator's cross-collection range scan with an atomic
// counter document per client/year (`code_counters/{clientCode}_{year}`, field `last_seq`).
// This script creates those counters from the codes already in use, so the generator never has
// to derive a starting value at runtime.
//
// WHY IT MATTERS
// The counter is AUTHORITATIVE. If a counter is missing or seeded too LOW, the next generated
// code collides with an existing project or service. A duplicate CLMC code is unrecoverable
// once other documents (MRFs, PRs, POs, collectibles) reference it. This script therefore:
//   - seeds last_seq to the MAXIMUM sequence found across BOTH collections for that client/year
//   - never lowers an existing counter (the Firestore rule enforces monotonicity too)
//   - runs in DRY-RUN mode by default and prints exactly what it would write
//
// USAGE
// 1. python -m http.server 8000  (or npx http-server)
// 2. Open http://localhost:8000 and log in as Super Admin
//    - localhost/127.0.0.1 connects to clmc-procurement-dev (app/firebase.js:56).
//      To seed PRODUCTION you must run this from the deployed site, logged in as Super Admin.
//    - Only Super Admin can read the whole `projects` and `services` collections, which this
//      script requires. Running it as any other role produces an incomplete or failed scan.
// 3. Open DevTools console (F12)
// 4. Paste this entire file and press Enter        -> DRY RUN, writes nothing
// 5. Read the report carefully. Then re-run with:
//        window.__seedCodeCounters({ apply: true })
//
// SAFE TO RE-RUN. Re-running after a successful apply is a no-op for unchanged data, and will
// raise a counter that has fallen behind (which can only happen if codes were created by some
// path that bypassed the generator).

(async () => {
    const { db } = await import('/app/firebase.js');
    const { collection, getDocs, doc, getDoc, setDoc, updateDoc, serverTimestamp } =
        await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    if (!db) {
        console.error('[SeedCounters] db unavailable — make sure the app is running and you are logged in.');
        return;
    }

    // Counter document key. Defined INLINE rather than imported, deliberately.
    //
    // An earlier version imported clmcCounterId from /app/utils.js to guarantee this script and
    // the generator could never disagree about the key. That turned out to be fragile: browsers
    // cache ES modules aggressively, so a tab holding a pre-Phase-113 utils.js threw
    // "clmcCounterId is not a function" partway through the scan. Defining it here makes the
    // migration self-contained and immune to module staleness.
    //
    // The drift risk that motivated the import is handled by the cross-check below instead: if
    // the import succeeds, the two implementations are compared on real input and any mismatch
    // ABORTS. Must stay identical to clmcCounterId() in app/utils.js.
    const counterKey = (clientCode, year) => `${clientCode}_${year}`;

    // Cross-check against utils.js when it is loadable, and use it as a staleness probe.
    try {
        const utils = await import('/app/utils.js');
        if (typeof utils.clmcCounterId !== 'function') {
            console.warn(
                '[SeedCounters] app/utils.js loaded but does not export clmcCounterId. That export ' +
                'was added in Phase 113 — this tab is almost certainly running a CACHED copy of ' +
                'utils.js, which means the page is also running the OLD code generators. ' +
                'Hard-refresh (Ctrl+Shift+R) before doing anything else. Proceeding with the ' +
                'inline key, which is correct regardless.'
            );
        } else if (utils.clmcCounterId('ACME', 2026) !== counterKey('ACME', 2026)) {
            console.error(
                '[SeedCounters] ABORTED: key format drift. app/utils.js produces ' +
                `"${utils.clmcCounterId('ACME', 2026)}" but this script produces "${counterKey('ACME', 2026)}". ` +
                'Seeding with a different key than the generator reads would create a second, empty ' +
                'counter and restart the sequence at 001, minting duplicate CLMC codes. ' +
                'Reconcile the two before re-running.'
            );
            return;
        }
    } catch (err) {
        console.warn('[SeedCounters] Could not import app/utils.js to cross-check the key format:', err?.message || err);
        console.warn('[SeedCounters] Proceeding with the inline key. Verify app/utils.js clmcCounterId() still returns `${clientCode}_${year}`.');
    }

    const CODE_RE = /^CLMC-(.+)-(\d{4})(\d{3})$/;

    async function run({ apply = false } = {}) {
        const mode = apply ? 'APPLY' : 'DRY RUN';
        console.log(`[SeedCounters] ===== ${mode} =====`);

        const user = window.getCurrentUser?.();
        console.log('[SeedCounters] Acting as:', user?.email, '| role:', user?.role);
        if (user?.role !== 'super_admin') {
            console.error('[SeedCounters] ABORTED: must run as super_admin — any other role cannot read both collections in full, which would under-seed counters and cause duplicate codes.');
            return;
        }

        // --- Scan both collections -------------------------------------------------------
        let projectsSnap, servicesSnap;
        try {
            [projectsSnap, servicesSnap] = await Promise.all([
                getDocs(collection(db, 'projects')),
                getDocs(collection(db, 'services'))
            ]);
        } catch (err) {
            console.error('[SeedCounters] ABORTED: could not read both collections in full:', err);
            return;
        }
        console.log(`[SeedCounters] Scanned ${projectsSnap.size} projects, ${servicesSnap.size} services.`);

        // --- Derive max sequence per client/year -----------------------------------------
        // Keyed off the CODE ITSELF, not the client_code field, so a document whose client_code
        // drifted from its code still contributes to the right counter. The code is what must
        // not collide.
        const maxByKey = new Map();   // "CLIENT_YYYY" -> { clientCode, year, max, sources[] }
        const malformed = [];

        function ingest(docId, code, origin) {
            if (!code) return;                       // codeless project (Phase 78) — nothing to reserve
            const m = String(code).match(CODE_RE);
            if (!m) { malformed.push({ origin, docId, code }); return; }
            const [, clientCode, year, seqStr] = m;
            const seq = parseInt(seqStr, 10);
            const key = counterKey(clientCode, Number(year));
            const cur = maxByKey.get(key);
            if (!cur || seq > cur.max) {
                maxByKey.set(key, { clientCode, year: Number(year), max: seq, sources: [`${origin}:${docId}=${code}`] });
            } else if (seq === cur.max) {
                cur.sources.push(`${origin}:${docId}=${code}`);
            }
        }

        projectsSnap.forEach(d => ingest(d.id, d.data().project_code, 'project'));
        servicesSnap.forEach(d => ingest(d.id, d.data().service_code, 'service'));

        if (malformed.length) {
            console.warn(`[SeedCounters] ${malformed.length} document(s) have a code that does not match CLMC-{client}-{YYYY}{NNN} and were NOT counted. Review these — if any is a real code, its counter will be under-seeded:`);
            console.table(malformed);
        }

        // --- Detect existing duplicates (pre-existing damage, not caused by this migration) --
        const dupes = [];
        for (const [key, v] of maxByKey) {
            if (v.sources.length > 1) dupes.push({ key, seq: v.max, holders: v.sources.join('  |  ') });
        }
        if (dupes.length) {
            console.warn('[SeedCounters] Documents already SHARE a CLMC code (pre-existing, not caused by this script). Seeding still proceeds — the counter moves past them — but these should be investigated:');
            console.table(dupes);
        }

        // --- Compare against existing counters --------------------------------------------
        const plan = [];
        for (const [key, v] of maxByKey) {
            const ref = doc(db, 'code_counters', key);
            const snap = await getDoc(ref);
            const existing = snap.exists() ? Number(snap.data().last_seq) : null;
            let action;
            if (existing === null) action = 'CREATE';
            else if (existing < v.max) action = 'RAISE';
            else action = 'OK';
            plan.push({ key, clientCode: v.clientCode, year: v.year, existing, target: v.max, action });
        }
        plan.sort((a, b) => a.key.localeCompare(b.key));

        console.log('[SeedCounters] Plan:');
        console.table(plan);
        const todo = plan.filter(p => p.action !== 'OK');
        console.log(`[SeedCounters] ${plan.length} client/year pairs in use | ${todo.length} need writing | ${plan.length - todo.length} already correct.`);

        if (!apply) {
            console.log('[SeedCounters] DRY RUN complete — nothing was written.');
            console.log('[SeedCounters] To apply: window.__seedCodeCounters({ apply: true })');
            return { plan, malformed, dupes, applied: 0 };
        }

        // --- Apply -------------------------------------------------------------------------
        let applied = 0;
        const failures = [];
        for (const p of todo) {
            const ref = doc(db, 'code_counters', p.key);
            try {
                if (p.action === 'CREATE') {
                    await setDoc(ref, {
                        last_seq: p.target,
                        client_code: p.clientCode,
                        year: p.year,
                        created_at: serverTimestamp(),
                        updated_at: serverTimestamp()
                    });
                } else {
                    await updateDoc(ref, { last_seq: p.target, updated_at: serverTimestamp() });
                }
                applied++;
                console.log(`[SeedCounters] ${p.action} ${p.key} -> last_seq=${p.target}`);
            } catch (err) {
                console.error(`[SeedCounters] FAILED ${p.action} ${p.key}:`, err);
                failures.push({ key: p.key, error: err?.code || err?.message || String(err) });
            }
        }

        console.log(`[SeedCounters] ===== APPLY complete: ${applied}/${todo.length} written =====`);
        if (failures.length) {
            console.error('[SeedCounters] FAILURES — these client/year pairs are still unseeded. Creating an engagement for them will throw "counter is not initialised" until fixed:');
            console.table(failures);
        } else {
            console.log('[SeedCounters] All counters seeded. Re-run in dry-run mode to confirm every row reads OK.');
        }
        return { plan, malformed, dupes, applied, failures };
    }

    window.__seedCodeCounters = run;
    return run({ apply: false });
})();
