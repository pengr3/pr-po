/* ========================================
   HOME — PER-ROLE ATTENTION FEED SOURCE LIBRARY
   Phase 108 (D-10/D-11) — the Finance + Procurement + portfolio/admin feed
   sources that the (LOCKED) Phase-107 engine in home-feed.js composes.

   Each source is a reusable async `(user) => item[]` function that follows the
   3 seed sources in home-feed.js as its template:
     - ONE batched, SERVER-SCOPED getDocs (Strategy A / 107 D-08 — no persistent
       snapshot listeners; compute-on-load only).
     - Self-gating by the natural query filter (no ad-hoc role branching).
     - Item shaped per the D-11 contract (home-feed.js:8-24).
     - Any throw PROPAGATES to assembleFeed's per-source try/catch — sources do
       NOT swallow their own errors (the engine owns allSourcesFailed, T-107-03).

   COSTLY SOURCES (mirror the 107.6 pos full-scan fix): #9 RFP, #14 collectibles,
   #17 aging POs, #19 delivered-POs-missing-proof each issue a scoped where()
   BEFORE any client-side filter — never a whole-collection scan.

   STATUS CASING IS CASE-SENSITIVE (RESEARCH gotcha 2, CLAUDE.md):
     - billing_requests.status → LOWERCASE 'pending'
     - prs/transport_requests.finance_status, mrfs.status, pos.procurement_status,
       projects/services.project_status → Capitalized ('Pending'/'Rejected'/'Delivered'/'Completed')
   A casing mismatch SILENTLY never-matches (no error) — the exact literals are asserted by grep.

   Derivation math is imported from status-derivation.js (Plan 01) — NOT from the
   heavy routed views (finance.js/projects.js/services.js), to keep the landing
   page off their import graph.

   NOTE: at the end of Plan 02 this file exports its Finance/Procurement sources
   but has NO registry — it is imported by no one, so the app still runs the 3
   seed sources for everyone. Plan 03 adds portfolio/admin sources; Plan 04 wires
   the ROLE_SOURCES registry and rewires the engine.
   ======================================== */

import { db, collection, query, where, getDocs } from './firebase.js';
import { SEVERITY } from './home-feed.js';
import { TYPE_META } from './notifications.js';
import { getRFPTotal, getAssignedProjectCodes, getAssignedServiceCodes } from './utils.js';
import { deriveRFPStatus, deriveCollectibleStatus, getCollectibleUrgency, getDlpState, normalizeUpdatedAt, stageDaysInStage, getEngagementSignal } from './status-derivation.js';

/**
 * D-01 severity bands (days) — the single declarative place to tune feed severity.
 * DISTINCT from status-derivation's URGENCY_THRESHOLDS (the portfolio signal bands):
 * feed severity is RECOMPUTED against THESE bands, not read off signal.level (gotcha 5).
 */
export const THRESHOLDS = {
    STAGE_CRITICAL_D: 14, STAGE_HIGH_D: 7,
    DLP_CRIT_D: 3, DLP_HIGH_D: 7, DLP_MED_D: 14,
    PROGRESS_CRIT_D: 30, PROGRESS_HIGH_D: 14,
    MONEY_CRIT_D: 30, MONEY_DUE_SOON_D: 7,
    PO_AGE_CRIT_D: 30, PO_AGE_HIGH_D: 14,
};

/* ========================================
   FINANCE + PROCUREMENT — ACTION-STATE SOURCES (Task 1)
   Cheap, self-gating scoped reads over an action-state field. Fixed severity
   (an action state is either present or not — no age band). #12/#13/decide are
   HOME-12 finance; #16/#18 are HOME-13 procurement.
   ======================================== */

/**
 * #12 sourcePendingPRs (HOME-12, finance) — Material/service PRs awaiting finance review.
 * Query: prs where finance_status == 'Pending' (Capitalized — finance.js:5285). Fixed high.
 */
export async function sourcePendingPRs(user) {
    const snap = await getDocs(query(
        collection(db, 'prs'),
        where('finance_status', '==', 'Pending')
    ));
    const items = [];
    snap.forEach(docSnap => {
        const pr = { id: docSnap.id, ...docSnap.data() };
        const subtitle = [
            pr.supplier_name,
            (pr.total_amount != null ? ('₱' + Number(pr.total_amount).toLocaleString()) : null)
        ].filter(Boolean).join(' · ');
        items.push({
            dedupeKey: `pr-pending:${pr.id}`,
            severity: SEVERITY.high,
            icon: TYPE_META.PR_REVIEW_NEEDED.icon,
            title: (pr.pr_id || 'PR') + ' needs review',
            subtitle,
            category: 'pr',
            deepLink: { kind: 'route', value: '#/finance' },
            timestamp: pr.date_generated,
            overdueScore: 0
        });
    });
    return items;
}

