---
phase: 102-dlp-retention-management
plan: "02"
subsystem: project-detail
tags: [tranche-editor, collection-tranches, retention, financial-card, firestore]
dependency_graph:
  requires:
    - "102-01 (Phase 102 CSS block: .tranche-editor, .setup-cta, .tranche-display, etc.)"
  provides:
    - "app/views/project-detail.js renderTrancheDisplay + renderTrancheEditor (Plans 03+ read via trancheEditorHost)"
    - "app/views/project-detail.js saveTrancheEditor writing collection_tranches (Plan 03 reads is_retention at completion gate)"
  affects:
    - "app/views/project-detail.js (Financial card — Collection Tranches section injected)"
tech_stack:
  added: []
  patterns:
    - "Inline expand editor pattern (matching lifecycle-accordion precedent) — trancheEditorOpen state + renderTrancheEditorHost() in-place re-render"
    - "One-retention invariant: toggleTrancheRetention sets is_retention false on all rows except index i"
    - "100% + labels validation in saveTrancheEditor before Firestore write"
    - "window function register/delete symmetry enforced (7/7 in init/destroy)"
key_files:
  created: []
  modified:
    - path: "app/views/project-detail.js"
      change: "Added 9 editor functions + module state + Financial card injection + 7 window functions registered/deleted symmetrically"
decisions:
  - "renderTrancheEditorHost() added as in-place re-render helper called by all mutating editor functions — avoids full renderProjectDetail() re-render for editor interactions"
  - "toggleTrancheEditor uses _canAdvanceProjectStatus(project, user, 'On-going') as permission gate (same role predicate as other Phase 100 gate functions)"
  - "Edit Tranches button active class synced both in rendered HTML and live in renderTrancheEditorHost/cancelTrancheEditor via document.querySelector"
  - "saveTrancheEditor uses updateDoc with updated_at: serverTimestamp() — consistent with other project field writes; no DLP fields written (D-10)"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-10"
  tasks: 2
  files: 1
---

# Phase 102 Plan 02: Inline Tranche Editor Summary

**One-liner:** Inline collection-tranche editor in the project-detail Financial card — add/remove rows, label + percentage, live 100% total bar, one-retention Ret? toggle, Save writes collection_tranches only (no DLP fields).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Editor state + render/compute/save functions | 1a68b1b | app/views/project-detail.js |
| 2 | Wire editor host into Financial card + register window functions | 011b4b4 | app/views/project-detail.js |

## Verification

**Task 1 automated checks:**
- `node --check app/views/project-detail.js` exits 0
- All 9 function names present: renderTrancheEditor, renderTrancheDisplay, renderTrancheEditorHost, toggleTrancheEditor, addEditorTrancheRow, removeEditorTrancheRow, toggleTrancheRetention, recalcTrancheTotal, saveTrancheEditor, cancelTrancheEditor
- `saveTrancheEditor` body contains `updateDoc` writing `collection_tranches` and does NOT reference `dlp_months`, `dlp_start_date`, or `retention_percentage`
- `toggleTrancheRetention` sets is_retention false on all rows except index i (one-retention invariant)

**Task 2 automated checks:**
- `node --check app/views/project-detail.js` exits 0
- 7/7 window functions registered in init() AND deleted in destroy() (verify command: `OK 7/7 symmetric + host`)
- `#trancheEditorHost` container present in the Financial card render
- destroy() resets `editorTranches = []` and `trancheEditorOpen = false`

## Checkpoint Reached

**Type:** human-verify
**Status:** Awaiting browser UAT

## Deviations from Plan

None — plan executed exactly as written. The `renderTrancheEditorHost()` helper is called by all 5 mutating functions (toggle/add/remove/toggleRetention/cancel) as specified in Task 2.

## Known Stubs

None — editor fully wired. `saveTrancheEditor` writes to Firestore; `renderTrancheDisplay` reads from `currentProject.collection_tranches` (live via onSnapshot).

## Threat Flags

None — no new network endpoints, auth paths, or schema changes. `saveTrancheEditor` is gated by `_canAdvanceProjectStatus` (same permission predicate as existing Phase 100 gate functions). Writes only to the existing `projects` collection on a field already present in the schema (Phase 85).

## Self-Check: PASSED

- [x] `app/views/project-detail.js` modified — confirmed (commits 1a68b1b + 011b4b4)
- [x] Commit 1a68b1b exists — confirmed (Task 1)
- [x] Commit 011b4b4 exists — confirmed (Task 2)
- [x] `node --check` PASS — confirmed
- [x] 7/7 window functions symmetric — verified by node script
- [x] `#trancheEditorHost` present — verified
- [x] No DLP fields in saveTrancheEditor — verified
- [x] editorTranches/trancheEditorOpen reset in destroy() — verified
