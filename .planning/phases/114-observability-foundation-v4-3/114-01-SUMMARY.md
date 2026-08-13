---
phase: 114-observability-foundation-v4-3
plan: 01
subsystem: infra
tags: [sentry, observability, vendor-pin, supply-chain, csp, error-tracking]

# Dependency graph
requires: []
provides:
  - "lib/obs.min.js — self-hosted, version-pinned @sentry/browser 10.70.0 error-only bundle (90,586 bytes), exposing window.Sentry as a classic script"
  - "The resolved Sentry DSN, org id, region, project id and derived ingest host, recorded as literal values so plans 114-02/03/06 never re-ask a human"
  - "SHA-384 provenance digest + source URL for the vendor bundle, to be copied into CLAUDE.md by plan 114-04"
  - "The SRI decision (not applied) with its rationale, closing the CONTEXT.md 'Claude's Discretion' item"
  - "Two corrected acceptance criteria for the error-only-variant proof and the provenance cross-check"
affects: [114-02, 114-03, 114-04, 114-05, 114-06, 115, 116, 117, 118, 119, 120]

# Tech tracking
tech-stack:
  added: ["@sentry/browser 10.70.0 (self-hosted CDN bundle, error-only variant)"]
  patterns:
    - "Neutral vendor filenames for ad-blocker evasion: lib/obs.min.js never lib/sentry.min.js — filter lists match on the path, so self-hosting only works if the path does not announce itself (D-07)"
    - "Shim-presence as variant proof: the error-only Sentry bundle proves itself by containing console.warn shims ('even though this bundle does not include ...'), not by the absence of integration names"
    - "Pin-time provenance instead of runtime SRI: for same-origin self-hosted vendor assets, record the SHA-384 once at download and commit it to docs, rather than maintaining an integrity= attribute a build step would otherwise recompute"

key-files:
  created:
    - lib/obs.min.js
  modified: []

key-decisions:
  - "SRI is NOT applied. D-07 self-hosts same-origin, so an attacker who can alter lib/obs.min.js can equally alter the integrity attribute in index.html — the hash defends nothing and becomes a second hand-maintained constant to forget on every version bump, in a repo with no build step to recompute it. Provenance is established once at pin time instead."
  - "Pinned 10.70.0 with no tiebreaker needed — the 10.70.0 vs 10.69.0 dispute recorded in research no longer reproduces; GitHub tag_name and npm latest both report 10.70.0 as of 2026-08-13."
  - "The grep -c == 0 variant assertion in the plan is wrong and was replaced with a shim-adjacency assertion. Returning 1 is positive proof of the error-only bundle, not evidence of contamination."
  - "Two-source provenance is unattainable for this artifact and was recorded as a residual supply-chain risk rather than faked. @sentry/browser ships zero .min.js files on npm; the CDN bundles exist only on browser.sentry-cdn.com."

patterns-established:
  - "Load-bearing SUMMARY: when a plan's only durable output is resolved facts, the SUMMARY is the artifact downstream plans read, and every constant appears in it as a literal string rather than a reference"

requirements-completed: [OBS-01]

# Metrics
duration: multi-session (vendor pin 2026-08-13, gate resolved 2026-08-13)
completed: 2026-08-13
---

# Phase 114 Plan 01: Sentry Provisioning + Pinned Vendor Bundle Summary

**Pinned @sentry/browser 10.70.0 as the neutrally-named, self-hosted, error-only bundle `lib/obs.min.js` (90,586 bytes, SHA-384 recorded), and resolved the Sentry DSN into the org id, region and ingest host that plans 114-02, 114-03 and 114-06 consume as literal constants.**

## Performance

- **Duration:** multi-session — vendor pin landed ahead of the gate, SUMMARY blocked on the human DSN checkpoint
- **Tasks:** 2/2
- **Files modified:** 1 (`lib/obs.min.js`, created)

---

## Resolved Facts (the load-bearing section)

Plans 114-02, 114-03, 114-04 and 114-06 read this table instead of asking a human a second time.

### Sentry account (D-17)

| Fact | Literal value |
|------|---------------|
| **Full DSN** | `https://77a91db564b94b9e3ddb3106d6e6f928@o4511903390236672.ingest.us.sentry.io/4511903399673856` |
| Public key | `77a91db564b94b9e3ddb3106d6e6f928` |
| **Org id** | `4511903390236672` |
| **Region** | `us` |
| Project id | `4511903399673856` |
| **Derived ingest host** | `o4511903390236672.ingest.us.sentry.io` |
| Ingest origin for CSP `connect-src` (plan 114-03) | `https://o4511903390236672.ingest.us.sentry.io` |
| Plan tier | Free Developer (1 seat, 5,000 events/month, 30-day retention) |
| Platform | Browser JavaScript (plain) |
| Replay / Tracing / Profiling | Not enabled |
| Loader Script | Not used — this phase self-hosts a pinned bundle |

