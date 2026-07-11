/**
 * app/status-derivation.js — Phase 108 (D-02) leaf module of PURE derivation formulas.
 *
 * WHY THIS FILE EXISTS (Strategy A / 107 D-08, RESEARCH § Derivation-Helper Reuse Map):
 *   The status/urgency/DLP/collectible/RFP formulas the Phase-108 attention-feed sources need
 *   live module-PRIVATE inside giant routed views (finance.js 7,000+ lines, projects.js/services.js).
 *   Importing any of those into the landing-page critical path would eager-load the entire heavy
 *   view graph on first paint, defeating the router's lazy-loading and Strategy A "fast" mandate.
 *   This module is the sanctioned "reuse the helpers" reading (Assumption A6): SAME MATH, one new
 *   lightweight home. It performs NO Firestore I/O and imports NOTHING heavy — only getRFPTotal
 *   from utils.js — so home-feed-sources.js can import it without dragging views into first paint.
 *
 * EXTRACT-BY-COPY provenance (canonical copies still live at these lines — keep in sync):
 *   - URGENCY_THRESHOLDS      ← app/views/projects.js:53
 *   - normalizeUpdatedAt      ← app/views/projects.js:911  (identical in services.js:940-ish)
 *   - stageDaysInStage        ← app/views/projects.js:925  (== services.js stageDaysInStageService:945)
 *   - getDlpState             ← app/views/projects.js:897  (IDENTICAL to services.js:952)
 *   - getDefaultOkSignal      ← app/views/projects.js:931  (internal helper)
 *   - getEngagementSignal     ← app/views/projects.js:942  (getProjectSignal, renamed)
 *   - deriveRFPStatus         ← app/views/finance.js:89    (uses exported getRFPTotal, utils.js:71)
 *   - deriveCollectibleStatus ← app/views/finance.js:110
 *   - getCollectibleUrgency   ← app/views/finance.js:129
 *
 * HYGIENE / KNOWN DUPLICATION (Phase 108 accepts temporary dup; later pass points views here):
 *   - status-derivation.js vs the private copies in finance.js / projects.js / services.js.
 *   - Pre-existing: deriveCollectibleStatus is ALSO inlined in app/expense-modal.js
 *     (noted at finance.js:106-108). Not introduced by this phase — recorded for the same cleanup.
 */

import { getRFPTotal } from './utils.js';

// extracted-by-copy from app/views/projects.js:53 (Phase 108, D-02) — canonical copy lives there; keep in sync
// Phase 103.1 D-04 — two-tier urgency thresholds (days). Each funnel stage has its own watch AND
// urgent trip-point, read against status_changed_at. Operator-confirmed 2026-06-13. Tunable.
export const URGENCY_THRESHOLDS = {
    FOR_PROPOSAL_WATCH: 2,        FOR_PROPOSAL_URGENT: 5,         // For Proposal
    INTERNAL_APPROVAL_WATCH: 2,   INTERNAL_APPROVAL_URGENT: 5,    // Proposal for Internal Approval
    CLIENT_REVIEW_WATCH: 7,       CLIENT_REVIEW_URGENT: 14,       // Proposal Under Client Review
    FOR_REVISION_WATCH: 2,        FOR_REVISION_URGENT: 3,         // For Revision
    CLIENT_APPROVED_WATCH: 3,     CLIENT_APPROVED_URGENT: 7,      // Client Approved
    MOBILIZATION_WATCH: 3,        MOBILIZATION_URGENT: 10,        // For Mobilization
    FOR_INSPECTION_WATCH: 2,      FOR_INSPECTION_URGENT: 5,       // For Inspection
    ONGOING_QUIET_WATCH: 7,       ONGOING_QUIET_URGENT: 14,       // On-going (activity clock, D-03)
    DLP_SOON_DAYS: 14             // DLP expiring soon watch (D-06)
};

