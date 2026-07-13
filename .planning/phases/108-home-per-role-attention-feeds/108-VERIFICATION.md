---
status: verified  # 5 human UAT items all PASSED 2026-07-13 (108-HUMAN-UAT.md)
phase: 108-home-per-role-attention-feeds
verified: "2026-07-11T07:47:58Z"
verifier: orchestrator-inline
requirements: [HOME-09, HOME-10, HOME-11, HOME-12, HOME-13]
must_haves_total: 18
must_haves_verified: 18
gaps: 0
human_verification_items: 5
note: >
  The delegated gsd-verifier confirmed "every code-level must-have is satisfied"
  but terminated before writing this file (account monthly spend limit). The
  orchestrator's independent per-wave spot-checks (greps + a Python ROLE_SOURCES
  name-resolution check) reproduce and record the same verdict here. The advisory
  gsd-code-review did not complete (same spend limit) — run /gsd-code-review 108 later.
---

# Phase 108 Verification — Home: Per-Role Attention Feeds

## Verdict

**Code-level: PASSED (18/18 must-haves).** All five role-feed definitions are
delivered as self-gating feed sources wired into a declarative per-role registry,
with Strategy A (no listeners; one batched `getDocs` per source) preserved and the
Command Center engine left pristine. **Runtime confirmation in a browser is the only
remaining step** (headless environment cannot render the SPA / exercise Firestore) —
5 in-browser UAT items are enumerated below → status `human_needed`.

## Method

Zero-build static SPA — no test runner/bundler/lint. Verification is source-read +
grep evidence + a name-resolution analysis, run by the orchestrator across all four
waves. Each plan's executor also passed its own Self-Check and `node --check`.

## Must-Haves Verified (against the live code)

