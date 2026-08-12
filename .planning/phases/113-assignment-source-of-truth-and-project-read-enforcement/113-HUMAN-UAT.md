# Phase 113 — Post-Tightening UAT

**Plan:** 113-11 Task 2
**Environment:** production (`clmc-procurement`) via https://clmcop.netlify.app
**Date started:** 2026-08-12

---

## Deploy record (Task 1)

| Item | Value |
|------|-------|
| Firebase target | `clmc-procurement` (confirmed before each deploy) |
| Rollback SHA (`firestore.rules`) | **`a0c4689`** — verified permissive `allow read: if isActiveUser()` |
| Tightened rules commit | `c93d6dc` (shipped as part of `f205889`) |
| Client bundle | `f205889` pushed to `origin/main`, verified live (`clmcCounterId` present, `syncPersonnelToAssignments` absent) |
| Composite indexes | 4/4 personnel indexes `READY` before any rules change |
| `code_counters` seeded | 49/49 written + `MALDOR_2026` created manually at `last_seq: 1`; re-verified 49/49 `OK` |
| Rules deploy | `released rules firestore.rules to cloud.firestore`, compiled clean |
| **Immediate smoke check** | **PASS** — scoped user sees assigned projects on `#/projects` |

**Rollback if any scoped role is denied wholesale:**

```bash
git checkout a0c4689 -- firestore.rules && firebase deploy --only firestore:rules
```

Rules apply instantly and no index shipped in this deploy — recovery is seconds.

### Deviation from plan 113-11 as written

Plan 113-11 stated *"No index change ships in this deploy"* and never mentioned counter seeding. Both were stale — written before plans 113-09 and 113-10 expanded scope. The sequence actually executed follows `113-10-SUMMARY.md:125`: indexes → `cf0fa92` rules + client bundle → seed counters → tightened rules → smoke check.

---

## Scope decision — reduced production UAT

Plan 113-11 was written as if nothing had been browser-verified. That is no longer true: **`113-DEV-VERIFICATION.md` (2026-08-11) exercised all five roles against the TIGHTENED rules** on `clmc-procurement-dev`.

This UAT therefore runs only what dev evidence cannot answer — the data-dependent behaviour that exists solely in production. Steps satisfied by prior evidence are recorded in **Section B** with pointers, not re-run.

Rationale for each exclusion is stated. Nothing is silently dropped.

---

## Known corrections

**Assignments-tab attribution is wrong in plan 113-11.** Steps 6(c) and 7 assign it to `operations_admin` / `services_admin`. The tab lives under `#/admin`, gated on `role_config`, which `seed-roles.js` grants to **`super_admin` only**. Plan 113-09 hit this and recorded it as *"intended design, not a defect — no config change made"*; `113-DEV-VERIFICATION.md` §6 independently corroborates it. Run step 7 as `super_admin`. Do not file a FAIL for 6(c).

**Hard-refresh between role switches.** The role template is read via a live `onSnapshot` (`app/permissions.js:92`), so a session that has not fully torn down can leave the previous role's permissions in memory. This produced one transient false observation during this UAT (a `services_user` appearing to lack Projects access, which did not reproduce). Ctrl+Shift+R after every account switch.

**`operations_user` cannot reach `#/services`.** Found during this UAT. Not a Phase 113 regression — the Services tab is hidden by role template (`tabs.services.access: false`, `scripts/seed-services-role-permissions.js:49`), deliberate since v2.3, and `services` `allow get` is byte-identical at `a0c4689` and HEAD. Logged to `BACKLOG.md` (`dec07f5`). Mark services rows **N/A** for `operations_user` in step 9.

---

# Section A — must run on production

## A1. Canonical acceptance narrative (D-05) ⭐

*Why prod:* `113-DEV-VERIFICATION.md` "Still unverified" item 1 — this round trip has **never** been re-run under the tightened rules, on any environment. §7a is strong indirect evidence only.

As `operations_admin`, assign a `services_user` to a project via the project-detail Personnel panel. Logged in separately as that `services_user`, with **no** re-save, removal or re-add: `#/projects` lists the project, **and** the dedicated MRF form's picker offers it.

### Note on role permissions — `services_user` DOES have Projects access

An earlier draft of this document claimed a `services_user` cannot reach `#/projects` and narrowed A1 to the MRF picker. **That was wrong** and is corrected here.

`app/permissions.js:97` sets `currentPermissions = roleData.permissions`, so the operative map is **`permissions.tabs.*`**. Verified against live production:

| Role | `permissions.tabs.projects.access` | `permissions.tabs.services.access` |
|---|---|---|
| `services_user` | **true** | true |
| `services_admin` | **true** | true |
| `operations_user` | true | **false** |

Both A1 clauses are therefore observable for a `services_user`. Run both.

