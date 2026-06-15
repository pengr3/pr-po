---
phase: 105-service-plan-gantt-parity
reviewed: 2026-06-15T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - firestore.rules
  - app/service-task-id.js
  - app/views/service-plan.js
  - app/router.js
  - app/views/service-detail.js
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: resolved
resolved: 2026-06-15
resolution_commit: 2b7d4cd
---

# Phase 105: Code Review Report

**Reviewed:** 2026-06-15
**Depth:** standard
**Files Reviewed:** 5
**Status:** resolved (all Critical + Warning fixed in `2b7d4cd`; IN-03 also fixed)

> **Resolution (2026-06-15, commit `2b7d4cd`):** CR-01 unclosed `plan-body-row`/`plan-view-surface` divs added (template now 15/15 balanced); WR-01/02/03 user-facing "Project Plan"/"this project"/"the project plan" strings swapped to service wording; IN-03 snapshot error callback added to `ensureTasksListener`. IN-01 (cosmetic local var names `projSnap`/`projDoc`) and IN-02 (pre-existing `created_by` schema-comment gap mirrored from project_tasks) left as-is — non-functional, deliberately deferred.

## Summary

Phase 105 is a copy-then-adapt of project-plan.js / project-detail.js with a project→service
identifier swap. The two known swap defects that surfaced during UAT (commits f4fdc3a, 1712450)
were both confirmed fixed. No remaining `project_code`/`project_tasks`/`project_id` leaks exist
in executable write/read paths. The Firestore rules block is correctly structured and the
`isRole('services_user')` short-circuit guard is present in every create/update/delete branch.
`generateServiceTaskId` correctly scopes its max-seq scan to the queried service_code.
Listener teardown in service-detail.js is symmetric in both init() re-init block and destroy().

Three defects remain: one structural HTML bug in the render() template (unclosed divs), and two
user-visible stale-text bugs where the swap missed UI strings embedded in logic branches rather
than data fields.

---

## Critical Issues

### CR-01: `render()` HTML template has 2 unclosed `<div>` tags — layout container boundary is wrong

**File:** `app/views/service-plan.js:148-158`

**Issue:** The `render()` return string opens three nesting levels —
`plan-view-surface` (line 120), `plan-body-row` (line 148), `plan-split-pane` (line 149) —
but only closes one of them before the template ends. The final `</div>` on line 157 closes
`plan-split-pane`; `plan-body-row` and `plan-view-surface` are never closed.

The browser auto-closes unclosed divs at the boundary of the `#app-container` innerHTML
assignment. Because `plan-view-surface` has `overflow:hidden` CSS applied for the Gantt
scroll-clamp and the curtain-divider resize logic, auto-closing it at the wrong DOM position
means content injected after `#app-container` could bleed inside the clipped region, or the
height/overflow boundary may be resolved against the wrong ancestor. The `initPanelResize()`
and `bindScrollSync()` functions both use `document.getElementById('planSplitPane')` and
`.gantt-pane` — if the browser collapses the container earlier, these element lookups can
return stale references on re-render.

This did not break the currently-tested split-pane resize in UAT, likely because
`innerHTML` replacement atomically re-creates the full DOM subtree and the browser
immediately re-resolves containment. However, it is a latent layout bug that could manifest
when adjacent DOM (e.g., a toast or modal appended to body) causes the browser to close
the unclosed containers earlier than expected.

Compare: `project-plan.js` closes with `</div>` for `plan-split-pane`, then the iter-rail
block, then `</div>` for `plan-body-row`, then `</div>` for `plan-view-surface` (lines
210, 223, 247). Service-plan.js omitted `</div></div>` when the iter-rail and iter-diff-panel
blocks were removed.

**Fix:**
```javascript
// app/views/service-plan.js — end of render() return string
// Replace lines 153-158 with:
                    <div class="plan-divider" id="planDivider" aria-hidden="true"></div>
                    <div class="gantt-pane">
                        <div id="ganttPane"></div>
                    </div>
                </div>    <!-- closes plan-split-pane -->
            </div>        <!-- closes plan-body-row  -->
        </div>            <!-- closes plan-view-surface -->
    `;
```

---

## Warnings

### WR-01: PDF export title hardcodes "Project Plan" instead of "Service Plan"

**File:** `app/views/service-plan.js:3600`

**Issue:** `exportGanttPDF()` builds the print-frame heading as:
```javascript
<h2>${escapeHTML(projectName)} — Project Plan</h2>
```
Users who export a service Gantt receive a PDF titled `"{service_name} — Project Plan"`. The
variable `projectName` on line 3567 is also named inconsistently (`const projectName =
currentService?.service_name || ...`), though that name is internal-only.

**Fix:**
```javascript
// line 3567
const servicePlanTitle = currentService?.service_name || serviceCode || 'Service';

