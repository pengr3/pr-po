---
phase: 02-projects-core
plan: 01
subsystem: database
tags: [firebase, firestore, crud, projects, composite-ids]

# Dependency graph
requires:
  - phase: 01-clients-foundation
    provides: Client database with client_code field for project code generation
provides:
  - Project database with CRUD operations
  - Composite project code generation (CLMC_CLIENT_YYYY###)
  - Dual-status tracking (Internal Status + Project Status)
  - Active/inactive project toggle
affects: [02-02-router-integration, 03-mrf-project-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Composite ID generation with client prefix
    - Real-time dependent dropdown population
    - Dual status field management
    - Optional positive number validation
    - Denormalized field pattern (client_code)

key-files:
  created:
    - app/views/projects.js
  modified:
    - app/utils.js

key-decisions:
  - "Budget/contract_cost validation rejects zero (positive means > 0)"
  - "Client dropdown uses onSnapshot for real-time updates"
  - "Regex parsing for project codes handles client codes with underscores"
  - "Client code denormalized in project documents for efficient filtering"
  - "Project code is immutable after creation (not updated on edit)"

patterns-established:
  - "Composite ID generation with per-client per-year uniqueness"
  - "Optional field validation (null allowed, but if provided must be positive)"
  - "Dependent dropdown real-time population pattern"
  - "Dual status dropdowns with predefined options"

# Metrics
duration: 3min
completed: 2026-01-25
---

# Phase 02 Plan 01: Project CRUD View Summary

**Complete project management with auto-generated composite codes, dual-status tracking, client selection, and CRUD operations**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-25T09:24:55Z
- **Completed:** 2026-01-25T09:27:42Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Composite project code generator in utils.js (CLMC_CLIENT_YYYY###)
- Complete project CRUD operations with 595-line view module
- Dual status tracking (4 Internal Status options, 7 Project Status options)
- Client dropdown with real-time Firestore population
- Optional positive number validation for budget/contract_cost
- Active/inactive toggle functionality
- Pagination with 15 items per page
- Proper lifecycle management (render/init/destroy)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create composite project code generator in utils.js** - `571d462` (feat)
2. **Task 2: Create projects view module with CRUD operations** - `cdf2a54` (feat)

## Files Created/Modified

**Created:**
- `app/views/projects.js` - Project management view with CRUD operations, composite ID generation, dual status fields, client dropdown, and active/inactive toggle

**Modified:**
- `app/utils.js` - Added generateProjectCode() function with regex parsing for composite codes

## Decisions Made

**1. Budget/contract_cost validation rejects zero**
- Requirement PROJ-17 says "positive numbers"
- Interpreted as > 0 (excludes zero)
- Validation: `budget <= 0` triggers error "must be a positive number (greater than 0)"
- Null allowed (optional fields)

**2. Client dropdown uses onSnapshot for real-time updates**
- Followed Pattern 2 from research document
- When new client added in clients view, dropdown auto-updates without page refresh
- Maintains current selection when re-rendering
- Sorted alphabetically by company_name

**3. Regex parsing for project codes**
- Handles client codes with underscores (e.g., ACME_INC → CLMC_ACME_INC_2026001)
- Pattern: `/^CLMC_.+_\d{4}(\d{3})$/` captures 3-digit number
- Avoids naive `split('_')` which breaks on underscore-containing client codes

**4. Client code denormalized in project documents**
- Stores both `client_id` (reference) and `client_code` (denormalized)
- Enables efficient filtering in Phase 3 without joins
- Tradeoff: Client code changes don't cascade (documented limitation for v1.0)

**5. Project code immutable after creation**
- Project code generated once at creation via generateProjectCode()
- Edit form doesn't regenerate or allow modification of project_code
- Ensures stable references from MRFs in Phase 3

**6. Status validation against predefined arrays**
- INTERNAL_STATUS_OPTIONS and PROJECT_STATUS_OPTIONS defined as constants
- Validation checks `includes()` before save
- Prevents invalid status values from manual Firestore edits

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation followed the clients.js pattern with extensions for composite IDs and dual status fields.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 02 Plan 02:**
- Project view module complete and ready for router integration
- Firebase projects collection schema established
- Composite ID generation working with year-specific range queries
- Client dropdown demonstrates dependent data pattern

**Blockers/Concerns:**
- None - router integration is straightforward next step

**Phase dependencies satisfied:**
- Phase 01 (clients) provides client_code field needed for project code generation
- Project foundation ready for MRF integration (Phase 3 needs projects to exist)
- Dual status pattern established for future filtering/reporting

---
*Phase: 02-projects-core*
*Completed: 2026-01-25*
