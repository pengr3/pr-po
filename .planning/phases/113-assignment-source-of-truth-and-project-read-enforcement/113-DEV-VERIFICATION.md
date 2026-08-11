# Phase 113 — Live Dev Verification (2026-08-11)

Browser verification against `clmc-procurement-dev` with the tightened rules deployed, driven
through the in-app browser at `http://localhost:8001` (no-cache dev server). This is the substance
of plan 113-11's UAT, executed against dev rather than production.

**Roles exercised:** `super_admin`, `services_admin`, `operations_user`, `operations_admin`.
NOT exercised: `services_user`.

---

## 1. Server-side enforcement now binds (the headline result)

As `services_admin`, whose `getAssignedProjectCodes()` returns `[]` (scoped, zero project
assignments) and `getAssignedServiceCodes()` returns `null` (services home department):

| Query | Result | Significance |
|---|---|---|
| `projects` unscoped list | **DENIED** `permission-denied` | The shape D-15 exists to close. Before today this was `allow read: if isActiveUser()` and would have succeeded. |
| `projects` old `generateServiceCode` range scan | **DENIED** | 113-RESEARCH.md audit row 12 — the highest-severity finding. |
| `getDoc` on an UNASSIGNED project | **DENIED** | D-15's direct-doc-ID closure. A scoped role can no longer reach a project by link. |
| `projects` scoped `array-contains` | ALLOWED, 0 docs | The permitted shape; 0 because this user has no project assignments. |
| `services` unscoped list | ALLOWED, 12 docs | Home department, unaffected by the tightening. |
| `code_counters` read | ALLOWED | Required by the generator transaction. |

## 2. Option B confirmed end-to-end — the counter carries what the range scan used to

Same `services_admin` session, immediately after the range scan above was denied:

```
DMC_2026 before          = 24
generateServiceCode('DMC') → CLMC-DMC-2026025
DMC_2026 after           = 25
```

A **scoped** `services_admin` with no `projects` access allocated a CLMC code. This is the entire
Option B bet — that removing the cross-collection coupling makes scoping safe — verified against
real data rather than inferred from the emulator.

Earlier, as `super_admin`, the shared-sequence guarantee (CODE-01) was confirmed directly:

```
generateServiceCode('DMC') → CLMC-DMC-2026023   counter 22 -> 23
generateProjectCode('DMC') → CLMC-DMC-2026024   counter 23 -> 24
```

A project code and a service code drew from the SAME counter, so a project and a service can still
never be issued the same code — the property the range scan existed to provide.

## 3. The integrity contract fires correctly

`generateServiceCode('NEVERSEEDED')` as the scoped `services_admin`:

> CLMC code counter "NEVERSEEDED_2026" is not initialised, and this account is not permitted to
> derive a starting sequence (permission-denied). Run scripts/seed-code-counters.js as a Super
> Admin before creating this client's first engagement of 2026.

Refused loudly with an actionable instruction rather than starting at 001 and minting a duplicate,
and left no partial counter behind. This is the designed behaviour under `_nextClmcCode()`'s
integrity contract.

By contrast the same call as `super_admin` (a see-all role) self-seeded successfully
(`CLMC-ZZZNEW-2026001`) — the lazy-heal path, also as designed. See `deferred-items.md` item 5:
that left a junk counter which cannot be deleted through the app.

## 4. Composite index build state — verified empirically

All four paired shapes executed without `FAILED_PRECONDITION`, which is a definitive readiness
check (an unbuilt index cannot serve the query). This closes the item previously recorded as
requiring Firebase console access.

| Index | Result |
|---|---|
| `projects` `project_code` + `personnel_user_ids` | OK, 1 doc |
| `projects` `client_code` + `personnel_user_ids` | OK, 2 docs |
| `services` `client_code` + `personnel_user_ids` | OK, 3 docs |
| `services` `service_code` + `personnel_user_ids` (added during UAT) | OK, 1 doc |

## 5. Console sweep — 15 routes, zero errors

As `super_admin`: `#/projects`, project detail, project plan, `#/services`, service detail,
**service plan**, `#/clients`, `#/procurement/records`, `#/procurement/mrfs`, `#/finance`, plus a
second service detail. All rendered real data with zero `console.error`, zero `permission-denied`,
zero missing-index errors.

