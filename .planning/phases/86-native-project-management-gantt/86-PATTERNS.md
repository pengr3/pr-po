---
name: 86-PATTERNS
description: Pattern map for Phase 86 — Native Project Management & Gantt. Each new file or modification mapped to its closest live-codebase analog. Concrete excerpts with absolute paths and line numbers; planner consumes per-plan. Heavy reuse of Phase 85 collectibles patterns (project-scoped IDs, derive-on-read, collection introduction) and Phase 77.1 Chart.js CDN-load precedent for Frappe Gantt.
type: phase-patterns
---

# Phase 86: Native Project Management & Gantt — Pattern Map

**Mapped:** 2026-05-05
**Files analyzed:** 1 new module + 1 new helper + 6 modified files
**Analogs found:** 8 / 8

Phase 86 is the **first native PM build** — there are no greenfield concepts the codebase hasn't already solved. Every new surface has a strong analog:

- **`app/views/project-plan.js`** (new) — full-screen split-pane view → mirrors `app/views/project-detail.js` (single-route param-driven view module) + `app/views/finance.js` (multi-section + filters + pagination + modal lifecycle).
- **`app/task-id.js`** (new) — project-scoped sequential ID → exact mirror of `app/coll-id.js` (Phase 85 D-20).
- **`app/views/project-detail.js`** (modified) — new "Project Plan" summary card → mirrors the existing Financial Summary card and Status & Assignment card already present in that file.
- **`firestore.rules`** (modified) — `project_tasks` block → mirrors existing `mrfs` (project-scoped read) + `collectibles` (Phase 85 new collection) + `notifications` (two-tier update with `affectedKeys().hasOnly([...])`).
- **`index.html`** (modified) — Frappe Gantt CDN script + CSS → mirrors Chart.js Phase 77.1 CDN line at index.html:18.
- **`app/router.js`** (modified) — `#/projects/:code/plan` sub-route → mirrors the existing `#/projects/detail/:code` 3-segment hash handler at router.js:373-382.
- **Multi-select assignees picker on task modal** → mirrors `renderPersonnelPills` + dropdown filter pattern at project-detail.js:496-576.
- **Right-click context menu on task bar (Claude's discretion alternative)** → mirrors `showRFPContextMenu` at procurement.js:504-549 (Phase 65.10).

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `app/views/project-plan.js` (NEW) | view module (full-screen split-pane) | onSnapshot + drag/drop writes + modal CRUD | `app/views/project-detail.js` (param-driven full-page view) + `app/views/finance.js` (modal-heavy multi-section view + Chart.js init pattern from `app/views/home.js`) | role-match (composite) |
| `app/task-id.js` (NEW) | utility (sequential ID generator) | one-shot getDocs read | `app/coll-id.js` (Phase 85 D-20 — project-scoped collectible ID) | **exact** (purpose + signature mirror) |
| `app/views/project-detail.js` (MOD) | view (insert Project Plan summary card + new onSnapshot listener) | onSnapshot + render aggregation | `app/views/project-detail.js` itself — Financial Summary card (lines 379-449) + currentExpense aggregation (lines 17-19, 770-810) | **exact** (same file, mirror existing card) |
| `firestore.rules` (MOD) | security rules block for `project_tasks` collection | declarative | `firestore.rules` lines 6-39 (ADDING NEW COLLECTIONS template), 200-233 (projects), 255-277 (mrfs project-scoped read), 461-478 (Phase 85 collectibles, the most recent precedent), 491-517 (notifications two-tier update via `affectedKeys().hasOnly()`) | **exact** (same file, multiple precedents) |
| `index.html` (MOD) | CDN script + CSS link insertion | static markup | `index.html` line 17-18 (Chart.js v4.4.7 pinned, Phase 77.1) | **exact** (identical pattern) |
| `app/router.js` (MOD) | new sub-route `/projects/:code/plan` registration + parser branch | hash-based routing | `app/router.js` lines 33-110 (route table), 116-129 (parseHash for 3-segment URLs), 369-385 (handleHashChange detail-route branching) | **exact** (same file) |
| `app/views/services.js` / `service-detail.js` | n/a — NOT modified (D-04 projects-only) | — | — | n/a |
| `app/notifications.js` | n/a — NOT modified (D-17 no notifications this phase) | — | — | n/a |

> **Why `app/views/project-plan.js` is composite-match:** No single existing view is a full split-pane Gantt. We borrow:
> - **Param-driven full-page view** structure from `project-detail.js` (`render(activeTab, param)` + `init(activeTab, param)` + `destroy()`).
> - **External library lifecycle** (CDN-loaded `window.X` global, instance held in module state, `.destroy()` on view exit) from `home.js` Chart.js handling at `chartInstances` Map.
> - **Modal-heavy CRUD** + filter-state independence + window-function attach/detach from `finance.js` (Payables tab, Collectibles tab).
> - **Pill multi-select picker** from `project-detail.js` `renderPersonnelPills` for the assignees dropdown.

---

## Pattern Assignments

### `app/views/project-plan.js` (NEW — full-screen split-pane plan view)

**Composite analogs:** `app/views/project-detail.js` (param-driven view shape), `app/views/home.js` (Chart.js external-lib lifecycle), `app/views/finance.js` (modal CRUD + filters), `app/views/project-detail.js` (personnel pill picker).

#### Pattern 1: Module header + imports

`C:\Users\franc\dev\projects\pr-po\app\views\project-detail.js` lines 1-10:
```javascript
/* ========================================
   PROJECT DETAIL VIEW
   Full-page project detail with inline editing
   ======================================== */

import { db, collection, doc, getDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, writeBatch, getAggregateFromServer, sum, count } from '../firebase.js';
import { formatCurrency, formatDate, showLoading, showToast, normalizePersonnel, syncPersonnelToAssignments, downloadCSV, escapeHTML, generateProjectCode } from '../utils.js';
import { showExpenseBreakdownModal } from '../expense-modal.js';
import { recordEditHistory, showEditHistoryModal } from '../edit-history.js';
import { createNotificationForUsers, NOTIFICATION_TYPES } from '../notifications.js';
```

**Phase 86 imports for `project-plan.js`:**
```javascript
/* ========================================
   PROJECT PLAN VIEW
   Full-screen split-pane: hierarchical task list (left) + Frappe Gantt (right).
   Drag-edit dates/progress, FS dependencies, milestones, weighted progress rollup.
   ======================================== */

import { db, collection, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, writeBatch, serverTimestamp } from '../firebase.js';
import { formatDate, showLoading, showToast, normalizePersonnel, escapeHTML } from '../utils.js';
import { generateTaskId } from '../task-id.js';
// NO notifications import (D-17 — no notifications this phase)
// NO edit-history import (Deferred — task edit history captured in Deferred Ideas)
```

#### Pattern 2: Module-scope state + listeners array (CLAUDE.md SPA pattern)

`C:\Users\franc\dev\projects\pr-po\app\views\project-detail.js` lines 12-24:
```javascript
let currentProject = null;
let projectCode = null;
let listener = null;
let usersData = [];
let usersListenerUnsub = null;
let currentExpense = { total: 0, poCount: 0, trCount: 0, totalPaid: 0, remainingPayable: 0, hasRfps: false };
// Phase 85 D-06: collectibles aggregation alongside currentExpense
let currentCollectibles = { totalRequested: 0, totalCollected: 0, remainingCollectible: 0 };
let detailSelectedPersonnel = [];
let personnelClickOutsideHandler = null;
```

`C:\Users\franc\dev\projects\pr-po\app\views\home.js` lines 22-39 (multi-listener + external-lib instance registry):
```javascript
let statsListeners = [];
let cachedStats = { activeMRFs: null, /* ... */ };
// Phase 77.1 — Chart.js instance registry: containerId → Chart instance
const chartInstances = new Map();
```

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 124-136 (Phase 65.1 independent-filter pattern):
```javascript
// Filter state (D-03 — independence pattern from Phase 65.1)
let collProjectFilter = '';
let collStatusFilter = '';
let collDeptFilter = '';
let collDueFromFilter = '';
let collDueToFilter = '';
let collCurrentPage = 1;
const collItemsPerPage = 15;
```

**Phase 86 — `project-plan.js` state shape:**
```javascript
// Project + URL param
let currentProject = null;       // full project doc
let projectCode = null;          // URL :code param
let projectId = null;            // Firestore doc id, set after project lookup

// Real-time data
let tasks = [];                  // all project_tasks for this project (flat array)
let tasksById = new Map();       // task_id -> task doc, for O(1) lookup
let tasksByParent = new Map();   // parent_task_id (or '__ROOT__') -> [child task] for tree build
let users = [];                  // active users from project.personnel_user_ids only (D-16)

// Lifecycle
let listeners = [];              // onSnapshot unsubs, cleared in destroy()
let gantt = null;                // Frappe Gantt instance (window.Gantt(...))
let collapsedParentIds = new Set(); // chevron collapse/expand state — module-scope, NOT persisted (UI-SPEC interaction contract)

// Filters (Phase 65.1 independence pattern — D-21)
let filterDateFrom = '';         // 'YYYY-MM-DD' or ''
let filterDateTo = '';
let filterAssigneeIds = [];      // array of UIDs

// Modal-edit state
let editingTaskId = null;        // null = Add mode; task_id = Edit mode
let modalSelectedAssignees = []; // [{ id, name }] mirror of detailSelectedPersonnel pattern
let modalSelectedDependencies = []; // array of task_ids for the dep multi-select
let modalClickOutsideHandler = null;

// Zoom state (D-07)
let currentZoom = 'Week';        // 'Day' | 'Week' | 'Month' — module-scope, NOT URL-synced
```

#### Pattern 3: render(activeTab, param) — initial loading shell, then render-on-data

`C:\Users\franc\dev\projects\pr-po\app\views\project-detail.js` lines 39-52:
```javascript
export function render(activeTab = null, param = null) {
    return `
        <div id="projectDetailContainer">
            <div class="container" style="margin-top: 2rem;">
                <div class="card">
                    <div class="card-body" style="text-align: center; padding: 3rem;">
                        <p style="color: #64748b;">Loading project details...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}
