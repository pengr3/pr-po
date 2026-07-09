---
phase: 106-data-layer-audit-findings-report
plan: 03
subsystem: database
tags: [firestore, integrity, denormalization, drift, orphans, cascade, sequential-id, race-condition, static-audit, audit-02]

# Dependency graph
requires:
  - phase: 106-01 (data pass)
    provides: "verify-integrity.js drift-across-chain check + 106-DATA-RESULTS.md scaffold (drift counts pending)"
  - phase: 106-02 (inventory)
    provides: "106-INVENTORY.md — 949-anchor SDK call-site index (the write/delete anchor map this plan judges)"
provides:
  - "106-SCRATCH-integrity.md — 7 integrity findings (I-01..I-07) in the canonical D-07 schema"
  - "Coverage ledger: 72 denorm-write + delete/cascade sites classified clean/flagged"
affects: [106-07-findings-report, 112-remediation-backfill]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static integrity audit: judge inventory write/delete anchors for drift/orphan/race, not re-scan"
    - "Coverage ledger as exhaustiveness gate — one clean/flagged row per integrity-relevant site"

key-files:
  created:
    - .planning/phases/106-data-layer-audit-findings-report/106-SCRATCH-integrity.md
  modified: []

key-decisions:
  - "Split the drift domain into I-01 (project/service identity chain) + I-02 (supplier_name) so Task 1 carries two integrity findings"
  - "project_code/department noted as low residual (locked field + stable-by-construction); project_name/service_name are the live High drift vector"
  - "Derived status (overallStatus, task rollups) verdicted CLEAN — render-only, never persisted, so no stored-vs-derived disagreement"
  - "v4.0 collections covered statically; live drift/orphan measurement deferred to Phase 112 (D-04)"

patterns-established:
  - "Exhaustive coverage ledger proves the whole write/delete surface was examined, not only flagged leads"
  - "Every finding anchored to file.js:line (T-106-06) so Phase 112 can locate and act"

requirements-completed: []  # AUDIT-02 is the phase-level requirement; this plan delivers the CODE-side integrity findings but AUDIT-02 also needs Plan 01's live data numbers (PROD-RUN-PENDING) — Plan 07 marks completion.

# Metrics
duration: ~4min
completed: 2026-07-09
---

# Phase 106 Plan 03: INTEGRITY Dimension Audit (AUDIT-02) Summary

**Static integrity audit of the whole Firestore write/delete surface — 7 findings (4 High, 2 Medium, 1 Low): chain-wide denormalized-identity drift with no rename back-propagation, MRF-delete and project/service/client-delete cascades that orphan RFPs + subcollections, the confirmed sequential-ID max-scan race (runTransaction=0), plus a latent dual status-casing convention — all anchored to file:line and backed by a 72-site coverage ledger.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-09T13:14:12Z
- **Completed:** 2026-07-09T13:18:08Z
- **Tasks:** 2 of 2 `auto` tasks executed
- **Files modified:** 1 created (the scratch findings file)

## Accomplishments
- **I-01 (High) denormalized identity drift:** traced `project_code`/`project_name`/`department`/`service_*` copied forward MRF→PR→PO→TR→RFP (each downstream write reads the previous doc, never the source), and proved the edit paths (`saveField` project-detail.js:1722-1724 + list-edit modals) write **only the source doc** — zero back-propagation → chain-wide rename drift.
- **I-02 (Medium):** supplier_name denorm on POs/TRs drifts on rename (procurement.js:5217) and dangles on unguarded delete (procurement.js:5251).
- **I-03 (High):** both MRF-delete cascades (hard procurement.js:3709-3720, soft 4818-4858) delete PR/PO/TR but never the RFPs referencing them → orphaned RFP payables.
- **I-04 (High):** project/service/client deletes (project-detail.js:1925, projects.js:1470, services.js:1532, clients.js:664) are bare single-doc deletes — children AND the 6 Firestore subcollections orphan (Firestore does not recurse).
- **I-05 (High):** sequential-ID race recorded — every generator max-scans + `addDoc` with `runTransaction=0`; proposal-id.js:8 / utils.js:266 document it as "accepted."
- **I-06 (Medium):** PR-cancel cascade leaves TR-linked RFPs + unawaited `forEach(async…)` deletes. **I-07 (Low):** dual status-casing convention (chain Capitalized vs billing_requests/users lowercase) + undocumented MRF status enum.
- **Coverage ledger:** 72 sites (23 denorm/edit + 28 deleteDoc + 18 writeBatch + supplier rows) each verdicted — 33 flagged / 39 clean — proving exhaustive-depth examination (D-09).

