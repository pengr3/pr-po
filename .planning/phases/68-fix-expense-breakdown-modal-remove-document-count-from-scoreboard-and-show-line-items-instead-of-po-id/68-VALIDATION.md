---
phase: 68
slug: fix-expense-breakdown-modal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 68 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual browser testing (zero-build SPA — no automated test framework) |
| **Config file** | None |
| **Quick run command** | `python -m http.server 8000` then open expense breakdown modal via any project or service |
| **Full suite command** | Same — manual walkthrough of all 4 success criteria |
| **Estimated runtime** | ~3 minutes |

---

## Sampling Rate

- **After every task commit:** Smoke test: open expense breakdown modal, confirm no document count in Total Cost card, first column in category table is Item Name
- **After every plan wave:** Full 4-criteria walkthrough against EXPMOD-01 and EXPMOD-02
- **Before `/gsd:verify-work`:** All 4 success criteria must pass
- **Max feedback latency:** ~3 minutes (manual)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 68-01-01 | 01 | 1 | EXPMOD-01 | manual | n/a | n/a | ⬜ pending |
| 68-01-02 | 01 | 1 | EXPMOD-02 | manual | n/a | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — no test infrastructure needed; project uses manual testing exclusively.

*Existing manual testing process covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Total Cost scoreboard shows only amount — no document count note | EXPMOD-01 | Zero-build SPA | Open expense/financial breakdown modal for any project or service. Total Cost scoreboard card shows the amount only — no "N documents" or document count note below it |
| Category item tables show Item Name as first column | EXPMOD-02 | Zero-build SPA | In expense breakdown modal, open "By Category" tab — item tables show columns: Item Name, Qty, Unit, Unit Cost, Subtotal. No PO ID column |
| Transport & Hauling category tables also show Item Name first | EXPMOD-02 | Zero-build SPA | Check Transport & Hauling category items table — first column is Item Name, not PO ID |
| Delivery Fees table shows Supplier column | EXPMOD-02 | Zero-build SPA | Delivery Fees section shows Supplier and Amount columns (no PO ID column) |
| CSV export still works with all data intact | EXPMOD-02 | Zero-build SPA | Click Export CSV button in modal — CSV downloads and contains all expected columns including data that was removed from the display tables (PO ID retained in CSV) |

---

## Validation Sign-Off

- [ ] All tasks have manual verify instructions
- [ ] Sampling continuity: smoke test after every commit
- [ ] Wave 0: N/A
- [ ] No watch-mode flags
- [ ] Feedback latency < 3 minutes
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
