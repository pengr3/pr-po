# Phase 101: Project Journal — Activity Feed, Progress Updates, Issues Panel — Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a three-tab "Project Journal" panel to `project-detail.js` — below the Info+Financial cards — so any project-access user can record what happens during active project execution. The three tabs are:

1. **Activity Feed** — freeform timestamped entries (tag types: Update / Milestone / Issue / Client Comm) plus system auto-entries (status changes, field edits, lifecycle gate transitions, PO Delivered, issue resolution)
2. **Progress Updates** — periodic structured check-ins (% complete, summary, blockers, next milestone)
3. **Issues** — categorized punch list (Delay / Change Order / Site Issue / Client Request) with open/resolved workflow

**Scope anchor:** Project-only for this phase. Service-detail parity is deferred to a dedicated follow-up phase.

</domain>

<decisions>
## Implementation Decisions

### Status Gate — when the panel appears
- **D-01:** Panel shows for **For Mobilization** and **On-going** statuses with full write access
- **D-02:** Panel shows **read-only** for **Completed** projects (history remains accessible for reporting/retrospective)
- **D-03:** Panel is **hidden entirely** for Loss and all statuses earlier than For Mobilization (For Inspection, For Proposal, internal/client review stages)
- **D-04:** Entries created during On-going remain visible if status later moves to Completed (read-only)

### Auto-entry Event Scope — what triggers system Feed entries
- **D-05:** **Project status changes** always auto-post a system entry (type: `system`, `is_system: true`) with before/after status
- **D-06:** **Contract value and Budget field edits** auto-post a system entry with delta (e.g., "Contract value changed ₱3.8M → ₱4.2M by A. Mendoza") — same fields already instrumented for NOTIF-19 (Phase 84.1); reuse that detection pattern
- **D-07:** **All 4 Phase 100 lifecycle gate transitions** auto-post system entries (inspection report attached → advanced to For Proposal; NTP attached → Start Mobilization; Start Project; completion docs → Completed); Phase 100 gate functions must write an `activity_entries` doc alongside the projects update
- **D-08:** **PO Delivered** procurement event auto-posts a system entry referencing the PO ID and supplier
- **D-09:** Edit history folds into the Feed as system auto-entries — no separate edit-history UI needed for the journal
- **D-10:** Personnel assignment changes, billing request events, and RFP Paid events do NOT auto-post (out of scope for this phase)

### Issue Resolution UX
- **D-11:** Resolving an issue requires a **required resolution notes field** — forces accountable closure, matches the Phase 87 rejection-requires-comment pattern
- **D-12:** Resolving an issue **auto-posts a system entry** to the Activity Feed: "Issue #N (type — title) resolved by [name]" (type: `system`, auto-generated)
- **D-13:** Resolved issues **can be re-opened** by any project-access user (same permission as creating); re-open clears `resolved_at`/`resolved_by_uid`/`resolution_notes` and auto-posts "Issue re-opened by [name]" to the Feed
- **D-14:** Issue state machine: `open` ↔ `resolved` (bidirectional, no terminal state)

### Permissions
- **D-15:** Any user with project access (ops, admin, procurement, finance) can post to all three tabs — no role-gating within the journal (confirmed in spike 032)
- **D-16:** Read-only mode (Completed projects) means no composer/form shown; existing entries visible

### Data Model (from spike 032 — locked)
- **D-17:** Three Firestore subcollections under `projects/{projectId}`:
  - `activity_entries/{entryId}` — type: `'update'|'milestone'|'client'|'system'|'edit'`; text; created_at (Timestamp); created_by_uid; created_by_name; is_system (bool)
  - `progress_updates/{updateId}` — pct_complete (number); summary; blockers; next_milestone; created_at; created_by_uid; created_by_name
  - `issues/{issueId}` — issue_type: `'delay'|'change_order'|'site_issue'|'client_request'`; title; description; status: `'open'|'resolved'`; resolution_notes (string|null); resolved_at (Timestamp|null); resolved_by_uid (string|null); created_at; created_by_uid; created_by_name
- **D-18:** All subcollections ordered `created_at desc`. Real-time `onSnapshot` listener per active tab. Listeners unsubscribed in `destroy()`.
- **D-19:** Progress Updates is manual-only — no Gantt integration (confirmed in spike 032)

### Service-detail parity
- **D-20:** **Project-only for Phase 101.** Services journal (mirroring `activity_entries`, `progress_updates`, `issues` to `services/{serviceId}/...`) is **deferred to a separate follow-up phase** per user direction.