## Task Commits

Each task was committed atomically with plain git (no gsd-sdk, per runtime constraints):

1. **Task 1: Trace denormalized-field drift write paths** - `abbd373b` (docs) — I-01, I-02
2. **Task 2: Orphan/status/ID-race findings + coverage ledger** - `9e97b456` (docs) — I-03..I-07 + ledger

_Plan-metadata / STATE / ROADMAP commit intentionally NOT made — orchestrator owns those (ownership rules)._

## Files Created/Modified
- `.planning/phases/106-data-layer-audit-findings-report/106-SCRATCH-integrity.md` (226 lines) — 7 integrity findings in the canonical D-07 schema (severity per D-08), a 72-row coverage ledger, and a v4.0 static-coverage + Phase 112 hand-off note. No app/scripts/rules source touched (read-only audit).

## Decisions Made
- **Two drift findings, not one:** split the denorm domain into I-01 (project/service identity, the chain spine) and I-02 (supplier_name, a label join key) so Task 1 satisfies its ≥2-integrity-finding gate and the two mechanisms get distinct handling (backfill-script vs code-fix).
- **Severity calibration (D-08):** project_name/service_name rename drift = High (misrepresents a live record); project_code/department = Low residual (locked field + stable-by-construction) folded into I-01's note. Unpaid-only orphaned RFPs on PR-cancel = Medium (paid RFPs blocked by the existing guard). Status-casing = Low (internally consistent today, latent only).
- **Derived status is CLEAN:** `overallStatus` (finance.js:1057) and task rollups are render-only/never-persisted — the safe pattern — so no stored-vs-derived finding; recorded as a clean observation inside I-07.
- **Cross-refs to Plan 01 marked `(pending 106-DATA-RESULTS.md)`:** the live drift/invalid-status counts are PROD-RUN-PENDING; findings cite the mechanism, never an un-run number.

## Deviations from Plan

None - plan executed exactly as written. Both tasks produced the specified I-0N findings in the D-07 schema with the coverage ledger; all acceptance-criteria greps pass (see Issues Encountered for the verification numbers). No app/scripts/rules source was modified (read-only audit, per ownership rules). STATE.md / ROADMAP.md left untouched (orchestrator-owned).

## Issues Encountered
None. All acceptance-criteria checks pass on the final file:
- Task 1: `category: integrity` = 2 (≥2), `handling:` field = 2 (≥2), names denorm field + anchor ✓, references rename→no-back-propagation ✓.
- Task 2: `runTransaction|race` = 5 (≥1), `orphan` = 25 (≥1), `severity: High` = 4 (≥1), `category: integrity` = 7 total (≥4), `target_phase: 112|defer` = 14 (≥1), ledger `clean|flagged` verdict rows = 75 (≥25), all 7 findings carry a `.js:` anchor line.

## Next Phase Readiness
- **For Plan 07 (`106-FINDINGS.md`):** I-01..I-07 are ready to renumber to F-00N by severity (4 High → 2 Medium → 1 Low). All carry stable handling (I-01 backfill-script; I-02/03/04/05/06 code-fix; I-07 defer) and `target_phase: 112`.
- **For Phase 112 (remediation):** every mechanism is anchored to file:line. Live drift/orphan *measurement* for v4.0 collections remains deferred (D-04), and Plan 01's `106-DATA-RESULTS.md` numbers are still PROD-RUN-PENDING — Plan 07 must not cite them until that run lands.
- **No STATE.md / ROADMAP.md / REQUIREMENTS.md updates** were made here (orchestrator-owned).

## Self-Check: PASSED

- FOUND: `.planning/phases/106-data-layer-audit-findings-report/106-SCRATCH-integrity.md`
- FOUND commit: `abbd373b` (Task 1, docs)
- FOUND commit: `9e97b456` (Task 2, docs)
- Findings: 7 total (4 High, 2 Medium, 1 Low), all `category: integrity`, all anchored
- Coverage ledger present with 72 site rows; ID-race recorded as High (I-05)
- No app/ scripts/ firestore.rules modified; STATE.md / ROADMAP.md untouched

---
*Phase: 106-data-layer-audit-findings-report*
*Completed: 2026-07-09*
