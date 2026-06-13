---
phase: 104-service-detail-parity
plan: 04
subsystem: ui
tags: [service-detail, dlp, retention, finance-bar, tranche-editor, record-release]

requires:
  - phase: 104-01
    provides: Finance field-masked services update branch (authorizes recordServiceRetentionRelease)
  - phase: 104-02
    provides: _addServiceActivityEntry + addServiceAuditEntry primitives
  - phase: 104-03
    provides: computeDlpFields + _canAdvanceServiceStatus; Completion gate writes the DLP fields the bar reads
  - phase: 102
    provides: project-detail.js DLP finance bar + tranche editor + Record Release (the mirrored design)
provides:
  - "DLP state helpers getDlpState/isRetentionCollected on the service detail page (|| null legacy-safe)"
  - "4-state DLP finance bar (active/in-dlp/expired/released) as the Financial-card headline"
  - "Inline tranche editor + Ret? toggle writing collection_tranches to the service doc"
  - "Finance-only recordServiceRetentionRelease (direct retention_released_at write)"
affects: []

tech-stack:
  added: []
  patterns: ["copy-then-adapt project DLP/tranche-editor (Phase-26 mirror)", "detail-page DLP only (D-09 — portfolio mirror was done in Phase 103)"]

key-files:
  created: []
  modified: [app/views/service-detail.js]

key-decisions:
  - "computeDlpFields reused from Plan 03 (NOT duplicated — grep returns 1)"
  - "renderServiceDlpFinanceBar is parameterless (reads currentService/currentCollectibleDocs) since the injection is ${renderServiceDlpFinanceBar()}; getDlpState(currentService, currentCollectibleDocs) per AC"
  - "recordServiceRetentionRelease + 8 editor handlers registered (recalcTrancheTotal stays module-internal, not on window — only called internally, mirroring the plan's pinned 9-fn list)"
  - "D-09 honored: no services.js (portfolio) change — detail-page only"

patterns-established:
  - "Tranche editor host + DLP finance bar live in Card 2 above the existing Phase-99.1 renderServiceTrancheLifecycle read-display rows"

requirements-completed: []

duration: 22 min
completed: 2026-06-13
---

# Phase 104 Plan 04: Service DLP / Retention Summary

**Ported the Phase 102 DLP surfaces into service-detail.js — a 4-state DLP finance bar headline on the Financial card, an inline tranche editor with a Ret? toggle writing collection_tranches, and a Finance-only Record Release that directly writes retention_released_at — completing Phase 104's service-detail parity.**

## Performance

- **Duration:** ~22 min
- **Tasks:** 2
- **Files modified:** 1 (service-detail.js)

## Accomplishments
- `isRetentionCollected` + `getDlpState` (all DLP fields `|| null` legacy-safe; detail copy uses `currentCollectibleDocs`).
- `renderServiceDlpFinanceBar` — 4 states with `.finance-bar`/`.bar-seg`/`.dlp-strip` verbatim classes; Finance-only Record Release button inline.
- Inline tranche editor (display/editor/host, toggle perm-gated via `_canAdvanceServiceStatus(...,'On-going')`, setters, recalc, save→`collection_tranches` on the service doc with 100%-total + labels guards, cancel) + Ret? toggle.
- `recordServiceRetentionRelease` — Finance-gated direct `retention_released_at` write + audit + activity entry.
- Card 2: DLP bar as headline; `#trancheEditorHost` + "⚙ Edit Tranches" button above the existing Phase-99.1 lifecycle rows.
- 9 editor/release window fns register↔teardown symmetric; `editorTranches`/`trancheEditorOpen` reset in `destroy()`.

## Task Commits

1. **Task 1: DLP helpers + finance bar + tranche editor** - `434a190` (feat)
2. **Task 2: Finance Record Release + window-fn registration** - `04ac7ab` (feat)

## Files Created/Modified
- `app/views/service-detail.js` - DLP/tranche-editor block, editor state, Card 2 injections, recordServiceRetentionRelease, attachWindowFunctions + destroy.

## Decisions Made
- See key-decisions (computeDlpFields reuse, parameterless bar, pinned 9 window fns, D-09 honored).

## Deviations from Plan

None - plan executed as written.

## Issues Encountered
- One AC required the literal `getDlpState(currentService, currentCollectibleDocs)`; the initial draft aliased it via a local `service` var. Changed the single call to reference `currentService` directly (functionally identical) so the static gate passes.

## Verification
- `node --check app/views/service-detail.js` exit 0 after each task. PASS
- getDlpState/isRetentionCollected present + `|| null` reads; bar references `getDlpState(currentService, currentCollectibleDocs)` + finance-bar/dlp-strip classes. PASS
- toggleTrancheEditor perm-gated; saveTrancheEditor writes services doc with no DLP fields; computeDlpFields appears once. PASS
- recordServiceRetentionRelease Finance-guarded + audit + activity; 9 editor/release window fns register↔teardown symmetric; services.js untouched (D-09). PASS

## User Setup Required
None directly — Record Release + tranche-save require the Plan 01 DEV rules deploy at runtime (browser UAT).

## Next Phase Readiness
- Phase 104 service-detail.js is feature-complete (lifecycle + journal + DLP). Browser UAT + DEV rules deploy are the remaining gates (surfaced in the phase's final combined gate).

## Self-Check: PASSED

---
*Phase: 104-service-detail-parity*
*Completed: 2026-06-13*
