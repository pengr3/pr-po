---
phase: 96-proposal-card-redesign
verified: 2026-05-26T00:00:00Z
status: human_needed
score: 17/17 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open a project in 'For Proposal' status with an existing linked proposal in draft/pending_internal/pending_client/for_revision/client_approved/loss status, and visually confirm the 4-node progress track renders correctly for each status (correct filled/ring/grey dots, blue connector lines between passed nodes, orange ring for for_revision)"
    expected: "Each status maps to the correct node state — draft = node 0 blue ring, pending_internal = node 0 filled + node 1 ring, etc.; loss = red badge replaces track entirely"
    why_human: "CSS state-class logic (t-passed/t-active/t-active-warn) with pseudo-element connector lines cannot be verified by grep — visual rendering required"
  - test: "Confirm the VALUE chip shows the correct PHP amount from the proposal document and the STAGE AGE chip shows the correct number of days; when age > 7 days, confirm chip turns amber with 'needs attention' sub-line and the card gets an amber left border"
    expected: "Chips reflect real Firestore data; overdue state triggers chip-warn class and border-left: 3px solid #f59e0b"
    why_human: "Requires a live Firestore document with known amount and current_status_since values to confirm computed ageDays and formatCurrency output"
  - test: "On a proposal card with no attachment_kind and empty comms_log, verify no 'No attachment' or 'No comms yet' text appears in the rendered card"
    expected: "Both info rows are absent — no empty-state noise"
    why_human: "Requires browser rendering of a real document with absent fields; grep confirms no such strings in source but not in runtime output"
  - test: "On a service detail page, open a service in For Proposal status with a linked proposal and confirm the same redesigned card renders identically to the project detail version"
    expected: "service-detail.js produces the same PROPOSAL heading, 4-node track, stat chips, conditional info rows, and footer as project-detail.js"
    why_human: "D-10 parity check requires side-by-side visual comparison across two live views"
---

# Phase 96: Proposal Card Redesign Verification Report

