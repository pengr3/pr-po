---
phase: 96-proposal-card-redesign
plan: "01"
subsystem: styles
tags: [css, proposal-card, progress-track, stat-chips]
dependency_graph:
  requires: []
  provides: [proposal-card-css-classes]
  affects: [styles/components.css]
tech_stack:
  added: []
  patterns: [proposal-namespace-css, BEM-variant]
key_files:
  created: []
  modified:
    - styles/components.css
decisions:
  - ".proposal-inline-card loses padding: 1rem — section-level padding (12px 14px in body, 10px 14px in heading) takes over"
  - "overflow: hidden added to .proposal-inline-card to clean border-radius clipping with section backgrounds"
  - ".proposal-inline-card__header and .proposal-inline-card__label removed — replaced by track structure; .proposal-inline-card--start preserved for D-08 CTA card"
  - "connector line z-index:0 vs node z-index:1 keeps line behind dots without needing wrapper stacking context"
  - ".proposal-card-footer uses background: #f8fafc (bg-subtle) matching spike .card-footer pattern"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-26"
  tasks: 3
  files: 1
---

# Phase 96 Plan 01: CSS Classes for Proposal Card Redesign Summary

All 12+ new CSS rules required by the Phase 96 proposal card redesign appended to `styles/components.css` under the `.proposal-` namespace. Plans 02 and 03 (JS rewrites) can now reference every class name with confidence.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rework .proposal-inline-card base + add card heading | afb94c1 | styles/components.css |
| 2 | Add progress track CSS classes | a28769c | styles/components.css |
| 3 | Add stat chip and info row CSS classes | 1a1df58 | styles/components.css |

## What Was Built

- **`.proposal-card-heading`** — PROPOSAL uppercase section header with `border-bottom: 1px solid #e2e8f0`, matching the PROJECT PLAN card style
- **`.proposal-card-track` / `.proposal-track`** — track wrapper with `border-bottom` separator and flex row container
- **`.proposal-track-node`** — flex column, `flex: 1`, 4 state variants via `.t-passed`, `.t-active`, `.t-active-warn` modifier classes
- **`.t-dot`** — 18px circle dot; passed = blue filled; active = blue ring glow `rgba(26,115,232,0.18)`; active-warn = orange ring `rgba(249,115,22,0.18)` (20px)
- **`.t-label`** — 0.6375rem label; color/weight changes per node state
- **connector line via `::after`** — 2px horizontal line, grey default, blue for `.t-passed` nodes
- **`.proposal-check-icon`** — 9px SVG sizing for passed node checkmarks
- **`.proposal-loss-badge-wrap` / `.proposal-loss-badge`** — red-bordered inline badge for loss state (`background: #fef2f2; color: #991b1b`)
- **`.proposal-card-body`** — `padding: 12px 14px` data section
- **`.proposal-card-title` / `.proposal-card-id`** — title-first Alt B layout hierarchy
- **`.proposal-chip-row`** — `display: flex; gap: 8px` for side-by-side chips
- **`.proposal-stat-chip`** — `flex: 1; background: #f8fafc` base chip
- **`.proposal-stat-chip.chip-warn`** — amber variant `background: #fffbeb; border-color: #fde68a`
- **`.proposal-chip-label` / `.proposal-chip-val` / `.proposal-chip-sub`** — chip internals with chip-warn color overrides (`color: #92400e`)
- **`.proposal-info-gap` / `.proposal-info-row` / `.proposal-info-link`** — attachment and comms info rows
- **`.proposal-card-footer`** — `border-top: 1px solid #e2e8f0; background: #f8fafc` footer

## Verification Results

- `grep -c "proposal-card-heading|proposal-track-node|proposal-stat-chip|proposal-card-footer" styles/components.css` → **20** (requirement: 15+)
- `grep "padding: 1rem" styles/components.css` — does NOT match `.proposal-inline-card {` block
- `.proposal-inline-card--start` present and unchanged at line 2232

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — CSS-only plan, no data flows involved.

## Threat Flags

None — CSS-only plan, no network endpoints, auth paths, or schema changes.

## Self-Check: PASSED

- `styles/components.css` modified: confirmed (3 commits, 207 lines added, 12 deleted)
- Commits verified: afb94c1, a28769c, 1a1df58 — all present in git log
- `.proposal-inline-card--start` preserved: confirmed at line 2232
- `.proposal-card-heading` exists with `padding: 10px 14px` and `border-bottom`: confirmed
- `.proposal-track-node.t-passed .t-dot` has `background: #1a73e8`: confirmed
- `.proposal-track-node.t-active .t-dot` has `box-shadow: 0 0 0 3px rgba(26,115,232,0.18)`: confirmed
- `.proposal-track-node.t-active-warn .t-dot` has `box-shadow: 0 0 0 3px rgba(249,115,22,0.18)`: confirmed
- `.proposal-loss-badge` has `background: #fef2f2; color: #991b1b`: confirmed
- `.proposal-stat-chip` exists with `background: #f8fafc`: confirmed
- `.proposal-stat-chip.chip-warn` exists with `background: #fffbeb; border-color: #fde68a`: confirmed
- `.proposal-stat-chip.chip-warn .proposal-chip-val` has `color: #92400e`: confirmed
- `.proposal-card-footer` exists with `border-top: 1px solid #e2e8f0`: confirmed
- `.proposal-info-link` exists with `color: #1a73e8`: confirmed
