# Phase 108: Home — Per-Role Attention Feeds - Research

**Researched:** 2026-07-11
**Domain:** Feed source functions + role→source registry for the (locked) Phase-107 Command Center engine
**Confidence:** HIGH (all findings verified against live `app/` code this session)

<user_constraints>
## User Constraints (from 108-CONTEXT.md)

### Locked Decisions (do NOT research alternatives)
- **107 engine is LOCKED** — item model, `rankItems`/`dedupeItems`/`rollUpByCategory`/`capItems`, `assembleFeed`, per-source try/catch, cap 8/25, roll-up ≥5, dedupe-by-key-keep-highest-severity. This phase adds SOURCES + REGISTRY only.
- **Strategy A (107 D-08 / 107.6):** compute-on-load, batched `getDocs` per source, sources run in a `Promise.all` parallel wave, counts via `getAggregateFromServer`. NO `onSnapshot` listeners, NO TTL cache. Every source = one plain `async (user) => item[]`, isolated in the engine's per-source try/catch.
- **Source contract (107 D-11):** `{ dedupeKey, severity, icon, title, subtitle, category, deepLink, timestamp, overdueScore, isRollup? }`.
- **Severity model (D-01):** bands per source family (table reproduced in the per-source spec below). Proposal sources keep 107 tuning. Aging POs banded like overdue-in-stage (>14d high, >30d critical).
- **Scoping (D-04):** reuse `getAssignedProjectCodes`/`getAssignedServiceCodes`, `PROJECT_SEE_ALL_ROLES`/`SERVICE_SEE_ALL_ROLES` (utils.js), `scopeProposalToDept` (home-feed.js). super_admin = single interleaved cross-dept list; dept admins = their dept; `*_user` = assigned only; Finance/Procurement = functional sources. Do NOT reinvent scoping.
- **D-03:** keep generic engine ranking + cap + roll-up. No per-role pinning. Severity bands do the prioritization.

### Claude's Discretion (research + recommend — done below)
- Where the new sources live (module placement) → **§ Registry Shape & Module Placement**.
- Registry config shape (declarative table preferred) → **§ Registry Shape & Module Placement**.
- Per-source `category` / `icon` / `dedupeKey` prefix / `deepLink` → **§ Per-Source Spec Table**.
- Derivation-helper locations + aggregation/index needs → **§ Derivation-Helper Reuse Map** + **§ Costly Sources & Optimizations**.

### Deferred Ideas (OUT OF SCOPE — ignore)
- Executive Dashboard (DASH-*) → Phase 109. Mobile Command Center → Phase 111. Live per-source listeners → future. Project-journal activity enrichment → future.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (feed definition) | Research support |
|----|------------------------------|------------------|
| HOME-09 | **Super Admin:** proposals awaiting approval · pending user registrations · most-overdue projects/services (both depts) · DLP windows expiring · overdue RFP payments | Sources 1, 4, 5a/5b, 7, 9 below — all verified derivable |
| HOME-10 | **Ops/Services Admin:** dept proposals awaiting approval · overdue in-stage (dept) · DLP expiring (dept) · open issues & stale progress (dept) · own billing requests | Sources 1, 5a/5b, 6, 7, 10, 11 |
| HOME-11 | **Ops/Services User:** my proposals For Revision · overdue stages on assigned items · open issues on my items · my rejected MRFs · no progress update in 14d | Sources 2, 3, 5a/5b, 6, 10 (seed 2+3 reused) |
| HOME-12 | **Finance:** PRs pending · TRs pending · RFPs overdue/due-this-week · billing requests to decide · collectibles overdue · retention releases to record | Sources 9, 12, 13, 14, 15, 8 |
| HOME-13 | **Procurement:** MRFs pending processing · aging POs to advance · rejected TRs to re-edit · delivered POs missing proof-of-procurement | Sources 16, 17, 18, 19 |
</phase_requirements>

## Summary

The Phase-107 engine and its three seed sources (`sourceProposalsAwaitingApproval`, `sourceMyProposalsForRevision`, `sourceMyRejectedMRFs`) are fully built in `app/home-feed.js` and already exercise the exact patterns Phase 108 must repeat: scoped `getDocs`, self-gating by role/uid/full_name, both deep-link kinds, `TYPE_META` icons, `overdueScore`, and dedupe keys. Phase 108 adds ~16 new source functions (bringing the library to ~19) and replaces the `getSourcesForUser(user)` stub (which currently returns all three seed sources for everyone) with a declarative role→source-set registry.

**The single biggest finding — and the primary decision the planner must make — is that every derivation helper the sources need to reuse is module-private inside a giant routed view file.** `deriveCollectibleStatus` / `getCollectibleUrgency` / `deriveRFPStatus` / `derivePOSummary` live in `finance.js` (7,000+ lines) and only `render`/`init`/`destroy` are exported. `getProjectSignal` / `getServiceSignal` / `getDlpState` / `stageDaysInStage` / `normalizeUpdatedAt` live in `projects.js` and `services.js` (duplicated between them) and are likewise unexported. `getAgeInStageDays` / `isOverdueInStage` / `STAGE_ORDER` in `proposals.js` ARE exported and already imported by the engine — that is the model to follow. You cannot `import` the finance/projects helpers without either (a) exporting them (which eagerly loads a heavy routed view into the landing-page critical path, defeating Strategy A "fast") or (b) copying the canonical formulas into a lightweight shared module.

**Read-cost:** most sources are cheap scoped `where` queries. Four are costly and must be optimized (matching the 107.6 `pos` full-scan precedent): open-issues (subcollection fan-out — the worst), collectibles-overdue, overdue-RFP-payments, and most-overdue-projects/services. The `due_date` string-range trick (`where('due_date','<', todayISO)`) server-side-filters collectibles and RFPs; scoped `where('project_status', 'in', [...])` bounds the engagement scans; delivered-POs-missing-proof scopes to `where('procurement_status','==','Delivered')` first.

