---
phase: 78
reviewers: [gemini]
reviewed_at: 2026-04-27T00:00:00Z
plans_reviewed: [78-01-PLAN.md, 78-02-PLAN.md, 78-03-PLAN.md, 78-04-PLAN.md]
skipped: [claude (current runtime — independence rule), codex (not installed)]
---

# Cross-AI Plan Review — Phase 78

> **Reviewers:** Gemini (1 of 1 available external CLIs)
> Claude CLI skipped (current runtime). Codex not installed.

---

## Gemini Review

This review evaluates the implementation strategy for **Phase 78: Allow Creating Projects Without a Client**.

### Summary

The phase design is architecturally sound, successfully transitioning the system from a "Project Code-centric" identity model to a "Firestore Document ID-centric" model while preserving the legacy UX for issued projects. The decision to allow procurement (MRFs/TRs) against clientless projects is a pragmatic response to real-world "site-visit" use cases. The plan for a gated, batched backfill of child records is robust, and the dual-lookup routing strategy ensures that deep links remain stable regardless of the project's issuance state.

### Strengths

- **Stable Identity:** Correctly identifies the Firestore Doc ID as the immutable anchor (`project_id`), decoupling system logic from the mutable `project_code`.
- **Data Integrity:** The gated confirmation modal (Plan 03, Task 3) showing record counts before backfilling is an excellent safety feature that provides transparency to the user.
- **Routing Resilience:** The fallback logic in `project-detail.js` (Plan 03, Task 2) to resolve via Doc ID if a lookup by code fails is a clean solution for deep-link stability.
- **Comprehensive Denormalization:** Plan 02, Edit D ensures `project_id` is propagated down the entire chain (MRF -> PR -> PO -> TR -> RFP), which is critical for the success of the backfill query.

### Concerns

- **[HIGH] Missing Firestore Indexes:** Plan 03 relies on `getDocs` queries across 5 collections filtered by `project_id`. In Firestore, these queries will fail at runtime unless specific indexes are created for each collection (MRFs, PRs, POs, TRs, RFPs) on the `project_id` field.
- **[MEDIUM] Security Rule Bypass:** Plan 01 states "no functional rule change needed." However, D-12 requires that `client_id` and `project_code` be locked once issued. Relying solely on UI-level locking (`showEditControls`) is insufficient; the `firestore.rules` should be updated to prevent `update` operations on these fields if they already contain non-null values.
- **[MEDIUM] Partial Backfill Failure:** While Plan 03 mentions chunk-committing at 500/batch, it doesn't specify an "all-or-nothing" or "retry" strategy. If the browser crashes or connectivity is lost between batch 1 and batch 2, the system will be left in a "partially issued" state where some records have the new `project_code` and others do not.
- **[LOW] Race Conditions in Code Generation:** If two users attempt to issue codes for different projects simultaneously, `generateProjectCode` must ensure it doesn't assign the same incrementing number. This usually requires a transaction or a specialized "counters" collection.
- **[LOW] MRF Form Stale Data:** If an MRF form is open while the project it references is undergoing code issuance, the MRF might be submitted with stale `project_code` data (empty string when it should now have a code).

### Suggestions

- **Index Manifest:** Add an "Index Deployment" step to Wave 1 or Wave 3. Specifically, ensure single-field indexes for `project_id` (and potentially composite indexes if these are filtered further) are deployed via `firestore.indexes.json`.
- **State Flag:** Add a boolean `is_issued: true` to the project document upon successful backfill. This makes it easier to write security rules that enforce the lock:
  ```javascript
  allow update: if !resource.data.is_issued || (request.resource.data.project_code == resource.data.project_code);
  ```
- **Atomic Completion:** In `runCodeIssuance`, the very last write in the final batch should be the `is_issued: true` flag and the `project_code` on the project document itself. This ensures that if the process fails mid-way, the project is not marked as "Issued," allowing the user to re-run the process.
- **UI Feedback for Backfill:** During `runCodeIssuance`, provide a progress bar or "Processing X of Y records" status in the modal to prevent users from refreshing the page during the batched write.
- **Enhanced generateProjectCode:** Ensure the code generation logic queries the latest issued codes from Firestore rather than relying on a local cache to prevent duplicate collisions.

### Risk Assessment: MEDIUM

The logic for handling clientless projects is well-handled, but the **backfill operation** introduces significant data consistency risks. The dependency on new Firestore indexes is a "silent killer" — the code will look correct in development but will throw errors in production if the indexes aren't manually provisioned. If the security rules aren't tightened, the "permanent lock" on project codes remains a suggestion rather than a constraint. If the index and rule gaps are addressed, the risk drops to **LOW**.

---

## Consensus Summary

> Only one external reviewer was available (Gemini). Claude CLI skipped for independence; Codex not installed. The following summarizes Gemini's key findings.

### Top Concerns (Priority Order)

1. **[HIGH] Firestore indexes not covered in the plan.** Queries on `project_id` across 5 collections need single-field indexes deployed before the backfill will work in production. This should be added to Plan 01 or Plan 04's deploy checklist.

2. **[MEDIUM] Security rules don't enforce the post-issuance lock.** D-12's immutability guarantee is UI-only. A malicious or errant direct Firestore write (or future code path) could overwrite `client_id`/`project_code` after issuance. The plan should add a Firestore rule guard on update for the projects collection.

3. **[MEDIUM] No partial-backfill recovery path.** If issuance fails between batches (network drop, browser close), child records end up in mixed states. Consider writing the project doc's `project_code` last (not first) so it serves as the "committed" marker, and adding a UI indicator when a project has an incomplete issuance.

### Agreed Strengths

- Firestore doc ID as stable backbone (`project_id`) is the right design choice — it's immutable and exists immediately on create
- Confirmation modal with per-collection counts is well-designed
- 4-wave plan (Wave 1 foundation → Wave 2 parallel → Wave 3 UAT) is sensible sequencing

### Items to Consider Before Execution

- Add `firestore.indexes.json` entries for `project_id` on mrfs, prs, pos, transport_requests, rfps
- Add Firestore security rule update guard (resource.data.project_code == null) on projects create/update to enforce D-12 at the DB level
- Add defensive handling in `runCodeIssuance` for partial failure: write project doc last, add `issuance_in_progress` flag, or at minimum log which batch failed