// extracted-by-copy from app/views/projects.js:911 (Phase 108, D-02) — canonical copy lives there; keep in sync
// Phase 103 D-08 — updated_at is written as ISO string AND Firestore Timestamp; normalize both.
// Returns epoch-ms number, or null when missing/unparseable (caller degrades to On Track).
export function normalizeUpdatedAt(v) {
    if (v == null) return null;
    if (typeof v === 'object') {
        if (typeof v.toDate === 'function') { const d = v.toDate(); return isNaN(d) ? null : d.getTime(); }
        if (typeof v.seconds === 'number') return v.seconds * 1000;
        return null;
    }
    if (typeof v === 'number') return isNaN(v) ? null : v;
    const t = new Date(v).getTime();
    return isNaN(t) ? null : t;
}

// extracted-by-copy from app/views/projects.js:925 (Phase 108, D-02) — canonical copy lives there; keep in sync
// Phase 103.1 D-02 — stage-duration clock: time since the current stage began.
// status_changed_at ?? updated_at ?? created_at; legacy docs degrade until their next transition.
export function stageDaysInStage(p, now) {
    const ms = normalizeUpdatedAt(p.status_changed_at) ?? normalizeUpdatedAt(p.updated_at) ?? normalizeUpdatedAt(p.created_at);
    return ms == null ? null : (now - ms) / 86400000;
}

// extracted-by-copy from app/views/projects.js:897 (Phase 108, D-02) — canonical copy lives there; keep in sync
// (IDENTICAL to app/views/services.js:952). Param renamed project→engagement for project/service
// neutrality; body unchanged. NOTE (RESEARCH gotcha 6): returns 'active' for any non-Completed or
// dlp_months-absent engagement, so DLP feed sources MUST pre-filter project_status==='Completed'.
// Phase 102 Plan 05 — DLP state machine mirroring the D-16 contract from project-detail.js.
export function getDlpState(engagement) {
    if (!engagement || !engagement.dlp_months || engagement.project_status !== 'Completed') return 'active';
    if (engagement.retention_released_at) return 'released';
    if (Date.now() > new Date(engagement.dlp_expires_at || null).getTime()) return 'expired';
    return 'in-dlp';
}

// extracted-by-copy from app/views/projects.js:931 (Phase 108, D-02) — canonical copy lives there; keep in sync
// Internal helper (NOT exported). Phase 103 D-07 — a status-appropriate "On Track" phrase.
function getDefaultOkSignal(p) {
    switch (p.project_status) {
        case 'On-going':   return 'On track';
        case 'Completed':  return getDlpState(p) === 'released' ? 'Fully collected' : 'Completed';
        case 'Loss':       return 'Lost engagement';
        default:           return p.project_status || '—';
    }
}

