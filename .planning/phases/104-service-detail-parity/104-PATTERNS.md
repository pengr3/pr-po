# Phase 104: Service Detail Parity (Lifecycle · Journal · DLP) - Pattern Map

**Mapped:** 2026-06-13
**Files analyzed:** 5 (1 target view, 1 trigger view, 1 signal view, 1 stylesheet, 1 rules file)
**Analogs found:** 5 / 5 (all exact — this is a copy-then-adapt parity phase, analogs are not ambiguous)

> **Verified line numbers.** CONTEXT.md's line refs are approximate. The numbers below were confirmed against the live files on 2026-06-13. Where they differ, the verified number wins.
>
> **Sanctioned approach (Phase-26 / Claude's Discretion):** copy the project-detail.js function, paste into service-detail.js, then adapt `projects`→`services`, `currentProject`→`currentService`, `project.id`→`currentServiceDocId`, the role set, and the Draft branch. Small shared-helper extraction is allowed but copy-adapt is the default — do not block on abstraction.

---

## File Classification

| File (modified) | Role | Data Flow | Closest Analog | Match Quality |
|-----------------|------|-----------|----------------|---------------|
| `app/views/service-detail.js` | view (detail page) | CRUD + event-driven (onSnapshot) | `app/views/project-detail.js` | exact (mirror module) |
| `app/views/services.js` | view (portfolio) | transform (signal derivation) | self (`getServiceSignal` On-going branch) + `projects.js` | exact (in-file edit) |
| `app/views/procurement.js` | view (PO status) | event-driven (status write → auto-entry) | self (`updatePOStatus` project journal block @7962) | exact (parallel branch) |
| `styles/views.css` | stylesheet | n/a | self (Phase 100/101/102 blocks already present) | reuse as-is |
| `firestore.rules` | config (security) | n/a | `match /projects/{projectId}` subcollection + Finance branch | exact (mirror block) |

---

## Pattern Assignments

### A. `app/views/service-detail.js` — Lifecycle accordion (mirror Phase 100)

**Analog functions in `project-detail.js`** (verified): `LC_STAGES` const `83-92`; `_getProjectStatusColor` `94-108`; `LC_DOC_KEYS` `2463-2468`; `buildAttachZone` `2470-2498`; `buildPATrack` `2500-2526`; `buildDocRollup` `2528-2558`; `buildLifecycleBody` `2560-2671`; `buildLifecycleBodyInPlace` `2673-2680`; `buildLifecycleTrack` `2684-2732`; `renderLifecycleCard` `2734-2754`; `updateLifecycleBadge` `2756-2787`; `toggleLifecycleAccordion` `2789-2797`; `_canAdvanceProjectStatus` `2800-2810`; `addProjectAuditEntry` `2812-2824`; `_attachDocumentToProject` `3622-3627`; gate window-fns `lcAttachLink/lcAttachFile/lcRemoveDoc/lcSwitchTab` `3690-3778`; gate transitions `lcAdvanceToForProposal/lcStartMobilization/lcStartProject/lcMarkProjectComplete` `3780-3842`.

**Lifecycle stage table** (project-detail.js `82-92`) — copy verbatim; `LC_STAGES` is status-driven and identical for services:
```javascript
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
```

**Gate-permission helper** (project-detail.js `2800-2810`) — the role swap is here (D-04):
```javascript
function _canAdvanceProjectStatus(project, currentUser, targetStatus) {
    if (!currentUser || !project) return false;
    const role = currentUser.role || '';
    if (['super_admin', 'operations_admin'].includes(role)) return true;   // → ['super_admin','services_admin']
    if (role === 'operations_user') {                                       // → 'services_user'
        const ids = Array.isArray(project.personnel_user_ids) ? project.personnel_user_ids : [];
        return ids.includes(currentUser.uid);
    }
    return false;
}
```
**Service adaptation:** `operations_admin`→`services_admin`, `operations_user`→`services_user`. **D-04 Completion gate is `services_admin`-only** — the Completed transition must NOT allow `services_user`; project parity has ops_user able to complete, so add a `targetStatus === 'Completed' ? services_admin-only : ...` branch (this is the one deviation from a pure copy of this helper). `currentService.personnel_user_ids` is the assignment array (confirmed used at service-detail.js `1133`, `1666`).

**Gate transition + stamp + auto-entry** (project-detail.js `3780-3790`, representative) — note the **3 writes per gate** that D-06/D-12 require:
```javascript
window.lcAdvanceToForProposal = async function(projectId) {
    if (!currentProject || currentProject.id !== projectId) return;
    if (!currentProject.inspection_report_url) { showToast('Inspection report required.', 'error'); return; }
    const cu = window.getCurrentUser?.();
    if (!_canAdvanceProjectStatus(currentProject, cu, 'For Proposal')) { showToast('Permission denied.', 'error'); return; }
    try {
        await updateDoc(doc(db, 'projects', projectId), { project_status: 'For Proposal', status_changed_at: serverTimestamp(), updated_at: serverTimestamp() });
        await addProjectAuditEntry(projectId, 'ADVANCED_TO_FOR_PROPOSAL', cu?.uid, cu?.full_name, '');
        await _addActivityEntry(projectId, { type: 'system', is_system: true, text: `Status advanced to For Proposal by ${cu?.full_name || 'Unknown'}` });
    } catch (err) { console.error('[ProjectDetail] lcAdvanceToForProposal failed:', err); showToast('Failed to advance status.', 'error'); }
};
```
**Service adaptation per gate:** (a) write `services/{currentServiceDocId}` with `project_status` + `status_changed_at: serverTimestamp()` (D-06 — services already write `status_changed_at` on manual change at service-detail.js `1153`, so reuse the same field); (b) `addServiceAuditEntry` (new mirror of `addProjectAuditEntry`, writing `services/{id}/audit_log`); (c) `_addActivityEntry` (new mirror writing `services/{id}/activity_entries`). **Per D-14, also fire-and-forget bump `last_activity_at`** on the gate write — see the journal `_addActivityEntry` pattern below for the exact landmine shape.

**`lcMarkProjectComplete` — the DLP-capture gate** (project-detail.js `3814-3842`) — copy verbatim; carries the retention-tranche guard (D-07) and `computeDlpFields`:
```javascript
const payload = { project_status: 'Completed', status_changed_at: serverTimestamp(), project_completed_at: now, updated_at: serverTimestamp() };
const retTranche = (currentProject.collection_tranches || []).find(t => t.is_retention);
if (retTranche) {
    const retPct = parseFloat(document.getElementById('gateDlpRetPct')?.value) || (parseFloat(retTranche.percentage) || 10);
    const months = parseInt(document.getElementById('gateDlpMonths')?.value) || 12;
    const startDate = document.getElementById('gateDlpStart')?.value || new Date().toISOString().slice(0, 10);
    const { dlp_expires_at, retention_amount } = computeDlpFields(startDate, months, parseFloat(currentProject.contract_cost) || 0, retPct);
    Object.assign(payload, { dlp_months: months, dlp_start_date: startDate, dlp_expires_at, retention_percentage: retPct, retention_amount, retention_released_at: null });
}
```
**Service adaptation:** `services` collection; `currentService.contract_cost`. **D-04: gate Completion `services_admin`-only.** The DLP fieldset HTML lives inside `buildLifecycleBody`'s `On-going` branch (project-detail.js `2624-2648`) — copy verbatim; gated by `(project.collection_tranches || []).some(t => t.is_retention)`.

**Draft branch (D-05):** `buildLifecycleBody` handles 10 status branches including `For Proposal`, `Proposal for Internal Approval`, `Proposal Under Client Review`/`For Revision`, and `Loss` as "✅ already implemented" deferrals to the proposal card (project-detail.js `2579-2587`, `2667-2668`). **There is NO explicit `Draft` case** in `buildLifecycleBody` — `Draft` falls through to the default at `2670` (`"No lifecycle action for current status."` + rollup), AND `buildLifecycleTrack` (`2684-2693`) maps an unknown status (`Draft`) to `curIdx = -1` so no node is "current". **D-05 means: port these branches as-is; Draft is covered by the existing fall-through + the proposal card the service already renders** (`loadProposalCard` at service-detail.js `1658`, the For-Proposal/Draft funnel). Verify the Draft fall-through renders acceptably; if a dedicated Draft body string is wanted, add one case mirroring the `For Proposal` "deferred to proposal card" shape.

**Accordion placement:** project-detail.js renders `${renderLifecycleCard(currentProject, user)}` at `642` (top of the detail, above the info/financial grid) and repopulates the body if open at `821` (`if (_lcOpen) buildLifecycleBodyInPlace(...)`). **D-02: this replaces the manual `project_status` dropdown** — in service-detail.js that dropdown is the `<select data-field="project_status">` at `851-864` inside Card 3 "Status & Assignment"; remove it and surface a read-only status pill in the header instead (project header pill pattern: project-detail.js `632`, `#hdrStatusBadge`).

**Snapshot suppression flag:** project-detail.js uses `_lcAttachPending` (`80`) so a doc-attach write that triggers the onSnapshot does an in-place `buildLifecycleBodyInPlace` instead of a full `renderProjectDetail` (init handler `261-267`, `313-319`). Mirror this in service-detail's `listener` snapshot callback (`142-171`) to avoid accordion flicker on attach.

---

### B. `app/views/service-detail.js` — Activity Journal (mirror Phase 101)

**Analog functions in `project-detail.js`** (verified): journal state vars `46-58`; `JOURNAL_WRITE_STATUSES`/`JOURNAL_VISIBLE_STATUSES` `2829-2830`; `_avatarColor`/`_avatarInitials` `2835-2846`; `selectJournalTag` `2848-2854`; `_buildJournalPanelHtml` `2856-2937`; `_renderFeedEntry` `2941-2979`; `_renderJournalPanelInPlace` `2983-2995`; `switchJournalTab` `2999-3007`; `postActivityEntry` `3013-3048`; `_addActivityEntry` `3053-3069`; `_renderProgressCard` `3074-3154`; `_buildProgressTabHtml` `3158-3194`; `submitProgressUpdate` `3197-3238`; issue helpers `3245-3265`; `_renderIssueRow` `3268-3327`; `_buildIssuesTabHtml` `3330-3384`; `setIssueFilter` `3387-3390`; `submitNewIssue` `3393-3432`; `resolveIssue` `3435-3464`; `reopenIssue` `3467-3488`; progress edit `3491-3543`; toggles `3545-3563`; `ensureJournalListeners` `3569-3620`.

**Shared write primitive** (project-detail.js `3053-3069`) — copy verbatim, returns boolean for the D-14 landmine:
```javascript
async function _addActivityEntry(projectId, { type, text, is_system = false }) {
    try {
        const cu = window.getCurrentUser?.();
        await addDoc(collection(db, 'projects', projectId, 'activity_entries'), {
            type, text, is_system,
            created_by_uid: cu?.uid ?? '',
            created_by_name: cu?.full_name || cu?.email || 'Unknown',
            created_at: serverTimestamp(),
        });
        return true;   // 103.1 D-03 — entry persisted; caller may refresh activity clock
    } catch (err) {
        console.error('[ProjectDetail/Journal] _addActivityEntry failed:', err);
        return false;  // swallowed; caller must NOT refresh the clock
    }
}
```
**Service adaptation:** `collection(db, 'services', serviceDocId, 'activity_entries')`. The caller passes `currentServiceDocId` (NOT `service_code` — subcollections hang off the Firestore doc id, exactly as project uses `currentProject.id`).

**D-14 fire-and-forget `last_activity_at` bump landmine** (project-detail.js `3041-3042` in `postActivityEntry`; identical at `3224-3225` in `submitProgressUpdate` and `3421-3422` in `submitNewIssue`):
```javascript
updateDoc(doc(db, 'projects', currentProject.id), { last_activity_at: serverTimestamp() })
    .catch(err => console.debug('[ProjectDetail/Journal] last_activity_at bump denied/failed (non-blocking):', err?.code || err));
```
**Service adaptation:** `doc(db, 'services', currentServiceDocId)`. **CRITICAL (D-14):** this is NOT awaited and NOT batched with the subcollection `addDoc` — a non-team active user can post a journal entry (subcollection `create: if isActiveUser()`) but their parent `services/{id}` write may be denied by the role-only services update rule; that denial must NOT roll back the entry. Only fire it on the success path (after `_addActivityEntry` returns true / after the `addDoc` resolves).

**Status gate (D-11)** — `_buildJournalPanelHtml` (project-detail.js `2856-2860`):
```javascript
const JOURNAL_WRITE_STATUSES = ['For Mobilization', 'On-going'];
const JOURNAL_VISIBLE_STATUSES = [...JOURNAL_WRITE_STATUSES, 'Completed'];
// ...
const isVisible = JOURNAL_VISIBLE_STATUSES.includes(project.project_status);
if (!isVisible) return '';
const isReadOnly = project.project_status === 'Completed';
```
**Service adaptation:** identical statuses (services use the same `project_status` field — confirmed `UNIFIED_STATUS_OPTIONS` at service-detail.js `39-50`). Hidden before mobilization and for Loss, read-only at Completed. Applies to both service types (recurring sits at On-going indefinitely — exactly when the journal is wanted).

**Three-listener attach** (project-detail.js `3569-3620`) — copy verbatim; all three attach simultaneously (zero churn on tab switch):
```javascript
function ensureJournalListeners() {
    if (!currentProject?.id) return;
    const projectId = currentProject.id;
    if (!journalActivityUnsub) {
        journalActivityUnsub = onSnapshot(
            query(collection(db, 'projects', projectId, 'activity_entries'), orderBy('created_at', 'desc'), limit(50)),
            (snap) => { journalActivityEntries = []; snap.forEach(d => journalActivityEntries.push({ id: d.id, ...d.data() })); _renderJournalPanelInPlace(); },
            (err) => { console.error('[ProjectDetail/Journal] activity_entries snapshot error:', err); }
        );
    }
    // ...progress_updates, issues — same shape
}
```
**Service adaptation:** `services`/`currentServiceDocId`. Gate the attach on visible status (project init `256-258` / `306-308`: `if (['For Mobilization','On-going','Completed'].includes(currentService?.project_status)) ensureServiceJournalListeners();`). Add the three new module-level unsub vars + entry arrays mirroring project-detail.js `46-58`, and tear them down in `destroy()` (project pattern `440-458`). **Note:** service-detail.js currently imports neither `orderBy` nor `limit` — its import line (`7`) must add them (project-detail.js imports them at `6`).

**Issue resolve/reopen auto-entries** (project-detail.js `resolveIssue` `3448-3457`, `reopenIssue` `3476-3482`) carry over verbatim (101 D-11..D-14) — required resolution notes + system Feed entry via `_addActivityEntry` with `_issueSeqNum`.

**Panel placement:** project-detail.js renders `${_buildJournalPanelHtml(currentProject)}` at `795` (below the bottom proposal/plan row). In-place re-render via `_renderJournalPanelInPlace` (`2983-2995`, uses `replaceWith`). Service-detail.js's `renderServiceDetail` (`652-888`) should append the panel after the proposal card (`869`).

---

### C. `app/views/service-detail.js` — DLP / retention (mirror Phase 102)

**Analog functions in `project-detail.js`** (verified): `isRetentionCollected` `909-921`; `getDlpState` `925-931`; `computeDlpFields` `934-941`; `renderDlpFinanceBar` `946-1026`; `renderTrancheDisplay` `1036-1059`; `renderTrancheEditor` `1062-1093`; `renderTrancheEditorHost` `1096-1101`; `toggleTrancheEditor` `1104-1126`; editor setters `1130-1170`; `saveTrancheEditor` `1173-1201`; `cancelTrancheEditor` `1204-1210`; `recordRetentionRelease` window-fn `3844-3855`.

> **Reuse note:** `service-detail.js` ALREADY has `computeTrancheLifecycle` (`308-339`) and `renderServiceTrancheLifecycle` (`582-608`) ported from Phase 99.1 — those are the read-display + billing-initiate rows. Phase 104 adds the **editor** (currently services have read-display only, no editor) + the **DLP finance bar** + **Record Release**. Do not duplicate the lifecycle-rows function.

**`getDlpState`** (project-detail.js `925-931`) — note `services.js` ALREADY has a service copy (`services.js` `926-931`, D-09 portfolio); the detail page needs the same logic but the project version also takes a `collectibleDocs` arg for the "fully-collected retention counts as released" rule:
```javascript
function getDlpState(project, collectibleDocs) {
    if (!project || !project.dlp_months || project.project_status !== 'Completed') return 'active';
    if (project.retention_released_at) return 'released';
    if (isRetentionCollected(project, collectibleDocs)) return 'released';
    if (Date.now() > new Date(project.dlp_expires_at).getTime()) return 'expired';
    return 'in-dlp';
}
```
**Service adaptation:** use `currentCollectibleDocs` (service-detail.js already maintains this via `ensureServiceCollectiblesListener` at `288-301`). The portfolio `services.js` copy (no collectibleDocs arg) stays as-is (D-09); the detail copy should take the arg to match the finance-bar's released logic. Mirror `isRetentionCollected` (`909-921`) too.

**`renderDlpFinanceBar`** (project-detail.js `946-1026`) — copy verbatim; reads `currentCollectibleDocs`, emits 4 states (`active`/`in-dlp`/`expired`/`released`) with `.finance-bar.state-*` + `.dlp-strip` classes. The Finance-only Release button is inline (`972-975`):
```javascript
const isFinance = (window.getCurrentUser?.()?.role === 'finance');
const releaseBtn = isFinance
    ? `<button class="release-btn" onclick="window.recordRetentionRelease('${escapeHTML(project?.id || '')}')">Record Release</button>`
    : '';
```
**Service adaptation:** `currentService.contract_cost`/`retention_amount`/`dlp_expires_at`/`retention_released_at` (all read `|| null` per D-08 legacy safety); pass `currentService.id` (= `currentServiceDocId`) to `recordRetentionRelease`.

**`recordRetentionRelease`** (project-detail.js `3844-3855`) — Finance-only direct write:
```javascript
window.recordRetentionRelease = async function(projectId) {
    if (!currentProject || currentProject.id !== projectId) return;
    const cu = window.getCurrentUser?.();
    if (cu?.role !== 'finance') { showToast('Only Finance can record a retention release.', 'error'); return; }
    if (!confirm('Record the retention release for this project? ...')) return;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    try {
        await updateDoc(doc(db, 'projects', projectId), { retention_released_at: now, updated_at: serverTimestamp() });
        await addProjectAuditEntry(projectId, 'RETENTION_RELEASED', cu?.uid, cu?.full_name, 'retention_released_at: ' + now);
        await _addActivityEntry(projectId, { type: 'system', is_system: true, text: `Retention released by ${cu?.full_name || 'Unknown'}` });
    } catch (err) { console.error('[ProjectDetail] recordRetentionRelease failed:', err); showToast('Failed to record retention release.', 'error'); }
};
```
**Service adaptation:** `services` collection; `currentServiceDocId`; service audit + service `_addActivityEntry`. Needs the **Finance Record-Release rule branch** under `match /services` (see firestore.rules below).

**Tranche editor** (project-detail.js `1062-1210` + `toggleTrancheEditor` `1104-1126`) — copy verbatim into service-detail.js. New module-level state vars `editorTranches = []` + `trancheEditorOpen = false` (project `60-62`). The editor host placement: project renders `<div id="trancheEditorHost">${renderTrancheDisplay()}${renderTrancheEditor()}</div>` at `782` inside the Financial card; in service-detail.js the Financial card is Card 2 (`759-842`), and `renderServiceTrancheLifecycle()` is already injected at `840` — insert the editor host above it. `toggleTrancheEditor` permission-gates via `_canAdvanceProjectStatus(currentService, cu, 'On-going')` (`1106`) → service role swap. `saveTrancheEditor` writes `collection_tranches` to `services/{currentServiceDocId}` (`1190`).

---

### D. `app/views/services.js` — On-going signal upgrade (D-13, the ONE behavioral deviation)

**Analog:** self — `getServiceSignal` On-going branch (`services.js` `956-965`), verified.
```javascript
if (status === 'On-going') {
    if (s.service_type !== 'recurring') {
        const ms = normalizeUpdatedAt(s.updated_at);                       // ← D-13: change to last_activity_at ?? updated_at
        const d = ms == null ? null : (now - ms) / 86400000;
        if (d != null && d > URGENCY_THRESHOLDS.ONGOING_QUIET_URGENT)       // 14d → still WATCH (capped)
            return { level: 'watch', text: `Quiet for ${Math.round(d)} days`, hint: 'One-time service untouched' };
    }
    if (dlp === 'in-dlp') return { level: 'ok', text: 'In defect liability period', hint: 'Retention held pending DLP' };
    return { level: 'ok', text: getServiceDefaultOkSignal(s), hint: '' };
}
```
**D-13 adaptation:** ONE-TIME services get the full project two-tier clock (🟠 quiet > 7d / 🔴 quiet > 14d) reading `last_activity_at ?? updated_at`. The reference is `projects.js` `getProjectSignal` On-going branch (the canonical two-tier shape). RECURRING stays exactly as-is (the `s.service_type !== 'recurring'` guard already suppresses recurring → On Track; D-05/103.1-conservative). The current code is watch-only capped at 14d; D-13 upgrades one-time to the two-tier (watch at >7d using `ONGOING_QUIET_WATCH`, urgent at >14d using `ONGOING_QUIET_URGENT`) — note `URGENCY_THRESHOLDS` already defines both (`services.js` `62`). Reading `last_activity_at` is now meaningful because Phase 104's journal writes populate it (D-14).

---

### E. `app/views/procurement.js` — PO-Delivered service auto-entry (D-12)

**Analog:** self — the project journal-entry block inside `updatePOStatus` (`procurement.js` `7962-7992`), verified. This block runs only on `newStatus === 'Delivered' && !isSubcon`:
```javascript
// Phase 101 D-08: auto-post system Feed entry to the owning project's activity_entries.
// POs carry NO project_id — resolve by traversal: poDataFresh.mrf_id → mrfs → MRF.project_name → projects → projectDocId
try {
    if (poDataFresh.mrf_id) {
        const mrfQ = query(collection(db, 'mrfs'), where('mrf_id', '==', poDataFresh.mrf_id));
        const mrfSnap = await getDocs(mrfQ);
        if (!mrfSnap.empty) {
            const mrfData = mrfSnap.docs[0].data();
            const projectName = mrfData.project_name;
            if (projectName) {
                const projQ = query(collection(db, 'projects'), where('project_name', '==', projectName));
                const projSnap = await getDocs(projQ);
                if (!projSnap.empty) {
                    const projectDocId = projSnap.docs[0].id;
                    await addDoc(collection(db, 'projects', projectDocId, 'activity_entries'), {
                        type: 'system', is_system: true,
                        text: `PO ${escapeHTML(poDataFresh.po_id || poId)} from ${escapeHTML(poDataFresh.supplier_name || 'Unknown Supplier')} marked Delivered`,
                        created_by_uid: window.getCurrentUser?.()?.uid ?? '',
                        created_by_name: window.getCurrentUser?.()?.full_name || 'System',
                        created_at: serverTimestamp(),
                    });
                }
            }
        }
    }
} catch (journalErr) {
    console.error('[Procurement] Phase 101 PO Delivered journal entry failed:', journalErr);
}
```
**Service adaptation (D-12):** add a parallel branch. **Key traversal difference:** the project branch resolves by `MRF.project_name → projects.project_name`. The service equivalent should resolve by **`MRF.service_code → services.service_code`** (services join on `service_code`, the field POs/MRFs carry — confirmed `mrfData.service_code` usage and `where('service_code','==',...)` throughout service-detail.js). The `mrfData` is already fetched in the existing block, so the service branch can reuse it: if `mrfData.service_code`, query `services` by `service_code`, get the doc id, and `addDoc(collection(db, 'services', serviceDocId, 'activity_entries'), {...})` with the same system-entry shape. Keep it in its own try/catch (never block the status update). An MRF belongs to either a project OR a service, so the two branches are mutually exclusive in practice but both can run defensively.

---

## Shared Patterns

### Pattern 1 — Mirror-module rename map (apply to every copied function)
| project-detail.js | service-detail.js |
|---|---|
| `currentProject` | `currentService` |
| `currentProject.id` | `currentServiceDocId` |
| `collection(db, 'projects', id, ...)` | `collection(db, 'services', currentServiceDocId, ...)` |
| `doc(db, 'projects', id)` | `doc(db, 'services', currentServiceDocId)` |
| roles `operations_admin` / `operations_user` | `services_admin` / `services_user` (D-04) |
| `addProjectAuditEntry` | `addServiceAuditEntry` (new) |
| `'[ProjectDetail...]'` log prefixes | `'[ServiceDetail...]'` |

`personnel_user_ids`, `project_status`, `collection_tranches`, `contract_cost`, the `*_url/*_kind/*_filename` doc fields, and all DLP fields (`dlp_months`/`dlp_start_date`/`dlp_expires_at`/`retention_percentage`/`retention_amount`/`retention_released_at`) keep the SAME names on `services` docs (D-03/D-08). Read DLP fields `|| null` for legacy safety (D-08).

### Pattern 2 — `escapeHTML` / `formatCurrency` / `formatDate` on all user text + money + dates
**Source:** `app/utils.js` (already imported in service-detail.js `8`). Every copied template string already uses these — keep them. service-detail.js already imports `escapeHTML`, `formatCurrency`, `formatDate`.

### Pattern 3 — Window-function registration symmetry (CLAUDE.md rule)
**Source:** project-detail.js `attachWindowFunctions` `3630-3856` (register) + `destroy` `474-537` (delete). service-detail.js mirror: `attachWindowFunctions` `1714-1748`, `destroy` `241-266`. Every new `onclick` handler (lifecycle `lc*`, journal `postActivityEntry`/`submitProgressUpdate`/`submitNewIssue`/`resolveIssue`/etc., tranche editor `toggleTrancheEditor`/`saveTrancheEditor`/etc., `recordRetentionRelease`) must be assigned to `window.*` in `init`/`attachWindowFunctions` and `delete`d in `destroy`. Use a service-namespaced or identical name — Claude's Discretion (D Claude's-Discretion). Project uses `lcAttachLink` etc. globally; since service-detail and project-detail are never mounted simultaneously (separate routes), name collision is not a runtime risk, but unique names ease debugging.