**Primary recommendation:** Create TWO new files — `app/home-feed-sources.js` (the ~16 sources + the declarative `ROLE_SOURCES` registry + a `THRESHOLDS` constant) and `app/status-derivation.js` (the pure derivation formulas, extracted-by-copy from their canonical source lines, exported once). Keep `app/home-feed.js` as the pristine engine; have its `getSourcesForUser` delegate to the registry. Do not touch finance.js/projects.js/services.js this phase (accept temporary duplication, flag as hygiene).

## Architectural Responsibility Map

Every capability here is **client-tier read-derivation** over Firestore. There is no server; "tiers" map to module responsibilities.

| Capability | Primary owner | Secondary | Rationale |
|------------|---------------|-----------|-----------|
| Feed ranking / cap / roll-up / dedupe / render | `home-feed.js` engine (LOCKED) | — | 107 owns it; sources never touch it |
| Role→source selection | `getSourcesForUser` (seam) → new `home-feed-sources.js` registry | — | D-10 seam; declarative table |
| Per-source Firestore read + item shaping | new `home-feed-sources.js` sources | `firebase.js` (db/query/where/getDocs) | one batched read each, self-gating |
| Status/urgency/DLP/collectible/RFP derivation | new `app/status-derivation.js` (extract-by-copy) | canonical: finance.js, projects.js | pure functions, no I/O; single home going forward |
| Scoping predicates | `utils.js` (`getAssignedProjectCodes`/`getAssignedServiceCodes`, SEE_ALL role sets) — reuse as-is | `home-feed.js` `scopeProposalToDept` | D-04 locked; already reads `window.getCurrentUser()` |
| Icons | `notifications.js` `TYPE_META` (reuse keys) | — | engine is icon-agnostic |
| Deep-link routing | `router.js` hashes + home.js `homeQueueOpen*Modal` handlers | — | targets verified below |

## Per-Source Spec Table

Legend: **Sev** = severity rule (from D-01). **Read** = the Firestore query. **Helper** = derivation reused. **Cost** = full-scan risk (see § Costly Sources). Seed = already built in home-feed.js (reuse verbatim).

### Seed sources (reuse as-is; wire into new role arrays)

| # | Source | HOME | Roles | Read | deepLink | Notes |
|---|--------|------|-------|------|----------|-------|
| 1 | `sourceProposalsAwaitingApproval` (SEED) | 09,10 | super_admin, operations_admin | `proposals where status=='pending_internal'` + client dept-scope via `scopeProposalToDept` | modal `homeQueueOpenApproveModal` | approver gate already inside; self-scopes dept. **Note:** current gate is `['super_admin','operations_admin']` — services_admin does NOT internally approve, matches HOME-10 wording ("dept proposals awaiting approval" only applies where the role is an approver). Confirm services_admin exclusion is intended. |
| 2 | `sourceMyProposalsForRevision` (SEED) | 11 | operations_user, services_user (also admins) | `proposals where created_by==uid AND status=='for_revision'`, gate age>7d | route `#/?tab=proposals` | overdue-only per B4 |
| 3 | `sourceMyRejectedMRFs` (SEED) | 11 | operations_user, services_user | `mrfs where requestor_name==full_name AND status=='Rejected'` | route `#/procurement/records` | fixed high |

### New sources (build this phase)

