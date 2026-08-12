# Phase 114: Observability Foundation — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-12
**Phase:** 114-observability-foundation-v4-3
**Areas discussed:** Breadcrumb & PII posture, Page coverage (3 HTML files), diagnostics.js coexistence, release + environment tags

**Note on invocation:** the command was run as `/gsd:discuss-phase 14`, which resolved to
`.planning/milestones/v2.2-phases/14-workflow-quality-gates` — an archived, shipped v2.2 phase.
Confirmed with the user and retargeted to Phase 114, the active v4.3 starting phase.

---

## Breadcrumb & PII posture

Grounding gathered before asking: of 422 `console.error` calls, the dominant shape is
`console.error('[Prefix] message:', errorObject)` — the second argument is almost always an `Error`,
not a business object. Outliers carry identifiers (`user.role`, `userId`, `fieldName`, `path`).
The one call logging a structured payload is `app/diagnostics.js:95`. This contradicted research's
worst-case assumption and reframed the options honestly: risk is in argument payloads, not messages.

### Q1 — `beforeBreadcrumb` configuration for console breadcrumbs

| Option | Description | Selected |
|--------|-------------|----------|
| Keep message, drop payload | Keep `breadcrumb.message`, delete `breadcrumb.data` (where Sentry stows extra console args). One rule, no allowlist, safe against console calls that don't exist yet | ✓ |
| Drop console breadcrumbs entirely | `beforeBreadcrumb` returns null for `category === 'console'`. Zero leak surface; cost is no console trail on any event | |
| Keep everything, redact by key | Denylist regex over known-sensitive keys. Richest events; cost is that a field added later leaks silently | |

**User's choice:** Keep message, drop payload
**Notes:** The message strings carry the diagnostic value; the argument payloads carry the risk.

### Q2 — `beforeSend` aggressiveness

| Option | Description | Selected |
|--------|-------------|----------|
| Scrub URL query + denylist keys | `sendDefaultPii: false`, strip query string off `request.url`, shared denylist over `event.extra`/`contexts` — same constant the breadcrumb rule uses | ✓ |
| Minimal — `sendDefaultPii` off only | Rely on the breadcrumb rule alone. Less code; cost is no shared scrub layer for Phase 116's structured context to land in | |
| You decide | Defer to the planner | |

**User's choice:** Scrub URL query + denylist keys

### Q3 — Other default breadcrumb sources (fetch/xhr, dom, history)

| Option | Description | Selected |
|--------|-------------|----------|
| Keep fetch/xhr + dom, strip query strings | Retain Firestore document paths (most useful context on an error); strip query strings carrying `gsessionid`/`SID` auth tokens | ✓ |
| Keep dom + history only, drop fetch/xhr | Strictest OBS-05 reading. Cost: loses which collection was being touched | |
| Keep all defaults as-is | Simplest diff. Cost: Firestore auth session tokens land in the dashboard | |

**User's choice:** Keep fetch/xhr + dom, strip query strings

### Q4 — OBS-05 (scrub PII) vs ATTR-01 (send uid + email)

| Option | Description | Selected |
|--------|-------------|----------|
| Identity in, business data out | uid/email/role/department deliberately sent; supplier/client names, PO/PR/RFP contents, amounts, bank details scrubbed | ✓ |
| uid only, no email | Tighter; would narrow ATTR-01's scope in Phase 115. Cost: extra lookup per triage | |
| Something else | User describes a different line | |

**User's choice:** Identity in, business data out
**Notes:** Resolves the apparent conflict — 114 sets `sendDefaultPii: false` and builds the denylist; 115 explicitly opts identity back in via `setUser()`.

---

## Page coverage — 3 HTML files

Scouting escalated the finding mid-area: not 3 files but **5 live monolith URLs**. An `archive/`
folder exists and is git-tracked, *and* byte-identical duplicates of `finance.html` and
`mrf-submission-form.html` sit at the repo root. Verified by `curl` against production:
`/finance.html` → 200, `/mrf-submission-form.html` → 200, `/archive/index.html` → 200. No
`_redirects` file, no redirect rules in `netlify.toml`. Each carries its own hardcoded Firebase
`apiKey` and predates the v2.0 auth system.

### Q1 — What does OBS-01's "every page" mean?

| Option | Description | Selected |
|--------|-------------|----------|
| `index.html` only | Instrument the live SPA. Monoliths are pre-v2.0 dead code no nav link points at; instrumenting them spends quota on unreachable pages and yields un-actionable errors | ✓ |
| `index.html` + a deferred cleanup item | Same instrumentation, plus formally logging "stop serving the 5 archived URLs" as a backlog item | |
| All served HTML pages | Literal OBS-01 reading; 6 files to keep the pin and SRI in sync across | |

**User's choice:** `index.html` only
**Notes:** User declined opening a backlog item. The archived-URL evidence is recorded in CONTEXT.md's Deferred Ideas section as a finding only.

### Q2 — Keeping the hand-copied pin honest

