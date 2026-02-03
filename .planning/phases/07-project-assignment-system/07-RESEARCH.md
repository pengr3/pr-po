# Phase 7: Project Assignment System - Research

**Researched:** 2026-02-03
**Domain:** Firestore user-project assignment with real-time filtered views in vanilla JS SPA
**Confidence:** HIGH (all findings verified against live codebase; no external library research needed)

---

## Summary

Phase 7 adds per-user project scoping for the `operations_user` role. The mechanism is straightforward: store an assignment list (or an "all projects" flag) on each user's Firestore document, then filter the projects view, the MRF-form project dropdown, and the MRF list in procurement -- all using the same real-time pattern already established in Phase 6.

The codebase already has every building block in place. `auth.js` maintains a real-time `onSnapshot` listener on the current user's document (lines 253-294) and dispatches events when the document changes. `permissions.js` dispatches `permissionsChanged`. Views already listen for `permissionsChanged` to re-render. The filtering logic itself is client-side array filtering -- the same technique already used in `projects.js` for status/search filters.

The new work decomposes into four logical units:
1. **Data model + admin UI** -- where assignments are stored, and the panel for Super Admin / Operations Admin to edit them.
2. **Projects view filter** -- `projects.js` filters `allProjects` before display when the current user is `operations_user`.
3. **MRF form filter** -- `mrf-form.js` filters the project dropdown when the current user is `operations_user`.
4. **Procurement MRF list filter** -- `procurement.js` filters the MRF list when the current user is `operations_user`.

**Primary recommendation:** Store assignments as an array field (`assigned_project_codes`) on the user document in the `users` collection. Use a boolean flag (`all_projects: true`) on the same document for the "all projects" escape hatch. This piggybacks on the existing user-document real-time listener in `auth.js` with zero new infrastructure. The assignment admin panel is a new standalone view module at `/project-assignments`, routed and nav-linked under the same `role_config` permission gate as Settings.

---

## Data Model & Touchpoints

### Current User Document Shape (from `auth.js` lines 39-46 and `createUserDocument`)

```javascript
// users/{firebaseAuthUid}
{
    email: string,
    full_name: string,
    status: 'pending' | 'active' | 'rejected' | 'deactivated',
    role: null | 'super_admin' | 'operations_admin' | 'operations_user' | 'finance' | 'procurement',
    invitation_code: string,
    created_at: Timestamp,
    updated_at: Timestamp
}
```

### Proposed Additions for Phase 7

Two new fields on user documents, written only for `operations_user` role users:

```javascript
// users/{firebaseAuthUid}  -- new fields
{
    // ... existing fields unchanged ...
    all_projects: true,          // boolean. When true, no filtering. Omit or false = use array below.
    assigned_project_codes: ['CLMC_ABC_2026001', 'CLMC_XYZ_2026002']  // array of project_code strings
}
```

**Why this shape:**
- `all_projects: true` is cleanest as a boolean flag. A sentinel value in the array (e.g. `"*"`) would require special-case checks everywhere. The flag is explicit and self-documenting.
- `assigned_project_codes` uses `project_code` strings (not Firestore document IDs). `project_code` is the stable, human-readable key already used as the join key between `projects`, `mrfs`, `prs`, `pos` throughout the codebase (see MRF submission in `mrf-form.js` line 506, PR/PO generation in `procurement.js`).
- These fields only exist on `operations_user` documents. All other roles simply lack these fields; filtering logic checks role first, so missing fields on other roles cause no issue.

**"All projects" is dynamic by design:** When `all_projects: true`, no array is consulted. New projects appear automatically because the projects view loads all projects from Firestore -- the filter is simply skipped.

### Collections Involved

| Collection | Read By Phase 7 | Written By Phase 7 |
|------------|-----------------|---------------------|
| `users` | Yes -- read assignments from current user doc (via existing listener in auth.js); read all ops users in assignment admin panel | Yes -- write `assigned_project_codes` and `all_projects` |
| `projects` | Yes -- read project list to populate assignment UI checkboxes | No |
| `mrfs` | Yes -- read `project_code` field to apply MRF list filter | No |

