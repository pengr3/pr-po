---
spike: 041
name: home-paradigm-reimagine
type: comparison
validates: "Given the home page is a dead lobby (brand banner + nav cards + one useless stat widget), when four genuinely-different home paradigms are mocked head-to-head in one live switcher with shared CLMC data, then one direction (or composition) gives the landing page real purpose beyond 'a smarter widget'"
verdict: PENDING
related: [028, 029, 030, 031, 032, 033]
tags: [home, landing, dashboard, ux, activity-feed, portfolio-map, briefing, action-center, role-adaptive, design, reimagine]
---

# Spike 041: Home Paradigm Reimagine

## What This Validates
Given the current `home.js` is a **lobby** (🏗️ CLMC banner + 5 nav cards + a 3-number procurement
stat widget that "provides nothing"), when four genuinely-different home-page *paradigms* are built
head-to-head in one live switcher over a single shared CLMC dataset, then the user can **feel** which
direction — or which composition of directions — gives the landing page real operational purpose
without being just "a smarter widget."

## Why This Exists (vs Spike 028)
Spike **028** already ran a 4-concept *hero* shootout and picked **Direction B — Action Center**
(gated on 029/030/031). But every 028 concept was still structurally *a band on top of the nav cards*.
The user's follow-up — *"creative shit other than widget that provides nothing"* — is a push to
reimagine **what the home page even is**, not to polish the hero band. So 041 keeps the 028 Action
Center as the **validated baseline exhibit** and pits three non-widget paradigms against it.

## The Four Paradigms (live in one switcher)

| Variant | Name | The home *becomes…* | Non-widget because | Degrades on a calm day? |
|---------|------|---------------------|--------------------|--------------------------|
| **A** | **Action Center** (028 baseline) | role-derived "what needs you" tiles, deep-linked | it's the reference — still a tile grid | **Poorly** → empty "all caught up" 60% of days |
| **B** | **Business Pulse** | a live reverse-chron feed of every business move | it's a *narrative of motion*, deep-links per row | **Well** → feed just shows the last moves, never blank |
| **C** | **Portfolio Command Map** | every project/service as a node on the lifecycle pipeline | it's a *strategic map*, not a list | **Well** → all-green, still informative |
| **D** | **Daily Briefing** | a synthesized per-role narrative + the 3 numbers that matter | it *tells you* what matters; composes A+B+C into prose | **Well** → "nothing urgent, here's the state" |

The honest finding the switcher is built to expose: **the Action Center (the 028 winner) is the one
paradigm that turns into a dead empty box on a quiet day** — exactly the failure the user is reacting
to. B/C/D all stay useful when nothing is on fire. The likely real answer is a **composition**
(Briefing header → Portfolio map / Pulse below), which the spike lets you feel by flipping fast.

## Design Language Carried Forward
Native, not bolted on — reuses validated patterns:
- **Deep-link intent on every click** (spike 030) — the event log prints the real route target.
- **Role-derived responsibility** (spikes 029/031) — 8 roles, tiles/briefing re-shape per role.
- **Activity journal as the feed source** (spike 032 `activity_entries`).
- **Lifecycle pipeline + stage-aware finance** (spikes 031/033/036) — the map's spine.
- **Project CSS tokens** — `#1a73e8` primary, `#f59e0b` warn, `#ef4444` danger, `#059669` success.

## How to Run
Self-contained single file — **just open it** (no server, no imports, no fetch):
```
.planning/spikes/041-home-paradigm-reimagine/spike.html
```
Or serve it:
```bash
python -m http.server 8000
# → http://localhost:8000/.planning/spikes/041-home-paradigm-reimagine/spike.html
```

## What to Expect
- Mock CLMC top-nav + a dark **switcher** (Action Center / Business Pulse / Portfolio Map / Daily
  Briefing) with a one-line pitch per paradigm. The home region swaps live; the 5 condensed nav
  "doors" stay beneath every paradigm (they're genuinely useful — just demoted from being the *point*).
- **Demo Controls** (bottom-left): change your **name**, switch **role** (all 8 — watch every
  paradigm re-shape), and flip **day state** between **Busy day** and **All caught up** to see each
  concept's empty/calm behavior (the make-or-break test).
- **Event Log** (bottom-right): every tile / feed-row / map-node / briefing-button click logs the
  **real deep-link target** it would route to (e.g. `#/finance/collectibles/overdue`) — proving the
  wiring intent across all four, not just the look.

### The money moments
1. On **Action Center**, flip to **All caught up** → it collapses to an empty "✓ All caught up" box.
   Now flip to **Business Pulse / Portfolio Map / Daily Briefing** on the same calm day → all three
   are still worth opening. That contrast is the whole argument for going beyond the action grid.
2. On **Daily Briefing**, switch roles Finance → Management → Operations User → Services User: the
   narrative, the 3 numbers, and the action buttons completely re-compose from the *same* dataset.

## Observability
Bottom-right log records: variant switches (blue), role switches (amber), day-state toggles (grey),
and navigation intents (green, with the exact target hash). The deep-link targets are what verify the
"feeling" paradigms (B/D) are backed by concrete, role-correct routing — not decoration.

## Investigation Trail
1. **Loaded the in-flight home series first** — 028 (Action Center chosen), 029/030/031 (role +
   deep-link contracts, built but pending browser UAT), plus the reusable journal (032) and portfolio
   table (033). Confirmed the new paradigms need **no new data plumbing**: every count/event they show
   is already fetched by `home.js` listeners or proven in a prior spike.
2. **Reframed the ask** — "better home, not a better widget." Translated into four *paradigms* (action
   / activity / map / narrative) rather than four *heroes*, so the comparison is about what the page
   fundamentally is.
3. **Built one shared dataset** (14 projects across 6 stages, 9 activity events with real deep-link
   targets, per-role action queues, a finance roll-up) so flipping paradigms compares interaction, not
   numbers — per the established spike convention.
4. **Stress-tested the calm day deliberately** — the failure mode of an internal tool opened daily is
   the empty action grid. Added an explicit calm/busy toggle so the user can feel which paradigms
   survive it. This is the edge case that most distinguishes the four.

## Results
**Verdict: PENDING — awaiting browser UAT.**

Pre-UAT assessment (Claude, from build): all four are feasible on existing data with zero new
collections. The Action Center is the weakest *standalone* home for a daily-opened internal tool
because it's empty most days; B/C/D each fill that gap differently. The Briefing (D) is the boldest and
the natural **composition host** — it can headline a page whose body is the Pulse (B) or Map (C). The
open question only a human can answer is *feel*: which paradigm (or stack) the bosses and daily users
actually want to land on. Carry-forward candidate for the real build: **Briefing header + Portfolio
Map (or Pulse) body**, with the Action Center's "what needs you" folded in as the Briefing's bullets.

### To confirm in browser
- Does the **Pulse** feel alive/useful or noisy? Is per-row deep-linking the right interaction?
- Does the **Map** read as "the whole book of work at a glance," and is 6 collapsed stages the right
  granularity (vs the full 10-status model)?
- Does the **Briefing** feel like a smart assistant or a gimmick? Are the 3-numbers + 3-bullets the
  right density?
- **Composition**: if you had to ship one page, is it a single paradigm or a stack? Which stack?
