---
phase: 85-collectibles-tracking
plan: 03
subsystem: projects-view-tranche-editor
tags: [collectibles, tranches, projects, finance, billing, audit-trail]
type: execute-summary
wave: 2
depends_on: [02]
requirements: [COLL-01, COLL-09]
dependency_graph:
  requires:
    - app/tranche-builder.js (Plan 02 — 5 named exports: renderTrancheBuilder, readTranchesFromDOM, addTranche, removeTranche, recalculateTranches)
  provides:
    - "projects.collection_tranches: [{label, percentage}, ...] persisted on every project doc (always-written, [] when empty)"
    - "Add/Edit Project form has tranche editor below Contract Cost"
    - "D-25 existing-collectibles confirmation guard on tranche edits"
    - "edit-history records collection_tranches diffs"
  affects:
    - app/views/projects.js (75-line net addition across imports, render(), init(), destroy(), addProject(), editProject(), saveEdit())
tech_stack:
  added: []
  patterns:
    - shared-module-import (existing pattern, Phase 65/85 alignment)
    - read-modify-write-with-validation (Phase 65 D-09/D-25 mirror)
    - field-diff audit logging via recordEditHistory (existing Phase 80 pattern)
    - shared window functions across views (procurement.js + projects.js coexist on same names — same DOM contract)
key_files:
  created: []
  modified:
    - app/views/projects.js
decisions:
  - "Validation block placed BEFORE showLoading(true) in both addProject and saveEdit so the loader is never toggled for client-side validation failures (small structural deviation from plan's literal showLoading(false) calls)"
  - "Window functions (window.addTranche / removeTranche / recalculateTranches) are shared with procurement.js Phase 65 PO tranche-builder. Both views attach/detach the same names. The shared module's DOM contract (id=trancheBuilder_<scopeKey>) matches procurement's existing markup, so calls from procurement HTML still resolve correctly when projects view has overwritten the global. Lifecycle is shared: whichever view destroys last wins."
  - "D-25 existing-collectibles query is coded but is a no-op in production today: the collectibles collection has zero documents until Plan 06 ships. Forward-compatible — when first collectibles are written by Plan 05, the guard activates automatically without code changes here."
metrics:
  duration_minutes: 12
  tasks_completed: 2
  files_modified: 1
  lines_added: 98
  lines_removed: 2
  completed_date: 2026-05-02
---

# Phase 85 Plan 03: Projects View — collection_tranches Editor Summary

Wired the Plan 02 shared tranche-builder into the Projects view's Add/Edit form. Persists `collection_tranches: [{label, percentage}, ...]` on every projects doc (always-written, `[]` when empty for shape consistency), validates sum=100% (±0.01 tolerance) + non-empty labels on save, fires D-25 confirmation modal when tranches change against a project that already has existing collectibles, and records the diff in the edit-history audit trail.

## What Shipped

### Task 1: Tranche-builder UI scaffolding (commit `0a6c391`)
- **Import** added at line 10 of `app/views/projects.js`: `import { renderTrancheBuilder, readTranchesFromDOM, addTranche, removeTranche, recalculateTranches } from '../tranche-builder.js';`
- **State variable** at line 18: `let editingProjectTranches = [];` — populated from `project.collection_tranches` when entering edit mode; reset on destroy.
- **Form-group** inserted at lines 159–165 (between Contract Cost line 154 and Personnel line 168): wrapper `<div id="collTrancheBuilderWrapper">${renderTrancheBuilder([], 'projectForm')}</div>` plus a `form-hint` explaining sum=100% requirement and Phase 85 collectibles dependency.
- **Window functions** attached at lines 75–78 in `attachWindowFunctions()` (called from `init()`): `window.addTranche`, `window.removeTranche`, `window.recalculateTranches` wrapped as arrow-function dispatchers around the imported references.
- **Cleanup** in `destroy()` at lines 364–368: `delete window.addTranche / removeTranche / recalculateTranches`, plus `editingProjectTranches = []`.

