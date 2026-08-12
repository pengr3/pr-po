# Backlog

Items not yet scheduled into a roadmap phase. Add to a future milestone when prioritized.

---

## Cross-Department Access Gaps + Inert Role-Template Seeding

**Added:** 2026-08-12
**Found during:** Phase 113 plan 113-11 production UAT.
**Not a Phase 113 regression** — every item below is verified pre-existing. See "Evidence" per item.

Two related problems, both in the **client permission layer**, not the rules. The Firestore rules were extended for assignment-driven cross-department access (quick 260627-kg0 gave an assigned `operations_user` "exactly the native `services_user` authority"); the permission layer was never brought into line.

---

### Problem 1 — `operations_user` cannot reach an assigned service

State for an `operations_user` who **is** in a service's `personnel_user_ids`:

| Layer | State | Source |
|---|---|---|
| `services` `allow list` | ✅ permitted | `firestore.rules` — `(isRole('operations_user') && request.auth.uid in resource.data.personnel_user_ids)` |
| `services` `allow update` | ✅ permitted | quick 260627-kg0 |
| `services` `allow get` | ❌ **denied** — role list omits `operations_user` | `firestore.rules` services `allow get` |
| Services tab / route | ❌ blocked | `permissions.tabs.services.access: false` → `app/router.js:288` Access Denied |

**Evidence it predates Phase 113:** `services` `allow get` is byte-identical at `a0c4689` (pre-tightening) and `f205889`. The permission gate is read at `app/auth.js:454` / `app/router.js:288` from `role_templates`, untouched by the rules deploy.

**Why both changes are required — do not ship the permission flip alone.** Flipping access on its own produces a *worse* experience than today: the scoped `array-contains` list query would return assigned services, and every attempt to open one would hit `permission-denied` from the unchanged `allow get`.

**Proposed change:**
1. `firestore.rules` — extend `services` `allow get` with a personnel-scoped branch for `operations_user`, mirroring the shape already used by `allow list`
2. `role_templates/operations_user` — set `permissions.tabs.services.access: true` (leave `edit` alone; writes stay governed by the rules)
3. Confirm `app/views/services.js:876-903` already handles this role — `113-CONTEXT.md` cites it as the reference implementation that "already ships the target `array-contains` pattern for `operations_user`"
4. Consider the `operations_admin` ↔ `services` mirror (quick 260706-mco) for the same treatment

**Note on direction symmetry:** the mirror case is *not* broken. `services_user` and `services_admin` both have `permissions.tabs.projects.access: true` in production, and the tightened `projects` `allow get`/`allow list` both carry a personnel-scoped branch for them. Only the `→ services` direction has the gap.

---

### Problem 2 — `seed-services-role-permissions.js` writes to a path nothing reads

`app/permissions.js:97` sets `currentPermissions = roleData.permissions`, so the operative map is **`permissions.tabs.*`**.

`scripts/seed-services-role-permissions.js` writes dotted paths of the form `'tabs.services.access'` — i.e. a **top-level `tabs` map**, not `permissions.tabs`. **Every write that script makes is therefore inert.** It has instead created a stray shadow structure on the role-template documents that no code path consults.

Observed in production (`role_templates/services_user`):

| Field | Value | Read by app? |
|---|---|---|
| `permissions.tabs.projects.access` | `true` | ✅ **yes** — this is what governs |
| `tabs.projects.access` (stray) | `false` | ❌ no |

The two directly contradict each other, which makes the documents actively misleading to anyone inspecting them — this cost real debugging time during the 113-11 UAT.

**Why the intended behaviour still happens anyway:** `operations_user.permissions.tabs.services.access` *is* `false`, but it was set by some other path (likely the original `seed-roles.js` or a manual edit), not by this script. The script's apparent success is a coincidence.

**Corroborating smell:** `operations_user.permissions.tabs.services` reads `{access: false, edit: true}` — an incoherent pair (no access, but editable) suggesting piecemeal manual edits.

**Proposed change:**
1. Fix the field paths in `scripts/seed-services-role-permissions.js` to `permissions.tabs.*`
2. Delete the stray top-level `tabs` map from every affected `role_templates` document
3. Audit all role templates for incoherent `{access: false, edit: true}` pairs and normalise
4. Re-run the corrected script and diff the before/after to confirm intended state

---

**Acceptance criteria (future phase):**
- An `operations_user` in a service's `personnel_user_ids` sees the Services tab, sees only assigned services on `#/services`, and can open their detail pages
- An `operations_user` with no service assignments sees no services — and ideally no empty tab
- An unassigned service remains unreachable by direct URL in both `service_code` and doc-ID forms
- Department isolation for every other surface is unchanged
- Emulator coverage for the new `allow get` branch, including the deny case
- No `role_templates` document carries a stray top-level `tabs` map
- `seed-services-role-permissions.js` is verified to actually change behaviour when run

---

## Recall Process with Finance Approval

**Added:** 2026-03-27
**Context:** Phase 70 implements a "Force Recall MRF" path that lets Procurement void POs at Pending Procurement status and restore an MRF without Finance involvement. This is intentionally simplified.

**Goal:** Improve the MRF recall process so that recalling a PR-Generated MRF — especially when Finance has already approved PRs and POs exist — requires Finance approval before PRs/POs are voided and the MRF is restored to processing.

**Proposed flow:**
1. Procurement right-clicks MRF → "Request Recall" (instead of force-voiding directly)
2. A recall request is submitted (new `recall_requests` collection or a status flag on the MRF, e.g. `status: 'Recall Requested'`)
3. Finance sees the recall request in their Pending Approvals tab, with reason and linked PO/PR info
4. Finance approves → system voids POs, deletes PRs, restores MRF to In Progress automatically
5. Finance rejects → MRF stays as PR Generated, Procurement is notified

**Why deferred:** Phase 70 delivers immediate unblocking capability. The Finance approval loop adds a workflow layer that should be designed alongside the broader Finance approval UI (Pending Approvals tab), not in isolation.

**Acceptance criteria (future phase):**
- Procurement can submit a recall request with a reason
- Finance sees recall requests in Pending Approvals with full context (MRF ID, linked PRs, linked POs, amounts)
- Finance approval triggers automated PO voiding + PR deletion + MRF restoration
- Finance rejection notifies Procurement and leaves MRF unchanged
- Recall requests are audit-logged (who requested, who approved/rejected, timestamps)

---
