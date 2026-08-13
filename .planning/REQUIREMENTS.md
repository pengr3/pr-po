# Requirements: CLMC Procurement System — v4.3 Observability & Error Handling

**Defined:** 2026-08-11
**Core Value:** Projects tab must work — it's the foundation where project name and code originate, and everything in the procurement system connects to it. Money out (PRs/POs/payables) and money in (project contract) must both reconcile against the project record.

**Milestone goal:** Make production failures visible, attributable, and diagnosable — a broken workflow should surface on a dashboard with the user, role, and stack trace attached, instead of dying silently in a browser console nobody reads.

---

## Organizing Insight

Research (`.planning/research/SUMMARY.md`) converged on one finding that shapes every requirement below:

> **Installing the Sentry SDK does not fix the bug that motivated this milestone.** Sentry's `globalHandlersIntegration` is on by default, so `window.onerror` + `unhandledrejection` capture is free the moment `init()` runs. But Phase 113's root cause was a `.catch()` whose body only called `console.error`. A promise with *any* rejection handler attached — however useless its body — is **handled** from the JS engine's perspective, so it structurally never fires `unhandledrejection`. Global capture gives complete coverage for unknown-unknowns and **zero** coverage for this exact bug class.

The SDK install (OBS) is cheap and mechanical. The value is concentrated in the error contract (ERRC) and the targeted retrofit (RETRO). Requirements are weighted accordingly.

---

## v4.3 Requirements

### OBS — Observability Foundation

- [x] **OBS-01**: Sentry browser SDK loads on every page from a self-hosted, version-pinned bundle committed under `lib/` — mirroring the existing `lib/signature_pad.umd.min.js` treatment, because `*.sentry-cdn.com` is a common ad-blocker target and a blocked bundle means silent loss of all reporting
- [x] **OBS-02**: `Sentry.init()` runs before the app's ES-module bootstrap, so cold-start failures (bad deploy, blocked Firebase CDN, the stale-ES-module class documented in CLAUDE.md) are captured rather than lost
- [x] **OBS-03**: The app functions identically when the Sentry bundle fails to load or is blocked — every call site is guarded and no user-facing feature depends on `window.Sentry` existing
- [x] **OBS-04**: The Sentry ingest host is permitted by CSP in **all four** CSP string occurrences (`netlify.toml` and `_headers` each duplicate their policy across a `/*` block and a `/*.html` block), and the two files remain byte-identical
- [x] **OBS-05**: No supplier name, client name, PO/PR/RFP contents, line-item amounts, or bank/payment details reach Sentry — `sendDefaultPii` disabled and `beforeSend`/`beforeBreadcrumb` scrubbing shipped in the **same commit** as `Sentry.init()`, since events sent before the scrub hook exists are unrecoverable
- [ ] **OBS-06**: A deliberately triggered error in production appears in the Sentry dashboard with a readable stack trace — verified empirically, because a CSP-blocked ingest request throws no catchable error and "dashboard is quiet" is otherwise indistinguishable from "no errors occurred"
- [x] **OBS-07**: Every event carries a `release` string and an `environment` tag, with localhost traffic tagged `development` so local work never pollutes production data
- [ ] **OBS-08**: Every event shows the user's navigation trail as breadcrumbs — the app routes on `location.hash`, not `pushState`, so Sentry's default history breadcrumbs cannot be assumed to cover it

### ATTR — Identity Attribution

- [ ] **ATTR-01**: Every event identifies which user produced it (Firebase uid + email)
- [ ] **ATTR-02**: Every event carries the acting user's role and department as filterable tags
- [ ] **ATTR-03**: Attribution stays correct when a user's role or permissions change mid-session, using the role-diff branch already computed by the existing `onSnapshot(users/{uid})` listener in `app/auth.js` — no new subscription
- [ ] **ATTR-04**: Attribution is cleared on logout, so no event is misattributed to a signed-out or previous user

### ERRC — Error Contract

