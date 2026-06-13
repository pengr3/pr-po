# Phase 103: Portfolio Table Redesign — Attention Feed + Browse All - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning
**Source:** Spike 033 (VALIDATED) + 4 scope decisions captured in-session + codebase overlap analysis

<domain>
## Phase Boundary

Replace the flat sortable portfolio table in BOTH `app/views/projects.js` and
`app/views/services.js` with the Spike 033 D+B hybrid: a **Priority Feed** (Option D,
default) ranking rows by computed urgency into Needs Attention / Worth Watching / On Track,
plus a **Browse All** (Option B) toggle showing collapsible stage-grouped lists. Same view,
same URL, no new route — a toolbar button pair switches modes, persisted in localStorage.

**In scope:** projects.js + services.js portfolio rendering; view-mode toggle; urgency
signal computation; stage-aware finance display (4 states); stage-grouped Browse All;
shared CSS in styles/views.css. Reuse (do not rebuild) Phase 102 DLP visuals and Phase 92
scorecards.

**Out of scope:** Option E Swimlane (deferred — needs per-status `status_changed_at`
timestamps not stored); any new Firestore collection or fields; any change to project/service
lifecycle, gates, or detail pages; the VO series (spikes 037–040 — separate future phase).
</domain>

<decisions>
## Implementation Decisions

### D-01 — Scope: Projects + Services together (LOCKED)
Both `app/views/projects.js` AND `app/views/services.js` get the redesign in this phase.
Services share the same `UNIFIED_STATUS_OPTIONS` lifecycle as projects, so stage groups and
urgency signals are reused directly. Services additionally have a one-time/recurring sub-tab
(`service_type`) — the sub-tab filter must run BEFORE view-mode rendering (the feed/groups
render within the already-filtered service_type pool). Use shared CSS classes so both views
style identically. Mirror, don't fork the logic where practical.

### D-02 — Status scorecard strip retained in BOTH modes (LOCKED)
The Phase 92 scorecard strip (12 tiles + Total, color-coded per 92.1, click-to-filter,
visibility-scoped) stays rendered ABOVE both Priority Feed and Browse All. Nothing shipped is
removed. Clicking a scorecard still filters; the filter applies to whichever mode is active.

### D-03 — Browse All = stage-grouped collapsible (Option B) (LOCKED)
Browse All shows collapsible stage groups with aggregate header counts, NOT the current flat
sortable table. Groups (every one of the 10 statuses maps to exactly one group):
- **On-going** → On-going
- **Contracted & Mobilizing** → Client Approved, For Mobilization
- **Proposal Stage** → For Proposal, Proposal for Internal Approval, Proposal Under Client Review, For Revision
- **For Inspection** → For Inspection
- **Completed** → Completed
- **Loss** → Loss  (terminal; collapsed by default alongside Completed)
Collapse state persisted in localStorage (`browse-collapse` per view). Per-column sort is
dropped (Feed is urgency-sorted, Browse All is stage-grouped) — confirmed acceptable.

### D-04 — Default view: remember last, default Feed (LOCKED)
Persist the toggle in localStorage (`projects-view-mode` / `services-view-mode`). First-time
users (no stored value) land on Priority Feed. Returning users get their last choice.

### D-05 — DLP visuals reused, not rebuilt (LOCKED)
Phase 102 already shipped `getDlpState(project)` + the 4-state portfolio visuals (left-accent
border `dlp-amber/red/green` + status tags) into the flat table. The new feed/grouped modes
MUST reuse the existing `getDlpState()` and the same visual vocabulary. No second state
machine. No new collectible listener (the portfolio mirror deliberately omits the
`isRetentionCollected→released` branch — `retention_released_at` is the canonical release
signal here, per Phase 102 Plan 05).

### D-06 — Stage-aware finance, 4 display states (LOCKED, from spike)
Pick by `project_status`:
- **Pre-contract** (For Inspection, For Proposal, Proposal for Internal Approval, Proposal Under Client Review, For Revision): show proposed/estimated value (`budget`) or "Pre-contract" label — **NO billing bar** (contract_cost is null/0; a bar implies 0% of nothing)
- **Contracted, not billing** (Client Approved, For Mobilization): `contract_cost` + "Contract signed · billing not started"
- **Active billing** (On-going): `contract_cost` + mini utilization bar + % (computed from `collection_tranches`)
- **Completed**: green "Fully billed · 100% ✓" OR the Phase 102 DLP state via `getDlpState()`
- **Loss**: muted terminal label (no bar)

### D-07 — Urgency signals as tunable named constants (LOCKED approach; thresholds = spike defaults)
`getProjectSignal(p, now)` returns `{ level: 'urgent'|'watch'|'ok', text, hint }`. Default
thresholds (ship as named constants for post-launch tuning):
- urgent: Proposal Under Client Review > 14d; For Inspection > 30d; On-going quiet > 7d; (DLP expired → urgent, via getDlpState)
- watch: For Revision > 5d; For Mobilization > 3d; (≥86% billed & <100% → watch, when tranche data present); (in-DLP → ok/watch per spike)
- ok: everything else (default On Track signal text)
"Days in stage" is approximated by days since `updated_at` (coarse — the only signal stored).

