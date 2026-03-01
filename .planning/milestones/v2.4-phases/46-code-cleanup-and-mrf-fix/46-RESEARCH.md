# Phase 46: Code Cleanup and MRF Fix - Research

**Researched:** 2026-02-27
**Domain:** Codebase dead-file removal, console.log audit, unified dropdown UI
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Dead File Scope
- Full codebase scan — all JS, CSS, and other source files checked for orphaned/unreferenced items
- Archive directory is preserved (not removed) — historical reference stays
- Edge cases (files referenced but never actually used at runtime) are flagged for user review, not auto-removed
- Unused CDN/library references in index.html are removed immediately (no flagging)
- Remove the accidental `nul` file from repo root

#### CSS Cleanup
- Only remove entire unused CSS files — do NOT audit individual CSS rules within files
- This keeps the phase focused and avoids high-risk granular CSS changes

#### Console.log Cleanup
- Keep prefixed/structured logs (`[Router]`, `[Procurement]`, etc.) — these are useful diagnostics
- Remove ad-hoc/unprefixed debug logs (`console.log('test')`, `console.log(data)`, etc.)

#### Unified MRF Dropdown (MRF-01)
- Replicate the exact pattern from `app/views/mrf-form.js`: a single `<select>` with two `<optgroup>` elements ("Projects" / "Services")
- Each option shows `CODE - Name` format (e.g., `PROJ-001 - Building A`, `CLMC_SVC_2026001 - Hauling`)
- No role-based assignment filtering in Procurement's dropdown — all active projects and services are shown to all procurement users
- Replaces the current two separate dropdowns (`#projectName` and `#saveNewMRF_serviceName`) with one unified select

#### Execution Order
- Cleanup first (dead files, CSS, console.logs, CDN), then MRF dropdown unification
- Separate commits per category for easy rollback:
  1. Dead JS files removal
  2. Dead CSS files removal
  3. Console.log cleanup
  4. Unused CDN dependency removal
  5. `nul` file removal
  6. MRF dropdown unification
  7. CLAUDE.md update

#### Verification Strategy
- **Before cleanup**: Document all working views, routes, and processes as a baseline
- **Dependency trace**: Trace full import chain from `index.html` → router → views → utilities to build complete dependency tree
- **Role-aware tracing**: Check all role-based code paths (operations_user, services_user, finance, procurement, admin) to avoid removing role-conditional files
- **Include config files**: Check `firestore.rules` and Firebase config files as part of the dependency scan
- **After cleanup**: Static analysis — grep for any remaining references to deleted files
- **After cleanup**: User performs manual smoke test comparing against the baseline
- **Safety bookmark**: Create a git tag (`pre-cleanup`) before any removals for one-command rollback

#### Documentation
- Update CLAUDE.md after all changes to remove references to deleted files and update any changed patterns

### Claude's Discretion
- Import chain tracing approach and tooling
- How to identify "ad-hoc" vs "structured" console.logs (pattern matching on prefix brackets)
- Baseline documentation format
- Commit message wording within the category structure

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLN-01 | Dead files project-assignments.js and service-assignments.js are removed from the codebase | Confirmed: both files exist, neither is imported by router.js or any other module in the live SPA import chain. assignments.js (the replacement) is what admin.js imports. |
| CLN-02 | Any other unreferenced/orphaned view or utility files are identified and removed | Confirmed: seed-roles.js is referenced only by scripts/, not the SPA. All other app/ files are reachable via import chain. hero.css IS used (by home.js). No other dead CSS found. |
| MRF-01 | Procurement > MRF Processing "Create MRF" form uses a single unified dropdown listing both projects and services together, replacing the current separated sections | Confirmed: current code uses `#projectName` (projects-only select) and a conditional `#saveNewMRF_serviceName` block. Both must be replaced with one `<select>` + two `<optgroup>` elements. saveNewMRF() also needs updating to read from the new single element. |
</phase_requirements>

---

## Summary

