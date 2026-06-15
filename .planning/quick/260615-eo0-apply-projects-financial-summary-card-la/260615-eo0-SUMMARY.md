---
quick_id: 260615-eo0
description: Apply Projects Financial-Summary card layout to Services for Phase 104 parity
date: 2026-06-15
branch: v3.3
status: complete
commit: f090fe8
files_modified:
  - app/views/service-detail.js
---

# Quick Task 260615-eo0 — Summary

## What changed

Brought the **Services** detail page Financial Summary to visual parity with **Projects**.

`app/views/service-detail.js` previously rendered all 8 financial fields in one flat
`grid-template-columns: repeat(2, 1fr)` grid as plain label/value text. Replaced that block
(was ~869–934) with three grouped, tinted card sections mirroring
`project-detail.js:704–771`:

- **Budget** — blue section label (`#1a73e8`); Budget + Contract Cost inputs (now
  `class="detail-field"`), then **Projected Cost** + **Remaining Budget** as tinted tiles
  (`#f0f7ff`, 5px radius, 0.65rem uppercase label, 0.85rem bold value).
- **Payables** — divider + red label (`#ef4444`); **Paid** + **Remaining Payable** tiles (`#fff5f5`).
- **Collectibles** — divider + green label (`#059669`); **Collected** + **Outstanding** tiles (`#f0fdf4`).

## Preserved (no behavior change)

- `PHP …` small annotations on Budget / Contract Cost labels (restyled to match the tighter
  type ladder: `text-transform:none; letter-spacing:0; color:#94a3b8`).
- Data sources: `currentServiceExpense` (prTotal+poTotal+rfpFeesTotal projected; `.totalPaid`,
  `.remainingPayable`) and `currentServiceCollectibles` (`.totalCollected`, `.remainingCollectible`).
- `onblur="window.saveServiceField(...)"` handlers + `${!showEditControls ? 'disabled' : ''}` gate.
- Value-color logic (rem budget green/red, paid green, rem payable red/green, outstanding red/green).
- Export CSV button, header, DLP finance bar, and Collection Tranches section all untouched.

## Verification

- `node --check app/views/service-detail.js` → PASS
- grep confirmed three section labels (Budget/Payables/Collectibles), all three tint colors
  (`#f0f7ff` / `#fff5f5` / `#f0fdf4`), and service-specific refs (`saveServiceField`,
  `currentServiceExpense`, `currentServiceCollectibles`, `exportServiceExpenseCSV`) retained.
- Presentational only — no schema, rules, or data changes. **Browser spot-check recommended**
  (zero-build SPA): open a service detail page and confirm the Financial Summary now shows the
  grouped tinted card grid identical to a project's.

## Notes

- Executed inline on `v3.3` (no worktree) per this repo's standing constraint — Windows long-path
  breaks agent worktrees. Single-file, fully-scoped change.
- The feat commit was initially bundled with pre-existing staged planning-file edits (leftovers
  from the session-start `stash pop`); split out so `f090fe8` contains only `service-detail.js`.
  Those planning edits remain as uncommitted working-tree changes, untouched.
