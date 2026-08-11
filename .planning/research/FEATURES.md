# Feature Research

**Domain:** Production error tracking + error-handling UX for a small-team (~1 developer, 7 internal roles) vanilla-JS/Firebase business app
**Researched:** 2026-08-11
**Confidence:** HIGH (Sentry platform mechanics — verified via Context7 `/getsentry/sentry-docs` + official docs); MEDIUM (small-team sizing/process recommendations — verified against official pricing but judgment-based); HIGH (Firebase/Firestore error taxonomy — well-established gRPC-based code list, cross-checked against Google Cloud docs)

This research covers two halves that must work together: **(A) the observability side** — what Sentry (already chosen in PROJECT.md over a self-hosted `error_logs` collection) must be configured to answer — and **(B) the error-handling contract side** — what the app's code must do so that every one of the ~500 existing failure sites produces a useful signal instead of a swallowed exception. Every item below is tagged **[A]** or **[B]**; cross-half dependencies are called out explicitly because that is the seam most likely to be scoped wrong.

## Feature Landscape

### Table Stakes (Users/Operators Expect These)

Non-negotiable for this milestone to be worth doing. Missing any of these means the milestone doesn't achieve its stated goal ("a broken workflow should surface on a dashboard... instead of dying silently").

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **[A] Sentry Browser SDK via CDN loader script** | The whole milestone's premise; Netlify has zero client-side error tracking | LOW | Loader script (`js.sentry-cdn.com/<key>.min.js`) is CDN-native, no bundler needed — matches "no build system" constraint. Default `data-lazy` mode buffers `window.onerror`/`unhandledrejection` immediately but **does not capture breadcrumbs until the full SDK loads on first error** — for a multi-step workflow app (MRF → PR → PO), set `data-lazy="no"` so the click/nav/fetch trail exists *before* the first error, not starting from it. |
| **[A] Global error capture (`window.onerror` + `unhandledrejection`)** | PROJECT.md: "the app currently has neither, so any failure outside a `catch` is lost entirely" | LOW | **Important finding:** Sentry's `globalHandlersIntegration` and `onUnhandledRejectionIntegration` are **on by default** the moment `Sentry.init()` runs — the app does not need to hand-roll these listeners. What the app *does* still need to hand-build is the **[B]** decision layer that intercepts what Sentry's defaults would otherwise report at full volume (see Quota risk dependency below). |
| **[A] Stack traces** | Baseline expectation of any error dashboard; this is the #1 thing "verbal bug report" loses today | LOW | Automatic. Bonus for this app specifically: zero-build means **no minification of first-party code**, so stack traces are readable without sourcemap upload — one less moving part than a typical bundled SPA. |
| **[A] Breadcrumbs (automatic + manual)** | Answers "what was the user doing" without relying on their memory | LOW (automatic) / MEDIUM (manual) | Automatic breadcrumbs cover `console`, DOM clicks, `fetch`/`xhr`, and `history`/hash-navigation — all four are directly relevant to this app's hash-router + Firestore reads. Manual breadcrumbs should be added at domain-meaningful transitions (MRF approved, PR generated, tab switched, RFP payment recorded) — this is where **[B]**'s `reportError()`/breadcrumb helper does the real work; see severity tiering below for what qualifies. |
| **[A] Identity attribution (`Sentry.setUser`)** | Explicit milestone goal: "logged-in CLMC user (uid, email, role, department) attached to every event" | LOW | `Sentry.setUser({ id: uid, email, role, department })` called once after auth resolves (existing `getCurrentUser()` already provides this shape — see PII guidance below for what NOT to add here). |
| **[A] Release + environment tagging** | Distinguishes "did this regress in the last deploy" from "always been broken"; environments separate real incidents from a developer's local `http-server` session | LOW | No build step means no CI-injected git SHA. Pragmatic zero-build pattern: a hand-maintained `RELEASE` constant bumped alongside the project's existing version convention (v4.0, v4.1, ...) — fits how this repo already tracks releases in PROJECT.md. `environment` can be derived at runtime from `location.hostname` (`localhost`/`127.0.0.1` → `development`, else `production`) since there is no staging tier (confirmed in PROJECT.md: "No staging environment; Firebase is production-only"). |
| **[A] Issue grouping/fingerprinting** | Without it, 500+ instrumented call sites become thousands of noisy unique issues instead of a triageable list | LOW (default) / MEDIUM (custom rules) | Default stack-trace-based grouping works out of the box. Differentiator-tier custom fingerprint rules (below) become worth it once real volume shows the default grouping is too coarse (e.g., all `permission-denied` errors from different views grouping into one issue) or too fine (same underlying cause throwing from three call sites). |
| **[A] Issue resolve / ignore / regression detection** | Standard workflow: mark fixed, get re-notified if it comes back in a later release | LOW | Included free in Sentry's core product — no extra engineering. Resolving "in next release" ties directly to the release tag above, so release tagging is a soft prerequisite for regression detection to be meaningful rather than just "unresolved again." |
| **[A] Alert rules (appropriately sized for team of ~1)** | Someone has to find out about the error without polling a dashboard | LOW | Free "Developer" tier: 5,000 errors/month, **1 user**, email alerts only (no Slack/PagerDuty/Jira — those require the $26/mo Team plan). For this team size that's not a limitation, it's correctly scoped: one rule ("notify me on new issue, environment=production") covers the whole need. Configuring per-issue-type routing, on-call rotations, or multi-channel alerts before there's a second responder is over-building — see anti-features. |
| **[A] CSP widening in *both* `netlify.toml` and `_headers`** | Both files currently carry an identical restrictive CSP (`script-src`/`connect-src` locked to Firebase/Google/gstatic/jsdelivr domains only); Sentry's origins aren't in either | LOW effort, **HIGH severity if missed** | Required additions: `script-src` → `https://js.sentry-cdn.com` (and `https://browser.sentry-cdn.com` if the loader pulls from there); `connect-src` → `https://*.sentry.io` (covers the region-scoped ingest endpoint used by the DSN). **This is the single highest-leverage gotcha in the whole milestone**: a CSP violation is enforced silently by the browser — no thrown JS exception, nothing in the app's own error path — so Sentry can ship "wired" and report literally zero events while looking configured correctly in code review. Both files must change identically; they are two independent header sources for the same site (one is a fallback/legacy format of the other) and Netlify does not merge them. |
| **[B] A single `reportError()` contract** | Explicit milestone deliverable: "one wrapper every failure path routes through, replacing 422 ad-hoc `console.error` calls" | MEDIUM | Minimum viable signature: `reportError(error, { severity, tag, correlationId?, userMessage?, context? })`. Responsibilities: (1) normalize the error (Firebase code → known shape), (2) decide the severity tier (below) and route to Sentry / breadcrumb / console accordingly, (3) generate or accept a correlation ID and attach it as a Sentry tag, (4) if `userMessage` (or a derived one) exists, call the existing `showToast()` with the 3-part message pattern (below), (5) **never throw** — a reporting helper that itself fails is exactly the kind of silent-failure-on-top-of-failure this milestone exists to prevent. |
| **[B] Severity tiering (report / breadcrumb / console-only)** | PROJECT.md: "quota risk... naively piping 422 error sites into Sentry would exhaust a free-tier quota. Severity tiering and sampling are requirements, not polish." | MEDIUM | Concrete, applicable rule for triaging the 504 existing `catch` blocks — see dedicated section below. This is the rule an implementer needs to be able to apply mechanically to each of the 500+ sites without re-litigating it every time. |
| **[B] Correlation IDs (short, user-readable, round-tripped into Sentry)** | Explicit milestone deliverable: ties a verbal report ("I got error K7F2M") to one dashboard event | LOW–MEDIUM | Format and generation detailed below. **Cross-half dependency:** the ID is generated app-side **[B]** but is only useful if it's also attached as a searchable Sentry **tag** **[A]** on the same event — if `setTag('correlation_id', id)` is missed, the code shown to the user has nothing to search against in the dashboard, and the whole feature silently degrades into a cosmetic string. |
| **[B] User-facing error messaging (replaces 19 `alert()` calls)** | Explicit milestone deliverable; also the direct fix for the motivating incident's "user saw nothing" failure mode | MEDIUM | Structure and Firebase-code-specific catalog detailed below. Builds directly on the existing `showToast(message, type)` in `app/utils.js:186` — no new UI primitive needed, only a message-construction convention layered on top. |
| **[B] Firebase/Firestore error code normalization** | The app's entire data layer is Firestore; nearly all of the 504 `catch` blocks and 57 `.catch()` tails are catching `FirebaseError` instances with a machine-readable `.code` | LOW–MEDIUM | Full code table and mapping strategy below. Switch on `error.code`, never on `error.message` (message text is verbose/internal and unstable across SDK versions). |
| **[B] Fire-and-forget promise elimination for the 57 `.catch()` tails** | PROJECT.md: "a swallowed `.catch()` was Phase 113's root cause" — this is the direct fix for the motivating incident | MEDIUM–HIGH | Every `.catch(err => console.error(...))` (or worse, an empty `.catch(() => {})`) is a banned pattern going forward. Two acceptable replacements: (1) make the call `await`-able inside a `try/catch` that calls `reportError()`, or (2) if it must remain genuinely fire-and-forget (e.g., a non-critical background sync where the UI must not block), the `.catch()` handler's body must call `reportError()` — not `console.error` — so the failure still reaches the dashboard instead of the terminal. |
| **[B] Convention guardrail (documented + CLAUDE.md)** | Explicit milestone deliverable: "so new code cannot reintroduce silent swallows" | LOW | Cheapest item in the whole milestone — pure documentation. **Real limitation to flag**: this repo has **no build system and no linter**, so a rule like `no-floating-promises` cannot be enforced automatically the way it would in a typical Node/TS project. Enforcement is necessarily process-based (PR review + CLAUDE.md convention) unless paired with the differentiator below. |

