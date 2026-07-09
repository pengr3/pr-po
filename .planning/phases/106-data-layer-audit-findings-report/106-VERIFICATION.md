---
phase: 106-data-layer-audit-findings-report
verified: 2026-07-09T14:30:46Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: initial verification
human_verification:
  - test: "Run the read-only prod data-pass with a Firebase service-account key: `node scripts/verify-integrity.js --project clmc-procurement-dev --json` (dev validation, D-05) then `node scripts/verify-integrity.js --json` (prod counts). Transcribe the measured `collections`, `errors`, `warnings`, `info`, and `drift` arrays into 106-DATA-RESULTS.md and flip the PROD-RUN-PENDING annotations in F-001 (drift), F-002/F-003 (orphans), F-004 (duplicate IDs), F-011 (items_json), F-020 (invalid-status)."
    expected: "Dev run completes without a stack trace (script valid against a real DB); prod run returns real collection counts + drift/orphan arrays. No numbers were invented — every measured-count citation in the report is currently annotated 'pending live measurement'."
    why_human: "Requires a Firebase service-account credential (serviceAccountKey.json / serviceAccountKey.dev.json) that is absent from this environment, plus live Firestore access to clmc-procurement(-dev). Cannot be performed programmatically. This is the outstanding `checkpoint:human-action` gate from Plan 106-01 Task 2 and completes AUDIT-02's live-data verification leg. Per D-04, live measurement of v4.0 collections is itself a Phase 112 task — the human may run the pass now or consciously defer it to Phase 112 before backfill scoping."
---

# Phase 106: Data-Layer Audit — Findings Report Verification Report

**Phase Goal:** Inventory and audit the entire Firestore SDK layer — every read, write, listener, and query across the views — and produce a single severity-ranked findings report, so data-layer issues are known and can guide the new UI before it is built on top.
**Verified:** 2026-07-09T14:30:46Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

The static findings report **exists, is complete, is code-accurate, and satisfies all four ROADMAP success criteria**. Every one of the 25 findings carries the full D-07 schema; all 25 dimension temp findings (7 I + 7 C + 9 E + 2 S) are traced into the report with zero drops; 6/6 spot-checked `file:line` anchors are REAL (zero hallucinations); the two headline inventory facts (`runTransaction=0`, `where 182 vs limit 12`) match the live codebase exactly. The report-only constraint held — the only non-`.planning/` file touched in the whole phase is `scripts/verify-integrity.js` (read-only, zero write ops).

**Status is `human_needed`, not `passed`,** solely because one legitimate, credential-gated human-action item is outstanding: the read-only prod data-pass (`106-DATA-RESULTS.md`, PROD RUN PENDING) that supplies AUDIT-02's *measured* drift/orphan/collection counts. It is honestly documented as pending (no `serviceAccountKey.json` in the environment), invents no numbers, and is owned by the outstanding Plan 106-01 `checkpoint:human-action` + Phase 112. This surfaces the gate for a human decision rather than burying it — it is **not** a deficiency in the report itself.