### Where User Data Lives Client-Side

`auth.js` module-level variable `currentUser` (line 171) holds the full user document. It is updated in real-time by the `onSnapshot` listener at line 253. `getCurrentUser()` is exported and also on `window`. This is the single source of truth for the logged-in user's assignments. No separate fetch or listener is needed.

---

## Permission & Auth Module Patterns

### How Permissions Currently Work (Phase 6 output)

```
Login
  -> onAuthStateChanged fires (auth.js line 196)
  -> getUserDocument() fetches user doc (line 208)
  -> currentUser set (line 211)
  -> initPermissionsObserver(currentUser) starts onSnapshot on role_templates/{role} (line 215)
  -> onSnapshot fires: currentPermissions set in permissions.js (line 84)
  -> CustomEvent 'permissionsChanged' dispatched (line 90)
  -> auth.js module-level listener calls updateNavForAuth() (line 27)
  -> Views listening for 'permissionsChanged' re-render (e.g. projects.js line 238)
```

### How Assignment Changes Propagate (the key design insight)

The user document `onSnapshot` in `auth.js` (line 253) already fires whenever ANY field on the user doc changes. When an admin writes `assigned_project_codes` or `all_projects` to a user document:

1. `onSnapshot` fires for that user (if they are currently logged in)
2. `currentUser` is updated with the new fields (line 259)
3. The existing role-change detection block runs. Assignments are NOT a role change, so that block does nothing.
4. **Phase 7 adds:** Dispatch a new `assignmentsChanged` custom event here, immediately after `currentUser` is updated, when the assignment fields change. This mirrors the `permissionsChanged` pattern exactly.

```javascript
// In the user doc onSnapshot callback, after currentUser is updated:
// Detect assignment change (Phase 7)
const prevAssignments = /* saved before update */;
if (currentUser.assigned_project_codes !== prevAssignments ||
    currentUser.all_projects !== prevAllProjects) {
    window.dispatchEvent(new CustomEvent('assignmentsChanged', {
        detail: { user: currentUser }
    }));
}
```

Views subscribe to `assignmentsChanged` and re-filter. This is the ONLY new event in the system. No new listeners, no new modules for propagation.

### Who Can Access the Assignment Admin Panel

The CONTEXT.md locks this: accessible by both Super Admin and Operations Admin. The existing `role_config` permission gate covers Super Admin. For Operations Admin, the assignment panel needs its own permission check. The cleanest approach: add a new tab ID `project_assignments` to `routePermissionMap` in `router.js`, and add it to role templates so Operations Admin has access. Alternatively, check `currentUser.role` directly in the view. The planner should decide which approach fits the Phase 9 user management work.

---

## View Touchpoints

### 1. projects.js -- Project List Filter

**Current flow:**
```
loadProjects() sets up onSnapshot on entire 'projects' collection (line 571)
  -> allProjects populated (line 573)
  -> applyFilters() called (line 580)
    -> filteredProjects = allProjects.filter(...) with status/search/client filters (line 465)
    -> sortFilteredProjects() (line 491)
    -> renderProjectsTable() (line 492)
```

**What to change:**
- In `applyFilters()`, add ONE additional filter condition: if current user is `operations_user` AND does NOT have `all_projects: true`, intersect with `assigned_project_codes`.
- This is a single additional `.filter()` step on `allProjects` before the existing filters run. Or add it as another `&&` condition inside the existing filter predicate.
- Subscribe to `assignmentsChanged` event in `init()` (same pattern as `permissionsChanged` handler at line 238). Call `applyFilters()` to re-filter immediately.
- Clean up the `assignmentsChanged` listener in `destroy()` (same pattern as `_projectsPermissionHandler` at lines 258-261).

**No changes to Firestore queries.** The full collection is still fetched. Filtering is client-side only. This matches the existing pattern and keeps the code simple.

### 2. project-detail.js -- Access Denied on Removed Project

**Current flow:**
```
init() receives projectCode param (line 48)
  -> onSnapshot query by project_code (line 78)
  -> snapshot fires, currentProject set (line 95)
  -> renderProjectDetail() called
```

