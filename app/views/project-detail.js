/* ========================================
   PROJECT DETAIL VIEW
   Full-page project detail with inline editing
   ======================================== */

import { db, collection, doc, getDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, writeBatch, getAggregateFromServer, sum, count, addDoc, serverTimestamp, orderBy, limit } from '../firebase.js';
import { formatCurrency, formatDate, showLoading, showToast, normalizePersonnel, syncPersonnelToAssignments, downloadCSV, escapeHTML, generateProjectCode, getRFPFees } from '../utils.js';
import { showExpenseBreakdownModal } from '../expense-modal.js';
import { recordEditHistory, showEditHistoryModal } from '../edit-history.js';
import { createNotificationForUsers, createNotificationForRoles, NOTIFICATION_TYPES } from '../notifications.js';
// Phase 87.1 D-05 — inline proposal card
import { _applyProposalStateTransition } from './proposals.js';
import { openProposalModal, openCreateProposalModal } from '../proposal-modal.js';

let currentProject = null;
let projectCode = null;
let listener = null;
let usersData = [];
let usersListenerUnsub = null;
let currentExpense = { total: 0, poCount: 0, trCount: 0, totalPaid: 0, remainingPayable: 0, hasRfps: false };
// Phase 85 D-06: collectibles aggregation alongside currentExpense
let currentCollectibles = { totalRequested: 0, totalCollected: 0, remainingCollectible: 0 };
let detailSelectedPersonnel = []; // Array of { id: string, name: string } for pill state
let personnelClickOutsideHandler = null;
// Phase 78 D-04: clients cache for the issuance client-select control (lazy-loaded when needed)
let clientsCacheForIssuance = [];
let clientsCacheLoaded = false;

// Phase 99 — billing requests for THIS project (own-requests status list)
let currentBillingRequests = [];
let billingRequestsListenerUnsub = null;
// Phase 99 — billing-request modal selected type (auto-hinted, overrideable)
let billingSelectedType = 'progress';
// Phase 99.1 D-12 — raw collectible docs (per-tranche, with payment_records) for lifecycle
// derivation. Distinct name from currentCollectibles (:22), which is the AGGREGATE object.
let currentCollectibleDocs = [];
let collectiblesListenerUnsub = null;

// Phase 86 — Project Plan summary card
let currentTasks = [];
let currentTasksListenerUnsub = null;
let currentProjectProgress = { taskCount: 0, leafCount: 0, doneCount: 0, percentComplete: 0, health: 'on-track', overdueCount: 0, overdueMore: 0, overdueTasks: [], upcomingTasks: [], recentDone: null };
let currentIterationLabel = null;

// Phase 101 — Project Journal subcollection listeners + local data caches
let journalActivityUnsub = null;
let journalProgressUnsub = null;
let journalIssuesUnsub = null;
let journalActivityEntries = [];
let journalProgressUpdates = [];
let journalIssues = [];
let _activeJournalTab = 'activity'; // default tab (Claude's Discretion — Activity Feed most active)
let journalIssueFilter = 'all'; // Plan 04 filter state; declared here so destroy() resets in one place

const UNIFIED_STATUS_OPTIONS = [
    'For Inspection',
    'For Proposal',
    'Proposal for Internal Approval',
    'Proposal Under Client Review',
    'For Revision',
    'Client Approved',
    'For Mobilization',
    'On-going',
    'Completed',
    'Loss'
];

// Phase 100 — Lifecycle accordion state
let _lcOpen = false;
// Suppress full re-render when an attach action triggered the snapshot
let _lcAttachPending = false;

// Phase 100 — 8-stage lifecycle definition (D-02)
const LC_STAGES = [
    { status: 'For Inspection',                 emoji: '🔍', label: 'For\nInspection',    gated: true  },
    { status: 'For Proposal',                   emoji: '📋', label: 'For\nProposal',      gated: false },
    { status: 'Proposal for Internal Approval', emoji: '🏢', label: 'Internal\nApproval', gated: false },
    { status: 'Proposal Under Client Review',   emoji: '👤', label: 'Client\nReview',     gated: false },
    { status: 'Client Approved',                emoji: '🎉', label: 'Client\nApproved',   gated: true  },
    { status: 'For Mobilization',               emoji: '🚚', label: 'For\nMobilization',  gated: true  },
    { status: 'On-going',                       emoji: '⚙️', label: 'On-going',           gated: true  },
    { status: 'Completed',                      emoji: '🏁', label: 'Completed',          gated: false },
];

function _getProjectStatusColor(status) {
    const map = {
        'For Inspection':                 '#64748b',
        'For Proposal':                   '#1a73e8',
        'Proposal for Internal Approval': '#f59e0b',
        'Proposal Under Client Review':   '#f59e0b',
        'For Revision':                   '#ef4444',
        'Client Approved':                '#059669',
        'For Mobilization':               '#0ea5e9',
        'On-going':                       '#0ea5e9',
        'Completed':                      '#16a34a',
        'Loss':                           '#7f1d1d',
    };
    return map[status] || '#64748b';
}

// Render view HTML
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

// Initialize view
export async function init(activeTab = null, param = null) {
    projectCode = param;
    attachWindowFunctions();

    // Click-outside handler to close personnel dropdown
    personnelClickOutsideHandler = (e) => {
        const container = document.getElementById('detailPillContainer');
        const dropdown = document.getElementById('detailPersonnelDropdown');
        if (dropdown && container && !container.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    };
    document.addEventListener('mousedown', personnelClickOutsideHandler);

    // Listen for permission changes and re-render
    // If a previous init left a handler attached (e.g., destroy() was skipped on a tab swap),
    // detach it before adding the new one so we don't leak listeners across re-inits.
    if (window._projectDetailPermissionHandler) {
        window.removeEventListener('permissionsChanged', window._projectDetailPermissionHandler);
    }
    const permissionChangeHandler = () => {
        renderProjectDetail();
    };
    window.addEventListener('permissionsChanged', permissionChangeHandler);
    window._projectDetailPermissionHandler = permissionChangeHandler;

    // Phase 7: Re-check access when assignments change
    if (window._projectDetailAssignmentHandler) {
        window.removeEventListener('assignmentsChanged', window._projectDetailAssignmentHandler);
    }
    const assignmentChangeHandler = () => {
        if (currentProject) {
            checkProjectAccess(); // Will render access denied if project no longer assigned
        }
    };
    window.addEventListener('assignmentsChanged', assignmentChangeHandler);
    window._projectDetailAssignmentHandler = assignmentChangeHandler;

    if (!projectCode) {
        document.getElementById('projectDetailContainer').innerHTML = `
            <div class="container" style="margin-top: 2rem;">
                <div class="card">
                    <div class="card-body">
                        <p>No project specified.</p>
                        <a href="#/projects" class="btn btn-primary">Back to Projects</a>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    // Load active users for personnel datalist
    const usersQuery = query(collection(db, 'users'), where('status', '==', 'active'));
    usersListenerUnsub = onSnapshot(usersQuery, (snapshot) => {
        usersData = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            usersData.push({
                id: doc.id,
                full_name: data.full_name || '',
                email: data.email || ''
            });
        });
        usersData.sort((a, b) => a.full_name.localeCompare(b.full_name));
    });

    // Phase 78 D-06: Try project_code lookup first (existing behavior). If no match, fall back to Firestore doc ID lookup
    // for clientless projects whose URL param is the doc ID rather than a project_code.
    const q = query(collection(db, 'projects'), where('project_code', '==', projectCode));
    listener = onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) {
            // Phase 78 D-06: fallback — projectCode might actually be a Firestore doc ID for a clientless project
            try {
                const docRef = doc(db, 'projects', projectCode);
                const docSnap2 = await getDoc(docRef);
                if (docSnap2.exists()) {
                    // Tear down the project_code listener and rebind a per-doc listener for live updates
                    if (typeof listener === 'function') listener();
                    listener = onSnapshot(docRef, async (snap) => {
                        if (!snap.exists()) {
                            document.getElementById('projectDetailContainer').innerHTML = `
                                <div class="container" style="margin-top: 2rem;">
                                    <div class="card">
                                        <div class="card-body">
                                            <p>Project not found.</p>
                                            <a href="#/projects" class="btn btn-primary">Back to Projects</a>
                                        </div>
                                    </div>
                                </div>
                            `;
                            return;
                        }
                        currentProject = { id: snap.id, ...snap.data() };
                        await refreshExpense(true);
                        // Phase 78 D-04: load clients once when the user views a clientless project
                        if (!currentProject.client_code) {
                            await loadClientsCache();
                        }
                        // Phase 86 — Project Plan summary listener (idempotent attach)
                        ensureTasksListener();
                        // Phase 99 — own billing-requests listener (idempotent, scoped to project_code)
                        ensureBillingRequestsListener();
                        // Phase 99.1 — raw collectibles listener (idempotent, scoped to project_code)
                        ensureCollectiblesListener();
                        // Phase 101 — journal listeners (only when panel is visible)
                        if (['For Mobilization', 'On-going', 'Completed'].includes(currentProject?.project_status)) {
                            ensureJournalListeners();
                        }
                        await ensureIterationLabel();
                        if (checkProjectAccess()) {
                            if (_lcAttachPending) {
                                _lcAttachPending = false;
                                buildLifecycleBodyInPlace(currentProject, window.getCurrentUser?.() || null);
                                updateLifecycleBadge(currentProject);
                            } else {
                                renderProjectDetail();
                            }
                        }
                    });
                    return;
                }
            } catch (err) {
                console.error('[ProjectDetail] Doc-ID fallback lookup failed:', err);
            }
            document.getElementById('projectDetailContainer').innerHTML = `
                <div class="container" style="margin-top: 2rem;">
                    <div class="card">
                        <div class="card-body">
                            <p>Project not found.</p>
                            <a href="#/projects" class="btn btn-primary">Back to Projects</a>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        const docSnap = snapshot.docs[0];
        currentProject = { id: docSnap.id, ...docSnap.data() };

        // Calculate initial expense (silent — no toast on page load)
        await refreshExpense(true);

        // Phase 78 D-04: load clients once when the user views a clientless project (rare for the project_code-found branch but possible if a user navigates to #/projects/detail/{code} where code is empty — defensive)
        if (!currentProject.client_code) {
            await loadClientsCache();
        }

        // Phase 86 — Project Plan summary listener (idempotent attach once currentProject.id is known)
        ensureTasksListener();
        // Phase 99 — own billing-requests listener (idempotent, scoped to project_code)
        ensureBillingRequestsListener();
        // Phase 99.1 — raw collectibles listener (idempotent, scoped to project_code)
        ensureCollectiblesListener();
        // Phase 101 — journal listeners (only when panel is visible)
        if (['For Mobilization', 'On-going', 'Completed'].includes(currentProject?.project_status)) {
            ensureJournalListeners();
        }
        await ensureIterationLabel();

        // Phase 7: Check project assignment access for operations_user
        if (checkProjectAccess()) {
            if (_lcAttachPending) {
                _lcAttachPending = false;
                buildLifecycleBodyInPlace(currentProject, window.getCurrentUser?.() || null);
                updateLifecycleBadge(currentProject);
            } else {
                renderProjectDetail();
            }
        }
        // If checkProjectAccess() returns false, it already rendered the access denied message
    });
}

// Phase 86 — idempotent attach of project_tasks listener. Re-renders the plan card in-place.
function ensureTasksListener() {
    if (currentTasksListenerUnsub) return;
    if (!currentProject || !currentProject.id) return;
    currentTasksListenerUnsub = onSnapshot(
        query(collection(db, 'project_tasks'), where('project_id', '==', currentProject.id)),
        (snap) => {
            currentTasks = [];
            snap.forEach(d => currentTasks.push({ id: d.id, ...d.data() }));
            currentProjectProgress = computeProjectProgress(currentTasks);
            const cardEl = document.getElementById('projectPlanCard');
            if (cardEl) {
                const tmp = document.createElement('div');
                tmp.innerHTML = buildPlanCardHtml();
                cardEl.replaceWith(tmp.firstElementChild);
            }
        }
    );
}

// Phase 99 — idempotent attach of the own billing-requests listener (D-15 status list).
// Scoped to currentProject.project_code (the field Task 3's submit writes — NOT the URL
// `projectCode` param, which can be a Firestore doc id for clientless projects, Phase 78 D-06).
// Mirrors ensureTasksListener(): runs once per mount, re-renders the detail on change.
function ensureBillingRequestsListener() {
    if (billingRequestsListenerUnsub) return;
    const code = currentProject?.project_code;
    if (!code) return; // no project_code → no scoped own-requests list (legacy/clientless edge)
    billingRequestsListenerUnsub = onSnapshot(
        query(collection(db, 'billing_requests'), where('project_code', '==', code)),
        (snap) => {
            currentBillingRequests = [];
            snap.forEach(d => currentBillingRequests.push({ id: d.id, ...d.data() }));
            // re-render so the status list reflects new/changed requests
            if (currentProject) renderProjectDetail();
        },
        (err) => { console.error('[ProjectDetail/BillingReq] snapshot error:', err); }
    );
}

// Phase 99.1 D-12 — idempotent attach of the raw-collectibles listener (per-tranche docs
// with payment_records, for lifecycle-stage derivation). Mirrors ensureBillingRequestsListener():
// scoped to currentProject.project_code (the DOC FIELD, NOT the URL `projectCode` param —
// Phase 78 doc-id fallback), re-renders the detail on change, torn down in destroy().
function ensureCollectiblesListener() {
    if (collectiblesListenerUnsub) return;
    const code = currentProject?.project_code;
    if (!code) return; // no project_code → no scoped collectibles stream (legacy/clientless edge)
    collectiblesListenerUnsub = onSnapshot(
        query(collection(db, 'collectibles'), where('project_code', '==', code)),
        (snap) => {
            currentCollectibleDocs = [];
            snap.forEach(d => currentCollectibleDocs.push({ id: d.id, ...d.data() }));
            // re-render so the lifecycle footer + 2-chip scorecard reflect COLL state
            if (currentProject) renderProjectDetail();
        },
        (err) => { console.error('[ProjectDetail/Collectibles] snapshot error:', err); }
    );
}

// Fetch and cache the label of the currently-loaded named iteration (023b).
// Called each time the project snapshot fires so the card stays in sync when the
// user switches iterations in the plan page and navigates back.
async function ensureIterationLabel() {
    const iterationId = currentProject?.last_loaded_iteration_id;
    if (!iterationId) { currentIterationLabel = null; return; }
    try {
        const snap = await getDoc(doc(db, 'project_iterations', iterationId));
        currentIterationLabel = snap.exists() ? (snap.data().label || null) : null;
    } catch { currentIterationLabel = null; }
}

// Cleanup
export async function destroy() {
    // Remove permission change listener
    if (window._projectDetailPermissionHandler) {
        window.removeEventListener('permissionsChanged', window._projectDetailPermissionHandler);
        delete window._projectDetailPermissionHandler;
    }

    // Phase 7: Remove assignment change listener
    if (window._projectDetailAssignmentHandler) {
        window.removeEventListener('assignmentsChanged', window._projectDetailAssignmentHandler);
        delete window._projectDetailAssignmentHandler;
    }

    if (listener) {
        listener();
        listener = null;
    }

    if (usersListenerUnsub) {
        usersListenerUnsub();
        usersListenerUnsub = null;
    }
    usersData = [];

    // Phase 99 — own billing-requests listener teardown
    if (billingRequestsListenerUnsub) { try { billingRequestsListenerUnsub(); } catch (e) { /* swallow */ } }
    billingRequestsListenerUnsub = null;
    currentBillingRequests = [];
    billingSelectedType = 'progress';

    // Phase 99.1 D-12 — raw collectibles listener teardown
    if (collectiblesListenerUnsub) { try { collectiblesListenerUnsub(); } catch (e) { /* swallow */ } }
    collectiblesListenerUnsub = null;
    currentCollectibleDocs = [];

    // Phase 86 — Project Plan summary listener teardown
    if (currentTasksListenerUnsub) { try { currentTasksListenerUnsub(); } catch (e) { /* swallow */ } }
    currentTasksListenerUnsub = null;
    currentTasks = [];
    currentProjectProgress = { taskCount: 0, leafCount: 0, doneCount: 0, percentComplete: 0, health: 'on-track', overdueCount: 0, overdueMore: 0, overdueTasks: [], upcomingTasks: [], recentDone: null };
    currentIterationLabel = null;

    // Phase 101 — journal subcollection listener teardown
    if (journalActivityUnsub) { try { journalActivityUnsub(); } catch (e) { /* swallow */ } }
    journalActivityUnsub = null;
    journalActivityEntries = [];

    if (journalProgressUnsub) { try { journalProgressUnsub(); } catch (e) { /* swallow */ } }
    journalProgressUnsub = null;
    journalProgressUpdates = [];

    if (journalIssuesUnsub) { try { journalIssuesUnsub(); } catch (e) { /* swallow */ } }
    journalIssuesUnsub = null;
    journalIssues = [];
    _activeJournalTab = 'activity';
    journalIssueFilter = 'all';

    // Clean up personnel pill state
    if (personnelClickOutsideHandler) {
        document.removeEventListener('mousedown', personnelClickOutsideHandler);
        personnelClickOutsideHandler = null;
    }
    detailSelectedPersonnel = [];

    currentProject = null;
    projectCode = null;
    currentExpense = { total: 0, poCount: 0, trCount: 0, totalPaid: 0, remainingPayable: 0, hasRfps: false };
    // Phase 85 D-06: reset collectibles state alongside currentExpense
    currentCollectibles = { totalRequested: 0, totalCollected: 0, remainingCollectible: 0 };

    delete window.toggleLifecycleAccordion;
    delete window.lcAttachLink;
    delete window.lcAttachFile;
    delete window.lcRemoveDoc;
    delete window.lcSwitchTab;
    delete window.lcAdvanceToForProposal;
    delete window.lcStartMobilization;
    delete window.lcStartProject;
    delete window.lcMarkProjectComplete;
    _lcOpen = false;
    delete window.saveField;
    delete window.toggleActive;
    delete window.confirmDelete;
    delete window.refreshExpense;
    delete window.openFullBreakdown;
    delete window.selectDetailPersonnel;
    delete window.removeDetailPersonnel;
    delete window.filterDetailPersonnel;
    delete window.showDetailPersonnelDropdown;
    delete window.showEditHistory;
    delete window.exportProjectExpenseCSV;
    delete window.startCodeIssuance;
    delete window.runCodeIssuance;
    // Phase 87.1 D-05 — inline proposal card window functions cleanup
    delete window.openProposalModal;
    delete window.openProposalInlineSubmitModal;
    delete window.closeProposalInlineSubmitModal;
    delete window.confirmProposalInlineSubmit;
    // Phase 87.3 D-01 — Start Proposal window functions cleanup
    delete window.openCreateProposalModal;
    delete window._startProposalCallback;
    // Phase 99 — billing request flow cleanup
    delete window.openBillingRequestModal;
    delete window.submitBillingRequest;
    delete window._onBillingTrancheChange;
    delete window._selectBillingType;
    delete window._validateBillingForm;
    // Phase 101 — journal panel window functions cleanup
    delete window.switchJournalTab;
    delete window.postActivityEntry;
    delete window.submitProgressUpdate;
    delete window.setIssueFilter;
    delete window.submitNewIssue;
    delete window.resolveIssue;
    delete window.reopenIssue;
    document.getElementById('billingRequestModal')?.remove();
    document.getElementById('issueCodeOverlay')?.remove();
    document.getElementById('proposal-inline-submit-modal')?.remove();
}

