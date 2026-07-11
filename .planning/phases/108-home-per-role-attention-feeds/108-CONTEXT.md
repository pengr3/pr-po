# Phase 108: Home — Per-Role Attention Feeds - Context

**Gathered:** 2026-07-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 108 **populates the Phase-107 feed engine** with the five per-role feed *definitions* (HOME-09–13). The engine, scoping framework, ranking, cap/roll-up, render, and empty/error states are **already built and locked in 107** — this phase adds the role-specific **source functions** and the **role→source registry** that `getSourcesForUser(user)` returns.

- **In scope (HOME-09–13):** the ~20 role-specific feed sources (each `async (user) => item[]` per the D-11 contract), their per-source severity thresholds, and the `getSourcesForUser` role→source-set map that replaces the 107 seed registry. Reuses the 3 seed sources already built.
- **Out of scope (locked/deferred):** the feed **engine** itself (107 — do NOT modify the item model, ranking, cap, or render); Executive Dashboard (DASH-* → Phase 109); Command Center layout & mobile (107.5 shipped / Phase 111); live per-source listeners (future — the D-08/D-11 contract already permits them without a rewrite).

</domain>

<decisions>
## Implementation Decisions

### Carried forward from Phase 107 (LOCKED — do not re-open)
- **107 D-06** — three severity tiers (critical / high / medium), **source-declared**; engine sorts critical→high→medium, then most-overdue / newest-first within a tier.
- **107 D-08 + Strategy A (107.6)** — **compute-on-load** (batched `getDocs` per source), sources run in a **parallel wave** (`Promise.all`), counts use `getAggregateFromServer`; **NO persistent `onSnapshot` listeners**, **no TTL cache**. Every new 108 source MUST fit this: a plain async function that returns items, isolated in the engine's per-source try/catch. See memory `project_command_center_redesign`.
- **107 D-11** — source contract: `async (user) => item[]`, each item `{ dedupeKey, severity, icon, title, subtitle, category, deepLink (route|modal), timestamp, overdueScore, isRollup? }`. A **feed definition** = role → set of source functions + per-source severity thresholds.
- **Engine behavior** — cap **8 visible / 25 max**, category **roll-up** when ≥5 items share a `category`, **dedupe** by `dedupeKey` keeping highest severity. Do not change these.
- **Scoping** — reuse the existing assignment-driven predicates (`getAssignedProjectCodes` / `getAssignedServiceCodes`, `PROJECT_SEE_ALL_ROLES` / `SERVICE_SEE_ALL_ROLES` in `utils.js`; `scopeProposalToDept` in `home-feed.js`). Do NOT reinvent scoping.

### D-01 (108) — Urgency threshold bands (the severity model per source)
Recommended default bands, applied per-source to derive the tier:
| Source family | critical | high | medium |
|---|---|---|---|
| Overdue in-stage (proposals, project/service stages) | > 14d in stage | > 7d in stage | — (only overdue surfaces) |
| DLP window expiring | ≤ 3d to expiry | ≤ 7d | ≤ 14d |
| Collectibles overdue · RFP payments overdue/due | > 30d past due | any amount past due | due within ≤ 7d |
| No progress update (assigned projects/services) | ≥ 30d since update | ≥ 14d (HOME-11 gate) | — |
| Pure action states (MRFs pending, PRs/TRs pending, PO missing proof-of-procurement, rejected TRs to re-edit, my rejected MRFs) | — | **high** (fixed) | — |
Proposal sources keep their 107 tuning (awaiting-approval: overdue-in-stage→critical else high; for-revision: >14d→critical, >7d→high). "Aging POs to advance" = age-in-status banded like overdue-in-stage (>14d high, >30d critical) — planner confirms the exact status/age field.

### D-02 (108) — Build ALL derived sources faithfully (reuse existing helpers)
Every HOME-09–13 source is implemented this phase, including the ~6 that need client-side derivation (collectibles overdue, delivered POs missing proof-of-procurement, aging POs, DLP windows, retention releases, stale-progress). **Reuse the app's existing derivation helpers** rather than re-deriving (e.g. finance.js `deriveCollectibleStatus` / `derivePOSummary`, the DLP-status helpers, proposals.js `isOverdueInStage` / `getAgeInStageDays`). Each source = **one batched read** in the parallel wave. **Planner must flag any source that requires a full-collection scan** (e.g. POs-missing-proof, collectibles-overdue) and optimize it (scoped query / `getAggregateFromServer` / index) so Strategy A's "always fresh + fast" holds — mirrors the 107.6 `pos` full-scan fix. A source whose data genuinely can't resolve returns `[]` (never fabricates), consistent with the engine's per-source isolation.