```

**Phase 86 — same shape, container id `#projectPlanContainer`. Real markup is rendered by `renderPlanView()` after `init()` resolves the project doc.**

#### Pattern 4: init(activeTab, param) — param + listener wire-up + access guard

`C:\Users\franc\dev\projects\pr-po\app\views\project-detail.js` lines 55-191:
```javascript
export async function init(activeTab = null, param = null) {
    projectCode = param;
    attachWindowFunctions();

    // Click-outside handler to close personnel dropdown
    personnelClickOutsideHandler = (e) => { /* ... */ };
    document.addEventListener('mousedown', personnelClickOutsideHandler);

    // Listen for permission changes and re-render
    const permissionChangeHandler = () => { renderProjectDetail(); };
    window.addEventListener('permissionsChanged', permissionChangeHandler);
    if (!window._projectDetailPermissionHandler) {
        window._projectDetailPermissionHandler = permissionChangeHandler;
    }

    // Phase 7: Re-check access when assignments change
    const assignmentChangeHandler = () => {
        if (currentProject) { checkProjectAccess(); }
    };
    window.addEventListener('assignmentsChanged', assignmentChangeHandler);
    // ...

    if (!projectCode) { /* render "No project specified" empty state */ return; }

    // Load active users for personnel datalist
    const usersQuery = query(collection(db, 'users'), where('status', '==', 'active'));
    usersListenerUnsub = onSnapshot(usersQuery, (snapshot) => {
        usersData = [];
        snapshot.forEach(doc => { /* push */ });
        usersData.sort((a, b) => a.full_name.localeCompare(b.full_name));
    });

    // Phase 78 D-06: project_code lookup, then doc-id fallback
    const q = query(collection(db, 'projects'), where('project_code', '==', projectCode));
    listener = onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) { /* doc-id fallback */ return; }
        currentProject = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        if (checkProjectAccess()) { renderProjectDetail(); }
    });
}
```

**Phase 86 — `init()` for `project-plan.js`:**
1. Set `projectCode = param`; attach window functions.
2. Run **clientless-project block** (D-19): if `currentProject.project_code` is null, render the block message and return without subscribing to `project_tasks`.
3. Lookup project by `project_code` (mirror lines 122-156, doc-id fallback).
4. Run `checkProjectAccess()` (mirror lines 256-292) — operations_user must be in `assigned_project_codes`.
5. Subscribe to `project_tasks where project_id == currentProject.id` (push unsub to `listeners[]`).
6. Subscribe to `users where __name__ in [project.personnel_user_ids]` for the assignee picker (D-16).
7. After first task snapshot fires, call `renderPlanView()` to build the split-pane HTML, then `initGantt()` to instantiate Frappe Gantt and scroll-to-today (D-09).
8. Tasks listener callback: rebuild `tasksById`, `tasksByParent`, recompute parent dates (D-11) + parent.progress derive-on-read (D-12), call `gantt.refresh(tasks)` and `renderTaskTree()`.

#### Pattern 5: destroy() — listener cleanup + window function deletion + external-lib teardown

`C:\Users\franc\dev\projects\pr-po\app\views\project-detail.js` lines 194-246:
```javascript
export async function destroy() {
    if (window._projectDetailPermissionHandler) {
        window.removeEventListener('permissionsChanged', window._projectDetailPermissionHandler);
        delete window._projectDetailPermissionHandler;
    }
    // ...
    if (listener) { listener(); listener = null; }
    if (usersListenerUnsub) { usersListenerUnsub(); usersListenerUnsub = null; }
    usersData = [];

    if (personnelClickOutsideHandler) {
        document.removeEventListener('mousedown', personnelClickOutsideHandler);
        personnelClickOutsideHandler = null;
    }
    detailSelectedPersonnel = [];

    currentProject = null;
    projectCode = null;
    // ... reset other state ...

    delete window.saveField;
    delete window.toggleActive;
    // ... delete every window.X attached in init ...
}
```

`C:\Users\franc\dev\projects\pr-po\app\views\home.js` lines 458-477 (Chart.js teardown — mirror for Frappe Gantt):
```javascript
export async function destroy() {
    statsListeners.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') { unsubscribe(); }
    });
    statsListeners = [];

    // Phase 77.1 — destroy Chart.js instances and clear the registry
    chartInstances.forEach(chart => {
        if (chart && typeof chart.destroy === 'function') { chart.destroy(); }
    });
    chartInstances.clear();
}
```

**Phase 86 — `destroy()` for `project-plan.js`:**
```javascript
export async function destroy() {
    listeners.forEach(unsub => unsub?.());
    listeners = [];

    // Frappe Gantt teardown — research the exact API; if no .destroy(), null the ref so GC can reclaim.
    // Frappe Gantt 1.x exposes no public destroy; manually clear the SVG container.
    if (gantt) {
        const container = document.querySelector('.gantt-pane svg');
        if (container) container.remove();
        gantt = null;
    }

    if (modalClickOutsideHandler) {
        document.removeEventListener('mousedown', modalClickOutsideHandler);
        modalClickOutsideHandler = null;
    }

    // Reset module state so re-mount starts clean
    currentProject = null;
    projectCode = null;
    projectId = null;
    tasks = [];
    tasksById.clear();
    tasksByParent.clear();
    users = [];
    collapsedParentIds.clear();
    filterDateFrom = filterDateTo = '';
    filterAssigneeIds = [];
    editingTaskId = null;
    modalSelectedAssignees = [];
    modalSelectedDependencies = [];
    currentZoom = 'Week';

    // Delete every window.fn attached in init
    delete window.openTaskModal;
    delete window.closeTaskModal;
    delete window.saveTask;
    delete window.deleteTask;
    delete window.confirmDeleteTask;
    delete window.toggleTaskCollapse;
    delete window.selectTaskRow;
    delete window.changePlanZoom;
    delete window.applyPlanFilters;
    delete window.clearPlanFilters;
    delete window.toggleFiltersPanel;
    delete window.selectModalAssignee;
    delete window.removeModalAssignee;
    delete window.filterModalAssigneesDropdown;
    delete window.toggleModalDependency;
    // remove modal nodes if any leaked
    document.getElementById('taskFormModal')?.remove();
    document.getElementById('deleteTaskConfirmModal')?.remove();
}
```

