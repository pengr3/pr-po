---
status: instrumented
slug: overnight-access-denied
trigger: "Multiple users reported 'access denied' while using the app late at night (~12am–6am). It clears as soon as they refresh the page. No screenshots / console logs were captured. Diagnose and capture evidence."
created: 2026-07-02
updated: 2026-07-02
goal: capture_proof_then_fix
---

# Debug Session: overnight-access-denied

## Symptoms

- **Expected:** A logged-in user keeps working through the night without being denied access.
- **Actual:** During ~12am–6am, users hit an "access denied" state. A full page **refresh fixes it every time** and it continues working.
- **No proof:** No screenshots, no console logs. Cannot reproduce on demand (needs a real multi-hour session).
- **Distinct from the stale-cache bug** (`stale-cache-mrf-scoreboard.md`): that needed a *hard* refresh (Ctrl-Shift-R) and showed an old UI *format*; this is a *soft* refresh fixing an *access* error. Different failure.

## Environment / Constraints

- Static SPA, Firebase Auth + Firestore (prod `clmc-procurement`). Auth persistence = `browserLocalPersistence` (never expires; the "1-day session" comment in `firebase.js:88` is factually wrong).
- Firestore uses `persistentLocalCache` (`persistentSingleTabManager` in prod).
- No Cloud Functions / no scheduler (`firestore.rules:973`; `scripts/` are all manual). **Nothing server-side flips access at 3am — ruled out.**
- Zero-build, no UI test harness. Firebase CDN not reachable from the dev sandbox (can't run the real page here).

## Key findings (code evidence)

1. **No time-of-day gating anywhere.** All `setHours/getHours` hits are Gantt/date math, not access control. The 12am–6am window is a *usage* pattern (idle overnight sessions, sleeping laptops, flaky home networks), not a rule.
2. **Every rules read needs a live token.** `role_templates` + all data reads route through `getUserData()`/`isActiveUser()`, gated on `request.auth` (`firestore.rules:46–63`). A **stale/expired ID token on reconnect ⇒ `permission-denied`**.
3. **Reload is the ONLY thing that force-refreshes the token.** `auth.js:207` does `await user.getIdToken(true)` before attaching listeners — but only at bootstrap. There is **no** `onIdTokenChanged` / `online` / `visibilitychange` re-auth to refresh mid-session on reconnect. (`update-check.js` has the only `visibilitychange`, unrelated.)
4. **Failure state is sticky until reload.** The router evaluates access only on initial load + `hashchange`; `permissionsChanged` only re-renders nav (`auth.js:27–32`), never re-runs `navigate()`. So a transient denial/error can't self-heal in place → matches "refresh fixes it".
5. **Two paths turn a transient blip into a visible 'denied':**
   - `auth.js:349–363` — the user-doc listener error callback **force-logs-out on ANY listener error** (its own comment blames token expiry / "network failure during a long session"). Aggressive.
   - `permissions.js:111–121` — the role-template listener error sets `currentPermissions = null` and **never retries / re-attaches**.
6. **Corroboration:** `notifications.js:269` already warns listeners must start *after* `getIdToken(true)` — this codebase has hit token-propagation races before.

## Hypotheses (ranked; not yet proven by logs)

- **H1 (lead): reconnect-after-idle token race.** Overnight the machine sleeps / network drops for hours; on wake, Firestore listeners re-fire with a stale token before the silent refresh completes → `permission-denied` reads → either forced logout (`auth.js:349`) or dead/denied views. Reload re-runs `getIdToken(true)` + re-attaches everything → works.
- **H2: stale cached `role_templates`.** The 260627-kg0 cross-dept work ran `role_templates` patch scripts in prod. A browser holding an older cached role doc could momentarily gate on stale permissions after a cold/reconnect load until the cache resyncs. Reload resyncs.
- **H3: cold-load ordering.** Perms load *after* the first `navigate()`, so the initial gate defers (`undefined`→allow); less likely to produce the *page*, more likely permission-denied errors inside views.

## Fix applied THIS session: evidence capture (no behavior change)

Added passive instrumentation — captures only, changes no auth/permission logic.

- **New:** `app/diagnostics.js` — `window.logDiag(type, detail)`:
  - localStorage ring buffer `clmc_diag_log` (cap 50) — survives the user's reload.
  - `console.error('[CLMC-DIAG] …')` — visible if DevTools is open.
  - best-effort mirror to Firestore `client_errors` (fire-and-forget; retried via `flushPending()` on next load if the write itself was blocked by the blip).
  - passive context: `visibilitychange` / `online` / `offline` → records **`last_hidden_ms`** (how long the tab was backgrounded before the error — the smoking gun for sleep→reconnect), `session_age_ms`, `online`, `hour_local`, `tz_offset_min`, Firestore error `code`, `route`, `uid/role/status`.
  - `window.clmcDumpDiag()` — dump + copy the local log (for support).
- **Capture points wired (one additive line each, beside existing handlers):**
  - `auth.js:207` token-refresh catch → `token_refresh_failed`
  - `auth.js:349` user-doc listener error (before forced logout) → `auth_listener_error`
  - `permissions.js:111` role-template listener error → `perms_listener_error`
  - `router.js:288` Access Denied gate → `access_denied` (records whether perms were loaded)
- **Rules:** `client_errors` collection — `create` if signed-in and `uid == request.auth.uid`; `read/list/delete` super_admin; no update. (`firestore.rules`, +18 lines, braces 81/81.)
- **Boot:** `index.html` imports `diagnostics.js` (before auth/router) and calls `initDiagnostics()`.

Verification: `node --check` PASS on all 4 JS files; 20/20 runtime assertions against the real module (event shape, code extraction, message truncation, ring-buffer cap, graceful mirror-failure, corrupt-buffer resilience).

## How to read the captured evidence (next occurrence)

Query `client_errors` (super_admin, Firebase console) or run `clmcDumpDiag()` in an affected browser. Look for:

- **H1 confirmed** if events show `code: 'permission-denied'|'unauthenticated'|'unavailable'` with a **large `last_hidden_ms`** and/or large `session_age_ms`, `hour_local` in 0–6, often `online:false`→recovering. Expect a `resume_from_hidden`/`network_online` event immediately before the error.
- **H2 confirmed** if `perms_listener_error` / `access_denied` fire with `perms_loaded:false` on a fresh load with small `last_hidden_ms` (cold load, not a sleep gap).

## Recommended fixes (AFTER a cause is confirmed — not yet applied)

- On `online` + `visibilitychange→visible`, proactively `await auth.currentUser.getIdToken(true)` before listeners resume (kills H1 at the source).
- `auth.js:349`: don't hard-logout on transient errors — on `permission-denied`/`unavailable`, retry with a forced token refresh + re-attach; only sign out on genuine revocation.
- `permissions.js:111`: retry / re-attach the role-template listener after an error instead of leaving `currentPermissions=null`.
- Router: re-evaluate the current route when auth/permissions recover so an Access Denied page self-heals.

## Deploy notes

- localStorage + console capture work as soon as the JS ships (Netlify).
- The centralized `client_errors` mirror needs `firebase deploy --only firestore:rules` (rides the standing v3.3→main rules-deploy debt). Until deployed, mirror writes are denied but events are still captured locally and retried after the rule is live.

files_changed: [app/diagnostics.js, app/auth.js, app/permissions.js, app/router.js, firestore.rules, index.html]