// line 3600
<h2>${escapeHTML(servicePlanTitle)} — Service Plan</h2>
```

---

### WR-02: `gridToggleMilestone` permission-denied toast says "on this project" instead of "on this service"

**File:** `app/views/service-plan.js:3687`

**Issue:** When a `services_user` without write rights toggles a milestone and Firestore
returns `permission-denied`, the toast reads:
```
You don't have permission to change milestone status on this project.
```
This is confusing on a service plan view where no "project" is involved.

**Fix:**
```javascript
// line 3687
? `You don't have permission to change milestone status on this service.`
```

---

### WR-03: Arrow context-menu error toast says "Reload the project plan"

**File:** `app/views/service-plan.js:2322`

**Issue:** When `getArrowFromTo()` cannot identify a dependency arrow, the toast reads:
```
Could not identify this dependency. Reload the project plan.
```
This should refer to the service plan.

**Fix:**
```javascript
// line 2322
showToast('Could not identify this dependency. Reload the service plan.', 'warning');
```

---

## Info

### IN-01: Local variable names `projSnap` / `projDoc` not swapped in `init()`

**File:** `app/views/service-plan.js:168-177`

**Issue:** Four lines use `projSnap` and `projDoc` as local variable names for a query against
the `services` collection. The variables are used correctly (querying the right collection,
assigning to `currentService`), but the stale project-origin names are misleading for future
maintainers. The plan summary (105-02) claims "0 remaining project identifiers in executable
code" — technically true since these are local binding names, not field or collection
identifiers, but the claim was slightly over-stated.

**Fix:**
```javascript
const serviceSnap = await getDocs(query(collection(db, 'services'), where('service_code', '==', serviceCode)));
if (serviceSnap.empty) { ... }
const serviceDoc = serviceSnap.docs[0];
currentService = { id: serviceDoc.id, ...serviceDoc.data() };
```

---

### IN-02: `firestore.rules` schema comment lists `created_by` but `service-plan.js` never writes it

**File:** `firestore.rules:736`

**Issue:** The schema comment for `service_tasks` lists `created_by` as a schema field:
```
// Schema: task_id (==doc id), service_id, service_code, parent_task_id,
//   name, description, start_date, end_date, progress (0-100),
//   is_milestone, dependencies[], assignees[uid], created_at, updated_at, created_by.
```
None of the `setDoc` calls in `service-plan.js` (lines 1189, 1464, 1610, 1625) include a
`created_by` field. The same gap exists in the reference `project-plan.js` for `project_tasks`
(pre-existing), so this is not a regression introduced by Phase 105. However, the schema
comment is inaccurate for both collections and could cause confusion when `created_by` is
expected by downstream queries or audit tools.

**Fix:** Either remove `created_by` from both schema comments, or add
`created_by: window.getCurrentUser?.()?.uid ?? null` to the create paths in both files.

---

### IN-03: `ensureTasksListener` in service-detail.js has no error callback

**File:** `app/views/service-detail.js:401-414`

**Issue:** `onSnapshot()` is called without an error callback. If the `service_tasks` rules
are not yet deployed to production (which is explicitly noted as a pending merge debt in the
summary docs), the listener will fail silently — the Service Plan card will stay on its
empty/loading state with no error shown to the user and no console message to aid debugging.
The peer listeners `ensureServiceBillingRequestsListener` and `ensureServiceCollectiblesListener`
in the same file both include `(err) => console.error(...)` error callbacks, making this
inconsistent.

Note: the reference `project-detail.js` `ensureTasksListener` also lacks an error callback
(pre-existing). This review flags it here because the `service_tasks` rules are the newest
and most likely to have deployment lag.

**Fix:**
```javascript
currentTasksListenerUnsub = onSnapshot(
    query(collection(db, 'service_tasks'), where('service_id', '==', currentService.id)),
    (snap) => {
        currentTasks = [];
        snap.forEach(d => currentTasks.push({ id: d.id, ...d.data() }));
        currentServiceProgress = computeServiceProgress(currentTasks);
        const cardEl = document.getElementById('servicePlanCard');
        if (cardEl) {
            const tmp = document.createElement('div');
            tmp.innerHTML = buildServicePlanCardHtml();
            cardEl.replaceWith(tmp.firstElementChild);
        }
    },
    (err) => console.error('[ServiceDetail] service_tasks listener error:', err.message)
);
```

---

_Reviewed: 2026-06-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