#### Pattern 6: External-library global init + instance registry (Frappe Gantt mirrors Chart.js)

`C:\Users\franc\dev\projects\pr-po\app\views\home.js` lines 177-257:
```javascript
function renderStatusBreakdown(containerId, countsMap) {
    const canvas = document.getElementById(containerId);
    if (!canvas) return;
    if (typeof window.Chart !== 'function') {
        console.error('[Home] Chart.js not loaded — verify CDN script tag in index.html');
        return;
    }
    // ... build datasets ...
    const existing = chartInstances.get(containerId);
    if (existing) {
        // Update in place — update each dataset's percentage
        existing.update();
        return;
    }
    // First render — instantiate
    const chart = new window.Chart(canvas, { /* config */ });
    chartInstances.set(containerId, chart);
}
```

**Phase 86 — Frappe Gantt instantiation (mirror, single instance per view):**
```javascript
function initGantt() {
    const wrapper = document.querySelector('.gantt-pane');
    if (!wrapper) return;
    if (typeof window.Gantt !== 'function') {
        console.error('[Plan] Frappe Gantt not loaded — verify CDN script in index.html');
        return;
    }

    const ganttTasks = tasks.map(t => ({
        id: t.task_id,
        name: t.name,
        start: t.start_date,
        end: t.end_date,
        progress: t.progress || 0,
        dependencies: (t.dependencies || []).join(','),
        custom_class: t.is_milestone
            ? 'milestone-marker'
            : (tasksByParent.get(t.task_id) ? 'parent-summary-bar' : '')
    }));

    gantt = new window.Gantt(wrapper, ganttTasks, {
        view_mode: currentZoom,            // 'Day' | 'Week' | 'Month'
        date_format: 'YYYY-MM-DD',
        on_date_change: (task, start, end) => onTaskDateChange(task.id, start, end),
        on_progress_change: (task, progress) => onTaskProgressChange(task.id, progress),
        on_click: (task) => openTaskModal(task.id),
    });

    // D-09 today line + auto-scroll-to-today (after Frappe renders)
    drawTodayLine();
    scrollGanttToToday();
}
```

#### Pattern 7: Window function attach/detach for onclick handlers (CLAUDE.md SPA pattern)

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 235-329 (heavy onclick surface):
```javascript
function attachWindowFunctions() {
    window.refreshPRs = refreshPRs;
    window.viewPRDetails = viewPRDetails;
    window.approveTR = approveTR;
    // ... 40+ assignments ...
    window.openCreateCollectibleModal = openCreateCollectibleModal;
    window.submitCollectible = submitCollectible;
    // debounced search functions
    window.debouncedProjectExpenseSearch = debounce(() => { /* ... */ }, 300);
}
```

**Phase 86 — window functions for `project-plan.js`:**
```javascript
function attachWindowFunctions() {
    // Modal lifecycle
    window.openTaskModal = openTaskModal;          // (taskId | null) for Add vs Edit
    window.closeTaskModal = closeTaskModal;
    window.saveTask = saveTask;
    window.deleteTask = (taskId) => promptDeleteTask(taskId);
    window.confirmDeleteTask = confirmDeleteTask;

    // Tree interactions
    window.toggleTaskCollapse = toggleTaskCollapse; // (taskId)
    window.selectTaskRow = selectTaskRow;           // (taskId) — left-rail row click → scroll-sync Gantt

    // Toolbar
    window.changePlanZoom = changePlanZoom;         // ('Day'|'Week'|'Month')
    window.toggleFiltersPanel = toggleFiltersPanel;
    window.applyPlanFilters = applyPlanFilters;
    window.clearPlanFilters = clearPlanFilters;

    // Modal — assignee picker (mirror project-detail personnel pills)
    window.selectModalAssignee = selectModalAssignee;
    window.removeModalAssignee = removeModalAssignee;
    window.filterModalAssigneesDropdown = filterModalAssigneesDropdown;
    window.showModalAssigneesDropdown = showModalAssigneesDropdown;

    // Modal — dependency multi-select
    window.toggleModalDependency = toggleModalDependency;
}
```

#### Pattern 8: Real-time onSnapshot data fetch + derive-on-read (Phase 65 D-44 / Phase 85 D-19)

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 34-43 (status NEVER stored, derived on read):
```javascript
function deriveRFPStatus(rfp) {
    const totalPaid = (rfp.payment_records || [])
        .filter(r => r.status !== 'voided')
        .reduce((s, r) => s + (r.amount || 0), 0);
    const isOverdue = rfp.due_date && new Date(rfp.due_date) < new Date();
    if (totalPaid >= rfp.amount_requested && rfp.amount_requested > 0) return 'Fully Paid';
    if (isOverdue) return 'Overdue';
    if (totalPaid > 0) return 'Partially Paid';
    return 'Pending';
}
```

`C:\Users\franc\dev\projects\pr-po\app\firebase.js` (CLAUDE.md "Real-time Data Pattern"):
```javascript
onSnapshot(collection(db, 'mrfs'), (snapshot) => {
    mrfsData = [];
    snapshot.forEach(doc => mrfsData.push({ id: doc.id, ...doc.data() }));
    renderMRFsTable();
});
```

**Phase 86 — derive-on-read parent.progress (D-12, weighted by leaf duration):**
```javascript
/**
 * Compute weighted progress across leaves of a given parent (or whole project if parentId === null).
 * D-12: progress = sum(leaf.progress * leaf.duration_days) / sum(leaf.duration_days).
 * Edge cases: empty project → 0; single 0-duration milestone → 100 if progress=100, else 0.
 */
function computeWeightedProgress(parentId) {
    const leaves = collectLeafDescendants(parentId);
    if (leaves.length === 0) return 0;
    let weightedSum = 0;
    let totalDuration = 0;
    for (const leaf of leaves) {
        const duration = Math.max(1, daysBetween(leaf.start_date, leaf.end_date));
        weightedSum += (leaf.progress || 0) * duration;
        totalDuration += duration;
    }
    if (totalDuration === 0) {
        // Single 0-duration milestone case
        return leaves.every(l => (l.progress || 0) === 100) ? 100 : 0;
    }
    return Math.round(weightedSum / totalDuration);
}

/**
 * Compute parent.start_date = min(children.start_date), parent.end_date = max(children.end_date) — D-11.
 * Used both for derive-on-read display AND for the read-modify-write parent recompute on child save.
 */
function computeParentDates(parentTaskId) {
    const children = tasksByParent.get(parentTaskId) || [];
    if (children.length === 0) return null;
    const starts = children.map(c => c.start_date).sort();
    const ends = children.map(c => c.end_date).sort();
    return { start_date: starts[0], end_date: ends[ends.length - 1] };
}
```

**Tasks listener callback shape (mirrors mrfsData pattern):**
```javascript
const tasksListener = onSnapshot(
    query(collection(db, 'project_tasks'), where('project_id', '==', projectId)),
    (snapshot) => {
        tasks = [];
        tasksById.clear();
        tasksByParent.clear();
        snapshot.forEach(d => {
            const task = { id: d.id, ...d.data() };
            tasks.push(task);
            tasksById.set(task.task_id, task);
            const parentKey = task.parent_task_id || '__ROOT__';
            if (!tasksByParent.has(parentKey)) tasksByParent.set(parentKey, []);
            tasksByParent.get(parentKey).push(task);
        });
        // Sort each level by start_date asc (D-Discretion default)
        for (const arr of tasksByParent.values()) {
            arr.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
        }
        renderTaskTree();
        if (gantt) {
            // Refresh visible tasks after filters applied
            const visible = filterTasks(tasks);
            gantt.refresh(toGanttTasks(visible));
        } else {
            initGantt();
        }
        renderHighlights(); // for summary card if present, but project-detail.js owns its own listener
    },
    (err) => console.error('[Plan] Tasks listener error:', err)
);
listeners.push(tasksListener);
```