/**
 * #13 sourcePendingTRs (HOME-12, finance) — Transport requests awaiting finance review.
 * Query: transport_requests where finance_status == 'Pending' (Capitalized — finance.js:5343). Fixed high.
 */
export async function sourcePendingTRs(user) {
    const snap = await getDocs(query(
        collection(db, 'transport_requests'),
        where('finance_status', '==', 'Pending')
    ));
    const items = [];
    snap.forEach(docSnap => {
        const tr = { id: docSnap.id, ...docSnap.data() };
        const subtitle = [
            tr.supplier_name,
            (tr.total_amount != null ? ('₱' + Number(tr.total_amount).toLocaleString()) : null)
        ].filter(Boolean).join(' · ');
        items.push({
            dedupeKey: `tr-pending:${tr.id}`,
            severity: SEVERITY.high,
            icon: TYPE_META.TR_REVIEW_NEEDED.icon,
            title: (tr.tr_id || 'TR') + ' needs review',
            subtitle,
            category: 'tr',
            deepLink: { kind: 'route', value: '#/finance' },
            timestamp: tr.date_generated || tr.created_at,
            overdueScore: 0
        });
    });
    return items;
}

/**
 * sourceBillingRequestsToDecide (HOME-12, finance) — billing requests awaiting a finance decision.
 * DISTINCT from Plan 03's sourceOwnBillingRequests (which scopes requested_by_uid == uid).
 * Query: billing_requests where status == 'pending' — LOWERCASE (gotcha 2, finance.js:2052). Fixed high.
 */
export async function sourceBillingRequestsToDecide(user) {
    const snap = await getDocs(query(
        collection(db, 'billing_requests'),
        where('status', '==', 'pending')
    ));
    const items = [];
    snap.forEach(docSnap => {
        const br = { id: docSnap.id, ...docSnap.data() };
        const subtitle = [
            br.requested_by_name,
            (br.project_code || br.service_code),
            (br.amount_requested != null ? ('₱' + Number(br.amount_requested).toLocaleString()) : null)
        ].filter(Boolean).join(' · ');
        items.push({
            dedupeKey: `billreq-decide:${br.id}`,
            severity: SEVERITY.high,
            icon: TYPE_META.BILLING_REQUEST_SUBMITTED.icon,
            title: 'Billing request to decide',
            subtitle,
            category: 'finance',
            deepLink: { kind: 'route', value: '#/finance/collectibles' },
            timestamp: br.created_at || br.requested_at,
            overdueScore: 0
        });
    });
    return items;
}

/**
 * #16 sourceMrfsPendingProcessing (HOME-13, procurement) — MRFs awaiting procurement processing.
 * Query: mrfs where status == 'Pending' (Capitalized — CLAUDE.md/procurement.js). Fixed high.
 */
export async function sourceMrfsPendingProcessing(user) {
    const snap = await getDocs(query(
        collection(db, 'mrfs'),
        where('status', '==', 'Pending')
    ));
    const items = [];
    snap.forEach(docSnap => {
        const mrf = { id: docSnap.id, ...docSnap.data() };
        items.push({
            dedupeKey: `mrf-pending:${mrf.id}`,
            severity: SEVERITY.high,
            icon: TYPE_META.MRF_SUBMITTED.icon,
            title: (mrf.mrf_id || 'MRF') + ' pending processing',
            subtitle: (mrf.project_name || mrf.project_code || '—'),
            category: 'mrf',
            deepLink: { kind: 'route', value: '#/procurement/mrfs' },
            timestamp: mrf.created_at || mrf.date_needed || null,
            overdueScore: 0
        });
    });
    return items;
}

/**
 * #18 sourceRejectedTRs (HOME-13, procurement) — TRs finance-rejected, awaiting re-edit.
 * Query: transport_requests where finance_status == 'Rejected' (Capitalized). Fixed high.
 */
export async function sourceRejectedTRs(user) {
    const snap = await getDocs(query(
        collection(db, 'transport_requests'),
        where('finance_status', '==', 'Rejected')
    ));
    const items = [];
    snap.forEach(docSnap => {
        const tr = { id: docSnap.id, ...docSnap.data() };
        items.push({
            dedupeKey: `tr-rejected:${tr.id}`,
            severity: SEVERITY.high,
            icon: TYPE_META.TR_REVIEW_NEEDED.icon,
            title: (tr.tr_id || 'TR') + ' rejected — re-edit',
            subtitle: (tr.supplier_name || tr.project_code || '—'),
            category: 'tr',
            deepLink: { kind: 'route', value: '#/procurement/records' },
            timestamp: tr.rejected_at || tr.updated_at || null,
            overdueScore: 0
        });
    });
    return items;
}

