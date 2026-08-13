---
phase: 114-observability-foundation-v4-3
plan: 03
subsystem: infra
tags: [csp, headers, sentry, observability, netlify]

# Dependency graph
requires:
  - phase: 114-01
    provides: "Resolved Sentry DSN and derived ingest host (https://o4511903390236672.ingest.us.sentry.io), consumed here as a literal constant for connect-src"
provides:
  - "connect-src widened for the exact Sentry ingest origin in all four CSP occurrences (_headers /* and /*.html, netlify.toml /* and /*.html), byte-identical between both files"
  - "HEADERS-README.md § \"Verifying Sentry / CSP Changes\" — durable home for the curl live-header read-back procedure and the DevTools blocked-bundle degradation check (D-18)"
affects: [114-05, 114-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSP connect-src widening as a single-commit, two-file, four-occurrence edit — reused from the Phase 58 Plan 02 precedent, tightened from two commits to one"
    - "Recurring verification procedures live in a durable repo doc (HEADERS-README.md), not the archived phase plan — because a CSP-blocked ingest request throws no catchable error, the check has to be repeatable indefinitely, not a one-time phase artifact"

key-files:
  created: []
  modified:
    - _headers
    - netlify.toml
    - HEADERS-README.md

key-decisions:
  - "Host form: exact https://o4511903390236672.ingest.us.sentry.io, no wildcard — narrowest connect-src addition that still permits the SDK's envelope POST, per CONTEXT.md's Claude's Discretion item. A wildcard (*.ingest.sentry.io or *.sentry.io) would authorize outbound POSTs to every other Sentry tenant's ingest endpoint, a real (if unlikely) data-egress channel in a financial app, for zero benefit since org id and region are fixed."
  - "Fallback ladder recorded here (not yet exercised): if plan 114-06's production test event fails with a CSP violation naming a different host, widen one rung at a time — https://*.ingest.us.sentry.io first, then https://*.ingest.sentry.io only if that still fails — re-running the test event after each widen, never jumping straight to the broadest form."

patterns-established: []

requirements-completed: [OBS-04]

# Metrics
duration: ~5 min
completed: 2026-08-13
---

# Phase 114 Plan 03: CSP Widening for Sentry Ingest + Durable Verification Procedures Summary

**Added the exact Sentry ingest host to `connect-src` in all four CSP occurrences (`_headers` and `netlify.toml`, `/*` and `/*.html` blocks each) in one commit, and wrote both recurring CSP/blocked-bundle verification procedures into `HEADERS-README.md` so they outlive this phase.**

## Performance

- **Duration:** ~5 min
- **Tasks:** 2/2
- **Files modified:** 3 (`_headers`, `netlify.toml`, `HEADERS-README.md`)

## Accomplishments

- `connect-src` in `_headers` and `netlify.toml` now permits `https://o4511903390236672.ingest.us.sentry.io` — the exact host derived from the DSN in `114-01-SUMMARY.md`, no wildcard
- All four occurrences (two files × `/*` + `/*.html` blocks) changed in a single commit; the two files' CSP value strings remain byte-identical
- No other directive touched — `script-src` untouched since `lib/obs.min.js` is same-origin and already covered by `'self'`
- `HEADERS-README.md` gained a `## Verifying Sentry / CSP Changes` section: procedure (a) is the `curl -sI | grep -i content-security-policy` live read-back against both `/` and `/index.html` on `clmcop.netlify.app`, with an honest note that byte-identity between `_headers`/`netlify.toml` means the command can't reveal which file Netlify served — only divergence would; procedure (b) is the DevTools **Block request URL** steps for `obs.min.js`, asserting the exact `[Sentry] SDK unavailable — error reporting disabled for this session` console string and `window.Sentry === undefined`
- `window.__sentryTest()` named in the new section as the probe procedure (a) pairs with, so both halves of the OBS-06 gate are discoverable from one place

## Task Commits

1. **Task 1: Add the Sentry ingest host to connect-src in all four CSP occurrences, one commit** - `ec95f7a` (fix)
2. **Task 2: Write the two recurring verification procedures into HEADERS-README.md (D-18)** - `01901e0` (docs)

## Files Created/Modified

- `_headers` - `connect-src` widened with the Sentry ingest host in both the `/*` and `/*.html` blocks
- `netlify.toml` - same widening, TOML-quoted form, kept byte-identical to `_headers`
- `HEADERS-README.md` - new `## Verifying Sentry / CSP Changes` section (purely additive) with the two recurring procedures

## Decisions Made

See `key-decisions` in frontmatter. Both close the CONTEXT.md "Claude's Discretion" item on the exact `connect-src` host form: use the literal DSN-derived host, never a wildcard, and record the fallback-ladder order for the (not-yet-needed) case where 114-06's production test event reveals a different host.

## Deviations from Plan

None — plan executed exactly as written. Every acceptance criterion in both tasks was verified directly (grep counts, byte-identity pipeline, collateral-edit diff against the phase base commit `bab2f76`, `git show --stat`/`--numstat`, purely-additive diff check) before each commit, and all passed on the first attempt.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. This plan only edits static config files already present in the repo.

## Next Phase Readiness

The CSP change is committed but **not deployed** — it only takes effect once Netlify serves it, which is plan 114-05's gated deploy event. Plan 114-05 must run procedure (a) from `HEADERS-README.md` against the live production URLs after that deploy to confirm the header actually changed, and plan 114-06 depends on that having succeeded before firing `window.__sentryTest()` for the production test event. Nothing was pushed to `origin` — commits `ec95f7a` and `01901e0` are local only, consistent with the standing constraint carried forward from 114-01/114-02.

---
*Phase: 114-observability-foundation-v4-3*
*Completed: 2026-08-13*