Includes both surfaces fixed during 113-09's gate: `service-detail.js` (commit `e859d55`) and
`service-plan.js` (commit `9f527da`). Both previously denied for scoped roles.

As `services_admin`: `#/projects` renders cleanly with every scorecard at 0 and Total 0 — correctly
scoped to nothing, no permission errors, because the client issues the permitted scoped query.

## 6. Two observations that are NOT Phase 113 defects

**`[Auth] User document listener error — forcing logout for security: Missing or insufficient
permissions.`** Observed at `#/login` during a role switch. This is the signOut teardown race: the
auth token is revoked while the user-document `onSnapshot` is still attached, it errors, and the
handler force-logs-out — which was already in progress. Phase 113 did not modify the `users` read
rules (`allow get` / `allow list` there are unchanged, still the Phase 84 D-12 shape), so this
predates and is unrelated to this phase.

**Admin dropdown hidden for `services_admin`.** Confirmed via computed style
(`display: none` on `.nav-dropdown[data-route="role_config"]`), consistent with
`seed-roles.js` granting `role_config: { access: false }` to every role except `super_admin`. This
corroborates the operator's UAT step-4 observation and confirms it as intended configuration, not a
Phase 113 regression. Note: a naive `querySelectorAll('.nav-links a')` check reports the Assignments
link as present because the child anchors exist in the DOM inside the hidden container — check the
container, not the links.

---

## 7. `operations_user` — the role the phase is named for

Account `juan.dc@gmail.com`, `all_projects: false`, `all_services: false`, in NEITHER see-all list,
so scoped on both dimensions.

### 7a. The phase's thesis, demonstrated in one reading

```
getAssignedProjectCodes()          -> ["CLMC-ALV-2026008"]
getAssignedServiceCodes()          -> ["CLMC-AYA-2026017", "CLMC-MEG-2026015"]
window._personnelAssignedCodes     -> matches both, exactly
user doc .assigned_project_codes   -> []           <-- the frozen legacy array
user doc .assigned_service_codes   -> (field absent)
```

The legacy arrays say this user is assigned to **nothing**. The live personnel-derived cache
correctly resolves 1 project and 2 services — the services being CROSS-DEPARTMENT assignments for
an operations-department user. Under the pre-phase model, which read those arrays, this user would
have seen an empty application. This is the `services-user-project-hidden` defect class, and D-08's
repoint eliminates it at the source with no migration: the container documents were always correct,
so repointing the read self-heals.

### 7b. Rule enforcement — D-15 proven in BOTH directions

`getDoc` had never been testable in its positive case before this session, because no earlier role
was both scoped and actually assigned.

| Query | Result |
|---|---|
| `projects` unscoped list | **DENIED** |
| `projects` scoped `array-contains` | ALLOWED, 1 doc (matches the getter) |
| `getDoc` on an **ASSIGNED** project | **ALLOWED** — D-15 positive case |
| `getDoc` on an **UNASSIGNED** project | **DENIED** — D-15 doc-ID closure |
| `projects` paired `project_code` + array-contains | ALLOWED, 1 |
| `services` unscoped list | **DENIED** |
| `services` scoped `array-contains` | ALLOWED, 2 (matches the getter) |
| `services` paired `service_code` + array-contains | ALLOWED, 1 |

The getters, the rules and the indexes all agree — the same numbers appear in all three layers.

### 7c. The original bug, fixed for the role that reported it

- `#/services/detail/CLMC-AYA-2026017` — **loads**, full lifecycle, zero permission errors. This is
  the precise scenario that produced `[ServiceDetail] Services listener error: Missing or
  insufficient permissions` during 113-09's UAT. Fixed by `e859d55`.
- `#/services/CLMC-AYA-2026017/plan` — **loads** ("Plan — Monthly Pest control"). Fixed by
  `9f527da`, found only by the code-derived surface enumeration.

### 7d. Portfolio scoping is exact

- `#/projects` → **Total 1** — matches `getAssignedProjectCodes()`
- `#/services` → **Total 2** — matches `getAssignedServiceCodes()`

Both render cleanly with zero console errors.

### 7e. Graceful degradation on an unassigned project