**Data-quality finding (not a Phase 113 issue):** these documents also carry a **stray top-level `tabs` map** that nothing reads — `role_templates/services_user` has `tabs.projects.access: false` there, contradicting the operative `permissions.tabs.projects.access: true`. Root cause: `scripts/seed-services-role-permissions.js` writes dotted paths like `'tabs.services.access'` instead of `'permissions.tabs.services.access'`, so **every write that script makes is inert**. Logged to `BACKLOG.md`.

Also verified: `mrf-form.js:406`'s `showProjects` role list includes `services_user`, so the picker clause is reachable too.

**Result — `#/projects` lists it:** ✅ **PASS** (2026-08-12)
**Result — MRF picker offers it:** ✅ **PASS** (2026-08-12)
**Notes:** The defect that produced this phase is dead. An `operations_admin`-performed Personnel-panel assignment is immediately visible to the `services_user` on **both** surfaces, with no re-save, removal or re-add — the workaround that previously required a `super_admin` to perform the assignment is no longer needed.

Significance: this is the first time the canonical narrative has been exercised **under the tightened rules on any environment** (`113-DEV-VERIFICATION.md` listed it as still unverified), and the first time with **both sync pipelines deleted**. `personnel_user_ids` is now demonstrably the single authoritative record — the assignment propagates with no derived array, no backfill, and no sync write to fail silently.

That closes D-05 and the bug class behind four recurrences (quick-260627-kg0, quick-260706-mco, quick-260722-msg, and this phase), each of which had previously been patched at a different read/UI layer without the write layer ever being audited.

---

## A2. No migration required

*Why prod:* dev lacks production's legacy assignment shapes. A dev pass here would be a false negative.

A user assigned **before** this phase still sees their existing projects and services on `#/projects`, `#/services`, the MRF form picker and the Procurement tab. No backfill was run.

**Result:** ✅ **PASS** (2026-08-12) — verified as both a scoped `operations_user` and a scoped `services_user`
**Notes:** Pre-existing assignments resolve correctly with **no migration and no backfill**. This is the load-bearing proof that `personnel_user_ids` alone reconstructs what the retired `assigned_project_codes` / `assigned_service_codes` arrays used to carry — for legacy production data, not just newly-created assignments. Dev could not establish this: its data lacks production's legacy assignment shapes.

---

## A3. Service creation as `services_admin` (step 6b) ⭐⭐

*Why prod:* dev seeded 6 client/year pairs. Production has **49 + MALDOR**, alongside 7 malformed codes and one pre-existing duplicate. This is the payoff of the entire `code_counters` migration and the regression path for RESEARCH.md's highest-severity finding.

As `services_admin`, create a new service. It must **succeed** and receive a `CLMC-...` code.

- Failure shows as the toast *"Failed to create service"*
- A *"counter is not initialised"* error means that client/year has no counter — **record the client code immediately**

**Result:** ✅ **PASS** (2026-08-12)
**Code issued:** `CLMC-AFTMC-2026002`
**Notes:** Confirms the trade the `code_counters` migration was built to make possible — `services_admin` is scoped off `projects` (Option B / D-16) *and* service creation still succeeds. No *"counter is not initialised"* throw, no *"Failed to create service"* toast.

**Counter document verified directly against production** — `code_counters/AFTMC_2026`:

```json
{ "client_code": "AFTMC", "year": 2026, "last_seq": 2,
  "created_at": "2026-08-11T18:54:13.275Z",
  "updated_at": "2026-08-12T02:39:27.899Z" }
```

This closes the loop on every layer of the design at once:

| Claim | Evidence |
|---|---|
| Seeding derived the right starting value | `last_seq` seeded to **1**, matching the pre-existing `CLMC-AFTMC-2026001`; `created_at` is the seed-apply timestamp |
| The `runTransaction` increment path works in production | `updated_at` is ~7¾ h later, at the service creation — `tx.update(counterRef, {last_seq: n, updated_at: serverTimestamp()})` fired |
| The issued code matches the counter exactly | `last_seq: 2` ↔ code `...2026002` |
| No duplicate minted | `...002` does not collide with the existing `...001` — the precise failure the integrity contract exists to prevent |
| The monotonic rule permitted a forward move | 1 → 2 satisfies `request.resource.data.last_seq > resource.data.last_seq` |

Had the counter been missing or seeded too low, this create would have either thrown *"counter is not initialised"* or re-issued `...001`.

---

## A4. MRF form and Create-MRF pickers

*Why prod:* `113-DEV-VERIFICATION.md` "Still unverified" item 4 — depends on real assignment data.

As a scoped `operations_user` **and** a scoped `services_user`: the dedicated MRF form picker and Procurement → Create MRF offer **exactly** the assigned projects/services — no more, no fewer.