### Differentiators (High Value, Optional)

Worth doing, not required for the milestone to be considered complete.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **[B] Git-hook or script-based pattern scanner** (enhances the [B] convention guardrail) | Closes the enforcement gap that "no linter" leaves open — a small Node script grepping staged diffs for `.catch(console.error)`, `.catch(() => {})`, bare `alert(`, or a `catch` block whose only statement is `console.error` | LOW–MEDIUM | Does not require adopting a bundler/linter — a single `scripts/check-error-conventions.js` invoked from a pre-commit or pre-push hook is consistent with this repo's existing pattern of small standalone Node scripts (`backup.js`, `verify-integrity.js`, `wipe.js`). Directly strengthens the table-stakes guardrail from "documentation only" to "documentation + automated backstop." |
| **[A]+[B] Mirror fatal-tier errors into the existing in-app `notifications` collection** | Resolves a real tension: Sentry's free tier is **limited to 1 login**, but this app has 7 roles across 2 departments. A fatal-severity error creating a bell/dropdown notification for Super Admins uses infrastructure that already exists (per CLAUDE.md: `notifications` Firestore collection + bell/dropdown UI), so admins get visibility without needing a Sentry seat | MEDIUM | High value because it's the only realistic way anyone besides the single Sentry-seat developer sees "something is broken" in near-real-time, without paying for more Sentry seats. |
| **[A] Custom fingerprint rules for the dominant Firebase error shapes** | Groups all `permission-denied` events (say) from different views by underlying cause instead of by raw stack, once real production volume shows where default grouping is too coarse or too fine | MEDIUM | Use `beforeSend` to set `event.fingerprint` based on `hint.originalException.code` for the ~6 Firestore codes this app actually produces (see table below), rather than tuning per literal error message. Best done *after* a few weeks of real data, not speculatively on day one. |
| **[B] Idempotency-aware retry affordance for `unavailable`/network-class errors** | Lets a user consciously retry a failed write from the toast itself ("Try Again" button) rather than re-navigating and re-filling a form | MEDIUM | Only safe for reads or writes that are already idempotent by construction (e.g., re-fetching a listener snapshot); explicitly **not** safe for financial writes without an idempotency key — see anti-features. |