**What to change:**
- After `currentProject` is set, check: if user is `operations_user` without `all_projects`, is this project in their `assigned_project_codes`?
- If not: replace the container with an access denied message + link back to `#/projects`. Do NOT redirect silently (CONTEXT.md is explicit on this).
- Subscribe to `assignmentsChanged` event. Re-run the access check. If the project is no longer assigned, show the access denied message in place.

### 3. mrf-form.js -- Project Dropdown Filter

**Current flow:**
```
init() calls loadProjects() (line 229)
  -> onSnapshot on projects collection with where('active', '==', true) (line 252)
  -> For each project, appends <option> to #projectName select (line 275)
```

**What to change:**
- In the `onSnapshot` callback, after collecting and sorting projects, add a filter step: if user is `operations_user` without `all_projects`, keep only projects whose `project_code` is in `assigned_project_codes`.
- If filtered list is empty: show a single disabled option with hint text ("No projects assigned -- contact your admin") instead of the generic "No projects available" message (line 257).
- Subscribe to `assignmentsChanged`. When it fires, re-run the snapshot callback logic (re-filter and re-populate the dropdown). The snapshot data is already in memory from the active listener; just re-apply the filter.
- Note: `mrf-form.js` uses a single `projectsListener` variable (line 10), not an array. The `assignmentsChanged` handler should be a separate event listener, cleaned up in `destroy()`.

### 4. procurement.js -- MRF List Filter

**Current flow:**
```
init() calls loadMRFs() (line 337)
  -> onSnapshot on mrfs collection with status filter (line 459)
  -> allMRFs collected (line 463)
  -> Split into materialMRFs and transportMRFs (lines 471-472)
  -> Each sorted by deadline (lines 481-482)
  -> renderMRFList(materialMRFs, transportMRFs) called (line 485)
```

**What to change:**
- In the `onSnapshot` callback, after collecting `allMRFs`, add a filter step: if user is `operations_user` without `all_projects`, filter `allMRFs` to only include MRFs whose `project_code` is in `assigned_project_codes`. This runs BEFORE the material/transport split.
- The MRF documents have `project_code` as a top-level field (confirmed at procurement.js line 559, mrf-form.js line 506). This is the join key.
- Subscribe to `assignmentsChanged` in `init()`. When it fires, re-run the filter and re-call `renderMRFList()`. The snapshot data is already in memory.
- Note: `procurement.js` does NOT currently listen for `permissionsChanged` at the view level (it has no equivalent of the `_projectsPermissionHandler` pattern). The `assignmentsChanged` listener is the first such listener added to this view.

**CRITICAL CONSTRAINT from CONTEXT.md:** PR/TR generation, PO tracking, and supplier tabs do NOT get project-scoped filtering. Only the MRF list (the `mrfs` tab) is filtered.

### 5. home.js -- DO NOT TOUCH

Dashboard stats are explicitly out of scope. The file has three stat queries (active MRFs, pending PRs, active POs) that count across ALL projects. These remain unfiltered. Confirmed in CONTEXT.md: "Dashboard (home view) stats NOT filtered -- explicitly out of scope."

---

## Admin Panel Placement

### Route Structure

The assignment panel is a new standalone view. It needs:
- A route entry in `router.js`
- A nav link (or programmatic entry point)
- A new view module file

**Recommended route:** `#/project-assignments`

Add to `router.js` routes object:
```javascript
'/project-assignments': {
    name: 'Project Assignments',
    load: () => import('./views/project-assignments.js'),
    title: 'Project Assignments | CLMC Procurement'
}
```

Add to `routePermissionMap`:
```javascript
'/project-assignments': 'role_config'   // Reuse role_config permission gate
```

**Nav link placement:** Add to `index.html` nav, OR do not add a top-level nav link and instead link from the existing Settings (`#/role-config`) page. The CONTEXT.md says "standalone admin panel -- separate from the existing role config tab." A separate nav link is the cleanest interpretation. The planner should choose visibility (always shown vs. role-gated). Using `data-route="role_config"` on the nav link means it shares the same permission gate as Settings -- only Super Admin sees it by default. Operations Admin access requires either updating the role template or a separate permission key.