// extracted-by-copy from app/views/projects.js:942 (getProjectSignal, Phase 108, D-02) — canonical copy
// lives there; keep in sync. Unified project+service urgency signal.
//
// SERVICE DIVERGENCE (accepted): services.js:971 getServiceSignal is a near-duplicate whose ONLY
// difference is the On-going branch — services gate the last_activity urgent tier behind
// `service_type !== 'recurring'` (recurring services are quiet by design → watch-only / suppressed).
// This copy keeps the projects.js On-going activity clock. That divergence does NOT affect the feed:
// per RESEARCH gotcha 5, feed severity is RECOMPUTED against the D-01 bands (home-feed-sources.js
// THRESHOLDS), NOT read off signal.level, and stale-progress (feed source #11) recomputes its own
// progress band. So getEngagementSignal is safe to use for both projects and services here.
//
// Phase 103.1 D-04 — two-tier urgency signal. Stage-duration statuses read status_changed_at; On-going
// reads last_activity_at (D-03); DLP-soon watch (D-06). Returns { level, text, hint }.
export function getEngagementSignal(p, now) {
    const status = p.project_status;
    const dlp = getDlpState(p);

    // (1) DLP expired — highest urgent (unchanged from Phase 103)
    if (dlp === 'expired')
        return { level: 'urgent', text: 'Retention release overdue', hint: 'DLP expired — retention not yet released' };

    // (2) On-going — activity-recency clock (D-03), two-tier 7d/14d on last_activity_at ?? updated_at
    if (status === 'On-going') {
        const ms = normalizeUpdatedAt(p.last_activity_at) ?? normalizeUpdatedAt(p.updated_at);
        const d = ms == null ? null : (now - ms) / 86400000;
        if (d != null && d > URGENCY_THRESHOLDS.ONGOING_QUIET_URGENT)
            return { level: 'urgent', text: `No activity in ${Math.round(d)} days`, hint: 'On-going project has gone quiet' };
        if (d != null && d > URGENCY_THRESHOLDS.ONGOING_QUIET_WATCH)
            return { level: 'watch', text: `Quiet for ${Math.round(d)} days`, hint: 'No journal activity recently' };
        if (dlp === 'in-dlp') return { level: 'ok', text: 'In defect liability period', hint: 'Retention held pending DLP' };
        return { level: 'ok', text: getDefaultOkSignal(p), hint: '' };
    }

    // (3) Stage-duration funnel statuses — two-tier on status_changed_at
    const d = stageDaysInStage(p, now);
    const FUNNEL = {
        'For Proposal': {
            watch: URGENCY_THRESHOLDS.FOR_PROPOSAL_WATCH, urgent: URGENCY_THRESHOLDS.FOR_PROPOSAL_URGENT,
            watchText: dd => ({ text: `Proposal not yet sent — ${dd}d`, hint: 'Client awaiting our quote' }),
            urgentText: dd => ({ text: `Proposal stalled — ${dd}d`, hint: `No proposal sent in ${dd} days` })
        },
        'Proposal for Internal Approval': {
            watch: URGENCY_THRESHOLDS.INTERNAL_APPROVAL_WATCH, urgent: URGENCY_THRESHOLDS.INTERNAL_APPROVAL_URGENT,
            watchText: dd => ({ text: `Awaiting internal sign-off — ${dd}d`, hint: 'Proposal ready, pending approval' }),
            urgentText: dd => ({ text: `Sign-off overdue — ${dd}d`, hint: 'Finished proposal blocked internally' })
        },
        'Proposal Under Client Review': {
            watch: URGENCY_THRESHOLDS.CLIENT_REVIEW_WATCH, urgent: URGENCY_THRESHOLDS.CLIENT_REVIEW_URGENT,
            watchText: dd => ({ text: `Awaiting client response — ${dd}d`, hint: 'Client reviewing the proposal' }),
            urgentText: dd => ({ text: `Proposal stale — ${dd}d`, hint: "Client hasn't responded" })
        },
        'For Revision': {
            watch: URGENCY_THRESHOLDS.FOR_REVISION_WATCH, urgent: URGENCY_THRESHOLDS.FOR_REVISION_URGENT,
            watchText: dd => ({ text: `Revision requested — ${dd}d`, hint: 'Tight turnaround expected' }),
            urgentText: dd => ({ text: `Revision overdue — ${dd}d`, hint: 'Revision turnaround exceeded' })
        },
        'Client Approved': {
            watch: URGENCY_THRESHOLDS.CLIENT_APPROVED_WATCH, urgent: URGENCY_THRESHOLDS.CLIENT_APPROVED_URGENT,
            watchText: dd => ({ text: `Won — not yet mobilized — ${dd}d`, hint: 'Client expects kickoff' }),
            urgentText: dd => ({ text: `Kickoff overdue — ${dd}d`, hint: `Won work idle ${dd} days` })
        },
        'For Mobilization': {
            watch: URGENCY_THRESHOLDS.MOBILIZATION_WATCH, urgent: URGENCY_THRESHOLDS.MOBILIZATION_URGENT,
            watchText: dd => ({ text: 'Contract signed, not mobilized', hint: `${dd}d since For Mobilization` }),
            urgentText: dd => ({ text: `Mobilization overdue — ${dd}d`, hint: 'Not mobilized after sign-off' })
        },
        'For Inspection': {
            watch: URGENCY_THRESHOLDS.FOR_INSPECTION_WATCH, urgent: URGENCY_THRESHOLDS.FOR_INSPECTION_URGENT,
            watchText: dd => ({ text: `Inspection pending — ${dd}d`, hint: 'Chase inspection' }),
            urgentText: dd => ({ text: `Inspection overdue — ${dd}d`, hint: 'No progress since assigned' })
        }
    };
    const cfg = FUNNEL[status];
    if (cfg && d != null) {
        const dd = Math.round(d);
        if (d > cfg.urgent) return { level: 'urgent', ...cfg.urgentText(dd) };
        if (d > cfg.watch)  return { level: 'watch', ...cfg.watchText(dd) };
    }

    // (4) DLP-soon watch (D-06) — in-dlp and dlp_expires_at within DLP_SOON_DAYS
    if (dlp === 'in-dlp') {
        const exp = normalizeUpdatedAt(p.dlp_expires_at);
        if (exp != null) {
            const daysToExpiry = (exp - now) / 86400000;
            if (daysToExpiry >= 0 && daysToExpiry <= URGENCY_THRESHOLDS.DLP_SOON_DAYS)
                return { level: 'watch', text: `Retention release due in ${Math.ceil(daysToExpiry)}d`, hint: 'Finance lead time before overdue' };
        }
        return { level: 'ok', text: 'In defect liability period', hint: 'Retention held pending DLP' };
    }

    // (5) On Track
    return { level: 'ok', text: getDefaultOkSignal(p), hint: '' };
}

