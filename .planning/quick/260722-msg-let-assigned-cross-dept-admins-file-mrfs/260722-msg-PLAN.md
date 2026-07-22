---
phase: quick-260722-msg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/views/mrf-form.js
autonomous: true
requirements: [MSG-01-crossdept-admin-mrf-picker]
user_setup: []

must_haves:
  truths:
    - "A services_admin assigned to a project can select that project under the Project picker on the dedicated MRF form (app/views/mrf-form.js) and file an MRF against it — matching the assigned services_user."
    - "An operations_admin assigned to a service can select that service under the Service picker on the same form and file an MRF against it — matching the assigned operations_user."
    - "A services_admin sees ONLY its assigned cross-department projects (unassigned projects never appear); an unassigned services_admin sees no projects. Symmetric for operations_admin vs services. No unassigned cross-dept leak."
    - "A services_admin still sees ALL services (home dept) and an operations_admin still sees ALL projects (home dept) — home-department behavior unchanged."
    - "Picker behavior for super_admin, finance, procurement, operations_user, and services_user on the MRF form is byte-identical to before this change."
  artifacts:
    - path: "app/views/mrf-form.js"
      provides: "services_admin added to the showProjects role list and operations_admin added to the showServices role list (~lines 406-407), so psShowProjects/psShowServices become true for those admins and rebuildPSOptions() runs the existing assignment-scoped picker block"
      contains: "services_admin"
  key_links:
    - from: "app/views/mrf-form.js showProjects / showServices role lists (~406-407)"
      to: "app/views/mrf-form.js rebuildPSOptions() (~1146,1175)"
      via: "psShowProjects / psShowServices flags gate the assignment-aware projects/services block"
      pattern: "psShowProjects"
    - from: "app/views/mrf-form.js rebuildPSOptions()"
      to: "app/utils.js getAssignedProjectCodes / getAssignedServiceCodes"
      via: "null = see-all (home dept) / array = assigned-only (cross dept) filter contract"
      pattern: "getAssigned(Project|Service)Codes"
---

<objective>
Close the cross-department MRF-filing gap on the dedicated MRF submission form (`app/views/mrf-form.js`). An **assigned** `services_admin` currently cannot file an MRF to a project, and symmetrically an **assigned** `operations_admin` cannot file an MRF to a service, because the form's picker-visibility role lists omit those two admin roles. This contradicts the governing principle established by quick 260706-mco (see `.planning/quick/260706-mco.../260706-mco-PLAN.md:65`): "an **assigned** cross-department admin must behave EXACTLY like an **assigned** cross-department `*_user`" — and the `*_user` roles are already in both lists.

Root cause is already diagnosed in `.planning/debug/crossdept-admin-mrf-filing.md` (confirmed still matching the live file this session). The fix is minimal and additive: add the two missing roles to the two hardcoded lists. The assignment-scoping machinery downstream (`rebuildPSOptions()` → `getAssignedProjectCodes()`/`getAssignedServiceCodes()`) already exists and is unchanged — it was simply gated out for admins.

Purpose: complete mco's assignment-driven model on the last surface it never touched (the primary MRF filing form), with no leak and no over-exposure.
Output: a 2-line additive edit to `app/views/mrf-form.js`, verified by `node --check` + static greps; browser UAT flagged as a human follow-up.

OUT OF SCOPE (follow-up only, do NOT touch in this task):
- `app/views/procurement.js:3866` — the Procurement-tab "Create MRF" surface builds `projectOptions` from `projectsData.map(...)` with NO role gate and NO assignment filter (unscoped / over-permissive: shows all active projects to everyone, including a services_admin). Reconciling that surface to apply the same assignment scoping is a separate task. Note it; do not change it here.
- `firestore.rules`, `app/utils.js`, `app/views/procurement.js`, and every other file — no change needed. `mrfs` create (firestore.rules:399) already permits both `services_admin` and `operations_admin`; the block was purely client-side picker visibility.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/debug/crossdept-admin-mrf-filing.md
@.planning/quick/260706-mco-cross-department-admin-scoping-mirror-kg/260706-mco-PLAN.md