/* ========================================
   FINANCE — MONEY / DERIVATION SOURCES (Task 2)
   Derived money states (RFP payment status, collectible overdue, DLP-expired
   retention). The two costly sources (#9, #14) scope SERVER-SIDE first with a
   due_date string-range where() (RFP due_date CONFIRMED YYYY-MM-DD, Plan 01
   SUMMARY), then derive client-side only on the reduced set. Severity bands read
   the D-01 THRESHOLDS money constants, not magic numbers.
   ======================================== */

/**
 * #9 sourceOverdueRfpPayments (HOME-09 super_admin + HOME-12 finance) — RFP payments
 * overdue OR due within the next 7 days ("overdue/due this week"). COSTLY → scoped.
 * Query: rfps where due_date < (today + 7d) (string range — SAFE per Plan 01's confirmed
 * YYYY-MM-DD format), then client-exclude Fully-Paid via deriveRFPStatus.
 * Severity (D-01 money bands): >30d past due → critical; 0..30d past due → high; future (due ≤7d) → medium.
 */
export async function sourceOverdueRfpPayments(user) {
    // today + 7 days, as YYYY-MM-DD, so the range captures both past-due and due-this-week RFPs.
    const cutoff = new Date(Date.now() + THRESHOLDS.MONEY_DUE_SOON_D * 86400000).toISOString().slice(0, 10);
    const snap = await getDocs(query(
        collection(db, 'rfps'),
        where('due_date', '<', cutoff)
    ));
    const items = [];
    snap.forEach(docSnap => {
        const rfp = { id: docSnap.id, ...docSnap.data() };
        if (deriveRFPStatus(rfp) === 'Fully Paid') return;   // client filter: drop settled RFPs
        const daysPastDue = Math.floor((Date.now() - new Date(rfp.due_date).getTime()) / 86400000);
        const severity = daysPastDue > THRESHOLDS.MONEY_CRIT_D
            ? SEVERITY.critical
            : (daysPastDue >= 0 ? SEVERITY.high : SEVERITY.medium);
        const subtitle = [
            (rfp.po_id || rfp.tranche_label),
            ('₱' + getRFPTotal(rfp).toLocaleString())
        ].filter(Boolean).join(' · ');
        items.push({
            dedupeKey: `rfp-overdue:${rfp.id}`,
            severity,
            icon: TYPE_META.RFP_REVIEW_NEEDED.icon,
            title: (rfp.rfp_id || 'RFP') + (daysPastDue >= 0 ? ' payment overdue' : ' due soon'),
            subtitle,
            category: 'rfp',
            deepLink: { kind: 'route', value: '#/finance' },
            timestamp: rfp.due_date,
            overdueScore: daysPastDue
        });
    });
    return items;
}

/**
 * #14 sourceCollectiblesOverdue (HOME-12 finance) — collectibles past due and not fully paid.
 * COSTLY → scoped. Query: collectibles where due_date < today (string range — collectibles due_date
 * IS YYYY-MM-DD, finance.js:139), then client-filter deriveCollectibleStatus === 'Overdue'.
 * Severity (D-01): critical urgency tier (≥30d overdue) → critical; else → high.
 */
export async function sourceCollectiblesOverdue(user) {
    const todayISO = new Date().toISOString().slice(0, 10);
    const snap = await getDocs(query(
        collection(db, 'collectibles'),
        where('due_date', '<', todayISO)
    ));
    const items = [];
    snap.forEach(docSnap => {
        const coll = { id: docSnap.id, ...docSnap.data() };
        if (deriveCollectibleStatus(coll) !== 'Overdue') return;   // excludes fully-paid / not-actually-overdue
        const u = getCollectibleUrgency(coll);
        const severity = u.tier === 'critical' ? SEVERITY.critical : SEVERITY.high;
        const subtitle = [
            (coll.project_code || coll.service_code),
            ('₱' + Number(coll.amount_requested).toLocaleString()),
            (u.daysOverdue + 'd overdue')
        ].filter(Boolean).join(' · ');
        items.push({
            dedupeKey: `collectible-overdue:${coll.id}`,
            severity,
            icon: TYPE_META.COLLECTIBLE_CREATED.icon,
            title: 'Collectible overdue',
            subtitle,
            category: 'finance',
            deepLink: { kind: 'route', value: '#/finance/collectibles' },
            timestamp: coll.due_date,
            overdueScore: u.daysOverdue
        });
    });
    return items;
}

/**
 * #8 sourceRetentionReleases (HOME-12 finance) — DLP-expired retention still held, across BOTH
 * projects and services. Query each collection scoped to project_status == 'Completed' (getDlpState
 * returns 'active' for non-Completed — gotcha 6 — so the Completed pre-filter is mandatory), then
 * client-filter getDlpState === 'expired' (dlp_expires_at past AND retention_released_at null).
 * Single interleaved list (D-04); the project/service origin shows only via subtitle. Fixed high.
 */
