---
phase: 102-dlp-retention-management
plan: "03"
subsystem: project-detail
tags: [dlp, retention, getDlpState, finance-bar, gate-4, completion, firestore]
dependency_graph:
  requires:
    - "102-01 (Phase 102 CSS: .finance-bar/.bar-seg/.dlp-strip/.coll-tag + state classes)"
    - "102-02 (collection_tranches editor + is_retention flag — DLP keys off the retention tranche)"
  provides:
    - "app/views/project-detail.js getDlpState(project) — single source of DLP display state (Plan 04 Record Release + Plan 05 portfolio read it)"
    - "app/views/project-detail.js computeDlpFields(startDateStr, months, contractCost, retentionPct) → {dlp_expires_at, retention_amount}"
    - "projects/{docId} DLP fields written at Gate 4: dlp_months, dlp_start_date, dlp_expires_at, retention_percentage, retention_amount, retention_released_at:null (Plan 04 sets retention_released_at)"
    - "app/views/project-detail.js renderDlpFinanceBar(project) — 4-state bar (Plan 04 injects Record Release into the expired strip's commented slot)"
  affects:
    - "app/views/project-detail.js (Info card, Financial card headline, buildLifecycleBody Gate-4 branch, lcMarkProjectComplete, renderTrancheLifecycleRows)"
tech_stack:
  added: []
  patterns:
    - "Single render-time state derivation (getDlpState) drives finance bar + tranche tag + info-card fields"
    - "Conditional Firestore payload — DLP keys written ONLY in the retention branch (Object.assign); no-retention completion keeps the original 3-key payload (D-14)"
    - "Inner finance-bar structure (header/track/labels) inlined in JS because Plan 01 CSS provides only the semantic classes; Plan 03 touches JS only"
key_files:
  created: []
  modified:
    - path: "app/views/project-detail.js"
      change: "getDlpState + computeDlpFields + renderDlpFinanceBar; Gate-4 DLP fieldset; extended lcMarkProjectComplete write; finance-bar headline render; retention-row DLP tag; info-card DLP Period/Expires cells"
decisions:
  - "getDlpState ported verbatim from the D-16 contract; added a leading !project guard for defensiveness (D-22)"
  - "DLP write uses Object.assign with an object literal (carries the literal retention_released_at: null) only when a retention tranche exists"
  - "Finance bar 'collected' sourced from currentCollectibleDocs non-voided payment_records (same formula as the existing Collectibles group) so the active-state utilization bar shows real data"
  - "Record Release button NOT added (Plan 04) — left a commented <!-- Plan 04: ... --> slot inside the expired strip per plan"
metrics:
  duration: "~12 minutes"
  completed: "2026-06-12"
  tasks: 3
  files: 1
---

# Phase 102 Plan 03: Gate-4 DLP Capture + 4-State DLP Display

**One-liner:** DLP terms captured at the Gate-4 "Mark Completed" flow (only when a retention tranche exists) and surfaced end-to-end via a single `getDlpState()` derivation — DLP-aware finance bar (blue/amber/red/green), retention-row In DLP/OVERDUE/Released tag, and info-card DLP Period/Expires.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | getDlpState + computeDlpFields + Gate-4 DLP fieldset + extended lcMarkProjectComplete write | `d8f186b` | app/views/project-detail.js |
| 2 | DLP-aware 4-state finance bar (renderDlpFinanceBar) + retention-row state tag | `22b4907` | app/views/project-detail.js |
| 3 | Info-card DLP Period + DLP Expires fields | `8e9dc23` | app/views/project-detail.js |

## Verification

**Automated (all PASS):**
- `node --check app/views/project-detail.js` exits 0.
- Task 1: `function getDlpState`, `function computeDlpFields`, `gateDlpRetPct`/`gateDlpMonths`/`gateDlpStart`, `dlp_expires_at`, `retention_amount`, literal `retention_released_at: null` all present.
- Task 2: `function renderDlpFinanceBar`, `state-amber`/`state-red`/`state-green`, `dlp-strip`, `tag-holding`/`tag-overdue`/`tag-released`, `days remaining`, `Plan 04` placeholder all present; `renderDlpFinanceBar(currentProject)` wired into the Financial card.
- Task 3: `DLP Period`, `DLP Expires`, `dlp_months`, `dlp_expires_at` present in the info card.
- Window-function register↔teardown symmetry unchanged from Plan 02 (Plan 03 added no `window.*` handlers — getDlpState/computeDlpFields/renderDlpFinanceBar are module-scope render helpers).

**getDlpState contract (D-16) — verbatim four branches:**
`active` (no dlp_months OR status !== Completed) → `released` (retention_released_at set) → `expired` (now > dlp_expires_at) → `in-dlp`.

## Checkpoint Reached

**Type:** human-verify (blocking — Plans 04/05 depend on Plan 03)
**Status:** Awaiting browser UAT — see 102-03-PLAN.md checkpoint (6 steps).

## Deviations from Plan

- Finance-bar inner structure (header / bar-track / bar-labels) inlined in JS rather than via CSS classes — Plan 01's CSS block intentionally shipped only the semantic state classes (`.finance-bar`, `.bar-seg`, `.dlp-strip`, `.coll-tag`) and Plan 03's scope is `app/views/project-detail.js` only (cannot edit views.css). The semantic/stateful coloring still uses the Plan 01 classes verbatim.
- `active`-state finance bar shows real collected utilization (from `currentCollectibleDocs`) rather than spike-hardcoded 65% — the spike values were illustrative.

## Known Stubs

- `released` state is rendered but unreachable until Plan 04 sets `retention_released_at` (Plan 03 writes it as `null`). The expired strip carries a commented Record-Release slot for Plan 04.

## Threat Flags

None new. Writes only to the existing `projects` collection. The Gate-4 write path is already gated by `_canAdvanceProjectStatus(..., 'Completed')` (unchanged). DLP fields are plain numbers/date-strings; all interpolated values escaped.

## Self-Check: PASSED

- [x] `app/views/project-detail.js` modified — commits d8f186b + 22b4907 + 8e9dc23
- [x] `node --check` PASS
- [x] getDlpState matches D-16 four-branch contract
- [x] DLP fields written ONLY in the retention branch; no-retention payload unchanged
- [x] 4-state bar + retention-row tag + info-card DLP fields render off getDlpState
- [x] Record Release button NOT added (Plan 04 placeholder slot present)
