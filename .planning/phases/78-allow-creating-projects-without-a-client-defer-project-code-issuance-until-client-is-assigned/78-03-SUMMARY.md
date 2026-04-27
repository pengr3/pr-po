---
phase: 78-allow-creating-projects-without-a-client-defer-project-code-issuance-until-client-is-assigned
plan: 03
subsystem: ui
tags: [firestore, writebatch, project-detail, project-code-issuance, clientless-projects, batched-writes]

# Dependency graph
requires:
  - phase: 78-01
    provides: "addProject() relaxed to allow null client; firestore.rules D-12 lock on issued projects"
  - phase: 78-02
    provides: "project_id written on MRF/PR/PO/TR records for stable linkage before code issuance"
provides:
  - "Projects list em-dash rendering for clientless rows in Code and Client columns"
  - "Doc-ID URL routing (#/projects/detail/{doc_id}) for pre-issuance deep links"
  - "Editable client-select control on project detail page for clientless projects"
  - "startCodeIssuance() confirmation modal with new code preview and per-collection record counts"
  - "runCodeIssuance() batched backfill across mrfs/prs/pos/transport_requests/rfps with children-first/project-LAST write ordering"
  - "is_issued: true marker on project doc after successful issuance"
  - "edit-history event with code_issued_backfill_count"
  - "Post-issuance syncPersonnelToAssignments with new project_code"
  - "URL redirect to canonical code-based deep link after issuance"
affects: [project-detail, projects-list, mrf-form, finance, procurement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Children-first/project-doc-LAST write ordering in writeBatch for safe partial-failure retry"
    - "is_issued: true flag on project doc as atomicity marker for future security rules / UI heuristics"
    - "Dual-mode project lookup: project_code query first, doc-ID getDoc fallback if empty"
    - "Lazy-loaded clientsCacheForIssuance fetched once per session via getDocs"
    - "Chunked writeBatch commit (CHUNK=500) for Firestore hard limit compliance"

key-files:
  created: []
  modified:
    - app/views/projects.js
    - app/views/project-detail.js

key-decisions:
  - "Project list row uses detailParam = project_code || project.id so clientless and coded rows both deep-link correctly"
  - "Client column in table falls back to em-dash (—) when both client lookup and client_code are absent"
  - "Doc-ID fallback in project-detail.js tears down the project_code onSnapshot listener and rebinds per-doc onSnapshot for live updates on clientless projects"
  - "clientsCacheForIssuance lazy-loaded via getDocs (one-shot fetch) rather than onSnapshot — issuance is rare, subscription cost not justified"
  - "startCodeIssuance pre-generates project_code via generateProjectCode() so modal can show the exact code before user confirms"
  - "writes[] array: children (mrfs/prs/pos/trs/rfps) pushed first; project doc pushed last — guarantees project_code stays null on disk if any batch fails, enabling safe retry"
  - "is_issued: true written on project doc as explicit marker for Plan 01 D-12 Firestore rules and future UI heuristics"
  - "Post-issuance URL redirect to #/projects/detail/{newProjectCode} transitions the user from doc-ID routing to canonical code routing"

patterns-established:
  - "Atomicity pattern for multi-collection backfill: accumulate all writes[] with state-marker doc last, chunk-commit sequentially"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-04-27
---

# Phase 78 Plan 03: User-facing Code Issuance Flow Summary

**Em-dash rendering and doc-ID routing for clientless projects in the list, plus a confirmation modal + chunked batched backfill (children-first/project-LAST) that issues project_code and backfills all linked records when a client is assigned**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-27T04:05:00Z
- **Completed:** 2026-04-27T04:05:19Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- Projects list renders clientless rows with em-dash in both Code and Client columns; clicking navigates via doc-ID URL
- Project detail page resolves clientless projects via Firestore doc-ID URL fallback with per-doc onSnapshot rebind
- Editable client picker (select + "Assign & Issue Code" button) appears on clientless project detail; coded projects show read-only client display as before
- Confirmation modal pre-generates the exact project_code and shows per-collection child counts (MRFs/PRs/POs/TRs/RFPs) before commit
- Batched backfill writes children first and project doc last; chunked at 500 writes/batch for Firestore limits; is_issued: true on project doc

## Task Commits

Each task was committed atomically:

1. **Task 1: Render em-dash in Code/Client columns and use doc-ID URL for clientless projects** - `267ccc0` (feat)
2. **Task 2: Add doc-ID lookup fallback, clients cache, and editable client-select control** - `27608e2` (feat)
3. **Task 3: Implement startCodeIssuance() and runCodeIssuance()** - `ae3ba6c` (feat)

## Files Created/Modified
- `app/views/projects.js` - renderProjectsTable: em-dash fallbacks for Code/Client columns, detailParam routing via project_code||project.id
- `app/views/project-detail.js` - writeBatch+generateProjectCode imports, clientsCacheForIssuance state, dual-mode listener, loadClientsCache(), conditional client-select rendering, startCodeIssuance(), runCodeIssuance(), window registration, destroy() cleanup

## Decisions Made
- Used lazy getDocs (one-shot) for clients cache rather than onSnapshot — issuance is a rare one-time action, not worth a persistent subscription
- startCodeIssuance() pre-generates the project_code before showing the modal so user sees the exact code they're committing to
- writes[] accumulates all child doc refs first, then appends project doc ref — ensures project doc is in the final batch chunk and commits last (safe retry on network/browser failure)
- Post-issuance redirect to canonical code-based URL transitions user out of doc-ID routing seamlessly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 78 Plan 03 complete: all three pieces of the issuance flow (list display, detail routing, issuance modal+backfill) are wired together
- Combined with Plan 01 (addProject relaxed + firestore.rules D-12 lock) and Plan 02 (project_id on MRF records), Phase 78 is functionally complete
- Verify: create a clientless project, submit an MRF against it, then assign a client — list shows em-dash, detail shows client picker, modal shows record counts, confirm issues code and backfills children
- Remaining: Plan 04 (verification and cleanup if any) per STATE.md

## Self-Check: PASSED

- FOUND: app/views/projects.js
- FOUND: app/views/project-detail.js
- FOUND: 78-03-SUMMARY.md
- FOUND commit: 267ccc0 (Task 1)
- FOUND commit: 27608e2 (Task 2)
- FOUND commit: ae3ba6c (Task 3)

---
*Phase: 78-allow-creating-projects-without-a-client-defer-project-code-issuance-until-client-is-assigned*
*Completed: 2026-04-27*
