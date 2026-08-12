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

**`operations_user` cannot reach `#/services`.** Found during this UAT. Not a Phase 113 regression — the Services tab is hidden by role template (`tabs.services.access: false`, `scripts/seed-services-role-permissions.js:49`), deliberate since v2.3, and `services` `allow get` is byte-identical at `a0c4689` and HEAD. Logged to `BACKLOG.md` (`dec07f5`). Mark services rows **N/A** for `operations_user` in step 9.

---

# Section A — must run on production

## A1. Canonical acceptance narrative (D-05) ⭐

*Why prod:* `113-DEV-VERIFICATION.md` "Still unverified" item 1 — this round trip has **never** been re-run under the tightened rules, on any environment. §7a is strong indirect evidence only.

As `operations_admin`, assign a `services_user` to a project via the project-detail Personnel panel. Logged in separately as that `services_user`, with **no** re-save, removal or re-add: `#/projects` lists the project, and the dedicated MRF form's picker offers it.

**Result:**
**Notes:**

---

## A2. No migration required

*Why prod:* dev lacks production's legacy assignment shapes. A dev pass here would be a false negative.

A user assigned **before** this phase still sees their existing projects and services on `#/projects`, `#/services`, the MRF form picker and the Procurement tab. No backfill was run.

**Result:**
**Notes:**

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

**Result — operations_user:**
**Result — services_user:**
**Notes:**

---

## A5. PO-Delivered → service journal

*Why prod:* dev has **zero service MRFs** — the flow is untestable there ("Still unverified" item 2). Production has 125 services. The rules-layer permission is verified (§8a); only the client wiring is unobserved.

Exercise a PO reaching **Delivered** on a service-anchored MRF and confirm the service journal entry appears.

**Result:**
**Notes:**

---

## A6. Assignments tab round trip (D-05, D-10) — as `super_admin`

*Why prod:* 113-09 verified this **pre-tightening**. Plan 113-10 then dropped the `users.update` cross-department carve-out (D-17), so the write path changed after that verification.

On the Projects sub-tab and the Services sub-tab: open Manage for a user, check and uncheck items, save. Confirm the success toast, the updated Assignment Count, and the change reflected in the container's Personnel panel. Then confirm a user assigned via the **Personnel panel only** still appears as a manageable row.

**Result — Projects sub-tab:**
**Result — Services sub-tab:**
**Result — personnel-only row manageable:**
**Notes:**

---

## A7. Quick spot-checks (~5 minutes total)

**Plan-task writes (step 10)** — as a user assigned via the Personnel panel **only**, open a Plan page and create, rename, delete a task. All three succeed.

**Result:**

**See-all roles (step 4, remainder)** — as `finance`, `procurement`, `super_admin`: `#/projects` lists everything. Low risk: these are a plain `hasRole(['super_admin','finance','procurement','operations_admin'])` exemption on both `get` and `list`, with no scoping logic to get wrong. `operations_admin` already covered by dev §8a.

**Result:**

**Escape hatch (step 5)** — if any account holds `all_projects: true` or `all_services: true`, confirm it still sees everything. If none exists, record that.

**Result:**

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

**Overall:**
**Failing items:**
**Date completed:**