### D-08 — `updated_at` shape robustness (LOCKED — landmine)
`updated_at` is written inconsistently across the codebase: some writes use
`new Date().toISOString()` (string), others use Firestore `serverTimestamp()` (Timestamp
object). The urgency computation MUST normalize both (Timestamp has `.toDate()`/`.seconds`;
string parses via `new Date()`). Missing/unparseable `updated_at` degrades to On Track — never
a false "urgent".

### Claude's Discretion
- Exact DOM structure of feed sections / group headers / finance cells (follow spike index.html + `references/project-portfolio-view.md` blueprint)
- CSS class names (keep consistent with existing `.project-scorecard-*`, `.portfolio-dlp-tag`, `.dlp-amber/red/green`)
- Whether to keep or drop the 10/page pagination in new modes (lean: drop in Feed; optionally cap very long Browse All groups) — confirm in plan
- How `computeBillingPct` reads `collection_tranches` (reuse any existing helper from project-detail.js / Phase 99.1 if present rather than reinventing)
- Service-specific urgency tweaks for recurring services (default: reuse project signals unchanged)
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spike 033 (authoritative design contract)
- `.planning/spikes/033-project-table-redesign/README.md` — decision (D+B hybrid), 4 finance states, urgency signals, what-to-avoid
- `.planning/spikes/033-project-table-redesign/index.html` — all 5 options + D+B combo tab (visual contract; open in browser)

### Implementation blueprint
- `.claude/skills/spike-findings-pr-po/references/project-portfolio-view.md` — full code patterns: `vmSwitch` toggle, `computeUrgencySignals`/`getProjectSignal`, `renderFinancial` 4-state, `STAGE_GROUPS`, collapse persistence, constraints
- `.claude/skills/spike-findings-pr-po/SKILL.md` — requirements list + spike index

### Code to modify / reuse (read current state first)
- `app/views/projects.js` — current flat table: `render()` (~88), `renderScorecards` (~734), `applyFilters` (~762), `sortFilteredProjects`/`sortProjects` (~808), `loadProjects` onSnapshot (~882), `getDlpState` (~908, Phase 102 — REUSE), `renderProjectsTable` (~915), `UNIFIED_STATUS_OPTIONS` (32–43), window-fn (attach ~59 / destroy ~332)
- `app/views/services.js` — mirror structure: `UNIFIED_STATUS_OPTIONS` (39), `SCORECARD_STATUS_OPTIONS` (54), `service_type` sub-tab (one-time/recurring ~101/814/824), `renderServicesTable` (~973), scorecards (~226/781)
- `styles/views.css` — existing `.project-scorecard*`, `.portfolio-dlp-tag`, `.dlp-amber/red/green` (extend, don't duplicate)
- `firestore.rules` — NO change expected (no new fields/collections)

### Project rules
- `CLAUDE.md` — SPA patterns: render/init/destroy contract, window-function registration, onSnapshot listener cleanup, case-sensitive status matching, `JSON.parse(items_json)`
</canonical_refs>

<specifics>
## Specific Ideas

- Toolbar toggle markup pattern (from blueprint): `<div class="vm-toggle"><button class="vm-btn vm-on" id="vm-feed" onclick="vmSwitch('feed')">🔥 Priority Feed</button><button class="vm-btn" id="vm-browse" onclick="vmSwitch('browse')">≡ Browse All</button></div>`
- Two render containers (`#pdb-feed`, `#pdb-browse`) toggled by `display`; vmSwitch persists to localStorage and toggles `.vm-on`.
- Reuse Phase 102 row visuals verbatim: `dlpClass` (`dlp-amber/red/green`) + `portfolio-dlp-tag` spans, driven by `getDlpState()`.
- Services: render feed/groups INSIDE the active `service_type` (one-time vs recurring) pool — the sub-tab is an outer filter, the view-mode is inner.
</specifics>

<deferred>
## Deferred Ideas

- **Option E (Portfolio Swimlane)** — requires per-status `status_changed_at` timestamps (a `status_history` subcollection or per-stage `*_changed_at` fields) not stored today. Out of scope.
- **Near-final billing urgency (≥86% billed)** — only activates when per-row tranche billed% is cheaply available; include the hook but it may render inert if billing data isn't loaded in the portfolio (no new listener allowed). Confirm in plan.
- **Services full functional parity beyond the table** — this phase mirrors the *portfolio table view* only, not any deeper service-flow parity.
</deferred>

---

*Phase: 103-portfolio-table-redesign*
*Context gathered: 2026-06-13 — Spike 033 + in-session scope decisions D-01..D-08*