/**
 * Check if the current user has access to the current project.
 * For operations_user without all_projects, the project must be in assigned_project_codes.
 * Returns true if access is allowed (or if no filtering applies).
 * Returns false and renders an access denied message if access is denied.
 * If the target container is not in the DOM (race condition or navigation), falls back
 * to redirecting to #/projects rather than silently returning false with nothing rendered.
 */
function checkProjectAccess() {
    const assignedCodes = window.getAssignedProjectCodes?.();

    // null means no filtering -- all roles except scoped operations_user
    if (assignedCodes === null) return true;

    // If current project has no project_code (legacy), allow access defensively
    if (!currentProject?.project_code) return true;

    // Check if this project is in the assigned set
    if (assignedCodes.includes(currentProject.project_code)) return true;

    // Access denied -- render message in place (do NOT redirect silently)
    const container = document.getElementById('projectDetailContainer');
    if (container) {
        container.innerHTML = `
            <div class="container" style="margin-top: 2rem;">
                <div class="card">
                    <div class="card-body">
                        <div class="empty-state">
                            <div class="empty-state-icon">🔒</div>
                            <h3>Access Denied</h3>
                            <p>You do not have access to this project.</p>
                            <p style="color: #64748b; font-size: 0.875rem;">This project has been removed from your assigned projects.</p>
                            <a href="#/projects" class="btn btn-primary" style="margin-top: 1rem;">Back to Projects</a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else {
        // Container not in DOM (race condition or mid-navigation) -- navigate back
        // rather than silently returning false with nothing rendered.
        window.location.hash = '#/projects';
    }
    return false;
}

// Render project detail
function renderProjectDetail() {
    const container = document.getElementById('projectDetailContainer');
    if (!container || !currentProject) return;

    // Check edit permission
    const canEdit = window.canEditTab?.('projects');
    const showEditControls = canEdit === true;

    // Personnel editing restricted to super_admin and operations_admin only
    const user = window.getCurrentUser?.();
    const canEditPersonnel = showEditControls && (user?.role === 'super_admin' || user?.role === 'operations_admin');

    const focusedField = document.activeElement?.dataset?.field;

    // Plan visible from 'For Proposal' onwards; hidden for pre-proposal and loss stages
    const PLAN_HIDDEN_STATUSES = new Set(['For Inspection', 'Loss']);
    const showPlanCard = !PLAN_HIDDEN_STATUSES.has(currentProject.project_status);

    // ----- Project Plan summary card (Spike 021A + 022C) -----
    const planCardHtml = buildPlanCardHtml();

    container.innerHTML = `
        <div class="container" style="margin-top: 1rem;">
            ${canEdit === false ? `
                <div class="view-only-notice">
                    <span class="notice-icon">👁</span>
                    <span>You have view-only access to this section.</span>
                </div>
            ` : ''}

            <!-- Header strip: badge · code · status · actions -->
            <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.75rem;">
                <span class="status-badge ${currentProject.active ? 'approved' : 'rejected'}"
                      style="cursor:pointer;font-size:0.8rem;padding:0.35rem 0.75rem;transition:all 0.2s;"
                      onclick="window.toggleActive(${!currentProject.active})">
                    ${currentProject.active ? '✓ Active' : '✗ Inactive'}
                </span>
                <span style="color:#cbd5e1;">·</span>
                <span style="font-family:monospace;font-size:0.82rem;font-weight:700;color:#64748b;">${escapeHTML(currentProject.project_code || '—')}</span>
                <span style="color:#cbd5e1;">·</span>
                <span id="hdrStatusBadge" class="hdr-status" style="background:${_getProjectStatusColor(currentProject.project_status || '')};color:white;padding:0.3rem 0.85rem;border-radius:20px;font-size:0.82rem;font-weight:600;">${escapeHTML(currentProject.project_status || '—')}</span>
                <span style="flex:1;"></span>
                <button class="btn btn-sm btn-secondary" onclick="window.showEditHistory()" style="white-space:nowrap;">Edit History</button>
                <button class="btn btn-sm btn-secondary" onclick="window.exportProjectExpenseCSV()"
                        style="display:flex;align-items:center;gap:0.35rem;${currentExpense.poCount === 0 ? 'opacity:0.45;pointer-events:none;cursor:default;' : ''}"
                        ${currentExpense.poCount === 0 ? 'disabled' : ''}>
                    &#8681; Export CSV
                </button>
            </div>

            ${renderLifecycleCard(currentProject, user)}

            <!-- Main 2-column: Info (left) + Financial (right) -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:0.75rem;">

                <!-- Info card -->
                <div class="card">
                    <div class="card-body" style="padding:0.75rem 1rem;">
                        <div style="font-size:0.7rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.5rem;">Project Information</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem 0.75rem;">
                            <div>
                                <label style="font-size:0.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:0.15rem;">Project Name *</label>
                                <input type="text" class="detail-field" data-field="project_name" value="${escapeHTML(currentProject.project_name || '')}" onblur="window.saveField('project_name', this.value)" placeholder="Enter project name" ${!showEditControls ? 'disabled' : ''}>
                            </div>
                            <div>
                                <label style="font-size:0.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:0.15rem;">Client</label>
                                ${(!currentProject.client_code && showEditControls) ? `
                                    <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;">
                                        <select id="clientAssignSelect" style="flex:1;min-width:120px;padding:0.35rem 0.5rem;border:2px solid #dadce0;border-radius:4px;background:#fff;font-size:0.8rem;">
                                            <option value="">— Select client —</option>
                                            ${clientsCacheForIssuance.map(c => `<option value="${escapeHTML(c.id)}" data-code="${escapeHTML(c.client_code || '')}">${escapeHTML(c.company_name)}</option>`).join('')}
                                        </select>
                                        <button class="btn btn-sm btn-primary" onclick="window.startCodeIssuance()" style="white-space:nowrap;font-size:0.75rem;">Issue Code</button>
                                    </div>
                                    <div style="font-size:0.7rem;color:#64748b;margin-top:0.2rem;">No code yet — assign a client to issue one.</div>
                                ` : `
                                    <div style="color:#64748b;font-size:0.9rem;padding:0.35rem 0;">${escapeHTML(currentProject.client_code || 'N/A')}</div>
                                `}
                            </div>
                            <div style="grid-column:1/-1;">
                                <label style="font-size:0.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:0.15rem;">Location</label>
                                <input type="text" class="detail-field" data-field="location" value="${escapeHTML(currentProject.location || '')}" onblur="window.saveField('location', this.value)" placeholder="(Not set)" ${!showEditControls ? 'disabled' : ''}>
                            </div>
                            <div style="grid-column:1/-1;">
                                ${renderPersonnelPills(canEditPersonnel)}
                            </div>
                        </div>
                        <div style="font-size:0.7rem;color:#94a3b8;margin-top:0.5rem;">Created: ${formatDate(currentProject.created_at)}${currentProject.updated_at ? ' · Updated: ' + formatDate(currentProject.updated_at) : ''}</div>
                    </div>
                </div>

                <!-- Financial card -->
                <div class="card">
                    <div class="card-body" style="padding:0.75rem 1rem;">
                        <!-- Phase 99.1 D-14 — flex header with single Full Breakdown entry button -->
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem;">
                            <div style="font-size:0.7rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Financial Summary</div>
                            <button class="btn btn-sm btn-secondary" onclick="window.openFullBreakdown()" style="font-size:0.7rem;padding:0.2rem 0.6rem;white-space:nowrap;">Full Breakdown →</button>
                        </div>

                        <!-- Budget group -->
                        <div style="font-size:0.65rem;font-weight:700;color:#1a73e8;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:0.35rem;">Budget</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem 0.75rem;margin-bottom:0.4rem;">
                            <div>
                                <label style="font-size:0.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:0.15rem;">Budget</label>
                                <input type="number" class="detail-field" data-field="budget" value="${currentProject.budget || ''}" onblur="window.saveField('budget', this.value)" placeholder="(Not set)" min="0" step="0.01" ${!showEditControls ? 'disabled' : ''}>
                            </div>
                            <div>
                                <label style="font-size:0.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:0.15rem;">Contract Cost</label>
                                <input type="number" class="detail-field" data-field="contract_cost" value="${currentProject.contract_cost || ''}" onblur="window.saveField('contract_cost', this.value)" placeholder="(Not set)" min="0" step="0.01" ${!showEditControls ? 'disabled' : ''}>
                            </div>
                            <div style="background:#f0f7ff;border-radius:5px;padding:0.3rem 0.5rem;">
                                <div style="font-size:0.65rem;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.1rem;">Projected Expense</div>
                                <div style="font-weight:700;color:#1e293b;font-size:0.85rem;">
                                    ${currentExpense.total > 0 ? formatCurrency(currentExpense.total) : '—'}
                                </div>
                            </div>
                            <div style="background:#f0f7ff;border-radius:5px;padding:0.3rem 0.5rem;">
                                <div style="font-size:0.65rem;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.1rem;">Rem. Budget</div>
                                ${(() => {
                                    const budget = parseFloat(currentProject.budget || 0);
                                    const remaining = budget - currentExpense.total;
                                    const color = remaining >= 0 ? '#059669' : '#ef4444';
                                    return budget > 0
                                        ? `<div style="font-weight:700;color:${color};font-size:0.85rem;">${formatCurrency(remaining)}</div>`
                                        : `<div style="font-weight:700;color:#94a3b8;font-size:0.85rem;">—</div>`;
                                })()}
                            </div>
                        </div>

                        <!-- Payables group -->
                        <div style="border-top:1px solid #f1f5f9;margin:0.4rem 0;"></div>
                        <div style="font-size:0.65rem;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:0.35rem;">Payables</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem 0.75rem;margin-bottom:0.4rem;">
                            <div style="background:#fff5f5;border-radius:5px;padding:0.3rem 0.5rem;">
                                <div style="font-size:0.65rem;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.1rem;">Paid</div>
                                <div style="font-weight:700;color:#059669;font-size:0.85rem;">${formatCurrency(currentExpense.totalPaid)}</div>
                            </div>
                            <div style="background:#fff5f5;border-radius:5px;padding:0.3rem 0.5rem;">
                                <div style="font-size:0.65rem;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.1rem;">Rem. Payable</div>
                                <div style="font-weight:700;color:${currentExpense.remainingPayable > 0 ? '#ef4444' : '#059669'};font-size:0.85rem;">${formatCurrency(currentExpense.remainingPayable)}</div>
                            </div>
                        </div>

                        <!-- Collectibles group -->
                        <div style="border-top:1px solid #f1f5f9;margin:0.4rem 0;"></div>
                        <div style="font-size:0.65rem;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:0.35rem;">Collectibles</div>
                        <!-- Phase 99.1 D-10 — 2-chip scorecard (Collected + Outstanding), both sourced
                             from collectible docs (NOT approved billing_requests). Outstanding = Invoiced − Collected. -->
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem 0.75rem;">
                            ${(() => {
                                const docs = Array.isArray(currentCollectibleDocs) ? currentCollectibleDocs : [];
                                const collected = docs.reduce((s, c) => s + (c.payment_records || [])
                                    .filter(r => r.status !== 'voided')
                                    .reduce((ss, r) => ss + (parseFloat(r.amount) || 0), 0), 0);
                                const invoiced = docs.reduce((s, c) => s + (parseFloat(c.amount_requested) || 0), 0);
                                const outstanding = invoiced - collected; // D-04
                                return `
                            <div style="background:#f0fdf4;border-radius:5px;padding:0.3rem 0.5rem;">
                                <div style="font-size:0.65rem;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.1rem;">Collected</div>
                                <div style="font-weight:700;color:#059669;font-size:0.85rem;">${formatCurrency(collected)}</div>
                            </div>
                            <div style="background:#f0fdf4;border-radius:5px;padding:0.3rem 0.5rem;">
                                <div style="font-size:0.65rem;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.1rem;">Outstanding</div>
                                <div style="font-weight:700;color:${outstanding > 0 ? '#ef4444' : '#059669'};font-size:0.85rem;">${formatCurrency(outstanding)}</div>
                            </div>`;
                            })()}
                        </div>
                        <!-- Phase 99 D-15 — Initiate Billing footer link (unconditional; operations_user must reach it) -->
                        <div style="text-align:right;margin-top:0.5rem;">
                            <span onclick="window.openBillingRequestModal()" style="cursor:pointer;color:#1a73e8;font-size:0.72rem;font-weight:700;user-select:none;">↑ Initiate Billing →</span>
                        </div>
                        ${renderTrancheLifecycleRows()}
                    </div>
                </div>
            </div>

            <!-- Bottom row: proposal + plan cards, layout synced by syncBottomRow() -->
            <div id="projectDetailBottomRow" style="margin-bottom:0.75rem;">
                <div id="proposalInlineCard"></div>
                ${showPlanCard ? planCardHtml : ''}
            </div>

            <!-- Phase 101 — Project Journal panel (status-gated: For Mobilization / On-going / Completed) -->
            ${_buildJournalPanelHtml(currentProject)}

            <!-- Delete Button -->
            ${showEditControls ? `
                <div style="text-align:center;margin-top:1.5rem;padding-bottom:1.5rem;">
                    <button class="btn btn-danger" onclick="window.confirmDelete()">Delete Project</button>
                </div>
            ` : ''}
        </div>
    `;

    // Phase 87.3 D-07 — fire-and-forget load of proposal card (unconditional; branching inside loadProposalCard)
    loadProposalCard(currentProject.id, 'projects');

    // Restore focus if field was focused before re-render
    if (focusedField) {
        if (focusedField === 'personnel-pills') {
            const searchInput = document.getElementById('detailPersonnelSearch');
            searchInput?.focus();
        } else {
            const field = document.querySelector(`[data-field="${focusedField}"]`);
            if (field) field.focus();
        }
    }

    // If accordion is open, repopulate the body — renderLifecycleCard leaves #lcBody empty
    if (_lcOpen) buildLifecycleBodyInPlace(currentProject, user);
}

// Phase 99.1 D-07/D-13 — single source of truth for a tranche's lifecycle stage + cash %.
// Cross-references a tranche against its billing_request and collectible doc (matched by
// tranche_index — the in-page D-05 key, project_code already implied by the scoped listeners)
// and derives the stage using the CANONICAL voided-excluded cash formula
// (finance.js:110 === expense-modal.js:24). DO NOT add a divergent denominator/voided rule.
// Returns { stage, badgeLabel, badgeColor, opacity, pct, totalPaid, amountRequested, note }.
// This helper shape is the canonical reference Plan 03 (service-detail.js) mirrors verbatim.
function computeTrancheLifecycle(tranche, idx, billingReqs, collectibleDocs) {
    const br = (Array.isArray(billingReqs) ? billingReqs : []).find(r => r.tranche_index === idx);
    const coll = (Array.isArray(collectibleDocs) ? collectibleDocs : []).find(c => c.tranche_index === idx);
    const amountRequested = coll ? (parseFloat(coll.amount_requested) || 0) : 0;
    // Canonical formula (D-13): non-voided payment_records[].amount over the FROZEN amount_requested.
    const totalPaid = coll
        ? (coll.payment_records || [])
            .filter(r => r.status !== 'voided')
            .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
        : 0;
    const pct = amountRequested > 0 ? Math.round((totalPaid / amountRequested) * 100) : 0;
    const status = br ? br.status : null;

    // Not Filed — no billing request AND no collectible for this tranche (D-08).
    if (!br && !coll) {
        return { stage: 'not-filed', badgeLabel: '— Not Filed', badgeColor: '#94a3b8', opacity: 0.45, pct: 0, totalPaid: 0, amountRequested: 0, note: '' };
    }
    // Pending / Rejected billing requests (no collectible yet in the normal flow).
    if (status === 'pending') {
        return { stage: 'pending', badgeLabel: 'Pending Review', badgeColor: '#f59e0b', opacity: 1, pct, totalPaid, amountRequested, note: '' };
    }
    if (status === 'rejected') {
        return { stage: 'rejected', badgeLabel: 'Rejected', badgeColor: '#ef4444', opacity: 1, pct, totalPaid, amountRequested, note: '' };
    }
    // Approved (or a collectible exists without an explicit billing_request — services edge).
    // No collectible yet → the currently-invisible "approved but not yet invoiced" state (indigo).
    if (!coll) {
        return { stage: 'approved-not-invoiced', badgeLabel: 'Approved — Not Yet Invoiced', badgeColor: '#4f46e5', opacity: 1, pct: 0, totalPaid: 0, amountRequested: 0, note: '' };
    }
    // Collectible exists → derive from cash %.
    if (pct >= 100) {
        return { stage: 'fully-collected', badgeLabel: 'Fully Collected ✓', badgeColor: '#059669', opacity: 1, pct, totalPaid, amountRequested, note: '' };
    }
    if (pct > 0) {
        return { stage: 'collecting', badgeLabel: 'Billed / Collecting', badgeColor: '#0d9488', opacity: 1, pct, totalPaid, amountRequested, note: `₱${formatCurrency(totalPaid)} of ₱${formatCurrency(amountRequested)} · ${pct}%` };
    }
    return { stage: 'invoiced-awaiting', badgeLabel: 'Invoiced — Awaiting Payment', badgeColor: '#0d9488', opacity: 1, pct: 0, totalPaid, amountRequested, note: '' };
}

// Phase 99.1 D-06..D-09 — per-tranche lifecycle rows (REPLACES the status-only own-requests list).
// Iterates EVERY collection_tranche so every tranche is always a row — even unfiled ones —
// cross-referencing billing_requests + collectible docs via computeTrancheLifecycle. Unfiled →
// 45% opacity + dashed "— Not Filed" badge (D-08); partial payment → "₱X of ₱Y · Z%" note under
// the badge (D-09), not a separate stage. All user strings escaped (D-19).
function renderTrancheLifecycleRows() {
    const tranches = Array.isArray(currentProject?.collection_tranches) ? currentProject.collection_tranches : [];
    if (tranches.length === 0) return '';
    const rows = tranches.map((tranche, i) => {
        const lc = computeTrancheLifecycle(tranche, i, currentBillingRequests, currentCollectibleDocs);
        const br = currentBillingRequests.find(r => r.tranche_index === i);
        const reason = (lc.stage === 'rejected' && br?.rejection_reason)
            ? `<div style="font-size:0.62rem;color:#991b1b;margin-top:0.1rem;">Reason: ${escapeHTML(br.rejection_reason)}</div>` : '';
        const note = lc.note
            ? `<div style="font-size:0.62rem;color:#475569;margin-top:0.1rem;">${escapeHTML(lc.note)}</div>` : '';
        const isNotFiled = lc.stage === 'not-filed';
        const badgeStyle = isNotFiled
            ? `border:1px dashed ${lc.badgeColor};background:transparent;color:${lc.badgeColor};`
            : `border:none;background:${lc.badgeColor};color:#fff;`;
        return `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;padding:0.25rem 0;border-top:1px solid #f1f5f9;opacity:${lc.opacity};">
            <div style="font-size:0.66rem;color:#475569;font-weight:600;">${escapeHTML(tranche.label || ('Tranche ' + (i + 1)))}${reason}${note}</div>
            <span style="font-size:0.58rem;font-weight:700;${badgeStyle}border-radius:999px;padding:0.1rem 0.5rem;white-space:nowrap;">${escapeHTML(lc.badgeLabel)}</span>
        </div>`;
    }).join('');
    return `<div style="margin-top:0.4rem;">${rows}</div>`;
}

