# Backlog

Items not yet scheduled into a roadmap phase. Add to a future milestone when prioritized.

---

## Cross-Department Services Access for Assigned `operations_user`

**Added:** 2026-08-12
**Found during:** Phase 113 plan 113-11 production UAT — an `operations_user` assigned to a service could not reach it.

**Context:** Cross-department assigned access is half-built. The Firestore rules were extended for it (quick 260627-kg0 gave an assigned `operations_user` "exactly the native `services_user` authority"), but the client permission layer was never extended to match.

Current state for an `operations_user` who **is** in a service's `personnel_user_ids`:

| Layer | State | Source |
|---|---|---|
| `services` `allow list` | ✅ permitted | `firestore.rules` — `(isRole('operations_user') && request.auth.uid in resource.data.personnel_user_ids)` |
| `services` `allow update` | ✅ permitted | quick 260627-kg0 |
| `services` `allow get` | ❌ **denied** — role list omits `operations_user` | `firestore.rules` services `allow get` |
| Services nav tab | ❌ hidden | `role_templates` → `tabs.services.access: false` (`scripts/seed-services-role-permissions.js:49`) |

**Not a Phase 113 regression.** Verified: `services` `allow get` is byte-identical at `a0c4689` (pre-tightening) and `f205889`. The nav gate is a role-template permission read at `app/auth.js:454`, untouched by the rules deploy. The tab has been deliberately hidden since v2.3 department isolation — `seed-services-role-permissions.js:106` names it as expected behaviour.

**Goal:** Let an `operations_user` assigned to a service actually reach that service, without weakening department isolation for unassigned ones.

**Why both changes are required — do not ship the permission flip alone.** Flipping `tabs.services.access` on its own produces a *worse* experience than today: the scoped `array-contains` list query would return assigned services, and every attempt to open one would hit `permission-denied` from the unchanged `allow get`.

**Proposed change:**
1. `firestore.rules` — extend `services` `allow get` with a personnel-scoped branch for `operations_user`, mirroring the shape already used by `allow list`
2. `role_templates` — set `tabs.services.access: true` for `operations_user` (keep `tabs.services.edit: false`; writes stay governed by the rules)
3. Confirm `services.js`'s scoped listener already handles this role — `113-CONTEXT.md` cites `app/views/services.js:876-903` as the reference implementation that "already ships the target `array-contains` pattern for `operations_user`"
4. Consider the `operations_admin` ↔ `services` mirror (quick 260706-mco) for the same treatment

**Acceptance criteria (future phase):**
- An `operations_user` in a service's `personnel_user_ids` sees the Services tab, sees only assigned services on `#/services`, and can open their detail pages
- An `operations_user` with no service assignments sees no services — and ideally no empty tab
- An unassigned service remains unreachable by direct URL in both `service_code` and doc-ID forms
- Department isolation for every other surface is unchanged
- Emulator coverage for the new `allow get` branch, including the deny case

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
