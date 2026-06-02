/* ========================================
   PROJECT PLAN VIEW (Phase 86)
   Full-screen split-pane: hierarchical task list (left) + Frappe Gantt (right).
   Standalone route #/projects/:code/plan. Projects-only this phase (D-04).
   ======================================== */

import { db, collection, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, writeBatch, serverTimestamp, orderBy } from '../firebase.js';
import { formatDate, showLoading, showToast, normalizePersonnel, escapeHTML } from '../utils.js';
import { generateTaskId } from '../task-id.js';

// ---- Module-scope state ----
let currentProject = null;
let projectCode = null;
let tasks = [];                       // raw task docs from onSnapshot (project-scoped)
let _pendingOptimistic = new Map();   // Phase 86.5-08: taskId → optimistic task object, awaiting setDoc resolution
let listeners = [];                   // onSnapshot unsubscribers — destroy() loops this
let _baselineData = null;  // Phase 86.12: currently-selected baseline doc (drives overlay). null = no overlay.
let _baselines = [];       // Phase 86.12 (mbl): all baselines, ordered created_at desc. Populated by loadBaselines().
let _activeBaselineId = null; // Phase 86.12 (mbl): id of the baseline driving the overlay. null = overlay hidden.
let gantt = null;                     // Frappe Gantt instance — Plan 03 sets this

// Phase 86.1 — grid state
let rowOrderCache = new Map();    // task_id -> 1-based row#, rebuilt every snapshot
let _gridInputHandler = null;     // capture-phase blur handler for tg-input elements
let _gridChangeHandler = null;    // change handler for tg-date-input
let _gridContextMenuHandler = null; // Plan 02 hook (declare now, body added in Plan 02)

// Plan 04 — Gantt drag-to-link state
let ganttDragState = null;       // { fromTaskId, svgLine } during drag-to-link, null otherwise
let _ganttLinkDocMouseupHandler = null; // document mouseup — cancel drag-to-link if released outside SVG

// Plan 02 — drag-and-drop state
let _gridDragStartHandler = null;
let _gridDragOverHandler = null;
let _gridDropHandler = null;
let _gridDragEndHandler = null;
let _draggedTaskId = null;        // currently-dragged task_id during drag
let _gridKeydownHandler = null;   // keydown Enter handler for Duration/Resources cells (86.2)
let _focusNewRowAfterRender = false; // Phase 86.5: Excel-style continuous entry
let _focusRestoreTimer = null; // cancel stale focus-restoration across rapid re-renders

// Plan 03 — resizable panel divider state
let _resizeMouseMoveHandler = null;
let _resizeMouseUpHandler = null;
let _resizeDragging = false;
let _paneDividerPct = 35; // Phase 86.9: curtain divider default position (percent)

// Phase 86.3 D-01: scroll-clamp handler for soft date floor (min(today, earliest task.start_date))
let _ganttScrollClampHandler = null;
let _ganttScrollClampPane = null; // the .gantt-pane element (kept so destroy() can removeEventListener)

// Phase 86.4 D-SCROLL: synchronized vertical scroll between rail and Gantt pane
let _syncScrollRailHandler = null;
let _syncScrollPaneHandler = null;
let _syncScrollGanttEl = null; // .gantt-container reference for cleanup
let _syncingScroll = false;
// Phase 86.4 D-03 overlay: horizontal scroll sync for custom header
let _overlayScrollHandler = null;

// Phase 86.7 — phantom drag (suppress mid-drag Firestore writes and re-renders)
let _ganttBarDragging = false;          // true while a Frappe bar drag gesture is in progress
let _pendingDragWrite = null;           // { taskId, newStart, newEnd, parentId } — flushed on mouseup
let _pendingProgressWrite = null;       // { taskId, progress } — flushed on mouseup
let _ganttDragMousedownHandler = null;  // SVG mousedown — sets _ganttBarDragging
let _ganttDragMouseupHandler = null;    // document mouseup — clears flag, flushes writes
let _ganttDragSafetyTimer = null;       // 10 s auto-clear in case mouseup is missed
// Phase 86.8 Feature 3 fix — direct parent drag detection (Frappe v1.2.2 on_date_change is gated by
// strict numeric equality on internal _start; for parent/summary bars whose dates are envelope-derived
// the equality check intermittently swallows the event). Capture the gesture at the DOM layer instead.
let _parentDragInfo = null;             // { taskId, mouseDownX } | null — set on mousedown of a parent bar
// Phase 86.8 chain-drag fix — Frappe v1.2.2 cascades date_change events to dependent successors
// (move_dependencies defaults to true). With multiple events arriving in one gesture, _pendingDragWrite
// would be overwritten and only the LAST cascaded task got flushed. Capture the user-initiated taskId
// at mousedown and ignore on_date_change events for any other task during the gesture.
let _dragInitiatorTaskId = null;        // task_id of the bar the user actually grabbed; null outside a drag

// Phase 86.8 — arrow right-click + selection state (Features 1 & 7)
let _ganttArrowContextHandler = null; // SVG contextmenu listener — re-attached on every renderGantt
let _ganttArrowMenuClickaway = null;  // document mousedown that dismisses the open menu
let _selectedArrow = null;            // { fromId, toId, el } | null — used by Feature 7 keyboard Delete

// Phase 86.8 — Feature 2: collapsible parents (in-memory only — D-2 deferral)
let _collapsedParents = new Set();    // task_ids whose subtree is hidden in left grid + Gantt
let _gridCollapseHandler = null;      // delegated click handler on the rail — toggles collapse state

// Phase 86.8 — Feature 7: keyboard shortcuts + row/arrow selection
let _selectedTaskId = null;           // currently-selected row task_id (Delete + Up/Down + Enter)
let _selectedRowIds = new Set();      // Phase 86.10: task_ids of all multi-selected rows (shift+click)
let _lastClickedRowId = null;         // Phase 86.10: anchor for shift+click range calculation
let _planKeydownHandler = null;       // window-level keydown listener
let _ganttArrowClickHandler = null;   // SVG click → arrow selection
let _gridRowClickHandler = null;      // delegated click on rail → row selection

// Phase 86.10 Plan 03 — Copy/Paste clipboard
let _clipboardTasks = [];             // array of plain task data objects saved on Copy; cleared in destroy()

// Phase 86.8 — Feature 4: critical-path highlight (CPM forward+backward pass)
// _criticalPathSet is recomputed on every renderGantt() from the truth-set tasks[],
// independent of search/collapse filters so the math is never blinkered by what's visible.
// _showCriticalPath defaults ON per CONTEXT.md.
let _criticalPathSet = new Set();    // task_ids on the critical path (slack === 0)
let _showCriticalPath = true;        // toolbar checkbox state — toggleCriticalPath flips this

// Phase 86.8 — Feature 6: task search/filter bar
// _searchQuery is the current case-insensitive substring query ('' = no filter).
// Three-rule visibility (per CONTEXT D-Q6) composes with _collapsedParents — a task is
// shown iff it passes BOTH the search filter AND is not hidden by an ancestor's collapse.
let _searchQuery = '';                // current search query (lowercased); '' = no filter
let _searchInputHandler = null;       // input event handler on the search box (toolbar-bound)
let _searchClearHandler = null;       // click handler on the clear button (toolbar-bound)

// Phase 97 — Iteration history
let _iterations = [];                 // array of iteration docs loaded from project_iterations
let _autoSnapId = null;               // Firestore doc ID of the auto-snapshot created before last restore; null if no undo available
let _undoToastTimer = null;           // setTimeout handle for the 5s undo toast auto-dismiss
let _activeDiffIterationId = null;    // iteration id currently shown in diff panel; null if diff closed
let _iterRailOpen = false;            // whether the right rail is currently open
let _iterSeq = 0;                     // counter for default label "Iteration N"; updated from non-auto iterations count on load

// Phase 97: window function handler refs for destroy() cleanup
let _iterSaveHandler = null;
let _iterToggleRailHandler = null;
let _iterCloseRailHandler = null;
let _iterOpenConfirmHandler = null;
let _iterToggleDiffHandler = null;
let _iterCloseIterDiffHandler = null;
let _iterUndoRestoreHandler = null;
let _iterConfirmLoadHandler = null;

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
                <a href="#/projects/detail/${escapeHTML(projectCode || '')}" class="plan-back-link">‹ Back</a>
                <h2 class="plan-title" id="planTitle">Plan</h2>
                <div class="plan-toolbar-spacer"></div>
                <div class="plan-toolbar-group">
                    <div class="zoom-pill-group" id="zoomPillGroup" role="group" aria-label="Zoom">
                        <button type="button" class="zoom-pill" data-zoom="Day" onclick="window.setGanttZoom('Day')">Day</button>
                        <button type="button" class="zoom-pill active" data-zoom="Week" onclick="window.setGanttZoom('Week')">Week</button>
                        <button type="button" class="zoom-pill" data-zoom="Month" onclick="window.setGanttZoom('Month')">Month</button>
                    </div>
                </div>
                <div class="plan-toolbar-divider" aria-hidden="true"></div>
                <div class="plan-toolbar-group">
                    <button type="button" class="plan-export-btn" onclick="window.exportGanttPDF()" title="Export Gantt as PDF">Export</button>
                    <label class="plan-toolbar-toggle" title="Critical path&#10;&#10;The longest dependency chain that drives the project finish date. Slip any task on it and the project slips.&#10;&#10;A task qualifies when:&#10;  1. It has zero schedule slack (no buffer), AND&#10;  2. At least one neighbor is also zero-slack with a tight dependency edge (predecessor finishes the day before this task starts).&#10;&#10;Isolated tasks with no dependencies are never on the critical path.">
                        <input type="checkbox" id="cpToggle" checked onclick="window.toggleCriticalPath(this.checked)">
                        <span>Critical path</span>
                    </label>
                </div>
                <div class="plan-toolbar-divider" aria-hidden="true"></div>
                <div class="plan-toolbar-group">
                    <select id="baselineSelect" class="plan-baseline-select"
                        onchange="window.selectBaseline(this.value)"
                        title="Select which saved baseline drives the overlay">
                        <option value="">— none —</option>
                    </select>
                    <button type="button" id="baselineToggleBtn" class="plan-export-btn plan-baseline-btn"
                        onclick="window.toggleBaseline()" title="Snapshot current task dates as a baseline">
                        Set Baseline
                    </button>
                </div>
                <div class="plan-toolbar-divider" aria-hidden="true"></div>
                <!-- Phase 97: Iteration controls — after baseline button, before search -->
                <div class="plan-toolbar-group">
                    <button type="button" class="plan-export-btn plan-iter-save-btn"
                        onclick="window.saveIteration()" title="Save a named snapshot of the current plan">
                        Save Iteration
                    </button>
                    <button type="button" id="iterHistoryBtn" class="plan-export-btn plan-iter-history-btn"
                        onclick="window.toggleIterRail()" title="Browse saved iterations">
                        History
                    </button>
                </div>
                <!-- Phase 86.8 Feature 6 — search lives in the toolbar so it doesn't push grid
                     headers down and break left/right vertical alignment. Bound once in init(),
                     not re-rendered by renderTaskGrid, so caret state survives every keystroke. -->
                <div class="plan-toolbar-search">
                    <input type="search" class="tg-search-input" placeholder="Search tasks..." aria-label="Search tasks">
                    <button class="tg-search-clear" title="Clear search" type="button" style="display:none">×</button>
                </div>
            </div>
            <div class="baseline-slip-summary" id="baselineSlipSummary" style="display:none"></div>
            <div class="plan-body-row" id="planBodyRow">
                <div class="plan-split-pane" id="planSplitPane">
                    <div class="task-grid-rail" id="taskGridRail" aria-label="Task grid">
                        <div class="empty-state"><h3>Loading…</h3></div>
                    </div>
                    <div class="plan-divider" id="planDivider" aria-hidden="true"></div>
                    <div class="gantt-pane">
                        <div id="ganttPane"></div>
                    </div>
                </div>
                <!-- Phase 97: iteration history right rail -->
                <div class="iter-rail" id="iterRail" aria-label="Iteration history" hidden>
                    <div class="iter-rail-head">
                        History <span class="iter-count-badge" id="iterCountBadge">0</span>
                        <button class="iter-rail-close" onclick="window.closeIterRail()" aria-label="Close history">×</button>
                    </div>
                    <div class="iter-rail-save-row">
                        <button class="iter-rail-save-btn" onclick="window.saveIteration()">+ Save current state</button>
                    </div>
                    <div class="iter-rail-timeline" id="iterRailTimeline"></div>
                </div>
            </div>
            <!-- Phase 97: diff panel (inside plan surface, below body row — NOT inside plan-split-pane which has overflow:hidden) -->
            <div class="iter-diff-panel" id="iterDiffPanel" hidden>
                <div class="iter-diff-head">
                    <span class="iter-diff-title" id="iterDiffTitle">Comparing with …</span>
                    <span class="iter-diff-summary" id="iterDiffSummary"></span>
                    <button class="iter-diff-load-btn" onclick="window.openIterConfirm(window._activeDiffIterationId)">Load this →</button>
                    <button class="iter-diff-close" onclick="window.closeIterDiff()">×</button>
                </div>
                <div class="iter-diff-legend">
                    <span class="iter-diff-dot iter-diff-dot-chg"></span>Changed
                    <span class="iter-diff-dot iter-diff-dot-add"></span>Added in iteration
                    <span class="iter-diff-dot iter-diff-dot-del"></span>Removed in iteration
                    <span class="iter-diff-dot iter-diff-dot-same"></span>Unchanged
                </div>
                <div class="iter-diff-table-wrap">
                    <table class="iter-diff-table">
                        <thead>
                            <tr><th>Status</th><th>Task</th><th>Start</th><th>End</th><th>Predecessors</th><th>Resources</th><th>Progress</th></tr>
                        </thead>
                        <tbody id="iterDiffBody"></tbody>
                    </table>
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

        // 2.5 Phase 86.12 (mbl): fetch all baselines; auto-select most recent into _baselineData
        await loadBaselines();

        // 3. Subscribe to project_tasks (project-scoped at JS query layer per D-18)
        // __snapshotCount is module-scoped; destroy() resets it alongside __lastViolationFingerprint
        // so the first-snapshot toast suppression and the dedupe fingerprint stay in sync.
        __snapshotCount = 0;
        const tasksUnsub = onSnapshot(
            query(collection(db, 'project_tasks'), where('project_id', '==', currentProject.id)),
            (snap) => {
                tasks = [];
                snap.forEach(d => tasks.push({ id: d.id, ...d.data() }));
                // Phase 86.5-08: re-inject optimistic rows that haven't yet appeared in the snapshot
                if (_pendingOptimistic.size) {
                    const presentIds = new Set(tasks.map(t => t.task_id));
                    _pendingOptimistic.forEach((optTask, optId) => {
                        if (!presentIds.has(optId)) tasks.push(optTask);
                    });
                }
                // Save gantt vertical scroll before rendering. gantt.refresh() calls
                // clear() → svg.innerHTML='' which clamps scrollTop to 0. Frappe then
                // fires set_scroll_position() via setTimeout (scrollLeft change) which
                // emits a scroll event → _syncScrollPaneHandler → rail.scrollTop=0.
                // Restoring ganttEl.scrollTop synchronously after bindScrollSync() means
                // the deferred scroll event propagates the correct position to the rail.
                const _snapGanttEl = document.querySelector('#ganttPane .gantt-container');
                const _snapSavedScroll = _snapGanttEl?.scrollTop || 0;

                renderTaskGrid();
                if (!_ganttBarDragging) renderGantt(); // Phase 86.7: suppress mid-drag re-render
                bindScrollSync(); // Phase 86.4 D-SCROLL

                if (_snapSavedScroll > 0) {
                    const _snapGanttElAfter = document.querySelector('#ganttPane .gantt-container');
                    if (_snapGanttElAfter) _snapGanttElAfter.scrollTop = _snapSavedScroll;
                }

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
        window.removeArrowDependency = removeArrowDependency; // Phase 86.8 Feature 1+7
        window.toggleCriticalPath = toggleCriticalPath; // Phase 86.8 Feature 4
        window.exportGanttPDF = exportGanttPDF; // Phase 86.9 PDF Export
        // Phase 86.10 Plan 03: Copy/Paste + Group operations
        window.gridCopyRows = gridCopyRows;
        window.gridPasteRows = gridPasteRows;
        window.gridGroupIndent = gridGroupIndent;
        window.gridGroupOutdent = gridGroupOutdent;
        window.gridGroupDelete = gridGroupDelete;
        // Phase 86.11 Plan 02: milestone toggle
        window.gridToggleMilestone = gridToggleMilestone;
        // Phase 86.12: baseline snapshot
        window.saveBaseline = saveBaseline;
        // Phase 86.12 (mbl): multi-baseline selector + toggle
        window.toggleBaseline = toggleBaseline;
        window.selectBaseline = selectBaseline;
        window.clearBaseline = clearBaseline;
        // Phase 97: Iteration history window functions
        window.saveIteration  = saveIteration;
        window.toggleIterRail = toggleIterRail;
        window.closeIterRail  = closeIterRail;
        window.openIterConfirm = openIterConfirm;
        window.confirmIterLoad = confirmIterLoad;
        window.undoIterRestore = undoIterRestore;
        window.toggleIterDiff  = toggleIterDiff;
        window.closeIterDiff   = closeIterDiff;
        window.deleteIteration = deleteIteration;
        // Populate the toolbar selector + button label from the freshly loaded _baselines.
        // The select is in the DOM after render() — safe to update here, before listeners attach.
        updateBaselineToolbarUI();
        // Phase 97: load iterations and render the rail (after baselines already loaded above)
        await loadIterations();
        renderIterRail();
        initPanelResize();

        // Phase 86.8 Feature 7 — window-level keydown for Delete / Up/Down / Enter / Escape.
        // INPUT/TEXTAREA/SELECT short-circuit so typing inside a cell never gets hijacked.
        if (_planKeydownHandler) document.removeEventListener('keydown', _planKeydownHandler);
        _planKeydownHandler = function(event) {
            if (!document.getElementById('planViewSurface')) return; // view not mounted
            const ae = document.activeElement;
            const aeTag = ae?.tagName;
            if (aeTag === 'INPUT' || aeTag === 'TEXTAREA' || aeTag === 'SELECT') return;
            switch (event.key) {
                case 'Delete':
                case 'Backspace': // Backspace included for Mac users whose Delete key produces 'Backspace'.
                    if (_selectedArrow) {
                        event.preventDefault();
                        const { fromId, toId } = _selectedArrow;
                        _selectedArrow = null;
                        removeArrowDependency(fromId, toId);
                    } else if (_selectedTaskId) {
                        event.preventDefault();
                        gridDeleteRow(_selectedTaskId);
                    }
                    break;
                case 'ArrowDown':
                case 'ArrowUp': {
                    if (!_selectedTaskId) {
                        const firstRow = document.querySelector('.tg-row:not(.tg-empty-row)');
                        if (firstRow) {
                            event.preventDefault();
                            selectRow(firstRow.dataset.taskId);
                        }
                        break;
                    }
                    event.preventDefault();
                    const visibleRows = [...document.querySelectorAll('.tg-row:not(.tg-empty-row)')];
                    const idx = visibleRows.findIndex(r => r.dataset.taskId === _selectedTaskId);
                    if (idx < 0) break;
                    const nextIdx = event.key === 'ArrowDown' ? idx + 1 : idx - 1;
                    if (nextIdx < 0 || nextIdx >= visibleRows.length) break;
                    selectRow(visibleRows[nextIdx].dataset.taskId);
                    // scrollIntoView is opt-in (block:'nearest') so we don't yank the user's view
                    // when the row is already in view.
                    visibleRows[nextIdx].scrollIntoView({ block: 'nearest' });
                    break;
                }
                case 'Enter':
                    if (_selectedTaskId) {
                        const row = document.querySelector(`.tg-row[data-task-id="${CSS.escape(_selectedTaskId)}"]`);
                        const firstInput = row?.querySelector('input.tg-input:not([disabled])');
                        if (firstInput) {
                            event.preventDefault();
                            firstInput.focus();
                            try { firstInput.select?.(); } catch (e) { /* swallow */ }
                        }
                    }
                    break;
                case 'Escape':
                    clearSelection();
                    break;
            }
        };
        document.addEventListener('keydown', _planKeydownHandler);

        // Phase 86.8 Feature 6 — bind toolbar search input ONCE. The toolbar is rendered by
        // render() and not touched by renderTaskGrid, so handlers persist across grid
        // re-renders and the caret never drops between keystrokes.
        const searchInput = document.querySelector('.tg-search-input');
        const clearBtn = document.querySelector('.tg-search-clear');
        if (searchInput) {
            if (_searchInputHandler) {
                try { searchInput.removeEventListener('input', _searchInputHandler); } catch (e) { /* swallow */ }
            }
            _searchInputHandler = function(e) {
                _searchQuery = (e.target.value || '').trim().toLowerCase();
                if (clearBtn) clearBtn.style.display = _searchQuery ? '' : 'none';
                renderTaskGrid();
                renderGantt();
            };
            searchInput.addEventListener('input', _searchInputHandler);
        }
        if (clearBtn) {
            _searchClearHandler = function() {
                _searchQuery = '';
                if (searchInput) searchInput.value = '';
                clearBtn.style.display = 'none';
                renderTaskGrid();
                renderGantt();
                searchInput?.focus();
            };
            clearBtn.addEventListener('click', _searchClearHandler);
        }
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
    _baselineData = null;   // Phase 86.12
    _baselines = [];        // Phase 86.12 (mbl)
    _activeBaselineId = null; // Phase 86.12 (mbl)
    _pendingOptimistic.clear(); // Phase 86.5-08
    currentProject = null;
    projectCode = null;
    __ganttInitialScrollDone = false;
    __lastViolationFingerprint = '';
    _suppressFsViolationToast = false;
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
        if (_gridCollapseHandler) gridContainer.removeEventListener('click', _gridCollapseHandler);
    }
    _collapsedParents = new Set();
    _gridCollapseHandler = null;
    _gridInputHandler = null;
    _gridChangeHandler = null;
    _gridContextMenuHandler = null;
    _gridDragStartHandler = null;
    _gridDragOverHandler = null;
    _gridDropHandler = null;
    _gridDragEndHandler = null;
    _gridKeydownHandler = null;
    _focusNewRowAfterRender = false; // Phase 86.5
    clearTimeout(_focusRestoreTimer);
    _focusRestoreTimer = null;
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
    _paneDividerPct = 35; // Phase 86.9: reset curtain divider to default on destroy
    // Phase 86.3 D-01: scroll-clamp cleanup
    if (_ganttScrollClampHandler && _ganttScrollClampPane) {
        try { _ganttScrollClampPane.removeEventListener('scroll', _ganttScrollClampHandler); } catch (e) { /* swallow */ }
    }
    _ganttScrollClampHandler = null;
    _ganttScrollClampPane = null;
    // Phase 86.4 D-03 overlay: horizontal scroll handler cleanup
    const _overlayGanttEl = document.querySelector('#ganttPane .gantt-container');
    if (_overlayScrollHandler && _overlayGanttEl) {
        try { _overlayGanttEl.removeEventListener('scroll', _overlayScrollHandler); } catch (e) { /* swallow */ }
    }
    _overlayScrollHandler = null;
    // Phase 86.4 D-SCROLL: sync scroll cleanup
    const _syncRailEl = document.getElementById('taskGridRail');
    if (_syncScrollRailHandler && _syncRailEl) {
        try { _syncRailEl.removeEventListener('scroll', _syncScrollRailHandler); } catch (e) { /* swallow */ }
    }
    if (_syncScrollPaneHandler && _syncScrollGanttEl) {
        try { _syncScrollGanttEl.removeEventListener('scroll', _syncScrollPaneHandler); } catch (e) { /* swallow */ }
    }
    _syncScrollRailHandler = null;
    _syncScrollPaneHandler = null;
    _syncScrollGanttEl = null;
    _syncingScroll = false;
    // Phase 86.7 phantom drag cleanup
    if (_ganttDragMouseupHandler) document.removeEventListener('mouseup', _ganttDragMouseupHandler);
    if (_ganttDragMousedownHandler) {
        const svg = document.querySelector('#ganttPane svg');
        if (svg) try { svg.removeEventListener('mousedown', _ganttDragMousedownHandler); } catch (e) { /* swallow */ }
    }
    clearTimeout(_ganttDragSafetyTimer);
    _ganttBarDragging = false;
    _pendingDragWrite = null;
    _pendingProgressWrite = null;
    _ganttDragMousedownHandler = null;
    _ganttDragMouseupHandler = null;
    _ganttDragSafetyTimer = null;
    _parentDragInfo = null;
    _dragInitiatorTaskId = null;
    // Phase 86.8 Feature 1 — arrow context menu cleanup
    const _arrowSvg = document.querySelector('#ganttPane svg');
    if (_ganttArrowContextHandler && _arrowSvg) {
        try { _arrowSvg.removeEventListener('contextmenu', _ganttArrowContextHandler); } catch (e) { /* swallow */ }
    }
    if (_ganttArrowMenuClickaway) document.removeEventListener('mousedown', _ganttArrowMenuClickaway);
    _ganttArrowContextHandler = null;
    _ganttArrowMenuClickaway = null;
    _selectedArrow = null;
    document.querySelector('.gantt-arrow-menu')?.remove();
    delete window.removeArrowDependency;
    // Phase 86.8 Feature 7 — keyboard + arrow-click + row-click cleanup
    if (_planKeydownHandler) document.removeEventListener('keydown', _planKeydownHandler);
    _planKeydownHandler = null;
    if (_ganttArrowClickHandler && _arrowSvg) {
        try { _arrowSvg.removeEventListener('click', _ganttArrowClickHandler); } catch (e) { /* swallow */ }
    }
    _ganttArrowClickHandler = null;
    _selectedTaskId = null;
    _selectedRowIds.clear();
    _lastClickedRowId = null;
    if (_gridRowClickHandler && gridContainer) {
        gridContainer.removeEventListener('click', _gridRowClickHandler);
    }
    _gridRowClickHandler = null;
    if (_ganttLinkDocMouseupHandler) document.removeEventListener('mouseup', _ganttLinkDocMouseupHandler);
    _ganttLinkDocMouseupHandler = null;
    // Phase 86.8 Feature 4 — critical-path cleanup
    _criticalPathSet = new Set();
    _showCriticalPath = true;
    delete window.toggleCriticalPath;
    delete window.exportGanttPDF; // Phase 86.9 PDF Export
    // Phase 86.10 Plan 03: Copy/Paste + Group operations cleanup
    delete window.gridCopyRows;
    delete window.gridPasteRows;
    delete window.gridGroupIndent;
    delete window.gridGroupOutdent;
    delete window.gridGroupDelete;
    _clipboardTasks = [];
    // Phase 86.11 Plan 02: milestone toggle cleanup
    delete window.gridToggleMilestone;
    // Phase 86.12: baseline snapshot cleanup
    delete window.saveBaseline;
    // Phase 86.12 (mbl): multi-baseline cleanup
    delete window.toggleBaseline;
    delete window.selectBaseline;
    delete window.clearBaseline;
    // Phase 97: Iteration history cleanup
    delete window.saveIteration;
    delete window.toggleIterRail;
    delete window.closeIterRail;
    delete window.openIterConfirm;
    delete window.confirmIterLoad;
    delete window.undoIterRestore;
    delete window.toggleIterDiff;
    delete window.closeIterDiff;
    delete window.deleteIteration;
    window._activeDiffIterationId = null; // clear window global (not just module scope)
    document.getElementById('iterDiffPanel')?.setAttribute('hidden', ''); // hide diff panel on navigation
    dismissUndoToast(); // dismiss toast + clear timer (defined in Plan 04, same file — safe)
    document.getElementById('iterConfirmModal')?.remove(); // clean up any open confirm modal
    _autoSnapId = null;
    _iterations = [];
    _activeDiffIterationId = null;
    _iterRailOpen = false;
    _iterSeq = 0;
    // Phase 86.8 Feature 6 — search/filter cleanup (toolbar-bound)
    _searchQuery = '';
    const _searchInputForCleanup = document.querySelector('.tg-search-input');
    if (_searchInputHandler && _searchInputForCleanup) {
        try { _searchInputForCleanup.removeEventListener('input', _searchInputHandler); } catch (e) { /* swallow */ }
    }
    _searchInputHandler = null;
    const _searchClearForCleanup = document.querySelector('.tg-search-clear');
    if (_searchClearHandler && _searchClearForCleanup) {
        try { _searchClearForCleanup.removeEventListener('click', _searchClearHandler); } catch (e) { /* swallow */ }
    }
    _searchClearHandler = null;
}

