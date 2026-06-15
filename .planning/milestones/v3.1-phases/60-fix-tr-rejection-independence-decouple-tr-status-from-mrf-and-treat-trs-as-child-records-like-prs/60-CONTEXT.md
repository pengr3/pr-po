# Phase 60: Fix TR rejection independence — decouple TR status from MRF and treat TRs as child records like PRs - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the cascading TR rejection bug: when Finance rejects a TR that belongs to an MRF, the TR's `finance_status` should update independently — the MRF status must NOT change, PRs already generated must NOT be disturbed, and the rejected TR must appear in Pending Transportation Requests for Procurement to edit and resubmit. TRs should behave exactly like PRs as child records of an MRF.

This phase does NOT cover: generating POs from TRs, changing TR approval outcomes, or modifying standalone TR behavior (standalone TRs already work correctly).

</domain>

<decisions>
## Implementation Decisions

### Current broken behavior (confirmed from screenshot)
- When Finance rejects a TR inside an MRF, the MRF status changes to "TR Rejected" and the entire MRF returns to the Pending MRFs Processing Area as editable
- The rejected TR disappears — it does NOT appear in "Pending Transportation Requests"
- The MRF's "Generate PR & TR" button becomes available again, which is dangerous because PRs for other items in the same MRF may already be generated and sent to Finance
- Root cause: TR rejection is incorrectly cascading up to set the parent MRF status
- Standalone TRs (no parent MRF) already work correctly — they return to Transport Request processing after rejection

### MRF status rules (after fix)
- MRF approval is a one-way door — TR rejection must NEVER change MRF status
- MRF stays "Approved" regardless of what happens to any child TR or PR
- MRF status does not advance to "Completed" when all child records finish — stays "Approved"
- Table display: MRF row shows "Approved"; per-row TR badge already shows "TR Rejected" (Phase 59 added this)
- The fix must also prevent the MRF from becoming re-editable (no "Generate PR & TR" re-trigger)

### TR resubmission path
- Rejected TR (with parent MRF) must appear in "Pending Transportation Requests" with rejection reason visible
- Procurement can edit TR fields before resubmitting (same edit flow as creating a new TR, pre-populated with existing data)
- Resubmission updates the SAME TR record — TR ID is preserved (e.g., TR-2026-001 stays TR-2026-001)
- After resubmission, TR's `finance_status` resets to "Pending" — no new TR document created
- The rejection reason from the prior rejection should be visible to Procurement in the TR view so they know what to fix

### Finance view after TR resubmission
- After Procurement resubmits, the TR reappears in Finance's Transport Requests (Pending Approvals) table as Pending
- Same row/record — no duplicate TR entries
- When Finance opens the TR review modal, it shows the prior rejection reason (e.g., "Previously rejected: [reason]") so Finance can verify the correction was made
- Finance approval is the final step for TRs — no PO is generated from an approved TR (TRs are for transport/hauling coordination only)

### Claude's Discretion
- Exact UI for editing a rejected TR in the Pending Transportation Requests panel (modal vs inline expand)
- Field for storing rejection history on the TR document (e.g., `rejection_reason`, `rejection_history` array)
- Whether to store the rejecting user's name alongside the reason
- Error handling if the TR's parent MRF no longer exists

</decisions>

<specifics>
## Specific Ideas

- Screenshot confirmed: MRF-2026-008 with 2 CIVIL items + 1 HAULING item — TR rejection made the entire MRF return to editable "Pending MRFs" with Generate PR & TR re-exposed
- The fix must mirror exactly how PRs work: PR rejection doesn't change MRF status, rejected PR reappears in Pending Transportation Requests (for PRs: the MRF Processing Area)
- "Treat TRs as child records like PRs" is the guiding principle — PRs and TRs should have identical independence from their parent MRF after generation

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 60-fix-tr-rejection-independence-decouple-tr-status-from-mrf-and-treat-trs-as-child-records-like-prs*
*Context gathered: 2026-03-05*
