---
phase: 107-home-command-center-shell-feed-engine
verified: 2026-07-10T03:57:26Z
status: passed
score: 21/21 statically-verifiable must-haves verified (4 ROADMAP success criteria + 17 plan truths)
overrides_applied: 0
re_verification:
  # Initial verification — no prior VERIFICATION.md existed.
human_verification:  # Browser-UAT flags — routine for a browser-only SPA with no headless harness. NOT blockers; the static substrate (markup, classes, wiring, queries) is verified in code.
  - test: "Landing shows a single 1080px Command Center column stacking Briefing → KPI → Feed → (Your Work | Recent Activity) → Door rail; sub-nav shows Command Center (active) + Proposals; Proposals tab still loads its scorecards+table."
    expected: "Correct vertical order + working sub-nav; Proposals tab unchanged."
    why_human: "Visual layout + role-session behavior; cannot render headless."
  - test: "A busy feed shows distinct critical(red)/high(amber)/medium(blue) 4px rails + tints; an empty feed shows the green calm 'You're all caught up' card."
    expected: "Three visually distinct severity tiers; calm green empty card."
    why_human: "Visual/CSS appearance; not observable statically."
  - test: "Greeting reads 'Good {morning/afternoon/evening}, {FirstName}.'; the dated one-liner shows the live attention count tone-colored (danger if any critical, warn if any high); '+ New Proposal' appears only for super_admin/operations_admin/services_admin and opens the engagement modal rendered once (no fixed-id collision)."
    expected: "Correct greeting/date/count + gated CTA opening a single engagement modal."
    why_human: "Depends on time-of-day, live feed data, signed-in role, and DOM interaction."
  - test: "Feed rows rank critical→high→medium; clicking a proposal-approval row opens the existing approve modal (window.homeQueueOpenApproveModal); clicking a rejected-MRF row navigates to #/procurement/records; Refresh updates the 'Updated …' caption; an empty scope shows the calm card."
    expected: "Correct ordering + route/modal deep-link dispatch + working Refresh."
    why_human: "Requires live Firestore data + a signed-in session + click interaction."
  - test: "assembleFeed(getCurrentUser()) signed in as super_admin with a pending proposal resolves with total ≥ 1 and a 'proposal-approval:*' item; rankItems([medium,critical,high]) returns critical/high/medium."
    expected: "Non-empty scoped feed for an approver; correct rank order."
    why_human: "Requires live Firestore + auth session (engine logic validated via node unit checks per 107.2 SUMMARY)."
  - test: "KPI chips per role: super_admin sees ~4 chips incl. Needs Attention (danger-tinted when a critical item exists); finance sees only PRs/TRs to Approve (money chips omitted); procurement_staff sees MRFs Pending + Active POs + Needs Attention; a *_user sees My Open Items / For-Revision."
    expected: "Role-correct chip sets; unresolved chips omitted (never 0/—)."
    why_human: "Role-session + live getDocs counts; cannot resolve headless."
  - test: "An operations_user with a for-revision proposal + assigned codes + a submitted MRF sees all three Your Work buckets; a finance user (no owned items) sees the Your Work panel hidden entirely."
    expected: "Buckets appear/hide by ownership; panel hidden when all empty."
    why_human: "Depends on live per-user data + role."
  - test: "Recent Activity lists the user's latest notifications read-only (clicking navigates WITHOUT marking read); the door rail shows only reachable areas per role and each tile navigates."
    expected: "Read-only activity slice + permission-gated door tiles that navigate."
    why_human: "Live notifications + permissions + click navigation."
---

# Phase 107: Home — Command Center Shell & Feed Engine — Verification Report

**Phase Goal:** Replace the thin landing page with a role-aware Command Center — a personalized greeting, a permission/assignment-scoped "Needs your attention" feed (severity-ranked, deep-linked, with a calm empty state), quick-KPI chips, a "Your work" panel, a "Recent activity" panel, and the five reachable area nav cards.
**Verified:** 2026-07-10T03:57:26Z
**Status:** passed
**Re-verification:** No — initial verification.

## Verdict

Every statically-verifiable must-have holds in the codebase. No must-have is violated in code. Both delivered JS modules pass `node --check`. All cross-module contracts resolve against their real source files. The Phase-106-derived listener invariant holds exactly. The residual items are routine browser-UAT flags (visual/role-session behaviors) that cannot be exercised in a headless environment — listed under Human Verification for tracking, not as blockers.

