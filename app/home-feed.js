/* ========================================
   HOME — COMMAND CENTER FEED ENGINE
   Phase 107 (D-10/D-11) — reusable feed engine + seed source library.

   This module is the ENGINE (107); Phase 108 composes per-role feed
   DEFINITIONS from the source library seeded here (see getSourcesForUser).

   ── D-11 FEED-ITEM CONTRACT ─────────────────────────────────────────────
   A "feed source" is a reusable async function `(user) => item[]`.
   Each item the engine understands:

     {
       dedupeKey:    string,     // stable id, e.g. 'proposal-approval:{id}' — dedupe unit
       severity:     'critical' | 'high' | 'medium',   // source-declared (D-06)
       icon:         string,     // inline-SVG string (e.g. from TYPE_META) — engine is icon-agnostic
       title:        string,     // one-line headline
       subtitle:     string,     // supporting context (who / what / amount)
       category:     string,     // taxonomy key: 'proposal' | 'mrf' | ...  (→ .cc-cat-chip--{category})
       deepLink:     { kind: 'route', value: '#/…' }                        // sets location.hash
                   | { kind: 'modal', handler: 'homeQueueOpenApproveModal', arg: id },  // invokes window[handler](arg)
       timestamp:    Firestore Timestamp | { seconds } | ISO string | Date | null,  // age + within-tier sort
       overdueScore: number      // higher = more overdue; within-tier tiebreaker (default 0)
       // isRollup?: boolean     // set ONLY by the engine on synthetic roll-up rows
     }

   The engine never inspects business meaning — sources fill these fields.

   ── ENGINE INVARIANTS ───────────────────────────────────────────────────
   - Compute-on-load only (D-08): batched getDocs, NO persistent snapshot
     listeners here.
   - Pure library: NO DOM writes, registers NO global handlers in this module.
   - Ranking: critical → high → medium, then most-overdue, then newest-first.
   ======================================== */

import { db, collection, query, where, getDocs } from './firebase.js';
import { TYPE_META } from './notifications.js';
import { getAgeInStageDays, isOverdueInStage } from './views/proposals.js';

/** Public severity vocabulary (D-06 three-tier model). */
export const SEVERITY = Object.freeze({ critical: 'critical', high: 'high', medium: 'medium' });

/** Lower rank = higher severity = sorts first / wins dedupe. */
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2 };

/** Category → human plural label (used by roll-up rows). */
const CATEGORY_LABEL = {
    proposal: 'Proposals',
    mrf: 'MRFs',
    pr: 'PRs',
    tr: 'TRs',
    po: 'POs',
    finance: 'Finance items',
    rfp: 'RFPs',
    project: 'Projects',
    service: 'Services',
    issue: 'Issues',
    dlp: 'DLP items'
};

/** Category → list-route deep link (used by roll-up rows, medium severity). */
function categoryListRoute(category) {
    const routes = {
        proposal: '#/?tab=proposals',
        mrf: '#/procurement/records',
        pr: '#/procurement/records',
        tr: '#/procurement/records',
        po: '#/procurement/records',
        finance: '#/finance',
        rfp: '#/procurement/records',
        project: '#/projects',
        service: '#/services',
        issue: '#/',
        dlp: '#/'
    };
    return { kind: 'route', value: routes[category] || '#/' };
}

/**
 * Normalize any supported timestamp shape to epoch millis.
 * Handles Firestore Timestamp (toMillis), {seconds}, ISO string, Date, or null.
 */
function toMillis(ts) {
    return ts?.toMillis?.() ?? (ts?.seconds != null ? ts.seconds * 1000 : (ts ? new Date(ts).getTime() : 0));
}

/**
 * Sort by severity (critical→high→medium), then overdueScore desc,
 * then timestamp desc (newest first). Returns a NEW array (input untouched).
 */
export function rankItems(items) {
    return [...items].sort((a, b) => {
        const sevA = SEVERITY_RANK[a.severity] ?? 99;
        const sevB = SEVERITY_RANK[b.severity] ?? 99;
        if (sevA !== sevB) return sevA - sevB;
        const overA = a.overdueScore || 0;
        const overB = b.overdueScore || 0;
        if (overA !== overB) return overB - overA;              // more overdue first
        return toMillis(b.timestamp) - toMillis(a.timestamp);   // newest first
    });
}

/**
 * Dedupe by dedupeKey. When a key repeats (same record from two sources),
 * KEEP the highest-severity instance (lowest SEVERITY_RANK); drop the rest.
 */
export function dedupeItems(items) {
    const byKey = new Map();
    for (const item of items) {
        const key = item.dedupeKey;
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, item);
            continue;
        }
        const rankNew = SEVERITY_RANK[item.severity] ?? 99;
        const rankOld = SEVERITY_RANK[existing.severity] ?? 99;
        if (rankNew < rankOld) byKey.set(key, item);            // higher severity wins
    }
    return [...byKey.values()];
}

