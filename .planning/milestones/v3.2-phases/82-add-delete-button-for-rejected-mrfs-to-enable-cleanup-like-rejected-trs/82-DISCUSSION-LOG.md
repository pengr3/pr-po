# Phase 82: Add delete button for rejected MRFs to enable cleanup like rejected TRs - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 82-add-delete-button-for-rejected-mrfs-to-enable-cleanup-like-rejected-trs
**Areas discussed:** Delete semantics, Button location & eligibility, Role guard, Cascade & audit trail

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Delete semantics | Hard-delete + cascade + audit trail (existing deleteMRF, heavier) vs single-confirm hard-delete (matches TR pattern, lighter). | ✓ |
| Button location & eligibility | MRF Processing rejected-MRF details panel, MRF Records right-click menu, or both. Plus which 'rejected' statuses qualify. | ✓ |
| Role guard | Procurement only (matches deleteRejectedTR), Admin only, or include requestor self-cleanup in My Requests. | ✓ |
| Cascade & audit trail | Cascade-delete linked PRs/POs/TRs, log to deleted_mrfs collection, etc. | ✓ |

**User's choice:** All four areas selected for discussion.

---

## Delete semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing deleteMRF() — full audit (Recommended) | Keep current behavior at procurement.js:3790 — prompt for deletion reason, cascade-delete linked PRs/POs/TRs, write a row to deleted_mrfs with snapshot of children. The function already exists and works. | |
| Match TR pattern exactly — single confirm, no reason, no audit | Add a lighter deleteRejectedMRF() that does: confirm() → deleteDoc(mrf) → splice cache → toast. No reason prompt, no deleted_mrfs row. Simplest UX, but loses recoverability and audit trail. | ✓ |
| Hybrid — single confirm, no reason prompt, but still cascade + audit | Drop the reason prompt (matches TR's lighter UX) but keep the cascade-delete and deleted_mrfs row (default reason: 'Cleanup of rejected MRF'). | |

**User's choice:** Match TR pattern exactly — single confirm, no reason, no audit.
**Notes:** D-01 in CONTEXT.md. Drives the new function shape — strip reason prompt and deleted_mrfs write from the legacy deleteMRF() pattern.

---

## Button location

| Option | Description | Selected |
|--------|-------------|----------|
| MRF Processing details panel only (Recommended) | When a rejected MRF is selected, render a 'Delete MRF' button in the details panel — same surface as 'Delete TR' on rejected TRs. Mirrors the TR cleanup UX precisely. | ✓ |
| MRF Records right-click menu only | Add a 'Delete MRF' option to the existing context menu (mrf-records.js:1644) when right-clicking a Rejected MRF row. Phase 70 pattern. | |
| Both surfaces | Add the button in MRF Processing details panel AND a 'Delete MRF' option in the MRF Records right-click menu for rejected rows. | |

**User's choice:** MRF Processing details panel only.
**Notes:** D-02. Single surface, mirrors the TR pattern exactly.

---

## Eligibility (which statuses qualify as 'rejected')

| Option | Description | Selected |
|--------|-------------|----------|
| All rejected variants (Recommended) | status === 'Rejected' OR 'PR Rejected' OR 'TR Rejected' OR 'Finance Rejected'. Matches the existing 'Rejected MRFs' grouping in the left panel — every MRF that lands there is deletable. | |
| status === 'Rejected' only (literal) | Only MRFs with the specific 'Rejected' status (the soft-reject result from Phase 62). MRFs with PR/TR/Finance rejection states still show in the left panel but are NOT deletable. | ✓ |

**User's choice:** status === 'Rejected' only (literal).
**Notes:** D-03. Tightens scope — only Phase 62 soft-rejects are deletable. Other rejection variants represent in-flight states that may still be remediated.

---

## Role guard

| Option | Description | Selected |
|--------|-------------|----------|
| Procurement permission gate (Recommended) | Reuse window.canEditTab?.('procurement') === false → toast. Same guard used by deleteRejectedTR, rejectMRF, saveRejectedTRChanges. Procurement and Super Admin pass. | ✓ |
| Super Admin only | Tighter guard — only super_admin role can delete. Procurement can reject MRFs but cannot delete them. Inconsistent with TR cleanup. | |

**User's choice:** Procurement permission gate.
**Notes:** D-04. Reuses the established canEditTab pattern — symmetric with deleteRejectedTR.

---

## Cascade behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Cascade-delete linked PRs/POs/TRs (Recommended) | Mirror the existing deleteMRF() cascade — query prs/pos/transport_requests by mrf_id, deleteDoc each, then delete the MRF. Confirm dialog mentions counts. | ✓ |
| Delete the MRF document only — leave any linked PRs/POs/TRs | Strict TR-pattern match — deleteDoc on the MRF only. Risk: orphaned PRs/POs/TRs pointing at a missing mrf_id. | |
| Refuse delete if MRF has any linked PRs/POs/TRs | Pre-check: block the delete with a toast if any children exist. Forces user to clean those up first. | |

**User's choice:** Cascade-delete linked PRs/POs/TRs.
**Notes:** D-05. Confirm dialog must surface child counts (e.g., "MRF and its 2 PRs and 1 TR will be permanently deleted").

---

## Wrap-up

| Option | Description | Selected |
|--------|-------------|----------|
| I'm ready for context (Recommended) | Write CONTEXT.md and DISCUSSION-LOG.md now. The 5 decisions are enough for the planner. | ✓ |
| Explore more gray areas | Discuss additional concerns: details-panel layout, post-delete UX, button position, etc. | |

**User's choice:** I'm ready for context.

---

## Claude's Discretion

The following were captured under "Claude's Discretion" in CONTEXT.md (downstream agents may decide):
- Exact button label text/icon choice (consistent with existing btn btn-danger).
- Button placement within the rejected-MRF details panel.
- Post-delete UX (reset selection vs auto-select next).
- showLoading wrapper during cascade.
- Synchronous in-memory cache splice vs relying on onSnapshot refresh.
- Whether to fire any timeline / edit-history event (default no, matches legacy deleteMRF).

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section:
- Cleanup for 'PR Rejected' / 'TR Rejected' / 'Finance Rejected' MRFs.
- Soft-delete + recoverability via deleted_mrfs collection.
- Right-click cleanup in MRF Records.
- Requestor self-cleanup in My Requests.
- Removal of legacy deleteMRF() at line 3790 (now fully UI-orphaned).
- Bulk "Clear all rejected MRFs" action.