**Result — operations_user:** ✅ **PASS** (2026-08-12)
**Result — services_user:** ✅ **PASS** (2026-08-12)
**Notes:** The dedicated MRF form picker offers exactly the assigned projects/services for both scoped roles. Combined with A1, this closes the second half of the original defect — the report was that the assigned project was *"not offered in the MRF form's project picker"* and the user *"cannot write MRFs for that project."*

The Procurement → Create-MRF picker remains known-unscoped and is **not** a pass criterion here — accepted as **T-113-60** in plan 113-11's threat model and carried to its own phase.

---

## A5. PO-Delivered → service journal

*Why prod:* dev has **zero service MRFs** — the flow is untestable there ("Still unverified" item 2). Production has 125 services. The rules-layer permission is verified (§8a); only the client wiring is unobserved.

Exercise a PO reaching **Delivered** on a service-anchored MRF and confirm the service journal entry appears.

**Result:** ⏸ **DEFERRED — not exercisable** (2026-08-12)
**Notes:** No service-anchored PO was in a state where marking it Delivered would have been a genuine business event. Fabricating one would write real production data purely to satisfy a check.

**Why deferring is acceptable:**
1. **Not a plan 113-11 acceptance criterion.** This item was added to this UAT from `113-DEV-VERIFICATION.md`'s own gap list ("Still unverified" item 2), as extra rigour. None of plan 113-11's 11 steps require it.
2. **The rules-layer permission it depends on is already verified** — `113-DEV-VERIFICATION.md` §8a. That is the only layer this phase could have broken.
3. **This phase did not modify the surrounding client wiring.** The dev doc states it explicitly: *"only the surrounding client wiring, which this phase did not modify, is unobserved."*
4. The one Phase 113 change that touches this path — plan 113-06's PO-Delivered doc-ID journal lookup (`e62d178`, replacing a name lookup with a direct doc read) — is strictly narrower than what it replaced and needs no list permission.

**Carry as a watch item:** the next time a service-anchored PO reaches Delivered in normal operation, confirm the journal entry appears. If it does not, the fix is scoped to `procurement.js`'s journal write, not to the rules.

---

## A6. Assignments tab round trip (D-05, D-10) — as `super_admin`

*Why prod:* 113-09 verified this **pre-tightening**. Plan 113-10 then dropped the `users.update` cross-department carve-out (D-17), so the write path changed after that verification.

On the Projects sub-tab and the Services sub-tab: open Manage for a user, check and uncheck items, save. Confirm the success toast, the updated Assignment Count, and the change reflected in the container's Personnel panel. Then confirm a user assigned via the **Personnel panel only** still appears as a manageable row.

**Result — Projects sub-tab:** ✅ **PASS** (2026-08-12)
**Result — Services sub-tab:** ✅ **PASS** (2026-08-12)
**Result — personnel-only row manageable:** ✅ **PASS** (2026-08-12)
**Notes:** Closes D-05 and D-10 on the write side. The Assignments tab now writes `personnel_user_ids` directly onto the container, the change round-trips to the container's Personnel panel, and a user assigned **only** via a Personnel panel still appears as a manageable row — proving the two entry points share one authoritative record rather than two views of a derived array.

Also confirms the D-17 `users.update` carve-out removal caused no regression: the previous verification of this surface (113-09) predates that change.

---

## A7. Quick spot-checks (~5 minutes total)

**Plan-task writes (step 10)** — as a user assigned via the Personnel panel **only**, open a Plan page and create, rename, delete a task. All three succeed.

**Result:** ✅ **PASS** (2026-08-12) — create, rename and delete all succeeded. This is the frozen-array trap plan 113-01 closed: the write rules the original research audit never covered. Without this step it would have surfaced weeks later as an unexplained permission error (threat T-113-59).

**See-all roles (step 4, remainder)** — as `finance`, `procurement`, `super_admin`: `#/projects` lists everything. Low risk: these are a plain `hasRole(['super_admin','finance','procurement','operations_admin'])` exemption on both `get` and `list`, with no scoping logic to get wrong. `operations_admin` already covered by dev §8a.

**Result:** ✅ **PASS** (2026-08-12) — `finance` and `procurement` both list every project. `super_admin` exercised continuously throughout this deploy (seeding, A6, counter verification) with full visibility and no denial; recorded as satisfied by that use rather than as a discrete check.

**Escape hatch (step 5)** — if any account holds `all_projects: true` or `all_services: true`, confirm it still sees everything. If none exists, record that.

**Result:** ⬜ **NOT RUN** — the enumerating snippet was not executed. Low risk: `getUserData().all_projects == true` is a hoisted top-level OR term in both the `projects` and `services` read rules, and dev §7 verified the hatch under the tightened rules. If no account carries either flag, the branch is unreachable and the step is vacuous.

---

# Section B — covered by prior evidence, not re-run

