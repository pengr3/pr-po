# Phase 81: Unified Project and Service Status Overhaul - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the dual `internal_status` + `project_status` fields on both Projects and Services with a single unified `project_status` field using 10 new option values. Updates all forms, filter UI, table columns, CSV export, validation logic, edit history labels, and the home dashboard charts.

**Out of scope:** The `active` / inactive flag is separate and unchanged. No changes to MRF workflow, procurement collections, or auth.

</domain>

<decisions>
## Implementation Decisions

### Field Name
- **D-01:** Reuse the existing `project_status` Firestore field name. Repurpose it with the new 10-option unified list. No new field introduced.

### New Unified Status Options (10 — locked)
- **D-02:** For Inspection, For Proposal, Proposal for Internal Approval, Proposal Under Client Review, For Revision, Client Approved, For Mobilization, On-going, Completed, Loss

### Legacy Data Handling
- **D-03:** Read-time fallback only — no migration script. If an existing doc's `project_status` value is not in the new 10-option list, display it as-is (e.g. in grey or plain text) so the user can see it and manually re-select the correct status on their next edit.
- **D-04:** The old `internal_status` field is ignored entirely in the new UI. It is NOT read, displayed, or written. Old docs retain it as an orphaned field in Firestore — no deleteField() calls on save.

### Home Dashboard
- **D-05:** Replace the two-section layout (Internal Status section + Project Status section) per entity type with a single chart per entity type: one Projects Status chart and one Services Status chart, both using the new 10-option unified list.

### Edit History Labels
- **D-06:** Rename the `project_status` field label in `edit-history.js` from `'Project Status'` to `'Status'`. Remove the `internal_status` → `'Internal Status'` entry (field no longer written). Edit log reads: "Status changed from X to Y."

### Claude's Discretion
- Visual treatment for legacy project_status values not in the new list (grey text, italic, etc.) — Claude decides based on existing styling patterns.
- Whether to show a single filter dropdown or a grouped UI for the 10 options — Claude decides based on the existing filter layout.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Key files to read before planning
- `app/views/projects.js` — Create form, edit form, filter dropdowns, table columns, CSV export, validation, save logic; contains `INTERNAL_STATUS_OPTIONS` and `PROJECT_STATUS_OPTIONS` constants
- `app/views/project-detail.js` — Detail page status dropdowns; contains own local copies of both constants
- `app/views/services.js` — Mirror of projects.js for Services; contains own local constants
- `app/views/service-detail.js` — Mirror of project-detail.js for Services; contains own local constants
- `app/views/home.js` — Dual-status chart sections (Internal + Project per entity); contains own local copies of constants
- `app/edit-history.js` — Field label map at lines 37–38: `internal_status` → 'Internal Status', `project_status` → 'Project Status'

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `INTERNAL_STATUS_OPTIONS` and `PROJECT_STATUS_OPTIONS` arrays: defined locally in each of the 5 files (no shared module — zero-build static site pattern). All 5 copies must be replaced with a single `UNIFIED_STATUS_OPTIONS` constant (or equivalent local constant) in each file.
- Filter logic pattern: `internalStatusFilter` + `projectStatusFilter` vars → collapse to one `statusFilter` var per entity file.
- Table column pattern: Two adjacent `<th>` columns (Internal Status + Project Status) in both projects.js and services.js → collapse to one `<th>Status</th>`.
- CSV headers: `['Code', 'Name', 'Client', 'Internal Status', 'Project Status', 'Active']` in both projects.js and services.js → update to `['Code', 'Name', 'Client', 'Status', 'Active']`.

### Established Patterns
- Status arrays are copy-pasted across files (no shared import) — this is the existing pattern for the zero-build SPA. Continue this pattern; duplicate the new `UNIFIED_STATUS_OPTIONS` into each file.
- Validation uses `.includes(value)` against the option arrays — straightforward to update.
- `project_status` already written to Firestore on create and edit in both collections — no schema change needed.

### Integration Points
- `app/edit-history.js:37–38` — Field label map; update `project_status` label, remove `internal_status` entry.
- `app/views/home.js` — Chart initialization uses two separate `byInternal` / `byProject` counter objects per entity; collapse to one per entity.
- `app/views/procurement.js` and `app/views/mrf-form.js` — Do NOT reference `internal_status` or `project_status` — no changes needed in these files.
- `firestore.rules` — Does NOT reference either status field — no changes needed.

</code_context>

<specifics>
## Specific Ideas

- The edit-history.js `internal_status` entry should be REMOVED (not just relabeled) since the field will no longer be written by the new code. Keeping a stale label for a field that is never written would cause no harm but is unnecessary clutter.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 81-unified-project-and-service-status-overhaul*
*Context gathered: 2026-04-27*
