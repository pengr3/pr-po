---
phase: 78-allow-creating-projects-without-a-client-defer-project-code-issuance-until-client-is-assigned
verified: 2026-04-27T06:03:27Z
status: passed
score: 13/13 must-haves verified
re_verification: false
gaps: []
human_verification: []
---

# Phase 78: Allow Creating Projects Without a Client Verification Report

**Phase Goal:** Allow creating projects without a client — defer project code issuance until a client is assigned
**Verified:** 2026-04-27T06:03:27Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can submit Add Project with no client selected; project document written with `client_id: null`, `client_code: null`, `project_code: null`, `active: true` | VERIFIED | `addProject()` in `projects.js`: validation block `if (!project_name \|\| !internal_status \|\| !project_status)` — no `clientId` check; `addDoc` payload uses `client_id: clientId \|\| null`, `project_code: project_code \|\| null` |
| 2 | Firestore Security Rules permit clientless project creation (D-01) | VERIFIED | `firestore.rules` projects block has "Phase 78 D-01: clientless projects allowed" comment; `allow create: if hasRole(['super_admin', 'operations_admin'])` is unchanged — null fields implicitly allowed |
| 3 | Firestore Security Rules enforce D-12 at DB level: once `project_code` is non-null, updates that change `project_code`, `client_id`, or `client_code` are rejected | VERIFIED | Multi-line `allow update` in `firestore.rules` with `resource.data.project_code == null` pre-issuance gate and triple equality checks (`request.resource.data.project_code == resource.data.project_code`, `client_id`, `client_code`) |
| 4 | Clientless projects appear in both MRF form dropdowns labeled `{project_name} (No code yet)` | VERIFIED | `mrf-form.js` line 1219: `\`${p.project_name} (No code yet)\``; `procurement.js` has 2 occurrences of `(No code yet)` in the projectOptions builder |
| 5 | MRF submitted against clientless project writes `project_id` (Firestore doc ID) and `project_code: ''` | VERIFIED | `mrf-form.js` line 1755: `project_id: hasProject ? selectedProjectDocId : ''`; `procurement.js` saveNewMRF mrfDoc: `project_id: hasProject ? selectedProject.id : ''` |
| 6 | `project_id` is propagated to PR/PO/TR/RFP child docs from their parent MRF | VERIFIED | `procurement.js` has 8 `project_id:` propagation sites (4 from `mrfData.project_id`, 2 from `po.project_id`, 1 from `tr.project_id`, 1 in mrfDoc itself) |
| 7 | Projects list renders em-dash in Code and Client columns for clientless rows | VERIFIED | `projects.js` lines 896-898: `const codeDisplay = project.project_code \|\| '—'`; `const clientName = client ? client.company_name : (project.client_code \|\| '—')` |
| 8 | Clicking a clientless project row navigates to `#/projects/detail/{doc_id}` | VERIFIED | `projects.js` line 900: `const detailParam = project.project_code \|\| project.id`; used in `onclick` on line 903 |
| 9 | Project detail resolves clientless project via doc-ID fallback when `project_code` lookup is empty | VERIFIED | `project-detail.js` lines 125-133: `snapshot.empty` branch attempts `getDoc(doc(db, 'projects', projectCode))` and rebinds `listener` as per-doc `onSnapshot` |
| 10 | Project detail Card 1 renders editable client picker + "Assign & Issue Code" button when `client_code` is null | VERIFIED | `project-detail.js` line 357-359: `<select id="clientAssignSelect">` rendered conditionally; `<button onclick="window.startCodeIssuance()">Assign & Issue Code</button>` |
| 11 | Confirmation modal shows about-to-be-generated code AND per-collection record counts | VERIFIED | `startCodeIssuance()` pre-computes `newProjectCode`, queries all 5 collections by `project_id`, renders modal at lines 988-1013 showing code and 5 bullet-point counts |
| 12 | `runCodeIssuance()` writes children FIRST, project doc (with `is_issued: true`) LAST in a chunked writeBatch | VERIFIED | `project-detail.js` lines 1061-1092: children pushed to `writes[]` first (lines 1065-1069), project doc `.push()` last (line 1074), chunked at 500 in `for` loop |
| 13 | After issuance, `saveField` rejects `project_code`/`client_id`/`client_code` edits (UI guard) AND Firestore rules reject direct writes (DB guard) | VERIFIED | `saveField()` line 660: `if (['project_code', 'client_id', 'client_code'].includes(fieldName))` returns false; D-12 rule in `firestore.rules` confirmed. UAT step 12 and 13 both passed |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/views/projects.js` | Relaxed `addProject()` with null client defaults + em-dash rendering + doc-ID navigation | VERIFIED | All 9 Plan 01 acceptance criteria pass; `required` attribute absent from `#projectClient` select (UAT bugfix 74d0b8d applied); em-dash and `detailParam` patterns present |
| `firestore.rules` | D-01 comment + D-12 multi-line update rule | VERIFIED | Both comments present; triple-equality post-issuance lock in update rule; create/delete rules unchanged |
| `app/views/mrf-form.js` | Clientless project option support + `project_id` on submit | VERIFIED | Uses combobox hidden-input pattern (`projectServiceDocId`, `projectServiceClientless`) rather than native `<option>` dataset — functionally equivalent. `(No code yet)` label, `selectedProjectDocId`, `project_id` write all confirmed |
| `app/views/procurement.js` | Clientless project options in Create-MRF + `project_id` propagation (7 sites) | VERIFIED | 2 `(No code yet)` occurrences, `data-project-doc-id`, `data-clientless`, `isClientlessProject` lookup branch, 8 `project_id` propagation sites (meets >7 threshold) |
| `app/views/project-detail.js` | Doc-ID fallback, clients cache, issuance modal, batched backfill, edit-history event, `is_issued: true` | VERIFIED | All Plan 03 must-haves pass; `clientsCacheForIssuance`, `startCodeIssuance`, `runCodeIssuance`, `writeBatch`, `is_issued: true`, `code_issued_backfill_count` history event all confirmed |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `projects.js addProject()` | Firestore `projects` collection | `addDoc` with `client_id: clientId \|\| null` | WIRED | Pattern confirmed at line ~685 |
| `firestore.rules /projects update` | All project updates | D-12 guard: `resource.data.project_code == null` gate | WIRED | Full multi-line rule confirmed in projects block |
| `mrf-form.js selectPSOption()` | MRF submit handler | Hidden inputs `projectServiceDocId` / `projectServiceClientless` → `project_id: hasProject ? selectedProjectDocId : ''` | WIRED | Read path (lines 1707-1717) and write path (line 1755) both confirmed |
| `procurement.js saveNewMRF()` | Firestore `mrfs` collection | `project_id: hasProject ? selectedProject.id : ''` in `mrfDoc` | WIRED | Line confirmed in mrfDoc literal |
| `projects.js renderProjectsTable()` | `#/projects/detail/{param}` navigation | `detailParam = project.project_code \|\| project.id` | WIRED | Line 900 confirmed |
| `project-detail.js init()` | Firestore `/projects/{doc_id}` | `getDoc(doc(db, 'projects', projectCode))` fallback when `snapshot.empty` | WIRED | Lines 128-133 confirmed |
| `project-detail.js startCodeIssuance()` → `runCodeIssuance()` | Firestore writeBatch across 5 collections + project doc | `where('project_id', '==', projectId)` queries; children-first push; project doc last push | WIRED | Lines 1052-1092 confirmed |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `project-detail.js` (issuance modal) | `mrfsCount`, `prsCount`, etc. | `getDocs(query(collection(db, 'mrfs'), where('project_id', '=='...)))` | Yes — live Firestore queries per collection | FLOWING |
| `project-detail.js` (batch write) | `writes[]` built from `mrfsSnap`, `prsSnap`, etc. | Same 5 `getDocs` queries; `.forEach(d => writes.push(...))` | Yes — iterates actual query results | FLOWING |
| `mrf-form.js` (dropdown) | `cachedProjects` including clientless entries | `onSnapshot(query(collection(db, 'projects'), where('active', '==', true)))` (existing loader, unchanged) | Yes — real-time listener | FLOWING |
| `procurement.js` (Create-MRF dropdown) | `projectsData` | `onSnapshot(query(collection(db, 'projects'), where('active', '==', true)))` (existing loader, unchanged) | Yes — real-time listener | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — all checks require a running browser with live Firebase; no runnable standalone entry points. Manual UAT covered all 13 behaviors (see UAT results in 78-04-SUMMARY.md).