### Pattern 4 — Listener teardown in `destroy()`
**Source:** project-detail.js `destroy` `440-458` (journal unsubs → null + arrays reset). service-detail.js `destroy` `196-267` already follows this for the billing/collectibles listeners (`228-235`). Add the 3 journal unsubs + arrays + the journal UI state vars (`_activeJournalTab`, `journalIssueFilter`, form-open flags) to the same teardown block.

### Pattern 5 — CSS reuse AS-IS (no service-scoped selectors needed)
**Source:** `styles/views.css` — all `.lc-*`, `.stage-*`, `.connector`, `.pa-*`, `.doc-rollup`/`.doc-slot`/`.ds-*`, `.az`/`.az-*`, `.gate-label`/`.gate-warn`/`.action-row`, `.project-journal-panel`/`.journal-*`, `.tranche-display`/`.tranche-editor`/`.editor-row`/`.ret-toggle`/`.edit-tranches-btn`/`.setup-cta`, `.finance-bar`/`.bar-seg`/`.dlp-strip`/`.release-btn` classes are present (87 matches) and are **NOT scoped under `#projectDetailContainer`** (grep for a project-only ancestor returned zero matches). They are global utility classes — service-detail.js can emit the same class names and they will style identically. **No CSS changes required** (this confirms CONTEXT.md's "this phase may be able to skip the CSS-foundation plan"). The project-journal panel HTML uses literal class strings like `project-journal-panel` — keep them verbatim; do not rename to a `service-journal-*` variant (that would orphan the styling).

---

## firestore.rules additions (D-15)

**Analog block:** `match /projects/{projectId}` subcollections + Finance branch (`firestore.rules` `200-312`), verified. The `services` block (`514-548`) currently has ONLY `edit_history`; it needs the 3 journal subcollections + the Finance Record-Release update branch.

**(1) Three journal subcollection blocks** — mirror project `278-311` verbatim, dropping under `match /services/{serviceId}` (after the existing `edit_history` block at `547`):
```
match /activity_entries/{entryId} {
  allow read: if isActiveUser();
  allow create: if isActiveUser();
  allow update: if false;
  allow delete: if hasRole(['super_admin', 'services_admin']);   // ← services_admin (was operations_admin)
}
match /progress_updates/{updateId} {
  allow read: if isActiveUser();
  allow create: if isActiveUser();
  allow update: if isActiveUser() && (
    hasRole(['super_admin', 'services_admin']) ||
    request.auth.uid in get(/databases/$(database)/documents/services/$(serviceId)).data.personnel_user_ids
  );
  allow delete: if hasRole(['super_admin', 'services_admin']);
}
match /issues/{issueId} {
  allow read: if isActiveUser();
  allow create: if isActiveUser();
  allow update: if isActiveUser();
  allow delete: if hasRole(['super_admin', 'services_admin']);
}
```
Also add an **`audit_log` block** (mirror project `268-276`) since the new service gate functions write `addServiceAuditEntry` → `services/{id}/audit_log`. Use `services_admin` + assigned `services_user` for create.

**(2) Finance Record-Release branch** — mirror project `238-242`. **But note (D-15):** the services update rule (`534-536`) is **role-only, NOT affectedKeys-masked** — unlike projects (`214-242`). So:
- **Service-doc field additions (lifecycle/DLP fields) need NO allow-list change** — the role-only rule already permits `super_admin`/`services_admin`/assigned `services_user` to write any field. Verified: `534-536` has no `affectedKeys().hasOnly([...])`.
- The Finance branch must still be ADDED because Finance is NOT in the services update roles today (`535-536` lists only `super_admin`/`services_admin`/`services_user`). Add:
```
allow update: if hasRole(['super_admin', 'services_admin']) ||
                 (isRole('services_user') && isAssignedToService(resource.data.service_code)) ||
                 (hasRole(['finance']) &&
                  request.resource.data.diff(resource.data).affectedKeys().hasOnly(['retention_released_at', 'updated_at']));
```
**Deploy:** DEV only this phase (per project memory `firebase-dev-prod-deploy.md`: CLI active project is PROD — deploy with `--project dev`). Joins the standing v3.3 → main prod-rules-deploy debt.

---

## No Analog Found

None. Every surface has an exact 1:1 analog — this is a deliberate copy-then-adapt parity phase. The only behavioral divergence (D-13 one-time On-going clock) extends an existing in-file function rather than introducing a new pattern.

---

## Metadata

**Analog search scope:** `app/views/` (project-detail.js, service-detail.js, services.js, procurement.js), `styles/views.css`, `firestore.rules`.
**Files scanned:** 6 (read in full or via targeted offset reads; project-detail.js 4,018 lines read across function-mapped sections; line numbers verified, not trusted from CONTEXT.md).
**Pattern extraction date:** 2026-06-13
**Imports to add to service-detail.js:** `orderBy`, `limit` from `../firebase.js` (line 7) — currently absent; required by `ensureServiceJournalListeners`. `arrayUnion` also needed if porting progress-update edit history (`saveEditProgressUpdate`).
