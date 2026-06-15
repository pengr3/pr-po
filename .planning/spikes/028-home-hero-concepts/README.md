---
spike: 028
name: home-hero-concepts
type: comparison
validates: "Given the bosses want a 'hero' on an internal ops tool, when 4 hero concepts are mocked head-to-head with the real design system, then one direction gives the landing page genuine purpose without becoming website-fluff"
verdict: VALIDATED ✓ — Direction B (Action Center) chosen; gated on spikes 029 (roles) + 030 (routing)
related: [008, 009, 021, 022, 026, 027a, 027b, 027c, 029, 030]
tags: [home, hero, landing, dashboard, ux, action-center, kpi, role-adaptive, design]
---

# Spike 028: Home Hero Concepts

## What This Validates
Given the bosses want a "hero" on what is actually an internal operations tool (not a marketing
website), when 4 hero concepts are mocked head-to-head in one live switcher using the project's
real design tokens, then we can pick the direction that gives the landing page a genuine **purpose**
(state-of-the-business + what-needs-you) rather than an empty banner.

## The Problem Being Reframed
`app/views/home.js` currently opens with `🏗️ CLMC / Management System Portal` + 5 shortcut nav
cards + a small procurement stat card. It is a **lobby** — it greets and points at doors but does
no work of its own. The user's own words: *"this was just an initial thought to put shortcuts there,
not a proper functionality."* The bosses' word "hero" is really a request to make the page **feel
like it matters**. The spike translates that into operational value instead of marketing chrome.

## The Four Concepts (live in one switcher)

| Variant | Name | What it is | Function | Boss appeal |
|---------|------|-----------|----------|-------------|
| **A** | Brand Banner | Gradient band, logo, tagline, time-aware greeting | ~none | High (literal ask) |
| **B** | Action Center | "Here's what needs you" — role-adaptive deep-link tiles | Highest | Medium |
| **C** | Operations Pulse | Executive KPI band (projects / pipeline / outstanding / in-flight) | High (read-only) | Highest (the "wow") |
| **D** | Hybrid | Greeting polish + condensed pulse + one attention callout | High | High |