---

### Requirements Coverage

No formal requirement IDs were declared for this phase. Coverage is assessed against the phase success criteria derived from CONTEXT.md and REVIEWS.md:

| Criterion | Evidence | Status |
|-----------|----------|--------|
| D-01: Clientless project creation | `addProject()` validation relaxed; rules permit null fields | SATISFIED |
| D-03: Client is optional not required | No `clientId` in validation block; label says "(optional)" | SATISFIED |
| D-04: Defer project_code until client assigned | `clientCode ? await generateProjectCode(clientCode) : null` | SATISFIED |
| D-06: Doc-ID URL routing for clientless projects | `detailParam = project_code \|\| project.id`; `getDoc` fallback in detail | SATISFIED |
| D-07: Issuance confirmation modal | `startCodeIssuance()` modal with code preview + per-collection counts | SATISFIED |
| D-08: Batched backfill children-first / project-last | `writes[]` ordering confirmed in `runCodeIssuance` | SATISFIED |
| D-09: Em-dash rendering in projects list | `codeDisplay = project.project_code \|\| '—'` | SATISFIED |
| D-10: `project_id` denormalization on MRF writes | Both `mrf-form.js` and `procurement.js` save paths write `project_id` | SATISFIED |
| D-12: Post-issuance immutability (DB + UI) | Firestore D-12 rule + `saveField` guard for locked fields | SATISFIED |
| REVIEWS.md HIGH: Firestore index coverage | `project_id` queries rely on auto-indexing (no exemptions found); confirmed passing in UAT step 9b | SATISFIED |
| REVIEWS.md MEDIUM: Security Rule Bypass | D-12 `allow update` guard enforces lock at DB level, not just UI | SATISFIED |

