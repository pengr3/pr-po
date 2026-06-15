---
phase: 85-collectibles-tracking
plan: 05
subsystem: ui
tags: [finance, collectibles, sub-tab, onsnapshot, pagination, filter]

requires:
  - phase: 85-01
    provides: NOTIFICATION_TYPES.COLLECTIBLE_CREATED enum, firestore collectibles rules
  - phase: 85-02
    provides: collection_tranches editor on projects.js (drives Plan 06 create-modal)
  - phase: 85-03
    provides: project-detail Collected/Remaining cells (validates dual-doc shape)
  - phase: 85-04
    provides: services tranche editor + service-detail collectibles cells
provides:
  - Read-only Finance Collectibles sub-tab — 5th finance-sub-nav-tab pill
  - deriveCollectibleStatus() shared helper at module scope (priority-derived, never persisted)
  - Filter pipeline (5 independent state vars) + status-priority sort + 15-per-page pagination
  - onSnapshot listeners on collectibles/projects/services pushed to listeners[]; destroy() unsubscribes
  - Stub window functions for the 5 Plan 06 write-side actions (idempotent, overwritten by Plan 06)
affects: [85-06, 85-09, v4.1-hygiene]

tech-stack:
  added: []
  patterns:
    - "Phase 65.1 dual-state filter independence (5 vars × no shared state)"
    - "Phase 65.7 15-per-page filter-aware pagination (filter → sort → paginate)"
    - "Phase 75 always-render zero state (filter-aware empty-state copy)"
    - "Phase 73.3 sticky pill bar reuse (no new CSS)"
    - "CLAUDE.md tab-switch contract: init runs once per Finance mount; destroy() resets all collectibles state"
    - "Plan-N stub guard pattern: !window.X check leaves Plan 06 real impls untouched on re-init"

key-files:
  created: []
  modified:
    - app/views/finance.js (4536 → 4984 lines, +448)

key-decisions:
  - "Status sort priority hard-coded as Pending=1, Overdue=2, Partial=3, Fully=4 — unpaid surfaces first per D-18"
  - "5 Plan 06 stubs use !window.X guard so Plan 06's real impls survive re-init re-attaches"
  - "deriveCollectibleStatus duplicated across finance.js + expense-modal.js — documented as v4.1 hygiene item rather than extracted to keep Plan 05 surface narrow (orchestrator note)"
  - "due_date string compare via lexicographic >= / <= on YYYY-MM-DD (no Date parse) — same shape as Phase 65 RFP filter"
  - "All escapeHTML wraps on user-controlled strings (project_name, service_name, tranche_label, coll_id, due_date); coll.id (Firestore auto-id, alphanumeric) interpolated bare inside JS-string-literal contexts to match existing finance.js parity (rfp.id same treatment)"

patterns-established:
  - "Plan-N stub bridge: Plan ships idempotent toast stubs for next plan's window functions to prevent ReferenceError between deploys"

requirements-completed: [COLL-04, COLL-06, COLL-09]

duration: 7m 37s
completed: 2026-05-02
---

# Phase 85 Plan 05: Finance Collectibles Read-Side Summary

