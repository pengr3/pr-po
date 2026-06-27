# Quick Task 260627-kg0: Cross-department assignment parity - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Task Boundary

Allow `services_user` to see and act on assigned **projects** with the same
capabilities they have on assigned **services**, and symmetrically allow
`operations_user` to see and act on assigned **services** the same way they act
on assigned **projects**.

The unifying model: **access becomes assignment-driven, not role-driven.** A
person listed in a doc's `personnel_user_ids` (project OR service) gets the
project/service-member capabilities regardless of whether their role is
`operations_user` or `services_user`. Role continues to distinguish admin vs.
member vs. cross-dept staff (finance/procurement) — only the department wall
between the two *_user roles is removed.

Applies **symmetrically in both directions** — every change lands for
`services_user → projects` AND `operations_user → services`.

</domain>

<decisions>
## Implementation Decisions

### Admin scope — *_user roles ONLY
- Parity applies to `operations_user` and `services_user` only.
- `operations_admin` / `services_admin` REMAIN department-scoped for management.
- NO changes to: user-management role rules, role-create permission gates,
  assignment-authoring UI, or the admin get/update rules in firestore.rules
  (users collection blocks stay as-is).

### Firestore writes — shared assigned-member predicate
- Open cross-department WRITE paths via a `request.auth.uid in resource.data.personnel_user_ids`
  member check (create-time: `request.resource.data.personnel_user_ids`),
  mirroring the existing `operations_user` member-write gates.
- Apply symmetrically so an assigned cross-dept user gets the same member-writes
  a native dept user has. In scope on the projects side (for services_user) and
  the services side (for operations_user):
  - `project_tasks` / `service_tasks` (create, two-tier update, delete)
  - `proposals` Branch B (create + update field-mask) — currently
    `operations_user`→`projects` / `services_user`→`services`; parity makes the
    member check role-agnostic for *_user while keeping `parent_collection`
    correctness.
  - project / service lifecycle update field-masks (the assigned-member branch)
  - subcollections: `audit_log`, `activity_entries`, `progress_updates`,
    `issues`, `baselines`, `edit_history`
- PRESERVE every `isRole(...)` short-circuit guard that protects
  `assigned_*_codes` / `personnel_user_ids` dereferences (T-105-03 pattern).
- DO NOT touch: `pos` create (finance), `prs` create (procurement),
  `suppliers`, `clients`, `collectibles`/`billing_requests` finance gates,
  `mrfs` create (already open to all dept roles).

### Scoping helpers — assignment-driven (role-agnostic for *_user)
- Rewrite `getAssignedProjectCodes()` / `getAssignedServiceCodes()` (app/utils.js)
  so they return the codes a user is assigned to regardless of role:
  - Return `null` ("no filter") ONLY for cross-dept admin/finance/procurement
    (and super_admin) — unchanged for those.
  - For BOTH `operations_user` and `services_user`, return the union of their
    assigned codes for that collection (projects helper returns their
    `assigned_project_codes`; services helper returns their
    `assigned_service_codes`) — so a services_user assigned to a project is now
    scoped-IN to that project everywhere lists/scoreboards/records are filtered.
- HARD CONSTRAINT — preserve the no-leak property from quick 260615-nlj:
  unassigned and uncoded items MUST stay hidden from scoped users. The
  `null === "no filter"` contract and the `assignedCodes !== null` guards in
  procurement.js stay intact. This is the highest-risk edit — verify against the
  260615-nlj leak-fix invariants.

### Navigation — unified nav
- Show both Projects and Services entry points to any *_user who has assignments
  in that area; home surfaces assigned work across both departments.
- Touches `home.js` department routing (lines ~79-82), `index.html` nav, and any
  router guard that hides a department by role.

</decisions>

<specifics>
## Specific Ideas

- **Assignment infra already exists** — 195 uses of `personnel_user_ids` /
  `canDrive` / `canEdit` / `isAssigned` across 14 files. This task is mostly
  *removing department-role gates in front of existing assignment logic*, not
  building new machinery.
- **Backing data already populated** — `syncPersonnelToAssignments`
  (app/utils.js ~688/762) already writes `assigned_project_codes` /
  `assigned_service_codes` for ANY assigned user regardless of role, so the
  assignment-driven helpers have data to read on day one (a backfill check for
  pre-existing cross-dept assignments may still be warranted).
- **Known gate sites to convert** (non-exhaustive — planner must sweep all 42
  role-literal sites): `home.js:79-82`, `projects.js:802`, `services.js:875`,
  `project-detail.js:2863`, `service-detail.js:2218`,
  `proposal-modal.js:181-192`, `mrf-form.js:404-405`, `procurement.js:2906`,
  `utils.js:323/399`.
- **Symmetry is mandatory** — reviewers should grep both `operations_user` and
  `services_user` literal sites and confirm each conversion is mirrored.

</specifics>

<canonical_refs>
## Canonical References

- `firestore.rules` — the security contract; the shared assigned-member
  predicate and all write-gate edits live here.
- `.planning/quick/260615-nlj-tighten-mrf-visibility-scoping-services-/` — the
  leak fix whose no-leak invariant MUST be preserved by the scoping-helper edit.
- `CLAUDE.md` — DOM-selection rules, view module lifecycle, status case-sensitivity.

</canonical_refs>