---

### Anti-Patterns Found

None. Grep scan of all four modified files (`projects.js`, `project-detail.js`, `mrf-form.js`, `procurement.js`) found:
- No TODO/FIXME/PLACEHOLDER comments
- No stub return patterns (`return null`, `return []`, `return {}`) in relevant handlers
- No console-log-only implementations in Phase 78 code paths
- All four files pass `node --check` (no syntax errors)

---

### Human Verification Required

All human verification was completed during UAT (Plan 78-04, 13/13 steps approved by pengr3 on 2026-04-27). No additional human verification is required.

For reference, the UAT covered:
1. Add Project with no client — toast and Firestore doc verified
2. Projects list em-dash rendering
3. Clientless row click routing to doc-ID URL
4. Procurement dropdown shows "(No code yet)" label
5. MRF submission against clientless project
6. Firestore MRF doc `project_id` field presence
7. Project detail client picker + Assign & Issue Code button
8. Confirmation modal with code preview and counts
9. Successful code issuance — `is_issued: true`, children backfilled
10. `saveField` UI lock rejection (step 12)
11. Direct `updateDoc` bypass rejection with `permission-denied` (step 13)

---

### Gaps Summary

No gaps. All 13 observable truths are verified against the codebase. The mrf-form.js implementation uses a combobox hidden-input architecture (via `selectPSOption()`, `projectServiceDocId`, `projectServiceClientless`) rather than native `<option>` dataset attributes as the plan specified — but the functional contract (clientless label, doc ID as selection key, `project_id` written on submit) is fully met. The UAT approved the end-to-end flow with no regressions.

---

_Verified: 2026-04-27T06:03:27Z_
_Verifier: Claude (gsd-verifier)_
