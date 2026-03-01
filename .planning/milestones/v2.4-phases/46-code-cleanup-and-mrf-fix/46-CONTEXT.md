# Phase 46: Code Cleanup and MRF Fix - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove dead/orphaned files from the codebase and unify the Procurement "Create MRF" dropdown to match the standalone MRF form's single project/service selector. Cleanup also covers dead CSS files, ad-hoc console.logs, unused CDN dependencies, and the accidental `nul` file. CLAUDE.md is updated to reflect changes.

</domain>

<decisions>
## Implementation Decisions

### Dead File Scope
- Full codebase scan — all JS, CSS, and other source files checked for orphaned/unreferenced items
- Archive directory is preserved (not removed) — historical reference stays
- Edge cases (files referenced but never actually used at runtime) are flagged for user review, not auto-removed
- Unused CDN/library references in index.html are removed immediately (no flagging)
- Remove the accidental `nul` file from repo root

### CSS Cleanup
- Only remove entire unused CSS files — do NOT audit individual CSS rules within files
- This keeps the phase focused and avoids high-risk granular CSS changes

### Console.log Cleanup
- Keep prefixed/structured logs (`[Router]`, `[Procurement]`, etc.) — these are useful diagnostics
- Remove ad-hoc/unprefixed debug logs (`console.log('test')`, `console.log(data)`, etc.)

### Unified MRF Dropdown (MRF-01)
- Replicate the exact pattern from `app/views/mrf-form.js`: a single `<select>` with two `<optgroup>` elements ("Projects" / "Services")
- Each option shows `CODE - Name` format (e.g., `PROJ-001 - Building A`, `CLMC_SVC_2026001 - Hauling`)
- No role-based assignment filtering in Procurement's dropdown — all active projects and services are shown to all procurement users
- Replaces the current two separate dropdowns (`#projectName` and `#saveNewMRF_serviceName`) with one unified select

### Execution Order
- Cleanup first (dead files, CSS, console.logs, CDN), then MRF dropdown unification
- Separate commits per category for easy rollback:
  1. Dead JS files removal
  2. Dead CSS files removal
  3. Console.log cleanup
  4. Unused CDN dependency removal
  5. `nul` file removal
  6. MRF dropdown unification
  7. CLAUDE.md update

### Verification Strategy
- **Before cleanup**: Document all working views, routes, and processes as a baseline
- **Dependency trace**: Trace full import chain from `index.html` → router → views → utilities to build complete dependency tree
- **Role-aware tracing**: Check all role-based code paths (operations_user, services_user, finance, procurement, admin) to avoid removing role-conditional files
- **Include config files**: Check `firestore.rules` and Firebase config files as part of the dependency scan
- **After cleanup**: Static analysis — grep for any remaining references to deleted files
- **After cleanup**: User performs manual smoke test comparing against the baseline
- **Safety bookmark**: Create a git tag (`pre-cleanup`) before any removals for one-command rollback

### Documentation
- Update CLAUDE.md after all changes to remove references to deleted files and update any changed patterns

### Claude's Discretion
- Import chain tracing approach and tooling
- How to identify "ad-hoc" vs "structured" console.logs (pattern matching on prefix brackets)
- Baseline documentation format
- Commit message wording within the category structure

</decisions>

<specifics>
## Specific Ideas

- "Currently there are 2 different dropdowns, 1 for services and 1 for projects, which is not nice at all" — user wants unified, clean UI matching the MRF form
- Check the existing MRF form (`app/views/mrf-form.js` lines 212-216) for the exact `<select>` + `<optgroup>` pattern to replicate
- The `populateProjectDropdown()` and `populateServiceDropdown()` functions in mrf-form.js show the data loading pattern — Procurement should use similar logic but without assignment filtering

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 46-code-cleanup-and-mrf-fix*
*Context gathered: 2026-02-27*
