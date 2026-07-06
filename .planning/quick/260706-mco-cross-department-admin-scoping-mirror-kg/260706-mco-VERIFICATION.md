---
phase: quick-260706-mco
verified: 2026-07-06T08:53:24Z
status: passed
score: 7/7 must-have truths verified (code-static); Task 6 (browser UAT + rules deploy) is a documented pending human/manual step, not a gap
overrides_applied: 0
notes:
  - "Task 6 (checkpoint:human-verify gate=\"blocking\") was intentionally NOT executed by the executor per this quick task's own design (rules changes need a dev-project deploy + browser UAT before prod). Per the verification brief, its absence is NOT scored as a gap; it is carried forward as a required next step (see Human Verification Required below)."
---

# Quick 260706-mco: Cross-department admin scoping (mirror kg0) — Verification Report

**Task Goal:** Extend quick 260627-kg0's assignment-driven access model onto `operations_admin`/`services_admin` so an assigned cross-department admin behaves exactly like an assigned cross-department `*_user`: home dept unchanged (see-all + full admin); cross dept = assignment-scoped visibility + full member write rights (post/status/tasks/proposals); create/delete/personnel stay home-only.
**Verified:** 2026-07-06T08:53:24Z
**Status:** passed (code-static; browser UAT + rules deploy pending by design — see Human Verification section)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | operations_admin assigned to a service sees it and can post journal/progress/issues, advance every lifecycle gate except Completed, CRUD service tasks, create/edit service proposals | VERIFIED | `firestore.rules` services-update assigned branch (:588), `service_tasks` create/update-Tier1/Tier2/delete (:829/843/860/871), `proposals` BRANCH B/2 services (:945/996) all add `operations_admin` gated by `isAssignedToService`/personnel check. `service-detail.js` `_canAdvanceServiceStatus` (:2247-2251) admits `operations_admin` to the assignment branch, Completed exclusion (:2245) applies to everyone including it. `canDrive` (:1867-1871) moves it to `assignedRoles`. Logic script matrix: `operations_admin x S1 = true`. |
| 2 | services_admin assigned to a project sees it, posts journal/progress/issues, drives all project lifecycle gates (incl. Completed — project side has no exclusion), CRUD project tasks, create/edit project proposals | VERIFIED | `firestore.rules` projects-update BRANCH 2 (:223), `projects/audit_log` create (:292), `project_tasks` create/Tier1/Tier2/delete (:746/760/777/789), `proposals` BRANCH B/2 projects (:934/986) all add `services_admin` gated by `isAssignedToProject`/personnel check. `project-detail.js` `_canAdvanceProjectStatus` (:2935-2939) has NO Completed exclusion and admits `services_admin`. `canDrive` (:2482-2486) moved it to `assignedRoles`. Logic script matrix: `services_admin x P1 = true`. |
| 3 | operations_admin still sees ALL projects (home) with full admin; services_admin still sees ALL services (home) — home unchanged | VERIFIED | `app/utils.js` `PROJECT_SEE_ALL_ROLES` includes `operations_admin` (:318), `SERVICE_SEE_ALL_ROLES` includes `services_admin` (:319) — both return `null` (no filter) for their home dept. `project-detail.js`/`service-detail.js` `canDrive` `adminRoles` retain the home admin blanket (`['super_admin','operations_admin']` / `['super_admin','services_admin']`). Logic script matrix: `operations_admin` sees P1/P9/codeless/LEGACY=true; `services_admin` sees S1/S9=true. |
| 4 | Container powers do NOT cross: services_admin cannot create/delete a project or edit its personnel; operations_admin cannot create/delete a service or edit its personnel | VERIFIED | Diff of firestore.rules across the phase's commit range shows projects create/delete (:206/:260, `['super_admin','operations_admin']`) and services create/delete (:579/:593, `['super_admin','services_admin']`) are byte-identical to pre-phase. `canEditPersonnel` in `project-detail.js:610` (`super_admin\|\|operations_admin`) and `service-detail.js:818` (`super_admin\|\|services_admin`) are untouched (confirmed via git diff — zero hunks touching these lines). |
| 5 | Unassigned AND codeless cross-dept items stay hidden from a cross-dept admin (260615-nlj no-leak preserved) | VERIFIED | `isMrfInAssignedScope` (procurement.js:2980-2988) keys the null-dimension match off `mrf.department \|\| (mrf.service_code ? 'services':'projects')`, so a cross-dept admin's OWN cross-dimension is always a non-null assigned-codes array — unassigned/codeless items in that department match neither branch. Logic script matrix: `services_admin x P9=false, x codeless=false, x LEGACY=false`; `operations_admin x S9=false`. |
| 6 | super_admin/finance/procurement/operations_user/services_user behavior byte-identical to before | VERIFIED | `git diff` across the 5 touched files shows zero hunks referencing these 5 roles' existing branches (only additive `\|\| isRole('operations_admin')` / `\|\| isRole('services_admin')` clauses appended). Logic script matrix: `operations_user`/`services_user` both scopes remain non-null assigned arrays, assigned-only visibility unchanged; `super_admin`/`finance`/`procurement` both null / see-all-six unchanged. |
| 7 | Manage-save landmine defused: all_projects:false does NOT scope operations_admin out of its Projects dept (explicit role branch wins before the flag read) | VERIFIED | `app/utils.js:336` checks `PROJECT_SEE_ALL_ROLES.includes(user.role)` BEFORE the `user.all_projects === true` check at line 338 — the role branch returns `null` unconditionally for `operations_admin`, never reaching the flag. Script's explicit landmine assertions pass: `operations_admin` with `all_projects:false` → `null`; `services_admin` with `all_services:false` → `null`. |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/utils.js` | Per-department see-all branches (`PROJECT_SEE_ALL_ROLES`/`SERVICE_SEE_ALL_ROLES`), old `SCOPE_EXEMPT_ROLES` removed | VERIFIED | Confirmed present at :318-319; `grep -c SCOPE_EXEMPT_ROLES app/utils.js` = 0 (only appears in unrelated planning docs and this script's comments, not live code). `node --check` passes. |
| `app/views/procurement.js` | Department-keyed null-handling in `isMrfInAssignedScope` | VERIFIED | Function at :2980 rewritten exactly per plan (dept idiom, projOk/svcOk union). `node --check` passes. |
| `firestore.rules` | Symmetric assigned-member branches: `services_admin` on projects side, `operations_admin` on services side | VERIFIED | Full diff reviewed line-by-line across all 10 project-side + 10 service-side sites named in the plan — all present, all additive, all gated by `isRole(...) && isAssignedTo*(...)` (never blanket). Brace balance 81/81 (script-confirmed). |
| `app/views/project-detail.js` | Assignment-gated `services_admin` in canDrive/loss/lifecycle | VERIFIED | `canDrive` (:2482-2486), `LOSS_ASSIGNED_ROLES` (:2848), `_canAdvanceProjectStatus` (:2937) all updated exactly per plan. `canEditPersonnel` (:610) untouched. |
| `app/views/service-detail.js` | Assignment-gated `operations_admin` in canDrive/loss/lifecycle/save | VERIFIED | `saveServiceField`/`toggleServiceDetailActive` role gates (:1247/:1376), `canDrive` (:1867-1871), `_canAdvanceServiceStatus` (:2247-2251), `LOSS_ASSIGNED_ROLES` (:2580) all updated exactly per plan. `canEditPersonnel` (:818) and container-admin gate (:173) untouched. |
| `app/views/assignments.js` | Cross-dept admin grid rows | VERIFIED | Projects grid (:265-266) adds `services_admin`-with-codes row; Services grid (:268-269) adds `operations_admin`-with-codes row. `getVisibleSubTabs` (:45-56) and `saveManageModal` untouched. |
| `scripts/verify-crossdept-admin-scoping.js` | Node logic-assertion harness proving the full matrix + rules brace balance | VERIFIED | Executed directly: exit 0, full 7-role x 6-record visibility matrix + 2 landmine assertions + brace-balance check all pass. Extracts and evals the REAL source functions (no re-implementation) — confirmed by reading the script source. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/utils.js getAssignedProjectCodes/getAssignedServiceCodes` | `app/views/procurement.js isMrfInAssignedScope` | `null = see-all` contract | WIRED | `procurement.js:2981-2982` calls `window.getAssignedProjectCodes?.()`/`getAssignedServiceCodes?.()`, which are exposed via `window.getAssignedProjectCodes = getAssignedProjectCodes;` at `utils.js:649/651`. The null-dimension semantics match exactly (verified live by the logic script's Part 2 matrix). |
| `app/views/procurement.js isMrfInAssignedScope` | `mrf.department` | department-keyed null-dimension match | WIRED | Line 2984 idiom `mrf.department \|\| (mrf.service_code ? 'services' : 'projects')` used consistently for both projOk/svcOk resolution. |
| `firestore.rules` services update assigned branch | `isAssignedToService(resource.data.service_code)` | operations_admin assigned-member write | WIRED | Line 588: `(isRole('operations_admin') && isAssignedToService(resource.data.service_code))` — short-circuit guard confirmed (role check before code dereference). |
| `firestore.rules` projects update BRANCH 2 | `resource.data.personnel_user_ids` | services_admin field-masked lifecycle write | WIRED | Line 223-224: `services_admin` added to the role disjunction, `request.auth.uid in resource.data.personnel_user_ids` check retained unconditionally for the whole branch. |

### Data-Flow Trace (Level 4)

Not applicable in the conventional sense (this phase changes authorization/scoping logic, not UI data rendering) — the "data flow" here is the role → scope-helper → visibility-predicate chain, which is what the Key Link table above and the logic-assertion script's live matrix both trace end-to-end using the actual extracted source functions (not mocked/re-implemented).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full role x scope-helper x visibility x rules-brace-balance matrix | `node scripts/verify-crossdept-admin-scoping.js` | Exit 0; all assertions passed; matrix matches spec exactly (see below) | PASS |
| Static syntax validity | `node --check` on all 6 touched/created .js files | All pass | PASS |

Matrix printed by the script (re-run independently during this verification, matches SUMMARY claim byte-for-byte):
```
=== Role x Scope-Helper Matrix ===
  operations_admin   projects=null           services=["S1"]
  services_admin     projects=["P1"]         services=null
  operations_user    projects=["P1"]         services=["S1"]
  services_user      projects=["P1"]         services=["S1"]
  super_admin        projects=null           services=null
  finance            projects=null           services=null
  procurement        projects=null           services=null

