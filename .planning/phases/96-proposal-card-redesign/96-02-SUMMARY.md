---
phase: 96-proposal-card-redesign
plan: "02"
subsystem: project-detail
tags: [javascript, proposal-card, progress-track, stat-chips, renderInlineProposalCard]
dependency_graph:
  requires: [96-01]
  provides: [renderInlineProposalCard-redesign]
  affects: [app/views/project-detail.js]
tech_stack:
  added: []
  patterns: [STATUS_META-track-mapping, _buildProposalTrack-helper, Alt-B-stat-chips, conditional-info-rows]
key_files:
  created: []
  modified:
    - app/views/project-detail.js
decisions:
  - "STATUS_META/TRACK_NODES/_PROPOSAL_CHECK_SVG hoisted to module scope — single source of truth for track rendering logic, reusable by Plan 03 (service-detail.js)"
  - "_buildProposalTrack() defined as function declaration directly above renderInlineProposalCard — hoisted, readable, cleanly separated from the card assembly"
  - "Overdue uses current_status_since with created_at fallback per D-04; ageDays computed once and shared for both border and chip"
  - "renderAgeBadge import removed from proposals.js — age chip replaces it; import line now only imports _applyProposalStateTransition"
  - "escapeHTML() applied to all user-supplied strings: title, proposal_id/id, attachment hostname, attachment filename, comms date + description, proposal.id in onclick attrs (T-96-02-01/T-96-02-02 mitigated)"
  - "_renderCardAttachment and _renderCardLatestComms use .proposal-info-row markup and return '' for absent data (D-06 empty state removal)"
metrics:
  duration: "~12 minutes"
  completed: "2026-05-26"
  tasks: 2
  files: 1
---

# Phase 96 Plan 02: Rewrite renderInlineProposalCard() — Progress Track + Alt B Data

`renderInlineProposalCard()` in `app/views/project-detail.js` fully replaced with Spike 009 Concept B + Alt B design. The card now shows a PROPOSAL heading, 4-node progress track (or loss badge), title-first stat-chip data body, conditional info rows, and a footer with conditional Submit + always-present View Proposal.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Hoist STATUS_META, TRACK_NODES, _PROPOSAL_CHECK_SVG constants; replace private helpers | e4bf15b | app/views/project-detail.js |
| 2 | Rewrite renderInlineProposalCard() with track + Alt B data section | bc7a894 | app/views/project-detail.js |

## What Was Built

**Task 1 — Constants and helper replacements:**
- `STATUS_META` — 6-entry object mapping proposal status to `{ trackIdx, warn? }` (draft=0, pending_internal=1, pending_client=2, for_revision=2+warn, client_approved=3, loss=-1)
- `TRACK_NODES` — 4-entry array with `label` fields: Draft / Internal&lt;br&gt;Review / Client&lt;br&gt;Review / Approved
- `_PROPOSAL_CHECK_SVG` — inline SVG polyline checkmark constant for passed nodes
- `_renderCardAttachment` rewritten: returns `''` for falsy `attachment_kind`; uses `.proposal-info-row` markup with 📎 emoji; hostname extracted via URL constructor (T-96-02-02)
- `_renderCardLatestComms` rewritten: returns `''` for empty log; 60-char excerpt (not 80); uses `.proposal-info-row` with 💬 emoji
- `_proposalStageLabel` and `_proposalStatusDotColor` fully removed
- `renderAgeBadge` removed from proposals.js import

**Task 2 — renderInlineProposalCard() rewrite:**
- `_buildProposalTrack(status)` function declaration added directly above renderInlineProposalCard
  - Returns `proposal-loss-badge-wrap/proposal-loss-badge` for loss (trackIdx=-1)
  - Builds 4 `.proposal-track-node` divs with conditional state classes (t-passed/t-active/t-active-warn)
  - Passed nodes include `_PROPOSAL_CHECK_SVG` inside `.t-dot`
  - Wrapped in `proposal-card-track > proposal-track`
- Card structure: `.proposal-inline-card[style=overdueBorder]` → `.proposal-card-heading` PROPOSAL → track → `.proposal-card-body` → `.proposal-card-footer`
- Data body: proposal-card-title (bold, leads) → proposal-card-id (secondary, monospace) → proposal-chip-row (VALUE + STAGE AGE chips) → proposal-info-gap (conditional rows)
- VALUE chip: `PHP {formatCurrency(amount)}` or `—` if null
- STAGE AGE chip: `Math.round(ageDays) + ' days'` or `—`; gets `chip-warn` class and `.proposal-chip-sub` "needs attention" when overdue
- Overdue: `ageDays > 7 && status !== 'client_approved' && status !== 'loss'` → `border-left: 3px solid #f59e0b` on outer wrapper
- Footer: Submit for Approval (canDrive AND status in ['draft','for_revision']); View Proposal always shown
- No "No attachment" or "No comms yet" strings anywhere in the card

## Verification Results

1. `grep -c "proposal-card-heading|proposal-card-track|proposal-track-node" app/views/project-detail.js` → **3** (requirement: 3+) ✓
2. `grep "No attachment|No comms yet" app/views/project-detail.js` → 0 matches ✓
3. `grep "_proposalStageLabel|_proposalStatusDotColor" app/views/project-detail.js` → 0 matches ✓
4. `loadProposalCard` calls `renderInlineProposalCard(proposal, canDrive)` at line 1597 + `syncBottomRow()` at 1598 — unchanged ✓
5. `proposal-inline-card--start` at line 1575 — D-08 CTA card preserved ✓

## Deviations from Plan

None — plan executed exactly as written. The `ageLabel` value is a computed number string (not user-supplied), so no `escapeHTML()` wrapping is needed for that specific interpolation — `Math.round()` output is always a safe integer string.

## Known Stubs

None — all data fields are wired to real Firestore proposal document properties. No hardcoded placeholders.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. Threat mitigations T-96-02-01 and T-96-02-02 confirmed applied (all user-supplied strings through escapeHTML(); attachment URL written to href via escapeHTML).

## Self-Check: PASSED

- `app/views/project-detail.js` modified: confirmed (2 commits, 94 insertions, 62 deletions)
- Commits verified: e4bf15b, bc7a894 — both present in git log
- STATUS_META present at module scope: confirmed at line 1338
- TRACK_NODES present: confirmed at line 1348
- _PROPOSAL_CHECK_SVG present: confirmed at line 1356
- _proposalStageLabel absent: confirmed (grep returns 0 matches)
- _proposalStatusDotColor absent: confirmed (grep returns 0 matches)
- renderAgeBadge removed from import: confirmed (line 12 now only imports _applyProposalStateTransition)
- proposal-card-heading in output: confirmed at line 1441
- proposal-loss-badge in _buildProposalTrack: confirmed at line 1388
- t-passed/t-active/t-active-warn applied conditionally: confirmed in _buildProposalTrack logic
- proposal-info-gap wraps conditional rows: confirmed at line 1462
- proposal-card-footer class (not inline style): confirmed at line 1462
- No "No attachment"/"No comms yet" strings: confirmed (grep returns 0 matches)
- proposal-inline-card--start (D-08) preserved: confirmed at line 1575
- loadProposalCard body unchanged: confirmed (calls renderInlineProposalCard + syncBottomRow as before)