/* ========================================
   Phase 99 — Billing Request modal (BILL-01/BILL-02)
   tranche picker → type pills → doc-link fields → notes → submit.
   UI contract = spike-024 index.html; project CSS classes reused.
   ======================================== */

// Doc requirements by billing type (D-08; mirror spike index.html:545-549 verbatim)
const BILLING_DOCS = {
    progress:   [{ key: 'pr',  label: 'Progress Report' }],
    completion: [{ key: 'coc', label: 'Certificate of Completion (COC)' }, { key: 'cr', label: 'Completion Report' }],
    other:      [{ key: 'doc', label: 'Supporting Document' }],
};

// Auto-hint the billing type from a tranche label (D-07 — ALWAYS overrideable).
function _hintBillingType(label) {
    const l = (label || '').toLowerCase();
    if (l.includes('completion') || l.includes('final')) return 'completion';
    if (l.includes('progress')) return 'progress';
    return null;
}

function openBillingRequestModal() {
    if (!currentProject) return;
    // EDGE GUARD (mirror finance.js block-message pattern): need tranches + a positive contract_cost.
    const tranches = Array.isArray(currentProject.collection_tranches) ? currentProject.collection_tranches : [];
    const contractCost = parseFloat(currentProject.contract_cost) || 0;
    if (tranches.length === 0 || contractCost <= 0) {
        showToast('Set up collection tranches and a contract cost on this project before initiating billing.', 'error');
        return;
    }

    // Tranches that already have a pending or approved billing request cannot be re-submitted.
    // (rejected requests are re-submittable — only pending/approved are locked.)
    const billedIndices = new Set(
        currentBillingRequests
            .filter(r => r.status === 'pending' || r.status === 'approved')
            .map(r => r.tranche_index)
    );
    const firstAvailableIdx = tranches.findIndex((_, i) => !billedIndices.has(i));
    if (firstAvailableIdx < 0) {
        showToast('All tranches already have a pending or approved billing request.', 'error');
        return;
    }

    // Initial auto-hint from the first AVAILABLE tranche label (re-derived on tranche change below).
    billingSelectedType = _hintBillingType(tranches[firstAvailableIdx]?.label) || 'progress';

    const existing = document.getElementById('billingRequestModal');
    if (existing) existing.remove();

    const trancheOptions = tranches.map((t, i) => {
        const pct = parseFloat(t.percentage) || 0;
        const isBilled = billedIndices.has(i);
        const suffix = isBilled ? ' — already billed' : '';
        return `<option value="${i}"${isBilled ? ' disabled' : ''}${i === firstAvailableIdx ? ' selected' : ''}>${escapeHTML(t.label || ('Tranche ' + (i + 1)))} (${pct}%)${suffix}</option>`;
    }).join('');

    const pillStyle = (type) => {
        const sel = billingSelectedType === type;
        return `flex:1;cursor:pointer;border:2px solid ${sel ? '#1a73e8' : '#e2e8f0'};background:${sel ? '#eff6ff' : '#fff'};border-radius:8px;padding:0.5rem;text-align:center;user-select:none;`;
    };

    const modalHtml = `
    <div id="billingRequestModal" class="modal" style="display:flex;">
        <div class="modal-content" style="max-width:520px;margin:auto;">
            <div class="modal-header">
                <h2 style="font-size:1.125rem;font-weight:600;">Initiate Billing Request</h2>
                <button class="modal-close" onclick="document.getElementById('billingRequestModal').remove()">&times;</button>
            </div>
            <div class="modal-body" style="padding:1.5rem;">
                <div style="margin-bottom:1rem;">
                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Tranche <span style="color:#ea4335;">*</span></label>
                    <select id="billingTranche" class="form-control" style="width:100%;" onchange="window._onBillingTrancheChange()">
                        ${trancheOptions}
                    </select>
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Billing Type <span style="color:#ea4335;">*</span></label>
                    <div style="display:flex;gap:0.5rem;">
                        <div onclick="window._selectBillingType('progress')" data-billing-pill="progress" style="${pillStyle('progress')}">
                            <div style="font-weight:700;font-size:0.78rem;color:#1e293b;">Progress</div>
                            <div style="font-size:0.62rem;color:#64748b;margin-top:0.1rem;">1 doc</div>
                        </div>
                        <div onclick="window._selectBillingType('completion')" data-billing-pill="completion" style="${pillStyle('completion')}">
                            <div style="font-weight:700;font-size:0.78rem;color:#1e293b;">Completion</div>
                            <div style="font-size:0.62rem;color:#64748b;margin-top:0.1rem;">2 docs</div>
                        </div>
                        <div onclick="window._selectBillingType('other')" data-billing-pill="other" style="${pillStyle('other')}">
                            <div style="font-weight:700;font-size:0.78rem;color:#1e293b;">Other</div>
                            <div style="font-size:0.62rem;color:#64748b;margin-top:0.1rem;">1 doc</div>
                        </div>
                    </div>
                </div>
                <div id="billingDocFields" style="margin-bottom:1rem;"></div>
                <div style="margin-bottom:0.25rem;">
                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#475569;font-size:0.875rem;">Notes (Optional)</label>
                    <textarea id="billingNotes" class="form-control" rows="2" style="width:100%;" placeholder="Context for Finance…" oninput="window._validateBillingForm()"></textarea>
                </div>
                <div id="billingError" style="display:none;margin-top:0.5rem;padding:8px 12px;background:#fef2f2;color:#991b1b;border-radius:6px;font-size:0.8rem;"></div>
            </div>
            <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:1rem 1.5rem;border-top:1px solid #e5e7eb;">
                <button class="btn btn-outline" onclick="document.getElementById('billingRequestModal').remove()">Cancel</button>
                <button class="btn btn-primary" id="billingSubmitBtn" onclick="window.submitBillingRequest()" disabled style="opacity:0.5;cursor:not-allowed;">Submit Request</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Apply auto-hint + render the doc fields for the (hinted) type, then gate Submit.
    _onBillingTrancheChange();
}

function _onBillingTrancheChange() {
    const sel = document.getElementById('billingTranche');
    const idx = sel ? parseInt(sel.value, 10) : NaN;
    const tranches = Array.isArray(currentProject?.collection_tranches) ? currentProject.collection_tranches : [];
    const hint = _hintBillingType(tranches[idx]?.label);
    // ALWAYS overrideable (D-07): only move selection on a positive hint; otherwise keep current.
    _selectBillingType(hint || billingSelectedType);
}

function _selectBillingType(type) {
    if (!BILLING_DOCS[type]) type = 'progress';
    billingSelectedType = type;
    document.querySelectorAll('[data-billing-pill]').forEach(p => {
        const isSel = p.getAttribute('data-billing-pill') === type;
        p.style.border = `2px solid ${isSel ? '#1a73e8' : '#e2e8f0'}`;
        p.style.background = isSel ? '#eff6ff' : '#fff';
    });
    _renderBillingDocFields(type);
    _validateBillingForm();
}

function _renderBillingDocFields(type) {
    const wrap = document.getElementById('billingDocFields');
    if (!wrap) return;
    const docs = BILLING_DOCS[type] || [];
    wrap.innerHTML = docs.map(d => `
        <div style="margin-bottom:0.75rem;">
            <label style="display:block;margin-bottom:0.35rem;font-weight:600;color:#475569;font-size:0.8rem;">${escapeHTML(d.label)} <span style="color:#ea4335;">*</span></label>
            <input type="url" class="form-control" data-doc-key="${d.key}" style="width:100%;" placeholder="https://drive.google.com/…" oninput="window._validateBillingForm()">
            <div style="font-size:0.62rem;color:#94a3b8;margin-top:0.2rem;">Paste a shared link (Google Drive, SharePoint, etc.)</div>
        </div>`).join('');
}

function _validateBillingForm() {
    const btn = document.getElementById('billingSubmitBtn');
    if (!btn) return;
    const trancheSel = document.getElementById('billingTranche');
    const hasTranche = !!trancheSel && trancheSel.value !== '';
    const docs = BILLING_DOCS[billingSelectedType] || [];
    const allFilled = docs.length > 0 && docs.every(d => {
        const inp = document.querySelector(`#billingDocFields input[data-doc-key="${d.key}"]`);
        return !!inp && inp.value.trim() !== '';
    });
    const ok = hasTranche && allFilled;
    btn.disabled = !ok;
    btn.style.opacity = ok ? '1' : '0.5';
    btn.style.cursor = ok ? 'pointer' : 'not-allowed';
}

// Phase 99 — write the frozen D-04 billing_requests doc + fire-and-forget Finance notification.
async function submitBillingRequest() {
    if (!currentProject) return;
    const errEl = document.getElementById('billingError');
    const showErr = (msg) => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };

    // Re-validate tranche selection (defensive — mirrors _validateBillingForm)
    const trancheSel = document.getElementById('billingTranche');
    const trancheIndex = trancheSel ? parseInt(trancheSel.value, 10) : NaN;
    const tranches = Array.isArray(currentProject.collection_tranches) ? currentProject.collection_tranches : [];
    const tranche = tranches[trancheIndex];
    if (!tranche || isNaN(trancheIndex)) { showErr('Select a tranche first.'); return; }

    // Re-validate required docs (defensive)
    const docDefs = BILLING_DOCS[billingSelectedType] || [];
    const documents = docDefs.map(d => ({
        key: d.key,
        label: d.label,
        url: (document.querySelector(`#billingDocFields input[data-doc-key="${d.key}"]`)?.value || '').trim()
    }));
    if (documents.length === 0 || documents.some(d => !d.url)) {
        showErr('Fill in all required document links before submitting.');
        return;
    }

    const notes = (document.getElementById('billingNotes')?.value || '').trim();

    // Amount math (D-06) — sourced from currentProject (NOT projectsForCollMap, which doesn't exist here).
    const contractCost = parseFloat(currentProject.contract_cost) || 0;
    const tranchePct = parseFloat(tranche.percentage) || 0;
    const amountRequested = (tranchePct / 100) * contractCost;

    // Double-submit guard (mirror finance.js:1842-1847)
    const submitBtn = document.getElementById('billingSubmitBtn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.5'; submitBtn.style.cursor = 'not-allowed'; }

    try {
        await addDoc(collection(db, 'billing_requests'), {
            department: 'projects',                   // D-22 — department discriminator (finance treats missing as 'projects')
            project_code: currentProject.project_code || '',
            project_name: currentProject.project_name || '',
            tranche_index: trancheIndex,
            tranche_label: tranche.label,            // FROZEN
            tranche_percentage: tranchePct,          // FROZEN
            amount_requested: amountRequested,       // FROZEN (advisory; Finance re-derives at approval)
            billing_type: billingSelectedType,       // 'progress' | 'completion' | 'other'
            documents,                               // [{ key, label, url }]
            notes,                                   // optional string
            status: 'pending',                       // lowercase exact, D-05
            requested_by_uid: window.getCurrentUser?.()?.uid ?? null,
            requested_by_name: window.getCurrentUser?.()?.full_name || window.getCurrentUser?.()?.email || 'Unknown User',
            requested_at: serverTimestamp()
        });
    } catch (e) {
        console.error('[ProjectDetail/BillingReq] submit addDoc failed:', e);
        showErr('Failed to submit billing request. Please try again.');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; submitBtn.style.cursor = 'pointer'; }
        return;
    }

    // Success — remove modal; the own-requests listener (Task 1) auto-refreshes the status list.
    document.getElementById('billingRequestModal')?.remove();
    showToast('Billing request submitted to Finance.', 'success');

    // Fire-and-forget Finance fan-out (D-17 — its OWN try/catch; a notification failure must
    // NEVER undo the already-committed addDoc). T-99-04: if the users read rule blocks
    // operations_user, createNotificationForRoles logs + returns 0 (non-fatal).
    try {
        await createNotificationForRoles({
            roles: ['finance'],
            type: NOTIFICATION_TYPES.BILLING_REQUEST_SUBMITTED,
            message: `New billing request: ${currentProject.project_name} (${tranche.label}, PHP ${formatCurrency(amountRequested)})`,
            link: '#/finance/collectibles',
            source_collection: 'billing_requests',
            source_id: currentProject.project_code || '',
            object_name: currentProject.project_name || '',
            actor_name: window.getCurrentUser?.()?.full_name || 'System'
        });
    } catch (notifErr) {
        console.error('[ProjectDetail/BillingReq] BILLING_REQUEST_SUBMITTED notification failed:', notifErr);
    }
}

// Personnel pill rendering helper
function renderPersonnelPills(showEditControls) {
    const normalized = normalizePersonnel(currentProject);

    // Update module state (but only if search input is not focused, to preserve typing state)
    const searchFocused = document.activeElement?.id === 'detailPersonnelSearch';
    if (!searchFocused) {
        detailSelectedPersonnel = [];
        for (let i = 0; i < normalized.names.length; i++) {
            detailSelectedPersonnel.push({
                id: normalized.userIds[i] || '',
                name: normalized.names[i]
            });
        }
    }

    const pillsHtml = detailSelectedPersonnel.map(user => `
        <span class="personnel-pill ${user.id ? '' : 'legacy'}" data-user-id="${escapeHTML(user.id || '')}">
            ${escapeHTML(user.name)}
            ${showEditControls ? `<button type="button" class="pill-remove"
                onmousedown="event.preventDefault(); window.removeDetailPersonnel('${user.id || ''}', '${user.name.replace(/'/g, "\\'")}')">&times;</button>` : ''}
        </span>
    `).join('');

    if (!showEditControls) {
        return `
            <div class="form-group" style="margin-bottom: 0;">
                <label style="margin-bottom: 0.25rem;">Assigned Personnel</label>
                <div class="pill-input-container disabled">
                    ${pillsHtml || '<span style="color: #94a3b8; font-size: 0.875rem;">Not assigned</span>'}
                </div>
            </div>`;
    }

    return `
        <div class="form-group" style="margin-bottom: 0; position: relative;">
            <label style="margin-bottom: 0.25rem;">Assigned Personnel</label>
            <div class="pill-input-container" id="detailPillContainer"
                 onclick="document.getElementById('detailPersonnelSearch')?.focus()">
                ${pillsHtml}
                <input type="text"
                       class="pill-search-input"
                       id="detailPersonnelSearch"
                       data-field="personnel-pills"
                       placeholder="${detailSelectedPersonnel.length === 0 ? 'Type name or email...' : ''}"
                       oninput="window.filterDetailPersonnel(this.value)"
                       onfocus="window.showDetailPersonnelDropdown()"
                       autocomplete="off">
            </div>
            <div class="pill-dropdown" id="detailPersonnelDropdown" style="display: none;"></div>
        </div>`;
}

// Personnel pill interaction functions
function filterDetailPersonnel(searchText) {
    const dropdown = document.getElementById('detailPersonnelDropdown');
    if (!dropdown) return;

    const term = searchText.toLowerCase().trim();
    const selectedIds = detailSelectedPersonnel.map(u => u.id).filter(Boolean);

    const matches = term ? usersData.filter(user =>
        !selectedIds.includes(user.id) &&
        (user.full_name.toLowerCase().includes(term) ||
         user.email.toLowerCase().includes(term))
    ) : [];

    if (matches.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    dropdown.innerHTML = matches.slice(0, 10).map(user => `
        <div class="pill-dropdown-item"
             onmousedown="event.preventDefault(); window.selectDetailPersonnel('${user.id}', '${user.full_name.replace(/'/g, "\\'")}')">
            <strong>${escapeHTML(user.full_name)}</strong>
            <span style="color: #64748b; margin-left: 0.5rem;">${escapeHTML(user.email)}</span>
        </div>
    `).join('');

    dropdown.style.display = 'block';
}

function showDetailPersonnelDropdown() {
    const searchInput = document.getElementById('detailPersonnelSearch');
    if (searchInput?.value?.trim()) {
        filterDetailPersonnel(searchInput.value);
    }
}

async function selectDetailPersonnel(userId, userName) {
    if (!currentProject) return;
    if (detailSelectedPersonnel.some(u => u.id === userId)) return;

    // Capture old state for sync diff
    const previousUserIds = detailSelectedPersonnel.map(u => u.id).filter(Boolean);

    detailSelectedPersonnel.push({ id: userId, name: userName });

    // Save immediately to Firestore
    try {
        await updateDoc(doc(db, 'projects', currentProject.id), {
            personnel_user_ids: detailSelectedPersonnel.map(u => u.id).filter(Boolean),
            personnel_names: detailSelectedPersonnel.map(u => u.name),
            personnel_user_id: null,
            personnel_name: null,
            personnel: null,
            updated_at: new Date().toISOString()
        });
        // Record edit history (fire-and-forget)
        recordEditHistory(currentProject.id, 'personnel_add', [
            { field: 'personnel', old_value: null, new_value: userName }
        ]).catch(err => console.error('[EditHistory] selectPersonnel failed:', err));
        // Sync assignment (fire-and-forget)
        const newUserIds = detailSelectedPersonnel.map(u => u.id).filter(Boolean);
        syncPersonnelToAssignments(currentProject.project_code, previousUserIds, newUserIds)
            .catch(err => console.error('[ProjectDetail] Assignment sync failed:', err));
    } catch (error) {
        console.error('[ProjectDetail] Error saving personnel:', error);
        showToast('Failed to add personnel', 'error');
        detailSelectedPersonnel = detailSelectedPersonnel.filter(u => u.id !== userId);
    }

    // Clear search and close dropdown
    const searchInput = document.getElementById('detailPersonnelSearch');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    const dropdown = document.getElementById('detailPersonnelDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

async function removeDetailPersonnel(userId, userName) {
    if (!currentProject) return;

    const previousState = [...detailSelectedPersonnel];

    if (userId) {
        detailSelectedPersonnel = detailSelectedPersonnel.filter(u => u.id !== userId);
    } else {
        detailSelectedPersonnel = detailSelectedPersonnel.filter(u => u.name !== userName);
    }

    // Save immediately to Firestore
    try {
        await updateDoc(doc(db, 'projects', currentProject.id), {
            personnel_user_ids: detailSelectedPersonnel.map(u => u.id).filter(Boolean),
            personnel_names: detailSelectedPersonnel.map(u => u.name),
            personnel_user_id: null,
            personnel_name: null,
            personnel: null,
            updated_at: new Date().toISOString()
        });
        // Record edit history (fire-and-forget)
        recordEditHistory(currentProject.id, 'personnel_remove', [
            { field: 'personnel', old_value: userName || userId, new_value: null }
        ]).catch(err => console.error('[EditHistory] removePersonnel failed:', err));
        // Sync assignment (fire-and-forget)
        const previousUserIds = previousState.map(u => u.id).filter(Boolean);
        const newUserIds = detailSelectedPersonnel.map(u => u.id).filter(Boolean);
        syncPersonnelToAssignments(currentProject.project_code, previousUserIds, newUserIds)
            .catch(err => console.error('[ProjectDetail] Assignment sync failed:', err));
    } catch (error) {
        console.error('[ProjectDetail] Error removing personnel:', error);
        showToast('Failed to remove personnel', 'error');
        detailSelectedPersonnel = previousState;
    }
}

// Save field
async function saveField(fieldName, newValue) {
    // Guard: check edit permission
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return false;
    }

    // Reject locked fields
    if (['project_code', 'client_id', 'client_code'].includes(fieldName)) {
        console.error('[ProjectDetail] Attempted to edit locked field:', fieldName);
        return false;
    }

    clearFieldError(fieldName);

    // Validation
    if (fieldName === 'project_name' && !newValue.trim()) {
        showFieldError(fieldName, 'Project name is required');
        return false;
    }

    if ((fieldName === 'budget' || fieldName === 'contract_cost') && newValue) {
        const num = parseFloat(newValue);
        if (isNaN(num) || num <= 0) {
            showFieldError(fieldName, 'Must be a positive number (greater than 0)');
            return false;
        }
    }

    // Prepare value
    let valueToSave = newValue;
    if (fieldName === 'budget' || fieldName === 'contract_cost') {
        valueToSave = newValue ? parseFloat(newValue) : null;
    } else if (fieldName === 'project_name') {
        valueToSave = newValue.trim();
    }

    // Skip if no actual change (avoids spurious history entries and unnecessary writes)
    const oldValue = currentProject[fieldName];
    const normalizedOld = (fieldName === 'budget' || fieldName === 'contract_cost')
        ? (oldValue != null ? parseFloat(oldValue) : null)
        : oldValue;
    if (normalizedOld === valueToSave) {
        return true;
    }

    try {
        const projectRef = doc(db, 'projects', currentProject.id);
        await updateDoc(projectRef, {
            [fieldName]: valueToSave,
            updated_at: new Date().toISOString()
        });
        // Record edit history (fire-and-forget)
        recordEditHistory(currentProject.id, 'update', [
            { field: fieldName, old_value: oldValue ?? null, new_value: valueToSave }
        ]).catch(err => console.error('[EditHistory] saveField failed:', err));
        // Phase 84 NOTIF-11: notify personnel of meaningful project status change (D-03: fire-and-forget)
        const NOTIF11_STATUS_WHITELIST = ['Client Approved', 'For Mobilization', 'On-going', 'Completed', 'Loss'];
        if (fieldName === 'project_status' && NOTIF11_STATUS_WHITELIST.includes(valueToSave)) {
            const recipients = (currentProject.personnel_user_ids || []).filter(Boolean);
            if (recipients.length > 0) {
                const projectLink = currentProject.project_code
                    ? `#/projects/detail/${currentProject.project_code}`
                    : '#/projects';
                createNotificationForUsers({
                    user_ids: recipients,
                    type: NOTIFICATION_TYPES.PROJECT_STATUS_CHANGED,
                    message: `Project "${currentProject.project_name}" status changed to: ${valueToSave}`,
                    link: projectLink,
                    source_collection: 'projects',
                    source_id: currentProject.project_code || currentProject.id,
                    object_name: currentProject.project_name || '',
                    actor_name: window.getCurrentUser?.()?.full_name || 'System'
                }).catch(err => console.error('[ProjectDetail] NOTIF-11 notification failed:', err));
            }
        }
        // Phase 84.1 NOTIF-19: notify personnel of meaningful project cost change (D-03: fire-and-forget)
        const NOTIF19_COST_FIELDS = ['budget', 'contract_cost'];
        if (NOTIF19_COST_FIELDS.includes(fieldName) && normalizedOld !== valueToSave) {
            const recipients = (currentProject.personnel_user_ids || []).filter(Boolean);
            if (recipients.length > 0) {
                const projectLink = currentProject.project_code
                    ? `#/projects/detail/${currentProject.project_code}`
                    : '#/projects';
                const fieldLabel = fieldName === 'contract_cost' ? 'Contract Cost' : 'Budget';
                const oldDisplay = (normalizedOld != null) ? `PHP ${formatCurrency(normalizedOld)}` : '(not set)';
                const newDisplay = (valueToSave != null) ? `PHP ${formatCurrency(valueToSave)}` : '(not set)';
                createNotificationForUsers({
                    user_ids: recipients,
                    type: NOTIFICATION_TYPES.PROJECT_COST_CHANGED,
                    message: `Project "${currentProject.project_name}" ${fieldLabel} changed: ${oldDisplay} → ${newDisplay}`,
                    link: projectLink,
                    source_collection: 'projects',
                    source_id: currentProject.project_code || currentProject.id,
                    object_name: currentProject.project_name || '',
                    actor_name: window.getCurrentUser?.()?.full_name || 'System'
                }).catch(err => console.error('[ProjectDetail] NOTIF-19 cost-change notification failed:', err));
            }
        }
        return true;
    } catch (error) {
        console.error('[ProjectDetail] Save failed:', error);
        showFieldError(fieldName, 'Failed to save. Please try again.');
        return false;
    }
}

