---
slug: phase96-code-review-fixes
date: 2026-05-26
status: in-progress
---

# Phase 96 Code Review Fixes

Fix 5 findings from the Phase 96 code review (proposal card redesign).

## Tasks

1. **IN-01/UAT** — `client_approved` trackIdx 3→4 in project-detail.js and service-detail.js so all 4 nodes are `t-passed` (filled+check) when proposal is Approved
2. **WR-01** — Wrap `ageLabel` in `escapeHTML()` in both files
3. **WR-02** — Add `.proposal-inline-card__body` CSS rule to components.css
4. **WR-03** — Fix `"1 days"` grammar → `"1 day"` (and `< 1 day` for sub-day) in both files
5. **WR-04** — Align `showEditControls = canEdit !== false` → `canEdit === true` in project-detail.js line 373

## Files

- `app/views/project-detail.js`
- `app/views/service-detail.js`
- `styles/components.css`
