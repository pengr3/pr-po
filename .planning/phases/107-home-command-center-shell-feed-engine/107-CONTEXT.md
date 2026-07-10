# Phase 107: Home — Command Center Shell & Feed Engine - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 107 delivers the **Home "Command Center" shell + the feed *engine***: a personalized greeting, the permission/assignment **scoping framework**, the "Needs your attention" feed mechanism (severity-ranked, deep-linked, calm empty state), quick-KPI chips, a "Your Work" panel, a "Recent Activity" panel, and the five nav cards — as a **reusable frame**.

- **In scope (HOME-01–08):** the shell/composition, the feed *engine* (item model, scoping, ranking, render, empty state) + a small reusable feed-source library seeded with a few sources, KPI chips, Your Work, Recent Activity, the nav door rail.
- **Out of scope (deferred):** the five per-role feed *definitions* (HOME-09–13) → **Phase 108**; the Executive Dashboard sub-tab (DASH-*) → **Phase 109**; mobile layout of the Command Center → **Phase 111**.

</domain>

<decisions>
## Implementation Decisions

### Layout & Command Center Composition
- **D-01:** The Command Center is the **default landing content**, replacing the thin "Overview" stat widget. The standalone `/proposals` route (retired in Phase 87.1 D-02) **stays retired**.
- **D-02:** Today's three home sub-tabs (Overview / Engagements / Proposals) **fold into native Command Center elements** rather than remaining bolted-on tabs:
  - **Proposal approval queue → attention feed** — one row per pending proposal; click opens the **existing** approve/reject modal (reuse `_openHomeQueueModal` / `_homeQueueConfirmAction`). The full queue table is NOT replicated in the feed.
  - **Proposals "For Revision" → Your Work** panel (and a feed row when overdue).
  - **Create-engagement form → a "+ New Proposal" quick-action button** in the header (opens the existing `engagement-create.js` form as a modal). The "Engagements" tab is retired as a tab.
  - **Browse-all proposals (scorecards + paginated table) → a NON-DEFAULT "Proposals" sub-tab** (Command Center is the default). Its five stage-scorecards may double as KPI chips.
- **D-03:** Vertical composition is **Briefing-stacked, single column** (so it stacks cleanly for Phase 111 mobile): Header (greeting name + date + attention one-liner + "+ New Proposal") → **KPI chips row** → **"Needs your attention" feed (hero)** → **Your Work + Recent Activity** side-by-side → **condensed nav door rail**.
- **D-04:** Nav cards → **condensed door rail** (compact icon + label tiles, no paragraph/button), **permission-scoped** to reachable areas (mirror the top-nav gating). Satisfies HOME-08.

### Feed Engine — shape, ranking, interaction
- **D-05:** Feed is a **single flat severity-ranked list**; each row = icon + title + subtitle + age + a small **category chip**; capped at ~7–10 rows with a **"Show all (N)"** expander.
- **D-06:** Severity is **source-declared** with **THREE tiers: critical / high / medium**. The engine is source-agnostic: sorts **critical → high → medium**, then most-overdue / newest-first within a tier. ⚠ **This AMENDS HOME-03** (written as high/medium) → REQUIREMENTS.md HOME-03 should be updated to critical/high/medium. Default tier semantic (Phase 108 sharpens per-source): **critical** = blocking / badly overdue / act-now · **high** = overdue / important · **medium** = due-soon / heads-up.
- **D-07:** Deep-link is **hybrid** — each feed item declares a target that is **either a route-hash** (e.g. `#/finance`) **or a modal-open action** (e.g. proposal approve/reject in place). The engine supports both; each source chooses. Matches spike 041 (real route targets) AND the existing queue modal.
- **D-08:** Default data-refresh = **compute-on-load** (batched `getDocs` per source, assembled into the ranked feed) **+ a manual Refresh control**. **No persistent listener fleet** across the source collections — predictable cost, no leak surface, mobile-friendly. The engine's fetch strategy is abstracted behind the source interface, so per-source live listeners can be layered later without changing the contract. Directly addresses the 106 listener-leak / clear-before-push findings.
- **D-09:** Empty state — calm **"You're all caught up"** with no filler rows (HOME-04) when the assembled feed is empty.