#### Pattern 9: Modal-based edit form (open / close / submit) — finance.js Record-Payment modal as the analog

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 421-462 (Record Payment modal, dynamically inserted):
```javascript
const modalHtml = `
<div id="recordPaymentModal" class="modal" style="display:flex;">
    <div class="modal-content" style="max-width:480px;margin:auto;">
        <div class="modal-header">
            <h2 style="font-size:1.125rem;font-weight:600;">Record Payment &mdash; ${escapeHTML(rfp.rfp_id)}</h2>
            <button class="modal-close" onclick="document.getElementById('recordPaymentModal').remove()">&times;</button>
        </div>
        <div class="modal-body" style="padding:1.5rem;">
            <!-- form fields -->
        </div>
        <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:1rem 1.5rem;border-top:1px solid #e5e7eb;">
            ${footerHtml}
        </div>
    </div>
</div>`;

const existing = document.getElementById('recordPaymentModal');
if (existing) existing.remove();
document.body.insertAdjacentHTML('beforeend', modalHtml);
```

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 468-527 (submit handler — write + toast + close):
```javascript
async function submitPaymentRecord(rfpDocId) {
    const rfp = rfpsData.find(r => r.id === rfpDocId);
    if (!rfp) { showToast('RFP not found', 'error'); return; }
    const paymentDate = document.getElementById('paymentDate')?.value;
    if (!paymentDate) { /* inline error */ return; }

    try {
        await updateDoc(doc(db, 'rfps', rfpDocId), { payment_records: arrayUnion(paymentRecord) });
        document.getElementById('recordPaymentModal')?.remove();
        showToast(`Payment recorded for ${rfp.rfp_id}`, 'success');
    } catch (error) {
        console.error('[Finance] Payment record error:', error);
        // surface error in modal
    }
}
```

**Phase 86 — Add/Edit Task modal (UI-SPEC `#taskFormModal`) follows the same shape:**
- One DOM template generated by `renderTaskFormModal(taskId | null)`.
- Header: "Add Task" or "Edit Task — {task.name}" (UI-SPEC copy).
- Body: form fields — name, description, start_date (`<input type="date">`), end_date, parent dropdown, is_milestone checkbox, dependencies multi-select, assignees pill picker.
- For tasks with children: date inputs `disabled` + helper text "Computed from subtasks" (UI-SPEC + D-11).
- Footer: Cancel + Save Task (`window.saveTask()`).
- `saveTask()` validates → cycle-detects (D-13) → addDoc / updateDoc → recompute + writeDoc parent dates (D-11) → close modal → toast.
- Mount via `document.body.insertAdjacentHTML('beforeend', modalHtml)`; remove in close handler (mirror finance.js `recordPaymentModal` lifecycle).

#### Pattern 10: Multi-select pill picker for assignees (mirror personnel pills)

`C:\Users\franc\dev\projects\pr-po\app\views\project-detail.js` lines 496-576 (renderPersonnelPills + filter dropdown + select / remove handlers):
```javascript
function renderPersonnelPills(showEditControls) {
    const pillsHtml = detailSelectedPersonnel.map(user => `
        <span class="personnel-pill ${user.id ? '' : 'legacy'}" data-user-id="${escapeHTML(user.id || '')}">
            ${escapeHTML(user.name)}
            ${showEditControls ? `<button type="button" class="pill-remove"
                onmousedown="event.preventDefault(); window.removeDetailPersonnel('${user.id || ''}', '${user.name.replace(/'/g, "\\'")}')">&times;</button>` : ''}
        </span>
    `).join('');
    return `
        <div class="form-group" style="margin-bottom: 0; position: relative;">
            <label style="margin-bottom: 0.25rem;">Assigned Personnel</label>
            <div class="pill-input-container" id="detailPillContainer"
                 onclick="document.getElementById('detailPersonnelSearch')?.focus()">
                ${pillsHtml}
                <input type="text"
                       class="pill-search-input"
                       id="detailPersonnelSearch"
                       placeholder="${detailSelectedPersonnel.length === 0 ? 'Type name or email...' : ''}"
                       oninput="window.filterDetailPersonnel(this.value)"
                       onfocus="window.showDetailPersonnelDropdown()"
                       autocomplete="off">
            </div>
            <div class="pill-dropdown" id="detailPersonnelDropdown" style="display: none;"></div>
        </div>`;
}

function filterDetailPersonnel(searchText) {
    const dropdown = document.getElementById('detailPersonnelDropdown');
    const term = searchText.toLowerCase().trim();
    const selectedIds = detailSelectedPersonnel.map(u => u.id).filter(Boolean);
    const matches = term ? usersData.filter(user =>
        !selectedIds.includes(user.id) &&
        (user.full_name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term))
    ) : [];
    dropdown.innerHTML = matches.slice(0, 10).map(user => `
        <div class="pill-dropdown-item"
             onmousedown="event.preventDefault(); window.selectDetailPersonnel('${user.id}', '${user.full_name.replace(/'/g, "\\'")}')">
            <strong>${escapeHTML(user.full_name)}</strong>
            <span style="color: #64748b; margin-left: 0.5rem;">${escapeHTML(user.email)}</span>
        </div>
    `).join('');
    dropdown.style.display = matches.length > 0 ? 'block' : 'none';
}
```

