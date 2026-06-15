---
name: 82-CONTEXT
description: Decisions for Phase 82 — add a Delete MRF button to rejected-MRF details in MRF Processing, mirroring the existing Delete TR cleanup pattern. Lighter than existing deleteMRF() (no reason prompt, no audit row), but still cascades to linked PRs/POs/TRs.
type: phase-context
---

# Phase 82: Add delete button for rejected MRFs to enable cleanup like rejected TRs - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a "Delete MRF" cleanup button to the rejected-MRF details view in **MRF Processing**, scoped to MRFs with `status === 'Rejected'` (the Phase 62 soft-reject result). The button mirrors the existing **"Delete TR"** button on rejected TRs at `app/views/procurement.js:2742` and uses the same lightweight UX: single `confirm()` → permanent delete → toast.

Reuses `deleteMRF()`'s cascade logic (PR/PO/TR cleanup by `mrf_id`) but **drops** the reason prompt and the `deleted_mrfs` audit-row write — both of those exist on the legacy `deleteMRF()` at line 3790 but are not desired for routine cleanup of soft-rejected MRFs.

**In scope:**
- Render a "Delete MRF" button in the MRF Processing details panel when the selected MRF has `status === 'Rejected'`.
- New `deleteRejectedMRF()` function: permission check → child counts → single confirm with counts → cascade `deleteDoc` over `prs` + `pos` + `transport_requests` matching `mrf_id` → `deleteDoc` MRF → reset selection → toast.
- Window-function registration + `destroy()` cleanup, following the existing pattern at `procurement.js:1548` / `2116`.

**Out of scope:**
- MRFs with statuses `'PR Rejected'`, `'TR Rejected'`, `'Finance Rejected'` — those still appear in the rejected-MRFs left panel but are NOT deletable in this phase.
- MRF Records right-click menu integration (cleanup confined to MRF Processing).
- My Requests requestor-side deletion.
- Soft-delete / undo / `deleted_mrfs` audit write.
- Role-based access changes — Procurement permission gate is reused from `canEditTab('procurement')`.
- Modifying or removing the legacy `deleteMRF()` function (line 3790) — it stays untouched.

</domain>

<decisions>
## Implementation Decisions

### D-01 — Delete semantics: match TR pattern (lightweight)
- New function `deleteRejectedMRF()` performs a single `confirm()` then permanent `deleteDoc`.
- **No reason prompt.**
- **No row written to `deleted_mrfs` collection.**
- The dialog text MUST mention the cascade counts so the user knows what they're agreeing to (e.g., `"Delete rejected MRF MRF-2026-014?\n\nThis will permanently delete the MRF and 2 linked PR(s), 1 PO(s), 1 TR(s). This cannot be undone."`).
- Mirrors `deleteRejectedTR()` at `procurement.js:2881-2892`. Distinct from the legacy `deleteMRF()` at line 3790 — that function stays in place untouched and is no longer wired to any UI.

### D-02 — Location: MRF Processing details panel only
- Button rendered inside the rejected-MRF details panel (the same surface that currently shows the "Delete TR" button on rejected TRs).
- **NOT** added to the MRF Records right-click context menu (`mrf-records.js:1644`).
- **NOT** added to the My Requests context menu (`mrf-form.js:937`).
- Single discoverable location. Mirrors TR cleanup UX precisely.

### D-03 — Eligibility: literal `status === 'Rejected'` only
- Show button **only** when `currentMRF.status === 'Rejected'`.
- MRFs with statuses `'PR Rejected'`, `'TR Rejected'`, or `'Finance Rejected'` — which DO appear in the "Rejected MRFs" left-panel grouping at `procurement.js:2480-2519` — are NOT deletable in Phase 82.
- Rationale: `'Rejected'` is the soft-reject terminal state from Phase 62; the other rejected variants represent in-flight states that may still be remediated.

### D-04 — Role guard: Procurement permission gate
- Use the existing pattern: `if (window.canEditTab?.('procurement') === false) { showToast('You do not have permission to edit procurement data', 'error'); return; }`
- Same guard used by `deleteRejectedTR()`, `rejectMRF()`, and `saveRejectedTRChanges()`.
- `super_admin` and `procurement` roles pass; everyone else is blocked.