/**
 * D-05 roll-up: when ≥5 items share a category, keep the first 3 (in the
 * already-ranked order they arrive in) then insert ONE synthetic row
 * `+${N-3} more ${label}`, dropping the remaining N-3. Categories with <5
 * items are untouched. Expects a ranked list (assembleFeed ranks first).
 */
export function rollUpByCategory(items) {
    const counts = {};
    for (const it of items) {
        if (it.isRollup) continue;
        counts[it.category] = (counts[it.category] || 0) + 1;
    }
    const seen = {};
    const rolled = {};
    const out = [];
    for (const it of items) {
        const cat = it.category;
        const total = counts[cat] || 0;
        if (it.isRollup || total < 5) {
            out.push(it);
            continue;
        }
        seen[cat] = (seen[cat] || 0) + 1;
        if (seen[cat] <= 3) {
            out.push(it);
            continue;
        }
        if (!rolled[cat]) {
            rolled[cat] = true;
            const label = CATEGORY_LABEL[cat] || cat;
            out.push({
                dedupeKey: `rollup:${cat}`,
                severity: SEVERITY.medium,
                icon: '',
                title: `+${total - 3} more ${label}`,
                subtitle: '',
                category: cat,
                deepLink: categoryListRoute(cat),
                timestamp: null,
                overdueScore: 0,
                isRollup: true
            });
        }
        // else: already rolled for this category — drop remaining items
    }
    return out;
}

/**
 * Split a ranked list into what the hero shows.
 * - visible: first 8 (collapsed cap)
 * - rest:    items 8..25 (revealed by the "Show all (N)" expander)
 * - overflow: count beyond the hard cap of 25 (for "Showing 25 of N …")
 */
export function capItems(items) {
    return {
        visible: items.slice(0, 8),
        rest: items.slice(8, 25),
        overflow: Math.max(0, items.length - 25)
    };
}

/**
 * Orchestrate the feed for `user`. `sources` defaults to getSourcesForUser(user)
 * (the seed registry — Phase 108 replaces it). Each source runs in its own
 * try/catch so one failing/malicious source cannot sink the whole feed (T-107-03);
 * the error state is reserved for when EVERY source fails (allSourcesFailed).
 *
 * Returns everything the shell needs to render:
 *   {
 *     items,             // ranked + deduped + rolled-up (full list, pre-cap)
 *     cap,               // { visible, rest, overflow } from capItems
 *     total,             // real item count (roll-up rows excluded) — drives the attention count
 *     hasCritical,       // any critical item present (tone the count danger)
 *     hasHigh,           // any high item present (tone the count amber)
 *     allSourcesFailed,  // true ONLY when every source threw → show error state
 *     fetchedAt          // Date.now() — for the "Updated …" caption
 *   }
 * Empty feed ⇒ total === 0 → calm state (distinct from allSourcesFailed → error state).
 */
export async function assembleFeed(user, sources = getSourcesForUser(user)) {
    const sourceFns = Array.isArray(sources) ? sources : [];
    let collected = [];
    let failedCount = 0;
    for (const source of sourceFns) {
        try {
            const produced = await source(user);
            if (Array.isArray(produced)) collected = collected.concat(produced);
        } catch (err) {
            failedCount++;
            console.error('[home-feed] source failed:', source?.name || 'anonymous', err);
        }
    }
    const items = rollUpByCategory(rankItems(dedupeItems(collected)));
    return {
        items,
        cap: capItems(items),
        total: items.filter(i => !i.isRollup).length,
        hasCritical: items.some(i => i.severity === 'critical'),
        hasHigh: items.some(i => i.severity === 'high'),
        allSourcesFailed: sourceFns.length > 0 && failedCount === sourceFns.length,
        fetchedAt: Date.now()
    };
}

/* ========================================
   SEED SOURCES (D-12) + SCOPING + REGISTRY
   Three sources that prove the engine end-to-end and populate a Super Admin
   feed on day one. They exercise permission scope, ownership scope, both
   deep-link kinds, multiple tiers, and the empty state. Phase 108 reuses them.
   Each source issues a SCOPED getDocs and lets any failure propagate to
   assembleFeed's per-source try/catch (do NOT swallow here — assembleFeed owns
   the allSourcesFailed accounting, T-107-03).
   ======================================== */

/**
 * Mirror home.js filterProposalsForUser dept scope.
 * operations_* → 'projects'; services_* → 'services'; super_admin/others → null (all).
 * Callers filter on `(p.parent_collection || 'projects')` when this returns non-null.
 */
function scopeProposalToDept(role) {
    if (role === 'super_admin') return null;
    if (typeof role === 'string' && role.startsWith('operations_')) return 'projects';
    if (typeof role === 'string' && role.startsWith('services_')) return 'services';
    return null;
}

/**
 * SOURCE 1 — Proposals awaiting your approval (permission-scoped, modal deep-link).
 * Approver gate: only super_admin / operations_admin internally approve (mirror canApproveQueue).
 * Severity: overdue-in-stage → critical, else high.
 */