### Task 2: Persistence + validation + D-25 guard (commit `5536f42`)
- **`addProject()`** (lines 658–710): Reads tranches via `readTranchesFromDOM('projectForm')` AFTER status validation but BEFORE `showLoading(true)`. Computes `tranchesProvided` flag (true iff any non-empty label OR any percentage > 0). When provided, validates sum=100 (±0.01) and non-empty labels — blocks save with `showToast('error')` on either failure. Persists `collection_tranches: finalTranches` (or `[]` if not provided) on the addDoc payload at line 697. Audit-log entry conditionally appended (line 709) when tranches were provided.
- **`editProject()`** (lines 996–1001): After standard form pre-population, copies `project.collection_tranches` into `editingProjectTranches` and rebuilds `#collTrancheBuilderWrapper` innerHTML via `renderTrancheBuilder(editingProjectTranches, 'projectForm')` so the editor shows existing values.
- **`saveEdit()`** (lines 1078–1135): Same read+validate as addProject. Then computes `oldTranchesJson` vs `newTranchesJson` and, when they differ AND `existingProject.project_code` is non-null, runs `getDocs(query(collection(db, 'collectibles'), where('project_code', '==', existingProject.project_code)))`. If `size > 0`, shows D-25 `confirm()` modal: *"This project has N existing collectible(s). Existing collectibles keep their original tranche label and amount — only future collectibles will use the new tranches. Continue?"*. Cancel → return. Persists `collection_tranches: finalTranches` in the updateDoc payload at line 1132. Records diff in `editChanges` at lines 1167–1169 (when `oldTranchesJson !== newTranchesJson`) — flows through `recordEditHistory` like every other audited field.

## Acceptance Criteria — Final Scorecard

| Criterion | Required | Actual | Pass |
|-----------|----------|--------|------|
| `node --check app/views/projects.js` exits 0 | yes | yes | ✓ |
| `from '../tranche-builder.js'` import | 1 | 1 | ✓ |
| `renderTrancheBuilder([], 'projectForm')` (initial render) | 1 | 1 | ✓ |
| `id="collTrancheBuilderWrapper"` | 1 | 1 | ✓ |
| `window.addTranche` (attach + delete) | 2 | 2 | ✓ |
| `window.removeTranche` (attach + delete) | 2 | 2 | ✓ |
| `window.recalculateTranches` (attach + delete) | 2 | 2 | ✓ |
| `let editingProjectTranches` (declaration) | 1 | 1 | ✓ |
| `collection_tranches` total refs | ≥7 | 10 | ✓ |
| `readTranchesFromDOM('projectForm')` (add+save) | 2 | 2 | ✓ |
| Sum-100 validation toast | 2 | 2 | ✓ |
| Empty-label validation toast | 2 | 2 | ✓ |
| D-25 confirmation modal copy `existing collectible(s)` | 1 | 1 | ✓ |
| Existing-collectibles `where('project_code', '==', ...)` query | 1 | 1 | ✓ |
| `editingProjectTranches` total refs (decl + populate + reset + edit + reset destroy) | ≥3 | 4 | ✓ |
| `renderTrancheBuilder(editingProjectTranches, 'projectForm')` in editProject | present | line 1000 | ✓ |
| Form-group ordering: Contract Cost → Tranches → Personnel | yes | line 154 → 160 → 168 | ✓ |
| `field: 'collection_tranches'` in audit trail (addProject + saveEdit) | 2 | 2 | ✓ |

## Deviations from Plan

### Auto-fixed (Rule 1 — minor structural correctness)

**1. [Rule 1 — Structural] `showLoading(false)` removed from validation-failure paths**
- **Found during:** Task 2 (addProject + saveEdit)
- **Issue:** Plan literal text included `showLoading(false); return;` inside the validation-failure branches, but the validation block runs BEFORE `showLoading(true)`. Calling `showLoading(false)` before any `true` is a no-op-but-misleading.
- **Fix:** Reordered so the validation block runs immediately AFTER status validation and BEFORE `showLoading(true)`. On validation failure → `showToast(...)` then `return;` (no loader toggle).
- **Files modified:** `app/views/projects.js` (lines 658–672 in addProject, 1078–1102 in saveEdit)
- **Commit:** `5536f42`
- **Why this is correct:** Matches the existing addProject/saveEdit pattern for budget/contract_cost validation (which also returns before showLoading). Logically equivalent and structurally consistent.

### Documented behavior — not a deviation

