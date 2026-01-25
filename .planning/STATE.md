# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-25)

**Core value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.
**Current focus:** Phase 1: Clients Foundation

## Current Position

Phase: 1 of 4 (Clients Foundation)
Plan: All complete (2/2)
Status: Phase complete - verified
Last activity: 2026-01-25 — Phase 1 execution complete

Progress: [██░░░░░░░░] 25% (1/4 phases complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 2.5 min
- Total execution time: 0.08 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-clients-foundation | 2/2 | 5min | 2.5min |

**Recent Trend:**
- Last 5 plans: 2min, 3min
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

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-25
Stopped at: Phase 1 complete and verified
Resume file: None
Next step: Plan Phase 2 (Projects Core)
