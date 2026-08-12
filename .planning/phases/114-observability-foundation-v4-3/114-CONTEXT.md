# Phase 114: Observability Foundation — Context

**Gathered:** 2026-08-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Get the Sentry browser SDK live in production for the SPA: a self-hosted, version-pinned bundle
that initializes before the ES-module bootstrap, CSP widened for the ingest host in all four
occurrences, PII scrubbing shipped in the same commit as `Sentry.init()`, `release`/`environment`
tagging, and an empirically-verified production test event plus a verified blocked-bundle
degradation path.

**Covers:** OBS-01, OBS-02, OBS-03, OBS-04, OBS-05, OBS-06, OBS-07

**Not this phase:** identity attribution (115), the `reportError()` contract and correlation IDs
(116), global handlers / router choke point / hash-route breadcrumbs (117, OBS-08), the retrofit
audit and conversion (118–119), alerting and the milestone acceptance test (120).

</domain>

<decisions>
## Implementation Decisions

### PII & breadcrumb posture

- **D-01:** `beforeBreadcrumb` keeps `breadcrumb.message` and deletes `breadcrumb.data` outright for
  console-category breadcrumbs. Sentry stows the extra console arguments in `data.arguments` — that
  is where an `Error`, a supplier doc, or anything a future `console.error` passes would land. One
  rule, no allowlist to maintain, and it is safe against console calls that do not exist yet.
  Rationale: the corpus was sampled — of 422 `console.error` calls the dominant shape is
  `console.error('[Prefix] message:', errorObject)`, so the message strings carry the diagnostic
  value and the argument payloads carry the risk.
- **D-02:** `beforeSend` sets `sendDefaultPii: false`, strips the query string off `request.url`, and
  runs a shared denylist constant over `event.extra` / `contexts`. The denylist is the *same*
  constant the breadcrumb rule uses — one place to edit.
- **D-03:** Other default breadcrumb sources (`fetch`/`xhr`, `dom`, `history`) are **kept**, with
  query strings stripped. Firestore document paths (e.g. `.../projects/CLMC-2026-014`) are retained
  because "what was it touching" is the single most useful thing on a Firestore error, and those IDs
  are internal references rather than financial contents. Query strings are stripped because
  Firestore's Listen channel carries `gsessionid`/`SID` auth tokens there.
- **D-04:** The scrub line is **identity in, business data out**. `uid`, `email`, `role`,
  `department` are deliberately sent — that is the entire point of attribution. Scrubbed: supplier
  names, client names, PO/PR/RFP contents, line-item amounts, bank/payment details. This resolves the
  apparent OBS-05 vs. ATTR-01 tension: Phase 114 sets `sendDefaultPii: false` and builds the
  denylist; Phase 115 explicitly opts identity back in via `setUser()`.

### Page coverage & file layout

- **D-05:** Instrument **`index.html` only**. The five archived monolith URLs are *not* instrumented
  (see Deferred Ideas for the full finding). They are pre-v2.0 dead code that no nav link points at;
  instrumenting them would spend free-tier quota on pages nobody should reach and produce
  un-actionable errors from superseded code.
- **D-06:** A **single** `<script>` occurrence for the pinned bundle, documented with a head comment
  matching the existing convention already used for Chart.js and Frappe Gantt
  (`pinned to vX.Y.Z — why`). No build step means the pin is hand-maintained; one occurrence is one
  place to bump.
- **D-07:** The bundle file is named **`lib/obs.min.js`** — deliberately neutral. Self-hosting only
  dodges ad-blockers if the path does not announce itself; `lib/sentry.min.js` is still a
  filter-list path match on several lists, which would defeat the exact purpose of OBS-01's
  self-hosting decision. A head comment and a CLAUDE.md note name what it actually is — the
  obscurity lives in the URL only, never in the repo.
- **D-08:** `Sentry.init()` config, the `beforeSend`/`beforeBreadcrumb` scrub functions, and the
  denylist constant live in a **separate classic script, `app/sentry-init.js`**. Load order in
  `<head>`: `lib/obs.min.js` (classic) → `app/sentry-init.js` (classic) → the existing
  `<script type="module">` bootstrap block. Keeps ~40 lines of scrub logic out of `index.html`, makes
  the config diffable on its own, and gives the denylist a real file that Phase 116's `app/errors.js`
  can read via a `window` global.

### diagnostics.js coexistence

