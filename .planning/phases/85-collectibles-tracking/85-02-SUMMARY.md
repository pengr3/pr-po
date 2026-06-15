---
phase: 85-collectibles-tracking
plan: 02
subsystem: collectibles
tags: [es-modules, tranche-builder, id-generation, firestore, shared-helpers]

# Dependency graph
requires:
  - phase: 85-collectibles-tracking
    provides: "(none — Wave 1, no upstream dependencies; runs in parallel with Plan 85-01 which touches firestore.rules + notifications.js)"
provides:
  - "app/tranche-builder.js — shared 5-export ES module for the tranche editor UI (renderTrancheBuilder, readTranchesFromDOM, recalculateTranches, addTranche, removeTranche)"
  - "app/coll-id.js — generateCollectibleId(scopeCode, dept) project-scoped sequential ID generator (COLL-{CODE}-{n}, no zero-padding)"
affects: [85-03-projects-tranche-editor, 85-04-services-tranche-editor, 85-05-finance-collectibles-tab, 85-06-project-detail-surface, 85-07-service-detail-surface, 85-08-csv-export]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared ES-module helper extraction (lift-not-duplicate when callers grow from 1 to 3+)"
    - "scopeKey-parameterized DOM IDs (allows multiple builder instances per page)"
    - "Per-scope sequential IDs (COLL-{CODE}-{n}) — Phase 65.4 lesson over year-counter"
    - "Pure module / consumer-attaches-to-window discipline (no cross-view coupling)"

key-files:
  created:
    - "app/tranche-builder.js (154 lines, 5 named exports)"
    - "app/coll-id.js (61 lines, 1 named export)"
  modified: []

key-decisions:
  - "D-09/D-10 implementation: lift the 5 tranche-editor helpers from procurement.js (lines 76-183) into a shared module rather than duplicate across projects.js / services.js / finance.js"
  - "D-20 implementation: per-project-code / per-service-code scoped counter, NOT generateSequentialId (year-counter caused Phase 65.4 collisions)"
  - "scopeKey parameter (renamed from poId) so multiple builder instances coexist on one page (e.g. service edit form + create-collectible modal)"
  - "Pure module — consumers (projects.js, services.js, finance.js) attach window.X = X in their own init() and delete window.X in destroy(). Module never pollutes window."
  - "procurement.js untouched — refactoring its in-place helpers to import from this module is deferred to v4.1+ to keep Phase 85 scope tight"

patterns-established:
  - "Shared helper module pattern: when a helper graduates from 1 caller to 3+ callers, lift it; document the lift+rename in the module header"
  - "Per-scope ID generator pattern: filter Firestore by the scope field, parse last-segment with lastIndexOf('-'), return {PREFIX}-{SCOPE}-{n} with no zero-padding"

requirements-completed: [COLL-01, COLL-09]

# Metrics
duration: 4min
completed: 2026-05-02
---

# Phase 85 Plan 02: Shared Tranche-Builder + Project-Scoped Collectible-ID Modules

**Two greenfield ES modules — `app/tranche-builder.js` (5 exports, scopeKey-parameterized DOM IDs) and `app/coll-id.js` (`generateCollectibleId` per-project-code/service-code counter) — ready for consumption by Plans 03/04/05.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-02T15:57:26Z
- **Completed:** 2026-05-02T16:01:23Z
- **Tasks:** 2 of 2 complete
- **Files modified:** 0
- **Files created:** 2

## Accomplishments

- Lifted the 5 tranche-editor helpers (`renderTrancheBuilder`, `readTranchesFromDOM`, `recalculateTranches`, `addTranche`, `removeTranche`) out of `app/views/procurement.js` lines 76-183 into a reusable `app/tranche-builder.js` so Plans 03 / 04 / 05 share one source instead of triple-duplicating ~110 lines.
- Renamed the legacy `poId` parameter to `scopeKey` and templated DOM IDs accordingly (`trancheBuilder_${scopeKey}`, `trancheTotal_${scopeKey}`, `trancheTotalValue_${scopeKey}`) so multiple builder instances can coexist on the same page (e.g., a service edit form alongside a create-collectible modal in finance.js).
- Built `generateCollectibleId(scopeCode, dept)` in `app/coll-id.js` modelled on `generateRFPId` (procurement.js lines 220-261) — queries `collectibles` filtered by `project_code` (or `service_code` per `dept`), parses last segment with `lastIndexOf('-')`, returns `COLL-{CODE}-{n}` with no zero-padding. Throws on empty `scopeCode` or invalid `dept`.
- Both modules pass `node --check`. Both are pure (no side-effects, no `window.*` writes). Both are ready for Plan 03/04/05 consumption.

## Task Commits

Each task committed atomically:

1. **Task 1: Create shared tranche-builder module** — `38dc667` (feat)
   - `feat(85-02): add shared tranche-builder module (5 exports, scopeKey-parameterized)`
