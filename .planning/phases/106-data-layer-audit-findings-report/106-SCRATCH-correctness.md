---
phase: 106-data-layer-audit-findings-report
plan: 04
requirement: AUDIT-04
artifact: 106-SCRATCH-correctness.md
provides: "correctness findings (temp IDs C-0N) in canonical D-07 schema for Plan 07 to merge/re-ID to F-00N"
method: "Anchor-driven static audit over 106-INVENTORY.md: per-listener lifecycle census (all 61 onSnapshot sites), write/read error-handling sweep, legacy-unsafe field-read sweep. Surgical reads of init()/destroy() bodies + write handlers; router.js read to resolve the same-view-no-destroy contract."
onsnapshot_sites: 61
listeners_clean: 41
listeners_flagged: 20
findings: 7
generated: 2026-07-09
---

# Phase 106 — AUDIT-04: Data-Layer CORRECTNESS Findings

**Dimension:** correctness (listener lifecycle · read/write error handling · legacy-unsafe field reads).
**Anchor map:** `106-INVENTORY.md` (61 onSnapshot sites, 226 writes, JSON.parse census).
**Severity rubric (D-08):** listener leak = Medium · missing error handling on non-critical read = Medium · **silent write failure on a path that matters = High** · legacy read showing WRONG data = High · legacy read that throws-and-is-caught / log-warns = Low.
**Scope (D-04):** v4.0 collections covered **statically**; live drift/orphan verification deferred to Phase 112. Read-only audit — no source modified.

## How this was verified (not a sample)

Every one of the **61 `onSnapshot` call-sites** in the inventory was opened and classified against three questions:
1. Is the unsubscribe handle **captured** (listeners[] array or named variable)?
2. Is it **cleared in `destroy()`**?
3. **Tab-switch leak:** the router (`router.js:313-347`) calls `destroy()` **only** on different-view navigation and re-calls `init(activeTab)` on same-view sub-tab switches (`navigateToTab` → hashchange). Does `init()` (or a tab-init helper) re-subscribe **without** first tearing down / guarding?

The **Coverage Ledger — listeners** below records a `clean`/`flagged` verdict for all 61. The router contract is the discriminator: views with router sub-tabs + `defaultTab` (finance, procurement, services) re-init on every tab switch; single-mount views (projects, clients, detail/plan views) and admin-wrapped views (user-management, assignments, role-config — `admin.js` destroys the child before switching, `admin.js:149-151`) do not.

---

## Summary Table (C-0N → Plan 07 merges to F-00N)

| ID | Severity | Category | Collection(s) | Anchor (representative) | One-line |
|----|----------|----------|---------------|-------------------------|----------|
| C-01 | Medium | correctness | prs, pos, transport_requests, rfps, collectibles, projects, services, billing_requests | finance.js:5287,5345,6592 | Finance re-subscribes whole-collection listeners on **every** sub-tab switch — no listeners[] clear/guard on re-init |
| C-02 | Medium | correctness | clients, users, services | services.js:449,482,906 | Services re-subscribes 3 listeners (incl. whole-collection clients+services) on every services↔recurring switch |
| C-03 | Medium | correctness | transport_requests | procurement.js:3054 | `loadRejectedTRs` has no idempotency guard yet runs on every procurement init → duplicate listener per tab switch |
| C-04 | Low | correctness | projects, suppliers | procurement.js:2936,5004 | `loadProjects`/`loadSuppliers` cache-guard has edge holes (empty dataset / TTL expiry) → re-subscribe without teardown; also no onSnapshot error callback |
| C-05 | Low | correctness | mrfs, prs, pos, projects, services | home.js:747,767,778; mrf-form.js:1046,1102 | Missing clear-before-subscribe guard — statsListeners pushed without clear; mrf-form overwrites handle without unsubscribe (latent orphan/duplicate) |
| C-06 | Medium | correctness | mrfs | procurement.js:3820,5830 | Unguarded `JSON.parse(mrf.items_json)` (no `\|\| '[]'`, no try/catch) throws on legacy/malformed MRF, breaking the detail render |
| C-07 | Low | correctness | projects, services | project-detail.js:3176,3359; service-detail.js:2895,3051,3235,3270,3296 | Bare fire-and-forget `last_activity_at` denormalization writes fail silently (inconsistent `.catch`) — derived activity-clock drift |

