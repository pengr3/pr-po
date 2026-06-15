---
spike: 030
name: deep-link-intent
type: standard
validates: "Given parseHash() drops query strings and handleHashChange() ignores subpath for normal routes, when a tile routes via the subpath slot and finance.init() honors it, then clicking '5 overdue' lands on the collectibles table already filtered to Overdue"
verdict: PENDING
related: [028, 029]
tags: [routing, deep-link, intent, router, finance, collectibles, action-center, home]
---

# Spike 030: Deep-Link Intent

## What This Validates
Given the router drops intent in two places today, when an Action Center tile routes via the existing
`subpath` slot (`#/finance/collectibles/overdue`) and the destination view honors it on `init()`, then the
tile lands the user on the destination **already filtered** — proven end-to-end on one real destination
(Finance ▸ Collectibles ▸ Overdue).

## Why This Gates the Action Center (from Spike 028)
An action tile that says "5 overdue collectibles" but dumps you into the full unfiltered table is *worse*
than no link — you still have to hunt. The whole promise of the Action Center is "click → you're looking at
exactly those items." That promise lives or dies on whether routing can carry **intent**.

## The Two Real Drops (confirmed in code)
1. **`parseHash()` discards query strings** — `const path = '/' + parts[0].split('?')[0]`. So
   `#/finance/collectibles?filter=overdue` loses `?filter=overdue` structurally. → intent must ride the
   **path/subpath** slot, not a query string.
2. **`handleHashChange()` ignores `subpath` for normal routes** — it calls `navigate(path, tab)`. Only the
   special detail/plan routes forward a third segment. So `#/finance/collectibles/overdue` parses a
   `subpath='overdue'` that then **never reaches the view**.

## Why the Fix Is Surgical (not a rewrite)
- **The transport already exists.** `navigate(path, tab, param)` already forwards `param` into both
  `render(activeTab, param)` and `init(activeTab, param)` (that's how `#/projects/detail/CODE` works).
- **The filter already exists.** Collectibles already supports `'Overdue'` as a value:
  `#collStatusFilter` → `collStatusFilter` → `getDisplayedCollectibles()` (`finance.js:1310/1328`).
- So honoring intent = **(a)** `handleHashChange()`/`handleInitialRoute()` pass `subpath` as the 3rd arg,
  and **(b)** `finance.render()`/`finance.init()` (currently `(activeTab)` only — they ignore the 2nd arg)
  accept an `intent` and set `collStatusFilter` from a small map before first render. That's it.

## Fidelity
- `realParseHash()` in `spike.html` is a **verbatim logic port** of `app/router.js` `parseHash()`.
- The "Today's router" path reproduces `handleHashChange()` calling `navigate(path, tab)` (subpath dropped).
- The mock collectibles destination uses the **same `collStatusFilter` mechanism + `'Overdue'` value** as
  `finance.js`, and the "manual filter" dropdown proves the deep link sets the *identical* internal state.

## How to Run
Self-contained — just open the file:
```
.planning/spikes/030-deep-link-intent/spike.html
```

## What to Expect
1. Start in **"Today's router"** mode. Click **"5 Overdue collectibles."** The Router trace shows
   `subpath='overdue'` parsed but **dropped** → the destination lands on the **full unfiltered** table.
2. Flip to **"Intent-aware router."** Click the same tile. Trace shows `navigate(path, tab, subpath)` →
   intent `'overdue'` reaches `finance.init()` → table lands **pre-filtered to Overdue (5 rows)**, the
   status dropdown reads "Overdue," and a "set by route ✓" flag appears.
3. Change the status dropdown manually — same filtered result, proving the deep link just sets the
   existing internal state.
4. Click **"Project at risk"** — even in intent-aware mode it can't filter, because the Projects view has
   no at-risk filter yet (the honest "routing ≠ sufficient" caveat).

## Observability
Bottom-right log: navigations, intent drops (red) vs forwards (green), and router-mode switches.

## Investigation Trail
1. Traced the real router: found intent dies twice (query strip in `parseHash`, subpath ignored in
   `handleHashChange`), but `navigate`'s `param` already threads to `render`/`init`.
2. Read `finance.js` collectibles: filter is internal module state set by `filterCollectiblesTable()` from
   dropdowns; `getDisplayedCollectibles()` already filters on `deriveCollectibleStatus(c) === collStatusFilter`
   with `'Overdue'` a first-class value. So the destination is *ready*; only the entry point is missing.
3. Built the before/after as a router-mode toggle so the fix's effect is one click apart, and added the
   `at-risk` tile to demonstrate the per-destination caveat.

## Results
**Verdict: PENDING — awaiting browser UAT.**

Pre-UAT assessment: **FEASIBLE and small.** End-to-end intent works with a ~1-line router change plus a
per-view intent map. Concrete change set for the real build:
- `router.js`: in `handleHashChange()` + `handleInitialRoute()`, forward `subpath` →
  `navigate(path, tab, subpath)` for tab-bearing routes (guard the existing detail/plan special-cases).
- `finance.js`: `render(activeTab, intent)` / `init(activeTab, intent)` → if `tab==='collectibles'` and
  `INTENT_TO_STATUS[intent]`, set `collStatusFilter` before first render.
- **Caveat to honor:** only wire tiles whose destination already owns the filter. "At-risk projects" and
  the proposal queue need their filter built first — inventory before wiring.

Open questions for your verdict:
1. Path slot `#/finance/collectibles/overdue` vs an explicit `?intent=` — confirm path slot (query is
   dropped, so path slot is the pragmatic choice).
2. Which tiles ship in v1 — only the ones with ready filters (collectibles/overdue, MRFs-to-process), and
   defer at-risk-projects until that filter exists?
