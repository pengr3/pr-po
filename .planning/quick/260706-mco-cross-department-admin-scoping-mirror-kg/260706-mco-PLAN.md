---
phase: quick-260706-mco
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/utils.js
  - app/views/procurement.js
  - firestore.rules
  - app/views/project-detail.js
  - app/views/service-detail.js
  - app/views/assignments.js
  - scripts/verify-crossdept-admin-scoping.js
autonomous: false
requirements: [MCO-L1-client-scoping, MCO-L2-scope-union, MCO-L3-rules, MCO-L4-ui, MCO-TESTS]

must_haves:
  truths:
    - "An operations_admin assigned to a service sees that service's MRF/PR/PO records and can post journal/progress/issues, change service status/lifecycle (every gate except Completed), create/edit/delete service tasks, and create/edit service proposals."
    - "A services_admin assigned to a project sees that project's records and can post journal/progress/issues, drive project lifecycle gates, create/edit/delete project tasks, and create/edit project proposals."
    - "An operations_admin still sees ALL projects (home dept) with full admin powers; a services_admin still sees ALL services (home dept) — home behavior unchanged."
    - "Container powers do NOT cross: a services_admin cannot create/delete a project or edit its personnel; an operations_admin cannot create/delete a service or edit its personnel."
    - "Unassigned AND codeless cross-department items stay hidden from a cross-dept admin (260615-nlj no-leak invariant preserved)."
    - "super_admin, finance, procurement, operations_user, services_user behavior is byte-identical to before this change."
    - "Manage-save landmine defused: writing all_projects:false on a Manage save does NOT scope operations_admin out of its own Projects department (explicit role branch returns null before the flag is read)."
  artifacts:
    - path: "app/utils.js"
      provides: "Per-department see-all role branches in getAssignedProjectCodes/getAssignedServiceCodes (services_admin scoped on projects, operations_admin scoped on services)"
      contains: "PROJECT_SEE_ALL_ROLES"
    - path: "app/views/procurement.js"
      provides: "Department-keyed null-handling in isMrfInAssignedScope (null dimension matches all records of that department)"
      contains: "isMrfInAssignedScope"
    - path: "firestore.rules"
      provides: "Symmetric assigned-member write branches: services_admin on projects side, operations_admin on services side"
      contains: "services_admin"
    - path: "app/views/project-detail.js"
      provides: "Assignment-gated services_admin in canDrive / loss / lifecycle gates"
    - path: "app/views/service-detail.js"
      provides: "Assignment-gated operations_admin in canDrive / loss / lifecycle / save gates"
    - path: "app/views/assignments.js"
      provides: "Cross-dept admin grid rows (services_admin in Projects grid when it holds assigned_project_codes; operations_admin in Services grid)"
    - path: "scripts/verify-crossdept-admin-scoping.js"
      provides: "Node logic-assertion script proving the full role x visibility matrix against the real source functions + firestore.rules brace balance"
  key_links:
    - from: "app/utils.js getAssignedProjectCodes/getAssignedServiceCodes"
      to: "app/views/procurement.js isMrfInAssignedScope"
      via: "null = see-all contract"
      pattern: "getAssigned(Project|Service)Codes"
    - from: "app/views/procurement.js isMrfInAssignedScope"
      to: "mrf.department"
      via: "department-keyed null-dimension match"
      pattern: "mrf\\.department"
    - from: "firestore.rules services update assigned branch"
      to: "isAssignedToService(resource.data.service_code)"
      via: "operations_admin assigned-member write"
      pattern: "operations_admin.*isAssignedToService"
    - from: "firestore.rules projects update BRANCH 2"
      to: "resource.data.personnel_user_ids"
      via: "services_admin field-masked lifecycle write"
      pattern: "services_admin"
---

<objective>
Extend quick 260627-kg0's assignment-driven access model onto the two department-admin roles kg0 left as see-all. An **assigned** cross-department admin must behave EXACTLY like an **assigned** cross-department `*_user` under kg0: home department unchanged (see-all + full admin), cross department = assignment-scoped visibility + full MEMBER write rights, with container-level powers (create/delete the container, edit personnel) staying home-only.

Mirror direction:
- `services_admin` (home = services) gains kg0's `services_user`-cross-to-projects rights on **assigned** projects.
- `operations_admin` (home = projects) gains kg0's `operations_user`-cross-to-services rights on **assigned** services.

Purpose: close the last department wall kg0 deliberately deferred, keeping the assignment-driven model complete and symmetric.
Output: 4-layer change (client scoping, scope-union fix, firestore.rules, UI affordances) + a runnable logic-assertion script + a browser UAT checklist. Firestore rules deploy is a FINAL FLAGGED MANUAL STEP for the user — NOT executed by the executor.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

