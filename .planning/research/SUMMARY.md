# Project Research Summary

**Project:** CLMC Procurement System — v4.3 Observability & Error Handling
**Domain:** Retrofitting production error tracking (Sentry) + an app-wide error-handling contract into an existing zero-build, native-ESM, CDN-only static SPA with no staging environment
**Researched:** 2026-08-11
**Confidence:** HIGH

## Executive Summary

This milestone adds Sentry (vendor already locked by PROJECT.md) to a 41-file, 55,189-LOC zero-build SPA that today has 504 `catch` blocks, 422 `console.error` calls, 57 fire-and-forget `.catch()` tails, 19 bare `alert()` calls, and **zero** global error handlers or error sink. All four researchers converge on the same organizing insight, and it should drive every downstream decision: **installing the Sentry SDK is cheap, low-risk, and does not fix the bug that motivated this milestone.** Sentry's `globalHandlersIntegration` is on by default and gives free `window.onerror`/`unhandledrejection` capture the instant `Sentry.init()` runs — no custom global handlers need to be written for genuinely uncaught errors. But Phase 113's root cause was a fire-and-forget `.catch()` whose body only called `console.error()`. From the JS engine's perspective, that promise **was handled** — a rejection handler was attached, however useless — so it structurally never reaches `unhandledrejection`, no matter how well global capture is wired. Global handlers give zero coverage for this exact bug class. The real engineering effort, and the real value of this milestone, is entirely in the second half: the `reportError()` contract, severity tiering, and the targeted retrofit of the 57 `.catch()` tails (write-path first) and the catch blocks whose only statement is a bare `console.error`.

The recommended approach is a version-pinned CDN bundle (`https://browser.sentry-cdn.com/<pinned-version>/bundle.min.js`, error-only variant, no Tracing/Replay/Feedback), loaded as a classic blocking `<head>` script — never via ESM import or Sentry's auto-updating Loader Script — matching this repo's existing convention of pinning every CDN dependency exactly (Firebase v10.7.1, Chart.js v4.4.7, Frappe Gantt v1.2.2) specifically because there is no staging environment to catch a surprise upstream break. `Sentry.init()` must run before the app's own module bootstrap so it can see cold-start failures (bad deploy, blocked Firebase CDN, the stale-ES-module class CLAUDE.md documents by name) — an ESM import-order trick is not a substitute for a classic head script, because module evaluation is dependency-graph-driven and strictly later than parse-time head-script execution.

The two highest-severity risks are not "will Sentry work" but "will it fail silently." First: CSP. The Sentry ingest domain isn't in `script-src`/`connect-src` today, and a blocked ingest request throws no catchable JavaScript error — the app behaves perfectly, nothing appears in the console, and the Sentry dashboard shows zero events, which looks identical to "no errors occurred." This makes an explicit, production-verified test event (not just "no console error") a mandatory gate before any other work in this milestone is considered started. Second: PII. Sentry's console-breadcrumb integration is on by default and will echo this app's 422 existing `[Router]`/`[Procurement]`-prefixed `console.error` calls — which plausibly include full supplier, PO, and bank-transfer objects — into a third-party dashboard the instant `Sentry.init()` runs, with zero new code required. `beforeSend`/`beforeBreadcrumb` scrubbing must ship in the same commit as `Sentry.init()`, not as a follow-up hardening pass, because events sent before the scrub hook exists are unrecoverable. A third, load-bearing but unresolved item: Sentry's free tier is capped at **one seat**, and this is a 7-role, 2-department team — the requirements author must make an explicit choice here (share one login, pay for the Team plan, or accept the researched workaround of mirroring fatal-tier events into the app's existing `notifications` collection) rather than let it default silently.

## Key Findings

### Recommended Stack

**Sentry Browser SDK, version-pinned CDN bundle, error-only variant.** Two independent researchers verified the current stable release on the same day (2026-08-11) and landed on adjacent patch numbers: STACK.md confirmed **`10.70.0`** (released 2026-08-10, one day before research, via `github.com/getsentry/sentry-javascript/releases` and a live SRI-hash computation against the CDN file); PITFALLS.md's npm-registry check surfaced `10.69.0`. **Recommended pin for implementation: `10.70.0`** (the more recent, release-notes-verified source) — but because the two researchers' live checks already disagree by one patch within the same 24-hour window, treat the exact number as provisional and **re-run the version/SRI-hash check against the live CDN at the start of Phase 114**, not before. Do not trust either number as final without that re-check.

```html
<script
  src="https://browser.sentry-cdn.com/<PINNED_VERSION>/bundle.min.js"
  integrity="sha384-<recompute-at-implementation-time>"
  crossorigin="anonymous"
></script>
```

- **Bundle choice:** `bundle.min.js` (error-only, ~35 KB gzip), never `bundle.tracing.*`/`bundle.*.replay.*`/`bundle.*.feedback.*` — those variants physically ship Tracing/Replay/Feedback code even if never invoked, since there's no bundler here to tree-shake it away.
- **Delivery mechanism:** classic (non-module) `<script>` in `<head>`, before the app's `<script type="module">` bootstrap block — not an ESM `import` (loses the timing race to `firebase.js`'s top-level `initializeApp()`) and not Sentry's Loader Script (auto-updates outside the repo with no corresponding git commit — breaks this project's pin-everything convention and is an uncontrolled change to a live, no-CI, no-staging app).
- **Self-hosting consideration:** this repo already self-hosts `lib/signature_pad.umd.min.js` specifically to dodge ad-blocker/tracking-prevention flags. `*.sentry-cdn.com`/`*.ingest.sentry.io` are common ad-blocker targets — self-hosting the bundle file (same treatment) is worth strong consideration; the ingest endpoint itself cannot be self-hosted, so `connect-src` widening is unavoidable either way.
- **Source maps: not needed.** This app ships unbundled, unminified, untranspiled ES modules — the code running in the browser is line-for-line the code in the repo. Do not add `sentry-cli` or any build-plugin source-map tooling; there is no build step for it to hook into.
- **Release/environment tagging without a build step:** a manually-bumped `release` string constant in `app/errors.js`/`app/sentry.js` (no CI to auto-inject a git SHA); `environment` derived at runtime via the exact `isLocal` pattern already used in `app/firebase.js` (`localhost`/`127.0.0.1` → `development`, else `production`).