### Observable Truths (ROADMAP Success Criteria — the contract)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | A findings report exists inventorying every Firestore read/write/listener/query across the views, each tagged High/Medium/Low | ✓ VERIFIED | `106-FINDINGS.md` (56 KB): 25 findings ranked **5 High · 14 Medium · 6 Low**; Inventory Summary with per-op call-site totals (getDoc 54 · getDocs 136 · onSnapshot 61 · addDoc 35 · updateDoc 137 · deleteDoc 28 · writeBatch 18 · where 182 · limit 12). Backed by `106-INVENTORY.md` (949 anchors, Per-Operation Totals + Per-Collection Access Map). Surface reconciles exactly: 35 Firestore-consuming files + 5 zero-access + firebase.js config = 41 app JS files (verified) |
| 2 | Report flags integrity issues — denorm drift (project_code/name/department across MRFs·PRs·POs·TRs·RFPs), orphaned refs, status-derivation errors | ✓ VERIFIED (static) · live counts PENDING | Drift: **F-001** (High). Orphans: **F-002** (MRF-delete orphans RFPs — anchor verified `procurement.js:3709-3720`), **F-003**, **F-007**. Status-derivation/casing: **F-020**. ID-race: **F-004**. Supplier drift: **F-006**. Static analysis complete + code-anchored; *measured* live counts are the pending human-action item (documented, not fabricated) |
| 3 | Report states, per collection, whether security rules match actual access, calling out over/under-permissioning | ✓ VERIFIED | `106-SCRATCH-security.md` 51-row per-collection rule-vs-access reconciliation table. **F-005** over-perm (invitation_codes public read+update — anchor verified `firestore.rules:185/191`), **F-019** under-perm (edit_history create-gate excludes assigned users — anchor verified `firestore.rules:268`). Inventory notes clean 1:1 collection↔rule surface (28 collections / 33 match blocks) |
| 4 | Report lists correctness issues (listener leaks, missing error handling, legacy-unsafe reads) and efficiency issues (N+1, redundant reads/listeners, client-side filtering, caching) | ✓ VERIFIED | Correctness: **F-008/F-009/F-010** listener leaks (anchor verified `finance.js:5287`), **F-011** unguarded JSON.parse, **F-021** missing onSnapshot error cb, **F-022/F-023**. Efficiency: **F-012** unbounded listeners (where-vs-limit), **F-013** N+1 (anchor verified `mrf-records.js:1414`), **F-014/F-015/F-016/F-017/F-018** N+1/client-filter/max-scan/redundant/fetch-to-count, **F-024/F-025** caching |