The ingest host satisfies the plan's `o[0-9]+\.ingest\.[a-z]+\.sentry\.io` key-link pattern.

**On DSN secrecy:** a Sentry DSN is a public, write-only ingest key by design. It authorizes event
submission only, never dashboard read. It is committed to `app/sentry-init.js` in plan 114-02.
This project has no `.env` and no server to proxy through; treating it as a secret would be
cargo-cult. See threat T-114-03 (accepted).

### Vendor bundle (OBS-01, D-07)

| Fact | Literal value |
|------|---------------|
| **Resolved version** | `10.70.0` |
| GitHub `tag_name` (live, 2026-08-13) | `10.70.0` |
| npm `@sentry/browser` `latest.version` (live, 2026-08-13) | `10.70.0` |
| Version dispute outcome | **No dispute.** Both sources agree; the "pin the lower of the two" tiebreaker was not exercised. |
| **Source URL** | `https://browser.sentry-cdn.com/10.70.0/bundle.min.js` |
| Download date | 2026-08-13 (re-verified byte-identical on 2026-08-13) |
| Committed path | `lib/obs.min.js` |
| Size | 90,586 bytes (ceiling 150,000 ✓) |
| Banner | `/*! @sentry/browser 10.70.0 (0356ffd) \| https://github.com/getsentry/sentry-javascript */` |
| Banner version vs resolved version | Match ✓ |
| **SHA-384 (base64)** | `79FhSq4eaPA7rdWwXh1Jly3F3Wvgq7HChMpaIIx7feYEZicWt/LnwIfTFTXSJao5` |
| Line endings | Pure LF — 0 CRLF, 3 LF, 0 bare CR |
| jsDelivr cross-check | **Impossible — see Deviation 2.** Not a match, not a mismatch. |
| SRI | **Not applied** — see below |

Plan 114-04 copies the version, source URL and SHA-384 into `CLAUDE.md`.

### SRI decision (closes the CONTEXT.md discretion item)

**SRI is not applied, and `index.html` must contain zero `integrity=` attributes.**

Research assumed a third-party CDN `<script>` tag, where `integrity` protects against a remote
origin serving different bytes at runtime. D-07 self-hosts same-origin, so any attacker who can
alter `lib/obs.min.js` can equally alter the `integrity` attribute in `index.html` — the hash
defends nothing while becoming a second hand-maintained constant to forget on every version bump,
in a repo with no build step to recompute it. Provenance is instead established **once, at pin
time**, by the SHA-384 above, which plan 114-04 records in `CLAUDE.md` so a future re-download can
be eyeball-verified. Plan 114-04 asserts the zero-`integrity=` condition.

---

## Task Commits

1. **Task 1: Create Sentry org + browser-JS project, capture the DSN** — human-action checkpoint, no commit (input gate)
2. **Task 2: Resolve version, commit `lib/obs.min.js`, establish provenance** — `8287521` (chore)