**0 High · 4 Medium · 3 Low.** No High correctness finding surfaced: per D-08 the listener leaks cap at Medium, and the audited **user-facing write paths are well-guarded** (see Notes) so no *silent-write-failure-that-matters* was found; the unguarded `JSON.parse` throws (breaks render) rather than showing wrong data, so it is Medium not High.

---

## Coverage Ledger — listeners

One row per `onSnapshot` call-site from `106-INVENTORY.md` (§ onSnapshot, 61 sites). Verdict is exactly `clean` or `flagged`.

| onSnapshot site (file.js:line) | verdict | note |
|--------------------------------|---------|------|
| auth.js:216 | clean | named handle `userDocUnsubscribe`; cleared before re-subscribe @197-199 + on sign-out @265/317/358 (explicit error cb — deliberate, auth.js:210) |
| engagement-create.js:602 | clean | pushed to `_formListeners` @617; `destroyEngagementForm` iterates+unsubscribes @640; `initEngagementForm` idempotent (destroys first) @590 |
| engagement-create.js:621 | clean | pushed to `_formListeners` @632; same idempotent teardown |
| notifications.js:293 | clean | `bellListener`; idempotent guard `if (bellListener) destroyNotifications()` @277; `destroyNotifications` unsubscribes @318-320 |
| permissions.js:92 | clean | `roleTemplateUnsubscribe`; cleared before re-subscribe @74-76; `destroyPermissionsObserver` @130-133 |
| assignments.js:183 | clean | listeners[]; admin-wrapped (destroy-on-switch @admin.js:149); `destroy` loops @218 |
| assignments.js:192 | clean | listeners[]; destroy @218 |
| assignments.js:201 | clean | listeners[]; destroy @218 |
| clients.js:191 | clean | listeners[]; single-route mount (/clients, no sub-tabs); destroy @161 |
| finance.js:1326 | flagged | `initPayablesTab` rfps listener; no guard, re-attaches on payables revisit → C-01 |
| finance.js:1336 | flagged | `initPayablesTab` pos listener → C-01 |
| finance.js:1992 | flagged | `initCollectiblesTab` collectibles listener; re-attaches on collectibles revisit → C-01 |
| finance.js:2006 | flagged | `initCollectiblesTab` projects listener → C-01 |
| finance.js:2025 | flagged | `initCollectiblesTab` services listener → C-01 |
| finance.js:2045 | flagged | `initCollectiblesTab` billing_requests listener → C-01 |
| finance.js:5287 | flagged | `loadPRs` prs listener; UNCONDITIONAL every init() @4422 → duplicates on every tab switch → C-01 |
| finance.js:5345 | flagged | `loadPRs` transport_requests listener; unconditional → C-01 |
| finance.js:6592 | flagged | `loadPOs` pos listener; unconditional @4423 → C-01 |
| home.js:615 | clean | `_proposalListener`; cleared before re-subscribe @612-613; destroy @832-833; error cb @660 |
| home.js:747 | flagged | `loadStats` mrfs listener → `statsListeners` with no clear-before-push (sibling _proposalListener guards; loadStats does not) → C-05 |
| home.js:767 | flagged | `loadStats` prs listener → C-05 |
| home.js:778 | flagged | `loadStats` pos listener → C-05 |
| mrf-form.js:1046 | flagged | `loadProjects` overwrites module handle `projectsListener` without unsubscribing prior (orphan risk on re-entry) → C-05 |
| mrf-form.js:1102 | flagged | `loadServices` overwrites `servicesListener` without unsubscribing prior → C-05 |
| procurement.js:2936 | flagged | `loadProjects` cache-freshness guard has edge holes (empty dataset `length>0` false, or CACHE_TTL expiry) → re-subscribe without teardown; also NO onSnapshot error callback → C-04 |
| procurement.js:3007 | clean | `loadMRFs` guarded by `_mrfListenerActive` @2994; flag reset in destroy @2787; error cb @3036 |
| procurement.js:3054 | flagged | `loadRejectedTRs` UNGUARDED and unconditional every init @2627 → duplicate transport_requests listener per tab switch → C-03 |
| procurement.js:5004 | flagged | `loadSuppliers` cache-guard edge holes (mirror of loadProjects) + NO onSnapshot error callback → C-04 |
| procurement.js:7383 | clean | `loadPOTracking` guarded by `_poTrackingListenerActive` @7368; flag reset in destroy @2788 |
| procurement.js:7426 | clean | records rfps guarded by `_rfpListenerActive` @7424; flag reset in destroy @2789 |
| project-detail.js:205 | clean | `usersListenerUnsub`; re-init teardown @174 (Phase 101); destroy @417 |
| project-detail.js:221 | clean | project_code listener; re-init teardown @173; rebind clears prior @229; destroy @412 |
| project-detail.js:230 | clean | per-doc rebind; prior handle cleared @229 before reassign; error path swallowed intentionally |
| project-detail.js:330 | clean | `currentTasksListenerUnsub`; idempotent `ensureTasksListener` @328; teardown @177 |
| project-detail.js:354 | clean | `billingRequestsListenerUnsub`; idempotent @351; teardown @175 |
| project-detail.js:374 | clean | `collectiblesListenerUnsub`; idempotent @371; teardown @176 |
| project-detail.js:3709 | clean | `journalActivityUnsub`; idempotent `ensureJournalListeners` @3708; teardown @178; error cb @3720; bounded limit(50) |
| project-detail.js:3725 | clean | `journalProgressUnsub`; idempotent @3724; teardown @179; error cb @3736 |
| project-detail.js:3741 | clean | `journalIssuesUnsub`; idempotent @3740; teardown @180; error cb @3752 |
| project-plan.js:291 | clean | `tasksUnsub` → listeners[]; idempotent re-attach @4117; destroy loops @473 |
| projects.js:432 | clean | clients listener → listeners[]; single-mount (/projects, no navigateToTab/defaultTab); destroy @379 |
| projects.js:464 | clean | users listener → listeners[]; single-mount; destroy @379 |
| projects.js:848 | clean | projects listener → listeners[]; single-mount; destroy @379 |
| projects.js:865 | clean | `collectiblesListener` → listeners[]; single-mount; destroy @379 |
| role-config.js:235 | clean | unsubscribe → listeners[]; admin-wrapped (destroy-on-switch); destroy @269 |
| service-detail.js:175 | clean | `usersListenerUnsub`; re-init teardown @141; destroy @275; error cb @188 |
| service-detail.js:194 | clean | service listener; re-init teardown @140; destroy @270; error cb @236 |
| service-detail.js:409 | clean | `currentTasksListenerUnsub`; idempotent `ensureTasksListener` @407; teardown @148 |
| service-detail.js:432 | clean | `billingRequestsListenerUnsub`; idempotent @429; teardown @142 |
| service-detail.js:449 | clean | `collectiblesListenerUnsub`; teardown @143 |
| service-detail.js:3385 | clean | `journalActivityUnsub`; idempotent; teardown @144; bounded limit(50) |
| service-detail.js:3392 | clean | `journalProgressUnsub`; teardown @145 |
| service-detail.js:3399 | clean | `journalIssuesUnsub`; teardown @146 |
| service-plan.js:200 | clean | `tasksUnsub` → listeners[]; idempotent re-attach @3006; destroy loops @358 |
| services.js:449 | flagged | `loadServiceClients` clients listener; unconditional from init @353; navigateToTab('services'\|'recurring') drives re-init → C-02 |
| services.js:482 | flagged | `loadServiceActiveUsers` users listener; unconditional @354 → C-02 |
| services.js:906 | flagged | `loadServices` services listener; unconditional @355 → C-02 |
| user-management.js:237 | clean | `codesListener` → listeners[]; admin-wrapped (destroy-on-switch); destroy @1803 |
| user-management.js:252 | clean | `pendingUsersListener` → listeners[]; destroy @1803 |
| user-management.js:266 | clean | `allUsersListener` → listeners[]; destroy @1803 |
| user-management.js:276 | clean | `projectsUnsub` → listeners[]; destroy @1803 |