### Anti-Features (Commonly Requested, Often Problematic)

Prevent scope creep. Each of these is a natural-sounding extension of "add error tracking" that this milestone should explicitly decline.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| **[A] Session Replay** | "See exactly what the user did before it broke" sounds like it would obsolete correlation IDs and breadcrumbs entirely | Default privacy settings mask **all text and block all media**, so on a UI that's mostly financial tables (amounts, supplier names, RFP totals) the replay would show almost nothing useful out of the box; making it *useful* means selectively unmasking financial figures — which is exactly the data this app is supposed to protect from third-party SaaS exposure. Also adds a second, separate quota/cost axis on top of error events. | Breadcrumbs (automatic nav/click/fetch trail) + manual domain breadcrumbs + a correlation ID already answer "what was the user doing" at effectively zero added privacy risk or complexity. Revisit only if triage is repeatedly stuck despite that. |
| **[A] Performance monitoring / tracing (`tracesSampleRate` > 0)** | Bundled into the same SDK and UI, easy to "just turn on while we're in here" | Unrelated to this milestone's actual goal (visibility into *failures*, not latency); consumes a separate spans/transactions quota on the same free-tier account and dilutes focus from the motivating incident (a swallowed `.catch()`, not a slow query) | Leave `tracesSampleRate: 0` (or omit tracing integrations entirely) for this milestone; treat performance monitoring as a separate, later decision if a felt performance problem shows up. |
| **[A] Self-hosting Sentry (or a Sentry-compatible OSS server like GlitchTip)** | Avoids the free-tier event quota and the "yet another SaaS vendor" concern | Requires standing up and operating a backend service — directly contradicts this project's core constraint ("no build system," "no backend server," Netlify static-only) and turns a scoped milestone into an infrastructure project with its own uptime/patching burden | SaaS Sentry free tier (5,000 events/month) with the severity tiering in this document as the quota-management mechanism. If quota is ever exceeded at this team's scale, that's a signal the tiering rule needs tightening, not that self-hosting is warranted. |
| **[A] Slack/PagerDuty/on-call routing on day one** | Feels like "proper" incident response | Not available on the free tier (requires the $26/mo Team plan for third-party integrations); for a 1-developer team, email-only alerting is not a compromise, it's the correctly-sized solution — there's no on-call rotation to route to | Email alert rule (`new issue`, `environment:production`). Revisit if the team grows past one developer/responder. |
| **[B] Blind bulk-wiring of all 504 `catch` blocks into `reportError()` at "report" severity in one pass** | Feels complete, feels fast (mechanical find-and-replace) | This is precisely the quota-exhaustion risk PROJECT.md calls out by name; most of the 504 sites are legitimate expected-user-error validation branches (missing required field, duplicate client code, permission-by-design blocks) that would drown the 5,000/month budget with non-bugs and bury the real signal | Apply the severity tiering rule (below) per site, starting with the highest-risk write paths (cross-department writes, PR/PO/RFP financial writes — the same class of write that caused Phase 113) and sweeping the remaining validation-style catches into breadcrumb-or-nothing tier. |
| **[B] Auto-retry failed writes silently, with no user-visible signal** | "The network blipped, just retry it, don't bother the user" | This app's financial writes (RFP payment recording, PO creation, PR generation) have no idempotency key; a silent automatic retry on a write whose first attempt actually *succeeded* server-side but whose response was lost client-side risks a duplicate payment record or duplicate PO — a worse outcome than a visible, correlation-ID'd failure | Surface the failure via the toast pattern with a manual retry affordance (differentiator above) so a human consciously decides to retry, rather than the client guessing. |
| **[B] Showing the raw exception (`error.message`, stack trace, Firestore field/collection names) directly in the user-facing toast "for transparency"** | Saves the effort of building a message catalog; developers default to what's already in the console | Meaningless and alarming to an accountant or procurement officer, and leaks internal schema details (collection names, field names, security-rule internals) to whoever is looking at the screen | The 3-part message structure below (what happened / what to do / reference code) plus the Firebase-code message catalog; the raw exception still goes to Sentry (developer-facing), just not the toast (user-facing). |
| **[B] A single top-level `try/catch` (or one router-level error boundary) intended to replace all 504 call-site-level catches** | "Wrap once at the top and be done" is the least code | Loses exactly the per-call-site context (which document, which field, which workflow step) that both the severity rule and the correlation ID depend on; a router-level boundary can only say "something broke somewhere," which is the same silent-console problem restated one layer up | Keep `reportError()` called at each existing call site (or a thin per-call wrapper), so context stays local; use a top-level `window.onerror`/`unhandledrejection` handler *only* as the last-resort net for truly uncaught cases, not as the primary mechanism. |

