---
phase: 72
slug: add-paid-and-remaining-payable-to-project-service-financial-summary-cards-with-clickable-refresh
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 72 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual browser testing (zero-build static SPA) |
| **Config file** | none |
| **Quick run command** | `python -m http.server 8000` then visual inspection |
| **Full suite command** | Browser DevTools console check + visual card inspection |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Load app in browser, navigate to Projects/Services detail view
- **After every plan wave:** Full visual check of both Projects and Services tabs
- **Before `/gsd:verify-work`:** Confirm Paid/Remaining Payable render correctly and refresh button opens Financial Breakdown modal

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 72-01-01 | 01 | 1 | Phase 72 goal | manual | open browser, inspect financial summary card | ✅ | ⬜ pending |
| 72-01-02 | 01 | 1 | Phase 72 goal | manual | click refresh button, confirm modal opens | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — no test framework setup needed for static SPA.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Paid/Remaining Payable shown in card | Phase 72 goal | Zero-build static SPA — no automated test runner | Navigate to a project/service with RFPs; confirm Paid and Remaining Payable rows appear below Expense |
| Paid/Remaining hidden when no RFPs | EXPPAY-02 pattern | Manual UI check | Navigate to a project/service with no RFPs; confirm rows are absent |
| Refresh button opens Financial Breakdown modal | Phase 72 goal | Manual UI interaction | Click the refresh/Financial Breakdown button; confirm modal opens |
| Covers both Projects and Services tabs | Phase 72 scope | Must test both views | Repeat checks on both Projects detail and Services detail |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
