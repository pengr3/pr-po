---
phase: 106-data-layer-audit-findings-report
plan: 05
subsystem: database
tags: [firestore, efficiency-audit, n+1, missing-limit, client-side-filter, caching, static-audit]

# Dependency graph
requires:
  - phase: 106 (Plan 02)
    provides: 106-INVENTORY.md — 949-anchor file:line SDK call-site index (136 getDocs, 61 onSnapshot, where 182 vs limit 12)
provides:
  - 106-SCRATCH-efficiency.md — 9 efficiency findings (E-01..E-09) in canonical D-07 schema
  - Exhaustive coverage ledger: all 136 getDocs read-sites classified clean/flagged (97 clean, 39 flagged)
  - Headline where(182)-vs-limit(12) imbalance evidenced with ~17 unbounded whole-collection listener anchors
affects: [106-07 (FINDINGS merge/re-ID to F-00N), 112 (AUDIT-06/07 remediation)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Canonical D-07 finding schema (id/severity/category/collection/anchor/impact/recommendation/handling/target_phase) with E- tempid prefix"
    - "Coverage ledger as exhaustiveness gate: one row per read-site, clean/flagged verdict proves whole-surface examination"

key-files:
  created:
    - .planning/phases/106-data-layer-audit-findings-report/106-SCRATCH-efficiency.md
  modified: []

key-decisions:
  - "Efficiency findings capped at Medium/Low per D-08 — none rated High"
  - "Consolidated to E-01..E-09 to honor the frontmatter E-0[0-9] key-link pattern"
  - "getDocs coverage ledger holds all 136 read-sites; onSnapshot listeners audited in E-01/E-06 finding blocks (not duplicated in ledger)"

patterns-established:
  - "Batched where('id','in',chunk) (finance.js:5323/5378, project-detail.js:1985) cited as the canonical fix for N+1 fan-outs"
  - "getAggregateFromServer(count()) cited as the fix for fetch-to-count read sites"

requirements-completed: [AUDIT-05]

# Metrics
duration: 22min
completed: 2026-07-09
---

# Phase 106 Plan 05: Efficiency Dimension Audit (AUDIT-05) Summary

**Static efficiency audit of the whole app/ Firestore layer — 9 findings (E-01..E-09) surfacing ~17 unbounded whole-collection listeners (the where 182-vs-limit 12 imbalance), N+1 per-row fan-outs, whole-collection ID max-scans, redundant listeners, fetch-to-count, and caching gaps — backed by an exhaustive 136-site getDocs coverage ledger (97 clean / 39 flagged).**

## Performance

- **Duration:** ~22 min
- **Completed:** 2026-07-09
- **Tasks:** 2 (both sweeps landed in one cohesive scratch artifact)
- **Files modified:** 1 created (deliverable) + 1 SUMMARY

## Accomplishments

- **E-01 (headline):** Evidenced the `106-INVENTORY.md` where(182)-vs-limit(12) imbalance — all 12 `limit()` calls sit on notifications/journal; **zero** of ~17 whole-collection business `onSnapshot` listeners are bounded. Each listener anchored (finance/procurement/projects/services/assignments/clients/home/user-management) in a supporting table.
- **N+1 (E-02, E-03):** Confirmed by reading the loop bodies — per-MRF PR/PO/TR fan-outs in the mrf-records `pageItems.map` (@1388), procurement records builder (@5758) and CSV export (@~5590), finance per-project/per-service scoreboards (@4476/4726), and per-PO/per-TR RFP payment checks in `cancelMRFPRs` (@962/974/1004). Fix cited: the batched `where('id','in',chunk)` pattern the code already uses at finance.js:5323/5378.
- **Whole-collection scans (E-04, E-05):** Client-side scope-filter/pagination over whole mrfs/pos (`loadPRPORecords` 5358+filter@5395, 5399+filter@5414; mrf-records status query @1167), and ID max-scans reading the entire pos/prs/TR collection per create (finance.js:6227; procurement.js:6782/7115/7221) — the read-cost sibling of the Plan 03 `runTransaction=0` race.
- **Redundant/caching (E-06, E-07, E-08, E-09):** `projects` subscribed whole from 4 modules, `clients` from 3, etc.; fetch-to-count via `.then(s=>s.size)` where `getAggregateFromServer(count())` exists; near-static suppliers/projects/services/clients/role_templates re-read per view (Low).
- **Coverage ledger:** All **136** getDocs read-sites enumerated with a clean/flagged verdict — cross-checked against the inventory (136 unique anchors, 0 missing, 0 stray). Proves every read was examined for N+1 / client-side-filtering, not just a sample.

## Task Commits

1. **Task 1 (N+1 + client-side filtering + coverage ledger) & Task 2 (redundant listeners + caching)** — `59519106` (docs)
   - Both plan tasks co-author the single `106-SCRATCH-efficiency.md` deliverable (findings E-01..E-09 are interleaved with the ledger), so they landed in one atomic artifact commit rather than being artificially split across a single indivisible markdown file.

**Plan metadata:** _(this SUMMARY)_ — `docs(106-05): complete efficiency audit plan`

## Files Created/Modified

- `.planning/phases/106-data-layer-audit-findings-report/106-SCRATCH-efficiency.md` — 9 efficiency findings in canonical D-07 schema + 136-row getDocs coverage ledger + v4.0 static-coverage note.

## Verification (acceptance criteria — all pass)

- `category: efficiency` = **9** (>= 2 and >= 4 ✓)
- `N+1|client-side|filter|limit()` = 40 (>= 2 ✓)
- where(182)-vs-limit(12) imbalance cited with anchors ✓ (E-01)
- every finding block has an `anchor:` line with a `.js:` ref = 9 ✓
- coverage ledger `| clean |`/`| flagged |` rows = **136** (>= 100 ✓); ledger anchors == inventory getDocs anchors (136/136, 0 diff)
- `redundant|cache|caching` = 16 (>= 2 ✓); `severity: Low` = 2 (>= 1 ✓)
- `handling: (code-fix|backfill-script|defer)` = 9 (>= 4 ✓); `target_phase: 112|defer` = 15 (>= 1 ✓)

## Decisions Made

- **No High-severity efficiency findings** — capped at Medium/Low per D-08. Medium: E-01..E-07 (N+1, missing limit, client-side filter, redundant listeners, fetch-to-count). Low: E-08/E-09 (caching / scale-only), set `handling: defer` so they flow onto the AUDIT-06 deferral list; Medium set `handling: code-fix, target_phase: 112`.
- **Ledger scope = getDocs only** (per the plan's Task 1 instruction "one row per getDocs call-site"). The unbounded `onSnapshot` listeners are anchored inside E-01/E-06 finding blocks (with a supporting table), not duplicated as ledger rows.
- **Finding IDs consolidated to E-01..E-09** to satisfy the plan frontmatter `key_links` pattern `E-0[0-9]` (single-digit); the "fetch-to-count" and "additional whole scans" candidates were folded into E-07 and E-04 respectively rather than spilling to E-10.

## Deviations from Plan

None - plan executed exactly as written. Read-only audit: no app/, scripts/, or firestore.rules source modified; STATE.md / ROADMAP.md untouched (orchestrator-owned).

## Issues Encountered

- `106-INVENTORY.md` exceeds the Read token cap; navigated via Grep to locate the `getDocs`/`where`/`limit`/`orderBy` section offsets and read them in targeted windows instead of full-reading the 1,221-line file. No impact on coverage — all 136 getDocs anchors captured and cross-checked.

## Next Phase Readiness

- **Plan 07 (106-FINDINGS.md):** E-01..E-09 ready to merge and re-ID to `F-00N` by severity; summary table at top of the scratch doubles as the merge index.
- **Phase 112 (AUDIT-06/07):** Medium findings carry `handling: code-fix, target_phase: 112` with concrete fix directions and anchors; Low caching findings (`handling: defer`) pre-seed the deferral list. Live per-volume measurement of v4.0 collection read costs remains a Phase 112 task (D-04).
- No blockers.

## Self-Check: PASSED

- FOUND: `106-SCRATCH-efficiency.md`
- FOUND: `106-05-SUMMARY.md`
- FOUND commit: `59519106`
- Ledger cross-check: 136/136 getDocs anchors match inventory (0 missing, 0 stray)

---
*Phase: 106-data-layer-audit-findings-report*
*Completed: 2026-07-09*
