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
            <div class="plan-split-pane">
                <div class="task-grid-rail" id="taskGridRail" aria-label="Task grid">
                    <div class="empty-state"><h3>Loading…</h3></div>
                </div>
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
                // renderTaskGrid() — added in Task 2
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
    __ganttInitialScrollDone = false;
    __lastViolationFingerprint = '';
    __snapshotCount = 0;
    delete window.setGanttZoom;
    delete window.deleteTaskNow;
    delete window.editTaskProgress;
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
