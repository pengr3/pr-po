---
phase: 85-collectibles-tracking
plan: 08
subsystem: collectibles
tags: [expense-modal, financial-breakdown, collectibles-tab, projects, services, tab-switcher, payment-history, ui]

# Dependency graph
requires:
  - phase: 85-collectibles-tracking
    plan: 01
    provides: "collectibles security rules in tree (read = isActiveUser); without these the new getDocs(collection(db, 'collectibles')) would be denied"
provides:
  - "app/expense-modal.js — 4th 'Collectibles' tab on Financial Breakdown modal (project + service modes)"
  - "window._toggleEMCollHistory — public-on-window helper for the per-row history sub-row toggle"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline status-derivation helper (Phase 71 anti-circular-import pattern) — duplicate the logic instead of importing finance.js"
    - "Tab parity extension — add 4th tab to existing 3-tab switcher without restructuring the switcher's positional flow"
    - "Expandable sub-row pattern — table row + hidden sibling row keyed by deterministic DOM id (em-coll-history-${id})"

key-files:
  created: []
  modified:
    - "app/expense-modal.js (+156 lines / -1 line)"

key-decisions:
  - "D-07 implementation: 4th Collectibles tab placed on the existing showExpenseBreakdownModal alongside Category / Transport / Payables — not a separate modal"
  - "D-18 status derivation duplicated inline as deriveCollectibleStatus inside showExpenseBreakdownModal (not extracted to a shared helper module yet) — same anti-circular-import pattern as Phase 71's inline derive*ForPO/TR/DeliveryFee. If/when a 3rd consumer of this exact derivation appears, lift to app/coll-status.js (Phase 86+ candidate)"
  - "D-17 history UI: rows toggle a hidden sibling tr#em-coll-history-{id}; voided payments rendered with strike-through + amber '(voided)' label"
  - "D-01 parity: project mode does an extra projects-by-name lookup to extract project_code, mirroring the existing RFP-fetch pattern at lines 47-74; service mode queries collectibles by service_code directly. 1 extra getDocs call (project mode = 2 calls including the projects lookup, service mode = 1 call)"
  - "Status priority sort: Pending > Overdue > Partially Paid > Fully Paid (matches Plan 05 getDisplayedCollectibles ordering — action-needed first)"
  - "Status badge palette mirrors Plans 05/06: amber #856404, blue #1d4ed8, green #166534, red #991b1b — no new color tokens introduced"

patterns-established:
  - "When extending a multi-tab modal switcher: add the new tab ID to the existence guard, the switcher's button-bar map, and add one positional .style.display branch — no other refactoring needed"

requirements-completed: [COLL-07]

# Metrics
duration: 9min
completed: 2026-05-02
---

# Phase 85 Plan 08: Collectibles Tab on Financial Breakdown Modal

**Added a 4th Collectibles tab to `app/expense-modal.js` — fetches per-project / per-service collectibles, renders a status-priority-sorted card with expandable per-row payment history (with voided strike-through), and integrates cleanly with the existing 3-tab switcher.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-05-02T16:00:18Z (approx — first read of plan)
- **Completed:** 2026-05-02T16:09:31Z
- **Tasks:** 1 of 1 complete (single-task plan)
- **Files modified:** 1
- **Files created:** 0

## Accomplishments