<interfaces>
<!-- Exact current source the executor edits and the downstream contract it feeds. -->
<!-- Use these directly — no codebase exploration needed. Anchors confirmed live this session. -->

CURRENT — app/views/mrf-form.js ~406-407 (the ONLY lines to change):
```javascript
const showProjects = ['super_admin', 'finance', 'procurement', 'operations_admin', 'operations_user', 'services_user'].includes(role); // MISSING services_admin
const showServices = ['super_admin', 'finance', 'procurement', 'services_admin', 'services_user', 'operations_user'].includes(role);     // MISSING operations_admin
```

DOWNSTREAM (unchanged — already correct, gated by the flags above) — app/views/mrf-form.js ~1146 & ~1175:
```javascript
if (psShowProjects) {
    const assignedCodes = window.getAssignedProjectCodes?.();   // null = see-all (home dept); array = assigned-only (cross dept)
    // ...filters cachedProjects by assignedCodes before pushing to psOptions
}
if (psShowServices) {
    const assignedCodes = window.getAssignedServiceCodes?.();
    // ...filters cachedServices by assignedCodes before pushing to psOptions
}
```

SCOPING CONTRACT (unchanged) — app/utils.js:318-343:
```javascript
const PROJECT_SEE_ALL_ROLES = ['super_admin', 'finance', 'procurement', 'operations_admin']; // services_admin intentionally absent
const SERVICE_SEE_ALL_ROLES = ['super_admin', 'finance', 'procurement', 'services_admin'];    // operations_admin intentionally absent
// getAssignedProjectCodes(): returns null (no filter) only for PROJECT_SEE_ALL_ROLES,
//   else returns user.assigned_project_codes (fail-closed [] if missing).
// => a services_admin gets its assigned_project_codes only (no unassigned-project leak);
//    its home services stay see-all via the null-return path in getAssignedServiceCodes().
```