### Expected Features

**Must have (table stakes) — the "cheap and mechanical" half:**
- Sentry SDK loaded, `Sentry.init()` guarded (`if (window.Sentry) {...}`) so a blocked CDN never throws
- Identity attribution: `Sentry.setUser({id, email})` + `setTags({role, department})`, wired into the existing `onAuthStateChanged`/`onSnapshot` lifecycle in `app/auth.js` (first-snapshot bootstrap, role-change diff, logout branch)
- CSP widened for the Sentry `script-src` host (or none, if serving from the already-allow-listed `cdn.jsdelivr.net`) and `connect-src` ingest host, in **all four** CSP string occurrences (see Architecture Approach below)
- `beforeSend`/`beforeBreadcrumb` PII-scrubbing hooks, shipped in the same commit as `Sentry.init()`

**Must have — the "real work" half:**
- A single `reportError(err, {severity, context, ...})` contract in new file `app/errors.js`, with a `SEVERITY` enum (`ERROR`/`WARNING`/`BREADCRUMB`/`SILENT`) and `mapFirestoreError()` for Firestore/Auth `.code`-based normalization (never `.message` — unstable across SDK versions)
- Correlation ID generation (5–8 char, uppercase, ambiguity-reduced alphabet, via the existing `cryptoRandomUuid()` primitive) — **always generated first, before any Sentry availability check**, so it works identically whether or not the SDK loaded
- Elimination of the 57 fire-and-forget `.catch()` tails, write-path (`updateDoc`/`setDoc`/`addDoc`/`deleteDoc`/`writeBatch`/`runTransaction`) prioritized first — this is the direct fix for Phase 113 and should not wait for a full 504-block sweep
- Replacement of the 19 bare `alert()` calls with `showToast()` + correlation ID, threaded through the catch-block conversion work rather than scheduled as an independent sweep
- A documented convention guardrail (CLAUDE.md entry): never assign `window.onerror`/`window.onunhandledrejection` (single-value IDL properties — silently clobbers Sentry's own handler); always `addEventListener('error'/'unhandledrejection', ...)`; never call `Sentry.captureException()` a second time for an error the SDK's default integration already captured

**Should have (fast-follow within the milestone):**
- Sweep of the remaining ~450 non-write-path catch blocks, batched per file, risk-ascending (financial write paths last)
- Mirror fatal-tier errors into the existing `notifications` collection (bell/dropdown UI already exists, v4.0) — the researched workaround for the 1-seat limit, giving non-Sentry-seat admins near-real-time visibility
- At least one Sentry Alert Rule ("new issue", `environment:production`) — free even on the Developer tier, and without it severity tiering is cosmetic (an event nobody is notified about isn't "seen")

**Defer (v2+/explicitly out of scope):**
- Session Replay (masking is opt-out per field, high risk over a financial UI, separate quota)
- Performance/APM tracing (`tracesSampleRate`) — different problem, different quota
- Custom Sentry fingerprint rules — revisit only once real production volume shows default grouping is too coarse/fine
- Slack/PagerDuty routing, issue-ownership rules — irrelevant at team size 1 responder; requires the paid Team plan anyway
- A git-hook pattern scanner enforcing the convention guardrail — valuable, not blocking (this repo has no linter/build step to hang one off of)

### Architecture Approach

`Sentry.init()` must live in a classic, blocking `<script>` in `index.html`'s `<head>`, strictly before the app's `<script type="module">` bootstrap block — this is the only mechanism guaranteed to run before `app/firebase.js`'s top-level `initializeApp()`/`initializeFirestore()` calls and before the entire `auth.js`/`router.js` module graph resolves, which matters because a cold-start failure (bad deploy, blocked Firebase CDN, a stale/mismatched ES module — CLAUDE.md's own named failure mode) is only visible to Sentry if its global listener is already attached when the browser reports it, and this app has no staging environment to catch that class of failure before it hits every user.

**New file: `app/errors.js`.** Not `app/utils.js` (would pollute the lowest-level shared module with Sentry-specific concerns and make its 970 lines harder to reason about) and not inline per-call-site (loses the shared severity/correlation-ID contract). `errors.js` sits at the same graph depth as `app/permissions.js`/`app/notifications.js`: it statically imports `utils.js` (for `showToast`, `cryptoRandomUuid`) and nothing else, reads identity via `window.getCurrentUser?.()` rather than statically importing `auth.js` (mirroring the existing `app/diagnostics.js` pattern), and exposes itself as `window.reportError` for the handful of modules below it in the graph (`utils.js`, `firebase.js`, `permissions.js`) that would otherwise create an import cycle. Resulting one-directional chain: `errors.js → utils.js → firebase.js`, with `auth.js`, `router.js`, and view modules importing `errors.js` from above.

**Major components:**
1. **`app/errors.js` — `reportError()` + `mapFirestoreError()`** — the severity-tiering brain; correlation ID generation; console fallback that always fires regardless of Sentry availability (graceful-degradation contract: Sentry down means console + toast still work, only dashboard visibility is lost)
2. **`app/auth.js` identity binding** — `Sentry.setUser()`/`setTags()` hooked into the existing first-snapshot/role-change/logout branches of the single `onSnapshot(users/{uid})` listener — no new subscription needed
3. **`app/router.js` single choke-point conversion** — the one existing `navigate()` catch block already catches every lazy-view-load failure app-wide (including the stale-module class); converting just this one site gives coverage disproportionate to its size, before the wider 41-file sweep begins
4. **`netlify.toml` + `_headers` CSP** — **four total CSP string occurrences**, not two: each file independently duplicates its CSP string across a `/*` block and a `/*.html` block. All four must be updated atomically in one commit, and Netlify's own documentation does not define precedence between `netlify.toml` and `_headers` when both define headers for the same path — treat "both files always byte-identical" as an enforced invariant, and after every CSP-touching deploy, verify empirically which one Netlify actually served (`curl -I` or DevTools → Response Headers → `Content-Security-Policy`) rather than trusting the committed diff. The lowest-risk path: if the Sentry bundle is served from `cdn.jsdelivr.net` (already allow-listed in `script-src` for Firebase/Chart.js), no `script-src` change is needed at all — only `connect-src` needs the new ingest host.

### Global Handlers — What's Free vs. What Still Needs Building

Sentry's `globalHandlersIntegration` is **on by default** and installs its own `window.onerror` + `unhandledrejection` capture the moment `Sentry.init()` runs — this satisfies the milestone's "global error capture" line item for anything the SDK sees, with zero custom handler code required. What the milestone's original goal statement framed as work ("the app currently has neither, so any failure outside a `catch` is lost entirely") is therefore already solved by installing the SDK, not a separate deliverable.

What genuinely still needs building on top of that free coverage:
- **UX-only supplementary listeners**, registered via `addEventListener('error'/'unhandledrejection', ...)` — never by assigning `window.onerror`/`window.onunhandledrejection` directly (both are single-value IDL properties; a direct assignment silently replaces Sentry's own installed handler, with no error to flag the regression). These supplementary listeners feed the existing `app/diagnostics.js` ring buffer and show a generic "Something went wrong" toast — they must never call `Sentry.captureException()` themselves, since the SDK's default integration already reported that same error once (double-reporting is a documented, cross-framework Sentry pitfall).
- **The `reportError()` contract itself** — for errors caught in an app-level `catch` block or `.catch()` tail, which by definition never reach `window.onerror`/`unhandledrejection` at all (see next section).

### The Organizing Insight: Global Capture Doesn't Fix the Motivating Bug

Phase 113's root cause was a cross-department `updateDoc()` whose `.catch()` body only called `console.error(...)`. A promise with any `.catch()` attached — however useless its body — is **handled** from the JavaScript engine's perspective; it structurally never fires `unhandledrejection`, no matter how correctly global handlers are wired. This means Sentry's free, zero-code global capture gives complete coverage for genuine unknown-unknowns (bugs nobody anticipated) and zero coverage for the exact bug class this milestone exists to catch. The only fix is per-site conversion: routing the 57 fire-and-forget `.catch()` tails and the catch blocks whose only statement is `console.error` through `reportError()`, write-path first. This is why the milestone's value is concentrated almost entirely in the `reportError()`/retrofit half, not the SDK-install half — and why the final acceptance test for the whole milestone should be a deliberate, production-run reproduction of the Phase 113 bug class (a rejected cross-department write), confirming it now produces exactly one Sentry event, at report-tier, tagged with enough context to diagnose without reproducing.

### `permission-denied` Tiering — One Rule

Phase 113's `firestore.rules` tightening (plan 113-11, deploying immediately ahead of this milestone) means `permission-denied` will now fire more often, and correctly, as by-design access-control behavior. The reflexive fix — blanket-ignoring `permission-denied` via `ignoreErrors` — is exactly wrong: it would recreate the same invisibility this milestone was funded to eliminate, one layer up the stack. The single discriminating rule an implementer can apply mechanically:

> **Read-path `permission-denied` → `WARNING`/breadcrumb tier** (a scoped listener or query rejected by design — expected under normal, correctly-scoped operation; still worth a low-cost breadcrumb in case scoping itself is buggy, but not worth a full event).
> **Write-path `permission-denied` → always `ERROR`/report tier** — a correctly gated UI should never let a user attempt a write their role doesn't permit, so a write-permission-denied reaching Firestore at all is, by definition, evidence of a client-side authorization bug (missing UI guard, stale permission cache, a cross-department write path nobody scoped — Phase 113's exact shape). This is never "expected," regardless of volume.

Tag every Firestore error at the `reportError()` call site with structured context (`operation: 'read'|'write'`, `collection`, acting `role`) rather than filtering by error string — this turns `permission-denied` from an undifferentiated noise category into a filterable, queryable dimension in Sentry, and is cheap since the wrapper already has identity/role in scope.

### Critical Pitfalls

1. **CSP silently blocks all Sentry ingest, and the failure looks identical to "no errors happened."** A blocked `connect-src` request throws no catchable JS error — the app functions perfectly, nothing appears in console, and zero events reach Sentry. **Avoid by:** treating a production-verified test event (not "no console error observed") as a hard release gate for the CSP-widening phase, every time it's touched — not just the first time.
2. **Default console breadcrumbs leak PII with zero new code.** Sentry's console-breadcrumb integration is on by default and echoes this app's 422 `console.error` calls — plausibly including full supplier/PO/bank objects per the `[Router]`/`[Procurement]` debug-logging convention — into the dashboard the instant `Sentry.init()` runs. **Avoid by:** shipping `beforeSend`/`beforeBreadcrumb` scrubbing in the same commit as `Sentry.init()`; events sent before the scrub hook exists are unrecoverable.
3. **Naive quota exhaustion from unfiltered rollout.** 5,000 events/month, and this app's `onSnapshot`-heavy architecture means a single bad rules deploy can fire the same error from every open tab simultaneously — a multiplicative, not linear, spike. Sentry's grouping into "issues" does not reduce quota consumption; every event still counts. **Avoid by:** triaging representative samples into report/breadcrumb/console-only before any mechanical conversion, not "convert everything then tune."
4. **Double-reporting from custom global handlers layered on Sentry's own defaults, or from report-then-rethrow patterns.** **Avoid by:** one written rule — Sentry's default `globalHandlersIntegration` is the sole source of truth for uncaught errors; custom `addEventListener` handlers are UX-only and never call `captureException`; a `catch` site either fully reports-and-terminates or lets the error propagate to be caught once — never both.
5. **Mechanically converting 500+ catch blocks in one pass, with no automated test suite to catch behavior regressions.** This app's only automated tests are Firestore security-rules tests — they don't touch view-layer catch blocks at all, and there is no staging environment to catch a regression before it hits every user. **Avoid by:** splitting into an audit phase (classification artifact, reviewed) and a conversion phase (batched per file, risk-ascending — financial write paths last), never a single mega-PR.

## Implications for Roadmap

Based on combined research, suggested phase structure (continuing from Phase 114 per PROJECT.md's phase numbering):

### Phase 114: Sentry Foundation — SDK, CSP, PII Scrubbing
**Rationale:** Everything else in this milestone needs `window.Sentry` to exist, and this is the phase where the two catastrophic-but-silent failure modes (CSP block, PII leak) must be closed before any real traffic — or even a test event — flows through.
**Delivers:** Pinned CDN bundle in `index.html` `<head>` (guarded `if (window.Sentry)` init), all four CSP string occurrences updated in `netlify.toml`/`_headers`, `beforeSend`/`beforeBreadcrumb` scrubbing hooks configured in the same commit as `Sentry.init()`, `release`/`environment` tagging.
**Addresses:** Error dashboard, CSP widening (FEATURES.md/PROJECT.md)
**Avoids:** Pitfalls 2 (PII leak) and 3 (CSP silent block)
**Hard gate before proceeding:** a manually-triggered test error verified reaching the live Sentry dashboard in production, plus a verified CDN-blocked degradation path (app must work identically, minus dashboard visibility, if the Sentry script fails to load).

### Phase 115: Identity Attribution
**Rationale:** Small, isolated, high-value — hooks into the existing single `onSnapshot(users/{uid})` listener lifecycle in `app/auth.js`, no new subscription.
**Delivers:** `Sentry.setUser({id, email})` + `setTags({role, department})` in the first-snapshot and role-change branches; `Sentry.setUser(null)` in the logout branch.
**Uses:** Existing `currentUser`/`previousRole !== userData.role` diff already computed in `app/auth.js`.
**Depends on:** Phase 114 (`window.Sentry` must exist).

### Phase 116: `reportError()` Contract, Severity Tiering, Correlation IDs
**Rationale:** This is the load-bearing design phase — the wrapper, the tiering rule, and the permission-denied read/write discriminator must all be settled and reviewed before any mechanical catch-block conversion begins, or the retrofit risks reproducing either the quota-exhaustion or the invisibility failure this milestone exists to prevent.
**Delivers:** New `app/errors.js` (`reportError()`, `mapFirestoreError()`, `SEVERITY` enum), correlation ID generation reusing `cryptoRandomUuid()`, a reviewed triage table classifying representative catch/`.catch()` samples by tier, the correlation-ID-to-Sentry-tag round-trip (`Sentry.setTag('correlation_id', id)`) shipped as **one deliverable** with the toast display — not sequenced separately.
**Implements:** The read-vs-write `permission-denied` rule; the graceful-degradation contract (console fallback always fires regardless of Sentry availability).
**Depends on:** Phase 114.

### Phase 117: Global Handler Coexistence + Router Choke Point
**Rationale:** Confirms Sentry's default global capture is active and un-clobbered, adds only UX-layer supplementary handling, then converts the single `router.js` `navigate()` catch — the highest-leverage individual conversion in the entire retrofit, since it already catches every lazy-view-load and stale-module failure app-wide.
**Delivers:** `addEventListener('error'/'unhandledrejection', ...)` (never `window.onerror =`) feeding `app/diagnostics.js` + a generic fallback toast; `navigate()` catch converted to `reportError()` with the returned correlation ID surfaced in the fallback UI; a breadcrumb on successful navigation (this app uses `location.hash`, not `pushState`, so Sentry's default history-based breadcrumbs cannot be assumed to cover it).
**Depends on:** Phase 116 (`reportError()` must exist).

### Phase 118: Correlation ID UX — `alert()` Replacement
**Rationale:** Threads through wherever `reportError()`'s toast surfacing naturally replaces an `alert()`, rather than as an independent sweep across the 6 files that contain the 19 bare `alert()` calls.
**Delivers:** All 19 `alert()` calls replaced with `showToast()` + persistent (not auto-dismissing) correlation ID.
**Depends on:** Phase 116.

### Phase 119+: Prioritized Retrofit Passes (audit sub-phase, then conversion sub-phase — do not collapse)
**Rationale:** 504 catch blocks + 57 `.catch()` tails across 41 files with no automated regression coverage and no staging environment means a blanket conversion is both an unreviewable-diff risk and mostly wasted effort (most existing catches already show a reasonable message — they're not silent).
**Delivers, in order:**
- Pass A — the 57 fire-and-forget `.catch()` tails, write-path (`updateDoc`/`setDoc`/`addDoc`/`deleteDoc`/`writeBatch`/`runTransaction`) filtered first — the direct Phase 113 fix
- Pass B — catch blocks whose entire body is a bare `console.error`, same write-path-first filter
- Pass C — `project-plan.js`/`service-plan.js` paired conversion (structurally near-identical files, ~28 inline `permission-denied` ternaries between them — convert as one reviewed diff, not two)
- Pass D — opportunistic, boy-scout-rule conversion of the remaining ~450 catches as those files are touched for unrelated work — explicitly not a dedicated phase
**Avoids:** Pitfall 5/6 (mechanical mega-PR risk)

### Final Phase: Convention Guardrail + Phase-113-Class Regression Verification
**Rationale:** Written after real converted examples exist (per this repo's stated practice of documenting from what was built, not aspirationally), and closes the loop with the milestone's actual acceptance test.
**Delivers:** CLAUDE.md entry documenting `reportError()` usage and the `window.onerror`-clobbering anti-pattern; a deliberate, production-run reproduction of a cross-department write rejection, confirmed to produce exactly one Sentry event at report-tier with role/collection/operation tags; at least one Sentry Alert Rule configured (free even on the Developer tier — without it, tiering is cosmetic).

### Phase Ordering Rationale

- Foundation (114) must be fully verified — not just deployed — before anything depends on `window.Sentry` existing, because both of its failure modes (CSP block, PII leak) are silent.
- Identity (115) and the contract (116) are independent of each other but both gate everything downstream; 116 is sequenced after 115 only because it's the larger design surface and benefits from identity tags already being available to reference in its tiering examples.
- The router choke point (117) ships before the wide retrofit (119+) specifically because it's disproportionately high-leverage (covers all ~30 lazy-loaded views in one change) and should start producing real production signal before the slower, file-by-file sweep begins.
- The retrofit (119+) is explicitly two sub-phases (audit artifact, then mechanical conversion guided by it) per Pitfall 6 — collapsing them reproduces the exact "judgment calls get skipped under reviewer fatigue" risk research flagged.
- Financial write-path files (`finance.js`, `procurement.js`, `mrf-form.js`) should be sequenced last within the retrofit passes, once the `reportError()` pattern has survived contact with lower-risk views first.

### Research Flags

Needs deeper scoping/design attention during planning (not necessarily external research, but real design decisions with consequences):
- **Phase 114** — the CSP two-file/four-occurrence ambiguity and Netlify's undocumented `netlify.toml` vs. `_headers` precedence must be resolved empirically (live header inspection) at plan time, not assumed from the diff.
- **Phase 116** — severity tiering is the single highest-consequence design decision in the milestone (gates both quota safety and Phase-113-class visibility); the triage table should be a reviewed artifact, not implicit in the code.
- **Phase 119+** — must be planned as an explicit audit-then-convert split with per-batch manual smoke-test checklists, given the total absence of automated coverage for this layer.

Standard, well-documented patterns (skip deep research-phase):
- **Phase 115** — identity binding has a direct precedent already in this codebase (`app/diagnostics.js`'s `window.getCurrentUser?.()` pattern, the existing `onSnapshot` lifecycle).
- **Phase 117** — the "never assign `window.onerror`, always `addEventListener`" rule and the double-reporting trap are both well-documented, cross-framework Sentry patterns with clear verification steps.
- **Phase 118** — reuses the existing, unmodified `showToast()` primitive; no new UI component needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions/CDN behavior verified via live requests to Sentry's/jsDelivr's CDN, GitHub Releases, and `sentry.io/pricing` (independent fetches). One residual gap: two researchers' live version checks disagree by one patch (10.70.0 vs. 10.69.0) within the same day — re-verify at implementation time. |
| Features | HIGH / MEDIUM | Sentry platform mechanics and Firestore error taxonomy HIGH (official docs, gRPC status code list); small-team sizing/process recommendations MEDIUM (judgment-based, though grounded in verified pricing). |
| Architecture | HIGH | Every integration point (file paths, line numbers, import graph) verified by directly reading the actual repository files, not inferred from the milestone brief. Sentry SDK internal handler-chaining mechanism flagged MEDIUM — verify against the exact pinned version's source at implementation time. |
| Pitfalls | HIGH / MEDIUM | Sentry SDK mechanics HIGH (official docs, cross-framework GitHub/forum issue corroboration). Netlify header-precedence claims MEDIUM — Netlify's own documentation does not define precedence between `netlify.toml` and `_headers`; this ambiguity is itself the finding, not a resolved fact. |

**Overall confidence:** HIGH

### Gaps to Address

- **Sentry SDK version pin (10.70.0 vs. 10.69.0):** two independent same-day live checks disagree by one patch. Re-verify the exact current stable version and recompute its SRI hash at the start of Phase 114 — do not carry either number forward as final.
- **Netlify `netlify.toml` vs. `_headers` precedence:** undocumented by Netlify itself. Resolve empirically per deploy (live `curl -I`/DevTools header inspection) rather than assuming the committed file is the one served. Consider consolidating to a single authoritative file as a follow-up hardening item beyond this milestone's scope.
- **Sentry's 1-seat free-tier limit vs. a 7-role, 2-department team:** genuinely unresolved — flagged, not silently decided, by all four researchers. Options on the table: (a) share a single Sentry login across triagers (a real RBAC compromise for a financial system), (b) budget for the Team plan (~$26/mo, more seats + 50,000 events/month), (c) mirror fatal-tier events into the existing `notifications` collection as a partial workaround (gives non-seat-holders visibility, doesn't give them the Sentry dashboard itself). The requirements author should make this decision explicit rather than let it default.
- **Netlify Deploy Preview availability:** not confirmed during research (would be the closest thing to a staging environment this stack offers, running against the same production Firebase — still not a full staging tier, but the cheapest risk reduction available for a no-staging stack). Check at milestone kickoff.

## Sources

### Primary (HIGH confidence)
- `/getsentry/sentry-docs`, `/getsentry/sentry-javascript` (Context7) — CDN/loader install, default integrations (`globalHandlersIntegration`, breadcrumb integrations), core capture API, CSP/DSN/region format, bundle-size ceilings
- https://sentry.io/pricing/ , https://docs.sentry.io/pricing/quotas/ — free-tier limits (5,000 errors/month, 30-day retention, 1 seat), quota-exhaustion and Spike Protection behavior (independent verification passes)
- https://github.com/getsentry/sentry-javascript/releases — current stable version confirmation
- https://docs.sentry.io/platforms/javascript/configuration/options/ , .../data-management/sensitive-data/ , .../configuration/integrations/breadcrumbs/ , .../configuration/integrations/globalhandlers/ — scrubbing hooks, default-on breadcrumb categories, default global capture
- https://docs.netlify.com/manage/routing/headers/ — confirms no documented precedence between `netlify.toml` `[[headers]]` and `_headers`
- Direct reads of this repository: `index.html`, `app/router.js`, `app/auth.js`, `app/utils.js`, `app/firebase.js`, `app/permissions.js`, `app/diagnostics.js`, `netlify.toml`, `_headers`, `firestore.rules`, `.planning/PROJECT.md`, `CLAUDE.md`

### Secondary (MEDIUM confidence)
- Live CDN/npm verification via curl (2026-08-11) — `browser.sentry-cdn.com` bundle size/hash, jsDelivr `+esm` transitive-import behavior
- GitHub/forum threads on Sentry duplicate-capture patterns (`getsentry/sentry-javascript` issues, community forum) — cross-framework double-reporting pattern corroboration
- Sentry Forum — Required Content Security Policy — community-sourced CSP guidance corroborating official docs

### Tertiary (LOW confidence)
- None flagged as load-bearing; all judgment-based recommendations (small-team alert sizing, correlation ID format conventions) were cross-checked against verified pricing/official docs before being carried into this summary.

---
*Research completed: 2026-08-11*
*Ready for roadmap: yes*
