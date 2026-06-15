---
phase: 91-navigation-restructuring-mrf-into-procurement-my-requests-fi
verified: 2026-05-13T00:00:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Navigate to #/procurement as operations_user — confirm Request tab is visible and renders the MRF submission form"
    expected: "Request sub-tab appears first in tab row; form fields render; submission succeeds and creates MRF with requestor_user_id set"
    why_human: "Cannot confirm form render quality, field population, or submission round-trip without a browser + live Firebase session"
  - test: "Navigate to #/procurement as finance role — confirm Request and MRF Records sub-tabs are absent from the DOM"
    expected: "Finance user sees only the sub-tabs permitted by D-03 (none of the 4 sub-tab keys have access:true for finance); no form rendered; no Request anchor in DOM"
    why_human: "Tab visibility depends on live hasTabAccess() returning false for finance role; requires active role doc in Firestore (needs forceReseedRoleTemplates() run first)"
  - test: "Select 'My Requests' from the dept dropdown on MRF Records tab as operations_user"
    expected: "Records table narrows to only MRFs where requestor_user_id === current user's uid; legacy MRFs without the field disappear; selecting All Departments restores all project-scoped records"
    why_human: "Requires live Firestore data with requestor_user_id field on MRF docs; cannot verify filter result without real session data"
  - test: "Navigate to #/mrf-form (old bookmark URL) — confirm redirect to #/procurement/request"
    expected: "URL changes to #/procurement/request; Procurement view loads with Request sub-tab active; no 404 or broken state"
    why_human: "Redirect is a browser-side hash navigation; cannot exercise without a browser"
  - test: "Run window.forceReseedRoleTemplates() then window.verifyRoleTemplates() in browser console as super_admin"
    expected: "verifyRoleTemplates() returns { valid: true, errors: [] }; all 7 roles carry 4 new sub-tab keys and mrf_form key in Firestore role_templates documents"
    why_human: "Firestore round-trip required; cannot verify live role documents without a browser session"
---

# Phase 91: Navigation Restructuring Verification Report

**Phase Goal:** Consolidate top navigation by absorbing the standalone Material Request tab into Procurement as a sub-tab (Request), retiring the redundant My Requests tab, replacing it with a "My Requests" filter toggle inside MRF Records, and revising role configuration to match the new structure.
**Verified:** 2026-05-13
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Standalone "Material Request" nav link removed; MRF creation accessible as Request sub-tab inside Procurement | VERIFIED | `grep data-route="mrf_form" index.html` = 0; `#/procurement/request` anchor present in procurement.js tab row; mrfFormModule.render('form') wired into request-section |
| 2 | Standalone "My Requests" tab removed; MRF Records gains "My Requests" filter toggle | VERIFIED | No standalone My Requests nav link exists; `<option value="my_requests">My Requests</option>` added to deptFilterPOTracking; filterPRPORecords my_requests branch reads requestor_user_id |
| 3 | Requestor-role users can still access their own submissions via the new filtered view | VERIFIED | operations_user has procurement_request:{access:true,edit:true} in defaultRoleTemplates; mrfFormModule delegation wired in procurement.js init/destroy; My Requests filter narrows by uid |
| 4 | Firestore Security Rules updated to reflect merged access model — no new permission gaps | VERIFIED | firestore.rules already uses role names (not tab keys) for MRF access gates; services_admin/services_user roles were already present in rules (lines 84, 97, 227, 265, 270); no mrf_form string existed in rules to update; existing mrfs.create/list rules unchanged |
| 5 | Role configuration updated — correct tabs shown/hidden for every role after restructure | VERIFIED | seed-roles.js: all 7 roles (including new services_admin/services_user) carry 4 new sub-tab keys per D-03 matrix; mrf_form key retained per D-04; verifyRoleTemplates requiredTabs extended to 11 entries |
| 6 | All existing procurement operations remain fully functional under the new structure | VERIFIED (code-level) | procurement.js init() early-returns for request tab, leaving the full procurement data pipeline intact for mrfs/suppliers/records tabs; existing tab sections and window functions unmodified; _requestSubTabActive flag guards mrfFormModule.destroy() to prevent orphan listeners |

