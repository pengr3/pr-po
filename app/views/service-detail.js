/* ========================================
   SERVICE DETAIL VIEW
   Full-page service detail with inline editing,
   personnel assignment pills, and expense stub
   ======================================== */

import { db, collection, doc, getDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, getAggregateFromServer, sum, count, addDoc, serverTimestamp, orderBy, limit, arrayUnion } from '../firebase.js';
import { formatCurrency, formatDate, showLoading, showToast, normalizePersonnel, syncServicePersonnelToAssignments, getAssignedServiceCodes, downloadCSV, escapeHTML, getRFPFees } from '../utils.js';
import { recordEditHistory, showEditHistoryModal } from '../edit-history.js';
import { showExpenseBreakdownModal } from '../expense-modal.js';
import { createNotificationForUsers, createNotificationForRoles, NOTIFICATION_TYPES } from '../notifications.js';
// Phase 87.1 D-05 — inline proposal card
import { _applyProposalStateTransition } from './proposals.js';
import { openProposalModal, openCreateProposalModal } from '../proposal-modal.js';

let currentService = null;
let currentServiceDocId = null;
let serviceParam = null;
let clientsData = [];
let usersData = [];
let selectedDetailPersonnel = []; // Array of { id: string, name: string } for pill state
let listener = null;
let usersListenerUnsub = null;
let personnelClickOutsideHandler = null;
let currentServiceExpense = { mrfCount: 0, prTotal: 0, prCount: 0, poTotal: 0, poCount: 0, rfpFeesTotal: 0, totalPaid: 0, remainingPayable: 0, hasRfps: false };
// Phase 85 D-06 / D-01: collectibles aggregation alongside currentServiceExpense (mirror of project-detail.js currentCollectibles)
let currentServiceCollectibles = { totalRequested: 0, totalCollected: 0, remainingCollectible: 0 };

// Phase 99.1 (Phase 99 port) — own billing requests for THIS service (own-requests status list)
let currentBillingRequests = [];
let billingRequestsListenerUnsub = null;
// Phase 99.1 — billing-request modal selected type (auto-hinted, overrideable)
let billingSelectedType = 'progress';
// Phase 99.1 D-12 — raw collectible docs (per-tranche, with payment_records) for lifecycle derivation.
// Distinct name from currentServiceCollectibles (the AGGREGATE object above).
let currentCollectibleDocs = [];
let collectiblesListenerUnsub = null;

// Phase 104 — Activity Journal state (mirror project-detail.js Phase 101)
let journalActivityUnsub = null;
let journalProgressUnsub = null;
let journalIssuesUnsub = null;
let journalActivityEntries = [];
let journalProgressUpdates = [];
let journalIssues = [];
let _activeJournalTab = 'activity';
let journalIssueFilter = 'all';
let journalProgressFormOpen = false;
let journalIssueFormOpen = false;
let journalResolvingIssueId = null;
let journalSelectedTag = 'update';
let journalEditingProgressId = null;

// Phase 104 — Lifecycle accordion state (mirror project-detail.js Phase 100)
let _lcOpen = false;
let _lcAttachPending = false;

// Phase 104 — inline tranche editor state (mirror project-detail.js Phase 102)
let editorTranches = [];
let trancheEditorOpen = false;

// Phase 105 — Service Plan summary card (mirror project-detail.js Phase 86 / D-01)
let currentTasks = [];
let currentTasksListenerUnsub = null;
let currentServiceProgress = { taskCount: 0, leafCount: 0, doneCount: 0, percentComplete: 0, health: 'on-track', overdueCount: 0, overdueMore: 0, overdueTasks: [], upcomingTasks: [], recentDone: null };

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

