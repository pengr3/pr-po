---
phase: 108-home-per-role-attention-feeds
reviewed: 2026-07-12T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - app/status-derivation.js
  - app/home-feed-sources.js
  - app/home-feed.js
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 108: Code Review Report

**Reviewed:** 2026-07-12
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Phase 108 adds two new leaf modules (`status-derivation.js`, `home-feed-sources.js`) and slims
the locked `home-feed.js` engine. The implementation is high quality: the review verified the
things most likely to break silently and they hold up.

Verified clean:
- **Extract-by-copy fidelity (100%).** All 7 derivation formulas + `URGENCY_THRESHOLDS` in
  `status-derivation.js` are byte-faithful to their cited originals (`projects.js:53/897/911/925/931/942`,
  `finance.js:89/110/129`). `getEngagementSignal` matches `getProjectSignal` through every branch,
  including the section-(4) DLP-soon watch and section-(5) On-Track tail. Param rename
  `project→engagement` in `getDlpState` is cosmetic only. No dropped branches, no logic drift.
- **Status casing.** Every case-sensitive literal is correct against the live writers: lowercase
  `'pending'` for `billing_requests`/`users`, lowercase `'open'` for issues, lowercase
  `'pending_internal'`/`'for_revision'` for proposals; Capitalized `'Pending'`/`'Rejected'`/
  `'Delivered'`/`'Completed'`/`'On-going'`/`'Pending Procurement'` for prs/trs/mrfs/pos/projects/services.
- **Engine is untouched.** `SEVERITY`, `rankItems`, `dedupeItems`, `assembleFeed` are byte-identical
  to the `a1316dbc` base.
- **Access control.** Every portfolio source self-scopes via `getAssigned*Codes()` (null=see-all,
  []=none boundary handled), the approver gate on `sourceProposalsAwaitingApproval` is intact
  `['super_admin','operations_admin']`, and `getSourcesForUser` fails closed (no-user/unknown-role → `[]`).
- **Registry integrity.** All 20 source names referenced in `ROLE_SOURCES` are defined and exported;
  hoisting avoids any TDZ. The `SEVERITY` import cycle is benign (read only inside function bodies).