**Ledger totals: 61 sites — 41 clean · 20 flagged.** Flagged = finance.js ×9, home.js ×3, mrf-form.js ×2, procurement.js ×3, services.js ×3.

**False-positive leads (per-file matrix `arr[]=no` flags that proved clean on inspection):** auth, engagement-create, notifications, permissions, project-detail (9), service-detail (8) all use **named-handle** cleanup with idempotent guards / re-init teardown — the matrix flag reflected *style* (named var vs `listeners[]` array), not an actual leak. The detail views were explicitly retrofitted with re-init teardown blocks (project-detail.js:165-180 "Phase 101 fix"; service-detail.js:134-148) precisely to satisfy the router's same-view-no-destroy contract.

---

## Findings

### C-01 — Finance re-subscribes whole-collection listeners on every sub-tab switch (no listeners[] clear on re-init)
- severity: Medium
- category: correctness
- collection: prs, pos, transport_requests, rfps, collectibles, projects, services, billing_requests
- anchor: finance.js:5287, finance.js:5345, finance.js:6592 (unconditional), finance.js:1326, finance.js:1336, finance.js:1992, finance.js:2006, finance.js:2025, finance.js:2045 (tab-init); init @4390, destroy @5099
- impact: The router re-calls `init(activeTab)` on every Finance sub-tab switch **without** `destroy()` (router.js:314-346). `init()` unconditionally runs `loadPRs`/`loadPOs`/`loadApprovedTRsThisMonth` (4422-4424) — each attaches an `onSnapshot` and `listeners.push(...)` with **no** clear-before-subscribe and **no** idempotency flag. `initPayablesTab`/`initCollectiblesTab` similarly re-attach on each revisit of their tab. `listeners[]` is only emptied in `destroy()` (5107-5112), which fires only when leaving Finance entirely. Result: every approvals↔payables↔collectibles↔projects toggle adds ≥3 (and up to 9) duplicate **whole-collection** listeners on high-traffic collections. Over a work session these accumulate unboundedly — each Firestore change fans out to N duplicate callbacks (redundant table rebuilds + read amplification + memory growth). The in-code comment @1985-1989 asserting "no duplicate-attach risk on repeat tab-switch" is incorrect: its "runs ONCE per mount" premise fails because `init()` re-runs on every tab switch. (Note: the sibling scroll handler @4400 *is* guarded with `if (!_financeNavScrollHandler)` — the data listeners were simply not given the same guard.)
- recommendation: Clear `listeners[]` at the top of `init()` (forEach-unsubscribe then `listeners = []`) before any re-subscribe, OR gate each `load*/initTab` with a per-listener active-flag reset in `destroy()` (the pattern procurement.js already uses via `_mrfListenerActive`/`_poTrackingListenerActive`/`_rfpListenerActive`, procurement.js:2787-2789).
- handling: code-fix
- target_phase: 112

