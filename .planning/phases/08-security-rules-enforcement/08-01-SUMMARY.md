---
phase: 08-security-rules-enforcement
plan: 01
subsystem: infra
tags: [firebase-cli, emulator, testing, firestore-rules]

# Dependency graph
requires:
  - phase: 07-project-assignment-system
    provides: Client-side permission infrastructure and project assignment system
provides:
  - Firebase CLI configuration (firebase.json) with emulator settings
  - Test infrastructure setup (test/package.json) with @firebase/rules-unit-testing
  - Foundation for Security Rules development and testing
affects:
  - 08-02 (will write firestore.rules)
  - 08-03 (will write test suite using this infrastructure)
  - 08-04 (will deploy rules using this configuration)

# Tech tracking
tech-stack:
  added:
    - firebase-tools (CLI for deployment and emulator)
    - @firebase/rules-unit-testing@3.0.0 (rules testing framework)
    - mocha@10.2.0 (test runner)
  patterns:
    - Test dependencies isolated in /test subfolder
    - Firebase CLI config at repo root (required by Firebase tooling)
    - ES module support in test suite matching SPA patterns

key-files:
  created:
    - firebase.json (Firebase CLI project configuration)
    - firestore.indexes.json (placeholder indexes file)
    - test/package.json (test dependencies configuration)
  modified: []

key-decisions:
  - "Manual file creation instead of firebase init to avoid interactive prompts"
  - "Firestore emulator on port 8080, UI on port 4000"
  - "@firebase/rules-unit-testing v3.0.0 for current stable testing API"
  - "Firebase v10.7.1 matches SPA CDN version (AUTH-01 decision)"
  - "ES module support (type: module) for consistency with SPA patterns"

patterns-established:
  - "Test tooling isolated in /test subfolder (zero impact on SPA)"
  - "Firebase config at repo root follows Firebase CLI conventions"
  - "Package.json only for test dependencies (SPA remains zero-build)"

# Metrics
duration: 6min
completed: 2026-02-04
---

# Phase 08 Plan 01: Firebase CLI Infrastructure and Test Dependencies Summary

**Firebase CLI configuration with emulator setup and isolated test dependencies for Security Rules development**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-04T05:52:19Z
- **Completed:** 2026-02-04T06:04:09Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- Firebase CLI configuration created with rules and indexes paths
- Firestore emulator configured on port 8080 with UI on port 4000
- Test dependencies isolated in /test subfolder with @firebase/rules-unit-testing v3.0.0
- ES module support configured matching SPA patterns

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Firebase CLI configuration files** - `d684deb` (chore)
2. **Task 2: Create test subfolder with package.json and dependencies** - `29bd764` (chore)

## Files Created/Modified

### Created
- `firebase.json` - Firebase CLI project configuration with firestore rules path and emulator settings
- `firestore.indexes.json` - Placeholder indexes file for Firestore (empty array, no indexes needed yet)
- `test/package.json` - Test dependencies with @firebase/rules-unit-testing, firebase, and mocha

### Modified
None

## Decisions Made

**1. Manual file creation instead of `firebase init`**
- Avoided interactive prompts and unnecessary files (functions, hosting configs)
- Created only the essential files needed for rules deployment and testing

**2. Emulator port configuration**
- Firestore emulator: port 8080 (standard Firebase default)
- Emulator UI: port 4000 (standard Firebase default)
- Avoids conflicts with SPA dev server (python -m http.server 8000)

**3. Test dependencies version selection**
- @firebase/rules-unit-testing v3.0.0: Current stable version for rules testing
- firebase v10.7.1: Matches SPA CDN version (AUTH-01 decision from Phase 5)
- mocha v10.2.0: Current stable test runner

**4. ES module configuration**
- Added `"type": "module"` to test/package.json
- Enables ES6 imports matching SPA patterns
- Required for @firebase/rules-unit-testing v3 API

**5. Test subfolder isolation**
- Test dependencies in /test subfolder keeps repo root clean
- Zero impact on SPA (no build step, no dependencies in root)
- Netlify ignores test/ during deployment (serves static files only)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all files created successfully and validated as parseable JSON.

## User Setup Required

**Firebase CLI installation required before next plan:**

```bash
# Install Firebase CLI globally (one-time)
npm install -g firebase-tools

# Login to Firebase (one-time)
firebase login
```

**Test dependencies installation deferred to Plan 03:**
- npm install will run in test/ directory when tests are written
- Keeps plan atomic - infrastructure setup separate from test implementation

## Next Phase Readiness

**Ready for Plan 02 (Security Rules authoring):**
- firebase.json configured with correct rules path
- firestore.indexes.json exists as placeholder
- Firebase CLI can deploy from this configuration

**Ready for Plan 03 (Test suite implementation):**
- test/package.json configured with all required dependencies
- ES module support configured
- Test runner script configured (`npm test` runs mocha)

**Blockers:**
- Firebase CLI must be installed globally before deployment
- Firebase login required before deployment
- npm install must run in test/ directory before tests can execute

**Concerns:**
None - infrastructure is minimal and follows Firebase conventions exactly.

---
*Phase: 08-security-rules-enforcement*
*Completed: 2026-02-04*
