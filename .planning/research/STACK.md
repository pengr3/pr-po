# Stack Research: Sentry Browser Error Tracking (v4.3 Observability)

**Domain:** Browser error tracking / observability addition to an existing zero-build, native-ESM, CDN-only static SPA
**Researched:** 2026-08-11
**Confidence:** HIGH — versions and CDN behavior verified against live requests to Sentry's/jsDelivr's CDN and official `getsentry/sentry-docs` + `getsentry/sentry-javascript` source (via Context7); pricing verified against `sentry.io/pricing` (two independent fetches); a few narrow points (exact SRI hash freshness, spike-protection UI mechanics) are MEDIUM and flagged inline.

Vendor choice (Sentry) is locked by the milestone — this document is about **how** to wire it into a project with no bundler, no npm runtime, no build step, and no staging environment.

---

## Recommended Stack

### Core Technology

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|------------------|
| `@sentry/browser` (CDN bundle, **not** npm-installed) | **10.70.0** (released 2026‑08‑10, one day before this research) | Client-side error capture, breadcrumbs, user context, release/environment tagging | Locked vendor decision; this specific delivery form (pinned CDN bundle) is the only option that (a) requires zero build tooling, (b) lets us exclude Tracing/Replay/Feedback code at the network level (not just at the config level), and (c) matches this project's existing "pin every CDN script to an exact version" convention (Chart.js `@4.4.7`, Frappe Gantt `@1.2.2`) |

### Exact snippet to add to `index.html`

Add as a plain (non-module) `<script>` tag, next to the existing Chart.js / Frappe Gantt tags — **before** the app's `<script type="module">` boot block, so `window.Sentry` exists when `app/sentry.js` runs:

```html
<!-- Sentry (Phase 114+) — pinned to v10.70.0; error-only bundle (no tracing/replay/feedback code shipped) -->
<script
  src="https://browser.sentry-cdn.com/10.70.0/bundle.min.js"
  integrity="sha384-79FhSq4eaPA7rdWwXh1Jly3F3Wvgq7HChMpaIIx7feYEZicWt/LnwIfTFTXSJao5"
  crossorigin="anonymous"
></script>
```

The `integrity` value above was computed today (2026‑08‑11) directly from the live file (`curl … | openssl dgst -sha384 -binary | openssl base64 -A`) and is verified correct for `10.70.0`/`bundle.min.js` **at time of writing**. Because CDN content for a given pinned version does not change, this hash should remain valid — but regenerate it at implementation time with the same command if a newer patch version is adopted, and treat any mismatch as a reason to stop and investigate, not to strip the attribute.

Then create `app/sentry.js` (mirrors the existing `app/firebase.js` pattern — module that configures a third-party service and exports a small wrapper API):

```javascript
// app/sentry.js — thin wrapper around the globally-loaded window.Sentry (bundle.min.js)
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

window.Sentry.init({
    dsn: 'https://<public_key>@o<org_id>.ingest.<region>.sentry.io/<project_id>', // from Sentry project settings
    environment: isLocal ? 'development' : 'production', // mirrors app/firebase.js's isLocal pattern
    release: 'clmc-procurement@2026.08.11', // see "Release without a build step" below — bump manually per deploy
    // Do NOT set tracesSampleRate / replaysSessionSampleRate / integrations for tracing|replay|feedback —
    // bundle.min.js does not even contain that code, so those options would be no-ops at best.
});

export const Sentry = window.Sentry;
```