| Plan step | Disposition | Evidence |
|---|---|---|
| **3** — scoped read enforcement, incl. unassigned project by direct URL in both `project_code` and doc-ID forms | **Covered** | `113-DEV-VERIFICATION.md` §1 (`getDoc` on unassigned = **DENIED**), §7b (D-15 proven in *both* directions), §7d (portfolio scoping exact), §7e (clientless doc-ID fallback meeting tightened `allow get`) |
| **4** — `operations_admin` see-all | **Covered** | §8a — preserved `services` exemption verified; remainder spot-checked in A7 |
| **6a** — `services_admin` scoped on `#/projects` | **Covered** | §2 — Option B confirmed end-to-end |
| **6c** — Assignments tab as `services_admin` | **N/A by design** | Tab is `role_config`-gated to `super_admin`. §6 + 113-09 both record this as intended configuration |
| **8** — D-04 no-leak invariant | **Automated** | `scripts/verify-crossdept-admin-scoping.js` asserts both directions; 113-09 added the services-side mirror |
| **9** — full 15-route console sweep | **Covered on dev**, reduced here | §5 — 15 routes, zero errors. Production-data-dependent surfaces retained as A4/A5 |
| **11** — D-14 residual subcollection exposure | **Documented acceptance** | Rules unchanged by this phase; recorded in `113-CONTEXT.md` `deferred`, carried in `firestore.rules`, and booked as its own future phase. Not a defect to file |
| **Composite index readiness** | **Covered twice** | §4 empirical (no `FAILED_PRECONDITION`) + all 4 confirmed `READY` in production before the rules deploy |

---

## Failure protocol

- **Any scoped role denied wholesale on a list surface** → roll back **first**, then plan the gap:
  ```bash
  git checkout a0c4689 -- firestore.rules && firebase deploy --only firestore:rules
  ```
- **Any other failure** → record it, then run `/gsd:plan-phase 113 --gaps`
- Keep DevTools Console open. Capture the **full text** of any `permission-denied` or `The query requires an index`.

---

## Outcome

**Overall:** ✅ **PASS** — Phase 113's goal is demonstrated in the live application.

| Item | Result |
|---|---|
| **A1** — canonical acceptance narrative (D-05) | ✅ PASS |
| **A2** — no migration required | ✅ PASS (both scoped roles) |
| **A3** — service creation → `CLMC-AFTMC-2026002` | ✅ PASS (counter verified 1→2) |
| **A4** — MRF form pickers | ✅ PASS (both scoped roles) |
| **A5** — PO-Delivered → service journal | ⏸ deferred, not exercisable (rationale above) |
| **A6** — Assignments tab round trip (D-05/D-10) | ✅ PASS (both sub-tabs + personnel-only row) |
| **A7.1** — plan-task writes | ✅ PASS |
| **A7.2** — see-all roles | ✅ PASS |
| **A7.3** — escape hatch | ⬜ not run (vacuous if no flagged account) |

**Failing items:** none.

**Zero rollbacks.** The rollback path (`a0c4689`) was never exercised. No scoped role was denied wholesale on any list surface at any point.

### What this establishes

- `personnel_user_ids` is the **single authoritative record** for cross-department assignment visibility — proven for both newly-created (A1) and pre-existing, un-migrated (A2) assignments, with both sync pipelines deleted and no backfill run.
- Read scoping is **enforced server-side**, not cosmetically — dev proved D-15 in both directions; production confirms scoped roles see exactly their assignments.
- The `services_admin`-scoped-on-`projects` posture (Option B / D-16) works **because** the `code_counters` migration removed service creation's dependency on reading every project — A3 proves both halves of that trade at once.
- The write layer holds: Assignments-tab round trip (A6) and plan-task writes (A7.1) both succeed under the tightened rules with the D-17 carve-out removed.

### Findings recorded, none blocking

1. **Cross-department Services access gap** — an assigned `operations_user` cannot reach an assigned service (`allow get` omits the role; route blocked). Pre-existing, verified byte-identical pre/post tightening. → `BACKLOG.md`
2. **`seed-services-role-permissions.js` writes an inert field path** — `tabs.*` instead of `permissions.tabs.*`, creating a stray shadow structure that contradicts the operative one. Cost real debugging time during this UAT. → `BACKLOG.md`
3. **Plan 113-11 was stale** — claimed no index change and omitted counter seeding; the executed sequence follows `113-10-SUMMARY.md:125`.
4. **Plan 113-11 repeated 113-09's Assignments-tab role misattribution** — corrected here.
5. **D-14 residual** (journal subcollections readable by known doc ID) — knowingly accepted, booked as its own phase, not re-tested.
6. **T-113-60** (Procurement Create-MRF picker unscoped) — accepted, deferred, explicitly excluded from A4's pass criteria.

**Date completed:** 2026-08-12
