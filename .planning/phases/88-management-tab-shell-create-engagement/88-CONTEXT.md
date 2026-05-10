---
name: 88-CONTEXT
description: Decisions for Phase 88 — Proposals tab shell + Create Engagement (renamed from Management). Tab labeled "Proposals", placed between Finance and Admin in top nav, hosts an inline 'New Engagement' form that delegates to a shared engagement-create helper extracted from existing projects.js / services.js create flows. New engagements default to project_status="Draft". Phase 89 (queue) and Phase 87 (proposal dashboard) plug into this same tab afterward.
type: phase-context
---

# Phase 88: Proposals Tab Shell + Create Engagement — Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Source:** `/gsd-discuss-phase 88` — interactive discussion with user

<domain>
## Phase Boundary

Phase 88 ships **the Proposals tab shell** in the top navigation (Super Admin only) plus a **Create Engagement** inline form that auto-routes the new record to `projects` or `services` based on the engagement type the user picks. Tab name change from REQUIREMENTS.md: **"Management" → "Proposals"** per user direction (D-01). The MGMT-* requirement IDs still apply but the user-facing label and route reflect the new name.

The tab grows in subsequent phases:
- Phase 89 (consumer of MGMT-03 / MGMT-04) adds the proposal-approval queue inside the same tab.
- Phase 87 (consumer of PROP-01..11) adds the proposal dashboard inside the same tab.

Phase 88 must leave the tab structure ready for those mounts (a single scrollable surface with a stable section ordering: New Engagement → [Phase 89 queue] → [Phase 87 dashboard]).

### In scope (MGMT-01, MGMT-02, MGMT-05, MGMT-06, MGMT-07)

- **Top-nav link**: "Proposals" link visible only to Super Admin; placed between "Finance" and "Admin" (D-02).
- **Router gate**: hash route `#/proposals` registered; non-Super-Admin users redirected away (router-level gate, mirroring how the codebase already gates `/admin`).
- **Security Rules**: Firestore rules deny direct collection writes for non-`super_admin` on the new collections this tab introduces (none in Phase 88 — `projects` and `services` already have rules). The MGMT-07 gate applies to the proposal-related collections in Phase 87 / Phase 89.
- **Inline 'New Engagement' form** at the top of the Proposals tab page (D-03):
  - Engagement type radio/segmented control: project / one-time service / recurring service.
  - Client picker (optional — Phase 78 D-04 clientless-creation pattern).
  - Name (project_name / service_name).
  - Budget (number).
  - Contract cost (number).
  - Initial assigned personnel (multi-select user picker).
- **Form submit** writes to:
  - `projects` collection if engagement type = project (with `project_code` generated only if a client is selected, per Phase 78 D-04).
  - `services` collection if engagement type = one-time/recurring service (with `service_type: 'one-time' | 'recurring'`).
- **Initial project_status = `"Draft"`** (D-05). Engagements start in a pre-proposal state; Phase 87's proposal lifecycle advances status from there.
- **Code reuse**: extract a shared `engagement-create` helper (D-04) consumed by BOTH the existing `projects.js` / `services.js` create flows AND the new Proposals-tab form. Refactor existing call sites in the same phase so there is no duplication.

### Out of scope (deferred)

- **Proposal approval queue** (MGMT-03 / MGMT-04) — Phase 89 mounts this section inside the same tab.
- **Proposal dashboard** (PROP-10) — Phase 87 mounts this section inside the same tab.
- **Replacing existing project/service create entry points** — the existing Projects-tab and Services-tab create flows STAY. Both they and the Proposals-tab form go through the shared helper, but neither entry point is removed in this phase.
- **Status workflow** beyond setting initial `"Draft"` — transitions happen in Phase 87.
- **Custom claims for role gating** — current pattern uses Firestore role lookups; no migration in this phase.
- **Renaming MGMT-* requirement IDs** — IDs stay as `MGMT-*` for traceability; only the user-facing label changes.

</domain>

<decisions>
## Implementation Decisions

### D-01 — Tab name: "Proposals" (renamed from REQUIREMENTS.md "Management")
User explicitly renamed during discussion. The tab label in nav, the route name, and the surface name all use **"Proposals"**. The MGMT-* requirement IDs continue to apply and are recorded against this phase as before — only the surface label changes. Phase 89's name on ROADMAP.md should also be updated to "Proposals Tab — Approval Queue" for consistency (a small follow-up edit, not a scope change).

