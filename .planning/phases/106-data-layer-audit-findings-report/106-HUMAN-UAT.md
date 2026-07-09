---
status: partial
phase: 106-data-layer-audit-findings-report
source: [106-VERIFICATION.md, 106-01-SUMMARY.md]
started: 2026-07-09
updated: 2026-07-09
---

## Current Test

[awaiting human] Run the read-only prod data-pass to fill the measured numbers in `106-DATA-RESULTS.md`.

## Tests

### 1. Read-only prod data-pass (fills AUDIT-02 measured counts)
context: The extended `scripts/verify-integrity.js` (drift-across-chain check + `--project` flag) is built and verified read-only (`node --check` passes; zero write ops; RFP joined by business id, not `po_doc_id`/`tr_doc_id`). It could not be RUN during execution because no `serviceAccountKey.json` was present in the environment. `106-DATA-RESULTS.md` currently carries a `PROD RUN PENDING` banner; the static findings stand on code analysis, only the measured drift/orphan/collection counts are pending.
expected: With a Firebase service-account key in place, both runs complete without a fatal stack trace and produce JSON with `collections`, `summary`, `errors`, `warnings`, `info`, and `drift`.
steps:
  1. Place the prod key at `./serviceAccountKey.json` (and optionally a dev key at `./serviceAccountKey.dev.json`).
  2. Dev validation (proves the script runs against a real DB — dev may be sparse/stale, that's fine):
     `GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.dev.json node scripts/verify-integrity.js --project clmc-procurement-dev --json`
  3. Prod numbers (read-only, system of record):
     `node scripts/verify-integrity.js --json`
  4. Fill the PENDING sections of `106-DATA-RESULTS.md` from the prod output, and update the "pending live measurement" annotations on the integrity findings (F-001 drift, F-002/F-003 orphans, F-004 duplicate IDs, F-011 items_json, F-020 invalid-status) in `106-FINDINGS.md`.
result: [pending]
handling: run now if a key is available, OR defer to Phase 112 — Phase 112 (AUDIT-06/07 remediation) is already gated to run this data-pass before any backfill, so deferral is the designed path.

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

None in the findings report itself (verifier: 4/4 success criteria met, 6/6 spot-checked anchors real, 25→25 findings no drops). The single pending item is the credential-gated live data-pass above.
