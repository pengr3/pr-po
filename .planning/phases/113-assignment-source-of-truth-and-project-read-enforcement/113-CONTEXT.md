# Phase 113: Assignment Source-of-Truth and Project Read Enforcement - Context

**Gathered:** 2026-08-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish `personnel_user_ids` (on the `projects` / `services` documents) as the **single authoritative record** of who is assigned to what, retire the two fire-and-forget sync pipelines that maintain the derived `assigned_project_codes` / `assigned_service_codes` arrays on user documents, and enforce `projects` read scoping in `firestore.rules` instead of as cosmetic client-side filtering.

**Driving defect:** a `services_user` assigned to a project via the Personnel panel could not see it on `#/projects` nor file MRFs against it. Confirmed by RED/GREEN Firestore emulator reproduction — `firestore.rules` `users.update` allowed only same-department admin→user writes, so `syncPersonnelToAssignments`' cross-department `updateDoc` returned PERMISSION_DENIED and was swallowed by `.catch(err => console.error(...))`. Fourth recurrence of this bug class.

**In scope:** repointing assignment-visibility reads to `personnel_user_ids`; retiring both sync pipelines; tightening the `projects` read rule; converting every projects read surface the audit identifies; regression tests.

**Out of scope:** reconciling `procurement.js:3866` (the wholly unscoped Create-MRF project picker — separate defect); deleting the legacy array fields from user documents; redesigning the Assignments tab UI.

</domain>

<decisions>
## Implementation Decisions

### Enforcement boundary (discussed)

- **D-01:** Preserve kg0's D-1. `firestore.rules` grants `super_admin` / `finance` / `procurement` / `operations_admin` / `services_admin` unrestricted `projects` reads; only `*_user` roles are scoped server-side. This mirrors the existing services rules and keeps the view-only Projects-tab grant intact. Consequence to state plainly in the plan: server-side enforcement therefore binds `*_user` roles only — it is a correctness/consistency fix, not a containment boundary against admins.
- **D-02:** Standardize every scoped read on `where('personnel_user_ids', 'array-contains', uid)`. Removes the Firestore 30-value `in` ceiling that `where('service_code','in', assignedCodes)` silently carries, and guarantees by construction that every returned document satisfies the rule predicate.
- **D-03:** Audit-first, then convert everything found. A partial conversion is worse than none: once the rule tightens, an unscoped collection query is denied **in its entirety** for scoped users, so any missed surface becomes a hard failure rather than a degraded one. The audit below is preliminary and MUST be completed and re-verified during planning.
- **D-04:** The 260615-nlj no-leak invariant (unassigned AND codeless cross-department items stay hidden from a cross-dept admin on MRF records) carries over **unchanged**, with regression coverage proving it still holds after the switch. If planning finds a genuine conflict with the new model, surface it to the user rather than silently relaxing it.

### Assignments tab (Claude's discretion — user delegated)

- **D-05:** Repoint the Assignments tab to write `personnel_user_ids` on the project/service documents. Its checkbox UI is unchanged; `syncAssignmentToPersonnel` (`app/views/assignments.js:652`) is deleted. Rationale: `getVisibleSubTabs` already restricts each admin to their home-department sub-tab, so a repointed tab only ever writes personnel on a container that admin already owns — no new capability, and no conflict with the "cross container powers blocked" rule.
- **D-06:** This **supersedes** the mco lock on `saveManageModal` ("the landmine source, do NOT change", `260706-mco-PLAN.md:142,296`). That lock was scoped to the mco quick fix, which had to avoid the `all_projects:false` landmine while the arrays were still authoritative. Once the arrays are no longer read, the landmine is gone. Record the supersede explicitly in the plan.
- **D-07:** Full project↔service parity. The documented "intentional asymmetry" (services have no reverse sync, `assignments.js:544`) dissolves rather than being implemented — with one authoritative record there is nothing to sync in either direction.

### Fate of the legacy arrays (Claude's discretion — user delegated)

