# Phase 89: Proposals Tab — Approval Queue - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-11
**Phase:** 89-proposals-tab-approval-queue
**Areas discussed:** Approve/reject UX, Queue row content, Empty state

---

## Approve/Reject UX

| Option | Description | Selected |
|--------|-------------|----------|
| Mini-modal (comment only) | Clicking Approve or Reject opens a small modal with just a comment textarea + confirm/cancel. Reuses Phase 87 modal pattern — minimal new code. | ✓ |
| Inline expand on row | Clicking Approve or Reject expands the row to reveal a comment textarea + buttons. No new modal — but managing multiple expanded rows at once gets complex. | |
| Open full detail modal | Queue rows are clickable — clicking opens the full Phase 87 proposal detail modal where Super Admin uses the existing approve/reject buttons. Queue is a shortcut list, not a standalone action surface. | |

**User's choice:** Mini-modal (comment only)
**Notes:** Minimizes new UI code; familiar pattern already established in Phase 87.

---

## Queue Row Content

| Option | Description | Selected |
|--------|-------------|----------|
| Title + project + submitter + amount + age | Proposal title, project code/name, who submitted it, PHP amount, and how long it's been waiting. Enough to act. | ✓ |
| Add description excerpt | Same as above plus a truncated description (first ~80 chars). Useful if titles alone are ambiguous. | |
| Minimal: title + age only | Just the proposal title and age-in-queue. Fastest to scan but may require opening detail to verify amount/project. | |

**User's choice:** Title + project + submitter + amount + age
**Notes:** Full action context without needing to open detail modal.

---

## Empty State

| Option | Description | Selected |
|--------|-------------|----------|
| Show empty-state message | Section stays visible with a card showing 'No proposals awaiting approval' — Super Admin knows the queue exists and is clear. | ✓ |
| Hide section entirely | Section collapses to display:none when queue is empty. Cleaner page when nothing to act on. | |

**User's choice:** Show empty-state message
**Notes:** Visibility confirms the feature is working, not missing.

---

## Claude's Discretion

- Visual treatment of queue rows (table vs card vs list item)
- Age warning threshold (7 days, matching Phase 87 D-11 dashboard convention)
- Mini-modal title copy ("Approve Proposal" / "Reject Proposal")
- Whether mini-modal echoes the amount for confirmation context
- Toast copy after approve/reject from queue

## Deferred Ideas

- Clicking a queue row to open the full proposal detail — not needed; full detail accessible via Phase 87 dashboard below
- Filter/sort controls on the queue — oldest-first fixed sort sufficient for expected volume
- Bulk approve — out of v4.0 scope
- Delegation / re-assignment of approval to specific named approvers — out of v4.0 scope (role-based per Phase 87 D-05)
