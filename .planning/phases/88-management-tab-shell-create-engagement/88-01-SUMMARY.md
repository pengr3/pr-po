---
phase: 88-management-tab-shell-create-engagement
plan: 01
subsystem: engagement-create
tags:
  - refactor
  - engagement-create
  - shared-helper
  - foundation
requires:
  - app/firebase.js (db, collection, addDoc)
  - app/utils.js (generateProjectCode, generateServiceCode)
  - app/edit-history.js (recordEditHistory)
provides:
  - app/engagement-create.js — `createEngagement({type, ...})` writer for projects + services
affects:
  - app/views/projects.js (addProject delegates to helper)
  - app/views/services.js (addService delegates to helper)
tech-stack:
  added: []
  patterns:
    - "onAfterCreate callback so the writer module stays UI-free"
    - "Verbatim doc-shape + change-list copy from original call sites (zero schema drift)"
key-files:
  created:
    - app/engagement-create.js
  modified:
    - app/views/projects.js
    - app/views/services.js
decisions:
  - "Use onAfterCreate callback (option b in plan <interfaces>) instead of exporting syncServicePersonnelToAssignments and importing it into the writer — keeps app/engagement-create.js free of view-module imports."
  - "node --check substituted for the plan's `node -e import(...)` automated gate because the module imports Firebase from the gstatic CDN at parse time, which fails outside the browser. Syntax check + grep on `export async function createEngagement` + `addDoc(collection(db,` + a no-`./views/` import scan together cover the same intent."
metrics:
  duration: ~10 minutes (sequential, no UAT)
  completed: 2026-05-11
  tasks_completed: 3 of 4 (Task 4 UAT pending — orchestrator gates)
  commits: 3
  net_loc: +131 (engagement-create.js) -21 (projects.js) -24 (services.js) = +86
---

# Phase 88 Plan 01: Extract createEngagement Helper Summary

Pure refactor — extracted the duplicated project/service "create engagement" logic from `app/views/projects.js` (addProject) and `app/views/services.js` (addService) into a single shared module `app/engagement-create.js`, refactored both call sites to delegate to it. No behavior change at the existing entry points; foundation for Plan 88-02's Proposals-tab form (third caller of the same helper).

## Files Created / Modified

| File                          | Status   | Lines                       | Notes                                                                                                  |
| ----------------------------- | -------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `app/engagement-create.js`    | created  | +131                        | Single export `createEngagement`. Imports `firebase.js`, `utils.js`, `edit-history.js` only.           |
| `app/views/projects.js`       | modified | +19 / -40 (net -21)         | Added 1 import line. `addProject` create block (lines 676-728) replaced by `await createEngagement({type:'project', ...})` with personnel sync in `onAfterCreate`. All other functions untouched. |
| `app/views/services.js`       | modified | +16 / -40 (net -24)         | Added 1 import line. `addService` create block (lines 714-766) replaced by `await createEngagement({type: service_type, ...})` with personnel sync in `onAfterCreate`. All other functions untouched. |

## Commits (per task)

| Task | Commit    | Subject                                                       |
| ---- | --------- | ------------------------------------------------------------- |
| 1    | `ca3c9d9` | feat(88-01): extract engagement-create.js helper              |
| 2    | `688f647` | refactor(88-01): projects.js delegates to createEngagement    |
| 3    | `3005188` | refactor(88-01): services.js delegates to createEngagement    |

## Verification Results

### Task 1 (engagement-create.js)
- [x] `node --check app/engagement-create.js` → OK
- [x] `grep -c "export async function createEngagement"` → 1 (line 25)
- [x] `grep -c "addDoc(collection(db"` → 1 (single conditional write)
- [x] `grep "from './views/"` → 0 matches (no view-module imports)
- [x] Header comment cites D-04 + original call sites (`projects.js:681`, `services.js:721`)
- [x] No `window.*` attachments

### Task 2 (projects.js)
- [x] `node --check app/views/projects.js` → OK
- [x] `grep -c "addDoc(collection(db, 'projects'"` → 0 (was 1; now eliminated from addProject)
- [x] `grep -n "import { createEngagement }"` → line 9 (one match)
- [x] `grep -n "createEngagement"` → 2 hits: import (line 9) + call site (line 679)
- [x] `grep -n "syncPersonnelToAssignments"` → 3 hits: import (line 7), `onAfterCreate` body (line 693), `saveEdit` path (line 1161) — saveEdit untouched as required
- [x] `recordEditHistory` import retained (line 8) for saveEdit (line 1154) + toggle_active (line 1221)
- [x] Single `// Phase 88-01: shared engagement-create helper (D-04)` WHY comment at delegation site