// Refresh expense calculation
async function refreshExpense(silent = false) {
    if (!currentProject) return;

    showLoading(true);
    try {
        // Aggregate POs for this project
        const posQuery = query(
            collection(db, 'pos'),
            where('project_name', '==', currentProject.project_name)
        );

        const posAggregate = await getAggregateFromServer(posQuery, {
            totalAmount: sum('total_amount'),
            poCount: count()
        });

        // Aggregate TRs for this project
        const trsQuery = query(
            collection(db, 'transport_requests'),
            where('project_name', '==', currentProject.project_name)
        );

        const trsAggregate = await getAggregateFromServer(trsQuery, {
            totalAmount: sum('total_amount'),
            trCount: count()
        });

        const poTotal = posAggregate.data().totalAmount || 0;
        const trTotal = trsAggregate.data().totalAmount || 0;

        // RFP payables query
        let rfpFeesTotal = 0;
        let rfpTotalPaid = 0;
        let hasRfps = false;
        const projectCode = currentProject.project_code || '';
        if (projectCode) {
            const rfpSnap = await getDocs(
                query(collection(db, 'rfps'), where('project_code', '==', projectCode))
            );
            hasRfps = rfpSnap.size > 0;
            rfpSnap.forEach(d => {
                const rfp = d.data();
                rfpFeesTotal += getRFPFees(rfp).feesTotal;
                rfpTotalPaid += (rfp.payment_records || [])
                    .filter(r => r.status !== 'voided')
                    .reduce((s, r) => s + parseFloat(r.amount || 0), 0);
            });
        }

        currentExpense = {
            total: poTotal + trTotal + rfpFeesTotal,
            poCount: posAggregate.data().poCount || 0,
            trCount: trsAggregate.data().trCount || 0,
            totalPaid: rfpTotalPaid,
            remainingPayable: (poTotal + trTotal + rfpFeesTotal) - rfpTotalPaid,
            hasRfps
        };

        // D-04 fix per 99.1 D-10 — Outstanding sourced from collectible docs, NOT approved billing_requests.
        // Invoiced = collectibles.amount_requested (frozen); Collected = non-voided payment_records;
        // Outstanding (Rem. Collectible) = Invoiced − Collected. Matches the service side (service-detail.js).
        let collTotalInvoiced = 0;
        let collTotalCollected = 0;
        if (projectCode) {
            const collSnap = await getDocs(query(collection(db, 'collectibles'), where('project_code', '==', projectCode)));
            collSnap.forEach(d => {
                const coll = d.data();
                collTotalInvoiced += parseFloat(coll.amount_requested || 0);
                collTotalCollected += (coll.payment_records || [])
                    .filter(r => r.status !== 'voided')
                    .reduce((s, r) => s + parseFloat(r.amount || 0), 0);
            });
        }
        currentCollectibles = {
            totalRequested: collTotalInvoiced,
            totalCollected: collTotalCollected,
            remainingCollectible: collTotalInvoiced - collTotalCollected
        };

        // Re-render to show updated expense — skip if lifecycle attach is pending (prevents
        // accordion body flicker: the snapshot handler calls buildLifecycleBodyInPlace instead)
        if (!_lcAttachPending) renderProjectDetail();

        if (!silent) showToast('Expense refreshed', 'success');
    } catch (error) {
        console.error('[ProjectDetail] Expense calculation failed:', error);
        showToast('Failed to calculate expense', 'error');
    } finally {
        showLoading(false);
    }
}

// Toggle active status
async function toggleActive(newValue) {
    // Guard: check edit permission
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return;
    }

    // Confirm deactivation only (Active → Inactive)
    if (!newValue) {
        const confirmed = confirm('Deactivate this project? Inactive projects cannot be selected for MRFs.');
        if (!confirmed) return;
    }

    try {
        const projectRef = doc(db, 'projects', currentProject.id);
        await updateDoc(projectRef, {
            active: newValue,
            updated_at: new Date().toISOString()
        });
        // Record edit history (fire-and-forget)
        recordEditHistory(currentProject.id, 'toggle_active', [
            { field: 'active', old_value: !newValue, new_value: newValue }
        ]).catch(err => console.error('[EditHistory] toggleActive failed:', err));
        showToast(`Project ${newValue ? 'activated' : 'deactivated'}`, 'success');
    } catch (error) {
        console.error('[ProjectDetail] Toggle failed:', error);
        showToast('Failed to update status', 'error');
    }
}

// Confirm delete
async function confirmDelete() {
    // Guard: check edit permission
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return;
    }

    const confirmed = confirm(`Delete project "${currentProject.project_name}"? This cannot be undone.`);
    if (!confirmed) return;

    showLoading(true);
    try {
        await deleteDoc(doc(db, 'projects', currentProject.id));
        showToast('Project deleted', 'success');
        window.location.hash = '#/projects';
    } catch (error) {
        console.error('[ProjectDetail] Delete failed:', error);
        showToast('Failed to delete project', 'error');
    } finally {
        showLoading(false);
    }
}

// Show field error
function showFieldError(fieldName, message) {
    const field = document.querySelector(`[data-field="${fieldName}"]`);
    if (!field) return;

    clearFieldError(fieldName);

    const errorEl = document.createElement('div');
    errorEl.className = 'field-error-message';
    errorEl.textContent = message;
    errorEl.style.cssText = 'color: #ef4444; font-size: 0.875rem; margin-top: 0.25rem;';

    field.parentNode.appendChild(errorEl);
    field.style.borderColor = '#ef4444';
}

// Clear field error
function clearFieldError(fieldName) {
    const field = document.querySelector(`[data-field="${fieldName}"]`);
    if (!field) return;

    const errorMsg = field.parentNode.querySelector('.field-error-message');
    if (errorMsg) errorMsg.remove();

    field.style.borderColor = '';
}

// Export project expense data as CSV
async function exportProjectExpenseCSV() {
    if (!currentProject) return;

    try {
        // Query all POs for this project
        const posSnap = await getDocs(
            query(collection(db, 'pos'), where('project_name', '==', currentProject.project_name))
        );

        // Collect unique MRF IDs to fetch requestor names
        const mrfIds = [...new Set(posSnap.docs.map(d => d.data().mrf_id).filter(Boolean))];
        const mrfMap = new Map();
        if (mrfIds.length > 0) {
            // Firestore 'in' supports up to 30 values; chunk if needed
            const chunks = [];
            for (let i = 0; i < mrfIds.length; i += 30) chunks.push(mrfIds.slice(i, i + 30));
            for (const chunk of chunks) {
                const mrfSnap = await getDocs(query(collection(db, 'mrfs'), where('mrf_id', 'in', chunk)));
                mrfSnap.forEach(d => mrfMap.set(d.data().mrf_id, d.data()));
            }
        }

        // Build rows — one row per line item across all POs
        const rows = [];
        posSnap.forEach(poDoc => {
            const po = poDoc.data();
            const mrf = mrfMap.get(po.mrf_id) || {};
            const requestorName = mrf.requestor_name || '';
            const dateStr = po.date_issued
                ? (po.date_issued.toDate ? po.date_issued.toDate() : new Date(po.date_issued)).toISOString().slice(0, 10)
                : '';
            const items = JSON.parse(po.items_json || '[]');
            items.forEach(item => {
                const qty = parseFloat(item.qty || item.quantity || 0);
                const unitCost = parseFloat(item.unit_cost || item.unitCost || item.price || 0);
                rows.push([
                    dateStr,
                    item.category || 'Uncategorized',
                    po.supplier_name || '',
                    item.item || item.item_name || item.itemName || item.name || 'Unnamed Item',
                    qty,
                    item.unit || 'pcs',
                    unitCost.toFixed(2),
                    (qty * unitCost).toFixed(2),
                    requestorName,
                    '' // REMARKS — blank until payables tracking is implemented
                ]);
            });
        });

        const headers = ['DATE', 'CATEGORY', 'SUPPLIER/SUBCONTRACTOR', 'ITEMS', 'QTY', 'UNIT', 'UNIT COST', 'TOTAL COST', 'REQUESTED BY', 'REMARKS'];
        const safeName = (currentProject.project_name || 'project').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '');
        const today = new Date().toISOString().slice(0, 10);
        downloadCSV(headers, rows, `${safeName}-expenses-${today}.csv`);
    } catch (error) {
        console.error('[ProjectDetail] Export failed:', error);
        showToast('Export failed', 'error');
    }
}

// Phase 78 D-04: lazy-load clients for the issuance picker (fetched once per session)
async function loadClientsCache() {
    if (clientsCacheLoaded) return;
    try {
        const snap = await getDocs(collection(db, 'clients'));
        clientsCacheForIssuance = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.client_code) {  // only clients with a client_code can be used to generate project codes
                clientsCacheForIssuance.push({ id: d.id, company_name: data.company_name || '(unnamed)', client_code: data.client_code });
            }
        });
        clientsCacheForIssuance.sort((a, b) => a.company_name.localeCompare(b.company_name));
        clientsCacheLoaded = true;
    } catch (err) {
        console.error('[ProjectDetail] Failed to load clients for issuance:', err);
    }
}

