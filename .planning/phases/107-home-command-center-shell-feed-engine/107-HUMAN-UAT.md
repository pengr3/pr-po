---
status: partial
phase: 107-home-command-center-shell-feed-engine
source: [107-VERIFICATION.md]
started: "2026-07-10T04:00:48.000Z"
updated: "2026-07-11T01:47:35.000Z"
---

## Current Test

[testing paused — original 6/8 passed (Tests 4 & 5 blocked on feed data). 107.5/107.6 redesign follow-up (below): layout ✓ + refresh perf ✓ confirmed on localhost 2026-07-11; New Engagement cross-role type-scoping PENDING (needs ops_admin/services_admin accounts).]

## Tests

Phase 107 is a browser-only SPA surface with no headless harness. The static substrate for every item below is verified in code (`107-VERIFICATION.md`, status `passed`); these are the runtime/visual confirmations a human must click through.

### 1. Command Center shell + sub-nav
expected: On landing, `#/` shows a single ~1080px Command Center column; the sub-nav shows **Command Center** (active) + **Proposals**; the Dashboard tab is hidden. Clicking Proposals still loads the existing scorecards + table unchanged.
result: pass
note: "VISUAL SUPERSEDED by 107.5 — the single-column layout is now a contained two-column shell with an underline tab bar. Re-verified under follow-up R1 below."

### 2. Severity tiers + calm empty state
expected: A busy feed shows visually distinct **critical (red)** / **high (amber)** / **medium (blue)** left rails + row tints. An empty scope shows the calm green "You're all caught up" card (not a void).
result: pass

### 3. Briefing header + role-gated + New Proposal
expected: Greeting reads `Good {morning/afternoon/evening}, {FirstName}.` with a dated one-liner counting items needing attention (count tone: red if a critical item exists, amber if a high item, neutral otherwise). `+ New Proposal` appears ONLY for super_admin / operations_admin / services_admin and opens the engagement modal — rendered once, no form-id collision.
result: pass
note: "SUPERSEDED by 107.5 — the CTA is now '+ New Engagement' (opens the same form) and the role chip was removed. Re-verified under follow-up R2 below."

### 4. Feed rank order + deep-link dispatch + Refresh
expected: Rows are ordered critical → high → medium. Clicking a proposal-approval row opens the EXISTING approve modal; clicking a rejected-MRF row navigates to `#/procurement/records`. `↻ Refresh` re-runs compute-on-load and updates the "Updated …" caption. (No mark-as-read side effects.)
result: blocked
blocked_by: other
reason: "NO DATA TO SIMULATE THIS — no pending proposal-approval row or rejected-MRF row in the feed to click; revisit once such an item exists"

### 5. Scoped feed assembly (data)
expected: Signed in as a super_admin approver with a pending proposal, the feed shows ≥1 item including a proposal-approval row; a user with no scoped items sees the calm empty card; a total fetch failure shows the neutral error card with Retry.
result: blocked
blocked_by: other
reason: "same, no data — no pending proposal in scope to produce a proposal-approval row; revisit once such an item exists"

### 6. Role-tailored KPI chips
expected: super_admin sees ~4 chips incl. **Needs Attention** (danger-tinted if a critical item exists); finance sees only **PRs/TRs to Approve** (Collectibles/Payables intentionally omitted — derived arithmetic, not queryable); procurement_staff sees MRFs Pending + Active POs + Needs Attention; a *_user sees My Open Items / For-Revision. No chip renders as `0` or `—`.
result: pass
note: "Super Admin showed 4 chips (11 Active Projects / 11 Active Services / 0 Proposals to Approve / 0 Needs Attention). The two `0` chips are working-as-designed: the omit rule drops only UNRESOLVABLE (null) counts; a resolved 0 is shown intentionally. User accepted as-is. The test-criterion phrase 'No chip renders as 0' was imprecise wording — actual contract is 'never render `—`/blank placeholder'."

### 7. Your Work panel — buckets + hide-when-empty
expected: An operations_user with a for-revision proposal + assigned codes + a submitted MRF sees all three buckets (Proposals for revision / Assigned projects & services / Submitted MRFs), each ≤5 rows with `+N more`. A user with no owned items sees the whole Your Work panel hidden. SEE_ALL roles omit the assigned-codes bucket.
result: pass

### 8. Recent Activity (read-only) + permission-gated door rail
expected: Recent Activity lists the user's latest notifications; clicking a row navigates WITHOUT marking it read. The door rail shows only the areas the role can reach (mirrors `getCurrentPermissions().tabs[route].access`) and each of the 5 tiles (📋 Clients · 🏗️ Projects · 🔧 Services · 🛒 Procurement · 💰 Finance) navigates.
result: pass

## Summary

total: 8
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 2

(Plus the 107.5/107.6 redesign follow-up below: R1 ✓ · R3 ✓ · R2 partial.)

## Gaps

[none — Tests 4 & 5 are blocked on feed-data availability, not defects.]

## 107.5 / 107.6 Redesign — Follow-up Verification (2026-07-11)

After operator review of the shipped Command Center, the shell was redesigned (107.5) and the
feed engine optimized (107.6). These supersede the original visual expectations in Tests 1 & 3.
Commits: `efd21165` (layout) · `d3b94294` (New Engagement type-scoping) · `4bd063fa` (perf).

### R1. Contained two-column shell (107.5)
expected: One cohesive white shell (not scattered cards on gray); an integrated underline tab bar
  (Command Center | Proposals) at the top — NO centered "CLMC / Management System Portal" brand
  block and NO role chip; feed in the left column, Your Work + Recent Activity stacked in the right
  column (right side no longer empty). Reverses the approved D-03 single-column layout; collapses to
  one column ≤900px for Phase 111 mobile.
result: pass
note: "Operator confirmed 'much better now' on localhost, 2026-07-11."

### R2. New Engagement CTA — relabel + role/department type-scoping (107.5)
expected: The briefing CTA reads `+ New Engagement` (was `New Proposal`) and opens the existing
  engagement form. Type options scoped by role: super_admin → Project + One-time + Recurring;
  operations_admin → Project only; services_admin → One-time + Recurring only (client field required).
result: partial
reason: "Relabel + super_admin (all three types) path confirmed. Cross-role scoping (operations_admin
  Project-only / services_admin Service-only, client-required) PENDING a browser check on those
  accounts — not yet exercised."

### R3. Refresh performance (107.6 — Strategy A)
expected: Refresh recomputes via concurrent waves (parallelized sources/buckets/counts +
  getAggregateFromServer count-aggregation; no full-collection `pos` scan); feels near-instant; shows
  the same numbers as before; adds no listeners (`onSnapshot` stays 1); Refresh is debounced.
result: pass
note: "Operator confirmed refresh 'feels instant' on localhost, 2026-07-11."
