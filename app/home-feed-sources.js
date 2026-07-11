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
import { getRFPTotal } from './utils.js';
import { deriveRFPStatus, deriveCollectibleStatus, getCollectibleUrgency, getDlpState, normalizeUpdatedAt } from './status-derivation.js';

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