**Shared window-function namespace with procurement.js (Phase 65 PO tranche-builder).**
- `app/views/procurement.js` already attaches `window.addTranche / removeTranche / recalculateTranches` in `init()` (line 1648–1650) and detaches in `destroy()` (line 2197–2199) using **its own local copies** of the tranche-builder helpers (lines 76–183 of procurement.js).
- Plan 85-03 attaches the **same window-function names** but routes them through the shared `app/tranche-builder.js` module (Plan 02).
- **Why this is safe:** Both implementations use the same DOM contract — `id="trancheBuilder_<scopeKey>"`, `id="trancheTotal_<scopeKey>"`, `id="trancheTotalValue_<scopeKey>"`. Procurement's PO scopeKey = `poId` (e.g., `PO-2026-001`), projects' scopeKey = `'projectForm'`. The shared module's `addTranche/removeTranche/recalculateTranches` correctly target wrapper `trancheBuilder_PO-2026-001` when called from procurement HTML and `trancheBuilder_projectForm` when called from projects HTML.
- **Lifecycle:** Whichever view mounts last "wins" the window-function reference. Since both backends honor the same scopeKey-routing contract, this is functionally lossless.
- **Future cleanup (out of scope, deferred per Plan 02 module header comment):** Migrate procurement.js to import from the shared module and delete its local copies. Deferred to v4.1+.

### Plan-Document Note: D-25 effectively a no-op until Plan 06 ships
- The collectibles collection has zero documents in production today (Plan 06 hasn't shipped). The D-25 `getDocs(query(... where project_code ...))` query will always return `size: 0`, so the confirm() modal never fires today.
- The guard is **coded correctly for forward compatibility** — when Plan 05 first writes a collectible doc with `project_code: 'CLMC-ACME-001'`, the guard activates on subsequent edits to that project's tranches. No code change required here.

## Auth Gates Encountered

None.

## Self-Check: PASSED

All claims verified:

- ✓ `app/views/projects.js` modified — verified via `git show 0a6c391 5536f42 --stat`
- ✓ Commit `0a6c391` exists — `git log --oneline | grep 0a6c391` returns the Task 1 commit
- ✓ Commit `5536f42` exists — `git log --oneline | grep 5536f42` returns the Task 2 commit
- ✓ `app/views/procurement.js` NOT modified by this plan's commits — `git show 0a6c391 5536f42 --stat` shows ONLY `app/views/projects.js`
- ✓ `node --check app/views/projects.js` exits 0
- ✓ All 18 grep-based acceptance criteria pass (see scorecard table above)

## Commits

| Hash | Type | Message |
|------|------|---------|
| `0a6c391` | feat | feat(85-03): add tranche-builder UI + window-fn lifecycle in projects.js |
| `5536f42` | feat | feat(85-03): persist + validate collection_tranches in addProject and saveEdit |

## Threat-Model Disposition (revisit)

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-85.3-01 (Stored XSS via tranche label) | mitigate | ✓ shared module's `escapeHTML(t.label)` enforces output escaping |
| T-85.3-02 (Tranche % out of range) | mitigate | ✓ HTML5 `min=0 max=100 step=0.01` + sum=100 server-side check rejects malicious payloads |
| T-85.3-03 (Non-edit user changes tranches) | mitigate | ✓ `window.canEditTab?.('projects') === false` guard preserved at top of addProject (line 580) and saveEdit (line 985); existing Firestore Security Rules on projects collection are server-side backstop |
| T-85.3-04 (Existing-collectibles count leaked) | accept | ✓ count visible only to users with project edit permission, who can already see operational records |
| T-85.3-05 (Tranche edit not audited) | mitigate | ✓ `editChanges.push({ field: 'collection_tranches', ... })` writes to `recordEditHistory` (lines 1167–1169) — same pattern as 6 other audited fields |
| T-85.3-06 (Existing-collectibles query repeat) | accept | ✓ One getDocs per saveEdit invocation when tranches change, bounded by user save rate |

No new threat surface introduced beyond what the threat model anticipated.

## Manual UAT Recommended (deferred to phase-close UAT)

Per plan verification block, the following manual checks should be performed against a live Firebase project before phase-close signoff:

- [ ] Open Add Project form — verify tranche editor visible below Contract Cost with a single empty row + "+ Add Tranche" button
- [ ] Add tranche with label "Mobilization" 50% + label "Progress" 50% — running-total badge turns green; save creates a project with `collection_tranches: [{label:'Mobilization', percentage:50}, {label:'Progress', percentage:50}]` in Firestore
- [ ] Open Edit Project on the project just created — tranche editor pre-populated with the two existing tranches
- [ ] Try to save with sum != 100 (e.g., 60 + 30) — toast blocks save, no Firestore write
- [ ] Try to save with empty label (`{label:'', percentage:50}, {label:'X', percentage:50}`) — toast blocks save
- [ ] Cancel out of the form — `editingProjectTranches` resets, no stale state on next open
- [ ] Edit tranches on a project AFTER Plan 06 has created collectibles against it — D-25 confirmation modal fires; cancel aborts save; OK proceeds and writes new tranches (existing collectibles unaffected)
