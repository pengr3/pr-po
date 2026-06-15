---
slug: k2a-project-detail-ui-polish
description: Fix 4 UI/UX issues in project-detail.js (Spike 008 follow-up)
status: in-progress
created: 2026-05-26
---

# Quick Task: Project Detail UI Polish (Spike 008 Follow-up)

## Goal
Fix 4 identified UI/UX regressions in app/views/project-detail.js introduced by Spike 008.

## Tasks

### T-01: Bottom Row Card Alignment
- Make proposal and plan cards match height in the bottom row grid
- Use flex-column layout on both cards so their footers are pushed to the bottom
- Modify `renderInlineProposalCard()`: add `display:flex;flex-direction:column;height:100%;` to `.proposal-inline-card`, change footer `margin-top` to `margin-top:auto`
- Modify `planCardHtml`: add flex-column to card-body so Open Plan button is at bottom

### T-02: Status Dropdown Prominence
- Add a `getStatusStyle(status)` helper that returns color-coded inline CSS (bg, text, border) per status value
- Wrap the status select in a labeled container (`Status:` label + color-coded pill-shaped select)
- Increase font size and padding on the select to make it visually scannable

### T-03: Financial Card — 3 Semantic Groups
- Restructure the financial card body from [2-col inputs + 3-col 6-tiles] to 3 semantic groups:
  - **Budget** group: Budget input + Projected metric + Rem. Budget metric
  - **Payables** group: Paid metric + Rem. Payable metric (no input; use flex to bottom-align)
  - **Collectibles** group: Contract Cost input + Collected metric + Rem. Collectible metric
- Each group gets a subtle section header label, a background tile, and 2 metric sub-tiles

### T-04: Input Field Styling
- Inject a `<style>` block at top of container HTML (scoped to `#projectDetailContainer`) defining:
  - `.pd-field-input`: proper padding, 1.5px border, 6px radius, focus ring (border-color + box-shadow)
  - `.pd-field-label`: uppercase, weighted, proper spacing
- Add `class="pd-field-input"` to all `<input>` elements in the info and financial cards
- Add `class="pd-field-label"` to all `<label>` elements (replacing inline `style=` label styling)

## File
- `app/views/project-detail.js` — all changes inline, no new files

## Constraints
- No functional changes — all saves, listeners, validations untouched
- No new JS variables or functions beyond `getStatusStyle()`
- All styling changes are additive (CSS class + `<style>` block)
- Preserve all `data-field`, `onclick`, `onblur`, `onchange` attributes exactly