**Score:** 6/6 truths verified at code level

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/seed-roles.js` | 7 roles x 4 sub-tab keys + verifyRoleTemplates updated | VERIFIED | All 7 role_id declarations present; all 4 keys (procurement_request/mrfs/suppliers/records) in every role block; mrf_form retained; requiredTabs has 11 entries; roles array has 7 entries |
| `app/router.js` | /mrf-form removed; defaultTab='request'; redirect in handleHashChange + handleInitialRoute | VERIFIED | No '/mrf-form' in routePermissionMap or routes; defaultTab:'request' confirmed on /procurement; Phase 91 redirect branch at lines 409-412 and 449-452 |
| `index.html` | Zero data-route="mrf_form" anchors; procurement anchors retained | VERIFIED | grep count = 0 for mrf_form; 2 procurement anchors (desktop + mobile) confirmed |
| `app/views/procurement.js` | mrfFormModule import; request sub-tab render/init/destroy; 4 canSeeXxx flags; My Requests option; cachedAllPRPORecords; reFilterAndRenderPRPORecords; assignmentsChanged listener | VERIFIED | All 20 programmatic checks passed |
| `app/views/mrf-form.js` | canEditTab reads procurement_request (not mrf_form) | VERIFIED | Exactly 1 canEditTab?.('procurement_request') call; 0 stale canEditTab?.('mrf_form') calls |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| index.html nav | Procurement route (no mrf_form anchor) | data-route attribute removal | WIRED | Zero data-route="mrf_form" anchors; data-route="procurement" present in both desktop and mobile nav |
| router.js handleHashChange + handleInitialRoute | navigate('/procurement', 'request') | path === '/mrf-form' branch | WIRED | Phase 91 comment + redirect branch confirmed in both handler functions |
| procurement.js render() tab row | hasTabAccess('procurement_request' / 'procurement_mrfs' / 'procurement_suppliers' / 'procurement_records') | canSeeXxx !== false ternaries around each anchor | WIRED | All 4 flags computed and used in tab row conditional emission |
| procurement.js render() request-section | mrfFormModule.render('form') | ES module import + template interpolation | WIRED | import * as mrfFormModule and mrfFormModule.render('form') inside request-section confirmed |
| procurement.js init() request branch | mrfFormModule.init('form') + _requestSubTabActive = true | if (activeTab === 'request') early-return branch | WIRED | Flag set before init call; return prevents procurement pipeline from running |
| procurement.js destroy() | mrfFormModule.destroy() | _requestSubTabActive flag guard + try/catch | WIRED | _requestSubTabActive check before mrfFormModule.destroy() confirmed |
| filterPRPORecords my_requests branch | window.getCurrentUser?.()?.uid → mrf.requestor_user_id | activePODeptFilter === 'my_requests' predicate | WIRED | requestor_user_id comparison and null-uid guard confirmed |
| loadPRPORecords | cachedAllPRPORecords + getAssignedProjectCodes() scope filter | cache-before-scope pattern | WIRED | cachedAllPRPORecords = [...allPRPORecords] before scope filter; legacy !mrf.project_code guard present |
| init() assignmentsChanged listener | reFilterAndRenderPRPORecords() | _procurementRecordsAssignmentHandler dedup guard | WIRED | if (!window._procurementRecordsAssignmentHandler) registration confirmed; typeof safety guard in body |
| destroy() | removeEventListener + delete _procurementRecordsAssignmentHandler | if (window._procurementRecordsAssignmentHandler) cleanup block | WIRED | Remove and delete confirmed in destroy() |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| app/views/procurement.js | 8462 | `dateString === 'TBD'` | Info | Data value comparison in formatDocumentDate() — string literal 'TBD' is a known date-field sentinel value, not a debt marker comment. Pre-existing code, not introduced by this phase. No action required. |

No `TBD`, `FIXME`, or `XXX` debt-marker comments were found in any file modified by this phase.

### Behavioral Spot-Checks

Step 7b: SKIPPED for the file-read checks (no runnable entry point without a browser + Firebase session). All behavioral verifications require a live browser — routed to Human Verification section.

### Probe Execution

No probe scripts declared for this phase. Step 7c: N/A.

### Requirements Coverage

No requirements IDs were mapped to Phase 91 (ROADMAP: "Requirements: None mapped"). All 6 Roadmap Success Criteria verified directly above.

### Human Verification Required

**1. Request Sub-Tab Render and Submission (operations_user)**

**Test:** Sign in as operations_user; navigate to #/procurement; confirm Request is the first active tab; submit a new MRF.
**Expected:** Request tab renders the MRF form; form accepts input and submission creates a new MRF document in Firestore with requestor_user_id set to the user's uid.
**Why human:** Form render quality and Firestore write path require a browser + live session.

**2. Finance Role Sub-Tab DOM Gating**

**Test:** Sign in as finance role (after running forceReseedRoleTemplates()); navigate to #/procurement.
**Expected:** Zero sub-tab anchors for Request or MRF Records appear in the DOM; attempting #/procurement/request directly shows the view-only notice from mrf-form.js canEdit check (procurement_request access:false for finance).
**Why human:** Live role document with updated keys required; hasTabAccess() result depends on Firestore role_templates data.

**3. My Requests Filter Behavior**

**Test:** Sign in as operations_user; navigate to #/procurement/records; select "My Requests" from the dept dropdown.
**Expected:** Table narrows to MRFs where requestor_user_id === current uid; legacy MRFs without requestor_user_id field disappear; switching back to "All Departments" restores all project-scoped records.
**Why human:** Requires live Firestore data with real requestor_user_id field values.

**4. #/mrf-form Backward-Compat Redirect**

**Test:** While signed in, type #/mrf-form in the address bar.
**Expected:** URL immediately changes to #/procurement/request; Procurement view loads with Request sub-tab active.
**Why human:** Hash navigation redirect requires browser execution.

**5. forceReseedRoleTemplates + verifyRoleTemplates Console Check**

**Test:** Sign in as super_admin; run `await window.forceReseedRoleTemplates()` then `await window.verifyRoleTemplates()` in browser console.
**Expected:** verifyRoleTemplates returns `{ valid: true, errors: [] }`; role_templates documents in Firestore now carry all 4 sub-tab keys for all 7 roles.
**Why human:** Requires live Firestore write and read round-trip.

### Gaps Summary

No code-level gaps found. All 6 Roadmap Success Criteria are satisfied at the artifact and wiring levels. The 5 human verification items are runtime/behavioral checks that require a browser session with live Firebase — they are not evidence of missing implementation.

**Deployment prerequisite:** A super_admin must run `window.forceReseedRoleTemplates()` once from the browser console after deploy so that live Firestore role_templates documents receive the 4 new sub-tab permission keys. Until this step is completed, `hasTabAccess('procurement_request')` returns `undefined` for users on stale role docs — the `!== false` guard in procurement.js treats `undefined` as accessible (over-show, not over-hide), which is the intentional safe failure mode per T-91.3-04.

---

_Verified: 2026-05-13_
_Verifier: Claude (gsd-verifier)_