## Goal Achievement

### Observable Truths — ROADMAP Success Criteria (the contract)

| # | Truth (ROADMAP SC) | Status | Evidence |
| --- | --- | --- | --- |
| SC1 | Landing shows personalized greeting (name + date) + one-line attention count | ✓ VERIFIED | `renderBriefing()` home.js L109-146: `Good ${timeWord}, ${escapeHTML(firstName)}.` + dated `.cc-attn-line` reading `feed.total`, tone `cc-attn-count--danger`/`--warn` |
| SC2 | "Needs your attention" feed shows only permitted+assigned items, severity-ranked (critical/high/medium), clickable to record/action | ✓ VERIFIED | Scoping in home-feed.js sources (approver gate L256, `created_by==uid` L303, `requestor_name==full_name` L336); `rankItems` L90-100; deep-link dispatch `ccOpenFeedItem` L1285-1296 (route + modal) |
| SC3 | Nothing pending → calm "You're all caught up" state, no filler rows | ✓ VERIFIED | `renderFeed()` L246-253 renders `.cc-empty` calm card when `feed.total === 0`; engine sets `total` excluding rollup rows (home-feed.js L219) |
| SC4 | KPI chips + Your Work + Recent Activity summarize scope, 5 nav cards remain reachable | ✓ VERIFIED | `renderKpiChips` L408, `renderYourWork` L512, `renderRecentActivity` L595, `renderDoorRail` L642 — all mounted from `init()` L1224-1227 |

### Observable Truths — Plan-level must_haves (17, all verified statically)

| # | Plan | Truth | Status | Evidence |
| --- | --- | --- | --- | --- |
| 1 | 107.1 | Severity tiers distinguishable by 4px left rail + row tint | ✓ VERIFIED | views.css `.cc-feed-row--critical/high/medium` present; rail wired `border-left-color:var(--cc-critical)` |
| 2 | 107.1 | Empty state renders as calm green gradient card | ✓ VERIFIED | `.cc-empty { linear-gradient(135deg,#ecfdf5,#fff) }` in views.css; consumed by renderFeed L248 |
| 3 | 107.1 | KPI chips reuse scorecard look; doors compact | ✓ VERIFIED | `.cc-kpi-chip` + `.project-scorecard-card` reuse; `.cc-door` compact tile (no paragraph/button) |
| 4 | 107.2 | Engine ranks critical→high→medium, then overdue/newest | ✓ VERIFIED | `rankItems` SEVERITY_RANK asc, overdueScore desc, timestamp desc (home-feed.js L90-100) |
| 5 | 107.2 | Dedupe keeps highest-severity instance | ✓ VERIFIED | `dedupeItems` L106-120 keeps lowest SEVERITY_RANK |
| 6 | 107.2 | Cap 8/25, roll up ≥5 same-category | ✓ VERIFIED | `capItems` slice(0,8)/slice(8,25)/overflow L176-182; `rollUpByCategory` ≥5→keep 3 + synthetic row L128-168 |
| 7 | 107.2 | Each seed source returns only scoped items | ✓ VERIFIED | 3 sources self-gate + issue scoped `where()` queries (L254-358) |
| 8 | 107.2 | Empty assembled feed detectable (total===0) | ✓ VERIFIED | assembleFeed returns `total` excluding rollups; distinct `allSourcesFailed` L219-222 |
| 9 | 107.3 | Greeting + dated one-liner render from live feed.total | ✓ VERIFIED | renderBriefing L121-139 |
| 10 | 107.3 | Command Center default; Proposals non-default; Overview+Engagements retired | ✓ VERIFIED | render L682-687 (homeTabCommand active); `homeTabOverview`/`homeTabEngagements`/`homeEngagementsContent`/`dept-cards` = 0 occurrences |
| 11 | 107.3 | Feed renders scoped, severity-ranked, clickable rows | ✓ VERIFIED | renderFeed/renderFeedRow L194-276; role=button/tabindex/onkeydown a11y |
| 12 | 107.3 | Empty→calm card; total failure→neutral error + Retry | ✓ VERIFIED | renderFeed L239-253 (error `Couldn't load your feed` + Retry; calm empty) |
| 13 | 107.3 | 3 loadStats listeners removed; Refresh compute-on-load; no new listeners | ✓ VERIFIED | `onSnapshot(` = 1 (only `_proposalListener` L1126); loadStats/getDashboardMode/procurementCardHtml/statsListeners = 0; ccRefreshFeed re-runs assembleFeed (no onSnapshot) |
| 14 | 107.4 | Role-tailored KPI chips; omit-on-unresolved (never 0/—) | ✓ VERIFIED | renderKpiChips L408-471; `ccCountDocs` returns null→chip skipped; `if (x != null) chips.push(...)` guards |
| 15 | 107.4 | Your Work 3 buckets, each hidden when empty; panel hides when all empty | ✓ VERIFIED | renderYourWork L512-576; buckets pushed only when `.length>0`; SEE_ALL omits bucket b; panel display:none when 0 buckets |
| 16 | 107.4 | Recent Activity read-only notifications slice (no mark-as-read) | ✓ VERIFIED | renderRecentActivity L595-635 getDocs where user_id==uid orderBy created_at desc limit(8); `markNotificationRead` = 0 |
| 17 | 107.4 | 5 nav doors as compact tiles, gated per role (mirrors auth.js) | ✓ VERIFIED | renderDoorRail L642-663; gate `perms?.tabs?.[key]?.access ?? true` (identical to auth.js); 5 doors 📋🏗️🔧🛒💰 |