Phase 46 covers two distinct tasks: (1) removing dead files and other housekeeping debris from the codebase, and (2) fixing the "Create MRF" form in Procurement to use a single unified project/service dropdown matching what the standalone MRF form view already uses.

The dead-file situation is well-defined. `project-assignments.js` and `service-assignments.js` exist in `app/views/` but are never imported by any reachable module. They were superseded by `assignments.js` (the unified replacement), which is the only file `admin.js` imports for the Assignments section. The `scripts/validate-permissions.js` file contains a stale route reference to `/project-assignments` but that is a dev utility script, not SPA code. The `nul` file (51 bytes, contents: an accidental shell redirect error message) sits in the repo root and needs removal via `git rm`. No dead CSS files were found — `hero.css` is actively used by `home.js` (`.hero-section`, `.nav-card`, `.quick-stats`, `.stat-item`, etc.). `seed-roles.js` is only referenced by `scripts/sync-role-permissions.js`, which is a standalone utility, so whether it is "dead" depends on scope; the CONTEXT.md says view and utility files only, and `seed-roles.js` is a data-seeding script so it falls outside the removal scope.

The MRF dropdown unification is a contained change inside `procurement.js`. The current code has two separate fields: `#projectName` (a `<select>` built from `projectsData`) and `#saveNewMRF_serviceName` (a conditional `<select>` built from `cachedServicesForNewMRF`, only shown if services exist). The target is one `<select id="projectServiceSelect">` with `<optgroup label="Projects">` and `<optgroup label="Services">` — exactly what `mrf-form.js` uses. The `saveNewMRF()` function must be updated to read the new element and determine `hasProject`/`hasService` by checking the selected option's `data-type` attribute.

**Primary recommendation:** Run a git-grep dependency trace first to build confidence before deletion, create the `pre-cleanup` tag, then execute the seven separate commits in order.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla JS ES6 modules | — | All SPA logic | Zero-build project; no framework |
| Firebase Firestore v10.7.1 | CDN | Data persistence | Existing stack — no change |
| Git | — | Safe deletion with `git rm`, pre-cleanup tag | Version control rollback |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `<optgroup>` HTML | native | Group projects vs services in a single `<select>` | MRF-01 unified dropdown |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Two separate `<select>` elements | Single `<select>` with `<optgroup>` | User decision is locked: single select is the target |
| Role-based filtering in Procurement dropdown | No filtering (show all active) | User decision is locked: no filtering in Procurement |

**Installation:** None — zero-build project, no package installs needed.

---

## Architecture Patterns

### Recommended Project Structure

No structural changes — files are being removed, not reorganized.

```
app/views/
├── project-assignments.js   ← DELETE (dead, replaced by assignments.js)
├── service-assignments.js   ← DELETE (dead, replaced by assignments.js)
├── assignments.js            ← KEEP (active, imported by admin.js)
├── procurement.js            ← MODIFY (MRF dropdown unification)
└── ...all others unchanged
nul                           ← DELETE (accidental shell artifact)
```

### Pattern 1: Dependency Trace (for safe deletion)
**What:** Trace every `import` statement from the SPA entry point to identify which files are actually reachable at runtime.
**When to use:** Before any file deletion to confirm it is truly unreferenced.
**Trace result (confirmed by research):**