**Phase Goal:** Redesign the inline proposal card in project/service detail to match the polished Project Plan card — replace the current dot+label status with a 4-node progress track (Draft → Internal Review → Client Review → Approved), reorder data section to title-first with stat chips (Value + Stage Age), silence empty-state noise (no "No attachment"/"No comms yet" text), and add a proper "PROPOSAL" card heading.
**Verified:** 2026-05-26
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Progress track nodes render correctly: passed=blue filled dot, active=ring glow, future=grey border | ✓ VERIFIED | `_buildProposalTrack()` in project-detail.js line 1385 and service-detail.js line 1132 maps `i < trackIdx` → `t-passed`, `i === trackIdx` → `t-active` or `t-active-warn`, else unstyled. CSS at lines 2294–2310 defines correct visual state per class. |
| 2 | Connector lines between nodes turn blue for all passed transitions | ✓ VERIFIED | `styles/components.css` line 2279: `.proposal-track-node.t-passed:not(:last-child)::after { background: #1a73e8; }` — the pseudo-element connector line is present and scoped correctly |
| 3 | Loss badge renders as a red-bordered inline block replacing the track | ✓ VERIFIED | `_buildProposalTrack()` returns `<div class="proposal-loss-badge-wrap"><div class="proposal-loss-badge">...</div></div>` when `trackIdx === -1`; CSS at lines 2343–2358 defines `background: #fef2f2; color: #991b1b` |
| 4 | Stat chips render in a two-column flex row with label + value stacked | ✓ VERIFIED | `renderInlineProposalCard()` produces `.proposal-chip-row` wrapping two `.proposal-stat-chip` divs each with `.proposal-chip-label` and `.proposal-chip-val`; CSS at line 2377 sets `display: flex; gap: 8px` |
| 5 | Overdue chip (chip-warn) has amber background #fffbeb, amber border #fde68a, amber text #92400e | ✓ VERIFIED | CSS lines 2389–2411: `.proposal-stat-chip.chip-warn { background: #fffbeb; border-color: #fde68a; }` and `.proposal-stat-chip.chip-warn .proposal-chip-val { color: #92400e; }` — exact values match spec |
| 6 | Card heading section renders PROPOSAL uppercase with a bottom border separator | ✓ VERIFIED | Both JS files output `<div class="proposal-card-heading">PROPOSAL</div>`; CSS at lines 2238–2249 has `text-transform: uppercase; border-bottom: 1px solid #e2e8f0` |
| 7 | Card overdue amber left border class is ready to be applied via inline style (unchanged mechanism) | ✓ VERIFIED | `overdueBorder = 'border-left: 3px solid #f59e0b;'` applied to outer `.proposal-inline-card` wrapper in both files; condition is `ageDays > 7 && status !== 'client_approved' && status !== 'loss'` |
| 8 | Card header shows 'PROPOSAL' uppercase heading with bottom border separator (project-detail.js) | ✓ VERIFIED | project-detail.js line 1441; CSS line 2247 confirms `text-transform: uppercase` |
| 9 | 4-node track correct status state mapping (draft=0, pending_internal=1, etc.) | ✓ VERIFIED | STATUS_META at project-detail.js line 1338 and service-detail.js line 1085 both define all 6 statuses with correct trackIdx values; for_revision has `warn: true` causing `t-active-warn` class |
| 10 | Title leads the data body (0.9375rem bold), proposal_id is secondary in monospace faint | ✓ VERIFIED | project-detail.js line 1444: `proposal-card-title` then `proposal-card-id`; CSS lines 2364–2376 confirm `font-size: 0.9375rem; font-weight: 600` and `font-family: 'SF Mono',...; color: #94a3b8` |
| 11 | VALUE chip shows full PHP amount from formatCurrency(), STAGE AGE chip shows age in days | ✓ VERIFIED | project-detail.js line 1431: `'PHP ' + formatCurrency(proposal.amount)`; line 1426: `Math.round(ageDays) + ' days'` — both wired to real proposal doc fields |
| 12 | Stage age > 7 days: STAGE AGE chip gets chip-warn class AND 'needs attention' sub-line | ✓ VERIFIED | Lines 1427–1428 (project-detail.js): `ageChipClass = isOverdue ? 'proposal-stat-chip chip-warn' : 'proposal-stat-chip'`; `ageSubHtml = isOverdue ? '<div class="proposal-chip-sub">needs attention</div>' : ''` |
| 13 | Attachment row renders only when proposal.attachment_kind is set (no 'No attachment' text) | ✓ VERIFIED | `_renderCardAttachment()` returns `''` when `!proposal.attachment_kind`; grep confirms "No attachment" string is absent in both files |
| 14 | Comms row renders only when proposal.comms_log.length > 0 (no 'No comms yet' text) | ✓ VERIFIED | `_renderCardLatestComms()` returns `''` when `log.length === 0`; grep confirms "No comms yet" string is absent in both files |
| 15 | Submit for Approval button visible only when canDrive AND status in ['draft','for_revision'] | ✓ VERIFIED | project-detail.js line 1434: `const showSubmit = canDrive && ['draft', 'for_revision'].includes(status)` — both conditions enforced |
| 16 | D-08 CTA card (proposal-inline-card--start) is preserved and untouched | ✓ VERIFIED | project-detail.js line 1575 and service-detail.js line 1314 both contain `proposal-inline-card--start` class; service-detail passes `'services'` and `service_code` args to `openCreateProposalModal` (line 1317) |
| 17 | service-detail.js renderInlineProposalCard() produces identical card HTML structure to project-detail.js | ✓ VERIFIED | service-detail.js lines 1084–1215 are byte-for-byte identical to project-detail.js lines 1337–1468 in structure; STATUS_META, TRACK_NODES, _PROPOSAL_CHECK_SVG, _renderCardAttachment, _renderCardLatestComms, _buildProposalTrack all present |

**Score:** 17/17 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `styles/components.css` | All new proposal track + chip CSS classes | ✓ VERIFIED | 20 occurrences of the four key class groups; all specified rules present at lines 2237–2446; `.proposal-inline-card` has no `padding: 1rem` |
| `app/views/project-detail.js` | Rewritten renderInlineProposalCard() with track + Alt B data section | ✓ VERIFIED | STATUS_META at line 1338, renderInlineProposalCard at line 1407, _buildProposalTrack at line 1385, all hoisted constants present |
| `app/views/service-detail.js` | Rewritten renderInlineProposalCard() matching project-detail.js | ✓ VERIFIED | STATUS_META at line 1085, renderInlineProposalCard at line 1154, _buildProposalTrack at line 1132 — full parity with project-detail.js |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `project-detail.js renderInlineProposalCard()` | `styles/components.css` | CSS class names in HTML template string | ✓ WIRED | `proposal-card-heading`, `proposal-card-track`, `proposal-track-node`, `proposal-stat-chip` all referenced in the template output (3+ occurrences each file) |
| `service-detail.js renderInlineProposalCard()` | `styles/components.css` | CSS class names in HTML template string | ✓ WIRED | Same class names present at service-detail.js lines 1188, 1151, 1149, 1194 |
| `loadProposalCard` (project-detail.js) | `renderInlineProposalCard()` | `el.innerHTML = renderInlineProposalCard(proposal, canDrive)` | ✓ WIRED | line 1597 — call site unchanged, syncBottomRow() still called at line 1598 |
| `loadProposalCard` (service-detail.js) | `renderInlineProposalCard()` | `el.innerHTML = renderInlineProposalCard(proposal, canDrive)` | ✓ WIRED | line 1334 — call site unchanged; no syncBottomRow (service-detail never had it — correct) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `renderInlineProposalCard()` (both files) | `proposal.amount` | Firestore `proposals` collection via `getDocs(q)` in `loadProposalCard` | Yes — real Firestore doc properties | ✓ FLOWING |
| `renderInlineProposalCard()` (both files) | `proposal.current_status_since` | Firestore Timestamp field on proposal doc | Yes — real Firestore Timestamp; fallback to `created_at` | ✓ FLOWING |
| `renderInlineProposalCard()` (both files) | `proposal.title`, `proposal.proposal_id` | Same Firestore doc | Yes — user-supplied, escaped via escapeHTML() | ✓ FLOWING |
| `renderInlineProposalCard()` (both files) | `proposal.attachment_kind`, `proposal.comms_log` | Same Firestore doc | Yes — conditional rendering correctly gates on field presence | ✓ FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — this is a zero-build static SPA with no runnable CLI entry points or testable API routes. The card logic renders only inside a live browser with Firestore data. Static file checks confirm correct structure.

