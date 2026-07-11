# Phase 108 — Discussion Log

**Date:** 2026-07-11
**Mode:** discuss (default). Advisor mode off. No SPEC.md.
**Areas selected by user:** all four (Urgency thresholds · Costly derived sources · Busy-role feed shape · Cross-dept & assignment scope).

Requirements HOME-09–13 already specify *what* each role's feed contains, and Phase 107 locked the engine + scoping. Discussion covered only the *how/tuning* the user cares about. User selected the recommended default for all four.

## Area 1 — Urgency thresholds (→ D-01)
- **Options:** Recommended default bands · More aggressive · Calmer.
- **Chosen:** Recommended default bands.
- **Notes:** overdue-in-stage >14d critical / >7d high; DLP ≤3/≤7/≤14d; money (collectibles/RFP) >30d past-due critical / any past-due high / due ≤7d medium; no-progress ≥30d critical / ≥14d high; pure action states = high. Proposal sources keep 107 tuning.

## Area 2 — Costly derived sources (→ D-02)
- **Options:** Build all + reuse helpers · Build all, approximate the 2 priciest · Trim the hardest.
- **Chosen:** Build all, reuse helpers.
- **Notes:** implement every HOME-09–13 source, reusing deriveCollectibleStatus / DLP helpers / isOverdueInStage; one batched read per source in the parallel wave; planner flags/optimizes any full-collection scan (aggregation/index) to preserve Strategy A.

## Area 3 — Busy-role feed shape (→ D-03)
- **Options:** Keep generic ranking + roll-up · Pin key action per role · Raise cap for admins.
- **Chosen:** Keep generic ranking + roll-up.
- **Notes:** severity thresholds do the prioritization; category roll-up collapses high-volume groups; cap stays 8/25 for all roles; no per-role pinning.

## Area 4 — Cross-dept & assignment scope (→ D-04)
- **Options:** Single interleaved list · Group by department · Interleaved + dept filter.
- **Chosen:** Single interleaved list.
- **Notes:** super_admin = one merged severity-ranked list (both depts; dept via category chip); dept admins = their dept; *_user = assigned items; reuse existing predicates.

## Deferred / redirected
- DASH-* → Phase 109; mobile → Phase 111; live listeners + journal activity → future. No scope creep raised.

## Claude's discretion (to planner/researcher)
- Module placement for new sources (extend home-feed.js vs sibling); registry config shape; per-source category/icon/dedupeKey/deepLink; exact derivation-helper locations + which need aggregation/index.
