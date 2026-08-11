# Pitfalls Research: Retrofitting Error Tracking (Sentry) into an Existing Production SPA

**Domain:** Observability retrofit — adding Sentry browser SDK, a `reportError()` contract, and CSP changes to a live, zero-build, no-staging, revenue-adjacent procurement app (v4.3 Observability & Error Handling)
**Researched:** 2026-08-11
**Confidence:** HIGH for Sentry SDK mechanics (verified against current official docs, SDK v10.69.0 as of Aug 2026); MEDIUM for Netlify header-precedence claims (Netlify's own docs do not document precedence — this ambiguity is itself the finding); HIGH for this-repo-specific facts (verified against `netlify.toml`, `_headers`, `CLAUDE.md`, `.planning/PROJECT.md`)

## Critical Pitfalls

### Pitfall 1: Wiring all 422 `console.error` call sites straight into Sentry with default settings burns the free-tier quota in hours, not weeks

**What goes wrong:**
Sentry's browser SDK defaults to `sampleRate: 1.0` (100% of errors sent) and ships with empty `ignoreErrors`/`denyUrls` arrays — nothing is filtered out of the box. If the 422 `console.error` calls and 504 `catch` blocks are mechanically piped into `Sentry.captureException()` without a sampling/severity plan, every legitimate-but-frequent condition becomes a billable event. Two amplifiers specific to this app make it worse than a typical retrofit:
- This app has many `onSnapshot` real-time listeners across 41 files (per `CLAUDE.md`'s Firebase Listener Management pattern). A single bad Firestore rules deploy, a transient network blip, or the new Phase-113 read-scoping rules rejecting one common query means **every open browser tab, for every logged-in user, fires the same error simultaneously** — a multiplicative spike, not a linear one.
- Sentry's grouping into "issues" is a UI convenience only — **every individual event still counts against the event quota even when grouped into an existing issue.** Grouping does not save quota.

Sentry's server-side Spike Protection is enabled by default and will eventually start discarding events once a burst is detected, but it establishes its threshold reactively — a fast burst can consume a meaningful fraction of a free-tier monthly quota (commonly in the low thousands of events) before the dynamic rate limit engages. And if sustained high volume continues, it becomes Sentry's new accepted baseline, so a chronically noisy integration can silently keep eating quota indefinitely without ever tripping visible alarms.

**Why it happens:**
The mechanical urge, when converting hundreds of call sites, is to route them all through one wrapper first and "tune later." For a free-tier project, there usually isn't a "later" — the quota is exhausted before anyone notices, and the team is now flying blind (see Pitfall 8) for the rest of the billing period.

**How to avoid:**
- Before writing `reportError()`, produce a written triage table classifying representative samples of the 422 `console.error` sites and 504 `catch` blocks into the three tiers the milestone already names: **report** (Sentry event), **breadcrumb** (attached context, no event), **console-only** (dev-time noise, e.g. inside loops or polling). Do this classification as its own reviewed artifact before any mechanical edit.
- Set `sampleRate` explicitly at init (do not rely on the 1.0 default) and treat it as provisional — start conservative (e.g. 1.0 for `report`-tier only, since report-tier should already be a small, curated set; do not sample the initial rollout, sample only if volume proves problematic after real data is seen).
- Populate `ignoreErrors` and `denyUrls` at init time with the known-noisy patterns from Pitfall 4, not after the first quota exhaustion.
- Add a lightweight **client-side dedup/cooldown inside `reportError()` itself**: track a fingerprint (message + first stack frame) with a short in-memory cooldown (e.g., "same error, same session, max once per 60s") before calling `Sentry.captureException()`. This is defense-in-depth beyond server-side Spike Protection and directly defangs the multi-tab/multi-listener storm scenario above, which is specific to this app's `onSnapshot`-heavy architecture.
- Treat quota tuning as pre-launch work, not post-incident cleanup: exercise every major workflow (MRF submit → approve → PR → PO → RFP → payment) against the wired-up SDK in a low-traffic window and read the Sentry dashboard event count before declaring the rollout done.

**Warning signs:** Sentry's quota-usage graph showing a vertical spike right after deploy; the same issue title appearing with a 3-4 digit event count within the first hour; Spike Protection banner appearing in the Sentry project dashboard.

**Phase to address:** The phase that defines the `reportError()` contract and severity tiering (before the mechanical catch-block conversion phase). The triage table should be a reviewed deliverable of this phase, not folded into the conversion phase.

---

### Pitfall 2: Default Sentry breadcrumbs leak supplier names, amounts, and bank details into a third-party dashboard without anyone writing a single line of "capture" code

**What goes wrong:**
The Sentry browser SDK enables `console`, `dom`, `fetch`, `history`, and `xhr` breadcrumb integrations **by default** — none of this requires opt-in:
- The **console breadcrumb integration** records every `console.log`/`console.warn`/`console.error` call as a breadcrumb, including its arguments (objects are serialized up to a default `normalizeDepth`, not deep-truncated). This app has 422 `console.error` calls and an established `[Router]`/`[Procurement]`-prefixed debug-logging convention (`CLAUDE.md`) — many of these almost certainly log full objects (PR/PO/RFP documents, supplier records, bank-transfer details) for debugging. Every one of those becomes a breadcrumb attached to the *next* captured error, even if the log call itself was never near the failure. This is the single highest-likelihood PII/confidentiality leak in this retrofit, because it requires zero new code to trigger — it activates the moment the SDK is initialized.
- The **DOM breadcrumb integration** records click/keypress targets as a CSS-selector-style description. Risk is lower here (it does not capture `innerText` or form values by default), but if any DOM element's `id`/`class` is dynamically built from business data (e.g., an element id containing a PO id or supplier name), that value leaks into the breadcrumb trail.
- The **XHR/fetch breadcrumb integration** records method, URL, and status code — **not** request/response bodies by default. This is comparatively safe, but query-string parameters are part of the URL and would be captured if any code ever puts sensitive values in a query string (currently unlikely given this app's Firestore-SDK-mediated architecture, but worth a one-time audit of any raw `fetch()`/`XMLHttpRequest` calls in the 41 JS files).
- `sendDefaultPii` (still supported in SDK v10.x, deprecated in favor of the newer `dataCollection` object due for removal in v11) already **defaults to `false`**, meaning IP address and the broader PII categories it gates are *not* sent automatically — this is the one default that is already safe. It must not be flipped to `true` without a deliberate reason.

**Why it happens:**
Teams read "Sentry captures breadcrumbs to help debug" and assume this means generic navigation/click trail, not that it echoes their own `console.error(fullObjectDump)` calls verbatim into a third-party SaaS dashboard. The danger is proportional to how much this specific codebase already logs — and per the verified baseline, that's 422 call sites built up over 40+ shipped phases without an eye toward third-party export.

**How to avoid:**
- At SDK init, set a `beforeBreadcrumb` hook that inspects `breadcrumb.category === 'console'` and either strips/redacts the `breadcrumb.data.arguments` payload or drops console breadcrumbs entirely for `error`/`warn` levels (keep `log`/`debug` at most, since those are less likely to carry full financial objects — but audit this assumption against real call sites first, since this app's `console.error` calls are the ones most likely to dump full objects).
- Add a `beforeSend` hook as the last line of defense — scrub known-sensitive keys (`bank_account`, `bank_details`, `supplier_name`, `contact_person`, `email`, `total_amount`, `amount_requested`, `unit_cost`, etc., matched against this app's actual Firestore field names from `CLAUDE.md`'s schema) from `event.extra`, `event.breadcrumbs[].data`, and `event.contexts` before the event ever leaves the browser. `beforeSend`/`beforeBreadcrumb` run client-side — data scrubbed here never transmits, which is stronger than relying on Sentry's server-side "Data Scrubbing" project setting (belt-and-suspenders: configure both, but treat the client-side hook as mandatory and the server-side setting as backup for anything the hook misses).
- Explicitly decide and document what `Sentry.setUser()` carries for identity attribution (uid, email, role, department per the milestone's own spec) — this is *intentional*, reviewed PII, different in kind from the *incidental* PII risk above. Put role/department in `setTag`/`setContext` rather than cramming them into the `user` object, since tags are what's actually filterable/searchable in the dashboard.
- Do this scrubbing configuration in the *first* SDK-init commit, not as a follow-up hardening pass — every event sent before the scrub hook exists is unrecoverable once it's in Sentry (see Recovery Strategies).
- Do not enable Sentry Session Replay for this project. Replay defaults to `maskAllText: true` / `blockAllMedia: true` (which is the safe default and exists specifically because Replay is high-risk for sites with sensitive data), but Replay is a separate, replay-quota-consuming product this milestone doesn't call for — enabling it "for free" later without re-reviewing the masking config is exactly the kind of scope creep that reintroduces this pitfall. If a future milestone wants Replay, it needs its own PII review, not an inherited assumption that the error-tracking scrubbing already covers it.

**Warning signs:** Opening a captured event in the Sentry dashboard and finding a breadcrumb whose `data` contains a recognizable business object (supplier name, PO amount, bank fields) rather than a generic string; any breadcrumb category `console` with `arguments` containing more than a primitive.

**Phase to address:** The SDK init/configuration phase — `beforeSend`/`beforeBreadcrumb` scrubbing must ship in the same commit as `Sentry.init()`, before any real user traffic hits it. Verification: manually trigger a few of the app's most PII-dense flows (RFP bank-transfer entry, supplier creation) with breadcrumb capture on, inspect the resulting Sentry event, confirm no raw supplier/bank data appears.

---

### Pitfall 3: The two-file CSP hazard is worse than "remember to edit both files" — Netlify does not document which one wins when they disagree

**What goes wrong:**
`netlify.toml` and `_headers` currently define **identical** CSP strings (`script-src`, `connect-src`, etc.), each independently. Adding Sentry requires widening `script-src` (for the SDK bundle, if not reusing the already-allowed `cdn.jsdelivr.net` — see below) and `connect-src` (for the Sentry ingest endpoint) in **both** files. Netlify's own documentation does not state a precedence rule for what happens when a `netlify.toml` `[[headers]]` block and a `_headers` file both define headers for the same path — community sources directly contradict each other on this (some claim `_headers` wins, others claim `netlify.toml` wins), and Netlify's official docs explicitly recommend using only *one* of the two mechanisms specifically because the interaction is undefined. This repo already has both, with duplicated content — a latent hazard even before Sentry is added, and a specific trap for this milestone: **editing only the file that turns out not to be the one Netlify actually serves will look like a successful deploy and produce a CSP that still blocks Sentry**, discovered only by empirical inspection (see Pitfall 8's cousin below) rather than by reading a diff.
- A blocked `connect-src` does not throw a catchable JavaScript error the app can react to. The browser silently refuses the network request; Sentry's own transport swallows the resulting failure internally (by design, so a broken error reporter can't itself crash the app). The result: the app functions perfectly, no console error appears to a casual glance, and **zero events ever reach Sentry** — a silent total failure of the entire milestone's purpose that looks, from the outside, exactly like "no errors happened."

**Why it happens:**
The mismatch between "I edited the config" and "Netlify is serving the config I edited" is invisible without an explicit verification step, and this app's own documented failure mode (`CLAUDE.md`'s stale-ES-module gotcha) already trains developers here to expect *local dev server caching* as the likely culprit for "my change isn't taking effect" — but this is a different, production-only failure mode (Netlify's own header precedence, not browser caching) that the existing muscle memory doesn't cover.

**How to avoid:**
- Pick one file as the single source of truth for this milestone and either delete the CSP block from the other or keep the other as a byte-for-byte generated/mirrored copy with an explicit comment stating which file is authoritative and a note to update both together (until this ambiguity is resolved, treat "both files always identical" as the invariant, verified by a diff check before every CSP-touching commit).
- After every CSP-touching deploy, verify empirically which file actually won by inspecting the live response headers (`curl -I https://<site>/` or DevTools Network tab → Response Headers → `Content-Security-Policy`) and confirming the deployed CSP string matches the intended edit, not just "a plausible-looking CSP exists."
- Prefer widening `connect-src` with the Sentry ingest domain and, if not already covered, `script-src` — but check first: `cdn.jsdelivr.net` is **already** allow-listed in `script-src` in both files (used for Firebase and Chart.js), and jsDelivr mirrors npm packages, including `@sentry/browser`. Serving the Sentry bundle from `cdn.jsdelivr.net/npm/@sentry/browser@<pinned-version>/build/bundle.min.js` means **`script-src` may need no change at all** — only `connect-src` needs the new ingest domain (`https://o<org-id>.ingest.<region>.sentry.io` or a wildcard `https://*.ingest.<region>.sentry.io` per the DSN's region). This is the lowest-risk CSP change available and should be the default choice over Sentry's own auto-updating Loader Script (see Pitfall 7 for why auto-update is separately undesirable here).
- End-to-end verification (not just header inspection) is covered in Pitfall 8's mirror — see there for the concrete "canary error" procedure that must be run after every CSP deploy, not just the first one.

**Warning signs:** Sentry dashboard shows zero events despite known errors occurring in manual testing; DevTools Network tab shows the envelope POST to the ingest domain with status `(blocked:csp)` or the request never appears at all; `netlify.toml` and `_headers` CSP strings have diverged (diff is non-empty) after any change.

**Phase to address:** The CSP-widening work item explicitly named in the milestone. This must ship together with (not before, not after) the Sentry init commit, and the verification procedure (Pitfall 8) must run as an acceptance check for that same phase, on production, before the phase is considered done.

---

### Pitfall 4: Naive noise filtering either lets the quota-burning garbage through or blinds the system to the exact bug class this milestone exists to catch

**What goes wrong:**
A large fraction of what a browser-based error tracker sees is not "your bug": `ResizeObserver loop limit exceeded` (a browser performance-protection message, not an app error), errors originating from browser extensions (`chrome-extension://`, ad-blockers redefining globals like `googletag`, wallet extensions redefining `ethereum`/`solana`), offline/network-drop errors, `AbortError` from cancelled fetches/navigations, and — specific to this app, and specific to this exact moment in its history — **legitimate, by-design `permission-denied` errors from the Firestore rules Phase 113 just tightened.** Two failure modes are both live risks:
1. **Under-filtering:** none of the above is excluded, so every browser extension quirk and every intentional Phase-113 read-scoping rejection burns quota and clutters the dashboard until the signal-to-noise ratio is so bad nobody opens it (feeds directly into Pitfall 8).
2. **Over-filtering — the more dangerous failure for this milestone specifically:** the reflexive fix for (1) is to blanket-ignore `permission-denied`/`PERMISSION_DENIED` messages via `ignoreErrors`. This is exactly wrong. Phase 113's root cause *was* a swallowed `PERMISSION_DENIED`. If this milestone's own noise-reduction work adds a blanket filter for that exact error string, it recreates the invisibility this milestone was funded to eliminate — just one layer up the stack.

**Why it happens:** "Permission denied" sounds uniformly like noise once you know some of it is expected-by-design. But not all `permission-denied` events are equivalent: a **read** rejected by scoping rules during normal use (e.g., a department user's listener touching a doc outside their assignment) is expected and low-value; a **write** rejected by security rules is categorically different — a correctly gated UI should never let a user attempt a write their role doesn't permit, so a write-permission-denied reaching Firestore at all is *by definition* evidence of a client-side authorization bug (a missing UI guard, a stale permission cache, exactly Phase 113's shape). Collapsing these into one filterable string throws away the distinction that matters.

**How to avoid:**
- Do not filter `permission-denied` at the SDK level (`ignoreErrors`) at all. Instead, tag every Firestore error at the `reportError()` call site with structured context: operation type (`read`/`write`), collection, and the acting user's role — this is cheap to add since the wrapper already has access to the user/role from the identity-attribution work, and it turns "permission-denied" from an undifferentiated noise category into a filterable, queryable dimension inside Sentry (via tags), not a blind spot.
- Set severity by call-site classification, not by error string: write-path `permission-denied` → `report` tier (this is the Phase-113 class, always worth seeing); read-path `permission-denied` on a listener → `breadcrumb` or low-severity `report` tier (expected under normal scoped operation, but still worth being visible at low volume in case scoping itself has a bug).
- For genuinely environmental noise, use the documented, narrow patterns rather than broad ones: `ignoreErrors: ['ResizeObserver loop limit exceeded', /^Non-Error promise rejection captured/]`; enable Sentry's built-in "Filter out errors known to be caused by browser extensions" inbound filter (server-side, in Project Settings) plus `denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//]`; explicitly test that `AbortError` from intentional fetch cancellations (if any exist in this app) and offline-detection errors are excluded only when they're truly benign — verify each pattern against a real captured example before adding it, not by copying a generic list wholesale (a copied "Script error." blanket ignore, for instance, can also hide real cross-origin script failures — Sentry's own guidance is to add these cautiously, one at a time, only after confirming they're non-actionable).
- Revisit this filter list after the first real week of production data — noise patterns discovered empirically (specific to this app's actual browser/extension mix among its users) will differ from any generic list assembled up front.

**Warning signs:** Dashboard event volume dominated by a single `permission-denied` issue with no distinguishing tags; anyone proposing `ignoreErrors: ['permission-denied']` or similar as a quota fix; zero `permission-denied` write-path events ever appearing despite known cross-department UI gaps still existing elsewhere in the app.

**Phase to address:** Same phase as the `reportError()` contract design (tagging must be built into the wrapper from the start) plus the phase that does the Firestore-rules-tightening verification — this pitfall is the direct link between v4.1 (Phase 113) and v4.3, and should be called out as an explicit acceptance criterion: "a write blocked by Firestore rules always reaches Sentry at report-tier, tagged with collection/operation/role."

---

### Pitfall 5: Sentry's own default global handlers plus a hand-rolled `window.onerror`/`unhandledrejection`, plus report-then-rethrow inside converted catch blocks, produces duplicate events for the same failure

**What goes wrong:**
The Sentry browser SDK's `globalHandlersIntegration` is **enabled by default** and already installs its own `window.onerror` and `unhandledrejection` listeners, automatically capturing every uncaught exception and unhandled rejection without any custom code. The milestone's own description calls for adding custom `window.onerror` + `unhandledrejection` handlers because "the app currently has neither" — but once Sentry is initialized, the app *does* have global capture, via the SDK. Layering a second, hand-written pair of handlers on top risks:
- Both handlers firing for the same uncaught error, each calling `Sentry.captureException()` (or one calling it while the SDK's own default handler *also* fires) → two separate events for one real failure, doubling apparent volume and quota cost, and confusing anyone reading the dashboard about how often something actually happens.
- The specific pattern this app's conversion work will produce at scale: `catch (e) { reportError(e); throw e; }` — reporting locally, then re-throwing so the error propagates. If it propagates to become an uncaught exception, the SDK's default global handler captures it *again* as a second, separate event (this is a documented, recurring class of Sentry GitHub/forum issue across multiple frameworks — the pattern is well known, not this app's own invention).

**Why it happens:** The milestone description was written against "the app has zero global handlers today" (true), without yet accounting for the fact that installing Sentry *is itself* the global-handler installation. The design intent (custom handlers for app-specific UX, e.g. showing a toast with a correlation ID) is legitimate — but it needs a decision about which layer owns "call Sentry," not two layers both claiming it.

**How to avoid:**
- Decide, once, which single layer is responsible for calling `Sentry.captureException()` for any given error and write it down as a convention (this is the "Convention guardrail" deliverable): recommended shape is that the SDK's default `globalHandlersIntegration` remains the sole source of truth for *uncaught* errors and rejections (nothing custom needed there beyond configuration, e.g. `Sentry.init({ integrations: [Sentry.globalHandlersIntegration({ onerror: true, onunhandledrejection: true })] })` if defaults ever need overriding); any *custom* `window.onerror`/`unhandledrejection` code the milestone adds should be for **UX only** (showing the correlation-ID toast, reading `event.event_id` from the currently-processing Sentry event via `Sentry.lastEventId()` or a `beforeSend` callback that stashes the id) — it must never itself call `captureException` a second time for the same error.
- Establish the report-vs-rethrow rule per `catch` site as part of the triage in Pitfall 1: a site either (a) fully handles+reports the error locally and does **not** rethrow (this is the terminal report), or (b) does not call `reportError()` at all and lets the error propagate to be caught once by the global handler. Never both. Bake this into the `reportError()` wrapper's contract/docstring so future developers don't reintroduce the split.
- Verify with a real test after building the wrapper: deliberately throw an uncaught error in a test build, confirm exactly one Sentry issue/event is created, not two.

**Warning signs:** Sentry issue detail page showing two events with identical stack traces and near-identical timestamps (milliseconds apart) for what was a single real occurrence; event count for a known-rare error unexpectedly at 2x actual occurrence count.

**Phase to address:** The `reportError()` contract + global-capture phase — this is a design decision, not a bug to catch later, and should be resolved before any catch-block conversion begins (Pitfall 6 depends on this rule already being settled).

---

### Pitfall 6: Mechanically converting 500+ catch blocks in one pass changes behavior in ways no one will catch, because there is no automated test suite for application logic

**What goes wrong:**
This codebase's only automated tests are Firestore security-rules tests (`firebase emulators:exec ... test/firestore.test.js`) — they verify *permission* behavior, not *application* behavior, and don't touch the view-layer `catch` blocks at all. Converting 504 `catch` blocks and 57 fire-and-forget `.catch()` tails to route through `reportError()` is not a pure find-and-replace: each site currently encodes an implicit decision (silently continue vs. surface to the user vs. let a listener re-subscribe vs. abandon a form submission), and a mechanical conversion risks:
- **Swallowing becoming crashing:** a `catch` block that used to log-and-continue, converted to `reportError(e); throw e;` per a copy-pasted "best practice" pattern, now propagates and can produce an unhandled rejection or break a UI flow that previously degraded gracefully (e.g., a background sync failure that used to just retry silently on next `onSnapshot` tick).
- **Crashing becoming (invisibly) swallowing:** the inverse — a site that intentionally let an error bubble to alert the user via existing `alert()`/`confirm()` flows gets wrapped in a `try/catch` that now reports-and-swallows, silently removing a user-facing failure signal that was previously (crudely) working.
- **Reviewer fatigue on an unreviewable diff:** 500+ near-identical edits across 41 files, if delivered as one or a few giant PRs, will be rubber-stamped after the first few dozen — exactly the sites where the pattern *doesn't* mechanically apply (the ones needing judgment) are the ones most likely to be missed by a fatigued reviewer skimming a huge diff.
- **No regression safety net + production-only:** any behavior change introduced by the conversion is discoverable only by manual browser testing against live Firebase, after deploy — there is no CI, no staging, and no automated coverage of the affected code paths.

**Why it happens:** 500+ instances is a strong pull toward automation (a codemod, a scripted regex replace) because manual review of each site individually feels disproportionate to the "just add reportError()" nature of the change. But the actual risk isn't in adding the call — it's in the report-vs-swallow-vs-rethrow decision each site implicitly makes, which a mechanical script cannot infer from the code alone.

**How to avoid:**
- Sequence as two distinct phases, not one: (1) **audit and classify** every catch/`.catch()` site (already implied by the milestone's "Silent-swallow elimination — audit the 57 fire-and-forget `.catch()` tails" bullet — make this its own reviewed deliverable, e.g. a spreadsheet or markdown table of site → current behavior → target tier → rethrow decision), then (2) **convert**, mechanically, guided by the completed classification — the mechanical part becomes low-risk once the judgment calls are already made and reviewed.
- Batch the conversion phase by file/module, one file (or a small related cluster) per plan/PR, sized for actual review (this project's own `procurement.js` at 3,761 lines / 44 functions and `finance.js` at 1,077 lines are each large enough to warrant their own pass, not being lumped into a single cross-file mega-diff).
- Sequence risk-ascending: convert low-traffic, low-consequence views first (e.g., read-only analytics/history views) to prove the pattern is safe, and defer the highest-traffic financial-write paths (PO creation, RFP/payment recording, PR approval — the paths that touch money) to last, once the `reportError()` contract has already survived contact with real production traffic elsewhere.
- Because there's no automated regression suite for this layer, attach a short manual smoke-test checklist to each conversion batch (e.g., for a finance.js batch: approve a PR, reject a PR, create a PO, record a partial payment, void a payment) and actually run it against production before/after, given there's no staging to run it against instead.
- Treat any catch site whose current behavior is ambiguous or undocumented as its own review flag rather than defaulting it into the mechanical pattern — "unsure" should route to a person, not to a default choice.

**Warning signs:** A PR touching 100+ files in one diff; a reviewer approving within minutes of a diff that size; post-deploy reports of a workflow silently failing (or newly throwing) that worked identically before the conversion; git blame showing the exact commit that flipped a swallow to a throw (or vice versa) without a corresponding manual test note.

**Phase to address:** Split into an explicit **audit phase** (classification artifact, reviewed) followed by a **conversion phase** (mechanical execution against the classification, batched per file/module, sequenced risk-ascending). Do not collapse these into one phase — the milestone description already gestures at this by calling the audit out separately; the roadmap should preserve that separation as two distinct phases/plans rather than one.

---

### Pitfall 7: Deploying observability changes with no staging environment means a broken Sentry init can take down the very app it's supposed to be watching

**What goes wrong:**
Firebase is production-only; Netlify deploys directly on push; `_headers`/`netlify.toml` set `Cache-Control: no-cache, must-revalidate` on HTML and `public, max-age=0, must-revalidate` on JS/CSS, meaning **every user gets the new code within seconds of deploy, with no canary or percentage rollout** available on Netlify's static hosting for this project as configured. Two failure shapes are specific to this app's architecture:
- This is a native-ESM app with a documented, sharp failure mode (per `CLAUDE.md`): if a module's export surface changes and a stale copy is served, every importer fails to link and the app hangs at "Loading application..." with an **empty console**. A Sentry init script that throws synchronously during its own load (bad DSN string, a typo in `Sentry.init({...})` config, an SDK version mismatch between a pinned bundle and API usage) can produce an equivalent silent-hang failure mode for every single user simultaneously, and — grimly — **the error tracker cannot report on its own failure to initialize.**
- Sentry's Loader Script (Sentry's own recommended "no build system" install path) is explicitly designed to **auto-update to the latest SDK version on Sentry's CDN** without any commit or deploy on this app's side. For a codebase with zero CI and zero automated tests, an upstream SDK auto-update landing on a random future day — potentially changing default breadcrumb/PII behavior, or introducing a breaking API change — is an uncontrolled, undeployed change to a live app that nobody in this project would notice happened. This directly conflicts with the rest of this codebase's convention of pinning CDN dependency versions explicitly (Firebase is pinned at v10.7.1; Chart.js is pinned at v4.4.7).

**Why it happens:** "No build step" pushes teams toward Sentry's Loader Script because it's marketed as the easiest zero-build install path — but "easiest" here trades away the version-pinning discipline this specific codebase already practices everywhere else, for reasons (auto-update convenience) that don't actually apply to a team with no CI to catch a bad auto-update.

**How to avoid:**
- Do not use the Loader Script. Use a version-pinned CDN bundle URL instead (either Sentry's own `https://browser.sentry-cdn.com/<exact-version>/bundle.min.js` or, preferably, `cdn.jsdelivr.net/npm/@sentry/browser@<exact-version>/build/bundle.min.js` to reuse the already-CSP-allowed jsDelivr origin per Pitfall 3), matching this repo's existing convention for Firebase/Chart.js. Upgrading becomes a deliberate, reviewed, git-tracked version bump — exactly like every other CDN dependency in this app.
- Wrap the `Sentry.init()` call itself in a defensive `try/catch` and ensure it runs **after**, or independently of, the app's own module bootstrap sequence — a failure to initialize Sentry must never be able to block or throw synchronously into the app's own critical load path. The observability layer must be strictly additive and fail-open (app works with or without Sentry successfully loading).
- Roll out in stages of blast radius, not features: ship Sentry capture-only first (SDK init, global handlers, CSP) and confirm it survives a full day of production traffic without incident before layering on the `reportError()` contract's UX changes (toasts, correlation IDs) — a config-only rollback (revert `netlify.toml`/`_headers`/the init script) is much cheaper to reason about than rolling back a rollout that also changed user-facing error UX across dozens of files.
- Check whether this repo has Netlify Deploy Previews enabled for pull requests (verify in Netlify site settings — not confirmed during this research). If enabled, a PR-triggered preview URL is the closest thing to a staging environment this stack offers: it runs against the same production Firebase project (so it isn't a full staging environment — writes are still live) but at least lets the CSP/Sentry-init wiring be exercised on an isolated URL before merging to `main` and going fully live to all users. If not enabled, this is worth turning on before this milestone starts, given it's the cheapest risk-reduction available for a no-staging stack.
- Deploy CSP/init changes during a low-usage window, and have the revert (a plain `git revert` of the CSP + init commit) rehearsed and ready, not improvised.

**Warning signs:** App reports of "stuck on Loading application..." coinciding with a Sentry-related deploy; Sentry SDK version silently differing from what's recorded in any documentation/commit; a Sentry dashboard "SDK version" field that doesn't match what was last deployed.

**Phase to address:** The initial SDK bring-up phase (bundle choice + defensive init) and, separately, a rollout/verification phase that explicitly sequences capture-only before UX changes. Netlify Deploy Preview availability should be checked at milestone kickoff, not discovered mid-phase.

---

### Pitfall 8: The system can be "done" by every checklist item and still miss the next Phase-113-class bug — because the failure mode is a swallow, and a swallow that reaches the reporter is not the swallow that matters

**What goes wrong:**
Phase 113's actual root cause was an error that never reached any reporter at all — a fire-and-forget `.catch()` with an empty or console-only body. This milestone's entire premise is to make that class of failure visible. But "we installed Sentry and converted the catch blocks" can still fail to prevent a recurrence in several concrete ways:
- A catch site simply **missed** by the audit (Pitfall 6) — with 504+57 sites, 100% coverage is not guaranteed by a first pass, and there's no automated way in this codebase to verify every catch block routes through `reportError()` (no linter, no build step to enforce it).
- **New code written after this milestone ships** reintroduces a bare `catch (e) { console.error(e); }` or a fire-and-forget `.catch()` because the only enforcement is a documented convention in `CLAUDE.md` — a convention is necessary but not sufficient; this exact codebase already had implicit conventions before (three prior "quick fixes" to earlier layers of the Phase 113 saga each patched their own layer without anyone noticing the write-layer swallow, which is itself evidence that "know the convention" doesn't reliably prevent the failure).
- An error **is** reported, but at a severity/tier nobody actually looks at — e.g., everything defaults to `breadcrumb`-only to protect quota (overcorrecting from Pitfall 1), so real bugs generate no alert and sit unopened in a dashboard nobody has a habit of checking. "Reported" and "seen" are different milestones; only the second one actually prevents a recurrence.
- The reporter itself throws or silently no-ops — e.g., `reportError()` is called before the SDK has finished loading (race condition on the CDN script), or the CSP hasn't propagated yet (Pitfall 3), and the wrapper's own internal error is uncaught inside a `catch` block that was supposed to be the safety net. If `reportError()` isn't defensively written (its own internals wrapped so it can never throw), this reintroduces exactly the "error inside the error handler" failure this milestone is meant to eliminate, one layer deeper.

**Why it happens:** Building the reporting *pipe* is necessary but is a different problem from guaranteeing *coverage* (every failure path actually uses the pipe) and *attention* (a reported error actually gets looked at by a human in a reasonable time). Teams that ship the pipe and stop there have shipped infrastructure, not the outcome ("a broken workflow should surface... instead of dying silently") the milestone's own goal statement names.

**How to avoid:**
- Make `reportError()` itself provably safe: wrap its own internals in a `try/catch` that can never propagate, and have it fall back to `console.error` (today's baseline, not worse) if the Sentry SDK isn't ready or the send fails — the reporting wrapper must degrade no worse than doing nothing, never worse than the code it replaced.
- After the milestone's core work ships, run a **direct regression check for the Phase 113 bug class specifically**, not a generic smoke test: deliberately exercise a cross-department write that the tightened Phase 113 rules should reject, through the actual production UI/code path (not a synthetic `Sentry.captureException(new Error('test'))`), and confirm (a) it produces exactly one Sentry event, (b) at report-tier, (c) tagged with enough context (uid, role, department, collection, operation) to diagnose without reproducing, (d) not silently absorbed by any noise filter from Pitfall 4. This is the acceptance test that actually validates the milestone's premise, not just its plumbing.
- Enforce the convention with something stronger than documentation where the zero-build/no-CI constraint allows it: a small standalone Node script (in the spirit of this repo's existing `backup.js`/`restore.js`/`verify-integrity.js` scripts) that greps the codebase for bare `catch` blocks whose only statement is a `console.*` call, or `.catch()` tails not referencing `reportError`, run manually as a periodic or pre-commit check — not build-blocking (there's no build), but at least a repeatable, non-memory-dependent check rather than relying on every future contributor recalling a `CLAUDE.md` paragraph.
- Set up at least one Sentry Alert Rule (e.g., "new issue" or "issue seen by N users") — alert notifications don't consume event quota, so this is safe to enable liberally even on a free tier, and it converts "an event exists in a dashboard nobody opens" into "someone gets pinged." Without this, severity tiering is cosmetic.

**Warning signs:** A future incident post-mortem finding the failing code path had a `catch` block added in this milestone's conversion pass that either wasn't wired to `reportError()` or was wired but tiered to `console-only`; the Sentry dashboard's "last seen" issue list going stale (no new issues) despite known bugs occurring in the wild, suggesting the pipe stopped flowing somewhere; anyone describing the milestone as "done" purely because the SDK is installed and 504 catch blocks were touched, without having run the write-permission regression check above.

**Phase to address:** A final verification phase, explicit and separate from the mechanical conversion work — its acceptance criterion should be the Phase-113-class regression check above, run in production, with the resulting Sentry event screenshotted/linked as evidence in the phase's verification artifact.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Route all 422 `console.error` sites to `report` tier without triage | Fast, "complete" conversion | Quota exhaustion within hours; real signal buried | Never — triage-first is mandatory per Pitfall 1 |
| Use Sentry's auto-updating Loader Script instead of a pinned CDN bundle | Slightly simpler install snippet | Uncontrolled, undeployed SDK behavior changes on a live app with no CI to catch regressions | Never for this repo — breaks its own version-pinning convention |
| Blanket `ignoreErrors: ['permission-denied']` to cut noise | Immediate quota relief, cleaner dashboard | Recreates the exact invisibility Phase 113 exposed | Never — tag/tier by read-vs-write instead (Pitfall 4) |
| One giant PR converting all catch blocks | Feels efficient, "gets it over with" | Unreviewable diff, missed judgment calls, no regression net | Never at this scale — batch per file/module, risk-ascending |
| Skip `beforeSend`/`beforeBreadcrumb` scrubbing at first launch, "add it later" | Faster initial ship | Events already sent to Sentry before the scrub existed are unrecoverable (see Recovery Strategies) | Never — must ship in the same commit as `Sentry.init()` |
| Defer the Phase-113-class regression check to "whenever we notice a similar bug again" | Milestone can be called done sooner | The system's core justification (would this have caught Phase 113?) is never actually validated | Never — this is the milestone's own acceptance test |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Sentry CDN script | Adding a brand-new CDN domain to `script-src` when jsDelivr is already allow-listed | Serve the Sentry bundle from `cdn.jsdelivr.net/npm/@sentry/browser@<pinned>/...` — no `script-src` change needed, only `connect-src` |
| Sentry ingest endpoint | Guessing the ingest domain or hardcoding a specific org subdomain that changes if the DSN/org changes | Use the exact domain from the DSN's region (`https://o<org>.ingest.<region>.sentry.io`), or a scoped wildcard, added to `connect-src` in whichever file is verified authoritative (Pitfall 3) |
| `netlify.toml` + `_headers` both present | Assuming both are additive/merged, or assuming the more-recently-edited one wins | Treat as undefined per Netlify's own docs; consolidate to one authoritative file, or keep both mechanically identical and verify the live response header after every change |
| Sentry `Sentry.setUser()` | Cramming role/department into the `user` object where it isn't filterable the same way | Use `setUser({id, email})` for identity, `setTag`/`setContext` for role/department/collection/operation |
| Firestore + Sentry breadcrumbs | Assuming XHR/fetch breadcrumbs are risk-free because bodies aren't captured by default | Still audit any raw `fetch()`/`XMLHttpRequest` calls in the 41 JS files for sensitive data in URLs/query strings, since URLs *are* captured |
| Sentry global handlers + custom handlers | Installing custom `window.onerror`/`unhandledrejection` alongside Sentry's own default `globalHandlersIntegration`, both calling `captureException` | Let Sentry's default handler own uncaught-error capture; custom handlers should be UX-only (toast/correlation-ID display), never a second `captureException` call |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Every `onSnapshot` listener across 41 files reporting independently on a shared Firestore failure | A single bad rules deploy or transient outage produces one Sentry event per open tab per listener, simultaneously | Client-side fingerprint+cooldown dedup inside `reportError()` (Pitfall 1); tag by collection/operation so the flood is at least diagnosable, not just voluminous | Any moment multiple users are active simultaneously and a shared read path breaks — i.e., any normal business day, not a hypothetical high-scale future |
| Relying solely on server-side Spike Protection to cap quota damage | Quota consumed before the dynamic rate limit engages; events dropped during the following rate-limited window include real, useful errors, not just the flood | Client-side sampling/cooldown as a first line of defense; Spike Protection as backup, not primary control | The very incident this milestone is meant to make visible could be dropped during its own rate-limit window — a bad night for both the incident and the observability layer |
| Sentry issue "grouping" mistaken for quota reduction | Dashboard looks tidy (few issues) while the underlying event count (and bill) is unaffected | Understand grouping is a UI/triage convenience only; every event still counts toward quota regardless of grouping | Immediately — this is true from day one, not a scale threshold |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Shipping `Sentry.init()` without `beforeSend`/`beforeBreadcrumb` scrubbing configured | Supplier names, PO amounts, bank-transfer details from console-breadcrumb echoes of this app's own debug logs land in a third-party SaaS dashboard | Scrub hooks must ship in the same commit as init, before any real traffic (Pitfall 2) |
| Enabling Sentry Session Replay "since it's already installed" | Screen-recording-adjacent capture of financial UI, even with default masking, is a scope and risk expansion this milestone didn't review | Do not enable Replay under this milestone; treat as a separately-scoped future decision requiring its own PII review |
| Setting `sendDefaultPii: true` (or all `dataCollection` categories on) to "get more debugging context" | Auto-collects IP addresses and broader PII categories beyond what's needed for staff identity attribution | Leave at default `false`; use deliberate `setUser`/`setTag` calls instead of a blanket PII toggle |
| Treating `permission-denied` as safe-to-blanket-ignore now that some of it is expected-by-design | Recreates Phase 113's invisibility one layer up (Pitfall 4) | Tag and tier by read-vs-write and role, never string-match-ignore the whole category |
| Assuming CSP is "done" once one of the two files is edited | Silent total reporting failure that looks identical to "no errors happened" (Pitfall 3) | Verify live response headers after every CSP-touching deploy; run the end-to-end canary check (Pitfall 8) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Replacing `alert()` with a toast that auto-dismisses before the user can read/copy the correlation ID | User can't actually report the error back to anyone, defeating the stated purpose of the correlation ID | Make the correlation ID persistent (not auto-dismissed) or give it an explicit copy action, since this app has no ticketing system — whoever "supports" users needs the ID to actually be usable |
| Surfacing raw Firestore/Sentry technical error text in the user-facing toast (e.g., raw `PERMISSION_DENIED` gRPC message) | Confusing/unprofessional for non-technical procurement/finance staff, and potentially reveals internal structure | Map internal error codes to a small set of friendly messages in `reportError()`'s UI layer; keep the raw detail in the Sentry event, not the toast |
| Assuming "correlation ID shown to user" is sufficient without confirming someone can actually search Sentry by it | The ID is decorative if no one knows to search Sentry's event-id field with it, or if event retention has expired by the time it's reported | Verify the correlation ID (Sentry `event_id`) is directly searchable in the Sentry UI, and document the lookup step wherever "who handles support" is documented for this small team |

## "Looks Done But Isn't" Checklist

- [ ] **SDK installed and `Sentry.init()` called:** Often missing `beforeSend`/`beforeBreadcrumb` scrubbing — verify by triggering a PII-dense flow (RFP bank-transfer entry) and inspecting the captured event/breadcrumbs in the dashboard for raw supplier/bank data.
- [ ] **CSP widened for Sentry:** Often edited in only one of `netlify.toml`/`_headers` — verify by inspecting live production response headers (not just the committed file) after deploy.
- [ ] **`reportError()` contract shipped and catch blocks converted:** Often missing coverage on a subset of the 504+57 sites, or missing the report-vs-rethrow decision at each site — verify by grepping post-conversion for any remaining bare `console.error`-only catch blocks or unconverted fire-and-forget `.catch()` tails.
- [ ] **Noise filtering configured:** Often either absent (quota burns) or over-broad (blanket-ignores `permission-denied`, hiding the Phase-113 bug class) — verify by confirming a deliberate write-permission-denied test event still reaches the dashboard while `ResizeObserver`/extension noise does not.
- [ ] **Global error capture "added":** Often duplicated against Sentry's own default `globalHandlersIntegration` — verify by triggering one uncaught error and confirming exactly one Sentry event is created, not two.
- [ ] **"Reporting works" claimed:** Often verified only by "the dashboard shows some events" without confirming the Phase-113-specific regression scenario (a rejected cross-department write) is one of them, tagged with enough context to diagnose without reproducing.
- [ ] **User-facing error UX shipped:** Often the correlation ID is technically present but not persistent/copyable, or not actually searchable by whoever handles support — verify by walking through the full loop: user hits error → reads/copies ID → someone looks it up in Sentry → finds the matching event.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|-----------------|
| PII/confidential data already sent to Sentry before scrubbing was configured | MEDIUM | Configure `beforeSend`/`beforeBreadcrumb` scrubbing immediately going forward (stops the bleeding); use Sentry's project-level data-scrubbing/PII settings to redact matching patterns in already-stored events where possible; for anything highly sensitive already transmitted (e.g., bank details), treat as a disclosure event requiring the org's own incident process, not just a config fix — client-side scrubbing cannot retroactively un-send data already in Sentry's systems |
| Quota exhausted mid-month from an unfiltered rollout | LOW–MEDIUM | Add `ignoreErrors`/`denyUrls`/sampling immediately; wait out the remainder of the billing period with reduced visibility, or evaluate a quota top-up if the free tier resets on a schedule incompatible with the urgency; treat the exhaustion itself as the signal to do the triage that should have preceded launch |
| CSP silently blocking all Sentry ingest for some period post-deploy | LOW | Fix the CSP file(s), verify live headers, and accept that any errors during the blocked window are permanently unrecoverable (no retroactive capture) — this is why the end-to-end canary check must run immediately after every CSP-touching deploy, not discovered days later |
| Duplicate events from handler-conflict or report-then-rethrow discovered post-launch | LOW | Fix the wrapper/convention (Pitfall 5), and optionally use Sentry's issue-merge feature to collapse historical duplicates for readability — doesn't recover quota already spent on the duplicates |
| A catch site missed by the audit is later found to have swallowed a real incident | MEDIUM | Treat as a mini version of the Phase 113 post-mortem: fix the specific site, then re-run the grep-based convention check (Pitfall 8) across the whole codebase rather than assuming it was an isolated miss |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|---------------|
| 1. Quota blowout from unsampled retrofit | `reportError()` contract / severity-tiering phase | Sentry quota-usage graph checked after first full day of production traffic; triage table exists as a reviewed artifact before conversion begins |
| 2. PII/breadcrumb leakage | SDK init/config phase | Manually trigger PII-dense flows (RFP bank entry, supplier creation) post-init, inspect captured event/breadcrumbs for raw sensitive fields |
| 3. CSP two-file sync hazard | CSP-widening phase (same phase as SDK init) | Live production response headers inspected post-deploy; both files diffed to confirm they match the intended change |
| 4. Noise filtering vs. Phase-113 blind spot | `reportError()` contract phase + Firestore-rules verification | Deliberate write-permission-denied test reaches dashboard at report-tier with role/collection/operation tags; `ResizeObserver`/extension noise does not appear |
| 5. Double-reporting / handler conflicts | `reportError()` contract / global-capture phase | Trigger one uncaught error, confirm exactly one Sentry event |
| 6. Mass mechanical catch-block conversion | Split into audit phase (classification artifact) + conversion phase (batched, risk-ascending) | Per-batch manual smoke test against production; no single PR exceeds a reviewable size |
| 7. No-staging rollout hazard | SDK bring-up phase (pinned bundle, defensive init) + rollout/verification phase | Capture-only rollout survives a full day before UX changes ship; Netlify Deploy Preview availability checked at kickoff |
| 8. Recurrence of the swallowed-error failure mode | Final verification phase | Phase-113-class regression check run in production (real rejected cross-department write reaches Sentry, tagged, at report-tier); at least one Sentry Alert Rule configured |

## Sources

**Official Sentry documentation (HIGH confidence):**
- [Configuration Options](https://docs.sentry.io/platforms/javascript/configuration/options/) — `sendDefaultPii` (deprecated toward `dataCollection`), `beforeSend`, `beforeBreadcrumb`, `sampleRate`, `ignoreErrors`, `denyUrls`, `allowUrls`, `maxBreadcrumbs`, `tracesSampleRate`
- [Sensitive Data / Data Scrubbing](https://docs.sentry.io/platforms/javascript/data-management/sensitive-data/) — client-side vs. server-side scrubbing, `beforeSend`/`beforeBreadcrumb` as the client-side mechanism
- [Breadcrumbs Integration](https://docs.sentry.io/platforms/javascript/configuration/integrations/breadcrumbs/) — confirms `console`, `dom`, `fetch`, `history`, `xhr` are all default-on
- [GlobalHandlers Integration](https://docs.sentry.io/platforms/javascript/configuration/integrations/globalhandlers/) — confirms `onerror`/`onunhandledrejection` capture is enabled by default
- [InboundFilters Integration](https://docs.sentry.io/platforms/javascript/configuration/integrations/inboundfilters/) — default "Script error." filtering, `ignoreErrors` mechanics
- [Spike Protection](https://docs.sentry.io/pricing/quotas/spike-protection/) — enabled by default, threshold-reactive, sustained volume becomes new baseline
- [Loader Script](https://docs.sentry.io/platforms/javascript/install/loader/) and [CDN bundles](https://docs.sentry.io/platforms/javascript/install/cdn) — auto-update behavior of the Loader Script vs. pinned CDN bundle URLs
- [Session Replay Privacy](https://docs.sentry.io/platforms/javascript/session-replay/privacy/) — `maskAllText`/`blockAllMedia` default to `true`; explicit warning against disabling on sites with sensitive data
- [Security Policy Reporting](https://docs.sentry.io/platforms/javascript/guides/connect/security-policy-reporting/) — Sentry ingest domain must be in `connect-src`/`default-src`
- [Netlify: Custom headers](https://docs.netlify.com/manage/routing/headers/) — confirms no documented precedence between `netlify.toml` `[[headers]]` and a `_headers` file; recommends using only one

**Verified via WebSearch, cross-checked against official docs where possible (MEDIUM confidence):**
- [Sentry: Why am I getting 429 Too Many Requests](https://sentry.zendesk.com/hc/en-us/articles/29749185609243-Why-am-I-getting-429-Too-Many-Requests-responses-from-Sentry) — events dropped (not queued/retried) during a rate-limited window; permanently lost
- [Sentry: Do archived/ignored events count toward quota](https://help.sentry.io/account/billing/do-ignored-events-in-the-ui-count-towards-my-quota/) and related forum threads — confirms grouped/issue-level organization does not reduce per-event quota consumption
- [Sentry Blog: Making your JavaScript projects less noisy](https://blog.sentry.io/making-your-javascript-projects-less-noisy/) and [6 Tips for Reducing JavaScript Error Noise](https://blog.sentry.io/tips-for-reducing-javascript-error-noise/) — `ResizeObserver`, browser-extension noise patterns, caution against over-broad "Script error." filtering
- [Sentry Changelog: browser extension filters](https://sentry.io/changelog/browser-extension-filters-new-additions) — built-in inbound filter for extension-caused noise
- GitHub/forum threads on duplicate capture (`getsentry/sentry-javascript` issues #1432, #2744, #2532, #1617; Sentry community forum "Duplicate exception when init Sentry") — recurring, cross-framework pattern of double-capture from custom handlers layered on default global handlers, and from report-then-rethrow patterns
- npm registry (`@sentry/browser`, checked 2026-08-11) — current stable version 10.69.0, confirming `sendDefaultPii` deprecation timeline (removal planned for v11) is current, not stale training-data information

**This-repo-specific facts (HIGH confidence, read directly):**
- `.planning/PROJECT.md` — v4.3 milestone goal, verified baseline (41 files, 55,189 LOC, 504 `catch`, 422 `console.error`, 57 `.catch()` tails, 19 `alert()`, 35 `confirm()`, 0 global handlers, 0 error sink), Phase 113 root-cause narrative
- `CLAUDE.md` — stale-ES-module failure mode, Firebase listener management pattern, no-build/no-staging/production-only constraints, existing CDN version-pinning convention (Firebase v10.7.1, implied Chart.js v4.4.7 per PROJECT.md)
- `netlify.toml` / `_headers` — confirmed both files currently carry identical CSP strings including `'unsafe-inline'` in `script-src` and `cdn.jsdelivr.net` already allow-listed in `script-src`

---
*Pitfalls research for: retrofitting Sentry error tracking into the CLMC procurement SPA (v4.3 Observability & Error Handling)*
*Researched: 2026-08-11*