### Panel Layout (Claude's Discretion -- Recommendation)

**User-centric layout is recommended.** The admin panel shows a list of all Operations Users. Each user row expands (or has an inline section) showing:
- A checkbox for "All Projects" (when checked, disables/hides the project list)
- A list of all active projects with checkboxes for assignment

**Why user-centric over project-centric:** There will typically be fewer Operations Users than projects. The primary action is "configure this user's access." Project-centric would require clicking into each project to see/manage its assignees, which is less efficient for the "assign all of User X's projects" workflow.

### Save Mechanism (Claude's Discretion -- Recommendation)

**Auto-save per user.** When any checkbox changes for a given user, immediately write that user's `assigned_project_codes` array and `all_projects` flag to Firestore. No batch save button needed.

**Why:** Each user's assignment is independent. There is no cross-user consistency constraint. Auto-save eliminates the risk of losing changes. This matches the auto-save-on-blur pattern already used in `project-detail.js` (lines 168, 176, 207). The role-config view uses batch save because its checkbox matrix spans multiple role documents in a single atomic operation; assignment changes are per-document, so that constraint does not apply.

**Silent save:** No toast on save. Matches CONTEXT.md ("Silent refresh on assignment changes -- no toast or notification"). Console log only.

---

## Real-time Propagation

### Propagation Chain (full end-to-end)

```
Admin edits assignment in project-assignments.js
  -> updateDoc(doc(db, 'users', targetUserId), { assigned_project_codes: [...], all_projects: false })
  -> Firestore propagates to target user's browser (if online)
  -> auth.js onSnapshot on users/{targetUserId} fires (line 253)
  -> currentUser updated with new fields (line 259)
  -> NEW: assignmentsChanged event dispatched
  -> projects.js assignmentsChanged handler calls applyFilters()
  -> mrf-form.js assignmentsChanged handler re-populates dropdown
  -> procurement.js assignmentsChanged handler re-filters MRF list
  -> project-detail.js assignmentsChanged handler re-checks access
```

### Listener Budget

Each logged-in user already has:
- 1 listener: user document (`auth.js` line 253)
- 1 listener: role template document (`permissions.js` line 79)

Phase 7 adds ZERO new Firestore listeners for the end-user. The assignment data arrives via the existing user-document listener. The filtering is done in memory using the data already present in `currentUser`.

The assignment admin panel adds listeners for its own use:
- 1 listener: all users (to show the list of Operations Users)
- 1 listener: all projects (to show checkboxes)

These exist only while the admin is on the assignment panel page. They are cleaned up in `destroy()`.

### What Happens If Admin and Target User Are Both Online

The admin writes to `users/{targetUserId}`. Firestore's client SDK on the target user's device receives the update via its existing `onSnapshot`. There is no race condition here -- Firestore guarantees eventual consistency for single-document listeners, and the update propagates in milliseconds in practice.

---

## Plan Structure Reference

Phase 6 plans follow this exact frontmatter + body pattern. Phase 7 plans must match:

### Frontmatter (YAML block)
```yaml
---
phase: 07-project-assignment-system
plan: 01                          # sequential number
type: execute
wave: 1                           # logical grouping; wave N depends on wave N-1
depends_on: []                    # list of prior plan numbers within this phase
files_modified:                   # exact file paths that will be changed
  - app/views/project-assignments.js
  - app/auth.js
autonomous: true                  # true if no human verification step needed mid-plan
user_setup: []                    # any manual steps user must do before execution

must_haves:
  truths:                         # what must be TRUE after this plan executes
    - "..."
  artifacts:                      # files that must exist, with structure checks
    - path: "..."
      provides: "..."
      contains: "..."             # a string that grep can find in the file
  key_links:                      # wiring relationships that must exist
    - from: "..."
      to: "..."
      via: "..."
      pattern: "..."              # regex the executor can verify
---
```