```
index.html
  → app/firebase.js           ✓ LIVE
  → app/auth.js               ✓ LIVE
  → app/router.js             ✓ LIVE
  → app/utils.js              ✓ LIVE
  → app/components.js         ✓ LIVE

router.js dynamic imports:
  → views/home.js             ✓ LIVE (uses hero.css classes)
  → views/clients.js          ✓ LIVE
  → views/projects.js         ✓ LIVE (imports edit-history.js)
  → views/mrf-form.js         ✓ LIVE (imports mrf-records.js)
  → views/procurement.js      ✓ LIVE
  → views/finance.js          ✓ LIVE
  → views/project-detail.js   ✓ LIVE (imports edit-history.js, expense-modal.js)
  → views/services.js         ✓ LIVE (imports edit-history.js)
  → views/service-detail.js   ✓ LIVE (imports edit-history.js, expense-modal.js)
  → views/register.js         ✓ LIVE
  → views/login.js            ✓ LIVE
  → views/pending.js          ✓ LIVE
  → views/admin.js            ✓ LIVE
       → views/user-management.js  ✓ LIVE
       → views/assignments.js       ✓ LIVE (the replacement)
       → views/role-config.js       ✓ LIVE

  UNREACHABLE via import chain:
  → views/project-assignments.js   ✗ DEAD (no import anywhere)
  → views/service-assignments.js   ✗ DEAD (no import anywhere)

Additional app/ modules:
  → app/edit-history.js       ✓ LIVE (imported by projects.js, project-detail.js, service-detail.js, services.js)
  → app/permissions.js        ✓ LIVE (imported by auth.js or similar)
  → app/expense-modal.js      ✓ LIVE (imported by project-detail.js, service-detail.js)
  → app/seed-roles.js         ✗ NOT imported by SPA (referenced only in scripts/)

CSS files:
  → styles/main.css           ✓ LIVE (index.html link)
  → styles/components.css     ✓ LIVE (index.html link)
  → styles/views.css          ✓ LIVE (index.html link)
  → styles/hero.css           ✓ LIVE (index.html link; classes used in home.js)
```

**Confidence note on seed-roles.js:** It is not imported by any SPA file. The CONTEXT.md scope is "view or utility files" — seed-roles.js is a data-seeding script in `app/` root, not a view. Flagging for user review per the "edge cases" decision is appropriate.

### Pattern 2: Unified Project/Service Select (MRF-01)
**What:** Replace two separate dropdowns with one `<select>` using `<optgroup>` elements.
**When to use:** In `renderMRFDetails()` inside `procurement.js`, when rendering the new-MRF form (`isNew === true`).

**Current pattern (TWO dropdowns, ~lines 1034-1052 of procurement.js):**
```html
<!-- Field 1: Project -->
<select id="projectName">
    <option value="">-- Select a project --</option>
    ${projectOptions}   <!-- built from projectsData -->
</select>

<!-- Field 2: Service (conditional, only shown if cachedServicesForNewMRF.length > 0) -->
<select id="saveNewMRF_serviceName">
    <option value="">-- Select a service (optional) --</option>
    ${serviceOptions}   <!-- built from cachedServicesForNewMRF -->
</select>
```

**Target pattern (ONE dropdown, matching mrf-form.js lines 212-216):**
```html
<select id="projectServiceSelect">
    <option value="">-- Select a project or service --</option>
    <optgroup id="newMRFProjectsOptgroup" label="Projects">
        <!-- populated from projectsData -->
    </optgroup>
    <optgroup id="newMRFServicesOptgroup" label="Services">
        <!-- populated from active services (onSnapshot or getDocs) -->
    </optgroup>
</select>
```

Each option must carry `data-type="project"` or `data-type="service"`, plus the name in a `data-*` attribute so `saveNewMRF()` can read it cleanly.

**Updated saveNewMRF() read pattern:**
```javascript
const selectEl = document.getElementById('projectServiceSelect');
const selectedOption = selectEl?.options[selectEl?.selectedIndex];
const selectedType = selectedOption?.dataset?.type || '';  // 'project' | 'service'
const selectedCode = selectEl?.value?.trim() || '';
const selectedName = selectedOption?.dataset?.name || '';

const hasProject = selectedType === 'project' && !!selectedCode;
const hasService  = selectedType === 'service'  && !!selectedCode;
const department  = hasService ? 'services' : 'projects';
```

**Services data for the new dropdown:** The current `loadServicesForNewMRF()` uses a one-time `getDocs()` query for `active == true`. This is adequate — no need to switch to `onSnapshot` for this use case (the dropdown is only shown transiently during new-MRF creation).

**The `projectsData` module-level array** is already populated by `loadProjects()` (an `onSnapshot` listener). Building the project optgroup options from it is the same approach as the existing code.