### D-03 (108) — Keep the generic engine ranking + cap + roll-up (no per-role emphasis)
No per-role pinning, no per-role cap changes. The **severity thresholds (D-01) do the prioritization** — urgent items float up via critical→high→medium. High-volume categories (e.g. "most-overdue projects/services" for Super Admin) collapse via the engine's existing **category roll-up** (`+N more …`). Cap stays 8 visible / 25 max for all roles.

### D-04 (108) — Single interleaved severity-ranked list for every role
Super Admin sees **one** merged severity-ranked list spanning **both departments**; the department is conveyed by the **category chip / subtitle**, not by splitting the feed. Dept admins (operations_admin / services_admin) = **their department only**. `*_user` = **assigned items only** (overdue stages, open issues, no-progress all scoped to `getAssigned*Codes`). Finance / Procurement = their functional sources (dept-agnostic). All via the existing scoping predicates.

### Per-role feed definitions (HOME-09–13) — the source map `getSourcesForUser` returns
- **Super Admin (HOME-09):** proposals awaiting approval (both depts) · pending user registrations · most-overdue projects/services (both depts) · DLP windows expiring · overdue RFP payments.
- **Operations / Services Admin (HOME-10):** dept proposals awaiting approval · overdue in-stage items (dept) · DLP expiring (dept) · open issues & stale progress (dept) · own billing requests.
- **Operations / Services User (HOME-11):** my proposals For Revision · overdue stages on assigned items · open issues on my items · my rejected MRFs · assigned projects with no progress update in 14 days.
- **Finance (HOME-12):** PRs pending · TRs pending · RFPs overdue / due this week · billing requests to decide · collectibles overdue · retention releases to record.
- **Procurement (HOME-13):** MRFs pending processing · aging POs to advance · rejected TRs to re-edit · delivered POs missing proof-of-procurement.
(Reused 107 seed sources map into these: "proposals awaiting approval" → HOME-09/10; "my proposals For Revision" → HOME-11; "my rejected MRFs" → HOME-11.)

