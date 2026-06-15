---
phase: 69
slug: revise-expense-modal-scoreboards-to-add-remaining-payable-tracking
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 69 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — static SPA, no automated test runner |
| **Config file** | none |
| **Quick run command** | `python -m http.server 8000` (manual browser check) |
| **Full suite command** | Manual UAT in browser DevTools |
| **Estimated runtime** | ~5 minutes manual |

---

## Sampling Rate

- **After every task commit:** Open browser, open expense modal for a test project
- **After every plan wave:** Full UAT walkthrough of all 3 scoreboard cards
- **Before `/gsd:verify-work`:** All manual verifications green
- **Max feedback latency:** ~5 minutes

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 69-01-01 | 01 | 1 | RFP query | manual | open expense modal, check console for errors | ✅ | ⬜ pending |
| 69-01-02 | 01 | 1 | Scoreboard render | manual | verify 3 new cards appear in modal | ✅ | ⬜ pending |
| 69-01-03 | 01 | 1 | Arithmetic | manual | verify Total Requested, Total Paid, Remaining values are correct | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — static SPA with no test framework; validation is manual.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 3 new scoreboard cards appear | Phase 69 | No test runner in static SPA | Open expense modal for a project with RFPs; verify "Total Requested (RFPs)", "Total Paid", "Remaining Payable" cards render |
| Cards hidden when no RFPs | Phase 69 | No test runner | Open modal for project with zero RFPs; verify payable row is hidden |
| Correct arithmetic | Phase 69 | No test runner | Compare displayed values to Firestore data manually |
| project_code used for RFP query (not project_name) | Phase 69 | No test runner | Open modal for a project that has RFPs; verify values are non-zero |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
