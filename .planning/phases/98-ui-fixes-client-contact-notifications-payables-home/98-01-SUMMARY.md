---
phase: 98-ui-fixes-client-contact-notifications-payables-home
plan: 01
subsystem: ui
tags: [clients, firestore, forms, escapeHTML, validation]

# Dependency graph
requires:
  - phase: 91.1-supplier-categories
    provides: clients view CRUD + detail modal patterns reused here
provides:
  - Split client contact_details into structured Phone + Email fields across form, list table, and detail modal
  - isValidEmail module helper (RFC-pragmatic) reused by create + edit handlers
  - Legacy contact_details read-only fallback (no migration)
affects: [clients, client-detail-modal]

# Tech tracking
tech-stack:
  added: []
  patterns: ["At-least-one-of validation (phone OR email); handler-enforced not input-required", "Legacy-field read-only fallback when both new fields blank"]

key-files:
  created: []
  modified: [app/views/clients.js]

key-decisions:
  - "Phone/Email inputs carry no `required` attribute — D-03 at-least-one rule enforced in addClient/saveEdit handlers"
  - "Firestore writes { phone, email } only; legacy contact_details never written on new/updated docs (D-02), rendered as read-only fallback when both new fields blank"
  - "List Phone cell shows legacy contact_details only when both phone AND email are blank; once either set, legacy blob is hidden"
  - "skeletonTableRows(5,5) -> (6,5) to match new 6-column header (consistency, beyond literal plan text)"

patterns-established:
  - "isValidEmail(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/) single module-scope helper"

requirements-completed: []

# Metrics
duration: ~10min
completed: 2026-06-03
---

# Phase 98 Plan 01: Client Contact Split Summary

**Replaced the single free-text `contact_details` client field with structured Phone + Email across the create/edit form, list table, and detail modal — with handler-enforced at-least-one validation, email-format check, and a read-only legacy fallback (no data migration).**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-06-03
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Create form + inline edit row now have distinct Phone and Email inputs (`newClientPhone`/`newClientEmail`, `edit-phone`/`edit-email`); `newContactDetails`/`edit-details` removed
- `addClient` + `saveEdit` validate: required code/company/contact-person, at-least-one of Phone/Email (D-03), and email format if present (D-04); write `{ phone, email }`
- List table expanded to 6 columns (Phone, Email) with legacy `contact_details` fallback in the Phone cell when both are blank; skeleton + empty-state colspan updated to 6
- Detail modal shows Phone + Email rows plus a `Contact (legacy)` row when both new fields are blank; all new display points wrapped in `escapeHTML` (D-06)
- No CSV export added (out of scope, confirmed by grep)

## Task Commits

1. **Task 1 + Task 2 (form/handlers + table/modal display)** — `37005ff` (feat)

_Both plan tasks committed together as one atomic file change (single file, intermixed edits) under inline orchestrator execution._

## Files Created/Modified
- `app/views/clients.js` — Phone/Email split: form inputs, isValidEmail helper, create+edit read/validate/write, list header+skeleton+colspan+rows, detail modal

## Decisions Made
See key-decisions frontmatter. Followed plan exactly; one consistency add (skeleton column count 5→6).

## Deviations from Plan
None of substance — plan executed as written. Minor consistency improvement: updated `skeletonTableRows(5,5)` → `(6,5)` so the loading skeleton matches the new 6-column header (the plan only named the empty-state colspan; the skeleton is the same column-count concern). No scope creep.

## Issues Encountered
None.

## Verification
- Task 1 grep-verify: PASS
- Task 2 grep-verify: PASS
- No-CSV guard: PASS
- `node --check` (ES module) on clients.js: PASS
- Manual browser UAT (form validation, legacy fallback, modal) pending — see plan UAT checklist.

## Self-Check: PASSED
- `app/views/clients.js` modified and present on disk
- Commit `37005ff` present in git log

## Next Phase Readiness
Independent slice; no downstream dependency. Browser UAT outstanding (visual + validation behavior).

---
*Phase: 98-ui-fixes-client-contact-notifications-payables-home*
*Completed: 2026-06-03*
