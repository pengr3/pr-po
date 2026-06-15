---
name: 89-CONTEXT
description: Decisions for Phase 89 — Proposals Tab Approval Queue. Mini-modal approve/reject reusing Phase 87 _applyProposalStateTransition(); row shows title+project+submitter+amount+age; empty state shows message (section stays visible). Mounts inside #proposal-queue-mount already reserved in proposals.js.
type: phase-context
---

# Phase 89: Proposals Tab — Approval Queue — Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 89 populates the **Proposal Approval Queue** section already reserved in `proposals.js` (`#proposal-queue-mount`). It surfaces all proposals with `status === 'pending_internal'`, sorted oldest-first, so Super Admin can approve or reject directly without opening the full proposal detail. All approval logic is delegated to Phase 87's existing `_applyProposalStateTransition()` — no new state-transition code is written.

### In scope (MGMT-03, MGMT-04)
- Render `#proposal-queue-mount` with a list of `pending_internal` proposals, oldest-first
- Each row shows: proposal title, project code/name, submitter name, PHP amount, age-in-stage (e.g. "3 days")
- "Approve" and "Reject" buttons on each row open a **mini-modal** with a comment textarea + confirm/cancel
- Mini-modal wires into Phase 87's `_applyProposalStateTransition()` — no duplicate approval/audit/notification code
- After action: proposal disappears from queue (status changes away from `pending_internal`); next in queue is visible
- Empty state: section stays visible, shows card with "No proposals awaiting approval"

### Out of scope (deferred)
- Any change to Phase 87's proposal detail modal or dashboard (unchanged)
- Any change to Phase 87's approve/reject logic, audit trail, or notification wiring
- Opening the full proposal detail from queue rows (queue is standalone action surface; full detail accessible via Phase 87 dashboard)
- Filtering or sorting controls on the queue (oldest-first is fixed; no filter needed for a focused approval queue)
- Pagination of the queue (expected volume is small; render all `pending_internal` proposals)

</domain>

<decisions>
## Implementation Decisions

