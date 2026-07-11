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
   the 107.6 pos full-scan fix. The collectionGroup / denormalization escape hatches
   are NOT used this phase; the procurement_status where() bounds both scans.
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