export async function sourceProposalsAwaitingApproval(user) {
    const role = user?.role;
    if (!['super_admin', 'operations_admin'].includes(role)) return [];   // approver gate

    const snap = await getDocs(query(
        collection(db, 'proposals'),
        where('status', '==', 'pending_internal')
    ));
    const dept = scopeProposalToDept(role);   // null = sees all (super_admin)
    const items = [];
    snap.forEach(docSnap => {
        const p = { id: docSnap.id, ...docSnap.data() };
        if (dept && (p.parent_collection || 'projects') !== dept) return;   // client-side dept scope
        const ageDays = getAgeInStageDays(p);
        const subtitle = [
            p.project_code,
            p.target_client_name,
            (p.amount != null ? ('₱' + Number(p.amount).toLocaleString()) : null)
        ].filter(Boolean).join(' · ');
        items.push({
            dedupeKey: `proposal-approval:${p.id}`,
            severity: isOverdueInStage(p) ? SEVERITY.critical : SEVERITY.high,
            icon: TYPE_META.PROPOSAL_SUBMITTED.icon,
            title: p.title || '—',
            subtitle,
            category: 'proposal',
            // Reuses the EXISTING approve/reject modal — the row opens approve;
            // reject is available inside that modal path. No new destructive UI.
            deepLink: { kind: 'modal', handler: 'homeQueueOpenApproveModal', arg: p.id },
            timestamp: p.current_status_since || p.created_at,
            overdueScore: ageDays
        });
    });
    return items;
}

/**
 * SOURCE 2 — Your proposals For Revision (ownership-scoped, route deep-link).
 * Ownership query on created_by == uid (no client filtering).
 * B4 (resolves D-02/D-12 in favor of D-02): emit a feed row ONLY when OVERDUE.
 * isOverdueInStage() covers only pending_*, so for for_revision the operative
 * overdue test is age-based (> 7 days). Non-overdue for-revision proposals still
 * appear in 107.4's Your Work bucket (a) via that panel's own query, regardless of age.
 */
export async function sourceMyProposalsForRevision(user) {
    if (!user?.uid) return [];

    const snap = await getDocs(query(
        collection(db, 'proposals'),
        where('created_by', '==', user.uid),
        where('status', '==', 'for_revision')
    ));
    const items = [];
    snap.forEach(docSnap => {
        const p = { id: docSnap.id, ...docSnap.data() };
        const ageDays = getAgeInStageDays(p);
        if (ageDays <= 7) return null;   // gate: only overdue for-revision proposals surface in the feed
        items.push({
            dedupeKey: `proposal-revision:${p.id}`,
            severity: ageDays > 14 ? SEVERITY.critical : SEVERITY.high,
            icon: TYPE_META.PROPOSAL_SUBMITTED.icon,
            title: p.title || '—',
            subtitle: 'Needs revision · ' + (p.project_code || '—'),
            category: 'proposal',
            deepLink: { kind: 'route', value: '#/?tab=proposals' },
            timestamp: p.current_status_since || p.created_at,
            overdueScore: ageDays
        });
    });
    return items;
}

/**
 * SOURCE 3 — Your rejected MRFs (requestor-scoped, route deep-link).
 * MRFs are scoped to a user by requestor_name == full_name (no created_by uid on mrfs).
 * status is case-sensitive 'Rejected' (CLAUDE.md). Severity fixed high.
 */
export async function sourceMyRejectedMRFs(user) {
    if (!user?.full_name) return [];

    const snap = await getDocs(query(
        collection(db, 'mrfs'),
        where('requestor_name', '==', user.full_name),
        where('status', '==', 'Rejected')
    ));
    const items = [];
    snap.forEach(docSnap => {
        const m = { id: docSnap.id, ...docSnap.data() };
        items.push({
            dedupeKey: `mrf-rejected:${m.id}`,
            severity: SEVERITY.high,
            icon: TYPE_META.MRF_REJECTED.icon,
            title: (m.mrf_id || 'MRF') + ' rejected',
            subtitle: (m.project_name || m.project_code || '—'),
            category: 'mrf',
            deepLink: { kind: 'route', value: '#/procurement/records' },
            // B2: rejection writes rejected_at (ISO string, procurement.js L4943); MRFs carry no
            // modified-timestamp field. toMillis handles ISO strings; date_needed (a future date)
            // is only a last-resort fallback (would yield negative age).
            timestamp: m.rejected_at || m.date_needed || null,
            overdueScore: 0
        });
    });
    return items;
}

/**
 * Seed source REGISTRY (D-10/D-12) — the seam Phase 108 replaces with a
 * role → source-set mapping + per-source severity thresholds; the seed sources
 * here become part of the reusable library it composes.
 *
 * For 107, return ALL THREE seed sources for every signed-in user — each source
 * self-gates by applicability (approver gate / uid / full_name), so unscoped
 * users simply get empty arrays back. No user → no sources.
 */
export function getSourcesForUser(user) {
    if (!user) return [];
    return [
        sourceProposalsAwaitingApproval,
        sourceMyProposalsForRevision,
        sourceMyRejectedMRFs
    ];
}