### Body Structure
```
<objective>
  One-paragraph purpose statement. What this plan produces and why.
</objective>

<execution_context>
  @path/to/workflow.md
  @path/to/template.md
</execution_context>

<context>
  @.planning/PROJECT.md
  @.planning/STATE.md
  @.planning/phases/07-project-assignment-system/07-RESEARCH.md
  @app/auth.js          (only files the tasks actually read or modify)
</context>

<tasks>
  <task type="auto">
    <name>Task N: Short description</name>
    <files>file1.js, file2.js</files>
    <action>
      Detailed implementation instructions. Code blocks with exact patterns.
      Reference RESEARCH.md sections. Be prescriptive.
    </action>
    <verify>
      How to confirm the task succeeded (console checks, grep, visual).
    </verify>
    <done>
      One-sentence summary of what was done (past tense).
    </done>
  </task>
</tasks>

<verification>
  Numbered checklist of end-to-end checks for the entire plan.
</verification>

<success_criteria>
  Bullet list of what must be true for the plan to be considered complete.
</success_criteria>

<output>
  Path to the SUMMARY.md file that must be created after completion.
</output>
```

### Wave Assignment Pattern (from Phase 6)
- Wave 1: Foundation (new modules, new files, no dependencies)
- Wave 2: Integration (wire new modules into existing modules)
- Wave 3+: UI enforcement, view modifications, CSS

Phase 7 suggested wave grouping:
- Wave 1: Data model change in `auth.js` (add `assignmentsChanged` event dispatch)
- Wave 2: Admin panel view (`project-assignments.js` + route + nav)
- Wave 3: View filters (`projects.js`, `project-detail.js`, `mrf-form.js`, `procurement.js`)

---

## Risks & Constraints

### Risk 1: auth.js onSnapshot Callback is Already Complex
**What:** The user-doc `onSnapshot` callback in `auth.js` (lines 253-294) handles deactivation, role changes, and currentUser updates. Adding assignment-change detection here increases cognitive load.
**Mitigation:** The addition is small -- save previous assignment values before updating `currentUser`, compare after, dispatch event if changed. Place it after the role-change block, clearly commented. Follow the exact same pattern as the role-change detection block (lines 263-273).

### Risk 2: operations_user Role Check Must Be Consistent
**What:** All four view touchpoints must check `currentUser.role === 'operations_user'` before applying the filter. If any view forgets the check, non-operations users get incorrectly filtered.
**Mitigation:** The planner should extract a shared utility function: `getAssignedProjectCodes()` that returns `null` (meaning "no filter") for all roles except `operations_user`, and returns the array (or `null` for "all projects") for `operations_user`. Each view calls this single function. Place it in `utils.js` or as a helper in `auth.js`. This eliminates the risk of inconsistent role checks across four files.

### Risk 3: project_code vs project_name Mismatch on Legacy MRFs
**What:** Some legacy MRFs may lack the `project_code` field (Phase 4 added it; pre-Phase-4 MRFs have only `project_name`). The procurement MRF list filter joins on `project_code`.
**Mitigation:** The filter should treat MRFs with no `project_code` as unfiltered (always shown) for `operations_user`. This is defensive and matches the backward-compatibility pattern from Phase 4 (04-03). The planner should add this condition explicitly.

### Risk 4: Tab Navigation Does Not Call destroy() Within Same View
**What:** Router skips `destroy()` when switching tabs within procurement (e.g. `mrfs` -> `suppliers` -> `mrfs`). The `assignmentsChanged` listener attached in `init()` persists across tab switches.
**Mitigation:** This is actually correct behavior -- the listener should persist. But the planner must ensure the handler does not re-attach on each `init()` call. Use the same guard pattern as `projects.js` uses for `_projectsPermissionHandler` (lines 245-247): store the handler reference, check if already registered before adding.

### Risk 5: Empty Assignment Array vs Missing Field
**What:** If an `operations_user` document has neither `all_projects` nor `assigned_project_codes`, what happens?
**Mitigation:** Treat as "zero assigned projects" (empty array). The user sees an empty project list and the MRF form hint message. This is the safest default -- an `operations_user` with no explicit assignment should not see all projects. The admin panel should make this state visible ("No projects assigned").

