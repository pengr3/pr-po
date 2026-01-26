# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-25)

**Core value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.
**Current focus:** Phase 2: Projects Core

## Current Position

Phase: 3 of 4 (Projects Management)
Plan: 2 of 3
Status: In progress
Last activity: 2026-01-26 — Completed 03-02-PLAN.md

Progress: [███████░░░] 63% (7/11 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: 2.3 min
- Total execution time: 0.27 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-clients-foundation | 2/2 | 5min | 2.5min |
| 02-projects-core | 3/3 | 6min | 2.0min |
| 03-projects-management | 2/3 | 7min | 3.5min |

**Recent Trend:**
- Last 5 plans: 2min, 1min, 3min, 3min, 4min
- Trend: Steady velocity (consistent execution times)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Build Projects first, auth/permissions later (v2.0) — Core value is project tracking; get foundation working before securing it
- Project lifecycle starts at lead stage — Track all expenses from first contact, measure pursuit vs win
- Two status fields (Internal + Project Status) — Internal tracks Operations steps, Project Status tracks client relationship
- Project codes include client: CLMC_CLIENT_YYYY### — Group projects by client, see win/loss rates per client over time
- Freetext personnel field in v1.0 — No user system yet; structured assignment deferred to v2.0 when auth exists
- New page UI for project create/edit — Projects have many fields; full page provides better UX than cramped modal

**From 01-01 (Client CRUD View):**
- Client code forced to uppercase — Ensures consistency across the database
- Case-insensitive duplicate checking — Prevents ACME vs acme vs Acme duplicates
- Real-time updates via onSnapshot — Auto-updates table when any client document changes
- 15 items per page pagination — Matches supplier management pattern

**From 01-02 (Router Integration):**
- Clients link placed first in navigation — Foundational entities appear before dependent ones
- Route uses lazy loading — Modules loaded only when accessed
- No defaultTab needed for views without tabs — Simplified router config

**From 02-01 (Project CRUD View):**
- Budget/contract_cost validation rejects zero — "Positive" interpreted as > 0, not >= 0
- Client dropdown uses onSnapshot for real-time updates — Auto-updates when clients added
- Regex parsing for project codes — Handles client codes with underscores correctly
- Client code denormalized in projects — Stored alongside client_id for efficient filtering
- Project code immutable after creation — Generated once, not modified on edit
- Status validation against predefined arrays — INTERNAL_STATUS_OPTIONS (4), PROJECT_STATUS_OPTIONS (7)

**From 02-02 (Router Integration):**
- Projects link placed after Clients in navigation — Logical dependency flow (Clients → Projects → Procurement)
- Route uses lazy loading — Same pattern as Phase 01-02
- No defaultTab needed — Projects view manages tabs internally
- Firebase composite index required — Expected behavior for client_code + project_code queries

**From 02-03 (Toggle Button):**
- Toggle button placed between Edit and Delete — Logical flow: view → modify status → remove
- Button uses btn-secondary class — Visual differentiation from primary and destructive actions
- Button text uses ternary for action intent — "Deactivate" for active, "Activate" for inactive
- Three-button Actions pattern established — Edit, Toggle, Delete for CRUD tables

**From 03-01 (Project Detail View):**
- Router parseHash extended to return subpath for third segment — Enables detail routes (#/path/tab/subpath)
- Detail route pattern uses redirect: #/projects/detail/CODE → /project-detail with param — Clean separation of list and detail views
- Query by project_code field (not document ID) via onSnapshot — Enables URL-based direct access to projects
- Locked fields visibly disabled with hints — project_code and client_code immutable after creation
- Silent save success (console log only, no toast) — Per 03-CONTEXT.md, reduces UI noise for frequent auto-saves
- Focus preservation during real-time updates — Skip re-rendering focused field to prevent cursor jump
- Category-grouped UI with four cards — Basic Info, Financial, Status, Personnel for logical field organization
- Inline validation without blocking — Show error below field, keep editable, don't prevent other field edits

**From 03-02 (Project List Management):**
- AND logic for combining filters — All selected filters must match for a project to appear
- Search uses OR logic internally — Matches if project_code OR project_name contains search term
- 300ms debounce delay for search — Balances responsiveness with performance, avoids excessive filtering
- Separate allProjects and filteredProjects state — Enables efficient client-side re-filtering without re-querying Firebase
- Default sort: created_at desc (most recent first) — Per PROJ-15 requirement
- event.stopPropagation() on Actions column — Prevents row navigation when clicking Edit/Toggle/Delete buttons
- Sort indicators: blue for active, gray for inactive — Visual feedback for current sort state (↑↓⇅)

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-26
Stopped at: Completed 03-02-PLAN.md (Project List Management)
Resume file: None
Next step: Phase 3 complete - discuss Phase 04 (MRF-Project Integration) or finalize
