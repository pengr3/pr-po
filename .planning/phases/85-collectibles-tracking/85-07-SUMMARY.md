---
phase: 85-collectibles-tracking
plan: 07
subsystem: ui
tags: [collectibles, financial-summary, project-detail, service-detail, aggregation, phase-75-pattern, d-06, d-01-parity, d-08]

requires:
  - phase: 85-01
    provides: "collectibles security rules + isActiveUser() read access (depends_on declared)"
  - phase: 75
    provides: "always-render zero-state Financial Summary cell pattern (Paid + Remaining Payable)"
  - phase: 65
    provides: "payment_records void semantics + RFP-style aggregation pattern (mirrored)"
  - phase: 72
    provides: "Refresh button on Financial Summary card — single code path now refreshes payable + collectible cells"

provides:
  - "currentCollectibles module-state (project-detail.js): {totalRequested, totalCollected, remainingCollectible}"
  - "currentServiceCollectibles module-state (service-detail.js): same shape, service-side"
  - "Two new always-rendered Financial Summary cells on both detail views: Collected (green) + Remaining Collectible (red>0 / green=0)"
  - "Aggregation block in refreshExpense() (project-detail) and refreshServiceExpense() (service-detail) querying collectibles by project_code / service_code respectively"

affects: [85-08, 85-future-fully-paid-notification, 85-future-overdue-derive]

tech-stack:
  added: []
  patterns:
    - "Phase 75 always-render zero-state cell — extended to Collected/Remaining Collectible"
    - "Phase 65-style payment_records aggregation (filter !voided → reduce sum) — re-applied to collectibles"
    - "Single-code-path refresh — new cells refresh alongside existing payable cells via existing Refresh button hook"

key-files:
  created: []
  modified:
    - "app/views/project-detail.js — currentCollectibles state + 2 grid cells + aggregation block in refreshExpense() + destroy() reset"
    - "app/views/service-detail.js — currentServiceCollectibles state + 2 grid cells + aggregation block in refreshServiceExpense() + destroy() reset"

key-decisions:
  - "D-06 honored: green Collected, conditionally-red Remaining Collectible, always rendered at zero state"
  - "D-01 parity honored: identical surface on both project-detail and service-detail; only differences are state-var name + scope-key field (project_code vs service_code)"
  - "D-08 honored: NO inline expandable list of per-collectible rows added; both files received only +37 lines each (well under the ~200-line threshold a list would have introduced)"
  - "Reused existing Refresh button (Phase 72) — no new wiring needed; aggregation lives in the same function that already populates currentExpense/currentServiceExpense"

patterns-established:
  - "Pattern X: Read-side collectibles aggregation alongside RFP aggregation — both queries fire in the same refresh function so a single round-trip updates all four money cells (Paid / Remaining Payable / Collected / Remaining Collectible)"

requirements-completed: [COLL-07]

duration: 4min
completed: 2026-05-02
---

# Phase 85 Plan 07: Project-Detail / Service-Detail Collectibles Cells Summary

**Two new always-rendered Financial Summary cells (Collected + Remaining Collectible) on both project-detail.js and service-detail.js, populated by a parallel collectibles aggregation block colocated with the existing RFP aggregation in the refresh function.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-02T16:06:25Z
- **Completed:** 2026-05-02T16:10:47Z
- **Tasks:** 2 of 2
- **Files modified:** 2

## Accomplishments

- Project-detail Financial Summary card now shows 8 cells (was 6): Budget, Contract Cost, Projected Cost, Remaining Budget, Paid, Remaining Payable, **Collected**, **Remaining Collectible**
- Service-detail Financial Summary card now shows the same 8 cells (D-01 parity)
- Both new cells render at zero-state per Phase 75 pattern (`PHP 0.00 / PHP 0.00` when no collectibles exist) — they NEVER hide
- Aggregation runs in the same code path that already computes `currentExpense.totalPaid` / `remainingPayable` — single getDocs round-trip per refresh, no new HTTP hop on top of the RFP query
- D-08 honored: NO inline expandable per-collectible LIST added beneath the cells (deliberate trim during phase discussion — modal tab in Plan 08 is the worklist)
- Refresh button (Phase 72) refreshes the new cells transparently — no new wiring needed because the new aggregation lives inside `refreshExpense()` / `refreshServiceExpense()`