| # | Source (recommend name) | HOME | Roles | Read (query) | Helper reused | Category / icon / dedupeKey | deepLink | Sev rule (D-01) | Cost |
|---|--------------------------|------|-------|--------------|---------------|------------------------------|----------|-----------------|------|
| 4 | `sourcePendingUserRegistrations` | 09 | super_admin | `users where status=='pending'` (lowercase) — see user-management.js:246-250 | none | `issue`* / `REGISTRATION_PENDING` / `user-pending:{id}` | route `#/admin` (section=user-management) | fixed **high** (action state) | cheap |
| 5a | `sourceOverdueProjects` | 09,10,11 | super_admin, operations_admin, operations_user | `projects where project_status in [funnel+On-going]`, then client `getProjectSignal`; self-scope via `getAssignedProjectCodes()` (null=see-all) | `getProjectSignal`, `stageDaysInStage` | `project` / `PROJECT_STATUS_CHANGED` / `project-overdue:{id}` | route `#/projects` | overdue-in-stage: >14d **critical**, >7d **high** | **scan** (bounded — projects small) |
| 5b | `sourceOverdueServices` | 09,10,11 | super_admin, services_admin, services_user | `services where project_status in [...]`, client `getServiceSignal`; self-scope via `getAssignedServiceCodes()` | `getServiceSignal` | `service` / `PROJECT_STATUS_CHANGED` / `service-overdue:{id}` | route `#/services` | same as 5a | scan (bounded) |
| 6 | `sourceOpenIssues` | 10,11 | operations_admin, services_admin, operations_user, services_user | **subcollection fan-out**: resolve scoped project/service doc-ids, then `getDocs(<parent>/{id}/issues where status=='open')` per doc, chunked | issue schema (project-detail.js:3541) | `issue` / `MRF_REJECTED`* / `issue:{parentId}:{issueId}` | route `#/projects` or `#/services` detail | fixed **high** (open issue = action) | **⚠ N+1 — worst** (see § Costly) |
| 7 | `sourceDlpWindowsExpiring` | 09,10 | super_admin, operations_admin, services_admin | `projects/services where project_status=='Completed'`, client-filter `dlp_months` set AND `retention_released_at==null` AND `dlp_expires_at` within 14d | `getDlpState` (in-dlp), dlp expiry math | `dlp` / `PROJECT_COST_CHANGED`* / `dlp-expiring:{id}` | route `#/projects`/`#/services` | ≤3d **critical**, ≤7d **high**, ≤14d **medium** | scoped scan |
| 8 | `sourceRetentionReleases` | 12 | finance | `projects/services where project_status=='Completed'`, client-filter `getDlpState==='expired'` (dlp_expires_at past AND `retention_released_at==null`) | `getDlpState` (expired) | `dlp` / `PROJECT_COST_CHANGED`* / `retention-release:{id}` | route `#/finance` (or project detail) | fixed **high**; >Xd past expiry could bump critical | scoped scan |
| 9 | `sourceOverdueRfpPayments` | 09,12 | super_admin, finance | `rfps where due_date < todayISO` (string range) then client-exclude Fully-Paid via `deriveRFPStatus` | `deriveRFPStatus`, `getRFPTotal` (utils, exported) | `rfp` / `RFP_REVIEW_NEEDED` / `rfp-overdue:{id}` | route `#/procurement/records` (or `#/finance`) | money: >30d past-due **critical**, any past-due **high**, due ≤7d **medium** | **scan** → opt w/ due_date range |
| 10 | `sourceOwnBillingRequests` | 10 | operations_admin, services_admin | `billing_requests where requested_by_uid==uid AND status=='pending'` (lowercase) | none (billing_requests.js schema) | `finance` / `BILLING_REQUEST_SUBMITTED` / `billreq-own:{id}` | route `#/finance/collectibles` | fixed **medium** (tracking, not overdue) | cheap |
| 11 | *(covered by 6+5)* stale progress = On-going branch | 10 | operations_admin, services_admin | reuse 5a/5b On-going `last_activity_at` branch, OR dedicated `sourceStaleProgress` | `getProjectSignal` On-going path | `project`/`service` / `PROJECT_STATUS_CHANGED` / `stale-progress:{id}` | route detail | ≥30d **critical**, ≥14d **high** | scan (bounded) |
| 12 | `sourcePendingPRs` | 12 | finance | `prs where finance_status=='Pending'` (finance.js:5285) | none | `pr` / `PR_REVIEW_NEEDED` / `pr-pending:{id}` | route `#/finance` | fixed **high** | cheap |
| 13 | `sourcePendingTRs` | 12 | finance | `transport_requests where finance_status=='Pending'` (finance.js:5343) | none | `tr` / `TR_REVIEW_NEEDED` / `tr-pending:{id}` | route `#/finance` | fixed **high** | cheap |
| 14 | `sourceCollectiblesOverdue` | 12 | finance | `collectibles where due_date < todayISO` (string range) then client `deriveCollectibleStatus==='Overdue'` | `deriveCollectibleStatus`, `getCollectibleUrgency` | `finance` / `COLLECTIBLE_CREATED` / `collectible-overdue:{id}` | route `#/finance/collectibles` | money: >30d **critical**, any past-due **high**, due ≤7d **medium** | **scan** → opt w/ due_date range |
| 15 | *(= 8)* retention releases | 12 | finance | see #8 | — | — | — | — | — |
| 16 | `sourceMrfsPendingProcessing` | 13 | procurement | `mrfs where status=='Pending'` (capitalized) | none | `mrf` / `MRF_SUBMITTED` / `mrf-pending:{id}` | route `#/procurement/mrfs` | fixed **high** | cheap |
| 17 | `sourceAgingPOs` | 13 | procurement | `pos where procurement_status in ['Pending Procurement','Pending','Procuring','Procured']`, client age from `updated_at`??`date_issued` | none (band inline) | `po` / `PO_DELIVERED`* / `po-aging:{id}` | route `#/procurement/records` | age-in-status: >30d **critical**, >14d **high** | scoped scan |
| 18 | `sourceRejectedTRs` | 13 | procurement | `transport_requests where finance_status=='Rejected'` (mirrors loadRejectedTRs) | none | `tr` / `TR_REVIEW_NEEDED` / `tr-rejected:{id}` | route `#/procurement/records` | fixed **high** | cheap |
| 19 | `sourceDeliveredPOsMissingProof` | 13 | procurement | `pos where procurement_status=='Delivered'`, client-filter `!proof_url && !proof_remarks` | proof fields (proof-modal.js:105) | `po` / `PO_DELIVERED` / `po-noproof:{id}` | route `#/procurement/records` | fixed **high** | **scan** → scoped to Delivered |

`*` = no exact `TYPE_META` analogue; use the nearest listed key or add a same-style Heroicon path (engine is icon-agnostic — a new inline-SVG string is fine). Chip categories are all already in the 10-key taxonomy (`views.css` 107.1) — no new CSS.