## Severity Tiering — Concrete Rule for the 504 Existing `catch` Blocks

This is the rule the quality gate asks for: something an implementer can mechanically apply to each of the 500+ existing sites without re-deciding from scratch each time.

**The governing question for any given `catch` block or `.catch()` tail:**
> *"If this fires again next week, for a different user, on a correctly configured system — does that indicate a code defect, or is it the system correctly doing its job?"*

| Tier | Definition | Examples in this codebase | Sentry action |
|------|------------|---------------------------|----------------|
| **Fatal / unhandled** | Anything reaching `window.onerror` or `unhandledrejection` that never went through an app-level `catch` at all | A `TypeError` from an unguarded `null.property` access; a rejected promise nobody attached `.catch()` to | Always report, `level: 'fatal'` or `'error'`. This is the class Sentry's default global handlers already capture with zero app code — the milestone's job here is mainly to *not* filter these out in `beforeSend`. |
| **Handled but unexpected** | A `catch` around an operation that is supposed to succeed under normal conditions — the failure itself is evidence something is wrong (bad config, a genuine bug, an infra hiccup) | `onSnapshot` listener error callbacks (already flagged in `utils.js` as "keep last known value... do NOT clear to null"); `generateSequentialId`/`_nextClmcCode` counter-transaction failures; `JSON.parse(items_json)` throwing on malformed data; a `permission-denied` on a write path the UI believes the user is authorized for (this is the exact Phase 113 root-cause shape) | Report, `level: 'error'` or `'warning'` depending on blast radius. This is where the bulk of genuinely useful signal lives. |
| **Expected user error / permission-denied-by-design** | The system correctly rejecting bad input or an intentionally blocked action — no code defect, the guard rail is working | `validateRequired()` missing-fields returns; duplicate `client_code`/`supplier_name` checks; `canEdit === false` guards intentionally hiding edit controls; a `permission-denied` read that the UI's own scoping (`getAssignedProjectCodes()` etc.) already anticipates and handles by showing an empty state | Breadcrumb at most (`category: 'validation'`, low level), or nothing. **Never** a Sentry event — this is exactly the volume that would exhaust the 5,000/month free-tier quota if wired blindly. |