export async function sourceRetentionReleases(user) {
    const [projSnap, svcSnap] = await Promise.all([
        getDocs(query(collection(db, 'projects'), where('project_status', '==', 'Completed'))),
        getDocs(query(collection(db, 'services'), where('project_status', '==', 'Completed')))
    ]);
    const items = [];
    const collect = (snap) => {
        snap.forEach(docSnap => {
            const e = { id: docSnap.id, ...docSnap.data() };
            if (getDlpState(e) !== 'expired') return;   // DLP past + retention not yet released
            const subtitle = [
                (e.project_code || e.service_code),
                (e.project_name || ''),
                'DLP expired'
            ].filter(Boolean).join(' · ');
            items.push({
                dedupeKey: `retention-release:${e.id}`,
                severity: SEVERITY.high,
                icon: TYPE_META.PROJECT_COST_CHANGED.icon,
                title: 'Retention release to record',
                subtitle,
                category: 'dlp',
                deepLink: { kind: 'route', value: '#/finance' },
                timestamp: e.dlp_expires_at,
                overdueScore: Math.max(0, Math.floor((Date.now() - new Date(e.dlp_expires_at).getTime()) / 86400000))
            });
        });
    };
    collect(projSnap);
    collect(svcSnap);
    return items;
}

/* ========================================
   PROCUREMENT — SCOPED SCAN SOURCES (Task 3)
   Both scan the pos collection but SCOPE server-side on procurement_status FIRST
   (single-field auto-indexed), then age/absent-proof filter client-side — mirroring
   the 107.6 pos full-scan fix. The cross-collection group-read / denormalization escape
   hatches are NOT used this phase; the procurement_status where() bounds both scans.
   POs carry no dedicated status-change timestamp (gotcha 4) → updated_at (bumped on
   every status change) is the age-in-status proxy, with date_issued as fallback.
   ======================================== */

/**
 * #17 sourceAgingPOs (HOME-13 procurement) — active POs aging in their current status.
 * Query: pos where procurement_status in [active statuses] (scoped — Delivered/Cancelled excluded).
 * Client age from normalizeUpdatedAt(updated_at) ?? date_issued; surface only POs older than the
 * high band. Severity (D-01 PO-age): >30d → critical; else → high.
 */
export async function sourceAgingPOs(user) {
    const snap = await getDocs(query(
        collection(db, 'pos'),
        where('procurement_status', 'in', ['Pending Procurement', 'Pending', 'Procuring', 'Procured'])
    ));
    const items = [];
    snap.forEach(docSnap => {
        const po = { id: docSnap.id, ...docSnap.data() };
        const ms = normalizeUpdatedAt(po.updated_at) ?? normalizeUpdatedAt(po.date_issued);
        if (ms == null) return;
        const d = (Date.now() - ms) / 86400000;
        if (d <= THRESHOLDS.PO_AGE_HIGH_D) return;   // only aging POs surface
        const severity = d > THRESHOLDS.PO_AGE_CRIT_D ? SEVERITY.critical : SEVERITY.high;
        const subtitle = [
            po.supplier_name,
            (Math.round(d) + 'd in status')
        ].filter(Boolean).join(' · ');
        items.push({
            dedupeKey: `po-aging:${po.id}`,
            severity,
            icon: TYPE_META.PO_DELIVERED.icon,
            title: (po.po_id || 'PO') + ' aging in ' + po.procurement_status,
            subtitle,
            category: 'po',
            deepLink: { kind: 'route', value: '#/procurement/records' },
            timestamp: po.updated_at || po.date_issued || null,
            overdueScore: d
        });
    });
    return items;
}

/**
 * #19 sourceDeliveredPOsMissingProof (HOME-13 procurement) — Delivered POs lacking proof-of-procurement.
 * Query scoped to procurement_status == 'Delivered' first (can't where() on an absent field), then
 * client-filter POs that have NEITHER proof_url NOR proof_remarks. Fixed high.
 */
export async function sourceDeliveredPOsMissingProof(user) {
    const snap = await getDocs(query(
        collection(db, 'pos'),
        where('procurement_status', '==', 'Delivered')
    ));
    const items = [];
    snap.forEach(docSnap => {
        const po = { id: docSnap.id, ...docSnap.data() };
        if (po.proof_url || po.proof_remarks) return;   // only POs with NO proof surface
        const subtitle = [
            po.supplier_name,
            (po.project_name || po.project_code || '—')
        ].filter(Boolean).join(' · ');
        items.push({
            dedupeKey: `po-noproof:${po.id}`,
            severity: SEVERITY.high,
            icon: TYPE_META.PO_DELIVERED.icon,
            title: (po.po_id || 'PO') + ' delivered — proof missing',
            subtitle,
            category: 'po',
            deepLink: { kind: 'route', value: '#/procurement/records' },
            timestamp: po.updated_at || po.date_issued || null,
            overdueScore: 0
        });
    });
    return items;
}