2. **Task 2: Create generateCollectibleId helper module** — `10e562d` (feat)
   - `feat(85-02): add project-scoped collectible ID generator (D-20)`

(Plan 85-01's commit `090bc5c` landed between these two — it touches disjoint files (`firestore.rules` + `app/notifications.js`) per the plan's parallel-execution declaration; no conflicts.)

## Files Created

- **`app/tranche-builder.js`** (154 lines, 5 exports) — shared tranche-builder UI helpers parameterized by `scopeKey`. Uses `escapeHTML` for XSS mitigation on label inputs (T-85.2-01).
- **`app/coll-id.js`** (61 lines, 1 export) — `generateCollectibleId(scopeCode, dept)` per-scope sequential ID generator. Imports `db, collection, query, where, getDocs` from `app/firebase.js`.

## Files Not Modified (Intentional — Out-of-Scope)

- **`app/views/procurement.js`** — its in-place tranche helpers (lines 76-183) are kept as-is for backward compatibility with Phase 65 PO tranche flow. Refactoring procurement.js to import from `app/tranche-builder.js` is deferred to v4.1+ so this phase doesn't bloat its diff. The two implementations diverge only in DOM-ID parameter naming (`poId` vs `scopeKey`); the behavior is functionally identical for callers that pass canonical IDs.
- **No other files** — by design. Plans 03/04/05 are responsible for consuming these modules and wiring `window.X = X` in their own `init()` / `delete window.X` in their own `destroy()`.

## Acceptance Criteria — Plan Verification

### Plan-level `<verification>` block (5 checks):

| Check | Expected | Actual | Result |
|-------|----------|--------|--------|
| `node --check app/tranche-builder.js` | exit 0 | exit 0 | PASS |
| `node --check app/coll-id.js` | exit 0 | exit 0 | PASS |
| `grep -c "^export" app/tranche-builder.js` | ≥ 5 | 5 | PASS |
| `grep -c "^export" app/coll-id.js` | ≥ 1 | 1 | PASS |
| `grep -c "generateSequentialId" app/coll-id.js` | 0 | 0 | PASS |

### Task 1 acceptance criteria (7 checks):

| Check | Expected | Actual | Result |
|-------|----------|--------|--------|
| File `app/tranche-builder.js` exists | yes | yes | PASS |
| `node --check` exits 0 | yes | yes | PASS |
| `grep -c "^export function"` | exactly 5 | 5 | PASS |
| `grep -c "import { escapeHTML }"` | 1 | 1 | PASS |
| `grep -c "trancheBuilder_${scopeKey}"` | ≥ 1 | 4 | PASS |
| `grep -c "poId"` | 0 | 0 | PASS |
| `wc -l` | ≥ 90 | 154 | PASS |

### Task 2 acceptance criteria (8 checks):

| Check | Expected | Actual | Result |
|-------|----------|--------|--------|
| File `app/coll-id.js` exists | yes | yes | PASS |
| `node --check` exits 0 | yes | yes | PASS |
| `grep -c "^export async function generateCollectibleId"` | exactly 1 | 1 | PASS |
| `grep -c "from './firebase.js'"` | exactly 1 | 1 | PASS |
| `grep -c "generateSequentialId"` | 0 | 0 | PASS |
| `grep -c "where(scopeField, '==', scopeCode)"` | 1 | 1 | PASS |
| `grep -c "lastIndexOf('-')"` | 1 | 1 | PASS |
| `grep -c "COLL-${scopeCode}-${maxNum + 1}"` | 1 | 1 | PASS |

**All 20 plan-level + task-level acceptance criteria PASS.**

## Decisions Made

- **Module-header documentation reworded twice (minor):** Two acceptance criteria use literal-token grep (`grep -c "poId"` and `grep -c "generateSequentialId"`) and require a count of `0`. The original plan-prescribed module-header text included these tokens in "Parameter renamed from `poId` to `scopeKey`" and "WHY NOT generateSequentialId() (utils.js)?". Both header comments were rephrased to avoid the literal tokens while preserving the educational intent (Phase 65.4 collision lesson, parameter-rename history). No semantic change. See Deviations §1 below.
- **Followed plan verbatim for code:** All function bodies are byte-identical to the plan's prescribed code. No behavior or signature changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Reworded two doc-comment lines to satisfy literal-token acceptance grep**

- **Found during:** Task 1 verification step, Task 2 verification step
- **Issue:** The plan's prescribed module-header comments contain the literal tokens `poId` (in `tranche-builder.js`, comment line "Parameter renamed from `poId` to `scopeKey`") and `generateSequentialId` (in `coll-id.js`, comment line "WHY NOT generateSequentialId() (utils.js)?"). Two acceptance criteria use literal-string grep with expected count `0`:
  - `grep -c "poId" app/tranche-builder.js` returns `0`
  - `grep -c "generateSequentialId" app/coll-id.js` returns `0`
  These checks treat **any** occurrence of the literal token (including doc-comments) as a failure. Verbatim copy of the plan's prescribed comments would have failed both grep checks (returning 1 instead of 0).
