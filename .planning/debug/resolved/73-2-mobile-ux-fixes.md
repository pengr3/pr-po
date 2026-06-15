---
status: resolved
trigger: "Investigate and fix 4 mobile UX issues discovered during Phase 73.2 UAT"
created: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:10:00Z
---

## Current Focus

hypothesis: All 4 issues have confirmed root causes; applying CSS/HTML fixes now
test: Read source files to locate exact patterns; applying targeted fixes
expecting: All issues resolved with minimal changes
next_action: Apply fixes to styles/components.css, styles/views.css, app/views/finance.js

## Symptoms

expected:
- Issues 1+2: PR/TR items table renders as stacked label:value cards on mobile; buttons compact
- Issue 3: Scorecard grids retain 2-col/3-col layout on mobile; em-tab-bar not scrollable
- Issue 4: Finance Projects/Services/Recurring tab bar fits at 375px without overflow

actual:
- Issues 1+2: Items table has overflow-x scroll + min-width:500px (PR) / min-width:450px (TR); footer buttons use .modal-footer which at mobile sets width:100% making buttons disproportionately large
- Issue 3: @media (max-width:768px) collapses .em-scorecard-2col and .em-scorecard-3col to grid-template-columns:1fr; .em-tab-bar has overflow-x:auto
- Issue 4: .finance-expense-subtab-bar gets overflow-x:auto at mobile; buttons have fixed padding with white-space:nowrap — "Recurring" clips

errors: Visual only, no console errors
reproduction: Open Finance view at 375px width
started: Phase 73.2 introduced the mobile rules that caused Issues 3/4; Issues 1/2 were pre-existing

## Eliminated

- hypothesis: Issues require JS logic changes
  evidence: All fixes are CSS-only (Issues 3/4) or HTML template changes (Issues 1/2 table markup swap)
  timestamp: 2026-04-15

## Evidence

- timestamp: 2026-04-15
  checked: app/views/finance.js lines 3431-3463 (PR items table)
  found: `<div style="overflow-x: auto; -webkit-overflow-scrolling: touch;"><table class="modal-items-table" style="min-width: 500px;">`
  implication: Table forces horizontal scroll at mobile; needs stacked card replacement at <=768px

- timestamp: 2026-04-15
  checked: app/views/finance.js lines 3581-3612 (TR items table)
  found: `<div style="overflow-x: auto; -webkit-overflow-scrolling: touch;"><table style="width: 100%; min-width: 450px;">`
  implication: Same table scroll pattern as PR; needs same fix

- timestamp: 2026-04-15
  checked: styles/components.css lines 1349-1358 (modal-footer mobile)
  found: `.modal-footer { flex-direction: column-reverse; } .modal-footer .btn { width: 100%; }`
  implication: PR/TR footer uses inline `<div style="display:flex">` NOT .modal-footer class — so the 100% rule does NOT apply. Buttons appear oversized because the inline flex div has no mobile constraints. Fix: add class to the footer div or add CSS for #prModalFooter .btn at mobile.

- timestamp: 2026-04-15
  checked: styles/views.css lines 1866-1871 (em-scorecard media query)
  found: `@media (max-width:768px) { .em-scorecard-2col, .em-scorecard-3col { grid-template-columns: 1fr; } }`
  implication: Remove/comment these rules to restore multi-column grids on mobile

- timestamp: 2026-04-15
  checked: styles/views.css line 1843-1848 (em-tab-bar)
  found: `.em-tab-bar { overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }`
  implication: Remove overflow-x:auto and white-space:nowrap to prevent scrollable tab bar

- timestamp: 2026-04-15
  checked: styles/views.css lines 1663-1671 (finance-expense-subtab-bar mobile)
  found: `overflow-x: auto; -webkit-overflow-scrolling: touch;` + buttons with white-space:nowrap
  implication: Remove overflow-x rule; make buttons flex:1 to fill width evenly

## Resolution

root_cause:
  issue1_2_table: PR and TR modals use overflow-x scroll tables with min-width; no mobile card alternative
  issue1_2_buttons: PR/TR modal footer uses inline div style, not .modal-footer class; no mobile button sizing applied
  issue3_scorecards: Phase 73.2 added @media 768px rule collapsing em-scorecard grids to 1fr
  issue3_tabs: .em-tab-bar has overflow-x:auto + white-space:nowrap causing scrollable tab bar
  issue4: .finance-expense-subtab-bar gets overflow-x:auto on mobile; no flex:1 on buttons

fix: |
  Commit 221a3b9 — styles/views.css:
    - Removed @media 768px block collapsing .em-scorecard-2col/.em-scorecard-3col to 1fr
    - Converted .em-tab-bar from overflow-x:auto to display:flex, flex:1 on .expense-tab
    - Changed .finance-expense-subtab-bar from overflow-x:auto to overflow-x:visible,
      added flex:1 + reduced padding/font-size on buttons
  Commit 1a80eea — styles/components.css + app/views/finance.js:
    - Added .pr-items-table-wrap class to items table div in both PR and TR modals
    - Added parallel .pr-items-cards div with per-item stacked card HTML
    - CSS: display:none / display:flex toggle between table-wrap and cards at 768px
    - CSS: #prModalFooter override to keep buttons inline+compact on mobile
verification: pending human UAT at 375px
files_changed:
  - styles/components.css (modal PR/TR items mobile card styles + button fix)
  - styles/views.css (remove scorecard collapse rules, fix em-tab-bar, fix subtab overflow)
  - app/views/finance.js (add CSS class wrappers to PR/TR items table divs + footer divs)