**Interim handoff:** `7ceb60d` (docs — resolved facts persisted while the gate was open; `.continue-here.md`, deleted by this plan's completion commit)

## Files Created/Modified

- `lib/obs.min.js` — self-hosted, pinned @sentry/browser 10.70.0 error-only bundle. Inert until plan 114-04 adds the `<script>` tag.

## Verification

| Acceptance criterion | Result |
|---|---|
| `test -f lib/obs.min.js` | ✓ |
| Banner present, version matches resolved version | ✓ `10.70.0 (0356ffd)` |
| `wc -c < lib/obs.min.js` under 150000 | ✓ 90,586 |
| Error-only variant proven | ✓ via corrected shim-adjacency assertion (Deviation 1) |
| `ls lib/` lists exactly `signature_pad.umd.min.js` + `obs.min.js` | ✓ no sidecar hash file, no `sentry.min.js` |
| `git show --stat 8287521` lists exactly one path | ✓ `lib/obs.min.js` |
| `git diff --name-only $BASE..HEAD -- index.html` empty | ✓ (`$BASE` = `bab2f76`) |
| SUMMARY carries DSN, ingest host, version, digest, URL, cross-check result, SRI rationale | ✓ this document |
| Nothing pushed to `origin` | ✗ **violated — see Deviation 3** |

---

## Deviations from Plan

### 1. [Corrected assertion] The `grep -c … == 0` variant test is invalid

- **Found during:** Task 2 verification
- **Issue:** The plan asserts `grep -c "replayIntegration"`, `grep -c "browserTracingIntegration"` and `grep -c "feedbackIntegration"` each output `0`. On the real error-only bundle they each output `1`.
- **Why the plan was wrong:** the matches are *shim stubs*, not implementations:
  - `t.replayIntegration=function(t){return u(()=>{console.warn("You are using replayIntegration() even though this bundle does not include replay.")})…`
  - `const Vr=t=>(u(()=>{console.warn("You are using browserTracingIntegration() even though this bundle does not include tracing.")})…`
  - `Xr=Object.assign(t=>(u(()=>{console.warn("You are using feedbackIntegration() even though this bundle does not include feedback.")})…`
- **Corrected assertion:** each integration name appears **adjacent to the string `even though this bundle does not include`**. The tracing/replay/feedback bundles contain the real implementations and carry no such warning, so shim presence is *positive proof* of the error-only variant — a strictly stronger check than the absence test the plan specified.
- **Impact on T-114-02 (wrong bundle variant):** still mitigated, by the corrected assertion plus the 90,586-byte size (tracing+replay variants are roughly 3x).

### 2. [Impossible as specified] The jsDelivr two-source provenance cross-check

- **Found during:** Task 2 step (c)
- **Issue:** `https://cdn.jsdelivr.net/npm/@sentry/browser@10.70.0/build/bundle.min.js` returns **404**.
- **Root cause — not a transient CDN miss:** the npm package ships **zero** `.min.js` files. Verified via the jsDelivr package-file API: 204 `.js` files, all under `build/npm/`, none minified. The GitHub release tarball `sentry-browser-10.70.0.tgz` was also unpacked and searched — 0 matching bundle files. The prebuilt CDN bundles are published **only** to `browser.sentry-cdn.com`.
- **Disposition:** no second origin serves these bytes, so two-source provenance cannot be established for this artifact **by any route**. Per the plan's explicit instruction, this is recorded as a **residual supply-chain risk against T-114-01** rather than silently proceeding as if it matched.
- **Compensating control actually achieved:** the committed bytes were re-fetched from `browser.sentry-cdn.com` and are byte-identical (`cmp` clean) to the repo copy, and the SHA-384 is recorded here and (plan 114-04) in `CLAUDE.md`, making any future drift diffable.

### 3. [Constraint violated] `8287521` was pushed to `origin/main`

- **Found during:** pre-SUMMARY state audit
- **Issue:** the plan states *"Do NOT push to `origin` in this plan. The production deploy is a single, gated event in plan 114-05."* `8287521` is present on `origin/main`, so Netlify has already auto-deployed `lib/obs.min.js`.
- **Blast radius: nil.** `obs.min.js` is referenced nowhere outside `.planning/` — no `<script>` tag, no `_headers` entry, no `netlify.toml` entry. `index.html` is untouched since `$BASE`. The file is an inert 90 KB asset with zero runtime effect; no half-wired Sentry shipped.
- **Disposition:** not reverted. Reverting would add a deploy event rather than remove one, and the substance of the constraint (never ship a partially-wired Sentry) was never breached — only its letter.
- **Carried forward as a constraint on waves 2–4:** commits from plans 114-02, 114-03 and 114-04 **must accumulate locally and must not be pushed** until plan 114-05's gated deploy. Those plans *do* wire Sentry, so the same slip there would deploy a half-configured error reporter to production.

---

**Total deviations:** 3 (2 corrected plan assertions, 1 violated constraint with nil blast radius)
**Impact on plan:** No scope creep. Deviations 1 and 2 replace two unsound verification steps with sound ones and convert an unattainable check into a recorded risk. Deviation 3 is a process slip already committed, contained, and converted into an explicit guard on the next three plans.

## Issues Encountered

The human-action DSN gate (Task 1) blocked this SUMMARY across sessions while Task 2's code was
already committed — leaving the plan looking like a failed executor (commits present, SUMMARY
absent) to the safe-resume gate. The non-DSN facts had been derived and lost to a context reset
once already; they were re-derived and persisted to `.continue-here.md` (`7ceb60d`) before the
gate was presented a second time, so the third derivation never happened.

## User Setup Required

Complete. A Sentry organization and Browser-JavaScript project exist on the free Developer tier,
and the DSN is recorded above. No further human action is required until plan 114-05's deploy gate.

## Next Phase Readiness

**Wave 2 is unblocked.** Plans 114-02 and 114-03 have no `files_modified` overlap
(`app/sentry-init.js` vs `_headers`/`netlify.toml`/`HEADERS-README.md`) and can run in parallel.

- **114-02** consumes the full DSN literal for `Sentry.init()`.
- **114-03** consumes `https://o4511903390236672.ingest.us.sentry.io` for `connect-src` in all four CSP occurrences.
- **114-04** consumes the version, source URL and SHA-384 for `CLAUDE.md`, and must assert zero `integrity=` attributes in `index.html`.
- **114-06** consumes the DSN/project id for the production test event.

**Standing constraint:** do not `git push` until plan 114-05. See Deviation 3.

---
*Phase: 114-observability-foundation-v4-3*
*Completed: 2026-08-13*