SERVER GATE (unchanged, already permissive) — firestore.rules:399:
```
allow create: if hasRole(['super_admin', 'operations_admin', 'operations_user', 'services_admin', 'services_user', 'procurement']);
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add services_admin to showProjects and operations_admin to showServices in the MRF form</name>
  <files>app/views/mrf-form.js</files>
  <action>
Implements MSG-01. In `init()` at ~line 406-407, make exactly two additive edits to the two hardcoded role-visibility arrays:

1. Add the string `'services_admin'` to the `showProjects` array literal (line ~406). Place it adjacent to `'operations_admin'` for readability. Do not remove or reorder any existing entry.
2. Add the string `'operations_admin'` to the `showServices` array literal (line ~407). Place it adjacent to `'services_admin'`. Do not remove or reorder any existing entry.

Do NOT change anything else — not the label/placeholder logic (~417-436), not `rebuildPSOptions()`, not any other file.

Why this is correct, safe, and complete (record this reasoning; it is the whole point of the change):
- Setting `services_admin` in `showProjects` makes `psShowProjects` true for that role, so `rebuildPSOptions()` (~1146) runs the projects block. That block already calls `window.getAssignedProjectCodes()`, which for a services_admin returns its `assigned_project_codes` (services_admin is intentionally NOT in `PROJECT_SEE_ALL_ROLES` at utils.js:318) — so ONLY assigned cross-dept projects are offered; an unassigned services_admin sees none. No leak, no over-exposure, and NO new filtering code is added — the filter already exists and was merely gated out.
- The services_admin's home department (services) stays see-all because it remains in `showServices` and `getAssignedServiceCodes()` returns null for `SERVICE_SEE_ALL_ROLES`. Symmetric for operations_admin (home = projects unchanged; assigned services now offered).
- Both admins now have both pickers visible; the existing label/placeholder branch at ~417-436 already handles the both-visible case ("Project / Service *" / "Type to search projects / services..."), which is the correct combined label — no change required there.
- No firestore.rules change: `mrfs` create (firestore.rules:399) already lists services_admin and operations_admin. The block was purely client-side.

Update the mco-lineage comment above the arrays (~404-405) to note that department admins are now cross-dept assignment-scoped on the MRF picker too (completing quick 260706-mco / this quick 260722-msg), so the next reader does not re-introduce the omission.
  </action>
  <verify>
    <automated>node --check app/views/mrf-form.js && grep -n "const showProjects" app/views/mrf-form.js | grep -q "services_admin" && grep -n "const showServices" app/views/mrf-form.js | grep -q "operations_admin" && echo GATES_PASS</automated>
    <human-check>Browser UAT (repo has no automated test harness — production Firebase, manual verification). Sign in as a real services_admin assigned to exactly ONE project: on the dedicated MRF form (#/mrf-form) the Project picker offers only that one project, the Service picker still offers all services, and the MRF submits successfully against the project. Then an UNASSIGNED services_admin: the Project picker offers no projects. Symmetric checks for operations_admin (assigned to one service sees only that service + all projects; unassigned sees no services). Confirm super_admin/finance/procurement/operations_user/services_user pickers are unchanged.</human-check>
  </verify>
  <done>`showProjects` array contains `services_admin`; `showServices` array contains `operations_admin`; `node --check app/views/mrf-form.js` exits 0; the compound gate prints GATES_PASS; app/views/mrf-form.js is the ONLY application source file modified (no change to firestore.rules, utils.js, or procurement.js).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client role-gate → picker options | The browser decides which project/service codes a cross-dept admin sees as filing targets in `rebuildPSOptions()`. |
| client → Firestore `mrfs` create | The MRF write crosses to the server; `firestore.rules` is the authoritative gate. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-msg-01 | Information Disclosure | `mrf-form.js` `rebuildPSOptions()` projects/services block | mitigate | Exposure stays scoped by the EXISTING `window.getAssignedProjectCodes()`/`getAssignedServiceCodes()` filter — services_admin is not in `PROJECT_SEE_ALL_ROLES` (utils.js:318), so only `assigned_project_codes` enter `psOptions`; unassigned cross-dept items never render. This task adds no new filtering code — it only removes the blanket hide, leaving the per-code filter intact. Verified by the "unassigned admin sees none" UAT step. |
| T-msg-02 | Elevation of Privilege | Firestore `mrfs` create | accept | `firestore.rules:399` already allows `services_admin`/`operations_admin` to create MRFs unconditionally (they are submitter roles). This is the pre-existing, intended server contract; the client change grants no new server capability. No rules change in scope. |
| T-msg-SC | Tampering | npm/pip/cargo installs | accept | N/A — no package-manager installs in this task (2-line edit to one existing file). Legitimacy gate not triggered. |
</threat_model>

<verification>
- Static syntax gate (repo has no build/test/lint per CLAUDE.md): `node --check app/views/mrf-form.js` exits 0.
- Static confirmation: the `showProjects` line now contains `services_admin`; the `showServices` line now contains `operations_admin` (compound gate prints `GATES_PASS`).
- Diff scope: only `app/views/mrf-form.js` changed among application source files.
- Human browser UAT (flagged, not a blocking task in this plan — production Firebase, no test harness): assigned services_admin sees only its assigned project(s) + all services and can file; unassigned services_admin sees no projects; symmetric operations_admin checks; unchanged pickers for the other five roles.
- OUT OF SCOPE reminder recorded for follow-up: `procurement.js:3866` remains unscoped/over-permissive.
</verification>

<success_criteria>
- `services_admin` present in the `showProjects` role list and `operations_admin` present in the `showServices` role list in `app/views/mrf-form.js`.
- `node --check app/views/mrf-form.js` passes; no other file modified.
- Downstream assignment scoping (`getAssignedProjectCodes`/`getAssignedServiceCodes`) is unchanged, so an assigned cross-dept admin is offered only its assigned cross-dept items and its home department stays see-all (no leak, no regression for other roles).
</success_criteria>

<output>
Create `.planning/quick/260722-msg-let-assigned-cross-dept-admins-file-mrfs/260722-msg-SUMMARY.md` when done.
</output>
