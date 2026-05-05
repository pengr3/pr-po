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

    showLoading();
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
        const tasksUnsub = onSnapshot(
            query(collection(db, 'project_tasks'), where('project_id', '==', currentProject.id)),
            (snap) => {
                tasks = [];
                snap.forEach(d => tasks.push({ id: d.id, ...d.data() }));
                renderTaskTree();
                if (typeof renderGantt === 'function') renderGantt();   // Plan 03 defines
                if (typeof refreshSummaryHighlights === 'function') refreshSummaryHighlights();  // Plan 05
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
    } finally {
        // showLoading() inverse handled by snapshot first-callback paint
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
    delete window.toggleTaskExpand;
    delete window.selectTaskRow;
    delete window.setGanttZoom;
    delete window.togglePlanFilters;
    delete window.openAddTaskModal;
    delete window.openEditTaskModal;
    delete window.confirmDeleteTask;
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

    // Build parent_task_id → children[] map
    const childrenByParent = new Map();
    tasks.forEach(t => {
        const key = t.parent_task_id || '__root__';
        if (!childrenByParent.has(key)) childrenByParent.set(key, []);
        childrenByParent.get(key).push(t);
    });
    // Sort children by start_date asc within each level (D-Discretion default)
    childrenByParent.forEach(arr => arr.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || '')));

    const rows = [];
    function walk(parentKey, depth) {
        const kids = childrenByParent.get(parentKey) || [];
        kids.forEach(t => {
            const hasChildren = childrenByParent.has(t.task_id);
            const isExpanded = expandedTaskIds.has(t.task_id);
            const chevronChar = hasChildren ? (isExpanded ? '⌄' : '›') : '';
            const isSelected = selectedTaskId === t.task_id;
            rows.push(`
                <div class="task-tree-row${isSelected ? ' selected' : ''}"
                     data-task-id="${escapeHTML(t.task_id)}"
                     tabindex="0"
                     style="padding-left: ${depth * 16 + 8}px;"
                     onclick="window.selectTaskRow('${escapeHTML(t.task_id)}')">
                    <span class="task-tree-chevron${hasChildren ? ' clickable' : ''}"
                          onclick="event.stopPropagation(); window.toggleTaskExpand('${escapeHTML(t.task_id)}')">${chevronChar}</span>
                    <span class="task-tree-name${t.is_milestone ? ' is-milestone' : ''}"
                          onclick="event.stopPropagation(); window.openEditTaskModal('${escapeHTML(t.task_id)}')">
                        ${escapeHTML(t.name || '(unnamed)')}
                    </span>
                    <span class="task-tree-progress">${typeof t.progress === 'number' ? t.progress : 0}%</span>
                </div>
            `);
            if (hasChildren && isExpanded) walk(t.task_id, depth + 1);
        });
    }
    walk('__root__', 0);
    container.innerHTML = rows.join('');
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

// ---- Stubs (Plan 03 + Plan 04 wire bodies) ----

function setGanttZoom(_mode) { /* Plan 03 wires this */ }
function togglePlanFilters() { /* Plan 05 wires this */ }
function openAddTaskModal() { showToast('Add Task — modal coming in Plan 04', 'info'); }
function openEditTaskModal(_taskId) { showToast('Edit Task — modal coming in Plan 04', 'info'); }
function confirmDeleteTask(_taskId) { showToast('Delete Task — modal coming in Plan 04', 'info'); }