### D-05 — Cascade: delete linked PRs/POs/TRs in same operation
- Before the confirm, query and count:
  - `prs` where `mrf_id == currentMRF.mrf_id`
  - `pos` where `mrf_id == currentMRF.mrf_id`
  - `transport_requests` where `mrf_id == currentMRF.mrf_id`
- Surface those counts inside the single confirm dialog (see D-01).
- On confirm: `deleteDoc` each child, then `deleteDoc` the MRF.
- Order: children first, then MRF, so a partial failure leaves the MRF in place (so the user can retry rather than ending up with an orphaned mid-state).
- Mirror the cascade structure already in `deleteMRF()` at lines 3925-3966 — but skip the `deletedMrfData` accumulator and the `addDoc(deletedMrfsRef, ...)` write.

### Claude's Discretion
- Exact button label and styling: keep it consistent with the existing `btn btn-danger` "Delete TR" button (`procurement.js:2742`) — Claude may choose between "Delete MRF" / "🗑️ Delete MRF" / "✕ Delete MRF" to match visual hierarchy with neighbouring buttons in the rejected-MRF panel.
- Button placement within the rejected-MRF details panel: alongside any existing action buttons that render for rejected MRFs (or at the bottom of the details body — Claude picks the layout that looks consistent with the rejected-TR panel).
- Post-delete UX: after success, reset `currentMRF = null` and re-render the placeholder ("Select an MRF…"). No requirement to auto-select the next rejected MRF.
- Whether to add `cursor: progress` or `disabled` state on the button during the cascade — Claude may add a `showLoading(true/false)` wrapper if the cascade takes noticeable time.
- Whether to also remove the deleted MRF from any in-memory caches (`materialMRFs`, `transportMRFs`, `cachedRejectedTRs`-equivalent) — the existing `onSnapshot` listener will refresh, but a synchronous splice + re-render gives a snappier feel. Match whatever pattern the surrounding code uses for deletes.
- Whether to fire any timeline / edit-history event on cascade — the legacy `deleteMRF()` does NOT, so default to "no" unless an obvious fit exists.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Reference implementation (the pattern to mirror)
- `app/views/procurement.js:2881-2892` — `deleteRejectedTR()`: the exact lightweight pattern this phase reproduces for MRFs (confirm → deleteDoc → cache splice → toast).
- `app/views/procurement.js:2742` — the "Delete TR" button render site inside the rejected-TR details panel.
- `app/views/procurement.js:1615`, `2159` — window-function registration + `destroy()` cleanup for `deleteRejectedTR`. Replicate for `deleteRejectedMRF`.

### Reference implementation (cascade structure to copy, audit/reason to skip)
- `app/views/procurement.js:3790-3993` — legacy `deleteMRF()`: source of cascade logic over `prs` + `pos` + `transport_requests`. Copy the query+delete loops (lines 3805-3815 for queries; 3925-3957 for the deletes), but do NOT copy the reason-prompt block (3881-3909), the `deletedMrfData` accumulator (3915-3923), or the `addDoc(deletedMrfsRef, ...)` write (3960-3962).

### Reject-MRF context (Phase 62)
- `app/views/procurement.js:3996+` — `rejectMRF()`: defines the soft-reject terminal state `status: 'Rejected'` that Phase 82 keys its eligibility off.
- `.planning/phases/62-sort-project-service-dropdown-alphabetically-reject-mrf-instead-of-delete-tr-details-modal-and-fix-finance-project-list-error/62-02-PLAN.md` — original rationale for replacing hard-delete with soft-reject; Phase 82 re-introduces the cleanup path that Phase 62 removed.

### Rejected MRF UI (where the button lives)
- `app/views/procurement.js:2480-2519` — "Rejected MRFs" left-panel grouping that surfaces deletable MRFs. Confirms the visible context where a user encounters the button.
- `app/views/procurement.js:1436` and `1749` — historical sites of the "Delete MRF" button replaced by Phase 62. Phase 82 does NOT restore at these sites; the new button goes in the rejected-MRF details panel only.

### Permission gate (D-04)
- `app/views/procurement.js:2756-2759` (in `saveRejectedTRChanges`) — exact code shape of the `canEditTab` guard to copy.