### D-02 — Nav placement: between Finance and Admin
Sits in the main horizontal nav strip in the order: Home, Clients, Projects, Services, Material Request, Procurement, Finance, **Proposals**, Admin, Log Out. Matches the existing top-nav pattern. Visible only to Super Admin (router-gated and HTML-conditioned, same pattern as the existing Admin dropdown).

### D-03 — Form pattern: inline section on the Proposals tab page
A "New Engagement" panel sits at the top of `#/proposals`. Below it (in the same scrollable surface), Phase 89 mounts the proposal-approval queue, then Phase 87 mounts the proposal dashboard. One page, three sections, top-down. No modal, no dedicated sub-route for the form.

**Section ordering (locked for downstream phases):**
1. New Engagement form (Phase 88)
2. Proposal Approval Queue (Phase 89)
3. Proposal Dashboard — grouped by stage (Phase 87)

This top-down flow mirrors the user's mental model: create → approve → track.

### D-04 — Reuse via extracted shared helper
Extract a shared module (proposed: `app/engagement-create.js`) exporting one `createEngagement({ type, client, name, budget, contractCost, personnel, ...optional })` function. The function:
1. Validates inputs (matches existing validation in `projects.js` / `services.js`).
2. Generates code via the existing `generateProjectCode(clientCode)` / `generateServiceCode(clientCode)` helpers (Phase 78 D-04 deferral applies for projects).
3. Writes via `addDoc(collection(db, type === 'project' ? 'projects' : 'services'), ...)` with the existing schema fields (project_status, budget, contract_cost, personnel_user_ids, personnel_names, location, active, created_at, collection_tranches, plus `service_type` if a service).
4. Calls `recordEditHistory()` for the create event (existing pattern).
5. Returns the new docRef.

Refactor `app/views/projects.js` (line ~681) and `app/views/services.js` (line ~721) to call `createEngagement(...)` instead of duplicating the addDoc + helpers. Net diff: no behavior change at the existing entry points; one new call site (the Proposals-tab form); LOC reduction in projects.js + services.js.

This avoids the "two surfaces drift" failure mode that has bitten this codebase before (see `feedback_orphan_ownership_parallel_plans.md` in user memory — same coupling concern at the file level).

### D-05 — Initial project_status: "Draft"
Engagements created from the Proposals tab start with `project_status: "Draft"`. This is a NEW status string. Downstream views (Procurement, Finance, Home, Projects) MUST be checked during planning for graceful handling of "Draft" — at minimum:
- Filtering: "Draft" engagements should NOT appear in operational lists (MRF Records, PR/PO scoreboards, Finance dashboards) until status advances out of Draft.
- Status badges: a CSS class for the new status (likely `.status-draft` matching the existing pattern).
- Procurement workflow: MRFs cannot be created against a Draft project.

The researcher locks the canonical list of consuming views during planning; the planner ensures each is updated.

The existing project create form (`projects.js`) currently lets the user pick a status; behavior there is preserved (user-picked) — only the Proposals-tab form auto-defaults to "Draft".

### D-06 — Security Rules (MGMT-07 scope)
- `projects` and `services`: existing rules already gate writes appropriately. No rule changes for these collections in Phase 88.
- The MGMT-07 gate ("deny all Mgmt Tab back-end ops for non-super_admin") applies meaningfully to the proposal-related collections that Phase 87 introduces. Phase 88's only new write surface is `projects` / `services` create — already protected today.
- Router-level gate: a check in `app/router.js` for the `/proposals` route that redirects non-Super-Admin to home. Same pattern the codebase already uses for the Admin route.

### D-07 — User picker for personnel
Reuse the existing multi-select user picker from `projects.js` / `services.js` (selectedPersonnel state, `personnel_user_ids[]` + `personnel_names[]` arrays). Researcher to lock the exact component / pattern during planning. If the picker is locally defined in each view, factor it out alongside `engagement-create.js` (or note as a near-term cleanup if the cost is high).

### D-08 — Clientless creation
Phase 78 D-04 already locks: project_code is `null` until a client is later assigned. The Proposals-tab form supports clientless creation by leaving the client picker empty; the resulting project doc has `client_id: null, client_code: null, project_code: null`. Services REQUIRE a client (per existing `services.js` flow — `client_code` is mandatory for `generateServiceCode`); the form must enforce this when the engagement type is one-time/recurring service.

### Claude's Discretion