- [ ] **ERRC-01**: A single `reportError()` in a new `app/errors.js` is the only path from application code to Sentry
- [ ] **ERRC-02**: `reportError()` classifies every error into a documented severity tier (report / breadcrumb / console-only), so 422 existing error sites cannot naively exhaust the 5,000-event monthly quota
- [ ] **ERRC-03**: A **write-path** `permission-denied` always reports at error tier — a correctly gated UI should never let a user attempt a write their role forbids, so one reaching Firestore is by definition a client-side authorization bug (Phase 113's exact shape). A **read-path** `permission-denied` is breadcrumb-tier — legitimate by-design behavior after Phase 113's rules tightening
- [ ] **ERRC-04**: Firebase errors are classified by `.code`, never by `.message` — message text is unstable across SDK versions
- [ ] **ERRC-05**: Every reported error generates a short, uppercase, ambiguity-reduced correlation ID, generated **before** any Sentry availability check so it is identical whether or not the SDK loaded
- [ ] **ERRC-06**: The correlation ID shown to the user is attached as a searchable tag on the same Sentry event — shipped as one deliverable with the toast display, never sequenced separately
- [ ] **ERRC-07**: `reportError()` always writes to console and always surfaces to the user, regardless of whether Sentry loaded — the dashboard is the only thing lost when Sentry is unavailable
- [ ] **ERRC-08**: Reported errors carry structured context (`operation: read|write`, collection, acting role) so error classes are filterable dimensions rather than an undifferentiated noise category
- [ ] **ERRC-09**: A reviewed triage table classifies representative catch sites by tier and read/write path **before** any mechanical conversion begins

### UX — User-Facing Error Handling

- [ ] **UX-01**: All 19 bare `alert()` calls are replaced with `showToast()`
- [ ] **UX-02**: An error toast displays its correlation ID and does not auto-dismiss, so the user can read the code back before it disappears
- [ ] **UX-03**: An error message tells the user what failed and what to do next, with no raw exception text or stack trace shown
- [ ] **UX-04**: A user can verbally report a correlation ID and the developer can locate that exact event in Sentry — the round-trip that replaces "it broke, I don't know what it said"

### RETRO — Targeted Retrofit

- [ ] **RETRO-01**: An audit artifact classifies all 57 fire-and-forget `.catch()` tails and every catch block whose entire body is a bare `console.error`, by severity tier and read/write path — reviewed before conversion starts
- [ ] **RETRO-02**: Every write-path `.catch()` tail (`updateDoc`/`setDoc`/`addDoc`/`deleteDoc`/`writeBatch`/`runTransaction`) routes through `reportError()` — the direct fix for the Phase 113 bug class *(Pass A)*
- [ ] **RETRO-03**: Every write-path catch block whose only statement is `console.error` routes through `reportError()` *(Pass B)*
- [ ] **RETRO-04**: `app/views/project-plan.js` and `app/views/service-plan.js` are converted as a single reviewed diff — structurally near-identical files with ~28 inline `permission-denied` ternaries between them *(Pass C)*
- [ ] **RETRO-05**: The `navigate()` catch in `app/router.js` routes through `reportError()` — one site covering every lazy-loaded view app-wide, including lazy-import and stale-module failures

### GUARD — Guardrail, Alerting & Acceptance

- [ ] **GUARD-01**: At least one Sentry alert rule notifies on a new production issue — without it, severity tiering is cosmetic, because an event nobody is notified about is not "seen"
- [ ] **GUARD-02**: CLAUDE.md documents the `reportError()` convention and the `window.onerror =` clobbering anti-pattern, written from converted examples that actually shipped
- [ ] **GUARD-03**: Supplementary global listeners use `addEventListener('error'/'unhandledrejection', ...)` and never assign `window.onerror`/`window.onunhandledrejection` (single-value IDL properties — direct assignment silently replaces Sentry's own handler with no error to flag the regression), and never call `captureException` themselves
- [ ] **GUARD-04**: **Milestone acceptance test.** A deliberate cross-department write rejection, run in production, produces exactly one error-tier Sentry event — tagged with role/collection/operation — sufficient to diagnose without reproducing. This is the Phase 113 bug class, and it either surfaces or the milestone did not achieve its goal

---

## Future Requirements

Deferred. Tracked but not in the v4.3 roadmap.

### Error Messaging

- **FUT-01**: A user-facing `mapFirestoreError()` message catalog translating Firebase codes (`unavailable`, `failed-precondition`, `resource-exhausted`, quota errors) into language an accountant or procurement officer can act on. *Explicitly descoped from v4.3.* Code-based **severity classification** (ERRC-04) remains in scope — it is load-bearing for ERRC-03 and quota control — but the user-message catalog is a separate, larger surface

### Retrofit Completion

- **FUT-02**: The remaining ~450 catch blocks, converted opportunistically under the boy-scout rule as those files are touched for unrelated work — explicitly not a dedicated phase
- **FUT-03**: Financial write-path files (`finance.js`, `procurement.js`, `mrf-form.js`) get a dedicated conversion pass once the `reportError()` pattern has survived contact with lower-risk views

### Observability Depth

- **FUT-04**: Mirror fatal-tier errors into the existing `notifications` collection so non-seat-holding admins get in-app visibility — revisit if the single-login decision proves painful
- **FUT-05**: Custom Sentry fingerprint rules — revisit only once real production volume shows default grouping is too coarse or too fine
- **FUT-06**: A git-hook or lint-style scanner enforcing the GUARD-02 convention mechanically — valuable but not blocking; this repo has no build or lint step to hang one off

---

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Session Replay | Masking is opt-out per field and this is a financial UI — unacceptable PII risk. Separate quota, and the bundle variant ships the code even if never invoked |
| Performance / APM tracing (`tracesSampleRate`) | Different problem, different quota. This milestone is about failures, not latency |
| Profiling | Same reasoning as tracing; no diagnosed performance problem to justify it |
| Sentry User Feedback widget | This milestone builds its own toast + correlation-ID UX, which fits the existing design system |
| Source map upload / `sentry-cli` / build plugins | The app ships unbundled, unminified, untranspiled ES modules — the code in the browser is line-for-line the code in the repo. There is no build step for the tooling to hook into and nothing to map |
| Paid Sentry seats | Decision: stay on the free tier with a single login. 5,000 events/month and 30-day retention are sufficient at this team size |
| Slack / PagerDuty routing, issue-ownership rules | Irrelevant at one responder, and requires the paid Team plan |
| Self-hosted Sentry server | Enormous operational overhead for an app with no CI, no staging, and no ops function |
| Exhaustive conversion of all 504 catch blocks in dedicated phases | Research explicitly warns against it: unreviewable diffs, no automated test suite (the only tests are Firestore rules tests, which don't touch this layer), no staging environment, and most existing catches already show a reasonable message. Covered by FUT-02 instead |
| Replacing the 35 `confirm()` calls | Confirmation dialogs are a deliberate safety pattern, not an error surface. Unrelated to this milestone's goal |

---

## Constraints Carried Into Planning

Not requirements, but binding on how phases are sequenced:

- **Sequencing:** v4.1's plan 113-11 (production deploy of tightened `firestore.rules`) ships before v4.3 work begins. STATE.md deliberately remains on v4.1 until it does.
- **Branch `v4.2`** (phases 106–112, Home/mobile) is untouched and still awaits rebase onto `main`. Phase numbering for v4.3 starts at **114**.
- **No staging environment.** Firebase and Netlify are production-only. Every verification gate is a production verification gate.
- **No automated test coverage** for the view layer — the only automated suite is Firestore rules tests. Conversion work is batched per file and reviewed manually, never as a single mega-diff.
- **Netlify header precedence** between `netlify.toml` and `_headers` is undefined by Netlify's own documentation. Treat "both files byte-identical" as an enforced invariant, and verify empirically (`curl -I` / DevTools → Response Headers) which policy was actually served after every CSP-touching deploy.
- **SDK version pin** (`10.70.0` per research, disputed by one patch) must be re-verified against the live source at Phase 114 kickoff, along with a freshly computed SRI hash.

---

## Traceability

Which phases cover which requirements.

| Requirement | Phase | Status |
|-------------|-------|--------|
| OBS-01 | Phase 114 | Complete |
| OBS-02 | Phase 114 | Complete |
| OBS-03 | Phase 114 | Complete |
| OBS-04 | Phase 114 | Complete |
| OBS-05 | Phase 114 | Complete |
| OBS-06 | Phase 114 | Pending |
| OBS-07 | Phase 114 | Complete |
| OBS-08 | Phase 117 | Pending |
| ATTR-01 | Phase 115 | Pending |
| ATTR-02 | Phase 115 | Pending |
| ATTR-03 | Phase 115 | Pending |
| ATTR-04 | Phase 115 | Pending |
| ERRC-01 | Phase 116 | Pending |
| ERRC-02 | Phase 116 | Pending |
| ERRC-03 | Phase 116 | Pending |
| ERRC-04 | Phase 116 | Pending |
| ERRC-05 | Phase 116 | Pending |
| ERRC-06 | Phase 116 | Pending |
| ERRC-07 | Phase 116 | Pending |
| ERRC-08 | Phase 116 | Pending |
| ERRC-09 | Phase 116 | Pending |
| UX-01 | Phase 117 | Pending |
| UX-02 | Phase 116 | Pending |
| UX-03 | Phase 116 | Pending |
| UX-04 | Phase 116 | Pending |
| RETRO-01 | Phase 118 | Pending |
| RETRO-02 | Phase 119 | Pending |
| RETRO-03 | Phase 119 | Pending |
| RETRO-04 | Phase 119 | Pending |
| RETRO-05 | Phase 117 | Pending |
| GUARD-01 | Phase 120 | Pending |
| GUARD-02 | Phase 120 | Pending |
| GUARD-03 | Phase 117 | Pending |
| GUARD-04 | Phase 120 | Pending |

**Coverage:**
- v4.3 requirements: 34 total
- Mapped to phases: 34 (100%)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-11*
*Roadmap created: 2026-08-11 — 7 phases (114–120), 100% coverage*
*Research basis: `.planning/research/SUMMARY.md` (STACK, FEATURES, ARCHITECTURE, PITFALLS)*