### Project-level
- `CLAUDE.md` — Window Functions for Event Handlers section (window.fn pattern + destroy cleanup), Firebase Listener Management section (cache + onSnapshot interplay), Status Matching (case-sensitive — `'Rejected'` not `'rejected'`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `deleteRejectedTR()` (`procurement.js:2881-2892`) — direct template for `deleteRejectedMRF()` shape and confirm style.
- Cascade query+delete blocks inside legacy `deleteMRF()` (`procurement.js:3805-3815`, `3925-3957`) — copy without the `deletedMrfData` accumulator and without the `addDoc(deletedMrfsRef, ...)` line.
- `canEditTab` permission helper (already on `window`) — used identically across `deleteRejectedTR`, `rejectMRF`, `saveRejectedTRChanges`.
- `showLoading()`, `showToast()`, `confirm()` — already imported / globally available in `procurement.js`.

### Established Patterns
- **Window-function registration**: every event-handler function attached via `window.fnName = fnName;` in `attachWindowFunctions()` (line ~1500-1620), with matching `delete window.fnName;` in `destroy()` (line ~2080-2160). Phase 82 must add both for `deleteRejectedMRF`.
- **Status matching is case-sensitive** (`CLAUDE.md` SPA Patterns): the eligibility gate compares `currentMRF.status === 'Rejected'`, never `'rejected'`.
- **Cascade-by-mrf_id**: child collections (`prs`, `pos`, `transport_requests`) are queried by string `mrf_id` (the human-readable ID like `MRF-2026-014`), not Firestore doc IDs.
- **Single-confirm + toast lifecycle**: matches Phase 62's lighter touch — no modals for routine destructive cleanup, just `confirm()` + `showToast()`.
- **Real-time refresh after mutation**: `onSnapshot` listeners on `mrfs` / `prs` / `pos` / `transport_requests` will auto-refresh the lists; no manual reload needed.

### Integration Points
- Render site: rejected-MRF details panel inside `renderMRFDetails()` / `updateActionButtons()` (`procurement.js:1436` / `1749` historical button area, but for Phase 82 use the rejected-MRF branch within the details panel — wherever a `currentMRF.status === 'Rejected'` MRF currently lands).
- Imports already present in `procurement.js`: `deleteDoc`, `getDocs`, `query`, `collection`, `where`, `doc`, `db`. No new imports needed.
- Window registration: `attachWindowFunctions()` block + `destroy()` block. Phase 82 must edit both.
- The function lives in `app/views/procurement.js` only — no other view files are modified.

</code_context>

<specifics>
## Specific Ideas

- The existing TR pattern is the **canonical reference** — the user explicitly chose to match it (D-01). When in doubt, look at `deleteRejectedTR()` and replicate its shape.
- The confirm dialog text must include the child counts (D-05). Suggested format: `"Delete rejected MRF ${mrf_id}?\n\nThis will permanently delete the MRF and ${prCount} linked PR(s), ${poCount} PO(s), ${trCount} TR(s). This cannot be undone."` — feel free to adjust phrasing.
- The legacy `deleteMRF()` at line 3790 is **not removed** in this phase. It remains as dead-but-correct code. A future cleanup phase may dedupe it.

</specifics>

<deferred>
## Deferred Ideas

- **Cleanup for `'PR Rejected'` / `'TR Rejected'` / `'Finance Rejected'` MRFs.** They appear in the same red-banded left-panel section but are NOT eligible for Phase 82 deletion. If user-driven cleanup of those is needed later, it would be a separate phase that decides whether to soft-reject them first or extend the eligibility gate.
- **Soft-delete + recoverability.** User explicitly chose to skip the `deleted_mrfs` audit-row write. If audit/recovery becomes a requirement later, re-introduce the `addDoc(deletedMrfsRef, ...)` block from legacy `deleteMRF()` lines 3914-3962.
- **Right-click cleanup in MRF Records.** Discussed and dropped — would put cleanup on a different surface from the TR pattern. Re-open if procurement asks for cleanup access from the records view.
- **Requestor self-cleanup in My Requests.** Currently the My Requests context menu (`mrf-form.js:937`) shows "No actions available" for non-actionable statuses. Adding a delete action there would let requestors clean up their own rejected requests but expands role scope and is out of phase.
- **Removal of legacy `deleteMRF()`.** Now fully unused by the UI. Could be deleted in a future cleanup phase along with its window registration.
- **Bulk delete / "Clear all rejected MRFs" action.** Not requested.

</deferred>

---

*Phase: 82-add-delete-button-for-rejected-mrfs-to-enable-cleanup-like-rejected-trs*
*Context gathered: 2026-04-28*
