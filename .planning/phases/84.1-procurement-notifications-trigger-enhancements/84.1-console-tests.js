// Phase 84.1 console smoke-test blocks. Open in VS Code, click inside a block,
// select the block lines, copy, paste in DevTools console. Pure ASCII only.
// Pre-req: Block 0 from 84.1-CONSOLE-TESTS.md must have run (window.T must exist).

// ============================================================================
// BLOCK 1a — NOTIF-14 fan-out smoke test
// ============================================================================
(async () => {
  const recipients = await T.usersByRole('procurement');
  console.log('Will fan out to ' + recipients.length + ' active procurement users');
  const count = await T.notif.createNotificationForRoles({
    roles: ['procurement'],
    type: T.types.MRF_SUBMITTED,
    message: 'CONSOLE-TEST: New MRF MRF-9999-001 needs processing',
    link: '#/procurement/mrfs',
    source_collection: 'mrfs',
    source_id: 'MRF-9999-001',
    excludeActor: false
  });
  console.log('createNotificationForRoles wrote ' + count + ' notification(s)');
})();


// ============================================================================
// BLOCK 1b-1g — All 6 single-recipient smoke tests in one batch
// ============================================================================
(async () => {
  const tests = [
    { id: 'PR_DECIDED',           source: 'PR-2026-099',  coll: 'prs',                link: '#/procurement/records', msg: 'CONSOLE-TEST: PR PR-2026-099 has been Approved by Finance' },
    { id: 'RFP_PAID',             source: 'RFP-099',      coll: 'rfps',               link: '#/finance/payables',    msg: 'CONSOLE-TEST: RFP RFP-099 for PO PO-2026-099 has been marked Paid' },
    { id: 'TR_DECIDED',           source: 'TR-2026-099',  coll: 'transport_requests', link: '#/procurement/records', msg: 'CONSOLE-TEST: TR TR-2026-099 has been Rejected: insufficient budget' },
    { id: 'PO_DELIVERED',         source: 'PO-2026-099',  coll: 'pos',                link: '#/procurement/records', msg: 'CONSOLE-TEST: PO PO-2026-099 for MRF MRF-2026-099 has been Delivered' },
    { id: 'PROJECT_COST_CHANGED', source: 'TEST-PROJ-ID', coll: 'projects',           link: '#/projects',            msg: 'CONSOLE-TEST: Project Test-Codeless Budget changed from 100000 to 250000' },
    { id: 'MRF_REJECTED',         source: 'MRF-2026-099', coll: 'mrfs',               link: '#/procurement/mrfs',    msg: 'CONSOLE-TEST: Your MRF MRF-2026-099 has been rejected by Procurement: Items out of budget' }
  ];
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    try {
      await T.notif.createNotification({
        user_id: T.me.uid,
        type: T.types[t.id],
        message: t.msg,
        link: t.link,
        source_collection: t.coll,
        source_id: t.source
      });
      console.log('OK ' + t.id);
    } catch (e) {
      console.error('FAIL ' + t.id + ':', e);
    }
  }
  console.log('--- 6 smoke tests done. Check bell. ---');
  await T.myRecent(8);
})();


// ============================================================================
// BLOCK 1b alone — just PR_DECIDED, simplest possible test
// ============================================================================
(async () => {
  await T.notif.createNotification({
    user_id: T.me.uid,
    type: T.types.PR_DECIDED,
    message: 'CONSOLE-TEST: PR PR-2026-099 has been Approved by Finance',
    link: '#/procurement/records',
    source_collection: 'prs',
    source_id: 'PR-2026-099'
  });
  await T.myRecent(3);
})();


// ============================================================================
// CLEANUP — remove all CONSOLE-TEST notifications for current user
// ============================================================================
(async () => {
  const q = T.fs.query(
    T.fs.collection(T.db, 'notifications'),
    T.fs.where('user_id', '==', T.me.uid),
    T.fs.where('source_id', 'in', ['MRF-9999-001','PR-2026-099','RFP-099','TR-2026-099','PO-2026-099','MRF-2026-099','TEST-PROJ-ID'])
  );
  const snap = await T.fs.getDocs(q);
  console.log('Deleting ' + snap.size + ' CONSOLE-TEST notifications...');
  for (const d of snap.docs) await T.fs.deleteDoc(d.ref);
  console.log('Cleanup done');
})();