=== Role x MRF-Visibility Matrix ===
                    P1        P9        codeless  LEGACY    S1        S9
  operations_admin  true      true      true      true      true      false
  services_admin    true      false     false     false     true      true
  operations_user   true      false     false     false     true      false
  services_user     true      false     false     false     true      false
  super_admin       true      true      true      true      true      true

=== firestore.rules brace balance ===
  { count = 81, } count = 81

All assertions passed. Full role x visibility matrix holds.
EXIT_CODE=0
```

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `scripts/verify-crossdept-admin-scoping.js` | `node scripts/verify-crossdept-admin-scoping.js` | Exit 0, matrix matches expected spec exactly (independently re-run, not just quoted from SUMMARY) | PASS |

### Requirements Coverage

No `.planning/REQUIREMENTS.md` exists in this project (quick-task workflow, not phase workflow) — the PLAN's own `requirements:` field (`MCO-L1-client-scoping, MCO-L2-scope-union, MCO-L3-rules, MCO-L4-ui, MCO-TESTS`) is a self-contained quick-task ID list, not externally tracked. All five map 1:1 to Tasks 1-5, all verified above (L1→utils.js, L2→procurement.js, L3→firestore.rules, L4→UI files, TESTS→the logic-assertion script).

### Anti-Patterns Found

None. Diffed every touched file across the phase's commit range (`93734f1~1..41c4272`) for TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers — zero matches in the added lines. All additions are small, additive, mirror an existing pattern exactly, and are documented with `// Quick 260706-mco:` comments as the plan required.

