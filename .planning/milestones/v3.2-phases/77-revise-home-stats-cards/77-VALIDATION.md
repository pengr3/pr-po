---
phase: 77
slug: revise-home-stats-cards
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-23
---

# Phase 77 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual browser testing (project convention — no automated test framework) |
| **Config file** | none |
| **Quick run command** | `python -m http.server 8000` then open http://localhost:8000 in browser |
| **Full suite command** | Manual UAT — navigate to Home, verify each stat card across all 3 role modes |
| **Estimated runtime** | ~5 minutes per full role matrix pass |

---

## Sampling Rate

- **After every task commit:** Load home page in browser as at least one role; verify affected card(s) render with live Firestore data (no console errors)
- **After every plan wave:** Test all 3 role modes (operations_admin, services_admin, super_admin) to confirm card visibility gating
- **Before `/gsd:verify-work`:** Full role matrix tested, all 5 decisions (D-01 through D-05) verified

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 77-01-01 | 01 | 1 | D-01 | manual | n/a | n/a | ⬜ pending |
| 77-01-02 | 01 | 1 | D-02 | manual | n/a | n/a | ⬜ pending |
| 77-01-03 | 01 | 1 | D-03 | manual | n/a | n/a | ⬜ pending |
| 77-01-04 | 01 | 1 | D-04 | manual | n/a | n/a | ⬜ pending |
| 77-01-05 | 01 | 1 | D-05 | manual | n/a | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — no test framework to install. All verification is manual UAT consistent with project conventions.

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Procurement card shows Pending MRFs, Pending PRs, Active POs with live counts | D-01 | No automated test framework in project | Load Home page as super_admin; verify 3 numbers render and update when Firestore data changes |
| Projects card shows Internal Status (4 rows) and Project Status (7 rows) breakdowns | D-02 | No automated test framework in project | Load Home as operations_admin; verify Projects card displays all 11 status rows with non-null counts |
| Services card shows One-time and Recurring sections each with 11 status rows | D-03 | No automated test framework in project | Load Home as services_admin; verify Services card displays two labelled sections with status breakdowns |
| Stat cards visually match nav-card white/shadow style | D-04 | Visual inspection required | Compare new stat cards against the 3 nav cards above — same background/shadow/border-radius |
| Role visibility: operations_admin → Procurement+Projects; services_admin → Procurement+Services; super_admin → all 3 | D-05 | Firebase Auth role-dependent rendering | Test each role mode by logging in with appropriate role; confirm correct cards visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