Downstream modules `import { Sentry } from './sentry.js'` (or read `window.Sentry` directly, consistent with this app's existing window-global conventions) to call `Sentry.captureException()`, `Sentry.setUser()`, etc. from the `reportError()` contract this milestone requires.

**Do not** use `<script type="module">` + a bare `import * as Sentry from '...'` for the SDK itself — see the ESM/jsDelivr option below for why that path is worse for this specific project, even though it is technically reachable.

---

## The Three Delivery Options (and why one wins here)

Sentry documents two official no-build delivery mechanisms, and there is a third, unofficial-but-technically-real path relevant to a native-ESM project. All three were checked live.

### Option A — Official pinned CDN bundle (`browser.sentry-cdn.com/<version>/bundle.min.js`) — **RECOMMENDED**

```html
<script src="https://browser.sentry-cdn.com/10.70.0/bundle.min.js"
  integrity="sha384-..." crossorigin="anonymous"></script>
```

- Plain `<script>` (non-module) → sets `window.Sentry`, exactly like this project's existing Chart.js/Frappe Gantt tags.
- **Exact version pin**, matching this repo's established convention of pinning every CDN dependency.
- **Subresource Integrity (SRI) supported and published** — `integrity="sha384-…"` — a real security property this project's hardened-CSP history (Phase 49 security audit) would want.
- **Physically excludes Tracing/Replay/Feedback code.** `bundle.min.js` is a distinct build artifact from `bundle.tracing.min.js` / `bundle.tracing.replay.min.js` / etc. — the unwanted code is never downloaded, not merely left uninitialized. Confirmed via `getsentry/sentry-javascript`'s own `.size-limit.js`: error-only bundle ≈ 35 KB gzip / 95 KB raw ceiling (actual live download today: 90,586 bytes uncompressed — well inside limit); with Tracing added the ceiling jumps to ~54 KB gzip, and Tracing+Replay to ~91 KB gzip.
- Downside vs. the Loader Script: downloads eagerly on every page load (no lazy trigger), and a version bump means editing `index.html` by hand. Both are consistent with how this project already treats Chart.js/Frappe Gantt, so neither is a real cost here.

### Option B — Sentry Loader Script (`js.sentry-cdn.com/<public_key>.min.js`)

```html
<script src="https://js.sentry-cdn.com/<your-public-key>.min.js" crossorigin="anonymous"></script>
```

- Also a plain `<script>`, also sets `window.Sentry`.
- **Lazy by default for errors-only config**: per Sentry's docs, "the loader won't load the full SDK until triggered by … an unhandled error, an unhandled promise rejection, a call to `Sentry.captureException`," etc. The *first* error is buffered client-side and replayed once the full SDK finishes downloading — it is not lost. This means zero network cost for error-free sessions (likely the majority), a genuine advantage over Option A.
- **No SRI** — the script is dynamically generated per-project and can change without your repo changing, so it cannot carry a static integrity hash.
- **Version is managed in the Sentry dashboard UI** (Settings → Projects → SDK Setup → Loader Script → version dropdown), not in your repo. This breaks reproducibility — a Sentry-side setting change can alter production behavior with zero corresponding git commit, which conflicts with this project's "everything pinned in the repo, no external state" posture (no staging, production-only Firebase, deliberate CDN pinning elsewhere).
- Which bundle variant it delivers (errors-only vs. +tracing vs. +replay) is also a dashboard toggle, not something visible in code review — a second source of drift risk for a team that already had one severe incident (Phase 113) caused by invisible failure paths.
- **Verdict:** legitimate and arguably more bandwidth-efficient, but its two forms of out-of-repo state make it a worse fit for this project than Option A. If initial-load payload becomes a measured problem, revisit.

### Option C — npm package via a CDN ESM endpoint (jsDelivr `+esm`)

```javascript
import * as Sentry from 'https://cdn.jsdelivr.net/npm/@sentry/browser@10.70.0/+esm';
```

- Verified live: `curl -I https://cdn.jsdelivr.net/npm/@sentry/browser@10.70.0/+esm` returns `200`, `content-type: application/javascript`, `x-jsd-version: 10.70.0`. jsDelivr transforms the npm package into a native ES module on the fly.
- Would require **zero new `script-src` CSP entries** since `https://cdn.jsdelivr.net` is already whitelisted in both `netlify.toml` and `_headers` (used today for Chart.js/Frappe Gantt) — genuinely attractive on paper, and it would mirror this project's `app/firebase.js` bare-URL-ESM-import pattern more closely than a `<script>` tag does.
- **Rejected for this project for one concrete, load-bearing reason: no bundler means no tree-shaking.** The live response body (fetched today) shows `@sentry/browser`'s ESM build importing `feedbackScreenshotIntegration`, `feedbackModalIntegration` from `@sentry/feedback`, plus `modulepreload` links to `@sentry/replay`, `@sentry/replay-canvas`, and `@sentry/core`. A bundler would normally tree-shake these away when you only call `Sentry.init()` + `captureException()`; a plain browser `<script type="module">` import cannot — it downloads the full dependency graph (Tracing, Replay, Feedback code included) regardless of whether those integrations are ever invoked. That is exactly the "what NOT to add" surface area (see below) shipping to every user's browser anyway, undermining the whole point of choosing an error-only mechanism.
- SRI is explicitly discouraged by jsDelivr itself on `+esm` endpoints ("Do NOT use SRI with dynamically generated files," per the response comment header observed live).
- Not documented or endorsed by Sentry's own docs as an install method — Sentry's CDN install page references only its own two CDN hosts.
- **Verdict:** technically works, but is the worst of the three for this project's specific "no build → can't tree-shake" constraint, despite its CSP convenience.

---

## Version and API Notes (v8 → v9 → v10)

- **Latest stable as of 2026‑08‑11: `10.70.0`** (released 2026‑08‑10, confirmed via `github.com/getsentry/sentry-javascript/releases`). An `11.0.0-alpha.0` prerelease exists (2026‑08‑07) — do not use; alpha/prerelease.
- **The recommended snippet above targets v10** (current major line; v9→v10 did not remove anything relevant to basic error capture — it mainly added new products/instrumentation).
- Core error-capture API used in this milestone's `reportError()` contract has been **stable since v7/v8** and is unchanged through v10:
  - `Sentry.init({ dsn, environment, release })`
  - `Sentry.captureException(error)` / `Sentry.captureMessage(msg)`
  - `Sentry.setUser({ id, email, ... })` — for uid/email/role/department attribution
  - `Sentry.addBreadcrumb({ message, category, level, data })`
  - `Sentry.withScope(scope => { ... })` and `Sentry.getCurrentScope()` — both still present in v10 (confirmed via `sentry-javascript` source: `captureException` internally calls `getCurrentScope()`; `withScope` is re-exported from `@sentry/core` through every SDK package including `browser`).
- **v8→v9 breaking changes** (per `docs.sentry.io/platforms/javascript/migration/v8-to-v9/`) that are irrelevant to us but worth knowing if code is copy-pasted from older tutorials:
  - `getCurrentHub()`, `Hub`, `getCurrentHubShim()` removed — old Hub-based patterns from pre-v8 tutorials will not work.
  - `enableTracing` init option removed — use `tracesSampleRate` (moot here since Tracing is explicitly not being added).
  - `autoSessionTracking` removed — replaced by default integrations.
  - `captureUserFeedback()` removed — renamed to `captureFeedback()` (irrelevant — Feedback is out of scope, see below).
- **Class-based integrations are already gone** (removed in the v7→v8 transition, long before current v10): do **not** write `new Sentry.Integrations.BrowserTracing()`. The current, correct pattern is functional: `Sentry.browserTracingIntegration()`, `Sentry.replayIntegration()`. This project should never call either — flagged here only because old blog posts/tutorials still show the removed class-based form, and someone copy-pasting a Sentry example from training data could reintroduce it.
- **Global error capture is automatic once `Sentry.init()` runs.** The `globalHandlersIntegration` is a **default-on integration** in the browser SDK — it installs both a `window.onerror` handler and an `unhandledrejection` listener with no extra config. This directly satisfies the milestone's "Global error capture" line item for anything Sentry sees; it does not replace the app's own `reportError()` contract for errors already caught in a `catch` block (those need explicit `captureException` calls with severity tiering), but it means the zero-handler gap this milestone calls out is closed for *uncaught* errors the moment `Sentry.init()` executes, with no additional code.

---

## CSP: Exact Directive Strings for `netlify.toml` and `_headers`

Both files currently define the **identical** CSP string in **two places each** (default `/*` block and the `/*.html` block) — all four occurrences must be updated together, or errors are silently blocked in exactly the failure mode the milestone calls out ("miss either and every error report is silently blocked by the browser").

### `script-src` — add one host

Current:
```
script-src 'self' 'unsafe-inline' https://*.gstatic.com https://*.googleapis.com https://cdn.jsdelivr.net;
```

New (Option A, recommended — official pinned bundle):
```
script-src 'self' 'unsafe-inline' https://*.gstatic.com https://*.googleapis.com https://cdn.jsdelivr.net https://browser.sentry-cdn.com;
```

If Option B (Loader Script) is chosen instead, use `https://js.sentry-cdn.com` in place of `https://browser.sentry-cdn.com`. If Option C (jsDelivr ESM) is chosen, **no `script-src` change is needed at all** — `https://cdn.jsdelivr.net` is already present. (This CSP convenience is real; it just doesn't outweigh Option C's payload problem above.)

### `connect-src` — add the ingest host

Sentry's own DSN format is `{PROTOCOL}://{PUBLIC_KEY}@{HOST}{PATH}/{PROJECT_ID}`, where for sentry.io SaaS, `HOST` follows the pattern `o{org_id}.ingest.{region}.sentry.io` (region is `us` by default, or `de` if the EU/Germany data-residency option was chosen at org signup — confirmed via `getsentry/sentry-docs`' transport-authentication spec).