// extracted-by-copy from app/views/finance.js:89 (Phase 108, D-02) — canonical copy lives there; keep in sync
// Derive RFP payment status from payment_records arithmetic.
// Status is NEVER stored in Firestore — always computed at render time.
// Priority: Fully Paid > Overdue > Partially Paid > Pending
export function deriveRFPStatus(rfp) {
    const totalPaid = (rfp.payment_records || [])
        .filter(r => r.status !== 'voided')
        .reduce((s, r) => s + (r.amount || 0), 0);
    const isOverdue = rfp.due_date && new Date(rfp.due_date) < new Date();
    const total = getRFPTotal(rfp);
    if (totalPaid >= total && total > 0) return 'Fully Paid';
    if (isOverdue) return 'Overdue';
    if (totalPaid > 0) return 'Partially Paid';
    return 'Pending';
}

// extracted-by-copy from app/views/finance.js:110 (Phase 108, D-02) — canonical copy lives there; keep in sync
// (ALSO inlined in app/expense-modal.js — hygiene dup noted at finance.js:106-108.)
// Derive collectible payment status from payment_records arithmetic.
// Status is NEVER stored in Firestore — always computed at render time (D-19).
// Priority: Fully Paid > Overdue > Partially Paid > Pending (D-18)
export function deriveCollectibleStatus(coll) {
    const totalPaid = (coll.payment_records || [])
        .filter(r => r.status !== 'voided')
        .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const isOverdue = getCollectibleUrgency(coll).isOverdue;
    if (totalPaid >= coll.amount_requested && coll.amount_requested > 0) return 'Fully Paid';
    if (isOverdue) return 'Overdue';
    if (totalPaid > 0) return 'Partially Paid';
    return 'Pending';
}

// extracted-by-copy from app/views/finance.js:129 (Phase 108, D-02) — canonical copy lives there; keep in sync
// SINGLE SOURCE OF TRUTH for collectible urgency + the overdue definition (Phase 99.2, D-08b).
// Returns { tier, daysOverdue, daysUntilDue, isOverdue } where
//   tier ∈ 'critical'|'overdue'|'near-due'|'partial'|'healthy'|'paid'.
// A collectible with no due_date is never overdue/critical/near-due (returns healthy or partial).
export function getCollectibleUrgency(coll) {
    const totalPaid = (coll.payment_records || [])
        .filter(r => r.status !== 'voided')
        .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const amt = parseFloat(coll.amount_requested) || 0;
    const fullyPaid = totalPaid >= amt && amt > 0;
    // ONE overdue definition (D-08b). Day-granularity diff from today (local midnight).
    let daysOverdue = 0, daysUntilDue = null, isOverdue = false;
    if (coll.due_date) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const due = new Date(coll.due_date + 'T00:00:00');
        const diffDays = Math.round((due - today) / 86400000);
        if (diffDays < 0) { isOverdue = !fullyPaid; daysOverdue = -diffDays; }
        else { daysUntilDue = diffDays; }
    }
    let tier;
    if (fullyPaid) tier = 'paid';
    else if (isOverdue && daysOverdue >= 30) tier = 'critical';
    else if (isOverdue) tier = 'overdue';                 // 1–29
    else if (daysUntilDue !== null && daysUntilDue <= 7) tier = 'near-due';
    else if (totalPaid > 0) tier = 'partial';
    else tier = 'healthy';
    return { tier, daysOverdue, daysUntilDue, isOverdue };
}
