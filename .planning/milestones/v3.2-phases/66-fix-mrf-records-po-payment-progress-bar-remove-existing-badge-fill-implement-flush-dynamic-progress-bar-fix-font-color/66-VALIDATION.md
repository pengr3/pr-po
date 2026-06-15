---
phase: 66
slug: fix-po-payment-progress-bar
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 66 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual browser testing (zero-build SPA — no automated test framework) |
| **Config file** | None |
| **Quick run command** | `python -m http.server 8000` then navigate to `#/procurement/records` |
| **Full suite command** | Same — manual walkthrough of all 4 success criteria |
| **Estimated runtime** | ~2 minutes |

---

## Sampling Rate

- **After every task commit:** Smoke test: open MRF Records, check PO badge appearance — no fill overlay, thin progress bar visible below each badge
- **After every plan wave:** Full 4-criteria walkthrough against POBAR-01 through POBAR-03
- **Before `/gsd:verify-work`:** All 4 success criteria must pass
- **Max feedback latency:** ~2 minutes (manual)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 66-01-01 | 01 | 1 | POBAR-01, POBAR-03 | manual | n/a | n/a | ⬜ pending |
| 66-01-02 | 01 | 1 | POBAR-02 | manual | n/a | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — no test infrastructure needed; project uses manual testing exclusively.

*Existing manual testing process covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PO badges show clean status-badge coloring with no fill overlay | POBAR-01 | Zero-build SPA | Navigate to `#/procurement/records` MRF Records tab — PO pill badges (e.g., "Pending Procurement") show clean colored text with no semi-transparent color fill obscuring the badge text |
| Thin progress bar renders below each PO badge | POBAR-02 | Zero-build SPA | Each PO badge in the POs column has a thin (3px) progress bar below it; bar width reflects payment percentage (e.g., 50% paid = half filled) |
| POs with no RFPs show empty progress bar | POBAR-03 | Zero-build SPA | Find a PO with no RFPs filed — progress bar below badge is empty (0% fill), not a full red bar |
| Right-click on PO ID still opens RFP context menu | POBAR-01 | Zero-build SPA | Right-click a PO ID badge — RFP context menu appears (functionality unchanged) |

---

## Validation Sign-Off

- [ ] All tasks have manual verify instructions
- [ ] Sampling continuity: smoke test after every commit
- [ ] Wave 0: N/A
- [ ] No watch-mode flags
- [ ] Feedback latency < 2 minutes
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
