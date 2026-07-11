---
phase: 108-home-per-role-attention-feeds
plan: 04
subsystem: ui
tags: [home-feed, role-registry, getSourcesForUser, feed-engine, circular-import, strategy-a, re-export]

# Dependency graph
requires:
  - phase: 108-02
    provides: app/home-feed-sources.js scaffold (imports + D-01 THRESHOLDS) + 10 Finance/Procurement sources
  - phase: 108-03
    provides: +7 cross-department portfolio/admin sources (file at 17 sources) + scopeByCodes/FUNNEL_STATUSES/OPEN_ISSUES_PARENT_CAP
  - phase: 107-command-center
    provides: locked home-feed.js engine (assembleFeed/rankItems/dedupeItems/rollUpByCategory/capItems/SEVERITY) + D-11 item contract + 3 seed sources (the template)
provides:
  - "app/home-feed-sources.js — 3 moved seed sources + scopeProposalToDept (file now 20 sources) + declarative ROLE_SOURCES (7 roles) + getSourcesForUser(user)"
  - "app/home-feed.js — slimmed to the pristine engine; imports + re-exports getSourcesForUser from home-feed-sources.js"
  - "Live per-role attention feeds (HOME-09..13): every role's getSourcesForUser returns its exact source set"
affects: [109-executive-dashboard, 111-mobile-command-center]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Declarative role -> source-set registry (ROLE_SOURCES map) + getSourcesForUser(user) = ROLE_SOURCES[user.role] || [] (fail-closed); one wiring point the engine composes"
    - "Engine <- sources one-directional import; sources import ONLY the frozen SEVERITY leaf back — a benign 2-node cycle (SEVERITY read only inside source bodies at call time, never at module-init)"
    - "Re-export a moved public symbol from its old module (export { getSourcesForUser }) to preserve API for existing by-name importers after a cross-module move"

key-files:
  created: []
  modified:
    - app/home-feed-sources.js
    - app/home-feed.js

key-decisions:
  - "Moved the 3 seed sources + scopeProposalToDept VERBATIM into home-feed-sources.js so all 20 sources live in one library; the engine keeps only the composition logic"
  - "Kept sourceProposalsAwaitingApproval's approver gate ['super_admin','operations_admin'] unchanged; services_admin lists it for symmetry and self-gates to [] (decision #1) — no widening of canApproveQueue/firestore.rules"
  - "Re-exported getSourcesForUser from home-feed.js (Rule 3 blocking fix): home.js:23 imports it by name from ../home-feed.js and would otherwise fail module load"
  - "Removed firebase/notifications/proposals imports from home-feed.js after confirming the engine references none of them (grep: TYPE_META/getDocs remain only as comment prose)"

patterns-established:
  - "ROLE_SOURCES declarative registry: add a role or re-slot a source by editing one map, not per-role code branches"
  - "Benign frozen-leaf import cycle: a const read only inside call-time function bodies does not trip the TDZ during module init"

requirements-completed: [HOME-09, HOME-10, HOME-11, HOME-12, HOME-13]

# Metrics
duration: ~20min
completed: 2026-07-11
---

# Phase 108 Plan 04: Per-Role Registry Wiring + Engine Seam Summary

**Activated the per-role attention feeds (HOME-09..13): moved the 3 remaining seed sources + `scopeProposalToDept` verbatim into `home-feed-sources.js` (now 20 sources), added a declarative `ROLE_SOURCES` map + `getSourcesForUser(user)` that returns each of the 7 roles' exact source set (fail-closed for unknown roles), and slimmed `home-feed.js` back to the pristine Phase-107 engine that imports — and re-exports — `getSourcesForUser`. The engine's item model, ranking, dedupe, cap (8/25), and roll-up (>=5) are untouched; the 2-node SEVERITY import cycle was empirically verified benign; zero `onSnapshot` in both files (Strategy A preserved).**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-11
- **Tasks:** 2 (both code)
- **Files modified:** 2 (`app/home-feed-sources.js`, `app/home-feed.js`)

## Accomplishments

- `home-feed-sources.js` is the single source library: **20** `export async function source*` (10 Finance/Procurement from Plan 02 + 7 portfolio/admin from Plan 03 + 3 moved seeds), plus `scopeProposalToDept`, `ROLE_SOURCES`, and `getSourcesForUser`.
- `getSourcesForUser(user)` returns the **exact** HOME-09..13 source set for all 7 roles (counts 6/6/6/5/5/6/4); unknown/absent role and no-user both return `[]` (fail-closed).
- `home-feed.js` is the pristine engine again — only change is importing + re-exporting `getSourcesForUser`; all engine functions retained unchanged.
- Registry name-check: all **20** names referenced by `ROLE_SOURCES` are defined in the file (0 undefined).
- Both files: `node --check` OK; `onSnapshot` count **0** (every source remains one batched `getDocs`, Strategy A).