**Phase 86 — modal assignees picker = exact mirror with these changes:**
- Source array is `users` (filtered to `project.personnel_user_ids` per D-16), NOT global `usersData`.
- Module-scope state: `modalSelectedAssignees` instead of `detailSelectedPersonnel`.
- Save target: form field "assignees" array, NOT direct Firestore write — write happens only on Save Task button.
- IDs `taskAssigneePillContainer`, `taskAssigneeSearch`, `taskAssigneeDropdown` (avoid clash with project-detail's IDs since both views may live in the SPA).

#### Pattern 11: Dependency cycle detection (D-13) — derive-on-validate, no analog in codebase

There is **no existing cycle-detection helper** in the codebase. Build inline DFS in `project-plan.js`:
```javascript
/**
 * D-13 cycle detection: for a candidate `taskId` with proposed `dependencies = [...]`,
 * walk transitively forward through `dependencies` and report any cycle path.
 * Returns null if acyclic, or { cycle: [taskA.name, taskB.name, ..., taskA.name] } if found.
 */
function detectCycle(taskId, proposedDeps) {
    // Build adjacency map: each task_id -> [dep task_ids], overlaying our proposed update
    const adj = new Map();
    for (const t of tasks) {
        adj.set(t.task_id, [...(t.dependencies || [])]);
    }
    adj.set(taskId, [...proposedDeps]);

    // DFS from each dep, check if we can reach taskId
    for (const startDep of proposedDeps) {
        const visited = new Set();
        const stack = [{ id: startDep, path: [taskId, startDep] }];
        while (stack.length > 0) {
            const { id, path } = stack.pop();
            if (id === taskId) {
                return { cycle: path.map(tid => tasksById.get(tid)?.name || tid) };
            }
            if (visited.has(id)) continue;
            visited.add(id);
            const next = adj.get(id) || [];
            for (const n of next) {
                stack.push({ id: n, path: [...path, n] });
            }
        }
    }
    return null;
}
```
This is greenfield logic — RESEARCH.md is intentionally absent, but the pattern is standard DFS-based cycle detection on a directed graph.

#### Pattern 12: Filter independence (Phase 65.1) + filter application

`C:\Users\franc\dev\projects\pr-po\app\views\finance.js` lines 124-136 + 188-194 (filter state + application):
```javascript
let collProjectFilter = '';
let collStatusFilter = '';
let collDeptFilter = '';
let collDueFromFilter = '';
let collDueToFilter = '';

function applyFinanceDeptFilter(value) {
    activeDeptFilter = value;
    renderMaterialPRs();
    renderTransportRequests();
    renderPOs();
}
```

**Phase 86 — filter application:**
```javascript
function filterTasks(allTasks) {
    return allTasks.filter(t => {
        // D-21 (1) date range overlap
        if (filterDateFrom && t.end_date < filterDateFrom) return false;
        if (filterDateTo && t.start_date > filterDateTo) return false;
        // D-21 (2) assigned personnel multi-select
        if (filterAssigneeIds.length > 0) {
            const hit = (t.assignees || []).some(uid => filterAssigneeIds.includes(uid));
            if (!hit) return false;
        }
        return true;
    });
}

function applyPlanFilters() {
    filterDateFrom = document.getElementById('planFilterDateFrom')?.value || '';
    filterDateTo = document.getElementById('planFilterDateTo')?.value || '';
    // assignees pulled from a separate multi-select state
    renderTaskTree();
    if (gantt) gantt.refresh(toGanttTasks(filterTasks(tasks)));
}
```

#### Pattern 13: Permission guard at JS layer (mirror project-detail.js saveField)

`C:\Users\franc\dev\projects\pr-po\app\views\project-detail.js` lines 666-672:
```javascript
async function saveField(fieldName, newValue) {
    // Guard: check edit permission
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return false;
    }
    // ...
}
```

**Phase 86 — D-14/D-15 dual-tier permission guard:**
```javascript
function canEditTask(task) {
    const user = window.getCurrentUser?.();
    if (!user) return false;
    if (['super_admin', 'operations_admin'].includes(user.role)) return true;
    if (user.role === 'operations_user') {
        // D-14: ops_user assigned to project can edit any task
        const codes = window.getAssignedProjectCodes?.() ?? null;
        if (codes === null) return true;  // all_projects
        return codes.includes(currentProject?.project_code);
    }
    return false;  // services_*, finance, procurement → read-only
}

function canUpdateTaskProgress(task) {
    // D-15: stricter — must be admin OR explicitly in task.assignees
    const user = window.getCurrentUser?.();
    if (!user) return false;
    if (['super_admin', 'operations_admin'].includes(user.role)) return true;
    return (task.assignees || []).includes(user.uid);
}
```

#### Pattern 14: Right-click context menu (Claude's Discretion fallback per Deferred Ideas)

`C:\Users\franc\dev\projects\pr-po\app\views\procurement.js` lines 504-549:
```javascript
function showRFPContextMenu(event, poDocId) {
    const existing = document.getElementById('rfpContextMenu');
    if (existing) existing.remove();
    const menu = document.createElement('div');
    menu.id = 'rfpContextMenu';
    menu.style.cssText = `position:fixed;left:${event.clientX}px;top:${event.clientY}px;background:white;border:1px solid #e5e7eb;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:4px 0;z-index:10000;min-width:180px;`;
    menu.innerHTML = `
        <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#1e293b;"
             onmouseenter="this.style.background='#eff6ff'"
             onmouseleave="this.style.background='transparent'"
             onclick="window.openRFPModal('${poDocId}')">
            Request Payment
        </div>
        <!-- ... more items ... -->
    `;
    document.body.appendChild(menu);
    setTimeout(() => {
        document.addEventListener('click', function handler() {
            menu.remove();
            document.removeEventListener('click', handler);
        }, { once: true });
    }, 10);
}
```

**Phase 86:** Phase 86 ships with form-picker only per D-13 (NO context menu). This pattern is captured here only for the **Deferred Ideas** "right-click context menu on Gantt bar" item — if user feedback drives that follow-up, mirror this exact shape.

---

### `app/task-id.js` (NEW — project-scoped sequential ID generator)

**Analog:** `app/coll-id.js` (Phase 85 D-20)

`C:\Users\franc\dev\projects\pr-po\app\coll-id.js` lines 1-62 (entire file, the closest possible match):
```javascript
/* ========================================
   COLLECTIBLE ID GENERATOR (Phase 85 — D-20)
   Project-scoped sequential ID for collectibles documents.
   Format: COLL-{PROJECT_CODE}-{n}  for project-side collectibles
           COLL-{SERVICE_CODE}-{n}  for service-side collectibles
   n is monotonically increasing per scope, no zero-padding.
   PRECONDITION: scopeCode must be non-empty.
   ======================================== */

import { db, collection, query, where, getDocs } from './firebase.js';

export async function generateCollectibleId(scopeCode, dept) {
    if (!scopeCode || typeof scopeCode !== 'string') {
        throw new Error('generateCollectibleId: scopeCode must be a non-empty string');
    }
    if (dept !== 'projects' && dept !== 'services') {
        throw new Error(`generateCollectibleId: dept must be 'projects' or 'services' (got: ${dept})`);
    }

    const scopeField = dept === 'projects' ? 'project_code' : 'service_code';
    const snap = await getDocs(
        query(collection(db, 'collectibles'), where(scopeField, '==', scopeCode))
    );

    let maxNum = 0;
    snap.forEach(docSnap => {
        const id = docSnap.data().coll_id;
        if (id && typeof id === 'string') {
            const lastDash = id.lastIndexOf('-');
            if (lastDash >= 0) {
                const seqStr = id.slice(lastDash + 1);
                const num = parseInt(seqStr, 10);
                if (!isNaN(num) && num > maxNum) maxNum = num;
            }
        }
    });

    return `COLL-${scopeCode}-${maxNum + 1}`;
}
```

**Phase 86 — `app/task-id.js` (near-identical, simpler — projects-only per D-04):**
```javascript
/* ========================================
   TASK ID GENERATOR (Phase 86 — D-19)

   Project-scoped sequential ID for project_tasks documents.
   Format: TASK-{PROJECT_CODE}-{n}
   n is monotonically increasing per project, no zero-padding.

   Examples:
     TASK-CLMC-ACME-001-1
     TASK-CLMC-ACME-001-2
     TASK-CLMC-ACME-001-12

   WHY NOT the year-counter helper from utils.js?
     Phase 65.4 lesson learned: shared year-counter (`PREFIX-YYYY-###`)
     caused collisions when two writes raced inside the same second.
     Per-project counters do not collide because each project_code has
     its own independent sequence space (D-19).

   PRECONDITION: projectCode must be non-empty. For Phase 78 clientless
   projects (no project_code yet), the caller must BLOCK task creation
   in the UI BEFORE invoking this function — see Phase 86 D-19
   clientless block message.
   ======================================== */

import { db, collection, query, where, getDocs } from './firebase.js';

/**
 * Generate a new task ID, scoped to a single project_code.
 * @param {string} projectCode - Non-empty project_code
 * @returns {Promise<string>} New unique task ID, e.g. "TASK-CLMC-ACME-001-3"
 * @throws {Error} If projectCode is empty
 */
export async function generateTaskId(projectCode) {
    if (!projectCode || typeof projectCode !== 'string') {
        throw new Error('generateTaskId: projectCode must be a non-empty string');
    }

    const snap = await getDocs(
        query(collection(db, 'project_tasks'), where('project_code', '==', projectCode))
    );

    let maxNum = 0;
    snap.forEach(docSnap => {
        const id = docSnap.data().task_id;
        if (id && typeof id === 'string') {
            const lastDash = id.lastIndexOf('-');
            if (lastDash >= 0) {
                const seqStr = id.slice(lastDash + 1);
                const num = parseInt(seqStr, 10);
                if (!isNaN(num) && num > maxNum) maxNum = num;
            }
        }
    });

    return `TASK-${projectCode}-${maxNum + 1}`;
}
```

**Doc-id strategy (D-19):** task_id IS the doc id. Use `setDoc(doc(db, 'project_tasks', taskId), {...})` instead of `addDoc`. Mirrors how mrf_id is the doc id for `mrfs` collection.

---

### `app/views/project-detail.js` (MOD — insert "Project Plan" summary card + tasks listener)

**Analog:** `app/views/project-detail.js` itself — Status & Assignment card (insertion site) + Financial Summary card (card-internal layout reference) + currentExpense listener wiring (Phase 85 D-06 pattern at lines 17-19 + extended snapshot listener).

#### Pattern 15: Card insertion site

`C:\Users\franc\dev\projects\pr-po\app\views\project-detail.js` lines 451-479:
```javascript
            <!-- Card 3 - Status & Assignment -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body" style="padding: 1.5rem;">
                    <h3 style="margin: 0 0 1rem 0; font-size: 1.125rem; font-weight: 600;">Status & Assignment</h3>

                    <div class="form-group" style="margin-bottom: 0;">
                        <label style="margin-bottom: 0.25rem;">Status</label>
                        <select data-field="project_status" onchange="window.saveField('project_status', this.value)" ${!showEditControls ? 'disabled' : ''}>
                            <!-- options -->
                        </select>
                    </div>
                </div>
            </div>

            <!-- Delete Button (Below All Cards) -->
            ${showEditControls ? `
                <div style="text-align: center; margin-top: 2rem; padding-bottom: 2rem;">
                    <button class="btn btn-danger" onclick="window.confirmDelete()">Delete Project</button>
                </div>
            ` : ''}