**Practical disambiguator for the ambiguous middle case — `permission-denied`:** this app's own Firestore rules are the access-control layer (per CLAUDE.md's Security Rules pattern), so a `permission-denied` is either (a) the UI correctly not offering an action to a scoped-out user and never attempting the write at all — no error to catch, nothing to tier — or (b) the UI *did* attempt a write/read the user shouldn't have access to, meaning either the client-side scoping logic and the server-side rule have drifted out of sync, or (as in Phase 113) a cross-department write path exists that nobody scoped at all. Case (b) is **always** "handled but unexpected," never "expected" — a `permission-denied` that actually reaches a `catch` block is close to definitionally a bug in this app's architecture, not a normal user mistake. This is the single highest-value normalization rule to get right, since it's the exact failure class that motivated the milestone.

## Correlation IDs — Format and Wiring

**Format:** 5–6 character, uppercase alphanumeric, drawn from an ambiguity-reduced alphabet (excludes `0`/`O`, `1`/`I`/`L` — the standard pattern used for any code a human reads aloud or types back, e.g. `K7F2M`). At 5 characters from a ~32-symbol alphabet, that's ~33 million combinations — far more than sufficient collision resistance for a small internal team's error volume, especially since correlation IDs only need to be unique within the Sentry retention window (30 days on the free tier), not globally forever.

**Generation:** client-side, at the moment `reportError()` decides an error is toast-worthy (report tier only — breadcrumb/console-only tiers don't need one, since there's no user-facing message to attach it to). The app already has `crypto.randomUUID()` available via `cryptoRandomUuid()` in `app/utils.js` for other ID needs (proposal IDs); the correlation ID generator can reuse the same `crypto.getRandomValues()` primitive rather than introducing a new dependency, just mapped into the short alphabet instead of full UUID form.

**Wiring (the cross-half dependency the quality gate flags):**
1. **[B]** `reportError()` generates the code (e.g., `K7F2M`).
2. **[B]** The code is embedded in the `showToast()` message per the 3-part structure below.
3. **[A]** The *same* code is attached to the Sentry event as a searchable tag: `Sentry.setTag('correlation_id', code)` (or passed via `captureException(error, { tags: { correlation_id: code } })`).
4. Support workflow: user reads back "K7F2M" verbally or in chat → developer searches Sentry issues by tag `correlation_id:K7F2M` → lands on the exact event, with full stack trace, breadcrumbs, and the `setUser` identity already attached.

Note the distinction from Sentry's own built-in `eventId` (returned by `captureException`, and what `Sentry.showReportDialog({ eventId })`'s native feedback widget uses): that's a full UUID, correct for machine-to-machine linking but not something a person reads aloud or types into a chat message without error. The correlation ID is a human-friendly alias layered on top via a tag, not a replacement for Sentry's own eventing — this app's users should never see a raw Sentry UUID.

## User-Facing Error Messaging — Structure

Three-part structure per message, replacing all 19 `alert()` calls and any bare/console-only failures on report-tier errors:

1. **What happened** — plain language, no exception class names, no Firestore field/collection names, no stack fragments. Derived from the normalized Firebase error code (below), not from `error.message`.
2. **What to do** — an action the recipient can actually take: retry, wait and retry, contact an admin, or (for expected/validation-tier messages that still warrant a toast, e.g. "Client code already exists") simply "use a different code."
3. **Reference code** — the correlation ID, always present on report-tier errors, phrased so it's clear it's for support use ("If this keeps happening, mention code K7F2M").

Example: *"Couldn't save this Purchase Request — the connection dropped. Try again in a moment. (Ref: K7F2M)"*

This slots directly into the existing `showToast(message, type)` — no new component needed, just a message-construction convention (likely a small helper that takes `{code, correlationId}` and returns the composed string) sitting between `reportError()` and the existing toast call.

## Firebase/Firestore Error Code Normalization

