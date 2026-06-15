---
phase: quick-260615-nzy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [app/views/projects.js, app/views/services.js]
autonomous: false
requirements: [LEGACY-FEED, LEGACY-BROWSE]

must_haves:
  truths:
    - "Legacy-status engagements (non-empty project_status NOT in UNIFIED_STATUS_OPTIONS) appear in a dedicated 'Legacy' section in the Priority Feed, not mislabeled under On Track"
    - "Legacy-status engagements appear in a dedicated 'Legacy' group in Browse All, no longer vanishing from all groups"
    - "Legacy rows are clickable and open the existing detail/edit route"
    - "Empty Legacy section/group hides (Feed) or shows placeholder (Browse) and does not clutter normal portfolios"
    - "The same Legacy behavior is mirrored in the services view"
  artifacts:
    - path: "app/views/projects.js"
      provides: "Legacy Feed section + Legacy Browse group with predicate-based membership"
    - path: "app/views/services.js"
      provides: "Legacy Feed section + Legacy Browse group (mirror)"
  key_links:
    - from: "renderPriorityFeed"
      to: "computeUrgencySignals ok bucket"
      via: "pull legacy rows out of ok before building On Track section"
      pattern: "isLegacyStatus"
    - from: "renderBrowseAll"
      to: "filteredProjects"
      via: "legacy group filters by !UNIFIED_STATUS_OPTIONS.includes(status) && status"
      pattern: "predicate|isLegacyStatus"
---

<objective>
Add a "Legacy" group to BOTH the Priority Feed and Browse All in the projects view, and mirror it in the services view. The group collects engagements whose `project_status` is a non-empty value NOT present in `UNIFIED_STATUS_OPTIONS` (legacy / unmapped statuses).

Today these legacy-status engagements silently fall into the Feed's "On Track" tier (mislabeled) and disappear ENTIRELY from Browse All groups (because every existing group filters by a fixed `statuses[]` list and an unmapped status matches none). This plan surfaces them in their own bucket so they are visible, clickable, and editable via the existing detail route.

Purpose: Make legacy/unmapped engagements discoverable so they can be opened and re-statused, instead of being invisible.
Output: Modified `app/views/projects.js` and `app/views/services.js` — no new files, no schema change, no migration.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@./CLAUDE.md
@app/views/projects.js
@app/views/services.js

<interfaces>
<!-- Confirmed anchors (verified 2026-06-15). Line numbers are approximate — the files change; match on identifiers. -->

projects.js:
- UNIFIED_STATUS_OPTIONS (~L34): 10 canonical statuses. "Legacy" = `status && !UNIFIED_STATUS_OPTIONS.includes(status)`.
- STAGE_GROUPS (~L63): array of `{key,label,statuses[],color}`. renderBrowseAll filters `group.statuses.includes(p.project_status)`.
- getCollapseState(key) (~L73): default-collapsed for key === 'completed' || 'loss'. localStorage key 'browse-collapse'.
- computeUrgencySignals(projects) (~L1020): returns `{ urgent, watch, ok }`, each row carrying `.signal`. Legacy statuses currently land in `ok`.
- renderPriorityFeed (~L1111): builds `sections` from urgent/watch/ok; On Track has hideWhenEmpty:false.
- buildFeedRow(p) (~L1156): shared row builder, already renders the `(legacy)` italic label and links to `#/projects/detail/${code||id}`. REUSE for legacy rows.
- renderBrowseAll (~L1187): `STAGE_GROUPS.map(...)` with `.filter(p => group.statuses.includes(p.project_status))`.