Current:
```
connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://www.gstatic.com;
```

New (broad — matches Sentry's own documented CSP recommendation, "*.sentry.io", verified in `getsentry/sentry-docs`' loader install guide):
```
connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://www.gstatic.com https://*.sentry.io;
```

CSP wildcard host-matching (`*.sentry.io`) matches any number of prepended labels in current browsers, so this single entry covers `o<org_id>.ingest.us.sentry.io` and `o<org_id>.ingest.de.sentry.io` alike without knowing the org ID in advance. Once the Sentry project exists and the DSN is known, this project's CSP-hardening history (Phase 49) suggests tightening to the exact host, e.g.:
```
connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://www.gstatic.com https://o1234567.ingest.us.sentry.io;
```
(Replace `o1234567.ingest.us.sentry.io` with the actual host segment from the project's DSN, visible in Sentry → Settings → Projects → Client Keys (DSN).)

### `img-src`, `worker-src`, `report-uri`/`report-to` — not needed

- **`img-src`**: no change needed. The error-only bundle does not load images; only Sentry's optional "user feedback" crash-report dialog (`showReportDialog()`) pulls a logo image from Sentry's static assets, and this project is not using that feature.
- **`worker-src`**: no change needed for error capture. Session Replay uses a Web Worker for compression — since Replay is explicitly excluded (see below), and `bundle.min.js` doesn't even contain that code, no `worker-src` entry is required.
- **`report-uri` / `report-to`**: **do not add these pointed at Sentry.** These CSP directives configure a *different, unrelated* Sentry feature — collecting reports of *this site's own CSP violations* (e.g., someone else's script trying to load a disallowed resource) — not the error-tracking event pipeline this milestone is building. Conflating the two would mean setting up Sentry's CSP-violation-report ingestion endpoint as a security-monitoring side project nobody asked for. Skip it.

