---
phase: 106-data-layer-audit-findings-report
plan: 04
subsystem: database
tags: [firestore, onSnapshot, listener-lifecycle, error-handling, legacy-safe, audit, correctness]

# Dependency graph
requires:
  - phase: 106-02 (AUDIT-01 inventory)
    provides: 106-INVENTORY.md — 61-onSnapshot census + Per-File Matrix listener-lifecycle leads
provides:
  - 106-SCRATCH-correctness.md — 7 correctness findings (C-01..C-07) in canonical D-07 schema
  - Per-listener coverage ledger — all 61 onSnapshot sites classified clean/flagged (exhaustive)
affects: [106-07 (findings report merge/re-ID to F-00N), 112 (remediation — all findings target_phase 112)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Router same-view-no-destroy contract (router.js:313-347) is the tab-switch-leak discriminator"
    - "Idempotency patterns audited: listeners[] clear, _xListenerActive flag+reset, named-handle clear-before-subscribe, re-init teardown block"

key-files:
  created:
    - .planning/phases/106-data-layer-audit-findings-report/106-SCRATCH-correctness.md
  modified: []

key-decisions:
  - "0 High findings is the honest outcome: D-08 caps listener leaks at Medium, and user-facing writes are well-guarded (no silent-write-that-matters); unguarded JSON.parse throws (breaks render) not shows-wrong-data, so Medium"
  - "Named-handle cleanup (auth/notifications/permissions/engagement-create) and re-init teardown (project-detail/service-detail) are CLEAN despite arr[]=no matrix flag — flag reflected style, not a leak"
  - "Router read was required to resolve which views actually leak (defaultTab + navigateToTab = re-init) vs single-mount"

patterns-established:
  - "Coverage ledger: one row per SDK call-site with clean/flagged verdict proves exhaustive (not sampled) audit"

requirements-completed: [AUDIT-04]

# Metrics
duration: 40min
completed: 2026-07-09
---

# Phase 106 Plan 04: Data-Layer CORRECTNESS Audit Summary

**Anchor-driven static correctness audit of the Firestore data layer: all 61 onSnapshot listeners lifecycle-classified (41 clean / 20 flagged), yielding 7 findings (4 Medium, 3 Low) covering tab-switch listener re-subscribe leaks, unguarded `JSON.parse(items_json)`, and fire-and-forget write gaps — in canonical D-07 schema for Plan 07.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-07-09T13:01:00Z (approx)
- **Completed:** 2026-07-09T13:41:05Z
- **Tasks:** 2
- **Files created:** 1 (audit artifact); 0 source files modified (read-only audit)

## Accomplishments

- **Exhaustive per-listener coverage ledger** — every one of the 61 `onSnapshot` call-sites from 106-INVENTORY.md opened and classified `clean`/`flagged` against capture → clear-in-destroy → tab-switch-re-subscribe. 41 clean, 20 flagged.
- **Resolved the leak discriminator by reading router.js** — `destroy()` runs only on different-view nav; same-view sub-tab switches re-call `init(activeTab)` without teardown. This distinguishes real per-tab-switch leaks (finance, services, procurement — `defaultTab` + `navigateToTab`) from single-mount safe views and admin-wrapped views (`admin.js` destroys child before switching).
- **7 findings (C-01..C-07)** in canonical schema with file:line anchors, handling, target_phase 112.
- **Cleared 6 false-positive matrix leads** — auth/engagement-create/notifications/permissions (named-handle idempotent cleanup) and project-detail/service-detail (Phase 101/105 re-init teardown blocks) are CLEAN; the `arr[]=no` flag was style, not a leak.

## Findings produced (temp IDs → Plan 07 F-00N)

| ID | Severity | Title (module:anchor) |
|----|----------|-----------------------|
| C-01 | Medium | Finance re-subscribes whole-collection listeners on every sub-tab switch (finance.js:5287,5345,6592 + 6 tab-init) |
| C-02 | Medium | Services re-subscribes 3 listeners per services↔recurring switch (services.js:449,482,906) |
| C-03 | Medium | `loadRejectedTRs` unguarded, runs every procurement init (procurement.js:3054) |
| C-04 | Low | Procurement loadProjects/loadSuppliers cache-guard edge holes + no onSnapshot error cb (procurement.js:2936,5004) |
| C-05 | Low | Missing clear-before-subscribe (home loadStats + mrf-form loaders) — latent (home.js:747/767/778; mrf-form.js:1046/1102) |
| C-06 | Medium | Unguarded `JSON.parse(mrf.items_json)` throws on legacy MRF (procurement.js:3820,5830) |
| C-07 | Low | Fire-and-forget `last_activity_at` writes fail silently, inconsistent `.catch` (project-detail.js:3176,3359; service-detail.js:2895+) |

**Severity distribution: 0 High · 4 Medium · 3 Low.** Listener leaks account for C-01..C-05; error-handling/legacy for C-06..C-07.

## Task Commits

1. **Task 1 + Task 2: correctness audit (listener ledger + error/legacy sweep)** - `11fc184a` (docs)

Both plan tasks landed in the single audit artifact (`106-SCRATCH-correctness.md`) and were committed together — the plan's `<output>` is one file, so one atomic content commit represents both sweeps. Task 1 (listener lifecycle: ledger + C-01..C-05) and Task 2 (error handling + legacy reads: C-06, C-07 + Notes) were both executed and verified against their acceptance criteria before commit.

**Plan metadata:** (this SUMMARY) committed separately.

## Files Created/Modified

- `.planning/phases/106-data-layer-audit-findings-report/106-SCRATCH-correctness.md` - AUDIT-04 correctness findings: 61-row listener ledger + 7 findings + clean-notes + scope/deferrals.

## Decisions Made

- **0 High is honest, not a miss.** D-08 rates listener leaks Medium; the audited user-facing write paths are well-guarded (proof-modal `saveProofUrl` try/catch+toast; `submitNewIssue` try/catch+toast; Gantt drag writes `.catch`+toast+revert) — no silent-write-failure-that-matters exists in the audited surface. The unguarded `JSON.parse` throws (breaks render) rather than showing wrong data → Medium.
- **Recorded CLEAN evidence explicitly** (write posture, guarded `suppliers.categories` Array.isArray reads, legacy-safe department fallbacks, detail-view re-init teardowns) so Plan 07/112 don't re-investigate.

## Deviations from Plan

None - plan executed exactly as written. Both tasks produced the single specified artifact; all acceptance-criteria grep checks pass (category:correctness=7≥4, severity:Medium=4≥1, ledger clean|flagged=61≥55, JSON.parse|items_json=6≥1, silent-write/error-handling=6≥1, handling=7≥4, target_phase/defer=10≥1).

## Issues Encountered

None. The inventory's anchor map made the audit surgical — no full-reads of the 9,549-line procurement.js / 6,851-line finance.js were needed; only init()/destroy()/handler regions around the cited anchors, plus router.js to resolve the tab-switch contract.

## Ownership / Scope Compliance

- Committed ONLY the deliverable (`106-SCRATCH-correctness.md`) + this SUMMARY. STATE.md / ROADMAP.md untouched (orchestrator-owned).
- Read-only audit: no `app/`, `scripts/`, or `firestore.rules` modified (verified via `git status`).
- No `gsd-sdk` invoked; plain `git` commits on branch `v4.2`.

## Next Phase Readiness

- `106-SCRATCH-correctness.md` is ready for **Plan 07** to merge C-01..C-07 into `106-FINDINGS.md` (re-ID to F-00N, ranked High→Low with the integrity/security-rules/efficiency findings).
- All 7 findings carry `handling: code-fix` and `target_phase: 112` — they flow directly onto the Phase 112 remediation list. Live verification of the flagged leaks (DevTools duplicate-listener counting after N tab switches) is the deferred Phase 112 task per D-04.

## Self-Check: PASSED

- FOUND: `.planning/phases/106-data-layer-audit-findings-report/106-SCRATCH-correctness.md` (209 lines)
- FOUND: `.planning/phases/106-data-layer-audit-findings-report/106-04-SUMMARY.md`
- FOUND: commit `11fc184a` (Task 1+2 scratch findings)
- All plan acceptance-criteria grep checks pass (see Deviations section).

---
*Phase: 106-data-layer-audit-findings-report*
*Completed: 2026-07-09*
