// Verification for Phase 98 Slice 3 (Payables Ref Link) — finance.js route-by-type.
// UPDATED after UAT (2026-06-03): the original plan assumed RFP docs carry a usable
// po_doc_id/tr_doc_id. They don't (some are empty -> "pos has 1 segment" FirebaseError).
// Corrected fix: pass the human-readable po_id/tr_id and resolve the Firestore doc id
// from the live pos collection (posDocIdMap) or a tr_id/po_id query.
// Run: node .planning/phases/98-ui-fixes-client-contact-notifications-payables-home/verify-98-03.cjs
// Exit 0 = all checks pass.
const fs = require('fs');
const path = require('path');
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const c = fs.readFileSync(path.join(repoRoot, 'app/views/finance.js'), 'utf8');

const checks = [
  // Ported TR modal + window wiring
  ['async function viewTRDetailsFromRFP defined', /async function viewTRDetailsFromRFP/.test(c)],
  ['window.viewTRDetailsFromRFP registered', /window\.viewTRDetailsFromRFP\s*=\s*viewTRDetailsFromRFP/.test(c)],
  ['window.viewTRDetailsFromRFP deleted in cleanup', /delete window\.viewTRDetailsFromRFP/.test(c)],
  ['TR modal fetches transport_requests', /getDoc\(doc\(db,\s*'transport_requests'/.test(c)],
  ['finance TR modal id used', /financeTRDetailsModal/.test(c)],

  // Gap fix: resolve PO doc id from the live pos collection, never from RFP.po_doc_id
  ['posDocIdMap built in pos snapshot', /posDocIdMap\.set\(data\.po_id,\s*docSnap\.id\)/.test(c)],
  ['viewPODetailsFromRFP resolves via posDocIdMap', /posDocIdMap\.get\(poRef\)/.test(c)],
  ['viewPODetailsFromRFP query fallback by po_id', /where\('po_id',\s*'=='/.test(c)],
  ['viewTRDetailsFromRFP resolves by tr_id query', /where\('tr_id',\s*'=='/.test(c)],

  // Call sites pass the human-readable id (resolved server-side) — template-literal sites
  ['PO Summary table passes po.poId', /viewPODetailsFromRFP\('\$\{po\.poId\}'\)/.test(c)],
  ['RFP Processing table passes rfp.po_id', /viewPODetailsFromRFP\('\$\{rfp\.po_id\}'\)/.test(c)],
  ['PO Summary table TR link uses po.poId', /viewTRDetailsFromRFP\('\$\{po\.poId\}'\)/.test(c)],
  ['RFP Processing table TR link uses rfp.tr_id', /viewTRDetailsFromRFP\('\$\{rfp\.tr_id\}'\)/.test(c)],
  // String-concat card sites
  ['PO Summary card passes po.poId', /viewPODetailsFromRFP\(\\'' \+ po\.poId/.test(c)],
  ['RFP card TR link uses rfp.tr_id', /viewTRDetailsFromRFP\(\\'' \+ rfp\.tr_id/.test(c)],

  // BUG GONE: no reliance on the unreliable RFP doc-id fields anywhere in finance.js
  ['BUG gone: no po_doc_id reference remains', !/po_doc_id/.test(c)],
  ['BUG gone: no tr_doc_id reference remains', !/tr_doc_id/.test(c)],

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