- **D-09:** `app/diagnostics.js` is **not opened** in Phase 114. Phase 114 is purely additive. The
  module captures sleep/wake and network-gap context (`last_hidden_ms`, `session_age_ms`, `online`)
  that Sentry has no equivalent for, and all 5 of its external call sites are deliberate. Whether it
  is eventually retired is a Phase 116/120 question, decided once `reportError()` actually exists.
- **D-10:** diagnostics.js's `client_errors` Firestore mirror and its `.catch()` are **exempt from the
  Phase 119 retrofit**, on recursion grounds. Routing its own mirror failure through `reportError()`
  risks a report loop; `app/diagnostics.js:102` already names the hazard in a comment
  (`NEVER call logDiag() from here`). Recorded here so the **Phase 118 audit classifies it as a
  deliberate exemption rather than flagging it as a miss**.
- **D-11:** The `console.error('[CLMC-DIAG] ' + type, ev)` at `app/diagnostics.js:95` **keeps** producing
  Sentry breadcrumbs. Under D-01 it degrades to a message-only breadcrumb like
  `[CLMC-DIAG] access_denied` — exactly the trail wanted preceding a Sentry event — while the `ev`
  payload carrying `uid`/`role`/`status` is already dropped. Requires no extra code; it falls out of
  D-01.
- **D-12:** diagnostics' session/sleep context is **not** mirrored onto the Sentry scope in Phase 114.
  OBS-01..07 do not ask for it, and capturing it would mean duplicating the `visibilitychange`
  listener diagnostics.js already owns. If it proves valuable, Phase 116's `reportError()` can read
  it off diagnostics via a `window` global.

### Release & environment tagging

- **D-13:** `release` is a hand-bumped constant in **phase-scoped** form — `clmc@4.3.0-p114` — bumped
  **at each phase close**. That is an existing ritual in this project (every phase already ends with
  a docs commit and a deploy), so the bump has a natural home in the phase's final plan. Yields ~7
  releases across v4.3 — enough granularity to answer "did Phase 119's retrofit introduce this?",
  which is precisely the question this milestone will be asking.
- **D-14:** `environment` has **three** values, derived from hostname:
  `localhost`/`127.0.0.1` → `development`; the exact production host → `production`; any other
  `*.netlify.app` → `preview`. Robust whether or not deploy previews are enabled today — if they are
  turned on later their events self-segregate instead of silently polluting production. Extends the
  existing `isLocal` pattern at `app/firebase.js:59` rather than inventing a new one.
- **D-15:** Localhost **transmits** to Sentry, tagged `development`. Full pipeline parity means init,
  scrubbing, and ingest can be verified locally against `clmc-procurement-dev` before touching
  production; one developer's volume is small against 5,000 events/month, and the `environment` tag
  filters dev events out of every production view. A path exercised only in production is the path
  that fails silently.
- **D-16:** OBS-06's deliberate production error is triggered by a **permanent guarded global**,
  `window.__sentryTest()`, registered in `app/sentry-init.js`. No UI surface; callable from DevTools
  in production by whoever is verifying. It is re-runnable on every CSP-touching deploy, which is
  what makes it a real recurring gate rather than a one-time ceremony. Follows the existing
  `__createTestNotification` precedent, with the deliberate difference that this one must work in
  **production**, not only localhost.

### Verification & sequencing

- **D-17:** The phase **opens with a human gate**: create the Sentry org and a browser-JS project, and
  capture the DSN. The exact `connect-src` ingest host (`o<orgid>.ingest.<region>.sentry.io`) is
  derived from the DSN, so the CSP edit, the SRI/version re-verification, and the production test
  event are all blocked on it. No Sentry account exists yet.
- **D-18:** Both recurring gates are written into **`HEADERS-README.md`**, not just the phase plan:
  (a) the `curl -I` command that reads back the live `Content-Security-Policy` and resolves which of
  `netlify.toml` / `_headers` Netlify actually served, and (b) the DevTools request-blocking steps for
  simulating a blocked bundle to verify OBS-03. Both recur on every CSP-touching deploy, so they
  belong in a durable doc rather than a plan step that gets archived with the phase.

### Claude's Discretion

- Exact `connect-src` host form (wildcard `https://*.ingest.sentry.io` vs. the exact
  `o<orgid>.ingest.<region>.sentry.io`) — decide once the DSN exists; prefer the narrowest form that
  works.
