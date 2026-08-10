# Phase 113 Plan 09: D-03 Completeness Audit + D-12 Inspection Sweep

**Produced:** 2026-08-11 (Plan 113-09, Task 2)
**Method:** Every row below was verified against the CURRENT working-tree code by reading the
file directly (not by trusting the Wave-4 SUMMARY files' prose). SUMMARY files were used only to
locate which plan performed each conversion; the CONVERTED verdict itself is based on a fresh
`Read`/`Grep` of the code as it stands at this commit.

---

## Section 1 — D-03 Completeness Map

One row per site in `113-RESEARCH.md`'s "MUST CONVERT" table (rows 1–13, same numbering), plus
the services-side and helper-repoint sites this phase also converted that RESEARCH.md's table
did not enumerate (rows 14–18).

| # | Site (file:line, RESEARCH baseline) | Original query shape | Shape class (113-PATTERNS.md) | Converted query shape (verified in current code) | Plan |
|---|---|---|---|---|---|
| 1 | `app/views/projects.js:848` | `onSnapshot(collection(db,'projects'))` — no `where` | A | **CONVERTED.** `loadProjects()` (now ~line 847) branches on `getAssignedProjectCodes()`: `null` → unchanged unscoped `collection(db,'projects')`; scoped role → `query(collection(db,'projects'), where('personnel_user_ids','array-contains',uid))` (line 861), fail-closed uid guard (empties `allProjects`, calls `applyFilters()`, returns before any listener attaches). Verified by direct `Read`. | 113-04 |
| 2 | `app/views/mrf-form.js:1046` | `where('active','==',true)` | B | **CONVERTED.** `loadProjects()` branches on `getAssignedProjectCodes()===null`; scoped branch is a bare `query(projectsRef, where('personnel_user_ids','array-contains',uid))` (line 1061), `active` re-applied client-side in `snapshot.forEach` alongside the pre-existing `Draft` skip. Verified by direct `Grep`/`Read`. | 113-06 |
| 3 | `app/views/project-detail.js:220` | `where('project_code','==',projectCode)` | C | **CONVERTED.** Branches on `getAssignedProjectCodes()`; scoped role pairs `where('project_code','==',projectCode)` with `where('personnel_user_ids','array-contains',uid)` on the SAME query (line 247), served by the `projects`×`project_code`×`personnel_user_ids` composite index (113-01/113-02). No-uid case renders the "Project not found" empty state directly and returns without a listener. The `getDoc(doc(db,'projects',projectCode))` doc-ID fallback is byte-identical (single-doc `get()` needs no query-shape change). Verified by direct `Grep`/`Read`. | 113-05 |
| 4 | `app/views/project-plan.js:258` | `where('project_code','==',projectCode)` | C | **CONVERTED.** Identical structural twin of row 3: paired `array-contains` clause on line 271 for scoped roles; a scoped actor with no uid short-circuits to a synthetic `{empty:true, docs:[]}` result (no query issued) reusing the existing "Project not found" render path. Verified by direct `Grep`/`Read`. | 113-05 |
| 5 | `app/views/procurement.js:2932` (`loadProjects`) | `where('active','==',true)` — RESEARCH.md's Contradicts-CONTEXT.md #1 confirmed this had ZERO scoping, disproving the preliminary "partially scoped via `projScope`" claim | B | **CONVERTED.** `loadProjects()` (now ~line 2940) branches identically to site #2: scoped role gets bare `where('personnel_user_ids','array-contains',uid)` (line 2960), `active` re-applied client-side in the `onSnapshot` callback. A comment directly above the function (lines 2935-2939) records that `projScope` inside the unrelated `isMrfInAssignedScope()` shares no code path with this query. Verified by direct `Read`. | 113-06 |
| 6 | `app/proposal-modal.js:212` (`_loadModalDropdownData`) | `getDocs(collection(db,'projects'))` — zero predicates, worst shape in the whole audit | A | **CONVERTED.** `_loadModalDropdownData(skipProjects=false)`: the Start-Proposal preselected path skips the projects fetch entirely (`skipProjects=true`, only `clients` loaded); when `preselectedProjectId` is set without `lockedProjectCode` (project-detail.js's Start Proposal button), a single-document `getDoc(doc(db,'projects',preselectedProjectId))` (line 762) resolves the one needed project instead of a list query — a Rule-1 auto-fix recorded in 113-07-SUMMARY.md to prevent `saveProposal()` silently writing `project_code: null`. The non-skip path branches on `getAssignedProjectCodes()`: scoped role → bare `where('personnel_user_ids','array-contains',uid)` (line 247). Verified by direct `Grep`/`Read`. | 113-07 |
| 7,8,9 | `app/expense-modal.js:50,71,109` (3× `where('project_name','==',identifier)` per modal open) | 3 identical redundant `projects`-by-name lookups | D | **CONVERTED.** `showExpenseBreakdownModal` accepts an optional `projectCode` option (line 24); `openFullBreakdown` (project-detail.js) now passes `budget`+`projectCode` from the already-loaded `currentProject`, so the scoped/preloaded path issues **zero** `projects` queries. When no `projectCode` is supplied (the `finance.js` see-all fallback, which never touches a scoped role), exactly ONE `where('project_name','==',identifier)` lookup runs (line 71) and its result (`resolvedProjectCode`) is reused for the RFP and collectibles sections — down from 3 independent fetches to at most 1. Verified by direct `Grep`/`Read`. | 113-05 |
| 10 | `app/views/clients.js:243` (`showClientDetail`, projects dimension) | `where('client_code','==', client.client_code)` | C-variant | **CONVERTED.** `showClientDetail()` branches independently per dimension via its own `getAssignedProjectCodes()` call; scoped role pairs `where('client_code','==',client.client_code)` with `where('personnel_user_ids','array-contains',uid)` on the same query (lines 261-265), served by the `projects`×`client_code`×`personnel_user_ids` composite index (113-01/113-02). No-uid case resolves `Promise.resolve(null)` (fail-closed, no query issued). Task 2 of 113-07 followed the literal two-fresh-queries instruction over the `<interfaces>` section's looser in-memory-filter suggestion (documented deviation in 113-07-SUMMARY.md, not a gap). Verified by direct `Read`. | 113-07 |
| 11 | `app/views/procurement.js:7951` (PO-Delivered activity-journal auto-entry) | `where('project_name','==',projectName)` inside an already-swallowing `try/catch` | D | **CONVERTED.** Replaced with `getDoc(doc(db,'projects', mrfData.project_id))` (line 7992) keyed on the MRF's Phase-78-denormalized `project_id`. Pre-Phase-78 legacy MRFs lacking `project_id` skip the journal entry with a `[Procurement]`-prefixed log line rather than falling back to a name query (RESEARCH assumption A4's accepted degradation — the whole block is already best-effort). Verified by direct `Grep`/`Read`. | 113-06 |
| 12 | `app/utils.js:368` (`generateServiceCode`) — RESEARCH.md's highest-severity finding; reachable by `services_admin` creating ANY new service | `where('client_code','==',clientCode).where('project_code','>=',rangeMin).where('project_code','<=',rangeMax)` — a whole-`projects`-collection range scan for code-collision checking, NOT a personnel-scoped read | D-special | **NO CHANGE REQUIRED (client-side).** Verified by direct `Read` (current `generateServiceCode`, `app/utils.js:490-529`): the query is byte-identical to the RESEARCH baseline — still an unscoped `client_code`+range-scan pair against `projects`. **Reason no client conversion applies:** this is a collision-avoidance range scan across the ENTIRE client/year code space, not a read of documents the actor is personnel on — converting it to `array-contains personnel_user_ids` would silently narrow the collision check to only the actor's own assigned projects, which would then let a `services_admin` issue a colliding `CLMC-{client}-{year}###` code against a project they are not personnel on (a correctness regression, not a security fix). Per 113-PATTERNS.md's Shape D-special guidance, the actual fix for this site is a **rules-level exemption** for `services_admin` on this specific query shape, which is explicitly out of this plan's scope — Task 1 of this plan was instructed NOT to touch `generateServiceCode`, and the rule-level exemption is planned for **113-10** (the rule-tightening plan). Until 113-10 lands that exemption, this query continues to run correctly under the still-permissive `projects` read rule; it is not a live gap today, and 113-10 owns closing it before the rule tightens. | N/A — client-side unchanged by design; rules-level fix owned by 113-10 |
| 13 | `app/utils.js:278` (`generateProjectCode`) — direct sibling of #12, for project creation | Same shape as #12, but both callers (`super_admin`/`operations_admin`) are exempt roles | n/a | **NO CHANGE REQUIRED — SAFE, confirmed.** Verified by direct `Read` (current `generateProjectCode`, `app/utils.js:269-309`): byte-identical query shape to RESEARCH baseline. `projects` create rule requires `hasRole(['super_admin','operations_admin'])` (both are in `PROJECT_SEE_ALL_ROLES`) — no scoped role ever reaches this function, so it needs no conversion now or after the rule tightens. | N/A — genuinely safe, no future plan needed |
| 14 | `app/views/services.js:872-904` (`loadServices`, `services_user` home-department branch) — services-side Shape E, not in RESEARCH.md's MUST-CONVERT table but flagged in its Risks section as "a ticking clock" | `where('service_code','in',assignedCodes)` (legacy array-based) | E | **CONVERTED.** `loadServices()` collapsed from a 3-way branch (role-literal `operations_user` array-contains / legacy `service_code in` / unscoped) to 2 branches: EVERY scoped role (`getAssignedServiceCodes()!==null`) now shares the identical `query(collection(db,'services'), where('personnel_user_ids','array-contains',uid))` (line 893, verified — this is the ONLY `array-contains` clause in the file and the ONLY `where` clause of any kind on the scoped branch). `git grep "where('service_code', 'in'" app` returns zero matches anywhere in the codebase — the legacy branch is fully retired, not just in this file. | 113-04 |
| 15 | `app/views/mrf-form.js` `loadServices()` (~1085-1103 baseline) — services-side Shape E | `where('service_code','in',assignedCodes)` | E | **CONVERTED.** Same two-branch collapse as row 14: scoped branch is `query(servicesRef, where('personnel_user_ids','array-contains',uid))` (line 1123), `active` enforced downstream in `rebuildPSOptions()` (unchanged). Verified by direct `Grep`/`Read`. | 113-06 |
| 16 | `app/views/procurement.js` `loadServicesForNewMRF()` (~2890-2909 baseline) — services-side Shape E | `where('service_code','in',assignedServiceCodes)` | E | **CONVERTED.** Same collapse: scoped branch is `query(collection(db,'services'), where('personnel_user_ids','array-contains',uid))` (line 2910), `active` re-applied client-side (line 2924). Legacy `in` branch and its `assignedServiceCodes.length===0` early return are both gone. Verified by direct `Read` (see excerpt above). | 113-06 |
| 17 | `app/views/clients.js:243` (`showClientDetail`, services dimension) — not separately numbered in RESEARCH.md (its table treats `clients.js:243` as a single row, but the function issues two independent queries) | `where('client_code','==', client.client_code)` against `services` | C-variant | **CONVERTED.** Same function as row 10, independently decided by `getAssignedServiceCodes()`: scoped role pairs `where('client_code','==',client.client_code)` with `where('personnel_user_ids','array-contains',uid)` (lines 278-282), served by the `services`×`client_code`×`personnel_user_ids` composite index (113-01/113-02). Verified by direct `Read`. | 113-07 |
| 18 | `app/utils.js` — `getAssignedProjectCodes()`/`getAssignedServiceCodes()` helper repoint itself | Read `user.assigned_project_codes`/`user.assigned_service_codes` off the actor's own cached user object (frozen-array-authoritative) | n/a (foundational, not a per-site conversion) | **CONVERTED.** Both helpers (`app/utils.js:464`, `app/utils.js:548`) now return `window._personnelAssignedCodes.projects`/`.services` — a live, listener-backed cache populated by `initAssignedCodesListeners()` via `where('personnel_user_ids','array-contains',uid)` listeners on `projects`/`services`, bootstrapped in `app/auth.js` before first route render. This is the foundational repoint every other row in this table depends on: rows 1-11 and 14-17 all call `getAssignedProjectCodes()`/`getAssignedServiceCodes()` rather than reading the legacy arrays directly. Verified by direct `Read`. | 113-03 |

**Every MUST-CONVERT row (1-11, 14-17) is CONVERTED. Rows 12 and 13 are NO CHANGE REQUIRED with a
stated reason, exactly as this plan's Task 2 instructs. Row 18 (the foundational helper repoint)
is CONVERTED. Every row above carries an explicit, evidenced verdict — none is left blank or
unresolved.**

---

## Section 2 — D-12 Inspection Sweep

Three verbatim searches, run across `app/` and `scripts/` at this commit, each hit classified as
**assignment-affecting** (a D-12 defect, must be fixed before this plan completes) or
**non-assignment** (permitted — `recordEditHistory`, `last_activity_at` bumps, and journal
auto-entries are explicitly out of D-12's scope per CONTEXT.md's D-12 wording and
113-PATTERNS.md's Shared Patterns note).

### (a) `.catch(` on a line/statement also mentioning `personnel`/`assign`/`Assignment`/`Personnel`

```
$ grep -rn "\.catch(" app scripts --include="*.js" | grep -iE "personnel|assign"
app/views/project-detail.js:1640:        ]).catch(err => console.error('[EditHistory] selectPersonnel failed:', err));
app/views/project-detail.js:1681:        ]).catch(err => console.error('[EditHistory] removePersonnel failed:', err));
app/views/service-detail.js:1165:        ], 'services').catch(err => console.error('[EditHistory] selectDetailServicePersonnel failed:', err));
app/views/service-detail.js:1214:        ], 'services').catch(err => console.error('[EditHistory] removeDetailServicePersonnel failed:', err));
```

**Classification — all 4 hits: non-assignment.** Each is the `recordEditHistory(...)` call that
runs AFTER the actual personnel write. In all 4 cases the actual assignment mutation is a separate,
already-`await`ed `updateDoc(doc(db,'projects'|'services', id), { personnel_user_ids: ... })` a few
lines above (verified: `project-detail.js:1629-1630`/`1670-1671`, `service-detail.js:1153-1154`/
`1202-1203`), wrapped in its own `try/catch` with `showToast(..., 'error')` on failure. The
`.catch()` shown here only governs the secondary edit-history bookkeeping write, which
113-PATTERNS.md's Shared Patterns section explicitly carves out of D-12 ("recordEditHistory...
explicitly out of D-12's scope"). Zero assignment-affecting hits in this search.

### (b) `updateDoc(` statements that write `personnel_user_ids`, with await status

```
$ grep -rn -B2 "personnel_user_ids:" app scripts --include="*.js"
app/views/assignments.js:625:            await updateDoc(doc(db, type, id), {
app/views/assignments.js:626:                personnel_user_ids: arrayUnion(userId),
app/views/assignments.js:639:            await updateDoc(doc(db, type, id), {
app/views/assignments.js:640:                personnel_user_ids: arrayRemove(userId),
app/views/project-detail.js:1629:        await updateDoc(doc(db, 'projects', currentProject.id), {
app/views/project-detail.js:1630:            personnel_user_ids: detailSelectedPersonnel.map(u => u.id).filter(Boolean),
app/views/project-detail.js:1670:        await updateDoc(doc(db, 'projects', currentProject.id), {
app/views/project-detail.js:1671:            personnel_user_ids: detailSelectedPersonnel.map(u => u.id).filter(Boolean),
app/views/service-detail.js:1153:        await updateDoc(doc(db, 'services', currentServiceDocId), {
app/views/service-detail.js:1154:            personnel_user_ids: newUserIds,
app/views/service-detail.js:1202:        await updateDoc(doc(db, 'services', currentServiceDocId), {
app/views/service-detail.js:1203:            personnel_user_ids: newUserIds,
app/views/projects.js:1316:        personnel_user_ids: selectedPersonnel.map(u => u.id).filter(Boolean),   [in personnelUpdate object literal, spread at line 1403 into: await updateDoc(projectRef, { ...personnelUpdate, ... })]
app/views/services.js:1338:        personnel_user_ids: selectedPersonnel.map(u => u.id).filter(Boolean),   [in personnelUpdate object literal, spread at line 1431 into: await updateDoc(serviceRef, { ...personnelUpdate, ... })]
app/engagement-create.js:68,87:  personnel_user_ids   [in finalShape object literal, written via: const docRef = await addDoc(collection(db, collectionName), finalShape);]
```

**Classification — all 9 write sites: AWAITED, no defect.**
- `assignments.js:625-626`, `639-640` — inside `saveManageModal`'s per-container `for` loop, each
  `updateDoc` is `await`ed inside its own `try/catch`; failures are collected into `containerErrors`
  and surfaced via one error toast after the loop (113-08-SUMMARY.md's documented pattern; verified
  by `grep -n "\.catch(" app/views/assignments.js` returning **zero** matches — confirming no
  promise chain in this file is ever fire-and-forget).
- `project-detail.js:1629-1630`/`1670-1671` — each inside a `try` block whose `catch` calls
  `showToast('Failed to add/remove personnel', 'error')` and rolls back optimistic local state.
- `service-detail.js:1153-1154`/`1202-1203` — identical shape/pattern to project-detail.js.
- `projects.js:1316`→`1403` / `services.js:1338`→`1431` — the `personnelUpdate` object (built at
  the first line) is spread into a single `await updateDoc(...)` call several lines later (verified
  by reading both call sites directly); the write is awaited inside `saveEdit`'s/`saveServiceEdit`'s
  `try` block.
- `engagement-create.js:68,87`→`98` — `personnel_user_ids` is part of `finalShape`, written via
  `const docRef = await addDoc(collection(db, collectionName), finalShape);` — awaited at
  container-creation time.

Zero assignment-affecting hits with a missing `await` in this search.

### (c) `console.error` inside a `.catch(` arrow on an assignment path

```
$ grep -rn "\.catch(err => console\.error" app scripts --include="*.js"
app/engagement-create.js:126:        .catch(err => console.error('[engagement-create] recordEditHistory failed:', err));
app/proposal-modal.js:1353:            .catch(err => console.error('[ProposalModal] NOTIF-11 (loss) failed:', err));
app/proposal-modal.js:1489:            .catch(err => console.error('[ProposalModal] NOTIF-11 (client approved) failed:', err));
app/views/project-detail.js:1640:        ]).catch(err => console.error('[EditHistory] selectPersonnel failed:', err));
app/views/project-detail.js:1681:        ]).catch(err => console.error('[EditHistory] removePersonnel failed:', err));
app/views/project-detail.js:1744:        ]).catch(err => console.error('[EditHistory] saveField failed:', err));
app/views/project-detail.js:1762:                }).catch(err => console.error('[ProjectDetail] NOTIF-11 notification failed:', err));
app/views/project-detail.js:1785:                }).catch(err => console.error('[ProjectDetail] NOTIF-19 cost-change notification failed:', err));
app/views/project-detail.js:1793:            }).catch(err => console.error('[ProjectDetail] Journal cost-change auto-entry failed:', err));
app/views/project-detail.js:1919:        ]).catch(err => console.error('[EditHistory] toggleActive failed:', err));
app/views/project-detail.js:2227:        ]).catch(err => console.error('[EditHistory] code_issued failed:', err));
app/views/project-detail.js:4197:                .catch(err => console.error('[ProjectDetail] submitProjectLoss recordEditHistory failed:', err));
app/views/project-detail.js:4213:                }).catch(err => console.error('[ProjectDetail] submitProjectLoss NOTIF-11 failed:', err));
app/views/project-detail.js:4218:                .catch(err => console.error('[ProjectDetail] submitProjectLoss audit entry failed:', err));
app/views/project-detail.js:4220:                .catch(err => console.error('[ProjectDetail] submitProjectLoss activity entry failed:', err));
app/views/projects.js:1448:                .catch(err => console.error('[EditHistory] saveEdit failed:', err));
app/views/projects.js:1513:        ]).catch(err => console.error('[EditHistory] toggleProjectActive failed:', err));
app/views/service-detail.js:1165:        ], 'services').catch(err => console.error('[EditHistory] selectDetailServicePersonnel failed:', err));
app/views/service-detail.js:1214:        ], 'services').catch(err => console.error('[EditHistory] removeDetailServicePersonnel failed:', err));
app/views/service-detail.js:1311:        ], 'services').catch(err => console.error('[EditHistory] saveServiceField failed:', err));
app/views/service-detail.js:1325:            }).catch(err => console.error('[ServiceDetail] NOTIF-11 notification failed:', err));
app/views/service-detail.js:1338:            }).catch(err => console.error('[ServiceDetail] NOTIF-19 cost-change notification failed:', err));
app/views/service-detail.js:1347:            }).catch(err => console.error('[ServiceDetail/Journal] cost-change auto-entry failed:', err));
app/views/service-detail.js:1385:        ], 'services').catch(err => console.error('[EditHistory] toggleServiceDetailActive failed:', err));
app/views/service-detail.js:3811:                .catch(err => console.error('[ServiceDetail] submitServiceLoss recordEditHistory failed:', err));
app/views/service-detail.js:3827:                }).catch(err => console.error('[ServiceDetail] submitServiceLoss NOTIF-11 failed:', err));
app/views/service-detail.js:3832:                .catch(err => console.error('[ServiceDetail] submitServiceLoss audit entry failed:', err));
app/views/service-detail.js:3834:                .catch(err => console.error('[ServiceDetail] submitServiceLoss activity entry failed:', err));
app/views/services.js:1479:                .catch(err => console.error('[EditHistory] saveServiceEdit failed:', err));
app/views/services.js:1551:        ], 'services').catch(err => console.error('[EditHistory] toggleServiceActive failed:', err));
```

**Classification — all 30 hits: non-assignment.** Every log tag identifies the secondary write it
guards, and none of them is the `personnel_user_ids` mutation itself:
- **`[EditHistory] *`** (14 hits) — `recordEditHistory(...)` calls, explicitly carved out of D-12's
  scope. This includes the 4 hits already covered in search (a); the remaining 10
  (`saveField`/`toggleActive`/`code_issued`/`toggleProjectActive`/`saveServiceField`/
  `toggleServiceDetailActive`/`toggleServiceActive`/`saveEdit`/`saveServiceEdit`) guard edit-history
  writes for NON-personnel field changes (status, active flag, code issuance, general field edits)
  — not assignment paths at all.
- **`NOTIF-11`/`NOTIF-19` (8 hits)** — in-app notification fan-out (loss submission, client-approved,
  cost-change), unrelated to personnel assignment.
- **`Journal ... cost-change auto-entry` (2 hits)** — system Activity Feed auto-entries, explicitly
  carved out of D-12's scope per 113-PATTERNS.md's Shared Patterns note ("journal auto-entries...
  out of scope").
- **`submitProjectLoss`/`submitServiceLoss` (8 hits: recordEditHistory / NOTIF-11 / audit entry /
  activity entry)** — all four are secondary bookkeeping on the Loss-submission path (status
  change), not a personnel write.
- **`recordEditHistory` in `engagement-create.js` (1 hit)** — the container-creation edit-history
  write, following the already-awaited `addDoc(...)` that writes `personnel_user_ids` (search (b)'s
  last row).

Zero assignment-affecting hits with a swallowed error in this search.

### Sweep result

**ZERO assignment-affecting fire-and-forget hits across all three searches.** Every
`.catch(err => console.error(...))` found is a secondary write (edit history, notification,
journal auto-entry, or audit/activity log) explicitly outside D-12's scope. Every write that
actually mutates `personnel_user_ids` is `await`ed inside a `try/catch` that surfaces failure via
`showToast(...)` (or, for `assignments.js`'s multi-container loop, an aggregate error-count toast)
— confirmed for all 9 write sites in search (b). This matches D-11's claim exactly: after this
plan, there is exactly one write per assignment (the container document's `personnel_user_ids`
array), and it is awaited and toasted at every call site. No fire-and-forget assignment write
remains anywhere in `app/` or `scripts/`.

---

## Section 3 — Residual and Deferred

- **`assigned_project_codes`/`assigned_service_codes` fields still exist on user documents and are
  now inert (D-08).** No migration was performed and none is needed — project and service
  documents were always written correctly under the old model (their own `personnel_user_ids`
  field was never derived from the legacy arrays), so repointing every read onto
  `personnel_user_ids` self-heals historical assignments with zero backfill (CONTEXT.md
  `specifics`, "no migration required"). Confirmed by this plan's Task 1: zero delete/overwrite of
  either field anywhere in the repository (`git grep` for a null-write or `deleteField()` call
  against either field returns no matches).

- **`app/views/procurement.js:3901`'s Create-MRF picker remains unscoped and is deferred to its
  own phase**, per CONTEXT.md's explicit `<deferred>` scoping (RESEARCH.md's line reference was
  `:3866`; the site has since shifted to `:3901` due to unrelated prior-phase edits to this file,
  confirmed by direct `Grep` — the code itself, `projectsData.map(...)` with no role/assignment
  filter, is unchanged). Its data source, `loadProjects()` (row 5 above), IS converted — so the
  picker's own leak is now bounded to the scoped role's own assigned projects rather than the
  entire collection, even though the picker's client-side filter itself is still unfixed.

- **`app/utils.js:564` (`getActiveProjects`) is dead code, left in place, flagged for opportunistic
  cleanup.** Confirmed by a repo-wide `Grep` for `getActiveProjects` across every `.js`/`.html`
  file: the only occurrences are its own `export async function getActiveProjects()` definition
  (line 564) and its inclusion in the `window.utils = {...}` object literal (line 771) — zero call
  sites anywhere else in `app/`, `scripts/`, or `index.html`. Left untouched per this plan's Task 1
  explicit instruction ("deleting it is out of scope").

- **`isMrfInAssignedScope()` was changed by comment only.** `git diff` from the pre-Phase-113
  baseline (`8591740`, the commit immediately before Phase 113's first commit) to the current HEAD,
  scoped to this function:

  ```
  $ git diff 8591740 HEAD -- app/views/procurement.js | grep -n "isMrfInAssignedScope\|projOk\|svcOk\|return projOk"
  50:+// local inside isMrfInAssignedScope() (below) is an unrelated function that filters MRF RECORDS
  102: function isMrfInAssignedScope(mrf) {
  ```

  Only two hits: one `+` line, which is a NEW comment inside `loadProjects()`'s doc-comment (an
  unrelated function, mentioning `isMrfInAssignedScope` by name only) — not inside the function
  itself; and one unchanged (no `+`/`-` prefix) context line showing the function's signature. The
  function's body — `projOk`, `svcOk`, and `return projOk || svcOk;` — produced **zero** diff
  lines. The D-04 no-leak union logic is provably byte-identical to its pre-Phase-113 state.

---

## Self-Check

- All 13 RESEARCH.md MUST-CONVERT rows disposed of: 11 CONVERTED (1-11), 2 NO CHANGE REQUIRED with
  stated reasons (12, 13).
- 5 additional rows (14-18) covering services-side Shape E, the `clients.js` services-dimension
  lookup, and the foundational `app/utils.js` helper repoint — all CONVERTED.
- Total CONVERTED count: 16 (rows 1-11, 14-18).
- Every row carries an explicit, evidenced verdict — none is left without a disposition.
- D-12 sweep: 3 searches run verbatim, all hits classified, zero assignment-affecting fire-and-forget
  writes found.
- `isMrfInAssignedScope()` diff confirmed comment-only.