**Wired the 5th Finance sub-tab (#/finance/collectibles) with onSnapshot-driven flat collectibles table, 5 independent filters, status-priority sort (Pending > Overdue > Partial > Fully), 15-per-page pagination, and a deriveCollectibleStatus helper — all writes deferred to Plan 06 via stubbed window functions.**

## Performance

- **Duration:** 7m 37s
- **Started:** 2026-05-02T16:17:03Z
- **Completed:** 2026-05-02T16:24:40Z
- **Tasks:** 3 / 3
- **Files modified:** 1 (app/views/finance.js)

## Accomplishments
- 5th `<a href="#/finance/collectibles">` pill in `finance-sub-nav-tabs` reusing existing `finance-sub-nav-tab` / `finance-sub-nav-tab--active` classes (zero new CSS)
- `<section id="collectibles-section">` with filter bar (Project dropdown / Status / Department / Due-from / Due-to + Export CSV + Create buttons), 10-column data table, pagination div
- `deriveCollectibleStatus(coll)` at module scope — priority order Fully Paid > Overdue > Partially Paid > Pending (D-18); never written to Firestore (D-19)
- `getDisplayedCollectibles()` pure helper (filter+sort) extracted so Plan 06's CSV export reuses it without duplication
- `onSnapshot` x3 (collectibles + projects + services) wired in `initCollectiblesTab`, all unsubscribes pushed to shared `listeners[]`
- `destroy()` deletes 7 window functions and resets 9 state vars (data array, two maps, 5 filter strings, page index)
- 5 Plan 06 write-action window functions stubbed as toast no-ops, idempotent (`if (!window.X)` guards) so Plan 06's real implementations survive re-init re-attaches

## Task Commits

1. **Task 1: Module state + deriveCollectibleStatus + pill nav + section markup** — `3399ea8` (feat)
2. **Task 2: Render pipeline (filter, sort, paginate, populate)** — `2799a68` (feat)
3. **Task 3: initCollectiblesTab + lifecycle hooks + window function attaches** — `1ab7b46` (feat)

(No metadata-only commit yet — that ships once SUMMARY + STATE updates are recorded below.)

## Function Insertion Map (line numbers post-Plan-05)

| Function | Line | Notes |
|---|---|---|
| `deriveCollectibleStatus` | 53 | Immediately after `deriveRFPStatus` (line 33), before `statusBadgeColors` (line 65). Reuses statusBadgeColors — NO duplication. |
| Module state vars (collectiblesData, two maps, 5 filter strings, page index, page-size const) | 123–137 | After `poSummaryItemsPerPage` |
| 5th sub-nav `<a href="#/finance/collectibles">` | 1773–1776 | After Payables `<a>`, before `</div>` of finance-sub-nav-tabs |
| `<section id="collectibles-section">` markup | 2444–2515 | Immediately after `</section>` of `payables-section`, before container `</div>` |
| `filterCollectiblesTable` | 1234 | New "COLLECTIBLES TAB" block immediately after `initPayablesTab()` close |
| `getDisplayedCollectibles` | 1252 | |
| `renderCollectiblesTable` | 1305 | Empty-state copy is filter-aware |
| `renderCollectiblesPagination` | 1384 | Mirror of renderPOSummaryPagination |
| `changeCollectiblesPage` | 1415 | prev / next / number |
| `populateCollProjectFilter` | 1428 | Distinct codes, sorted by name, preserves selection |
| `initCollectiblesTab` (async) | 1462 | Three onSnapshot subs, all pushed to shared `listeners[]` |
| init() activeTab branch | 2247–2250 | Inside `try` block, after Payables branch |
| Window function attaches | 309–331 | Inside `attachWindowFunctions()`, after Payables attaches |
| Destroy cleanup (7 deletes + 9 resets) | 3381–3402 | After Payables cleanup block in `destroy()` |

## Files Created/Modified

- `app/views/finance.js` — All Plan 05 work (single file). Net +448 lines.

## Decisions Made

- **deriveCollectibleStatus inlined twice** — also lives in `app/expense-modal.js` (Plan 85-08 shipped earlier). Considered extracting to `app/collectible-status.js` but that touches a non-finance file beyond Plan 05's scope. Captured as a v4.1 hygiene item; both implementations are byte-equivalent (both use `parseFloat(r.amount) || 0` and the same priority order). The deriveCollectibleStatus JSDoc in finance.js explicitly references the duplication.
- **Plan 06 stub bridge pattern** — Buttons in the markup point to 5 window functions (openCreateCollectibleModal, exportCollectiblesCSV, openRecordCollectiblePaymentModal, toggleCollPaymentHistory, showCollectibleContextMenu) that don't exist until Plan 06. Without stubs, clicking them produces an unhandled ReferenceError. Solution: idempotent stubs in attachWindowFunctions() guarded by `if (!window.X)` — Plan 06's `attachWindowFunctions` will assign without the guard so the real impls overwrite the stubs but still survive a subsequent re-init (because Plan 06's assignment is unconditional).
- **Three onSnapshot listeners, not one** — projects + services are subscribed even though Plan 05 doesn't render them. Plan 06's create-modal uses these maps to source the tranche dropdown; subscribing during Plan 05's `initCollectiblesTab` means Plan 06 needs zero listener-wiring changes (orchestrator note for Plan 06 executor: the projectsForCollMap / servicesForCollMap maps are already populated when openCreateCollectibleModal fires).

## Deviations from Plan

None — plan executed exactly as written, with one minor observation:

- Acceptance-criteria grep for `window.filterCollectiblesTable` claims "exactly 2" (attach + delete). Actual count is 7: 1 attach (line 311) + 1 delete (line 3381) + 5 markup `onchange="window.filterCollectiblesTable()"` strings (lines 2465, 2470, 2479, 2487, 2492). The plan author was counting JS attaches only; markup interpolations are intentional and correct. Same observation for `window.changeCollectiblesPage` (5 total: 1 attach + 1 delete + 3 in pagination markup) and `window.openCreateCollectibleModal` (4 total: 1 stub-attach + 1 markup + 2 conditional-guard lines + 1 delete = actually 4 lines covering 3 distinct purposes). All correct.

## Issues Encountered

None.

## Threat Surface Scan

All threats from `<threat_model>` (T-85.5-01 through T-85.5-06) covered:
- T-85.5-01 (XSS) **mitigated** — every user-controlled string interpolation (project_name, service_name, project_code, service_code, tranche_label, coll_id, due_date) wrapped in `escapeHTML(...)` in `renderCollectiblesTable`. coll.id (Firestore auto-generated 20-char alphanumeric) interpolated bare in JS-string-literal context — same treatment as existing rfp.id rendering, no new attack surface.
- T-85.5-02 (Info disclosure) **accept** — Plan 01 read rule is isActiveUser; route gated by routePermissionMap['/finance']='finance' upstream.
- T-85.5-03 (Filter compute) **accept** — O(N) in-memory only.
- T-85.5-04 (Auth on create) **mitigate** — deferred to Plan 06's openCreateCollectibleModal role-check; current stub just shows a toast, no DB write.
- T-85.5-05 (Listener leak) **mitigate** — destroy() does `listeners.forEach(unsubscribe => unsubscribe?.())`; CLAUDE.md tab-switch contract prevents in-view duplicate-attach.
- T-85.5-06 (onSnapshot ordering) **accept** — populateCollProjectFilter is module-scope and hoisted; onSnapshot callback runs async after module evaluation.

No new threat surface introduced beyond what the threat-model anticipated.

## User Setup Required

None — no external service configuration. Firestore collectibles rules already deployed by Plan 85-01 (which is in this branch's commit history).

## Next Phase Readiness

- **Plan 06 (write-side CRUD modals + payment recording):** Ready to start. Five stub window functions are placeholders; Plan 06's `attachWindowFunctions` should assign real impls unconditionally (`window.openCreateCollectibleModal = openCreateCollectibleModal;`) — the `if (!window.X)` guards in Plan 05 will be skipped on re-init because the real impl already exists. The projectsForCollMap and servicesForCollMap are already populated by Plan 05's `initCollectiblesTab` so Plan 06's create-modal can read tranche options directly.
- **Order-of-operations note for Plan 06 executor:**
  1. Plan 06's window-function assignments must NOT use `if (!window.X)` guards — they should overwrite Plan 05 stubs unconditionally.
  2. The destroy()-block cleanup in Plan 05 already deletes all 7 collectibles window functions. Plan 06 will append its own additional deletes (submitCollectible, voidCollectiblePayment, submitCollectiblePayment, cancelCollectible, toggleCollPaymentOtherField) below the existing block — locate via the trailing "Plan 06 will append:" comment marker in destroy().
  3. Plan 06's CSV export should call `getDisplayedCollectibles()` (already extracted as a pure helper) — do NOT re-implement the filter+sort pipeline.

## Self-Check: PASSED

Verified all claims:

- ✅ `app/views/finance.js` exists, syntax-clean (`node --check` exits 0)
- ✅ Commit `3399ea8` (Task 1) found in git log
- ✅ Commit `2799a68` (Task 2) found in git log
- ✅ Commit `1ab7b46` (Task 3) found in git log
- ✅ All 8 new functions present (deriveCollectibleStatus, filterCollectiblesTable, getDisplayedCollectibles, renderCollectiblesTable, renderCollectiblesPagination, changeCollectiblesPage, populateCollProjectFilter, initCollectiblesTab)
- ✅ statusBadgeColors not duplicated (grep returns exactly 1 declaration)
- ✅ deriveRFPStatus untouched (grep returns exactly 1 declaration)
- ✅ 6 filter/page state vars declared
- ✅ 3 onSnapshot listeners (collectibles + projects + services)
- ✅ destroy() resets collectiblesData, two maps, 5 filter strings, page index

---
*Phase: 85-collectibles-tracking*
*Completed: 2026-05-02*