## Task Commits

Each task was committed atomically (code commits only — plan-metadata commit follows separately at end):

1. **Task 1: Add Collected / Remaining Collectible cells to project-detail.js** — `5c09c03` (feat)
2. **Task 2: Add Collected / Remaining Collectible cells to service-detail.js** — `5d5a1b1` (feat)

## Files Created/Modified

- **`app/views/project-detail.js`** (+37 lines)
  - Module-state `let currentCollectibles = { totalRequested: 0, totalCollected: 0, remainingCollectible: 0 };` declared at line 19 (immediately below `currentExpense` at line 17)
  - Two new `<div class="form-group">` cells inserted into the `repeat(2, 1fr)` grid as children 7 and 8 (after Remaining Payable). Cells render at zero-state per Phase 75 pattern.
  - Aggregation block inserted inside `refreshExpense()` immediately after the existing `currentExpense = { ... }` assignment and immediately before the `renderProjectDetail()` call. Block fetches `collectibles where project_code == projectCode`, sums `amount_requested` for `totalRequested`, sums non-voided `payment_records.amount` for `totalCollected`, and stores both plus the difference into `currentCollectibles`. Reuses the local `const projectCode` already declared on line 788 of the function — no shadowing, no rename.
  - `destroy()` reset: `currentCollectibles = { totalRequested: 0, totalCollected: 0, remainingCollectible: 0 };` added on line 228 alongside the existing `currentExpense = { ... }` reset.

- **`app/views/service-detail.js`** (+37 lines)
  - Module-state `let currentServiceCollectibles = { totalRequested: 0, totalCollected: 0, remainingCollectible: 0 };` declared at line 23 (immediately below `currentServiceExpense` at line 22).
  - Two new `<div class="form-group">` cells inserted into the Financial Summary grid immediately after Remaining Payable (lines ~439-450 post-edit).
  - Aggregation block inserted inside `refreshServiceExpense()` immediately after the existing `currentServiceExpense = { ... }` assignment (post-edit lines ~933-953) and immediately before the `renderServiceDetail()` call. Reuses the function-scoped `const serviceCode = currentService.service_code;` already declared on line 904 — no rename, no shadowing.
  - `destroy()` reset: `currentServiceCollectibles = { totalRequested: 0, totalCollected: 0, remainingCollectible: 0 };` added on line 205 alongside the existing `currentServiceExpense = { ... }` reset.

## Insertion Locations (per `<output>` requirement)

Per the plan's explicit `<output>` requirement, here are the exact functions and (post-edit) line numbers where each aggregation block was inserted:

| File | Function name | Aggregation block (post-edit lines) | Render block (post-edit lines) | State-reset (destroy) line |
|---|---|---|---|---|
| `app/views/project-detail.js` | `refreshExpense()` | 814-833 | 433-444 | 228 |
| `app/views/service-detail.js` | `refreshServiceExpense()` | 935-954 | 439-450 | 205 |

**Other code paths touched: NONE.** No edits to `firestore.rules`, `app/notifications.js`, `app/expense-modal.js`, `app/views/finance.js`, or any other file. Pure read-side display per the plan's threat-model declaration "no Firestore writes happen here".

## D-08 Confirmation (explicit per plan output requirement)

D-08 was honored: NO inline expandable LIST of per-collectible rows was added beneath the new cells. The two cells are the entire project-detail and service-detail surface for this phase. Per-collectible drill-down lives in the Financial Breakdown modal Collectibles tab (Plan 85-08). Diff size confirms: 37 lines added per file (well under the ~200+ a list would have required).

## Decisions Made

None beyond the plan — followed the plan exactly. Two minor "Claude's discretion" choices made within the spec:

