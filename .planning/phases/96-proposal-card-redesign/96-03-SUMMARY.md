---
phase: 96-proposal-card-redesign
plan: "03"
subsystem: service-detail
tags: [javascript, proposal-card, progress-track, stat-chips, renderInlineProposalCard, parity]
dependency_graph:
  requires: [96-01, 96-02]
  provides: [renderInlineProposalCard-service-detail-parity]
  affects: [app/views/service-detail.js]
tech_stack:
  added: []
  patterns: [STATUS_META-track-mapping, _buildProposalTrack-helper, Alt-B-stat-chips, conditional-info-rows]
key_files:
  created: []
  modified:
    - app/views/service-detail.js
decisions:
  - "STATUS_META/TRACK_NODES/_PROPOSAL_CHECK_SVG copied verbatim from project-detail.js — single design per D-10 parity requirement"
  - "_buildProposalTrack() added directly above renderInlineProposalCard — mirrors project-detail.js structure exactly"
  - "renderAgeBadge removed from proposals.js import; age chip replaces it — import line now only imports _applyProposalStateTransition"
  - "Overdue uses current_status_since with created_at fallback per D-04; ageDays computed once and shared for both border and chip"
  - "escapeHTML() applied to all user-supplied strings: title, proposal_id/id, attachment hostname/filename, comms date + description, proposal.id in onclick attrs (T-96-03-01 mitigated)"
  - "_renderCardAttachment and _renderCardLatestComms use .proposal-info-row markup and return '' for absent data (D-06 empty state removal)"
  - "loadProposalCard, confirmProposalInlineSubmit, and CTA card (with 'services' + service_code args) left unchanged — service-specific logic preserved"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-26"
  tasks: 2
  files: 1
---

# Phase 96 Plan 03: Mirror renderInlineProposalCard() to service-detail.js — D-10 Parity

`renderInlineProposalCard()` in `app/views/service-detail.js` fully replaced to match the Spike 009 Concept B + Alt B design shipped in Plan 02 for `project-detail.js`. D-10 parity is achieved: both views now show the same redesigned proposal card.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Hoist STATUS_META, TRACK_NODES, _PROPOSAL_CHECK_SVG constants; replace private helpers | 788d000 | app/views/service-detail.js |
| 2 | Rewrite renderInlineProposalCard() with track + Alt B data section | 982f713 | app/views/service-detail.js |

## What Was Built

**Task 1 — Constants and helper replacements:**
- Removed `renderAgeBadge` from `proposals.js` import (age chip replaces it); import now only imports `_applyProposalStateTransition`
- Added `STATUS_META` — 6-entry object mapping proposal status to `{ trackIdx, warn? }` (draft=0, pending_internal=1, pending_client=2, for_revision=2+warn, client_approved=3, loss=-1)
- Added `TRACK_NODES` — 4-entry array with `label` fields: Draft / Internal&lt;br&gt;Review / Client&lt;br&gt;Review / Approved
- Added `_PROPOSAL_CHECK_SVG` — inline SVG polyline checkmark constant for passed nodes
- Rewrote `_renderCardAttachment`: returns `''` for falsy `attachment_kind`; uses `.proposal-info-row` markup with 📎 emoji; hostname extracted via URL constructor (T-96-03-01)
- Rewrote `_renderCardLatestComms`: returns `''` for empty log; 60-char excerpt; uses `.proposal-info-row` with 💬 emoji
- Removed `_proposalStageLabel` and `_proposalStatusDotColor` functions

**Task 2 — renderInlineProposalCard() rewrite:**
- Added `_buildProposalTrack(status)` function declaration directly above `renderInlineProposalCard`
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
- `loadProposalCard`, `openProposalInlineSubmitModal`, `confirmProposalInlineSubmit`, and the D-08 CTA card (with `'services'` and `service_code` args) are all unchanged

## Verification Results

1. `grep -c "proposal-card-heading|proposal-card-track|proposal-track-node" app/views/service-detail.js` → **3** (requirement: 3+) ✓
2. `grep "_proposalStageLabel|_proposalStatusDotColor" app/views/service-detail.js` → 0 matches ✓
3. `grep "No attachment|No comms yet" app/views/service-detail.js` → 0 matches ✓
4. `loadProposalCard` in service-detail.js calls `loadProposalCard(currentServiceDocId, 'services')` at line 507; `renderInlineProposalCard` defined at line 1154 — unchanged call site ✓
5. CTA card at line 1317 still passes `'services'` and `service_code` to `openCreateProposalModal` — unchanged ✓

## Deviations from Plan

None — plan executed exactly as written. The `ageLabel` value is a computed number string (not user-supplied), so no `escapeHTML()` wrapping is needed for that specific interpolation — `Math.round()` output is always a safe integer string.

## Known Stubs

None — all data fields are wired to real Firestore proposal document properties. No hardcoded placeholders.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. Threat mitigation T-96-03-01 confirmed applied (all user-supplied strings through escapeHTML(); attachment URL written to href via escapeHTML).

## Self-Check: PASSED

- `app/views/service-detail.js` modified: confirmed (2 commits, 92 insertions, 59 deletions)
- Commits verified: 788d000, 982f713 — both present in git log
- STATUS_META present at module scope: confirmed at line 1085
- TRACK_NODES present: confirmed at line 1095
- _PROPOSAL_CHECK_SVG present: confirmed at line 1103
- renderAgeBadge removed from import: confirmed (line 13 now only imports _applyProposalStateTransition)
- _proposalStageLabel absent: confirmed (grep returns 0 matches)
- _proposalStatusDotColor absent: confirmed (grep returns 0 matches)
- proposal-card-heading in output: confirmed at line 1188
- proposal-loss-badge in _buildProposalTrack: confirmed at line 1135
- t-passed/t-active/t-active-warn applied conditionally: confirmed in _buildProposalTrack logic
- proposal-info-gap wraps conditional rows: confirmed at line 1205
- proposal-card-footer class (not inline style): confirmed at line 1209
- No "No attachment"/"No comms yet" strings: confirmed (grep returns 0 matches)
- loadProposalCard uses currentServiceDocId: confirmed (no syncBottomRow call — service-detail has no syncBottomRow, difference preserved per plan)
- D-08 CTA card with 'services' + service_code: confirmed at line 1317