/* ========================================
   PORTFOLIO / ADMIN — CHEAP ACTION-STATE SOURCES (Plan 03, Task 1)
   Two cheap self-gating reads: #4 pending user registrations (super_admin approver
   gate) and #10 your-own pending billing requests (ownership gate on uid). Both are
   action states → fixed severity. From here on the sources are ASSIGNMENT-AWARE:
   the same function serves super_admin=all / dept-admin=dept / user=assigned via the
   getAssignedProjectCodes()/getAssignedServiceCodes() predicates (Task 2/3) — no
   ad-hoc per-role branching (T-108-01). The file still has NO registry; Plan 04 wires it.
   ======================================== */

/**
 * #4 sourcePendingUserRegistrations (HOME-09, super_admin) — new users awaiting approval.
 * Approver gate mirrors seed #1: only super_admin sees the registration queue.
 * Query: users where status == 'pending' (LOWERCASE — user-management.js:248). Fixed high (action).
 */
export async function sourcePendingUserRegistrations(user) {
    if (user?.role !== 'super_admin') return [];   // approver gate — only super_admin approves registrations
    const snap = await getDocs(query(
        collection(db, 'users'),
        where('status', '==', 'pending')
    ));
    const items = [];
    snap.forEach(docSnap => {
        const u = { id: docSnap.id, ...docSnap.data() };
        const subtitle = [
            (u.full_name || u.email || '—'),
            (u.requested_role || u.role || '')
        ].filter(Boolean).join(' · ');
        items.push({
            dedupeKey: `user-pending:${u.id}`,
            severity: SEVERITY.high,
            icon: TYPE_META.REGISTRATION_PENDING.icon,
            title: 'New user awaiting approval',
            subtitle,
            category: 'issue',
            // A2: #/admin honors ?section=user-management; degrades to the admin root if the param is ignored.
            deepLink: { kind: 'route', value: '#/admin?section=user-management' },
            timestamp: u.created_at,
            overdueScore: 0
        });
    });
    return items;
}

/**
 * #10 sourceOwnBillingRequests (HOME-10 ops admin / HOME-11 user) — YOUR OWN billing requests still
 * pending a finance decision (tracking your own submission — DISTINCT from Plan 02's
 * sourceBillingRequestsToDecide, which is the finance decider's un-scoped queue).
 * Ownership gate: needs a uid. Query: billing_requests where requested_by_uid == uid AND status ==
 * 'pending' (LOWERCASE — project-detail.js:1468). Fixed medium (tracking, not overdue — D-01).
 */
export async function sourceOwnBillingRequests(user) {
    if (!user?.uid) return [];   // ownership gate — needs a uid to scope to own submissions
    const snap = await getDocs(query(
        collection(db, 'billing_requests'),
        where('requested_by_uid', '==', user.uid),
        where('status', '==', 'pending')
    ));
    const items = [];
    snap.forEach(docSnap => {
        const br = { id: docSnap.id, ...docSnap.data() };
        const subtitle = [
            (br.project_code || br.service_code),
            br.tranche_label,
            (br.amount_requested != null ? ('₱' + Number(br.amount_requested).toLocaleString()) : null)
        ].filter(Boolean).join(' · ');
        items.push({
            dedupeKey: `billreq-own:${br.id}`,
            severity: SEVERITY.medium,
            icon: TYPE_META.BILLING_REQUEST_SUBMITTED.icon,
            title: 'Your billing request is pending',
            subtitle,
            category: 'finance',
            deepLink: { kind: 'route', value: '#/finance/collectibles' },
            timestamp: br.created_at || br.requested_at,
            overdueScore: 0
        });
    });
    return items;
}

/* ========================================
   PORTFOLIO — ENGAGEMENT / DLP SOURCES (Plan 03, Task 2)
   Assignment-aware portfolio sources over projects/services. Each SELF-SCOPES via
   getAssignedProjectCodes()/getAssignedServiceCodes() (null=see-all admin/finance/
   procurement/home-dept-admin; []=scoped user with zero assignments → early []; else
   client-filter to the allowed codes). One function serves every role — the registry
   (Plan 04) decides which roles get it; the source decides which DATA to show (D-04).
   SEVERITY is RECOMPUTED against the D-01 THRESHOLDS bands from the status-derivation
   primitives (stageDaysInStage / normalizeUpdatedAt / getDlpState / dlp-expiry math) —
   NEVER read off getEngagementSignal(...).level (RESEARCH gotcha 5). getEngagementSignal
   is used ONLY to enrich a subtitle string, not to grade severity.
   ======================================== */

/**
 * The 7 funnel (stage-clock) statuses — excludes On-going/Completed/Loss. Fits one `in` clause
 * (Firestore allows ≤10 values). Reused by #5a (projects) and #5b (services).
 */
