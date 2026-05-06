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

// Phase 86.1 — grid state
let rowOrderCache = new Map();    // task_id -> 1-based row#, rebuilt every snapshot
let _gridInputHandler = null;     // capture-phase blur handler for tg-input elements
let _gridChangeHandler = null;    // change handler for tg-date-input
let _gridContextMenuHandler = null; // Plan 02 hook (declare now, body added in Plan 02)

// Plan 04 — Gantt drag-to-link state
let ganttDragState = null;       // { fromTaskId, svgLine } during drag-to-link, null otherwise

// Plan 02 — drag-and-drop state
let _gridDragStartHandler = null;
let _gridDragOverHandler = null;
let _gridDropHandler = null;
let _gridDragEndHandler = null;
let _draggedTaskId = null;        // currently-dragged task_id during drag
let _gridKeydownHandler = null;   // keydown Enter handler for Duration/Resources cells (86.2)

// Plan 03 — resizable panel divider state
let _resizeMouseMoveHandler = null;
let _resizeMouseUpHandler = null;
let _resizeDragging = false;

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
                <!-- No Filters button (D-Q2: filter panel removed in 86.1) -->
            </div>
            <div class="plan-split-pane" id="planSplitPane">
                <div class="task-grid-rail" id="taskGridRail" aria-label="Task grid">
                    <div class="empty-state"><h3>Loading…</h3></div>
                </div>
                <div class="plan-divider" id="planDivider" aria-hidden="true"></div>
                <div class="gantt-pane">
                    <div id="ganttPane"></div>
                </div>
            </div>
        </div>
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
            const tree = document.getElementById('taskGridRail');
            if (tree) {
                tree.innerHTML = `
                    <div class="empty-state">
                        <h3>No project code</h3>
                        <p>This project doesn't have a project code yet. Assign a client to issue the code, then return to plan tasks.</p>
                    </div>`;
            }
            return;
        }

        // 3. Subscribe to project_tasks (project-scoped at JS query layer per D-18)
        // __snapshotCount is module-scoped; destroy() resets it alongside __lastViolationFingerprint
        // so the first-snapshot toast suppression and the dedupe fingerprint stay in sync.
        __snapshotCount = 0;
        const tasksUnsub = onSnapshot(
            query(collection(db, 'project_tasks'), where('project_id', '==', currentProject.id)),
            (snap) => {
                tasks = [];
                snap.forEach(d => tasks.push({ id: d.id, ...d.data() }));
                renderTaskGrid();
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
        window.setGanttZoom = setGanttZoom;
        window.deleteTaskNow = deleteTaskNow;
        window.editTaskProgress = editTaskProgress;
        window.handleNewRowKeydown = handleNewRowKeydown;
        window.gridIndentTask = gridIndentTask;
        window.gridOutdentTask = gridOutdentTask;
        window.gridInsertRowAbove = gridInsertRowAbove;
        window.gridDeleteRow = gridDeleteRow;
        initPanelResize();
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
    ganttDragState = null;
    tasks = [];
    currentProject = null;
    projectCode = null;
    __ganttInitialScrollDone = false;
    __lastViolationFingerprint = '';
    __snapshotCount = 0;
    // Grid handler cleanup
    const gridContainer = document.getElementById('taskGridRail');
    if (gridContainer) {
        if (_gridInputHandler) gridContainer.removeEventListener('blur', _gridInputHandler, true);
        if (_gridChangeHandler) gridContainer.removeEventListener('change', _gridChangeHandler);
        if (_gridContextMenuHandler) gridContainer.removeEventListener('contextmenu', _gridContextMenuHandler);
        if (_gridDragStartHandler) gridContainer.removeEventListener('dragstart', _gridDragStartHandler);
        if (_gridDragOverHandler) gridContainer.removeEventListener('dragover', _gridDragOverHandler);
        if (_gridDropHandler) gridContainer.removeEventListener('drop', _gridDropHandler);
        if (_gridDragEndHandler) gridContainer.removeEventListener('dragend', _gridDragEndHandler);
        if (_gridKeydownHandler) gridContainer.removeEventListener('keydown', _gridKeydownHandler);
    }
    _gridInputHandler = null;
    _gridChangeHandler = null;
    _gridContextMenuHandler = null;
    _gridDragStartHandler = null;
    _gridDragOverHandler = null;
    _gridDropHandler = null;
    _gridDragEndHandler = null;
    _gridKeydownHandler = null;
    _draggedTaskId = null;
    rowOrderCache = new Map();
    delete window.setGanttZoom;
    delete window.deleteTaskNow;
    delete window.editTaskProgress;
    delete window.handleNewRowKeydown;
    delete window.gridIndentTask;
    delete window.gridOutdentTask;
    delete window.gridInsertRowAbove;
    delete window.gridDeleteRow;
    // Clean up any open context menu so it doesn't survive view destruction
    document.getElementById('taskGridContextMenu')?.remove();
    document.getElementById('planDeleteConfirm')?.remove();
    // Resize handler cleanup
    if (_resizeMouseMoveHandler) document.removeEventListener('mousemove', _resizeMouseMoveHandler);
    if (_resizeMouseUpHandler)   document.removeEventListener('mouseup',   _resizeMouseUpHandler);
    _resizeMouseMoveHandler = null;
    _resizeMouseUpHandler   = null;
    _resizeDragging = false;
}

// ---- Resizable panel divider ----

function initPanelResize() {
    const divider = document.getElementById('planDivider');
    const splitPane = document.getElementById('planSplitPane');
    if (!divider || !splitPane) return;

    divider.addEventListener('mousedown', (e) => {
        _resizeDragging = true;
        divider.classList.add('dragging');
        e.preventDefault();
    });

    _resizeMouseMoveHandler = function(e) {
        if (!_resizeDragging) return;
        const rect = splitPane.getBoundingClientRect();
        const pct = Math.max(15, Math.min(75, ((e.clientX - rect.left) / rect.width) * 100));
        splitPane.style.gridTemplateColumns = pct.toFixed(1) + '% 4px 1fr';
    };

    _resizeMouseUpHandler = function() {
        if (!_resizeDragging) return;
        _resizeDragging = false;
        divider.classList.remove('dragging');
    };

    document.addEventListener('mousemove', _resizeMouseMoveHandler);
    document.addEventListener('mouseup', _resizeMouseUpHandler);
}

// ---- Grid rendering (left rail) ----

// Module-scope isDescendant — used by _gridDragOverHandler and handleRowDrop.
// Returns true if candidateId is a descendant of ancestorId in the task hierarchy.
function isDescendant(candidateId, ancestorId) {
    let cur = tasks.find(x => x.task_id === candidateId);
    while (cur?.parent_task_id) {
        if (cur.parent_task_id === ancestorId) return true;
        cur = tasks.find(x => x.task_id === cur.parent_task_id);
    }
    return false;
}

function renderTaskGrid() {
    const container = document.getElementById('taskGridRail');
    if (!container) return;

    // Sort by row_order asc. Tasks without row_order get Infinity (sort to bottom).
    const sorted = tasks.slice().sort((a, b) => (a.row_order ?? Infinity) - (b.row_order ?? Infinity));

    // Rebuild stable row-number cache (task_id -> 1-based row#)
    rowOrderCache = new Map();
    sorted.forEach((t, i) => rowOrderCache.set(t.task_id, i + 1));

    if (sorted.length === 0) {
        container.innerHTML = `
            <table class="task-grid">
              <thead><tr>
                <th class="tg-rn">#</th>
                <th class="tg-name">Name</th>
                <th class="tg-dur">Duration</th>
                <th class="tg-date">Start</th>
                <th class="tg-date">End</th>
                <th class="tg-pred">Predecessors</th>
                <th class="tg-res">Resources</th>
              </tr></thead>
              <tbody id="taskGridBody">
                <tr class="tg-empty-row" data-task-id="__new__">
                  <td class="tg-rn"></td>
                  <td class="tg-name"><input class="tg-input tg-name-input" placeholder="Add task..." data-col="name" data-task-id="__new__" onkeydown="window.handleNewRowKeydown(event)"></td>
                  <td colspan="5"></td>
                </tr>
              </tbody>
            </table>`;
        bindGridEvents(container);
        return;
    }

    const depsByTarget = new Map(); // task_id -> predecessor row#s string (for Predecessors column)
    // Build from dependencies[] on each task
    sorted.forEach(t => {
        if (!Array.isArray(t.dependencies) || t.dependencies.length === 0) return;
        const rowNums = t.dependencies
            .map(depId => rowOrderCache.get(depId))
            .filter(Boolean)
            .join(',');
        depsByTarget.set(t.task_id, rowNums);
    });

    const isParentSet = new Set(tasks.filter(t => t.parent_task_id).map(t => t.parent_task_id));

    const rowsHtml = sorted.map(t => {
        const rowNum = rowOrderCache.get(t.task_id);
        const isParent = isParentSet.has(t.task_id);
        const depth = computeDepth(t.task_id);
        const indent = depth * 16;
        const predStr = depsByTarget.get(t.task_id) || '';
        const durStr = computeDurationDisplay(t.start_date, t.end_date);

        const parentLockAttr = isParent ? ' data-parent-locked="1"' : '';
        const parentStyle = isParent ? 'style="color:var(--gray-700,#475569);font-style:italic;"' : '';

        return `
          <tr class="tg-row" data-task-id="${escapeHTML(t.task_id)}" draggable="true">
            <td class="tg-rn">${rowNum}</td>
            <td class="tg-name" style="padding-left:${indent}px;">
              <input class="tg-input tg-name-input" value="${escapeHTML(t.name || '')}" data-col="name"
                     data-task-id="${escapeHTML(t.task_id)}">
            </td>
            <td class="tg-dur"${parentLockAttr}>
              ${isParent
                ? `<span class="tg-locked" ${parentStyle} title="Dates are computed from subtasks.">${escapeHTML(durStr)}</span>`
                : `<input class="tg-input tg-dur-input" value="${escapeHTML(durStr)}" data-col="duration"
                          data-task-id="${escapeHTML(t.task_id)}">`}
            </td>
            <td class="tg-date"${parentLockAttr}>
              ${isParent
                ? `<span class="tg-locked" ${parentStyle} title="Dates are computed from subtasks.">${escapeHTML(t.start_date || '')}</span>`
                : `<input class="tg-input tg-date-input" type="date" value="${escapeHTML(t.start_date || '')}"
                          data-col="start" data-task-id="${escapeHTML(t.task_id)}">`}
            </td>
            <td class="tg-date"${parentLockAttr}>
              ${isParent
                ? `<span class="tg-locked" ${parentStyle} title="Dates are computed from subtasks.">${escapeHTML(t.end_date || '')}</span>`
                : `<input class="tg-input tg-date-input" type="date" value="${escapeHTML(t.end_date || '')}"
                          data-col="end" data-task-id="${escapeHTML(t.task_id)}">`}
            </td>
            <td class="tg-pred">
              <input class="tg-input tg-pred-input" value="${escapeHTML(predStr)}" data-col="predecessors"
                     data-task-id="${escapeHTML(t.task_id)}">
            </td>
            <td class="tg-res">
              <input class="tg-input tg-res-input" value="${escapeHTML(t.resources || '')}"
                     data-col="resources" data-task-id="${escapeHTML(t.task_id)}">
            </td>
          </tr>`;
    }).join('');

    // Empty trailing row for add-via-click (D-04)
    const emptyRow = `
      <tr class="tg-row tg-empty-row" data-task-id="__new__">
        <td class="tg-rn"></td>
        <td class="tg-name"><input class="tg-input tg-name-input" placeholder="Add task..." data-col="name" data-task-id="__new__" onkeydown="window.handleNewRowKeydown(event)"></td>
        <td colspan="5"></td>
      </tr>`;

    bindGridEvents(container);

    container.innerHTML = `
      <table class="task-grid">
        <thead><tr>
          <th class="tg-rn">#</th>
          <th class="tg-name">Name</th>
          <th class="tg-dur">Duration</th>
          <th class="tg-date">Start</th>
          <th class="tg-date">End</th>
          <th class="tg-pred">Predecessors</th>
          <th class="tg-res">Resources</th>
        </tr></thead>
        <tbody id="taskGridBody">${rowsHtml}${emptyRow}</tbody>
      </table>`;
}

function bindGridEvents(container) {
    // Remove old handlers first (safe re-bind on re-render)
    if (_gridInputHandler) container.removeEventListener('blur', _gridInputHandler, true);
    if (_gridChangeHandler) container.removeEventListener('change', _gridChangeHandler);
    if (_gridContextMenuHandler) container.removeEventListener('contextmenu', _gridContextMenuHandler);

    // Blur (capture phase) — fires on input blur regardless of which child loses focus
    _gridInputHandler = function(e) {
        const input = e.target;
        if (!input.classList.contains('tg-input')) return;
        const taskId = input.dataset.taskId;
        const col = input.dataset.col;
        if (!taskId || !col) return;
        if (taskId === '__new__') { handleNewRowCommit(input); return; }
        handleGridCellBlur(taskId, col, input.value.trim());
    };
    container.addEventListener('blur', _gridInputHandler, true); // capture phase for blur

    // Change — date inputs fire 'change' not 'blur' reliably across browsers
    _gridChangeHandler = function(e) {
        const input = e.target;
        if (!input.classList.contains('tg-date-input')) return;
        const taskId = input.dataset.taskId;
        const col = input.dataset.col;
        if (!taskId || !col || taskId === '__new__') return;
        handleGridCellBlur(taskId, col, input.value);
    };
    container.addEventListener('change', _gridChangeHandler);

    // Context menu (Plan 02)
    _gridContextMenuHandler = function(e) {
        const row = e.target.closest('.tg-row');
        if (!row || row.dataset.taskId === '__new__') return;
        e.preventDefault();
        showTaskContextMenu(e, row.dataset.taskId);
    };
    container.addEventListener('contextmenu', _gridContextMenuHandler);

    // HTML5 drag-and-drop row reorder (Plan 02 D-Q4)
    if (_gridDragStartHandler) container.removeEventListener('dragstart', _gridDragStartHandler);
    if (_gridDragOverHandler) container.removeEventListener('dragover', _gridDragOverHandler);
    if (_gridDropHandler) container.removeEventListener('drop', _gridDropHandler);
    if (_gridDragEndHandler) container.removeEventListener('dragend', _gridDragEndHandler);

    _gridDragStartHandler = function(e) {
        // DEFECT-3 fix: only allow drag from the row-number (.tg-rn) cell (drag handle)
        const handle = e.target.closest('.tg-rn');
        if (!handle) { e.preventDefault(); return; }
        const row = handle.closest('.tg-row');
        if (!row || row.dataset.taskId === '__new__') { e.preventDefault(); return; }
        _draggedTaskId = row.dataset.taskId;
        row.classList.add('tg-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', _draggedTaskId);
    };
    container.addEventListener('dragstart', _gridDragStartHandler);

    _gridDragOverHandler = function(e) {
        const row = e.target.closest('.tg-row');
        if (!row || !_draggedTaskId) return;
        if (row.dataset.taskId === _draggedTaskId) return;
        if (row.dataset.taskId === '__new__') return;
        // D-Q4: do not allow dragging into own subtree — skip highlight + prevent
        if (isDescendant(row.dataset.taskId, _draggedTaskId)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        // Visual hint
        container.querySelectorAll('.tg-row.tg-drag-over').forEach(r => r.classList.remove('tg-drag-over'));
        row.classList.add('tg-drag-over');
    };
    container.addEventListener('dragover', _gridDragOverHandler);

    _gridDropHandler = function(e) {
        const row = e.target.closest('.tg-row');
        if (!row || !_draggedTaskId) return;
        e.preventDefault();
        const targetTaskId = row.dataset.taskId;
        if (targetTaskId === _draggedTaskId || targetTaskId === '__new__') return;
        handleRowDrop(_draggedTaskId, targetTaskId);
    };
    container.addEventListener('drop', _gridDropHandler);

    _gridDragEndHandler = function(e) {
        container.querySelectorAll('.tg-row.tg-dragging, .tg-row.tg-drag-over')
            .forEach(r => r.classList.remove('tg-dragging', 'tg-drag-over'));
        _draggedTaskId = null;
    };
    container.addEventListener('dragend', _gridDragEndHandler);

    // DEFECT-10 fix: Enter key commits Duration and Resources cells (delegates to existing blur path)
    if (_gridKeydownHandler) container.removeEventListener('keydown', _gridKeydownHandler);
    _gridKeydownHandler = function(e) {
        if (e.key !== 'Enter') return;
        const input = e.target;
        if (!input.classList.contains('tg-input')) return;
        if (input.dataset.taskId === '__new__') return; // handled by handleNewRowKeydown
        const col = input.dataset.col;
        if (col !== 'duration' && col !== 'resources') return; // only Duration and Resources per spec
        e.preventDefault();
        input.blur(); // triggers handleGridCellBlur via existing capture-phase blur listener
    };
    container.addEventListener('keydown', _gridKeydownHandler);
}

async function handleGridCellBlur(taskId, col, rawValue) {
    const t = tasks.find(x => x.task_id === taskId);
    if (!t) return;

    let updateData = null;

    if (col === 'name') {
        const name = rawValue.trim();
        if (!name || name === t.name) return;
        updateData = { name, updated_at: serverTimestamp() };

    } else if (col === 'duration') {
        // Parse "3d" / "2w" / bare integer (D-03)
        const days = parseDuration(rawValue);
        if (days === null) return;
        // Default start_date to today if empty
        const effectiveStart = t.start_date || formatDateISO(new Date());
        const endDate = addDays(effectiveStart, days - 1); // inclusive: 1d => same day
        if (effectiveStart === t.start_date && endDate === t.end_date) return;
        updateData = effectiveStart !== t.start_date
            ? { start_date: effectiveStart, end_date: endDate, updated_at: serverTimestamp() }
            : { end_date: endDate, updated_at: serverTimestamp() };

    } else if (col === 'start') {
        if (!rawValue || rawValue === t.start_date) return;
        const endDate = t.end_date || rawValue;
        if (endDate < rawValue) return; // invalid; keep
        updateData = { start_date: rawValue, updated_at: serverTimestamp() };

    } else if (col === 'end') {
        if (!rawValue || rawValue === t.end_date) return;
        if (t.start_date && rawValue < t.start_date) return; // invalid; keep
        updateData = { end_date: rawValue, updated_at: serverTimestamp() };

    } else if (col === 'predecessors') {
        // Resolve row#s to task_ids (D-Q3 stable row#)
        const depIds = rawValue.split(',').map(s => s.trim()).filter(Boolean)
            .map(n => { const num = parseInt(n, 10); return [...rowOrderCache.entries()].find(([, v]) => v === num)?.[0]; })
            .filter(Boolean);
        // Dedupe
        const deps = [...new Set(depIds)];
        // Cycle check
        const cycleNames = detectDependencyCycle(deps, taskId);
        if (cycleNames) {
            showToast(`This dependency would create a cycle: ${cycleNames.join(' → ')}. Remove one of the deps.`, 'error');
            renderTaskGrid(); // revert display
            return;
        }
        updateData = { dependencies: deps, updated_at: serverTimestamp() };
    } else if (col === 'resources') {
        const res = rawValue;
        if (res === (t.resources ?? '')) return;
        updateData = { resources: res, updated_at: serverTimestamp() };
    }

    if (!updateData) return;

    try {
        await updateDoc(doc(db, 'project_tasks', taskId), updateData);
        // Patch local for recomputeParentDates
        const idx = tasks.findIndex(x => x.task_id === taskId);
        if (idx >= 0) tasks[idx] = { ...tasks[idx], ...updateData };
        if (t.parent_task_id && (col === 'start' || col === 'end' || col === 'duration')) {
            await recomputeParentDates(t.parent_task_id);
        }
    } catch (err) {
        console.error('[ProjectPlan] grid cell write failed:', err);
        showToast(err?.code === 'permission-denied'
            ? `You don't have permission to edit tasks on this project.`
            : 'Could not save task. Please try again.', 'error');
        renderTaskGrid(); // revert
    }
}

async function handleNewRowCommit(input) {
    if (!input.value.trim()) return;          // re-entry guard: second call finds empty value → exits
    const name = input.value.trim();
    input.value = '';                          // clear synchronously before first await
    if (!currentProject?.project_code) {
        showToast(`This project doesn't have a project code yet.`, 'warning');
        return;
    }
    showLoading(true);
    try {
        // row_order: max existing + 1
        const maxOrder = tasks.reduce((m, t) => Math.max(m, t.row_order ?? 0), 0);
        const newRowOrder = maxOrder + 1;

        // generateTaskId with retry (mirrors saveTaskFromModal lines 1082–1093)
        let taskId;
        const MAX_ID_RETRIES = 5;
        for (let attempt = 0; attempt < MAX_ID_RETRIES; attempt++) {
            const candidate = await generateTaskId(currentProject.project_code);
            const existing = await getDoc(doc(db, 'project_tasks', candidate));
            if (!existing.exists()) { taskId = candidate; break; }
        }
        if (!taskId) { showToast('Could not allocate a task id — please try again.', 'error'); return; }

        // DEFECT-6 fix: new trailing row inherits parent from the last sorted task above it
        const sortedForInherit = tasks.slice().sort((a, b) => (a.row_order ?? Infinity) - (b.row_order ?? Infinity));
        const inheritedParentId = sortedForInherit[sortedForInherit.length - 1]?.parent_task_id ?? null;

        const docData = {
            task_id: taskId,
            project_id: currentProject.id,
            project_code: currentProject.project_code,
            parent_task_id: inheritedParentId,
            name,
            description: '',
            progress: 0,
            is_milestone: false,
            dependencies: [],
            assignees: [],
            resources: '',
            row_order: newRowOrder,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        };
        await setDoc(doc(db, 'project_tasks', taskId), docData);
        showToast('Task created.', 'success');
        // onSnapshot will fire → renderTaskGrid() + renderGantt()
    } catch (err) {
        console.error('[ProjectPlan] handleNewRowCommit failed:', err);
        showToast(err?.code === 'permission-denied'
            ? `You don't have permission to add tasks on this project.`
            : 'Could not create task. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// Commit new-row entry on Enter; cancel on Escape
function handleNewRowKeydown(event) {
    const input = event.target;
    if (!input || !input.classList.contains('tg-name-input')) return;
    if (input.dataset.taskId !== '__new__') return;
    if (event.key === 'Enter') {
        event.preventDefault();
        handleNewRowCommit(input);
    } else if (event.key === 'Escape') {
        input.value = '';
        input.blur();
    }
}

// ---- Task grid hierarchy + reorder operations (Plan 02) ----

// Right-click context menu — analog: procurement.js showRFPContextMenu
function showTaskContextMenu(event, taskId) {
    const existing = document.getElementById('taskGridContextMenu');
    if (existing) existing.remove();

    const t = tasks.find(x => x.task_id === taskId);
    if (!t) return;

    const rowEls = [...document.querySelectorAll('.tg-row:not(.tg-empty-row)')];
    const rowIdx = rowEls.findIndex(r => r.dataset.taskId === taskId);
    const isFirstRow = rowIdx === 0;
    const rowAbove = rowIdx > 0
        ? tasks.find(x => x.task_id === rowEls[rowIdx - 1]?.dataset.taskId)
        : null;

    // Indent disabled if: first row, or row above is a descendant of this task (would create cycle)
    const canIndent = !isFirstRow && rowAbove != null && !isDescendant(rowAbove.task_id, taskId);
    const canOutdent = !!t.parent_task_id;

    const hasChildren = tasks.some(x => x.parent_task_id === taskId);
    const childCount = hasChildren ? tasks.filter(x => x.parent_task_id === taskId).length : 0;

    const menu = document.createElement('div');
    menu.id = 'taskGridContextMenu';
    menu.style.cssText = `position:fixed;left:${event.clientX}px;top:${event.clientY}px;background:white;border:1px solid #e5e7eb;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:4px 0;z-index:10000;min-width:200px;`;

    menu.innerHTML = `
        <div style="padding:6px 16px;font-size:0.7rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">${escapeHTML(t.name || taskId)}</div>
        <div style="padding:8px 16px;cursor:${canIndent ? 'pointer' : 'not-allowed'};font-size:0.875rem;color:${canIndent ? '#1e293b' : '#9ca3af'};"
             ${canIndent ? `onmouseenter="this.style.background='#eff6ff'" onmouseleave="this.style.background='transparent'"
             onclick="document.getElementById('taskGridContextMenu')?.remove(); window.gridIndentTask('${escapeHTML(taskId)}')"` : ''}>
            Indent
        </div>
        <div style="padding:8px 16px;cursor:${canOutdent ? 'pointer' : 'not-allowed'};font-size:0.875rem;color:${canOutdent ? '#1e293b' : '#9ca3af'};"
             ${canOutdent ? `onmouseenter="this.style.background='#eff6ff'" onmouseleave="this.style.background='transparent'"
             onclick="document.getElementById('taskGridContextMenu')?.remove(); window.gridOutdentTask('${escapeHTML(taskId)}')"` : ''}>
            Outdent
        </div>
        <div style="border-top:1px solid #f1f5f9;margin:4px 0;"></div>
        <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#1e293b;"
             onmouseenter="this.style.background='#eff6ff'" onmouseleave="this.style.background='transparent'"
             onclick="document.getElementById('taskGridContextMenu')?.remove(); window.gridInsertRowAbove('${escapeHTML(taskId)}')">
            Insert Row Above
        </div>
        <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#ef4444;"
             onmouseenter="this.style.background='#fef2f2'" onmouseleave="this.style.background='transparent'"
             onclick="document.getElementById('taskGridContextMenu')?.remove(); window.gridDeleteRow('${escapeHTML(taskId)}')">
            Delete Row${hasChildren ? ` (+ ${childCount} subtask${childCount !== 1 ? 's' : ''})` : ''}
        </div>
    `;
    document.body.appendChild(menu);
    // Dismiss on outside click — 10ms delay (mirrors procurement.js pattern)
    setTimeout(() => {
        document.addEventListener('click', function handler() {
            menu.remove();
            document.removeEventListener('click', handler);
        }, { once: true });
    }, 10);
}

async function gridIndentTask(taskId) {
    const t = tasks.find(x => x.task_id === taskId);
    if (!t) return;
    // Sort by row_order
    const sorted = tasks.slice().sort((a, b) => (a.row_order ?? Infinity) - (b.row_order ?? Infinity));
    const idx = sorted.findIndex(x => x.task_id === taskId);
    if (idx <= 0) return; // first row — can't indent
    const newParent = sorted[idx - 1];
    // Reject if newParent is a descendant of this task (would create a cycle)
    if (isDescendant(newParent.task_id, taskId)) {
        showToast(`Can't indent — would create a cycle.`, 'error');
        return;
    }
    const oldParentId = t.parent_task_id || null;
    try {
        await updateDoc(doc(db, 'project_tasks', taskId), {
            parent_task_id: newParent.task_id,
            updated_at: serverTimestamp()
        });
        // Patch local
        const i = tasks.findIndex(x => x.task_id === taskId);
        if (i >= 0) tasks[i] = { ...tasks[i], parent_task_id: newParent.task_id };
        // Recompute envelopes for both old and new parent
        if (oldParentId) await recomputeParentDates(oldParentId);
        await recomputeParentDates(newParent.task_id);
    } catch (err) {
        console.error('[ProjectPlan] gridIndentTask failed:', err);
        showToast(err?.code === 'permission-denied'
            ? `You don't have permission to change task hierarchy on this project.`
            : 'Could not indent task. Please try again.', 'error');
    }
}

async function gridOutdentTask(taskId) {
    const t = tasks.find(x => x.task_id === taskId);
    if (!t || !t.parent_task_id) return;
    const oldParent = tasks.find(x => x.task_id === t.parent_task_id);
    const newParentId = oldParent?.parent_task_id || null;
    const oldParentId = t.parent_task_id;
    try {
        await updateDoc(doc(db, 'project_tasks', taskId), {
            parent_task_id: newParentId,
            updated_at: serverTimestamp()
        });
        const i = tasks.findIndex(x => x.task_id === taskId);
        if (i >= 0) tasks[i] = { ...tasks[i], parent_task_id: newParentId };
        await recomputeParentDates(oldParentId);
        if (newParentId) await recomputeParentDates(newParentId);
    } catch (err) {
        console.error('[ProjectPlan] gridOutdentTask failed:', err);
        showToast(err?.code === 'permission-denied'
            ? `You don't have permission to change task hierarchy on this project.`
            : 'Could not outdent task. Please try again.', 'error');
    }
}

async function gridInsertRowAbove(taskId) {
    const t = tasks.find(x => x.task_id === taskId);
    if (!t) return;
    if (!currentProject?.project_code) {
        showToast(`This project doesn't have a project code yet.`, 'warning');
        return;
    }
    const targetOrder = t.row_order ?? 0;

    showLoading(true);
    try {
        // Allocate task id
        let newTaskId;
        for (let attempt = 0; attempt < 5; attempt++) {
            const candidate = await generateTaskId(currentProject.project_code);
            const existing = await getDoc(doc(db, 'project_tasks', candidate));
            if (!existing.exists()) { newTaskId = candidate; break; }
        }
        if (!newTaskId) { showToast('Could not allocate a task id — please try again.', 'error'); return; }

        // Shift all rows with row_order >= targetOrder up by 1 (writeBatch chunked at 450)
        const toShift = tasks.filter(x => (x.row_order ?? 0) >= targetOrder);
        const CHUNK = 450;
        for (let i = 0; i < toShift.length; i += CHUNK) {
            const slice = toShift.slice(i, i + CHUNK);
            const batch = writeBatch(db);
            slice.forEach(task => {
                batch.update(doc(db, 'project_tasks', task.task_id), {
                    row_order: (task.row_order ?? 0) + 1,
                    updated_at: serverTimestamp()
                });
            });
            await batch.commit();
        }

        // Create new task at targetOrder, inheriting parent_task_id from the row below for visual locality
        await setDoc(doc(db, 'project_tasks', newTaskId), {
            task_id: newTaskId,
            project_id: currentProject.id,
            project_code: currentProject.project_code,
            parent_task_id: t.parent_task_id || null,
            name: '',
            description: '',
            progress: 0,
            is_milestone: false,
            dependencies: [],
            assignees: [],
            resources: '',
            row_order: targetOrder,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        });
        // onSnapshot will fire → renderTaskGrid()
    } catch (err) {
        console.error('[ProjectPlan] gridInsertRowAbove failed:', err);
        showToast(err?.code === 'permission-denied'
            ? `You don't have permission to add tasks on this project.`
            : 'Could not insert row. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// D-05: inline confirm on delete — no modal overlay
function gridDeleteRow(taskId) {
    const t = tasks.find(x => x.task_id === taskId);
    if (!t) return;
    const hasChildren = tasks.some(x => x.parent_task_id === taskId);

    if (hasChildren) {
        // Show inline confirm tooltip on the row — no modal
        const row = document.querySelector(`.tg-row[data-task-id="${CSS.escape(taskId)}"]`);
        if (!row) return;
        // Remove any existing confirm
        row.querySelector('.tg-delete-confirm')?.remove();
        const confirm = document.createElement('span');
        confirm.className = 'tg-delete-confirm';
        const childCount = tasks.filter(x => x.parent_task_id === taskId).length;
        confirm.innerHTML = `Delete task + ${childCount} subtask${childCount !== 1 ? 's' : ''}? <button class="tg-delete-yes">Yes</button> <button class="tg-delete-no">No</button>`;
        row.appendChild(confirm);
        confirm.querySelector('.tg-delete-yes').addEventListener('click', () => deleteTaskNow(taskId));
        confirm.querySelector('.tg-delete-no').addEventListener('click', () => confirm.remove());
    } else {
        // Leaf task — delete directly (no confirm)
        deleteTaskNow(taskId);
    }
}

// D-Q4: hierarchy-respecting drop validation + row_order writeBatch commit
async function handleRowDrop(draggedTaskId, targetTaskId) {
    const dragged = tasks.find(x => x.task_id === draggedTaskId);
    const target = tasks.find(x => x.task_id === targetTaskId);
    if (!dragged || !target) return;

    // D-Q4: a task cannot be dragged above its parent or below its last descendant
    // Check 1: target cannot be the dragged task's parent (would put dragged above its parent)
    if (target.task_id === dragged.parent_task_id) {
        showToast(`Can't move a task above its parent. Outdent it first.`, 'warning');
        return;
    }
    // Check 2: target cannot be a descendant of dragged (would put dragged inside its own subtree)
    if (isDescendant(targetTaskId, draggedTaskId)) {
        showToast(`Can't drop a task into its own subtree.`, 'warning');
        return;
    }

    // Compute new ordering: move dragged to position of target, shift everything else
    const sorted = tasks.slice().sort((a, b) => (a.row_order ?? Infinity) - (b.row_order ?? Infinity));
    const filtered = sorted.filter(x => x.task_id !== draggedTaskId);
    const targetIdx = filtered.findIndex(x => x.task_id === targetTaskId);
    if (targetIdx < 0) return;
    filtered.splice(targetIdx, 0, dragged);
    const newTaskIdOrder = filtered.map(x => x.task_id);

    try {
        await commitRowOrderReorder(newTaskIdOrder);
        // onSnapshot will refresh
    } catch (err) {
        console.error('[ProjectPlan] handleRowDrop failed:', err);
        showToast(err?.code === 'permission-denied'
            ? `You don't have permission to reorder tasks on this project.`
            : 'Could not reorder. Please try again.', 'error');
    }
}

// writeBatch for row_order reorder (analog: deleteTaskNow CHUNK=450 pattern)
async function commitRowOrderReorder(reorderedTaskIds) {
    const CHUNK = 450;
    for (let i = 0; i < reorderedTaskIds.length; i += CHUNK) {
        const slice = reorderedTaskIds.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        slice.forEach((taskId, sliceIdx) => {
            const globalIdx = i + sliceIdx;
            batch.update(doc(db, 'project_tasks', taskId), {
                row_order: globalIdx + 1,  // 1-based
                updated_at: serverTimestamp()
            });
        });
        await batch.commit();
    }
}

// "3d" -> 3, "2w" -> 14, "5" -> 5, invalid -> null
function parseDuration(str) {
    if (!str) return null;
    const s = str.trim();
    // Accept "3d", "2w" (with optional space), OR a bare positive integer treated as days
    const mSuffix = s.match(/^(\d+)\s*([dw])$/i);
    if (mSuffix) return mSuffix[2].toLowerCase() === 'w' ? parseInt(mSuffix[1], 10) * 7 : parseInt(mSuffix[1], 10);
    const mBare = s.match(/^(\d+)$/);
    if (mBare) {
        const n = parseInt(mBare[1], 10);
        return n > 0 ? n : null;
    }
    return null;
}

// "3d", "14d" from start/end ISO strings
function computeDurationDisplay(start, end) {
    if (!start || !end) return '';
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end   + 'T00:00:00');
    const days = Math.max(1, Math.round((e - s) / 86400000) + 1);
    return `${days}d`;
}

// Add N calendar days to ISO date string
function addDays(isoDate, n) {
    const d = new Date(isoDate + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return formatDateISO(d); // reuses existing formatDateISO
}

// Depth in hierarchy (distance from root)
function computeDepth(taskId) {
    let depth = 0;
    const tasksById = new Map(tasks.map(t => [t.task_id, t]));
    let cur = tasksById.get(taskId);
    while (cur?.parent_task_id) {
        depth++;
        cur = tasksById.get(cur.parent_task_id);
        if (depth > 20) break; // cycle guard
    }
    return depth;
}

// ---- Gantt rendering (right pane) ----

let __ganttInitialScrollDone = false;
let __lastViolationFingerprint = '';
let __snapshotCount = 0;

function renderGantt() {
    if (typeof window.Gantt !== 'function') {
        // Frappe not yet loaded — guard. Plan 01 ships the CDN script, but defensive.
        return;
    }
    const mountEl = document.getElementById('ganttPane');
    if (!mountEl) return;

    // Phase 86.1: filter panel removed (D-Q2). All tasks visible.
    const visibleTasksLocal = tasks.slice();

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
            popup: false,                          // DEFECT-4: suppress click-triggered popup
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

    // 7. Phase 86.1 Plan 04 — drag-to-link overlay
    initGanttDragLink();
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
    }).then(async () => {
        if (t.parent_task_id) {
            const idx = tasks.findIndex(x => x.task_id === t.task_id);
            if (idx >= 0) tasks[idx] = { ...tasks[idx], start_date: newStart, end_date: newEnd };
            await recomputeParentDates(t.parent_task_id);
        }
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
    // Click on bar — Plan 02 will wire grid row selection here
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

// ---- Gantt drag-to-link SVG overlay (Phase 86.1 Plan 04) ----
// Adds a blue circle handle at the right edge of each non-parent Gantt bar on hover.
// Dragging from that handle draws a rubber-band SVG line; releasing over another bar
// creates a Finish-to-Start dependency with cycle detection (reuses detectDependencyCycle).
// Sentinel attributes (data-linkBound) prevent duplicate listener binding across snapshot re-fires.

function initGanttDragLink() {
    const svg = document.querySelector('#ganttPane svg');
    if (!svg) return;

    // Bind per-bar-wrapper handlers (mouseenter / mouseleave / mousedown)
    svg.querySelectorAll('.bar-wrapper').forEach(barWrapper => {
        // Sentinel: skip if already bound (Frappe gantt.refresh() keeps same DOM elements)
        if (barWrapper.dataset.linkBound === '1') return;
        barWrapper.dataset.linkBound = '1';

        const bar = barWrapper.querySelector('.bar');
        if (!bar) return;

        barWrapper.addEventListener('mouseenter', () => {
            // D-07 parent lock — never show a handle on parent summary bars
            if (barWrapper.classList.contains('parent-summary-bar')) return;
            let handle = barWrapper.querySelector('.gantt-link-handle');
            if (!handle) {
                const ns = 'http://www.w3.org/2000/svg';
                handle = document.createElementNS(ns, 'circle');
                handle.setAttribute('class', 'gantt-link-handle');
                handle.setAttribute('r', '6');
                handle.setAttribute('fill', '#1a73e8');
                handle.setAttribute('cursor', 'crosshair');
                barWrapper.appendChild(handle);
            }
            // Position at bar right-edge midpoint
            const barRect = bar.getBBox ? bar.getBBox() : { x: 0, y: 0, width: 0, height: 0 };
            handle.setAttribute('cx', barRect.x + barRect.width);
            handle.setAttribute('cy', barRect.y + barRect.height / 2);
            handle.style.display = '';
        });

        barWrapper.addEventListener('mouseleave', () => {
            if (ganttDragState) return; // keep handle visible while drag is in progress
            barWrapper.querySelector('.gantt-link-handle')?.remove();
        });

        barWrapper.addEventListener('mousedown', (e) => {
            const handle = e.target;
            if (!handle.classList.contains('gantt-link-handle')) return;
            e.preventDefault();
            e.stopPropagation();
            // Read source task_id from Frappe's data-id attribute on bar-wrapper
            const fromTaskId = barWrapper.dataset.id;
            if (!fromTaskId) return;
            // Create rubber-band SVG line
            const ns = 'http://www.w3.org/2000/svg';
            const svgLine = document.createElementNS(ns, 'line');
            svgLine.setAttribute('class', 'gantt-rubber-band');
            svgLine.setAttribute('stroke', '#1a73e8');
            svgLine.setAttribute('stroke-width', '2');
            svgLine.setAttribute('stroke-dasharray', '4 4');
            svgLine.setAttribute('pointer-events', 'none');
            svg.appendChild(svgLine);
            ganttDragState = { fromTaskId, svgLine };
        });
    });

    // SVG-level mousemove + mouseup — bind once (sentinel on SVG itself)
    if (svg.dataset.linkBound !== '1') {
        svg.dataset.linkBound = '1';

        svg.addEventListener('mousemove', (e) => {
            if (!ganttDragState) return;
            // Transform client coords to SVG coords
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
            const line = ganttDragState.svgLine;
            // x1/y1 = from-bar right-edge center
            const fromWrapper = svg.querySelector(`.bar-wrapper[data-id="${CSS.escape(ganttDragState.fromTaskId)}"]`);
            const fromBar = fromWrapper?.querySelector('.bar');
            if (fromBar) {
                const r = fromBar.getBBox();
                line.setAttribute('x1', r.x + r.width);
                line.setAttribute('y1', r.y + r.height / 2);
            }
            line.setAttribute('x2', svgPt.x);
            line.setAttribute('y2', svgPt.y);
        });

        svg.addEventListener('mouseup', async (e) => {
            if (!ganttDragState) return;
            const { fromTaskId, svgLine } = ganttDragState;
            // Clear drag state and remove rubber-band line immediately
            ganttDragState = null;
            svgLine.remove();

            // Resolve drop target
            const toWrapper = e.target.closest('.bar-wrapper');
            if (!toWrapper) return; // dropped on empty space — cancel silently
            const toTaskId = toWrapper.dataset.id;
            if (!toTaskId || toTaskId === fromTaskId) return; // self-link — reject silently

            const toTask = tasks.find(x => x.task_id === toTaskId);
            if (!toTask) return;

            const existingDeps = Array.isArray(toTask.dependencies) ? [...toTask.dependencies] : [];
            if (existingDeps.includes(fromTaskId)) return; // already linked — skip silently

            const newDeps = [...existingDeps, fromTaskId];

            // Cycle check (reuse detectDependencyCycle from Phase 86)
            const cycleNames = detectDependencyCycle(newDeps, toTaskId);
            if (cycleNames) {
                showToast(`This dependency would create a cycle: ${cycleNames.join(' → ')}. Link rejected.`, 'error');
                return;
            }

            // Write — T-86.1.4-07: catch permission-denied and surface actionable toast
            try {
                await updateDoc(doc(db, 'project_tasks', toTaskId), {
                    dependencies: newDeps,
                    updated_at: serverTimestamp()
                });
                // onSnapshot → renderTaskGrid() updates Predecessors column automatically
            } catch (err) {
                console.error('[ProjectPlan] drag-to-link write failed:', err);
                showToast('Could not save dependency link.', 'error');
            }
        });
    }
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

// ---- Delete cascade ----

async function deleteTaskNow(taskId) {
    const t = tasks.find(x => x.task_id === taskId);
    if (!t) return;

    // Pre-build a parent->children map once so cascade collection is O(n) overall
    // rather than O(depth * n) from repeated tasks.filter(...) at every level.
    const childrenByParent = new Map();
    tasks.forEach(x => {
        const k = x.parent_task_id || '__root__';
        if (!childrenByParent.has(k)) childrenByParent.set(k, []);
        childrenByParent.get(k).push(x);
    });

    // Collect the subtree (children-first order)
    const allIds = [];
    function collect(id) {
        (childrenByParent.get(id) || []).forEach(k => collect(k.task_id));
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

        // Clean up any inline delete-confirm tooltip still visible in the grid
        document.querySelector('.tg-delete-confirm')?.remove();
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

// ---- Cycle detection + parent recompute ----

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
        const parentIdx = tasks.findIndex(t => t.task_id === parentTaskId);
        if (parentIdx >= 0) {
            tasks[parentIdx] = { ...tasks[parentIdx], start_date: minStart, end_date: maxEnd };
        }
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
    const parsed = Number(valueRaw);
    if (!Number.isFinite(parsed)) return;
    const value = Math.max(0, Math.min(100, Math.round(parsed)));
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
        renderGantt(); // revert UI to last-known-good
    }
}
