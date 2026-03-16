---
phase: 63
slug: supplier-search
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 63 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual browser testing (zero-build SPA — no automated test framework) |
| **Config file** | None |
| **Quick run command** | `python -m http.server 8000` then navigate to `#/procurement/suppliers` |
| **Full suite command** | Same — manual walkthrough of all 4 success criteria |
| **Estimated runtime** | ~2 minutes |

---

## Sampling Rate

- **After every task commit:** Smoke test: load Suppliers tab, type a search term, verify table filters
- **After every plan wave:** Full 4-criteria walkthrough against SUPSRCH-01 through SUPSRCH-04
- **Before `/gsd:verify-work`:** All 4 success criteria must pass
- **Max feedback latency:** ~2 minutes (manual)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 63-01-01 | 01 | 1 | SUPSRCH-01, SUPSRCH-02 | manual | n/a | n/a | ⬜ pending |
| 63-01-02 | 01 | 1 | SUPSRCH-03 | manual | n/a | n/a | ⬜ pending |
| 63-01-03 | 01 | 1 | SUPSRCH-04 | manual | n/a | n/a | ⬜ pending |
| 63-01-04 | 01 | 1 | SUPSRCH-01–04 | manual | n/a | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — no test infrastructure needed; project uses manual testing exclusively.

*Existing manual testing process covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Type partial name — table filters to matching suppliers | SUPSRCH-01 | Zero-build SPA, no test framework | Load `#/procurement/suppliers`, type "acme" (or any partial name), verify only matching rows shown |
| Type contact person name — matching suppliers appear | SUPSRCH-02 | Zero-build SPA, no test framework | Type a known contact person name, verify matching supplier rows appear |
| Clear search bar — full list restores | SUPSRCH-03 | Zero-build SPA, no test framework | After filtering, clear the input, verify all suppliers return and pagination resets |
| Pagination reflects filtered count | SUPSRCH-04 | Zero-build SPA, no test framework | With active filter, check "Showing X of Y" and page count match filtered set size (not total) |

---

## Validation Sign-Off

- [ ] All tasks have manual verify instructions
- [ ] Sampling continuity: smoke test after every commit
- [ ] Wave 0: N/A
- [ ] No watch-mode flags
- [ ] Feedback latency < 2 minutes
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