Key rules from CLAUDE.md that apply here: status matching is CASE-SENSITIVE; view module lifecycle (render/init/destroy); no build/test/lint — verification is `node --check` + a hand-rolled node assertion script; writes hit production Firebase (dev project used for rules deploy).

No worktree isolation (Windows long-path limit breaks worktrees on this repo — inline edits only).

<interfaces>
<!-- Current source the executor edits. Use these anchors directly — do not re-explore. -->

app/utils.js — CURRENT (single shared exempt set — to be SPLIT per-department):
```javascript
// line 314
const SCOPE_EXEMPT_ROLES = ['super_admin', 'operations_admin', 'services_admin', 'finance', 'procurement'];

// getAssignedProjectCodes (~326)
export function getAssignedProjectCodes() {
    const user = window.getCurrentUser?.();
    if (!user) return null;
    if (SCOPE_EXEMPT_ROLES.includes(user.role)) return null;
    if (user.all_projects === true) return null;
    return Array.isArray(user.assigned_project_codes) ? user.assigned_project_codes : [];
}
// getAssignedServiceCodes (~404) — symmetric, uses all_services + assigned_service_codes
```
SCOPE_EXEMPT_ROLES has NO other consumers (grep-confirmed: only utils.js lines 314/329/407).

app/views/procurement.js — CURRENT isMrfInAssignedScope (~2975), the AND-collapse bug:
```javascript
function isMrfInAssignedScope(mrf) {
    const projScope = window.getAssignedProjectCodes?.();
    const svcScope  = window.getAssignedServiceCodes?.();
    if (projScope === null && svcScope === null) return true;
    const matchesProject = projScope !== null && projScope.includes(mrf.project_code);
    const matchesService = svcScope  !== null && svcScope.includes(mrf.service_code);
    return matchesProject || matchesService;   // BUG: null dimension contributes false → home dept vanishes for the new admin state
}
```
Existing codebase idiom for resolving an MRF's department (procurement.js:5499) — `mrf.department` can be ABSENT on legacy MRFs:
```javascript
const mrfDept = mrf.department || (mrf.service_code ? 'services' : 'projects');
```

firestore.rules — helpers (~72/87) and the kg0-touched branches (executor adds the mirror admin):
- isAssignedToProject(code) @72, isAssignedToService(code) @87 (both short-circuit on all_* then check assigned_*_codes).
- projects update BRANCH 2 @222: `(isRole('operations_user') || isRole('services_user')) && request.auth.uid in resource.data.personnel_user_ids && ...hasOnly([field-mask])`.
- projects/edit_history create @267: `hasRole(['super_admin','operations_admin','services_admin','finance'])` — ALREADY lists services_admin.
- projects/audit_log create @286-289: admin OR (operations_user assigned) OR (services_user assigned).
- projects activity_entries/progress_updates/issues @298-327: `isActiveUser()` create (services_admin already qualifies).
- project_tasks create @731 / update Tier1 @741 / Tier2 @747 / delete @766 (isAssignedToProject / assignees).
- services update assigned branch @580-585: admin OR (services_user assigned) OR (operations_user assigned) OR (finance field-mask).
- services/edit_history create @593: `hasRole(['super_admin','services_admin','services_user'])` — MISSING operations_admin (the edit_history asymmetry).
- services/audit_log create @602-605: admin OR (services_user assigned) OR (operations_user assigned).
- service_tasks create @802 / update Tier1 @812 / Tier2 @818 / delete @837 (isAssignedToService / assignees).
- proposals create BRANCH A @893 (super_admin+operations_admin, blanket) / BRANCH B projects @900 / BRANCH B services @908.
- proposals update BRANCH 1 @933 (super_admin+operations_admin, blanket) / BRANCH 2 projects @948 / BRANCH 2 services @956.
- LOCKED (assert unchanged): projects create @206, projects delete @259, services create @576, services delete @588.

app/views/project-detail.js — canDrive @2482-2486 (`adminRoles=['super_admin','operations_admin','services_admin']; assignedRoles=['operations_user','services_user']`); LOSS_ASSIGNED_ROLES @2844; lifecycle gate @2932-2938; canEditPersonnel @610 (super_admin||operations_admin — LOCKED). Save gates (saveField etc.) use only `canEditTab('projects') === false` — services_admin passes canEditTab (role_templates projects.edit=true) so no save-gate role-list edit is needed on the projects side.

app/views/service-detail.js — saveServiceField role gate @1247 and toggleServiceDetailActive role gate @1376 (`['super_admin','services_admin','services_user','operations_user']` — MISSING operations_admin); canDrive @1867-1871; lifecycle gate @2244-2251 (Completed exclusion @2245 stays); LOSS_ASSIGNED_ROLES @2575; canEditPersonnel @818 (super_admin||services_admin — LOCKED); admin-only gate @173 (services_admin||super_admin — LOCKED, container-level).