### Claude's Discretion
- Issue ID format within the panel display (e.g., sequential #N per project vs full Firestore ID) — researcher/planner decides; spike shows "#N" counter display
- Default tab when panel first opens — Activity Feed is the natural default (most active tab)
- Number of initial entries per tab before "Load more" — researcher/planner decides based on UX patterns in the codebase
- Entry deletion policy — not discussed; Claude may implement no-deletion (append-only log) which matches audit trail philosophy in the codebase

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spike Design Contract
- `.planning/spikes/032-ongoing-activity-panel/README.md` — Full spike findings: validated 3-tab design, confirmed data model, permissions, and "all 3 ship" decision. **Primary design reference.**
- `.planning/spikes/032-ongoing-activity-panel/spike.html` — Interactive prototype showing Feed composer, Progress Update form, Issue punch list. Visual reference for UX and tab layout.

### Security Rules Pattern (subcollections)
- `firestore.rules` — Read the `baselines` subcollection rule (Phase 86.12) at `match /projects/{projectId}/baselines/{baselineId}` as the template for the 3 new subcollections. Also read the `project_iterations` block (Phase 97) for another subcollection pattern.

### Auto-entry Detection Pattern
- `.planning/phases/84.1-procurement-notifications-trigger-enhancements/` — Phase 84.1 Plan 02 implements `PROJECT_COST_CHANGED` notification (NOTIF-19) with contract/budget field delta detection. The delta-detection pattern (`oldValue !== newValue`) reused for D-06 auto-entries.

### Existing View Architecture
- `app/views/project-detail.js` — Target file. Read current structure: how lifecycle accordion (Phase 100), proposal inline card, billing footer, and Info+Financial grid are laid out before inserting the journal panel below them.

### SPA Patterns
- `CLAUDE.md` — Section "SPA Development Patterns" for render/init/destroy lifecycle, listener management array, and window function registration (all apply to the new journal panel).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/utils.js` → `escapeHTML()` — required on all user-supplied text rendered to innerHTML (entry text, issue title/description, resolution notes)
- `app/utils.js` → `formatCurrency()` — for contract/budget delta auto-entries
- `app/notifications.js` → `getCurrentUser()` — for `created_by_uid` / `created_by_name` on all writes
- Existing `.status-badge`, `.personnel-pill` CSS classes — reuse for issue type chips and resolution badge

### Established Patterns
- **Subcollection listener**: `onSnapshot(collection(db, 'projects', projectId, 'activity_entries'), ...)` — push to `listeners[]`, unsubscribe in `destroy()`. Pattern from Phase 86.12 baselines + Phase 97 iterations.
- **Optimistic append**: show entry in DOM immediately on submit, let snapshot reconcile — avoids flicker. Phase 86.1 inline grid uses this.
- **Read-only mode toggle**: `const isReadOnly = project.status === 'Completed'` gates composer/form HTML. Simple boolean injected at render time.
- **Tab switching within project-detail**: look at how the project-plan.js is embedded as a separate route (#/projects/{code}/plan). The journal panel lives inline on project-detail (no new route), so tab switching is DOM-only (show/hide sections, swap listener).

### Integration Points
- **Phase 100 gate functions** (`lcAdvanceToForProposal`, `lcStartMobilization`, `lcStartProject`, `lcMarkProjectComplete`) must each call a new `_addActivityEntry(projectId, { is_system: true, type: 'system', text: '...' })` helper **after** their Firestore project update succeeds
- **PO Delivered trigger site**: `procurement.js` — find where `procurement_status` is set to `'Delivered'` and add the auto-entry write there
- **Budget/contract edit trigger site**: `project-detail.js` — find the `saveProjectField` or equivalent inline-edit save handler for `contract_cost` / `budget` fields

</code_context>

<specifics>
## Specific Ideas

- Spike prototype shows a "Log pane at bottom shows all interactions with timestamps" — this is purely for the spike demo; the real Feed IS that log
- The Feed composer in spike 032 has a tag-type selector (Update / Milestone / Issue / Client Comm) + text area + Post button — keep this exact UX
- Issues tab shows filter chips (All / Open / Resolved) above the punch list — keep this filter pattern from the spike

</specifics>

<deferred>
## Deferred Ideas

- **Services journal parity** — Mirror `activity_entries`, `progress_updates`, `issues` subcollections to `services/{serviceId}/...` with the same UI panel in `service-detail.js`. Defer to a dedicated follow-up phase (Phase 101.1 or similar). User direction: "I will work on a separate phase to mirror project to services entirety."
- **Personnel change auto-entries** — Log when someone is added/removed from project personnel. Not in scope for Phase 101 (D-10).
- **Billing request auto-entries** — Log BILLING_REQUEST_SUBMITTED / BILLING_REQUEST_DECIDED events in the Feed. Not in scope for Phase 101 (D-10).
- **Entry editing** — Whether authors can edit posted Feed entries. Not discussed — left to Claude's discretion (append-only recommended).

</deferred>

---

*Phase: 101-project-journal-activity-feed-progress-updates-issues*
*Context gathered: 2026-06-10*