- **D-08:** Stop **reading** `assigned_project_codes` / `assigned_service_codes` for visibility, and stop **writing** them (both syncs deleted, tab repointed). Do **not** delete the fields from user documents in this phase. They become frozen, inert data. Rationale: field deletion is an irreversible write against production Firestore with no staging, and keeping them costs nothing while preserving a rollback path if the new model misbehaves in production.
- **D-09:** `all_projects` / `all_services` survive untouched as role-independent see-all escape hatches. They are a *grant*, not assignment data — there is no personnel equivalent — so they remain user-document flags consulted by the see-all path. The legacy migrate-on-edit handling stays.
- **D-10:** Surfaces that currently *display* assignment counts or code lists must repoint to personnel-derived data: `app/views/user-management.js:487-489` (assignment counts) and `app/views/assignments.js:346,352` (code display).

### Silent-failure surfacing (Claude's discretion — user delegated)

- **D-11:** Retiring the syncs **is** the silent-failure fix, and that is the preferred resolution over adding error plumbing to a doomed code path. After the change there is exactly one write per assignment — the container document's personnel array — and that write is already awaited and toasted at its call sites. No fire-and-forget assignment write remains.
- **D-12:** Add a standing constraint to the plan: **no assignment-affecting write may be fire-and-forget.** Any residual `.catch(err => console.error(...))` on an assignment path is a defect, not a style choice. Verify by inspection during code review.

### Claude's Discretion

The user explicitly delegated the Assignments tab, the fate of the legacy arrays, and silent-failure surfacing (D-05 through D-12) and declined further questioning. D-04's resolution was also delegated. Planning may revisit any of these if the audit contradicts the reasoning recorded above — the rationale is stated for each so it can be re-argued on evidence rather than re-guessed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### This defect
- `.planning/debug/services-user-project-hidden.md` — full root-cause trail, RED/GREEN emulator reproduction, evidence log, eliminated hypotheses, and the systemic (cross-layer) recurrence analysis
- `.planning/debug/crossdept-admin-mrf-filing.md` — the immediately prior session (2026-07-22); its `mrf-form.js` picker root cause does NOT explain this bug and must not be re-applied

### Prior cross-department work (locked decisions — do not re-litigate)
- `.planning/quick/260627-kg0-cross-dept-assignment-parity/` — established the assignment-driven model; **D-1: admins are not scoping targets**
- `.planning/quick/260706-mco-cross-department-admin-scoping-mirror-kg/260706-mco-PLAN.md` — LOCKED lists at lines 136, 142, 261, 284, 291, 296; the no-leak invariant at line 24 and 223; cross-container-powers rule at line 323. Note D-06 supersedes the `saveManageModal` lock only.
- `.planning/quick/260722-msg-let-assigned-cross-dept-admins-file-mrfs/` — the shipped picker fix (commit `1b55dee`)

### Authoritative code
- `firestore.rules` — `users.update` (~line 161), `projects` read (line 229), `projects` update (line 251), and the ~12 sites that already treat `personnel_user_ids` as authoritative: 251, 315-319, 344, 602, 637-641, 660, 963, 974, 1015, 1026
- `app/views/services.js:876-903` — **the reference implementation.** Documents the hard constraint ("An unscoped collection query would ... be denied for the entire query") and already ships the target `array-contains` pattern for `operations_user`
- `app/utils.js:318-343, 403-421` — `PROJECT_SEE_ALL_ROLES` / `getAssignedProjectCodes` / `getAssignedServiceCodes`, the fail-closed helpers being repointed
- `app/utils.js:705-776, 779-843` — the two sync helpers being deleted
- `test/firestore.test.js` — existing rules suite; run via `firebase emulators:exec --only firestore --project clmc-procurement "npx mocha test/firestore.test.js --exit --timeout 30000"` (the default 2s mocha timeout is too short for the `before all` hook)
- `CLAUDE.md` — SPA patterns, Firestore schema, window-function requirement for onclick handlers

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`services.js` scoped-query pattern (lines 876-903):** the exact shape to replicate for projects — role check, uid guard with early empty-return, `array-contains` query for scoped roles, unscoped collection for see-all roles. Its inline comments already explain *why*, so they can be mirrored.
- **Uncommitted reference material in the working tree:** an emulator-verified `firestore.rules` carve-out for `users.update` (two target-role + field-masked branches) and 8 regression tests in `test/firestore.test.js`. The user declined to ship this as a stop-gap. Under D-08 the carve-out may become unnecessary (nothing writes the arrays cross-department any more) — planning must decide whether to keep it as defence-in-depth or drop it. **The tests are valuable regardless** and should be retained or adapted, not discarded.
- **Rules test harness:** `@firebase/rules-unit-testing` + mocha, already wired with seeded role fixtures (`active-ops-admin`, `active-services-user`, `active-ops-user`, `active-services-admin`, `active-finance`).