```

**Phase 86 — insert NEW card AFTER `<!-- Card 3 - Status & Assignment -->` and BEFORE `<!-- Delete Button -->` (around line 472).**

#### Pattern 16: Project Plan summary card markup (mirror Financial Summary internal grid)

`C:\Users\franc\dev\projects\pr-po\app\views\project-detail.js` lines 379-449 (Financial Summary card — internal `repeat(2, 1fr)` grid + always-rendered cells):
```javascript
            <!-- Card 2 - Financial Summary -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body" style="padding: 1.5rem;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
                        <h3 style="margin: 0; font-size: 1.125rem; font-weight: 600;">Financial Summary</h3>
                        <!-- Export CSV button -->
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Paid</label>
                            <div style="font-weight: 600; color: #059669; font-size: 1.125rem;">
                                ${formatCurrency(currentExpense.totalPaid)}
                            </div>
                        </div>
                        <!-- ... more cells, always rendered (Phase 75 zero-state pattern) ... -->
                    </div>
                </div>
            </div>
```

**Phase 86 — Project Plan summary card (UI-SPEC Layout Contract — top stats row 2-col grid + Highlights row 3-col grid + full-width "Open Plan" CTA):**
```javascript
            <!-- Card 4 - Project Plan (Phase 86) -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body" style="padding: 1.5rem;">
                    <h3 style="margin: 0 0 1rem 0; font-size: 1.125rem; font-weight: 600;">Project Plan</h3>

                    ${currentTasks.length === 0 ? `
                        <!-- Empty state (Phase 75 always-rendered cell pattern; UI-SPEC copy) -->
                        <div class="empty-state" style="padding: 1.5rem 1rem;">
                            <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem;">No tasks yet.</h3>
                            <p style="margin-bottom: 1rem;">Open the plan to get started.</p>
                            <a href="#/projects/${escapeHTML(currentProject.project_code)}/plan" class="btn btn-primary">Open Plan</a>
                        </div>
                    ` : `
                        <!-- Stats row -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">Tasks</label>
                                <div style="font-weight: 600; color: #1a73e8; font-size: 1.5rem;">${currentTasks.length}</div>
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="margin-bottom: 0.5rem; display: block; font-weight: 600; color: #1e293b;">% Complete</label>
                                <div style="font-weight: 600; color: #1a73e8; font-size: 1.5rem;">${planSummary.weightedProgress}%</div>
                            </div>
                        </div>

                        <!-- Highlights row -->
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1rem;">
                            <div>
                                <div style="font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Most recent accomplishment</div>
                                <div style="color: #1e293b; font-size: 0.875rem;">${planSummary.recent ? escapeHTML(planSummary.recent.name) : 'No completed tasks yet.'}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Next milestone</div>
                                <div style="color: #1e293b; font-size: 0.875rem;">${planSummary.next ? escapeHTML(planSummary.next.name) : 'No upcoming milestones.'}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Ongoing milestone</div>
                                <div style="color: #1e293b; font-size: 0.875rem;">${planSummary.ongoing ? escapeHTML(planSummary.ongoing.name) : 'No active milestones.'}</div>
                            </div>
                        </div>

                        <!-- CTA -->
                        <div style="text-align: right;">
                            <a href="#/projects/${escapeHTML(currentProject.project_code)}/plan" class="btn btn-primary">Open Plan</a>
                        </div>
                    `}
                </div>
            </div>
```

#### Pattern 17: New tasks listener wired in init() — extend project-detail.js state + listener arrays

`C:\Users\franc\dev\projects\pr-po\app\views\project-detail.js` lines 12-19 (existing module state — extend):
```javascript
let currentProject = null;
let projectCode = null;
let listener = null;
let usersData = [];
let usersListenerUnsub = null;
let currentExpense = { /* ... */ };
let currentCollectibles = { totalRequested: 0, totalCollected: 0, remainingCollectible: 0 };
```

**Phase 86 — add to module state:**
```javascript
// Phase 86 — task summary state for Project Plan card
let currentTasks = [];
let tasksListenerUnsub = null;
let planSummary = { weightedProgress: 0, recent: null, next: null, ongoing: null };
```

**Phase 86 — extend init() (after the existing project-load logic):**
```javascript
// Subscribe to project_tasks for this project (Phase 86 summary card)
async function subscribeToTasks() {
    if (tasksListenerUnsub) { tasksListenerUnsub(); tasksListenerUnsub = null; }
    if (!currentProject?.id) return;
    const tasksQuery = query(
        collection(db, 'project_tasks'),
        where('project_id', '==', currentProject.id)
    );
    tasksListenerUnsub = onSnapshot(tasksQuery, (snapshot) => {
        currentTasks = [];
        snapshot.forEach(d => currentTasks.push({ id: d.id, ...d.data() }));
        planSummary = computePlanSummary(currentTasks);
        renderProjectDetail();  // re-render to show updated card
    });
}
// call subscribeToTasks() at the end of the project-load onSnapshot callback
```

#### Pattern 18: Highlights computation (CONTEXT.md Specifics — derive on read)

```javascript
function computePlanSummary(tasks) {
    if (tasks.length === 0) {
        return { weightedProgress: 0, recent: null, next: null, ongoing: null };
    }
    // weighted progress (D-12, leaf-only)
    const leaves = tasks.filter(t => !tasks.some(c => c.parent_task_id === t.task_id));
    let weightedSum = 0, totalDuration = 0;
    for (const leaf of leaves) {
        const dur = Math.max(1, daysBetween(leaf.start_date, leaf.end_date));
        weightedSum += (leaf.progress || 0) * dur;
        totalDuration += dur;
    }
    const weightedProgress = totalDuration === 0
        ? (leaves.every(l => (l.progress || 0) === 100) ? 100 : 0)
        : Math.round(weightedSum / totalDuration);

    const today = new Date().toISOString().slice(0, 10);

    // Highlights — CONTEXT.md Specifics
    const recent = tasks
        .filter(t => (t.progress || 0) === 100)
        .sort((a, b) => (b.updated_at?.seconds || 0) - (a.updated_at?.seconds || 0))[0] || null;
    const next = tasks
        .filter(t => t.is_milestone === true && (t.progress || 0) < 100 && t.end_date >= today)
        .sort((a, b) => a.end_date.localeCompare(b.end_date))[0] || null;
    const ongoing = tasks
        .filter(t => t.is_milestone === true && (t.progress || 0) < 100
                  && t.start_date <= today && today <= t.end_date)
        .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] || null;

    return { weightedProgress, recent, next, ongoing };
}
```

#### Pattern 19: destroy() cleanup extension

`C:\Users\franc\dev\projects\pr-po\app\views\project-detail.js` lines 207-216 (existing listener cleanup — extend):
```javascript
    if (listener) { listener(); listener = null; }
    if (usersListenerUnsub) { usersListenerUnsub(); usersListenerUnsub = null; }
    usersData = [];
```
**Phase 86 — add:**
```javascript
    if (tasksListenerUnsub) { tasksListenerUnsub(); tasksListenerUnsub = null; }
    currentTasks = [];
    planSummary = { weightedProgress: 0, recent: null, next: null, ongoing: null };
