// =============================================================================
// CLMC DEMO SEED — "07/06 Demo"   (DEV DATABASE ONLY — clmc-procurement-dev)
// =============================================================================
// Wipes operational + reference data, then seeds a curated mock dataset that
// walks the FULL project & service lifecycle, with Gantt charts, costs,
// collectibles (billing) and payables on the flagship engagements — so the app
// can be demoed end-to-end.
//
// HOW TO RUN (safe path — physically cannot touch prod):
//   1. From the repo root:  python -m http.server 8000   (or: npx http-server -p 8000)
//   2. Open http://localhost:8000  and log in as a dev Super Admin
//   3. Confirm the yellow "DEV ENVIRONMENT — clmc-procurement-dev" banner (bottom)
//   4. Open DevTools console (F12), paste this whole file, press Enter
//
// GUARDS: aborts unless hostname is localhost/127.0.0.1 AND the live Firestore
// projectId === 'clmc-procurement-dev' AND you are logged in. Runs under your
// admin auth so it passes security rules.
// =============================================================================

(async () => {
  // ---- SAFETY GUARDS ---------------------------------------------------------
  const host = window.location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    console.error('[DemoSeed] ABORTED — not localhost/127.0.0.1 (current:', host, ').');
    return;
  }
  const { db, auth } = await import('/app/firebase.js');
  const fs = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  const { collection, getDocs, doc, setDoc, addDoc, deleteDoc, writeBatch, serverTimestamp } = fs;

  const projectId = db?.app?.options?.projectId;
  if (projectId !== 'clmc-procurement-dev') {
    console.error('[DemoSeed] ABORTED — live projectId is', projectId, '— expected clmc-procurement-dev. Refusing to touch a non-dev database.');
    return;
  }
  const me = auth?.currentUser;
  if (!me) { console.error('[DemoSeed] ABORTED — not logged in. Log in as Super Admin first.'); return; }
  console.log('%c[DemoSeed] project: ' + projectId + ' | user: ' + me.email + ' — GUARDS PASSED', 'color:#059669;font-weight:bold');

  // ---- date helpers ----------------------------------------------------------
  const DAY = 86400000;
  const NOW = Date.now();
  const iso = n => new Date(NOW - n * DAY).toISOString();               // full ISO, n days ago
  const ymd = n => new Date(NOW + n * DAY).toISOString().slice(0, 10);  // 'YYYY-MM-DD', n days from now (n<0 = past)
  const dts = n => new Date(NOW - n * DAY).toISOString().slice(0, 19).replace('T', ' '); // 'YYYY-MM-DD HH:MM:SS', n days ago
  const PERS = {
    personnel_user_ids: [me.uid],
    personnel_names: [me.displayName || me.email || 'Demo Admin'],
    personnel_user_id: null, personnel_name: null, personnel: null
  };
  const ACTOR = me.displayName || me.email || 'Demo Admin';

  // ---- 1) WIPE ---------------------------------------------------------------
  // Preserve: users, role_templates, invitation_codes (auth + permissions).
  const WIPE = ['project_tasks', 'service_tasks', 'project_iterations', 'rfps',
                'collectibles', 'billing_requests', 'pos', 'prs', 'transport_requests',
                'mrfs', 'deleted_mrfs', 'notifications', 'edit_history',
                'projects', 'services', 'clients', 'suppliers'];
  console.log('[DemoSeed] Wiping', WIPE.length, 'collections (users / role_templates / invitation_codes preserved)...');
  for (const name of WIPE) {
    try {
      const snap = await getDocs(collection(db, name));
      let n = 0;
      for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
        n += Math.min(450, snap.docs.length - i);
      }
      console.log(`  wiped ${name}: ${n}`);
    } catch (e) { console.error(`  wipe ${name} FAILED:`, e?.code || e?.message || e); }
  }
  // (projects/{id}/baselines + journal subcollections orphaned by parent delete — harmless.)

  // ===========================================================================
  // 2) CLIENTS  (list reads company_name; engagement picker reads client_name — set both)
  // ===========================================================================
  const CLIENTS = [
    { code: 'ALV', name: 'Alveo Land Corporation',   contact: 'Marco Reyes',   phone: '+63 2 8848 5000', email: 'marco.reyes@alveoland.com' },
    { code: 'MEG', name: 'Megaworld Corporation',    contact: 'Lianne Tan',    phone: '+63 2 8894 6300', email: 'lianne.tan@megaworld.com' },
    { code: 'AYA', name: 'Ayala Land Premier',       contact: 'Paolo Mendoza', phone: '+63 2 7908 3000', email: 'paolo.mendoza@ayalaland.com' },
    { code: 'DMC', name: 'DMCI Homes',               contact: 'Grace Villanueva', phone: '+63 2 5324 8888', email: 'grace.v@dmcihomes.com' },
    { code: 'SMD', name: 'SM Development Corporation', contact: 'Ryan Uy',      phone: '+63 2 8857 0100', email: 'ryan.uy@smdc.com' },
    { code: 'RLC', name: 'Robinsons Land Corporation', contact: 'Bea Santos',  phone: '+63 2 8397 1888', email: 'bea.santos@robinsonsland.com' }
  ];
  const clientMap = {}; // code -> { id, code, name }
  for (const c of CLIENTS) {
    const ref = await addDoc(collection(db, 'clients'), {
      client_code: c.code,
      company_name: c.name,
      client_name: c.name,        // alias — engagement client-picker reads client_name
      contact_person: c.contact,
      phone: c.phone,
      email: c.email,
      active: true,
      created_at: iso(120)
    });
    clientMap[c.code] = { id: ref.id, code: c.code, name: c.name };
  }
  console.log(`  + clients: ${CLIENTS.length}`);

  // ===========================================================================
  // 3) SUPPLIERS
  // ===========================================================================
  const SUPPLIERS = [
    { name: 'Fil-Steel Trading Corp.',   contact: 'Dennis Cruz',   email: 'sales@filsteel.ph',   phone: '+63 2 8712 3344', categories: ['Structural', 'Steel'] },
    { name: 'MegaConcrete Supply Inc.',  contact: 'Rowena Lim',    email: 'orders@megaconcrete.ph', phone: '+63 2 8455 2211', categories: ['Concrete', 'Aggregates'] },
    { name: 'BrightVolt Electrical',     contact: 'Alvin Garcia',  email: 'alvin@brightvolt.ph', phone: '+63 2 8990 7788', categories: ['Electrical', 'Lighting'] },
    { name: 'AquaFlow Plumbing Supply',  contact: 'Jenny Ramos',   email: 'jenny@aquaflow.ph',   phone: '+63 2 8321 6655', categories: ['Plumbing', 'Sanitary'] },
    { name: 'ProTools Equipment Rental', contact: 'Kevin Dela Rosa', email: 'rentals@protools.ph', phone: '+63 2 8677 9900', categories: ['Equipment', 'Rental'] },
    { name: 'SafeGuard Safety Supplies', contact: 'Mia Fernandez', email: 'mia@safeguard.ph',    phone: '+63 2 8244 1122', categories: ['Safety', 'PPE'] }
  ];
  for (const s of SUPPLIERS) {
    await addDoc(collection(db, 'suppliers'), {
      supplier_name: s.name, contact_person: s.contact, email: s.email, phone: s.phone,
      categories: s.categories, created_at: iso(100)
    });
  }
  console.log(`  + suppliers: ${SUPPLIERS.length}`);

  // ===========================================================================
  // helpers: engagement + gantt + collectible builders
  // ===========================================================================
  async function addProject({ code, name, clientCode, status, scAgo, budget = null, contract = null, location, tranches = [], extra = {} }) {
    const cl = clientCode ? clientMap[clientCode] : null;
    const ref = await addDoc(collection(db, 'projects'), {
      project_code: code, project_name: name,
      client_id: cl ? cl.id : null, client_code: cl ? cl.code : null,
      project_status: status,
      budget, contract_cost: contract,
      location: location || null,
      ...PERS, active: true,
      created_at: iso(scAgo + 15),
      status_changed_at: iso(scAgo),
      updated_at: iso(extra.updatedAgo ?? scAgo),
      collection_tranches: tranches,
      ...extra.fields
    });
    console.log(`    · project ${code} — ${status}`);
    return { id: ref.id, code, name };
  }

  async function addService({ code, name, clientCode, type, status, scAgo, budget = null, contract = null, location, tranches = [], extra = {} }) {
    const cl = clientMap[clientCode];
    const ref = await addDoc(collection(db, 'services'), {
      service_code: code, service_name: name, service_type: type,
      client_id: cl.id, client_code: cl.code,
      project_status: status,
      budget, contract_cost: contract,
      location: location || null,
      ...PERS, active: true,
      created_at: iso(scAgo + 15),
      status_changed_at: iso(scAgo),
      updated_at: iso(extra.updatedAgo ?? scAgo),
      collection_tranches: tranches,
      ...extra.fields
    });
    console.log(`    · service ${code} — ${status}`);
    return { id: ref.id, code, name };
  }

  // taskDef: { name, s, e, prog=0, ms=false, parent=null(0-based idx), deps=[](0-based idxs), bs, be, res='' }
  function buildTaskDocs(kind, engId, engCode, defs) {
    const idField = kind === 'project' ? 'project_id' : 'service_id';
    const codeField = kind === 'project' ? 'project_code' : 'service_code';
    return defs.map((d, i) => ({
      task_id: `TASK-${engCode}-${i + 1}`,
      [idField]: engId,
      [codeField]: engCode,
      parent_task_id: d.parent != null ? `TASK-${engCode}-${d.parent + 1}` : null,
      name: d.name,
      start_date: ymd(d.s), end_date: ymd(d.e),
      description: d.desc || '',
      progress: d.prog || 0,
      is_milestone: !!d.ms,
      dependencies: (d.deps || []).map(di => `TASK-${engCode}-${di + 1}`),
      assignees: [], resources: d.res || '',
      row_order: i + 1,
      created_at: serverTimestamp(), updated_at: serverTimestamp()
    }));
  }

  async function seedProjectPlan(engId, engCode, defs, { baselineLabel, iterationLabel } = {}) {
    const taskCol = 'project_tasks';
    const docs = buildTaskDocs('project', engId, engCode, defs);
    for (const t of docs) await setDoc(doc(db, taskCol, t.task_id), t);
    // baseline (subcollection) — map task_id -> {start,end}, using bs/be if given else s/e
    if (baselineLabel) {
      const map = {};
      defs.forEach((d, i) => { map[`TASK-${engCode}-${i + 1}`] = { start: ymd(d.bs ?? d.s), end: ymd(d.be ?? d.e) }; });
      await addDoc(collection(db, 'projects', engId, 'baselines'), { label: baselineLabel, created_at: serverTimestamp(), tasks: map });
    }
    // iteration (top-level snapshot)
    if (iterationLabel) {
      await addDoc(collection(db, 'project_iterations'), {
        project_id: engId, label: iterationLabel, saved_at: serverTimestamp(), auto: false,
        tasks: docs.map(t => ({
          id: t.task_id, task_id: t.task_id, project_id: t.project_id, project_code: t.project_code,
          name: t.name, start_date: t.start_date, end_date: t.end_date, progress: t.progress,
          is_milestone: t.is_milestone, parent_task_id: t.parent_task_id, dependencies: t.dependencies,
          assignees: [], row_order: t.row_order, notes: '', status: null,
          created_at: null, updated_at: null, created_by: null
        }))
      });
    }
    console.log(`      gantt: ${docs.length} tasks${baselineLabel ? ' + baseline' : ''}${iterationLabel ? ' + iteration' : ''}`);
  }

  async function seedServicePlan(engId, engCode, defs) {
    const docs = buildTaskDocs('service', engId, engCode, defs);
    for (const t of docs) await setDoc(doc(db, 'service_tasks', t.task_id), t);
    console.log(`      service gantt: ${docs.length} tasks`);
  }

  // collectible: creates one collectibles doc for a tranche of a project/service.
  let collSeq = {};
  async function addCollectible(scope, { trancheIndex, label, pct, contract, dueIn, payments = [], desc = '' }) {
    const isProject = scope.kind === 'project';
    const codeKey = scope.code;
    collSeq[codeKey] = (collSeq[codeKey] || 0) + 1;
    const amount = Math.round(pct / 100 * contract);
    await addDoc(collection(db, 'collectibles'), {
      coll_id: `COLL-${scope.code}-${collSeq[codeKey]}`,
      department: isProject ? 'projects' : 'services',
      project_id: isProject ? scope.id : '', project_code: isProject ? scope.code : '', project_name: isProject ? scope.name : '',
      service_id: isProject ? '' : scope.id, service_code: isProject ? '' : scope.code, service_name: isProject ? '' : scope.name,
      tranche_index: trancheIndex, tranche_label: label, tranche_percentage: pct,
      amount_requested: amount, contract_cost_at_creation: contract,
      description: desc, due_date: ymd(dueIn),
      payment_records: payments,
      created_by_user_id: me.uid, created_by_name: ACTOR,
      date_created: serverTimestamp()
    });
    return amount;
  }
  const pay = (amount, dateAgo, method, ref, voided = false) => voided
    ? { payment_id: `PAY-${NOW - dateAgo * DAY}`, amount, date: ymd(-dateAgo), method, reference: ref || '', status: 'voided', voided: true, voided_by: me.uid, voided_at: iso(dateAgo - 1), void_reason: 'Duplicate entry — corrected' }
    : { payment_id: `PAY-${NOW - dateAgo * DAY}`, amount, date: ymd(-dateAgo), method, reference: ref || '', status: 'active', recorded_at: iso(dateAgo) };

  // Standard 4-tranche billing plan (sums to 100, one retention)
  const TRANCHES_4 = [
    { label: 'Downpayment', percentage: 30, is_retention: false },
    { label: 'Progress Billing 1', percentage: 30, is_retention: false },
    { label: 'Progress Billing 2', percentage: 30, is_retention: false },
    { label: 'Retention', percentage: 10, is_retention: true }
  ];
  const TRANCHES_3 = [
    { label: 'Down Payment', percentage: 30, is_retention: false },
    { label: 'Progress Billing', percentage: 60, is_retention: false },
    { label: 'Retention', percentage: 10, is_retention: true }
  ];

  // reusable gantt templates ---------------------------------------------------
  const draftPlan = [
    { name: 'Scope & requirements study', s: 2, e: 9, prog: 0 },
    { name: 'Preliminary design', s: 10, e: 24, prog: 0, deps: [0] },
    { name: 'Cost estimate & proposal', s: 25, e: 34, prog: 0, deps: [1] },
    { name: 'Milestone: Proposal ready', s: 35, e: 35, ms: true, deps: [2] }
  ];
  const plannedPlan = [
    { name: 'Phase 1 — Mobilization', s: 0, e: 20 },
    { name: 'Site setup & clearing', parent: 0, s: 0, e: 10, prog: 5, bs: 0, be: 8 },
    { name: 'Survey & staking', parent: 0, s: 11, e: 20, prog: 0, deps: [1], bs: 9, be: 18 },
    { name: 'Phase 2 — Structure', s: 21, e: 70 },
    { name: 'Foundation works', parent: 3, s: 21, e: 45, prog: 0, deps: [2], bs: 19, be: 42 },
    { name: 'Superstructure', parent: 3, s: 46, e: 70, prog: 0, deps: [4], bs: 43, be: 66 },
    { name: 'Milestone: Topping-off', s: 70, e: 70, ms: true, deps: [5] }
  ];

  // ===========================================================================
  // 4) PROJECTS — one per lifecycle stage (+ a 2nd On-going to show the "quiet" signal)
  // ===========================================================================
  console.log('[DemoSeed] Seeding projects...');

  // (1) For Inspection — plan hidden; watch (2<3<5)
  await addProject({ code: 'CLMC-DMC-2026001', name: 'Pasig Riverbank Slope Protection', clientCode: 'DMC', status: 'For Inspection', scAgo: 3, budget: 980000, location: 'Pasig City' });

  // (2) For Proposal — on-track ambient (1d); draft gantt
  const pProp = await addProject({ code: 'CLMC-ALV-2026002', name: 'Alveo Vertis Tower Fit-Out', clientCode: 'ALV', status: 'For Proposal', scAgo: 1, budget: 2400000, location: 'Quezon City' });
  await seedProjectPlan(pProp.id, pProp.code, draftPlan);

  // (3) Proposal for Internal Approval — urgent (6>5)
  const pIntl = await addProject({ code: 'CLMC-MEG-2026003', name: 'Megaworld Uptown Annex Retrofit', clientCode: 'MEG', status: 'Proposal for Internal Approval', scAgo: 6, budget: 5800000, location: 'Taguig City' });
  await seedProjectPlan(pIntl.id, pIntl.code, draftPlan);

  // (4) Proposal Under Client Review — watch (7<9<14)
  const pRev = await addProject({ code: 'CLMC-AYA-2026004', name: 'Ayala IT Hub Data Center', clientCode: 'AYA', status: 'Proposal Under Client Review', scAgo: 9, budget: 3100000, location: 'Cebu City' });
  await seedProjectPlan(pRev.id, pRev.code, draftPlan);

  // (5) For Revision — urgent (4>3)
  const pRvn = await addProject({ code: 'CLMC-DMC-2026005', name: 'DMCI Riverfront Clubhouse', clientCode: 'DMC', status: 'For Revision', scAgo: 4, budget: 1750000, location: 'Davao City' });
  await seedProjectPlan(pRvn.id, pRvn.code, draftPlan);

  // (6) Client Approved — watch (3<4<7); contracted, planned gantt + baseline
  const pAppr = await addProject({ code: 'CLMC-SMD-2026006', name: 'SMDC Mixed-Use Podium', clientCode: 'SMD', status: 'Client Approved', scAgo: 4, budget: 7800000, contract: 8100000, tranches: TRANCHES_4, location: 'Pasay City' });
  await seedProjectPlan(pAppr.id, pAppr.code, plannedPlan, { baselineLabel: 'Contract Baseline' });

  // (7) For Mobilization — urgent (12>10); planned gantt
  const pMob = await addProject({ code: 'CLMC-RLC-2026007', name: 'Robinsons Logistics Warehouse', clientCode: 'RLC', status: 'For Mobilization', scAgo: 12, budget: 12000000, contract: 12500000, tranches: TRANCHES_4, location: 'Calamba, Laguna', extra: { fields: { mobilization_started_at: dts(12) } } });
  await seedProjectPlan(pMob.id, pMob.code, plannedPlan, { baselineLabel: 'Contract Baseline' });

  // (8) On-going — FLAGSHIP "whole picture": full gantt + collectibles + costs + payables
  const CONTRACT8 = 39500000;
  const flag = await addProject({
    code: 'CLMC-ALV-2026008', name: 'Alveo BGC Curtain Wall Package', clientCode: 'ALV',
    status: 'On-going', scAgo: 60, budget: 38000000, contract: CONTRACT8, tranches: TRANCHES_4, location: 'Bonifacio Global City',
    extra: { updatedAgo: 1, fields: { project_started_at: dts(58), last_activity_at: iso(1) } }
  });
  const flagPlan = [
    { name: 'Phase 1 — Design & Shop Drawings', s: -60, e: -30 },
    { name: 'Curtain wall system design', parent: 0, s: -60, e: -46, prog: 100, bs: -60, be: -48, res: 'Design team' },
    { name: 'Shop drawings & client approval', parent: 0, s: -45, e: -31, prog: 100, deps: [1], bs: -47, be: -33, res: 'Design team' },
    { name: 'Milestone: Design Approved', s: -30, e: -30, ms: true, deps: [2] },
    { name: 'Phase 2 — Fabrication', s: -29, e: -3 },
    { name: 'Aluminum framing fabrication', parent: 4, s: -29, e: -6, prog: 90, deps: [3], bs: -29, be: -8, res: 'Fil-Steel' },
    { name: 'Glass procurement & delivery', parent: 4, s: -25, e: 3, prog: 60, deps: [3], bs: -25, be: 0, res: 'Import' },
    { name: 'Mock-up performance testing', parent: 4, s: -10, e: -3, prog: 50, deps: [5], res: 'QA/QC' }, // OVERDUE (end past, <100%)
    { name: 'Phase 3 — Installation', s: -2, e: 25 },
    { name: 'Curtain wall installation (L1–L20)', parent: 8, s: -2, e: 14, prog: 20, deps: [6, 7], bs: 0, be: 12, res: 'Install crew A/B' },
    { name: 'Sealing & weatherproofing', parent: 8, s: 15, e: 24, prog: 0, deps: [9], res: 'Install crew A' },
    { name: 'Milestone: Package Turnover', s: 25, e: 25, ms: true, deps: [10] }
  ];
  await seedProjectPlan(flag.id, flag.code, flagPlan, { baselineLabel: 'As-Sold Baseline', iterationLabel: 'Rev A — As-planned' });
  // collectibles: DP fully paid; PB1 partial (+ one voided); PB2 pending; retention not yet billed
  await addCollectible({ kind: 'project', ...flag }, { trancheIndex: 0, label: 'Downpayment', pct: 30, contract: CONTRACT8, dueIn: -50, desc: 'Downpayment upon contract signing',
    payments: [pay(11850000, 48, 'Bank Transfer', 'BDO-CW-0001')] });
  await addCollectible({ kind: 'project', ...flag }, { trancheIndex: 1, label: 'Progress Billing 1', pct: 30, contract: CONTRACT8, dueIn: -5, desc: '50% fabrication complete',
    payments: [pay(7000000, 8, 'Check', 'CHK-2201'), pay(1000000, 12, 'Cash', '', true)] });
  await addCollectible({ kind: 'project', ...flag }, { trancheIndex: 2, label: 'Progress Billing 2', pct: 30, contract: CONTRACT8, dueIn: 30, desc: '90% installation complete', payments: [] });

  // (9) On-going #2 — "gone quiet" urgent signal (last_activity 20d > 14)
  const CONTRACT9 = 17200000;
  const flag2 = await addProject({
    code: 'CLMC-MEG-2026009', name: 'Megaworld San Juan Bridge Rehabilitation', clientCode: 'MEG',
    status: 'On-going', scAgo: 45, budget: 16500000, contract: CONTRACT9, tranches: TRANCHES_4, location: 'San Juan City',
    extra: { updatedAgo: 20, fields: { project_started_at: dts(43), last_activity_at: iso(20) } }
  });
  await seedProjectPlan(flag2.id, flag2.code, plannedPlan, { baselineLabel: 'Contract Baseline' });
  await addCollectible({ kind: 'project', ...flag2 }, { trancheIndex: 0, label: 'Downpayment', pct: 30, contract: CONTRACT9, dueIn: -30, desc: 'Downpayment',
    payments: [pay(5160000, 28, 'Bank Transfer', 'BPI-SJ-9001')] });

  // (10) Completed — DLP in progress, retention outstanding, release "due soon" (10d)
  const CONTRACT10 = 9000000;
  const done = await addProject({
    code: 'CLMC-AYA-2026010', name: 'Ayala Quezon City Civic Center', clientCode: 'AYA',
    status: 'Completed', scAgo: 20, budget: 8700000, contract: CONTRACT10, tranches: TRANCHES_4, location: 'Quezon City',
    extra: { updatedAgo: 20, fields: {
      project_completed_at: dts(20),
      dlp_months: 12, dlp_start_date: ymd(-20), dlp_expires_at: ymd(10),
      retention_percentage: 10, retention_amount: 900000, retention_released_at: null
    } }
  });
  const donePlan = [
    { name: 'Design & Permits', s: -200, e: -150 },
    { name: 'Detailed design', parent: 0, s: -200, e: -175, prog: 100, bs: -200, be: -178 },
    { name: 'Permits & approvals', parent: 0, s: -174, e: -150, prog: 100, deps: [1], bs: -177, be: -152 },
    { name: 'Milestone: NTP', s: -150, e: -150, ms: true, deps: [2] },
    { name: 'Construction', s: -149, e: -30 },
    { name: 'Site works & foundation', parent: 4, s: -149, e: -95, prog: 100, deps: [3], bs: -149, be: -98 },
    { name: 'Structure & architectural finishes', parent: 4, s: -94, e: -35, prog: 100, deps: [5], bs: -97, be: -40 },
    { name: 'Testing & commissioning', parent: 4, s: -34, e: -22, prog: 100, deps: [6] },
    { name: 'Milestone: Turnover', s: -20, e: -20, ms: true, deps: [7] }
  ];
  await seedProjectPlan(done.id, done.code, donePlan, { baselineLabel: 'As-Built Baseline' });
  // 3 progress tranches fully collected; retention billed but held (in DLP)
  await addCollectible({ kind: 'project', ...done }, { trancheIndex: 0, label: 'Downpayment', pct: 30, contract: CONTRACT10, dueIn: -170, payments: [pay(2700000, 168, 'Bank Transfer', 'RCBC-CC-01')] });
  await addCollectible({ kind: 'project', ...done }, { trancheIndex: 1, label: 'Progress Billing 1', pct: 30, contract: CONTRACT10, dueIn: -90, payments: [pay(2700000, 88, 'Bank Transfer', 'RCBC-CC-02')] });
  await addCollectible({ kind: 'project', ...done }, { trancheIndex: 2, label: 'Progress Billing 2', pct: 30, contract: CONTRACT10, dueIn: -30, payments: [pay(2700000, 25, 'Check', 'CHK-CC-88')] });
  await addCollectible({ kind: 'project', ...done }, { trancheIndex: 3, label: 'Retention', pct: 10, contract: CONTRACT10, dueIn: 10, desc: 'Retention — releasable at end of DLP', payments: [] });

  // (11) Loss — plan hidden
  await addProject({ code: 'CLMC-SMD-2026011', name: 'SMDC Seaside Towers (Bid Lost)', clientCode: 'SMD', status: 'Loss', scAgo: 8, budget: 6400000, location: 'Cebu City', extra: { fields: { loss_reason: 'Client awarded to lowest bidder; CLMC ranked #2 on price.' } } });

  // ===========================================================================
  // 5) SERVICES — one per lifecycle stage (11, incl. Draft)
  // ===========================================================================
  console.log('[DemoSeed] Seeding services...');
  await addService({ code: 'CLMC-DMC-2026012', name: 'Annual Fire Safety Certification', clientCode: 'DMC', type: 'one-time', status: 'Draft', scAgo: 2, budget: 180000, location: 'Makati City' });
  await addService({ code: 'CLMC-RLC-2026013', name: 'Warehouse Structural Integrity Audit', clientCode: 'RLC', type: 'one-time', status: 'For Inspection', scAgo: 3, budget: 320000, location: 'Calamba, Laguna' });
  await addService({ code: 'CLMC-ALV-2026014', name: 'HVAC System Performance Assessment', clientCode: 'ALV', type: 'one-time', status: 'For Proposal', scAgo: 1, budget: 260000, location: 'Bonifacio Global City' });
  await addService({ code: 'CLMC-MEG-2026015', name: 'Elevator Modernization Study', clientCode: 'MEG', type: 'one-time', status: 'Proposal for Internal Approval', scAgo: 6, budget: 540000, location: 'Taguig City' });
  await addService({ code: 'CLMC-AYA-2026016', name: 'Facade Cleaning & Coating Program', clientCode: 'AYA', type: 'recurring', status: 'Proposal Under Client Review', scAgo: 9, budget: 1200000, location: 'Cebu City' });
  await addService({ code: 'CLMC-DMC-2026017', name: 'Standby Genset Maintenance Contract', clientCode: 'DMC', type: 'recurring', status: 'For Revision', scAgo: 4, budget: 780000, location: 'Quezon City' });
  await addService({ code: 'CLMC-SMD-2026018', name: 'Elevated Water Tank Cleaning', clientCode: 'SMD', type: 'one-time', status: 'Client Approved', scAgo: 4, budget: 400000, contract: 420000, tranches: TRANCHES_3, location: 'Pasay City' });
  await addService({ code: 'CLMC-RLC-2026019', name: 'Perimeter CCTV & Access Upgrade', clientCode: 'RLC', type: 'one-time', status: 'For Mobilization', scAgo: 11, budget: 1600000, contract: 1650000, tranches: TRANCHES_3, location: 'Ortigas Center', extra: { fields: { mobilization_started_at: dts(11) } } });

  // On-going service — flagship service: gantt + collectibles
  const CONTRACTsv = 1000000;
  const svcOn = await addService({
    code: 'CLMC-ALV-2026020', name: 'Quarterly HVAC Preventive Maintenance', clientCode: 'ALV', type: 'recurring',
    status: 'On-going', scAgo: 40, budget: 950000, contract: CONTRACTsv, tranches: TRANCHES_3, location: 'Bonifacio Global City',
    extra: { updatedAgo: 2, fields: { project_started_at: dts(38), last_activity_at: iso(2) } }
  });
  await seedServicePlan(svcOn.id, svcOn.code, [
    { name: 'Q1 preventive maintenance', s: -38, e: -30, prog: 100 },
    { name: 'Q2 preventive maintenance', s: -8, e: 2, prog: 60 },
    { name: 'Q3 preventive maintenance', s: 80, e: 90, prog: 0, deps: [1] },
    { name: 'Milestone: Annual report', s: 92, e: 92, ms: true, deps: [2] }
  ]);
  await addCollectible({ kind: 'service', ...svcOn }, { trancheIndex: 0, label: 'Down Payment', pct: 30, contract: CONTRACTsv, dueIn: -35, payments: [pay(300000, 34, 'Bank Transfer', 'SVC-DP-01')] });
  await addCollectible({ kind: 'service', ...svcOn }, { trancheIndex: 1, label: 'Progress Billing', pct: 60, contract: CONTRACTsv, dueIn: 15, desc: 'Mid-contract billing', payments: [] });

  // Completed service — DLP set, all collected
  const CONTRACTsc = 500000;
  const svcDone = await addService({
    code: 'CLMC-MEG-2026021', name: 'Annual Genset Major Overhaul', clientCode: 'MEG', type: 'one-time',
    status: 'Completed', scAgo: 15, budget: 480000, contract: CONTRACTsc, tranches: TRANCHES_3, location: 'Taguig City',
    extra: { updatedAgo: 15, fields: {
      project_completed_at: dts(15),
      dlp_months: 6, dlp_start_date: ymd(-15), dlp_expires_at: ymd(165),
      retention_percentage: 10, retention_amount: 50000, retention_released_at: null
    } }
  });
  await seedServicePlan(svcDone.id, svcDone.code, [
    { name: 'Inspection & teardown', s: -60, e: -45, prog: 100 },
    { name: 'Parts replacement & rebuild', s: -44, e: -25, prog: 100, deps: [0] },
    { name: 'Load testing & handover', s: -24, e: -16, prog: 100, deps: [1] },
    { name: 'Milestone: Completion', s: -15, e: -15, ms: true, deps: [2] }
  ]);
  await addCollectible({ kind: 'service', ...svcDone }, { trancheIndex: 0, label: 'Down Payment', pct: 30, contract: CONTRACTsc, dueIn: -55, payments: [pay(150000, 54, 'Bank Transfer', 'SVC-GS-01')] });
  await addCollectible({ kind: 'service', ...svcDone }, { trancheIndex: 1, label: 'Progress Billing', pct: 60, contract: CONTRACTsc, dueIn: -20, payments: [pay(300000, 18, 'Bank Transfer', 'SVC-GS-02')] });
  await addCollectible({ kind: 'service', ...svcDone }, { trancheIndex: 2, label: 'Retention', pct: 10, contract: CONTRACTsc, dueIn: 165, desc: 'Retention — held during DLP', payments: [] });

  await addService({ code: 'CLMC-DMC-2026022', name: 'Rooftop Solar Feasibility Study (Lost)', clientCode: 'DMC', type: 'one-time', status: 'Loss', scAgo: 10, budget: 350000, location: 'Davao City', extra: { fields: { loss_reason: 'Client deferred CAPEX to next fiscal year.' } } });

  // ===========================================================================
  // 6) PROCUREMENT CHAIN (flagship On-going project) — costs, payables, tab data
  // ===========================================================================
  console.log('[DemoSeed] Seeding procurement chain for flagship...');
  const jitems = (arr) => JSON.stringify(arr); // arr of {item, qty, unit, category, unit_cost, supplier}
  const P8 = flag; // {id, code, name}

  // ---- MRFs ----
  const mrfBase = (id, status, items, agoSub, urgency = 'Medium') => ({
    mrf_id: id, request_type: 'Material', urgency_level: urgency, department: 'projects',
    project_code: P8.code, project_id: P8.id, project_name: P8.name, service_code: '', service_name: '',
    requestor_name: ACTOR, requestor_user_id: me.uid,
    date_needed: ymd(14), date_submitted: serverTimestamp(),
    delivery_address: 'BGC Site Warehouse, Taguig', justification: 'Curtain wall package materials',
    items_json: jitems(items), status, created_at: iso(agoSub)
  });
  await addDoc(collection(db, 'mrfs'), mrfBase('MRF-2026-001', 'PR Generated', [
    { item: 'Aluminum mullion profiles', qty: 1200, unit: 'lm', category: 'Structural', unit_cost: 950, supplier: 'Fil-Steel Trading Corp.' },
    { item: 'Structural silicone sealant', qty: 400, unit: 'tube', category: 'Structural', unit_cost: 320, supplier: 'Fil-Steel Trading Corp.' }
  ], 55));
  await addDoc(collection(db, 'mrfs'), mrfBase('MRF-2026-002', 'Approved', [
    { item: 'Insulated glass units (IGU) 2.4×1.5m', qty: 320, unit: 'pcs', category: 'Glazing', unit_cost: 8500, supplier: 'BrightVolt Electrical' }
  ], 30, 'High'));
  // a fresh Pending MRF (populates MRF Management / dashboard) for another project
  await addDoc(collection(db, 'mrfs'), {
    mrf_id: 'MRF-2026-003', request_type: 'Material', urgency_level: 'Low', department: 'projects',
    project_code: flag2.code, project_id: flag2.id, project_name: flag2.name, service_code: '', service_name: '',
    requestor_name: ACTOR, requestor_user_id: me.uid, date_needed: ymd(21), date_submitted: serverTimestamp(),
    delivery_address: 'San Juan Bridge Site', justification: 'Rebar for pier repair',
    items_json: jitems([{ item: 'Deformed rebar 16mm', qty: 5000, unit: 'kg', category: 'Structural', unit_cost: 62, supplier: 'MegaConcrete Supply Inc.' }]),
    status: 'Pending', created_at: iso(2)
  });

  // ---- PRs ----
  const prBase = (id, mrfId, supplier, items, total, financeStatus, agoGen) => ({
    pr_id: id, mrf_id: mrfId, supplier_name: supplier,
    project_code: P8.code, project_id: P8.id, project_name: P8.name, service_code: '', service_name: '',
    department: 'projects', requestor_name: ACTOR, urgency_level: 'Medium',
    delivery_address: 'BGC Site Warehouse, Taguig', items_json: jitems(items),
    total_amount: total, finance_status: financeStatus, date_generated: ymd(-agoGen),
    created_at: serverTimestamp(), pr_creator_user_id: me.uid, pr_creator_name: ACTOR
  });
  await addDoc(collection(db, 'prs'), prBase('PR-2026-001', 'MRF-2026-001', 'Fil-Steel Trading Corp.', [
    { item: 'Aluminum mullion profiles', qty: 1200, unit: 'lm', category: 'Structural', unit_cost: 950, supplier: 'Fil-Steel Trading Corp.' },
    { item: 'Structural silicone sealant', qty: 400, unit: 'tube', category: 'Structural', unit_cost: 320, supplier: 'Fil-Steel Trading Corp.' }
  ], 1268000, 'Approved', 50));
  await addDoc(collection(db, 'prs'), prBase('PR-2026-002', 'MRF-2026-002', 'BrightVolt Electrical', [
    { item: 'Insulated glass units (IGU) 2.4×1.5m', qty: 320, unit: 'pcs', category: 'Glazing', unit_cost: 8500, supplier: 'BrightVolt Electrical' }
  ], 2720000, 'Pending', 5)); // Pending → shows in Finance Pending Approvals

  // ---- POs (linked by project_name → drive project COST aggregation) ----
  const poBase = (id, prId, mrfId, supplier, items, total, status, agoIssued) => ({
    po_id: id, pr_id: prId, mrf_id: mrfId, supplier_name: supplier,
    project_code: P8.code, project_name: P8.name, service_code: '', service_name: '',
    department: 'projects', requestor_name: ACTOR, delivery_address: 'BGC Site Warehouse, Taguig',
    items_json: jitems(items), total_amount: total,
    po_creator_user_id: me.uid, po_creator_name: ACTOR,
    procurement_status: status, is_subcon: false,
    finance_approver_user_id: me.uid, finance_approver_name: ACTOR, finance_signature_url: '',
    date_issued: serverTimestamp(), date_issued_legacy: ymd(-agoIssued), created_at: serverTimestamp()
  });
  const po1 = await addDoc(collection(db, 'pos'), poBase('PO-2026-001', 'PR-2026-001', 'MRF-2026-001', 'Fil-Steel Trading Corp.', [
    { item: 'Aluminum mullion profiles', qty: 1200, unit: 'lm', category: 'Structural', unit_cost: 950, supplier: 'Fil-Steel Trading Corp.' },
    { item: 'Structural silicone sealant', qty: 400, unit: 'tube', category: 'Structural', unit_cost: 320, supplier: 'Fil-Steel Trading Corp.' }
  ], 1268000, 'Delivered', 48));
  await addDoc(collection(db, 'pos'), poBase('PO-2026-002', 'PR-2026-001', 'MRF-2026-001', 'BrightVolt Electrical', [
    { item: 'Insulated glass units (IGU) 2.4×1.5m', qty: 320, unit: 'pcs', category: 'Glazing', unit_cost: 8500, supplier: 'BrightVolt Electrical' }
  ], 2720000, 'Procuring', 20));
  await addDoc(collection(db, 'pos'), poBase('PO-2026-003', 'PR-2026-001', 'MRF-2026-002', 'ProTools Equipment Rental', [
    { item: 'Suspended scaffolding (gondola) rental', qty: 3, unit: 'month', category: 'Rental', unit_cost: 180000, supplier: 'ProTools Equipment Rental' }
  ], 540000, 'Pending Procurement', 6));

  // ---- Transport Request (also counts toward cost) ----
  await addDoc(collection(db, 'transport_requests'), {
    tr_id: 'TR-2026-001', mrf_id: 'MRF-2026-001', mrf_doc_id: '', project_code: P8.code, project_id: P8.id, project_name: P8.name,
    service_code: '', service_name: '', department: 'projects', requestor_name: ACTOR,
    tr_creator_user_id: me.uid, tr_creator_name: ACTOR, urgency_level: 'Medium',
    supplier_name: 'ProTools Equipment Rental', delivery_address: 'BGC Site Warehouse, Taguig',
    items_json: jitems([{ item: 'Flatbed hauling — framing delivery', qty: 4, unit: 'trip', category: 'Transport', unit_cost: 62500, supplier: 'ProTools Equipment Rental' }]),
    justification: 'Delivery of fabricated framing to site', cost: 250000, total_amount: 250000,
    finance_status: 'Approved', date_submitted: serverTimestamp()
  });

  // ---- RFP against PO-2026-001 with a payment → gives non-zero "Paid" payable ----
  await addDoc(collection(db, 'rfps'), {
    rfp_id: 'RFP-PO-2026-001-1', po_id: 'PO-2026-001', po_doc_id: po1.id, mrf_id: 'MRF-2026-001',
    project_code: P8.code, project_id: P8.id, project_name: P8.name, service_code: '', service_name: '',
    supplier_name: 'Fil-Steel Trading Corp.',
    tranche_index: 0, tranche_label: 'Full Payment', tranche_percentage: 100,
    amount_requested: 1268000, transfer_fee: 250, cash_out_fee: 0, misc_fees: [], total_with_fees: 1268250,
    invoice_number: 'FS-INV-4471', due_date: ymd(-10), mode_of_payment: 'Bank Transfer',
    bank_name: 'BDO', bank_account_name: 'Fil-Steel Trading Corp.', bank_details: '00123456789',
    alt_bank_name: '', alt_bank_account_name: '', alt_bank_details: '',
    payment_records: [pay(1268250, 9, 'Bank Transfer', 'RFP-FS-0001')],
    rfp_creator_user_id: me.uid, rfp_creator_name: ACTOR, date_submitted: serverTimestamp()
  });

  // ===========================================================================
  console.log('%c[DemoSeed] === DONE ===', 'color:#059669;font-weight:bold;font-size:14px');
  console.log('[DemoSeed] Seeded: 6 clients · 6 suppliers · 11 projects (10 stages, incl. Loss) · 11 services (incl. Draft)');
  console.log('[DemoSeed] Flagship "Alveo BGC Curtain Wall Package" (On-going): full Gantt (3 phases, 2 milestones, overdue task, baseline + iteration), 3 collectibles (paid/partial/pending), 3 POs + 1 TR + 1 RFP (costs & payables).');
  console.log('[DemoSeed] Completed project + service carry DLP/retention. Hard-refresh the app to see everything.');
})();