`#/projects/detail/CLMC-AYA-2026004` (a project this user is not personnel on) renders
**"Project not found. Back to Projects"**. The project's name is NOT disclosed — existence is not
leaked, only reachability is denied.

One handled console error accompanies it:

```
[ProjectDetail] Doc-ID fallback lookup failed: Missing or insufficient permissions.
```

That is the Phase 78 D-06 clientless-project doc-ID fallback meeting the tightened `allow get`. It
is caught and degrades to the correct UI. **Minor polish opportunity, not a defect:** after Phase
113 this is an EXPECTED authorization outcome for any scoped user following a stale link or
bookmark, so `console.error` overstates it and adds recurring noise that could mask real failures.
Downgrading it to `console.debug` (or logging only when `error.code !== 'permission-denied'`) would
be a one-line improvement. Deliberately not changed here — outside this session's scope.

---

## 8. `operations_admin` — the preserved `services` exemption

Account `test@gmail.com`, `all_projects: true`, `all_services: false`.

```
getAssignedProjectCodes() -> null   (projects = operations home department, see-all)
getAssignedServiceCodes() -> []     (client-scoped; no service personnel assignments)
```

### 8a. The constraint pinned in 113-09 holds

| Query | Result |
|---|---|
| `projects` unscoped list | ALLOWED, 11 — home department |
| `services` unscoped list | ALLOWED, 12 — **rules-exempt**, despite client scoping |
| **`procurement.js:8018` shape: bare `where('service_code','==',X)`** | **ALLOWED, 1** |
| `services` scoped `array-contains` | ALLOWED, 0 |

The third row is the one that mattered. During 113-09's audit this call site was flagged as safe
only while `operations_admin` remains in the `services` allow-list exempt set, with the warning that
if plan 113-10's D-01/D-16 decision removed it, the PO-Delivered service-journal entry would fail
**silently** inside a best-effort `try/catch`. Plan 113-10 deliberately kept the exemption; this
confirms the bare query still resolves.

### 8b. The client/rules split, demonstrated

- `#/projects` → **Total 11** (see-all, home department)
- `#/services` → **Total 0** (client-scoped to `[]`)
- `#/procurement/records` → loads clean

`operations_admin` can read every service at the RULES layer — which `procurement.js:8018` and
`generateProjectCode()`'s cross-collection collision check both require — while the UI correctly
shows zero services, because assignment, not department role, drives what a user sees. The two
layers are intentionally not identical, and both behave as designed. Zero console errors across all
three routes.

### 8c. What could NOT be exercised

The end-to-end PO-Delivered flow has no data to run against: dev contains 3 POs and **zero service
MRFs** (`serviceMrfCount: 0`), so no PO traces to a service. Fabricating a service MRF + PO chain
purely to trigger it was judged not worth the synthetic data.

Residual risk is low rather than zero: the rules-layer permission was the part this phase could have
broken, and it is verified directly in 8a. `procurement.js:8018`'s client code was untouched by
Phase 113 apart from an added comment (confirmed by `git diff` during plan 113-06). What remains
unobserved is only the client wiring around it, which this phase did not modify.

---

## Still unverified in a browser

Requires logins not exercised in this session:

1. `services_user` — the mirror of section 7, from the services department. Lower risk now that
   `operations_user` passes, since both take the identical code path through the same getters, but
   not observed.
2. The canonical acceptance narrative (113-09 step 1) re-run under the TIGHTENED rules — an
   `operations_admin` assigning a `services_user` via the Personnel panel, who then sees the project
   without a re-save. It passed under the permissive rules before tightening. Section 7a is strong
   indirect evidence (a user whose legacy arrays are empty resolves assignments correctly from live
   personnel membership), but the assign-then-observe round trip itself was not re-run.
3. The end-to-end PO-Delivered → service-journal flow — blocked by dev having zero service MRFs.
   The rules-layer permission it depends on IS verified (section 8a); only the surrounding client
   wiring, which this phase did not modify, is unobserved.
4. The MRF form / Create-MRF picker offering exactly the assigned projects and services.
5. Everything above against PRODUCTION, which currently has no part of Phase 113 deployed.

---
*Verified against `clmc-procurement-dev` on 2026-08-11.*