- **Fix:** Rephrased both comments to preserve the educational/historical content without the literal tokens:
  - `tranche-builder.js`: "Parameter renamed from `poId` to `scopeKey`" → "Parameter renamed from the original PO-id parameter to `scopeKey`"
  - `coll-id.js`: "WHY NOT generateSequentialId() (utils.js)?" → "WHY NOT the year-counter helper from utils.js?"
  Both rewordings keep the Phase 65.4 collision lesson, the parameter-rename rationale, and the "do not use the year-counter" guidance. No code or behavior change.
- **Files modified:** `app/tranche-builder.js`, `app/coll-id.js` (header comments only)
- **Verification:** `grep -c` returns 0 for both literal tokens; `node --check` still passes for both files; all other acceptance criteria still pass.
- **Committed in:** `38dc667` (Task 1) and `10e562d` (Task 2) — applied before each commit so the committed file already satisfies the criteria.

---

**Total deviations:** 1 auto-fixed (1 blocking — acceptance-criteria literal-grep compliance)
**Impact on plan:** Surface-only doc-comment rephrasing. No code semantics changed. All success criteria still met. No scope creep.

## Issues Encountered

None — plan was executable end-to-end. The only friction was the literal-token grep checks in acceptance criteria flagging legitimate doc-comments as criterion failures; resolved via Rule 3 in-line.

## User Setup Required

None — no external service configuration required. Both files are pure ES modules consumed only by other in-app modules. The Firestore query in `generateCollectibleId` relies on the `collectibles` collection rule deployed by Plan 85-01 (parallel plan); Plan 03/04/05 are the first sites that will actually call `generateCollectibleId`, by which time Plan 85-01's rules are in place.

## Reminder for Plan 03 / 04 / 05 Executors

This module is **pure** — it does **NOT** attach the 5 tranche helpers to `window`. Each consuming view must do this in its own lifecycle:

```javascript
// In projects.js / services.js / finance.js init():
import {
    renderTrancheBuilder,
    readTranchesFromDOM,
    recalculateTranches,
    addTranche,
    removeTranche
} from '../tranche-builder.js';

window.recalculateTranches = recalculateTranches;
window.addTranche = addTranche;
window.removeTranche = removeTranche;
// (renderTrancheBuilder and readTranchesFromDOM are called directly from view code,
//  not from inline onclick — no window attachment needed for those two.)

// In destroy():
delete window.recalculateTranches;
delete window.addTranche;
delete window.removeTranche;
```

The inline `oninput` and `onclick` handlers emitted by `renderTrancheBuilder` reference `window.recalculateTranches`, `window.addTranche`, `window.removeTranche` — without the consumer attaching them, those handlers will throw at runtime.

**For Plan 05 specifically (create-collectible modal):**
```javascript
import { generateCollectibleId } from '../coll-id.js';

const collId = await generateCollectibleId(project.project_code, 'projects');
//                                          ^^^^^^^^^^^^^^^^^^^   ^^^^^^^^^^
//                                          MUST be non-empty     'projects' | 'services'
```

Phase 78 clientless projects (no `project_code` yet) MUST be blocked at the UI layer **before** this call — see CONTEXT.md D-20 ("Project must have a code (assign a client first)" message).

## Next Plan Readiness

- **Ready for Plan 85-03 (projects.js tranche editor):** import the 5 helpers from `app/tranche-builder.js`; pass `scopeKey: 'projectForm'` (or similar canonical key) to `renderTrancheBuilder`.
- **Ready for Plan 85-04 (services.js tranche editor):** same import; pass `scopeKey: 'serviceForm'`.
- **Ready for Plan 85-05 (finance.js create-collectible modal):** import both `app/tranche-builder.js` (for tranche read-only display) and `app/coll-id.js` (for ID generation). Use canonical `scopeKey` like `collModal_${project.project_code}` to namespace.
- **No blockers** for downstream plans. Plan 85-01 (parallel) provides the Firestore rules and notification type the eventual writer in Plan 85-05 will need.

## Self-Check: PASSED

- File `app/tranche-builder.js` — FOUND
- File `app/coll-id.js` — FOUND
- Commit `38dc667` (Task 1) — FOUND in `git log`
- Commit `10e562d` (Task 2) — FOUND in `git log`
- All 20 acceptance criteria — PASS

## Threat Surface Scan

No new security-relevant surface beyond what was already documented in the plan's `<threat_model>` (T-85.2-01 through T-85.2-06). All STRIDE entries' mitigations are in place:
- T-85.2-01 (XSS in tranche labels): `escapeHTML(t.label || '')` applied at line 39 of `app/tranche-builder.js`.
- T-85.2-02 (scopeKey injection): scopeKey is supplied by callers; documented in module header that callers must pass server-trusted IDs only.
- T-85.2-03..06: accepted dispositions with no code-level action required (per plan).

No new threat flags.

---
*Phase: 85-collectibles-tracking*
*Completed: 2026-05-02*