app/views/assignments.js — grid filters @261-271 (add cross-dept admin rows), getVisibleSubTabs @45-56 (LOCKED — home-dept restriction), saveManageModal @571-573 (writes all_projects:false — the landmine source, do NOT change).

app/seed-roles.js — role_templates confirmed: operations_admin.services.edit=true; services_admin.projects.edit=true. Cross-dept edit:true STAYS (do NOT flip).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write the cross-dept-admin scoping logic-assertion script (RED baseline)</name>
  <files>scripts/verify-crossdept-admin-scoping.js</files>
  <action>
Create a plain-node (no Firebase) assertion script that executes the REAL source functions so there is a single source of truth. It runs against the live files, so it FAILS now (RED) and passes only after Tasks 2 + 3 land.

Extraction approach (zero-build ES-module + Firebase-CDN constraint means a plain `import` of utils.js/procurement.js is impossible — they import from ./firebase.js which reaches the CDN): read each file as text; for each target function locate its `function NAME(` declaration, brace-count from the first `{` after the signature to the matching close, slice that text, strip a leading `export ` — this gives the function-declaration string.

**PLAN-CHECK BLOCKER FIX (module-scope const dependency):** `getAssignedProjectCodes`/`getAssignedServiceCodes` reference a MODULE-SCOPE role-list const declared OUTSIDE their bodies (`SCOPE_EXEMPT_ROLES` before Task 2; `PROJECT_SEE_ALL_ROLES` / `SERVICE_SEE_ALL_ROLES` after Task 2). Extracting only the function body would throw `ReferenceError` on every call — a crash, not a controlled assertion — so RED would "pass" for the wrong reason and GREEN (Task 3 verify) could NEVER be reached even with correct code. To fix this name-agnostically (works both before and after the Task 2 rename): FIRST scan `app/utils.js` for every top-level `const <UPPER_SNAKE_CASE> = [ ... ];` array-literal declaration and collect their source text; then build ONE eval blob = (all those collected const declarations) + (the two extracted `getAssigned*` function declarations) concatenated together, and `eval` it ONCE in a shared scope so the functions close over the consts. Capture the two functions out of that shared scope (e.g. assign them to outer `let`s inside the eval string, or return them). Set `global.window` before invoking. `isMrfInAssignedScope` (from app/views/procurement.js) references only `window` and has NO module-scope-const dependency — extract and eval it standalone as before. Do NOT re-implement any helper; always call the extracted real functions.

Per role, set `global.window = { getCurrentUser: () => userStub }` with the role plus assigned_project_codes / assigned_service_codes / all_projects / all_services / uid, then assert getAssignedProjectCodes() and getAssignedServiceCodes() equal the expected matrix:
  - operations_admin -> projects=null, services=['S1']
  - services_admin   -> projects=['P1'], services=null
  - operations_user  -> projects=['P1'], services=['S1'] (both assigned arrays)
  - services_user    -> projects=['P1'], services=['S1'] (both assigned arrays)
  - super_admin / finance / procurement -> both null
LANDMINE assertion (must be explicit): operations_admin with all_projects:false STILL returns projects=null (the explicit role branch must win before the flag is read); symmetrically services_admin with all_services:false STILL returns services=null.

Then wire `global.window.getAssignedProjectCodes` / `global.window.getAssignedServiceCodes` to the extracted functions and assert isMrfInAssignedScope for sample MRFs P1{department:'projects',project_code:'P1'}, P9{department:'projects',project_code:'P9'}, codeless{department:'projects',project_code:''}, LEGACY{project_code:'PX'} (NO department field — legacy), S1{department:'services',service_code:'S1'}, S9{department:'services',service_code:'S9'} per role, proving:
  - operations_admin sees P1, P9, codeless, LEGACY, S1 — NOT S9
  - services_admin sees P1, S1, S9 — NOT P9, NOT codeless (and NOT LEGACY: an unassigned project code)
  - operations_user & services_user see only assigned (P1, S1) — nothing else
  - super_admin sees all six