### Probe Execution

Step 7c: SKIPPED — no probe scripts exist for this phase; PLAN files declare no probes.

### Requirements Coverage

No requirement IDs were mapped to this phase in REQUIREMENTS.md. Step 6 not applicable.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/views/project-detail.js` | 1576 | `proposal-inline-card__body` class reference inside D-08 CTA card | Info | Old-style class name used inside the CTA card body inner div — harmless since it is only used for inline-styled padding, not a new CSS rule; CSS for this class was removed but the div uses only `style="..."` inline, so no visual breakage |

No TBD, FIXME, or XXX debt markers found in any phase-modified file.

### Human Verification Required

The automated checks all pass. Four visual/behavioral checks require a live browser with real Firestore data:

### 1. Progress Track Visual Rendering Per Status

**Test:** Navigate to a project with proposals in each status (draft, pending_internal, pending_client, for_revision, client_approved, loss). Open the project detail page and observe the inline proposal card.
**Expected:** Draft: node 0 has blue ring (t-active), nodes 1-3 grey. pending_internal: node 0 filled blue with check, node 1 has blue ring. pending_client: nodes 0-1 filled, node 2 ring. for_revision: nodes 0-1 filled, node 2 has orange ring. client_approved: nodes 0-2 filled, node 3 ring. loss: red badge appears instead of track, reading "✕ Loss — Proposal closed".
**Why human:** CSS pseudo-element connector lines (::after) and box-shadow ring effects require visual inspection — code logic is verified but rendered output is not.

### 2. Stat Chips with Real Firestore Data

**Test:** Open a proposal card where the proposal has a known `amount` value and a `current_status_since` timestamp older than 7 days.
**Expected:** VALUE chip shows "PHP {correct amount}", STAGE AGE chip shows "{N} days" in amber background with "needs attention" sub-line. The card itself has an amber left border. A proposal with current_status_since < 7 days should show no amber styling.
**Why human:** Requires a live Firestore document with controlled field values; the computed ageDays and formatCurrency output cannot be asserted by static analysis.

### 3. Empty-State Silence in Live Render

**Test:** Open a proposal card where `attachment_kind` is absent/null and `comms_log` is empty or missing.
**Expected:** Neither "No attachment" nor "No comms yet" text appears anywhere in the card. The info-gap div is empty.
**Why human:** Static analysis confirms no such strings in source, but the conditional rendering must be confirmed on a real document with those absent fields in the browser.

### 4. service-detail.js Parity Check

**Test:** Open a service in "For Proposal" status with a linked proposal. Compare the inline proposal card to one rendered in a project detail page for the same proposal (or a comparable proposal).
**Expected:** Visual appearance is identical — PROPOSAL heading, same track layout, same chip layout, same conditional info rows, same footer buttons. CTA card (Start Proposal) still passes 'services' collection and service_code to the modal.
**Why human:** D-10 parity requires visual side-by-side comparison; service-specific function signatures (loadProposalCard with 'services' arg) are verified by grep but the end-to-end flow needs browser confirmation.

### Gaps Summary

None — all 17 observable truths are verified in the codebase. The phase goal is fully implemented. Human verification items are visual/behavioral checks, not code gaps.

---

_Verified: 2026-05-26_
_Verifier: Claude (gsd-verifier)_
