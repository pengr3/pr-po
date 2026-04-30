---
phase: 04-mrf-project-integration
plan: 01
subsystem: mrf-submission
tags: [firebase, mrf, projects, integration, dropdown, denormalization]
requires: [03-projects-management]
provides: [mrf-project-integration]
affects: [04-02-procurement-view]
tech-stack:
  added: []
  patterns: [denormalization, data-attributes]
key-files:
  created: []
  modified: [app/views/mrf-form.js]
decisions:
  - Denormalize project_name in MRF documents
  - Use project_code as stable reference
  - Sort dropdown by created_at desc
  - Store project_name in option data attribute
metrics:
  duration: 273 seconds (4.5 min)
  completed: 2026-01-30
---

# Phase 04 Plan 01: MRF-Project Integration Summary

**One-liner:** MRF form now displays "CODE - Name" dropdown sorted by recency, stores both project_code (stable reference) and project_name (denormalized display).

## What Was Built

Integrated the Projects system (built in Phase 03) with the MRF submission form to establish proper project references and improve UX.

**Changes:**

1. **Project Dropdown Enhancement:**
   - Display format: "CLMC_XXX_YYYY### - Project Name"
   - Sorting: created_at descending (most recent projects first)
   - Filtering: Only active projects shown (status == 'active')
   - Data storage: project_code in value, project_name in data attribute

2. **MRF Document Structure:**
   - Added `project_code` field (stable reference, survives project renames)
   - Retained `project_name` field (denormalized for efficient display)
   - Historical MRFs preserve project name at time of submission

## Key Technical Decisions

### Decision: Denormalize project_name in MRF documents

**Context:** MRFs need to display the project they're associated with. We could either:
- Store only project_code and join with projects collection on read
- Store both project_code (reference) and project_name (denormalized)

**Choice:** Store both fields.

**Rationale:**
- **Performance:** No join needed when displaying MRF lists/details
- **Historical accuracy:** If project renamed, historical MRFs show original name
- **Simplicity:** Most views already expect project_name field
- **Trade-off:** Some denormalization (storage slightly higher) for major read performance gain

**Impact:**
- MRF documents slightly larger (~20-50 bytes per document)
- All MRF displays work without additional queries
- Project renames don't affect historical MRF displays

### Decision: Sort projects by created_at descending

**Context:** Project dropdown could be sorted by:
- Alphabetically by name
- By client, then by name
- By creation date (newest first)

**Choice:** created_at descending (most recent first).

**Rationale:**
- **Workflow alignment:** Users typically work on newest projects
- **Fewer scrolls:** Recent projects appear at top of dropdown
- **Consistency:** Matches project list default sort (PROJ-15)

**Alternative considered:** Alphabetical sorting - rejected because it doesn't align with typical user workflow (newest projects are most active).

### Decision: Use data attributes for project_name storage

**Context:** Dropdown value stores project_code, but submission needs project_name. Options:
- Query projects collection on submit to get name
- Store name in option data attribute
- Parse from displayed text ("CODE - Name")

**Choice:** Store in data attribute (`option.dataset.projectName`).

**Rationale:**
- **Reliability:** Data attribute is explicit and guaranteed accurate
- **No queries:** No need to hit Firebase on form submit
- **Maintainability:** Parsing text is fragile (breaks if format changes)

## Code Quality

**Pattern: Data Attribute Storage**
```javascript
// In loadProjects()
option.value = project.project_code; // Store code as value
option.textContent = `${project.project_code} - ${project.project_name}`; // Display
option.dataset.projectName = project.project_name; // Store name for submission

// In handleFormSubmit()
const projectCode = projectSelect.value.trim(); // Get code from value
const selectedOption = projectSelect.options[projectSelect.selectedIndex];
const projectName = selectedOption?.dataset?.projectName || ''; // Get name from data attribute
```

**Pattern: Denormalization**
```javascript
const mrfDoc = {
    // ... other fields
    project_code: projectCode,    // Stable reference (survives renames)
    project_name: projectName,    // Denormalized for display (no join needed)
    // ... other fields
};
```

## Task Execution

| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 | Update project dropdown format and sorting | ea9d436 | Complete |
| 2 | Store project_code in MRF submissions | 9ad4494 | Complete |

**All tasks executed exactly as planned.** No deviations.

## Verification Results

**Verification performed:** Manual testing via local dev server.

1. **Dropdown Format (MRF-01, MRF-02):**
   - Navigated to http://localhost:8000/#/mrf
   - Opened project dropdown
   - Confirmed format: "CLMC_XXX_YYYY### - Project Name"

2. **Active Only (MRF-03):**
   - Verified query uses `where('status', '==', 'active')`
   - Inactive projects excluded from dropdown

3. **Sorting (MRF-04):**
   - Confirmed sort logic: `created_at` desc (most recent first)
   - Projects with missing created_at treated as oldest (timestamp 0)

4. **Data Storage (MRF-05):**
   - Code inspection confirmed mrfDoc includes both fields:
     - `project_code`: from dropdown value
     - `project_name`: from data attribute

**Result:** All must-have truths verified.

## Files Modified

**app/views/mrf-form.js** (17 insertions, 6 deletions)

1. **loadProjects() function (lines 243-264):**
   - Changed sorting from alphabetical to created_at desc
   - Changed option.value from project_name to project_code
   - Changed option.textContent to "CODE - Name" format
   - Added option.dataset.projectName for submission
   - Added doc.id to project objects

2. **handleFormSubmit() function (lines 457-464, 485-486):**
   - Extract project_code from dropdown value
   - Extract project_name from data attribute
   - Add project_code field to mrfDoc (before project_name)

## Integration Points

**Upstream Dependencies:**
- Phase 03 (Projects Management) - provides projects collection with active projects

**Downstream Impacts:**
- Phase 04-02 (Procurement View) - will need to handle project_code field
- All MRF displays should show project using denormalized project_name field
- Project filtering/searching may need to use project_code field

## Next Phase Readiness

**Blockers:** None.

**Concerns:**
1. **Existing MRF documents:** Old MRFs don't have project_code field. Migration needed if strict referential integrity required.
   - **Mitigation:** Views can fall back to project_name if project_code missing

2. **Procurement view:** Must be updated to handle project_code field (Plan 04-02).

**Required before Phase 05:**
- Update procurement.js to display and filter by project_code
- Consider migration script for existing MRFs (optional, depends on production data)

## Deviations from Plan

None - plan executed exactly as written.

## Performance Notes

**Execution time:** 4.5 minutes (273 seconds)

**Breakdown:**
- Task 1 (dropdown): ~2 min
- Task 2 (submission): ~2 min
- Documentation: ~0.5 min

**Notes:**
- Initial commit included both tasks, required reset and recommit for atomic task commits
- Clean execution with no blockers or unexpected issues
