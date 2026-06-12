---
phase: 102-dlp-retention-management
plan: "05"
subsystem: projects (portfolio table)
tags: [dlp, retention, portfolio, getDlpState, render-only]
dependency_graph:
  requires:
    - "102-01 (views.css tr.dlp-amber/red/green left-accent borders + .portfolio-dlp-tag base)"
    - "102-03 (getDlpState D-16 contract — mirrored here)"
  provides:
    - "app/views/projects.js getDlpState(project) — mirrored DLP state machine for the portfolio table"
    - "renderProjectsTable rows carry dlp-amber/dlp-red/dlp-green class + .portfolio-dlp-tag status tag"
  affects:
    - "app/views/projects.js (renderProjectsTable row map only)"
tech_stack:
  added: []
  patterns:
    - "Render-only DLP visuals — no new window functions, no new listener (existing projects onSnapshot re-renders on retention_released_at writes)"
    - "Plan-01-owned tr.dlp-* border selectors reused by appending the bare class to the existing <tr>; per-state tag tint colors inlined (projects.js must not edit views.css)"
key_files:
  created: []
  modified:
    - path: "app/views/projects.js"
      change: "getDlpState mirror + per-row dlpClass/dlpTag in renderProjectsTable (tr accent class + .portfolio-dlp-tag in the Status cell)"
decisions:
  - "DLP tag rendered as a second line under the status text (<div margin-top:4px>) so the existing status / (legacy) handling stays intact"
  - "Tag tint colors taken from Spike 036 portTag map (in-dlp #fef3c7/#92400e, expired #fee2e2/#991b1b, released #dcfce7/#166534)"
metrics:
  duration: "~5 minutes (code); checkpoint pending"
  completed: "2026-06-12 (code-complete)"
  tasks: 1 auto + 1 checkpoint
  files: 1
---

# Phase 102 Plan 05: Portfolio-Table 4-State DLP Visuals

**One-liner:** The projects portfolio table now surfaces the same DLP states as the detail page — a left-accent border (amber/red/green) plus a status tag (◑ In DLP / ⚠ Retention Overdue / ✓ Fully Collected) — derived by a mirrored `getDlpState`, so withheld retention is visible at the portfolio level, not only on the detail page.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Mirror getDlpState + apply DLP accent/tag to portfolio rows | `8886415` | app/views/projects.js |

## Verification

**Automated (all PASS):**
- `node --check app/views/projects.js` exits 0.
- `function getDlpState`, `getDlpState(project)`, `dlp-amber`/`dlp-red`/`dlp-green`, `portfolio-dlp-tag`, `In DLP`/`Retention Overdue`/`Fully Collected` all present.
- Window-function count unchanged (25) — render-only, no new handlers, no new listener.

## Checkpoint Reached (blocking, PENDING)

**human-verify — portfolio DLP UAT:** at `#/projects`, a Completed-in-DLP project shows amber accent + "◑ In DLP"; expired-DLP shows red + "⚠ Retention Overdue"; released shows green + "✓ Fully Collected"; On-going/non-DLP rows unchanged; recording a release on the detail page (Plan 04) flips the portfolio row green live. Resume signal: "approved".

## Deviations from Plan

- **getDlpState is NOT byte-identical to project-detail's current copy.** The plan specified a verbatim mirror of the Plan-03 D-16 four-branch contract, and that is what shipped. However, project-detail's `getDlpState` was amended **after** Plan 05 was written (commit `9229c21`, partially reverted by `5de6239` which kept the DLP fix) to add a 5th branch: `isRetentionCollected(project, collectibleDocs) → 'released'`. That branch needs per-project collectible payment records.
  - The portfolio table is **render-only and does not load collectible docs** (Plan 05 must-have: no new listener), so the auto-detect branch is **intentionally omitted**. The mirror honors `retention_released_at` (the canonical release signal set by Plan 04's Record Release) + DLP expiry.
  - **Edge-case impact:** a project whose retention tranche is fully collected via payments but where Finance has not yet clicked Record Release would read **released (green) on the detail page** but **in-dlp/expired (amber/red) in the portfolio** until the release is recorded. Resolved the moment Finance records the release. Flagged for the user; see "Open Question" below.
  - The `getDlpState` comment in projects.js documents this divergence explicitly.

## Open Question (for the user)

Accept the minor portfolio↔detail divergence above (recommended — Record Release is the canonical signal and reconciles both surfaces), **or** expand Plan 05 to load per-project collectible docs so the portfolio can also auto-detect collected-in-full retention as released (larger change; contradicts the no-listener must-have).

## Threat Flags

None. Render-only change to the `projects` portfolio table; no writes, no new collection, no new rules. All interpolated values escaped or static.

## Self-Check: PASSED (code) / PENDING (checkpoint)

- [x] `app/views/projects.js` modified — commit 8886415
- [x] `node --check` PASS
- [x] getDlpState mirrors the D-16 contract (divergence from project-detail's amended copy documented)
- [x] Portfolio rows get dlp-amber/red/green class + .portfolio-dlp-tag; active rows unchanged
- [x] No new window functions; no new listener
- [ ] Portfolio DLP browser UAT (human-verify checkpoint)
