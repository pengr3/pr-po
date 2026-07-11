---
phase: 108-home-per-role-attention-feeds
plan: 02
subsystem: ui
tags: [home-feed, feed-sources, finance, procurement, strategy-a, status-derivation, case-sensitive-status]

# Dependency graph
requires:
  - phase: 108-01
    provides: app/status-derivation.js (deriveRFPStatus/deriveCollectibleStatus/getCollectibleUrgency/getDlpState/normalizeUpdatedAt) + confirmed RFP due_date=YYYY-MM-DD
  - phase: 107-command-center
    provides: locked home-feed.js engine + D-11 item contract + SEVERITY export + 3 seed sources (the template)
provides:
  - "app/home-feed-sources.js — scaffold (imports + THRESHOLDS D-01 bands) + 10 Finance/Procurement functional feed sources"
  - "THRESHOLDS constant (D-01 severity bands) for downstream Plan 03/04 sources"
affects: [108-03, 108-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Feed source = one server-scoped getDocs → client-derive on reduced set → D-11 item[] (mirrors home-feed.js seed sources)"
    - "Costly sources scope server-side FIRST (due_date string-range / procurement_status where) before any client filter (107.6 full-scan precedent)"
    - "Case-sensitive Firestore status literals asserted by grep (lowercase billing_requests 'pending'; Capitalized procurement chain)"

key-files:
  created:
    - app/home-feed-sources.js
  modified: []

key-decisions:
  - "10 sources are dept-agnostic FUNCTIONAL feeds — no ad-hoc role branching; they self-gate via their scoped query and stay inert until Plan 04's registry lists them"
  - "#9 sourceOverdueRfpPayments covers BOTH overdue and due-this-week (cutoff = today + MONEY_DUE_SOON_D) since HOME-12 wording is 'RFPs overdue/due this week'"
  - "#8 sourceRetentionReleases spans projects + services in one inner Promise.all, single interleaved list (D-04); origin shown only via subtitle (category 'dlp' for both)"
  - "No registry / getSourcesForUser added here — file is dead code (imported by no one) so the running app still shows the 3 seed sources for everyone (no broken intermediate state)"

patterns-established:
  - "THRESHOLDS (D-01 bands) is the single declarative tuning point for feed severity, distinct from status-derivation's URGENCY_THRESHOLDS portfolio bands"

requirements-completed: [HOME-12, HOME-13]

# Metrics
duration: ~15min
completed: 2026-07-11
---

# Phase 108 Plan 02: Finance + Procurement Feed Sources Summary

**Created app/home-feed-sources.js — the scaffold (imports + D-01 THRESHOLDS) plus 10 dept-agnostic functional feed sources (6 Finance HOME-12 + 4 Procurement HOME-13) that mirror the home-feed.js seed template: one server-scoped getDocs each, D-11 item shape, failures propagating to the engine's per-source try/catch; the four costly sources (#9/#14/#17/#19) scope server-side before any client filter, and status literals use the exact case-sensitive casing (lowercase 'pending' for billing_requests, Capitalized for the procurement chain).**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-11
- **Tasks:** 3 (all code)
- **Files created:** 1 (`app/home-feed-sources.js`, 10 source functions)
- **Files modified:** 0

## The 10 Sources

| # | Function | HOME | Query (server scope) | dedupeKey prefix | category | deepLink | Severity rule |
|---|----------|------|----------------------|------------------|----------|----------|---------------|
| 12 | `sourcePendingPRs` | 12 (finance) | `prs where finance_status=='Pending'` | `pr-pending:` | `pr` | route `#/finance` | fixed **high** |
| 13 | `sourcePendingTRs` | 12 (finance) | `transport_requests where finance_status=='Pending'` | `tr-pending:` | `tr` | route `#/finance` | fixed **high** |
| — | `sourceBillingRequestsToDecide` | 12 (finance) | `billing_requests where status=='pending'` (LOWERCASE) | `billreq-decide:` | `finance` | route `#/finance/collectibles` | fixed **high** |
| 16 | `sourceMrfsPendingProcessing` | 13 (procurement) | `mrfs where status=='Pending'` | `mrf-pending:` | `mrf` | route `#/procurement/mrfs` | fixed **high** |
| 18 | `sourceRejectedTRs` | 13 (procurement) | `transport_requests where finance_status=='Rejected'` | `tr-rejected:` | `tr` | route `#/procurement/records` | fixed **high** |
| 9 | `sourceOverdueRfpPayments` | 09/12 | **COSTLY** `rfps where due_date < (today+7d)` string range, then client-exclude `deriveRFPStatus==='Fully Paid'` | `rfp-overdue:` | `rfp` | route `#/finance` | `>MONEY_CRIT_D(30)`→critical · `>=0d`→high · future(due≤7d)→medium |
| 14 | `sourceCollectiblesOverdue` | 12 (finance) | **COSTLY** `collectibles where due_date < today` string range, then client `deriveCollectibleStatus==='Overdue'` | `collectible-overdue:` | `finance` | route `#/finance/collectibles` | urgency tier `critical`(≥30d)→critical · else high |
| 8 | `sourceRetentionReleases` | 12 (finance) | `projects` + `services where project_status=='Completed'` (inner Promise.all), then client `getDlpState==='expired'` | `retention-release:` | `dlp` | route `#/finance` | fixed **high** |
| 17 | `sourceAgingPOs` | 13 (procurement) | **COSTLY** `pos where procurement_status in ['Pending Procurement','Pending','Procuring','Procured']`, then client age from `updated_at ?? date_issued` | `po-aging:` | `po` | route `#/procurement/records` | `>PO_AGE_CRIT_D(30)`→critical · else high (only surfaces `>PO_AGE_HIGH_D(14)`) |
| 19 | `sourceDeliveredPOsMissingProof` | 13 (procurement) | **COSTLY** `pos where procurement_status=='Delivered'`, then client `!proof_url && !proof_remarks` | `po-noproof:` | `po` | route `#/procurement/records` | fixed **high** |

Icons (from `notifications.js` TYPE_META): PR_REVIEW_NEEDED, TR_REVIEW_NEEDED, BILLING_REQUEST_SUBMITTED, MRF_SUBMITTED, RFP_REVIEW_NEEDED, COLLECTIBLE_CREATED, PROJECT_COST_CHANGED (retention), PO_DELIVERED (aging + no-proof).

## Costly-Source Server-Side Scoping — CONFIRMED (Strategy A preserved)

All four costly sources issue a scoped `where()` BEFORE any client filter (mirrors the 107.6 `pos` full-scan fix), never a whole-collection scan:

- **#9 RFP** — `where('due_date', '<', cutoff)` where `cutoff = today + MONEY_DUE_SOON_D(7)d` as `YYYY-MM-DD` (string range SAFE per Plan 01's confirmed RFP `due_date` format), THEN client-excludes Fully-Paid.
- **#14 collectibles** — `where('due_date', '<', todayISO)` (collectibles `due_date` is `YYYY-MM-DD`, finance.js:139), THEN client `deriveCollectibleStatus==='Overdue'`.
- **#17 aging POs** — `where('procurement_status', 'in', [...active...])` (Delivered/Cancelled excluded server-side), THEN client age-band.
- **#19 delivered POs** — `where('procurement_status', '==', 'Delivered')` (subset first, since you can't `where()` on an absent field), THEN client absent-proof filter.

`grep -cE "where\('due_date', ?'<'"` → **2** (#9, #14); `grep "where('procurement_status', 'in'"` and `where('procurement_status', '==', 'Delivered')` both match.

## Case-Sensitive Status Literals — CONFIRMED (gotcha 2)

- **LOWERCASE** `'pending'` — `billing_requests.status` (sourceBillingRequestsToDecide). A casing slip here silently never-matches.
- **Capitalized** — `prs`/`transport_requests.finance_status` (`'Pending'`, `'Rejected'`), `mrfs.status` (`'Pending'`), `pos.procurement_status` (`'Delivered'` + active set), `projects`/`services.project_status` (`'Completed'`). Verified against finance.js:5285/5343 and RESEARCH § Field & Status Reference.

## Zero-onSnapshot / No-heavy-import Confirmation

- `grep -c 'onSnapshot' app/home-feed-sources.js` → **0** (each source is one batched `getDocs`; the "no persistent snapshot listeners" comment was worded to avoid the literal token so the invariant grep stays clean).
- `grep -nE "from './views/"` → **no matches** — does NOT import finance.js/projects.js/services.js; derivation comes only from `./status-derivation.js`, plus `./firebase.js`, `./home-feed.js` (SEVERITY), `./notifications.js` (TYPE_META), `./utils.js` (getRFPTotal).
- `grep -nE "try \{|catch"` → **no matches** — sources let throws propagate to `assembleFeed`'s per-source try/catch (T-107-03), as mandated.
- `node --check app/home-feed-sources.js` → **SYNTAX OK**.

## Grep Acceptance-Criteria Results (all PASS)

**Task 1:** `export async function source` count = **5** · `where('finance_status', '==', 'Pending')` (×2, #12/#13) · `where('status', '==', 'pending')` (billing, lowercase) · `where('status', '==', 'Pending')` (#16) · `where('finance_status', '==', 'Rejected')` (#18) · `export const THRESHOLDS` + `STAGE_CRITICAL_D: 14` · 5 dedupe prefixes · no `onSnapshot`/views imports.

**Task 2:** count = **8** · `where('due_date', '<', ...)` ×2 (#9/#14) · `deriveRFPStatus(rfp) === 'Fully Paid'` · `deriveCollectibleStatus(coll) !== 'Overdue'` · `getDlpState(e) !== 'expired'` · `where('project_status', '==', 'Completed')` ×2 · 3 dedupe prefixes · `THRESHOLDS.MONEY_CRIT_D`.

**Task 3:** count = **10** · `where('procurement_status', 'in'` (#17) · `where('procurement_status', '==', 'Delivered')` (#19) · `po.proof_url || po.proof_remarks` (#19) · 2 dedupe prefixes · `THRESHOLDS.PO_AGE_CRIT_D` · `onSnapshot` count = **0**.

## Runtime Spot-Checks — PENDING IN BROWSER

The plan's `<verify>` DevTools/Network assertions are browser-runtime checks and cannot be executed in this zero-build headless environment. Recorded as **pending-in-browser** for the verifier (reasoned-correct by code inspection):

- As a finance user, `await sourcePendingPRs(getCurrentUser())` → rows only from `prs` with `finance_status==='Pending'`, each carrying `dedupeKey` prefix `pr-pending:`. (Query filter guarantees it.)
- Network tab: #9/#14 issue a `due_date`-ranged read (not a whole-collection scan); #17/#19 issue a `procurement_status`-scoped read. (Confirmed by the `where()` clauses.)
- As a procurement user: #17 returns only active-status POs older than 14d; #19 returns only Delivered POs lacking both proof fields. (Confirmed by the age gate + absent-proof filter.)

## Task Commits

1. **Task 1: scaffold + 5 action-state sources** — `737552e6` (feat)
2. **Task 2: #9 RFP / #14 collectibles / #8 retention money-derivation sources** — `b33c7d6f` (feat)
3. **Task 3: #17 aging POs / #19 delivered POs missing proof scan sources** — `50d87405` (feat)

## Files Created/Modified

- `app/home-feed-sources.js` (**created**) — header imports (`db/collection/query/where/getDocs`, `SEVERITY`, `TYPE_META`, `getRFPTotal`, and the 5 derivation formulas from `status-derivation.js`); `export const THRESHOLDS` (D-01 bands); 10 `export async function source*` functions. No registry, no `getSourcesForUser`.

## Decisions Made

- **Functional, self-gating sources (no role branching):** the 10 sources are dept-agnostic — they filter purely by their natural query and stay inert until Plan 04's registry lists them (T-108-02). No `getSourcesForUser`/`ROLE_SOURCES` added here (that is Plan 04).
- **#9 covers overdue AND due-this-week:** HOME-12 wording is "RFPs overdue/due this week", so the cutoff is `today + 7d` and severity drops to `medium` for not-yet-due-but-within-7d RFPs.
- **#8 interleaves projects + services:** one inner `Promise.all` over both Completed-scoped collections, single list, origin shown via subtitle only (both category `'dlp'`), per D-04.
- **Comment hygiene for the `onSnapshot` invariant:** deliberately avoided the literal token `onSnapshot` in comments so `grep -c 'onSnapshot'` stays at 0 (the invariant check).

## Deviations from Plan

None — plan executed exactly as written. The Task 2 conditional fallback (a bounded recent-window scan if RFP `due_date` were NOT `YYYY-MM-DD`) did NOT trigger: Plan 01 confirmed the `YYYY-MM-DD` format, so the `where('due_date','<', cutoff)` string range was used as specified.

## Known Stubs

None — every source performs a real scoped Firestore read and shapes real rows. No placeholder/empty-value stubs and no unwired data. The file being imported-by-no-one is intentional dead code this plan (registry wiring is Plan 04's scope, stated in the plan objective), not a stub.

## Self-Check: PASSED

- `app/home-feed-sources.js` — FOUND
- Commit `737552e6` (Task 1) — FOUND
- Commit `b33c7d6f` (Task 2) — FOUND
- Commit `50d87405` (Task 3) — FOUND
- 10 `export async function source*` — CONFIRMED (grep)
- `onSnapshot` count 0 · 4 costly sources scoped server-side · case-sensitive literals · `node --check` OK — ALL PASS

---
*Phase: 108-home-per-role-attention-feeds*
*Completed: 2026-07-11*