### Pattern 3: Console.log Identification (ad-hoc vs structured)
**What:** Regex rule for identifying ad-hoc (removable) console.log calls.
**Criterion:** A `console.log()` is ad-hoc if it does NOT start with a bracketed prefix `[Xxxx]`.

**Keep (structured/prefixed):**
```javascript
console.log('[Procurement] Services for New MRF loaded:', count);
console.log('[Router] Navigation:', { path, tab });
console.log('[Assignments] Initialized...');
```

**Remove (ad-hoc/unprefixed):**
```javascript
console.log('Projects loaded:', projectsData.length);        // line 656
console.log('Suppliers loaded:', suppliersData.length);      // line 1983
console.log('Loading MRF Records...');                       // line 2252
console.log(`Loaded ${allPRPORecords.length} MRFs and ...`); // line 2288
console.log('📦 Submitting Transport Request for MRF:', ...); // line 2927
console.log('📋 Generating PR for MRF:', ...);               // line 3117
console.log('POs updated:', poData.length);                  // line 3771
console.log('Loading PR details for:', prDocId);             // line 4147
console.log('Loading PO details for:', poId);                // line 4282
console.log('Generating PR document for:', prDocId);         // line 5165
console.log('Generating PO document for:', poDocId);         // line 5215
console.log('Procurement view module loaded successfully');   // line 5451
// ... and several more emoji-prefix ones inside generatePR/generatePRandTR
```

**Decision note:** Emoji-prefixed logs (`📋`, `📦`, `♻️`, `🔗`, `✨`, `🗑️`) are ad-hoc. They are not bracketed `[Module]` style. Per the CONTEXT.md rule, remove them. The `console.error()` calls throughout should be kept — they are error reporting, not debug output.

### Anti-Patterns to Avoid
- **Removing hero.css:** It appears to be only a CSS file loaded in index.html with no `.js` import — but its classes (`hero-section`, `nav-card`, `quick-stats`, `stat-item`) are actively used by `home.js`. DO NOT remove it.
- **Removing seed-roles.js without flagging:** It is not imported by the SPA, but auto-removal of files in `app/` root that aren't view files is an edge case. Flag it for user review per the CONTEXT.md decision.
- **Two-dropdown logic remaining in saveNewMRF():** After switching to the unified select, the old reads of `#projectName` and `#saveNewMRF_serviceName` must be fully removed. Leaving stale element reads produces silent `undefined` values.
- **Breaking the services optgroup when services list is empty:** When no active services exist, the `<optgroup>` element should still render (just empty) rather than conditionally omitting it. The current conditional `cachedServicesForNewMRF.length > 0` check on the old separate block should be dropped.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Grouped dropdown | Custom CSS/JS accordion | Native `<optgroup>` | Browser-native, accessible, zero JS overhead |
| Import tracing | Complex AST parser | grep/Glob for `import.*filename` | Sufficient for static ES module imports in this codebase |
| Git rollback | Manual file restoration | `git tag pre-cleanup` + `git checkout` | One-command recovery |

---

## Common Pitfalls

### Pitfall 1: hero.css looks unreferenced at first glance
**What goes wrong:** `hero.css` is linked in `index.html` but has no `.js` `import` statement — a naive "find all CSS imports in JS" scan misses it.
**Why it happens:** CSS is loaded via `<link>` tags, not `import`. Only grepping the HTML file reveals it.
**How to avoid:** Scan `index.html` `<link>` tags, then verify each CSS file's class names appear in JS view files.
**Warning signs:** Research confirmed `home.js` uses `.hero-section`, `.nav-card`, `.quick-stats`, `.stat-item`, `.stat-label`, `.stat-value`, `.navigation-cards`, `.hero-title`, `.hero-subtitle` — all defined in `hero.css`. File is live.

### Pitfall 2: seed-roles.js ambiguity
**What goes wrong:** `seed-roles.js` exists in `app/` (the SPA source directory) but is not imported by any SPA module. Automatically treating it as "dead" ignores its purpose.
**Why it happens:** It is referenced by `scripts/sync-role-permissions.js` (a standalone Node script, not SPA code). Removing it could break that script.
**How to avoid:** Flag for user review — do not auto-remove. The CONTEXT.md decision covers exactly this case ("Edge cases... are flagged for user review, not auto-removed").