// Phase 78 D-07: Open confirmation modal for code issuance
async function startCodeIssuance() {
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return;
    }
    if (!currentProject || currentProject.client_code) {
        showToast('Project already has a code', 'error');
        return;
    }

    const select = document.getElementById('clientAssignSelect');
    if (!select || !select.value) {
        showToast('Select a client first', 'error');
        return;
    }
    const clientId = select.value;
    const clientCode = select.selectedOptions[0]?.dataset?.code || '';
    if (!clientCode) {
        showToast('Selected client has no client_code — cannot issue project code', 'error');
        return;
    }

    showLoading(true);
    try {
        // Pre-compute the new project_code so the modal can show it
        const newProjectCode = await generateProjectCode(clientCode);

        // Count linked records by project_id (the stable backbone from Plan 02)
        const projectId = currentProject.id;
        const [mrfsCount, prsCount, posCount, trsCount, rfpsCount] = await Promise.all([
            getDocs(query(collection(db, 'mrfs'), where('project_id', '==', projectId))).then(s => s.size),
            getDocs(query(collection(db, 'prs'), where('project_id', '==', projectId))).then(s => s.size),
            getDocs(query(collection(db, 'pos'), where('project_id', '==', projectId))).then(s => s.size),
            getDocs(query(collection(db, 'transport_requests'), where('project_id', '==', projectId))).then(s => s.size),
            getDocs(query(collection(db, 'rfps'), where('project_id', '==', projectId))).then(s => s.size)
        ]);
        const totalChildren = mrfsCount + prsCount + posCount + trsCount + rfpsCount;

        // Build confirmation overlay (Phase 78 D-07: clear text showing both new code AND total children backfilled)
        const overlayHtml = `
            <div id="issueCodeOverlay" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 1rem;">
                <div class="card" style="max-width: 520px; width: 100%; background: #fff;">
                    <div class="card-body" style="padding: 1.5rem;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1.125rem; font-weight: 600;">Issue Project Code</h3>
                        <p style="margin: 0 0 0.75rem 0; color: #1e293b;">
                            This will generate <strong>${escapeHTML(newProjectCode)}</strong> and apply it to all linked records:
                        </p>
                        <ul style="margin: 0 0 1rem 1.25rem; color: #475569; font-size: 0.9rem; line-height: 1.7;">
                            <li>${mrfsCount} Material Request${mrfsCount === 1 ? '' : 's'}</li>
                            <li>${prsCount} Purchase Request${prsCount === 1 ? '' : 's'}</li>
                            <li>${posCount} Purchase Order${posCount === 1 ? '' : 's'}</li>
                            <li>${trsCount} Transport Request${trsCount === 1 ? '' : 's'}</li>
                            <li>${rfpsCount} Request for Payment${rfpsCount === 1 ? '' : 's'}</li>
                        </ul>
                        <p style="margin: 0 0 1.5rem 0; color: #64748b; font-size: 0.875rem;">
                            <strong>${totalChildren}</strong> total record${totalChildren === 1 ? '' : 's'} will be updated. After issuance, the client and project code are locked.
                        </p>
                        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                            <button class="btn btn-secondary" onclick="document.getElementById('issueCodeOverlay').remove()">Cancel</button>
                            <button class="btn btn-primary"
                                    data-action="run-code-issuance"
                                    data-client-id="${escapeHTML(clientId)}"
                                    data-client-code="${escapeHTML(clientCode)}"
                                    data-new-project-code="${escapeHTML(newProjectCode)}">Confirm &amp; Issue</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        // Remove any prior overlay before appending (defensive de-dup)
        document.getElementById('issueCodeOverlay')?.remove();
        document.body.insertAdjacentHTML('beforeend', overlayHtml);
        const confirmBtn = document.querySelector('#issueCodeOverlay [data-action="run-code-issuance"]');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => runCodeIssuance(
                confirmBtn.dataset.clientId,
                confirmBtn.dataset.clientCode,
                confirmBtn.dataset.newProjectCode
            ));
        }
    } catch (err) {
        console.error('[ProjectDetail] startCodeIssuance failed:', err);
        showToast('Failed to prepare code issuance: ' + (err.message || err), 'error');
    } finally {
        showLoading(false);
    }
}

// Phase 78 D-04, D-05, D-08, D-12: Execute the batched backfill across all 5 collections + project doc.
// CRITICAL ORDERING (REVIEWS.md MEDIUM concern fix):
//   The project doc is pushed LAST into the writes[] array, AFTER every child collection forEach loop.
//   When chunk-committing in batches of 500, the project doc lives in the FINAL chunk and commits LAST.
//   If any prior batch fails (network, browser close, rule rejection), the project doc still has
//   project_code: null on disk → the user can safely re-run runCodeIssuance. Children that already
//   received the code on the failed run get re-written with the same code on the retry (idempotent).
async function runCodeIssuance(clientId, clientCode, newProjectCode) {
    if (window.canEditTab?.('projects') === false) {
        showToast('You do not have permission to edit projects', 'error');
        return;
    }
    if (!currentProject || currentProject.client_code) {
        showToast('Project already has a code', 'error');
        return;
    }

    // Tear down the modal immediately so the user sees progress feedback
    document.getElementById('issueCodeOverlay')?.remove();
    showLoading(true);

    try {
        const projectId = currentProject.id;

        // 1. Query all child records by project_id
        const [mrfsSnap, prsSnap, posSnap, trsSnap, rfpsSnap] = await Promise.all([
            getDocs(query(collection(db, 'mrfs'), where('project_id', '==', projectId))),
            getDocs(query(collection(db, 'prs'), where('project_id', '==', projectId))),
            getDocs(query(collection(db, 'pos'), where('project_id', '==', projectId))),
            getDocs(query(collection(db, 'transport_requests'), where('project_id', '==', projectId))),
            getDocs(query(collection(db, 'rfps'), where('project_id', '==', projectId)))
        ]);

        // 2. Build the list of writes. Children FIRST, project doc LAST (atomicity marker — see comment above).
        //    Firestore writeBatch caps at 500 writes per batch — we chunk if total writes exceed 500.
        const writes = [];

        // Children — write project_code + client_code on each. These are pushed FIRST.
        const childUpdate = { project_code: newProjectCode, client_code: clientCode };
        mrfsSnap.forEach(d => writes.push({ ref: doc(db, 'mrfs', d.id), data: childUpdate }));
        prsSnap.forEach(d => writes.push({ ref: doc(db, 'prs', d.id), data: childUpdate }));
        posSnap.forEach(d => writes.push({ ref: doc(db, 'pos', d.id), data: childUpdate }));
        trsSnap.forEach(d => writes.push({ ref: doc(db, 'transport_requests', d.id), data: childUpdate }));
        rfpsSnap.forEach(d => writes.push({ ref: doc(db, 'rfps', d.id), data: childUpdate }));

        // Project doc LAST — commits in the FINAL chunk so a partial-batch failure leaves the project
        // un-marked-issued (project_code stays null on disk) and the user can safely retry.
        // is_issued: true is the explicit flag for future security rules / UI heuristics (REVIEWS suggestion).
        writes.push({
            ref: doc(db, 'projects', projectId),
            data: {
                client_id: clientId,
                client_code: clientCode,
                project_code: newProjectCode,
                is_issued: true,  // Phase 78 D-12: explicit issued marker for future security rules / UI checks
                updated_at: new Date().toISOString()
            }
        });

        // 3. Commit in chunks of 500 (Firestore writeBatch hard limit)
        const CHUNK = 500;
        for (let i = 0; i < writes.length; i += CHUNK) {
            const batch = writeBatch(db);
            const chunk = writes.slice(i, i + CHUNK);
            chunk.forEach(w => batch.update(w.ref, w.data));
            await batch.commit();
        }

        const totalChildren = mrfsSnap.size + prsSnap.size + posSnap.size + trsSnap.size + rfpsSnap.size;

        // 4. Edit-history event — Phase 78 D-08: single combined event
        recordEditHistory(projectId, 'update', [
            { field: 'client_code', old_value: null, new_value: clientCode },
            { field: 'project_code', old_value: null, new_value: newProjectCode },
            { field: 'code_issued_backfill_count', old_value: null, new_value: totalChildren }
        ]).catch(err => console.error('[EditHistory] code_issued failed:', err));

        // 5. Sync personnel-to-assignments now that we have a project_code (skipped at create-time per Plan 01)
        const newUserIds = (currentProject.personnel_user_ids || []).filter(Boolean);
        if (newUserIds.length > 0) {
            syncPersonnelToAssignments(newProjectCode, [], newUserIds)
                .catch(err => console.error('[ProjectDetail] Post-issuance assignment sync failed:', err));
        }

        showToast(`Code ${newProjectCode} issued and applied to ${totalChildren} record${totalChildren === 1 ? '' : 's'}`, 'success');

        // 6. Redirect to the new code-based URL so the user lands on the canonical detail page
        window.location.hash = `#/projects/detail/${encodeURIComponent(newProjectCode)}`;
    } catch (err) {
        console.error('[ProjectDetail] runCodeIssuance failed:', err);
        showToast('Failed to issue code: ' + (err.message || err), 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// Phase 87.1 D-05 — Inline proposal card (project detail)
// Phase 96 — Redesigned with Concept B (progress track) + Alt B (stat chips)
// ============================================================
// Renders a lightweight info panel when the project status is in the proposal
// lifecycle range. Shows 4-node progress track, title-first Alt B data section,
// conditional attachment + comms rows, footer with Submit (conditional) + View.
// All Firestore writes go through _applyProposalStateTransition with a fresh
// getDoc() — same pattern as home.js _homeQueueConfirmAction (the reference).

// Phase 96 — STATUS_META: maps proposal status → track position
const STATUS_META = {
    draft:            { trackIdx: 0 },
    pending_internal: { trackIdx: 1 },
    pending_client:   { trackIdx: 2 },
    for_revision:     { trackIdx: 2, warn: true },
    client_approved:  { trackIdx: 4 },
    loss:             { trackIdx: -1 },
};

// Phase 96 — TRACK_NODES: 4 stage labels for the progress track
const TRACK_NODES = [
    { label: 'Draft' },
    { label: 'Internal<br>Review' },
    { label: 'Client<br>Review' },
    { label: 'Approved' },
];

// Phase 96 — inline SVG checkmark for passed nodes
const _PROPOSAL_CHECK_SVG = '<svg class="proposal-check-icon" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3"/></svg>';

function _renderCardAttachment(proposal) {
    if (!proposal.attachment_kind) return '';
    if (proposal.attachment_kind === 'link') {
        const url = proposal.attachment_url || '';
        let host = 'View link';
        try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (_) { /* keep default */ }
        return `<div class="proposal-info-row"><span>📎</span><a class="proposal-info-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(host)}</a></div>`;
    }
    if (proposal.attachment_kind === 'file') {
        const filename = proposal.attachment_filename || 'Download file';
        const url = proposal.attachment_url || '#';
        return `<div class="proposal-info-row"><span>📎</span><a class="proposal-info-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(filename)}</a></div>`;
    }
    return '';
}

function _renderCardLatestComms(proposal) {
    const log = proposal.comms_log || [];
    if (log.length === 0) return '';
    const last = log[log.length - 1];
    const date = last.date || '—';
    const rawDesc = last.description || '';
    const desc = rawDesc.length > 60 ? rawDesc.slice(0, 60) + '…' : rawDesc;
    return `<div class="proposal-info-row"><span>💬</span><span>${escapeHTML(date)} · ${escapeHTML(desc)}</span></div>`;
}

// Phase 96 — 4-node progress track HTML builder
function _buildProposalTrack(status) {
    const meta = STATUS_META[status] || { trackIdx: 0 };
    if (meta.trackIdx === -1) {
        return `<div class="proposal-loss-badge-wrap"><div class="proposal-loss-badge">✕ Loss — Proposal closed</div></div>`;
    }
    const trackIdx = meta.trackIdx;
    const isWarn = !!meta.warn;
    const nodes = TRACK_NODES.map((n, i) => {
        let stateCls = '';
        if (i < trackIdx) {
            stateCls = 't-passed';
        } else if (i === trackIdx) {
            stateCls = isWarn ? 't-active-warn' : 't-active';
        }
        const dot = stateCls === 't-passed'
            ? `<div class="t-dot">${_PROPOSAL_CHECK_SVG}</div>`
            : `<div class="t-dot"></div>`;
        return `<div class="proposal-track-node ${stateCls}">${dot}<div class="t-label">${n.label}</div></div>`;
    }).join('');
    return `<div class="proposal-card-track"><div class="proposal-track">${nodes}</div></div>`;
}

function renderInlineProposalCard(proposal, canDrive) {
    // Overdue detection: current_status_since > 7 days, fallback to created_at (D-04)
    let overdueBorder = '';
    let ageDays = 0;
    try {
        const since = proposal.current_status_since || proposal.created_at;
        if (since) {
            const sinceMs = since?.seconds ? since.seconds * 1000 : (typeof since === 'string' ? Date.parse(since) : 0);
            if (sinceMs > 0) {
                ageDays = (Date.now() - sinceMs) / 86400000;
            }
        }
    } catch (_) { /* ignore — defensive against missing/malformed field */ }

    const status = proposal.status || 'draft';
    const isOverdue = ageDays > 7 && status !== 'client_approved' && status !== 'loss';
    if (isOverdue) overdueBorder = 'border-left: 3px solid #f59e0b;';

    // Stage age chip values
    const ageDaysRounded = Math.round(ageDays);
    const ageLabel = ageDays <= 0 ? '—' : ageDaysRounded < 1 ? '< 1 day' : ageDaysRounded === 1 ? '1 day' : ageDaysRounded + ' days';
    const ageChipClass = isOverdue ? 'proposal-stat-chip chip-warn' : 'proposal-stat-chip';
    const ageSubHtml = isOverdue ? `<div class="proposal-chip-sub">needs attention</div>` : '';

    // Value chip
    const valueLabel = proposal.amount != null ? 'PHP ' + formatCurrency(proposal.amount) : '—';

    // Buttons
    const showSubmit = canDrive && ['draft', 'for_revision'].includes(status);
    const submitBtnHtml = showSubmit
        ? `<button class="btn btn-primary" id="proposalInlineSubmitBtn" onclick="window.openProposalInlineSubmitModal('${escapeHTML(proposal.id)}')">Submit for Approval</button>`
        : '';

    return `
        <div class="proposal-inline-card" style="${overdueBorder}">
            <div class="proposal-card-heading">PROPOSAL</div>
            ${_buildProposalTrack(status)}
            <div class="proposal-card-body">
                <div class="proposal-card-title">${escapeHTML(proposal.title || '(Untitled proposal)')}</div>
                <div class="proposal-card-id">${escapeHTML(proposal.proposal_id || proposal.id)}</div>
                <div class="proposal-chip-row">
                    <div class="proposal-stat-chip">
                        <div class="proposal-chip-label">VALUE</div>
                        <div class="proposal-chip-val">${escapeHTML(valueLabel)}</div>
                    </div>
                    <div class="${ageChipClass}">
                        <div class="proposal-chip-label">STAGE AGE</div>
                        <div class="proposal-chip-val">${escapeHTML(ageLabel)}</div>
                        ${ageSubHtml}
                    </div>
                </div>
                <div class="proposal-info-gap">
                    ${_renderCardAttachment(proposal)}
                    ${_renderCardLatestComms(proposal)}
                </div>
            </div>
            <div class="proposal-card-footer">
                ${submitBtnHtml}
                <button class="btn btn-outline" onclick="window.openProposalModal('${escapeHTML(proposal.id)}')">View Proposal</button>
            </div>
        </div>
    `;
}

function openProposalInlineSubmitModal(proposalDocId) {
    document.getElementById('proposal-inline-submit-modal')?.remove();
    const html = `
        <div id="proposal-inline-submit-modal" class="modal-overlay" style="display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:1000;backdrop-filter:blur(2px);">
            <div class="modal-window" style="background:#ffffff;border-radius:8px;max-width:480px;width:92%;padding:0;box-shadow:0 10px 25px rgba(0,0,0,0.2);">
                <div style="padding:1rem 1.25rem;border-bottom:1px solid #e5e7eb;">
                    <h3 style="margin:0;font-size:1.05rem;font-weight:600;color:#1e293b;">Submit for Approval</h3>
                </div>
                <div style="padding:1rem 1.25rem;">
                    <p style="margin:0 0 0.75rem 0;color:#475569;font-size:0.875rem;">Submitting will advance this project to <strong>Proposal for Internal Approval</strong>. This action is recorded in the audit trail.</p>
                    <label style="display:block;font-size:0.8125rem;font-weight:600;color:#475569;margin-bottom:0.25rem;">Submission Notes (optional)</label>
                    <textarea id="proposalInlineSubmitNotes" rows="3" placeholder="Describe the proposal and any context for approvers..." style="width:100%;padding:0.5rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.875rem;resize:vertical;font-family:inherit;"></textarea>
                </div>
                <div style="padding:0.75rem 1.25rem;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:0.5rem;">
                    <button class="btn btn-secondary" onclick="window.closeProposalInlineSubmitModal()">Keep Editing</button>
                    <button class="btn btn-primary" id="proposalInlineSubmitConfirmBtn" onclick="window.confirmProposalInlineSubmit('${escapeHTML(proposalDocId)}')">Confirm Submission</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}

async function confirmProposalInlineSubmit(proposalDocId) {
    // CR-01 anti-pattern guard + double-submit prevention: disable confirm button immediately
    const confirmBtn = document.getElementById('proposalInlineSubmitConfirmBtn');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Submitting...'; }

    try {
        // Fresh fetch — mirrors home.js _homeQueueConfirmAction reference pattern
        const snap = await getDoc(doc(db, 'proposals', proposalDocId));
        if (!snap.exists()) {
            showToast('Proposal not found.', 'error');
            return;
        }
        const proposal = { id: snap.id, ...snap.data() };
        if (!['draft', 'for_revision'].includes(proposal.status)) {
            showToast('Proposal status has changed. Please reload the page.', 'error');
            document.getElementById('proposal-inline-submit-modal')?.remove();
            return;
        }

        showLoading(true);
        try {
            await _applyProposalStateTransition({
                proposal,
                newStatus: 'pending_internal',
                newProjectStatus: 'Proposal for Internal Approval',
                auditAction: 'SUBMITTED',
                auditComment: null
            });
            document.getElementById('proposal-inline-submit-modal')?.remove();
            showToast('Proposal submitted for approval.', 'success');
            // Reload card so it reflects the new status (Submit button hides)
            if (currentProject) {
                loadProposalCard(currentProject.id, 'projects');
            }
        } catch (err) {
            console.error('[ProjectDetail] confirmProposalInlineSubmit transition failed:', err);
            showToast(err?.message || 'Failed to submit proposal. Please try again.', 'error');
            // Re-enable confirm button so user can retry
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Submission'; }
        } finally {
            showLoading(false);
        }
    } catch (err) {
        console.error('[ProjectDetail] confirmProposalInlineSubmit outer failure:', err);
        showToast(err?.message || 'Failed to submit proposal.', 'error');
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Submission'; }
    }
}

function syncBottomRow() {
    const proposalEl = document.getElementById('proposalInlineCard');
    const bottomRow = document.getElementById('projectDetailBottomRow');
    if (!bottomRow) return;
    const proposalVisible = proposalEl && proposalEl.style.display !== 'none' && proposalEl.innerHTML.trim() !== '';
    bottomRow.style.display = proposalVisible ? 'grid' : 'block';
    bottomRow.style.gridTemplateColumns = proposalVisible ? '1fr 1fr' : '';
    bottomRow.style.gap = proposalVisible ? '0.75rem' : '';
    bottomRow.style.alignItems = 'stretch';
}

async function loadProposalCard(parentDocId, parentCollection) {
    try {
        // Phase 87.3 D-01/D-02/D-05 — compute canDrive from current user role + personnel assignment
        const user = window.getCurrentUser?.();
        const uid = user?.uid;
        const role = user?.role;
        const adminRoles = ['super_admin', 'operations_admin', 'services_admin'];
        const assignedRoles = ['operations_user', 'services_user'];
        const parentPersonnel = currentProject?.personnel_user_ids || [];
        const canDrive = adminRoles.includes(role)
            || (assignedRoles.includes(role) && uid && parentPersonnel.includes(uid));

        const q = query(collection(db, 'proposals'), where('project_id', '==', parentDocId));
        const snap = await getDocs(q);
        const el = document.getElementById('proposalInlineCard');
        if (!el) return; // navigated away

        if (snap.empty) {
            if (currentProject?.project_status === 'For Proposal' && canDrive) {
                // Show Start Proposal CTA for canDrive users on For Proposal projects
                window._startProposalCallback = () => loadProposalCard(parentDocId, parentCollection);
                el.style.display = '';
                el.innerHTML = `<div class="proposal-inline-card proposal-inline-card--start">
                    <div class="proposal-inline-card__body" style="text-align:center;padding:1rem 0;">
                        <p style="margin:0 0 0.75rem 0;color:#475569;font-size:0.875rem;">No proposal yet. Ready to start one?</p>
                        <button class="btn btn-primary" onclick="window.openCreateProposalModal('${escapeHTML(parentDocId)}', window._startProposalCallback)">Start Proposal</button>
                    </div>
                </div>`;
            } else if (currentProject?.project_status === 'For Proposal') {
                // Non-canDrive user on For Proposal — show placeholder
                el.style.display = '';
                el.innerHTML = `<div class="proposal-inline-card"><p style="color:#64748b;font-size:0.875rem;margin:0;">No proposal linked yet.</p></div>`;
            } else {
                // Not in proposal range and no proposal — hide container
                el.style.display = 'none';
            }
            syncBottomRow();
            return;
        }

        // REVIEWS.md Plan-05 guidance — most projects have ≤1 active proposal; if multiple,
        // surface the first (Firestore returns them in indexed/natural order).
        const proposal = { id: snap.docs[0].id, ...snap.docs[0].data() };
        el.style.display = '';
        el.innerHTML = renderInlineProposalCard(proposal, canDrive);
        syncBottomRow();
    } catch (err) {
        console.error('[ProjectDetail] loadProposalCard failed:', err);
        const el = document.getElementById('proposalInlineCard');
        if (el) {
            el.innerHTML = `<div class="proposal-inline-card"><p style="color:#ef4444;font-size:0.875rem;margin:0;">Could not load proposal.</p></div>`;
        }
    }
}

// Phase 100 — Lifecycle doc keys map
const LC_DOC_KEYS = {
    inspection: { prefix: 'inspection_report',         L: 'I' },
    ntp:        { prefix: 'ntp_document',              L: 'N' },
    completion: { prefix: 'completion_report',         L: 'C' },
    coc:        { prefix: 'certificate_of_completion', L: 'O' },
};

function buildAttachZone(project, which, label, simFilename) {
    const dk = LC_DOC_KEYS[which];
    if (!dk) return '';
    const hasDoc = !!(project[dk.prefix + '_url'] || null);
    const L = dk.L;
    if (hasDoc) {
        const kind = project[dk.prefix + '_kind'] || 'link';
        const name = escapeHTML(project[dk.prefix + '_filename'] || project[dk.prefix + '_url'] || '');
        const url = escapeHTML(project[dk.prefix + '_url'] || '');
        const icon = kind === 'file' ? '📄' : '🔗';
        return `<div class="az az-ok">
            <div class="az-doc">
                <span class="az-doc-icon">${icon}</span>
                <div class="az-doc-info">
                    <div class="az-doc-name">${name}</div>
                    <div class="az-doc-kind">${kind}</div>
                </div>
                <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none;font-size:11px;cursor:pointer;" onclick="window.lcRemoveDoc('${which}')">✕ Remove</button>
            </div>
        </div>`;
    }
    return `<div class="az">
        <div class="az-lbl">${escapeHTML(label)}</div>
        <div class="az-row">
            <input class="az-input" id="az${L}Link" type="url" placeholder="https://drive.google.com/...">
            <button class="btn btn-primary" style="font-size:12px;padding:6px 12px;" onclick="window.lcAttachLink('${which}')">Attach</button>
        </div>
    </div>`;
}

function buildPATrack(project) {
    const POST_APPROVAL = [
        { label: 'Client\nApproved',  status: 'Client Approved'  },
        { label: 'For\nMobilization', status: 'For Mobilization' },
        { label: 'On-going',          status: 'On-going'         },
        { label: 'Completed',         status: 'Completed'        },
    ];
    const status = project.project_status || '';
    let curIdx = POST_APPROVAL.findIndex(p => p.status === status);
    if (status === 'Loss') curIdx = -1;
    let html = '<div class="pa-track">';
    POST_APPROVAL.forEach((p, i) => {
        const isDone = i < curIdx;
        const isActive = i === curIdx;
        const dotCls = isDone ? 'pa-done' : isActive ? 'pa-active' : 'pa-future';
        const lblCls = isDone ? 'pa-done' : isActive ? 'pa-active' : '';
        const lblLines = p.label.split('\n').join('<br>');
        html += `<div class="pa-stage">
            <div class="pa-dot ${dotCls}">${isDone ? '✓' : i + 1}</div>
            <div class="pa-lbl ${lblCls}">${lblLines}</div>
        </div>`;
        if (i < POST_APPROVAL.length - 1) {
            html += `<div class="pa-line ${isDone ? 'pa-done' : ''}"></div>`;
        }
    });
    return html + '</div>';
}

function buildDocRollup(project) {
    const DOC_SLOTS = [
        { key:'inspection', stage:'Gate 1 · For Inspection',  label:'Inspection Report',    prefix:'inspection_report' },
        { key:'ntp',        stage:'Gate 2 · Client Approved', label:'NTP / Purchase Order',  prefix:'ntp_document' },
        { key:'completion', stage:'Gate 4 · Completion',      label:'Completion Report',     prefix:'completion_report' },
        { key:'coc',        stage:'Gate 4 · Completion',      label:'Cert. of Completion',   prefix:'certificate_of_completion' },
    ];
    const filled = DOC_SLOTS.filter(s => project[s.prefix + '_url'] || null).length;
    let html = `<div class="doc-rollup">
        <div class="doc-rollup-hdr">
            <span class="doc-rollup-title">Documents on File</span>
            <span class="doc-rollup-count">${filled} / 4</span>
        </div>`;
    DOC_SLOTS.forEach(s => {
        const url = project[s.prefix + '_url'] || null;
        const kind = project[s.prefix + '_kind'] || null;
        const fname = project[s.prefix + '_filename'] || null;
        const empty = !url;
        const icon = kind === 'file' ? '📄' : url ? '🔗' : '📎';
        const display = fname || url || '— not yet attached';
        html += `<div class="doc-slot${empty ? ' ds-empty' : ''}">
            <span class="ds-icon">${icon}</span>
            <div class="ds-info">
                <div class="ds-stage">${escapeHTML(s.label)}</div>
                <div class="ds-name${empty ? ' none' : ''}">${escapeHTML(display)}</div>
            </div>
            ${!empty ? `<a class="ds-link" href="${escapeHTML(url)}" target="_blank" rel="noopener">Open ↗</a>` : ''}
        </div>`;
    });
    return html + '</div>';
}

function buildLifecycleBody(project, currentUser) {
    const status = project.project_status || 'For Inspection';
    // showRollup=false for proposal-stage statuses where all doc slots are empty (visual noise)
    function wrap(gateTitle, inner, showRollup = true) {
        return `<div class="gate-label">${gateTitle}</div>${inner}${showRollup ? buildDocRollup(project) : ''}`;
    }

    if (status === 'For Inspection') {
        const has = !!(project.inspection_report_url || null);
        const canDo = _canAdvanceProjectStatus(project, currentUser, 'For Proposal');
        return wrap('Gate 1 — Inspection Report', `
            <div class="lc-desc">Attach the site inspection report before advancing. The Advance button unlocks once the inspection report is on file.</div>
            ${!has ? '<div class="gate-warn">⚠️ Inspection report required to advance</div>' : ''}
            ${buildAttachZone(project, 'inspection', 'Inspection Report', 'Inspection_Report_Final.pdf')}
            <div class="action-row">
                <button class="btn btn-primary" ${(has && canDo) ? '' : 'disabled'} onclick="window.lcAdvanceToForProposal('${escapeHTML(project.id)}')">→ Advance to For Proposal</button>
                <span class="action-note">${!has ? 'Attach document to enable' : canDo ? 'Ready to advance' : 'Requires admin or project assignment'}</span>
            </div>`);
    }
    if (status === 'For Proposal') {
        return wrap('Proposal Stage', `<div class="built"><div class="built-title">✅ Already implemented — no changes needed</div><div class="built-desc">Full proposal flow lives in proposals.js + proposal-modal.js. Use the Proposal card below to create / submit / approve.</div></div>`, false);
    }
    if (status === 'Proposal for Internal Approval') {
        return wrap('Internal Approval Review', `<div class="built"><div class="built-title">✅ approveProposal() / rejectProposal() — already implemented</div><div class="built-desc">Operations Admin uses the Proposal card to approve or reject.</div></div>`, false);
    }
    if (status === 'Proposal Under Client Review' || status === 'For Revision') {
        return wrap('Client Review', `<div class="built"><div class="built-title">✅ markClientApproved() / requestRevision() / recordLoss() — already implemented</div><div class="built-desc">Client outcomes are managed via the Proposal card below.</div></div>`, false);
    }
    if (status === 'Client Approved') {
        const has = !!(project.ntp_document_url || null);
        const canDo = _canAdvanceProjectStatus(project, currentUser, 'For Mobilization');
        return wrap('Gate 2 — Notice to Proceed / PO', `
            <div class="lc-desc">Attach the client's formal work authorization (NTP or PO) before mobilizing.</div>
            ${!has ? '<div class="gate-warn">⚠️ NTP or PO required to start mobilization</div>' : ''}
            ${buildAttachZone(project, 'ntp', 'Notice to Proceed / Purchase Order', 'Notice_to_Proceed.pdf')}
            <div class="action-row">
                <button class="btn btn-orange" ${(has && canDo) ? '' : 'disabled'} onclick="window.lcStartMobilization('${escapeHTML(project.id)}')">🚀 Start Mobilization</button>
                <span class="action-note">${!has ? 'Attach NTP or PO to enable' : canDo ? 'Ready to mobilize' : 'Requires admin or project assignment'}</span>
            </div>`);
    }
    if (status === 'For Mobilization') {
        const mobilizedAt = escapeHTML(project.mobilization_started_at || '—');
        const canDo = _canAdvanceProjectStatus(project, currentUser, 'On-going');
        return wrap('Gate 3 — Start Project', `
            <div class="lc-desc">Resources are mobilizing. Click Start Project when site execution is ready. No document gate.</div>
            <div style="font-size:11px;color:#475569;margin-bottom:12px;">Mobilized: <code>${mobilizedAt}</code></div>
            <div class="action-row">
                <button class="btn btn-primary" ${canDo ? '' : 'disabled'} onclick="window.lcStartProject('${escapeHTML(project.id)}')">▶ Start Project</button>
                <span class="action-note">${canDo ? 'Records official project start date' : 'Requires admin or project assignment'}</span>
            </div>`);
    }
    if (status === 'On-going') {
        const hasR = !!(project.completion_report_url || null);
        const hasC = !!(project.certificate_of_completion_url || null);
        const can = hasR && hasC;
        const note = !hasR && !hasC ? 'Both documents required' : !hasR ? 'Still needed: Completion Report' : 'Still needed: Certificate of Completion';
        const startedAt = escapeHTML(project.project_started_at || '—');
        const canDo = _canAdvanceProjectStatus(project, currentUser, 'Completed');
        return wrap('Gate 4 — Completion', `
            <div class="lc-desc">Project in execution. Both a Completion Report and Certificate of Completion (COC) must be attached before closing.</div>
            <div style="font-size:11px;color:#475569;margin-bottom:10px;">Started: <code>${startedAt}</code></div>
            ${!can ? `<div class="gate-warn">⚠️ ${escapeHTML(note)}</div>` : ''}
            ${buildAttachZone(project, 'completion', 'Completion Report', 'Project_Completion_Report.pdf')}
            ${buildAttachZone(project, 'coc', 'Certificate of Completion (COC)', 'Certificate_of_Completion.pdf')}
            <div class="action-row">
                <button class="btn btn-primary" ${(!can || !canDo) ? 'disabled' : ''} onclick="window.lcMarkProjectComplete('${escapeHTML(project.id)}')">✅ Mark as Completed</button>
                <span class="action-note">${!canDo ? 'Requires project assignment' : !can ? escapeHTML(note) : ''}</span>
            </div>`);
    }
    if (status === 'Completed') {
        const cell = (lbl, val) => `<div class="comp-cell"><div class="comp-cell-lbl">${lbl}</div><div class="comp-cell-val">${escapeHTML(val || '—')}</div></div>`;
        return wrap('Project Closed', `
            <div class="comp-grid">
                ${cell('NTP / PO', project.ntp_document_filename || project.ntp_document_url)}
                ${cell('Mobilized', project.mobilization_started_at)}
                ${cell('Project Started', project.project_started_at)}
                ${cell('Completed At', project.project_completed_at)}
                ${cell('Completion Report', project.completion_report_filename || project.completion_report_url)}
                ${cell('Cert. of Completion', project.certificate_of_completion_filename || project.certificate_of_completion_url)}
            </div>
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:7px;padding:11px 13px;font-size:12px;color:#1e40af;line-height:1.65;margin-bottom:12px;"><strong>📊 COC → Finance</strong> — The COC on this project is the reference Finance uses when filing remaining billing tranches, including retention.</div>`);
    }
    if (status === 'Loss') {
        return wrap('Project Lost', `<div class="built"><div class="built-title">✅ recordLoss() — already implemented</div><div class="built-desc">Loss was recorded via the proposal workflow. No further project-status actions.</div></div>`, false);
    }
    return `<div style="padding:12px;font-size:12px;color:#64748b;">No lifecycle action for current status.</div>${buildDocRollup(project)}`;
}

function buildLifecycleBodyInPlace(project, currentUser) {
    if (!project) return;
    const body = document.getElementById('lcBody');
    if (body) body.innerHTML = buildLifecycleBody(project, currentUser);
    const track = document.getElementById('lcTrack');
    if (track) track.innerHTML = buildLifecycleTrack(project);
    updateLifecycleBadge(project);
}

// Phase 100 — Lifecycle accordion functions

function buildLifecycleTrack(project) {
    const status = project.project_status || 'For Inspection';
    let curIdx;
    if (status === 'Loss') {
        curIdx = -1;  // Loss is terminal — no node is "current"; track shows prior progress as done
    } else if (status === 'For Revision') {
        curIdx = LC_STAGES.findIndex(sg => sg.status === 'Proposal Under Client Review');
    } else {
        curIdx = LC_STAGES.findIndex(sg => sg.status === status);
    }

    let html = '';
    LC_STAGES.forEach((sg, i) => {
        const isPast = i < curIdx;
        const isCurrent = i === curIdx;
        const isRevNode = isCurrent && status === 'For Revision';
        const isLossNode = isCurrent && status === 'Loss';

        const nodeClass = isPast ? 's-done-node' : isRevNode ? 's-revision-node' : isCurrent ? 's-current-node' : '';
        const circClass = isPast ? 's-done' : isRevNode ? 's-revision' : isLossNode ? 's-loss' : isCurrent ? 's-current' : 's-future';

        let chipCls, chipTxt;
        if (isPast) { chipCls = 'chip-done'; chipTxt = 'DONE'; }
        else if (isRevNode) { chipCls = 'chip-revision'; chipTxt = 'REVISION'; }
        else if (isCurrent) { chipCls = 'chip-here'; chipTxt = '← HERE'; }
        else if (sg.status === 'Completed') { chipCls = 'chip-end'; chipTxt = 'END'; }
        else if (sg.gated) { chipCls = 'chip-gap'; chipTxt = 'GATE'; }
        else { chipCls = 'chip-end'; chipTxt = '—'; }

        const labelLines = sg.label.split('\n').join('<br>');
        html += `<div class="stage-node ${nodeClass}">
            <div class="stage-circle ${circClass}">
                ${sg.emoji}
                ${isPast ? '<div class="stage-check">✓</div>' : ''}
            </div>
            <div class="stage-label">${labelLines}</div>
            <div class="stage-chip ${chipCls}">${chipTxt}</div>
        </div>`;

        if (i < LC_STAGES.length - 1) {
            html += `<div class="connector ${isPast ? 'done' : ''}"></div>`;
        }
    });

    if (status === 'Loss') {
        html += `<div style="margin-left:10px;padding:4px 10px;background:#fee2e2;border:1.5px solid #ef4444;border-radius:8px;font-size:11px;font-weight:700;color:#991b1b;">✗ LOSS</div>`;
    }
    return html;
}

function renderLifecycleCard(project, currentUser) {
    const status = project.project_status || 'For Inspection';
    const isActive = ['For Inspection','Client Approved','For Mobilization','On-going','For Revision'].includes(status);
    const isComplete = status === 'Completed';
    const gated = ['For Inspection','Client Approved','For Mobilization','On-going'].includes(status);
    const color = _getProjectStatusColor(status);
    return `<div class="lc-accordion ${isActive ? 'lc-active' : ''} ${isComplete ? 'lc-complete' : ''} ${_lcOpen ? 'open' : ''}" id="lcAccordion">
        <div class="lc-card-header" onclick="window.toggleLifecycleAccordion()">
            <div class="lc-header-left">
                <span class="lc-card-title">Project Lifecycle</span>
                <span class="lc-cur-badge" id="lcCurBadge" style="background:${color}1a;color:${color};border:1px solid ${color}44;">&#9679; ${escapeHTML(status)}</span>
            </div>
            <div class="lc-header-right">
                ${gated && !_lcOpen ? '<span id="lcActionHint" style="font-size:11px;color:#f59e0b;">Action needed &#8595;</span>' : ''}
                <span class="lc-chevron">&#9660;</span>
            </div>
        </div>
        <div class="lc-track-wrap"><div class="lc-track" id="lcTrack">${buildLifecycleTrack(project)}</div></div>
        <div class="lc-body" id="lcBody"><!-- Plan 03 fills this --></div>
    </div>`;
}

function updateLifecycleBadge(project) {
    if (!project) return;
    const status = project.project_status || 'For Inspection';
    const color = _getProjectStatusColor(status);
    const badge = document.getElementById('lcCurBadge');
    if (badge) {
        badge.style.background = `${color}1a`;
        badge.style.color = color;
        badge.style.border = `1px solid ${color}44`;
        badge.textContent = `● ${status}`;
    }
    const hdrBadge = document.getElementById('hdrStatusBadge');
    if (hdrBadge) {
        hdrBadge.style.background = color;
        hdrBadge.textContent = status;
    }
    const accordion = document.getElementById('lcAccordion');
    if (accordion) {
        accordion.classList.toggle('lc-active', ['For Inspection','Client Approved','For Mobilization','On-going','For Revision'].includes(status));
        accordion.classList.toggle('lc-complete', status === 'Completed');
    }
    const hintSpan = document.getElementById('lcActionHint');
    const gated = ['For Inspection','Client Approved','For Mobilization','On-going'].includes(status);
    if (gated && !_lcOpen) {
        if (!hintSpan) {
            const right = document.querySelector('#lcAccordion .lc-header-right');
            if (right) right.insertAdjacentHTML('afterbegin', '<span id="lcActionHint" style="font-size:11px;color:#f59e0b;">Action needed &#8595;</span>');
        }
    } else if (hintSpan) {
        hintSpan.remove();
    }
}

function toggleLifecycleAccordion() {
    _lcOpen = !_lcOpen;
    const accordion = document.getElementById('lcAccordion');
    if (accordion) accordion.classList.toggle('open', _lcOpen);
    updateLifecycleBadge(currentProject);
    if (_lcOpen) {
        buildLifecycleBodyInPlace(currentProject, window.getCurrentUser?.() || null);
    }
}

// Phase 100 — lifecycle gate shared helpers
function _canAdvanceProjectStatus(project, currentUser, targetStatus) {
    if (!currentUser || !project) return false;
    const role = currentUser.role || '';
    if (['super_admin', 'operations_admin'].includes(role)) return true;
    // operations_user assigned to the project may perform all gate transitions including Completed
    if (role === 'operations_user') {
        const ids = Array.isArray(project.personnel_user_ids) ? project.personnel_user_ids : [];
        return ids.includes(currentUser.uid);
    }
    return false;
}

async function addProjectAuditEntry(projectId, action, actorId, actorName, comment) {
    try {
        await addDoc(collection(db, 'projects', projectId, 'audit_log'), {
            action,
            actor_id: actorId || '',
            actor_name: actorName || 'Unknown',
            comment: comment || '',
            created_at: serverTimestamp(),
        });
    } catch (err) {
        console.error('[ProjectDetail] addProjectAuditEntry failed:', err);
    }
}

// Phase 101 — Journal panel HTML builders and UI helpers

// Statuses where the journal panel is shown at all
const JOURNAL_WRITE_STATUSES = ['For Mobilization', 'On-going'];
const JOURNAL_VISIBLE_STATUSES = [...JOURNAL_WRITE_STATUSES, 'Completed'];

// Build the full journal panel HTML for a given project.
// Returns '' when the panel should be hidden (D-03).
// The progress and issues tab bodies are left as placeholders — Plan 04 fills them.
function _buildJournalPanelHtml(project) {
    const isVisible = JOURNAL_VISIBLE_STATUSES.includes(project.project_status);
    if (!isVisible) return '';

    const isReadOnly = project.project_status === 'Completed';

    const tabs = ['activity', 'progress', 'issues'];
    const tabLabels = { activity: 'Activity Feed', progress: 'Progress Updates', issues: 'Issues' };

    const tabBarHtml = `<div class="journal-tab-bar">${
        tabs.map(t => `<button
            id="journalTabBtn-${t}"
            class="journal-tab-btn${_activeJournalTab === t ? ' active' : ''}"
            onclick="window.switchJournalTab('${t}')"
        >${tabLabels[t]}</button>`).join('')
    }</div>`;

    // Activity Feed panel
    const composerHtml = !isReadOnly ? `
        <div class="journal-composer">
            <select id="journalTagSelect" class="journal-tag-select">
                <option value="update">Update</option>
                <option value="milestone">Milestone</option>
                <option value="issue">Issue</option>
                <option value="client">Client Comm</option>
            </select>
            <textarea id="journalComposerText" class="journal-composer-textarea" placeholder="Add a note…" rows="2"></textarea>
            <button class="journal-post-btn" onclick="window.postActivityEntry()">Post</button>
        </div>` : '';

    const feedHtml = `<div class="journal-feed-list">${
        journalActivityEntries.length === 0
            ? '<div style="color:#94a3b8;font-size:0.82rem;padding:0.5rem 0;">No entries yet.</div>'
            : journalActivityEntries.map(e => _renderFeedEntry(e)).join('')
    }</div>`;

    const activityPanelHtml = `<div id="journalTab-activity" class="journal-tab-panel"${_activeJournalTab !== 'activity' ? ' style="display:none"' : ''}>
        ${composerHtml}
        ${feedHtml}
    </div>`;

    // Progress Updates panel — Plan 04: real form + history
    const progressPanelHtml = `<div id="journalTab-progress" class="journal-tab-panel"${_activeJournalTab !== 'progress' ? ' style="display:none"' : ''}>
        ${_buildProgressTabHtml(project, isReadOnly)}
    </div>`;

    // Issues panel — Plan 04: filter chips + form + punch list
    const issuesPanelHtml = `<div id="journalTab-issues" class="journal-tab-panel"${_activeJournalTab !== 'issues' ? ' style="display:none"' : ''}>
        ${_buildIssuesTabHtml(project, isReadOnly)}
    </div>`;

    return `<div id="projectJournalPanel" class="project-journal-panel${isReadOnly ? ' project-journal-panel--readonly' : ''}">
        <div class="journal-panel-title">Project Journal</div>
        ${tabBarHtml}
        ${activityPanelHtml}
        ${progressPanelHtml}
        ${issuesPanelHtml}
    </div>`;
}

// Render a single activity feed entry row.
// Handles both live Firestore Timestamp ({seconds}) and optimistic ({seconds: Date.now()/1000}).
function _renderFeedEntry(entry) {
    const ts = entry.created_at?.seconds
        ? new Date(entry.created_at.seconds * 1000)
        : (entry.created_at?.toDate ? entry.created_at.toDate() : new Date());
    const timeStr = ts.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    const authorName = escapeHTML(entry.created_by_name || 'Unknown');
    const tagType = entry.type || 'update';
    const tagLabel = { update: 'Update', milestone: 'Milestone', issue: 'Issue', client: 'Client', system: 'System', edit: 'Edit' }[tagType] || escapeHTML(tagType);
    const isSystem = entry.is_system || tagType === 'system' || tagType === 'edit';

    return `<div class="journal-entry${isSystem ? ' journal-entry--system' : ''}">
        <div class="journal-entry-meta">
            <span class="journal-entry-tag journal-entry-tag--${escapeHTML(tagType)}">${tagLabel}</span>
            <span>${escapeHTML(timeStr)}</span>
            ${!isSystem ? `<span>${authorName}</span>` : ''}
        </div>
        <div class="journal-entry-text">${escapeHTML(entry.text || '')}</div>
    </div>`;
}

// In-place re-render of the journal panel (called from snapshot callbacks).
// Uses the same replaceWith pattern as the project plan card (lines 284–290).
function _renderJournalPanelInPlace() {
    const el = document.getElementById('projectJournalPanel');
    if (!el || !currentProject) return;
    const html = _buildJournalPanelHtml(currentProject);
    if (!html) {
        // Panel should be hidden — remove it if it's somehow in the DOM
        el.remove();
        return;
    }
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    el.replaceWith(tmp.firstElementChild);
}

// DOM-only tab switcher — mirrors lcSwitchTab (lines 2478–2487).
// All three listeners already running; no new Firestore subscriptions needed.
function switchJournalTab(tab) {
    _activeJournalTab = tab;
    ['activity', 'progress', 'issues'].forEach(t => {
        const panel = document.getElementById('journalTab-' + t);
        const btn = document.getElementById('journalTabBtn-' + t);
        if (panel) panel.style.display = (t === tab) ? '' : 'none';
        if (btn) btn.classList.toggle('active', t === tab);
    });
}

// Post a new Activity Feed entry (composer submit handler).
// Optimistic: unshifts into journalActivityEntries and re-renders immediately,
// then persists via _addActivityEntry. The next onSnapshot rebuilds the array from
// Firestore (array-replace — the optimistic entry is replaced by the real doc).
async function postActivityEntry() {
    const tagSelect = document.getElementById('journalTagSelect');
    const textEl = document.getElementById('journalComposerText');
    const type = tagSelect?.value || 'update';
    const text = (textEl?.value || '').trim();
    if (!text) { showToast('Enter a note before posting.', 'error'); return; }

    const cu = window.getCurrentUser?.();
    // Optimistic append — show entry in DOM before Firestore confirms
    journalActivityEntries.unshift({
        id: '_optimistic',
        type,
        text,
        is_system: false,
        created_by_name: cu?.full_name || cu?.email || 'Unknown',
        created_at: { seconds: Date.now() / 1000 }
    });
    _renderJournalPanelInPlace();
    if (textEl) textEl.value = '';

    try {
        await _addActivityEntry(currentProject.id, { type, text, is_system: false });
        // onSnapshot fires shortly after and rebuilds journalActivityEntries from Firestore,
        // replacing the _optimistic placeholder with the real persisted doc (array-replace).
    } catch (err) {
        console.error('[ProjectDetail/Journal] postActivityEntry failed:', err);
        showToast('Failed to post entry. Please try again.', 'error');
    }
}

// Phase 101 — shared write primitive for all journal activity entries.
// Called by: postActivityEntry (Plan 03), resolveIssue/reopenIssue (Plan 04),
// lifecycle gate transitions and field-edit auto-entries (Plan 05 / Plan 03 D-06/D-07).
async function _addActivityEntry(projectId, { type, text, is_system = false }) {
    try {
        const cu = window.getCurrentUser?.();
        await addDoc(collection(db, 'projects', projectId, 'activity_entries'), {
            type,
            text,
            is_system,
            created_by_uid: cu?.uid ?? '',
            created_by_name: cu?.full_name || cu?.email || 'Unknown',
            created_at: serverTimestamp(),
        });
    } catch (err) {
        console.error('[ProjectDetail/Journal] _addActivityEntry failed:', err);
    }
}

// Phase 101 Plan 04 — Progress Updates tab builder and submit handler.

// Render a single progress update card (newest-first; history list).
function _renderProgressCard(u) {
    const ts = u.created_at?.seconds
        ? new Date(u.created_at.seconds * 1000)
        : (u.created_at?.toDate ? u.created_at.toDate() : new Date());
    const timeStr = ts.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    const pct = Number(u.pct_complete) || 0;
    return `<div class="journal-progress-card">
        <div class="journal-progress-card-header">
            <span class="journal-pct-badge">${pct}%</span>
            <span class="journal-entry-meta-text">${escapeHTML(timeStr)} &mdash; ${escapeHTML(u.created_by_name || 'Unknown')}</span>
        </div>
        ${u.summary ? `<div class="journal-progress-field"><span class="journal-progress-label">Summary:</span> ${escapeHTML(u.summary)}</div>` : ''}
        ${u.blockers ? `<div class="journal-progress-field"><span class="journal-progress-label">Blockers:</span> ${escapeHTML(u.blockers)}</div>` : ''}
        ${u.next_milestone ? `<div class="journal-progress-field"><span class="journal-progress-label">Next Milestone:</span> ${escapeHTML(u.next_milestone)}</div>` : ''}
    </div>`;
}

// Build the full Progress Updates tab HTML (form + history list).
// When isReadOnly, the form is omitted.
function _buildProgressTabHtml(project, isReadOnly) {
    const formHtml = !isReadOnly ? `
        <div class="journal-progress-form">
            <div class="journal-progress-row">
                <label for="journalProgPct" style="font-size:0.82rem;color:#475569;">% Complete</label>
                <input type="number" id="journalProgPct" class="journal-pct-input" min="0" max="100" step="1" placeholder="0" style="width:70px;" />
            </div>
            <div class="journal-progress-row">
                <label for="journalProgSummary" style="font-size:0.82rem;color:#475569;">Summary <span style="color:#ef4444">*</span></label>
                <textarea id="journalProgSummary" placeholder="What was accomplished?" rows="2" style="width:100%;"></textarea>
            </div>
            <div class="journal-progress-row">
                <label for="journalProgBlockers" style="font-size:0.82rem;color:#475569;">Blockers</label>
                <textarea id="journalProgBlockers" placeholder="Any blockers or risks?" rows="2" style="width:100%;"></textarea>
            </div>
            <div class="journal-progress-row">
                <label for="journalProgNext" style="font-size:0.82rem;color:#475569;">Next Milestone</label>
                <input type="text" id="journalProgNext" placeholder="Next target or milestone" style="width:100%;" />
            </div>
            <button class="journal-post-btn" onclick="window.submitProgressUpdate()">Submit Update</button>
        </div>` : '';

    const historyHtml = journalProgressUpdates.length === 0
        ? '<div style="color:#94a3b8;font-size:0.82rem;padding:0.5rem 0;">No progress updates yet.</div>'
        : journalProgressUpdates.map(u => _renderProgressCard(u)).join('');

    return `${formHtml}<div class="journal-progress-history">${historyHtml}</div>`;
}

// Submit a new Progress Update entry to Firestore.
async function submitProgressUpdate() {
    const pctEl = document.getElementById('journalProgPct');
    const summaryEl = document.getElementById('journalProgSummary');
    const blockersEl = document.getElementById('journalProgBlockers');
    const nextEl = document.getElementById('journalProgNext');

    const summary = (summaryEl?.value || '').trim();
    if (!summary) { showToast('Add a progress summary.', 'error'); return; }

    const pct = Math.max(0, Math.min(100, parseInt(pctEl?.value || '0', 10) || 0));
    const blockers = (blockersEl?.value || '').trim();
    const next_milestone = (nextEl?.value || '').trim();

    const cu = window.getCurrentUser?.();
    try {
        await addDoc(collection(db, 'projects', currentProject.id, 'progress_updates'), {
            pct_complete: pct,
            summary,
            blockers,
            next_milestone,
            created_by_uid: cu?.uid ?? '',
            created_by_name: cu?.full_name || cu?.email || 'Unknown',
            created_at: serverTimestamp(),
        });
        showToast('Progress update submitted.', 'success');
        // Clear fields
        if (pctEl) pctEl.value = '';
        if (summaryEl) summaryEl.value = '';
        if (blockersEl) blockersEl.value = '';
        if (nextEl) nextEl.value = '';
        // onSnapshot listener re-renders the panel automatically
    } catch (err) {
        console.error('[ProjectDetail/Journal] submitProgressUpdate failed:', err);
        showToast('Failed to submit progress update. Please try again.', 'error');
    }
}

// Phase 101 Plan 04 — Issues tab builders and resolve/reopen workflow.

// Derive a stable "#N" display number for an issue.
// Issues are ordered newest-first in journalIssues (created_at desc).
// To get #1 = oldest, sort by created_at ascending and use 1-based index.
function _issueSeqNum(issueId) {
    // Build ascending order (oldest first = #1)
    const sorted = [...journalIssues].sort((a, b) => {
        const aS = a.created_at?.seconds ?? 0;
        const bS = b.created_at?.seconds ?? 0;
        return aS - bS;
    });
    const idx = sorted.findIndex(i => i.id === issueId);
    if (idx === -1) return issueId.slice(-4); // fallback: short id slice
    return idx + 1;
}

// Human-readable labels for issue types.
const ISSUE_TYPE_LABELS = {
    delay: 'Delay',
    change_order: 'Change Order',
    site_issue: 'Site Issue',
    client_request: 'Client Request',
};

// Render a single issue row in the punch list.
function _renderIssueRow(issue, isReadOnly) {
    const typeLabel = ISSUE_TYPE_LABELS[issue.issue_type] || escapeHTML(issue.issue_type || '');
    const seqNum = _issueSeqNum(issue.id);
    const isResolved = issue.status === 'resolved';

    const ts = issue.created_at?.seconds
        ? new Date(issue.created_at.seconds * 1000)
        : (issue.created_at?.toDate ? issue.created_at.toDate() : new Date());
    const timeStr = ts.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

    const resolutionBlock = isResolved ? `
        <div class="journal-resolution-notes">
            <span style="font-weight:600;">Resolution:</span> ${escapeHTML(issue.resolution_notes || '')}
        </div>` : '';

    const actionBtn = !isReadOnly
        ? (isResolved
            ? `<button class="journal-issue-reopen-btn" onclick="window.reopenIssue('${escapeHTML(issue.id)}')">Re-open</button>`
            : `<button class="journal-issue-resolve-btn" onclick="window.resolveIssue('${escapeHTML(issue.id)}')">Resolve</button>`)
        : '';

    return `<div class="journal-issue">
        <div class="journal-issue-header">
            <span class="journal-issue-seq">#${seqNum}</span>
            <span class="journal-issue-type-chip journal-issue-type-chip--${escapeHTML(issue.issue_type || '')}">${typeLabel}</span>
            <span class="journal-issue-title">${escapeHTML(issue.title || '')}</span>
            <span class="journal-issue-status--${isResolved ? 'resolved' : 'open'}">${isResolved ? 'Resolved' : 'Open'}</span>
            ${actionBtn}
        </div>
        ${issue.description ? `<div class="journal-issue-desc">${escapeHTML(issue.description)}</div>` : ''}
        ${resolutionBlock}
        <div class="journal-issue-meta" style="font-size:0.78rem;color:#94a3b8;margin-top:0.25rem;">${escapeHTML(timeStr)} &mdash; ${escapeHTML(issue.created_by_name || 'Unknown')}</div>
    </div>`;
}

// Build the full Issues tab HTML (filter chips + optional form + punch list).
function _buildIssuesTabHtml(project, isReadOnly) {
    const filterChips = ['all', 'open', 'resolved'].map(f =>
        `<button class="journal-filter-chip${journalIssueFilter === f ? ' active' : ''}" onclick="window.setIssueFilter('${f}')">${f.charAt(0).toUpperCase() + f.slice(1)}</button>`
    ).join('');
    const filterBar = `<div class="journal-issue-filters">${filterChips}</div>`;

    const formHtml = !isReadOnly ? `
        <div class="journal-issue-form">
            <select id="journalIssueType">
                <option value="delay">Delay</option>
                <option value="change_order">Change Order</option>
                <option value="site_issue">Site Issue</option>
                <option value="client_request">Client Request</option>
            </select>
            <input type="text" id="journalIssueTitle" placeholder="Issue title (required)" style="width:100%;" />
            <textarea id="journalIssueDesc" placeholder="Description (optional)" rows="2" style="width:100%;"></textarea>
            <button class="journal-post-btn" onclick="window.submitNewIssue()">Log Issue</button>
        </div>` : '';

    const filtered = journalIssues.filter(i => {
        if (journalIssueFilter === 'open') return i.status === 'open';
        if (journalIssueFilter === 'resolved') return i.status === 'resolved';
        return true; // 'all'
    });

    const listHtml = filtered.length === 0
        ? '<div style="color:#94a3b8;font-size:0.82rem;padding:0.5rem 0;">No issues logged yet.</div>'
        : filtered.map(i => _renderIssueRow(i, isReadOnly)).join('');

    return `${filterBar}${formHtml}<div class="journal-issue-list">${listHtml}</div>`;
}

// Set the active issue filter and re-render the panel.
function setIssueFilter(f) {
    journalIssueFilter = f;
    _renderJournalPanelInPlace();
}

// Submit a new Issue to Firestore.
async function submitNewIssue() {
    const typeEl = document.getElementById('journalIssueType');
    const titleEl = document.getElementById('journalIssueTitle');
    const descEl = document.getElementById('journalIssueDesc');

    const title = (titleEl?.value || '').trim();
    if (!title) { showToast('Add an issue title.', 'error'); return; }

    const issue_type = typeEl?.value || 'delay';
    const description = (descEl?.value || '').trim();

    const cu = window.getCurrentUser?.();
    try {
        await addDoc(collection(db, 'projects', currentProject.id, 'issues'), {
            issue_type,
            title,
            description,
            status: 'open',
            resolution_notes: null,
            resolved_at: null,
            resolved_by_uid: null,
            created_by_uid: cu?.uid ?? '',
            created_by_name: cu?.full_name || cu?.email || 'Unknown',
            created_at: serverTimestamp(),
        });
        showToast('Issue logged.', 'success');
        if (titleEl) titleEl.value = '';
        if (descEl) descEl.value = '';
        // onSnapshot listener re-renders automatically
    } catch (err) {
        console.error('[ProjectDetail/Journal] submitNewIssue failed:', err);
        showToast('Failed to log issue. Please try again.', 'error');
    }
}

// Resolve an open issue — requires resolution notes (D-11), auto-posts system Feed entry (D-12).
async function resolveIssue(issueId) {
    const notes = (window.prompt('Resolution notes (required):') || '').trim();
    if (!notes) { showToast('Resolution notes are required.', 'error'); return; }

    const cu = window.getCurrentUser?.();
    try {
        await updateDoc(doc(db, 'projects', currentProject.id, 'issues', issueId), {
            status: 'resolved',
            resolution_notes: notes,
            resolved_at: serverTimestamp(),
            resolved_by_uid: cu?.uid ?? '',
        });
        // D-12: auto-post system Feed entry
        const issue = journalIssues.find(i => i.id === issueId);
        if (issue) {
            const issueNum = _issueSeqNum(issueId);
            await _addActivityEntry(currentProject.id, {
                type: 'system',
                is_system: true,
                text: `Issue #${issueNum} (${escapeHTML(issue.issue_type)} — ${escapeHTML(issue.title)}) resolved by ${cu?.full_name || 'Unknown'}`,
            });
        }
        showToast('Issue resolved.', 'success');
    } catch (err) {
        console.error('[ProjectDetail/Journal] resolveIssue failed:', err);
        showToast('Failed to resolve issue. Please try again.', 'error');
    }
}

// Re-open a resolved issue — clears resolution fields, auto-posts system Feed entry (D-13).
async function reopenIssue(issueId) {
    const cu = window.getCurrentUser?.();
    try {
        await updateDoc(doc(db, 'projects', currentProject.id, 'issues', issueId), {
            status: 'open',
            resolution_notes: null,
            resolved_at: null,
            resolved_by_uid: null,
        });
        // D-13: auto-post system Feed entry
        const issueNum = _issueSeqNum(issueId);
        await _addActivityEntry(currentProject.id, {
            type: 'system',
            is_system: true,
            text: `Issue #${issueNum} re-opened by ${cu?.full_name || 'Unknown'}`,
        });
        showToast('Issue re-opened.', 'success');
    } catch (err) {
        console.error('[ProjectDetail/Journal] reopenIssue failed:', err);
        showToast('Failed to re-open issue. Please try again.', 'error');
    }
}

// Phase 101 — idempotent attach of all three journal subcollection listeners.
// Mirrors ensureBillingRequestsListener(): guarded against double-attach, torn down in destroy().
// All THREE listeners attach simultaneously so tab switching is pure DOM show/hide with zero
// listener churn — intentional D-18 deviation documented in 101-03-PLAN.md <notes>.
function ensureJournalListeners() {
    if (!currentProject?.id) return;
    const projectId = currentProject.id;

    if (!journalActivityUnsub) {
        journalActivityUnsub = onSnapshot(
            query(
                collection(db, 'projects', projectId, 'activity_entries'),
                orderBy('created_at', 'desc'),
                limit(50)
            ),
            (snap) => {
                journalActivityEntries = [];
                snap.forEach(d => journalActivityEntries.push({ id: d.id, ...d.data() }));
                _renderJournalPanelInPlace();
            },
            (err) => { console.error('[ProjectDetail/Journal] activity_entries snapshot error:', err); }
        );
    }

    if (!journalProgressUnsub) {
        journalProgressUnsub = onSnapshot(
            query(
                collection(db, 'projects', projectId, 'progress_updates'),
                orderBy('created_at', 'desc'),
                limit(50)
            ),
            (snap) => {
                journalProgressUpdates = [];
                snap.forEach(d => journalProgressUpdates.push({ id: d.id, ...d.data() }));
                _renderJournalPanelInPlace();
            },
            (err) => { console.error('[ProjectDetail/Journal] progress_updates snapshot error:', err); }
        );
    }

    if (!journalIssuesUnsub) {
        journalIssuesUnsub = onSnapshot(
            query(
                collection(db, 'projects', projectId, 'issues'),
                orderBy('created_at', 'desc'),
                limit(50)
            ),
            (snap) => {
                journalIssues = [];
                snap.forEach(d => journalIssues.push({ id: d.id, ...d.data() }));
                _renderJournalPanelInPlace();
            },
            (err) => { console.error('[ProjectDetail/Journal] issues snapshot error:', err); }
        );
    }
}

async function _attachDocumentToProject(projectId, fields) {
    _lcAttachPending = true;
    await updateDoc(doc(db, 'projects', projectId), { ...fields, updated_at: serverTimestamp() });
    const cu = window.getCurrentUser?.();
    await addProjectAuditEntry(projectId, 'DOCUMENT_ATTACHED', cu?.uid, cu?.full_name, JSON.stringify(Object.keys(fields)));
}

// Attach window functions
function attachWindowFunctions() {
    window.saveField = saveField;
    window.toggleActive = toggleActive;
    window.confirmDelete = confirmDelete;
    window.refreshExpense = refreshExpense;
    // Phase 99.1 D-16 — single always-refresh Full Breakdown entry (collapses the show/refresh split)
    window.openFullBreakdown = async () => {
        if (!currentProject) return;
        await refreshExpense(true);
        showExpenseBreakdownModal(currentProject.project_name, { mode: 'project' });
    };
    window.selectDetailPersonnel = selectDetailPersonnel;
    window.removeDetailPersonnel = removeDetailPersonnel;
    window.filterDetailPersonnel = filterDetailPersonnel;
    window.showDetailPersonnelDropdown = showDetailPersonnelDropdown;
    window.showEditHistory = () => currentProject && showEditHistoryModal(currentProject.id, currentProject.project_code);
    window.exportProjectExpenseCSV = exportProjectExpenseCSV;
    window.startCodeIssuance = startCodeIssuance;
    window.runCodeIssuance = runCodeIssuance;
    // Phase 87.1 D-05 — inline proposal card window functions
    window.openProposalModal = openProposalModal;
    window.openProposalInlineSubmitModal = openProposalInlineSubmitModal;
    window.closeProposalInlineSubmitModal = () => { document.getElementById('proposal-inline-submit-modal')?.remove(); };
    window.confirmProposalInlineSubmit = confirmProposalInlineSubmit;
    // Phase 87.3 D-01 — Start Proposal button support
    window.openCreateProposalModal = openCreateProposalModal;
    // Phase 99 — billing request flow
    window.openBillingRequestModal = openBillingRequestModal;
    window.submitBillingRequest = submitBillingRequest;
    window._onBillingTrancheChange = _onBillingTrancheChange;
    window._selectBillingType = _selectBillingType;
    window._validateBillingForm = _validateBillingForm;
    // Phase 101 — journal panel tab switching and post
    window.switchJournalTab = switchJournalTab;
    window.postActivityEntry = postActivityEntry;
    window.submitProgressUpdate = submitProgressUpdate;
    window.setIssueFilter = setIssueFilter;
    window.submitNewIssue = submitNewIssue;
    window.resolveIssue = resolveIssue;
    window.reopenIssue = reopenIssue;
    // Phase 100 — lifecycle accordion
    window.toggleLifecycleAccordion = toggleLifecycleAccordion;
    window.lcAttachLink = async function(which) {
        const dk = LC_DOC_KEYS[which];
        if (!dk || !currentProject) return;
        const el = document.getElementById('az' + dk.L + 'Link');
        const url = el ? el.value.trim() : '';
        if (!url || !/^https?:\/\//i.test(url)) {
            if (el) { el.style.borderColor = '#ef4444'; setTimeout(() => { el.style.borderColor = ''; }, 1400); }
            showToast('Please enter a valid https:// link.', 'error');
            return;
        }
        const prev = {
            [dk.prefix + '_url']:      currentProject[dk.prefix + '_url'],
            [dk.prefix + '_kind']:     currentProject[dk.prefix + '_kind'],
            [dk.prefix + '_filename']: currentProject[dk.prefix + '_filename'],
        };
        currentProject[dk.prefix + '_url'] = url;
        currentProject[dk.prefix + '_kind'] = 'link';
        currentProject[dk.prefix + '_filename'] = null;
        buildLifecycleBodyInPlace(currentProject, window.getCurrentUser?.() || null);
        try {
            await _attachDocumentToProject(currentProject.id, {
                [dk.prefix + '_url']: url,
                [dk.prefix + '_kind']: 'link',
                [dk.prefix + '_filename']: null,
            });
        } catch (err) {
            Object.assign(currentProject, prev);
            buildLifecycleBodyInPlace(currentProject, window.getCurrentUser?.() || null);
            showToast('Failed to save document. Please try again.', 'error');
        }
    };
    window.lcAttachFile = async function(which, filename) {
        const dk = LC_DOC_KEYS[which];
        if (!dk || !currentProject) return;
        const prev = {
            [dk.prefix + '_url']:      currentProject[dk.prefix + '_url'],
            [dk.prefix + '_kind']:     currentProject[dk.prefix + '_kind'],
            [dk.prefix + '_filename']: currentProject[dk.prefix + '_filename'],
        };
        currentProject[dk.prefix + '_url'] = filename;
        currentProject[dk.prefix + '_kind'] = 'file';
        currentProject[dk.prefix + '_filename'] = filename;
        buildLifecycleBodyInPlace(currentProject, window.getCurrentUser?.() || null);
        try {
            await _attachDocumentToProject(currentProject.id, {
                [dk.prefix + '_url']: filename,
                [dk.prefix + '_kind']: 'file',
                [dk.prefix + '_filename']: filename,
            });
        } catch (err) {
            Object.assign(currentProject, prev);
            buildLifecycleBodyInPlace(currentProject, window.getCurrentUser?.() || null);
            showToast('Failed to save document. Please try again.', 'error');
        }
    };
    window.lcRemoveDoc = async function(which) {
        const dk = LC_DOC_KEYS[which];
        if (!dk || !currentProject) return;
        const prev = {
            [dk.prefix + '_url']:      currentProject[dk.prefix + '_url'],
            [dk.prefix + '_kind']:     currentProject[dk.prefix + '_kind'],
            [dk.prefix + '_filename']: currentProject[dk.prefix + '_filename'],
        };
        currentProject[dk.prefix + '_url'] = null;
        currentProject[dk.prefix + '_kind'] = null;
        currentProject[dk.prefix + '_filename'] = null;
        buildLifecycleBodyInPlace(currentProject, window.getCurrentUser?.() || null);
        try {
            await _attachDocumentToProject(currentProject.id, {
                [dk.prefix + '_url']: null,
                [dk.prefix + '_kind']: null,
                [dk.prefix + '_filename']: null,
            });
        } catch (err) {
            Object.assign(currentProject, prev);
            buildLifecycleBodyInPlace(currentProject, window.getCurrentUser?.() || null);
            showToast('Failed to remove document. Please try again.', 'error');
        }
    };
    window.lcSwitchTab = function(L, tab) {
        const lp = document.getElementById('az' + L + 'LinkP');
        const fp = document.getElementById('az' + L + 'FileP');
        const lt = document.getElementById('az' + L + 'TabL');
        const ft = document.getElementById('az' + L + 'TabF');
        if (lp) lp.style.display = tab === 'link' ? '' : 'none';
        if (fp) fp.style.display = tab === 'file' ? '' : 'none';
        if (lt) lt.classList.toggle('active', tab === 'link');
        if (ft) ft.classList.toggle('active', tab === 'file');
    };
    // Phase 100 — lifecycle gate transitions
    window.lcAdvanceToForProposal = async function(projectId) {
        if (!currentProject || currentProject.id !== projectId) return;
        if (!currentProject.inspection_report_url) { showToast('Inspection report required.', 'error'); return; }
        const cu = window.getCurrentUser?.();
        if (!_canAdvanceProjectStatus(currentProject, cu, 'For Proposal')) { showToast('Permission denied.', 'error'); return; }
        try {
            await updateDoc(doc(db, 'projects', projectId), { project_status: 'For Proposal', updated_at: serverTimestamp() });
            await addProjectAuditEntry(projectId, 'ADVANCED_TO_FOR_PROPOSAL', cu?.uid, cu?.full_name, '');
        } catch (err) { console.error('[ProjectDetail] lcAdvanceToForProposal failed:', err); showToast('Failed to advance status.', 'error'); }
    };
    window.lcStartMobilization = async function(projectId) {
        if (!currentProject || currentProject.id !== projectId) return;
        if (!currentProject.ntp_document_url) { showToast('NTP or PO required.', 'error'); return; }
        const cu = window.getCurrentUser?.();
        if (!_canAdvanceProjectStatus(currentProject, cu, 'For Mobilization')) { showToast('Permission denied.', 'error'); return; }
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        try {
            await updateDoc(doc(db, 'projects', projectId), { project_status: 'For Mobilization', mobilization_started_at: now, updated_at: serverTimestamp() });
            await addProjectAuditEntry(projectId, 'MOBILIZATION_STARTED', cu?.uid, cu?.full_name, 'mobilization_started_at: ' + now);
        } catch (err) { console.error('[ProjectDetail] lcStartMobilization failed:', err); showToast('Failed to start mobilization.', 'error'); }
    };
    window.lcStartProject = async function(projectId) {
        if (!currentProject || currentProject.id !== projectId) return;
        const cu = window.getCurrentUser?.();
        if (!_canAdvanceProjectStatus(currentProject, cu, 'On-going')) { showToast('Permission denied.', 'error'); return; }
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        try {
            await updateDoc(doc(db, 'projects', projectId), { project_status: 'On-going', project_started_at: now, updated_at: serverTimestamp() });
            await addProjectAuditEntry(projectId, 'PROJECT_STARTED', cu?.uid, cu?.full_name, 'project_started_at: ' + now);
        } catch (err) { console.error('[ProjectDetail] lcStartProject failed:', err); showToast('Failed to start project.', 'error'); }
    };
    window.lcMarkProjectComplete = async function(projectId) {
        if (!currentProject || currentProject.id !== projectId) return;
        if (!currentProject.completion_report_url || !currentProject.certificate_of_completion_url) { showToast('Both Completion Report and COC required.', 'error'); return; }
        const cu = window.getCurrentUser?.();
        if (!_canAdvanceProjectStatus(currentProject, cu, 'Completed')) { showToast('Permission denied — you must be assigned to this project.', 'error'); return; }
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        try {
            await updateDoc(doc(db, 'projects', projectId), { project_status: 'Completed', project_completed_at: now, updated_at: serverTimestamp() });
            await addProjectAuditEntry(projectId, 'PROJECT_COMPLETED', cu?.uid, cu?.full_name, 'project_completed_at: ' + now);
        } catch (err) { console.error('[ProjectDetail] lcMarkProjectComplete failed:', err); showToast('Failed to mark project complete.', 'error'); }
    };
}

// Phase 86 — Project Plan summary card helpers (D-12 weighted-by-duration leaf-only rollup)

function computeProjectProgress(tasks) {
    const result = { taskCount: tasks.length, leafCount: 0, doneCount: 0, percentComplete: 0, health: 'on-track', overdueCount: 0, overdueMore: 0, overdueTasks: [], upcomingTasks: [], recentDone: null };
    if (tasks.length === 0) return result;

    const childrenByParent = new Map();
    tasks.forEach(t => {
        const key = t.parent_task_id || '__root__';
        if (!childrenByParent.has(key)) childrenByParent.set(key, []);
        childrenByParent.get(key).push(t);
    });

    const leaves = tasks.filter(t => !childrenByParent.has(t.task_id));
    result.leafCount = leaves.length;
    if (leaves.length === 0) return result;

    result.doneCount = leaves.filter(l => (l.progress ?? 0) >= 100).length;

    let weightedSum = 0, weightTotal = 0;
    leaves.forEach(l => {
        const dur = computeDurationDays(l.start_date, l.end_date);
        const p = typeof l.progress === 'number' ? l.progress : 0;
        weightedSum += p * dur;
        weightTotal += dur;
    });
    result.percentComplete = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;

    // Use local-day, not UTC — toISOString() shifts off-by-one in PHT before 08:00.
    const today = todayLocal();

    // Overdue leaf tasks
    const overdueFull = leaves
        .filter(t => t.end_date && t.end_date < today && (t.progress ?? 0) < 100)
        .sort((a, b) => a.end_date.localeCompare(b.end_date));
    result.overdueCount = overdueFull.length;
    result.overdueMore  = overdueFull.length > 2 ? overdueFull.length - 2 : 0;
    result.overdueTasks = overdueFull.slice(0, 2).map(t => ({
        name: t.name || t.task_id,
        daysLate: Math.max(1, Math.round((new Date(today) - new Date(t.end_date)) / 86400000)),
    }));

    result.health = result.overdueCount === 0 ? 'on-track' : result.overdueCount <= 2 ? 'at-risk' : 'behind';

    // Upcoming leaf tasks (next 2 by due date)
    result.upcomingTasks = leaves
        .filter(t => t.end_date && t.end_date >= today && (t.progress ?? 0) < 100)
        .sort((a, b) => a.end_date.localeCompare(b.end_date))
        .slice(0, 2)
        .map(t => ({
            name: t.name || t.task_id,
            end_date: t.end_date,
            daysUntil: Math.max(0, Math.round((new Date(t.end_date) - new Date(today)) / 86400000)),
            isMilestone: !!t.is_milestone,
        }));

    // Most recently completed leaf
    const done = leaves.filter(t => (t.progress ?? 0) >= 100).sort((a, b) => {
        const at = a.updated_at?.seconds || 0;
        const bt = b.updated_at?.seconds || 0;
        return bt - at;
    });
    if (done.length > 0) result.recentDone = done[0].name || done[0].task_id;

    return result;
}

function buildPlanCardHtml() {
    const p = currentProjectProgress;
    const planUrl = `#/projects/${encodeURIComponent(currentProject?.project_code || '')}/plan`;
    const openPlanBtn = `<a href="${planUrl}" class="btn btn-primary"${!currentProject?.project_code ? ' style="pointer-events:none;opacity:0.5;" title="No project code"' : ''}>Open Plan</a>`;

    // 023b — show which named iteration is active (absent in live mode or after auto-save)
    const iterStrip = currentIterationLabel
        ? `<div class="plan-iter-strip"><span class="iter-icon">⎇</span><span class="iter-label">On: ${escapeHTML(currentIterationLabel)}</span><a href="${planUrl}" class="iter-open-link">Open Plan →</a></div>`
        : '';

    if (p.taskCount === 0) {
        return `<div id="projectPlanCard" class="project-plan-card">
            <div class="plan-heading-new">Project Plan</div>
            ${iterStrip}
            <div style="padding:16px;">
                <div class="plan-empty-cta"><p>No tasks yet. Open the plan to get started.</p>${openPlanBtn}</div>
            </div>
        </div>`;
    }

    const pct = p.percentComplete;
    // 023a — use actual completed leaf count, not a derived estimate from weighted %
    const { doneCount, leafCount } = p;
    const progressBarHtml = `<div class="plan-progress-wrap">
        <div class="plan-progress-track"><div class="plan-progress-fill${pct === 100 ? ' complete' : ''}" style="width:${pct}%"></div></div>
        <div class="plan-progress-text"><span>${doneCount} of ${leafCount} tasks complete</span><span class="plan-pct">${pct}%</span></div>
    </div>`;

    if (pct === 100) {
        const completionBlock = `<div class="plan-completion-block">
            <div class="plan-completion-icon">✓</div>
            <div><div class="plan-completion-text">All tasks complete</div>${p.recentDone ? `<div class="plan-completion-sub">Last: ${escapeHTML(p.recentDone)}</div>` : ''}</div>
        </div>`;
        const footer = `<div class="plan-footer"><span class="plan-footer-count">${leafCount} tasks</span>${openPlanBtn}</div>`;
        return `<div id="projectPlanCard" class="project-plan-card">
            <div class="plan-heading-new">Project Plan</div>
            ${iterStrip}
            <div style="padding:16px;">${progressBarHtml}${completionBlock}${footer}</div>
        </div>`;
    }

    // Normal state — Combined (C): health badge + overdue pill + overdue detail + upcoming + last done
    const healthMeta = { 'on-track': { label: 'On Track', cls: 'on-track' }, 'at-risk': { label: 'At Risk', cls: 'at-risk' }, 'behind': { label: 'Behind', cls: 'behind' } };
    const hm = healthMeta[p.health] || healthMeta['on-track'];
    const overdueChip = p.overdueCount > 0 ? `<span class="plan-overdue-pill"><span class="pod-count">${p.overdueCount}</span> overdue</span>` : '';
    const topRow = `<div class="plan-combined-top"><span class="plan-health-badge ${hm.cls}"><span class="phb-dot"></span>${hm.label}</span>${overdueChip}</div>`;

    let overdueDetail = '';
    if (p.overdueTasks.length > 0) {
        const rows = p.overdueTasks.map(t => `<div class="plan-overdue-task-row"><span style="color:#ef4444;font-size:10px;flex-shrink:0;">!</span><span class="plan-overdue-name">${escapeHTML(t.name)}</span><span class="plan-overdue-age">${t.daysLate}d late</span></div>`).join('');
        const more = p.overdueMore > 0 ? `<div class="plan-overdue-more">+${p.overdueMore} more</div>` : '';
        overdueDetail = `<div class="plan-overdue-section">${rows}${more}</div>`;
    }

    let upcomingHtml = '';
    if (p.upcomingTasks.length > 0) {
        const rows = p.upcomingTasks.map(t => {
            const rel = t.daysUntil === 0 ? 'today' : t.daysUntil === 1 ? 'tomorrow' : `in ${t.daysUntil}d`;
            const rc  = t.daysUntil <= 3 ? 'very-soon' : t.daysUntil <= 7 ? 'soon' : '';
            const d   = new Date(t.end_date + 'T00:00:00');
            const dateStr = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
            return `<div class="plan-upcoming-row">
                <span class="pup-icon" style="color:${t.isMilestone ? '#1a73e8' : '#94a3b8'}">${t.isMilestone ? '◆' : '○'}</span>
                <span class="pup-name">${escapeHTML(t.name)}</span>
                <span class="pup-due"><span class="pup-date">${escapeHTML(dateStr)}</span><span class="pup-rel ${rc}">${rel}</span></span>
            </div>`;
        }).join('');
        upcomingHtml = `<div class="plan-upcoming-section"><div class="plan-section-lbl">Next Up</div>${rows}</div>`;
    } else if (p.overdueCount === 0) {
        upcomingHtml = `<div class="plan-no-dates-hint">Set due dates in the plan to see what's coming up.</div>`;
    }

    const lastDone = p.recentDone ? `<div class="plan-last-done"><div class="plan-last-done-lbl">Last completed</div><div class="plan-last-done-val">${escapeHTML(p.recentDone)}</div></div>` : '';
    const footer   = `<div class="plan-footer"><span class="plan-footer-count">${leafCount} tasks</span>${openPlanBtn}</div>`;

    return `<div id="projectPlanCard" class="project-plan-card">
        <div class="plan-heading-new">Project Plan</div>
        ${iterStrip}
        <div style="padding:16px;">${progressBarHtml}${topRow}${overdueDetail}${upcomingHtml}${lastDone}${footer}</div>
    </div>`;
}

function computeDurationDays(startDate, endDate) {
    if (!startDate || !endDate) return 1;
    const s = new Date(startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(endDate); e.setHours(0, 0, 0, 0);
    const days = Math.round((e - s) / 86400000) + 1;
    return Math.max(1, days);
}

function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