| Option | Description | Selected |
|--------|-------------|----------|
| Single occurrence, comment-documented | One `<script>` tag, matching the existing "pinned to vX.Y.Z — why" head-comment convention used for Chart.js and Frappe Gantt | ✓ |
| Note it in CLAUDE.md too | Same tag plus a CLAUDE.md dependency entry | |
| You decide | Defer to how `lib/signature_pad.umd.min.js` is documented today | |

**User's choice:** Single occurrence, comment-documented

### Q3 — Where the init config lives

| Option | Description | Selected |
|--------|-------------|----------|
| Separate classic script, `app/sentry-init.js` | Keeps ~40 lines of scrub logic out of `index.html`, gives the denylist a real file Phase 116 can read via a window global, config diffable on its own | ✓ |
| Inline in `index.html` `<head>` | CSP already allows `'unsafe-inline'`; zero extra round-trip. Cost: dense scrub block in a 296-line mostly-markup file | |
| You decide | Weigh load-order risk of an extra request | |

**User's choice:** Separate classic script, `app/sentry-init.js`

### Q4 — Does a Sentry org/project/DSN exist?

| Option | Description | Selected |
|--------|-------------|----------|
| Not yet — creating it is part of the phase | Plan opens with a human gate; CSP host, SRI re-verify, and test event all blocked on the DSN | ✓ |
| Already exists — I have the DSN | Plan goes straight to pinning and CSP | |
| Not sure — check at plan time | Planner verifies and branches | |

**User's choice:** Not yet — creating it is part of the phase

---

## diagnostics.js coexistence

Grounding: `app/diagnostics.js` is narrower than the planning docs imply — only 5 external call
sites (`auth.js:208`, `auth.js:390`, `permissions.js:114`, `router.js:291`, plus internal
network/visibility events). Purpose-built for the overnight "access denied" bug, capturing
`last_hidden_ms`, `session_age_ms`, `online` — sleep/wake context Sentry does not collect.

### Q1 — What happens to `app/diagnostics.js` in Phase 114?

| Option | Description | Selected |
|--------|-------------|----------|
| Untouched — fully orthogonal | Phase 114 purely additive. Retirement is a Phase 116/120 question, decided once `reportError()` exists | ✓ |
| Untouched now, retire `client_errors` later | Same no-op, but lock the retirement intent now | |
| Wire `logDiag` → Sentry in this phase | 5 instrumented paths produce events immediately. Cost: a second path to Sentry that ERRC-01 must unwind in 116 | |

**User's choice:** Untouched — fully orthogonal

### Q2 — Exempting diagnostics' own `client_errors` `.catch()` from the retrofit

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — exempt, documented now | Routing its mirror failure through `reportError()` risks a report loop; `diagnostics.js:102` already names the hazard. Locked so the Phase 118 audit classifies rather than flags it | ✓ |
| No — let the Phase 118 audit decide | Leave unclassified; audit looks at it fresh | |
| You decide | Planner notes the hazard and picks a rule | |

**User's choice:** Yes — exempt, documented now

### Q3 — `[CLMC-DIAG]` console breadcrumbs

| Option | Description | Selected |
|--------|-------------|----------|
| Keep — free high-signal marker | The type string is exactly the trail wanted preceding an event; the `ev` payload is already dropped by the data rule. No extra code | ✓ |
| Drop — exclude `[CLMC-DIAG]` from breadcrumbs | Keeps the two systems fully separate. Cost: an explicit prefix check to maintain | |
| You decide | Planner decides once diag noise is observable | |

**User's choice:** Keep — free high-signal marker

### Q4 — Mirroring diagnostics' session context onto the Sentry scope

| Option | Description | Selected |
|--------|-------------|----------|
| No — out of scope for 114 | OBS-01..07 don't ask for it; would duplicate the `visibilitychange` listener diagnostics already owns | ✓ |
| Yes — set as Sentry context at init | Every event carries it, including global-handler events that never touch `reportError()` | |
| Note it as a deferred idea | Don't build, but record for 116/120 | |

**User's choice:** No — out of scope for 114
**Notes:** Recorded in CONTEXT.md Deferred Ideas anyway, so Phase 116 evaluates it deliberately.

---

## release + environment tags

Grounding: no version constant exists anywhere in the app. `package.json` is the test harness only
(`clmc-procurement-tests@1.0.0`), and `app/update-check.js` polls opaque ETag/Last-Modified values,
not a semantic string. The release constant is net-new.

### Q1 — Release string format and bump ritual

| Option | Description | Selected |
|--------|-------------|----------|
| Phase-scoped — `clmc@4.3.0-p114` | Bumped at each phase close, an existing project ritual. ~7 releases across v4.3 — enough to answer "did Phase 119's retrofit introduce this?" | ✓ |
| Milestone-scoped — `clmc@4.3.0` | One bump per ship. Cost: 7 phases collapse into one release | |
| Date-stamped — `clmc@2026-08-12` | Highest deploy fidelity. Cost: repo auto-deploys on every push, so bumps outside phase closes get forgotten | |