- Whether SRI (`integrity` + `crossorigin`) is applied at all. Research assumed a CDN script tag;
  D-07 self-hosts the bundle same-origin, where SRI adds a hash to maintain for no threat-model gain.
  Re-derive rather than carrying the research recommendation forward.
- The exact contents of the shared denylist constant, and whether it is a key list, a regex, or both.
- Where the `release` constant physically lives (`app/sentry-init.js` is the obvious home given D-08).
- Plan/wave decomposition and where the blocking human gates fall, beyond D-17's opening gate.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & research
- `.planning/REQUIREMENTS.md` — OBS-01..07 verbatim (§ "OBS — Observability Foundation"),
  plus § "Out of Scope" (Session Replay, tracing, profiling, source maps, paid seats — all
  already decided, do not reopen) and § "Constraints Carried Into Planning"
- `.planning/research/SUMMARY.md` — the organizing insight, recommended stack, the four-occurrence
  CSP finding, and the five critical pitfalls. § "Gaps to Address" lists the version-pin and Netlify
  precedence items this phase must resolve empirically
- `.planning/ROADMAP.md` § "Phase 114: Observability Foundation" — goal, success criteria, and the
  note that the version pin and SRI hash must be re-verified at kickoff

### Project conventions
- `CLAUDE.md` — tech stack, the stale-ES-module failure mode this phase's early init exists to
  capture, and the no-build/no-test/no-lint constraint
- `HEADERS-README.md` — existing header documentation; D-18 adds the two recurring verification
  procedures here
- `.planning/codebase/CONVENTIONS.md` — file/function naming, 4-space indent, the
  `/* ==== SECTION ==== */` comment-header style `app/sentry-init.js` should follow

### Files this phase touches or reads
- `index.html` — `<head>` at lines 9–23 (existing pinned CDN script tags and their comment
  convention); the `<script type="module">` bootstrap block begins at line 250
- `netlify.toml` — CSP string in the `/*` block and again in the `/*.html` block
- `_headers` — CSP string in the `/*` block and again in the `/*.html` block (byte-identical
  invariant with `netlify.toml`)
- `app/firebase.js:59-86` — the `isLocal` hostname pattern D-14 extends, and the dual dev/prod
  Firebase config
- `app/diagnostics.js` — read-only for this phase (D-09); line 95 is the `[CLMC-DIAG]` console call
  D-11 covers, line 102 the recursion comment D-10 cites
- `lib/signature_pad.umd.min.js` — the self-hosting precedent OBS-01 mirrors

### Prior-phase context
- `.planning/phases/113-assignment-source-of-truth-and-project-read-enforcement/` — the motivating
  incident. The swallowed `.catch()` root cause is what the whole milestone exists to make visible

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets
- **`lib/signature_pad.umd.min.js`** — the exact self-hosted-vendor-file precedent OBS-01 asks the
  Sentry bundle to mirror. Loaded as a classic `<script>` in `<head>` at `index.html:18`.
- **`isLocal` at `app/firebase.js:59`** — `['localhost','127.0.0.1'].includes(window.location.hostname)`.
  D-14's three-value environment derivation extends this rather than inventing a parallel check.
- **Head-comment pin convention** — `index.html:19-22` documents Chart.js `4.4.7` and Frappe Gantt
  `1.2.2` inline with a "pinned to vX.Y.Z — why" comment. D-06 follows it.
- **`__createTestNotification`** — an existing localhost-only debug global (documented in the
  `index.html` module-block comment). D-16's `window.__sentryTest()` follows the pattern, but must
  work in production.
- **`cryptoRandomUuid()`** in `app/utils.js` — not used by this phase, but it is the primitive
  Phase 116's correlation IDs build on. Already consumed by `app/proposal-modal.js`.

### Established patterns
- **Every CDN dependency is version-pinned exactly** (Firebase `10.7.1`, Chart.js `4.4.7`, Frappe
  Gantt `1.2.2`) precisely because there is no staging tier to catch an upstream break.
- **Classic `<script>` tags in `<head>` precede the ESM bootstrap.** Three already do
  (`signature_pad`, `chart.js`, `frappe-gantt`), so D-08's two additional classic scripts are the
  established shape, not a new mechanism.
- **`[Prefix] message:` console convention** — `[Router]`, `[Procurement]`, `[CLMC-DIAG]` etc. This
  is what makes D-01's message-keep/data-drop rule produce a readable breadcrumb trail.
- **No build, no bundler, no linter, no CI.** Every constant is hand-maintained; every verification
  gate is manual. This is why D-13 ties the release bump to an existing ritual and D-18 puts the
  recurring procedures in a durable doc.