### Established Patterns
- **Fail-closed scoping:** a missing array yields `[]` = sees nothing, deliberately. Preserve this posture when repointing to personnel — a missing/absent `personnel_user_ids` must hide, never reveal.
- **Rule/query pairing:** every scoped Firestore query must be provably satisfiable by the rule predicate. `firestore.rules:597` documents this pairing explicitly for services.
- **Zero-build SPA:** no bundler, no lint, no unit-test runner beyond the rules suite. Verification is the emulator suite plus manual browser UAT against production Firebase.

### Integration Points — preliminary `projects` read audit

Requires completion and re-verification during planning (D-03). Role exposure marked ❓ is unconfirmed.

**Must convert (scoped `*_user` roles reach these):**
- `app/views/projects.js:848` — `onSnapshot(collection(db,'projects'))`, the main list
- `app/views/mrf-form.js:1046` — `loadProjects()`, full collection
- `app/views/project-detail.js:220` — `where('project_code','==',…)`; this is a *list* op and will be denied for scoped users unless paired with `array-contains` or converted to a document `get()`
- `app/views/procurement.js:2932` — partially scoped already via `projScope` at 2981; verify it satisfies the new rule
- `app/proposal-modal.js:212` ❓ — `getDocs(collection(db,'projects'))`, unscoped
- `app/expense-modal.js:50,71,109` ❓ — `where('project_name','==',…)`, cannot satisfy an array-contains-only rule as written
- `app/views/procurement.js:7951` ❓ — `where('project_name','==',…)`, same problem
- `app/views/clients.js:243` ❓ — `where('client_code','==',…)`, same problem

**Safe (see-all roles only, unchanged by D-01):**
- `app/views/assignments.js:192` and `app/views/user-management.js:276` — admin-only surfaces
- `app/views/finance.js:2006,4473` — finance is see-all
- `app/utils.js:278` (`generateProjectCode`) — creation path, `super_admin` / `operations_admin` only
- `scripts/seed-dev-*.js`, `scripts/import.js` — admin/seed tooling

**Key constraint for planning:** equality queries on non-personnel fields (`project_name`, `client_code`, code ranges) are *not* satisfiable under an `array-contains`-only rule. Each must be paired with `array-contains`, converted to a document `get()`, or confirmed reachable only by see-all roles.

</code_context>

<specifics>
## Specific Ideas

- The user's own production experiment is the cleanest confirmation of root cause and should be preserved as the acceptance narrative: the same assignment, on the same project, for the same user, **succeeded when performed by a `super_admin` and silently failed when performed by an `operations_admin`.** Acceptance for this phase should demonstrate the `operations_admin` path now works end to end.
- Remediation nuance discovered during debugging: a plain re-save does **not** repair an already-broken assignment, because `addedUserIds` is a delta (`app/utils.js:725`) — the user must be removed, saved, then re-added. Under the new model this concern disappears entirely (project documents were always written correctly, so repointing reads self-heals existing bad data with no migration). Call this out in verification as an explicit "no migration required" check.
- The user is running the `super_admin`-performs-the-assignment workaround in production until this phase lands. Production rules are **unfixed**; no deploy has occurred.

</specifics>

<deferred>
## Deferred Ideas

- **Reconcile `app/views/procurement.js:3866`** — the Procurement-tab Create-MRF project picker builds options from `projectsData.map(...)` with no role gate and no assignment filter, showing all active projects to everyone. A real scoping hole, but a distinct surface from this phase's defect. Own phase.
- **Delete the legacy `assigned_project_codes` / `assigned_service_codes` fields** — a cleanup script once the personnel-authoritative model is proven in production (D-08 deliberately keeps them as inert rollback insurance).
- **Stop tracking `firestore-debug.log`** — a generated emulator log is committed to the repo and churns on every test run.
- **Revisit whether admins should be scoped at all (kg0 D-1)** — D-01 preserves the status quo, which means server-side enforcement does not constrain admins. If the intent is genuine containment rather than UI tidiness, that is a separate security decision.

</deferred>

---

*Phase: 113-assignment-source-of-truth-and-project-read-enforcement*
*Context gathered: 2026-08-10*