### C-02 — Services re-subscribes 3 listeners on every services↔recurring tab switch
- severity: Medium
- category: correctness
- collection: clients, users, services
- anchor: services.js:449, services.js:482, services.js:906; init @305 (calls loadServiceClients/loadServiceActiveUsers/loadServices @353-355), destroy @384
- impact: Finance-class leak. `#/services` has router sub-tabs via `navigateToTab('services'|'recurring')` (services.js:165,167) → same-view re-init without `destroy()`. `init()` unconditionally calls the three loaders (353-355); each does `const listener = onSnapshot(...)` + `listeners.push(listener)` with no guard. Switching Services↔Recurring duplicates the clients + users + **whole-collection services** listeners; cleared only on view exit. Secondary (same correctness class, DOM not Firestore): a fresh `permissionsChanged` handler is `addEventListener`'d on **every** init (services.js:317) but only the first is tracked in `window._servicesPermissionHandler` (319-321), so `destroy()` can remove only one — the rest are orphaned DOM listeners; `window._servicesAssignmentHandler` is likewise overwritten each init (328) losing the prior reference.
- recommendation: Clear `listeners[]` at init start (or per-listener flags reset in destroy); guard the `permissionsChanged`/`assignmentsChanged` `addEventListener` calls with an `if (!window._servicesPermissionHandler)` check (as procurement.js:2598 already does for its handlers).
- handling: code-fix
- target_phase: 112

### C-03 — `loadRejectedTRs` has no idempotency guard yet runs on every procurement init
- severity: Medium
- category: correctness
- collection: transport_requests
- anchor: procurement.js:3054 (onSnapshot), procurement.js:3050 (fn), procurement.js:2627 (unconditional call in init), destroy @2743
- impact: `init()` calls `loadRejectedTRs()` unconditionally on every procurement tab switch (request/mrfs/suppliers/records re-init without `destroy()`). Unlike its siblings `loadMRFs` (`_mrfListenerActive` @2994), `loadPOTracking` (`_poTrackingListenerActive` @7368) and the records rfps listener (`_rfpListenerActive` @7424) — all of which guard against re-attach AND are reset in `destroy()` (2787-2789) — `loadRejectedTRs` has neither a flag nor a cache guard. Each procurement tab switch therefore attaches an additional `transport_requests` (finance_status==Rejected) listener; they accumulate until the view is left. Lower blast radius than C-01/C-02 (single filtered listener), but the same defect class and trivially fixable by mirroring the existing flag pattern.
- recommendation: Add a `_rejectedTRsListenerActive` guard mirroring `_mrfListenerActive`, and reset it in `destroy()` alongside 2787-2789.
- handling: code-fix
- target_phase: 112