**Score:** 21/21 statically-verifiable must-haves verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `styles/main.css` | 10 net-new `--cc-*` tokens in :root | ✓ VERIFIED | `grep -c -- '--cc-'` = 10; `--cc-critical: var(--danger)`, `--cc-high: #f59e0b`; `--warning` unchanged (count 1) |
| `styles/views.css` | All 50 `.cc-*` contract classes + 10 category chips | ✓ VERIFIED | Full-contract scan: 0 missing; `.cc-cat-chip--` = 10 |
| `app/home-feed.js` | Feed engine + 3 seed sources + registry | ✓ VERIFIED | 376 lines; exports SEVERITY/rankItems/dedupeItems/rollUpByCategory/capItems/assembleFeed/getSourcesForUser + 3 sources; `node --check` clean; `onSnapshot` = 0 |
| `app/views/home.js` | Command Center shell + 4 panels | ✓ VERIFIED | 1384 lines; 7 render fns present; skeleton IDs all present; `node --check` clean; `onSnapshot(` = 1 |
| `.planning/REQUIREMENTS.md` | HOME-03 amended to three-tier | ✓ VERIFIED | `critical / high / medium` present on HOME-03 line (count 1) |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| home.js | home-feed.js | `import { assembleFeed, getSourcesForUser }` | ✓ WIRED | L23; called at init() L1212 + ccRefreshFeed L1320 |
| home.js CSS classes | views.css | `.cc-*` class-name contract | ✓ WIRED | Every emitted class (cc-container, cc-briefing, cc-feed-row--*, cc-kpi-chip, cc-yourwork*, cc-activity*, cc-door*) exists in views.css |
| home.js tokens | main.css | `--cc-*` tokens | ✓ WIRED | views.css rules reference `var(--cc-critical)` etc.; tokens defined in main.css :root |
| feed row click | route \| homeQueueOpenApproveModal | deepLink dispatch | ✓ WIRED | ccOpenFeedItem L1290-1294 handles kind route (location.hash) + modal (window[handler](arg)) |
| home-feed source 1 | homeQueueOpenApproveModal | modal deepLink | ✓ WIRED | source emits `{kind:'modal',handler:'homeQueueOpenApproveModal'}`; handler registered init() L1235 |
| Recent Activity | notifications collection | getDocs where user_id==uid orderBy created_at desc limit(8) | ✓ WIRED | L603-608 |
| door rail | getCurrentPermissions().tabs[route].access | auth.js-identical gate | ✓ WIRED | permissions.js exports getCurrentPermissions (L30) + window-registered (L144) |
| engine | proposals.js getAgeInStageDays/isOverdueInStage | age helpers | ✓ WIRED | both exported (proposals.js L123/L134) |
| engine | notifications.js TYPE_META | icon strings | ✓ WIRED | TYPE_META exported L75; PROPOSAL_SUBMITTED.icon L84, MRF_REJECTED.icon L77 (inline-SVG) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| Feed hero | `_ccFeed` | `assembleFeed(user)` → 3 scoped Firestore getDocs sources | Live proposals/mrfs queries (not static) | ✓ FLOWING |
| KPI chips | chip counts | scoped getDocs (projects/services/prs/mrfs/pos) + feed.total | Live counts; unresolved→omitted | ✓ FLOWING |
| Your Work | `_ccYourWork` {a,b,c} | getDocs proposals/projects/services/mrfs by ownership/assignment | Live scoped queries | ✓ FLOWING |
| Recent Activity | `_ccActivityDocs` | getDocs notifications where user_id==uid | Live notifications slice | ✓ FLOWING |
| Door rail | door tiles | `getCurrentPermissions().tabs[*].access` | Live per-role permissions | ✓ FLOWING |