**User's choice:** Phase-scoped — `clmc@4.3.0-p114`

### Q2 — Number of environment values

| Option | Description | Selected |
|--------|-------------|----------|
| Three, derived from hostname | localhost → `development`, exact prod host → `production`, other `*.netlify.app` → `preview`. Robust whether or not previews are enabled today | ✓ |
| Two — development / production | Literal OBS-07 reading, matches `app/firebase.js`'s binary. Cost: preview errors indistinguishable from real ones | |
| You decide | Planner checks whether previews are enabled | |

**User's choice:** Three, derived from hostname
**Notes:** Raised because Netlify previews run against **production** Firebase (`isLocal` is false there), so their events would land tagged `production`.

### Q3 — Does localhost transmit, or only get tagged?

| Option | Description | Selected |
|--------|-------------|----------|
| Transmit — tagged `development` | Full pipeline parity; verify init/scrubbing/ingest locally against `clmc-procurement-dev` before touching production. One dev's volume is small against 5,000/month | ✓ |
| Init but drop before send | Zero quota risk. Cost: end-to-end ingest can only be confirmed in production | |
| Opt-in via localStorage flag | Quota-safe default with an escape hatch. Cost: tribal knowledge, untested default path | |

**User's choice:** Transmit — tagged `development`

### Q4 — How OBS-06's production test event is triggered

| Option | Description | Selected |
|--------|-------------|----------|
| Permanent guarded global — `window.__sentryTest()` | No UI surface, callable from DevTools in production, re-runnable on every CSP-touching deploy. Follows the `__createTestNotification` precedent | ✓ |
| One-off, no code shipped | Throw manually from DevTools. Cost: re-verification becomes tribal knowledge and gets skipped | |
| Query param — `?__sentrytest=1` | Shareable link. Cost: publicly reachable error trigger on a production financial app | |

**User's choice:** Permanent guarded global — `window.__sentryTest()`

### Q5 — Bundle filename

| Option | Description | Selected |
|--------|-------------|----------|
| Neutral — `lib/obs.min.js`, comment explains | Self-hosting only dodges ad-blockers if the path doesn't announce itself; `sentry` in the path is still a filter-list match | ✓ |
| Honest — `lib/sentry.min.js` | Nobody has to decode it later. Cost: silently blocked on path-matching filter lists — the exact failure OBS-01 self-hosts to prevent | |
| You decide | Planner checks current filter-list behavior | |

**User's choice:** Neutral — `lib/obs.min.js`, comment explains

### Q6 — Where the two recurring verification gates are recorded

| Option | Description | Selected |
|--------|-------------|----------|
| Document both in `HEADERS-README.md` | File already exists and documents the header setup; both gates recur on every CSP-touching deploy, so they belong in a durable doc | ✓ |
| Plan steps only | Verified once, recorded in the phase SUMMARY. Cost: next person rediscovers the procedure from an archived phase dir | |
| Both — plan gates now, doc entry at Phase 120 | Fold into GUARD-02's CLAUDE.md work. Cost: 114→120 gap is undocumented | |

**User's choice:** Document both in `HEADERS-README.md`

---

## Claude's Discretion

- Exact `connect-src` host form (wildcard vs. exact `o<orgid>.ingest.<region>.sentry.io`) — decide once the DSN exists; prefer narrowest that works
- Whether SRI applies at all now that the bundle is self-hosted same-origin (research assumed a CDN tag)
- Exact contents and shape of the shared denylist constant (key list, regex, or both)
- Physical home of the `release` constant (`app/sentry-init.js` is the obvious fit)
- Plan/wave decomposition and where blocking human gates fall, beyond the opening DSN gate

## Deferred Ideas

- **Five archived monolith HTML URLs live in production** — `/finance.html`, `/mrf-submission-form.html`, `/archive/index.html`, `/archive/finance.html`, `/archive/mrf-submission-form.html`, all 200, each with its own hardcoded Firebase `apiKey`, all predating the v2.0 auth system. No backlog item opened per the user's decision; recorded as evidence only
- **Retiring `app/diagnostics.js`'s `client_errors` Firestore mirror** — revisit in Phase 116/120
- **Mirroring `last_hidden_ms` / `session_age_ms` onto the Sentry scope** — Phase 116's `reportError()` is the natural home
- **Consolidating `netlify.toml` and `_headers` to one authoritative file** — research-flagged hardening item beyond this milestone

## Corrections Raised During Discussion

Two planning-doc claims were contradicted by direct inspection and are recorded in CONTEXT.md:

1. `PROJECT.md:45` / `REQUIREMENTS.md:122` — "Firebase is production-only, no staging" is false. `app/firebase.js:59-86` routes localhost to a real `clmc-procurement-dev` project. Netlify is production-only; Firebase is not.
2. `PROJECT.md:43` — "**0** error sink" is false. `app/diagnostics.js` is a live sink with a localStorage buffer, console output, and a `client_errors` Firestore collection (rules at `firestore.rules:1288`).