### Pitfall 3: validate-permissions.js stale route reference
**What goes wrong:** `scripts/validate-permissions.js` line 79 references `'/project-assignments': 'role_config'` — a route that no longer exists in `router.js`.
**Why it happens:** The script was not updated when `project-assignments.js` was superseded by `assignments.js`.
**How to avoid:** After deleting the dead files, also remove the stale route entry from `validate-permissions.js`. This is a scripts/ maintenance item, not a blocker, but leaving it would produce a false route validation warning.

### Pitfall 4: saveNewMRF() reads both old element IDs
**What goes wrong:** After the MRF-01 dropdown change, if `saveNewMRF()` is not updated, it will silently read `undefined` from `document.getElementById('projectName')` and `document.getElementById('saveNewMRF_serviceName')`.
**Why it happens:** The function currently reads two separate selects and uses presence of `serviceCode` to determine `department`. After the unification, only one select with `data-type` attribute exists.
**How to avoid:** Update `saveNewMRF()` in the same commit as the HTML template change. Read `#projectServiceSelect`, check `data-type` on the selected option. The `cachedServicesForNewMRF` variable and `loadServicesForNewMRF()` function can be repurposed or renamed to serve the unified dropdown.

### Pitfall 5: Empty optgroup rendering
**What goes wrong:** The old code conditionally omits the service dropdown entirely when `cachedServicesForNewMRF.length === 0`. If the new unified select omits the Services optgroup conditionally, it creates inconsistent UI.
**Why it happens:** The old approach was a workaround for having separate fields. With a unified select, the optgroup can simply be empty.
**How to avoid:** Always render both optgroups. An empty optgroup is visually invisible. This is simpler and avoids conditional rendering bugs.

---

## Code Examples

### Unified Select HTML Template
```javascript
// In renderMRFDetails(), isNew === true branch
// Replaces the two separate <div> blocks for Project and Service

const projectOptions = projectsData
    .map(p => `<option value="${p.project_code}" data-type="project" data-name="${p.project_name}">${p.project_code ? p.project_code + ' - ' : ''}${p.project_name}</option>`)
    .join('');

const serviceOptions = cachedServicesForNewMRF
    .map(s => `<option value="${s.service_code}" data-type="service" data-name="${s.service_name}">${s.service_code} - ${s.service_name}</option>`)
    .join('');

// HTML block (replaces both old <div> blocks):
`<div style="grid-column: 1 / -1;">
    <div style="font-size: 0.75rem; color: #5f6368;">Project / Service *</div>
    <select id="projectServiceSelect" style="width: 100%; padding: 0.5rem; border: 2px solid #dadce0; border-radius: 4px; background-color: #ffffff; font-family: inherit; transition: all 0.2s;" onfocus="this.style.borderColor='#1a73e8'; this.style.backgroundColor='#f8fbff';" onblur="this.style.borderColor='#dadce0'; this.style.backgroundColor='#ffffff';">
        <option value="">-- Select a project or service --</option>
        <optgroup label="Projects">${projectOptions}</optgroup>
        <optgroup label="Services">${serviceOptions}</optgroup>
    </select>
</div>`
```

### Updated saveNewMRF() Read Logic
```javascript
// Replace the old reads of #projectName and #saveNewMRF_serviceName:

const selectEl = document.getElementById('projectServiceSelect');
const selectedOption = selectEl?.options[selectEl?.selectedIndex];
const selectedType = selectedOption?.dataset?.type || '';   // 'project' | 'service'
const selectedCode = selectEl?.value?.trim() || '';
const selectedName = selectedOption?.dataset?.name || '';

const hasProject = selectedType === 'project' && !!selectedCode;
const hasService  = selectedType === 'service'  && !!selectedCode;
const department  = hasService ? 'services' : 'projects';

// Validate
if (!hasProject && !hasService) {
    showToast('Please select a project or service', 'error');
    return;
}

// Find project object (needed for project_code + project_name both)
let selectedProject = null;
if (hasProject) {
    selectedProject = projectsData.find(p => p.project_code === selectedCode);
    if (!selectedProject) {
        showToast('Selected project not found', 'error');
        return;
    }
}

// serviceCode / serviceName come directly from the unified select:
const serviceCode = hasService ? selectedCode : '';
const serviceName = hasService ? selectedName : '';
```

