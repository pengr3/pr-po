---
phase: 114-observability-foundation-v4-3
plan: 02
subsystem: infra
tags: [sentry, observability, pii-scrubbing, csp, error-tracking, classic-script]

# Dependency graph
requires:
  - phase: 114-01
    provides: "Resolved Sentry DSN, ingest host, pinned lib/obs.min.js bundle — literal constants consumed here"
provides:
  - "app/sentry-init.js — classic script (zero import/export) with Sentry.init(), fail-closed beforeSend/beforeBreadcrumb PII scrub hooks, shared SCRUB_KEYS denylist exposed as window.CLMC_SCRUB_KEYS, three-value environment derivation, release constant, and window.__sentryTest() production probe"
  - "window.__sentryTest() — OBS-06's recurring production gate, callable from DevTools in any environment"
  - "window.CLMC_SCRUB_KEYS — the shared denylist array, readable across the classic-script/ES-module boundary for a later phase's app/errors.js"
affects: [114-03, 114-04, 114-05, 114-06, 115, 116]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ternary-chain environment derivation instead of if/else — avoids the literal substring `if (isLocal)` so the file's own env-branching code doesn't collide with the acceptance check verifying window.__sentryTest() is NOT isLocal-gated"
    - "Shared denylist as editable array + regex derived once at load (SCRUB_KEY_RE = new RegExp(SCRUB_KEYS.map(...).join('|'))) — one place to edit, no drift between beforeSend and beforeBreadcrumb"
    - "Fail-closed scrub hooks — both beforeSend and beforeBreadcrumb wrap their entire body in try/catch and return null on any caught error, because dropping an event/breadcrumb is always cheaper than shipping one unscrubbed"
    - "Capability guard, not environment guard, for window.__sentryTest() — checks window.Sentry existence rather than isLocal, the deliberate divergence from the window.__createTestNotification precedent"

key-files:
  created:
    - app/sentry-init.js
  modified: []

key-decisions:
  - "Rewrote D-14's environment derivation as a nested ternary instead of the plan-suggested if/else chain, because task 2's acceptance criteria requires zero occurrences of the literal substring `if (isLocal)` anywhere in the file (to prove window.__sentryTest() isn't isLocal-gated), and an if/else chain for SENTRY_ENVIRONMENT would have produced exactly that substring incidentally."
  - "Rephrased the beforeBreadcrumb comment that the plan's action text explicitly asked to include (a reference to \"app/diagnostics.js:95's [CLMC-DIAG] call\") to instead say \"this project's own `[CLMC-DIAG] type`-style console calls\", because the plan's own acceptance criteria requires grep -cE for the literal word \"diagnostics\" to output 0 (D-12/D-09 guard). Referencing app/diagnostics.js by path in a comment would have failed that check while conveying identical intent."

patterns-established:
  - "Classic-script constant hygiene: every acceptance-critical literal (SENTRY_RELEASE, PROD_HOST, sendDefaultPii: false) appears exactly once in the file, never restated in a comment, so a grep -c ==1 assertion stays true regardless of future edits nearby"

requirements-completed: [OBS-03, OBS-05, OBS-07]

# Metrics
duration: ~12 min
completed: 2026-08-13
---

# Phase 114 Plan 02: Sentry Init, PII Scrubbing, Environment/Release Tagging Summary

**Wrote `app/sentry-init.js` as a self-contained classic script: `Sentry.init()` plus both fail-closed PII scrub hooks land in one commit (OBS-05), followed by a second commit adding the unconditionally-registered `window.__sentryTest()` production probe (D-16).**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2/2
- **Files modified:** 1 (`app/sentry-init.js`, created)

## Accomplishments

- `app/sentry-init.js` created as a classic script (zero `import`/`export`) with the literal DSN, release (`clmc@4.3.0-p114`), and `PROD_HOST` (`clmcop.netlify.app`) constants from 114-01's resolved facts
- Three-value environment derivation (`development` / `production` / `preview`) extending `app/firebase.js:59`'s `isLocal` idiom exactly, written as a ternary chain rather than if/else (see Deviations)
- Shared `SCRUB_KEYS` denylist (30 substrings) with a derived `SCRUB_KEY_RE`, exposed as `window.CLMC_SCRUB_KEYS`
- `stripQuery()` and `scrubObject()` helpers — the latter depth-capped at 4 with a `WeakSet` cycle guard, never throws
- `beforeBreadcrumb()`: drops `breadcrumb.data` outright for `category === 'console'` (D-01), strips query strings on kept `fetch`/`xhr`/`dom`/`history` breadcrumbs (D-03), fails closed
- `beforeSend()`: `sendDefaultPii: false`, strips `request.url` query string + deletes `request.query_string`, scrubs `event.extra` and non-reserved `event.contexts` keys, leaves `event.tags`/`event.user` untouched (D-02, D-04), fails closed
- `Sentry.init()` guarded on SDK presence, both scrub hooks wired in, no `tracesSampleRate`/replay/feedback integrations
- `window.__sentryTest()` registered unconditionally (no `isLocal` gate), guarded on `window.Sentry.captureException` capability, logs a `[Sentry]`-prefixed event id

## Task Commits