**Source-count reconciliation:** ~20 feed-def bullets across HOME-09..13 collapse to **19 distinct source functions** (3 seed + 16 new). Several bullets are the SAME self-scoping source reused in multiple role arrays (proposals-awaiting → 09+10; overdue projects/services → 09+10+11; DLP expiring → 09+10; retention/collectibles → 12), exactly as the 3 seed sources already do. "Stale progress" (#11) and "no progress update in 14d" are the On-going branch of the engagement-urgency derivation — recommend a dedicated `sourceStaleProgress` with clean 14/30 bands rather than folding into 5a/5b, so the D-01 progress bands stay separate from the stage bands.

## Costly Sources & Optimizations

Mirror the 107.6 `pos` full-scan fix: scope server-side, derive client-side only on the reduced set. Every derived source that genuinely can't resolve returns `[]` (never fabricates).

| Source | Naïve cost | Optimization | Index needed? |
|--------|-----------|--------------|---------------|
| **#6 open issues** (WORST) | one `getDocs` per project/service subcollection → N+1, unbounded for dept admin | **Bounded case (HOME-11 user):** resolve `getAssignedProjectCodes()`/`getAssignedServiceCodes()` → doc-ids → per-id `getDocs(.../issues where status=='open')`, run the per-id reads inside the source's own `Promise.all`. N is small (a user's handful of assignments). **Unbounded case (HOME-10 dept admin):** flag — a dept can have dozens of projects. Options: (a) accept the bounded parallel fan-out (simplest, no infra); (b) `collectionGroup(db,'issues') where status=='open'` — ONE read, but requires a new collectionGroup **index** AND a security rule enabling group reads (`match /{path=**}/issues/{id}`) AND the issue doc does NOT carry `project_code`/`department`, so client-side assignment filtering is impossible without denormalizing parent identity onto each issue; (c) denormalize `open_issue_count` onto the project/service doc (write-path change at issue create/resolve/reopen + one-time backfill) → single scoped `where` query, best for Strategy A but most work. **Recommendation:** ship (a) for both, capped/chunked; record (c) as the scale path. This is a genuine planning decision — surface to discuss-phase. | (b) yes; (c) no |
| **#9 overdue RFP payments** | scan all `rfps`, derive per-doc | `where('due_date','<', todayISO)` — RFP `due_date` compared via `new Date(rfp.due_date)` (finance.js:93); string range works **iff** stored as `YYYY-MM-DD`. **VERIFY format first** (see Open Questions); if mixed formats, fall back to a bounded recent-window scan. Then client-exclude Fully-Paid. | single-field `due_date` (auto-indexed) |
| **#14 collectibles overdue** | scan all `collectibles` | `where('due_date','<', todayISO)` — collectibles `due_date` IS `YYYY-MM-DD` (finance.js:139 `coll.due_date+'T00:00:00'`), string range safe. Client `deriveCollectibleStatus==='Overdue'` (excludes fully-paid). | single-field `due_date` |
| **#5a/5b most-overdue projects/services** | scan all projects+services | `where('project_status','in',[active/funnel statuses])` to drop Completed/Loss; projects/services are near-static reference collections (106-FINDINGS F-025) so the scan is small. Optionally `getAggregateFromServer(count())` is NOT applicable (need docs to derive). | composite `project_status`+? only if adding orderBy |
| **#19 delivered POs missing proof** | scan all `pos` | `where('procurement_status','==','Delivered')` first (subset), then client `!proof_url && !proof_remarks` (can't `where` on absent field). | single-field `procurement_status` |
| **#17 aging POs** | scan all `pos` | `where('procurement_status','in',['Pending Procurement','Pending','Procuring','Procured'])` (active only), client age-band. | single-field `procurement_status` |

**Counts vs lists:** the feed sources need the actual docs (to shape rows), so `getAggregateFromServer` is for the 107 KPI chips, not these sources. Don't reach for aggregation here except where a source only needs "is there ≥1?" (none do).

## Derivation-Helper Reuse Map (the core landmine)

| Helper | Canonical location (verified) | Exported? | Sources needing it | Action |
|--------|-------------------------------|-----------|--------------------|--------|
| `getAgeInStageDays`, `isOverdueInStage`, `STAGE_ORDER`, `PROPOSAL_RANGE_STATUSES` | `proposals.js:36,123,134` | ✅ **exported** (engine already imports :37) | 1,2 | reuse via import — no change |
| `getRFPTotal`, `getRFPFees` | `utils.js:58,71` | ✅ **exported** | 9 | reuse via import |
| `getAssignedProjectCodes`, `getAssignedServiceCodes` | `utils.js:333,413` | ✅ **exported** (read `window.getCurrentUser()` internally, no arg) | 5a,5b,6,11 | reuse via import |
| `PROJECT_SEE_ALL_ROLES`/`SERVICE_SEE_ALL_ROLES` | `utils.js:318,319` | ❌ module-const (not exported) but the *behavior* is baked into `getAssigned*Codes` returning `null` for see-all | 5a,5b | rely on `getAssigned*Codes()===null` meaning "see all" — don't need the raw arrays |
| `deriveCollectibleStatus`, `getCollectibleUrgency`, `getCollectibleLastPayment` | `finance.js:110,129,159` | ❌ **private** | 14 | **cannot import** — extract-by-copy |
| `deriveRFPStatus` | `finance.js:89` | ❌ **private** (~11 lines, uses exported `getRFPTotal`) | 9 | extract-by-copy (trivial) |
| `derivePOSummary` | `finance.js:1014` | ❌ **private** | (not strictly needed — sources 9/17/19 use lighter checks) | skip unless PO payment-summary rows wanted |
| `getProjectSignal`, `computeUrgencySignals`, `stageDaysInStage`, `normalizeUpdatedAt`, `getDlpState`, `URGENCY_THRESHOLDS` | `projects.js:942,1024,925,911,897,53` | ❌ **private** | 5a,7,8,11 | extract-by-copy |
| `getServiceSignal`, `getDlpState`, `stageDaysInStage` (service mirror) | `services.js:971,952,944` | ❌ **private** (DUPLICATE of projects.js) | 5b,7,8,11 | extract-by-copy (unify with project version) |

**Why not just add `export`?** `finance.js` is 7,000+ lines and `projects.js`/`services.js` are the routed portfolio views. Importing any of them into `home-feed-sources.js` makes the browser eagerly fetch + parse those heavy modules on the **landing page**, defeating the router's lazy-loading and Strategy A's "fast" mandate (`home.js` → `home-feed.js` → `home-feed-sources.js` would pull the entire finance view graph into first paint). `proposals.js` is safe to import ONLY because Phase 87.1 already slimmed it to a listener-free helper module — that is the precedent to follow: put pure helpers in a lightweight module.

**Recommendation:** create `app/status-derivation.js` and copy the canonical formulas verbatim (cite source lines in comments): `normalizeUpdatedAt`, `stageDaysInStage`, `getDlpState`, `getEngagementSignal` (unify `getProjectSignal`+`getServiceSignal` — they're identical except the On-going one-time-service note), `deriveCollectibleStatus`, `getCollectibleUrgency`, `deriveRFPStatus`, and the `URGENCY_THRESHOLDS`/`THRESHOLDS` constants. Export all. Import into `home-feed-sources.js`. This honors D-02 "reuse the logic, don't re-derive" (same math, one new home) while keeping the phase surgical — **do NOT refactor finance.js/projects.js/services.js this phase** (touching those giant files risks regressions in shipped views). Record the temporary duplication (status-derivation.js vs the private view copies; and the pre-existing `deriveCollectibleStatus` dup in expense-modal.js noted at finance.js:106-108, and the projects/services urgency dup) as a hygiene item — a later pass points the views at the shared module.

## Field & Status Reference (case-sensitive — CLAUDE.md)

| Collection | Field | Values / shape | Source |
|------------|-------|----------------|--------|
| `proposals` | `status` | `'pending_internal'`,`'pending_client'`,`'for_revision'`,`'client_approved'`,`'loss'`,`'draft'` | proposals.js:36 |
| `proposals` | `current_status_since` / `created_at` | Firestore Timestamp | proposals.js:124 |
| `proposals` | `created_by` | uid string | home-feed.js seed 2 |
| `mrfs` | `status` | `'Pending'`,`'Approved'`,`'Rejected'`,`'In Progress'`,`'PR Rejected'`,`'TR Rejected'`,`'Finance Rejected'`,`'Cancelled'` (F-020 — real vocab wider than CLAUDE.md doc) | procurement.js:3004 |
| `mrfs` | `requestor_name` | == user.full_name (no uid on MRFs) | home-feed.js seed 3 |
| `mrfs` | `rejected_at` | ISO string (procurement.js:4943) | home-feed.js seed 3 |
| `prs` | `finance_status` | `'Pending'`,`'Approved'`,`'Rejected'` | finance.js:5285 |
| `transport_requests` | `finance_status` | `'Pending'`,`'Approved'`,`'Rejected'` | finance.js:5343 |
| `pos` | `procurement_status` | `'Pending Procurement'`,`'Pending'`,`'Procuring'`,`'Procured'`,`'Delivered'`,`'Cancelled'`,(subcon: `'Processing'`,`'Processed'`) | procurement.js:488-490,945 |
| `pos` | `proof_url`,`proof_remarks`,`proof_attached_at` | string, string, Timestamp — missing on POs never given proof | proof-modal.js:105-107 |
| `pos` | `updated_at` (ISO), `date_issued` (Timestamp) | `updated_at` bumped on every status change (procurement.js:7845) → age-in-status proxy | procurement.js:7843 |
| `rfps` | `due_date` | string (compared via `new Date()`; **verify YYYY-MM-DD**) | finance.js:93 |
| `rfps` | `payment_records[]` | `[{amount, date, status:'voided'?}]` | finance.js:90 |
| `rfps` | `po_id`,`tr_id`,`tranche_label`,`tranche_percentage` | join keys; `tranche_label!=='Delivery Fee'` for schedule | finance.js:1016 |
| `collectibles` | `due_date` | `'YYYY-MM-DD'` string (confirmed) | finance.js:139 |
| `collectibles` | `amount_requested`,`payment_records[]` (`status:'voided'`,`amount`,`date`) | overdue = past due & not fully paid | finance.js:110-151 |
| `collectibles` | `department`(`'services'`|else projects),`project_code`/`service_code`,`tranche_index` | scoping | finance.js:2072 |
| `billing_requests` | `status` | **lowercase** `'pending'`,`'approved'`,`'rejected'` | finance.js:2052 |
| `billing_requests` | `requested_by_uid`,`requested_by_name`,`department`,`project_code`/`service_code`,`amount_requested`,`tranche_label` | own-requests scoping | project-detail.js:1457-1471 |
| `users` | `status` | **lowercase** `'pending'` (+ `created_at` desc) | user-management.js:246-249 |
| `projects`/`services` | `project_status` | funnel: `'For Proposal'`,`'Proposal for Internal Approval'`,`'Proposal Under Client Review'`,`'For Revision'`,`'Client Approved'`,`'For Mobilization'`,`'For Inspection'`,`'On-going'`,`'Completed'`,`'Loss'` | projects.js:964-1000 |
| `projects`/`services` | `status_changed_at` (stage clock), `last_activity_at` (On-going activity clock), `updated_at`, `created_at` | ISO string AND/or Timestamp — normalize via `normalizeUpdatedAt` | projects.js:923-928,950-953 |
| `projects`/`services` | `dlp_months`,`dlp_expires_at`(`YYYY-MM-DD`),`retention_released_at`(Timestamp|null),`project_completed_at` | DLP state via `getDlpState` | dlp-retention-tranche.md; projects.js:897 |
| `projects/{id}/issues`, `services/{id}/issues` | `status` (`'open'`|`'resolved'`),`resolved_at`,`created_at`,`title`,`issue_type` | **no `project_code`/`department` on the issue doc** | project-detail.js:3541-3552 |

## Registry Shape & Module Placement (recommendation)

**Placement:**
- `app/home-feed.js` — **unchanged engine.** Its `getSourcesForUser(user)` becomes a one-line delegate to the registry (import from home-feed-sources.js). The 3 seed sources stay here (they're already here and exported) OR move to home-feed-sources.js for cohesion — recommend keeping them in home-feed.js and importing them into the registry file to avoid churn.
- `app/home-feed-sources.js` (NEW) — the 16 new source functions + `THRESHOLDS` const + `ROLE_SOURCES` registry. Imports seed sources from home-feed.js, derivation from status-derivation.js, scoping from utils.js, icons from notifications.js.
- `app/status-derivation.js` (NEW) — pure extracted formulas (see § Derivation-Helper Reuse Map).

To avoid a circular import (home-feed.js ↔ home-feed-sources.js), recommend: registry + role lookup live in **home-feed-sources.js**, and home-feed.js imports `getSourcesForUser` FROM home-feed-sources.js (one-directional: engine ← sources ← seeds). Since seed sources are defined in home-feed.js and imported by home-feed-sources.js, and the engine imports the registry from home-feed-sources.js, that IS a cycle. Cleanest break: **move the 3 seed source functions into home-feed-sources.js** alongside the new ones (they only depend on db/query/TYPE_META/proposals-helpers, not on the engine), and have home-feed.js import `getSourcesForUser` from home-feed-sources.js. Engine → sources, sources → nothing-in-engine. No cycle.

**Registry shape (declarative — D-02 discretion, preferred for Phase-109 extension):**
```js
// home-feed-sources.js
export const THRESHOLDS = {           // one place to tune D-01 bands
  STAGE_CRITICAL_D: 14, STAGE_HIGH_D: 7,
  DLP_CRIT_D: 3, DLP_HIGH_D: 7, DLP_MED_D: 14,
  PROGRESS_CRIT_D: 30, PROGRESS_HIGH_D: 14,
  MONEY_CRIT_D: 30, MONEY_DUE_SOON_D: 7,
  PO_AGE_CRIT_D: 30, PO_AGE_HIGH_D: 14,
};

const ROLE_SOURCES = {
  super_admin:      [sourceProposalsAwaitingApproval, sourcePendingUserRegistrations, sourceOverdueProjects, sourceOverdueServices, sourceDlpWindowsExpiring, sourceOverdueRfpPayments],
  operations_admin: [sourceProposalsAwaitingApproval, sourceOverdueProjects, sourceDlpWindowsExpiring, sourceOpenIssues, sourceStaleProgress, sourceOwnBillingRequests],
  services_admin:   [sourceProposalsAwaitingApproval /* self-gates: currently non-approver → []; keep for symmetry */, sourceOverdueServices, sourceDlpWindowsExpiring, sourceOpenIssues, sourceStaleProgress, sourceOwnBillingRequests],
  operations_user:  [sourceMyProposalsForRevision, sourceOverdueProjects, sourceOpenIssues, sourceMyRejectedMRFs, sourceStaleProgress],
  services_user:    [sourceMyProposalsForRevision, sourceOverdueServices, sourceOpenIssues, sourceMyRejectedMRFs, sourceStaleProgress],
  finance:          [sourcePendingPRs, sourcePendingTRs, sourceOverdueRfpPayments, sourceBillingRequestsToDecide, sourceCollectiblesOverdue, sourceRetentionReleases],
  procurement:      [sourceMrfsPendingProcessing, sourceAgingPOs, sourceRejectedTRs, sourceDeliveredPOsMissingProof],
};

export function getSourcesForUser(user) {
  if (!user) return [];
  return ROLE_SOURCES[user.role] || [];
}
```
Notes on the table: sources still **self-gate** (like the seed sources) so a mis-listed source degrades to `[]` rather than leaking. `sourceOverdueProjects`/`Services` self-scope via `getAssigned*Codes()` so the same function yields super=all, dept-admin=dept, user=assigned — no per-role variants needed. A separate `sourceBillingRequestsToDecide` (finance, `status=='pending'`) is distinct from `sourceOwnBillingRequests` (admin, `requested_by_uid==uid`). A per-source-threshold override map is unnecessary given the shared `THRESHOLDS`; if a source needs a bespoke band, read a named THRESHOLDS key inside it (keeps tuning declarative).

## Landmines / Gotchas

1. **Private derivation helpers (§ above).** The #1 gotcha. Do not `import` from finance.js/projects.js/services.js — extract to `status-derivation.js`.
2. **`billing_requests.status` and `users.status` are LOWERCASE** (`'pending'`), while procurement-chain statuses are Capitalized (`'Pending'`, `'Rejected'`, `'Delivered'`). Mixing casing → silent never-match (F-020). Sources 4, 10, 14-banner all use lowercase.
3. **Issue docs carry no parent identity** (`project_code`/`department`). A `collectionGroup('issues')` query cannot be assignment-filtered client-side without denormalizing — that's why the bounded per-assignment fan-out is recommended for #6.
4. **POs have no dedicated status-change timestamp.** `updated_at` (ISO) is bumped on status change (procurement.js:7845) — use it as the age-in-status proxy for #17, falling back to `date_issued`. Do NOT invent a `status_changed_at` on POs (unlike projects, which DO have one).
5. **`getProjectSignal` uses its OWN thresholds (`URGENCY_THRESHOLDS`, e.g. On-going 7/14), which differ from D-01 feed bands** (progress 14/30; DLP 3/7/14). Reuse the DATA/formulas (`stageDaysInStage`, `last_activity_at` recency, `getDlpState`, dlp-expiry math) but apply the **D-01 `THRESHOLDS`**, not the portfolio urgency levels. Don't just map `signal.level==='urgent'`→critical — recompute the band.
6. **`getDlpState` returns `'active'` for non-Completed projects** (projects.js:898) — DLP sources (#7,#8) MUST pre-filter `project_status==='Completed'` or they'll see nothing/everything wrong. `dlp_expires_at` is a stored `YYYY-MM-DD` string; compare with `new Date(dlp_expires_at)`.
7. **`due_date` string-range queries** (#9,#14) only work if the field is `YYYY-MM-DD`. Collectibles: confirmed. RFPs: **unverified format** — verify before shipping the range query (Open Question 1).
8. **Timestamp shapes are heterogeneous** — Firestore Timestamp, `{seconds}`, ISO string, Date. The engine's `toMillis` (home-feed.js:82) handles all four for the item `timestamp` field; for derivation use `normalizeUpdatedAt` (projects.js:911). Feed `timestamp` should be the "age since event/stage" clock the row displays.
9. **`scopeProposalToDept` returns `null` for super_admin (=see all)** and for any non-operations/services role — it's a dept discriminator, not an approver gate. The approver gate is the explicit `['super_admin','operations_admin']` check in seed source 1. services_admin currently does NOT internally approve; confirm the HOME-10 "dept proposals awaiting approval" wording tolerates services_admin getting `[]` here (Open Question 2).
10. **Deep-link `#/finance/collectibles`** is used by real notification links (project-detail.js:1492) and the 107 KPI map, so it's a valid finance sub-route. `#/admin` is a route (router.js:107); the `?section=user-management` query is how TYPE_META.REGISTRATION_PENDING targets it — verify the admin view reads that param, else land on `#/admin`.
11. **Sources run in `Promise.all`** — a source that itself fans out (e.g. #6 per-assignment issue reads) should use an INNER `Promise.all`, and any throw propagates to the engine's per-source catch (which counts it toward `allSourcesFailed`). Keep each source's total work bounded so one slow source doesn't stall the wave.
12. **`getAssignedProjectCodes()`/`getAssignedServiceCodes()` read `window.getCurrentUser()` with NO argument** — they always scope to the *current* signed-in user, which equals the feed `user`. Fine for the live feed; just don't expect to pass a different user in.
13. **Dedupe across sources:** an item surfacing from two sources (e.g. an On-going project that is BOTH stale (#11) and DLP-expiring (#7)) must use DISTINCT `dedupeKey` prefixes (`stale-progress:{id}` vs `dlp-expiring:{id}`) if you want both rows, or a SHARED key if you want the engine to keep only the highest-severity one. Decide intentionally per pair; default to distinct prefixes (they're different concerns).

## Per-Source Verification Hints (for the planner's task checks)

No automated test suite (nyquist disabled; zero-build SPA). Verify each source by DevTools console + grep:

| Source | Grep proof it's wired | Runtime proof |
|--------|----------------------|---------------|
| registry | `ROLE_SOURCES` has all 7 roles; `getSourcesForUser` returns `ROLE_SOURCES[user.role]` | log `getSourcesForUser({role:'finance'}).map(f=>f.name)` = 6 finance sources |
| each source | function name appears in exactly the right role arrays | in browser as each role, `await assembleFeed(getCurrentUser())` → inspect `.items` for the expected `dedupeKey` prefix + `category` + `severity` |
| scoping | source body calls `getAssigned*Codes()` or `scopeProposalToDept` (no ad-hoc role checks) | as `operations_user`, overdue-services source returns `[]`; as `services_user`, overdue-projects returns `[]` |
| costly (#6,#9,#14,#19) | query uses a `where(...)` (not bare `collection`) before any client filter | Network tab: read count is scoped, not whole-collection |
| derivation | imports from `status-derivation.js`, not finance/projects/services | `status-derivation.js` exports match the private originals' formulas (diff by eye vs cited lines) |
| lowercase status | sources 4/10/(finance banner) compare `'pending'` not `'Pending'` | returns rows in a DB that has lowercase pendings |

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | RFP `due_date` is stored `YYYY-MM-DD` so `where('due_date','<',todayISO)` string-range is valid | #9, Costly | If mixed/ISO-datetime, the range query silently mis-selects; fallback = bounded recent-window scan. **Verify before build.** |
| A2 | `#/admin` view honors `?section=user-management` (from TYPE_META.REGISTRATION_PENDING target) | #4 deepLink, gotcha 10 | Row lands on admin root instead of the pending-users section; cosmetic — land on `#/admin` as safe fallback |
| A3 | services_admin is intentionally a non-internal-approver (seed source 1 gate excludes it) so HOME-10 "dept proposals awaiting approval" yields `[]` for services_admin | #1, gotcha 9 | If services_admin SHOULD approve, the gate needs widening — a decision, not a bug |
| A4 | `pos.updated_at` reliably reflects the last status change (it's written on every status update) for age-in-status banding | #17, gotcha 4 | Non-status writes also bump `updated_at`, so age-in-status may under-count; acceptable proxy, or add a real stage clock (out of scope) |
| A5 | Accepting per-assignment issue fan-out (#6) is acceptable read-cost for dept admins at current data volumes | #6, Costly | At scale a dept admin's feed does many subcollection reads; the collectionGroup/denormalize paths are the escape hatch |
| A6 | Extract-by-copy into `status-derivation.js` (rather than exporting from the views) is the sanctioned reading of D-02 "reuse the helpers" | Derivation map, Registry | If the team insists on literal single-source reuse, they must accept eager-loading heavy views OR do the view refactor this phase |

## Open Questions (RESOLVED during planning 2026-07-11)

**Resolution summary:**
- **Q1 (RFP `due_date` format)** → RESOLVED via a hard verification task: Plan 108-01 Task 2 confirms the stored format before Plan 108-02 source #9 relies on the `where('due_date','<',todayISO)` range; a bounded recent-window scan is the documented fallback if not `YYYY-MM-DD`. Planning did NOT proceed on the unverified assumption.
- **Q2 (services_admin approval scope)** → RESOLVED by user decision (2026-07-11): **keep the current `['super_admin','operations_admin']` approver gate.** services_admin stays a non-approver; the awaiting-approval source self-gates to `[]` for them. No gate widening, no `canApproveQueue`/`firestore.rules` change.
- **Q3 (open-issues scale)** → RESOLVED by decision #3: ship the **bounded per-assignment fan-out** now; collectionGroup index+rule and the `open_issue_count` denormalization are recorded as the out-of-scope scale path.
- **Q4 (retention vs DLP overlap)** → RESOLVED: distinct `dedupeKey` prefixes (`dlp-expiring:{id}` vs `retention-release:{id}`) + disjoint role targeting; no dedupe conflict.

Original questions (for provenance):

1. **RFP `due_date` storage format** (A1). What we know: collectibles use `YYYY-MM-DD`; RFP code does `new Date(rfp.due_date)`. What's unclear: whether RFP writes the same `YYYY-MM-DD` shape. Recommendation: grep the RFP create path (`generateRFPId`/RFP addDoc in procurement.js ~1858) for the `due_date` write before committing to the string-range optimization; if not `YYYY-MM-DD`, use a bounded scan.
2. **services_admin approval scope** (A3). Confirm with the user/discuss-phase whether HOME-10 "dept proposals awaiting approval" should surface for services_admin (currently non-approver). Low effort either way; it's a gate-list decision.
3. **Open-issues scale strategy** (#6/A5). The bounded fan-out ships now; flag to discuss-phase whether to invest in the collectionGroup index+rule or the `open_issue_count` denormalization for dept-admin scale. Not a blocker for a correct first ship.
4. **`sourceRetentionReleases` vs `sourceDlpWindowsExpiring` overlap.** Both read Completed projects/services; #8 is the `expired` state (finance), #7 is the `in-dlp within 14d` state (admins). They target different roles so no dedupe conflict, but if a future role gets both, use distinct dedupeKey prefixes (already specified).

## Environment Availability

Pure client-side Firestore reads over the existing SDK (v10.7.1 CDN) — no new external dependencies. The only "infra" question is whether the two costly-source optimizations need Firestore **indexes**: single-field indexes on `due_date`, `procurement_status`, `finance_status`, `status`, `project_status` are auto-created by Firestore; only the collectionGroup path for #6 (if chosen) needs an explicit composite index + a `firestore.rules` collectionGroup match block. No index work is required for the recommended (non-collectionGroup) approach beyond what Firestore auto-provisions. **Security rules:** all target collections (`proposals`,`mrfs`,`prs`,`transport_requests`,`pos`,`rfps`,`collectibles`,`billing_requests`,`users`,`projects`,`services`,`issues` subcollections) already have read rules (106 reconciled 28 collections ↔ rules 1:1); the sources only READ, so no rules change unless collectionGroup is adopted.

## Sources

### Primary (HIGH — read this session)
- `app/home-feed.js` — engine + 3 seed sources + `getSourcesForUser` seam (full read)
- `app/views/proposals.js:36-147` — `STAGE_ORDER`, `getAgeInStageDays`, `isOverdueInStage` (exported)
- `app/views/finance.js:89-164,1004-1074,2043-2079,5282-5345` — `deriveRFPStatus`, `deriveCollectibleStatus`, `getCollectibleUrgency`, `derivePOSummary`, billing_requests/collectibles listeners, PR/TR pending queries (all derivation private)
- `app/views/projects.js:44-63,888-1034` — `URGENCY_THRESHOLDS`, `getDlpState`, `normalizeUpdatedAt`, `stageDaysInStage`, `getProjectSignal`, `computeUrgencySignals` (private)
- `app/views/services.js:944-1062` — `getServiceSignal` mirror (private)
- `app/proof-modal.js:102-118` — PO proof fields (`proof_url`,`proof_remarks`,`proof_attached_at`)
- `app/views/user-management.js:245-258` — pending-users query (`users where status=='pending'`)
- `app/views/project-detail.js:1457-1472,3541-3552` — billing_requests + issues schemas
- `app/notifications.js:75-97` — full `TYPE_META` icon key list
- `app/utils.js:58-71,318-416` — `getRFPTotal`/`getRFPFees`, `getAssigned*Codes`, SEE_ALL role sets (exported except the raw arrays)
- `app/router.js:11-107` — route table (deep-link validation)
- `app/views/procurement.js:488-490,945,7838-7851` — PO status enum + `updated_at`-on-status-change
- `.claude/skills/spike-findings-pr-po/references/dlp-retention-tranche.md` — DLP field schema + `getDlpState`
- `.planning/phases/106-data-layer-audit-findings-report/106-FINDINGS.md` — F-012/F-015/F-018/F-020/F-025 (scan/casing/aggregation precedents)
- `.planning/phases/107-.../107-UI-SPEC.md` — category taxonomy, severity palette, deep-link contract, roll-up rules

### Confidence
- Per-source queries & fields: **HIGH** (read from live code)
- Derivation-helper locations & export status: **HIGH** (grepped exports)
- Costly-source optimizations: **HIGH** for collectibles/POs/engagements; **MEDIUM** for RFP `due_date` range (format unverified — A1) and open-issues scale (design choice — A5)
- Registry/module recommendation: **HIGH** (import-cycle + eager-load reasoning verified against actual module boundaries)

**Research date:** 2026-07-11
**Valid until:** ~2026-08-10 (stable — no external deps; only invalidated by refactors to finance.js/projects.js helper locations)

## RESEARCH COMPLETE
