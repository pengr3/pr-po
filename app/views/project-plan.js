/* ========================================
   PROJECT PLAN VIEW (Phase 86)
   Full-screen split-pane: hierarchical task list (left) + Frappe Gantt (right).
   Standalone route #/projects/:code/plan. Projects-only this phase (D-04).
   ======================================== */

import { db, collection, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, writeBatch, serverTimestamp } from '../firebase.js';
import { formatDate, showLoading, showToast, normalizePersonnel, escapeHTML } from '../utils.js';
import { generateTaskId } from '../task-id.js';

// ---- Module-scope state ----
let currentProject = null;
let projectCode = null;
let tasks = [];                       // raw task docs from onSnapshot (project-scoped)
let listeners = [];                   // onSnapshot unsubscribers — destroy() loops this
let gantt = null;                     // Frappe Gantt instance — Plan 03 sets this
let expandedTaskIds = new Set();      // tree expand/collapse state (UI only — D-22 no Firestore)
let selectedTaskId = null;            // currently-selected row in left rail

// Filter state — Plan 05 wires bodies (D-21 independent state vars)
let filterDateFrom = '';
let filterDateTo = '';
let filterAssignees = [];

// ---- Lifecycle ----

export function render(activeTab = null, param = null) {
    // SYNCHRONOUS — router inserts return value as innerHTML immediately. init() does the async work.
    projectCode = param;
    if (!projectCode) {
        return `<div class="empty-state"><h3>Project not specified</h3><p>Use the project list to open a plan.</p></div>`;
    }
    // Initial shell — init() will populate task tree + Gantt after data loads
    return `
        <div class="plan-view-surface" id="planViewSurface">
            <div class="plan-toolbar">
                <a href="#/projects" class="plan-back-link">‹ Back</a>
                <h2 class="plan-title" id="planTitle">Plan</h2>
                <div class="plan-toolbar-spacer"></div>
                <div class="zoom-pill-group" id="zoomPillGroup" role="group" aria-label="Zoom">
                    <button type="button" class="zoom-pill" data-zoom="Day" onclick="window.setGanttZoom('Day')">Day</button>
                    <button type="button" class="zoom-pill active" data-zoom="Week" onclick="window.setGanttZoom('Week')">Week</button>
                    <button type="button" class="zoom-pill" data-zoom="Month" onclick="window.setGanttZoom('Month')">Month</button>
                </div>
                <button type="button" class="btn btn-secondary" id="filtersToggleBtn" onclick="window.togglePlanFilters()">Filters</button>
                <button type="button" class="btn btn-primary" id="addTaskBtn" onclick="window.openAddTaskModal()">+ Add Task</button>
            </div>
            <div class="plan-filter-panel" id="planFilterPanel" style="display: none;"></div>
            <div class="plan-split-pane">
                <div class="task-tree" id="taskTree" aria-label="Task list">
                    <div class="empty-state"><h3>Loading…</h3></div>
                </div>
                <div class="gantt-pane">
                    <div id="ganttPane"></div>
                </div>
            </div>
        </div>
        <div id="taskFormModalMount"></div>
        <div id="deleteTaskConfirmModalMount"></div>
    `;
}

export async function init(activeTab = null, param = null) {
    projectCode = param;
    if (!projectCode) return;

    showLoading(true);
    try {
        // 1. Load the project doc by project_code
        const projSnap = await getDocs(query(collection(db, 'projects'), where('project_code', '==', projectCode)));
        if (projSnap.empty) {
            const surface = document.getElementById('planViewSurface');
            if (surface) {
                surface.innerHTML = `<div class="empty-state"><h3>Project not found</h3><p>No project with code <strong>${escapeHTML(projectCode)}</strong>.</p></div>`;
            }
            return;
        }
        const projDoc = projSnap.docs[0];
        currentProject = { id: projDoc.id, ...projDoc.data() };
        const titleEl = document.getElementById('planTitle');
        if (titleEl) titleEl.textContent = `Plan — ${currentProject.project_name || projectCode}`;

        // 2. Clientless block (D-19) — projects without project_code (Phase 78 deferred-issuance)
        if (!currentProject.project_code) {
            const tree = document.getElementById('taskTree');
            if (tree) {
                tree.innerHTML = `
                    <div class="empty-state">
                        <h3>No project code</h3>
                        <p>This project doesn't have a project code yet. Assign a client to issue the code, then return to plan tasks.</p>
                    </div>`;
            }
            const addBtn = document.getElementById('addTaskBtn');
            if (addBtn) {
                addBtn.disabled = true;
                addBtn.title = `This project doesn't have a project code yet. Assign a client to issue the code, then return to plan tasks.`;
            }
            return;
        }

        // 3. Subscribe to project_tasks (project-scoped at JS query layer per D-18)
        let __snapshotCount = 0;
        const tasksUnsub = onSnapshot(
            query(collection(db, 'project_tasks'), where('project_id', '==', currentProject.id)),
            (snap) => {
                tasks = [];
                snap.forEach(d => tasks.push({ id: d.id, ...d.data() }));
                renderTaskTree();
                renderGantt();
                if (__snapshotCount > 0) checkAndToastFsViolations();
                __snapshotCount++;
            }
        );
        listeners.push(tasksUnsub);

        // 4. (Plan 04 will source the assignees picker from `normalizePersonnel(currentProject)`
        //    — D-16 mandates project-personnel-only. We deliberately do NOT subscribe to the
        //    full users collection: it would leak the full user list to any active user with
        //    plan-view access AND duplicate data already present on the project doc.)

        // 5. Wire window functions
        window.toggleTaskExpand = toggleTaskExpand;
        window.selectTaskRow = selectTaskRow;
        window.setGanttZoom = setGanttZoom;
        window.togglePlanFilters = togglePlanFilters;
        window.openAddTaskModal = openAddTaskModal;
        window.openEditTaskModal = openEditTaskModal;
        window.confirmDeleteTask = confirmDeleteTask;
        window.closeTaskFormModal = closeTaskFormModal;
        window.toggleTaskAssignee = toggleTaskAssignee;
        window.saveTaskFromModal = saveTaskFromModal;       // Task 2 of this plan defines saveTaskFromModal
        window.deleteTaskNow = deleteTaskNow;                // Task 3 of this plan defines deleteTaskNow
        window.closeDeleteTaskConfirm = closeDeleteTaskConfirm; // Task 3 of this plan defines closeDeleteTaskConfirm
        window.editTaskProgress = editTaskProgress;          // Task 4 of this plan defines editTaskProgress (slider handler)
        // Phase 86 Plan 05 — filter panel handlers (D-21, PM-09)
        window.applyPlanFilters = applyPlanFilters;
        window.clearPlanFilters = clearPlanFilters;
        window.toggleFilterAssignee = toggleFilterAssignee;
    } finally {
        showLoading(false);
    }
}

