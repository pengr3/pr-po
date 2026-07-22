---
slug: crossdept-admin-mrf-filing
status: diagnosed
mode: diagnose-only
trigger: "Cross-department MRF filing: a services_admin cannot file an MRF to a PROJECT they are assigned to."
created: 2026-07-22
updated: 2026-07-22
related: quick-260706-mco (cross-department admin scoping — mirror kg0)
---

# Debug: services_admin cannot file an MRF to an assigned project

## Symptoms
- **Expected:** A `services_admin` who is assigned (via project Personnel) to a project can file an MRF against that project — matching the cross-dept design goal that an assigned cross-dept admin "behaves EXACTLY like an assigned cross-dept `*_user`".
- **Actual:** On the dedicated MRF submission form (`app/views/mrf-form.js`), a `services_admin` sees no Projects picker at all. The combobox relabels to "Service *" and only searches services, so no project can be selected → cannot file to a project.

## Is the feature live on prod?
- **Frontend cross-dept scoping code (quick-260706-mco):** MERGED. Branch `claude/cross-dept-mrf-filing-6eebc0` tip `a59c39c` == `main` == `origin/main` (no unmerged commits). Netlify auto-deploys `main`, so the cross-dept *visibility/scoping* frontend IS live on prod. (Deploy inferred from git state; not verified against the Netlify dashboard.)
- **firestore.rules half:** DEPLOYED to prod per a 2026-07-22 verification (memory `project_admin_crossdept_scoping`: prod `clmc-procurement` rules confirmed byte-identical to v4.2 source via `firebase_get_security_rules`). The mco SUMMARY:123 / VERIFICATION #1/#3 "not deployed" note was true only at execution time (2026-07-06) and is now stale. CAVEAT: this debug session's Firebase MCP is pointed at `clmc-procurement-dev` (per `firebase_get_project`), so I did NOT independently re-confirm prod rules this session. Either way this does not affect MRF filing — the block is client-side (see root cause).
- **Cross-dept MRF *filing* for admins specifically:** NOT implemented on the primary filing form at all (mrf-form.js gap) — so it is "live" only in the sense that the admin-excluding code is deployed. The behaviour the user expects does not work on prod, and would not work even with rules deployed.

## Evidence
1. `app/views/mrf-form.js:406-407` — picker visibility is role-gated by two hardcoded lists:
   ```js
   const showProjects = ['super_admin','finance','procurement','operations_admin','operations_user','services_user'].includes(role); // no services_admin
   const showServices = ['super_admin','finance','procurement','services_admin','services_user','operations_user'].includes(role);     // no operations_admin
   ```
   `services_admin` is absent from `showProjects` (and symmetrically `operations_admin` is absent from `showServices`).
2. `app/views/mrf-form.js:1146` — `rebuildPSOptions()` wraps the ENTIRE projects block in `if (psShowProjects) { ... }`. With `psShowProjects=false`, the assignment-aware filter at `:1147` (`getAssignedProjectCodes()` → `assignedCodes.includes(p.project_code)`) is never reached. The correct machinery exists but is gated out.
3. `app/views/mrf-form.js:417-436` — with `showProjects=false, showServices=true`, the field label is set to "Service *" and the placeholder to "Type to search services..." → UI offers services only.
4. `app/utils.js:318-319,333-342` — `getAssignedProjectCodes()` for a `services_admin` correctly returns `assigned_project_codes` (services_admin is intentionally NOT in `PROJECT_SEE_ALL_ROLES`), i.e. the scoping helper WOULD surface the assigned project if the block ran.
5. `firestore.rules:399` — `mrfs` create allows `services_admin` unconditionally (no project scoping). The server permits the write; the block is purely client-side.
6. Plan scope: `.planning/quick/260706-mco.../260706-mco-PLAN.md` `files_modified` (lines 7-14) lists utils.js, procurement.js, firestore.rules, project-detail.js, service-detail.js, assignments.js, verify-script — **mrf-form.js is NOT listed.** SUMMARY confirms only those 6 files were touched.
7. Governing principle (PLAN:65, restated PLAN:363 and VERIFICATION:13): assigned cross-dept admin must "behave EXACTLY like an assigned cross-department `*_user`." A cross-dept `*_user` (`services_user`) IS in `showProjects` at mrf-form.js:406 and CAN file to an assigned project — so the admin should too. The enumerated member-capability list in the truths ({records view, journal/progress/issues, lifecycle, tasks, proposals}) simply never enumerated the MRF-filing surface.

