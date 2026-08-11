# Architecture Research: Sentry Error Tracking Integration

**Domain:** Retrofitting error tracking (Sentry, CDN, no build) into an existing 55,189-LOC zero-build ESM SPA
**Researched:** 2026-08-11
**Confidence:** HIGH (all integration points verified by reading the actual files named below; CSP domain requirements verified via Sentry's own docs/forum; Sentry SDK internal handler-chaining behavior is MEDIUM — stated with that caveat where it matters)

Every file path, function name, and line-anchor below was confirmed by reading the file, not inferred from the milestone brief. Where a claim rests on Sentry SDK internals I could not verify against this repo's code, it is explicitly flagged MEDIUM confidence.

## System Overview: Current Bootstrap Sequence

```
index.html <head>  (parsed synchronously, blocking)
├─ styles/*.css, frappe-gantt.css
├─ <script src="lib/signature_pad.umd.min.js">        ← classic, blocking, self-hosted
├─ <script src="…chart.umd.min.js">                    ← classic, blocking, CDN
├─ <script src="…frappe-gantt.umd.js">                 ← classic, blocking, CDN
└─ [NEW] Sentry script tag(s) belong HERE ─────────────┐
                                                          │ must run before ↓
index.html <body>                                        │
├─ inline classic <script> (hamburger/dropdown helpers)  │
└─ <script type="module">                     (deferred, runs after HTML parse — same
    import './app/firebase.js';                execution-timing class as `defer`)
    import { initDiagnostics } from './app/diagnostics.js';
    import { initAuthObserver } from './app/auth.js';
    import { initRouter }       from './app/router.js';
    import './app/utils.js';
    import './app/components.js';
    import './app/notifications.js';
    import { startUpdateCheck } from './app/update-check.js';
    // on DOMContentLoaded (or immediately if already past 'loading'):
    initDiagnostics(); initAuthObserver(); initRouter(); startUpdateCheck();
</script>
```

Key facts that drive every answer below (verified in `index.html`, `app/router.js`, `app/firebase.js`):

- The three existing CDN `<script>` tags in `<head>` are **classic, synchronous, blocking** (no `defer`/`async`). They execute the instant the parser reaches them — strictly before the bottom `<script type="module">` block, whose module graph is fetched during parsing but **evaluated only after the document is fully parsed** (module scripts behave like `defer` per spec).
- `app/firebase.js` calls `initializeApp()` / `initializeFirestore()` at **module top level** — this runs the moment the module graph resolves `import './app/firebase.js';`, before `initDiagnostics()`/`initAuthObserver()`/`initRouter()` are even called.
- `app/firebase.js` also does a **dynamic** `import('./auth.js')` at its own bottom (line 210) specifically to avoid a static circular import with `auth.js` (which statically imports `firebase.js`). This is the repo's own established pattern for breaking cycles — reused below for the new module.
- `#app-container` shows a static "Loading application..." spinner (`index.html:135-140`) until `router.js`'s `handleInitialRoute()` runs, which only happens after `onAuthStateChanged` fires inside `initAuthObserver()` (`app/auth.js:308-311` and `:425-428`). Any failure before that point currently has **no visible error state other than the console** — this is the exact class of failure CLAUDE.md documents for stale ES modules ("hangs at 'Loading application...' with an empty console").

---

## Integration Point 1 — `Sentry.init()` placement and ordering

**Location:** `index.html` `<head>`, as a classic (non-module, non-deferred) `<script>` block, placed **before** the three existing CDN `<script>` tags (or immediately after them — order among the four CDN scripts doesn't matter to each other, but all four must precede the bottom `<script type="module">` block).

**Why it must be a classic head script, not an ESM import:**

1. **Timing.** A classic script in `<head>` runs synchronously during HTML parsing — before the browser even *begins* fetching the module graph for the bottom `<script type="module">` block (module fetching starts when the parser reaches that tag; evaluation happens even later, after parsing completes). Nothing in `app/firebase.js`, `app/auth.js`, or `app/router.js` can execute before a head classic script has already run.
2. **Import-order is not a substitute.** If `Sentry.init()` were instead invoked from inside the bootstrap module (e.g. `import { initSentry } from './app/errors.js'; initSentry();` placed before `import './app/firebase.js';`), it would *still* lose the race in the worst case that matters most: ES module evaluation order is dependency-graph-driven (depth-first, post-order), not simply "first import statement wins" once any of the imported modules has its own sub-dependencies. More importantly, even in the best-ordered case, the module fetch+parse+link cycle for `errors.js` is asynchronous relative to a classic script that already ran during head parsing. A classic head script is strictly earlier by construction; an ESM ordering trick is earlier only by convention and is one refactor away from silently breaking.
3. **What it must capture that a later init would miss:** `app/firebase.js`'s top-level `initializeApp()`/`initializeFirestore()` calls, the whole `auth.js` → `permissions.js`/`utils.js` static-import graph resolving, `router.js`'s `initRouter()`, and — the failure mode this repo's own CLAUDE.md calls out by name — a **stale/mismatched ES module** (`X is not a function`, `does not provide an export named 'Y'`). That class of error fires at module-link time, before any application code runs, and is only observable to Sentry if its global `error`-event listener (installed by `Sentry.init()`, see Integration Point 4) is already attached when the browser reports the link failure. If `Sentry.init()` runs later — e.g. gated behind a lazily-imported module, or worse, only inside a view module reached after the first route renders — every cold-start failure class (bad deploy, blocked Firebase CDN, stale module) is invisible, which defeats the primary purpose of this milestone: this app has **no staging environment** (production-only Firebase per CLAUDE.md), so the first few seconds after a deploy are exactly when Sentry's alerting value is highest.

**Interaction with the "Loading application..." bootstrap:** No interaction required, by design — `Sentry.init()` must be a strictly additive, side-effect-only addition to `<head>` that never blocks or alters the spinner-to-first-route sequence. Two concrete precautions:
- Wrap the `Sentry.init({...})` call in `try { } catch { }` (or rely on the SDK's own internal defensiveness) purely as a belt-and-suspenders measure — a classic `<script>` that throws does not halt parsing of subsequent script tags, but a throw would still abort attaching the SDK cleanly.
- **Guard against the CDN being blocked.** If the Sentry script tag itself fails to load (ad-blocker, corporate proxy, offline), `window.Sentry` is `undefined` and a bare inline `Sentry.init(...)` call in the following script tag would throw `ReferenceError: Sentry is not defined`. Wrap the init call: `if (window.Sentry) { window.Sentry.init({...}); }`. This is the first of several CDN-blocked degradation points (see the dedicated section below).

**Recommendation on which Sentry script to use:** Sentry offers two CDN delivery modes:
- **Loader Script** (`https://js.sentry-cdn.com/<public_key>.min.js`) — auto-updates, self-lazy-loads. Officially the "easiest" no-build option.
- **Pinned static bundle** (`https://browser.sentry-cdn.com/<version>/bundle.min.js`) — exact version, no silent updates.

This repo has an explicit, repeated convention of **pinning exact CDN versions** (`chart.js@4.4.7`, `frappe-gantt@1.2.2`, with inline comments like "pinned to v1.2.2") specifically because there is no staging environment to catch a surprise upstream break. Recommend the **pinned static bundle**, not the auto-updating Loader Script, for consistency with that convention and because an unannounced SDK version bump in a production-only app is exactly the kind of risk this codebase has already decided to avoid elsewhere.

**Self-hosting consideration:** `lib/signature_pad.umd.min.js` is already **self-hosted specifically to avoid CDN tracking-prevention warnings** (see `index.html:17` comment). Sentry — an error-telemetry vendor — is a materially more common ad-blocker/tracking-prevention target than a signature-pad library (uBlock Origin, Brave Shields, and several corporate proxies block `*.sentry-cdn.com`/`*.ingest.sentry.io` by hostname pattern). Given the repo's own precedent and rationale, **self-hosting the Sentry bundle file** (same treatment as `signature_pad.umd.min.js` — download once, commit it, no build step) while leaving only the **ingest endpoint** remote is worth strong consideration; it removes the single most common real-world trigger of the "CDN blocked" degradation path. The ingest endpoint cannot be self-hosted (it's Sentry's server), so `connect-src` CSP changes are unavoidable either way.

---

## Integration Point 2 — Identity binding lifecycle (`app/auth.js`)

**Verified structure of `app/auth.js`:** `initAuthObserver()` (`app/auth.js:195`) wraps a single `onAuthStateChanged` callback, which itself attaches a single `onSnapshot(doc(db,'users',user.uid), ...)` listener per session. That listener has two branches:
- `isFirstSnapshot` branch (`:232-311`) — runs once per login/session-restore. This is where `initPermissionsObserver()`, `window.initNotifications()`, and `initAssignedCodesListeners()` are already bootstrapped (existing precedent for "things that must be set up once identity resolves").
- Subsequent-snapshot branch (`:312-360`) — runs on every real-time update to the user doc (role changes, assignment changes, deactivation). It already diffs `previousRole !== userData.role` to decide whether to rebuild the permissions/assignment listeners (`:314-332`).
- Logout branch (`user` is `null`, `:402-429`) — this is the single choke point where `destroyPermissionsObserver()`, `window.destroyNotifications()`, and `destroyAssignedCodesListeners()` already run, and where `currentUser` is reset to `null`.

**Where to call `Sentry.setUser()`:** Inside the `isFirstSnapshot` branch, immediately after `currentUser = { uid: user.uid, ...userData };` is assigned (`:230`) and gated the same way the other first-snapshot bootstraps are (`userData.status === 'active'`). Because `currentUser` is reassigned on **every** snapshot (not just the first), the simplest and most robust rule is: **call the identity-sync helper unconditionally whenever `currentUser` changes** — i.e. once in the first-snapshot branch, and again in the subsequent-snapshot branch whenever `previousRole !== userData.role` (the same diff already computed at `:314`, reused rather than duplicated). `Sentry.setUser()` is a synchronous, in-memory SDK call (no network), so calling it defensively on every role-change diff is cheap and guarantees identity never drifts out of sync with `currentUser`, without needing a new dedicated diff.

**Where to clear it:** In the logout branch (`app/auth.js:402-429`), immediately alongside the existing `destroyPermissionsObserver()` / `destroyAssignedCodesListeners()` calls — call `Sentry.setUser(null)` there. The forced-signout paths (deactivated user at `:278-285` and `:350-359`, deleted-user at `:364-375`, listener-error force-logout at `:383-400`) all funnel through `signOut(auth)`, which re-fires `onAuthStateChanged(null)` and hits the same logout branch — so this is a **single choke point**, no duplication needed at each forced-signout site.

**Correctness across real-time role/permission changes:** Because the hook lives inside the *existing* `onSnapshot` callback (not a separate listener), it is inherently synchronized with every value `getCurrentUser()` can ever return — there is no separate subscription to keep in sync, no race with `initPermissionsObserver()`/`initAssignedCodesListeners()`, and no additional listener to add to the `listeners[]` cleanup array (Sentry's `setUser`/`setTags` calls are fire-and-forget, not subscriptions).

**Fields to send / withhold:**

| Field | Send? | Rationale |
|---|---|---|
| `uid` | Yes — as `Sentry.setUser({ id })` | Primary correlation key; already the Firestore doc ID, already sent to `client_errors` by `app/diagnostics.js`. |
| `email` | Yes — as `Sentry.setUser({ email })` | Already sent to the existing `client_errors` collection by `app/diagnostics.js` (`buildEvent()` reads `u?.email`); no new PII exposure relative to what this app already ships. |
| `full_name` | Optional, as `username` | Useful for support correlation ("whose error is this"); low sensitivity, already surfaced in the mobile nav footer (`#mobileNavUsername`). |
| `role` | Yes — as a **tag** (`Sentry.setTags({ role })`), not buried in the user-context blob | Tags are indexed/searchable in Sentry's issue search; arbitrary extra `setUser()` fields are not. This is what makes "show me every error thrown by `operations_user` role" a one-line Sentry search. |
| `department` | Yes — as a **tag**, derived from role (see mapping below) | Same searchability rationale; there is no `department` field stored on the user doc — it must be derived. |
| `assigned_project_codes` / `assigned_service_codes` / `personnel_user_ids` | **Withhold** | Business data with no debugging value proportional to the exposure; these arrays can be large and are irrelevant to "whose error is this." |
| Auth tokens, ID tokens | **Withhold** | Never send credentials to a third-party telemetry vendor. |
| IP address | Leave Sentry's default (server-inferred) as-is; do not add a client-supplied override | No product need identified; avoid widening PII surface for a placeholder benefit. |

**Department derivation** (no stored field — derive from `role`, mirroring the `PROJECT_SEE_ALL_ROLES`/`SERVICE_SEE_ALL_ROLES` split already defined in `app/utils.js:425-426`):

```
super_admin                          → 'platform' (both departments)
operations_admin, operations_user    → 'projects'
services_admin,  services_user       → 'services'
finance, procurement                 → 'cross-department'
```

---

## Integration Point 3 — The `reportError()` wrapper: **NEW `app/errors.js`**

### Where it lives, and why not `app/utils.js`

`app/utils.js` is imported by nearly every other module in the graph (`auth.js`, `router.js`, `components.js`, `notifications.js`, most view modules). Adding `reportError()` there would work for callers, but creates two problems:

1. **Import-graph pollution.** `utils.js` is deliberately the lowest-level shared module (imports only `firebase.js`). Bolting Sentry-specific concerns (severity tiers, correlation IDs, `window.Sentry` guards) onto it mixes "generic formatting/validation helpers" with "telemetry contract" — a maintainability smell, and it makes `utils.js` harder to reason about in isolation (its current 970 lines already cover formatting, RFP fee math, ID generation, personnel normalization, CSV export, and the Phase 113 assignment cache).
2. **Circular-import risk is actually *worse* inside `utils.js`.** If `reportError()` needs to read identity (`window.getCurrentUser?.()`, set by `auth.js`) and `utils.js` is a dependency of `auth.js`, embedding Sentry logic in `utils.js` doesn't change the identity-read pattern (still window-global, not a static import — see below) but it does mean every one of `utils.js`'s own internal catches (`generateSequentialId`, `_nextClmcCode`, `saveToStorage`, etc.) would need to call a sibling function in the same file rather than a clearly separate module — harder to test the error-reporting contract in isolation from 30+ unrelated utility functions.

**Decision: `app/errors.js`, new file.** It sits at the same graph depth as `app/permissions.js` and `app/notifications.js` — a small, single-purpose module that imports `utils.js` (one direction only) and nothing else statically.

### Circular-import analysis (verified against the real graph)

Confirmed import edges (from reading every file in `app/`):

```
firebase.js  ← (dynamic import only, at firebase.js's own bottom) auth.js
firebase.js  ← utils.js, permissions.js, auth.js, notifications.js   (static)
utils.js     ← auth.js, router.js, components.js, notifications.js   (static)
permissions.js ← auth.js                                              (static)
diagnostics.js ← (nothing statically imports it; it dynamic-imports firebase.js lazily, reads identity via window.getCurrentUser?.())
update-check.js ← (zero imports, fully self-contained)
```

`app/diagnostics.js` already solves the exact problem `errors.js` faces, and is the pattern to copy: it needs the current user for its event payload but **does not statically import `auth.js`** — it reads `window.getCurrentUser?.()` instead (`app/diagnostics.js:48`), and it defers its one unavoidable dependency (`firebase.js`, for the `client_errors` mirror write) behind a **dynamic** `import('./firebase.js')` inside `mirrorToFirestore()` rather than a static top-of-file import.

Applying the same two techniques to `app/errors.js`:

| `errors.js` needs | Static import? | Why / why not |
|---|---|---|
| `showToast`, `escapeHTML` from `utils.js` | **Yes, static** | `utils.js` does not import `errors.js` — one-directional edge, safe. Same pattern `notifications.js` and `components.js` already use. |
| Current user identity (uid/email/role) | **No — `window.getCurrentUser?.()`** | `auth.js` imports `utils.js` and (per Integration Point 2) will need to import `errors.js` to call `reportError()` from its own catch blocks (e.g. the `handleLogout()` catch at `app/auth.js:605-608`). If `errors.js` statically imported `auth.js` too, that's a hard cycle: `errors.js → auth.js → errors.js`. Reading identity off `window` (exactly as `diagnostics.js` already does) breaks this before it starts. |
| Correlation-ID generation | **Reuse `cryptoRandomUuid()` from `utils.js`** (static import, already covered above) | `utils.js` already exports this (`app/utils.js:963-969`, added Phase 87.1 specifically "so proposals.js, app/proposal-modal.js, and other modules can share one implementation without circular imports" — the exact concern this section is solving, already solved once in this codebase for a different pair of modules). No new UUID logic needed. |
| `window.Sentry` | Global, no import | CDN-loaded, always accessed via `window.Sentry?.method?.()` optional chaining for CDN-blocked degradation (see below). |

Resulting one-directional dependency chain: **`errors.js → utils.js → firebase.js`**, with `auth.js`, `router.js`, and view modules importing `errors.js` from *above* it. No cycle.

**Modules that sit at or below `errors.js` in the graph** (`utils.js`, `firebase.js`, `permissions.js`) and that want to report an error from their own catch blocks **must not** statically import `errors.js` (that would recreate the cycle `errors.js → utils.js → errors.js`). They have two safe options, both already precedented in this repo:
1. **`window.reportError?.(...)`** — `errors.js` attaches itself to `window.reportError` (mirroring the existing `window.logDiag`, `window.escapeHTML`, `window.getAssignedProjectCodes` pattern used throughout `utils.js`/`auth.js`/`diagnostics.js` for exactly this cross-module-without-static-import purpose).
2. **Dynamic `import('./errors.js').then(...)`** inside the specific catch block, for the rare case a return value or tight coupling is needed — mirroring `firebase.js`'s own existing dynamic `import('./auth.js')` at its bottom (`app/firebase.js:210-216`) and `diagnostics.js`'s dynamic `import('./firebase.js')` inside `mirrorToFirestore()`.

Recommendation: use `window.reportError?.(...)` for `utils.js`/`firebase.js`/`permissions.js`'s own (rare, mostly best-effort) catches; use the static `import { reportError, mapFirestoreError } from '../errors.js'` form everywhere else (view modules, `router.js`, `auth.js`) for better testability (static imports are easier to mock/verify in isolation than window-global lookups).

### Signature and responsibilities

```js
// app/errors.js
import { showToast, cryptoRandomUuid } from './utils.js';

export const SEVERITY = { ERROR: 'error', WARNING: 'warning', BREADCRUMB: 'breadcrumb', SILENT: 'silent' };

/**
 * @param {Error|unknown} err        - the caught error/rejection
 * @param {object} opts
 * @param {string} opts.context      - e.g. 'procurement.generatePR', 'project-plan.saveTask'
 * @param {string} [opts.severity]   - SEVERITY.* ; default derived via mapFirestoreError() when err.code is a Firestore code
 * @param {boolean} [opts.toast=true]- surface a user-facing toast
 * @param {object} [opts.extra]      - additional structured context (ids, payload shape — NOT secrets)
 * @returns {string} correlationId   - always generated, always returned, independent of Sentry availability
 */
export function reportError(err, opts = {}) { ... }

export function mapFirestoreError(err) { ... } // → { message: string, defaultSeverity: SEVERITY.* }
```

Responsibilities, in order:

1. **Correlation ID first, unconditionally.** Generate via the existing `cryptoRandomUuid()` (truncate to ~8 chars, uppercase, for verbal read-back — e.g. `AB12CD34`) *before* checking whether Sentry is available. This guarantees the toast and the console fallback always carry the same ID whether or not Sentry loaded — the ID is decoupled from Sentry's own internal event ID by design, so it works identically in both the happy path and the CDN-blocked path.
2. **Severity resolution.** If `opts.severity` is not given and `err.code` looks like a Firestore/Auth error code, call `mapFirestoreError(err)` for a default (see Integration Point 6 for the tier table — notably `permission-denied` defaults to `WARNING`, not `ERROR`).
3. **Sentry capture, tiered:**
   - `ERROR` → `window.Sentry?.captureException?.(err, { tags: { correlation_id }, extra, contexts: { app: { context } } })`
   - `WARNING` → `window.Sentry?.addBreadcrumb?.({ category: 'warning', message, level: 'warning', data: { correlation_id, ...extra } })` — **no `captureException`/`captureMessage`**, so it costs zero Sentry error-event quota while still leaving a trail attached to whatever *does* eventually get captured in that session.
   - `BREADCRUMB` → `window.Sentry?.addBreadcrumb?.(...)` only.
   - `SILENT` → no Sentry call at all (reserved for genuinely benign noise, e.g. an aborted fetch from mid-navigation cleanup).
4. **`showToast()` surfacing** (unless `opts.toast === false`): calls the *existing, unmodified* `showToast(message, type)` from `app/utils.js:186` with a message of the form `"${friendlyMessage} (Ref: ${correlationId})"` for `ERROR`/`WARNING` tiers. No change to `showToast()`'s signature is required.
5. **Console fallback when Sentry failed to load:** the `window.Sentry?.` optional-chaining guards mean a missing SDK simply no-ops the Sentry calls — but that would silently lose the error entirely if nothing else happens. `reportError()` must *always* also do `console.error('[ReportError]', correlationId, opts.context, err)` regardless of Sentry's availability, so DevTools always shows the same correlation ID a user could read back, whether or not Sentry received it. This is the graceful-degradation contract: **Sentry down ⇒ console + toast still work; only the dashboard visibility is lost.**

### Testability

Because `errors.js` has exactly one external dependency (`utils.js`, for two pure-ish functions) and reads `window.Sentry`/`window.getCurrentUser` defensively via optional chaining, it can be exercised directly from a browser console (`window.reportError(new Error('test'), { context: 'manual-test' })`) without needing auth state, Firestore, or a running view — useful both for the "verify Sentry receives a test event" build-order step and for any future automated check.

---

## Integration Point 4 — Global handlers: `window.onerror` / `unhandledrejection` vs. Sentry's own

**Current state (verified):** zero global handlers exist anywhere in the codebase today — confirmed absent in `index.html`, `app/router.js`, `app/auth.js`, and every other file read. This matches the milestone's stated baseline ("0 global handlers, 0 error sink").

**What Sentry's SDK does by default:** `Sentry.init()` enables a `GlobalHandlers` integration by default, which installs its own capture for uncaught exceptions and unhandled promise rejections. (MEDIUM confidence on the exact mechanism: recent Sentry JS SDK versions instrument this by wrapping/chaining `window.onerror` and `window.onunhandledrejection` rather than using `addEventListener` — verify against the exact pinned SDK version's source at implementation time, since this detail changes the ordering risk below.)

**The concrete risk — never assign, always `addEventListener`:** Because the browser's `window.onerror`/`window.onunhandledrejection` are **single-value IDL properties** (assigning a new function *replaces* whatever was there — there is no "last writer wins but both still run" unless the new writer explicitly chains to the old one), the app must never do:

```js
window.onerror = function (...) { ... };            // ❌ NEVER — risks clobbering Sentry's hook
window.onunhandledrejection = function (...) { ... }; // ❌ NEVER — same risk
```

If this assignment happens **after** `Sentry.init()` (which, per Integration Point 1, always runs first), it silently replaces Sentry's installed handler with the app's, and Sentry stops receiving uncaught errors entirely — with no error of its own to indicate the regression.

Instead, any app-level supplementary handling must use:

```js
window.addEventListener('error', (event) => { ... });
window.addEventListener('unhandledrejection', (event) => { ... });
```

`addEventListener`-registered listeners live in a separate internal list from the `onerror`/`onunhandledrejection` IDL-attribute slot; both fire for the same event without clobbering each other, regardless of registration order. This is the safe, non-conflicting coexistence mechanism.

**What the app should own vs. delegate to the SDK:**

| Concern | Owner | Why |
|---|---|---|
| Actually reporting the uncaught exception/rejection to Sentry | **SDK** (its default `GlobalHandlers` integration) | This is precisely what it's designed for; do not disable it, do not duplicate it. |
| Feeding the existing `app/diagnostics.js` local ring buffer (`window.logDiag`) for the overnight-auth-issue forensic workflow that already exists | **App**, via a supplementary `addEventListener('error'/'unhandledrejection', ...)` that calls `window.logDiag?.('uncaught_error', {...})` | `diagnostics.js` predates this milestone and serves a narrower purpose (auth/permission transient-failure forensics); wiring it to also see truly uncaught errors is a small, additive win with a precedented sink already in place. |
| A generic "Something went wrong" user-facing toast for errors that reached the browser's default uncaught-error path (i.e. genuinely escaped every `catch`) | **App**, same supplementary listener, calling `showToast()` directly (not `reportError()` — see below) | Sentry's SDK does not touch the UI at all; without this, a truly uncaught error is still silent to the *user*, even once it's visible on the Sentry dashboard. |
| Calling `Sentry.captureException()` a second time from the app's own `addEventListener` handler | **Nobody — this is the double-report trap** | If the app's supplementary listener *also* calls `Sentry.captureException(event.error)`, the same error is now reported twice: once via Sentry's own `GlobalHandlers` integration, once via the app's explicit call. The app's global-handler listeners must only do non-Sentry work (diagnostics ring buffer, toast) — never call into Sentry themselves. |

**Why the global handlers do *not* protect against Phase 113's actual root cause.** This is the single most important nuance for the retrofit strategy (Integration Point 7): a fire-and-forget `.catch()` — even one whose body does nothing but `console.error(...)` — means the promise **was** handled from the JS engine's perspective. It will never reach `unhandledrejection`, because a rejection handler was attached, however useless. The exact bug class named as this milestone's motivating incident (`app/… a cross-department updateDoc swallowed by .catch()`, per `firestore.rules:151` and `PROJECT.md`) is **structurally invisible** to global handlers, no matter how well they're wired. Global handlers give free coverage for *genuinely* uncaught errors (bugs no one anticipated); they give **zero** coverage for the swallowed-`.catch()` class, which is the one this milestone was created to fix. Only converting those specific call sites to route through `reportError()` closes that gap — see Integration Point 7.

---

## Integration Point 5 — Router / breadcrumb integration (`app/router.js`)

**Where navigation is decided:** `navigate(path, tab, param)` (`app/router.js:241`) is the single funnel for every route change — both user-initiated (`hashchange` → `handleHashChange()` → `navigate()`) and programmatic (`window.navigateTo`, `window.navigateToTab`). It already contains exactly one `try { ... } catch (error) { ... } finally { showLoading(false); }` block (`:312-391`) wrapping the view-load-and-render sequence.

**Do not rely on Sentry's default history-based breadcrumb capture.** Sentry's default breadcrumb integrations are built around the `history.pushState`/`replaceState` API and `popstate` events — the conventional pattern for client-side routers. This app does **not** use the History API at all; navigation is `window.location.hash = '#/...'` (see `router.js:247, 261, 268, 276, 283, 484` and the inline `onclick="location.hash='#/'"` handlers). Setting `location.hash` fires a `hashchange` event, not `popstate`, and involves no `pushState`/`replaceState` call — so Sentry's default instrumentation should not be assumed to pick this app's navigation up automatically. (MEDIUM confidence on Sentry's exact hashchange handling in its default integration set — but the recommendation below is correct regardless of what the default integration does or doesn't catch, since an explicit breadcrumb is strictly additive.)

**Recommended hook point:** inside `navigate()`, right after `updateNavigation(path)` succeeds (`app/router.js:355`, just before the "Scroll to top" line) — i.e. only on a *confirmed successful* render, not on every hash-change attempt (auth/permission redirects earlier in the function already bail out before reaching this point, so a breadcrumb here means "the app actually rendered this route," which is what matters for reconstructing "what was the user doing" in a Sentry issue).

```js
window.Sentry?.addBreadcrumb?.({
    category: 'navigation',
    message: buildRouteString(path, tab, param),
    level: 'info',
    data: { path, tab, param }
});
```

**Capturing lazy-`import()` failures (the stale-module / failed-chunk case CLAUDE.md documents):** `route.load()` (e.g. `() => import('./views/procurement.js')`) is awaited at `router.js:332` **inside the existing try block** — a failed or stale dynamic import (404, network error, or the exact "does not provide an export named 'Y'" link error CLAUDE.md warns about) already rejects into the existing `catch (error)` at `:366`. **No new try/catch is needed to catch this failure mode — it is already caught.** What's missing is that the catch block currently only does `console.error('Error navigating to route:', error);` (`:367`) and renders a generic "Error Loading Page" card with no correlation ID and no Sentry visibility.

This makes the `navigate()` catch block the **single highest-leverage conversion in the entire retrofit** (see Integration Point 7's build order): one change here gives Sentry-backed, correlation-ID-bearing visibility into every lazy-view-load failure across all ~30 view modules, in one place, with zero per-view-module changes required.

```js
} catch (error) {
    const correlationId = reportError(error, { context: `router.navigate(${path})`, severity: SEVERITY.ERROR });
    // existing fallback UI, plus the correlation ID so a user can read it back to support
    appContainer.innerHTML = `... <p>Reference: ${correlationId}</p> ...`;
}
```

---

## Integration Point 6 — Firestore error normalization (`mapFirestoreError()`, lives in `app/errors.js`)

**Existing pattern, already repeated ~20+ times inline.** `app/views/project-plan.js` and `app/views/service-plan.js` (near-duplicate files) already contain the exact shape of mapper this milestone needs, inlined at every call site:

```js
showToast(err?.code === 'permission-denied'
    ? `You don't have permission to edit tasks on this project.`
    : 'Could not save task. Please try again.', 'error');
```

This pattern appears at ~14 sites in `project-plan.js` and ~14 in `service-plan.js` alone (grep-verified), plus isolated instances in `app/views/project-detail.js:4227`, `app/views/service-detail.js:271,3875`, and `app/permissions.js:118`. It should be **extracted, not duplicated further** — every new call site should call the shared `mapFirestoreError(err)` rather than writing a new inline ternary, and existing call sites are natural first-touch conversion targets (Integration Point 7).

**Where it lives:** `app/errors.js`, alongside `reportError()` — it's error-domain logic, not a generic formatting utility, and `reportError()` is its primary (though not only) caller.

**Responsibilities:** map a raw Firestore/Auth error's `.code` to `{ message: <user-facing string>, defaultSeverity: SEVERITY.* }`, covering at minimum: `permission-denied`, `unavailable`, `deadline-exceeded`, `resource-exhausted`, `not-found`, `already-exists`, `failed-precondition`, `cancelled`, `unauthenticated`, plus a generic fallback for unrecognized codes.

**The Phase 113 interaction — this is the load-bearing detail.** `firestore.rules` was just tightened (Phase 113, plan 113-11 pending deploy) specifically to enforce department-scoped assignment boundaries more strictly. `permission-denied` will now fire **more often, and correctly** — a scoped `operations_user` hitting a cross-department read/write is the rules working as designed, not a bug. If `reportError()`'s default severity table treats every `permission-denied` as `SEVERITY.ERROR` (full `Sentry.captureException`), the dashboard will fill with expected, by-design access-control rejections, exhausting the free-tier quota the milestone explicitly flags as a risk ("naively piping 422 error sites into Sentry would exhaust a free-tier quota").

**Resolution:** `mapFirestoreError()` defaults `permission-denied` to **`SEVERITY.WARNING`**, not `ERROR`. Per the tier table in Integration Point 3, `WARNING` still shows the user a toast (with correlation ID) and still adds a Sentry **breadcrumb** (free, no quota cost, still gives cross-reference value if that session later produces a genuine `ERROR`), but does **not** call `captureException`/`captureMessage` — so it costs zero dashboard events. Individual call sites that *do* have reason to believe a given `permission-denied` indicates a genuine bug (e.g. a security-rules/UI-gate mismatch rather than an expected boundary) can override with an explicit `{ severity: SEVERITY.ERROR }` — but the default must stay quota-safe given how much more frequently this code will now legitimately fire.

---

## Integration Point 7 — Retrofit strategy: making 504 catches + 57 `.catch()` tails tractable

**Do not convert every catch block.** With 504 `catch` blocks and 57 fire-and-forget `.catch()` tails across 41 files in a production-only app with no staging environment, a blanket "convert everything" pass is both an enormous single-PR risk and mostly wasted effort — most of those 504 already do something reasonable (many already call `showToast()` with a friendly, sometimes `permission-denied`-aware message, per Integration Point 6's survey). The retrofit needs a **heuristic that separates "must convert now" from "convert opportunistically later."**

### Prioritization heuristic

**1. Global handlers + `reportError()` wrapper give free, zero-per-site baseline coverage first** (Integration Points 3 & 4) — this covers every *genuinely* uncaught error (the unknown-unknowns) without touching any of the 504 existing catch sites at all.

**2. The swallowed-`.catch()` bug class is invisible to global handlers (Integration Point 4's key finding) — so it is the only class that structurally *requires* per-site conversion, and gets first priority.** Within the 57 fire-and-forget `.catch()` tails, further prioritize by:

   - **Write-path over read-path.** A failed Firestore *write* (`addDoc`/`updateDoc`/`setDoc`/`deleteDoc`/`writeBatch`/`runTransaction`) swallowed by a no-op `.catch()` produces a **false-success UI** — the exact Phase 113 root cause (a cross-department `updateDoc` failed with `PERMISSION_DENIED`, the `.catch()` swallowed it, and the UI reported success while the write silently never happened). A failed Firestore *read* (`getDocs`/`onSnapshot` for display) degrades to a stale or empty list — bad UX, but self-evident to the user (an empty table gets noticed and reported), and not a silent data-integrity risk. **Grep worklist:** `.catch(` tails whose preceding statement contains `updateDoc\|setDoc\|addDoc\|deleteDoc\|writeBatch\|runTransaction` should be triaged first.
   - **Catch blocks whose entire body is a bare `console.error(...)` with no `showToast`, no re-render, and no re-throw** are the second-priority audit target — these are "silent" in the product sense even though they're not the `.catch()`-tail shape; same write-path-first filter applies.
   - Catch blocks that already call `showToast()` with a specific, correct message (the bulk of the 504) are **lower priority** — they are not silent, they just don't yet emit a Sentry breadcrumb/correlation-ID. Convert these **opportunistically**, file-by-file, as those files are touched for unrelated work — not as a dedicated blanket phase.

**3. High-leverage single-choke-point conversions before high-volume per-file sweeps.** `app/router.js`'s one `navigate()` catch (Integration Point 5) covers all lazy-view-load and stale-module failures app-wide in a single change — convert it early, before starting the 41-file sweep, because it delivers coverage disproportionate to its size.

**4. `alert()` → `showToast()` replacement threads through naturally, not as a separate initiative.** The 19 bare `alert()` calls (grep-verified, confined to exactly **6 files**: `app/auth.js` (2: deactivation notice `:355`, logout-error `:607`), `app/views/procurement.js`, `app/views/mrf-form.js`, `app/views/finance.js`, `app/views/mrf-records.js`, `app/views/pending.js`) are naturally subsumed wherever `reportError()`'s toast surfacing replaces an `alert()` inside a converted catch block — do not schedule this as an independent sweep separate from the catch-block retrofit; convert `alert()` sites as part of whichever phase touches that file for the write-path/silent-swallow audit above.

**5. `project-plan.js` / `service-plan.js` are a matched pair.** These two files alone account for ~28 of the ~40+ inline `permission-denied` ternaries this survey found (Integration Point 6). Because they're structurally near-identical (documented in `PROJECT.md`'s Phase 26 decision: "Services mirrors Projects... copy then adapt"), converting them to call the shared `mapFirestoreError()` should be done as **one paired phase**, not two independent ones — the same diff pattern applies to both files nearly verbatim, and reviewing them together catches drift between the two.

### What NOT to convert

Some catches are correctly console-only by explicit design comment and should stay that way — e.g. `app/firebase.js`'s `purgeStoragePrefix()` (`:104-114`), whose own comment states "Never throws — a Storage failure must not block the Firestore delete." Auditing for "silent swallow" must distinguish *deliberate, documented* best-effort failure handling from *accidental* silent loss — the write-path heuristic above is a starting filter, not a mechanical rule; each hit still needs a one-line judgment call.

---

## New vs. Modified Files

### NEW

| File | Purpose |
|---|---|
| `app/errors.js` | `reportError()` wrapper, `mapFirestoreError()` mapper, `SEVERITY` tiers, correlation-ID generation (reuses `cryptoRandomUuid` from `utils.js`), `showToast()` surfacing, console fallback, `window.Sentry?.` guarded CDN-blocked degradation. Exports `reportError`/`mapFirestoreError`/`SEVERITY` for static ESM import by modules above it in the graph, and attaches `window.reportError` for modules below/beside it (`utils.js`, `firebase.js`, `permissions.js`) that would otherwise create a cycle. |
| `lib/sentry.bundle.min.js` (or similar) | *(Recommended, not required)* Self-hosted, version-pinned Sentry browser SDK bundle, mirroring the existing `lib/signature_pad.umd.min.js` precedent — mitigates the ad-blocker/tracking-prevention CDN-blocked case, which is the single most likely real-world trigger of the graceful-degradation path. If this route is taken, `index.html` references `lib/sentry.bundle.min.js` instead of a `sentry-cdn.com` URL, and only the CSP `connect-src` (ingest endpoint) needs widening — `script-src` does not need a new external host. |

### MODIFIED

| File | Change |
|---|---|
| `index.html` | Add Sentry script tag(s) in `<head>`, before the three existing CDN `<script>` tags. Add the guarded `if (window.Sentry) { window.Sentry.init({...}); }` inline script immediately after. No changes required to the bottom bootstrap `<script type="module">` block — `errors.js` loads transitively once `auth.js` statically imports it (Integration Point 3); an explicit `import './app/errors.js';` alongside `import './app/utils.js';` is optional, for parity/clarity only. |
| `netlify.toml` | **Two** `[[headers]]` blocks (`for = "/*"` and `for = "/*.html"`) each carry a full, independently-duplicated `Content-Security-Policy` string — **both** must add the Sentry `script-src` host(s) (if not self-hosting) and the `connect-src` ingest host(s). Missing either block silently blocks Sentry on some file types but not others. |
| `_headers` | Same duplication problem, mirrored: the `/*` block and the `/*.html` block each carry their own copy of the CSP string. **Four total CSP string occurrences across these two files** (`netlify.toml` ×2, `_headers` ×2) must all be updated in the same change — this is precisely the risk the milestone brief calls out ("miss either and every error report is silently blocked by the browser"), and it's actually two files × two blocks each, not just two files. |
| `app/auth.js` | Add `Sentry.setUser()`/`Sentry.setTags({role, department})` calls in the `isFirstSnapshot` branch (`:232-311`) and in the role-change branch (`:314-332`, reusing the existing `previousRole !== userData.role` diff). Add `Sentry.setUser(null)` in the logout branch (`:402-429`). Add a static `import { reportError } from './errors.js';` and convert the `handleLogout()` catch (`:605-608`) and the user-doc-listener error callback (`:383-400`, which already calls `window.logDiag?.()`) to also call `reportError()`. |
| `app/router.js` | Add `window.Sentry?.addBreadcrumb?.(...)` after successful navigation (`:355`, before "Scroll to top"). Convert the existing `navigate()` catch block (`:366-388`) to call `reportError()` with `SEVERITY.ERROR` and surface the returned correlation ID in the fallback "Error Loading Page" UI. |
| `app/views/project-plan.js`, `app/views/service-plan.js` | Paired conversion (see retrofit heuristic #5): replace the ~14+14 inline `err?.code === 'permission-denied' ? ... : ...` ternaries with calls to the shared `mapFirestoreError()` + `reportError()`. |
| `app/views/project-detail.js`, `app/views/service-detail.js` | Isolated existing `permission-denied` checks (`project-detail.js:4227`, `service-detail.js:271,3875`) — convert to shared mapper as these files are touched. |
| `app/permissions.js` | Existing `permission-denied` handling in the role-template listener error callback (`:111-120`, already calls `window.logDiag?.()`) — add `window.reportError?.()` alongside it (window-global form, per the circular-import analysis, since `permissions.js` sits below `errors.js` and is itself a dependency of `auth.js`). |
| `app/views/procurement.js`, `app/views/mrf-form.js`, `app/views/finance.js`, `app/views/mrf-records.js`, `app/views/pending.js` | `alert()` → `showToast()`/`reportError()` conversions, threaded through the write-path-first catch-block audit (retrofit heuristic #1 and #4) rather than scheduled as an independent sweep. |
| `CLAUDE.md` | Add the convention guardrail section last (after the pattern has stabilized across a few real conversions): documents `reportError()` usage, the "never assign `window.onerror`/`window.onunhandledrejection`, always `addEventListener`" rule, and the write-path-first retrofit priority — so new code cannot reintroduce silent swallows. |

**Explicitly NOT modified:** `firestore.rules` (Sentry reports go to Sentry's own ingest API, not Firestore — no new collection, no new rules), `app/diagnostics.js` (remains as-is; it's a narrower, pre-existing forensic mechanism for transient auth/permission failures with its own `client_errors` Firestore sink — genuinely orthogonal to Sentry, not a duplicate to be merged in this milestone, though a future nice-to-have could have `logDiag()` also emit a Sentry breadcrumb via `reportError()`'s `BREADCRUMB` tier for richer cross-referencing).

---

## Dependency-Aware Build Order (Phases 114+)

Each phase is buildable and independently verifiable before the next depends on it — matching the quality gate's required order (init → identity → wrapper → global handlers → retrofit) with two additions (router breadcrumbs slot in after global handlers since it depends on `reportError()` existing; retrofit is explicitly split into "one high-leverage choke point" then "prioritized sweeps," not one big phase):

1. **Phase 114 — Sentry wiring, no app-code call sites.** `index.html` head script + guarded init, `netlify.toml` + `_headers` CSP widening (all four block occurrences), verify a manually-triggered test event reaches the Sentry project, verify the CDN-blocked path degrades cleanly (test with an ad-blocker or by blocking the domain in DevTools). Zero dependency on any other phase — this is the foundation everything else needs `window.Sentry` to exist for.
2. **Phase 115 — Identity binding.** `app/auth.js` `Sentry.setUser()`/`setTags()`/`setUser(null)` wiring into the existing `onAuthStateChanged`/`onSnapshot` lifecycle. Depends on Phase 114 (needs `window.Sentry` present); touches zero other files. Verify via login/logout/role-change that the Sentry dashboard shows correct identity on subsequently-captured events.
3. **Phase 116 — `app/errors.js`: the `reportError()` wrapper + `mapFirestoreError()`.** New file, no retrofit yet. Depends on Phase 114 (for `window.Sentry`) and reuses `cryptoRandomUuid`/`showToast` from `utils.js` (no changes to `utils.js` needed). Verifiable in isolation from a browser console before anything calls it in production code paths.
4. **Phase 117 — Global handlers.** Confirm Sentry's default `GlobalHandlers` integration is active (verify it isn't accidentally disabled by an `integrations` override in the Phase 114 init config). Add the app's supplementary `addEventListener('error'/'unhandledrejection', ...)` hooks (never assign the `onerror`/`onunhandledrejection` properties) that feed `window.logDiag?.()` and a generic fallback toast — NOT calling Sentry directly, per Integration Point 4's double-report analysis. Depends on Phase 114 (ordering: Sentry's own handlers must already be installed) and benefits from Phase 116 existing (for the correlation-ID-bearing toast format) though it does not strictly require it.
5. **Phase 118 — Router integration.** `app/router.js` breadcrumbs + the single `navigate()` catch conversion. Depends on Phase 116 (`reportError()` must exist). This is deliberately its own phase, separate from the general retrofit sweep, because it is the single highest-leverage conversion (Integration Point 5) and should ship before the wider retrofit so early production signal starts flowing from the most failure-prone surface (lazy view loads / stale modules) first.
6. **Phase 119+ — Prioritized retrofit passes**, each independently scoped and shippable:
   - **Pass A:** the 57 fire-and-forget `.catch()` tails, filtered write-path-first (grep worklist from Integration Point 7 heuristic #2).
   - **Pass B:** catch blocks whose body is `console.error`-only (silent-swallow audit), same write-path-first filter.
   - **Pass C:** the `project-plan.js`/`service-plan.js` paired `mapFirestoreError()` conversion (Integration Point 7 heuristic #5).
   - **Pass D:** the six `alert()`-containing files, threaded through whichever of Pass A/B/C already touches them.
   - Remaining "already shows a toast, just not Sentry-wired" catches: **opportunistic, boy-scout-rule conversion** as those files are touched for unrelated work — explicitly not a dedicated phase, to avoid an open-ended 41-file mega-phase in a production-only, no-staging codebase.
7. **Final phase — Convention guardrail.** `CLAUDE.md` documentation of the `reportError()` contract and the `window.onerror` anti-pattern, written *after* Pass A/B/C have produced real converted examples to document accurately, per this repo's own stated practice of writing conventions from what was actually built rather than aspirationally.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Assigning `window.onerror` / `window.onunhandledrejection` directly
**What people do:** `window.onerror = function(...) { ... }` for "simplicity."
**Why it's wrong:** Silently overwrites Sentry's own installed handler (a single-value IDL property, not a list) — Sentry stops receiving uncaught errors, with no error of its own to flag the regression. See Integration Point 4.
**Instead:** Always `window.addEventListener('error'/'unhandledrejection', handler)`, registered after `Sentry.init()`, and never call `Sentry.captureException()` from inside that handler (Sentry's own `GlobalHandlers` integration already does — calling it again double-reports).

### Anti-Pattern 2: Treating every `permission-denied` as an `ERROR`-tier Sentry event
**What people do:** Route all Firestore errors through `Sentry.captureException()` uniformly.
**Why it's wrong:** Phase 113 just made `firestore.rules` stricter; `permission-denied` will now fire *more* often as correct, by-design access-control behavior — not a bug. Uniform `ERROR`-tier reporting exhausts the free-tier quota on expected traffic and drowns genuine bugs in noise.
**Instead:** `mapFirestoreError()` defaults `permission-denied` to `WARNING` (breadcrumb + toast, no `captureException`); call sites override to `ERROR` only when there's a specific reason to believe that particular denial indicates a rules/UI mismatch rather than expected policy.

### Anti-Pattern 3: A single mega-phase converting all 504 catch blocks
**What people do:** "Convert everything to `reportError()`" as one sweeping phase for completeness.
**Why it's wrong:** Most of the 504 already surface a reasonable `showToast()` message — they're not silent. A blanket sweep touches 41 files in a production-only app with no staging environment and no automated test coverage beyond Firestore rules, for a return that's mostly cosmetic (adding Sentry visibility to failures users can already see and report). It also obscures the *actually dangerous* subset (write-path silent swallows) inside a huge diff.
**Instead:** The write-path-first, swallow-first heuristic in Integration Point 7 — a handful of targeted passes, plus opportunistic boy-scout-rule conversion for the rest.

### Anti-Pattern 4: Initializing Sentry from inside an ESM module instead of a blocking head script
**What people do:** `import { initSentry } from './app/errors.js'; initSentry();` as the first line of the bootstrap module, assuming import order guarantees early execution.
**Why it's wrong:** ES module evaluation is dependency-graph-driven, not textual-order-driven once any imported module has its own sub-dependencies; and even best-case, module evaluation happens after the whole module graph is fetched and linked — strictly later than a classic `<head>` script that already ran during HTML parsing. This is precisely the timing gap that would let the "stale ES module" failure CLAUDE.md documents (and any `firebase.js` top-level init failure) escape Sentry entirely. See Integration Point 1.
**Instead:** Classic, blocking `<script>` in `<head>`, before the module bootstrap block.

### Anti-Pattern 5: Updating only one of the four CSP block occurrences
**What people do:** Update `_headers`' `/*` block and consider CSP "done."
**Why it's wrong:** `netlify.toml` and `_headers` each independently duplicate their CSP string across a `/*` block and a `/*.html` block — four total occurrences, verified by reading both files. Netlify may honor one file over the other depending on deploy configuration, and within a file, missing the `/*.html` block means the CSP served with the actual HTML document (which is what governs inline `<script>` execution) can differ from the CSP served for other asset types.
**Instead:** Grep for the CSP string in both files before considering the change complete; update all four occurrences atomically in one commit.

---

## Graceful Degradation: Sentry CDN Blocked

Every layer above is designed so a blocked/failed Sentry CDN load degrades cleanly rather than breaking the app:

1. **Load failure:** the `<script src="...">` tag's own `error` event fires (not a JS exception, not window.onerror) — `window.Sentry` remains `undefined`. No cascading failure.
2. **Init call:** guarded with `if (window.Sentry) { window.Sentry.init({...}); }` — never throws.
3. **Every `reportError()` internal call:** `window.Sentry?.captureException?.(...)`, `window.Sentry?.addBreadcrumb?.(...)`, `window.Sentry?.setUser?.(...)`, `window.Sentry?.setTags?.(...)` — all optional-chained, all silently no-op if `window.Sentry` is absent.
4. **Correlation ID:** generated by `reportError()` via `cryptoRandomUuid()` *before* any Sentry check — identical whether or not Sentry loaded, so the "read this ID back to support" UX (toast + console) is unaffected.
5. **Console fallback:** `reportError()` always calls `console.error(...)` with the same correlation ID, regardless of Sentry's availability — DevTools remains a complete (if manual) record even with Sentry fully blocked.
6. **Net effect of a blocked CDN:** the app behaves exactly as it does today (errors visible in console, toasts shown, correlation IDs readable) *minus* the dashboard/alerting layer — never a broken or degraded user-facing experience.

Self-hosting the Sentry bundle (per Integration Point 1's recommendation, mirroring the existing `lib/signature_pad.umd.min.js` precedent) removes the single most common trigger of this path (hostname-pattern ad-blocking) while the `connect-src` ingest widening remains unavoidable either way — but the degradation path above must still be built regardless, since the ingest endpoint itself can still be blocked or unreachable (offline, corporate proxy) even with a self-hosted SDK file.

## Sources

- Direct reads: `index.html`, `app/router.js`, `app/auth.js`, `app/utils.js`, `app/firebase.js`, `app/permissions.js`, `app/diagnostics.js`, `app/update-check.js`, `netlify.toml`, `_headers`, `firestore.rules` (excerpt), `app/views/project-plan.js` (excerpt), `app/notifications.js` (excerpt), `.planning/PROJECT.md`, `CLAUDE.md` — all HIGH confidence, verified against actual repository state as of 2026-08-11.
- Sentry CSP/CDN requirements: [docs.sentry.io — JavaScript Loader](https://docs.sentry.io/platforms/javascript/loader/), [Sentry Forum — Required Content Security Policy](https://forum.sentry.io/t/required-content-security-policy/4484/2) — MEDIUM-HIGH confidence (community/forum-sourced CSP guidance corroborating official loader docs; exact ingest host varies by Sentry account region/org, so the recommended `connect-src` value should be narrowed to the project's actual DSN host once known).
- Sentry SDK internal `GlobalHandlers` chaining mechanism — MEDIUM confidence, flagged inline; verify against the exact pinned SDK version at implementation time rather than relying on this document alone.

---
*Architecture research for: Sentry error-tracking retrofit into existing zero-build ESM SPA (v4.3 Observability & Error Handling)*
*Researched: 2026-08-11*
