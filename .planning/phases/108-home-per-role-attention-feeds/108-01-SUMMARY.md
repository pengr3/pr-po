---
phase: 108-home-per-role-attention-feeds
plan: 01
subsystem: ui
tags: [home-feed, status-derivation, dlp, collectibles, rfp, strategy-a, extract-by-copy]

# Dependency graph
requires:
  - phase: 103-portfolio-redesign
    provides: getProjectSignal/getServiceSignal/getDlpState/stageDaysInStage/normalizeUpdatedAt/URGENCY_THRESHOLDS (canonical urgency formulas, private in projects.js/services.js)
  - phase: 99-collectibles
    provides: deriveCollectibleStatus/getCollectibleUrgency canonical formulas (private in finance.js)
  - phase: 107-command-center
    provides: Strategy A compute-on-load engine (locked) that these formulas feed
provides:
  - "app/status-derivation.js — leaf module of pure derivation formulas (no Firestore I/O, no heavy-view imports) for Phase 108 feed sources"
  - "Confirmed RFP due_date storage format = YYYY-MM-DD (go for Plan 02 source #9 string-range optimization)"
affects: [108-02, 108-03, 108-04, home-feed-sources]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extract-by-copy leaf module: private view helpers copied verbatim into a lightweight I/O-free module to keep the landing page off the heavy view import graph (Strategy A / 107 D-08)"

key-files:
  created:
    - app/status-derivation.js
  modified: []

key-decisions:
  - "Extract-by-copy (D-02 / Assumption A6): duplicate the canonical formulas into status-derivation.js rather than exporting from finance.js/projects.js/services.js, which would eager-load heavy routed views onto the landing page"
  - "Unified getEngagementSignal keeps the projects.js On-going activity clock; the services.js recurring-service divergence is accepted because feed severity is recomputed against D-01 bands, not signal.level"
  - "RFP due_date confirmed YYYY-MM-DD — Plan 02 source #9 may use where('due_date','<', todayISO) string-range instead of a full-collection scan"

patterns-established:
  - "status-derivation.js is the single go-forward home for pure status/urgency/DLP/collectible/RFP math; view-private copies flagged as hygiene duplication to be pointed here in a later pass"

requirements-completed: [HOME-09, HOME-10, HOME-11, HOME-12]

# Metrics
duration: ~12min
completed: 2026-07-11
---

# Phase 108 Plan 01: Status-Derivation Leaf Module Summary

**Created app/status-derivation.js — 7 pure derivation formulas + URGENCY_THRESHOLDS extracted verbatim from the private view helpers, importing only getRFPTotal from utils.js (zero Firestore I/O, zero heavy-view imports), and confirmed RFP due_date is stored as YYYY-MM-DD so Plan 02 source #9 can ship the string-range optimization.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-11T05:05:56Z
- **Tasks:** 2 (Task 1 code, Task 2 read-only verification)
- **Files created:** 1 (`app/status-derivation.js`)
- **Files modified:** 0

## Accomplishments

- **Task 1 —** New `app/status-derivation.js` leaf module. Exports the 7 formulas the Phase-108 feed sources need plus the `URGENCY_THRESHOLDS` constant, extracted-by-copy (verbatim math) from their canonical private locations with `// extracted-by-copy from <file>:<line>` provenance comments above each.
- **Task 2 —** Confirmed the RFP `due_date` storage format is `YYYY-MM-DD`, giving Plan 02 source #9 a definitive go on the `where('due_date','<', todayISO)` string-range read optimization (no full-collection scan needed).

## Exported API (status-derivation.js)

| Export | Kind | Source (extract-by-copy) |
|--------|------|--------------------------|
| `URGENCY_THRESHOLDS` | const (17-key object) | projects.js:53 |
| `normalizeUpdatedAt(v)` | function | projects.js:911 |
| `stageDaysInStage(p, now)` | function | projects.js:925 |
| `getDlpState(engagement)` | function | projects.js:897 (== services.js:952); param renamed project→engagement |
| `getEngagementSignal(p, now)` | function | projects.js:942 (getProjectSignal, renamed) |
| `deriveRFPStatus(rfp)` | function | finance.js:89 (uses exported getRFPTotal) |
| `deriveCollectibleStatus(coll)` | function | finance.js:110 |
| `getCollectibleUrgency(coll)` | function | finance.js:129 |

Plus one **internal, non-exported** helper `getDefaultOkSignal(p)` (projects.js:931), used by `getEngagementSignal`.

**`export function` count = 7** (satisfies the ≥7 acceptance criterion) plus `export const URGENCY_THRESHOLDS`.

## Zero heavy-imports confirmation (Strategy A preserved)

The module imports **exactly one** thing — `import { getRFPTotal } from './utils.js';` (line 30) — and nothing else. Verified by grep:

- `grep -c 'export function'` → **7** ✓
- `grep -n "from './utils.js'"` → single line `import { getRFPTotal } from './utils.js';` ✓ (only import in the file)
- `grep -nE "from '\./firebase\.js'|from '\./views/'"` → **no matches** ✓ (no Firestore SDK, no heavy routed-view import)
- `grep -nE "onSnapshot|getDocs|collection\(|query\("` → **no matches** ✓ (pure formulas, zero reads)
- `grep -n "return 'in-dlp'"` → match (getDlpState copied intact) ✓
- `grep -n "tier = 'critical'"` → match (getCollectibleUrgency 30-day critical band intact) ✓
- `node --check app/status-derivation.js` → **SYNTAX OK** ✓

