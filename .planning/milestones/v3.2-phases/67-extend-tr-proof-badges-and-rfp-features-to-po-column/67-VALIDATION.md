---
phase: 67
slug: extend-tr-proof-badges-and-rfp-features-to-po-column
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 67 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual browser testing (no test framework — zero-build static website) |
| **Config file** | none |
| **Quick run command** | `python -m http.server 8000` + browser DevTools console |
| **Full suite command** | Manual verification in browser |
| **Estimated runtime** | ~60 seconds per check |

---

## Sampling Rate

- **After every task commit:** Verify in browser DevTools console (no errors)
- **After every plan wave:** Full manual verification of TR features
- **Before `/gsd:verify-work`:** All TR proof, badges, and RFP features working
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | TBD | manual | Browser DevTools | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TR proof indicators | Phase 67 | No test framework; UI rendering | Create TR, attach proof URL, verify indicator appears |
| TR payment progress bar | Phase 67 | No test framework; UI rendering | Create RFP for TR, record payment, verify progress bar |
| TR right-click RFP menu | Phase 67 | No test framework; UI interaction | Right-click TR ID in MRF Records, verify context menu |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
