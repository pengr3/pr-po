---
phase: 108-home-per-role-attention-feeds
plan: 03
subsystem: ui
tags: [home-feed, feed-sources, portfolio, admin, assignment-scoping, dlp, open-issues, bounded-fanout, case-sensitive-status]

# Dependency graph
requires:
  - phase: 108-01
    provides: app/status-derivation.js (stageDaysInStage/normalizeUpdatedAt/getDlpState/getEngagementSignal/URGENCY_THRESHOLDS)
  - phase: 108-02
    provides: app/home-feed-sources.js scaffold (imports + D-01 THRESHOLDS) + 10 Finance/Procurement sources
provides:
  - "app/home-feed-sources.js — +7 cross-department portfolio/admin feed sources appended (file now 17 sources total)"
  - "scopeByCodes local helper + FUNNEL_STATUSES const + OPEN_ISSUES_PARENT_CAP for downstream reuse"
affects: [108-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Assignment-aware feed source = self-scope via getAssignedProjectCodes()/getAssignedServiceCodes() (null=see-all, []=early return []), so ONE function serves super_admin=all / dept-admin=dept / user=assigned (D-04) — no per-role variants"
    - "Feed severity RECOMPUTED against D-01 THRESHOLDS bands from status-derivation primitives, NEVER read off getEngagementSignal(...).level (gotcha 5)"
    - "Bounded subcollection fan-out: chunked 'in' parent resolution + parent cap + inner Promise.all of getDocs(issues where status=='open') — no group-read query, no denormalization"

key-files:
  created: []
  modified:
    - app/home-feed-sources.js

key-decisions:
  - "All 5 portfolio sources (#5a/#5b/#11/#7/#6) self-gate via getAssigned*Codes() — no ad-hoc role checks; the OTHER collection's predicate returns [] for a home-dept admin so it early-returns (T-108-01)"
  - "#6 open issues ships resolved-decision-#3 bounded fan-out (a); the (b) collectionGroup-index and (c) open_issue_count denormalization scale paths are documented out-of-scope, not built"
  - "getEngagementSignal is used ONLY to enrich #5a/#5b subtitle text; severity comes from THRESHOLDS.STAGE_* bands (gotcha 5)"
  - "#7 DLP-expiring pre-filters project_status=='Completed' before getDlpState (gotcha 6) and uses a dedupeKey prefix distinct from Plan 02's #8 retention-release: (gotcha 13)"

patterns-established:
  - "scopeByCodes(docs, codes, codeField): the single client-side assignment-scoping helper mirroring getAssigned*Codes() null/[]/list semantics"

requirements-completed: [HOME-09, HOME-10, HOME-11]

# Metrics
duration: ~25min
completed: 2026-07-11
---

# Phase 108 Plan 03: Cross-Department Portfolio & Admin Feed Sources Summary

**Appended the 7 assignment-aware portfolio/admin feed sources (HOME-09/10/11) to `app/home-feed-sources.js`, taking it from 10 → 17 source functions: two cheap admin action-state reads (#4 pending user registrations behind a super_admin approver gate, #10 own pending billing requests behind a uid ownership gate), four engagement/DLP portfolio sources (#5a/#5b overdue-in-stage projects/services, #11 stale On-going progress, #7 DLP windows expiring) that each self-scope via `getAssignedProjectCodes()`/`getAssignedServiceCodes()` and recompute severity from the D-01 `THRESHOLDS` bands, and the heaviest #6 open-issues source implemented as a bounded, chunked, inner-`Promise.all` subcollection fan-out with no `collectionGroup` and no `onSnapshot`. The file still has no registry — it stays dead code until Plan 04 wires `ROLE_SOURCES`.**

## The 7 New Sources

| # | Function | HOME | Gate / Scope | Query (server scope) | dedupeKey prefix | category | deepLink | Severity rule |
|---|----------|------|--------------|----------------------|------------------|----------|----------|---------------|
| 4 | `sourcePendingUserRegistrations` | 09 super_admin | approver gate `user?.role !== 'super_admin' → []` | `users where status=='pending'` (LOWERCASE) | `user-pending:` | `issue` | route `#/admin?section=user-management` (A2 degrade to `#/admin`) | fixed **high** |
| 10 | `sourceOwnBillingRequests` | 10/11 admin+user | ownership gate `!user?.uid → []` | `billing_requests where requested_by_uid==uid && status=='pending'` (LOWERCASE) | `billreq-own:` | `finance` | route `#/finance/collectibles` | fixed **medium** (tracking, not overdue) |
| 5a | `sourceOverdueProjects` | 09/10/11 | `getAssignedProjectCodes()` (null=all, []=return []) | `projects where project_status in [7 funnel statuses]` | `project-overdue:` | `project` | route `#/projects` | `d>STAGE_CRITICAL_D(14)`→critical; else high (surfaces >7d) |
| 5b | `sourceOverdueServices` | 09/10/11 | `getAssignedServiceCodes()` | `services where project_status in [7 funnel statuses]` | `service-overdue:` | `service` | route `#/services` | same as #5a |
| 11 | `sourceStaleProgress` | 10/11 | both `getAssignedProjectCodes()` + `getAssignedServiceCodes()` | `projects` + `services where project_status=='On-going'` (inner Promise.all) | `stale-progress:` | `project`/`service` | route `#/projects`\|`#/services` | `d>=PROGRESS_CRIT_D(30)`→critical; else high (surfaces ≥14d) |
| 7 | `sourceDlpWindowsExpiring` | 09/10 | both predicates | `projects` + `services where project_status=='Completed'` (inner Promise.all) → `getDlpState==='in-dlp'` within 14d | `dlp-expiring:` | `dlp` | route `#/projects`\|`#/services` | `days<=DLP_CRIT_D(3)`→critical; `<=DLP_HIGH_D(7)`→high; else medium |
| 6 | `sourceOpenIssues` | 10/11 | both predicates (bounded fan-out) | scoped parent doc-ids (chunked `in`), then per-parent `<parent>/{id}/issues where status=='open'` | `issue:{parentId}:{issueId}` (composite) | `issue` | route `#/projects`\|`#/services` | fixed **high** (an open issue is an action) |

Icons (from `notifications.js` TYPE_META): REGISTRATION_PENDING (#4), BILLING_REQUEST_SUBMITTED (#10), PROJECT_STATUS_CHANGED (#5a/#5b/#11), PROJECT_COST_CHANGED (#7), MRF_REJECTED (#6 — nearest analogue, no dedicated open-issue icon).

## Self-Scoping — CONFIRMED (T-108-01, no ad-hoc role checks)

Every assignment-scoped source calls the shared predicates; the SAME function yields super_admin=all / dept-admin=home-dept / user=assigned because a home-dept admin's *other* collection predicate returns `[]` → the source early-returns for that collection:

- `grep -c 'getAssignedProjectCodes()'` → **7** · `grep -c 'getAssignedServiceCodes()'` → **7** (used across #5a/#5b/#11/#7/#6).
- `scopeByCodes(docs, codes, codeField)` — the one shared client-side scoping helper: `codes===null → all`; `codes===[] → []`; else `filter to allowed codes`. It is a plain (non-exported, non-async) local helper, so it does NOT inflate the source count.
- #4 uses the approver gate `if (user?.role !== 'super_admin') return [];` (mirrors seed #1). #10 uses the ownership gate `if (!user?.uid) return [];` + `where('requested_by_uid','==',user.uid)`.

## Severity Recomputed from D-01 THRESHOLDS — CONFIRMED (gotcha 5)

Severities are graded from the `THRESHOLDS` constants via status-derivation primitives, NOT from `getEngagementSignal(...).level`:

- #5a/#5b: `stageDaysInStage(p, Date.now())` vs `STAGE_CRITICAL_D`/`STAGE_HIGH_D`. `getEngagementSignal(...).text` is appended to the subtitle for context ONLY — never used for grading.
- #11: `normalizeUpdatedAt(last_activity_at ?? updated_at)` age vs `PROGRESS_CRIT_D`/`PROGRESS_HIGH_D`.
- #7: `getDlpState(e)==='in-dlp'` (after the mandatory `project_status=='Completed'` pre-filter, gotcha 6) then days-to-expiry vs `DLP_CRIT_D`/`DLP_HIGH_D`/`DLP_MED_D`.

## #6 Open Issues — Bounded Fan-Out (resolved decision #3, T-108-03)

Shipped path **(a)** — bounded per-assignment/dept parallel fan-out:

1. **Resolve scoped parent doc-ids** per collection. `codes===null` (see-all admin/super) → enumerate the near-static reference collection (`getDocs(collection(db,'projects'|'services'))`, F-025); `codes===[]` → none; else chunk codes into groups of 10 and `getDocs(query(..., where('project_code'|'service_code','in',chunk)))`.
2. **Cap** the combined parent set at `OPEN_ISSUES_PARENT_CAP = 60` (`parents.slice(0, 60)`) so worst-case reads stay bounded even for a large-dept admin.
3. **Inner `Promise.all`** — one `getDocs(query(collection(db, kind, parentId, 'issues'), where('status','==','open')))` per parent. Composite dedupeKey `issue:{parentId}:{issueId}` (the issue doc carries no parent identity, gotcha 3).

Not wrapped in try/catch — a failed parent read propagates to `assembleFeed`'s per-source catch (isolated per source, T-108-03).

### Out-of-Scope Scale Paths (documented, NOT built this phase)

- **(b) collection-group query** — `<groupquery>(db,'issues') where status=='open'` would be ONE read, but needs (i) a new composite index, (ii) a security-rules block enabling group reads (`match /{path=**}/issues/{id}`), AND (iii) parent-identity denormalization onto each issue doc (issues carry no `project_code`/`department`, gotcha 3), so client-side assignment filtering is otherwise impossible. Not added — the group-read rule is explicitly NOT introduced (T-108-04).
- **(c) `open_issue_count` denormalization** — a counter written onto the project/service doc at issue create/resolve/reopen (+ one-time backfill), enabling a single scoped `where` query. Best for Strategy A but the most work (a write-path change). Deferred to discuss-phase per RESEARCH resolved-decision #3.

*(The literal tokens for path (b) are deliberately avoided in the source file so the `collectionGroup`/`onSnapshot` invariant greps stay at 0 — the same comment-hygiene Plan 02 applied for the snapshot-listener invariant.)*

## Zero-`collectionGroup` / Zero-`onSnapshot` / No-heavy-import — CONFIRMED

- `grep -c 'collectionGroup' app/home-feed-sources.js` → **0** · `grep -c 'onSnapshot' app/home-feed-sources.js` → **0**.
- `grep -cE "from './views/"` → **0** — derivation comes only from `./status-derivation.js`; the file never imports the heavy routed views.
- The 3 `try \{|catch` grep hits are all PROSE in comments (Plan 02 header line 12 + two #6 comments documenting that #6 is deliberately NOT wrapped) — there is NO actual try/catch block; sources let throws propagate to the engine (T-108-03).
- `node --check app/home-feed-sources.js` → **SYNTAX OK**.

## Grep Acceptance-Criteria Results (all PASS)

**Task 1:** `export async function source` count = **12** · `user?.role !== 'super_admin'` (#4 gate) · `where('status', '==', 'pending')` count = **3** (Plan 02 billing-decide + #4 users + #10 billing, all LOWERCASE) · `where('requested_by_uid', '==', user.uid)` (#10 ownership) · 2 distinct prefixes `user-pending:`/`billreq-own:` · scoping import present · #10 `SEVERITY.medium`.

**Task 2:** count = **16** · `where('project_status', 'in'` = **2** (#5a/#5b) · `where('project_status', '==', 'On-going')` = **2** (#11) · `where('project_status', '==', 'Completed')` = **4** total (Plan 02 #8 ×2 + #7 ×2) · `getDlpState(e) !== 'in-dlp'` (#7) · `THRESHOLDS.STAGE_CRITICAL_D`/`PROGRESS_CRIT_D`/`DLP_CRIT_D` drive severity · 4 distinct prefixes `project-overdue:`/`service-overdue:`/`stale-progress:`/`dlp-expiring:` · `getAssignedProjectCodes()` + `getAssignedServiceCodes()` both match.

**Task 3:** count = **17** · `where('status', '==', 'open')` (#6 subcollection) · `'issues'` ref + `Promise.all` inner fan-out · `where('project_code', 'in'` + `where('service_code', 'in'` (chunked scoped parent resolution) · composite `issue:{parentId}:{issueId}` dedupeKey · `collectionGroup` = **0** · `onSnapshot` = **0**.

## Runtime Spot-Checks — PENDING IN BROWSER

The plan's `<verify>` DevTools/Network assertions are browser-runtime checks and cannot run in this zero-build headless environment. Recorded as **pending-in-browser** for the verifier (reasoned-correct by code inspection):

- As super_admin, `await sourcePendingUserRegistrations(getCurrentUser())` → pending users; as any other role → `[]`. As an admin, `await sourceOwnBillingRequests(getCurrentUser())` → only own pending billing requests. (Gate + query filter guarantee it.)
- As operations_user, `sourceOverdueServices` → `[]` (getAssignedServiceCodes() = [] → early return) while `sourceOverdueProjects` → only assigned projects; as super_admin both return cross-dept rows. (Predicate semantics + scopeByCodes.)
- As operations_user with N assigned projects, Network tab shows ≤ N+1 issue reads for #6 (bounded, capped at 60); returned items carry `issue:{parentId}:{issueId}` and category `issue`; no whole-collection group read. (Chunked resolution + inner Promise.all + cap.)

## Task Commits

1. **Task 1: #4 pending user registrations + #10 own billing requests** — `f47632d9` (feat)
2. **Task 2: #5a/#5b overdue projects+services, #11 stale progress, #7 DLP expiring** — `52273810` (feat)
3. **Task 3: #6 open issues bounded fan-out** — `0d5a6cc7` (feat)

## Files Created/Modified

- `app/home-feed-sources.js` (**modified**) — merged `getAssignedProjectCodes`/`getAssignedServiceCodes` into the utils import and added `stageDaysInStage`/`getEngagementSignal` to the status-derivation import; appended 7 source functions (#4/#10/#5a/#5b/#11/#7/#6), the `scopeByCodes` helper, `FUNNEL_STATUSES`, and `OPEN_ISSUES_PARENT_CAP`. File now exports 17 `source*` functions; still no registry.

## Decisions Made

- **Single self-scoping source per concern (no per-role variants):** #5a/#5b/#11/#7/#6 all call `getAssigned*Codes()`; the registry (Plan 04) decides which roles list them, the source decides which data (D-04, T-108-01/02).
- **#6 ships bounded fan-out (a), scale paths deferred:** the collection-group-index and `open_issue_count` denormalization are recorded as the out-of-scope scale path (RESEARCH resolved-decision #3) rather than built now.
- **getEngagementSignal for subtitle only:** severity is recomputed from `THRESHOLDS` (gotcha 5); the signal text is cosmetic context on #5a/#5b rows.
- **Comment-hygiene for the invariant greps:** avoided the literal `collectionGroup`/`onSnapshot` tokens in code/comments (including rewording one Plan 02 section comment) so the security invariant greps stay at 0.

## Deviations from Plan

**1. [Rule 3 - Blocking] Reworded a Plan 02 section comment to keep the `collectionGroup` invariant grep at 0**
- **Found during:** Task 2 verification (`grep -c 'collectionGroup'` returned 1).
- **Issue:** Plan 02 left the literal token `collectionGroup` in the "PROCUREMENT — SCOPED SCAN SOURCES" section header comment (line ~342). Task 3's acceptance criterion `grep -c 'collectionGroup' → 0` is a whole-file check and would have failed on this pre-existing comment.
- **Fix:** Reworded "The collectionGroup / denormalization escape hatches" → "The cross-collection group-read / denormalization escape hatches" (semantics unchanged; zero behavior change). Mirrors the exact comment-hygiene Plan 02 itself applied for the `onSnapshot` invariant.
- **Files modified:** `app/home-feed-sources.js`
- **Commit:** `52273810`

**2. [Rule 3 - Blocking] Reworded the `scopeByCodes` docstring to avoid inflating the source-count grep**
- **Found during:** Task 2 verification (`grep -c 'export async function source'` returned 17 instead of 16).
- **Issue:** The helper's docstring literally contained the phrase "NOT an \`export async function source\`", which the source-count grep matched — inflating the count by 1.
- **Fix:** Reworded to "A plain (non-exported, non-async) local helper — NOT a feed source". The count then correctly reflected 16 real functions.
- **Files modified:** `app/home-feed-sources.js`
- **Commit:** `52273810`

## Known Stubs

None — every source performs a real scoped Firestore read and shapes real D-11 rows. The file being imported-by-no-one is intentional dead code this plan (registry wiring is Plan 04's scope, stated in the objective), not a stub.

## Self-Check: PASSED

- `app/home-feed-sources.js` — FOUND (17 `export async function source*` — CONFIRMED)
- Commit `f47632d9` (Task 1) — FOUND
- Commit `52273810` (Task 2) — FOUND
- Commit `0d5a6cc7` (Task 3) — FOUND
- 7 distinct new dedupeKey prefixes · `getAssignedProjectCodes()`×7 · `getAssignedServiceCodes()`×7 · `collectionGroup`=0 · `onSnapshot`=0 · `node --check` OK — ALL PASS

---
*Phase: 108-home-per-role-attention-feeds*
*Completed: 2026-07-11*
