---
phase: 73
slug: optimize-finance-tab-for-mobile-use
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 73 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual browser testing (no automated test framework in project) |
| **Config file** | none |
| **Quick run command** | `python -m http.server 8000` then inspect in browser DevTools |
| **Full suite command** | Same — manual inspection at 375px, 768px, and 1440px viewports |
| **Estimated runtime** | ~5 minutes per viewport pass |

---

## Sampling Rate

- **After every task commit:** Open browser at localhost:8000, navigate to Finance tab, resize to 375px
- **After every plan wave:** Full 3-viewport pass (375px, 768px, 1440px) across all Finance tabs
- **Before `/gsd:verify-work`:** Full suite must pass with no layout overflow at any viewport
- **Max feedback latency:** ~10 minutes (manual browser UAT)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Behavior | Test Type | Manual Check | Status |
|---------|------|------|----------|-----------|-------------|--------|
| 73-01-01 | 01 | 1 | Card-headers stack on mobile | visual/manual | Resize to 768px; check Pending Approvals, PO, Project List card-headers | ⬜ pending |
| 73-01-02 | 01 | 1 | All Finance tables scroll horizontally | visual/manual | At 375px — no horizontal page overflow on any Finance sub-tab | ⬜ pending |
| 73-01-03 | 01 | 1 | No desktop regression | visual/manual | Finance tab at 1440px looks unchanged | ⬜ pending |
| 73-02-01 | 02 | 1 | Project List tables use `.table-scroll-container` | code read | Grep finance.js for `table-scroll-container` in renderProjectExpensesTable, renderServiceExpensesTable, renderRecurringExpensesTable | ⬜ pending |
| 73-02-02 | 02 | 1 | Sub-tab bar accessible at 320px | visual/manual | Projects/Services/Recurring buttons reachable at 320px width | ⬜ pending |
| 73-02-03 | 02 | 1 | Modals fit 375px viewport | visual/manual | Open PR Details and Record Payment modals at 375px — no overflow | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — no test framework required. Validation is manual browser UAT. Existing infrastructure (HTTP server) covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Card-header stacking on mobile | CSS visual — no automated DOM check | Open Finance tab, open DevTools, set viewport to 375px. Verify each tab's card-header: h2 appears above controls, controls wrap and don't clip |
| Table horizontal scroll at 375px | Visual overflow check | At 375px, check each Finance tab's tables — no horizontal scrollbar on `<body>`, only on `.table-scroll-container` |
| Payables toolbar wrap regression | flex-wrap:wrap already set — verify no regression | Open Payables tab at 375px; verify filter toolbar wraps cleanly |
| Desktop regression check | CSS @media addition can affect non-target viewports | At 1440px, verify Finance tab looks identical to before changes |
| Global .card-header cross-view check | .card-header is a global class | At 375px, check Home, Procurement, Projects tabs — card-headers should stack cleanly, no broken layouts |

---

## Validation Sign-Off

- [ ] All tasks have manual browser verification steps
- [ ] Desktop (1440px) regression check completed
- [ ] 768px viewport pass completed across all 4 Finance tabs
- [ ] 375px viewport pass completed across all 4 Finance tabs
- [ ] Cross-view `.card-header` check completed (Home, Procurement, Projects)
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter when all checks pass

**Approval:** pending