### Approve/Reject Action UX (D-01)
Clicking **Approve** or **Reject** on a queue row opens a **mini-modal** containing:
- The proposal title (read-only context)
- A comment `<textarea>` (required — minimum enforcement matches Phase 87 D-05's 10-char guard)
- Confirm and Cancel buttons

The mini-modal calls Phase 87's `_applyProposalStateTransition(proposalId, action, comment)` on confirm. This ensures the same audit entry, project status advancement (D-08 state machine), and NOTIF-10 notification fire exactly as they do from the Phase 87 detail modal. No new approval logic is introduced.

**Why mini-modal over inline expand:** avoids multi-row expanded state complexity; matches the existing modal pattern already present in proposals.js; minimal new CSS.

### Queue Row Content (D-02)
Each row in the queue shows:
- **Proposal title**
- **Project code + project name** (denormalized on the proposal doc per Phase 87 D-02)
- **Submitter name** (derive from `audit_log[0].actor_name` where `action === 'SUBMITTED'`, or store `submitted_by_name` if researcher finds a cleaner path)
- **Amount (PHP)** — use `formatCurrency(proposal.amount)`
- **Age in stage** — compute as `now - proposal.current_status_since` (Phase 87 D-11 `current_status_since` field); display as "Xd" or "X days"
- **Approve / Reject** action buttons

No description excerpt — title + project context is sufficient for action decisions.

### Empty State (D-03)
When no proposals have `status === 'pending_internal'`:
- The `#proposal-queue-mount` section remains **visible**
- Render a card with the message: **"No proposals awaiting approval"**
- Super Admin sees the queue exists and is clear (does not need to wonder if the section is missing)

### Claude's Discretion
- Exact visual treatment of each queue row (table row vs card vs list item — match whichever pattern fits best with the existing proposals.js card layout)
- Age highlight threshold (orange/warning after 7 days — mirrors Phase 87 D-11 dashboard threshold; apply consistently)
- Mini-modal title copy ("Approve Proposal" / "Reject Proposal")
- Whether the mini-modal shows the proposal amount for final confirmation context
- Toast copy after approve/reject from queue

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary code surfaces
- `app/views/proposals.js` — The file Phase 89 modifies. `#proposal-queue-mount` section at line ~169 is the mount target. `_applyProposalStateTransition()` is the approval function to call. `proposalsData` module-level array is populated by the existing Phase 87 `onSnapshot` listener — **do NOT add a second listener**; filter `proposalsData` for `pending_internal` at render time.
- `app/firebase.js` — `db`, `collection`, `onSnapshot`, `writeBatch`, `serverTimestamp` imports (already imported in proposals.js).
- `app/utils.js` — `formatCurrency`, `escapeHTML`, `formatTimestamp` helpers.
- `app/notifications.js` — `createNotification`, `NOTIFICATION_TYPES` (NOTIF-10 is wired inside `_applyProposalStateTransition` already — **do not re-fire from Phase 89**).

### Prior-phase context (MUST read)
- `.planning/phases/87-proposal-lifecycle/87-CONTEXT.md` — D-04 (audit log shape), D-05 (mandatory comment + role gate), D-08 (project status state machine), D-09 (NOTIF-10 fires inside the transition function — Phase 89 must NOT duplicate this), D-10 (Firestore Security Rules on `proposals`).
- `.planning/phases/88-management-tab-shell-create-engagement/88-CONTEXT.md` — D-03 (section ordering locked: New Engagement → Queue → Dashboard), D-06 (Security Rules: `/proposals` route already gated to super_admin at router level).

### Schema
- `proposals` collection — Phase 87 D-02 schema. Key fields for the queue: `proposal_id`, `title`, `project_code`, `amount`, `status`, `current_status_since`, `audit_log` (for submitter name), `created_by`.
- `projects` collection — `status` field receives phase-89-triggered transitions (via `_applyProposalStateTransition` which already handles this — no direct project writes from Phase 89 code).

### Security Rules
- `firestore.rules` — `proposals` block at lines 533-564 (per Phase 87). `update` restricted to `super_admin` + `operations_admin`. Phase 89 introduces no new collections and requires no rule changes.

### CLAUDE.md
- View-module structure (`render` / `init` / `destroy`), window-function pattern for onclick handlers, listener cleanup pattern — Phase 89 adds window functions for queue actions; they must be deleted in `destroy()`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_applyProposalStateTransition(proposalId, action, comment)` in `proposals.js` — handles Firestore writeBatch (proposal + project status + audit_log entry), NOTIF-10 fire-and-forget, and error handling. Phase 89 calls this directly from the mini-modal confirm handler. Do NOT copy this logic.
- `proposalsData` (module-level array, populated by Phase 87's onSnapshot in `init()`) — filter in-place for `status === 'pending_internal'` instead of creating a new listener.
- `formatCurrency()` from `app/utils.js` — for the PHP amount display on each row.
- Existing mini-modal HTML/CSS pattern in `proposals.js` (Phase 87 approve/reject confirmation modals) — reuse the same pattern for the queue mini-modal.

### Established Patterns
- **Window functions on init, deleted in destroy**: all queue action handlers (`window.queueApproveProposal`, `window.queueRejectProposal`, `window.queueConfirmAction`, `window.queueCancelAction`) must follow the existing proposals.js pattern.
- **No second onSnapshot**: Phase 87 already sets up the proposals listener. Phase 89 renders from `proposalsData` — it calls a `renderApprovalQueue()` function at the same time Phase 87 calls `renderProposalDashboard()`.
- **Optimistic re-render**: after `_applyProposalStateTransition` resolves, call `renderApprovalQueue()` to update the queue immediately (the approved item leaves `pending_internal`).

### Integration Points
- `#proposal-queue-mount` (`display:none` by default in Phase 88 render) — Phase 89's `init()` makes it visible and calls `renderApprovalQueue()`.
- Phase 87's `renderProposalDashboard()` — called from the same init flow; the two render functions share `proposalsData` without coupling.
- Phase 87 `init()` already loads `proposalsData` via `onSnapshot` — Phase 89 `init()` must NOT add a second listener.

</code_context>

<specifics>
## Specific Ideas

- **Submitter name source**: `audit_log.find(e => e.action === 'SUBMITTED')?.actor_name` — this is in the proposal doc already fetched. No extra read needed.
- **Age display**: `Math.floor((Date.now() - proposal.current_status_since.toMillis()) / 86400000)` → display as "1 day" / "X days". If < 1 day, show "Today".
- **Age warning**: apply orange/warning styling when age > 7 days (same threshold as Phase 87 D-11 dashboard "needs attention" badge — keeps visual language consistent).
- **Mini-modal ID**: `proposal-queue-action-modal` — distinct from Phase 87's existing modal IDs to avoid collision.

</specifics>

<deferred>
## Deferred Ideas

- **Clicking a queue row to open the full proposal detail** — the queue is a standalone action surface; full proposal detail is accessible via the Phase 87 grouped dashboard below. Not needed in this phase.
- **Filter/sort controls on the queue** — volume of pending-internal proposals is small; oldest-first fixed sort is sufficient. If volume grows, add filtering in a future phase.
- **Bulk approve** — selecting multiple pending proposals and approving in batch. Out of v4.0 scope.
- **Delegation / re-assignment of approval** — routing a proposal to a specific named approver. Out of v4.0 scope (role-based only per Phase 87 D-05).

</deferred>

---

*Phase: 89-proposals-tab-approval-queue*
*Context gathered: 2026-05-11 via /gsd-discuss-phase 89*
*Depends on: Phase 87 (proposal infra + _applyProposalStateTransition), Phase 88 (#proposal-queue-mount section in proposals.js)*