### Task 3 (services.js)
- [x] `node --check app/views/services.js` → OK
- [x] `grep -c "addDoc(collection(db, 'services'"` → 0 (was 1; now eliminated from addService)
- [x] `grep -n "import { createEngagement }"` → line 11 (one match)
- [x] `grep -n "createEngagement"` → 2 hits: import (line 11) + call site (line 717)
- [x] `recordEditHistory` import retained for saveEditService (line 1219) + toggle_active (line 1293) — addService's create-event call removed
- [x] `syncServicePersonnelToAssignments` import retained for `onAfterCreate` body (line 729) + saveEditService (line 1226)
- [x] `service_type` enum validation, services-require-client guard, tranche sum=100 guard, status enum guard — ALL preserved upstream of the delegation

### Cross-cutting checks
- [x] `app/engagement-create.js` doc-shape mirrors the verbatim 16/17-key shape from `<interfaces>` — `personnel_user_id: null`, `personnel_name: null`, `personnel: null`, `active: true`, `created_at: new Date().toISOString()`, `collection_tranches` always written.
- [x] Edit-history change-list construction uses the verbatim conditional-spread pattern from `<interfaces>` — `personnel` field uses `personnel_names.join(', ')` to match the existing project + service paths.
- [x] Phase 78 D-04 clientless-project handling preserved: `project_code = null` when `clientCode` absent; `onAfterCreate` skips assignment sync when `code` is null.
- [x] Phase 85 D-09 always-write `collection_tranches: []` preserved (helper passes `collectionTranches || []`).
- [x] `git diff --stat` for the three task commits matches plan expectation: 1 file added, 2 files modified, net LOC reduction in the two view modules.

## Deviations from Plan

### Auto-fixed (Rule 1/2/3) — None
No bugs, missing critical functionality, or blockers encountered. The refactor was a verbatim shape transplant.

### Adjustments to Plan-Specified Verify Gates

**Task 1 — automated check substitution.** The plan listed:
```
node -e "import('./app/engagement-create.js').then(m => { if (typeof m.createEngagement !== 'function') ...})"
```
This fails in a Node CLI shell because `app/engagement-create.js` transitively imports `app/firebase.js`, which imports the Firebase SDK from `https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js` (browser-only ESM URL — Node treats it as an unsupported scheme). The check is meaningful only inside the browser. Substituted three deterministic checks that prove the same `<done>` invariants:
1. `node --check app/engagement-create.js` (syntax valid)
2. `grep -c "export async function createEngagement"` returns 1
3. `grep "from './views/"` returns 0 (no view-module imports)

This is consistent with `CLAUDE.md` ("zero-build static website — no build, test, or lint commands") and the plan's `<verification>` block which already has additional grep gates.

### Architectural changes (Rule 4) — None

## Authentication Gates

None — no Firebase calls executed during this refactor (no UAT yet).

## Known Stubs

None. The refactor preserves all existing call sites; no placeholder data, no UI surface added.

## Threat Flags

None. No new endpoints, auth paths, file access, or schema changes — the threat surface is byte-identical to the pre-refactor state. The `<threat_model>` mitigations T-88-01-01 and T-88-01-02 are addressed by the verbatim-shape and verbatim-change-list copies (verified by code inspection); T-88-01-01/02's full UAT verification (Firestore field-by-field check) is gated to Task 4.

## TDD Gate Compliance

N/A — plan is `type: execute` (not `type: tdd`). Tasks are auto-type, no TDD cycle required.

## UAT Status

**Task 4 (checkpoint:human-verify) NOT executed.** Per orchestrator instructions, the executor stops after the SUMMARY commit and returns control. The orchestrator must drive the 10-step UAT (Task 4 in `88-01-PLAN.md`) before Plan 88-02 starts. UAT covers:
- Operations-Admin project create with client (Firestore field check + editHistory)
- Clientless project create (Phase 78 D-04 — `project_code: null`, sync skipped)
- One-time service create (Firestore + editHistory + assignments)
- Recurring service create (`service_type: 'recurring'` verified)
- Non-create role still blocked (Finance role)
- Test-doc cleanup

## Pointer

Plan 88-02 builds the `#/proposals` tab + Proposals-tab "New Engagement" form, consuming `createEngagement` as its third caller. The shape contract proven here (project + one-time + recurring) is what 88-02 binds to.

## Self-Check: PASSED

Files exist:
- `app/engagement-create.js` → FOUND (verified by Write tool success at 131 lines)
- `app/views/projects.js` → FOUND (modified, lint-clean)
- `app/views/services.js` → FOUND (modified, lint-clean)

Commits exist (`git log --oneline -5`):
- `ca3c9d9 feat(88-01): extract engagement-create.js helper` → FOUND
- `688f647 refactor(88-01): projects.js delegates to createEngagement` → FOUND
- `3005188 refactor(88-01): services.js delegates to createEngagement` → FOUND

All 3 auto tasks committed; SUMMARY.md commit pending below.