- **Strategy A.** No `onSnapshot`; every costly source (#9/#14/#17/#19) carries a server `where()`
  before any client filter; `#6` fan-out chunks `in` at ≤10 and caps the parent set.
- **XSS.** Renderer (`home.js:202/214/215`) escapes `title`/`subtitle` via `escapeHTML`; `icon` is a
  trusted TYPE_META SVG constant. Safe (see IR-03 for the coupling note).

Findings below are correctness/robustness gaps, none blocking.

## Warnings

### WR-01: Collectibles-overdue query uses UTC date, but the canonical overdue test is LOCAL midnight — misses same-boundary overdue collectibles during the PH early-morning window

**File:** `app/home-feed-sources.js:267-272` (`sourceCollectiblesOverdue`)
**Issue:** The server scope is built from a UTC calendar date:
```js
const todayISO = new Date().toISOString().slice(0, 10);   // UTC date
... where('due_date', '<', todayISO)
```
but the canonical overdue definition — `getCollectibleUrgency` (extract-by-copy from `finance.js:129`)
— is **local midnight** (`today.setHours(0,0,0,0)` and `new Date(coll.due_date + 'T00:00:00')`).
For a PH user (UTC+8), between local 00:00 and 08:00 the UTC date lags one calendar day, so the query
emits `due_date < yesterday-local`. A collectible whose `due_date` equals the current UTC date is
**overdue by the canonical local test yet excluded from the query result** — the client filter
(`deriveCollectibleStatus === 'Overdue'`) can only drop rows, never recover the missing one. Result: a
recurring ~8-hour daily window where just-turned-overdue collectibles silently never appear on the
Command Center. (The sibling `sourceOverdueRfpPayments` is unaffected because its `today+7d` lookahead
absorbs the 1-day skew and it re-derives client-side.)
**Fix:** Build the cutoff from local date with a day of slack and let `deriveCollectibleStatus` do the
precise filter (mirrors the RFP source's generous-query + client-filter pattern):
```js
const d = new Date(); d.setHours(0, 0, 0, 0);
const t = new Date(d.getTime() + 86400000);   // tomorrow, local
const cutoffISO = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
... where('due_date', '<', cutoffISO)   // client filter already excludes not-yet-overdue
```

### WR-02: `sourceOpenIssues` parent cap starves the second collection — a see-all dept-admin with ≥60 projects loses ALL service issues

**File:** `app/home-feed-sources.js:749` (`sourceOpenIssues`)
**Issue:**
```js
const parents = projParents.concat(svcParents).slice(0, OPEN_ISSUES_PARENT_CAP);   // cap = 60
```
The cap is applied AFTER concatenation with projects always first. For a see-all dept admin
(`getAssignedProjectCodes()` → null enumerates every project) with ≥60 projects, `projParents`
consumes the entire cap and `svcParents` is dropped in full — every open issue on the viewer's
cross-assigned services silently disappears. The 60-parent bound is intended, but the ordering bias
turns "bounded sample" into "one collection can be 100% hidden."
**Fix:** Split the budget per collection (or interleave) so neither is starved:
```js
const half = Math.floor(OPEN_ISSUES_PARENT_CAP / 2);
const parents = projParents.slice(0, OPEN_ISSUES_PARENT_CAP - Math.min(half, svcParents.length))
    .concat(svcParents.slice(0, half));
```

### WR-03: The "even a mis-listed source returns [] rather than leaking (fail-closed)" invariant is false for the ~10 functional-queue sources

**File:** `app/home-feed-sources.js:916-918` (registry header) — applies to the un-gated sources at
`:66, :97, :129, :161, :188, :227, :267, :306, :355, :392`
**Issue:** The registry header asserts every source "ALSO self-gates the DATA it returns ... so even a
mis-listed source returns [] rather than leaking (T-108-02, fail-closed)." That is true only for the
approver-/ownership-/assignment-scoped sources. The finance & procurement functional-queue sources
(`sourcePendingPRs`, `sourcePendingTRs`, `sourceBillingRequestsToDecide`, `sourceMrfsPendingProcessing`,
`sourceAgingPOs`, `sourceRejectedTRs`, `sourceDeliveredPOsMissingProof`, `sourceOverdueRfpPayments`,
`sourceCollectiblesOverdue`, `sourceRetentionReleases`) have **no internal gate** — they return the full
collection-wide queue to whatever role they are listed under. The current `ROLE_SOURCES` is correct, so
there is no live leak, but a future edit that adds one of these to a portfolio/user role would disclose
the entire finance/procurement queue with no second line of defense, contrary to the stated invariant.
**Fix:** Either correct the comment to scope the fail-closed claim to the self-scoping sources, or add
defense-in-depth role gates to the functional-queue sources, e.g. at the top of the finance ones:
```js
if (!['finance', 'super_admin'].includes(user?.role)) return [];
```
so registry placement is not the sole access control.

## Info

### IR-01: `sourceAgingPOs` `in` filter contains an undocumented `'Pending'` status

**File:** `app/home-feed-sources.js:358`
**Issue:** `where('procurement_status', 'in', ['Pending Procurement', 'Pending', 'Procuring', 'Procured'])`
includes a bare `'Pending'`, which is not a documented `pos.procurement_status` value (schema:
`Pending Procurement | Procuring | Procured | Delivered`). Harmless (matches nothing) but reads as a
copy/confusion artifact.
**Fix:** Drop `'Pending'` unless legacy PO docs are known to carry it; if they do, add a code comment.

### IR-02: Pending user-registration rows are categorised `'issue'`, mislabelling their roll-up

**File:** `app/home-feed-sources.js:454`
**Issue:** `sourcePendingUserRegistrations` emits `category: 'issue'`. The item's own `deepLink`
(`#/admin?section=user-management`) is correct, but if ≥5 registrations roll up, the synthetic row
renders "+N more Issues" and links to `categoryListRoute('issue') = '#/'`, not the user-management
screen. Cosmetic (super_admin's set has no other `issue` source, so no bucket mixing today).
**Fix:** Give registrations a dedicated category (e.g. `'user'`) wired into `CATEGORY_LABEL` /
`categoryListRoute` in `home-feed.js`, or accept the label as intended.

### IR-03: Sources emit raw user-controlled strings; XSS safety depends entirely on the renderer

**File:** `app/home-feed-sources.js` (all `title`/`subtitle` builders) → rendered in `app/views/home.js:202,214-215`
**Issue:** Titles/subtitles carry unescaped user input (`project_name`, `supplier_name`, `issue.title`,
`p.title`, `target_client_name`, etc.). This is safe today only because `home.js` wraps every
`title`/`subtitle` in `escapeHTML`. No action needed for this phase; recorded so the contract ("sources
produce plain text; the renderer MUST escape") is not silently broken by a future alternate renderer.
**Fix:** None required. Keep the escaping contract documented in the D-11 item contract comment.

### IR-04: Derivation math is now duplicated in a 4th location (accepted tech debt)

**File:** `app/status-derivation.js:24-27` (whole module)
**Issue:** The 7 formulas are transcribed verbatim from `projects.js`/`services.js`/`finance.js`
(and `deriveCollectibleStatus` is also inlined in `expense-modal.js`). Fidelity was verified as exact,
and the file header explicitly accepts this as temporary duplication with a later pass pointing the
views here — so this is by design, not drift.
**Fix:** Track the follow-up to re-point the routed views at `status-derivation.js` so the copies cannot
diverge; no change this phase.

---

_Reviewed: 2026-07-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