export async function destroy() {
    listeners.forEach(unsub => { try { unsub?.(); } catch (e) { /* swallow */ } });
    listeners = [];
    if (gantt && typeof gantt.destroy === 'function') {
        try { gantt.destroy(); } catch (e) { /* swallow */ }
    }
    gantt = null;
    tasks = [];
    currentProject = null;
    projectCode = null;
    expandedTaskIds = new Set();
    selectedTaskId = null;
    __ganttInitialScrollDone = false;
    __lastViolationFingerprint = '';
    delete window.toggleTaskExpand;
    delete window.selectTaskRow;
    delete window.setGanttZoom;
    delete window.togglePlanFilters;
    delete window.openAddTaskModal;
    delete window.openEditTaskModal;
    delete window.confirmDeleteTask;
    delete window.closeTaskFormModal;
    delete window.toggleTaskAssignee;
    delete window.saveTaskFromModal;
    delete window.deleteTaskNow;
    delete window.closeDeleteTaskConfirm;
    delete window.editTaskProgress;
    // Phase 86 Plan 05 — filter panel handler teardown
    delete window.applyPlanFilters;
    delete window.clearPlanFilters;
    delete window.toggleFilterAssignee;
}

// ---- Tree rendering (left rail) ----

function renderTaskTree() {
    const container = document.getElementById('taskTree');
    if (!container) return;
    if (!tasks || tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No tasks yet.</h3>
                <p>Click + Add Task to get started.</p>
            </div>`;
        return;
    }

    // Build parent_task_id → children[] map (filtered to visible set per D-21)
    const keepIds = getVisibleTaskSet();
    const visibleTasks = tasks.filter(t => keepIds.has(t.task_id));
    if (tasks.length > 0 && visibleTasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No tasks match the current filters.</h3>
                <p>Clear filters to see all tasks.</p>
            </div>`;
        return;
    }
    const childrenByParent = new Map();
    visibleTasks.forEach(t => {
        const key = t.parent_task_id || '__root__';
        if (!childrenByParent.has(key)) childrenByParent.set(key, []);
        childrenByParent.get(key).push(t);
    });
    // Sort children by start_date asc within each level (D-Discretion default)
    childrenByParent.forEach(arr => arr.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || '')));

    // hasChildren must reflect the FULL tasks set (truth) — filters affect what's RENDERED,
    // not whether a node is structurally a parent (slider vs % label decision).
    const allChildrenByParent = new Map();
    tasks.forEach(t => {
        const key = t.parent_task_id || '__root__';
        if (!allChildrenByParent.has(key)) allChildrenByParent.set(key, []);
        allChildrenByParent.get(key).push(t);
    });

    const rows = [];
    function walk(parentKey, depth) {
        const kids = childrenByParent.get(parentKey) || [];
        kids.forEach(t => {
            const hasChildren = allChildrenByParent.has(t.task_id);
            const isExpanded = expandedTaskIds.has(t.task_id);
            const chevronChar = hasChildren ? (isExpanded ? '⌄' : '›') : '';
            const isSelected = selectedTaskId === t.task_id;
            rows.push(`
                <div class="task-tree-row${isSelected ? ' selected' : ''}"
                     data-task-id="${escapeHTML(t.task_id)}"
                     tabindex="0"
                     style="padding-left: ${depth * 16 + 8}px;">
                    <span class="task-tree-chevron${hasChildren ? ' clickable' : ''}"
                          data-action="toggle-expand">${chevronChar}</span>
                    <span class="task-tree-name${t.is_milestone ? ' is-milestone' : ''}"
                          data-action="open-edit">
                        ${escapeHTML(t.name || '(unnamed)')}
                    </span>
                    ${hasChildren
                        ? `<span class="task-tree-progress">${computeWeightedProgress(t.task_id, tasks)}%</span>`
                        : `<input type="range" class="task-tree-progress-slider"
                                  min="0" max="100" step="1"
                                  value="${typeof t.progress === 'number' ? t.progress : 0}"
                                  data-action="edit-progress">`}
                    <button type="button" class="task-tree-delete-btn"
                            title="Delete task"
                            data-action="confirm-delete">&times;</button>
                </div>
            `);
            if (hasChildren && isExpanded) walk(t.task_id, depth + 1);
        });
    }
    walk('__root__', 0);
    container.innerHTML = rows.join('');

    // Bind task-tree row event handlers via data-* + addEventListener (defense-in-depth vs.
    // escapeHTML-in-JS-string-literal injection — escapeHTML produces &#039; which the browser
    // HTML-decodes back to ' inside attribute values, breaking out of the JS string).
    container.querySelectorAll('.task-tree-row').forEach(row => {
        const id = row.dataset.taskId;
        row.addEventListener('click', () => selectTaskRow(id));
        const chevron = row.querySelector('[data-action="toggle-expand"]');
        if (chevron) chevron.addEventListener('click', (e) => { e.stopPropagation(); toggleTaskExpand(id); });
        const nameEl = row.querySelector('[data-action="open-edit"]');
        if (nameEl) nameEl.addEventListener('click', (e) => { e.stopPropagation(); openEditTaskModal(id); });
        const slider = row.querySelector('[data-action="edit-progress"]');
        if (slider) {
            slider.addEventListener('click', (e) => e.stopPropagation());
            slider.addEventListener('change', (e) => editTaskProgress(id, e.target.value));
        }
        const delBtn = row.querySelector('[data-action="confirm-delete"]');
        if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmDeleteTask(id); });
    });
}

function toggleTaskExpand(taskId) {
    if (expandedTaskIds.has(taskId)) expandedTaskIds.delete(taskId);
    else expandedTaskIds.add(taskId);
    renderTaskTree();
}

function selectTaskRow(taskId) {
    selectedTaskId = taskId;
    renderTaskTree();
    // Plan 03 will scroll-sync the Gantt pane to this task's bar
}

// ---- Gantt rendering (right pane) ----

let __ganttInitialScrollDone = false;
let __lastViolationFingerprint = '';

