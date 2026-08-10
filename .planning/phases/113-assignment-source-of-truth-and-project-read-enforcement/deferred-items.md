# Phase 113 — Deferred Items

Out-of-scope discoveries logged during execution, per the executor's SCOPE BOUNDARY rule
("only auto-fix issues DIRECTLY caused by the current task's changes; pre-existing failures
are out of scope, do NOT fix, log here instead").

## 1. Two pre-existing `test/firestore.test.js` failures, unrelated to Phase 113

**Discovered during:** Plan 01, Task 2 (pre-task baseline run, before any Phase 113 edits).

**Confirmed pre-existing, not introduced by Plan 01:** the pre-task baseline run (`firestore.rules`
and `test/firestore.test.js` at commit `8591740`, before any Task 1/Task 2 changes) already showed
these same 2 failures with identical error messages. The post-task run shows the exact same 2
failures, unchanged, plus 7 new passing tests and zero new failures. Neither failing test touches
`services` list/update, `project_tasks`, or `service_tasks` — the only surfaces Plan 01 modifies.

### 1a. `users collection > operations_admin CANNOT read super_admin/finance/procurement docs`
(`test/firestore.test.js:219-223`)

The first assertion (`assertFails(getDoc(doc(opsAdminDb, "users", "active-super-admin")))`) fails
because it now succeeds — by design. `firestore.rules:134` (Phase 84 D-12) intentionally grants
`allow get: if isSignedIn() && resource.data.role == 'super_admin';` so any signed-in user can look
up a super_admin's name/email for notification fan-out (`createNotificationForRoles`). The test
predates that Phase 84 change and was never updated to match.

### 1b. `services collection - role access > operations_admin CANNOT read services collection (department silo)`
(`test/firestore.test.js:622-625`)

Fails because it now succeeds — by design. `firestore.rules:591-593` (`allow get` on `services`)
explicitly includes `operations_admin` in the exempt role list: "operations_admin needs get access
to support `generateProjectCode()` which queries both `projects` and `services` to avoid sequence
number collisions (CODE-01)." The test predates that grant and was never updated.

**Recommendation:** a future `/gsd:quick` (or a REQUIREMENTS/VERIFICATION backfill pass) should
either delete these two stale assertions or flip them to `assertSucceeds` with a comment citing
Phase 84 D-12 / the `generateProjectCode()` CODE-01 rationale, so the suite's pass/fail count
reflects only genuine regressions going forward. Not fixed here — outside Plan 01's additive-only,
services/project_tasks/service_tasks-only scope.

**Verification impact on Plan 01:** the plan's Task 2 acceptance criteria literally state "the
emulator command exits 0" / "zero failing tests" for the whole suite. Both bars are unmet only
because of these 2 pre-existing, unrelated failures — the 7 new Phase 113 tests all pass, and the
overall passing count grew by exactly +7 (54 → 61) with no new failures. See `113-01-SUMMARY.md`
for the full pre/post counts.