1. **Comment lead-ins** in both files use `// Phase 85 D-06: …` to match the project's habit of phase-tagging non-trivial inserts (visible across phases 65, 72, 75, 78, 84). This is consistent with surrounding code and not novel.
2. **Aggregation block placement** — placed AFTER the existing `currentExpense = { ... }` / `currentServiceExpense = { ... }` assignment rather than BEFORE. Plan said "Place this BEFORE the `renderProjectDetail()` call so the new state is in scope when the template re-renders." Both placements satisfy that constraint; placing-after keeps the pre-existing payable assignment visually intact and reduces git-diff churn around the existing block. No semantic difference.

## Deviations from Plan

### Coordination issue (parallel execution)

**1. [Coordination — not a code deviation] services.js stowaway in Task 1 commit `5c09c03`**
- **Found during:** Task 1 (project-detail.js commit verification)
- **Issue:** When I ran `git add app/views/project-detail.js` between Task 1 and Task 2, plan 85-04 (running in parallel on `app/views/services.js`) had just staged its own work to the index. My subsequent `git commit` (which commits the entire index, not just the path I last added) included plan 85-04's `app/views/services.js` change (+19 lines: tranche-builder import + 4 window-fn registrations + `editingServiceTranches` state). The 85-04 work was legitimate and would have been committed by 85-04 anyway under its own message; my commit subsumed it under the `feat(85-07): …` subject line.
- **Fix:** Did NOT revert. Reverting would have destroyed plan 85-04's in-progress work (mid-air collision). Instead, for Task 2 I switched to explicit pathspec staging — `git add -- app/views/service-detail.js` — and verified the index with `git diff --cached --stat` BEFORE commit. Task 2 commit `5d5a1b1` shows clean: `1 file changed, 37 insertions(+)`.
- **Files affected by stowaway:** `app/views/services.js` — but the stowaway content is correct 85-04 work, not bug. 85-04's SUMMARY (when it writes one) should note that the services.js Phase-85 tranche-builder import shipped under commit `5c09c03` rather than under the eventual `feat(85-04): …` commit.
- **Verification:** `git show 5c09c03 -- app/views/services.js` shows the 85-04 import + window-fn block as expected.
- **Committed in:** Side-effect of `5c09c03` (Task 1 commit).
- **Rule classification:** Not a Rule 1/2/3 deviation. This is a parallel-execution staging race, not a bug or missing functionality in 85-07's scope. Documented for traceability.

### Code deviations

None — plan executed exactly as written. The cells render, aggregation runs in the same function path as existing payable aggregation, both detail views have parity, D-08 honored, no firestore.rules touched, no new imports added.

---

**Total deviations:** 1 coordination-only (parallel staging race), 0 code deviations.
**Impact on plan:** No scope creep, no functional issue. The accidental services.js stowaway in commit `5c09c03` is correct 85-04 work attributed under 85-07's commit message — a bookkeeping issue, not a functionality issue. 85-04's eventual SUMMARY should cross-reference `5c09c03` so the trail is complete.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. Pure JavaScript edits, no Firestore schema changes, no security rule changes, no environment variables.

## UAT Plan (per plan acceptance criteria — to run post-merge)

1. **Zero-state render — project page:** Open `#/projects/detail/<some-project-code>` for a project with no collectibles. Confirm Financial Summary now shows 8 cells in the 2-col grid: Budget, Contract Cost, Projected Cost, Remaining Budget, Paid, Remaining Payable, **Collected (PHP 0.00, green)**, **Remaining Collectible (PHP 0.00, green — green because value === 0)**.
2. **Zero-state render — service page:** Open `#/services/detail/<some-service-code>` for a service with no collectibles. Same 8 cells visible.
3. **Refresh button propagation:** Click the Refresh button on either page. Verify the new cells refresh alongside Paid / Remaining Payable (no separate refresh affordance — Phase 72 hook reused).
4. **Non-zero render with payment:** Once Plans 85-05 and 85-06 ship the create + payment-record flows, manually create a collectible against the test project, record a partial payment, click Refresh on project-detail. Verify Collected shows the partial amount (green), Remaining Collectible shows the balance (red because > 0). Repeat on service-detail with a service-side collectible.
5. **destroy() cleanup:** Navigate away from project-detail to a different view, then navigate back. Confirm `currentCollectibles` was reset to zeros (cells show PHP 0.00 until refresh re-populates them).
6. **D-08 negative test:** Confirm there is NO expandable per-collectible list anywhere on the project-detail or service-detail page — only the two new cells in the Financial Summary card.