Add a firestore.rules brace-balance check (count `{` vs `}`, fail on mismatch) so Task 4 cannot silently unbalance the file.
Exit non-zero with a clear per-assertion message on any failure; on full pass print the role x visibility matrix and exit 0. Do NOT hardcode expected results by re-implementing the helpers — always call the extracted real functions.
  </action>
  <verify>
    <automated>node --check scripts/verify-crossdept-admin-scoping.js  # syntax valid</automated>
    <automated>node scripts/verify-crossdept-admin-scoping.js; test $? -ne 0 && echo "RED confirmed (admin matrix not yet satisfied)"  # expected NON-zero against current code</automated>
  </verify>
  <done>Script syntactically valid; running it against unmodified utils.js/procurement.js exits non-zero (RED) because the admin rows do not yet hold.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: LAYER 1 — split SCOPE_EXEMPT_ROLES into per-department see-all branches (app/utils.js)</name>
  <files>app/utils.js</files>
  <behavior>
    - getAssignedProjectCodes: null for super_admin/finance/procurement/operations_admin; services_admin falls through (all_projects check, then assigned_project_codes); *_user unchanged.
    - getAssignedServiceCodes: null for super_admin/finance/procurement/services_admin; operations_admin falls through (all_services check, then assigned_service_codes); *_user unchanged.
    - Not-logged-in returns null in both; fail-closed Array.isArray(...) ? ... : [] default preserved.
    - operations_admin with all_projects:false STILL returns projects=null (role branch wins).
  </behavior>
  <action>