### Git Tag for Safe Rollback
```bash
git tag pre-cleanup
# After all removals are verified clean:
# git tag -d pre-cleanup   (if no longer needed)
# Rollback: git checkout pre-cleanup -- .
```

### Deleting the nul File
```bash
git rm nul
# Then commit as one of the category commits
```

### Ad-hoc Console.log Pattern (for grep identification)
```bash
# Find console.log calls that do NOT start with a bracketed prefix
grep -n "console\.log(" app/views/procurement.js | grep -v "\["
# Result: lines 656, 1983, 2252, 2288, 2927, 3117, 3262, 3278, 3304, 3340,
#         3418, 3492, 3631, 3771, 4147, 4282, 5165, 5215, 5396, 5410, 5425, 5451
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| project-assignments.js + service-assignments.js | assignments.js (unified) | Phase 39 | Old files became dead code — this phase removes them |
| Two separate project/service dropdowns in Procurement Create MRF | One unified select with optgroups | Phase 46 (this phase) | Consistent with mrf-form.js pattern |

---

## Open Questions

1. **seed-roles.js removal**
   - What we know: It is in `app/` but not imported by any SPA view or utility. Only `scripts/sync-role-permissions.js` references it.
   - What's unclear: Whether the scripts/ tooling is actively used and would break without it.
   - Recommendation: Flag for user review (per CONTEXT.md edge-case rule). Do not auto-remove. Present finding during planning: "seed-roles.js is in app/ but only used by scripts/sync-role-permissions.js — keep or move to scripts/?"

2. **validate-permissions.js stale route**
   - What we know: Line 79 has `'/project-assignments': 'role_config'` which references a deleted route.
   - What's unclear: Whether this script is regularly run (it is a dev utility).
   - Recommendation: Include a small cleanup of this stale entry in the dead-JS commit. Low risk, high correctness value.

3. **CDN dependency check**
   - What we know: `index.html` has one CDN reference — the CLMC logo `img src` in the `<nav>` brand. The only `<script>` external dependency is `lib/signature_pad.umd.min.js` which is self-hosted.
   - What's unclear: Whether there are any other CDN references (e.g., fonts, analytics) hidden in CSS files.
   - Recommendation: Grep all CSS and HTML for `http` URLs. Based on research, no CDN script tags were found — Firebase is imported via ES module from CDN in `firebase.js` not `index.html`, so there are no unused CDN `<script>` tags to remove. This commit category may be a no-op or a very small change.

---

## Sources

### Primary (HIGH confidence)
- Direct file reads: `app/views/project-assignments.js`, `app/views/service-assignments.js`, `app/views/assignments.js`, `app/views/admin.js`, `app/views/mrf-form.js`, `app/views/procurement.js` (lines 1-665, 950-1700), `app/router.js`, `index.html`, `styles/hero.css`
- Grep searches: import chain trace, console.log enumeration, CSS class usage verification
- GSD init output: phase metadata confirmed

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions (user-locked, high trust)
- STATE.md accumulated decisions (Phase 39 and 40 notes)

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Dead file identification: HIGH — confirmed by full import chain trace; neither project-assignments.js nor service-assignments.js appears in any `import` statement in the SPA
- hero.css status: HIGH — directly verified class names in home.js against hero.css definitions
- MRF dropdown unification: HIGH — current code read in full, target pattern read from mrf-form.js, data flow traced
- Console.log identification: HIGH — grep enumeration of procurement.js unprefixed logs is complete and line-numbered
- seed-roles.js edge case: MEDIUM — function clear, but the appropriate handling (flag vs remove) is a user preference call

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable codebase, no external dependencies to track)