- Exact HTML structure of the inline form panel (collapsible vs always-expanded).
- Budget / contract-cost input field decoration (currency mask, decimal places).
- "New Engagement" submit button copy and post-submit toast.
- Whether to clear the form or keep it filled after a successful create.
- Mobile layout of the inline form (probably stack fields vertically below ~768px).
- Whether to lazy-load the picker users via onSnapshot at tab init or fetch on form open.
- The exact CSS class for the new "Draft" status badge — match existing status-badge naming.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Code surfaces (existing, to read before planning)
- `app/views/projects.js` (line ~681) — existing project create flow. Phase 88 refactors this call site to delegate to the shared helper.
- `app/views/services.js` (line ~721) — existing service create flow. Phase 88 refactors this call site too.
- `app/utils.js` — `generateProjectCode`, `generateServiceCode`, `formatCurrency`, `escapeHTML` helpers.
- `app/edit-history.js` — `recordEditHistory()` helper for the create-event log.
- `app/router.js` — hash-based route registration; this is where the `/proposals` route registers, and the role gate is enforced.
- `index.html` — top-nav `<nav-links>` markup; the new "Proposals" link is added here, conditionally rendered for Super Admin.
- `app/firebase.js` — `db` export.
- `firestore.rules` — confirm `projects` / `services` write rules already gate by role (no rule edits expected this phase).

### Prior-phase context
- `.planning/phases/78-…/78-CONTEXT.md` D-04 — clientless-creation pattern (`project_code = null` until client assigned).
- `.planning/phases/85-collectibles-tracking/` — Pattern 21 (always-write `collection_tranches: []`) applies to the create flow.
- `.planning/phases/87-proposal-lifecycle/87-CONTEXT.md` — Phase 87 D-01 sequencing decision; mounts proposal dashboard inside the Proposals tab built here. Phase 87 D-08 — proposal-driven project_status state machine (which "Draft" feeds into).

### Schema (existing collections affected)
- `projects` — schema unchanged. New initial-status value `"Draft"` enters the data set; consuming views must filter/handle it.
- `services` — schema unchanged. Same `"Draft"` consideration.
- `users` — read-only, used for the personnel picker.

### CLAUDE.md
- View-module structure (`render` / `init` / `destroy`).
- Window-function pattern for `onclick` handlers.
- Hash-based routing pattern for the new `/proposals` route.
- Listener cleanup in `destroy()`.
- Role-based UI conditional rendering (existing pattern for Admin tab).

</canonical_refs>

<specifics>
## Specific Ideas

- **Module name:** `app/engagement-create.js` for the shared helper. Sibling pattern: `app/notifications.js`, `app/proof-modal.js`, `app/expense-modal.js`, `app/edit-history.js`.
- **View module:** `app/views/proposals.js` (with `render`, `init`, `destroy`). Phase 88 ships this with just the New Engagement section. Phase 89 / Phase 87 add additional sections inside the same view module.
- **Route key:** `/proposals` (no path parameter; sub-routes for proposal detail come in Phase 87).
- **"Draft" status filter sites to verify during planning:**
  - `app/views/procurement.js` — MRF Management filter (don't allow MRFs against Draft projects).
  - `app/views/finance.js` — exclude Draft from finance dashboards.
  - `app/views/home.js` — dashboard stats should not double-count Draft engagements.
  - `app/views/projects.js` and `app/views/services.js` — list views should show Draft (they're owned engagements) but visually flag them.
- **Phase 89 ROADMAP-name follow-up:** rename "Phase 89: Management Tab — Proposal Approval Queue" → "Phase 89: Proposals Tab — Approval Queue" when Phase 89 starts. Not in 88 scope, but worth noting.

</specifics>

<deferred>
## Deferred Ideas

- **Replacing existing project/service create entry points** with the Proposals-tab form. Today both surfaces continue to live; only the underlying logic is shared. Future phase could fold creation into Proposals-only.
- **Engagement templates** (preset budgets / personnel for common engagement types) — not in REQUIREMENTS, future phase.
- **Bulk import of engagements from CSV / external** — out of v4.0 scope.
- **Status workflow editor / configurable statuses** — current model is a hard-coded enum; no plan to make it dynamic.
- **Custom claims for role gating** — Firestore-lookup pattern is the current convention; migration is its own architectural project.
- **Activity timeline on the Proposals tab landing** (recent creates / status changes) — captured for v4.1+ if user requests.

</deferred>

---

*Phase: 88-management-tab-shell-create-engagement (label: "Proposals")*
*Context gathered: 2026-05-11 via /gsd-discuss-phase 88*
*Sequencing: ships before Phase 87 (proposal dashboard) and Phase 89 (approval queue), both of which mount inside the same tab.*