```

---

### `firestore.rules` (MOD — new `project_tasks` block)

**Analogs (in priority order):**
1. **Template at top:** `firestore.rules` lines 6-39 (ADDING NEW COLLECTIONS).
2. **mrfs block (project-scoped read for ops_user):** lines 255-277.
3. **collectibles block (Phase 85 — most recent new-collection precedent):** lines 461-478.
4. **notifications block (two-tier `update` rule using `affectedKeys().hasOnly()`):** lines 491-517.
5. **`isAssignedToProject()` helper:** lines 70-82 (reused, not modified).

#### Pattern 20: Phase 85 collectibles block (compact new-collection template)

`C:\Users\franc\dev\projects\pr-po\firestore.rules` lines 461-478:
```
    match /collectibles/{collId} {
      // All active users can read
      allow read: if isActiveUser();

      // Create / Update: operations_admin, finance, super_admin
      allow create: if hasRole(['super_admin', 'operations_admin', 'finance']);
      allow update: if hasRole(['super_admin', 'operations_admin', 'finance']);

      // Delete: zero-payment cancellation (client-side guard) — same roles
      allow delete: if hasRole(['super_admin', 'operations_admin', 'finance']);
    }
```

#### Pattern 21: notifications two-tier update via `affectedKeys().hasOnly([...])` (the model for D-18 progress-only update)

`C:\Users\franc\dev\projects\pr-po\firestore.rules` lines 507-514:
```
      allow update: if isActiveUser()
        && resource.data.user_id == request.auth.uid
        && request.resource.data.user_id == resource.data.user_id
        && request.resource.data.type == resource.data.type
        && request.resource.data.message == resource.data.message
        && request.resource.data.link == resource.data.link
        && request.resource.data.created_at == resource.data.created_at
        && request.resource.data.actor_id == resource.data.actor_id;
```
**Pattern is "preserve all-but-allowed-fields"; for D-18 we need the inverse — "ONLY-progress-affected".** Use `affectedKeys().hasOnly()`:

#### Pattern 22: mrfs project-scoped list rule (mirror of D-18 read rule)

`C:\Users\franc\dev\projects\pr-po\firestore.rules` lines 255-277:
```
    match /mrfs/{mrfId} {
      allow get: if isActiveUser();
      allow list: if isActiveUser() && (
        hasRole(['super_admin', 'operations_admin', 'services_admin', 'services_user', 'finance', 'procurement']) ||
        (isRole('operations_user') && isLegacyOrAssigned(resource.data.project_code))
      );
      allow create: if hasRole(['super_admin', 'operations_admin', 'operations_user', 'services_admin', 'services_user', 'procurement']);
      allow update: if hasRole(['super_admin', 'operations_admin', 'services_admin', 'finance', 'procurement']);
      allow delete: if hasRole(['super_admin', 'operations_admin', 'procurement']);
    }
```

#### Phase 86 — `project_tasks` block (composite of all the above)

```
    // =============================================
    // project_tasks collection (Phase 86 — PM-11, D-18)
    // =============================================
    // Native PM tasks for projects. project_code denormalized for project-scoped
    // operations_user assignments (mirrors mrfs.project_code pattern).
    // Two-tier update rule (D-18):
    //   1. WBS field updates (name/dates/parent/deps/assignees): admins + assigned ops_user
    //   2. Progress-only updates: admins OR uid in resource.data.assignees
    match /project_tasks/{taskId} {
      // Read: any active user (project-scoping happens at JS query layer via where('project_id', '==', X) — mirrors mrfs / prs / pos pattern)
      allow read: if isActiveUser();

      // Create: admins or operations_user assigned to this project
      allow create: if hasRole(['super_admin', 'operations_admin']) ||
                       (isRole('operations_user') &&
                        isAssignedToProject(request.resource.data.project_code));

      // Update tier 1 — WBS fields (anything other than progress-only)
      // Update tier 2 — Progress-only updates (allowed for assignees in addition to admins)
      allow update: if (
        // Tier 1: full edit (WBS + progress)
        (hasRole(['super_admin', 'operations_admin']) ||
         (isRole('operations_user') && isAssignedToProject(resource.data.project_code)))
      ) || (
        // Tier 2: progress-only — request changes ONLY the 'progress' field (and the always-bumped 'updated_at')
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['progress', 'updated_at']) &&
        (hasRole(['super_admin', 'operations_admin']) ||
         (isActiveUser() && request.auth.uid in resource.data.assignees))
      );

      // Delete: admins or operations_user assigned to this project (D-14)
      allow delete: if hasRole(['super_admin', 'operations_admin']) ||
                       (isRole('operations_user') && isAssignedToProject(resource.data.project_code));
    }
```

**Deploy timing (Phase 85 D-24 lesson, surfaced in CLAUDE.md "Add New Collection or Tab"):** Rules MUST land in the same commit as the first JS write (`setDoc`/`addDoc` to `project_tasks`). Without rules, even Super Admin gets "Missing or insufficient permissions" (Phase 11 / Phase 65 D-71 lesson).

---

### `index.html` (MOD — Frappe Gantt CDN script + CSS)

**Analog:** `index.html` lines 17-18 (Chart.js CDN, Phase 77.1 — pinned version, NOT `@latest`).

`C:\Users\franc\dev\projects\pr-po\index.html` lines 9-19:
```html
    <!-- CSS Files -->
    <link rel="stylesheet" href="styles/main.css">
    <link rel="stylesheet" href="styles/components.css">
    <link rel="stylesheet" href="styles/views.css">
    <link rel="stylesheet" href="styles/hero.css">

    <!-- Signature capture library (self-hosted to avoid CDN tracking-prevention warnings) -->
    <script src="lib/signature_pad.umd.min.js"></script>
    <!-- Chart.js (Phase 77.1) — pinned to v4.4.7 for home page status breakdown charts -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
</head>
```

**Phase 86 — add CSS link in the `<!-- CSS Files -->` block AND script tag adjacent to Chart.js:**
```html
    <!-- CSS Files -->
    <link rel="stylesheet" href="styles/main.css">
    <link rel="stylesheet" href="styles/components.css">
    <link rel="stylesheet" href="styles/views.css">
    <link rel="stylesheet" href="styles/hero.css">
    <!-- Frappe Gantt (Phase 86) — pinned to v1.2.2; powers the project plan view -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/frappe-gantt@1.2.2/dist/frappe-gantt.css">

    <!-- Signature capture library (self-hosted to avoid CDN tracking-prevention warnings) -->
    <script src="lib/signature_pad.umd.min.js"></script>
    <!-- Chart.js (Phase 77.1) — pinned to v4.4.7 for home page status breakdown charts -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
    <!-- Frappe Gantt (Phase 86) — pinned to v1.2.2; expose window.Gantt for app/views/project-plan.js -->
    <script src="https://cdn.jsdelivr.net/npm/frappe-gantt@1.2.2/dist/frappe-gantt.umd.js"></script>
</head>
```

**Pin to specific version (NOT `@latest`)** — locked by UI-SPEC Registry Safety. SRI is non-blocking (Chart.js doesn't have SRI either, captured as future hardening).

---

### `app/router.js` (MOD — register `/projects/:code/plan` sub-route)

**Analog:** existing detail-route handling at `router.js` lines 369-382 (3-segment hash → routed to a separate view module with `param`).

#### Pattern 23: route entry (mirror existing)

`C:\Users\franc\dev\projects\pr-po\app\router.js` lines 33-110 (route table — append new entry):
```javascript
const routes = {
    // ...
    '/project-detail': {
        name: 'Project Detail',
        load: () => import('./views/project-detail.js'),
        title: 'Project Details | CLMC Procurement'
    },
    // ...
};
```

**Phase 86 — add new route entry:**
```javascript
    '/project-plan': {
        name: 'Project Plan',
        load: () => import('./views/project-plan.js'),
        title: 'Project Plan | CLMC Procurement'
    },