### The tunnel option — not feasible without adding infrastructure

Sentry supports a `tunnel: '/some/path'` init option to route events through a same-origin server endpoint, avoiding both CORS preflight and ad-blocker filter lists (many ad blockers' EasyPrivacy list blocks `*.ingest.sentry.io` by domain). **This requires a server-side handler to receive and forward the envelope** — Sentry's own example implementation for non-Node runtimes is literally a serverless function. This project is "static-only with zero functions" (per the milestone's own framing of why Netlify Analytics doesn't apply) — adding a tunnel means standing up a Netlify Function or Edge Function specifically to proxy Sentry envelopes, which is new infrastructure this project does not currently have and the milestone does not scope. **Recommendation: skip the tunnel for now.** This is an internal procurement tool with a known, small user base (7 roles, invite-only) rather than a public site — the ad-blocker false-negative risk is real but low-priority; revisit only if measured event loss becomes a problem.

---

## Free-Tier Limits (Developer/free plan, verified 2026‑08‑11 against `sentry.io/pricing`)

| Limit | Value | Source confidence |
|-------|-------|--------------------|
| Errors/month | **5,000** | HIGH — quoted directly from pricing page, cross-checked by independent search aggregation |
| Data retention | **30 days** | HIGH |
| Team members / seats | **1 (one user)** | HIGH — page literally states "Limited to one user" |
| Tracing (spans) | 5M spans/month (irrelevant — not adopting Tracing) | HIGH |
| Session Replay | 50 replays/month (irrelevant — not adopting Replay) | HIGH |
| Logs | 5 GB/month (irrelevant unless Sentry Logs is later adopted) | HIGH |
| Attachments | 1 GB | MEDIUM |
| Overage / pay-as-you-go | **Not available on the free plan** — the pricing page's "additional events" purchase option is only referenced for paid (Team/Business) tiers | MEDIUM |
| Behavior at quota exhaustion | Once the monthly error quota is consumed, further events are **not accepted** for the rest of the billing cycle (per Sentry's quota docs: "Events and attachments that exceed your quota will not be accepted") — events are dropped, not queued or delayed | HIGH (general Sentry quota behavior; free-plan-specific overage wording is MEDIUM) |
| Spike Protection | A separate automatic safeguard: Sentry computes a baseline from recent traffic and starts dropping events if volume spikes anomalously above that baseline, specifically to prevent a bug-induced error storm from silently burning the whole month's quota in an hour | MEDIUM — confirmed the mechanism exists and its purpose from `docs.sentry.io/pricing/quotas/`, but the exact threshold formula is not published |

**Why this is load-bearing for the roadmap:** the app has **422 existing `console.error` call sites**. At 5,000 errors/month free-tier and only 30-day retention, a naive "pipe every `console.error` into `Sentry.captureException`" migration would very plausibly exhaust the monthly quota on day one if even a handful of sites fire per user session across the org's user base — and once exhausted, *all* further errors that month are silently dropped, including genuinely severe ones. This is precisely why the milestone's severity-tiering design (report / breadcrumb / console-only) is a hard requirement, not polish: only the "report" tier should call `captureException`; "breadcrumb" tier should call `Sentry.addBreadcrumb()` (breadcrumbs are stored *with* an event only when an event actually fires — they do not themselves consume the error quota); "console-only" tier stays exactly as `console.error`, consuming nothing.

**Also load-bearing:** the **one-seat limit**. This is a multi-role app (7 roles across 2 departments, several admin-tier users already in `firestore.rules`). If more than one human needs to log into the Sentry dashboard to triage errors, the free Developer plan cannot support that — either (a) share a single Sentry login across the people who need dashboard access (workable but a real access-control compromise for a financial/procurement system that already takes RBAC seriously), or (b) budget for the Team plan (**$26/mo billed annually**, includes 50,000 errors/month and more seats) once more than one triager is needed. This is a decision for the requirements author to make explicit, not something to leave implicit.

---

## Source Maps: Not Needed, and Here's Why

This app ships **unbundled, unminified, untranspiled** native ES modules — exactly the code that runs in the browser is the code in the repo, line-for-line.

Sentry's own "Enable Readable Stack Traces" documentation frames the *entire reason* source maps exist as: "When JavaScript code is bundled, minified, or transpiled for production, stack traces become unreadable because they reference the transformed output rather than the original source code. Source maps act as a bridge, allowing Sentry to map these minified locations back to the original lines of code." None of those three transformations (bundling, minification, transpilation) happen to this app's own code — only to the *third-party* CDN dependencies (Firebase, Chart.js, Frappe Gantt, Sentry itself), whose internals are not what this milestone needs to debug.

**Conclusion (MEDIUM confidence — this is a reasoned inference from official framing, not a sentence Sentry's docs state verbatim about zero-build apps specifically):** stack traces for this app's own `app/*.js` files will already point at readable, correctly-named, unmangled source lines with no source-map upload step. **Do not add `sentry-cli`, the Sentry Vite/webpack/Rollup plugin, or any source-map upload tooling** — there is no build step for it to hook into, and there is nothing to unminify. If a stack frame ever does need mapping (e.g., a future third-party CDN script throws into user code), that's an isolated case to handle manually, not a reason to add build-time tooling to an explicitly zero-build project.

### `release` and `environment` without a build step

Sentry's usual tooling for setting `release` (the CLI, framework build plugins, `SENTRY_RELEASE` env var auto-detection) all assume a build step exists to inject the value — none of that applies here. Two viable manual approaches, both compatible with zero-build:

1. **Manually bumped string constant (recommended, minimal).** A literal string in `app/sentry.js` (or a small `app/version.js` this project doesn't yet have), e.g. `release: 'clmc-procurement@2026.08.11'`, bumped by hand as part of any deploy-worthy commit. Zero tooling, consistent with this project's existing "no build, no CI" philosophy.
2. **Git-derived release stamped by a small Node script (optional, more precise).** This project already ships several standalone Node maintenance scripts (`scripts/backup.js`, `restore.js`, `verify-integrity.js`, `wipe.js`, `import.js`). A similar `scripts/stamp-release.js`, run manually before a deploy-worthy commit, could write the current short git SHA into a tiny `app/version.js` file (`export const RELEASE = 'a1b2c3d';`) for `app/sentry.js` to import. This is strictly optional polish, not required for the milestone to function — flag it as a nice-to-have, not a blocker.

`environment` is trivial and should directly reuse the exact pattern already in `app/firebase.js`:
```javascript
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
// ...
environment: isLocal ? 'development' : 'production'
```
This also means local development against `clmc-procurement-dev` naturally tags Sentry events as `development`, keeping dev noise out of the production error stream without any extra logic — the same dual-environment split this project already uses for Firebase project selection.

---

## What NOT to Add

| Sentry Feature | Why it's wrong for this project | What to do instead |
|-----------------|----------------------------------|----------------------|
| **Session Replay** (`replayIntegration()`, `bundle.*.replay.*.js`) | (1) Records DOM/screen playback of user sessions — in a procurement/financial app, that means supplier pricing, PO amounts, RFP invoice data, and possibly typed-but-not-yet-saved financial figures could be captured on screen even with masking enabled; masking is opt-out per-field and easy to under-configure. (2) Free tier is capped at 50 replays/month — negligible for an org-wide tool. (3) Adds ~91 KB gzip vs. ~35 KB for error-only, entirely for a feature that isn't wanted. (4) Uses a Web Worker for compression — extra CSP surface (`worker-src`) for zero benefit here. | Nothing — rely on `captureException` + breadcrumbs + `setUser` for "what happened," which is what this milestone actually asks for. |
| **Performance Monitoring / Tracing** (`browserTracingIntegration()`, `tracesSampleRate`) | This milestone is about *error* visibility, not performance profiling — scope creep against the stated goal ("make production failures visible, attributable, and diagnosable"). Also consumes a separate "spans" quota (5M/month free) and instruments every `fetch`/XHR call, meaningfully increasing background network chatter and event volume for no requirement this milestone lists. | Nothing — if a future milestone specifically wants performance monitoring, evaluate then, as its own scoped decision with its own sampling design. |
| **Profiling** | Even further scope creep beyond Tracing (requires Tracing as a prerequisite); not requested by any line item in this milestone; adds CPU overhead in the browser for benefit unrelated to "make failures visible." | Nothing. |
| **User Feedback widget** (`feedbackIntegration()`, `bundle.*.feedback.*.js`) | Sentry's built-in feedback widget is a *generic* crash-report popup — this milestone already specifies its own UX for this exact need: replacing `alert()` calls with `showToast()` carrying a correlation ID the user reads back to support. Adding Sentry's widget on top would be a second, inconsistent feedback mechanism the milestone didn't ask for. | The milestone's own correlation-ID toast pattern — tie the ID to the Sentry event ID (`Sentry.captureException()` returns the event ID) so support can search for it directly, without shipping Sentry's separate feedback UI. |
| **Logs / Metrics products** (`bundle.*.logs.metrics.*.js`) | A different Sentry product line (structured log aggregation), unrelated to this milestone's stack-trace/breadcrumb/severity-tiering goal; separate quota (5 GB/month free) that would be consumed by something out of scope. | Nothing — the app's existing `console.error`/`console.warn` tiering (with severity routing into Sentry only at the "report" tier) covers this need without a second product. |
| **`sendDefaultPii: true`** (init option) | This flips on automatic collection of things like inferred user IP address by default. In a system that already treats DLP/retention as a first-class concern (v4.0 shipped "DLP/retention" work), silently widening PII collection via a one-line config flag deserves an explicit decision, not a default left on by copy-pasting a tutorial snippet. | Leave it unset (defaults to `false`/off) unless a specific, deliberate requirement calls for IP capture; set `Sentry.setUser({ id, email, role, department })` explicitly instead — that's deliberate, scoped attribution, not a blanket PII toggle. |
| **`sentry-cli` / build-plugin source-map upload tooling** | See "Source Maps" section above — there's no build step for it to hook into, and stack traces are already readable. Installing `sentry-cli` would also be the first `npm`/build-tool dependency in a project that has explicitly stayed build-free since inception. | Nothing — verify readability empirically once the SDK is live (throw a test error, check the stack trace in the Sentry dashboard), and only revisit if a specific frame turns out unreadable. |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Option A: pinned CDN bundle `browser.sentry-cdn.com/10.70.0/bundle.min.js` | Option B: Loader Script `js.sentry-cdn.com/<key>.min.js` | If initial-page-load payload (~35 KB gzip) becomes a measured problem and the team is comfortable with Sentry-dashboard-managed (out-of-repo) version/feature toggles instead of repo-pinned ones |
| Option A | Option C: jsDelivr `+esm` bare import of `@sentry/browser` | Only if this project later adopts an actual bundler (breaking the zero-build constraint) — a bundler would tree-shake away the unused Replay/Feedback/Tracing code that Option C currently ships unconditionally |
| `bundle.min.js` (error-only) | `bundle.tracing.replay.min.js` or similar combined bundles | Never for this milestone — see "What NOT to Add" |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|------------------|-------|
| `browser.sentry-cdn.com/10.70.0/bundle.min.js` | Firebase JS SDK v10.7.1 (CDN), Chart.js v4.4.7 (CDN), Frappe Gantt v1.2.2 (CDN) | No interaction/conflict — Sentry's global `window.Sentry` doesn't collide with `window.db`, `window.Chart`, `window.Gantt`, or any of this project's existing window-exposed globals (checked names) |
| Core capture API (`init`, `captureException`, `setUser`, `addBreadcrumb`, `withScope`, `getCurrentScope`) | Stable v7 → v10 | Safe to write once against v10 semantics; do not copy class-based `Integrations.*` snippets from pre-v8 tutorials |

---

## Sources

- `/getsentry/sentry-docs` (Context7, via `ctx7` CLI) — CDN/loader install docs, CSP guidance, DSN/region format, tunnel option, source-map framing, release/environment options, bundle variant list
- `/getsentry/sentry-javascript` (Context7, via `ctx7` CLI) — core API surface (`captureException`, `withScope`, `getCurrentScope`, `globalHandlersIntegration`), `.size-limit.js` bundle-size ceilings
- https://docs.sentry.io/platforms/javascript/install/cdn/ — bundle variant matrix, confirmed no official jsDelivr/esm.sh mention (WebFetch, 2026‑08‑11)
- https://docs.sentry.io/platforms/javascript/install/loader/ — Loader lazy-load/queueing behavior, dashboard-managed version/bundle selection (WebFetch, 2026‑08‑11)
- https://docs.sentry.io/platforms/javascript/migration/v8-to-v9/ — breaking changes (WebFetch, 2026‑08‑11)
- https://sentry.io/pricing/ — Developer plan quota, retention, seats; Team plan price/quota (WebFetch, two independent passes, 2026‑08‑11)
- https://docs.sentry.io/pricing/quotas/ — quota-exhaustion and Spike Protection behavior (WebFetch, 2026‑08‑11)
- https://github.com/getsentry/sentry-javascript/releases — confirmed 10.70.0 latest stable, released 2026‑08‑10; 11.0.0-alpha.0 exists but is prerelease (WebFetch, 2026‑08‑11)
- Live CDN verification (curl, 2026‑08‑11): `https://browser.sentry-cdn.com/10.70.0/bundle.min.js` (200 OK, 90,586 bytes, computed SRI hash) and `https://cdn.jsdelivr.net/npm/@sentry/browser@10.70.0/+esm` (200 OK, confirmed transitive imports of `@sentry/feedback`/`@sentry/replay`)
- Project files read directly: `.planning/PROJECT.md`, `netlify.toml`, `_headers`, `index.html`, `app/firebase.js` — used to ground CSP diffs, delivery-mechanism recommendation, and naming conventions in this project's actual current state

---
*Stack research for: Sentry browser error tracking in a zero-build native-ESM static SPA*
*Researched: 2026-08-11*