### Human Verification Required

These are the documented, intentionally-deferred Task 6 items (`checkpoint:human-verify gate="blocking"` in the PLAN) — NOT scored as gaps per this verification's explicit brief, since Task 6 was never claimed as executed and the SUMMARY is explicit that it is pending-on-user.

### 1. Dev rules deploy

**Test:** Run `firebase deploy --only firestore:rules --project dev`.
**Expected:** Deploy succeeds with no compile errors (brace balance already statically confirmed at 81/81).
**Why human:** Requires Firebase CLI credentials and a live deploy action — not observable from static source.

### 2. Browser UAT scenarios 1-6 (per PLAN Task 6)

**Test:** With real accounts on `python -m http.server 8000` against the dev-deployed rules: (1) home see-all for operations_admin/services_admin incl. all_projects:false regression guard, (2) cross assigned-only view via Personnel-editor assignment, (3) cross member writes (journal/progress/issues/lifecycle/tasks/proposals), (4) cross container powers blocked (create/delete/personnel/Completed-gate), (5) *_user/other-role regression, (6) Manage-save landmine guard end-to-end in the live UI.
**Expected:** Zero permission-denied errors on intended paths; all 6 scenarios behave as the logic-assertion matrix predicts.
**Why human:** Real-time Firestore rule enforcement, browser console behavior, and UI affordance visibility cannot be verified by static grep — this is genuine runtime behavior requiring a live Firebase project and DevTools observation.

### 3. Production rules deploy (final flagged step)

**Test:** After dev UAT approval, run `firebase deploy --only firestore:rules` against production.
**Expected:** Rules go live in prod; rides the standing v3.3→main rules-deploy debt already tracked in STATE.md.
**Why human:** Production deploy is an explicit, deliberate manual gate — not something a verifier should trigger.

### Gaps Summary

No code-level gaps found. All 7 must-have truths from the PLAN frontmatter are verified against the actual source (not SUMMARY claims) via: (a) independent re-run of the logic-assertion script producing the exact same matrix as claimed, (b) line-by-line review of every diff hunk across `firestore.rules` and the 5 touched `.js` files against the plan's per-site instructions, (c) confirmation that every LOCKED item (create/delete gates, `canEditPersonnel`, `getVisibleSubTabs`) is byte-unchanged via `git diff`, and (d) `node --check` passing on all touched/created files. Task 6 (browser UAT + firestore.rules deploy) is intentionally pending on the user as the final manual gate this quick task was designed to stop before — its non-execution is expected, documented in the SUMMARY, and does not indicate incomplete or incorrect code.

---

_Verified: 2026-07-06T08:53:24Z_
_Verifier: Claude (gsd-verifier)_
