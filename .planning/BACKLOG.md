# Backlog

Items not yet scheduled into a roadmap phase. Add to a future milestone when prioritized.

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