## Final Per-Role `getSourcesForUser` Name Lists (all 7 roles — verified by parsing ROLE_SOURCES)

| Role | Count | Sources (in order) |
|------|-------|--------------------|
| **super_admin** (HOME-09) | 6 | sourceProposalsAwaitingApproval, sourcePendingUserRegistrations, sourceOverdueProjects, sourceOverdueServices, sourceDlpWindowsExpiring, sourceOverdueRfpPayments |
| **operations_admin** (HOME-10) | 6 | sourceProposalsAwaitingApproval, sourceOverdueProjects, sourceDlpWindowsExpiring, sourceOpenIssues, sourceStaleProgress, sourceOwnBillingRequests |
| **services_admin** (HOME-10) | 6 | sourceProposalsAwaitingApproval*, sourceOverdueServices, sourceDlpWindowsExpiring, sourceOpenIssues, sourceStaleProgress, sourceOwnBillingRequests |
| **operations_user** (HOME-11) | 5 | sourceMyProposalsForRevision, sourceOverdueProjects, sourceOpenIssues, sourceMyRejectedMRFs, sourceStaleProgress |
| **services_user** (HOME-11) | 5 | sourceMyProposalsForRevision, sourceOverdueServices, sourceOpenIssues, sourceMyRejectedMRFs, sourceStaleProgress |
| **finance** (HOME-12) | 6 | sourcePendingPRs, sourcePendingTRs, sourceOverdueRfpPayments, sourceBillingRequestsToDecide, sourceCollectiblesOverdue, sourceRetentionReleases |
| **procurement** (HOME-13) | 4 | sourceMrfsPendingProcessing, sourceAgingPOs, sourceRejectedTRs, sourceDeliveredPOsMissingProof |

