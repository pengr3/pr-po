# Phase 3: Projects Management - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Finding, filtering, and viewing projects through powerful list management. Users can click projects to view full details, filter by status/client, search by code/name, and see projects sorted by recency. Detail view allows inline editing of project data.

</domain>

<decisions>
## Implementation Decisions

### Project detail view presentation
- Display all project fields grouped by category
- Categories: Basic Info, Financial Details, Status, Personnel
- Show created/modified timestamps (audit trail)
- Financial fields formatted with currency (₱ with commas)
- Active/Inactive displayed as interactive toggle switch
- All fields editable inline EXCEPT project code (immutable) and client (locked)
- Auto-save on field blur (no save button)
- Silent save (no visual feedback on success)
- Show error and keep field editable on save failure
- Validation runs before save with inline error display
- Empty/optional fields show placeholder text like "(Not set)"
- No related data from other collections - just project data
- Delete button available with confirmation modal
- After deletion, navigate back to projects list
- Personnel field uses simple text input

### Filter and search behavior
- Multiple filters combine with AND logic (all must match)
- Search uses debounced instant search (updates after brief pause in typing)
- Filter dropdowns have default "All" option (All Clients, All Statuses, etc.)
- Filters reset on navigation - no persistence between sessions
- Search searches by project code or name

### List display and sorting
- Columns: Code, Name, Client, Internal Status, Project Status, Active/Inactive
- Active/Inactive shown as badge/pill with color (green Active, gray Inactive)
- Interactive column sorting - click headers to sort
- Default sort: Most recent first (newest projects at top)

### Navigation and page layout
- Click anywhere on row to open detail view
- Detail view is full page transition (route: #/projects/detail/PROJECT_CODE)
- Return via browser back button only (no UI back button)

### Claude's Discretion
- Category grouping layout (card-based sections vs single column vs other)
- Inline editing vs read-only with Edit button approach
- Whether to use tabs or single view structure
- Exact debounce delay for search
- Sort indicator styling (arrows, icons)
- Loading states and transitions
- Empty state messages for no results

</decisions>

<specifics>
## Specific Ideas

- "My worry is that when a filter is remembered will this affect all users" → Clarified that filters are per-browser session and reset on navigation
- Auto-save pattern chosen for efficiency but must handle errors gracefully
- Client field locked because project code includes client - changing client would break code structure

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope

</deferred>

---

*Phase: 03-projects-management*
*Context gathered: 2026-01-26*
