# Phase 113 — Live Dev Verification (2026-08-11)

Browser verification against `clmc-procurement-dev` with the tightened rules deployed, driven
through the in-app browser at `http://localhost:8001` (no-cache dev server). This is the substance
of plan 113-11's UAT, executed against dev rather than production.

**Roles exercised:** `super_admin`, `services_admin`. NOT exercised: `operations_user`,
`services_user`, `operations_admin` — each needs its own login.

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

## Still unverified in a browser

Requires logins not exercised in this session:

1. `operations_user` / `services_user` — portfolio scoped to assigned projects only, and the MRF
   picker offering exactly those
2. The canonical acceptance narrative (113-09 step 1) re-run under the TIGHTENED rules — it passed
   under the permissive rules before tightening
3. `operations_admin` marking a PO Delivered on a service MRF — exercises the `services` exempt-set
   membership deliberately preserved for `procurement.js:8018`
4. Everything above against PRODUCTION, which currently has no part of Phase 113 deployed

---
*Verified against `clmc-procurement-dev` on 2026-08-11.*
