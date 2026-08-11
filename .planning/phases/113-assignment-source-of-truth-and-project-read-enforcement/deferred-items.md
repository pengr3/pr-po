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

## 2. Production deploy of the Phase 113 additive indexes + rules (CARRY — blocking before prod ship)

**Discovered during:** Plan 02 (Wave-2 deploy gate).

Plan 113-02 as written deploys to production `clmc-procurement`. The operator redirected it to
dev-first, so `clmc-procurement-dev` now serves the 4 `personnel_user_ids` composite indexes (a 4th, services x service_code, was added during 113-09 UAT gap closure) and the
additively-widened `firestore.rules`, while **production still serves the pre-Phase-113 rules and 18
indexes**.

D-03 ("the additive rules + indexes are LIVE in production before any client query conversion ships")
is therefore satisfied on dev only. The Wave-4 client conversions issue
`where('personnel_user_ids','array-contains',uid)` queries that current PRODUCTION rules deny for a
`services_user`, and Netlify auto-deploys from a push — so the production deploy must precede the
next push of converted client code, and no later than plan 113-11's gate.

**Required, in order, against production:**
```
firebase use                                   # expect clmc-procurement
firebase deploy --only firestore:indexes       # then wait for Enabled in the console
firebase deploy --only firestore:rules
```
Note this deploy also carries the standing un-deployed rules debt from phases 87.4 / 99 / 100 / 101 /
102 / 103.1 / 104 / 105-01 plus the `fix(crossdept-sync)` carve-out at `8591740` — diff before shipping.

## 3. Index `Enabled`-state check has no local automation

**Discovered during:** Plan 02.

`firebase firestore:indexes --project <alias>` returns export-shaped configuration and omits the
Firestore Admin API's `state` field; `gcloud` is not installed and there is no local service-account
key. Index build state can only be read from the Firebase console.

**Action:** before plan 113-04's UAT exercises the paired queries, eyeball
Firebase console → Firestore → Indexes on dev (and later prod) and confirm all 4
`personnel_user_ids` indexes read `Enabled`, not `Building`.

## 4. Stale `scripts/verify-phase-88.sh` reference to a removed symbol (pre-existing, unrelated to Phase 113)

**Discovered during:** Plan 09, Task 1 (running the plan's literal `git grep -n "syncPersonnelToAssignments\|syncServicePersonnelToAssignments" -- app scripts index.html` acceptance check).

`scripts/verify-phase-88.sh:86-95` greps `app/views/proposals.js` for the string
`syncServicePersonnelToAssignments` and asserts it is present and imported from `utils.js`. That
import was removed from `app/views/proposals.js` back in Phase 87.1 (`bdc5735`
"strip orphaned modal/queue code from proposals.js" and `4fb3611` "remove engagement form code
from proposals.js") — long before Phase 113 began. The script itself was never updated after that
Phase 87.1 refactor, so it has been silently checking for a symbol that hasn't existed in that file
since 2026 Phase 87.1, independent of anything Phase 113 changed.

**Confirmed pre-existing:** `git log --oneline -S "syncServicePersonnelToAssignments" -- app/views/proposals.js`
shows the string was removed by Phase 87.1 commits, not by any Phase 113 commit.

**Verification impact on Plan 09 Task 1:** the plan's literal `git grep -n "..." -- app scripts index.html`
acceptance check finds 6 lines inside `scripts/verify-phase-88.sh` (comments/assertions, not
executable references to a real symbol) and therefore does not return "no matches" as literally
written. The actual acceptance intent — zero live consumers of the two deleted sync helpers, and
zero references inside `app/` — is fully satisfied; `git grep` scoped to `app` alone returns
nothing. Not fixed here — `scripts/verify-phase-88.sh` is a historical, one-off Phase-88
verification script outside `app/utils.js`'s task scope, and editing it would not change any
runtime behavior.

**Recommendation:** a future `/gsd:quick` pass should delete or update
`scripts/verify-phase-88.sh`'s stale `syncServicePersonnelToAssignments` assertions (Phase 88 has
long since shipped and this script has no CI trigger — it's a manual-run relic).

## 4. RESOLVED on dev: composite index build state verified empirically

**Item 3 above is closed for dev.** Console access was never needed. An unbuilt composite index
returns `FAILED_PRECONDITION: The query requires an index`, so simply *running* each paired shape
is a definitive readiness check. All four executed successfully against `clmc-procurement-dev`
from the live app on 2026-08-11:

| Shape | Result |
|---|---|
| `projects` `project_code` + `personnel_user_ids` array-contains | OK, 1 doc |
| `projects` `client_code` + array-contains | OK, 2 docs |
| `services` `client_code` + array-contains | OK, 3 docs |
| `services` `service_code` + array-contains (4th index, added during UAT) | OK, 1 doc |

Use the same technique on production after deploying rather than eyeballing the console.
Still OPEN for production — nothing in Phase 113 is deployed there yet (item 2).

## 5. Junk counter `code_counters/ZZZNEW_2026` on dev — needs manual removal

**Created during:** live verification of the counter-document generator, 2026-08-11.

Calling `generateServiceCode('ZZZNEW')` for a deliberately nonexistent client proved the bootstrap
path self-seeds for a see-all role. It also left behind `code_counters/ZZZNEW_2026` with
`last_seq: 1`.

**It cannot be deleted through the app, by design.** `firestore.rules` sets
`allow delete: if false` on `code_counters`, because deleting a counter would silently reset the
sequence and mint duplicate CLMC codes. Removal requires the Firebase console or the Admin SDK.

Harmless — it is a counter for a client code no document uses — but it is litter. Note the general
consequence of the design: counters are effectively append-only, so a typo'd client code creates a
permanent counter document. That is the correct trade (a deletable counter is a duplicate-code
vector), but worth knowing before someone reports it as a bug.

**Also on dev:** `DMC_2026` advanced 22 -> 24 during the same verification. Two sequence numbers
were consumed without a corresponding document; the next DMC engagement will be `...025`. Gaps in
the sequence are expected and harmless — the counter guarantees uniqueness, not contiguity.