```

#### Pattern 24: routePermissionMap entry

`C:\Users\franc\dev\projects\pr-po\app\router.js` lines 9-23:
```javascript
const routePermissionMap = {
    '/': 'dashboard',
    '/clients': 'clients',
    '/projects': 'projects',
    '/project-detail': 'projects',
    // ...
};
```

**Phase 86 — add:**
```javascript
    '/project-plan': 'projects',  // Reuses the existing 'projects' permission key — same gate as project-detail
```

#### Pattern 25: hash-parser branch — `#/projects/:code/plan` → `navigate('/project-plan', null, code)`

`C:\Users\franc\dev\projects\pr-po\app\router.js` lines 369-385 (existing detail-route branching — pattern to follow):
```javascript
function handleHashChange() {
    const { path, tab, subpath } = parseHash();

    // Handle detail routes: #/projects/detail/CODE -> navigate to /project-detail with param
    if (path === '/projects' && tab === 'detail' && subpath) {
        navigate('/project-detail', null, subpath);
        return;
    }

    // Handle detail routes: #/services/detail/CODE -> navigate to /service-detail with param
    if (path === '/services' && tab === 'detail' && subpath) {
        navigate('/service-detail', null, subpath);
        return;
    }

    navigate(path, tab);
}
```

**Phase 86 — add new branch BEFORE the catch-all `navigate(path, tab)`:**

URL is `#/projects/{CODE}/plan` → `parseHash()` returns `{ path: '/projects', tab: '{CODE}', subpath: 'plan' }`. So the branch is:
```javascript
    // Handle plan route: #/projects/CODE/plan -> navigate to /project-plan with param
    if (path === '/projects' && tab && subpath === 'plan') {
        navigate('/project-plan', null, tab);  // tab here = the project code
        return;
    }
```

**Phase 86 — apply the same branch to `handleInitialRoute()` at lines 408-416** (mirror the existing detail-route check):
```javascript
    if (path === '/projects' && tab === 'detail' && subpath) {
        navigate('/project-detail', null, subpath);
    } else if (path === '/services' && tab === 'detail' && subpath) {
        navigate('/service-detail', null, subpath);
    } else if (path === '/projects' && tab && subpath === 'plan') {
        // Phase 86 — initial-load branch for #/projects/CODE/plan
        navigate('/project-plan', null, tab);
    } else {
        navigate(path, tab);
    }
```

**Verify the existing `parseHash()` (lines 116-129) already returns 3 segments — it does (`subpath = parts[2] || null`).** No change to `parseHash()` needed.

---

## Shared Patterns (cross-cutting — applied to multiple new/modified files)

### Permission gating
**Source:** `app/auth.js` exposes `window.getCurrentUser()`, `window.canEditTab(tabName)`, `window.hasTabAccess(tabName)`, `window.getAssignedProjectCodes()`.
**Apply to:** `project-plan.js` (every CRUD button + every drag-write — mirror `saveField()` guard at project-detail.js:666-672), `project-detail.js` (already uses these — no new guards needed for the read-only summary card).
**Excerpt** (`project-detail.js:666-672`):
```javascript
if (window.canEditTab?.('projects') === false) {
    showToast('You do not have permission to edit projects', 'error');
    return false;
}
```

### Toast feedback
**Source:** `app/utils.js` line 127 — `showToast(message, type)` where type is 'info' | 'success' | 'error' | 'warning'.
**Apply to:** every write success/failure path in `project-plan.js`. UI-SPEC Copywriting Contract supplies the verbatim strings (FS violation, cycle detection, success on save, etc.).

### XSS-safe interpolation
**Source:** `app/utils.js:17` — `escapeHTML(str)`.
**Apply to:** every user-supplied string in HTML strings (task name, description, project name in modal title, assignee name in pill).

### Loading overlay
**Source:** `app/utils.js:115` — `showLoading(true|false)`.
**Apply to:** multi-doc operations (delete-with-cascade, dependency-cycle validation that scans full task list, big project initial render).

### Console log prefix
**Source:** CLAUDE.md "Important Notes" — use bracket-prefix per view.
**Apply to:** `[Plan]` for `project-plan.js`, `[ProjectDetail]` for `project-detail.js` (already established).

### Real-time data + listener cleanup (CLAUDE.md SPA pattern)
**Source:** Every view module. Reference the `listeners[]` array + `forEach(unsub => unsub?.())` shape.
**Apply to:** `project-plan.js`, `project-detail.js` (extend existing).

### Status case-sensitivity (CLAUDE.md)
**Apply to:** Phase 86 has NO string statuses on tasks (progress is numeric, is_milestone is boolean). NOT relevant. **Project status** strings remain case-sensitive but are unchanged this phase.

### Sequential ID generation — DO NOT use shared `generateSequentialId()`
**Reference:** Phase 65.4 collision lesson + Phase 85 D-20 + CONTEXT D-19.
**Apply to:** `app/task-id.js` — use the per-project counter pattern from `app/coll-id.js`.

### Clientless-project block (Phase 78 + Phase 85 D-20 + Phase 86 D-19)
**Source:** Pattern is documented in CONTEXT.md `<specifics>` with verbatim copy; the analog implementation is the Phase 85 collectible-create flow inside finance.js.
**Apply to:** `project-plan.js` `init()` (block message before subscribing to tasks) AND the `+ Add Task` button (disabled with tooltip).
**Copy:** `"This project doesn't have a project code yet. Assign a client to issue the code, then return to plan tasks."`

### Always-render zero-state (Phase 75)
**Source:** `project-detail.js:419-430` (Paid + Remaining Payable cells render even at 0).
**Apply to:** Project Plan summary card (renders even with 0 tasks; UI-SPEC Copywriting empty-state copy).

---

## No Analog Found

Items where the codebase has no close existing match — planner should either build greenfield (referencing CONTEXT/UI-SPEC + Frappe Gantt upstream docs) or pull from the Frappe Gantt GitHub readme.

| Item | Why no analog | Reference for planner |
|------|---------------|------------------------|
| Frappe Gantt instance lifecycle (drag-callbacks, `change_view_mode`, redraw on filter change) | First Gantt library in the codebase | Frappe Gantt GitHub README + `https://github.com/frappe/gantt`; CONTEXT D-05..D-09 |
| SVG diamond overlay for milestones (`custom_class: 'milestone-marker'` + CSS hides default bar + injects `<svg>`) | First SVG-overlay-on-Gantt in codebase | UI-SPEC Component Inventory `.milestone-marker`; CONTEXT D-08 |
| Today vertical line as a Frappe overlay | First today-line in codebase | UI-SPEC `.gantt-today-line`; CONTEXT D-09; implementation hint: render after Frappe instantiation, anchor to today's x-coordinate via Frappe's internal date scale |
| Dependency cycle detection (DFS over `dependencies[]` + cycle path message) | First cycle-detection in codebase | Standard graph algorithm; D-13 + Specifics copy |
| Hierarchical tree render with chevron collapse/expand (left rail) | Closest codebase analog is the MRF Records expand-row pattern in procurement.js, but MRF expand is single-row not nested | UI-SPEC `.task-tree`, `.task-tree-row`; build inline DFS render |
| Split-pane CSS grid (35/65 left/right) | No existing split-pane in codebase | UI-SPEC `.plan-split-pane`; standard `display: grid; grid-template-columns: 35% 1fr` |
| Scroll-sync between left rail and right Gantt | No analog | UI-SPEC Interaction Contract — `selectTaskRow` scroll-syncs Gantt x-axis to the task bar |

---

## Metadata

**Analog search scope:** `app/**/*.js`, `styles/*.css`, `firestore.rules`, `index.html`, `.planning/phases/85-*` (most-recent collection-introduction precedent), `.planning/milestones/v2.3-phases/27-code-generation`, `.planning/milestones/v3.2-phases/65-rfp-payables-tracking`.
**Files scanned:** 31 source files + 4 plan/research files from the 2 most relevant prior phases.
**Pattern extraction date:** 2026-05-05.

---

*Phase: 86-native-project-management-gantt*