### C-04 — Procurement `loadProjects`/`loadSuppliers` cache-guard edge holes + missing onSnapshot error callbacks
- severity: Low
- category: correctness
- collection: projects, suppliers
- anchor: procurement.js:2936, procurement.js:2926-2955 (loadProjects); procurement.js:5004, procurement.js:4995-5017 (loadSuppliers)
- impact: Two-part. (a) **Edge-hole re-subscribe:** both loaders short-circuit only when `data.length > 0 && (Date.now() - _cachedAt) < CACHE_TTL_MS` (2927, 4996). The live listener keeps `_cachedAt` fresh, so in the common case repeat calls do not duplicate. But two holes remain: an **empty legitimate dataset** (`length > 0` is false → guard never trips → new listener attached every init) and **TTL expiry** while the user idles on the view (next init re-subscribes without unsubscribing the prior listener). Both leak a whole-collection listener. (b) **No error handler:** neither onSnapshot passes a 2nd-arg error callback (2936-2949, 5004-5015). On a transient permission-denied (e.g., a not-yet-propagated token — the exact condition auth.js:210 documents) Firebase logs an uncaught "Error in snapshot listener" with no app-level surfacing. projects/suppliers are broadly readable so a hard denial is unlikely, hence Low.
- recommendation: Convert the cache guards to listener-existence flags (attach once per mount, reset in destroy); add an `(error) => {...}` callback to both onSnapshot calls (matching the pattern already used at procurement.js:3036).
- handling: code-fix
- target_phase: 112

### C-05 — Missing clear-before-subscribe guard (home stats + mrf-form dropdowns) — latent orphan/duplicate
- severity: Low
- category: correctness
- collection: mrfs, prs, pos, projects, services
- anchor: home.js:747, home.js:767, home.js:778 (loadStats → statsListeners, no clear @741-790); mrf-form.js:1046, mrf-form.js:1102 (loadProjects/loadServices overwrite handle without unsubscribe)
- impact: Defensive-gap variant of the leak class, currently latent. (a) **home.js `loadStats`** pushes 3 listeners to `statsListeners` with no clear-before-push — inconsistent with its sibling `_proposalListener`, which *does* clear before re-subscribe (612-613). Home has no router sub-tabs (`init()` takes no tab; sub-tabs toggle in-page via `switchHomeTab`), and same-hash re-navigation does not fire `hashchange`, so under the current router it is not reachable — but any future same-route re-init (or an added refresh/mode-toggle path) would leak 3 whole-ish listeners each call. (b) **mrf-form.js** `loadProjects`/`loadServices` assign `projectsListener`/`servicesListener = onSnapshot(...)` **without** first unsubscribing an existing handle; if the loader is re-entered while a handle is live, the prior listener is **orphaned** (its reference is overwritten, so even `destroy()` cannot reach it). Mostly contained today by the sub-tab-switch guard (mrf-form.js:360-362) and procurement's teardown of the embedded form (procurement.js:2581-2584), so latent.
- recommendation: In loadStats, clear `statsListeners` before re-populating; in mrf-form loaders, add `if (projectsListener) { projectsListener(); projectsListener = null; }` (and the services equivalent) before re-subscribing — the exact pattern already at mrf-form.js:360-362.
- handling: code-fix
- target_phase: 112

### C-06 — Unguarded `JSON.parse(mrf.items_json)` throws on legacy/malformed MRF and breaks the detail render
- severity: Medium
- category: correctness
- collection: mrfs
- anchor: procurement.js:3820 (`renderMRFDetails`), procurement.js:5830; contrast mrf-form.js:675 (correct try/catch), 25+ sibling sites using `|| '[]'`
- impact: `renderMRFDetails()` does `const items = JSON.parse(mrf.items_json);` with **no** `|| '[]'` fallback and **no** enclosing try/catch (procurement.js:3820; same bare form at 5830). If `items_json` is `undefined`/`null` (legacy MRF written before the field existed, or a partial write), `JSON.parse` throws `SyntaxError` and the MRF-detail render aborts — the operator sees a broken/empty panel on that record. This is a legacy-unsafe read per CLAUDE.md ("must parse with `JSON.parse()`"). It throws (breaks the flow) rather than displaying wrong data, so Medium not High. **Systemic sub-point:** the ~25 sibling parses that *do* use `JSON.parse(x.items_json || '[]')` guard `null`/`undefined` but **not a malformed non-empty string** — `JSON.parse('{corrupt')` throws regardless of the `|| '[]'` fallback. Only mrf-form.js:675 (`try { … } catch { items = [] }`) is fully safe. (Cross-ref: Plan 01 integrity items_json warning count.)
- recommendation: Wrap the two bare parses in the mrf-form.js:675 try/catch idiom (default to `[]` on throw); consider a shared `parseItemsJson(x)` helper applied across all items_json read sites so malformed data degrades to empty rather than crashing the render.
- handling: code-fix
- target_phase: 112

