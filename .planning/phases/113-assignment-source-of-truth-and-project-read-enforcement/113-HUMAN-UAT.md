# Phase 113 — Post-Tightening Browser UAT

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
| `code_counters` seeded | 49/49 written + `MALDOR_2026` created manually; re-verified 49/49 `OK` |
| Rules deploy | `released rules firestore.rules to cloud.firestore`, compiled clean |
| **Immediate smoke check** | **PASS** — scoped user sees assigned projects on `#/projects` |

**Rollback command if any scoped role is denied wholesale:**

```bash
git checkout a0c4689 -- firestore.rules && firebase deploy --only firestore:rules
```

Rules apply instantly and no index shipped in this deploy — recovery is seconds.

### Deviation from plan 113-11 as written

Plan 113-11 stated *"No index change ships in this deploy"* and made no mention of counter seeding. Both were stale — written before plans 113-09 and 113-10 expanded scope. The actual sequence executed follows `113-10-SUMMARY.md:125`:

1. Deploy 4 personnel indexes → wait for `READY`
2. Deploy `cf0fa92` rules (`code_counters` added, `projects` still permissive) + push client bundle
3. Seed `code_counters` from the live production site as Super Admin
4. Deploy tightened rules (`c93d6dc`)
5. Smoke check → this UAT

---

## Known corrections before you start

**Step 7 and step 6(c) contain an attribution error that plan 113-09 already identified and resolved.**

113-09's own UAT hit this: the Assignments tab lives under `#/admin`, gated on `role_config`, which `seed-roles.js` grants to **`super_admin` only**. The plan's attribution of Assignments-tab steps to `operations_admin` / `services_admin` was wrong, and 113-09 recorded it as *"intended design, not a defect — no config change made."*

Plan 113-11 repeats the same wrong attribution. Do **not** file a FAIL if `operations_admin` or `services_admin` cannot reach the Assignments tab — that is the designed behaviour. Run steps 6(c) and 7 as `super_admin`, and record the role you actually used.

---

## The 11 steps

Record PASS / FAIL and the **full text** of any `permission-denied` or `The query requires an index` message. Keep DevTools Console open throughout.

### 1. Canonical acceptance narrative (D-05) — the defect that produced this phase

As `operations_admin`, assign a `services_user` to a project via the project-detail Personnel panel. Logged in separately as that `services_user`, with **no** re-save, removal or re-add: `#/projects` lists the project, and the dedicated MRF form's picker offers it.

*Previously this worked only when a `super_admin` performed the assignment.*

**Result:**
**Notes:**

---

### 2. No migration required

A user assigned **before** this phase still sees their existing projects and services on `#/projects`, `#/services`, the MRF form picker and the Procurement tab. No backfill was run.

**Result:**
**Notes:**

---

### 3. Scoped read enforcement (D-01) — DENY-SHAPED, must be exercised

As a scoped `operations_user` or `services_user`:

- (a) `#/projects` shows **only** assigned projects
- (b) Navigate directly by URL to an **unassigned** project's detail page — `#/project-detail/<code>` — and confirm it does **not** render
- (c) Same for a **clientless** project by doc ID — `#/project-detail/<docId>`

This is D-15's `allow get` scoping. It was permitted before this phase.

**Result (a):**
**Result (b):**
**Result (c):**
**Notes:**

---

### 4. See-all roles unaffected (D-01)

As `super_admin`, `finance`, `procurement` and `operations_admin`: `#/projects` still lists **every** project and every project-detail page opens.

**Result — super_admin:**
**Result — finance:**
**Result — procurement:**
**Result — operations_admin:**
**Notes:**

---

### 5. Escape hatch (D-09)

If any account holds `all_projects: true` or `all_services: true`, confirm it still sees everything on the corresponding list view after the tightening. If no such account exists, record that.

**Result:**
**Notes:**

---

### 6. `services_admin` posture (D-16 / plan 113-10 Task-1 decision = Option B, SCOPED)

- (a) `#/projects` shows **only** its assigned projects
- (b) Creating a new service **SUCCEEDS** and receives a `CLMC-...` code — failure shows as the toast *"Failed to create service"* and is the regression path for RESEARCH.md's highest-severity finding
- (c) Assignments tab produces no `permission-denied` console error — **see "Known corrections" above; services_admin is not expected to reach this tab at all**

**Result (a):**
**Result (b) — code issued:**
**Result (c):**
**Notes:**

> (b) is the step the entire `code_counters` migration exists to protect. If it fails with *"counter is not initialised"*, record the client code — that client/year has no counter.

---

### 7. Assignments tab round trip (D-05, D-10) — run as `super_admin`

On the Projects sub-tab and the Services sub-tab: open Manage for a user, check and uncheck items, save. Confirm the success toast, the updated Assignment Count, and the change reflected in the container's Personnel panel. Then confirm a user assigned via the **Personnel panel only** still appears as a manageable row.

**Result — Projects sub-tab:**
**Result — Services sub-tab:**
**Result — personnel-only row manageable:**
**Notes:**

---

### 8. D-04 no-leak invariant

As a cross-department admin (`services_admin` on the projects side, `operations_admin` on the services side), open Procurement → MRF Records and confirm an **unassigned AND codeless** cross-department item is **not** listed.

**Result:**
**Notes:**

---

### 9. Full surface sweep

As a scoped `operations_user` **and again** as a `services_user`, visit each surface. **Zero** `permission-denied` and **zero** `The query requires an index` are required. Record every other console error with full text.

| Surface | operations_user | services_user |
|---|---|---|
| `#/projects` | | |
| Assigned project detail | | |
| Its Plan page | | |
| `#/services` | | |
| Assigned service detail | | |
| `#/clients` → client detail | | |
| Procurement → MRF Records | | |
| Procurement → Create MRF | | |
| Dedicated MRF form | | |
| Full Breakdown modal (project detail) | | |
| Start Proposal flow (where reachable) | | |

**Notes:**

---

### 10. Plan-task write authority (the frozen-array trap closed in 113-01)

As a user assigned to a project or service via the **Personnel panel only** (never through the legacy arrays), open the Plan page and **create, rename and delete** a task. All three must succeed.

This is the regression path for the write rules the research audit did not cover.

**Result — create:**
**Result — rename:**
**Result — delete:**
**Notes:**

---

### 11. D-14 residual, knowingly accepted — DENY-SHAPED, record as EXPECTED

Confirm — and record as **EXPECTED, not a bug** — that a scoped user who already knows an unassigned project's document ID can still read its journal subcollections.

Do **not** fix it here. `113-CONTEXT.md` `deferred` books it as its own phase, and `firestore.rules` carries the residual note added in 113-10.

**Result (expect: still readable):**
**Notes:**

---

## Failure protocol

- **Any scoped role denied wholesale on a list surface** → roll back **first**, then plan the gap:
  ```bash
  git checkout a0c4689 -- firestore.rules && firebase deploy --only firestore:rules
  ```
- **Any other failure** → record it, then run `/gsd:plan-phase 113 --gaps`
- Steps 3 and 11 are deny-shaped and must be **exercised, not assumed**. An all-allow checklist proves nothing about enforcement.

---

## Outcome

**Overall:**
**Failing steps:**
**Date completed:**