### Claude's Discretion (defer to planner / researcher)
- **Where the new sources live** — recommend extending `app/home-feed.js` (or a sibling `home-feed-sources.js`) so `getSourcesForUser` imports them cleanly; do NOT put source logic in `home.js`.
- The exact **config shape** of the role→source-set + per-source-threshold registry (a declarative table is preferred for maintainability + Phase-109/future extension).
- Per-new-source `category` (from the 10-chip taxonomy already in `views.css`: proposal/mrf/pr/po/finance/rfp/project/service/issue/dlp), `icon` (reuse `TYPE_META` where an analogue exists), `dedupeKey` prefix, and `deepLink` target.
- Precise derivation-helper locations + whether any needs an aggregation/index — **researcher confirms against the live code**.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 108: Home — Per-Role Attention Feeds" — goal, success criteria, dependency on 107.
- `.planning/REQUIREMENTS.md` §"Home — Command Center (HOME)" — **HOME-09–13** (this phase's five feed definitions).
- `.planning/phases/107-home-command-center-shell-feed-engine/107-CONTEXT.md` — the **engine contract** (D-06/D-08/D-10/D-11/D-12) this phase plugs into.

### The engine + seam this phase extends (READ FIRST)
- `app/home-feed.js` — the compute-on-load engine: `assembleFeed`, `SEVERITY`, `rankItems`/`dedupeItems`/`rollUpByCategory`/`capItems`, the **3 seed sources**, and **`getSourcesForUser(user)` — the Phase-108 seam this phase replaces** with the role→source map. Post-107.6 it runs sources via `Promise.all`.
- `.planning/phases/107-home-command-center-shell-feed-engine/107-UI-SPEC.md` (incl. the 107.5/107.6 **Amendment**) — feed row anatomy, severity palette, category-chip taxonomy, deep-link contract, roll-up rules.
- Memory `project_command_center_redesign` — Strategy-A perf rules Phase 108 must preserve (parallel sources, aggregation, no listeners/TTL).

### Data-layer audit (informs feed read cost)
- `.planning/phases/106-data-layer-audit-findings-report/106-FINDINGS.md` — N+1 / client-side-filtering / full-scan findings the derived sources (D-02) must avoid; the 107.6 `pos` full-scan fix is the precedent.

### Reusable derivation helpers (researcher to confirm exact signatures/locations)
- `app/views/finance.js` — `deriveCollectibleStatus` (collectibles overdue), `derivePOSummary` (payables/PO remaining), retention-release logic.
- `app/views/proposals.js` — `isOverdueInStage`, `getAgeInStageDays`, `STAGE_ORDER`.
- DLP-status helpers (lifecycle/DLP work — spike-findings-pr-po covers DLP/retention); progress-update recency (project/service `progress_updates` subcollection); PO proof-of-procurement field/attachment.
- `app/utils.js` — `getAssignedProjectCodes` / `getAssignedServiceCodes`, `PROJECT_SEE_ALL_ROLES` / `SERVICE_SEE_ALL_ROLES`, `window.getCurrentUser()`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`app/home-feed.js`** — the engine + the `getSourcesForUser(user)` registry seam (currently returns the 3 seed sources for any signed-in user). Phase 108 turns this into a role→source-set map. The 3 seed sources (`sourceProposalsAwaitingApproval`, `sourceMyProposalsForRevision`, `sourceMyRejectedMRFs`) are reused verbatim in the per-role definitions.
- **Derivation helpers** (see canonical refs) — collectible/PO/DLP/overdue-in-stage/progress-recency logic already exists in finance.js / proposals.js / lifecycle code; sources compose these, they don't re-derive.
- **Scoping predicates** — `utils.js` assignment-driven SEE_ALL/assigned split; `home-feed.js` `scopeProposalToDept`. Every source self-gates by role/assignment.
- **Category-chip taxonomy + severity CSS** — all 10 category chips + 3 severity tiers already ship in `styles/views.css` (107.1). New sources just pick a `category` key; no CSS needed.
- **`notifications.js` `TYPE_META`** — inline-SVG icons keyed by domain event; reuse for new-source icons where an analogue exists.

### Established Patterns
- Source = `async (user) => item[]`, self-gating, throws propagate to `assembleFeed`'s per-source try/catch (T-107-03). **Never add `onSnapshot`** — stays compute-on-load (D-08 / Strategy A).
- Case-sensitive status matching (CLAUDE.md): `'Rejected'`, `'Pending'`, `'pending_internal'`, `'for_revision'`, `'Delivered'`.
- Deep-link: `{kind:'route', value:'#/…'}` or `{kind:'modal', handler:'window fn', arg:id}`.

### Integration Points
- **`getSourcesForUser(user)`** in `app/home-feed.js` is the single wiring point — `home.js` already calls `assembleFeed(user)` which defaults to it. No `home.js` change needed beyond what 107 already did (the Command Center just gets richer feeds).
- New source module (recommended `app/home-feed.js` extension or sibling) imported by `home-feed.js`.

</code_context>

<specifics>
## Specific Ideas
- User picked all recommended defaults: balanced urgency bands (D-01), build-all-derived (D-02), generic ranking + roll-up (D-03), single interleaved cross-dept list (D-04).
- The severity thresholds — not per-role pinning — do the prioritization; the busy-role experience is controlled by tuning D-01 bands + the engine's roll-up, keeping the engine role-agnostic.
- "Always fresh + fast" (Strategy A) is a hard constraint: any derived source needing a full-collection scan must be optimized by the planner, not shipped as a scan.

</specifics>

<deferred>
## Deferred Ideas
- **Executive Dashboard sub-tab (DASH-01–07)** → Phase 109.
- **Mobile layout of the Command Center (MOBILE-01)** → Phase 111.
- **Live/real-time per-source listeners** → future; the D-08/D-11 contract already allows layering them in without changing the source interface.
- **Project-journal-backed activity enrichment** → future; notifications suffice for Recent Activity (107 D-13).
- **New Engagement cross-role type-scoping browser verification** (107.5 R2) and **107 UAT Tests 4 & 5** — carried as open verification items, not Phase 108 scope.

*No reviewed-but-deferred todos — no todo cross-reference system available (legacy gsd-tools only).*

</deferred>

---

*Phase: 108-home-per-role-attention-feeds*
*Context gathered: 2026-07-11*