const FUNNEL_STATUSES = ['For Proposal', 'Proposal for Internal Approval', 'Proposal Under Client Review', 'For Revision', 'Client Approved', 'For Mobilization', 'For Inspection'];

/**
 * scopeByCodes — client-side assignment scoping shared by #5a/#5b/#11/#7.
 * Mirrors getAssigned*Codes() semantics: codes === null → see-all (docs unchanged);
 * codes === [] → sees-nothing (return []); else keep only docs whose codeField ∈ codes.
 * A plain (non-exported, non-async) local helper — NOT a feed source — so it does not inflate the source count.
 */
function scopeByCodes(docs, codes, codeField) {
    if (codes === null) return docs;
    if (codes.length === 0) return [];
    const allow = new Set(codes);
    return docs.filter(d => allow.has(d[codeField]));
}

/**
 * #5a sourceOverdueProjects (HOME-09/10/11) — funnel-stage projects overdue in their current stage,
 * self-scoped to the viewer's assigned project_codes. Query: projects where project_status in the 7
 * funnel statuses (drops On-going/Completed/Loss), then client scopeByCodes + stage band. Only projects
 * over the STAGE_HIGH band (>7d) surface. Severity (D-01): >STAGE_CRITICAL_D → critical; else → high.
 */
export async function sourceOverdueProjects(user) {
    const codes = getAssignedProjectCodes();                       // null = see all; [] = none
    if (Array.isArray(codes) && codes.length === 0) return [];     // scoped user with zero project assignments
    const snap = await getDocs(query(
        collection(db, 'projects'),
        where('project_status', 'in', FUNNEL_STATUSES)
    ));
    const rows = [];
    snap.forEach(docSnap => rows.push({ id: docSnap.id, ...docSnap.data() }));
    const items = [];
    scopeByCodes(rows, codes, 'project_code').forEach(p => {
        const d = stageDaysInStage(p, Date.now());
        if (d == null || d <= THRESHOLDS.STAGE_HIGH_D) return;      // only overdue-in-stage (>7d) surface
        const severity = d > THRESHOLDS.STAGE_CRITICAL_D ? SEVERITY.critical : SEVERITY.high;
        const sig = getEngagementSignal(p, Date.now());            // subtitle enrichment ONLY (not severity — gotcha 5)
        const subtitle = [
            p.project_status + ' · ' + Math.round(d) + 'd in stage',
            (sig && sig.level !== 'ok' ? sig.text : null)
        ].filter(Boolean).join(' · ');
        items.push({
            dedupeKey: `project-overdue:${p.id}`,
            severity,
            icon: TYPE_META.PROJECT_STATUS_CHANGED.icon,
            title: (p.project_name || p.project_code || 'Project'),
            subtitle,
            category: 'project',
            deepLink: { kind: 'route', value: '#/projects' },
            timestamp: p.status_changed_at || p.updated_at,
            overdueScore: d
        });
    });
    return items;
}

/**
 * #5b sourceOverdueServices (HOME-09/10/11) — mirror of #5a on the services collection, self-scoped to
 * assigned service_codes. Same 7 funnel statuses, same stage band, distinct dedupeKey/category/deepLink.
 */
export async function sourceOverdueServices(user) {
    const codes = getAssignedServiceCodes();                       // null = see all; [] = none
    if (Array.isArray(codes) && codes.length === 0) return [];     // scoped user with zero service assignments
    const snap = await getDocs(query(
        collection(db, 'services'),
        where('project_status', 'in', FUNNEL_STATUSES)
    ));
    const rows = [];
    snap.forEach(docSnap => rows.push({ id: docSnap.id, ...docSnap.data() }));
    const items = [];
    scopeByCodes(rows, codes, 'service_code').forEach(s => {
        const d = stageDaysInStage(s, Date.now());
        if (d == null || d <= THRESHOLDS.STAGE_HIGH_D) return;      // only overdue-in-stage (>7d) surface
        const severity = d > THRESHOLDS.STAGE_CRITICAL_D ? SEVERITY.critical : SEVERITY.high;
        const sig = getEngagementSignal(s, Date.now());            // subtitle enrichment ONLY (not severity — gotcha 5)
        const subtitle = [
            s.project_status + ' · ' + Math.round(d) + 'd in stage',
            (sig && sig.level !== 'ok' ? sig.text : null)
        ].filter(Boolean).join(' · ');
        items.push({
            dedupeKey: `service-overdue:${s.id}`,
            severity,
            icon: TYPE_META.PROJECT_STATUS_CHANGED.icon,
            title: (s.project_name || s.service_code || 'Service'),
            subtitle,
            category: 'service',
            deepLink: { kind: 'route', value: '#/services' },
            timestamp: s.status_changed_at || s.updated_at,
            overdueScore: d
        });
    });
    return items;
}

