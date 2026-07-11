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

// Per-role feed DEFINITIONS + the full source library live in home-feed-sources.js (Phase 108).
// This engine imports getSourcesForUser (assembleFeed's default `sources` arg) and RE-EXPORTS it so
// existing consumers that import it from THIS module (home.js:23 — the 107.3 contract) keep resolving
// after the Plan-04 move. That module imports SEVERITY back from here — a benign 2-node cycle:
// SEVERITY is a frozen leaf const read only INSIDE source function bodies (call time), never at
// either module's top-level init.
import { getSourcesForUser } from './home-feed-sources.js';
export { getSourcesForUser };   // re-export: preserve home-feed.js public API (home.js imports it by name)

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
    // Phase 107.6 — run sources CONCURRENTLY (was a serial for-await loop). Each source is still
    // isolated in its own try/catch so one failing/malicious source cannot sink the feed (T-107-03);
    // a thrown source resolves to null and is counted toward allSourcesFailed.
    const settled = await Promise.all(sourceFns.map(async (source) => {
        try {
            const produced = await source(user);
            return Array.isArray(produced) ? produced : [];
        } catch (err) {
            console.error('[home-feed] source failed:', source?.name || 'anonymous', err);
            return null;   // null marks a failed source (distinct from a legitimately empty [])
        }
    }));
    let collected = [];
    let failedCount = 0;
    for (const produced of settled) {
        if (produced === null) failedCount++;
        else collected = collected.concat(produced);
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
   SOURCE LIBRARY + PER-ROLE REGISTRY
   The 3 seed sources, scopeProposalToDept, the 17 Finance/Procurement/portfolio
   sources, the ROLE_SOURCES map, and getSourcesForUser now live in
   home-feed-sources.js (Phase 108, Plan 04). This module is the pristine engine;
   assembleFeed(user) defaults its `sources` arg to the imported getSourcesForUser.
   ======================================== */