function renderGantt() {
    if (typeof window.Gantt !== 'function') {
        // Frappe not yet loaded — guard. Plan 01 ships the CDN script, but defensive.
        return;
    }
    const mountEl = document.getElementById('ganttPane');
    if (!mountEl) return;

    // 0. Apply D-21 filters — restrict which tasks render but keep envelope math on the full set
    const keepIds = getVisibleTaskSet();
    const visibleTasksLocal = tasks.filter(t => keepIds.has(t.task_id));

    // 1. Build childrenByParent map from the FULL tasks array — this is the truth-source for
    //    parent envelope computation (D-12: rollup math uses truth, filters affect rendering only).
    const childrenByParent = new Map();
    tasks.forEach(t => {
        const key = t.parent_task_id || '__root__';
        if (!childrenByParent.has(key)) childrenByParent.set(key, []);
        childrenByParent.get(key).push(t);
    });
    // Build a separate visible-children map for the depth-first render walk.
    const visibleChildrenByParent = new Map();
    visibleTasksLocal.forEach(t => {
        const key = t.parent_task_id || '__root__';
        if (!visibleChildrenByParent.has(key)) visibleChildrenByParent.set(key, []);
        visibleChildrenByParent.get(key).push(t);
    });

    // 2. Compute parent date envelopes (D-11 — locked computed, leaf-driven)
    // For Gantt rendering we COMPUTE here (we don't persist; persistence happens on writes —
    // Plan 04 owns parent-recompute on child write).
    function getEnvelope(taskId) {
        const kids = childrenByParent.get(taskId) || [];
        if (kids.length === 0) return null;
        let minStart = null, maxEnd = null;
        kids.forEach(k => {
            const env = getEnvelope(k.task_id);
            const ks = env ? env.start : k.start_date;
            const ke = env ? env.end : k.end_date;
            if (ks && (!minStart || ks < minStart)) minStart = ks;
            if (ke && (!maxEnd || ke > maxEnd)) maxEnd = ke;
        });
        return { start: minStart, end: maxEnd };
    }

    // 3. Build Frappe task array (depth-first to preserve list order)
    const frappeTasks = [];

    function appendNode(t) {
        const isParent = childrenByParent.has(t.task_id);
        const env = isParent ? getEnvelope(t.task_id) : null;
        const start = env?.start || t.start_date;
        const end = env?.end || t.end_date;
        if (!start || !end) return; // skip task with missing dates

        // Frappe deps must be a comma-joined string of task ids; null/empty array → ''
        const depsArr = Array.isArray(t.dependencies) ? t.dependencies : [];
        let customClass = '';
        if (t.is_milestone) customClass = 'milestone-marker';
        else if (isParent) customClass = 'parent-summary-bar';

        frappeTasks.push({
            id: t.task_id,
            name: t.name || '(unnamed)',
            start: start,
            end: end,
            progress: typeof t.progress === 'number' ? t.progress : 0,
            dependencies: depsArr.join(','),
            custom_class: customClass
        });
    }

    function walk(parentKey) {
        // Iterate VISIBLE children (filter-aware); appendNode still uses truth-set childrenByParent
        // to decide isParent / envelope so unfiltered structure is preserved on screen.
        const kids = (visibleChildrenByParent.get(parentKey) || []).slice().sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
        kids.forEach(t => {
            appendNode(t);
            if (visibleChildrenByParent.has(t.task_id)) walk(t.task_id);
        });
    }
    walk('__root__');

    if (frappeTasks.length === 0) {
        mountEl.innerHTML = '';
        return;
    }

    // 4. Initialize or refresh Frappe Gantt
    if (gantt) {
        // Refresh rather than rebuild — preserves zoom + scroll
        try { gantt.refresh(frappeTasks); } catch (e) { /* fall through to rebuild */ gantt = null; }
    }
    if (!gantt) {
        mountEl.innerHTML = ''; // Frappe expects empty mount
        const Gantt = window.Gantt;
        gantt = new Gantt('#ganttPane', frappeTasks, {
            view_mode: 'Week',
            bar_height: 24,
            bar_corner_radius: 3,
            padding: 18,
            language: 'en',
            date_format: 'YYYY-MM-DD',
            on_date_change: handleGanttDateChange,
            on_progress_change: handleGanttProgressChange,
            on_click: handleGanttBarClick
        });
    }

    // 5. Apply FS-violation overlay (D-10)
    applyFsViolationStyles();

    // 6. Today line + one-shot scroll-to-today
    renderTodayLine();
    if (!__ganttInitialScrollDone) {
        scrollGanttToToday();
        __ganttInitialScrollDone = true;
    }
}

function setGanttZoom(mode) {
    if (!gantt || !mode) return;
    try { gantt.change_view_mode(mode); } catch (e) { return; }
    document.querySelectorAll('.zoom-pill').forEach(el => {
        el.classList.toggle('active', el.dataset.zoom === mode);
    });
    // Re-apply overlays after view-mode swap
    renderTodayLine();
    applyFsViolationStyles();
}

function handleGanttDateChange(task, start, end) {
    // task.id === task_id; start/end are Date objects from Frappe
    const t = tasks.find(x => x.task_id === task.id);
    if (!t) return;

    // Defense-in-depth: parent bars MUST NOT be draggable (D-11).
    // CSS pointer-events: none on .parent-summary-bar handles is the primary block;
    // this is a server-rules + JS double-check.
    const isParent = tasks.some(x => x.parent_task_id === t.task_id);
    if (isParent) {
        showToast('Parent task dates are computed from subtasks. Edit subtask dates instead.', 'warning');
        // Force re-render to revert any optimistic move
        renderGantt();
        return;
    }

    const newStart = formatDateISO(start);
    const newEnd = formatDateISO(end);
    if (newStart === t.start_date && newEnd === t.end_date) return;

    updateDoc(doc(db, 'project_tasks', t.task_id), {
        start_date: newStart,
        end_date: newEnd,
        updated_at: serverTimestamp()
    }).then(() => {
        // Plan 04's parent-recompute helper will fire from the snapshot callback
    }).catch(err => {
        console.error('[ProjectPlan] Drag write failed:', err);
        showToast(err?.code === 'permission-denied'
            ? `You don't have permission to edit tasks on this project.`
            : 'Could not save task. Please try again.', 'error');
        renderGantt(); // revert
    });
}