- Added inline `deriveCollectibleStatus` helper at the top of `showExpenseBreakdownModal` (line 22) — Pending > Overdue > Partially Paid > Fully Paid priority per D-18. Duplicated inline rather than imported from finance.js to avoid a circular import (Plan 05 also defines this; lift to a shared module if/when a 3rd caller appears).
- Added Phase 85 D-07 collectibles fetch block (line 90) immediately after the existing RFP fetch — 1 extra Firestore query in service mode, 2 in project mode (projects-by-name + collectibles-by-project_code), mirroring the surrounding code's pattern.
- Built the Collectibles tab markup (line 515) — single collapsible card with table columns ID | Tranche (with %) | Status | Due Date | Amount | Paid | Balance. Sorted by status priority, then due_date asc. Each `<tr>` is clickable to toggle a hidden `<tr id="em-coll-history-{id}">` sibling row containing chronological payment history with voided records struck-through.
- Added the 4th tab `<button>` (line 809) to the existing tab bar — same `.expense-tab` class, `data-tab="collectibles"`, identical default styling to Payables. No CSS changes needed.
- Added the 4th tab `<div id="expBreakdownCollectiblesTab">` (line 831) immediately after the Payables tab div — `display: none` initially.
- Extended `window._switchExpenseBreakdownTab` (line 850) to handle `'collectibles'` — declared the new DOM ref, added it to the existence guard, added the positional `.style.display` branch.
- Added `window._toggleEMCollHistory(collId)` (line 890) — toggles `em-coll-history-{collId}` between `none` and `table-row`. Idempotent (no-op if the modal is closed and the row doesn't exist).
- All user-controlled string fields (`coll_id`, `tranche_label`, `due_date`, `c.id`, `r.date`, `r.method`, `r.reference`) wrapped in `escapeHTML(...)` before innerHTML interpolation — T-85.8-01 mitigation.

## Task Commits

1. **Task 1: Add Collectibles tab to showExpenseBreakdownModal — fetch, render, switch** — `ef000b5` (feat)
   - `feat(85-08): add Collectibles tab to Financial Breakdown modal`

## Files Modified

### `app/expense-modal.js` (+156 / -1)

| Insertion | Line | Block |
|-----------|------|-------|
| `deriveCollectibleStatus` inner helper | 22 | inside `showExpenseBreakdownModal`, before `let posSnapshot, trsSnapshot;` |
| Collectibles fetch block | 90 | immediately after the existing RFP fetch (after totalRequested/totalPaid accumulation) |
| `collectiblesHTML` markup + sort + totals | 515 | immediately after the existing `payablesHTML` block |
| 4th tab button (`data-tab="collectibles"`) | 809 | inside the `.em-tab-bar`, after the Payables button |
| 4th tab div (`id="expBreakdownCollectiblesTab"`) | 831 | inside `.modal-body`, after the Payables tab div |
| `_switchExpenseBreakdownTab` extension | 850 | added `collectiblesTab` ref + existence guard + style.display branch |
| `_toggleEMCollHistory` window helper | 890 | end of file, alongside `_toggleExpenseCategory` |

**Modified line:** the `if (!categoryTab || !transportTab || !payablesTab)` guard at the old line 708 was extended to include `|| !collectiblesTab` (this is the only "modified" line — all other changes are pure additions).

## No Circular Import Introduced

`deriveCollectibleStatus` is defined as a const arrow function inside `showExpenseBreakdownModal` itself — it is **not** imported from `app/views/finance.js`. This is the exact pattern Phase 71 used for `deriveStatusForPO`/`deriveStatusForTR`/`deriveStatusForDeliveryFee` in this same file (lines 238-355), specifically to avoid a circular dependency between the shared expense-modal module and the consumer view modules (`finance.js`, `project-detail.js`, `service-detail.js`) that already import `expense-modal.js`.

If a third consumer of `deriveCollectibleStatus` lands in a future plan (e.g., a CSV export or a notification trigger), lift the function to a new `app/coll-status.js` module and have all three consumers (Plan 05's finance.js, this expense-modal.js, the new caller) import from it. Until then, the inline duplicate is the right tradeoff per Phase 71 precedent.

## Performance Note

This adds 1 extra Firestore query per modal-open in service mode and **2** extra queries in project mode (one to `projects` to look up `project_code`, one to `collectibles`). The modal is user-action-driven (clicking the Refresh / amount in the Financial Summary), not on every page load, so the cost is bounded — same disposition as the existing RFP fetch immediately above this code (lines 47-74). If modal-open latency becomes a noticeable issue in production, consider:

- Caching the project_code lookup in a closure or module-level Map keyed by project_name (single-source-of-truth would be the project doc the parent view already has — pass it in via the options object instead of re-fetching).
- Parallelising the collectibles fetch with the RFP fetch using `Promise.all` (currently sequential).

Neither is needed today.

## Acceptance Criteria — All Pass

| Check | Expected | Actual |
|---|---|---|
| `node --check app/expense-modal.js` | exit 0 | exit 0 |
| `id="expBreakdownCollectiblesTab"` count | 1 | 1 |
| `data-tab="collectibles"` count | 1 | 1 |
| `deriveCollectibleStatus` count | ≥3 | 4 |
| `collectiblesForTab` count | ≥4 | 8 |
| `where('project_code', '==', projectCodeForColl)` count | 1 | 1 |
| `where('service_code', '==', identifier)` count | ≥2 | 4 (pos + trs + rfps + new collectibles) |
| `collectiblesTab.style.display` count | ≥1 | 1 |
| `window._toggleEMCollHistory` count | 2 | 2 (definition + onclick reference) |
| `No collectibles recorded` count | 1 | 1 |
| `COLLECTIBLES</span>` count | 1 | 1 |

DOM smoke test (UAT) deferred to phase-level verification — code-level acceptance criteria 100% pass; the interactive DOM checks (4 tabs visible, click Collectibles → card renders, click row → sub-row expands, voided struck-through, no console errors, no regression on existing 3 tabs) require seed data and a live browser session, which is the standard end-of-phase Phase 85 UAT pass.

## Threat Surface

All threats from the plan's `<threat_model>` are mitigated or accepted as designed:

- **T-85.8-01 (XSS via tranche_label / coll_id / due_date / payment fields):** mitigated — all user-controlled strings wrapped in `escapeHTML(...)`. Numbers go through `formatCurrency` / `toFixed`. Status strings come from a fixed enum in `deriveCollectibleStatus` and are never user-controlled.
- **T-85.8-02 (Info disclosure to non-Finance users):** accepted per D-24 — read rule on `collectibles` is `isActiveUser()`, set in Plan 01.
- **T-85.8-03 (DoS via getDocs on every open):** accepted — modal is user-action-driven; cost bounded.
- **T-85.8-04 (window._toggleEMCollHistory leak):** accepted as hygiene — the function is idempotent and safe across modal-open/close cycles. Defensive `delete window._toggleEMCollHistory` inside `_closeExpenseBreakdownModal` was **not** added (per the plan's "optional, mark as hygiene improvement" guidance), to keep the diff minimal. If a future plan adds more `window._X` helpers from this modal, batch them into a single cleanup.
- **T-85.8-05 (Stale data race):** accepted — modal data is point-in-time, refreshed on next open.

No new threat flags introduced beyond the modeled set.

## Deviations from Plan

**None — plan executed exactly as written.**

Every action step (1-8) was implemented at the exact specified location, with the exact specified text, with one trivial cosmetic adjustment:

- **Inner-loop variable name:** the plan's reference snippet used `const totalPaid = ...` inside the `collectiblesForTab.map(c => {...})` row builder. The outer `showExpenseBreakdownModal` scope already has a `let totalPaid` (line 70, used for RFP-payable accumulation). To avoid shadowing-related lint warnings or cognitive load when reading the code, I renamed the inner variable to `totalPaidColl`. Pure cosmetic; no behavior change. The plan's acceptance criteria don't pin the variable name, only the count of `collectiblesForTab` references and the structural patterns — both still pass.

This is not a Rule 1/2/3 deviation; it's a sub-line cosmetic refinement within the spec's intent. Tracking here for transparency.

## Parallel-Plan Coordination

Plan 85-08 ran in parallel with Plans 85-03 (projects.js), 85-04 (services.js), and 85-07 (project-detail.js / service-detail.js). All four plans operate on disjoint files — Plan 85-08 only touches `app/expense-modal.js`. Confirmed at commit time via `git status --short`: an unstaged modification to `app/views/projects.js` (presumably from in-flight Plan 85-03) was present in the working tree but **not** staged into this commit. The `git add app/expense-modal.js` line was scoped to a single file, not `git add .`, so no cross-plan files leaked into this commit.

## Self-Check: PASSED

- File exists: `app/expense-modal.js` — FOUND
- File exists: `.planning/phases/85-collectibles-tracking/85-08-SUMMARY.md` — FOUND (this file)
- Commit exists: `ef000b5` — verified via `git rev-parse --short HEAD` immediately after commit
- Acceptance criteria: 11/11 pass (table above)
- No accidental deletions: `git diff --diff-filter=D --name-only HEAD~1 HEAD` returned empty