### Risk 6: Admin Panel Access for Operations Admin
**What:** CONTEXT.md says the panel is "accessible by both Super Admin and Operations Admin." The current `role_config` permission gate only covers Super Admin (Operations Admin has `role_config: { access: false }` in the default role template).
**Mitigation:** Either (a) add a new permission key `project_assignments` to all role templates and grant access to `operations_admin`, or (b) use a direct role check in the view (`currentUser.role === 'super_admin' || currentUser.role === 'operations_admin'`). Option (a) is more consistent with Phase 6 patterns but requires a role template update. Option (b) is simpler and does not touch the permission matrix. The planner should choose. Note: Phase 9 (User Management) will add a full admin panel; this decision may be revisited then.

### Constraint: Home View Untouched
Explicitly locked in CONTEXT.md. `home.js` stats queries are unfiltered. Do not modify `home.js` in any plan.

### Constraint: PR/TR and PO Tabs Unfiltered
Explicitly locked in CONTEXT.md. Only the `mrfs` tab in procurement is filtered. Supplier management, PR/TR generation, and PO tracking tabs remain unchanged.

### Constraint: No New Firestore Listeners for End Users
Assignment data flows through the existing user-document listener. No new `onSnapshot` on the `projects` collection is needed for filtering -- the views already load all projects. The filter is a client-side array intersection.

---

## Sources

### Primary (HIGH confidence -- live codebase, verified line-by-line)
- `app/auth.js` -- User document structure (lines 39-46), onSnapshot listener (lines 253-294), currentUser management (lines 171-179), role-change detection pattern (lines 256-273)
- `app/permissions.js` -- permissionsChanged event dispatch pattern (lines 79-95), module-level state management
- `app/views/projects.js` -- applyFilters() pattern (lines 459-493), permissionsChanged listener registration/cleanup pattern (lines 238-261), allProjects/filteredProjects two-array pattern
- `app/views/mrf-form.js` -- project dropdown population (lines 244-291), single-listener cleanup pattern (lines 549-556)
- `app/views/procurement.js` -- loadMRFs() with onSnapshot (lines 454-492), renderMRFList split pattern (lines 470-485), project_code field on MRF documents (line 559)
- `app/views/project-detail.js` -- access denied rendering pattern for "project not found" (lines 81-92), permissionsChanged listener pattern (lines 52-61)
- `app/router.js` -- route definitions, routePermissionMap, tab navigation skip-destroy behavior (lines 193-203)
- `app/views/role-config.js` -- batch save pattern with pendingChanges (lines 323-399), standalone admin view structure
- `.planning/phases/06-role-infrastructure-real-time-permissions/06-01-PLAN.md` -- plan frontmatter + task structure template
- `.planning/phases/06-role-infrastructure-real-time-permissions/06-02-PLAN.md` -- integration plan pattern, event listener wiring
- `.planning/phases/06-role-infrastructure-real-time-permissions/06-RESEARCH.md` -- permission propagation architecture, pitfalls

### Secondary (MEDIUM confidence -- design decisions from locked context)
- `.planning/phases/07-project-assignment-system/07-CONTEXT.md` -- All locked decisions, Claude's discretion areas, deferred items
- `.planning/STATE.md` -- Accumulated decisions log, phase completion status
- `.planning/ROADMAP.md` -- Phase 7 success criteria, dependency chain

---

## Metadata

**Confidence breakdown:**
- Data model: HIGH -- user document shape verified directly from auth.js; field additions are additive (Firestore is schemaless)
- View touchpoints: HIGH -- each function and line number verified against live files; filter insertion points are unambiguous
- Propagation design: HIGH -- follows exact pattern of permissionsChanged event already shipping in production; zero new Firestore infrastructure
- Admin panel placement: MEDIUM -- route and nav link are recommendations within Claude's discretion; the planner confirms
- Plan structure: HIGH -- copied from Phase 6 plans that executed successfully

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (30 days -- codebase is the source of truth; if files change, re-research the changed files)