Because the module carries no Firestore I/O and no `./views/` import, `home-feed-sources.js` (Plan 02) can import it without dragging finance.js/projects.js/services.js onto the landing-page critical path — the Strategy A "fast" mandate (107 D-08) stays intact.

### Runtime spot-checks — PENDING IN BROWSER

The two DevTools console assertions in the plan's acceptance criteria are browser-runtime checks and cannot be executed in this zero-build headless environment. They are recorded here as **pending-in-browser** for the verifier:

- `getDlpState({dlp_months:12, project_status:'Completed', dlp_expires_at:'2020-01-01', retention_released_at:null})` → expect `'expired'`. (Code inspection: dlp_months set + Completed + no retention_released_at + past expiry ⇒ falls to the `Date.now() > expires` branch ⇒ `'expired'`. ✓ by reasoning.)
- `deriveRFPStatus({payment_records:[], due_date:'2020-01-01'})` → expect `'Overdue'`. (Code inspection: totalPaid 0, total 0 ⇒ not Fully Paid; `new Date('2020-01-01') < new Date()` true ⇒ isOverdue ⇒ `'Overdue'`. ✓ by reasoning.)

## RFP due_date format — CONFIRMED YYYY-MM-DD

**Verdict: RFP `due_date` is stored as `YYYY-MM-DD`. Plan 02 source #9 MAY use `where('due_date','<', todayPlus7ISO)` (string-range) — the bounded recent-window scan fallback is NOT needed.**

Evidence (read-only inspection of `app/views/procurement.js`):

1. **Input is an HTML5 `type="date"` field** — three RFP modals, each with `<input type="date" id="rfpDueDate" ...>`:
   - line **1192**, line **1336**, line **1483** (`grep -c 'type="date" id="rfpDueDate"'` → **3**).
   An HTML5 `type="date"` input's `.value` is ALWAYS the `YYYY-MM-DD` string form (or `''` when empty) — never an ISO datetime or Date object.
2. **The three RFP save paths read that input's raw `.value` into `dueDate`:**
   - `const dueDate = document.getElementById('rfpDueDate')?.value;` at lines **1797**, **1942**, **2047**.
3. **…and write it directly to `due_date` with no transformation:**
   - `due_date: dueDate,` at lines **1873**, **1994**, **2097**.

No `new Date(...)` wrapping, no `.toISOString()`, no reformatting sits between read and write on any of the three paths — the stored value is exactly the `type="date"` string, i.e. `YYYY-MM-DD`. This matches the collectibles `due_date` shape already confirmed at finance.js:139 (`coll.due_date + 'T00:00:00'`), and it is consistent with how `deriveRFPStatus` compares it (`new Date(rfp.due_date)`, finance.js:93 — a `YYYY-MM-DD` string parses cleanly).

`procurement.js` was NOT modified (Task 2 is read-only).

## Task Commits

1. **Task 1: Create app/status-derivation.js with the extracted pure formulas** — `fca5c521` (feat)
2. **Task 2: Verify + record the RFP due_date storage format** — no code artifact (read-only verification; finding recorded in this SUMMARY, gates Plan 02 source #9)

**Plan metadata:** committed separately with this SUMMARY (docs).

## Files Created/Modified

- `app/status-derivation.js` (**created**) — leaf module: `URGENCY_THRESHOLDS` + `normalizeUpdatedAt`, `stageDaysInStage`, `getDlpState`, `getEngagementSignal`, `deriveRFPStatus`, `deriveCollectibleStatus`, `getCollectibleUrgency`; single import `{ getRFPTotal } from './utils.js'`.

## Decisions Made

- **Extract-by-copy over re-export (D-02 / A6):** formulas duplicated verbatim into the new leaf module rather than exporting them from the giant routed views, to keep the landing page off the heavy view import graph (Strategy A). Recorded as intentional hygiene duplication.
- **Unified `getEngagementSignal`:** copied from `getProjectSignal` (projects.js) — keeps the On-going activity clock. Documented in-file that services.js `getServiceSignal` diverges only in the On-going branch (recurring services are watch-only) and that this is harmless because feed severity is recomputed against the D-01 bands, not `signal.level` (RESEARCH gotcha 5).

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — the module is pure math over caller-supplied data; no placeholder/empty-value stubs and no data-wiring gaps (data wiring happens in Plan 02's sources).

## Hygiene / Duplication Recorded

- `status-derivation.js` now duplicates the private copies in `finance.js` / `projects.js` / `services.js`. A later pass should point those views at this shared module.
- Pre-existing (NOT introduced here): `deriveCollectibleStatus` is also inlined in `app/expense-modal.js` (noted at finance.js:106-108).

## Issues Encountered

None. (One benign Git warning: `LF will be replaced by CRLF` on the new file — standard autocrlf on Windows, no impact.)

## Next Phase Readiness

- **Plan 02 (home-feed-sources.js) is unblocked:** it can `import` all 7 formulas + `URGENCY_THRESHOLDS` from `./status-derivation.js`, and it has a definitive GO to use the `where('due_date','<', …)` string-range read for source #9 (overdue RFP payments).
- No Firestore index, security-rule, or data-migration work is introduced by this plan (pure read-derivation module + read-only inspection).

## Self-Check: PASSED

- `app/status-derivation.js` — FOUND
- Commit `fca5c521` — FOUND
- Grep acceptance-criteria (export count 7, single utils import, no firebase/views import, no Firestore I/O, in-dlp + critical bands present) — ALL PASS
- Task 2 grep (`type="date" id="rfpDueDate"` count = 3) — PASS

---
*Phase: 108-home-per-role-attention-feeds*
*Completed: 2026-07-11*