/**
 * #11 sourceStaleProgress (HOME-10/11) — On-going engagements that have gone quiet, spanning BOTH
 * collections, each self-scoped. DISTINCT concern from #5a/#5b (stage clock) — uses the PROGRESS bands
 * on last_activity_at ?? updated_at, so its dedupeKey prefix differs (gotcha 13). Only ≥14d quiet surface.
 * Severity (D-01): >=PROGRESS_CRIT_D (30d) → critical; else → high.
 */
export async function sourceStaleProgress(user) {
    const pCodes = getAssignedProjectCodes();
    const sCodes = getAssignedServiceCodes();
    const [projSnap, svcSnap] = await Promise.all([
        getDocs(query(collection(db, 'projects'), where('project_status', '==', 'On-going'))),
        getDocs(query(collection(db, 'services'), where('project_status', '==', 'On-going')))
    ]);
    const projRows = []; projSnap.forEach(d => projRows.push({ id: d.id, ...d.data(), _kind: 'project' }));
    const svcRows = []; svcSnap.forEach(d => svcRows.push({ id: d.id, ...d.data(), _kind: 'service' }));
    const engagements = scopeByCodes(projRows, pCodes, 'project_code')
        .concat(scopeByCodes(svcRows, sCodes, 'service_code'));
    const items = [];
    engagements.forEach(e => {
        const ms = normalizeUpdatedAt(e.last_activity_at) ?? normalizeUpdatedAt(e.updated_at);
        if (ms == null) return;
        const d = (Date.now() - ms) / 86400000;
        if (d < THRESHOLDS.PROGRESS_HIGH_D) return;                // surface engagements quiet ≥14d
        const severity = d >= THRESHOLDS.PROGRESS_CRIT_D ? SEVERITY.critical : SEVERITY.high;
        const isService = e._kind === 'service';
        items.push({
            dedupeKey: `stale-progress:${e.id}`,
            severity,
            icon: TYPE_META.PROJECT_STATUS_CHANGED.icon,
            title: (e.project_name || e.project_code || e.service_code || 'Engagement'),
            subtitle: 'No progress in ' + Math.round(d) + 'd',
            category: isService ? 'service' : 'project',
            deepLink: { kind: 'route', value: isService ? '#/services' : '#/projects' },
            timestamp: e.last_activity_at || e.updated_at,
            overdueScore: d
        });
    });
    return items;
}

/**
 * #7 sourceDlpWindowsExpiring (HOME-09/10) — Completed engagements whose DLP retention window closes
 * within 14d, spanning BOTH collections, self-scoped. getDlpState needs the Completed pre-filter (gotcha
 * 6), so both queries scope project_status == 'Completed' first, then check getDlpState === 'in-dlp' and
 * the days-to-expiry window. DISTINCT dedupeKey from Plan 02's retention-release: (gotcha 13).
 * Severity (D-01): ≤DLP_CRIT_D (3d) → critical; ≤DLP_HIGH_D (7d) → high; else → medium.
 */
export async function sourceDlpWindowsExpiring(user) {
    const pCodes = getAssignedProjectCodes();
    const sCodes = getAssignedServiceCodes();
    const [projSnap, svcSnap] = await Promise.all([
        getDocs(query(collection(db, 'projects'), where('project_status', '==', 'Completed'))),
        getDocs(query(collection(db, 'services'), where('project_status', '==', 'Completed')))
    ]);
    const projRows = []; projSnap.forEach(d => projRows.push({ id: d.id, ...d.data(), _kind: 'project' }));
    const svcRows = []; svcSnap.forEach(d => svcRows.push({ id: d.id, ...d.data(), _kind: 'service' }));
    const engagements = scopeByCodes(projRows, pCodes, 'project_code')
        .concat(scopeByCodes(svcRows, sCodes, 'service_code'));
    const items = [];
    engagements.forEach(e => {
        if (getDlpState(e) !== 'in-dlp') return;                   // Completed + retention held + not yet expired
        const exp = new Date(e.dlp_expires_at).getTime();
        const days = (exp - Date.now()) / 86400000;
        if (days < 0 || days > THRESHOLDS.DLP_MED_D) return;       // window closing within 0..14d
        const severity = days <= THRESHOLDS.DLP_CRIT_D
            ? SEVERITY.critical
            : (days <= THRESHOLDS.DLP_HIGH_D ? SEVERITY.high : SEVERITY.medium);
        const isService = e._kind === 'service';
        items.push({
            dedupeKey: `dlp-expiring:${e.id}`,
            severity,
            icon: TYPE_META.PROJECT_COST_CHANGED.icon,
            title: 'DLP window closing — ' + (e.project_code || e.service_code || ''),
            subtitle: Math.ceil(days) + 'd until retention release',
            category: 'dlp',
            deepLink: { kind: 'route', value: isService ? '#/services' : '#/projects' },
            timestamp: e.dlp_expires_at,
            overdueScore: THRESHOLDS.DLP_MED_D - days               // nearer expiry sorts higher
        });
    });
    return items;
}