No hollow wiring found: every dynamic surface pulls from a live getDocs query or the assembleFeed result, not hardcoded/empty values.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| home-feed.js parses | `node --check app/home-feed.js` | clean | ✓ PASS |
| home.js parses | `node --check app/views/home.js` | clean | ✓ PASS |
| Listener invariant (home.js) | `grep -c 'onSnapshot(' app/views/home.js` | 1 (proposals listener only) | ✓ PASS |
| Compute-on-load engine | `grep -c 'onSnapshot' app/home-feed.js` | 0 | ✓ PASS |
| Commits present | `git cat-file -t` on 6 cited commits | all exist | ✓ PASS |
| Runtime feed/role behavior | (requires browser + auth session) | — | ? SKIP → Human Verification |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| HOME-01 | 107.1, 107.3 | Personalized greeting + attention count | ✓ SATISFIED | renderBriefing |
| HOME-02 | 107.2, 107.3 | Permission/assignment-scoped feed | ✓ SATISFIED | home-feed source predicates |
| HOME-03 | 107.1, 107.2, 107.3 | Severity-ranked (critical/high/medium) + deep-link | ✓ SATISFIED | rankItems + deep-link dispatch; REQUIREMENTS.md amended |
| HOME-04 | 107.1, 107.2, 107.3 | Calm "You're all caught up" empty state | ✓ SATISFIED | renderFeed empty card |
| HOME-05 | 107.1, 107.4 | Role-scoped KPI chips | ✓ SATISFIED | renderKpiChips (omit-on-unresolved) |
| HOME-06 | 107.1, 107.4 | "Your work" panel (revision/assigned/MRFs) | ✓ SATISFIED | renderYourWork 3 buckets |
| HOME-07 | 107.1, 107.4 | "Recent activity" panel | ✓ SATISFIED | renderRecentActivity read-only slice |
| HOME-08 | 107.1, 107.4 | Five area nav cards/rail reachable | ✓ SATISFIED | renderDoorRail 5 gated tiles |

All 8 phase-owned requirements (HOME-01…HOME-08) are claimed across the plans and implemented. No orphaned requirements. HOME-09…HOME-13 belong to Phase 108 (per-role feeds) — correctly out of scope here.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| app/views/home.js | 850 | `const placeholder = …` | ℹ️ Info | Pre-existing form-input placeholder text inside the homeQueue modal (Phase 87.1) — a real input hint, not a stub. Not introduced by Phase 107. |

No TODO/FIXME/HACK, no `return null` stubs in render paths, no hardcoded-empty rendered data, no console.log-only handlers. Chips that cannot resolve are omitted (not stubbed with 0/—). Finance's Collectibles Due / Payables Owed chips are intentionally OMITTED per the plan's omit-rule (derived arithmetic, no queryable field) — compliant, not a gap.

### Human Verification Required

8 browser-UAT flags carried from the plans (see frontmatter `human_verification`). These are routine for a browser-only SPA with no headless harness: greeting/date/count rendering, severity-tier visual distinction, role-tailored chip sets, Your Work bucket visibility, deep-link navigation, Refresh, read-only Recent Activity, and per-role door gating. The static substrate for each (markup, CSS classes, wiring, scoped queries, register/delete parity) is verified in code above; only the live-session/visual confirmation remains.

### Gaps Summary

None. No must-have is violated in code. All statically-verifiable truths, artifacts, key links, and requirement mappings hold. The delivered feed engine is a self-contained compute-on-load module (zero listeners), home.js consumes it cleanly, the CSS/token contract is fully present, the Phase-106 listener-leak finding is resolved (onSnapshot( 4→1), and dead procurement-stats/engagements code is fully removed with window-fn register/delete parity in destroy().

---

_Verified: 2026-07-10T03:57:26Z_
_Verifier: Claude (gsd-verifier)_