function handleGanttProgressChange(task, progress) {
    // Authoritative write path for drag-progress on the Gantt bar.
    // Permission rules (D-15) are enforced at firestore.rules layer (Plan 01 D-18 tier-2).
    // The left-rail slider in Plan 04 (editTaskProgress) writes through the same shape.
    const t = tasks.find(x => x.task_id === task.id);
    if (!t) return;
    const newProgress = Math.max(0, Math.min(100, Math.round(progress)));
    if (newProgress === t.progress) return;
    updateDoc(doc(db, 'project_tasks', t.task_id), {
        progress: newProgress,
        updated_at: serverTimestamp()
    }).catch(err => {
        console.error('[ProjectPlan] Progress write failed:', err);
        showToast(err?.code === 'permission-denied'
            ? `You don't have permission to edit tasks on this project.`
            : 'Could not save task. Please try again.', 'error');
        renderGantt();
    });
}

function handleGanttBarClick(task) {
    // Click on bar → select row in left rail (Plan 02 selectTaskRow + Plan 04 modal-on-name-click)
    selectTaskRow(task.id);
}

function formatDateISO(d) {
    if (!d) return '';
    if (typeof d === 'string') return d.slice(0, 10);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function applyFsViolationStyles() {
    // For each task with deps, check FS constraint (A.end <= B.start). Highlight violating arrows.
    const tasksById = new Map(tasks.map(t => [t.task_id, t]));
    const violations = []; // [{from, to}]
    tasks.forEach(b => {
        const deps = Array.isArray(b.dependencies) ? b.dependencies : [];
        deps.forEach(aId => {
            const a = tasksById.get(aId);
            if (!a) return;
            if (a.end_date && b.start_date && a.end_date > b.start_date) {
                violations.push({ from: aId, to: b.task_id });
            }
        });
    });
    // Frappe arrows don't carry id attrs out of the box, so we cannot reliably tag specific
    // arrows as violations without a Frappe fork. The previous count-match heuristic gave
    // non-monotonic UI (silently no tag when violation count != arrow count). Clear all
    // violation classes and rely on the toast for UX until a Frappe patch lands.
    const arrows = document.querySelectorAll('#ganttPane .arrow');
    arrows.forEach(el => el.classList.remove('violation'));
}

function renderTodayLine() {
    const ganttSvg = document.querySelector('#ganttPane svg');
    if (!ganttSvg) return;
    // Remove old line
    ganttSvg.querySelectorAll('.gantt-today-line').forEach(el => el.remove());
    // Compute today's x-coord — Frappe stores tick width in gantt.options.column_width and uses
    // gantt.gantt_start as the timeline anchor
    if (!gantt) return;
    try {
        const startDate = gantt.gantt_start instanceof Date ? gantt.gantt_start : new Date(gantt.gantt_start);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        startDate.setHours(0, 0, 0, 0);
        const dayDiff = Math.round((today - startDate) / (1000 * 60 * 60 * 24));
        // Step width per day depends on view_mode — Frappe exposes gantt.options.step (hours per column)
        const stepHours = gantt.options.step || 24;
        const colWidth = gantt.options.column_width || 30;
        const xPerDay = (24 / stepHours) * colWidth;
        const x = dayDiff * xPerDay;
        // Build SVG line element
        const ns = 'http://www.w3.org/2000/svg';
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('class', 'gantt-today-line');
        line.setAttribute('x1', x);
        line.setAttribute('y1', 0);
        line.setAttribute('x2', x);
        line.setAttribute('y2', '100%');
        ganttSvg.appendChild(line);
    } catch (e) {
        // Silent fail — today line is a nice-to-have, never break Gantt rendering
    }
}

function scrollGanttToToday() {
    const pane = document.querySelector('.gantt-pane');
    if (!pane || !gantt) return;
    try {
        const startDate = gantt.gantt_start instanceof Date ? gantt.gantt_start : new Date(gantt.gantt_start);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        startDate.setHours(0, 0, 0, 0);
        const dayDiff = Math.round((today - startDate) / (1000 * 60 * 60 * 24));
        const stepHours = gantt.options.step || 24;
        const colWidth = gantt.options.column_width || 30;
        const xPerDay = (24 / stepHours) * colWidth;
        const x = dayDiff * xPerDay;
        // Center today in the visible pane
        pane.scrollLeft = Math.max(0, x - pane.clientWidth / 2);
    } catch (e) { /* swallow */ }
}

function checkAndToastFsViolations() {
    // Hook into the snapshot-driven render flow: after each renderGantt(),
    // also re-check for the FS-violation toast (D-10) — only on drag commits, not initial paint.
    const tasksById = new Map(tasks.map(t => [t.task_id, t]));
    const lines = [];
    tasks.forEach(b => {
        const deps = Array.isArray(b.dependencies) ? b.dependencies : [];
        deps.forEach(aId => {
            const a = tasksById.get(aId);
            if (!a) return;
            if (a.end_date && b.start_date && a.end_date > b.start_date) {
                lines.push(`Task '${b.name}' now starts before Task '${a.name}' finishes. Reschedule manually if needed.`);
            }
        });
    });
    const fingerprint = lines.join('|');
    if (fingerprint && fingerprint !== __lastViolationFingerprint) {
        // Only toast new violations introduced since the last snapshot
        const prevSet = new Set(__lastViolationFingerprint.split('|').filter(Boolean));
        lines.forEach(msg => {
            if (!prevSet.has(msg)) showToast(msg, 'warning');
        });
    }
    __lastViolationFingerprint = fingerprint;
}

// ---- Filter panel (D-21, PM-09) ----

function togglePlanFilters() {
    const panel = document.getElementById('planFilterPanel');
    if (!panel) return;
    const isOpen = panel.style.display === 'block';
    if (isOpen) {
        panel.style.display = 'none';
    } else {
        renderPlanFilterPanel();
        panel.style.display = 'block';
    }
}

function renderPlanFilterPanel() {
    const panel = document.getElementById('planFilterPanel');
    if (!panel) return;
    const projectPersonnel = normalizePersonnel(currentProject);
    const personnelChips = (projectPersonnel.userIds || []).map((uid, i) => {
        const name = projectPersonnel.names?.[i] || uid;
        const isOn = filterAssignees.includes(uid);
        return `<span class="personnel-pill${isOn ? ' selected' : ''}" data-uid="${escapeHTML(uid)}" data-action="toggle-filter-assignee">${escapeHTML(name)}</span>`;
    }).join('');

    panel.innerHTML = `
        <div style="display: grid; grid-template-columns: auto 1fr auto auto; gap: 16px; align-items: end;">
            <div>
                <label class="form-label">Date range</label>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input id="filterDateFromInput" class="form-control" type="date" value="${escapeHTML(filterDateFrom)}" onchange="window.applyPlanFilters()">
                    <span>to</span>
                    <input id="filterDateToInput" class="form-control" type="date" value="${escapeHTML(filterDateTo)}" onchange="window.applyPlanFilters()">
                </div>
            </div>
            <div>
                <label class="form-label">Personnel</label>
                <div class="personnel-pills-container">${personnelChips || '<span style="color: var(--gray-700, #475569); font-size: 13px;">No personnel on this project.</span>'}</div>
            </div>
            <button type="button" class="btn btn-secondary" onclick="window.clearPlanFilters()">Clear</button>
            <button type="button" class="btn btn-secondary" onclick="window.togglePlanFilters()">Close</button>
        </div>
    `;
    panel.querySelectorAll('.personnel-pill[data-action="toggle-filter-assignee"]').forEach(pill => {
        pill.addEventListener('click', () => toggleFilterAssignee(pill.dataset.uid));
    });
}

function applyPlanFilters() {
    filterDateFrom = (document.getElementById('filterDateFromInput')?.value || '');
    filterDateTo = (document.getElementById('filterDateToInput')?.value || '');
    // Re-render — use filtered set
    renderTaskTree();
    renderGantt();
}

function toggleFilterAssignee(uid) {
    const idx = filterAssignees.indexOf(uid);
    if (idx >= 0) filterAssignees.splice(idx, 1);
    else filterAssignees.push(uid);
    renderPlanFilterPanel();
    applyPlanFilters();
}

function clearPlanFilters() {
    filterDateFrom = '';
    filterDateTo = '';
    filterAssignees = [];
    renderPlanFilterPanel();
    applyPlanFilters();
}

function getFilteredTasks() {
    if (!filterDateFrom && !filterDateTo && filterAssignees.length === 0) return tasks.slice();
    return tasks.filter(t => {
        // Date range filter — task overlaps range if start_date <= dateTo AND end_date >= dateFrom
        if (filterDateFrom && t.end_date && t.end_date < filterDateFrom) return false;
        if (filterDateTo && t.start_date && t.start_date > filterDateTo) return false;
        // Assignees filter — task matches if any assignee is in filterAssignees
        if (filterAssignees.length > 0) {
            const tAssignees = Array.isArray(t.assignees) ? t.assignees : [];
            if (!tAssignees.some(a => filterAssignees.includes(a))) return false;
        }
        return true;
    });
}

function getVisibleTaskSet() {
    // Returns a Set of task_ids visible after applying filters AND preserving ancestors
    // of any visible task (so parent rows stay in the tree even when filter excludes them).
    const visible = getFilteredTasks();
    const keepIds = new Set(visible.map(t => t.task_id));
    // Walk ancestors
    const tasksById = new Map(tasks.map(t => [t.task_id, t]));
    visible.forEach(t => {
        let p = t.parent_task_id;
        while (p) {
            if (keepIds.has(p)) break; // already included — stop walking
            keepIds.add(p);
            const pt = tasksById.get(p);
            p = pt?.parent_task_id || null;
        }
    });
    return keepIds;
}

function computeWeightedProgress(rootTaskId, allTasks) {
    // Recursively gather all leaf descendants of rootTaskId (D-12 weighted-by-duration leaf-only).
    // Always uses the FULL tasks array — filters affect what's RENDERED, rollup math uses truth.
    const childrenByParent = new Map();
    allTasks.forEach(t => {
        const key = t.parent_task_id || '__root__';
        if (!childrenByParent.has(key)) childrenByParent.set(key, []);
        childrenByParent.get(key).push(t);
    });
    const leaves = [];
    function walk(id) {
        const kids = childrenByParent.get(id) || [];
        if (kids.length === 0) {
            const self = allTasks.find(x => x.task_id === id);
            if (self) leaves.push(self);
            return;
        }
        kids.forEach(k => walk(k.task_id));
    }
    walk(rootTaskId);
    if (leaves.length === 0) return 0;
    let ws = 0, wt = 0;
    leaves.forEach(l => {
        const dur = (function(s, e) {
            if (!s || !e) return 1;
            const sd = new Date(s); sd.setHours(0,0,0,0);
            const ed = new Date(e); ed.setHours(0,0,0,0);
            return Math.max(1, Math.round((ed - sd) / 86400000) + 1);
        })(l.start_date, l.end_date);
        const p = typeof l.progress === 'number' ? l.progress : 0;
        ws += p * dur; wt += dur;
    });
    return wt > 0 ? Math.round(ws / wt) : 0;
}

// ---- Modal CRUD (Plan 04) ----

let modalEditingTaskId = null;            // null = Add mode; task_id = Edit mode
let modalSelectedAssignees = [];          // mirrors detailSelectedPersonnel pattern from project-detail.js

function openAddTaskModal() {
    if (!currentProject || !currentProject.project_code) {
        showToast(`This project doesn't have a project code yet. Assign a client to issue the code, then return to plan tasks.`, 'warning');
        return;
    }
    modalEditingTaskId = null;
    modalSelectedAssignees = [];
    const today = new Date();
    const week = new Date(today.getTime() + 7 * 86400000);
    const fmt = d => d.toISOString().slice(0, 10);
    renderTaskFormModal({
        mode: 'add',
        task: { name: '', description: '', start_date: fmt(today), end_date: fmt(week), parent_task_id: '', dependencies: [], is_milestone: false, assignees: [] }
    });
}

function openEditTaskModal(taskId) {
    const t = tasks.find(x => x.task_id === taskId);
    if (!t) return;
    modalEditingTaskId = taskId;
    modalSelectedAssignees = Array.isArray(t.assignees) ? [...t.assignees] : [];
    renderTaskFormModal({
        mode: 'edit',
        task: {
            name: t.name || '',
            description: t.description || '',
            start_date: t.start_date || '',
            end_date: t.end_date || '',
            parent_task_id: t.parent_task_id || '',
            dependencies: Array.isArray(t.dependencies) ? [...t.dependencies] : [],
            is_milestone: !!t.is_milestone,
            assignees: Array.isArray(t.assignees) ? [...t.assignees] : []
        }
    });
}

function renderTaskFormModal({ mode, task }) {
    const mount = document.getElementById('taskFormModalMount');
    if (!mount) return;
    const isParentTask = modalEditingTaskId && tasks.some(x => x.parent_task_id === modalEditingTaskId);
    const datesDisabled = isParentTask;
    const projectPersonnel = normalizePersonnel(currentProject); // { names, userIds }
    const personnelOptions = (projectPersonnel.userIds || []).map((uid, i) => {
        const name = projectPersonnel.names?.[i] || uid;
        const isOn = modalSelectedAssignees.includes(uid);
        return `<span class="personnel-pill${isOn ? ' selected' : ''}" data-uid="${escapeHTML(uid)}" data-action="toggle-task-assignee">${escapeHTML(name)}</span>`;
    }).join('');

    // Parent dropdown — exclude self + descendants of self
    const excluded = new Set();
    if (modalEditingTaskId) {
        excluded.add(modalEditingTaskId);
        const collectDesc = (id) => {
            tasks.filter(x => x.parent_task_id === id).forEach(c => { excluded.add(c.task_id); collectDesc(c.task_id); });
        };
        collectDesc(modalEditingTaskId);
    }
    const parentOptions = ['<option value="">— No parent (root task)</option>']
        .concat(tasks
            .filter(x => !excluded.has(x.task_id))
            .map(x => `<option value="${escapeHTML(x.task_id)}"${task.parent_task_id === x.task_id ? ' selected' : ''}>${escapeHTML(x.name || x.task_id)}</option>`))
        .join('');

    // Dependencies multi-select — exclude self + ancestors + descendants
    const depExcluded = new Set(excluded);
    if (modalEditingTaskId) {
        const collectAnc = (id) => {
            const t2 = tasks.find(x => x.task_id === id);
            if (t2 && t2.parent_task_id) { depExcluded.add(t2.parent_task_id); collectAnc(t2.parent_task_id); }
        };
        collectAnc(modalEditingTaskId);
    }
    const depOptions = tasks
        .filter(x => !depExcluded.has(x.task_id))
        .map(x => `<option value="${escapeHTML(x.task_id)}"${(task.dependencies || []).includes(x.task_id) ? ' selected' : ''}>${escapeHTML(x.name || x.task_id)}</option>`)
        .join('');

    mount.innerHTML = `
        <div class="modal" id="taskFormModal" style="display: flex;" aria-modal="true" role="dialog">
            <div class="modal-content" style="max-width: 560px;">
                <div class="modal-header">
                    <h3>${mode === 'add' ? 'Add Task' : 'Edit Task'}</h3>
                    <button type="button" class="modal-close" onclick="window.closeTaskFormModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <label class="form-label" for="taskNameInput">Name</label>
                    <input id="taskNameInput" class="form-control" type="text" value="${escapeHTML(task.name)}" required>

                    <label class="form-label" for="taskDescInput">Description</label>
                    <textarea id="taskDescInput" class="form-control" rows="3">${escapeHTML(task.description)}</textarea>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div>
                            <label class="form-label" for="taskStartInput">Start date</label>
                            <input id="taskStartInput" class="form-control" type="date" value="${escapeHTML(task.start_date)}"${datesDisabled ? ' disabled' : ''}>
                        </div>
                        <div>
                            <label class="form-label" for="taskEndInput">End date</label>
                            <input id="taskEndInput" class="form-control" type="date" value="${escapeHTML(task.end_date)}"${datesDisabled ? ' disabled' : ''}>
                        </div>
                    </div>
                    ${datesDisabled ? '<p style="font-style: italic; color: var(--gray-700, #475569); font-size: 12px;">Computed from subtasks</p>' : ''}

                    <label class="form-label" for="taskParentInput">Parent task</label>
                    <select id="taskParentInput" class="form-control">${parentOptions}</select>

                    <label class="form-label" for="taskDepsInput">Depends on (Finish-to-Start)</label>
                    <select id="taskDepsInput" class="form-control" multiple size="5">${depOptions}</select>

                    <label class="form-label" style="display: flex; align-items: center; gap: 8px;">
                        <input id="taskMilestoneInput" type="checkbox"${task.is_milestone ? ' checked' : ''}>
                        Mark as milestone
                    </label>

                    <label class="form-label">Assignees</label>
                    <div id="taskAssigneesPills" class="personnel-pills-container">
                        ${personnelOptions || '<span style="color: var(--gray-700, #475569); font-size: 13px;">No personnel assigned to this project. Add personnel on the project detail page first.</span>'}
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="window.closeTaskFormModal()">Cancel</button>
                    <button type="button" class="btn btn-primary" onclick="window.saveTaskFromModal()">Save Task</button>
                </div>
            </div>
        </div>
    `;
    mount.querySelectorAll('#taskAssigneesPills .personnel-pill[data-action="toggle-task-assignee"]').forEach(pill => {
        pill.addEventListener('click', () => toggleTaskAssignee(pill.dataset.uid));
    });
}

function closeTaskFormModal() {
    const mount = document.getElementById('taskFormModalMount');
    if (mount) mount.innerHTML = '';
    modalEditingTaskId = null;
    modalSelectedAssignees = [];
}

function toggleTaskAssignee(uid) {
    const idx = modalSelectedAssignees.indexOf(uid);
    if (idx >= 0) modalSelectedAssignees.splice(idx, 1);
    else modalSelectedAssignees.push(uid);
    // Re-render only the pills (cheap)
    const container = document.getElementById('taskAssigneesPills');
    if (!container) return;
    const projectPersonnel = normalizePersonnel(currentProject);
    container.innerHTML = (projectPersonnel.userIds || []).map((uid2, i) => {
        const name = projectPersonnel.names?.[i] || uid2;
        const isOn = modalSelectedAssignees.includes(uid2);
        return `<span class="personnel-pill${isOn ? ' selected' : ''}" data-uid="${escapeHTML(uid2)}" data-action="toggle-task-assignee">${escapeHTML(name)}</span>`;
    }).join('');
    container.querySelectorAll('.personnel-pill[data-action="toggle-task-assignee"]').forEach(pill => {
        pill.addEventListener('click', () => toggleTaskAssignee(pill.dataset.uid));
    });
}

// ---- Delete cascade (Plan 04 Task 3) ----

function confirmDeleteTask(taskId) {
    const t = tasks.find(x => x.task_id === taskId);
    if (!t) return;
    const children = tasks.filter(x => x.parent_task_id === taskId);
    const hasChildren = children.length > 0;
    // Walk subtree for full count
    function countSubtree(id) {
        const direct = tasks.filter(x => x.parent_task_id === id);
        return direct.length + direct.reduce((acc, c) => acc + countSubtree(c.task_id), 0);
    }
    const totalSubtaskCount = hasChildren ? countSubtree(taskId) : 0;
    const title = hasChildren ? 'Delete Task and Subtasks?' : 'Delete Task?';
    const body = hasChildren
        ? `Delete '${escapeHTML(t.name || taskId)}' and its ${totalSubtaskCount} subtask${totalSubtaskCount > 1 ? 's' : ''}? This cannot be undone.`
        : `Delete '${escapeHTML(t.name || taskId)}'? This cannot be undone.`;
    const confirmLabel = hasChildren ? 'Delete All' : 'Delete';
    const mount = document.getElementById('deleteTaskConfirmModalMount');
    if (!mount) return;
    mount.innerHTML = `
        <div class="modal" id="deleteTaskConfirmModal" style="display: flex;" aria-modal="true" role="dialog">
            <div class="modal-content" style="max-width: 440px;">
                <div class="modal-header"><h3 class="text-danger">${title}</h3></div>
                <div class="modal-body">${body}</div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="window.closeDeleteTaskConfirm()">Cancel</button>
                    <button type="button" class="btn btn-danger" data-action="delete-task" data-task-id="${escapeHTML(taskId)}">${confirmLabel}</button>
                </div>
            </div>
        </div>
    `;
    const confirmBtn = mount.querySelector('[data-action="delete-task"]');
    if (confirmBtn) confirmBtn.addEventListener('click', () => deleteTaskNow(confirmBtn.dataset.taskId));
}

function closeDeleteTaskConfirm() {
    const mount = document.getElementById('deleteTaskConfirmModalMount');
    if (mount) mount.innerHTML = '';
}

async function deleteTaskNow(taskId) {
    const t = tasks.find(x => x.task_id === taskId);
    if (!t) return;

    // Collect the subtree (children-first order)
    const allIds = [];
    function collect(id) {
        const kids = tasks.filter(x => x.parent_task_id === id);
        kids.forEach(k => collect(k.task_id));
        allIds.push(id);
    }
    collect(taskId);

    showLoading(true);
    try {
        // writeBatch supports up to 500 ops — chunk into 450-op batches to stay safely under the limit.
        // (Theoretically 500 hits the hard cap; 450 leaves headroom for any future batch-internal ops.)
        const CHUNK = 450;
        for (let i = 0; i < allIds.length; i += CHUNK) {
            const slice = allIds.slice(i, i + CHUNK);
            const batch = writeBatch(db);
            slice.forEach(id => batch.delete(doc(db, 'project_tasks', id)));
            await batch.commit();
        }

        // Recompute the deleted node's parent (the deleted node is gone; parent's envelope shrinks).
        // Pass the deleted ids as excludeIds because the local `tasks[]` snapshot may not have refreshed
        // yet (Firestore onSnapshot is async after writes) — without exclude, the parent recompute
        // would see the just-deleted children and write stale dates.
        if (t.parent_task_id) await recomputeParentDates(t.parent_task_id, new Set(allIds));

        closeDeleteTaskConfirm();
        showToast('Task deleted.', 'success');
    } catch (err) {
        console.error('[ProjectPlan] deleteTaskNow failed:', err);
        if (err?.code === 'permission-denied') {
            showToast(`You don't have permission to edit tasks on this project.`, 'error');
        } else {
            showToast('Could not delete task. Please try again.', 'error');
        }
    } finally {
        showLoading(false);
    }
}

// ---- Cycle detection + save + parent recompute (Plan 04 Task 2) ----

function detectDependencyCycle(candidateDeps, taskId) {
    // Build adjacency: from -> to[]
    const adj = new Map();
    tasks.forEach(t => {
        if (t.task_id === taskId) return; // skip the task being saved (use candidate deps instead)
        const deps = Array.isArray(t.dependencies) ? t.dependencies : [];
        adj.set(t.task_id, deps.slice());
    });
    adj.set(taskId, candidateDeps.slice());

    // DFS for cycle starting from taskId. Track stack to reconstruct path.
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    const parent = new Map();
    let cyclePath = null;

    function dfs(node) {
        color.set(node, GRAY);
        const nbrs = adj.get(node) || [];
        for (const nb of nbrs) {
            if (color.get(nb) === GRAY) {
                // Cycle detected: walk parent[] from node back to nb to reconstruct
                const path = [nb, node];
                let cur = node;
                while (cur !== nb && parent.get(cur) != null && cur !== undefined) {
                    cur = parent.get(cur);
                    path.push(cur);
                }
                path.reverse();
                cyclePath = path;
                return true;
            }
            if (color.get(nb) === WHITE || color.get(nb) === undefined) {
                parent.set(nb, node);
                if (dfs(nb)) return true;
            }
        }
        color.set(node, BLACK);
        return false;
    }
    dfs(taskId);
    if (!cyclePath) return null;
    // Map ids → names
    const tasksById = new Map(tasks.map(t => [t.task_id, t]));
    const names = cyclePath.map(id => (tasksById.get(id)?.name) || id);
    return names;
}

async function saveTaskFromModal() {
    // Validate
    const name = (document.getElementById('taskNameInput')?.value || '').trim();
    const description = (document.getElementById('taskDescInput')?.value || '').trim();
    const startInput = document.getElementById('taskStartInput');
    const endInput = document.getElementById('taskEndInput');
    const start_date = startInput?.disabled ? '' : (startInput?.value || '');
    const end_date = endInput?.disabled ? '' : (endInput?.value || '');
    const parent_task_id = (document.getElementById('taskParentInput')?.value || '') || null;
    const depsSelect = document.getElementById('taskDepsInput');
    const dependencies = depsSelect ? Array.from(depsSelect.selectedOptions).map(o => o.value) : [];
    const is_milestone = !!document.getElementById('taskMilestoneInput')?.checked;
    const assignees = [...modalSelectedAssignees];

    if (!name) { showToast('Task name is required.', 'error'); return; }
    // For parent tasks, dates are computed — accept whatever is on the doc; otherwise validate.
    if (start_date && end_date && end_date < start_date) {
        showToast('End date must be on or after start date.', 'error');
        return;
    }

    // Cycle check (D-13)
    const targetTaskId = modalEditingTaskId || `__candidate__`;
    const cycleNames = detectDependencyCycle(dependencies, targetTaskId);
    if (cycleNames) {
        // Path already starts and ends at the same node from reconstruction — no extra suffix.
        showToast(`This dependency would create a cycle: ${cycleNames.join(' → ')}. Remove one of the deps to continue.`, 'error');
        return;
    }

    showLoading(true);
    try {
        const userId = (typeof window.getCurrentUser === 'function') ? (window.getCurrentUser()?.uid || null) : null;
        // For new tasks: generateTaskId uses a scan-then-write pattern that can race when two
        // creates land within the same snapshot window. Re-generate up to N times if the picked
        // id already exists on disk (D-19 mitigation; full fix would be a counter doc + transaction).
        let taskId;
        if (modalEditingTaskId) {
            taskId = modalEditingTaskId;
        } else {
            const MAX_ID_RETRIES = 5;
            for (let attempt = 0; attempt < MAX_ID_RETRIES; attempt++) {
                const candidate = await generateTaskId(currentProject.project_code);
                const existing = await getDoc(doc(db, 'project_tasks', candidate));
                if (!existing.exists()) { taskId = candidate; break; }
            }
            if (!taskId) {
                showToast('Could not allocate a task id — please try again.', 'error');
                return;
            }
        }
        const docData = {
            task_id: taskId,
            project_id: currentProject.id,
            project_code: currentProject.project_code,         // denormalized for D-18 rule
            parent_task_id: parent_task_id,
            name: name,
            description: description,
            progress: modalEditingTaskId
                ? (tasks.find(x => x.task_id === modalEditingTaskId)?.progress ?? 0)
                : 0,
            is_milestone: is_milestone,
            dependencies: dependencies,
            assignees: assignees,
            updated_at: serverTimestamp()
        };
        // Only persist start/end when the inputs are enabled — for parent tasks the dates are
        // computed from children (D-11) and writing '' here would clobber the persisted envelope.
        if (!startInput?.disabled && start_date) docData.start_date = start_date;
        if (!endInput?.disabled && end_date) docData.end_date = end_date;
        if (!modalEditingTaskId) {
            docData.created_at = serverTimestamp();
            docData.created_by = userId;
            if (!docData.start_date || !docData.end_date) {
                showToast('Start and end dates are required for new tasks.', 'error');
                return;
            }
        }

        await setDoc(doc(db, 'project_tasks', taskId), docData, { merge: !!modalEditingTaskId });

        // Patch local tasks[] in place so recomputeParentDates sees the just-saved values
        // — Firestore's onSnapshot fires asynchronously after writes, so module-state tasks[]
        // would otherwise miss new children entirely or still hold the OLD parent_task_id for
        // reparented tasks (causing double-count on the old parent's recompute).
        const oldTask = modalEditingTaskId ? tasks.find(x => x.task_id === modalEditingTaskId) : null;
        const oldParent = oldTask?.parent_task_id || null;
        const patched = {
            id: taskId,
            task_id: taskId,
            project_id: currentProject.id,
            project_code: currentProject.project_code,
            parent_task_id: parent_task_id,
            name: name,
            description: description,
            progress: docData.progress,
            is_milestone: is_milestone,
            dependencies: dependencies,
            assignees: assignees,
            start_date: docData.start_date ?? oldTask?.start_date ?? '',
            end_date: docData.end_date ?? oldTask?.end_date ?? ''
        };
        tasks = tasks.filter(x => x.task_id !== taskId).concat([patched]);

        // Parent recompute (D-11) — walk the chain
        // If the task moved between parents (edit case), recompute BOTH old and new parents.
        if (oldParent && oldParent !== parent_task_id) await recomputeParentDates(oldParent);
        if (parent_task_id) await recomputeParentDates(parent_task_id);

        closeTaskFormModal();
        showToast('Task saved.', 'success');
    } catch (err) {
        console.error('[ProjectPlan] saveTaskFromModal failed:', err);
        if (err?.code === 'permission-denied') {
            showToast(`You don't have permission to edit tasks on this project.`, 'error');
        } else {
            showToast('Could not save task. Please try again.', 'error');
        }
    } finally {
        showLoading(false);
    }
}

async function recomputeParentDates(parentTaskId, excludeIds = null) {
    if (!parentTaskId) return;
    // Children = direct children only (single-level; recursion happens when this fn re-fires up the chain).
    // excludeIds: Set of task_ids that were JUST deleted but may still appear in the local snapshot
    // because Firestore's onSnapshot fires asynchronously after writes. Callers (e.g. cascade delete)
    // pass the deleted ids here so the recompute sees the correct post-delete envelope, not the stale one.
    const exclude = excludeIds instanceof Set ? excludeIds : new Set();
    const children = tasks.filter(t => t.parent_task_id === parentTaskId && !exclude.has(t.task_id));
    if (children.length === 0) return;
    let minStart = null, maxEnd = null;
    children.forEach(c => {
        if (c.start_date && (!minStart || c.start_date < minStart)) minStart = c.start_date;
        if (c.end_date && (!maxEnd || c.end_date > maxEnd)) maxEnd = c.end_date;
    });
    if (!minStart || !maxEnd) return;
    const parent = tasks.find(t => t.task_id === parentTaskId);
    if (parent && parent.start_date === minStart && parent.end_date === maxEnd) return; // no change
    try {
        await updateDoc(doc(db, 'project_tasks', parentTaskId), {
            start_date: minStart,
            end_date: maxEnd,
            updated_at: serverTimestamp()
        });
        // Bubble up — propagate the exclude set so deeper ancestors also ignore the just-deleted ids
        if (parent?.parent_task_id) await recomputeParentDates(parent.parent_task_id, exclude);
    } catch (err) {
        console.warn('[ProjectPlan] recomputeParentDates: write failed for parent', parentTaskId, err?.code);
        if (err?.code === 'permission-denied') {
            showToast('Parent task dates could not be updated — your account may not have edit permission.', 'warning');
        }
    }
}

// ---- Inline progress slider write helper (Plan 04 Task 4) ----

async function editTaskProgress(taskId, valueRaw) {
    const value = Math.max(0, Math.min(100, Math.round(Number(valueRaw))));
    const t = tasks.find(x => x.task_id === taskId);
    if (!t) return;
    if (value === t.progress) return;
    try {
        await updateDoc(doc(db, 'project_tasks', taskId), {
            progress: value,
            updated_at: serverTimestamp()
        });
        // Snapshot will refresh tree + Gantt; nothing else to do.
    } catch (err) {
        console.error('[ProjectPlan] progress write failed:', err);
        if (err?.code === 'permission-denied') {
            showToast(`You don't have permission to edit tasks on this project.`, 'error');
        } else {
            showToast('Could not save task. Please try again.', 'error');
        }
        renderTaskTree(); // revert UI to last-known-good
    }
}