All four keep the existing 5 nav cards beneath the hero (they're genuinely useful) — the hero sits
*above* them. Variant A is intentionally included as the honest "we tried the banner" exhibit to
show the bosses *why* B/C/D earn their place.

## Design Language Carried Forward
Reuses validated patterns so the hero feels native, not bolted on:
- **Scorecard chips / big-number tiles** — spikes 026, 027a (collectible scorecards)
- **Progress + urgency accents (left borders, tone colors)** — spikes 012, 021, 027c
- **Role-gated content** — already the law in `home.js` (`getDashboardMode` / `getHomeSubTabConfig`)
- **Project CSS tokens** — `#1a73e8` primary, `#f59e0b` warning, `#ef4444` danger, `#059669` success

## How to Run
Fully self-contained — **just open the file** (no server, no imports, no fetch):
```
.planning/spikes/028-home-hero-concepts/spike.html   ← double-click / open in browser
```
Or serve it:
```bash
python -m http.server 8000
# → http://localhost:8000/.planning/spikes/028-home-hero-concepts/spike.html
```

## What to Expect
- A mock CLMC top-nav + a dark **variant switcher** (A / B / C / D) with a one-line pitch per concept.
- The hero region swaps live between the four concepts; the nav cards below stay constant so you're
  comparing *only the hero*.
- **Demo Controls** (bottom-left): change your name (greeting), switch **role** (5 roles — watch the
  pulse KPIs and action tiles re-shape), toggle **time of day**, and flip **day state** between
  "Busy day" and "All caught up" to see every concept's **empty state**.
- **Event Log** (bottom-right): every action-tile / nav-card click logs the *real deep-link target*
  it would route to (e.g. `#/finance/collectibles?filter=overdue`) — proving the wiring intent, not
  just the look.

## Observability
Bottom-right log pane records: variant switches (blue), role switches (grey), day-state toggles
(amber), and navigation intents (green, with the exact target hash). This is what verifies that the
"feeling" concepts (B/D) are backed by concrete, role-correct routing — not decoration.

## Investigation Trail
1. **Read the live surface** — `home.js` (840 lines) + `hero.css`. Confirmed the page already runs
   real-time listeners on mrfs/prs/pos/proposals and is heavily role-gated. So an "action" or "pulse"
   hero needs **no new data plumbing** — the counts it would show are already being fetched (or are a
   trivial extension: overdue collectibles, at-risk projects).
2. **Named the tension** — boss wants visual impact; tool needs purpose. Decided the winning concept
   must satisfy *both*, which is why A (impact only) is kept as a deliberate strawman and C/D lead
   with impact-that-is-also-information.
3. **Role-adaptivity is the real test** — a hero that shows "3 proposal approvals" to Finance (who
   can't approve proposals) is worse than no hero. So every concept is wired to a per-role PULSE and
   ACTIONS map across all 5 roles; the spike lets you flip roles and watch it re-shape.
4. **Edge case — the calm day** — an internal tool is opened *every day*, and most days nothing is on
   fire. A "needs you" hero that's empty 60% of the time must degrade gracefully. Added an explicit
   **"All caught up ✓"** empty state to B and D (toggle "All caught up" in controls). This is the
   make-or-break case for the action concepts and is often where the literal banner (A) quietly wins.

## Results
**Verdict: VALIDATED ✓ — Direction chosen: B (Action Center).**

The user picked **Action Center** as the hero direction, then correctly identified that it can't be
built on the current foundation without first nailing two contracts. Pressure-testing those instincts
against the codebase confirmed both — so B is the *shape*, gated on spikes **029** and **030** before
any real build.

### What the codebase investigation found (the reason B is gated)
1. **Three divergent role systems.** Canonical truth is `role_templates/{role}` (`permissions.tabs[tabId]
   = {access, edit}`, 7 roles, admin-editable via `/admin`, enforced by `permissions.js` + router). But
   `home.js`, `finance.js` (94 role refs), and `procurement.js` (76 refs) bypass it with **hardcoded
   role-name arrays**. Provable drift: `home.js` keys off role **`procurement_staff`**, which **does not
   exist** in `seed-roles.js` (canonical id is `procurement`) — so its intended exclusion silently never
   fires. An Action Center keyed off hardcoded names would fork this a 4th time and break on any new role.
2. **Permissions are tab-grained, not action-grained.** `{access, edit}` knows "can open Finance and
   edit," not "is the PR approver." `edit:true` is the closest proxy for "can act."
3. **Router can't carry intent — but the transport exists.** `parseHash()` strips query strings, so
   `?filter=overdue` is dropped. However `navigate(path, tab, param)` already passes a `param`/`subpath`
   into `render()`/`init()` (used for detail codes). Gap is that destination views filter off internal
   dropdown state and don't *consume* a route intent. → wiring problem, not a rebuild.
4. **A 4th attention system already exists: notifications** (`createNotification({user_id,...})`, the bell
   badge). Event-driven + user-targeted. The Action Center is state-driven + aggregate. They overlap;
   notifications already encode ownership (`user_id`) if it's ever needed.

### Decisions locked (from user Q&A)
- **Hero direction:** B — Action Center.
- **Responsibility is role-level, not per-person.** PR + Collectible → **Finance** role; Proposal →
  **Boss (super_admin)**. Shared team queues, first-come. No per-object assignment exists or is wanted.
- **Roles fit; enforcement is the problem.** Taxonomy is correct → **Consolidate**, do not redesign.
- **Scope = Consolidate:** derive "what needs me" from `role_templates` (`edit:true` + a small override
  table for cross-cutting actions like proposal approval); delete the hardcoded role arrays; fix the
  `procurement`/`procurement_staff` drift as a free side effect.
- **Known build risk (deferred):** biggest role is 7+ and growing → a shared queue at scale carries
  "I-thought-you-had-it" diffusion risk. NOT solved by data ownership (work isn't person-owned). Park a
  cheap UI mitigation (soft "I've got this" claim / presence dot) for the Action Center build — do not
  build an ownership layer now.
- **Empty-action roles** (services_user, operations_user, and — for proposals — services_admin) will see
  few/no action tiles → for them the Action Center degrades to "all caught up"; consider a Pulse/shortcut
  fallback hero. (029 quantifies this.)

### Calm-day / role-adaptivity (still to confirm in browser)
028's mock already handles the calm-day empty state and re-shapes per role; final feel is confirmed once
029/030 supply real responsibility + routing. Carry forward: **Action Center + explicit "all caught up"
state + role-derived tiles**.

### Next
- **029 `responsibility-map`** — prove "what needs me" derives from `role_templates`; expose every drift.
- **030 `deep-link-intent`** — prove a tile lands you pre-filtered on one real destination.