## Next Phase Readiness

- Both detail surfaces are wired for Phase 85's read path. Ready for downstream plans (85-05 create flow, 85-06 payment-recording flow) to write `collectibles` documents that these cells will then aggregate.
- Plan 85-08 (`expense-modal.js` Collectibles tab) is parallel and independent — already in commit `ef000b5` (visible in git log). Once both 85-07 (this) and 85-08 land on `v3.3`, the project-detail / service-detail Refresh button will populate the Financial Summary cells AND the modal tab will provide the per-collectible drill-down — closing the read-side surface for COLL-07 + D-07.
- No blockers introduced.

---

## Self-Check: PASSED

**File-existence checks:**
- `app/views/project-detail.js` — FOUND (modified, syntax-OK via `node --check`)
- `app/views/service-detail.js` — FOUND (modified, syntax-OK via `node --check`)
- `.planning/phases/85-collectibles-tracking/85-07-SUMMARY.md` — being written by this Write call

**Commit-existence checks:**
- `5c09c03` — FOUND in `git log --oneline` (Task 1 — project-detail)
- `5d5a1b1` — FOUND in `git log --oneline` (Task 2 — service-detail)

**Acceptance-criteria re-run (Task 1, project-detail.js):**
- `node --check app/views/project-detail.js` exits 0 — PASS
- `grep -c "let currentCollectibles" app/views/project-detail.js` = 1 — PASS
- `grep -c "currentCollectibles" app/views/project-detail.js` = 6 (≥5) — PASS
- `grep -c ">Collected<" app/views/project-detail.js` = 1 — PASS
- `grep -c ">Remaining Collectible<" app/views/project-detail.js` = 1 — PASS
- `grep -c "where('project_code', '==', projectCode)" app/views/project-detail.js` = 3 (≥2) — PASS
- `grep -c "collection(db, 'collectibles')" app/views/project-detail.js` = 1 — PASS
- `grep -c "currentCollectibles.totalRequested > 0 ?" app/views/project-detail.js` = 0 (no hide-at-zero) — PASS
- `git diff --stat` = +37 lines (well under ~200, D-08 honored) — PASS

**Acceptance-criteria re-run (Task 2, service-detail.js):**
- `node --check app/views/service-detail.js` exits 0 — PASS
- `grep -c "let currentServiceCollectibles" app/views/service-detail.js` = 1 — PASS
- `grep -c "currentServiceCollectibles" app/views/service-detail.js` = 6 (≥5) — PASS
- `grep -c ">Collected<" app/views/service-detail.js` = 1 — PASS
- `grep -c ">Remaining Collectible<" app/views/service-detail.js` = 1 — PASS
- `grep -c "where('service_code', '==', serviceCode)" app/views/service-detail.js` = 2 (≥1) — PASS
- `grep -c "collection(db, 'collectibles')" app/views/service-detail.js` = 1 — PASS

**Plan-level verification (`<verification>` block):**
- `node --check app/views/project-detail.js` exits 0 — PASS
- `node --check app/views/service-detail.js` exits 0 — PASS
- Project-detail page (UAT, deferred to post-merge run) — pending UAT
- Service-detail page (UAT, deferred to post-merge run) — pending UAT
- Refresh button propagation (UAT, deferred) — pending UAT
- Always-render zero-state (UAT, deferred) — confirmed in code (no conditional `${... > 0 ? ... : ''}` wrapping the cells)
- Non-zero render after payment (UAT, deferred — depends on Plans 85-05 / 85-06)

All static / automated checks pass. UAT-only checks deferred to post-merge run, which is the project's normal pattern (Phase 84.1 followed the same UAT-after-merge cadence).

---

*Phase: 85-collectibles-tracking*
*Completed: 2026-05-02*