### 107↔108 Boundary — engine vs content
- **D-10:** **107 = the ENGINE** (feed-item model, permission/assignment scoping framework, ranking, rendering, empty state) **+ a small reusable feed-source library**. **108 = the five per-role feed DEFINITIONS** composed from that library (+ additional sources).
- **D-11:** Engine architecture contract (what 108 plugs into): a **feed source** is a reusable function `(user) → items[]`, where each item carries `{ id/dedupeKey, severity (critical|high|medium), icon, title, subtitle, category, deepLink (route hash | modal action), timestamp/age }`. A **feed definition** (108) maps a **role → the set of source functions that apply + per-source severity thresholds**. The engine merges a role's sources, dedupes, ranks, caps, renders.
- **D-12:** **Seed source trio wired in 107** (proves the engine end-to-end and populates a Super Admin feed on day one): (1) **"Proposals awaiting your approval"** — permission-scoped (approvers), modal deep-link, critical/high; (2) **"Your proposals For Revision"** — ownership-scoped (`created_by`), route deep-link; (3) **"Your rejected MRFs"** — requestor-scoped. Together they exercise permission + assignment/ownership scope, both deep-link types, multiple tiers, and the empty state. These become part of the source library 108 reuses.

### Panels — data sources
- **D-13:** Recent Activity (HOME-07) = **reuse the per-user `notifications` collection** as a read-only recent slice (distinct from the bell's unread semantics). Reuses `TYPE_META` icons + notification links. No new plumbing.
- **D-14:** Your Work (HOME-06) = **fixed three ownership/assignment-scoped buckets, each hidden when empty**: (a) my proposals For Revision (`created_by == me`); (b) my assigned projects/services (`getAssignedProjectCodes` / `getAssignedServiceCodes`); (c) my submitted MRFs (`requestor == me`). Scoping does the per-role work; Finance/Procurement naturally see fewer buckets.
- **D-15:** KPI chips (HOME-05) = a **small role-tailored set (2–4 chips)** drawn from counts 107 already reads: admins/super_admin → portfolio (active projects/services) + attention count; Finance → payables owed / collectibles due; Procurement → MRFs pending / active POs; `*_user` → my open items. Honors HOME-05's role-scoping; the exact per-role chip map is finalized in the UI-SPEC/planner from this guidance.

### Claude's Discretion (defer to planner / UI-SPEC)
- Exact per-role KPI chip map (within D-15 guidance).
- Empty-state visual/copy details; greeting one-liner wording / time-of-day tone.
- **Where the shared feed-source library lives** — recommend a **dedicated module** (e.g. `app/home-feed.js`) so 108 imports it cleanly rather than reaching into `home.js`.
- Category-chip taxonomy; item dedupe/collapse rules.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 107: Home — Command Center Shell & Feed Engine" — goal, 4 success criteria, dependency on 106.
- `.planning/REQUIREMENTS.md` §"Home — Command Center (HOME)" — HOME-01–08 (this phase); HOME-09–13 (Phase 108). ⚠ **HOME-03 to be amended** from "high / medium" → "critical / high / medium" (see D-06).
- `.planning/PROJECT.md` §"Current Milestone: v4.2" — Home = Command Center for all roles; Executive Dashboard is a role-gated Home sub-tab (Phase 109); no new collections expected.

### Design source (the mockup spike that set the direction)
- `.planning/spikes/041-home-paradigm-reimagine/README.md` — paradigm shootout (Action Center / Business Pulse / Portfolio Map / Daily Briefing). Recommended composition = **Briefing header + attention feed + KPI numbers + activity Pulse + demoted nav doors** = the "Command Center." Verdict is officially "PENDING browser UAT," but PROJECT.md records the direction as **confirmed**. Carries forward: deep-link-per-click (spike 030), role-derived responsibility (029/031), activity journal as feed source (032).
- `.planning/spikes/041-home-paradigm-reimagine/spike.html` — the **live mockup** (open in a browser). Role switcher (all 8 roles) + calm/busy toggle + deep-link event log. **Reference this for the concrete look/feel** before the UI-SPEC.
- `.planning/spikes/028-home-hero-concepts/README.md` — prior Action-Center hero shootout (context for why 041 exists).

### Data-layer audit (informs feed reads)
- `.planning/phases/106-data-layer-audit-findings-report/106-FINDINGS.md` — listener-leak / clear-before-push finding at `home.js` `loadStats` (~L747–778); client-side-filtering + N+1 findings the feed's read strategy (D-08) must avoid.

### Reusable code (see <code_context>)
- `app/views/home.js` · `app/engagement-create.js` · `app/notifications.js` · `app/utils.js` · `app/router.js` · `app/views/proposals.js`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Proposal approve/reject modal path** — `home.js` `_openHomeQueueModal()` / `_homeQueueConfirmAction()` (built on `proposals.js` `_applyProposalStateTransition`). The feed's "proposals awaiting approval" rows reuse this for in-place action (D-02, D-12).
- **`engagement-create.js`** — `renderEngagementForm` / `initEngagementForm` / `destroyEngagementForm` (idempotent). The "+ New Proposal" quick-action mounts this as a modal (D-02).
- **`notifications.js`** — `NOTIFICATION_TYPES`, `TYPE_META` (icons), `renderDropdownRows`, `createNotification*`. Backs Recent Activity read-only (D-13).
- **`utils.js`** — `getAssignedProjectCodes` / `getAssignedServiceCodes` + `window.getCurrentUser()`. The scoping framework's assignment/ownership predicates (D-11, D-14).
- **`proposals.js` helpers** — `STAGE_ORDER`, `getProposalStatusBadge`, `renderAgeBadge`, `getAgeInStageDays`, `isOverdueInStage`. Proposal feed sources + age display (D-12).
- **Scorecard component** (`.project-scorecard-card`) + the existing procurement stat pattern in `home.js` `loadStats` — candidate for KPI chips (D-15).

### Established Patterns
- View module = `render()` / `init()` / `destroy()` with a `listeners[]` cleanup array; `window.*` for `onclick` handlers; **case-sensitive** status matching (CLAUDE.md). Router does NOT call `destroy()` on tab switches within a view.
- Role scoping is already **assignment-driven** (quick 260627-kg0 + 260706-mco): `PROJECT_SEE_ALL_ROLES` / `SERVICE_SEE_ALL_ROLES` split in `utils.js`. The feed's scoping framework MUST reuse these predicates, not reinvent them.
- 106 finding: **clear-before-push** for any listeners. D-08 (compute-on-load) sidesteps most of this, but any listeners the engine *does* add must clear-before-push and tear down in `destroy()`.
- Deep-link convention: `location.hash` for routes; modals opened via `window.*` functions (D-07).

### Integration Points
- **`home.js` `render()`/`init()`/`destroy()` is the mount point** — the Command Center replaces the current Overview content; sub-nav collapses to [Command Center (default) | Proposals (non-default) | Dashboard (109, later)].
- **New feed-source library** (recommended `app/home-feed.js`) imported by `home.js` (107 seeds) AND by Phase 108 (per-role definitions).
- **`notifications.js`** consumed read-only for Recent Activity.
- **Nav door rail** mirrors `index.html` top-nav permission gating.

</code_context>

<specifics>
## Specific Ideas

- The Command Center composition is drawn from **spike 041's** recommended "Briefing header + attention/Pulse body + folded action bullets + demoted nav doors."
- The user explicitly wants a **"critical" severity tier** beyond the requirement's high/medium (D-06).
- The user's framing for D-02 was to **"properly fold" proposals & engagement into native Command Center elements** rather than keep them as bolted-on sub-tabs — split each surface by what it *is* (action → button, attention → feed, own-work → Your Work, browse → non-default tab).

</specifics>

<deferred>
## Deferred Ideas

- **Per-role FEED definitions (HOME-09–13)** → Phase 108 (compose from the 107 source library).
- **Executive Dashboard sub-tab (DASH-01–07)** → Phase 109.
- **Mobile layout of the Command Center (MOBILE-01)** → Phase 111.
- **Live/real-time feed listeners** (optional per-source enhancement) → future; the D-08/D-11 engine contract already allows it without a rewrite.
- **Project-journal-backed Recent Activity enrichment** → future; notifications suffice for v1 (D-13).

*No reviewed-but-deferred todos — the environment has no todo cross-reference system available (legacy gsd-tools only).*

</deferred>

---

*Phase: 107-home-command-center-shell-feed-engine*
*Context gathered: 2026-07-10*