1. **Task 1: Create app/sentry-init.js — denylist, environment, release, init + both scrub hooks** - `fa20341` (feat)
2. **Task 2: Add window.__sentryTest() and the blocked-bundle degradation path** - `bb65100` (feat)

## Files Created/Modified

- `app/sentry-init.js` (269 lines) - Sentry configuration: constants, environment derivation, shared denylist, scrub helpers, `beforeBreadcrumb`/`beforeSend` hooks, guarded `Sentry.init()`, and `window.__sentryTest()`. Not yet loaded by `index.html` — that is plan 114-04.

## Decisions Made

See `key-decisions` in frontmatter — both are corrections to internal contradictions discovered in the plan's own text between its `<action>` narrative and its `<acceptance_criteria>` grep assertions, not scope changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Environment derivation rewritten as ternary to avoid colliding with task 2's `if (isLocal)` grep assertion**
- **Found during:** Task 1, drafting the D-14 environment derivation
- **Issue:** The plan's action text describes the derivation as "an if/ternary chain." An if/else implementation (`if (isLocal) { SENTRY_ENVIRONMENT = 'development'; } else if (...) ...`) contains the literal substring `if (isLocal)`. Task 2's acceptance criteria asserts `grep -c "if (isLocal)" app/sentry-init.js` outputs `0`, file-wide — not scoped to the `__sentryTest` section — to prove the probe isn't gated the way `__createTestNotification` is. An if/else environment block would have made that assertion fail for a reason unrelated to the probe itself.
- **Fix:** Wrote `SENTRY_ENVIRONMENT` as a nested ternary chain (`isLocal ? 'development' : (hostname === PROD_HOST ? 'production' : (hostname.endsWith('.netlify.app') ? 'preview' : 'production'))`), which the plan explicitly permits ("if/ternary chain") and preserves the exact same precedence order and semantics.
- **Verification:** `grep -c "if (isLocal)" app/sentry-init.js` outputs `0`; all three environment values (`'development'`, `'preview'`, `'production'`) still each appear at least once; manual trace of the ternary confirms identical branch outcomes to the if/else version.
- **Committed in:** `fa20341` (Task 1 commit)

**2. [Rule 1 - Bug] beforeBreadcrumb comment rephrased to avoid the literal word "diagnostics"**
- **Found during:** Task 1, writing the `beforeBreadcrumb` console-category comment
- **Issue:** The plan's action text explicitly instructs: "Comment that this is what makes `app/diagnostics.js:95`'s `[CLMC-DIAG] ${type}` call degrade to a useful message-only breadcrumb..." Writing that comment verbatim (referencing `app/diagnostics.js` by path) would make the line match `grep -cE "last_hidden_ms|session_age_ms|logDiag|diagnostics"`, whose acceptance criterion for this same task requires the result to be `0` (guarding D-12/D-09 — no diagnostics.js reference of any kind in this purely-additive phase).
- **Fix:** Kept the explanatory intent — that console-category breadcrumbs from `[CLMC-DIAG] type`-style calls degrade to message-only — but referred to the calling convention (`[CLMC-DIAG]` prefix) instead of the file path, avoiding the literal substring "diagnostics" entirely.
- **Verification:** `grep -cE "last_hidden_ms|session_age_ms|logDiag|diagnostics" app/sentry-init.js` outputs `0`; the comment still names the concrete `[CLMC-DIAG]` call shape covered by D-11, preserving the documentation value the plan asked for.
- **Committed in:** `fa20341` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — corrections to internally-contradictory plan text, not scope or behavior changes)
**Impact on plan:** No scope creep. Both fixes resolve a literal-text collision between the plan's prose instructions and its own automated verification assertions; the resulting code satisfies every acceptance criterion in the plan and preserves the intended behavior and documentation content in both cases.

## Issues Encountered

None beyond the two plan-text contradictions documented above as deviations.

## User Setup Required

None - no external service configuration required. `app/sentry-init.js` is self-contained and reads only the literal constants already resolved in 114-01.

## Next Phase Readiness

`app/sentry-init.js` is complete, parses cleanly (`node --check` exits 0), and is fully self-contained: dropping it into a page that has already loaded `lib/obs.min.js` produces a configured, scrubbed, tagged Sentry client and a callable `window.__sentryTest()`. Nothing in it depends on a build step, bundler, or ES-module loader.

**Not yet wired:** no `<script>` tag loads this file — `index.html` is untouched. That wiring, together with the two-file/four-occurrence CSP `connect-src` edit (114-03) and the `<head>` load-order insertion (114-04), remains for later plans in this wave/phase. `git diff --name-only 8287521..HEAD -- app/diagnostics.js` confirms `app/diagnostics.js` is still untouched (D-09).

**Standing constraint carried forward from 114-01:** commits from this and remaining phase 114 plans must accumulate locally and must not be pushed to `origin` until plan 114-05's gated production deploy.

---
*Phase: 114-observability-foundation-v4-3*
*Completed: 2026-08-13*

## Self-Check: PASSED

- FOUND: app/sentry-init.js
- FOUND: .planning/phases/114-observability-foundation-v4-3/114-02-SUMMARY.md
- FOUND: fa20341 (Task 1 commit)
- FOUND: bb65100 (Task 2 commit)