Firestore's client errors are the same status codes exposed by gRPC (a `FirebaseError` with a `.code` string). This is the switch key `reportError()`'s normalization step should use — never `.message`, which is verbose, implementation-detail-laden, and not guaranteed stable across SDK versions.

| Code | Meaning | Typical cause in this app | User message | Severity tier |
|------|---------|---------------------------|---------------|----------------|
| `permission-denied` | Security rule rejected the operation | Cross-department write/read attempted (Phase 113's exact root cause); client/server scoping drift | "You don't have permission to do that." | Handled-but-unexpected (see disambiguator above — almost always a bug, not a user mistake) |
| `unavailable` | Backend/network temporarily unreachable | Connectivity blip, offline mode edge case (app already uses `persistentLocalCache`) | "Connection issue — please try again in a moment." | Handled-but-unexpected (report, but low severity — often self-resolves) |
| `failed-precondition` | Operation rejected because current state doesn't allow it (e.g., missing composite index, or a document already in a state that blocks the transition) | A `code_counters` transaction hitting a malformed `last_seq` (already explicitly thrown as a defensive error in `utils.js`); a status-transition guard | "This couldn't be completed right now — the record may have changed. Please refresh and try again." | Handled-but-unexpected |
| `resource-exhausted` | Quota/rate limit hit | Unlikely at this app's scale today, but Firestore write-rate or Sentry's own event quota both fall in this class conceptually | "Too many requests right now — please wait a moment and try again." | Handled-but-unexpected (and worth a distinct Sentry alert if it ever fires — it means the app is hitting real infra limits) |
| `not-found` | Referenced document doesn't exist | Stale reference (deleted MRF/PR/PO still linked from a cached list) | "This record no longer exists — it may have been deleted." | Handled-but-unexpected, low severity |
| `deadline-exceeded` | Operation took too long | Slow network, large query | "That took too long — please try again." | Handled-but-unexpected |
| `already-exists` | Attempted create collided with an existing document | Rare given this app's ID-generation transactions, but relevant to `code_counters` bootstrap races | "That already exists — please refresh and try again." | Handled-but-unexpected |
| `unauthenticated` | Auth session invalid/expired | Session expiry mid-workflow | "Your session expired — please log in again." | Expected (breadcrumb, unless frequency spikes) |
| `invalid-argument`, `out-of-range`, `unimplemented`, `internal`, `data-loss`, `cancelled`, `unknown`, `aborted` | Various — mostly indicate either a genuine code defect or a low-level SDK/transport issue | Rare in normal operation | Generic fallback: "Something went wrong on our end." | Handled-but-unexpected (report — an "unknown"/"internal" code by definition means the specific-case catalog didn't anticipate it, which is itself useful signal) |

A **fallback catalog entry** ("Something went wrong. Please try again, and mention code {correlationId} if it keeps happening.") must exist for any code not explicitly mapped — the catalog will never be perfectly exhaustive, and an unmapped code should degrade gracefully rather than showing `undefined` or the raw error.

Note: Firebase **Auth** errors (`auth/wrong-password`, `auth/user-not-found`, etc.) are a separate namespace from Firestore's gRPC-style codes and already have some handling in the existing login flow (pre-v4.3 feature) — they should route through the same `reportError()`/catalog mechanism for consistency, but are lower priority for this milestone since login failures are less consequential than a swallowed write on a financial record.

## Feature Dependencies

```
[A] Sentry SDK loaded (CDN loader)
    └──requires──> [A] CSP widened in BOTH netlify.toml and _headers
                       (hard blocker — silent no-op otherwise, no console error under CSP block)

[A] Global error capture (window.onerror/unhandledrejection)
    └──provided by──> [A] Sentry SDK default init (GlobalHandlers + onUnhandledRejection integrations, on by default)

[B] reportError() contract
    └──requires (for its "report" tier sink)──> [A] Sentry SDK initialized
    └──independently testable via──> a console-only stub sink (severity tiering logic doesn't need Sentry to be wired to be built/reviewed)

[B] Correlation ID generation
    └──requires (to be useful, not just cosmetic)──> [A] Sentry setTag('correlation_id', ...) on the same event
    (this is the cross-half seam most likely to be scoped incorrectly — see dedicated section above)

[A] Identity attribution (setUser)
    └──requires──> existing auth/permissions system (already built, v2.0 — no new work, just a call site)

[B] Severity tiering
    └──requires──> [B] Firebase error code normalization (to distinguish "expected" vs "handled-unexpected" for the dominant error class, permission-denied)

[B] Fire-and-forget elimination (57 .catch() tails)
    └──enhances──> [B] severity tiering (each converted tail needs a tier decision, not just a reportError() call)
    └──is the direct fix for──> the Phase 113 motivating incident; should be prioritized ahead of the broad 504-catch-block sweep

[B] Convention guardrail (doc only)
    └──enhanced by (optional)──> [B] git-hook pattern scanner (differentiator)
    (guardrail ships independently; scanner is additive, not blocking)

[A]+[B] Mirror fatal errors into in-app notifications
    └──requires──> [B] severity tiering (only fatal-tier should mirror, or the existing bell/dropdown UI gets as noisy as the console it's replacing)
    └──requires──> existing notifications collection + UI (already built, v4.0 — no new collection)
```

### Dependency Notes

- **CSP widening blocks everything in [A]**, and fails silently: this is the one dependency in this document worth calling out as a required *first* implementation step, with an explicit verification step (confirm an event actually lands in the Sentry dashboard) before building anything on top of it.
- **Correlation ID is a two-sided feature**: the [B] half (generate + display) is worthless without the [A] half (tag it on the event) completing the loop. A roadmap phase that ships toast display without the Sentry tag — or vice versa — delivers something that looks done but isn't.
- **Severity tiering is the load-bearing decision for quota management**: both the fire-and-forget elimination and the broader 504-catch-block sweep depend on it existing *before* either is done at scale, or both risk reproducing the quota-exhaustion anti-feature.
- **Global error capture is "free"** in the sense that Sentry provides it by default — the actual engineering effort in this milestone is almost entirely on the [B] side (deciding what should and shouldn't reach Sentry), not on wiring the capture mechanism itself.

## MVP Definition

### Launch With (v1 — this milestone's floor)

- [ ] **[A]** Sentry SDK via CDN loader script, `data-lazy="no"`, environment + release tags, `setUser` wired to existing auth state
- [ ] **[A]** CSP widened identically in `netlify.toml` and `_headers`; verified with a real test event reaching the dashboard (not just "no console error")
- [ ] **[A]** Global handlers confirmed active (Sentry defaults) — no custom `window.onerror` needed, just verification
- [ ] **[B]** `reportError()` contract with the 3-tier severity model implemented
- [ ] **[B]** Fire-and-forget elimination: all 57 `.catch()` tails converted to route through `reportError()` (this is the direct fix for the motivating incident and should not wait for the full 504-block sweep)
- [ ] **[B]** Severity tiering applied to the highest-risk write paths first: cross-department writes and PR/PO/RFP financial writes (the same class of write that caused Phase 113) — not a blind pass over all 504 blocks
- [ ] **[B]** Correlation ID generation + toast display + Sentry tag round-trip, replacing all 19 `alert()` calls
- [ ] **[B]** Firebase error code → message catalog covering at minimum `permission-denied`, `unavailable`, `failed-precondition`, `resource-exhausted`, `not-found`, `deadline-exceeded`, plus a generic fallback
- [ ] **[B]** Convention guardrail documented in CLAUDE.md

### Add After Validation (v1.x, same milestone, fast-follow)

- [ ] **[B]** Sweep the remaining ~450 `catch` blocks into the tiering rule, batched by view file, now that the rule has been proven on the highest-risk paths
- [ ] **[A]** Custom Sentry fingerprint rules — once real production volume shows where default grouping needs adjustment
- [ ] **[A]+[B]** Mirror fatal-tier errors into the existing in-app `notifications` collection for admin visibility without a Sentry seat

### Future Consideration (v2+/defer)

- [ ] **[A]** Session Replay — only if correlation-ID + breadcrumb triage repeatedly proves insufficient in practice
- [ ] **[A]** Performance/APM tracing — separate concern from error tracking; revisit only if a felt performance problem emerges
- [ ] **[A]** Issue ownership/auto-routing rules — only relevant once there's more than one developer to route to
- [ ] **[A]** Paid Sentry tier for Slack/PagerDuty alert routing — revisit if team size or on-call needs grow
- [ ] **[B]** Git-hook automated pattern scanner for banned error-handling patterns — valuable but not blocking; ships whenever there's bandwidth after the documentation-only guardrail is in place

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| CSP widening (both files) | HIGH (blocks everything else) | LOW | P1 |
| Sentry SDK init + global handlers + setUser | HIGH | LOW | P1 |
| `reportError()` contract + severity tiering | HIGH | MEDIUM | P1 |
| Fire-and-forget elimination (57 tails) | HIGH (direct incident fix) | MEDIUM | P1 |
| Correlation ID generation + Sentry tag round-trip | HIGH | LOW–MEDIUM | P1 |
| Firebase error code message catalog | HIGH | LOW–MEDIUM | P1 |
| Convention guardrail (doc) | MEDIUM | LOW | P1 |
| Full 504-block severity sweep (beyond highest-risk paths) | MEDIUM | HIGH | P2 |
| Custom Sentry fingerprint rules | MEDIUM | MEDIUM | P2 |
| Mirror fatal errors into in-app notifications | MEDIUM–HIGH (closes the 1-seat gap) | MEDIUM | P2 |
| Git-hook pattern scanner | MEDIUM | LOW–MEDIUM | P2 |
| Session Replay | LOW at current scale | MEDIUM–HIGH | P3 |
| Performance/APM tracing | LOW (out of scope) | MEDIUM | P3 |
| Slack/PagerDuty routing, issue ownership rules | LOW at team size 1 | LOW (paid tier) | P3 |

**Priority key:**
- P1: Must have for this milestone to be considered complete
- P2: Should have, natural fast-follow within the same milestone
- P3: Explicitly deferred — revisit only if a stated trigger condition occurs

## Alternatives Considered (in place of Competitor Analysis)

PROJECT.md already recorded the top-level decision (Sentry over a self-hosted Firestore `error_logs` collection). This table documents the narrower alternatives within "use a SaaS error tracker," for completeness.

| Option | CDN/no-build support | Fit for this project | Why not chosen |
|--------|----------------------|------------------------|-----------------|
| **Sentry** | Yes — official loader script | Good | Chosen (PROJECT.md): best-documented CDN path, generous-enough free tier for this team's volume once severity-tiered, and the only option researched with an explicit CSP-configuration doc page |
| **GlitchTip** | Yes — Sentry-SDK-compatible, same loader/API surface | Good in theory, but self-hosted-only | Same API as Sentry (so this document's guidance ports directly if ever migrated), but requires standing up and operating a server — contradicts "no backend server" constraint. Worth remembering as a fallback if Sentry's free-tier quota or pricing ever becomes a blocker, since the migration cost would be low (compatible SDK). |
| **Bugsnag / Rollbar** | Both offer browser SDKs, less CDN-first documentation than Sentry | Plausible | No decisive advantage over Sentry for this use case found in research, and less CDN/zero-build documentation depth than Sentry's dedicated loader-script guide |
| **LogRocket** | Browser SDK available | Poor fit | Bundles session replay as its core value proposition — see Session Replay anti-feature reasoning above; not a good primary fit for a financial/procurement data app at this team size |

## Sources

- Sentry official docs (via Context7 `/getsentry/sentry-docs`, high source reputation): loader script/CDN install, `data-lazy` mechanics, `GlobalHandlers`/`onUnhandledRejection` default integrations, `setUser`/`setTag`/`setContext`/`setExtra` API signatures, `sendDefaultPii` default (`false`), breadcrumbs (automatic categories + manual API), fingerprinting/grouping, issue resolve/ignore/regression states, alert rule structure, Session Replay default masking behavior
- [Sentry Pricing](https://sentry.io/pricing/) — free "Developer" tier: 5,000 errors/month, 1 user, 30-day retention, email-only alerts, no third-party integrations (verified directly, HIGH confidence)
- [Sentry CSP / Security Policy Reporting docs](https://docs.sentry.io/platforms/javascript/guides/connect/security-policy-reporting/) — confirms `script-src: js.sentry-cdn.com`/`browser.sentry-cdn.com`, `connect-src: *.sentry.io`
- [Firebase/Google Cloud Firestore "Understand error codes"](https://firebase.google.com/docs/firestore/enterprise/understand-error-codes) — gRPC-based status code list (cross-referenced, HIGH confidence on the code list itself; MEDIUM on the exact user-facing message wording, which is this project's own judgment call)
- WebSearch (MEDIUM confidence, used for pattern/convention framing rather than API facts): short human-readable code generation conventions (ambiguous-character exclusion, 5–6 char length is standard); `no-floating-promises`/fire-and-forget promise handling conventions; Sentry alternatives landscape (GlitchTip as Sentry-SDK-compatible self-hosted option)
- Project-internal: `.planning/PROJECT.md` (v4.3 milestone definition, verified baseline counts, prior decision rationale for Sentry over self-hosted); `app/utils.js` (existing `showToast`, `cryptoRandomUuid`, `escapeHTML` — the primitives this milestone's UX builds on); `netlify.toml` / `_headers` (current CSP baseline, read directly to confirm both files carry the identical restrictive policy that needs widening)

---
*Feature research for: production error tracking + error-handling UX, small-team internal business app (v4.3 Observability & Error Handling milestone)*
*Researched: 2026-08-11*
