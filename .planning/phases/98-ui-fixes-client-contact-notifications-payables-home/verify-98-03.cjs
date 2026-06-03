// Verification for Phase 98 Slice 3 (Payables Ref Link) — finance.js route-by-type.
// Run: node .planning/phases/98-ui-fixes-client-contact-notifications-payables-home/verify-98-03.cjs
// Exit 0 = all checks pass.
const fs = require('fs');
const path = require('path');
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const c = fs.readFileSync(path.join(repoRoot, 'app/views/finance.js'), 'utf8');

const checks = [
  // Task 1: ported TR modal + window wiring + doc-id threading
  ['async function viewTRDetailsFromRFP defined', /async function viewTRDetailsFromRFP/.test(c)],
  ['window.viewTRDetailsFromRFP registered', /window\.viewTRDetailsFromRFP\s*=\s*viewTRDetailsFromRFP/.test(c)],
  ['window.viewTRDetailsFromRFP deleted in cleanup', /delete window\.viewTRDetailsFromRFP/.test(c)],
  ['buildPOMap entry threads po_doc_id', /po_doc_id:\s*rfp\.po_doc_id/.test(c)],
  ['buildPOMap entry threads tr_doc_id', /tr_doc_id:\s*rfp\.tr_doc_id/.test(c)],
  ['poEntries push threads po_doc_id', /po_doc_id:\s*entry\.po_doc_id/.test(c)],
  ['poEntries push threads tr_doc_id', /tr_doc_id:\s*entry\.tr_doc_id/.test(c)],
  ['TR modal fetches transport_requests', /getDoc\(doc\(db,\s*'transport_requests'/.test(c)],
  ['finance TR modal id used', /financeTRDetailsModal/.test(c)],

  // Task 2: PO Summary template-literal site now passes po.po_doc_id
  ['PO Summary table passes po.po_doc_id', /viewPODetailsFromRFP\('\$\{po\.po_doc_id/.test(c)],
  // RFP Processing table still passes rfp.po_doc_id
  ['RFP Processing table passes rfp.po_doc_id', /viewPODetailsFromRFP\('\$\{rfp\.po_doc_id/.test(c)],
  // TR links now exist (template-literal sites)
  ['PO Summary table TR link uses po.tr_doc_id', /viewTRDetailsFromRFP\('\$\{po\.tr_doc_id/.test(c)],
  ['RFP Processing table TR link uses rfp.tr_doc_id', /viewTRDetailsFromRFP\('\$\{rfp\.tr_doc_id/.test(c)],
  // String-concat card sites
  ['PO Summary card passes po.po_doc_id', /viewPODetailsFromRFP\(\\'' \+ \(po\.po_doc_id/.test(c) || /viewPODetailsFromRFP\(\\''\s*\+\s*\(po\.po_doc_id/.test(c)],
  ['PO Summary card TR link uses po.tr_doc_id', /viewTRDetailsFromRFP\(\\''\s*\+\s*\(po\.tr_doc_id/.test(c)],

  // BUG GONE: no site passes po.poId to the PO loader
  ['BUG gone: no viewPODetailsFromRFP(${po.poId})', !/viewPODetailsFromRFP\('\$\{po\.poId/.test(c)],
  ['BUG gone: no viewPODetailsFromRFP concat po.poId', !/viewPODetailsFromRFP\(\\''\s*\+\s*po\.poId/.test(c)],

  // truly-unlinked plain text still present
  ['truly-unlinked dash span present', /<span style="color:#999;">-<\/span>/.test(c)],
];

let failed = 0;
for (const [name, pass] of checks) {
  console.log((pass ? 'PASS ' : 'FAIL ') + name);
  if (!pass) failed++;
}
console.log(failed === 0 ? '\nALL CHECKS PASS' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