\* `services_admin` lists `sourceProposalsAwaitingApproval` for **symmetry only**; its approver gate `['super_admin','operations_admin']` self-gates services_admin to `[]` (decision #1). No widening of the gate, `canApproveQueue`, or `firestore.rules`.

These lists match the plan's `<interfaces>` mapping and CONTEXT §"Per-role feed definitions" exactly.

## Engine Unchanged — CONFIRMED

`home-feed.js`'s only change is the import/re-export of `getSourcesForUser`. All engine members retained and **byte-unchanged** (grep-verified at expected offsets):

- `export const SEVERITY = Object.freeze({ critical, high, medium })` (line 45) — the frozen leaf sources import back.
- `SEVERITY_RANK`, `CATEGORY_LABEL`, `categoryListRoute`, `toMillis` (private helpers).
- `export function rankItems` / `dedupeItems` / `rollUpByCategory` / `capItems` (lines 95/111/133/181) — ranking (critical→high→medium, then overdueScore desc, then newest), dedupe-by-key keeping highest severity, roll-up when a category has ≥5 (keep 3 + one `+N more`), cap 8 visible / 25 max — all intact.
- `export async function assembleFeed(user, sources = getSourcesForUser(user))` (line 207) — signature + Promise.all per-source isolation + allSourcesFailed accounting unchanged; the default arg now resolves via the import.

`grep -c 'export async function source' app/home-feed.js` → **0** (all seed bodies removed). The removed `TYPE_META`/`getDocs` tokens remain only as **comment prose** in the top-of-file docstring (lines 15/29), not live code; zero live `db/collection/query/where` references. `from './views/proposals.js'` → **0 matches** (unused import removed).

## Circular-Import Verdict — BENIGN (empirically verified)

`home-feed.js` imports `getSourcesForUser` from `home-feed-sources.js`; `home-feed-sources.js` imports `SEVERITY` from `home-feed.js`. This 2-node ES-module cycle is **benign**:

- When the engine module begins evaluating, its `import` statement triggers `home-feed-sources.js` to evaluate **before** the engine's own body runs (before `SEVERITY` is initialized — it would be in the TDZ).
- But `home-feed-sources.js`'s top-level body **never reads** `SEVERITY`: it only builds `THRESHOLDS`, the (hoisted) source function declarations, `ROLE_SOURCES` (function references, not calls), and `getSourcesForUser`. `SEVERITY` is read **only inside source function bodies**, which run at `assembleFeed` **call time** — long after both modules finish initializing.
- `getSourcesForUser` is likewise invoked only at `assembleFeed` call time.

Verified by a minimal ESM simulation replicating the exact structure (engine imports sources first, exports `SEVERITY` after; sources imports `SEVERITY` and reads it only in fn bodies; registry from hoisted declarations): loaded with **no ReferenceError / no "cannot access SEVERITY before initialization"**, `getSourcesForUser({role:'finance'})` returned the two stub sources through the engine's re-export, unknown role and no-user returned `[]`, and `assembleFeed` resolved `SEVERITY.high`/`.critical` correctly at call time. The `SEVERITY` const was **not** duplicated.

## Zero-`onSnapshot` / Strategy A — CONFIRMED

- `grep -c 'onSnapshot' app/home-feed.js` → **0** · `grep -c 'onSnapshot' app/home-feed-sources.js` → **0**.
- No new source added; the 3 moved seeds each remain one batched `getDocs` (moved verbatim). Compute-on-load only — no persistent snapshot listeners, no TTL cache.

## Grep Acceptance-Criteria Results (all PASS)

**Task 1 (home-feed-sources.js):**
- `export async function source` count = **20** · `const ROLE_SOURCES` present · 7 role keys (`super_admin`/`operations_admin`/`services_admin`/`operations_user`/`services_user`/`finance`/`procurement`) · `return ROLE_SOURCES[user.role]` present · approver gate `['super_admin', 'operations_admin']` present · `from './views/proposals.js'` present · all four moved symbols (`scopeProposalToDept`/`sourceProposalsAwaitingApproval`/`sourceMyProposalsForRevision`/`sourceMyRejectedMRFs`) present · `onSnapshot` = 0.
- Registry name-check: 20 defined, 20 referenced, **0 missing**. Per-role counts 6/6/6/5/5/6/4 (all match `<interfaces>`).

**Task 2 (home-feed.js):**
- `export async function source` count = **0** · `getSourcesForUser` appears as the import (line 39), the re-export (line 42), the `assembleFeed` default arg (line 207), and docstring prose — **no local definition** · `import { getSourcesForUser } from './home-feed-sources.js'` present · `export async function assembleFeed` + `sources = getSourcesForUser(user)` present · all 4 engine fns (`rankItems`/`dedupeItems`/`rollUpByCategory`/`capItems`) present · `export const SEVERITY` present · `from './views/proposals.js'` = **0** · `onSnapshot` = 0.
- `node --check` OK on both files.

## Task Commits

Each task committed atomically:

1. **Task 1: move 3 seed sources into home-feed-sources.js + ROLE_SOURCES + getSourcesForUser** — `616fd985` (feat)
2. **Task 2: slim home-feed.js to pristine engine + import/re-export getSourcesForUser** — `2b5087c3` (feat)

_(Plan metadata SUMMARY commit follows.)_

## Files Created/Modified

- `app/home-feed-sources.js` (**modified**) — added `import { getAgeInStageDays, isOverdueInStage } from './views/proposals.js'`; appended `scopeProposalToDept` + the 3 seed sources (verbatim) + `ROLE_SOURCES` (7 roles) + `getSourcesForUser`. File now exports **20** source functions and the registry seam.
- `app/home-feed.js` (**modified**) — deleted the seed block (`scopeProposalToDept`, 3 seed bodies, old `getSourcesForUser` stub); replaced the firebase/notifications/proposals imports with `import { getSourcesForUser } from './home-feed-sources.js'` + `export { getSourcesForUser }`. Engine otherwise pristine.

## Decisions Made

- **20 sources in one library, registry-composed:** all seed + functional sources now live in `home-feed-sources.js`; `ROLE_SOURCES` + `getSourcesForUser` are the single declarative wiring point the engine composes. Adding a role or re-slotting a source is a one-map edit (T-108-02 review surface).
- **services_admin symmetry entry, gate unchanged:** `sourceProposalsAwaitingApproval` stays in services_admin's array but self-gates to `[]` (decision #1). No approver-gate/`canApproveQueue`/rules widening.
- **Trim engine imports only after grep-confirmed zero live refs:** firebase, notifications, and proposals imports removed from `home-feed.js` because the engine references none (remaining `TYPE_META`/`getDocs` are comment prose).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Re-exported `getSourcesForUser` from `home-feed.js` to preserve its public API**
- **Found during:** Task 2 (after removing the local `getSourcesForUser` from `home-feed.js`, scanning consumers).
- **Issue:** `app/views/home.js:23` does `import { assembleFeed, getSourcesForUser } from '../home-feed.js';`. The plan assumed home.js only needs `assembleFeed`, but it imports `getSourcesForUser` **by name** from the engine module. Removing that export makes the browser throw "The requested module '../home-feed.js' does not provide an export named 'getSourcesForUser'" at load — breaking the entire home view (availability threat T-108-05).
- **Fix:** Added `export { getSourcesForUser };` alongside the new `import` in `home-feed.js`, re-exposing the imported binding so the existing by-name importer keeps resolving. `home.js` left untouched (stays within this plan's declared `files_modified`). The re-export introduces no new top-level `SEVERITY` read, so the import cycle stays benign.
- **Files modified:** `app/home-feed.js`
- **Verification:** `grep` confirms `home-feed.js` exports `assembleFeed` + re-exports `getSourcesForUser`; `home.js`'s import targets both names; `node --check` OK; the ESM cycle simulation resolves `getSourcesForUser` through the engine re-export with no ReferenceError.
- **Committed in:** `2b5087c3` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** The re-export is essential for the app to load (home.js consumes `getSourcesForUser` from `home-feed.js` by name). It preserves the engine's public API surface rather than expanding scope into `home.js`. No behavior change, no scope creep.

## Issues Encountered

None beyond the deviation above. The seed move, registry transcription, and engine slim went as planned; the registry name-check and per-role count check passed on the first verification.

## Known Stubs

None — every source performs a real scoped Firestore read and shapes real D-11 rows. `getSourcesForUser` returns real per-role source sets; no placeholder/empty-value stubs, no unwired data.

## Threat Flags

None — this plan added no new network endpoints, auth paths, file-access patterns, or schema changes. It wired existing self-gating sources into a declarative registry (the registry is the access-control selection surface; each source additionally self-gates its data). No Firestore rules changed.

## Browser-UAT Items — PENDING IN BROWSER (for the phase verifier)

These require a signed-in browser session and cannot run in this zero-build headless environment. Recorded as **pending-in-browser** (reasoned-correct by code inspection + ESM cycle simulation):

1. **Per-role feed render (HOME-09..13):** Sign in (or stub `getCurrentUser()`) as each of the 7 roles, load Home, run `await assembleFeed(getCurrentUser())` — expect **no ReferenceError** / no "cannot access SEVERITY before initialization"; `.items` an array, `.total` a number; the Command Center feed renders.
2. **Role-appropriate dedupeKeys:** as **finance** → items include `pr-pending:` / `tr-pending:` (+ `rfp-overdue:`/`billreq-decide:`/`collectible-overdue:`/`retention-release:`); as **procurement** → `mrf-pending:` / `po-aging:` (+ `tr-rejected:`/`po-noproof:`); as **super_admin** → `proposal-approval:` / `user-pending:` / `project-overdue:` / `service-overdue:` / `dlp-expiring:` / `rfp-overdue:`.
3. **Fail-closed:** `getSourcesForUser({role:'unknown'})` → `[]`; `getSourcesForUser(null)` → `[]`; a role with zero assignments (e.g. operations_user with no assigned projects) → assignment-scoped sources early-return `[]` (calm/empty feed, not error).
4. **services_admin non-approver:** as services_admin, `sourceProposalsAwaitingApproval` contributes **no** rows (approver gate → `[]`), while `sourceOverdueServices` and the dept sources populate.
5. **Deep-link clicks:** feed rows navigate — route rows set `location.hash` (e.g. `#/finance`, `#/procurement/records`, `#/projects`, `#/services`, `#/admin?section=user-management`); the proposal-approval modal row invokes `window.homeQueueOpenApproveModal(id)`.

## Next Phase Readiness

- Per-role feeds are live: HOME-09..13 fully wired. Phase 108 code is complete pending the browser-UAT confirmation above.
- Phase 109 (Executive Dashboard) can compose new sources into the same `home-feed-sources.js` library and, if role-scoped, extend `ROLE_SOURCES` — the declarative registry is the single extension point.
- No blockers. STATE.md / ROADMAP.md intentionally left for the orchestrator to update.

## Self-Check: PASSED

---
*Phase: 108-home-per-role-attention-feeds*
*Completed: 2026-07-11*
</content>
</invoke>