### Plan 108-01 — app/status-derivation.js (leaf module)
| # | Must-have | Evidence | Status |
|---|-----------|----------|--------|
| 1 | 7 pure formulas + `URGENCY_THRESHOLDS` exported | `grep -c 'export function'` = 7; `export const URGENCY_THRESHOLDS` present | ✓ |
| 2 | No heavy imports / zero Firestore I/O (Strategy A "fast") | only `import { getRFPTotal } from './utils.js'`; `grep -cE "onSnapshot|getDocs|collection\(|query\(|from './views/|firebase"` = 0 | ✓ |
| 3 | RFP `due_date` format confirmed `YYYY-MM-DD` (gates #9) | 01-SUMMARY: `<input type="date">` → written unmodified `due_date: dueDate` at procurement.js 1873/1994/2097 | ✓ |

### Plan 108-02 — 10 Finance/Procurement sources
| # | Must-have | Evidence | Status |
|---|-----------|----------|--------|
| 4 | 10 functional sources exist | `grep -c 'export async function source'` = 10 | ✓ |
| 5 | 4 costly sources scope `where()` before client filter | `where('due_date','<',…)` ×2 (#9,#14) + `procurement_status 'in'` (#17) + `=='Delivered'` (#19) = 4 | ✓ |
| 6 | Case-sensitive status literals | lowercase `'pending'` (billing_requests); Capitalized `'Pending'/'Rejected'/'Delivered'/'Completed'` (procurement chain) | ✓ |
| 7 | No onSnapshot; imports status-derivation not views | `grep -c onSnapshot` = 0; 0 imports from `./views/finance|projects|services` | ✓ |
| 8 | `THRESHOLDS` D-01 bands drive money/PO-age severity | `export const THRESHOLDS` present; `MONEY_CRIT_D`/`PO_AGE_CRIT_D` referenced | ✓ |

### Plan 108-03 — +7 portfolio/admin sources (→17)
| # | Must-have | Evidence | Status |
|---|-----------|----------|--------|
| 9 | 7 cross-dept/admin sources appended; 17 total | `grep -c 'export async function source'` = 17 (17 distinct real fn names) | ✓ |
| 10 | Self-scoping via getAssigned*Codes (null=all/[]=none) | `getAssignedProjectCodes()` ×7, `getAssignedServiceCodes()` ×7; no ad-hoc role branching | ✓ |
| 11 | #6 open-issues = bounded chunked fan-out | chunked `where('project_code'/'service_code','in',chunk)` + parent cap 60 + inner `Promise.all`; `grep -c collectionGroup` = 0 | ✓ |
| 12 | Severity recomputed from D-01 THRESHOLDS (not signal.level) | STAGE_/PROGRESS_/DLP_ bands referenced in source bodies | ✓ |
| 13 | Distinct dedupeKey prefixes (gotcha 13) | `project-overdue`, `service-overdue`, `stale-progress`, `dlp-expiring`, `user-pending`, `billreq-own`, `issue:` all distinct from `retention-release` | ✓ |

### Plan 108-04 — registry wiring + engine seam (→20)
| # | Must-have | Evidence | Status |
|---|-----------|----------|--------|
| 14 | getSourcesForUser returns exact per-role sets, 7 roles | Python parse of ROLE_SOURCES: super_admin 6 · operations_admin 6 · services_admin 6 · operations_user 5 · services_user 5 · finance 6 · procurement 4 (matches spec) | ✓ |
| 15 | Registry references only defined functions (no module-load ReferenceError) | 20 defined = 20 referenced, **0 missing**, 0 orphan | ✓ |
| 16 | 3 seeds + scopeProposalToDept moved; approver gate unchanged | source count 20; `['super_admin','operations_admin']` gate intact; services_admin self-gates to [] | ✓ |
| 17 | Engine pristine except the import/re-export | `export async function source` in home-feed.js = 0; rankItems/dedupeItems/rollUpByCategory/capItems/assembleFeed/SEVERITY retained; `assembleFeed(user, sources = getSourcesForUser(user))`; proposals.js import relocated | ✓ |
| 18 | No onSnapshot anywhere; consumer import resolves | onSnapshot 0/0; `home.js:23 import { assembleFeed, getSourcesForUser } from '../home-feed.js'` resolves via re-export | ✓ |

## Requirement Coverage (HOME-09 … HOME-13)

| Req | Delivered by | Status |
|-----|--------------|--------|
| HOME-09 (Super Admin) | ROLE_SOURCES.super_admin = ProposalsAwaitingApproval · PendingUserRegistrations · OverdueProjects · OverdueServices · DlpWindowsExpiring · OverdueRfpPayments | ✓ code |
| HOME-10 (Ops/Services Admin) | ROLE_SOURCES.operations_admin / services_admin = ProposalsAwaitingApproval · Overdue{Projects|Services} · DlpWindowsExpiring · OpenIssues · StaleProgress · OwnBillingRequests | ✓ code |
| HOME-11 (Ops/Services User) | ROLE_SOURCES.operations_user / services_user = MyProposalsForRevision · Overdue{Projects|Services} · OpenIssues · MyRejectedMRFs · StaleProgress | ✓ code |
| HOME-12 (Finance) | ROLE_SOURCES.finance = PendingPRs · PendingTRs · OverdueRfpPayments · BillingRequestsToDecide · CollectiblesOverdue · RetentionReleases | ✓ code |
| HOME-13 (Procurement) | ROLE_SOURCES.procurement = MrfsPendingProcessing · AgingPOs · RejectedTRs · DeliveredPOsMissingProof | ✓ code |

All 5 requirement IDs accounted for; 0 unmapped.

## Gaps

None at the code level.

## Human Verification (in-browser — pending, headless env cannot run)

1. **Per-role feed render** — Sign in (or stub `getCurrentUser`) as each of the 7 roles; `await assembleFeed(getCurrentUser())` returns `{ items[], total }` with **no ReferenceError** and **no "cannot access SEVERITY before initialization"** (confirms the engine↔sources cycle is benign at runtime); the Command Center renders the rows.
2. **Role-appropriate content** — finance feed shows `pr-pending:`/`tr-pending:` items; procurement shows `mrf-pending:`/`po-aging:`; super_admin shows `proposal-approval:`/`user-pending:`/`project-overdue:`.
3. **Strategy-A scoping (Network tab)** — costly sources #9/#14/#17/#19 issue *scoped* reads (a `due_date`/`procurement_status` filter), not whole-collection scans; #6 open-issues issues ≤ (assigned parents + 1) reads (bounded fan-out).
4. **Assignment isolation** — as `operations_user`, `sourceOverdueServices` → `[]` (no service assignment) while `sourceOverdueProjects` returns only assigned project_codes; as `super_admin` both return cross-department rows.
5. **Deep-link clicks** — each item's `deepLink` routes/opens the correct destination (`#/finance`, `#/finance/collectibles`, `#/procurement/records`, `#/projects`, `#/services`, `#/admin?section=user-management`).

These are the same items the four plan SUMMARIES flagged "pending-in-browser." They gate the phase's *observable* success criteria (SC-1…SC-4) but do not indicate any code defect found.
