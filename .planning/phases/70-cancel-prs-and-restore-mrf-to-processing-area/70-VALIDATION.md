---
phase: 70
slug: cancel-prs-and-restore-mrf-to-processing-area
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 70 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual browser testing (no automated test framework — per CLAUDE.md: "No build, test, or lint commands") |
| **Config file** | none |
| **Quick run command** | `python -m http.server 8000` then manual UAT in browser |
| **Full suite command** | Same — manual only |
| **Estimated runtime** | ~5 minutes per UAT cycle |

---

## Sampling Rate

- **After every task commit:** Manual smoke test — generate PRs on a test MRF, click Cancel PRs, verify MRF re-appears in processing list
- **After every plan wave:** Full UAT across all 5 CANPR behaviors
- **Before `/gsd:verify-work`:** Full manual suite must be green
- **Max feedback latency:** ~5 minutes

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 70-01-01 | 01 | 1 | CANPR-01, CANPR-02, CANPR-03, CANPR-04 | manual | n/a | n/a | ⬜ pending |
| 70-01-02 | 01 | 1 | CANPR-01, CANPR-05 | manual | n/a | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — no test infrastructure to create. This is a manual-only project per CLAUDE.md constraints.

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Right-click on PR Generated MRF (no in-progress POs) shows Recall MRF context menu | CANPR-01 | No automated DOM testing framework | 1. Right-click MRF with status Pending — confirm no context menu. 2. Generate PRs — right-click the MRF — confirm Recall MRF option appears. 3. Right-click MRF with other statuses — confirm no menu. |
| Pending and Rejected PRs deleted from Firestore on recall | CANPR-02 | Requires live Firebase verification | 1. Generate PRs on a test MRF. 2. Right-click → Recall MRF → confirm. 3. Open Firebase console → prs collection, verify PR documents are deleted. |
| MRF status restored to In Progress and re-appears in list | CANPR-03 | Requires live Firebase + UI verification | 1. After recalling, verify MRF re-appears in the Procurement processing panel. 2. Check Firestore MRF document: status = 'In Progress', pr_ids = []. |
| Force recall: Finance-Approved PRs with POs at Pending Procurement — POs voided, MRF restored | CANPR-04 | Requires Finance approval state setup | 1. Have Finance approve a PR (PO created at Pending Procurement). 2. Right-click MRF → Recall MRF → confirm force-recall dialog. 3. Verify PO procurement_status = 'Cancelled', all PRs deleted, MRF = In Progress. |
| Safety net: right-click produces NO context menu when any linked PO has procurement progress | CANPR-06 | Requires specific PO state setup | 1. Find or set a linked PO to Procuring/Procured/Delivered. 2. Right-click the PR Generated MRF — confirm absolutely no context menu appears at all. |
| Generate PR button reappears after recall | CANPR-05 | Requires full workflow test | 1. Recall PRs on a PR Generated MRF. 2. Select the restored MRF in processing panel. 3. Confirm Generate PR button is visible (canEdit = true since status = In Progress). |
| Action blocked inside recallMRF when any linked PO has procurement progress (defensive guard) | CANPR-07 | Redundant safety check | 1. Manually call window.recallMRF() in browser console while currentMRF is a blocked MRF. 2. Confirm error toast with PO IDs and statuses. MRF and PRs unchanged. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5 minutes
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