Replace the single `SCOPE_EXEMPT_ROLES` const (line 314) with two per-department constants using EXPLICIT role branches (per the design's regression note — do NOT gate on the all_projects/all_services flags, which saveManageModal sets false):
  PROJECT_SEE_ALL_ROLES = ['super_admin', 'finance', 'procurement', 'operations_admin']  (projects = operations home dept)
  SERVICE_SEE_ALL_ROLES = ['super_admin', 'finance', 'procurement', 'services_admin']    (services = services home dept)
In getAssignedProjectCodes replace `if (SCOPE_EXEMPT_ROLES.includes(user.role)) return null;` with `if (PROJECT_SEE_ALL_ROLES.includes(user.role)) return null;`. services_admin is intentionally absent, so it falls through to the existing `if (user.all_projects === true) return null;` escape hatch and the fail-closed `Array.isArray(user.assigned_project_codes) ? ... : []` return.
In getAssignedServiceCodes replace the same gate with `SERVICE_SEE_ALL_ROLES.includes(user.role)`. operations_admin is absent, so it falls through to the all_services escape hatch and assigned_service_codes.
Keep the not-logged-in `if (!user) return null;`, the escape-hatch checks, and the fail-closed defaults exactly as-is. Update the block comment at ~311 to explain the per-department split and cite quick 260706-mco. Confirm no remaining reference to the old SCOPE_EXEMPT_ROLES name anywhere.
  </action>
  <verify>
    <automated>node --check app/utils.js</automated>
    <automated>grep -c "SCOPE_EXEMPT_ROLES" app/utils.js  # expect 0 — old name fully removed</automated>
    <automated>grep -c "PROJECT_SEE_ALL_ROLES\|SERVICE_SEE_ALL_ROLES" app/utils.js  # expect >=4 (2 defs + 2 gates)</automated>
  </verify>
  <done>Both helpers use per-department see-all branches; old SCOPE_EXEMPT_ROLES gone; node --check passes. (Full behavioral matrix goes green after Task 3.)</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: LAYER 2 — department-keyed null-handling in isMrfInAssignedScope (app/views/procurement.js)</name>
  <files>app/views/procurement.js</files>
  <behavior>
    - Both scopes null (see-all role) -> true (unchanged early return).
    - A null dimension matches ALL records of that department; a non-null (array) dimension matches only records whose code is IN the array.
    - operations_admin (projScope=null, svcScope=['S1']) sees every project MRF incl. codeless + legacy(no department) + assigned service S1; hides unassigned service S9.
    - services_admin (projScope=['P1'], svcScope=null) sees assigned project P1 + every service MRF; hides unassigned/codeless project MRFs.
    - *_user (both arrays) unchanged: assigned-only, no-leak preserved.
  </behavior>
  <action>
Rewrite the tail of isMrfInAssignedScope (~2979-2981) so a null scope dimension matches every record of that department instead of contributing false. Keep the existing `if (projScope === null && svcScope === null) return true;` early return. Resolve the record's department with the established codebase idiom (procurement.js:5499) rather than raw `mrf.department`, because legacy MRFs lack the field and the design's goal is that codeless/legacy PROJECT MRFs are NOT wrongly hidden: `const dept = mrf.department || (mrf.service_code ? 'services' : 'projects');`. Then:
  projOk = (projScope === null) ? (dept === 'projects') : projScope.includes(mrf.project_code)
  svcOk  = (svcScope  === null) ? (dept === 'services')  : svcScope.includes(mrf.service_code)
  return projOk || svcOk
Do NOT key off `!!mrf.project_code` (would hide codeless project MRFs). This preserves the 260615-nlj no-leak invariant: a cross-dept admin's cross dimension is a non-null array, so unassigned AND codeless cross-dept items match neither branch and stay hidden. Update the block comment to cite quick 260706-mco and note the department-keyed null handling + the legacy-department fallback rationale.
  </action>
  <verify>
    <automated>node --check app/views/procurement.js</automated>
    <automated>node scripts/verify-crossdept-admin-scoping.js  # now GREEN — full helper + visibility matrix (Tasks 2+3) passes, exit 0</automated>
  </verify>
  <done>isMrfInAssignedScope is department-keyed; the logic-assertion script exits 0 with the full matrix (operations_admin sees home projects incl. codeless/legacy + assigned S1 only; services_admin sees home services + assigned P1 only; *_user assigned-only; super_admin all).</done>
</task>

<task type="auto">
  <name>Task 4: LAYER 3 — symmetric assigned-member write branches in firestore.rules</name>
  <files>firestore.rules</files>
  <action>
Add each cross-dept admin to the SAME kg0 assigned-member branches with the IDENTICAL assigned-member constraint (never a blanket grant). Preserve every isRole(...) short-circuit that guards a personnel_user_ids / assigned_*_codes dereference (T-105-03 pattern). Add a short `// Quick 260706-mco:` comment at each site.

PROJECTS side — add services_admin (mirror the existing services_user cross-branch exactly):
  - projects update BRANCH 2 (@222): extend the role group to `(isRole('operations_user') || isRole('services_user') || isRole('services_admin'))`; the `&& request.auth.uid in resource.data.personnel_user_ids && ...hasOnly([field-mask])` stays — services_admin gets the same field-masked lifecycle write ONLY when in personnel.
  - projects/audit_log create (@286-289): add `|| (isRole('services_admin') && request.auth.uid in get(/databases/$(database)/documents/projects/$(projectId)).data.personnel_user_ids)`.
  - project_tasks create (@731): add `|| (isRole('services_admin') && isAssignedToProject(request.resource.data.project_code))`.
  - project_tasks update Tier 1 (@741-746): add `|| (isRole('services_admin') && isAssignedToProject(resource.data.project_code))`.
  - project_tasks update Tier 2 (@747-761): add `|| (isRole('services_admin') && resource.data.keys().hasAny(['assignees']) && resource.data.assignees is list && request.auth.uid in resource.data.assignees)`.
  - project_tasks delete (@766-768): add `|| (isRole('services_admin') && isAssignedToProject(resource.data.project_code))`.
  - proposals create BRANCH B (projects, @900): extend the role group to include `|| isRole('services_admin')` (parent_collection 'projects', personnel-gated, created_by pinned).
  - proposals update BRANCH 2 (projects branch, @948): extend the role group to include `|| isRole('services_admin')`.
  - NO CHANGE (already satisfied): projects/edit_history create (@267 already lists services_admin); projects activity_entries/progress_updates/issues (@298-327 are isActiveUser()).

SERVICES side — add operations_admin (mirror the existing operations_user cross-branch exactly):
  - services update assigned branch (@580-585): add `|| (isRole('operations_admin') && isAssignedToService(resource.data.service_code))`.
  - services/edit_history create (@593): add 'operations_admin' to the hasRole list -> `hasRole(['super_admin', 'services_admin', 'services_user', 'operations_admin'])` (fixes the documented edit_history asymmetry; blanket create mirrors the projects/edit_history posture).
  - services/audit_log create (@602-605): add `|| (isRole('operations_admin') && request.auth.uid in get(/databases/$(database)/documents/services/$(serviceId)).data.personnel_user_ids)`.
  - service_tasks create (@802): add `|| (isRole('operations_admin') && isAssignedToService(request.resource.data.service_code))`.
  - service_tasks update Tier 1 (@812-817): add `|| (isRole('operations_admin') && isAssignedToService(resource.data.service_code))`.
  - service_tasks update Tier 2 (@818-832): add `|| (isRole('operations_admin') && resource.data.keys().hasAny(['assignees']) && resource.data.assignees is list && request.auth.uid in resource.data.assignees)`.
  - service_tasks delete (@837-839): add `|| (isRole('operations_admin') && isAssignedToService(resource.data.service_code))`.
  - proposals create BRANCH B (services, @908): extend the role group to include `|| isRole('operations_admin')`. NOTE: operations_admin already has blanket proposal power via BRANCH A (@893) + BRANCH 1 update (@933); this addition is redundant-but-symmetric — add it with an inline comment stating the redundancy so a future reader is not confused.
  - proposals update BRANCH 2 (services branch, @956): extend the role group to include `|| isRole('operations_admin')` (same redundant-but-symmetric note).
  - NO CHANGE (already satisfied): services activity_entries/progress_updates/issues (@611-635 are isActiveUser()).

LOCKED — assert BYTE-UNCHANGED (do NOT edit): projects create (@206 super_admin+operations_admin), projects delete (@259 super_admin+operations_admin), services create (@576 super_admin+services_admin), services delete (@588 super_admin+services_admin), and the users-collection personnel/role rules.
  </action>
  <verify>
    <automated>node scripts/verify-crossdept-admin-scoping.js  # brace-balance check inside must still pass</automated>
    <automated>grep -c "allow create: if hasRole(\['super_admin', 'operations_admin'\]);" firestore.rules  # projects create gate intact (>=1)</automated>
    <automated>grep -c "allow create: if hasRole(\['super_admin', 'services_admin'\]);" firestore.rules  # services create gate intact (>=1)</automated>
    <automated>grep -c "operations_admin.*isAssignedToService\|isRole('operations_admin')" firestore.rules  # operations_admin now present on services side (>=4)</automated>
    <automated>grep -c "isRole('services_admin')" firestore.rules  # services_admin now present on projects side (>=4)</automated>
  </verify>
  <done>Cross-dept admin appears in every mirrored assigned-member branch with the identical personnel/isAssigned constraint; create/delete gates byte-unchanged; brace balance holds. Rules are NOT deployed here (see Task 6 deploy step).</done>
</task>

<task type="auto">
  <name>Task 5: LAYER 4 — UI/data affordances (project-detail.js, service-detail.js, assignments.js)</name>
  <files>app/views/project-detail.js, app/views/service-detail.js, app/views/assignments.js</files>
  <action>
Admit the cross-dept admin into member-action gates ONLY when assigned (personnel/assigned-code) — never blanket. The cross-dept admin currently sits in some `adminRoles` arrays (blanket); MOVE it to `assignedRoles` so the UI matches the assignment-scoped rules. Do NOT touch canEditPersonnel, create/delete gates, or getVisibleSubTabs.

app/views/project-detail.js:
  - canDrive (@2482-2483): remove 'services_admin' from `adminRoles` and add it to `assignedRoles` -> adminRoles=['super_admin','operations_admin']; assignedRoles=['operations_user','services_user','services_admin']. services_admin now drives project proposals only when its uid is in personnel_user_ids (matches proposals BRANCH B/2). operations_admin stays blanket (home admin).
  - LOSS_ASSIGNED_ROLES (@2844): add 'services_admin' -> ['operations_user','services_user','services_admin'] (assignment-gated by canDriveProjectLoss).
  - lifecycle gate _canAdvanceProjectStatus (@2935): add services_admin to the assignment branch -> `if (role === 'operations_user' || role === 'services_user' || role === 'services_admin')`.
  - Save gates: NO role-list edit needed — saveProjectField etc. gate only on `canEditTab('projects') === false`, and services_admin passes canEditTab (role_templates projects.edit=true); the firestore rules enforce assignment. Leave as-is.
  - LOCKED: canEditPersonnel @610 (super_admin||operations_admin) unchanged.

app/views/service-detail.js:
  - saveServiceField role gate (@1247) AND toggleServiceDetailActive role gate (@1376): add 'operations_admin' to the array -> ['super_admin','services_admin','services_user','operations_user','operations_admin']. (These are rule-enforced pre-checks mirroring how operations_user is listed — the isAssignedToService rule is the real gate; keep the existing "rule enforces isAssignedToService" comment intent.)
  - canDrive (@1867-1868): remove 'operations_admin' from `adminRoles` and add it to `assignedRoles` -> adminRoles=['super_admin','services_admin']; assignedRoles=['operations_user','services_user','operations_admin']. services_admin stays blanket (home admin for services).
  - lifecycle gate _canAdvanceServiceStatus (@2244-2248): add operations_admin to the assignment branch -> `if (role === 'services_user' || role === 'operations_user' || role === 'operations_admin')`. The Completed exclusion (@2245 `if (targetStatus === 'Completed') return false;`) stays — an assigned operations_admin drives every gate EXCEPT Completed (services_admin-only, D-04), exactly like the assigned *_user.
  - LOSS_ASSIGNED_ROLES (@2575): add 'operations_admin' -> ['services_user','operations_user','operations_admin']. (Note the @2570-2573 PATH-A caveat: a service WITH an open proposal also needs proposals-write; Layer 3 grants operations_admin the services-parented proposal branch, so an assigned operations_admin PATH-A loss now succeeds. services_admin PATH-A remains a pre-existing home-admin limitation — out of scope.)
  - LOCKED: canEditPersonnel @818 (super_admin||services_admin) and the @173 admin-only gate (services_admin||super_admin) unchanged.

app/views/assignments.js — grid rows (@261-271): mirror the existing `*_user-with-codes` rows so the cross-dept admin stays manageable:
  - Projects grid (@261-265): add `|| (u.role === 'services_admin' && Array.isArray(u.assigned_project_codes) && u.assigned_project_codes.length > 0)`.
  - Services grid (@267-271): add `|| (u.role === 'operations_admin' && Array.isArray(u.assigned_service_codes) && u.assigned_service_codes.length > 0)`.
  - LOCKED: getVisibleSubTabs (@45-56) home-dept restriction unchanged; saveManageModal (@571-573) unchanged (its all_projects:false write is the landmine already defused by Layer 1).

Sweep both detail files for any remaining assignment role array of the form `['operations_user', 'services_user']` / `['services_user', 'operations_user']` and confirm each is either handled above or is a home-only gate that must stay untouched.
  </action>
  <verify>
    <automated>node --check app/views/project-detail.js && node --check app/views/service-detail.js && node --check app/views/assignments.js</automated>
    <automated>grep -c "operations_admin" app/views/service-detail.js  # canDrive + save gates + lifecycle + loss (>=5)</automated>
    <automated>grep -c "services_admin" app/views/project-detail.js  # canDrive + lifecycle + loss (>=3)</automated>
    <automated>grep -c "assigned_project_codes.length > 0\|assigned_service_codes.length > 0" app/views/assignments.js  # cross-dept admin grid rows present (>=2, may include kg0 *_user rows)</automated>
  </verify>
  <done>Cross-dept admin is admitted to canDrive/loss/lifecycle/save gates ONLY when assigned; canEditPersonnel + create/delete + getVisibleSubTabs untouched; assignments grid surfaces the cross-dept admin when it holds cross-dept codes; all three files pass node --check.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Four-layer cross-department admin scoping (mirror of kg0): app/utils.js per-department see-all branches; procurement.js department-keyed scope union; firestore.rules symmetric assigned-member branches; project-detail.js / service-detail.js / assignments.js UI affordances; plus scripts/verify-crossdept-admin-scoping.js (all static + logic gates GREEN, node --check clean on every touched .js).
  </what-built>
  <how-to-verify>
FIRST — deploy dev rules (rules changes are NOT live until deployed; Firebase MCP firebase_deploy no-ops here, use the CLI):
  firebase deploy --only firestore:rules --project dev

ASSIGNMENT SETUP (how to create the cross-dept assignment for scenarios 2-4 — from the plan-check warnings): assign the cross-dept admin via the TARGET ITEM'S PERSONNEL EDITOR, NOT the Assignments grid. An operations_admin/super_admin adds the services_admin to a project via project-detail.js Personnel; a services_admin/super_admin adds the operations_admin to a service via service-detail.js Personnel. The Personnel editor populates BOTH the user's assigned_*_codes AND the doc's personnel_user_ids, which is what activates BOTH the firestore rules AND the detail-page UI gates. Two PRE-EXISTING limitations (inherited from kg0 — do NOT mistake for regressions in this change): (a) the Assignments GRID only surfaces a cross-dept admin once it already holds cross-dept codes (length>0), so it cannot grant the FIRST code — bootstrap via the Personnel editor (or a Firestore console edit); (b) assignments.js reverse-syncs personnel_user_ids for PROJECTS only, so granting an operations_admin service codes via the Assignments grid ALONE passes the rules but leaves service-detail canDrive/lifecycle/loss UI closed until that operations_admin's uid is also in the service's personnel_user_ids (which the service Personnel editor sets). Bottom line: use the Personnel editor and both layers light up.

Then run `python -m http.server 8000` and browser-test with real accounts (DevTools Console open, expect zero permission-denied on the paths below). Cover scenarios 1-6:
  1. HOME see-all: operations_admin sees ALL projects (incl. codeless/legacy) + full admin (create/delete/personnel); services_admin sees ALL services + full admin. (Regression guard: confirm an operations_admin whose user doc has all_projects:false STILL sees every project.)
  2. CROSS assigned-only VIEW: assign operations_admin to one service -> it sees ONLY that service (not other/unassigned services) in records/lists/detail; assign services_admin to one project -> sees ONLY that project. Unassigned + codeless cross-dept items stay hidden.
  3. CROSS member WRITES work (assigned): operations_admin on its assigned service can post journal/progress/issues, advance lifecycle gates (NOT Completed), create/edit/delete a service task, create/edit a service proposal. services_admin on its assigned project can do the same set (incl. Completed, which the project side allows).
  4. CROSS container powers BLOCKED: operations_admin CANNOT create/delete a service or edit its personnel; services_admin CANNOT create/delete a project or edit its personnel. Service Completion gate stays services_admin-only.
  5. *_user REGRESSION: operations_user and services_user behave exactly as before kg0-parity (assigned-only view + member writes); super_admin/finance/procurement unchanged.
  6. MANAGE-SAVE LANDMINE: open Assignments -> Manage for an operations_admin, save -> confirm it is NOT scoped out of its own Projects department afterward (still sees all projects). Confirm the admin still appears in the correct assignment grid.
  </how-to-verify>
  <resume-signal>Reply "approved" (optionally "prod-deployed" once `firebase deploy --only firestore:rules` is run against production as the final flagged step), or describe any failing scenario.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| authenticated client -> Firestore | A cross-dept admin's writes to cross-department docs cross here; firestore.rules is the sole authority (UI gates are advisory). |
| user doc flags -> scope helpers | all_projects/all_services + assigned_*_codes on the user doc drive client visibility; Manage-save can flip all_* to false. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-mco-01 | Elevation of Privilege | cross-dept admin gaining container powers (create/delete/personnel) on the cross department | mitigate | Layer 3 adds the admin ONLY to assigned-member branches; create/delete/personnel gates asserted byte-unchanged (Task 4 verify greps). |
| T-mco-02 | Information Disclosure | scoped cross-dept admin seeing unassigned/codeless cross-dept records (260615-nlj leak) | mitigate | Layer 2 keeps the cross dimension a non-null array so unassigned AND codeless items match neither branch; logic script asserts S9/codeless hidden. |
| T-mco-03 | Elevation of Privilege | Manage-save writing all_projects:false silently scoping operations_admin out of its HOME dept | mitigate | Layer 1 explicit role branch returns null before the all_* flag is read; landmine assertion in the logic script + UAT scenario 6. |
| T-mco-04 | Tampering | services_admin without BRANCH A rewriting a project proposal outside the field-mask | mitigate | Layer 3 adds services_admin only to proposals BRANCH B/2 (field-masked, personnel-gated, created_by/created_at immutable). |
| T-mco-05 | Repudiation | edit_history asymmetry (operations_admin could not append service edit_history) | mitigate | Layer 3 adds operations_admin to services/edit_history create (matches projects/edit_history posture). |
| T-mco-06 | Elevation of Privilege | assigned cross-dept admin driving the service Completion gate (home-admin-only per D-04) | accept | Completed exclusion at service-detail.js:2245 stays for the admin exactly as for the assigned *_user; server rule is role-only (residual T-104-09 posture, unchanged). |

Note: no npm/pip/cargo installs in this task (zero-build SPA) — package-legitimacy gate N/A. Firestore rules unit tests are not runnable locally (emulator needs Java, absent); authoritative rules compilation happens at the user's dev-deploy gate (Task 6). Latent (out of scope, flagged): the Firestore `in` 10-item cap on scoped project/service queries (services.js ~893, procurement.js ~2905) — a cross-dept admin assigned >10 items breaks that query, the same pre-existing limitation *_user roles already have.
</threat_model>

<verification>
- `node --check` passes on all five touched .js files (utils.js, procurement.js, project-detail.js, service-detail.js, assignments.js) and on scripts/verify-crossdept-admin-scoping.js.
- `node scripts/verify-crossdept-admin-scoping.js` exits 0 after Tasks 2+3: full role x visibility matrix holds (operations_admin/services_admin/*_user/super_admin) incl. the all_*:false landmine assertions and the codeless/legacy project-MRF visibility.
- firestore.rules brace balance holds; create/delete gate greps confirm container powers unchanged; cross-dept admin present in every mirrored assigned-member branch.
- Browser UAT scenarios 1-6 approved.
- FINAL FLAGGED MANUAL STEP (user, not executor): `firebase deploy --only firestore:rules --project dev` for UAT, then `firebase deploy --only firestore:rules` to PROD (rides the standing v3.3 -> main rules-deploy debt).
</verification>

<success_criteria>
- An assigned cross-department admin has exactly the member capabilities of an assigned cross-department *_user under kg0 (view + journal/progress/issues + lifecycle + tasks + proposals), no more.
- Home department behavior (see-all + full admin) is unchanged and does NOT depend on the all_* flags.
- Container powers (create/delete/personnel) do not cross; unassigned/codeless cross-dept items stay hidden.
- super_admin / finance / procurement / operations_user / services_user behavior is byte-identical to pre-change.
- The logic-assertion script is GREEN and all node --check pass; UAT 1-6 approved; rules deploy handed to the user as the documented final step.
</success_criteria>

<output>
Create `.planning/quick/260706-mco-cross-department-admin-scoping-mirror-kg/260706-mco-SUMMARY.md` when done.
</output>