// ---- Resizable panel divider ----

function initPanelResize() {
    // Phase 86.9: Curtain/overlay approach — Gantt pane slides as absolute overlay;
    // task-grid-rail stays at full width at all times (never shrinks).
    const divider = document.getElementById('planDivider');
    const splitPane = document.getElementById('planSplitPane');
    const ganttPane = document.querySelector('.gantt-pane');
    if (!divider || !splitPane || !ganttPane) return;

    // Apply initial curtain position from module-scope state
    ganttPane.style.left = _paneDividerPct + '%';
    divider.style.left = 'calc(' + _paneDividerPct + '% - 2px)';

    divider.addEventListener('mousedown', (e) => {
        _resizeDragging = true;
        divider.classList.add('dragging');
        e.preventDefault();
    });

    _resizeMouseMoveHandler = function(e) {
        if (!_resizeDragging) return;
        const rect = splitPane.getBoundingClientRect();
        const pct = Math.max(15, Math.min(75, ((e.clientX - rect.left) / rect.width) * 100));
        _paneDividerPct = pct;
        ganttPane.style.left = pct.toFixed(1) + '%';
        divider.style.left = 'calc(' + pct.toFixed(1) + '% - 2px)';
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

// Phase 86.8 Feature 2 + 3 — DFS collect of every task_id in the subtree rooted at parentId
// (excluding parentId itself). Reads from the truth-set tasks[], not visibleTasks.
function getDescendantIds(parentId) {
    const childrenByParent = new Map();
    tasks.forEach(t => {
        if (!t.parent_task_id) return;
        if (!childrenByParent.has(t.parent_task_id)) childrenByParent.set(t.parent_task_id, []);
        childrenByParent.get(t.parent_task_id).push(t.task_id);
    });
    const out = [];
    function walk(id) {
        const kids = childrenByParent.get(id) || [];
        kids.forEach(k => { out.push(k); walk(k); });
    }
    walk(parentId);
    return out;
}

// Phase 86.8 fix — render the left grid in the same depth-first hierarchical order the Gantt
// uses (renderGantt's `walk('__root__')`). Grid had been a flat sort by row_order, which
// silently misaligns from the Gantt the moment row_order doesn't track tree order — e.g.,
// when a second parent's children get higher row_order numbers than another parent's
// children, the Gantt walks the parents in tree order while the grid interleaves the
// subtrees. Result: row N on the left no longer corresponds to bar N on the right.
function flattenTreeDepthFirst(taskList) {
    const childrenByParent = new Map();
    taskList.forEach(t => {
        const k = t.parent_task_id || '__root__';
        if (!childrenByParent.has(k)) childrenByParent.set(k, []);
        childrenByParent.get(k).push(t);
    });
    const out = [];
    function walk(parentKey) {
        const kids = (childrenByParent.get(parentKey) || []).slice()
            .sort((a, b) => (a.row_order ?? Infinity) - (b.row_order ?? Infinity));
        kids.forEach(t => {
            out.push(t);
            if (childrenByParent.has(t.task_id)) walk(t.task_id);
        });
    }
    walk('__root__');
    return out;
}

// Phase 86.8 Feature 2 — true if any ancestor of t is in _collapsedParents.
function isHiddenByCollapse(t) {
    if (_collapsedParents.size === 0 || !t) return false;
    let cur = tasks.find(x => x.task_id === t.parent_task_id);
    while (cur) {
        if (_collapsedParents.has(cur.task_id)) return true;
        cur = tasks.find(x => x.task_id === cur.parent_task_id);
    }
    return false;
}

// Phase 86.8 Feature 5 — parent-progress rollup (weighted average by leaf duration in days).
// CONTEXT D-task-rollup: never persisted — recomputed each render. Recursing into nested
// parents lets multi-level hierarchies aggregate correctly (a parent of parents averages
// the rolled-up sub-parent values, weighted by their own envelope durations).
function computeWeightedProgress(parentId) {
    const kids = tasks.filter(t => t.parent_task_id === parentId);
    if (kids.length === 0) return 0;
    let totalDays = 0, weightedSum = 0;
    kids.forEach(k => {
        const isKidParent = tasks.some(x => x.parent_task_id === k.task_id);
        const kidProgress = isKidParent ? computeWeightedProgress(k.task_id) : (k.progress ?? 0);
        const sd = k.start_date, ed = k.end_date;
        if (!sd || !ed) return;
        const dur = Math.max(1, Math.round((new Date(ed + 'T00:00:00') - new Date(sd + 'T00:00:00')) / 86400000) + 1);
        totalDays += dur;
        weightedSum += dur * kidProgress;
    });
    return totalDays > 0 ? Math.round(weightedSum / totalDays) : 0;
}

// Phase 86.8 Feature 6 — search/filter predicates.
// matchesSearch: case-insensitive substring match on task name. Empty query → match all.
// getVisibleByFilter: three-rule visibility per CONTEXT D-Q6:
//   (1) direct match → visible (full color)
//   (2) any descendant matches → visible AS CONTEXT (greyed via tg-row-context)
//   (3) any ancestor matches → visible (full color, child kept for context)
// Returns { visible, isContextOnly }. Empty query short-circuits to visible (not context).
function matchesSearch(t) {
    if (!_searchQuery) return true;
    return (t?.name || '').toLowerCase().includes(_searchQuery);
}
function getVisibleByFilter(t) {
    if (!_searchQuery) return { visible: true, isContextOnly: false };
    if (!t) return { visible: false, isContextOnly: false };
    if (matchesSearch(t)) return { visible: true, isContextOnly: false };
    // Descendant match → keep parent visible, greyed (context-only).
    const descendants = getDescendantIds(t.task_id);
    if (descendants.some(id => {
        const d = tasks.find(x => x.task_id === id);
        return d && matchesSearch(d);
    })) {
        return { visible: true, isContextOnly: true };
    }
    // Ancestor match → keep child visible (full color, ancestor's subtree shown for context).
    let cur = tasks.find(x => x.task_id === t.parent_task_id);
    let guard = 0;
    while (cur && guard < 64) {
        if (matchesSearch(cur)) return { visible: true, isContextOnly: false };
        cur = tasks.find(x => x.task_id === cur.parent_task_id);
        guard++;
    }
    return { visible: false, isContextOnly: false };
}

function renderTaskGrid() {
    const container = document.getElementById('taskGridRail');
    if (!container) return;
    const _savedScrollTop = container.scrollTop; // innerHTML replace resets scrollTop — preserve it

    // Depth-first hierarchical walk — same algorithm renderGantt uses for frappeTasks.
    // Siblings are sorted by row_order asc, but parents always precede their subtrees so the
    // grid stays in lockstep with the Gantt regardless of how row_order is assigned.
    const sorted = flattenTreeDepthFirst(tasks);

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
                <th class="tg-progress">Progress</th>
                <th class="tg-pred">Predecessors</th>
                <th class="tg-res">Resources</th>
              </tr></thead>
              <tbody id="taskGridBody">
                <tr class="tg-empty-row" data-task-id="__new__">
                  <td class="tg-rn"></td>
                  <td class="tg-name"><input class="tg-input tg-name-input" placeholder="Add task..." data-col="name" data-task-id="__new__" onkeydown="window.handleNewRowKeydown(event)"></td>
                  <td colspan="6"></td>
                </tr>
              </tbody>
            </table>`;
        bindGridEvents(container);
        container.scrollTop = _savedScrollTop;
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

    // Phase 86.8 Feature 2 + 6: filter out rows hidden by collapse OR by search.
    // Predicates COMPOSE: a row is rendered iff !isHiddenByCollapse AND getVisibleByFilter.visible.
    // The toggle itself stays visible — only descendants disappear from the rail.
    const visibleSorted = sorted.filter(t => {
        if (isHiddenByCollapse(t)) return false;
        return getVisibleByFilter(t).visible;
    });

    const today = new Date().toISOString().slice(0, 10);
    const rowsHtml = visibleSorted.map(t => {
        const rowNum = rowOrderCache.get(t.task_id);
        const isParent = isParentSet.has(t.task_id);
        const depth = computeDepth(t.task_id);
        const indent = depth * 16;
        const predStr = depsByTarget.get(t.task_id) || '';
        const durStr = computeDurationDisplay(t.start_date, t.end_date);
        // Phase 86.8 Feature 5: parent rows show weighted-average rollup (read-only); leaf
        // rows show their own progress (editable). Rollup is recomputed each render and
        // never persisted — only leaf-bound writes touch Firestore (handleGridCellBlur).
        const rolledUp = isParent ? computeWeightedProgress(t.task_id) : (t.progress ?? 0);
        // Phase 86.8 Feature 6: tg-row-context greys parents kept around because a descendant
        // matched the search (rule 2). Direct + ancestor matches render at full opacity.
        const filterMeta = getVisibleByFilter(t);
        const contextClass = filterMeta.isContextOnly ? ' tg-row-context' : '';
        // Phase 86.11 Plan 01 — status tinting for leaf rows only; parents are exempt.
        const statusClass = isParent ? '' : (' tg-row-' + computeStatus(t, today));
        // Phase 86.11 Plan 02 — milestone class appended last so CSS cascade can override status tint.
        const milestoneClass = t.is_milestone ? ' tg-row-milestone' : '';

        const parentLockAttr = isParent ? ' data-parent-locked="1"' : '';
        const parentStyle = isParent ? 'style="color:var(--gray-700,#475569);font-style:italic;"' : '';
        const collapseToggle = isParent
            ? `<span class="tg-collapse-toggle" data-task-id="${escapeHTML(t.task_id)}" data-collapsed="${_collapsedParents.has(t.task_id) ? '1' : '0'}">▼</span>`
            : '';

        return `
          <tr class="tg-row${contextClass}${statusClass}${milestoneClass}" data-task-id="${escapeHTML(t.task_id)}">
            <td class="tg-rn" draggable="true">${rowNum}</td>
            <td class="tg-name" style="padding-left:${indent}px;">
              <div class="tg-name-inner">${collapseToggle}<input class="tg-input tg-name-input" value="${escapeHTML(t.name || '')}" data-col="name"
                     data-task-id="${escapeHTML(t.task_id)}"></div>
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
            <td class="tg-progress"${parentLockAttr}>
              ${isParent
                ? `<span class="tg-locked" ${parentStyle} title="Weighted average of children (by leaf duration).">${rolledUp}%</span>`
                : `<input class="tg-input tg-progress-input" type="number" min="0" max="100" step="1"
                          value="${rolledUp}" data-col="progress" data-task-id="${escapeHTML(t.task_id)}">`}
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
        <td colspan="6"></td>
      </tr>`;

    // Phase 86.5-08: capture empty-row input state before innerHTML replace
    let _savedEmptyRow = null;
    const _activeEl = document.activeElement;
    if (_activeEl && _activeEl.classList?.contains('tg-name-input') && _activeEl.dataset?.taskId === '__new__') {
        _savedEmptyRow = {
            value: _activeEl.value,
            selectionStart: _activeEl.selectionStart,
            selectionEnd: _activeEl.selectionEnd
        };
    }

    container.innerHTML = `
      <table class="task-grid">
        <thead><tr>
          <th class="tg-rn">#</th>
          <th class="tg-name">Name</th>
          <th class="tg-dur">Duration</th>
          <th class="tg-date">Start</th>
          <th class="tg-date">End</th>
          <th class="tg-progress">Progress</th>
          <th class="tg-pred">Predecessors</th>
          <th class="tg-res">Resources</th>
        </tr></thead>
        <tbody id="taskGridBody">${rowsHtml}${emptyRow}</tbody>
      </table>`;

    // Bug2 fix (86.7): bind grid events AFTER innerHTML replace, not before.
    // bindGridEvents() before innerHTML triggered a capture-phase blur on the detached
    // __new__ input, causing handleNewRowCommit to fire again with the old value — creating
    // an infinite add-task loop. Moving it here ensures handlers attach to the fresh DOM.
    bindGridEvents(container);
    container.scrollTop = _savedScrollTop; // restore — must come after innerHTML/bindGridEvents

    // Phase 86.5-08: restore empty-row input state after innerHTML replace
    if (_savedEmptyRow) {
        const newRowInput = container.querySelector('.tg-empty-row .tg-name-input');
        if (newRowInput) {
            newRowInput.value = _savedEmptyRow.value;
            if (_focusRestoreTimer) clearTimeout(_focusRestoreTimer);
            _focusRestoreTimer = setTimeout(() => {
                _focusRestoreTimer = null;
                newRowInput.focus();
                try { newRowInput.setSelectionRange(_savedEmptyRow.selectionStart, _savedEmptyRow.selectionEnd); } catch (e) { /* swallow */ }
            }, 0);
        }
        _focusNewRowAfterRender = false; // savedEmptyRow took precedence; clear the flag if also set
    } else if (_focusNewRowAfterRender) {
        // Phase 86.5: Excel-style continuous entry — auto-focus new row after commit (no in-progress text)
        _focusNewRowAfterRender = false;
        const newRowInput = container.querySelector('.tg-empty-row .tg-name-input');
        if (newRowInput) {
            if (_focusRestoreTimer) clearTimeout(_focusRestoreTimer);
            _focusRestoreTimer = setTimeout(() => { _focusRestoreTimer = null; newRowInput.focus(); }, 0);
        }
    }
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
        // Reject spurious blur fired when innerHTML replaces the DOM while a node is focused.
        // The OLD handler from the previous render is still on container during the replacement,
        // so capture-phase blur reaches it even though the node is now detached.
        if (!input.isConnected) return;
        const taskId = input.dataset.taskId;
        const col = input.dataset.col;
        if (!taskId || !col) return;
        if (taskId === '__new__') return; // __new__ row commits only via Enter (handleNewRowKeydown), never on blur
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
        if (_selectedRowIds.size > 1 && _selectedRowIds.has(_draggedTaskId)) {
            handleGroupDrop([..._selectedRowIds], targetTaskId);
        } else {
            handleRowDrop(_draggedTaskId, targetTaskId);
        }
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
        e.preventDefault();
        input.blur(); // triggers handleGridCellBlur via existing capture-phase blur listener
    };
    container.addEventListener('keydown', _gridKeydownHandler);

    // Phase 86.8 Feature 2 — delegated click handler for collapse toggles (single source of truth:
    // both rail and Gantt re-render together so vertical row pitch stays consistent).
    if (_gridCollapseHandler) container.removeEventListener('click', _gridCollapseHandler);
    _gridCollapseHandler = function(e) {
        const toggle = e.target.closest('.tg-collapse-toggle');
        if (!toggle) return;
        e.stopPropagation();
        const id = toggle.dataset.taskId;
        if (!id) return;
        if (_collapsedParents.has(id)) _collapsedParents.delete(id);
        else _collapsedParents.add(id);
        renderTaskGrid();
        renderGantt();
    };
    container.addEventListener('click', _gridCollapseHandler);

    // Phase 86.8/86.10 — delegated row click for keyboard selection and shift+click multi-select.
    // INPUT guard is intentionally placed AFTER the shift+click check so clicking anywhere in a
    // row (including input cells) works as the anchor/target for shift+click range selection.
    if (_gridRowClickHandler) container.removeEventListener('click', _gridRowClickHandler);
    _gridRowClickHandler = function(e) {
        if (e.target.closest('.tg-collapse-toggle')) return;
        const row = e.target.closest('.tg-row');
        if (!row || row.classList.contains('tg-empty-row')) return;
        const id = row.dataset.taskId;
        if (!id || id === '__new__') return;
        const isInput = ['INPUT','TEXTAREA','SELECT','BUTTON'].includes(e.target.tagName);
        if (e.shiftKey && _lastClickedRowId && _lastClickedRowId !== id) {
            const ordered = flattenTreeDepthFirst(tasks).map(t => t.task_id);
            const anchorIdx = ordered.indexOf(_lastClickedRowId);
            const clickedIdx = ordered.indexOf(id);
            if (anchorIdx >= 0 && clickedIdx >= 0) {
                const lo = Math.min(anchorIdx, clickedIdx);
                const hi = Math.max(anchorIdx, clickedIdx);
                const rangeIds = ordered.slice(lo, hi + 1);
                selectRow(null); // clears single-select; anchor preserved (selectRow(null) skips _lastClickedRowId update)
                rangeIds.forEach(rid => _selectedRowIds.add(rid));
                container.querySelectorAll('.tg-row.tg-multi-selected').forEach(r => r.classList.remove('tg-multi-selected'));
                rangeIds.forEach(rid => {
                    container.querySelector(`.tg-row[data-task-id="${CSS.escape(rid)}"]`)?.classList.add('tg-multi-selected');
                });
                return;
            }
        }
        // Plain click on input: update anchor for future shift+clicks but let input handle focus
        if (isInput) {
            container.querySelectorAll('.tg-row.tg-multi-selected').forEach(r => r.classList.remove('tg-multi-selected'));
            _selectedRowIds.clear();
            _lastClickedRowId = id;
            return;
        }
        // Plain click on non-input: collapse multi-select, single-select
        container.querySelectorAll('.tg-row.tg-multi-selected').forEach(r => r.classList.remove('tg-multi-selected'));
        _selectedRowIds.clear();
        selectRow(id);
    };
    container.addEventListener('click', _gridRowClickHandler);

    // Phase 86.8 Feature 6 — search input lives in the toolbar (rendered once by render(), not
    // re-rendered by renderTaskGrid). Bound once in init(). Don't rebind here.
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
        // D-CLAMP: if new start is after current end, clamp end to start (1-day inclusive bar). Silent — no toast.
        const clampedEnd = (t.end_date && t.end_date < rawValue) ? rawValue : (t.end_date || rawValue);
        updateData = { start_date: rawValue, end_date: clampedEnd, updated_at: serverTimestamp() };

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
    } else if (col === 'progress') {
        // Phase 86.8 Feature 5: leaf-only progress write. Parent progress is rolled up
        // (computeWeightedProgress) and never persisted. Number.isFinite gate (T-86.8.2-07)
        // rejects non-numeric pasted strings silently; clamp 0-100 (T-86.8.2-01).
        const parsed = Number(rawValue);
        if (!Number.isFinite(parsed)) return;
        const clamped = Math.max(0, Math.min(100, Math.round(parsed)));
        if (clamped === (t.progress ?? 0)) return;
        updateData = { progress: clamped, updated_at: serverTimestamp() };
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
        // Phase 86.4 D-FS: for each newly added predecessor dep, auto-shift successor if needed
        if (col === 'predecessors' && updateData.dependencies) {
            const prevDeps = Array.isArray(t.dependencies) ? t.dependencies : [];
            const newlyAdded = updateData.dependencies.filter(id => !prevDeps.includes(id));
            for (const predId of newlyAdded) {
                await applyFsAutoSchedule(taskId, predId);
            }
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
    if (!input.value.trim()) return;          // re-entry guard
    const name = input.value.trim();
    input.value = '';                          // clear synchronously before any async work
    if (!currentProject?.project_code) {
        showToast(`This project doesn't have a project code yet.`, 'warning');
        return;
    }

    // Derive next task_id from local tasks array (no Firestore round-trip).
    // Format mirrors generateTaskId(): TASK-{project_code}-{maxSeq+1}.
    // Local state is kept fresh by onSnapshot; rapid consecutive Enters see each other's
    // optimistic appends, so seq numbers stay monotonic without server queries.
    const maxSeq = tasks.reduce((m, t) => {
        if (typeof t.task_id !== 'string') return m;
        const lastDash = t.task_id.lastIndexOf('-');
        if (lastDash < 0) return m;
        const n = parseInt(t.task_id.slice(lastDash + 1), 10);
        return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0);
    const taskId = `TASK-${currentProject.project_code}-${maxSeq + 1}`;

    const maxOrder = tasks.reduce((m, t) => Math.max(m, t.row_order ?? 0), 0);
    const newRowOrder = maxOrder + 1;

    const visualOrder = flattenTreeDepthFirst(tasks);
    const rowAbove = visualOrder[visualOrder.length - 1] ?? null;
    const inheritedParentId = rowAbove?.parent_task_id ?? null;
    const anchorStart = rowAbove?.start_date || formatDateISO(new Date());

    const docData = {
        task_id: taskId,
        project_id: currentProject.id,
        project_code: currentProject.project_code,
        parent_task_id: inheritedParentId,
        name,
        start_date: anchorStart,
        end_date: anchorStart,
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

    // Optimistic local append — render now, write async. Use Date placeholders on the local copy
    // since serverTimestamp() returns a sentinel that isn't a Date until snapshot reconciles.
    const now = new Date();
    const optimisticTask = { ...docData, created_at: now, updated_at: now };
    tasks.push(optimisticTask);
    _pendingOptimistic.set(taskId, optimisticTask); // Phase 86.5-08: survive snapshot wipes
    renderTaskGrid();
    fixGanttContainerScroll(); // grid now has one more row than the Gantt SVG — re-sync spacer

    try {
        await setDoc(doc(db, 'project_tasks', taskId), docData);
        // Snapshot will fire and replace optimistic entry with the server version (idempotent).
    } catch (err) {
        console.error('[ProjectPlan] handleNewRowCommit failed:', err);
        // Roll back optimistic add
        const idx = tasks.findIndex(t => t.task_id === taskId);
        if (idx >= 0) tasks.splice(idx, 1);
        renderTaskGrid();
        fixGanttContainerScroll(); // task removed — re-sync spacer back to steady state
        showToast(err?.code === 'permission-denied'
            ? `You don't have permission to add tasks on this project.`
            : 'Could not create task. Please try again.', 'error');
    } finally {
        _pendingOptimistic.delete(taskId); // Phase 86.5-08: clear pending entry after server confirms or rejects
    }
}

// Commit new-row entry on Enter; cancel on Escape
function handleNewRowKeydown(event) {
    const input = event.target;
    if (!input || !input.classList.contains('tg-name-input')) return;
    if (input.dataset.taskId !== '__new__') return;
    if (event.key === 'Enter') {
        event.preventDefault();
        _focusNewRowAfterRender = true;  // Phase 86.5: Excel-style continuous entry
        handleNewRowCommit(input);
    } else if (event.key === 'Escape') {
        input.value = '';
        input.blur();
    }
}

// ---- Phase 86.11 Plan 01 — computeStatus pure helper ----
// Returns one of: 'complete' | 'overdue' | 'not-started' | 'in-progress'
// today is a YYYY-MM-DD ISO string (string comparison is lexicographically correct for ISO dates).
function computeStatus(task, today) {
    if (task.progress >= 100)                              return 'complete';
    if (task.end_date < today)                             return 'overdue';
    if (task.start_date > today && task.progress === 0)    return 'not-started';
    return 'in-progress';
}

// ---- Task grid hierarchy + reorder operations (Plan 02) ----

// Right-click context menu — analog: procurement.js showRFPContextMenu
function showTaskContextMenu(event, taskId) {
    const existing = document.getElementById('taskGridContextMenu');
    if (existing) existing.remove();

    const t = tasks.find(x => x.task_id === taskId);
    if (!t) return;

    // Phase 86.10 Plan 03: determine group vs single menu mode
    const isGroupMenu = _selectedRowIds.size > 1 && _selectedRowIds.has(taskId);

    const menu = document.createElement('div');
    menu.id = 'taskGridContextMenu';
    menu.style.cssText = `position:fixed;left:${event.clientX}px;top:${event.clientY}px;background:white;border:1px solid #e5e7eb;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:4px 0;z-index:10000;min-width:200px;visibility:hidden;`;

    if (isGroupMenu) {
        // GROUP MENU — applies actions to all selected rows
        const selectedIdsArr = [..._selectedRowIds];
        const selectedIdsJson = escapeHTML(JSON.stringify(selectedIdsArr));

        // Determine topmost selected row in visual (depth-first) order for Insert Above
        const visualOrder = flattenTreeDepthFirst(tasks).map(t => t.task_id);
        const topmostSelectedId = visualOrder.find(id => _selectedRowIds.has(id)) || taskId;

        const hasPaste = _clipboardTasks.length > 0;

        menu.innerHTML = `
            <div style="padding:6px 16px;font-size:0.7rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">${_selectedRowIds.size} tasks selected</div>
            <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#1e293b;"
                 onmouseenter="this.style.background='#eff6ff'" onmouseleave="this.style.background='transparent'"
                 onclick="document.getElementById('taskGridContextMenu')?.remove(); window.gridGroupIndent('${selectedIdsJson}')">
                Indent Selection
            </div>
            <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#1e293b;"
                 onmouseenter="this.style.background='#eff6ff'" onmouseleave="this.style.background='transparent'"
                 onclick="document.getElementById('taskGridContextMenu')?.remove(); window.gridGroupOutdent('${selectedIdsJson}')">
                Outdent Selection
            </div>
            <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#1e293b;"
                 onmouseenter="this.style.background='#eff6ff'" onmouseleave="this.style.background='transparent'"
                 onclick="document.getElementById('taskGridContextMenu')?.remove(); window.gridInsertRowAbove('${escapeHTML(topmostSelectedId)}')">
                Insert Row Above
            </div>
            <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#ef4444;"
                 onmouseenter="this.style.background='#fef2f2'" onmouseleave="this.style.background='transparent'"
                 onclick="document.getElementById('taskGridContextMenu')?.remove(); window.gridGroupDelete('${selectedIdsJson}')">
                Delete Selection
            </div>
            <div style="border-top:1px solid #f1f5f9;margin:4px 0;"></div>
            <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#1e293b;"
                 onmouseenter="this.style.background='#eff6ff'" onmouseleave="this.style.background='transparent'"
                 onclick="document.getElementById('taskGridContextMenu')?.remove(); window.gridCopyRows('${selectedIdsJson}')">
                Copy Selection
            </div>
            <div style="padding:8px 16px;cursor:${hasPaste ? 'pointer' : 'not-allowed'};font-size:0.875rem;color:${hasPaste ? '#1e293b' : '#9ca3af'};"
                 ${hasPaste ? `onmouseenter="this.style.background='#eff6ff'" onmouseleave="this.style.background='transparent'"
                 onclick="document.getElementById('taskGridContextMenu')?.remove(); window.gridPasteRows('${escapeHTML(taskId)}')"` : ''}>
                Paste
            </div>
        `;
    } else {
        // SINGLE MENU — existing items + Copy/Paste appended
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

        const hasPaste = _clipboardTasks.length > 0;

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
            <div style="border-top:1px solid #f1f5f9;margin:4px 0;"></div>
            <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#1e293b;"
                 onmouseenter="this.style.background='#eff6ff'" onmouseleave="this.style.background='transparent'"
                 onclick="document.getElementById('taskGridContextMenu')?.remove(); window.gridCopyRows(JSON.stringify(['${escapeHTML(taskId)}']))">
                Copy
            </div>
            <div style="padding:8px 16px;cursor:${hasPaste ? 'pointer' : 'not-allowed'};font-size:0.875rem;color:${hasPaste ? '#1e293b' : '#9ca3af'};"
                 ${hasPaste ? `onmouseenter="this.style.background='#eff6ff'" onmouseleave="this.style.background='transparent'"
                 onclick="document.getElementById('taskGridContextMenu')?.remove(); window.gridPasteRows('${escapeHTML(taskId)}')"` : ''}>
                Paste
            </div>
            ${!hasChildren ? `<div style="border-top:1px solid #f1f5f9;margin:4px 0;"></div>
            <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#f59e0b;"
                 onmouseenter="this.style.background='#fffbeb'" onmouseleave="this.style.background='transparent'"
                 onclick="document.getElementById('taskGridContextMenu')?.remove(); window.gridToggleMilestone('${escapeHTML(taskId)}')">
                ${t.is_milestone ? 'Remove Milestone' : 'Mark as Milestone'}
            </div>` : ''}
        `;
    }

    document.body.appendChild(menu);
    // Flip up/left if menu overflows viewport
    const mh = menu.offsetHeight, mw = menu.offsetWidth;
    if (event.clientY + mh > window.innerHeight) menu.style.top = Math.max(0, event.clientY - mh) + 'px';
    if (event.clientX + mw > window.innerWidth) menu.style.left = Math.max(0, event.clientX - mw) + 'px';
    menu.style.visibility = '';
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
        // Anchor start/end on the displaced task's start_date (or today) so the new row has a
        // valid 1-day Gantt bar immediately — prevents appendNode from skipping it (no-date guard).
        const anchorInsert = t.start_date || formatDateISO(new Date());
        await setDoc(doc(db, 'project_tasks', newTaskId), {
            task_id: newTaskId,
            project_id: currentProject.id,
            project_code: currentProject.project_code,
            parent_task_id: t.parent_task_id || null,
            name: '',
            description: '',
            start_date: anchorInsert,
            end_date: anchorInsert,
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

function gridDeleteRow(taskId) {
    const t = tasks.find(x => x.task_id === taskId);
    if (!t) return;
    const hasChildren = tasks.some(x => x.parent_task_id === taskId);

    if (hasChildren) {
        const childCount = tasks.filter(x => x.parent_task_id === taskId).length;
        showDeleteConfirmModal(taskId, childCount);
    } else {
        // Leaf task — delete directly (no confirm)
        deleteTaskNow(taskId);
    }
}

function showDeleteConfirmModal(taskId, childCount) {
    document.getElementById('planDeleteConfirm')?.remove();
    const modal = document.createElement('div');
    modal.id = 'planDeleteConfirm';
    modal.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);z-index:10001;';
    modal.innerHTML =
        '<div style="background:#fff;border-radius:8px;padding:24px 28px;min-width:320px;max-width:480px;box-shadow:0 8px 32px rgba(0,0,0,0.2);">' +
            '<h3 style="margin:0 0 10px;font-size:1rem;color:#1e293b;">Delete task and subtasks?</h3>' +
            '<p style="color:#475569;margin:0 0 20px;font-size:0.875rem;line-height:1.5;">' +
                'This will permanently delete this task and its <strong>' + childCount + '</strong> subtask' + (childCount !== 1 ? 's' : '') + '. This cannot be undone.' +
            '</p>' +
            '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
                '<button id="planDeleteNo" style="padding:8px 16px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;color:#475569;cursor:pointer;font-size:0.875rem;">Cancel</button>' +
                '<button id="planDeleteYes" style="padding:8px 16px;border:none;border-radius:6px;background:#ef4444;color:#fff;cursor:pointer;font-size:0.875rem;font-weight:600;">Delete</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(modal);
    modal.querySelector('#planDeleteNo').addEventListener('click', () => modal.remove());
    modal.querySelector('#planDeleteYes').addEventListener('click', () => { modal.remove(); deleteTaskNow(taskId); });
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ---- Phase 86.10 Plan 03: Copy/Paste + Group operations ----

// gridCopyRows(taskIds) — saves task data to _clipboardTasks; shows toast.
// Accepts a JSON string or an array of task ID strings.
// _orig_id and row_order are saved so gridPasteRows can remap internal parent references.
function gridCopyRows(taskIds) {
    const ids = typeof taskIds === 'string' ? JSON.parse(taskIds) : taskIds;
    _clipboardTasks = ids
        .map(id => tasks.find(t => t.task_id === id))
        .filter(Boolean)
        .map(t => ({
            _orig_id: t.task_id,
            row_order: t.row_order ?? 0,
            task_name: t.name || t.task_name || '',
            parent_task_id: t.parent_task_id || null,
            start_date: t.start_date || null,
            end_date: t.end_date || null,
            assignees: t.assignees ? [...t.assignees] : [],
            resources: t.resources || '',
            progress: t.progress || 0,
            description: t.description || '',
            is_milestone: t.is_milestone || false,
            dependencies: t.dependencies ? [...t.dependencies] : []
        }));
    showToast(`${_clipboardTasks.length} task(s) copied`, 'success');
}

// gridPasteRows(afterTaskId) — creates new Firestore task documents below the given row,
// preserving the internal parent-child hierarchy of the copied selection.
// Root clipboard tasks (whose original parent was outside the copied set) land at the same
// indent level as afterTaskId. Children of copied tasks keep their relative nesting.
async function gridPasteRows(afterTaskId) {
    if (_clipboardTasks.length === 0) return;
    if (!currentProject?.project_code) {
        showToast(`This project doesn't have a project code yet.`, 'warning');
        return;
    }

    const visualOrder = flattenTreeDepthFirst(tasks).map(t => t.task_id);
    const afterIdx = visualOrder.indexOf(afterTaskId);
    const afterTask = tasks.find(t => t.task_id === afterTaskId);
    const pasteParentId = afterTask?.parent_task_id ?? null;

    // Sort clipboard by original row_order so parents come before children
    const sorted = _clipboardTasks.slice().sort((a, b) => (a.row_order ?? 0) - (b.row_order ?? 0));
    const origIdSet = new Set(sorted.map(x => x._orig_id));
    // If the clipboard contains parent-child pairs, preserve original depth for root items.
    // If the clipboard is a flat selection (no internal hierarchy), drop root items at the
    // paste target's indent level (pasteParentId).
    const hasInternalHierarchy = sorted.some(
        item => item.parent_task_id && origIdSet.has(item.parent_task_id)
    );

    showLoading(true);
    try {
        // Phase 1: allocate all new IDs from the local tasks array (no Firestore round-trip).
        // generateTaskId() reads Firestore each call — calling it N times before any setDoc
        // commits means every call sees the same max and returns the same ID.
        // Using the in-memory tasks[] (kept fresh by onSnapshot) avoids duplicates.
        let maxSeq = tasks.reduce((m, t) => {
            if (typeof t.task_id !== 'string') return m;
            const n = parseInt(t.task_id.slice(t.task_id.lastIndexOf('-') + 1), 10);
            return Number.isFinite(n) ? Math.max(m, n) : m;
        }, 0);
        const oldToNew = {};
        for (const item of sorted) {
            maxSeq++;
            oldToNew[item._orig_id] = `TASK-${currentProject.project_code}-${maxSeq}`;
        }

        // Phase 2: write all docs with remapped parents
        const newIds = [];
        for (const item of sorted) {
            const newTaskId = oldToNew[item._orig_id];
            // If this item's original parent was also copied, remap to the new parent ID.
            // For root items (parent not in clipboard): preserve original depth when the clipboard
            // carries internal hierarchy; otherwise drop at the paste target's indent level.
            const newParentId = (item.parent_task_id && origIdSet.has(item.parent_task_id))
                ? oldToNew[item.parent_task_id]
                : (hasInternalHierarchy ? (item.parent_task_id ?? null) : pasteParentId);
            const anchorDate = item.start_date || formatDateISO(new Date());
            await setDoc(doc(db, 'project_tasks', newTaskId), {
                task_id: newTaskId,
                project_id: currentProject.id,
                project_code: currentProject.project_code,
                parent_task_id: newParentId,
                name: item.task_name || '',
                description: item.description || '',
                start_date: item.start_date || anchorDate,
                end_date: item.end_date || anchorDate,
                progress: item.progress || 0,
                is_milestone: item.is_milestone || false,
                dependencies: item.dependencies ? [...item.dependencies] : [],
                assignees: item.assignees ? [...item.assignees] : [],
                resources: item.resources || '',
                row_order: 0,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            });
            newIds.push(newTaskId);
        }

        // Phase 3: splice new IDs (in DFS order) after afterTaskId, then normalize row_order
        const insertPos = afterIdx >= 0 ? afterIdx + 1 : visualOrder.length;
        await commitRowOrderReorder([
            ...visualOrder.slice(0, insertPos),
            ...newIds,
            ...visualOrder.slice(insertPos)
        ]);
    } catch (err) {
        console.error('[ProjectPlan] gridPasteRows failed:', err);
        showToast(err?.code === 'permission-denied'
            ? `You don't have permission to add tasks on this project.`
            : 'Could not paste tasks. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// gridGroupIndent — reparent root rows of the selection to the single anchor above the topmost selected row.
// "Root rows" = selected rows whose current parent is NOT also in the selection.
// Non-root rows keep their existing parent (which is already inside the moving group, so they shift with it).
async function gridGroupIndent(taskIdsJson) {
    const ids = JSON.parse(taskIdsJson);
    const idSet = new Set(ids);
    const rootIds = ids.filter(id => {
        const t = tasks.find(x => x.task_id === id);
        return t && !idSet.has(t.parent_task_id);
    });
    if (!rootIds.length) return;

    // Find the topmost root in visual order
    const visualOrder = flattenTreeDepthFirst(tasks).map(t => t.task_id);
    rootIds.sort((a, b) => visualOrder.indexOf(a) - visualOrder.indexOf(b));
    const topmostRootId = rootIds[0];

    // Anchor = first task above topmost root (in DFS visual order) that is NOT in the selection.
    // Use visualOrder (not row_order sort) so the anchor matches what the user sees on screen.
    const idx = visualOrder.indexOf(topmostRootId);
    if (idx <= 0) { showToast(`Can't indent — already at the top.`, 'warning'); return; }
    let anchor = null;
    for (let i = idx - 1; i >= 0; i--) {
        if (!idSet.has(visualOrder[i])) { anchor = tasks.find(x => x.task_id === visualOrder[i]) ?? null; break; }
    }
    if (!anchor) { showToast(`Can't indent — no task above selection.`, 'warning'); return; }

    // Cycle guard: anchor must not be a descendant of any root being indented
    for (const id of rootIds) {
        if (isDescendant(anchor.task_id, id)) {
            showToast(`Can't indent — would create a circular hierarchy.`, 'warning');
            return;
        }
    }

    showLoading(true);
    try {
        for (const id of rootIds) {
            const t = tasks.find(x => x.task_id === id);
            if (!t) continue;
            const oldParentId = t.parent_task_id || null;
            await updateDoc(doc(db, 'project_tasks', id), { parent_task_id: anchor.task_id, updated_at: serverTimestamp() });
            const i = tasks.findIndex(x => x.task_id === id);
            if (i >= 0) tasks[i] = { ...tasks[i], parent_task_id: anchor.task_id };
            if (oldParentId) await recomputeParentDates(oldParentId);
            await recomputeParentDates(anchor.task_id);
        }
    } catch (err) {
        console.error('[ProjectPlan] gridGroupIndent failed:', err);
        showToast('Could not indent selection. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// gridGroupOutdent — move root rows of the selection up one level (parent → grandparent).
// Non-root rows (parent inside selection) keep their relative position and shift with the group.
async function gridGroupOutdent(taskIdsJson) {
    const ids = JSON.parse(taskIdsJson);
    const idSet = new Set(ids);
    const rootIds = ids.filter(id => {
        const t = tasks.find(x => x.task_id === id);
        return t && !idSet.has(t.parent_task_id);
    });
    if (!rootIds.length) return;

    showLoading(true);
    try {
        for (const id of rootIds) {
            const t = tasks.find(x => x.task_id === id);
            if (!t || !t.parent_task_id) continue; // already at root
            const parent = tasks.find(x => x.task_id === t.parent_task_id);
            const newParentId = parent?.parent_task_id || null;
            const oldParentId = t.parent_task_id;
            await updateDoc(doc(db, 'project_tasks', id), { parent_task_id: newParentId, updated_at: serverTimestamp() });
            const i = tasks.findIndex(x => x.task_id === id);
            if (i >= 0) tasks[i] = { ...tasks[i], parent_task_id: newParentId };
            await recomputeParentDates(oldParentId);
            if (newParentId) await recomputeParentDates(newParentId);
        }
    } catch (err) {
        console.error('[ProjectPlan] gridGroupOutdent failed:', err);
        showToast('Could not outdent selection. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// gridGroupDelete(taskIdsJson) — delete all selected rows with a single confirm
// Calls deleteTaskNow() directly (bypassing the per-row confirm modal in gridDeleteRow)
// because the single upfront confirm covers the entire selection including subtasks.
async function gridGroupDelete(taskIdsJson) {
    const ids = JSON.parse(taskIdsJson);
    if (!ids.length) return;
    const confirmed = confirm(`Delete ${ids.length} selected tasks? Tasks with subtasks will also remove their subtasks.`);
    if (!confirmed) return;
    // Only delete topmost selected IDs — deleteTaskNow cascades the full subtree, so calling it
    // on a child whose parent is also selected would double-delete already-gone docs and corrupt
    // recomputeParentDates calls on the surviving ancestors.
    const idSet = new Set(ids);
    const topmost = ids.filter(id => {
        const t = tasks.find(x => x.task_id === id);
        return !t || !idSet.has(t.parent_task_id);
    });
    for (const id of topmost) {
        await deleteTaskNow(id);
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

// Phase 86.10: move all selected rows as a contiguous block to the drop target position
async function handleGroupDrop(selectedIds, targetTaskId) {
    const selSet = new Set(selectedIds);
    const ordered = flattenTreeDepthFirst(tasks).map(t => t.task_id);
    const selected = ordered.filter(id => selSet.has(id));
    const nonSelected = ordered.filter(id => !selSet.has(id));
    // Find insertion index: position AFTER targetTaskId in nonSelected array.
    // If targetTaskId is itself selected, walk down ordered from its position to find
    // the nearest non-selected task as the insertion anchor.
    let insertAnchorId = targetTaskId;
    if (selSet.has(targetTaskId)) {
        const fromIdx = ordered.indexOf(targetTaskId);
        insertAnchorId = null;
        for (let i = fromIdx + 1; i < ordered.length; i++) {
            if (!selSet.has(ordered[i])) { insertAnchorId = ordered[i]; break; }
        }
    }
    let insertAt;
    if (insertAnchorId === null) {
        insertAt = nonSelected.length; // append at end
    } else {
        const anchorInNonSel = nonSelected.indexOf(insertAnchorId);
        insertAt = anchorInNonSel >= 0 ? anchorInNonSel : nonSelected.length;
    }
    const reorderedAll = [...nonSelected.slice(0, insertAt), ...selected, ...nonSelected.slice(insertAt)];
    try {
        await commitRowOrderReorder(reorderedAll);
    } catch (err) {
        console.error('[ProjectPlan] handleGroupDrop failed:', err);
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
let _suppressFsViolationToast = false; // Phase 86.5-07: skip toast during drag-link write window
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
    const today = new Date().toISOString().slice(0, 10);
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
        if (isParent) customClass = 'parent-summary-bar';
        else if (t.is_milestone) customClass = 'milestone-marker';
        else {
            // Phase 86.11 — leaf task bar coloring by status
            const status = computeStatus(t, today);
            const statusClassMap = { overdue: 'bar-status-overdue', complete: 'bar-status-complete', 'not-started': 'bar-status-not-started' };
            customClass = statusClassMap[status] || '';
        }

        // Phase 86.8 Feature 5: parents pass the weighted rollup; leaves pass their own progress.
        // Frappe paints .bar-progress from this number; for parents the visual is suppressed by
        // existing CSS (.parent-summary-bar .bar-progress { display: none }) — the rollup value
        // is still useful for any future parent visualization without changing this code path.
        const progressForFrappe = isParent
            ? computeWeightedProgress(t.task_id)
            : (typeof t.progress === 'number' ? t.progress : 0);

        frappeTasks.push({
            id: t.task_id,
            name: t.name || '(unnamed)',
            start: start,
            end: end,
            progress: progressForFrappe,
            dependencies: depsArr.join(','),
            custom_class: customClass
        });
    }

    function walk(parentKey) {
        // Iterate VISIBLE children (filter-aware); appendNode still uses truth-set childrenByParent
        // to decide isParent / envelope so unfiltered structure is preserved on screen.
        // Phase 86.3 D-06/D-07: sort by row_order (same key the grid uses at line 248) so:
        // (a) newly inserted tasks stay at their row_order (no auto-resort by start_date)
        // (b) gantt.refresh(frappeTasks) after a horizontal bar drag does not reorder bars,
        //     since the field that changed (start_date) is no longer the sort key — bars stay row-locked.
        const kids = (visibleChildrenByParent.get(parentKey) || []).slice().sort((a, b) => (a.row_order ?? Infinity) - (b.row_order ?? Infinity));
        kids.forEach(t => {
            appendNode(t);
            if (visibleChildrenByParent.has(t.task_id)) walk(t.task_id);
        });
    }
    walk('__root__');

    // Phase 86.8 Feature 4: recompute critical path from the full truth-set (NOT visibleTasks
    // or post-collapse list). Collapse and search are visual filters; the schedule math
    // must see every task or the chain breaks the moment a critical leaf is collapsed.
    _criticalPathSet = computeCriticalPath(tasks.slice());

    // Phase 86.8 Feature 2 + 6: collapse hides bars; search further hides non-matching rows.
    // Parents still compute envelopes from the full truth-set above (childrenByParent /
    // getEnvelope) so collapse + search never change saved dates. Predicates COMPOSE: a bar is
    // rendered iff !isHiddenByCollapse AND getVisibleByFilter(t).visible. Empty search short-
    // circuits getVisibleByFilter to true so this loop is a no-op when neither filter is active.
    const filteredFrappeTasks = frappeTasks.filter(ft => {
        const t = tasks.find(x => x.task_id === ft.id);
        if (!t) return true;
        if (isHiddenByCollapse(t)) return false;
        return getVisibleByFilter(t).visible;
    });
    // Replace in place so the rest of renderGantt continues to operate on `frappeTasks`
    // (refresh, init, scroll-clamp etc. all read from this same array).
    frappeTasks.length = 0;
    Array.prototype.push.apply(frappeTasks, filteredFrappeTasks);

    if (frappeTasks.length === 0) {
        mountEl.innerHTML = '';
        gantt = null; // BloomFilter-guard: reset stale instance so next snapshot rebuilds clean
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
            // Phase 86.7 row-alignment fix: overrides default(30) so update_view_scale computes
            // config.header_height = 39+45+10 = 94 — matches left-pane .task-grid thead tr (94px) and overlay (94px).
            // Bar slot 0 then starts at y=94 instead of y=85, eliminating the constant 9px offset where
            // left-pane row labels sat 9px below right-pane bars. See .planning/debug/gantt-row-vertical-misalign.md.
            lower_header_height: 39,
            language: 'en',
            date_format: 'YYYY-MM-DD',
            popup: false,                          // DEFECT-4: suppress click-triggered popup
            infinite_padding: false,               // Phase 86.4 fix: prevent render() on mousewheel (breaks drag save + wipes injected SVG labels)
            // Phase 86.8 chain-drag UX: Frappe's default cascade (`move_dependencies: true`)
            // visually slides every transitive successor along with the dragged bar, even though
            // we now persist only the user-targeted task (_dragInitiatorTaskId guard). Users
            // perceived the live successor motion as "phantom movement." Disable the visual
            // cascade so only the bar the user grabbed moves on screen; FS-constraint
            // violations are still flagged after commit by applyFsViolationStyles().
            move_dependencies: false,
            on_date_change: handleGanttDateChange,
            on_progress_change: handleGanttProgressChange,
            on_click: handleGanttBarClick
        });
    }

    // 5. Apply FS-violation overlay (D-10)
    applyFsViolationStyles();

    // 5b. Phase 86.8 Feature 1: tag SVG arrows with data-from / data-to so the contextmenu
    // handler can identify the dependency edge without parsing the path's `d` string.
    const _arrowSvg = document.querySelector('#ganttPane svg');
    if (_arrowSvg) tagArrowsWithFromTo(_arrowSvg);

    // 5c. Phase 86.8 Feature 1: re-attach the right-click handler. Frappe rebuilds the SVG node
    // on every gantt.refresh(), so the listener must be re-attached after every renderGantt().
    mountGanttArrowContextMenu();

    // 5d. Phase 86.8 Feature 7: re-attach the SVG click → arrow selection handler.
    mountGanttArrowClickSelect();

    // 5e. Phase 86.8 Feature 4: apply the .critical class to bars + arrows.
    // Runs AFTER tagArrowsWithFromTo (5b) so arrow data-from/data-to is fresh.
    applyCriticalPathStyles();

    // Phase 86.12: baseline overlay — dashed outline rects, slip badge pills, summary row
    injectBaselineOverlay();
    renderSlipSummary();

    // 6. Today line + one-shot scroll-to-today
    renderTodayLine();
    if (!__ganttInitialScrollDone) {
        scrollGanttToToday();
        __ganttInitialScrollDone = true;
    }

    // 7. Phase 86.1 Plan 04 — drag-to-link overlay
    initGanttDragLink();

    // 8. Phase 86.3 D-01 — soft date floor scroll clamp (min(today, earliest task.start_date))
    installGanttScrollClamp();

    // 9. Phase 86.4 D-03 — custom header overlay (Option B: stable div, not Frappe injection)
    renderCustomGanttHeader();

    // 10. Phase 86.4 D-SCROLL — constrain container height so it scrolls (not .gantt-pane)
    fixGanttContainerScroll();

    // 11. Phase 86.7 — re-attach bar drag guard (Frappe rebuilds SVG on every refresh)
    mountGanttBarDragGuard();

    // 12. CSS ::before doesn't work on SVG <g> elements — inject diamond as native SVG rect
    injectMilestoneDiamonds();
}

function injectMilestoneDiamonds() {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const size = 10;
    document.querySelectorAll('#ganttPane .bar-wrapper.milestone-marker').forEach(wrapper => {
        wrapper.querySelector('.milestone-diamond')?.remove();
        const bar = wrapper.querySelector('.bar');
        if (!bar) return;
        const x = parseFloat(bar.getAttribute('x') || 0);
        const y = parseFloat(bar.getAttribute('y') || 0);
        const w = parseFloat(bar.getAttribute('width') || 0);
        const h = parseFloat(bar.getAttribute('height') || 20);
        const cx = x;
        const cy = y + h / 2;
        const diamond = document.createElementNS(SVG_NS, 'rect');
        diamond.setAttribute('class', 'milestone-diamond');
        diamond.setAttribute('x', cx - size / 2);
        diamond.setAttribute('y', cy - size / 2);
        diamond.setAttribute('width', size);
        diamond.setAttribute('height', size);
        diamond.setAttribute('rx', '1');
        diamond.setAttribute('fill', '#f59e0b');
        diamond.setAttribute('transform', `rotate(45, ${cx}, ${cy})`);
        diamond.style.pointerEvents = 'none';
        wrapper.appendChild(diamond);
    });
}

function mountGanttBarDragGuard() {
    // Phase 86.7: attach SVG mousedown to detect bar drag start.
    // Frappe rebuilds the SVG on every gantt.refresh() / new Gantt(), so we must
    // re-attach the listener after every renderGantt() call.
    const svg = document.querySelector('#ganttPane svg');
    if (!svg) return;

    // Remove previous SVG listener before re-attaching (Frappe rebuilt the SVG node).
    if (_ganttDragMousedownHandler) {
        svg.removeEventListener('mousedown', _ganttDragMousedownHandler);
    }

    _ganttDragMousedownHandler = function(e) {
        const wrapper = e.target.closest('.bar-wrapper');
        if (!wrapper) return; // ignore clicks outside bars
        _ganttBarDragging = true;
        _pendingDragWrite = null;
        _pendingProgressWrite = null;
        _parentDragInfo = null;
        // Phase 86.8 chain-drag fix: record the taskId the user grabbed so handleGanttDateChange
        // can filter out cascaded date_change events Frappe fires for dependent successors
        // (see .planning/debug/gantt-chain-drag-wrong-task.md).
        _dragInitiatorTaskId = wrapper.dataset.id || null;
        // Phase 86.8 Feature 3 fix: capture parent-bar drag at the DOM layer rather than via
        // Frappe's on_date_change. Frappe's date_changed gates on Number(_start) !== Number(new),
        // which silently no-ops for parent/summary bars whose internal _start is already
        // envelope-derived from children — so the cascade callback never reached our handler.
        if (wrapper.classList.contains('parent-summary-bar')) {
            const taskId = wrapper.dataset.id;
            if (taskId) _parentDragInfo = { taskId, mouseDownX: e.clientX };
        }
        // Safety: auto-clear after 10 s in case mouseup fires outside the document
        clearTimeout(_ganttDragSafetyTimer);
        _ganttDragSafetyTimer = setTimeout(() => {
            _ganttBarDragging = false;
            _pendingDragWrite = null;
            _pendingProgressWrite = null;
            _parentDragInfo = null;
            _dragInitiatorTaskId = null;
        }, 10000);
    };
    svg.addEventListener('mousedown', _ganttDragMousedownHandler);

    // Document-level mouseup flushes the pending write exactly once per gesture.
    // Remove old handler before re-attaching (idempotent across renderGantt calls).
    if (_ganttDragMouseupHandler) {
        document.removeEventListener('mouseup', _ganttDragMouseupHandler);
    }

    _ganttDragMouseupHandler = function(e) {
        if (!_ganttBarDragging) return;
        _ganttBarDragging = false;
        clearTimeout(_ganttDragSafetyTimer);

        // If mouseup fires outside the Gantt pane, Frappe calculates dates from the
        // out-of-bounds cursor position and may produce improbable values — revert instead.
        const ganttPane = document.querySelector('#ganttPane');
        if (ganttPane && !ganttPane.contains(e.target)) {
            _pendingDragWrite = null;
            _pendingProgressWrite = null;
            _parentDragInfo = null;
            _dragInitiatorTaskId = null;
            renderGantt();
            return;
        }

        // --- Phase 86.8 Feature 3: parent drag cascade (direct mouse delta) ---
        // Computed from mousedown→mouseup pixel delta, not Frappe's callback. Robust against the
        // strict-equality short-circuit in Frappe v1.2.2 date_changed for envelope-derived parents.
        if (_parentDragInfo) {
            const { taskId, mouseDownX } = _parentDragInfo;
            _parentDragInfo = null;
            // Discard the on_date_change parent stash if any (legacy path); cascade is authoritative here.
            if (_pendingDragWrite && _pendingDragWrite.parentDrag) _pendingDragWrite = null;
            const pixelDelta = e.clientX - mouseDownX;
            const xPerDay = ganttXPerDay() || 1;
            const daysDelta = Math.round(pixelDelta / xPerDay);
            if (daysDelta === 0) {
                renderGantt(); // revert any local Frappe shift below the day-rounding threshold
                return;
            }
            const descendantIds = getDescendantIds(taskId);
            const descendants = descendantIds.map(id => tasks.find(x => x.task_id === id)).filter(Boolean);
            const childUpdates = descendants
                .filter(d => d.start_date && d.end_date)
                .map(d => ({
                    taskId: d.task_id,
                    newStart: addDays(d.start_date, daysDelta),
                    newEnd: addDays(d.end_date, daysDelta)
                }));
            if (childUpdates.length === 0) {
                renderGantt();
                return;
            }
            // writeBatch caps at 500 ops; subtrees > 450 children would overflow but real plans
            // don't reach that — accept the limit and leave a single batch (T-86.8.1-08).
            const batch = writeBatch(db);
            childUpdates.forEach(u => {
                batch.update(doc(db, 'project_tasks', u.taskId), {
                    start_date: u.newStart,
                    end_date: u.newEnd,
                    updated_at: serverTimestamp()
                });
            });
            batch.commit().then(async () => {
                childUpdates.forEach(u => {
                    const idx = tasks.findIndex(x => x.task_id === u.taskId);
                    if (idx >= 0) tasks[idx] = { ...tasks[idx], start_date: u.newStart, end_date: u.newEnd };
                });
                await recomputeParentDates(taskId);
                const parent = tasks.find(x => x.task_id === taskId);
                if (parent?.parent_task_id) await recomputeParentDates(parent.parent_task_id);
            }).catch(err => {
                console.error('[ProjectPlan] Parent drag batch write failed:', err);
                showToast(err?.code === 'permission-denied'
                    ? `You don't have permission to edit tasks on this project.`
                    : 'Could not move task subtree.', 'error');
                renderGantt();
            });
            return; // single-task path doesn't apply to a parent gesture
        }

        // --- Flush pending single-task date write (Phase 86.7) ---
        if (_pendingDragWrite) {
            const { taskId, newStart, newEnd, parentId } = _pendingDragWrite;
            _pendingDragWrite = null;
            updateDoc(doc(db, 'project_tasks', taskId), {
                start_date: newStart,
                end_date: newEnd,
                updated_at: serverTimestamp()
            }).then(async () => {
                if (parentId) {
                    const idx = tasks.findIndex(x => x.task_id === taskId);
                    if (idx >= 0) tasks[idx] = { ...tasks[idx], start_date: newStart, end_date: newEnd };
                    await recomputeParentDates(parentId);
                }
            }).catch(err => {
                console.error('[ProjectPlan] Phantom drag write failed:', err);
                showToast(err?.code === 'permission-denied'
                    ? `You don't have permission to edit tasks on this project.`
                    : 'Could not save task. Please try again.', 'error');
                renderGantt(); // revert bar to last known position
            });
        }

        // --- Flush pending progress write ---
        if (_pendingProgressWrite) {
            const { taskId, progress } = _pendingProgressWrite;
            _pendingProgressWrite = null;
            updateDoc(doc(db, 'project_tasks', taskId), {
                progress,
                updated_at: serverTimestamp()
            }).catch(err => {
                console.error('[ProjectPlan] Phantom progress write failed:', err);
                showToast(err?.code === 'permission-denied'
                    ? `You don't have permission to edit tasks on this project.`
                    : 'Could not save task. Please try again.', 'error');
                renderGantt(); // revert
            });
        }

        // Phase 86.8 chain-drag fix: clear initiator at end of gesture so subsequent
        // (non-drag) on_date_change calls take the immediate-write path.
        _dragInitiatorTaskId = null;
    };
    document.addEventListener('mouseup', _ganttDragMouseupHandler);
}

// Phase 86.8 Feature 1: register the SVG-level right-click handler that opens the
// arrow-removal context menu. Idempotent: removes the previous listener before re-add
// because Frappe rebuilds the SVG on every refresh and the listener must follow.
function mountGanttArrowContextMenu() {
    const svg = document.querySelector('#ganttPane svg');
    if (!svg) return;
    if (_ganttArrowContextHandler) {
        try { svg.removeEventListener('contextmenu', _ganttArrowContextHandler); } catch (e) { /* swallow */ }
    }
    _ganttArrowContextHandler = function(e) {
        // Frappe v1.2.2 layers all arrow paths under a single <g class="arrow"> (source:
        // `this.layers.arrow.appendChild(r.element)`). The individual <path> arrows have NO
        // class, so `e.target.closest('.arrow')` returns the LAYER, not the path — and the
        // layer carries no data-from/data-to. Walk to the path explicitly.
        const arrowEl = findArrowPath(e.target);
        if (!arrowEl) return; // not on an arrow path — let the native menu fire
        // Parent-summary arrows are pointer-events:none — guard belt-and-braces.
        const cs = window.getComputedStyle(arrowEl);
        if (cs.pointerEvents === 'none') return;
        e.preventDefault();
        const { fromId, toId } = getArrowFromTo(arrowEl);
        if (!fromId || !toId) {
            showToast('Could not identify this dependency. Reload the project plan.', 'warning');
            return;
        }
        const fromTask = tasks.find(x => x.task_id === fromId);
        const toTask = tasks.find(x => x.task_id === toId);
        if (!fromTask || !toTask) return;
        showArrowContextMenu(e.clientX, e.clientY, fromTask, toTask, arrowEl);
    };
    svg.addEventListener('contextmenu', _ganttArrowContextHandler);
}

function showArrowContextMenu(x, y, fromTask, toTask, arrowEl) {
    document.querySelector('.gantt-arrow-menu')?.remove();
    if (_ganttArrowMenuClickaway) {
        document.removeEventListener('mousedown', _ganttArrowMenuClickaway);
        _ganttArrowMenuClickaway = null;
    }
    const truncate = (s, n) => (s && s.length > n) ? s.slice(0, n - 1) + '…' : (s || '');
    const fromName = truncate(fromTask.name || fromTask.task_id, 30);
    const toName = truncate(toTask.name || toTask.task_id, 30);

    const menu = document.createElement('div');
    menu.className = 'gantt-arrow-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.innerHTML =
        `<div class="gantt-arrow-menu-item" title="Remove dependency">` +
            `Remove dependency: ${escapeHTML(fromName)} → ${escapeHTML(toName)}` +
        `</div>`;
    document.body.appendChild(menu);

    arrowEl.classList.add('tg-arrow-selected');

    const item = menu.querySelector('.gantt-arrow-menu-item');
    item.addEventListener('click', () => {
        menu.remove();
        if (_ganttArrowMenuClickaway) {
            document.removeEventListener('mousedown', _ganttArrowMenuClickaway);
            _ganttArrowMenuClickaway = null;
        }
        arrowEl.classList.remove('tg-arrow-selected');
        removeArrowDependency(fromTask.task_id, toTask.task_id);
    });

    _ganttArrowMenuClickaway = function(ev) {
        if (!menu.contains(ev.target)) {
            menu.remove();
            arrowEl.classList.remove('tg-arrow-selected');
            document.removeEventListener('mousedown', _ganttArrowMenuClickaway);
            _ganttArrowMenuClickaway = null;
        }
    };
    // Defer attach so the same right-click that opened the menu doesn't immediately dismiss it.
    setTimeout(() => {
        if (_ganttArrowMenuClickaway) document.addEventListener('mousedown', _ganttArrowMenuClickaway);
    }, 0);
}

// Phase 86.8 Feature 7 — register an SVG click → arrow selection handler. Idempotent across
// renderGantt() calls because Frappe rebuilds the SVG node on every refresh.
function mountGanttArrowClickSelect() {
    const svg = document.querySelector('#ganttPane svg');
    if (!svg) return;
    if (_ganttArrowClickHandler) {
        try { svg.removeEventListener('click', _ganttArrowClickHandler); } catch (e) { /* swallow */ }
    }
    _ganttArrowClickHandler = function(e) {
        const arrowEl = findArrowPath(e.target);
        if (!arrowEl) return;
        const cs = window.getComputedStyle(arrowEl);
        if (cs.pointerEvents === 'none') return;
        const { fromId, toId } = getArrowFromTo(arrowEl);
        // Spoofing guard (T-86.8.1-05): only paths Frappe knows about qualify.
        if (!fromId || !toId) return;
        selectArrow(fromId, toId, arrowEl);
    };
    svg.addEventListener('click', _ganttArrowClickHandler);
}

// Phase 86.8 Feature 7 — selection helpers (row vs arrow are mutually exclusive).
function selectRow(taskId) {
    _selectedTaskId = taskId;
    _selectedRowIds.clear();
    if (taskId !== null) _lastClickedRowId = taskId; // null preserves anchor for shift+click continuation
    if (_selectedArrow?.el) {
        _selectedArrow.el.classList.remove('tg-arrow-selected');
    }
    _selectedArrow = null;
    document.querySelectorAll('.tg-row.tg-selected').forEach(r => r.classList.remove('tg-selected'));
    if (taskId) {
        document.querySelector(`.tg-row[data-task-id="${CSS.escape(taskId)}"]`)?.classList.add('tg-selected');
    }
}

function selectArrow(fromId, toId, el) {
    if (_selectedArrow?.el && _selectedArrow.el !== el) {
        _selectedArrow.el.classList.remove('tg-arrow-selected');
    }
    _selectedArrow = { fromId, toId, el };
    el.classList.add('tg-arrow-selected');
    // Single-target selection — clear row selection.
    _selectedTaskId = null;
    document.querySelectorAll('.tg-row.tg-selected').forEach(r => r.classList.remove('tg-selected'));
}

function clearSelection() {
    _selectedTaskId = null;
    _selectedRowIds.clear();
    _lastClickedRowId = null;
    if (_selectedArrow?.el) _selectedArrow.el.classList.remove('tg-arrow-selected');
    _selectedArrow = null;
    document.querySelectorAll('.tg-row.tg-selected').forEach(r => r.classList.remove('tg-selected'));
    document.querySelectorAll('.tg-row.tg-multi-selected').forEach(r => r.classList.remove('tg-multi-selected'));
}

async function removeArrowDependency(fromId, toId) {
    const toTask = tasks.find(x => x.task_id === toId);
    if (!toTask) return;
    const cur = Array.isArray(toTask.dependencies) ? toTask.dependencies : [];
    if (!cur.includes(fromId)) return; // already gone
    const next = cur.filter(d => d !== fromId);
    try {
        await updateDoc(doc(db, 'project_tasks', toId), {
            dependencies: next,
            updated_at: serverTimestamp()
        });
        // onSnapshot fires renderGantt; arrow disappears naturally.
    } catch (err) {
        console.error('[ProjectPlan] removeArrowDependency failed:', err);
        showToast(err?.code === 'permission-denied'
            ? `You don't have permission to edit tasks on this project.`
            : 'Could not remove dependency. Please try again.', 'error');
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
    installGanttScrollClamp(); // Phase 86.3 D-01 — recompute floor for new view_mode column_width
    renderCustomGanttHeader();
    fixGanttContainerScroll(); // re-constrain container after Frappe rebuilds SVG
    mountGanttBarDragGuard(); // Phase 86.7 — re-attach after Frappe SVG rebuild on zoom change
    initGanttDragLink();     // re-override parent bar heights after Frappe SVG rebuild on zoom change
    // Phase 86.8 Feature 1: re-tag arrows + re-attach context menu (Frappe rebuilds SVG on zoom).
    const _zoomSvg = document.querySelector('#ganttPane svg');
    if (_zoomSvg) tagArrowsWithFromTo(_zoomSvg);
    mountGanttArrowContextMenu();
    // Phase 86.8 Feature 7: re-attach arrow click selection (Frappe rebuilds SVG on zoom).
    mountGanttArrowClickSelect();
    // Phase 86.8 Feature 4: re-apply critical-path highlight (Frappe rebuilds SVG on zoom).
    applyCriticalPathStyles();
    // Phase 86.12: re-apply baseline overlay after Frappe SVG rebuild on zoom change
    injectBaselineOverlay();
    renderSlipSummary();
}

function handleGanttDateChange(task, start, end) {
    // task.id === task_id; start/end are Date objects from Frappe
    const t = tasks.find(x => x.task_id === task.id);
    if (!t) return;

    // Phase 86.8 Feature 3: parent drag is detected at the DOM layer (mountGanttBarDragGuard
    // mousedown sets _parentDragInfo; mouseup runs the cascade writeBatch). Frappe v1.2.2's
    // on_date_change is unreliable for parent/summary bars because date_changed gates on a
    // strict numeric equality check that silently no-ops when the parent's _start matches the
    // envelope it was rendered from. Returning here ensures that even if Frappe DOES fire
    // on_date_change for a parent we don't write the parent's date directly — parent dates
    // remain envelope-computed and recomputeParentDates is called after the cascade commit.
    const isParent = tasks.some(x => x.parent_task_id === t.task_id);
    if (isParent) return;

    // Phase 86.8 chain-drag fix: Frappe v1.2.2 fires on_date_change for every task in the
    // dependent chain on mouseup (move_dependencies default = true). Without this guard the last
    // cascaded successor overwrites _pendingDragWrite and the user-dragged task never gets saved.
    // See .planning/debug/gantt-chain-drag-wrong-task.md.
    if (_ganttBarDragging && _dragInitiatorTaskId && t.task_id !== _dragInitiatorTaskId) return;

    const newStart = formatDateISO(start);
    const newEnd = formatDateISO(end);
    if (newStart === t.start_date && newEnd === t.end_date) return;

    // Phase 86.7: defer write until mouseup — avoids mid-drag Firestore round-trips.
    // Only store valid date ranges; improbable values (cursor outside timeline) stay null
    // so the mouseup handler reverts the bar instead of flushing bad data.
    if (_ganttBarDragging) {
        if (newStart && newEnd && newStart <= newEnd) {
            _pendingDragWrite = { taskId: t.task_id, newStart, newEnd, parentId: t.parent_task_id || null };
        }
        return;
    }

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

    // Phase 86.7: defer write until mouseup
    if (_ganttBarDragging) {
        _pendingProgressWrite = { taskId: t.task_id, progress: newProgress };
        return;
    }

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

// Phase 86.8 Feature 4 — Critical Path Method (CPM) forward + backward pass.
// Returns Set<task_id> of leaf tasks where slack === 0 (i.e. on the longest dependency
// chain ending at the latest task end-date).
//
// CPM ignores parent tasks because parent dates are envelope-computed (D-11). Including
// them would duplicate critical-path edges through every parent. Parents inherit critical
// visual state from any critical descendant during the DOM tag pass (applyCriticalPathStyles).
//
// Implementation: repeated-pass forward fill until stable (real plans are <1000 tasks, so
// the O(N^2) cost is dominated by anything else). Cycle protection via iteration cap.
function computeCriticalPath(taskList) {
    if (!Array.isArray(taskList) || taskList.length === 0) return new Set();
    const dayMs = 86400000;
    const dayIndex = (iso) => Math.round(new Date(iso + 'T00:00:00').getTime() / dayMs);

    // Build leaf-only working set. parent_task_id-aware: a task is a parent iff some other
    // task lists it as parent_task_id. Skip parents entirely.
    const isParent = new Set();
    taskList.forEach(t => { if (t.parent_task_id) isParent.add(t.parent_task_id); });
    const leaves = taskList.filter(t => !isParent.has(t.task_id) && t.start_date && t.end_date);
    if (leaves.length === 0) return new Set();

    // For each leaf, build deps that point to OTHER LEAVES only. Predecessors that are
    // parents are translated to "no constraint" — we don't follow envelopes through CPM.
    const leafIds = new Set(leaves.map(l => l.task_id));
    const node = new Map(); // task_id -> { dur, deps[], es, ef, ls, lf }
    leaves.forEach(t => {
        const dur = Math.max(1, dayIndex(t.end_date) - dayIndex(t.start_date) + 1);
        const deps = Array.isArray(t.dependencies)
            ? t.dependencies.filter(d => leafIds.has(d))
            : [];
        node.set(t.task_id, { dur, deps, taskStart: dayIndex(t.start_date), es: 0, ef: 0, ls: 0, lf: 0 });
    });

    // ---- Forward pass: earliest_start = max(predecessor.ef + 1) or task's own start_date if no deps. ----
    // Repeat until stable (or iteration cap = leaves.length+1 — covers the longest chain).
    leaves.forEach(t => {
        const n = node.get(t.task_id);
        // If no deps, anchor on the task's recorded start_date so disconnected components keep
        // their natural offsets in the day-index space.
        if (n.deps.length === 0) {
            n.es = n.taskStart;
            n.ef = n.es + n.dur - 1;
        } else {
            n.es = n.taskStart; // initial seed
            n.ef = n.es + n.dur - 1;
        }
    });
    const cap = leaves.length + 1;
    let changed = true;
    let iter = 0;
    while (changed && iter < cap) {
        changed = false;
        leaves.forEach(t => {
            const n = node.get(t.task_id);
            if (n.deps.length === 0) return;
            let maxPredEf = -Infinity;
            n.deps.forEach(d => {
                const dn = node.get(d);
                if (dn) maxPredEf = Math.max(maxPredEf, dn.ef);
            });
            if (maxPredEf === -Infinity) return;
            const newEs = Math.max(n.taskStart, maxPredEf + 1);
            const newEf = newEs + n.dur - 1;
            if (newEs !== n.es || newEf !== n.ef) {
                n.es = newEs;
                n.ef = newEf;
                changed = true;
            }
        });
        iter++;
    }
    if (iter >= cap && changed) {
        // Cycle protection: if we still see changes at the cap, the dep graph has a cycle
        // (already toasted by detectDependencyCycle). Bail out to avoid infinite loop.
        console.warn('[ProjectPlan] computeCriticalPath: dependency cycle detected, returning empty set');
        return new Set();
    }

    // ---- Backward pass: latest_finish from project_end. ----
    // project_end = max(ef across all leaves). For a leaf with no successors, lf = project_end.
    let projectEnd = -Infinity;
    leaves.forEach(t => { projectEnd = Math.max(projectEnd, node.get(t.task_id).ef); });
    if (projectEnd === -Infinity) return new Set();
    // successors map
    const successors = new Map(); // taskId -> Set<successorId>
    leaves.forEach(t => {
        const n = node.get(t.task_id);
        n.deps.forEach(d => {
            if (!successors.has(d)) successors.set(d, new Set());
            successors.get(d).add(t.task_id);
        });
    });
    leaves.forEach(t => {
        const n = node.get(t.task_id);
        n.lf = projectEnd;
        n.ls = n.lf - n.dur + 1;
    });
    iter = 0; changed = true;
    while (changed && iter < cap) {
        changed = false;
        leaves.forEach(t => {
            const n = node.get(t.task_id);
            const succs = successors.get(t.task_id);
            if (!succs || succs.size === 0) return;
            let minSuccLs = Infinity;
            succs.forEach(s => {
                const sn = node.get(s);
                if (sn) minSuccLs = Math.min(minSuccLs, sn.ls);
            });
            if (minSuccLs === Infinity) return;
            const newLf = minSuccLs - 1;
            const newLs = newLf - n.dur + 1;
            if (newLf !== n.lf || newLs !== n.ls) {
                n.lf = newLf;
                n.ls = newLs;
                changed = true;
            }
        });
        iter++;
    }

    // A "critical path" requires actual edges. Without dependencies there is no path —
    // just isolated tasks that happen to end at the project end. Per UAT 2026-05-09:
    // flagging those as critical confused users ("something appeared red without a
    // dependency mapped onto it"). Compute critical edges first; a task is on the
    // critical path iff it is an endpoint of at least one critical edge.
    //
    // Critical edge (a → b): both endpoints slack === 0 AND a.ef + 1 === b.es
    // (i.e., a is the binding predecessor that determines b's earliest start).
    const slackZero = new Set();
    leaves.forEach(t => {
        const n = node.get(t.task_id);
        if (n.dur >= 1 && (n.ls - n.es) === 0) slackZero.add(t.task_id);
    });
    const out = new Set();
    leaves.forEach(t => {
        const n = node.get(t.task_id);
        if (!slackZero.has(t.task_id)) return;
        n.deps.forEach(d => {
            if (!slackZero.has(d)) return;
            const dn = node.get(d);
            if (!dn) return;
            if (dn.ef + 1 === n.es) {
                out.add(d);
                out.add(t.task_id);
            }
        });
    });
    return out;
}

// Phase 86.8 Feature 4 — apply / clear .critical class on bars + arrows after Frappe rebuilds SVG.
// Called from renderGantt() right after tagArrowsWithFromTo() so arrow data-from/data-to is fresh.
function applyCriticalPathStyles() {
    const svg = document.querySelector('#ganttPane svg');
    if (!svg) return;
    // Always clear previous run first — toggle OFF / search / collapse / zoom must start clean.
    svg.querySelectorAll('.bar-wrapper.critical').forEach(el => el.classList.remove('critical'));
    // Frappe puts every arrow path under one <g class="arrow"> layer; the paths themselves
    // carry no class. Iterate the paths directly (gantt.arrows[].element) instead of '.arrow'
    // (which would only match the layer group).
    if (gantt && Array.isArray(gantt.arrows)) {
        gantt.arrows.forEach(a => { if (a?.element) a.element.classList.remove('critical'); });
    }
    if (!_showCriticalPath || _criticalPathSet.size === 0) return;
    // Bars — leaf tasks that landed on the critical path.
    _criticalPathSet.forEach(taskId => {
        const wrapper = svg.querySelector(`.bar-wrapper[data-id="${CSS.escape(taskId)}"]`);
        if (wrapper) wrapper.classList.add('critical');
    });
    // Parent visual cue — a critical leaf inside a collapsed subtree must still flag the
    // parent so the user notices the schedule risk before expanding.
    tasks.forEach(t => {
        const isParent = tasks.some(x => x.parent_task_id === t.task_id);
        if (!isParent) return;
        const hasCriticalDescendant = getDescendantIds(t.task_id).some(id => _criticalPathSet.has(id));
        if (hasCriticalDescendant) {
            const wrapper = svg.querySelector(`.bar-wrapper[data-id="${CSS.escape(t.task_id)}"]`);
            if (wrapper) wrapper.classList.add('critical');
        }
    });
    // Arrows — tagArrowsWithFromTo (Plan 01) sets data-from/data-to on each arrow path.
    // An arrow is critical iff both endpoints are. Untagged arrows stay default-styled — fail-soft.
    if (gantt && Array.isArray(gantt.arrows)) {
        gantt.arrows.forEach(arrow => {
            const el = arrow?.element;
            if (!el) return;
            const from = el.getAttribute('data-from') || el.dataset?.from;
            const to = el.getAttribute('data-to') || el.dataset?.to;
            if (from && to && _criticalPathSet.has(from) && _criticalPathSet.has(to)) {
                el.classList.add('critical');
            }
        });
    }
}

// Phase 86.8 Feature 4 — toolbar checkbox handler.
function toggleCriticalPath(checked) {
    _showCriticalPath = !!checked;
    applyCriticalPathStyles();
}

// Phase 86.8 Feature 1: tag arrow SVG paths with data-from / data-to so right-click and
// click handlers can identify the dependency edge. Frappe v1.2.2's Arrow.draw() already
// sets these attributes natively, but in practice arrowEl.dataset.from has been observed
// empty in some browsers — likely due to SVGElement.dataset not reading hyphenated
// attributes consistently. Re-tag from gantt.arrows (Frappe's own array of Arrow
// instances) on every renderGantt because we control the timing and use both setAttribute
// AND dataset assignment so any reader works.
//
// gantt.arrows is the authoritative source: each Arrow has from_task / to_task pointing
// to the Bar whose .task.id is our task_id (we pass {id: t.task_id} to frappeTasks).
function tagArrowsWithFromTo(_unusedSvg) {
    if (!gantt || !Array.isArray(gantt.arrows)) return;
    gantt.arrows.forEach(arrow => {
        const el = arrow?.element;
        if (!el) return;
        const fromId = arrow.from_task?.task?.id;
        const toId = arrow.to_task?.task?.id;
        if (fromId) {
            el.setAttribute('data-from', fromId);
            try { el.dataset.from = fromId; } catch (e) { /* SVG dataset readonly — ignore */ }
        }
        if (toId) {
            el.setAttribute('data-to', toId);
            try { el.dataset.to = toId; } catch (e) { /* swallow */ }
        }
    });
}

// Phase 86.8 Feature 1 — resolve an arbitrary mouse event target to the actual arrow <path>.
// Frappe v1.2.2 puts every arrow path under one <g class="arrow"> layer (source:
// `this.layers.arrow.appendChild(r.element)`); the path itself carries no class. So
// e.target.closest('.arrow') from a path click returns the layer <g>, which has no
// data-from/data-to. The path is identified by being a <path> descendant of g.arrow.
function findArrowPath(target) {
    if (!target || target.tagName?.toLowerCase() !== 'path') return null;
    if (!target.closest('g.arrow')) return null;
    return target;
}

// Read (fromId, toId) for an arrow path element, preferring DOM attributes but falling back
// to gantt.arrows lookup by element identity. Single source of truth for any handler that
// needs to identify a dependency edge.
function getArrowFromTo(arrowEl) {
    if (!arrowEl) return { fromId: null, toId: null };
    let fromId = arrowEl.getAttribute('data-from') || arrowEl.dataset?.from || null;
    let toId = arrowEl.getAttribute('data-to') || arrowEl.dataset?.to || null;
    if ((!fromId || !toId) && gantt && Array.isArray(gantt.arrows)) {
        const match = gantt.arrows.find(a => a?.element === arrowEl);
        if (match) {
            fromId = fromId || match.from_task?.task?.id || null;
            toId = toId || match.to_task?.task?.id || null;
        }
    }
    return { fromId, toId };
}

// Frappe v1.2.2 view_modes set config.unit ∈ {day, week, month, year} and config.step is a count of those units.
// Day/Week use unit="day" so column_width/step gives px-per-day. Month/Year do not — convert via days-per-unit.
function ganttXPerDay() {
    if (!gantt || typeof gantt.config !== 'object') return 45;
    const unitDays = { day: 1, week: 7, month: 30, year: 365 };
    const daysPerColumn = (unitDays[gantt.config.unit] || 1) * (gantt.config.step || 1);
    return (gantt.config.column_width || 45) / daysPerColumn;
}

// Phase 86.12: Convert a YYYY-MM-DD date string to an SVG x-coordinate.
// Uses gantt.gantt_start as anchor — same math as renderTodayLine().
// Returns 0 (fail-open) if gantt is null or dateStr is falsy.
function dateToX(dateStr) {
    if (!gantt || !dateStr) return 0;
    try {
        const anchor = new Date(gantt.gantt_start instanceof Date ? gantt.gantt_start.getTime() : gantt.gantt_start);
        anchor.setHours(0, 0, 0, 0);
        const d = new Date(dateStr + 'T00:00:00');
        d.setHours(0, 0, 0, 0);
        return Math.round((d - anchor) / (1000 * 60 * 60 * 24)) * ganttXPerDay();
    } catch (e) {
        return 0;
    }
}

// Phase 86.12: Inject dashed outline rects and slip badge pills into the Gantt SVG
// for each task that has a baseline entry in _baselineData.
// Bar fill colors (.bar, .bar-status-*) are NOT modified — overlay is additive SVG only.
function injectBaselineOverlay() {
    if (!_baselineData || !_baselineData.tasks) return;
    if (!gantt) return;
    const ganttSvg = document.querySelector('#ganttPane svg');
    if (!ganttSvg) return;
    try {
        const ns = 'http://www.w3.org/2000/svg';
        // Remove previous overlay elements before re-injecting
        ganttSvg.querySelectorAll('.gantt-baseline-outline, .gantt-slip-badge, .gantt-slip-badge-bg').forEach(el => el.remove());
        for (const task of tasks) {
            try {
                const tid = task.task_id;
                const bl = _baselineData.tasks[tid];
                if (!bl || !bl.start || !bl.end) continue;
                const wrapper = ganttSvg.querySelector(`.bar-wrapper[data-id="${CSS.escape(tid)}"]`);
                if (!wrapper) continue;
                // Read bar y and height from the inner .bar rect (already rendered by Frappe)
                const barRect = wrapper.querySelector('.bar');
                if (!barRect) continue;
                const barY = parseFloat(barRect.getAttribute('y') || '0');
                const barH = parseFloat(barRect.getAttribute('height') || '20');
                // Compute baseline x extents
                const x1 = dateToX(bl.start);
                const x2 = dateToX(bl.end);
                if (x2 <= x1) continue; // degenerate range — skip
                // Inject dashed outline rect at baseline date range
                const rect = document.createElementNS(ns, 'rect');
                rect.setAttribute('class', 'gantt-baseline-outline');
                rect.setAttribute('x', x1);
                rect.setAttribute('y', barY);
                rect.setAttribute('width', x2 - x1);
                rect.setAttribute('height', barH);
                rect.setAttribute('rx', '3');
                ganttSvg.appendChild(rect);
                // Compute slip badge — compare current end_date vs baseline end
                if (!task.end_date) continue;
                const curEnd = new Date(task.end_date + 'T00:00:00');
                const blEnd  = new Date(bl.end + 'T00:00:00');
                curEnd.setHours(0, 0, 0, 0);
                blEnd.setHours(0, 0, 0, 0);
                const diffDays = Math.round((curEnd - blEnd) / (1000 * 60 * 60 * 24));
                if (diffDays === 0) continue; // on-track — outline only, no badge
                // Badge text and color
                const badgeText  = diffDays > 0 ? `+${diffDays}d` : `${diffDays}d`;
                const badgeColor = diffDays > 0 ? '#ef4444' : '#059669';
                const badgeBg    = diffDays > 0 ? '#fee2e2' : '#d1fae5';
                // Position badge to the right of the current bar's end x (not baseline)
                const curX2 = dateToX(task.end_date);
                const bx = curX2 + 4;
                const by = barY + barH / 2;
                // Background rect
                const badgeWidth = badgeText.length * 6 + 6;
                const bg = document.createElementNS(ns, 'rect');
                bg.setAttribute('class', 'gantt-slip-badge-bg');
                bg.setAttribute('x', bx);
                bg.setAttribute('y', by - 8);
                bg.setAttribute('width', badgeWidth);
                bg.setAttribute('height', 16);
                bg.setAttribute('rx', '3');
                bg.setAttribute('fill', badgeBg);
                ganttSvg.appendChild(bg);
                // Text label
                const text = document.createElementNS(ns, 'text');
                text.setAttribute('class', 'gantt-slip-badge');
                text.setAttribute('x', bx + badgeWidth / 2);
                text.setAttribute('y', by + 4);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('fill', badgeColor);
                text.textContent = badgeText;
                ganttSvg.appendChild(text);
            } catch (e) {
                // Per-task error — log silently, continue with remaining tasks
                console.warn('[Plan] injectBaselineOverlay task error:', e);
            }
        }
    } catch (e) {
        console.error('[Plan] injectBaselineOverlay error:', e);
    }
}

// Phase 86.12: Update the #baselineSlipSummary element with behind/ahead/on-track counts.
// Hides the element when no baseline is loaded.
function renderSlipSummary() {
    const el = document.getElementById('baselineSlipSummary');
    if (!el) return;
    try {
        if (!_baselineData || !_baselineData.tasks) {
            el.style.display = 'none';
            return;
        }
        let behind = 0, ahead = 0, onTrack = 0;
        for (const task of tasks) {
            const bl = _baselineData.tasks[task.task_id];
            if (!bl || !bl.end) continue;
            if (!task.end_date) continue;
            const diffDays = Math.round(
                (new Date(task.end_date + 'T00:00:00') - new Date(bl.end + 'T00:00:00')) / (1000 * 60 * 60 * 24)
            );
            if (diffDays > 0) behind++;
            else if (diffDays < 0) ahead++;
            else onTrack++;
        }
        el.innerHTML = `<span class="slip-behind">${behind} behind</span>
            <span class="slip-ahead">${ahead} ahead</span>
            <span class="slip-label">${onTrack} on track</span>
            <span class="slip-label" style="margin-left:auto;color:#94a3b8;">Baseline: ${escapeHTML(_baselineData.label || '')}</span>`;
        el.style.display = 'flex';
    } catch (e) {
        console.error('[Plan] renderSlipSummary error:', e);
        el.style.display = 'none';
    }
}

// ---- Phase 86.12: Baseline Snapshot ----

// Phase 86.12 (mbl): Load ALL baselines for the current project, ordered created_at desc.
// Auto-selects the most-recent baseline as the active overlay (back-compat with single-baseline
// behavior). Populates _baselines[], _activeBaselineId, and _baselineData together so they
// never drift out of sync.
async function loadBaselines() {
    if (!currentProject) {
        _baselines = [];
        _activeBaselineId = null;
        _baselineData = null;
        return;
    }
    try {
        const snap = await getDocs(query(
            collection(db, 'projects', currentProject.id, 'baselines'),
            orderBy('created_at', 'desc')
        ));
        _baselines = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const wasCleared = !!localStorage.getItem('baselineCleared_' + currentProject.id);
        if (wasCleared) {
            _activeBaselineId = null;
            _baselineData = null;
        } else if (_baselines.length > 0) {
            _activeBaselineId = _baselines[0].id;
            _baselineData = _baselines[0];
        } else {
            _activeBaselineId = null;
            _baselineData = null;
        }
    } catch (e) {
        console.error('[Plan] loadBaselines error:', e);
        _baselines = [];
        _activeBaselineId = null;
        _baselineData = null;
    }
}

async function saveBaseline() {
    if (!currentProject || tasks.length === 0) {
        showToast('No tasks to snapshot', 'warning');
        return;
    }
    try {
        // Build tasks map — all tasks with a task_id and at least one date
        const tasksMap = {};
        for (const task of tasks) {
            if (task.task_id && (task.start_date || task.end_date)) {
                tasksMap[task.task_id] = {
                    start: task.start_date || '',
                    end: task.end_date || ''
                };
            }
        }
        // Derive default label from existing baseline count, then let the user override
        // via a native prompt (Phase 86.12 polish, quick task 20260601-bnm). Cancel aborts
        // the save entirely; empty/whitespace OK falls back to the auto-name.
        const countSnap = await getDocs(collection(db, 'projects', currentProject.id, 'baselines'));
        const defaultLabel = `Baseline ${countSnap.size + 1}`;
        const userInput = window.prompt('Name this baseline:', defaultLabel);
        if (userInput === null) return;
        const label = (userInput.trim() || defaultLabel).substring(0, 60);
        // Write the baseline doc
        await addDoc(collection(db, 'projects', currentProject.id, 'baselines'), {
            label,
            created_at: serverTimestamp(),
            tasks: tasksMap
        });
        // Refresh in-memory baselines and re-render overlay immediately (WR-01: baselines write
        // does not trigger project_tasks snapshot, so overlay must be pushed manually).
        // loadBaselines() auto-selects the newest doc — which is the one we just wrote.
        if (currentProject?.id) localStorage.removeItem('baselineCleared_' + currentProject.id);
        await loadBaselines();
        injectBaselineOverlay();
        renderSlipSummary();
        updateBaselineToolbarUI();
        showToast(`Baseline "${label}" saved`, 'success');
    } catch (e) {
        console.error('[Plan] saveBaseline error:', e);
        showToast('Failed to save baseline', 'error');
    }
}

// Phase 86.12 (mbl): single toggle button. When no baseline is active in the overlay,
// "Set Baseline" creates a new one. When one is active, "Clear Baseline" hides it
// (without deleting any Firestore docs).
function toggleBaseline() {
    if (_activeBaselineId) {
        clearBaseline();
    } else {
        saveBaseline();
    }
}

// Phase 86.12 (mbl): selector change — switch which baseline drives the overlay.
// Empty value means "— none —" and routes through clearBaseline().
function selectBaseline(id) {
    if (!id) {
        clearBaseline();
        return;
    }
    const found = _baselines.find(b => b.id === id);
    if (!found) {
        console.warn('[Plan] selectBaseline: unknown id', id);
        return;
    }
    if (currentProject?.id) localStorage.removeItem('baselineCleared_' + currentProject.id);
    _activeBaselineId = id;
    _baselineData = found;
    injectBaselineOverlay();
    renderSlipSummary();
    updateBaselineToolbarUI();
}

// Phase 86.12 (mbl): hide the active overlay without touching Firestore.
// Saved baselines remain in _baselines[] (still selectable from the dropdown).
function clearBaseline() {
    _activeBaselineId = null;
    if (currentProject?.id) localStorage.setItem('baselineCleared_' + currentProject.id, '1');
    _baselineData = null;
    const ganttSvg = document.querySelector('#ganttPane svg');
    if (ganttSvg) {
        ganttSvg.querySelectorAll('.gantt-baseline-outline, .gantt-slip-badge, .gantt-slip-badge-bg').forEach(el => el.remove());
    }
    renderSlipSummary();
    updateBaselineToolbarUI();
}

// Phase 86.12 (mbl): repopulate the toolbar selector and flip the toggle button label
// to match current state. Called whenever _baselines or _activeBaselineId changes.
function updateBaselineToolbarUI() {
    const sel = document.getElementById('baselineSelect');
    if (sel) {
        let html = '<option value="">— none —</option>';
        for (const b of _baselines) {
            const selected = b.id === _activeBaselineId ? ' selected' : '';
            html += `<option value="${escapeHTML(b.id)}"${selected}>${escapeHTML(b.label || '(unnamed)')}</option>`;
        }
        sel.innerHTML = html;
    }
    const btn = document.getElementById('baselineToggleBtn');
    if (btn) {
        if (_activeBaselineId) {
            btn.textContent = 'Clear Baseline';
            btn.title = 'Hide baseline overlay (does not delete saved baselines)';
        } else {
            btn.textContent = 'Set Baseline';
            btn.title = 'Snapshot current task dates as a baseline';
        }
    }
}

// ---- Phase 97: Iteration history ----

async function loadIterations() {
    if (!currentProject) { _iterations = []; return; }
    try {
        const snap = await getDocs(
            query(
                collection(db, 'project_iterations'),
                where('project_id', '==', currentProject.id)
            )
        );
        _iterations = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => {
                const aMs = a.saved_at?.toMillis?.() ?? 0;
                const bMs = b.saved_at?.toMillis?.() ?? 0;
                return bMs - aMs; // newest first
            });
        _iterSeq = _iterations.filter(i => !i.auto).length;
    } catch (e) {
        console.error('[Plan] loadIterations error:', e);
        _iterations = [];
    }
}

async function saveIteration(label = null) {
    if (label === null) {
        label = window.prompt(`Save iteration as:`, `Iteration ${_iterSeq + 1}`);
        if (label === null) return; // user cancelled
    }
    label = label.trim();
    if (!label) return;
    label = label.substring(0, 60); // V5: truncate to 60 chars
    try {
        const snapshot = tasks.map(t => ({
            id:             t.id,
            task_id:        t.task_id        ?? null,
            project_id:     t.project_id,
            project_code:   t.project_code   ?? null,
            name:           t.name,
            start_date:     t.start_date     ?? null,
            end_date:       t.end_date       ?? null,
            progress:       t.progress       ?? 0,
            is_milestone:   t.is_milestone   ?? false,
            parent_task_id: t.parent_task_id ?? null,
            dependencies:   t.dependencies   || [],
            assignees:      t.assignees      || [],
            row_order:      t.row_order      ?? null,
            notes:          t.notes          || '',
            status:         t.status         ?? null,
            created_at:     t.created_at     ?? null,   // resolved Timestamp — do NOT use serverTimestamp() here
            updated_at:     t.updated_at     ?? null,   // resolved Timestamp — do NOT use serverTimestamp() here
            created_by:     t.created_by     ?? null,
        }));
        await addDoc(collection(db, 'project_iterations'), {
            project_id: currentProject.id,
            label:      label,
            saved_at:   serverTimestamp(),
            auto:       false,
            tasks:      snapshot,
        });
        await loadIterations();
        renderIterRail();
        showToast(`Iteration "${label}" saved.`, 'success');
    } catch (e) {
        console.error('[Plan] saveIteration error:', e);
        showToast('Failed to save iteration.', 'error');
    }
}

// promptSaveIteration() — alias/entry point for saveIteration() called from the rail + Save button
function promptSaveIteration() {
    return saveIteration(null);
}

function _formatIterTimestamp(savedAt) {
    if (!savedAt || typeof savedAt.toDate !== 'function') return 'Just now';
    const date = savedAt.toDate();
    const diff = Date.now() - date.getTime();
    if (diff < 3600000) return '< 1h ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return date.toLocaleDateString();
}

function renderIterRail() {
    const timeline = document.getElementById('iterRailTimeline');
    const badge    = document.getElementById('iterCountBadge');
    if (!timeline) return;

    const visible = _iterations.filter(i => !i.auto);

    if (badge) badge.textContent = visible.length;

    if (visible.length === 0) {
        timeline.innerHTML = '<div style="padding:12px;font-size:12px;color:#64748b;text-align:center;">No saved iterations yet.</div>';
        return;
    }

    timeline.innerHTML = visible.map((iter, idx) => {
        const savedLabel = _formatIterTimestamp(iter.saved_at);
        const taskCount  = iter.tasks?.length ?? 0;
        const isActive   = _activeDiffIterationId === iter.id;
        return `
          <div class="iter-timeline-item">
            <div class="iter-tl-dot">${visible.length - idx}</div>
            <div class="iter-tl-content">
              <div class="iter-tl-name">${escapeHTML(iter.label)}</div>
              <div class="iter-tl-meta">${savedLabel} · ${taskCount} tasks</div>
              <div class="iter-tl-actions">
                <button class="iter-tl-btn diff-btn ${isActive ? 'active' : ''}"
                    onclick="window.toggleIterDiff('${iter.id}')">
                  ${isActive ? '&#x25B6; Diffing' : '&#x27F7; Diff'}
                </button>
                <button class="iter-tl-btn load-btn"
                    onclick="window.openIterConfirm('${iter.id}')">Load &#x2192;</button>
                <button class="iter-tl-delete-btn"
                    onclick="window.deleteIteration('${iter.id}')"
                    title="Delete iteration">&#xD7;</button>
              </div>
            </div>
          </div>`;
    }).join('');
}

async function deleteIteration(iterationId) {
    const iter = _iterations.find(i => i.id === iterationId);
    if (!iter) return;
    // Remove any existing delete modal
    document.getElementById('iterDeleteModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'iterDeleteModal';
    modal.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);z-index:10001;';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:8px;padding:28px 24px;min-width:320px;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
            <h3 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1e293b;">Delete Iteration</h3>
            <p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.5;">
                Delete <strong>${escapeHTML(iter.label)}</strong>? This cannot be undone.
            </p>
            <div style="display:flex;justify-content:flex-end;gap:8px;">
                <button id="iterDeleteCancel" style="padding:7px 16px;font-size:13px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;color:#475569;cursor:pointer;">Cancel</button>
                <button id="iterDeleteConfirm" style="padding:7px 16px;font-size:13px;border:none;border-radius:6px;background:#ef4444;color:#fff;cursor:pointer;font-weight:600;">Delete</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#iterDeleteCancel').addEventListener('click', () => modal.remove());
    modal.querySelector('#iterDeleteConfirm').addEventListener('click', async () => {
        modal.remove();
        try {
            await deleteDoc(doc(db, 'project_iterations', iterationId));
            await loadIterations();
            renderIterRail();
        } catch (e) {
            console.error('[Plan] deleteIteration error:', e);
            showToast('Failed to delete iteration.', 'error');
        }
    });
}

function toggleIterRail() {
    const rail = document.getElementById('iterRail');
    const btn  = document.getElementById('iterHistoryBtn');
    if (!rail) return;
    if (rail.hasAttribute('hidden')) {
        rail.removeAttribute('hidden');
        _iterRailOpen = true;
        btn?.classList.add('active');
    } else {
        rail.setAttribute('hidden', '');
        _iterRailOpen = false;
        btn?.classList.remove('active');
    }
}

function closeIterRail() {
    const rail = document.getElementById('iterRail');
    const btn  = document.getElementById('iterHistoryBtn');
    rail?.setAttribute('hidden', '');
    _iterRailOpen = false;
    btn?.classList.remove('active');
}

// Phase 97 Plan 04: Restore mechanic — confirm modal, restore, auto-snapshot, undo toast

function openIterConfirm(iterationId) {
    const iter = _iterations.find(i => i.id === iterationId);
    if (!iter) return;
    // Remove any existing confirm modal
    document.getElementById('iterConfirmModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'iterConfirmModal';
    modal.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);z-index:10001;';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:8px;padding:28px 24px;min-width:320px;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
            <h3 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1e293b;">Load Iteration</h3>
            <p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.5;">
                Load <strong>${escapeHTML(iter.label)}</strong>?
                Your current plan will be auto-saved first so you can undo within 5 seconds.
            </p>
            <div style="display:flex;justify-content:flex-end;gap:8px;">
                <button onclick="document.getElementById('iterConfirmModal')?.remove()" style="padding:7px 16px;font-size:13px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;color:#475569;cursor:pointer;">Cancel</button>
                <button onclick="window.confirmIterLoad('${escapeHTML(iter.id)}');document.getElementById('iterConfirmModal')?.remove()" style="padding:7px 16px;font-size:13px;border:none;border-radius:6px;background:#1a73e8;color:#fff;cursor:pointer;font-weight:600;">Load</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

async function confirmIterLoad(iterationId) {
    document.getElementById('iterConfirmModal')?.remove();
    await restoreIteration(iterationId);
}

async function restoreIteration(iterationId) {
    const iter = _iterations.find(i => i.id === iterationId);
    if (!iter) return;
    await dismissUndoToast();   // WR-01: always clear stale undo from any prior restore
    try {
        if (!iter.auto) {
            // STEP 1 — Auto-snapshot current state BEFORE restore (only for non-auto iterations)
            const autoLabel = `Auto-save before "${iter.label}"`;
            const snapshot = tasks.map(t => ({
                id:             t.id,
                task_id:        t.task_id        ?? null,
                project_id:     t.project_id,
                project_code:   t.project_code   ?? null,
                name:           t.name,
                start_date:     t.start_date     ?? null,
                end_date:       t.end_date       ?? null,
                progress:       t.progress       ?? 0,
                is_milestone:   t.is_milestone   ?? false,
                parent_task_id: t.parent_task_id ?? null,
                dependencies:   t.dependencies   || [],
                assignees:      t.assignees      || [],
                row_order:      t.row_order      ?? null,
                notes:          t.notes          || '',
                status:         t.status         ?? null,
                created_at:     t.created_at     ?? null,
                updated_at:     t.updated_at     ?? null,
                created_by:     t.created_by     ?? null,
            }));
            const autoRef = await addDoc(collection(db, 'project_iterations'), {
                project_id: currentProject.id,
                label:      autoLabel,
                saved_at:   serverTimestamp(),
                auto:       true,
                tasks:      snapshot,
            });
            _autoSnapId = autoRef.id;
        }

        // STEP 2 — Batch-write: delete all current project_tasks, write iteration tasks back
        const existingSnap = await getDocs(
            query(collection(db, 'project_tasks'), where('project_id', '==', currentProject.id))
        );
        const toDelete = existingSnap.docs;
        const toWrite  = Array.isArray(iter.tasks) ? iter.tasks : [];
        const OPS_PER_BATCH = 450;
        const allOps = [
            ...toDelete.map(d => ({ type: 'delete', ref: d.ref })),
            ...toWrite.map(t  => ({ type: 'set', ref: doc(db, 'project_tasks', t.id), data: (({ id, ...rest }) => rest)(t) })),
        ];
        for (let i = 0; i < allOps.length; i += OPS_PER_BATCH) {
            const chunk = allOps.slice(i, i + OPS_PER_BATCH);
            const batch = writeBatch(db);
            chunk.forEach(op => op.type === 'delete' ? batch.delete(op.ref) : batch.set(op.ref, op.data));
            await batch.commit();
        }

        // STEP 3 — Refresh iterations rail (auto-snapshot now appears)
        await loadIterations();
        renderIterRail();

        // STEP 4 — Show undo toast (only when a new auto-snapshot was created)
        if (!iter.auto) {
            showUndoToast(`Loaded "${iter.label}" — Undo to revert.`);
        } else {
            showToast('Auto-save restored.', 'success');
        }
    } catch (e) {
        console.error('[Plan] restoreIteration error:', e);
        // Do not clear _autoSnapId — auto-snapshot may have already been written
        showToast('Restore failed. Plan may be partially updated — check history rail.', 'error');
        await loadIterations();
        renderIterRail();
    }
}

function showUndoToast(msg) {
    dismissUndoToast(); // clear any previous toast first
    const el = document.createElement('div');
    el.id = 'iterUndoToast';
    el.className = 'iter-undo-toast';
    el.innerHTML = `<span>${escapeHTML(msg)}</span><button class="iter-undo-btn" onclick="window.undoIterRestore()">Undo</button>`;
    document.body.appendChild(el);
    _undoToastTimer = setTimeout(() => {
        dismissUndoToast();
    }, 5000);
}

async function dismissUndoToast() {
    clearTimeout(_undoToastTimer);
    document.getElementById('iterUndoToast')?.remove();
    if (_autoSnapId) {
        const snapId = _autoSnapId;
        _autoSnapId = null;
        try {
            await deleteDoc(doc(db, 'project_iterations', snapId));
        } catch (e) {
            // silent — auto-snapshot cleanup is best-effort
        }
    }
}

async function undoIterRestore() {
    if (!_autoSnapId) return;
    clearTimeout(_undoToastTimer);
    const autoSnap = _iterations.find(i => i.id === _autoSnapId);
    if (!autoSnap) { _autoSnapId = null; return; }
    try {
        // Restore from auto-snapshot tasks (same batch pattern; no new auto-snapshot)
        const snap = await getDocs(
            query(collection(db, 'project_tasks'), where('project_id', '==', currentProject.id))
        );
        const OPS_PER_BATCH = 450;
        const allOps = [
            ...snap.docs.map(d => ({ type: 'delete', ref: d.ref })),
            ...autoSnap.tasks.map(t => ({ type: 'set', ref: doc(db, 'project_tasks', t.id), data: (({ id, ...rest }) => rest)(t) })),
        ];
        for (let i = 0; i < allOps.length; i += OPS_PER_BATCH) {
            const chunk = allOps.slice(i, i + OPS_PER_BATCH);
            const batch = writeBatch(db);
            chunk.forEach(op => op.type === 'delete' ? batch.delete(op.ref) : batch.set(op.ref, op.data));
            await batch.commit();
        }
        // Delete the auto-snapshot from Firestore
        await deleteDoc(doc(db, 'project_iterations', _autoSnapId));
        _autoSnapId = null;
        dismissUndoToast();
        await loadIterations();
        renderIterRail();
    } catch (e) {
        console.error('[Plan] undoIterRestore error:', e);
        showToast('Undo failed.', 'error');
    }
}

// Phase 97 Plan 05: Diff view — computeDiff() + renderDiffPanel() + toggleIterDiff() + closeIterDiff()

const DIFF_FIELDS = ['name', 'start_date', 'end_date', 'dependencies', 'resources', 'progress', 'is_milestone', 'notes', 'row_order'];

function computeDiff(liveTasks, snapTasks) {
    const safeSnap = Array.isArray(snapTasks) ? snapTasks : [];
    const allIds = [...new Set([...liveTasks.map(t => t.id), ...safeSnap.map(t => t.id)])];
    return allIds.map(id => {
        const l = liveTasks.find(t => t.id === id);
        const s = safeSnap.find(t => t.id === id);
        if (!l && s) return { status: 'added',   snap: s, live: null, changes: [] };
        if (l && !s) return { status: 'removed',  snap: null, live: l, changes: [] };
        const changes = DIFF_FIELDS
            .map(f => {
                const lv = Array.isArray(l[f]) ? (l[f] || []).join(',') : String(l[f] ?? '');
                const sv = Array.isArray(s[f]) ? (s[f] || []).join(',') : String(s[f] ?? '');
                return lv !== sv ? { field: f, live: l[f], snap: s[f] } : null;
            })
            .filter(Boolean);
        return { status: changes.length ? 'changed' : 'same', live: l, snap: s, changes };
    });
}

function renderDiffPanel(iter, diffRows) {
    const panel  = document.getElementById('iterDiffPanel');
    const title  = document.getElementById('iterDiffTitle');
    const summary = document.getElementById('iterDiffSummary');
    const tbody  = document.getElementById('iterDiffBody');
    if (!panel || !tbody) return;

    // Update header
    if (title)   title.textContent   = `Comparing with "${iter.label}"`;
    const changed = diffRows.filter(r => r.status === 'changed').length;
    const added   = diffRows.filter(r => r.status === 'added').length;
    const removed = diffRows.filter(r => r.status === 'removed').length;
    if (summary) summary.textContent = `${changed} changed · ${added} added · ${removed} removed`;

    // Build tbody rows
    const statusClass = { same: 'iter-diff-row-same', changed: 'iter-diff-row-changed', added: 'iter-diff-row-added', removed: 'iter-diff-row-removed' };
    const badgeClass  = { same: 'same', changed: 'changed', added: 'added', removed: 'removed' };
    const badgeLabel  = { same: 'Same', changed: 'Changed', added: 'Added', removed: 'Removed' };

    tbody.innerHTML = diffRows.map(row => {
        const task = row.live || row.snap;
        const sc  = statusClass[row.status];
        const bc  = badgeClass[row.status];
        const bl  = badgeLabel[row.status];

        const getName  = () => { const c = row.changes.find(f => f.field === 'name');       return c ? `<span class="iter-diff-old">${escapeHTML(String(c.snap ?? ''))}</span> <span class="iter-diff-new">${escapeHTML(String(c.live ?? ''))}</span>` : escapeHTML(String(task?.name ?? '')); };
        const getStart = () => { const c = row.changes.find(f => f.field === 'start_date'); return c ? `<span class="iter-diff-old">${escapeHTML(String(c.snap ?? ''))}</span> <span class="iter-diff-new">${escapeHTML(String(c.live ?? ''))}</span>` : escapeHTML(String(task?.start_date ?? '')); };
        const getEnd   = () => { const c = row.changes.find(f => f.field === 'end_date');   return c ? `<span class="iter-diff-old">${escapeHTML(String(c.snap ?? ''))}</span> <span class="iter-diff-new">${escapeHTML(String(c.live ?? ''))}</span>` : escapeHTML(String(task?.end_date ?? '')); };
        const getDeps  = () => escapeHTML(String((task?.dependencies || []).join(', ')));
        const getRes   = () => escapeHTML(String(task?.resources ?? ''));
        const getProg  = () => escapeHTML(String(task?.progress ?? ''));

        return `<tr class="${sc}">
          <td><span class="iter-diff-badge ${bc}">${bl}</span></td>
          <td>${getName()}</td>
          <td>${getStart()}</td>
          <td>${getEnd()}</td>
          <td>${getDeps()}</td>
          <td>${getRes()}</td>
          <td>${getProg()}%</td>
        </tr>`;
    }).join('');

    panel.removeAttribute('hidden');
}

function toggleIterDiff(iterationId) {
    if (_activeDiffIterationId === iterationId) {
        closeIterDiff();
        return;
    }
    const iter = _iterations.find(i => i.id === iterationId);
    if (!iter) return;
    _activeDiffIterationId = iterationId;
    window._activeDiffIterationId = iterationId; // CRITICAL: must be on window for diff panel "Load this →" inline onclick
    const diffRows = computeDiff(tasks, iter.tasks);
    renderDiffPanel(iter, diffRows);
    renderIterRail(); // re-render rail to show "▶ Diffing" active state on the button
}

function closeIterDiff() {
    _activeDiffIterationId = null;
    window._activeDiffIterationId = null;
    document.getElementById('iterDiffPanel')?.setAttribute('hidden', '');
    renderIterRail(); // re-render rail to clear active state
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
        const xPerDay = ganttXPerDay();
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
        const xPerDay = ganttXPerDay();
        const x = dayDiff * xPerDay;
        // Center today in the visible pane
        pane.scrollLeft = Math.max(0, x - pane.clientWidth / 2);
    } catch (e) { /* swallow */ }
}

// Phase 86.3 D-01/D-02: compute the floor x-coordinate for the soft date floor.
// Floor date = min(today, earliest task.start_date). For empty / all-future projects → today.
// Returns 0 (no clamp) if gantt is null or computation fails — fail-open.
function computeGanttFloorX() {
    if (!gantt) return 0;
    try {
        const startDate = gantt.gantt_start instanceof Date ? gantt.gantt_start : new Date(gantt.gantt_start);
        startDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Earliest task.start_date (if any), else today
        let earliest = null;
        for (const t of tasks) {
            if (!t.start_date) continue;
            const d = new Date(t.start_date + 'T00:00:00');
            d.setHours(0, 0, 0, 0);
            if (!earliest || d < earliest) earliest = d;
        }
        // Soft floor: min(today, earliest). Empty / future-only projects → today.
        const floorDate = (earliest && earliest < today) ? earliest : today;
        const dayDiff = Math.round((floorDate - startDate) / (1000 * 60 * 60 * 24));
        const xPerDay = ganttXPerDay();
        const floorX = Math.max(0, dayDiff * xPerDay);
        return floorX;
    } catch (e) {
        return 0; // fail-open: no clamp on error
    }
}

// Phase 86.3 D-01/D-02: install the scroll-clamp listener on .gantt-pane.
// Idempotent: removes any existing listener before re-attaching (handles re-runs from setGanttZoom / renderGantt).
function installGanttScrollClamp() {
    const pane = document.querySelector('.gantt-pane');
    if (!pane) return;
    // Remove previous listener if present (idempotent re-installation)
    if (_ganttScrollClampHandler && _ganttScrollClampPane) {
        try { _ganttScrollClampPane.removeEventListener('scroll', _ganttScrollClampHandler); } catch (e) { /* swallow */ }
    }
    // Phase 86.3 D-11: compute floorX ONCE at install time (cached in closure).
    // Re-installed on snapshot (renderGantt step 8) and view-mode change (setGanttZoom),
    // so the cached value stays current without per-scroll O(n) recomputation.
    const floorX = computeGanttFloorX();
    _ganttScrollClampHandler = function() {
        if (pane.scrollLeft < floorX) {
            pane.scrollLeft = floorX;
        }
    };
    _ganttScrollClampPane = pane;
    pane.addEventListener('scroll', _ganttScrollClampHandler);
}

// Phase 86.4 D-SCROLL: constrain .gantt-container to a bounded height so it can scroll vertically.
// Without this Frappe auto-sizes the container to the full SVG height — no overflow, no scroll events.
// No marginTop: the custom overlay (z-index:20) already covers Frappe's blank SVG header visually.
// Called after every renderGantt() / setGanttZoom() so height stays correct across re-renders.
function fixGanttContainerScroll() {
    const pane = document.querySelector('.gantt-pane');
    const ganttPane = document.getElementById('ganttPane');
    if (!pane || !ganttPane || !gantt) return;
    const container = ganttPane.querySelector('.gantt-container');
    if (!container) return;
    const paneH = pane.clientHeight;
    if (paneH <= 0) return;
    const paddingV = 16; // #ganttPane padding-top(8) + padding-bottom(8)
    container.style.marginTop = '0px';
    container.style.height = Math.max(paneH - paddingV, 100) + 'px';
    container.style.overflowY = 'auto';
    container.style.overflowAnchor = 'none';
    // Phase 86.6 Plan 03: equalize rail/container maxScrollTop via a spacer element.
    // paddingBottom failed: content-box increases both scrollHeight and clientHeight equally,
    // leaving maxScrollTop unchanged. A block spacer adds only to scrollHeight (clientHeight
    // is fixed by style.height), so maxScrollTop grows by exactly the spacer height.
    const rail = document.getElementById('taskGridRail');
    if (!rail) return;
    let spacer = container.querySelector('.gantt-scroll-spacer');
    if (!spacer) {
        spacer = document.createElement('div');
        spacer.className = 'gantt-scroll-spacer';
        spacer.style.height = '0px';
        container.appendChild(spacer);
    } else {
        spacer.style.height = '0px'; // reset before measuring
    }
    const railMax = rail.scrollHeight - rail.clientHeight;
    const containerMax = container.scrollHeight - container.clientHeight;
    const diff = railMax - containerMax;
    if (diff > 0) spacer.style.height = diff + 'px';
}

// Phase 86.4 D-SCROLL: synchronized vertical scroll.
// Rail and .gantt-container share scrollTop directly — no offset needed because:
//   • rail thead height (85px) matches Frappe SVG header height (85px)
//   • the custom overlay (z-index:20) covers the Frappe SVG header so bars are visible at y=0
// _syncingScroll prevents infinite echo loops.
// Idempotent: removes previous listeners before re-attaching.
function bindScrollSync() {
    const rail = document.getElementById('taskGridRail');
    const ganttEl = document.querySelector('#ganttPane .gantt-container');
    if (!rail || !ganttEl) return;

    if (_syncScrollRailHandler && rail) {
        try { rail.removeEventListener('scroll', _syncScrollRailHandler); } catch (e) { /* swallow */ }
    }
    if (_syncScrollPaneHandler && _syncScrollGanttEl) {
        try { _syncScrollGanttEl.removeEventListener('scroll', _syncScrollPaneHandler); } catch (e) { /* swallow */ }
    }
    _syncScrollGanttEl = ganttEl;

    _syncScrollRailHandler = function() {
        if (_syncingScroll) return;
        _syncingScroll = true;
        ganttEl.scrollTop = rail.scrollTop;
        requestAnimationFrame(() => { _syncingScroll = false; });
    };

    _syncScrollPaneHandler = function() {
        if (_syncingScroll) return;
        _syncingScroll = true;
        rail.scrollTop = ganttEl.scrollTop;
        requestAnimationFrame(() => { _syncingScroll = false; });
    };

    rail.addEventListener('scroll', _syncScrollRailHandler);
    ganttEl.addEventListener('scroll', _syncScrollPaneHandler);
}

// Phase 86.4 D-03 Option B: custom header overlay — stable div appended to #ganttPane,
// positioned absolutely over Frappe's header area. Never touches Frappe's .lower-header DOM.
// Frappe's .grid-header (and child .upper-header/.lower-header) are hidden; our overlay is the sole header.
// Horizontal scroll: .gho-inner translateX mirrors .gantt-container.scrollLeft via _overlayScrollHandler.
function renderCustomGanttHeader() {
    const mountEl = document.getElementById('ganttPane');
    if (!mountEl || !gantt) return;
    try {
        const mode = gantt.options.view_mode || 'Week';
        // Phase 86.7 header-parity fix: overlay height = gantt.config.header_height (which we force to 94 via lower_header_height:39).
        // Previously this formula added padding/2 (=9), producing a 103px overlay vs 94px left thead — visible ~9px header mismatch.
        // The padding/2 zone is the bar-slot top padding INSIDE the body area (where Frappe paints row stripe 0); not part of the header.
        // Both panes now share identical 94px header bands. See .planning/debug/gantt-row-vertical-misalign.md.
        const headerHeight = gantt.config.header_height || 94;
        const colWidth = gantt.config.column_width || (mode === 'Day' ? 45 : mode === 'Week' ? 140 : 120);
        const startDate = new Date(gantt.gantt_start); startDate.setHours(0, 0, 0, 0);
        const endDate   = new Date(gantt.gantt_end);   endDate.setHours(0, 0, 0, 0);

        let overlay = document.getElementById('ganttHeaderOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'ganttHeaderOverlay';
            mountEl.appendChild(overlay);
        }
        overlay.style.height = headerHeight + 'px';
        overlay.dataset.weekOffset = 0; // reset; overridden in Week branch

        // Hide Frappe's native .grid-header completely (and its child .upper-header/.lower-header layers) so our overlay is the sole header. Frappe's .grid-header is position:sticky inside .gantt-container — display:none removes it from rendering without affecting bar SVG y coords (compute_y is config-driven).
        mountEl.querySelectorAll('.grid-header, .upper-header, .lower-header').forEach(el => { el.style.display = 'none'; });

        const DAY_ABBR = ['S', 'M', 'T', 'W', 'Th', 'F', 'S']; // indexed by getDay() (0=Sun)
        let html = '', totalWidth = 0;

        if (mode === 'Day') {
            const totalDays = Math.round((endDate - startDate) / 86400000);
            for (let i = 0; i < totalDays; i++) {
                const d = new Date(startDate); d.setDate(d.getDate() + i);
                const dow = d.getDay(), isWknd = dow === 0 || dow === 6;
                html += `<div class="gho-day-cell${isWknd ? ' gho-wknd' : ''}" style="width:${colWidth}px">` +
                        `<span class="gho-num">${d.getDate()}</span><span class="gho-ltr">${DAY_ABBR[dow]}</span></div>`;
            }
            totalWidth = totalDays * colWidth;

        } else if (mode === 'Week') {
            const xPerDay = colWidth / 7;
            const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // compact sub-row
            // Snap to the preceding Monday so cell borders fall on Mon regardless of gantt_start's weekday.
            // weekOffsetPx is how far left the first Monday cell starts relative to gantt_start (x=0).
            // _bindOverlayScrollSync subtracts this offset so Mon cells align with Frappe's day columns.
            const dow0 = startDate.getDay(); // 0=Sun … 6=Sat
            const daysBack = dow0 === 0 ? 6 : dow0 - 1; // Mon→0, Tue→1, …, Sun→6
            const weekOffsetPx = Math.round(daysBack * xPerDay);
            overlay.dataset.weekOffset = weekOffsetPx;
            let cur = new Date(startDate);
            cur.setDate(cur.getDate() - daysBack); // rewind to Monday
            while (cur < endDate) {
                const ws = new Date(cur);
                const lbl = `${ws.getDate()} ${ws.toLocaleDateString('en-GB', { month: 'short' })} ${String(ws.getFullYear()).slice(2)}`;
                let subs = '';
                for (let j = 0; j < 7; j++) {
                    const sd = new Date(ws); sd.setDate(sd.getDate() + j);
                    const wk = sd.getDay() === 0 || sd.getDay() === 6;
                    subs += `<div class="gho-sub${wk ? ' gho-wknd' : ''}" style="width:${xPerDay}px">${DAY_LETTERS[sd.getDay()]}</div>`;
                }
                html += `<div class="gho-week-cell" style="width:${colWidth}px">` +
                        `<div class="gho-wk-lbl">${lbl}</div><div class="gho-wk-days">${subs}</div></div>`;
                cur.setDate(cur.getDate() + 7);
                totalWidth += colWidth;
            }

        } else { // Month
            let cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            const endMo = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
            while (cur <= endMo) {
                const lbl = cur.toLocaleDateString('en-GB', { month: 'short' }) + ' ' + cur.getFullYear();
                html += `<div class="gho-month-cell" style="width:${colWidth}px"><span class="gho-mon-lbl">${lbl}</span></div>`;
                cur.setMonth(cur.getMonth() + 1);
                totalWidth += colWidth;
            }
        }

        overlay.innerHTML = `<div class="gho-inner" style="width:${totalWidth}px">${html}</div>`;
        _bindOverlayScrollSync();
    } catch (e) {
        console.warn('[ProjectPlan] Custom header render failed:', e);
    }
}

function _bindOverlayScrollSync() {
    const ganttEl = document.querySelector('#ganttPane .gantt-container');
    const overlay = document.getElementById('ganttHeaderOverlay');
    if (!ganttEl || !overlay) return;
    if (_overlayScrollHandler) ganttEl.removeEventListener('scroll', _overlayScrollHandler);
    const inner = overlay.querySelector('.gho-inner');
    if (!inner) return;
    // weekOffset shifts the inner left so Monday-snapped cells align with Frappe's day columns.
    // Zero for Day/Month modes (dataset.weekOffset reset to 0 in those branches).
    const weekOffset = parseFloat(overlay.dataset.weekOffset) || 0;
    _overlayScrollHandler = () => { inner.style.transform = `translateX(${-(weekOffset + ganttEl.scrollLeft)}px)`; };
    ganttEl.addEventListener('scroll', _overlayScrollHandler);
    inner.style.transform = `translateX(${-(weekOffset + ganttEl.scrollLeft)}px)`;
}

// ---- Gantt drag-to-link SVG overlay (Phase 86.1 Plan 04) ----
// Adds a blue circle handle at the right edge of each non-parent Gantt bar on hover.
// Dragging from that handle draws a rubber-band SVG line; releasing over another bar
// creates a Finish-to-Start dependency with cycle detection (reuses detectDependencyCycle).
// Sentinel attributes (data-linkBound) prevent duplicate listener binding across snapshot re-fires.

function initGanttDragLink() {
    const svg = document.querySelector('#ganttPane svg');
    if (!svg) return;

    // Bug1 fix: CSS `height` on SVG <rect> does not reliably override the SVG `height` presentation
    // attribute across browsers — bar rendered at full 24px with dark fill looked like a phantom line.
    // Force the 4px strip geometry via SVG attributes unconditionally on every renderGantt() call.
    svg.querySelectorAll('.bar-wrapper.parent-summary-bar').forEach(barWrapper => {
        const bar = barWrapper.querySelector('.bar');
        if (!bar) return;
        const origH = parseFloat(bar.getAttribute('height') || '24');
        const origY = parseFloat(bar.getAttribute('y') || '0');
        const targetH = 4;
        bar.setAttribute('height', String(targetH));
        bar.setAttribute('y', String(origY + (origH - targetH) / 2));
        barWrapper.querySelector('.bar-progress')?.setAttribute('display', 'none');
        barWrapper.querySelector('.handle.left')?.setAttribute('display', 'none');
        barWrapper.querySelector('.handle.right')?.setAttribute('display', 'none');
        barWrapper.querySelector('.handle.progress')?.setAttribute('display', 'none');
    });

    // Bind per-bar-wrapper handlers (mouseenter / mouseleave / mousedown)
    svg.querySelectorAll('.bar-wrapper').forEach(barWrapper => {
        // Sentinel: skip if already bound (Frappe gantt.refresh() keeps same DOM elements)
        if (barWrapper.dataset.linkBound === '1') return;
        barWrapper.dataset.linkBound = '1';

        const bar = barWrapper.querySelector('.bar');
        if (!bar) return;

        // Frappe applies custom_class to the inner .bar, not to .bar-wrapper.
        // Propagate it here so CSS rules targeting .bar-wrapper.parent-summary-bar
        // (which hide .handle.left/.right/.progress) actually match and suppress
        // the phantom resize/progress handles on parent bars.
        if (bar.classList.contains('parent-summary-bar')) {
            barWrapper.classList.add('parent-summary-bar');
        }

        barWrapper.addEventListener('mouseenter', () => {
            // D-07 parent lock — never show a handle on parent summary bars.
            // Bug1 fix (86.7): Frappe applies custom_class to the inner .bar element, not
            // Frappe v1.2.2 applies custom_class to barWrapper <g> directly, so checking
            // barWrapper.classList is the correct and reliable guard for parent bars.
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
            if (!toWrapper || toWrapper.dataset.id === fromTaskId) {
                // self-bar drop routes to resize (Plan 86.5-06): leftward drag almost always lands
                // on the source bar's own wrapper, not empty space — both should resize, not self-link.
                // Dropped on empty space — extend (rightward) or reduce (leftward) duration
                if (!gantt || typeof gantt.config !== 'object') return;
                const fromTask = tasks.find(x => x.task_id === fromTaskId);
                if (!fromTask || !fromTask.start_date || !fromTask.end_date) return;
                const fromWrapper2 = svg.querySelector(`.bar-wrapper[data-id="${CSS.escape(fromTaskId)}"]`);
                const fromBar2 = fromWrapper2?.querySelector('.bar');
                if (!fromBar2) return;
                const barRect2 = fromBar2.getBBox();
                const barRightX = barRect2.x + barRect2.width;
                const pt2 = svg.createSVGPoint();
                pt2.x = e.clientX;
                pt2.y = e.clientY;
                const svgPt2 = pt2.matrixTransform(svg.getScreenCTM().inverse());
                const xPerDay2 = ganttXPerDay();
                const daysDelta = Math.round((svgPt2.x - barRightX) / xPerDay2);
                if (daysDelta === 0) return; // no meaningful change
                let newEndDate = addDays(fromTask.end_date, daysDelta);
                // Clamp: end_date must not be earlier than start_date (1-day minimum duration, end == start)
                if (newEndDate < fromTask.start_date) newEndDate = fromTask.start_date;
                if (newEndDate === fromTask.end_date) return; // clamp produced no change
                try {
                    await updateDoc(doc(db, 'project_tasks', fromTaskId), { end_date: newEndDate, updated_at: serverTimestamp() });
                    const idx2 = tasks.findIndex(x => x.task_id === fromTaskId);
                    if (idx2 >= 0) tasks[idx2] = { ...tasks[idx2], end_date: newEndDate };
                    if (fromTask.parent_task_id) await recomputeParentDates(fromTask.parent_task_id);
                } catch (err) {
                    console.error('[ProjectPlan] bar resize failed:', err);
                    showToast('Could not adjust task duration.', 'error');
                }
                return;
            }
            const toTaskId = toWrapper.dataset.id;
            if (!toTaskId) return; // wrapper without id — reject silently

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
                _suppressFsViolationToast = true;
                await updateDoc(doc(db, 'project_tasks', toTaskId), {
                    dependencies: newDeps,
                    updated_at: serverTimestamp()
                });
                // Phase 86.4 D-FS: auto-shift successor if it starts before predecessor ends
                await applyFsAutoSchedule(toTaskId, fromTaskId);
            } catch (err) {
                console.error('[ProjectPlan] drag-to-link write failed:', err);
                showToast('Could not save dependency link.', 'error');
            } finally {
                _suppressFsViolationToast = false;
            }
        });
    }

    // Document-level mouseup: cancel drag-to-link if mouse released outside the SVG
    if (_ganttLinkDocMouseupHandler) document.removeEventListener('mouseup', _ganttLinkDocMouseupHandler);
    _ganttLinkDocMouseupHandler = function(e) {
        if (!ganttDragState) return;
        if (!svg.contains(e.target)) {
            ganttDragState.svgLine.remove();
            ganttDragState = null;
        }
    };
    document.addEventListener('mouseup', _ganttLinkDocMouseupHandler);
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
    if (fingerprint && fingerprint !== __lastViolationFingerprint && !_suppressFsViolationToast) {
        // Only toast new violations introduced since the last snapshot.
        // While _suppressFsViolationToast is true (drag-link write window),
        // update the fingerprint baseline silently so the post-window check is accurate.
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

// ---- Phase 86.4 D-FS: FS auto-scheduling ----

// Phase 86.4 D-FS: FS auto-scheduling.
// When a predecessor link is created, shift successor start to predecessorEnd + 1d
// if successor.start_date <= predecessor.end_date (would violate FS constraint).
// Only shifts the DIRECT successor — no cascade (A→B→C: B shifts, C does not auto-shift).
// No-op if successor already starts after predecessor ends.
async function applyFsAutoSchedule(successorId, predecessorId) {
    const successor = tasks.find(t => t.task_id === successorId);
    const predecessor = tasks.find(t => t.task_id === predecessorId);
    if (!successor || !predecessor) return;
    if (!predecessor.end_date || !successor.start_date) return;

    // No-op if already scheduled correctly (successor starts after predecessor ends)
    if (successor.start_date > predecessor.end_date) return;

    // Compute new start = predecessorEnd + 1 day
    const newStart = addDays(predecessor.end_date, 1);

    // Preserve duration: compute current duration in days (end - start + 1), then recompute end
    const curStartD = new Date(successor.start_date + 'T00:00:00');
    const curEndD = new Date((successor.end_date || successor.start_date) + 'T00:00:00');
    const durationDays = Math.max(1, Math.round((curEndD - curStartD) / 86400000) + 1);
    const newEnd = addDays(newStart, durationDays - 1); // inclusive: 1d → same day

    try {
        await updateDoc(doc(db, 'project_tasks', successorId), {
            start_date: newStart,
            end_date: newEnd,
            updated_at: serverTimestamp()
        });
        // Patch local tasks[] immediately so recomputeParentDates sees the updated values
        const idx = tasks.findIndex(t => t.task_id === successorId);
        if (idx >= 0) tasks[idx] = { ...tasks[idx], start_date: newStart, end_date: newEnd };
        // Propagate to parent if the successor is a child task
        if (successor.parent_task_id) {
            await recomputeParentDates(successor.parent_task_id);
        }
    } catch (err) {
        // Non-fatal: FS auto-scheduling is a convenience feature, not a data-integrity gate.
        // If the write fails (e.g., permission-denied), the dependency is still saved; the user
        // sees the FS-violation toast from checkAndToastFsViolations instead.
        console.warn('[ProjectPlan] FS auto-schedule shift failed:', err);
    }
}

// ---- PDF Export (Plan 02 Task 1) ----

function exportGanttPDF() {
    document.getElementById('gantt-print-frame')?.remove();
    const dateStr = new Date().toLocaleString();
    const projectName = currentProject?.project_name || projectCode || 'Project';

    // Build task summary table rows in tree display order (depth-first, matches live grid)
    const tableRows = flattenTreeDepthFirst(tasks).map(t => {
        const name = escapeHTML(t.name || '(unnamed)');
        const progress = t.progress ?? 0;
        const start = t.start_date || '—';
        const end = t.end_date || '—';
        const status = progress >= 100 ? 'Complete' : progress > 0 ? 'In Progress' : 'Not Started';
        let depth = 0, cur = t;
        while (cur.parent_task_id) {
            depth++;
            cur = tasks.find(x => x.task_id === cur.parent_task_id) || {};
            if (!cur.task_id) break;
        }
        const indent = depth > 0 ? `style="padding-left:${depth * 16}px;"` : '';
        return `<tr>
            <td ${indent}>${name}</td>
            <td>${progress}%</td>
            <td>${start}</td>
            <td>${end}</td>
            <td>${status}</td>
        </tr>`;
    }).join('');

    // Capture Gantt viewport snapshot
    const ganttEl = document.getElementById('ganttPane');
    const ganttHtml = ganttEl ? ganttEl.innerHTML : '<p>(No Gantt chart visible)</p>';

    const frame = document.createElement('div');
    frame.id = 'gantt-print-frame';
    frame.innerHTML = `
        <div class="pdf-header">
            <h2>${escapeHTML(projectName)} — Project Plan</h2>
            <p>Exported: ${dateStr}</p>
        </div>
        <div class="pdf-gantt-section">
            <h3>Gantt Chart</h3>
            <div class="gantt-print-snapshot" style="pointer-events:none">${ganttHtml}</div>
        </div>
        <div class="pdf-table-section">
            <h3>Task Completion Summary</h3>
            <table class="pdf-summary-table">
                <thead>
                    <tr>
                        <th>Task Name</th>
                        <th>Progress</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </div>
    `;
    document.body.appendChild(frame);
    // Crop leading empty space: shift both the gantt container and header to start just before the first bar
    const allBars = [...frame.querySelectorAll('.bar-wrapper .bar')];
    const minBarX = allBars.length ? Math.min(...allBars.map(r => parseFloat(r.getAttribute('x') || '0'))) : 0;
    const printColWidth = gantt?.config?.column_width || 140;
    const cropX = Math.max(0, minBarX - printColWidth); // one column of breathing room before first bar
    const clonedContainer = frame.querySelector('.gantt-container');
    if (clonedContainer) clonedContainer.style.marginLeft = `-${cropX}px`;
    const weekOffset = parseFloat(frame.querySelector('#ganttHeaderOverlay')?.dataset?.weekOffset || '0');
    const ghoInner = frame.querySelector('.gho-inner');
    if (ghoInner) ghoInner.style.transform = `translateX(${-(weekOffset + cropX)}px)`;

    showToast('Opening print dialog — choose "Save as PDF" to download.', 'info');
    window.print();

    // Remove the #gantt-print-frame after print dialog opens (800ms gives dialog time to render)
    setTimeout(() => { frame.remove(); }, 800);
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

// ---- Phase 86.11 Plan 02 — milestone toggle ----

async function gridToggleMilestone(taskId) {
    const t = tasks.find(x => x.task_id === taskId);
    if (!t) return;
    const newVal = !t.is_milestone;
    try {
        await updateDoc(doc(db, 'project_tasks', taskId), {
            is_milestone: newVal,
            updated_at: serverTimestamp()
        });
        // Optimistic local patch — onSnapshot will confirm/correct
        const i = tasks.findIndex(x => x.task_id === taskId);
        if (i >= 0) tasks[i] = { ...tasks[i], is_milestone: newVal };
    } catch (err) {
        console.error('[ProjectPlan] gridToggleMilestone failed:', err);
        showToast(err?.code === 'permission-denied'
            ? `You don't have permission to change milestone status on this project.`
            : 'Could not update milestone. Please try again.', 'error');
    }
}