### Integration points
- `index.html` `<head>` — two new classic `<script>` tags before line 250's module block.
- `netlify.toml` + `_headers` — four CSP strings, one atomic commit, files must stay byte-identical.
- `lib/` — one new committed vendor file.
- `app/sentry-init.js` — one new file. Classic script, **not** an ES module.

### Corrections to the planning docs (verified by direct inspection)
Two claims carried in PROJECT.md / REQUIREMENTS.md are factually wrong and should not be relied on:

1. **"Firebase is production-only, no staging"** (`PROJECT.md:45`, `REQUIREMENTS.md:122`) — false for
   Firebase. `app/firebase.js:59-86` has a dual config: `localhost`/`127.0.0.1` → the real
   `clmc-procurement-dev` project, all other hosts → `clmc-procurement`. **Netlify** is
   production-only; Firebase is not. This is what makes D-15 (localhost transmits) worth doing —
   the full pipeline can be exercised locally without touching production data.
2. **"0 error sink"** (`PROJECT.md:43`) — false. `app/diagnostics.js` is a live error sink with three
   outputs: a localStorage ring buffer, `[CLMC-DIAG]` console output, and a `client_errors` Firestore
   collection with its own rules block at `firestore.rules:1288`. It has 5 external call sites
   (`app/auth.js:208`, `app/auth.js:390`, `app/permissions.js:114`, `app/router.js:291`, plus internal
   network/visibility events). D-09..D-12 cover it.

</code_context>

<specifics>
## Specific Ideas

- The breadcrumb rule was chosen *after* sampling the actual corpus rather than from the research's
  worst-case assumption. Research warned that 422 `console.error` calls "plausibly include full
  supplier/PO/bank objects"; direct inspection shows the dominant shape is
  `console.error('[Prefix] message:', errorObject)` with an `Error` as the second argument, and the
  outliers carry identifiers (`user.role`, `userId`, `fieldName`, `path`) rather than financial
  contents. The risk is real but concentrated in argument payloads — which is exactly what D-01
  drops.
- `lib/obs.min.js` over `lib/sentry.min.js` is a deliberate, documented obscurity: the whole reason
  OBS-01 self-hosts is ad-blocker evasion, and a path containing `sentry` is still a filter-list
  match. Note the residual limitation: the **ingest endpoint** cannot be self-hosted and *is* an
  ad-blocker target. Tunnelling it would require a server, which this stack does not have. Some
  fraction of ad-blocked users will silently not report, and that is accepted.
- OBS-06's test event is framed as a **recurring** gate, not a one-time ceremony — research is
  explicit that a CSP-blocked ingest is indistinguishable from "no errors occurred", so it must be
  re-run every time CSP is touched. D-16 and D-18 exist to make that mechanically repeatable.

</specifics>

<deferred>
## Deferred Ideas

- **Five archived monolith HTML URLs are live in production.** Verified 2026-08-12 by `curl`:
  `/finance.html` → 200 (4,965 lines), `/mrf-submission-form.html` → 200 (799 lines),
  `/archive/index.html` → 200 (5,785 lines), plus `/archive/finance.html` and
  `/archive/mrf-submission-form.html`. The root copies are byte-identical to their `archive/`
  counterparts. Each carries its own hardcoded Firebase `apiKey`, and all predate the v2.0
  authentication system. There is no `_redirects` file and no redirect rules in `netlify.toml`.
  Recorded as evidence only — no backlog item opened, per the decision in D-05. Not an observability
  problem; it is a deploy-surface question for whoever wants to take it.
- **Retiring `app/diagnostics.js`'s `client_errors` Firestore mirror** — revisit in Phase 116 or 120
  once `reportError()` exists and its overlap with the diagnostics sink is concrete (D-09).
- **Mirroring diagnostics' `last_hidden_ms` / `session_age_ms` onto the Sentry scope** — the sleep/wake
  gap was the smoking gun for the overnight "access denied" bug and Sentry has no equivalent. Out of
  scope for 114 (D-12); Phase 116's `reportError()` is the natural home.
- **Consolidating `netlify.toml` and `_headers` to a single authoritative file** — flagged by research
  as a hardening item beyond this milestone's scope. The byte-identical invariant is the interim
  answer.

</deferred>

---

*Phase: 114-observability-foundation-v4-3*
*Context gathered: 2026-08-12*