**Score: 4/4 truths verified.** All four ROADMAP success criteria are satisfied by the static report. The one open item is a human-action follow-up (SC2's live-data leg), not a failed truth.

### Cross-Cutting / Structural Must-Haves (plan frontmatter, verified as supporting evidence)

| Must-have | Status | Evidence |
| --- | --- | --- |
| Single severity-ranked report ordered High→Low, category-tagged (D-06) | ✓ VERIFIED | Severity sequence: 5 High, 14 Medium, 6 Low — monotonic High→Low |
| Top summary-table index (ID·severity·category·collection·one-line) Phase 112 consumes (D-06) | ✓ VERIFIED | 25-row summary table at top; distribution line 5H/14M/6L |
| Every finding has stable F-00N id + full D-07 schema (severity/category/collection/anchor/impact/recommendation/handling/target_phase) | ✓ VERIFIED | All 25 blocks: 25× each of severity, category, collection, anchor, impact, recommendation, handling, target_phase |
| Every temp finding (I-/C-/E-/S-) merged with `was:` trace, no drops (expected 25 = 7+7+9+2) | ✓ VERIFIED | 25 `was:` traces = I-01..07, C-01..07, E-01..09, S-01..02; each scratch file independently contains exactly its temp IDs; 25→25, 0 dropped |
| Inventory summary + data-pass section present in report (D-03) | ✓ VERIFIED | § Inventory Summary + § Data-Pass Results (PROD RUN PENDING) both present |
| verify-integrity.js extended read-only with checkDenormDrift + --project (D-02/D-05) | ✓ VERIFIED | `checkDenormDrift` present, `--project` flag present, **0 write ops**, `node --check` passes |
| Audit is read-only — no fixes, no prod writes (Phase 112 owns remediation) | ✓ VERIFIED | Only non-`.planning/` file touched in phase = `scripts/verify-integrity.js`; **no `app/` source, no `firestore.rules`** modified (git-confirmed since roadmap commit b4cb8f05) |
| Report cites *measured* drift/orphan counts from 106-DATA-RESULTS.md | ⚠ PARTIAL (human-action) | Data-pass is PROD RUN PENDING (no service-account key); counts annotated "pending live measurement", none invented. This is the human_verification item |

### Anchor Spot-Verification (anti-hallucination — 6 anchors across 4 dimensions)

| Finding | Dimension | Anchor claimed | Codebase reality | Verdict |
| --- | --- | --- | --- | --- |
| F-005 | security | `firestore.rules:185` `allow read: if true` · `:191` `allow update: if true` (invitation_codes) | Exact match — both lines present under `match /invitation_codes/`, with ACCEPTED-RISK comments | ✓ REAL |
| F-004/F-016 | integrity/efficiency | `app/utils.js:229-254` `generateSequentialId` max-scan, no transaction | Exact — `getDocs(collection(...))` @232, `let maxNum=0` + `forEach` + `maxNum+1`, zero runTransaction | ✓ REAL |
| F-008 | correctness | `finance.js:5287` onSnapshot leak site | Exact — `const prListener = onSnapshot(prQuery, ...)` @5287 | ✓ REAL |
| F-013 | efficiency | `mrf-records.js:1414` per-row N+1 `getDocs` | Exact — `await getDocs(prQuery)` with `where('mrf_id','==',mrf.mrf_id)` inside per-MRF loop | ✓ REAL |
| F-002 | integrity | `procurement.js:3709-3720` MRF hard-delete cascade (PR/PO/TR then MRF, no RFP delete) | Exact — deletes prs@3710, pos@3713, trs@3716, mrf@3720; no `rfps` delete | ✓ REAL |
| F-019 | security | `firestore.rules:268` edit_history create-gate excludes operations_user/services_user | Exact — `allow create: if hasRole(['super_admin','operations_admin','services_admin','finance'])` | ✓ REAL |

**Result: 6/6 anchors REAL · 0 hallucinated.** Headline inventory facts independently confirmed by direct grep on `app/`: `runTransaction=0` (exact), `where=182` (exact), `limit=12` (exact, all 12 on notifications/journal), `deleteDoc=28` (exact). Minor call-site totals (onSnapshot 61 vs raw 63; getDocs 136 vs raw 139) are the report's conservative substring→call-site de-duplications — immaterial to any finding.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `106-FINDINGS.md` | Single ranked report, 25 findings, D-07 schema, summary index (AUDIT-01 deliverable) | ✓ VERIFIED | 56 KB; 25 findings F-001..F-025; complete schema; reconciliation table |
| `106-INVENTORY.md` | file:line SDK call-site inventory (AUDIT-01) | ✓ VERIFIED | 952 `.js:NN` anchors; Per-Operation Totals; runTransaction=0 lead |
| `106-SCRATCH-integrity.md` | I-0N integrity findings + coverage ledger (AUDIT-02) | ✓ VERIFIED | I-01..I-07 present; denorm/orphan/status/ID-race; ledger present |
| `106-SCRATCH-correctness.md` | C-0N correctness findings + listener ledger (AUDIT-04) | ✓ VERIFIED | C-01..C-07 present; ledger present |
| `106-SCRATCH-efficiency.md` | E-0N efficiency findings + getDocs ledger (AUDIT-05) | ✓ VERIFIED | E-01..E-09 present; 136-site ledger present |
| `106-SCRATCH-security.md` | S-0N findings + rule-vs-access table (AUDIT-03) | ✓ VERIFIED | S-01..S-02; 51-row reconciliation table |
| `106-DATA-RESULTS.md` | read-only data-pass numbers (AUDIT-02) | ⚠ PENDING (documented) | PROD RUN PENDING banner; captures real credential-error evidence; "How to fill this in" commands; no numbers invented |
| `scripts/verify-integrity.js` | checkDenormDrift + --project, read-only | ✓ VERIFIED | checkDenormDrift + --project present; 0 write ops; node --check OK |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| 4 dimension scratches | 106-FINDINGS.md | I-/C-/E-/S- temp IDs → F-00N via `was:` trace | ✓ WIRED | 25 temp IDs all traced; 25→25, 0 dropped, bidirectional reconciliation |
| 106-INVENTORY.md | Plans 03-06 | file:line anchors reused by dimension audits | ✓ WIRED | Findings cite inventory anchors (949); headline leads (runTransaction=0, where/limit) drive F-004/F-012/F-016 |
| 106-FINDINGS.md summary table | Phase 112 (AUDIT-06/07) | stable F-00N + handling + target_phase | ✓ WIRED | Hand-off section: F-001..F-019 remediation queue; F-020/F-024/F-025 deferral; all target_phase:112 |
| 106-DATA-RESULTS.md | 106-FINDINGS.md integrity findings | measured counts feeding F-001/F-002/F-003 | ⚠ PARTIAL | Wiring present (annotations reference the pending sections) but counts unmeasured — the human-action item |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| AUDIT-01 | 02, 07 | Inventory + severity-ranked findings report | ✓ SATISFIED | 106-INVENTORY.md (949 anchors) + 106-FINDINGS.md (25 ranked findings) |
| AUDIT-02 | 01, 03 | Integrity: denorm consistency, orphans, status-derivation verified | ⚠ SATISFIED (static) / PENDING (live) | F-001/F-002/F-003/F-004/F-006/F-007/F-020 code-anchored; measured live counts pending human data-pass |
| AUDIT-03 | 06 | Security-rule coverage vs actual access; over/under-permissioning | ✓ SATISFIED | 51-row reconciliation table; F-005 (over-perm), F-019 (under-perm) — both anchors verified |
| AUDIT-04 | 04 | Correctness: listener lifecycle, error handling, legacy-safe reads | ✓ SATISFIED | F-008..F-011, F-021..F-023; onSnapshot leak anchor verified |
| AUDIT-05 | 05 | Efficiency: N+1, redundant listeners/reads, client-side filtering, caching | ✓ SATISFIED | F-012..F-018, F-024/F-025; N+1 anchor verified |

No orphaned requirements — all of AUDIT-01..05 are claimed by phase-106 plans and mapped to Phase 106 in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| 106-DATA-RESULTS.md / 106-FINDINGS.md § Data-Pass | multiple | `PENDING` placeholders / no measured counts | ℹ️ Info (not a stub) | Intentional, explicitly-labelled, credential-blocked gap — per Step 7 stub-classification this is NOT a silent stub (no data flows to UI; owned by 106-01 checkpoint + Phase 112). Correctly surfaced as the human-action item |

No blocker anti-patterns. No fabricated data. No orphaned/hallucinated findings.

### Human Verification Required

**1. Run the read-only prod data-pass (completes AUDIT-02's live-data leg)**

- **Test:** With a Firebase service-account key, run `node scripts/verify-integrity.js --project clmc-procurement-dev --json` (dev validation, D-05), then `node scripts/verify-integrity.js --json` (prod). Transcribe the `collections` counts and the `errors`/`warnings`/`info`/`drift` arrays into `106-DATA-RESULTS.md`, then flip the "pending live measurement" annotations in **F-001** (drift), **F-002/F-003** (orphans), **F-004** (duplicate IDs), **F-011** (items_json), **F-020** (invalid-status).
- **Expected:** Dev run completes without a stack trace (script proven valid against a real DB); prod run returns real counts. The script is read-only (`.get()` only, 0 writes — verified) so it is safe against production.
- **Why human:** Requires a service-account credential absent from this environment + live Firestore access — not performable programmatically. This is the outstanding Plan 106-01 Task 2 `checkpoint:human-action`. **Decision for the human:** run it now to close AUDIT-02 fully, or consciously accept deferral to Phase 112 (which is already gated to run this pass first before backfill scoping; per D-04 the v4.0-collection live sweep is itself a Phase 112 task).

### Gaps Summary

**No gaps in the report itself.** The findings report is complete, code-accurate, and non-fabricated: all 4 ROADMAP success criteria met, 25/25 findings with full D-07 schema, 0 dropped temp findings, 6/6 spot-checked anchors real, headline inventory counts exact against the codebase, and the report-only constraint held (no `app/` or `firestore.rules` edits). 

The single outstanding item is the **credentialed read-only prod data-pass** that supplies AUDIT-02's *measured* drift/orphan/collection counts. It is honestly documented as PROD RUN PENDING (no service-account key in the environment), invents no numbers, and is owned by the outstanding 106-01 checkpoint + Phase 112. Because this is a genuine, external, human-only action that partially completes AUDIT-02's "verified" claim, status is **human_needed** — surfacing the gate for a human to run-or-defer, not a failure of the phase deliverable.

---

_Verified: 2026-07-09T14:30:46Z_
_Verifier: Claude (gsd-verifier)_