### C-07 — Fire-and-forget `last_activity_at` denormalization writes fail silently (inconsistent `.catch`)
- severity: Low
- category: correctness
- collection: projects, services
- anchor: project-detail.js:3176, project-detail.js:3359; service-detail.js:2895, service-detail.js:3051, service-detail.js:3235, service-detail.js:3270, service-detail.js:3296 (bare); contrast the `.catch(console.debug)` siblings at project-detail.js:3556 and service-detail.js:3673/3686/3698/3728
- impact: These journal/lifecycle handlers bump a denormalized `last_activity_at` clock with a **bare** un-awaited `updateDoc(...)` — no `.catch`, no `await`. On failure (e.g., a non-team active user whose parent-doc write is correctly denied) the write fails silently: the On-going activity-freshness indicator drifts stale until the next successful activity. Deliberately non-blocking by design (so a denied bump does not roll back the journal entry — documented at project-detail.js:3553-3555), and low-value derived data that self-heals, hence Low. The finding is the **inconsistency**: some sites attach `.catch(console.debug)` and some do not, so a subset produces unhandled promise rejections.
- recommendation: Standardize on the `.catch(err => console.debug(...))` form for all last_activity_at bumps (make the fire-and-forget intent explicit and silence unhandled-rejection noise).
- handling: code-fix
- target_phase: 112

---

## Notes — what is CLEAN (audited, no finding)

These were checked and are correct; recording them so Phase 07/112 do not re-investigate:

- **Write error-handling posture is strong.** User-facing / data-bearing writes consistently use `try/catch` + `showToast` (proof-modal.js `saveProofUrl` @102-118; project-detail.js `submitNewIssue` @3540-3566) or `.catch` + `showToast` + optimistic-revert (project-plan.js Gantt drag/progress writes @2413-2444, permission-aware toast + `renderGantt()` revert). **No silent-write-failure on a path that matters was found** in the audited surface — the only unhandled writes are the low-value `last_activity_at` bumps (C-07). A full line-by-line census of all 226 writes was not exhaustive; representative critical paths + all statement-level fire-and-forget writes were checked.
- **Legacy-absent `suppliers.categories` reads are guarded.** All 5 read sites use `Array.isArray(...) ? ... : []` (procurement.js:119, 177, 5068, 5088, 5269) — the "uncategorized legacy supplier" case is handled correctly (CLAUDE.md categories note).
- **Legacy-safe department/status fallbacks confirmed** in the record-scope idiom `mrf.department || (mrf.service_code ? 'services' : 'projects')` (procurement.js:2984, ~5499) and the undefined-status guard `status && status !== 'Delivered'` (home.js:783). Case-sensitive status reads (`'Pending'`, `'Draft'`) match the write side; billing_requests intentionally uses lowercase `'pending'`/`'approved'` (finance.js:2052) consistently within that collection — no cross-casing mismatch found.
- **Detail-view listener retrofits are correct.** project-detail.js and service-detail.js — despite lacking the canonical `listeners[]` array — implement full re-init teardown blocks (project-detail.js:165-180; service-detail.js:134-148) plus idempotent `ensure*Listener` attachers, correctly handling the router's project→project / service→service same-view re-init.

## Scope & deferrals (D-04)

- **v4.0 collections** (proposals, collectibles, billing_requests, rfps, journal issues/progress_updates/activity_entries, baselines, audit_log, edit_history) were covered **statically** for listener/error/legacy correctness here. **Live** verification of the flagged leaks (e.g., counting duplicate listeners after N tab switches in DevTools) and any runtime error-callback behavior is **deferred to Phase 112** per D-04 — all findings carry `target_phase: 112`.
- Every finding carries a `file:line` anchor (T-106-08 mitigation) so Phase 112 can locate it without re-scanning.