// Render loading skeleton — actual content renders after init() loads data
export function render(activeTab = null, param = null) {
    serviceParam = param;
    return `
        <div id="serviceDetailContainer">
            <div class="container" style="margin-top: 2rem;">
                <div class="card">
                    <div class="card-body" style="text-align: center; padding: 3rem;">
                        <p style="color: #64748b;">Loading service details...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Initialize view
export async function init(activeTab = null, param = null) {
    serviceParam = param || serviceParam;
    attachWindowFunctions();

    // Click-outside handler to close personnel dropdown
    personnelClickOutsideHandler = (e) => {
        const container = document.getElementById('serviceDetailPillContainer');
        const dropdown = document.getElementById('serviceDetailPersonnelDropdown');
        if (dropdown && container && !container.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    };
    document.addEventListener('mousedown', personnelClickOutsideHandler);

    // Listen for permission changes and re-render
    if (window._serviceDetailPermissionHandler) {
        window.removeEventListener('permissionsChanged', window._serviceDetailPermissionHandler);
    }
    const permissionChangeHandler = () => {
        renderServiceDetail();
    };
    window.addEventListener('permissionsChanged', permissionChangeHandler);
    window._serviceDetailPermissionHandler = permissionChangeHandler;

    // Re-check access when assignments change
    if (window._serviceDetailAssignmentHandler) {
        window.removeEventListener('assignmentsChanged', window._serviceDetailAssignmentHandler);
    }
    const assignmentChangeHandler = () => {
        if (currentService) {
            checkServiceAccess();
        }
    };
    window.addEventListener('assignmentsChanged', assignmentChangeHandler);
    window._serviceDetailAssignmentHandler = assignmentChangeHandler;

    // Debug fix (service-detail-header-journal) — tear down per-service listeners on re-init.
    // Router isSameView skips destroy() on service→service navigation; without this the prior
    // service's orphaned onSnapshot keeps firing and overwrites currentService with stale (e.g.
    // Completed) data — wrongly hiding the journal composer — while the idempotent journal guards
    // (ensureServiceJournalListeners) stay latched to the old service so the new service's journal
    // never loads ("No entries yet"). Mirrors project-detail.js init() teardown.
    if (listener) { try { listener(); } catch (e) {} listener = null; }
    if (usersListenerUnsub) { try { usersListenerUnsub(); } catch (e) {} usersListenerUnsub = null; }
    if (billingRequestsListenerUnsub) { try { billingRequestsListenerUnsub(); } catch (e) {} billingRequestsListenerUnsub = null; }
    if (collectiblesListenerUnsub) { try { collectiblesListenerUnsub(); } catch (e) {} collectiblesListenerUnsub = null; }
    if (journalActivityUnsub) { try { journalActivityUnsub(); } catch (e) {} journalActivityUnsub = null; }
    if (journalProgressUnsub) { try { journalProgressUnsub(); } catch (e) {} journalProgressUnsub = null; }
    if (journalIssuesUnsub) { try { journalIssuesUnsub(); } catch (e) {} journalIssuesUnsub = null; }
    // Phase 105 — tasks listener teardown (same-view re-init — router skips destroy on service→service nav)
    if (currentTasksListenerUnsub) { try { currentTasksListenerUnsub(); } catch (e) {} currentTasksListenerUnsub = null; }
    currentTasks = [];
    journalActivityEntries = [];
    journalProgressUpdates = [];
    journalIssues = [];
    currentBillingRequests = [];
    currentCollectibleDocs = [];
    currentService = null;

    if (!serviceParam) {
        document.getElementById('serviceDetailContainer').innerHTML = `
            <div class="container" style="margin-top: 2rem;">
                <div class="card">
                    <div class="card-body">
                        <p>No service specified.</p>
                        <a href="#/services" class="btn btn-primary">Back to Services</a>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    // Load active users for personnel datalist — only needed for admin roles that can edit personnel
    const currentUser = window.getCurrentUser?.();
    if (currentUser?.role === 'services_admin' || currentUser?.role === 'super_admin') {
        const usersQuery = query(collection(db, 'users'), where('status', '==', 'active'));
        usersListenerUnsub = onSnapshot(usersQuery,
            (snapshot) => {
                usersData = [];
                snapshot.forEach(d => {
                    const data = d.data();
                    usersData.push({
                        id: d.id,
                        full_name: data.full_name || '',
                        email: data.email || ''
                    });
                });
                usersData.sort((a, b) => a.full_name.localeCompare(b.full_name));
            },
            (error) => { console.error('[ServiceDetail] Users listener error:', error.message); }
        );
    }

    // Find service by service_code field
    const q = query(collection(db, 'services'), where('service_code', '==', serviceParam));
    listener = onSnapshot(q,
        async (snapshot) => {
            if (snapshot.empty) {
                document.getElementById('serviceDetailContainer').innerHTML = `
                    <div class="container" style="margin-top: 2rem;">
                        <div class="card">
                            <div class="card-body">
                                <p>Service not found.</p>
                                <a href="#/services" class="btn btn-primary">Back to Services</a>
                            </div>
                        </div>
                    </div>
                `;
                return;
            }

            const docSnap = snapshot.docs[0];
            currentServiceDocId = docSnap.id;
            currentService = { id: docSnap.id, ...docSnap.data() };

            if (!checkServiceAccess()) return;

            // Phase 99.1 — own billing-requests + raw collectibles listeners (idempotent, scoped to service_code)
            ensureServiceBillingRequestsListener();
            ensureServiceCollectiblesListener();
            // Phase 104 — attach the journal listeners only on visible statuses (D-11)
            if (['For Mobilization', 'On-going', 'Completed'].includes(currentService?.project_status)) ensureServiceJournalListeners();
            // Phase 105 — service_tasks onSnapshot feeding the Service Plan summary card (D-01)
            ensureTasksListener();

            // Phase 104 — attach-triggered snapshot: rebuild only the accordion body in place (no full re-render / flicker)
            if (_lcAttachPending) {
                _lcAttachPending = false;
                buildServiceLifecycleBodyInPlace(currentService, window.getCurrentUser?.() || null);
                return;
            }

            await refreshServiceExpense(true);
            // Note: refreshServiceExpense() calls renderServiceDetail() on success.
            // On error it catches silently — currentServiceExpense retains last known values.
        },
        (error) => {
            console.error('[ServiceDetail] Services listener error:', error.message);
            if (error.code === 'permission-denied') {
                const container = document.getElementById('serviceDetailContainer');
                if (container) container.innerHTML = `
                    <div class="container" style="margin-top: 2rem;">
                        <div class="card">
                            <div class="card-body">
                                <div class="empty-state">
                                    <div class="empty-state-icon">🔒</div>
                                    <h3>Access Denied</h3>
                                    <p>You do not have permission to view this service.</p>
                                    <a href="#/services" class="btn btn-primary" style="margin-top: 1rem;">Back to Services</a>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
    );
}

// Cleanup
export async function destroy() {
    if (window._serviceDetailPermissionHandler) {
        window.removeEventListener('permissionsChanged', window._serviceDetailPermissionHandler);
        delete window._serviceDetailPermissionHandler;
    }

    if (window._serviceDetailAssignmentHandler) {
        window.removeEventListener('assignmentsChanged', window._serviceDetailAssignmentHandler);
        delete window._serviceDetailAssignmentHandler;
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
    clientsData = [];

    if (personnelClickOutsideHandler) {
        document.removeEventListener('mousedown', personnelClickOutsideHandler);
        personnelClickOutsideHandler = null;
    }
    selectedDetailPersonnel = [];
    currentServiceExpense = { mrfCount: 0, prTotal: 0, prCount: 0, poTotal: 0, poCount: 0, rfpFeesTotal: 0, totalPaid: 0, remainingPayable: 0, hasRfps: false };
    // Phase 85 D-06: reset collectibles state alongside currentServiceExpense
    currentServiceCollectibles = { totalRequested: 0, totalCollected: 0, remainingCollectible: 0 };

    // Phase 99.1 — billing-requests + raw collectibles listener teardown
    if (billingRequestsListenerUnsub) { try { billingRequestsListenerUnsub(); } catch (e) { /* swallow */ } }
    billingRequestsListenerUnsub = null;
    currentBillingRequests = [];
    billingSelectedType = 'progress';
    if (collectiblesListenerUnsub) { try { collectiblesListenerUnsub(); } catch (e) { /* swallow */ } }
    collectiblesListenerUnsub = null;
    currentCollectibleDocs = [];

    // Phase 104 — Activity Journal listener teardown + UI-state reset
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
    journalProgressFormOpen = false;
    journalIssueFormOpen = false;
    journalResolvingIssueId = null;
    journalSelectedTag = 'update';
    journalEditingProgressId = null;

    // Phase 105 — tasks listener teardown
    if (currentTasksListenerUnsub) { try { currentTasksListenerUnsub(); } catch (e) { /* swallow */ } }
    currentTasksListenerUnsub = null;
    currentTasks = [];

    currentService = null;
    currentServiceDocId = null;
    serviceParam = null;

    delete window.saveServiceField;
    delete window.toggleServiceDetailActive;
    delete window.selectDetailServicePersonnel;
    delete window.removeDetailServicePersonnel;
    delete window.filterDetailServicePersonnelDropdown;
    delete window.showDetailServicePersonnelDropdown;
    delete window.refreshServiceExpense;
    delete window.showEditHistory;
    delete window.exportServiceExpenseCSV;
    // Phase 87.1 D-05 — inline proposal card window functions cleanup
    delete window.openProposalModal;
    delete window.openProposalInlineSubmitModal;
    delete window.closeProposalInlineSubmitModal;
    delete window.confirmProposalInlineSubmit;
    // Phase 87.3 D-01 — Start Proposal window functions cleanup
    delete window.openCreateProposalModal;
    delete window._startProposalCallback;
    document.getElementById('proposal-inline-submit-modal')?.remove();
    // Phase 99.1 — billing modal cleanup
    delete window.openBillingRequestModal;
    delete window.submitBillingRequest;
    delete window._onBillingTrancheChange;
    delete window._selectBillingType;
    delete window._validateBillingForm;
    document.getElementById('billingRequestModal')?.remove();
    delete window.openServiceFullBreakdown;
    // Phase 104 — Activity Journal window-fn teardown (Task 1: 3 handlers)
    delete window.switchJournalTab;
    delete window.selectJournalTag;
    delete window.postActivityEntry;
    // Phase 104 — Activity Journal window-fn teardown (Task 2: 12 handlers)
    delete window.submitProgressUpdate;
    delete window.editProgressUpdate;
    delete window.cancelEditProgressUpdate;
    delete window.saveEditProgressUpdate;
    delete window.setIssueFilter;
    delete window.submitNewIssue;
    delete window.resolveIssue;
    delete window.reopenIssue;
    delete window.toggleProgressForm;
    delete window.toggleIssueForm;
    delete window.showResolveForm;
    delete window.cancelResolveForm;
    // Phase 104 — Lifecycle accordion window-fn teardown (9 handlers) + state reset
    delete window.toggleServiceLifecycleAccordion;
    delete window.lcServiceAttachLink;
    delete window.lcServiceAttachFile;
    delete window.lcRemoveServiceDoc;
    delete window.lcServiceSwitchTab;
    delete window.lcAdvanceServiceToForProposal;
    delete window.lcStartServiceMobilization;
    delete window.lcStartService;
    delete window.lcMarkServiceComplete;
    // PVD-LOSS-01 — Mark as Loss teardown
    delete window.openServiceLossModal;
    delete window.submitServiceLoss;
    document.getElementById('serviceLossModal')?.remove();
    _lcOpen = false;
    _lcAttachPending = false;
    // Phase 104 — tranche editor + Record Release window-fn teardown (9 handlers) + state reset
    delete window.toggleTrancheEditor;
    delete window.updateEditorTrancheLabel;
    delete window.updateEditorTranchePercentage;
    delete window.addEditorTrancheRow;
    delete window.removeEditorTrancheRow;
    delete window.toggleTrancheRetention;
    delete window.saveTrancheEditor;
    delete window.cancelTrancheEditor;
    delete window.recordServiceRetentionRelease;
    editorTranches = [];
    trancheEditorOpen = false;
}

// Phase 105 — idempotent attach of service_tasks listener. Re-renders the Service Plan card in-place.
// Mirrors project-detail.js ensureTasksListener (Phase 86). Torn down in BOTH init() re-init block
// (router skips destroy on service→service nav) AND destroy() (normal teardown).
function ensureTasksListener() {
    if (currentTasksListenerUnsub) return;
    if (!currentService || !currentService.id) return;
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
        (err) => console.error('[ServiceDetail/ServiceTasks] snapshot error:', err)
    );
}

// Phase 99.1 (Phase 99 port) — idempotent attach of the own billing-requests listener.
// Scoped to currentService.service_code; re-renders the detail on change; torn down in destroy().
function ensureServiceBillingRequestsListener() {
    if (billingRequestsListenerUnsub) return;
    const code = currentService?.service_code;
    if (!code) return; // no service_code → no scoped own-requests list
    billingRequestsListenerUnsub = onSnapshot(
        query(collection(db, 'billing_requests'), where('service_code', '==', code)),
        (snap) => {
            currentBillingRequests = [];
            snap.forEach(d => currentBillingRequests.push({ id: d.id, ...d.data() }));
            if (currentService) renderServiceDetail();
        },
        (err) => console.error('[ServiceDetail/BillingReq] snapshot error:', err)
    );
}

// Phase 99.1 D-12 — idempotent attach of the raw-collectibles listener (per-tranche docs with
// payment_records, for lifecycle-stage derivation). Mirrors ensureServiceBillingRequestsListener.
function ensureServiceCollectiblesListener() {
    if (collectiblesListenerUnsub) return;
    const code = currentService?.service_code;
    if (!code) return;
    collectiblesListenerUnsub = onSnapshot(
        query(collection(db, 'collectibles'), where('service_code', '==', code)),
        (snap) => {
            currentCollectibleDocs = [];
            snap.forEach(d => currentCollectibleDocs.push({ id: d.id, ...d.data() }));
            if (currentService) renderServiceDetail();
        },
        (err) => console.error('[ServiceDetail/Collectibles] snapshot error:', err)
    );
}

// Phase 99.1 D-07/D-13 — single source of truth for a tranche's lifecycle stage + cash %
// (copied verbatim from project-detail.js — independent copy, no shared module for these views).
// Cross-references a tranche against its billing_request and collectible doc (matched by
// tranche_index, the in-page D-05 key) using the CANONICAL voided-excluded cash formula.
// Returns { stage, badgeLabel, badgeColor, opacity, pct, totalPaid, amountRequested, note }.
function computeTrancheLifecycle(tranche, idx, billingReqs, collectibleDocs) {
    const br = (Array.isArray(billingReqs) ? billingReqs : []).find(r => r.tranche_index === idx);
    const coll = (Array.isArray(collectibleDocs) ? collectibleDocs : []).find(c => c.tranche_index === idx);
    const amountRequested = coll ? (parseFloat(coll.amount_requested) || 0) : 0;
    const totalPaid = coll
        ? (coll.payment_records || [])
            .filter(r => r.status !== 'voided')
            .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
        : 0;
    const pct = amountRequested > 0 ? Math.round((totalPaid / amountRequested) * 100) : 0;
    const status = br ? br.status : null;

    if (!br && !coll) {
        return { stage: 'not-filed', badgeLabel: '— Not Filed', badgeColor: '#94a3b8', opacity: 0.45, pct: 0, totalPaid: 0, amountRequested: 0, note: '' };
    }
    if (status === 'pending') {
        return { stage: 'pending', badgeLabel: 'Pending Review', badgeColor: '#f59e0b', opacity: 1, pct, totalPaid, amountRequested, note: '' };
    }
    if (status === 'rejected') {
        return { stage: 'rejected', badgeLabel: 'Rejected', badgeColor: '#ef4444', opacity: 1, pct, totalPaid, amountRequested, note: '' };
    }
    if (!coll) {
        return { stage: 'approved-not-invoiced', badgeLabel: 'Approved — Not Yet Invoiced', badgeColor: '#4f46e5', opacity: 1, pct: 0, totalPaid: 0, amountRequested: 0, note: '' };
    }
    if (pct >= 100) {
        return { stage: 'fully-collected', badgeLabel: 'Fully Collected ✓', badgeColor: '#059669', opacity: 1, pct, totalPaid, amountRequested, note: '' };
    }
    if (pct > 0) {
        return { stage: 'collecting', badgeLabel: 'Billed / Collecting', badgeColor: '#0d9488', opacity: 1, pct, totalPaid, amountRequested, note: `₱${formatCurrency(totalPaid)} of ₱${formatCurrency(amountRequested)} · ${pct}%` };
    }
    return { stage: 'invoiced-awaiting', badgeLabel: 'Invoiced — Awaiting Payment', badgeColor: '#0d9488', opacity: 1, pct: 0, totalPaid, amountRequested, note: '' };
}

/* ========================================
   Phase 99.1 — Service Billing Request modal (Phase 99 port to services)
   tranche picker → type pills → doc-link fields → notes → submit.
   Mirrors project-detail.js; adapted to the service shape (currentService, service_code).
   ======================================== */

// Doc requirements by billing type (D-08) — verbatim from project-detail.js.
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
    if (!currentService) return;
    // EDGE GUARD: need tranches + a positive contract_cost.
    const tranches = Array.isArray(currentService.collection_tranches) ? currentService.collection_tranches : [];
    const contractCost = parseFloat(currentService.contract_cost) || 0;
    if (tranches.length === 0 || contractCost <= 0) {
        showToast('Set up collection tranches and a contract cost on this service before initiating billing.', 'error');
        return;
    }

    // Tranches that already have a pending or approved billing request cannot be re-submitted.
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

    _onBillingTrancheChange();
}

function _onBillingTrancheChange() {
    const sel = document.getElementById('billingTranche');
    const idx = sel ? parseInt(sel.value, 10) : NaN;
    const tranches = Array.isArray(currentService?.collection_tranches) ? currentService.collection_tranches : [];
    const hint = _hintBillingType(tranches[idx]?.label);
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

// Phase 99.1 D-22 — write the frozen billing_requests doc carrying department:'services' + fire-and-forget Finance notification.
async function submitBillingRequest() {
    if (!currentService) return;
    const errEl = document.getElementById('billingError');
    const showErr = (msg) => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };

    const trancheSel = document.getElementById('billingTranche');
    const trancheIndex = trancheSel ? parseInt(trancheSel.value, 10) : NaN;
    const tranches = Array.isArray(currentService.collection_tranches) ? currentService.collection_tranches : [];
    const tranche = tranches[trancheIndex];
    if (!tranche || isNaN(trancheIndex)) { showErr('Select a tranche first.'); return; }

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

    // Amount math (D-22) — advisory, sourced from currentService.
    const contractCost = parseFloat(currentService.contract_cost) || 0;
    const tranchePct = parseFloat(tranche.percentage) || 0;
    const amountRequested = (tranchePct / 100) * contractCost;

    // Double-submit guard.
    const submitBtn = document.getElementById('billingSubmitBtn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.5'; submitBtn.style.cursor = 'not-allowed'; }

    try {
        await addDoc(collection(db, 'billing_requests'), {
            department: 'services',                  // D-22 discriminator
            service_code: currentService.service_code || '',
            service_name: currentService.service_name || '',
            tranche_index: trancheIndex,
            tranche_label: tranche.label,            // FROZEN
            tranche_percentage: tranchePct,          // FROZEN
            amount_requested: amountRequested,       // FROZEN (advisory; Finance re-derives at approval)
            billing_type: billingSelectedType,       // 'progress' | 'completion' | 'other'
            documents,                               // [{ key, label, url }]
            notes,                                   // optional string
            status: 'pending',                       // lowercase exact
            requested_by_uid: window.getCurrentUser?.()?.uid ?? null,
            requested_by_name: window.getCurrentUser?.()?.full_name || window.getCurrentUser?.()?.email || 'Unknown User',
            requested_at: serverTimestamp()
        });
    } catch (e) {
        console.error('[ServiceDetail/BillingReq] submit addDoc failed:', e);
        showErr('Failed to submit billing request. Please try again.');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; submitBtn.style.cursor = 'pointer'; }
        return;
    }

    // Success — remove modal; the own-requests listener auto-refreshes the status list.
    document.getElementById('billingRequestModal')?.remove();
    showToast('Billing request submitted to Finance.', 'success');

    // Fire-and-forget Finance fan-out (D-24 — its OWN try/catch; a notification failure must
    // NEVER undo the already-committed addDoc).
    try {
        await createNotificationForRoles({
            roles: ['finance'],
            type: NOTIFICATION_TYPES.BILLING_REQUEST_SUBMITTED,
            message: `New billing request: ${currentService.service_name} (${tranche.label}, PHP ${formatCurrency(amountRequested)})`,
            link: '#/finance/collectibles',
            source_collection: 'billing_requests',
            source_id: currentService.service_code || '',
            object_name: currentService.service_name || '',
            actor_name: window.getCurrentUser?.()?.full_name || 'System'
        });
    } catch (notifErr) {
        console.error('[ServiceDetail/BillingReq] BILLING_REQUEST_SUBMITTED notification failed:', notifErr);
    }
}

// Phase 99.1 D-06..D-09 — per-tranche lifecycle rows for services (mirror of project-detail.js
// renderTrancheLifecycleRows). Iterates EVERY collection_tranche; unfiled → 45% opacity + dashed
// badge (D-08); collecting → "₱X of ₱Y · Z%" note (D-09). All user strings escaped (D-19).
// Includes the "↑ Initiate Billing →" entry (D-11 — new on services) at footer right.
function renderServiceTrancheLifecycle() {
    const tranches = Array.isArray(currentService?.collection_tranches) ? currentService.collection_tranches : [];
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
        return `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;padding:0.3rem 0;border-top:1px solid #f1f5f9;opacity:${lc.opacity};">
            <div style="font-size:0.8rem;color:#475569;font-weight:600;">${escapeHTML(tranche.label || ('Tranche ' + (i + 1)))}${reason}${note}</div>
            <span style="font-size:0.65rem;font-weight:700;${badgeStyle}border-radius:999px;padding:0.15rem 0.6rem;white-space:nowrap;">${escapeHTML(lc.badgeLabel)}</span>
        </div>`;
    }).join('');
    return `
        <div style="margin-top:1rem;border-top:1px solid #e2e8f0;padding-top:0.75rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.35rem;">
                <div style="font-size:0.7rem;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.06em;">Collection Lifecycle</div>
                <span onclick="window.openBillingRequestModal()" style="cursor:pointer;color:#1a73e8;font-size:0.8rem;font-weight:700;user-select:none;">↑ Initiate Billing →</span>
            </div>
            ${tranches.length === 0 ? '<div style="font-size:0.72rem;color:#94a3b8;">No collection tranches set up yet.</div>' : rows}
        </div>`;
}

/**
 * Check if the current user has access to the current service.
 * For services_user without all_services, the service must be in assigned_service_codes.
 * Returns true if access is allowed, false and renders access denied if denied.
 */
function checkServiceAccess() {
    const assignedCodes = window.getAssignedServiceCodes?.();

    // null means no filtering — all roles except scoped services_user
    if (assignedCodes === null) return true;

    // If current service has no service_code (edge case), allow defensively
    if (!currentService?.service_code) return true;

    // Check if this service is in the assigned set
    if (assignedCodes.includes(currentService.service_code)) return true;

    // Access denied — render message in place
    const container = document.getElementById('serviceDetailContainer');
    if (container) {
        container.innerHTML = `
            <div class="container" style="margin-top: 2rem;">
                <div class="card">
                    <div class="card-body">
                        <div class="empty-state">
                            <div class="empty-state-icon">🔒</div>
                            <h3>Access Denied</h3>
                            <p>You do not have access to this service.</p>
                            <p style="color: #64748b; font-size: 0.875rem;">This service has been removed from your assigned services.</p>
                            <a href="#/services" class="btn btn-primary" style="margin-top: 1rem;">Back to Services</a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else {
        window.location.hash = '#/services';
    }
    return false;
}

// Render service detail — 3-card layout
function renderServiceDetail() {
    const container = document.getElementById('serviceDetailContainer');
    if (!container || !currentService) return;

    const canEdit = window.canEditTab?.('services');
    const showEditControls = canEdit === true;

    // Personnel editing restricted to super_admin and services_admin only
    const user = window.getCurrentUser?.();
    const canEditPersonnel = showEditControls && (user?.role === 'super_admin' || user?.role === 'services_admin');

    // Quick 260627-kg0 follow-up: the view-only banner must reflect ACTUAL per-service capability,
    // not the blanket services.edit tab flag. An assigned member (uid in personnel_user_ids) can
    // drive this service's lifecycle/proposals even when canEditTab('services') is false — so they
    // are NOT view-only. Show the banner only for users with no write path to THIS service.
    const _isAssignedServiceMember = !!user?.uid && Array.isArray(currentService.personnel_user_ids)
        && currentService.personnel_user_ids.includes(user.uid);
    const isServiceViewOnly = canEdit === false && !_isAssignedServiceMember;

    const focusedField = document.activeElement?.dataset?.field;

    // ----- Phase 87.3 D-07: proposalInlineCard always rendered; loadProposalCard handles all branching -----
    const proposalCardHtml = '<div id="proposalInlineCard"></div>';
    // Phase 105 — Service Plan summary card (D-01)
    const planCardHtml = buildServicePlanCardHtml();

    container.innerHTML = `
        <div class="container" style="margin-top: 1rem;">
            ${isServiceViewOnly ? `
                <div class="view-only-notice">
                    <span class="notice-icon">👁</span>
                    <span>You have view-only access to this section.</span>
                </div>
            ` : ''}

            <!-- Header strip: badge · code · status · actions (Phase 104 parity — mirrors project-detail.js:622-640) -->
            <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.75rem;">
                <span class="status-badge ${currentService.active ? 'approved' : 'rejected'}"
                      style="cursor:${showEditControls ? 'pointer' : 'default'};font-size:0.8rem;padding:0.35rem 0.75rem;transition:all 0.2s;"
                      ${showEditControls ? `onclick="window.toggleServiceDetailActive(${!currentService.active})"` : ''}>
                    ${currentService.active ? '✓ Active' : '✗ Inactive'}
                </span>
                <span style="color:#cbd5e1;">·</span>
                <span style="font-family:monospace;font-size:0.82rem;font-weight:700;color:#64748b;">${escapeHTML(currentService.service_code || '—')}</span>
                <span style="color:#cbd5e1;">·</span>
                ${(() => {
                    const _curStatus = currentService.project_status || '';
                    const _isLegacy = _curStatus && !UNIFIED_STATUS_OPTIONS.includes(_curStatus);
                    // The status dropdown is a remediation escape-hatch for LEGACY data ONLY.
                    // Canonical-status services keep the read-only badge and advance through the
                    // proper lifecycle gates; once a legacy service is re-staged it falls back here.
                    if (showEditControls && _isLegacy) {
                        const _opts = UNIFIED_STATUS_OPTIONS.map(s => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join('');
                        const _legacyOpt = `<option value="${escapeHTML(_curStatus)}" selected>${escapeHTML(_curStatus)} (legacy)</option>`;
                        return `<select id="hdrServiceStatusSelect" onchange="window.saveServiceField('project_status', this.value)" style="font-size:0.82rem;padding:0.3rem 0.5rem;border-radius:8px;border:1px solid #cbd5e1;background:white;color:#1e293b;font-weight:600;cursor:pointer;">${_legacyOpt}${_opts}</select>`;
                    }
                    return `<span id="hdrServiceStatusBadge" class="hdr-status" style="background:${_getServiceStatusColor(_curStatus)};color:white;padding:0.3rem 0.85rem;border-radius:20px;font-size:0.82rem;font-weight:600;">${escapeHTML(_curStatus || '—')}</span>`;
                })()}
                <span style="flex:1;"></span>
                <button class="btn btn-sm btn-secondary" onclick="window.showEditHistory()" style="white-space:nowrap;">Edit History</button>
                <button class="btn btn-sm btn-secondary" onclick="window.exportServiceExpenseCSV()"
                        style="display:flex;align-items:center;gap:0.35rem;${currentServiceExpense.poCount === 0 ? 'opacity:0.45;pointer-events:none;cursor:default;' : ''}"
                        ${currentServiceExpense.poCount === 0 ? 'disabled' : ''}>
                    &#8681; Export CSV
                </button>
            </div>

            ${renderServiceLifecycleCard(currentService, user)}

            <!-- Phase 104 parity (quick 260615-eo0) — Info + Financial side-by-side, mirroring project-detail.js:644-645 -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1.5rem;">

            <!-- Card 1 — Service Information -->
            <div class="card" style="margin-bottom: 0;">
                <div class="card-body" style="padding:0.75rem 1rem;">
                    <div style="font-size:0.7rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.5rem;">Service Information</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem 0.75rem;">
                        <div>
                            <label style="font-size:0.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:0.15rem;">Service Name *</label>
                            <input type="text" class="detail-field" data-field="service_name" value="${escapeHTML(currentService.service_name || '')}" onblur="window.saveServiceField('service_name', this.value)" placeholder="Enter service name" ${!showEditControls ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label style="font-size:0.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:0.15rem;">Client</label>
                            <div style="color:#64748b;font-size:0.9rem;padding:0.35rem 0;">${escapeHTML(currentService.client_code || currentService.client_name || 'N/A')}</div>
                        </div>
                        <div>
                            <label style="font-size:0.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:0.15rem;">Service Type</label>
                            <div style="padding:0.35rem 0;">
                                <span class="status-badge ${currentService.service_type === 'recurring' ? 'approved' : 'pending'}" style="font-size:0.8rem;">
                                    ${currentService.service_type === 'recurring' ? 'Recurring' : 'One-time'}
                                </span>
                            </div>
                        </div>
                        <div style="grid-column:1/-1;">
                            <label style="font-size:0.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:0.15rem;">Location</label>
                            <input type="text" class="detail-field" data-field="location" value="${escapeHTML(currentService.location || '')}" onblur="window.saveServiceField('location', this.value)" placeholder="(Not set)" ${!showEditControls ? 'disabled' : ''}>
                        </div>
                        <div style="grid-column:1/-1;">
                            ${renderPersonnelPills(canEditPersonnel)}
                        </div>
                        ${getDlpState(currentService, currentCollectibleDocs) !== 'active' ? `
                        <div>
                            <label style="font-size:0.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:0.15rem;">DLP Period</label>
                            <div style="color:#64748b;font-size:0.9rem;padding:0.35rem 0;">${(currentService.dlp_months || null) ? escapeHTML(String(currentService.dlp_months)) + ' months' : '—'}</div>
                        </div>
                        <div>
                            <label style="font-size:0.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:0.15rem;">DLP Expires</label>
                            <div style="color:#64748b;font-size:0.9rem;padding:0.35rem 0;">${escapeHTML((currentService.dlp_expires_at || null) || '—')}</div>
                        </div>` : ''}
                    </div>
                    <div style="font-size:0.7rem;color:#94a3b8;margin-top:0.5rem;">Created: ${formatDate(currentService.created_at)}${currentService.updated_at ? ' · Updated: ' + formatDate(currentService.updated_at) : ''}</div>
                </div>
            </div>

            <!-- Card 2 — Financial Summary -->
            <div class="card" style="margin-bottom: 0;">
                <div class="card-body" style="padding:0.75rem 1rem;">
                    <!-- Phase 104 parity — flex header with single Full Breakdown entry button (mirrors project-detail.js:695-699) -->
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem;">
                        <div style="font-size:0.7rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Financial Summary</div>
                        <button class="btn btn-sm btn-secondary" onclick="window.openServiceFullBreakdown()" style="font-size:0.7rem;padding:0.2rem 0.6rem;white-space:nowrap;">Full Breakdown →</button>
                    </div>

                    <div style="margin-bottom:0.6rem;">${renderServiceDlpFinanceBar()}</div>

                    <!-- Phase 104 parity (quick 260615-eo0) — grouped, tinted card-grid mirroring project-detail.js:704-771 -->
                    <!-- Budget group -->
                    <div style="font-size:0.65rem;font-weight:700;color:#1a73e8;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:0.35rem;">Budget</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem 0.75rem;margin-bottom:0.4rem;">
                        <div>
                            <label style="font-size:0.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:0.15rem;">Budget ${currentService.budget ? `<small style="color: #94a3b8; font-weight: normal; text-transform: none; letter-spacing: 0;">PHP ${formatCurrency(currentService.budget)}</small>` : ''}</label>
                            <input type="number"
                                   class="detail-field"
                                   data-field="budget"
                                   value="${currentService.budget || ''}"
                                   onblur="window.saveServiceField('budget', this.value)"
                                   placeholder="(Not set)"
                                   min="0"
                                   step="0.01"
                                   ${!showEditControls ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label style="font-size:0.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:0.15rem;">Contract Cost ${currentService.contract_cost ? `<small style="color: #94a3b8; font-weight: normal; text-transform: none; letter-spacing: 0;">PHP ${formatCurrency(currentService.contract_cost)}</small>` : ''}</label>
                            <input type="number"
                                   class="detail-field"
                                   data-field="contract_cost"
                                   value="${currentService.contract_cost || ''}"
                                   onblur="window.saveServiceField('contract_cost', this.value)"
                                   placeholder="(Not set)"
                                   min="0"
                                   step="0.01"
                                   ${!showEditControls ? 'disabled' : ''}>
                        </div>
                        <div style="background:#f0f7ff;border-radius:5px;padding:0.3rem 0.5rem;">
                            <div style="font-size:0.65rem;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.1rem;">Projected Cost</div>
                            <div style="font-weight:700;color:#1e293b;font-size:0.85rem;">
                                ${(currentServiceExpense.prTotal + currentServiceExpense.poTotal + currentServiceExpense.rfpFeesTotal) > 0 ? formatCurrency(currentServiceExpense.prTotal + currentServiceExpense.poTotal + currentServiceExpense.rfpFeesTotal) : '—'}
                            </div>
                        </div>
                        <div style="background:#f0f7ff;border-radius:5px;padding:0.3rem 0.5rem;">
                            <div style="font-size:0.65rem;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.1rem;">Remaining Budget</div>
                            ${(() => {
                                const budget = parseFloat(currentService.budget || 0);
                                const total = currentServiceExpense.prTotal + currentServiceExpense.poTotal + currentServiceExpense.rfpFeesTotal;
                                const remaining = budget - total;
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
                            <div style="font-weight:700;color:#059669;font-size:0.85rem;">${formatCurrency(currentServiceExpense.totalPaid)}</div>
                        </div>
                        <div style="background:#fff5f5;border-radius:5px;padding:0.3rem 0.5rem;">
                            <div style="font-size:0.65rem;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.1rem;">Remaining Payable</div>
                            <div style="font-weight:700;color:${currentServiceExpense.remainingPayable > 0 ? '#ef4444' : '#059669'};font-size:0.85rem;">${formatCurrency(currentServiceExpense.remainingPayable)}</div>
                        </div>
                    </div>

                    <!-- Collectibles group -->
                    <div style="border-top:1px solid #f1f5f9;margin:0.4rem 0;"></div>
                    <div style="font-size:0.65rem;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:0.35rem;">Collectibles</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem 0.75rem;">
                        <div style="background:#f0fdf4;border-radius:5px;padding:0.3rem 0.5rem;">
                            <div style="font-size:0.65rem;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.1rem;">Collected</div>
                            <div style="font-weight:700;color:#059669;font-size:0.85rem;">${formatCurrency(currentServiceCollectibles.totalCollected)}</div>
                        </div>
                        <div style="background:#f0fdf4;border-radius:5px;padding:0.3rem 0.5rem;">
                            <div style="font-size:0.65rem;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.1rem;">Outstanding</div>
                            <div style="font-weight:700;color:${currentServiceCollectibles.remainingCollectible > 0 ? '#ef4444' : '#059669'};font-size:0.85rem;">${formatCurrency(currentServiceCollectibles.remainingCollectible)}</div>
                        </div>
                    </div>
                    <!-- Initiate Billing footer (Phase 104 parity — mirrors project-detail.js:772-775) -->
                    <div style="text-align:right;margin-top:0.5rem;">
                        <span onclick="window.openBillingRequestModal()" style="cursor:pointer;color:#1a73e8;font-size:0.72rem;font-weight:700;user-select:none;">↑ Initiate Billing →</span>
                    </div>
                    <div style="border-top:1px solid #f1f5f9;margin:0.5rem 0 0.25rem;"></div>
                    <div class="tranche-header">
                        <span style="font-size:0.65rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.07em;">Collection Tranches</span>
                        ${showEditControls ? `<button class="edit-tranches-btn${trancheEditorOpen ? ' active' : ''}" onclick="window.toggleTrancheEditor()">⚙ Edit Tranches</button>` : ''}
                    </div>
                    <div id="trancheEditorHost">${renderTrancheDisplay()}${renderTrancheEditor()}</div>
                    ${renderServiceTrancheLifecycle()}
                </div>
            </div>
            </div><!-- /Phase 104 parity Info+Financial grid -->

            <!-- Phase 105 — Bottom row: proposal (left) + service plan (right), layout synced by syncServiceBottomRow() -->
            <div id="serviceDetailBottomRow" style="margin-top:1rem;margin-bottom:0.75rem;">
                ${proposalCardHtml}
                ${planCardHtml}
            </div>
            ${_buildServiceJournalPanelHtml(currentService)}
        </div>
    `;

    // Phase 87.3 D-07 — fire-and-forget load of proposal card (unconditional; branching inside loadProposalCard)
    if (currentServiceDocId) {
        loadProposalCard(currentServiceDocId, 'services');
    }

    // Restore focus if field was focused before re-render
    if (focusedField) {
        if (focusedField === 'service-personnel-pills') {
            const searchInput = document.getElementById('serviceDetailPersonnelSearch');
            searchInput?.focus();
        } else {
            const field = document.querySelector(`[data-field="${focusedField}"]`);
            if (field) field.focus();
        }
    }

    // Phase 104 — if the lifecycle accordion is open, repopulate its body (renderServiceLifecycleCard leaves #lcBody empty)
    if (_lcOpen) buildServiceLifecycleBodyInPlace(currentService, window.getCurrentUser?.() || null);
}

// Personnel pill rendering helper
function renderPersonnelPills(showEditControls) {
    const normalized = normalizePersonnel(currentService);

    // Update module state (but only if search input is not focused, to preserve typing)
    const searchFocused = document.activeElement?.id === 'serviceDetailPersonnelSearch';
    if (!searchFocused) {
        selectedDetailPersonnel = [];
        for (let i = 0; i < normalized.names.length; i++) {
            selectedDetailPersonnel.push({
                id: normalized.userIds[i] || '',
                name: normalized.names[i]
            });
        }
    }

    const pillsHtml = selectedDetailPersonnel.map(u => `
        <span class="personnel-pill ${u.id ? '' : 'legacy'}" data-user-id="${escapeHTML(u.id || '')}">
            ${escapeHTML(u.name)}
            ${showEditControls ? `<button type="button" class="pill-remove"
                onmousedown="event.preventDefault(); window.removeDetailServicePersonnel('${u.id || ''}', '${u.name.replace(/'/g, "\\'")}')">&times;</button>` : ''}
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
            <div class="pill-input-container" id="serviceDetailPillContainer"
                 onclick="document.getElementById('serviceDetailPersonnelSearch')?.focus()">
                ${pillsHtml}
                <input type="text"
                       class="pill-search-input"
                       id="serviceDetailPersonnelSearch"
                       data-field="service-personnel-pills"
                       placeholder="${selectedDetailPersonnel.length === 0 ? 'Type name or email...' : ''}"
                       oninput="window.filterDetailServicePersonnelDropdown(this.value)"
                       onfocus="window.showDetailServicePersonnelDropdown()"
                       autocomplete="off">
            </div>
            <div class="pill-dropdown" id="serviceDetailPersonnelDropdown" style="display: none;"></div>
        </div>`;
}

// Personnel pill interaction functions
function filterDetailServicePersonnelDropdown(searchText) {
    const dropdown = document.getElementById('serviceDetailPersonnelDropdown');
    if (!dropdown) return;

    const term = searchText.toLowerCase().trim();
    const selectedIds = selectedDetailPersonnel.map(u => u.id).filter(Boolean);

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
             onmousedown="event.preventDefault(); window.selectDetailServicePersonnel('${user.id}', '${user.full_name.replace(/'/g, "\\'")}')">
            <strong>${escapeHTML(user.full_name)}</strong>
            <span style="color: #64748b; margin-left: 0.5rem;">${escapeHTML(user.email)}</span>
        </div>
    `).join('');

    dropdown.style.display = 'block';
}

function showDetailServicePersonnelDropdown() {
    const searchInput = document.getElementById('serviceDetailPersonnelSearch');
    if (searchInput?.value?.trim()) {
        filterDetailServicePersonnelDropdown(searchInput.value);
    }
}

async function selectDetailServicePersonnel(userId, userName) {
    if (!currentService || !currentServiceDocId) return;
    if (selectedDetailPersonnel.some(u => u.id === userId)) return;

    const previousUserIds = normalizePersonnel(currentService).userIds;

    selectedDetailPersonnel.push({ id: userId, name: userName });

    try {
        const newUserIds = selectedDetailPersonnel.map(u => u.id).filter(Boolean);
        const newNames = selectedDetailPersonnel.map(u => u.name);

        await updateDoc(doc(db, 'services', currentServiceDocId), {
            personnel_user_ids: newUserIds,
            personnel_names: newNames,
            personnel_user_id: null,
            personnel_name: null,
            personnel: null,
            updated_at: new Date().toISOString()
        });

        // Record edit history (fire-and-forget)
        recordEditHistory(currentServiceDocId, 'personnel_add', [
            { field: 'personnel', old_value: null, new_value: userName }
        ], 'services').catch(err => console.error('[EditHistory] selectDetailServicePersonnel failed:', err));

        // Sync assignments (fire-and-forget)
        syncServicePersonnelToAssignments(currentService.service_code, previousUserIds, newUserIds)
            .catch(err => console.error('[ServiceDetail] Assignment sync failed:', err));

        // Update local state
        currentService.personnel_user_ids = newUserIds;
        currentService.personnel_names = newNames;

    } catch (error) {
        console.error('[ServiceDetail] Error saving personnel:', error);
        showToast('Failed to add personnel', 'error');
        selectedDetailPersonnel = selectedDetailPersonnel.filter(u => u.id !== userId);
    }

    // Clear search and close dropdown
    const searchInput = document.getElementById('serviceDetailPersonnelSearch');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    const dropdown = document.getElementById('serviceDetailPersonnelDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

async function removeDetailServicePersonnel(userId, userName) {
    if (!currentService || !currentServiceDocId) return;

    const previousState = [...selectedDetailPersonnel];
    const previousUserIds = normalizePersonnel(currentService).userIds;

    if (userId) {
        selectedDetailPersonnel = selectedDetailPersonnel.filter(u => u.id !== userId);
    } else {
        selectedDetailPersonnel = selectedDetailPersonnel.filter(u => u.name !== userName);
    }

    try {
        const newUserIds = selectedDetailPersonnel.map(u => u.id).filter(Boolean);
        const newNames = selectedDetailPersonnel.map(u => u.name);

        await updateDoc(doc(db, 'services', currentServiceDocId), {
            personnel_user_ids: newUserIds,
            personnel_names: newNames,
            personnel_user_id: null,
            personnel_name: null,
            personnel: null,
            updated_at: new Date().toISOString()
        });

        // Record edit history (fire-and-forget)
        recordEditHistory(currentServiceDocId, 'personnel_remove', [
            { field: 'personnel', old_value: userName || userId, new_value: null }
        ], 'services').catch(err => console.error('[EditHistory] removeDetailServicePersonnel failed:', err));

        // Sync assignments (fire-and-forget)
        syncServicePersonnelToAssignments(currentService.service_code, previousUserIds, newUserIds)
            .catch(err => console.error('[ServiceDetail] Assignment sync failed:', err));

        // Update local state
        currentService.personnel_user_ids = newUserIds;
        currentService.personnel_names = newNames;

    } catch (error) {
        console.error('[ServiceDetail] Error removing personnel:', error);
        showToast('Failed to remove personnel', 'error');
        selectedDetailPersonnel = previousState;
    }
}

// Save field — inline edit handler
async function saveServiceField(fieldName, newValue) {
    // Guard: check edit permission
    if (window.canEditTab?.('services') !== true) {
        showToast('You do not have permission to edit services', 'error');
        return false;
    }
    // Role check: matches Firestore services update rule (prevents misleading permission-denied errors)
    const _saveUser = window.getCurrentUser?.();
    if (!['super_admin', 'services_admin', 'services_user', 'operations_user'].includes(_saveUser?.role)) { // Quick 260627-kg0: assigned cross-dept operations_user (rule enforces isAssignedToService)
        showToast('Your role does not permit editing services', 'error');
        return false;
    }

    // Locked fields — never save
    if (['service_code', 'client_id', 'client_code', 'service_type'].includes(fieldName)) {
        console.error('[ServiceDetail] Attempted to edit locked field:', fieldName);
        return false;
    }

    clearServiceFieldError(fieldName);

    // Validation
    if (fieldName === 'service_name' && !newValue.trim()) {
        showServiceFieldError(fieldName, 'Service name is required');
        return false;
    }

    if ((fieldName === 'budget' || fieldName === 'contract_cost') && newValue) {
        const num = parseFloat(newValue);
        if (isNaN(num) || num <= 0) {
            showServiceFieldError(fieldName, 'Must be a positive number (greater than 0)');
            return false;
        }
    }

    // Prepare value
    let valueToSave = newValue;
    if (fieldName === 'budget' || fieldName === 'contract_cost') {
        valueToSave = newValue ? parseFloat(newValue) : null;
    } else if (fieldName === 'service_name') {
        valueToSave = newValue.trim();
    }

    // Skip if no actual change
    const oldValue = currentService[fieldName];
    const normalizedOld = (fieldName === 'budget' || fieldName === 'contract_cost')
        ? (oldValue != null ? parseFloat(oldValue) : null)
        : oldValue;
    if (normalizedOld === valueToSave) {
        return true;
    }

    // WR-03: capture recipients BEFORE the await updateDoc call — the onSnapshot
    // listener can update currentService asynchronously between the write and the
    // notification dispatch, potentially returning a stale personnel_user_ids array.
    const NOTIF11_STATUS_WHITELIST = ['Client Approved', 'For Mobilization', 'On-going', 'Completed', 'Loss'];
    const notifRecipients = (fieldName === 'project_status' && NOTIF11_STATUS_WHITELIST.includes(valueToSave))
        ? (currentService.personnel_user_ids || []).filter(Boolean)
        : [];
    const notifServiceLink = currentService.service_code
        ? `#/services/detail/${currentService.service_code}`
        : '#/services';
    const notifServiceName = currentService.service_name;
    const notifSourceId = currentService.service_code || currentServiceDocId;
    // Phase 84.1 NOTIF-19: pre-capture cost-change recipients + display strings (same WR-03 rationale)
    const NOTIF19_COST_FIELDS = ['budget', 'contract_cost'];
    const isCostChange = NOTIF19_COST_FIELDS.includes(fieldName) && normalizedOld !== valueToSave;
    const notifCostRecipients = isCostChange
        ? (currentService.personnel_user_ids || []).filter(Boolean)
        : [];
    const notifCostFieldLabel = fieldName === 'contract_cost' ? 'Contract Cost' : 'Budget';
    const notifCostOldDisplay = (normalizedOld != null) ? `PHP ${formatCurrency(normalizedOld)}` : '(not set)';
    const notifCostNewDisplay = (valueToSave != null) ? `PHP ${formatCurrency(valueToSave)}` : '(not set)';

    try {
        const serviceRef = doc(db, 'services', currentServiceDocId);
        const _svcPayload = { [fieldName]: valueToSave, updated_at: new Date().toISOString() };
        if (fieldName === 'project_status') _svcPayload.status_changed_at = new Date().toISOString();  // Phase 103.1 D-02 — stage clock on manual status change only
        await updateDoc(serviceRef, _svcPayload);

        // Record edit history (fire-and-forget)
        recordEditHistory(currentServiceDocId, 'update', [
            { field: fieldName, old_value: oldValue ?? null, new_value: valueToSave }
        ], 'services').catch(err => console.error('[EditHistory] saveServiceField failed:', err));

        currentService = { ...currentService, [fieldName]: valueToSave };
        // Phase 84 NOTIF-11: notify personnel of meaningful service status change (D-03: fire-and-forget)
        if (notifRecipients.length > 0) {
            createNotificationForUsers({
                user_ids: notifRecipients,
                type: NOTIFICATION_TYPES.PROJECT_STATUS_CHANGED,
                message: `Service "${notifServiceName}" status changed to: ${valueToSave}`,
                link: notifServiceLink,
                source_collection: 'services',
                source_id: notifSourceId,
                object_name: notifServiceName || '',
                actor_name: window.getCurrentUser?.()?.full_name || 'System'
            }).catch(err => console.error('[ServiceDetail] NOTIF-11 notification failed:', err));
        }
        // Phase 84.1 NOTIF-19: notify personnel of meaningful service cost change (D-03: fire-and-forget)
        if (notifCostRecipients.length > 0) {
            createNotificationForUsers({
                user_ids: notifCostRecipients,
                type: NOTIFICATION_TYPES.PROJECT_COST_CHANGED,
                message: `Service "${notifServiceName}" ${notifCostFieldLabel} changed: ${notifCostOldDisplay} → ${notifCostNewDisplay}`,
                link: notifServiceLink,
                source_collection: 'services',
                source_id: notifSourceId,
                object_name: notifServiceName || '',
                actor_name: window.getCurrentUser?.()?.full_name || 'System'
            }).catch(err => console.error('[ServiceDetail] NOTIF-19 cost-change notification failed:', err));
        }
        // Phase 104 D-12: auto-post contract/budget cost-change system Feed entry (fire-and-forget, never block saveServiceField)
        if (isCostChange) {
            const cuCostDelta = window.getCurrentUser?.();
            _addServiceActivityEntry(currentServiceDocId, {
                type: 'system',
                is_system: true,
                text: `${notifCostFieldLabel} changed: ${notifCostOldDisplay} → ${notifCostNewDisplay} by ${cuCostDelta?.full_name || 'Unknown'}`
            }).catch(err => console.error('[ServiceDetail/Journal] cost-change auto-entry failed:', err));
        }
        return true;
    } catch (error) {
        console.error('[ServiceDetail] Save failed:', error);
        showServiceFieldError(fieldName, 'Failed to save. Please try again.');
        return false;
    }
}

// Toggle active status
async function toggleServiceDetailActive(newValue) {
    if (window.canEditTab?.('services') !== true) {
        showToast('You do not have permission to edit services', 'error');
        return;
    }
    // Role check: matches Firestore services update rule
    const _toggleUser = window.getCurrentUser?.();
    if (!['super_admin', 'services_admin', 'services_user', 'operations_user'].includes(_toggleUser?.role)) { // Quick 260627-kg0: assigned cross-dept operations_user (rule enforces isAssignedToService)
        showToast('Your role does not permit editing services', 'error');
        return;
    }

    if (!newValue) {
        const confirmed = confirm('Deactivate this service? Inactive services cannot be selected for MRFs.');
        if (!confirmed) return;
    }

    try {
        const serviceRef = doc(db, 'services', currentServiceDocId);
        await updateDoc(serviceRef, {
            active: newValue,
            updated_at: new Date().toISOString()
        });

        // Record edit history (fire-and-forget)
        recordEditHistory(currentServiceDocId, 'toggle_active', [
            { field: 'active', old_value: !newValue, new_value: newValue }
        ], 'services').catch(err => console.error('[EditHistory] toggleServiceDetailActive failed:', err));

        showToast(`Service ${newValue ? 'activated' : 'deactivated'}`, 'success');
    } catch (error) {
        console.error('[ServiceDetail] Toggle failed:', error);
        showToast('Failed to update status', 'error');
    }
}

// Show field error
function showServiceFieldError(fieldName, message) {
    const field = document.querySelector(`[data-field="${fieldName}"]`);
    if (!field) return;

    clearServiceFieldError(fieldName);

    const errorEl = document.createElement('div');
    errorEl.className = 'field-error-message';
    errorEl.textContent = message;
    errorEl.style.cssText = 'color: #ef4444; font-size: 0.875rem; margin-top: 0.25rem;';
    field.parentNode.appendChild(errorEl);
    field.style.borderColor = '#ef4444';
}

// Clear field error
function clearServiceFieldError(fieldName) {
    const field = document.querySelector(`[data-field="${fieldName}"]`);
    if (!field) return;

    const errorMsg = field.parentNode.querySelector('.field-error-message');
    if (errorMsg) errorMsg.remove();
    field.style.borderColor = '';
}

// Refresh service expense aggregation
async function refreshServiceExpense(silent = false) {
    if (!currentService?.service_code) return;

    // Defense-in-depth: skip aggregation if user cannot read services tab
    // Primary fix for services_user 403 is in Plan 03 (Firestore prs/pos rules)
    const canRead = window.hasTabAccess?.('services');
    if (canRead === false) return;

    showLoading(true);
    try {
        const code = currentService.service_code;

        // MRFs: count only — no total_amount field on MRF documents
        const mrfsQuery = query(
            collection(db, 'mrfs'),
            where('service_code', '==', code)
        );
        const mrfsAgg = await getAggregateFromServer(mrfsQuery, {
            mrfCount: count()
        });

        // PRs: sum total_amount + count
        const prsQuery = query(
            collection(db, 'prs'),
            where('service_code', '==', code)
        );
        const prsAgg = await getAggregateFromServer(prsQuery, {
            prTotal: sum('total_amount'),
            prCount: count()
        });

        // POs: sum total_amount + count
        const posQuery = query(
            collection(db, 'pos'),
            where('service_code', '==', code)
        );
        const posAgg = await getAggregateFromServer(posQuery, {
            poTotal: sum('total_amount'),
            poCount: count()
        });

        // TRs: sum total_amount + count (mirrors project-detail.js:672-680)
        // Filter by service_code per finance.js:2472, 2537 convention
        const trsQuery = query(
            collection(db, 'transport_requests'),
            where('service_code', '==', code)
        );
        const trsAgg = await getAggregateFromServer(trsQuery, {
            totalAmount: sum('total_amount'),
            trCount: count()
        });

        // RFP payables query
        let rfpFeesTotal = 0;
        let rfpTotalPaid = 0;
        let hasRfps = false;
        const serviceCode = currentService.service_code;
        if (serviceCode) {
            const rfpSnap = await getDocs(
                query(collection(db, 'rfps'), where('service_code', '==', serviceCode))
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

        currentServiceExpense = {
            mrfCount: mrfsAgg.data().mrfCount || 0,
            prTotal: prsAgg.data().prTotal || 0,
            prCount: prsAgg.data().prCount || 0,
            poTotal: posAgg.data().poTotal || 0,
            poCount: posAgg.data().poCount || 0,
            trTotal: trsAgg.data().totalAmount || 0,
            trCount: trsAgg.data().trCount || 0,
            rfpFeesTotal,
            totalPaid: rfpTotalPaid,
            remainingPayable: (posAgg.data().poTotal || 0) + (trsAgg.data().totalAmount || 0) + rfpFeesTotal - rfpTotalPaid,
            hasRfps
        };

        // Phase 85 D-06 / D-01: aggregate collectibles for this service — parallels RFP aggregation
        let collTotalRequested = 0;
        let collTotalCollected = 0;
        if (serviceCode) {
            const collSnap = await getDocs(
                query(collection(db, 'collectibles'), where('service_code', '==', serviceCode))
            );
            collSnap.forEach(d => {
                const coll = d.data();
                collTotalRequested += parseFloat(coll.amount_requested || 0);
                collTotalCollected += (coll.payment_records || [])
                    .filter(r => r.status !== 'voided')
                    .reduce((s, r) => s + parseFloat(r.amount || 0), 0);
            });
        }
        currentServiceCollectibles = {
            totalRequested: collTotalRequested,
            totalCollected: collTotalCollected,
            remainingCollectible: collTotalRequested - collTotalCollected
        };

        // Re-render to show updated expense (does NOT call refreshServiceExpense — no loop)
        renderServiceDetail();

        if (!silent) showToast('Expense refreshed', 'success');
    } catch (error) {
        console.error('[ServiceDetail] Expense aggregation failed:', error);
        if (!silent) showToast('Failed to calculate expense', 'error');
        renderServiceDetail(); // Render page with zeroed expense data rather than leaving blank
    } finally {
        showLoading(false);
    }
}

// Export service expense data as CSV
async function exportServiceExpenseCSV() {
    if (!currentService?.service_code) return;

    try {
        // Query all POs for this service (POs store service_code; CONTEXT.md's "filter by service_name" phrasing
        // is imprecise — service_code is the correct PO field, consistent with how refreshServiceExpense queries)
        const posSnap = await getDocs(
            query(collection(db, 'pos'), where('service_code', '==', currentService.service_code))
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
        const safeName = (currentService.service_name || 'service').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '');
        const today = new Date().toISOString().slice(0, 10);
        downloadCSV(headers, rows, `${safeName}-expenses-${today}.csv`);
    } catch (error) {
        console.error('[ServiceDetail] Export failed:', error);
        showToast('Export failed', 'error');
    }
}

// ============================================================
// Phase 87.1 D-05 — Inline proposal card (service detail)
// Phase 96 — Redesigned with Concept B (progress track) + Alt B (stat chips)
// ============================================================
// Mirror of project-detail.js. Uses currentServiceDocId as the parentDocId and
// passes 'services' as parentCollection. The proposal doc carries
// parent_collection: 'services' (set in engagement-create.js when the service
// engagement was created) so _applyProposalStateTransition writes the project
// status back to the services collection automatically via the doc's own field.
// The fresh getDoc() in confirmProposalInlineSubmit ensures the latest
// parent_collection value is read at write time.

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
                    <p style="margin:0 0 0.75rem 0;color:#475569;font-size:0.875rem;">Submitting will advance this service to <strong>Proposal for Internal Approval</strong>. This action is recorded in the audit trail.</p>
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
    // Double-submit prevention: disable confirm button immediately
    const confirmBtn = document.getElementById('proposalInlineSubmitConfirmBtn');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Submitting...'; }

    try {
        // Fresh fetch — mirrors home.js _homeQueueConfirmAction reference pattern.
        // The proposal doc's own parent_collection field tells _applyProposalStateTransition
        // which parent collection (services here) to update.
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
            // NOTIF-09 (C1) — fan-out to approvers, parity with proposal-modal submitProposalForApproval
            try {
                const _actorName = window.getCurrentUser?.()?.full_name || 'Unknown';
                await createNotificationForRoles({
                    roles: ['super_admin', 'operations_admin'],
                    type: NOTIFICATION_TYPES.PROPOSAL_SUBMITTED,
                    message: `Proposal ${proposal.title} submitted for approval by ${_actorName}`,
                    link: `#/`,
                    source_collection: 'proposals',
                    source_id: proposal.proposal_id,
                    object_name: proposal.title,
                    actor_name: _actorName,
                    excludeActor: true
                });
            } catch (notifErr) {
                console.error('[ServiceDetail] NOTIF-09 (inline submit) failed:', notifErr);
            }
            document.getElementById('proposal-inline-submit-modal')?.remove();
            showToast('Proposal submitted for approval.', 'success');
            if (currentServiceDocId) {
                loadProposalCard(currentServiceDocId, 'services');
            }
        } catch (err) {
            console.error('[ServiceDetail] confirmProposalInlineSubmit transition failed:', err);
            showToast(err?.message || 'Failed to submit proposal. Please try again.', 'error');
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Submission'; }
        } finally {
            showLoading(false);
        }
    } catch (err) {
        console.error('[ServiceDetail] confirmProposalInlineSubmit outer failure:', err);
        showToast(err?.message || 'Failed to submit proposal.', 'error');
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Submission'; }
    }
}

// Phase 105 — mirror project-detail syncBottomRow(): when the proposal card is
// visible, lay proposal (left) + service plan (right) side-by-side as a 2-col grid;
// otherwise the plan card spans full width.
function syncServiceBottomRow() {
    const proposalEl = document.getElementById('proposalInlineCard');
    const bottomRow = document.getElementById('serviceDetailBottomRow');
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
        const parentPersonnel = currentService?.personnel_user_ids || [];
        const canDrive = adminRoles.includes(role)
            || (assignedRoles.includes(role) && uid && parentPersonnel.includes(uid));

        // parentCollection ('services') is held for clarity / future expansion;
        // the lookup is by project_id which carries the parent doc id regardless
        // of which collection it belongs to.
        const q = query(collection(db, 'proposals'), where('project_id', '==', parentDocId));
        const snap = await getDocs(q);
        const el = document.getElementById('proposalInlineCard');
        if (!el) return; // navigated away

        if (snap.empty) {
            if (currentService?.project_status === 'For Proposal' && canDrive) {
                // Show Start Proposal CTA for canDrive users on For Proposal services
                window._startProposalCallback = () => loadProposalCard(parentDocId, parentCollection);
                el.style.display = '';
                el.innerHTML = `<div class="proposal-inline-card proposal-inline-card--start">
                    <div class="proposal-inline-card__body" style="text-align:center;padding:1rem 0;">
                        <p style="margin:0 0 0.75rem 0;color:#475569;font-size:0.875rem;">No proposal yet. Ready to start one?</p>
                        <button class="btn btn-primary" onclick="window.openCreateProposalModal('${escapeHTML(parentDocId)}', window._startProposalCallback, 'services', '${escapeHTML(currentService?.service_code || '')}')">Start Proposal</button>
                    </div>
                </div>`;
            } else if (currentService?.project_status === 'For Proposal') {
                // Non-canDrive user on For Proposal — show placeholder
                el.style.display = '';
                el.innerHTML = `<div class="proposal-inline-card"><p style="color:#64748b;font-size:0.875rem;margin:0;">No proposal linked yet.</p></div>`;
            } else {
                // Not in proposal range and no proposal — hide container
                el.style.display = 'none';
            }
            syncServiceBottomRow();
            return;
        }

        // Most service engagements have ≤1 active proposal; if multiple, surface the first.
        const proposal = { id: snap.docs[0].id, ...snap.docs[0].data() };
        el.style.display = '';
        el.innerHTML = renderInlineProposalCard(proposal, canDrive);
        syncServiceBottomRow();
    } catch (err) {
        console.error('[ServiceDetail] loadProposalCard failed:', err);
        const el = document.getElementById('proposalInlineCard');
        if (el) {
            el.innerHTML = `<div class="proposal-inline-card"><p style="color:#ef4444;font-size:0.875rem;margin:0;">Could not load proposal.</p></div>`;
        }
    }
}

// ============================================================
// Phase 104 — DLP / retention finance bar + inline tranche editor (mirror project-detail.js Phase 102)
// ============================================================

// A collected retention tranche (non-voided payments >= amount_requested) reads as released.
function isRetentionCollected(service, collectibleDocs) {
    const retIdx = (service?.collection_tranches || []).findIndex(t => t.is_retention);
    if (retIdx < 0) return false;
    const docs = Array.isArray(collectibleDocs) ? collectibleDocs
        : (Array.isArray(currentCollectibleDocs) ? currentCollectibleDocs : []);
    const coll = docs.find(c => c.tranche_index === retIdx);
    if (!coll) return false;
    const req = parseFloat(coll.amount_requested) || 0;
    const paid = (coll.payment_records || [])
        .filter(r => r.status !== 'voided')
        .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    return req > 0 && paid >= req;
}

// Single source of truth for DLP display state — all DLP fields read || null (D-08 legacy safety).
function getDlpState(service, collectibleDocs) {
    if (!service || !(service.dlp_months || null) || service.project_status !== 'Completed') return 'active';
    if (service.retention_released_at || null) return 'released';
    if (isRetentionCollected(service, collectibleDocs)) return 'released';
    if (Date.now() > new Date(service.dlp_expires_at).getTime()) return 'expired';
    return 'in-dlp';
}

// 4-state DLP-aware finance bar (active / in-dlp / expired / released). Reads currentService + currentCollectibleDocs.
function renderServiceDlpFinanceBar() {
    const service = currentService;
    if (!service) return '';
    const state = getDlpState(currentService, currentCollectibleDocs);
    const contract = parseFloat(service?.contract_cost) || 0;
    const docs = Array.isArray(currentCollectibleDocs) ? currentCollectibleDocs : [];
    const collected = docs.reduce((s, c) => s + (c.payment_records || [])
        .filter(r => r.status !== 'voided')
        .reduce((ss, r) => ss + (parseFloat(r.amount) || 0), 0), 0);
    const retentionAmt = parseFloat(service?.retention_amount || null) || 0;
    const pct = (v) => contract > 0 ? Math.max(0, Math.min(100, (v / contract) * 100)) : 0;
    const fmtDays = (ms) => Math.max(0, Math.ceil(Math.abs(ms) / 86400000));
    const expMs = (service?.dlp_expires_at || null) ? new Date(service.dlp_expires_at).getTime() : 0;

    const header = (subLabel, subVal, subColor) => `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
            <div>
                <div style="font-size:12px;color:#94a3b8;font-weight:500;margin-bottom:2px;">Contract Cost</div>
                <div style="font-size:20px;font-weight:800;color:#1e293b;">${formatCurrency(contract)}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:11px;color:#94a3b8;margin-bottom:2px;">${escapeHTML(subLabel)}</div>
                <div style="font-size:15px;font-weight:700;color:${subColor};">${subVal}</div>
            </div>
        </div>`;
    const track = (segs) => `<div style="height:10px;background:#e2e8f0;border-radius:5px;overflow:hidden;display:flex;margin-bottom:8px;">${segs}</div>`;
    const labels = (l, r) => `<div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;"><span>${l}</span><span>${r}</span></div>`;
    const isFinance = (window.getCurrentUser?.()?.role === 'finance');
    const releaseBtn = isFinance
        ? `<button class="release-btn" onclick="window.recordServiceRetentionRelease('${escapeHTML(currentServiceDocId || '')}')">Record Release</button>`
        : '';

    if (state === 'in-dlp') {
        const cp = pct(collected), rp = pct(retentionAmt);
        return `<div class="finance-bar state-amber">
            ${header('Retention Held', formatCurrency(retentionAmt), '#f59e0b')}
            ${track(`<div class="bar-seg collected" style="width:${cp}%"></div><div class="bar-seg retention" style="width:${rp}%;background:#f59e0b;"></div>`)}
            ${labels(`${formatCurrency(collected)} collected · ${formatCurrency(retentionAmt)} retention held`, `DLP expires ${escapeHTML(service.dlp_expires_at || '—')}`)}
            <div class="dlp-strip amber">
                <span>◑ In Defect Liability Period — retention held until DLP expires</span>
                <div style="display:flex;gap:8px;align-items:center;">
                    <span class="dlp-strip-right">${fmtDays(expMs - Date.now())} days remaining</span>
                    ${releaseBtn}
                </div>
            </div>
        </div>`;
    }
    if (state === 'expired') {
        const cp = pct(collected), rp = pct(retentionAmt);
        return `<div class="finance-bar state-red">
            ${header('Retention Overdue', formatCurrency(retentionAmt), '#ef4444')}
            ${track(`<div class="bar-seg collected" style="width:${cp}%"></div><div class="bar-seg retention" style="width:${rp}%;background:#ef4444;"></div>`)}
            ${labels(`${formatCurrency(collected)} collected · Retention ${formatCurrency(retentionAmt)} overdue`, `DLP expired ${escapeHTML(service.dlp_expires_at || '—')}`)}
            <div class="dlp-strip red">
                <span>⚠ DLP period expired — retention release overdue</span>
                <div style="display:flex;gap:8px;align-items:center;">
                    <span class="dlp-strip-right">Expired ${fmtDays(Date.now() - expMs)} days ago</span>
                    ${releaseBtn}
                </div>
            </div>
        </div>`;
    }
    if (state === 'released') {
        const cp = pct(collected);
        return `<div class="finance-bar state-green">
            ${header('Cash Collected', formatCurrency(collected), '#059669')}
            ${track(`<div class="bar-seg collected" style="width:${cp}%"></div>`)}
            ${labels(`${formatCurrency(collected)} collected (${Math.round(cp)}%)`, `Retention recovered ✓`)}
            <div class="dlp-strip green">
                <span>✓ Retention released — no longer held</span>
                <span class="dlp-strip-right">${service.retention_released_at ? 'Released ' + escapeHTML(String(service.retention_released_at)) : 'Collected in full'}</span>
            </div>
        </div>`;
    }
    // active (default) — utilization bar, no DLP strip
    const cp = pct(collected);
    return `<div class="finance-bar">
        ${header('Cash Collected', formatCurrency(collected), '#1a73e8')}
        ${track(`<div class="bar-seg collected" style="width:${cp}%"></div>`)}
        ${labels(`${formatCurrency(collected)} collected (${Math.round(cp)}%)`, `${formatCurrency(Math.max(0, contract - collected))} outstanding`)}
    </div>`;
}

// Read-only tranche display (empty state = Set Up CTA, otherwise list).
function renderTrancheDisplay() {
    const tranches = Array.isArray(currentService?.collection_tranches) ? currentService.collection_tranches : [];
    const contractCost = parseFloat(currentService?.contract_cost) || 0;
    if (tranches.length === 0) {
        return `<div class="setup-cta">
            <p>No collection tranches set — billing can't be linked to milestones.</p>
            <button onclick="window.toggleTrancheEditor()">⚙ Set Up Tranches</button>
        </div>`;
    }
    const rows = tranches.map((t) => {
        const amt = contractCost * (parseFloat(t.percentage) || 0) / 100;
        return `<div class="tranche-display-row">
            <div class="td-left">
                <span class="td-name">${escapeHTML(t.label || '(unnamed)')}</span>
                ${t.is_retention ? '<span class="ret-tag">◆ Retention</span>' : ''}
            </div>
            <div class="td-right">
                <span class="td-amount">${formatCurrency(amt)}</span>
                <span class="td-pct">${parseFloat(t.percentage) || 0}%</span>
            </div>
        </div>`;
    }).join('');
    return `<div class="tranche-display">${rows}</div>`;
}

// Inline editor (hidden unless trancheEditorOpen).
function renderTrancheEditor() {
    const wrapperClass = 'tranche-editor' + (trancheEditorOpen ? ' visible' : '');
    const rows = editorTranches.map((t, i) => {
        const isRet = !!t.is_retention;
        return `<div class="editor-row${isRet ? ' retention-row' : ''}" id="erow-${i}">
            <input type="text" value="${escapeHTML(t.label || '')}" placeholder="Tranche label (e.g. Mobilization)"
                oninput="window.updateEditorTrancheLabel(${i}, this.value)">
            <div style="display:flex;align-items:center;gap:4px;">
                <input type="number" value="${parseFloat(t.percentage) || 0}" min="0" max="100" style="width:60px;"
                    oninput="window.updateEditorTranchePercentage(${i}, this.value)">
                <span class="pct-suffix">%</span>
            </div>
            <button class="ret-toggle${isRet ? ' on' : ''}" onclick="window.toggleTrancheRetention(${i})">
                ${isRet ? '◆ Ret.' : 'Ret?'}
            </button>
            <button class="remove-btn" onclick="window.removeEditorTrancheRow(${i})"${editorTranches.length <= 1 ? ' disabled' : ''}>×</button>
        </div>`;
    }).join('');
    return `<div class="${wrapperClass}">
        <div class="editor-header">Edit Collection Tranches</div>
        <div class="editor-list">${rows}</div>
        <div class="total-row">
            <span>Total: <span id="trancheTotalVal" class="total-val total-err">0%</span></span>
            <div class="total-progress"><div id="trancheTotalBar" style="height:100%;width:0%;background:#1a73e8;border-radius:4px;transition:width 0.2s,background 0.2s;"></div></div>
        </div>
        <button class="add-btn" onclick="window.addEditorTrancheRow()">+ Add Tranche</button>
        <div class="editor-actions">
            <button class="btn-cancel" onclick="window.cancelTrancheEditor()">Cancel</button>
            <button class="btn-save" onclick="window.saveTrancheEditor()">Save</button>
        </div>
    </div>`;
}

function renderTrancheEditorHost() {
    const host = document.getElementById('trancheEditorHost');
    if (!host) return;
    host.innerHTML = renderTrancheDisplay() + renderTrancheEditor();
    if (trancheEditorOpen) recalcTrancheTotal();
}

function toggleTrancheEditor() {
    const cu = window.getCurrentUser?.();
    if (!_canAdvanceServiceStatus(currentService, cu, 'On-going')) {
        showToast('Permission denied — only service admins or assigned services users can edit tranches.', 'error');
        return;
    }
    trancheEditorOpen = !trancheEditorOpen;
    if (trancheEditorOpen) {
        const existing = Array.isArray(currentService?.collection_tranches) ? currentService.collection_tranches : [];
        editorTranches = existing.map(t => ({
            label: t.label || '',
            percentage: parseFloat(t.percentage) || 0,
            is_retention: !!t.is_retention,
        }));
        if (editorTranches.length === 0) {
            editorTranches.push({ label: '', percentage: 0, is_retention: false });
        }
    }
    renderTrancheEditorHost();
    const editBtn = document.querySelector('.edit-tranches-btn');
    if (editBtn) editBtn.classList.toggle('active', trancheEditorOpen);
}

function updateEditorTrancheLabel(i, value) {
    if (editorTranches[i]) editorTranches[i].label = value;
}
function updateEditorTranchePercentage(i, value) {
    if (editorTranches[i]) editorTranches[i].percentage = +value;
    recalcTrancheTotal();
}
function addEditorTrancheRow() {
    editorTranches.push({ label: '', percentage: 0, is_retention: false });
    renderTrancheEditorHost();
}
function removeEditorTrancheRow(i) {
    editorTranches.splice(i, 1);
    renderTrancheEditorHost();
}
function toggleTrancheRetention(i) {
    const wasOn = editorTranches[i].is_retention;
    editorTranches.forEach((t, j) => { t.is_retention = j === i && !wasOn; });
    renderTrancheEditorHost();
}
function recalcTrancheTotal() {
    const total = editorTranches.reduce((s, t) => s + (+t.percentage || 0), 0);
    const valEl = document.getElementById('trancheTotalVal');
    const barEl = document.getElementById('trancheTotalBar');
    if (valEl) {
        valEl.textContent = total + '%';
        valEl.className = 'total-val ' + (total === 100 ? 'total-ok' : 'total-err');
    }
    if (barEl) {
        barEl.style.width = Math.min(100, total) + '%';
        barEl.style.background = total === 100 ? '#059669' : total > 100 ? '#ef4444' : '#1a73e8';
    }
}

// Save the editor — writes collection_tranches to the service doc (no DLP fields).
async function saveTrancheEditor() {
    const total = editorTranches.reduce((s, t) => s + (+t.percentage || 0), 0);
    if (total !== 100) {
        showToast('Tranches must total exactly 100% before saving.', 'error');
        return;
    }
    const unlabelled = editorTranches.filter(t => !t.label.trim());
    if (unlabelled.length > 0) {
        showToast('All tranches must have labels before saving.', 'error');
        return;
    }
    const finalTranches = editorTranches.map(t => ({
        label: t.label.trim(),
        percentage: +t.percentage,
        is_retention: !!t.is_retention,
    }));
    try {
        await updateDoc(doc(db, 'services', currentServiceDocId), {
            collection_tranches: finalTranches,
            updated_at: serverTimestamp(),
        });
        trancheEditorOpen = false;
        editorTranches = [];
        showToast('Collection tranches saved.', 'success');
    } catch (err) {
        console.error('[ServiceDetail] saveTrancheEditor failed:', err);
        showToast('Failed to save tranches. Please try again.', 'error');
    }
}

function cancelTrancheEditor() {
    trancheEditorOpen = false;
    editorTranches = [];
    renderTrancheEditorHost();
    const editBtn = document.querySelector('.edit-tranches-btn');
    if (editBtn) editBtn.classList.remove('active');
}

// ============================================================
// Phase 104 — Lifecycle accordion (mirror project-detail.js Phase 100)
// ============================================================

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

function _getServiceStatusColor(status) {
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

// D-04 — Completion gate is services_admin-only; assigned services_user drives every OTHER gate.
function _canAdvanceServiceStatus(service, currentUser, targetStatus) {
    if (!currentUser || !service) return false;
    const role = currentUser.role || '';
    if (['super_admin', 'services_admin'].includes(role)) return true;
    if (targetStatus === 'Completed') return false;
    // services_user OR (Quick 260627-kg0) an assigned cross-dept operations_user drives every
    // NON-Completed gate (the Completed exclusion above applies to both — services_admin-only).
    if (role === 'services_user' || role === 'operations_user') {
        const ids = Array.isArray(service.personnel_user_ids) ? service.personnel_user_ids : [];
        return ids.includes(currentUser.uid);
    }
    return false;
}

// Compute dlp_expires_at (YYYY-MM-DD) + retention_amount from gate inputs (Plan 03 owns this; Plan 04 reuses).
function computeDlpFields(startDateStr, months, contractCost, retentionPct) {
    const start = new Date(startDateStr);
    const exp = new Date(start.getTime());
    exp.setMonth(exp.getMonth() + (parseInt(months) || 0));
    const dlp_expires_at = exp.toISOString().slice(0, 10);
    const retention_amount = Math.round((parseFloat(contractCost) || 0) * (parseFloat(retentionPct) || 0) / 100);
    return { dlp_expires_at, retention_amount };
}

const LC_DOC_KEYS = {
    inspection: { prefix: 'inspection_report',         L: 'I' },
    ntp:        { prefix: 'ntp_document',              L: 'N' },
    completion: { prefix: 'completion_report',         L: 'C' },
    coc:        { prefix: 'certificate_of_completion', L: 'O' },
};

function buildAttachZone(service, which, label, simFilename) {
    const dk = LC_DOC_KEYS[which];
    if (!dk) return '';
    const hasDoc = !!(service[dk.prefix + '_url'] || null);
    const L = dk.L;
    if (hasDoc) {
        const kind = service[dk.prefix + '_kind'] || 'link';
        const name = escapeHTML(service[dk.prefix + '_filename'] || service[dk.prefix + '_url'] || '');
        const url = escapeHTML(service[dk.prefix + '_url'] || '');
        const icon = kind === 'file' ? '📄' : '🔗';
        return `<div class="az az-ok">
            <div class="az-doc">
                <span class="az-doc-icon">${icon}</span>
                <div class="az-doc-info">
                    <div class="az-doc-name">${name}</div>
                    <div class="az-doc-kind">${kind}</div>
                </div>
                <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none;font-size:11px;cursor:pointer;" onclick="window.lcRemoveServiceDoc('${which}')">✕ Remove</button>
            </div>
        </div>`;
    }
    return `<div class="az">
        <div class="az-lbl">${escapeHTML(label)}</div>
        <div class="az-row">
            <input class="az-input" id="az${L}Link" type="url" placeholder="https://drive.google.com/...">
            <button class="btn btn-primary" style="font-size:12px;padding:6px 12px;" onclick="window.lcServiceAttachLink('${which}')">Attach</button>
        </div>
    </div>`;
}

function buildPATrack(service) {
    const POST_APPROVAL = [
        { label: 'Client\nApproved',  status: 'Client Approved'  },
        { label: 'For\nMobilization', status: 'For Mobilization' },
        { label: 'On-going',          status: 'On-going'         },
        { label: 'Completed',         status: 'Completed'        },
    ];
    const status = service.project_status || '';
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

function buildDocRollup(service) {
    const DOC_SLOTS = [
        { key:'inspection', stage:'Gate 1 · For Inspection',  label:'Inspection Report',    prefix:'inspection_report' },
        { key:'ntp',        stage:'Gate 2 · Client Approved', label:'NTP / Purchase Order',  prefix:'ntp_document' },
        { key:'completion', stage:'Gate 4 · Completion',      label:'Completion Report',     prefix:'completion_report' },
        { key:'coc',        stage:'Gate 4 · Completion',      label:'Cert. of Completion',   prefix:'certificate_of_completion' },
    ];
    const filled = DOC_SLOTS.filter(s => service[s.prefix + '_url'] || null).length;
    let html = `<div class="doc-rollup">
        <div class="doc-rollup-hdr">
            <span class="doc-rollup-title">Documents on File</span>
            <span class="doc-rollup-count">${filled} / 4</span>
        </div>`;
    DOC_SLOTS.forEach(s => {
        const url = service[s.prefix + '_url'] || null;
        const kind = service[s.prefix + '_kind'] || null;
        const fname = service[s.prefix + '_filename'] || null;
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

function buildServiceLifecycleBody(service, currentUser) {
    const status = service.project_status || 'For Inspection';
    function wrap(gateTitle, inner, showRollup = true) {
        return `<div class="gate-label">${gateTitle}</div>${inner}${showRollup ? buildDocRollup(service) : ''}`;
    }

    if (status === 'For Inspection') {
        const has = !!(service.inspection_report_url || null);
        const canDo = _canAdvanceServiceStatus(service, currentUser, 'For Proposal');
        return wrap('Gate 1 — Inspection Report', `
            <div class="lc-desc">Attach the site inspection report before advancing. The Advance button unlocks once the inspection report is on file.</div>
            ${!has ? '<div class="gate-warn">⚠️ Inspection report required to advance</div>' : ''}
            ${buildAttachZone(service, 'inspection', 'Inspection Report', 'Inspection_Report_Final.pdf')}
            <div class="action-row">
                <button class="btn btn-primary" ${(has && canDo) ? '' : 'disabled'} onclick="window.lcAdvanceServiceToForProposal('${escapeHTML(service.id)}')">→ Advance to For Proposal</button>
                <span class="action-note">${!has ? 'Attach document to enable' : canDo ? 'Ready to advance' : 'Requires admin or service assignment'}</span>
            </div>`);
    }
    if (status === 'For Proposal') {
        return wrap('Proposal Stage', `<div class="built"><div class="built-title">✅ Already implemented — no changes needed</div><div class="built-desc">Full proposal flow lives in proposals.js + proposal-modal.js. Use the Proposal card below to create / submit / approve.</div></div>`, false);
    }
    if (status === 'Proposal for Internal Approval') {
        return wrap('Internal Approval Review', `<div class="built"><div class="built-title">✅ approveProposal() / rejectProposal() — already implemented</div><div class="built-desc">Services Admin uses the Proposal card to approve or reject.</div></div>`, false);
    }
    if (status === 'Proposal Under Client Review' || status === 'For Revision') {
        return wrap('Client Review', `<div class="built"><div class="built-title">✅ markClientApproved() / requestRevision() / recordLoss() — already implemented</div><div class="built-desc">Client outcomes are managed via the Proposal card below.</div></div>`, false);
    }
    if (status === 'Client Approved') {
        const has = !!(service.ntp_document_url || null);
        const canDo = _canAdvanceServiceStatus(service, currentUser, 'For Mobilization');
        return wrap('Gate 2 — Notice to Proceed / PO', `
            <div class="lc-desc">Attach the client's formal work authorization (NTP or PO) before mobilizing.</div>
            ${!has ? '<div class="gate-warn">⚠️ NTP or PO required to start mobilization</div>' : ''}
            ${buildAttachZone(service, 'ntp', 'Notice to Proceed / Purchase Order', 'Notice_to_Proceed.pdf')}
            <div class="action-row">
                <button class="btn btn-orange" ${(has && canDo) ? '' : 'disabled'} onclick="window.lcStartServiceMobilization('${escapeHTML(service.id)}')">🚀 Start Mobilization</button>
                <span class="action-note">${!has ? 'Attach NTP or PO to enable' : canDo ? 'Ready to mobilize' : 'Requires admin or service assignment'}</span>
            </div>`);
    }
    if (status === 'For Mobilization') {
        const mobilizedAt = escapeHTML(service.mobilization_started_at || '—');
        const canDo = _canAdvanceServiceStatus(service, currentUser, 'On-going');
        return wrap('Gate 3 — Start Project', `
            <div class="lc-desc">Resources are mobilizing. Click Start Project when site execution is ready. No document gate.</div>
            <div style="font-size:11px;color:#475569;margin-bottom:12px;">Mobilized: <code>${mobilizedAt}</code></div>
            <div class="action-row">
                <button class="btn btn-primary" ${canDo ? '' : 'disabled'} onclick="window.lcStartService('${escapeHTML(service.id)}')">▶ Start Project</button>
                <span class="action-note">${canDo ? 'Records official project start date' : 'Requires admin or service assignment'}</span>
            </div>`);
    }
    if (status === 'On-going') {
        const hasR = !!(service.completion_report_url || null);
        const hasC = !!(service.certificate_of_completion_url || null);
        const can = hasR && hasC;
        const note = !hasR && !hasC ? 'Both documents required' : !hasR ? 'Still needed: Completion Report' : 'Still needed: Certificate of Completion';
        const startedAt = escapeHTML(service.project_started_at || '—');
        const canDo = _canAdvanceServiceStatus(service, currentUser, 'Completed');
        return wrap('Gate 4 — Completion', `
            <div class="lc-desc">Project in execution. Both a Completion Report and Certificate of Completion (COC) must be attached before closing.</div>
            <div style="font-size:11px;color:#475569;margin-bottom:10px;">Started: <code>${startedAt}</code></div>
            ${!can ? `<div class="gate-warn">⚠️ ${escapeHTML(note)}</div>` : ''}
            ${buildAttachZone(service, 'completion', 'Completion Report', 'Project_Completion_Report.pdf')}
            ${buildAttachZone(service, 'coc', 'Certificate of Completion (COC)', 'Certificate_of_Completion.pdf')}
            ${(service.collection_tranches || []).some(t => t.is_retention) ? `
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:11px 13px;margin-bottom:12px;">
                <div style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Defect Liability Period</div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                    <div>
                        <label style="font-size:11px;color:#475569;font-weight:600;display:block;margin-bottom:3px;">Retention %</label>
                        <input type="number" id="gateDlpRetPct" min="0" max="100" step="0.01" value="${(() => { const r = (service.collection_tranches || []).find(t => t.is_retention); return r ? (parseFloat(r.percentage) || 10) : 10; })()}" style="width:100%;padding:5px 7px;border:1px solid #fde68a;border-radius:5px;font-size:13px;">
                    </div>
                    <div>
                        <label style="font-size:11px;color:#475569;font-weight:600;display:block;margin-bottom:3px;">DLP Months</label>
                        <select id="gateDlpMonths" style="width:100%;padding:5px 7px;border:1px solid #fde68a;border-radius:5px;font-size:13px;">
                            <option value="3">3</option>
                            <option value="6">6</option>
                            <option value="12" selected>12</option>
                            <option value="18">18</option>
                            <option value="24">24</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:11px;color:#475569;font-weight:600;display:block;margin-bottom:3px;">DLP Start Date</label>
                        <input type="date" id="gateDlpStart" value="${new Date().toISOString().slice(0, 10)}" style="width:100%;padding:5px 7px;border:1px solid #fde68a;border-radius:5px;font-size:13px;">
                    </div>
                </div>
                <div style="font-size:11px;color:#92400e;margin-top:7px;">DLP is required because this project has a retention tranche. Captured when you mark the project Completed.</div>
            </div>` : ''}
            <div class="action-row">
                <button class="btn btn-primary" ${(!can || !canDo) ? 'disabled' : ''} onclick="window.lcMarkServiceComplete('${escapeHTML(service.id)}')">✅ Mark as Completed</button>
                <span class="action-note">${!canDo ? 'Requires service assignment' : !can ? escapeHTML(note) : ''}</span>
            </div>`);
    }
    if (status === 'Completed') {
        const cell = (lbl, val) => `<div class="comp-cell"><div class="comp-cell-lbl">${lbl}</div><div class="comp-cell-val">${escapeHTML(val || '—')}</div></div>`;
        return wrap('Project Closed', `
            <div class="comp-grid">
                ${cell('NTP / PO', service.ntp_document_filename || service.ntp_document_url)}
                ${cell('Mobilized', service.mobilization_started_at)}
                ${cell('Project Started', service.project_started_at)}
                ${cell('Completed At', service.project_completed_at)}
                ${cell('Completion Report', service.completion_report_filename || service.completion_report_url)}
                ${cell('Cert. of Completion', service.certificate_of_completion_filename || service.certificate_of_completion_url)}
            </div>
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:7px;padding:11px 13px;font-size:12px;color:#1e40af;line-height:1.65;margin-bottom:12px;"><strong>📊 COC → Finance</strong> — The COC on this project is the reference Finance uses when filing remaining billing tranches, including retention.</div>`);
    }
    if (status === 'Loss') {
        return wrap('Project Lost', `<div class="built"><div class="built-title">✅ recordLoss() — already implemented</div><div class="built-desc">Loss was recorded via the proposal workflow. No further project-status actions.</div></div>`, false);
    }
    return `<div style="padding:12px;font-size:12px;color:#64748b;">No lifecycle action for current status.</div>${buildDocRollup(service)}`;
}

function buildServiceLifecycleBodyInPlace(service, currentUser) {
    if (!service) return;
    const body = document.getElementById('lcBody');
    if (body) body.innerHTML = buildServiceLifecycleBody(service, currentUser);
    const track = document.getElementById('lcTrack');
    if (track) track.innerHTML = buildServiceLifecycleTrack(service);
    updateServiceLifecycleBadge(service);
}

function buildServiceLifecycleTrack(service) {
    const status = service.project_status || 'For Inspection';
    let curIdx;
    if (status === 'Loss') {
        curIdx = -1;
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

// PVD-LOSS-01 — single source of truth for "who may drive a Mark-as-Loss on a SERVICE".
// MUST stay aligned with the deployed firestore.rules: the services update rule
// (super_admin/services_admin admin + assigned services_user) governs the service-doc write.
// CAVEAT: services_admin can drive a no-proposal (PATH B) Loss, but a service WITH an open
// proposal (PATH A) additionally needs proposal-write rights, which the proposals update rule
// grants only to super_admin/operations_admin/assigned services_user — so a services_admin
// PATH A Loss fails CLEANLY (atomic batch, friendly toast) until that rule is widened (rules+deploy).
const LOSS_ADMIN_ROLES = ['super_admin', 'services_admin'];
const LOSS_ASSIGNED_ROLES = ['services_user', 'operations_user']; // Quick 260627-kg0: assigned cross-dept member
let _lossSubmitInFlight = false;  // double-submit guard (module scope; reset in finally)
function canDriveServiceLoss(service, currentUser) {
    const uid = currentUser?.uid;
    const role = currentUser?.role || '';
    return LOSS_ADMIN_ROLES.includes(role)
        || (LOSS_ASSIGNED_ROLES.includes(role) && uid && (service?.personnel_user_ids || []).includes(uid));
}

function renderServiceLifecycleCard(service, currentUser) {
    const status = service.project_status || 'For Inspection';
    const isActive = ['For Inspection','Client Approved','For Mobilization','On-going','For Revision'].includes(status);
    const isComplete = status === 'Completed';
    const gated = ['For Inspection','Client Approved','For Mobilization','On-going'].includes(status);
    const color = _getServiceStatusColor(status);
    // PVD-LOSS-01: gate the Mark-as-Loss button to roles the deployed rules authorize.
    const showLossBtn = !['Loss', 'Completed'].includes(status) && canDriveServiceLoss(service, currentUser);
    return `<div class="lc-accordion ${isActive ? 'lc-active' : ''} ${isComplete ? 'lc-complete' : ''} ${_lcOpen ? 'open' : ''}" id="lcAccordion">
        <div class="lc-card-header" onclick="window.toggleServiceLifecycleAccordion()">
            <div class="lc-header-left">
                <span class="lc-card-title">Project Lifecycle</span>
                <span class="lc-cur-badge" id="lcCurBadge" style="background:${color}1a;color:${color};border:1px solid ${color}44;">&#9679; ${escapeHTML(status)}</span>
            </div>
            <div class="lc-header-right">
                ${gated && !_lcOpen ? '<span id="lcActionHint" style="font-size:11px;color:#f59e0b;">Action needed &#8595;</span>' : ''}
                <span class="lc-chevron">&#9660;</span>
            </div>
        </div>
        <div class="lc-track-wrap"><div class="lc-track" id="lcTrack">${buildServiceLifecycleTrack(service)}</div></div>
        <div class="lc-body" id="lcBody"><!-- filled on open / in-place rebuild --></div>
        ${showLossBtn ? `<div class="lc-footer" style="padding:0.75rem 1rem;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;">
            <button class="btn btn-danger" onclick="window.openServiceLossModal('${escapeHTML(service.id)}')">Mark as Loss</button>
        </div>` : ''}
    </div>`;
}

function updateServiceLifecycleBadge(service) {
    if (!service) return;
    const status = service.project_status || 'For Inspection';
    const color = _getServiceStatusColor(status);
    const badge = document.getElementById('lcCurBadge');
    if (badge) {
        badge.style.background = `${color}1a`;
        badge.style.color = color;
        badge.style.border = `1px solid ${color}44`;
        badge.textContent = `● ${status}`;
    }
    const hdrSelect = document.getElementById('hdrServiceStatusSelect');
    if (hdrSelect) {
        hdrSelect.value = status;
    } else {
        const hdrBadge = document.getElementById('hdrServiceStatusBadge');
        if (hdrBadge) {
            hdrBadge.style.background = color;
            hdrBadge.textContent = status;
        }
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

function toggleServiceLifecycleAccordion() {
    _lcOpen = !_lcOpen;
    const accordion = document.getElementById('lcAccordion');
    if (accordion) accordion.classList.toggle('open', _lcOpen);
    updateServiceLifecycleBadge(currentService);
    if (_lcOpen) {
        buildServiceLifecycleBodyInPlace(currentService, window.getCurrentUser?.() || null);
    }
}

// Doc-attach write helper — sets _lcAttachPending so the resulting snapshot rebuilds in place (no flicker).
async function _attachDocumentToService(serviceDocId, fields) {
    _lcAttachPending = true;
    await updateDoc(doc(db, 'services', serviceDocId), { ...fields, updated_at: serverTimestamp() });
    const cu = window.getCurrentUser?.();
    await addServiceAuditEntry(serviceDocId, 'DOCUMENT_ATTACHED', cu?.uid, cu?.full_name, JSON.stringify(Object.keys(fields)));
}

// ============================================================
// Phase 104 — Activity Journal (mirror project-detail.js Phase 101)
// ============================================================

// Shared audit primitive consumed by Plan 03 gates + Plan 04 Record Release.
async function addServiceAuditEntry(serviceDocId, action, actorId, actorName, comment) {
    try {
        await addDoc(collection(db, 'services', serviceDocId, 'audit_log'), {
            action, actor_id: actorId || '', actor_name: actorName || 'Unknown',
            comment: comment || '', created_at: serverTimestamp(),
        });
    } catch (err) { console.error('[ServiceDetail] addServiceAuditEntry failed:', err); }
}

// Shared write primitive for all journal activity entries — returns boolean for the D-14 landmine.
async function _addServiceActivityEntry(serviceDocId, { type, text, is_system = false }) {
    try {
        const cu = window.getCurrentUser?.();
        await addDoc(collection(db, 'services', serviceDocId, 'activity_entries'), {
            type, text, is_system,
            created_by_uid: cu?.uid ?? '',
            created_by_name: cu?.full_name || cu?.email || 'Unknown',
            created_at: serverTimestamp(),
        });
        return true;   // Phase 103.1 D-03 — entry persisted; caller may refresh the activity clock
    } catch (err) {
        console.error('[ServiceDetail/Journal] _addServiceActivityEntry failed:', err);
        return false;  // swallowed; caller must NOT refresh the clock
    }
}

// Statuses where the journal panel is shown / writeable (mirror project-detail.js:2829-2830; services use the same project_status field)
const JOURNAL_WRITE_STATUSES = ['For Mobilization', 'On-going'];
const JOURNAL_VISIBLE_STATUSES = [...JOURNAL_WRITE_STATUSES, 'Completed'];

function _avatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const palette = ['#1a73e8', '#9333ea', '#059669', '#ef4444', '#f59e0b', '#0ea5e9', '#7c3aed'];
    return palette[Math.abs(hash) % palette.length];
}

function _avatarInitials(name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase() || '?';
}

function selectJournalTag(tag) {
    journalSelectedTag = tag;
    ['update', 'milestone', 'issue', 'client'].forEach(t => {
        const btn = document.querySelector(`.journal-tag-pill.${t}`);
        if (btn) btn.classList.toggle('selected', t === tag);
    });
}

// Build the full journal panel HTML for a service. Returns '' when the panel should be hidden (D-11).
// KEEP literal CSS classes + the element id projectJournalPanel verbatim — global classes (Pattern 5).
function _buildServiceJournalPanelHtml(service) {
    const isVisible = JOURNAL_VISIBLE_STATUSES.includes(service.project_status);
    if (!isVisible) return '';

    const isReadOnly = service.project_status === 'Completed';

    const tabs = ['activity', 'progress', 'issues'];
    const tabLabels = { activity: 'Activity Feed', progress: 'Progress Updates', issues: 'Issues' };
    const tabCounts = {
        activity: journalActivityEntries.length,
        progress: journalProgressUpdates.length,
        issues: journalIssues.length,
    };

    const tabBarHtml = `<div class="journal-ap-tabs">${
        tabs.map(t => `<button
            id="journalTabBtn-${t}"
            class="journal-tab-btn${_activeJournalTab === t ? ' active' : ''}"
            onclick="window.switchJournalTab('${t}')"
        >${tabLabels[t]}<span class="journal-tab-badge">${tabCounts[t]}</span></button>`).join('')
    }</div>`;

    const composerHtml = !isReadOnly ? `
        <div class="journal-feed-composer">
            <textarea id="journalComposerText" placeholder="Add a note, update, or observation…" rows="2"></textarea>
            <div class="journal-composer-footer">
                <div class="journal-tag-row">
                    <button class="journal-tag-pill update${journalSelectedTag === 'update' ? ' selected' : ''}" onclick="window.selectJournalTag('update')">Update</button>
                    <button class="journal-tag-pill milestone${journalSelectedTag === 'milestone' ? ' selected' : ''}" onclick="window.selectJournalTag('milestone')">Milestone</button>
                    <button class="journal-tag-pill issue${journalSelectedTag === 'issue' ? ' selected' : ''}" onclick="window.selectJournalTag('issue')">Issue</button>
                    <button class="journal-tag-pill client${journalSelectedTag === 'client' ? ' selected' : ''}" onclick="window.selectJournalTag('client')">Client Comm.</button>
                </div>
                <button class="journal-post-btn" onclick="window.postActivityEntry()">Post</button>
            </div>
        </div>` : '';

    const feedHtml = `<div class="journal-feed-list">${
        journalActivityEntries.length === 0
            ? '<div style="color:#94a3b8;font-size:0.82rem;padding:0.5rem 0;">No entries yet.</div>'
            : journalActivityEntries.map(e => _renderFeedEntry(e)).join('')
    }</div>`;

    const activityPanelHtml = `<div id="journalTab-activity" class="journal-tab-panel${_activeJournalTab === 'activity' ? ' visible' : ''}">
        ${composerHtml}
        ${feedHtml}
    </div>`;

    const progressPanelHtml = `<div id="journalTab-progress" class="journal-tab-panel${_activeJournalTab === 'progress' ? ' visible' : ''}">
        ${_buildProgressTabHtml(service, isReadOnly)}
    </div>`;

    const issuesPanelHtml = `<div id="journalTab-issues" class="journal-tab-panel${_activeJournalTab === 'issues' ? ' visible' : ''}">
        ${_buildIssuesTabHtml(service, isReadOnly)}
    </div>`;

    let daysRunningHtml = '';
    if (service.project_status === 'On-going' && service.project_started_at) {
        const startMs = new Date(service.project_started_at).getTime();
        if (!isNaN(startMs)) {
            const days = Math.max(0, Math.floor((Date.now() - startMs) / (1000 * 60 * 60 * 24)));
            const startDateStr = new Date(startMs).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
            daysRunningHtml = `<span class="journal-days-running">Started ${startDateStr} · ${days} day${days !== 1 ? 's' : ''} running</span>`;
        }
    }

    return `<div id="projectJournalPanel" class="project-journal-panel${isReadOnly ? ' project-journal-panel--readonly' : ''}">
        <div class="journal-ap-header">
            <div class="journal-ap-header-left">
                <span style="font-size:16px">📋</span>
                <h3 style="font-size:14px;font-weight:700;margin:0;">On-going Activity</h3>
            </div>
            ${daysRunningHtml}
        </div>
        ${tabBarHtml}
        <div class="journal-ap-body">
            ${activityPanelHtml}
            ${progressPanelHtml}
            ${issuesPanelHtml}
        </div>
    </div>`;
}

// Render a single activity feed entry row (handles live Timestamp + optimistic {seconds}).
function _renderFeedEntry(entry) {
    const ts = entry.created_at?.seconds
        ? new Date(entry.created_at.seconds * 1000)
        : (entry.created_at?.toDate ? entry.created_at.toDate() : new Date());
    const timeStr = ts.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    const tagType = entry.type || 'update';
    const tagLabel = { update: 'UPDATE', milestone: 'MILESTONE', issue: 'ISSUE', client: 'CLIENT', system: 'SYSTEM', edit: 'EDIT' }[tagType] || escapeHTML(tagType).toUpperCase();
    const isSystem = entry.is_system || tagType === 'system' || tagType === 'edit';
    const badgeType = (tagType === 'edit') ? 'system' : tagType;

    if (isSystem) {
        return `<div class="journal-feed-entry">
            <div class="journal-feed-avatar" style="background:#94a3b8;font-size:10px;">SYS</div>
            <div class="journal-feed-right">
                <div class="journal-feed-meta">
                    <span class="journal-feed-system">System</span>
                    <span class="journal-feed-tag-badge journal-badge-${escapeHTML(badgeType)}">${tagLabel}</span>
                    <span class="journal-feed-time">${escapeHTML(timeStr)}</span>
                </div>
                <div class="journal-feed-text">${escapeHTML(entry.text || '')}</div>
            </div>
        </div>`;
    }

    const authorName = entry.created_by_name || 'Unknown';
    const avatarBg = _avatarColor(authorName);
    const initials = _avatarInitials(authorName);
    return `<div class="journal-feed-entry">
        <div class="journal-feed-avatar" style="background:${avatarBg};">${escapeHTML(initials)}</div>
        <div class="journal-feed-right">
            <div class="journal-feed-meta">
                <span class="journal-feed-author">${escapeHTML(authorName)}</span>
                <span class="journal-feed-tag-badge journal-badge-${escapeHTML(tagType)}">${tagLabel}</span>
                <span class="journal-feed-time">${escapeHTML(timeStr)}</span>
            </div>
            <div class="journal-feed-text">${escapeHTML(entry.text || '')}</div>
        </div>
    </div>`;
}

// In-place re-render of the journal panel only (scoped replaceWith on #projectJournalPanel — no full page rebuild).
function _renderServiceJournalPanelInPlace() {
    const el = document.getElementById('projectJournalPanel');
    if (!el || !currentService) return;
    const html = _buildServiceJournalPanelHtml(currentService);
    if (!html) { el.remove(); return; }
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    el.replaceWith(tmp.firstElementChild);
}

// DOM-only tab switcher — all three listeners already running; no new subscriptions.
function switchJournalTab(tab) {
    _activeJournalTab = tab;
    ['activity', 'progress', 'issues'].forEach(t => {
        const panel = document.getElementById('journalTab-' + t);
        const btn = document.getElementById('journalTabBtn-' + t);
        if (panel) panel.classList.toggle('visible', t === tab);
        if (btn) btn.classList.toggle('active', t === tab);
    });
}

// Post a new Activity Feed entry (optimistic append, then persist; D-14 success-only bump).
async function postActivityEntry() {
    const textEl = document.getElementById('journalComposerText');
    const type = journalSelectedTag || 'update';
    const text = (textEl?.value || '').trim();
    if (!text) { showToast('Enter a note before posting.', 'error'); return; }

    const cu = window.getCurrentUser?.();
    journalActivityEntries.unshift({
        id: '_optimistic', type, text, is_system: false,
        created_by_name: cu?.full_name || cu?.email || 'Unknown',
        created_at: { seconds: Date.now() / 1000 }
    });
    _renderServiceJournalPanelInPlace();
    if (textEl) textEl.value = '';

    try {
        const ok = await _addServiceActivityEntry(currentServiceDocId, { type, text, is_system: false });
        if (ok) {
            // Phase 104 D-14 — fire-and-forget, NOT awaited, NOT batched, success-path-only.
            updateDoc(doc(db, 'services', currentServiceDocId), { last_activity_at: serverTimestamp() })
                .catch(err => console.debug('[ServiceDetail/Journal] last_activity_at bump denied/failed (non-blocking):', err?.code || err));
        }
    } catch (err) {
        console.error('[ServiceDetail/Journal] postActivityEntry failed:', err);
        showToast('Failed to post entry. Please try again.', 'error');
    }
}

// --- Phase 104 Plan 02 Task 2: Progress Updates tab ---

function _renderProgressCard(u, isReadOnly) {
    const ts = u.created_at?.seconds
        ? new Date(u.created_at.seconds * 1000)
        : (u.created_at?.toDate ? u.created_at.toDate() : new Date());
    const dateStr = ts.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = ts.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    const pct = Number(u.pct_complete) || 0;
    const barColor = pct < 30 ? '#f59e0b' : '#1a73e8';
    const isEditing = journalEditingProgressId === u.id;
    const eid = escapeHTML(u.id);

    if (isEditing) {
        const sv = (s) => escapeHTML(s || '').replace(/"/g, '&quot;');
        return `<div class="journal-pu-card">
            <div class="journal-form-row">
                <label>Overall % Complete</label>
                <div class="journal-pct-row">
                    <input type="range" id="journalEditPct-${eid}" min="0" max="100" value="${pct}" class="journal-pct-slider" oninput="document.getElementById('journalEditPctVal-${eid}').textContent=this.value+'%'" />
                    <span class="journal-pct-value" id="journalEditPctVal-${eid}">${pct}%</span>
                </div>
            </div>
            <div class="journal-form-row">
                <label>Summary / What was done <span style="color:#ef4444">*</span></label>
                <textarea id="journalEditSummary-${eid}" rows="2">${sv(u.summary)}</textarea>
            </div>
            <div class="journal-form-row">
                <label>Blockers / Issues</label>
                <textarea id="journalEditBlockers-${eid}" rows="2">${sv(u.blockers)}</textarea>
            </div>
            <div class="journal-form-row">
                <label>Next Milestone</label>
                <input type="text" id="journalEditNext-${eid}" value="${sv(u.next_milestone)}" />
            </div>
            <div class="journal-form-actions">
                <button class="journal-cancel-btn" onclick="window.cancelEditProgressUpdate()">Cancel</button>
                <button class="journal-post-btn" onclick="window.saveEditProgressUpdate('${eid}')">Save Changes</button>
            </div>
        </div>`;
    }

    const editBtn = !isReadOnly
        ? `<button class="journal-cancel-btn" style="font-size:11px;padding:3px 9px;" onclick="window.editProgressUpdate('${eid}')">Edit</button>`
        : '';
    return `<div class="journal-pu-card">
        <div class="journal-pu-card-header">
            <div>
                <div class="journal-pu-card-title">Week of ${escapeHTML(dateStr)}</div>
                <div class="journal-pu-card-meta">Submitted by ${escapeHTML(u.created_by_name || 'Unknown')} · ${escapeHTML(timeStr)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                ${editBtn}
                <div class="journal-pu-pct-num" style="color:${barColor}">${pct}%</div>
            </div>
        </div>
        <div class="journal-pu-pct-bar"><div class="journal-pu-pct-fill" style="width:${pct}%;background:${barColor}"></div></div>
        <div class="journal-pu-fields">
            <div class="journal-pu-field">
                <div class="journal-pu-field-label">Summary</div>
                <div class="journal-pu-field-val">${escapeHTML(u.summary || '—')}</div>
            </div>
            <div class="journal-pu-field">
                <div class="journal-pu-field-label">Blockers</div>
                <div class="journal-pu-field-val${u.blockers ? ' journal-pu-field-val--blockers' : ''}">${escapeHTML(u.blockers || 'None')}</div>
            </div>
            ${u.next_milestone ? `<div class="journal-pu-field journal-pu-field--full">
                <div class="journal-pu-field-label">Next Milestone</div>
                <div class="journal-pu-field-val">${escapeHTML(u.next_milestone)}</div>
            </div>` : ''}
        </div>
        ${(u.edit_history?.length) ? (() => {
            const last = u.edit_history[u.edit_history.length - 1];
            const editTs = last.edited_at?.seconds
                ? new Date(last.edited_at.seconds * 1000)
                : (last.edited_at?.toDate ? last.edited_at.toDate() : null);
            const editStr = editTs
                ? editTs.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                : '';
            return `<div style="font-size:11px;color:#94a3b8;margin-top:6px;padding-top:6px;border-top:1px solid #f1f5f9;">Edited by ${escapeHTML(last.edited_by_name || 'Unknown')}${editStr ? ' · ' + escapeHTML(editStr) : ''}</div>`;
        })() : ''}
    </div>`;
}

function _buildProgressTabHtml(service, isReadOnly) {
    const formHtml = !isReadOnly ? `
        <div style="margin-bottom:14px">
            <button class="journal-new-btn" onclick="window.toggleProgressForm()">${journalProgressFormOpen ? '✕ Cancel' : '+ New Progress Update'}</button>
        </div>
        <div class="journal-pu-form"${journalProgressFormOpen ? '' : ' style="display:none"'}>
            <div class="journal-form-row">
                <label>Overall % Complete</label>
                <div class="journal-pct-row">
                    <input type="range" id="journalProgPct" min="0" max="100" value="0" class="journal-pct-slider" oninput="document.getElementById('journalProgPctVal').textContent=this.value+'%'" />
                    <span class="journal-pct-value" id="journalProgPctVal">0%</span>
                </div>
            </div>
            <div class="journal-form-row">
                <label>Summary / What was done <span style="color:#ef4444">*</span></label>
                <textarea id="journalProgSummary" placeholder="e.g. Completed conduit roughing-in for Levels B2–G." rows="2"></textarea>
            </div>
            <div class="journal-form-row">
                <label>Blockers / Issues</label>
                <textarea id="journalProgBlockers" placeholder="e.g. Awaiting delivery — ETA Jun 15." rows="2"></textarea>
            </div>
            <div class="journal-form-row">
                <label>Next Milestone</label>
                <input type="text" id="journalProgNext" placeholder="e.g. Complete panel board wiring by Jun 20" />
            </div>
            <div class="journal-form-actions">
                <button class="journal-cancel-btn" onclick="window.toggleProgressForm()">Cancel</button>
                <button class="journal-post-btn" onclick="window.submitProgressUpdate()">Save Update</button>
            </div>
        </div>` : '';

    const historyHtml = journalProgressUpdates.length === 0
        ? '<div style="color:#94a3b8;font-size:0.82rem;padding:0.5rem 0;">No progress updates yet.</div>'
        : journalProgressUpdates.map(u => _renderProgressCard(u, isReadOnly)).join('');

    return `${formHtml}<div class="journal-pu-history">${historyHtml}</div>`;
}

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
        await addDoc(collection(db, 'services', currentServiceDocId, 'progress_updates'), {
            pct_complete: pct,
            summary,
            blockers,
            next_milestone,
            created_by_uid: cu?.uid ?? '',
            created_by_name: cu?.full_name || cu?.email || 'Unknown',
            created_at: serverTimestamp(),
        });
        // Phase 104 D-14 — fire-and-forget, NOT batched, success-path-only.
        updateDoc(doc(db, 'services', currentServiceDocId), { last_activity_at: serverTimestamp() })
            .catch(err => console.debug('[ServiceDetail/Journal] last_activity_at bump denied/failed (non-blocking):', err?.code || err));
        journalProgressFormOpen = false;
        showToast('Progress update submitted.', 'success');
        if (pctEl) { pctEl.value = '0'; const pv = document.getElementById('journalProgPctVal'); if (pv) pv.textContent = '0%'; }
        if (summaryEl) summaryEl.value = '';
        if (blockersEl) blockersEl.value = '';
        if (nextEl) nextEl.value = '';
    } catch (err) {
        console.error('[ServiceDetail/Journal] submitProgressUpdate failed:', err);
        showToast('Failed to submit progress update. Please try again.', 'error');
    }
}

// --- Phase 104 Plan 02 Task 2: Issues tab ---

function _issueSeqNum(issueId) {
    const sorted = [...journalIssues].sort((a, b) => {
        const aS = a.created_at?.seconds ?? 0;
        const bS = b.created_at?.seconds ?? 0;
        return aS - bS;
    });
    const idx = sorted.findIndex(i => i.id === issueId);
    if (idx === -1) return issueId.slice(-4);
    return idx + 1;
}

const ISSUE_TYPE_LABELS = {
    delay: 'Delay',
    change_order: 'Change Order',
    site_issue: 'Site Issue',
    client_request: 'Client Request',
};
const ISSUE_TYPE_DOT_CLASS = { delay: 'delay', change_order: 'change', site_issue: 'site', client_request: 'client' };
const ISSUE_TYPE_BADGE_CLASS = { delay: 'delay', change_order: 'change', site_issue: 'site', client_request: 'client-req' };

function _renderIssueRow(issue, isReadOnly) {
    const typeLabel = ISSUE_TYPE_LABELS[issue.issue_type] || escapeHTML(issue.issue_type || '');
    const isResolved = issue.status === 'resolved';
    const dotClass = ISSUE_TYPE_DOT_CLASS[issue.issue_type] || 'delay';
    const badgeClass = ISSUE_TYPE_BADGE_CLASS[issue.issue_type] || 'delay';

    const ts = issue.created_at?.seconds
        ? new Date(issue.created_at.seconds * 1000)
        : (issue.created_at?.toDate ? issue.created_at.toDate() : new Date());
    const loggedStr = ts.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });

    let resolvedDateStr = '';
    if (isResolved && issue.resolved_at) {
        const rts = issue.resolved_at?.seconds
            ? new Date(issue.resolved_at.seconds * 1000)
            : (issue.resolved_at?.toDate ? issue.resolved_at.toDate() : null);
        if (rts) resolvedDateStr = ` · Resolved ${rts.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}`;
    }

    const isResolvingThis = !isReadOnly && !isResolved && journalResolvingIssueId === issue.id;

    let actionBtn = '';
    if (!isReadOnly) {
        if (isResolved) {
            actionBtn = `<button class="journal-cancel-btn" style="margin-left:auto;" onclick="window.reopenIssue('${escapeHTML(issue.id)}')">Re-open</button>`;
        } else if (!isResolvingThis) {
            actionBtn = `<button class="journal-post-btn" style="margin-left:auto;background:#f59e0b;" onclick="window.showResolveForm('${escapeHTML(issue.id)}')">Mark Resolved</button>`;
        }
    }

    const resolutionBlock = isResolved && issue.resolution_notes ? `
        <div class="journal-resolution-notes"><span style="font-weight:600;">Resolution:</span> ${escapeHTML(issue.resolution_notes)}</div>` : '';

    const resolveFormHtml = isResolvingThis ? `
        <div class="journal-resolve-form">
            <textarea id="journalResolveNotes" placeholder="Resolution notes (required)" rows="2"></textarea>
            <div class="journal-form-actions" style="margin-top:8px;">
                <button class="journal-cancel-btn" onclick="window.cancelResolveForm()">Cancel</button>
                <button class="journal-post-btn" onclick="window.resolveIssue('${escapeHTML(issue.id)}')">Submit Resolution</button>
            </div>
        </div>` : '';

    return `<div class="journal-issue-card${isResolved ? ' resolved' : ''}">
        <div class="journal-issue-left">
            <div class="journal-issue-type-dot journal-dot-${escapeHTML(dotClass)}"></div>
        </div>
        <div class="journal-issue-right">
            <div class="journal-issue-title">${escapeHTML(issue.title || '')}</div>
            ${issue.description ? `<div class="journal-issue-desc">${escapeHTML(issue.description)}</div>` : ''}
            <div class="journal-issue-footer">
                <span class="journal-issue-type-badge journal-badge-${escapeHTML(badgeClass)}">${typeLabel.toUpperCase()}</span>
                ${isResolved ? `<span class="journal-issue-type-badge journal-badge-resolved">✓ RESOLVED</span>` : ''}
                <span class="journal-issue-date">Logged ${escapeHTML(loggedStr)}${escapeHTML(resolvedDateStr)}</span>
                ${actionBtn}
            </div>
            ${resolutionBlock}
            ${resolveFormHtml}
        </div>
    </div>`;
}

function _buildIssuesTabHtml(service, isReadOnly) {
    const openCount = journalIssues.filter(i => i.status === 'open').length;
    const resolvedCount = journalIssues.filter(i => i.status === 'resolved').length;
    const totalCount = journalIssues.length;

    const filterChips = [
        { key: 'all', label: `All (${totalCount})` },
        { key: 'open', label: `Open (${openCount})` },
        { key: 'resolved', label: `Resolved (${resolvedCount})` },
    ].map(f =>
        `<button class="journal-filter-chip${journalIssueFilter === f.key ? ' active' : ''}" onclick="window.setIssueFilter('${f.key}')">${f.label}</button>`
    ).join('');

    const toolbarHtml = `<div class="journal-issue-toolbar">
        <div class="journal-filter-chips">${filterChips}</div>
        ${!isReadOnly ? `<button class="journal-new-btn" style="margin-bottom:0;" onclick="window.toggleIssueForm()">${journalIssueFormOpen ? '✕ Cancel' : '+ Log Issue'}</button>` : ''}
    </div>`;

    const formHtml = !isReadOnly ? `
        <div class="journal-issue-form${journalIssueFormOpen ? ' visible' : ''}">
            <div class="journal-form-row">
                <label>Issue Type</label>
                <select id="journalIssueType">
                    <option value="delay">Delay</option>
                    <option value="change_order">Change Order</option>
                    <option value="site_issue">Site Issue</option>
                    <option value="client_request">Client Request</option>
                </select>
            </div>
            <div class="journal-form-row">
                <label>Title <span style="color:#ef4444">*</span></label>
                <input type="text" id="journalIssueTitle" placeholder="Short description of the issue" />
            </div>
            <div class="journal-form-row">
                <label>Details</label>
                <textarea id="journalIssueDesc" placeholder="What happened? Impact? Action taken?" rows="2"></textarea>
            </div>
            <div class="journal-form-actions">
                <button class="journal-cancel-btn" onclick="window.toggleIssueForm()">Cancel</button>
                <button class="journal-post-btn" style="background:#ef4444;" onclick="window.submitNewIssue()">Log Issue</button>
            </div>
        </div>` : '';

    const filtered = journalIssues.filter(i => {
        if (journalIssueFilter === 'open') return i.status === 'open';
        if (journalIssueFilter === 'resolved') return i.status === 'resolved';
        return true;
    });

    const listHtml = filtered.length === 0
        ? '<div style="color:#94a3b8;font-size:0.82rem;padding:0.5rem 0;">No issues logged yet.</div>'
        : filtered.map(i => _renderIssueRow(i, isReadOnly)).join('');

    return `${toolbarHtml}${formHtml}<div class="journal-issue-list">${listHtml}</div>`;
}

function setIssueFilter(f) {
    journalIssueFilter = f;
    _renderServiceJournalPanelInPlace();
}

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
        await addDoc(collection(db, 'services', currentServiceDocId, 'issues'), {
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
        // Phase 104 D-14 — fire-and-forget, NOT batched, success-path-only.
        updateDoc(doc(db, 'services', currentServiceDocId), { last_activity_at: serverTimestamp() })
            .catch(err => console.debug('[ServiceDetail/Journal] last_activity_at bump denied/failed (non-blocking):', err?.code || err));
        journalIssueFormOpen = false;
        showToast('Issue logged.', 'success');
        if (titleEl) titleEl.value = '';
        if (descEl) descEl.value = '';
    } catch (err) {
        console.error('[ServiceDetail/Journal] submitNewIssue failed:', err);
        showToast('Failed to log issue. Please try again.', 'error');
    }
}

async function resolveIssue(issueId) {
    const notesEl = document.getElementById('journalResolveNotes');
    const notes = (notesEl?.value || '').trim();
    if (!notes) { showToast('Resolution notes are required.', 'error'); return; }

    const cu = window.getCurrentUser?.();
    try {
        await updateDoc(doc(db, 'services', currentServiceDocId, 'issues', issueId), {
            status: 'resolved',
            resolution_notes: notes,
            resolved_at: serverTimestamp(),
            resolved_by_uid: cu?.uid ?? '',
        });
        const issue = journalIssues.find(i => i.id === issueId);
        if (issue) {
            const issueNum = _issueSeqNum(issueId);
            await _addServiceActivityEntry(currentServiceDocId, {
                type: 'system',
                is_system: true,
                text: `Issue #${issueNum} (${escapeHTML(issue.issue_type)} — ${escapeHTML(issue.title)}) resolved by ${cu?.full_name || 'Unknown'}`,
            });
        }
        // Phase 104 D-14 — fire-and-forget, NOT batched, success-path-only.
        updateDoc(doc(db, 'services', currentServiceDocId), { last_activity_at: serverTimestamp() })
            .catch(err => console.debug('[ServiceDetail/Journal] last_activity_at bump denied/failed (non-blocking):', err?.code || err));
        journalResolvingIssueId = null;
        showToast('Issue resolved.', 'success');
    } catch (err) {
        console.error('[ServiceDetail/Journal] resolveIssue failed:', err);
        showToast('Failed to resolve issue. Please try again.', 'error');
    }
}

async function reopenIssue(issueId) {
    const cu = window.getCurrentUser?.();
    try {
        await updateDoc(doc(db, 'services', currentServiceDocId, 'issues', issueId), {
            status: 'open',
            resolution_notes: null,
            resolved_at: null,
            resolved_by_uid: null,
        });
        const issueNum = _issueSeqNum(issueId);
        await _addServiceActivityEntry(currentServiceDocId, {
            type: 'system',
            is_system: true,
            text: `Issue #${issueNum} re-opened by ${cu?.full_name || 'Unknown'}`,
        });
        // Phase 104 D-14 — fire-and-forget, NOT batched, success-path-only.
        updateDoc(doc(db, 'services', currentServiceDocId), { last_activity_at: serverTimestamp() })
            .catch(err => console.debug('[ServiceDetail/Journal] last_activity_at bump denied/failed (non-blocking):', err?.code || err));
        showToast('Issue re-opened.', 'success');
    } catch (err) {
        console.error('[ServiceDetail/Journal] reopenIssue failed:', err);
        showToast('Failed to re-open issue. Please try again.', 'error');
    }
}

function editProgressUpdate(id) {
    journalEditingProgressId = id;
    _renderServiceJournalPanelInPlace();
}

function cancelEditProgressUpdate() {
    journalEditingProgressId = null;
    _renderServiceJournalPanelInPlace();
}

async function saveEditProgressUpdate(id) {
    const pctEl = document.getElementById('journalEditPct-' + id);
    const summaryEl = document.getElementById('journalEditSummary-' + id);
    const blockersEl = document.getElementById('journalEditBlockers-' + id);
    const nextEl = document.getElementById('journalEditNext-' + id);

    const summary = (summaryEl?.value || '').trim();
    if (!summary) { showToast('Summary is required.', 'error'); return; }

    const pct = Math.max(0, Math.min(100, parseInt(pctEl?.value || '0', 10) || 0));
    const blockers = (blockersEl?.value || '').trim();
    const next_milestone = (nextEl?.value || '').trim();

    const cu = window.getCurrentUser?.();
    const puRef = doc(db, 'services', currentServiceDocId, 'progress_updates', id);

    try {
        const prevSnap = await getDoc(puRef);
        const prev = prevSnap.exists() ? prevSnap.data() : {};
        const historyEntry = {
            edited_by_uid: cu?.uid ?? '',
            edited_by_name: cu?.full_name || cu?.email || 'Unknown',
            edited_at: new Date(),
            prev_pct_complete: prev.pct_complete ?? 0,
            prev_summary: prev.summary ?? '',
            prev_blockers: prev.blockers ?? '',
            prev_next_milestone: prev.next_milestone ?? '',
        };
        await updateDoc(puRef, {
            pct_complete: pct,
            summary,
            blockers,
            next_milestone,
            edit_history: arrayUnion(historyEntry),
        });
        journalEditingProgressId = null;
        _renderServiceJournalPanelInPlace();
        showToast('Progress update saved.', 'success');
    } catch (err) {
        console.error('[ServiceDetail/Journal] saveEditProgressUpdate failed:', err);
        showToast('Failed to save. Please try again.', 'error');
    }
}

function toggleProgressForm() {
    journalProgressFormOpen = !journalProgressFormOpen;
    _renderServiceJournalPanelInPlace();
}

function toggleIssueForm() {
    journalIssueFormOpen = !journalIssueFormOpen;
    _renderServiceJournalPanelInPlace();
}

function showResolveForm(issueId) {
    journalResolvingIssueId = issueId;
    _renderServiceJournalPanelInPlace();
}

function cancelResolveForm() {
    journalResolvingIssueId = null;
    _renderServiceJournalPanelInPlace();
}

// Idempotent attach of all three journal subcollection listeners (mirror project ensureJournalListeners).
function ensureServiceJournalListeners() {
    if (!currentServiceDocId) return;
    const serviceDocId = currentServiceDocId;

    if (!journalActivityUnsub) {
        journalActivityUnsub = onSnapshot(
            query(collection(db, 'services', serviceDocId, 'activity_entries'), orderBy('created_at', 'desc'), limit(50)),
            (snap) => { journalActivityEntries = []; snap.forEach(d => journalActivityEntries.push({ id: d.id, ...d.data() })); _renderServiceJournalPanelInPlace(); },
            (err) => { console.error('[ServiceDetail/Journal] activity_entries snapshot error:', err); }
        );
    }
    if (!journalProgressUnsub) {
        journalProgressUnsub = onSnapshot(
            query(collection(db, 'services', serviceDocId, 'progress_updates'), orderBy('created_at', 'desc'), limit(50)),
            (snap) => { journalProgressUpdates = []; snap.forEach(d => journalProgressUpdates.push({ id: d.id, ...d.data() })); _renderServiceJournalPanelInPlace(); },
            (err) => { console.error('[ServiceDetail/Journal] progress_updates snapshot error:', err); }
        );
    }
    if (!journalIssuesUnsub) {
        journalIssuesUnsub = onSnapshot(
            query(collection(db, 'services', serviceDocId, 'issues'), orderBy('created_at', 'desc'), limit(50)),
            (snap) => { journalIssues = []; snap.forEach(d => journalIssues.push({ id: d.id, ...d.data() })); _renderServiceJournalPanelInPlace(); },
            (err) => { console.error('[ServiceDetail/Journal] issues snapshot error:', err); }
        );
    }
}

// Attach window functions
function attachWindowFunctions() {
    window.saveServiceField = saveServiceField;
    window.toggleServiceDetailActive = toggleServiceDetailActive;
    window.selectDetailServicePersonnel = selectDetailServicePersonnel;
    window.removeDetailServicePersonnel = removeDetailServicePersonnel;
    window.filterDetailServicePersonnelDropdown = filterDetailServicePersonnelDropdown;
    window.showDetailServicePersonnelDropdown = showDetailServicePersonnelDropdown;
    window.refreshServiceExpense = refreshServiceExpense;
    // Phase 99.1 D-16 — single always-refresh Full Breakdown entry (collapses the show/refresh split)
    window.openServiceFullBreakdown = async () => {
        if (!currentService) return;
        await refreshServiceExpense(true);
        showExpenseBreakdownModal(currentService.service_code, {
            mode: 'service',
            displayName: currentService.service_name,
            budget: currentService.budget
        });
    };
    window.showEditHistory = () => currentService && currentServiceDocId &&
        showEditHistoryModal(currentServiceDocId, currentService.service_code, 'services');
    window.exportServiceExpenseCSV = exportServiceExpenseCSV;
    // Phase 87.1 D-05 — inline proposal card window functions
    window.openProposalModal = openProposalModal;
    window.openProposalInlineSubmitModal = openProposalInlineSubmitModal;
    window.closeProposalInlineSubmitModal = () => { document.getElementById('proposal-inline-submit-modal')?.remove(); };
    window.confirmProposalInlineSubmit = confirmProposalInlineSubmit;
    // Phase 87.3 D-01 — Start Proposal button support
    window.openCreateProposalModal = openCreateProposalModal;
    // Phase 99.1 — billing request flow (Phase 99 port)
    window.openBillingRequestModal = openBillingRequestModal;
    window.submitBillingRequest = submitBillingRequest;
    window._onBillingTrancheChange = _onBillingTrancheChange;
    window._selectBillingType = _selectBillingType;
    window._validateBillingForm = _validateBillingForm;
    // Phase 104 — Activity Journal (Task 1: 3 handlers)
    window.switchJournalTab = switchJournalTab;
    window.selectJournalTag = selectJournalTag;
    window.postActivityEntry = postActivityEntry;
    // Phase 104 — Activity Journal (Task 2: 12 handlers)
    window.submitProgressUpdate = submitProgressUpdate;
    window.editProgressUpdate = editProgressUpdate;
    window.cancelEditProgressUpdate = cancelEditProgressUpdate;
    window.saveEditProgressUpdate = saveEditProgressUpdate;
    window.setIssueFilter = setIssueFilter;
    window.submitNewIssue = submitNewIssue;
    window.resolveIssue = resolveIssue;
    window.reopenIssue = reopenIssue;
    window.toggleProgressForm = toggleProgressForm;
    window.toggleIssueForm = toggleIssueForm;
    window.showResolveForm = showResolveForm;
    window.cancelResolveForm = cancelResolveForm;
    // Phase 104 — Lifecycle accordion (9 handlers)
    window.toggleServiceLifecycleAccordion = toggleServiceLifecycleAccordion;
    window.lcServiceAttachLink = async function(which) {
        const dk = LC_DOC_KEYS[which];
        if (!dk || !currentService) return;
        const el = document.getElementById('az' + dk.L + 'Link');
        const url = el ? el.value.trim() : '';
        if (!url || !/^https?:\/\//i.test(url)) {
            if (el) { el.style.borderColor = '#ef4444'; setTimeout(() => { el.style.borderColor = ''; }, 1400); }
            showToast('Please enter a valid https:// link.', 'error');
            return;
        }
        const prev = {
            [dk.prefix + '_url']:      currentService[dk.prefix + '_url'],
            [dk.prefix + '_kind']:     currentService[dk.prefix + '_kind'],
            [dk.prefix + '_filename']: currentService[dk.prefix + '_filename'],
        };
        currentService[dk.prefix + '_url'] = url;
        currentService[dk.prefix + '_kind'] = 'link';
        currentService[dk.prefix + '_filename'] = null;
        buildServiceLifecycleBodyInPlace(currentService, window.getCurrentUser?.() || null);
        try {
            await _attachDocumentToService(currentServiceDocId, {
                [dk.prefix + '_url']: url,
                [dk.prefix + '_kind']: 'link',
                [dk.prefix + '_filename']: null,
            });
        } catch (err) {
            Object.assign(currentService, prev);
            buildServiceLifecycleBodyInPlace(currentService, window.getCurrentUser?.() || null);
            showToast('Failed to save document. Please try again.', 'error');
        }
    };
    window.lcServiceAttachFile = async function(which, filename) {
        const dk = LC_DOC_KEYS[which];
        if (!dk || !currentService) return;
        const prev = {
            [dk.prefix + '_url']:      currentService[dk.prefix + '_url'],
            [dk.prefix + '_kind']:     currentService[dk.prefix + '_kind'],
            [dk.prefix + '_filename']: currentService[dk.prefix + '_filename'],
        };
        currentService[dk.prefix + '_url'] = filename;
        currentService[dk.prefix + '_kind'] = 'file';
        currentService[dk.prefix + '_filename'] = filename;
        buildServiceLifecycleBodyInPlace(currentService, window.getCurrentUser?.() || null);
        try {
            await _attachDocumentToService(currentServiceDocId, {
                [dk.prefix + '_url']: filename,
                [dk.prefix + '_kind']: 'file',
                [dk.prefix + '_filename']: filename,
            });
        } catch (err) {
            Object.assign(currentService, prev);
            buildServiceLifecycleBodyInPlace(currentService, window.getCurrentUser?.() || null);
            showToast('Failed to save document. Please try again.', 'error');
        }
    };
    window.lcRemoveServiceDoc = async function(which) {
        const dk = LC_DOC_KEYS[which];
        if (!dk || !currentService) return;
        const prev = {
            [dk.prefix + '_url']:      currentService[dk.prefix + '_url'],
            [dk.prefix + '_kind']:     currentService[dk.prefix + '_kind'],
            [dk.prefix + '_filename']: currentService[dk.prefix + '_filename'],
        };
        currentService[dk.prefix + '_url'] = null;
        currentService[dk.prefix + '_kind'] = null;
        currentService[dk.prefix + '_filename'] = null;
        buildServiceLifecycleBodyInPlace(currentService, window.getCurrentUser?.() || null);
        try {
            await _attachDocumentToService(currentServiceDocId, {
                [dk.prefix + '_url']: null,
                [dk.prefix + '_kind']: null,
                [dk.prefix + '_filename']: null,
            });
        } catch (err) {
            Object.assign(currentService, prev);
            buildServiceLifecycleBodyInPlace(currentService, window.getCurrentUser?.() || null);
            showToast('Failed to remove document. Please try again.', 'error');
        }
    };
    window.lcServiceSwitchTab = function(L, tab) {
        const lp = document.getElementById('az' + L + 'LinkP');
        const fp = document.getElementById('az' + L + 'FileP');
        const lt = document.getElementById('az' + L + 'TabL');
        const ft = document.getElementById('az' + L + 'TabF');
        if (lp) lp.style.display = tab === 'link' ? '' : 'none';
        if (fp) fp.style.display = tab === 'file' ? '' : 'none';
        if (lt) lt.classList.toggle('active', tab === 'link');
        if (ft) ft.classList.toggle('active', tab === 'file');
    };
    // Phase 104 — lifecycle gate transitions (each: status+status_changed_at, audit, activity, D-14 bump)
    window.lcAdvanceServiceToForProposal = async function(serviceDocId) {
        if (!currentService || currentServiceDocId !== serviceDocId) return;
        if (!currentService.inspection_report_url) { showToast('Inspection report required.', 'error'); return; }
        const cu = window.getCurrentUser?.();
        if (!_canAdvanceServiceStatus(currentService, cu, 'For Proposal')) { showToast('Permission denied.', 'error'); return; }
        try {
            await updateDoc(doc(db, 'services', serviceDocId), { project_status: 'For Proposal', status_changed_at: serverTimestamp(), updated_at: serverTimestamp() });
            await addServiceAuditEntry(serviceDocId, 'ADVANCED_TO_FOR_PROPOSAL', cu?.uid, cu?.full_name, '');
            await _addServiceActivityEntry(serviceDocId, { type: 'system', is_system: true, text: `Status advanced to For Proposal by ${cu?.full_name || 'Unknown'}` });
            updateDoc(doc(db, 'services', serviceDocId), { last_activity_at: serverTimestamp() }).catch(err => console.debug('[ServiceDetail] last_activity_at bump non-blocking:', err?.code || err));
        } catch (err) { console.error('[ServiceDetail] lcAdvanceServiceToForProposal failed:', err); showToast('Failed to advance status.', 'error'); }
    };
    window.lcStartServiceMobilization = async function(serviceDocId) {
        if (!currentService || currentServiceDocId !== serviceDocId) return;
        if (!currentService.ntp_document_url) { showToast('NTP or PO required.', 'error'); return; }
        const cu = window.getCurrentUser?.();
        if (!_canAdvanceServiceStatus(currentService, cu, 'For Mobilization')) { showToast('Permission denied.', 'error'); return; }
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        try {
            await updateDoc(doc(db, 'services', serviceDocId), { project_status: 'For Mobilization', status_changed_at: serverTimestamp(), mobilization_started_at: now, updated_at: serverTimestamp() });
            await addServiceAuditEntry(serviceDocId, 'MOBILIZATION_STARTED', cu?.uid, cu?.full_name, 'mobilization_started_at: ' + now);
            await _addServiceActivityEntry(serviceDocId, { type: 'system', is_system: true, text: `Mobilization started by ${cu?.full_name || 'Unknown'}` });
            updateDoc(doc(db, 'services', serviceDocId), { last_activity_at: serverTimestamp() }).catch(err => console.debug('[ServiceDetail] last_activity_at bump non-blocking:', err?.code || err));
        } catch (err) { console.error('[ServiceDetail] lcStartServiceMobilization failed:', err); showToast('Failed to start mobilization.', 'error'); }
    };
    window.lcStartService = async function(serviceDocId) {
        if (!currentService || currentServiceDocId !== serviceDocId) return;
        const cu = window.getCurrentUser?.();
        if (!_canAdvanceServiceStatus(currentService, cu, 'On-going')) { showToast('Permission denied.', 'error'); return; }
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        try {
            await updateDoc(doc(db, 'services', serviceDocId), { project_status: 'On-going', status_changed_at: serverTimestamp(), project_started_at: now, updated_at: serverTimestamp() });
            await addServiceAuditEntry(serviceDocId, 'PROJECT_STARTED', cu?.uid, cu?.full_name, 'project_started_at: ' + now);
            await _addServiceActivityEntry(serviceDocId, { type: 'system', is_system: true, text: `Project started by ${cu?.full_name || 'Unknown'}` });
            updateDoc(doc(db, 'services', serviceDocId), { last_activity_at: serverTimestamp() }).catch(err => console.debug('[ServiceDetail] last_activity_at bump non-blocking:', err?.code || err));
        } catch (err) { console.error('[ServiceDetail] lcStartService failed:', err); showToast('Failed to start project.', 'error'); }
    };
    window.lcMarkServiceComplete = async function(serviceDocId) {
        if (!currentService || currentServiceDocId !== serviceDocId) return;
        if (!currentService.completion_report_url || !currentService.certificate_of_completion_url) { showToast('Both Completion Report and COC required.', 'error'); return; }
        const cu = window.getCurrentUser?.();
        if (!_canAdvanceServiceStatus(currentService, cu, 'Completed')) { showToast('Permission denied — services admin required to mark Completed.', 'error'); return; }
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        // D-07 — capture DLP fields ONLY when a retention tranche exists.
        const payload = { project_status: 'Completed', status_changed_at: serverTimestamp(), project_completed_at: now, updated_at: serverTimestamp() };
        const retTranche = (currentService.collection_tranches || []).find(t => t.is_retention);
        if (retTranche) {
            const retPct = parseFloat(document.getElementById('gateDlpRetPct')?.value) || (parseFloat(retTranche.percentage) || 10);
            const months = parseInt(document.getElementById('gateDlpMonths')?.value) || 12;
            const startDate = document.getElementById('gateDlpStart')?.value || new Date().toISOString().slice(0, 10);
            const { dlp_expires_at, retention_amount } = computeDlpFields(startDate, months, parseFloat(currentService.contract_cost) || 0, retPct);
            Object.assign(payload, {
                dlp_months: months,
                dlp_start_date: startDate,
                dlp_expires_at: dlp_expires_at,
                retention_percentage: retPct,
                retention_amount: retention_amount,
                retention_released_at: null,
            });
        }
        try {
            await updateDoc(doc(db, 'services', serviceDocId), payload);
            await addServiceAuditEntry(serviceDocId, 'PROJECT_COMPLETED', cu?.uid, cu?.full_name, 'project_completed_at: ' + now);
            await _addServiceActivityEntry(serviceDocId, { type: 'system', is_system: true, text: `Project marked Completed by ${cu?.full_name || 'Unknown'}` });
            updateDoc(doc(db, 'services', serviceDocId), { last_activity_at: serverTimestamp() }).catch(err => console.debug('[ServiceDetail] last_activity_at bump non-blocking:', err?.code || err));
        } catch (err) { console.error('[ServiceDetail] lcMarkServiceComplete failed:', err); showToast('Failed to mark service complete.', 'error'); }
    };
    // PVD-LOSS-01 — stage-agnostic Mark as Loss modal opener
    window.openServiceLossModal = function(serviceId) {
        if (!currentService || currentService.id !== serviceId) return;
        // Defense in depth: re-check gate (button is gated at render time, but window fn must not trust DOM)
        const cu = window.getCurrentUser?.();
        const _status = currentService.project_status || 'For Inspection';
        if (['Loss', 'Completed'].includes(_status) || !canDriveServiceLoss(currentService, cu)) {
            showToast('Permission denied.', 'error');
            return;
        }
        document.getElementById('serviceLossModal')?.remove();
        const html = `
        <div id="serviceLossModal" class="modal" style="display:flex;z-index:1001;">
            <div class="modal-content" style="max-width:480px;margin:auto;">
                <div class="modal-header">
                    <h2 style="font-size:1.125rem;font-weight:600;margin:0;">Mark as Loss</h2>
                    <button class="modal-close" aria-label="Close" onclick="document.getElementById('serviceLossModal').remove()">&times;</button>
                </div>
                <div class="modal-body" style="padding:1.5rem;">
                    <p style="color:#475569;margin:0 0 1rem 0;font-size:14px;line-height:1.5;">This will permanently mark the service as Loss. This action cannot be undone.</p>
                    <label style="display:block;font-weight:600;color:#475569;font-size:0.875rem;margin-bottom:0.5rem;">Loss Reason <span style="color:#ef4444;">*</span></label>
                    <textarea id="serviceLossReason" rows="3" placeholder="Describe why this service was lost (client decision, budget, competitor, etc.)" style="width:100%;min-height:96px;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9375rem;box-sizing:border-box;resize:vertical;"></textarea>
                    <div id="serviceLossReasonError" style="display:none;color:#ea4335;font-size:13px;margin-top:4px;"></div>
                </div>
                <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:1rem 1.5rem;border-top:1px solid #e5e7eb;">
                    <button class="btn btn-outline" onclick="document.getElementById('serviceLossModal').remove()">Cancel</button>
                    <button class="btn btn-danger" onclick="window.submitServiceLoss('${escapeHTML(serviceId)}')">Confirm Loss</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    };
    // PVD-LOSS-01 — dual-path submitServiceLoss writer
    window.submitServiceLoss = async function(serviceId) {
        if (!currentService || currentService.id !== serviceId) return;
        if (_lossSubmitInFlight) return;  // PVD-LOSS-01 — double-submit guard
        // Defense in depth: re-check gate
        const cu = window.getCurrentUser?.();
        const _status = currentService.project_status || 'For Inspection';
        if (['Loss', 'Completed'].includes(_status) || !canDriveServiceLoss(currentService, cu)) {
            showToast('Permission denied.', 'error');
            return;
        }
        // Validate reason — 10-char minimum
        const reason = (document.getElementById('serviceLossReason')?.value || '').trim();
        if (reason.length < 10) {
            const errEl = document.getElementById('serviceLossReasonError');
            if (errEl) {
                errEl.textContent = 'Loss Reason is required (minimum 10 characters).';
                errEl.style.display = 'block';
            }
            return;
        }
        const oldStatus = currentService.project_status ?? null;
        _lossSubmitInFlight = true;
        showLoading(true);
        try {
            // Detect open proposal: status NOT in { 'client_approved', 'loss' }
            const propSnap = await getDocs(query(collection(db, 'proposals'), where('project_id', '==', serviceId)));
            const openProposalDoc = propSnap.docs.find(d => {
                const s = d.data().status;
                return s !== 'client_approved' && s !== 'loss';
            });

            if (openProposalDoc) {
                // PATH A — open proposal exists: use canonical batch transition (atomic service + proposal update)
                const proposal = { id: openProposalDoc.id, ...openProposalDoc.data() };
                await _applyProposalStateTransition({
                    proposal,
                    newStatus: 'loss',
                    newProjectStatus: 'Loss',
                    auditAction: 'LOSS_RECORDED',
                    auditComment: reason,
                    extraProposalFields: { loss_reason: reason },
                    // Fold loss_reason into the SAME batch → atomic service-doc write (no follow-up updateDoc)
                    extraProjectFields: { loss_reason: reason }
                });
                // Refresh proposal card to reflect loss state
                loadProposalCard(serviceId, currentService.parent_collection || 'services');
            } else {
                // PATH B — no open proposal: write service doc directly in one atomic updateDoc
                await updateDoc(doc(db, 'services', serviceId), {
                    project_status: 'Loss',
                    loss_reason: reason,
                    status_changed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            }

            // Both paths — mirror saveServiceField project_status side-effects (fire-and-forget).
            recordEditHistory(serviceId, 'update', [{ field: 'project_status', old_value: oldStatus, new_value: 'Loss' }], 'services')
                .catch(err => console.error('[ServiceDetail] submitServiceLoss recordEditHistory failed:', err));
            // NOTIF-11: notify assigned personnel of status change to Loss (both paths, for parity)
            const recipients = (currentService.personnel_user_ids || []).filter(Boolean);
            if (recipients.length > 0) {
                const serviceLink = currentService.service_code
                    ? `#/services/detail/${currentService.service_code}`
                    : '#/services';
                createNotificationForUsers({
                    user_ids: recipients,
                    type: NOTIFICATION_TYPES.PROJECT_STATUS_CHANGED,
                    message: `Service "${currentService.service_name}" status changed to: Loss`,
                    link: serviceLink,
                    source_collection: 'services',
                    source_id: currentService.service_code || serviceId,
                    object_name: currentService.service_name || '',
                    actor_name: cu?.full_name || 'System'
                }).catch(err => console.error('[ServiceDetail] submitServiceLoss NOTIF-11 failed:', err));
            }

            // Both paths: audit entry + activity feed entry
            addServiceAuditEntry(serviceId, 'LOSS_RECORDED', cu?.uid, cu?.full_name, reason)
                .catch(err => console.error('[ServiceDetail] submitServiceLoss audit entry failed:', err));
            _addServiceActivityEntry(serviceId, { type: 'system', is_system: true, text: `Service marked as Loss by ${cu?.full_name || 'Unknown'}` })
                .catch(err => console.error('[ServiceDetail] submitServiceLoss activity entry failed:', err));

            document.getElementById('serviceLossModal')?.remove();
            showToast('Service marked as Loss.', 'success');
            // onSnapshot listener re-renders the detail page automatically
        } catch (err) {
            console.error('[ServiceDetail] submitServiceLoss failed:', err);
            const _denied = err?.code === 'permission-denied' || /insufficient permissions/i.test(err?.message || '');
            showToast(_denied ? 'You do not have permission to mark this as Loss.' : (err?.message || 'Failed to record loss. Please try again.'), 'error');
        } finally {
            showLoading(false);
            _lossSubmitInFlight = false;
        }
    };
    // Phase 104 — inline tranche editor (8 handlers) + Finance Record Release
    window.toggleTrancheEditor = toggleTrancheEditor;
    window.updateEditorTrancheLabel = updateEditorTrancheLabel;
    window.updateEditorTranchePercentage = updateEditorTranchePercentage;
    window.addEditorTrancheRow = addEditorTrancheRow;
    window.removeEditorTrancheRow = removeEditorTrancheRow;
    window.toggleTrancheRetention = toggleTrancheRetention;
    window.saveTrancheEditor = saveTrancheEditor;
    window.cancelTrancheEditor = cancelTrancheEditor;
    window.recordServiceRetentionRelease = async function(serviceDocId) {
        if (!currentService || currentServiceDocId !== serviceDocId) return;
        const cu = window.getCurrentUser?.();
        if (cu?.role !== 'finance') { showToast('Only Finance can record a retention release.', 'error'); return; }
        if (!confirm('Record the retention release for this service? This marks the withheld retention as released and closes the DLP.')) return;
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        try {
            await updateDoc(doc(db, 'services', serviceDocId), { retention_released_at: now, updated_at: serverTimestamp() });
            await addServiceAuditEntry(serviceDocId, 'RETENTION_RELEASED', cu?.uid, cu?.full_name, 'retention_released_at: ' + now);
            await _addServiceActivityEntry(serviceDocId, { type: 'system', is_system: true, text: `Retention released by ${cu?.full_name || 'Unknown'}` });
        } catch (err) { console.error('[ServiceDetail] recordServiceRetentionRelease failed:', err); showToast('Failed to record retention release.', 'error'); }
    };
}

// Phase 105 — Service Plan summary card helpers (mirror project-detail.js Phase 86 / D-01)

function _computeDurationDaysLocal(startDate, endDate) {
    if (!startDate || !endDate) return 1;
    const s = new Date(startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(endDate); e.setHours(0, 0, 0, 0);
    const days = Math.round((e - s) / 86400000) + 1;
    return Math.max(1, days);
}

function _todayLocalService() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function computeServiceProgress(tasks) {
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
        const dur = _computeDurationDaysLocal(l.start_date, l.end_date);
        const p = typeof l.progress === 'number' ? l.progress : 0;
        weightedSum += p * dur;
        weightTotal += dur;
    });
    result.percentComplete = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;

    // Use local-day, not UTC — toISOString() shifts off-by-one in PHT before 08:00.
    const today = _todayLocalService();

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

function buildServicePlanCardHtml() {
    const p = currentServiceProgress;
    const planUrl = `#/services/${encodeURIComponent(currentService?.service_code || '')}/plan`;
    const openPlanBtn = `<a href="${planUrl}" class="btn btn-primary"${!currentService?.service_code ? ' style="pointer-events:none;opacity:0.5;" title="No service code"' : ''}>Open Plan</a>`;

    if (p.taskCount === 0) {
        return `<div id="servicePlanCard" class="project-plan-card">
            <div class="plan-heading-new">Service Plan</div>
            <div style="padding:16px;">
                <div class="plan-empty-cta"><p>No tasks yet. Open the plan to get started.</p>${openPlanBtn}</div>
            </div>
        </div>`;
    }

    const pct = p.percentComplete;
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
        return `<div id="servicePlanCard" class="project-plan-card">
            <div class="plan-heading-new">Service Plan</div>
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

    return `<div id="servicePlanCard" class="project-plan-card">
        <div class="plan-heading-new">Service Plan</div>
        <div style="padding:16px;">${progressBarHtml}${topRow}${overdueDetail}${upcomingHtml}${lastDone}${footer}</div>
    </div>`;
}