## Eliminated hypotheses
- **Firestore rules block MRF create for services_admin** — ELIMINATED. `mrfs` create (:399) lists `services_admin`; unchanged by mco and permissive.
- **Rules-not-deployed causes the filing block** — ELIMINATED. Filing block is client-side picker visibility; independent of rules deployment. (Rules-not-deployed is a separate real gap affecting cross-dept *writes*, not filing.)
- **Assignment sync didn't populate assigned_project_codes** — ELIMINATED as the cause. `syncPersonnelToAssignments` (utils.js:716) is role-agnostic and would add the code for a services_admin; and even a correct code never gets consulted because the whole projects block is gated off (`psShowProjects=false`). (Caveat: codeless projects early-return in sync at :717, but mrf-form.js:1156 has a personnel_user_ids fallback for those — still gated off here.)

## Root cause
`quick-260706-mco` extended the assignment-driven cross-dept model to the department-admin roles across scope helpers, the records-list scope union, firestore.rules, and the two detail-page UIs — but **did not update the MRF-filing picker visibility in `app/views/mrf-form.js:406-407`**, which still encodes the pre-kg0 department-role model and omits `services_admin` from `showProjects` (and `operations_admin` from `showServices`). Because `psShowProjects=false` gates out the entire (assignment-aware) projects block in `rebuildPSOptions()`, a `services_admin` — even one assigned to the project — is never offered any project in the dedicated MRF form. This contradicts mco's own stated invariant ("behave exactly like the assigned `*_user`", who CAN file). It is an implementation gap/oversight, not a deliberate restriction: there is no threat-model entry for it, "container powers" (create/delete/personnel) explicitly do not include MRF filing (a member action), and the server rule already permits it.

Symmetric defect: an `operations_admin` assigned to a service cannot file an MRF to that service on the same form (omitted from `showServices`).

## Surface inconsistency (corroborating + separate issue)
The Procurement-tab "Create MRF" surface (`app/views/procurement.js:3866`) builds `projectOptions` from `projectsData.map(...)` with NO role gate and NO assignment filter — it shows ALL active projects to everyone, including a services_admin. So filing via the Procurement tab is unaffected (indeed over-permissive/unscoped), while the dedicated form blocks it. The reported symptom matches the `mrf-form.js` surface. This divergence is worth reconciling separately (mrf-form is assignment-scoped-but-admin-omitted; procurement is unscoped).

## Recommended fix (NOT applied — diagnose-only)
Minimal, matches the mco mirror principle and the existing kg0 pattern:
- `app/views/mrf-form.js:406` — add `'services_admin'` to `showProjects`.
- `app/views/mrf-form.js:407` — add `'operations_admin'` to `showServices`.
The downstream `rebuildPSOptions()` filter (`getAssignedProjectCodes()`/`getAssignedServiceCodes()`) already scopes an admin to only its assigned cross-dept items, so this exposes the picker WITHOUT leaking unassigned cross-dept projects/services (home dept stays see-all via the null-return path). No rules change needed (mrfs create already allows it). Verify with browser UAT: a services_admin assigned to exactly one project sees only that project under Projects, plus all services; an unassigned services_admin sees no projects.
Separately consider reconciling procurement.js:3866 so both filing surfaces apply the same assignment scoping.
