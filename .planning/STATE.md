# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-25)

**Core value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.
**Current focus:** Phase 2: Projects Core

## Current Position

Phase: 2 of 4 (Projects Core)
Plan: 1 of 2
Status: In progress
Last activity: 2026-01-25 — Completed 02-01-PLAN.md

Progress: [██░░░░░░░░] 25% (1/4 phases complete, 3/6 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 2.7 min
- Total execution time: 0.13 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-clients-foundation | 2/2 | 5min | 2.5min |
| 02-projects-core | 1/2 | 3min | 3.0min |

**Recent Trend:**
- Last 5 plans: 2min, 3min, 3min
- Trend: Consistent velocity (~2-3min per plan)

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

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-25
Stopped at: Completed 02-01-PLAN.md
Resume file: None
Next step: Execute 02-02-PLAN.md (Router Integration)
