---
phase: quick-260615-nlj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/views/procurement.js
autonomous: true
requirements: [MRF-SCOPE-TIGHTEN]

must_haves:
  truths:
    - "services_user sees ONLY MRFs whose service_code is in their assigned_service_codes"
    - "operations_user sees ONLY MRFs whose project_code is in their assigned project codes"
    - "Project-type MRFs (service_code null) no longer leak to services_user"
    - "Uncoded MRFs (project_code null) no longer leak to operations_user"
    - "Admin/finance/procurement (getAssigned* returns null) still see everything"
  artifacts:
    - path: "app/views/procurement.js"
      provides: "Tightened MRF scope predicates across all 4 filter functions"
      contains: "assignedServiceCodes.includes(mrf.service_code)"
  key_links:
    - from: "app/views/procurement.js filter predicates"
      to: "window.getAssignedProjectCodes / getAssignedServiceCodes"
      via: "if (assignedCodes !== null) { filter(...) } guard preserved"
      pattern: "assignedCodes !== null"
---

<objective>
Tighten MRF visibility scoping in the Procurement view so scoped roles see ONLY their own
department's MRFs. The current client-side filters keep an MRF when its scoping code is null,
which leaks ALL project MRFs (service_code == null) to services_user and uncoded MRFs
(project_code == null) to operations_user.

Purpose: Enforce true department isolation at the display layer.
Output: Modified app/views/procurement.js with the `code == null ||` leak term removed from
every MRF scope predicate, while the `null === "no filter"` contract and the
`if (assignedCodes !== null)` guards are preserved exactly.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- Contract from app/utils.js — DO NOT MODIFY THESE FUNCTIONS. -->
<!-- getAssignedProjectCodes(): string[] | null
       - null  => "no filter" (not logged in, not operations_user, or all_projects === true)
       - []    => operations_user with zero assignments (sees nothing)
       - [...]  => operations_user scoped to these project_codes
     getAssignedServiceCodes(): string[] | null
       - null  => "no filter" (not logged in, not services_user, or all_services === true)
       - []    => services_user with zero assignments (sees nothing)
       - [...]  => services_user scoped to these service_codes
  The `if (assignedCodes !== null) { ... }` guard already implements the contract.
  Only the inner `code == null ||` escape term inside .filter() must be removed. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove the project_code/service_code null-leak term from all 4 MRF filter functions</name>
  <files>app/views/procurement.js</files>
  <action>
Remove the `mrf.project_code == null ||` and `mrf.service_code == null ||` escape terms from
every MRF scope predicate, leaving the bare `assignedCodes.includes(mrf.project_code)` /
`assignedServiceCodes.includes(mrf.service_code)` test. Do NOT touch the surrounding
`if (assignedCodes !== null) { ... }` / `if (assignedServiceCodes !== null) { ... }` guards —
those implement the null === "no filter" contract and must stay byte-for-byte.

Apply at all 8 predicate sites across 4 functions (verify exact lines — they may shift):

- loadMRFs() onSnapshot — project predicate (~2991-2993), service predicate (~2997-2999)
- reFilterAndRenderMRFs() — project predicate (~3064-3066), service predicate (~3070-3072)
- reFilterAndRenderPRPORecords() — project predicate (~3096-3098), service predicate (~3101-3103)
- loadPRPORecords() cache-hit path — project predicate (~5355), service predicate (~5358)
- loadPRPORecords() fresh-fetch path — project predicate (~5408-5410), service predicate (~5414-5416)

After edit, each predicate body reads exactly:
  `assignedCodes.includes(mrf.project_code)`  (project sites)
  `assignedServiceCodes.includes(mrf.service_code)`  (service sites)

DO NOT modify app/utils.js. DO NOT touch firestore.rules (display-layer change only).
DO NOT touch the line-2896 `loadServicesForNewMRF` service-query block — that builds a
Firestore `where('service_code','in',...)` query, not an MRF filter predicate; it is out of scope.

Intended side effect (desired, do not prevent): truly uncoded legacy MRFs (no project_code AND
no service_code) become invisible to scoped roles. Cross-dept roles (getAssigned* === null)
are unaffected and still see everything.
  </action>
  <verify>
    <automated>cd "C:/Users/Admin/Roaming/pr-po" && { test "$(grep -c 'code == null ||' app/views/procurement.js)" = "0" && grep -c 'assignedCodes !== null' app/views/procurement.js && grep -c 'assignedServiceCodes !== null' app/views/procurement.js; }</automated>
  </verify>
  <done>
- Zero occurrences of `code == null ||` remain in app/views/procurement.js
- All `if (assignedCodes !== null)` and `if (assignedServiceCodes !== null)` guards still present (4 + 4 = 8 guard sites unchanged)
- app/utils.js and firestore.rules unchanged
  </done>
</task>

</tasks>

<verification>
Grep confirms no `code == null ||` leak term remains and the `!== null` no-filter guards are intact.
Manual code-read of each of the 4 functions confirms predicates reduced to bare `.includes(...)`.
No build/test exists (zero-build static SPA) — final confirmation is the user's manual browser UAT:
sign in as a services_user (project MRFs must NOT appear) and an operations_user (uncoded MRFs must
NOT appear); sign in as admin/procurement (everything still appears).
</verification>

<success_criteria>
- services_user sees only their assigned-service MRFs in MRF Management and MRF Records tabs
- operations_user sees only their assigned-project MRFs in both tabs
- Cross-dept roles (admin/finance/procurement) see the full unscoped set
- The null === "no filter" contract in app/utils.js is unchanged
</success_criteria>

<output>
Create `.planning/quick/260615-nlj-tighten-mrf-visibility-scoping-services-/260615-nlj-SUMMARY.md` when done
</output>
