---
phase: 114-observability-foundation-v4-3
plan: 04
subsystem: infra
tags: [sentry, observability, html, docs, vendor-pin, classic-script]

# Dependency graph
requires:
  - phase: 114-01
    provides: "Resolved SDK version (10.70.0), source URL, SHA-384 digest, and the SRI-not-applied decision — copied verbatim into CLAUDE.md by this plan"
  - phase: 114-02
    provides: "app/sentry-init.js as a self-contained classic script (zero import/export) ready to be wired via a plain <script src>"
provides:
  - "index.html <head> now loads lib/obs.min.js then app/sentry-init.js as classic, parse-time scripts, both above the <script type=module> bootstrap — window.Sentry is live before the first ES-module import runs (OBS-02)"
  - "CLAUDE.md § Important Notes documents what lib/obs.min.js is, its provenance (source URL, SHA-384, download date), the SENTRY_RELEASE per-phase bump ritual, and the diagnostics.js client_errors retrofit exemption"
affects: [114-05, 114-06, 118, 119]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-classic-script wiring, last in the existing pinned-CDN sequence, immediately before </head> — extends the same convention already used for signature_pad/Chart.js/Frappe Gantt, no new mechanism"
    - "Provenance-by-documentation instead of SRI for same-origin vendor assets: the SHA-384 lives in CLAUDE.md as a durable, eyeball-diffable record rather than a runtime integrity= attribute"

key-files:
  created: []
  modified:
    - index.html
    - CLAUDE.md

key-decisions:
  - "No deviations — plan text and acceptance criteria matched the actual repo state exactly (line 22 was indeed the last classic script, line 23 was indeed </head>); all 9 Task 1 and 9 Task 2 acceptance criteria passed on first attempt."

patterns-established: []

requirements-completed: [OBS-01, OBS-02]

# Metrics
duration: ~10 min
completed: 2026-08-13
---

# Phase 114 Plan 04: Wire Sentry Into index.html + Document in CLAUDE.md Summary

**Added two classic `<script>` tags to `index.html`'s `<head>` — `lib/obs.min.js` then `app/sentry-init.js`, both preceding the ES-module bootstrap — and recorded the vendor bundle's identity, provenance digest, release-bump ritual, and diagnostics retrofit exemption as three new bullets in `CLAUDE.md`.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2/2
- **Files modified:** 2 (`index.html`, `CLAUDE.md`)

## Accomplishments

- `index.html` `<head>` now loads `lib/obs.min.js` (pinned v10.70.0, version-pin comment matching the existing Chart.js/Frappe Gantt convention) immediately followed by `app/sentry-init.js`, both as blocking classic scripts with no `defer`/`async`/`type=module`/`integrity`/`crossorigin`, sitting above the `<script type="module">` bootstrap at line 254 — `Sentry.init()` is now guaranteed to run before `import './app/firebase.js'` evaluates
- Exactly one HTML file (`index.html`) references `obs.min.js` — the five archived monolith pages remain uninstrumented per D-05
- `CLAUDE.md` § Important Notes gained three purely-additive bullets: what `lib/obs.min.js` is (with source URL, SHA-384 digest, download date, and the same-origin rationale for skipping SRI), the `SENTRY_RELEASE` per-phase hand-bump ritual, and the `app/diagnostics.js` `client_errors` mirror's deliberate exemption from the Phase 119 retrofit

## Task Commits

1. **Task 1: Add the two classic script tags to index.html's head** - `263fdb9` (feat)
2. **Task 2: Record vendor identity, provenance, release ritual and diagnostics exemption in CLAUDE.md** - `ab9d2e6` (docs)

## Files Created/Modified

- `index.html` - 4 lines added (2 comments + 2 `<script>` tags) after the Frappe Gantt classic script, before `</head>`
- `CLAUDE.md` - 19 lines added to `## Important Notes`: `lib/obs.min.js` identity/provenance, `SENTRY_RELEASE` ritual, `client_errors` exemption

## Decisions Made

None beyond what 114-01/114-CONTEXT.md already resolved — this plan only wires and documents literal values that were already fixed. See `key-decisions` in frontmatter.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' full acceptance-criteria sets (line-number ordering, zero `integrity=`/`crossorigin`, zero `defer`/`async`, single-occurrence greps, byte-for-byte digest match, purely-additive `CLAUDE.md` diff, single-file `git show --stat`) passed on the first attempt with no rework.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. This plan only edits static files already present in the repo.

## Next Phase Readiness

`window.Sentry` is now defined and `Sentry.init()` runs at parse time, before any ES module evaluates — the load-order guarantee OBS-02 exists for. This is committed locally but **not deployed**; Netlify has not yet served this `index.html`, so Sentry is not yet live in production. Plan 114-05 is the single gated deploy event that ships this (and 114-02's/114-03's) work. Plan 114-06's production test event and `window.__sentryTest()` verification depend on that deploy having happened first.

**Standing constraint carried forward from 114-01/114-02/114-03:** nothing was pushed to `origin` in this plan. Local `main` is now 13 commits ahead of `origin/main`, consistent with the standing constraint — do not push until plan 114-05's gated deploy.

---
*Phase: 114-observability-foundation-v4-3*
*Completed: 2026-08-13*