/* ========================================
   PORTFOLIO — OPEN ISSUES FAN-OUT (Plan 03, Task 3)
   #6 is the heaviest source. It ships the resolved-decision-#3 BOUNDED per-assignment/
   dept subcollection fan-out:
     1. resolve scoped PARENT doc-ids per collection (chunked `in` on project_code/
        service_code; a see-all admin/super — codes === null — enumerates the near-static
        reference collection, 106-FINDINGS F-025),
     2. cap the parent set (OPEN_ISSUES_PARENT_CAP) so worst-case reads stay bounded even
        for a large-dept admin (the group-read / open_issue_count denormalization scale
        paths are recorded in the SUMMARY, NOT built this phase),
     3. INNER Promise.all — one `getDocs(.../issues where status=='open')` per parent
        (gotcha 11). The issue doc carries NO parent identity (gotcha 3) so the dedupeKey
        is composite `issue:{parentId}:{issueId}`.
   NOT wrapped in try/catch — a failed parent read propagates to assembleFeed's per-source
   catch (T-108-03); the source counts as failed only for itself, isolated by the engine.
   ======================================== */

// Documented worst-case bound on the number of fanned-out parents (resolved decision #3 — dept-admin scale).
const OPEN_ISSUES_PARENT_CAP = 60;

/**
 * #6 sourceOpenIssues (HOME-10 dept admin / HOME-11 user) — open issues logged on the viewer's
 * assigned/dept projects & services. Self-scopes via getAssignedProjectCodes()/getAssignedServiceCodes();
 * see the section header for the bounded-fan-out algorithm. Fixed high (an open issue is an action).
 */
export async function sourceOpenIssues(user) {
    // chunk a code list into groups of ≤10 for a Firestore `in` clause.
    const chunk10 = (arr) => { const out = []; for (let i = 0; i < arr.length; i += 10) out.push(arr.slice(i, i + 10)); return out; };

    // Resolve scoped parent descriptors for one collection. codes: null=see-all (enumerate),
    // []=none, else chunked `in`. chunkQueryFn builds the literal scoped `in` query per chunk.
    const resolveParents = async (collectionName, kindSingular, codes, chunkQueryFn) => {
        if (Array.isArray(codes) && codes.length === 0) return [];   // scoped, zero assignments → nothing
        const parents = [];
        const pushFrom = (snap) => snap.forEach(d => {
            const e = d.data();
            parents.push({ id: d.id, kind: kindSingular, name: e.project_name || e.project_code || e.service_code || d.id });
        });
        if (codes === null) {
            // see-all admin/super: enumerate the (near-static) reference collection to get its doc-ids.
            pushFrom(await getDocs(collection(db, collectionName)));
        } else {
            const snaps = await Promise.all(chunk10(codes).map(c => getDocs(chunkQueryFn(c))));
            snaps.forEach(pushFrom);
        }
        return parents;
    };

    // 1–2. Resolve + cap the scoped parent set across BOTH collections.
    const [projParents, svcParents] = await Promise.all([
        resolveParents('projects', 'project', getAssignedProjectCodes(),
            c => query(collection(db, 'projects'), where('project_code', 'in', c))),
        resolveParents('services', 'service', getAssignedServiceCodes(),
            c => query(collection(db, 'services'), where('service_code', 'in', c)))
    ]);
    const parents = projParents.concat(svcParents).slice(0, OPEN_ISSUES_PARENT_CAP);   // bounded worst case

    // 3. Inner Promise.all — one open-issues read per parent (bounded by the cap above).
    const items = [];
    await Promise.all(parents.map(async parent => {
        const snap = await getDocs(query(
            collection(db, parent.kind === 'service' ? 'services' : 'projects', parent.id, 'issues'),
            where('status', '==', 'open')
        ));
        snap.forEach(issueDoc => {
            const issue = { id: issueDoc.id, ...issueDoc.data() };
            items.push({
                dedupeKey: `issue:${parent.id}:${issue.id}`,   // composite — the issue doc carries no parent identity (gotcha 3)
                severity: SEVERITY.high,
                icon: TYPE_META.MRF_REJECTED.icon,             // nearest analogue (no dedicated open-issue icon)
                title: (issue.title || issue.issue_type || 'Open issue'),
                subtitle: parent.name,
                category: 'issue',
                deepLink: { kind: 'route', value: parent.kind === 'service' ? '#/services' : '#/projects' },
                timestamp: issue.created_at,
                overdueScore: 0
            });
        });
    }));
    return items;
}