services.js (mirror — same field `project_status`):
- UNIFIED_STATUS_OPTIONS (~L36): 11 statuses (incl. leading 'Draft').
- SERVICE_STAGE_GROUPS (~L69): same shape, leading 'draft' group.
- getServiceCollapseState(key) (~L1108): default-collapsed for 'completed' || 'loss' || 'draft'. localStorage key 'browse-collapse-services'.
- buildServiceRow(s) (~L1164): mirror; links to `#/services/detail/${service_code||id}`.
- renderServiceFeed (~L1192): same urgent/watch/ok sections, builds from computeServiceUrgencySignals(filteredServices).
- renderServiceBrowseAll (~L1218): `SERVICE_STAGE_GROUPS.map(...)` filter `group.statuses.includes(s.project_status)`.
- toggleServiceStageGroup (~L1242).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Legacy group to projects.js Feed + Browse All</name>
  <files>app/views/projects.js</files>
  <action>
Define a small module-level predicate near UNIFIED_STATUS_OPTIONS (~L45): `const isLegacyStatus = (s) => !!s && !UNIFIED_STATUS_OPTIONS.includes(s);`. Only NON-empty unmapped values are legacy — empty/missing statuses already render "—" and must NOT be pulled into Legacy.

(A) Browse All — renderBrowseAll (~L1187): the existing STAGE_GROUPS entries use a fixed `statuses[]` list, which cannot express the open-ended legacy set. Append a 7th legacy group whose membership is predicate-based, not status-list-based. Implement by special-casing the legacy key in renderBrowseAll: build the rendered groups as `[...STAGE_GROUPS, LEGACY_GROUP]` where `LEGACY_GROUP = { key: 'legacy', label: 'Legacy / Unmapped', color: '#6b7280' }` (distinct mid-grey — NOT #94a3b8, which the inspection group already uses). In the `.map`, compute `rows` via: if `group.key === 'legacy'` filter `filteredProjects.filter(p => isLegacyStatus(p.project_status))`, else keep the existing `group.statuses.includes(p.project_status)` filter. Reuse the same sort and buildFeedRow row rendering. Add `'legacy'` to the default-collapsed set in getCollapseState (~L73): change the fallback to `(key === 'completed' || key === 'loss' || key === 'legacy')` — legacy is a cleanup bucket, default-collapsed like terminal groups.

(B) Priority Feed — renderPriorityFeed (~L1111): legacy rows currently fall into the `ok` bucket from computeUrgencySignals (getProjectSignal returns level 'ok' for unmapped statuses). Pull them OUT so they do not double-show. After destructuring `{ urgent, watch, ok }`, partition ok: `const legacy = ok.filter(p => isLegacyStatus(p.project_status)); const okClean = ok.filter(p => !isLegacyStatus(p.project_status));`. Use `okClean` for the On Track section's rows. Append a Legacy section AFTER On Track: `{ tier: 'legacy', label: 'Legacy', icon: '🗂️', rows: legacy, hideWhenEmpty: true }`. The existing `.map` already handles hideWhenEmpty and uses buildFeedRow, so legacy rows render identically and stay clickable to `#/projects/detail/...`. The `tier-legacy` CSS class has no existing style — that is acceptable (rows still render via shared classes); do not add CSS.

Do NOT touch renderScorecards / per-stage scorecard counts — out of scope. Legacy engagements remain excluded from per-stage scorecard cells but are still counted in Total (known, accepted gap; no change here).
  </action>
  <verify>
Manual browser UAT (no automated tests in this repo):
1. Run `python -m http.server 8000`, open `#/projects`.
2. Ensure at least one project has a legacy status (a `project_status` value not in the 10 canonical options — e.g. an old "Active" or "Won" value). If none exists in prod data, temporarily edit one project's status via the detail page to a non-canonical value to test, then revert.
3. Priority Feed: the legacy project appears under a new "🗂️ Legacy" section (NOT under On Track). The On Track count no longer includes it.
4. Browse All (toggle view mode): a new "Legacy / Unmapped" group appears at the bottom, default-collapsed, mid-grey spine (#6b7280). Expanding it shows the legacy project; clicking the row opens its detail page.
5. With NO legacy projects: Feed shows no Legacy section; Browse shows the Legacy group with "No projects in this stage" placeholder.
6. Console has zero errors.
  </verify>
  <done>Legacy projects surface in a dedicated Feed section and a dedicated Browse All group, are clickable to detail, default-collapsed in Browse, and no longer appear under On Track. Empty case is clean. No scorecard changes.</done>
</task>

<task type="auto">
  <name>Task 2: Mirror Legacy group into services.js</name>
  <files>app/views/services.js</files>
  <action>
Apply the exact same change to the services mirror. services.js uses the same `project_status` field and an equivalent structure (with a leading 'Draft' group).

Define `const isLegacyStatus = (s) => !!s && !UNIFIED_STATUS_OPTIONS.includes(s);` near UNIFIED_STATUS_OPTIONS (~L48). Note services' UNIFIED_STATUS_OPTIONS includes 'Draft', so Draft is canonical and NOT legacy.

(A) Browse All — renderServiceBrowseAll (~L1218): render `[...SERVICE_STAGE_GROUPS, LEGACY_GROUP]` with `LEGACY_GROUP = { key: 'legacy', label: 'Legacy / Unmapped', color: '#6b7280' }`. Special-case the legacy key: rows = `filteredServices.filter(s => isLegacyStatus(s.project_status))`, else existing `group.statuses.includes(s.project_status)`. Reuse buildServiceRow and the existing sort. Add `'legacy'` to the default-collapsed fallback in getServiceCollapseState (~L1108): `(key === 'completed' || key === 'loss' || key === 'draft' || key === 'legacy')`.

(B) Priority Feed — renderServiceFeed (~L1192): after `{ urgent, watch, ok }`, partition `const legacy = ok.filter(s => isLegacyStatus(s.project_status)); const okClean = ok.filter(s => !isLegacyStatus(s.project_status));`. Use `okClean` for On Track rows. Append `{ tier: 'legacy', label: 'Legacy', icon: '🗂️', rows: legacy, hideWhenEmpty: true }` after On Track. buildServiceRow links legacy rows to `#/services/detail/...`.

Do NOT touch service scorecards — out of scope (same accepted gap as projects).
  </action>
  <verify>
Manual browser UAT:
1. With server running, open `#/services` (services view).
2. Ensure a service has a legacy status (non-canonical `project_status`, not in the 11 services options). Use a detail-page edit to set one temporarily if needed, then revert.
3. Service Priority Feed: legacy service appears under a new "🗂️ Legacy" section, not On Track.
4. Service Browse All: "Legacy / Unmapped" group at the bottom, default-collapsed, mid-grey #6b7280 spine; row opens the service detail page.
5. Empty case: no Legacy Feed section; Browse Legacy group shows placeholder line.
6. Confirm the projects view still behaves correctly (no cross-contamination — separate localStorage keys 'browse-collapse' vs 'browse-collapse-services').
7. Console has zero errors.
  </verify>
  <done>Services view mirrors the projects Legacy behavior: dedicated Feed section + default-collapsed Browse group, clickable to service detail, Draft remains canonical (not legacy), no scorecard changes.</done>
</task>

</tasks>

<verification>
- Legacy projects/services appear in their own Feed section and Browse group in both views.
- On Track / On Track counts exclude legacy rows in both views.
- Legacy rows are clickable to the correct detail route (`#/projects/detail/...` and `#/services/detail/...`).
- Empty-state behavior is clean in both views.
- No console errors; no changes to scorecards or schema.
</verification>

<success_criteria>
- BOTH views surface legacy/unmapped engagements in a dedicated, distinctly-colored, default-collapsed Legacy bucket in Browse All and a hide-when-empty Legacy section in the Priority Feed.
- Legacy rows are openable/editable via existing detail routes (no new edit path).
- Diff is tight: only projects.js and services.js touched; scorecards and migration untouched (known accepted gap: legacy still excluded from per-stage scorecard cells, still counted in Total).
</success_criteria>

<output>
Create `.planning/quick/260615-nzy-add-legacy-group-to-priority-feed-and-br/260615-nzy-SUMMARY.md` when done.
</output>
